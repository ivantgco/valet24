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
var rollback = require('../modules/rollback');
var sendMail = require('../libs/sendMail');
var fs = require('fs');
var mustache = require('mustache');
var generateCalendar = require('../modules/generate_calendar');

var Model = function(obj){
    this.name = obj.name;
    this.tableName = obj.name.toLowerCase();

    var basicclass = BasicClass.call(this, obj);
    if (basicclass instanceof MyError) return basicclass;
};
util.inherits(Model, BasicClass);

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


Model.prototype.createCalendar = function (obj, cb) {
    if (arguments.length == 1) {
        cb = arguments[0];
        obj = {};
    }
    var _t = this;
    var financing_id = obj.merchant_financing_id;
    var payments_start_date = obj.payments_start_date;
    if (isNaN(+financing_id)) return cb(new MyError('В метод не передан financing_id финансирования'));
    if (!funcs.validation.isDate(payments_start_date)) return cb(new UserError('Неверно указана дата начала платежей.'));
    var confirm = obj.confirm;
    var rollback_key = obj.rollback_key || rollback.create();

    var calendar_type = obj.calendar_type || 'gov';

    // Получим данные по финансированию
    // Проверим нет ли созданных календарей
    // Сгенерируем календарь
    // Создадим календарь (запись)
    // Создадим платежи календаря




    var merchant_financing, calendar, calendar_id;
    async.series({
        getMerchantFinancing: function (cb) {
            // Получить данные о финансировании мерчанта
            var o = {
                command:'get',
                object:'merchant_financing',
                params:{
                    param_where:{
                        id:financing_id
                    },
                    collapseData:false
                }
            };
            _t.api(o, function (err, res) {
                if (err) return cb(err);
                if (!res.length) return cb(new MyError('Не найдено финансирование.', {id: financing_id}));
                merchant_financing = res[0];
                cb(null);
            });
        },
        checkCreatedCalendars: function (cb) {
            var o = {
                command: 'getCount',
                object: 'Merchant_financing_calendar',
                params: {
                    param_where:{
                        merchant_financing_id: financing_id
                    }
                }
            };
            _t.api(o, function (err, res) {
                if (err) return cb(err);
                if (res.code) return cb(new UserError('Не удалось определить наличие календарей для этого финансирования',{res:res}));
                if (res.count) return cb(new UserError('Для данного финансирования уже создан календарь.',{count:res.count}));
                cb(null);
            });
        },
        checkAnother: function (cb) {
            if (['BANK_CONFIRM'].indexOf(merchant_financing.status_sysname)==-1){
                var statuses = ['Банк подтвердил'].join(', ');
                return cb(new UserError('Финансирование должно быть в одном из следующих статусов: ' + statuses, {
                    id:financing_id,
                    status:merchant_financing.status
                }));
            }
            if (!merchant_financing.processing_bank_id) return cb(new UserError('У финансирования не указан банк.'));
            // Проверим что дата начала больше или равна текущей
            var now = funcs.getDate();
            if (funcs.date_A_more_B(now, merchant_financing.agreement_date) && !confirm){
                return cb(new UserError('needConfirm', {message: 'Дата начала платежей уже прошла (указана '+ merchant_financing.agreement_date +'). Необходимо будет обработать уже прошедшие платежи.<br>Вы уверены?"',title:'Вы уверены, что дата указана верно?',key:1, confirmType:'dialog'}));
            }
            cb(null);
        },
        generateCalendar: function (cb) {
            generateCalendar({
                date_start: payments_start_date,
                payments_count: merchant_financing.payments_count,
                type: calendar_type
            }, function (err, res) {
                calendar = res;
                cb(null);
            });
        },
        createCalendar: function (cb) {
            var params = {
                merchant_id: merchant_financing.merchant_id,
                merchant_financing_id: financing_id,
                payments_start_date: payments_start_date,
                payments_count: merchant_financing.payments_count,
                status_sysname: 'IN_WORK'
            };
            params.rollback_key = rollback_key;
            _t.add(params, function (err, res) {
                if (err) return cb(err);
                calendar_id = res.id;
                cb(null);
            });
        },
        createPayments: function (cb) {
            var lastpayment = merchant_financing.amount_to_return - merchant_financing.payment_amount * (merchant_financing.payments_count - 1 );

            var counter = 0;

            async.eachSeries(calendar, function (item, cb) {

                var o = {
                    command: 'add',
                    object: 'merchant_financing_payment',
                    params: {
                        merchant_id: merchant_financing.merchant_id,
                        calendar_id: calendar_id,
                        status_sysname: 'PENDING',
                        payment_date: item
                    }
                };
                o.params.rollback_key = rollback_key;
                if (counter == calendar.length - 1) {
                    o.params.pending_amount = lastpayment;
                } else {
                    o.params.pending_amount = merchant_financing.payment_amount;
                }

                _t.api(o, function (err, res) {
                    if (err) return cb(err);
                    counter++;
                    cb(null);
                });
            }, function (err, res) {
                if (err) return cb(err);
                cb(null);
            });
        },
        setCurrentCalendarId_toMerchant: function (cb) {
            var o = {
                command: 'modify',
                object: 'merchant',
                params: {
                    id: merchant_financing.merchant_id,
                    current_calendar_id:calendar_id
                }
            };
            o.params.rollback_key = rollback_key;
            _t.api(o, function (err) {
                if (err) return cb(new MyError('Не удалось устаносить текущей календарь для торговца', {
                    err: err,
                    merchant_id: merchant_financing.merchant_id,
                    current_calendar_id:calendar_id
                }));
                return cb(null);
            });
        },
        setCurrentCalendarId_toFinancing: function (cb) {
            var o = {
                command: 'modify',
                object: 'merchant_financing',
                params: {
                    id: financing_id,
                    current_calendar_id:calendar_id
                }
            };
            o.params.rollback_key = rollback_key;
            _t.api(o, function (err) {
                if (err) return cb(new MyError('Не удалось устаносить текущей календарь для финансирования', {
                    err: err,
                    current_calendar_id:calendar_id
                }));
                return cb(null);
            });
        },
        changeStatus: function (cb) {
            // Поменять статус
            _t.setStatus({
                id: calendar_id,
                status: 'IN_WORK'
            }, function (err) {
                if (err) return cb(new UserError('Не удалось изменить статус календаря. Обратитесь к администратору.', {err: err}));
                cb(null);
            });
        }
    }, function (err, res) {
        if (err) {
            if (err.message == 'needConfirm') return cb(err);
            rollback.rollback(rollback_key, function (err2) {
                return cb(err, err2);
            });
        }else{
            cb(null, new UserOk('Календарь готов к работе.'));
        }
    });
};


Model.prototype.makePaymentGetDate = function (obj, cb) {
    if (arguments.length == 1) {
        cb = arguments[0];
        obj = {};
    }
    var _t = this;
    var id = obj.id;
    if (isNaN(+id)) return cb(new MyError('В метод не передан id'));
    var calendar, payment_date;
    // Получить данны по календарю
    // Проверить статус календаря
    // Получим саммый ранний не обработаный < чем сегодня

    async.series({
        get: function (cb) {
            _t.getById({id:id}, function (err, res) {
                if (err) return cb(err);
                if (!res.length) return cb(new UserError('Календарь не найден.'));
                calendar = res[0];
                cb(null);
            })
        },
        check: function (cb) {
            if (calendar.status_sysname !== 'IN_WORK') return cb(new UserError('Календарь не активен. Невозможно отметить платеж.',{status_sysname:calendar.status_sysname}));
            cb(null);
        },
        getFirstVoidPayment: function (cb) {
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
                            key:'status_sysname',
                            val1:'PENDING'
                        },
                        {
                            key:'payment_date',
                            type:'<',
                            val1:funcs.getDateMySQL()
                        }
                    ],
                    sort: {
                        columns: 'payment_date',
                        direction: 'ASC'
                    },
                    collapseData:false
                }
            };
            _t.api(o, function (err, res) {
                if (err) return cb(new MyError('Не удалось получить платежи календаря.',{err:err}));
                if (!res.length) return cb(new UserError('Нет неотмеченных платежей.',{type:'info'}));
                payment_date = res[0].payment_date;
                cb(null);
            })
        }
    }, function (err) {
        if (err) return cb(err);
        cb(null, new UserOk('noToastr',{payment_date:payment_date}));

    })

};

Model.prototype.makePayment = function (obj, cb) {
    if (arguments.length == 1) {
        cb = arguments[0];
        obj = {};
    }
    var _t = this;
    var id = obj.id;
    var payment_date = obj.payment_date;
    if (isNaN(+id)) return cb(new MyError('В метод не передан id'));
    if (!funcs.validation.isDate(payment_date)) return cb(new MyError('Не корректно передана дата.',{payment_date:payment_date}));
    if (funcs.date_A_more_or_equal_B(payment_date,funcs.getDate())) return cb(new UserError('Платеж может быть отмечен только за прошедшую дату.'));
    var rollback_key = obj.rollback_key || rollback.create();

    // Получить платеж по дате
    // makePayment
    var payment;
    async.series({
        getCurrentPayment: function (cb) {
            // Получить платеж по дате с нужным статусом
            var o = {
                command:'get',
                object:'merchant_financing_payment',
                params:{
                    param_where:{
                        calendar_id:id,
                        payment_date:payment_date,
                        status_sysname:'PENDING'
                    },
                    collapseData:false
                }
            };
            _t.api(o, function (err, res) {
                if (err) return cb(new MyError('Не удалось получить заданный платеж.',{err:err}));
                if (res.length > 1) return cb(new UserError('alertDeveloper',{message:'Найдено слишком много не отмеченных платежей для этого календаря на эту дату.'}));
                if (!res.length) return cb(new UserError('Не найден платеж на эту дату (для этого календаря) или он уже отмечен.'));
                payment = res[0];
                cb(null);
            })
        },
        makePayment: function (cb) {
            var o = {
                command:'makePayment',
                object:'merchant_financing_payment',
                params:{
                    id:payment.id,
                    payment_date:payment_date,
                    fromServer:true
                }
            };
            _t.api(o, cb);
        }
    }, function (err) {
        if (err) {
            if (err.message == 'needConfirm') return cb(err);
            rollback.rollback(rollback_key, function (err2) {
                return cb(err, err2);
            });
        }else{
            cb(null, new UserOk('Платеж за дату "' + payment_date + '" отмечен как "Оплачен"'));
        }
    })

};
Model.prototype.makeDefault = function (obj, cb) {
    if (arguments.length == 1) {
        cb = arguments[0];
        obj = {};
    }
    var _t = this;
    var id = obj.id;
    var payment_date = obj.payment_date;
    if (isNaN(+id)) return cb(new MyError('В метод не передан id'));
    if (!funcs.validation.isDate(payment_date)) return cb(new MyError('Не корректно передана дата.',{payment_date:payment_date}));
    if (funcs.date_A_more_or_equal_B(payment_date,funcs.getDate())) return cb(new UserError('Платеж может быть отмечен только за прошедшую дату.'));
    var rollback_key = obj.rollback_key || rollback.create();

    // Получить платеж по дате
    // makePayment
    var payment;
    async.series({
        getCurrentPayment: function (cb) {
            // Получить платеж по дате с нужным статусом
            var o = {
                command:'get',
                object:'merchant_financing_payment',
                params:{
                    param_where:{
                        calendar_id:id,
                        payment_date:payment_date,
                        status_sysname:'PENDING'
                    },
                    collapseData:false
                }
            };
            _t.api(o, function (err, res) {
                if (err) return cb(new MyError('Не удалось получить заданный платеж.',{err:err}));
                if (res.length > 1) return cb(new UserError('alertDeveloper',{message:'Найдено слишком много не отмеченных платежей для этого календаря на эту дату.'}));
                if (!res.length) return cb(new UserError('Не найден платеж на эту дату (для этого календаря) или он уже отмечен.'));
                payment = res[0];
                cb(null);
            })
        },
        makeDefault: function (cb) {
            var o = {
                command:'makeDefault',
                object:'merchant_financing_payment',
                params:{
                    id:payment.id,
                    payment_date:payment_date,
                    fromServer:true
                }
            };
            _t.api(o, cb);
        }
    }, function (err, res) {
        if (err) {
            if (err.message == 'needConfirm') return cb(err);
            rollback.rollback(rollback_key, function (err2) {
                return cb(err, err2);
            });
        }else{
            cb(null, res);
        }
    })

};
//
//
//Model.prototype.lock = function (obj, cb) {
//    if (arguments.length == 1) {
//        cb = arguments[0];
//        obj = {};
//    }
//    var _t = this;
//    var id = obj.id;
//    if (isNaN(+id)) return cb(new MyError('В метод не передан id'));
//    var rollback_key = obj.rollback_key || rollback.create();
//    // Переведем в статус LOCK
//
//};

Model.prototype.machinegun = function (obj, cb) {
    if (arguments.length == 1) {
        cb = arguments[0];
        obj = {};
    }
    var _t = this;
    var id = obj.id;
    if (isNaN(+id)) return cb(new MyError('В метод не передан id'));
    var rollback_key = obj.rollback_key || rollback.create();
    var payment_count = obj.payment_count || 20;


    // Получим ближайшие payment_count || 20 платежей в PENDING
    // Выполним makePayment для них

    var payments;
    var real_payment_count = 0;
    async.series({
        getPayments: function (cb) {
            // Получить платеж по дате с нужным статусом
            var o = {
                command:'get',
                object:'merchant_financing_payment',
                params:{
                    param_where:{
                        calendar_id:id,
                        status_sysname:'PENDING'
                    },
                    limit:payment_count,
                    sort: {
                        columns: 'payment_date',
                        direction: 'ASC'
                    },
                    collapseData:false
                }
            };
            _t.api(o, function (err, res) {
                if (err) return cb(new MyError('Не удалось получить платежи.',{err:err}));
                payments = res;
                cb(null);
            })
        },
        makePayments: function (cb) {
            async.eachSeries(payments, function (item, cb) {
                var o = {
                    command:'makePayment',
                    object:'merchant_financing_payment',
                    params:{
                        id:item.id,
                        payment_date:item.payment_date,
                        fromServer:true
                    }
                };
                _t.api(o, function (err) {
                    if (err) return cb(err);
                    real_payment_count++;
                    cb(null);
                });
            },cb);
        }
    }, function (err) {
        if (err) {
            if (err.message == 'needConfirm') return cb(err);
            rollback.rollback(rollback_key, function (err2) {
                return cb(err, err2);
            });
        }else{
            cb(null, new UserOk(real_payment_count + ' платежей отмечены как "Оплачен"'));
        }
    })
};

Model.prototype.closeCalendar = function (obj, cb) {
    if (arguments.length == 1) {
        cb = arguments[0];
        obj = {};
    }
    var _t = this;
    var id = obj.id;
    var closing_date = obj.closing_date || funcs.getDateMySQL();
    var closing_type_sysname = obj.closing_type_sysname;
    var closing_type_id = obj.closing_type_id;
    if (isNaN(+id)) return cb(new MyError('В метод не передан id'));
    if (!funcs.validation.isDate(closing_date)) return cb(new MyError('Не корректно передана дата.', {payment_date: closing_date}));
    if (!closing_type_sysname && isNaN(+closing_type_id)) return cb(new MyError('Не передано системное имя или id для закрытия',{closing_type_sysname:closing_type_sysname,closing_type_id:closing_type_id}));
    var rollback_key = obj.rollback_key || rollback.create();

    // Проверим lock_key
    // Получим статус закрытия по status_sysname
    // Закроем календарь

    var calendar_closing_type;
    async.series({
        getClosingTypeForCalendar: function (cb) {
            var o = {
                command:'get',
                object:'calendar_close_type',
                params:{
                    param_where:{
                        sysname:closing_type_sysname
                    },
                    collapseData:false
                }
            };
            _t.api(o, function (err, res) {
                if (err) return cb(err);
                if (!res.length) return cb(new MyError('payment_close_type не найден.'));
                if (res.length > 1) return cb(new MyError('payment_close_type слишком много.'));
                calendar_closing_type = res[0];
                cb(null);
            });
        },
        close: function (cb) {
            // Закроем календарь
            var params = {
                id:id,
                closing_type_id:calendar_closing_type.id,
                closing_date:closing_date,
                status_sysname:'CLOSED'
            };
            params.rollback_key = rollback_key;
            params.lock_key = obj.lock_key;
            _t.modify(params, cb);
        }
    }, cb);
};



module.exports = Model;