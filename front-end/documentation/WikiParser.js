// Copyright 2014 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

/**
 * @constructor
 * @param {string} wikiMarkupText
 */
WebInspector.WikiParser = function(wikiMarkupText)
{
    var text = wikiMarkupText;
    this._tokenizer = new WebInspector.WikiParser.Tokenizer(text);
    this._document = this._parse();
}

/**
 * @constructor
 */
WebInspector.WikiParser.Section = function()
{
    /** @type {string} */
    this.title;

    /** @type {?WebInspector.WikiParser.Values} */
    this.values;

    /** @type {?WebInspector.WikiParser.ArticleElement} */
    this.singleValue;
}

/**
 * @constructor
 */
WebInspector.WikiParser.Field = function()
{
    /** @type {string} */
    this.name;

    /** @type {?WebInspector.WikiParser.FieldValue} */
    this.value;
}

/** @typedef {(?WebInspector.WikiParser.ArticleElement|!Array.<!WebInspector.WikiParser.Section>)} */
WebInspector.WikiParser.FieldValue;

/** @typedef {?Object.<string, !WebInspector.WikiParser.FieldValue>} */
WebInspector.WikiParser.Values;

/** @typedef {(?WebInspector.WikiParser.Value|?WebInspector.WikiParser.ArticleElement)} */
WebInspector.WikiParser.Value;

/**
 * @package
 * @enum {string}
 */
WebInspector.WikiParser.TokenType = {
    Text: "Text",
    OpeningTable: "OpeningTable",
    ClosingTable: "ClosingTable",
    RowSeparator: "RowSeparator",
    CellSeparator: "CellSeparator",
    NameSeparator: "NameSeparator",
    OpeningCurlyBrackets: "OpeningCurlyBrackets",
    ClosingCurlyBrackets: "ClosingCurlyBrackets",
    Exclamation: "Exclamation",
    OpeningSquareBrackets: "OpeningSquareBrackets",
    ClosingBrackets: "ClosingBrackets",
    EqualSign: "EqualSign",
    EqualSignInCurlyBrackets: "EqualSignInCurlyBrackets",
    VerticalLine: "VerticalLine",
    DoubleQuotes: "DoubleQuotes",
    TripleQuotes: "TripleQuotes",
    OpeningCodeTag: "OpeningCodeTag",
    ClosingCodeTag: "ClosingCodeTag",
    Bullet: "Bullet",
    LineEnd: "LineEnd",
    CodeBlock: "CodeBlock",
    Space: "Space"
}

/**
 * @constructor
 * @param {string} result
 * @param {!WebInspector.WikiParser.TokenType} type
 */
WebInspector.WikiParser.Token = function(result, type)
{
    this._value = result;
    this._type = type;
}

WebInspector.WikiParser.Token.prototype = {
    /**
     * @return {string}
     */
    value: function()
    {
        return this._value;
    },

    /**
     * @return {!WebInspector.WikiParser.TokenType}
     */
    type: function()
    {
        return this._type;
    }
}

/**
 * @constructor
 * @param {string} str
 */
WebInspector.WikiParser.Tokenizer = function(str)
{
    this._text = str;
    this._oldText = str;
    this._token = this._internalNextToken();
    this._mode = WebInspector.WikiParser.Tokenizer.Mode.Normal;
}

/**
 * @package
 * @enum {string}
 */
WebInspector.WikiParser.Tokenizer.Mode = {
    Normal: "Normal",
    Link: "Link"
}

WebInspector.WikiParser.Tokenizer.prototype = {
    /**
     * @param {!WebInspector.WikiParser.Tokenizer.Mode} mode
     */
    _setMode: function(mode)
    {
        this._mode = mode;
        this._text = this._oldText;
        this._token = this._internalNextToken();
    },

    /**
     * @return {boolean}
     */
    _isNormalMode: function()
    {
        return this._mode === WebInspector.WikiParser.Tokenizer.Mode.Normal;
    },

    /**
     * @return {!WebInspector.WikiParser.Token}
     */
    peekToken: function()
    {
        return this._token;
    },

    /**
     * @return {!WebInspector.WikiParser.Token}
     */
    nextToken: function()
    {
        var token = this._token;
        this._oldText = this._text;
        this._token = this._internalNextToken();
        return token;
    },

    /**
     * @return {!WebInspector.WikiParser.Token}
     */
    _internalNextToken: function()
    {
        if (WebInspector.WikiParser.newLineWithSpace.test(this._text)) {
            var result = WebInspector.WikiParser.newLineWithSpace.exec(this._text);
            var begin = result.index;
            var end = this._text.length;
            var lineEnd = WebInspector.WikiParser.newLineWithoutSpace.exec(this._text);
            if (lineEnd)
                end = lineEnd.index;
            var token = this._text.substring(begin, end).replace(/\n /g, "\n").replace(/{{=}}/g, "=");
            this._text = this._text.substring(end + 1);
            return new WebInspector.WikiParser.Token(token, WebInspector.WikiParser.TokenType.CodeBlock);
        }

        for (var i = 0; i < WebInspector.WikiParser._tokenDescriptors.length; ++i) {
            if (this._isNormalMode() && WebInspector.WikiParser._tokenDescriptors[i].type === WebInspector.WikiParser.TokenType.Space)
                continue;
            var result = WebInspector.WikiParser._tokenDescriptors[i].regex.exec(this._text);
            if (result) {
                this._text = this._text.substring(result.index + result[0].length);
                return new WebInspector.WikiParser.Token(result[0], WebInspector.WikiParser._tokenDescriptors[i].type);
            }
        }

        for (var lastIndex = 0; lastIndex < this._text.length; ++lastIndex) {
            var testString = this._text.substring(lastIndex);
            for (var i = 0; i < WebInspector.WikiParser._tokenDescriptors.length; ++i) {
                if (this._isNormalMode() && WebInspector.WikiParser._tokenDescriptors[i].type === WebInspector.WikiParser.TokenType.Space)
                    continue;
                if (WebInspector.WikiParser._tokenDescriptors[i].regex.test(testString)) {
                    var token = this._text.substring(0, lastIndex);
                    this._text = this._text.substring(lastIndex);
                    return new WebInspector.WikiParser.Token(token, WebInspector.WikiParser.TokenType.Text);
                }
            }
        }

        var token = this._text;
        this._text = "";
        return new WebInspector.WikiParser.Token(token, WebInspector.WikiParser.TokenType.Text);
    },

    /**
     * @return {!WebInspector.WikiParser.Tokenizer}
     */
    clone: function()
    {
        var tokenizer = new WebInspector.WikiParser.Tokenizer(this._text);
        tokenizer._token = this._token;
        tokenizer._text = this._text;
        tokenizer._oldText = this._oldText;
        tokenizer._mode = this._mode;
        return tokenizer;
    },

    /**
     * @return {boolean}
     */
    hasMoreTokens: function()
    {
        return !!this._text.length;
    }
}

WebInspector.WikiParser.openingTable = /^\n{{{!}}/;
WebInspector.WikiParser.closingTable = /^\n{{!}}}/;
WebInspector.WikiParser.cellSeparator = /^\n{{!}}/;
WebInspector.WikiParser.rowSeparator = /^\n{{!}}-/;
WebInspector.WikiParser.nameSeparator = /^\n!/;
WebInspector.WikiParser.exclamation = /^{{!}}/;
WebInspector.WikiParser.openingCurlyBrackets = /^{{/;
WebInspector.WikiParser.equalSign = /^=/;
WebInspector.WikiParser.equalSignInCurlyBrackets = /^{{=}}/;
WebInspector.WikiParser.closingCurlyBrackets = /^\s*}}/;
WebInspector.WikiParser.oneOpeningSquareBracket = /^\n*\[/;
WebInspector.WikiParser.twoOpeningSquareBrackets = /^\n*\[\[/;
WebInspector.WikiParser.oneClosingBracket = /^\n*\]/;
WebInspector.WikiParser.twoClosingBrackets = /^\n*\]\]/;
WebInspector.WikiParser.tripleQuotes = /^\n*'''/;
WebInspector.WikiParser.doubleQuotes = /^\n*''/;
WebInspector.WikiParser.openingCodeTag = /^<code\s*>/;
WebInspector.WikiParser.closingCodeTag = /^<\/code\s*>/;
WebInspector.WikiParser.closingBullet = /^\*/;
WebInspector.WikiParser.lineEnd = /^\n/;
WebInspector.WikiParser.verticalLine = /^\n*\|/;
WebInspector.WikiParser.newLineWithSpace = /^\n [^ ]/;
WebInspector.WikiParser.newLineWithoutSpace = /\n[^ ]/;
WebInspector.WikiParser.space = /^ /;

/**
 * @constructor
 * @param {!RegExp} regex
 * @param {!WebInspector.WikiParser.TokenType} type
 */
WebInspector.WikiParser.TokenDescriptor = function(regex, type)
{
    this.regex = regex;
    this.type = type;
}

WebInspector.WikiParser._tokenDescriptors = [
    new WebInspector.WikiParser.TokenDescriptor(WebInspector.WikiParser.closingTable, WebInspector.WikiParser.TokenType.ClosingTable),
    new WebInspector.WikiParser.TokenDescriptor(WebInspector.WikiParser.openingTable, WebInspector.WikiParser.TokenType.OpeningTable),
    new WebInspector.WikiParser.TokenDescriptor(WebInspector.WikiParser.rowSeparator, WebInspector.WikiParser.TokenType.RowSeparator),
    new WebInspector.WikiParser.TokenDescriptor(WebInspector.WikiParser.cellSeparator, WebInspector.WikiParser.TokenType.CellSeparator),
    new WebInspector.WikiParser.TokenDescriptor(WebInspector.WikiParser.nameSeparator, WebInspector.WikiParser.TokenType.NameSeparator),
    new WebInspector.WikiParser.TokenDescriptor(WebInspector.WikiParser.exclamation, WebInspector.WikiParser.TokenType.Exclamation),
    new WebInspector.WikiParser.TokenDescriptor(WebInspector.WikiParser.equalSignInCurlyBrackets, WebInspector.WikiParser.TokenType.EqualSignInCurlyBrackets),
    new WebInspector.WikiParser.TokenDescriptor(WebInspector.WikiParser.equalSign, WebInspector.WikiParser.TokenType.EqualSign),
    new WebInspector.WikiParser.TokenDescriptor(WebInspector.WikiParser.openingTable, WebInspector.WikiParser.TokenType.OpeningTable),
    new WebInspector.WikiParser.TokenDescriptor(WebInspector.WikiParser.openingCurlyBrackets, WebInspector.WikiParser.TokenType.OpeningCurlyBrackets),
    new WebInspector.WikiParser.TokenDescriptor(WebInspector.WikiParser.verticalLine, WebInspector.WikiParser.TokenType.VerticalLine),
    new WebInspector.WikiParser.TokenDescriptor(WebInspector.WikiParser.closingCurlyBrackets, WebInspector.WikiParser.TokenType.ClosingCurlyBrackets),
    new WebInspector.WikiParser.TokenDescriptor(WebInspector.WikiParser.twoOpeningSquareBrackets, WebInspector.WikiParser.TokenType.OpeningSquareBrackets),
    new WebInspector.WikiParser.TokenDescriptor(WebInspector.WikiParser.twoClosingBrackets, WebInspector.WikiParser.TokenType.ClosingBrackets),
    new WebInspector.WikiParser.TokenDescriptor(WebInspector.WikiParser.oneOpeningSquareBracket, WebInspector.WikiParser.TokenType.OpeningSquareBrackets),
    new WebInspector.WikiParser.TokenDescriptor(WebInspector.WikiParser.oneClosingBracket, WebInspector.WikiParser.TokenType.ClosingBrackets),
    new WebInspector.WikiParser.TokenDescriptor(WebInspector.WikiParser.newLineWithSpace, WebInspector.WikiParser.TokenType.CodeBlock),
    new WebInspector.WikiParser.TokenDescriptor(WebInspector.WikiParser.tripleQuotes, WebInspector.WikiParser.TokenType.TripleQuotes),
    new WebInspector.WikiParser.TokenDescriptor(WebInspector.WikiParser.doubleQuotes, WebInspector.WikiParser.TokenType.DoubleQuotes),
    new WebInspector.WikiParser.TokenDescriptor(WebInspector.WikiParser.openingCodeTag, WebInspector.WikiParser.TokenType.OpeningCodeTag),
    new WebInspector.WikiParser.TokenDescriptor(WebInspector.WikiParser.closingCodeTag, WebInspector.WikiParser.TokenType.ClosingCodeTag),
    new WebInspector.WikiParser.TokenDescriptor(WebInspector.WikiParser.closingBullet, WebInspector.WikiParser.TokenType.Bullet),
    new WebInspector.WikiParser.TokenDescriptor(WebInspector.WikiParser.lineEnd, WebInspector.WikiParser.TokenType.LineEnd),
    new WebInspector.WikiParser.TokenDescriptor(WebInspector.WikiParser.space, WebInspector.WikiParser.TokenType.Space)
]

WebInspector.WikiParser.prototype = {
    /**
     * @return {!Object}
     */
    document: function()
    {
        return this._document;
    },

    /**
     * @return {?WebInspector.WikiParser.TokenType}
     */
    _secondTokenType: function()
    {
        var tokenizer = this._tokenizer.clone();
        if (!tokenizer.hasMoreTokens())
            return null;
        tokenizer.nextToken();
        if (!tokenizer.hasMoreTokens())
            return null;
        return tokenizer.nextToken().type();
    },

    /**
     * @return {!Object.<string, ?WebInspector.WikiParser.Value>}
     */
    _parse: function()
    {
        var obj = {};
        while (this._tokenizer.hasMoreTokens()) {
            var section = this._parseSection();
            if (section.title)
                obj[section.title] = section.singleValue || section.values;
        }
        return obj;
    },

    /**
     * @return {!WebInspector.WikiParser.Section}
     */
    _parseSection: function()
    {
        var section = new WebInspector.WikiParser.Section();
        if (!this._tokenizer.hasMoreTokens() || this._tokenizer.nextToken().type() !== WebInspector.WikiParser.TokenType.OpeningCurlyBrackets)
            return section;

        var title = this._deleteTrailingSpaces(this._parseSectionTitle());
        if (!title.length)
            return section;
        section.title = title;
        if (this._tokenizer.peekToken().type() === WebInspector.WikiParser.TokenType.ClosingCurlyBrackets) {
            this._tokenizer.nextToken();
            return section;
        }
        var secondTokenType = this._secondTokenType();
        if (!secondTokenType || secondTokenType !== WebInspector.WikiParser.TokenType.EqualSign) {
            section.singleValue = this._parseMarkupText();
        } else {
            section.values = {};
            while (this._tokenizer.hasMoreTokens()) {
                var field = this._parseField();
                section.values[field.name] = field.value;
                if (this._tokenizer.peekToken().type() === WebInspector.WikiParser.TokenType.ClosingCurlyBrackets) {
                    this._tokenizer.nextToken();
                    return section;
                }
            }
        }
        var token = this._tokenizer.nextToken();
        if (token.type() !== WebInspector.WikiParser.TokenType.ClosingCurlyBrackets)
            throw new Error("Two closing curly brackets expected; found " + token.value());

        return section;
    },

    /**
     * @return {!WebInspector.WikiParser.Field}
     */
    _parseField: function()
    {
        var field = new WebInspector.WikiParser.Field();
        field.name = this._parseFieldName();
        var token = this._tokenizer.peekToken();
        switch (token.type()) {
        case WebInspector.WikiParser.TokenType.OpeningCurlyBrackets:
            field.value = this._parseArray();
            break;
        case WebInspector.WikiParser.TokenType.LineEnd:
            this._tokenizer.nextToken();
            break;
        case WebInspector.WikiParser.TokenType.ClosingCurlyBrackets:
            return field;
        default:
            if (field.name.toUpperCase() === "CODE")
                field.value = this._parseExampleCode();
            else
                field.value = this._parseMarkupText();
        }
        return field;
    },

    /**
     * @return {!Array.<!WebInspector.WikiParser.Section>}
     */
    _parseArray: function()
    {
        var array = [];
        while (this._tokenizer.peekToken().type() === WebInspector.WikiParser.TokenType.OpeningCurlyBrackets)
            array.push(this._parseSection());
        if (this._tokenizer.peekToken().type() === WebInspector.WikiParser.TokenType.VerticalLine)
            this._tokenizer.nextToken();
        return array;
    },

    /**
     * @return {string}
     */
    _parseSectionTitle: function()
    {
        var title = "";
        while (this._tokenizer.hasMoreTokens()) {
            var token = this._tokenizer.peekToken();
            switch (token.type()) {
            case WebInspector.WikiParser.TokenType.ClosingCurlyBrackets:
                return title;
            case WebInspector.WikiParser.TokenType.VerticalLine:
                this._tokenizer.nextToken();
                return title;
            case WebInspector.WikiParser.TokenType.Text:
                title += this._tokenizer.nextToken().value();
                break;
            default:
                throw new Error("Title could not be parsed. Unexpected token " + token.value());
            }
        }
        return title;
    },

    /**
     * @return {string}
     */
    _parseFieldName: function()
    {
        var name = "";
        while (this._tokenizer.hasMoreTokens()) {
            var token = this._tokenizer.peekToken();
            switch (token.type()) {
            case WebInspector.WikiParser.TokenType.ClosingCurlyBrackets:
                return name;
            case WebInspector.WikiParser.TokenType.EqualSign:
                this._tokenizer.nextToken();
                return name;
            case WebInspector.WikiParser.TokenType.VerticalLine:
            case WebInspector.WikiParser.TokenType.Text:
                name += this._tokenizer.nextToken().value();
                break;
            default:
                throw new Error("Name could not be parsed. Unexpected token " + token.value());
            }
        }
        return name;
    },

    /**
     * @return {!WebInspector.WikiParser.Block}
     */
    _parseExampleCode: function()
    {
        var code = "";

        /**
         * @return {!WebInspector.WikiParser.Block}
         */
        function wrapIntoArticleElement()
        {
            var plainText = new WebInspector.WikiParser.PlainText(code);
            var block = new WebInspector.WikiParser.Block([plainText])
            var articleElement = new WebInspector.WikiParser.Block([block]);
            return articleElement;
        }

        while (this._tokenizer.hasMoreTokens()) {
            var token = this._tokenizer.peekToken();
            switch (token.type()) {
            case WebInspector.WikiParser.TokenType.ClosingCurlyBrackets:
                return wrapIntoArticleElement();
            case WebInspector.WikiParser.TokenType.VerticalLine:
                this._tokenizer.nextToken();
                return wrapIntoArticleElement();
            case WebInspector.WikiParser.TokenType.Exclamation:
                this._tokenizer.nextToken();
                code += "|";
                break;
            case WebInspector.WikiParser.TokenType.EqualSignInCurlyBrackets:
                this._tokenizer.nextToken();
                code += "=";
                break;
            default:
                this._tokenizer.nextToken();
                code += token.value();
            }
        }
        return wrapIntoArticleElement();
    },

    /**
     * @return {?WebInspector.WikiParser.Block}
     */
    _parseMarkupText: function()
    {
        var children = [];
        var blockChildren = [];
        var text = "";

        /**
         * @this {WebInspector.WikiParser}
         */
        function processSimpleText()
        {
            var currentText = this._deleteTrailingSpaces(text);
            if (!currentText.length)
                return;
            var simpleText = new WebInspector.WikiParser.PlainText(currentText);
            blockChildren.push(simpleText);
            text = "";
        }

        function processBlock()
        {
            if (blockChildren.length) {
                children.push(new WebInspector.WikiParser.Block(blockChildren));
                blockChildren = [];
            }
        }

        while (this._tokenizer.hasMoreTokens()) {
            var token = this._tokenizer.peekToken();
            switch (token.type()) {
            case WebInspector.WikiParser.TokenType.RowSeparator:
            case WebInspector.WikiParser.TokenType.NameSeparator:
            case WebInspector.WikiParser.TokenType.CellSeparator:
            case WebInspector.WikiParser.TokenType.ClosingTable:
            case WebInspector.WikiParser.TokenType.VerticalLine:
            case WebInspector.WikiParser.TokenType.ClosingCurlyBrackets:
                if (token.type() === WebInspector.WikiParser.TokenType.VerticalLine)
                    this._tokenizer.nextToken();
                processSimpleText.call(this);
                processBlock();
                return new WebInspector.WikiParser.Block(children);
            case WebInspector.WikiParser.TokenType.TripleQuotes:
                this._tokenizer.nextToken();
                processSimpleText.call(this);
                blockChildren.push(this._parseHighlight());
                break;
            case WebInspector.WikiParser.TokenType.DoubleQuotes:
                this._tokenizer.nextToken();
                processSimpleText.call(this);
                blockChildren.push(this._parseItalics());
                break;
            case WebInspector.WikiParser.TokenType.OpeningSquareBrackets:
                processSimpleText.call(this);
                blockChildren.push(this._parseLink());
                break;
            case WebInspector.WikiParser.TokenType.OpeningCodeTag:
                this._tokenizer.nextToken();
                processSimpleText.call(this);
                blockChildren.push(this._parseCode());
                break;
            case WebInspector.WikiParser.TokenType.Bullet:
                this._tokenizer.nextToken();
                processSimpleText.call(this);
                processBlock();
                children.push(this._parseBullet());
                break;
            case WebInspector.WikiParser.TokenType.CodeBlock:
                this._tokenizer.nextToken();
                processSimpleText.call(this);
                processBlock();
                var code = new WebInspector.WikiParser.CodeBlock(this._trimLeadingNewLines(token.value()));
                children.push(code);
                break;
            case WebInspector.WikiParser.TokenType.LineEnd:
                this._tokenizer.nextToken();
                processSimpleText.call(this);
                processBlock();
                break;
            case WebInspector.WikiParser.TokenType.EqualSignInCurlyBrackets:
                this._tokenizer.nextToken();
                text += "=";
                break;
            case WebInspector.WikiParser.TokenType.Exclamation:
                this._tokenizer.nextToken();
                text += "|";
                break;
            case WebInspector.WikiParser.TokenType.OpeningTable:
                this._tokenizer.nextToken();
                processSimpleText.call(this);
                processBlock();
                children.push(this._parseTable());
                break;
            case WebInspector.WikiParser.TokenType.ClosingBrackets:
            case WebInspector.WikiParser.TokenType.Text:
            case WebInspector.WikiParser.TokenType.EqualSign:
                this._tokenizer.nextToken();
                text += token.value();
                break;
            default:
                this._tokenizer.nextToken();
                return null;
            }
        }

        processSimpleText.call(this);
        processBlock();

        return new WebInspector.WikiParser.Block(children);
    },

    /**
     * @return {!WebInspector.WikiParser.ArticleElement}
     */
    _parseLink: function()
    {
        var tokenizer = this._tokenizer.clone();
        this._tokenizer.nextToken();
        this._tokenizer._setMode(WebInspector.WikiParser.Tokenizer.Mode.Link);
        var url = "";
        var children = [];

        /**
         * @return {!WebInspector.WikiParser.ArticleElement}
         * @this {WebInspector.WikiParser}
         */
        function finalizeLink()
        {
            this._tokenizer._setMode(WebInspector.WikiParser.Tokenizer.Mode.Normal);
            return new WebInspector.WikiParser.Link(url, children);
        }

        /**
         * @return {!WebInspector.WikiParser.ArticleElement}
         * @this {WebInspector.WikiParser}
         */
        function recoverAsText()
        {
            this._tokenizer = tokenizer;
            return this._parseTextUntilBrackets();
        }

        while (this._tokenizer.hasMoreTokens()) {
            var token = this._tokenizer.nextToken();
            switch (token.type()) {
            case WebInspector.WikiParser.TokenType.ClosingBrackets:
                if (this._isLink(url))
                    return finalizeLink.call(this);
                return recoverAsText.call(this);
            case WebInspector.WikiParser.TokenType.VerticalLine:
            case WebInspector.WikiParser.TokenType.Space:
            case WebInspector.WikiParser.TokenType.Exclamation:
                if (this._isLink(url)) {
                    children.push(this._parseLinkName());
                    return finalizeLink.call(this);
                }
                return recoverAsText.call(this);
            default:
                url += token.value();
            }
        }

        return finalizeLink.call(this);
    },

    /**
     * @return {!WebInspector.WikiParser.Inline}
     */
    _parseLinkName: function()
    {
        var children = [];
        var text = "";

        /**
         * @this {WebInspector.WikiParser}
         */
        function processSimpleText()
        {
            text = this._deleteTrailingSpaces(text);
            if (!text.length)
                return;
            var simpleText = new WebInspector.WikiParser.PlainText(text);
            children.push(simpleText);
            text = "";
        }

        while (this._tokenizer.hasMoreTokens()) {
            var token = this._tokenizer.nextToken();
            switch (token.type()) {
            case WebInspector.WikiParser.TokenType.ClosingBrackets:
                processSimpleText.call(this);
                return new WebInspector.WikiParser.Inline(WebInspector.WikiParser.ArticleElement.Type.Inline, children);
            case WebInspector.WikiParser.TokenType.OpeningCodeTag:
                processSimpleText.call(this);
                children.push(this._parseCode());
                break;
            default:
                text += token.value();
                break;
            }
        }

        return new WebInspector.WikiParser.Inline(WebInspector.WikiParser.ArticleElement.Type.Inline, children);
    },

    /**
     * @return {!WebInspector.WikiParser.Inline}
     */
    _parseCode: function()
    {
        var children = [];
        var text = "";

        /**
         * @this {WebInspector.WikiParser}
         */
        function processSimpleText()
        {
            text = this._deleteTrailingSpaces(text);
            if (!text.length)
                return;
            var simpleText = new WebInspector.WikiParser.PlainText(text);
            children.push(simpleText);
            text = "";
        }

        while (this._tokenizer.hasMoreTokens()) {
            var token = this._tokenizer.peekToken();
            switch (token.type()) {
            case WebInspector.WikiParser.TokenType.ClosingCodeTag:
                this._tokenizer.nextToken();
                processSimpleText.call(this);
                var code = new WebInspector.WikiParser.Inline(WebInspector.WikiParser.ArticleElement.Type.Code, children);
                return code;
            case WebInspector.WikiParser.TokenType.OpeningSquareBrackets:
                processSimpleText.call(this);
                children.push(this._parseLink());
                break;
            default:
                this._tokenizer.nextToken();
                text += token.value();
            }
        }

        text = this._deleteTrailingSpaces(text);
        if (text.length)
            children.push(new WebInspector.WikiParser.PlainText(text));

        return new WebInspector.WikiParser.Inline(WebInspector.WikiParser.ArticleElement.Type.Code, children);
    },

    /**
     * @return {!WebInspector.WikiParser.Block}
     */
    _parseBullet: function()
    {
        var children = [];
        while (this._tokenizer.hasMoreTokens()) {
            var token = this._tokenizer.peekToken()
            switch (token.type()) {
            case WebInspector.WikiParser.TokenType.OpeningSquareBrackets:
                children.push(this._parseLink());
                break;
            case WebInspector.WikiParser.TokenType.OpeningCodeTag:
                this._tokenizer.nextToken();
                children.push(this._parseCode());
                break;
            case WebInspector.WikiParser.TokenType.LineEnd:
                this._tokenizer.nextToken();
                return new WebInspector.WikiParser.Block(children, true);
            default:
                this._tokenizer.nextToken();
                var text = this._deleteTrailingSpaces(token.value());
                if (text.length) {
                    var simpleText = new WebInspector.WikiParser.PlainText(text);
                    children.push(simpleText);
                    text = "";
                }
            }
        }

        return new WebInspector.WikiParser.Block(children, true);
    },

    /**
     * @return {!WebInspector.WikiParser.PlainText}
     */
    _parseHighlight: function()
    {
        var text = "";
        while (this._tokenizer.hasMoreTokens()) {
            var token = this._tokenizer.nextToken();
            if (token.type() === WebInspector.WikiParser.TokenType.TripleQuotes) {
                text = this._deleteTrailingSpaces(text);
                return new WebInspector.WikiParser.PlainText(text, true);
            } else {
                text += token.value();
            }
        }
        return new WebInspector.WikiParser.PlainText(text, true);
    },

    /**
     * @return {!WebInspector.WikiParser.PlainText}
     */
    _parseItalics: function()
    {
        var text = "";
        while (this._tokenizer.hasMoreTokens) {
            var token = this._tokenizer.nextToken();
            if (token.type() === WebInspector.WikiParser.TokenType.DoubleQuotes) {
                text = this._deleteTrailingSpaces(text);
                return new WebInspector.WikiParser.PlainText(text, false, true);
            } else {
                text += token.value();
            }
        }
        return new WebInspector.WikiParser.PlainText(text, false, true);
    },

    /**
     * @return {!WebInspector.WikiParser.PlainText}
     */
    _parseTextUntilBrackets: function()
    {
        var text = this._tokenizer.nextToken().value();
        while (this._tokenizer.hasMoreTokens()) {
            var token = this._tokenizer.peekToken();
            switch (token.type()) {
            case WebInspector.WikiParser.TokenType.VerticalLine:
                this._tokenizer.nextToken();
                return new WebInspector.WikiParser.PlainText(text);
            case WebInspector.WikiParser.TokenType.ClosingCurlyBrackets:
            case WebInspector.WikiParser.TokenType.OpeningSquareBrackets:
                return new WebInspector.WikiParser.PlainText(text);
            default:
                this._tokenizer.nextToken();
                text += token.value();
            }
        }

        return new WebInspector.WikiParser.PlainText(text);
    },

    /**
     * @return {!WebInspector.WikiParser.Table}
     */
    _parseTable: function()
    {
        var columnNames = [];
        var rows = [];
        while (this._tokenizer.hasMoreTokens() && this._tokenizer.peekToken().type() !== WebInspector.WikiParser.TokenType.RowSeparator)
            this._tokenizer.nextToken();
        if (!this._tokenizer.hasMoreTokens())
            throw new Error("Table could not be parsed");
        this._tokenizer.nextToken();

        while (this._tokenizer.peekToken().type() === WebInspector.WikiParser.TokenType.NameSeparator) {
            this._tokenizer.nextToken();
            columnNames.push(this._parseMarkupText());
        }
        while (this._tokenizer.peekToken().type() === WebInspector.WikiParser.TokenType.RowSeparator) {
            this._tokenizer.nextToken();
            var row = [];
            while (this._tokenizer.peekToken().type() === WebInspector.WikiParser.TokenType.CellSeparator) {
                this._tokenizer.nextToken();
                row.push(this._parseMarkupText());
            }
            rows.push(row);
        }

        var token = this._tokenizer.nextToken();
        if (token.type() !== WebInspector.WikiParser.TokenType.ClosingTable)
            throw new Error("Table could not be parsed. {{!}}} expected; found " + token.value());

        for (var i = 0; i < rows.length; ++i) {
            if (rows[i].length !== columnNames.length)
                throw new Error(String.sprintf("Table could not be parsed. Row %d has %d cells; expected %d.", i, rows[i].length, columnNames[i].length));
        }
        return new WebInspector.WikiParser.Table(columnNames, rows);
    },

    /**
     * @param {string} str
     * @return {string}
     */
    _deleteTrailingSpaces: function(str)
    {
        return str.replace(/[\n\r]*$/gm, "");
    },

    /**
     * @param {string} str
     * @return {string}
     */
    _trimLeadingNewLines: function(str)
    {
        return str.replace(/^\n*/, "");
    },

    /**
     * @param {string} str
     * @return {boolean}
     */
    _isInternalLink: function(str)
    {
        var len = str.length;
        return /^[a-zA-Z\/-]+$/.test(str);
    },

    /**
     * @param {string} str
     * @return {boolean}
     */
    _isLink: function(str)
    {
        if (this._isInternalLink(str))
            return true;
        var url = new WebInspector.ParsedURL(str);
        return url.isValid;
    }
}

/**
 * @constructor
 * @param {!WebInspector.WikiParser.ArticleElement.Type} type
 */
WebInspector.WikiParser.ArticleElement = function(type)
{
    this._type = type;
}

WebInspector.WikiParser.ArticleElement.prototype = {
    /**
     * @return {!WebInspector.WikiParser.ArticleElement.Type}
     */
    type: function()
    {
        return this._type;
    }
}

/**
 * @enum {string}
 */
WebInspector.WikiParser.ArticleElement.Type = {
    PlainText: "PlainText",
    Link: "Link",
    Code: "Code",
    Block: "Block",
    CodeBlock: "CodeBlock",
    Inline: "Inline",
    Table: "Table"
};

/**
 * @constructor
 * @extends {WebInspector.WikiParser.ArticleElement}
 * @param {!Array.<!WebInspector.WikiParser.ArticleElement>} columnNames
 * @param {!Array.<!Array.<!WebInspector.WikiParser.ArticleElement>>} rows
 */
WebInspector.WikiParser.Table = function(columnNames, rows)
{
    WebInspector.WikiParser.ArticleElement.call(this, WebInspector.WikiParser.ArticleElement.Type.Table);
    this._columnNames = columnNames;
    this._rows = rows;
}

WebInspector.WikiParser.Table.prototype = {
    /**
     * @return {!Array.<!WebInspector.WikiParser.ArticleElement>}
     */
    columnNames: function()
    {
        return this._columnNames;
    },

    /**
     * @return {!Array.<!Array.<!WebInspector.WikiParser.ArticleElement>>}
     */
    rows: function()
    {
        return this._rows;
    },

    __proto__: WebInspector.WikiParser.ArticleElement.prototype
}
/**
 * @constructor
 * @extends {WebInspector.WikiParser.ArticleElement}
 * @param {string} text
 * @param {boolean=} highlight
 * @param {boolean=} italic
 */
WebInspector.WikiParser.PlainText = function(text, highlight, italic)
{
    WebInspector.WikiParser.ArticleElement.call(this, WebInspector.WikiParser.ArticleElement.Type.PlainText);
    this._text = text.unescapeHTML();
    this._isHighlighted = highlight || false;
    this._isItalic = italic || false;
}

WebInspector.WikiParser.PlainText.prototype = {
    /**
     * @return {string}
     */
    text: function()
    {
        return this._text;
    },

    /**
     * @return {boolean}
     */
    isHighlighted: function()
    {
        return this._isHighlighted;
    },

    __proto__: WebInspector.WikiParser.ArticleElement.prototype
}

/**
 * @constructor
 * @extends {WebInspector.WikiParser.ArticleElement}
 * @param {!Array.<!WebInspector.WikiParser.ArticleElement>} children
 * @param {boolean=} hasBullet
 */
WebInspector.WikiParser.Block = function(children, hasBullet)
{
    WebInspector.WikiParser.ArticleElement.call(this, WebInspector.WikiParser.ArticleElement.Type.Block);
    this._children = children;
    this._hasBullet = hasBullet || false;
}

WebInspector.WikiParser.Block.prototype = {
    /**
     * @return {!Array.<!WebInspector.WikiParser.ArticleElement>}
     */
    children: function()
    {
        return this._children;
    },

    /**
     * @return {boolean}
     */
    hasChildren: function()
    {
        return !!this._children && !!this._children.length;
    },

    /**
     * @return {boolean}
     */
    hasBullet: function()
    {
        return this._hasBullet;
    },

    __proto__: WebInspector.WikiParser.ArticleElement.prototype
}

/**
 * @constructor
 * @extends {WebInspector.WikiParser.ArticleElement}
 * @param {string} text
 */
WebInspector.WikiParser.CodeBlock = function(text)
{
    WebInspector.WikiParser.ArticleElement.call(this, WebInspector.WikiParser.ArticleElement.Type.CodeBlock);
    this._code = text.unescapeHTML();
}

WebInspector.WikiParser.CodeBlock.prototype = {
    /**
     * @return {string}
     */
    code: function()
    {
        return this._code;
    },

    __proto__: WebInspector.WikiParser.ArticleElement.prototype
}

/**
 * @constructor
 * @extends {WebInspector.WikiParser.ArticleElement}
 * @param {!WebInspector.WikiParser.ArticleElement.Type} type
 * @param {!Array.<!WebInspector.WikiParser.ArticleElement>} children
 */
WebInspector.WikiParser.Inline = function(type, children)
{
    WebInspector.WikiParser.ArticleElement.call(this, type)
    this._children = children;
}

WebInspector.WikiParser.Inline.prototype = {
    /**
     * @return {!Array.<!WebInspector.WikiParser.ArticleElement>}
     */
    children: function()
    {
        return this._children;
    },

    __proto__: WebInspector.WikiParser.ArticleElement.prototype
}

/**
 * @constructor
 * @extends {WebInspector.WikiParser.Inline}
 * @param {string} url
 * @param {!Array.<!WebInspector.WikiParser.ArticleElement>} children
 */
WebInspector.WikiParser.Link = function(url, children)
{
    WebInspector.WikiParser.Inline.call(this, WebInspector.WikiParser.ArticleElement.Type.Link, children);
    this._url = url;
}

WebInspector.WikiParser.Link.prototype = {
    /**
     * @return {string}
     */
    url : function()
    {
        return this._url;
    },

    __proto__: WebInspector.WikiParser.Inline.prototype
}
