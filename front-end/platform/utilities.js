/*
 * Copyright (C) 2007 Apple Inc.  All rights reserved.
 * Copyright (C) 2012 Google Inc. All rights reserved.
 *
 * Redistribution and use in source and binary forms, with or without
 * modification, are permitted provided that the following conditions
 * are met:
 *
 * 1.  Redistributions of source code must retain the above copyright
 *     notice, this list of conditions and the following disclaimer.
 * 2.  Redistributions in binary form must reproduce the above copyright
 *     notice, this list of conditions and the following disclaimer in the
 *     documentation and/or other materials provided with the distribution.
 * 3.  Neither the name of Apple Computer, Inc. ("Apple") nor the names of
 *     its contributors may be used to endorse or promote products derived
 *     from this software without specific prior written permission.
 *
 * THIS SOFTWARE IS PROVIDED BY APPLE AND ITS CONTRIBUTORS "AS IS" AND ANY
 * EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED
 * WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
 * DISCLAIMED. IN NO EVENT SHALL APPLE OR ITS CONTRIBUTORS BE LIABLE FOR ANY
 * DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES
 * (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES;
 * LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND
 * ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT
 * (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF
 * THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
 */

// FIXME: This performance optimization should be moved to blink so that all developers could enjoy it.
// console is retrieved with V8Window.getAttribute method which is slow. Here we copy it to a js variable for faster access.
console = console;
console.__originalAssert = console.assert;
console.assert = function(value, message)
{
    if (value)
        return;
    console.__originalAssert(value, message);
}

/** @typedef {Array|NodeList|Arguments|{length: number}} */
var ArrayLike;

/**
 * @param {!Object} obj
 * @return {boolean}
 */
Object.isEmpty = function(obj)
{
    for (var i in obj)
        return false;
    return true;
}

/**
 * @param {!Object.<string,!T>} obj
 * @return {!Array.<!T>}
 * @template T
 */
Object.values = function(obj)
{
    var result = Object.keys(obj);
    var length = result.length;
    for (var i = 0; i < length; ++i)
        result[i] = obj[result[i]];
    return result;
}

/**
 * @param {number} m
 * @param {number} n
 * @return {number}
 */
function mod(m, n)
{
    return ((m % n) + n) % n;
}

/**
 * @param {string} string
 * @return {!Array.<number>}
 */
String.prototype.findAll = function(string)
{
    var matches = [];
    var i = this.indexOf(string);
    while (i !== -1) {
        matches.push(i);
        i = this.indexOf(string, i + string.length);
    }
    return matches;
}

/**
 * @return {!Array.<number>}
 */
String.prototype.lineEndings = function()
{
    if (!this._lineEndings) {
        this._lineEndings = this.findAll("\n");
        this._lineEndings.push(this.length);
    }
    return this._lineEndings;
}

/**
 * @return {number}
 */
String.prototype.lineCount = function()
{
    var lineEndings = this.lineEndings();
    return lineEndings.length;
}

/**
 * @return {string}
 */
String.prototype.lineAt = function(lineNumber)
{
    var lineEndings = this.lineEndings();
    var lineStart = lineNumber > 0 ? lineEndings[lineNumber - 1] + 1 : 0;
    var lineEnd = lineEndings[lineNumber];
    var lineContent = this.substring(lineStart, lineEnd);
    if (lineContent.length > 0 && lineContent.charAt(lineContent.length - 1) === "\r")
        lineContent = lineContent.substring(0, lineContent.length - 1);
    return lineContent;
}

/**
 * @param {string} chars
 * @return {string}
 */
String.prototype.escapeCharacters = function(chars)
{
    var foundChar = false;
    for (var i = 0; i < chars.length; ++i) {
        if (this.indexOf(chars.charAt(i)) !== -1) {
            foundChar = true;
            break;
        }
    }

    if (!foundChar)
        return String(this);

    var result = "";
    for (var i = 0; i < this.length; ++i) {
        if (chars.indexOf(this.charAt(i)) !== -1)
            result += "\\";
        result += this.charAt(i);
    }

    return result;
}

/**
 * @return {string}
 */
String.regexSpecialCharacters = function()
{
    return "^[]{}()\\.^$*+?|-,";
}

/**
 * @return {string}
 */
String.prototype.escapeForRegExp = function()
{
    return this.escapeCharacters(String.regexSpecialCharacters());
}

/**
 * @return {string}
 */
String.prototype.escapeHTML = function()
{
    return this.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); //" doublequotes just for editor
}

/**
 * @return {string}
 */
String.prototype.unescapeHTML = function()
{
    return this.replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&#58;/g, ":")
        .replace(/&quot;/g, "\"")
        .replace(/&#60;/g, "<")
        .replace(/&#62;/g, ">")
        .replace(/&amp;/g, "&");
}

/**
 * @return {string}
 */
String.prototype.collapseWhitespace = function()
{
    return this.replace(/[\s\xA0]+/g, " ");
}

/**
 * @param {number} maxLength
 * @return {string}
 */
String.prototype.trimMiddle = function(maxLength)
{
    if (this.length <= maxLength)
        return String(this);
    var leftHalf = maxLength >> 1;
    var rightHalf = maxLength - leftHalf - 1;
    return this.substr(0, leftHalf) + "\u2026" + this.substr(this.length - rightHalf, rightHalf);
}

/**
 * @param {number} maxLength
 * @return {string}
 */
String.prototype.trimEnd = function(maxLength)
{
    if (this.length <= maxLength)
        return String(this);
    return this.substr(0, maxLength - 1) + "\u2026";
}

/**
 * @param {?string=} baseURLDomain
 * @return {string}
 */
String.prototype.trimURL = function(baseURLDomain)
{
    var result = this.replace(/^(https|http|file):\/\//i, "");
    if (baseURLDomain)
        result = result.replace(new RegExp("^" + baseURLDomain.escapeForRegExp(), "i"), "");
    return result;
}

/**
 * @return {string}
 */
String.prototype.toTitleCase = function()
{
    return this.substring(0, 1).toUpperCase() + this.substring(1);
}

/**
 * @param {string} other
 * @return {number}
 */
String.prototype.compareTo = function(other)
{
    if (this > other)
        return 1;
    if (this < other)
        return -1;
    return 0;
}

/**
 * @param {string} href
 * @return {?string}
 */
function sanitizeHref(href)
{
    return href && href.trim().toLowerCase().startsWith("javascript:") ? null : href;
}

/**
 * @return {string}
 */
String.prototype.removeURLFragment = function()
{
    var fragmentIndex = this.indexOf("#");
    if (fragmentIndex == -1)
        fragmentIndex = this.length;
    return this.substring(0, fragmentIndex);
}

/**
 * @return {boolean}
 */
String.prototype.startsWith = function(substring)
{
    return !this.lastIndexOf(substring, 0);
}

/**
 * @return {boolean}
 */
String.prototype.endsWith = function(substring)
{
    return this.indexOf(substring, this.length - substring.length) !== -1;
}

/**
 * @return {number}
 */
String.prototype.hashCode = function()
{
    var result = 0;
    for (var i = 0; i < this.length; ++i)
        result = (result * 3 + this.charCodeAt(i)) | 0;
    return result;
}

/**
 * @param {number} index
 * @return {boolean}
 */
String.prototype.isDigitAt = function(index)
{
    var c = this.charCodeAt(index);
    return 48 <= c && c <= 57;
}

/**
 * @return {string}
 */
String.prototype.toBase64 = function()
{
    /**
     * @param {number} b
     * @return {number}
     */
    function encodeBits(b)
    {
        return b < 26 ? b + 65 : b < 52 ? b + 71 : b < 62 ? b - 4 : b === 62 ? 43 : b === 63 ? 47 : 65;
    }
    var encoder = new TextEncoder();
    var data = encoder.encode(this.toString());
    var n = data.length;
    var encoded = "";
    if (n === 0)
        return encoded;
    var shift;
    var v = 0;
    for (var i = 0; i < n; i++) {
        shift = i % 3;
        v |= data[i] << (16 >>> shift & 24);
        if (shift === 2) {
            encoded += String.fromCharCode(encodeBits(v >>> 18 & 63), encodeBits(v >>> 12 & 63), encodeBits(v >>> 6 & 63), encodeBits(v & 63));
            v = 0;
        }
    }
    if (shift === 0)
        encoded += String.fromCharCode(encodeBits(v >>> 18 & 63), encodeBits(v >>> 12 & 63), 61, 61);
    else if (shift === 1)
        encoded += String.fromCharCode(encodeBits(v >>> 18 & 63), encodeBits(v >>> 12 & 63), encodeBits(v >>> 6 & 63), 61);
    return encoded;
}

/**
 * @param {string} a
 * @param {string} b
 * @return {number}
 */
String.naturalOrderComparator = function(a, b)
{
    var chunk = /^\d+|^\D+/;
    var chunka, chunkb, anum, bnum;
    while (1) {
        if (a) {
            if (!b)
                return 1;
        } else {
            if (b)
                return -1;
            else
                return 0;
        }
        chunka = a.match(chunk)[0];
        chunkb = b.match(chunk)[0];
        anum = !isNaN(chunka);
        bnum = !isNaN(chunkb);
        if (anum && !bnum)
            return -1;
        if (bnum && !anum)
            return 1;
        if (anum && bnum) {
            var diff = chunka - chunkb;
            if (diff)
                return diff;
            if (chunka.length !== chunkb.length) {
                if (!+chunka && !+chunkb) // chunks are strings of all 0s (special case)
                    return chunka.length - chunkb.length;
                else
                    return chunkb.length - chunka.length;
            }
        } else if (chunka !== chunkb)
            return (chunka < chunkb) ? -1 : 1;
        a = a.substring(chunka.length);
        b = b.substring(chunkb.length);
    }
}

/**
 * @param {number} num
 * @param {number} min
 * @param {number} max
 * @return {number}
 */
Number.constrain = function(num, min, max)
{
    if (num < min)
        num = min;
    else if (num > max)
        num = max;
    return num;
}

/**
 * @param {number} a
 * @param {number} b
 * @return {number}
 */
Number.gcd = function(a, b)
{
    if (b === 0)
        return a;
    else
        return Number.gcd(b, a % b);
}

/**
 * @param {string} value
 * @return {string}
 */
Number.toFixedIfFloating = function(value)
{
    if (!value || isNaN(value))
        return value;
    var number = Number(value);
    return number % 1 ? number.toFixed(3) : String(number);
}

/**
 * @return {string}
 */
Date.prototype.toISO8601Compact = function()
{
    /**
     * @param {number} x
     * @return {string}
     */
    function leadZero(x)
    {
        return (x > 9 ? "" : "0") + x;
    }
    return this.getFullYear() +
           leadZero(this.getMonth() + 1) +
           leadZero(this.getDate()) + "T" +
           leadZero(this.getHours()) +
           leadZero(this.getMinutes()) +
           leadZero(this.getSeconds());
}

/**
 * @return {string}
 */
Date.prototype.toConsoleTime = function()
{
    /**
     * @param {number} x
     * @return {string}
     */
    function leadZero2(x)
    {
        return (x > 9 ? "" : "0") + x;
    }

    /**
     * @param {number} x
     * @return {string}
     */
    function leadZero3(x)
    {
        return (Array(4 - x.toString().length)).join('0') + x;
    }

    return this.getFullYear() + "-" +
           leadZero2(this.getMonth() + 1) + "-" +
           leadZero2(this.getDate()) + " " +
           leadZero2(this.getHours()) + ":" +
           leadZero2(this.getMinutes()) + ":" +
           leadZero2(this.getSeconds()) + "." +
           leadZero3(this.getMilliseconds());
}

Object.defineProperty(Array.prototype, "remove",
{
    /**
     * @param {!T} value
     * @param {boolean=} firstOnly
     * @this {Array.<!T>}
     * @template T
     */
    value: function(value, firstOnly)
    {
        var index = this.indexOf(value);
        if (index === -1)
            return;
        if (firstOnly) {
            this.splice(index, 1);
            return;
        }
        for (var i = index + 1, n = this.length; i < n; ++i) {
            if (this[i] !== value)
                this[index++] = this[i];
        }
        this.length = index;
    }
});

Object.defineProperty(Array.prototype, "keySet",
{
    /**
     * @return {!Object.<string, boolean>}
     * @this {Array.<*>}
     */
    value: function()
    {
        var keys = {};
        for (var i = 0; i < this.length; ++i)
            keys[this[i]] = true;
        return keys;
    }
});

Object.defineProperty(Array.prototype, "pushAll",
{
    /**
     * @param {!Array.<!T>} array
     * @this {Array.<!T>}
     * @template T
     */
    value: function(array)
    {
        Array.prototype.push.apply(this, array);
    }
});

Object.defineProperty(Array.prototype, "rotate",
{
    /**
     * @param {number} index
     * @return {!Array.<!T>}
     * @this {Array.<!T>}
     * @template T
     */
    value: function(index)
    {
        var result = [];
        for (var i = index; i < index + this.length; ++i)
            result.push(this[i % this.length]);
        return result;
    }
});

Object.defineProperty(Array.prototype, "sortNumbers",
{
    /**
     * @this {Array.<number>}
     */
    value: function()
    {
        /**
         * @param {number} a
         * @param {number} b
         * @return {number}
         */
        function numericComparator(a, b)
        {
            return a - b;
        }

        this.sort(numericComparator);
    }
});

Object.defineProperty(Uint32Array.prototype, "sort", {
    value: Array.prototype.sort
});

(function() {
var partition = {
    /**
     * @this {Array.<number>}
     * @param {function(number, number): number} comparator
     * @param {number} left
     * @param {number} right
     * @param {number} pivotIndex
     */
    value: function(comparator, left, right, pivotIndex)
    {
        function swap(array, i1, i2)
        {
            var temp = array[i1];
            array[i1] = array[i2];
            array[i2] = temp;
        }

        var pivotValue = this[pivotIndex];
        swap(this, right, pivotIndex);
        var storeIndex = left;
        for (var i = left; i < right; ++i) {
            if (comparator(this[i], pivotValue) < 0) {
                swap(this, storeIndex, i);
                ++storeIndex;
            }
        }
        swap(this, right, storeIndex);
        return storeIndex;
    }
};
Object.defineProperty(Array.prototype, "partition", partition);
Object.defineProperty(Uint32Array.prototype, "partition", partition);

var sortRange = {
    /**
     * @param {function(number, number): number} comparator
     * @param {number} leftBound
     * @param {number} rightBound
     * @param {number} sortWindowLeft
     * @param {number} sortWindowRight
     * @return {!Array.<number>}
     * @this {Array.<number>}
     */
    value: function(comparator, leftBound, rightBound, sortWindowLeft, sortWindowRight)
    {
        function quickSortRange(array, comparator, left, right, sortWindowLeft, sortWindowRight)
        {
            if (right <= left)
                return;
            var pivotIndex = Math.floor(Math.random() * (right - left)) + left;
            var pivotNewIndex = array.partition(comparator, left, right, pivotIndex);
            if (sortWindowLeft < pivotNewIndex)
                quickSortRange(array, comparator, left, pivotNewIndex - 1, sortWindowLeft, sortWindowRight);
            if (pivotNewIndex < sortWindowRight)
                quickSortRange(array, comparator, pivotNewIndex + 1, right, sortWindowLeft, sortWindowRight);
        }
        if (leftBound === 0 && rightBound === (this.length - 1) && sortWindowLeft === 0 && sortWindowRight >= rightBound)
            this.sort(comparator);
        else
            quickSortRange(this, comparator, leftBound, rightBound, sortWindowLeft, sortWindowRight);
        return this;
    }
}
Object.defineProperty(Array.prototype, "sortRange", sortRange);
Object.defineProperty(Uint32Array.prototype, "sortRange", sortRange);
})();

Object.defineProperty(Array.prototype, "stableSort",
{
    /**
     * @param {function(?T, ?T): number=} comparator
     * @return {!Array.<?T>}
     * @this {Array.<?T>}
     * @template T
     */
    value: function(comparator)
    {
        function defaultComparator(a, b)
        {
            return a < b ? -1 : (a > b ? 1 : 0);
        }
        comparator = comparator || defaultComparator;

        var indices = new Array(this.length);
        for (var i = 0; i < this.length; ++i)
            indices[i] = i;
        var self = this;
        /**
         * @param {number} a
         * @param {number} b
         * @return {number}
         */
        function indexComparator(a, b)
        {
            var result = comparator(self[a], self[b]);
            return result ? result : a - b;
        }
        indices.sort(indexComparator);

        for (var i = 0; i < this.length; ++i) {
            if (indices[i] < 0 || i === indices[i])
                continue;
            var cyclical = i;
            var saved = this[i];
            while (true) {
                var next = indices[cyclical];
                indices[cyclical] = -1;
                if (next === i) {
                    this[cyclical] = saved;
                    break;
                } else {
                    this[cyclical] = this[next];
                    cyclical = next;
                }
            }
        }
        return this;
    }
});

Object.defineProperty(Array.prototype, "qselect",
{
    /**
     * @param {number} k
     * @param {function(number, number): number=} comparator
     * @return {number|undefined}
     * @this {Array.<number>}
     */
    value: function(k, comparator)
    {
        if (k < 0 || k >= this.length)
            return;
        if (!comparator)
            comparator = function(a, b) { return a - b; }

        var low = 0;
        var high = this.length - 1;
        for (;;) {
            var pivotPosition = this.partition(comparator, low, high, Math.floor((high + low) / 2));
            if (pivotPosition === k)
                return this[k];
            else if (pivotPosition > k)
                high = pivotPosition - 1;
            else
                low = pivotPosition + 1;
        }
    }
});

Object.defineProperty(Array.prototype, "lowerBound",
{
    /**
     * Return index of the leftmost element that is equal or greater
     * than the specimen object. If there's no such element (i.e. all
     * elements are smaller than the specimen) returns right bound.
     * The function works for sorted array.
     * When specified, |left| (inclusive) and |right| (exclusive) indices
     * define the search window.
     *
     * @param {!T} object
     * @param {function(!T,!S):number=} comparator
     * @param {number=} left
     * @param {number=} right
     * @return {number}
     * @this {Array.<!S>}
     * @template T,S
     */
    value: function(object, comparator, left, right)
    {
        function defaultComparator(a, b)
        {
            return a < b ? -1 : (a > b ? 1 : 0);
        }
        comparator = comparator || defaultComparator;
        var l = left || 0;
        var r = right !== undefined ? right : this.length;
        while (l < r) {
            var m = (l + r) >> 1;
            if (comparator(object, this[m]) > 0)
                l = m + 1;
            else
                r = m;
        }
        return r;
    }
});

Object.defineProperty(Array.prototype, "upperBound",
{
    /**
     * Return index of the leftmost element that is greater
     * than the specimen object. If there's no such element (i.e. all
     * elements are smaller or equal to the specimen) returns right bound.
     * The function works for sorted array.
     * When specified, |left| (inclusive) and |right| (exclusive) indices
     * define the search window.
     *
     * @param {!T} object
     * @param {function(!T,!S):number=} comparator
     * @param {number=} left
     * @param {number=} right
     * @return {number}
     * @this {Array.<!S>}
     * @template T,S
     */
    value: function(object, comparator, left, right)
    {
        function defaultComparator(a, b)
        {
            return a < b ? -1 : (a > b ? 1 : 0);
        }
        comparator = comparator || defaultComparator;
        var l = left || 0;
        var r = right !== undefined ? right : this.length;
        while (l < r) {
            var m = (l + r) >> 1;
            if (comparator(object, this[m]) >= 0)
                l = m + 1;
            else
                r = m;
        }
        return r;
    }
});

Object.defineProperty(Uint32Array.prototype, "lowerBound", {
    value: Array.prototype.lowerBound
});

Object.defineProperty(Uint32Array.prototype, "upperBound", {
    value: Array.prototype.upperBound
});

Object.defineProperty(Float64Array.prototype, "lowerBound", {
    value: Array.prototype.lowerBound
});

Object.defineProperty(Array.prototype, "binaryIndexOf",
{
    /**
     * @param {!T} value
     * @param {function(!T,!S):number} comparator
     * @return {number}
     * @this {Array.<!S>}
     * @template T,S
     */
    value: function(value, comparator)
    {
        var index = this.lowerBound(value, comparator);
        return index < this.length && comparator(value, this[index]) === 0 ? index : -1;
    }
});

Object.defineProperty(Array.prototype, "select",
{
    /**
     * @param {string} field
     * @return {!Array.<!T>}
     * @this {Array.<!Object.<string,!T>>}
     * @template T
     */
    value: function(field)
    {
        var result = new Array(this.length);
        for (var i = 0; i < this.length; ++i)
            result[i] = this[i][field];
        return result;
    }
});

Object.defineProperty(Array.prototype, "peekLast",
{
    /**
     * @return {!T|undefined}
     * @this {Array.<!T>}
     * @template T
     */
    value: function()
    {
        return this[this.length - 1];
    }
});

(function(){

/**
 * @param {!Array.<T>} array1
 * @param {!Array.<T>} array2
 * @param {function(T,T):number} comparator
 * @param {boolean} mergeNotIntersect
 * @return {!Array.<T>}
 * @template T
 */
function mergeOrIntersect(array1, array2, comparator, mergeNotIntersect)
{
    var result = [];
    var i = 0;
    var j = 0;
    while (i < array1.length && j < array2.length) {
        var compareValue = comparator(array1[i], array2[j]);
        if (mergeNotIntersect || !compareValue)
            result.push(compareValue <= 0 ? array1[i] : array2[j]);
        if (compareValue <= 0)
            i++;
        if (compareValue >= 0)
            j++;
    }
    if (mergeNotIntersect) {
        while (i < array1.length)
            result.push(array1[i++]);
        while (j < array2.length)
            result.push(array2[j++]);
    }
    return result;
}

Object.defineProperty(Array.prototype, "intersectOrdered",
{
    /**
     * @param {!Array.<T>} array
     * @param {function(T,T):number} comparator
     * @return {!Array.<T>}
     * @this {!Array.<T>}
     * @template T
     */
    value: function(array, comparator)
    {
        return mergeOrIntersect(this, array, comparator, false);
    }
});

Object.defineProperty(Array.prototype, "mergeOrdered",
{
    /**
     * @param {!Array.<T>} array
     * @param {function(T,T):number} comparator
     * @return {!Array.<T>}
     * @this {!Array.<T>}
     * @template T
     */
    value: function(array, comparator)
    {
        return mergeOrIntersect(this, array, comparator, true);
    }
});

}());


/**
 * @param {!T} object
 * @param {!Array.<!S>} list
 * @param {function(!T,!S):number=} comparator
 * @param {boolean=} insertionIndexAfter
 * @return {number}
 * @template T,S
 */
function insertionIndexForObjectInListSortedByFunction(object, list, comparator, insertionIndexAfter)
{
    if (insertionIndexAfter)
        return list.upperBound(object, comparator);
    else
        return list.lowerBound(object, comparator);
}

/**
 * @param {string} format
 * @param {...*} var_arg
 * @return {string}
 */
String.sprintf = function(format, var_arg)
{
    return String.vsprintf(format, Array.prototype.slice.call(arguments, 1));
}

/**
 * @param {string} format
 * @param {!Object.<string, function(string, ...):*>} formatters
 * @return {!Array.<!Object>}
 */
String.tokenizeFormatString = function(format, formatters)
{
    var tokens = [];
    var substitutionIndex = 0;

    function addStringToken(str)
    {
        tokens.push({ type: "string", value: str });
    }

    function addSpecifierToken(specifier, precision, substitutionIndex)
    {
        tokens.push({ type: "specifier", specifier: specifier, precision: precision, substitutionIndex: substitutionIndex });
    }

    var index = 0;
    for (var precentIndex = format.indexOf("%", index); precentIndex !== -1; precentIndex = format.indexOf("%", index)) {
        addStringToken(format.substring(index, precentIndex));
        index = precentIndex + 1;

        if (format[index] === "%") {
            // %% escape sequence.
            addStringToken("%");
            ++index;
            continue;
        }

        if (format.isDigitAt(index)) {
            // The first character is a number, it might be a substitution index.
            var number = parseInt(format.substring(index), 10);
            while (format.isDigitAt(index))
                ++index;

            // If the number is greater than zero and ends with a "$",
            // then this is a substitution index.
            if (number > 0 && format[index] === "$") {
                substitutionIndex = (number - 1);
                ++index;
            }
        }

        var precision = -1;
        if (format[index] === ".") {
            // This is a precision specifier. If no digit follows the ".",
            // then the precision should be zero.
            ++index;
            precision = parseInt(format.substring(index), 10);
            if (isNaN(precision))
                precision = 0;

            while (format.isDigitAt(index))
                ++index;
        }

        if (!(format[index] in formatters)) {
            addStringToken(format.substring(precentIndex, index + 1));
            ++index;
            continue;
        }

        addSpecifierToken(format[index], precision, substitutionIndex);

        ++substitutionIndex;
        ++index;
    }

    addStringToken(format.substring(index));

    return tokens;
}

String.standardFormatters = {
    /**
     * @return {number}
     */
    d: function(substitution)
    {
        return !isNaN(substitution) ? substitution : 0;
    },

    /**
     * @return {number}
     */
    f: function(substitution, token)
    {
        if (substitution && token.precision > -1)
            substitution = substitution.toFixed(token.precision);
        return !isNaN(substitution) ? substitution : (token.precision > -1 ? Number(0).toFixed(token.precision) : 0);
    },

    /**
     * @return {string}
     */
    s: function(substitution)
    {
        return substitution;
    }
}

/**
 * @param {string} format
 * @param {!Array.<*>} substitutions
 * @return {string}
 */
String.vsprintf = function(format, substitutions)
{
    return String.format(format, substitutions, String.standardFormatters, "", function(a, b) { return a + b; }).formattedResult;
}

/**
 * @param {string} format
 * @param {?ArrayLike} substitutions
 * @param {!Object.<string, function(string, ...):string>} formatters
 * @param {!T} initialValue
 * @param {function(T, string): T|undefined} append
 * @param {!Array.<!Object>=} tokenizedFormat
 * @return {!{formattedResult: T, unusedSubstitutions: ?ArrayLike}};
 * @template T
 */
String.format = function(format, substitutions, formatters, initialValue, append, tokenizedFormat)
{
    if (!format || !substitutions || !substitutions.length)
        return { formattedResult: append(initialValue, format), unusedSubstitutions: substitutions };

    function prettyFunctionName()
    {
        return "String.format(\"" + format + "\", \"" + Array.prototype.join.call(substitutions, "\", \"") + "\")";
    }

    function warn(msg)
    {
        console.warn(prettyFunctionName() + ": " + msg);
    }

    function error(msg)
    {
        console.error(prettyFunctionName() + ": " + msg);
    }

    var result = initialValue;
    var tokens = tokenizedFormat || String.tokenizeFormatString(format, formatters);
    var usedSubstitutionIndexes = {};

    for (var i = 0; i < tokens.length; ++i) {
        var token = tokens[i];

        if (token.type === "string") {
            result = append(result, token.value);
            continue;
        }

        if (token.type !== "specifier") {
            error("Unknown token type \"" + token.type + "\" found.");
            continue;
        }

        if (token.substitutionIndex >= substitutions.length) {
            // If there are not enough substitutions for the current substitutionIndex
            // just output the format specifier literally and move on.
            error("not enough substitution arguments. Had " + substitutions.length + " but needed " + (token.substitutionIndex + 1) + ", so substitution was skipped.");
            result = append(result, "%" + (token.precision > -1 ? token.precision : "") + token.specifier);
            continue;
        }

        usedSubstitutionIndexes[token.substitutionIndex] = true;

        if (!(token.specifier in formatters)) {
            // Encountered an unsupported format character, treat as a string.
            warn("unsupported format character \u201C" + token.specifier + "\u201D. Treating as a string.");
            result = append(result, substitutions[token.substitutionIndex]);
            continue;
        }

        result = append(result, formatters[token.specifier](substitutions[token.substitutionIndex], token));
    }

    var unusedSubstitutions = [];
    for (var i = 0; i < substitutions.length; ++i) {
        if (i in usedSubstitutionIndexes)
            continue;
        unusedSubstitutions.push(substitutions[i]);
    }

    return { formattedResult: result, unusedSubstitutions: unusedSubstitutions };
}

/**
 * @param {string} query
 * @param {boolean} caseSensitive
 * @param {boolean} isRegex
 * @return {!RegExp}
 */
function createSearchRegex(query, caseSensitive, isRegex)
{
    var regexFlags = caseSensitive ? "g" : "gi";
    var regexObject;

    if (isRegex) {
        try {
            regexObject = new RegExp(query, regexFlags);
        } catch (e) {
            // Silent catch.
        }
    }

    if (!regexObject)
        regexObject = createPlainTextSearchRegex(query, regexFlags);

    return regexObject;
}

/**
 * @param {string} query
 * @param {string=} flags
 * @return {!RegExp}
 */
function createPlainTextSearchRegex(query, flags)
{
    // This should be kept the same as the one in ContentSearchUtils.cpp.
    var regexSpecialCharacters = String.regexSpecialCharacters();
    var regex = "";
    for (var i = 0; i < query.length; ++i) {
        var c = query.charAt(i);
        if (regexSpecialCharacters.indexOf(c) != -1)
            regex += "\\";
        regex += c;
    }
    return new RegExp(regex, flags || "");
}

/**
 * @param {!RegExp} regex
 * @param {string} content
 * @return {number}
 */
function countRegexMatches(regex, content)
{
    var text = content;
    var result = 0;
    var match;
    while (text && (match = regex.exec(text))) {
        if (match[0].length > 0)
            ++result;
        text = text.substring(match.index + 1);
    }
    return result;
}

/**
 * @param {number} spacesCount
 * @return {string}
 */
function spacesPadding(spacesCount)
{
    return Array(spacesCount).join("\u00a0");
}

/**
 * @param {number} value
 * @param {number} symbolsCount
 * @return {string}
 */
function numberToStringWithSpacesPadding(value, symbolsCount)
{
    var numberString = value.toString();
    var paddingLength = Math.max(0, symbolsCount - numberString.length);
    return spacesPadding(paddingLength) + numberString;
}

/**
 * @param {!Iterator.<T>} iterator
 * @return {!Array.<T>}
 * @template T
 */
Array.from = function(iterator)
{
    var values = [];
    for (var iteratorValue = iterator.next(); !iteratorValue.done; iteratorValue = iterator.next())
        values.push(iteratorValue.value);
    return values;
}

/**
 * @param {!Array.<!T>} array
 * @return {!Set.<T>}
 * @template T
 */
Set.fromArray = function(array)
{
    return new Set(array);
}

/**
 * @return {!Array.<T>}
 * @template T
 */
Set.prototype.valuesArray = function()
{
    return Array.from(this.values());
}

Set.prototype.remove = Set.prototype.delete;

/**
 * @return {T}
 * @template T
 */
Map.prototype.remove = function(key)
{
    var value = this.get(key);
    this.delete(key);
    return value;
}

/**
 * @return {!Array.<V>}
 * @template K, V
 * @this {Map.<K, V>}
 */
Map.prototype.valuesArray = function()
{
    return Array.from(this.values());
}

/**
 * @return {!Array.<K>}
 * @template K, V
 * @this {Map.<K, V>}
 */
Map.prototype.keysArray = function()
{
    return Array.from(this.keys());
}

/**
 * @constructor
 * @template T
 */
var StringMultimap = function()
{
    /** @type {!Map.<string, !Set.<!T>>} */
    this._map = new Map();
}

StringMultimap.prototype = {
    /**
     * @param {string} key
     * @param {T} value
     */
    set: function(key, value)
    {
        var set = this._map.get(key);
        if (!set) {
            set = new Set();
            this._map.set(key, set);
        }
        set.add(value);
    },

    /**
     * @param {string} key
     * @return {!Set.<!T>}
     */
    get: function(key)
    {
        var result = this._map.get(key);
        if (!result)
            result = new Set();
        return result;
    },

    /**
     * @param {string} key
     * @param {T} value
     */
    remove: function(key, value)
    {
        var values = this.get(key);
        values.remove(value);
        if (!values.size)
            this._map.remove(key)
    },

    /**
     * @param {string} key
     */
    removeAll: function(key)
    {
        this._map.remove(key)
    },

    /**
     * @return {!Array.<string>}
     */
    keysArray: function()
    {
        return this._map.keysArray();
    },

    /**
     * @return {!Array.<!T>}
     */
    valuesArray: function()
    {
        var result = [];
        var keys = this.keysArray();
        for (var i = 0; i < keys.length; ++i)
            result.pushAll(this.get(keys[i]).valuesArray());
        return result;
    },

    clear: function()
    {
        this._map.clear();
    }
}

/**
 * @param {string} url
 * @return {!Promise.<string>}
 */
function loadXHR(url)
{
    return new Promise(load);

    function load(successCallback, failureCallback)
    {
        function onReadyStateChanged()
        {
            if (xhr.readyState !== XMLHttpRequest.DONE)
                return;
            if (xhr.status !== 200) {
                xhr.onreadystatechange = null;
                failureCallback(new Error(xhr.status));
                return;
            }
            xhr.onreadystatechange = null;
            successCallback(xhr.responseText);
        }

        var xhr = new XMLHttpRequest();
        xhr.open("GET", url, true);
        xhr.onreadystatechange = onReadyStateChanged;
        xhr.send(null);
    }
}

/**
 * @constructor
 */
function CallbackBarrier()
{
    this._pendingIncomingCallbacksCount = 0;
}

CallbackBarrier.prototype = {
    /**
     * @param {function(...)=} userCallback
     * @return {function(...)}
     */
    createCallback: function(userCallback)
    {
        console.assert(!this._outgoingCallback, "CallbackBarrier.createCallback() is called after CallbackBarrier.callWhenDone()");
        ++this._pendingIncomingCallbacksCount;
        return this._incomingCallback.bind(this, userCallback);
    },

    /**
     * @param {function()} callback
     */
    callWhenDone: function(callback)
    {
        console.assert(!this._outgoingCallback, "CallbackBarrier.callWhenDone() is called multiple times");
        this._outgoingCallback = callback;
        if (!this._pendingIncomingCallbacksCount)
            this._outgoingCallback();
    },

    /**
     * @param {function(...)=} userCallback
     */
    _incomingCallback: function(userCallback)
    {
        console.assert(this._pendingIncomingCallbacksCount > 0);
        if (userCallback) {
            var args = Array.prototype.slice.call(arguments, 1);
            userCallback.apply(null, args);
        }
        if (!--this._pendingIncomingCallbacksCount && this._outgoingCallback)
            this._outgoingCallback();
    }
}

/**
 * @param {*} value
 */
function suppressUnused(value)
{
}

/**
 * @param {function()} callback
 * @return {number}
 */
self.setImmediate = function(callback)
{
    Promise.resolve().then(callback).done();
    return 0;
}
