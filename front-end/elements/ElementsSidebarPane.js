// Copyright (c) 2014 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

/**
 * @constructor
 * @extends {WebInspector.SidebarPane}
 * @param {string} title
 */
WebInspector.ElementsSidebarPane = function(title)
{
    WebInspector.SidebarPane.call(this, title);
    this._updateThrottler = new WebInspector.Throttler(100);
    this._node = null;
}

WebInspector.ElementsSidebarPane.prototype = {
    /**
     * @return {?WebInspector.DOMNode}
     */
    node: function()
    {
        return this._node;
    },

    /**
     * @param {?WebInspector.DOMNode} node
     */
    setNode: function(node)
    {
        this._node = node;
        this.update();
    },

    /**
     * @param {!WebInspector.Throttler.FinishCallback} finishedCallback
     * @protected
     */
    doUpdate: function(finishedCallback)
    {
        finishedCallback();
    },

    update: function()
    {
        this._updateWhenVisible = !this.isShowing();
        if (this._updateWhenVisible)
            return;
        this._updateThrottler.schedule(innerUpdate.bind(this));

        /**
         * @param {!WebInspector.Throttler.FinishCallback} finishedCallback
         * @this {WebInspector.ElementsSidebarPane}
         */
        function innerUpdate(finishedCallback)
        {
            if (this.isShowing())
                this.doUpdate(finishedCallback);
            else
                finishedCallback();
        }
    },

    wasShown: function()
    {
        WebInspector.SidebarPane.prototype.wasShown.call(this);
        this.update();
    },

    __proto__: WebInspector.SidebarPane.prototype
}
