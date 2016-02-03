/*
 * Copyright 2014 The Chromium Authors. All rights reserved.
 * Use of this source code is governed by a BSD-style license that can be
 * found in the LICENSE file.
 */

/**
 * @constructor
 * @extends {WebInspector.SplitWidget}
 */
WebInspector.TimelineLayersView = function()
{
    WebInspector.SplitWidget.call(this, true, false, "timelineLayersView");
    this.element.classList.add("timeline-layers-view");
    this._rightSplitWidget = new WebInspector.SplitWidget(true, true, "timelineLayersViewDetails");
    this._rightSplitWidget.element.classList.add("timeline-layers-view-properties");
    this.setMainWidget(this._rightSplitWidget);

    this._paintTiles = [];

    var vbox = new WebInspector.VBox();
    this.setSidebarWidget(vbox);

    this._layerViewHost = new WebInspector.LayerViewHost();

    var layerTreeOutline = new WebInspector.LayerTreeOutline(this._layerViewHost);
    vbox.element.appendChild(layerTreeOutline.element);

    this._layers3DView = new WebInspector.Layers3DView(this._layerViewHost);
    this._layers3DView.addEventListener(WebInspector.Layers3DView.Events.PaintProfilerRequested, this._jumpToPaintEvent, this);
    this._rightSplitWidget.setMainWidget(this._layers3DView);

    var layerDetailsView = new WebInspector.LayerDetailsView(this._layerViewHost);
    this._rightSplitWidget.setSidebarWidget(layerDetailsView);
    layerDetailsView.addEventListener(WebInspector.LayerDetailsView.Events.PaintProfilerRequested, this._jumpToPaintEvent, this);

}

WebInspector.TimelineLayersView.prototype = {
    /**
     * @param {!WebInspector.DeferredLayerTree} deferredLayerTree
     * @param {?Array.<!WebInspector.LayerPaintEvent>} paints
     */
    showLayerTree: function(deferredLayerTree, paints)
    {
        this._disposeTiles();
        this._deferredLayerTree = deferredLayerTree;
        this._paints = paints;
        if (this.isShowing())
            this._update();
        else
            this._updateWhenVisible = true;
    },

    wasShown: function()
    {
        if (this._updateWhenVisible) {
            this._updateWhenVisible = false;
            this._update();
        }
    },

    /**
     * @param {!WebInspector.TimelineModel} model
     * @param {!WebInspector.TimelineModeViewDelegate} delegate
     */
    setTimelineModelAndDelegate: function(model, delegate)
    {
        this._model = model;
        this._delegate = delegate;
    },

    /**
     * @param {!WebInspector.Event} event
     */
    _jumpToPaintEvent: function(event)
    {
        var traceEvent = event.data;
        var eventRecord;

        /**
         * @param {!WebInspector.TimelineModel.Record} record
         * @return {boolean}
         */
        function findRecordWithEvent(record)
        {
            if (record.traceEvent() === traceEvent) {
                eventRecord = record;
                return true;
            }
            return false;
        }

        this._model.forAllRecords(findRecordWithEvent);
        if (eventRecord)
            this._delegate.showNestedRecordDetails(eventRecord);
    },

    _update: function()
    {
        var layerTree;

        this._target = this._deferredLayerTree.target();
        var originalTiles = this._paintTiles;
        var tilesReadyBarrier = new CallbackBarrier();
        this._deferredLayerTree.resolve(tilesReadyBarrier.createCallback(onLayersReady));
        for (var i = 0; this._paints && i < this._paints.length; ++i)
            this._paints[i].loadSnapshot(tilesReadyBarrier.createCallback(onSnapshotLoaded.bind(this, this._paints[i])));
        tilesReadyBarrier.callWhenDone(onLayersAndTilesReady.bind(this));

        /**
         * @param {!WebInspector.LayerTreeBase} resolvedLayerTree
         */
        function onLayersReady(resolvedLayerTree)
        {
            layerTree = resolvedLayerTree;
        }

        /**
         * @param {!WebInspector.LayerPaintEvent} paintEvent
         * @param {?Array.<number>} rect
         * @param {?WebInspector.PaintProfilerSnapshot} snapshot
         * @this {WebInspector.TimelineLayersView}
         */
        function onSnapshotLoaded(paintEvent, rect, snapshot)
        {
            if (!rect || !snapshot)
                return;
            // We're too late and there's a new generation of tiles being loaded.
            if (originalTiles !== this._paintTiles) {
                snapshot.dispose();
                return;
            }
            this._paintTiles.push({layerId: paintEvent.layerId(), rect: rect, snapshot: snapshot, traceEvent: paintEvent.event()});
        }

        /**
         * @this {WebInspector.TimelineLayersView}
         */
        function onLayersAndTilesReady()
        {
            this._layerViewHost.setLayerTree(layerTree);
            this._layers3DView.setTiles(this._paintTiles);
        }
    },

    _disposeTiles: function()
    {
        for (var i = 0; i < this._paintTiles.length; ++i)
            this._paintTiles[i].snapshot.dispose();
        this._paintTiles = [];
    },

    __proto__: WebInspector.SplitWidget.prototype
}
