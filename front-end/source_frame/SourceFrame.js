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
 * @extends {WebInspector.VBox}
 * @constructor
 * @implements {WebInspector.Replaceable}
 * @param {!WebInspector.ContentProvider} contentProvider
 */
WebInspector.SourceFrame = function(contentProvider)
{
    WebInspector.VBox.call(this);

    this._url = contentProvider.contentURL();
    this._contentProvider = contentProvider;

    var textEditorDelegate = new WebInspector.TextEditorDelegateForSourceFrame(this);

    this._textEditor = new WebInspector.CodeMirrorTextEditor(this._url, textEditorDelegate);

    this._currentSearchResultIndex = -1;
    this._searchResults = [];

    this._rowMessageBuckets = {};

    this._textEditor.setReadOnly(!this.canEditSource());

    this._shortcuts = {};
    this.element.addEventListener("keydown", this._handleKeyDown.bind(this), false);

    this._sourcePosition = new WebInspector.ToolbarText("", "source-frame-cursor-position");

    this._errorPopoverHelper = new WebInspector.PopoverHelper(this.element, this._getErrorAnchor.bind(this), this._showErrorPopover.bind(this));
    this._errorPopoverHelper.setTimeout(100, 100);
}

WebInspector.SourceFrame.Events = {
    ScrollChanged: "ScrollChanged",
    SelectionChanged: "SelectionChanged",
    JumpHappened: "JumpHappened"
}

WebInspector.SourceFrame.prototype = {
    /**
     * @param {!Element} target
     * @param {!Event} event
     * @return {(!Element|undefined)}
     */
    _getErrorAnchor: function(target, event)
    {
        var element = target.enclosingNodeOrSelfWithClass("text-editor-line-decoration-icon")
            || target.enclosingNodeOrSelfWithClass("text-editor-line-decoration-wave");
        if (!element)
            return;
        this._errorWavePopoverAnchor = new AnchorBox(event.clientX, event.clientY, 1, 1);
        return element;
    },

    /**
     * @param {!Element} anchor
     * @param {!WebInspector.Popover} popover
     */
    _showErrorPopover: function(anchor, popover)
    {
        var messageBucket = anchor.enclosingNodeOrSelfWithClass("text-editor-line-decoration")._messageBucket;
        var messagesOutline = messageBucket.messagesDescription();
        var popoverAnchor = anchor.enclosingNodeOrSelfWithClass("text-editor-line-decoration-icon") ? anchor : this._errorWavePopoverAnchor;
        popover.showForAnchor(messagesOutline, popoverAnchor);
    },

    /**
     * @param {number} key
     * @param {function():boolean} handler
     */
    addShortcut: function(key, handler)
    {
        this._shortcuts[key] = handler;
    },

    wasShown: function()
    {
        this._ensureContentLoaded();
        this._textEditor.show(this.element);
        this._editorAttached = true;
        // We need CodeMirrorTextEditor to be initialized prior to this call as it calls |cursorPositionToCoordinates| internally. @see crbug.com/506566
        setImmediate(this._updateBucketDecorations.bind(this));
        this._wasShownOrLoaded();
    },

    _updateBucketDecorations: function()
    {
        for (var line in this._rowMessageBuckets) {
            var bucket = this._rowMessageBuckets[line];
            bucket._updateDecoration();
        }
    },

    /**
     * @return {boolean}
     */
    _isEditorShowing: function()
    {
        return this.isShowing() && this._editorAttached;
    },

    willHide: function()
    {
        WebInspector.Widget.prototype.willHide.call(this);

        this._clearPositionToReveal();
    },

    /**
     * @return {!WebInspector.ToolbarText}
     */
    toolbarText: function()
    {
        return this._sourcePosition;
    },

    /**
     * @override
     * @return {!Element}
     */
    defaultFocusedElement: function()
    {
        return this._textEditor.defaultFocusedElement();
    },

    get loaded()
    {
        return this._loaded;
    },

    get textEditor()
    {
        return this._textEditor;
    },

    _ensureContentLoaded: function()
    {
        if (!this._contentRequested) {
            this._contentRequested = true;
            this._contentProvider.requestContent(this.setContent.bind(this));
        }
    },

    clearMessages: function()
    {
        for (var line in this._rowMessageBuckets) {
            var bubble = this._rowMessageBuckets[line];
            bubble.detachFromEditor();
        }

        this._rowMessageBuckets = {};
        this._errorPopoverHelper.hidePopover();
    },

    /**
     * @param {number} line 0-based
     * @param {number=} column
     * @param {boolean=} shouldHighlight
     */
    revealPosition: function(line, column, shouldHighlight)
    {
        this._clearLineToScrollTo();
        this._clearSelectionToSet();
        this._positionToReveal = { line: line, column: column, shouldHighlight: shouldHighlight };
        this._innerRevealPositionIfNeeded();
    },

    _innerRevealPositionIfNeeded: function()
    {
        if (!this._positionToReveal)
            return;

        if (!this.loaded || !this._isEditorShowing())
            return;

        this._textEditor.revealPosition(this._positionToReveal.line, this._positionToReveal.column, this._positionToReveal.shouldHighlight);
        delete this._positionToReveal;
    },

    _clearPositionToReveal: function()
    {
        this._textEditor.clearPositionHighlight();
        delete this._positionToReveal;
    },

    /**
     * @param {number} line
     */
    scrollToLine: function(line)
    {
        this._clearPositionToReveal();
        this._lineToScrollTo = line;
        this._innerScrollToLineIfNeeded();
    },

    _innerScrollToLineIfNeeded: function()
    {
        if (typeof this._lineToScrollTo === "number") {
            if (this.loaded && this._isEditorShowing()) {
                this._textEditor.scrollToLine(this._lineToScrollTo);
                delete this._lineToScrollTo;
            }
        }
    },

    _clearLineToScrollTo: function()
    {
        delete this._lineToScrollTo;
    },

    /**
     * @return {!WebInspector.TextRange}
     */
    selection: function()
    {
        return this.textEditor.selection();
    },

    /**
     * @param {!WebInspector.TextRange} textRange
     */
    setSelection: function(textRange)
    {
        this._selectionToSet = textRange;
        this._innerSetSelectionIfNeeded();
    },

    _innerSetSelectionIfNeeded: function()
    {
        if (this._selectionToSet && this.loaded && this._isEditorShowing()) {
            this._textEditor.setSelection(this._selectionToSet);
            delete this._selectionToSet;
        }
    },

    _clearSelectionToSet: function()
    {
        delete this._selectionToSet;
    },

    _wasShownOrLoaded: function()
    {
        this._innerRevealPositionIfNeeded();
        this._innerSetSelectionIfNeeded();
        this._innerScrollToLineIfNeeded();
    },

    onTextChanged: function(oldRange, newRange)
    {
        if (this._searchResultsChangedCallback)
            this._searchResultsChangedCallback();
        this.clearMessages();
    },

    /**
     * @param {string} content
     * @param {string} mimeType
     * @return {string}
     */
    _simplifyMimeType: function(content, mimeType)
    {
        if (!mimeType)
            return "";
        if (mimeType.indexOf("javascript") >= 0 ||
            mimeType.indexOf("jscript") >= 0 ||
            mimeType.indexOf("ecmascript") >= 0)
            return "text/javascript";
        // A hack around the fact that files with "php" extension might be either standalone or html embedded php scripts.
        if (mimeType === "text/x-php" && content.match(/\<\?.*\?\>/g))
            return "application/x-httpd-php";
        return mimeType;
    },

    /**
     * @param {string} highlighterType
     */
    setHighlighterType: function(highlighterType)
    {
        this._highlighterType = highlighterType;
        this._updateHighlighterType("");
    },

    /**
     * @param {string} content
     */
    _updateHighlighterType: function(content)
    {
        this._textEditor.setMimeType(this._simplifyMimeType(content, this._highlighterType));
    },

    /**
     * @param {?string} content
     */
    setContent: function(content)
    {
        if (!this._loaded) {
            this._loaded = true;
            this._textEditor.setText(content || "");
            this._textEditor.markClean();
        } else {
            var firstLine = this._textEditor.firstVisibleLine();
            var selection = this._textEditor.selection();
            this._textEditor.setText(content || "");
            this._textEditor.scrollToLine(firstLine);
            this._textEditor.setSelection(selection);
        }

        this._updateHighlighterType(content || "");
        this.clearMessages();
        this._wasShownOrLoaded();

        if (this._delayedFindSearchMatches) {
            this._delayedFindSearchMatches();
            delete this._delayedFindSearchMatches;
        }
        this.onTextEditorContentLoaded();
    },

    onTextEditorContentLoaded: function() {},

    /**
     * @param {!WebInspector.SearchableView.SearchConfig} searchConfig
     * @param {boolean} shouldJump
     * @param {boolean} jumpBackwards
     * @param {function(!WebInspector.Widget, number)} searchFinishedCallback
     */
    _doFindSearchMatches: function(searchConfig, shouldJump, jumpBackwards, searchFinishedCallback)
    {
        this._currentSearchResultIndex = -1;
        this._searchResults = [];

        var regex = searchConfig.toSearchRegex();
        this._searchRegex = regex;
        this._searchResults = this._collectRegexMatches(regex);
        searchFinishedCallback(this, this._searchResults.length);
        if (!this._searchResults.length)
            this._textEditor.cancelSearchResultsHighlight();
        else if (shouldJump && jumpBackwards)
            this.jumpToPreviousSearchResult();
        else if (shouldJump)
            this.jumpToNextSearchResult();
        else
            this._textEditor.highlightSearchResults(regex, null);
    },

    /**
     * @param {!WebInspector.SearchableView.SearchConfig} searchConfig
     * @param {boolean} shouldJump
     * @param {boolean} jumpBackwards
     * @param {function(!WebInspector.Widget, number)} searchFinishedCallback
     * @param {function(number)} currentMatchChangedCallback
     * @param {function()} searchResultsChangedCallback
     */
    performSearch: function(searchConfig, shouldJump, jumpBackwards, searchFinishedCallback, currentMatchChangedCallback, searchResultsChangedCallback)
    {
        this._resetSearch();
        this._currentSearchMatchChangedCallback = currentMatchChangedCallback;
        this._searchResultsChangedCallback = searchResultsChangedCallback;
        var searchFunction = this._doFindSearchMatches.bind(this, searchConfig, shouldJump, jumpBackwards, searchFinishedCallback);
        if (this.loaded)
            searchFunction.call(this);
        else
            this._delayedFindSearchMatches = searchFunction;

        this._ensureContentLoaded();
    },

    _editorFocused: function()
    {
        this._resetCurrentSearchResultIndex();
    },

    _resetCurrentSearchResultIndex: function()
    {
        if (!this._searchResults.length)
            return;
        this._currentSearchResultIndex = -1;
        if (this._currentSearchMatchChangedCallback)
            this._currentSearchMatchChangedCallback(this._currentSearchResultIndex);
        this._textEditor.highlightSearchResults(this._searchRegex, null);
    },

    _resetSearch: function()
    {
        delete this._delayedFindSearchMatches;
        delete this._currentSearchMatchChangedCallback;
        delete this._searchResultsChangedCallback;
        this._currentSearchResultIndex = -1;
        this._searchResults = [];
        delete this._searchRegex;
    },

    searchCanceled: function()
    {
        var range = this._currentSearchResultIndex !== -1 ? this._searchResults[this._currentSearchResultIndex] : null;
        this._resetSearch();
        if (!this.loaded)
            return;
        this._textEditor.cancelSearchResultsHighlight();
        if (range)
            this.setSelection(range);
    },

    /**
     * @return {boolean}
     */
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

    /**
     * @return {number}
     */
    _searchResultIndexForCurrentSelection: function()
    {
        return insertionIndexForObjectInListSortedByFunction(this._textEditor.selection().collapseToEnd(), this._searchResults, WebInspector.TextRange.comparator);
    },

    jumpToNextSearchResult: function()
    {
        var currentIndex = this._searchResultIndexForCurrentSelection();
        var nextIndex = this._currentSearchResultIndex === -1 ? currentIndex : currentIndex + 1;
        this.jumpToSearchResult(nextIndex);
    },

    jumpToPreviousSearchResult: function()
    {
        var currentIndex = this._searchResultIndexForCurrentSelection();
        this.jumpToSearchResult(currentIndex - 1);
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
        if (this._currentSearchMatchChangedCallback)
            this._currentSearchMatchChangedCallback(this._currentSearchResultIndex);
        this._textEditor.highlightSearchResults(this._searchRegex, this._searchResults[this._currentSearchResultIndex]);
    },

    /**
     * @override
     * @param {!WebInspector.SearchableView.SearchConfig} searchConfig
     * @param {string} replacement
     */
    replaceSelectionWith: function(searchConfig, replacement)
    {
        var range = this._searchResults[this._currentSearchResultIndex];
        if (!range)
            return;
        this._textEditor.highlightSearchResults(this._searchRegex, null);

        var oldText = this._textEditor.copyRange(range);
        var regex = searchConfig.toSearchRegex();
        var text;
        if (regex.__fromRegExpQuery)
            text = oldText.replace(regex, replacement);
        else
            text = oldText.replace(regex, function() { return replacement; });

        var newRange = this._textEditor.editRange(range, text);
        this._textEditor.setSelection(newRange.collapseToEnd());
    },

    /**
     * @override
     * @param {!WebInspector.SearchableView.SearchConfig} searchConfig
     * @param {string} replacement
     */
    replaceAllWith: function(searchConfig, replacement)
    {
        this._resetCurrentSearchResultIndex();

        var text = this._textEditor.text();
        var range = this._textEditor.range();

        var regex = searchConfig.toSearchRegex(true);
        if (regex.__fromRegExpQuery)
            text = text.replace(regex, replacement);
        else
            text = text.replace(regex, function() { return replacement; });

        var ranges = this._collectRegexMatches(regex);
        if (!ranges.length)
            return;

        // Calculate the position of the end of the last range to be edited.
        var currentRangeIndex = insertionIndexForObjectInListSortedByFunction(this._textEditor.selection(), ranges, WebInspector.TextRange.comparator);
        var lastRangeIndex = mod(currentRangeIndex - 1, ranges.length);
        var lastRange = ranges[lastRangeIndex];
        var replacementLineEndings = replacement.lineEndings();
        var replacementLineCount = replacementLineEndings.length;
        var lastLineNumber = lastRange.startLine + replacementLineEndings.length - 1;
        var lastColumnNumber = lastRange.startColumn;
        if (replacementLineEndings.length > 1)
            lastColumnNumber = replacementLineEndings[replacementLineCount - 1] - replacementLineEndings[replacementLineCount - 2] - 1;

        this._textEditor.editRange(range, text);
        this._textEditor.revealPosition(lastLineNumber, lastColumnNumber);
        this._textEditor.setSelection(WebInspector.TextRange.createFromLocation(lastLineNumber, lastColumnNumber));
    },

    _collectRegexMatches: function(regexObject)
    {
        var ranges = [];
        for (var i = 0; i < this._textEditor.linesCount; ++i) {
            var line = this._textEditor.line(i);
            var offset = 0;
            do {
                var match = regexObject.exec(line);
                if (match) {
                    var matchEndIndex = match.index + Math.max(match[0].length, 1);
                    if (match[0].length)
                        ranges.push(new WebInspector.TextRange(i, offset + match.index, i, offset + matchEndIndex));
                    offset += matchEndIndex;
                    line = line.substring(matchEndIndex);
                }
            } while (match && line);
        }
        return ranges;
    },

    /**
     * @param {!WebInspector.SourceFrameMessage} message
     */
    addMessageToSource: function(message)
    {
        var lineNumber = message.lineNumber();
        if (lineNumber >= this._textEditor.linesCount)
            lineNumber = this._textEditor.linesCount - 1;
        if (lineNumber < 0)
            lineNumber = 0;

        if (!this._rowMessageBuckets[lineNumber])
            this._rowMessageBuckets[lineNumber] = new WebInspector.SourceFrame.RowMessageBucket(this, this._textEditor, lineNumber);
        var messageBucket = this._rowMessageBuckets[lineNumber];
        messageBucket.addMessage(message);
    },

    /**
     * @param {!WebInspector.SourceFrameMessage} message
     */
    removeMessageFromSource: function(message)
    {
        var lineNumber = message.lineNumber();
        if (lineNumber >= this._textEditor.linesCount)
            lineNumber = this._textEditor.linesCount - 1;
        if (lineNumber < 0)
            lineNumber = 0;

        var messageBucket = this._rowMessageBuckets[lineNumber];
        if (!messageBucket)
            return;
        messageBucket.removeMessage(message);
        if (!messageBucket.uniqueMessagesCount()) {
            messageBucket.detachFromEditor();
            delete this._rowMessageBuckets[lineNumber];
        }
    },

    populateLineGutterContextMenu: function(contextMenu, lineNumber)
    {
    },

    populateTextAreaContextMenu: function(contextMenu, lineNumber, columnNumber)
    {
    },

    /**
     * @param {?WebInspector.TextRange} from
     * @param {?WebInspector.TextRange} to
     */
    onJumpToPosition: function(from, to)
    {
        this.dispatchEventToListeners(WebInspector.SourceFrame.Events.JumpHappened, {
            from: from,
            to: to
        });
    },

    /**
     * @return {boolean}
     */
    canEditSource: function()
    {
        return false;
    },

    /**
     * @param {!WebInspector.TextRange} textRange
     */
    selectionChanged: function(textRange)
    {
        this._updateSourcePosition();
        this.dispatchEventToListeners(WebInspector.SourceFrame.Events.SelectionChanged, textRange);
        WebInspector.notifications.dispatchEventToListeners(WebInspector.SourceFrame.Events.SelectionChanged, textRange);
    },

    _updateSourcePosition: function()
    {
        var selections = this._textEditor.selections();
        if (!selections.length)
            return;
        if (selections.length > 1) {
            this._sourcePosition.setText(WebInspector.UIString("%d selection regions", selections.length));
            return;
        }
        var textRange = selections[0];
        if (textRange.isEmpty()) {
            this._sourcePosition.setText(WebInspector.UIString("Line %d, Column %d", textRange.endLine + 1, textRange.endColumn + 1));
            return;
        }
        textRange = textRange.normalize();

        var selectedText = this._textEditor.copyRange(textRange);
        if (textRange.startLine === textRange.endLine)
            this._sourcePosition.setText(WebInspector.UIString("%d characters selected", selectedText.length));
        else
            this._sourcePosition.setText(WebInspector.UIString("%d lines, %d characters selected", textRange.endLine - textRange.startLine + 1, selectedText.length));
    },

    /**
     * @param {number} lineNumber
     */
    scrollChanged: function(lineNumber)
    {
        this.dispatchEventToListeners(WebInspector.SourceFrame.Events.ScrollChanged, lineNumber);
    },

    _handleKeyDown: function(e)
    {
        var shortcutKey = WebInspector.KeyboardShortcut.makeKeyFromEvent(e);
        var handler = this._shortcuts[shortcutKey];
        if (handler && handler())
            e.consume(true);
    },

    __proto__: WebInspector.VBox.prototype
}

/**
 * @constructor
 * @param {string} messageText
 * @param {!WebInspector.SourceFrameMessage.Level} level
 * @param {number} lineNumber
 * @param {number=} columnNumber
 */
WebInspector.SourceFrameMessage = function(messageText, level, lineNumber, columnNumber)
{
    this._messageText = messageText;
    this._level = level;
    this._lineNumber = lineNumber;
    this._columnNumber = columnNumber;
}

/**
 * @enum {string}
 */
WebInspector.SourceFrameMessage.Level = {
    Error: "Error",
    Warning: "Warning"
}

/**
 * @param {!WebInspector.ConsoleMessage} consoleMessage
 * @param {number} lineNumber
 * @param {number} columnNumber
 * @return {!WebInspector.SourceFrameMessage}
 */
WebInspector.SourceFrameMessage.fromConsoleMessage = function(consoleMessage, lineNumber, columnNumber)
{
    console.assert(consoleMessage.level === WebInspector.ConsoleMessage.MessageLevel.Error || consoleMessage.level === WebInspector.ConsoleMessage.MessageLevel.Warning);
    var level = consoleMessage.level === WebInspector.ConsoleMessage.MessageLevel.Error ? WebInspector.SourceFrameMessage.Level.Error : WebInspector.SourceFrameMessage.Level.Warning;
    return new WebInspector.SourceFrameMessage(consoleMessage.messageText, level, lineNumber, columnNumber);
}

WebInspector.SourceFrameMessage.prototype = {
    /**
     * @return {string}
     */
    messageText: function()
    {
        return this._messageText;
    },

    /**
     * @return {!WebInspector.SourceFrameMessage.Level}
     */
    level: function()
    {
        return this._level;
    },

    /**
     * @return {number}
     */
    lineNumber: function()
    {
        return this._lineNumber;
    },

    /**
     * @return {(number|undefined)}
     */
    columnNumber: function()
    {
        return this._columnNumber;
    },

    /**
     * @param {!WebInspector.SourceFrameMessage} another
     * @return {boolean}
     */
    isEqual: function(another)
    {
        return this.messageText() === another.messageText() && this.level() === another.level() && this.lineNumber() === another.lineNumber() && this.columnNumber() === another.columnNumber();
    }
}

WebInspector.SourceFrame._iconClassPerLevel = {};
WebInspector.SourceFrame._iconClassPerLevel[WebInspector.SourceFrameMessage.Level.Error] = "error-icon";
WebInspector.SourceFrame._iconClassPerLevel[WebInspector.SourceFrameMessage.Level.Warning] = "warning-icon";

WebInspector.SourceFrame._lineClassPerLevel = {};
WebInspector.SourceFrame._lineClassPerLevel[WebInspector.SourceFrameMessage.Level.Error] = "text-editor-line-with-error";
WebInspector.SourceFrame._lineClassPerLevel[WebInspector.SourceFrameMessage.Level.Warning] = "text-editor-line-with-warning";

/**
 * @constructor
 * @param {!WebInspector.SourceFrameMessage} message
 */
WebInspector.SourceFrame.RowMessage = function(message)
{
    this._message = message;
    this._repeatCount = 1;
    this.element = createElementWithClass("div", "text-editor-row-message");
    this._icon = this.element.createChild("label", "", "dt-icon-label");
    this._icon.type = WebInspector.SourceFrame._iconClassPerLevel[message.level()];
    this._repeatCountElement = this.element.createChild("span", "bubble-repeat-count hidden error");
    var linesContainer = this.element.createChild("div", "text-editor-row-message-lines");
    var lines = this._message.messageText().split("\n");
    for (var i = 0; i < lines.length; ++i) {
        var messageLine = linesContainer.createChild("div");
        messageLine.textContent = lines[i];
    }
}

WebInspector.SourceFrame.RowMessage.prototype = {
    /**
     * @return {!WebInspector.SourceFrameMessage}
     */
    message: function()
    {
        return this._message;
    },

    /**
     * @return {number}
     */
    repeatCount: function()
    {
        return this._repeatCount;
    },

    setRepeatCount: function(repeatCount)
    {
        if (this._repeatCount === repeatCount)
            return;
        this._repeatCount = repeatCount;
        this._updateMessageRepeatCount();
    },

    _updateMessageRepeatCount: function()
    {
        this._repeatCountElement.textContent = this._repeatCount;
        var showRepeatCount = this._repeatCount > 1;
        this._repeatCountElement.classList.toggle("hidden", !showRepeatCount);
        this._icon.classList.toggle("hidden", showRepeatCount);
    }
}

/**
 * @constructor
 * @param {!WebInspector.SourceFrame} sourceFrame
 * @param {!WebInspector.CodeMirrorTextEditor} textEditor
 * @param {number} lineNumber
 */
WebInspector.SourceFrame.RowMessageBucket = function(sourceFrame, textEditor, lineNumber)
{
    this._sourceFrame = sourceFrame;
    this._textEditor = textEditor;
    this._lineHandle = textEditor.textEditorPositionHandle(lineNumber, 0);
    this._decoration = createElementWithClass("div", "text-editor-line-decoration");
    this._decoration._messageBucket = this;
    this._wave = this._decoration.createChild("div", "text-editor-line-decoration-wave");
    this._icon = this._wave.createChild("label", "text-editor-line-decoration-icon", "dt-icon-label");

    this._textEditor.addDecoration(lineNumber, this._decoration);

    this._messagesDescriptionElement = createElementWithClass("div", "text-editor-messages-description-container");
    /** @type {!Array.<!WebInspector.SourceFrame.RowMessage>} */
    this._messages = [];

    this._level = null;
}

WebInspector.SourceFrame.RowMessageBucket.prototype = {
    /**
     * @param {number} lineNumber
     * @param {number} columnNumber
     */
    _updateWavePosition: function(lineNumber, columnNumber)
    {
        lineNumber = Math.min(lineNumber, this._textEditor.linesCount - 1);
        var lineText = this._textEditor.line(lineNumber);
        columnNumber = Math.min(columnNumber, lineText.length);
        var lineIndent = WebInspector.TextUtils.lineIndent(lineText).length;
        var base = this._textEditor.cursorPositionToCoordinates(lineNumber, 0);

        var start = this._textEditor.cursorPositionToCoordinates(lineNumber, Math.max(columnNumber - 1, lineIndent));
        var end = this._textEditor.cursorPositionToCoordinates(lineNumber, lineText.length);
        /** @const */
        var codeMirrorLinesLeftPadding = 4;
        this._wave.style.left = (start.x - base.x + codeMirrorLinesLeftPadding) + "px";
        this._wave.style.width = (end.x - start.x) + "px";
    },

    /**
     * @return {!Element}
     */
    messagesDescription: function()
    {
        this._messagesDescriptionElement.removeChildren();
        for (var i = 0; i < this._messages.length; ++i) {
            this._messagesDescriptionElement.appendChild(this._messages[i].element);
        }
        return this._messagesDescriptionElement;
    },

    detachFromEditor: function()
    {
        var position = this._lineHandle.resolve();
        if (!position)
            return;
        var lineNumber = position.lineNumber;
        if (this._level)
            this._textEditor.toggleLineClass(lineNumber, WebInspector.SourceFrame._lineClassPerLevel[this._level], false);
        this._textEditor.removeDecoration(lineNumber, this._decoration);
    },

    /**
     * @return {number}
     */
    uniqueMessagesCount: function()
    {
        return this._messages.length;
    },

    /**
     * @param {!WebInspector.SourceFrameMessage} message
     */
    addMessage: function(message)
    {
        for (var i = 0; i < this._messages.length; ++i) {
            var rowMessage = this._messages[i];
            if (rowMessage.message().isEqual(message)) {
                rowMessage.setRepeatCount(rowMessage.repeatCount() + 1);
                return;
            }
        }

        var rowMessage = new WebInspector.SourceFrame.RowMessage(message);
        this._messages.push(rowMessage);
        this._updateDecoration();
    },

    /**
     * @param {!WebInspector.SourceFrameMessage} message
     */
    removeMessage: function(message)
    {
        for (var i = 0; i < this._messages.length; ++i) {
            var rowMessage = this._messages[i];
            if (!rowMessage.message().isEqual(message))
                continue;
            rowMessage.setRepeatCount(rowMessage.repeatCount() - 1);
            if (!rowMessage.repeatCount())
                this._messages.splice(i, 1);
            this._updateDecoration();
            return;
        }
    },

    _updateDecoration: function()
    {
        if (!this._sourceFrame._isEditorShowing())
            return;
        if (!this._messages.length)
            return;
        var position = this._lineHandle.resolve();
        if (!position)
            return;

        var lineNumber = position.lineNumber;
        var columnNumber = Number.MAX_VALUE;
        var maxMessage = null;
        for (var i = 0; i < this._messages.length; ++i) {
            var message = this._messages[i].message();
            columnNumber = Math.min(columnNumber, message.columnNumber());
            if (!maxMessage || WebInspector.SourceFrameMessage.messageLevelComparator(maxMessage, message) < 0)
                maxMessage = message;
        }
        this._updateWavePosition(lineNumber, columnNumber);

        if (this._level) {
            this._textEditor.toggleLineClass(lineNumber, WebInspector.SourceFrame._lineClassPerLevel[this._level], false);
            this._icon.type = "";
        }
        this._level = maxMessage.level();
        if (!this._level)
            return;
        this._textEditor.toggleLineClass(lineNumber, WebInspector.SourceFrame._lineClassPerLevel[this._level], true);
        this._icon.type = WebInspector.SourceFrame._iconClassPerLevel[this._level];
    }
}

/**
 * @implements {WebInspector.TextEditorDelegate}
 * @constructor
 */
WebInspector.TextEditorDelegateForSourceFrame = function(sourceFrame)
{
    this._sourceFrame = sourceFrame;
}

WebInspector.TextEditorDelegateForSourceFrame.prototype = {
    /**
     * @override
     */
    onTextChanged: function(oldRange, newRange)
    {
        this._sourceFrame.onTextChanged(oldRange, newRange);
    },

    /**
     * @override
     * @param {!WebInspector.TextRange} textRange
     */
    selectionChanged: function(textRange)
    {
        this._sourceFrame.selectionChanged(textRange);
    },

    /**
     * @override
     * @param {number} lineNumber
     */
    scrollChanged: function(lineNumber)
    {
        this._sourceFrame.scrollChanged(lineNumber);
    },

    /**
     * @override
     */
    editorFocused: function()
    {
        this._sourceFrame._editorFocused();
    },

    /**
     * @override
     */
    populateLineGutterContextMenu: function(contextMenu, lineNumber)
    {
        this._sourceFrame.populateLineGutterContextMenu(contextMenu, lineNumber);
    },

    /**
     * @override
     */
    populateTextAreaContextMenu: function(contextMenu, lineNumber, columnNumber)
    {
        this._sourceFrame.populateTextAreaContextMenu(contextMenu, lineNumber, columnNumber);
    },

    /**
     * @override
     * @param {?WebInspector.TextRange} from
     * @param {?WebInspector.TextRange} to
     */
    onJumpToPosition: function(from, to)
    {
        this._sourceFrame.onJumpToPosition(from, to);
    }
}

WebInspector.SourceFrameMessage._messageLevelPriority = {
    "Warning": 3,
    "Error": 4
};

/**
 * @param {!WebInspector.SourceFrameMessage} a
 * @param {!WebInspector.SourceFrameMessage} b
 * @return {number}
 */
WebInspector.SourceFrameMessage.messageLevelComparator = function(a, b)
{
    return WebInspector.SourceFrameMessage._messageLevelPriority[a.level()] - WebInspector.SourceFrameMessage._messageLevelPriority[b.level()];
}
