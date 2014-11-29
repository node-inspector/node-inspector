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
 * @extends {WebInspector.Object}
 * @implements {WebInspector.ContentProvider}
 * @param {!WebInspector.Project} project
 * @param {string} parentPath
 * @param {string} name
 * @param {string} originURL
 * @param {string} url
 * @param {!WebInspector.ResourceType} contentType
 */
WebInspector.UISourceCode = function(project, parentPath, name, originURL, url, contentType)
{
    this._project = project;
    this._parentPath = parentPath;
    this._name = name;
    this._originURL = originURL;
    this._url = url;
    this._contentType = contentType;
    /** @type {!Array.<function(?string)>} */
    this._requestContentCallbacks = [];

    /** @type {!Array.<!WebInspector.Revision>} */
    this.history = [];
}

/**
 * @enum {string}
 */
WebInspector.UISourceCode.Events = {
    WorkingCopyChanged: "WorkingCopyChanged",
    WorkingCopyCommitted: "WorkingCopyCommitted",
    TitleChanged: "TitleChanged",
    SavedStateUpdated: "SavedStateUpdated",
    SourceMappingChanged: "SourceMappingChanged",
}

WebInspector.UISourceCode.prototype = {
    /**
     * @return {string}
     */
    get url()
    {
        return this._url;
    },

    /**
     * @return {string}
     */
    name: function()
    {
        return this._name;
    },

    /**
     * @return {string}
     */
    parentPath: function()
    {
        return this._parentPath;
    },

    /**
     * @return {string}
     */
    path: function()
    {
        return this._parentPath ? this._parentPath + "/" + this._name : this._name;
    },

    /**
     * @return {string}
     */
    fullDisplayName: function()
    {
        return this._project.displayName() + "/" + (this._parentPath ? this._parentPath + "/" : "") + this.displayName(true);
    },

    /**
     * @param {boolean=} skipTrim
     * @return {string}
     */
    displayName: function(skipTrim)
    {
        var displayName = this.name() || WebInspector.UIString("(index)");
        return skipTrim ? displayName : displayName.trimEnd(100);
    },

    /**
     * @return {string}
     */
    uri: function()
    {
        var path = this.path();
        if (!this._project.id())
            return path;
        if (!path)
            return this._project.id();
        return this._project.id() + "/" + path;
    },

    /**
     * @return {string}
     */
    originURL: function()
    {
        return this._originURL;
    },

    /**
     * @return {boolean}
     */
    canRename: function()
    {
        return this._project.canRename();
    },

    /**
     * @param {string} newName
     * @param {function(boolean)} callback
     */
    rename: function(newName, callback)
    {
        this._project.rename(this, newName, innerCallback.bind(this));

        /**
         * @param {boolean} success
         * @param {string=} newName
         * @param {string=} newURL
         * @param {string=} newOriginURL
         * @param {!WebInspector.ResourceType=} newContentType
         * @this {WebInspector.UISourceCode}
         */
        function innerCallback(success, newName, newURL, newOriginURL, newContentType)
        {
            if (success)
                this._updateName(/** @type {string} */ (newName), /** @type {string} */ (newURL), /** @type {string} */ (newOriginURL), /** @type {!WebInspector.ResourceType} */ (newContentType));
            callback(success);
        }
    },

    remove: function()
    {
        this._project.deleteFile(this.path());
    },

    /**
     * @param {string} name
     * @param {string} url
     * @param {string} originURL
     * @param {!WebInspector.ResourceType=} contentType
     */
    _updateName: function(name, url, originURL, contentType)
    {
        var oldURI = this.uri();
        this._name = name;
        if (url)
            this._url = url;
        if (originURL)
            this._originURL = originURL;
        if (contentType)
            this._contentType = contentType;
        this.dispatchEventToListeners(WebInspector.UISourceCode.Events.TitleChanged, oldURI);
    },

    /**
     * @return {string}
     */
    contentURL: function()
    {
        return this.originURL();
    },

    /**
     * @return {!WebInspector.ResourceType}
     */
    contentType: function()
    {
        return this._contentType;
    },

    /**
     * @return {!WebInspector.Project}
     */
    project: function()
    {
        return this._project;
    },

    /**
     * @param {function(?Date, ?number)} callback
     */
    requestMetadata: function(callback)
    {
        this._project.requestMetadata(this, callback);
    },

    /**
     * @param {function(?string)} callback
     */
    requestContent: function(callback)
    {
        if (this._content || this._contentLoaded) {
            callback(this._content);
            return;
        }
        this._requestContentCallbacks.push(callback);
        if (this._requestContentCallbacks.length === 1)
            this._project.requestFileContent(this, this._fireContentAvailable.bind(this));
    },

    /**
     * @param {function()} callback
     */
    _pushCheckContentUpdatedCallback: function(callback)
    {
        if (!this._checkContentUpdatedCallbacks)
            this._checkContentUpdatedCallbacks = [];
        this._checkContentUpdatedCallbacks.push(callback);
    },

    _terminateContentCheck: function()
    {
        delete this._checkingContent;
        if (this._checkContentUpdatedCallbacks) {
            this._checkContentUpdatedCallbacks.forEach(function(callback) { callback(); });
            delete this._checkContentUpdatedCallbacks;
        }
    },

    /**
     * @param {function()=} callback
     */
    checkContentUpdated: function(callback)
    {
        callback = callback || function() {};
        if (!this._project.canSetFileContent()) {
            callback();
            return;
        }
        this._pushCheckContentUpdatedCallback(callback);

        if (this._checkingContent) {
            return;
        }
        this._checkingContent = true;
        this._project.requestFileContent(this, contentLoaded.bind(this));

        /**
         * @param {?string} updatedContent
         * @this {WebInspector.UISourceCode}
         */
        function contentLoaded(updatedContent)
        {
            if (updatedContent === null) {
                var workingCopy = this.workingCopy();
                this._commitContent("", false);
                this.setWorkingCopy(workingCopy);
                this._terminateContentCheck();
                return;
            }
            if (typeof this._lastAcceptedContent === "string" && this._lastAcceptedContent === updatedContent) {
                this._terminateContentCheck();
                return;
            }
            if (this._content === updatedContent) {
                delete this._lastAcceptedContent;
                this._terminateContentCheck();
                return;
            }

            if (!this.isDirty()) {
                this._commitContent(updatedContent, false);
                this._terminateContentCheck();
                return;
            }

            var shouldUpdate = window.confirm(WebInspector.UIString("This file was changed externally. Would you like to reload it?"));
            if (shouldUpdate)
                this._commitContent(updatedContent, false);
            else
                this._lastAcceptedContent = updatedContent;
            this._terminateContentCheck();
        }
    },

    /**
     * @param {function(?string)} callback
     */
    requestOriginalContent: function(callback)
    {
        this._project.requestFileContent(this, callback);
    },

    /**
     * @param {string} content
     * @param {boolean} shouldSetContentInProject
     */
    _commitContent: function(content, shouldSetContentInProject)
    {
        delete this._lastAcceptedContent;
        this._content = content;
        this._contentLoaded = true;

        var lastRevision = this.history.length ? this.history[this.history.length - 1] : null;
        if (!lastRevision || lastRevision._content !== this._content) {
            var revision = new WebInspector.Revision(this, this._content, new Date());
            this.history.push(revision);
        }

        this._innerResetWorkingCopy();
        this._hasCommittedChanges = true;
        this.dispatchEventToListeners(WebInspector.UISourceCode.Events.WorkingCopyCommitted);
        if (this._url && WebInspector.fileManager.isURLSaved(this._url))
            this._saveURLWithFileManager(false, this._content);
        if (shouldSetContentInProject)
            this._project.setFileContent(this, this._content, function() { });
    },

    /**
     * @param {boolean} forceSaveAs
     * @param {?string} content
     */
    _saveURLWithFileManager: function(forceSaveAs, content)
    {
        WebInspector.fileManager.save(this._url, /** @type {string} */ (content), forceSaveAs, callback.bind(this));
        WebInspector.fileManager.close(this._url);

        /**
         * @param {boolean} accepted
         * @this {WebInspector.UISourceCode}
         */
        function callback(accepted)
        {
            this._savedWithFileManager = accepted;
            if (accepted)
                this._hasCommittedChanges = false;
            this.dispatchEventToListeners(WebInspector.UISourceCode.Events.SavedStateUpdated);
        }
    },

    /**
     * @param {boolean} forceSaveAs
     */
    save: function(forceSaveAs)
    {
        if (this.project().type() === WebInspector.projectTypes.FileSystem || this.project().type() === WebInspector.projectTypes.Snippets) {
            this.commitWorkingCopy();
            return;
        }
        if (this.isDirty()) {
            this._saveURLWithFileManager(forceSaveAs, this.workingCopy());
            this.commitWorkingCopy();
            return;
        }
        this.requestContent(this._saveURLWithFileManager.bind(this, forceSaveAs));
    },

    /**
     * @return {boolean}
     */
    hasUnsavedCommittedChanges: function()
    {
        if (this._savedWithFileManager || this.project().canSetFileContent() || this._project.isServiceProject())
            return false;
        if (this._project.workspace().hasResourceContentTrackingExtensions())
            return false;
        return !!this._hasCommittedChanges;
    },

    /**
     * @param {string} content
     */
    addRevision: function(content)
    {
        this._commitContent(content, true);
    },

    revertToOriginal: function()
    {
        /**
         * @this {WebInspector.UISourceCode}
         * @param {?string} content
         */
        function callback(content)
        {
            if (typeof content !== "string")
                return;

            this.addRevision(content);
        }

        this.requestOriginalContent(callback.bind(this));
    },

    /**
     * @param {function(!WebInspector.UISourceCode)} callback
     */
    revertAndClearHistory: function(callback)
    {
        /**
         * @this {WebInspector.UISourceCode}
         * @param {?string} content
         */
        function revert(content)
        {
            if (typeof content !== "string")
                return;

            this.addRevision(content);
            this.history = [];
            callback(this);
        }

        this.requestOriginalContent(revert.bind(this));
    },

    /**
     * @return {string}
     */
    workingCopy: function()
    {
        if (this._workingCopyGetter) {
            this._workingCopy = this._workingCopyGetter();
            delete this._workingCopyGetter;
        }
        if (this.isDirty())
            return this._workingCopy;
        return this._content;
    },

    resetWorkingCopy: function()
    {
        this._innerResetWorkingCopy();
        this.dispatchEventToListeners(WebInspector.UISourceCode.Events.WorkingCopyChanged);
    },

    _innerResetWorkingCopy: function()
    {
        delete this._workingCopy;
        delete this._workingCopyGetter;
    },

    /**
     * @param {string} newWorkingCopy
     */
    setWorkingCopy: function(newWorkingCopy)
    {
        this._workingCopy = newWorkingCopy;
        delete this._workingCopyGetter;
        this.dispatchEventToListeners(WebInspector.UISourceCode.Events.WorkingCopyChanged);
    },

    setWorkingCopyGetter: function(workingCopyGetter)
    {
        this._workingCopyGetter = workingCopyGetter;
        this.dispatchEventToListeners(WebInspector.UISourceCode.Events.WorkingCopyChanged);
    },

    removeWorkingCopyGetter: function()
    {
        if (!this._workingCopyGetter)
            return;
        this._workingCopy = this._workingCopyGetter();
        delete this._workingCopyGetter;
    },

    commitWorkingCopy: function()
    {
        if (this.isDirty())
            this._commitContent(this.workingCopy(), true);
    },

    /**
     * @return {boolean}
     */
    isDirty: function()
    {
        return typeof this._workingCopy !== "undefined" || typeof this._workingCopyGetter !== "undefined";
    },

    /**
     * @return {string}
     */
    extension: function()
    {
        if (this._project.type() === WebInspector.projectTypes.Network)
            return this.contentType().canonicalMimeType();
        var lastIndexOfDot = this._name.lastIndexOf(".");
        var extension = lastIndexOfDot !== -1 ? this._name.substr(lastIndexOfDot + 1) : "";
        var indexOfQuestionMark = extension.indexOf("?");
        if (indexOfQuestionMark !== -1)
            extension = extension.substr(0, indexOfQuestionMark);
        return extension;
    },

    /**
     * @return {?string}
     */
    content: function()
    {
        return this._content;
    },

    /**
     * @param {string} query
     * @param {boolean} caseSensitive
     * @param {boolean} isRegex
     * @param {function(!Array.<!WebInspector.ContentProvider.SearchMatch>)} callback
     */
    searchInContent: function(query, caseSensitive, isRegex, callback)
    {
        var content = this.content();
        if (content) {
            WebInspector.StaticContentProvider.searchInContent(content, query, caseSensitive, isRegex, callback);
            return;
        }

        this._project.searchInFileContent(this, query, caseSensitive, isRegex, callback);
    },

    /**
     * @param {?string} content
     */
    _fireContentAvailable: function(content)
    {
        this._contentLoaded = true;
        this._content = content;

        var callbacks = this._requestContentCallbacks.slice();
        this._requestContentCallbacks = [];
        for (var i = 0; i < callbacks.length; ++i)
            callbacks[i](content);
    },

    /**
     * @return {boolean}
     */
    contentLoaded: function()
    {
        return this._contentLoaded;
    },

    /**
     * @param {number} lineNumber
     * @param {number=} columnNumber
     * @return {!WebInspector.UILocation}
     */
    uiLocation: function(lineNumber, columnNumber)
    {
        if (typeof columnNumber === "undefined")
            columnNumber = 0;
        return new WebInspector.UILocation(this, lineNumber, columnNumber);
    },

    __proto__: WebInspector.Object.prototype
}

/**
 * @constructor
 * @param {!WebInspector.UISourceCode} uiSourceCode
 * @param {number} lineNumber
 * @param {number} columnNumber
 */
WebInspector.UILocation = function(uiSourceCode, lineNumber, columnNumber)
{
    this.uiSourceCode = uiSourceCode;
    this.lineNumber = lineNumber;
    this.columnNumber = columnNumber;
}

WebInspector.UILocation.prototype = {
    /**
     * @return {string}
     */
    linkText: function()
    {
        var linkText = this.uiSourceCode.displayName();
        if (typeof this.lineNumber === "number")
            linkText += ":" + (this.lineNumber + 1);
        return linkText;
    },

    /**
     * @return {string}
     */
    id: function()
    {
        return this.uiSourceCode.uri() + ":" + this.lineNumber + ":" + this.columnNumber;
    },
}

/**
 * @constructor
 * @implements {WebInspector.ContentProvider}
 * @param {!WebInspector.UISourceCode} uiSourceCode
 * @param {?string|undefined} content
 * @param {!Date} timestamp
 */
WebInspector.Revision = function(uiSourceCode, content, timestamp)
{
    this._uiSourceCode = uiSourceCode;
    this._content = content;
    this._timestamp = timestamp;
}

WebInspector.Revision.prototype = {
    /**
     * @return {!WebInspector.UISourceCode}
     */
    get uiSourceCode()
    {
        return this._uiSourceCode;
    },

    /**
     * @return {!Date}
     */
    get timestamp()
    {
        return this._timestamp;
    },

    /**
     * @return {?string}
     */
    get content()
    {
        return this._content || null;
    },

    revertToThis: function()
    {
        /**
         * @param {string} content
         * @this {WebInspector.Revision}
         */
        function revert(content)
        {
            if (this._uiSourceCode._content !== content)
                this._uiSourceCode.addRevision(content);
        }
        this.requestContent(revert.bind(this));
    },

    /**
     * @return {string}
     */
    contentURL: function()
    {
        return this._uiSourceCode.originURL();
    },

    /**
     * @return {!WebInspector.ResourceType}
     */
    contentType: function()
    {
        return this._uiSourceCode.contentType();
    },

    /**
     * @param {function(string)} callback
     */
    requestContent: function(callback)
    {
        callback(this._content || "");
    },

    /**
     * @param {string} query
     * @param {boolean} caseSensitive
     * @param {boolean} isRegex
     * @param {function(!Array.<!WebInspector.ContentProvider.SearchMatch>)} callback
     */
    searchInContent: function(query, caseSensitive, isRegex, callback)
    {
        callback([]);
    }
}
