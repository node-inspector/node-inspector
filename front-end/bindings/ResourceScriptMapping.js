/*
 * Copyright (C) 2012 Google Inc. All rights reserved.
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
 * @implements {WebInspector.DebuggerSourceMapping}
 * @param {!WebInspector.DebuggerModel} debuggerModel
 * @param {!WebInspector.Workspace} workspace
 * @param {!WebInspector.DebuggerWorkspaceBinding} debuggerWorkspaceBinding
 */
WebInspector.ResourceScriptMapping = function(debuggerModel, workspace, debuggerWorkspaceBinding)
{
    this._target = debuggerModel.target();
    this._debuggerModel = debuggerModel;
    this._workspace = workspace;
    this._workspace.addEventListener(WebInspector.Workspace.Events.UISourceCodeAdded, this._uiSourceCodeAdded, this);
    this._workspace.addEventListener(WebInspector.Workspace.Events.UISourceCodeRemoved, this._uiSourceCodeRemoved, this);
    this._debuggerWorkspaceBinding = debuggerWorkspaceBinding;
    /** @type {!Set.<string>} */
    this._boundURLs = new Set();

    /** @type {!Map.<!WebInspector.UISourceCode, !WebInspector.ResourceScriptFile>} */
    this._uiSourceCodeToScriptFile = new Map();

    debuggerModel.addEventListener(WebInspector.DebuggerModel.Events.GlobalObjectCleared, this._debuggerReset, this);
}

WebInspector.ResourceScriptMapping.prototype = {
    /**
     * @param {!WebInspector.DebuggerModel.Location} rawLocation
     * @return {?WebInspector.UILocation}
     */
    rawLocationToUILocation: function(rawLocation)
    {
        var debuggerModelLocation = /** @type {!WebInspector.DebuggerModel.Location} */ (rawLocation);
        var script = debuggerModelLocation.script();
        var uiSourceCode = this._workspaceUISourceCodeForScript(script);
        if (!uiSourceCode)
            return null;
        var scriptFile = this.scriptFile(uiSourceCode);
        if (scriptFile && ((scriptFile.hasDivergedFromVM() && !scriptFile.isMergingToVM()) || scriptFile.isDivergingFromVM()))
            return null;
        var lineNumber = debuggerModelLocation.lineNumber - (script.isInlineScriptWithSourceURL() ? script.lineOffset : 0);
        var columnNumber = debuggerModelLocation.columnNumber || 0;
        if (script.isInlineScriptWithSourceURL() && !lineNumber && columnNumber)
            columnNumber -= script.columnOffset;
        return uiSourceCode.uiLocation(lineNumber, columnNumber);
    },

    /**
     * @param {!WebInspector.UISourceCode} uiSourceCode
     * @param {number} lineNumber
     * @param {number} columnNumber
     * @return {?WebInspector.DebuggerModel.Location}
     */
    uiLocationToRawLocation: function(uiSourceCode, lineNumber, columnNumber)
    {
        var scripts = this._scriptsForUISourceCode(uiSourceCode);
        console.assert(scripts.length);
        var script = scripts[0];
        if (script.isInlineScriptWithSourceURL())
            return this._debuggerModel.createRawLocation(script, lineNumber + script.lineOffset, lineNumber ? columnNumber : columnNumber + script.columnOffset);
        return this._debuggerModel.createRawLocation(script, lineNumber, columnNumber);
    },

    /**
     * @param {!WebInspector.Script} script
     */
    addScript: function(script)
    {
        if (script.isAnonymousScript())
            return;
        this._debuggerWorkspaceBinding.pushSourceMapping(script, this);

        var uiSourceCode = this._workspaceUISourceCodeForScript(script);
        if (!uiSourceCode)
            return;

        this._bindUISourceCodeToScripts(uiSourceCode, [script]);
    },

    /**
     * @return {boolean}
     */
    isIdentity: function()
    {
        return true;
    },

    /**
     * @param {!WebInspector.UISourceCode} uiSourceCode
     * @param {number} lineNumber
     * @return {boolean}
     */
    uiLineHasMapping: function(uiSourceCode, lineNumber)
    {
        return true;
    },

    /**
     * @param {!WebInspector.UISourceCode} uiSourceCode
     * @return {?WebInspector.ResourceScriptFile}
     */
    scriptFile: function(uiSourceCode)
    {
        return this._uiSourceCodeToScriptFile.get(uiSourceCode) || null;
    },

    /**
     * @param {!WebInspector.UISourceCode} uiSourceCode
     * @param {?WebInspector.ResourceScriptFile} scriptFile
     */
    _setScriptFile: function(uiSourceCode, scriptFile)
    {
        if (scriptFile)
            this._uiSourceCodeToScriptFile.set(uiSourceCode, scriptFile);
        else
            this._uiSourceCodeToScriptFile.remove(uiSourceCode);
    },

    /**
     * @param {!WebInspector.Event} event
     */
    _uiSourceCodeAdded: function(event)
    {
        var uiSourceCode = /** @type {!WebInspector.UISourceCode} */ (event.data);
        if (!uiSourceCode.url)
            return;
        if (uiSourceCode.project().isServiceProject())
            return;

        var scripts = this._scriptsForUISourceCode(uiSourceCode);
        if (!scripts.length)
            return;

        this._bindUISourceCodeToScripts(uiSourceCode, scripts);
    },

    /**
     * @param {!WebInspector.Event} event
     */
    _uiSourceCodeRemoved: function(event)
    {
        var uiSourceCode = /** @type {!WebInspector.UISourceCode} */ (event.data);
        if (!uiSourceCode.url)
            return;
        if (uiSourceCode.project().isServiceProject())
            return;

        this._unbindUISourceCode(uiSourceCode);
    },

    /**
     * @param {!WebInspector.UISourceCode} uiSourceCode
     */
    _hasMergedToVM: function(uiSourceCode)
    {
        var scripts = this._scriptsForUISourceCode(uiSourceCode);
        if (!scripts.length)
            return;
        for (var i = 0; i < scripts.length; ++i)
            this._debuggerWorkspaceBinding.updateLocations(scripts[i]);
    },

    /**
     * @param {!WebInspector.UISourceCode} uiSourceCode
     */
    _hasDivergedFromVM: function(uiSourceCode)
    {
        var scripts = this._scriptsForUISourceCode(uiSourceCode);
        if (!scripts.length)
            return;
        for (var i = 0; i < scripts.length; ++i)
            this._debuggerWorkspaceBinding.updateLocations(scripts[i]);
    },

    /**
     * @param {!WebInspector.Script} script
     * @return {?WebInspector.UISourceCode}
     */
    _workspaceUISourceCodeForScript: function(script)
    {
        if (script.isAnonymousScript())
            return null;
        return this._workspace.uiSourceCodeForURL(script.sourceURL);
    },

    /**
     * @param {!WebInspector.UISourceCode} uiSourceCode
     * @return {!Array.<!WebInspector.Script>}
     */
    _scriptsForUISourceCode: function(uiSourceCode)
    {
        if (!uiSourceCode.url)
            return [];
        return this._debuggerModel.scriptsForSourceURL(uiSourceCode.url);
    },

    /**
     * @param {!WebInspector.UISourceCode} uiSourceCode
     * @param {!Array.<!WebInspector.Script>} scripts
     */
    _bindUISourceCodeToScripts: function(uiSourceCode, scripts)
    {
        console.assert(scripts.length);
        var scriptFile = new WebInspector.ResourceScriptFile(this, uiSourceCode, scripts);
        this._setScriptFile(uiSourceCode, scriptFile);
        for (var i = 0; i < scripts.length; ++i)
            this._debuggerWorkspaceBinding.updateLocations(scripts[i]);
        this._debuggerWorkspaceBinding.setSourceMapping(this._target, uiSourceCode, this);
        this._boundURLs.add(uiSourceCode.url);
    },

    /**
     * @param {!WebInspector.UISourceCode} uiSourceCode
     */
    _unbindUISourceCode: function(uiSourceCode)
    {
        var scriptFile = this.scriptFile(uiSourceCode);
        if (scriptFile) {
            scriptFile.dispose();
            this._setScriptFile(uiSourceCode, null);
        }
        this._debuggerWorkspaceBinding.setSourceMapping(this._target, uiSourceCode, null);
    },

    _debuggerReset: function()
    {
        var boundURLs = this._boundURLs.valuesArray();
        for (var i = 0; i < boundURLs.length; ++i)
        {
            var uiSourceCode = this._workspace.uiSourceCodeForURL(boundURLs[i]);
            if (!uiSourceCode)
                continue;
            this._unbindUISourceCode(uiSourceCode);
        }
        this._boundURLs.clear();
    },

    dispose: function()
    {
        this._debuggerReset();
        this._workspace.removeEventListener(WebInspector.Workspace.Events.UISourceCodeAdded, this._uiSourceCodeAdded, this);
        this._workspace.removeEventListener(WebInspector.Workspace.Events.UISourceCodeRemoved, this._uiSourceCodeRemoved, this);
    }

}

/**
 * @constructor
 * @extends {WebInspector.Object}
 * @param {!WebInspector.ResourceScriptMapping} resourceScriptMapping
 * @param {!WebInspector.UISourceCode} uiSourceCode
 * @param {!Array.<!WebInspector.Script>} scripts
 */
WebInspector.ResourceScriptFile = function(resourceScriptMapping, uiSourceCode, scripts)
{
    console.assert(scripts.length);

    this._resourceScriptMapping = resourceScriptMapping;
    this._uiSourceCode = uiSourceCode;

    if (this._uiSourceCode.contentType() === WebInspector.resourceTypes.Script)
        this._script = scripts[0];

    this._uiSourceCode.addEventListener(WebInspector.UISourceCode.Events.WorkingCopyChanged, this._workingCopyChanged, this);
    this._update();
}

WebInspector.ResourceScriptFile.Events = {
    DidMergeToVM: "DidMergeToVM",
    DidDivergeFromVM: "DidDivergeFromVM",
}

WebInspector.ResourceScriptFile.prototype = {
    /**
     * @param {function(?string,!DebuggerAgent.SetScriptSourceError=,!WebInspector.Script=)=} callback
     */
    commitLiveEdit: function(callback)
    {
        var target = this._resourceScriptMapping._target;
        /**
         * @param {?string} error
         * @param {!DebuggerAgent.SetScriptSourceError=} errorData
         * @this {WebInspector.ResourceScriptFile}
         */
        function innerCallback(error, errorData)
        {
            if (!error)
                this._scriptSource = source;
            this._update();
            if (callback)
                callback(error, errorData, this._script);
        }
        if (!this._script)
            return;
        var source = this._uiSourceCode.workingCopy();
        target.debuggerModel.setScriptSource(this._script.scriptId, source, innerCallback.bind(this));
    },

    /**
     * @return {boolean}
     */
    _isDiverged: function()
    {
        if (this._uiSourceCode.isDirty())
            return true;
        if (!this._script)
            return false;
        if (typeof this._scriptSource === "undefined")
            return false;
        if (!this._uiSourceCode.workingCopy().startsWith(this._scriptSource))
            return true;
        var suffix = this._uiSourceCode.workingCopy().substr(this._scriptSource.length);
        return !!suffix.length && !suffix.match(WebInspector.Script.sourceURLRegex);
    },

    /**
     * @param {!WebInspector.Event} event
     */
    _workingCopyChanged: function(event)
    {
        this._update();
    },

    _update: function()
    {
        if (this._isDiverged() && !this._hasDivergedFromVM)
            this._divergeFromVM();
        else if (!this._isDiverged() && this._hasDivergedFromVM)
            this._mergeToVM();
    },

    _divergeFromVM: function()
    {
        this._isDivergingFromVM = true;
        this._resourceScriptMapping._hasDivergedFromVM(this._uiSourceCode);
        delete this._isDivergingFromVM;
        this._hasDivergedFromVM = true;
        this.dispatchEventToListeners(WebInspector.ResourceScriptFile.Events.DidDivergeFromVM, this._uiSourceCode);
    },

    _mergeToVM: function()
    {
        delete this._hasDivergedFromVM;
        this._isMergingToVM = true;
        this._resourceScriptMapping._hasMergedToVM(this._uiSourceCode);
        delete this._isMergingToVM;
        this.dispatchEventToListeners(WebInspector.ResourceScriptFile.Events.DidMergeToVM, this._uiSourceCode);
    },

    /**
     * @return {boolean}
     */
    hasDivergedFromVM: function()
    {
        return this._hasDivergedFromVM;
    },

    /**
     * @return {boolean}
     */
    isDivergingFromVM: function()
    {
        return this._isDivergingFromVM;
    },

    /**
     * @return {boolean}
     */
    isMergingToVM: function()
    {
        return this._isMergingToVM;
    },

    checkMapping: function()
    {
        if (!this._script)
            return;
        if (typeof this._scriptSource !== "undefined")
            return;
        this._script.requestContent(callback.bind(this));

        /**
         * @param {?string} source
         * @this {WebInspector.ResourceScriptFile}
         */
        function callback(source)
        {
            this._scriptSource = source;
            this._update();
        }
    },

    /**
     * @return {?WebInspector.Target}
     */
    target: function()
    {
        if (!this._script)
            return null;
        return this._script.target();
    },

    dispose: function()
    {
        this._uiSourceCode.removeEventListener(WebInspector.UISourceCode.Events.WorkingCopyChanged, this._workingCopyChanged, this);
    },

    /**
     * @param {string} sourceMapURL
     */
    addSourceMapURL: function(sourceMapURL)
    {
        if (!this._script)
            return;
        this._script.addSourceMapURL(sourceMapURL);
    },

    __proto__: WebInspector.Object.prototype
}
