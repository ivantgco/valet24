(function () {

    var formID = MB.Forms.justLoadedId;
    var formInstance = MB.Forms.getForm('form_merchant', formID);
    var formWrapper = $('#mw-' + formInstance.id);

    var modalInstance = MB.Core.modalWindows.windows.getWindow(formID);
    modalInstance.stick = 'top';
    modalInstance.stickModal();

    formInstance.lowerButtons = [
        {
            title: 'Сменить Банк (РКО)',
            color: "blue",
            icon: "fa-money",
            type: "SINGLE",
            hidden: false,
            condition: [{
                colNames: [],
                matching: [],
                colValues: []
            }],
            handler: function () {
                var data = formInstance.data.data[0];
                var html = '<select data-withempty="false" id="select-work-bank-holder">';
                var selinstance;

                var o = {
                    command: 'get',
                    object: 'bank',
                    params: {
                        param_where:
                            {
                                is_work: true
                            }
                    }
                };

                socketQuery(o, function(r){

                    for(var i in r.data){
                        var b = r.data[i];
                        var bid = b.id;
                        var bname = b.name;

                        html += '<option value="'+bid+'">'+bname+'</option>';

                    }

                    html += '</select>';

                    bootbox.dialog({
                        title: 'Выберите рабочий банк (РКО)',
                        message: html,
                        buttons: {
                            success: {
                                label: 'Подтвердить',
                                callback: function () {

                                    var rko_bank_id = selinstance.value.id;

                                    var o = {
                                        command: 'change_rko_bank',
                                        object: formInstance.class,
                                        client_object: formInstance.client_object,
                                        params: {
                                            id: data.id,
                                            rko_bank_id: rko_bank_id
                                        }
                                    };

                                    socketQuery(o, function (res) {
                                        formInstance.reload();
                                    });
                                }
                            },
                            error: {
                                label: 'Отмена',
                                callback: function () {

                                }
                            }
                        }
                    });

                    selinstance = $('#select-work-bank-holder').select3();

                });

            }
        },
        {
            title: 'Сменить Банк (Эквайер)',
            color: "blue",
            icon: "fa-credit-card",
            type: "SINGLE",
            hidden: false,
            condition: [{
                colNames: [],
                matching: [],
                colValues: []
            }],
            handler: function () {
                var data = formInstance.data.data[0];
                var html = '<select data-withempty="false" id="select-work-bank-holder">';
                var selinstance;

                var o = {
                    command: 'get',
                    object: 'bank',
                    params: {
                        param_where:
                        {
                            is_work: true
                        }
                    }
                };

                socketQuery(o, function(r){

                    for(var i in r.data){
                        var b = r.data[i];
                        var bid = b.id;
                        var bname = b.name;

                        html += '<option value="'+bid+'">'+bname+'</option>';

                    }

                    html += '</select>';

                    bootbox.dialog({
                        title: 'Выберите рабочий банк (Эквайер)',
                        message: html,
                        buttons: {
                            success: {
                                label: 'Подтвердить',
                                callback: function () {

                                    var processing_bank_id = selinstance.value.id;

                                    var o = {
                                        command: 'change_processing_bank',
                                        object: formInstance.class,
                                        client_object: formInstance.client_object,
                                        params: {
                                            id: data.id,
                                            processing_bank_id: processing_bank_id
                                        }
                                    };

                                    socketQuery(o, function (res) {
                                        formInstance.reload();
                                    });
                                }
                            },
                            error: {
                                label: 'Отмена',
                                callback: function () {

                                }
                            }
                        }
                    });

                    selinstance = $('#select-work-bank-holder').select3();

                });

            }
        },
        {
            title: 'Деньги отправлены',
            color: "green",
            icon: "fa-money",
            type: "SINGLE",
            hidden: false,
            condition: [{
                colNames: ['money_sent'],
                matching: ['not_equal'],
                colValues: [false]
            }],
            handler: function () {
                var data = formInstance.data.data[0];

                var html = '<div class="row"><div class="col-md-12"><div class="form-group"><label>Выберите файл (Скан платежки):</label><input id="upload_payment_account" class="form-control" type="text"/></div></div></div>';

                bootbox.dialog({
                    title: 'Загрузите скан платежки',
                    message: html,
                    buttons: {
                        success: {
                            label: 'Загрузить',
                            callback: function () {

                                var filename = $('#upload_payment_account').val();

                                var o = {
                                    command: 'makePayment',
                                    object: formInstance.class,
                                    client_object: formInstance.client_object,
                                    params: {
                                        id: data.id,
                                        filename: filename
                                    }
                                };

                                socketQuery(o, function (res) {
                                    formInstance.reload();
                                });
                            }
                        },
                        error: {
                            label: 'Отмена',
                            callback: function () {

                            }
                        }
                    }
                });

                $('#upload_payment_account').off('click').on('click', function(){
                    var loader = MB.Core.fileLoader;
                    loader.start({
                        params:{
                            not_public:true
                        },
                        success: function (uid) {
                            $('#upload_payment_account').val(uid.name);
                        }
                    });
                });


            }
        },
        {
            title: 'Отправить уведомление в банк',
            color: "green",
            icon: "fa-comment-o",
            type: "SINGLE",
            hidden: false,
            condition: [{
                colNames: ['bank_notified'],
                matching: ['not_equal'],
                colValues: [false]
            }],
            handler: function () {
                var data = formInstance.data.data[0];

                //var html = '<div class="row"><div class="col-md-12"><div class="form-group"><label>Выберите файл (Скан платежки):</label><input id="upload_payment_account" class="form-control" type="text"/></div></div></div>';

                bootbox.dialog({
                    title: 'Отправить календарь в банк',
                    message: ' ',
                    buttons: {
                        success: {
                            label: 'Отправить',
                            callback: function(){

                                var o = {
                                    command: 'notifyBank',
                                    object: formInstance.class,
                                    client_object: formInstance.client_object,
                                    params: {
                                        id: data.id
                                    }
                                };

                                socketQuery(o, function(res){
                                    formInstance.reload();
                                });
                            }
                        },
                        error: {
                            label: 'Отмена',
                            callback: function(){

                            }
                        }
                    }
                });
            }
        }
    ];

    formWrapper.find('.recalculate').off('click').on('click', function(){

        var data = formInstance.data.data[0];

        if(formInstance.changes.length > 0){
            toastr['info']('Сначала сохраните анкету.', 'Внимание!');
        }else{

            var o = {
                command:'recalcWorksheet',
                object: formInstance.class,
                client_object: formInstance.client_object,
                params:{
                    id:data.id
                }
            };

            bootbox.dialog({
                title: 'Выполнить перерасчет',
                message: 'Исходя из суммы фондирования или по классическим параметрам?',
                buttons: {
                    byfounding: {
                        label: 'По сумме фондирования',
                        callback: function(){
                            o.params.dont_recalc_founding_amount = true;
                            socketQuery(o, function (res) {
                                if (!+res.code) formInstance.reload();
                            });
                        }
                    },
                    byclassic: {
                        label: 'По классическим параметрам',
                        callback: function(){
                            socketQuery(o, function (res) {
                                if (!+res.code) formInstance.reload();
                            });
                        }
                    },
                    error: {
                        label: 'Отмена',
                        callback: function(){

                        }
                    }
                }
            });

        }

    });

    formWrapper.find('.great-create-new-financing').off('click').on('click', function(){

        var add_o = {
            command: 'add',
            object: 'merchant_financing',
            params: {
                merchant_id: formInstance.activeId
            }
        };

        formInstance.loader(true, 'Подождите, создаем финансирование.');


        socketQuery(add_o, function(r){

            if(!r.code){

                var id = r.id;

                formInstance.reload(function(){

                    var financing_tbl = formInstance.getChildTbl('merchant_financing');
                    financing_tbl.openFormById(id, function(){
                        formInstance.loader(false, 'Подождите, создаем финансирование.');
                    });

                });
            }else{
                formInstance.loader(false, 'Подождите, создаем финансирование.');
            }

        });


    });

}());