(function () {

    var tableInstance = MB.Tables.getTable(MB.Tables.justLoadedId);


    tableInstance.ct_instance.ctxMenuData = [
        {
            name: 'option1',
            title: 'Открыть в форме',
            disabled: function(){
                return false;
            },
            callback: function(){
                tableInstance.openRowInModal();
            }
        },
        {
            name: 'option3',
            title: 'Открыть активное финансирование',
            disabled: function(){
                var row = tableInstance.ct_instance.selectedRowIndex;
                return tableInstance.data.data[row].current_financing_id == '';
            },
            callback: function(){

                var row = tableInstance.ct_instance.selectedRowIndex;

                var financingFormId = MB.Core.guid();
                var financing_id = tableInstance.data.data[row].current_financing_id;

                if(financing_id != ''){

                    var o = {
                        command: 'get',
                        object: 'merchant_financing',
                        params:{
                            param_where: {
                                id: financing_id
                            }
                        }
                    };

                    socketQuery(o, function(res){

                        if(!res.code){
                            var financing_data = res.data[0];

                            var work_statuses = ['ACQUIRING_IN_PROCCESS', 'READY_TO_WORK', 'CLOSED', 'WAIT_BANK_CONFIRM', 'BANK_CONFIRM'];

                            var form_name = (work_statuses.indexOf(financing_data.status_sysname) == -1 )? 'form_merchant_financing' : 'form_merchant_financing_work';


                            if(financing_data.closing_financing_id != ''){
                                form_name = 'form_merchant_refinancing';
                            }


                            var openInModalO = {
                                id: financingFormId,
                                name: form_name,
                                class: 'merchant_financing',
                                client_object: form_name,
                                type: 'form',
                                ids: [financing_id],
                                position: 'center',
                                tablePKeys: {data_columns: ['id'], data: [financing_id]}
                            };

                            var form = new MB.FormN(openInModalO);
                            form.create(function () {
                                var modal = MB.Core.modalWindows.windows.getWindow(financingFormId);
                            });

                        }else{

                        }
                    });

                }else{
                    toastr['info']('Внимание', 'У торговца нет актиыных финансирований');
                }

            }
        },
        {
            name: 'option4',
            title: 'Открыть активный календарь',
            disabled: function(){
                var row = tableInstance.ct_instance.selectedRowIndex;
                return tableInstance.data.data[row].current_calendar_id == '';
            },
            callback: function(){

                var row = tableInstance.ct_instance.selectedRowIndex;

                var calendarFormId = MB.Core.guid();
                var calendar_id = tableInstance.data.data[row].current_calendar_id;


                var openInModalO = {
                    id: calendarFormId,
                    name: 'form_merchant_financing_calendar',
                    class: 'merchant_financing_calendar',
                    client_object: 'form_merchant_financing_calendar',
                    type: 'form',
                    ids: [calendar_id],
                    position: 'center',
                    tablePKeys: {data_columns: ['id'], data: [calendar_id]}
                };

                var form = new MB.FormN(openInModalO);
                form.create(function () {
                    var modal = MB.Core.modalWindows.windows.getWindow(calendarFormId);
                });



                //var o = {
                //    command: 'get',
                //    object: 'merchant_calendar',
                //    params:{
                //        param_where: {
                //            id: financing_id
                //        }
                //    }
                //};
                //
                //socketQuery(o, function(res){
                //
                //    if(!res.code){
                //        var financing_data = res.data[0];
                //
                //        var work_statuses = ['ACQUIRING_IN_PROCCESS', 'READY_TO_WORK'];
                //        var form_name = (work_statuses.indexOf(financing_data.status_sysname) == -1 )? 'form_merchant_financing' : 'form_merchant_financing_work';
                //
                //
                //        var openInModalO = {
                //            id: financingFormId,
                //            name: form_name,
                //            class: 'merchant_financing',
                //            client_object: form_name,
                //            type: 'form',
                //            ids: [financing_id],
                //            position: 'center',
                //            tablePKeys: {data_columns: ['id'], data: [financing_id]}
                //        };
                //
                //        var form = new MB.FormN(openInModalO);
                //        form.create(function () {
                //            var modal = MB.Core.modalWindows.windows.getWindow(financingFormId);
                //        });
                //
                //    }else{
                //
                //    }
                //});

            }
        }
    ];

}());
