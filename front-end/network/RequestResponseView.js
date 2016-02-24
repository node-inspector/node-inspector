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
 */
WebInspector.RequestResponseView = function(request)
{
    WebInspector.RequestContentView.call(this, request);
}

WebInspector.RequestResponseView._maxFormattedResourceSize = 100000;

WebInspector.RequestResponseView.prototype = {
    get sourceView()
    {
        if (this._sourceView || !WebInspector.RequestView.hasTextContent(this.request))
            return this._sourceView;

        var contentProvider = new WebInspector.RequestResponseView.ContentProvider(this.request);
        if (this.request.resourceSize >= WebInspector.RequestResponseView._maxFormattedResourceSize) {
            this._sourceView = new WebInspector.ResourceSourceFrameFallback(contentProvider);
            return this._sourceView;
        }

        var sourceFrame = new WebInspector.ResourceSourceFrame(contentProvider);
        sourceFrame.setHighlighterType(this.request.resourceType().canonicalMimeType() || this.request.mimeType);
        this._sourceView = sourceFrame;
        return this._sourceView;
    },

    /**
     * @param {string} message
     * @return {!WebInspector.EmptyWidget}
     */
    _createMessageView: function(message)
    {
        return new WebInspector.EmptyWidget(message);
    },

    contentLoaded: function()
    {
        if ((!this.request.content || !this.sourceView) && !this.request.contentError()) {
            if (!this._emptyWidget) {
                this._emptyWidget = this._createMessageView(WebInspector.UIString("This request has no response data available."));
                this._emptyWidget.show(this.element);
                this.innerView = this._emptyWidget;
            }
        } else {
            if (this._emptyWidget) {
                this._emptyWidget.detach();
                delete this._emptyWidget;
            }

            if (this.request.content && this.sourceView) {
                this.sourceView.show(this.element);
                this.innerView = this.sourceView;
            } else {
                if (!this._errorView)
                    this._errorView = this._createMessageView(WebInspector.UIString("Failed to load response data"));
                this._errorView.show(this.element);
                this.innerView = this._errorView;
            }
        }
    },

    __proto__: WebInspector.RequestContentView.prototype
}

/**
 * @constructor
 * @implements {WebInspector.ContentProvider}
 * @param {!WebInspector.NetworkRequest} request
 */
WebInspector.RequestResponseView.ContentProvider = function(request) {
    this._request = request;
}

WebInspector.RequestResponseView.ContentProvider.prototype = {
    /**
     * @override
     * @return {string}
     */
    contentURL: function()
    {
        return this._request.contentURL();
    },

    /**
     * @override
     * @return {!WebInspector.ResourceType}
     */
    contentType: function()
    {
        return this._request.resourceType();
    },

    /**
     * @override
     * @param {function(?string)} callback
     */
    requestContent: function(callback)
    {
        /**
         * @param {?string} content
         * @this {WebInspector.RequestResponseView.ContentProvider}
         */
        function decodeContent(content)
        {
            callback(this._request.contentEncoded ? window.atob(content || "") : content);
        }

        this._request.requestContent(decodeContent.bind(this));
    },

    /**
     * @override
     * @param {string} query
     * @param {boolean} caseSensitive
     * @param {boolean} isRegex
     * @param {function(!Array.<!WebInspector.ContentProvider.SearchMatch>)} callback
     */
    searchInContent: function(query, caseSensitive, isRegex, callback)
    {
        this._request.searchInContent(query, caseSensitive, isRegex, callback);
    }
}
