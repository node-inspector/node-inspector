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

importScript("cm/codemirror.js");
importScript("cm/css.js");
importScript("cm/javascript.js");
importScript("cm/xml.js");
importScript("cm/htmlmixed.js");

importScript("cm/matchbrackets.js");
importScript("cm/closebrackets.js");
importScript("cm/markselection.js");
importScript("cm/comment.js");
importScript("cm/overlay.js");

importScript("cm/htmlembedded.js");
importScript("cm/clike.js");
importScript("cm/coffeescript.js");
importScript("cm/php.js");
importScript("cm/python.js");
importScript("cm/shell.js");
importScript("CodeMirrorUtils.js");

/**
 * @constructor
 * @extends {WebInspector.View}
 * @implements {WebInspector.TextEditor}
 * @param {?string} url
 * @param {WebInspector.TextEditorDelegate} delegate
 */
WebInspector.CodeMirrorTextEditor = function(url, delegate)
{
    WebInspector.View.call(this);
    this._delegate = delegate;
    this._url = url;

    this.registerRequiredCSS("cm/codemirror.css");
    this.registerRequiredCSS("cm/cmdevtools.css");

    this._codeMirror = window.CodeMirror(this.element, {
        lineNumbers: true,
        gutters: ["CodeMirror-linenumbers"],
        matchBrackets: true,
        smartIndent: false,
        styleSelectedText: true,
        electricChars: false,
        autoCloseBrackets: { explode: false }
    });
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
        "Ctrl-Space": "autocomplete"
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
        "Alt-Left": "goLineStart",
        "Alt-Right": "goLineEnd",
        "Ctrl-Backspace": "delGroupBefore",
        "Ctrl-Delete": "delGroupAfter",
        "Ctrl-/": "toggleComment",
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
        "Cmd-Left": "goLineStartSmart",
        "Cmd-Right": "goLineEnd",
        "Alt-Backspace": "delGroupBefore",
        "Alt-Delete": "delGroupAfter",
        "Cmd-/": "toggleComment",
        fallthrough: "devtools-common"
    };

    WebInspector.settings.textEditorIndent.addChangeListener(this._updateEditorIndentation, this);
    this._updateEditorIndentation();
    WebInspector.settings.showWhitespacesInEditor.addChangeListener(this._updateCodeMirrorMode, this);

    this._codeMirror.setOption("keyMap", WebInspector.isMac() ? "devtools-mac" : "devtools-pc");
    this._codeMirror.setOption("flattenSpans", false);
    this._codeMirror.setOption("maxHighlightLength", 1000);
    this._codeMirror.setOption("mode", null);

    this._shouldClearHistory = true;
    this._lineSeparator = "\n";

    this._tokenHighlighter = new WebInspector.CodeMirrorTextEditor.TokenHighlighter(this._codeMirror);
    this._blockIndentController = new WebInspector.CodeMirrorTextEditor.BlockIndentController(this._codeMirror);
    this._fixWordMovement = new WebInspector.CodeMirrorTextEditor.FixWordMovement(this._codeMirror);
    this._autocompleteController = new WebInspector.CodeMirrorTextEditor.AutocompleteController(this, this._codeMirror);

    this._codeMirror.on("change", this._change.bind(this));
    this._codeMirror.on("beforeChange", this._beforeChange.bind(this));
    this._codeMirror.on("gutterClick", this._gutterClick.bind(this));
    this._codeMirror.on("cursorActivity", this._cursorActivity.bind(this));
    this._codeMirror.on("scroll", this._scroll.bind(this));
    this._codeMirror.on("focus", this._focus.bind(this));
    this._codeMirror.on("blur", this._blur.bind(this));
    this.element.addEventListener("contextmenu", this._contextMenu.bind(this), false);

    this.element.addStyleClass("fill");
    this.element.style.overflow = "hidden";
    this.element.firstChild.addStyleClass("source-code");
    this.element.firstChild.addStyleClass("fill");
    this._elementToWidget = new Map();
    this._nestedUpdatesCounter = 0;

    this.element.addEventListener("focus", this._handleElementFocus.bind(this), false);
    this.element.addEventListener("keydown", this._handleKeyDown.bind(this), true);
    this.element.tabIndex = 0;

    this._setupSelectionColor();
    this._setupWhitespaceHighlight();
}

WebInspector.CodeMirrorTextEditor.autocompleteCommand = function(codeMirror)
{
    codeMirror._codeMirrorTextEditor._autocompleteController.autocomplete();
}
CodeMirror.commands.autocomplete = WebInspector.CodeMirrorTextEditor.autocompleteCommand;

CodeMirror.commands.smartNewlineAndIndent = function(codeMirror)
{
    codeMirror.operation(innerSmartNewlineAndIndent.bind(this, codeMirror));

    function countIndent(line)
    {
        for(var i = 0; i < line.length; ++i) {
            if (!WebInspector.TextUtils.isSpaceChar(line[i]))
                return i;
        }
        return line.length;
    }

    function innerSmartNewlineAndIndent(codeMirror)
    {
        var cur = codeMirror.getCursor("start");
        var line = codeMirror.getLine(cur.line);
        var indent = cur.line > 0 ? countIndent(line) : 0;
        if (cur.ch <= indent) {
            codeMirror.replaceSelection("\n" + line.substring(0, cur.ch), "end", "+input");
            codeMirror.setSelection(new CodeMirror.Pos(cur.line + 1, cur.ch));
        } else
            codeMirror.execCommand("newlineAndIndent");
    }
}

CodeMirror.commands.undoAndReveal = function(codemirror)
{
    var scrollInfo = codemirror.getScrollInfo();
    codemirror.execCommand("undo");
    var cursor = codemirror.getCursor("start");
    codemirror._codeMirrorTextEditor._innerRevealLine(cursor.line, scrollInfo);
}

CodeMirror.commands.redoAndReveal = function(codemirror)
{
    var scrollInfo = codemirror.getScrollInfo();
    codemirror.execCommand("redo");
    var cursor = codemirror.getCursor("start");
    codemirror._codeMirrorTextEditor._innerRevealLine(cursor.line, scrollInfo);
}

WebInspector.CodeMirrorTextEditor.LongLineModeLineLengthThreshold = 2000;
WebInspector.CodeMirrorTextEditor.MaximumNumberOfWhitespacesPerSingleSpan = 16;

WebInspector.CodeMirrorTextEditor.prototype = {
    wasShown: function()
    {
        this._codeMirror.refresh();
    },

    _guessIndentationLevel: function()
    {
        var tabRegex = /^\t+/;
        var tabLines = 0;
        var indents = {};
        function processLine(lineHandle)
        {
            var text = lineHandle.text;
            if (text.length === 0 || !WebInspector.TextUtils.isSpaceChar(text[0]))
                return;
            if (tabRegex.test(text)) {
                ++tabLines;
                return;
            }
            var i = 0;
            while (i < text.length && WebInspector.TextUtils.isSpaceChar(text[i]))
                ++i;
            if (i % 2 !== 0)
                return;
            indents[i] = 1 + (indents[i] || 0);
        }
        this._codeMirror.eachLine(processLine);

        var onePercentFilterThreshold = this.linesCount / 100;
        if (tabLines && tabLines > onePercentFilterThreshold)
            return "\t";
        var minimumIndent = Infinity;
        for (var i in indents) {
            if (indents[i] < onePercentFilterThreshold)
                continue;
            var indent = parseInt(i, 10);
            if (minimumIndent > indent)
                minimumIndent = indent;
        }
        if (minimumIndent === Infinity)
            return WebInspector.TextUtils.Indent.FourSpaces;
        return new Array(minimumIndent + 1).join(" ");
    },

    _updateEditorIndentation: function()
    {
        var extraKeys = {};
        var indent = WebInspector.settings.textEditorIndent.get();
        if (WebInspector.settings.textEditorAutoDetectIndent.get())
            indent = this._guessIndentationLevel();
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
     * @param {!RegExp} regex
     * @param {WebInspector.TextRange} range
     */
    highlightSearchResults: function(regex, range)
    {
        function innerHighlightRegex()
        {
            if (range) {
                this.revealLine(range.startLine);
                this.setSelection(WebInspector.TextRange.createFromLocation(range.startLine, range.startColumn));
            } else {
                // Collapse selection to end on search start so that we jump to next occurence on the first enter press.
                this.setSelection(this.selection().collapseToEnd());
            }
            this._tokenHighlighter.highlightSearchResults(regex, range);
        }

        this._codeMirror.operation(innerHighlightRegex.bind(this));
    },

    cancelSearchResultsHighlight: function()
    {
        this._codeMirror.operation(this._tokenHighlighter.highlightSelectedTokens.bind(this._tokenHighlighter));
    },

    undo: function()
    {
        this._codeMirror.undo();
    },

    redo: function()
    {
        this._codeMirror.redo();
    },

    _setupSelectionColor: function()
    {
        if (WebInspector.CodeMirrorTextEditor._selectionStyleInjected)
            return;
        WebInspector.CodeMirrorTextEditor._selectionStyleInjected = true;
        var backgroundColor = WebInspector.getSelectionBackgroundColor();
        var backgroundColorRule = backgroundColor ? ".CodeMirror .CodeMirror-selected { background-color: " + backgroundColor + ";}" : "";
        var foregroundColor = WebInspector.getSelectionForegroundColor();
        var foregroundColorRule = foregroundColor ? ".CodeMirror .CodeMirror-selectedtext:not(.CodeMirror-persist-highlight) { color: " + foregroundColor + "!important;}" : "";
        if (!foregroundColorRule && !backgroundColorRule)
            return;

        var style = document.createElement("style");
        style.textContent = backgroundColorRule + foregroundColorRule;
        document.head.appendChild(style);
    },

    _setupWhitespaceHighlight: function()
    {
        if (WebInspector.CodeMirrorTextEditor._whitespaceStyleInjected || !WebInspector.settings.showWhitespacesInEditor.get())
            return;
        WebInspector.CodeMirrorTextEditor._whitespaceStyleInjected = true;
        const classBase = ".cm-whitespace-";
        const spaceChar = "·";
        var spaceChars = "";
        var rules = "";
        for(var i = 1; i <= WebInspector.CodeMirrorTextEditor.MaximumNumberOfWhitespacesPerSingleSpan; ++i) {
            spaceChars += spaceChar;
            var rule = classBase + i + "::before { content: '" + spaceChars + "';}\n";
            rules += rule;
        }
        rules += ".cm-tab:before { display: block !important; }\n";
        var style = document.createElement("style");
        style.textContent = rules;
        document.head.appendChild(style);
    },

    _handleKeyDown: function(e)
    {
        if (this._autocompleteController.keyDown(e))
            e.consume(true);
    },

    _shouldProcessWordForAutocompletion: function(word)
    {
        return word.length && (word[0] < '0' || word[0] > '9');
    },

    /**
     * @param {string} text
     */
    _addTextToCompletionDictionary: function(text)
    {
        var words = WebInspector.TextUtils.textToWords(text);
        for(var i = 0; i < words.length; ++i) {
            if (this._shouldProcessWordForAutocompletion(words[i]))
                this._dictionary.addWord(words[i]);
        }
    },

    /**
     * @param {string} text
     */
    _removeTextFromCompletionDictionary: function(text)
    {
        var words = WebInspector.TextUtils.textToWords(text);
        for(var i = 0; i < words.length; ++i) {
            if (this._shouldProcessWordForAutocompletion(words[i]))
                this._dictionary.removeWord(words[i]);
        }
    },

    /**
     * @param {WebInspector.CompletionDictionary} dictionary
     */
    setCompletionDictionary: function(dictionary)
    {
        this._dictionary = dictionary;
        this._addTextToCompletionDictionary(this.text());
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
        var element = document.elementFromPoint(x, y);
        if (!element || !element.isSelfOrDescendant(this._codeMirror.getWrapperElement()))
            return null;
        var gutterBox = this._codeMirror.getGutterElement().boxInWindow();
        if (x >= gutterBox.x && x <= gutterBox.x + gutterBox.width &&
            y >= gutterBox.y && y <= gutterBox.y + gutterBox.height)
            return null;
        var coords = this._codeMirror.coordsChar({left: x, top: y});
        return this._toRange(coords, coords);
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
        if (!token || !token.type)
            return null;
        var convertedType = WebInspector.CodeMirrorUtils.convertTokenType(token.type);
        if (!convertedType)
            return null;
        return {
            startColumn: token.start,
            endColumn: token.end - 1,
            type: convertedType
        };
    },

    /**
     * @param {WebInspector.TextRange} textRange
     * @return {string}
     */
    copyRange: function(textRange)
    {
        var pos = this._toPos(textRange.normalize());
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
    _whitespaceOverlayMode: function(mimeType)
    {
        var modeName = CodeMirror.mimeModes[mimeType] + "+whitespaces";
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

    _enableLongLinesMode: function()
    {
        this._codeMirror.setOption("styleSelectedText", false);
        this._longLinesMode = true;
    },

    _disableLongLinesMode: function()
    {
        this._codeMirror.setOption("styleSelectedText", true);
        this._longLinesMode = false;
    },

    _updateCodeMirrorMode: function()
    {
        var showWhitespaces = WebInspector.settings.showWhitespacesInEditor.get();
        this._codeMirror.setOption("mode", showWhitespaces ? this._whitespaceOverlayMode(this._mimeType) : this._mimeType);
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
        this.element.enableStyleClass("CodeMirror-readonly", readOnly)
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
     * @param {Object} highlightDescriptor
     */
    removeHighlight: function(highlightDescriptor)
    {
        highlightDescriptor.clear();
    },

    /**
     * @param {WebInspector.TextRange} range
     * @param {string} cssClass
     * @return {Object}
     */
    highlightRange: function(range, cssClass)
    {
        cssClass = "CodeMirror-persist-highlight " + cssClass;
        var pos = this._toPos(range);
        ++pos.end.ch;
        return this._codeMirror.markText(pos.start, pos.end, {
            className: cssClass,
            startStyle: cssClass + "-start",
            endStyle: cssClass + "-end"
        });
    },

    /**
     * @param {string} regex
     * @param {string} cssClass
     * @return {Object}
     */
    highlightRegex: function(regex, cssClass) { },

    /**
     * @return {Element}
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

    beginUpdates: function()
    {
        ++this._nestedUpdatesCounter;
    },

    endUpdates: function()
    {
        if (!--this._nestedUpdatesCounter)
            this._codeMirror.refresh();
    },

    /**
     * @param {number} lineNumber
     */
    revealLine: function(lineNumber)
    {
        this._innerRevealLine(lineNumber, this._codeMirror.getScrollInfo());
    },

    /**
     * @param {number} lineNumber
     * @param {{left: number, top: number, width: number, height: number, clientWidth: number, clientHeight: number}} scrollInfo
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
        this.dispatchEventToListeners(WebInspector.TextEditor.Events.GutterClick, { lineNumber: lineNumber, event: event });
    },

    _contextMenu: function(event)
    {
        var contextMenu = new WebInspector.ContextMenu(event);
        var target = event.target.enclosingNodeOrSelfWithClass("CodeMirror-gutter-elt");
        if (target)
            this._delegate.populateLineGutterContextMenu(contextMenu, parseInt(target.textContent, 10) - 1);
        else
            this._delegate.populateTextAreaContextMenu(contextMenu, 0);
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
        for(var i = 0; i < classes.length; ++i) {
            if (classes[i].startsWith("cm-breakpoint"))
                this._codeMirror.removeLineClass(lineNumber, "wrap", classes[i]);
        }
    },

    /**
     * @param {number} lineNumber
     */
    setExecutionLine: function(lineNumber)
    {
        this._executionLine = this._codeMirror.getLineHandle(lineNumber);
        this._codeMirror.addLineClass(this._executionLine, "wrap", "cm-execution-line");
    },

    clearExecutionLine: function()
    {
        if (this._executionLine)
            this._codeMirror.removeLineClass(this._executionLine, "wrap", "cm-execution-line");
        delete this._executionLine;
    },

    /**
     * @param {number} lineNumber
     * @param {Element} element
     */
    addDecoration: function(lineNumber, element)
    {
        var widget = this._codeMirror.addLineWidget(lineNumber, element);
        this._elementToWidget.put(element, widget);
    },

    /**
     * @param {number} lineNumber
     * @param {Element} element
     */
    removeDecoration: function(lineNumber, element)
    {
        var widget = this._elementToWidget.remove(element);
        if (widget)
            this._codeMirror.removeLineWidget(widget);
    },

    /**
     * @param {number} lineNumber
     * @param {number=} columnNumber
     */
    highlightPosition: function(lineNumber, columnNumber)
    {
        if (lineNumber < 0)
            return;
        lineNumber = Math.min(lineNumber, this._codeMirror.lineCount() - 1);
        if (typeof columnNumber !== "number" || columnNumber < 0 || columnNumber > this._codeMirror.getLine(lineNumber).length)
            columnNumber = 0;

        this.clearPositionHighlight();
        this._highlightedLine = this._codeMirror.getLineHandle(lineNumber);
        if (!this._highlightedLine)
          return;
        this.revealLine(lineNumber);
        this._codeMirror.addLineClass(this._highlightedLine, null, "cm-highlight");
        this._clearHighlightTimeout = setTimeout(this.clearPositionHighlight.bind(this), 2000);
        if (!this.readOnly())
            this._codeMirror.setSelection(new CodeMirror.Pos(lineNumber, columnNumber));
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
     * @return {Array.<Element>}
     */
    elementsToRestoreScrollPositionsFor: function()
    {
        return [];
    },

    /**
     * @param {WebInspector.TextEditor} textEditor
     */
    inheritScrollPositions: function(textEditor)
    {
    },

    /**
     * @param {number} width
     * @param {number} height
     */
    _updatePaddingBottom: function(width, height)
    {
        var scrollInfo = this._codeMirror.getScrollInfo();
        var newPaddingBottom;
        var linesElement = this.element.firstChild.querySelector(".CodeMirror-lines");
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
        var scrollInfo = this._codeMirror.getScrollInfo();
        var width = parentElement.offsetWidth;
        var height = parentElement.offsetHeight;
        this._codeMirror.setSize(width, height);
        this._updatePaddingBottom(width, height);
        this._codeMirror.scrollTo(scrollInfo.left, scrollInfo.top);
    },

    onResize: function()
    {
        this._resizeEditor();
    },

    /**
     * @param {WebInspector.TextRange} range
     * @param {string} text
     * @return {WebInspector.TextRange}
     */
    editRange: function(range, text)
    {
        var pos = this._toPos(range);
        this._codeMirror.replaceRange(text, pos.start, pos.end);
        var newRange = this._toRange(pos.start, this._codeMirror.posFromIndex(this._codeMirror.indexFromPos(pos.start) + text.length));
        this._delegate.onTextChanged(range, newRange);
        if (WebInspector.settings.textEditorAutoDetectIndent.get())
            this._updateEditorIndentation();
        return newRange;
    },

    /**
     * @param {number} lineNumber
     * @param {number} column
     * @param {boolean=} prefixOnly
     * @return {?WebInspector.TextRange}
     */
    _wordRangeForCursorPosition: function(lineNumber, column, prefixOnly)
    {
        var line = this.line(lineNumber);
        if (column === 0 || !WebInspector.TextUtils.isWordChar(line.charAt(column - 1)))
            return null;
        var wordStart = column - 1;
        while(wordStart > 0 && WebInspector.TextUtils.isWordChar(line.charAt(wordStart - 1)))
            --wordStart;
        if (prefixOnly)
            return new WebInspector.TextRange(lineNumber, wordStart, lineNumber, column);
        var wordEnd = column;
        while(wordEnd < line.length && WebInspector.TextUtils.isWordChar(line.charAt(wordEnd)))
            ++wordEnd;
        return new WebInspector.TextRange(lineNumber, wordStart, lineNumber, wordEnd);
    },

    _beforeChange: function(codeMirror, changeObject)
    {
        if (!this._dictionary)
            return;
        this._updatedLines = this._updatedLines || {};
        for(var i = changeObject.from.line; i <= changeObject.to.line; ++i)
            this._updatedLines[i] = this.line(i);
    },

    /**
     * @param {CodeMirror} codeMirror
     * @param {{origin: string, text: Array.<string>, removed: Array.<string>}} changeObject
     */
    _change: function(codeMirror, changeObject)
    {
        // We do not show "scroll beyond end of file" span for one line documents, so we need to check if "document has one line" changed.
        var hasOneLine = this._codeMirror.lineCount() === 1;
        if (hasOneLine !== this._hasOneLine)
            this._resizeEditor();
        this._hasOneLine = hasOneLine;
        var widgets = this._elementToWidget.values();
        for (var i = 0; i < widgets.length; ++i)
            this._codeMirror.removeLineWidget(widgets[i]);
        this._elementToWidget.clear();

        if (this._updatedLines) {
            for(var lineNumber in this._updatedLines)
                this._removeTextFromCompletionDictionary(this._updatedLines[lineNumber]);
            delete this._updatedLines;
        }

        var linesToUpdate = {};
        var singleCharInput = false;
        do {
            var oldRange = this._toRange(changeObject.from, changeObject.to);
            var newRange = oldRange.clone();
            var linesAdded = changeObject.text.length;
            singleCharInput = (changeObject.origin === "+input" && changeObject.text.length === 1 && changeObject.text[0].length === 1) ||
                (changeObject.origin === "+delete" && changeObject.removed.length === 1 && changeObject.removed[0].length === 1);
            if (linesAdded === 0) {
                newRange.endLine = newRange.startLine;
                newRange.endColumn = newRange.startColumn;
            } else if (linesAdded === 1) {
                newRange.endLine = newRange.startLine;
                newRange.endColumn = newRange.startColumn + changeObject.text[0].length;
            } else {
                newRange.endLine = newRange.startLine + linesAdded - 1;
                newRange.endColumn = changeObject.text[linesAdded - 1].length;
            }

            if (!this._muteTextChangedEvent)
                this._delegate.onTextChanged(oldRange, newRange);

            for(var i = newRange.startLine; i <= newRange.endLine; ++i) {
                linesToUpdate[i] = true;
            }
            if (this._dictionary) {
                for(var i = newRange.startLine; i <= newRange.endLine; ++i)
                    linesToUpdate[i] = this.line(i);
            }
        } while (changeObject = changeObject.next);
        if (this._dictionary) {
            for(var lineNumber in linesToUpdate)
                this._addTextToCompletionDictionary(linesToUpdate[lineNumber]);
        }
        if (singleCharInput)
            this._autocompleteController.autocomplete();
    },

    _cursorActivity: function()
    {
        var start = this._codeMirror.getCursor("anchor");
        var end = this._codeMirror.getCursor("head");
        this._delegate.selectionChanged(this._toRange(start, end));
        if (!this._tokenHighlighter.highlightedRegex())
            this._codeMirror.operation(this._tokenHighlighter.highlightSelectedTokens.bind(this._tokenHighlighter));
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

    _blur: function()
    {
        this._autocompleteController.finishAutocomplete();
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
     * @return {WebInspector.TextRange}
     */
    selection: function()
    {
        var start = this._codeMirror.getCursor("anchor");
        var end = this._codeMirror.getCursor("head");

        return this._toRange(start, end);
    },

    /**
     * @return {WebInspector.TextRange?}
     */
    lastSelection: function()
    {
        return this._lastSelection;
    },

    /**
     * @param {WebInspector.TextRange} textRange
     */
    setSelection: function(textRange)
    {
        this._lastSelection = textRange;
        var pos = this._toPos(textRange);
        this._codeMirror.setSelection(pos.start, pos.end);
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
        this._codeMirror.setValue(text);
        this._updateEditorIndentation();
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
     * @return {WebInspector.TextRange}
     */
    range: function()
    {
        var lineCount = this.linesCount;
        var lastLine = this._codeMirror.getLine(lineCount - 1);
        return this._toRange(new CodeMirror.Pos(0, 0), new CodeMirror.Pos(lineCount - 1, lastLine.length));
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
     * @param {Object?} value
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
     * @param {WebInspector.TextRange} range
     * @return {{start: CodeMirror.Pos, end: CodeMirror.Pos}}
     */
    _toPos: function(range)
    {
        return {
            start: new CodeMirror.Pos(range.startLine, range.startColumn),
            end: new CodeMirror.Pos(range.endLine, range.endColumn)
        }
    },

    _toRange: function(start, end)
    {
        return new WebInspector.TextRange(start.line, start.ch, end.line, end.ch);
    },

    __proto__: WebInspector.View.prototype
}

/**
 * @constructor
 * @param {CodeMirror} codeMirror
 */
WebInspector.CodeMirrorTextEditor.TokenHighlighter = function(codeMirror)
{
    this._codeMirror = codeMirror;
}

WebInspector.CodeMirrorTextEditor.TokenHighlighter.prototype = {
    /**
     * @param {RegExp} regex
     * @param {WebInspector.TextRange} range
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
            this._setHighlighter(this._searchHighlighter.bind(this, this._highlightRegex, this._highlightRange), selectionStart);
        }
        if (selectionStart) {
            var pos = WebInspector.CodeMirrorTextEditor.prototype._toPos(this._highlightRange);
            this._searchResultMarker = this._codeMirror.markText(pos.start, pos.end, {className: "cm-column-with-selection"});
        }
    },

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

        var selectedText = this._codeMirror.getSelection();
        if (this._isWord(selectedText, selectionStart.line, selectionStart.ch, selectionEnd.ch)) {
            if (selectionStart)
                this._codeMirror.addLineClass(selectionStart.line, "wrap", "cm-line-with-selection")
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
     * @param {RegExp} regex
     * @param {WebInspector.TextRange} range
     * @param {CodeMirror.StringStream} stream
     */
    _searchHighlighter: function(regex, range, stream)
    {
        if (stream.column() === 0)
            delete this._searchMatchLength;
        if (this._searchMatchLength) {
            if (this._searchMatchLength > 1) {
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

        while (!stream.match(regex, false) && stream.next()) {};
    },

    /**
     * @param {string} token
     * @param {CodeMirror.Pos} selectionStart
     * @param {CodeMirror.StringStream} stream
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
     * @param {function(CodeMirror.StringStream)} highlighter
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
 * @param {CodeMirror} codeMirror
 */
WebInspector.CodeMirrorTextEditor.BlockIndentController = function(codeMirror)
{
    codeMirror.addKeyMap(this);
}

WebInspector.CodeMirrorTextEditor.BlockIndentController.prototype = {
    name: "blockIndentKeymap",

    Enter: function(codeMirror)
    {
        if (codeMirror.somethingSelected())
            return CodeMirror.Pass;
        var cursor = codeMirror.getCursor();
        if (cursor.ch === 0)
            return CodeMirror.Pass;
        var line = codeMirror.getLine(cursor.line);
        if (line.substr(cursor.ch - 1, 2) === "{}") {
            codeMirror.execCommand("newlineAndIndent");
            codeMirror.setCursor(cursor);
            codeMirror.execCommand("newlineAndIndent");
            codeMirror.execCommand("indentMore");
        } else if (line.substr(cursor.ch - 1, 1) === "{") {
            codeMirror.execCommand("newlineAndIndent");
            codeMirror.execCommand("indentMore");
        } else
            return CodeMirror.Pass;
    },

    "'}'": function(codeMirror)
    {
        var cursor = codeMirror.getCursor();
        var line = codeMirror.getLine(cursor.line);
        for(var i = 0 ; i < line.length; ++i)
            if (!WebInspector.TextUtils.isSpaceChar(line.charAt(i)))
                return CodeMirror.Pass;

        codeMirror.replaceRange("}", cursor);
        var matchingBracket = codeMirror.findMatchingBracket();
        if (!matchingBracket || !matchingBracket.match)
            return;

        line = codeMirror.getLine(matchingBracket.to.line);
        var desiredIndentation = 0;
        while (desiredIndentation < line.length && WebInspector.TextUtils.isSpaceChar(line.charAt(desiredIndentation)))
            ++desiredIndentation;

        codeMirror.replaceRange(line.substr(0, desiredIndentation) + "}", new CodeMirror.Pos(cursor.line, 0), new CodeMirror.Pos(cursor.line, cursor.ch + 1));
    }
}

/**
 * @constructor
 * @param {CodeMirror} codeMirror
 */
WebInspector.CodeMirrorTextEditor.FixWordMovement = function(codeMirror)
{
    function moveLeft(shift, codeMirror)
    {
        var cursor = codeMirror.getCursor("head");
        if (cursor.ch !== 0 || cursor.line === 0)
            return CodeMirror.Pass;
        codeMirror.setExtending(shift);
        codeMirror.execCommand("goLineUp");
        codeMirror.execCommand("goLineEnd")
        codeMirror.setExtending(false);
    }
    function moveRight(shift, codeMirror)
    {
        var cursor = codeMirror.getCursor("head");
        var line = codeMirror.getLine(cursor.line);
        if (cursor.ch !== line.length || cursor.line + 1 === codeMirror.lineCount())
            return CodeMirror.Pass;
        codeMirror.setExtending(shift);
        codeMirror.execCommand("goLineDown");
        codeMirror.execCommand("goLineStart");
        codeMirror.setExtending(false);
    }
    function delWordBack(codeMirror)
    {
        if (codeMirror.somethingSelected())
            return CodeMirror.Pass;
        var cursor = codeMirror.getCursor("head");
        if (cursor.ch === 0)
            codeMirror.execCommand("delCharBefore");
        else
            return CodeMirror.Pass;
    }

    var modifierKey = WebInspector.isMac() ? "Alt" : "Ctrl";
    var leftKey = modifierKey + "-Left";
    var rightKey = modifierKey + "-Right";
    var keyMap = {};
    keyMap[leftKey] = moveLeft.bind(this, false);
    keyMap[rightKey] = moveRight.bind(this, false);
    keyMap["Shift-" + leftKey] = moveLeft.bind(this, true);
    keyMap["Shift-" + rightKey] = moveRight.bind(this, true);
    keyMap[modifierKey + "-Backspace"] = delWordBack.bind(this);
    codeMirror.addKeyMap(keyMap);
}

/**
 * @constructor
 * @implements {WebInspector.SuggestBoxDelegate}
 * @param {WebInspector.CodeMirrorTextEditor} textEditor
 * @param {CodeMirror} codeMirror
 */
WebInspector.CodeMirrorTextEditor.AutocompleteController = function(textEditor, codeMirror)
{
    this._textEditor = textEditor;
    this._codeMirror = codeMirror;
    this._codeMirror.on("scroll", this._onScroll.bind(this));
    this._codeMirror.on("cursorActivity", this._onCursorActivity.bind(this));
}

WebInspector.CodeMirrorTextEditor.AutocompleteController.prototype = {
    autocomplete: function()
    {
        var dictionary = this._textEditor._dictionary;
        if (!dictionary || this._codeMirror.somethingSelected()) {
            this.finishAutocomplete();
            return;
        }

        var cursor = this._codeMirror.getCursor();
        var substituteRange = this._textEditor._wordRangeForCursorPosition(cursor.line, cursor.ch, false);
        if (!substituteRange || substituteRange.startColumn === cursor.ch) {
            this.finishAutocomplete();
            return;
        }
        var prefixRange = substituteRange.clone();
        prefixRange.endColumn = cursor.ch;

        var substituteWord = this._textEditor.copyRange(substituteRange);
        var hasPrefixInDictionary = dictionary.hasWord(substituteWord);
        if (hasPrefixInDictionary)
            dictionary.removeWord(substituteWord);
        var wordsWithPrefix = dictionary.wordsWithPrefix(this._textEditor.copyRange(prefixRange));
        if (hasPrefixInDictionary)
            dictionary.addWord(substituteWord);

        function sortSuggestions(a, b)
        {
            return dictionary.wordCount(b) - dictionary.wordCount(a) || a.length - b.length;
        }

        wordsWithPrefix.sort(sortSuggestions);

        if (!this._suggestBox) {
            this._suggestBox = new WebInspector.SuggestBox(this, this._textEditor.element, "generic-suggest", 6);
            this._anchorBox = this._anchorBoxForPosition(cursor.line, cursor.ch);
        }
        this._suggestBox.updateSuggestions(this._anchorBox, wordsWithPrefix, 0, true, this._textEditor.copyRange(prefixRange));
        this._prefixRange = prefixRange;
        if (!this._suggestBox.visible())
            this.finishAutocomplete();
    },

    finishAutocomplete: function()
    {
        if (!this._suggestBox)
            return;
        this._suggestBox.hide();
        this._suggestBox = null;
        this._prefixRange = null;
        this._anchorBox = null;
    },

    /**
     * @param {Event} e
     */
    keyDown: function(e)
    {
        if (!this._suggestBox)
            return false;
        if (e.keyCode === WebInspector.KeyboardShortcut.Keys.Esc.code) {
            this.finishAutocomplete();
            return true;
        }
        if (e.keyCode === WebInspector.KeyboardShortcut.Keys.Tab.code) {
            this._suggestBox.acceptSuggestion();
            this.finishAutocomplete();
            return true;
        }
        return this._suggestBox.keyPressed(e);
    },

    /**
     * @param {string} suggestion
     * @param {boolean=} isIntermediateSuggestion
     */
    applySuggestion: function(suggestion, isIntermediateSuggestion)
    {
        this._currentSuggestion = suggestion;
    },

    acceptSuggestion: function()
    {
        if (this._prefixRange.endColumn - this._prefixRange.startColumn !== this._currentSuggestion.length) {
            var pos = this._textEditor._toPos(this._prefixRange);
            this._codeMirror.replaceRange(this._currentSuggestion, pos.start, pos.end, "+autocomplete");
        }
    },

    _onScroll: function()
    {
        if (!this._suggestBox)
            return;
        var cursor = this._codeMirror.getCursor();
        var scrollInfo = this._codeMirror.getScrollInfo();
        var topmostLineNumber = this._codeMirror.lineAtHeight(scrollInfo.top, "local");
        var bottomLine = this._codeMirror.lineAtHeight(scrollInfo.top + scrollInfo.clientHeight, "local");
        if (cursor.line < topmostLineNumber || cursor.line > bottomLine)
            this.finishAutocomplete();
        else {
            this._anchorBox = this._anchorBoxForPosition(cursor.line, cursor.ch);
            this._suggestBox.setPosition(this._anchorBox);
        }
    },

    _onCursorActivity: function()
    {
        if (!this._suggestBox)
            return;
        var cursor = this._codeMirror.getCursor();
        if (cursor.line !== this._prefixRange.startLine || cursor.ch > this._prefixRange.endColumn || cursor.ch < this._prefixRange.startColumn)
            this.finishAutocomplete();
    },

    /**
     * @param {number} line
     * @param {number} column
     * @return {AnchorBox}
     */
    _anchorBoxForPosition: function(line, column)
    {
        var metrics = this._textEditor.cursorPositionToCoordinates(line, column);
        return metrics ? new AnchorBox(metrics.x, metrics.y, 0, metrics.height) : null;
    },
}
