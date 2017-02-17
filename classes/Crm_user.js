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
var fs = require('fs');
var sendMail = require('../libs/sendMail');
var config = require('../config');
var mustache = require('mustache');

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

    var email = obj.email;
    if (!funcs.validation.email(email)) return cb(new UserError('Некорректно передан email'));
    var rollback_key = obj.rollback_key || rollback.create();

    var passObj = (password)? _t.encryptPassword(password) : {};
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
    var tpl;
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
                sid:obj.sid,
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
            if (!crm_user.needSendConfirm) return cb(null);
            var tpl_name, link_confirm;
            if (obj.fromCreateOrder){
                tpl_name = 'confirm_registration_order.html';
                link_confirm = config.get('site_host_protocol') + '://' + config.get('site_host') + '/finish_registration_order/?key='+crm_user.confirm_key + '&key2=' + crm_user.id;
            }else{
                tpl_name = 'confirm_registration.html';
                link_confirm = config.get('site_host_protocol') + '://' + config.get('site_host') + '/finish_registration/?key='+crm_user.confirm_key + '&key2=' + crm_user.id;
            }
            async.series({
                prepareTemplate: function (cb) {
                    fs.readFile('./templates/' + tpl_name, function (err, data) {
                        if (err) return cb(new MyError('Не удалось считать файл шаблона.', err));
                        tpl = data.toString();
                        cb(null);
                    });
                },
                sendNotify: function (cb) {
                    var m_obj = {
                        name: (crm_user.name)? 'Здравствуйте ' + crm_user.name + '!' : 'Здравствуйте!',
                        link_confirm: link_confirm
                    };
                    tpl = mustache.to_html(tpl, m_obj);
                    sendMail({email: email, subject: 'Завершение регистрации на сайте ' + config.get('site_host'), html: tpl}, function (err, info) {
                        if (err) {
                            console.log('Не удалось отправить письмо с подтверждением регистрации.', err, info);
                        }
                        cb(null);
                    });

                }
            },cb);
        }
    }, function (err) {
        if (err) return cb(err);
        cb(null, {crm_user: crm_user});
    });
};

Model.prototype.confirm_registration = function (obj, cb) {
    if (arguments.length == 1) {
        cb = arguments[0];
        obj = {};
    }
    if (typeof cb !== 'function') throw new MyError('В метод не передан cb');
    if (typeof obj !== 'object') return cb(new MyError('В метод не переданы параметры'));
    var _t = this;
    var password = obj.password;

    var rollback_key = obj.rollback_key || rollback.create();

    var passObj = (password)? _t.encryptPassword(password) : {};
    var hashedPassword = passObj.hashedPassword;
    var salt = passObj.salt;


    var confirm_key = obj.confirm_key;
    var id = obj.confirm_key2;
    console.log('confirm_registration obj',obj);
    if (!confirm_key || !id) return cb(new MyError('Не переданы необходимые параметры'));



    var crm_user;
    var tpl;
    async.series({
        getUser: function (cb) {
            var params = {
                param_where: {
                    id:id,
                    confirm_key:confirm_key
                },
                collapseData: false
            }
            _t.get(params, function (err, res) {
                if (err) return cb(new MyError('Не удалось получить покупателя', {params: params, err: err}));
                if (!res.length) return cb(new UserError('Не удалось завершить регистрацию.'));
                crm_user = res[0];
                cb(null);
            });
        },
        check: function (cb) {
            // Если уже активен, то "Этот пользователь уже был подтвержден"
            if (crm_user.status_sysname != 'CREATED') return cb(new UserError('Регистрация уже была подтверждена.'));
            if (!crm_user.hashedPassword && !password) return cb(new UserError('Для завершения регистрации необходимо указать пароль.'));
            cb(null);
        },
        modifyStatusEndSetPassword: function (cb) {
            var params = {
                id: crm_user.id,
                status_sysname: 'ACTIVE',
                rollback_key: rollback_key
            }
            if (!crm_user.hashedPassword) {
                params.hashedPassword = hashedPassword;
                params.salt = salt;
            }
            _t.modify(params, function (err, res) {
                if (err) return cb(new MyError('Не удалось изменить покупателя', {params: params, err: err}));
                cb(null);
            });
        },
        sendNotify: function (cb) {
            // Здесь сделать подтверждение Жду шаблон
            var tpl;
            async.series({
                prepareTemplate: function (cb) {
                    fs.readFile('./templates/registration_success.html', function (err, data) {
                        if (err) return cb(new MyError('Не удалось считать файл шаблона.', err));
                        tpl = data.toString();
                        cb(null);
                    });
                },
                sendNotify: function (cb) {
                    var m_obj = {
                        name: (crm_user.name)? 'Здравствуйте ' + crm_user.name + '!' : 'Здравствуйте!'
                    };
                    tpl = mustache.to_html(tpl, m_obj);
                    sendMail({email: crm_user.email, subject: 'Успешная регистрация на сайте ' + config.get('site_host'), html: tpl}, function (err, info) {
                        if (err) {
                            console.log('Не удалось отправить письмо с подтверждением регистрации.', err, info);
                        }
                        cb(null);
                    });

                }
            },cb);
        }
    }, function (err) {
        if (err) return cb(err);
        cb(null, new UserOk('Ок'));
    });

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

Model.prototype.login = function (obj, cb) {
    if (arguments.length == 1) {
        cb = arguments[0];
        obj = {};
    }
    var _t = this;
    var sid = obj.sid;
    if (!sid) return cb(new MyError('Не передан sid',{obj:obj}));
    var rollback_key = obj.rollback_key || rollback.create();

    var password = obj.password;
    if (!password) return cb(new UserError('Не указан пароль.'));
    var email = obj.email;
    if (!email) return cb(new UserError('Не указан email.'))

    var crm_user;
    async.series({
        getByEmail: function (cb) {
            var params = {
                param_where: {
                    email:email
                },
                collapseData: false
            }
            _t.get(params, function (err, res) {
                if (err) return cb(new MyError('Не удалось получить пользователя', {params: params, err: err}));
                if (!res.length) return cb(new UserError('Пользователь с таким Email не найден.'));
                crm_user = res[0];
                cb(null);
            });
        },
        check: function (cb) {
            if (crm_user.status_sysname == 'CREATED' || !crm_user.status_sysname) return cb(new UserError('Вы еще не подтвердили регистрацию. Для подтверждения перейдите по ссылке из письма.'));
            if (crm_user.status_sysname == 'BLOCKED') return cb(new UserError('Пользователь с таким Email не найден.'));
            console.log('crm_user',crm_user);
            var confirm = _t.checkPassword(crm_user.salt, password, crm_user.hashedPassword);
            if (!confirm) return cb(new UserError('Пароль указан не верно.'));
            cb(null);
        },
        setSid: function (cb) {
            async.series({
                clearAnother: function (cb) {
                    var params = {
                        param_where: {
                            sid:sid
                        },
                        collapseData: false
                    }
                    _t.get(params, function (err, res) {
                        if (err) return cb(new MyError('Не удалось получить пользователей по sid', {params: params, err: err}));
                        if (!res.length) return cb(null);
                        async.eachSeries(res, function (one_usr, cb) {
                            var params = {
                                id: one_usr.id,
                                sid: null,
                                rollback_key: rollback_key
                            }
                            _t.modify(params, function (err, res) {
                                if (err) return cb(new MyError('Не удалось удалить sid пользователю', {params: params, err: err}));
                                cb(null);
                            });
                        }, cb);
                    });
                },
                setSid: function (cb) {
                    var params = {
                        id: crm_user.id,
                        sid: sid,
                        rollback_key: rollback_key
                    }
                    _t.modify(params, function (err, res) {
                        if (err) return cb(new MyError('Не удалось установить sid пользователю ', {params: params, err: err}));

                        cb(null);
                    });
                }
            },cb);
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
            cb(null, new UserOk('Успешная авторизация'));
        }
    });
}

Model.prototype.logout = function (obj, cb) {
    if (arguments.length == 1) {
        cb = arguments[0];
        obj = {};
    }
    var _t = this;
    var sid = obj.sid;
    if (!sid) return cb(new MyError('Не передан sid',{obj:obj}));
    var rollback_key = obj.rollback_key || rollback.create();

    async.series({
        getAndClear: function (cb) {
            var params = {
                param_where: {
                    sid:sid
                },
                collapseData: false
            }
            _t.get(params, function (err, res) {
                if (err) return cb(new MyError('Не удалось получить пользователей по sid', {params: params, err: err}));
                if (!res.length) return cb(null);
                async.eachSeries(res, function (one_usr, cb) {
                    var params = {
                        id: one_usr.id,
                        sid: null,
                        rollback_key: rollback_key
                    }
                    _t.modify(params, function (err, res) {
                        if (err) return cb(new MyError('Не удалось удалить sid пользователю', {params: params, err: err}));
                        cb(null);
                    });
                }, cb);
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
            cb(null, new UserOk('Успешный выход из системы'));
        }
    });
}


Model.prototype.modify_from_site = function (obj, cb) {
    if (arguments.length == 1) {
        cb = arguments[0];
        obj = {};
    }
    var _t = this;
    var sid = obj.sid;
    if (!sid) return cb(new MyError('Не передан sid',{obj:obj}));
    var id = obj.id;
    if (isNaN(+id)) return cb(new MyError('Не передан id',{obj:obj}));
    var rollback_key = obj.rollback_key || rollback.create();

    var crm_user;
    async.series({
        get: function (cb) {
            _t.getById({id: id}, function (err, res) {
                if (err) return cb(new MyError('Не удалось получить покупателя.', {id: id, err: err}));
                crm_user = res[0];
                cb(null);
            });
        },
        check: function (cb) {
            if (crm_user.status_sysname != 'ACTIVE') return cb(new UserError('Ваш пользователь в настоящий момент не активен'));
            if (crm_user.sid != sid) return cb(new UserError('Сессия устарела. Пожалуйста, авторизируйтесь.'));
            cb(null);
        },
        modify: function (cb) {
            var updateble_fields = ['phone','name','address','gate','gatecode','level','flat'];
            var toModify;
            for (var i in  updateble_fields) {
                var field = updateble_fields[i]
                if (typeof obj[field] != 'undefined' && crm_user[field] != obj[field]){
                    if (!toModify) toModify = {};
                    toModify[field] = obj[field];
                }
            }
            if (!toModify) return cb(null);
            var params = {
                id: crm_user.id,
                rollback_key: rollback_key
            }
            for (var i in toModify) {
                params[i] = toModify[i];
            }
            _t.modify(params, function (err, res) {
                if (err) cb(new MyError('Не удалось обновить поля покупателя',{params:params, err:err}));
                cb(null);
            });
        },
        changePass: function (cb) {
            if (!obj.new_password) return cb(null);
            if (!obj.password) return cb(new UserError('Для смены пароля необходимо указать текущий пароль.'));
            var confirm = _t.checkPassword(crm_user.salt, obj.password, crm_user.hashedPassword);
            if (!confirm) return cb(new UserError('Текущий пароль указан не верно.'));
            var passObj = _t.encryptPassword(obj.new_password);
            var hashedPassword = passObj.hashedPassword;
            var salt = passObj.salt;
            var params = {
                id: crm_user.id,
                salt:salt,
                hashedPassword:hashedPassword,
                rollback_key: rollback_key
            }
            _t.modify(params, function (err, res) {
                if (err) cb(new MyError('Не удалось установить новый пароль',{params:params, err:err}));
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
            cb(null, new UserOk('Данные пользователя успешно изменены'));
        }
    });
}

Model.prototype.restore_account = function (obj, cb) {
    if (arguments.length == 1) {
        cb = arguments[0];
        obj = {};
    }
    var _t = this;
    var sid = obj.sid;
    if (!sid) return cb(new MyError('Не передан id',{obj:obj}));
    var rollback_key = obj.rollback_key || rollback.create();
    var email = obj.email;
    if (!funcs.validation.email(email)) return cb(new UserError('Некорректно передан email'));


    // Установим restore_key
    // Отправим письмо с restore_link

    var restoreKey = Guid.create().value;
    var tpl;
    var crm_user;
    async.series({
        getByEmail: function (cb) {
            var params = {
                param_where: {
                    email:email
                },
                collapseData: false
            }
            _t.get(params, function (err, res) {
                if (err) return cb(new MyError('Не удалось получить покупателя по email', {params: params, err: err}));
                if (!res.length) return cb(new UserError('Восстановить пароль можно только для зарегестрированного пользователя.'));
                crm_user = res[0];
                cb(null);
            });
        },
        check: function (cb) {
            if (crm_user.status_sysname !== 'ACTIVE') return cb(new UserError('Восстановить пароль можно только для зарегестрированного пользователя.'));
            return cb(null);
        },
        setRestorKey: function (cb) {
            var params = {
                id: id,
                restore_key: restoreKey,
                rollback_key: rollback_key
            }
            _t.modify(params, function (err, res) {
                if (err) return cb(new MyError('Не удалось изменить restore_key для покупателя', {params: params, err: err}));
                cb(null);
            });
        },
        sendConfirmEmail: function (cb) {
            var tpl_name = 'restore_pass.html';
            var link_restore = config.get('site_host_protocol') + '://' + config.get('site_host') + '/restore_password/?key='+restoreKey;

            async.series({
                prepareTemplate: function (cb) {
                    fs.readFile('./templates/' + tpl_name, function (err, data) {
                        if (err) return cb(new MyError('Не удалось считать файл шаблона.', err));
                        tpl = data.toString();
                        cb(null);
                    });
                },
                sendNotify: function (cb) {
                    var m_obj = {
                        name: 'Здравствуйте!',
                        link_restore: link_restore
                    };
                    tpl = mustache.to_html(tpl, m_obj);
                    sendMail({email: email, subject: 'Восстановление пароля на сайте ' + config.get('site_host'), html: tpl}, function (err, info) {
                        if (err) {
                            console.log('Не удалось отправить письмо Восстановление пароля.', err, info);
                        }
                        cb(null);
                    });

                }
            },cb);
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
            cb(null, new UserOk('На указанную почту отправлено письмо. Для продолжения восстановления перейдите по ссылке из письма.'));
        }
    });
}


module.exports = Model;