// Copyright 2014 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

/**
 * @constructor
 * @extends {WebInspector.Widget}
 */
WebInspector.ThrottledWidget = function()
{
    WebInspector.Widget.call(this);
    this._updateThrottler = new WebInspector.Throttler(100);
    this._updateWhenVisible = false;
}

WebInspector.ThrottledWidget.prototype = {
    /**
     * @protected
     * @return {!Promise.<?>}
     */
    doUpdate: function()
    {
        return Promise.resolve();
    },

    update: function()
    {
        this._updateWhenVisible = !this.isShowing();
        if (this._updateWhenVisible)
            return;
        this._updateThrottler.schedule(innerUpdate.bind(this));

        /**
         * @this {WebInspector.ThrottledWidget}
         * @return {!Promise.<?>}
         */
        function innerUpdate()
        {
            if (this.isShowing()) {
                return this.doUpdate();
            } else {
                this._updateWhenVisible = true;
                return Promise.resolve();
            }
        }
    },

    /**
     * @override
     */
    wasShown: function()
    {
        WebInspector.Widget.prototype.wasShown.call(this);
        if (this._updateWhenVisible)
            this.update();
    },

    __proto__: WebInspector.Widget.prototype
}
