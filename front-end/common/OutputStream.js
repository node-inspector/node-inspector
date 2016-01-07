// Copyright 2015 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

/**
 * @interface
 */
WebInspector.OutputStream = function()
{
}

WebInspector.OutputStream.prototype = {
    /**
     * @param {string} data
     * @param {function(!WebInspector.OutputStream)=} callback
     */
    write: function(data, callback) { },

    close: function() { }
}

/**
 * @constructor
 * @implements {WebInspector.OutputStream}
 */
WebInspector.StringOutputStream = function()
{
    this._data = "";
}

WebInspector.StringOutputStream.prototype = {
    /**
     * @override
     * @param {string} chunk
     * @param {function(!WebInspector.OutputStream)=} callback
     */
    write: function(chunk, callback)
    {
        this._data += chunk;
    },

    /**
     * @override
     */
    close: function()
    {
    },

    /**
     * @return {string}
     */
    data: function()
    {
        return this._data;
    }
}