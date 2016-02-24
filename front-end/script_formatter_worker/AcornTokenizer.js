// Copyright (c) 2014 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

/**
 * @constructor
 * @param {string} content
 */
FormatterWorker.AcornTokenizer = function(content)
{
    this._content = content;
    this._comments = [];
    this._tokenizer = acorn.tokenizer(this._content, { ecmaVersion: 6, onComment: this._comments });
    this._lineEndings = this._content.lineEndings();
    this._lineNumber = 0;
    this._tokenLineStart = 0;
    this._tokenLineEnd = 0;
    this._nextTokenInternal();
}

/**
 * @param {!Acorn.TokenOrComment} token
 * @param {string=} values
 * @return {boolean}
 */
FormatterWorker.AcornTokenizer.punctuator = function(token, values)
{
    return token.type !== acorn.tokTypes.num &&
        token.type !== acorn.tokTypes.regexp &&
        token.type !== acorn.tokTypes.string &&
        token.type !== acorn.tokTypes.name &&
        (!values || (token.type.label.length === 1 && values.indexOf(token.type.label) !== -1));
}

/**
 * @param {!Acorn.TokenOrComment} token
 * @param {string=} keyword
 * @return {boolean}
 */
FormatterWorker.AcornTokenizer.keyword = function(token, keyword)
{
    return !!token.type.keyword && token.type !== acorn.tokTypes._true && token.type !== acorn.tokTypes._false &&
        (!keyword || token.type.keyword === keyword);
}

/**
 * @param {!Acorn.TokenOrComment} token
 * @param {string=} identifier
 * @return {boolean}
 */
FormatterWorker.AcornTokenizer.identifier = function(token, identifier)
{
    return token.type === acorn.tokTypes.name && (!identifier || token.value === identifier);
}

/**
 * @param {!Acorn.TokenOrComment} token
 * @return {boolean}
 */
FormatterWorker.AcornTokenizer.lineComment = function(token)
{
    return token.type === "Line";
}

/**
 * @param {!Acorn.TokenOrComment} token
 * @return {boolean}
 */
FormatterWorker.AcornTokenizer.blockComment = function(token)
{
    return token.type === "Block";
}

FormatterWorker.AcornTokenizer.prototype = {
    /**
     * @return {!Acorn.TokenOrComment}
     */
    _nextTokenInternal: function()
    {
        if (this._comments.length)
            return this._comments.shift();
        var token = this._bufferedToken;

        this._bufferedToken = this._tokenizer.getToken();
        return token;
    },

    /**
     * @param {number} position
     * @return {number}
     */
    _rollLineNumberToPosition: function(position)
    {
        while (this._lineNumber + 1 < this._lineEndings.length && position > this._lineEndings[this._lineNumber])
            ++this._lineNumber;
        return this._lineNumber;
    },

    /**
     * @return {?Acorn.TokenOrComment}
     */
    nextToken: function()
    {
        var token = this._nextTokenInternal();
        if (token.type === acorn.tokTypes.eof)
            return null;

        this._tokenLineStart = this._rollLineNumberToPosition(token.start);
        this._tokenLineEnd = this._rollLineNumberToPosition(token.end);
        this._tokenColumnStart = this._tokenLineStart > 0 ? token.start - this._lineEndings[this._tokenLineStart - 1] - 1 : token.start;
        return token;
    },

    /**
     * @return {?Acorn.TokenOrComment}
     */
    peekToken: function()
    {
        if (this._comments.length)
            return this._comments[0];
        return this._bufferedToken.type !== acorn.tokTypes.eof ? this._bufferedToken : null;
    },

    /**
     * @return {number}
     */
    tokenLineStart: function()
    {
        return this._tokenLineStart;
    },

    /**
     * @return {number}
     */
    tokenLineEnd: function()
    {
        return this._tokenLineEnd;
    },

    /**
     * @return {number}
     */
    tokenColumnStart: function()
    {
        return this._tokenColumnStart;
    }
}

// A dummy javascript mode which is used only by htmlmixed mode to advance
// stream until a </script> is found.
CodeMirror.defineMode("javascript", function(config, parserConfig) {
    return {
        token: function(stream, state)
        {
            return stream.next();
        }
    }
});
