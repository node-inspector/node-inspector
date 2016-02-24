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
 * @implements {WebInspector.ContentProvider}
 * @param {string} sourceURL
 * @param {!WebInspector.ResourceType} contentType
 */
WebInspector.CompilerSourceMappingContentProvider = function(sourceURL, contentType)
{
    this._sourceURL = sourceURL;
    this._contentType = contentType;
}

WebInspector.CompilerSourceMappingContentProvider.prototype = {
    /**
     * @override
     * @return {string}
     */
    contentURL: function()
    {
        return this._sourceURL;
    },

    /**
     * @override
     * @return {!WebInspector.ResourceType}
     */
    contentType: function()
    {
        return this._contentType;
    },

    /**
     * @override
     * @param {function(?string)} callback
     */
    requestContent: function(callback)
    {
        WebInspector.ResourceLoader.loadUsingTargetUA(this._sourceURL, {}, contentLoaded.bind(this));

        /**
         * @param {number} statusCode
         * @param {!Object.<string, string>} headers
         * @param {string} content
         * @this {WebInspector.CompilerSourceMappingContentProvider}
         */
        function contentLoaded(statusCode, headers, content)
        {
            if (statusCode >= 400) {
                console.error("Could not load content for " + this._sourceURL + " : " + "HTTP status code: " + statusCode);
                callback(null);
                return;
            }

            callback(content);
        }
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
        this.requestContent(contentLoaded);

        /**
         * @param {?string} content
         */
        function contentLoaded(content)
        {
            if (typeof content !== "string") {
                callback([]);
                return;
            }

            callback(WebInspector.ContentProvider.performSearchInContent(content, query, caseSensitive, isRegex));
        }
    }
}
