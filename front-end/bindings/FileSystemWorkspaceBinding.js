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
 * @param {!WebInspector.IsolatedFileSystemManager} isolatedFileSystemManager
 * @param {!WebInspector.Workspace} workspace
 * @param {!WebInspector.NetworkMapping} networkMapping
 */
WebInspector.FileSystemWorkspaceBinding = function(isolatedFileSystemManager, workspace, networkMapping)
{
    this._isolatedFileSystemManager = isolatedFileSystemManager;
    this._workspace = workspace;
    // FIXME: This dependency should be removed from here once we do not need URL to create a UISourceCode.
    this._networkMapping = networkMapping;
    this._isolatedFileSystemManager.addEventListener(WebInspector.IsolatedFileSystemManager.Events.FileSystemAdded, this._fileSystemAdded, this);
    this._isolatedFileSystemManager.addEventListener(WebInspector.IsolatedFileSystemManager.Events.FileSystemRemoved, this._fileSystemRemoved, this);
    /** @type {!Map.<string, !WebInspector.FileSystemWorkspaceBinding.FileSystem>} */
    this._boundFileSystems = new Map();

    /** @type {!Object.<number, function(!Array.<string>)>} */
    this._callbacks = {};
    /** @type {!Object.<number, !WebInspector.Progress>} */
    this._progresses = {};

    InspectorFrontendHost.events.addEventListener(InspectorFrontendHostAPI.Events.IndexingTotalWorkCalculated, this._onIndexingTotalWorkCalculated, this);
    InspectorFrontendHost.events.addEventListener(InspectorFrontendHostAPI.Events.IndexingWorked, this._onIndexingWorked, this);
    InspectorFrontendHost.events.addEventListener(InspectorFrontendHostAPI.Events.IndexingDone, this._onIndexingDone, this);
    InspectorFrontendHost.events.addEventListener(InspectorFrontendHostAPI.Events.SearchCompleted, this._onSearchCompleted, this);
}

WebInspector.FileSystemWorkspaceBinding._styleSheetExtensions = ["css", "scss", "sass", "less"].keySet();
WebInspector.FileSystemWorkspaceBinding._documentExtensions = ["htm", "html", "asp", "aspx", "phtml", "jsp"].keySet();

WebInspector.FileSystemWorkspaceBinding._lastRequestId = 0;

/**
 * @param {string} fileSystemPath
 * @return {string}
 */
WebInspector.FileSystemWorkspaceBinding.projectId = function(fileSystemPath)
{
    return "filesystem:" + fileSystemPath;
}

WebInspector.FileSystemWorkspaceBinding.prototype = {
    /**
     * @param {!WebInspector.Event} event
     */
    _fileSystemAdded: function(event)
    {
        var fileSystem = /** @type {!WebInspector.IsolatedFileSystem} */ (event.data);
        var boundFileSystem = new WebInspector.FileSystemWorkspaceBinding.FileSystem(this, fileSystem, this._workspace, this._networkMapping);
        this._boundFileSystems.set(fileSystem.normalizedPath(), boundFileSystem);
    },

    /**
     * @param {!WebInspector.Event} event
     */
    _fileSystemRemoved: function(event)
    {
        var fileSystem = /** @type {!WebInspector.IsolatedFileSystem} */ (event.data);
        var boundFileSystem = this._boundFileSystems.get(fileSystem.normalizedPath());
        boundFileSystem.dispose();
        this._boundFileSystems.remove(fileSystem.normalizedPath());
    },

    /**
     * @param {string} projectId
     * @return {string}
     */
    fileSystemPath: function(projectId)
    {
        var fileSystemPath = projectId.substr("filesystem:".length);
        var normalizedPath = WebInspector.IsolatedFileSystem.normalizePath(fileSystemPath);
        return projectId.substr("filesystem:".length);
    },

    /**
     * @return {number}
     */
    _nextId: function()
    {
        return ++WebInspector.FileSystemWorkspaceBinding._lastRequestId;
    },

    /**
     * @param {function(!Array.<string>)} callback
     * @return {number}
     */
    registerCallback: function(callback)
    {
        var requestId = this._nextId();
        this._callbacks[requestId] = callback;
        return requestId;
    },

    /**
     * @param {!WebInspector.Progress} progress
     * @return {number}
     */
    registerProgress: function(progress)
    {
        var requestId = this._nextId();
        this._progresses[requestId] = progress;
        return requestId;
    },

    /**
     * @param {!WebInspector.Event} event
     */
    _onIndexingTotalWorkCalculated: function(event)
    {
        var requestId = /** @type {number} */ (event.data["requestId"]);
        var totalWork = /** @type {number} */ (event.data["totalWork"]);

        var progress = this._progresses[requestId];
        if (!progress)
            return;
        progress.setTotalWork(totalWork);
    },

    /**
     * @param {!WebInspector.Event} event
     */
    _onIndexingWorked: function(event)
    {
        var requestId = /** @type {number} */ (event.data["requestId"]);
        var worked = /** @type {number} */ (event.data["worked"]);

        var progress = this._progresses[requestId];
        if (!progress)
            return;
        progress.worked(worked);
        if (progress.isCanceled()) {
            InspectorFrontendHost.stopIndexing(requestId);
            this._onIndexingDone(event);
        }
    },

    /**
     * @param {!WebInspector.Event} event
     */
    _onIndexingDone: function(event)
    {
        var requestId = /** @type {number} */ (event.data["requestId"]);

        var progress = this._progresses[requestId];
        if (!progress)
            return;
        progress.done();
        delete this._progresses[requestId];
    },

    /**
     * @param {!WebInspector.Event} event
     */
    _onSearchCompleted: function(event)
    {
        var requestId = /** @type {number} */ (event.data["requestId"]);
        var files = /** @type {!Array.<string>} */ (event.data["files"]);

        var callback = this._callbacks[requestId];
        if (!callback)
            return;
        callback.call(null, files);
        delete this._callbacks[requestId];
    },
}

/**
 * @constructor
 * @extends {WebInspector.Object}
 * @implements {WebInspector.ProjectDelegate}
 * @param {!WebInspector.FileSystemWorkspaceBinding} fileSystemWorkspaceBinding
 * @param {!WebInspector.IsolatedFileSystem} isolatedFileSystem
 * @param {!WebInspector.Workspace} workspace
 * @param {!WebInspector.NetworkMapping} networkMapping
 */
WebInspector.FileSystemWorkspaceBinding.FileSystem = function(fileSystemWorkspaceBinding, isolatedFileSystem, workspace, networkMapping)
{
    WebInspector.Object.call(this);
    this._fileSystemWorkspaceBinding = fileSystemWorkspaceBinding;
    this._fileSystem = isolatedFileSystem;
    this._fileSystemBaseURL = "file://" + this._fileSystem.normalizedPath() + "/";
    this._fileSystemProjectURL = "filesystem:" + this._fileSystem.normalizedPath();
    this._workspace = workspace;
    // FIXME: This dependency should be removed from here once we do not need URL to create a UISourceCode.
    this._networkMapping = networkMapping;

    this._projectId = WebInspector.FileSystemWorkspaceBinding.projectId(this._fileSystem.path());
    console.assert(!this._workspace.project(this._projectId));
    this._workspace.addProject(this._projectId, this);
    this.populate();
}

WebInspector.FileSystemWorkspaceBinding.FileSystem.prototype = {
    /**
     * @override
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
     * @override
     * @return {string}
     */
    displayName: function()
    {
        var normalizedPath = this._fileSystem.normalizedPath();
        return normalizedPath.substr(normalizedPath.lastIndexOf("/") + 1);
    },

    /**
     * @override
     * @return {string}
     */
    url: function()
    {
        return this._fileSystemProjectURL;
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
     * @override
     * @param {string} path
     * @param {function(?string)} callback
     */
    requestFileContent: function(path, callback)
    {
        var filePath = this._filePathForPath(path);
        this._fileSystem.requestFileContent(filePath, callback);
    },

    /**
     * @override
     * @param {string} path
     * @param {function(?Date, ?number)} callback
     */
    requestMetadata: function(path, callback)
    {
        var filePath = this._filePathForPath(path);
        this._fileSystem.requestMetadata(filePath, callback);
    },

    /**
     * @override
     * @return {boolean}
     */
    canSetFileContent: function()
    {
        return true;
    },

    /**
     * @override
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
     * @override
     * @return {boolean}
     */
    canRename: function()
    {
        return true;
    },

    /**
     * @override
     * @param {string} path
     * @param {string} newName
     * @param {function(boolean, string=, string=, string=, !WebInspector.ResourceType=)} callback
     */
    rename: function(path, newName, callback)
    {
        var filePath = this._filePathForPath(path);
        this._fileSystem.renameFile(filePath, newName, innerCallback.bind(this));

        /**
         * @param {boolean} success
         * @param {string=} newName
         * @this {WebInspector.FileSystemWorkspaceBinding.FileSystem}
         */
        function innerCallback(success, newName)
        {
            if (!success) {
                callback(false, newName);
                return;
            }
            var validNewName = /** @type {string} */ (newName);
            console.assert(validNewName);
            var slash = filePath.lastIndexOf("/");
            var parentPath = filePath.substring(0, slash);
            filePath = parentPath + "/" + validNewName;
            filePath = filePath.substr(1);
            var newURL = this._networkMapping.urlForPath(this._fileSystem.path(), filePath);
            var extension = this._extensionForPath(validNewName);
            var newOriginURL = this._fileSystemBaseURL + filePath;
            var newContentType = this._contentTypeForExtension(extension);
            callback(true, validNewName, newURL, newOriginURL, newContentType);
        }
    },

    /**
     * @override
     * @param {string} path
     * @param {string} query
     * @param {boolean} caseSensitive
     * @param {boolean} isRegex
     * @param {function(!Array.<!WebInspector.ContentProvider.SearchMatch>)} callback
     */
    searchInFileContent: function(path, query, caseSensitive, isRegex, callback)
    {
        var filePath = this._filePathForPath(path);
        this._fileSystem.requestFileContent(filePath, contentCallback);

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
     * @override
     * @param {!WebInspector.ProjectSearchConfig} searchConfig
     * @param {!Array.<string>} filesMathingFileQuery
     * @param {!WebInspector.Progress} progress
     * @param {function(!Array.<string>)} callback
     */
    findFilesMatchingSearchRequest: function(searchConfig, filesMathingFileQuery, progress, callback)
    {
        var result = filesMathingFileQuery;
        var queriesToRun = searchConfig.queries().slice();
        if (!queriesToRun.length)
            queriesToRun.push("");
        progress.setTotalWork(queriesToRun.length);
        searchNextQuery.call(this);

        /**
         * @this {WebInspector.FileSystemWorkspaceBinding.FileSystem}
         */
        function searchNextQuery()
        {
            if (!queriesToRun.length) {
                progress.done();
                callback(result);
                return;
            }
            var query = queriesToRun.shift();
            this._searchInPath(searchConfig.isRegex() ? "" : query, progress, innerCallback.bind(this));
        }

        /**
         * @param {!Array.<string>} files
         * @this {WebInspector.FileSystemWorkspaceBinding.FileSystem}
         */
        function innerCallback(files)
        {
            files = files.sort();
            progress.worked(1);
            result = result.intersectOrdered(files, String.naturalOrderComparator);
            searchNextQuery.call(this);
        }
    },

    /**
     * @param {string} query
     * @param {!WebInspector.Progress} progress
     * @param {function(!Array.<string>)} callback
     */
    _searchInPath: function(query, progress, callback)
    {
        var requestId = this._fileSystemWorkspaceBinding.registerCallback(innerCallback.bind(this));
        InspectorFrontendHost.searchInPath(requestId, this._fileSystem.path(), query);

        /**
         * @param {!Array.<string>} files
         * @this {WebInspector.FileSystemWorkspaceBinding.FileSystem}
         */
        function innerCallback(files)
        {
            /**
             * @param {string} fullPath
             * @this {WebInspector.FileSystemWorkspaceBinding.FileSystem}
             */
            function trimAndNormalizeFileSystemPath(fullPath)
            {
                var trimmedPath = fullPath.substr(this._fileSystem.path().length + 1);
                if (WebInspector.isWin())
                    trimmedPath = trimmedPath.replace(/\\/g, "/");
                return trimmedPath;
            }

            files = files.map(trimAndNormalizeFileSystemPath.bind(this));
            progress.worked(1);
            callback(files);
        }
    },

    /**
     * @override
     * @param {!WebInspector.Progress} progress
     */
    indexContent: function(progress)
    {
        progress.setTotalWork(1);
        var requestId = this._fileSystemWorkspaceBinding.registerProgress(progress);
        InspectorFrontendHost.indexPath(requestId, this._fileSystem.path());
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
     * @return {!WebInspector.ResourceType}
     */
    _contentTypeForExtension: function(extension)
    {
        if (WebInspector.FileSystemWorkspaceBinding._styleSheetExtensions[extension])
            return WebInspector.resourceTypes.Stylesheet;
        if (WebInspector.FileSystemWorkspaceBinding._documentExtensions[extension])
            return WebInspector.resourceTypes.Document;
        return WebInspector.resourceTypes.Script;
    },

    populate: function()
    {
        this._fileSystem.requestFilesRecursive("", this._addFile.bind(this));
    },

    /**
     * @override
     * @param {string} path
     * @param {function()=} callback
     */
    refresh: function(path, callback)
    {
        this._fileSystem.requestFilesRecursive(path, this._addFile.bind(this), callback);
    },

    /**
     * @override
     * @param {string} path
     */
    excludeFolder: function(path)
    {
        this._fileSystemWorkspaceBinding._isolatedFileSystemManager.excludedFolderManager().addExcludedFolder(this._fileSystem.path(), path);
    },

    /**
     * @override
     * @param {string} path
     * @param {?string} name
     * @param {string} content
     * @param {function(?string)} callback
     */
    createFile: function(path, name, content, callback)
    {
        this._fileSystem.createFile(path, name, innerCallback.bind(this));
        var createFilePath;

        /**
         * @param {?string} filePath
         * @this {WebInspector.FileSystemWorkspaceBinding.FileSystem}
         */
        function innerCallback(filePath)
        {
            if (!filePath) {
                callback(null);
                return;
            }
            createFilePath = filePath;
            if (!content) {
                contentSet.call(this);
                return;
            }
            this._fileSystem.setFileContent(filePath, content, contentSet.bind(this));
        }

        /**
         * @this {WebInspector.FileSystemWorkspaceBinding.FileSystem}
         */
        function contentSet()
        {
            this._addFile(createFilePath);
            callback(createFilePath);
        }
    },

    /**
     * @override
     * @param {string} path
     */
    deleteFile: function(path)
    {
        this._fileSystem.deleteFile(path);
        this._removeFile(path);
    },

    /**
     * @override
     */
    remove: function()
    {
        this._fileSystemWorkspaceBinding._isolatedFileSystemManager.removeFileSystem(this._fileSystem.path());
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

        var url = this._networkMapping.urlForPath(this._fileSystem.path(), filePath);
        var extension = this._extensionForPath(name);
        var contentType = this._contentTypeForExtension(extension);

        var fileDescriptor = new WebInspector.FileDescriptor(parentPath, name, this._fileSystemBaseURL + filePath, url, contentType);
        this.dispatchEventToListeners(WebInspector.ProjectDelegate.Events.FileAdded, fileDescriptor);
    },

    /**
     * @param {string} path
     */
    _removeFile: function(path)
    {
        this.dispatchEventToListeners(WebInspector.ProjectDelegate.Events.FileRemoved, path);
    },

    dispose: function()
    {
        this._workspace.removeProject(this._projectId);
    },

    __proto__: WebInspector.Object.prototype
}

/**
 * @type {!WebInspector.FileSystemWorkspaceBinding}
 */
WebInspector.fileSystemWorkspaceBinding;
