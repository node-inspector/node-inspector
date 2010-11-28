/*
 * Copyright (C) 2007, 2008 Apple Inc.  All rights reserved.
 *
 * Redistribution and use in source and binary forms, with or without
 * modification, are permitted provided that the following conditions
 * are met:
 *
 * 1.  Redistributions of source code must retain the above copyright
 *     notice, this list of conditions and the following disclaimer.
 * 2.  Redistributions in binary form must reproduce the above copyright
 *     notice, this list of conditions and the following disclaimer in the
 *     documentation and/or other materials provided with the distribution.
 * 3.  Neither the name of Apple Computer, Inc. ("Apple") nor the names of
 *     its contributors may be used to endorse or promote products derived
 *     from this software without specific prior written permission.
 *
 * THIS SOFTWARE IS PROVIDED BY APPLE AND ITS CONTRIBUTORS "AS IS" AND ANY
 * EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED
 * WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
 * DISCLAIMED. IN NO EVENT SHALL APPLE OR ITS CONTRIBUTORS BE LIABLE FOR ANY
 * DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES
 * (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES;
 * LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND
 * ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT
 * (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF
 * THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
 */

WebInspector.SourceView = function(resource)
{
    WebInspector.ResourceView.call(this, resource);

    this.element.addStyleClass("source");

    var canEditScripts = WebInspector.panels.scripts && WebInspector.panels.scripts.canEditScripts() && resource.type === WebInspector.Resource.Type.Script;
    this.sourceFrame = new WebInspector.SourceFrame(this.element, this._addBreakpoint.bind(this), canEditScripts ? this._editLine.bind(this) : null, this._continueToLine.bind(this));
    resource.addEventListener("finished", this._resourceLoadingFinished, this);
    this._frameNeedsSetup = true;
}

// This is a map from resource.type to mime types
// found in WebInspector.SourceTokenizer.Registry.
WebInspector.SourceView.DefaultMIMETypeForResourceType = {
    0: "text/html",
    1: "text/css",
    4: "text/javascript"
}

WebInspector.SourceView.prototype = {
    show: function(parentElement)
    {
        WebInspector.ResourceView.prototype.show.call(this, parentElement);
        this.setupSourceFrameIfNeeded();
        this.sourceFrame.visible = true;
        this.resize();
    },

    hide: function()
    {
        this.sourceFrame.visible = false;
        if (!this._frameNeedsSetup)
            this.sourceFrame.clearLineHighlight();
        WebInspector.View.prototype.hide.call(this);
        this._currentSearchResultIndex = -1;
    },

    resize: function()
    {
        if (this.sourceFrame)
            this.sourceFrame.resize();
    },

    get scrollTop()
    {
        return this.sourceFrame.scrollTop;
    },

    set scrollTop(scrollTop)
    {
        this.sourceFrame.scrollTop = scrollTop;
    },


    setupSourceFrameIfNeeded: function()
    {
        if (!this._frameNeedsSetup)
            return;

        delete this._frameNeedsSetup;
        this.resource.requestContent(this._contentLoaded.bind(this));
    },

    hasContent: function()
    {
        return true;
    },

    _contentLoaded: function(content)
    {
        var mimeType = this._canonicalMimeType(this.resource);
        this.sourceFrame.setContent(mimeType, content, this.resource.url);
        this._sourceFrameSetupFinished();
        var breakpoints = WebInspector.breakpointManager.breakpointsForURL(this.resource.url);
        for (var i = 0; i < breakpoints.length; ++i)
            this.sourceFrame.addBreakpoint(breakpoints[i]);
    },

    _canonicalMimeType: function(resource)
    {
        return WebInspector.SourceView.DefaultMIMETypeForResourceType[resource.type] || resource.mimeType;
    },

    _resourceLoadingFinished: function(event)
    {
        this._frameNeedsSetup = true;
        this._sourceFrameSetup = false;
        if (this.visible)
            this.setupSourceFrameIfNeeded();
        this.resource.removeEventListener("finished", this._resourceLoadingFinished, this);
    },

    _continueToLine: function(line)
    {
        var scriptsPanel = WebInspector.panels.scripts;
        if (scriptsPanel) {
            var sourceID = this._sourceIDForLine(line);
            scriptsPanel.continueToLine(sourceID, line);
        }
    },

    _addBreakpoint: function(line)
    {
        var sourceID = this._sourceIDForLine(line);
        WebInspector.breakpointManager.setBreakpoint(sourceID, this.resource.url, line, true, "");
        if (!WebInspector.panels.scripts.breakpointsActivated)
            WebInspector.panels.scripts.toggleBreakpointsClicked();
    },

    _editLine: function(line, newContent, cancelEditingCallback)
    {
        var lines = [];
        var textModel = this.sourceFrame.textModel;
        for (var i = 0; i < textModel.linesCount; ++i) {
            if (i === line)
                lines.push(newContent);
            else
                lines.push(textModel.line(i));
        }

        var linesCountToShift = newContent.split("\n").length - 1;
        var newContent = lines.join("\n");
        WebInspector.panels.scripts.editScriptSource(this._sourceIDForLine(line), newContent, line, linesCountToShift, this._editLineComplete.bind(this, newContent), cancelEditingCallback);
    },

    _editLineComplete: function(newContent)
    {
        this.resource.content = newContent;
    },

    _sourceIDForLine: function(line)
    {
        var sourceID = null;
        var closestStartingLine = 0;
        var scripts = this.resource.scripts;
        for (var i = 0; i < scripts.length; ++i) {
            var script = scripts[i];
            if (script.startingLine <= line && script.startingLine >= closestStartingLine) {
                closestStartingLine = script.startingLine;
                sourceID = script.sourceID;
            }
        }
        return sourceID;
    },

    // The rest of the methods in this prototype need to be generic enough to work with a ScriptView.
    // The ScriptView prototype pulls these methods into it's prototype to avoid duplicate code.

    searchCanceled: function()
    {
        this._currentSearchResultIndex = -1;
        this._searchResults = [];
        this.sourceFrame.clearMarkedRange();
        delete this._delayedFindSearchMatches;
    },

    performSearch: function(query, finishedCallback)
    {
        // Call searchCanceled since it will reset everything we need before doing a new search.
        this.searchCanceled();

        this._searchFinishedCallback = finishedCallback;

        function findSearchMatches(query, finishedCallback)
        {
            this._searchResults = this.sourceFrame.findSearchMatches(query);
            if (this._searchResults)
                finishedCallback(this, this._searchResults.length);
        }

        if (!this._sourceFrameSetup) {
            // The search is performed in _sourceFrameSetupFinished by calling _delayedFindSearchMatches.
            this._delayedFindSearchMatches = findSearchMatches.bind(this, query, finishedCallback);
            this.setupSourceFrameIfNeeded();
            return;
        }

        findSearchMatches.call(this, query, finishedCallback);
    },

    jumpToFirstSearchResult: function()
    {
        if (!this._searchResults || !this._searchResults.length)
            return;
        this._currentSearchResultIndex = 0;
        this._jumpToSearchResult(this._currentSearchResultIndex);
    },

    jumpToLastSearchResult: function()
    {
        if (!this._searchResults || !this._searchResults.length)
            return;
        this._currentSearchResultIndex = (this._searchResults.length - 1);
        this._jumpToSearchResult(this._currentSearchResultIndex);
    },

    jumpToNextSearchResult: function()
    {
        if (!this._searchResults || !this._searchResults.length)
            return;
        if (++this._currentSearchResultIndex >= this._searchResults.length)
            this._currentSearchResultIndex = 0;
        this._jumpToSearchResult(this._currentSearchResultIndex);
    },

    jumpToPreviousSearchResult: function()
    {
        if (!this._searchResults || !this._searchResults.length)
            return;
        if (--this._currentSearchResultIndex < 0)
            this._currentSearchResultIndex = (this._searchResults.length - 1);
        this._jumpToSearchResult(this._currentSearchResultIndex);
    },

    showingFirstSearchResult: function()
    {
        return (this._currentSearchResultIndex === 0);
    },

    showingLastSearchResult: function()
    {
        return (this._searchResults && this._currentSearchResultIndex === (this._searchResults.length - 1));
    },

    revealLine: function(lineNumber)
    {
        this.setupSourceFrameIfNeeded();
        this.sourceFrame.revealLine(lineNumber);
    },

    highlightLine: function(lineNumber)
    {
        this.setupSourceFrameIfNeeded();
        this.sourceFrame.highlightLine(lineNumber);
    },

    addMessage: function(msg)
    {
        this.sourceFrame.addMessage(msg);
    },

    clearMessages: function()
    {
        this.sourceFrame.clearMessages();
    },

    _jumpToSearchResult: function(index)
    {
        var foundRange = this._searchResults[index];
        if (!foundRange)
            return;

        this.sourceFrame.markAndRevealRange(foundRange);
    },

    _sourceFrameSetupFinished: function()
    {
        this._sourceFrameSetup = true;
        this.resize();
        if (this._delayedFindSearchMatches) {
            this._delayedFindSearchMatches();
            delete this._delayedFindSearchMatches;
        }
    }
}

WebInspector.SourceView.prototype.__proto__ = WebInspector.ResourceView.prototype;
