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
 * @extends {WebInspector.Object}
 */
WebInspector.IsolatedFileSystemManager = function()
{
    /** @type {!Object.<string, !WebInspector.IsolatedFileSystem>} */
    this._fileSystems = {};
    /** @type {!Object.<string, !Array.<function(?DOMFileSystem)>>} */
    this._pendingFileSystemRequests = {};
    this._fileSystemMapping = new WebInspector.FileSystemMapping();
    this._excludedFolderManager = new WebInspector.ExcludedFolderManager();
    this._requestFileSystems();

    InspectorFrontendHost.events.addEventListener(InspectorFrontendHostAPI.Events.FileSystemsLoaded, this._onFileSystemsLoaded, this);
    InspectorFrontendHost.events.addEventListener(InspectorFrontendHostAPI.Events.FileSystemRemoved, this._onFileSystemRemoved, this);
    InspectorFrontendHost.events.addEventListener(InspectorFrontendHostAPI.Events.FileSystemAdded, this._onFileSystemAdded, this);
}

/** @typedef {!{fileSystemName: string, rootURL: string, fileSystemPath: string}} */
WebInspector.IsolatedFileSystemManager.FileSystem;

WebInspector.IsolatedFileSystemManager.Events = {
    FileSystemAdded: "FileSystemAdded",
    FileSystemRemoved: "FileSystemRemoved"
}

WebInspector.IsolatedFileSystemManager.prototype = {
    /**
     * @return {!WebInspector.FileSystemMapping}
     */
    mapping: function()
    {
        return this._fileSystemMapping;
    },

    /**
     * @return {!WebInspector.ExcludedFolderManager}
     */
    excludedFolderManager: function()
    {
        return this._excludedFolderManager;
    },

    _requestFileSystems: function()
    {
        console.assert(!this._loaded);
        InspectorFrontendHost.requestFileSystems();
    },

    addFileSystem: function()
    {
        InspectorFrontendHost.addFileSystem();
    },

    /**
     * @param {string} fileSystemPath
     */
    removeFileSystem: function(fileSystemPath)
    {
        InspectorFrontendHost.removeFileSystem(fileSystemPath);
    },

    /**
     * @param {!WebInspector.Event} event
     */
    _onFileSystemsLoaded: function(event)
    {
        var fileSystems = /** @type {!Array.<!WebInspector.IsolatedFileSystemManager.FileSystem>} */ (event.data);
        var addedFileSystemPaths = {};
        for (var i = 0; i < fileSystems.length; ++i) {
            this._innerAddFileSystem(fileSystems[i]);
            addedFileSystemPaths[fileSystems[i].fileSystemPath] = true;
        }
        var fileSystemPaths = this._fileSystemMapping.fileSystemPaths();
        for (var i = 0; i < fileSystemPaths.length; ++i) {
            var fileSystemPath = fileSystemPaths[i];
            if (!addedFileSystemPaths[fileSystemPath])
                this._fileSystemRemoved(fileSystemPath);
        }

        this._loaded = true;
        this._processPendingFileSystemRequests();
    },

    /**
     * @param {!WebInspector.IsolatedFileSystemManager.FileSystem} fileSystem
     */
    _innerAddFileSystem: function(fileSystem)
    {
        var fileSystemPath = fileSystem.fileSystemPath;
        this._fileSystemMapping.addFileSystem(fileSystemPath);
        var isolatedFileSystem = new WebInspector.IsolatedFileSystem(this, fileSystemPath, fileSystem.fileSystemName, fileSystem.rootURL);
        this._fileSystems[fileSystemPath] = isolatedFileSystem;
        this.dispatchEventToListeners(WebInspector.IsolatedFileSystemManager.Events.FileSystemAdded, isolatedFileSystem);
    },

    _processPendingFileSystemRequests: function()
    {
        for (var fileSystemPath in this._pendingFileSystemRequests) {
            var callbacks = this._pendingFileSystemRequests[fileSystemPath];
            for (var i = 0; i < callbacks.length; ++i)
                callbacks[i](this._isolatedFileSystem(fileSystemPath));
        }
        delete this._pendingFileSystemRequests;
    },

    /**
     * @param {!WebInspector.Event} event
     */
    _onFileSystemAdded: function(event)
    {
        var errorMessage = /** @type {string} */ (event.data["errorMessage"]);
        var fileSystem = /** @type {?WebInspector.IsolatedFileSystemManager.FileSystem} */ (event.data["fileSystem"]);
        if (errorMessage)
            WebInspector.console.error(errorMessage, true);
        else if (fileSystem)
            this._innerAddFileSystem(fileSystem);
    },

    /**
     * @param {!WebInspector.Event} event
     */
    _onFileSystemRemoved: function(event)
    {
        this._fileSystemRemoved(/** @type {string} */ (event.data));
    },

    /**
     * @param {string} fileSystemPath
     */
    _fileSystemRemoved: function(fileSystemPath)
    {
        this._fileSystemMapping.removeFileSystem(fileSystemPath);
        this._excludedFolderManager.removeFileSystem(fileSystemPath);
        var isolatedFileSystem = this._fileSystems[fileSystemPath];
        delete this._fileSystems[fileSystemPath];
        if (isolatedFileSystem)
            this.dispatchEventToListeners(WebInspector.IsolatedFileSystemManager.Events.FileSystemRemoved, isolatedFileSystem);
    },

    /**
     * @param {string} fileSystemPath
     * @return {?DOMFileSystem}
     */
    _isolatedFileSystem: function(fileSystemPath)
    {
        var fileSystem = this._fileSystems[fileSystemPath];
        if (!fileSystem)
            return null;
        if (!InspectorFrontendHost.isolatedFileSystem)
            return null;
        return InspectorFrontendHost.isolatedFileSystem(fileSystem.name(), fileSystem.rootURL());
    },

    /**
     * @param {string} fileSystemPath
     * @param {function(?DOMFileSystem)} callback
     */
    requestDOMFileSystem: function(fileSystemPath, callback)
    {
        if (!this._loaded) {
            if (!this._pendingFileSystemRequests[fileSystemPath])
                this._pendingFileSystemRequests[fileSystemPath] = this._pendingFileSystemRequests[fileSystemPath] || [];
            this._pendingFileSystemRequests[fileSystemPath].push(callback);
            return;
        }
        callback(this._isolatedFileSystem(fileSystemPath));
    },

    __proto__: WebInspector.Object.prototype
}

/**
 * @type {!WebInspector.IsolatedFileSystemManager}
 */
WebInspector.isolatedFileSystemManager;
