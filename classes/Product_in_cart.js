/**
 * Created by iig on 29.10.2015.
 */
var MyError = require('../error').MyError;
var UserError = require('../error').UserError;
var UserOk = require('../error').UserOk;
var BasicClass = require('./system/BasicClass');
var util = require('util');
var async = require('async');
var rollback = require('../modules/rollback');

var Model = function(obj){
    this.name = obj.name;
    this.tableName = obj.name.toLowerCase();

    var basicclass = BasicClass.call(this, obj);
    if (basicclass instanceof MyError) return basicclass;
};
util.inherits(Model, BasicClass);
Model.prototype.addPrototype = Model.prototype.add;
Model.prototype.removePrototype = Model.prototype.remove;

Model.prototype.init = function (obj, cb) {
    if (arguments.length == 1) {
        cb = arguments[0];
        obj = {};
    }
    if (typeof cb !== 'function') throw new MyError('В метод не передан cb');
    if (typeof obj !== 'object') return cb(new MyError('В метод не переданы obj'));
    var _t = this;
    Model.super_.prototype.init.apply(this, [obj , function (err) {
        cb(null);
    }]);
};

Model.prototype.add = function (obj, cb) {
    if (arguments.length == 1) {
        cb = arguments[0];
        obj = {};
    }
    var _t = this;
    var client_object = _t.client_object || '';

    var coFunction = 'add_' + client_object;
    if (typeof _t[coFunction] === 'function') {
        _t[coFunction](obj, cb);
    } else {
        if (typeof _t['add_'] === 'function') {
            _t['add_'](obj, cb);
        } else {
            _t.addPrototype(obj, cb);
        }
    }
};
Model.prototype.remove = function (obj, cb) {
    if (arguments.length == 1) {
        cb = arguments[0];
        obj = {};
    }
    var _t = this;
    var client_object = _t.client_object || '';

    var coFunction = 'remove_' + client_object;
    if (typeof _t[coFunction] === 'function') {
        _t[coFunction](obj, cb);
    } else {
        if (typeof _t['remove_'] === 'function') {
            _t['remove_'](obj, cb);
        } else {
            _t.removePrototype(obj, cb);
        }
    }
};
////////////////////////////////////////////////////


Model.prototype.add_ = function (obj, cb) {
    if (arguments.length == 1) {
        cb = arguments[0];
        obj = {};
    }
    var _t = this;
    var product_id = obj.product_id;
    var sid = obj.sid;
    if (!product_id) return cb(new MyError('Не передан product_id'));
    if (!sid) return cb(new MyError('sid необходим для добавления в карзину'));
    var rollback_key = obj.rollback_key || rollback.create();

    var product_count = obj.product_count || 1;
    // Получим корзину по sid
    // Создадим корзину если ее еще нет
    // Получим продукт
    // получим продукты из корзины
    // Создадим продукт в корзине
    // Посчитаем и запишем в корзину суммарные значения Цена/кол-во
    var getCart = function (params, cb) {
        var param_where = (params.id)? {id:params.id} : {sid:sid};
        var o = {
            command:'get',
            object:'cart',
            params:{
                param_where:param_where,
                collapseData:false
            }
        };
        _t.api(o, function (err, res) {
            if (err) return cb(new MyError('При попытке получить корзину возникла ошибка.',{err:err}));
            if (res.length > 1) return cb(new MyError('Найдено слишком много корзин с таким sid.',{res:res}));
            cart = res[0];
            return cb(null);
        });
    };


    var cart, product, cart_products, product_in_cart;
    async.series({
        getOrCreateCart: function (cb) {

            async.series([
                function (cb) {
                    getCart({}, cb);
                },
                function (cb) {
                    if (cart) return cb(null); // уже есть корзина
                    var o = {
                        command:'add',
                        object:'cart',
                        params:{
                            sid:sid,
                            rollback_key:rollback_key
                        }
                    };
                    _t.api(o, function (err, res) {
                        if (err) return cb(new MyError('Не удалось создать корзину',{err:err}));
                        getCart({id:res.id}, cb);
                    });
                }
            ],cb);
        },
        getProduct: function (cb) {
            var o = {
                command:'get',
                object:'product',
                params:{
                    param_where:{
                        id:product_id
                    },
                    collapseData:false
                }
            };
            _t.api(o, function (err, res) {
                if (err) return cb(new MyError('Не удалось получить информацию по продукту',{err:err}));
                if (!res.length) return cb(new UserError('Продукт не найден'));
                product = res[0];
                cb(null);
            });
        },
        getCartProducts: function (cb) {
            var params = {
                param_where:{
                    cart_id:cart.id
                },
                collapseData:false
            };
            _t.get(params, function (err, res) {
                if (err) return cb(new MyError('Не удалось получить информацию по прдуктам в корзине',{err:err}));
                cart_products = res;
                cb(null);
            })
        },
        createOrModifyCartProduct: function (cb) {
            // Поищем в корзине
            for (var i in cart_products) {
                if (cart_products[i].product_id == product_id){
                    product_in_cart = cart_products[i];
                    break;
                }
            }
            var params;
            if (product_in_cart){ // Изменим текущий
                product_count = product_in_cart.product_count + product_count;
                params = {
                    id:product_in_cart.id,
                    product_count:product_count,
                    rollback_key:rollback_key
                };
                _t.modify(params, function (err, res) {
                    if (err) return cb(new MyError('Не удалось добавить продукт',{err:err}));

                    cb(null);
                });
            }else{
                params = {
                    sid:sid,
                    cart_id:cart.id,
                    product_id:product_id,
                    product_count:product_count,
                    rollback_key:rollback_key
                };
                for (var i in product) {
                    if (i=='id') continue;
                    params[i] = product[i];
                }
                _t.addPrototype(params, function (err, res) {
                    if (err) return cb(new MyError('Не удалось добавить продукт',{err:err}));
                    cb(null);
                });
            }


        },
        addCartStatistic: function (cb) {
            var amount = 0;
            var product_count_all = 0;
            for (var i in cart_products) {
                amount += +(cart_products[i].price * cart_products[i].product_count);
                product_count_all += +cart_products[i].product_count;
            }
            amount += +product.price;
            product_count_all = (product_in_cart)? product_count : product_count_all + product_count;
            var o = {
                command:'modify',
                object:'cart',
                params:{
                    id:cart.id,
                    amount:amount,
                    product_count:product_count_all,
                    rollback_key:rollback_key
                }
            };
            _t.api(o, function (err, res) {
                if (err) return cb(new MyError('Не удалось записать статистику в корзину корзину',{err:err}));
                cb(null);
            });
        }
    }, function (err) {
        if (err) {
            if (err.message == 'needConfirm') return cb(err);
            rollback.rollback(rollback_key, function (err2) {
                return cb(err, err2);
            });
        }else{
            cb(null, new UserOk('Продукт добавлен в корзину.',{product_id:product_id, product_count:product_count}));
        }
    })
};

Model.prototype.decrise_product_in_cart = function (obj, cb) {
    if (arguments.length == 1) {
        cb = arguments[0];
        obj = {};
    }
    var _t = this;
    var product_id = obj.product_id;
    var sid = obj.sid;
    if (!product_id) return cb(new MyError('Не передан product_id'));
    if (!sid) return cb(new MyError('sid необходим для добавления в карзину'));
    var rollback_key = obj.rollback_key || rollback.create();

    var product_count = +obj.product_count || 1;
    // Получим корзину по sid и product_id нужную позицию в корзине
    // Уменьшаем кол-во
    // Если остается 0 или меньше, - удаляем



    var cart, product, cart_products, product_count_all;
    async.series({
        getProductFromCart: function (cb) {

            var params = {
                param_where:{
                    product_id:product_id,
                    sid:sid
                },
                collapseData:false
            };
            _t.get(params, function (err, res) {
                if (err) return cb(new MyError('Не удалось получить информацию по продукту',{err:err}));
                if (!res.length) return cb(new UserError('Продукт не найден'));
                product = res[0];
                cb(null);
            });
        },
        getCart: function (cb) {
            var o = {
                command:'get',
                object:'cart',
                params:{
                    param_where:{
                        sid:sid
                    },
                    collapseData:false
                }
            };
            _t.api(o, function (err, res) {
                if (err) return cb(new MyError('При попытке получить корзину возникла ошибка.',{err:err}));
                if (res.length > 1) return cb(new MyError('Найдено слишком много корзин с таким sid.',{res:res}));
                cart = res[0];
                return cb(null);
            });
        },
        modifyOrRemoveProduct: function (cb) {
            product.product_count -= product_count;
            var params;
            if (product.product_count<=0){ // удалим элемент
                params = {
                    id:product.id,
                    rollback_key:rollback_key
                };
                _t.remove(params, cb);
            }else{ // изменим количество
                params = {
                    id:product.id,
                    product_count:product.product_count,
                    rollback_key:rollback_key
                };
                _t.modify(params, cb);
            }
        },
        getCartProducts: function (cb) {
            var params = {
                param_where:{
                    sid:sid
                },
                collapseData:false
            };
            _t.get(params, function (err, res) {
                if (err) return cb(new MyError('Не удалось получить информацию по прдуктам в корзине',{err:err}));
                cart_products = res;
                cb(null);
            });
        },
        addCartStatistic: function (cb) {
            var amount = 0;
            product_count_all = 0;
            for (var i in cart_products) {
                amount += +(cart_products[i].price * cart_products[i].product_count);
                product_count_all += +cart_products[i].product_count;
            }
            var o = {
                command:'modify',
                object:'cart',
                params:{
                    id:cart.id,
                    amount:amount,
                    product_count:product_count_all,
                    rollback_key:rollback_key
                }
            };
            _t.api(o, function (err, res) {
                if (err) return cb(new MyError('Не удалось записать статистику в корзину корзину',{err:err}));
                cb(null);
            });
        }
    }, function (err) {
        if (err) {
            if (err.message == 'needConfirm') return cb(err);
            rollback.rollback(rollback_key, function (err2) {
                return cb(err, err2);
            });
        }else{
            cb(null, new UserOk('Продукт добавлен в корзину.',{product_id:product_id, product_count:product_count_all}));
        }
    })
};

module.exports = Model;