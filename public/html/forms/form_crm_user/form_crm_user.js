(function(){

    var formID = MB.Forms.justLoadedId;
    var formInstance = MB.Forms.getForm('form_crm_user', formID);
    var formWrapper = $('#mw-' + formInstance.id);

    var modalInstance = MB.Core.modalWindows.windows.getWindow(formID);
    modalInstance.stick = 'top';
    modalInstance.stickModal();

    var tbl = formInstance.tblInstances[0];

    var total_orders = 0;
    var total_amount = 0;

    for(var i in tbl.data.data){
        var o = tbl.data.data[i];

        total_orders++;
        total_amount += +o.total_to_pay;

    }

    formWrapper.find('.user-orders-count').html(total_orders);
    formWrapper.find('.user-orders-amount').html(total_amount + ' руб.');


}());


