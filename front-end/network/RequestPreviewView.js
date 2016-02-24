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

/**
 * @constructor
 * @extends {WebInspector.RequestContentView}
 * @param {!WebInspector.NetworkRequest} request
 * @param {!WebInspector.Widget} responseView
 */
WebInspector.RequestPreviewView = function(request, responseView)
{
    WebInspector.RequestContentView.call(this, request);
    this._responseView = responseView;
}

WebInspector.RequestPreviewView.prototype = {
    contentLoaded: function()
    {
        if (!this.request.content && !this.request.contentError()) {
            if (!this._emptyWidget) {
                this._emptyWidget = this._createEmptyWidget();
                this._emptyWidget.show(this.element);
                this.innerView = this._emptyWidget;
            }
        } else {
            if (this._emptyWidget) {
                this._emptyWidget.detach();
                delete this._emptyWidget;
            }

            if (!this._previewView)
                this._previewView = this._createPreviewView();
            this._previewView.show(this.element);
            this.innerView = this._previewView;
        }
    },

    _createEmptyWidget: function()
    {
        return this._createMessageView(WebInspector.UIString("This request has no preview available."));
    },

    /**
     * @param {string} message
     * @return {!WebInspector.EmptyWidget}
     */
    _createMessageView: function(message)
    {
        return new WebInspector.EmptyWidget(message);
    },

    /**
     * @return {string}
     */
    _requestContent: function()
    {
        var content = this.request.content;
        return this.request.contentEncoded ? window.atob(content || "") : (content || "");
    },

    /**
     * @return {?WebInspector.RequestJSONView}
     */
    _jsonView: function()
    {
        var content = this._requestContent();
        var parsedJSON = WebInspector.RequestJSONView.parseJSON(content);
        return parsedJSON ? new WebInspector.RequestJSONView(this.request, parsedJSON) : null;
    },

    /**
     * @return {?WebInspector.XMLView}
     */
    _xmlView: function()
    {
        var content = this._requestContent();
        var parsedXML = WebInspector.XMLView.parseXML(content, this.request.mimeType);
        return parsedXML ? new WebInspector.XMLView(parsedXML) : null;
    },

    /**
     * @return {?WebInspector.RequestHTMLView}
     */
    _htmlErrorPreview: function()
    {
        var whitelist = ["text/html", "text/plain", "application/xhtml+xml"];
        if (whitelist.indexOf(this.request.mimeType) === -1)
            return null;

        var dataURL = this.request.asDataURL();
        if (dataURL === null)
            return null;

        return new WebInspector.RequestHTMLView(this.request, dataURL);
    },

    _createPreviewView: function()
    {
        if (this.request.contentError())
            return this._createMessageView(WebInspector.UIString("Failed to load response data"));

        var mimeType = this.request.mimeType || "";
        if (mimeType.endsWith("json") || mimeType.endsWith("javascript")) {
            var jsonView = this._jsonView();
            if (jsonView)
                return jsonView;
        }

        if (this.request.hasErrorStatusCode()) {
            var htmlErrorPreview = this._htmlErrorPreview();
            if (htmlErrorPreview)
                return htmlErrorPreview;
        }

        var xmlView = this._xmlView();
        if (xmlView)
            return xmlView;

        if (this.request.resourceType() === WebInspector.resourceTypes.XHR) {
            var jsonView = this._jsonView();
            if (jsonView)
                return jsonView;
            var htmlErrorPreview = this._htmlErrorPreview();
            if (htmlErrorPreview)
                return htmlErrorPreview;
        }

        if (this._responseView.sourceView)
            return this._responseView.sourceView;

        if (this.request.resourceType() === WebInspector.resourceTypes.Other)
            return this._createEmptyWidget();

        return WebInspector.RequestView.nonSourceViewForRequest(this.request);
    },

    __proto__: WebInspector.RequestContentView.prototype
}
