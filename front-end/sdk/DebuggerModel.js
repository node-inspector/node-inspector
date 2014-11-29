/*
 * Copyright (C) 2010 Google Inc. All rights reserved.
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
 * @extends {WebInspector.SDKModel}
 * @param {!WebInspector.Target} target
 */
WebInspector.DebuggerModel = function(target)
{
    WebInspector.SDKModel.call(this, WebInspector.DebuggerModel, target);

    target.registerDebuggerDispatcher(new WebInspector.DebuggerDispatcher(this));
    this._agent = target.debuggerAgent();

    /** @type {?WebInspector.DebuggerPausedDetails} */
    this._debuggerPausedDetails = null;
    /** @type {!Object.<string, !WebInspector.Script>} */
    this._scripts = {};
    /** @type {!Map.<string, !Array.<!WebInspector.Script>>} */
    this._scriptsBySourceURL = new Map();

    /** @type {!WebInspector.Object} */
    this._breakpointResolvedEventTarget = new WebInspector.Object();

    this._isPausing = false;
    WebInspector.settings.pauseOnExceptionEnabled.addChangeListener(this._pauseOnExceptionStateChanged, this);
    WebInspector.settings.pauseOnCaughtException.addChangeListener(this._pauseOnExceptionStateChanged, this);
    WebInspector.settings.enableAsyncStackTraces.addChangeListener(this.asyncStackTracesStateChanged, this);
    WebInspector.settings.skipStackFramesPattern.addChangeListener(this._applySkipStackFrameSettings, this);
    WebInspector.settings.skipContentScripts.addChangeListener(this._applySkipStackFrameSettings, this);

    this.enableDebugger();

    this._applySkipStackFrameSettings();
}

/** @typedef {{location: ?WebInspector.DebuggerModel.Location, sourceURL: ?string, functionName: string, scopeChain: (Array.<!DebuggerAgent.Scope>|null)}} */
WebInspector.DebuggerModel.FunctionDetails;

/**
 * Keep these in sync with WebCore::ScriptDebugServer
 *
 * @enum {string}
 */
WebInspector.DebuggerModel.PauseOnExceptionsState = {
    DontPauseOnExceptions : "none",
    PauseOnAllExceptions : "all",
    PauseOnUncaughtExceptions: "uncaught"
};

WebInspector.DebuggerModel.Events = {
    DebuggerWasEnabled: "DebuggerWasEnabled",
    DebuggerWasDisabled: "DebuggerWasDisabled",
    DebuggerPaused: "DebuggerPaused",
    DebuggerResumed: "DebuggerResumed",
    ParsedScriptSource: "ParsedScriptSource",
    FailedToParseScriptSource: "FailedToParseScriptSource",
    GlobalObjectCleared: "GlobalObjectCleared",
    CallFrameSelected: "CallFrameSelected",
    ConsoleCommandEvaluatedInSelectedCallFrame: "ConsoleCommandEvaluatedInSelectedCallFrame",
}

WebInspector.DebuggerModel.BreakReason = {
    DOM: "DOM",
    EventListener: "EventListener",
    XHR: "XHR",
    Exception: "exception",
    PromiseRejection: "promiseRejection",
    Assert: "assert",
    CSPViolation: "CSPViolation",
    DebugCommand: "debugCommand",
    Other: "other"
}

WebInspector.DebuggerModel.prototype = {
    /**
     * @return {boolean}
     */
    debuggerEnabled: function()
    {
        return !!this._debuggerEnabled;
    },

    enableDebugger: function()
    {
        if (this._debuggerEnabled)
            return;
        this._agent.enable();
        this._debuggerEnabled = true;
        this._pauseOnExceptionStateChanged();
        this.asyncStackTracesStateChanged();
        this.dispatchEventToListeners(WebInspector.DebuggerModel.Events.DebuggerWasEnabled);
    },

    disableDebugger: function()
    {
        if (!this._debuggerEnabled)
            return;

        this._agent.disable();
        this._debuggerEnabled = false;
        this._isPausing = false;
        this.asyncStackTracesStateChanged();
        this.dispatchEventToListeners(WebInspector.DebuggerModel.Events.DebuggerWasDisabled);
    },

    /**
     * @param {boolean} skip
     * @param {boolean=} untilReload
     */
    skipAllPauses: function(skip, untilReload)
    {
        if (this._skipAllPausesTimeout) {
            clearTimeout(this._skipAllPausesTimeout);
            delete this._skipAllPausesTimeout;
        }
        this._agent.setSkipAllPauses(skip, untilReload);
    },

    /**
     * @param {number} timeout
     */
    skipAllPausesUntilReloadOrTimeout: function(timeout)
    {
        if (this._skipAllPausesTimeout)
            clearTimeout(this._skipAllPausesTimeout);
        this._agent.setSkipAllPauses(true, true);
        // If reload happens before the timeout, the flag will be already unset and the timeout callback won't change anything.
        this._skipAllPausesTimeout = setTimeout(this.skipAllPauses.bind(this, false), timeout);
    },

    _pauseOnExceptionStateChanged: function()
    {
        var state;
        if (!WebInspector.settings.pauseOnExceptionEnabled.get()) {
            state = WebInspector.DebuggerModel.PauseOnExceptionsState.DontPauseOnExceptions;
        } else if (WebInspector.settings.pauseOnCaughtException.get()) {
            state = WebInspector.DebuggerModel.PauseOnExceptionsState.PauseOnAllExceptions;
        } else {
            state = WebInspector.DebuggerModel.PauseOnExceptionsState.PauseOnUncaughtExceptions;
        }
        this._agent.setPauseOnExceptions(state);
    },

    suspendModel: function()
    {
        this.disableDebugger();
    },

    resumeModel: function()
    {
        this.enableDebugger();
    },

    asyncStackTracesStateChanged: function()
    {
        const maxAsyncStackChainDepth = 4;
        var enabled = WebInspector.settings.enableAsyncStackTraces.get() && !WebInspector.targetManager.allTargetsSuspended();
        this._agent.setAsyncCallStackDepth(enabled ? maxAsyncStackChainDepth : 0);
    },

    stepInto: function()
    {
        /**
         * @this {WebInspector.DebuggerModel}
         */
        function callback()
        {
            this._agent.stepInto();
        }
        this._agent.setOverlayMessage(undefined, callback.bind(this));
    },

    stepOver: function()
    {
        /**
         * @this {WebInspector.DebuggerModel}
         */
        function callback()
        {
            this._agent.stepOver();
        }
        this._agent.setOverlayMessage(undefined, callback.bind(this));
    },

    stepOut: function()
    {
        /**
         * @this {WebInspector.DebuggerModel}
         */
        function callback()
        {
            this._agent.stepOut();
        }
        this._agent.setOverlayMessage(undefined, callback.bind(this));
    },

    resume: function()
    {
        /**
         * @this {WebInspector.DebuggerModel}
         */
        function callback()
        {
            this._agent.resume();
        }
        this._agent.setOverlayMessage(undefined, callback.bind(this));
        this._isPausing = false;
    },

    pause: function()
    {
        this._isPausing = true;
        this.skipAllPauses(false);
        this._agent.pause();
    },

    /**
     * @param {string} url
     * @param {number} lineNumber
     * @param {number=} columnNumber
     * @param {string=} condition
     * @param {function(?DebuggerAgent.BreakpointId, !Array.<!WebInspector.DebuggerModel.Location>)=} callback
     */
    setBreakpointByURL: function(url, lineNumber, columnNumber, condition, callback)
    {
        // Adjust column if needed.
        var minColumnNumber = 0;
        var scripts = this._scriptsBySourceURL.get(url) || [];
        for (var i = 0, l = scripts.length; i < l; ++i) {
            var script = scripts[i];
            if (lineNumber === script.lineOffset)
                minColumnNumber = minColumnNumber ? Math.min(minColumnNumber, script.columnOffset) : script.columnOffset;
        }
        columnNumber = Math.max(columnNumber, minColumnNumber);

        var target = this.target();
        /**
         * @param {?Protocol.Error} error
         * @param {!DebuggerAgent.BreakpointId} breakpointId
         * @param {!Array.<!DebuggerAgent.Location>} locations
         */
        function didSetBreakpoint(error, breakpointId, locations)
        {
            if (callback) {
                var rawLocations = locations ? locations.map(WebInspector.DebuggerModel.Location.fromPayload.bind(WebInspector.DebuggerModel.Location, target)) : [];
                callback(error ? null : breakpointId, rawLocations);
            }
        }
        this._agent.setBreakpointByUrl(lineNumber, url, undefined, columnNumber, condition, undefined, didSetBreakpoint);
        WebInspector.userMetrics.ScriptsBreakpointSet.record();
    },

    /**
     * @param {!WebInspector.DebuggerModel.Location} rawLocation
     * @param {string} condition
     * @param {function(?DebuggerAgent.BreakpointId, !Array.<!WebInspector.DebuggerModel.Location>)=} callback
     */
    setBreakpointBySourceId: function(rawLocation, condition, callback)
    {
        var target = this.target();

        /**
         * @param {?Protocol.Error} error
         * @param {!DebuggerAgent.BreakpointId} breakpointId
         * @param {!DebuggerAgent.Location} actualLocation
         */
        function didSetBreakpoint(error, breakpointId, actualLocation)
        {
            if (callback) {
                var location = WebInspector.DebuggerModel.Location.fromPayload(target, actualLocation);
                callback(error ? null : breakpointId, [location]);
            }
        }
        this._agent.setBreakpoint(rawLocation.payload(), condition, didSetBreakpoint);
        WebInspector.userMetrics.ScriptsBreakpointSet.record();
    },

    /**
     * @param {!DebuggerAgent.BreakpointId} breakpointId
     * @param {function()=} callback
     */
    removeBreakpoint: function(breakpointId, callback)
    {
        this._agent.removeBreakpoint(breakpointId, innerCallback);

        /**
         * @param {?Protocol.Error} error
         */
        function innerCallback(error)
        {
            if (error)
                console.error("Failed to remove breakpoint: " + error);
            if (callback)
                callback();
        }
    },

    /**
     * @param {!DebuggerAgent.BreakpointId} breakpointId
     * @param {!DebuggerAgent.Location} location
     */
    _breakpointResolved: function(breakpointId, location)
    {
        this._breakpointResolvedEventTarget.dispatchEventToListeners(breakpointId, WebInspector.DebuggerModel.Location.fromPayload(this.target(), location));
    },

    _globalObjectCleared: function()
    {
        this._setDebuggerPausedDetails(null);
        this._reset();
        this.dispatchEventToListeners(WebInspector.DebuggerModel.Events.GlobalObjectCleared);
    },

    _reset: function()
    {
        this._scripts = {};
        this._scriptsBySourceURL.clear();
    },

    /**
     * @return {!Object.<string, !WebInspector.Script>}
     */
    get scripts()
    {
        return this._scripts;
    },

    /**
     * @param {!DebuggerAgent.ScriptId} scriptId
     * @return {!WebInspector.Script}
     */
    scriptForId: function(scriptId)
    {
        return this._scripts[scriptId] || null;
    },

    /**
     * @return {!Array.<!WebInspector.Script>}
     */
    scriptsForSourceURL: function(sourceURL)
    {
        if (!sourceURL)
            return [];
        return this._scriptsBySourceURL.get(sourceURL) || [];
    },

    /**
     * @param {!DebuggerAgent.ScriptId} scriptId
     * @param {string} newSource
     * @param {function(?Protocol.Error, !DebuggerAgent.SetScriptSourceError=)} callback
     */
    setScriptSource: function(scriptId, newSource, callback)
    {
        this._scripts[scriptId].editSource(newSource, this._didEditScriptSource.bind(this, scriptId, newSource, callback));
    },

    /**
     * @param {!DebuggerAgent.ScriptId} scriptId
     * @param {string} newSource
     * @param {function(?Protocol.Error, !DebuggerAgent.SetScriptSourceError=)} callback
     * @param {?Protocol.Error} error
     * @param {!DebuggerAgent.SetScriptSourceError=} errorData
     * @param {!Array.<!DebuggerAgent.CallFrame>=} callFrames
     * @param {!DebuggerAgent.StackTrace=} asyncStackTrace
     * @param {boolean=} needsStepIn
     */
    _didEditScriptSource: function(scriptId, newSource, callback, error, errorData, callFrames, asyncStackTrace, needsStepIn)
    {
        if (needsStepIn) {
            this.stepInto();
            this._pendingLiveEditCallback = callback.bind(this, error, errorData);
            return;
        }

        if (!error && callFrames && callFrames.length)
            this._pausedScript(callFrames, this._debuggerPausedDetails.reason, this._debuggerPausedDetails.auxData, this._debuggerPausedDetails.breakpointIds, asyncStackTrace);
        callback(error, errorData);
    },

    /**
     * @return {?Array.<!WebInspector.DebuggerModel.CallFrame>}
     */
    get callFrames()
    {
        return this._debuggerPausedDetails ? this._debuggerPausedDetails.callFrames : null;
    },

    /**
     * @return {?WebInspector.DebuggerPausedDetails}
     */
    debuggerPausedDetails: function()
    {
        return this._debuggerPausedDetails;
    },

    /**
     * @param {?WebInspector.DebuggerPausedDetails} debuggerPausedDetails
     */
    _setDebuggerPausedDetails: function(debuggerPausedDetails)
    {
        this._isPausing = false;
        this._debuggerPausedDetails = debuggerPausedDetails;
        if (this._debuggerPausedDetails)
            this.dispatchEventToListeners(WebInspector.DebuggerModel.Events.DebuggerPaused, this._debuggerPausedDetails);
        if (debuggerPausedDetails) {
            this.setSelectedCallFrame(debuggerPausedDetails.callFrames[0]);
            this._agent.setOverlayMessage(WebInspector.UIString("Paused in debugger"));
        } else {
            this.setSelectedCallFrame(null);
            this._agent.setOverlayMessage();
        }
    },

    /**
     * @param {!Array.<!DebuggerAgent.CallFrame>} callFrames
     * @param {string} reason
     * @param {!Object|undefined} auxData
     * @param {!Array.<string>} breakpointIds
     * @param {!DebuggerAgent.StackTrace=} asyncStackTrace
     */
    _pausedScript: function(callFrames, reason, auxData, breakpointIds, asyncStackTrace)
    {
        this._setDebuggerPausedDetails(new WebInspector.DebuggerPausedDetails(this.target(), callFrames, reason, auxData, breakpointIds, asyncStackTrace));
        if (this._pendingLiveEditCallback) {
            var callback = this._pendingLiveEditCallback;
            delete this._pendingLiveEditCallback;
            callback();
        }
    },

    _resumedScript: function()
    {
        this._setDebuggerPausedDetails(null);
        this.dispatchEventToListeners(WebInspector.DebuggerModel.Events.DebuggerResumed);
    },

    /**
     * @param {!DebuggerAgent.ScriptId} scriptId
     * @param {string} sourceURL
     * @param {number} startLine
     * @param {number} startColumn
     * @param {number} endLine
     * @param {number} endColumn
     * @param {boolean} isContentScript
     * @param {string=} sourceMapURL
     * @param {boolean=} hasSourceURL
     * @param {boolean=} hasSyntaxError
     */
    _parsedScriptSource: function(scriptId, sourceURL, startLine, startColumn, endLine, endColumn, isContentScript, sourceMapURL, hasSourceURL, hasSyntaxError)
    {
        var script = new WebInspector.Script(this.target(), scriptId, sourceURL, startLine, startColumn, endLine, endColumn, isContentScript, sourceMapURL, hasSourceURL);
        this._registerScript(script);
        if (!hasSyntaxError)
            this.dispatchEventToListeners(WebInspector.DebuggerModel.Events.ParsedScriptSource, script);
        else
            this.dispatchEventToListeners(WebInspector.DebuggerModel.Events.FailedToParseScriptSource, script);
    },

    /**
     * @param {!WebInspector.Script} script
     */
    _registerScript: function(script)
    {
        this._scripts[script.scriptId] = script;
        if (script.isAnonymousScript())
            return;

        var scripts = this._scriptsBySourceURL.get(script.sourceURL);
        if (!scripts) {
            scripts = [];
            this._scriptsBySourceURL.set(script.sourceURL, scripts);
        }
        scripts.push(script);
    },

    /**
     * @param {!WebInspector.Script} script
     * @param {number} lineNumber
     * @param {number} columnNumber
     * @return {?WebInspector.DebuggerModel.Location}
     */
    createRawLocation: function(script, lineNumber, columnNumber)
    {
        if (script.sourceURL)
            return this.createRawLocationByURL(script.sourceURL, lineNumber, columnNumber);
        return new WebInspector.DebuggerModel.Location(this.target(), script.scriptId, lineNumber, columnNumber);
    },

    /**
     * @param {string} sourceURL
     * @param {number} lineNumber
     * @param {number} columnNumber
     * @return {?WebInspector.DebuggerModel.Location}
     */
    createRawLocationByURL: function(sourceURL, lineNumber, columnNumber)
    {
        var closestScript = null;
        var scripts = this._scriptsBySourceURL.get(sourceURL) || [];
        for (var i = 0, l = scripts.length; i < l; ++i) {
            var script = scripts[i];
            if (!closestScript)
                closestScript = script;
            if (script.lineOffset > lineNumber || (script.lineOffset === lineNumber && script.columnOffset > columnNumber))
                continue;
            if (script.endLine < lineNumber || (script.endLine === lineNumber && script.endColumn <= columnNumber))
                continue;
            closestScript = script;
            break;
        }
        return closestScript ? new WebInspector.DebuggerModel.Location(this.target(), closestScript.scriptId, lineNumber, columnNumber) : null;
    },

    /**
     * @param {?DebuggerAgent.ScriptId} scriptId
     * @param {string} sourceUrl
     * @param {number} lineNumber
     * @param {number} columnNumber
     * @return {?WebInspector.DebuggerModel.Location}
     */
    createRawLocationByScriptId: function(scriptId, sourceUrl, lineNumber, columnNumber)
    {
        var script = scriptId ? this.scriptForId(scriptId) : null;
        return script ? this.createRawLocation(script, lineNumber, columnNumber) : this.createRawLocationByURL(sourceUrl, lineNumber, columnNumber);
    },

    /**
     * @return {boolean}
     */
    isPaused: function()
    {
        return !!this.debuggerPausedDetails();
    },

    /**
     * @return {boolean}
     */
    isPausing: function()
    {
        return this._isPausing;
    },

    /**
     * @param {?WebInspector.DebuggerModel.CallFrame} callFrame
     */
    setSelectedCallFrame: function(callFrame)
    {
        this._selectedCallFrame = callFrame;
        if (!this._selectedCallFrame)
            return;

        this.dispatchEventToListeners(WebInspector.DebuggerModel.Events.CallFrameSelected, callFrame);
    },

    /**
     * @return {?WebInspector.DebuggerModel.CallFrame}
     */
    selectedCallFrame: function()
    {
        return this._selectedCallFrame;
    },

    /**
     * @param {string} code
     * @param {string} objectGroup
     * @param {boolean} includeCommandLineAPI
     * @param {boolean} doNotPauseOnExceptionsAndMuteConsole
     * @param {boolean} returnByValue
     * @param {boolean} generatePreview
     * @param {function(?WebInspector.RemoteObject, boolean, ?RuntimeAgent.RemoteObject=, ?DebuggerAgent.ExceptionDetails=)} callback
     */
    evaluateOnSelectedCallFrame: function(code, objectGroup, includeCommandLineAPI, doNotPauseOnExceptionsAndMuteConsole, returnByValue, generatePreview, callback)
    {
        /**
         * @param {?RuntimeAgent.RemoteObject} result
         * @param {boolean=} wasThrown
         * @param {?DebuggerAgent.ExceptionDetails=} exceptionDetails
         * @this {WebInspector.DebuggerModel}
         */
        function didEvaluate(result, wasThrown, exceptionDetails)
        {
            if (!result)
                callback(null, false);
            else if (returnByValue)
                callback(null, !!wasThrown, wasThrown ? null : result, exceptionDetails);
            else
                callback(this.target().runtimeModel.createRemoteObject(result), !!wasThrown, undefined, exceptionDetails);

            if (objectGroup === "console")
                this.dispatchEventToListeners(WebInspector.DebuggerModel.Events.ConsoleCommandEvaluatedInSelectedCallFrame);
        }

        this.selectedCallFrame().evaluate(code, objectGroup, includeCommandLineAPI, doNotPauseOnExceptionsAndMuteConsole, returnByValue, generatePreview, didEvaluate.bind(this));
    },

    /**
     * @param {function(!Object)} callback
     */
    getSelectedCallFrameVariables: function(callback)
    {
        var result = { this: true };

        var selectedCallFrame = this._selectedCallFrame;
        if (!selectedCallFrame)
            callback(result);

        var pendingRequests = 0;

        function propertiesCollected(properties)
        {
            for (var i = 0; properties && i < properties.length; ++i)
                result[properties[i].name] = true;
            if (--pendingRequests == 0)
                callback(result);
        }

        for (var i = 0; i < selectedCallFrame.scopeChain.length; ++i) {
            var scope = selectedCallFrame.scopeChain[i];
            var object = this.target().runtimeModel.createRemoteObject(scope.object);
            pendingRequests++;
            object.getAllProperties(false, propertiesCollected);
        }
    },

    /**
     * Handles notification from JavaScript VM about updated stack (liveedit or frame restart action).
     * @param {!Array.<!DebuggerAgent.CallFrame>=} newCallFrames
     * @param {!Object=} details
     * @param {!DebuggerAgent.StackTrace=} asyncStackTrace
     */
    callStackModified: function(newCallFrames, details, asyncStackTrace)
    {
        // FIXME: declare this property in protocol and in JavaScript.
        if (details && details["stack_update_needs_step_in"])
            this.stepInto();
        else if (newCallFrames && newCallFrames.length)
            this._pausedScript(newCallFrames, this._debuggerPausedDetails.reason, this._debuggerPausedDetails.auxData, this._debuggerPausedDetails.breakpointIds, asyncStackTrace);
    },

    _applySkipStackFrameSettings: function()
    {
        this._agent.skipStackFrames(WebInspector.settings.skipStackFramesPattern.get(), WebInspector.settings.skipContentScripts.get());
    },

    /**
     * @param {!WebInspector.RemoteObject} remoteObject
     * @param {function(?WebInspector.DebuggerModel.FunctionDetails)} callback
     */
    functionDetails: function(remoteObject, callback)
    {
        this._agent.getFunctionDetails(remoteObject.objectId, didGetDetails.bind(this));

        /**
         * @param {?Protocol.Error} error
         * @param {!DebuggerAgent.FunctionDetails} response
         * @this {WebInspector.DebuggerModel}
         */
        function didGetDetails(error, response)
        {
            if (error) {
                console.error(error);
                callback(null);
                return;
            }
            var location = response.location;
            var script = this.scriptForId(location.scriptId);
            var rawLocation = script ? this.createRawLocation(script, location.lineNumber, location.columnNumber || 0) : null;
            var sourceURL = script ? script.contentURL() : null;
            callback({location: rawLocation, sourceURL: sourceURL, functionName: response.functionName, scopeChain: response.scopeChain || null});
        }
    },

    /**
     * @param {!DebuggerAgent.BreakpointId} breakpointId
     * @param {function(!WebInspector.Event)} listener
     * @param {!Object=} thisObject
     */
    addBreakpointListener: function(breakpointId, listener, thisObject)
    {
        this._breakpointResolvedEventTarget.addEventListener(breakpointId, listener, thisObject)
    },

    /**
     * @param {!DebuggerAgent.BreakpointId} breakpointId
     * @param {function(!WebInspector.Event)} listener
     * @param {!Object=} thisObject
     */
    removeBreakpointListener: function(breakpointId, listener, thisObject)
    {
        this._breakpointResolvedEventTarget.removeEventListener(breakpointId, listener, thisObject);
    },

    dispose: function()
    {
        WebInspector.settings.pauseOnExceptionEnabled.removeChangeListener(this._pauseOnExceptionStateChanged, this);
        WebInspector.settings.pauseOnCaughtException.removeChangeListener(this._pauseOnExceptionStateChanged, this);
        WebInspector.settings.skipStackFramesPattern.removeChangeListener(this._applySkipStackFrameSettings, this);
        WebInspector.settings.skipContentScripts.removeChangeListener(this._applySkipStackFrameSettings, this);
        WebInspector.settings.enableAsyncStackTraces.removeChangeListener(this.asyncStackTracesStateChanged, this);
    },

    __proto__: WebInspector.SDKModel.prototype
}

WebInspector.DebuggerEventTypes = {
    JavaScriptPause: 0,
    JavaScriptBreakpoint: 1,
    NativeBreakpoint: 2
};

/**
 * @constructor
 * @implements {DebuggerAgent.Dispatcher}
 * @param {!WebInspector.DebuggerModel} debuggerModel
 */
WebInspector.DebuggerDispatcher = function(debuggerModel)
{
    this._debuggerModel = debuggerModel;
}

WebInspector.DebuggerDispatcher.prototype = {
    /**
     * @param {!Array.<!DebuggerAgent.CallFrame>} callFrames
     * @param {string} reason
     * @param {!Object=} auxData
     * @param {!Array.<string>=} breakpointIds
     * @param {!DebuggerAgent.StackTrace=} asyncStackTrace
     */
    paused: function(callFrames, reason, auxData, breakpointIds, asyncStackTrace)
    {
        this._debuggerModel._pausedScript(callFrames, reason, auxData, breakpointIds || [], asyncStackTrace);
    },

    /**
     * @override
     */
    resumed: function()
    {
        this._debuggerModel._resumedScript();
    },

    /**
     * @override
     */
    globalObjectCleared: function()
    {
        this._debuggerModel._globalObjectCleared();
    },

    /**
     * @param {!DebuggerAgent.ScriptId} scriptId
     * @param {string} sourceURL
     * @param {number} startLine
     * @param {number} startColumn
     * @param {number} endLine
     * @param {number} endColumn
     * @param {boolean=} isContentScript
     * @param {string=} sourceMapURL
     * @param {boolean=} hasSourceURL
     */
    scriptParsed: function(scriptId, sourceURL, startLine, startColumn, endLine, endColumn, isContentScript, sourceMapURL, hasSourceURL)
    {
        this._debuggerModel._parsedScriptSource(scriptId, sourceURL, startLine, startColumn, endLine, endColumn, !!isContentScript, sourceMapURL, hasSourceURL, false);
    },

    /**
     * @param {!DebuggerAgent.ScriptId} scriptId
     * @param {string} sourceURL
     * @param {number} startLine
     * @param {number} startColumn
     * @param {number} endLine
     * @param {number} endColumn
     * @param {boolean=} isContentScript
     * @param {string=} sourceMapURL
     * @param {boolean=} hasSourceURL
     */
    scriptFailedToParse: function(scriptId, sourceURL, startLine, startColumn, endLine, endColumn, isContentScript, sourceMapURL, hasSourceURL)
    {
        this._debuggerModel._parsedScriptSource(scriptId, sourceURL, startLine, startColumn, endLine, endColumn, !!isContentScript, sourceMapURL, hasSourceURL, true);
    },

    /**
     * @param {!DebuggerAgent.BreakpointId} breakpointId
     * @param {!DebuggerAgent.Location} location
     */
    breakpointResolved: function(breakpointId, location)
    {
        this._debuggerModel._breakpointResolved(breakpointId, location);
    }
}

/**
 * @constructor
 * @extends {WebInspector.SDKObject}
 * @param {!WebInspector.Target} target
 * @param {string} scriptId
 * @param {number} lineNumber
 * @param {number=} columnNumber
 */
WebInspector.DebuggerModel.Location = function(target, scriptId, lineNumber, columnNumber)
{
    WebInspector.SDKObject.call(this, target);
    this._debuggerModel = target.debuggerModel;
    this.scriptId = scriptId;
    this.lineNumber = lineNumber;
    this.columnNumber = columnNumber || 0;
}

/**
 * @param {!WebInspector.Target} target
 * @param {!DebuggerAgent.Location} payload
 * @return {!WebInspector.DebuggerModel.Location}
 */
WebInspector.DebuggerModel.Location.fromPayload = function(target, payload)
{
    return new WebInspector.DebuggerModel.Location(target, payload.scriptId, payload.lineNumber, payload.columnNumber);
}

WebInspector.DebuggerModel.Location.prototype = {
    /**
     * @return {!DebuggerAgent.Location}
     */
    payload: function()
    {
        return { scriptId: this.scriptId, lineNumber: this.lineNumber, columnNumber: this.columnNumber };
    },

    /**
     * @return {!WebInspector.Script}
     */
    script: function()
    {
        return this._debuggerModel.scriptForId(this.scriptId);
    },

    continueToLocation: function()
    {
        this._debuggerModel._agent.continueToLocation(this.payload());
    },

    /**
     * @return {string}
     */
    id: function()
    {
        return this.target().id() + ":" + this.scriptId + ":" + this.lineNumber + ":" + this.columnNumber
    },

    __proto__: WebInspector.SDKObject.prototype
}

/**
 * @constructor
 * @extends {WebInspector.SDKObject}
 * @param {!WebInspector.Target} target
 * @param {!WebInspector.Script} script
 * @param {!DebuggerAgent.CallFrame} payload
 * @param {boolean=} isAsync
 */
WebInspector.DebuggerModel.CallFrame = function(target, script, payload, isAsync)
{
    WebInspector.SDKObject.call(this, target);
    this._debuggerAgent = target.debuggerModel._agent;
    this._script = script;
    this._payload = payload;
    this._isAsync = isAsync;
    this._location = WebInspector.DebuggerModel.Location.fromPayload(target, payload.location);
}

/**
 * @param {!WebInspector.Target} target
 * @param {!Array.<!DebuggerAgent.CallFrame>} callFrames
 * @param {boolean=} isAsync
 * @return {!Array.<!WebInspector.DebuggerModel.CallFrame>}
 */
WebInspector.DebuggerModel.CallFrame.fromPayloadArray = function(target, callFrames, isAsync)
{
    var result = [];
    for (var i = 0; i < callFrames.length; ++i) {
        var callFrame = callFrames[i];
        var script = target.debuggerModel.scriptForId(callFrame.location.scriptId);
        if (script)
            result.push(new WebInspector.DebuggerModel.CallFrame(target, script, callFrame, isAsync));
    }
    return result;
}

WebInspector.DebuggerModel.CallFrame.prototype = {

    /**
     * @return {!WebInspector.Script}
     */
    get script()
    {
        return this._script;
    },

    /**
     * @return {string}
     */
    get id()
    {
        return this._payload.callFrameId;
    },

    /**
     * @return {!Array.<!DebuggerAgent.Scope>}
     */
    get scopeChain()
    {
        return this._payload.scopeChain;
    },

    /**
     * @return {?WebInspector.RemoteObject}
     */
    thisObject: function()
    {
        return this._payload.this ? this.target().runtimeModel.createRemoteObject(this._payload.this) : null;
    },

    /**
     * @return {?WebInspector.RemoteObject}
     */
    returnValue: function()
    {
        return this._payload.returnValue ?  this.target().runtimeModel.createRemoteObject(this._payload.returnValue) : null
    },

    /**
     * @return {string}
     */
    get functionName()
    {
        return this._payload.functionName;
    },

    /**
     * @return {!WebInspector.DebuggerModel.Location}
     */
    location: function()
    {
        return this._location;
    },

    /**
     * @return {boolean}
     */
    isAsync: function()
    {
        return !!this._isAsync;
    },

    /**
     * @param {string} code
     * @param {string} objectGroup
     * @param {boolean} includeCommandLineAPI
     * @param {boolean} doNotPauseOnExceptionsAndMuteConsole
     * @param {boolean} returnByValue
     * @param {boolean} generatePreview
     * @param {function(?RuntimeAgent.RemoteObject, boolean=, ?DebuggerAgent.ExceptionDetails=)} callback
     */
    evaluate: function(code, objectGroup, includeCommandLineAPI, doNotPauseOnExceptionsAndMuteConsole, returnByValue, generatePreview, callback)
    {
        /**
         * @param {?Protocol.Error} error
         * @param {!RuntimeAgent.RemoteObject} result
         * @param {boolean=} wasThrown
         * @param {?DebuggerAgent.ExceptionDetails=} exceptionDetails
         */
        function didEvaluateOnCallFrame(error, result, wasThrown, exceptionDetails)
        {
            if (error) {
                console.error(error);
                callback(null, false);
                return;
            }
            callback(result, wasThrown, exceptionDetails);
        }
        this._debuggerAgent.evaluateOnCallFrame(this._payload.callFrameId, code, objectGroup, includeCommandLineAPI, doNotPauseOnExceptionsAndMuteConsole, returnByValue, generatePreview, didEvaluateOnCallFrame);
    },

    /**
     * @param {function(?Protocol.Error=)=} callback
     */
    restart: function(callback)
    {
        /**
         * @param {?Protocol.Error} error
         * @param {!Array.<!DebuggerAgent.CallFrame>=} callFrames
         * @param {!Object=} details
         * @param {!DebuggerAgent.StackTrace=} asyncStackTrace
         * @this {WebInspector.DebuggerModel.CallFrame}
         */
        function protocolCallback(error, callFrames, details, asyncStackTrace)
        {
            if (!error)
                this.target().debuggerModel.callStackModified(callFrames, details, asyncStackTrace);
            if (callback)
                callback(error);
        }
        this._debuggerAgent.restartFrame(this._payload.callFrameId, protocolCallback.bind(this));
    },

    __proto__: WebInspector.SDKObject.prototype
}

/**
 * @constructor
 * @param {!Array.<!WebInspector.DebuggerModel.CallFrame>} callFrames
 * @param {?WebInspector.DebuggerModel.StackTrace} asyncStackTrace
 * @param {string=} description
 */
WebInspector.DebuggerModel.StackTrace = function(callFrames, asyncStackTrace, description)
{
    this.callFrames = callFrames;
    this.asyncStackTrace = asyncStackTrace;
    this.description = description;
}

/**
 * @param {!WebInspector.Target} target
 * @param {!DebuggerAgent.StackTrace=} payload
 * @param {boolean=} isAsync
 * @return {?WebInspector.DebuggerModel.StackTrace}
 */
WebInspector.DebuggerModel.StackTrace.fromPayload = function(target, payload, isAsync)
{
    if (!payload)
        return null;
    var callFrames = WebInspector.DebuggerModel.CallFrame.fromPayloadArray(target, payload.callFrames, isAsync);
    if (!callFrames.length)
        return null;
    var asyncStackTrace = WebInspector.DebuggerModel.StackTrace.fromPayload(target, payload.asyncStackTrace, true);
    return new WebInspector.DebuggerModel.StackTrace(callFrames, asyncStackTrace, payload.description);
}

/**
 * @constructor
 * @extends {WebInspector.SDKObject}
 * @param {!WebInspector.Target} target
 * @param {!Array.<!DebuggerAgent.CallFrame>} callFrames
 * @param {string} reason
 * @param {!Object|undefined} auxData
 * @param {!Array.<string>} breakpointIds
 * @param {!DebuggerAgent.StackTrace=} asyncStackTrace
 */
WebInspector.DebuggerPausedDetails = function(target, callFrames, reason, auxData, breakpointIds, asyncStackTrace)
{
    WebInspector.SDKObject.call(this, target);
    this.callFrames = WebInspector.DebuggerModel.CallFrame.fromPayloadArray(target, callFrames);
    this.reason = reason;
    this.auxData = auxData;
    this.breakpointIds = breakpointIds;
    this.asyncStackTrace = WebInspector.DebuggerModel.StackTrace.fromPayload(target, asyncStackTrace, true);
}

WebInspector.DebuggerPausedDetails.prototype = {
    /**
     * @return {?WebInspector.RemoteObject}
     */
    exception: function()
    {
        if (this.reason !== WebInspector.DebuggerModel.BreakReason.Exception && this.reason !== WebInspector.DebuggerModel.BreakReason.PromiseRejection)
            return null;
        return this.target().runtimeModel.createRemoteObject(/** @type {!RuntimeAgent.RemoteObject} */(this.auxData));
    },

    __proto__: WebInspector.SDKObject.prototype
}

/**
 * @type {!WebInspector.DebuggerModel}
 */
WebInspector.debuggerModel;
