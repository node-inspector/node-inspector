// Copyright 2014 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

/**
 * @constructor
 * @extends {WebInspector.Object}
 */
WebInspector.Lock = function()
{
    this._count = 0; // Reentrant.
}

/**
 * @enum {string}
 */
WebInspector.Lock.Events = {
    StateChanged: "StateChanged"
}

WebInspector.Lock.prototype = {
    /**
     * @return {boolean}
     */
    isAcquired: function()
    {
        return !!this._count;
    },

    acquire: function()
    {
        if (++this._count === 1)
            this.dispatchEventToListeners(WebInspector.Lock.Events.StateChanged);
    },

    release: function()
    {
        --this._count;
        if (this._count < 0) {
            console.error("WebInspector.Lock acquire/release calls are unbalanced " + new Error().stack);
            return;
        }
        if (!this._count)
            this.dispatchEventToListeners(WebInspector.Lock.Events.StateChanged);
    },

    __proto__: WebInspector.Object.prototype
}
