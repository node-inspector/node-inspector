// Copyright 2014 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

/**
 * @constructor
 * @extends {WebInspector.Object}
 * @param {!Window} window
 * @param {!InspectorFrontendHostAPI} frontendHost
 */
WebInspector.ZoomManager = function(window, frontendHost)
{
    this._frontendHost = frontendHost;
    this._zoomFactor = this._frontendHost.zoomFactor();
    window.addEventListener("resize", this._onWindowResize.bind(this), true);
};

WebInspector.ZoomManager.Events = {
    ZoomChanged: "ZoomChanged"
};

WebInspector.ZoomManager.prototype = {
    /**
     * @return {number}
     */
    zoomFactor: function()
    {
        return this._zoomFactor;
    },

    _onWindowResize: function()
    {
        var oldZoomFactor = this._zoomFactor;
        this._zoomFactor = this._frontendHost.zoomFactor();
        if (oldZoomFactor !== this._zoomFactor)
            this.dispatchEventToListeners(WebInspector.ZoomManager.Events.ZoomChanged, {from: oldZoomFactor, to: this._zoomFactor});
    },

    __proto__: WebInspector.Object.prototype
};

/**
 * @type {!WebInspector.ZoomManager}
 */
WebInspector.zoomManager;
