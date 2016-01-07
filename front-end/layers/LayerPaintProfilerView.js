// Copyright 2014 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

/**
 * @constructor
 * @param {function(!WebInspector.Layer, string=)} showImageForLayerCallback
 * @extends {WebInspector.SplitWidget}
 */
WebInspector.LayerPaintProfilerView = function(showImageForLayerCallback)
{
    WebInspector.SplitWidget.call(this, true, false);

    this._showImageForLayerCallback = showImageForLayerCallback;
    this._logTreeView = new WebInspector.PaintProfilerCommandLogView();
    this.setSidebarWidget(this._logTreeView);
    this._paintProfilerView = new WebInspector.PaintProfilerView(this._showImage.bind(this));
    this.setMainWidget(this._paintProfilerView);

    this._paintProfilerView.addEventListener(WebInspector.PaintProfilerView.Events.WindowChanged, this._onWindowChanged, this);
}

WebInspector.LayerPaintProfilerView.prototype = {
    /**
     * @param {!WebInspector.Layer} layer
     */
    profileLayer: function(layer)
    {
        this._logTreeView.setCommandLog(null, []);
        this._paintProfilerView.setSnapshotAndLog(null, [], null);
        /** @type {!WebInspector.AgentLayer} */ (layer).requestSnapshot(onSnapshotDone.bind(this));

        /**
         * @param {!WebInspector.PaintProfilerSnapshot=} snapshot
         * @this {WebInspector.LayerPaintProfilerView}
         */
        function onSnapshotDone(snapshot)
        {
            this._layer = layer;
            snapshot.commandLog(onCommandLogDone.bind(this, snapshot));
        }

        /**
         * @param {!WebInspector.PaintProfilerSnapshot=} snapshot
         * @param {!Array.<!Object>=} log
         * @this {WebInspector.LayerPaintProfilerView}
         */
        function onCommandLogDone(snapshot, log)
        {
            this._logTreeView.setCommandLog(snapshot.target(), log || []);
            this._paintProfilerView.setSnapshotAndLog(snapshot || null, log || [], null);
        }
    },

    _onWindowChanged: function()
    {
        var window = this._paintProfilerView.windowBoundaries();
        this._logTreeView.updateWindow(window.left, window.right);
    },

    /**
     * @param {string=} imageURL
     */
    _showImage: function(imageURL)
    {
        this._showImageForLayerCallback(this._layer, imageURL);
    },

    __proto__: WebInspector.SplitWidget.prototype
};

