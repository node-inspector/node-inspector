// Copyright 2015 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

/**
 * @constructor
 * @extends {WebInspector.DialogDelegate}
 */
WebInspector.DevicesDialog = function()
{
    WebInspector.DialogDelegate.call(this);
    this.element.classList.add("devices-dialog");
    this._view = new WebInspector.DevicesView();
    this._view.markAsRoot();

    this._closeButton = createElementWithClass("div", "dialog-close-button", "dt-close-button");
    this._closeButton.gray = true;
    this._closeButton.addEventListener("click", WebInspector.Dialog.hide.bind(WebInspector.Dialog), false);
    this.element.appendChild(this._closeButton);
}

/** @type {?WebInspector.DevicesDialog} */
WebInspector.DevicesDialog._instance = null;

WebInspector.DevicesDialog.show = function()
{
    if (!WebInspector.DevicesDialog._instance)
        WebInspector.DevicesDialog._instance = new WebInspector.DevicesDialog();
    WebInspector.Dialog.show(WebInspector.DevicesDialog._instance);
}

WebInspector.DevicesDialog.prototype = {
    /**
     * @param {!Element} element
     * @override
     */
    show: function(element)
    {
        WebInspector.DialogDelegate.prototype.show.call(this, element);
        this._view.show(this.element, this._closeButton);
    },

    /**
     * @override
     */
    willHide: function()
    {
        WebInspector.DialogDelegate.prototype.willHide.call(this);
        this._view.detach();
    },

    __proto__: WebInspector.DialogDelegate.prototype
}

/**
 * @constructor
 * @implements {WebInspector.ActionDelegate}
 */
WebInspector.DevicesDialog.ActionDelegate = function()
{
}

WebInspector.DevicesDialog.ActionDelegate.prototype = {
    /**
     * @override
     * @param {!WebInspector.Context} context
     * @param {string} actionId
     */
    handleAction: function(context, actionId)
    {
        if (actionId === "devices.dialog.show")
            WebInspector.DevicesDialog.show();
    }
}
