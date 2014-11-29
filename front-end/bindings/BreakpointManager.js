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
 * @extends {WebInspector.Object}
 * @implements {WebInspector.TargetManager.Observer}
 * @param {!WebInspector.Setting} breakpointStorage
 * @param {!WebInspector.Workspace} workspace
 * @param {!WebInspector.TargetManager} targetManager
 * @param {!WebInspector.DebuggerWorkspaceBinding} debuggerWorkspaceBinding
 */
WebInspector.BreakpointManager = function(breakpointStorage, workspace, targetManager, debuggerWorkspaceBinding)
{
    this._storage = new WebInspector.BreakpointManager.Storage(this, breakpointStorage);
    this._workspace = workspace;
    this._targetManager = targetManager;
    this._debuggerWorkspaceBinding = debuggerWorkspaceBinding;

    this._breakpointsActive = true;
    this._breakpointsForUISourceCode = new Map();
    this._breakpointsForPrimaryUISourceCode = new Map();
    /** @type {!StringMultimap.<!WebInspector.BreakpointManager.Breakpoint>} */
    this._provisionalBreakpoints = new StringMultimap();

    this._workspace.addEventListener(WebInspector.Workspace.Events.ProjectRemoved, this._projectRemoved, this);
    this._workspace.addEventListener(WebInspector.Workspace.Events.UISourceCodeAdded, this._uiSourceCodeAdded, this);
    this._workspace.addEventListener(WebInspector.Workspace.Events.UISourceCodeRemoved, this._uiSourceCodeRemoved, this);
}

WebInspector.BreakpointManager.Events = {
    BreakpointAdded: "breakpoint-added",
    BreakpointRemoved: "breakpoint-removed",
    BreakpointsActiveStateChanged: "BreakpointsActiveStateChanged"
}

WebInspector.BreakpointManager._sourceFileId = function(uiSourceCode)
{
    if (!uiSourceCode.url)
        return "";
    return uiSourceCode.uri();
}

/**
 * @param {string} sourceFileId
 * @param {number} lineNumber
 * @param {number} columnNumber
 * @return {string}
 */
WebInspector.BreakpointManager._breakpointStorageId = function(sourceFileId, lineNumber, columnNumber)
{
    if (!sourceFileId)
        return "";
    return sourceFileId + ":" + lineNumber + ":" + columnNumber;
}

WebInspector.BreakpointManager.prototype = {
    /**
     * @param {!WebInspector.Target} target
     */
    targetAdded: function(target) {
        if (!this._breakpointsActive)
            target.debuggerAgent().setBreakpointsActive(this._breakpointsActive);
    },

    /**
     * @param {!WebInspector.Target} target
     */
    targetRemoved: function(target) { },

    /**
     * @param {string} sourceFileId
     * @return {!Map.<string, !WebInspector.BreakpointManager.Breakpoint>}
     */
    _provisionalBreakpointsForSourceFileId: function(sourceFileId)
    {
        var result = new Map();
        var breakpoints = this._provisionalBreakpoints.get(sourceFileId).valuesArray();
        for (var i = 0; i < breakpoints.length; ++i)
            result.set(breakpoints[i]._breakpointStorageId(), breakpoints[i]);
        return result;
    },

    removeProvisionalBreakpointsForTest: function()
    {
        var breakpoints = this._provisionalBreakpoints.valuesArray();
        for (var i = 0; i < breakpoints.length; ++i)
            breakpoints[i].remove();
        this._provisionalBreakpoints.clear();
    },

    /**
     * @param {!WebInspector.UISourceCode} uiSourceCode
     */
    _restoreBreakpoints: function(uiSourceCode)
    {
        var sourceFileId = WebInspector.BreakpointManager._sourceFileId(uiSourceCode);
        if (!sourceFileId)
            return;

        this._storage.mute();
        var breakpointItems = this._storage.breakpointItems(uiSourceCode);
        var provisionalBreakpoints = this._provisionalBreakpointsForSourceFileId(sourceFileId);
        for (var i = 0; i < breakpointItems.length; ++i) {
            var breakpointItem = breakpointItems[i];
            var itemStorageId = WebInspector.BreakpointManager._breakpointStorageId(breakpointItem.sourceFileId, breakpointItem.lineNumber, breakpointItem.columnNumber);
            var provisionalBreakpoint = provisionalBreakpoints.get(itemStorageId);
            if (provisionalBreakpoint) {
                if (!this._breakpointsForPrimaryUISourceCode.get(uiSourceCode))
                    this._breakpointsForPrimaryUISourceCode.set(uiSourceCode, []);
                this._breakpointsForPrimaryUISourceCode.get(uiSourceCode).push(provisionalBreakpoint);
                provisionalBreakpoint._updateBreakpoint();
            } else {
                this._innerSetBreakpoint(uiSourceCode, breakpointItem.lineNumber, breakpointItem.columnNumber, breakpointItem.condition, breakpointItem.enabled);
            }
        }
        this._provisionalBreakpoints.removeAll(sourceFileId);
        this._storage.unmute();
    },

    /**
     * @param {!WebInspector.Event} event
     */
    _uiSourceCodeAdded: function(event)
    {
        var uiSourceCode = /** @type {!WebInspector.UISourceCode} */ (event.data);
        this._restoreBreakpoints(uiSourceCode);
        if (uiSourceCode.contentType() === WebInspector.resourceTypes.Script || uiSourceCode.contentType() === WebInspector.resourceTypes.Document)
            uiSourceCode.addEventListener(WebInspector.UISourceCode.Events.SourceMappingChanged, this._uiSourceCodeMappingChanged, this);
    },

    /**
     * @param {!WebInspector.Event} event
     */
    _uiSourceCodeRemoved: function(event)
    {
        var uiSourceCode = /** @type {!WebInspector.UISourceCode} */ (event.data);
        this._removeUISourceCode(uiSourceCode);
    },

    /**
     * @param {!WebInspector.Event} event
     */
    _uiSourceCodeMappingChanged: function(event)
    {
        var uiSourceCode = /** @type {!WebInspector.UISourceCode} */ (event.target);
        var isIdentity = /** @type {boolean} */ (event.data.isIdentity);
        var target = /** @type {!WebInspector.Target} */ (event.data.target);
        if (isIdentity)
            return;
        var breakpoints = this._breakpointsForPrimaryUISourceCode.get(uiSourceCode) || [];
        for (var i = 0; i < breakpoints.length; ++i)
            breakpoints[i]._updateInDebuggerForTarget(target);
    },

    /**
     * @param {!WebInspector.UISourceCode} uiSourceCode
     */
    _removeUISourceCode: function(uiSourceCode)
    {
        var breakpoints = this._breakpointsForPrimaryUISourceCode.get(uiSourceCode) || [];
        var sourceFileId = WebInspector.BreakpointManager._sourceFileId(uiSourceCode);
        for (var i = 0; i < breakpoints.length; ++i) {
            breakpoints[i]._resetLocations();
            if (breakpoints[i].enabled())
                this._provisionalBreakpoints.set(sourceFileId, breakpoints[i]);
        }
        uiSourceCode.removeEventListener(WebInspector.UISourceCode.Events.SourceMappingChanged, this._uiSourceCodeMappingChanged, this);
        this._breakpointsForPrimaryUISourceCode.remove(uiSourceCode);
    },

    /**
     * @param {!WebInspector.UISourceCode} uiSourceCode
     * @param {number} lineNumber
     * @param {number} columnNumber
     * @param {string} condition
     * @param {boolean} enabled
     * @return {!WebInspector.BreakpointManager.Breakpoint}
     */
    setBreakpoint: function(uiSourceCode, lineNumber, columnNumber, condition, enabled)
    {
        this.setBreakpointsActive(true);
        return this._innerSetBreakpoint(uiSourceCode, lineNumber, columnNumber, condition, enabled);
    },

    /**
     * @param {!WebInspector.UISourceCode} uiSourceCode
     * @param {number} lineNumber
     * @param {number} columnNumber
     * @param {string} condition
     * @param {boolean} enabled
     * @return {!WebInspector.BreakpointManager.Breakpoint}
     */
    _innerSetBreakpoint: function(uiSourceCode, lineNumber, columnNumber, condition, enabled)
    {
        var breakpoint = this.findBreakpoint(uiSourceCode, lineNumber, columnNumber);
        if (breakpoint) {
            breakpoint._updateState(condition, enabled);
            return breakpoint;
        }
        var projectId = uiSourceCode.project().id();
        var path = uiSourceCode.path();
        var sourceFileId = WebInspector.BreakpointManager._sourceFileId(uiSourceCode);
        breakpoint = new WebInspector.BreakpointManager.Breakpoint(this, projectId, path, sourceFileId, lineNumber, columnNumber, condition, enabled);
        if (!this._breakpointsForPrimaryUISourceCode.get(uiSourceCode))
            this._breakpointsForPrimaryUISourceCode.set(uiSourceCode, []);
        this._breakpointsForPrimaryUISourceCode.get(uiSourceCode).push(breakpoint);
        return breakpoint;
    },

    /**
     * @param {!WebInspector.UISourceCode} uiSourceCode
     * @param {number} lineNumber
     * @param {number} columnNumber
     * @return {?WebInspector.BreakpointManager.Breakpoint}
     */
    findBreakpoint: function(uiSourceCode, lineNumber, columnNumber)
    {
        var breakpoints = this._breakpointsForUISourceCode.get(uiSourceCode);
        var lineBreakpoints = breakpoints ? breakpoints.get(String(lineNumber)) : null;
        var columnBreakpoints = lineBreakpoints ? lineBreakpoints.get(String(columnNumber)) : null;
        return columnBreakpoints ? columnBreakpoints[0] : null;
    },

    /**
     * @param {!WebInspector.UISourceCode} uiSourceCode
     * @param {number} lineNumber
     * @return {?WebInspector.BreakpointManager.Breakpoint}
     */
    findBreakpointOnLine: function(uiSourceCode, lineNumber)
    {
        var breakpoints = this._breakpointsForUISourceCode.get(uiSourceCode);
        var lineBreakpoints = breakpoints ? breakpoints.get(String(lineNumber)) : null;
        return lineBreakpoints ? lineBreakpoints.valuesArray()[0][0] : null;
    },

    /**
     * @param {!WebInspector.UISourceCode} uiSourceCode
     * @return {!Array.<!WebInspector.BreakpointManager.Breakpoint>}
     */
    breakpointsForUISourceCode: function(uiSourceCode)
    {
        var result = [];
        var uiSourceCodeBreakpoints = this._breakpointsForUISourceCode.get(uiSourceCode);
        var breakpoints = uiSourceCodeBreakpoints ? uiSourceCodeBreakpoints.valuesArray() : [];
        for (var i = 0; i < breakpoints.length; ++i) {
            var lineBreakpoints = breakpoints[i];
            var columnBreakpointArrays = lineBreakpoints ? lineBreakpoints.valuesArray() : [];
            result = result.concat.apply(result, columnBreakpointArrays);
        }
        return result;
    },

    /**
     * @return {!Array.<!WebInspector.BreakpointManager.Breakpoint>}
     */
    allBreakpoints: function()
    {
        var result = [];
        var uiSourceCodes = this._breakpointsForUISourceCode.keysArray();
        for (var i = 0; i < uiSourceCodes.length; ++i)
            result = result.concat(this.breakpointsForUISourceCode(uiSourceCodes[i]));
        return result;
    },

    /**
     * @param {!WebInspector.UISourceCode} uiSourceCode
     * @return {!Array.<!{breakpoint: !WebInspector.BreakpointManager.Breakpoint, uiLocation: !WebInspector.UILocation}>}
     */
    breakpointLocationsForUISourceCode: function(uiSourceCode)
    {
        var uiSourceCodeBreakpoints = this._breakpointsForUISourceCode.get(uiSourceCode);
        var lineNumbers = uiSourceCodeBreakpoints ? uiSourceCodeBreakpoints.keysArray() : [];
        var result = [];
        for (var i = 0; i < lineNumbers.length; ++i) {
            var lineBreakpoints = uiSourceCodeBreakpoints.get(lineNumbers[i]);
            var columnNumbers = lineBreakpoints.keysArray();
            for (var j = 0; j < columnNumbers.length; ++j) {
                var columnBreakpoints = lineBreakpoints.get(columnNumbers[j]);
                var lineNumber = parseInt(lineNumbers[i], 10);
                var columnNumber = parseInt(columnNumbers[j], 10);
                for (var k = 0; k < columnBreakpoints.length; ++k) {
                    var breakpoint = columnBreakpoints[k];
                    var uiLocation = uiSourceCode.uiLocation(lineNumber, columnNumber);
                    result.push({breakpoint: breakpoint, uiLocation: uiLocation});
                }
            }
        }
        return result;
    },

    /**
     * @return {!Array.<!{breakpoint: !WebInspector.BreakpointManager.Breakpoint, uiLocation: !WebInspector.UILocation}>}
     */
    allBreakpointLocations: function()
    {
        var result = [];
        var uiSourceCodes = this._breakpointsForUISourceCode.keysArray();
        for (var i = 0; i < uiSourceCodes.length; ++i)
            result = result.concat(this.breakpointLocationsForUISourceCode(uiSourceCodes[i]));
        return result;
    },

    /**
     * @param {boolean} toggleState
     */
    toggleAllBreakpoints: function(toggleState)
    {
        var breakpoints = this.allBreakpoints();
        for (var i = 0; i < breakpoints.length; ++i)
            breakpoints[i].setEnabled(toggleState);
    },

    removeAllBreakpoints: function()
    {
        var breakpoints = this.allBreakpoints();
        for (var i = 0; i < breakpoints.length; ++i)
            breakpoints[i].remove();
    },

    _projectRemoved: function(event)
    {
        var project = /** @type {!WebInspector.Project} */ (event.data);
        var uiSourceCodes = project.uiSourceCodes();
        for (var i = 0; i < uiSourceCodes.length; ++i)
            this._removeUISourceCode(uiSourceCodes[i]);
    },

    /**
     * @param {!WebInspector.BreakpointManager.Breakpoint} breakpoint
     * @param {boolean} removeFromStorage
     */
    _removeBreakpoint: function(breakpoint, removeFromStorage)
    {
        var uiSourceCode = breakpoint.uiSourceCode();
        var breakpoints = uiSourceCode ? this._breakpointsForPrimaryUISourceCode.get(uiSourceCode) || [] : [];
        breakpoints.remove(breakpoint);
        if (removeFromStorage)
            this._storage._removeBreakpoint(breakpoint);
        this._provisionalBreakpoints.remove(breakpoint._sourceFileId, breakpoint);
    },

    /**
     * @param {!WebInspector.BreakpointManager.Breakpoint} breakpoint
     * @param {!WebInspector.UILocation} uiLocation
     */
    _uiLocationAdded: function(breakpoint, uiLocation)
    {
        var breakpoints = this._breakpointsForUISourceCode.get(uiLocation.uiSourceCode);
        if (!breakpoints) {
            breakpoints = new Map();
            this._breakpointsForUISourceCode.set(uiLocation.uiSourceCode, breakpoints);
        }
        var lineBreakpoints = breakpoints.get(String(uiLocation.lineNumber));
        if (!lineBreakpoints) {
            lineBreakpoints = new Map();
            breakpoints.set(String(uiLocation.lineNumber), lineBreakpoints);
        }
        var columnBreakpoints = lineBreakpoints.get(String(uiLocation.columnNumber));
        if (!columnBreakpoints) {
            columnBreakpoints = [];
            lineBreakpoints.set(String(uiLocation.columnNumber), columnBreakpoints);
        }
        columnBreakpoints.push(breakpoint);
        this.dispatchEventToListeners(WebInspector.BreakpointManager.Events.BreakpointAdded, {breakpoint: breakpoint, uiLocation: uiLocation});
    },

    /**
     * @param {!WebInspector.BreakpointManager.Breakpoint} breakpoint
     * @param {!WebInspector.UILocation} uiLocation
     */
    _uiLocationRemoved: function(breakpoint, uiLocation)
    {
        var breakpoints = this._breakpointsForUISourceCode.get(uiLocation.uiSourceCode);
        if (!breakpoints)
            return;

        var lineBreakpoints = breakpoints.get(String(uiLocation.lineNumber));
        if (!lineBreakpoints)
            return;
        var columnBreakpoints = lineBreakpoints.get(String(uiLocation.columnNumber));
        if (!columnBreakpoints)
            return;
        columnBreakpoints.remove(breakpoint);
        if (!columnBreakpoints.length)
            lineBreakpoints.remove(String(uiLocation.columnNumber));
        if (!lineBreakpoints.size)
            breakpoints.remove(String(uiLocation.lineNumber));
        if (!breakpoints.size)
            this._breakpointsForUISourceCode.remove(uiLocation.uiSourceCode);
        this.dispatchEventToListeners(WebInspector.BreakpointManager.Events.BreakpointRemoved, {breakpoint: breakpoint, uiLocation: uiLocation});
    },

    /**
     * @param {boolean} active
     */
    setBreakpointsActive: function(active)
    {
        if (this._breakpointsActive === active)
            return;

        this._breakpointsActive = active;
        var targets = WebInspector.targetManager.targets();
        for (var i = 0; i < targets.length; ++i)
            targets[i].debuggerAgent().setBreakpointsActive(active);

        this.dispatchEventToListeners(WebInspector.BreakpointManager.Events.BreakpointsActiveStateChanged, active);
    },

    /**
     * @return {boolean}
     */
    breakpointsActive: function()
    {
        return this._breakpointsActive;
    },

    __proto__: WebInspector.Object.prototype
}

/**
 * @constructor
 * @implements {WebInspector.TargetManager.Observer}
 * @param {!WebInspector.BreakpointManager} breakpointManager
 * @param {string} projectId
 * @param {string} path
 * @param {string} sourceFileId
 * @param {number} lineNumber
 * @param {number} columnNumber
 * @param {string} condition
 * @param {boolean} enabled
 */
WebInspector.BreakpointManager.Breakpoint = function(breakpointManager, projectId, path, sourceFileId, lineNumber, columnNumber, condition, enabled)
{
    this._breakpointManager = breakpointManager;
    this._projectId = projectId;
    this._path = path;
    this._lineNumber = lineNumber;
    this._columnNumber = columnNumber;
    this._sourceFileId = sourceFileId;

    /** @type {!Object.<string, number>} */
    this._numberOfDebuggerLocationForUILocation = {};

    // Force breakpoint update.
    /** @type {string} */ this._condition;
    /** @type {boolean} */ this._enabled;
    /** @type {boolean} */ this._isRemoved;
    /** @type {!WebInspector.UILocation|undefined} */ this._fakePrimaryLocation;

    this._currentState = null;
    /** @type {!Map.<!WebInspector.Target, !WebInspector.BreakpointManager.TargetBreakpoint>}*/
    this._targetBreakpoints = new Map();
    this._updateState(condition, enabled);
    this._breakpointManager._targetManager.observeTargets(this);
}

WebInspector.BreakpointManager.Breakpoint.prototype = {
    /**
     * @param {!WebInspector.Target} target
     */
    targetAdded: function(target)
    {
        this._targetBreakpoints.set(target, new WebInspector.BreakpointManager.TargetBreakpoint(target, this, this._breakpointManager._debuggerWorkspaceBinding));
    },

    /**
     * @param {!WebInspector.Target} target
     */
    targetRemoved: function(target)
    {
        var targetBreakpoint = this._targetBreakpoints.remove(target);
        targetBreakpoint._cleanUpAfterDebuggerIsGone();
        targetBreakpoint._removeEventListeners();
    },

    /**
     * @return {string}
     */
    projectId: function()
    {
        return this._projectId;
    },

    /**
     * @return {string}
     */
    path: function()
    {
        return this._path;
    },

    /**
     * @return {number}
     */
    lineNumber: function()
    {
        return this._lineNumber;
    },

    /**
     * @return {number}
     */
    columnNumber: function()
    {
        return this._columnNumber;
    },

    /**
     * @return {?WebInspector.UISourceCode}
     */
    uiSourceCode: function()
    {
        return this._breakpointManager._workspace.uiSourceCode(this._projectId, this._path);
    },

    /**
     * @param {?WebInspector.UILocation} oldUILocation
     * @param {!WebInspector.UILocation} newUILocation
     */
    _replaceUILocation: function(oldUILocation, newUILocation)
    {
        if (this._isRemoved)
            return;

        this._removeUILocation(oldUILocation, true);
        this._removeFakeBreakpointAtPrimaryLocation();

        if (!this._numberOfDebuggerLocationForUILocation[newUILocation.id()])
            this._numberOfDebuggerLocationForUILocation[newUILocation.id()] = 0;

        if (++this._numberOfDebuggerLocationForUILocation[newUILocation.id()] === 1)
            this._breakpointManager._uiLocationAdded(this, newUILocation);
    },

    /**
     * @param {?WebInspector.UILocation} uiLocation
     * @param {boolean=} muteCreationFakeBreakpoint
     */
    _removeUILocation: function(uiLocation, muteCreationFakeBreakpoint)
    {
        if (!uiLocation || --this._numberOfDebuggerLocationForUILocation[uiLocation.id()] !== 0)
            return;

        delete this._numberOfDebuggerLocationForUILocation[uiLocation.id()];
        this._breakpointManager._uiLocationRemoved(this, uiLocation);
        if (!muteCreationFakeBreakpoint)
            this._fakeBreakpointAtPrimaryLocation();
    },

    /**
     * @return {boolean}
     */
    enabled: function()
    {
        return this._enabled;
    },

    /**
     * @param {boolean} enabled
     */
    setEnabled: function(enabled)
    {
        this._updateState(this._condition, enabled);
    },

    /**
     * @return {string}
     */
    condition: function()
    {
        return this._condition;
    },

    /**
     * @param {string} condition
     */
    setCondition: function(condition)
    {
        this._updateState(condition, this._enabled);
    },

    /**
     * @param {string} condition
     * @param {boolean} enabled
     */
    _updateState: function(condition, enabled)
    {
        if (this._enabled === enabled && this._condition === condition)
            return;
        this._enabled = enabled;
        this._condition = condition;
        this._breakpointManager._storage._updateBreakpoint(this);
        this._updateBreakpoint();
    },

    _updateBreakpoint: function()
    {
        this._removeFakeBreakpointAtPrimaryLocation();
        this._fakeBreakpointAtPrimaryLocation();
        var targetBreakpoints = this._targetBreakpoints.valuesArray();
        for (var i = 0; i < targetBreakpoints.length; ++i)
            targetBreakpoints[i]._scheduleUpdateInDebugger();
    },

    /**
     * @param {boolean=} keepInStorage
     */
    remove: function(keepInStorage)
    {

        this._isRemoved = true;
        var removeFromStorage = !keepInStorage;
        this._removeFakeBreakpointAtPrimaryLocation();
        var targetBreakpoints = this._targetBreakpoints.valuesArray();
        for (var i = 0; i < targetBreakpoints.length; ++i) {
            targetBreakpoints[i]._scheduleUpdateInDebugger();
            targetBreakpoints[i]._removeEventListeners();
        }

        this._breakpointManager._removeBreakpoint(this, removeFromStorage);
        this._breakpointManager._targetManager.unobserveTargets(this);
    },

    /**
     * @param {!WebInspector.Target} target
     */
    _updateInDebuggerForTarget: function(target)
    {
        this._targetBreakpoints.get(target)._scheduleUpdateInDebugger();
    },

    /**
     * @return {string}
     */
    _breakpointStorageId: function()
    {
        return WebInspector.BreakpointManager._breakpointStorageId(this._sourceFileId, this._lineNumber, this._columnNumber);
    },

    _fakeBreakpointAtPrimaryLocation: function()
    {
        if (this._isRemoved || !Object.isEmpty(this._numberOfDebuggerLocationForUILocation) || this._fakePrimaryLocation)
            return;

        var uiSourceCode = this._breakpointManager._workspace.uiSourceCode(this._projectId, this._path);
        if (!uiSourceCode)
            return;

        this._fakePrimaryLocation = uiSourceCode.uiLocation(this._lineNumber, this._columnNumber);
        if (this._fakePrimaryLocation)
            this._breakpointManager._uiLocationAdded(this, this._fakePrimaryLocation);
    },

    _removeFakeBreakpointAtPrimaryLocation: function()
    {
        if (this._fakePrimaryLocation) {
            this._breakpointManager._uiLocationRemoved(this, this._fakePrimaryLocation);
            delete this._fakePrimaryLocation;
        }
    },

    _resetLocations: function()
    {
        this._removeFakeBreakpointAtPrimaryLocation();
        var targetBreakpoints = this._targetBreakpoints.valuesArray();
        for (var i = 0; i < targetBreakpoints.length; ++i)
            targetBreakpoints[i]._resetLocations();
    }
}

/**
 * @constructor
 * @extends {WebInspector.SDKObject}
 * @param {!WebInspector.Target} target
 * @param {!WebInspector.BreakpointManager.Breakpoint} breakpoint
 * @param {!WebInspector.DebuggerWorkspaceBinding} debuggerWorkspaceBinding
 */
WebInspector.BreakpointManager.TargetBreakpoint = function(target, breakpoint, debuggerWorkspaceBinding)
{
    WebInspector.SDKObject.call(this, target);
    this._breakpoint = breakpoint;
    this._debuggerWorkspaceBinding = debuggerWorkspaceBinding;

    /** @type {!Array.<!WebInspector.DebuggerWorkspaceBinding.Location>} */
    this._liveLocations = [];

    /** @type {!Object.<string, !WebInspector.UILocation>} */
    this._uiLocations = {};
    target.debuggerModel.addEventListener(WebInspector.DebuggerModel.Events.DebuggerWasDisabled, this._cleanUpAfterDebuggerIsGone, this);
    target.debuggerModel.addEventListener(WebInspector.DebuggerModel.Events.DebuggerWasEnabled, this._scheduleUpdateInDebugger, this);
    this._hasPendingUpdate = false;
    this._isUpdating = false;
    this._cancelCallback = false;
    this._currentState = null;
    if (target.debuggerModel.debuggerEnabled())
        this._scheduleUpdateInDebugger();
}

WebInspector.BreakpointManager.TargetBreakpoint.prototype = {

    /**
     * @return {!WebInspector.DebuggerModel}
     */
    _debuggerModel: function()
    {
        return this.target().debuggerModel;
    },

    _resetLocations: function()
    {
        var uiLocations = Object.values(this._uiLocations);
        for (var i = 0; i < uiLocations.length; ++i)
            this._breakpoint._removeUILocation(uiLocations[i]);

        this._uiLocations = {};

        for (var i = 0; i < this._liveLocations.length; ++i)
            this._liveLocations[i].dispose();
        this._liveLocations = [];
    },

    _scheduleUpdateInDebugger: function()
    {
        if (this._isUpdating) {
            this._hasPendingUpdate = true;
            return;
        }

        this._isUpdating = true;
        this._updateInDebugger(this._didUpdateInDebugger.bind(this));
    },

    _didUpdateInDebugger: function()
    {
        this._isUpdating = false;
        if (this._hasPendingUpdate) {
            this._hasPendingUpdate = false;
            this._scheduleUpdateInDebugger();
        }
    },

    /**
     * @return {boolean}
     */
    _scriptDiverged: function()
    {
        var uiSourceCode = this._breakpoint.uiSourceCode();
        if (!uiSourceCode)
            return false;
        var scriptFile = this._debuggerWorkspaceBinding.scriptFile(uiSourceCode, this.target());
        return !!scriptFile && scriptFile.hasDivergedFromVM();

    },

    /**
     * @param {function()} callback
     */
    _updateInDebugger: function(callback)
    {
        if (this.target().isDetached()) {
            this._cleanUpAfterDebuggerIsGone();
            callback();
            return;
        }

        var uiSourceCode = this._breakpoint.uiSourceCode();
        var lineNumber = this._breakpoint._lineNumber;
        var columnNumber = this._breakpoint._columnNumber;
        var condition = this._breakpoint.condition();

        var debuggerLocation = uiSourceCode ? this._debuggerWorkspaceBinding.uiLocationToRawLocation(this.target(), uiSourceCode, lineNumber, columnNumber) : null;
        var newState;
        if (this._breakpoint._isRemoved || !this._breakpoint.enabled() || this._scriptDiverged())
            newState = null;
        else if (debuggerLocation) {
            var script = debuggerLocation.script();
            if (script.sourceURL)
                newState = new WebInspector.BreakpointManager.Breakpoint.State(script.sourceURL, null, debuggerLocation.lineNumber, debuggerLocation.columnNumber, condition);
            else
                newState = new WebInspector.BreakpointManager.Breakpoint.State(null, debuggerLocation.scriptId, debuggerLocation.lineNumber, debuggerLocation.columnNumber, condition)
        } else if (this._breakpoint._currentState && this._breakpoint._currentState.url) {
            var position = this._breakpoint._currentState;
            newState = new WebInspector.BreakpointManager.Breakpoint.State(position.url, null, position.lineNumber, position.columnNumber, condition);
        } else if (uiSourceCode && uiSourceCode.url)
            newState = new WebInspector.BreakpointManager.Breakpoint.State(uiSourceCode.url, null, lineNumber, columnNumber, condition);

        if (this._debuggerId && WebInspector.BreakpointManager.Breakpoint.State.equals(newState, this._currentState)) {
            callback();
            return;
        }

        this._breakpoint._currentState = newState;

        if (this._debuggerId) {
            this._resetLocations();
            this._debuggerModel().removeBreakpoint(this._debuggerId, this._didRemoveFromDebugger.bind(this, callback));
            this._scheduleUpdateInDebugger();
            this._currentState = null;
            return;
        }

        if (!newState) {
            callback();
            return;
        }

        var updateCallback = this._didSetBreakpointInDebugger.bind(this, callback);
        if (newState.url)
            this._debuggerModel().setBreakpointByURL(newState.url, newState.lineNumber, newState.columnNumber, this._breakpoint.condition(), updateCallback);
        else if (newState.scriptId)
            this._debuggerModel().setBreakpointBySourceId(/** @type {!WebInspector.DebuggerModel.Location} */ (debuggerLocation), condition, updateCallback);

        this._currentState = newState;
    },

    /**
     * @param {function()} callback
     * @param {?DebuggerAgent.BreakpointId} breakpointId
     * @param {!Array.<!WebInspector.DebuggerModel.Location>} locations
     */
    _didSetBreakpointInDebugger: function(callback, breakpointId, locations)
    {
        if (this._cancelCallback) {
            this._cancelCallback = false;
            callback();
            return;
        }

        if (!breakpointId) {
            this._breakpoint.remove(true);
            callback();
            return;
        }

        this._debuggerId = breakpointId;
        this.target().debuggerModel.addBreakpointListener(this._debuggerId, this._breakpointResolved, this);
        for (var i = 0; i < locations.length; ++i) {
            if (!this._addResolvedLocation(locations[i]))
                break;
        }
        callback();
    },

    /**
     * @param {function()} callback
     */
    _didRemoveFromDebugger: function(callback)
    {
        if (this._cancelCallback) {
            this._cancelCallback = false;
            callback();
            return;
        }

        this._resetLocations();
        this.target().debuggerModel.removeBreakpointListener(this._debuggerId, this._breakpointResolved, this);
        delete this._debuggerId;
        callback();
    },

    /**
     * @param {!WebInspector.Event} event
     */
    _breakpointResolved: function(event)
    {
        this._addResolvedLocation(/** @type {!WebInspector.DebuggerModel.Location}*/ (event.data));
    },

    /**
     * @param {!WebInspector.DebuggerModel.Location} location
     * @param {!WebInspector.UILocation} uiLocation
     */
    _locationUpdated: function(location, uiLocation)
    {
        var oldUILocation = this._uiLocations[location.id()] || null;
        this._uiLocations[location.id()] = uiLocation;
        this._breakpoint._replaceUILocation(oldUILocation, uiLocation);
    },

    /**
     * @param {!WebInspector.DebuggerModel.Location} location
     * @return {boolean}
     */
    _addResolvedLocation: function(location)
    {
        var uiLocation = this._debuggerWorkspaceBinding.rawLocationToUILocation(location);
        var breakpoint = this._breakpoint._breakpointManager.findBreakpoint(uiLocation.uiSourceCode, uiLocation.lineNumber, uiLocation.columnNumber);
        if (breakpoint && breakpoint !== this._breakpoint) {
            // location clash
            this._breakpoint.remove();
            return false;
        }
        this._liveLocations.push(this._debuggerWorkspaceBinding.createLiveLocation(location, this._locationUpdated.bind(this, location)));
        return true;
    },

    _cleanUpAfterDebuggerIsGone: function()
    {
        if (this._isUpdating)
            this._cancelCallback = true;

        this._resetLocations();
        this._currentState = null;
        if (this._debuggerId)
            this._didRemoveFromDebugger(function() {});
    },

    _removeEventListeners: function()
    {
        this.target().debuggerModel.removeEventListener(WebInspector.DebuggerModel.Events.DebuggerWasDisabled, this._cleanUpAfterDebuggerIsGone, this);
        this.target().debuggerModel.removeEventListener(WebInspector.DebuggerModel.Events.DebuggerWasEnabled, this._scheduleUpdateInDebugger, this);
    },

    __proto__: WebInspector.SDKObject.prototype
}

/**
 * @constructor
 * @param {?string} url
 * @param {?string} scriptId
 * @param {number} lineNumber
 * @param {number} columnNumber
 * @param {string} condition
 */
WebInspector.BreakpointManager.Breakpoint.State = function(url, scriptId, lineNumber, columnNumber, condition)
{
    this.url = url;
    this.scriptId = scriptId;
    this.lineNumber = lineNumber;
    this.columnNumber = columnNumber;
    this.condition = condition;
}

/**
 * @param {?WebInspector.BreakpointManager.Breakpoint.State|undefined} stateA
 * @param {?WebInspector.BreakpointManager.Breakpoint.State|undefined} stateB
 * @return {boolean}
 */
WebInspector.BreakpointManager.Breakpoint.State.equals = function(stateA, stateB)
{
    if (!stateA || !stateB)
        return false;

    if (stateA.scriptId || stateB.scriptId)
        return false;

    return stateA.url === stateB.url && stateA.lineNumber === stateB.lineNumber && stateA.columnNumber === stateB.columnNumber && stateA.condition === stateB.condition;
}

/**
 * @constructor
 * @param {!WebInspector.BreakpointManager} breakpointManager
 * @param {!WebInspector.Setting} setting
 */
WebInspector.BreakpointManager.Storage = function(breakpointManager, setting)
{
    this._breakpointManager = breakpointManager;
    this._setting = setting;
    var breakpoints = this._setting.get();
    /** @type {!Object.<string, !WebInspector.BreakpointManager.Storage.Item>} */
    this._breakpoints = {};
    for (var i = 0; i < breakpoints.length; ++i) {
        var breakpoint = /** @type {!WebInspector.BreakpointManager.Storage.Item} */ (breakpoints[i]);
        breakpoint.columnNumber = breakpoint.columnNumber || 0;
        this._breakpoints[breakpoint.sourceFileId + ":" + breakpoint.lineNumber + ":" + breakpoint.columnNumber] = breakpoint;
    }
}

WebInspector.BreakpointManager.Storage.prototype = {
    mute: function()
    {
        this._muted = true;
    },

    unmute: function()
    {
        delete this._muted;
    },

    /**
     * @param {!WebInspector.UISourceCode} uiSourceCode
     * @return {!Array.<!WebInspector.BreakpointManager.Storage.Item>}
     */
    breakpointItems: function(uiSourceCode)
    {
        var result = [];
        var sourceFileId = WebInspector.BreakpointManager._sourceFileId(uiSourceCode);
        for (var id in this._breakpoints) {
            var breakpoint = this._breakpoints[id];
            if (breakpoint.sourceFileId === sourceFileId)
                result.push(breakpoint);
        }
        return result;
    },

    /**
     * @param {!WebInspector.BreakpointManager.Breakpoint} breakpoint
     */
    _updateBreakpoint: function(breakpoint)
    {
        if (this._muted || !breakpoint._breakpointStorageId())
            return;
        this._breakpoints[breakpoint._breakpointStorageId()] = new WebInspector.BreakpointManager.Storage.Item(breakpoint);
        this._save();
    },

    /**
     * @param {!WebInspector.BreakpointManager.Breakpoint} breakpoint
     */
    _removeBreakpoint: function(breakpoint)
    {
        if (this._muted)
            return;
        delete this._breakpoints[breakpoint._breakpointStorageId()];
        this._save();
    },

    _save: function()
    {
        var breakpointsArray = [];
        for (var id in this._breakpoints)
            breakpointsArray.push(this._breakpoints[id]);
        this._setting.set(breakpointsArray);
    }
}

/**
 * @constructor
 * @param {!WebInspector.BreakpointManager.Breakpoint} breakpoint
 */
WebInspector.BreakpointManager.Storage.Item = function(breakpoint)
{
    this.sourceFileId = breakpoint._sourceFileId;
    this.lineNumber = breakpoint.lineNumber();
    this.columnNumber = breakpoint.columnNumber();
    this.condition = breakpoint.condition();
    this.enabled = breakpoint.enabled();
}

/** @type {!WebInspector.BreakpointManager} */
WebInspector.breakpointManager;
