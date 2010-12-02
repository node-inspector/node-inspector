/* InspectorBackendStub.js */

// Copyright (c) 2010 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.


WebInspector.InspectorBackendStub = function()
{
    this._registerDelegate('{"seq": 0, "domain": "Controller", "command": "populateScriptObjects", "arguments": {}}');
    this._registerDelegate('{"seq": 0, "domain": "Controller", "command": "getInspectorState", "arguments": {}}');
    this._ignore('{"seq": 0, "domain": "Controller", "command": "storeLastActivePanel", "arguments": {"panelName": "string"}}');
    this._ignore('{"seq": 0, "domain": "Controller", "command": "saveSessionSettings", "arguments": {"settings": "string"}}');
    this._ignore('{"seq": 0, "domain": "Controller", "command": "setSearchingForNode", "arguments": {"enabled": "boolean"}}');
    this._ignore('{"seq": 0, "domain": "Controller", "command": "setMonitoringXHREnabled", "arguments": {"enable": "boolean"}}');
    this._ignore('{"seq": 0, "domain": "Controller", "command": "setResourceTrackingEnabled", "arguments": {"enabled": "boolean","always": "boolean"}}');
    this._registerDelegate('{"seq": 0, "domain": "Controller", "command": "getResourceContent", "arguments": {"identifier": "number","encode": "boolean"}}');
    this._ignore('{"seq": 0, "domain": "Controller", "command": "reloadPage", "arguments": {}}');
    this._ignore('{"seq": 0, "domain": "Controller", "command": "startTimelineProfiler", "arguments": {}}');
    this._ignore('{"seq": 0, "domain": "Controller", "command": "stopTimelineProfiler", "arguments": {}}');
    this._registerDelegate('{"seq": 0, "domain": "Backend", "command": "enableDebugger", "arguments": {"always": "boolean"}}');
    this._registerDelegate('{"seq": 0, "domain": "Controller", "command": "disableDebugger", "arguments": {"always": "boolean"}}');
    this._registerDelegate('{"seq": 0, "domain": "Debug", "command": "setBreakpoint", "arguments": {"sourceID": "string","lineNumber": "number","enabled": "boolean","condition": "string"}}');
    this._registerDelegate('{"seq": 0, "domain": "Debug", "command": "removeBreakpoint", "arguments": {"sourceID": "string","lineNumber": "number"}}');
    this._registerDelegate('{"seq": 0, "domain": "Debug", "command": "activateBreakpoints", "arguments": {}}');
    this._registerDelegate('{"seq": 0, "domain": "Debug", "command": "deactivateBreakpoints", "arguments": {}}');
    this._registerDelegate('{"seq": 0, "domain": "Debug", "command": "pause", "arguments": {}}');
    this._registerDelegate('{"seq": 0, "domain": "Debug", "command": "resume", "arguments": {}}');
    this._registerDelegate('{"seq": 0, "domain": "Debug", "command": "stepOverStatement", "arguments": {}}');
    this._registerDelegate('{"seq": 0, "domain": "Debug", "command": "stepIntoStatement", "arguments": {}}');
    this._registerDelegate('{"seq": 0, "domain": "Debug", "command": "stepOutOfFunction", "arguments": {}}');
    this._registerDelegate('{"seq": 0, "domain": "Debug", "command": "setPauseOnExceptionsState", "arguments": {"pauseOnExceptionsState": "number"}}');
    this._registerDelegate('{"seq": 0, "domain": "Debug", "command": "editScriptSource", "arguments": {"sourceID": "string","newContent": "string"}}');
    this._registerDelegate('{"seq": 0, "domain": "Debug", "command": "getScriptSource", "arguments": {"sourceID": "string"}}');
    this._ignore('{"seq": 0, "domain": "Controller", "command": "setNativeBreakpoint", "arguments": {"breakpoint": "object"}}');
    this._ignore('{"seq": 0, "domain": "Controller", "command": "removeNativeBreakpoint", "arguments": {"breakpointId": "number"}}');
    this._registerDelegate('{"seq": 0, "domain": "Controller", "command": "enableProfiler", "arguments": {"always": "boolean"}}');
    this._registerDelegate('{"seq": 0, "domain": "Controller", "command": "disableProfiler", "arguments": {"always": "boolean"}}');
    this._registerDelegate('{"seq": 0, "domain": "Profiler", "command": "startProfiling", "arguments": {}}');
    this._registerDelegate('{"seq": 0, "domain": "Profiler", "command": "stopProfiling", "arguments": {}}');
    this._registerDelegate('{"seq": 0, "domain": "Profiler", "command": "getProfileHeaders", "arguments": {}}');
    this._registerDelegate('{"seq": 0, "domain": "Profiler", "command": "getProfile", "arguments": {"type": "string","uid": "number"}}');
    this._registerDelegate('{"seq": 0, "domain": "Profiler", "command": "removeProfile", "arguments": {"type": "string","uid": "number"}}');
    this._registerDelegate('{"seq": 0, "domain": "Profiler", "command": "clearProfiles", "arguments": {}}');
    this._registerDelegate('{"seq": 0, "domain": "Profiler", "command": "takeHeapSnapshot", "arguments": {}}');
    this._ignore('{"seq": 0, "domain": "Backend", "command": "setInjectedScriptSource", "arguments": {"scriptSource": "string"}}');
    this._registerDelegate('{"seq": 0, "domain": "Backend", "command": "dispatchOnInjectedScript", "arguments": {"injectedScriptId": "number","methodName": "string","arguments": "string"}}');
    this._ignore('{"seq": 0, "domain": "Controller", "command": "addScriptToEvaluateOnLoad", "arguments": {"scriptSource": "string"}}');
    this._ignore('{"seq": 0, "domain": "Controller", "command": "removeAllScriptsToEvaluateOnLoad", "arguments": {}}');
    this._ignore('{"seq": 0, "domain": "DOM", "command": "getChildNodes", "arguments": {"nodeId": "number"}}');
    this._ignore('{"seq": 0, "domain": "DOM", "command": "setAttribute", "arguments": {"elementId": "number","name": "string","value": "string"}}');
    this._ignore('{"seq": 0, "domain": "DOM", "command": "removeAttribute", "arguments": {"elementId": "number","name": "string"}}');
    this._ignore('{"seq": 0, "domain": "DOM", "command": "setTextNodeValue", "arguments": {"nodeId": "number","value": "string"}}');
    this._ignore('{"seq": 0, "domain": "DOM", "command": "getEventListenersForNode", "arguments": {"nodeId": "number"}}');
    this._ignore('{"seq": 0, "domain": "DOM", "command": "copyNode", "arguments": {"nodeId": "number"}}');
    this._ignore('{"seq": 0, "domain": "DOM", "command": "removeNode", "arguments": {"nodeId": "number"}}');
    this._ignore('{"seq": 0, "domain": "DOM", "command": "changeTagName", "arguments": {"nodeId": "number","newTagName": "string"}}');
    this._ignore('{"seq": 0, "domain": "DOM", "command": "getOuterHTML", "arguments": {"nodeId": "number"}}');
    this._ignore('{"seq": 0, "domain": "DOM", "command": "setOuterHTML", "arguments": {"nodeId": "number","outerHTML": "string"}}');
    this._ignore('{"seq": 0, "domain": "DOM", "command": "addInspectedNode", "arguments": {"nodeId": "number"}}');
    this._ignore('{"seq": 0, "domain": "DOM", "command": "performSearch", "arguments": {"query": "string","runSynchronously": "boolean"}}');
    this._ignore('{"seq": 0, "domain": "DOM", "command": "searchCanceled", "arguments": {}}');
    this._ignore('{"seq": 0, "domain": "DOM", "command": "pushNodeByPathToFrontend", "arguments": {"path": "string"}}');
    this._ignore('{"seq": 0, "domain": "DOM", "command": "setDOMBreakpoint", "arguments": {"nodeId": "number","type": "number"}}');
    this._ignore('{"seq": 0, "domain": "DOM", "command": "removeDOMBreakpoint", "arguments": {"nodeId": "number","type": "number"}}');
    this._registerDelegate('{"seq": 0, "domain": "Controller", "command": "clearConsoleMessages", "arguments": {}}');
    this._ignore('{"seq": 0, "domain": "Controller", "command": "highlightDOMNode", "arguments": {"nodeId": "number"}}');
    this._ignore('{"seq": 0, "domain": "Controller", "command": "hideDOMNodeHighlight", "arguments": {}}');
    this._ignore('{"seq": 0, "domain": "Controller", "command": "openInInspectedWindow", "arguments": {"url": "string"}}');
    this._ignore('{"seq": 0, "domain": "DOM", "command": "getStyles", "arguments": {"nodeId": "number","authOnly": "boolean"}}');
    this._ignore('{"seq": 0, "domain": "DOM", "command": "getAllStyles", "arguments": {}}');
    this._ignore('{"seq": 0, "domain": "DOM", "command": "getInlineStyle", "arguments": {"nodeId": "number"}}');
    this._ignore('{"seq": 0, "domain": "DOM", "command": "getComputedStyle", "arguments": {"nodeId": "number"}}');
    this._ignore('{"seq": 0, "domain": "DOM", "command": "getStyleSheet", "arguments": {"styleSheetId": "number"}}');
    this._ignore('{"seq": 0, "domain": "DOM", "command": "getStyleSourceData", "arguments": {"styleSheetId": "number"}}');
    this._ignore('{"seq": 0, "domain": "DOM", "command": "applyStyleText", "arguments": {"styleId": "number","styleText": "string","propertyName": "string"}}');
    this._ignore('{"seq": 0, "domain": "DOM", "command": "setStyleText", "arguments": {"styleId": "number","styleText": "string"}}');
    this._ignore('{"seq": 0, "domain": "DOM", "command": "setStyleProperty", "arguments": {"styleId": "number","name": "string","value": "string"}}');
    this._ignore('{"seq": 0, "domain": "DOM", "command": "toggleStyleEnabled", "arguments": {"styleId": "number","propertyName": "string","disabled": "boolean"}}');
    this._ignore('{"seq": 0, "domain": "DOM", "command": "setRuleSelector", "arguments": {"ruleId": "number","selector": "string","selectedNodeId": "number"}}');
    this._ignore('{"seq": 0, "domain": "DOM", "command": "addRule", "arguments": {"selector": "string","selectedNodeId": "number"}}');
    this._ignore('{"seq": 0, "domain": "DOM", "command": "getSupportedCSSProperties", "arguments": {}}');
    this._ignore('{"seq": 0, "domain": "Controller", "command": "getCookies", "arguments": {}}');
    this._ignore('{"seq": 0, "domain": "Controller", "command": "deleteCookie", "arguments": {"cookieName": "string","domain": "string"}}');
    this._ignore('{"seq": 0, "domain": "ApplicationCache", "command": "getApplicationCaches", "arguments": {}}');
    this._ignore('{"seq": 0, "domain": "Backend", "command": "releaseWrapperObjectGroup", "arguments": {"injectedScriptId": "number","objectGroup": "string"}}');
    this._ignore('{"seq": 0, "domain": "Controller", "command": "didEvaluateForTestInFrontend", "arguments": {"testCallId": "number","jsonResult": "string"}}');
    this._ignore('{"seq": 0, "domain": "Backend", "command": "getDatabaseTableNames", "arguments": {"databaseId": "number"}}');
    this._ignore('{"seq": 0, "domain": "Backend", "command": "executeSQL", "arguments": {"databaseId": "number","query": "string"}}');
    this._ignore('{"seq": 0, "domain": "Controller", "command": "getDOMStorageEntries", "arguments": {"storageId": "number"}}');
    this._ignore('{"seq": 0, "domain": "Controller", "command": "setDOMStorageItem", "arguments": {"storageId": "number","key": "string","value": "string"}}');
    this._ignore('{"seq": 0, "domain": "Controller", "command": "removeDOMStorageItem", "arguments": {"storageId": "number","key": "string"}}');
    this._ignore('{"seq": 0, "domain": "Controller", "command": "cachedResources"}');
    this._ignore('{"seq": 0, "domain": "Controller", "command": "setConsoleMessagesEnabled"}');
}

WebInspector.InspectorBackendStub.prototype = {
    _registerDelegate: function(commandInfo)
    {
        var commandObject = JSON.parse(commandInfo);
        this[commandObject.command] = this.sendMessageToBackend.bind(this, commandInfo);
    },

    _ignore: function(commandInfo)
    {
        var commandObject = JSON.parse(commandInfo);
        this[commandObject.command] = function() {};
    },

    sendMessageToBackend: function()
    {
        var args = Array.prototype.slice.call(arguments);
        var request = JSON.parse(args.shift());

        for (var key in request.arguments) {
            if (args.length === 0) {
                console.error("Protocol Error: Invalid number of arguments for 'InspectorBackend.%s' call. It should have the next arguments '%s'.", request.command, JSON.stringify(request.arguments));
                return;
            }
            var value = args.shift();
            if (typeof value !== request.arguments[key]) {
                console.error("Protocol Error: Invalid type of argument '%s' for 'InspectorBackend.%s' call. It should be '%s' but it is '%s'.", key, request.command, request.arguments[key], typeof value);
                return;
            }
            request.arguments[key] = value;
        }

        if (args.length === 1) {
            if (typeof args[0] !== "function" && typeof args[0] !== "undefined") {
                console.error("Protocol Error: Optional callback argument for 'InspectorBackend.%s' call should be a function but its type is '%s'.", request.command, typeof args[0]);
                return;
            }
            request.seq = WebInspector.Callback.wrap(args[0]);
        }

        var message = JSON.stringify(request);
        InspectorFrontendHost.sendMessageToBackend(message);
    }
}

InspectorBackend = new WebInspector.InspectorBackendStub();
