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
    resourceExportEnabled: false,
    networkPanelEnabled: false
}

WebInspector.Settings = function(sessionScope)
{
    this._sessionScope = sessionScope;
    this._store = {};
}

WebInspector.Settings.initialize = function()
{
    WebInspector.applicationSettings = new WebInspector.Settings(false);
    WebInspector.sessionSettings = new WebInspector.Settings(true);

    function populateApplicationSettings(settingsString)
    {
        WebInspector.applicationSettings._load(settingsString);
        WebInspector.applicationSettings.installSetting("eventListenersFilter", "event-listeners-filter", "all");
        WebInspector.applicationSettings.installSetting("colorFormat", "color-format", "hex");
        WebInspector.applicationSettings.installSetting("resourcesLargeRows", "resources-large-rows", true);
        WebInspector.applicationSettings.installSetting("watchExpressions", "watch-expressions", []);
        WebInspector.applicationSettings.installSetting("lastViewedScriptFile", "last-viewed-script-file");
        WebInspector.applicationSettings.installSetting("showInheritedComputedStyleProperties", "show-inherited-computed-style-properties", false);
        WebInspector.applicationSettings.installSetting("showUserAgentStyles", "show-user-agent-styles", true);
        WebInspector.applicationSettings.installSetting("resourceViewTab", "resource-view-tab", "content");
        WebInspector.applicationSettings.installSetting("consoleHistory", "console-history", []);
        WebInspector.applicationSettings.installSetting("resourcesSortOptions", "resources-sort-options", {timeOption: "responseTime", sizeOption: "transferSize"});

        WebInspector.applicationSettings.dispatchEventToListeners("loaded");
    }

    function populateSessionSettings(settingsString)
    {
        WebInspector.sessionSettings._load(settingsString);
        WebInspector.sessionSettings.dispatchEventToListeners("loaded");
    }

    InspectorBackend.getSettings(function(settings) {
        populateApplicationSettings(settings.application);
        populateSessionSettings(settings.session);
    });
}

WebInspector.Settings.prototype = {
    reset: function()
    {
        this._store = {};
        // FIXME: restore default values (bug 42820)
        this.dispatchEventToListeners("loaded");
    },

    _load: function(settingsString)
    {
        try {
            var loadedStore = JSON.parse(settingsString);
        } catch (e) {
            // May fail;
            loadedStore = {};
        }
        if (!loadedStore)
            return;
        for (var propertyName in loadedStore)
            this._store[propertyName] = loadedStore[propertyName];
    },

    installSetting: function(name, propertyName, defaultValue)
    {
        this.__defineGetter__(name, this._get.bind(this, propertyName));
        this.__defineSetter__(name, this._set.bind(this, propertyName));
        if (!(propertyName in this._store))
            this._store[propertyName] = defaultValue;
    },

    _get: function(propertyName)
    {
        return this._store[propertyName];
    },

    _set: function(propertyName, newValue)
    {
        this._store[propertyName] = newValue;
        try {
            var store = JSON.stringify(this._store);
            if (this._sessionScope)
                InspectorBackend.saveSessionSettings(store);
            else
                InspectorBackend.saveApplicationSettings(store);
        } catch (e) {
            // May fail;
        }
    }
}

WebInspector.Settings.prototype.__proto__ = WebInspector.Object.prototype;
