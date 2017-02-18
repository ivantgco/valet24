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

var Model = function(obj){
    this.name = obj.name;
    this.tableName = obj.name.toLowerCase();

    var basicclass = BasicClass.call(this, obj);
    if (basicclass instanceof MyError) return basicclass;
};
util.inherits(Model, BasicClass);
Model.prototype.getPrototype = Model.prototype.get;
Model.prototype.addPrototype = Model.prototype.add;
Model.prototype.modifyPrototype = Model.prototype.modify;
Model.prototype.removeCascadePrototype = Model.prototype.removeCascade;

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

Model.prototype.removeCascade = function (obj, cb) {
    if (arguments.length == 1) {
        cb = arguments[0];
        obj = {};
    }
    var _t = this;
    var client_object = _t.client_object || '';

    var coFunction = 'removeCascade_' + client_object;

    if (typeof _t[coFunction] === 'function') {
        _t[coFunction](obj, cb);
    } else {
        if (typeof _t['removeCascade_'] === 'function') {
            _t['removeCascade_'](obj, cb);
        } else {
            _t.removeCascadePrototype(obj, cb);
        }
    }
};

Model.prototype.add_product_to_favorite = function (obj, cb) {
    if (arguments.length == 1) {
        cb = arguments[0];
        obj = {};
    }
    var _t = this;
    var rollback_key = obj.rollback_key || rollback.create();

    var crm_user_id = obj.crm_user_id;
    if (isNaN(+crm_user_id)) return cb(new MyError('Не передан crm_user_id'));
    var product_id = obj.product_id;
    if (isNaN(+product_id)) return cb(new MyError('Не передан product_id'));

    // Получим favorite
    // Если есть то установим active
    // Если нет то создадим

    var favorite;
    async.series({
        get: function (cb) {
            var params = {
                client_object:'crm_user_favorite_FAST',
                param_where: {
                    crm_user_id:crm_user_id,
                    product_id:product_id
                },
                collapseData: false
            }
            _t.get(params, function (err, res) {
                if (err) return cb(new MyError('Не удалось получить favorite', {params: params, err: err}));
                favorite = res[0];
                console.log(favorite);
                cb(null);
            });
        },
        add: function (cb) {
            if (favorite) return cb(null);
            var params = {
                crm_user_id:crm_user_id,
                product_id: product_id,
                is_active:true,
                rollback_key: rollback_key
            }
            _t.add(params, function (err, res) {
                if (err) return cb(new MyError('Не удалось создать favorite ', {params: params, err: err}));
                cb(null);
            });
        },
        modify: function (cb) {
            if (!favorite) return cb(null);
            if (favorite.is_active) return cb(null);
            var params = {
                id: favorite.id,
                is_active:true,
                rollback_key: rollback_key
            }
            _t.modify(params, function (err, res) {
                if (err) return cb(new MyError('Не удалось изменить favorite', {params: params, err: err}));
                cb(null);
            });
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
            cb(null, new UserOk('Продукт добавлен в избранное'));
        }
    });
}

Model.prototype.remove_product_to_favorite = function (obj, cb) {
    if (arguments.length == 1) {
        cb = arguments[0];
        obj = {};
    }
    var _t = this;
    var rollback_key = obj.rollback_key || rollback.create();

    var crm_user_id = obj.crm_user_id;
    if (isNaN(+crm_user_id)) return cb(new MyError('Не передан crm_user_id'));
    var product_id = obj.product_id;
    if (isNaN(+product_id)) return cb(new MyError('Не передан product_id'));

    // Получим favorite
    // Если есть то установим active = false
    // Если нет то ничего не делаем

    var favorite;
    async.series({
        get: function (cb) {
            var params = {
                client_object:'crm_user_favorite_FAST',
                param_where: {
                    crm_user_id:crm_user_id,
                    product_id:product_id
                },
                collapseData: false
            }
            _t.get(params, function (err, res) {
                if (err) return cb(new MyError('Не удалось получить favorite', {params: params, err: err}));
                favorite = res[0];
                cb(null);
            });
        },
        modify: function (cb) {
            if (!favorite) return cb(null);
            if (!favorite.is_active) return cb(null);
            var params = {
                id: favorite.id,
                is_active:false,
                rollback_key: rollback_key
            }
            _t.modify(params, function (err, res) {
                if (err) return cb(new MyError('Не удалось изменить favorite', {params: params, err: err}));
                cb(null);
            });
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
            cb(null, new UserOk('Продукт удален из избранного'));
        }
    });
}

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
}

module.exports = Model;