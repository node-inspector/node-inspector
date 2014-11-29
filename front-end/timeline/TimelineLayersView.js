/*
 * Copyright 2014 The Chromium Authors. All rights reserved.
 * Use of this source code is governed by a BSD-style license that can be
 * found in the LICENSE file.
 */

/**
 * @constructor
 * @extends {WebInspector.SplitView}
 */
WebInspector.TimelineLayersView = function()
{
    WebInspector.SplitView.call(this, true, false, "timelineLayersView");
    this.element.classList.add("timeline-layers-view");
    this._rightSplitView = new WebInspector.SplitView(true, true, "timelineLayersViewDetails");
    this._rightSplitView.element.classList.add("timeline-layers-view-properties");
    this.setMainView(this._rightSplitView);

    this._paintTiles = [];

    var vbox = new WebInspector.VBox();
    vbox.element.classList.add("outline-disclosure", "layer-tree");
    var sidebarTreeElement = vbox.element.createChild("ol");
    this.setSidebarView(vbox);

    var treeOutline = new TreeOutline(sidebarTreeElement);
    this._layerTreeOutline = new WebInspector.LayerTreeOutline(treeOutline);
    this._layerTreeOutline.addEventListener(WebInspector.LayerTreeOutline.Events.LayerSelected, this._onObjectSelected, this);
    this._layerTreeOutline.addEventListener(WebInspector.LayerTreeOutline.Events.LayerHovered, this._onObjectHovered, this);

    this._layers3DView = new WebInspector.Layers3DView();
    this._layers3DView.addEventListener(WebInspector.Layers3DView.Events.ObjectSelected, this._onObjectSelected, this);
    this._layers3DView.addEventListener(WebInspector.Layers3DView.Events.ObjectHovered, this._onObjectHovered, this);
    this._layers3DView.addEventListener(WebInspector.Layers3DView.Events.PaintProfilerRequested, this._jumpToPaintEvent, this);
    this._rightSplitView.setMainView(this._layers3DView);

    this._layerDetailsView = new WebInspector.LayerDetailsView();
    this._rightSplitView.setSidebarView(this._layerDetailsView);
    this._layerDetailsView.addEventListener(WebInspector.LayerDetailsView.Events.PaintProfilerRequested, this._jumpToPaintEvent, this);
    this._layerDetailsView.addEventListener(WebInspector.LayerDetailsView.Events.ObjectSelected, this._onObjectSelected, this);
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
            this._paints[i].loadPicture(tilesReadyBarrier.createCallback(onSnapshotLoaded.bind(this, this._paints[i])));
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
            this._layerTreeOutline.update(layerTree);
            this._layers3DView.setLayerTree(layerTree);
            this._layers3DView.setTiles(this._paintTiles);
        }
    },

    /**
     * @param {?WebInspector.Layers3DView.Selection} selection
     */
    _selectObject: function(selection)
    {
        var layer = selection && selection.layer;
        if (this._currentlySelectedLayer === selection)
            return;
        this._currentlySelectedLayer = selection;
        this._toggleNodeHighlight(layer ? layer.nodeForSelfOrAncestor() : null);
        this._layerTreeOutline.selectLayer(layer);
        this._layers3DView.selectObject(selection);
        this._layerDetailsView.setObject(selection);
    },

    /**
     * @param {?WebInspector.Layers3DView.Selection} selection
     */
    _hoverObject: function(selection)
    {
        var layer = selection && selection.layer;
        if (this._currentlyHoveredLayer === selection)
            return;
        this._currentlyHoveredLayer = selection;
        this._toggleNodeHighlight(layer ? layer.nodeForSelfOrAncestor() : null);
        this._layerTreeOutline.hoverLayer(layer);
        this._layers3DView.hoverObject(selection);
    },

    /**
     * @param {?WebInspector.DOMNode} node
     */
    _toggleNodeHighlight: function(node)
    {
        if (node) {
            node.highlightForTwoSeconds();
            return;
        }
        if (this._target)
            this._target.domModel.hideDOMNodeHighlight();

    },

    /**
     * @param {!WebInspector.Event} event
     */
    _onObjectSelected: function(event)
    {
        var selection = /** @type {!WebInspector.Layers3DView.Selection} */ (event.data);
        this._selectObject(selection);
    },

    /**
     * @param {!WebInspector.Event} event
     */
    _onObjectHovered: function(event)
    {
        var selection = /** @type {!WebInspector.Layers3DView.Selection} */ (event.data);
        this._hoverObject(selection);
    },

    _disposeTiles: function()
    {
        for (var i = 0; i < this._paintTiles.length; ++i)
            this._paintTiles[i].snapshot.dispose();
        this._paintTiles = [];
    },

    __proto__: WebInspector.SplitView.prototype
}
