(function(){

    var formID = MB.Forms.justLoadedId;
    var formInstance = MB.Forms.getForm('form_review', formID);
    var formWrapper = $('#mw-' + formInstance.id);

    var modalInstance = MB.Core.modalWindows.windows.getWindow(formID);
    modalInstance.stick = 'top';
    modalInstance.stickModal();

}());

