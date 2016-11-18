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

Model.prototype.apply_category = function (obj, cb) {
    if (arguments.length == 1) {
        cb = arguments[0];
        obj = {};
    }
    var _t = this;
    //var ids = obj.id || obj.ids;
    //if (!ids) return cb(new MyError('id обязателен для метода'));
    //if (!Array.isArray(ids)) ids = [ids];
    var rollback_key = obj.rollback_key || rollback.create();

    var limitSyncCategories = obj.limitSyncCategories || 1000;
    // Загрузить все категории которые еще не были применены limit limitSyncCategories
    // Загрузить из основной таблицы категорий по ext_id
    // Применить к категориям sync_category
    // Построить дерево категорий
    // Рукурсивно Новые загрузить, старые обновить
    // При этом проставить реальные зависимости по ext_id и правильный is_root
    // Вернуть количество

    var syncCategories, categories;
    var syncCategory_ids = [];
    var categoryTree = {};
    async.series({
        getSyncCategories: function (cb) {
            // Загрузить все категории которые еще не были применены limit 100
            var params = {
                param_where:{
                    is_product:false,
                    status_sysname:'NEW'
                },
                collapseData:false,
                limit:limitSyncCategories
            };
            _t.get(params, function (err, res) {
                if (err) return cb(new MyError('Не удалось получить список категорий для загрузки.',{err:err}));
                syncCategories = res;
                for (var i in syncCategories) {
                    syncCategory_ids.push(syncCategories[i].ext_id);
                }
                if (!syncCategory_ids.length) return cb(new UserOk('Нет записей для применения'));
                cb(null);
            });
        },
        getCategories: function (cb) {
            var o = {
                command:'get',
                object:'category',
                params:{
                    where:[
                        {
                            key:'ext_id',
                            type:'in',
                            val1:syncCategory_ids.join(',')
                        }
                    ],
                    collapseData:false
                }
            }
            _t.api(o, function (err, res) {
                if (err) return cb(new MyError('При получении категорий по заданным параметрам возникла ош.',{o:o, err:err}));
                categories = res;
                cb(null);
            })
        },
        //mergeCategoryAndCreateTree
        mergeCategory: function (cb) {
            var excludeToModify = ['to_modify','created','updated','published','deleted','deleted_by_user_id','remove_comment','created_by_user_id','self_company_id','ext_company_id']
            for (var i in categories) {
                var cat = categories[i];
                for (var j in syncCategories) {
                    var sync_cat = syncCategories[j];
                    sync_cat.is_root = !+sync_cat.parent_category_cod;
                    sync_cat.is_active = true;
                    if (cat.ext_id == sync_cat.ext_id){
                        sync_cat.is_modify = true;
                        for (var k in cat) {
                            if (excludeToModify.indexOf(k)!=-1) continue;
                            if (k == 'id'){
                                sync_cat.cat_id = cat.id;
                                continue;
                            }
                            if (cat[k] != sync_cat[k] && typeof sync_cat[k] != 'undefined'){
                                if (!sync_cat.to_modify) sync_cat.to_modify = [];
                                //sync_cat[k] = cat[k];
                                sync_cat[k] = (typeof sync_cat[k] != 'undefined')? sync_cat[k] : cat[k];
                                sync_cat.to_modify.push(k);
                            }
                        }
                    }
                }
            }
            cb(null);
        },
        addNew: function (cb) {
            // Для каждой
            // Поищем по имени, если есть то загрузим и отправим в toModify
            // Если нет, то добавим
            // После добавления поищем кто на нее ссылаается и проставим parent_id
            async.eachSeries(Object.keys(syncCategories), function (cat_key, cb) {
                var sync_cat = syncCategories[cat_key];
                if (sync_cat.is_modify) return cb(null); // Уже есть, отправим на изменение
                var o = {
                    command:'get',
                    object:'category',
                    params:{
                        param_where:{
                            name:sync_cat.name
                        },
                        limit:1,
                        collapseData:false
                    }
                }
                // Поищем по имени, если есть то загрузим и отправим в toModify
                _t.api(o, function (err, res) {
                    if (err) return cb(new MyError('При получении категории по имени возникла ош.',{o:o, err:err}));
                    if (res.length) {
                        sync_cat.image = res[0].image;
                        //for (var i in res[0]) {
                        //    if (i == 'id') {
                        //        sync_cat.cat_id = res[0].id;
                        //        continue;
                        //    }
                        //    sync_cat[i] = (typeof sync_cat[i]==='undefined')? res[0][i] : (function () {
                        //        if (!sync_cat.to_modify) sync_cat.to_modify = [];
                        //        sync_cat.to_modify.push(i);
                        //        return sync_cat[i];
                        //    })();
                        //}
                        //return cb(null);
                    }
                    // Если не нашли то добавим и проставим связи
                    var o = {
                        command:'add',
                        object:'category',
                        params:{
                            ext_id:sync_cat.ext_id,
                            parent_ext_category_id:sync_cat.parent_category_cod,
                            name:sync_cat.name,
                            is_active:true,
                            rollback_key:rollback_key,
                            fromClient:false,
                            fromServer:true
                        }
                    }
                    if (sync_cat.parent_category_cod == 0) o.params.is_root = true;
                    //for (var i in sync_cat) {
                    //    if (typeof sync_cat[i] == 'object') continue;
                    //    o.params[i] = sync_cat[i];
                    //}
                    _t.api(o, function (err, res) {
                        if (err) return cb(new MyError('При добавлении новой категории возникла ошибка.',{o:o, err:err}));
                        sync_cat.cat_id = res.id;

                        async.series({
                            updateParent: function (cb) {
                                // Если родитель уже загружен, то выставим его
                                var o = {
                                    command:'get',
                                    object:'category',
                                    params:{
                                        param_where:{
                                            ext_id: sync_cat.parent_category_cod
                                        },
                                        collapseData:false,
                                        limit:1
                                    }
                                };
                                _t.api(o, function (err, res) {
                                    if (err) return cb(new MyError('При попытке получить родительскую категории для новосозданной, возникла ош.',{o:o, err:err}));
                                    if (!res.length) return cb(null); // Нет родительского
                                    var parent_cat = res[0];
                                    if (sync_cat.parent_category_id == parent_cat.id) return cb(null);
                                    var o = {
                                        command:'modify',
                                        object:'category',
                                        params:{
                                            id: sync_cat.cat_id,
                                            parent_category_id:parent_cat.id,
                                            rollback_key:rollback_key,
                                            fromClient:false,
                                            fromServer:true
                                        }
                                    };
                                    _t.api(o, function (err, res) {
                                        if (err) return cb(new MyError('При попытке установить родительскую категорию для новосозданной возникла ош.', {o:o,err:err}));
                                        cb(null);
                                    });
                                });
                            },
                            updateChild: function (cb) {
                                // Теперь поищем зависящие от нее и проставим им parent_id
                                var o = {
                                    command:'get',
                                    object:'category',
                                    params:{
                                        param_where:{
                                            parent_ext_category_id: sync_cat.ext_id
                                        },
                                        collapseData:false,
                                        limit:100000
                                    }
                                };
                                _t.api(o, function (err, res) {
                                    if (err) return cb(new MyError('При попытке получить дочернии категории для новосозданной, возникла ош.',{o:o, err:err}));
                                    if (!res.length) return cb(null); // Нет дочерних
                                    async.eachSeries(Object.keys(res), function (key, cb) {
                                        var child_cat = res[key];
                                        if (sync_cat.parent_category_id == child_cat.id) return cb(null);
                                        var o = {
                                            command:'modify',
                                            object:'category',
                                            params:{
                                                id: child_cat.id,
                                                parent_category_id:sync_cat.cat_id,
                                                rollback_key:rollback_key,
                                                fromClient:false,
                                                fromServer:true
                                            }
                                        };
                                        _t.api(o, function (err, res) {
                                            if (err) {
                                                return cb(new MyError('При попытке установить родительскую категорию после добавления новой возникла ош.', {o:o,err:err}));
                                            }
                                            cb(null);
                                        });
                                    }, cb);
                                });
                            },
                            modifyStatus: function (cb) {
                                var params = {
                                    id:sync_cat.id,
                                    status_sysname:'APPLIED',
                                    rollback_key:rollback_key,
                                    fromClient:false,
                                    fromServer:true
                                }
                                _t.modify(params, function (err) {
                                    if (err) return cb(new MyError('При изменении статуса записи sync_item возникла ош.', {params:params, err:err}));
                                    cb(null);
                                });
                            }
                        },cb);

                    });
                })
            }, cb);
        },
        modifyExist: function (cb) {
            async.eachSeries(Object.keys(syncCategories), function (cat_key, cb) {
                var sync_cat = syncCategories[cat_key];
                if (!sync_cat.is_modify) return cb(null); // Были добавлены в систему. Они новые
                if (!sync_cat.to_modify){
                    // обновим статус и выйдем
                    var params = {
                        id:sync_cat.id,
                        status_sysname:'APPLIED',
                        rollback_key:rollback_key,
                        fromClient:false,
                        fromServer:true
                    }
                    _t.modify(params, function (err) {
                        if (err) return cb(new MyError('При изменении статуса записи sync_item возникла ош.', {params:params, err:err}));
                        cb(null);
                    });
                    return;
                }
                //name,parent_category, ext_id
                //created,updated,deleted,published,created_by_user_id
                var o = {
                    command:'modify',
                    object:'category',
                    params:{
                        id: sync_cat.cat_id,
                        //name:sync_cat.name,
                        //parent_category_id:sync_cat.parent_category_id,
                        //parent_ext_category_id:sync_cat.parent_ext_category_id,
                        //is_active:true,
                        //ext_id:sync_cat.ext_id,
                        //is_root:sync_cat.is_root,
                        rollback_key:rollback_key,
                        fromClient:false,
                        fromServer:true
                    }
                };
                for (var i in sync_cat.to_modify) {
                    o.params[sync_cat.to_modify[i]] = sync_cat[sync_cat.to_modify[i]];
                }
                _t.api(o, function (err, res) {
                    if (err) return cb(new MyError('При попытке обновить существующую категорию на основе записи из файла произошла ош.', {o:o,err:err}));
                    async.series({
                        updateParent: function (cb) {
                            // Если родитель уже загружен, то выставим его
                            var o = {
                                command:'get',
                                object:'category',
                                params:{
                                    param_where:{
                                        ext_id: sync_cat.parent_category_cod
                                    },
                                    collapseData:false,
                                    limit:1
                                }
                            };
                            _t.api(o, function (err, res) {
                                if (err) return cb(new MyError('При попытке получить родительскую категории для новосозданной, возникла ош.',{o:o, err:err}));
                                if (!res.length) return cb(null); // Нет родительского
                                var parent_cat = res[0];
                                if (sync_cat.parent_category_id == parent_cat.id) return cb(null);
                                var o = {
                                    command:'modify',
                                    object:'category',
                                    params:{
                                        id: sync_cat.cat_id,
                                        parent_category_id:parent_cat.id,
                                        rollback_key:rollback_key,
                                        fromClient:false,
                                        fromServer:true
                                    }
                                };
                                _t.api(o, function (err, res) {
                                    if (err) return cb(new MyError('При попытке установить родительскую категорию для новосозданной возникла ош.', {o:o,err:err}));
                                    cb(null);
                                });
                            });
                        },
                        updateChild: function (cb) {
                            // Теперь поищем зависящие от нее и проставим им parent_id
                            var o = {
                                command:'get',
                                object:'category',
                                params:{
                                    param_where:{
                                        parent_ext_category_id: sync_cat.ext_id
                                    },
                                    collapseData:false,
                                    limit:100000
                                }
                            };
                            _t.api(o, function (err, res) {
                                if (err) return cb(new MyError('При попытке получить дочернии категории для новосозданной, возникла ош.',{o:o, err:err}));
                                if (!res.length) return cb(null); // Нет дочерних
                                async.eachSeries(Object.keys(res), function (key, cb) {
                                    var child_cat = res[key];
                                    if (sync_cat.parent_category_id == child_cat.id) return cb(null);
                                    var o = {
                                        command:'modify',
                                        object:'category',
                                        params:{
                                            id: child_cat.id,
                                            parent_category_id:sync_cat.cat_id,
                                            rollback_key:rollback_key,
                                            fromClient:false,
                                            fromServer:true
                                        }
                                    };
                                    _t.api(o, function (err, res) {
                                        if (err) return cb(new MyError('При попытке установить родительскую категорию после добавления новой возникла ош.', {o:o,err:err}));
                                        cb(null);
                                    });
                                }, cb);
                            });
                        },
                        modifyStatus: function (cb) {
                            var params = {
                                id:sync_cat.id,
                                status_sysname:'APPLIED',
                                rollback_key:rollback_key,
                                fromClient:false,
                                fromServer:true
                            }
                            _t.modify(params, function (err) {
                                if (err) return cb(new MyError('При изменении статуса записи sync_item возникла ош.', {params:params, err:err}));
                                cb(null);
                            });
                        }
                    },cb);
                });
            }, cb);
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
            cb(null, new UserOk('Категории успешно применены.'));
        }
    })
}


//lock: function (cb) {
//    //merchant_financing.lock_key = _t.lock(id);
//    _t.lock({id:id}, function (err, res) {
//        if (err) return cb(err);
//        merchant_financing.lock_key = res;
//        cb(null);
//    });
//},

////UNLOCK
//if (merchant_financing) _t.unlock({id:id,key:merchant_financing.lock_key});




Model.prototype.apply_product = function (obj, cb) {
    if (arguments.length == 1) {
        cb = arguments[0];
        obj = {};
    }
    var _t = this;
    //var ids = obj.id || obj.ids;
    //if (!ids) return cb(new MyError('id обязателен для метода'));
    //if (!Array.isArray(ids)) ids = [ids];
    var rollback_key = obj.rollback_key || rollback.create();

    var limitSyncProducts = obj.limitSyncProducts || 5000;
    // Загрузить все категории которые еще не были применены limit limitSyncProducts
    // Загрузить из основной таблицы категорий по ext_id
    // Применить к категориям sync_category
    // Построить дерево категорий
    // Рукурсивно Новые загрузить, старые обновить
    // При этом проставить реальные зависимости по ext_id и правильный is_root
    // Вернуть количество

    var syncProducts, products;
    var syncProduct_ids = [];
    var using_categories = [];
    var categories = {};
    async.series({
        getSyncProducts: function (cb) {
            // Загрузить все продукты которые еще не были применены limit limitSyncProducts
            var params = {
                param_where:{
                    is_product:true,
                    status_sysname:'NEW'
                },
                sort:'created',
                collapseData:false,
                limit:limitSyncProducts
            };
            _t.get(params, function (err, res) {
                if (err) return cb(new MyError('Не удалось получить список продуктов для загрузки.',{err:err}));
                syncProducts = res;
                for (var i in syncProducts) {
                    syncProduct_ids.push(syncProducts[i].ext_id);
                    using_categories.push(syncProducts[i].parent_category_cod);
                }
                if (!syncProduct_ids.length) return cb(new UserOk('Нет записей для применения'));
                cb(null);
            });
        },
        getProducts: function (cb) {
            var o = {
                command:'get',
                object:'product',
                params:{
                    where:[
                        {
                            key:'ext_id',
                            type:'in',
                            val1:syncProduct_ids.join(',')
                        }
                    ],
                    collapseData:false
                }
            }
            _t.api(o, function (err, res) {
                if (err) return cb(new MyError('При получении продуктов по заданным параметрам возникла ош.',{o:o, err:err}));
                products = res;
                cb(null);
            })
        },
        mergeProduct: function (cb) {
            var excludeToModify = ['to_modify','created','updated','published','deleted','deleted_by_user_id','remove_comment','created_by_user_id','self_company_id','ext_company_id']
            for (var i in products) {
                var product = products[i];
                for (var j in syncProducts) {
                    var sync_product = syncProducts[j];
                    sync_product.is_active = true;
                    if (product.ext_id == sync_product.ext_id){
                        sync_product.is_modify = true;
                        for (var k in product) {
                            if (excludeToModify.indexOf(k)!=-1) continue;
                            if (k == 'id'){
                                sync_product.prod_id = product.id;
                                continue;
                            }
                            if (k == 'quantity'){
                                switch (sync_product.sync_file_type_sysname) {
                                    case 'ADD':
                                        sync_product.quantity = +product.quantity + sync_product.quantity;
                                        break;
                                        sync_product.quantity = +sync_product.quantity - (product.in_basket_count || 0);
                                    case 'RPL':
                                        break;
                                    default:
                                        delete syncProducts[j];
                                        break;
                                }
                                continue;
                            }
                            if (product[k] !== sync_product[k]){
                                if (!sync_product.to_modify) sync_product.to_modify = [];
                                //sync_product[k] = product[k];
                                sync_product[k] = (typeof sync_product[k] != 'undefined')? sync_product[k] : product[k];
                                sync_product.to_modify.push(k);
                            }
                        }
                    }
                }
            }
            //for (var k in to_del_syncProducts) {
            //    delete syncProducts[to_del_syncProducts[k]];
            //}
            //syncProducts = funcs.clearEmpty(syncProducts);
            cb(null);
        },
        getCategories: function (cb) {
            if (!using_categories.length) return cb(null);
            var o = {
                command:'get',
                object:'category',
                params:{
                    where:[
                        {
                            key:'ext_id',
                            type:'in',
                            val1:using_categories.join(',')
                        }
                    ],
                    collapseData:false
                }
            };
            _t.api(o, function (err, res) {
                if (err) return cb(new MyError('При попытке получить категорию для товара возникла ош.', {o:o, err:err}));
                for (var i in res) {
                    categories[res[i].ext_id] = res[i].id;
                }
                cb(null);
            })
        },
        addNew: function (cb) {
            // Для каждого
            // Поищем по имени, если есть то загрузим и отправим в toModify
            // Если нет, то добавим
            // После добавления поищем его категорию и проставим (если еще не проставлена)
            async.eachSeries(Object.keys(syncProducts), function (cat_key, cb) {
                var sync_prod = syncProducts[cat_key];
                if (sync_prod.is_modify) return cb(null); // Уже есть, отправим на изменение
                var o = {
                    command:'get',
                    object:'product',
                    params:{
                        param_where:{
                            name:sync_prod.name
                        },
                        limit:1,
                        collapseData:false
                    }
                }
                // Поищем по имени, если есть то загрузим и отправим в toModify
                _t.api(o, function (err, res) {
                    if (err) return cb(new MyError('При получении товара по имени возникла ош.',{o:o, err:err}));
                    if (res.length) {
                        sync_prod.image = res[0].image;
                        sync_prod.image_list = res[0].image_list;
                        //for (var i in res[0]) {
                        //    if (i == 'id') {
                        //        sync_prod.prod_id = res[0].id;
                        //        continue;
                        //    }
                        //    sync_prod[i] = (typeof sync_prod[i]==='undefined')? res[0][i] : (function () {
                        //        if (!sync_prod.to_modify) sync_prod.to_modify = [];
                        //        sync_prod.to_modify.push(i);
                        //        return sync_prod[i];
                        //    })();
                        //}
                        //return cb(null);
                    }
                    // Если не нашли то добавим
                    var category_id = categories[sync_prod.parent_category_cod];
                    if(!category_id) {
                        //NO_CATEGORY
                        var params = {
                            id:sync_prod.id,
                            status_sysname:'NO_CATEGORY',
                            rollback_key:rollback_key,
                            fromClient:false,
                            fromServer:true
                        }
                        _t.modify(params, function (err) {
                            if (err) return cb(new MyError('При изменении статуса записи sync_item возникла ош.', {params:params, err:err}));
                            cb(null);
                        });
                        return;
                    }
                    var o = {
                        command:'add',
                        object:'product',
                        params:{
                            category_id:category_id,
                            is_active:true,
                            name:sync_prod.name,
                            qnt_type_sys:(sync_prod.control_of_fractional_amounts)? 'KG' : 'UNIT',
                            price:sync_prod.price,
                            ext_id:sync_prod.ext_id,
                            barcode:sync_prod.barcode,
                            quantity:sync_prod.quantity,
                            control_of_fractional_amounts:sync_prod.control_of_fractional_amounts,
                            section_num:sync_prod.section_num,
                            vendor_code:sync_prod.vendor_code,
                            rollback_key:rollback_key,
                            fromClient:false,
                            fromServer:true
                        }
                    }
                    _t.api(o, function (err, res) {
                        if (err) return cb(new MyError('При добавлении нового товара возникла ошибка.',{o:o, err:err}));
                        sync_prod.prod_id = res.id;

                        var params = {
                            id:sync_prod.id,
                            status_sysname:'APPLIED',
                            rollback_key:rollback_key,
                            fromClient:false,
                            fromServer:true
                        }
                        _t.modify(params, function (err) {
                            if (err) return cb(new MyError('При изменении статуса записи sync_item возникла ош.', {params:params, err:err}));
                            cb(null);
                        });

                    });

                    //async.series({
                    //    getCategoryId: function (cb) {
                    //        var o = {
                    //            command:'get',
                    //            object:'category',
                    //            params:{
                    //                param_where:{
                    //                    ext_id:sync_prod.parent_category
                    //                },
                    //                limit:1,
                    //                collapseData:false
                    //            }
                    //        };
                    //        _t.api(o, function (err, res) {
                    //            if (err) return cb(new MyError('При попытке получить категорию для товара возникла ош.', {o:o, err:err}));
                    //            if (!res.length) return cb(null); // Нет родительской категории
                    //            sync_prod.category_id = res[0].id;
                    //            cb(null);
                    //        })
                    //    },
                    //    add: function (cb) {
                    //        if (!sync_prod.category_id) return cb(null); // Родительская категория пока не загружена. пропускаем.
                    //        var o = {
                    //            command:'add',
                    //            object:'product',
                    //            params:{
                    //                category_id:sync_prod.category_id,
                    //                is_active:true,
                    //                name:sync_prod.name,
                    //                qnt_type_sys:(sync_prod.control_of_fractional_amounts)? 'KG' : 'UNIT',
                    //                price:sync_prod.price,
                    //                ext_id:sync_prod.ext_id,
                    //                barcode:sync_prod.barcode,
                    //                quantity:sync_prod.quantity,
                    //                control_of_fractional_amounts:sync_prod.control_of_fractional_amounts,
                    //                section_num:sync_prod.section_num,
                    //                vendor_code:sync_prod.vendor_code,
                    //                rollback_key:rollback_key,
                    //                fromClient:false
                    //            }
                    //        }
                    //        _t.api(o, function (err, res) {
                    //            if (err) return cb(new MyError('При добавлении нового товара возникла ошибка.',{o:o, err:err}));
                    //            sync_prod.prod_id = res.id;
                    //
                    //            var params = {
                    //                id:sync_prod.id,
                    //                status_sysname:'APPLIED',
                    //                rollback_key:rollback_key,
                    //                fromClient:false,
                    //                fromServer:true
                    //            }
                    //            _t.modify(params, function (err) {
                    //                if (err) return cb(new MyError('При изменении статуса записи sync_item возникла ош.', {params:params, err:err}));
                    //                cb(null);
                    //            });
                    //
                    //        });
                    //    }
                    //},cb);

                })
            }, cb);
        },
        modifyExist: function (cb) {
            async.eachSeries(Object.keys(syncProducts), function (cat_key, cb) {
                var sync_prod = syncProducts[cat_key];
                if (!sync_prod.is_modify) return cb(null); // Были добавлены в систему. Они новые
                if (!sync_prod.to_modify){
                    // Обновим статус и выйдем
                    var params = {
                        id:sync_prod.id,
                        status_sysname:'APPLIED',
                        rollback_key:rollback_key,
                        fromClient:false,
                        fromServer:true
                    }
                    _t.modify(params, function (err) {
                        if (err) return cb(new MyError('При изменении статуса записи sync_item возникла ош.', {params:params, err:err}));
                        cb(null);
                    });
                    return;
                }

                var category_id = categories[sync_prod.parent_category_cod];
                if(!category_id) {
                    //NO_CATEGORY
                    var params = {
                        id:sync_prod.id,
                        status_sysname:'NO_CATEGORY',
                        rollback_key:rollback_key,
                        fromClient:false,
                        fromServer:true
                    }
                    _t.modify(params, function (err) {
                        if (err) return cb(new MyError('При изменении статуса записи sync_item возникла ош.', {params:params, err:err}));
                        cb(null);
                    });
                    return;
                }

                var o = {
                    command:'modify',
                    object:'product',
                    params:{
                        id:sync_prod.prod_id,
                        //category_id:sync_prod.category_id,
                        //is_active:true,
                        //name:sync_prod.name,
                        //qnt_type_sys:(sync_prod.control_of_fractional_amounts)? 'KG' : 'UNIT',
                        //price:sync_prod.price,
                        //ext_id:sync_prod.ext_id,
                        //barcode:sync_prod.barcode,
                        //quantity:sync_prod.quantity,
                        //control_of_fractional_amounts:sync_prod.control_of_fractional_amounts,
                        //section_num:sync_prod.section_num,
                        //vendor_code:sync_prod.vendor_code,
                        rollback_key:rollback_key,
                        fromClient:false,
                        fromServer:true
                    }
                }
                for (var i in sync_prod.to_modify) {
                    o.params[sync_prod.to_modify[i]] = sync_cat[sync_prod.to_modify[i]];
                }
                _t.api(o, function (err, res) {
                    if (err) return cb(new MyError('При добавлении нового товара возникла ошибка.',{o:o, err:err}));
                    sync_prod.prod_id = res.id;

                    var params = {
                        id:sync_prod.id,
                        status_sysname:'APPLIED',
                        rollback_key:rollback_key,
                        fromClient:false,
                        fromServer:true
                    }
                    _t.modify(params, function (err) {
                        if (err) return cb(new MyError('При изменении статуса записи sync_item возникла ош.', {params:params, err:err}));
                        cb(null);
                    });

                });


                //async.series({
                //    getCategoryId: function (cb) {
                //        var o = {
                //            command:'get',
                //            object:'category',
                //            params:{
                //                param_where:{
                //                    ext_id:sync_prod.parent_category
                //                },
                //                limit:1,
                //                collapseData:false
                //            }
                //        };
                //        _t.api(o, function (err, res) {
                //            if (err) return cb(new MyError('При попытке получить категорию для товара возникла ош.', {o:o, err:err}));
                //            if (!res.length) return cb(null); // Нет родительской категории
                //            sync_prod.category_id = res[0].id;
                //            cb(null);
                //        })
                //    },
                //    add: function (cb) {
                //        if (!sync_prod.category_id) return cb(null); // Родительская категория пока не загружена. пропускаем.
                //        var o = {
                //            command:'modify',
                //            object:'product',
                //            params:{
                //                id:sync_prod.prod_id,
                //                category_id:sync_prod.category_id,
                //                is_active:true,
                //                name:sync_prod.name,
                //                qnt_type_sys:(sync_prod.control_of_fractional_amounts)? 'KG' : 'UNIT',
                //                price:sync_prod.price,
                //                ext_id:sync_prod.ext_id,
                //                barcode:sync_prod.barcode,
                //                quantity:sync_prod.quantity,
                //                control_of_fractional_amounts:sync_prod.control_of_fractional_amounts,
                //                section_num:sync_prod.section_num,
                //                vendor_code:sync_prod.vendor_code,
                //                rollback_key:rollback_key,
                //                fromClient:false,
                //                fromServer:true
                //            }
                //        }
                //        _t.api(o, function (err, res) {
                //            if (err) return cb(new MyError('При добавлении нового товара возникла ошибка.',{o:o, err:err}));
                //            sync_prod.prod_id = res.id;
                //
                //            var params = {
                //                id:sync_prod.id,
                //                status_sysname:'APPLIED',
                //                rollback_key:rollback_key,
                //                fromClient:false,
                //                fromServer:true
                //            }
                //            _t.modify(params, function (err) {
                //                if (err) return cb(new MyError('При изменении статуса записи sync_item возникла ош.', {params:params, err:err}));
                //                cb(null);
                //            });
                //
                //        });
                //    }
                //},cb);
            }, cb);
        },
        inWordpress: function (cb) {
            var o = {
                command:'pushIntoWordpress',
                object:'Product'
            };
            socketQuery(o, function (err, res) {
                console.log(err, res);
            });
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
            cb(null, new UserOk('Продукты успешно применены.'));
        }
    })
}

module.exports = Model;