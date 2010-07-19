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

if (!window.InspectorBackend) {

WebInspector.InspectorBackendStub = function()
{
    this._attachedWindowHeight = 0;
    this._timelineEnabled = false;
}

WebInspector.InspectorBackendStub.prototype = {
    wrapCallback: function(func)
    {
        return func;
    },

    closeWindow: function()
    {
        this._windowVisible = false;
    },

    attach: function()
    {
    },

    detach: function()
    {
    },

    storeLastActivePanel: function(panel)
    {
    },

    clearConsoleMessages: function()
    {
    },

    getOuterHTML: function()
    {
    },

    setOuterHTML: function()
    {
    },

    addInspectedNode: function()
    {
    },

    search: function(sourceRow, query)
    {
    },

    moveByUnrestricted: function(x, y)
    {
    },

    getResourceContent: function(callId, identifier)
    {
        WebInspector.didGetResourceContent(callId, "");
    },

    highlightDOMNode: function(node)
    {
    },

    hideDOMNodeHighlight: function()
    {
    },

    inspectedWindow: function()
    {
        return window;
    },

    loaded: function()
    {
    },

    localizedStringsURL: function()
    {
        return undefined;
    },

    windowUnloading: function()
    {
        return false;
    },

    hiddenPanels: function()
    {
        return "";
    },

    enableResourceTracking: function()
    {
        WebInspector.resourceTrackingWasEnabled();
    },

    disableResourceTracking: function()
    {
        WebInspector.resourceTrackingWasDisabled();
    },


    enableSearchingForNode: function()
    {
        WebInspector.searchingForNodeWasEnabled();
    },

    disableSearchingForNode: function()
    {
        WebInspector.searchingForNodeWasDisabled();
    },

    enableMonitoringXHR: function()
    {
        WebInspector.monitoringXHRWasEnabled();
    },

    disableMonitoringXHR: function()
    {
        WebInspector.monitoringXHRWasDisabled();
    },

    reloadPage: function()
    {
    },

    enableDebugger: function()
    {
        WebInspector.debuggerWasEnabled();
    },

    disableDebugger: function()
    {
        WebInspector.debuggerWasDisabled();
    },

    setBreakpoint: function(callId, sourceID, line, enabled, condition)
    {
        WebInspector.didSetBreakpoint(callId, true, line);
    },

    removeBreakpoint: function(sourceID, line)
    {
    },

    activateBreakpoints: function()
    {
        this._breakpointsActivated = true;
    },

    deactivateBreakpoints: function()
    {
        this._breakpointsActivated = false;
    },

    pause: function()
    {
    },

    setPauseOnExceptionsState: function(value)
    {
        WebInspector.updatePauseOnExceptionsState(value);
    },

    editScriptSource: function()
    {
        WebInspector.didEditScriptSource(callId, false);
    },

    getScriptSource: function(callId, sourceID)
    {
        WebInspector.didGetScriptSource(callId, null);
    },

    resume: function()
    {
    },

    enableProfiler: function()
    {
        WebInspector.profilerWasEnabled();
    },

    disableProfiler: function()
    {
        WebInspector.profilerWasDisabled();
    },

    startProfiling: function()
    {
    },

    stopProfiling: function()
    {
    },

    getProfileHeaders: function(callId)
    {
        WebInspector.didGetProfileHeaders(callId, []);
    },

    getProfile: function(callId, uid)
    {
    },

    takeHeapSnapshot: function()
    {
    },

    databaseTableNames: function(database)
    {
        return [];
    },

    stepIntoStatement: function()
    {
    },

    stepOutOfFunction: function()
    {
    },

    stepOverStatement: function()
    {
    },

    saveApplicationSettings: function()
    {
    },

    saveSessionSettings: function()
    {
    },

    dispatchOnInjectedScript: function()
    {
    },

    releaseWrapperObjectGroup: function()
    {
    },

    setInjectedScriptSource: function()
    {
    },
    
    addScriptToEvaluateOnLoad: function()
    {
    },

    removeAllScriptsToEvaluateOnLoad: function()
    {
    },

    performSearch: function()
    {
    },

    searchCanceled: function()
    {
    }
}

InspectorBackend = new WebInspector.InspectorBackendStub();

}
