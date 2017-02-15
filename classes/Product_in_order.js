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
Model.prototype.modifyPrototype = Model.prototype.modify;
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
Model.prototype.modify = function (obj, cb) {
    if (arguments.length == 1) {
        cb = arguments[0];
        obj = {};
    }
    var _t = this;
    var client_object = _t.client_object || '';

    var coFunction = 'modify_' + client_object;
    if (typeof _t[coFunction] === 'function') {
        _t[coFunction](obj, cb);
    } else {
        if (typeof _t['modify_'] === 'function') {
            _t['modify_'](obj, cb);
        } else {
            _t.modifyPrototype(obj, cb);
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

Model.prototype.modify_ = function (obj, cb) {
    if (arguments.length == 1) {
        cb = arguments[0];
        obj = {};
    }
    var _t = this;
    var id = obj.id;
    if (isNaN(+id)) return cb(new MyError('Не передан id',{obj:obj}));
    var rollback_key = obj.rollback_key || rollback.create();
    // Получим продукт
    // Изменим
    // Обновим статистику по заказу
    var product;
    async.series({
        getProduct: function (cb) {
            _t.getById({id:id}, function (err, res) {
                if (err) return cb(new MyError('Не удалось получить продукт из заказа',{err:err, obj:obj}));
                if (!res.length) return cb(new UserError('В заказе нет такого товара. Обновите заказ.'));
                product = res[0];
                cb(null);
            })
        },
        modify: function (cb) {
            obj.rollback_key = rollback_key;
            obj.fromClient = false;
            _t.modifyPrototype(obj, cb);
        },
        setOrderStatistic: function (cb) {
            var o = {
                command:'setStatistic',
                object:'Order_',
                params:{
                    id:product.order_id,
                    rollback_key:rollback_key
                }
            }
            _t.api(o, cb);
        }
    }, function (err, res) {
        if (err) {
            if (err.message == 'needConfirm') return cb(err);
            rollback.rollback({rollback_key:rollback_key,user:_t.user}, function (err2) {
                return cb(err, err2);
            });
        }else{
            cb(null, res.modify);
        }
    })
};

/////////////////////////////////////////////////////////////////


Model.prototype.add_ = function (obj, cb) {
    if (arguments.length == 1) {
        cb = arguments[0];
        obj = {};
    }
    var _t = this;
    var rollback_key = obj.rollback_key || rollback.create();
    var product_id = obj.product_id;
    if (isNaN(+product_id)) return cb(new MyError('Не передан product_id или передан не корректно.'));

    // Все недостающие поля о подтягиваем из товара

    // Загрузить товар
    // проапдейтить и добавить

    var product;
    async.series({
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
                if (err) return cb(err);
                if (!res.length) return cb(new UserError('Товар не существует'));
                product = res[0];
                cb(null);
            })
        },
        addProductInOrder: function (cb) {

            for (var i in product) {
                if (typeof obj[i] === 'undefined') obj[i] = product[i];
            }
            obj.price = product.price_site;
            _t.addPrototype(obj, function (err, res) {
                cb(err, res);
            });
        },
        setOrderStatistic: function (cb) {
            var o = {
                command:'setStatistic',
                object:'Order_',
                params:{
                    id:obj.order_id,
                    rollback_key:rollback_key
                }
            }
            _t.api(o, cb);
        }
    }, function (err, res) {
        if (err) return cb(err);
        cb(null, res.addProductInOrder);
    })

};


Model.prototype.remove_ = function (obj, cb) {
    if (arguments.length == 1) {
        cb = arguments[0];
        obj = {};
    }
    var _t = this;
    var id = obj.id;
    if (isNaN(+id)) return cb(new MyError('Не передан id',{obj:obj}));
    var rollback_key = obj.rollback_key || rollback.create();
    // Получим продукт
    // Удалим
    // Обновим статистику по заказу
    var product;
    async.series({
        getProduct: function (cb) {
            _t.getById({id:id}, function (err, res) {
                if (err) return cb(new MyError('Не удалось получить продукт из заказа',{err:err, obj:obj}));
                if (!res.length) return cb(new UserError('В заказе нет такого товара. Обновите заказ.'));
                product = res[0];
                cb(null);
            })
        },
        remove: function (cb) {
            obj.rollback_key = rollback_key;
            obj.fromClient = false;
            _t.removePrototype(obj, cb);
        },
        setOrderStatistic: function (cb) {
            var o = {
                command:'setStatistic',
                object:'Order_',
                params:{
                    id:product.order_id,
                    rollback_key:rollback_key
                }
            }
            _t.api(o, cb);
        }
    }, function (err, res) {
        if (err) {
            if (err.message == 'needConfirm') return cb(err);
            rollback.rollback({rollback_key:rollback_key,user:_t.user}, function (err2) {
                return cb(err, err2);
            });
        }else{
            cb(null, res.remove);
        }
    })
};

module.exports = Model;