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
 * @implements {WebInspector.TextFilterUI.SuggestionBuilder}
 * @param {!Array.<string>} keys
 */
WebInspector.FilterSuggestionBuilder = function(keys)
{
    this._keys = keys;
    this._valueSets = {};
    this._valueLists = {};
}

/** @typedef {{type: string, data: string, negative: boolean}} */
WebInspector.FilterSuggestionBuilder.Filter;

WebInspector.FilterSuggestionBuilder.prototype = {
    /**
     * @override
     * @param {!HTMLInputElement} input
     * @return {?Array.<string>}
     */
    buildSuggestions: function(input)
    {
        var text = input.value;
        var end = input.selectionEnd;
        if (end != text.length)
            return null;

        var start = input.selectionStart;
        text = text.substring(0, start);
        var prefixIndex = text.lastIndexOf(" ") + 1;

        var prefix = text.substring(prefixIndex);
        if (!prefix)
            return [];

        var negative = prefix.startsWith("-");
        if (negative)
            prefix = prefix.substring(1);
        var modifier = negative ? "-" : "";
        var valueDelimiterIndex = prefix.indexOf(":");

        var suggestions = [];
        if (valueDelimiterIndex === -1) {
            var matcher = new RegExp("^" + prefix.escapeForRegExp(), "i");
            for (var j = 0; j < this._keys.length; ++j) {
                if (this._keys[j].match(matcher))
                    suggestions.push(modifier + this._keys[j] + ":");
            }
        } else {
            var key = prefix.substring(0, valueDelimiterIndex).toLowerCase();
            var value = prefix.substring(valueDelimiterIndex + 1);
            var matcher = new RegExp("^" + value.escapeForRegExp(), "i");
            var items = this._values(key);
            for (var i = 0; i < items.length; ++i) {
                if (items[i].match(matcher) && (items[i] !== value))
                    suggestions.push(modifier + key + ":" + items[i]);
            }
        }
        return suggestions;
    },

    /**
     * @override
     * @param {!HTMLInputElement} input
     * @param {string} suggestion
     * @param {boolean} isIntermediate
     */
    applySuggestion: function(input, suggestion, isIntermediate)
    {
        var text = input.value;

        var start = input.selectionStart;
        text = text.substring(0, start);
        var prefixIndex = text.lastIndexOf(" ") + 1;

        if (isIntermediate) {
            text = text + suggestion.substring(text.length - prefixIndex);
            input.value = text;
        } else {
            text = text.substring(0, prefixIndex) + suggestion;
            input.value = text;
            start = text.length;
        }
        input.setSelectionRange(start, text.length);
    },

    /**
     * @override
     * @param {!HTMLInputElement} input
     */
    unapplySuggestion: function(input)
    {
        var start = input.selectionStart;
        var end = input.selectionEnd;
        var text = input.value;
        if (start !== end && end === text.length)
            input.value = text.substring(0, start);
    },

    /**
     * @param {string} key
     * @return {!Array.<string>}
     */
    _values: function(key)
    {
        var result = this._valueLists[key];
        if (!result)
            return [];

        result.sort();
        return result;
    },

    /**
     * @param {string} key
     * @param {?string=} value
     */
    addItem: function(key, value)
    {
        if (!value)
            return;

        var set = this._valueSets[key];
        var list = this._valueLists[key];
        if (!set) {
            set = {};
            this._valueSets[key] = set;
            list = [];
            this._valueLists[key] = list;
        }

        if (set[value])
            return;

        set[value] = true;
        list.push(value);
    },

    /**
     * @param {string} query
     * @return {{text: !Array.<string>, filters: !Array.<!WebInspector.FilterSuggestionBuilder.Filter>}}
     */
    parseQuery: function(query)
    {
        var filters = [];
        var text = [];
        var parts = query.split(/\s+/);
        for (var i = 0; i < parts.length; ++i) {
            var part = parts[i];
            if (!part)
                continue;
            var colonIndex = part.indexOf(":");
            if (colonIndex === -1) {
                text.push(part);
                continue;
            }
            var key = part.substring(0, colonIndex);
            var negative = key.startsWith("-");
            if (negative)
                key = key.substring(1);
            if (this._keys.indexOf(key) == -1) {
                text.push(part);
                continue;
            }
            var value = part.substring(colonIndex + 1);
            filters.push({type: key, data: value, negative: negative});
        }
        return {text: text, filters: filters};
    }
};
