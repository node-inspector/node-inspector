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
 * @extends {WebInspector.DialogDelegate}
 * @param {string} fileSystemPath
 */
WebInspector.EditFileSystemDialog = function(fileSystemPath)
{
    WebInspector.DialogDelegate.call(this);
    this._fileSystemPath = fileSystemPath;

    this.element = document.createElement("div");
    this.element.className = "edit-file-system-dialog";

    var header = this.element.createChild("div", "header");
    var headerText = header.createChild("span");
    headerText.textContent = "Edit file system";

    var closeButton = header.createChild("div", "close-button-gray done-button");
    closeButton.addEventListener("click", this._onDoneClick.bind(this), false);

    var contents = this.element.createChild("div", "contents");

    WebInspector.isolatedFileSystemManager.mapping().addEventListener(WebInspector.FileSystemMapping.Events.FileMappingAdded, this._fileMappingAdded, this);
    WebInspector.isolatedFileSystemManager.mapping().addEventListener(WebInspector.FileSystemMapping.Events.FileMappingRemoved, this._fileMappingRemoved, this);
    WebInspector.isolatedFileSystemManager.mapping().addEventListener(WebInspector.FileSystemMapping.Events.ExcludedFolderAdded, this._excludedFolderAdded, this);
    WebInspector.isolatedFileSystemManager.mapping().addEventListener(WebInspector.FileSystemMapping.Events.ExcludedFolderRemoved, this._excludedFolderRemoved, this);

    var blockHeader = contents.createChild("div", "block-header");
    blockHeader.textContent = "Mappings";
    this._fileMappingsSection = contents.createChild("div", "file-mappings-section");
    this._fileMappingsListContainer = this._fileMappingsSection.createChild("div", "settings-list-container");
    var entries = WebInspector.isolatedFileSystemManager.mapping().mappingEntries(this._fileSystemPath);

    this._fileMappingsList = new WebInspector.EditableSettingsList(["url", "path"], this._fileMappingValuesProvider.bind(this), this._fileMappingValidate.bind(this), this._fileMappingEdit.bind(this));
    this._fileMappingsList.addEventListener(WebInspector.SettingsList.Events.Removed, this._fileMappingRemovedfromList.bind(this));

    this._fileMappingsList.element.addStyleClass("file-mappings-list");
    this._fileMappingsListContainer.appendChild(this._fileMappingsList.element);

    this._entries = {};
    for (var i = 0; i < entries.length; ++i)
        this._addMappingRow(entries[i]);

    blockHeader = contents.createChild("div", "block-header");
    blockHeader.textContent = "Excluded folders";
    this._excludedFolderListSection = contents.createChild("div", "excluded-folders-section");
    this._excludedFolderListContainer = this._excludedFolderListSection.createChild("div", "settings-list-container");
    var excludedFolderEntries = WebInspector.isolatedFileSystemManager.mapping().excludedFolders(fileSystemPath);

    this._excludedFolderList = new WebInspector.EditableSettingsList(["path"], this._excludedFolderValueProvider.bind(this), this._excludedFolderValidate.bind(this), this._excludedFolderEdit.bind(this));
    this._excludedFolderList.addEventListener(WebInspector.SettingsList.Events.Removed, this._excludedFolderRemovedfromList.bind(this));
    this._excludedFolderList.element.addStyleClass("excluded-folders-list");
    this._excludedFolderListContainer.appendChild(this._excludedFolderList.element);
    this._excludedFolderEntries = new StringMap();
    for (var i = 0; i < excludedFolderEntries.length; ++i)
        this._addExcludedFolderRow(excludedFolderEntries[i]);

    this.element.tabIndex = 0;
}

WebInspector.EditFileSystemDialog.show = function(element, fileSystemPath)
{
    WebInspector.Dialog.show(element, new WebInspector.EditFileSystemDialog(fileSystemPath));
    var glassPane = document.getElementById("glass-pane");
    glassPane.addStyleClass("settings-glass-pane");
}

WebInspector.EditFileSystemDialog.prototype = {
    /**
     * @param {Element} element
     */
    show: function(element)
    {
        element.appendChild(this.element);
        this.element.addStyleClass("dialog-contents");
        element.addStyleClass("settings-dialog");
        element.addStyleClass("settings-tab");
        this._dialogElement = element;
    },

    _resize: function()
    {
        if (!this._dialogElement)
            return;

        const width = 540;
        const minHeight = 150;
        var maxHeight = document.body.offsetHeight - 10;
        maxHeight = Math.max(minHeight, maxHeight);
        this._dialogElement.style.maxHeight = maxHeight + "px";
        this._dialogElement.style.width = width + "px";
    },

    /**
     * @param {Element} element
     * @param {Element} relativeToElement
     */
    position: function(element, relativeToElement)
    {
        this._resize();
    },

    willHide: function(event)
    {
    },

    _fileMappingAdded: function(event)
    {
        var entry = /** @type {WebInspector.FileSystemMapping.Entry} */ (event.data);
        this._addMappingRow(entry);
    },

    _fileMappingRemoved: function(event)
    {
        var entry = /** @type {WebInspector.FileSystemMapping.Entry} */ (event.data);
        if (this._fileSystemPath !== entry.fileSystemPath)
            return;
        delete this._entries[entry.urlPrefix];
        if (this._fileMappingsList.itemForId(entry.urlPrefix))
            this._fileMappingsList.removeItem(entry.urlPrefix);
        this._resize();
    },

    _fileMappingValuesProvider: function(itemId, columnId)
    {
        if (!itemId)
            return "";
        var entry = this._entries[itemId];
        switch (columnId) {
        case "url":
            return entry.urlPrefix;
        case "path":
            return entry.pathPrefix;
        default:
            console.assert("Should not be reached.");
        }
        return "";
    },

    /**
     * @param {?string} itemId
     * @param {Object} data
     */
    _fileMappingValidate: function(itemId, data)
    {
        var oldPathPrefix = itemId ? this._entries[itemId].pathPrefix : null;
        return this._validateMapping(data["url"], itemId, data["path"], oldPathPrefix);
    },

    /**
     * @param {?string} itemId
     * @param {Object} data
     */
    _fileMappingEdit: function(itemId, data)
    {
        if (itemId) {
            var urlPrefix = itemId;
            var pathPrefix = this._entries[itemId].pathPrefix;
            var fileSystemPath = this._entries[itemId].fileSystemPath;
            WebInspector.isolatedFileSystemManager.mapping().removeFileMapping(fileSystemPath, urlPrefix, pathPrefix);
        }
        this._addFileMapping(data["url"], data["path"]);
    },

    /**
     * @param {string} urlPrefix
     * @param {?string} allowedURLPrefix
     * @param {string} path
     * @param {?string} allowedPathPrefix
     */
    _validateMapping: function(urlPrefix, allowedURLPrefix, path, allowedPathPrefix)
    {
        var columns = [];
        if (!this._checkURLPrefix(urlPrefix, allowedURLPrefix))
            columns.push("url");
        if (!this._checkPathPrefix(path, allowedPathPrefix))
            columns.push("path");
        return columns;
    },

    /**
     * @param {WebInspector.Event} event
     */
    _fileMappingRemovedfromList: function(event)
    {
        var urlPrefix = /** @type{?string} */ (event.data);
        if (!urlPrefix)
            return;

        var entry = this._entries[urlPrefix];
        WebInspector.isolatedFileSystemManager.mapping().removeFileMapping(entry.fileSystemPath, entry.urlPrefix, entry.pathPrefix);
    },

    /**
     * @param {string} urlPrefix
     * @param {string} pathPrefix
     * @return {boolean}
     */
    _addFileMapping: function(urlPrefix, pathPrefix)
    {
        var normalizedURLPrefix = this._normalizePrefix(urlPrefix);
        var normalizedPathPrefix = this._normalizePrefix(pathPrefix);
        WebInspector.isolatedFileSystemManager.mapping().addFileMapping(this._fileSystemPath, normalizedURLPrefix, normalizedPathPrefix);
        this._fileMappingsList.selectItem(normalizedURLPrefix);
        return true;
    },

    /**
     * @param {string} prefix
     * @return {string}
     */
    _normalizePrefix: function(prefix)
    {
        if (!prefix)
            return "";
        return prefix + (prefix[prefix.length - 1] === "/" ? "" : "/");
    },

    _addMappingRow: function(entry)
    {
        var fileSystemPath = entry.fileSystemPath;
        var urlPrefix = entry.urlPrefix;
        if (!this._fileSystemPath || this._fileSystemPath !== fileSystemPath)
            return;

        this._entries[urlPrefix] = entry;
        var fileMappingListItem = this._fileMappingsList.addItem(urlPrefix, null);
        this._resize();
    },

    _excludedFolderAdded: function(event)
    {
        var entry = /** @type {WebInspector.FileSystemMapping.ExcludedFolderEntry} */ (event.data);
        this._addExcludedFolderRow(entry);
    },

    _excludedFolderRemoved: function(event)
    {
        var entry = /** @type {WebInspector.FileSystemMapping.ExcludedFolderEntry} */ (event.data);
        var fileSystemPath = entry.fileSystemPath;
        if (!fileSystemPath || this._fileSystemPath !== fileSystemPath)
            return;
        delete this._excludedFolderEntries[entry.path];
        if (this._excludedFolderList.itemForId(entry.path))
            this._excludedFolderList.removeItem(entry.path);
    },

    _excludedFolderValueProvider: function(itemId, columnId)
    {
        return itemId;
    },

    /**
     * @param {?string} itemId
     * @param {Object} data
     */
    _excludedFolderValidate: function(itemId, data)
    {
        var fileSystemPath = this._fileSystemPath;
        var columns = [];
        if (!this._validateExcludedFolder(data["path"], itemId))
            columns.push("path");
        return columns;
    },

    /**
     * @param {string} path
     * @param {?string} allowedPath
     * @return {boolean}
     */
    _validateExcludedFolder: function(path, allowedPath)
    {
        return !!path && (path === allowedPath || !this._excludedFolderEntries.contains(path));
    },

    /**
     * @param {?string} itemId
     * @param {Object} data
     */
    _excludedFolderEdit: function(itemId, data)
    {
        var fileSystemPath = this._fileSystemPath;
        if (itemId)
            WebInspector.isolatedFileSystemManager.mapping().removeExcludedFolder(fileSystemPath, itemId);
        var excludedFolderPath = data["path"];
        WebInspector.isolatedFileSystemManager.mapping().addExcludedFolder(fileSystemPath, excludedFolderPath);
    },

    /**
     * @param {WebInspector.Event} event
     */
    _excludedFolderRemovedfromList: function(event)
    {
        var itemId = /** @type{?string} */ (event.data);
        if (!itemId)
            return;
        WebInspector.isolatedFileSystemManager.mapping().removeExcludedFolder(this._fileSystemPath, itemId);
    },

    /**
     * @param {WebInspector.FileSystemMapping.ExcludedFolderEntry} entry
     */
    _addExcludedFolderRow: function(entry)
    {
        var fileSystemPath = entry.fileSystemPath;
        if (!fileSystemPath || this._fileSystemPath !== fileSystemPath)
            return;
        var path = entry.path;
        this._excludedFolderEntries.put(path, entry);
        this._excludedFolderList.addItem(path, null);
    },

    /**
     * @param {string} value
     * @param {?string} allowedPrefix
     * @return {boolean}
     */
    _checkURLPrefix: function(value, allowedPrefix)
    {
        var prefix = this._normalizePrefix(value);
        return !!prefix && (prefix === allowedPrefix || !this._entries[prefix]);
    },

    /**
     * @param {string} value
     * @param {?string} allowedPrefix
     * @return {boolean}
     */
    _checkPathPrefix: function(value, allowedPrefix)
    {
        var prefix = this._normalizePrefix(value);
        if (!prefix)
            return false;
        if (prefix === allowedPrefix)
            return true;
        for (var urlPrefix in this._entries) {
            var entry = this._entries[urlPrefix];
            if (urlPrefix && entry.pathPrefix === prefix)
                return false;
        }
        return true;
    },

    focus: function()
    {
        WebInspector.setCurrentFocusElement(this.element);
    },

    _onDoneClick: function()
    {
        WebInspector.Dialog.hide();
    },

    onEnter: function()
    {
    },

    __proto__: WebInspector.DialogDelegate.prototype
}
