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
var XLSX = require('xlsx');
var request = require('request');

var Model = function(obj){
    this.name = obj.name;
    this.tableName = obj.name.toLowerCase();

    var basicclass = BasicClass.call(this, obj);
    if (basicclass instanceof MyError) return basicclass;
};
util.inherits(Model, BasicClass);
Model.prototype.addPrototype = Model.prototype.add;
Model.prototype.modifyPrototype = Model.prototype.modify;

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

/**
 * Если есть category_id создаем как обычно
 * Если есть categoryS - массив ['Категория','СубКатегория','СубСубКатегория',..]
 * Ищем с первой, если нет создаем, и так далее
 *
 * Если есть уже такой товар и fromServer (import from excel) - изменяем остальные поля.
 * Modify пишет history
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
    var confirm = obj.confirm;
    var rollback_key = obj.rollback_key || rollback.create();

    var name = obj.name;
    if (!name) return cb(new UserError('Наименование обязательно для добавления товара.',{obj:obj}));
    var category_id = obj.category_id;
    var categorys = obj.categorys;
    var from_file_name = obj.from_file_name;
    var from_file_id = obj.from_file_id;
    if (!category_id && !categorys) return cb(new UserError('Необходимо указать категорию товара'));

    var product, category, new_category_id;



    async.series({
        getProduct: function (cb) {
            // Получим продукт с таким именем если есть
            var params = {
                param_where:{
                    name:name
                },
                collapseData:false
            };
            _t.get(params, function (err, res) {
                if (err) return cb(err);
                if (res.length>1) return cb(new MyError('Найдено слишком много товаров с таким именем. А имя должно быть уникально',{res:res}));
                product = res[0];
                cb(null);
            })
        },
        ifProductMergeAndModify: function (cb) {
            if (!product) return cb(null); // Продукт не обнаружен, добавляем.
            if (!obj.fromServer) return cb(new UserError('Такой товар уже имеется',{product:product}));
            // Если обнаружен, мердж и модифай
            var toModify = {};
            for (var i in product) {
                if (typeof obj[i]!=='undefined' && product[i]!==obj[i]){
                    // добавим на изменение
                    toModify[i] = obj[i];
                }
            }
            if (!Object.keys(toModify).length) return cb(new UserOk('нет изменений'));
            toModify.id = product.id;
            toModify.rollback_key = rollback_key;
            _t.modify(toModify, function (err) {
                if (err) return cb(err);
                return cb(new UserOk('Изменено успешно.',{toModify:toModify}));
            })
        },
        createCategorys: function (cb) {
            if (category_id) return cb(null); // Категория передана, идем дальше
            categorys = (typeof categorys == 'object')? categorys : categorys.split(',');
            // Для каждой категории проверим ее существование, если нет добавляем и следующую создаем с parent_id = new_category_id;
            if (!categorys.length) return cb(new MyError('Не переданы категории'));
            async.eachSeries(categorys, function (item, cb) {
                var add = function (cb) {
                    var o = {
                        command:'add',
                        object:'category',
                        params:{
                            name:item,
                            rollback_key:rollback_key
                        }
                    };
                    if (category || new_category_id){
                        o.params.parent_category_id = new_category_id || category.id;
                    }
                    _t.api(o, function (err, res) {
                        if (err) return cb(err);
                        new_category_id = res.id;
                        cb(null);
                    });
                };
                if (new_category_id) return add(cb); // Уже создавали новую категорию. соответственно все подкатегории нужно создавать (без проверки существования)
                var o = {
                    command:'get',
                    object:'category',
                    params:{
                        param_where:{
                            name:item
                        },
                        collapseData:false
                    }
                };
                if (category){
                    o.params.parent_category_id = category.id;
                }
                _t.api(o, function (err, res) {
                    if (err) return cb(new MyError('Не удалось получить категорию по имени',{err:err}));
                    if (res.length > 1) return cb(new MyError('Слишком много категорий с таким названием. Такого быть не должно.',{res:res}));
                    if (res.length == 1){
                        category = res[0];
                        return cb(null);
                    }
                    // Иначе категорию надо создать и присвоить new_category_id
                    add(cb);
                })
            }, function (err) {
                if (err) return cb(new MyError('Не удалось создать категории',{err:err}));
                cb(null);
            });
        },
        add: function (cb) {
            obj.category_id = obj.category_id || new_category_id || category.id;
            obj.rollback_key = rollback_key;
            _t.addPrototype(obj, cb);
        }
    }, function (err) {
        if (err && !(err instanceof UserOk)) {
            if (err.message == 'needConfirm') return cb(err);
            rollback.rollback(rollback_key, function (err2) {
                return cb(err, err2);
            });
        }else{
            var m = (obj.fromServer)? 'Продукт добавлен или изменен' : 'Продукт добавлен';
            cb(null, new UserOk(m,{data:err}));
        }
    })

};

/**
 * Загружает продукты из excel файла
 * @param obj
 * @param cb
 * @returns {*}
 */
Model.prototype.importFromExcel = function (obj, cb) {
    if (arguments.length == 1) {
        cb = arguments[0];
        obj = {};
    }
    var _t = this;
    var confirm = obj.confirm;
    var rollback_key = obj.rollback_key || rollback.create();

    var filename = obj.filename || 'Химия часть 1.xlsx';
    if (!filename) return cb(new UserError('Необходимо указать файл..',{obj:obj}));

    //socketQuery({command:'importFromExcel',object:'Product'}, function (err, res) {
    //    console.log(err, res);
    //});
    // Считать файл
    // Распарсить
    // Вызвать add в цикле
    var products = [];

    var workbook = XLSX.readFile('./serverUploads/' + filename);

    var first_sheet_name = workbook.SheetNames[0];
    /* Get worksheet */
    var worksheet = workbook.Sheets[first_sheet_name];

    var sheet1 = XLSX.utils.sheet_to_json(worksheet);
    for (var i in sheet1) {
        var row = sheet1[i];
        //var image_list = '';
        //for (var r in row) {
        //    if (r===row[r])
        //}
        products[i] = {
            from_file_name: filename,
            from_file_id:row.id,
            name:row.name,
            image:row['URL picture'],
            images_list:row['URL picture'] + ',' + row['Dop1'] + ',' + row['Dop2'],
            price:row['price '].replace(',',''),
            categorys:[row['Категория'],row['Подкатегория']]
        }
    }
    //console.log(products);
    async.eachSeries(products, function (product, cb) {
        var params = {
            rollback_key:rollback_key,
            fromServer:true
        };
        for (var i in product) {
            params[i] = product[i];
        }
        _t.add(params, cb);
    }, function (err) {
        if (err) {
            if (err.message == 'needConfirm') return cb(err);
            rollback.rollback(rollback_key, function (err2) {
                return cb(err, err2);
            });
        } else {
            cb(null, new UserOk('Товары успешно загружены'));
        }
    });

    return;





    var example = {
        id: '173',
        'picture ': 'IMG_3151',
        name: 'Дося ручная альпийск фреш 365гр',
        'price ': '44.00',
        'URL picture': 'http://citymarket112.usite.pro/excelimport/himiya1/2/IMG_3151.JPG',
        Dop1: 'http://citymarket112.usite.pro/excelimport/himiya1/2/IMG_3152.JPG',
        Dop2: 'http://citymarket112.usite.pro/excelimport/himiya1/2/IMG_3153.JPG',
        'Категория': 'Бытовая химия',
        'Подкатегория': 'Для стирки'
    }



    //async.series({
    //    readFile: function (cb) {
    //
    //    }
    //}, function (err) {
    //    if (err && !(err instanceof UserOk)) {
    //        if (err.message == 'needConfirm') return cb(err);
    //        rollback.rollback(rollback_key, function (err2) {
    //            return cb(err, err2);
    //        });
    //    }else{
    //        cb(null, new UserOk(''));
    //    }
    //})

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
    //    object:'Product'
    //};
    //socketQuery(o, function (err, res) {
    //    console.log(err, res);
    //});

    // Получить данные
    // Для каждого выполнить запрос push
    // Alias записать в данные

    var products = [];


    async.series({
        getDate: function (cb) {
            var params = {
                limit:100000,
                collapseData:false
            };
            _t.get(params, function (err, res) {
                if (err) return cb(err);
                products = res;
                cb(null);
            });
        },
        pushToWordpress: function (cb) {
            var counter = 0;
            var products_count = products.length;
            console.log('Продуктов', products_count);
            async.eachSeries(products, function (product, cb) {
                var alias = 'product_'+ product.id;
                var title = product.name.replace(/[^a-zA-Zа-яА-Я0-9]/ig,'_');
                if (title.length>50) title = title.substring(0, 50);
                //console.log(title);
                //return cb(null);
                var full_url = wordpress_url + '?type=PRODUCT&name=' + alias + '&alias=' + alias + '&code=' + secure;
                console.log(full_url);
                if (product.site_alias){
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
                            id:product.id,
                            site_alias:alias
                        };

                        _t.modify(params, cb);
                    }else{
                        console.log('error',error);
                        return cb(error, response);
                    }
                    counter++;
                    var percent = Math.ceil(counter * 100 / products_count);
                    _t.user.socket.emit('pushIntoWordpressProduct',{percent:percent});
                })
            }, cb);
        }
    }, function (err) {
        if (err) return cb(err);
        cb (null, new UserOk('Проставили альясы для родуктов.'))
    });
};


module.exports = Model;