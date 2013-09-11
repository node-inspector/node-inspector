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
 * @param {string} parentPath
 * @param {string} name
 * @param {string} originURL
 * @param {string} url
 * @param {WebInspector.ResourceType} contentType
 * @param {boolean} isEditable
 * @param {boolean=} isContentScript
 */
WebInspector.FileDescriptor = function(parentPath, name, originURL, url, contentType, isEditable, isContentScript)
{
    this.parentPath = parentPath;
    this.name = name;
    this.originURL = originURL;
    this.url = url;
    this.contentType = contentType;
    this.isEditable = isEditable;
    this.isContentScript = isContentScript || false;
}

/**
 * @interface
 * @extends {WebInspector.EventTarget}
 */
WebInspector.ProjectDelegate = function() { }

WebInspector.ProjectDelegate.Events = {
    FileAdded: "FileAdded",
    FileRemoved: "FileRemoved",
    Reset: "Reset",
}

WebInspector.ProjectDelegate.prototype = {
    /**
     * @return {string}
     */
    id: function() { },

    /**
     * @return {string}
     */
    type: function() { },

    /**
     * @return {string}
     */
    displayName: function() { }, 

    /**
     * @param {string} path
     * @param {function(?Date, ?number)} callback
     */
    requestMetadata: function(path, callback) { },

    /**
     * @param {string} path
     * @param {function(?string,boolean,string)} callback
     */
    requestFileContent: function(path, callback) { },

    /**
     * @return {boolean}
     */
    canSetFileContent: function() { },

    /**
     * @param {string} path
     * @param {string} newContent
     * @param {function(?string)} callback
     */
    setFileContent: function(path, newContent, callback) { },

    /**
     * @return {boolean}
     */
    canRename: function() { },

    /**
     * @param {string} path
     * @param {string} newName
     * @param {function(boolean, string=)} callback
     */
    rename: function(path, newName, callback) { },

    /**
     * @param {string} path
     */
    refresh: function(path) { },

    /**
     * @param {string} path
     */
    excludeFolder: function(path) { },

    /**
     * @param {string} path
     * @param {?string} name
     * @param {function(?string)} callback
     */
    createFile: function(path, name, callback) { },

    /**
     * @param {string} path
     */
    deleteFile: function(path) { },

    remove: function() { },

    /**
     * @param {string} path
     * @param {string} query
     * @param {boolean} caseSensitive
     * @param {boolean} isRegex
     * @param {function(Array.<WebInspector.ContentProvider.SearchMatch>)} callback
     */
    searchInFileContent: function(path, query, caseSensitive, isRegex, callback) { },

    /**
     * @param {string} query
     * @param {boolean} caseSensitive
     * @param {boolean} isRegex
     * @param {WebInspector.Progress} progress
     * @param {function(StringMap)} callback
     */
    searchInContent: function(query, caseSensitive, isRegex, progress, callback) { },

    /**
     * @param {WebInspector.Progress} progress
     * @param {function()} callback
     */
    indexContent: function(progress, callback) { }
}

/**
 * @param {WebInspector.Workspace} workspace
 * @param {WebInspector.ProjectDelegate} projectDelegate
 * @constructor
 */
WebInspector.Project = function(workspace, projectDelegate)
{
    /** @type {Object.<string, {uiSourceCode: WebInspector.UISourceCode, index: number}>} */
    this._uiSourceCodesMap = {};
    /** @type {Array.<WebInspector.UISourceCode>} */
    this._uiSourceCodesList = [];
    this._workspace = workspace;
    this._projectDelegate = projectDelegate;
    this._displayName = this._projectDelegate.displayName();
    this._projectDelegate.addEventListener(WebInspector.ProjectDelegate.Events.FileAdded, this._fileAdded, this);
    this._projectDelegate.addEventListener(WebInspector.ProjectDelegate.Events.FileRemoved, this._fileRemoved, this);
    this._projectDelegate.addEventListener(WebInspector.ProjectDelegate.Events.Reset, this._reset, this);
}

WebInspector.Project.prototype = {
    /**
     * @return {string}
     */
    id: function()
    {
        return this._projectDelegate.id();
    },

    /**
     * @return {string}
     */
    type: function()
    {
        return this._projectDelegate.type(); 
    },

    /**
     * @return {string}
     */
    displayName: function() 
    {
        return this._displayName;
    },

    /**
     * @return {boolean}
     */
    isServiceProject: function()
    {
        return this._projectDelegate.type() === WebInspector.projectTypes.Debugger || this._projectDelegate.type() === WebInspector.projectTypes.LiveEdit;
    },

    _fileAdded: function(event)
    {
        var fileDescriptor = /** @type {WebInspector.FileDescriptor} */ (event.data);
        var path = fileDescriptor.parentPath ? fileDescriptor.parentPath + "/" + fileDescriptor.name : fileDescriptor.name;
        var uiSourceCode = this.uiSourceCode(path);
        if (uiSourceCode)
            return;

        uiSourceCode = new WebInspector.UISourceCode(this, fileDescriptor.parentPath, fileDescriptor.name, fileDescriptor.originURL, fileDescriptor.url, fileDescriptor.contentType, fileDescriptor.isEditable);
        uiSourceCode.isContentScript = fileDescriptor.isContentScript;

        this._uiSourceCodesMap[path] = {uiSourceCode: uiSourceCode, index: this._uiSourceCodesList.length};
        this._uiSourceCodesList.push(uiSourceCode);
        this._workspace.dispatchEventToListeners(WebInspector.Workspace.Events.UISourceCodeAdded, uiSourceCode);
    },

    _fileRemoved: function(event)
    {
        var path = /** @type {string} */ (event.data);
        this._removeFile(path);
    },

    /**
     * @param {string} path
     */
    _removeFile: function(path)
    {
        var uiSourceCode = this.uiSourceCode(path);
        if (!uiSourceCode)
            return;

        var entry = this._uiSourceCodesMap[path];
        var movedUISourceCode = this._uiSourceCodesList[this._uiSourceCodesList.length - 1];
        this._uiSourceCodesList[entry.index] = movedUISourceCode;
        var movedEntry = this._uiSourceCodesMap[movedUISourceCode.path()];
        movedEntry.index = entry.index;
        this._uiSourceCodesList.splice(this._uiSourceCodesList.length - 1, 1);
        delete this._uiSourceCodesMap[path];
        this._workspace.dispatchEventToListeners(WebInspector.Workspace.Events.UISourceCodeRemoved, entry.uiSourceCode);
    },

    _reset: function()
    {
        this._workspace.dispatchEventToListeners(WebInspector.Workspace.Events.ProjectWillReset, this);
        this._uiSourceCodesMap = {};
        this._uiSourceCodesList = [];
    },

    /**
     * @param {string} path
     * @return {?WebInspector.UISourceCode}
     */
    uiSourceCode: function(path)
    {
        var entry = this._uiSourceCodesMap[path];
        return entry ? entry.uiSourceCode : null;
    },

    /**
     * @param {string} originURL
     * @return {?WebInspector.UISourceCode}
     */
    uiSourceCodeForOriginURL: function(originURL)
    {
        for (var i = 0; i < this._uiSourceCodesList.length; ++i) {
            var uiSourceCode = this._uiSourceCodesList[i];
            if (uiSourceCode.originURL() === originURL)
                return uiSourceCode;
        }
        return null;
    },

    /**
     * @return {Array.<WebInspector.UISourceCode>}
     */
    uiSourceCodes: function()
    {
        return this._uiSourceCodesList;
    },

    /**
     * @param {WebInspector.UISourceCode} uiSourceCode
     * @param {function(?Date, ?number)} callback
     */
    requestMetadata: function(uiSourceCode, callback)
    {
        this._projectDelegate.requestMetadata(uiSourceCode.path(), callback);
    },

    /**
     * @param {WebInspector.UISourceCode} uiSourceCode
     * @param {function(?string,boolean,string)} callback
     */
    requestFileContent: function(uiSourceCode, callback)
    {
        this._projectDelegate.requestFileContent(uiSourceCode.path(), callback);
    },

    /**
     * @return {boolean}
     */
    canSetFileContent: function()
    {
        return this._projectDelegate.canSetFileContent();
    },

    /**
     * @param {WebInspector.UISourceCode} uiSourceCode
     * @param {string} newContent
     * @param {function(?string)} callback
     */
    setFileContent: function(uiSourceCode, newContent, callback)
    {
        this._projectDelegate.setFileContent(uiSourceCode.path(), newContent, onSetContent.bind(this));

        /**
         * @param {?string} content
         */
        function onSetContent(content)
        {
            this._workspace.dispatchEventToListeners(WebInspector.Workspace.Events.UISourceCodeContentCommitted, { uiSourceCode: uiSourceCode, content: newContent });
            callback(content);
        }
    },

    /**
     * @return {boolean}
     */
    canRename: function()
    {
        return this._projectDelegate.canRename();
    },

    /**
     * @param {WebInspector.UISourceCode} uiSourceCode
     * @param {string} newName
     * @param {function(boolean, string=)} callback
     */
    rename: function(uiSourceCode, newName, callback)
    {
        if (newName === uiSourceCode.name()) {
            callback(true, newName);
            return;
        }

        this._projectDelegate.rename(uiSourceCode.path(), newName, innerCallback.bind(this));

        /**
         * @param {boolean} success
         * @param {string=} newName
         */
        function innerCallback(success, newName)
        {
            if (!success || !newName) {
                callback(false);
                return;
            }
            var oldPath = uiSourceCode.path();
            var newPath = uiSourceCode.parentPath() ? uiSourceCode.parentPath() + "/" + newName : newName;
            this._uiSourceCodesMap[newPath] = this._uiSourceCodesMap[oldPath];
            delete this._uiSourceCodesMap[oldPath];
            callback(true, newName);
        }
    },

    /**
     * @param {string} path
     */
    refresh: function(path)
    {
        this._projectDelegate.refresh(path);
    },

    /**
     * @param {string} path
     */
    excludeFolder: function(path)
    {
        this._projectDelegate.excludeFolder(path);
        var uiSourceCodes = this._uiSourceCodesList.slice();
        for (var i = 0; i < uiSourceCodes.length; ++i) {
            var uiSourceCode = uiSourceCodes[i];
            if (uiSourceCode.path().startsWith(path.substr(1)))
                this._removeFile(uiSourceCode.path());
        }
    },

    /**
     * @param {string} path
     * @param {?string} name
     * @param {function(?string)} callback
     */
    createFile: function(path, name, callback)
    {
        this._projectDelegate.createFile(path, name, innerCallback);

        function innerCallback(filePath)
        {
            callback(filePath);
        }
    },

    /**
     * @param {WebInspector.UISourceCode} uiSourceCode
     */
    deleteFile: function(uiSourceCode)
    {
        this._projectDelegate.deleteFile(uiSourceCode.path());
    },

    remove: function()
    {
        this._projectDelegate.remove();
    },

    /**
     * @param {WebInspector.UISourceCode} uiSourceCode
     * @param {string} query
     * @param {boolean} caseSensitive
     * @param {boolean} isRegex
     * @param {function(Array.<WebInspector.ContentProvider.SearchMatch>)} callback
     */
    searchInFileContent: function(uiSourceCode, query, caseSensitive, isRegex, callback)
    {
        this._projectDelegate.searchInFileContent(uiSourceCode.path(), query, caseSensitive, isRegex, callback);
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
        this._projectDelegate.searchInContent(query, caseSensitive, isRegex, progress, callback);
    },

    /**
     * @param {WebInspector.Progress} progress
     * @param {function()} callback
     */
    indexContent: function(progress, callback)
    {
        this._projectDelegate.indexContent(progress, callback);
    },

    dispose: function()
    {
        this._projectDelegate.reset();
    }
}

WebInspector.projectTypes = {
    Debugger: "debugger",
    LiveEdit: "liveedit",
    Network: "network",
    Snippets: "snippets",
    FileSystem: "filesystem"
}

/**
 * @constructor
 * @extends {WebInspector.Object}
 * @param {WebInspector.FileSystemMapping} fileSystemMapping
 */
WebInspector.Workspace = function(fileSystemMapping)
{
    this._fileSystemMapping = fileSystemMapping;
    /** @type {!Object.<string, WebInspector.Project>} */
    this._projects = {};
}

WebInspector.Workspace.Events = {
    UISourceCodeAdded: "UISourceCodeAdded",
    UISourceCodeRemoved: "UISourceCodeRemoved",
    UISourceCodeContentCommitted: "UISourceCodeContentCommitted",
    ProjectWillReset: "ProjectWillReset"
}

WebInspector.Workspace.prototype = {
    /**
     * @param {string} projectId
     * @param {string} path
     * @return {?WebInspector.UISourceCode}
     */
    uiSourceCode: function(projectId, path)
    {
        var project = this._projects[projectId];
        return project ? project.uiSourceCode(path) : null;
    },

    /**
     * @param {string} originURL
     * @return {?WebInspector.UISourceCode}
     */
    uiSourceCodeForOriginURL: function(originURL)
    {
        var networkProjects = this.projectsForType(WebInspector.projectTypes.Network)
        for (var i = 0; i < networkProjects.length; ++i) {
            var project = networkProjects[i];
            var uiSourceCode = project.uiSourceCodeForOriginURL(originURL);
            if (uiSourceCode)
                return uiSourceCode;
        }
        return null;
    },

    /**
     * @param {string} type
     * @return {Array.<WebInspector.UISourceCode>}
     */
    uiSourceCodesForProjectType: function(type)
    {
        var result = [];
        for (var projectName in this._projects) {
            var project = this._projects[projectName];
            if (project.type() === type)
                result = result.concat(project.uiSourceCodes());
        }
        return result;
    },

    /**
     * @param {WebInspector.ProjectDelegate} projectDelegate
     * @return {WebInspector.Project}
     */
    addProject: function(projectDelegate)
    {
        var projectId = projectDelegate.id();
        this._projects[projectId] = new WebInspector.Project(this, projectDelegate);
        return this._projects[projectId];
    },

    /**
     * @param {string} projectId
     */
    removeProject: function(projectId)
    {
        var project = this._projects[projectId];
        if (!project)
            return;
        project.dispose();
        delete this._projects[projectId];
    },

    /**
     * @param {string} projectId
     * @return {WebInspector.Project}
     */
    project: function(projectId)
    {
        return this._projects[projectId];
    },

    /**
     * @return {Array.<WebInspector.Project>}
     */
    projects: function()
    {
        return Object.values(this._projects);
    },

    /**
     * @param {string} type
     * @return {Array.<WebInspector.Project>}
     */
    projectsForType: function(type)
    {
        function filterByType(project)
        {
            return project.type() === type;
        }
        return this.projects().filter(filterByType);
    },

    /**
     * @return {Array.<WebInspector.UISourceCode>}
     */
    uiSourceCodes: function()
    {
        var result = [];
        for (var projectId in this._projects) {
            var project = this._projects[projectId];
            result = result.concat(project.uiSourceCodes());
        }
        return result;
    },

    /**
     * @param {string} url
     * @return {boolean}
     */
    hasMappingForURL: function(url)
    {
        if (!InspectorFrontendHost.supportsFileSystems())
            return false;
        return this._fileSystemMapping.hasMappingForURL(url);
    },

    /**
     * @param {string} url
     * @return {WebInspector.UISourceCode}
     */
    _networkUISourceCodeForURL: function(url)
    {
        var splitURL = WebInspector.ParsedURL.splitURL(url);
        var projectId = WebInspector.SimpleProjectDelegate.projectId(splitURL[0], WebInspector.projectTypes.Network);
        var project = this.project(projectId);
        return project ? project.uiSourceCode(splitURL.slice(1).join("/")) : null;
    },

    /**
     * @param {string} url
     * @return {WebInspector.UISourceCode}
     */
    uiSourceCodeForURL: function(url)
    {
        if (!InspectorFrontendHost.supportsFileSystems())
            return this._networkUISourceCodeForURL(url);
        var file = this._fileSystemMapping.fileForURL(url);
        if (!file)
            return this._networkUISourceCodeForURL(url);

        var projectId = WebInspector.FileSystemProjectDelegate.projectId(file.fileSystemPath);
        var project = this.project(projectId);
        return project ? project.uiSourceCode(file.filePath) : null;
    },

    /**
     * @param {string} fileSystemPath
     * @param {string} filePath
     * @return {string}
     */
    urlForPath: function(fileSystemPath, filePath)
    {
        return this._fileSystemMapping.urlForPath(fileSystemPath, filePath);
    },

    /**
     * @param {WebInspector.UISourceCode} networkUISourceCode
     * @param {WebInspector.UISourceCode} uiSourceCode
     * @param {WebInspector.FileSystemWorkspaceProvider} fileSystemWorkspaceProvider
     */
    addMapping: function(networkUISourceCode, uiSourceCode, fileSystemWorkspaceProvider)
    {
        var url = networkUISourceCode.url;
        var path = uiSourceCode.path();
        var fileSystemPath = fileSystemWorkspaceProvider.fileSystemPath(uiSourceCode);
        this._fileSystemMapping.addMappingForResource(url, fileSystemPath, path);
        WebInspector.suggestReload();
    },

    /**
     * @param {WebInspector.UISourceCode} uiSourceCode
     */
    removeMapping: function(uiSourceCode)
    {
        this._fileSystemMapping.removeMappingForURL(uiSourceCode.url);
        WebInspector.suggestReload();
    },

    __proto__: WebInspector.Object.prototype
}

/**
 * @type {?WebInspector.Workspace}
 */
WebInspector.workspace = null;
