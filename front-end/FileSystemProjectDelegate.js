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

/**
 * @constructor
 * @implements {WebInspector.ProjectDelegate}
 * @extends {WebInspector.Object}
 * @param {WebInspector.IsolatedFileSystem} isolatedFileSystem
 * @param {WebInspector.Workspace} workspace
 */
WebInspector.FileSystemProjectDelegate = function(isolatedFileSystem, workspace)
{
    this._fileSystem = isolatedFileSystem;
    this._normalizedFileSystemPath = this._fileSystem.path();
    if (WebInspector.isWin())
        this._normalizedFileSystemPath = this._normalizedFileSystemPath.replace(/\\/g, "/");
    this._fileSystemURL = "file://" + this._normalizedFileSystemPath + "/";
    this._workspace = workspace;
    /** @type {Object.<number, function(Array.<string>)>} */
    this._searchCallbacks = {};
    /** @type {Object.<number, function()>} */
    this._indexingCallbacks = {};
    /** @type {Object.<number, WebInspector.Progress>} */
    this._indexingProgresses = {};
}

WebInspector.FileSystemProjectDelegate._scriptExtensions = ["js", "java", "coffee", "ts", "dart"].keySet();
WebInspector.FileSystemProjectDelegate._styleSheetExtensions = ["css", "scss", "sass", "less"].keySet();
WebInspector.FileSystemProjectDelegate._documentExtensions = ["htm", "html", "asp", "aspx", "phtml", "jsp"].keySet();

WebInspector.FileSystemProjectDelegate.projectId = function(fileSystemPath)
{
    return "filesystem:" + fileSystemPath;
}

WebInspector.FileSystemProjectDelegate._lastRequestId = 0;

WebInspector.FileSystemProjectDelegate.prototype = {
    /**
     * @return {string}
     */
    id: function()
    {
        return WebInspector.FileSystemProjectDelegate.projectId(this._fileSystem.path());
    },

    /**
     * @return {string}
     */
    type: function()
    {
        return WebInspector.projectTypes.FileSystem;
    },

    /**
     * @return {string}
     */
    fileSystemPath: function()
    {
        return this._fileSystem.path();
    },

    /**
     * @return {string}
     */
    displayName: function()
    {
        return this._normalizedFileSystemPath.substr(this._normalizedFileSystemPath.lastIndexOf("/") + 1);
    },

    /**
     * @param {string} path
     * @return {string}
     */
    _filePathForPath: function(path)
    {
        return "/" + path;
    },

    /**
     * @param {string} path
     * @param {function(?string,boolean,string)} callback
     */
    requestFileContent: function(path, callback)
    {
        var filePath = this._filePathForPath(path);
        this._fileSystem.requestFileContent(filePath, innerCallback.bind(this));
        
        /**
         * @param {?string} content
         */
        function innerCallback(content)
        {
            var extension = this._extensionForPath(path);
            var mimeType = WebInspector.ResourceType.mimeTypesForExtensions[extension];
            callback(content, false, mimeType);
        }
    },

    /**
     * @param {string} path
     * @param {function(?Date, ?number)} callback
     */
    requestMetadata: function(path, callback)
    {
        var filePath = this._filePathForPath(path);
        this._fileSystem.requestMetadata(filePath, callback);
    },

    /**
     * @return {boolean}
     */
    canSetFileContent: function()
    {
        return true;
    },

    /**
     * @param {string} path
     * @param {string} newContent
     * @param {function(?string)} callback
     */
    setFileContent: function(path, newContent, callback)
    {
        var filePath = this._filePathForPath(path);
        this._fileSystem.setFileContent(filePath, newContent, callback.bind(this, ""));
    },

    /**
     * @return {boolean}
     */
    canRename: function()
    {
        return true;
    },

    /**
     * @param {string} path
     * @param {string} newName
     * @param {function(boolean, string=)} callback
     */
    rename: function(path, newName, callback)
    {
        var filePath = this._filePathForPath(path);
        this._fileSystem.renameFile(filePath, newName, callback);
    },

    /**
     * @param {string} path
     * @param {string} query
     * @param {boolean} caseSensitive
     * @param {boolean} isRegex
     * @param {function(Array.<WebInspector.ContentProvider.SearchMatch>)} callback
     */
    searchInFileContent: function(path, query, caseSensitive, isRegex, callback)
    {
        var filePath = this._filePathForPath(path);
        this._fileSystem.requestFileContent(filePath, contentCallback.bind(this));

        /**
         * @param {?string} content
         */
        function contentCallback(content)
        {
            var result = [];
            if (content !== null)
                result = WebInspector.ContentProvider.performSearchInContent(content, query, caseSensitive, isRegex);
            callback(result);
        }
    },

    /**
     * @param {string} query
     * @param {boolean} caseSensitive
     * @param {boolean} isRegex
     * @param {WebInspector.Progress} progress
     * @param {function(StringMap)} callback
     */
    searchInContent: function(query, caseSensitive, isRegex, progress, callback)
    {
        var requestId = ++WebInspector.FileSystemProjectDelegate._lastRequestId;
        this._searchCallbacks[requestId] = innerCallback.bind(this);
        InspectorFrontendHost.searchInPath(requestId, this._fileSystem.path(), isRegex ? "" : query);

        function innerCallback(files)
        {
            function trimAndNormalizeFileSystemPath(fullPath)
            {
                var trimmedPath = fullPath.substr(this._fileSystem.path().length + 1);
                if (WebInspector.isWin())
                    trimmedPath = trimmedPath.replace(/\\/g, "/");
                return trimmedPath;
            }

            files = files.map(trimAndNormalizeFileSystemPath.bind(this));
            var result = new StringMap();
            progress.setTotalWork(files.length);
            if (files.length === 0) {
                progress.done();
                callback(result);
                return;
            }

            var fileIndex = 0;
            var maxFileContentRequests = 20;
            var callbacksLeft = 0;

            function searchInNextFiles()
            {
                for (; callbacksLeft < maxFileContentRequests; ++callbacksLeft) {
                    if (fileIndex >= files.length)
                        break;
                    var path = files[fileIndex++];
                    var filePath = this._filePathForPath(path);
                    this._fileSystem.requestFileContent(filePath, contentCallback.bind(this, path));
                }
            }

            searchInNextFiles.call(this);

            /**
             * @param {string} path
             * @param {?string} content
             */
            function contentCallback(path, content)
            {
                var matches = [];
                if (content !== null)
                    matches = WebInspector.ContentProvider.performSearchInContent(content, query, caseSensitive, isRegex);

                result.put(path, matches);
                progress.worked(1);

                --callbacksLeft;
                if (fileIndex < files.length) {
                    searchInNextFiles.call(this);
                } else {
                    if (callbacksLeft)
                        return;
                    progress.done();
                    callback(result);
                }
            }
        }
    },

    /**
     * @param {number} requestId
     * @param {Array.<string>} files
     */
    searchCompleted: function(requestId, files)
    {
        if (!this._searchCallbacks[requestId])
            return;
        var callback = this._searchCallbacks[requestId];
        delete this._searchCallbacks[requestId];
        callback(files);
    },

    /**
     * @param {WebInspector.Progress} progress
     * @param {function()} callback
     */
    indexContent: function(progress, callback)
    {
        var requestId = ++WebInspector.FileSystemProjectDelegate._lastRequestId;
        this._indexingCallbacks[requestId] = callback;
        this._indexingProgresses[requestId] = progress;
        progress.setTotalWork(1);
        progress.addEventListener(WebInspector.Progress.Events.Canceled, this._indexingCanceled.bind(this, requestId));
        InspectorFrontendHost.indexPath(requestId, this._fileSystem.path());
    },

    /**
     * @param {number} requestId
     */
    _indexingCanceled: function(requestId)
    {
        if (!this._indexingProgresses[requestId])
            return;
        InspectorFrontendHost.stopIndexing(requestId);
        delete this._indexingProgresses[requestId];
        delete this._indexingCallbacks[requestId];
    },

    /**
     * @param {number} requestId
     * @param {number} totalWork
     */
    indexingTotalWorkCalculated: function(requestId, totalWork)
    {
        if (!this._indexingProgresses[requestId])
            return;
        var progress = this._indexingProgresses[requestId];
        progress.setTotalWork(totalWork);
    },

    /**
     * @param {number} requestId
     * @param {number} worked
     */
    indexingWorked: function(requestId, worked)
    {
        if (!this._indexingProgresses[requestId])
            return;
        var progress = this._indexingProgresses[requestId];
        progress.worked(worked);
    },

    /**
     * @param {number} requestId
     */
    indexingDone: function(requestId)
    {
        if (!this._indexingProgresses[requestId])
            return;
        var progress = this._indexingProgresses[requestId];
        var callback = this._indexingCallbacks[requestId];
        delete this._indexingProgresses[requestId];
        delete this._indexingCallbacks[requestId];
        progress.done();
        callback.call();
    },

    /**
     * @param {string} path
     * @return {string}
     */
    _extensionForPath: function(path)
    {
        var extensionIndex = path.lastIndexOf(".");
        if (extensionIndex === -1)
            return "";
        return path.substring(extensionIndex + 1).toLowerCase();
    },

    /**
     * @param {string} extension
     * @return {WebInspector.ResourceType}
     */
    _contentTypeForExtension: function(extension)
    {
        if (WebInspector.FileSystemProjectDelegate._scriptExtensions[extension])
            return WebInspector.resourceTypes.Script;
        if (WebInspector.FileSystemProjectDelegate._styleSheetExtensions[extension])
            return WebInspector.resourceTypes.Stylesheet;
        if (WebInspector.FileSystemProjectDelegate._documentExtensions[extension])
            return WebInspector.resourceTypes.Document;
        return WebInspector.resourceTypes.Other;
    },

    populate: function()
    {
        this._fileSystem.requestFilesRecursive("", this._addFile.bind(this));
    },

    /**
     * @param {string} path
     */
    refresh: function(path)
    {
        this._fileSystem.requestFilesRecursive(path, this._addFile.bind(this));
    },

    /**
     * @param {string} path
     */
    excludeFolder: function(path)
    {
        WebInspector.isolatedFileSystemManager.mapping().addExcludedFolder(this._fileSystem.path(), path);
    },

    /**
     * @param {string} path
     * @param {?string} name
     * @param {function(?string)} callback
     */
    createFile: function(path, name, callback)
    {
        this._fileSystem.createFile(path, name, innerCallback.bind(this));

        function innerCallback(filePath)
        {
            this._addFile(filePath);
            callback(filePath);
        }
    },

    /**
     * @param {string} path
     */
    deleteFile: function(path)
    {
        this._fileSystem.deleteFile(path);
        this._removeFile(path);
    },

    remove: function()
    {
        WebInspector.isolatedFileSystemManager.removeFileSystem(this._fileSystem.path());
    },

    /**
     * @param {string} filePath
     */
    _addFile: function(filePath)
    {
        if (!filePath)
            console.assert(false);

        var slash = filePath.lastIndexOf("/");
        var parentPath = filePath.substring(0, slash);
        var name = filePath.substring(slash + 1);

        var url = this._workspace.urlForPath(this._fileSystem.path(), filePath);
        var extension = this._extensionForPath(name);
        var contentType = this._contentTypeForExtension(extension);

        var fileDescriptor = new WebInspector.FileDescriptor(parentPath, name, this._fileSystemURL + filePath, url, contentType, true);
        this.dispatchEventToListeners(WebInspector.ProjectDelegate.Events.FileAdded, fileDescriptor);
    },

    /**
     * @param {string} path
     */
    _removeFile: function(path)
    {
        this.dispatchEventToListeners(WebInspector.ProjectDelegate.Events.FileRemoved, path);
    },

    reset: function()
    {
        this.dispatchEventToListeners(WebInspector.ProjectDelegate.Events.Reset, null);
    },
    
    __proto__: WebInspector.Object.prototype
}

/**
 * @type {?WebInspector.FileSystemProjectDelegate}
 */
WebInspector.fileSystemProjectDelegate = null;

/**
 * @constructor
 * @param {WebInspector.IsolatedFileSystemManager} isolatedFileSystemManager
 * @param {WebInspector.Workspace} workspace
 */
WebInspector.FileSystemWorkspaceProvider = function(isolatedFileSystemManager, workspace)
{
    this._isolatedFileSystemManager = isolatedFileSystemManager;
    this._workspace = workspace;
    this._isolatedFileSystemManager.addEventListener(WebInspector.IsolatedFileSystemManager.Events.FileSystemAdded, this._fileSystemAdded, this);
    this._isolatedFileSystemManager.addEventListener(WebInspector.IsolatedFileSystemManager.Events.FileSystemRemoved, this._fileSystemRemoved, this);
    this._projectDelegates = {};
}

WebInspector.FileSystemWorkspaceProvider.prototype = {
    /**
     * @param {WebInspector.Event} event
     */
    _fileSystemAdded: function(event)
    {
        var fileSystem = /** @type {WebInspector.IsolatedFileSystem} */ (event.data);
        var projectId = WebInspector.FileSystemProjectDelegate.projectId(fileSystem.path());
        var projectDelegate = new WebInspector.FileSystemProjectDelegate(fileSystem, this._workspace)
        this._projectDelegates[projectDelegate.id()] = projectDelegate;
        console.assert(!this._workspace.project(projectDelegate.id()));
        this._workspace.addProject(projectDelegate);
        projectDelegate.populate();
    },

    /**
     * @param {WebInspector.Event} event
     */
    _fileSystemRemoved: function(event)
    {
        var fileSystem = /** @type {WebInspector.IsolatedFileSystem} */ (event.data);
        var projectId = WebInspector.FileSystemProjectDelegate.projectId(fileSystem.path());
        this._workspace.removeProject(projectId);
        delete this._projectDelegates[projectId];
    },

    /**
     * @param {WebInspector.UISourceCode} uiSourceCode
     */
    fileSystemPath: function(uiSourceCode)
    {
        var projectDelegate = this._projectDelegates[uiSourceCode.project().id()];
        return projectDelegate.fileSystemPath();
    },

    /**
     * @param {WebInspector.FileSystemProjectDelegate} fileSystemPath
     */
    delegate: function(fileSystemPath)
    {
        var projectId = WebInspector.FileSystemProjectDelegate.projectId(fileSystemPath);
        return this._projectDelegates[projectId];
    }
}

/**
 * @type {?WebInspector.FileSystemWorkspaceProvider}
 */
WebInspector.fileSystemWorkspaceProvider = null;
