/*
 * Copyright (C) 2009 Google Inc. All rights reserved.
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

WebInspector.SourceFrame = function(delegate, url)
{
    WebInspector.View.call(this);
    this.element.addStyleClass("script-view");

    this._delegate = delegate;
    this._url = url;

    this._textModel = new WebInspector.TextEditorModel();

    var textViewerDelegate = new WebInspector.TextViewerDelegateForSourceFrame(this);
    this._textViewer = new WebInspector.TextViewer(this._textModel, WebInspector.platform, this._url, textViewerDelegate);
    this.addChildView(this._textViewer);
    this.element.appendChild(this._textViewer.element);

    this._editButton = new WebInspector.StatusBarButton(WebInspector.UIString("Edit"), "edit-source-status-bar-item");
    this._editButton.addEventListener("click", this._editButtonClicked.bind(this), this);

    this._currentSearchResultIndex = -1;
    this._searchResults = [];

    this._messages = [];
    this._rowMessages = {};
    this._messageBubbles = {};

    this._breakpoints = {};
}

WebInspector.SourceFrame.Events = {
    Loaded: "loaded"
}

WebInspector.SourceFrame.createSearchRegex = function(query)
{
    var regex;

    // First try creating regex if user knows the / / hint.
    try {
        if (/^\/.*\/$/.test(query))
            regex = new RegExp(query.substring(1, query.length - 1));
    } catch (e) {
        // Silent catch.
    }

    // Otherwise just do case-insensitive search.
    if (!regex)
        regex = createSearchRegex(query);

    return regex;
}


WebInspector.SourceFrame.prototype = {
    show: function(parentElement)
    {
        WebInspector.View.prototype.show.call(this, parentElement);
        this._ensureContentLoaded();
        this._textViewer.show();
    },

    willHide: function()
    {
        WebInspector.View.prototype.willHide.call(this);
        if (this.loaded)
            this._textViewer.freeCachedElements();

        if (this._popoverHelper)
            this._popoverHelper.hidePopover();
        this._clearLineHighlight();
    },

    get statusBarItems()
    {
        return [this._editButton.element];
    },

    get loaded()
    {
        return !!this._content;
    },

    hasContent: function()
    {
        return true;
    },

    _ensureContentLoaded: function()
    {
        if (!this._contentRequested) {
            this._contentRequested = true;
            this.requestContent(this._initializeTextViewer.bind(this));
        }
    },

    requestContent: function(callback)
    {
        this._delegate.requestContent(callback);
    },

    markDiff: function(diffData)
    {
        if (this._diffLines && this.loaded)
            this._removeDiffDecorations();

        this._diffLines = diffData;
        if (this.loaded)
            this._updateDiffDecorations();
    },

    addMessage: function(msg)
    {
        this._messages.push(msg);
        if (this.loaded)
            this.addMessageToSource(msg.line - 1, msg);
    },

    clearMessages: function()
    {
        for (var line in this._messageBubbles) {
            var bubble = this._messageBubbles[line];
            bubble.parentNode.removeChild(bubble);
        }

        this._messages = [];
        this._rowMessages = {};
        this._messageBubbles = {};

        this._textViewer.doResize();
    },

    get textModel()
    {
        return this._textModel;
    },

    highlightLine: function(line)
    {
        if (this.loaded)
            this._textViewer.highlightLine(line);
        else
            this._lineToHighlight = line;
    },

    _clearLineHighlight: function()
    {
        if (this.loaded)
            this._textViewer.clearLineHighlight();
        else
            delete this._lineToHighlight;
    },

    _saveViewerState: function()
    {
        this._viewerState = {
            textModelContent: this._textModel.text,
            executionLineNumber: this._executionLineNumber,
            messages: this._messages,
            diffLines: this._diffLines,
            breakpoints: this._breakpoints
        };
    },

    _restoreViewerState: function()
    {
        if (!this._viewerState)
            return;
        this._textModel.setText(null, this._viewerState.textModelContent);

        this._messages = this._viewerState.messages;
        this._diffLines = this._viewerState.diffLines;
        this._setTextViewerDecorations();

        if (typeof this._viewerState.executionLineNumber === "number") {
            this.clearExecutionLine();
            this.setExecutionLine(this._viewerState.executionLineNumber);
        }

        var oldBreakpoints = this._breakpoints;
        this._breakpoints = {};
        for (var lineNumber in oldBreakpoints)
            this.removeBreakpoint(Number(lineNumber));

        var newBreakpoints = this._viewerState.breakpoints;
        for (var lineNumber in newBreakpoints) {
            lineNumber = Number(lineNumber);
            var breakpoint = newBreakpoints[lineNumber];
            this.addBreakpoint(lineNumber, breakpoint.resolved, breakpoint.conditional, breakpoint.enabled);
        }

        delete this._viewerState;
    },

    beforeTextChanged: function()
    {
        if (!this._viewerState) {
            this._saveViewerState();
            this._delegate.setScriptSourceIsBeingEdited(true);
        }

        WebInspector.searchController.cancelSearch();
        this.clearMessages();
    },

    afterTextChanged: function(oldRange, newRange)
    {
        if (!oldRange || !newRange)
            return;

        // Adjust execution line number.
        if (typeof this._executionLineNumber === "number") {
            var newExecutionLineNumber = this._lineNumberAfterEditing(this._executionLineNumber, oldRange, newRange);
            this.clearExecutionLine();
            this.setExecutionLine(newExecutionLineNumber, true);
        }

        // Adjust breakpoints.
        var oldBreakpoints = this._breakpoints;
        this._breakpoints = {};
        for (var lineNumber in oldBreakpoints) {
            lineNumber = Number(lineNumber);
            var breakpoint = oldBreakpoints[lineNumber];
            var newLineNumber = this._lineNumberAfterEditing(lineNumber, oldRange, newRange);
            if (lineNumber === newLineNumber)
                this._breakpoints[lineNumber] = breakpoint;
            else {
                this.removeBreakpoint(lineNumber);
                this.addBreakpoint(newLineNumber, breakpoint.resolved, breakpoint.conditional, breakpoint.enabled);
            }
        }
    },

    _lineNumberAfterEditing: function(lineNumber, oldRange, newRange)
    {
        var shiftOffset = lineNumber <= oldRange.startLine ? 0 : newRange.linesCount - oldRange.linesCount;

        // Special case of editing the line itself. We should decide whether the line number should move below or not.
        if (lineNumber === oldRange.startLine) {
            var whiteSpacesRegex = /^[\s\xA0]*$/;
            for (var i = 0; lineNumber + i <= newRange.endLine; ++i) {
                if (!whiteSpacesRegex.test(this._textModel.line(lineNumber + i))) {
                    shiftOffset = i;
                    break;
                }
            }
        }

        var newLineNumber = Math.max(0, lineNumber + shiftOffset);
        if (oldRange.startLine < lineNumber && lineNumber < oldRange.endLine)
            newLineNumber = oldRange.startLine;
        return newLineNumber;
    },

    _initializeTextViewer: function(mimeType, content)
    {
        this._textViewer.mimeType = mimeType;

        this._content = content;
        this._textModel.setText(null, content);

        var element = this._textViewer.element;
        if (this._delegate.debuggingSupported()) {
            this._popoverHelper = new WebInspector.PopoverHelper(element,
                this._getPopoverAnchor.bind(this), this._onShowPopover.bind(this), this._onHidePopover.bind(this), true);
            element.addEventListener("mousedown", this._mouseDown.bind(this), true);
            element.addEventListener("scroll", this._scroll.bind(this), true);
        }

        this._textViewer.beginUpdates();

        this._setTextViewerDecorations();

        if (typeof this._executionLineNumber === "number")
            this.setExecutionLine(this._executionLineNumber);

        if (this._lineToHighlight) {
            this.highlightLine(this._lineToHighlight);
            delete this._lineToHighlight;
        }

        if (this._delayedFindSearchMatches) {
            this._delayedFindSearchMatches();
            delete this._delayedFindSearchMatches;
        }

        this.dispatchEventToListeners(WebInspector.SourceFrame.Events.Loaded);

        this._textViewer.endUpdates();

        if (!this.canEditSource())
            this._editButton.disabled = true;
    },

    _setTextViewerDecorations: function()
    {
        this._rowMessages = {};
        this._messageBubbles = {};

        this._textViewer.beginUpdates();

        this._addExistingMessagesToSource();
        this._updateDiffDecorations();

        this._textViewer.doResize();

        this._textViewer.endUpdates();
    },

    performSearch: function(query, callback)
    {
        // Call searchCanceled since it will reset everything we need before doing a new search.
        this.searchCanceled();

        function doFindSearchMatches(query)
        {
            this._currentSearchResultIndex = -1;
            this._searchResults = [];

            var regex = WebInspector.SourceFrame.createSearchRegex(query);
            this._searchResults = this._collectRegexMatches(regex);

            callback(this, this._searchResults.length);
        }

        if (this.loaded)
            doFindSearchMatches.call(this, query);
        else
            this._delayedFindSearchMatches = doFindSearchMatches.bind(this, query);

        this._ensureContentLoaded();
    },

    searchCanceled: function()
    {
        delete this._delayedFindSearchMatches;
        if (!this.loaded)
            return;

        this._currentSearchResultIndex = -1;
        this._searchResults = [];
        this._textViewer.markAndRevealRange(null);
    },

    hasSearchResults: function()
    {
        return this._searchResults.length > 0;
    },

    jumpToFirstSearchResult: function()
    {
        this.jumpToSearchResult(0);
    },

    jumpToLastSearchResult: function()
    {
        this.jumpToSearchResult(this._searchResults.length - 1);
    },

    jumpToNextSearchResult: function()
    {
        this.jumpToSearchResult(this._currentSearchResultIndex + 1);
    },

    jumpToPreviousSearchResult: function()
    {
        this.jumpToSearchResult(this._currentSearchResultIndex - 1);
    },

    showingFirstSearchResult: function()
    {
        return this._searchResults.length &&  this._currentSearchResultIndex === 0;
    },

    showingLastSearchResult: function()
    {
        return this._searchResults.length && this._currentSearchResultIndex === (this._searchResults.length - 1);
    },

    get currentSearchResultIndex()
    {
        return this._currentSearchResultIndex;
    },

    jumpToSearchResult: function(index)
    {
        if (!this.loaded || !this._searchResults.length)
            return;
        this._currentSearchResultIndex = (index + this._searchResults.length) % this._searchResults.length;
        this._textViewer.markAndRevealRange(this._searchResults[this._currentSearchResultIndex]);
    },

    _collectRegexMatches: function(regexObject)
    {
        var ranges = [];
        for (var i = 0; i < this._textModel.linesCount; ++i) {
            var line = this._textModel.line(i);
            var offset = 0;
            do {
                var match = regexObject.exec(line);
                if (match) {
                    if (match[0].length)
                        ranges.push(new WebInspector.TextRange(i, offset + match.index, i, offset + match.index + match[0].length));
                    offset += match.index + 1;
                    line = line.substring(match.index + 1);
                }
            } while (match && line);
        }
        return ranges;
    },

    setExecutionLine: function(lineNumber, skipRevealLine)
    {
        this._executionLineNumber = lineNumber;
        if (this.loaded) {
            this._textViewer.addDecoration(lineNumber, "webkit-execution-line");
            if (!skipRevealLine)
                this._textViewer.revealLine(lineNumber);
        }
    },

    clearExecutionLine: function()
    {
        if (this.loaded)
            this._textViewer.removeDecoration(this._executionLineNumber, "webkit-execution-line");
        delete this._executionLineNumber;
    },

    _updateDiffDecorations: function()
    {
        if (!this._diffLines)
            return;

        function addDecorations(textViewer, lines, className)
        {
            for (var i = 0; i < lines.length; ++i)
                textViewer.addDecoration(lines[i], className);
        }
        addDecorations(this._textViewer, this._diffLines.added, "webkit-added-line");
        addDecorations(this._textViewer, this._diffLines.removed, "webkit-removed-line");
        addDecorations(this._textViewer, this._diffLines.changed, "webkit-changed-line");
    },

    _removeDiffDecorations: function()
    {
        function removeDecorations(textViewer, lines, className)
        {
            for (var i = 0; i < lines.length; ++i)
                textViewer.removeDecoration(lines[i], className);
        }
        removeDecorations(this._textViewer, this._diffLines.added, "webkit-added-line");
        removeDecorations(this._textViewer, this._diffLines.removed, "webkit-removed-line");
        removeDecorations(this._textViewer, this._diffLines.changed, "webkit-changed-line");
    },

    _addExistingMessagesToSource: function()
    {
        var length = this._messages.length;
        for (var i = 0; i < length; ++i)
            this.addMessageToSource(this._messages[i].line - 1, this._messages[i]);
    },

    addMessageToSource: function(lineNumber, msg)
    {
        if (lineNumber >= this._textModel.linesCount)
            lineNumber = this._textModel.linesCount - 1;
        if (lineNumber < 0)
            lineNumber = 0;

        var messageBubbleElement = this._messageBubbles[lineNumber];
        if (!messageBubbleElement || messageBubbleElement.nodeType !== Node.ELEMENT_NODE || !messageBubbleElement.hasStyleClass("webkit-html-message-bubble")) {
            messageBubbleElement = document.createElement("div");
            messageBubbleElement.className = "webkit-html-message-bubble";
            this._messageBubbles[lineNumber] = messageBubbleElement;
            this._textViewer.addDecoration(lineNumber, messageBubbleElement);
        }

        var rowMessages = this._rowMessages[lineNumber];
        if (!rowMessages) {
            rowMessages = [];
            this._rowMessages[lineNumber] = rowMessages;
        }

        for (var i = 0; i < rowMessages.length; ++i) {
            if (rowMessages[i].consoleMessage.isEqual(msg)) {
                rowMessages[i].repeatCount = msg.totalRepeatCount;
                this._updateMessageRepeatCount(rowMessages[i]);
                return;
            }
        }

        var rowMessage = { consoleMessage: msg };
        rowMessages.push(rowMessage);

        var imageURL;
        switch (msg.level) {
            case WebInspector.ConsoleMessage.MessageLevel.Error:
                messageBubbleElement.addStyleClass("webkit-html-error-message");
                imageURL = "Images/errorIcon.png";
                break;
            case WebInspector.ConsoleMessage.MessageLevel.Warning:
                messageBubbleElement.addStyleClass("webkit-html-warning-message");
                imageURL = "Images/warningIcon.png";
                break;
        }

        var messageLineElement = document.createElement("div");
        messageLineElement.className = "webkit-html-message-line";
        messageBubbleElement.appendChild(messageLineElement);

        // Create the image element in the Inspector's document so we can use relative image URLs.
        var image = document.createElement("img");
        image.src = imageURL;
        image.className = "webkit-html-message-icon";
        messageLineElement.appendChild(image);
        messageLineElement.appendChild(document.createTextNode(msg.message));

        rowMessage.element = messageLineElement;
        rowMessage.repeatCount = msg.totalRepeatCount;
        this._updateMessageRepeatCount(rowMessage);
    },

    _updateMessageRepeatCount: function(rowMessage)
    {
        if (rowMessage.repeatCount < 2)
            return;

        if (!rowMessage.repeatCountElement) {
            var repeatCountElement = document.createElement("span");
            rowMessage.element.appendChild(repeatCountElement);
            rowMessage.repeatCountElement = repeatCountElement;
        }

        rowMessage.repeatCountElement.textContent = WebInspector.UIString(" (repeated %d times)", rowMessage.repeatCount);
    },

    addBreakpoint: function(lineNumber, resolved, conditional, enabled)
    {
        this._breakpoints[lineNumber] = {
            resolved: resolved,
            conditional: conditional,
            enabled: enabled
        };
        this._textViewer.beginUpdates();
        this._textViewer.addDecoration(lineNumber, "webkit-breakpoint");
        if (!enabled)
            this._textViewer.addDecoration(lineNumber, "webkit-breakpoint-disabled");
        if (conditional)
            this._textViewer.addDecoration(lineNumber, "webkit-breakpoint-conditional");
        this._textViewer.endUpdates();
    },

    removeBreakpoint: function(lineNumber)
    {
        delete this._breakpoints[lineNumber];
        this._textViewer.beginUpdates();
        this._textViewer.removeDecoration(lineNumber, "webkit-breakpoint");
        this._textViewer.removeDecoration(lineNumber, "webkit-breakpoint-disabled");
        this._textViewer.removeDecoration(lineNumber, "webkit-breakpoint-conditional");
        this._textViewer.endUpdates();
    },

    populateLineGutterContextMenu: function(lineNumber, contextMenu)
    {
        contextMenu.appendItem(WebInspector.UIString(WebInspector.useLowerCaseMenuTitles() ? "Continue to here" : "Continue to Here"), this._delegate.continueToLine.bind(this._delegate, lineNumber));

        var breakpoint = this._delegate.findBreakpoint(lineNumber);
        if (!breakpoint) {
            // This row doesn't have a breakpoint: We want to show Add Breakpoint and Add and Edit Breakpoint.
            contextMenu.appendItem(WebInspector.UIString(WebInspector.useLowerCaseMenuTitles() ? "Add breakpoint" : "Add Breakpoint"), this._delegate.setBreakpoint.bind(this._delegate, lineNumber, "", true));

            function addConditionalBreakpoint()
            {
                this.addBreakpoint(lineNumber, true, true, true);
                function didEditBreakpointCondition(committed, condition)
                {
                    this.removeBreakpoint(lineNumber);
                    if (committed)
                        this._delegate.setBreakpoint(lineNumber, condition, true);
                }
                this._editBreakpointCondition(lineNumber, "", didEditBreakpointCondition.bind(this));
            }
            contextMenu.appendItem(WebInspector.UIString(WebInspector.useLowerCaseMenuTitles() ? "Add conditional breakpoint…" : "Add Conditional Breakpoint…"), addConditionalBreakpoint.bind(this));
        } else {
            // This row has a breakpoint, we want to show edit and remove breakpoint, and either disable or enable.
            contextMenu.appendItem(WebInspector.UIString(WebInspector.useLowerCaseMenuTitles() ? "Remove breakpoint" : "Remove Breakpoint"), this._delegate.removeBreakpoint.bind(this._delegate, lineNumber));
            function editBreakpointCondition()
            {
                function didEditBreakpointCondition(committed, condition)
                {
                    if (committed)
                        this._delegate.updateBreakpoint(lineNumber, condition, breakpoint.enabled);
                }
                this._editBreakpointCondition(lineNumber, breakpoint.condition, didEditBreakpointCondition.bind(this));
            }
            contextMenu.appendItem(WebInspector.UIString(WebInspector.useLowerCaseMenuTitles() ? "Edit breakpoint…" : "Edit Breakpoint…"), editBreakpointCondition.bind(this));
            function setBreakpointEnabled(enabled)
            {
                this._delegate.updateBreakpoint(lineNumber, breakpoint.condition, enabled);
            }
            if (breakpoint.enabled)
                contextMenu.appendItem(WebInspector.UIString(WebInspector.useLowerCaseMenuTitles() ? "Disable breakpoint" : "Disable Breakpoint"), setBreakpointEnabled.bind(this, false));
            else
                contextMenu.appendItem(WebInspector.UIString(WebInspector.useLowerCaseMenuTitles() ? "Enable breakpoint" : "Enable Breakpoint"), setBreakpointEnabled.bind(this, true));
        }
    },

    populateTextAreaContextMenu: function(contextMenu)
    {
    },

    suggestedFileName: function()
    {
        return this._delegate.suggestedFileName();
    },

    _scroll: function(event)
    {
        if (this._popoverHelper)
            this._popoverHelper.hidePopover();
    },

    _mouseDown: function(event)
    {
        if (this._popoverHelper)
            this._popoverHelper.hidePopover();
        if (event.button != 0 || event.altKey || event.ctrlKey || event.metaKey)
            return;
        var target = event.target.enclosingNodeOrSelfWithClass("webkit-line-number");
        if (!target)
            return;
        var lineNumber = target.lineNumber;

        var breakpoint = this._delegate.findBreakpoint(lineNumber);
        if (breakpoint) {
            if (event.shiftKey)
                this._delegate.updateBreakpoint(lineNumber, breakpoint.condition, !breakpoint.enabled);
            else
                this._delegate.removeBreakpoint(lineNumber);
        } else
            this._delegate.setBreakpoint(lineNumber, "", true);
        event.preventDefault();
    },

    _onHidePopover: function()
    {
        // Replace higlight element with its contents inplace.
        var highlightElement = this._highlightElement;
        if (!highlightElement)
            return;
        var parentElement = highlightElement.parentElement;
        var child = highlightElement.firstChild;
        while (child) {
            var nextSibling = child.nextSibling;
            parentElement.insertBefore(child, highlightElement);
            child = nextSibling;
        }
        parentElement.removeChild(highlightElement);
        delete this._highlightElement;
        this._delegate.releaseEvaluationResult();
    },

    _shouldShowPopover: function(element)
    {
        if (!this._delegate.debuggerPaused())
            return false;
        if (!element.enclosingNodeOrSelfWithClass("webkit-line-content"))
            return false;

        // We are interested in identifiers and "this" keyword.
        if (element.hasStyleClass("webkit-javascript-keyword"))
            return element.textContent === "this";

        return element.hasStyleClass("webkit-javascript-ident");
    },

    _getPopoverAnchor: function(element)
    {
        if (!this._shouldShowPopover(element))
            return;
        return element;
    },

    _highlightExpression: function(element)
    {
        // Collect tokens belonging to evaluated exression.
        var tokens = [ element ];
        var token = element.previousSibling;
        while (token && (token.className === "webkit-javascript-ident" || token.className === "webkit-javascript-keyword" || token.textContent.trim() === ".")) {
            tokens.push(token);
            token = token.previousSibling;
        }
        tokens.reverse();

        // Wrap them with highlight element.
        var parentElement = element.parentElement;
        var nextElement = element.nextSibling;
        var container = document.createElement("span");
        for (var i = 0; i < tokens.length; ++i)
            container.appendChild(tokens[i]);
        parentElement.insertBefore(container, nextElement);
        return container;
    },

    _onShowPopover: function(element, popover)
    {
        if (!this._textViewer.readOnly) {
            this._popoverHelper.hidePopover();
            return;
        }
        this._highlightElement = this._highlightExpression(element);

        function showObjectPopover(result, wasThrown)
        {
            if (popover.disposed)
                return;
            if (wasThrown || !this._delegate.debuggerPaused()) {
                this._popoverHelper.hidePopover();
                return;
            }
            var popoverContentElement = null;
            if (result.type !== "object") {
                popoverContentElement = document.createElement("span");
                popoverContentElement.className = "monospace console-formatted-" + result.type;
                popoverContentElement.style.whiteSpace = "pre";
                popoverContentElement.textContent = result.description;
                if (result.type === "string")
                    popoverContentElement.textContent = "\"" + popoverContentElement.textContent + "\"";
                popover.show(popoverContentElement, element);
            } else {
                var popoverContentElement = document.createElement("div");

                var titleElement = document.createElement("div");
                titleElement.className = "source-frame-popover-title monospace";
                titleElement.textContent = result.description;
                popoverContentElement.appendChild(titleElement);

                var section = new WebInspector.ObjectPropertiesSection(result);
                section.expanded = true;
                section.element.addStyleClass("source-frame-popover-tree");
                section.headerElement.addStyleClass("hidden");
                popoverContentElement.appendChild(section.element);

                const popoverWidth = 300;
                const popoverHeight = 250;
                popover.show(popoverContentElement, element, popoverWidth, popoverHeight);
            }
            this._highlightElement.addStyleClass("source-frame-eval-expression");
        }

        this._delegate.evaluateInSelectedCallFrame(this._highlightElement.textContent, showObjectPopover.bind(this));
    },

    _editBreakpointCondition: function(lineNumber, condition, callback)
    {
        this._conditionElement = this._createConditionElement(lineNumber);
        this._textViewer.addDecoration(lineNumber, this._conditionElement);

        function finishEditing(committed, element, newText)
        {
            this._textViewer.removeDecoration(lineNumber, this._conditionElement);
            delete this._conditionEditorElement;
            delete this._conditionElement;
            callback(committed, newText);
        }

        WebInspector.startEditing(this._conditionEditorElement, {
            context: null,
            commitHandler: finishEditing.bind(this, true),
            cancelHandler: finishEditing.bind(this, false)
        });
        this._conditionEditorElement.value = condition;
        this._conditionEditorElement.select();
    },

    _createConditionElement: function(lineNumber)
    {
        var conditionElement = document.createElement("div");
        conditionElement.className = "source-frame-breakpoint-condition";

        var labelElement = document.createElement("label");
        labelElement.className = "source-frame-breakpoint-message";
        labelElement.htmlFor = "source-frame-breakpoint-condition";
        labelElement.appendChild(document.createTextNode(WebInspector.UIString("The breakpoint on line %d will stop only if this expression is true:", lineNumber)));
        conditionElement.appendChild(labelElement);

        var editorElement = document.createElement("input");
        editorElement.id = "source-frame-breakpoint-condition";
        editorElement.className = "monospace";
        editorElement.type = "text";
        conditionElement.appendChild(editorElement);
        this._conditionEditorElement = editorElement;

        return conditionElement;
    },

    inheritScrollPositions: function(sourceFrame)
    {
        this._textViewer.inheritScrollPositions(sourceFrame._textViewer);
    },

    _editButtonClicked: function()
    {
        if (!this.canEditSource())
            return;

        const shouldStartEditing = !this._editButton.toggled;
        if (shouldStartEditing)
            this.startEditing();
        else
            this.commitEditing();
    },

    canEditSource: function()
    {
        return this._delegate.canEditScriptSource();
    },

    startEditing: function(lineNumber)
    {
        if (!this.canEditSource())
            return false;

        if (this._commitEditingInProgress)
            return false;

        this._setReadOnly(false);
        return true;
    },

    commitEditing: function()
    {
        if (!this._viewerState) {
            // No editing was actually done.
            this._setReadOnly(true);
            return;
        }

        function didEditContent(error)
        {
            this._commitEditingInProgress = false;
            this._textViewer.readOnly = false;

            if (error) {
                if (error.message) {
                    WebInspector.log(error.message, WebInspector.ConsoleMessage.MessageLevel.Error);
                    WebInspector.showConsole();
                }
                return;
            }

            var newBreakpoints = {};
            for (var lineNumber in this._breakpoints) {
                newBreakpoints[lineNumber] = this._breakpoints[lineNumber];
                this.removeBreakpoint(Number(lineNumber));
            }

            for (var lineNumber in this._viewerState.breakpoints)
                this._delegate.removeBreakpoint(Number(lineNumber));

            for (var lineNumber in newBreakpoints) {
                var breakpoint = newBreakpoints[lineNumber];
                this._delegate.setBreakpoint(Number(lineNumber), breakpoint.condition, breakpoint.enabled);
            }

            delete this._viewerState;
            this._delegate.setScriptSourceIsBeingEdited(false);
        }
        this._commitEditingInProgress = true;
        this._textViewer.readOnly = true;
        this._editButton.toggled = false;
        this.editContent(this._textModel.text, didEditContent.bind(this));
    },

    editContent: function(newContent, callback)
    {
        this._delegate.setScriptSource(newContent, callback);
    },

    cancelEditing: function()
    {
        this._restoreViewerState();
        this._setReadOnly(true);
    },

    _setReadOnly: function(readOnly)
    {
        if (!readOnly && this._popoverHelper)
            this._popoverHelper.hidePopover();

        this._textViewer.readOnly = readOnly;
        this._editButton.toggled = !readOnly;
        WebInspector.markBeingEdited(this._textViewer.element, !readOnly);
        if (readOnly)
            this._delegate.setScriptSourceIsBeingEdited(false);
    }
}

WebInspector.SourceFrame.prototype.__proto__ = WebInspector.View.prototype;


WebInspector.TextViewerDelegateForSourceFrame = function(sourceFrame)
{
    this._sourceFrame = sourceFrame;
}

WebInspector.TextViewerDelegateForSourceFrame.prototype = {
    doubleClick: function(lineNumber)
    {
        this._sourceFrame.startEditing(lineNumber);
    },

    beforeTextChanged: function()
    {
        this._sourceFrame.beforeTextChanged();
    },

    afterTextChanged: function(oldRange, newRange)
    {
        this._sourceFrame.afterTextChanged(oldRange, newRange);
    },

    commitEditing: function()
    {
        this._sourceFrame.commitEditing();
    },

    cancelEditing: function()
    {
        this._sourceFrame.cancelEditing();
    },

    populateLineGutterContextMenu: function(lineNumber, contextMenu)
    {
        this._sourceFrame.populateLineGutterContextMenu(lineNumber, contextMenu);
    },

    populateTextAreaContextMenu: function(contextMenu)
    {
        this._sourceFrame.populateTextAreaContextMenu(contextMenu);
    },

    suggestedFileName: function()
    {
        return this._sourceFrame.suggestedFileName();
    }
};

WebInspector.TextViewerDelegateForSourceFrame.prototype.__proto__ = WebInspector.TextViewerDelegate.prototype;


WebInspector.SourceFrameDelegate = function()
{
}

WebInspector.SourceFrameDelegate.prototype = {
    requestContent: function(callback)
    {
        // Should be implemented by subclasses.
    },

    debuggingSupported: function()
    {
        return false;
    },

    setBreakpoint: function(lineNumber, condition, enabled)
    {
        // Should be implemented by subclasses.
    },

    removeBreakpoint: function(lineNumber)
    {
        // Should be implemented by subclasses.
    },

    updateBreakpoint: function(lineNumber, condition, enabled)
    {
        // Should be implemented by subclasses.
    },

    findBreakpoint: function(lineNumber)
    {
        // Should be implemented by subclasses.
    },

    continueToLine: function(lineNumber)
    {
        // Should be implemented by subclasses.
    },

    canEditScriptSource: function()
    {
        return false;
    },

    setScriptSource: function(text, callback)
    {
        // Should be implemented by subclasses.
    },

    setScriptSourceIsBeingEdited: function(inEditMode)
    {
        // Should be implemented by subclasses.
    },

    debuggerPaused: function()
    {
        // Should be implemented by subclasses.
    },

    evaluateInSelectedCallFrame: function(string)
    {
        // Should be implemented by subclasses.
    },

    releaseEvaluationResult: function()
    {
        // Should be implemented by subclasses.
    },

    suggestedFileName: function()
    {
        // Should be implemented by subclasses.
    }
}
