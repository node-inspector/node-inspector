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
     * @return {!Array.<string>}
     */
    textToWords: function(text, isWordChar)
    {
        var words = [];
        var startWord = -1;
        for(var i = 0; i < text.length; ++i) {
            if (!isWordChar(text.charAt(i))) {
                if (startWord !== -1)
                    words.push(text.substring(startWord, i));
                startWord = -1;
            } else if (startWord === -1)
                startWord = i;
        }
        if (startWord !== -1)
            words.push(text.substring(startWord));
        return words;
    },

    /**
     * @param {string} source
     * @param {number=} startIndex
     * @param {number=} lastIndex
     * @return {number}
     */
    findBalancedCurlyBrackets: function(source, startIndex, lastIndex) {
        lastIndex = lastIndex || source.length;
        startIndex = startIndex || 0;
        var counter = 0;
        var inString = false;

        for (var index = startIndex; index < lastIndex; ++index) {
            var character = source[index];
            if (inString) {
                if (character === "\\")
                    ++index;
                else if (character === "\"")
                    inString = false;
            } else {
                if (character === "\"")
                    inString = true;
                else if (character === "{")
                    ++counter;
                else if (character === "}") {
                    if (--counter === 0)
                        return index + 1;
                }
            }
        }
        return -1;
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
