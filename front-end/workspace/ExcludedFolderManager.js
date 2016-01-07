// Copyright 2014 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

/**
 * @constructor
 * @extends {WebInspector.Object}
 */
WebInspector.ExcludedFolderManager = function()
{
    WebInspector.Object.call(this);
    this._excludedFoldersSetting = WebInspector.settings.createLocalSetting("workspaceExcludedFolders", {});
    var defaultCommonExcludedFolders = [
        "/\\.git/",
        "/\\.sass-cache/",
        "/\\.hg/",
        "/\\.idea/",
        "/\\.svn/",
        "/\\.cache/",
        "/\\.project/"
    ];
    var defaultWinExcludedFolders = [
        "/Thumbs.db$",
        "/ehthumbs.db$",
        "/Desktop.ini$",
        "/\\$RECYCLE.BIN/"
    ];
    var defaultMacExcludedFolders = [
        "/\\.DS_Store$",
        "/\\.Trashes$",
        "/\\.Spotlight-V100$",
        "/\\.AppleDouble$",
        "/\\.LSOverride$",
        "/Icon$",
        "/\\._.*$"
    ];
    var defaultLinuxExcludedFolders = [
        "/.*~$"
    ];
    var defaultExcludedFolders = defaultCommonExcludedFolders;
    if (WebInspector.isWin())
        defaultExcludedFolders = defaultExcludedFolders.concat(defaultWinExcludedFolders);
    else if (WebInspector.isMac())
        defaultExcludedFolders = defaultExcludedFolders.concat(defaultMacExcludedFolders);
    else
        defaultExcludedFolders = defaultExcludedFolders.concat(defaultLinuxExcludedFolders);
    var defaultExcludedFoldersPattern = defaultExcludedFolders.join("|");
    this._workspaceFolderExcludePatternSetting = WebInspector.settings.createRegExpSetting("workspaceFolderExcludePattern", defaultExcludedFoldersPattern, WebInspector.isWin() ? "i" : "");
    /** @type {!Object.<string, !Array.<!WebInspector.ExcludedFolderManager.Entry>>} */
    this._excludedFolders = {};
    this._loadFromSettings();
}

WebInspector.ExcludedFolderManager.Events = {
    ExcludedFolderAdded: "ExcludedFolderAdded",
    ExcludedFolderRemoved: "ExcludedFolderRemoved"
}

WebInspector.ExcludedFolderManager.prototype = {
    /**
     * @return {!WebInspector.Setting}
     */
    workspaceFolderExcludePatternSetting: function()
    {
        return this._workspaceFolderExcludePatternSetting;
    },

    _loadFromSettings: function()
    {
        var savedExcludedFolders = this._excludedFoldersSetting.get();
        this._excludedFolders = {};
        for (var fileSystemPath in savedExcludedFolders) {
            var savedExcludedFoldersForPath = savedExcludedFolders[fileSystemPath];

            this._excludedFolders[fileSystemPath] = [];
            var excludedFolders = this._excludedFolders[fileSystemPath];

            for (var i = 0; i < savedExcludedFoldersForPath.length; ++i) {
                var savedEntry = savedExcludedFoldersForPath[i];
                var entry = new WebInspector.ExcludedFolderManager.Entry(savedEntry.fileSystemPath, savedEntry.path);
                excludedFolders.push(entry);
            }
        }
    },

    _saveToSettings: function()
    {
        var savedExcludedFolders = this._excludedFolders;
        this._excludedFoldersSetting.set(savedExcludedFolders);
    },

    /**
     * @param {string} fileSystemPath
     * @param {string} excludedFolderPath
     */
    addExcludedFolder: function(fileSystemPath, excludedFolderPath)
    {
        if (!this._excludedFolders[fileSystemPath])
            this._excludedFolders[fileSystemPath] = [];
        var entry = new WebInspector.ExcludedFolderManager.Entry(fileSystemPath, excludedFolderPath);
        this._excludedFolders[fileSystemPath].push(entry);
        this._saveToSettings();
        this.dispatchEventToListeners(WebInspector.ExcludedFolderManager.Events.ExcludedFolderAdded, entry);
    },

    /**
     * @param {string} fileSystemPath
     * @param {string} path
     */
    removeExcludedFolder: function(fileSystemPath, path)
    {
        var entry = this._excludedFolderEntryForPath(fileSystemPath, path);
        if (!entry)
            return;
        this._excludedFolders[fileSystemPath].remove(entry);
        this._saveToSettings();
        this.dispatchEventToListeners(WebInspector.ExcludedFolderManager.Events.ExcludedFolderRemoved, entry);
    },

    /**
     * @param {string} fileSystemPath
     */
    removeFileSystem: function(fileSystemPath)
    {
        delete this._excludedFolders[fileSystemPath];
        this._saveToSettings();
    },

    /**
     * @param {string} fileSystemPath
     * @param {string} path
     * @return {?WebInspector.ExcludedFolderManager.Entry}
     */
    _excludedFolderEntryForPath: function(fileSystemPath, path)
    {
        var entries = this._excludedFolders[fileSystemPath];
        if (!entries)
            return null;

        for (var i = 0; i < entries.length; ++i) {
            if (entries[i].path === path)
                return entries[i];
        }
        return null;
    },

    /**
     * @param {string} fileSystemPath
     * @param {string} folderPath
     * @return {boolean}
     */
    isFileExcluded: function(fileSystemPath, folderPath)
    {
        var excludedFolders = this._excludedFolders[fileSystemPath] || [];
        for (var i = 0; i < excludedFolders.length; ++i) {
            var entry = excludedFolders[i];
            if (entry.path === folderPath)
                return true;
        }
        var regex = this._workspaceFolderExcludePatternSetting.asRegExp();
        return !!(regex && regex.test(folderPath));
    },

    /**
     * @param {string} fileSystemPath
     * @return {!Array.<!WebInspector.ExcludedFolderManager.Entry>}
     */
    excludedFolders: function(fileSystemPath)
    {
        var excludedFolders = this._excludedFolders[fileSystemPath];
        return excludedFolders ? excludedFolders.slice() : [];
    },

    __proto__: WebInspector.Object.prototype
}

/**
 * @constructor
 * @param {string} fileSystemPath
 * @param {string} path
 */
WebInspector.ExcludedFolderManager.Entry = function(fileSystemPath, path)
{
    this.fileSystemPath = fileSystemPath;
    this.path = path;
}
