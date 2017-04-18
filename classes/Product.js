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
var fs = require('fs');
var moment = require('moment');
var Guid = require('guid');

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

/**
 * Если есть category_id создаем как обычно
 * Если есть categoryS - массив ['Категория','СубКатегория','СубСубКатегория',..]
 * Ищем с первой, если нет создаем, и так далее
 *
 * Если есть уже такой товар и fromServe (import from excel) - изменяем остальные поля.
 * Modify пишет history
 * @param obj
 * @param cb
 * @private
 */
Model.prototype.add_OLD = function (obj, cb) {
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
    if (!category_id && !categorys) return cb(new UserError('Необходимо указать подкатегорию товара'));

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
            rollback.rollback({rollback_key:rollback_key,user:_t.user}, function (err2) {
                return cb(err, err2);
            });
        }else{
            var m = (!obj.fromClient)? 'Продукт добавлен или изменен' : 'Продукт добавлен';
            cb(null, new UserOk(m,{data:err}));
        }
    })

};


Model.prototype.modify_ = function (obj, cb) {
    if (arguments.length == 1) {
        cb = arguments[0];
        obj = {};
    }
    var _t = this;
    var id = obj.id;
    if (isNaN(+id)) return cb(new MyError('Не передан id',{obj:obj}));
    var rollback_key = obj.rollback_key || rollback.create();
    if (!obj.fromClient || typeof obj.name == 'undefined'){
        return _t.modifyPrototype(obj, cb);
    }
    var product, nameNotModified;
    async.series({
        get:function (cb) {
            _t.getById({id:id}, function (err, res) {
                if (err) return cb(err);
                product = res[0];
                cb(null);
            });
        },
        checkAndmodify:function (cb) {
            if (product.barcode){
                return _t.modifyPrototype(obj, cb);
            }
            nameNotModified = true;
            delete obj.name;
            _t.modifyPrototype(obj, cb);
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
            if (nameNotModified){
                res.checkAndmodify.message += '<br><span style="color:#f90d00;">Название изменено не было.</span>';
            }
            cb(null, res.checkAndmodify);
        }
    });
}

// --> Загруска category_excel:
// Получить список файлов из директории
// Считать все файлы (или указанные)
// Распарсить все в категории и продукты
// Загрузить все категории из базы
// Смерджить категории
// Добавить/изменить категории
// Загрузить продукты (возможно порциями)
// Смерджить продукты (в том числе проставить категории)
// Добавить изменить


//socketQuery({command:'importCategoryExcel',object:'Product'}, function (err, res) {
//    console.log(err, res);
//});

Model.prototype.importCategoryExcel = function (obj, cb) {
    if (arguments.length == 1) {
        cb = arguments[0];
        obj = {};
    }
    var _t = this;
    var confirm = obj.confirm;
    var rollback_key = obj.rollback_key || rollback.create();

    //var filename = obj.filename;
    //if (!filename) return cb(new UserError('Необходимо указать файл..',{obj:obj}));
    var sync_dir = './citymarket/sync/category_excel';


    var filelist = [];
    var categories = {};
    var products = {};
    var catArr = ['Подподподкатегория','Подподкатегория','Подкатегория','Категория'];
    async.series({
        getFileList:function (cb) {
            // Считать список файлов из директории
            fs.readdir(sync_dir, function (err, files) {
                if (err) return cb(new MyError('Не удалось считать файлы из директории синхронизации.',{err:err,sync_dir:sync_dir}));
                filelist = files;
                cb(null);
            });
        },
        readFiles: function (cb) {
            // Распарсить все в категории и продукты
            async.eachSeries(filelist, function (filename, cb) {
                var workbook = XLSX.readFile(sync_dir + '/' + filename);
                var first_sheet_name = workbook.SheetNames[0];
                /* Get worksheet */
                var worksheet = workbook.Sheets[first_sheet_name];
                var sheet1 = XLSX.utils.sheet_to_json(worksheet);
                for (var i in sheet1) {
                    var row = sheet1[i];
                    row['picture'] = row['picture'] || row['picture '];
                    row.counter = 1;
                    if (!row['picture '] || !(row['Подподподкатегория'] || row['Подподкатегория'] || row['Подкатегория'] || row['Категория'])) continue;
                    (function setProduct(){
                        if (products[row['picture']]){
                            row['picture'] = row['picture'] + ' ('+ ++row.counter +')';
                            setProduct();
                        }else{
                            products[row['picture']] = {
                                image:row['picture'],
                                category_name:row['Подподподкатегория'] || row['Подподкатегория'] || row['Подкатегория'] || row['Категория']
                            }
                        }
                    })();

                    //products.push(
                    //    {
                    //        image:row['picture'],
                    //        category_name:row['Подподподкатегория'] || row['Подподкатегория'] || row['Подкатегория'] || row['Категория']
                    //    }
                    //)

                    for (var catIndex in catArr) {
                        var cat = row[catArr[catIndex]];
                        var parent_cat = row[catArr[+catIndex +1]];
                        if (typeof cat =='undefined') continue
                        if (!categories[cat]){
                            var c = {
                                name: cat,
                                deep:catArr.length - catIndex
                            }
                            if (parent_cat) c.parent_category = parent_cat;
                            categories[cat] = c;
                        }
                    }
                }
                cb(null);
            }, cb);
        },
        loadAllCategoriesAndMerge: function (cb) {
            // Загрузить все категории из базы
            // Смерджить категории
            var t1 = moment();
            var o = {
                command:'get',
                object:'category',
                params:{
                    collapseData:false,
                    limit:1000000
                }
            }
            _t.api(o, function (err, res) {
                if (err) return cb(new MyError('При получении всех категорий возникла ошибка.',{o:o, err:err}));
                for (var i in res) {
                    if (categories[res[i].name]) {
                        categories[res[i].name].parent_category_id = res[i].parent_category_id;
                        categories[res[i].name].id = res[i].id;
                    }else{
                        categories[res[i].name] = {
                            id:res[i].id,
                            name:res[i].name,
                            parent_category_id:res[i].parent_category_id,
                            parent_category:res[i].parent_category,
                            deep:res[i].deep,
                            added:true
                        }
                    }
                }
                cb(null);
            })
        },
        addNewCategories: function (cb) {
            // Добавим новые категории (по глубине вложенности)
            var deeps = Object.keys(catArr);
            async.eachSeries(deeps, function (deep, cb) {
                deep++;
                async.eachSeries(Object.keys(categories), function (catKey, cb) {
                    var category = categories[catKey];
                    if (category.id || category.deep!=deep /*|| category.name == 'Алкоголь'*/) return cb(null); // Либо не надо добавлять, либо не та глубина
                    var o = {
                        command:'add',
                        object:'category',
                        params:{
                            name:category.name,
                            deep:category.deep,
                            is_active:true,
                            rollback_key:rollback_key
                        }
                    }
                    if (category.deep == 1) o.params.is_root = true;
                    var parentCategory = categories[category.parent_category];
                    if (parentCategory){
                        if (parentCategory.id) {
                            o.params.parent_category_id = parentCategory.id;
                            category.parent_category_id = parentCategory.id;
                        }
                    }
                    _t.api(o, function (err, res) {
                        if (err) return cb(new MyError('При добавлении новой категории возникла ош.',{o:o, err:err}));
                        category.id = res.id;
                        category.added = true;
                        cb(null);
                    });

                }, cb);

            }, cb);
        },
        modifyCategories: function (cb) {
            // Обновим существующие если нужно (появился родитель)
            async.eachSeries(Object.keys(categories), function (catKey, cb) {
                var category = categories[catKey];
                if (!category.id || category.added || category.parent_category_id || !category.parent_category) return cb(null); // Ничего менять не надо
                var parentCategory = categories[category.parent_category];
                if (!parentCategory) return cb(null); // Нет такой родительской категории
                if (!parentCategory.id) return cb(null); // Родительский элемент пока не появился
                var o = {
                    command:'modify',
                    object:'category',
                    params:{
                        id:category.id,
                        parent_category_id:parentCategory.id,
                        rollback_key:rollback_key
                    }
                }
                _t.api(o, function (err, res) {
                    if (err) return cb(new MyError('При изменении категории возникла ош.',{o:o, err:err}));
                    category.parent_category_id = parentCategory.id;
                    console.log('ИЗМЕНЕНА КАТЕГОРИЯ: ', category.name);
                    cb(null);
                });

            }, cb);
        },
        loadAllProductsAndMerge: function (cb) {
            // Загрузить все товары
            // Смерджить товары
            var params = {
                collapseData:false,
                limit:1000000
            };
            _t.get(params, function (err, res) {
                if (err) return cb(new MyError('При получении всех товаров возникла ошибка.',{o:o, err:err}));
                for (var i in res) {

                    var product = products[res[i].image];
                    if (product){
                        product.id = res[i].id;
                        var product_category = categories[product.category_name];
                        if (!res[i].category_id && product_category){
                            if (product_category.id) {
                                product.category_id = product_category.id;
                                product.to_modify = true;
                            }
                        }
                    }
                }
                cb(null);
            });
        },
        addNewProduct: function (cb) {
            async.eachSeries(Object.keys(products), function (prodKey, cb) {
                var product = products[prodKey];
                if (product.id) return cb(null); // Уже есть в базе

                var params = {
                    image:product.image,
                    rollback_key:rollback_key
                };

                var productCategory = categories[product.category_name];
                if (productCategory){
                    if (productCategory.id) {
                        params.category_id = productCategory.id;
                        product.category_id = productCategory.id;
                    }
                }
                _t.add(params, function (err, res) {
                    if (err) return cb(new MyError('При добавлении товара возникла ош.',{o:o, err:err}));
                    product.id = res.id;
                    product.added = true;
                    cb(null);
                });

            }, cb);
        },
        modifyProducts: function (cb) {
            // Обновим существующие если нужно (появилась категория)
            async.eachSeries(Object.keys(products), function (prodKey, cb) {
                var product = products[prodKey];
                if (!product.id || !product.to_modify) return cb(null); // Ничего менять не надо
                var params = {
                    id:product.id,
                    category_id:product.category_id,
                    rollback_key:rollback_key
                };
                _t.modify(params, function (err, res) {
                    if (err) return cb(new MyError('При изменении товара возникла ош.',{o:o, err:err}));
                    product.category_id = product.category_id;
                    console.log('Продукт изменен: ', product.image);
                    cb(null);
                });
            }, cb);
        },
        createWPpage: function (cb) {
            var o = {
                command:'pushIntoWordpress',
                object:'category',
                params:{
                }
            }
            _t.api(o, cb);
        }
    }, function (err) {
        if (err) {
            if (err.message == 'needConfirm') return cb(err);
            if (err instanceof UserOk || err instanceof UserError){
                //err.data.count = 0;
                return cb(null, err)
            }
            rollback.rollback({rollback_key:rollback_key,user:_t.user}, function (err2) {
                return cb(err, err2);
            });
        }else{
            cb(null, new UserOk('Ok.'));
        }
    });
};


//socketQuery({command:'importImageExcel',object:'Product'}, function (err, res) {
//    console.log(err, res);
//});
Model.prototype.importImageExcel = function (obj, cb) {
    if (arguments.length == 1) {
        cb = arguments[0];
        obj = {};
    }
    var _t = this;
    var confirm = obj.confirm;
    var rollback_key = obj.rollback_key || rollback.create();

    //var filename = obj.filename;
    //if (!filename) return cb(new UserError('Необходимо указать файл..',{obj:obj}));
    var sync_dir = './citymarket/sync/image_excel';


    var filelist = [];
    var products = {};
    async.series({
        getFileList:function (cb) {
            // Считать список файлов из директории
            fs.readdir(sync_dir, function (err, files) {
                if (err) return cb(new MyError('Не удалось считать файлы из директории синхронизации.',{err:err,sync_dir:sync_dir}));
                filelist = files;
                cb(null);
            });
        },
        readFiles: function (cb) {
            // Распарсить все продукты
            async.eachSeries(filelist, function (filename, cb) {
                var workbook = XLSX.readFile(sync_dir + '/' + filename);
                var first_sheet_name = workbook.SheetNames[0];
                /* Get worksheet */
                var worksheet = workbook.Sheets[first_sheet_name];
                var sheet1 = XLSX.utils.sheet_to_json(worksheet);
                for (var i in sheet1) {
                    var row = sheet1[i];
                    row['picture'] = row['# основного фото'] || row['Фото 1'];
                    row['barcode'] = row['Штрих'];

                    if (typeof row['picture'] !=='string' || isNaN(+row['barcode']) || !row['barcode']) {
                        console.log('picture', row['picture']);
                        console.log('barcode', row['barcode']);
                        continue;
                    }
                    row['picture'] = row['picture'].replace(/\s+.*/ig,''); // только одно изображение
                    // Добавим нули в начале до 13 символов в штрихкоде
                    row['barcode'] = row['barcode'].length<13?row['barcode']=Array(13+1).join('0').replace(RegExp(".{"+row['barcode'].length+"}$"),row['barcode']):row['barcode'];

                    if (products[row['picture']]) {
                        continue;
                    } // Игнорим с таким же изображением

                    products[row['picture']] = {
                        image:row['picture'],
                        barcode:row['barcode']
                    }
                }
                cb(null);
            }, cb);
        },
        loadAllProductsAndMerge: function (cb) {
            // Загрузить все товары
            // Смерджить товары
            var params = {
                collapseData:false,
                limit:1000000
            };
            _t.get(params, function (err, res) {
                if (err) return cb(new MyError('При получении всех товаров возникла ошибка.',{o:o, err:err}));
                for (var i in res) {

                    var product = products[res[i].image];
                    if (product){
                        product.id = res[i].id;
                        if (!res[i].barcode && product.barcode){
                            product.to_modify = true;
                        }
                    }
                }
                cb(null);
            });
        },
        addNewProduct: function (cb) {
            async.eachSeries(Object.keys(products), function (prodKey, cb) {
                var product = products[prodKey];
                if (product.id) return cb(null); // Уже есть в базе

                var params = {
                    image:product.image,
                    barcode:product.barcode,
                    rollback_key:rollback_key
                };
                _t.add(params, function (err, res) {
                    if (err) return cb(new MyError('При добавлении товара возникла ош.',{o:o, err:err}));
                    product.id = res.id;
                    product.added = true;
                    cb(null);
                });

            }, cb);
        },
        modifyProducts: function (cb) {
            // Обновим существующие если нужно (появилась категория)
            async.eachSeries(Object.keys(products), function (prodKey, cb) {
                var product = products[prodKey];
                if (!product.id || !product.to_modify) return cb(null); // Ничего менять не надо
                var params = {
                    id:product.id,
                    barcode:product.barcode,
                    rollback_key:rollback_key
                };
                _t.modify(params, function (err, res) {
                    if (err) return cb(new MyError('При изменении товара возникла ош.',{o:o, err:err}));
                    console.log('Продукт изменен: ', product.barcode);
                    cb(null);
                });
            }, cb);
        },
    }, function (err) {
        if (err) {
            if (err.message == 'needConfirm') return cb(err);
            if (err instanceof UserOk || err instanceof UserError){
                //err.data.count = 0;
                return cb(null, err)
            }
            rollback.rollback({rollback_key:rollback_key,user:_t.user}, function (err2) {
                return cb(err, err2);
            });
        }else{
            cb(null, new UserOk('Ok.',{product_counts:Object.keys(products).length}));
        }
    });

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
            rollback_key:rollback_key
        };
        for (var i in product) {
            params[i] = product[i];
        }
        _t.add(params, cb);
    }, function (err) {
        if (err) {
            if (err.message == 'needConfirm') return cb(err);
            rollback.rollback({rollback_key:rollback_key,user:_t.user}, function (err2) {
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


Model.prototype.importCurrentExcelByBarcode = function (obj, cb) {
    if (arguments.length == 1) {
        cb = arguments[0];
        obj = {};
    }
    var _t = this;
    var confirm = obj.confirm;
    var rollback_key = obj.rollback_key || rollback.create();

    //var filename = obj.filename;
    //if (!filename) return cb(new UserError('Необходимо указать файл..',{obj:obj}));
    var sync_dir = './citymarket/sync/excel/';
    var excel_filename = obj.excel_filename || 'PRODUCTS_REARY_TO_IMPORT_08122016_0147.xls';


    var filelist = [];
    var categories = {};
    var products = {};
    var products_by_image = {};


    var products_by_name = {};
    var catArr = ['subsubcategory','subcategory','category'];
    var shop;
    var product_count = 0;
    var product_counter = 0;
    async.series({
        getShop: function (cb) {
            var o = {
                command:'get',
                object:'shop',
                params:{
                    param_where:{
                        is_current:true
                    },
                    collapseData:false
                }
            };
            _t.api(o, function (err, res) {
                if (err) return cb(new MyError('При попытке получить текущий магазин произошла ош.',{o:o, err:err}));
                if (!res.length) return cb(new UserError('Не удалось получить текущий магазин. Выставите ткущий магазин.'));
                shop = res[0];
                cb(null);
            })
        },
        readFromFile: function (cb) {
            var workbook = XLSX.readFile(sync_dir + excel_filename);
            var first_sheet_name = workbook.SheetNames[0];
            /* Get worksheet */
            var worksheet = workbook.Sheets[first_sheet_name];
            var sheet1 = XLSX.utils.sheet_to_json(worksheet);
            for (var i in sheet1) {
                var row = sheet1[i];
                if (typeof row['category'] == 'string') row['category'] = row['category'].trim();
                if (typeof row['subcategory'] == 'string') row['subcategory'] = row['subcategory'].trim();
                if (typeof row['subsubcategory'] == 'string') row['subsubcategory'] = row['subsubcategory'].trim();


                row['name'] = (typeof row['name'] == 'string')? row['name'].trim() : '';
                row['barcode'] = row['barcode'] || '';
                row['image_alias'] = row['image_alias'] || row['image'] || '';
                row['excel_alias'] = row['image'] || '';
                row['category_name'] = row['subsubcategory'] || row['subcategory'] || row['category'];
                row['category_alias'] = row['category_alias'] || '';

                if (!row['barcode']) {
                    row['barcode'] = Guid.create().value;
                    row.no_barcode = true;
                }else{
                    // Добавим нули в начале до 13 символов в штрихкоде
                    row['barcode'] = row['barcode'].length<13?row['barcode']=Array(13+1).join('0').replace(RegExp(".{"+row['barcode'].length+"}$"),row['barcode']):row['barcode'];
                }

                //row['picture'] = row['picture'].replace(/\s+.*/ig,''); // только одно изображение


                products[row['barcode']] = {
                    barcode:row['barcode'],
                    name:row['name'],
                    image:row['image_alias'],
                    excel_alias:row['excel_alias'],
                    category_name:row['category_name'],
                    category_alias:row['category_alias'],
                    no_barcode:row.no_barcode
                };

                if (row.no_barcode){
                    if (row['image_alias']){
                        products_by_image[row['image_alias']] = {
                            barcode:row['barcode'],
                            name:row['name'],
                            image:row['image_alias'],
                            excel_alias:row['excel_alias'],
                            category_name:row['category_name'],
                            category_alias:row['category_alias'],
                            no_barcode:row['no_barcode']
                        }
                    }

                    if (row['name']) {
                        products_by_name[row['name']] = {
                            barcode: row['barcode'],
                            name: row['name'],
                            image: row['image_alias'],
                            excel_alias: row['excel_alias'],
                            category_name: row['category_name'],
                            category_alias: row['category_alias'],
                            no_barcode: row['no_barcode']
                        }
                    }
                }

                for (var catIndex in catArr) {
                    var cat = row[catArr[catIndex]];
                    var parent_cat = row[catArr[+catIndex +1]];
                    if (typeof cat =='undefined') continue
                    if (!categories[cat]){
                        var c = {
                            name: cat,
                            deep:catArr.length - catIndex
                        }
                        if (parent_cat) c.parent_category = parent_cat;
                        categories[cat] = c;
                    }
                }
            }
            cb(null);
        },
        loadAllCategoriesAndMerge: function (cb) {
            // Загрузить все категории из базы
            // Смерджить категории
            var t1 = moment();
            var o = {
                command:'get',
                object:'category',
                params:{
                    param_where:{
                        shop_id:shop.id
                    },
                    collapseData:false,
                    limit:1000000
                }
            }
            _t.api(o, function (err, res) {
                if (err) return cb(new MyError('При получении всех категорий возникла ошибка.',{o:o, err:err}));
                for (var i in res) {
                    if (categories[res[i].name]) {
                        categories[res[i].name].parent_category_id = res[i].parent_category_id;
                        categories[res[i].name].id = res[i].id;
                    }else{
                        categories[res[i].name] = {
                            id:res[i].id,
                            name:res[i].name,
                            parent_category_id:res[i].parent_category_id,
                            parent_category:res[i].parent_category,
                            deep:res[i].deep,
                            added:true
                        }
                    }
                }
                cb(null);
            })
        },
        addNewCategories: function (cb) {
            // Добавим новые категории (по глубине вложенности)
            var deeps = Object.keys(catArr);
            async.eachSeries(deeps, function (deep, cb) {
                deep++;
                async.eachSeries(Object.keys(categories), function (catKey, cb) {
                    var category = categories[catKey];
                    if (category.id || category.deep!=deep /*|| category.name == 'Алкоголь'*/) return cb(null); // Либо не надо добавлять, либо не та глубина
                    var o = {
                        command:'add',
                        object:'category',
                        params:{
                            name:category.name,
                            deep:category.deep,
                            is_active:true,
                            shop_id:shop.id,
                            rollback_key:rollback_key
                        }
                    }
                    if (category.deep == 1) o.params.is_root = true;
                    var parentCategory = categories[category.parent_category];
                    if (parentCategory){
                        if (parentCategory.id) {
                            o.params.parent_category_id = parentCategory.id;
                            category.parent_category_id = parentCategory.id;
                        }
                    }
                    _t.api(o, function (err, res) {
                        if (err) return cb(new MyError('При добавлении новой категории возникла ош.',{o:o, err:err}));
                        category.id = res.id;
                        category.added = true;
                        cb(null);
                    });

                }, cb);

            }, cb);
        },
        modifyCategories: function (cb) {
            // Обновим существующие если нужно (появился родитель)
            async.eachSeries(Object.keys(categories), function (catKey, cb) {
                var category = categories[catKey];
                if (!category.id || category.added || category.parent_category_id || !category.parent_category) return cb(null); // Ничего менять не надо
                var parentCategory = categories[category.parent_category];
                if (!parentCategory) return cb(null); // Нет такой родительской категории
                if (!parentCategory.id) return cb(null); // Родительский элемент пока не появился
                var o = {
                    command:'modify',
                    object:'category',
                    params:{
                        id:category.id,
                        parent_category_id:parentCategory.id,
                        rollback_key:rollback_key
                    }
                }
                _t.api(o, function (err, res) {
                    if (err) return cb(new MyError('При изменении категории возникла ош.',{o:o, err:err}));
                    category.parent_category_id = parentCategory.id;
                    console.log('ИЗМЕНЕНА КАТЕГОРИЯ: ', category.name);
                    cb(null);
                });

            }, cb);
        },
        loadAllProductsAndMerge: function (cb) {
            // Загрузить все товары
            // Смерджить товары
            var params = {
                param_where:{
                    shop_id:shop.id
                },
                collapseData:false,
                limit:1000000
            };
            _t.get(params, function (err, res) {
                if (err) return cb(new MyError('При получении всех товаров возникла ошибка.',{o:o, err:err}));
                for (var i in res) {

                    var product = products[res[i].barcode];
                    if (!product && products_by_image[res[i].image]){
                        product = products[products_by_image[res[i].image].barcode];
                    }
                    if (!product && products_by_name[res[i].name]){
                        product = products[products_by_name[res[i].name].barcode];
                    }


                    if (product){

                        product.id = res[i].id;
                        product.to_modify = [];
                        var product_category = categories[product.category_name];
                        if (!res[i].category_id && product_category){
                            if (product_category.id) {
                                product.category_id = product_category.id;
                                product.to_modify.push('category_id');
                            }
                        }
                        if (!res[i].name && product.name){
                                product.to_modify.push('name');
                        }
                        if (!res[i].image && product.image){
                            product.to_modify.push('image');
                        }

                    }
                }
                product_count = Object.keys(products).length + Object.keys(products_by_image).length;
                cb(null);
            });
        },
        addNewProductAndSkipSyncStatus: function (cb) {
            async.eachSeries(Object.keys(products), function (prodKey, cb) {
                var product = products[prodKey];
                if (product.id) return cb(null); // Уже есть в базе
                if (!product.name && product.no_barcode && !product.image) return cb(null);

                //products[row['barcode']] = {
                //    barcode:row['barcode'],
                //    image:row['image_alias'],
                //    excel_alias:row['excel_alias'],
                //    category_name:row['category_name'],
                //    category_alias:row['category_alias']
                //}

                var params = {
                    name:product.name || '',
                    barcode:(!product.no_barcode)?product.barcode : '',
                    image:product.image,
                    excel_alias:product.excel_alias,
                    category_alias:product.category_alias,
                    shop_id:shop.id,
                    rollback_key:rollback_key
                };

                var productCategory = categories[product.category_name];
                if (productCategory){
                    if (productCategory.id) {
                        params.category_id = productCategory.id;
                        product.category_id = productCategory.id;
                    }
                }
                async.series({
                    add: function (cb) {
                        _t.add(params, function (err, res) {
                            if (err) {
                                return cb(new MyError('При добавлении товара возникла ош.',{params:params, err:err}));
                            }
                            product.id = res.id;
                            product.added = true;
                            product_counter++;
                            var percent = Math.ceil(product_counter * 100 / product_count);
                            _t.user.socket.emit('addProduct',{percent:percent});
                            cb(null);
                        });
                    },
                    skipSyncStatus: function (cb) {
                        var sync_file_item_ids = [];
                        async.series({
                            getId: function (cb) {
                                var o = {
                                    command:'get',
                                    object:'sync_file_item',
                                    params:{
                                        where:[
                                            {
                                                key:'status_sysname',
                                                type:'<>',
                                                val1:'NEW'
                                            }
                                        ],
                                        collapseData:false,
                                        rollback_key:rollback_key
                                    }
                                }
                                if (!product.no_barcode){
                                    o.params.where.push({
                                        key:'barcode',
                                        val1:product.barcode
                                    })
                                }else{
                                    o.params.where.push({
                                        key:'name',
                                        val1:product.name
                                    })
                                }
                                _t.api(o, function (err, res) {
                                    if (err) return cb(new MyError('Ошибка при получении sync_file_item по ключевому полю',{err:err,o:o}));
                                    if (!res.length) {
                                        return cb(null);
                                    }
                                    for (var i in res) {
                                        sync_file_item_ids.push(res[i].id);
                                    }
                                    cb(null);
                                })
                            },
                            skipStatus: function (cb) {
                                if (!sync_file_item_ids.length) return cb(null);
                                async.eachSeries(sync_file_item_ids, function (id, cb) {
                                    var o = {
                                        command:'modify',
                                        object:'sync_file_item',
                                        params:{
                                            id:id,
                                            status_sysname:'NEW',
                                            rollback_key:rollback_key
                                        }
                                    }
                                    _t.api(o, function (err, res) {
                                        if (err) return cb(new MyError('Не удалось обнулить статус для sync_file_item',{err:err, o:o, prodKey:prodKey}));
                                        cb(null);
                                    })
                                }, cb);

                            }
                        },cb);


                    }
                },cb);


            }, cb);
        },
        modifyProducts: function (cb) {
            // Обновим существующие если нужно (появилась категория)
            async.eachSeries(Object.keys(products), function (prodKey, cb) {
                var product = products[prodKey];
                if (!product.id || !product.to_modify) return cb(null); // Ничего менять не надо
                if (!product.to_modify.length) return cb(null);
                var params = {
                    id:product.id,
                    //name:product.name || '',
                    //barcode:(!product.no_barcode)?product.barcode : '',
                    //image:product.image,
                    //excel_alias:product.excel_alias,
                    //category_alias:product.category_alias,
                    //category_id:product.category_id,
                    rollback_key:rollback_key
                };
                for (var i in product.to_modify) {
                    params[product.to_modify[i]] = product[product.to_modify[i]];
                }
                _t.modify(params, function (err, res) {
                    if (err) return cb(new MyError('При изменении товара возникла ош.',{o:o, err:err}));
                    product.category_id = product.category_id;
                    console.log('Продукт изменен: ', product.id ,product.name, product.barcode);
                    product_counter++;
                    var percent = Math.ceil(product_counter * 100 / product_count);
                    _t.user.socket.emit('addProduct',{percent:percent});
                    cb(null);
                });
            }, cb);
        },
        //createWPpage: function (cb) {
        //    var o = {
        //        command:'pushIntoWordpress',
        //        object:'category',
        //        params:{
        //        }
        //    }
        //    _t.api(o, cb);
        //}
    }, function (err) {
        if (err) {
            if (err.message == 'needConfirm') return cb(err);
            if (err instanceof UserOk || err instanceof UserError){
                //err.data.count = 0;
                return cb(null, err)
            }
            rollback.rollback({rollback_key:rollback_key,user:_t.user}, function (err2) {
                return cb(err, err2);
            });
        }else{
            cb(null, new UserOk('Ok.'));
        }
    });
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
    [{"key":"shop_sysname","val1":"PROFSOJUZNAJA"}]

    var products = [];


    async.series({
        getDate: function (cb) {
            var params = {
                where:[
                    {
                        key:'site_alias',
                        type:'isNull'
                    }
                ],
                limit:10000000,
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

Model.prototype.updateSitePrice = function (obj, cb) {
    if (arguments.length == 1) {
        cb = arguments[0];
        obj = {};
    }
    var _t = this;
    var params = {
        procedureName:'update_product_sale_price'
    }
    _t.execProcedure(params, cb);
};

Model.prototype.setNotActive = function (obj, cb) {
    if (arguments.length == 1) {
        cb = arguments[0];
        obj = {};
    }
    var _t = this;
    var params = {
        procedureName:'set_product_not_active'
    }
    _t.execProcedure(params, cb);
};

//4606272022113
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