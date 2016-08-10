(function () {

    var formID = MB.Forms.justLoadedId;
    var formInstance = MB.Forms.getForm('form_order', formID);
    var formWrapper = $('#mw-' + formInstance.id);

    var modalInstance = MB.Core.modalWindows.windows.getWindow(formID);
    modalInstance.stick = 'top';
    modalInstance.stickModal();

    formInstance.lowerButtons = [
        {
            title: 'Подтвердить заказ',
            color: "blue",
            icon: "fa-phone",
            type: "SINGLE",
            hidden: false,
            condition: [{
                colNames: ['order_status_sysname'],
                matching: ['not_equal'],
                colValues: ['CREATED']
            }],
            handler: function () {

                formInstance.loader(true, 'Секундочку, подтверждаем заказ');

                var data = formInstance.data.data[0];

                var o = {
                    command: 'confirmOrder',
                    object: formInstance.class,
                    client_object: formInstance.client_object,
                    params: {
                        id: data.id
                    }
                };

                socketQuery(o, function(res) {

                    if (!res.code) {
                        formInstance.reload();


                        var file_id = res.file_id;

                        var o = {
                            command:'download',
                            object:'File',
                            params:{
                                id:file_id
                            }
                        };
                        socketQuery(o, function (res2) {

                            var fileName = res2.path + res2.filename;
                            var linkName = 'my_download_link' + MB.Core.guid();

                            $("body").prepend('<a id="'+linkName+'" href="' + res2.path + '?filename='+ res2.filename +'" download="'+ doc.document_name + res2.extension +'" style="display:none;"></a>');
                            var jqElem = $('#'+linkName);
                            jqElem[0].click();
                            jqElem.remove();
                            //$("#my_download_link").remove();
                        });

                    }

                    formInstance.loader(false, 'Секундочку, подтверждаем заказ');

                });
            }
        },
        {
            title: 'Курьер отправлен',
            color: "blue",
            icon: "fa-motorcycle",
            type: "SINGLE",
            hidden: false,
            condition: [{
                colNames: ['order_status_sysname'],
                matching: ['not_equal'],
                colValues: ['CONFIRM']
            }],
            handler: function () {

                formInstance.loader(true, 'Секундочку, меняем статус');

                var data = formInstance.data.data[0];

                var o = {
                    command: 'onDelivery',
                    object: formInstance.class,
                    client_object: formInstance.client_object,
                    params: {
                        id: data.id
                    }
                };

                socketQuery(o, function(res) {

                    if (!res.code) {
                        formInstance.reload();
                    }

                    formInstance.loader(false, 'Секундочку, меняем статус');

                });
            }
        },
        {
            title: 'Доставлен успешно',
            color: "green",
            icon: "fa-money",
            type: "SINGLE",
            hidden: false,
            condition: [{
                colNames: ['order_status_sysname'],
                matching: ['not_equal'],
                colValues: ['ON_DELIVERY']
            }],
            handler: function () {

                formInstance.loader(true, 'Отлично, закрываем заказ');

                var data = formInstance.data.data[0];

                var o = {
                    command: 'closeOrder',
                    object: formInstance.class,
                    client_object: formInstance.client_object,
                    params: {
                        id: data.id
                    }
                };

                socketQuery(o, function(res) {

                    if (!res.code) {
                        formInstance.reload();
                    }

                    formInstance.loader(false, 'Отлично, закрываем заказ');

                });
            }
        },
        {
            title: 'Отменить заказ',
            color: "red",
            icon: "fa-times",
            type: "SINGLE",
            hidden: false,
            condition: [{
                colNames: ['order_status_sysname'],
                matching: ['equal'],
                colValues: ['CLOSED']
            }],
            handler: function () {

                formInstance.loader(true, 'Подожлите, отменяем заказ');

                var data = formInstance.data.data[0];

                var o = {
                    command: 'cancelOrder',
                    object: formInstance.class,
                    client_object: formInstance.client_object,
                    params: {
                        id: data.id
                    }
                };

                socketQuery(o, function(res) {

                    if (!res.code) {
                        formInstance.reload();
                    }

                    formInstance.loader(false, 'Подожлите, отменяем заказ');

                });
            }
        }
    ]

}());


//var data = formInstance.data.data[0];
//
//
//var req_html = '<ul class="classic-ul">' +
//    '<li>Сумма финансирования:   <b>' + data.founding_amount + '</b>   руб.</li>' +
//    '<li>Сумма возврата:   <b>' +     data.amount_to_return + '</b>   руб.</li>' +
//    '<li>Кол-во платежей:   <b>' +    data.payments_count + '</b></li>' +
//    '<li>Сумма платежа:   <b>' +      data.payment_amount + '</b>   руб.</li>' +
//    '<li>Ставка:   <b>' +  data.factoring_rate + '</b>  %</li>' +
//    '</ul></div>';
//
//bootbox.dialog({
//    title: 'Отправить предложение',
//    message: req_html,
//    buttons: {
//        success: {
//            label: 'Отправить предложение',
//            callback: function(){
//
//                var o = {
//                    command: 'sendOffer',
//                    object: formInstance.class,
//                    client_object: formInstance.client_object,
//                    params: {
//                        id: data.id
//                    }
//                };
//
//                socketQuery(o, function(res){
//                    formInstance.reload();
//                });
//
//            }
//        },
//        error: {
//            label: 'Отмена',
//            callback: function(){
//
//            }
//        }
//    }
//});
