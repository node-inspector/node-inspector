/*
 * Copyright (C) 2013 Google Inc. All rights reserved.
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
 * @param {string} content
 * @param {!FormatterWorker.CSSFormattedContentBuilder} builder
 */
FormatterWorker.CSSFormatter = function(content, builder)
{
    this._content = content;
    this._builder = builder;
    this._lastLine = -1;
    this._state = {};
}

FormatterWorker.CSSFormatter.prototype = {
    format: function()
    {
        this._lineEndings = this._lineEndings(this._content);
        var tokenize = FormatterWorker.createTokenizer("text/css");
        var lines = this._content.split("\n");

        for (var i = 0; i < lines.length; ++i) {
            var line = lines[i];
            tokenize(line, this._tokenCallback.bind(this, i));
        }
        this._builder.flushNewLines(true);
    },

    /**
     * @param {string} text
     */
    _lineEndings: function(text)
    {
        var lineEndings = [];
        var i = text.indexOf("\n");
        while (i !== -1) {
            lineEndings.push(i);
            i = text.indexOf("\n", i + 1);
        }
        lineEndings.push(text.length);
        return lineEndings;
    },

    /**
     * @param {number} startLine
     * @param {string} token
     * @param {?string} type
     * @param {number} startColumn
     */
    _tokenCallback: function(startLine, token, type, startColumn)
    {
        if (startLine !== this._lastLine)
            this._state.eatWhitespace = true;
        if (/^property/.test(type) && !this._state.inPropertyValue)
            this._state.seenProperty = true;
        this._lastLine = startLine;
        var isWhitespace = /^\s+$/.test(token);
        if (isWhitespace) {
            if (!this._state.eatWhitespace)
                this._builder.addSpace();
            return;
        }
        this._state.eatWhitespace = false;
        if (token === "\n")
            return;

        if (token !== "}") {
            if (this._state.afterClosingBrace)
                this._builder.addNewLine();
            this._state.afterClosingBrace = false;
        }
        var startPosition = (startLine ? this._lineEndings[startLine - 1] : 0) + startColumn;
        if (token === "}") {
            if (this._state.inPropertyValue)
                this._builder.addNewLine();
            this._builder.decreaseNestingLevel();
            this._state.afterClosingBrace = true;
            this._state.inPropertyValue = false;
        } else if (token === ":" && !this._state.inPropertyValue && this._state.seenProperty) {
            this._builder.addToken(token, startPosition, startLine, startColumn);
            this._builder.addSpace();
            this._state.eatWhitespace = true;
            this._state.inPropertyValue = true;
            this._state.seenProperty = false;
            return;
        } else if (token === "{") {
            this._builder.addSpace();
            this._builder.addToken(token, startPosition, startLine, startColumn);
            this._builder.addNewLine();
            this._builder.increaseNestingLevel();
            return;
        }

        this._builder.addToken(token, startPosition, startLine, startColumn);

        if (type === "comment" && !this._state.inPropertyValue && !this._state.seenProperty)
            this._builder.addNewLine();
        if (token === ";" && this._state.inPropertyValue) {
            this._state.inPropertyValue = false;
            this._builder.addNewLine();
        } else if (token === "}") {
            this._builder.addNewLine();
        }
    }
}

/**
 * @constructor
 * @param {string} content
 * @param {!{original: !Array.<number>, formatted: !Array.<number>}} mapping
 * @param {number} originalOffset
 * @param {number} formattedOffset
 * @param {string} indentString
 */
FormatterWorker.CSSFormattedContentBuilder = function(content, mapping, originalOffset, formattedOffset, indentString)
{
    this._originalContent = content;
    this._originalOffset = originalOffset;
    this._lastOriginalPosition = 0;

    this._formattedContent = [];
    this._formattedContentLength = 0;
    this._formattedOffset = formattedOffset;
    this._lastFormattedPosition = 0;

    this._mapping = mapping;

    this._lineNumber = 0;
    this._nestingLevel = 0;
    this._needNewLines = 0;
    this._atLineStart = true;
    this._indentString = indentString;
    this._cachedIndents = {};
}

FormatterWorker.CSSFormattedContentBuilder.prototype = {
    /**
     * @param {string} token
     * @param {number} startPosition
     * @param {number} startLine
     * @param {number} startColumn
     */
    addToken: function(token, startPosition, startLine, startColumn)
    {
        if ((this._isWhitespaceRun || this._atLineStart) && /^\s+$/.test(token))
            return;

        if (this._isWhitespaceRun && this._lineNumber === startLine && !this._needNewLines)
            this._addText(" ");

        this._isWhitespaceRun = false;
        this._atLineStart = false;

        while (this._lineNumber < startLine) {
            this._addText("\n");
            this._addIndent();
            this._needNewLines = 0;
            this._lineNumber += 1;
            this._atLineStart = true;
        }

        if (this._needNewLines) {
            this.flushNewLines();
            this._addIndent();
            this._atLineStart = true;
        }

        this._addMappingIfNeeded(startPosition);
        this._addText(token);
        this._lineNumber = startLine;
    },

    addSpace: function()
    {
        if (this._isWhitespaceRun)
            return;
        this._isWhitespaceRun = true;
    },

    addNewLine: function()
    {
        ++this._needNewLines;
    },

    /**
     * @param {boolean=} atLeastOne
     */
    flushNewLines: function(atLeastOne)
    {
        var newLineCount = atLeastOne && !this._needNewLines ? 1 : this._needNewLines;
        if (newLineCount)
            this._isWhitespaceRun = false;
        for (var i = 0; i < newLineCount; ++i)
            this._addText("\n");
        this._needNewLines = 0;
    },

    increaseNestingLevel: function()
    {
        this._nestingLevel += 1;
    },

    /**
     * @param {boolean=} addNewline
     */
    decreaseNestingLevel: function(addNewline)
    {
        if (this._nestingLevel)
            this._nestingLevel -= 1;
        if (addNewline)
            this.addNewLine();
    },

    /**
     * @return {string}
     */
    content: function()
    {
        return this._formattedContent.join("");
    },

    _addIndent: function()
    {
        if (this._cachedIndents[this._nestingLevel]) {
            this._addText(this._cachedIndents[this._nestingLevel]);
            return;
        }

        var fullIndent = "";
        for (var i = 0; i < this._nestingLevel; ++i)
            fullIndent += this._indentString;
        this._addText(fullIndent);

        // Cache a maximum of 20 nesting level indents.
        if (this._nestingLevel <= 20)
            this._cachedIndents[this._nestingLevel] = fullIndent;
    },

    /**
     * @param {string} text
     */
    _addText: function(text)
    {
        if (!text)
            return;
        this._formattedContent.push(text);
        this._formattedContentLength += text.length;
    },

    /**
     * @param {number} originalPosition
     */
    _addMappingIfNeeded: function(originalPosition)
    {
        if (originalPosition - this._lastOriginalPosition === this._formattedContentLength - this._lastFormattedPosition)
            return;
        this._mapping.original.push(this._originalOffset + originalPosition);
        this._lastOriginalPosition = originalPosition;
        this._mapping.formatted.push(this._formattedOffset + this._formattedContentLength);
        this._lastFormattedPosition = this._formattedContentLength;
    }
}
