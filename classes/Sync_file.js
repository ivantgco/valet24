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
var fs = require('fs');
var iconvlite = require('iconv-lite');

var Model = function(obj){
    this.name = obj.name;
    this.tableName = obj.name.toLowerCase();
    this.sync_dir = './citymarket/sync/update';

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

Model.prototype.readFile = function (obj, cb) {
    if (arguments.length == 1) {
        cb = arguments[0];
        obj = {};
    }
    if (typeof cb !== 'function') throw new MyError('В метод не передан cb');
    if (typeof obj !== 'object') return cb(new MyError('В метод не переданы obj'));
    var _t = this;
    var filename = obj.filename;
    if (!filename) return cb(new MyError('В метод не передан filename',{obj:obj}));
    var sync_dir = obj.sync_dir || _t.sync_dir;

    var str = '';
    var stream = fs.createReadStream(sync_dir + '/' + filename);
    stream.on('readable', function() {
        var buf;
        while ((buf = stream.read()) !== null) {
            str += iconvlite.decode(buf, 'cp1251');
        }
    });
    stream.on('end', function(err) {
        return cb(null, str);
    });
    stream.on('error', function(err) {
        return cb(new MyError('Не удалось прочитать файл',{err:err}));
    });
};

Model.prototype.sync_with_system = function (obj, cb) {
    if (arguments.length == 1) {
        cb = arguments[0];
        obj = {};
    }
    var _t = this;
    //var id = obj.id;
    //if (!id) return cb(new MyError('id обязателен для метода'));
    var rollback_key = obj.rollback_key || rollback.create();

    // Считать список файлов из директории
    // получить из таблицы все файлы in (считанные)
    // Найти те, которых нету
    // Добавить в систему.

    var filelist = [];
    var filesInDB = [];
    async.series({
        get_file_list: function (cb) {
            // Считать список файлов из директории
            fs.readdir(_t.sync_dir, function (err, files) {
                if (err) return cb(new MyError('Не удалось считать файлы из директории синхронизации.',{err:err}));
                 filelist = files;
                cb(null);
            });
        },
        get_files_from_db: function (cb) {
            // получить из таблицы все файлы in (считанные)
            var params = {
                where:[
                    {
                        key:'filename',
                        type:'in',
                        val1:filelist.join(',')
                    }
                ],
                columns:['filename'],
                limit:10000,
                collapseData:false
            }
            _t.get(params, function (err, res) {
                if (err) return cb(new MyError('Не удалось получить список уже загруженных в систему файлов.',{err:err}));
                for (var i in res) {
                    filesInDB.push(res[i].filename);
                }
                //filesInDB = res;
                cb(null)
            });
        },
        addToDB: function (cb) {
            // Найти те, которых нету
            var toAdd = [];
            for (var i in filelist) {
                if (filesInDB.indexOf(filelist[i]) == -1) {
                    toAdd.push(filelist[i]);
                }
            }
            // Добавить в систему.
            async.eachSeries(toAdd, function (filename, cb) {
                // Считать первую строку чтобы выяснить тип
                // добавить в базу
                // Ошибки игнорим (можно в лог писать)
                var filetype;
                var str = '';
                var stream = fs.createReadStream(_t.sync_dir + '/' + filename);
                stream.on('readable', function() {
                    var buf;
                    var brk = false;
                    while ((buf = stream.read()) !== null) {
                        str += iconvlite.decode(buf, 'cp1251');
                        //var a = str.match(/\$\$\$\w{3}/ig);
                        //if (a) {
                        //    filetype = a[0].replace('$$$','');
                        //    brk = true;
                        //}
                    }
                });
                stream.on('end', function(err) {
                    //console.log('FILETYPE',filename,filetype);
                    var a = str.match(/\$\$\$\w{3}/ig);
                    filetype = a[0].replace('$$$','');
                    if (a.length>1) filetype = 'ERR';
                    if (!filetype) {
                        console.log('Не удалось считать тип файла', filename);
                        return cb(null);
                    }
                    var params = {
                        filename:filename,
                        sync_file_type_sysname:filetype
                    }
                    if (a.length>1) params.status_sysname = 'ERR';
                    _t.add(params, function (err) {
                        if (err){
                            console.log('Не удалось добавить файл в базу', err);
                            return cb(null);
                        }
                        cb(null);
                    })
                });


            }, cb);
        }
    }, function (err) {
        if (err) {
            if (err.message == 'needConfirm') return cb(err);
            rollback.rollback({rollback_key:rollback_key,user:_t.user}, function (err2) {
                return cb(err, err2);
            });
        }else{
            cb(null, new UserOk('Ок.'));
        }
    })

}

Model.prototype.upload_file = function (obj, cb) {
    if (arguments.length == 1) {
        cb = arguments[0];
        obj = {};
    }
    var _t = this;
    var ids = obj.id || obj.ids;
    if (!ids) return cb(new MyError('id обязателен для метода'));
    if (!Array.isArray(ids)) ids = [ids];
    var rollback_key = obj.rollback_key || rollback.create();

    // Загрузить данные о файлах (проверить статус)
    // Подходящие загружаем
    // Для каждого:
    // Считать файл
    // Разбить по строкам
    // Оставить только интересные нам строки
    // Добавить записи в sync_file_item (с правильным типом)
    // Сменить статус файла

    var filesToUpload;
    async.series({
        getSyncFiles: function (cb) {
            // Загрузить данные о файлах (проверить статус)
            var params = {
                where:[
                    {
                        key:'id',
                        type:'in',
                        val1:ids.join(',')
                    },
                    {
                        key:'status_sysname',
                        type:'in',
                        val1:'NEW,ERR'
                    }
                ],
                collapseData:false
            }
            _t.get(params, function (err, res) {
                if (err) return cb(new MyError('Не удалось получить данные о файлах',{err:err}));
                filesToUpload = res;
                cb(null);
            });
        },
        uploadFiles: function (cb) {
            // Подходящие загружаем
            if (!filesToUpload) return cb(null); // Нет файлов для загрузки
            async.eachSeries(Object.keys(filesToUpload), function (key, cb) {
                var fileitem = filesToUpload[key];
                var params = {
                    filename: fileitem.filename
                }
                _t.readFile(params, function (err, str) {
                    if (err) {
                        // Записать лог
                        console.log(err);
                        return cb(null);
                    }
                    if (typeof str !== 'string') {
                        // Записать лог
                        console.log(str);
                        console.log('Считанные из файла данные не являются текстом');
                        return cb(null);
                    }
                    console.log(str);
                    var lines = str.split('\n');
                    var items = [];
                    lines.length = 10;
                    for (var i in lines) {

                        lines[i] = lines[i].replace(/\n|\r/ig,'');
                        if (!lines[i].length) continue;
                        if (!lines[i][0].match(/\d/)) continue;
                        var one_item =  lines[i].split(';');
                        var is_product = !!+one_item[16];
                        if (typeof is_product === 'undefined'){
                            console.log('Не возможно определить товар это или группа');
                            console.log(lines[i]);
                            continue;
                        }
                        items.push({
                            sync_file_id:fileitem.id,
                            type_sysname:(is_product)? 'PRODUCT' : 'CATEGORY',
                            ext_id:one_item[0],
                            barcode:one_item[1],
                            name:one_item[2],
                            name_check:one_item[3],
                            price:one_item[4],
                            balance_of_goods:one_item[5],
                            not_used_1:one_item[6],
                            control_of_fractional_amounts:one_item[7],
                            section_num:one_item[8],
                            max_discount_percent:one_item[9],
                            taxes_group_code:one_item[10],
                            vendor_code:one_item[11],
                            request_mark:one_item[12],
                            not_used_2:one_item[13],
                            not_used_3:one_item[14],
                            parent_category:one_item[15],
                            is_product:one_item[16],
                            grapp_list:one_item[17]
                        });
                    }
                    async.eachSeries(items, function (one_elem, cb) {
                        console.log(one_elem);
                        one_elem.rollback_key = rollback_key;
                        var o = {
                            command:'add',
                            object:'sync_file_item',
                            params:one_elem
                        }
                        _t.api(o, function (err) {
                            if (err) return cb(new MyError('Не удалось добавить элемент в таблицу sync_file_item',{err:err}));
                            cb(null);
                        });
                    }, function (err) {
                        if (err) return cb(err);
                        // Сменить статус файла
                        var params = {
                            id:fileitem.id,
                            status_sysname:'UPLOADED',
                            rollback_key:rollback_key
                        }
                        _t.modify(params, function (err) {
                            if (err) return cb(new MyError('Не удалось изменить статус файла на Загружен',{err:err}));
                            cb(null);
                        });
                    });
                });
            }, cb);

        }
    }, function (err) {
        if (err) {
            if (err.message == 'needConfirm') return cb(err);
            rollback.rollback({rollback_key:rollback_key,user:_t.user}, function (err2) {
                return cb(err, err2);
            });
        }else{
            cb(null, new UserOk('Файл успешно загружен.'));
        }
    })

}
Model.prototype.apply_category = function (obj, cb) {
    if (arguments.length == 1) {
        cb = arguments[0];
        obj = {};
    }
    var _t = this;
    var ids = obj.id || obj.ids;
    if (!ids) return cb(new MyError('id обязателен для метода'));
    if (!Array.isArray(ids)) ids = [ids];
    var rollback_key = obj.rollback_key || rollback.create();

    // Загрузить все категории которые еще не были применены

    async.series({}, function (err) {
        if (err) {
            if (err.message == 'needConfirm') return cb(err);
            rollback.rollback({rollback_key:rollback_key,user:_t.user}, function (err2) {
                return cb(err, err2);
            });
        }else{
            cb(null, new UserOk('Категории успешно применены.'));
        }
    })
}

/*Model.prototype.upload_files = function (obj, cb) {
    if (arguments.length == 1) {
        cb = arguments[0];
        obj = {};
    }
    var _t = this;
    var filesToUpload = obj.filesToUpload || [];
    if (!Array.isArray(filesToUpload)) filesToUpload = [filesToUpload]; // Если передан один объект файла а не массив
    var rollback_key = obj.rollback_key || rollback.create();

    // Загрузить данные о файле (проверить статус)
    // Запустить процесс загрузки
    // Найти те, которых нету
    // Добавить в систему.

    async.series({

    }, function (err) {
        if (err) {
            if (err.message == 'needConfirm') return cb(err);
            rollback.rollback(rollback_key, function (err2) {
                return cb(err, err2);
            });
        }else{
            cb(null, new UserOk('Ок.'));
        }
    })

}*/

//if (err) {
//    if (err.message == 'needConfirm') return cb(err);
//    rollback.rollback(rollback_key, function (err2) {
//        return cb(err, err2);
//    });
//}else{
//    cb(null, new UserOk('Ок.'));
//}

module.exports = Model;