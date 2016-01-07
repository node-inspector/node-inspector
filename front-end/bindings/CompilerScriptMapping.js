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
 * @param {!WebInspector.NetworkMapping} networkMapping
 * @param {!WebInspector.NetworkProject} networkProject
 * @param {!WebInspector.DebuggerWorkspaceBinding} debuggerWorkspaceBinding
 */
WebInspector.CompilerScriptMapping = function(debuggerModel, workspace, networkMapping, networkProject, debuggerWorkspaceBinding)
{
    this._target = debuggerModel.target();
    this._debuggerModel = debuggerModel;
    this._workspace = workspace;
    this._workspace.addEventListener(WebInspector.Workspace.Events.UISourceCodeAdded, this._uiSourceCodeAddedToWorkspace, this);
    this._networkMapping = networkMapping;
    this._networkProject = networkProject;
    this._debuggerWorkspaceBinding = debuggerWorkspaceBinding;

    /** @type {!Object.<string, !WebInspector.SourceMap>} */
    this._sourceMapForSourceMapURL = {};
    /** @type {!Object.<string, !Array.<function(?WebInspector.SourceMap)>>} */
    this._pendingSourceMapLoadingCallbacks = {};
    /** @type {!Object.<string, !WebInspector.SourceMap>} */
    this._sourceMapForScriptId = {};
    /** @type {!Map.<!WebInspector.SourceMap, !WebInspector.Script>} */
    this._scriptForSourceMap = new Map();
    /** @type {!Map.<string, !WebInspector.SourceMap>} */
    this._sourceMapForURL = new Map();
    /** @type {!Map.<string, !WebInspector.UISourceCode>} */
    this._stubUISourceCodes = new Map();

    this._stubProjectID = "compiler-script-project";
    this._stubProjectDelegate = new WebInspector.ContentProviderBasedProjectDelegate(this._workspace, this._stubProjectID, WebInspector.projectTypes.Service);
    debuggerModel.addEventListener(WebInspector.DebuggerModel.Events.GlobalObjectCleared, this._debuggerReset, this);
}

WebInspector.CompilerScriptMapping.StubProjectID = "compiler-script-project";

WebInspector.CompilerScriptMapping.prototype = {
    /**
     * @param {!WebInspector.DebuggerModel.Location} rawLocation
     * @return {boolean}
     */
    mapsToSourceCode: function (rawLocation) {
        var sourceMap = this._sourceMapForScriptId[rawLocation.scriptId];
        if (!sourceMap) {
            return true;
        }
        return !!sourceMap.findEntry(rawLocation.lineNumber, rawLocation.columnNumber);
    },

    /**
     * @override
     * @param {!WebInspector.DebuggerModel.Location} rawLocation
     * @return {?WebInspector.UILocation}
     */
    rawLocationToUILocation: function(rawLocation)
    {
        var debuggerModelLocation = /** @type {!WebInspector.DebuggerModel.Location} */ (rawLocation);

        var stubUISourceCode = this._stubUISourceCodes.get(debuggerModelLocation.scriptId);
        if (stubUISourceCode)
            return new WebInspector.UILocation(stubUISourceCode, rawLocation.lineNumber, rawLocation.columnNumber);

        var sourceMap = this._sourceMapForScriptId[debuggerModelLocation.scriptId];
        if (!sourceMap)
            return null;
        var lineNumber = debuggerModelLocation.lineNumber;
        var columnNumber = debuggerModelLocation.columnNumber || 0;
        var entry = sourceMap.findEntry(lineNumber, columnNumber);
        if (!entry || !entry.sourceURL)
            return null;
        var uiSourceCode = this._networkMapping.uiSourceCodeForURL(/** @type {string} */ (entry.sourceURL), this._target);
        if (!uiSourceCode)
            return null;
        return uiSourceCode.uiLocation(/** @type {number} */ (entry.sourceLineNumber), /** @type {number} */ (entry.sourceColumnNumber));
    },

    /**
     * @override
     * @param {!WebInspector.UISourceCode} uiSourceCode
     * @param {number} lineNumber
     * @param {number} columnNumber
     * @return {?WebInspector.DebuggerModel.Location}
     */
    uiLocationToRawLocation: function(uiSourceCode, lineNumber, columnNumber)
    {
        if (uiSourceCode.project().type() === WebInspector.projectTypes.Service)
            return null;
        var networkURL = this._networkMapping.networkURL(uiSourceCode);
        if (!networkURL)
            return null;
        var sourceMap = this._sourceMapForURL.get(networkURL);
        if (!sourceMap)
            return null;
        var script = /** @type {!WebInspector.Script} */ (this._scriptForSourceMap.get(sourceMap));
        console.assert(script);
        var entry = sourceMap.firstSourceLineMapping(networkURL, lineNumber);
        if (!entry)
            return null;
        return this._debuggerModel.createRawLocation(script, entry.lineNumber, entry.columnNumber);
    },

    /**
     * @param {!WebInspector.Script} script
     */
    addScript: function(script)
    {
        if (!script.sourceMapURL) {
            script.addEventListener(WebInspector.Script.Events.SourceMapURLAdded, this._sourceMapURLAdded.bind(this));
            return;
        }

        this._processScript(script);
    },

    /**
     * @param {!WebInspector.Event} event
     */
    _sourceMapURLAdded: function(event)
    {
        var script = /** @type {!WebInspector.Script} */ (event.target);
        if (!script.sourceMapURL)
            return;
        this._processScript(script);
    },

    /**
     * @param {!WebInspector.Script} script
     */
    _processScript: function(script)
    {
        // Create stub UISourceCode for the time source mapping is being loaded.
        var url = script.sourceURL;
        var splitURL = WebInspector.ParsedURL.splitURLIntoPathComponents(url);
        var parentPath = splitURL.slice(1, -1).join("/");
        var name = splitURL.peekLast() || "";
        var uiSourceCodePath = this._stubProjectDelegate.addContentProvider(parentPath, name, url, url, new WebInspector.StaticContentProvider(WebInspector.resourceTypes.Script, "\n\n\n\n\n// Please wait a bit.\n// Compiled script is not shown while source map is being loaded!", url));
        var stubUISourceCode = /** @type {!WebInspector.UISourceCode} */ (this._workspace.uiSourceCode(this._stubProjectID, uiSourceCodePath));
        this._stubUISourceCodes.set(script.scriptId, stubUISourceCode);

        this._debuggerWorkspaceBinding.pushSourceMapping(script, this);
        this._loadSourceMapForScript(script, this._sourceMapLoaded.bind(this, script, uiSourceCodePath));
    },

    /**
     * @param {!WebInspector.Script} script
     * @param {string} uiSourceCodePath
     * @param {?WebInspector.SourceMap} sourceMap
     */
    _sourceMapLoaded: function(script, uiSourceCodePath, sourceMap)
    {
        this._stubUISourceCodes.delete(script.scriptId);
        this._stubProjectDelegate.removeFile(uiSourceCodePath);

        if (!sourceMap) {
            this._debuggerWorkspaceBinding.updateLocations(script);
            return;
        }

        if (this._scriptForSourceMap.get(sourceMap)) {
            this._sourceMapForScriptId[script.scriptId] = sourceMap;
            this._debuggerWorkspaceBinding.updateLocations(script);
            return;
        }

        this._sourceMapForScriptId[script.scriptId] = sourceMap;
        this._scriptForSourceMap.set(sourceMap, script);

        var sourceURLs = sourceMap.sources();
        var missingSources = [];
        for (var i = 0; i < sourceURLs.length; ++i) {
            var sourceURL = sourceURLs[i];
            if (this._sourceMapForURL.get(sourceURL))
                continue;
            this._sourceMapForURL.set(sourceURL, sourceMap);
            if (!this._networkMapping.hasMappingForURL(sourceURL) && !this._networkMapping.uiSourceCodeForURL(sourceURL, script.target())) {
                var contentProvider = sourceMap.sourceContentProvider(sourceURL, WebInspector.resourceTypes.Script);
                this._networkProject.addFileForURL(sourceURL, contentProvider, script.isContentScript());
            }
            var uiSourceCode = this._networkMapping.uiSourceCodeForURL(sourceURL, this._target);
            if (uiSourceCode) {
                this._bindUISourceCode(uiSourceCode);
            } else {
                if (missingSources.length < 3)
                    missingSources.push(sourceURL);
                else if (missingSources.peekLast() !== "\u2026")
                    missingSources.push("\u2026");
            }
        }
        if (missingSources.length) {
            WebInspector.console.warn(
                WebInspector.UIString("Source map %s points to the files missing from the workspace: [%s]",
                                      sourceMap.url(), missingSources.join(", ")));
        }

        this._debuggerWorkspaceBinding.updateLocations(script);
    },

    /**
     * @override
     * @return {boolean}
     */
    isIdentity: function()
    {
        return false;
    },

    /**
     * @override
     * @param {!WebInspector.UISourceCode} uiSourceCode
     * @param {number} lineNumber
     * @return {boolean}
     */
    uiLineHasMapping: function(uiSourceCode, lineNumber)
    {
        var networkURL = this._networkMapping.networkURL(uiSourceCode);
        if (!networkURL)
            return true;
        var sourceMap = this._sourceMapForURL.get(networkURL);
        if (!sourceMap)
            return true;
        return !!sourceMap.firstSourceLineMapping(networkURL, lineNumber);
    },

    /**
     * @param {!WebInspector.UISourceCode} uiSourceCode
     */
    _bindUISourceCode: function(uiSourceCode)
    {
        this._debuggerWorkspaceBinding.setSourceMapping(this._target, uiSourceCode, this);
    },

    /**
     * @param {!WebInspector.UISourceCode} uiSourceCode
     */
    _unbindUISourceCode: function(uiSourceCode)
    {
        this._debuggerWorkspaceBinding.setSourceMapping(this._target, uiSourceCode, null);
    },

    /**
     * @param {!WebInspector.Event} event
     */
    _uiSourceCodeAddedToWorkspace: function(event)
    {
        var uiSourceCode = /** @type {!WebInspector.UISourceCode} */ (event.data);
        var networkURL = this._networkMapping.networkURL(uiSourceCode);
        if (!networkURL || !this._sourceMapForURL.get(networkURL))
            return;
        this._bindUISourceCode(uiSourceCode);
    },

    /**
     * @param {!WebInspector.Script} script
     * @param {function(?WebInspector.SourceMap)} callback
     */
    _loadSourceMapForScript: function(script, callback)
    {
        // script.sourceURL can be a random string, but is generally an absolute path -> complete it to inspected page url for
        // relative links.
        var scriptURL = WebInspector.ParsedURL.completeURL(this._target.resourceTreeModel.inspectedPageURL(), script.sourceURL);
        if (!scriptURL) {
            callback(null);
            return;
        }

        console.assert(script.sourceMapURL);
        var scriptSourceMapURL = /** @type {string} */ (script.sourceMapURL);

        var sourceMapURL = WebInspector.ParsedURL.completeURL(scriptURL, scriptSourceMapURL);
        if (!sourceMapURL) {
            callback(null);
            return;
        }

        var sourceMap = this._sourceMapForSourceMapURL[sourceMapURL];
        if (sourceMap) {
            callback(sourceMap);
            return;
        }

        var pendingCallbacks = this._pendingSourceMapLoadingCallbacks[sourceMapURL];
        if (pendingCallbacks) {
            pendingCallbacks.push(callback);
            return;
        }

        pendingCallbacks = [callback];
        this._pendingSourceMapLoadingCallbacks[sourceMapURL] = pendingCallbacks;

        WebInspector.SourceMap.load(sourceMapURL, scriptURL, sourceMapLoaded.bind(this));

        /**
         * @param {?WebInspector.SourceMap} sourceMap
         * @this {WebInspector.CompilerScriptMapping}
         */
        function sourceMapLoaded(sourceMap)
        {
            var url = /** @type {string} */ (sourceMapURL);
            var callbacks = this._pendingSourceMapLoadingCallbacks[url];
            delete this._pendingSourceMapLoadingCallbacks[url];
            if (!callbacks)
                return;
            if (sourceMap)
                this._sourceMapForSourceMapURL[url] = sourceMap;
            for (var i = 0; i < callbacks.length; ++i)
                callbacks[i](sourceMap);
        }
    },

    _debuggerReset: function()
    {
        /**
         * @param {string} sourceURL
         * @this {WebInspector.CompilerScriptMapping}
         */
        function unbindUISourceCodeForURL(sourceURL)
        {
            var uiSourceCode = this._networkMapping.uiSourceCodeForURL(sourceURL, this._target);
            if (!uiSourceCode)
                return;
            this._unbindUISourceCode(uiSourceCode);
        }

        this._sourceMapForURL.keysArray().forEach(unbindUISourceCodeForURL.bind(this));

        this._sourceMapForSourceMapURL = {};
        this._pendingSourceMapLoadingCallbacks = {};
        this._sourceMapForScriptId = {};
        this._scriptForSourceMap.clear();
        this._sourceMapForURL.clear();
    },

    dispose: function()
    {
        this._workspace.removeEventListener(WebInspector.Workspace.Events.UISourceCodeAdded, this._uiSourceCodeAddedToWorkspace, this);
    }
}
