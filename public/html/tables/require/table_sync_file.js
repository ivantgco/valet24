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

                bootbox.dialog({
                    title: 'Загрузить файл в систему',
                    message: 'Файл будет считан и элементы загружены в соответствующую таблицу',
                    buttons: {
                        confirm: {
                            label: 'Огонь',
                            callback: function(){
                                var row = tableInstance.ct_instance.selectedRowIndex;
                                var id = tableInstance.data.data[row].id;
                                var o = {
                                    command: 'upload_file',
                                    object: 'sync_file',
                                    params: {id: id}
                                };

                                socketQuery(o, function (res) {
                                    toastr[res.toastr.type](res.toastr.message);
                                    tableInstance.reload();
                                });
                            }
                        },
                        cancel: {
                            label: 'Отмена',
                            callback: function(){

                            }
                        }
                    }
                });
            }
        }
    ];




}());

(function () {
    // Добавим кнопки

    var btn1Html = '<div class="nb btn btnDouble blue toRight " id="sync_with_system" style="opacity: 1;">' +
        '<i class="fa fa-upload"></i>' +
        '<div class="btnDoubleInner">Синхронизировать файлы</div>' +
        '</div>';

    btn1Html += '<div class="nb btn btnDouble blue toRight " id="upload_all_files" style="opacity: 1;">' +
        '<i class="fa fa-upload"></i>' +
        '<div class="btnDoubleInner">Загрузить все</div>' +
        '</div>';

    $('.ct-environment-buttons ul').append(btn1Html);

    $('#sync_with_system').off('click').on('click', function(){


        bootbox.dialog({
            title: 'Синхронизация файлов и записей в системе',
            message: 'Данная операция загрузит в систему информацию о новых файлах синхронизации.',
            buttons: {
                success: {
                    label: 'Огонь',
                    callback: function(){

                        var o = {
                            command: 'sync_with_system',
                            object: 'Sync_file',
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
    $('#upload_all_files').off('click').on('click', function(){


        bootbox.dialog({
            title: 'Загрузка записей из всех файлов',
            message: 'Данная операция загрузит в систему все записи продуктов из всех новых файлов. Это может быть долго. Начать?',
            buttons: {
                success: {
                    label: 'Да, я подожду',
                    callback: function(){

                        var o = {
                            command: 'upload_all_files',
                            object: 'Sync_file',
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