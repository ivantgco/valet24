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
var funcs = require('../libs/functions');
var moment = require('moment');

var Model = function(obj){
    this.name = obj.name;
    this.tableName = obj.name.toLowerCase();

    var basicclass = BasicClass.call(this, obj);
    if (basicclass instanceof MyError) return basicclass;
};
util.inherits(Model, BasicClass);
Model.prototype.getPrototype = Model.prototype.get;
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

Model.prototype.get = function (obj, cb) {
    if (arguments.length == 1) {
        cb = arguments[0];
        obj = {};
    }
    var _t = this;
    var client_object = _t.client_object || '';

    var coFunction = 'get_' + client_object;
    if (typeof _t[coFunction] === 'function') {
        _t[coFunction](obj, cb);
    } else {
        if (typeof _t['get_'] === 'function') {
            _t['get_'](obj, cb);
        } else {
            _t.getPrototype(obj, cb);
        }
    }
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

/////////////////////////////////////////////////////



Model.prototype.add_ = function (obj, cb) {
    if (arguments.length == 1) {
        cb = arguments[0];
        obj = {};
    }
    var _t = this;
    var sid = obj.sid;
    if (!sid) return cb(new MyError('sid обязателен для метода'));

    obj.reserv_to_date = moment().add(1,'day').format('YYYY-MM-DD HH:mm:ss');
    _t.addPrototype(obj, cb);
};


Model.prototype.remove_ = function (obj, cb) {
    if (arguments.length == 1) {
        cb = arguments[0];
        obj = {};
    }
    var _t = this;
    var id = obj.id;
    if (!id) return cb(new MyError('id обязателен для метода'));
    var rollback_key = obj.rollback_key || rollback.create();

    // Получим продукты из корзины
    // Удалим все ее товары
    // Удалим Корзину

    var products_in_cart;
    async.series({
        getProductsInCart: function (cb) {
            var o = {
                command:'get',
                object:'product_in_cart',
                params:{
                    param_where:{
                        cart_id:id
                    },
                    collapseData:false
                }
            };
            _t.api(o, function (err, res) {
                if (err) return cb(err);
                products_in_cart = res;
                cb(null);
            })
        },
        removeCartProducts: function (cb) {
            async.eachSeries(products_in_cart, function (product, cb) {
                var o = {
                    command:'remove',
                    object:'product_in_cart',
                    params:{
                        id:product.id,
                        rollback_key:rollback_key,
                        fromClient:false,
                        froServer:true
                    }
                };
                _t.api(o, cb);
            }, cb);
        },
        removeCart: function (cb) {
            obj.rollback_key = rollback_key;
            obj.fromClient = false;
            obj.froServer = true;
            _t.removePrototype(obj,cb);
        }
    }, function (err) {
        if (err) {
            if (err.message == 'needConfirm') return cb(err);
            rollback.rollback({rollback_key:rollback_key,user:_t.user}, function (err2) {
                return cb(err, err2);
            });

        }else{
            cb(null, new UserOk('Корзина успешно очищена.'));
        }
    });

};


module.exports = Model;