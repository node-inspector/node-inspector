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
WebInspector.BreakpointManager = function(breakpointStorage, breakpointAddedDelegate, breakpointRemovedDelegate, debuggerModel)
{
    this._breakpointStorage = breakpointStorage;
    this._breakpointAddedDelegate = breakpointAddedDelegate;
    this._breakpointRemovedDelegate = breakpointRemovedDelegate;
    this._breakpointsByUILocation = {};

    this._debuggerModel = debuggerModel;
    this._breakpointsByDebuggerId = {};
    this._debuggerModel.addEventListener(WebInspector.DebuggerModel.Events.BreakpointResolved, this._breakpointResolved, this);

    var breakpoints = this._breakpointStorage.get();
    for (var i = 0; i < breakpoints.length; ++i) {
        var breakpoint = WebInspector.Breakpoint.deserialize(breakpoints[i]);
        if (!this._breakpoint(breakpoint.uiSourceCodeId, breakpoint.lineNumber))
            this._addBreakpointToUI(breakpoint);
    }
}

WebInspector.BreakpointManager.prototype = {
    uiSourceCodeAdded: function(uiSourceCode)
    {
        var breakpoints = this._breakpoints(uiSourceCode.id);
        for (var lineNumber in breakpoints) {
            var breakpoint = breakpoints[lineNumber];
            breakpoint.uiSourceCode = uiSourceCode;
            this._materializeBreakpoint(breakpoint);
            if (breakpoint._debuggerLocation)
                this._breakpointDebuggerLocationChanged(breakpoint, breakpoint._debuggerLocation);
        }
    },

    breakpointsForUISourceCode: function(uiSourceCode)
    {
        return this._breakpoints(uiSourceCode.id);
    },

    setBreakpoint: function(uiSourceCode, lineNumber, condition, enabled)
    {
        if (this._breakpoint(uiSourceCode.id, lineNumber))
            return;

        var persistent = !!uiSourceCode.url;
        var breakpoint = new WebInspector.Breakpoint(uiSourceCode.id, lineNumber, condition, enabled, persistent);
        breakpoint.uiSourceCode = uiSourceCode;
        this._addBreakpointToUI(breakpoint);
        this._materializeBreakpoint(breakpoint);
    },

    removeBreakpoint: function(uiSourceCode, lineNumber)
    {
        var breakpoint = this._breakpoint(uiSourceCode.id, lineNumber);
        if (!breakpoint)
            return;
        this._deleteBreakpointFromUI(breakpoint);
        this._removeBreakpointFromDebugger(breakpoint);
    },

    _materializeBreakpoint: function(breakpoint)
    {
        if (!breakpoint.enabled || breakpoint._materialized)
            return;

        breakpoint._materialized = true;
        var rawLocation = breakpoint.uiSourceCode.rawSourceCode.uiLocationToRawLocation(breakpoint.lineNumber, 0);
        this._setBreakpointInDebugger(breakpoint, rawLocation);
    },

    _breakpointDebuggerLocationChanged: function(breakpoint)
    {
        if (!breakpoint.uiSourceCode)
            return;
        var uiLocation = breakpoint.uiSourceCode.rawSourceCode.rawLocationToUILocation(breakpoint._debuggerLocation);
        if (uiLocation.lineNumber === breakpoint.lineNumber)
            return;

        if (!this._moveBreakpointInUI(breakpoint, uiLocation.lineNumber))
            this._removeBreakpointFromDebugger(breakpoint);
    },

    _addBreakpointToUI: function(breakpoint)
    {
        console.assert(!this._breakpoint(breakpoint.uiSourceCodeId, breakpoint.lineNumber));
        this._breakpoints(breakpoint.uiSourceCodeId)[breakpoint.lineNumber] = breakpoint;
        this._saveBreakpoints();
        this._breakpointAddedDelegate(breakpoint);
    },

    _deleteBreakpointFromUI: function(breakpoint)
    {
        console.assert(this._breakpoint(breakpoint.uiSourceCodeId, breakpoint.lineNumber) === breakpoint);
        delete this._breakpoints(breakpoint.uiSourceCodeId)[breakpoint.lineNumber];
        this._saveBreakpoints();
        this._breakpointRemovedDelegate(breakpoint);
    },

    _moveBreakpointInUI: function(breakpoint, lineNumber)
    {
        this._deleteBreakpointFromUI(breakpoint);
        if (this._breakpoint(breakpoint.uiSourceCodeId, lineNumber))
            return false;
        breakpoint.lineNumber = lineNumber;
        this._addBreakpointToUI(breakpoint);
        return true;
    },

    _breakpoints: function(uiSourceCodeId)
    {
        if (!this._breakpointsByUILocation[uiSourceCodeId])
            this._breakpointsByUILocation[uiSourceCodeId] = {};
        return this._breakpointsByUILocation[uiSourceCodeId];
    },

    _breakpoint: function(uiSourceCodeId, lineNumber)
    {
        return this._breakpoints(uiSourceCodeId)[lineNumber];
    },

    _forEachBreakpoint: function(handler)
    {
        for (var uiSourceCodeId in this._breakpointsByUILocation) {
            var breakpoints = this._breakpointsByUILocation[uiSourceCodeId];
            for (var lineNumber in breakpoints)
                handler(breakpoints[lineNumber]);
        }
    },

    _setBreakpointInDebugger: function(breakpoint, rawLocation)
    {
        function didSetBreakpoint(breakpointId, locations)
        {
            if (breakpoint === this._breakpoint(breakpoint.uiSourceCodeId, breakpoint.lineNumber)) {
                if (!breakpointId) {
                    this._deleteBreakpointFromUI(breakpoint);
                    return;
                }
            } else {
                if (breakpointId)
                    this._debuggerModel.removeBreakpoint(breakpointId);
                return;
            }

            this._breakpointsByDebuggerId[breakpointId] = breakpoint;
            breakpoint._debuggerId = breakpointId;
            breakpoint._debuggerLocation = locations[0];
            if (breakpoint._debuggerLocation)
                this._breakpointDebuggerLocationChanged(breakpoint);
        }
        this._debuggerModel.setBreakpointByScriptLocation(rawLocation, breakpoint.condition, didSetBreakpoint.bind(this));
    },

    _removeBreakpointFromDebugger: function(breakpoint)
    {
        if (!("_debuggerId" in breakpoint))
            return;
        this._debuggerModel.removeBreakpoint(breakpoint._debuggerId);
        delete this._breakpointsByDebuggerId[breakpoint._debuggerId];
        delete breakpoint._debuggerId;
        delete breakpoint._debuggerLocation;
    },

    _breakpointResolved: function(event)
    {
        var breakpoint = this._breakpointsByDebuggerId[event.data.breakpointId];
        breakpoint._debuggerLocation = event.data.location;
        this._breakpointDebuggerLocationChanged(breakpoint);
    },

    _saveBreakpoints: function()
    {
        var serializedBreakpoints = [];
        function serializePersistent(breakpoint)
        {
            if (breakpoint.persistent)
                serializedBreakpoints.push(breakpoint.serialize());
        }
        this._forEachBreakpoint(serializePersistent.bind(this));
        this._breakpointStorage.set(serializedBreakpoints);
    },

    reset: function()
    {
        function resetBreakpoint(breakpoint)
        {
            this._removeBreakpointFromDebugger(breakpoint);
            delete breakpoint._materialized;
        }
        this._forEachBreakpoint(resetBreakpoint.bind(this));
    },

    debuggerReset: function()
    {
        function resetOrDeleteBreakpoint(breakpoint)
        {
            if (breakpoint.persistent) {
                delete breakpoint.uiSourceCode;
                delete breakpoint._debuggerLocation;
            } else {
                this._deleteBreakpointFromUI(breakpoint);
                delete this._breakpointsByDebuggerId[breakpoint._debuggerId];
            }
        }
        this._forEachBreakpoint(resetOrDeleteBreakpoint.bind(this));

        for (var id in this._breakpointsByUILocation) {
            var empty = true;
            for (var lineNumber in this._breakpointsByUILocation[id]) {
                empty = false;
                break;
            }
            if (empty)
                delete this._breakpointsByUILocation[id];
        }
    }
}

/**
 * @constructor
 */
WebInspector.Breakpoint = function(uiSourceCodeId, lineNumber, condition, enabled, persistent)
{
    this.uiSourceCodeId = uiSourceCodeId;
    this.lineNumber = lineNumber;
    this.condition = condition;
    this.enabled = enabled;
    this.persistent = persistent;
}

WebInspector.Breakpoint.prototype = {
    serialize: function()
    {
        var serializedBreakpoint = {};
        serializedBreakpoint.sourceFileId = this.uiSourceCodeId;
        serializedBreakpoint.lineNumber = this.lineNumber;
        serializedBreakpoint.condition = this.condition;
        serializedBreakpoint.enabled = this.enabled;
        return serializedBreakpoint;
    }
}

WebInspector.Breakpoint.deserialize = function(serializedBreakpoint)
{
    return new WebInspector.Breakpoint(
            serializedBreakpoint.sourceFileId,
            serializedBreakpoint.lineNumber,
            serializedBreakpoint.condition,
            serializedBreakpoint.enabled,
            true);
}
