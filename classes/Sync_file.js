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
                    while (!brk && (buf = stream.read()) !== null) {
                        str += iconvlite.decode(buf, 'cp1251');
                        var a = str.match(/\$\$\$\w{3}/ig);
                        if (a) {
                            filetype = a[0].replace('$$$','');
                            brk = true;
                        }
                    }
                });
                stream.on('end', function(err) {
                    //console.log('FILETYPE',filename,filetype);
                    if (!filetype) {
                        console.log('Не удалось считать тип файла', filename);
                        return cb(null);
                    }
                    var params = {
                        filename:filename,
                        sync_file_type_sysname:filetype
                    }
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
            rollback.rollback(rollback_key, function (err2) {
                return cb(err, err2);
            });
        }else{
            cb(null, new UserOk('Ок.'));
        }
    })

}

//if (err) {
//    if (err.message == 'needConfirm') return cb(err);
//    rollback.rollback(rollback_key, function (err2) {
//        return cb(err, err2);
//    });
//}else{
//    cb(null, new UserOk('Ок.'));
//}

module.exports = Model;