var api = require('../libs/api');
var sendMail = require('../libs/sendMail');
var MyError = require('../error').MyError;
var UserError = require('../error').UserError;
var UserOk = require('../error').UserOk;
var getCode = require('../libs/getCode');
var funcs = require('../libs/functions');
var async = require('async');


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
    if (typeof o.params!=='object') o.params = {};
    o.params.sid = obj.sid;
    api_functions[command](o.params || {}, function (err, res) {
        if (err) return response.status(200).json(err);
        if (res.code) return response.status(200).json(res);
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
    if (obj.columns) o.params.columns = obj.columns.split(',');
    if (obj.id){
        var ids = obj.id.split(',');
        var w1 = {
            key:'id',
            type:'in',
            val1:ids
        };
        o.params.where.push(w1);
    }
    if (obj.is_root){
        var w2 = {
            key:'parent_category_id',
            type:'isNull'
        };
        o.params.where.push(w2);
    }
    o.params.limit = obj.limit;
    o.params.page_no = obj.page_no;
    api(o, cb);
};

api_functions.get_product = function (obj, cb) {
    if (arguments.length == 1) {
        cb = arguments[0];
        obj = {};
    }
    if (typeof cb !== 'function') throw new MyError('В метод не передан cb');
    if (typeof obj !== 'object') return cb(new MyError('В метод не переданы obj'));
    var sid = obj.sid;
    if (!sid) return cb(new MyError('Не передан sid'));

    var products;
    async.series({
        getProducts: function (cb) {
            var w, ids;
            var o = {
                command:'get',
                object:'product',
                params:{
                    where:[],
                    collapseData:false
                }
            };
            if (obj.columns) o.params.columns = obj.columns.split(',');
            if (obj.id){
                ids = String(obj.id).split(',');
                w = {
                    key:'id',
                    type:'in',
                    val1:ids
                };
                o.params.where.push(w);
            }else{
                if (obj.category_id){
                    ids = String(obj.category_id).split(',');
                    w = {
                        key:'category_id',
                        type:'in',
                        val1:ids
                    };
                    o.params.where.push(w);
                }
                if (obj.parent_category_id){
                    ids = String(obj.parent_category_id).split(',');
                    w = {
                        key:'parent_category_id',
                        type:'in',
                        val1:ids
                    };
                    o.params.where.push(w);
                }
                if (obj.name){
                    w = {
                        key:'name',
                        type:'like',
                        val1:obj.name
                    };
                    o.params.where.push(w);
                }
            }
            o.params.limit = obj.limit;
            o.params.page_no = obj.page_no;
            api(o, function (err, res) {
                if (err) return cb(err);
                products = res;
                cb(null, err);
            });
        },
        getProductFromCart: function (cb) {
            var o = {
                command:'get',
                object:'product_in_cart',
                params:{
                    param_where:{
                        sid:sid
                    },
                    collapseData:false
                }
            };
            api(o, function (err, res) {
                if (err) return cb(new MyError('Не удалось получить товары в корзине', {err:err}));
                for (var i in res) {
                    var product_id = res[i].product_id;
                    for (var j in products) {
                        if (products[j].id == product_id){
                            products[j].in_basket_count = res[i].product_count;
                        }
                    }
                }
                products = funcs.collapseData(products);
                cb(null);
            });
        }
    }, function (err) {
        if (err) return cb(err);
        cb(null, products);
    });
};

api_functions.get_cart = function (obj, cb) {
    if (arguments.length == 1) {
        cb = arguments[0];
        obj = {};
    }
    if (typeof cb !== 'function') throw new MyError('В метод не передан cb');
    if (typeof obj !== 'object') return cb(new MyError('В метод не переданы obj'));
    var sid = obj.sid;
    if (!sid) return cb(new MyError('Не передан sid'));

    var cart;
    async.series({
        getCart: function (cb) {
            var o = {
                command:'get',
                object:'cart',
                params:{
                    param_where:{
                        sid:sid
                    },
                    collapseData:false
                }
            };
            if (obj.columns) o.params.columns = obj.columns.split(',');
            api(o, function (err, res) {
                if (err) return cb(new MyError('Не удалось получить корзину.', {err:err}));
                cart = res[0];
                cb(null);
            });
        },
        getProducts: function (cb) {
            if (!cart) {
                cart = {
                    amount:0,
                    product_count:0,
                    products:[]
                };
                return cb(null);
            }
            var o = {
                command:'get',
                object:'product_in_cart',
                params:{
                    param_where:{
                        cart_id:cart.id
                    },
                    collapseData:false
                }
            };
            if (obj.product_columns) o.params.columns = obj.product_columns.split(',');
            api(o, function (err, res) {
                if (err) return cb(new MyError('Не удалось получить товары в корзине', {err:err}));
                cart.products = res;
                cb(null);
            });
        }
    }, function (err) {
        if (err) return cb(err);
        return cb(null, cart);
    })

};

api_functions.add_product_in_cart = function (obj, cb) {
    if (arguments.length == 1) {
        cb = arguments[0];
        obj = {};
    }
    if (typeof cb !== 'function') throw new MyError('В метод не передан cb');
    if (typeof obj !== 'object') return cb(new MyError('В метод не переданы obj'));
    var product_id = obj.product_id;
    var sid = obj.sid;
    if (!sid) return cb(new MyError('Не передан sid'));
    if (!product_id) return cb(new MyError('Не передан product_id'));

    async.series({
        add: function (cb) {
            var o = {
                command:'add',
                object:'product_in_cart',
                params:{
                    product_id:product_id,
                    sid:sid,
                    fromServer:true
                }
            };
            api(o, cb);
        },
        getCart: function (cb) {
            api_functions.get_cart(obj, cb);
        }
    }, function (err, res) {
        if (err) return cb(err);
        var product = {product_id:res.add[0].product_id, product_count:res.add[0].product_count};
        cb(null, {product: product, cart: res.getCart});
    });
};

api_functions.remove_product_from_cart = function (obj, cb) {
    if (arguments.length == 1) {
        cb = arguments[0];
        obj = {};
    }
    if (typeof cb !== 'function') throw new MyError('В метод не передан cb');
    if (typeof obj !== 'object') return cb(new MyError('В метод не переданы obj'));
    var product_id = obj.product_id;
    var sid = obj.sid;
    if (!sid) return cb(new MyError('Не передан sid'));
    if (!product_id) return cb(new MyError('Не передан product_id'));
    var product_count = obj.product_count || 1;


    async.series({
        add: function (cb) {
            var o = {
                command:'decrise_product_in_cart',
                object:'product_in_cart',
                params:{
                    product_id:product_id,
                    sid:sid,
                    product_count:product_count,
                    fromServer:true
                }
            };
            api(o, cb);
        },
        getCart: function (cb) {
            api_functions.get_cart(obj, cb);
        }
    }, function (err, res) {
        if (err) return cb(err);
        var product = {product_id:res.add[0].product_id, product_count:res.add[0].product_count};
        cb(null, {product: product, cart: res.getCart});
    });
};