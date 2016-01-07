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
FormatterWorker = {
    /**
     * @param {string} mimeType
     * @return {function(string, function(string, ?string, number, number))}
     */
    createTokenizer: function(mimeType)
    {
        var mode = CodeMirror.getMode({indentUnit: 2}, mimeType);
        var state = CodeMirror.startState(mode);
        function tokenize(line, callback)
        {
            var stream = new CodeMirror.StringStream(line);
            while (!stream.eol()) {
                var style = mode.token(stream, state);
                var value = stream.current();
                callback(value, style, stream.start, stream.start + value.length);
                stream.start = stream.pos;
            }
        }
        return tokenize;
    }
};

/**
 * @typedef {{indentString: string, content: string, mimeType: string}}
 */
var FormatterParameters;

self.onmessage = function(event) {
    var data = /** @type !{method: string, params: !FormatterParameters} */ (event.data);
    if (!data.method)
        return;

    FormatterWorker[data.method](data.params);
};

/**
 * @param {!FormatterParameters} params
 */
FormatterWorker.format = function(params)
{
    // Default to a 4-space indent.
    var indentString = params.indentString || "    ";
    var result = {};

    if (params.mimeType === "text/html") {
        var formatter = new FormatterWorker.HTMLFormatter(indentString);
        result = formatter.format(params.content);
    } else if (params.mimeType === "text/css") {
        result.mapping = { original: [0], formatted: [0] };
        result.content = FormatterWorker._formatCSS(params.content, result.mapping, 0, 0, indentString);
    } else {
        result.mapping = { original: [0], formatted: [0] };
        result.content = FormatterWorker._formatScript(params.content, result.mapping, 0, 0, indentString);
    }
    postMessage(result);
}

/**
 * @param {!Object} params
 */
FormatterWorker.javaScriptOutline = function(params)
{
    var chunkSize = 100000; // characters per data chunk
    var outlineChunk = [];
    var previousIdentifier = null;
    var previousToken = null;
    var processedChunkCharacters = 0;
    var addedFunction = false;
    var isReadingArguments = false;
    var argumentsText = "";
    var currentFunction = null;
    var tokenizer = new FormatterWorker.AcornTokenizer(params.content);
    var AT = FormatterWorker.AcornTokenizer;

    while (tokenizer.peekToken()) {
        var token = /** @type {!Acorn.TokenOrComment} */(tokenizer.nextToken());
        if (AT.lineComment(token) || AT.blockComment(token))
            continue;

        var tokenValue = params.content.substring(token.start, token.end);

        if (AT.identifier(token) && previousToken && (AT.identifier(previousToken, "get") || AT.identifier(previousToken, "set"))) {
            currentFunction = {
                line: tokenizer.tokenLineStart(),
                column: tokenizer.tokenColumnStart(),
                name : previousToken.value + " " + tokenValue
            };
            addedFunction = true;
            previousIdentifier = null;
        } else if (AT.identifier(token)) {
            previousIdentifier = tokenValue;
            if (tokenValue && previousToken && AT.keyword(previousToken, "function")) {
                // A named function: "function f...".
                currentFunction = {
                    line: tokenizer.tokenLineStart(),
                    column: tokenizer.tokenColumnStart(),
                    name: tokenValue
                };
                addedFunction = true;
                previousIdentifier = null;
            }
        } else if (AT.keyword(token, "function") && previousIdentifier && previousToken && AT.punctuator(previousToken, ":=")) {
            // Anonymous function assigned to an identifier: "...f = function..."
            // or "funcName: function...".
            currentFunction = {
                line: tokenizer.tokenLineStart(),
                column: tokenizer.tokenColumnStart(),
                name: previousIdentifier
            };
            addedFunction = true;
            previousIdentifier = null;
        } else if (AT.punctuator(token, ".") && previousToken && AT.identifier(previousToken))
            previousIdentifier += ".";
        else if (AT.punctuator(token, "(") && addedFunction)
            isReadingArguments = true;
        if (isReadingArguments && tokenValue)
            argumentsText += tokenValue;

        if (AT.punctuator(token, ")") && isReadingArguments) {
            addedFunction = false;
            isReadingArguments = false;
            currentFunction.arguments = argumentsText.replace(/,[\r\n\s]*/g, ", ").replace(/([^,])[\r\n\s]+/g, "$1");
            argumentsText = "";
            outlineChunk.push(currentFunction);
        }

        previousToken = token;
        processedChunkCharacters += token.end - token.start;

        if (processedChunkCharacters >= chunkSize) {
            postMessage({ chunk: outlineChunk, isLastChunk: false });
            outlineChunk = [];
            processedChunkCharacters = 0;
        }
    }

    postMessage({ chunk: outlineChunk, isLastChunk: true });
}

FormatterWorker.CSSParserStates = {
    Initial: "Initial",
    Selector: "Selector",
    Style: "Style",
    PropertyName: "PropertyName",
    PropertyValue: "PropertyValue",
    AtRule: "AtRule"
};

FormatterWorker.parseCSS = function(params)
{
    FormatterWorker._innerParseCSS(params.content, postMessage);
}

FormatterWorker._innerParseCSS = function(text, chunkCallback)
{
    var chunkSize = 100000; // characters per data chunk
    var lines = text.split("\n");
    var rules = [];
    var processedChunkCharacters = 0;

    var state = FormatterWorker.CSSParserStates.Initial;
    var rule;
    var property;
    var UndefTokenType = {};

    var disabledRules = [];
    function disabledRulesCallback(chunk)
    {
        disabledRules = disabledRules.concat(chunk.chunk);
    }

    /**
     * @param {string} tokenValue
     * @param {?string} tokenTypes
     * @param {number} column
     * @param {number} newColumn
     */
    function processToken(tokenValue, tokenTypes, column, newColumn)
    {
        var tokenType = tokenTypes ? tokenTypes.split(" ").keySet() : UndefTokenType;
        switch (state) {
        case FormatterWorker.CSSParserStates.Initial:
            if (tokenType["qualifier"] || tokenType["builtin"] || tokenType["tag"]) {
                rule = {
                    selectorText: tokenValue,
                    lineNumber: lineNumber,
                    columnNumber: column,
                    properties: [],
                };
                state = FormatterWorker.CSSParserStates.Selector;
            } else if (tokenType["def"]) {
                rule = {
                    atRule: tokenValue,
                    lineNumber: lineNumber,
                    columnNumber: column,
                };
                state = FormatterWorker.CSSParserStates.AtRule;
            }
            break;
        case FormatterWorker.CSSParserStates.Selector:
            if (tokenValue === "{" && tokenType === UndefTokenType) {
                rule.selectorText = rule.selectorText.trim();
                state = FormatterWorker.CSSParserStates.Style;
            } else {
                rule.selectorText += tokenValue;
            }
            break;
        case FormatterWorker.CSSParserStates.AtRule:
            if ((tokenValue === ";" || tokenValue === "{") && tokenType === UndefTokenType) {
                rule.atRule = rule.atRule.trim();
                rules.push(rule);
                state = FormatterWorker.CSSParserStates.Initial;
            } else {
                rule.atRule += tokenValue;
            }
            break;
        case FormatterWorker.CSSParserStates.Style:
            if (tokenType["meta"] || tokenType["property"]) {
                property = {
                    name: tokenValue,
                    value: "",
                    range: createRange(lineNumber, column),
                    nameRange: createRange(lineNumber, column)
                };
                state = FormatterWorker.CSSParserStates.PropertyName;
            } else if (tokenValue === "}" && tokenType === UndefTokenType) {
                rules.push(rule);
                state = FormatterWorker.CSSParserStates.Initial;
            } else if (tokenType["comment"]) {
                // The |processToken| is called per-line, so no token spans more then one line.
                // Support only a one-line comments.
                if (tokenValue.substring(0, 2) !== "/*" || tokenValue.substring(tokenValue.length - 2) !== "*/")
                    break;
                var uncommentedText = tokenValue.substring(2, tokenValue.length - 2);
                var fakeRule = "a{\n" + uncommentedText + "}";
                disabledRules = [];
                FormatterWorker._innerParseCSS(fakeRule, disabledRulesCallback);
                if (disabledRules.length === 1 && disabledRules[0].properties.length === 1) {
                    var disabledProperty = disabledRules[0].properties[0];
                    disabledProperty.disabled = true;
                    disabledProperty.range = createRange(lineNumber, column);
                    disabledProperty.range.endColumn = newColumn;
                    var lineOffset = lineNumber - 1;
                    var columnOffset = column + 2;
                    disabledProperty.nameRange.startLine += lineOffset;
                    disabledProperty.nameRange.startColumn += columnOffset;
                    disabledProperty.nameRange.endLine += lineOffset;
                    disabledProperty.nameRange.endColumn += columnOffset;
                    disabledProperty.valueRange.startLine += lineOffset;
                    disabledProperty.valueRange.startColumn += columnOffset;
                    disabledProperty.valueRange.endLine += lineOffset;
                    disabledProperty.valueRange.endColumn += columnOffset;
                    rule.properties.push(disabledProperty);
                }
            }
            break;
        case FormatterWorker.CSSParserStates.PropertyName:
            if (tokenValue === ":" && tokenType === UndefTokenType) {
                property.name = property.name.trim();
                property.nameRange.endLine = lineNumber;
                property.nameRange.endColumn = column;
                property.valueRange = createRange(lineNumber, newColumn);
                state = FormatterWorker.CSSParserStates.PropertyValue;
            } else if (tokenType["property"]) {
                property.name += tokenValue;
            }
            break;
        case FormatterWorker.CSSParserStates.PropertyValue:
            if ((tokenValue === ";" || tokenValue === "}") && tokenType === UndefTokenType) {
                property.value = property.value.trim();
                property.valueRange.endLine = lineNumber;
                property.valueRange.endColumn = column;
                property.range.endLine = lineNumber;
                property.range.endColumn = tokenValue === ";" ? newColumn : column;
                rule.properties.push(property);
                if (tokenValue === "}") {
                    rules.push(rule);
                    state = FormatterWorker.CSSParserStates.Initial;
                } else {
                    state = FormatterWorker.CSSParserStates.Style;
                }
            } else if (!tokenType["comment"]) {
                property.value += tokenValue;
            }
            break;
        default:
            console.assert(false, "Unknown CSS parser state.");
        }
        processedChunkCharacters += newColumn - column;
        if (processedChunkCharacters > chunkSize) {
            chunkCallback({ chunk: rules, isLastChunk: false });
            rules = [];
            processedChunkCharacters = 0;
        }
    }
    var tokenizer = FormatterWorker.createTokenizer("text/css");
    var lineNumber;
    for (lineNumber = 0; lineNumber < lines.length; ++lineNumber) {
        var line = lines[lineNumber];
        tokenizer(line, processToken);
    }
    chunkCallback({ chunk: rules, isLastChunk: true });

    /**
     * @return {!{startLine: number, startColumn: number, endLine: number, endColumn: number}}
     */
    function createRange(lineNumber, columnNumber)
    {
        return {
            startLine: lineNumber,
            startColumn: columnNumber,
            endLine: lineNumber,
            endColumn: columnNumber
        };
    }
}

/**
 * @param {string} content
 * @param {!{original: !Array.<number>, formatted: !Array.<number>}} mapping
 * @param {number} offset
 * @param {number} formattedOffset
 * @param {string} indentString
 * @return {string}
 */
FormatterWorker._formatScript = function(content, mapping, offset, formattedOffset, indentString)
{
    var formattedContent;
    try {
        var builder = new FormatterWorker.JavaScriptFormattedContentBuilder(content, mapping, offset, formattedOffset, indentString);
        var formatter = new FormatterWorker.JavaScriptFormatter(content, builder);
        formatter.format();
        formattedContent = builder.content();
    } catch (e) {
        console.error(e);
        formattedContent = content;
    }
    return formattedContent;
}

/**
 * @param {string} content
 * @param {!{original: !Array.<number>, formatted: !Array.<number>}} mapping
 * @param {number} offset
 * @param {number} formattedOffset
 * @param {string} indentString
 * @return {string}
 */
FormatterWorker._formatCSS = function(content, mapping, offset, formattedOffset, indentString)
{
    var formattedContent;
    try {
        var builder = new FormatterWorker.CSSFormattedContentBuilder(content, mapping, offset, formattedOffset, indentString);
        var formatter = new FormatterWorker.CSSFormatter(content, builder);
        formatter.format();
        formattedContent = builder.content();
    } catch (e) {
        formattedContent = content;
    }
    return formattedContent;
}

/**
 * @constructor
 * @param {string} indentString
 */
FormatterWorker.HTMLFormatter = function(indentString)
{
    this._indentString = indentString;
}

FormatterWorker.HTMLFormatter.prototype = {
    /**
     * @param {string} content
     * @return {!{content: string, mapping: {original: !Array.<number>, formatted: !Array.<number>}}}
     */
    format: function(content)
    {
        this.line = content;
        this._content = content;
        this._formattedContent = "";
        this._mapping = { original: [0], formatted: [0] };
        this._position = 0;

        var scriptOpened = false;
        var styleOpened = false;
        var tokenizer = FormatterWorker.createTokenizer("text/html");
        var accumulatedTokenValue = "";
        var accumulatedTokenStart = 0;

        /**
         * @this {FormatterWorker.HTMLFormatter}
         */
        function processToken(tokenValue, tokenType, tokenStart, tokenEnd) {
            if (!tokenType)
                return;
            tokenType = tokenType.split(" ").keySet();
            if (!tokenType["tag"])
                return;
            if (tokenType["bracket"] && (tokenValue === "<" || tokenValue === "</")) {
                accumulatedTokenValue = tokenValue;
                accumulatedTokenStart = tokenStart;
                return;
            }
            accumulatedTokenValue = accumulatedTokenValue + tokenValue.toLowerCase();
            if (accumulatedTokenValue === "<script") {
                scriptOpened = true;
            } else if (scriptOpened && tokenValue === ">") {
                scriptOpened = false;
                this._scriptStarted(tokenEnd);
            } else if (accumulatedTokenValue === "</script") {
                this._scriptEnded(accumulatedTokenStart);
            } else if (accumulatedTokenValue === "<style") {
                styleOpened = true;
            } else if (styleOpened && tokenValue === ">") {
                styleOpened = false;
                this._styleStarted(tokenEnd);
            } else if (accumulatedTokenValue === "</style") {
                this._styleEnded(accumulatedTokenStart);
            }
            accumulatedTokenValue = "";
        }
        tokenizer(content, processToken.bind(this));

        this._formattedContent += this._content.substring(this._position);
        return { content: this._formattedContent, mapping: this._mapping };
    },

    /**
     * @param {number} cursor
     */
    _scriptStarted: function(cursor)
    {
        this._handleSubFormatterStart(cursor);
    },

    /**
     * @param {number} cursor
     */
    _scriptEnded: function(cursor)
    {
        this._handleSubFormatterEnd(FormatterWorker._formatScript, cursor);
    },

    /**
     * @param {number} cursor
     */
    _styleStarted: function(cursor)
    {
        this._handleSubFormatterStart(cursor);
    },

    /**
     * @param {number} cursor
     */
    _styleEnded: function(cursor)
    {
        this._handleSubFormatterEnd(FormatterWorker._formatCSS, cursor);
    },

    /**
     * @param {number} cursor
     */
    _handleSubFormatterStart: function(cursor)
    {
        this._formattedContent += this._content.substring(this._position, cursor);
        this._formattedContent += "\n";
        this._position = cursor;
    },

    /**
     * @param {function(string, !{formatted: !Array.<number>, original: !Array.<number>}, number, number, string)} formatFunction
     * @param {number} cursor
     */
    _handleSubFormatterEnd: function(formatFunction, cursor)
    {
        if (cursor === this._position)
            return;

        var scriptContent = this._content.substring(this._position, cursor);
        this._mapping.original.push(this._position);
        this._mapping.formatted.push(this._formattedContent.length);
        var formattedScriptContent = formatFunction(scriptContent, this._mapping, this._position, this._formattedContent.length, this._indentString);

        this._formattedContent += formattedScriptContent;
        this._position = cursor;
    }
}
