var api = require('../libs/api');
var sendMail = require('../libs/sendMail');
var MyError = require('../error').MyError;
var UserError = require('../error').UserError;
var UserOk = require('../error').UserOk;
var getCode = require('../libs/getCode');
var funcs = require('../libs/functions');
var async = require('async');
var moment = require('moment');


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
        if (err) {
            if (err instanceof UserError || err instanceof UserOk) return response.status(200).json(getCode(err.message, err.data));
            console.log('Системная ошибка при запросе с сайта.', err);
            //return response.status(200).json(getCode('sysError', err));
            return response.status(200).json(getCode('sysErrorSite',{err:err}));
        }
        if (typeof res.code!=='undefined') return response.status(200).json(res);
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
    var shop_sysname = obj.shop_sysname;

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
            if (shop_sysname){
                o.params.param_where = {
                    sysname:shop_sysname
                };
            }else{
                o.params.param_where = {
                    is_current:true
                };
            }
            api(o, function (err, res) {
                if (err) return cb(new MyError('При попытке получить текущий магазин произошла ош.',{o:o, err:err}));
                if (!res.length) return cb(new UserError('Не удалось получить текущий магазин. Выставите ткущий магазин.'));
                shop = res[0];
                cb(null);
            })
        },
        getCategory: function (cb) {
            var o = {
                command:'get',
                object:'category',
                params:{
                    where:[
                        {
                            key:'is_active',
                            val1:true
                        }
                    ]
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
            var w3 = {
                key:'shop_id',
                val1:shop.id
            };
            o.params.where.push(w3);
            o.params.limit = obj.limit;
            o.params.page_no = obj.page_no;
            api(o, cb);
        }
    }, function (err, res) {
        return cb(err, res.getCategory[0]);
    });
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
    var shop_sysname = obj.shop_sysname;

    var products = [];
    var shop;
    var crm_user;
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
            if (shop_sysname){
                o.params.param_where = {
                    sysname:shop_sysname
                };
            }else{
                o.params.param_where = {
                    is_current:true
                };
            }
            api(o, function (err, res) {
                if (err) return cb(new MyError('При попытке получить текущий магазин произошла ош.',{o:o, err:err}));
                if (!res.length) return cb(new UserError('Не удалось получить текущий магазин. Выставите ткущий магазин.'));
                shop = res[0];
                cb(null);
            })
        },
        getProducts: function (cb) {
            var t1 = moment();
            var w, ids;
            var o = {
                command:'get',
                object:'product',
                params:{
                    where:[
                        {
                            key:'is_active',
                            val1:true
                        },
                        {
                            key:'quantity',
                            type:'>',
                            val1:0
                        },
                        {
                            key:'price_site',
                            type:'>',
                            val1:0
                        },
                        {
                            key:'shop_id',
                            val1:shop.id
                        }
                    ],
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
                        group:'siteFastSearch',
                        comparisonType:'OR',
                        key:'name',
                        type:'like',
                        val1:obj.name
                    };
                    o.params.where.push(w);
                    w = {
                        group:'siteFastSearch',
                        comparisonType:'OR',
                        key:'search_string',
                        type:'like',
                        val1:obj.name
                    };
                    o.params.where.push(w);
                    w = {
                        group:'siteFastSearch',
                        comparisonType:'OR',
                        key:'barcode',
                        type:'=',
                        val1:obj.name
                    };
                    o.params.where.push(w);
                }
            }
            o.params.limit = obj.limit;
            o.params.page_no = obj.page_no;
            api(o, function (err, res) {
                if (err) return cb(err);
                products = funcs.cloneObj(res);
                for (var i in products) {
                    if (!products[i].image) products[i].image = 'nopicture.jpg';
                    var img_name = (products[i].image.match(/\.[a-zA-Z]{2,4}$/))? products[i].image : products[i].image + '.jpg';
                    products[i].image = '/images_new/' + img_name;
                    products[i].in_basket_count = 0; // ДЛя конкретного пользователя in_basket_count только если есть в его корзине
                    products[i].is_favorite = false; //
                }
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
                            products[j].in_basket_count = +res[i].product_count;
                            break;
                        }
                    }
                }
                //products = funcs.collapseData(products);

                cb(null);
            });
        },
        getActiveUser: function (cb) {
            var o = {
                command: 'getBySidActive',
                object: 'crm_user',
                params: {
                    sid: sid
                    //columns:['name','phone']
                }
            };
            api(o, function (err, res) {
                if (err) return cb(err);
                crm_user = res.user;
                cb(null);
            });
        },
        getFavorite: function (cb) {
            if (!crm_user) return cb(null);
            var o = {
                command:'get',
                object:'crm_user_favorite',
                params:{
                    param_where:{
                        crm_user_id:crm_user.id,
                        is_active:true
                    },
                    collapseData:false
                }
            };
            api(o, function (err, res) {
                if (err) return cb(new MyError('Не удалось получить товары в избранном', {err:err}));
                for (var i in res) {
                    var product_id = res[i].product_id;
                    for (var j in products) {

                        if (products[j].id == product_id){
                            products[j].in_favorite = true;
                            break;
                        }
                    }
                }
                //products = funcs.collapseData(products);
                cb(null);
            });
        },
        collapseData: function (cb) {
            products = funcs.collapseData(products);
            cb(null);
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
                for (var i in cart.products) {
                    if (!cart.products[i].image) cart.products[i].image = 'nopicture.jpg';
                    var img_name = (cart.products[i].image.match(/\.[a-zA-Z]{2,4}$/))? cart.products[i].image : cart.products[i].image + '.jpg';
                    cart.products[i].image = '/images_new/' + img_name;
                }
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
    var is_replace = obj.is_replace;
    var sid = obj.sid;
    if (!sid) return cb(new MyError('Не передан sid'));
    if (!product_id) return cb(new MyError('Не передан product_id'));
    var product_count = (typeof obj.product_count != 'undefined')? obj.product_count : 1;

    async.series({
        add: function (cb) {
            var o = {
                command:'add',
                object:'product_in_cart',
                params:{
                    product_id:product_id,
                    sid:sid,
                    product_count:product_count,
                    is_replace:is_replace
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
    var product_count = (typeof obj.product_count != 'undefined')? obj.product_count : 1;


    async.series({
        remove: function (cb) {
            var o = {
                command:'decrise_product_in_cart',
                object:'product_in_cart',
                params:{
                    product_id:product_id,
                    sid:sid,
                    product_count:product_count
                }
            };
            api(o, cb);
        },
        getCart: function (cb) {
            api_functions.get_cart(obj, cb);
        }
    }, function (err, res) {
        if (err) return cb(err);
        var product = {product_id:res.remove[0].product_id, product_count:res.remove[0].product_count};
        cb(null, {product: product, cart: res.getCart});
    });
};

api_functions.clear_cart = function (obj, cb) {
    if (arguments.length == 1) {
        cb = arguments[0];
        obj = {};
    }
    if (typeof cb !== 'function') throw new MyError('В метод не передан cb');
    if (typeof obj !== 'object') return cb(new MyError('В метод не переданы obj'));
    var sid = obj.sid;
    if (!sid) return cb(new MyError('Не передан sid'));

    // Получить cart_id по sid
    // Вызвать remove с cart_id

    var cart;
    async.series({
        getCartBySID: function (cb) {
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
            api(o, function (err, res) {
                if (err) return cb(new MyError('Не удалось получить корзину',{err:err}));
                if (!res.length) return cb(new UserError('Корзина не найдена'));
                if (res.length > 1) return cb(new MyError('Найдено слишком много корзин',{res:res}));
                cart = res[0];
                cb(null);
            });
        },
        removeCart: function (cb) {
            var o = {
                command:'remove',
                object:'cart',
                params:{
                    id:cart.id
                }
            };
            api(o, function (err, res) {
                cb(err, res); // Если ставить "cb" то получается лажа
            });
        }
    }, function (err, res) {
        if (err) return cb(err);
        cb(null, res.removeCart);
    });
};

api_functions.create_order = function (obj, cb) {
    if (arguments.length == 1) {
        cb = arguments[0];
        obj = {};
    }
    if (typeof cb !== 'function') throw new MyError('В метод не передан cb');
    if (typeof obj !== 'object') return cb(new MyError('В метод не переданы obj'));
    var sid = obj.sid;
    if (!sid) return cb(new MyError('Не передан sid'));

    console.log('CREATE_ORDER +++>',obj);

    var o = {
        command:'add',
        object:'order_',
        params:obj
    };
    api(o, function (err, res) {
        console.log('CREATE_ORDER cb', err, res);
        cb(err, res); // Если ставить "cb" то получается лажа
    });
};

api_functions.get_user = function (obj, cb) {
    if (arguments.length == 1) {
        cb = arguments[0];
        obj = {};
    }
    console.log('====> get_user ',obj);
    if (typeof cb !== 'function') throw new MyError('В метод не передан cb');
    if (typeof obj !== 'object') return cb(new MyError('В метод не переданы obj'));
    var sid = obj.sid;
    if (!sid) return cb(new MyError('Не передан sid'));


    // load by sid
    var user;
    async.series({
        get: function (cb) {
            var o = {
                command: 'getBySidActive',
                object: 'crm_user',
                params: {
                    sid: sid,
                    columns:['id','name','phone','email','address','gate','gatecode','level','flat','status_sysname'] // status_sysname - обязательно для условия
                }
            };
            api(o, function (err, res) {
                if (err) return cb(err);
                user = res;
                cb(null);
            });
        }
    }, function (err) {
        if (err) return cb(err);
        return cb(null, user);
    });
}

api_functions.registration = function (obj, cb) {
    if (arguments.length == 1) {
        cb = arguments[0];
        obj = {};
    }
    if (typeof cb !== 'function') throw new MyError('В метод не передан cb');
    if (typeof obj !== 'object') return cb(new MyError('В метод не переданы obj'));
    var sid = obj.sid;
    if (!sid) return cb(new MyError('Не передан sid'));
    console.log('IN REGISTRATION');
    // load by sid
    var o = {
        command: 'registration',
        object: 'crm_user',
        params: obj
    };
    api(o, function (err, res) {
        if (err){
            if (err instanceof UserError){
                return cb(err);
            }
            console.log('registration ==>',err);
            return cb(new UserError('alertDeveloper',{msg:'Во время регистрации произошла ошибка.'}));
        }
        cb(null, new UserOk('Вам на почту отправлено письмо. Для завершения регистрации перейдите по ссылке из письма.'));
    });
}

api_functions.confirm_registration = function (obj, cb) {
    if (arguments.length == 1) {
        cb = arguments[0];
        obj = {};
    }
    if (typeof cb !== 'function') throw new MyError('В метод не передан cb');
    if (typeof obj !== 'object') return cb(new MyError('В метод не переданы obj'));

    console.log('IN CONFIRM_REGISTRATION');


    var o = {
        command: 'confirm_registration',
        object: 'crm_user',
        params: obj
    };
    api(o, function (err, res) {
        cb(err, res); // Если ставить "cb" то получается лажа
    });
}

api_functions.login = function (obj, cb) {
    if (arguments.length == 1) {
        cb = arguments[0];
        obj = {};
    }
    if (typeof cb !== 'function') throw new MyError('В метод не передан cb');
    if (typeof obj !== 'object') return cb(new MyError('В метод не переданы obj'));
    var sid = obj.sid;
    if (!sid) return cb(new MyError('Не передан sid'));

    var o = {
        command: 'login',
        object: 'crm_user',
        params: obj
    };
    api(o, function (err, res) {
        cb(err, res); // Если ставить "cb" то получается лажа
    });
}

api_functions.logout = function (obj, cb) {
    if (arguments.length == 1) {
        cb = arguments[0];
        obj = {};
    }
    if (typeof cb !== 'function') throw new MyError('В метод не передан cb');
    if (typeof obj !== 'object') return cb(new MyError('В метод не переданы obj'));
    var sid = obj.sid;
    if (!sid) return cb(new MyError('Не передан sid'));

    console.log('IN LOGOUT');

    var o = {
        command: 'logout',
        object: 'crm_user',
        params: obj
    };
    api(o, function (err, res) {
        cb(err, res); // Если ставить "cb" то получается лажа
    });
}


api_functions.modify_account = function (obj, cb) {
    if (arguments.length == 1) {
        cb = arguments[0];
        obj = {};
    }
    if (typeof cb !== 'function') throw new MyError('В метод не передан cb');
    if (typeof obj !== 'object') return cb(new MyError('В метод не переданы obj'));
    var sid = obj.sid;
    if (!sid) return cb(new MyError('Не передан sid'));

    console.log('IN MODIFY');

    var o = {
        command: 'modify_from_site',
        object: 'crm_user',
        params: obj
    };
    api(o, function (err, res) {
        cb(err, res); // Если ставить "cb" то получается лажа
    });
}


api_functions.restore_account = function (obj, cb) {
    if (arguments.length == 1) {
        cb = arguments[0];
        obj = {};
    }
    if (typeof cb !== 'function') throw new MyError('В метод не передан cb');
    if (typeof obj !== 'object') return cb(new MyError('В метод не переданы obj'));
    var sid = obj.sid;
    if (!sid) return cb(new MyError('Не передан sid'));

    console.log('IN MODIFY');

    var o = {
        command: 'restore_account',
        object: 'crm_user',
        params: obj
    };
    api(o, function (err, res) {
        cb(err, res); // Если ставить "cb" то получается лажа
    });
}

api_functions.confirm_restore_account = function (obj, cb) {
    if (arguments.length == 1) {
        cb = arguments[0];
        obj = {};
    }
    if (typeof cb !== 'function') throw new MyError('В метод не передан cb');
    if (typeof obj !== 'object') return cb(new MyError('В метод не переданы obj'));

    console.log('IN confirm_restore_account');

    var o = {
        command: 'confirm_restore_account',
        object: 'crm_user',
        params: obj
    };
    api(o, function (err, res) {
        cb(err, res); // Если ставить "cb" то получается лажа
    });
}

//var o = {
//    command: 'add_product_to_favorite',
//    params: {
//        sid: 'ba52542fc24e616ee776ac0e3e069cf5',
//        product_id:59780
//    }
//};
//socketQuery_site(o, function (res) {
//    console.log(res);
//})
api_functions.add_product_to_favorite = function (obj, cb) {
    if (arguments.length == 1) {
        cb = arguments[0];
        obj = {};
    }
    if (typeof cb !== 'function') throw new MyError('В метод не передан cb');
    if (typeof obj !== 'object') return cb(new MyError('В метод не переданы obj'));
    var product_id = obj.product_id;
    if (isNaN(+product_id)) return cb(new MyError('Не передан product_id'));
    var sid = obj.sid;
    if (!sid) return cb(new MyError('Не передан sid'));

    var crm_user;
    async.series({
        getActiveUser: function (cb) {
            var o = {
                command: 'getBySidActive',
                object: 'crm_user',
                params: {
                    sid: sid
                    //columns:['name','phone']
                }
            };
            api(o, function (err, res) {
                if (err) return cb(err);
                crm_user = res.user;
                cb(null);
            });
        },
        addToFavorite: function (cb) {
            var o = {
                command: 'add_product_to_favorite',
                object: 'crm_user_favorite',
                client_object:'crm_user_favorite_FAST',
                params: {
                    crm_user_id:crm_user.id,
                    product_id:product_id
                }
            };
            api(o, function (err, res) {
                cb(err, res);
            });
        }
    }, function (err, res) {
        return cb(err, res.addToFavorite);
    });

}

api_functions.remove_product_from_favorite = function (obj, cb) {
    if (arguments.length == 1) {
        cb = arguments[0];
        obj = {};
    }
    if (typeof cb !== 'function') throw new MyError('В метод не передан cb');
    if (typeof obj !== 'object') return cb(new MyError('В метод не переданы obj'));
    var product_id = obj.product_id;
    if (isNaN(+product_id)) return cb(new MyError('Не передан product_id'));
    var sid = obj.sid;
    if (!sid) return cb(new MyError('Не передан sid'));

    var crm_user;
    async.series({
        getActiveUser: function (cb) {
            var o = {
                command: 'getBySidActive',
                object: 'crm_user',
                params: {
                    sid: sid
                    //columns:['name','phone']
                }
            };
            api(o, function (err, res) {
                if (err) return cb(err);
                crm_user = res.user;
                cb(null);
            });
        },
        removeToFavorite: function (cb) {
            var o = {
                command: 'remove_product_to_favorite',
                object: 'crm_user_favorite',
                client_object:'crm_user_favorite_FAST',
                params: {
                    crm_user_id:crm_user.id,
                    product_id:product_id
                }
            };
            api(o, function (err, res) {
                cb(err, res);
            });
        }
    }, function (err, res) {
        return cb(err, res.removeToFavorite);
    });

}

api_functions.get_favorite = function (obj, cb) {
    if (arguments.length == 1) {
        cb = arguments[0];
        obj = {};
    }
    if (typeof cb !== 'function') throw new MyError('В метод не передан cb');
    if (typeof obj !== 'object') return cb(new MyError('В метод не переданы obj'));
    var sid = obj.sid;
    if (!sid) return cb(new MyError('Не передан sid'));

    var crm_user;
    var favorits;
    async.series({
        getActiveUser: function (cb) {
            var o = {
                command: 'getBySidActive',
                object: 'crm_user',
                params: {
                    sid: sid
                    //columns:['name','phone']
                }
            };
            api(o, function (err, res) {
                if (err) return cb(err);
                crm_user = res.user;
                cb(null);
            });
        },
        get: function (cb) {
            var o = {
                command: 'get',
                object: 'crm_user_favorite',
                params: {
                    param_where:{
                        crm_user_id:crm_user.id,
                        is_active:true
                    },
                    columns:['id','crm_user_id','product_id','product_name','product_image','product_price_site','product_is_active','is_active']
                }
            };
            api(o, function (err, res) {
                if (err) return cb(err);
                favorits = res;
                cb(err, res);
            });
        }
    }, function (err, res) {
        return cb(err, favorits);
    });

}

api_functions.get_orders = function (obj, cb) {
    if (arguments.length == 1) {
        cb = arguments[0];
        obj = {};
    }
    if (typeof cb !== 'function') throw new MyError('В метод не передан cb');
    if (typeof obj !== 'object') return cb(new MyError('В метод не переданы obj'));
    var sid = obj.sid;
    if (!sid) return cb(new MyError('Не передан sid'));

    var crm_user;
    var orders;
    async.series({
        getActiveUser: function (cb) {
            var o = {
                command: 'getBySidActive',
                object: 'crm_user',
                params: {
                    sid: sid
                    //columns:['name','phone']
                }
            };
            api(o, function (err, res) {
                if (err) return cb(err);
                crm_user = res.user;
                cb(null);
            });
        },
        get: function (cb) {
            var o = {
                command: 'get',
                object: 'order_',
                params: {
                    param_where:{
                        crm_user_id:crm_user.id
                    },
                    columns:['id','order_status','amount','product_count','comment']
                }
            };
            api(o, function (err, res) {
                if (err) return cb(err);
                orders = res;
                cb(err, res);
            });
        }
    }, function (err, res) {
        return cb(err, orders);
    });

}

api_functions.get_order_products = function (obj, cb) {
    if (arguments.length == 1) {
        cb = arguments[0];
        obj = {};
    }
    if (typeof cb !== 'function') throw new MyError('В метод не передан cb');
    if (typeof obj !== 'object') return cb(new MyError('В метод не переданы obj'));
    var sid = obj.sid;
    if (!sid) return cb(new MyError('Не передан sid'));
     var order_id = obj.order_id;
    if (isNaN(+order_id)) return cb(new MyError('Не передан order_id'));

    var crm_user;
    var products;
    async.series({
        getActiveUser: function (cb) {
            var o = {
                command: 'getBySidActive',
                object: 'crm_user',
                params: {
                    sid: sid
                    //columns:['name','phone']
                }
            };
            api(o, function (err, res) {
                if (err) return cb(err);
                crm_user = res.user;
                cb(null);
            });
        },
        get: function (cb) {
            var o = {
                command: 'get',
                object: 'product_in_order',
                params: {
                    param_where:{
                        crm_user_id:crm_user.id,
                        order_id:order_id
                    },
                    columns:['id','order_id','crm_user_id','product_id','name','image','price','product_count','qnt_type']
                }
            };
            api(o, function (err, res) {
                if (err) return cb(err);
                products = res;
                cb(err, res);
            });
        }
    }, function (err, res) {
        return cb(err, products);
    });

}




