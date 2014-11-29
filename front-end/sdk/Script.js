/*
 * Copyright (C) 2008 Apple Inc. All Rights Reserved.
 *
 * Redistribution and use in source and binary forms, with or without
 * modification, are permitted provided that the following conditions
 * are met:
 * 1. Redistributions of source code must retain the above copyright
 *    notice, this list of conditions and the following disclaimer.
 * 2. Redistributions in binary form must reproduce the above copyright
 *    notice, this list of conditions and the following disclaimer in the
 *    documentation and/or other materials provided with the distribution.
 *
 * THIS SOFTWARE IS PROVIDED BY APPLE INC. ``AS IS'' AND ANY
 * EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE
 * IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR
 * PURPOSE ARE DISCLAIMED.  IN NO EVENT SHALL APPLE INC. OR
 * CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL,
 * EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO,
 * PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR
 * PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY
 * OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT
 * (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE
 * OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
 */

/**
 * @constructor
 * @extends {WebInspector.SDKObject}
 * @implements {WebInspector.ContentProvider}
 * @param {!WebInspector.Target} target
 * @param {string} scriptId
 * @param {string} sourceURL
 * @param {number} startLine
 * @param {number} startColumn
 * @param {number} endLine
 * @param {number} endColumn
 * @param {boolean} isContentScript
 * @param {string=} sourceMapURL
 * @param {boolean=} hasSourceURL
 */
WebInspector.Script = function(target, scriptId, sourceURL, startLine, startColumn, endLine, endColumn, isContentScript, sourceMapURL, hasSourceURL)
{
    WebInspector.SDKObject.call(this, target);
    this.scriptId = scriptId;
    this.sourceURL = sourceURL;
    this.lineOffset = startLine;
    this.columnOffset = startColumn;
    this.endLine = endLine;
    this.endColumn = endColumn;
    this._isContentScript = isContentScript;
    this.sourceMapURL = sourceMapURL;
    this.hasSourceURL = hasSourceURL;
}

WebInspector.Script.Events = {
    ScriptEdited: "ScriptEdited",
    SourceMapURLAdded: "SourceMapURLAdded",
}

WebInspector.Script.snippetSourceURLPrefix = "snippets:///";

WebInspector.Script.sourceURLRegex = /\n[\040\t]*\/\/[@#]\ssourceURL=\s*(\S*?)\s*$/mg;

/**
 * @param {string} source
 * @return {string}
 */
WebInspector.Script._trimSourceURLComment = function(source)
{
    return source.replace(WebInspector.Script.sourceURLRegex, "");
}


WebInspector.Script.prototype = {
    /**
     * @return {boolean}
     */
    isContentScript: function()
    {
        return this._isContentScript;
    },

    /**
     * @return {string}
     */
    contentURL: function()
    {
        return this.sourceURL;
    },

    /**
     * @return {!WebInspector.ResourceType}
     */
    contentType: function()
    {
        return WebInspector.resourceTypes.Script;
    },

    /**
     * @param {function(?string)} callback
     */
    requestContent: function(callback)
    {
        if (this._source) {
            callback(this._source);
            return;
        }

        /**
         * @this {WebInspector.Script}
         * @param {?Protocol.Error} error
         * @param {string} source
         */
        function didGetScriptSource(error, source)
        {
            this._source = WebInspector.Script._trimSourceURLComment(error ? "" : source);
            callback(this._source);
        }
        if (this.scriptId) {
            // Script failed to parse.
            this.target().debuggerAgent().getScriptSource(this.scriptId, didGetScriptSource.bind(this));
        } else
            callback("");
    },

    /**
     * @param {string} query
     * @param {boolean} caseSensitive
     * @param {boolean} isRegex
     * @param {function(!Array.<!PageAgent.SearchMatch>)} callback
     */
    searchInContent: function(query, caseSensitive, isRegex, callback)
    {
        /**
         * @param {?Protocol.Error} error
         * @param {!Array.<!PageAgent.SearchMatch>} searchMatches
         */
        function innerCallback(error, searchMatches)
        {
            if (error)
                console.error(error);
            var result = [];
            for (var i = 0; i < searchMatches.length; ++i) {
                var searchMatch = new WebInspector.ContentProvider.SearchMatch(searchMatches[i].lineNumber, searchMatches[i].lineContent);
                result.push(searchMatch);
            }
            callback(result || []);
        }

        if (this.scriptId) {
            // Script failed to parse.
            this.target().debuggerAgent().searchInContent(this.scriptId, query, caseSensitive, isRegex, innerCallback);
        } else {
            callback([]);
        }
    },

    /**
     * @param {string} source
     * @return {string}
     */
    _appendSourceURLCommentIfNeeded: function(source)
    {
        if (!this.hasSourceURL)
            return source;
        return source + "\n //# sourceURL=" + this.sourceURL;
    },

    /**
     * @param {string} newSource
     * @param {function(?Protocol.Error, !DebuggerAgent.SetScriptSourceError=, !Array.<!DebuggerAgent.CallFrame>=, !DebuggerAgent.StackTrace=, boolean=)} callback
     */
    editSource: function(newSource, callback)
    {
        /**
         * @this {WebInspector.Script}
         * @param {?Protocol.Error} error
         * @param {!DebuggerAgent.SetScriptSourceError=} errorData
         * @param {!Array.<!DebuggerAgent.CallFrame>=} callFrames
         * @param {!Object=} debugData
         * @param {!DebuggerAgent.StackTrace=} asyncStackTrace
         */
        function didEditScriptSource(error, errorData, callFrames, debugData, asyncStackTrace)
        {
            // FIXME: support debugData.stack_update_needs_step_in flag by calling WebInspector.debugger_model.callStackModified
            if (!error)
                this._source = newSource;
            var needsStepIn = !!debugData && debugData["stack_update_needs_step_in"] === true;
            callback(error, errorData, callFrames, asyncStackTrace, needsStepIn);
            if (!error)
                this.dispatchEventToListeners(WebInspector.Script.Events.ScriptEdited, newSource);
        }

        newSource = WebInspector.Script._trimSourceURLComment(newSource);
        // We append correct sourceURL to script for consistency only. It's not actually needed for things to work correctly.
        newSource = this._appendSourceURLCommentIfNeeded(newSource);

        if (this.scriptId)
            this.target().debuggerAgent().setScriptSource(this.scriptId, newSource, undefined, didEditScriptSource.bind(this));
        else
            callback("Script failed to parse");
    },

    /**
     * @param {number} lineNumber
     * @param {number=} columnNumber
     * @return {!WebInspector.DebuggerModel.Location}
     */
    rawLocation: function(lineNumber, columnNumber)
    {
        return new WebInspector.DebuggerModel.Location(this.target(), this.scriptId, lineNumber, columnNumber || 0);
    },

    /**
     * @return {boolean}
     */
    isInlineScript: function()
    {
        var startsAtZero = !this.lineOffset && !this.columnOffset;
        return !!this.sourceURL && !startsAtZero;
    },

    /**
     * @param {string} sourceMapURL
     */
    addSourceMapURL: function(sourceMapURL)
    {
        if (this.sourceMapURL)
            return;
        this.sourceMapURL = sourceMapURL;
        this.dispatchEventToListeners(WebInspector.Script.Events.SourceMapURLAdded, this.sourceMapURL);
    },

    /**
     * @return {boolean}
     */
    isAnonymousScript: function()
    {
        return !this.sourceURL;
    },

    /**
     * @return {boolean}
     */
    isSnippet: function()
    {
        return !!this.sourceURL && this.sourceURL.startsWith(WebInspector.Script.snippetSourceURLPrefix);
    },

    /**
     * @return {boolean}
     */
    isInlineScriptWithSourceURL: function()
    {
        return !!this.hasSourceURL && this.isInlineScript()
    },

    __proto__: WebInspector.SDKObject.prototype
}
