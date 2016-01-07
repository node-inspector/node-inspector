/*
 * Copyright (C) 2012 Google Inc. All rights reserved.
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
 * @extends {WebInspector.VBox}
 * @param {!WebInspector.FileSystemModel.File} file
 */
WebInspector.FileContentView = function(file)
{
    WebInspector.VBox.call(this);

    this._innerView = /** @type {?WebInspector.Widget} */ (null);
    this._file = file;
    this._content = null;
}

WebInspector.FileContentView.prototype = {
    wasShown: function()
    {
        if (!this._innerView) {
            if (this._file.isTextFile)
                this._innerView = new WebInspector.EmptyWidget("");
            else
                this._innerView = new WebInspector.EmptyWidget(WebInspector.UIString("Binary File"));
            this.refresh();
        }

        this._innerView.show(this.element);
    },

    /**
     * @param {number} errorCode
     * @param {!FileSystemAgent.Metadata} metadata
     */
    _metadataReceived: function(errorCode, metadata)
    {
        if (errorCode || !metadata)
            return;

        if (this._content) {
            if (!this._content.updateMetadata(metadata))
                return;
            var sourceFrame = /** @type {!WebInspector.SourceFrame} */ (this._innerView);
            this._content.requestContent(sourceFrame.setContent.bind(sourceFrame));
        } else {
            this._innerView.detach();
            this._content = new WebInspector.FileContentView.FileContentProvider(this._file, metadata);
            var sourceFrame = new WebInspector.SourceFrame(this._content);
            sourceFrame.setHighlighterType(this._file.resourceType.canonicalMimeType());
            this._innerView = sourceFrame;
            this._innerView.show(this.element);
        }
    },

    refresh: function()
    {
        if (!this._innerView)
            return;

        if (this._file.isTextFile)
            this._file.requestMetadata(this._metadataReceived.bind(this));
    },

    __proto__: WebInspector.VBox.prototype
}

/**
 * @constructor
 * @implements {WebInspector.ContentProvider}
 * @param {!WebInspector.FileSystemModel.File} file
 * @param {!FileSystemAgent.Metadata} metadata
 */
WebInspector.FileContentView.FileContentProvider = function(file, metadata)
{
    this._file = file;
    this._metadata = metadata;
}

WebInspector.FileContentView.FileContentProvider.prototype = {
    /**
     * @override
     * @return {string}
     */
    contentURL: function()
    {
        return this._file.url;
    },

    /**
     * @override
     * @return {!WebInspector.ResourceType}
     */
    contentType: function()
    {
        return this._file.resourceType;
    },

    /**
     * @override
     * @param {function(?string)} callback
     */
    requestContent: function(callback)
    {
        var size = /** @type {number} */ (this._metadata.size);
        this._file.requestFileContent(true, 0, size, this._charset || "", this._fileContentReceived.bind(this, callback));
    },

    /**
     * @param {function(?string)} callback
     * @param {number} errorCode
     * @param {string=} content
     * @param {boolean=} base64Encoded
     * @param {string=} charset
     */
    _fileContentReceived: function(callback, errorCode, content, base64Encoded, charset)
    {
        if (errorCode || !content) {
            callback(null);
            return;
        }

        this._charset = charset;
        callback(content);
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
        setTimeout(callback.bind(null, []), 0);
    },

    /**
     * @param {!FileSystemAgent.Metadata} metadata
     * @return {boolean}
     */
    updateMetadata: function(metadata)
    {
        if (this._metadata.modificationTime >= metadata.modificationTime)
            return false;
        this._metadata = metadata.modificationTime;
        return true;
    }
}
