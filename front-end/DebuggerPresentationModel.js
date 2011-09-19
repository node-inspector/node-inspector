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
WebInspector.DebuggerPresentationModel = function()
{
    // FIXME: apply formatter from outside as a generic mapping.
    this._formatter = new WebInspector.ScriptFormatter();
    this._rawSourceCode = {};
    this._presentationCallFrames = [];
    this._selectedCallFrameIndex = 0;

    this._breakpointManager = new WebInspector.BreakpointManager(WebInspector.settings.breakpoints, this._breakpointAdded.bind(this), this._breakpointRemoved.bind(this), WebInspector.debuggerModel);

    WebInspector.debuggerModel.addEventListener(WebInspector.DebuggerModel.Events.ParsedScriptSource, this._parsedScriptSource, this);
    WebInspector.debuggerModel.addEventListener(WebInspector.DebuggerModel.Events.FailedToParseScriptSource, this._failedToParseScriptSource, this);
    WebInspector.debuggerModel.addEventListener(WebInspector.DebuggerModel.Events.DebuggerPaused, this._debuggerPaused, this);
    WebInspector.debuggerModel.addEventListener(WebInspector.DebuggerModel.Events.DebuggerResumed, this._debuggerResumed, this);
    WebInspector.debuggerModel.addEventListener(WebInspector.DebuggerModel.Events.Reset, this._debuggerReset, this);

    WebInspector.console.addEventListener(WebInspector.ConsoleModel.Events.MessageAdded, this._consoleMessageAdded, this);
    WebInspector.console.addEventListener(WebInspector.ConsoleModel.Events.ConsoleCleared, this._consoleCleared, this);

    new WebInspector.DebuggerPresentationModelResourceBinding(this);
}

WebInspector.DebuggerPresentationModel.Events = {
    UISourceCodeAdded: "source-file-added",
    UISourceCodeReplaced: "source-file-replaced",
    ConsoleMessageAdded: "console-message-added",
    ConsoleMessagesCleared: "console-messages-cleared",
    BreakpointAdded: "breakpoint-added",
    BreakpointRemoved: "breakpoint-removed",
    DebuggerPaused: "debugger-paused",
    DebuggerResumed: "debugger-resumed",
    CallFrameSelected: "call-frame-selected"
}

WebInspector.DebuggerPresentationModel.prototype = {
    linkifyLocation: function(sourceURL, lineNumber, columnNumber, classes)
    {
        var linkText = WebInspector.formatLinkText(sourceURL, lineNumber);
        var anchor = WebInspector.linkifyURLAsNode(sourceURL, linkText, classes, false);

        var rawSourceCode = this._rawSourceCodeForScript(sourceURL);
        if (!rawSourceCode) {
            anchor.setAttribute("preferred_panel", "resources");
            anchor.setAttribute("line_number", lineNumber);
            return anchor;
        }

        function updateAnchor()
        {
            var uiLocation = rawSourceCode.rawLocationToUILocation({ lineNumber: lineNumber, columnNumber: columnNumber });
            anchor.textContent = WebInspector.formatLinkText(uiLocation.uiSourceCode.url, uiLocation.lineNumber);
            anchor.setAttribute("preferred_panel", "scripts");
            anchor.uiSourceCode = uiLocation.uiSourceCode;
            anchor.lineNumber = uiLocation.lineNumber;
        }
        if (rawSourceCode.uiSourceCode)
            updateAnchor.call(this);
        rawSourceCode.addEventListener(WebInspector.RawSourceCode.Events.SourceMappingUpdated, updateAnchor, this);
        return anchor;
    },

    _parsedScriptSource: function(event)
    {
        this._addScript(event.data);
    },

    _failedToParseScriptSource: function(event)
    {
        this._addScript(event.data);
    },

    _addScript: function(script)
    {
        var rawSourceCodeId = this._createRawSourceCodeId(script.sourceURL, script.scriptId);
        var rawSourceCode = this._rawSourceCode[rawSourceCodeId];
        if (rawSourceCode) {
            rawSourceCode.addScript(script);
            return;
        }

        var resource;
        if (script.sourceURL)
            resource = WebInspector.networkManager.inflightResourceForURL(script.sourceURL) || WebInspector.resourceForURL(script.sourceURL);
        rawSourceCode = new WebInspector.RawSourceCode(rawSourceCodeId, script, resource, this._formatter, this._formatSource);
        this._rawSourceCode[rawSourceCodeId] = rawSourceCode;
        if (rawSourceCode.uiSourceCode)
            this._updateSourceMapping(rawSourceCode, null);
        rawSourceCode.addEventListener(WebInspector.RawSourceCode.Events.SourceMappingUpdated, this._sourceMappingUpdated, this);
    },

    _sourceMappingUpdated: function(event)
    {
        var rawSourceCode = event.target;
        var oldUISourceCode = event.data.oldUISourceCode;
        this._updateSourceMapping(rawSourceCode, oldUISourceCode);
    },

    _updateSourceMapping: function(rawSourceCode, oldUISourceCode)
    {
        var uiSourceCode = rawSourceCode.uiSourceCode;

        if (oldUISourceCode) {
            var breakpoints = this._breakpointManager.breakpointsForUISourceCode(oldUISourceCode);
            for (var lineNumber in breakpoints) {
                var breakpoint = breakpoints[lineNumber];
                this._breakpointRemoved(breakpoint);
                delete breakpoint.uiSourceCode;
            }
        }

        this._restoreBreakpoints(uiSourceCode);
        this._restoreConsoleMessages(uiSourceCode);

        if (!oldUISourceCode)
            this.dispatchEventToListeners(WebInspector.DebuggerPresentationModel.Events.UISourceCodeAdded, uiSourceCode);
        else {
            var eventData = { uiSourceCode: uiSourceCode, oldUISourceCode: oldUISourceCode };
            this.dispatchEventToListeners(WebInspector.DebuggerPresentationModel.Events.UISourceCodeReplaced, eventData);
        }
    },

    _restoreBreakpoints: function(uiSourceCode)
    {
        this._breakpointManager.uiSourceCodeAdded(uiSourceCode);
        var breakpoints = this._breakpointManager.breakpointsForUISourceCode(uiSourceCode);
        for (var lineNumber in breakpoints)
            this._breakpointAdded(breakpoints[lineNumber]);
    },

    _restoreConsoleMessages: function(uiSourceCode)
    {
        var messages = uiSourceCode.rawSourceCode.messages;
        for (var i = 0; i < messages.length; ++i)
            messages[i]._presentationMessage = this._createPresentationMessage(messages[i], uiSourceCode);
    },

    canEditScriptSource: function(uiSourceCode)
    {
        if (!Preferences.canEditScriptSource || this._formatSource)
            return false;
        var rawSourceCode = uiSourceCode.rawSourceCode;
        var script = this._scriptForRawSourceCode(rawSourceCode);
        return !script.lineOffset && !script.columnOffset;
    },

    setScriptSource: function(uiSourceCode, newSource, callback)
    {
        var rawSourceCode = uiSourceCode.rawSourceCode;
        var script = this._scriptForRawSourceCode(rawSourceCode);

        function didEditScriptSource(error)
        {
            callback(error);
            if (error)
                return;

            var resource = WebInspector.resourceForURL(rawSourceCode.url);
            if (resource)
                resource.addRevision(newSource);

            rawSourceCode.contentEdited();

            if (WebInspector.debuggerModel.callFrames)
                this._debuggerPaused();
        }
        WebInspector.debuggerModel.setScriptSource(script.scriptId, newSource, didEditScriptSource.bind(this));
    },

    _updateBreakpointsAfterLiveEdit: function(uiSourceCode, oldSource, newSource)
    {
        var breakpoints = this._breakpointManager.breakpointsForUISourceCode(uiSourceCode);

        // Clear and re-create breakpoints according to text diff.
        var diff = Array.diff(oldSource.split("\n"), newSource.split("\n"));
        for (var lineNumber in breakpoints) {
            var breakpoint = breakpoints[lineNumber];

            this.removeBreakpoint(uiSourceCode, lineNumber);

            var newLineNumber = diff.left[lineNumber].row;
            if (newLineNumber === undefined) {
                for (var i = lineNumber - 1; i >= 0; --i) {
                    if (diff.left[i].row === undefined)
                        continue;
                    var shiftedLineNumber = diff.left[i].row + lineNumber - i;
                    if (shiftedLineNumber < diff.right.length) {
                        var originalLineNumber = diff.right[shiftedLineNumber].row;
                        if (originalLineNumber === lineNumber || originalLineNumber === undefined)
                            newLineNumber = shiftedLineNumber;
                    }
                    break;
                }
            }
            if (newLineNumber !== undefined)
                this.setBreakpoint(uiSourceCode, newLineNumber, breakpoint.condition, breakpoint.enabled);
        }
    },

    setFormatSource: function(formatSource)
    {
        if (this._formatSource === formatSource)
            return;

        this._formatSource = formatSource;
        this._breakpointManager.reset();
        for (var id in this._rawSourceCode)
            this._rawSourceCode[id].setFormatted(this._formatSource);

        if (WebInspector.debuggerModel.callFrames)
            this._debuggerPaused();
    },

    _consoleMessageAdded: function(event)
    {
        var message = event.data;
        if (!message.url || !message.isErrorOrWarning() || !message.message)
            return;

        var rawSourceCode = this._rawSourceCodeForScript(message.url);
        if (!rawSourceCode)
            return;

        rawSourceCode.messages.push(message);
        if (rawSourceCode.uiSourceCode) {
            message._presentationMessage = this._createPresentationMessage(message, rawSourceCode.uiSourceCode);
            this.dispatchEventToListeners(WebInspector.DebuggerPresentationModel.Events.ConsoleMessageAdded, message._presentationMessage);
        }
    },

    _createPresentationMessage: function(message, uiSourceCode)
    {
        // FIXME(62725): stack trace line/column numbers are one-based.
        var lineNumber = message.stackTrace ? message.stackTrace[0].lineNumber - 1 : message.line - 1;
        var columnNumber = message.stackTrace ? message.stackTrace[0].columnNumber - 1 : 0;
        var uiLocation = uiSourceCode.rawSourceCode.rawLocationToUILocation({ lineNumber: lineNumber, columnNumber: columnNumber });
        var presentationMessage = {};
        presentationMessage.uiSourceCode = uiLocation.uiSourceCode;
        presentationMessage.lineNumber = uiLocation.lineNumber;
        presentationMessage.originalMessage = message;
        return presentationMessage;
    },

    _consoleCleared: function()
    {
        for (var id in this._rawSourceCode)
            this._rawSourceCode[id].messages = [];
        this.dispatchEventToListeners(WebInspector.DebuggerPresentationModel.Events.ConsoleMessagesCleared);
    },

    continueToLine: function(uiSourceCode, lineNumber)
    {
        var rawLocation = uiSourceCode.rawSourceCode.uiLocationToRawLocation(lineNumber, 0);
        WebInspector.debuggerModel.continueToLocation(rawLocation);
    },

    breakpointsForUISourceCode: function(uiSourceCode)
    {
        var breakpointsMap = this._breakpointManager.breakpointsForUISourceCode(uiSourceCode);
        var breakpointsList = [];
        for (var lineNumber in breakpointsMap)
            breakpointsList.push(breakpointsMap[lineNumber]);
        return breakpointsList;
    },

    messagesForUISourceCode: function(uiSourceCode)
    {
        var rawSourceCode = uiSourceCode.rawSourceCode;
        var messages = [];
        for (var i = 0; i < rawSourceCode.messages.length; ++i)
            messages.push(rawSourceCode.messages[i]._presentationMessage);
        return messages;
    },

    setBreakpoint: function(uiSourceCode, lineNumber, condition, enabled)
    {
        this._breakpointManager.setBreakpoint(uiSourceCode, lineNumber, condition, enabled);
    },

    setBreakpointEnabled: function(uiSourceCode, lineNumber, enabled)
    {
        var breakpoint = this.findBreakpoint(uiSourceCode, lineNumber);
        if (!breakpoint)
            return;
        this._breakpointManager.removeBreakpoint(uiSourceCode, lineNumber);
        this._breakpointManager.setBreakpoint(uiSourceCode, lineNumber, breakpoint.condition, enabled);
    },

    updateBreakpoint: function(uiSourceCode, lineNumber, condition, enabled)
    {
        this._breakpointManager.removeBreakpoint(uiSourceCode, lineNumber);
        this._breakpointManager.setBreakpoint(uiSourceCode, lineNumber, condition, enabled);
    },

    removeBreakpoint: function(uiSourceCode, lineNumber)
    {
        this._breakpointManager.removeBreakpoint(uiSourceCode, lineNumber);
    },

    findBreakpoint: function(uiSourceCode, lineNumber)
    {
        return this._breakpointManager.breakpointsForUISourceCode(uiSourceCode)[lineNumber];
    },

    _breakpointAdded: function(breakpoint)
    {
        if (breakpoint.uiSourceCode)
            this.dispatchEventToListeners(WebInspector.DebuggerPresentationModel.Events.BreakpointAdded, breakpoint);
    },

    _breakpointRemoved: function(breakpoint)
    {
        if (breakpoint.uiSourceCode)
            this.dispatchEventToListeners(WebInspector.DebuggerPresentationModel.Events.BreakpointRemoved, breakpoint);
    },

    _debuggerPaused: function()
    {
        var callFrames = WebInspector.debuggerModel.callFrames;
        this._presentationCallFrames = [];
        for (var i = 0; i < callFrames.length; ++i) {
            var callFrame = callFrames[i];
            var rawSourceCode;
            var script = WebInspector.debuggerModel.scriptForSourceID(callFrame.location.scriptId);
            if (script)
                rawSourceCode = this._rawSourceCodeForScript(script.sourceURL, script.scriptId);
            this._presentationCallFrames.push(new WebInspector.PresentationCallFrame(callFrame, i, this, rawSourceCode));
        }
        var details = WebInspector.debuggerModel.debuggerPausedDetails;
        this.dispatchEventToListeners(WebInspector.DebuggerPresentationModel.Events.DebuggerPaused, { callFrames: this._presentationCallFrames, details: details });

        this.selectedCallFrame = this._presentationCallFrames[this._selectedCallFrameIndex];
    },

    _debuggerResumed: function()
    {
        this._presentationCallFrames = [];
        this._selectedCallFrameIndex = 0;
        this.dispatchEventToListeners(WebInspector.DebuggerPresentationModel.Events.DebuggerResumed);
    },

    set selectedCallFrame(callFrame)
    {
        this._selectedCallFrameIndex = callFrame.index;
        callFrame.select();
        this.dispatchEventToListeners(WebInspector.DebuggerPresentationModel.Events.CallFrameSelected, callFrame);
    },

    get selectedCallFrame()
    {
        return this._presentationCallFrames[this._selectedCallFrameIndex];
    },

    _rawSourceCodeForScript: function(sourceURL, scriptId)
    {
        if (!sourceURL) {
            var script = WebInspector.debuggerModel.scriptForSourceID(scriptId);
            if (!script)
                return;
            sourceURL = script.sourceURL;
        }
        return this._rawSourceCode[this._createRawSourceCodeId(sourceURL, scriptId)];
    },

    _scriptForRawSourceCode: function(rawSourceCode)
    {
        function filter(script)
        {
            return this._createRawSourceCodeId(script.sourceURL, script.scriptId) === rawSourceCode.id;
        }
        return WebInspector.debuggerModel.queryScripts(filter.bind(this))[0];
    },

    _createRawSourceCodeId: function(sourceURL, scriptId)
    {
        return sourceURL || scriptId;
    },

    _debuggerReset: function()
    {
        this._rawSourceCode = {};
        this._presentationCallFrames = [];
        this._selectedCallFrameIndex = 0;
        this._breakpointManager.debuggerReset();
    }
}

WebInspector.DebuggerPresentationModel.prototype.__proto__ = WebInspector.Object.prototype;

/**
 * @constructor
 */
WebInspector.PresentationCallFrame = function(callFrame, index, model, rawSourceCode)
{
    this._callFrame = callFrame;
    this._index = index;
    this._model = model;
    this._rawSourceCode = rawSourceCode;
    this._script = WebInspector.debuggerModel.scriptForSourceID(callFrame.location.scriptId);
}

WebInspector.PresentationCallFrame.prototype = {
    get functionName()
    {
        return this._callFrame.functionName;
    },

    get type()
    {
        return this._callFrame.type;
    },

    get isInternalScript()
    {
        return !this._script;
    },

    get url()
    {
        if (this._rawSourceCode && this._rawSourceCode.uiSourceCode)
            return this._rawSourceCode.uiSourceCode.url;
    },

    get scopeChain()
    {
        return this._callFrame.scopeChain;
    },

    get this()
    {
        return this._callFrame.this;
    },

    get index()
    {
        return this._index;
    },

    select: function()
    {
        if (this._rawSourceCode)
            this._rawSourceCode.forceUpdateSourceMapping();
    },

    evaluate: function(code, objectGroup, includeCommandLineAPI, returnByValue, callback)
    {
        function didEvaluateOnCallFrame(error, result, wasThrown)
        {
            if (error) {
                console.error(error);
                callback(null);
                return;
            }

            if (returnByValue && !wasThrown)
                callback(result, wasThrown);
            else
                callback(WebInspector.RemoteObject.fromPayload(result), wasThrown);
        }
        DebuggerAgent.evaluateOnCallFrame(this._callFrame.id, code, objectGroup, includeCommandLineAPI, returnByValue, didEvaluateOnCallFrame.bind(this));
    },

    sourceLine: function(callback)
    {
        var rawLocation = this._callFrame.location;
        if (!this._rawSourceCode) {
            callback(undefined, rawLocation.lineNumber);
            return;
        }

        if (this._rawSourceCode.uiSourceCode) {
            var uiLocation = this._rawSourceCode.rawLocationToUILocation(rawLocation);
            callback(uiLocation.uiSourceCode, uiLocation.lineNumber);
            return;
        }

        function sourceMappingUpdated()
        {
            this._rawSourceCode.removeEventListener(WebInspector.RawSourceCode.Events.SourceMappingUpdated, sourceMappingUpdated, this);
            var uiLocation = this._rawSourceCode.rawLocationToUILocation(rawLocation);
            callback(uiLocation.uiSourceCode, uiLocation.lineNumber);
        }
        this._rawSourceCode.addEventListener(WebInspector.RawSourceCode.Events.SourceMappingUpdated, sourceMappingUpdated, this);
    }
}

/**
 * @constructor
 * @extends {WebInspector.ResourceDomainModelBinding}
 */
WebInspector.DebuggerPresentationModelResourceBinding = function(model)
{
    this._presentationModel = model;
    WebInspector.Resource.registerDomainModelBinding(WebInspector.Resource.Type.Script, this);
}

WebInspector.DebuggerPresentationModelResourceBinding.prototype = {
    canSetContent: function(resource)
    {
        var rawSourceCode = this._presentationModel._rawSourceCodeForScript(resource.url)
        if (!rawSourceCode)
            return false;
        return this._presentationModel.canEditScriptSource(rawSourceCode.uiSourceCode);
    },

    setContent: function(resource, content, majorChange, userCallback)
    {
        if (!majorChange)
            return;

        var rawSourceCode = this._presentationModel._rawSourceCodeForScript(resource.url);
        if (!rawSourceCode) {
            userCallback("Resource is not editable");
            return;
        }

        resource.requestContent(this._setContentWithInitialContent.bind(this, rawSourceCode.uiSourceCode, content, userCallback));
    },

    _setContentWithInitialContent: function(uiSourceCode, content, userCallback, oldContent)
    {
        function callback(error)
        {
            if (userCallback)
                userCallback(error);
            if (!error)
                this._presentationModel._updateBreakpointsAfterLiveEdit(uiSourceCode, oldContent, content);
        }
        this._presentationModel.setScriptSource(uiSourceCode, content, callback.bind(this));
    }
}

WebInspector.DebuggerPresentationModelResourceBinding.prototype.__proto__ = WebInspector.ResourceDomainModelBinding.prototype;

/**
 * @type {?WebInspector.DebuggerPresentationModel}
 */
WebInspector.debuggerPresentationModel = null;
