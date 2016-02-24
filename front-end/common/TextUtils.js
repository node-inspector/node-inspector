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

WebInspector.TextUtils = {
    /**
     * @param {string} char
     * @return {boolean}
     */
    isStopChar: function(char)
    {
        return (char > " " && char < "0") ||
            (char > "9" && char < "A") ||
            (char > "Z" && char < "_") ||
            (char > "_" && char < "a") ||
            (char > "z" && char <= "~");
    },

    /**
     * @param {string} char
     * @return {boolean}
     */
    isWordChar: function(char)
    {
        return !WebInspector.TextUtils.isStopChar(char) && !WebInspector.TextUtils.isSpaceChar(char);
    },

    /**
     * @param {string} char
     * @return {boolean}
     */
    isSpaceChar: function(char)
    {
        return WebInspector.TextUtils._SpaceCharRegex.test(char);
    },

    /**
     * @param {string} word
     * @return {boolean}
     */
    isWord: function(word)
    {
        for (var i = 0; i < word.length; ++i) {
            if (!WebInspector.TextUtils.isWordChar(word.charAt(i)))
                return false;
        }
        return true;
    },

    /**
     * @param {string} char
     * @return {boolean}
     */
    isOpeningBraceChar: function(char)
    {
        return char === "(" || char === "{";
    },

    /**
     * @param {string} char
     * @return {boolean}
     */
    isClosingBraceChar: function(char)
    {
        return char === ")" || char === "}";
    },

    /**
     * @param {string} char
     * @return {boolean}
     */
    isBraceChar: function(char)
    {
        return WebInspector.TextUtils.isOpeningBraceChar(char) || WebInspector.TextUtils.isClosingBraceChar(char);
    },

    /**
     * @param {string} text
     * @param {function(string):boolean} isWordChar
     * @param {function(string)} wordCallback
     */
    textToWords: function(text, isWordChar, wordCallback)
    {
        var startWord = -1;
        for(var i = 0; i < text.length; ++i) {
            if (!isWordChar(text.charAt(i))) {
                if (startWord !== -1)
                    wordCallback(text.substring(startWord, i));
                startWord = -1;
            } else if (startWord === -1)
                startWord = i;
        }
        if (startWord !== -1)
            wordCallback(text.substring(startWord));
    },

    /**
     * @param {string} line
     * @return {string}
     */
    lineIndent: function(line)
    {
        var indentation = 0;
        while (indentation < line.length && WebInspector.TextUtils.isSpaceChar(line.charAt(indentation)))
            ++indentation;
        return line.substr(0, indentation);
    },

    /**
     * @param {string} text
     * @return {boolean}
     */
    isUpperCase: function(text)
    {
        return text === text.toUpperCase();
    },

    /**
     * @param {string} text
     * @return {boolean}
     */
    isLowerCase: function(text)
    {
        return text === text.toLowerCase();
    }
}

WebInspector.TextUtils._SpaceCharRegex = /\s/;

/**
 * @enum {string}
 */
WebInspector.TextUtils.Indent = {
    TwoSpaces: "  ",
    FourSpaces: "    ",
    EightSpaces: "        ",
    TabCharacter: "\t"
}

/**
 * @constructor
 * @param {function(string)} callback
 * @param {boolean=} findMultiple
 */
WebInspector.TextUtils.BalancedJSONTokenizer = function(callback, findMultiple)
{
    this._callback = callback;
    this._index = 0;
    this._balance = 0;
    this._buffer = "";
    this._findMultiple = findMultiple || false;
    this._closingDoubleQuoteRegex = /[^\\](?:\\\\)*"/g;
}

WebInspector.TextUtils.BalancedJSONTokenizer.prototype = {
    /**
     * @param {string} chunk
     */
    write: function(chunk)
    {
        this._buffer += chunk;
        var lastIndex = this._buffer.length;
        var buffer = this._buffer;
        for (var index = this._index; index < lastIndex; ++index) {
            var character = buffer[index];
            if (character === "\"") {
                this._closingDoubleQuoteRegex.lastIndex = index;
                if (!this._closingDoubleQuoteRegex.test(buffer))
                    break;
                index = this._closingDoubleQuoteRegex.lastIndex - 1;
            } else if (character === "{") {
                ++this._balance;
            } else if (character === "}") {
                if (--this._balance === 0) {
                    this._lastBalancedIndex = index + 1;
                    if (!this._findMultiple)
                        break;
                }
            }
        }
        this._index = index;
        this._reportBalanced();
    },

    _reportBalanced: function()
    {
        if (!this._lastBalancedIndex)
            return;
        this._callback(this._buffer.slice(0, this._lastBalancedIndex));
        this._buffer = this._buffer.slice(this._lastBalancedIndex);
        this._index -= this._lastBalancedIndex;
        this._lastBalancedIndex = 0;
    },

    /**
     * @return {string}
     */
    remainder: function()
    {
        return this._buffer;
    }
}

/**
 * @interface
 */
WebInspector.TokenizerFactory = function() { }

WebInspector.TokenizerFactory.prototype = {
    /**
     * @param {string} mimeType
     * @return {function(string, function(string, ?string, number, number))}
     */
    createTokenizer: function(mimeType) { }
}
