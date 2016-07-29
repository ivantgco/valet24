/**
 * Created by iig on 28.11.2015.
 */
/**
 * Created by iig on 04.11.2015.
 */
var MyError = require('../../error').MyError;
var UserError = require('../../error').UserError;
var UserOk = require('../../error').UserOk;
var MySQLModel = require('../../models/system/MySQLModel');
var util = require('util');
var async = require('async');
var fs = require('fs');
var moment = require('moment');
var api = require('../../libs/api');
var Guid = require('Guid');

var BasicClass = function (obj) {
    var mysqlmodel = MySQLModel.call(this, obj);
    if (mysqlmodel instanceof MyError) return mysqlmodel;
};
util.inherits(BasicClass, MySQLModel);

BasicClass.prototype.init = function (obj, cb) {
    if (arguments.length == 1) {
        cb = arguments[0];
        obj = {};
    }
    if (typeof cb !== 'function') throw new MyError('В метод не передан cb');
    if (typeof obj !== 'object') return cb(new MyError('В метод не переданы obj'));
    var _t = this;

    BasicClass.super_.prototype.init.apply(this, [obj, function (err) {
        // Выполним инициализацию BasicClass
        if (typeof global.class_locks!=='object') global.class_locks = {};
        if (typeof global.class_locks[_t.name]!=='object') global.class_locks[_t.name] = {};
        cb(err);
    }]);
};

BasicClass.prototype.lock = function (obj, cb) {
    if (arguments.length == 1) {
        cb = arguments[0];
        obj = {};
    }
    var _t = this;
    var id = obj.id;
    if (isNaN(+id)) return cb(new MyError('В метод не передан id'));

    var key = Guid.create().value;


    if (global.class_locks[_t.name][id]) return cb(new UserError('Запись уже заблокирована другим процессом.'));
    global.class_locks[_t.name][id] = key;
    return cb(null, key);
};
BasicClass.prototype.unlock = function (obj, cb) {
    if (typeof cb!=='function') cb = function (err, res) {
        console.log('unlock--'+ this.name +'--'+ obj.id +'-->',err, res);
    };
    if (typeof obj!=='object') return cb(new MyError('В метод не передан объект'));
        var _t = this;
    var id = obj.id;
    if (isNaN(+id)) return cb(new MyError('В метод не передан id'));
    var key = obj.key || obj.lock_key;

    
    if (!global.class_locks[_t.name][id]) return cb(null);
    if (global.class_locks[_t.name][id]!==key) return cb(new MyError('Запись не разблокирована. Неверный ключ.',{key:key}));
    global.class_locks[_t.name][id] = false;
    return cb(null);
};
BasicClass.prototype.test = function () {
    setInterval(console.log('BasicClass.prototype.test'),80);
};
module.exports = BasicClass;