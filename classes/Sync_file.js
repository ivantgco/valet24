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
var fs = require('fs-extra');
var iconvlite = require('iconv-lite');
var path = require('path');
var FtpClient = require('ftp');
var config = require('../config/index');

var Model = function(obj){
    this.name = obj.name;
    this.tableName = obj.name.toLowerCase();
    this.sync_dir = './citymarket/sync';

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


//var o = {
//    command:'getFromFTP',
//    object:'Sync_file'
//};
//socketQuery(o, function (err, res) {
//    console.log(err, res);
//});

Model.prototype.getFromFTP = function (obj, cb) {
    if (arguments.length == 1) {
        cb = arguments[0];
        obj = {};
    }
    var _t = this;
    //var id = obj.id;
    //if (!id) return cb(new MyError('id обязателен для метода'));
    var rollback_key = obj.rollback_key || rollback.create();

    // Считать список файлов из удаленной директории
    var sync_dir = _t.sync_dir;

    var filelist = [];
    var filesFromServer = [];
    var toUploadFiles = [];
    var shop;
    var ftpClient1;
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
                if (!res.length) return cb(new UserError('Не удалось получить текущий магазин. Выставите текущий магазин.'));
                shop = res[0];
                sync_dir = sync_dir + '/' + shop.sysname;
                cb(null);
            })
        },
        get_file_list_local: function (cb) {
            // Считать список файлов из директории

            fs.readdir(sync_dir, function (err, files) {
                if (err) return cb(new MyError('Не удалось считать файлы из директории синхронизации.',{err:err}));
                for (var i in files) {
                    if (path.extname(files[i]) == '.spr') filelist.push(files[i]);
                }
                //filelist = files;
                cb(null);
            });
        },
        get_files_from_remote: function (cb) {
            // Считать список файлов из директории на сервере и скачать
            ftpClient1 = new FtpClient();
            ftpClient1.on('ready', function() {
                ftpClient1.list(shop.sysname,function(err, list) {
                    if (err) return cb(new MyError('Не удалось считать список файлов на удаленном сервере.',{err:err}));
                    for (var i in list) {
                        var file = list[i];
                        if (file.type != '-') continue;
                        //file.name_only = path.parse(file.name).name;
                        filesFromServer.push(file);
                        if (filelist.indexOf(file.name) == -1  && toUploadFiles.indexOf(file.name) == -1) {
                            toUploadFiles.push(file.name);
                        }
                    }
                    return cb(null);
                });
            });
            ftpClient1.on('error', function (err) {
                console.log(err);
                ftpClient1.end();
                return cb(new MyError('FTP client выдал ошибку.',{err:err}));
            });
            ftpClient1.connect(config.get('ftpSync'));
        },
        uploadFiles: function (cb) {
            async.eachSeries(toUploadFiles, function (filename, cb) {
                ftpClient1.get(shop.sysname + '/' + filename, function(err, stream) {
                    if (err) return cb(new MyError('Не удалось загрузить файл с удаленного сервера.',{err:err,filename:filename}));
                    stream.once('close', function() {
                        console.log('Файл получен', filename);
                        cb(null);

                    });
                    stream.pipe(fs.createWriteStream(sync_dir + '/' + filename));
                });
            }, function (err) {
                if (err) return cb(err);
                ftpClient1.end();
                cb(null);
            });
        }
    }, function (err) {
        if (err) {
            if (ftpClient1) ftpClient1.destroy();
            if (err.message == 'needConfirm') return cb(err);
            rollback.rollback({rollback_key:rollback_key,user:_t.user}, function (err2) {
                return cb(err, err2);
            });
        }else{
            cb(null, new UserOk('Ок.'));
        }
    });
}

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
    var sync_dir = _t.sync_dir;

    var filelist = [];
    var filesInDB = [];
    var shop;
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
                if (!res.length) return cb(new UserError('Не удалось получить текущий магазин. Выставите текущий магазин.'));
                shop = res[0];
                cb(null);
            })
        },
        get_file_list: function (cb) {
            // Считать список файлов из директории
            sync_dir = sync_dir + '/' + shop.sysname;
            fs.readdir(sync_dir, function (err, files) {
                if (err) return cb(new MyError('Не удалось считать файлы из директории синхронизации.',{err:err}));
                for (var i in files) {
                    if (path.extname(files[i]) == '.spr') filelist.push(files[i]);
                }
                 //filelist = files;
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
                    },
                    {
                        key:'shop_id',
                        val1:shop.id
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
                var newFileCounter = 0;
                var filetype;
                var str = '';
                var stream = fs.createReadStream(sync_dir + '/' + filename);
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
                    if (a.length>1) {
                        filetype = 'SPLITED';

                        var filenameParsed = path.parse(filename);
                        //fs.unlinkSync('source_file');
                        // Надо разбить на несколько файлов
                        var fileContens = str.split('##@@&&$$$');

                        async.eachSeries(fileContens, function (one_content, cb) {
                            if (!one_content.length) return cb(null);
                            var data = iconvlite.encode('##@@&&$$$' + one_content, 'cp1251');
                            var portion_filename = filenameParsed.name + '_' + ++newFileCounter + filenameParsed.ext;
                            var newFileType = one_content.substr(0,3);
                            fs.writeFile(sync_dir + '/' + portion_filename, data, function (err) {
                                if (err) return cb(new MyError('При попытке записать файл возникла ош.',{filename:portion_filename}));
                                var params = {
                                    filename:portion_filename,
                                    sync_file_type_sysname:newFileType,
                                    shop_id:shop.id
                                }
                                _t.add(params, function (err) {
                                    if (err){
                                        console.log('Не удалось добавить файл в базу', err, portion_filename, newFileType);
                                        return cb(null);
                                    }
                                    cb(null);
                                });
                            });
                        }, function (err) {
                            if (err) return cb(err);
                            var params = {
                                filename:filename,
                                sync_file_type_sysname:'SPLITED',
                                status_sysname:'SPLITED',
                                shop_id:shop.id
                            }
                            _t.add(params, function (err) {
                                if (err){
                                    console.log('Не удалось добавить файл в базу', err, filename, 'SPLITED');
                                    return cb(null);
                                }
                                cb(null);
                            });
                        });
                        return; // Выходим, чтобы не делать стандартное действие
                    }
                    if (!filetype) {
                        console.log('Не удалось считать тип файла', filename);
                        return cb(null);
                    }
                    var params = {
                        filename:filename,
                        sync_file_type_sysname:filetype,
                        shop_id:shop.id
                    }
                    if (a.length>1) params.status_sysname = 'ERR';
                    _t.add(params, function (err) {
                        if (err){
                            console.log('Не удалось добавить файл в базу', err, filename, filetype);
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

    var sync_dir = _t.sync_dir;

    var filesToUpload;
    var shop;
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
                        //val1:'NEW,ERR'
                        val1:'NEW'
                    },
                    {
                        key:'shop_id',
                        val1:shop.id
                    }
                ],
                sort: 'created,filename',
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
                sync_dir = sync_dir + '/' + shop.sysname;
                var params = {
                    filename: fileitem.filename,
                    sync_dir:sync_dir
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
                    //lines.length = 10; // Временно, чтобы не работать со всем объемом
                    for (var i in lines) {

                        lines[i] = lines[i].replace(/\n|\r/ig,'');
                        if (!lines[i].length) continue;
                        if (!lines[i][0].match(/\d/)) continue;
                        var one_item =  lines[i].split(';');
                        if (one_item.length < 16) continue;
                        var is_product = !!+one_item[16];
                        if (typeof is_product === 'undefined'){
                            console.log('Не возможно определить товар это или группа');
                            console.log(lines[i]);
                            continue;
                        }
                        if (!is_product){
                            console.log('Категории мы не загружаем');
                            continue;
                        }
                        items.push({
                            sync_file_id:fileitem.id,
                            type_sysname:(is_product)? 'PRODUCT' : 'CATEGORY',
                            sync_file_type_id:fileitem.sync_file_type_id,
                            ext_id:one_item[0],
                            barcode:one_item[1],
                            name:one_item[2],
                            name_check:one_item[3],
                            price:one_item[4],
                            quantity:one_item[5],
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
                            grapp_list:one_item[17],
                            shop_id:shop.id
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

Model.prototype.upload_all_files = function (obj, cb) {
    if (arguments.length == 1) {
        cb = arguments[0];
        obj = {};
    }
    var _t = this;
    var rollback_key = obj.rollback_key || rollback.create();

    // Получить файлы для применения (со статусом NEW)
    // Применить по очереди

    var filesToUpload;
    var shop;
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
        getSyncFiles: function (cb) {
            // Загрузить данные о файлах (проверить статус)
            var params = {
                where:[
                    {
                        key:'status_sysname',
                        type:'in',
                        //val1:'NEW,ERR'
                        val1:'NEW'
                    },
                    {
                        key:'shop_id',
                        val1:shop.id
                    }
                ],
                sort: 'created,filename',
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
                    id: fileitem.id
                }
                _t.upload_file(params, cb);
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

Model.prototype.fullSyncBJTrigger = function (obj, cb) {
    if (arguments.length == 1) {
        cb = arguments[0];
        obj = {};
    }
    var _t = this;
    global.fullSyncBJ = !global.fullSyncBJ;
    cb(null, new UserOk('Переключили',{fullSyncBJ:global.fullSyncBJ}));
};
Model.prototype.fullSync = function (obj, cb) {
    if (arguments.length == 1) {
        cb = arguments[0];
        obj = {};
    }
    var _t = this;
    if (_t.in_sync) {
        console.log('Цикл синхронизации еще идет...');
        return cb(null);
    }
    _t.in_sync = true;
    //var id = obj.id;
    //if (!id) return cb(new MyError('id обязателен для метода'));
    var rollback_key = obj.rollback_key || rollback.create();

    // Загрузить Новые файлы по FTP
    // Загрузить их в систему
    // Распарсить файлы
    // Применить записи файлов

    async.series({
        getFromFTP: function (cb) {
            _t.getFromFTP(function (err) {
                if (err) {
                    console.log('getFromFTP' ,err);
                }
                console.log('==> getFromFTP SUCCESS');
                cb(null);
            });
        },
        sync_with_system: function (cb) {
            _t.sync_with_system(function (err) {
                if (err) {
                    console.log('sync_with_system', err);
                }
                console.log('==> sync_with_system SUCCESS');
                cb(null);
            });
        },
        upload_all_files: function (cb) {
            _t.upload_all_files(function (err) {
                if (err) {
                    console.log('upload_all_files', err);
                }
                console.log('==> upload_all_files SUCCESS');
                cb(null);
            });
        },
        apply_product_all: function (cb) {
            var o = {
                command:'apply_product_all',
                object:'Sync_file_item',
                params:{
                }
            }
            _t.api(o, function (err) {
                if (err) {
                    console.log('apply_product_all', err);
                }
                console.log('==> apply_product_all SUCCESS');
                cb(null);
            });
        }

    }, function (err) {
        if (err) {
            if (err.message == 'needConfirm') return cb(err);
            rollback.rollback({rollback_key:rollback_key,user:_t.user}, function (err2) {
                _t.in_sync = false;
                return cb(err, err2);
            });
        }else{
            _t.in_sync = false;
            cb(null, new UserOk('Ок.'));
        }
    });
}

Model.prototype.deleteOldSyncItem = function (obj, cb) {
    if (arguments.length == 1) {
        cb = arguments[0];
        obj = {};
    }
    var _t = this;
    var params = {
        procedureName:'delete_old_sync_item'
    }
    _t.execProcedure(params, function (err) {
        cb(err, new UserOk('Устаревшие записи синхронизаций удалены.'));
    });
};
//var o = {
//    command: 'deleteOldSyncFiles',
//    object: 'sync_file',
//    params: {
//
//    }
//};
//socketQuery(o, function (res) {
//    console.log(res);
//});

Model.prototype.deleteOldSyncFiles = function (obj, cb) {
    if (arguments.length == 1) {
        cb = arguments[0];
        obj = {};
    }
    var _t = this;
    var shop;
    var sync_dir = _t.sync_dir;
    var sync_files = [];
    var local_files = [];
    var server_files = [];
    var to_delete_local_files = [];
    var to_delete_server_files = [];
    var ftpClient1;
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
                if (!res.length) return cb(new UserError('Не удалось получить текущий магазин. Выставите текущий магазин.'));
                shop = res[0];
                sync_dir = sync_dir + '/' + shop.sysname;
                cb(null);
            })
        },
        getSyncFiles: function (cb) {
            var params = {
                collapseData:false
            }
            _t.get(params, function (err, res) {
                if (err) return cb(new MyError('Не удалось получить sync_file',{params:params,err:err}));
                for (var i in res) {
                    sync_files.push(res[i].filename);
                }
                return cb(null);
            });
        },
        getLocalFiles: function (cb) {
            // Считать список файлов из директории

            fs.readdir(sync_dir, function (err, files) {
                if (err) return cb(new MyError('Не удалось считать файлы из директории синхронизации.',{err:err}));
                for (var i in files) {
                    if (path.extname(files[i]) == '.spr') local_files.push(files[i]);
                }
                //filelist = files;
                cb(null);
            });
        },
        get_files_from_remote: function (cb) {
            // Считать список файлов из директории на сервере и скачать
            ftpClient1 = new FtpClient();
            ftpClient1.on('ready', function() {
                ftpClient1.list(shop.sysname,function(err, list) {
                    if (err) return cb(new MyError('Не удалось считать список файлов на удаленном сервере.',{err:err}));
                    for (var i in list) {
                        var file = list[i];
                        if (file.type != '-') continue;
                        //file.name_only = path.parse(file.name).name;
                        server_files.push(file.name);
                    }
                    return cb(null);
                });
            });
            ftpClient1.on('error', function (err) {
                console.log(err);
                ftpClient1.end();
                return cb(new MyError('FTP client выдал ошибку.',{err:err}));
            });
            ftpClient1.connect(config.get('ftpSync'));
        },
        merge: function (cb) {
            for (var i in local_files) {
                if (sync_files.indexOf(local_files[i]) == -1){
                    to_delete_local_files.push(local_files[i]);
                }
            };
            for (var i in server_files) {
                if (sync_files.indexOf(server_files[i]) == -1){
                    to_delete_server_files.push(server_files[i]);
                }
            }
            console.log('to_delete_local_files',to_delete_local_files.length);
            console.log('to_delete_server_files',to_delete_server_files.length);
            cb(null);
        },
        deleteLocal: function (cb) {
            async.eachSeries(to_delete_local_files, function (item, cb) {
                fs.unlink(sync_dir + '/' + item, function (err) {
                    if (err){
                        console.log('При удалении файла возникла ошибка.', item, err);
                    }
                    cb(null);
                });
            },cb);
        },
        deleteServer: function (cb) {

            ftpClient1 = new FtpClient();
            ftpClient1.on('ready', function() {
                async.eachSeries(to_delete_server_files, function (item, cb) {
                    ftpClient1.delete(shop.sysname + '/' + item, function(err) {
                        if (err){
                            console.log('При удалении файла возникла ошибка.', item, err);
                        }
                        cb(null);
                    });
                }, function (err) {
                    ftpClient1.end();
                    return cb(err);
                });
            });
            ftpClient1.on('error', function (err) {
                console.log(err);
                ftpClient1.end();
                return cb(new MyError('FTP client выдал ошибку.',{err:err}));
            });
            ftpClient1.connect(config.get('ftpSync'));


        }
    },function (err) {
        cb(err, new UserOk('Файлы удалены.'));
    });
};

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