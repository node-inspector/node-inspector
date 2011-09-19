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

WebInspector.JavaScriptSourceFrame = function(model, uiSourceCode)
{
    // FIXME: move all SourceFrame methods related to JavaScript debugging here and
    // get rid of SourceFrame._delegate.
    var delegate = new WebInspector.SourceFrameDelegateForScriptsPanel(model, uiSourceCode);
    WebInspector.SourceFrame.call(this, delegate, uiSourceCode.url);
}

WebInspector.JavaScriptSourceFrame.prototype.__proto__ = WebInspector.SourceFrame.prototype;

WebInspector.SourceFrameDelegateForScriptsPanel = function(model, uiSourceCode)
{
    WebInspector.SourceFrameDelegate.call(this);
    this._model = model;
    this._uiSourceCode = uiSourceCode;
    this._popoverObjectGroup = "popover";
}

WebInspector.SourceFrameDelegateForScriptsPanel.prototype = {
    requestContent: function(callback)
    {
        this._uiSourceCode.requestContent(callback);
    },

    debuggingSupported: function()
    {
        return true;
    },

    setBreakpoint: function(lineNumber, condition, enabled)
    {
        this._model.setBreakpoint(this._uiSourceCode, lineNumber, condition, enabled);

        if (!WebInspector.panels.scripts.breakpointsActivated)
            WebInspector.panels.scripts.toggleBreakpointsClicked();
    },

    updateBreakpoint: function(lineNumber, condition, enabled)
    {
        this._model.updateBreakpoint(this._uiSourceCode, lineNumber, condition, enabled);
    },

    removeBreakpoint: function(lineNumber)
    {
        this._model.removeBreakpoint(this._uiSourceCode, lineNumber);
    },

    findBreakpoint: function(lineNumber)
    {
        return this._model.findBreakpoint(this._uiSourceCode, lineNumber);
    },

    continueToLine: function(lineNumber)
    {
        this._model.continueToLine(this._uiSourceCode, lineNumber);
    },

    canEditScriptSource: function()
    {
        return this._model.canEditScriptSource(this._uiSourceCode);
    },

    setScriptSource: function(text, callback)
    {
        this._model.setScriptSource(this._uiSourceCode, text, callback);
    },

    setScriptSourceIsBeingEdited: function(inEditMode)
    {
        WebInspector.panels.scripts.setScriptSourceIsBeingEdited(this._uiSourceCode, inEditMode);
    },

    debuggerPaused: function()
    {
        return WebInspector.panels.scripts.paused;
    },

    evaluateInSelectedCallFrame: function(string, callback)
    {
        WebInspector.panels.scripts.evaluateInSelectedCallFrame(string, this._popoverObjectGroup, false, false, callback);
    },

    releaseEvaluationResult: function()
    {
        RuntimeAgent.releaseObjectGroup(this._popoverObjectGroup);
    },

    suggestedFileName: function()
    {
        var names = WebInspector.panels.scripts._folderAndDisplayNameForScriptURL(this._uiSourceCode.url);
        return names.displayName || "untitled.js";
    }
}

WebInspector.SourceFrameDelegateForScriptsPanel.prototype.__proto__ = WebInspector.SourceFrameDelegate.prototype;
