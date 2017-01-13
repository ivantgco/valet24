/**
 * Created by iig on 29.10.2015.
 */
var MyError = require('../error').MyError;
var UserError = require('../error').UserError;
var UserOk = require('../error').UserOk;
var BasicClass = require('./system/BasicClass');
var util = require('util');
var api = require('../libs/api');
var async = require('async');
var rollback = require('../modules/rollback');
var request = require('request');



var Model = function(obj){
    this.name = obj.name;
    this.tableName = obj.name.toLowerCase();

    var basicclass = BasicClass.call(this, obj);
    if (basicclass instanceof MyError) return basicclass;
};
util.inherits(Model, BasicClass);

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

Model.prototype.createAliasForSite = function (obj, cb) {
    if (arguments.length == 1) {
        cb = arguments[0];
        obj = {};
    }
    if (typeof cb !== 'function') throw new MyError('В метод не передан cb');
    if (typeof obj !== 'object') return cb(new MyError('В метод не переданы obj'));
    var _t = this;

    // Сгенерируем alias
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

    var categoties = [];


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
                categoties = res;
                cb(null);
            });
        },
        pushToWordpress: function (cb) {
            var counter = 0;
            var category_count = categoties.length;
            console.log('Категорий', category_count);
            async.eachSeries(categoties, function (category, cb) {
                var alias = 'category_'+ category.id;
                var title = category.name.replace(/[^a-zA-Zа-яА-Я0-9]/ig,'_');
                if (title.length>50) title = title.substring(0, 50);
                //console.log(title);
                //return cb(null);
                var full_url = wordpress_url + '?type=CATEGORY&name=' + alias + '&alias=' + alias + '&code=' + secure;
                console.log(full_url);
                if (category.site_alias){
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
                            id:category.id,
                            site_alias:alias
                        };

                        _t.modify(params, cb);
                    }else{
                        console.log('error',error);
                        return cb(error, response);
                    }
                    counter++;
                    var percent = Math.ceil(counter * 100 / category_count);
                    _t.user.socket.emit('pushIntoWordpressCategory',{percent:percent});
                })
            }, cb);
        }
    }, function (err) {
        if (err) return cb(err);
        cb (null, new UserOk('Проставили альясы для категорий.'))
    });
};

Model.prototype.moveToCategory = function (obj, cb) {
    if (arguments.length == 1) {
        cb = arguments[0];
        obj = {};
    }
    if (typeof cb !== 'function') throw new MyError('В метод не передан cb');
    if (typeof obj !== 'object') return cb(new MyError('В метод не переданы obj'));
    var _t = this;
    var id = obj.id;
    var target_category_id = obj.target_category_id;
    if (isNaN(+id)) return cb(new MyError('Не передан id',{obj:obj}));
    if (isNaN(+target_category_id)) return cb(new MyError('Не передан target_category_id',{obj:obj}));
    var rollback_key = obj.rollback_key || rollback.create();

    // Получить товары из категории
    // Для каждого изменить категори
    // rollback.save

    var products = [];
    async.series({
        getProducts: function (cb) {
            var o = {
                command:'get',
                object:'product',
                params:{
                    param_where:{
                        category_id:id
                    },
                    collapseData:false,
                    fromServer:true
                }
            }
            _t.api(o, function (err, res) {
                if (err) return cb(new MyError('При попытке получить продукты возникла ош.',{err:err, o:o}));
                for (var i in res) {
                    products.push(res[i]);
                }
                cb(null);
            });
        },
        changeCategory: function (cb) {
            var p_count = products.length;
            var counter = 0;
            async.each(products, function (product, cb) {
                var o = {
                    command:'modify',
                    object:'product',
                    params:{
                        id:product.id,
                        category_id:target_category_id,
                        rollback_key:rollback_key,
                        fromServer:true
                    }
                }
                _t.api(o, function (err) {
                    if (err) return cb(new MyError('Не удалось переместить продукт',{err:err, o:o}));
                    counter++;
                    var percent = Math.ceil(counter * 100 / p_count);
                    _t.user.socket.emit('moveToCategory',{percent:percent});
                });
            })
        }
    }, function (err, res) {
        if (err) {
            if (err.message == 'needConfirm') return cb(err);
            rollback.rollback({rollback_key:rollback_key,user:_t.user}, function (err2) {
                return cb(err, err2);
            });
        }else{
            rollback.save({rollback_key:rollback_key, user:_t.user, name:_t.name, name_ru:_t.name_ru || _t.name, method:'moveToCategory', params:obj});
            cb(null, new UserOk('Продукты перемещены в другую категорию.', obj));
        }
    });
};


module.exports = Model;