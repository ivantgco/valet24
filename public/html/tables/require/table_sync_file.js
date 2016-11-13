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
        }
    ];




}());

(function () {
    // Добавим кнопки

    var btn1Html = '<div class="nb btn btnDouble blue toRight " id="sync_with_system" style="opacity: 1;">' +
        '<i class="fa fa-upload"></i>' +
        '<div class="btnDoubleInner">Синхронизировать файлы</div>' +
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

}());