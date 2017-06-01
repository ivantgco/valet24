(function () {

    var tableInstance = MB.Tables.getTable(MB.Tables.justLoadedId);


    var btn = '<li class="ct-environment-btn"><div class="nb btn btnDouble blue" id="sync-sets"><i class="fa fa-refresh"></i><div class="btnDoubleInner">Синхронизировать с сайтом</div></div></li>';

    $('.ct-environment-wrapper[data-id="'+tableInstance.id+'"] .ct-environment-buttons ul').prepend(btn);

    $('#sync-sets').off('click').on('click', function () {

        var o = {
            command: 'pushIntoWordpress',
            object: 'product_set'
        };

        socketQuery(o, function (res) {

            console.log(res);

            tableInstance.reload();

        });

    });


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
