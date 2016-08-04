/**
 * Created by iig on 29.10.2015.
 */
var MyError = require('../error').MyError;
var UserError = require('../error').UserError;
var UserOk = require('../error').UserOk;
var BasicClass = require('./system/BasicClass');
var util = require('util');
var async = require('async');
var crypto = require('crypto');
var api = require('../libs/api');

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
Model.prototype.load = function (sid, cb) {
    if (typeof cb!=='function') throw new MyError('В User load не передан cb');
    if (typeof sid!=='string') return cb(new MyError('Не коректно передан sid'));
    var _t = this;
    //if (_t.user) {
    //    if (_t.user.sid == sid) return cb(null);
    //    process.exit();
    //}
    _t.sid = sid;
    _t.get({
        collapseData:false,
        param_where: {
            sid: sid,
            status_sysname:'ACTIVE'
        }
    }, function (err, res) {
        if (err) return cb(err);
        _t.authorized = !!res.length;
        _t.user_data = res[0];
        cb(null);
    });
};
/**
 * Авторизирует и загружает пользователя типа SITE по параметрe site
 * @param obj
 * @param cb
 * @returns {*}
 */
Model.prototype.loadSiteUser = function (obj, cb) {
    if (arguments.length == 1) {
        cb = arguments[0];
        obj = {};
    }
    if (typeof cb !== 'function') throw new MyError('В метод не передан cb');
    if (typeof obj !== 'object') return cb(new MyError('В метод не переданы obj'));
    var _t = this;
    var site = obj.site;
    if (!site) return cb(new MyError('Не передан параметр site'));
    _t.get({
        collapseData:false,
        param_where: {
            email: site,
            user_type_sysname:'SITE',
            status_sysname:'ACTIVE'
        }
    }, function (err, res) {
        if (err) return cb(err);
        if (!res.length) return cb(new MyError('Пользователь не найден'));
        _t.authorized = !!res.length;
        _t.user_data = res[0];
        cb(null);
    });
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
    console.log('====================', hashedPassword);
    return pass === hashedPassword;
};
Model.prototype.add = function (obj, cb) {
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


    var passObj = _t.encryptPassword(password);
    obj.hashedPassword = passObj.hashedPassword;
    obj.salt = passObj.salt;
    delete  obj.password;
    var user_type;
    async.series([
        function (cb) {
            // Получим тип пользователя
            var o = {
                command:'get',
                object:'user_type',
                params:{
                    param_where:{
                        id:obj.user_type_id
                    },
                    collapseData:false
                }
            };
            _t.api(o, function (err, res) {
                if (err) return err;
                if (!res.length) return cb(new MyError('В справочнике user_type нет типа с id  '+ obj.user_type_id));
                user_type = res[0];
                cb(null);
            })
        },
        function (cb) {
            // Выполним проверки
            if (user_type.sysname === 'SITE'){
                obj.firstname = obj.firstname || obj.email;
                obj.lastname = password;
            }
            cb(null);
        },
        function (cb) {
            // получим ID нужного статуса - WAIT_CONFIRM

            var status = 'WAIT_CONFIRM';
            var o = {
                command:'get',
                object:'user_status',
                params:{
                    where:[{
                        key:'sysname',
                        val1: status
                    }],
                    collapseData:false,
                    columns:['id']
                }
            };
            _t.api(o, function (err, res) {
                if (err) return err;
                if (typeof res!=='object'){
                    return cb(new MyError('Произошла ошибка при попытке получить id статуса из справочника user_status. Результат не является объектом'));
                }
                if (!res.length){
                    return cb(new MyError('В справочнике user_status нет статуса '+status));
                }
                obj.status_id = res[0].id;
                cb(null);
            })
        },
        function (cb) {
            // выполним добавление
            _t.addPrototype(obj, cb);
        }
    ], cb);

};
Model.prototype.confirmUser = function (obj, cb) {
    if (arguments.length == 1) {
        cb = arguments[0];
        obj = {};
    }
    if (typeof cb !== 'function') throw new MyError('В метод не передан cb');
    if (typeof obj !== 'object') return cb(new MyError('В метод не переданы параметры'));
    var _t = this;
    if (!obj.id){
        return cb(new MyError('Не передан пользователь.'));
    }
    async.series([
        function (cb) {
            // получим ID нужного статуса - ACTIVE

            var status = 'ACTIVE';
            var o = {
                command:'get',
                object:'user_status',
                params:{
                    where:[{
                        key:'sysname',
                        val1: status
                    }],
                    collapseData:false,
                    columns:['id']
                }
            };
            _t.api(o, function (err, res) {
                if (err) return err;
                if (typeof res!=='object'){
                    return cb(new MyError('Произошла ошибка при попытке получить id статуса из справочника user_status. Результат не является объектом'));
                }
                if (!res.length){
                    return cb(new MyError('В справочнике user_status нет статуса '+status));
                }
                obj.status_id = res[0].id;
                cb(null);
            })
        },
        function (cb) {
            // выполним изменение
            var params = {
                id:obj.id,
                status_id:obj.status_id
            };
            _t.modify(params, cb);
        }
    ], function (err, res) {
        if (err) return cb(err);
        cb(null, res[1]);
    });

};
Model.prototype.login = function (obj, cb) {
    if (arguments.length == 1) {
        cb = arguments[0];
        obj = {};
    }
    if (typeof cb !== 'function') throw new MyError('В метод не передан cb');
    if (typeof obj !== 'object') return cb(new MyError('В метод не переданы параметры'));
    var _t = this;
    var user = _t.user;
    var login = obj.login;
    var password = obj.password;
    var sid = user.sid;
    if (!sid) return cb(new MyError('В метод не передан sid'));
    if (!login || !password) {
        return cb(new UserError('Не указан логин или пароль.'));
    }
    var data;
    async.series([
        function (cb) {
            // Запросим данные по пользователю и сверим пароли
            _t.get({
                collapseData:false,
                param_where: {
                    email: login,
                    status_sysname:'ACTIVE'
                }
            }, function (err, res) {
                if (err) return cb(err);
                if (!res.length) return cb(new UserError('invalidAuthData'));
                data = res[0];
                cb(null);
            });
        },
        function (cb) {
            // Сверим пароль
            var confirm = _t.checkPassword(data.salt, password, data.hashedPassword);
            if (!confirm) return cb(new UserError('invalidAuthData'));
            cb(null);
        },
        function (cb) {
            // очистить sid для пользователей с таким же сидом (устаревшая инфа)
            async.waterfall([
                pool.getConn,
                function (conn, cb) {
                    var sql = "UPDATE user set sid = NULL where sid = '"+ sid +"'";
                    conn.query(sql, function (err, res) {
                        conn.release();
                        return cb(err, res);
                    });
                }
            ],cb);
        },
        function (cb) {
            // Запишем sid в базу
            _t.modify({
                id:data.id,
                sid:sid
            }, cb);
        }/*,
        function (cb) {
            _t.load(sid, cb);
        }*/
    ], function (err) {
        if (err) return cb(err);
        return cb(null, new UserOk('Успешная авторизация'));
    });

};
Model.prototype.logout = function (obj, cb) {
    if (arguments.length == 1) {
        cb = arguments[0];
        obj = {};
    }
    if (typeof cb !== 'function') throw new MyError('В метод не передан cb');
    if (typeof obj !== 'object') return cb(new MyError('В метод не переданы параметры'));
    var user = obj.user;
    if (typeof user !== 'object') return cb(new MyError('В метод не передан user'));
    var _t = this;
    var sid = user.sid;
    var io = global.io;

    _t.modify({
        id:user.user_data.id,
        sid:null
    }, function (err) {
        if (err) return cb(err);
        delete _t.user;
        io.sockets.$emit('session:logout',sid);
        cb(null, new UserOk('Вы успешно вышли из системы.'));
    });

    /*async.series([
        function (cb) {
            _t.modify({
                id:user.user_data.id,
                sid:null,
                user:user
            }, function (err) {
                if (err) return cb(err);
                cb(null, new UserOk('Вы успешно вышли из системы.'));
            });
        },
        function (cb) {
            var clients = io.sockets.clients();
            async.eachSeries(clients, function (client, cb) {
                if (client.handshake.session.id != sid) return cb(null);
                loadSession(sid, function (err, session) {
                    if (err) {
                        return cb(new MyError('Во время логаута произошла ошибка',{err:err}));
                    }
                    if (session) {
                        session.destroy(function (err) {
                            if (err) return cb(new MyError('Во время логаута произошла ошибка 2',{err:err}));
                        });
                    }else{
                        cb(null);
                    }
                });
            }, cb);
        }
    ], function (err) {
        if (err) return cb(err);
        cb(null, new UserOk('Вы успешно вышли из системы.'));
        client.emit("logout");
        client.disconnect();
    });*/
};
module.exports = Model;