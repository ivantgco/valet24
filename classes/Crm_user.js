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
var crypto = require('crypto');
var funcs = require('../libs/functions');
var Guid = require('guid');

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

Model.prototype.encryptPassword = function(password){
    var salt = Math.random() + '';
    return {
        hashedPassword:crypto.createHmac('sha1',salt).update(password).digest('hex'),
        salt:salt
    };
};
Model.prototype.checkPassword = function(salt, password, hashedPassword){
    if (!salt || !password || !hashedPassword) throw new MyError('Не переданы необходимые параметры');
    var pass = crypto.createHmac('sha1',salt).update(password).digest('hex');
    return pass === hashedPassword;
};

Model.prototype.registration = function (obj, cb) {
    if (arguments.length == 1) {
        cb = arguments[0];
        obj = {};
    }
    if (typeof cb !== 'function') throw new MyError('В метод не передан cb');
    if (typeof obj !== 'object') return cb(new MyError('В метод не переданы параметры'));
    var _t = this;
    var password = obj.password;
    if (!password){
        return cb(new UserError('Не указан пароль.'));
    }
    var email = obj.email;
    if (!funcs.validation.email(email)) return cb(new UserError('Некорректно передан email'));
    var rollback_key = obj.rollback_key || rollback.create();

    var passObj = _t.encryptPassword(password);
    var hashedPassword = passObj.hashedPassword;
    var salt = passObj.salt;
    delete  obj.password;
    delete  obj.status;
    delete  obj.status_id;
    delete  obj.status_sysname;

    // Поищем пользователя с таким email
    // Если нашли и пользователь еще не подтвержден, заменяем данные пользователя. Отправляем подтверждение
    // Если нашли уже подтвержденного ->
        // Если из заказа -> ничего не делаем
        // Если с сайта -> Отказ
    // Если не нашли - создаем высылаем подтверждение
    // Вернуть crm_user

    var crm_user;
    var confirmKey = Guid.create().value;
    async.series({
        getUser: function (cb) {
            var params = {
                param_where: {
                    email:email
                },
                collapseData: false
            }
            _t.get(params, function (err, res) {
                if (err) return cb(new MyError('Не удалось покупателя', {params: params, err: err}));
                if (!res.length) return cb(null);
                crm_user = res[0];
                cb(null);
            });
        },
        checkAlreadyReg: function (cb) {
            if (!crm_user) return cb(null);
            if (crm_user.status_sysname == 'ACTIVE' && !obj.fromCreateOrder) return cb(new UserError('Такой пользователь уже зарегестрирован в системе.'));
            cb(null);
        },
        check: function (cb) {
            if (!crm_user) return cb(null);
            if (crm_user.status_sysname == 'BLOCKED') return cb(new UserError('Пользователь заблокирован, обратитесь в службу поддержки.'));
            if (crm_user.status_sysname == 'CREATED' && !obj.fromCreateOrder) crm_user.needSendConfirm = true;
            cb(null);
        },
        createCrm: function (cb) {
            if (crm_user) return cb(null);
            // Проставим needSendConfirm
            var params = {
                email:email,
                hashedPassword:hashedPassword,
                salt:salt,
                phone:obj.phone || '',
                name:obj.name || '',
                address:obj.address || '',
                gate:obj.gate || '',
                gatecode:obj.gatecode || '',
                level:obj.level || '',
                flat:obj.flat || '',
                confirm_key:confirmKey,
                rollback_key: rollback_key
            }
            _t.add(params, function (err, res0) {
                if (err) return cb(new MyError('Не удалось создать покупателя ', {params: params, err: err}));
                _t.getById({id: res0.id}, function (err, res) {
                    if (err) return cb(new MyError('Не удалось получить покупателя.', {id: id, err: err}));
                    crm_user = res[0];
                    crm_user.needSendConfirm = true;
                    cb(null);
                });
            });
        },
        sendConfirmEmail: function (cb) {

        }
    }, cb);

};

Model.prototype.getBySidActive = function (obj, cb) {
    if (arguments.length == 1) {
        cb = arguments[0];
        obj = {};
    }
    var _t = this;
    var sid = obj.sid;
    if (!sid) return cb(new MyError('Не передан sid',{obj:obj}));
    var rollback_key = obj.rollback_key || rollback.create();

    var user;
    async.series({
        get: function (cb) {
            var params = {
                param_where:{
                    sid:sid,
                    status_sysname:'ACTIVE'
                },
                columns:obj.columns,
                collapseData:false
            };
            _t.get(params, function (err, res) {
                if (err) return cb(new MyError('Не удалось получить пользователя.',{err:err}));
                if (!res.length) return cb(new UserError('Пользователь не найден.'));
                if (res.length > 1) {
                    // clear user (logout)
                    return cb(new UserError('Требуется повторная авторизация'));
                }
                user = res[0];
                cb(null);
            })
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
            cb(null, new UserOk('Ок',{user:user}));
        }
    });
}

Model.prototype.registration = function (obj, cb) {
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