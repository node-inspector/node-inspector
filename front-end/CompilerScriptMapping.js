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
 * @implements {WebInspector.ScriptSourceMapping}
 * @param {WebInspector.Workspace} workspace
 * @param {WebInspector.SimpleWorkspaceProvider} networkWorkspaceProvider
 */
WebInspector.CompilerScriptMapping = function(workspace, networkWorkspaceProvider)
{
    this._workspace = workspace;
    this._workspace.addEventListener(WebInspector.Workspace.Events.UISourceCodeAdded, this._uiSourceCodeAddedToWorkspace, this);
    this._networkWorkspaceProvider = networkWorkspaceProvider;
    /** @type {!Object.<string, WebInspector.SourceMap>} */
    this._sourceMapForSourceMapURL = {};
    /** @type {!Object.<string, Array.<function(?WebInspector.SourceMap)>>} */
    this._pendingSourceMapLoadingCallbacks = {};
    /** @type {!Object.<string, WebInspector.SourceMap>} */
    this._sourceMapForScriptId = {};
    /** @type {!Map.<WebInspector.SourceMap, WebInspector.Script>} */
    this._scriptForSourceMap = new Map();
    /** @type {!Object.<string, WebInspector.SourceMap>} */
    this._sourceMapForURL = {};
    WebInspector.debuggerModel.addEventListener(WebInspector.DebuggerModel.Events.GlobalObjectCleared, this._debuggerReset, this);
}

WebInspector.CompilerScriptMapping.prototype = {
    /**
     * @param {WebInspector.RawLocation} rawLocation
     * @return {WebInspector.UILocation}
     */
    rawLocationToUILocation: function(rawLocation)
    {
        var debuggerModelLocation = /** @type {WebInspector.DebuggerModel.Location} */ (rawLocation);
        var sourceMap = this._sourceMapForScriptId[debuggerModelLocation.scriptId];
        if (!sourceMap)
            return null;
        var lineNumber = debuggerModelLocation.lineNumber;
        var columnNumber = debuggerModelLocation.columnNumber || 0;
        var entry = sourceMap.findEntry(lineNumber, columnNumber);
        if (!entry || entry.length === 2)
            return null;
        var url = entry[2];
        var uiSourceCode = this._workspace.uiSourceCodeForURL(url);
        if (!uiSourceCode)
            return null;
        return new WebInspector.UILocation(uiSourceCode, entry[3], entry[4]);
    },

    /**
     * @param {WebInspector.UISourceCode} uiSourceCode
     * @param {number} lineNumber
     * @param {number} columnNumber
     * @return {WebInspector.DebuggerModel.Location}
     */
    uiLocationToRawLocation: function(uiSourceCode, lineNumber, columnNumber)
    {
        if (!uiSourceCode.url)
            return null;
        var sourceMap = this._sourceMapForURL[uiSourceCode.url];
        if (!sourceMap)
            return null;
        var entry = sourceMap.findEntryReversed(uiSourceCode.url, lineNumber);
        return WebInspector.debuggerModel.createRawLocation(this._scriptForSourceMap.get(sourceMap) || null, entry[0], entry[1]);
    },

    /**
     * @return {boolean}
     */
    isIdentity: function()
    {
        return false;
    },

    /**
     * @param {WebInspector.Script} script
     */
    addScript: function(script)
    {
        script.pushSourceMapping(this);
        this.loadSourceMapForScript(script, sourceMapLoaded.bind(this));

        /**
         * @param {?WebInspector.SourceMap} sourceMap
         */
        function sourceMapLoaded(sourceMap)
        {
            if (!sourceMap)
                return;

            if (this._scriptForSourceMap.get(sourceMap)) {
                this._sourceMapForScriptId[script.scriptId] = sourceMap;
                script.updateLocations();
                return;
            }

            this._sourceMapForScriptId[script.scriptId] = sourceMap;
            this._scriptForSourceMap.put(sourceMap, script);

            var sourceURLs = sourceMap.sources();
            for (var i = 0; i < sourceURLs.length; ++i) {
                var sourceURL = sourceURLs[i];
                if (this._sourceMapForURL[sourceURL])
                    continue;
                this._sourceMapForURL[sourceURL] = sourceMap;
                if (!this._workspace.hasMappingForURL(sourceURL) && !this._workspace.uiSourceCodeForURL(sourceURL)) {
                    var contentProvider = sourceMap.sourceContentProvider(sourceURL, WebInspector.resourceTypes.Script);
                    this._networkWorkspaceProvider.addFileForURL(sourceURL, contentProvider, true);
                }
                var uiSourceCode = this._workspace.uiSourceCodeForURL(sourceURL);
                if (uiSourceCode) {
                    this._bindUISourceCode(uiSourceCode);
                    uiSourceCode.isContentScript = script.isContentScript;
                }
            }
            script.updateLocations();
        }
    },

    /**
     * @param {WebInspector.UISourceCode} uiSourceCode
     */
    _bindUISourceCode: function(uiSourceCode)
    {
        uiSourceCode.setSourceMapping(this);
    },

    /**
     * @param {WebInspector.Event} event
     */
    _uiSourceCodeAddedToWorkspace: function(event)
    {
        var uiSourceCode = /** @type {WebInspector.UISourceCode} */ (event.data);
        if (!uiSourceCode.url || !this._sourceMapForURL[uiSourceCode.url])
            return;
        this._bindUISourceCode(uiSourceCode);
    },

    /**
     * @param {WebInspector.Script} script
     * @param {function(?WebInspector.SourceMap)} callback
     */
    loadSourceMapForScript: function(script, callback)
    {
        // script.sourceURL can be a random string, but is generally an absolute path -> complete it to inspected page url for
        // relative links.
        if (!script.sourceMapURL) {
            callback(null);
            return;
        }
        var scriptURL = WebInspector.ParsedURL.completeURL(WebInspector.inspectedPageURL, script.sourceURL);
        if (!scriptURL) {
            callback(null);
            return;
        }
        var sourceMapURL = WebInspector.ParsedURL.completeURL(scriptURL, script.sourceMapURL);
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
         */
        function sourceMapLoaded(sourceMap)
        {
            var callbacks = this._pendingSourceMapLoadingCallbacks[sourceMapURL];
            delete this._pendingSourceMapLoadingCallbacks[sourceMapURL];
            if (!callbacks)
                return;
            if (sourceMap)
                this._sourceMapForSourceMapURL[sourceMapURL] = sourceMap;
            for (var i = 0; i < callbacks.length; ++i)
                callbacks[i](sourceMap);
        }
    },

    _debuggerReset: function()
    {
        this._sourceMapForSourceMapURL = {};
        this._pendingSourceMapLoadingCallbacks = {};
        this._sourceMapForScriptId = {};
        this._scriptForSourceMap = new Map();
        this._sourceMapForURL = {};
    }
}
