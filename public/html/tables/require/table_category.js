(function () {

    var tableNId = $('.page-content-wrapper .classicTableWrap').data('id');
    var tableInstance = MB.Tables.getTable(tableNId);


    tableInstance.ct_instance.ctxMenuData = [
        {
            name: 'option1',
            title: 'Переместить в категорию',
            disabled: function () {
                return false;
            },
            callback: function () {
                var cat_id = tableInstance.data.data[tableInstance.ct_instance.selectedRowIndex]['id'];

                bootbox.dialog({
                    title: 'Перенос продуктов в другую категорию',
                    message: '<label>В какую категорию переность (id):</label><input class="form-control" value="" id="new_cat_id">',
                    buttons: {
                        success: {
                            label: 'Подтвердить',
                            callback: function(){

                                if($('#new_cat_id').val().length > 0){

                                    var o = {
                                        command: 'moveToCategory',
                                        object: 'Category',
                                        params: {
                                            id:cat_id,
                                            target_category_id: $('#new_cat_id')
                                        }
                                    };

                                    socketQuery(o, function (res) {
                                        toastr[res.toastr.type](res.toastr.message);
                                        tableInstance.reload();
                                    });

                                }else{

                                    toastr['info']('Некорректно заполнено поле.');

                                }



                            }
                        },
                        error: {
                            label: 'Отмена',
                            callback: function(){

                            }
                        }
                    }
                });



                //

            }
        }
    ];


}());