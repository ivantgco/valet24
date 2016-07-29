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
var moment = require('moment');

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

/**
 * Закрывает платеж PAID или DEFAULT
 * Устанавливает тип закрытия
 * @param obj
 * @param cb
 * @returns {*}
 */
Model.prototype.makePayment = function (obj, cb) {
    if (arguments.length == 1) {
        cb = arguments[0];
        obj = {};
    }
    var _t = this;
    var id = obj.id;
    var payment_date = obj.payment_date || funcs.getDate();
    if (isNaN(+id)) return cb(new MyError('В метод не передан id'));
    if (!funcs.validation.isDate(payment_date)) return cb(new MyError('Не корректно передана дата.',{payment_date:payment_date}));
    if (funcs.date_A_more_or_equal_B(payment_date,funcs.getDate()) && !obj.fromServer) return cb(new UserError('Платеж может быть отмечен только за прошедшую дату.'));
    var rollback_key = obj.rollback_key || rollback.create();
    var closing_type_id = obj.closing_type_id;
    // Получить платеж в нужном статусе

    // Получить данные о календаре
    // Проверить статус календаря
    // Получить дату платежа если передан только ID
    // Получим статус_id PAID
    // Подготовить данные по статистике платежей
    // Сменить платежу статус и выставить сумму и указать пользователя и статистические данные
    // Подготовить данные по статистике платежей
    // Записать данные по статистике платежей


    var calendar, payment, status_id;
    var merchant, merchant_financing;
    var payments_pending, payments_paid, payments_default, total_returned, to_return, complete_percent;
    var payments_paid_count, payments_default_count, payments_pending_count;
    async.series({
        get: function (cb) {
            _t.getById({id:id}, function (err, res) {
                if (err) return cb(err);
                if (!res.length) return cb(new UserError('Платеж не найден.'));
                payment = res[0];
                cb(null);
            })
        },
        getCalendar: function (cb) {
            // Получить данные о календаре
            var o = {
                command:'get',
                object:'merchant_financing_calendar',
                params:{
                    param_where:{
                        id:payment.calendar_id
                    },
                    collapseData:false
                }
            };
            _t.api(o, function (err, res) {
                if (err) return cb(new MyError('Не удалось получить календарь.',{err:err}));
                if (!res.length) return cb(new MyError('Не найден Календарь.'));
                calendar = res[0];
                cb(null);
            })
        },
        checkCalendar: function (cb) {
            if (calendar.status_sysname !== 'IN_WORK') return cb(new UserError('Календарь не активен. Невозможно отметить платеж.',{status_sysname:calendar.status_sysname}));
            cb(null);
        },
        getPaymentStatus: function (cb) {
            // Получим статус_id PAID
            var o = {
                command:'get',
                object:'merchant_financing_payment_status',
                params:{
                    param_where:{
                        sysname:'PAID'
                    },
                    collapseData:false
                }
            };
            _t.api(o, function (err, res) {
                if (err) return cb(new MyError('Не удалось получить статус платежа PAID.',{err:err}));
                if (!res.length) return cb(new UserError('Не найден статус платежа PAID. Добавьте такой в справочник.'));
                if (res.length > 1) return cb(new MyError('Слишком много статусов платежей с системным именем PAID. Удалите лишние'));
                status_id = res[0].id;
                cb(null);
            })
        },
        getPaymentCloseType: function (cb) {
            if (closing_type_id) return cb(null);
            // Получим тип закрытия BY_PROCESSING
            var o = {
                command:'get',
                object:'payment_close_type',
                params:{
                    param_where:{
                        sysname:'BY_PROCESSING'
                    },
                    collapseData:false
                }
            };
            _t.api(o, function (err, res) {
                if (err) return cb(new MyError('Не удалось получить тип закрытия BY_PROCESSING.',{err:err}));
                if (!res.length) return cb(new UserError('Не найден тип закрытия BY_PROCESSING. Добавьте такой в справочник.'));
                if (res.length > 1) return cb(new MyError('Слишком много типов платежа с системным именем BY_PROCESSING. Удалите лишние'));
                closing_type_id = res[0].id;
                cb(null);
            })
        },
        getStatisticInfo: function (cb) {
            // Подготовить данные по статистике платежей
            //payments_paid = 0; // посчитать из платежей
            //payments_default = 0; // посчитать из платежей
            //total_returned = 0; // посчитать из платежей
            //to_return = 0; // Взять из финансирования
            //payments_pending
            //complete_percent = 0; // Считаем по сумме
            async.series({
                get_financing: function (cb) {
                    var o = {
                        command:'get',
                        object:'merchant_financing',
                        params:{
                            param_where:{
                                id:calendar.merchant_financing_id
                            },
                            collapseData:false
                        }
                    };
                    _t.api(o, function (err, res) {
                        if (err) return cb(err);
                        if (!res.length) return cb(new MyError('Финансирование не найдено.'));
                        merchant_financing = res[0];
                        cb(null);
                    });
                },
                get_merchant: function (cb) {
                    var o = {
                        command:'get',
                        object:'merchant',
                        params:{
                            param_where:{
                                id:merchant_financing.merchant_id
                            },
                            collapseData:false
                        }
                    };
                    _t.api(o, function (err, res) {
                        if (err) return cb(err);
                        if (!res.length) return cb(new MyError('Торговец не найден.'));
                        merchant = res[0];
                        cb(null);
                    });
                },
                get_payments_pending: function (cb) {
                    var params = {
                        param_where:{
                            calendar_id:calendar.id,
                            status_sysname:'PENDING'
                        },
                        collapseData:false
                    };
                    _t.getCount(params, function (err, res) {
                        if (err) return cb(new MyError('Не удалось получить PENDING платежи.',{err:err}));
                        payments_pending_count = res.count - 1;
                        cb(null);
                    });
                },
                get_payments_paid: function (cb) {
                    var params = {
                        param_where:{
                            calendar_id:calendar.id,
                            status_sysname:'PAID'
                        },
                        collapseData:false
                    };
                    _t.get(params, function (err, res) {
                        if (err) return cb(new MyError('Не удалось получить PAID платежи.',{err:err}));
                        payments_paid = res;
                        payments_paid_count = res.length + 1;
                        cb(null);
                    });
                },
                get_payments_default: function (cb) {
                    var params = {
                        param_where:{
                            calendar_id:calendar.id,
                            status_sysname:'DEFAULT'
                        },
                        collapseData:false
                    };
                    _t.getCount(params, function (err, res) {
                        if (err) return cb(new MyError('Не удалось получить PAID платежи.',{err:err}));
                        payments_default_count = res.count;
                        cb(null);
                    });
                },
                get_total_returned: function (cb) {
                    total_returned = payment.pending_amount;
                    for (var i in payments_paid) {
                        total_returned += payments_paid[i].paid_amount;
                    }
                    cb(null);
                },
                get_to_return: function (cb) {
                    to_return = merchant_financing.amount_to_return - total_returned;
                    cb(null);
                },
                get_complete_percent: function (cb) {
                    if (isNaN(+to_return)) return cb(new UserError('Некорректно указана сумма возврата.',{to_return:to_return}));
                    complete_percent = Math.floor(total_returned * 100 / merchant_financing.amount_to_return);
                    if (!to_return) complete_percent = 100;
                    cb(null);
                }

            },cb);
        },
        setPayment: function (cb) {
            // Сменить платежу статус и выставить сумму, дату и указать пользователя и % закрытия
            var params = {
                id: id,
                status_id: status_id,
                closing_type_id: closing_type_id,
                closing_date: payment_date,
                paid_amount: payment.pending_amount,
                paid_date: payment_date,
                paid_by_user_id:_t.user.user_data.id,
                complete_percent:complete_percent
            };
            params.rollback_key = rollback_key;
            _t.modify(params, function (err) {
                if (err) return cb(new UserError('Не удалось отметить платеж.',{err:err}));
                cb(null);
            });
        },
        setStatistickInfo: function (cb) {
            // Записать данные по статистике платежей
            async.series({
                setToMerchant: function (cb) {
                    var o = {
                        command:"modify",
                        object:"merchant",
                        params:{
                            id:merchant.id,
                            payments_paid:payments_paid_count,
                            payments_default:payments_default_count,
                            total_returned:total_returned,
                            to_return:to_return,
                            payments_pending:payments_pending_count,
                            complete_percent:complete_percent
                        }
                    };
                    o.params.rollback_key = rollback_key;
                    _t.api(o, function (err) {
                        if (err) return cb(new MyError('Не удалось установить статестические данные.',{err:err}));
                        cb(null);
                    });
                },
                setToFinancing: function (cb) {
                    var o = {
                        command:"modify",
                        object:"merchant_financing",
                        params:{
                            id:merchant_financing.id,
                            payments_paid:payments_paid_count,
                            payments_default:payments_default_count,
                            total_returned:total_returned,
                            to_return:to_return,
                            payments_pending:payments_pending_count,
                            complete_percent:complete_percent,
                            lock_key:obj.financing_lock_key
                        }
                    };
                    o.params.rollback_key = rollback_key;
                    _t.api(o, function (err) {
                        if (err) return cb(new MyError('Не удалось установить статестические данные.',{err:err}));
                        cb(null);
                    });
                },
                setToCalendar: function (cb) {
                    var o = {
                        command:"modify",
                        object:"merchant_financing_calendar",
                        params:{
                            id:calendar.id,
                            payments_paid:payments_paid_count,
                            payments_default:payments_default_count,
                            total_returned:total_returned,
                            to_return:to_return,
                            payments_pending:payments_pending_count,
                            complete_percent:complete_percent,
                            lock_key:obj.calendar_lock_key
                        }
                    };
                    o.params.rollback_key = rollback_key;
                    _t.api(o, function (err) {
                        if (err) return cb(new MyError('Не удалось установить статестические данные.',{err:err}));
                        cb(null);
                    });
                }
            },cb);
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
    var payment_date = obj.payment_date || funcs.getDate();
    if (isNaN(+id)) return cb(new MyError('В метод не передан id'));
    if (!funcs.validation.isDate(payment_date)) return cb(new MyError('Не корректно передана дата.',{payment_date:payment_date}));
    if (funcs.date_A_more_or_equal_B(payment_date,funcs.getDate()) && !obj.fromServer) return cb(new UserError('Платеж может быть отмечен только за прошедшую дату.'));
    var rollback_key = obj.rollback_key || rollback.create();
    var closing_type_id = obj.closing_type_id;
    var status = (obj.status == 'MOVED_TO_THE_END')? obj.status : 'DEFAULT';

    // Получить платеж в нужном статусе

    // Получить данные о календаре
    // Проверить статус календаря
    // Получим статус_id DEFAULT
    // Подготовить данные по статистике платежей
    // Сменить платежу статус и выставить сумму и указать пользователя и статистические данные
    // Подготовить данные по статистике платежей
    // Записать данные по статистике платежей


    var calendar, payment, status_id;
    var merchant, merchant_financing;
    var payments_pending, payments_paid, payments_default, total_returned, to_return, complete_percent;
    var payments_paid_count, payments_default_count, payments_pending_count;
    var main_company, main_company_emails, invalid_emails, tpl;
    async.series({
        get: function (cb) {
            _t.getById({id:id}, function (err, res) {
                if (err) return cb(err);
                if (!res.length) return cb(new UserError('Платеж не найден.'));
                payment = res[0];
                cb(null);
            })
        },
        getCalendar: function (cb) {
            // Получить данные о календаре
            var o = {
                command:'get',
                object:'merchant_financing_calendar',
                params:{
                    param_where:{
                        id:payment.calendar_id
                    },
                    collapseData:false
                }
            };
            _t.api(o, function (err, res) {
                if (err) return cb(new MyError('Не удалось получить календарь.',{err:err}));
                if (!res.length) return cb(new MyError('Не найден Календарь.'));
                calendar = res[0];
                cb(null);
            })
        },
        checkCalendar: function (cb) {
            if (calendar.status_sysname !== 'IN_WORK') return cb(new UserError('Календарь не активен. Невозможно отметить платеж.',{status_sysname:calendar.status_sysname}));
            cb(null);
        },
        getPaymentStatus: function (cb) {
            // Получим статус_id PAID
            var o = {
                command:'get',
                object:'merchant_financing_payment_status',
                params:{
                    param_where:{
                        sysname:'DEFAULT'
                    },
                    collapseData:false
                }
            };
            _t.api(o, function (err, res) {
                if (err) return cb(new MyError('Не удалось получить статус платежа DEFAULT.',{err:err}));
                if (!res.length) return cb(new UserError('Не найден статус платежа DEFAULT. Добавьте такой в справочник.'));
                if (res.length > 1) return cb(new MyError('Слишком много статусов платежей с системным именем DEFAULT. Удалите лишние'));
                status_id = res[0].id;
                cb(null);
            })
        },
        getStatisticInfo: function (cb) {
            // Подготовить данные по статистике платежей
            //payments_paid = 0; // посчитать из платежей
            //payments_default = 0; // посчитать из платежей
            //total_returned = 0; // посчитать из платежей
            //to_return = 0; // Взять из финансирования
            //payments_pending
            //complete_percent = 0; // Считаем по сумме
            async.series({
                get_financing: function (cb) {
                    var o = {
                        command:'get',
                        object:'merchant_financing',
                        params:{
                            param_where:{
                                id:calendar.merchant_financing_id
                            },
                            collapseData:false
                        }
                    };
                    _t.api(o, function (err, res) {
                        if (err) return cb(err);
                        if (!res.length) return cb(new MyError('Финансирование не найдено.'));
                        merchant_financing = res[0];
                        cb(null);
                    });
                },
                get_merchant: function (cb) {
                    var o = {
                        command:'get',
                        object:'merchant',
                        params:{
                            param_where:{
                                id:merchant_financing.merchant_id
                            },
                            collapseData:false
                        }
                    };
                    _t.api(o, function (err, res) {
                        if (err) return cb(err);
                        if (!res.length) return cb(new MyError('Торговец не найден.'));
                        merchant = res[0];
                        cb(null);
                    });
                },
                get_payments_pending: function (cb) {
                    var params = {
                        param_where:{
                            calendar_id:calendar.id,
                            status_sysname:'PENDING'
                        },
                        collapseData:false
                    };
                    _t.getCount(params, function (err, res) {
                        if (err) return cb(new MyError('Не удалось получить PENDING платежи.',{err:err}));
                        payments_pending_count = res.count - 1;
                        cb(null);
                    });
                },
                get_payments_paid: function (cb) {
                    var params = {
                        param_where:{
                            calendar_id:calendar.id,
                            status_sysname:'PAID'
                        },
                        collapseData:false
                    };
                    _t.get(params, function (err, res) {
                        if (err) return cb(new MyError('Не удалось получить PAID платежи.',{err:err}));
                        payments_paid = res;
                        payments_paid_count = res.length;
                        cb(null);
                    });
                },
                get_payments_default: function (cb) {
                    var params = {
                        param_where:{
                            calendar_id:calendar.id,
                            status_sysname:'DEFAULT'
                        },
                        collapseData:false
                    };
                    _t.getCount(params, function (err, res) {
                        if (err) return cb(new MyError('Не удалось получить DEFAULT платежи.',{err:err}));
                        payments_default_count = res.count + 1;
                        cb(null);
                    });
                },
                get_total_returned: function (cb) {
                    total_returned = 0;
                    for (var i in payments_paid) {
                        total_returned += payments_paid[i].paid_amount;
                    }
                    cb(null);
                },
                get_to_return: function (cb) {
                    to_return = merchant_financing.amount_to_return - total_returned;
                    cb(null);
                },
                get_complete_percent: function (cb) {
                    if (isNaN(+to_return)) return cb(new UserError('Некорректно указана сумма возврата.',{to_return:to_return}));
                    complete_percent = Math.floor(total_returned * 100 / merchant_financing.amount_to_return);
                    if (!to_return) complete_percent = 100;
                    cb(null);
                }

            },cb);
        },
        setPayment: function (cb) {
            // Сменить платежу статус и выставить сумму, дату и указать пользователя и % закрытия

            var params = {
                id: id,
                status_id:status_id,
                default_date:payment_date,
                default_by_user_id:_t.user.user_data.id,
                complete_percent:complete_percent
            };
            if (closing_type_id){
                params.closing_type_id = closing_type_id;
                params.closing_date = payment_date;
            }
            params.rollback_key = rollback_key;
            _t.modify(params, function (err) {
                if (err) return cb(new UserError('Не удалось отметить платеж.',{err:err}));
                cb(null);
            });
        },
        setStatistickInfo: function (cb) {
            // Записать данные по статистике платежей
            async.series({
                setToMerchant: function (cb) {
                    var o = {
                        command:"modify",
                        object:"merchant",
                        params:{
                            id:merchant.id,
                            payments_paid:payments_paid_count,
                            payments_default:payments_default_count,
                            total_returned:total_returned,
                            to_return:to_return,
                            payments_pending:payments_pending_count,
                            complete_percent:complete_percent
                        }
                    };
                    o.params.rollback_key = rollback_key;
                    _t.api(o, function (err) {
                        if (err) return cb(new MyError('Не удалось установить статестические данные.',{err:err}));
                        cb(null);
                    });
                },
                setToFinancing: function (cb) {
                    var o = {
                        command:"modify",
                        object:"merchant_financing",
                        params:{
                            id:merchant_financing.id,
                            payments_paid:payments_paid_count,
                            payments_default:payments_default_count,
                            total_returned:total_returned,
                            to_return:to_return,
                            payments_pending:payments_pending_count,
                            complete_percent:complete_percent
                        }
                    };
                    o.params.rollback_key = rollback_key;
                    _t.api(o, function (err) {
                        if (err) return cb(new MyError('Не удалось установить статестические данные.',{err:err}));
                        cb(null);
                    });
                },
                setToFinancingForREfinancing: function (cb) {
                    if (!merchant_financing.closed_by_financing_id) return cb(null);
                    var o = {
                        command:"modify",
                        object:"merchant_financing",
                        params:{
                            id:merchant_financing.closed_by_financing_id,
                            refinancing_amount:to_return
                        }
                    };
                    o.params.rollback_key = rollback_key;
                    _t.api(o, function (err) {
                        if (err) return cb(new MyError('Не удалось установить статестические данные.',{err:err}));
                        cb(null);
                    });
                },
                setToCalendar: function (cb) {
                    var o = {
                        command:"modify",
                        object:"merchant_financing_calendar",
                        params:{
                            id:calendar.id,
                            payments_paid:payments_paid_count,
                            payments_default:payments_default_count,
                            total_returned:total_returned,
                            to_return:to_return,
                            payments_pending:payments_pending_count,
                            complete_percent:complete_percent
                        }
                    };
                    o.params.rollback_key = rollback_key;
                    _t.api(o, function (err) {
                        if (err) return cb(new MyError('Не удалось установить статестические данные.',{err:err}));
                        cb(null);
                    });
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
                prepareTemplate: function (cb) {
                    fs.readFile('./templates/paymentDefault_notify.html', function (err, data) {
                        if (err) return cb(new MyError('Не удалось считать файл шаблона.', err));
                        tpl = data.toString();
                        cb(null);
                    });
                },
                sendNotify: function (cb) {
                    // Разослать уведомления
                    //var emails_to_notify = main_company_emails.concat(merchant.email); // Добавим мерча в рассылку
                    var emails_to_notify = main_company_emails;
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

                }
            },cb);
        }
    }, function (err) {
        if (err) {
            if (err.message == 'needConfirm') return cb(err);
            rollback.rollback(rollback_key, function (err2) {
                return cb(err, err2);
            });
        }else{
            cb(null, new UserOk('Платеж за дату "' + payment_date + '" отмечен как "Пропущен."',{invalid_emails:invalid_emails}));
        }
    })
};

Model.prototype.pushDefaultPayment = function (obj, cb) {
    if (arguments.length == 1) {
        cb = arguments[0];
        obj = {};
    }
    var _t = this;
    var id = obj.id;
    if (isNaN(+id)) return cb(new MyError('В метод не передан id'));
    var rollback_key = obj.rollback_key || rollback.create();

    // Задефолтим платеж
    // Получим дату последнего платежа
    // Вычислим дату последнего платежа и добавим
    // Добавим новый в конец


    var payment, last_date, new_payment_date;
    async.series({
        get: function (cb) {
            _t.getById({id:id}, function (err, res) {
                if (err) return cb(err);
                if (!res.length) return cb(new UserError('Платеж не найден.'));
                payment = res[0];
                cb(null);
            })
        },
        check: function (cb) {
            if (payment.status_sysname!=='DEFAULT') return cb(new UserError('Добавить в конец можно только пропущенный платеж.'));
            cb(null);
        },
        getLastPaymnet: function (cb) {
            var params = {
                param_where:{
                    calendar_id: payment.calendar_id
                },
                collapseData:false,
                sort: {
                    columns: 'payment_date',
                    direction: 'DESC'
                },
                limit:100000

            };
            _t.get(params, function (err, res) {
                if (err) return cb(err);
                if (!res.length) return cb(new UserError('Не найдено ни одного платежа.'));
                last_date = moment(moment(res[0].payment_date,'DD.MM.YYYY') + moment.duration(1, 'days')).format('DD.MM.YYYY');
                cb(null);
            })
        },
        getNextDate: function (cb) {
            generateCalendar({
                date_start: last_date,
                payments_count: 1,
                type: 'gov'
            }, function (err, res) {
                if (err) return cb(new MyError('Не удалось получить дату для переноса платежа.',{err:err}));
                if (!res.length) return cb(new MyError('Не удалось получить дату для переноса платежа (2)'));
                new_payment_date = res[0];
                cb(null);
            });
        },
        addPaymentToEnd: function (cb) {
            var params = {
                merchant_id: payment.merchant_id,
                calendar_id: payment.calendar_id,
                status_sysname: 'PENDING',
                payment_date: new_payment_date,
                pending_amount:payment.pending_amount
            };
            params.rollback_key = rollback_key;
            _t.add(params, function (err, res) {
                if (err) return cb(err);
                cb(null);
            });
        },
        changeStatus: function (cb) {
            // Поменять статус
            _t.setStatus({
                id: id,
                status: 'MOVED_TO_END'
            }, function (err) {
                if (err) return cb(new UserError('Не удалось изменить статус платежа. Обратитесь к администратору.', {err: err}));
                cb(null);
            });
        }
    }, function (err) {
        if (err) {
            if (err.message == 'needConfirm') return cb(err);
            rollback.rollback(rollback_key, function (err2) {
                return cb(err, err2);
            });
        }else{
            cb(null, new UserOk('Платеж успешно перенесен в конец'));
        }
    })
};

module.exports = Model;