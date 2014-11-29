/*
 * Copyright (C) 2013 Google Inc. All rights reserved.
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

window.requestFileSystem = window.requestFileSystem || window.webkitRequestFileSystem;

/**
 * @constructor
 */
WebInspector.TempFile = function()
{
    this._fileEntry = null;
    this._writer = null;
}

/**
 * @param {string} dirPath
 * @param {string} name
 * @return {!Promise.<!WebInspector.TempFile>}
 */
WebInspector.TempFile.create = function(dirPath, name)
{
    var file = new WebInspector.TempFile();

    function requestTempFileSystem()
    {
        return new Promise(window.requestFileSystem.bind(window, window.TEMPORARY, 10));
    }

    /**
     * @param {!FileSystem} fs
     */
    function getDirectoryEntry(fs)
    {
        return new Promise(fs.root.getDirectory.bind(fs.root, dirPath, { create: true }));
    }

    /**
     * @param {!DirectoryEntry} dir
     */
    function getFileEntry(dir)
    {
        return new Promise(dir.getFile.bind(dir, name, { create: true }));
    }

    /**
     * @param {!FileEntry} fileEntry
     */
    function createFileWriter(fileEntry)
    {
        file._fileEntry = fileEntry;
        return new Promise(fileEntry.createWriter.bind(fileEntry));
    }

    /**
     * @param {!FileWriter} writer
     */
    function truncateFile(writer)
    {
        if (!writer.length) {
            file._writer = writer;
            return Promise.resolve(file);
        }

        /**
         * @param {function(?)} fulfill
         * @param {function(*)} reject
         */
        function truncate(fulfill, reject)
        {
            writer.onwriteend = fulfill;
            writer.onerror = reject;
            writer.truncate(0);
        }

        function didTruncate()
        {
            file._writer = writer;
            writer.onwriteend = null;
            writer.onerror = null;
            return Promise.resolve(file);
        }

        function onTruncateError(e)
        {
            writer.onwriteend = null;
            writer.onerror = null;
            throw e;
        }

        return new Promise(truncate).then(didTruncate, onTruncateError);
    }

    return WebInspector.TempFile.ensureTempStorageCleared()
        .then(requestTempFileSystem)
        .then(getDirectoryEntry)
        .then(getFileEntry)
        .then(createFileWriter)
        .then(truncateFile);
}

WebInspector.TempFile.prototype = {
    /**
     * @param {!Array.<string>} strings
     * @param {function(boolean)} callback
     */
    write: function(strings, callback)
    {
        var blob = new Blob(strings, {type: 'text/plain'});
        this._writer.onerror = function(e)
        {
            WebInspector.console.error("Failed to write into a temp file: " + e.target.error.message);
            callback(false);
        }
        this._writer.onwriteend = function(e)
        {
            callback(true);
        }
        this._writer.write(blob);
    },

    finishWriting: function()
    {
        this._writer = null;
    },

    /**
     * @param {function(?string)} callback
     */
    read: function(callback)
    {
        this.readRange(undefined, undefined, callback);
    },

    /**
     * @param {number|undefined} startOffset
     * @param {number|undefined} endOffset
     * @param {function(?string)} callback
     */
    readRange: function(startOffset, endOffset, callback)
    {
        /**
         * @param {!Blob} file
         */
        function didGetFile(file)
        {
            var reader = new FileReader();

            if (typeof startOffset === "number" || typeof endOffset === "number")
                file = file.slice(/** @type {number} */ (startOffset), /** @type {number} */ (endOffset));
            /**
             * @this {FileReader}
             */
            reader.onloadend = function(e)
            {
                callback(/** @type {?string} */ (this.result));
            }
            reader.onerror = function(error)
            {
                WebInspector.console.error("Failed to read from temp file: " + error.message);
            }
            reader.readAsText(file);
        }
        function didFailToGetFile(error)
        {
            WebInspector.console.error("Failed to load temp file: " + error.message);
            callback(null);
        }
        this._fileEntry.file(didGetFile, didFailToGetFile);
    },

    /**
     * @param {!WebInspector.OutputStream} outputStream
     * @param {!WebInspector.OutputStreamDelegate} delegate
     */
    writeToOutputSteam: function(outputStream, delegate)
    {
        /**
         * @param {!File} file
         */
        function didGetFile(file)
        {
            var reader = new WebInspector.ChunkedFileReader(file, 10*1000*1000, delegate);
            reader.start(outputStream);
        }

        function didFailToGetFile(error)
        {
            WebInspector.console.error("Failed to load temp file: " + error.message);
            outputStream.close();
        }

        this._fileEntry.file(didGetFile, didFailToGetFile);
    },

    remove: function()
    {
        if (this._fileEntry)
            this._fileEntry.remove(function() {});
    }
}

/**
 * @constructor
 * @param {string} dirPath
 * @param {string} name
 */
WebInspector.DeferredTempFile = function(dirPath, name)
{
    /** @type {?Array.<string>} */
    this._chunks = [];
    this._tempFile = null;
    this._isWriting = false;
    this._finishCallback = null;
    this._finishedWriting = false;
    this._callsPendingOpen = [];
    this._pendingReads = [];
    WebInspector.TempFile.create(dirPath, name)
        .then(this._didCreateTempFile.bind(this), this._failedToCreateTempFile.bind(this));
}

WebInspector.DeferredTempFile.prototype = {
    /**
     * @param {!Array.<string>} strings
     */
    write: function(strings)
    {
        if (!this._chunks)
            return;
        if (this._finishCallback)
            throw new Error("No writes are allowed after close.");
        this._chunks.push.apply(this._chunks, strings);
        if (this._tempFile && !this._isWriting)
            this._writeNextChunk();
    },

    /**
     * @param {function(?WebInspector.TempFile)} callback
     */
    finishWriting: function(callback)
    {
        this._finishCallback = callback;
        if (this._finishedWriting)
            callback(this._tempFile);
        else if (!this._isWriting && !this._chunks.length)
            this._notifyFinished();
    },

    /**
     * @param {*} e
     */
    _failedToCreateTempFile: function(e)
    {
        WebInspector.console.error("Failed to create temp file " + e.code + " : " + e.message);
        this._chunks = null;
        this._notifyFinished();
    },

    /**
     * @param {!WebInspector.TempFile} tempFile
     */
    _didCreateTempFile: function(tempFile)
    {
        this._tempFile = tempFile;
        var callsPendingOpen = this._callsPendingOpen;
        this._callsPendingOpen = null;
        for (var i = 0; i < callsPendingOpen.length; ++i)
            callsPendingOpen[i]();
        if (this._chunks.length)
            this._writeNextChunk();
    },

    _writeNextChunk: function()
    {
        var chunks = this._chunks;
        this._chunks = [];
        this._isWriting = true;
        this._tempFile.write(/** @type {!Array.<string>} */(chunks), this._didWriteChunk.bind(this));
    },

    _didWriteChunk: function(success)
    {
        this._isWriting = false;
        if (!success) {
            this._tempFile = null;
            this._chunks = null;
            this._notifyFinished();
            return;
        }
        if (this._chunks.length)
            this._writeNextChunk();
        else if (this._finishCallback)
            this._notifyFinished();
    },

    _notifyFinished: function()
    {
        this._finishedWriting = true;
        if (this._tempFile)
            this._tempFile.finishWriting();
        if (this._finishCallback)
            this._finishCallback(this._tempFile);
        var pendingReads = this._pendingReads;
        for (var i = 0; i < this._pendingReads.length; ++i)
            this._pendingReads[i]();
        this._pendingReads = [];
    },

    /**
     * @param {number|undefined} startOffset
     * @param {number|undefined} endOffset
     * @param {function(string?)} callback
     */
    readRange: function(startOffset, endOffset, callback)
    {
        if (!this._finishedWriting) {
            this._pendingReads.push(this.readRange.bind(this, startOffset, endOffset, callback));
            return;
        }
        if (!this._tempFile) {
            callback(null);
            return;
        }
        this._tempFile.readRange(startOffset, endOffset, callback);
    },

    /**
     * @param {!WebInspector.OutputStream} outputStream
     * @param {!WebInspector.OutputStreamDelegate} delegate
     */
    writeToOutputStream: function(outputStream, delegate)
    {
        if (this._callsPendingOpen) {
            this._callsPendingOpen.push(this.writeToOutputStream.bind(this, outputStream, delegate));
            return;
        }
        if (this._tempFile)
            this._tempFile.writeToOutputSteam(outputStream, delegate);
    },

    remove: function()
    {
        if (this._callsPendingOpen) {
            this._callsPendingOpen.push(this.remove.bind(this));
            return;
        }
        if (this._tempFile)
            this._tempFile.remove();
    }
}

/**
 * @param {function(?)} fulfill
 * @param {function(*)} reject
 */
WebInspector.TempFile._clearTempStorage = function(fulfill, reject)
{
    /**
     * @param {!Event} event
     */
    function handleError(event)
    {
        WebInspector.console.error(WebInspector.UIString("Failed to clear temp storage: %s", event.data));
        reject(event.data);
    }

    /**
     * @param {!Event} event
     */
    function handleMessage(event)
    {
        if (event.data.type === "tempStorageCleared") {
            if (event.data.error)
                WebInspector.console.error(event.data.error);
            else
                fulfill(undefined);
            return;
        }
        reject(event.data);
    }

    try {
        var worker = new WorkerRuntime.Worker("temp_storage_shared_worker", "TempStorageCleaner");
        worker.onerror = handleError;
        worker.port.onmessage = handleMessage;
        worker.port.onerror = handleError;
    } catch (e) {
        if (e.name === "URLMismatchError")
            console.log("Shared worker wasn't started due to url difference. " + e);
        else
            throw e;
    }
}

/**
 * @return {!Promise.<undefined>}
 */
WebInspector.TempFile.ensureTempStorageCleared = function()
{
    if (!WebInspector.TempFile._storageCleanerPromise)
        WebInspector.TempFile._storageCleanerPromise = new Promise(WebInspector.TempFile._clearTempStorage);
    return WebInspector.TempFile._storageCleanerPromise;
}
