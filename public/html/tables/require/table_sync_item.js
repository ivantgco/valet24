(function () {

    //var tableNId = $('.page-content-wrapper .classicTableWrap').data('id');
    //var tableInstance = MB.Tables.getTable(tableNId);
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
            name: 'option2',
            title: 'Загрузить в систему',
            disabled: function(){
                return false;
            },
            callback: function(){

                //bootbox.dialog({
                //    title: 'Загрузить файл в систему',
                //    message: 'Файл будет считан и элементы загружены в соответствующую таблицу',
                //    buttons: {
                //        confirm: {
                //            label: 'Огонь',
                //            callback: function(){
                //                var row = tableInstance.ct_instance.selectedRowIndex;
                //                var id = tableInstance.data.data[row].id;
                //                var o = {
                //                    command: 'upload_file',
                //                    object: 'sync_file',
                //                    params: {id: id}
                //                };
                //
                //                socketQuery(o, function (res) {
                //                    toastr[res.toastr.type](res.toastr.message);
                //                    tableInstance.reload();
                //                });
                //            }
                //        },
                //        cancel: {
                //            label: 'Отмена',
                //            callback: function(){
                //
                //            }
                //        }
                //    }
                //});
            }
        }
    ];




}());

(function () {
    // Добавим кнопки

    //var btn1Html = '<div class="nb btn btnDouble blue toRight " id="sync_with_system" style="opacity: 1;">' +
    //    '<i class="fa fa-upload"></i>' +
    //    '<div class="btnDoubleInner">Применить категории</div>' +
    //    '</div>';
    var btn1Html = '<div class="nb btn btnDouble blue toRight " id="sync_with_system_product" style="opacity: 1;">' +
    '<i class="fa fa-upload"></i>' +
    '<div class="btnDoubleInner">Применить продукты</div>' +
    '</div>';

    $('.ct-environment-buttons ul').append(btn1Html);

    $('#sync_with_system').off('click').on('click', function(){


        bootbox.dialog({
            title: 'Применение категорий',
            message: 'Новые категории будут применены к основной таблице категорий.',
            buttons: {
                success: {
                    label: 'Огонь',
                    callback: function(){

                        var o = {
                            command: 'apply_category',
                            object: 'Sync_file_item',
                            params: {}
                        };
                        socketQuery(o, function(res){
                            console.log(res);
                        });
                    }
                },
                error: {
                    label: 'Отмена',
                    callback: function(){

                    }
                }
            }
        })

    });

    $('#sync_with_system_product').off('click').on('click', function(){


        bootbox.dialog({
            title: 'Применение продуктов',
            message: 'Новые продукты будут применены к основной таблице продуктов.',
            buttons: {
                success: {
                    label: 'Огонь',
                    callback: function(){

                        var o = {
                            command: 'apply_product_all',
                            object: 'Sync_file_item',
                            params: {}
                        };
                        socketQuery(o, function(res){
                            console.log(res);
                        });
                    }
                },
                error: {
                    label: 'Отмена',
                    callback: function(){

                    }
                }
            }
        })

    });

}());