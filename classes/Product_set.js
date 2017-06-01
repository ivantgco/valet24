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
var request = require('request');

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

Model.prototype.pushIntoWordpress = function (obj, cb) {
    if (arguments.length == 1) {
        cb = arguments[0];
        obj = {};
    }
    var _t = this;
    var wordpress_url = 'http://valet24.tmweb.ru/create_wp_page.php';
    var secure = 'SfL22ljis989128juaOaXCbsh91siuHHFs';

    //var o = {
    //    command:'pushIntoWordpress',
    //    object:'Category'
    //};
    //socketQuery(o, function (err, res) {
    //    console.log(err, res);
    //});

    // Получить данные
    // Для каждого выполнить запрос push
    // Alias записать в данные

    var sets = [];


    async.series({
        getDate: function (cb) {
            var params = {
                where:[
                    {
                        key:'site_alias',
                        type:'isNull',
                        group:'1',
                        comparisonType:'OR'
                    },
                    {
                        key:'site_alias',
                        val1:'',
                        group:'1',
                        comparisonType:'OR'
                    }
                ],
                limit:100000,
                collapseData:false
            };
            _t.get(params, function (err, res) {
                if (err) return cb(err);
                sets = res;
                cb(null);
            });
        },
        pushToWordpress: function (cb) {

            var counter = 0;
            var sets_count = sets.length;

            console.log('Пакетов', sets_count);

            async.eachSeries(sets, function (set_item, cb) {

                var alias = 'set_'+ set_item.id;

                var title = set_item.name.replace(/[^a-zA-Zа-яА-Я0-9]/ig,'_');

                if (title.length>50) title = title.substring(0, 50);


                var full_url = wordpress_url + '?type=SET&name=' + alias + '&alias=' + alias + '&code=' + secure;

                console.log(full_url);

                if (set_item.site_alias){
                    counter++;
                    return cb(null);
                }

                request(full_url, function (error, response, body) {
                    if (!error && response.statusCode == 200) {

                        console.log('Ответ:',body); // Show the HTML for the Google homepage.

                        if (body.indexOf('ERROR')!==-1){
                            counter++;
                            return cb(null);
                        }
                        var params = {
                            id:set_item.id,
                            site_alias:alias
                        };

                        _t.modify(params, cb);

                    }else{

                        console.log('error',error);

                        return cb(error, response);

                    }

                    counter++;
                    var percent = Math.ceil(counter * 100 / sets_count);
                    _t.user.socket.emit('pushIntoWordpressCategory',{percent:percent});
                })
            }, cb);
        }
    }, function (err) {
        if (err) return cb(err);
        cb (null, new UserOk('Проставили альясы для пакетов.'))
    });
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