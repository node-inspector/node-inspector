// Copyright 2014 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

/**
 * @constructor
 * @implements {WebInspector.ContentProvider}
 * @param {!WebInspector.ResourceType} contentType
 * @param {string} content
 * @param {string=} contentURL
 */
WebInspector.StaticContentProvider = function(contentType, content, contentURL)
{
    this._content = content;
    this._contentType = contentType;
    this._contentURL = contentURL || "";
}

/**
 * @param {string} content
 * @param {string} query
 * @param {boolean} caseSensitive
 * @param {boolean} isRegex
 * @param {function(!Array.<!WebInspector.ContentProvider.SearchMatch>)} callback
 */
WebInspector.StaticContentProvider.searchInContent = function(content, query, caseSensitive, isRegex, callback)
{
    function performSearch()
    {
        callback(WebInspector.ContentProvider.performSearchInContent(content, query, caseSensitive, isRegex));
    }

    // searchInContent should call back later.
    setTimeout(performSearch.bind(null), 0);
}

WebInspector.StaticContentProvider.prototype = {
    /**
     * @return {string}
     */
    contentURL: function()
    {
        return this._contentURL;
    },

    /**
     * @return {!WebInspector.ResourceType}
     */
    contentType: function()
    {
        return this._contentType;
    },

    /**
     * @param {function(?string)} callback
     */
    requestContent: function(callback)
    {
        callback(this._content);
    },

    /**
     * @param {string} query
     * @param {boolean} caseSensitive
     * @param {boolean} isRegex
     * @param {function(!Array.<!WebInspector.ContentProvider.SearchMatch>)} callback
     */
    searchInContent: function(query, caseSensitive, isRegex, callback)
    {
        WebInspector.StaticContentProvider.searchInContent(this._content, query, caseSensitive, isRegex, callback);
    }
}
