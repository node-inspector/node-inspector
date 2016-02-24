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
 * @interface
 */
WebInspector.OutputStreamDelegate = function()
{
}

WebInspector.OutputStreamDelegate.prototype = {
    onTransferStarted: function() { },

    onTransferFinished: function() { },

    /**
     * @param {!WebInspector.ChunkedReader} reader
     */
    onChunkTransferred: function(reader) { },

    /**
     * @param {!WebInspector.ChunkedReader} reader
     * @param {!Event} event
     */
    onError: function(reader, event) { },
}

/**
 * @interface
 */
WebInspector.ChunkedReader = function()
{
}

WebInspector.ChunkedReader.prototype = {
    /**
     * @return {number}
     */
    fileSize: function() { },

    /**
     * @return {number}
     */
    loadedSize: function() { },

    /**
     * @return {string}
     */
    fileName: function() { },

    cancel: function() { }
}

/**
 * @constructor
 * @implements {WebInspector.ChunkedReader}
 * @param {!File} file
 * @param {number} chunkSize
 * @param {!WebInspector.OutputStreamDelegate} delegate
 */
WebInspector.ChunkedFileReader = function(file, chunkSize, delegate)
{
    this._file = file;
    this._fileSize = file.size;
    this._loadedSize = 0;
    this._chunkSize = chunkSize;
    this._delegate = delegate;
    this._decoder = new TextDecoder();
    this._isCanceled = false;
}

WebInspector.ChunkedFileReader.prototype = {
    /**
     * @param {!WebInspector.OutputStream} output
     */
    start: function(output)
    {
        this._output = output;

        this._reader = new FileReader();
        this._reader.onload = this._onChunkLoaded.bind(this);
        this._reader.onerror = this._delegate.onError.bind(this._delegate, this);
        this._delegate.onTransferStarted();
        this._loadChunk();
    },

    /**
     * @override
     */
    cancel: function()
    {
        this._isCanceled = true;
    },

    /**
     * @override
     * @return {number}
     */
    loadedSize: function()
    {
        return this._loadedSize;
    },

    /**
     * @override
     * @return {number}
     */
    fileSize: function()
    {
        return this._fileSize;
    },

    /**
     * @override
     * @return {string}
     */
    fileName: function()
    {
        return this._file.name;
    },

    /**
     * @param {!Event} event
     */
    _onChunkLoaded: function(event)
    {
        if (this._isCanceled)
            return;

        if (event.target.readyState !== FileReader.DONE)
            return;

        var buffer = event.target.result;
        this._loadedSize += buffer.byteLength;
        var endOfFile = this._loadedSize === this._fileSize;
        var decodedString = this._decoder.decode(buffer, {stream: !endOfFile});
        this._output.write(decodedString);
        if (this._isCanceled)
            return;
        this._delegate.onChunkTransferred(this);

        if (endOfFile) {
            this._file = null;
            this._reader = null;
            this._output.close();
            this._delegate.onTransferFinished();
            return;
        }

        this._loadChunk();
    },

    _loadChunk: function()
    {
        var chunkStart = this._loadedSize;
        var chunkEnd = Math.min(this._fileSize, chunkStart + this._chunkSize);
        var nextPart = this._file.slice(chunkStart, chunkEnd);
        this._reader.readAsArrayBuffer(nextPart);
    }
}

/**
 * @param {function(!File)} callback
 * @return {!Node}
 */
WebInspector.createFileSelectorElement = function(callback)
{
    var fileSelectorElement = createElement("input");
    fileSelectorElement.type = "file";
    fileSelectorElement.style.display = "none";
    fileSelectorElement.setAttribute("tabindex", -1);
    fileSelectorElement.onchange = onChange;
    function onChange(event)
    {
        callback(fileSelectorElement.files[0]);
    };
    return fileSelectorElement;
}

/**
 * @constructor
 * @implements {WebInspector.OutputStream}
 */
WebInspector.FileOutputStream = function()
{
}

WebInspector.FileOutputStream.prototype = {
    /**
     * @param {string} fileName
     * @param {function(boolean)} callback
     */
    open: function(fileName, callback)
    {
        this._closed = false;
        this._writeCallbacks = [];
        this._fileName = fileName;

        /**
         * @param {boolean} accepted
         * @this {WebInspector.FileOutputStream}
         */
        function callbackWrapper(accepted)
        {
            if (accepted)
                WebInspector.fileManager.addEventListener(WebInspector.FileManager.EventTypes.AppendedToURL, this._onAppendDone, this);
            callback(accepted);
        }
        WebInspector.fileManager.save(this._fileName, "", true, callbackWrapper.bind(this));
    },

    /**
     * @override
     * @param {string} data
     * @param {function(!WebInspector.OutputStream)=} callback
     */
    write: function(data, callback)
    {
        this._writeCallbacks.push(callback);
        WebInspector.fileManager.append(this._fileName, data);
    },

    /**
     * @override
     */
    close: function()
    {
        this._closed = true;
        if (this._writeCallbacks.length)
            return;
        WebInspector.fileManager.removeEventListener(WebInspector.FileManager.EventTypes.AppendedToURL, this._onAppendDone, this);
        WebInspector.fileManager.close(this._fileName);
    },

    /**
     * @param {!WebInspector.Event} event
     */
    _onAppendDone: function(event)
    {
        if (event.data !== this._fileName)
            return;
        var callback = this._writeCallbacks.shift();
        if (callback)
            callback(this);
        if (!this._writeCallbacks.length) {
            if (this._closed) {
                WebInspector.fileManager.removeEventListener(WebInspector.FileManager.EventTypes.AppendedToURL, this._onAppendDone, this);
                WebInspector.fileManager.close(this._fileName);
            }
        }
    }
}
