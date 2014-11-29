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

/**
 * @constructor
 * @extends {WebInspector.RequestView}
 * @param {!WebInspector.NetworkRequest} request
 * @param {!WebInspector.ParsedJSON} parsedJSON
 */
WebInspector.RequestJSONView = function(request, parsedJSON)
{
    WebInspector.RequestView.call(this, request);
    this._parsedJSON = parsedJSON;
    this.element.classList.add("json");
}

// "false", "true", "null", ",", "{", "}", "[", "]", number, double-quoted string.
WebInspector.RequestJSONView._jsonToken = new RegExp('(?:false|true|null|[,\\{\\}\\[\\]]|(?:-?\\b(?:0|[1-9][0-9]*)(?:\\.[0-9]+)?(?:[eE][+-]?[0-9]+)?\\b)|(?:\"(?:[^\\0-\\x08\\x0a-\\x1f\"\\\\]|\\\\(?:[\"/\\\\bfnrt]|u[0-9A-Fa-f]{4}))*\"))', 'g');

// Escaped unicode char.
WebInspector.RequestJSONView._escapedUnicode = new RegExp('\\\\(?:([^u])|u(.{4}))', 'g');

// Map from escaped char to its literal value.
WebInspector.RequestJSONView._standardEscapes = {'"': '"', '/': '/', '\\': '\\', 'b': '\b', 'f': '\f', 'n': '\n', 'r': '\r', 't': '\t'};

/**
 * @param {string} full
 * @param {string} standard
 * @param {string} unicode
 * @return {string}
 */
WebInspector.RequestJSONView._unescape = function(full, standard, unicode)
{
    return standard ? WebInspector.RequestJSONView._standardEscapes[standard] : String.fromCharCode(parseInt(unicode, 16));
}

/**
 * @param {string} text
 * @return {string}
 */
WebInspector.RequestJSONView._unescapeString = function(text)
{
    return text.indexOf("\\") === -1 ? text : text.replace(WebInspector.RequestJSONView._escapedUnicode, WebInspector.RequestJSONView._unescape);
}

/**
 * @return {*}
 */
WebInspector.RequestJSONView._buildObjectFromJSON = function(text)
{
    var regExp = WebInspector.RequestJSONView._jsonToken;
    regExp.lastIndex = 0;
    var result = [];
    var tip = result;
    var stack = [];
    var key = undefined;
    var token = undefined;
    var lastToken = undefined;
    while (true) {
        var match = regExp.exec(text);
        if (match === null)
            break;
        lastToken = token;
        token = match[0];
        var code = token.charCodeAt(0);
        if ((code === 0x5b) || (code === 0x7b)) { // [ or {
            var newTip = (code === 0x5b) ? [] : {};
            tip[key || tip.length] = newTip;
            stack.push(tip);
            tip = newTip;
        } else if ((code === 0x5d) || (code === 0x7d)) { // ] or }
            tip = stack.pop();
            if (!tip)
                break;
        } else if (code === 0x2C) { // ,
            if ((tip instanceof Array) && (lastToken === undefined || lastToken === "[" || lastToken === ","))
                tip[tip.length] = undefined;
        } else if (code === 0x22) { // "
            token = WebInspector.RequestJSONView._unescapeString(token.substring(1, token.length - 1));
            if (!key) {
                if (tip instanceof Array) {
                  key = tip.length;
                } else {
                    key = token || "";
                    continue;
                }
            }
            tip[key] = token;
        } else if (code === 0x66) { // f
            tip[key || tip.length] = false;
        } else if (code === 0x6e) { // n
            tip[key || tip.length] = null;
        } else if (code === 0x74) { // t
            tip[key || tip.length] = true;
        } else { // sign or digit
            tip[key || tip.length] = +(token);
        }
        key = undefined;
    }
    return (result.length > 1) ? result : result[0];
}

/**
 * @param {string} text
 * @return {?WebInspector.ParsedJSON}
 */
WebInspector.RequestJSONView.parseJSON = function(text)
{
    // Trim stubs like "while(1)", "for(;;)", weird numbers, etc. We need JSON start.
    var inner = WebInspector.RequestJSONView._findBrackets(text, "{", "}");
    var inner2 = WebInspector.RequestJSONView._findBrackets(text, "[", "]");
    inner = inner2.length > inner.length ? inner2 : inner;
    var inner3 = WebInspector.RequestJSONView._findBrackets(text, "(", ")");
    if (inner3.length - 2 > inner.length) {
        inner = inner3;
        ++inner.start;
        --inner.end;
    }
    if (inner.length === -1)
        return null;


    var prefix = text.substring(0, inner.start);
    var suffix = text.substring(inner.end + 1);
    text = text.substring(inner.start, inner.end + 1);

    try {
        return new WebInspector.ParsedJSON(WebInspector.RequestJSONView._buildObjectFromJSON(text), prefix, suffix);
    } catch (e) {
        return null;
    }
}

/**
 * @param {string} text
 * @param {string} open
 * @param {string} close
 * @return {{start: number, end: number, length: number}}
 */
WebInspector.RequestJSONView._findBrackets = function(text, open, close)
{
    var start = text.indexOf(open);
    var end = text.lastIndexOf(close);
    var length = end - start - 1;
    if (start == -1 || end == -1 || end < start)
        length = -1;
    return {start: start, end: end, length: length};
}

WebInspector.RequestJSONView.prototype = {
    wasShown: function()
    {
        this._initialize();
    },

    _initialize: function()
    {
        if (this._initialized)
            return;
        this._initialized = true;

        var obj = WebInspector.RemoteObject.fromLocalObject(this._parsedJSON.data);
        var title = this._parsedJSON.prefix + obj.description + this._parsedJSON.suffix;
        var section = new WebInspector.ObjectPropertiesSection(obj, title);
        section.expand();
        section.editable = false;
        this.element.appendChild(section.element);
    },

    __proto__: WebInspector.RequestView.prototype
}

/**
 * @constructor
 */
WebInspector.ParsedJSON = function(data, prefix, suffix)
{
    this.data = data;
    this.prefix = prefix;
    this.suffix = suffix;
}
