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
var excelParser = require('excel-parser');

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
                    if (category){
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

    var filename = obj.filename;
    if (!filename) return cb(new UserError('Необходимо указать файл..',{obj:obj}));

    // Считать файл
    // Распарсить
    // Вызвать add в цикле

    excelParser.worksheets({
        inFile: 'my_file.in'
    }, function(err, worksheets){
        if(err) console.error(err);
        console.log(worksheets);
    });


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


module.exports = Model;