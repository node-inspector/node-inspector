/**
 * Copyright 2014 The Chromium Authors. All rights reserved.
 * Use of this source code is governed by a BSD-style license that can be
 * found in the LICENSE file.
 */

/**
 * @constructor
 * @extends {WebInspector.Object}
 */
WebInspector.CSSParser = function()
{
    this._worker = new WorkerRuntime.Worker("script_formatter_worker");
    this._worker.onmessage = this._onRuleChunk.bind(this);
    this._rules = [];
}

WebInspector.CSSParser.Events = {
    RulesParsed: "RulesParsed"
}

WebInspector.CSSParser.prototype = {
    /**
     * @param {!WebInspector.CSSStyleSheetHeader} styleSheetHeader
     * @param {function(!Array.<!WebInspector.CSSParser.Rule>)=} callback
     */
    fetchAndParse: function(styleSheetHeader, callback)
    {
        this._lock();
        this._finishedCallback = callback;
        styleSheetHeader.requestContent(this._innerParse.bind(this));
    },

    /**
     * @param {string} text
     * @param {function(!Array.<!WebInspector.CSSParser.Rule>)=} callback
     */
    parse: function(text, callback)
    {
        this._lock();
        this._finishedCallback = callback;
        this._innerParse(text);
    },

    dispose: function()
    {
        if (this._worker) {
            this._worker.terminate();
            delete this._worker;
        }
    },

    /**
     * @return {!Array.<!WebInspector.CSSParser.Rule>}
     */
    rules: function()
    {
        return this._rules;
    },

    _lock: function()
    {
        console.assert(!this._parsingStyleSheet, "Received request to parse stylesheet before previous was completed.");
        this._parsingStyleSheet = true;
    },

    _unlock: function()
    {
        delete this._parsingStyleSheet;
    },

    /**
     * @param {?string} text
     */
    _innerParse: function(text)
    {
        this._rules = [];
        this._worker.postMessage({ method: "parseCSS", params: { content: text } });
    },

    /**
     * @param {!MessageEvent} event
     */
    _onRuleChunk: function(event)
    {
        var data = /** @type {!WebInspector.CSSParser.DataChunk} */ (event.data);
        var chunk = data.chunk;
        for (var i = 0; i < chunk.length; ++i)
            this._rules.push(chunk[i]);

        if (data.isLastChunk)
            this._onFinishedParsing();
        this.dispatchEventToListeners(WebInspector.CSSParser.Events.RulesParsed);
    },

    _onFinishedParsing: function()
    {
        this._unlock();
        if (this._finishedCallback)
            this._finishedCallback(this._rules);
    },

    __proto__: WebInspector.Object.prototype,
}

/**
 * @typedef {{isLastChunk: boolean, chunk: !Array.<!WebInspector.CSSParser.Rule>}}
 */
WebInspector.CSSParser.DataChunk;

/**
 * @typedef {{selectorText: string, lineNumber: number, columnNumber: number, properties: !Array.<!WebInspector.CSSParser.Property>}}
 */
WebInspector.CSSParser.StyleRule;

/**
 * @typedef {{atRule: string, lineNumber: number, columnNumber: number}}
 */
WebInspector.CSSParser.AtRule;

/**
 * @typedef {(WebInspector.CSSParser.StyleRule|WebInspector.CSSParser.AtRule)}
 */
WebInspector.CSSParser.Rule;

/**
 * @typedef {{name: string, value: string}}
 */
WebInspector.CSSParser.Property;
