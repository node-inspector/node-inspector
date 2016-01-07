// Copyright (c) 2015 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

/**
 * @constructor
 * @extends {HTMLInputElement}
 */
WebInspector.HistoryInput = function()
{
}

/**
 * @return {!WebInspector.HistoryInput}
 */
WebInspector.HistoryInput.create = function()
{
    if (!WebInspector.HistoryInput._constructor)
        WebInspector.HistoryInput._constructor = registerCustomElement("input", "history-input", WebInspector.HistoryInput.prototype);

    return /** @type {!WebInspector.HistoryInput} */(new WebInspector.HistoryInput._constructor());
}

WebInspector.HistoryInput.prototype = {
    createdCallback: function()
    {
        this._history = [""];
        this._historyPosition = 0;
        this.addEventListener("keydown", this._onKeyDown.bind(this), false);
        this.addEventListener("input", this._onInput.bind(this), false);
    },

    /**
     * @param {!Event} event
     */
    _onInput: function(event)
    {
        if (this._history.length === this._historyPosition + 1)
            this._history[this._history.length - 1] = this.value;
    },

    /**
     * @param {!Event} event
     */
    _onKeyDown: function(event)
    {
        if (event.keyCode === WebInspector.KeyboardShortcut.Keys.Up.code) {
            this._historyPosition = Math.max(this._historyPosition - 1, 0);
            this.value = this._history[this._historyPosition];
            this.dispatchEvent(createEvent("input", true, true));
            event.consume(true);
        } else if (event.keyCode === WebInspector.KeyboardShortcut.Keys.Down.code) {
            this._historyPosition = Math.min(this._historyPosition + 1, this._history.length - 1);
            this.value = this._history[this._historyPosition];
            this.dispatchEvent(createEvent("input", true, true));
            event.consume(true);
        } else if (event.keyCode === WebInspector.KeyboardShortcut.Keys.Enter.code) {
            this._saveToHistory();
        }
    },

    _saveToHistory: function()
    {
        if (this._history.length > 1 && this._history[this._history.length - 2] === this.value)
            return;
        this._history[this._history.length - 1] = this.value;
        this._historyPosition = this._history.length - 1;
        this._history.push("");
    },

    __proto__: HTMLInputElement.prototype
}

