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


var Preferences = {
    canEditScriptSource: false,
    maxInlineTextChildLength: 80,
    minConsoleHeight: 75,
    minSidebarWidth: 100,
    minElementsSidebarWidth: 200,
    minScriptsSidebarWidth: 200,
    styleRulesExpandedState: {},
    showMissingLocalizedStrings: false,
    samplingCPUProfiler: false,
    showColorNicknames: true,
    debuggerAlwaysEnabled: false,
    profilerAlwaysEnabled: false,
    onlineDetectionEnabled: true,
    nativeInstrumentationEnabled: false,
    useDataURLForResourceImageIcons: true,
    showTimingTab: false,
    showCookiesTab: false,
    debugMode: false,
    heapProfilerPresent: false,
    detailedHeapProfiles: false,
    saveAsAvailable: false,
    useLowerCaseMenuTitlesOnWindows: false,
    canInspectWorkers: false,
    canClearCacheAndCookies: false,
    canDisableCache: false,
    showNetworkPanelInitiatorColumn: false
}

/**
 * @constructor
 */
WebInspector.Settings = function()
{
    this._eventSupport = new WebInspector.Object();

    this.colorFormat = this.createSetting("colorFormat", "hex");
    this.consoleHistory = this.createSetting("consoleHistory", []);
    this.debuggerEnabled = this.createSetting("debuggerEnabled", false);
    this.domWordWrap = this.createSetting("domWordWrap", true);
    this.profilerEnabled = this.createSetting("profilerEnabled", false);
    this.eventListenersFilter = this.createSetting("eventListenersFilter", "all");
    this.lastActivePanel = this.createSetting("lastActivePanel", "elements");
    this.lastViewedScriptFile = this.createSetting("lastViewedScriptFile", "application");
    this.monitoringXHREnabled = this.createSetting("monitoringXHREnabled", false);
    this.preserveConsoleLog = this.createSetting("preserveConsoleLog", false);
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
    this.workerInspectionEnabled = this.createSetting("workerInspectionEnabled", []);
    this.cacheDisabled = this.createSetting("cacheDisabled", false);
    this.showScriptFolders = this.createSetting("showScriptFolders", true);

    // If there are too many breakpoints in a storage, it is likely due to a recent bug that caused
    // periodical breakpoints duplication leading to inspector slowness.
    if (window.localStorage.breakpoints && window.localStorage.breakpoints.length > 500000)
        delete window.localStorage.breakpoints;
}

WebInspector.Settings.prototype = {
    /**
     * @return {WebInspector.Setting}
     */
    createSetting: function(key, defaultValue)
    {
        return new WebInspector.Setting(key, defaultValue, this._eventSupport);
    }
}

/**
 * @constructor
 */
WebInspector.Setting = function(name, defaultValue, eventSupport)
{
    this._name = name;
    this._defaultValue = defaultValue;
    this._eventSupport = eventSupport;
}

WebInspector.Setting.prototype = {
    addChangeListener: function(listener, thisObject)
    {
        this._eventSupport.addEventListener(this._name, listener, thisObject);
    },

    removeChangeListener: function(listener, thisObject)
    {
        this._eventSupport.removeEventListener(this._name, listener, thisObject);
    },

    get name()
    {
        return this._name;
    },

    get: function()
    {
        var value = this._defaultValue;
        if (window.localStorage != null && this._name in window.localStorage) {
            try {
                value = JSON.parse(window.localStorage[this._name]);
            } catch(e) {
                window.localStorage.removeItem(this._name);
            }
        }
        return value;
    },

    set: function(value)
    {
        if (window.localStorage != null) {
            try {
                window.localStorage[this._name] = JSON.stringify(value);
            } catch(e) {
                console.error("Error saving setting with name:" + this._name);
            }
        }
        this._eventSupport.dispatchEventToListeners(this._name, value);
    }
}

WebInspector.settings = new WebInspector.Settings();
