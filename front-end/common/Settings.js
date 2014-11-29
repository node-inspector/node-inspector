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
 */
WebInspector.Settings = function()
{
    this._eventSupport = new WebInspector.Object();
    this._registry = /** @type {!Object.<string, !WebInspector.Setting>} */ ({});

    this.colorFormat = this.createSetting("colorFormat", "original");
    this.consoleHistory = this.createSetting("consoleHistory", []);
    this.domWordWrap = this.createSetting("domWordWrap", true);
    this.eventListenersFilter = this.createSetting("eventListenersFilter", "all");
    this.lastViewedScriptFile = this.createSetting("lastViewedScriptFile", "application");
    this.monitoringXHREnabled = this.createSetting("monitoringXHREnabled", false);
    this.hideNetworkMessages = this.createSetting("hideNetworkMessages", false);
    this.preserveConsoleLog = this.createSetting("preserveConsoleLog", false);
    this.consoleTimestampsEnabled = this.createSetting("consoleTimestampsEnabled", false);
    this.resourcesLargeRows = this.createSetting("resourcesLargeRows", true);
    this.resourcesSortOptions = this.createSetting("resourcesSortOptions", {timeOption: "responseTime", sizeOption: "transferSize"});
    this.resourceViewTab = this.createSetting("resourceViewTab", "preview");
    this.showInheritedComputedStyleProperties = this.createSetting("showInheritedComputedStyleProperties", false);
    this.showUserAgentStyles = this.createSetting("showUserAgentStyles", true);
    this.watchExpressions = this.createSetting("watchExpressions", []);
    this.breakpoints = this.createSetting("breakpoints", []);
    this.eventListenerBreakpoints = this.createSetting("eventListenerBreakpoints", []);
    this.domBreakpoints = this.createSetting("domBreakpoints", []);
    this.xhrBreakpoints = this.createSetting("xhrBreakpoints", []);
    this.jsSourceMapsEnabled = this.createSetting("sourceMapsEnabled", true);
    this.cssSourceMapsEnabled = this.createSetting("cssSourceMapsEnabled", true);
    this.cacheDisabled = this.createSetting("cacheDisabled", false);
    this.showUAShadowDOM = this.createSetting("showUAShadowDOM", false);
    this.savedURLs = this.createSetting("savedURLs", {});
    this.javaScriptDisabled = this.createSetting("javaScriptDisabled", false);
    this.showAdvancedHeapSnapshotProperties = this.createSetting("showAdvancedHeapSnapshotProperties", false);
    this.recordAllocationStacks = this.createSetting("recordAllocationStacks", false);
    this.highResolutionCpuProfiling = this.createSetting("highResolutionCpuProfiling", false);
    this.searchInContentScripts = this.createSetting("searchInContentScripts", false);
    this.textEditorIndent = this.createSetting("textEditorIndent", "    ");
    this.textEditorAutoDetectIndent = this.createSetting("textEditorAutoIndentIndent", true);
    this.textEditorAutocompletion = this.createSetting("textEditorAutocompletion", true);
    this.textEditorBracketMatching = this.createSetting("textEditorBracketMatching", true);
    this.cssReloadEnabled = this.createSetting("cssReloadEnabled", false);
    this.timelineLiveUpdate = this.createSetting("timelineLiveUpdate", true);
    this.showMetricsRulers = this.createSetting("showMetricsRulers", false);
    this.workerInspectorWidth = this.createSetting("workerInspectorWidth", 600);
    this.workerInspectorHeight = this.createSetting("workerInspectorHeight", 600);
    this.messageURLFilters = this.createSetting("messageURLFilters", {});
    this.networkHideDataURL = this.createSetting("networkHideDataURL", false);
    this.networkResourceTypeFilters = this.createSetting("networkResourceTypeFilters", {});
    this.messageLevelFilters = this.createSetting("messageLevelFilters", {});
    this.splitVerticallyWhenDockedToRight = this.createSetting("splitVerticallyWhenDockedToRight", true);
    this.visiblePanels = this.createSetting("visiblePanels", {});
    this.shortcutPanelSwitch = this.createSetting("shortcutPanelSwitch", false);
    this.showWhitespacesInEditor = this.createSetting("showWhitespacesInEditor", false);
    this.skipStackFramesPattern = this.createRegExpSetting("skipStackFramesPattern", "");
    this.skipContentScripts = this.createSetting("skipContentScripts", false);
    this.pauseOnExceptionEnabled = this.createSetting("pauseOnExceptionEnabled", false);
    this.pauseOnCaughtException = this.createSetting("pauseOnCaughtException", false);
    this.enableAsyncStackTraces = this.createSetting("enableAsyncStackTraces", false);
    this.showMediaQueryInspector = this.createSetting("showMediaQueryInspector", false);
    this.disableOverridesWarning = this.createSetting("disableOverridesWarning", false);
    this.testPath = this.createSetting("testPath", "");
    this.frameViewerHideChromeWindow = this.createSetting("frameViewerHideChromeWindow", false);
    this.highlightDOMUpdates = this.createSetting("highlightDOMUpdates", true);

    // Rendering options
    this.showPaintRects = this.createSetting("showPaintRects", false);
    this.showDebugBorders = this.createSetting("showDebugBorders", false);
    this.showFPSCounter = this.createSetting("showFPSCounter", false);
    this.continuousPainting = this.createSetting("continuousPainting", false);
    this.showScrollBottleneckRects = this.createSetting("showScrollBottleneckRects", false);
}

WebInspector.Settings.prototype = {
    /**
     * @param {string} key
     * @param {*} defaultValue
     * @return {!WebInspector.Setting}
     */
    createSetting: function(key, defaultValue)
    {
        if (!this._registry[key])
            this._registry[key] = new WebInspector.Setting(key, defaultValue, this._eventSupport, window.localStorage);
        return this._registry[key];
    },

    /**
     * @param {string} key
     * @param {string} defaultValue
     * @param {string=} regexFlags
     * @return {!WebInspector.Setting}
     */
    createRegExpSetting: function(key, defaultValue, regexFlags)
    {
        if (!this._registry[key])
            this._registry[key] = new WebInspector.RegExpSetting(key, defaultValue, this._eventSupport, window.localStorage, regexFlags);
        return this._registry[key];
    }
}

/**
 * @constructor
 * @param {string} name
 * @param {V} defaultValue
 * @param {!WebInspector.Object} eventSupport
 * @param {?Storage} storage
 * @template V
 */
WebInspector.Setting = function(name, defaultValue, eventSupport, storage)
{
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
        if (this._storage && this._name in this._storage) {
            try {
                this._value = JSON.parse(this._storage[this._name]);
            } catch(e) {
                delete this._storage[this._name];
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
        if (this._storage) {
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
        }
        this._eventSupport.dispatchEventToListeners(this._name, value);
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
            sizes[key] = this._storage.getItem(key).length;
        var keys = Object.keys(sizes);

        function comparator(key1, key2)
        {
            return sizes[key2] - sizes[key1];
        }

        keys.sort(comparator);

        for (var i = 0; i < 10 && i < keys.length; ++i)
            WebInspector.console.log("Setting: '" + keys[i] + "', size: " + sizes[keys[i]]);
    },
}

/**
 * @constructor
 * @extends {WebInspector.Setting}
 * @param {string} name
 * @param {string} defaultValue
 * @param {!WebInspector.Object} eventSupport
 * @param {?Storage} storage
 * @param {string=} regexFlags
 */
WebInspector.RegExpSetting = function(name, defaultValue, eventSupport, storage, regexFlags)
{
    WebInspector.Setting.call(this, name, defaultValue ? [{ pattern: defaultValue }] : [], eventSupport, storage);
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

WebInspector.VersionController.currentVersion = 10;

WebInspector.VersionController.prototype = {
    updateVersion: function()
    {
        var versionSetting = WebInspector.settings.createSetting("inspectorVersion", 0);
        var currentVersion = WebInspector.VersionController.currentVersion;
        var oldVersion = versionSetting.get();
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
        this._clearBreakpointsWhenTooMany(WebInspector.settings.breakpoints, 500000);
    },

    _updateVersionFrom1To2: function()
    {
        var versionSetting = WebInspector.settings.createSetting("previouslyViewedFiles", []);
        versionSetting.set([]);
    },

    _updateVersionFrom2To3: function()
    {
        var fileSystemMappingSetting = WebInspector.settings.createSetting("fileSystemMapping", {});
        fileSystemMappingSetting.set({});
        if (window.localStorage)
            delete window.localStorage["fileMappingEntries"];
    },

    _updateVersionFrom3To4: function()
    {
        var advancedMode = WebInspector.settings.createSetting("showHeaSnapshotObjectsHiddenProperties", false).get();
        WebInspector.settings.showAdvancedHeapSnapshotProperties.set(advancedMode);
    },

    _updateVersionFrom4To5: function()
    {
        if (!window.localStorage)
            return;
        var settingNames = {
            "FileSystemViewSidebarWidth": "fileSystemViewSplitViewState",
            "canvasProfileViewReplaySplitLocation": "canvasProfileViewReplaySplitViewState",
            "canvasProfileViewSplitLocation": "canvasProfileViewSplitViewState",
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
        for (var oldName in settingNames) {
            var newName = settingNames[oldName];
            var oldNameH = oldName + "H";

            var newValue = null;
            var oldSetting = WebInspector.settings.createSetting(oldName, undefined).get();
            if (oldSetting) {
                newValue = newValue || {};
                newValue.vertical = {};
                newValue.vertical.size = oldSetting;
                delete window.localStorage[oldName];
            }
            var oldSettingH = WebInspector.settings.createSetting(oldNameH, undefined).get();
            if (oldSettingH) {
                newValue = newValue || {};
                newValue.horizontal = {};
                newValue.horizontal.size = oldSettingH;
                delete window.localStorage[oldNameH];
            }
            var newSetting = WebInspector.settings.createSetting(newName, {});
            if (newValue)
                newSetting.set(newValue);
        }
    },

    _updateVersionFrom5To6: function()
    {
        if (!window.localStorage)
            return;

        var settingNames = {
            "debuggerSidebarHidden": "sourcesPanelSplitViewState",
            "navigatorHidden": "sourcesPanelNavigatorSplitViewState",
            "WebInspector.Drawer.showOnLoad": "Inspector.drawerSplitViewState"
        };

        for (var oldName in settingNames) {
            var newName = settingNames[oldName];

            var oldSetting = WebInspector.settings.createSetting(oldName, undefined).get();
            var invert = "WebInspector.Drawer.showOnLoad" === oldName;
            var hidden = !!oldSetting !== invert;
            delete window.localStorage[oldName];
            var showMode = hidden ? "OnlyMain" : "Both";

            var newSetting = WebInspector.settings.createSetting(newName, null);
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
        if (!window.localStorage)
            return;

        var settingNames = {
            "sourcesPanelNavigatorSplitViewState": "sourcesPanelNavigatorSplitViewState",
            "elementsPanelSplitViewState": "elementsPanelSplitViewState",
            "canvasProfileViewReplaySplitViewState": "canvasProfileViewReplaySplitViewState",
            "stylesPaneSplitViewState": "stylesPaneSplitViewState",
            "sourcesPanelDebuggerSidebarSplitViewState": "sourcesPanelDebuggerSidebarSplitViewState"
        };

        for (var name in settingNames) {
            if (!(name in window.localStorage))
                continue;
            var setting = WebInspector.settings.createSetting(name, undefined);
            var value = setting.get();
            if (!value)
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
        var settingName = "deviceMetrics";
        if (!window.localStorage || !(settingName in window.localStorage))
            return;
        var setting = WebInspector.settings.createSetting(settingName, undefined);
        var value = setting.get();
        if (!value)
            return;

        var components = value.split("x");
        if (components.length >= 3) {
            var width = parseInt(components[0], 10);
            var height = parseInt(components[1], 10);
            var deviceScaleFactor = parseFloat(components[2]);
            if (deviceScaleFactor) {
                components[0] = "" + Math.round(width / deviceScaleFactor);
                components[1] = "" + Math.round(height / deviceScaleFactor);
            }
        }
        value = components.join("x");
        setting.set(value);
    },

    _updateVersionFrom8To9: function()
    {
        if (!window.localStorage)
            return;

        var settingNames = [
            "skipStackFramesPattern",
            "workspaceFolderExcludePattern"
        ];

        for (var i = 0; i < settingNames.length; ++i) {
            var settingName = settingNames[i];
            if (!(settingName in window.localStorage))
                continue;
            try {
                var value = JSON.parse(window.localStorage[settingName]);
                if (!value)
                    continue;
                if (typeof value === "string")
                    value = [value];
                for (var j = 0; j < value.length; ++j) {
                    if (typeof value[j] === "string")
                        value[j] = { pattern: value[j] };
                }
                window.localStorage[settingName] = JSON.stringify(value);
            } catch(e) {
            }
        }
    },

    _updateVersionFrom9To10: function()
    {
        if (!window.localStorage)
            return;

        for (var key in window.localStorage) {
            if (key.startsWith("revision-history"))
                window.localStorage.removeItem(key);
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

// These methods are added for backwards compatibility with Devtools CodeSchool extension.
// DO NOT REMOVE

/**
 * @constructor
 */
WebInspector.PauseOnExceptionStateSetting = function()
{
    WebInspector.settings.pauseOnExceptionEnabled.addChangeListener(this._enabledChanged, this);
    WebInspector.settings.pauseOnCaughtException.addChangeListener(this._pauseOnCaughtChanged, this);
    this._name = "pauseOnExceptionStateString";
    this._eventSupport = new WebInspector.Object();
    this._value = this._calculateValue();
}

WebInspector.PauseOnExceptionStateSetting.prototype = {
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

    /**
     * @return {string}
     */
    get: function()
    {
        return this._value;
    },

    /**
     * @return {string}
     */
    _calculateValue: function()
    {
        if (!WebInspector.settings.pauseOnExceptionEnabled.get())
            return "none";
        // The correct code here would be
        //     return WebInspector.settings.pauseOnCaughtException.get() ? "all" : "uncaught";
        // But the CodeSchool DevTools relies on the fact that we used to enable pausing on ALL extensions by default, so we trick it here.
        return "all";
    },

    _enabledChanged: function(event)
    {
        this._fireChangedIfNeeded();
    },

    _pauseOnCaughtChanged: function(event)
    {
        this._fireChangedIfNeeded();
    },

    _fireChangedIfNeeded: function()
    {
        var newValue = this._calculateValue();
        if (newValue === this._value)
            return;
        this._value = newValue;
        this._eventSupport.dispatchEventToListeners(this._name, this._value);
    }
}
