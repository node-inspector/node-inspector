/*
 * Copyright (C) 2010 Google Inc. All rights reserved.
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

WebInspector.FileSystem = {}

// Keep in sync with Type in AsyncFileSystem.h
WebInspector.FileSystem.TEMPORARY = 0;
WebInspector.FileSystem.PERSISTENT = 1;

WebInspector.FileSystem.getFileSystemPathsAsync = function(origin)
{
    InspectorBackend.getFileSystemPathAsync(WebInspector.FileSystem.PERSISTENT, origin);
    InspectorBackend.getFileSystemPathAsync(WebInspector.FileSystem.TEMPORARY, origin);
}

WebInspector.FileSystemView = function(treeElement, fileSystemOrigin)
{
    WebInspector.View.call(this);

    this.element.addStyleClass("resource-view");
    this._treeElement = treeElement;
    this._origin = fileSystemOrigin;
    this._tabbedPane = new WebInspector.TabbedPane(this.element);

    this._persistentFileSystemElement = document.createElement("div");
    this._persistentFileSystemElement.className = "resource-view-headers";
    this._tabbedPane.appendTab("persistent", WebInspector.UIString("Persistent File System"), this._persistentFileSystemElement, this._selectFileSystemTab.bind(this, true));

    this._tempFileSystemElement = document.createElement("div");
    this._tempFileSystemElement.className = "resource-view-headers";
    this._tabbedPane.appendTab("temp", WebInspector.UIString("Temporary File System"), this._tempFileSystemElement, this.selectTemporaryFileSystemTab.bind(this, true));

    this._temporaryRoot = "";
    this._persistentRoot = "";
    this._isFileSystemDisabled = false;
    this._persistentRootError = false;
    this._temporaryRootError = false;
    this.fileSystemVisible = true;
    this._selectFileSystemTab();
    this.refreshFileSystem();
}

WebInspector.FileSystemView.prototype = {
    show: function(parentElement)
    {
        WebInspector.View.prototype.show.call(this, parentElement);
        this._update();
    },

    set fileSystemVisible(x)
    {
        if (x === this._fileSystemVisible)
            return;
        this._fileSystemVisible = x;
        if (x)
            this.element.addStyleClass("headers-visible");
        else
            this.element.removeStyleClass("headers-visible"); 
        this._selectFileSystemTab();
    },

    _update: function()
    {
        this._selectFileSystemTab();
        WebInspector.FileSystem.getFileSystemPathsAsync(this._origin);
    },

    updateFileSystemPath: function(root, type, origin)
    {
        if (origin == this._origin && type == WebInspector.FileSystem.PERSISTENT) {
            this._persistentRoot = root;
            this._persistentRootError = false;
        }
        
        if (origin == this._origin && type == WebInspector.FileSystem.TEMPORARY) {
            this._temporaryRoot = root;
            this._temporaryRootErrorError = false;
        }

        this.refreshFileSystem();
    },
    
    updateFileSystemError: function(type, origin)
    {
        if (type == WebInspector.FileSystem.PERSISTENT)
            this._persistentRootError = true;
        
        if (type == WebInspector.FileSystem.TEMPORARY)
            this._temporaryRootError = true;

        this.refreshFileSystem();
    },
    
    setFileSystemDisabled: function()
    {
        this._isFileSystemDisabled = true;
        this.refreshFileSystem();
    },
    _selectFileSystemTab: function()
    {
        this._tabbedPane.selectTab("persistent");
    },
    
    selectTemporaryFileSystemTab: function()
    {
        this._tabbedPane.selectTab("temp");
    },

    _revealPersistentFolderInOS: function()
    {
        InspectorBackend.revealFolderInOS(this._persistentRoot);
    },
    
    _revealTemporaryFolderInOS: function()
    {
        InspectorBackend.revealFolderInOS(this._temporaryRoot);
    },
    
    _createTextAndButton: function(fileSystemElement, rootPathText, type, isError)
    {
        fileSystemElement.removeChildren();
        var rootPath = WebInspector.UIString("File System root path not available.");
        if (this._isFileSystemDisabled)
            rootPath = WebInspector.UIString("File System is disabled.");
        else if (isError)
            rootPath = WebInspector.UIString("Error in fetching root path for file system.");
        else if (rootPathText)
            rootPath = rootPathText;

        var rootTextNode = document.createTextNode("Root: " + rootPath.escapeHTML());
        var rootSystemElement = document.createElement("div");
        rootSystemElement.className = "header-value source-code";
        rootSystemElement.appendChild(rootTextNode);
        fileSystemElement.appendChild(rootSystemElement);
            
        if (!isError && rootPathText) {
            // Append Browse button iff root path is available and it is not an error.
            var contentElement = document.createElement("div");
            contentElement.className = "panel-enabler-view-content";
            fileSystemElement.appendChild(contentElement);
            var choicesForm = document.createElement("form");
            contentElement.appendChild(choicesForm);
            var enableButton = document.createElement("button");
            enableButton.setAttribute("type", "button");
            enableButton.textContent = WebInspector.UIString("Reveal folder in OS");
            // FIXME: Bind this directly to InspectorBackend.
            if (type == WebInspector.FileSystem.PERSISTENT)
                enableButton.addEventListener("click", this._revealPersistentFolderInOS.bind(this), false);
            if (type == WebInspector.FileSystem.TEMPORARY)
                enableButton.addEventListener("click", this._revealTemporaryFolderInOS.bind(this), false);
            choicesForm.appendChild(enableButton);
            fileSystemElement.appendChild(contentElement);
        }
    },
    
    refreshFileSystem: function()
    {
        this._createTextAndButton(this._persistentFileSystemElement, this._persistentRoot, WebInspector.FileSystem.PERSISTENT, this._persistentRootError);
        this._createTextAndButton(this._tempFileSystemElement, this._temporaryRoot, WebInspector.FileSystem.TEMPORARY, this._temporaryRootError);
    }, 
}

WebInspector.FileSystemView.prototype.__proto__ = WebInspector.View.prototype;
