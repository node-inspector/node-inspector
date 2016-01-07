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
 */
WebInspector.UserMetrics = function()
{
    for (var actionName in WebInspector.UserMetrics._ActionCodes) {
        var actionCode = WebInspector.UserMetrics._ActionCodes[actionName];
        this[actionName] = new WebInspector.UserMetrics._Recorder(actionCode);
    }
}

// Codes below are used to collect UMA histograms in the Chromium port.
// Do not change the values below, additional actions are needed on the Chromium side
// in order to add more codes.

WebInspector.UserMetrics._ActionCodes = {
    WindowDocked: 1,
    WindowUndocked: 2,
    ScriptsBreakpointSet: 3,
    TimelineStarted: 4,
    ProfilesCPUProfileTaken: 5,
    ProfilesHeapProfileTaken: 6,
    AuditsStarted: 7,
    ConsoleEvaluated: 8,
    FileSavedInWorkspace: 9,
    DeviceModeEnabled: 10,
    AnimationsPlaybackRateChanged: 11,
    RevisionApplied: 12,
    FileSystemDirectoryContentReceived: 13,
    StyleRuleEdited: 14,
    CommandEvaluatedInConsolePanel: 15
}

WebInspector.UserMetrics._PanelCodes = {
    elements: 1,
    resources: 2,
    network: 3,
    sources: 4,
    timeline: 5,
    profiles: 6,
    audits: 7,
    console: 8,
    layers: 9
}

WebInspector.UserMetrics.prototype = {
    /**
     * @param {string} panelName
     */
    panelShown: function(panelName)
    {
        var code = WebInspector.UserMetrics._PanelCodes[panelName] || 0;
        var size = Object.keys(WebInspector.UserMetrics._PanelCodes).length + 1;
        InspectorFrontendHost.recordEnumeratedHistogram("DevTools.PanelShown", code, size);
    }
}

/**
 * @constructor
 */
WebInspector.UserMetrics._Recorder = function(actionCode)
{
    this._actionCode = actionCode;
}

WebInspector.UserMetrics._Recorder.prototype = {
    record: function()
    {
        var size = Object.keys(WebInspector.UserMetrics._ActionCodes).length + 1;
        InspectorFrontendHost.recordEnumeratedHistogram("DevTools.ActionTaken", this._actionCode, size);
    }
}

WebInspector.userMetrics = new WebInspector.UserMetrics();
