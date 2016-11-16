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

    var limitSyncCategories = 100;
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

            for (var i in categories) {
                var cat = categories[i];
                for (var j in syncCategories) {
                    var sync_cat = syncCategories[j];
                    if (cat.ext_id == sync_cat.ext_id){
                        for (var k in cat) {
                            if (k == 'to_modify') continue;
                            if (cat[k] !== sync_cat[k]){
                                if (!sync_cat.to_modify) sync_cat.to_modify = [];
                                sync_cat.to_modify.push(k);
                            }
                        }
                    }
                }
            }


            //for (var i in categories) {
            //    var cat = categories[i];
            //    for (var j in syncCategories) {
            //        var sync_cat = syncCategories[j];
            //        if (cat.ext_id == sync_cat.ext_id){
            //            if (!cat.to_modify) cat.to_modify = [];
            //            if (cat.name != sync_cat.name){
            //                cat.to_modify.push('name');
            //                cat.name = sync_cat.name;
            //            }
            //            if (cat.parent_ext_category_id != sync_cat.parent_category){
            //                cat.to_modify.push('parent_ext_category_id');
            //                cat.parent_ext_category_id = sync_cat.parent_category;
            //            }
            //        }
            //    }
            //}
            // Построим дерево
            //function addTreeLevel(objOfObj, parent_key, tree){
            //    tree = tree || {
            //        items:[]
            //    };
            //    for (var i in objOfObj) {
            //        var item = objOfObj[i];
            //        if (!item[parent_key]) {
            //            tree.items.push(item);
            //        }else{
            //
            //        }
            //        //if (is_root){
            //        //    if (!item[parent_key]) tree[item[key]] = item;
            //        //} else {
            //        //
            //        //}
            //    }
            //    return tree;
            //}

            cb(null);
        },
        addNew: function (cb) {
            // Для каждой
            // Поищем по имени, если есть то загрузим и отправим в toModify
            // Если нет, то добавим
            // После добавления поищем кто на нее ссылаается и проставим parent_id
            async.eachSeries(Object.keys(syncCategories), function (cat_key, cb) {
                var sync_cat = syncCategories[cat_key];
                if (sync_cat.to_modify) return cb(null); // Уже есть, отправим на изменение
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
                        for (var i in res[0]) {
                            if (i == 'id') continue;
                            sync_cat[i] = (typeof sync_cat[i]==='undefined')? res[0][i] : (function () {
                                if (!sync_cat.to_modify) sync_cat.to_modify = [];
                                sync_cat.to_modify.push(i);
                                return sync_cat[i];
                            })();
                        }
                        return cb(null);
                    }
                    // Если не нашли то добавим и проставим связи
                    var o = {
                        command:'add',
                        object:'category',
                        params:{
                            rollback_key:rollback_key,
                            fromClient:false
                        }
                    }
                    for (var i in sync_cat) {
                        if (typeof sync_cat[i] == 'object') continue;
                        o.params[i] = sync_cat[i];
                    }
                    _t.api(o, function (err, res) {
                        if (err) return cb(new MyError('При добавлении новой категории возникла ошибка.',{o:o, err:err}));
                        sync_cat.cat_id = res.id;

                        async.series({
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
                                        var o = {
                                            command:'modify',
                                            object:'category',
                                            params:{
                                                id: child_cat.id,
                                                parent_category_id:sync_cat.cat_id,
                                                rollback_key:rollback_key,
                                                fromClient:false
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
                                    rollback_key:rollback_key
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
        }

    }, function (err) {
        if (err) {
            if (err.message == 'needConfirm') return cb(err);
            if (err instanceof UserOk){
                err.data.count = 0;
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

module.exports = Model;