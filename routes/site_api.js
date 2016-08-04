var api = require('../libs/api');
var sendMail = require('../libs/sendMail');
var MyError = require('../error').MyError;
var UserError = require('../error').UserError;
var UserOk = require('../error').UserOk;
var getCode = require('../libs/getCode');


exports.site_api = function(req, response, next){
    var obj = req.body;
    var _t = this;
    var apiPrototype = api;
    api = function (obj, cb) {
        apiPrototype(obj, cb, req.user);
    };

    if (typeof obj.json!=='string') return response.status(200).json(getCode('errRequest','Отсутствует параметр json'));
    var o;
    try {
        o = JSON.parse(obj.json);
    } catch (e) {
        return response.status(200).json(getCode('errRequest','Параметр json имеет не валидный JSON',{json:obj.json}));
    }
    var command = o.command;
    if (!command) return response.status(200).json(getCode('errRequest','Не передан command',{o:o}));

    if (typeof api_functions[command]!=='function') return response.status(200).json(getCode('badCommand',{o:o}));
    api_functions[command](o.params || {}, function (err, res) {
        if (err) return response.status(200).json(err);
        //var s_json = JSON.stringify
        return response.status(200).json(getCode('ok', res));
    });

    //api({
    //    command: 'insertPayment',
    //    object: 'Bank',
    //    params: req.body
    //}, function(err, res){
    //
    //
    //    if (err instanceof UserOk) {
    //
    //        return response.status(200).json(getCode('ok', err));
    //    }
    //
    //    return response.status(200).json(err);
    //
    //
    //},req.user);


};

var api_functions = {};

api_functions.get_category = function (obj, cb) {
    if (arguments.length == 1) {
        cb = arguments[0];
        obj = {};
    }
    if (typeof cb !== 'function') throw new MyError('В метод не передан cb');
    if (typeof obj !== 'object') return cb(new MyError('В метод не переданы obj'));
    var o = {
        command:'get',
        object:'category',
        params:{
            where:[]
        }
    };
    if (obj.id){
        var ids = obj.id.split(',');
        var w1 = {
            key:'id',
            val1:ids
        };
        if (ids.length > 1) w1.type = 'in';
        o.params.where.push(w1);
    }
    if (obj.is_root){
        var w2 = {
            key:'parent_category_id',
            type:'isNull'
        };
        o.params.where.push(w2);
    }
    api(o, cb);
};