/**
 * Created by iig on 29.10.2015.
 */
var MyError = require('../error').MyError;
var UserError = require('../error').UserError;
var UserOk = require('../error').UserOk;
var BasicClass = require('./system/BasicClass');
var util = require('util');
var funcs = require('../libs/functions');
var api = require('../libs/api');
var async = require('async');
var mustache = require('mustache');
var fs = require('fs');
var sendMail = require('../libs/sendMail');
var Guid = require('guid');
var generateCalndar = require('../modules/generate_calendar');
var rollback = require('../modules/rollback');
var Docxtemplater = require('docxtemplater');
var XlsxTemplate = require('xlsx-template');
var petrovich = require('petrovich');
var moment = require('moment');

var Model = function (obj) {
    this.name = obj.name;
    this.tableName = obj.name.toLowerCase();
    var basicclass = BasicClass.call(this, obj);
    if (basicclass instanceof MyError) return basicclass;
};
util.inherits(Model, BasicClass);
Model.prototype.addPrototype = Model.prototype.add;
Model.prototype.modifyPrototype = Model.prototype.modify;
Model.prototype.removePrototype = Model.prototype.remove;

Model.prototype.init = function (obj, cb) {
    if (arguments.length == 1) {
        cb = arguments[0];
        obj = {};
    }
    if (typeof cb !== 'function') throw new MyError('В метод не передан cb');
    if (typeof obj !== 'object') return cb(new MyError('В метод не переданы obj'));
    var _t = this;
    Model.super_.prototype.init.apply(this, [obj, function (err) {
        cb(null);
    }]);
};
Model.prototype.addHistory = function (obj, cb) { // Создадим запись в истории финансирования мерчанта
    var _t = this;
    if (typeof cb !== 'function') throw new MyError('В addHistory не передана функция cb');
    if (typeof obj !== 'object') return cb(new MyError('В метод не передан obj', {method: 'addHistory'}));
    var merchant_financing_id = obj.id || obj.merchant_financing_id;
    if (!merchant_financing_id) return cb(new MyError('В addHistory не передан merchant_financing_id'));
    var o = {
        command: 'add',
        object: 'merchant_financing_history_log',
        params: {
            merchant_financing_id: merchant_financing_id,
            datetime: funcs.getDateTimeMySQL()
        }
    };
    for (var i in obj) {
        o.params[i] = obj[i]
    }

    _t.api(o, function (err, res) {
        if (err) return cb(new MyError('Не удалось добавить запись в историю финансирования мерчанта.', {
            err: err,
            merchant_financing_id: merchant_financing_id,
            params: o.params
        }));
        cb(null);
    })
};
Model.prototype.setStatus = function (obj, cb) { // Установим статус финансирования
    if (typeof cb !== 'function') throw new MyError('В setStatus не передана функция cb');
    if (typeof obj !== 'object') return cb(new MyError('В метод не передан obj', {method: 'setStatus'}));
    var _t = this;
    var id = obj.id;
    var status = obj.status;
    if (isNaN(+id)) return cb(new MyError('В setStatus не передан id'));
    if (typeof status !== 'string') return cb(new MyError('В setStatus не передан status'));
    var o = {
        id: id,
        status_sysname: status,
        rollback_key:obj.rollback_key
    };
    _t.modify(o, function (err, res) {
        if (err){
            if (err.message == 'notModified') {
                console.log(err);
                return cb(null);
            }
            return cb(err);
        }
        cb(err, res);
    });
};


Model.prototype.calc_functions = {
    card_turnover: function (obj) {
        var total_mouthly_turnover = obj.total_mouthly_turnover;
        var visa_mc_percent = obj.visa_mc_percent;
        if (isNaN(+total_mouthly_turnover) || isNaN(+visa_mc_percent)) {
            console.log('Не достаточно данных для вычисления.', {
                field: 'card_turnover',
                total_mouthly_turnover: total_mouthly_turnover,
                visa_mc_percent: visa_mc_percent
            });
            return obj;
        }
        obj.card_turnover = total_mouthly_turnover * (visa_mc_percent / 100);
        return obj;
    },
    profit: function (obj) {
        var total_mouthly_turnover = obj.total_mouthly_turnover;
        var profitability = obj.profitability;
        if (isNaN(+total_mouthly_turnover) || isNaN(+profitability)) {
            console.log('Не достаточно данных для вычисления.', {
                field: 'profit',
                total_mouthly_turnover: total_mouthly_turnover,
                profitability: profitability
            });
            return obj;
        }
        obj.profit = total_mouthly_turnover * (profitability / 100);
        return obj;
    },
    profit_card: function (obj) {
        var visa_mc_percent = obj.visa_mc_percent;
        var profit = obj.profit;
        if (isNaN(+profit) || isNaN(+visa_mc_percent)) {
            console.log('Не достаточно данных для вычисления.', {
                field: 'profit_card',
                visa_mc_percent: visa_mc_percent,
                profit: profit
            });
            return obj;
        }
        obj.profit_card = profit * (visa_mc_percent / 100);
        return obj;
    },
    founding_amount: function (obj) {
        if (obj.dont_recalc_founding_amount && obj.founding_amount) return obj;
        var total_mouthly_turnover = obj.total_mouthly_turnover;
        var visa_mc_percent = obj.visa_mc_percent;
        if (isNaN(+total_mouthly_turnover) || isNaN(+visa_mc_percent)) {
            console.log('Не достаточно данных для вычисления.', {
                field: 'founding_amount',
                total_mouthly_turnover: total_mouthly_turnover,
                visa_mc_percent: visa_mc_percent
            });
            return obj;
        }
        obj.founding_amount = total_mouthly_turnover * (visa_mc_percent / 100);
        return obj;
    },
    amount_to_return: function (obj) {
        var founding_amount = obj.founding_amount;
        var factoring_rate = obj.factoring_rate;
        if (isNaN(+founding_amount) || isNaN(+factoring_rate)) {
            console.log('Не достаточно данных для вычисления.', {
                field: 'amount_to_return',
                founding_amount: founding_amount,
                factoring_rate: factoring_rate
            });
            return obj;
        }
        obj.amount_to_return = founding_amount + (founding_amount * factoring_rate / 100);
        return obj;
    },
    amount_card_day: function (obj) {
        var card_turnover = obj.card_turnover;
        var acquiring_days_count = obj.acquiring_days_count;
        if (isNaN(+card_turnover) || isNaN(+acquiring_days_count)) {
            console.log('Не достаточно данных для вычисления.', {
                field: 'amount_card_day',
                card_turnover: card_turnover,
                acquiring_days_count: acquiring_days_count
            });
            return obj;
        }
        if (acquiring_days_count === 0) {
            console.log('Не достаточно данных для вычисления. acquiring_days_count == 0');
            return obj;
        }
        obj.amount_card_day = card_turnover / acquiring_days_count;
        return obj;
    },
    payment_amount: function (obj) {
        var amount_card_day = obj.amount_card_day;
        var avl_proc_dly_withdraw_rate = obj.avl_proc_dly_withdraw_rate;
        if (isNaN(+amount_card_day) || isNaN(+avl_proc_dly_withdraw_rate)) {
            console.log('Не достаточно данных для вычисления.', {
                field: 'payment_amount',
                amount_card_day: amount_card_day,
                avl_proc_dly_withdraw_rate: avl_proc_dly_withdraw_rate
            });
            return obj;
        }
        obj.payment_amount = Math.floor(amount_card_day * avl_proc_dly_withdraw_rate / 100);
        return obj;
    },
    payments_count: function (obj) {
        var payment_amount = obj.payment_amount;
        var amount_to_return = obj.amount_to_return;
        if (isNaN(+payment_amount) || isNaN(+amount_to_return)) {
            console.log('Не достаточно данных для вычисления.', {
                field: 'payments_count',
                payment_amount: payment_amount,
                amount_to_return: amount_to_return
            });
            return obj;
        }
        if (payment_amount === 0) {
            console.log('Не достаточно данных для вычисления. payment_amount == 0');
            return obj;
        }
        obj.payments_count = Math.ceil(amount_to_return / payment_amount);
        return obj;
    }
};



///------------ADD---------------------//

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

Model.prototype.add_ = function (obj, cb) {
    if (arguments.length == 1) {
        cb = arguments[0];
        obj = {};
    }
    var _t = this;
    var merchant_id = obj.merchant_id;
    if (!merchant_id) return cb(new MyError('merchant_id не передан'));
    var confirm = obj.confirm;
    // Проверяю есть ли открытые финансирования (если есть, делаю запрос на confirm)
    // Получить данные по мерчу (чтобы использовать его поля)
    // Вызывю классический add
    // Получить данные о документах их мерча
    // Скопировать в финансирования (эти доки)
    // Записать лог о создании
    var rollback_key = obj.rollback_key || rollback.create();
    var needConfirm, merchant, merchant_financing_id, document_ids;
    async.series({
        0: function (cb) {
            // Проверяю есть ли открытые финансирования (если есть, делаю запрос на confirm)
            if (confirm) return cb(null);
            var p = {
                where:[
                    {
                        key:'merchant_id',
                        val1:merchant_id
                    },
                    {
                        key:'status_sysname',
                        type:'in',
                        val1:['CREATED','OFFER_ACCEPTED','DOCS_REQUESTED','DOCS_RECIEVED','AGREEMENT_CREATED','AGREEMENT_SENT','AGREEMENT_UPLOADED']
                    }
                ],
                collapseData: false
            };
            _t.get(p, function (err, res) {
                if (err) return cb(err);
                if (res.length) needConfirm = true;
                return cb(null);
            })
        },
        getMerchantData: function (cb) {
            // Получить данные по мерчу (чтобы использовать его поля)
            var o = {
                command: 'getById',
                object: 'merchant',
                params: {
                    id: merchant_id
                }
            };
            _t.api(o, function (err, res) {
                if (err) return cb(new MyError('Не удалось получить информацию по торговцу', {
                    err: err,
                    merchant_id: merchant_id
                }));
                if (!res.length) return cb(new MyError('Не удалось найти такого торговца', {
                    merchant_id: merchant_id
                }));
                merchant = res[0];
                return cb(null);
            });
        },
        checkRequredConditions: function (cb) {
            if (!merchant.processing_bank_id) return cb(new UserError('У торговца не указан "Рабочий банк (эквайер)" .'));
            return cb(null);
        },
        loadDefaults: function (cb) {
            _t.loadDefaultValues(obj, function (err, result_obj) {
                obj = result_obj;
                return cb(err);
            }, {standart:true});
        },
        calc: function (cb) {
            var cals_funcs = _t.calc_functions;
            for (var i in cals_funcs) {
                if (typeof cals_funcs[i]==='function') obj = cals_funcs[i](obj);
            }
            delete obj.card_turnover;
            delete obj.amount_card_day;
            cb(null);
        },
        addRow: function (cb) {
            if (needConfirm && !confirm) {
                return cb(new UserError('needConfirm', {message: 'Уже есть финансирование в статусе "СОЗДАНО". Вы уверены что хотите создать еще одно?'}));
            }
            obj.rollback_key = rollback_key;
            // Поля которые надо скопировать из мерча
            var fieldsToCopy = ['busines_type_id',"merchant_id", "total_mouthly_turnover", "visa_mc_percent", "acquiring_days_count", "avl_mth_withdraw_rate", "avl_proc_dly_withdraw_rate", "processing_bank_id",'total_mouthly_credit_card_turnover'];
            for (var i in fieldsToCopy) {
                var field_name = fieldsToCopy[i];
                obj[field_name] = obj[field_name] || merchant[field_name];
            }
            _t.addPrototype(obj, function (err, res) {
                delete obj.rollback_key;
                if (err) return cb(err);
                merchant_financing_id = res.id;
                cb(err, res);
            });
        },
        getMerchantDocs: function (cb) {
            var o = {
                command: 'get',
                object: 'merchant_document',
                params: {
                    collapseData: false,
                    columns: ['document_id'],
                    where: [
                        {
                            key: 'merchant_id',
                            val1: merchant_id
                        }
                    ]
                }
            };
            _t.api(o, function (err, res) {
                if (err) return cb(new MyError('Не удалось получить документы для данного торговца.', {
                    err: err,
                    merchant_id: merchant_id
                }));
                document_ids = res;
                cb(null);
            })
        },
        insertDocs: function (cb) { // Создадим соответствующие записи в документах финансирования мерчанта
            async.eachSeries(document_ids, function (item, cb) {
                var o = {
                    command: 'add',
                    object: 'merchant_financing_document',
                    params: {
                        merchant_financing_id: merchant_financing_id,
                        document_id: item.document_id
                    }
                };
                o.params.rollback_key = rollback_key;
                _t.api(o, function (err) {
                    if (err) return cb(new MyError('Не удалось добавить документы для данного торговца.', {
                        err: err,
                        merchant_financing_id: merchant_financing_id,
                        document_id: item.document_id
                    }));
                    cb(null);
                });
            }, cb);

        },
        setCurrentFinancingId: function (cb) {
            var o = {
                command: 'modify',
                object: 'merchant',
                params: {
                    id: merchant_id,
                    current_financing_id:merchant_financing_id
                }
            };
            o.params.rollback_key = rollback_key;
            _t.api(o, function (err, res) {
                if (err) return cb(new MyError('Не удалось устаносить текущее финансирование для торговца', {
                    err: err,
                    merchant_id: merchant_id,
                    current_financing_id:current_financing_id
                }));
                return cb(null);
            });
        },
        addHistory: function (cb) { // Создадим запись в истории мерчанта
            obj.merchant_financing_id = merchant_financing_id;
            _t.addHistory(obj, cb);
        }
    }, function (err, res) {
        if (err) {
            rollback.rollback(rollback_key, function (err, res) {
                console.log('Результат выполнения rollback', err, res);
            });
            return cb(err);
        }
        cb(null, res.addRow);
    });
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

Model.prototype.modify_old = function (obj, cb) {

    if (arguments.length == 1) {
        cb = arguments[0];
        obj = {};
    }

    var id = obj.id;
    if (isNaN(+id)) return cb(new MyError('В метод не передан id'));
    var rollback_key = obj.rollback_key || rollback.create();

    var _t = this;
    var merchant_financing;

    async.series({

        get: function (cb) {

            _t.getById({id: id}, function (err, res) {
                if (err) return cb(err);
                if (!res.length) return cb(new MyError('Не найдено финансирование.', {id: id}));
                merchant_financing = res[0];
                cb(null);
            });

        },
        check: function (cb) {

            merchant_financing.total_mouthly_credit_card_turnover = (merchant_financing.total_mouthly_credit_card_turnover == '')? merchant_financing.total_mouthly_turnover / 100 * merchant_financing.visa_mc_percent : merchant_financing.total_mouthly_credit_card_turnover;
            merchant_financing.total_mouthly_turnover = (merchant_financing.total_mouthly_turnover == '')? merchant_financing.total_mouthly_credit_card_turnover / 100 * merchant_financing.visa_mc_percent : merchant_financing.total_mouthly_turnover;
            merchant_financing.total_mouthly_credit_card_turnover = (merchant_financing.total_mouthly_credit_card_turnover == '')? merchant_financing.total_mouthly_turnover / 100 * merchant_financing.visa_mc_percent : merchant_financing.total_mouthly_credit_card_turnover;

        }



    }, function (err, res) {

        if (err) {
            if (err.message == 'needConfirm') return cb(err);
            rollback.rollback(rollback_key, function (err2) {
                return cb(err, err2);
            });
        }else{
            cb(null, new UserOk('Банк уведомлен'));
        }

    });


};

Model.prototype.setFinancingAsCurrent = function (obj, cb) {
    if (arguments.length == 1) {
        cb = arguments[0];
        obj = {};
    }
    var merchant_id = obj.merchant_id;
    var id = obj.id;
    if (isNaN(+id)) return cb(new MyError('В метод не передан id финансирования'));
    if (isNaN(+merchant_id)) return cb(new MyError('В метод не передан id торговца'));
    var _t = this;

    var o = {
        command: 'modify',
        object: 'merchant',
        params: {
            id: merchant_id,
            current_financing_id:id
        }
    };
    _t.api(o, function (err, res) {
        if (err) return cb(new MyError('Не удалось устаносить текущее финансирование для торговца', {
            err: err,
            merchant_id: merchant_id,
            current_financing_id:id
        }));
        return cb(null, new UserOk('Финансирование установлено как текущее.'));
    });
};

///--------END-ADD---------------------//

/*

 */
Model.prototype.recalcFinancing = function (obj, cb) {

    // Загрузить значение из базы
    // Выполнить функции пересчета
    // сравнить, были ли изменения
    // если были, то сохранить и записать лог
    // если нет, вернуть уведомление
    if (arguments.length == 1) {
        cb = arguments[0];
        obj = {};
    }
    var _t = this;
    var id = obj.id;
    var merchant_financing;
    if (!id || isNaN(+id)) return cb(new MyError('В recalFinancing не передан id'));
    async.series({
        load: function (cb) {
            // Загрузить значение из базы
            var params = {
                where: [
                    {
                        key: 'id',
                        val1: id
                    }
                ],
                collapseData: false
            };
            _t.get(params, function (err, res) {
                if (err) return cb(err);
                if (!res.length) return cb(new MyError('Нет такой записи в merchant_financing', {params: params}));
                merchant_financing = res[0];
                return cb(null);
            })
        },
        checkRequiredFields: function (cb) {
            // Проверим, хватает ли полей для пересчета
            if(!+merchant_financing.factoring_rate>0) return cb(new UserError('Не указана ставка факторинга.'));
            return cb(null);
        },
        recalc: function (cb) {
            // Выполнить функции пересчета
            var cals_funcs = _t.calc_functions;
            var toModify = [];
            for (var i in cals_funcs) {
                if (typeof cals_funcs[i] === 'function') {
                    var old_val = merchant_financing[i];
                    if (obj.dont_recalc_founding_amount) merchant_financing.dont_recalc_founding_amount = obj.dont_recalc_founding_amount;
                    merchant_financing = cals_funcs[i](merchant_financing);
                    if (typeof old_val !== 'undefined' && old_val !== merchant_financing[i]) {
                        toModify.push(i);
                    }
                }
            }
            if (!toModify.length) return cb(new UserError('Нет изменений для пересчета'));
            var params = {};
            for (var j in toModify) {
                params[toModify[j]] = merchant_financing[toModify[j]];
            }
            params.id = id;
            async.series([
                function (cb) {
                    _t.modify(params, cb);
                },
                function (cb) {
                    // запишем лог
                    var o = {
                        merchant_financing_id: id,
                        history_log_status_sysname: 'RECALC'
                    };
                    for (var i in merchant_financing) {
                        if (typeof o[i] !== 'undefined') continue;
                        o[i] = merchant_financing[i];
                    }
                    _t.addHistory(o, cb);
                }
            ], cb);

        }
    }, function (err, res) {
        if (err) {
            if (err instanceof UserError) return cb(err);
            return cb(err);
        }
        cb(null, new UserOk('Пересчет успешно произведен'));
    })
};

Model.prototype.recalculate = function(obj, cb){

    if (arguments.length == 1) {
        cb = arguments[0];
        obj = {};
    }
    var _t = this;
    var id = obj.id;
    var merchant_financing;
    if (!id || isNaN(+id)) return cb(new MyError('В recalFinancing не передан id'));


    async.series({
        load: function (cb) {
            // Загрузить значение из базы
            var params = {
                where: [
                    {
                        key: 'id',
                        val1: id
                    }
                ],
                collapseData: false
            };
            _t.get(params, function (err, res) {
                if (err) return cb(err);
                if (!res.length) return cb(new MyError('Нет такой записи в merchant_financing', {params: params}));
                merchant_financing = res[0];
                return cb(null);
            });
        },
        checkRequiredFields: function (cb) {
            // Проверим, хватает ли полей для пересчета

            if(!+merchant_financing.factoring_rate>0)                           return cb(new UserError('Не указана ставка факторинга.'));

            if(!+merchant_financing.total_mouthly_credit_card_turnover>0)       return cb(new UserError('Не указан месячный оборот по картам.'));

            if(!+merchant_financing.acquiring_days_count>0)                     return cb(new UserError('Не указано количество рабочих дней.'));

            if(!+merchant_financing.avl_proc_dly_withdraw_rate>0)               return cb(new UserError('Не указан макс. % списания в день по картам.'));

            //if(!+merchant_financing.total_mouthly_turnover>0)                   return cb(new UserError('Не указан общий месячный оборот.'));

            //if(!+merchant_financing.visa_mc_percent>0)                          return cb(new UserError('Не указан процент visa / mc.'));

            if(obj.recalc_type == 'by_founding_amount' && !+merchant_financing.founding_amount>0)           return cb(new UserError('Не указана сумма финанчирования'));

            if(obj.recalc_type == 'by_payment_amount' && !+merchant_financing.payment_amount>0)             return cb(new UserError('Не указана сумма платежа'));

            if(obj.recalc_type == 'by_payments_count' && !+merchant_financing.payments_count>0)             return cb(new UserError('Не указано количество платежей'));


            return cb(null);
        },
        recalc: function (cb) {

            //var toModify = [];

            var fa;
            var atr;
            var pa;
            var pc;
            var tmt;

            var params = {};

            switch(obj.recalc_type){
                case 'classic':

                    fa = parseFloat(merchant_financing.total_mouthly_credit_card_turnover);
                    atr = parseFloat(fa) + parseFloat((fa / 100 * merchant_financing.factoring_rate));
                    pa = ( parseFloat(merchant_financing.total_mouthly_credit_card_turnover) / parseInt(merchant_financing.acquiring_days_count) ) / 100 * parseInt(merchant_financing.avl_proc_dly_withdraw_rate);
                    pc = atr / pa;

                    break;
                case 'by_founding_amount':

                    fa = parseFloat(merchant_financing.founding_amount);
                    atr = parseFloat(fa) + (parseFloat(fa) / 100 * parseInt(merchant_financing.factoring_rate));
                    pa = ( parseFloat(merchant_financing.total_mouthly_credit_card_turnover) / parseInt(merchant_financing.acquiring_days_count) ) / 100 * parseInt(merchant_financing.avl_proc_dly_withdraw_rate);
                    pc = atr / pa;

                    break;
                case 'by_payment_amount':

                    fa = parseFloat(merchant_financing.total_mouthly_credit_card_turnover);
                    atr = parseFloat(fa) + (parseFloat(fa) / 100 * parseInt(merchant_financing.factoring_rate));
                    pa = parseFloat(merchant_financing.payment_amount);
                    pc = atr / pa;

                    break;
                case 'by_payments_count':

                    fa = parseFloat(merchant_financing.total_mouthly_credit_card_turnover);
                    atr = parseFloat(fa) + (parseFloat(fa) / 100 * parseInt(merchant_financing.factoring_rate));
                    pc = parseInt(merchant_financing.payments_count);
                    pa = atr/pc;

                    break;
                default :

                    fa = parseFloat(merchant_financing.total_mouthly_credit_card_turnover);
                    atr = parseFloat(fa) + parseFloat((fa / 100 * merchant_financing.factoring_rate));
                    pa = ( parseFloat(merchant_financing.total_mouthly_credit_card_turnover) / parseInt(merchant_financing.acquiring_days_count) ) / 100 * parseInt(merchant_financing.avl_proc_dly_withdraw_rate);
                    pc = atr / pa;

                    break;

            }

            params.founding_amount =        parseFloat(fa).toFixed(2);
            params.amount_to_return =       parseFloat(atr).toFixed(2);
            params.payment_amount =         parseFloat(pa).toFixed(2);
            params.payments_count =         parseInt(pc);

            params.id = id;

            async.series([
                function (cb) {
                    _t.modify(params, cb);
                },
                function (cb) {
                    // запишем лог
                    var o = {
                        merchant_financing_id: id,
                        history_log_status_sysname: 'RECALC'
                    };
                    for (var i in merchant_financing) {
                        if (typeof o[i] !== 'undefined') continue;
                        o[i] = merchant_financing[i];
                    }
                    _t.addHistory(o, cb);
                }
            ], cb);
        }
    }, function (err, res) {
        if (err) {
            if (err instanceof UserError) return cb(err);
            return cb(err);
        }
        cb(null, new UserOk('Пересчет успешно произведен'));
    })


};

Model.prototype.sendOffer = function (obj, cb) {
    if (arguments.length == 1) {
        cb = arguments[0];
        obj = {};
    }
    var _t = this;
    var id = obj.id;
    if (isNaN(+id)) return cb(new MyError('В метод не передан id финансирования'));
    // Получить данные о финансировании мерчанте
    // Получить данные о мерче
    // подготовить шаблон письма (в дальнейшем .doc)
    // Отравить на емайл
    // Поменять статус
    // Записать лог
    var tpl = '';
    var merchant, merchant_financing;
    async.series({
        getMerchantFinancing: function (cb) {
            // Получить данные о финансировании мерчанта
            _t.getById({id: id}, function (err, res) {
                if (err) return cb(err);
                if (!res.length) return cb(new MyError('Не найдено финансировани.', {id: id}));
                merchant_financing = res[0];
                cb(null);
            });
        },
        getMerchant: function (cb) {
            // Получить данные о мерчанте
            var o = {
                command:'get',
                object:'merchant',
                params:{
                    collapseData:false,
                    param_where:{
                        id:merchant_financing.merchant_id
                    }
                }
            };
            _t.api(o, function (err, res) {
                if (err) return cb(err);
                if (!res.length) return cb(new MyError('Не найден такой торговец.',{id:id}));
                merchant = res[0];
                if (!merchant.email) return cb(new UserError('У торговца не указан email.'));
                cb(null);
            });
        },
        prepareTemplate: function (cb) {
            fs.readFile('./templates/offer.html', function (err, data) {
                if (err) return cb(new MyError('Не удалось считать файл шаблона.', err));
                tpl = data.toString();

                var m_obj = {
                    founding_amount: merchant_financing.founding_amount,
                    amount_to_return: merchant_financing.amount_to_return,
                    payments_count: merchant_financing.payments_count,
                    payment_amount: merchant_financing.payment_amount,
                    factoring_rate: merchant_financing.factoring_rate,
                    fio: merchant_financing.fio
                };

                tpl = mustache.to_html(tpl, m_obj);

                cb(null);

            });

        },
        sendToEmail: function (cb) {
            // Отравить на емайл
            sendMail({email: merchant.email, html: tpl}, function (err, info) {
                if (err) return cb(new UserError('Не удалось отправить email', {err: err, info: info}));
                cb(null);
            });
        },
        changeStatus: function (cb) {
            // Поменять статус
            _t.setStatus({
                id: id,
                status: 'OFFER_SENDED'
            }, function (err) {
                if (err) return cb(new UserError('Предложение отправлено. Но не удалось изменить статус финансирования торговца. Обратитесь к администратору.', {err: err}));
                cb(null);
            });
        },
        addLog: function (cb) {
            // Записать лог
            var o = {
                history_log_status_sysname: 'OFFER_SENDED'
            };
            for (var i in merchant_financing) {
                if (typeof o[i] !== 'undefined') continue;
                o[i] = merchant_financing[i];
            }
            _t.addHistory(o, cb);
        }
    }, function (err, res) {
        if (err) return cb(err);
        cb(null, new UserOk('Предложение успешно отправлено'));

    });
};

Model.prototype.denyOffer = function (obj, cb) {
    if (arguments.length == 1) {
        cb = arguments[0];
        obj = {};
    }
    var _t = this;
    var id = obj.id;
    if (isNaN(+id)) return cb(new MyError('В метод не передан id финансирования'));
    if (!obj.merchant_financing_deny_reason_id) return cb(new UserError('Не указана причина отказа.'));
    if (!obj.comment) return cb(new UserError('Комментарий обязательно должен быть указан.'));

    // Получить данные о финансировании
    // Поменять статус
    // Записать лог
    var merchant_financing;
    async.series({
        getMerchantFinancing: function (cb) {
            // Получить данные о финансировании
            _t.getById({id: id}, function (err, res) {
                if (err) return cb(err);
                if (!res.length) return cb(new MyError('Не найдено финансированиие.', {id: id}));
                merchant_financing = res[0];
                if (merchant_financing.status_sysname !== 'OFFER_SENDED') return cb(new UserError('Заявка должна быть отправлена торговцу.'));
                cb(null);
            });
        },
        changeStatus: function (cb) {
            // Поменять статус
            _t.setStatus({
                id: id,
                status: 'OFFER_DECLINED'
            }, function (err) {
                if (err) return cb(new UserError('Не удалось отклонить заявку. Обратитесь к администратору.', {err: err}));
                cb(err);
            });
        },
        addLog: function (cb) {
            // Записать лог
            var o = {
                id: id,
                history_log_status_sysname: 'OFFER_DECLINED'
            };
            for (var i in merchant_financing) {
                if (typeof o[i] !== 'undefined') continue;
                o[i] = merchant_financing[i];
            }
            o.merchant_financing_deny_reason_id = obj.merchant_financing_deny_reason_id;
            o.comment = obj.comment;
            _t.addHistory(o, cb);
        }
    }, function (err, res) {
        if (err) {
            // Поменять статус обратно
            _t.setStatus({
                id: id,
                status: merchant_financing.status_sysname || 'OFFER_SENDED'
            }, function (err2) {
                if (err2) console.log(err2);
                return cb(err);
            });
        } else {
            cb(null, new UserOk('Предложение успешно отклонено'));
        }

    })
};

Model.prototype.acceptOffer = function (obj, cb) {
    if (arguments.length == 1) {
        cb = arguments[0];
        obj = {};
    }
    var _t = this;
    var id = obj.id;
    if (isNaN(+id)) return cb(new MyError('В метод не передан id финансирования'));
    // Получить данные о мерчанте
    // Поменять статус
    // Записать лог
    var merchant_financing;
    async.series({
        getMerchantFinancing: function (cb) {
            // Получить данные о финансировании
            _t.getById({id: id}, function (err, res) {
                if (err) return cb(err);
                if (!res.length) return cb(new MyError('Не найдено финансирование.', {id: id}));
                merchant_financing = res[0];
                if (merchant_financing.status_sysname !== 'OFFER_SENDED') return cb(new UserError('Заявка должна быть отправлена торговцу.'));
                cb(null);
            });
        },
        changeStatus: function (cb) {
            // Поменять статус
            _t.setStatus({
                id: id,
                status: 'OFFER_ACCEPTED'
            }, function (err) {
                if (err) return cb(new UserError('Не удалось принять заявку. Обратитесь к администратору.', {err: err}));
                cb(err);
            });
        },
        addLog: function (cb) {
            // Записать лог
            var o = {
                id: id,
                history_log_status_sysname: 'OFFER_ACCEPTED'
            };
            for (var i in merchant_financing) {
                if (typeof o[i] !== 'undefined') continue;
                o[i] = merchant_financing[i];
            }
            _t.addHistory(o, cb);
        }
    }, function (err, res) {
        if (err) {
            // Поменять статус обратно
            _t.setStatus({
                id: id,
                status: merchant_financing.status_sysname || 'OFFER_SENDED'
            }, function (err2) {
                if (err2) console.log(err2);
                return cb(err);
            });
        } else {
            cb(null, new UserOk('Предложение успешно принято'));
        }

    })
};

Model.prototype.requestDocuments = function (obj, cb) {
    if (arguments.length == 1) {
        cb = arguments[0];
        obj = {};
    }
    var _t = this;
    var id = obj.id;
    if (isNaN(+id)) return cb(new MyError('В метод не передан id финансирования'));
    // Получить данные о мерчанте
    // подготовить шаблон письма (в дальнейшем .doc)
    // Отравить на емайл
    // Поменять статус
    // Записать лог
    var tpl = '';
    var merchant, merchant_financing;
    var docs;
    var docNames = [];
    async.series({
        getMerchantFinancing: function (cb) {
            // Получить данные о финансировании мерчанта
            _t.getById({id: id}, function (err, res) {
                if (err) return cb(err);
                if (!res.length) return cb(new MyError('Не найдено финансировани.', {id: id}));
                merchant_financing = res[0];
                cb(null);
            });
        },
        getMerchant: function (cb) {
            // Получить данные о мерчанте
            var o = {
                command:'get',
                object:'merchant',
                params:{
                    collapseData:false,
                    param_where:{
                        id:merchant_financing.merchant_id
                    }
                }
            };
            _t.api(o, function (err, res) {
                if (err) return cb(err);
                if (!res.length) return cb(new MyError('Не найден такой торговец.',{id:id}));
                merchant = res[0];
                if (!merchant.email) return cb(new UserError('У торговца не указан email.'));
                cb(null);
            });
        },
        getDocs: function (cb) {
            var o = {
                command: 'get',
                object: 'Merchant_financing_document',
                params: {
                    collapseData: false,
                    where: [
                        {
                            key: 'merchant_financing_id',
                            val1: merchant_financing.id
                        },
                        {
                            key: 'status_sysname',
                            val1: 'CREATED'
                        }
                    ]
                }
            };

            _t.api(o, function (err, res) {

                if (err) return cb(new MyError('Не удалось получить документы финансирования.', {
                    err: err,
                    merchant_financing_id: merchant_financing.id,
                    params: o.params
                }));
                docs = res;
                cb(null);
            });
        },
        prepareTemplate: function (cb) {
            fs.readFile('./templates/request_docs.html', function (err, data) {
                if (err) return cb(new MyError('Не удалось считать файл шаблона.', err));
                tpl = data.toString();

                var m_obj = {
                    founding_amount: merchant_financing.founding_amount,
                    amount_to_return: merchant_financing.amount_to_return,
                    payments_count: merchant_financing.payments_count,
                    payment_amount: merchant_financing.payment_amount,
                    factoring_rate: merchant_financing.factoring_rate,
                    fio: merchant.fio,
                    docs: []
                };

                for (var i in docs) {
                    m_obj.docs.push({
                        title: docs[i].document_name
                    });
                    docNames.push(docs[i].document_name);
                }

                tpl = mustache.to_html(tpl, m_obj);

                cb(null);

            });

        },
        sendToEmail: function (cb) {
            // Отравить на емайл
            sendMail({email: merchant.email, html: tpl}, function (err, info) {
                if (err) return cb(new UserError('Не удалось отправить email', {err: err, info: info}));
                cb(null);
            });
        },
        changeStatus: function (cb) {
            // Поменять статус
            _t.setStatus({
                id: id,
                status: 'DOCS_REQUESTED'
            }, function (err) {
                if (err) return cb(new UserError('Предложение отправлено. Но не удалось изменить статус финансирования. Обратитесь к администратору.', {err: err}));
                cb(null);
            });
        },
        updateDocsStatuses: function (cb) {
            // Проставить документам статусы
            async.eachSeries(docs, function (item, cb) {
                var o = {
                    command: 'modify',
                    object: 'Merchant_financing_document',
                    params: {
                        id: item.id,
                        status_sysname: 'REQUESTED'
                    }
                };

                _t.api(o, cb);

            }, cb);
        },
        addLog: function (cb) {
            // Записать лог
            var o = {
                id: id,
                history_log_status_sysname: 'DOCS_REQUESTED'
            };
            for (var i in merchant_financing) {
                if (typeof o[i] !== 'undefined') continue;
                o[i] = merchant_financing[i];
            }

            o.comment = docNames.join(', ');

            _t.addHistory(o, cb);
        }
    }, function (err, res) {
        if (err) return cb(err);
        cb(null, new UserOk('Предложение успешно отправлено'));

    });
};


Model.prototype.testDoc = function (obj, cb) {
    if (arguments.length == 1) {
        cb = arguments[0];
        obj = {};
    }
    var _t = this;
    var id = obj.id;
    //Load the docx file as a binary
    fs.readFile('./templates/test.docx', function (err, data) {
        if (err) return cb(new MyError('Не удалось считать файл шаблона догово.', err));
        //var tpl = data.toString();
        var doc = new Docxtemplater(data);

        //set the templateVariables
        doc.setData({
            "company_agent":'ООО "Мир Билета"',
            "agent_fio":"Гоптарева Ивана Ивановича",
            "company_subagent":'ООО "Мир Билетов"',
            "subagent_fio":"Гоптарева Александра Ивановича"
        });

        //apply them (replace all occurences of {first_name} by Hipp, ...)
        doc.render();

        var buf = doc.getZip()
            .generate({type:"nodebuffer"});

        fs.writeFile('./templates/testOutput.docx',buf, function (err) {
            if (err) return cb(new MyError('Не удалось записать файл договора',{err:err}));
            return cb(null, new UserOk('Договор успешно сформирован'));
        });
    });
};

Model.prototype.prepareAgreement = function (obj, cb) {
    if (arguments.length == 1) {
        cb = arguments[0];
        obj = {};
    }
    var _t = this;
    var id = obj.id;
    //var agreement_date = obj.agreement_date;
    if (isNaN(+id)) return cb(new MyError('В метод не передан id финансирования'));
    //if (!funcs.validation.isDate(agreement_date)) return cb(new UserError('Неверно указана дата договора.'));
    var confirm = obj.confirm;
    var confirmKey = obj.confirmKey;
    var rollback_key = obj.rollback_key || rollback.create();
    // Проверим статус финансирования ( он должен быть OFFER_ACCEPTED/DOCS_REQUESTED/DOCS_RECIEVED)
    // Проверим существование записи документа с типом ДОГОВОР (если есть то перезапишем после Confirm)
    // Соберем необходимые данные запросим подтверждение
    // Если чего то не хватает формируем как есть и предупреждаем
    // Подготовим файл договора на основе шаблона и данных собранных ранее
    // Создаем запись документа с типом договор (или берем существующую)
    // Сохраняем его в serverUploads и вызываем File add (как будто пользователь нажал 'загрузить файл"
    // Скачиваем файл


    var merchant, merchant_financing, main_agreement_doc, main_agreement_doc_id, main_agreement_scan, main_agreement_scan_id;
    var main_agreement_tmp_filename = Guid.create().value;
    async.series({
        getMerchantFinancing: function (cb) {
            // Получить данные о финансировании мерчанта
            // Проверим статус финансирования ( он должен быть OFFER_ACCEPTED/DOCS_REQUESTED/DOCS_RECIEVED)
            _t.getById({id: id}, function (err, res) {
                if (err) return cb(err);
                if (!res.length) return cb(new MyError('Не найдено финансировани.', {id: id}));
                merchant_financing = res[0];
                if (['OFFER_ACCEPTED','DOCS_REQUESTED','DOCS_RECIEVED','AGREEMENT_CREATED','AGREEMENT_SENT','AGREEMENT_UPLOADED'].indexOf(merchant_financing.status_sysname)==-1){
                    var statuses = ['Предложение одобрено','Документы запрошены','Документы получены','Договор сформирован','Договор отправлен','Договор загружен'].join(', ');
                    return cb(new UserError('Финансирование должно быть в одном из следующих статусов: ' + statuses, {
                        id:id,
                        status:merchant_financing.status
                    }));
                }
                cb(null);
            });
        },
        checkDocRecord: function (cb) {
            // Проверим существование записи документа с типом ДОГОВОР (если есть то перезапишем после Confirm)
            var o = {
                command:'get',
                object:'merchant_financing_document',
                params:{
                    param_where:{
                        document_sysname:'MAIN_AGREEMENT_DOC',
                        merchant_financing_id:id
                    },
                    collapseData:false
                }
            };
            _t.api(o, function (err, res) {
                if (err) return cb(new MyError('Не удалось получить информацию по документам финансирования.',{o:o,err:err}));
                if (!res.length) return cb(null); // Договор и скан еще не были сформированы, можно идти дальше
                if (res.length > 1) return cb(new UserError('Слишком много договоров загружено, удалите неиспользуемые.')); // Такая ситуация может быть только если договор добавили вручную
                main_agreement_doc = res[0];
                main_agreement_doc_id = res[0].id;
                if (!confirm || confirmKey != 1) {
                    return cb(new UserError('needConfirm', {message: 'Договор уже был создан. В случае продолжения он будут перезаписан!"',title:'Перезаписать файл договора?',key:1, confirmType:'dialog'}));
                }
                return cb(null);
            });
        },
        checkScanRecord: function (cb) {
            // Проверим существование записи документа с типом ДОГОВОР(СКАН)
            var o = {
                command:'get',
                object:'merchant_financing_document',
                params:{
                    param_where:{
                        document_sysname:'MAIN_AGREEMENT_PDF',
                        merchant_financing_id:id
                    },
                    collapseData:false
                }
            };
            _t.api(o, function (err, res) {
                if (err) return cb(new MyError('Не удалось получить информацию по скану договора финансирования.',{o:o,err:err}));
                if (!res.length) return cb(null); // Cкан еще не были сформированы, можно идти дальше
                if (res.length > 1) return cb(new UserError('Слишком много сканов загружено, удалите неиспользуемые.')); // Такая ситуация может быть только если договор добавили вручную
                main_agreement_scan = res[0];
                main_agreement_scan_id = res[0].id;
                return cb(null);
            });
        },
        getMerchant: function (cb) {
            // Получить данные о мерчанте
            var o = {
                command:'get',
                object:'merchant',
                params:{
                    collapseData:false,
                    param_where:{
                        id:merchant_financing.merchant_id
                    }
                }
            };
            _t.api(o, function (err, res) {
                if (err) return cb(err);
                if (!res.length) return cb(new MyError('Не найден такой торговец.',{id:id}));
                merchant = res[0];
                cb(null);
            });
        },
        //getDataAndValidate: function (cb) {
        //    // merchant: name, executive_fio, grounds_on, email
        //    // financing: founding_amount, amount_to_return, payments_count, payment_amount, factoring_rate
        //
        //}
        createDoc: function (cb) {
            // Подготовим файл договора на основе шаблона и данных собранных ранее
            fs.readFile('./templates/main_agreement.docx', function (err, data) {
                if (err) return cb(new MyError('Не удалось считать файл шаблона договора.', err));
                var doc = new Docxtemplater(data);
                if (!merchant.executive_fio.length) return cb(new UserError('Необходимо указать ФИО в карточке торговца.'));
                var fio = merchant.executive_fio.match(/\S+/ig);
                if (fio.length!==3) return cb(new UserError('ФОИ должно быть указано полностью'));
                var gender = petrovich.detect_gender(fio[2]);
                if (gender == 'androgynous') gender = 'male';
                var f = petrovich[gender].first.genitive(fio[0]);
                var i = petrovich[gender].last.genitive(fio[1]);
                var o = petrovich[gender].middle.genitive(fio[2]);
                var fio_str = f + ' ' + i + ' ' + o;

                doc.setData({
                    "ccs_name":merchant.name || '',
                    "ccs_executive_fio":fio_str || '_______________________________',
                    "ccs_grounds_on":merchant.grounds_on || '___________________',
                    "ccs_founding_amount":merchant_financing.founding_amount || '___________________',
                    "ccs_amount_to_return":merchant_financing.amount_to_return || '___________________',
                    "ccs_payments_count":merchant_financing.payments_count || '___________________',
                    "ccs_payment_amount":merchant_financing.payment_amount || '___________________',
                    "ccs_factoring_rate":merchant_financing.factoring_rate || '___________________'
                });
                doc.render();
                var buf = doc.getZip().generate({type:"nodebuffer"});
                fs.writeFile('./serverUploads/'+ main_agreement_tmp_filename +'.docx',buf, function (err) {
                    if (err) return cb(new MyError('Не удалось записать файл договора',{err:err}));
                    return cb(null);
                });
            });
        },
        addScanRow: function (cb) {
            // Создаем запись скана документа, ели есть оставим как есть
            if (main_agreement_scan_id) return cb(null);
            async.waterfall([
                function (cb) {
                    // Получим document_id
                    var o = {
                        command: 'get',
                        object: 'document',
                        params: {
                            param_where:{
                                sysname:'MAIN_AGREEMENT_PDF'
                            },
                            collapseData:false
                        }
                    };
                    _t.api(o, function (err, res) {
                        if (err) return cb(new MyError('Не удалось получить документ с типом MAIN_AGREEMENT_PDF',{err:err}));
                        if (!res.length) return cb(new UserError('Не удалось найти документ с типом MAIN_AGREEMENT_PDF - Основной договор (скан). Заведите такой документ в справочнике.'));
                        if (res.length > 1) return cb(new UserError('Слишком много документов с типом MAIN_AGREEMENT_PDF - Основной договор (скан). Удалите лишние.'));
                        cb(null, res[0].id);
                    });
                },
                function (document_id, cb) {
                    var o = {
                        command: 'add',
                        object: 'merchant_financing_document',
                        params: {
                            merchant_financing_id: id,
                            document_id: document_id
                        }
                    };
                    o.params.rollback_key = rollback_key;
                    _t.api(o, function (err, res) {
                        if (err) return cb(new MyError('Не удалось добавить документ "Основной договор (скан)" для данного финансирования.', {
                            err: err,
                            merchant_financing_id: id,
                            document_id: document_id
                        }));
                        main_agreement_scan_id = res.id;
                        cb(null);
                    })
                }
            ], cb);
        },
        addDocRow: function (cb) {
            // Создаем запись документа с типом договор (или берем существующую)
            if (main_agreement_doc) return cb(null);
            async.waterfall([
                function (cb) {
                    // Получим document_id
                    var o = {
                        command: 'get',
                        object: 'document',
                        params: {
                            param_where:{
                                sysname:'MAIN_AGREEMENT_DOC'
                            },
                            collapseData:false
                        }
                    };
                    _t.api(o, function (err, res) {
                        if (err) return cb(new MyError('Не удалось получить документ с типом MAIN_AGREEMENT_DOC',{err:err}));
                        if (!res.length) return cb(new UserError('Не удалось найти документ с типом MAIN_AGREEMENT_DOC - Основной договор (скан). Заведите такой документ в справочнике.'));
                        if (res.length > 1) return cb(new UserError('Слишком много документов с типом MAIN_AGREEMENT_DOC - Основной договор (скан). Удалите лишние.'));
                        cb(null, res[0].id);
                    });
                },
                function (document_id, cb) {
                    var o = {
                        command: 'add',
                        object: 'merchant_financing_document',
                        params: {
                            merchant_financing_id: id,
                            document_id: document_id
                        }
                    };
                    o.params.rollback_key = rollback_key;
                    _t.api(o, function (err, res) {
                        if (err) return cb(new MyError('Не удалось добавить документ "Основной договор" для данного финансирования.', {
                            err: err,
                            merchant_financing_id: id,
                            document_id: document_id
                        }));
                        main_agreement_doc_id = res.id;
                        cb(null);
                    })
                }
            ], cb);
        },
        getDocIfHaveNot: function (cb) {
            // Запросим документ договора если он был только что добавлен
            if (main_agreement_doc) return cb(null);
            var o = {
                command:'get',
                object:'merchant_financing_document',
                params:{
                    param_where:{
                        id:main_agreement_doc_id
                    },
                    collapseData:false
                }
            };
            _t.api(o, function (err, res) {
                if (err) return cb(new MyError('Не удалось получить информацию по документам финансирования.',{o:o,err:err}));
                if (!res.length) return cb(new UserError('Не удалось получить запись Основного договора.'));
                main_agreement_doc = res[0];
                return cb(null);
            });
        },
        //setAgreementDate: function (cb) {
        //    var params = {
        //        id:id,
        //        agreement_date:agreement_date,
        //        rollback_key:rollback_key
        //    };
        //    _t.modify(params, function (err, res) {
        //        if (err) return cb(new MyError('Не удалось установить дату договора', {
        //            err: err,
        //            merchant_financing_id: id,
        //            agreement_date: agreement_date
        //        }));
        //        merchant_financing.agreement_date = agreement_date;
        //        cb(null);
        //    })
        //},
        uploadDoc: function (cb) {
            var o = {
                command: "uploadDocument",
                object: "Merchant_financing_document",
                params: {
                    filename: main_agreement_tmp_filename+'.docx',
                    id: main_agreement_doc_id
                }
            };
            _t.api(o, cb);
        },
        changeStatus: function (cb) {
            // Поменять статус
            _t.setStatus({
                id: id,
                status: 'AGREEMENT_CREATED'
            }, function (err) {
                if (err) return cb(new UserError('Договор сформирован. Но не удалось изменить статус финансирования. Обратитесь к администратору.', {err: err}));
                cb(null);
            });
        },
        addLog: function (cb) {
            // Записать лог
            var o = {
                id: id,
                history_log_status_sysname: 'AGREEMENT_CREATED'
            };
            for (var i in merchant_financing) {
                if (typeof o[i] !== 'undefined') continue;
                o[i] = merchant_financing[i];
            }

            var merchInfo = [merchant.name, merchant.executive_fio, merchant.grounds_on];
            o.comment = merchInfo.join(', ');

            _t.addHistory(o, cb);
        }

    }, function (err, res) {
        if (err) {
            if (err.message == 'needConfirm') return cb(err);
            rollback.rollback(rollback_key, function (err2) {
                return cb(err, err2);
            });
        }else{
            main_agreement_doc.file_id = res.uploadDoc[0].file_id;
            cb(null, new UserOk('Договор был успешно сформирован.',{main_agreement_doc:main_agreement_doc}));
        }
    });


};

Model.prototype.sendAgreement = function (obj, cb) {
    if (arguments.length == 1) {
        cb = arguments[0];
        obj = {};
    }
    var _t = this;
    var id = obj.id;
    if (isNaN(+id)) return cb(new MyError('В метод не передан id финансирования'));
    // Получить данные о мерчанте
    // Получить данные о финансировании
    // подготовить шаблон письма
    // Получить договор из документов
        // Загрузить запись документов
        // Получить инфу от файла
    // Отравить на емайл + attach
    // Поменять статус
    // Записать лог
    var tpl = '';
    var merchant, merchant_financing, main_agreement_doc, agreement_file;
    var attachments = [];
    async.series({
        getMerchantFinancing: function (cb) {
            // Получить данные о финансировании мерчанта
            // Проверим статус финансирования ( он должен быть OFFER_ACCEPTED/DOCS_REQUESTED/DOCS_RECIEVED)
            _t.getById({id: id}, function (err, res) {
                if (err) return cb(err);
                if (!res.length) return cb(new MyError('Не найдено финансировани.', {id: id}));
                merchant_financing = res[0];
                if (['AGREEMENT_CREATED','AGREEMENT_SENT','AGREEMENT_UPLOADED'].indexOf(merchant_financing.status_sysname)==-1){
                    var statuses = ['Договор сформирован','Договор отправлен','Договор загружен'].join(', ');
                    return cb(new UserError('Финансирование должно быть в одном из следующих статусов: ' + statuses, {
                        id:id,
                        status:merchant_financing.status
                    }));
                }
                cb(null);
            });
        },
        getMerchant: function (cb) {
            // Получить данные о мерчанте
            var o = {
                command:'get',
                object:'merchant',
                params:{
                    collapseData:false,
                    param_where:{
                        id:merchant_financing.merchant_id
                    }
                }
            };
            _t.api(o, function (err, res) {
                if (err) return cb(err);
                if (!res.length) return cb(new MyError('Не найден такой торговец.',{id:id}));
                merchant = res[0];
                cb(null);
            });
        },
        prepareTemplate: function (cb) {
            fs.readFile('./templates/main_agreement.html', function (err, data) {
                if (err) return cb(new MyError('Не удалось считать файл шаблона.', err));
                tpl = data.toString();

                var m_obj = {
                    founding_amount: merchant.founding_amount,
                    amount_to_return: merchant.amount_to_return,
                    payments_count: merchant.payments_count,
                    payment_amount: merchant.payment_amount,
                    factoring_rate: merchant.factoring_rate,
                    fio: merchant.fio,
                    name: merchant.name,
                    docs: []
                };


                tpl = mustache.to_html(tpl, m_obj);

                cb(null);

            });

        },
        attachAgreements: function (cb) {
            // Получить договор из документов
            // Загрузить запись документов
            // Получить инфу от файла
            async.series([
                function (cb) {
                    // Загрузить запись документов
                    var o = {
                        command:'get',
                        object:'merchant_financing_document',
                        params:{
                            param_where:{
                                document_sysname:'MAIN_AGREEMENT_DOC',
                                status_sysname:'UPLOADED',
                                merchant_financing_id:id
                            },
                            collapseData:false
                        }
                    };
                    _t.api(o, function (err, res) {
                        if (err) return cb(new MyError('Не удалось получить информацию по договору финансирования.',{o:o,err:err}));
                        if (!res.length) return cb(new UserError('Договор еще не загружен.')); // Такая ситуация может быть только если договор добавили вручную
                        if (res.length > 1) return cb(new UserError('Слишком много договоров загружено, удалите неиспользуемые.')); // Такая ситуация может быть только если договор добавили вручную
                        main_agreement_doc = res[0];
                        return cb(null);
                    });
                },
                function (cb) {
                    // Получить инфу от файла
                    var o = {
                        command:'get',
                        object:'file',
                        params:{
                            param_where:{
                                id:main_agreement_doc.file_id
                            },
                            collapseData:false
                        }
                    };
                    _t.api(o, function (err, res) {
                        if (err) return cb(new MyError('Не удалось получить информацию по файлу договора.',{o:o,err:err}));
                        if (!res.length) return cb(new UserError('Файл договора еще не загружен.')); // Такая ситуация может быть только если договор добавили вручную
                        agreement_file = res[0];
                        return cb(null);
                    });
                }
            ], function (err) {
                if (err) return cb(err);
                attachments = [
                    {   // file on disk as an attachment
                        filename: main_agreement_doc.document_name + agreement_file.extension,
                        path: agreement_file.filepath + agreement_file.filename + agreement_file.extension
                    }
                ];
                cb(null);
            });

        },
        sendToEmail: function (cb) {
            // Отравить на емайл
            sendMail({email: merchant.email, html: tpl, attachments: attachments}, function (err, info) {
                if (err) return cb(new UserError('Не удалось отправить email', {err: err, info: info}));
                cb(null);
            });
        },
        changeStatus: function (cb) {
            // Поменять статус
            _t.setStatus({
                id: id,
                status: 'AGREEMENT_SENT'
            }, function (err) {
                if (err) return cb(new UserError('Договор отправлен. Но не удалось изменить статус финансирования. Обратитесь к администратору.', {err: err}));
                cb(null);
            });
        },
        addLog: function (cb) {
            // Записать лог
            var o = {
                history_log_status_sysname: 'AGREEMENT_SENT'
            };
            for (var i in merchant) {
                if (typeof o[i] !== 'undefined') continue;
                o[i] = merchant[i];
            }

            _t.addHistory(o, cb);
        }
    }, function (err, res) {
        if (err) return cb(err);
        cb(null, new UserOk('Договор успешно отправлен'));
    });
};

Model.prototype.uploadMainAgreement = function (obj, cb) {
    if (arguments.length == 1) {
        cb = arguments[0];
        obj = {};
    }
    var _t = this;
    var id = obj.id;
    //var agreement_date = obj.agreement_date;
    if (isNaN(+id)) return cb(new MyError('В метод не передан id торговца'));
    if (!obj.filename) return cb(new UserError('Файл не указан'));
    var rollback_key = obj.rollback_key || rollback.create();

    // Получить данные о финансировании мерчанта
    // Получить id документа типа MAIN_AGREEMENT_PDF
    // загрузить ему файл
    // сменить статус
    // записать лог

    var merchant_financing, main_agreement_scan;
    async.series({
        getMerchantFinancing: function (cb) {
            // Получить данные о финансировании мерчанта
            _t.getById({id: id}, function (err, res) {
                if (err) return cb(err);
                if (!res.length) return cb(new MyError('Не найдено финансирование.', {id: id}));
                merchant_financing = res[0];
                if (['AGREEMENT_SENT','AGREEMENT_UPLOADED'].indexOf(merchant_financing.status_sysname)==-1){
                    var statuses = ['Договор отправлен','Договор загружен'].join(', ');
                    return cb(new UserError('Финансирование должно быть в одном из следующих статусов: ' + statuses, {
                        id:id,
                        status:merchant_financing.status
                    }));
                }
                cb(null);
            });
        },
        getScanDoc: function (cb) {
            var o = {
                command:'get',
                object:'merchant_financing_document',
                params:{
                    param_where:{
                        document_sysname:'MAIN_AGREEMENT_PDF',
                        merchant_financing_id:id
                    },
                    collapseData:false
                }
            };
            _t.api(o, function (err, res) {
                if (err) return cb(new MyError('Не удалось получить информацию по скану договора финансирования.',{o:o,err:err}));
                if (!res.length) return cb(new UserError('Не удалось найти нужный документ')); // Такая ситуация может быть только если договор добавили вручную
                if (res.length > 1) return cb(new UserError('Слишком много записей сканов, удалите неиспользуемые.')); // Такая ситуация может быть только если договор добавили вручную
                main_agreement_scan = res[0];
                return cb(null);
            });
        },
        uploadScan: function (cb) {
            // загрузить ему файл
            var o = {
                command: "uploadDocument",
                object: "Merchant_financing_document",
                params: {
                    filename: obj.filename,
                    id: main_agreement_scan.id
                }
            };
            _t.api(o, cb);
        },
        //setAgreementDate: function (cb) {
        //    if (agreement_date === merchant_financing.agreement_date || !funcs.validation.isDate(agreement_date)) return cb(null);
        //    var params = {
        //        id:id,
        //        agreement_date:agreement_date,
        //        rollback_key:rollback_key
        //    };
        //    _t.modify(params, function (err, res) {
        //        if (err) return cb(new MyError('Не удалось установить дату договора', {
        //            err: err,
        //            merchant_financing_id: id,
        //            agreement_date: agreement_date
        //        }));
        //        merchant_financing.agreement_date = agreement_date;
        //        cb(null);
        //    })
        //},
        changeStatus: function (cb) {
            // Поменять статус
            _t.setStatus({
                id: id,
                status: 'AGREEMENT_UPLOADED'
            }, function (err) {
                if (err) return cb(new UserError('Не удалось изменить статус финансирования. Обратитесь к администратору.', {err: err}));
                cb(null);
            });
        },
        addLog: function (cb) {
            // Записать лог
            var o = {
                id: id,
                history_log_status_sysname: 'AGREEMENT_UPLOADED'
            };
            for (var i in merchant_financing) {
                if (typeof o[i] !== 'undefined') continue;
                o[i] = merchant_financing[i];
            }
            o.comment = obj.filename;
            _t.addHistory(o, cb);
        }
    }, function (err) {
        if (err) {
            if (err.message == 'needConfirm') return cb(err);
            rollback.rollback(rollback_key, function (err2) {
                return cb(err, err2);
            });
        }else{
            cb(null, new UserOk('Скан договора успешно загружен в систему'));
        }
    });
};

/**
 * AGREEMENT_UPLOADED --> READY_TO_WORK
 * @param obj
 * @param cb
 * @returns {*}
 */
Model.prototype.transferToWork = function (obj, cb) {
    if (arguments.length == 1) {
        cb = arguments[0];
        obj = {};
    }
    var _t = this;
    var id = obj.id;
    if (isNaN(+id)) return cb(new MyError('В метод не передан id финансирования'));
    var confirm = obj.confirm;
    var rollback_key = obj.rollback_key || rollback.create();

    // Получим данные по финансированию
    // Проверим статус
    // Смена статуса + лог

    var merchant_financing;
    async.series({
        getMerchantFinancing: function (cb) {
            // Получить данные о финансировании мерчанта
            _t.getById({id: id}, function (err, res) {
                if (err) return cb(err);
                if (!res.length) return cb(new MyError('Не найдено финансирование.', {id: id}));
                merchant_financing = res[0];
                cb(null);
            });
        },
        checkAnother: function (cb) {
            if (['AGREEMENT_UPLOADED'].indexOf(merchant_financing.status_sysname)==-1){
                var statuses = ['Договор загружен'].join(', ');
                return cb(new UserError('Финансирование должно быть в одном из следующих статусов: ' + statuses, {
                    id:id,
                    status:merchant_financing.status
                }));
            }
            cb(null);
        },
        changeStatus: function (cb) {
            // Поменять статус
            _t.setStatus({
                id: id,
                status: 'READY_TO_WORK'
            }, function (err) {
                if (err) return cb(new UserError('Не удалось изменить статус финансирования. Обратитесь к администратору.', {err: err}));
                cb(null);
            });
        },
        addLog: function (cb) {
            // Записать лог
            var o = {
                id: id,
                history_log_status_sysname: 'READY_TO_WORK'
            };
            for (var i in merchant_financing) {
                if (typeof o[i] !== 'undefined') continue;
                o[i] = merchant_financing[i];
            }

            _t.addHistory(o, cb);
        }
    }, function (err, res) {
        if (err) {
            if (err.message == 'needConfirm') return cb(err);
            rollback.rollback(rollback_key, function (err2) {
                return cb(err, err2);
            });
        }else{
            cb(null, new UserOk('Финансирование переведено к работе. Осталось только отправить деньги и уведомить банк.'));
        }
    });
};

/**
 * READY_TO_WORK --> WAIT_BANK_CONFIRM
 * @param obj
 * @param cb
 * @returns {*}
 */
Model.prototype.notifyBank = function (obj, cb) {
    if (arguments.length == 1) {
        cb = arguments[0];
        obj = {};
    }
    var _t = this;
    var id = obj.id;
    if (isNaN(+id)) return cb(new MyError('В метод не передан id'));
    var rollback_key = obj.rollback_key || rollback.create();

    // Загрузить финансирование
    // Получим банк
    // сделать проверки (статусы)
    // проверим банк
    // Запросить emails для главной компании (VG)
    // Запросить email банка
    // Подготовить шаблон
    // Установить финансированию bank_notified
    // Разослать уведомления
    // Проверяем состояние "Банк уведомлен" и "Деньги отправлены" если и то и другое, выставляем статус WAIT_BANK_CONFIRM
    // Сменить статус
    // Записать лог

    var merchant_financing, bank, main_company, main_company_emails, bank_emails, emails_to_notify, tpl;
    var invalid_emails = [];

    async.series({
        getMerchantFinancing: function (cb) {
            // Получить данные о мерчанте
            _t.getById({id: id}, function (err, res) {
                if (err) return cb(err);
                if (!res.length) return cb(new MyError('Не найдено финансирование.', {id: id}));
                merchant_financing = res[0];
                cb(null);
            });
        },
        getBank: function (cb) {
            if (!merchant_financing.processing_bank_id) return cb(new UserError('У финансирования не указан банк (эквайер).'));
            var o = {
                command:'get',
                object:'bank',
                params:{
                    param_where:{
                        id:merchant_financing.processing_bank_id
                    },
                    collapseData:false
                }
            };
            _t.api(o, function (err, res) {
                if (err) return cb(new MyError('Не удалось получить информацию по банку эквайеру.',{o:o,err:err}));
                if (!res.length) return cb(new UserError('Не удалось найти банк эквайер. Возможно он был удален. Смените торговцу банк на корректный.'));
                bank = res[0];
                return cb(null);
            });
        },
        check: function (cb) {
            // сделать проверки (статусы) READY_TO_WORK
            if (['READY_TO_WORK'].indexOf(merchant_financing.status_sysname)==-1){
                var statuses = ['Готов к работе'].join(', ');
                return cb(new UserError('Финансирование должно быть в одном из следующих статусов: ' + statuses, {
                    id:id,
                    status:merchant_financing.status
                }));
            }
            // Проверим банк на is_work
            if (!bank.is_work) return cb(new UserError('Указаный у торговца банк эквайер не является рабочим банком! Переведите торговца на эквайринг в банк, с которым у вас заключен договор.'));
            cb(null);
        },
        getMainCompanyEmails: function (cb) {
            // Запросить emails для главной компании (VG)
            var o = {
                command:'get',
                object:'company_sys',
                params:{
                    param_where:{
                        main_company:true
                    },
                    collapseData:false
                }
            };
            _t.api(o, function (err, res) {
                if (err) return cb(new MyError('Не удалось получить информацию по главной компании.',{err:err}));
                if (!res.length) return cb(new UserError('Не найдена главная компания. Зайдите в Компании и установите ей галочку главная. Также пропишите емайлы для оповещения'));
                if (res.length > 1) return cb(new UserError('Несколько компаний установлено как главная. Зайдите в Компании и установите галочку только для одной компании. Также пропишите емайлы для оповещения'));
                main_company = res[0];
                main_company_emails = main_company.notifications_emails.replace(/\s+/ig,'').split(',');
                var valid_emails = [];
                for (var i in main_company_emails) {
                    if (funcs.validation.email(main_company_emails[i])) valid_emails.push(main_company_emails[i]);
                    else invalid_emails.push(main_company_emails[i]);
                }
                main_company_emails = valid_emails;
                cb(null);
            })
        },
        getBankEmail: function (cb) {
            // Соберем emails банка
            bank_emails = bank.email.replace(/\s+/ig,'').split(',');
            var valid_emails = [];
            for (var i in bank_emails) {
                if (funcs.validation.email(bank_emails[i])) valid_emails.push(bank_emails[i]);
                else invalid_emails.push(bank_emails[i]);
            }
            bank_emails = valid_emails;
            cb(null);
        },
        prepareTemplate: function (cb) {
            fs.readFile('./templates/bank_notify.html', function (err, data) {
                if (err) return cb(new MyError('Не удалось считать файл шаблона.', err));
                tpl = data.toString();
                cb(null);
            });
        },
        setBankNotified: function (cb) {
            // Установить финансированию bank_notified
            var params = {
                id:id,
                bank_notified:true
            };
            params.rollback_key = rollback_key;
            _t.modify(params, function (err) {
                if (err) return cb(new MyError('Финансированию не удалось установить информацию о том, что банк уведомлен',{err:err}));
                merchant_financing.bank_notified = true;
                cb(null);
            });
        },
        sendNotify: function (cb) {
            // Разослать уведомления
            emails_to_notify = main_company_emails.concat(bank_emails);
            async.eachSeries(emails_to_notify, function (item, cb) {
                var m_obj = {
                    //fio: merchant_financing.fio
                };
                tpl = mustache.to_html(tpl, m_obj);
                sendMail({email: item, html: tpl}, function (err, info) {
                    if (err) return cb(new UserError('Не удалось отправить уведомление на email: ' + item, {err: err, info: info}));
                    cb(null);
                });
            },cb);

        },
        getAnotherInWork: function (cb) {
            var params = {
                where:[
                    {
                        key:'merchant_id',
                        val1:merchant_financing.merchant_id
                    },
                    {
                        key:'status_sysname',
                        type:'in',
                        val1:['WAIT_BANK_CONFIRM','BANK_CONFIRM','ACQUIRING_IN_PROCCESS']
                    }
                ],
                collapseData:false
            };

            _t.get(params, function (err, res) {
                if (err) return cb(new MyError('Не удалось проверить наличие финансирований в статусах "WAIT_BANK_CONFIRM","BANK_CONFIRM","ACQUIRING_IN_PROCCESS"',{err:err}));
                if (res.length) return cb(new UserError('Уже есть финансирование в работе, подтвержденные банком или ожидающие подтверждения.'));
                cb(null);
            })
        },
        changeStatus: function (cb) {
            _t.setStatus({
                id: id,
                status: 'WAIT_BANK_CONFIRM',
                rollback_key:rollback_key
            }, function (err) {
                if (err) return cb(new MyError('Не удалось изменить статус финансирования. Обратитесь к администратору.', {err: err}));
                cb(null);
            });
        },
        addLog: function (cb) {
            // Записать лог
            var o = {
                id: id,
                history_log_status_sysname: 'WAIT_BANK_CONFIRM'
            };
            o.comment = emails_to_notify.join(', ');
            for (var i in merchant_financing) {
                if (typeof o[i] !== 'undefined') continue;
                o[i] = merchant_financing[i];
            }
            _t.addHistory(o, cb);
        }
    }, function (err, res) {
        if (err) {
            if (err.message == 'needConfirm') return cb(err);
            rollback.rollback(rollback_key, function (err2) {
                return cb(err, err2);
            });
        }else{
            cb(null, new UserOk('Банк уведомлен'));
        }
    });
};

/**
 * WAIT_BANK_CONFIRM --> BANK_CONFIRM
 * @param obj
 * @param cb
 * @returns {*}
 */
Model.prototype.bankConfirm = function (obj, cb) {
    if (arguments.length == 1) {
        cb = arguments[0];
        obj = {};
    }
    var _t = this;
    var id = obj.id;
    var payments_start_date = obj.payments_start_date;
    if (isNaN(+id)) return cb(new MyError('В метод не передан id финансирования'));
    if (!funcs.validation.isDate(payments_start_date)) return cb(new UserError('Неверно указана дата начала платежей.'));
    var confirm = obj.confirm;
    var rollback_key = obj.rollback_key || rollback.create();

    // Получим данные по финансированию
    // Проверим статус
    // Установим payments_start_date
    // Смена статуса + лог

    var merchant_financing;
    async.series({
        getMerchantFinancing: function (cb) {
            // Получить данные о финансировании мерчанта
            _t.getById({id: id}, function (err, res) {
                if (err) return cb(err);
                if (!res.length) return cb(new MyError('Не найдено финансирование.', {id: id}));
                merchant_financing = res[0];
                cb(null);
            });
        },
        checkAnother: function (cb) {
            if (['WAIT_BANK_CONFIRM'].indexOf(merchant_financing.status_sysname)==-1){
                var statuses = ['Ожидает подтверждения банка'].join(', ');
                return cb(new UserError('Финансирование должно быть в одном из следующих статусов: ' + statuses, {
                    id:id,
                    status:merchant_financing.status
                }));
            }
            cb(null);
        },
        setPaymentStartDate: function (cb) {
            var params = {
                id: id,
                payments_start_date: funcs.getDateMySQL(payments_start_date)
            };
            params.rollback_key = rollback_key;
            _t.modify(params, function (err) {
                if (err) return cb(new MyError('Не удалось установить дату старта платежей.',{err:err}));
                cb(null);
            })
        },
        changeStatus: function (cb) {
            // Поменять статус
            _t.setStatus({
                id: id,
                status: 'BANK_CONFIRM'
            }, function (err) {
                if (err) return cb(new UserError('Не удалось изменить статус финансирования. Обратитесь к администратору.', {err: err}));
                cb(null);
            });
        },
        addLog: function (cb) {
            // Записать лог
            var o = {
                id: id,
                history_log_status_sysname: 'BANK_CONFIRM'
            };
            for (var i in merchant_financing) {
                if (typeof o[i] !== 'undefined') continue;
                o[i] = merchant_financing[i];
            }

            _t.addHistory(o, cb);
        }
    }, function (err, res) {
        if (err) {
            if (err.message == 'needConfirm') return cb(err);
            rollback.rollback(rollback_key, function (err2) {
                return cb(err, err2);
            });
        }else{
            cb(null, new UserOk('Все готово! Осталось только отправить торговцу деньги.'));
        }
    });
};

/**
 * BANK_CONFIRM --> ACQUIRING_IN_PROCCESS
 * @param obj
 * @param cb
 * @returns {*}
 */
Model.prototype.moneySentAndSetInWork = function (obj, cb) {
    if (arguments.length == 1) {
        cb = arguments[0];
        obj = {};
    }
    var _t = this;
    var id = obj.id;
    var filename = obj.filename;
    if (isNaN(+id)) return cb(new MyError('В метод не передан id'));
    if (!filename) return cb(new MyError('В метод не передан filename'));
    var rollback_key = obj.rollback_key || rollback.create();



    // Получаем финансирование
    // Проверяем статусы и прочее
    // Получаем информацию по документу (скан платежки) PAYMENT_TO_MERCHANT, если нет то создаем и получаем
    // делаем uploadDocument Merchant_financing_document
    // Установить финансированию money_sent
    // Создадим календарь
    // Переводим в работу
    // Пишем лог

    var merchant_financing, payment_to_merchant_doc;
    async.series({
        getMerchantFinancing: function (cb) {
            // Получаем финансирование
            _t.getById({id: id}, function (err, res) {
                if (err) return cb(err);
                if (!res.length) return cb(new MyError('Не найдено финансирование.', {id: id}));
                merchant_financing = res[0];
                cb(null);
            });
        },
        check: function (cb) {
            // Проверяем статусы и прочее
            if (['BANK_CONFIRM'].indexOf(merchant_financing.status_sysname)==-1){
                var statuses = ['Банк подтвердил'].join(', ');
                return cb(new UserError('Финансирование должно быть в одном из следующих статусов: ' + statuses, {
                    id:id,
                    status:merchant_financing.status
                }));
            }
            cb(null);
        },
        getDocumentInfo: function (cb) {
            // Получаем информацию по документу (скан платежки) PAYMENT_TO_MERCHANT, если нет то создаем и получаем
            var payment_to_merchant_doc_id;
            async.series([
                function (cb) {
                    // Получим документ
                    var o = {
                        command:'get',
                        object:'merchant_financing_document',
                        params:{
                            param_where:{
                                document_sysname:'PAYMENT_TO_MERCHANT',
                                merchant_financing_id:id
                            },
                            collapseData:false
                        }
                    };
                    _t.api(o, function (err, res) {
                        if (err) return cb(new MyError('Не удалось получить информацию по скан платежки финансирования.',{o:o,err:err}));
                        if (res.length > 1) return cb(new UserError('Слишком много записей сканов, удалите неиспользуемые.')); // Такая ситуация может быть только если скан добавили вручную
                        payment_to_merchant_doc = res[0];
                        return cb(null);
                    });
                },
                function (cb) {
                    // Проверим получили ли мы документ, если нет, то создадим
                    if (payment_to_merchant_doc) return cb(null); // Успешно загрузили (был создан ранее)
                    // Иначе будем создавать
                    async.waterfall([
                        function (cb) {
                            // Получим document_id
                            var o = {
                                command: 'get',
                                object: 'document',
                                params: {
                                    param_where:{
                                        sysname:'PAYMENT_TO_MERCHANT'
                                    },
                                    collapseData:false
                                }
                            };
                            _t.api(o, function (err, res) {
                                if (err) return cb(new MyError('Не удалось получить документ с типом PAYMENT_TO_MERCHANT',{err:err}));
                                if (!res.length) return cb(new UserError('Не удалось найти документ с типом PAYMENT_TO_MERCHANT - "Платежный документ зачисление денег торговцу". Заведите такой документ в справочнике.'));
                                if (res.length > 1) return cb(new UserError('Слишком много документов с типом PAYMENT_TO_MERCHANT - "Платежный документ зачисление денег торговцу". Удалите лишние.'));
                                cb(null, res[0].id);
                            });
                        },
                        function (document_id, cb) {
                            var o = {
                                command: 'add',
                                object: 'merchant_financing_document',
                                params: {
                                    merchant_financing_id: id,
                                    document_id: document_id
                                }
                            };
                            o.params.rollback_key = rollback_key;
                            _t.api(o, function (err, res) {
                                if (err) return cb(new MyError('Не удалось добавить документ "Платежный документ зачисление денег торговцу" для данного финансирования.', {
                                    err: err,
                                    merchant_financing_id: id,
                                    document_id: document_id
                                }));
                                payment_to_merchant_doc_id = res.id;
                                cb(null);
                            })
                        }
                    ], cb);
                },
                function (cb) {
                    // Если только что создали то загрузим
                    if (payment_to_merchant_doc) return cb(null);
                    // Получим документ После СОЗДАНИЯ
                    var o = {
                        command:'get',
                        object:'merchant_financing_document',
                        params:{
                            param_where:{
                                id:payment_to_merchant_doc_id
                            },
                            collapseData:false
                        }
                    };
                    _t.api(o, function (err, res) {
                        if (err) return cb(new MyError('Не удалось получить информацию по скан платежки финансирования.',{o:o,err:err}));
                        if (!res.length) return cb(new MyError('Не удалось загрузить нужный документ даже после его создания. Запись не найдена.'));
                        payment_to_merchant_doc = res[0];
                        return cb(null);
                    });
                }
            ], cb);
        },
        uploadDocument: function (cb) {
            // делаем uploadDocument Merchant_financing_document
            var o = {
                command: "uploadDocument",
                object: "Merchant_financing_document",
                params: {
                    filename: filename,
                    id: payment_to_merchant_doc.id
                }
            };
            o.params.rollback_key = rollback_key;
            _t.api(o, cb);
        },
        setMoneySent: function (cb) {
            // Установить финансированию money_sent
            var params = {
                id:id,
                money_sent:true
            };
            params.rollback_key = rollback_key;
            _t.modify(params, function (err) {
                if (err) return cb(new MyError('Финансированию не удалось установить информацию о том, что деньги отправлены',{err:err}));
                merchant_financing.money_sent = true;
                cb(null);
            });
        },
        createCalendar: function (cb) {
            var payments_start_date = merchant_financing.payments_start_date;
            if (!funcs.validation.isDate(payments_start_date)) return cb(new UserError('Неверно указана дата начала платежей.',{merchant_financing:merchant_financing}));
            var o = {
                command:'createCalendar',
                object:'merchant_financing_calendar',
                params:{
                    fromServer:true,
                    payments_start_date:payments_start_date,
                    merchant_financing_id:id
                }
            };
            o.params.rollback_key = rollback_key;
            _t.api(o, function (err) {
                cb(err, null);
            })
        },
        changeStatus: function (cb) {
            // Поменять статус
            _t.setStatus({
                id: id,
                status: 'ACQUIRING_IN_PROCCESS'
            }, function (err) {
                if (err) return cb(new UserError('Не удалось изменить статус финансирования. Обратитесь к администратору.', {err: err}));
                cb(null);
            });
        },
        addLog: function (cb) {
            // Записать лог
            var o = {
                id: id,
                history_log_status_sysname: 'ACQUIRING_IN_PROCCESS'
            };
            o.comment = 'Деньги отправлены. Скан платежки: ' + filename;
            for (var i in merchant_financing) {
                if (typeof o[i] !== 'undefined') continue;
                o[i] = merchant_financing[i];
            }
            _t.addHistory(o, cb);
        }
    }, function (err) {
        if (err) {
            if (err.message == 'needConfirm') return cb(err);
            rollback.rollback(rollback_key, function (err2) {
                return cb(err, err2);
            });
        }else{
            cb(null, new UserOk('Деньги отправлены. Финансирование в работе!'));
        }
    })
};



//Model.prototype.setInWork = function (obj, cb) {
//    if (arguments.length == 1) {
//        cb = arguments[0];
//        obj = {};
//    }
//    var _t = this;
//    var id = obj.id;
//    var payments_start_date = obj.payments_start_date;
//    if (isNaN(+id)) return cb(new MyError('В метод не передан id'));
//    if (!funcs.validation.isDate(payments_start_date)) return cb(new UserError('Неверно указана дата начала платежей.'));
//    var rollback_key = obj.rollback_key || rollback.create();
//
//    // Получим финансирование
//    // Проверяем статусы и прочее
//    // Выставляем статус WAIT_BANK_CONFIRM
//    // Пишем лог
//
//    var merchant_financing, calendar;
//    async.series({
//        getMerchantFinancing: function (cb) {
//            // Получаем финансирование
//            _t.getById({id: id}, function (err, res) {
//                if (err) return cb(err);
//                if (!res.length) return cb(new MyError('Не найдено финансирование.', {id: id}));
//                merchant_financing = res[0];
//                cb(null);
//            });
//        },
//        check: function (cb) {
//            // Проверяем статусы и прочее
//                if (['WAIT_BANK_CONFIRM'].indexOf(merchant_financing.status_sysname)==-1){
//                var statuses = ['Ожидает подтверждения банка'].join(', ');
//                return cb(new UserError('Финансирование должно быть в одном из следующих статусов: ' + statuses, {
//                    id:id,
//                    status:merchant_financing.status
//                }));
//            }
//            cb(null);
//        },
//        changeStatus: function (cb) {
//            _t.setStatus({
//                id: id,
//                status: 'ACQUIRING_IN_PROCCESS',
//                rollback_key:rollback_key
//            }, function (err) {
//                if (err) return cb(new MyError('Не удалось изменить статус финансирования. Обратитесь к администратору.', {err: err}));
//                cb(null);
//            });
//        },
//        addLog: function (cb) {
//            // Записать лог
//            var o = {
//                id: id,
//                history_log_status_sysname: 'ACQUIRING_IN_PROCCESS'
//            };
//            for (var i in merchant_financing) {
//                if (typeof o[i] !== 'undefined') continue;
//                o[i] = merchant_financing[i];
//            }
//            _t.addHistory(o, cb);
//        }
//    }, function (err) {
//        if (err) {
//            if (err.message == 'needConfirm') return cb(err);
//            rollback.rollback(rollback_key, function (err2) {
//                return cb(err, err2);
//            });
//        }else{
//            cb(null, new UserOk('Деньги отправлены'));
//        }
//    })
//};

Model.prototype.testXLSX = function (obj, cb) {
    if (arguments.length == 1) {
        cb = arguments[0];
        obj = {};
    }
    var _t = this;
    var id = obj.id;

    //var o = {
    //    command:'testXLSX',
    //    object:'merchant_financing'
    //};
    //socketQuery(o, function (err, res) {
    //    console.log(err, res);
    //});

    //Load the docx file as a binary
    fs.readFile('./templates/test.xlsx', function (err, data) {
        if (err) return cb(new MyError('Не удалось считать файл шаблона test.xlsx.', err));
        //var tpl = data.toString();

        // Create a template
        var template = new XlsxTemplate(data);

        // Replacements take place on first sheet
        var sheetNumber = 1;

        // Set up some placeholder values matching the placeholders in the template
        //var values = {
        //    extractDate: new Date(),
        //    dates: [ new Date("2013-06-01"), new Date("2013-06-02"), new Date("2013-06-03") ],
        //    people: [
        //        {name: "John Smith", age: 20},
        //        {name: "Bob Johnson", age: 22}
        //    ]
        //};
        var values = {
            extractDate: new Date(),
            dates: [ new Date("2013-06-01"), new Date("2013-06-02"), new Date("2013-06-03") ],
            people: [
                {name: "John Smith", age: 20},
                {name: "Bob Johnson", age: 22}
            ]
        };

        //Perform substitution/
        template.substitute(sheetNumber, values);

        // Get binary data
        var dataBuf = template.generate();
        var binaryData = new Buffer(dataBuf, 'binary');



        //
        //var doc = new Docxtemplater(data);
        //
        ////set the templateVariables
        //doc.setData({
        //    "company_agent":'ООО "Мир Билета"',
        //    "agent_fio":"Гоптарева Ивана Ивановича",
        //    "company_subagent":'ООО "Мир Билетов"',
        //    "subagent_fio":"Гоптарева Александра Ивановича"
        //});
        //
        ////apply them (replace all occurences of {first_name} by Hipp, ...)
        //doc.render();
        //
        //var buf = doc.getZip()
        //    .generate({type:"nodebuffer"});
        //
        //attachments = [
        //    {   // file on disk as an attachment
        //        filename: 'test.xlsx',
        //        content: dataBuf
        //    }
        //];
        //sendMail({email: 'ivantgco@gmail.com', html: '123', attachments: attachments}, function (err, info) {
        //    if (err) return cb(new UserError('Не удалось отправить email', {err: err, info: info}));
        //    cb(null);
        //});

        fs.writeFile('./templates/testOutput.xlsx',binaryData, function (err) {
            if (err) return cb(new MyError('Не удалось записать файл testOutput.xlsx',{err:err}));
            return cb(null, new UserOk('testOutput.xlsx успешно сформирован'));
        }, 'binary');
    });
};

/**
 * Закрывает финансирование одним из методов сПроцессинга/переводНаСчет/рефинансирование/дефолт
 * Закрывает все неотмеченные и пропущенные платежи указаной датой с соответствующим типом
 * Закрывает каллендарь соответствующим типом
 * Закрывает финансирование
 * @param obj
 * @param cb
 * @returns {*}
 */
Model.prototype.closeFinancing = function (obj, cb) {
    if (arguments.length == 1) {
        cb = arguments[0];
        obj = {};
    }
    var _t = this;
    var id = obj.id;
    var financing_closing_type_id = obj.closing_type_id; // Тип закрытия финансирования
    var financing_close_type_sysname = obj.closing_type_sysname; // Тип закрытия финансирования
    if (isNaN(+id)) return cb(new MyError('В метод не передан id'));
    if (isNaN(+financing_closing_type_id) && !financing_close_type_sysname) return cb(new MyError('В метод не передан closing_type_id или financing_close_type_sysname'));
    var rollback_key = obj.rollback_key || rollback.create();

    // Получим и Залочим календарь и финансирование

    var closing_date = obj.closing_date || funcs.getDate();

    /*Классы*/
    var calendar_class;

    var merchant_financing, calendar, payment_close_type, financing_close_type;
    var no_closing_payment;
    async.series({
        get: function (cb) {
            _t.getById({id:id}, function (err, res) {
                if (err) return err;
                if (!res.length) return cb(new MyError('Финансирование не найдено.'));
                merchant_financing = res[0];
                cb(null);
            })
        },
        lock: function (cb) {
            //merchant_financing.lock_key = _t.lock(id);
            _t.lock({id:id}, function (err, res) {
                if (err) return cb(err);
                merchant_financing.lock_key = res;
                cb(null);
            });
        },
        check: function (cb) {
            // проверим статусы
            if (merchant_financing.status_sysname!=='ACQUIRING_IN_PROCCESS') return cb(new UserError('Финансирование должно быть в статусе "В работе"',{status:merchant_financing.status_sysname}));
            cb(null);
        },
        getCalendarClass: function (cb) {
            var o = {
                command:'_getClass',
                object:'merchant_financing_calendar'
            };
            _t.api(o, function (err, res) {
                if (err) return cb(err);
                calendar_class = res;
                cb(null);
            })
        },
        getCalendar: function (cb) {
            if (!merchant_financing.current_calendar_id) return cb(new MyError('Не удалось найти активный календарь.'));
            var params = {
                param_where:{
                    id:merchant_financing.current_calendar_id
                },
                collapseData:false
            };
            calendar_class.get(params, function (err, res) {
                if (err) return cb(err);
                if (!res.length) return cb(new MyError('Календарь не найден.'));
                calendar = res[0];
                cb(null);
            })
        },
        lockCalendar: function (cb) {
            calendar_class.lock({id:calendar.id}, function (err, res) {
                if (err) return cb(err);
                calendar.lock_key = res;
                cb(null);
            })
        },
        check2: function (cb) {
            // проверим статусы
            if (calendar.status_sysname!=='IN_WORK') return cb(new UserError('Календарь должно быть в статусе "В работе"',{status:merchant_financing.status_sysname}));
            cb(null);
        },
        getClosingTypeSysnameForFinancing: function (cb) {
            var o = {
                command:'get',
                object:'financing_close_type',
                params:{
                    param_where:{
                        id:financing_closing_type_id
                    },
                    collapseData:false
                }
            };
            if (financing_close_type_sysname) {
                o.params.param_where = {
                    sysname:financing_close_type_sysname
                };
            }
            _t.api(o, function (err, res) {
                if (err) return cb(err);
                if (!res.length) return cb(new MyError('financing_close_type не найден.'));
                if (res.length > 1) return cb(new MyError('financing_close_type слишком много.'));
                financing_close_type = res[0];
                financing_close_type_sysname = financing_close_type.sysname;
                if (financing_close_type_sysname == 'REFINANCE' && !obj.fromServer) return cb(new UserError('Для рефинансирования используйте специальную кнопку.'));
                cb(null);
            });
        },
        getNoClosingPayments: function (cb) {
            var o = {
                command:'get',
                object:'merchant_financing_payment',
                params:{
                    where:[
                        {
                            key:'calendar_id',
                            val1:calendar.id
                        },
                        {
                            key:'closing_type_id',
                            type:'isNull'
                        }
                    ],
                    collapseData:false,
                    sort: {
                        columns: 'payment_date',
                        direction: 'ASC'
                    }
                }
            };
            _t.api(o, function (err, res) {
                if (err) return cb(err);
                no_closing_payment = res;
                cb(null);
            });
        },
        getClosingTypeSysnameForPayment: function (cb) {
            var o = {
                command:'get',
                object:'payment_close_type',
                params:{
                    param_where:{
                        sysname:financing_close_type_sysname
                    },
                    collapseData:false
                }
            };
            _t.api(o, function (err, res) {
                if (err) return cb(err);
                if (!res.length) return cb(new MyError('payment_close_type не найден.'));
                if (res.length > 1) return cb(new MyError('payment_close_type слишком много.'));
                payment_close_type = res[0];
                cb(null);
            });
        },
        closePayments: function (cb) {
            // Если тип DEFAULT, то makeDefault иначе makePayment ---> передаем тип закрытия и дату
            var payments_count = no_closing_payment.length;
            var counter = 0;
            if (!payments_count) return cb(null);
            async.eachSeries(no_closing_payment, function (item, cb) {
                var cmd = 'makePayment';
                switch (financing_close_type_sysname){
                    case 'DEFAULT':
                        cmd = 'makeDefault';
                        break;
                    default:
                        break;
                }
                var o = {
                    command:cmd,
                    object:'merchant_financing_payment',
                    params:{
                        id:item.id,
                        payment_date:closing_date,
                        closing_type_id:payment_close_type.id,
                        fromServer:true,
                        financing_lock_key:merchant_financing.lock_key,
                        calendar_lock_key:calendar.lock_key
                    }
                };
                o.params.rollback_key = rollback_key;
                _t.api(o, function (err, res) {
                    counter++;
                    var percent = Math.ceil(counter * 100 / payments_count);
                    _t.user.socket.emit('closeFinancing_'+id,{percent:percent});
                    if (err) return cb(new MyError('Не удалось закрыть платеж.',{err:err}));
                    cb(null);
                });
            }, cb);
        },
        closeCalendar: function (cb) {
            var params = {
                id:calendar.id,
                rollback_key:rollback_key,
                lock_key:calendar.lock_key,
                closing_date:closing_date,
                closing_type_sysname:financing_close_type_sysname
            };
            calendar_class.closeCalendar(params, function (err) {
                if (err) return cb(err);
                cb(null);
            })
        },
        closeFinancing: function (cb) {
            var params = {
                id:id,
                rollback_key:rollback_key,
                lock_key:merchant_financing.lock_key,
                closing_date:closing_date,
                closing_type_sysname:financing_close_type_sysname,
                status_sysname:'CLOSED'
            };
            _t.modify(params, function (err) {
                if (err) return cb(err);
                cb(null);
            })
        },
        addLog: function (cb) {
            // Записать лог
            var o = {
                history_log_status_sysname: 'CLOSED'
            };
            o.comment = financing_close_type.name;
            for (var i in merchant_financing) {
                if (typeof o[i] !== 'undefined') continue;
                o[i] = merchant_financing[i];
            }
            _t.addHistory(o, cb);
        }
    },function (err) {
        //UNLOCK
        if (merchant_financing) _t.unlock({id:id,key:merchant_financing.lock_key});
        if (calendar) calendar_class.unlock({id:calendar.id,key:calendar.lock_key});
        if (err) {
            if (err.message == 'needConfirm') return cb(err);
            rollback.rollback(rollback_key, function (err2) {
                return cb(err, err2);
            });
        }else{
            cb(null, new UserOk('Финансирование закрыто'));
        }
    })
};

/**
 * Создает новое финансирование со ссылкой на старое и указанием оставшейся суммы
 * Старому указывается, кем он будет рефинансирован
 * @param obj
 * @param cb
 * @returns {*}
 */
Model.prototype.prepareRefinancing = function (obj, cb) {
    if (arguments.length == 1) {
        cb = arguments[0];
        obj = {};
    }
    var _t = this;
    var id = obj.id;
    if (isNaN(+id)) return cb(new MyError('В метод не передан id'));
    var rollback_key = obj.rollback_key || rollback.create();

    // Проверяю статус финансирования
    // Проверяю не было ли уже создано Рефинансирование
    // Создать новое финансирование с указанием closing_financing_id
    // Изменить этому финансированию closed_by_financing_id
    // Записать лог

    var merchant_financing, new_merchant_financing_id;
    async.series({
        get: function (cb) {
            _t.getById({id:id}, function (err, res) {
                if (err) return err;
                if (!res.length) return cb(new MyError('Финансирование не найдено.'));
                merchant_financing = res[0];
                cb(null);
            })
        },
        check: function (cb) {
            // проверим статусы
            if (merchant_financing.status_sysname!=='ACQUIRING_IN_PROCCESS') return cb(new UserError('Финансирование должно быть в статусе "В работе"',{status:merchant_financing.status_sysname}));
            // Проверим не было ли уже создано рефинансирование
            if (merchant_financing.closed_by_financing_id) return cb(new UserError('Рефинансирование уже было создано. №: '+ merchant_financing.closed_by_financing_id));
            cb(null);
        },
        createRefinancing: function (cb) {
            // Создать новое финансирование с указанием closing_financing_id
            var params = {
                merchant_id:merchant_financing.merchant_id,
                closing_financing_id:id,
                refinancing_amount:merchant_financing.to_return,
                confirm:true,
                rollback_key:rollback_key,
                fromServer:true
            };
            _t.add(params, function (err, res) {
                if (err) return cb(new MyError('Не удалось создать новое финансирование.',{err:err}));
                new_merchant_financing_id = res.id;
                cb(null);
            })
        },
        updateThisFinancing: function (cb) {
            // Изменить этому финансированию closed_by_financing_id
            var params = {
                id:id,
                closed_by_financing_id:new_merchant_financing_id
            };
            params.rollback_key = rollback_key;
            _t.modify(params, cb);
        }

    }, function (err) {
        if (err) {
            if (err.message == 'needConfirm') return cb(err);
            rollback.rollback(rollback_key, function (err2) {
                return cb(err, err2);
            });
        }else{
            cb(null, new UserOk('Финансирование подготовлено.',{id:new_merchant_financing_id}));
        }
    })

};


/**
 * Рефинансирует
 * @param obj
 * @param cb
 * @returns {*}
 */
Model.prototype.refinancing = function (obj, cb) {
    if (arguments.length == 1) {
        cb = arguments[0];
        obj = {};
    }
    var _t = this;
    var id = obj.id;
    if (isNaN(+id)) return cb(new MyError('В метод не передан id'));
    var rollback_key = obj.rollback_key || rollback.create();
    var confirm = obj.confirm;

    // Проверяю статус обоих рефинанансирований
    // закрыть предыдущее с типом REFINANCE
    // уведомить банк
    // перевести в работу
    // Перевожу в работу новое changeStatus
    //
    // Записать лог

    var merchant_financing, new_merchant_financing_id;
    var notified;
    async.series({
        checkConfirm: function (cb) {
            if (confirm == 'ПОДТВЕРДИТЬ') return cb(null);
            if (confirm && confirm !== 'ПОДТВЕРДИТЬ') return cb(new UserError('Неверно введено контрольное значение!'));
            return cb(new UserError('needConfirm', {confirmType:'dialog', responseType:'text',title:'Подтвердите рефинансирование',message: 'При подтверждении произойдет рефинансирование!' +
            '<br>Будет закрыто предыдущее финансирование и открыто текущее.' +
            '<br>Также будет уведоблен банк!' +
            '<br><span style="color:red;">Если вы уверены введите "ПОДТВЕРДИТЬ".</span>'}));
        },
        get: function (cb) {
            _t.getById({id:id}, function (err, res) {
                if (err) return err;
                if (!res.length) return cb(new MyError('Финансирование не найдено.'));
                merchant_financing = res[0];
                cb(null);
            })
        },
        check: function (cb) {
            // проверим статусы
            if (merchant_financing.status_sysname!=='READY_TO_WORK') return cb(new UserError('Финансирование должно быть в статусе "В работе"',{status:merchant_financing.status_sysname}));
            // Проверим не было ли уже создано рефинансирование
            if (!merchant_financing.closing_financing_id) return cb(new UserError('Не указано финансирование для закрытия'));
            cb(null);
        },
        closePrev: function (cb) {
            // закрыть предыдущее с типом REFINANCE
            var params = {
                id:merchant_financing.closing_financing_id,
                closing_type_sysname:'REFINANCE',
                rollback_key:rollback_key,
                fromServer:true,
                confirm:true
            };
            _t.closeFinancing(params, function (err, res) {
                if (err) {
                    if (err instanceof UserError) return cb(err);
                    return cb(new MyError('Не удалось закрыть предыдущее финансирование',{err:err}));
                }
                cb(null);
            })
        },
        notifyBank: function (cb) {
            // закрыть предыдущее с типом REFINANCE
            var params = {
                id:id,
                rollback_key:rollback_key,
                fromServer:true,
                confirm:true
            };
            _t.notifyBank(params, function (err, res) {
                if (err) {
                    if (err instanceof UserError) return cb(err);
                    return cb(new MyError('Не удалось закрыть предыдущее финансирование',{err:err}));
                }
                notified = true;
                cb(null);
            })
        },
        setInWork: function (cb) {
            // перевести в работу
            var params = {
                id:id,
                rollback_key:rollback_key,
                fromServer:true,
                confirm:true
            };
            _t.setInWork(params, function (err, res) {
                if (err) {
                    if (err instanceof UserError) return cb(err);
                    return cb(new MyError('Не удалось закрыть предыдущее финансирование',{err:err}));
                }
                cb(null);
            })
        },
        addLog: function (cb) {
            // Записать лог
            var o = {
                history_log_status_sysname: 'REFINANCING'
            };
            for (var i in merchant_financing) {
                if (typeof o[i] !== 'undefined') continue;
                o[i] = merchant_financing[i];
            }
            _t.addHistory(o, cb);
        }


    }, function (err) {
        if (err) {
            if (notified) err.additionalMessage = 'Внимание! Из-за ошибки изменения были отменены, НО банк был уведомлен о рефинансирование!';
            if (err.message == 'needConfirm') return cb(err);
            rollback.rollback(rollback_key, function (err2) {
                return cb(err, err2);
            });
        }else{
            cb(null, new UserOk('Финансирование подготовлено.',{id:id}));
        }
    });

};


Model.prototype.report_vg = function (obj, cb) {
    if (arguments.length == 1) {
        cb = arguments[0];
        obj = {};
    }
    var _t = this;
    var name = obj.name || 'report_vg_prepare.xlsx';
    var report_date = obj.report_date || funcs.getDate();
    //if (isNaN(+id)) return cb(new MyError('В метод не передан id'));

    var payments, data, readyData, template, binaryData, filename;
    var merchant_financings = {};
    var weekAgoStart = moment().startOf('week').add(-6,'day').format('DD.MM.YYYY');
    var weekAgoEnd = moment().startOf('week').format('DD.MM.YYYY');
    var getCutOffAmount = function (start, end, financing, payment_type, field) {
        payment_type = payment_type || 'paid';
        field = field || 'paid_amount';
        var res = 0;
        for (var j in financing.payments[payment_type]) {
            var payment = financing.payments[payment_type][j];
            // За отчетный период
            if (funcs.date_A_more_or_equal_B(payment.paid_date,start) && funcs.date_A_more_or_equal_B(end,payment.paid_date)){
                res += +payment[field];
            }
        }
        return res;
    };

    async.series({
        getData: function (cb) {
            async.series({
                    getFinancings: function (cb) {
                        // Получим финансирования в подходящем статусе
                        var o = {
                            command: 'get',
                            object: 'merchant_financing',
                            params: {
                                where: [
                                    {
                                        key: 'status_sysname',
                                        type: 'in',
                                        val1: ['ACQUIRING_IN_PROCCESS','CLOSED']
                                    }
                                ],
                                collapseData: false
                            }
                        };
                        _t.api(o, function (err, res) {
                            if (err) return cb(err);
                            for (var i in res) {
                                var m_f_id = res[i].id;
                                res[i].payments = {
                                    paid:[],
                                    pending:[]
                                };
                                merchant_financings[m_f_id] = res[i];
                            }
                            cb(null);
                        });
                    },
                    getPayments: function (cb) {
                        // Получим платежи за период для этих финансирований
                        var o = {
                            command: 'get',
                            object: 'merchant_financing_payment',
                            params: {
                                where: [
                                    {
                                        key: 'status_sysname',
                                        type: 'in',
                                        val1: ['PENDING','PAID']
                                    },
                                    {
                                        key: 'merchant_financing_id',
                                        type: 'in',
                                        val1: Object.keys(merchant_financings)
                                    }
                                ],
                                collapseData: false
                            }
                        };
                        _t.api(o, function (err, res) {
                            if (err) return cb(err);
                            for (var i in res) {
                                var payment = res[i];
                                var m_f_id = payment.merchant_financing_id;
                                if (typeof merchant_financings[m_f_id]!=='object') return cb(new MyError('Получили платеж не пренадлежащий нужному финансированию',{payment:payment,merchant_financings:merchant_financings}));
                                if (typeof merchant_financings[m_f_id].payments!=='object') merchant_financings[m_f_id].payments = {};
                                var payment_status = payment.status_sysname.toLowerCase();
                                if (typeof merchant_financings[m_f_id].payments[payment_status]!=='object')merchant_financings[m_f_id].payments[payment_status] = [];
                                merchant_financings[m_f_id].payments[payment_status].push(payment);
                            }
                            cb(null);
                        });
                    }
                }, cb);
        },
        prepareData0: function (cb) {
            readyData = {
                report_date: report_date,
                cut_off_date: weekAgoStart + ' - ' + weekAgoEnd,
                fin: [],
                fin2: [],
                fin3: []
            };
            cb(null);
        },
        prepareData1: function (cb) {
            readyData.total_founding_amount     = 0;
            readyData.total_amount_to_return    = 0;
            readyData.total_gross_profit        = 0;
            readyData.total_bank_comission      = 0;
            readyData.total_net_profit          = 0;
            readyData.total_collected           = 0;
            readyData.total_pending             = 0;
            for (var i in merchant_financings) {

                merchant_financings[i].gross_profit    = +merchant_financings[i].amount_to_return - merchant_financings[i].founding_amount;
                merchant_financings[i].bank_comision   = +merchant_financings[i].amount_to_return * 0.03;
                merchant_financings[i].net_profit      = +(merchant_financings[i].amount_to_return - merchant_financings[i].founding_amount) - (merchant_financings[i].amount_to_return * 0.03);
                merchant_financings[i].total_returned_cut_off = getCutOffAmount(weekAgoStart, weekAgoEnd, merchant_financings[i]);


                readyData.fin.push({
                    merchant_id:merchant_financings[i].merchant_id,
                    work_bank_merchant_id:merchant_financings[i].work_bank_merchant_id || '-',
                    name:merchant_financings[i].merchant_name,
                    financing_date:funcs.userFriendlyDate(merchant_financings[i].financing_date || merchant_financings[i].payments_start_date),
                    founding_amount:merchant_financings[i].founding_amount,
                    factoring_rate:merchant_financings[i].factoring_rate,
                    amount_to_return:merchant_financings[i].amount_to_return,
                    payments_count:merchant_financings[i].payments_count,
                    work_days:5,
                    payment_amount:merchant_financings[i].payment_amount,
                    gross_profit: merchant_financings[i].gross_profit,
                    bank_comission_summ: merchant_financings[i].bank_comision,
                    net_profit:merchant_financings[i].net_profit,
                    total_returned_cut_off:merchant_financings[i].total_returned_cut_off,
                    to_return:merchant_financings[i].to_return,
                    complete_percent:merchant_financings[i].complete_percent

                });
                readyData.total_founding_amount       += +merchant_financings[i].founding_amount;
                readyData.total_amount_to_return      += +merchant_financings[i].amount_to_return;
                readyData.total_gross_profit          += +merchant_financings[i].gross_profit;
                readyData.total_bank_comission        += +merchant_financings[i].bank_comision;
                readyData.total_net_profit            += +merchant_financings[i].net_profit;
                readyData.total_collected             += +merchant_financings[i].total_returned_cut_off;
                readyData.total_pending               += +merchant_financings[i].to_return;
            }
            cb(null);
        },
        prepareData2: function (cb) {
            readyData.r2_total_founding_amount     = 0;
            readyData.r2_total_amount_to_return    = 0;
            readyData.r2_total_gross_profit        = 0;
            readyData.r2_total_bank_comission      = 0;
            readyData.r2_total_net_profit          = 0;
            readyData.r2_total_collected           = 0;
            readyData.r2_total_pending             = 0;
            // Добавим
            readyData.r2_total_reinvested_returned  = 0;
            readyData.r2_total_vg_profit            = 0;
            readyData.r2_total_investor_profit      = 0;
            readyData.r2_total_pending_remittance   = 0;
            readyData.r2_total_final_vg_profit      = 0;


            for (var i in merchant_financings) {

                merchant_financings[i].gross_profit    = +merchant_financings[i].amount_to_return - merchant_financings[i].founding_amount;
                merchant_financings[i].bank_comision   = +merchant_financings[i].amount_to_return * 0.03;
                merchant_financings[i].net_profit      = +(merchant_financings[i].amount_to_return - merchant_financings[i].founding_amount) - (merchant_financings[i].amount_to_return * 0.03);
                // Добавим
                merchant_financings[i].pending_remittance = 0;
                for (var j in merchant_financings[i].payments.paid) {
                    var payment = merchant_financings[i].payments.paid[j];
                    // За отчетный период
                    if (funcs.date_A_more_or_equal_B(payment.paid_date,weekAgoStart) && funcs.date_A_more_or_equal_B(weekAgoEnd,payment.paid_date)){
                        merchant_financings[i].pending_remittance += +payment.paid_amount;
                    }
                }

                merchant_financings[i].reinvested_returned = (merchant_financings[i].total_returned - merchant_financings[i].pending_remittance) / 2;

                merchant_financings[i].vg_net_profit = (merchant_financings[i].amount_to_return - merchant_financings[i].bank_comision) / 2;
                merchant_financings[i].investor_net_profit = (merchant_financings[i].amount_to_return - merchant_financings[i].bank_comision) / 2;
                merchant_financings[i].final_vg_profit = (merchant_financings[i].status_sysname == 'CLOSED')? (merchant_financings[i].gross_profit - merchant_financings[i].bank_comision) / 2 : 0;
                merchant_financings[i].for_reinvestment = merchant_financings[i].amount_to_return - merchant_financings[i].vg_net_profit;


                readyData.fin2.push({
                    merchant_id:merchant_financings[i].merchant_id,
                    work_bank_merchant_id:merchant_financings[i].work_bank_merchant_id || '-',
                    name:merchant_financings[i].merchant_name,
                    financing_date:funcs.userFriendlyDate(merchant_financings[i].financing_date || merchant_financings[i].payments_start_date),
                    founding_amount:merchant_financings[i].founding_amount,
                    factoring_rate:merchant_financings[i].factoring_rate,
                    amount_to_return:merchant_financings[i].amount_to_return,
                    payments_count:merchant_financings[i].payments_count,
                    work_days:5,
                    payment_amount:merchant_financings[i].payment_amount,
                    gross_profit: merchant_financings[i].gross_profit,
                    bank_comission_summ: merchant_financings[i].bank_comision,
                    net_profit:merchant_financings[i].net_profit,
                    total_returned:merchant_financings[i].total_returned,
                    to_return:merchant_financings[i].to_return,
                    reinvested_returned:merchant_financings[i].reinvested_returned,
                    complete_percent:merchant_financings[i].complete_percent,
                    // Добавим
                    vg_net_profit:merchant_financings[i].vg_net_profit,
                    investor_net_profit:merchant_financings[i].investor_net_profit,
                    final_vg_profit:merchant_financings[i].final_vg_profit,
                    for_reinvestment:merchant_financings[i].for_reinvestment,
                    pending_remittance:merchant_financings[i].pending_remittance

                });
                readyData.r2_total_founding_amount       += +merchant_financings[i].founding_amount;
                readyData.r2_total_amount_to_return      += +merchant_financings[i].amount_to_return;
                readyData.r2_total_gross_profit          += +merchant_financings[i].gross_profit;
                readyData.r2_total_bank_comission        += +merchant_financings[i].bank_comision;
                readyData.r2_total_net_profit            += +merchant_financings[i].net_profit;
                readyData.r2_total_collected             += +merchant_financings[i].total_returned;
                readyData.r2_total_pending               += +merchant_financings[i].to_return;
                // Добавим
                readyData.r2_total_reinvested_returned   += +merchant_financings[i].reinvested_returned;
                readyData.r2_total_vg_profit             += +merchant_financings[i].vg_net_profit;
                readyData.r2_total_investor_profit       += +merchant_financings[i].investor_net_profit;
                readyData.r2_total_pending_remittance    += +merchant_financings[i].pending_remittance;
                readyData.r2_total_final_vg_profit       += +merchant_financings[i].final_vg_profit;

            }
            cb(null);
        },
        prepareData3: function (cb) {


            readyData.r3_total_final_profit      = 0;
            readyData.r3_total_cut_off_collected = 0;
            readyData.total_week_1 = 0;
            readyData.total_week_2 = 0;
            readyData.total_week_3 = 0;
            readyData.total_week_4 = 0;
            readyData.total_week_5 = 0;
            readyData.total_week_6 = 0;
            readyData.total_week_7 = 0;
            readyData.total_week_8 = 0;
            readyData.total_week_9 = 0;
            readyData.total_week_10 = 0;
            readyData.total_week_11 = 0;
            readyData.total_week_12 = 0;
            readyData.total_collected_summ = 0;

            for (var i in merchant_financings) {
                // Добавим
                for (var c = 1; c <= 12; c++) {
                    var num = 12 - c;
                    //var endOld = moment(moment(report_date, 'DD.MM.YYYY') - moment.duration(num, 'weeks')).format('DD.MM.YYYY');
                    //var start0ld = moment(moment(report_date, 'DD.MM.YYYY') - moment.duration(num + 1, 'weeks')).format('DD.MM.YYYY');
                    //
                    var start = moment().startOf('week').add(-6,'day').add(-num,'week').format('DD.MM.YYYY');
                    var end = moment().startOf('week').add(-num,'week').format('DD.MM.YYYY');

                    merchant_financings[i]['week_' + c + '_value'] = getCutOffAmount(start, end, merchant_financings[i]);
                    readyData['week_' + c] = start + ' - ' + end;
                }
                merchant_financings[i].final_profit = 0;
                merchant_financings[i].cut_off_collected = merchant_financings[i].week_12_value;

                readyData.fin3.push({
                    merchant_id: merchant_financings[i].merchant_id,
                    work_bank_merchant_id: merchant_financings[i].work_bank_merchant_id || '-',
                    name: merchant_financings[i].merchant_name,
                    final_profit: merchant_financings[i].final_profit,
                    cut_off_collected: merchant_financings[i].cut_off_collected,
                    week_1_value: merchant_financings[i].week_1_value,
                    week_2_value: merchant_financings[i].week_2_value,
                    week_3_value: merchant_financings[i].week_3_value,
                    week_4_value: merchant_financings[i].week_4_value,
                    week_5_value: merchant_financings[i].week_5_value,
                    week_6_value: merchant_financings[i].week_6_value,
                    week_7_value: merchant_financings[i].week_7_value,
                    week_8_value: merchant_financings[i].week_8_value,
                    week_9_value: merchant_financings[i].week_9_value,
                    week_10_value: merchant_financings[i].week_10_value,
                    week_11_value: merchant_financings[i].week_11_value,
                    week_12_value: merchant_financings[i].week_12_value,

                    total_collected: merchant_financings[i].total_returned

                });

                readyData.r3_total_final_profit += +merchant_financings[i].final_profit;
                readyData.r3_total_cut_off_collected += +merchant_financings[i].cut_off_collected;
                readyData.total_week_1 += +merchant_financings[i].week_1_value;
                readyData.total_week_2 += +merchant_financings[i].week_2_value;
                readyData.total_week_3 += +merchant_financings[i].week_3_value;
                readyData.total_week_4 += +merchant_financings[i].week_4_value;
                readyData.total_week_5 += +merchant_financings[i].week_5_value;
                readyData.total_week_6 += +merchant_financings[i].week_6_value;
                readyData.total_week_7 += +merchant_financings[i].week_7_value;
                readyData.total_week_8 += +merchant_financings[i].week_8_value;
                readyData.total_week_9 += +merchant_financings[i].week_9_value;
                readyData.total_week_10 += +merchant_financings[i].week_10_value;
                readyData.total_week_11 += +merchant_financings[i].week_11_value;
                readyData.total_week_12 += +merchant_financings[i].week_12_value;

                readyData.total_collected_summ += +merchant_financings[i].total_returned;


            }
            cb(null);
        },
        prepareData4: function (cb) {

            readyData.initial_capital_investments       = 100000000;
            readyData.captial_and_reinvestments         = parseFloat(readyData.initial_capital_investments) + parseFloat(readyData.r2_total_pending);
            readyData.outstanding_and_pending           = parseFloat(readyData.r2_total_pending) + parseFloat(readyData.r2_total_pending_remittance);
            readyData.reinvestment_tail                 = '???';

            cb(null);
        },
        getTemplate: function (cb) {
            fs.readFile('./templates/' + name, function (err, data) {
                if (err) return cb(new MyError('Не удалось считать файл шаблона test.xlsx.', err));
                template = new XlsxTemplate(data);
                cb(null);
            });
        },
        perform: function (cb) {
            var sheetNumber = 1;
            template.substitute(sheetNumber, readyData);
            var dataBuf = template.generate();
            binaryData = new Buffer(dataBuf, 'binary');
            cb(null)
        },
        writeFile: function (cb) {
            filename = '_' + name;
            fs.writeFile('./public/savedFiles/' + filename,binaryData, function (err) {
                if (err) return cb(new MyError('Не удалось записать файл testOutput.xlsx',{err:err}));
                return cb(null, new UserOk('testOutput.xlsx успешно сформирован'));
            });
        }
    }, function (err) {
        if (err) return cb(err);
        cb(null, new UserOk('Ок.',{filename:filename,path:'/savedFiles/'}));
    })
};




Model.prototype.report_investor = function (obj, cb) {
    if (arguments.length == 1) {
        cb = arguments[0];
        obj = {};
    }
    var _t = this;
    var name = obj.name || 'report_merchant_1.xlsx';
    var report_date = obj.report_date || funcs.getDate();
    //if (isNaN(+id)) return cb(new MyError('В метод не передан id'));

    var payments, data, readyData, template, binaryData, filename;
    var merchant_financings = {};
    var weekAgoStart = moment().startOf('week').add(-6,'day').format('DD.MM.YYYY');
    var weekAgoEnd = moment().startOf('week').format('DD.MM.YYYY');

    async.series({
        getData: function (cb) {
            async.series({
                getFinancings: function (cb) {
                    // Получим финансирования в подходящем статусе
                    var o = {
                        command: 'get',
                        object: 'merchant_financing',
                        params: {
                            where: [
                                {
                                    key: 'status_sysname',
                                    type: 'in',
                                    val1: ['ACQUIRING_IN_PROCCESS'/*,'CLOSED'*/]
                                }
                            ],
                            collapseData: false
                        }
                    };
                    _t.api(o, function (err, res) {
                        if (err) return cb(err);
                        for (var i in res) {
                            var m_f_id = res[i].id;
                            res[i].payments = {
                                paid:[],
                                pending:[]
                            };
                            merchant_financings[m_f_id] = res[i];
                        }
                        cb(null);
                    });
                },
                getPayments: function (cb) {
                    // Получим платежи за период для этих финансирований
                    var o = {
                        command: 'get',
                        object: 'merchant_financing_payment',
                        params: {
                            where: [
                                {
                                    key: 'status_sysname',
                                    type: 'in',
                                    val1: ['PENDING','PAID']
                                },
                                {
                                    key: 'merchant_financing_id',
                                    type: 'in',
                                    val1: Object.keys(merchant_financings)
                                }
                            ],
                            collapseData: false
                        }
                    };
                    _t.api(o, function (err, res) {
                        if (err) return cb(err);
                        for (var i in res) {
                            var payment = res[i];
                            var m_f_id = payment.merchant_financing_id;
                            if (typeof merchant_financings[m_f_id]!=='object') return cb(new MyError('Получили платеж не пренадлежащий нужному финансированию',{payment:payment,merchant_financings:merchant_financings}));
                            if (typeof merchant_financings[m_f_id].payments!=='object') merchant_financings[m_f_id].payments = {};
                            var payment_status = payment.status_sysname.toLowerCase();
                            if (typeof merchant_financings[m_f_id].payments[payment_status]!=='object')merchant_financings[m_f_id].payments[payment_status] = [];
                            merchant_financings[m_f_id].payments[payment_status].push(payment);
                        }
                        cb(null);
                    });
                }
            }, cb);
        },
        prepareData0: function (cb) {
            readyData = {
                report_date: report_date,
                cut_off_date: weekAgoStart + ' - ' + weekAgoEnd,
                fin: [],
                fin1: []
            };
            cb(null);
        },
        prepareData: function (cb) {

            readyData.total_founding_amount = 0;
            readyData.total_amount_to_return = 0;
            readyData.total_gross_profit = 0;
            readyData.total_bank_comission = 0;
            readyData.total_net_profit = 0;

            //readyData.total_vg_profit = 0;
            //readyData.total_investor_profit = 0;
            //readyData.total_collected = 0;
            //readyData.total_pending = 0;
            //readyData.total_pending_remittance = 0;
            //readyData.total_final_vg_profit = 0;

            for (var i in merchant_financings) {
                merchant_financings[i].gross_profit = merchant_financings[i].amount_to_return - merchant_financings[i].founding_amount;
                merchant_financings[i].bank_comision = merchant_financings[i].amount_to_return * 0.03;
                merchant_financings[i].pending_remittance = 0;
                merchant_financings[i].final_vg_profit = (merchant_financings[i].status_sysname == 'CLOSED')? (merchant_financings[i].gross_profit - merchant_financings[i].bank_comision) / 2 : 0;

                for (var j in merchant_financings[i].payments) {
                    var payment = merchant_financings[i].payments[j];
                    if (payment.status_sysname!='PAID') continue;
                    merchant_financings[i].pending_remittance += payment.paid_amount;
                }

                readyData.fin.push({
                    merchant_id:merchant_financings[i].merchant_id,
                    name:merchant_financings[i].merchant_name,
                    founding_amount:merchant_financings[i].founding_amount,
                    financing_date: funcs.userFriendlyDate(merchant_financings[i].financing_date || merchant_financings[i].payments_start_date),
                    factoring_rate: merchant_financings[i].factoring_rate,
                    payments_count: merchant_financings[i].payments_count,
                    payment_amount: merchant_financings[i].payment_amount,
                    bank_comission_summ: merchant_financings[i].bank_comision,
                    net_profit: merchant_financings[i].gross_profit - merchant_financings[i].bank_comision,
                    gross_profit: merchant_financings[i].gross_profit,
                    amount_to_return:merchant_financings[i].amount_to_return,
                    vg_net_profit:(merchant_financings[i].amount_to_return - merchant_financings[i].bank_comision) / 2,
                    investor_net_profit:(merchant_financings[i].amount_to_return - merchant_financings[i].bank_comision) / 2,
                    complete_percent:merchant_financings[i].complete_percent,
                    total_returned:merchant_financings[i].total_returned,
                    to_return:merchant_financings[i].to_return,
                    pending_remittance:merchant_financings[i].pending_remittance,
                    final_vg_profit:merchant_financings[i].final_vg_profit

                });
                readyData.total_founding_amount       += merchant_financings[i].founding_amount;
                readyData.total_amount_to_return      += merchant_financings[i].amount_to_return;
                readyData.total_gross_profit          += +merchant_financings[i].gross_profit;
                readyData.total_bank_comission        += +(merchant_financings[i].amount_to_return * 0.03);
                readyData.total_net_profit            += +merchant_financings[i].gross_profit - merchant_financings[i].bank_comision;

                //readyData.total_vg_profit             += (merchant_financings[i].amount_to_return - merchant_financings[i].bank_comision) / 2;
                //readyData.total_investor_profit       += (merchant_financings[i].amount_to_return - merchant_financings[i].bank_comision) / 2;
                //readyData.total_collected             += merchant_financings[i].total_returned;
                //readyData.total_pending               += merchant_financings[i].to_return;
                //readyData.total_pending_remittance    += merchant_financings[i].pending_remittance;
                //readyData.total_final_vg_profit       += merchant_financings[i].final_vg_profit;
            }
            cb(null);
        },
        prepareData2: function (cb) {

            readyData.total_gross_investment        = 0;
            readyData.total_bank_comission          = 0;
            readyData.total_net_investment          = 0;
            readyData.total_gross_profit_2          = 0;
            readyData.total_gross_amount_to_return  = 0;
            readyData.total_vg_comission            = 0;
            readyData.total_net_profit_2            = 0;
            readyData.total_net_amount_to_return    = 0;

            for (var i in merchant_financings) {
                merchant_financings[i].gross_profit = merchant_financings[i].amount_to_return - merchant_financings[i].founding_amount;
                merchant_financings[i].bank_comision = merchant_financings[i].amount_to_return * 0.03;
                merchant_financings[i].net_amount_to_return = merchant_financings[i].amount_to_return - ((merchant_financings[i].amount_to_return - merchant_financings[i].founding_amount) - merchant_financings[i].bank_comision) / 2;

                readyData.fin1.push({
                    merchant_id:            merchant_financings[i].merchant_id,
                    name:                   merchant_financings[i].merchant_name,
                    gross_investment:       merchant_financings[i].founding_amount + merchant_financings[i].bank_comision,
                    bank_comission_percent: 3,
                    bank_comission:         merchant_financings[i].bank_comision,
                    net_investment:         merchant_financings[i].founding_amount,
                    participation:          '100%',
                    gross_profit:           merchant_financings[i].gross_profit,
                    factoring_rate:         merchant_financings[i].factoring_rate,
                    gross_amount_to_return: merchant_financings[i].amount_to_return,
                    vg_comission:           ((merchant_financings[i].amount_to_return - merchant_financings[i].founding_amount) - merchant_financings[i].bank_comision) / 2,
                    net_profit:             ((merchant_financings[i].amount_to_return - merchant_financings[i].founding_amount) - merchant_financings[i].bank_comision) / 2,
                    net_amount_to_return:   merchant_financings[i].net_amount_to_return
                });

                readyData.total_gross_investment        += merchant_financings[i].founding_amount + merchant_financings[i].bank_comision;
                //readyData.total_bank_comission          += 105;
                readyData.total_bank_comission          += merchant_financings[i].bank_comision;
                readyData.total_net_investment          += merchant_financings[i].founding_amount;
                readyData.total_gross_profit_2          += merchant_financings[i].gross_profit;
                readyData.total_gross_amount_to_return  += merchant_financings[i].amount_to_return;
                readyData.total_vg_comission            += ((merchant_financings[i].amount_to_return - merchant_financings[i].founding_amount) - merchant_financings[i].bank_comision) / 2;
                readyData.total_net_profit_2            += ((merchant_financings[i].amount_to_return - merchant_financings[i].founding_amount) - merchant_financings[i].bank_comision) / 2;
                //readyData.total_net_amount_to_return    += 120;//merchant_financings[i].amount_to_return - ((merchant_financings[i].amount_to_return - merchant_financings[i].founding_amount) - bank_comision) / 2;
                readyData.total_net_amount_to_return    += merchant_financings[i].net_amount_to_return;

            }
            cb(null);
        },
        getTemplate: function (cb) {
            fs.readFile('./templates/' + name, function (err, data) {
                if (err) return cb(new MyError('Не удалось считать файл шаблона test.xlsx.', err));
                template = new XlsxTemplate(data);
                cb(null);
            });
        },
        perform: function (cb) {
            var sheetNumber = 1;
            template.substitute(sheetNumber, readyData);
            var dataBuf = template.generate();
            binaryData = new Buffer(dataBuf, 'binary');
            cb(null)
        },
        writeFile: function (cb) {
            filename = '_' + name;
            fs.writeFile('./public/savedFiles/' + filename,binaryData, function (err) {
                if (err) return cb(new MyError('Не удалось записать файл testOutput.xlsx',{err:err}));
                return cb(null, new UserOk('testOutput.xlsx успешно сформирован'));
            });
        }
    }, function (err) {
        if (err) return cb(err);
        cb(null, new UserOk('Ок.',{filename:filename,path:'/savedFiles/'}));
    })


};

Model.prototype.report_investor_old = function (obj, cb) {
    if (arguments.length == 1) {
        cb = arguments[0];
        obj = {};
    }
    var _t = this;
    var name = obj.name || 'report_merchant_1.xlsx';
    var report_date = obj.report_date || funcs.getDate();
    //if (isNaN(+id)) return cb(new MyError('В метод не передан id'));

    var payments, data, readyData, template, binaryData, filename;
    var merchant_financings = {};
    //var weekAgo = moment(moment() - moment.duration(1, 'weeks')).format('DD.MM.YYYY');
    //var twoWeekAgo = moment(moment() - moment.duration(2, 'weeks')).format('DD.MM.YYYY');
    var weekAgo = moment(moment() - moment.duration(0, 'days')).format('DD.MM.YYYY');
    var twoWeekAgo = moment(moment() - moment.duration(1, 'days')).format('DD.MM.YYYY');
    async.series({
        getData: function (cb) {
            async.series([
                function (cb) {
                    // Получим платежи за период
                    var o = {
                        command:'get',
                        object:'merchant_financing_payment',
                        params:{
                            where:[
                                {
                                    key:'payment_date',
                                    type:'..',
                                    val1:twoWeekAgo,
                                    val2:weekAgo
                                },
                                {
                                    key:'status_sysname',
                                    val1:'PAID'
                                }

                            ],
                            collapseData:false
                        }
                    };
                    _t.api(o, function (err, res) {
                        if (err) return cb(err);
                        payments = res;
                        cb(null);
                    });
                },
                function (cb) {
                    var counter = 0;
                    async.eachSeries(payments, function (item, cb) {
                        var o = {
                            command:'get',
                            object:'merchant_financing',
                            params:{
                                param_where:{
                                    id:item.merchant_financing_id
                                },
                                collapseData:false
                            }
                        };
                        _t.api(o, function (err, res) {
                            if (err) return cb(err);
                            if (!res.length) return cb(null);
                            var m_f_id = item.merchant_financing_id;
                            if (typeof merchant_financings[m_f_id]!=='object') {
                                merchant_financings[m_f_id] = res[0];
                                merchant_financings[m_f_id].payments = [];
                            }
                            merchant_financings[m_f_id].payments.push(item);
                            cb(null);
                        });
                    }, cb);
                    // Получим финансирования для этих платежей
                }
            ],cb);
        },
        prepareData: function (cb) {
            readyData = {
                report_date: report_date,
                cut_off_date: weekAgo,
                fin: [],
                fin1: []
            };
            readyData.total_founding_amount = 0;
            readyData.total_gross_profit = 0;
            readyData.total_amount_to_return = 0;
            readyData.total_vg_profit = 0;
            readyData.total_investor_profit = 0;
            readyData.total_collected = 0;
            readyData.total_pending = 0;
            readyData.total_pending_remittance = 0;
            readyData.total_final_vg_profit = 0;
            for (var i in merchant_financings) {

                var gross_profit = merchant_financings[i].amount_to_return - merchant_financings[i].founding_amount;
                var bank_comision = merchant_financings[i].amount_to_return * 0.03;
                //var net_profit = (merchant_financings[i].amount_to_return - merchant_financings[i].founding_amount) - (merchant_financings[i].amount_to_return * 0.03);
                var pending_remittance = 0;
                var final_vg_profit = (merchant_financings[i].status_sysname == 'CLOSED')? (gross_profit - bank_comision) / 2 : 0;

                for (var j in merchant_financings[i].payments) {
                    var payment = merchant_financings[i].payments[j];
                    if (payment.status_sysname!='PAID') continue;
                    pending_remittance += payment.paid_amount;
                }

                readyData.fin.push({
                    merchant_id:merchant_financings[i].merchant_id,
                    name:merchant_financings[i].merchant_name,
                    founding_amount:merchant_financings[i].founding_amount,
                    financing_date: funcs.userFriendlyDate(merchant_financings[i].financing_date || merchant_financings[i].payments_start_date),
                    factoring_rate: merchant_financings[i].factoring_rate,
                    payments_count: merchant_financings[i].payments_count,
                    payment_amount: merchant_financings[i].payment_amount,
                    bank_comission_summ: bank_comision,
                    net_profit: gross_profit - bank_comision,
                    gross_profit: gross_profit,
                    amount_to_return:merchant_financings[i].amount_to_return,
                    vg_net_profit:(merchant_financings[i].amount_to_return - bank_comision) / 2,
                    investor_net_profit:(merchant_financings[i].amount_to_return - bank_comision) / 2,
                    complete_percent:merchant_financings[i].complete_percent,
                    total_returned:merchant_financings[i].total_returned,
                    to_return:merchant_financings[i].to_return,
                    pending_remittance:pending_remittance,
                    final_vg_profit:final_vg_profit

                });

                readyData.total_founding_amount       += merchant_financings[i].founding_amount;
                readyData.total_gross_profit          += +gross_profit;

                readyData.total_bank_comission        += +(merchant_financings[i].amount_to_return * 0.03);
                readyData.total_net_profit            += +gross_profit - bank_comision;

                readyData.total_amount_to_return      += merchant_financings[i].amount_to_return;
                readyData.total_vg_profit             += (merchant_financings[i].amount_to_return - bank_comision) / 2;
                readyData.total_investor_profit       += (merchant_financings[i].amount_to_return - bank_comision) / 2;
                readyData.total_collected             += merchant_financings[i].total_returned;
                readyData.total_pending               += merchant_financings[i].to_return;
                readyData.total_pending_remittance    += merchant_financings[i].pending_remittance;
                readyData.total_final_vg_profit       += merchant_financings[i].final_vg_profit;


                readyData.fin1.push({
                    merchant_id:            merchant_financings[i].merchant_id,
                    name:                   merchant_financings[i].merchant_name,
                    gross_investment:       merchant_financings[i].founding_amount + bank_comision,
                    bank_comission_percent: 3,
                    bank_comission:         bank_comision,
                    net_investment:         merchant_financings[i].founding_amount,
                    participation:          '100%',
                    gross_profit:           gross_profit,
                    factoring_rate:         merchant_financings[i].factoring_rate,
                    gross_amount_to_return: merchant_financings[i].amount_to_return,
                    vg_comission:           ((merchant_financings[i].amount_to_return - merchant_financings[i].founding_amount) - bank_comision) / 2,
                    net_profit:             ((merchant_financings[i].amount_to_return - merchant_financings[i].founding_amount) - bank_comision) / 2,
                    net_amount_to_return:   merchant_financings[i].amount_to_return - ((merchant_financings[i].amount_to_return - merchant_financings[i].founding_amount) - bank_comision) / 2
                });

                readyData.total_gross_investment        += merchant_financings[i].founding_amount + bank_comision;
                readyData.total_bank_comission          += 105;
                readyData.total_net_investment          += merchant_financings[i].founding_amount;
                readyData.total_gross_profit_2          += gross_profit;
                readyData.total_gross_amount_to_return  += merchant_financings[i].amount_to_return;
                readyData.total_vg_comission            += ((merchant_financings[i].amount_to_return - merchant_financings[i].founding_amount) - bank_comision) / 2;
                readyData.total_net_profit_2            += ((merchant_financings[i].amount_to_return - merchant_financings[i].founding_amount) - bank_comision) / 2;
                readyData.total_net_amount_to_return    += 120;//merchant_financings[i].amount_to_return - ((merchant_financings[i].amount_to_return - merchant_financings[i].founding_amount) - bank_comision) / 2;

            }
            cb(null);
        },
        getTemplate: function (cb) {
            fs.readFile('./templates/' + name, function (err, data) {
                if (err) return cb(new MyError('Не удалось считать файл шаблона test.xlsx.', err));
                template = new XlsxTemplate(data);
                cb(null);
            });
        },
        perform: function (cb) {
            var sheetNumber = 1;
            template.substitute(sheetNumber, readyData);
            var dataBuf = template.generate();
            binaryData = new Buffer(dataBuf, 'binary');
            cb(null)
        },
        writeFile: function (cb) {
            filename = '_' + name;
            fs.writeFile('./public/savedFiles/' + filename,binaryData, function (err) {
                if (err) return cb(new MyError('Не удалось записать файл testOutput.xlsx',{err:err}));
                return cb(null, new UserOk('testOutput.xlsx успешно сформирован'));
            });
        }
    }, function (err) {
        if (err) return cb(err);
        cb(null, new UserOk('Ок.',{filename:filename,path:'/savedFiles/'}));
    })


};




module.exports = Model;