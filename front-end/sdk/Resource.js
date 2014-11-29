/*
 * Copyright (C) 2007, 2008 Apple Inc.  All rights reserved.
 *
 * Redistribution and use in source and binary forms, with or without
 * modification, are permitted provided that the following conditions
 * are met:
 *
 * 1.  Redistributions of source code must retain the above copyright
 *     notice, this list of conditions and the following disclaimer.
 * 2.  Redistributions in binary form must reproduce the above copyright
 *     notice, this list of conditions and the following disclaimer in the
 *     documentation and/or other materials provided with the distribution.
 * 3.  Neither the name of Apple Computer, Inc. ("Apple") nor the names of
 *     its contributors may be used to endorse or promote products derived
 *     from this software without specific prior written permission.
 *
 * THIS SOFTWARE IS PROVIDED BY APPLE AND ITS CONTRIBUTORS "AS IS" AND ANY
 * EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED
 * WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
 * DISCLAIMED. IN NO EVENT SHALL APPLE OR ITS CONTRIBUTORS BE LIABLE FOR ANY
 * DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES
 * (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES;
 * LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND
 * ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT
 * (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF
 * THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
 */

/**
 * @constructor
 * @extends {WebInspector.SDKObject}
 * @implements {WebInspector.ContentProvider}
 * @param {!WebInspector.Target} target
 * @param {?WebInspector.NetworkRequest} request
 * @param {string} url
 * @param {string} documentURL
 * @param {!PageAgent.FrameId} frameId
 * @param {!NetworkAgent.LoaderId} loaderId
 * @param {!WebInspector.ResourceType} type
 * @param {string} mimeType
 * @param {boolean=} isHidden
 */
WebInspector.Resource = function(target, request, url, documentURL, frameId, loaderId, type, mimeType, isHidden)
{
    WebInspector.SDKObject.call(this, target);
    this._request = request;
    this.url = url;
    this._documentURL = documentURL;
    this._frameId = frameId;
    this._loaderId = loaderId;
    this._type = type || WebInspector.resourceTypes.Other;
    this._mimeType = mimeType;
    this._isHidden = isHidden;

    /** @type {?string} */ this._content;
    /** @type {boolean} */ this._contentEncoded;
    this._pendingContentCallbacks = [];
    if (this._request && !this._request.finished)
        this._request.addEventListener(WebInspector.NetworkRequest.Events.FinishedLoading, this._requestFinished, this);
}

WebInspector.Resource.Events = {
    MessageAdded: "message-added",
    MessagesCleared: "messages-cleared",
}

/**
 * @param {?string} content
 * @param {string} mimeType
 * @param {boolean} contentEncoded
 * @return {?string}
 */
WebInspector.Resource.contentAsDataURL = function(content, mimeType, contentEncoded)
{
    const maxDataUrlSize = 1024 * 1024;
    if (content === null || content.length > maxDataUrlSize)
        return null;

    return "data:" + mimeType + (contentEncoded ? ";base64," : ",") + content;
}

/**
 * @param {string} url
 * @param {string} mimeType
 * @param {!WebInspector.ContentProvider} contentProvider
 * @param {!Element} image
 */
WebInspector.Resource.populateImageSource = function(url, mimeType, contentProvider, image)
{
    /**
     * @param {?string} content
     */
    function onResourceContent(content)
    {
        var imageSrc = WebInspector.Resource.contentAsDataURL(content, mimeType, true);
        if (imageSrc === null)
            imageSrc = url;
        image.src = imageSrc;
    }

    contentProvider.requestContent(onResourceContent);
}

WebInspector.Resource.prototype = {
    /**
     * @return {?WebInspector.NetworkRequest}
     */
    get request()
    {
        return this._request;
    },

    /**
     * @return {string}
     */
    get url()
    {
        return this._url;
    },

    set url(x)
    {
        this._url = x;
        this._parsedURL = new WebInspector.ParsedURL(x);
    },

    get parsedURL()
    {
        return this._parsedURL;
    },

    /**
     * @return {string}
     */
    get documentURL()
    {
        return this._documentURL;
    },

    /**
     * @return {!PageAgent.FrameId}
     */
    get frameId()
    {
        return this._frameId;
    },

    /**
     * @return {!NetworkAgent.LoaderId}
     */
    get loaderId()
    {
        return this._loaderId;
    },

    /**
     * @return {string}
     */
    get displayName()
    {
        return this._parsedURL.displayName;
    },

    /**
     * @return {!WebInspector.ResourceType}
     */
    resourceType: function()
    {
        return this._request ? this._request.resourceType() : this._type;
    },

    /**
     * @return {string}
     */
    get mimeType()
    {
        return this._request ? this._request.mimeType : this._mimeType;
    },

    /**
     * @return {!Array.<!WebInspector.ConsoleMessage>}
     */
    get messages()
    {
        return this._messages || [];
    },

    /**
     * @param {!WebInspector.ConsoleMessage} msg
     */
    addMessage: function(msg)
    {
        if (!msg.isErrorOrWarning() || !msg.messageText)
            return;

        if (!this._messages)
            this._messages = [];
        this._messages.push(msg);
        this.dispatchEventToListeners(WebInspector.Resource.Events.MessageAdded, msg);
    },

    /**
     * @return {number}
     */
    get errors()
    {
        return this._errors || 0;
    },

    set errors(x)
    {
        this._errors = x;
    },

    /**
     * @return {number}
     */
    get warnings()
    {
        return this._warnings || 0;
    },

    set warnings(x)
    {
        this._warnings = x;
    },

    clearErrorsAndWarnings: function()
    {
        this._messages = [];
        this._warnings = 0;
        this._errors = 0;
        this.dispatchEventToListeners(WebInspector.Resource.Events.MessagesCleared);
    },

    /**
     * @return {?string}
     */
    get content()
    {
        return this._content;
    },

    /**
     * @return {boolean}
     */
    get contentEncoded()
    {
        return this._contentEncoded;
    },

    /**
     * @return {string}
     */
    contentURL: function()
    {
        return this._url;
    },

    /**
     * @return {!WebInspector.ResourceType}
     */
    contentType: function()
    {
        return this.resourceType();
    },

    /**
     * @param {function(?string)} callback
     */
    requestContent: function(callback)
    {
        if (typeof this._content !== "undefined") {
            callback(this._content);
            return;
        }

        this._pendingContentCallbacks.push(callback);
        if (!this._request || this._request.finished)
            this._innerRequestContent();
    },

    /**
     * @return {string}
     */
    canonicalMimeType: function()
    {
        return this.resourceType().canonicalMimeType() || this.mimeType;
    },

    /**
     * @param {string} query
     * @param {boolean} caseSensitive
     * @param {boolean} isRegex
     * @param {function(!Array.<!WebInspector.ContentProvider.SearchMatch>)} callback
     */
    searchInContent: function(query, caseSensitive, isRegex, callback)
    {
        /**
         * @param {?Protocol.Error} error
         * @param {!Array.<!PageAgent.SearchMatch>} searchMatches
         */
        function callbackWrapper(error, searchMatches)
        {
            callback(searchMatches || []);
        }

        if (this.resourceType() === WebInspector.resourceTypes.Document) {
            callback([]);
            return;
        }

        if (this.frameId)
            this.target().pageAgent().searchInResource(this.frameId, this.url, query, caseSensitive, isRegex, callbackWrapper);
        else
            callback([]);
    },

    /**
     * @param {!Element} image
     */
    populateImageSource: function(image)
    {
        WebInspector.Resource.populateImageSource(this._url, this._mimeType, this, image);
    },

    _requestFinished: function()
    {
        this._request.removeEventListener(WebInspector.NetworkRequest.Events.FinishedLoading, this._requestFinished, this);
        if (this._pendingContentCallbacks.length)
            this._innerRequestContent();
    },


    _innerRequestContent: function()
    {
        if (this._contentRequested)
            return;
        this._contentRequested = true;

        /**
         * @param {?Protocol.Error} error
         * @param {?string} content
         * @param {boolean} contentEncoded
         * @this {WebInspector.Resource}
         */
        function contentLoaded(error, content, contentEncoded)
        {
            if (error || content === null) {
                replyWithContent.call(this, null, false);
                return;
            }
            replyWithContent.call(this, content, contentEncoded);
        }

        /**
         * @param {?string} content
         * @param {boolean} contentEncoded
         * @this {WebInspector.Resource}
         */
        function replyWithContent(content, contentEncoded)
        {
            this._content = content;
            this._contentEncoded = contentEncoded;
            var callbacks = this._pendingContentCallbacks.slice();
            for (var i = 0; i < callbacks.length; ++i)
                callbacks[i](this._content);
            this._pendingContentCallbacks.length = 0;
            delete this._contentRequested;
        }

        /**
         * @param {?Protocol.Error} error
         * @param {string} content
         * @param {boolean} contentEncoded
         * @this {WebInspector.Resource}
         */
        function resourceContentLoaded(error, content, contentEncoded)
        {
            contentLoaded.call(this, error, content, contentEncoded);
        }

        if (this.request) {
            this.request.requestContent(requestContentLoaded.bind(this));
            return;
        }

        /**
         * @param {?string} content
         * @this {WebInspector.Resource}
         */
        function requestContentLoaded(content)
        {
            contentLoaded.call(this, null, content, this.request.contentEncoded);
        }

        this.target().pageAgent().getResourceContent(this.frameId, this.url, resourceContentLoaded.bind(this));
    },

    /**
     * @return {boolean}
     */
    isHidden: function()
    {
        return !!this._isHidden;
    },


    /**
     * @return {boolean}
     */
    hasTextContent: function()
    {
        if (this._type.isTextType())
            return true;
        if (this._type === WebInspector.resourceTypes.Other)
            return !!this._content && !this._contentEncoded;
        return false;
    },

    __proto__: WebInspector.SDKObject.prototype
}

