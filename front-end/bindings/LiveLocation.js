// Copyright 2014 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

/**
 * @constructor
 * @param {function(!WebInspector.UILocation):(boolean|undefined)} updateDelegate
 */
WebInspector.LiveLocation = function(updateDelegate)
{
    this._updateDelegate = updateDelegate;
}

WebInspector.LiveLocation.prototype = {
    update: function()
    {
        var uiLocation = this.uiLocation();
        if (!uiLocation)
            return;
        if (this._updateDelegate(uiLocation))
            this.dispose();
    },

    /**
     * @return {?WebInspector.UILocation}
     */
    uiLocation: function()
    {
        throw "Not implemented";
    },

    dispose: function()
    {
        // Overridden by subclasses.
    }
}
