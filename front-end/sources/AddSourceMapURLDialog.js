// Copyright 2014 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

/**
 * @constructor
 * @extends {WebInspector.DialogDelegate}
 * @param {function(string)} callback
 */
WebInspector.AddSourceMapURLDialog = function(callback)
{
    WebInspector.DialogDelegate.call(this);

    this.element = createElementWithClass("div", "go-to-line-dialog");
    this.element.createChild("label").textContent = WebInspector.UIString("Source map URL: ");

    this._input = this.element.createChild("input");
    this._input.setAttribute("type", "text");

    this._goButton = this.element.createChild("button");
    this._goButton.textContent = WebInspector.UIString("Go");
    this._goButton.addEventListener("click", this._onGoClick.bind(this), false);

    this._callback = callback;
}

/**
 * @param {!Element} element
 * @param {function(string)} callback
 */
WebInspector.AddSourceMapURLDialog.show = function(element, callback)
{
    WebInspector.Dialog.show(element, new WebInspector.AddSourceMapURLDialog(callback));
}

WebInspector.AddSourceMapURLDialog.prototype = {
    focus: function()
    {
        WebInspector.setCurrentFocusElement(this._input);
        this._input.select();
    },

    _onGoClick: function()
    {
        this._apply();
        WebInspector.Dialog.hide();
    },

    _apply: function()
    {
        var value = this._input.value;
        this._callback(value);
    },

    onEnter: function()
    {
        this._apply();
    },

    __proto__: WebInspector.DialogDelegate.prototype
}
