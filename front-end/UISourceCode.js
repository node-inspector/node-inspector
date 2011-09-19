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
 */
WebInspector.UISourceCode = function(id, url, isContentScript, rawSourceCode, contentProvider)
{
    this._id = id;
    this._url = url;
    this._isContentScript = isContentScript;
    this._rawSourceCode = rawSourceCode;
    this._contentProvider = contentProvider;
    this._requestContentCallbacks = [];
}

WebInspector.UISourceCode.prototype = {
    get id()
    {
        return this._id;
    },

    get url()
    {
        return this._url;
    },

    get isContentScript()
    {
        return this._isContentScript;
    },

    get rawSourceCode()
    {
        return this._rawSourceCode;
    },

    requestContent: function(callback)
    {
        if (this._contentLoaded) {
            callback(this._mimeType, this._content);
            return;
        }

        this._requestContentCallbacks.push(callback);
        if (this._requestContentCallbacks.length === 1)
            this._contentProvider.requestContent(this._didRequestContent.bind(this));
    },

    _didRequestContent: function(mimeType, content)
    {
        this._contentLoaded = true;
        this._mimeType = mimeType;
        this._content = content;

        for (var i = 0; i < this._requestContentCallbacks.length; ++i)
            this._requestContentCallbacks[i](mimeType, content);
    }
}

/**
 * @interface
 */
WebInspector.ContentProvider = function() { }
WebInspector.ContentProvider.prototype = {
    requestContent: function(callback) { }
}
