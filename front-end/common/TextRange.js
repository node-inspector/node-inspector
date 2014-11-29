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
 * @param {number} startLine
 * @param {number} startColumn
 * @param {number} endLine
 * @param {number} endColumn
 */
WebInspector.TextRange = function(startLine, startColumn, endLine, endColumn)
{
    this.startLine = startLine;
    this.startColumn = startColumn;
    this.endLine = endLine;
    this.endColumn = endColumn;
}

/**
 * @param {number} line
 * @param {number} column
 * @return {!WebInspector.TextRange}
 */
WebInspector.TextRange.createFromLocation = function(line, column)
{
    return new WebInspector.TextRange(line, column, line, column);
}

/**
 * @param {!Object} serializedTextRange
 * @return {!WebInspector.TextRange}
 */
WebInspector.TextRange.fromObject = function(serializedTextRange)
{
    return new WebInspector.TextRange(serializedTextRange.startLine, serializedTextRange.startColumn, serializedTextRange.endLine, serializedTextRange.endColumn);
}

/**
 * @param {!WebInspector.TextRange} range1
 * @param {!WebInspector.TextRange} range2
 * @return {number}
 */
WebInspector.TextRange.comparator = function(range1, range2)
{
    return range1.compareTo(range2);
}

WebInspector.TextRange.prototype = {
    /**
     * @return {boolean}
     */
    isEmpty: function()
    {
        return this.startLine === this.endLine && this.startColumn === this.endColumn;
    },

    /**
     * @param {!WebInspector.TextRange} range
     * @return {boolean}
     */
    immediatelyPrecedes: function(range)
    {
        if (!range)
            return false;
        return this.endLine === range.startLine && this.endColumn === range.startColumn;
    },

    /**
     * @param {!WebInspector.TextRange} range
     * @return {boolean}
     */
    immediatelyFollows: function(range)
    {
        if (!range)
            return false;
        return range.immediatelyPrecedes(this);
    },

    /**
     * @param {!WebInspector.TextRange} range
     * @return {boolean}
     */
    follows: function(range)
    {
        return (range.endLine === this.startLine && range.endColumn <= this.startColumn)
            || range.endLine < this.startLine;
    },

    /**
     * @return {number}
     */
    get linesCount()
    {
        return this.endLine - this.startLine;
    },

    /**
     * @return {!WebInspector.TextRange}
     */
    collapseToEnd: function()
    {
        return new WebInspector.TextRange(this.endLine, this.endColumn, this.endLine, this.endColumn);
    },

    /**
     * @return {!WebInspector.TextRange}
     */
    collapseToStart: function()
    {
        return new WebInspector.TextRange(this.startLine, this.startColumn, this.startLine, this.startColumn);
    },

    /**
     * @return {!WebInspector.TextRange}
     */
    normalize: function()
    {
        if (this.startLine > this.endLine || (this.startLine === this.endLine && this.startColumn > this.endColumn))
            return new WebInspector.TextRange(this.endLine, this.endColumn, this.startLine, this.startColumn);
        else
            return this.clone();
    },

    /**
     * @return {!WebInspector.TextRange}
     */
    clone: function()
    {
        return new WebInspector.TextRange(this.startLine, this.startColumn, this.endLine, this.endColumn);
    },

    /**
     * @return {!Object}
     */
    serializeToObject: function()
    {
        var serializedTextRange = {};
        serializedTextRange.startLine = this.startLine;
        serializedTextRange.startColumn = this.startColumn;
        serializedTextRange.endLine = this.endLine;
        serializedTextRange.endColumn = this.endColumn;
        return serializedTextRange;
    },

    /**
     * @param {!WebInspector.TextRange} other
     * @return {number}
     */
    compareTo: function(other)
    {
        if (this.startLine > other.startLine)
            return 1;
        if (this.startLine < other.startLine)
            return -1;
        if (this.startColumn > other.startColumn)
            return 1;
        if (this.startColumn < other.startColumn)
            return -1;
        return 0;
    },

    /**
     * @param {!WebInspector.TextRange} other
     * @return {boolean}
     */
    equal: function(other)
    {
        return this.startLine === other.startLine && this.endLine === other.endLine &&
            this.startColumn === other.startColumn && this.endColumn === other.endColumn;
    },

    /**
     * @param {number} lineOffset
     * @return {!WebInspector.TextRange}
     */
    shift: function(lineOffset)
    {
        return new WebInspector.TextRange(this.startLine + lineOffset, this.startColumn, this.endLine + lineOffset, this.endColumn);
    },

    /**
     * @param {!WebInspector.TextRange} originalRange
     * @param {!WebInspector.TextRange} editedRange
     * @return {!WebInspector.TextRange}
     */
    rebaseAfterTextEdit: function(originalRange, editedRange)
    {
        console.assert(originalRange.startLine === editedRange.startLine);
        console.assert(originalRange.startColumn === editedRange.startColumn);
        var rebase = this.clone();
        if (!this.follows(originalRange))
            return rebase;
        var lineDelta = editedRange.endLine - originalRange.endLine;
        var columnDelta = editedRange.endColumn - originalRange.endColumn;
        rebase.startLine += lineDelta;
        rebase.endLine += lineDelta;
        if (rebase.startLine === editedRange.endLine)
            rebase.startColumn += columnDelta;
        if (rebase.endLine === editedRange.endLine)
            rebase.endColumn += columnDelta;
        return rebase;
    },

    /**
     * @return {string}
     */
    toString: function()
    {
        return JSON.stringify(this);
    }
}

/**
 * @constructor
 * @param {number} offset
 * @param {number} length
 */
WebInspector.SourceRange = function(offset, length)
{
    this.offset = offset;
    this.length = length;
}
