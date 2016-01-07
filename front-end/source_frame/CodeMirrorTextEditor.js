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
 * @extends {WebInspector.VBox}
 * @param {?string} url
 * @param {!WebInspector.TextEditorDelegate} delegate
 */
WebInspector.CodeMirrorTextEditor = function(url, delegate)
{
    WebInspector.VBox.call(this);
    this._delegate = delegate;
    this._url = url;

    this.registerRequiredCSS("cm/codemirror.css");
    this.registerRequiredCSS("source_frame/cmdevtools.css");

    this.element.appendChild(WebInspector.CodeMirrorUtils.createThemeStyle());

    this._codeMirror = new window.CodeMirror(this.element, {
        lineNumbers: true,
        gutters: ["CodeMirror-linenumbers"],
        matchBrackets: true,
        smartIndent: false,
        styleSelectedText: true,
        electricChars: false,
        styleActiveLine: true
    });
    this._codeMirrorElement = this.element.lastElementChild;

    this._codeMirror._codeMirrorTextEditor = this;

    CodeMirror.keyMap["devtools-common"] = {
        "Left": "goCharLeft",
        "Right": "goCharRight",
        "Up": "goLineUp",
        "Down": "goLineDown",
        "End": "goLineEnd",
        "Home": "goLineStartSmart",
        "PageUp": "goPageUp",
        "PageDown": "goPageDown",
        "Delete": "delCharAfter",
        "Backspace": "delCharBefore",
        "Tab": "defaultTab",
        "Shift-Tab": "indentLess",
        "Enter": "smartNewlineAndIndent",
        "Ctrl-Space": "autocomplete",
        "Esc": "dismissMultipleSelections",
        "Ctrl-M": "gotoMatchingBracket"
    };

    CodeMirror.keyMap["devtools-pc"] = {
        "Ctrl-A": "selectAll",
        "Ctrl-Z": "undoAndReveal",
        "Shift-Ctrl-Z": "redoAndReveal",
        "Ctrl-Y": "redo",
        "Ctrl-Home": "goDocStart",
        "Ctrl-Up": "goDocStart",
        "Ctrl-End": "goDocEnd",
        "Ctrl-Down": "goDocEnd",
        "Ctrl-Left": "goGroupLeft",
        "Ctrl-Right": "goGroupRight",
        "Alt-Left": "moveCamelLeft",
        "Alt-Right": "moveCamelRight",
        "Shift-Alt-Left": "selectCamelLeft",
        "Shift-Alt-Right": "selectCamelRight",
        "Ctrl-Backspace": "delGroupBefore",
        "Ctrl-Delete": "delGroupAfter",
        "Ctrl-/": "toggleComment",
        "Ctrl-D": "selectNextOccurrence",
        "Ctrl-U": "undoLastSelection",
        fallthrough: "devtools-common"
    };

    CodeMirror.keyMap["devtools-mac"] = {
        "Cmd-A" : "selectAll",
        "Cmd-Z" : "undoAndReveal",
        "Shift-Cmd-Z": "redoAndReveal",
        "Cmd-Up": "goDocStart",
        "Cmd-Down": "goDocEnd",
        "Alt-Left": "goGroupLeft",
        "Alt-Right": "goGroupRight",
        "Ctrl-Left": "moveCamelLeft",
        "Ctrl-Right": "moveCamelRight",
        "Shift-Ctrl-Left": "selectCamelLeft",
        "Shift-Ctrl-Right": "selectCamelRight",
        "Cmd-Left": "goLineStartSmart",
        "Cmd-Right": "goLineEnd",
        "Cmd-Backspace": "delLineLeft",
        "Alt-Backspace": "delGroupBefore",
        "Alt-Delete": "delGroupAfter",
        "Cmd-/": "toggleComment",
        "Cmd-D": "selectNextOccurrence",
        "Cmd-U": "undoLastSelection",
        fallthrough: "devtools-common"
    };

    WebInspector.moduleSetting("textEditorIndent").addChangeListener(this._onUpdateEditorIndentation, this);
    WebInspector.moduleSetting("textEditorAutoDetectIndent").addChangeListener(this._onUpdateEditorIndentation, this);
    this._onUpdateEditorIndentation();
    WebInspector.moduleSetting("showWhitespacesInEditor").addChangeListener(this._updateCodeMirrorMode, this);
    WebInspector.moduleSetting("textEditorBracketMatching").addChangeListener(this._enableBracketMatchingIfNeeded, this);
    this._enableBracketMatchingIfNeeded();

    this._codeMirror.setOption("keyMap", WebInspector.isMac() ? "devtools-mac" : "devtools-pc");

    this._codeMirror.addKeyMap({
        "'": "maybeAvoidSmartSingleQuotes",
        "'\"'": "maybeAvoidSmartDoubleQuotes"
    });

    this._codeMirror.setOption("flattenSpans", false);

    this._codeMirror.setOption("maxHighlightLength", WebInspector.CodeMirrorTextEditor.maxHighlightLength);
    this._codeMirror.setOption("mode", null);
    this._codeMirror.setOption("crudeMeasuringFrom", 1000);

    this._shouldClearHistory = true;
    this._lineSeparator = "\n";

    this._autocompleteController = new WebInspector.TextEditorAutocompleteController(this, this._codeMirror);
    this._tokenHighlighter = new WebInspector.CodeMirrorTextEditor.TokenHighlighter(this, this._codeMirror);
    this._blockIndentController = new WebInspector.CodeMirrorTextEditor.BlockIndentController(this._codeMirror);
    this._fixWordMovement = new WebInspector.CodeMirrorTextEditor.FixWordMovement(this._codeMirror);
    this._selectNextOccurrenceController = new WebInspector.CodeMirrorTextEditor.SelectNextOccurrenceController(this, this._codeMirror);

    WebInspector.moduleSetting("textEditorAutocompletion").addChangeListener(this._enableAutocompletionIfNeeded, this);
    this._enableAutocompletionIfNeeded();

    this._codeMirror.on("changes", this._changes.bind(this));
    this._codeMirror.on("gutterClick", this._gutterClick.bind(this));
    this._codeMirror.on("cursorActivity", this._cursorActivity.bind(this));
    this._codeMirror.on("beforeSelectionChange", this._beforeSelectionChange.bind(this));
    this._codeMirror.on("scroll", this._scroll.bind(this));
    this._codeMirror.on("focus", this._focus.bind(this));
    this._codeMirror.on("keyHandled", this._onKeyHandled.bind(this));
    this.element.addEventListener("contextmenu", this._contextMenu.bind(this), false);
    /**
     * @this {WebInspector.CodeMirrorTextEditor}
     */
    function updateAnticipateJumpFlag(value)
    {
        this._isHandlingMouseDownEvent = value;
    }
    this.element.addEventListener("mousedown", updateAnticipateJumpFlag.bind(this, true), true);
    this.element.addEventListener("mousedown", updateAnticipateJumpFlag.bind(this, false), false);

    this.element.style.overflow = "hidden";
    this._codeMirrorElement.classList.add("source-code");
    this._codeMirrorElement.classList.add("fill");
    this._elementToWidget = new Map();
    this._nestedUpdatesCounter = 0;

    this.element.addEventListener("focus", this._handleElementFocus.bind(this), false);
    this.element.addEventListener("keydown", this._handleKeyDown.bind(this), true);
    this.element.addEventListener("keydown", this._handlePostKeyDown.bind(this), false);
    this.element.tabIndex = 0;

    this._setupWhitespaceHighlight();
}

WebInspector.CodeMirrorTextEditor.maxHighlightLength = 1000;

/**
 * @param {!CodeMirror} codeMirror
 */
WebInspector.CodeMirrorTextEditor.autocompleteCommand = function(codeMirror)
{
    codeMirror._codeMirrorTextEditor._autocompleteController.autocomplete();
}
CodeMirror.commands.autocomplete = WebInspector.CodeMirrorTextEditor.autocompleteCommand;

/**
 * @param {!CodeMirror} codeMirror
 */
WebInspector.CodeMirrorTextEditor.undoLastSelectionCommand = function(codeMirror)
{
    codeMirror._codeMirrorTextEditor._selectNextOccurrenceController.undoLastSelection();
}
CodeMirror.commands.undoLastSelection = WebInspector.CodeMirrorTextEditor.undoLastSelectionCommand;

/**
 * @param {!CodeMirror} codeMirror
 */
WebInspector.CodeMirrorTextEditor.selectNextOccurrenceCommand = function(codeMirror)
{
    codeMirror._codeMirrorTextEditor._selectNextOccurrenceController.selectNextOccurrence();
}
CodeMirror.commands.selectNextOccurrence = WebInspector.CodeMirrorTextEditor.selectNextOccurrenceCommand;

/**
 * @param {boolean} shift
 * @param {!CodeMirror} codeMirror
 */
WebInspector.CodeMirrorTextEditor.moveCamelLeftCommand = function(shift, codeMirror)
{
    codeMirror._codeMirrorTextEditor._doCamelCaseMovement(-1, shift);
}
CodeMirror.commands.moveCamelLeft = WebInspector.CodeMirrorTextEditor.moveCamelLeftCommand.bind(null, false);
CodeMirror.commands.selectCamelLeft = WebInspector.CodeMirrorTextEditor.moveCamelLeftCommand.bind(null, true);

/**
 * @param {boolean} shift
 * @param {!CodeMirror} codeMirror
 */
WebInspector.CodeMirrorTextEditor.moveCamelRightCommand = function(shift, codeMirror)
{
    codeMirror._codeMirrorTextEditor._doCamelCaseMovement(1, shift);
}
CodeMirror.commands.moveCamelRight = WebInspector.CodeMirrorTextEditor.moveCamelRightCommand.bind(null, false);
CodeMirror.commands.selectCamelRight = WebInspector.CodeMirrorTextEditor.moveCamelRightCommand.bind(null, true);

/**
 * @param {!CodeMirror} codeMirror
 */
CodeMirror.commands.smartNewlineAndIndent = function(codeMirror)
{
    codeMirror.operation(innerSmartNewlineAndIndent.bind(null, codeMirror));

    function innerSmartNewlineAndIndent(codeMirror)
    {
        var selections = codeMirror.listSelections();
        var replacements = [];
        for (var i = 0; i < selections.length; ++i) {
            var selection = selections[i];
            var cur = CodeMirror.cmpPos(selection.head, selection.anchor) < 0 ? selection.head : selection.anchor;
            var line = codeMirror.getLine(cur.line);
            var indent = WebInspector.TextUtils.lineIndent(line);
            replacements.push("\n" + indent.substring(0, Math.min(cur.ch, indent.length)));
        }
        codeMirror.replaceSelections(replacements);
        codeMirror._codeMirrorTextEditor._onAutoAppendedSpaces();
    }
}

/**
 * @param {!CodeMirror} codeMirror
 */
CodeMirror.commands.gotoMatchingBracket = function(codeMirror)
{
    var updatedSelections = [];
    var selections = codeMirror.listSelections();
    for (var i = 0; i < selections.length; ++i) {
        var selection = selections[i];
        var cursor = selection.head;
        var matchingBracket = codeMirror.findMatchingBracket(cursor, false, { maxScanLines: 10000 });
        var updatedHead = cursor;
        if (matchingBracket && matchingBracket.match) {
            var columnCorrection = CodeMirror.cmpPos(matchingBracket.from, cursor) === 0 ? 1 : 0;
            updatedHead = new CodeMirror.Pos(matchingBracket.to.line, matchingBracket.to.ch + columnCorrection);
        }
        updatedSelections.push({
            anchor: updatedHead,
            head: updatedHead
        });
    }
    codeMirror.setSelections(updatedSelections);
}

/**
 * @param {!CodeMirror} codemirror
 */
CodeMirror.commands.undoAndReveal = function(codemirror)
{
    var scrollInfo = codemirror.getScrollInfo();
    codemirror.execCommand("undo");
    var cursor = codemirror.getCursor("start");
    codemirror._codeMirrorTextEditor._innerRevealLine(cursor.line, scrollInfo);
    codemirror._codeMirrorTextEditor._autocompleteController.finishAutocomplete();
}

/**
 * @param {!CodeMirror} codemirror
 */
CodeMirror.commands.redoAndReveal = function(codemirror)
{
    var scrollInfo = codemirror.getScrollInfo();
    codemirror.execCommand("redo");
    var cursor = codemirror.getCursor("start");
    codemirror._codeMirrorTextEditor._innerRevealLine(cursor.line, scrollInfo);
    codemirror._codeMirrorTextEditor._autocompleteController.finishAutocomplete();
}

/**
 * @return {!Object|undefined}
 */
CodeMirror.commands.dismissMultipleSelections = function(codemirror)
{
    var selections = codemirror.listSelections();
    var selection = selections[0];
    if (selections.length === 1) {
        if (codemirror._codeMirrorTextEditor._isSearchActive())
            return CodeMirror.Pass;
        if (WebInspector.CodeMirrorUtils.toRange(selection.anchor, selection.head).isEmpty())
            return CodeMirror.Pass;
        codemirror.setSelection(selection.anchor, selection.anchor, {scroll: false});
        codemirror._codeMirrorTextEditor._revealLine(selection.anchor.line);
        return;
    }

    codemirror.setSelection(selection.anchor, selection.head, {scroll: false});
    codemirror._codeMirrorTextEditor._revealLine(selection.anchor.line);
}

/**
 * @param {string} quoteCharacter
 * @param {!CodeMirror} codeMirror
 * @return {*}
 */
WebInspector.CodeMirrorTextEditor._maybeAvoidSmartQuotes = function(quoteCharacter, codeMirror)
{
    var textEditor = codeMirror._codeMirrorTextEditor;
    if (!WebInspector.moduleSetting("textEditorBracketMatching").get())
        return CodeMirror.Pass;
    var selections = textEditor.selections();
    if (selections.length !== 1 || !selections[0].isEmpty())
        return CodeMirror.Pass;

    var selection = selections[0];
    var token = textEditor.tokenAtTextPosition(selection.startLine, selection.startColumn);
    if (!token || !token.type || token.type.indexOf("string") === -1)
        return CodeMirror.Pass;
    var line = textEditor.line(selection.startLine);
    var tokenValue = line.substring(token.startColumn, token.endColumn);
    if (tokenValue[0] === tokenValue[tokenValue.length - 1] && (tokenValue[0] === "'" || tokenValue[0] === "\""))
        return CodeMirror.Pass;
    codeMirror.replaceSelection(quoteCharacter);
}
CodeMirror.commands.maybeAvoidSmartSingleQuotes = WebInspector.CodeMirrorTextEditor._maybeAvoidSmartQuotes.bind(null, "'");
CodeMirror.commands.maybeAvoidSmartDoubleQuotes = WebInspector.CodeMirrorTextEditor._maybeAvoidSmartQuotes.bind(null, "\"");

WebInspector.CodeMirrorTextEditor.LongLineModeLineLengthThreshold = 2000;
WebInspector.CodeMirrorTextEditor.MaximumNumberOfWhitespacesPerSingleSpan = 16;
WebInspector.CodeMirrorTextEditor.MaxEditableTextSize = 1024 * 1024 * 10;

WebInspector.CodeMirrorTextEditor.LinesToScanForIndentationGuessing = 1000;

/**
 * @param {!Array.<string>} lines
 * @return {string}
 */
WebInspector.CodeMirrorTextEditor._guessIndentationLevel = function(lines)
{
    var tabRegex = /^\t+/;
    var tabLines = 0;
    var indents = {};

    for (var lineNumber = 0; lineNumber < lines.length; ++lineNumber) {
        var text = lines[lineNumber];
        if (text.length === 0 || !WebInspector.TextUtils.isSpaceChar(text[0]))
            continue;
        if (tabRegex.test(text)) {
            ++tabLines;
            continue;
        }
        var i = 0;
        while (i < text.length && WebInspector.TextUtils.isSpaceChar(text[i]))
            ++i;
        if (i % 2 !== 0)
            continue;
        indents[i] = 1 + (indents[i] || 0);
    }

    var linesCountPerIndentThreshold = 3 * lines.length / 100;
    if (tabLines && tabLines > linesCountPerIndentThreshold)
        return "\t";
    var minimumIndent = Infinity;
    for (var i in indents) {
        if (indents[i] < linesCountPerIndentThreshold)
            continue;
        var indent = parseInt(i, 10);
        if (minimumIndent > indent)
            minimumIndent = indent;
    }
    if (minimumIndent === Infinity)
        return WebInspector.moduleSetting("textEditorIndent").get();
    return " ".repeat(minimumIndent);
}


WebInspector.CodeMirrorTextEditor.prototype = {
    /**
     * @param {string=} additionalWordChars
     * @return {!WebInspector.CodeMirrorDictionary}
     */
    createTextDictionary: function(additionalWordChars)
    {
        return new WebInspector.CodeMirrorDictionary(this._codeMirror, additionalWordChars);
    },

    _enableAutocompletionIfNeeded: function()
    {
        this._autocompleteController.setEnabled(WebInspector.moduleSetting("textEditorAutocompletion").get());
    },

    _onKeyHandled: function()
    {
        WebInspector.shortcutRegistry.dismissPendingShortcutAction();
    },

    _onAutoAppendedSpaces: function()
    {
        this._autoAppendedSpaces = this._autoAppendedSpaces || [];
        for (var i = 0; i < this._autoAppendedSpaces.length; ++i) {
            var position = this._autoAppendedSpaces[i].resolve();
            if (!position)
                continue;
            var line = this.line(position.lineNumber);
            if (line.length === position.columnNumber && WebInspector.TextUtils.lineIndent(line).length === line.length)
                this._codeMirror.replaceRange("", new CodeMirror.Pos(position.lineNumber, 0), new CodeMirror.Pos(position.lineNumber, position.columnNumber));
        }
        this._autoAppendedSpaces = [];
        var selections = this.selections();
        for (var i = 0; i < selections.length; ++i) {
            var selection = selections[i];
            this._autoAppendedSpaces.push(this.textEditorPositionHandle(selection.startLine, selection.startColumn));
        }
    },

    /**
     * @param {number} lineNumber
     * @param {number} lineLength
     * @param {number} charNumber
     * @return {{lineNumber: number, columnNumber: number}}
     */
    _normalizePositionForOverlappingColumn: function(lineNumber, lineLength, charNumber)
    {
        var linesCount = this._codeMirror.lineCount();
        var columnNumber = charNumber;
        if (charNumber < 0 && lineNumber > 0) {
            --lineNumber;
            columnNumber = this.line(lineNumber).length;
        } else if (charNumber >= lineLength && lineNumber < linesCount - 1) {
            ++lineNumber;
            columnNumber = 0;
        } else {
            columnNumber = Number.constrain(charNumber, 0, lineLength);
        }
        return {
            lineNumber: lineNumber,
            columnNumber: columnNumber
        };
    },

    /**
     * @param {number} lineNumber
     * @param {number} columnNumber
     * @param {number} direction
     * @return {{lineNumber: number, columnNumber: number}}
     */
    _camelCaseMoveFromPosition: function(lineNumber, columnNumber, direction)
    {
        /**
         * @param {number} charNumber
         * @param {number} length
         * @return {boolean}
         */
        function valid(charNumber, length)
        {
            return charNumber >= 0 && charNumber < length;
        }

        /**
         * @param {string} text
         * @param {number} charNumber
         * @return {boolean}
         */
        function isWordStart(text, charNumber)
        {
            var position = charNumber;
            var nextPosition = charNumber + 1;
            return valid(position, text.length) && valid(nextPosition, text.length)
                && WebInspector.TextUtils.isWordChar(text[position]) && WebInspector.TextUtils.isWordChar(text[nextPosition])
                && WebInspector.TextUtils.isUpperCase(text[position]) && WebInspector.TextUtils.isLowerCase(text[nextPosition]);
        }

        /**
         * @param {string} text
         * @param {number} charNumber
         * @return {boolean}
         */
        function isWordEnd(text, charNumber)
        {
            var position = charNumber;
            var prevPosition = charNumber - 1;
            return valid(position, text.length) && valid(prevPosition, text.length)
                && WebInspector.TextUtils.isWordChar(text[position]) && WebInspector.TextUtils.isWordChar(text[prevPosition])
                && WebInspector.TextUtils.isUpperCase(text[position]) && WebInspector.TextUtils.isLowerCase(text[prevPosition]);
        }

        /**
         * @param {number} lineNumber
         * @param {number} lineLength
         * @param {number} columnNumber
         * @return {{lineNumber: number, columnNumber: number}}
         */
        function constrainPosition(lineNumber, lineLength, columnNumber)
        {
            return {
                lineNumber: lineNumber,
                columnNumber: Number.constrain(columnNumber, 0, lineLength)
            };
        }

        var text = this.line(lineNumber);
        var length = text.length;

        if ((columnNumber === length && direction === 1)
            || (columnNumber === 0 && direction === -1))
            return this._normalizePositionForOverlappingColumn(lineNumber, length, columnNumber + direction);

        var charNumber = direction === 1 ? columnNumber : columnNumber - 1;

        // Move through initial spaces if any.
        while (valid(charNumber, length) && WebInspector.TextUtils.isSpaceChar(text[charNumber]))
            charNumber += direction;
        if (!valid(charNumber, length))
            return constrainPosition(lineNumber, length, charNumber);

        if (WebInspector.TextUtils.isStopChar(text[charNumber])) {
            while (valid(charNumber, length) && WebInspector.TextUtils.isStopChar(text[charNumber]))
                charNumber += direction;
            if (!valid(charNumber, length))
                return constrainPosition(lineNumber, length, charNumber);
            return {
                lineNumber: lineNumber,
                columnNumber: direction === -1 ? charNumber + 1 : charNumber
            };
        }

        charNumber += direction;
        while (valid(charNumber, length) && !isWordStart(text, charNumber) && !isWordEnd(text, charNumber) && WebInspector.TextUtils.isWordChar(text[charNumber]))
            charNumber += direction;

        if (!valid(charNumber, length))
            return constrainPosition(lineNumber, length, charNumber);
        if (isWordStart(text, charNumber) || isWordEnd(text, charNumber)) {
            return {
                lineNumber: lineNumber,
                columnNumber: charNumber
            };
        }

        return {
            lineNumber: lineNumber,
            columnNumber: direction === -1 ? charNumber + 1 : charNumber
        };
    },

    /**
     * @param {number} direction
     * @param {boolean} shift
     */
    _doCamelCaseMovement: function(direction, shift)
    {
        var selections = this.selections();
        for (var i = 0; i < selections.length; ++i) {
            var selection = selections[i];
            var move = this._camelCaseMoveFromPosition(selection.endLine, selection.endColumn, direction);
            selection.endLine = move.lineNumber;
            selection.endColumn = move.columnNumber;
            if (!shift)
                selections[i] = selection.collapseToEnd();
        }
        this.setSelections(selections);
    },

    dispose: function()
    {
        WebInspector.moduleSetting("textEditorIndent").removeChangeListener(this._onUpdateEditorIndentation, this);
        WebInspector.moduleSetting("textEditorAutoDetectIndent").removeChangeListener(this._onUpdateEditorIndentation, this);
        WebInspector.moduleSetting("showWhitespacesInEditor").removeChangeListener(this._updateCodeMirrorMode, this);
        WebInspector.moduleSetting("textEditorBracketMatching").removeChangeListener(this._enableBracketMatchingIfNeeded, this);
        WebInspector.moduleSetting("textEditorAutocompletion").removeChangeListener(this._enableAutocompletionIfNeeded, this);
    },

    _enableBracketMatchingIfNeeded: function()
    {
        this._codeMirror.setOption("autoCloseBrackets", WebInspector.moduleSetting("textEditorBracketMatching").get() ? { explode: false } : false);
    },

    /**
     * @override
     */
    wasShown: function()
    {
        if (this._wasOnceShown)
            return;
        this._wasOnceShown = true;
        this._codeMirror.refresh();
    },

    /**
     * @override
     */
    willHide: function()
    {
        delete this._editorSizeInSync;
    },

    _onUpdateEditorIndentation: function()
    {
        this._setEditorIndentation(WebInspector.CodeMirrorUtils.pullLines(this._codeMirror, WebInspector.CodeMirrorTextEditor.LinesToScanForIndentationGuessing));
    },

    /**
     * @param {!Array.<string>} lines
     */
    _setEditorIndentation: function(lines)
    {
        var extraKeys = {};
        var indent = WebInspector.moduleSetting("textEditorIndent").get();
        if (WebInspector.moduleSetting("textEditorAutoDetectIndent").get())
            indent = WebInspector.CodeMirrorTextEditor._guessIndentationLevel(lines);
        if (indent === WebInspector.TextUtils.Indent.TabCharacter) {
            this._codeMirror.setOption("indentWithTabs", true);
            this._codeMirror.setOption("indentUnit", 4);
        } else {
            this._codeMirror.setOption("indentWithTabs", false);
            this._codeMirror.setOption("indentUnit", indent.length);
            extraKeys.Tab = function(codeMirror)
            {
                if (codeMirror.somethingSelected())
                    return CodeMirror.Pass;
                var pos = codeMirror.getCursor("head");
                codeMirror.replaceRange(indent.substring(pos.ch % indent.length), codeMirror.getCursor());
            }
        }
        this._codeMirror.setOption("extraKeys", extraKeys);
        this._indentationLevel = indent;
    },

    /**
     * @return {string}
     */
    indent: function()
    {
        return this._indentationLevel;
    },

    /**
     * @return {boolean}
     */
    _isSearchActive: function()
    {
        return !!this._tokenHighlighter.highlightedRegex();
    },

    /**
     * @param {!RegExp} regex
     * @param {?WebInspector.TextRange} range
     */
    highlightSearchResults: function(regex, range)
    {
        /**
         * @this {WebInspector.CodeMirrorTextEditor}
         */
        function innerHighlightRegex()
        {
            if (range) {
                this._revealLine(range.startLine);
                if (range.endColumn > WebInspector.CodeMirrorTextEditor.maxHighlightLength)
                    this.setSelection(range);
                else
                    this.setSelection(WebInspector.TextRange.createFromLocation(range.startLine, range.startColumn));
            }
            this._tokenHighlighter.highlightSearchResults(regex, range);
        }
        if (!this._selectionBeforeSearch)
            this._selectionBeforeSearch = this.selection();
        this._codeMirror.operation(innerHighlightRegex.bind(this));
    },

    cancelSearchResultsHighlight: function()
    {
        this._codeMirror.operation(this._tokenHighlighter.highlightSelectedTokens.bind(this._tokenHighlighter));
        if (this._selectionBeforeSearch) {
            this._reportJump(this._selectionBeforeSearch, this.selection());
            delete this._selectionBeforeSearch;
        }
    },

    undo: function()
    {
        this._codeMirror.undo();
    },

    redo: function()
    {
        this._codeMirror.redo();
    },

    _setupWhitespaceHighlight: function()
    {
        var doc = this.element.ownerDocument;
        if (doc._codeMirrorWhitespaceStyleInjected || !WebInspector.moduleSetting("showWhitespacesInEditor").get())
            return;
        doc._codeMirrorWhitespaceStyleInjected = true;
        const classBase = ".show-whitespaces .CodeMirror .cm-whitespace-";
        const spaceChar = "·";
        var spaceChars = "";
        var rules = "";
        for (var i = 1; i <= WebInspector.CodeMirrorTextEditor.MaximumNumberOfWhitespacesPerSingleSpan; ++i) {
            spaceChars += spaceChar;
            var rule = classBase + i + "::before { content: '" + spaceChars + "';}\n";
            rules += rule;
        }
        var style = doc.createElement("style");
        style.textContent = rules;
        doc.head.appendChild(style);
    },

    _handleKeyDown: function(e)
    {
        if (this._autocompleteController.keyDown(e))
            e.consume(true);
    },

    _handlePostKeyDown: function(e)
    {
        if (e.defaultPrevented)
            e.consume(true);
    },

    /**
     * @param {!WebInspector.TextEditorAutocompleteDelegate} delegate
     */
    setAutocompleteDelegate: function(delegate)
    {
        this._autocompleteController.setDelegate(delegate);
    },

    /**
     * @param {number} lineNumber
     * @param {number} column
     * @return {?{x: number, y: number, height: number}}
     */
    cursorPositionToCoordinates: function(lineNumber, column)
    {
        if (lineNumber >= this._codeMirror.lineCount() || lineNumber < 0 || column < 0 || column > this._codeMirror.getLine(lineNumber).length)
            return null;

        var metrics = this._codeMirror.cursorCoords(new CodeMirror.Pos(lineNumber, column));

        return {
            x: metrics.left,
            y: metrics.top,
            height: metrics.bottom - metrics.top
        };
    },

    /**
     * @param {number} x
     * @param {number} y
     * @return {?WebInspector.TextRange}
     */
    coordinatesToCursorPosition: function(x, y)
    {
        var element = this.element.ownerDocument.elementFromPoint(x, y);
        if (!element || !element.isSelfOrDescendant(this._codeMirror.getWrapperElement()))
            return null;
        var gutterBox = this._codeMirror.getGutterElement().boxInWindow();
        if (x >= gutterBox.x && x <= gutterBox.x + gutterBox.width &&
            y >= gutterBox.y && y <= gutterBox.y + gutterBox.height)
            return null;
        var coords = this._codeMirror.coordsChar({left: x, top: y});
        return WebInspector.CodeMirrorUtils.toRange(coords, coords);
    },

    /**
     * @param {number} lineNumber
     * @param {number} column
     * @return {?{startColumn: number, endColumn: number, type: string}}
     */
    tokenAtTextPosition: function(lineNumber, column)
    {
        if (lineNumber < 0 || lineNumber >= this._codeMirror.lineCount())
            return null;
        var token = this._codeMirror.getTokenAt(new CodeMirror.Pos(lineNumber, (column || 0) + 1));
        if (!token)
            return null;
        return {
            startColumn: token.start,
            endColumn: token.end,
            type: token.type
        };
    },

    /**
     * @param {!WebInspector.TextRange} textRange
     * @return {string}
     */
    copyRange: function(textRange)
    {
        var pos = WebInspector.CodeMirrorUtils.toPos(textRange.normalize());
        return this._codeMirror.getRange(pos.start, pos.end);
    },

    /**
     * @return {boolean}
     */
    isClean: function()
    {
        return this._codeMirror.isClean();
    },

    markClean: function()
    {
        this._codeMirror.markClean();
    },

    _hasLongLines: function()
    {
        function lineIterator(lineHandle)
        {
            if (lineHandle.text.length > WebInspector.CodeMirrorTextEditor.LongLineModeLineLengthThreshold)
                hasLongLines = true;
            return hasLongLines;
        }
        var hasLongLines = false;
        this._codeMirror.eachLine(lineIterator);
        return hasLongLines;
    },

    /**
     * @param {string} mimeType
     * @return {string}
     */
    _allWhitespaceOverlayMode: function(mimeType)
    {
        var modeName = CodeMirror.mimeModes[mimeType] ? (CodeMirror.mimeModes[mimeType].name || CodeMirror.mimeModes[mimeType]) : CodeMirror.mimeModes["text/plain"];
        modeName += "+all-whitespaces";
        if (CodeMirror.modes[modeName])
            return modeName;

        function modeConstructor(config, parserConfig)
        {
            function nextToken(stream)
            {
                if (stream.peek() === " ") {
                    var spaces = 0;
                    while (spaces < WebInspector.CodeMirrorTextEditor.MaximumNumberOfWhitespacesPerSingleSpan && stream.peek() === " ") {
                        ++spaces;
                        stream.next();
                    }
                    return "whitespace whitespace-" + spaces;
                }
                while (!stream.eol() && stream.peek() !== " ")
                    stream.next();
                return null;
            }
            var whitespaceMode = {
                token: nextToken
            };
            return CodeMirror.overlayMode(CodeMirror.getMode(config, mimeType), whitespaceMode, false);
        }
        CodeMirror.defineMode(modeName, modeConstructor);
        return modeName;
    },

    /**
     * @param {string} mimeType
     * @return {string}
     */
    _trailingWhitespaceOverlayMode: function(mimeType)
    {
        var modeName = CodeMirror.mimeModes[mimeType] ? (CodeMirror.mimeModes[mimeType].name || CodeMirror.mimeModes[mimeType]) : CodeMirror.mimeModes["text/plain"];
        modeName += "+trailing-whitespaces";
        if (CodeMirror.modes[modeName])
            return modeName;

        function modeConstructor(config, parserConfig)
        {
            function nextToken(stream)
            {
                var pos = stream.pos;
                if (stream.match(/^\s+$/, true))
                    return true ? "trailing-whitespace" : null;
                do {
                    stream.next();
                } while (!stream.eol() && stream.peek() !== " ");
                return null;
            }
            var whitespaceMode = {
                token: nextToken
            };
            return CodeMirror.overlayMode(CodeMirror.getMode(config, mimeType), whitespaceMode, false);
        }
        CodeMirror.defineMode(modeName, modeConstructor);
        return modeName;
    },

    _enableLongLinesMode: function()
    {
        this._codeMirror.setOption("styleSelectedText", false);
    },

    _disableLongLinesMode: function()
    {
        this._codeMirror.setOption("styleSelectedText", true);
    },

    _updateCodeMirrorMode: function()
    {
        this._setupWhitespaceHighlight();
        var whitespaceMode = WebInspector.moduleSetting("showWhitespacesInEditor").get();
        this.element.classList.toggle("show-whitespaces", whitespaceMode === "all");
        var mimeType = this._mimeType;
        if (whitespaceMode === "all")
            mimeType = this._allWhitespaceOverlayMode(this._mimeType);
        else if (whitespaceMode === "trailing")
            mimeType = this._trailingWhitespaceOverlayMode(this._mimeType);
        this._codeMirror.setOption("mode", mimeType);
        WebInspector.CodeMirrorTextEditor._loadMimeTypeModes(this._mimeType, this._mimeTypeModesLoaded.bind(this));
    },

    _mimeTypeModesLoaded: function()
    {
        // Do not remove, this function is sniffed in tests.
        this._updateCodeMirrorMode();
    },

    /**
     * @param {string} mimeType
     */
    setMimeType: function(mimeType)
    {
        this._mimeType = mimeType;
        if (this._hasLongLines())
            this._enableLongLinesMode();
        else
            this._disableLongLinesMode();
        this._updateCodeMirrorMode();
    },

    /**
     * @param {boolean} readOnly
     */
    setReadOnly: function(readOnly)
    {
        this.element.classList.toggle("CodeMirror-readonly", readOnly);
        this._codeMirror.setOption("readOnly", readOnly);
    },

    /**
     * @return {boolean}
     */
    readOnly: function()
    {
        return !!this._codeMirror.getOption("readOnly");
    },

    /**
     * @param {!Object} highlightDescriptor
     */
    removeHighlight: function(highlightDescriptor)
    {
        highlightDescriptor.clear();
    },

    /**
     * @param {!WebInspector.TextRange} range
     * @param {string} cssClass
     * @return {!Object}
     */
    highlightRange: function(range, cssClass)
    {
        cssClass = "CodeMirror-persist-highlight " + cssClass;
        var pos = WebInspector.CodeMirrorUtils.toPos(range);
        ++pos.end.ch;
        return this._codeMirror.markText(pos.start, pos.end, {
            className: cssClass,
            startStyle: cssClass + "-start",
            endStyle: cssClass + "-end"
        });
    },

    /**
     * @override
     * @return {!Element}
     */
    defaultFocusedElement: function()
    {
        return this.element;
    },

    focus: function()
    {
        this._codeMirror.focus();
    },

    _handleElementFocus: function()
    {
        this._codeMirror.focus();
    },

    /**
     * @param {function()} operation
     */
    operation: function(operation)
    {
        this._codeMirror.operation(operation);
    },

    /**
     * @param {number} lineNumber
     */
    _revealLine: function(lineNumber)
    {
        this._innerRevealLine(lineNumber, this._codeMirror.getScrollInfo());
    },

    /**
     * @param {number} lineNumber
     * @param {!{left: number, top: number, width: number, height: number, clientWidth: number, clientHeight: number}} scrollInfo
     */
    _innerRevealLine: function(lineNumber, scrollInfo)
    {
        var topLine = this._codeMirror.lineAtHeight(scrollInfo.top, "local");
        var bottomLine = this._codeMirror.lineAtHeight(scrollInfo.top + scrollInfo.clientHeight, "local");
        var linesPerScreen = bottomLine - topLine + 1;
        if (lineNumber < topLine) {
            var topLineToReveal = Math.max(lineNumber - (linesPerScreen / 2) + 1, 0) | 0;
            this._codeMirror.scrollIntoView(new CodeMirror.Pos(topLineToReveal, 0));
        } else if (lineNumber > bottomLine) {
            var bottomLineToReveal = Math.min(lineNumber + (linesPerScreen / 2) - 1, this.linesCount - 1) | 0;
            this._codeMirror.scrollIntoView(new CodeMirror.Pos(bottomLineToReveal, 0));
        }
    },

    _gutterClick: function(instance, lineNumber, gutter, event)
    {
        this.dispatchEventToListeners(WebInspector.CodeMirrorTextEditor.Events.GutterClick, { lineNumber: lineNumber, event: event });
    },

    _contextMenu: function(event)
    {
        var contextMenu = new WebInspector.ContextMenu(event);
        var target = event.target.enclosingNodeOrSelfWithClass("CodeMirror-gutter-elt");
        if (target)
            this._delegate.populateLineGutterContextMenu(contextMenu, parseInt(target.textContent, 10) - 1);
        else {
            var textSelection = this.selection();
            this._delegate.populateTextAreaContextMenu(contextMenu, textSelection.startLine, textSelection.startColumn);
        }
        contextMenu.appendApplicableItems(this);
        contextMenu.show();
    },

    /**
     * @param {number} lineNumber
     * @param {boolean} disabled
     * @param {boolean} conditional
     */
    addBreakpoint: function(lineNumber, disabled, conditional)
    {
        if (lineNumber < 0 || lineNumber >= this._codeMirror.lineCount())
            return;
        var className = "cm-breakpoint" + (conditional ? " cm-breakpoint-conditional" : "") + (disabled ? " cm-breakpoint-disabled" : "");
        this._codeMirror.addLineClass(lineNumber, "wrap", className);
    },

    /**
     * @param {number} lineNumber
     */
    removeBreakpoint: function(lineNumber)
    {
        if (lineNumber < 0 || lineNumber >= this._codeMirror.lineCount())
            return;
        var wrapClasses = this._codeMirror.getLineHandle(lineNumber).wrapClass;
        if (!wrapClasses)
            return;
        var classes = wrapClasses.split(" ");
        for (var i = 0; i < classes.length; ++i) {
            if (classes[i].startsWith("cm-breakpoint"))
                this._codeMirror.removeLineClass(lineNumber, "wrap", classes[i]);
        }
    },

    /**
     * @param {number} lineNumber
     * @param {number} columnNumber
     */
    setExecutionLocation: function(lineNumber, columnNumber)
    {
        this.clearPositionHighlight();
        this._executionLine = this._codeMirror.getLineHandle(lineNumber);
        if (!this._executionLine)
            return;
        this._codeMirror.addLineClass(this._executionLine, "wrap", "cm-execution-line");
        this._executionLineTailMarker = this._codeMirror.markText({ line: lineNumber, ch: columnNumber }, { line: lineNumber, ch: this._codeMirror.getLine(lineNumber).length }, { className: "cm-execution-line-tail" });
    },

    clearExecutionLine: function()
    {
        this.clearPositionHighlight();
        if (this._executionLine)
            this._codeMirror.removeLineClass(this._executionLine, "wrap", "cm-execution-line");
        delete this._executionLine;

        if (this._executionLineTailMarker)
            this._executionLineTailMarker.clear();
        delete this._executionLineTailMarker;
    },

    /**
     * @param {number} lineNumber
     * @param {string} className
     * @param {boolean} toggled
     */
    toggleLineClass: function(lineNumber, className, toggled)
    {
        if (this.hasLineClass(lineNumber, className) === toggled)
            return;
        var lineHandle = this._codeMirror.getLineHandle(lineNumber);
        if (!lineHandle)
            return;
        if (toggled)
            this._codeMirror.addLineClass(lineHandle, "wrap", className);
        else
            this._codeMirror.removeLineClass(lineHandle, "wrap", className);
    },

    /**
     * @param {number} lineNumber
     * @param {string} className
     * @return {boolean}
     */
    hasLineClass: function(lineNumber, className)
    {
        var lineInfo = this._codeMirror.lineInfo(lineNumber);
        var wrapClass = lineInfo.wrapClass || "";
        var classNames = wrapClass.split(" ");
        return classNames.indexOf(className) !== -1;
    },

    /**
     * @param {number} lineNumber
     * @param {!Element} element
     */
    addDecoration: function(lineNumber, element)
    {
        var widget = this._codeMirror.addLineWidget(lineNumber, element);
        this._elementToWidget.set(element, widget);
    },

    /**
     * @param {number} lineNumber
     * @param {!Element} element
     */
    removeDecoration: function(lineNumber, element)
    {
        var widget = this._elementToWidget.remove(element);
        if (widget)
            this._codeMirror.removeLineWidget(widget);
    },

    /**
     * @param {number} lineNumber 0-based
     * @param {number=} columnNumber
     * @param {boolean=} shouldHighlight
     */
    revealPosition: function(lineNumber, columnNumber, shouldHighlight)
    {
        lineNumber = Number.constrain(lineNumber, 0, this._codeMirror.lineCount() - 1);
        if (typeof columnNumber !== "number")
            columnNumber = 0;
        columnNumber = Number.constrain(columnNumber, 0, this._codeMirror.getLine(lineNumber).length);

        this.clearPositionHighlight();
        this._highlightedLine = this._codeMirror.getLineHandle(lineNumber);
        if (!this._highlightedLine)
          return;
        this._revealLine(lineNumber);
        if (shouldHighlight) {
            this._codeMirror.addLineClass(this._highlightedLine, null, "cm-highlight");
            this._clearHighlightTimeout = setTimeout(this.clearPositionHighlight.bind(this), 2000);
        }
        this.setSelection(WebInspector.TextRange.createFromLocation(lineNumber, columnNumber));
    },

    clearPositionHighlight: function()
    {
        if (this._clearHighlightTimeout)
            clearTimeout(this._clearHighlightTimeout);
        delete this._clearHighlightTimeout;

        if (this._highlightedLine)
            this._codeMirror.removeLineClass(this._highlightedLine, null, "cm-highlight");
        delete this._highlightedLine;
    },

    /**
     * @override
     * @return {!Array.<!Element>}
     */
    elementsToRestoreScrollPositionsFor: function()
    {
        return [];
    },

    /**
     * @param {number} width
     * @param {number} height
     */
    _updatePaddingBottom: function(width, height)
    {
        var scrollInfo = this._codeMirror.getScrollInfo();
        var newPaddingBottom;
        var linesElement = this._codeMirrorElement.querySelector(".CodeMirror-lines");
        var lineCount = this._codeMirror.lineCount();
        if (lineCount <= 1)
            newPaddingBottom = 0;
        else
            newPaddingBottom = Math.max(scrollInfo.clientHeight - this._codeMirror.getLineHandle(this._codeMirror.lastLine()).height, 0);
        newPaddingBottom += "px";
        linesElement.style.paddingBottom = newPaddingBottom;
        this._codeMirror.setSize(width, height);
    },

    _resizeEditor: function()
    {
        var parentElement = this.element.parentElement;
        if (!parentElement || !this.isShowing())
            return;
        var scrollLeft = this._codeMirror.doc.scrollLeft;
        var scrollTop = this._codeMirror.doc.scrollTop;
        var width = parentElement.offsetWidth;
        var height = parentElement.offsetHeight - this.element.offsetTop;
        this._codeMirror.setSize(width, height);
        this._updatePaddingBottom(width, height);
        this._codeMirror.scrollTo(scrollLeft, scrollTop);
    },

    /**
     * @override
     */
    onResize: function()
    {
        this._autocompleteController.finishAutocomplete();
        this._resizeEditor();
        this._editorSizeInSync = true;
        if (this._selectionSetScheduled) {
            delete this._selectionSetScheduled;
            this.setSelection(this._lastSelection);
        }
    },

    /**
     * @param {!WebInspector.TextRange} range
     * @param {string} text
     * @return {!WebInspector.TextRange}
     */
    editRange: function(range, text)
    {
        var pos = WebInspector.CodeMirrorUtils.toPos(range);
        this._codeMirror.replaceRange(text, pos.start, pos.end);
        var newRange = WebInspector.CodeMirrorUtils.toRange(pos.start, this._codeMirror.posFromIndex(this._codeMirror.indexFromPos(pos.start) + text.length));
        this._delegate.onTextChanged(range, newRange);
        if (WebInspector.moduleSetting("textEditorAutoDetectIndent").get())
            this._onUpdateEditorIndentation();
        return newRange;
    },

    /**
     * @param {number} lineNumber
     * @param {number} column
     * @param {function(string):boolean} isWordChar
     * @return {!WebInspector.TextRange}
     */
    wordRangeForCursorPosition: function(lineNumber, column, isWordChar)
    {
        var line = this.line(lineNumber);
        var wordStart = column;
        if (column !== 0 && isWordChar(line.charAt(column - 1))) {
            wordStart = column - 1;
            while (wordStart > 0 && isWordChar(line.charAt(wordStart - 1)))
                --wordStart;
        }
        var wordEnd = column;
        while (wordEnd < line.length && isWordChar(line.charAt(wordEnd)))
            ++wordEnd;
        return new WebInspector.TextRange(lineNumber, wordStart, lineNumber, wordEnd);
    },

    /**
     * @param {!CodeMirror} codeMirror
     * @param {!Array.<!CodeMirror.ChangeObject>} changes
     */
    _changes: function(codeMirror, changes)
    {
        if (!changes.length)
            return;
        // We do not show "scroll beyond end of file" span for one line documents, so we need to check if "document has one line" changed.
        var hasOneLine = this._codeMirror.lineCount() === 1;
        if (hasOneLine !== this._hasOneLine)
            this._resizeEditor();
        this._hasOneLine = hasOneLine;
        var widgets = this._elementToWidget.valuesArray();
        for (var i = 0; i < widgets.length; ++i)
            this._codeMirror.removeLineWidget(widgets[i]);
        this._elementToWidget.clear();

        for (var changeIndex = 0; changeIndex < changes.length; ++changeIndex) {
            var changeObject = changes[changeIndex];

            var editInfo = WebInspector.CodeMirrorUtils.changeObjectToEditOperation(changeObject);
            if (!this._muteTextChangedEvent)
                this._delegate.onTextChanged(editInfo.oldRange, editInfo.newRange);
        }
    },

    _cursorActivity: function()
    {
        var start = this._codeMirror.getCursor("anchor");
        var end = this._codeMirror.getCursor("head");
        this._delegate.selectionChanged(WebInspector.CodeMirrorUtils.toRange(start, end));
        if (!this._isSearchActive())
            this._codeMirror.operation(this._tokenHighlighter.highlightSelectedTokens.bind(this._tokenHighlighter));
    },

    /**
     * @param {!CodeMirror} codeMirror
     * @param {{ranges: !Array.<{head: !CodeMirror.Pos, anchor: !CodeMirror.Pos}>}} selection
     */
    _beforeSelectionChange: function(codeMirror, selection)
    {
        this._selectNextOccurrenceController.selectionWillChange();
        if (!this._isHandlingMouseDownEvent)
            return;
        if (!selection.ranges.length)
            return;
        var primarySelection = selection.ranges[0];
        this._reportJump(this.selection(), WebInspector.CodeMirrorUtils.toRange(primarySelection.anchor, primarySelection.head));
    },

    /**
     * @param {?WebInspector.TextRange} from
     * @param {?WebInspector.TextRange} to
     */
    _reportJump: function(from, to)
    {
        if (from && to && from.equal(to))
            return;
        this._delegate.onJumpToPosition(from, to);
    },

    _scroll: function()
    {
        if (this._scrollTimer)
            clearTimeout(this._scrollTimer);
        var topmostLineNumber = this._codeMirror.lineAtHeight(this._codeMirror.getScrollInfo().top, "local");
        this._scrollTimer = setTimeout(this._delegate.scrollChanged.bind(this._delegate, topmostLineNumber), 100);
    },

    _focus: function()
    {
        this._delegate.editorFocused();
    },

    /**
     * @param {number} lineNumber
     */
    scrollToLine: function(lineNumber)
    {
        var pos = new CodeMirror.Pos(lineNumber, 0);
        var coords = this._codeMirror.charCoords(pos, "local");
        this._codeMirror.scrollTo(0, coords.top);
    },

    /**
     * @return {number}
     */
    firstVisibleLine: function()
    {
        return this._codeMirror.lineAtHeight(this._codeMirror.getScrollInfo().top, "local");
    },

    /**
     * @return {number}
     */
    lastVisibleLine: function()
    {
        var scrollInfo = this._codeMirror.getScrollInfo();
        return this._codeMirror.lineAtHeight(scrollInfo.top + scrollInfo.clientHeight, "local");
    },

    /**
     * @return {!WebInspector.TextRange}
     */
    selection: function()
    {
        var start = this._codeMirror.getCursor("anchor");
        var end = this._codeMirror.getCursor("head");

        return WebInspector.CodeMirrorUtils.toRange(start, end);
    },

    /**
     * @return {!Array.<!WebInspector.TextRange>}
     */
    selections: function()
    {
        var selectionList = this._codeMirror.listSelections();
        var result = [];
        for (var i = 0; i < selectionList.length; ++i) {
            var selection = selectionList[i];
            result.push(WebInspector.CodeMirrorUtils.toRange(selection.anchor, selection.head));
        }
        return result;
    },

    /**
     * @return {?WebInspector.TextRange}
     */
    lastSelection: function()
    {
        return this._lastSelection;
    },

    /**
     * @param {!WebInspector.TextRange} textRange
     */
    setSelection: function(textRange)
    {
        this._lastSelection = textRange;
        if (!this._editorSizeInSync) {
            this._selectionSetScheduled = true;
            return;
        }
        var pos = WebInspector.CodeMirrorUtils.toPos(textRange);
        this._codeMirror.setSelection(pos.start, pos.end);
    },

    /**
     * @param {!Array.<!WebInspector.TextRange>} ranges
     * @param {number=} primarySelectionIndex
     */
    setSelections: function(ranges, primarySelectionIndex)
    {
        var selections = [];
        for (var i = 0; i < ranges.length; ++i) {
            var selection = WebInspector.CodeMirrorUtils.toPos(ranges[i]);
            selections.push({
                anchor: selection.start,
                head: selection.end
            });
        }
        primarySelectionIndex = primarySelectionIndex || 0;
        this._codeMirror.setSelections(selections, primarySelectionIndex, { scroll: false });
    },

    /**
     * @param {string} text
     */
    _detectLineSeparator: function(text)
    {
        this._lineSeparator = text.indexOf("\r\n") >= 0 ? "\r\n" : "\n";
    },

    /**
     * @param {string} text
     */
    setText: function(text)
    {
        this._muteTextChangedEvent = true;
        if (text.length > WebInspector.CodeMirrorTextEditor.MaxEditableTextSize) {
            this._autocompleteController.setEnabled(false);
            this.setReadOnly(true);
        }

        this._setEditorIndentation(text.split("\n").slice(0, WebInspector.CodeMirrorTextEditor.LinesToScanForIndentationGuessing));
        this._codeMirror.setValue(text);
        if (this._shouldClearHistory) {
            this._codeMirror.clearHistory();
            this._shouldClearHistory = false;
        }
        this._detectLineSeparator(text);
        delete this._muteTextChangedEvent;
    },

    /**
     * @return {string}
     */
    text: function()
    {
        return this._codeMirror.getValue().replace(/\n/g, this._lineSeparator);
    },

    /**
     * @return {!WebInspector.TextRange}
     */
    range: function()
    {
        var lineCount = this.linesCount;
        var lastLine = this._codeMirror.getLine(lineCount - 1);
        return WebInspector.CodeMirrorUtils.toRange(new CodeMirror.Pos(0, 0), new CodeMirror.Pos(lineCount - 1, lastLine.length));
    },

    /**
     * @param {number} lineNumber
     * @return {string}
     */
    line: function(lineNumber)
    {
        return this._codeMirror.getLine(lineNumber);
    },

    /**
     * @return {number}
     */
    get linesCount()
    {
        return this._codeMirror.lineCount();
    },

    /**
     * @param {number} line
     * @param {string} name
     * @param {?Object} value
     */
    setAttribute: function(line, name, value)
    {
        if (line < 0 || line >= this._codeMirror.lineCount())
            return;
        var handle = this._codeMirror.getLineHandle(line);
        if (handle.attributes === undefined) handle.attributes = {};
        handle.attributes[name] = value;
    },

    /**
     * @param {number} line
     * @param {string} name
     * @return {?Object} value
     */
    getAttribute: function(line, name)
    {
        if (line < 0 || line >= this._codeMirror.lineCount())
            return null;
        var handle = this._codeMirror.getLineHandle(line);
        return handle.attributes && handle.attributes[name] !== undefined ? handle.attributes[name] : null;
    },

    /**
     * @param {number} line
     * @param {string} name
     */
    removeAttribute: function(line, name)
    {
        if (line < 0 || line >= this._codeMirror.lineCount())
            return;
        var handle = this._codeMirror.getLineHandle(line);
        if (handle && handle.attributes)
            delete handle.attributes[name];
    },

    /**
     * @param {number} lineNumber
     * @param {number} columnNumber
     * @return {!WebInspector.TextEditorPositionHandle}
     */
    textEditorPositionHandle: function(lineNumber, columnNumber)
    {
        return new WebInspector.CodeMirrorPositionHandle(this._codeMirror, new CodeMirror.Pos(lineNumber, columnNumber));
    },

    __proto__: WebInspector.VBox.prototype
}

/**
 * @constructor
 * @implements {WebInspector.TextEditorPositionHandle}
 * @param {!CodeMirror} codeMirror
 * @param {!CodeMirror.Pos} pos
 */
WebInspector.CodeMirrorPositionHandle = function(codeMirror, pos)
{
    this._codeMirror = codeMirror;
    this._lineHandle = codeMirror.getLineHandle(pos.line);
    this._columnNumber = pos.ch;
}

WebInspector.CodeMirrorPositionHandle.prototype = {
    /**
     * @override
     * @return {?{lineNumber: number, columnNumber: number}}
     */
    resolve: function()
    {
        var lineNumber = this._codeMirror.getLineNumber(this._lineHandle);
        if (typeof lineNumber !== "number")
            return null;
        return {
            lineNumber: lineNumber,
            columnNumber: this._columnNumber
        };
    },

    /**
     * @override
     * @param {!WebInspector.TextEditorPositionHandle} positionHandle
     * @return {boolean}
     */
    equal: function(positionHandle)
    {
        return positionHandle._lineHandle === this._lineHandle && positionHandle._columnNumber == this._columnNumber && positionHandle._codeMirror === this._codeMirror;
    }
}

/**
 * @constructor
 * @param {!WebInspector.CodeMirrorTextEditor} textEditor
 * @param {!CodeMirror} codeMirror
 */
WebInspector.CodeMirrorTextEditor.TokenHighlighter = function(textEditor, codeMirror)
{
    this._textEditor = textEditor;
    this._codeMirror = codeMirror;
}

WebInspector.CodeMirrorTextEditor.TokenHighlighter.prototype = {
    /**
     * @param {!RegExp} regex
     * @param {?WebInspector.TextRange} range
     */
    highlightSearchResults: function(regex, range)
    {
        var oldRegex = this._highlightRegex;
        this._highlightRegex = regex;
        this._highlightRange = range;
        if (this._searchResultMarker) {
            this._searchResultMarker.clear();
            delete this._searchResultMarker;
        }
        if (this._highlightDescriptor && this._highlightDescriptor.selectionStart)
            this._codeMirror.removeLineClass(this._highlightDescriptor.selectionStart.line, "wrap", "cm-line-with-selection");
        var selectionStart = this._highlightRange ? new CodeMirror.Pos(this._highlightRange.startLine, this._highlightRange.startColumn) : null;
        if (selectionStart)
            this._codeMirror.addLineClass(selectionStart.line, "wrap", "cm-line-with-selection");
        if (this._highlightRegex === oldRegex) {
            // Do not re-add overlay mode if regex did not change for better performance.
            if (this._highlightDescriptor)
                this._highlightDescriptor.selectionStart = selectionStart;
        } else {
            this._removeHighlight();
            this._setHighlighter(this._searchHighlighter.bind(this, this._highlightRegex), selectionStart);
        }
        if (this._highlightRange) {
            var pos = WebInspector.CodeMirrorUtils.toPos(this._highlightRange);
            this._searchResultMarker = this._codeMirror.markText(pos.start, pos.end, {className: "cm-column-with-selection"});
        }
    },

    /**
     * @return {!RegExp|undefined}
     */
    highlightedRegex: function()
    {
        return this._highlightRegex;
    },

    highlightSelectedTokens: function()
    {
        delete this._highlightRegex;
        delete this._highlightRange;

        if (this._highlightDescriptor && this._highlightDescriptor.selectionStart)
            this._codeMirror.removeLineClass(this._highlightDescriptor.selectionStart.line, "wrap", "cm-line-with-selection");
        this._removeHighlight();
        var selectionStart = this._codeMirror.getCursor("start");
        var selectionEnd = this._codeMirror.getCursor("end");
        if (selectionStart.line !== selectionEnd.line)
            return;
        if (selectionStart.ch === selectionEnd.ch)
            return;

        var selections = this._codeMirror.getSelections();
        if (selections.length > 1)
            return;
        var selectedText = selections[0];
        if (this._isWord(selectedText, selectionStart.line, selectionStart.ch, selectionEnd.ch)) {
            if (selectionStart)
                this._codeMirror.addLineClass(selectionStart.line, "wrap", "cm-line-with-selection");
            this._setHighlighter(this._tokenHighlighter.bind(this, selectedText, selectionStart), selectionStart);
        }
    },

    /**
     * @param {string} selectedText
     * @param {number} lineNumber
     * @param {number} startColumn
     * @param {number} endColumn
     */
    _isWord: function(selectedText, lineNumber, startColumn, endColumn)
    {
        var line = this._codeMirror.getLine(lineNumber);
        var leftBound = startColumn === 0 || !WebInspector.TextUtils.isWordChar(line.charAt(startColumn - 1));
        var rightBound = endColumn === line.length || !WebInspector.TextUtils.isWordChar(line.charAt(endColumn));
        return leftBound && rightBound && WebInspector.TextUtils.isWord(selectedText);
    },

    _removeHighlight: function()
    {
        if (this._highlightDescriptor) {
            this._codeMirror.removeOverlay(this._highlightDescriptor.overlay);
            delete this._highlightDescriptor;
        }
    },

    /**
     * @param {!RegExp} regex
     * @param {!CodeMirror.StringStream} stream
     */
    _searchHighlighter: function(regex, stream)
    {
        if (stream.column() === 0)
            delete this._searchMatchLength;
        if (this._searchMatchLength) {
            if (this._searchMatchLength > 2) {
                for (var i = 0; i < this._searchMatchLength - 2; ++i)
                    stream.next();
                this._searchMatchLength = 1;
                return "search-highlight";
            } else {
                stream.next();
                delete this._searchMatchLength;
                return "search-highlight search-highlight-end";
            }
        }
        var match = stream.match(regex, false);
        if (match) {
            stream.next();
            var matchLength = match[0].length;
            if (matchLength === 1)
                return "search-highlight search-highlight-full";
            this._searchMatchLength = matchLength;
            return "search-highlight search-highlight-start";
        }

        while (!stream.match(regex, false) && stream.next()) {}
    },

    /**
     * @param {string} token
     * @param {!CodeMirror.Pos} selectionStart
     * @param {!CodeMirror.StringStream} stream
     */
    _tokenHighlighter: function(token, selectionStart, stream)
    {
        var tokenFirstChar = token.charAt(0);
        if (stream.match(token) && (stream.eol() || !WebInspector.TextUtils.isWordChar(stream.peek())))
            return stream.column() === selectionStart.ch ? "token-highlight column-with-selection" : "token-highlight";

        var eatenChar;
        do {
            eatenChar = stream.next();
        } while (eatenChar && (WebInspector.TextUtils.isWordChar(eatenChar) || stream.peek() !== tokenFirstChar));
    },

    /**
     * @param {function(!CodeMirror.StringStream)} highlighter
     * @param {?CodeMirror.Pos} selectionStart
     */
    _setHighlighter: function(highlighter, selectionStart)
    {
        var overlayMode = {
            token: highlighter
        };
        this._codeMirror.addOverlay(overlayMode);
        this._highlightDescriptor = {
            overlay: overlayMode,
            selectionStart: selectionStart
        };
    }
}

/**
 * @constructor
 * @param {!CodeMirror} codeMirror
 */
WebInspector.CodeMirrorTextEditor.BlockIndentController = function(codeMirror)
{
    codeMirror.addKeyMap(this);
}

WebInspector.CodeMirrorTextEditor.BlockIndentController.prototype = {
    name: "blockIndentKeymap",

    /**
     * @return {*}
     */
    Enter: function(codeMirror)
    {
        var selections = codeMirror.listSelections();
        var replacements = [];
        var allSelectionsAreCollapsedBlocks = false;
        for (var i = 0; i < selections.length; ++i) {
            var selection = selections[i];
            var start = CodeMirror.cmpPos(selection.head, selection.anchor) < 0 ? selection.head : selection.anchor;
            var line = codeMirror.getLine(start.line);
            var indent = WebInspector.TextUtils.lineIndent(line);
            var indentToInsert = "\n" + indent + codeMirror._codeMirrorTextEditor.indent();
            var isCollapsedBlock = false;
            if (selection.head.ch === 0)
                return CodeMirror.Pass;
            if (line.substr(selection.head.ch - 1, 2) === "{}") {
                indentToInsert += "\n" + indent;
                isCollapsedBlock = true;
            } else if (line.substr(selection.head.ch - 1, 1) !== "{") {
                return CodeMirror.Pass;
            }
            if (i > 0 && allSelectionsAreCollapsedBlocks !== isCollapsedBlock)
                return CodeMirror.Pass;
            replacements.push(indentToInsert);
            allSelectionsAreCollapsedBlocks = isCollapsedBlock;
        }
        codeMirror.replaceSelections(replacements);
        if (!allSelectionsAreCollapsedBlocks) {
            codeMirror._codeMirrorTextEditor._onAutoAppendedSpaces();
            return;
        }
        selections = codeMirror.listSelections();
        var updatedSelections = [];
        for (var i = 0; i < selections.length; ++i) {
            var selection = selections[i];
            var line = codeMirror.getLine(selection.head.line - 1);
            var position = new CodeMirror.Pos(selection.head.line - 1, line.length);
            updatedSelections.push({
                head: position,
                anchor: position
            });
        }
        codeMirror.setSelections(updatedSelections);
        codeMirror._codeMirrorTextEditor._onAutoAppendedSpaces();
    },

    /**
     * @return {*}
     */
    "'}'": function(codeMirror)
    {
        if (codeMirror.somethingSelected())
            return CodeMirror.Pass;

        var selections = codeMirror.listSelections();
        var replacements = [];
        for (var i = 0; i < selections.length; ++i) {
            var selection = selections[i];
            var line = codeMirror.getLine(selection.head.line);
            if (line !== WebInspector.TextUtils.lineIndent(line))
                return CodeMirror.Pass;
            replacements.push("}");
        }

        codeMirror.replaceSelections(replacements);
        selections = codeMirror.listSelections();
        replacements = [];
        var updatedSelections = [];
        for (var i = 0; i < selections.length; ++i) {
            var selection = selections[i];
            var matchingBracket = codeMirror.findMatchingBracket(selection.head);
            if (!matchingBracket || !matchingBracket.match)
                return;
            updatedSelections.push({
                head: selection.head,
                anchor: new CodeMirror.Pos(selection.head.line, 0)
            });
            var line = codeMirror.getLine(matchingBracket.to.line);
            var indent = WebInspector.TextUtils.lineIndent(line);
            replacements.push(indent + "}");
        }
        codeMirror.setSelections(updatedSelections);
        codeMirror.replaceSelections(replacements);
    }
}

/**
 * @constructor
 * @param {!CodeMirror} codeMirror
 */
WebInspector.CodeMirrorTextEditor.FixWordMovement = function(codeMirror)
{
    function moveLeft(shift, codeMirror)
    {
        codeMirror.setExtending(shift);
        var cursor = codeMirror.getCursor("head");
        codeMirror.execCommand("goGroupLeft");
        var newCursor = codeMirror.getCursor("head");
        if (newCursor.ch === 0 && newCursor.line !== 0) {
            codeMirror.setExtending(false);
            return;
        }

        var skippedText = codeMirror.getRange(newCursor, cursor, "#");
        if (/^\s+$/.test(skippedText))
            codeMirror.execCommand("goGroupLeft");
        codeMirror.setExtending(false);
    }

    function moveRight(shift, codeMirror)
    {
        codeMirror.setExtending(shift);
        var cursor = codeMirror.getCursor("head");
        codeMirror.execCommand("goGroupRight");
        var newCursor = codeMirror.getCursor("head");
        if (newCursor.ch === 0 && newCursor.line !== 0) {
            codeMirror.setExtending(false);
            return;
        }

        var skippedText = codeMirror.getRange(cursor, newCursor, "#");
        if (/^\s+$/.test(skippedText))
            codeMirror.execCommand("goGroupRight");
        codeMirror.setExtending(false);
    }

    var modifierKey = WebInspector.isMac() ? "Alt" : "Ctrl";
    var leftKey = modifierKey + "-Left";
    var rightKey = modifierKey + "-Right";
    var keyMap = {};
    keyMap[leftKey] = moveLeft.bind(null, false);
    keyMap[rightKey] = moveRight.bind(null, false);
    keyMap["Shift-" + leftKey] = moveLeft.bind(null, true);
    keyMap["Shift-" + rightKey] = moveRight.bind(null, true);
    codeMirror.addKeyMap(keyMap);
}

/**
 * @constructor
 * @param {!WebInspector.CodeMirrorTextEditor} textEditor
 * @param {!CodeMirror} codeMirror
 */
WebInspector.CodeMirrorTextEditor.SelectNextOccurrenceController = function(textEditor, codeMirror)
{
    this._textEditor = textEditor;
    this._codeMirror = codeMirror;
}

WebInspector.CodeMirrorTextEditor.SelectNextOccurrenceController.prototype = {
    selectionWillChange: function()
    {
        if (!this._muteSelectionListener)
            delete this._fullWordSelection;
    },

    /**
     * @param {!Array.<!WebInspector.TextRange>} selections
     * @param {!WebInspector.TextRange} range
     * @return {boolean}
     */
    _findRange: function(selections, range)
    {
        for (var i = 0; i < selections.length; ++i) {
            if (range.equal(selections[i]))
                return true;
        }
        return false;
    },

    undoLastSelection: function()
    {
        this._muteSelectionListener = true;
        this._codeMirror.execCommand("undoSelection");
        this._muteSelectionListener = false;
    },

    selectNextOccurrence: function()
    {
        var selections = this._textEditor.selections();
        var anyEmptySelection = false;
        for (var i = 0; i < selections.length; ++i) {
            var selection = selections[i];
            anyEmptySelection = anyEmptySelection || selection.isEmpty();
            if (selection.startLine !== selection.endLine)
                return;
        }
        if (anyEmptySelection) {
            this._expandSelectionsToWords(selections);
            return;
        }

        var last = selections[selections.length - 1];
        var next = last;
        do {
            next = this._findNextOccurrence(next, !!this._fullWordSelection);
        } while (next && this._findRange(selections, next) && !next.equal(last));

        if (!next)
            return;
        selections.push(next);

        this._muteSelectionListener = true;
        this._textEditor.setSelections(selections, selections.length - 1);
        delete this._muteSelectionListener;

        this._textEditor._revealLine(next.startLine);
    },

    /**
     * @param {!Array.<!WebInspector.TextRange>} selections
     */
    _expandSelectionsToWords: function(selections)
    {
        var newSelections = [];
        for (var i = 0; i < selections.length; ++i) {
            var selection = selections[i];
            var startRangeWord = this._textEditor.wordRangeForCursorPosition(selection.startLine, selection.startColumn, WebInspector.TextUtils.isWordChar)
                || WebInspector.TextRange.createFromLocation(selection.startLine, selection.startColumn);
            var endRangeWord = this._textEditor.wordRangeForCursorPosition(selection.endLine, selection.endColumn, WebInspector.TextUtils.isWordChar)
                || WebInspector.TextRange.createFromLocation(selection.endLine, selection.endColumn);
            var newSelection = new WebInspector.TextRange(startRangeWord.startLine, startRangeWord.startColumn, endRangeWord.endLine, endRangeWord.endColumn);
            newSelections.push(newSelection);
        }
        this._textEditor.setSelections(newSelections, newSelections.length - 1);
        this._fullWordSelection = true;
    },

    /**
     * @param {!WebInspector.TextRange} range
     * @param {boolean} fullWord
     * @return {?WebInspector.TextRange}
     */
    _findNextOccurrence: function(range, fullWord)
    {
        range = range.normalize();
        var matchedLineNumber;
        var matchedColumnNumber;
        var textToFind = this._textEditor.copyRange(range);
        function findWordInLine(wordRegex, lineNumber, lineText, from, to)
        {
            if (typeof matchedLineNumber === "number")
                return true;
            wordRegex.lastIndex = from;
            var result = wordRegex.exec(lineText);
            if (!result || result.index + textToFind.length > to)
                return false;
            matchedLineNumber = lineNumber;
            matchedColumnNumber = result.index;
            return true;
        }

        var iteratedLineNumber;
        function lineIterator(regex, lineHandle)
        {
            if (findWordInLine(regex, iteratedLineNumber++, lineHandle.text, 0, lineHandle.text.length))
                return true;
        }

        var regexSource = textToFind.escapeForRegExp();
        if (fullWord)
            regexSource = "\\b" + regexSource + "\\b";
        var wordRegex = new RegExp(regexSource, "g");
        var currentLineText = this._codeMirror.getLine(range.startLine);

        findWordInLine(wordRegex, range.startLine, currentLineText, range.endColumn, currentLineText.length);
        iteratedLineNumber = range.startLine + 1;
        this._codeMirror.eachLine(range.startLine + 1, this._codeMirror.lineCount(), lineIterator.bind(null, wordRegex));
        iteratedLineNumber = 0;
        this._codeMirror.eachLine(0, range.startLine, lineIterator.bind(null, wordRegex));
        findWordInLine(wordRegex, range.startLine, currentLineText, 0, range.startColumn);

        if (typeof matchedLineNumber !== "number")
            return null;
        return new WebInspector.TextRange(matchedLineNumber, matchedColumnNumber, matchedLineNumber, matchedColumnNumber + textToFind.length);
    }
}

/**
 * @param {string} modeName
 * @param {string} tokenPrefix
 */
WebInspector.CodeMirrorTextEditor._overrideModeWithPrefixedTokens = function(modeName, tokenPrefix)
{
    var oldModeName = modeName + "-old";
    if (CodeMirror.modes[oldModeName])
        return;

    CodeMirror.defineMode(oldModeName, CodeMirror.modes[modeName]);
    CodeMirror.defineMode(modeName, modeConstructor);

    function modeConstructor(config, parserConfig)
    {
        var innerConfig = {};
        for (var i in parserConfig)
            innerConfig[i] = parserConfig[i];
        innerConfig.name = oldModeName;
        var codeMirrorMode = CodeMirror.getMode(config, innerConfig);
        codeMirrorMode.name = modeName;
        codeMirrorMode.token = tokenOverride.bind(null, codeMirrorMode.token);
        return codeMirrorMode;
    }

    function tokenOverride(superToken, stream, state)
    {
        var token = superToken(stream, state);
        return token ? tokenPrefix + token.split(/ +/).join(" " + tokenPrefix) : token;
    }
}

/**
 * @interface
 */
WebInspector.TextEditorPositionHandle = function() {}

WebInspector.TextEditorPositionHandle.prototype = {
    /**
     * @return {?{lineNumber: number, columnNumber: number}}
     */
    resolve: function() { },

    /**
     * @param {!WebInspector.TextEditorPositionHandle} positionHandle
     * @return {boolean}
     */
    equal: function(positionHandle) { }
}

/**
 * @interface
 */
WebInspector.TextEditorDelegate = function() {}

WebInspector.TextEditorDelegate.prototype = {
    /**
     * @param {!WebInspector.TextRange} oldRange
     * @param {!WebInspector.TextRange} newRange
     */
    onTextChanged: function(oldRange, newRange) { },

    /**
     * @param {!WebInspector.TextRange} textRange
     */
    selectionChanged: function(textRange) { },

    /**
     * @param {number} lineNumber
     */
    scrollChanged: function(lineNumber) { },

    editorFocused: function() { },

    /**
     * @param {!WebInspector.ContextMenu} contextMenu
     * @param {number} lineNumber
     */
    populateLineGutterContextMenu: function(contextMenu, lineNumber) { },

    /**
     * @param {!WebInspector.ContextMenu} contextMenu
     * @param {number} lineNumber
     * @param {number} columnNumber
     */
    populateTextAreaContextMenu: function(contextMenu, lineNumber, columnNumber) { },

    /**
     * @param {?WebInspector.TextRange} from
     * @param {?WebInspector.TextRange} to
     */
    onJumpToPosition: function(from, to) { }
}

WebInspector.CodeMirrorTextEditor._overrideModeWithPrefixedTokens("css", "css-");
WebInspector.CodeMirrorTextEditor._overrideModeWithPrefixedTokens("javascript", "js-");
WebInspector.CodeMirrorTextEditor._overrideModeWithPrefixedTokens("xml", "xml-");

/** @typedef {{lineNumber: number, event: !Event}} */
WebInspector.CodeMirrorTextEditor.GutterClickEventData;

/** @enum {string} */
WebInspector.CodeMirrorTextEditor.Events = {
    GutterClick: "GutterClick"
}

/** @type {!Set<!Runtime.Extension>} */
WebInspector.CodeMirrorTextEditor._loadedMimeModeExtensions = new Set();

/**
 * @param {string} mimeType
 * @param {function()} callback
 */
WebInspector.CodeMirrorTextEditor._loadMimeTypeModes = function(mimeType, callback)
{
    var installed = WebInspector.CodeMirrorTextEditor._loadedMimeModeExtensions;

    var nameToExtension = new Map();
    var extensions = self.runtime.extensions(WebInspector.CodeMirrorMimeMode);
    for (var extension of extensions)
        nameToExtension.set(extension.descriptor()["fileName"], extension);

    var modesToLoad = new Set();
    for (var extension of extensions) {
        var descriptor = extension.descriptor();
        if (installed.has(extension) || descriptor["mimeTypes"].indexOf(mimeType) === -1)
            continue;

        modesToLoad.add(extension);
        var deps = descriptor["dependencies"] || [];
        for (var i = 0; i < deps.length; ++i) {
            var extension = nameToExtension.get(deps[i]);
            if (extension && !installed.has(extension))
                modesToLoad.add(extension);
        }
    }

    var promises = [];
    for (var extension of modesToLoad)
        promises.push(extension.instancePromise().then(installMode.bind(null, extension)));
    if (promises.length)
        Promise.all(promises).then(callback);

    /**
     * @param {!Runtime.Extension} extension
     * @param {!Object} instance
     */
    function installMode(extension, instance)
    {
        if (installed.has(extension))
            return;
        var mode = /** @type {!WebInspector.CodeMirrorMimeMode} */ (instance);
        mode.install(extension);
        installed.add(extension);
    }
}

/**
 * @interface
 */
WebInspector.CodeMirrorMimeMode = function()
{
}

WebInspector.CodeMirrorMimeMode.prototype = {
    /**
     * @param {!Runtime.Extension} extension
     */
    install: function(extension) { }
}
