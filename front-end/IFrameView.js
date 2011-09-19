/*
 * Copyright (C) 2011 Google Inc. All rights reserved.
 *
 * Redistribution and use in source and binary forms, with or without
 * modification, are permitted provided that the following conditions are
 * met:
 *
 *     * Redistributions of source code must retain the above copyright
 * notice, this list of conditions and the following disclaimer.
 *     * Redistributions in binary form must reproduce the above
 * copyright notice, this list of conditions and the following disclaimer
 * in the documentation and/or other materials provided with the
 * distribution.
 *     * Neither the name of Google Inc. nor the names of its
 * contributors may be used to endorse or promote products derived from
 * this software without specific prior written permission.
 *
 * THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS
 * "AS IS" AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT
 * LIMITED TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR
 * A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT
 * OWNER OR CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL,
 * SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT
 * LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE,
 * DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY
 * THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT
 * (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE
 * OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
 */

WebInspector.IFrameView = function(parentElement, stylesheets)
{
    this._iframeElement = document.createElement("iframe");
    this._iframeElement.addStyleClass("view");
    this._initializeView = this._attachIFrameAndInitialize.bind(this, parentElement, stylesheets);
    WebInspector.View.call(this);
}

WebInspector.IFrameView.prototype = {
    _innerShow: function()
    {
        this._iframeElement.addStyleClass("visible");
        WebInspector.View.prototype._innerShow.call(this);
    },

    _innerHide: function()
    {
        this._iframeElement.removeStyleClass("visible");
    },

    attach: function(parent)
    {
        if (this._initializeView)
            this._initializeView();
        this._iframeElement.contentDocument.body.appendChild(this.element);
    },

    _attachIFrameAndInitialize: function(parent, stylesheets)
    {
        if (!this._initializeView)
            return;
        delete this._initializeView;
        parent.appendChild(this._iframeElement);
        this._setDocumentType();
        var iframeDocument = this._iframeElement.contentDocument;
        this._iframeElement.contentWindow.eval("(" + setupPrototypeUtilities.toString() + ")();");
        this.element = iframeDocument.body.createChild("div");
        this.addStylesheets(stylesheets);
        this._propagateBodyStyle();
        WebInspector.addMainEventListeners(iframeDocument);

        if (typeof this.initializeView === "function")
            this.initializeView();
    },

    addStylesheets: function(hrefs)
    {
        var cssText = "";
        for (var i = 0; i < hrefs.length; ++i) {
            var xhr = new XMLHttpRequest();
            xhr.open("GET", hrefs[i], false);
            xhr.send(null);
            cssText += xhr.responseText;
        }
        var style  = document.createElement("style");
        style.type = "text/css";
        style.textContent = cssText;
        this._iframeElement.contentDocument.head.appendChild(style);
    },

    _setDocumentType: function()
    {
        var doc = this._iframeElement.contentDocument.open();
        doc.write("<!DOCTYPE html>");
        doc.close();
    },

    _propagateBodyStyle: function()
    {
        var body = this._iframeElement.contentDocument.body;
        body.className = document.body.className;
        body.addStyleClass("visible");
    }
}

WebInspector.IFrameView.prototype.__proto__ = WebInspector.View.prototype;
