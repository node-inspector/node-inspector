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
 * @param {string} query
 */
WebInspector.FilePathScoreFunction = function(query)
{
    this._query = query;
    this._queryUpperCase = query.toUpperCase();
    this._score = null;
    this._sequence = null;
    this._dataUpperCase = "";
    this._fileNameIndex = 0;
}

/**
 * @param {string} query
 * @return {RegExp}
 */
WebInspector.FilePathScoreFunction.filterRegex = function(query)
{
    const toEscape = String.regexSpecialCharacters();
    var regexString = "";
    for (var i = 0; i < query.length; ++i) {
        var c = query.charAt(i);
        if (toEscape.indexOf(c) !== -1)
            c = "\\" + c;
        if (i)
            regexString += "[^" + c + "]*";
        regexString += c;
    }
    return new RegExp(regexString, "i");
}

WebInspector.FilePathScoreFunction.prototype = {
    /**
     * @param {string} data
     * @param {?Array.<Number>} matchIndexes
     * @return {number}
     */
    score: function(data, matchIndexes)
    {
        if (!data || !this._query)
            return 0;
        var n = this._query.length;
        var m = data.length;
        if (!this._score || this._score.length < n * m) {
            this._score = new Int32Array(n * m * 2);
            this._sequence = new Int32Array(n * m * 2);
        }
        var score = this._score;
        var sequence = this._sequence;
        this._dataUpperCase = data.toUpperCase();
        this._fileNameIndex = data.lastIndexOf("/");
        for (var i = 0; i < n; ++i) {
            for (var j = 0; j < m; ++j) {
                var skipCharScore = j === 0 ? 0 : score[i * m + j - 1];
                var prevCharScore = i === 0 || j === 0 ? 0 : score[(i - 1) * m + j - 1];
                var consecutiveMatch = i === 0 || j === 0 ? 0 : sequence[(i - 1) * m + j - 1];
                var pickCharScore = this._match(this._query, data, i, j, consecutiveMatch);
                if (pickCharScore && prevCharScore + pickCharScore > skipCharScore) {
                    sequence[i * m + j] = consecutiveMatch + 1;
                    score[i * m + j] = (prevCharScore + pickCharScore);
                } else {
                    sequence[i * m + j] = 0;
                    score[i * m + j] = skipCharScore;
                }
            }
        }
        if (matchIndexes)
            this._restoreMatchIndexes(sequence, n, m, matchIndexes);
        return score[n * m - 1];
    },

    /**
     * @param {string} data
     * @param {number} j
     * @return {boolean}
     */
    _testWordStart: function(data, j)
    {
        var prevChar = data.charAt(j - 1);
        return j === 0 || prevChar === "_" || prevChar === "-" || prevChar === "/" ||
            (data[j - 1] !== this._dataUpperCase[j - 1] && data[j] === this._dataUpperCase[j]);
    },

    /**
     * @param {Int32Array} sequence
     * @param {number} n
     * @param {number} m
     * @param {Array.<Number>} out
     */
    _restoreMatchIndexes: function(sequence, n, m, out)
    {
        var i = n - 1, j = m - 1;
        while (i >= 0 && j >= 0) {
            switch (sequence[i * m + j]) {
            case 0:
                --j;
                break;
            default:
                out.push(j);
                --i;
                --j;
                break;
            }
        }
        out.reverse();
    },

    /**
     * @param {string} query
     * @param {string} data
     * @param {number} i
     * @param {number} j
     * @return {number}
     */
    _singleCharScore: function(query, data, i, j)
    {
        var isWordStart = this._testWordStart(data, j);
        var isFileName = j > this._fileNameIndex;
        var isPathTokenStart = j === 0 || data[j - 1] === "/";
        var isCapsMatch = query[i] === data[j] && query[i] == this._queryUpperCase[i];
        var score = 10;
        if (isPathTokenStart)
            score += 4;
        if (isWordStart)
            score += 2;
        if (isCapsMatch)
            score += 6;
        if (isFileName)
            score += 4;
        // promote the case of making the whole match in the filename
        if (j === this._fileNameIndex + 1 && i === 0)
            score += 5;
        if (isFileName && isWordStart)
            score += 3;
        return score;
    },

    /**
     * @param {string} query
     * @param {string} data
     * @param {number} i
     * @param {number} j
     * @param {number} sequenceLength
     * @return {number}
     */
    _sequenceCharScore: function(query, data, i, j, sequenceLength)
    {
        var isFileName = j > this._fileNameIndex;
        var isPathTokenStart = j === 0 || data[j - 1] === "/";
        var score = 10;
        if (isFileName)
            score += 4;
        if (isPathTokenStart)
            score += 5;
        score += sequenceLength * 4;
        return score;
    },

    /**
     * @param {string} query
     * @param {string} data
     * @param {number} i
     * @param {number} j
     * @param {number} consecutiveMatch
     * @return {number}
     */
    _match: function(query, data, i, j, consecutiveMatch)
    {
        if (this._queryUpperCase[i] !== this._dataUpperCase[j])
            return 0;

        if (!consecutiveMatch)
            return this._singleCharScore(query, data, i, j);
        else
            return this._sequenceCharScore(query, data, i, j - consecutiveMatch, consecutiveMatch);
    },
}

