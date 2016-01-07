/*
 * Copyright (C) 2009 Google Inc. All rights reserved.
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
 * @param {!Object<string, string>} prefs
 */
WebInspector.Settings = function(prefs)
{
    this._settingsStorage = prefs;
    this._eventSupport = new WebInspector.Object();
    /** @type {!Map<string, !WebInspector.Setting>} */
    this._registry = new Map();
    /** @type {!Map<string, !WebInspector.Setting>} */
    this._moduleSettings = new Map();
    self.runtime.extensions("setting").forEach(this._registerModuleSetting.bind(this));
}

WebInspector.Settings.prototype = {
    /**
     * @param {!Runtime.Extension} extension
     */
    _registerModuleSetting: function(extension)
    {
        var descriptor = extension.descriptor();
        var settingName = descriptor["settingName"];
        var settingType = descriptor["settingType"];
        var defaultValue = descriptor["defaultValue"];
        var isLocal = !!descriptor["local"];
        var setting = settingType === "regex" ? this.createRegExpSetting(settingName, defaultValue, undefined, isLocal) : this.createSetting(settingName, defaultValue, isLocal);
        this._moduleSettings.set(settingName, setting);
    },

    /**
     * @param {string} settingName
     * @return {!WebInspector.Setting}
     */
    moduleSetting: function(settingName)
    {
        var setting = this._moduleSettings.get(settingName);
        if (!setting)
            throw new Error("No setting registered: " + settingName);
        return setting;
    },

    /**
     * @param {string} settingName
     * @return {!WebInspector.Setting}
     */
    settingForTest: function(settingName)
    {
        var setting = this._registry.get(settingName);
        if (!setting)
            throw new Error("No setting registered: " + settingName);
        return setting;
    },

    /**
     * @param {string} key
     * @param {*} defaultValue
     * @param {boolean=} isLocal
     * @return {!WebInspector.Setting}
     */
    createSetting: function(key, defaultValue, isLocal)
    {
        if (!this._registry.get(key))
            this._registry.set(key, new WebInspector.Setting(this, key, defaultValue, this._eventSupport, isLocal ? (window.localStorage || {}) : this._settingsStorage));
        return /** @type {!WebInspector.Setting} */ (this._registry.get(key));
    },

    /**
     * @param {string} key
     * @param {*} defaultValue
     * @return {!WebInspector.Setting}
     */
    createLocalSetting: function(key, defaultValue)
    {
        return this.createSetting(key, defaultValue, true);
    },

    /**
     * @param {string} key
     * @param {string} defaultValue
     * @param {string=} regexFlags
     * @param {boolean=} isLocal
     * @return {!WebInspector.RegExpSetting}
     */
    createRegExpSetting: function(key, defaultValue, regexFlags, isLocal)
    {
        if (!this._registry.get(key))
            this._registry.set(key, new WebInspector.RegExpSetting(this, key, defaultValue, this._eventSupport, isLocal ? (window.localStorage || {}) : this._settingsStorage, regexFlags));
        return /** @type {!WebInspector.RegExpSetting} */ (this._registry.get(key));
    },

    clearAll: function()
    {
        if (window.localStorage)
            window.localStorage.clear();
        for (var key in this._settingsStorage)
            delete this._settingsStorage[key];
        var versionSetting = WebInspector.settings.createSetting(WebInspector.VersionController._currentVersionName, 0);
        versionSetting.set(WebInspector.VersionController.currentVersion);
    }
}

/**
 * @constructor
 * @param {!WebInspector.Settings} settings
 * @param {string} name
 * @param {V} defaultValue
 * @param {!WebInspector.Object} eventSupport
 * @param {!Object} storage
 * @template V
 */
WebInspector.Setting = function(settings, name, defaultValue, eventSupport, storage)
{
    this._settings = settings;
    this._name = name;
    this._defaultValue = defaultValue;
    this._eventSupport = eventSupport;
    this._storage = storage;
}

WebInspector.Setting.prototype = {
    /**
     * @param {function(!WebInspector.Event)} listener
     * @param {!Object=} thisObject
     */
    addChangeListener: function(listener, thisObject)
    {
        this._eventSupport.addEventListener(this._name, listener, thisObject);
    },

    /**
     * @param {function(!WebInspector.Event)} listener
     * @param {!Object=} thisObject
     */
    removeChangeListener: function(listener, thisObject)
    {
        this._eventSupport.removeEventListener(this._name, listener, thisObject);
    },

    get name()
    {
        return this._name;
    },

    /**
     * @return {V}
     */
    get: function()
    {
        if (typeof this._value !== "undefined")
            return this._value;

        this._value = this._defaultValue;
        if (this._name in this._storage) {
            try {
                this._value = JSON.parse(this._storage[this._name]);
            } catch(e) {
                this.remove();
            }
        }
        return this._value;
    },

    /**
     * @param {V} value
     */
    set: function(value)
    {
        this._value = value;
        try {
            var settingString = JSON.stringify(value);
            try {
                this._storage[this._name] = settingString;
            } catch(e) {
                this._printSettingsSavingError(e.message, this._name, settingString);
            }
        } catch(e) {
            WebInspector.console.error("Cannot stringify setting with name: " + this._name + ", error: " + e.message);
        }
        this._eventSupport.dispatchEventToListeners(this._name, value);
    },

    remove: function()
    {
        this._settings._registry.delete(this._name);
        this._settings._moduleSettings.delete(this._name);
        delete this._storage[this._name];
    },

    /**
     * @param {string} message
     * @param {string} name
     * @param {string} value
     */
    _printSettingsSavingError: function(message, name, value)
    {
        var errorMessage = "Error saving setting with name: " + this._name + ", value length: " + value.length + ". Error: " + message;
        console.error(errorMessage);
        WebInspector.console.error(errorMessage);
        WebInspector.console.log("Ten largest settings: ");

        var sizes = { __proto__: null };
        for (var key in this._storage)
            sizes[key] = this._storage[key].length;
        var keys = Object.keys(sizes);

        function comparator(key1, key2)
        {
            return sizes[key2] - sizes[key1];
        }

        keys.sort(comparator);

        for (var i = 0; i < 10 && i < keys.length; ++i)
            WebInspector.console.log("Setting: '" + keys[i] + "', size: " + sizes[keys[i]]);
    }
}

/**
 * @constructor
 * @extends {WebInspector.Setting}
 * @param {!WebInspector.Settings} settings
 * @param {string} name
 * @param {string} defaultValue
 * @param {!WebInspector.Object} eventSupport
 * @param {!Object<string, string>} storage
 * @param {string=} regexFlags
 */
WebInspector.RegExpSetting = function(settings, name, defaultValue, eventSupport, storage, regexFlags)
{
    WebInspector.Setting.call(this, settings, name, defaultValue ? [{ pattern: defaultValue }] : [], eventSupport, storage);
    this._regexFlags = regexFlags;
}

WebInspector.RegExpSetting.prototype = {
    /**
     * @override
     * @return {string}
     */
    get: function()
    {
        var result = [];
        var items = this.getAsArray();
        for (var i = 0; i < items.length; ++i) {
            var item = items[i];
            if (item.pattern && !item.disabled)
                result.push(item.pattern);
        }
        return result.join("|");
    },

    /**
     * @return {!Array.<{pattern: string, disabled: (boolean|undefined)}>}
     */
    getAsArray: function()
    {
        return WebInspector.Setting.prototype.get.call(this);
    },

    /**
     * @override
     * @param {string} value
     */
    set: function(value)
    {
        this.setAsArray([{ pattern: value }]);
    },

    /**
     * @param {!Array.<{pattern: string, disabled: (boolean|undefined)}>} value
     */
    setAsArray: function(value)
    {
        delete this._regex;
        WebInspector.Setting.prototype.set.call(this, value);
    },

    /**
     * @return {?RegExp}
     */
    asRegExp: function()
    {
        if (typeof this._regex !== "undefined")
            return this._regex;
        this._regex = null;
        try {
            var pattern = this.get();
            if (pattern)
                this._regex = new RegExp(pattern, this._regexFlags || "");
        } catch (e) {
        }
        return this._regex;
    },

    __proto__: WebInspector.Setting.prototype
}

/**
 * @constructor
 */
WebInspector.VersionController = function()
{
}

WebInspector.VersionController._currentVersionName = "inspectorVersion";
WebInspector.VersionController.currentVersion = 14;

WebInspector.VersionController.prototype = {
    updateVersion: function()
    {
        var localStorageVersion = window.localStorage ? window.localStorage[WebInspector.VersionController._currentVersionName] : 0;
        var versionSetting = WebInspector.settings.createSetting(WebInspector.VersionController._currentVersionName, 0);
        var currentVersion = WebInspector.VersionController.currentVersion;
        // While localStorage version exists, treat it as the main one. It'll be erased once migrated to prefs.
        var oldVersion = parseInt(localStorageVersion || "0", 10) || versionSetting.get();
        if (oldVersion === 0) {
            // First run, no need to do anything.
            versionSetting.set(currentVersion);
            return;
        }
        var methodsToRun = this._methodsToRunToUpdateVersion(oldVersion, currentVersion);
        for (var i = 0; i < methodsToRun.length; ++i)
            this[methodsToRun[i]].call(this);
        versionSetting.set(currentVersion);
    },

    /**
     * @param {number} oldVersion
     * @param {number} currentVersion
     */
    _methodsToRunToUpdateVersion: function(oldVersion, currentVersion)
    {
        var result = [];
        for (var i = oldVersion; i < currentVersion; ++i)
            result.push("_updateVersionFrom" + i + "To" + (i + 1));
        return result;
    },

    _updateVersionFrom0To1: function()
    {
        this._clearBreakpointsWhenTooMany(WebInspector.settings.createLocalSetting("breakpoints", []), 500000);
    },

    _updateVersionFrom1To2: function()
    {
        WebInspector.settings.createSetting("previouslyViewedFiles", []).set([]);
    },

    _updateVersionFrom2To3: function()
    {
        WebInspector.settings.createSetting("fileSystemMapping", {}).set({});
        WebInspector.settings.createSetting("fileMappingEntries", []).remove();
    },

    _updateVersionFrom3To4: function()
    {
        var advancedMode = WebInspector.settings.createSetting("showHeaSnapshotObjectsHiddenProperties", false);
        WebInspector.moduleSetting("showAdvancedHeapSnapshotProperties").set(advancedMode.get());
        advancedMode.remove();
    },

    _updateVersionFrom4To5: function()
    {
        var settingNames = {
            "FileSystemViewSidebarWidth": "fileSystemViewSplitViewState",
            "elementsSidebarWidth": "elementsPanelSplitViewState",
            "StylesPaneSplitRatio": "stylesPaneSplitViewState",
            "heapSnapshotRetainersViewSize": "heapSnapshotSplitViewState",
            "InspectorView.splitView": "InspectorView.splitViewState",
            "InspectorView.screencastSplitView": "InspectorView.screencastSplitViewState",
            "Inspector.drawerSplitView": "Inspector.drawerSplitViewState",
            "layerDetailsSplitView": "layerDetailsSplitViewState",
            "networkSidebarWidth": "networkPanelSplitViewState",
            "sourcesSidebarWidth": "sourcesPanelSplitViewState",
            "scriptsPanelNavigatorSidebarWidth": "sourcesPanelNavigatorSplitViewState",
            "sourcesPanelSplitSidebarRatio": "sourcesPanelDebuggerSidebarSplitViewState",
            "timeline-details": "timelinePanelDetailsSplitViewState",
            "timeline-split": "timelinePanelRecorsSplitViewState",
            "timeline-view": "timelinePanelTimelineStackSplitViewState",
            "auditsSidebarWidth": "auditsPanelSplitViewState",
            "layersSidebarWidth": "layersPanelSplitViewState",
            "profilesSidebarWidth": "profilesPanelSplitViewState",
            "resourcesSidebarWidth": "resourcesPanelSplitViewState"
        };
        var empty = {};
        for (var oldName in settingNames) {
            var newName = settingNames[oldName];
            var oldNameH = oldName + "H";

            var newValue = null;
            var oldSetting = WebInspector.settings.createSetting(oldName, empty);
            if (oldSetting.get() !== empty) {
                newValue = newValue || {};
                newValue.vertical = {};
                newValue.vertical.size = oldSetting.get();
                oldSetting.remove();
            }
            var oldSettingH = WebInspector.settings.createSetting(oldNameH, empty);
            if (oldSettingH.get() !== empty) {
                newValue = newValue || {};
                newValue.horizontal = {};
                newValue.horizontal.size = oldSettingH.get();
                oldSettingH.remove();
            }
            if (newValue)
                WebInspector.settings.createSetting(newName, {}).set(newValue);
        }
    },

    _updateVersionFrom5To6: function()
    {
        var settingNames = {
            "debuggerSidebarHidden": "sourcesPanelSplitViewState",
            "navigatorHidden": "sourcesPanelNavigatorSplitViewState",
            "WebInspector.Drawer.showOnLoad": "Inspector.drawerSplitViewState"
        };

        for (var oldName in settingNames) {
            var oldSetting = WebInspector.settings.createSetting(oldName, null);
            if (oldSetting.get() === null) {
                oldSetting.remove();
                continue;
            }

            var newName = settingNames[oldName];
            var invert = "WebInspector.Drawer.showOnLoad" === oldName;
            var hidden = oldSetting.get() !== invert;
            oldSetting.remove();
            var showMode = hidden ? "OnlyMain" : "Both";

            var newSetting = WebInspector.settings.createSetting(newName, {});
            var newValue = newSetting.get() || {};
            newValue.vertical = newValue.vertical || {};
            newValue.vertical.showMode = showMode;
            newValue.horizontal = newValue.horizontal || {};
            newValue.horizontal.showMode = showMode;
            newSetting.set(newValue);
        }
    },

    _updateVersionFrom6To7: function()
    {
        var settingNames = {
            "sourcesPanelNavigatorSplitViewState": "sourcesPanelNavigatorSplitViewState",
            "elementsPanelSplitViewState": "elementsPanelSplitViewState",
            "stylesPaneSplitViewState": "stylesPaneSplitViewState",
            "sourcesPanelDebuggerSidebarSplitViewState": "sourcesPanelDebuggerSidebarSplitViewState"
        };

        var empty = {};
        for (var name in settingNames) {
            var setting = WebInspector.settings.createSetting(name, empty);
            var value = setting.get();
            if (value === empty)
                continue;
            // Zero out saved percentage sizes, and they will be restored to defaults.
            if (value.vertical && value.vertical.size && value.vertical.size < 1)
                value.vertical.size = 0;
            if (value.horizontal && value.horizontal.size && value.horizontal.size < 1)
                value.horizontal.size = 0;
            setting.set(value);
        }
    },

    _updateVersionFrom7To8: function()
    {
    },

    _updateVersionFrom8To9: function()
    {
        var settingNames = [
            "skipStackFramesPattern",
            "workspaceFolderExcludePattern"
        ];

        for (var i = 0; i < settingNames.length; ++i) {
            var setting = WebInspector.settings.createSetting(settingNames[i], "");
            var value = setting.get();
            if (!value)
                return;
            if (typeof value === "string")
                value = [value];
            for (var j = 0; j < value.length; ++j) {
                if (typeof value[j] === "string")
                    value[j] = { pattern: value[j] };
            }
            setting.set(value);
        }
    },

    _updateVersionFrom9To10: function()
    {
        // This one is localStorage specific, which is fine.
        if (!window.localStorage)
            return;
        for (var key in window.localStorage) {
            if (key.startsWith("revision-history"))
                window.localStorage.removeItem(key);
        }
    },

    _updateVersionFrom10To11: function()
    {
        var oldSettingName = "customDevicePresets";
        var newSettingName = "customEmulatedDeviceList";
        var oldSetting = WebInspector.settings.createSetting(oldSettingName, undefined);
        var list = oldSetting.get();
        if (!Array.isArray(list))
            return;
        var newList = [];
        for (var i = 0; i < list.length; ++i) {
            var value = list[i];
            var device = {};
            device["title"] = value["title"];
            device["type"] = "unknown";
            device["user-agent"] = value["userAgent"];
            device["capabilities"] = [];
            if (value["touch"])
                device["capabilities"].push("touch");
            if (value["mobile"])
                device["capabilities"].push("mobile");
            device["screen"] = {};
            device["screen"]["vertical"] = {width: value["width"], height: value["height"]};
            device["screen"]["horizontal"] = {width: value["height"], height: value["width"]};
            device["screen"]["device-pixel-ratio"] = value["deviceScaleFactor"];
            device["modes"] = [];
            device["show-by-default"] = true;
            device["show"] = "Default";
            newList.push(device);
        }
        if (newList.length)
            WebInspector.settings.createSetting(newSettingName, []).set(newList);
        oldSetting.remove();
    },

    _updateVersionFrom11To12: function()
    {
        this._migrateSettingsFromLocalStorage();
    },

    _updateVersionFrom12To13: function()
    {
        this._migrateSettingsFromLocalStorage();
        WebInspector.settings.createSetting("timelineOverviewMode", "").remove();
    },

    _updateVersionFrom13To14: function()
    {
        var defaultValue = { "throughput": -1, "latency": 0 };
        WebInspector.settings.createSetting("networkConditions", defaultValue).set(defaultValue);
    },

    _migrateSettingsFromLocalStorage: function()
    {
        // This step migrates all the settings except for the ones below into the browser profile.
        var localSettings = [ "advancedSearchConfig", "breakpoints", "consoleHistory", "domBreakpoints", "eventListenerBreakpoints",
                              "fileSystemMapping", "lastSelectedSourcesSidebarPaneTab", "previouslyViewedFiles",
                              "savedURLs", "watchExpressions", "workspaceExcludedFolders", "xhrBreakpoints" ].keySet();
        if (!window.localStorage)
            return;

        for (var key in window.localStorage) {
            if (key in localSettings)
                continue;
            var value = window.localStorage[key];
            window.localStorage.removeItem(key);
            WebInspector.settings._settingsStorage[key] = value;
        }
    },

    /**
     * @param {!WebInspector.Setting} breakpointsSetting
     * @param {number} maxBreakpointsCount
     */
    _clearBreakpointsWhenTooMany: function(breakpointsSetting, maxBreakpointsCount)
    {
        // If there are too many breakpoints in a storage, it is likely due to a recent bug that caused
        // periodical breakpoints duplication leading to inspector slowness.
        if (breakpointsSetting.get().length > maxBreakpointsCount)
            breakpointsSetting.set([]);
    }
}

/**
 * @type {!WebInspector.Settings}
 */
WebInspector.settings;

/**
 * @param {string} settingName
 * @return {!WebInspector.Setting}
 */
WebInspector.moduleSetting = function(settingName)
{
    return WebInspector.settings.moduleSetting(settingName);
}

/**
 * @param {string} settingName
 * @return {!WebInspector.Setting}
 */
WebInspector.settingForTest = function(settingName)
{
    return WebInspector.settings.settingForTest(settingName);
}
