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
var XlsxTemplate = require('xlsx-template');
var fs = require('fs');

var Model = function(obj){
    this.name = obj.name;
    this.tableName = obj.name.toLowerCase();

    var basicclass = BasicClass.call(this, obj);
    if (basicclass instanceof MyError) return basicclass;
};
util.inherits(Model, BasicClass);
Model.prototype.addPrototype = Model.prototype.add;

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

////////////////////////////////////////////////////

/**
 * Добавляет новый заказ
 * По cart_id или sid
 * @param obj
 * @param cb
 * @private
 */
Model.prototype.add_ = function (obj, cb) {
    if (arguments.length == 1) {
        cb = arguments[0];
        obj = {};
    }
    var _t = this;
    var rollback_key = obj.rollback_key || rollback.create();
    var sid = obj.sid;
    var cart_id = obj.cart_id;
    var phone = obj.phone;
    if (!phone) return cb(new UserError('Необходимо указать номер телефона для создания заказа',{obj:obj}));
    if (!cart_id && !sid) return cb(new MyError('В метод должен быть передан sid или cart_id'));


    var cart, products_in_cart, crm_user, order_id;
    async.series({
        getCart: function (cb) {
            var o = {
                command:'get',
                object:'cart',
                params:{
                    param_where:{},
                    collapseData:false
                }
            };
            if (cart_id) o.params.param_where.id = cart_id;
            else o.params.param_where.sid = sid;
            _t.api(o, function (err, res) {
                if (err) return cb(new MyError('Не удалось получить корзину',{err:err}));
                if (!res.length) return cb(new UserError('Корзина не найдена'));
                if (res.length > 1) return cb(new MyError('Найдено слишком много корзин',{res:res}));
                cart = res[0];
                cart_id = cart.id;
                cb(null);
            });
        },
        getCartProduct: function (cb) {
            var o = {
                command:'get',
                object:'product_in_cart',
                params:{
                    param_where:{
                        cart_id:cart_id
                    },
                    collapseData:false
                }
            };
            _t.api(o, function (err, res) {
                if (err) return cb(new MyError('Не удалось получить товаы из корзины',{err:err}));
                if (!res.length) return cb(new UserError('Корзина пуста'));
                products_in_cart = res;
                cb(null);
            });
        },
        getCRMUser: function (cb) {
            var o = {
                command:'get',
                object:'crm_user',
                params:{
                    param_where:{
                        phone:phone
                    },
                    collapseData:false
                }
            };
            _t.api(o, function (err, res) {
                if (err) return cb(new MyError('Не удалось получить покупателя',{err:err}));
                crm_user = res[0];
                cb(null);
            });
        },
        createOrder: function (cb) {
            if (!obj.address && crm_user){
                obj.address = crm_user.address;
                obj.gate = crm_user.gate;
                obj.getecode = crm_user.getecode;
                obj.level = crm_user.level;
                obj.flat = crm_user.flat;
            }
            if(crm_user) obj.name = obj.name || crm_user.name || '';
            obj.cart_id = obj.cart_id || cart_id;
            obj.amount = cart.amount;
            obj.rollback_key = rollback_key;
            _t.addPrototype(obj, function (err, res) {
                if (err) return cb(err);
                order_id = res.id;
                cb(null, res);
            })
        },
        clearCart: function (cb) {
            var o = {
                command:'remove',
                object:'cart',
                params:{
                    id:cart_id
                }
            };
            o.params.rollback_key = rollback_key;
            _t.api(o, function (err, res) {
                if (err) return cb(new MyError('Не удалось очистить корзину',{err:err}));
                cb(null);
            });
        },
        createCRMUser: function (cb) {
            if (crm_user){
                // TODO Дописать обновление покупателя
                return cb(null);
            }
            var o = {
                command:'add',
                object:'crm_user',
                params:{
                    name:obj.name || '',
                    address:obj.address || '',
                    gate:obj.gate || '',
                    getecode:obj.getecode || '',
                    level:obj.level || '',
                    flat:obj.flat || ''
                }
            };
            o.params.rollback_key = rollback_key;
            _t.api(o, cb);
        },
        addProductsInOrder: function (cb) {
            async.eachSeries(products_in_cart, function (one_product, cb) {
                var o = {
                    command:'add',
                    object:'product_in_order',
                    params:one_product
                };
                o.params.order_id = order_id;
                o.params.rollback_key = rollback_key;
                _t.api(o, function (err, res) {
                    cb(err, res);
                });
            }, cb);
        }
    }, function (err, res) {
        if (err) {
            if (err.message == 'needConfirm') return cb(err);
            rollback.rollback({rollback_key:rollback_key,user:_t.user}, function (err2) {
                return cb(err, err2);
            });
        }else{
            //cb(null, new UserOk('Заказ успешно создан.',{order_id:order_id}));
            cb(null, res.createOrder);
        }
    });
};


Model.prototype.confirmOrder = function (obj, cb) {
    if (arguments.length == 1) {
        cb = arguments[0];
        obj = {};
    }
    var _t = this;
    var id = obj.id;
    if (!id) return cb(new MyError('В метод не передан id'));
    var rollback_key = obj.rollback_key || rollback.create();

    // Загрузим заказ
    // Проверим заказ
    // Изменим статус

    var order, filename, path;
    async.series({
        get: function (cb) {
            _t.getById({id:id}, function (err, res) {
                if (err) return cb(new MyError('Ошибка при попытке получить заказ.',{err:err}));
                if (!res.length) return cb(new UserError('Заказ не найден'));
                order = res[0];
                cb(null);
            })
        },
        check: function (cb) {
            if (order.order_status_sysname!=='CREATED') return cb(new UserError('Заказ должен быть в статусе "Новый заказ"',{order:order}));
            cb(null);
        },
        changeStatus: function (cb) {
            var params = {
                id:id,
                order_status_sysname:'CONFIRM'
            };
            _t.modify(params, cb);
        },
        createName: function (cb) {
            _t.valet_delivery_note({id:id}, function (err, res) {
                if (err) return cb(err);
                filename = res.filename;
                path = res.path;
                cb(null);
            });
        }
    }, function (err) {
        if (err) {
            if (err.message == 'needConfirm') return cb(err);
            rollback.rollback({rollback_key:rollback_key,user:_t.user}, function (err2) {
                return cb(err, err2);
            });
        }else{
            //cb(null, new UserOk('Заказ успешно создан.',{order_id:order_id}));
            //{filename:filename,path:'/savedFiles/'}
            cb(null, new UserOk('Ок',{filename:filename,path:path}));
        }
    });

};

Model.prototype.onDelivery = function (obj, cb) {
    if (arguments.length == 1) {
        cb = arguments[0];
        obj = {};
    }
    var _t = this;
    var id = obj.id;
    if (!id) return cb(new MyError('В метод не передан id'));
    var rollback_key = obj.rollback_key || rollback.create();

    // Загрузим заказ
    // Проверим заказ
    // Изменим статус ON_DELIVERY

    var order;
    async.series({
        get: function (cb) {
            _t.getById({id:id}, function (err, res) {
                if (err) return cb(new MyError('Ошибка при попытке получить заказ.',{err:err}));
                if (!res.length) return cb(new UserError('Заказ не найден'));
                order = res[0];
                cb(null);
            })
        },
        check: function (cb) {
            if (order.order_status_sysname!=='CONFIRM') return cb(new UserError('Заказ должен быть в статусе "Подтвержден"',{order:order}));
            cb(null);
        },
        changeStatus: function (cb) {
            var params = {
                id:id,
                order_status_sysname:'ON_DELIVERY'
            };
            _t.modify(params, cb);
        }
    }, function (err) {
        if (err) {
            if (err.message == 'needConfirm') return cb(err);
            rollback.rollback({rollback_key:rollback_key,user:_t.user}, function (err2) {
                return cb(err, err2);
            });
        }else{
            //cb(null, new UserOk('Заказ успешно создан.',{order_id:order_id}));
            cb(null, new UserOk('Ок'));
        }
    });

};

Model.prototype.closeOrder = function (obj, cb) {
    if (arguments.length == 1) {
        cb = arguments[0];
        obj = {};
    }
    var _t = this;
    var id = obj.id;
    if (!id) return cb(new MyError('В метод не передан id'));
    var rollback_key = obj.rollback_key || rollback.create();

    // Загрузим заказ
    // Проверим заказ
    // Изменим статус CLOSED

    var order;
    async.series({
        get: function (cb) {
            _t.getById({id:id}, function (err, res) {
                if (err) return cb(new MyError('Ошибка при попытке получить заказ.',{err:err}));
                if (!res.length) return cb(new UserError('Заказ не найден'));
                order = res[0];
                cb(null);
            })
        },
        check: function (cb) {
            if (order.order_status_sysname!=='ON_DELIVERY') return cb(new UserError('Заказ должен быть в статусе "В доставке"',{order:order}));
            cb(null);
        },
        changeStatus: function (cb) {
            var params = {
                id:id,
                order_status_sysname:'CLOSED'
            };
            _t.modify(params, cb);
        }
    }, function (err) {
        if (err) {
            if (err.message == 'needConfirm') return cb(err);
            rollback.rollback({rollback_key:rollback_key,user:_t.user}, function (err2) {
                return cb(err, err2);
            });
        }else{
            //cb(null, new UserOk('Заказ успешно создан.',{order_id:order_id}));
            cb(null, new UserOk('Ок'));
        }
    });

};

Model.prototype.cancelOrder = function (obj, cb) {
    if (arguments.length == 1) {
        cb = arguments[0];
        obj = {};
    }
    var _t = this;
    var id = obj.id;
    if (!id) return cb(new MyError('В метод не передан id'));
    var rollback_key = obj.rollback_key || rollback.create();

    // Загрузим заказ
    // Проверим заказ
    // Изменим статус

    var order;
    async.series({
        get: function (cb) {
            _t.getById({id:id}, function (err, res) {
                if (err) return cb(new MyError('Ошибка при попытке получить заказ.',{err:err}));
                if (!res.length) return cb(new UserError('Заказ не найден'));
                order = res[0];
                cb(null);
            })
        },
        check: function (cb) {
            if (order.order_status_sysname==='CLOSED') return cb(new UserError('Нельзя отменить завершенный заказ',{order:order}));
            cb(null);
        },
        changeStatus: function (cb) {
            var params = {
                id:id,
                order_status_sysname:'CANCELED'
            };
            _t.modify(params, cb);
        }
    }, function (err) {
        if (err) {
            if (err.message == 'needConfirm') return cb(err);
            rollback.rollback({rollback_key:rollback_key,user:_t.user}, function (err2) {
                return cb(err, err2);
            });
        }else{
            //cb(null, new UserOk('Заказ успешно создан.',{order_id:order_id}));
            cb(null, new UserOk('Ок'));
        }
    });

};

Model.prototype.valet_delivery_note = function (obj, cb) {
    if (arguments.length == 1) {
        cb = arguments[0];
        obj = {};
    }
    var _t = this;
    var name = obj.name || 'valet_delivery_note.xlsx';
    var id = obj.id;
    if (isNaN(+id)) return cb(new MyError('В метод не передан id'));

    var order, products;
    var template, binaryData, readyData;
    var filename;
    async.series({
        getData: function (cb) {

            async.series({
                getOrder: function (cb) {

                    _t.getById({id:id}, function (err, res) {
                        if (err) return cb(new MyError('Не удалось получить данные по зааказу'),{err:err});
                        order = res[0];
                        cb(null);
                    });
                },
                getOrderProducts: function (cb) {

                    var o = {
                        command: 'get',
                        object: 'product_in_order',
                        params: {
                            param_where:{
                                order_id:id
                            },
                            collapseData: false
                        }
                    };
                    _t.api(o, function (err, res) {
                        if (err) return cb(err);
                        for (var i in res) {
                            products = res;
                        }
                        cb(null);
                    });
                }
            }, cb);
        },
        prepareData0: function (cb) {

            readyData = {
                name: order.name || '',
                phone: order.phone || '',
                email: order.email || '',
                address: order.address || '',
                gate: order.gate || '',
                level: order.level || '',
                flat: order.flat || '',
                order_datetime: order.created || '',
                order: []
            };
            cb(null);
        },
        prepareData: function (cb) {
            var counter = 1;
            readyData.total_count = 0;
            readyData.total_amount = 0;

            for (var i in products) {

                readyData.order.push({
                    no:counter++,
                    product_id:products[i].id,
                    product_name:products[i].name,
                    quantity:products[i].product_count,
                    price:products[i].price,
                    amount:products[i].price * products[i].product_count
                });

                readyData.total_count += products[i].product_count;
                readyData.total_amount += (products[i].price * products[i].product_count);
            }
            readyData.total_amount += ' руб.';
            cb(null);
        },
        getTemplate: function (cb) {
            fs.readFile('./templates/' + name, function (err, data) {
                if (err) return cb(new MyError('Не удалось считать файл шаблона test.xlsx.', err));
                template = new XlsxTemplate(data);
                cb(null);
            });
        },
        perform: function (cb) {
            var sheetNumber = 1;
            template.substitute(sheetNumber, readyData);
            var dataBuf = template.generate();
            binaryData = new Buffer(dataBuf, 'binary');
            cb(null)
        },
        writeFile: function (cb) {
            filename = 'Накладная ' + order.id + '.xlsx';
            fs.writeFile('./public/savedFiles/' + filename,binaryData, function (err) {
                if (err) return cb(new MyError('Не удалось записать файл testOutput.xlsx',{err:err}));
                return cb(null, new UserOk('testOutput.xlsx успешно сформирован'));
            });
        }
    }, function (err) {
        if (err) return cb(err);
        cb(null, new UserOk('Ок.',{filename:filename,path:'/savedFiles/'}));
    });


};


module.exports = Model;