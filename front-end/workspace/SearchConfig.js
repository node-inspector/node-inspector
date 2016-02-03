// Copyright 2014 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

/**
 * @constructor
 * @implements {WebInspector.ProjectSearchConfig}
 * @param {string} query
 * @param {boolean} ignoreCase
 * @param {boolean} isRegex
 */
WebInspector.SearchConfig = function(query, ignoreCase, isRegex)
{
    this._query = query;
    this._ignoreCase = ignoreCase;
    this._isRegex = isRegex;
    this._parse();
}

/** @typedef {!{regex: !RegExp, isNegative: boolean}} */
WebInspector.SearchConfig.RegexQuery;

/**
 * @param {{query: string, ignoreCase: boolean, isRegex: boolean}} object
 * @return {!WebInspector.SearchConfig}
 */
WebInspector.SearchConfig.fromPlainObject = function(object)
{
    return new WebInspector.SearchConfig(object.query, object.ignoreCase, object.isRegex);
}

WebInspector.SearchConfig.prototype = {
    /**
     * @override
     * @return {string}
     */
    query: function()
    {
        return this._query;
    },

    /**
     * @override
     * @return {boolean}
     */
    ignoreCase: function()
    {
        return this._ignoreCase;
    },

    /**
     * @override
     * @return {boolean}
     */
    isRegex: function()
    {
        return this._isRegex;
    },

    /**
     * @return {{query: string, ignoreCase: boolean, isRegex: boolean}}
     */
    toPlainObject: function()
    {
        return { query: this.query(), ignoreCase: this.ignoreCase(), isRegex: this.isRegex() };
    },

    _parse: function()
    {
        var filePattern = "-?f(ile)?:(([^\\\\ ]|\\\\.)+)"; // After file: prefix: any symbol except space and backslash or any symbol escaped with a backslash.
        var quotedPattern = "\"(([^\\\\\"]|\\\\.)+)\""; // Inside double quotes: any symbol except double quote and backslash or any symbol escaped with a backslash.

        // A word is a sequence of any symbols except space and backslash or any symbols escaped with a backslash, that does not start with file:.
        var unquotedWordPattern = "((?!-?f(ile)?:)[^\\\\ ]|\\\\.)+";
        var unquotedPattern = unquotedWordPattern + "( +" + unquotedWordPattern + ")*"; // A word or several words separated by space(s).

        var pattern = "(" + filePattern + ")|(" + quotedPattern + ")|(" + unquotedPattern + ")";
        var regexp = new RegExp(pattern, "g");
        var queryParts = this._query.match(regexp) || [];

        /**
         * @type {!Array.<!WebInspector.SearchConfig.QueryTerm>}
         */
        this._fileQueries = [];

        /**
         * @type {!Array.<string>}
         */
        this._queries = [];

        for (var i = 0; i < queryParts.length; ++i) {
            var queryPart = queryParts[i];
            if (!queryPart)
                continue;
            var fileQuery = this._parseFileQuery(queryPart);
            if (fileQuery) {
                this._fileQueries.push(fileQuery);
                /** @type {!Array.<!WebInspector.SearchConfig.RegexQuery>} */
                this._fileRegexQueries = this._fileRegexQueries || [];
                this._fileRegexQueries.push({ regex: new RegExp(fileQuery.text, this.ignoreCase ? "i" : ""), isNegative: fileQuery.isNegative });
                continue;
            }
            if (queryPart.startsWith("\"")) {
                if (!queryPart.endsWith("\""))
                    continue;
                this._queries.push(this._parseQuotedQuery(queryPart));
                continue;
            }
            this._queries.push(this._parseUnquotedQuery(queryPart));
        }
    },

    /**
     * @override
     * @param {string} filePath
     * @return {boolean}
     */
    filePathMatchesFileQuery: function(filePath)
    {
        if (!this._fileRegexQueries)
            return true;
        for (var i = 0; i < this._fileRegexQueries.length; ++i) {
            if (!!filePath.match(this._fileRegexQueries[i].regex) === this._fileRegexQueries[i].isNegative)
                return false;
        }
        return true;
    },

    /**
     * @override
     * @return {!Array.<string>}
     */
    queries: function()
    {
        return this._queries;
    },

    _parseUnquotedQuery: function(query)
    {
        return query.replace(/\\(.)/g, "$1");
    },

    _parseQuotedQuery: function(query)
    {
        return query.substring(1, query.length - 1).replace(/\\(.)/g, "$1");
    },

    /**
     * @param {string} query
     * @return {?WebInspector.SearchConfig.QueryTerm}
     */
    _parseFileQuery: function(query)
    {
        var match = query.match(/^(-)?f(ile)?:/);
        if (!match)
            return null;
        var isNegative = !!match[1];
        query = query.substr(match[0].length);
        var result = "";
        for (var i = 0; i < query.length; ++i) {
            var char = query[i];
            if (char === "*") {
                result += ".*";
            } else if (char === "\\") {
                ++i;
                var nextChar = query[i];
                if (nextChar === " ")
                    result += " ";
            } else {
                if (String.regexSpecialCharacters().indexOf(query.charAt(i)) !== -1)
                    result += "\\";
                result += query.charAt(i);
            }
        }
        return new WebInspector.SearchConfig.QueryTerm(result, isNegative);
    }
}

/**
 * @constructor
 * @param {string} text
 * @param {boolean} isNegative
 */
WebInspector.SearchConfig.QueryTerm = function(text, isNegative)
{
    this.text = text;
    this.isNegative = isNegative;
}
