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
var funcs = require('../libs/functions');
var fs = require('fs');
var sendMail = require('../libs/sendMail');
var config = require('../config');
var mustache = require('mustache');
var moment = require('moment');

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
    var email = obj.email + ',info@valet24.ru';
    if (!funcs.validation.email(email)) return cb(new UserError('Не корректно указан Email: ' + email));


    var cart, products_in_cart, crm_user, order_id;
    var shop;
    var tpl;
    var products;
    var order;
    async.series({
        getShop: function (cb) {
            var o = {
                command:'get',
                object:'shop',
                params:{
                    param_where:{
                        is_current:true
                    },
                    collapseData:false
                }
            };
            _t.api(o, function (err, res) {
                if (err) return cb(new MyError('При попытке получить текущий магазин произошла ош.',{o:o, err:err}));
                if (!res.length) return cb(new UserError('Не удалось получить текущий магазин. Выставите ткущий магазин.'));
                shop = res[0];
                cb(null);
            })
        },
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
                        email:email
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
        createCRMUserAndGet: function (cb) {
            console.log('createCRMUserAndGet');
            if (crm_user)return cb(null);
            // registration
            var o = {
                command: 'registration',
                object: 'crm_user',
                params: obj
            };
            o.params.rollback_key = rollback_key;
            o.params.fromCreateOrder = true;
            _t.api(o, function (err, res) {
                if (err) return cb(new MyError('Не удалось зарегистрировать покупателя', {o: o, err: err}));
                crm_user = res.crm_user;
                cb(null);
            });
        },
        updateUserFields: function (cb) {
            var updateble_fields = ['phone','name','address','gate','gatecode','level','flat'];
            var toModify;
            for (var i in  updateble_fields) {
                var field = updateble_fields[i]
                if (typeof obj[field] != 'undefined' && crm_user[field] != obj[field] && crm_user[field]==''){
                    if (!toModify) toModify = {};
                    toModify[field] = obj[field];
                }
            }
            if (!toModify) return cb(null);
            var o = {
                command: 'modify',
                object: 'crm_user',
                params: {
                    id: crm_user.id,
                    rollback_key: rollback_key
                }
            };
            for (var i in toModify) {
                o.params[i] = toModify[i];
            }
            _t.api(o, function (err, res) {
                if (err) {
                    console.log('Не удалось обновить поля покупателя', o, err);
                }
                cb(null);
            });
        },
        createOrder: function (cb) {
            var crm_user_tmp = crm_user || {};
            //if (!obj.address && crm_user){
            //    obj.address = crm_user.address;
            //    obj.gate = crm_user.gate;
            //    obj.gatecode = crm_user.gatecode;
            //    obj.level = crm_user.level;
            //    obj.flat = crm_user.flat;
            //}
            //if(crm_user) obj.name = obj.name || crm_user.name || '';

            function getDeliveryPrice(){
                return (+moment(new Date()).format('HH') > 0 && +moment(new Date()).format('HH') < 10) ? 250 : 150;
            }

            obj.crm_user_id = crm_user_tmp.id;
            obj.name = obj.name || crm_user_tmp.name || '';
            obj.address = obj.address || crm_user_tmp.address || '';
            obj.gate = obj.gate || crm_user_tmp.gate || '';
            obj.gatecode = obj.gatecode || crm_user_tmp.gatecode || '';
            obj.level = obj.level || crm_user_tmp.level || '';
            obj.flat = obj.flat || crm_user_tmp.flat || '';
            obj.comment = obj.comment || '';
            obj.order_payment_type_sysname = obj.order_payment_type_sysname || 'CASH';


            obj.delivery_price = getDeliveryPrice();
            obj.total_to_pay = (parseFloat(cart.amount) + parseFloat(obj.delivery_price)).toFixed(2);

            obj.cart_id = obj.cart_id || cart_id;
            obj.amount = cart.amount;
            obj.shop_id = shop.id;
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
                    id:cart_id,
                    sold:true
                }
            };
            o.params.rollback_key = rollback_key;
            _t.api(o, function (err, res) {
                if (err) return cb(new MyError('Не удалось очистить корзину',{err:err}));
                cb(null);
            });
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
        },
        getOrder: function (cb) {

            _t.getById({id:order_id}, function (err, res) {
                if (err) return cb(new MyError('Не удалось получить продукты из заказа'));
                order = res[0];
                cb(null);
            });
        },
        getProductsInOrder: function (cb) {
            var o = {
                command:'get',
                object:'product_in_order',
                params:{
                    param_where:{
                        order_id:order_id
                    },
                    collapseData:false
                }
            };
            _t.api(o, function (err, res) {
                if (err) return cb(new MyError('Не удалось получить продукты из заказа'));
                products = res;
                cb(null);
            });
        },
        sendOrderEmail: function (cb) {
            var tpl_name = 'order.html';

            async.series({
                prepareTemplate: function (cb) {
                    fs.readFile('./templates/' + tpl_name, function (err, data) {
                        if (err) return cb(new MyError('Не удалось считать файл шаблона.', err));
                        tpl = data.toString();
                        cb(null);
                    });
                },
                sendNotify: function (cb) {
                    // [{
                    //     "id": 397,
                    //     "order_id": 144,
                    //     "name": "Альметте сыр творожный с огурцами и зеленью 150гр",
                    //     "product_id": 45750,
                    //     "qnt_type_id": 1,
                    //     "qnt_type_sys": "UNIT",
                    //     "qnt_type": "шт.",
                    //     "image": "IMG_1550_siri",
                    //     "images_list": "",
                    //     "description": "",
                    //     "price": "118.65",
                    //     "product_count": "1.00",
                    //     "category_id": 3644,
                    //     "category": "Плавленые и творожные",
                    //     "parent_category_id": 3550,
                    //     "parent_category": "Сыры",
                    //     "shop_id": 1,
                    //     "shop": "Профсоюзная",
                    //     "crm_user_id": 107,
                    //     "created": "29.11.2016 00:00:00",
                    //     "updated": "",
                    //     "deleted": "",
                    //     "published": "29.11.2016 00:00:00",
                    //     "created_by_user_id": 18,
                    //     "created_by_user": "valet24.ru",
                    //     "deleted_by_user_id": "",
                    //     "deleted_by_user": "",
                    //     "remove_comment": "",
                    //     "self_company_id": 1,
                    //     "self_company": "VALET24",
                    //     "ext_company_id": 1,
                    //     "ext_company": "VALET24"
                    // }]



                    var tbl = '<div style="font-size: 18px;margin-bottom: 15px;text-align: left;margin-top: 30px;">Товары в заказе:</div><table style="text-align: left;border-top:2px solid #ccc;border-spacing: 0;">' +
                        '<thead></thead>' +
                        '<tr>' +
                        '<th style="font-size: 12px; text-align: center; border-left: 1px solid #b1b1b1; border-right: 1px solid #b1b1b1;border-bottom: 2px solid #ccc;">Артикул</th>' +
                        '<th style="font-size: 12px; text-align: center; border-left: 1px solid #b1b1b1; border-right: 1px solid #b1b1b1;border-bottom: 2px solid #ccc;">Наименование</th>' +
                        '<th style="font-size: 12px; text-align: center; border-left: 1px solid #b1b1b1; border-right: 1px solid #b1b1b1;border-bottom: 2px solid #ccc;">Цена</th>' +
                        '<th style="font-size: 12px; text-align: center; border-left: 1px solid #b1b1b1; border-right: 1px solid #b1b1b1;border-bottom: 2px solid #ccc;">Кол-во</th>' +
                        '<th style="font-size: 12px; text-align: center; border-left: 1px solid #b1b1b1; border-right: 1px solid #b1b1b1;border-bottom: 2px solid #ccc;">Сумма</th>' +
                        '</tr>' +
                        '<tbody>';
                    var total_amount = 0;
                    for (var i in products) {
                        var amount = Math.round((+products[i].product_count * +products[i].price)*100)/100;
                        total_amount += amount;
                        tbl += '<tr>';
                        tbl += '<td style="border-bottom: 1px solid #b1b1b1;padding-left: 10px;padding-right: 10px;padding-bottom: 3px;padding-top: 3px;border-right: 1px solid #e8e8e8;border-left: 1px solid #e8e8e8;">' + products[i].product_id + '</td>';
                        tbl += '<td style="border-bottom: 1px solid #b1b1b1;padding-left: 10px;padding-right: 10px;padding-bottom: 3px;padding-top: 3px;border-right: 1px solid #e8e8e8;border-left: 1px solid #e8e8e8;">' + products[i].name + '</td>';
                        tbl += '<td style="border-bottom: 1px solid #b1b1b1;padding-left: 10px;padding-right: 10px;padding-bottom: 3px;padding-top: 3px;border-right: 1px solid #e8e8e8;border-left: 1px solid #e8e8e8;">' + products[i].price + '</td>';
                        tbl += '<td style="border-bottom: 1px solid #b1b1b1;padding-left: 10px;padding-right: 10px;padding-bottom: 3px;padding-top: 3px;border-right: 1px solid #e8e8e8;border-left: 1px solid #e8e8e8;">' + products[i].product_count + '</td>';
                        tbl += '<td style="border-bottom: 1px solid #b1b1b1;padding-left: 10px;padding-right: 10px;padding-bottom: 3px;padding-top: 3px;border-right: 1px solid #e8e8e8;border-left: 1px solid #e8e8e8;">' + amount + '</td>';
                        tbl += '</tr>';
                    }
                    tbl += '</tbody></table>';
                    var m_obj = {
                        name: (crm_user.name)? 'Здравствуйте ' + crm_user.name + '!' : 'Здравствуйте!',
                        order_id:order_id,
                        product_table:tbl,
                        order_amount: order.amount,
                        delivery_amount: order.delivery_price,
                        total_to_pay: order.total_to_pay
                    };

                    tpl = mustache.to_html(tpl, m_obj);
                    sendMail({email: email, subject: 'Заказ с сайта ' + config.get('site_host'), html: tpl}, function (err, info) {
                        if (err) {
                            console.log('Не удалось отправить письмо Заказ с сайта.', err, info);
                        }
                        cb(null);
                    });

                }
            },cb);
        },
        sendOrderEmailAdmin: function (cb) {
            cb(null);

            var tpl_name = 'order_manager.html';

            async.series({
                prepareTemplate: function (cb) {
                    fs.readFile('./templates/' + tpl_name, function (err, data) {
                        if (err) return cb(new MyError('Не удалось считать файл шаблона.', err));
                        tpl = data.toString();
                        cb(null);
                    });
                },
                sendNotify: function (cb) {

                    var tbl = '<table style="text-align: left; border: 1px solid #000;">';
                    var total_amount = 0;
                    for (var i in products) {
                        var amount = Math.round((+products[i].product_count * +products[i].price)*100)/100;
                        total_amount += amount;
                        tbl += '<tr>';
                        tbl += '<td style="border: 1px solid #000;">' + products[i].product_id + '</td>';
                        tbl += '<td style="border: 1px solid #000;">' + products[i].name + '</td>';
                        tbl += '<td style="border: 1px solid #000;">' + products[i].price + '</td>';
                        tbl += '<td style="border: 1px solid #000;">' + products[i].product_count + '</td>';
                        tbl += '<td style="border: 1px solid #000;">' + amount + '</td>';
                        tbl += '</tr>';
                    }
                    tbl += '</table>';



                    var client_data = '';
                    var avalColumns = ["id","order_status","additional_order_status","amount","product_count","reserv_to_date","phone","name","email","address","gate","level","flat","comment","shop","gatecode","order_payment_type","delivery_price","total_to_pay","created"];
                    for (var i in order) {
                        if (avalColumns.indexOf(i) == -1) continue;
                        client_data += _t.class_fields_profile[i].name +': ' + order[i] + '<br>';
                        // client_data += i +': ' + order[i] + '<br>';
                    }

                    var m_obj = {
                        name: (crm_user.name)? 'Здравствуйте ' + crm_user.name + '!' : 'Здравствуйте!',
                        order_id:order.id,
                        product_table:tbl,
                        total_amount:total_amount,
                        client_data:client_data
                    };

                    tpl = mustache.to_html(tpl, m_obj);
                    sendMail({email: 'alextgco@gmail.com,ivantgco@gmail.com,insarov.ka@gmail.com', subject: 'Заказ с сайта ' + config.get('site_host'), html: tpl}, function (err, info) {
                        if (err) {
                            console.log('Не удалось отправить письмо Заказ с сайта.', err, info);
                        }
                        cb(null);
                    });

                }
            },function(err){
                console.log(err);
            });
        }
    }, function (err, res) {
        if (err) {
            console.log('CREATE_ORDER ERROR', err.message, JSON.stringify(err.data));
            if (err.message == 'needConfirm') return cb(err);
            rollback.rollback({rollback_key:rollback_key,user:_t.user}, function (err2) {
                return cb(err, err2);
            });
        }else{
            //cb(null, new UserOk('Заказ успешно создан.',{order_id:order_id}));
            console.log('CREATE ORDER SUCCESS');
            cb(null, res.createOrder);
        }
    });
};

//Model.prototype.modify_ = function (obj, cb) {
//
//    if (arguments.length == 1) {
//        cb = arguments[0];
//        obj = {};
//    }
//    var _t = this;
//    var id = obj.id;
//    if (!id) return cb(new MyError('В метод не передан id'));
//    var rollback_key = obj.rollback_key || rollback.create();
//
//    var order_;
//    async.series({
//        get: function (cb) {
//            _t.getById({id:id}, function (err, res) {
//                if (err) return cb(err);
//                order_ = res[0];
//                cb(null);
//            });
//        },
//        recalculate: function(cb){
//            order_.amount = obj.amount
//            obj.total_to_pay = +order_.amount
//
//            _t.modifyPrototype(obj, function (err, res) {
//                if (err) return cb(err);
//                cb(null);
//            });
//        }
//    }, function (err, res) {
//        if (err) {
//            if (err.message == 'needConfirm') return cb(err);
//            rollback.rollback({rollback_key:rollback_key,user:_t.user}, function (err2) {
//                return cb(err, err2);
//            });
//        }else{
//            cb(null, new UserOk('Заказ успешно изменен.'));
//        }
//    });
//};

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
    var tpl;
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

Model.prototype.getDeliveryNote = function (obj, cb) {
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
    var tpl;

    _t.valet_delivery_note({id:id}, function (err, res) {
        if (err) return cb(err);
        filename = res.filename;
        path = res.path;
        cb(null, new UserOk('Ок',{filename:filename,path:path}));
    });

};

//getDeliveryNote

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
                order_id: order.id || 'б/н',
                name: order.name || '',
                phone: order.phone || '',
                email: order.email || '',
                address: order.address || '',
                gate: order.gate || '',
                gatecode: order.gatecode || '',
                comment: order.comment || '',
                payment_type: order.order_payment_type || '',
                level: order.level || '',
                flat: order.flat || '',
                order_datetime: order.created || '',
                delivery_amount: order.delivery_price + ' руб.',
                total_to_pay: parseFloat(order.total_to_pay).toFixed(2) + ' руб.',
                order: []
            };
            cb(null);
        },
        prepareData: function (cb) {
            var counter = 1;
            readyData.total_count = 0;
            readyData.total_amount = parseFloat(order.amount).toFixed(2) + ' руб.';

            for (var i in products) {

                readyData.order.push({
                    no:counter++,
                    product_id:products[i].id,
                    product_name:products[i].name,
                    quantity:products[i].product_count,
                    price:products[i].price,
                    amount: parseFloat(products[i].price * products[i].product_count).toFixed(2)
                });

                readyData.total_count ++;
            }

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

Model.prototype.setStatistic = function (obj, cb) {
    if (arguments.length == 1) {
        cb = arguments[0];
        obj = {};
    }
    var _t = this;
    var id = obj.id;
    if (isNaN(+id)) return cb(new MyError('Не передан id',{obj:obj}));
    var rollback_key = obj.rollback_key || rollback.create();



    var products_in_order, order_;
    async.series({
        get: function (cb) {
            _t.getById({id:id}, function (err, res) {
                if (err) return cb(err);
                order_ = res[0];
                cb(null);
            });
        },
        getOrderProduct: function (cb) {
            var o = {
                command:'get',
                object:'product_in_order',
                params:{
                    param_where:{
                        order_id:id
                    },
                    collapseData:false
                }
            };
            _t.api(o, function (err, res) {
                if (err) return cb(new MyError('Не удалось получить товаы из корзины',{err:err}));
                products_in_order = res;
                cb(null);
            });
        },
        setStatistic: function (cb) {
            if (!products_in_order.length) return cb(null);
            var total_count = 0;
            var total_amount = 0;
            for (var i in products_in_order) {
                var product = products_in_order[i];
                total_count += +product.product_count;
                total_amount += +product.price * +product.product_count;
            }
            total_amount = Math.round(total_amount * 100)/100;
            var params = {
                id:id,
                product_count:total_count,
                amount:total_amount,
                total_to_pay:+total_amount + +order_.delivery_price,
                rollback_key:rollback_key
            };
            console.log('MODIFY',params);
            _t.modify(params, function (err) {
                if (err) {
                    if (err.message != 'notModified') {
                        return cb(new MyError('Не удалось установить статистическу информацию для заказа.', {params: params, err: err}));
                    }
                    return cb(null);
                }
                return cb(null);
            });
        }
    }, function (err, res) {
        if (err) {
            if (err.message == 'needConfirm') return cb(err);
            rollback.rollback({rollback_key:rollback_key,user:_t.user}, function (err2) {
                return cb(err, err2);
            });
        }else{
            cb(null, new UserOk('Статистика подсчитана.'));
        }
    });
};

Model.prototype.repeatOrder = function (obj, cb) {
    if (arguments.length == 1) {
        cb = arguments[0];
        obj = {};
    }
    var _t = this;
    var id = obj.id;
    if (isNaN(+id)) return cb(new MyError('Не передан id',{obj:obj}));
    var rollback_key = obj.rollback_key || rollback.create();

    var product_in_order;
    async.series({
        getOrderProduct: function (cb) {
            var o = {
                command: 'get',
                object: 'product_in_order',
                params: {
                    param_where: {
                        order_id:id
                    },
                    collapseData: false
                }
            };
            _t.api(o, function (err, res) {
                if (err) return cb(new MyError('Не удалось получить товары из заказа', {o: o, err: err}));
                product_in_order = res;
                cb(null);
            });
        },
        addToCart: function (cb) {
            async.eachSeries(product_in_order, function (one_product, cb) {
                var product;
                async.series({
                    getProduct: function (cb) {
                        var o = {
                            command: 'getById',
                            object: 'product',
                            params: {
                                id: one_product.product_id
                            }
                        };
                        _t.api(o, function (err, res) {
                            if (err) return cb(new MyError('Не удалось получить товар', {o: o, err: err}));
                            product = res[0];
                            cb(null);
                        });
                    },
                    add: function (cb) {
                        if (!product.is_active) return cb(null);
                        if (product.quantity <= 0) return cb(null);
                        if (product.price_site <= 0) return cb(null);
                        var product_count = (+product.quantity >= +one_product.product_count)? +one_product.product_count : product.quantity;
                        var o = {
                            command:'add',
                            object:'product_in_cart',
                            params:{
                                product_id:one_product.product_id,
                                sid:obj.sid,
                                product_count:product_count,
                                is_replace:true
                            }
                        };
                        _t.api(o, function (err, res) {
                            if (err){
                                console.log('Не удалось добавить товар в корзину',err);

                            }
                            cb(null);
                        });
                    }
                },cb);
            }, cb);
        }
    },function (err, res) {
        if (err) {
            if (err.message == 'needConfirm') return cb(err);
            rollback.rollback({rollback_key: rollback_key, user: _t.user}, function (err2) {
                return cb(err, err2);
            });
        } else {
            //if (!obj.doNotSaveRollback){
            //    rollback.save({rollback_key:rollback_key, user:_t.user, name:_t.name, name_ru:_t.name_ru || _t.name, method:'METHOD_NAME', params:obj});
            //}
            cb(null, new UserOk('В корзину были добавлены товары, которые были в наличии'));
        }
    });
};

Model.prototype.example = function (obj, cb) {
    if (arguments.length == 1) {
        cb = arguments[0];
        obj = {};
    }
    var _t = this;
    var id = obj.id;
    if (isNaN(+id)) return cb(new MyError('Не передан id',{obj:obj}));
    var rollback_key = obj.rollback_key || rollback.create();

    async.series({

    },function (err, res) {
        if (err) {
            if (err.message == 'needConfirm') return cb(err);
            rollback.rollback({rollback_key: rollback_key, user: _t.user}, function (err2) {
                return cb(err, err2);
            });
        } else {
            //if (!obj.doNotSaveRollback){
            //    rollback.save({rollback_key:rollback_key, user:_t.user, name:_t.name, name_ru:_t.name_ru || _t.name, method:'METHOD_NAME', params:obj});
            //}
            cb(null, new UserOk('Ок'));
        }
    });
};

module.exports = Model;