/*
 * Copyright (C) 2013 Google Inc. All rights reserved.
 *
 * Redistribution and use in source and binary forms, with or without
 * modification, are permitted provided that the following conditions are
 * met:
 *
 *     * Redistributions of source code must retain the above copyright
 * notice, this list of conditions and the following disclaimer.
 *     * Redistributions in binary form must reproduce the above
 * copyright notice, this list of conditions and the following disclaimer
 * in the documentation and/or other materials provided with the
 * distribution.
 *     * Neither the name of Google Inc. nor the names of its
 * contributors may be used to endorse or promote products derived from
 * this software without specific prior written permission.
 *
 * THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS
 * "AS IS" AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT
 * LIMITED TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR
 * A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT
 * OWNER OR CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL,
 * SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT
 * LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE,
 * DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY
 * THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT
 * (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE
 * OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
 */

/**
 * @constructor
 * @extends {WebInspector.PanelWithSidebarTree}
 * @implements {WebInspector.TargetManager.Observer}
 */
WebInspector.LayersPanel = function()
{
    WebInspector.PanelWithSidebarTree.call(this, "layers", 225);
    this.registerRequiredCSS("timeline/timelinePanel.css");
    this._target = null;

    this.panelSidebarElement().classList.add("outline-disclosure", "layer-tree");
    this.sidebarTree.element.classList.remove("sidebar-tree");

    WebInspector.targetManager.observeTargets(this);
    this._currentlySelectedLayer = null;
    this._currentlyHoveredLayer = null;

    this._layerTreeOutline = new WebInspector.LayerTreeOutline(this.sidebarTree);
    this._layerTreeOutline.addEventListener(WebInspector.LayerTreeOutline.Events.LayerSelected, this._onObjectSelected, this);
    this._layerTreeOutline.addEventListener(WebInspector.LayerTreeOutline.Events.LayerHovered, this._onObjectHovered, this);

    this._rightSplitView = new WebInspector.SplitView(false, true, "layerDetailsSplitViewState");
    this.splitView().setMainView(this._rightSplitView);

    this._layers3DView = new WebInspector.Layers3DView();
    this._rightSplitView.setMainView(this._layers3DView);
    this._layers3DView.addEventListener(WebInspector.Layers3DView.Events.ObjectSelected, this._onObjectSelected, this);
    this._layers3DView.addEventListener(WebInspector.Layers3DView.Events.ObjectHovered, this._onObjectHovered, this);
    this._layers3DView.addEventListener(WebInspector.Layers3DView.Events.LayerSnapshotRequested, this._onSnapshotRequested, this);

    this._tabbedPane = new WebInspector.TabbedPane();
    this._rightSplitView.setSidebarView(this._tabbedPane);

    this._layerDetailsView = new WebInspector.LayerDetailsView();
    this._layerDetailsView.addEventListener(WebInspector.LayerDetailsView.Events.ObjectSelected, this._onObjectSelected, this);
    this._tabbedPane.appendTab(WebInspector.LayersPanel.DetailsViewTabs.Details, WebInspector.UIString("Details"), this._layerDetailsView);

    this._paintProfilerView = new WebInspector.LayerPaintProfilerView(this._layers3DView.showImageForLayer.bind(this._layers3DView));
    this._tabbedPane.appendTab(WebInspector.LayersPanel.DetailsViewTabs.Profiler, WebInspector.UIString("Profiler"), this._paintProfilerView);
}

WebInspector.LayersPanel.DetailsViewTabs = {
    Details: "details",
    Profiler: "profiler"
};

WebInspector.LayersPanel.prototype = {
    wasShown: function()
    {
        WebInspector.Panel.prototype.wasShown.call(this);
        this.sidebarTree.element.focus();
        if (this._target)
            this._target.layerTreeModel.enable();
    },

    willHide: function()
    {
        if (this._target)
            this._target.layerTreeModel.disable();
        WebInspector.Panel.prototype.willHide.call(this);
    },

    /**
     * @param {!WebInspector.Target} target
     */
    targetAdded: function(target)
    {
        if (this._target)
            return;
        this._target = target;
        this._target.layerTreeModel.addEventListener(WebInspector.LayerTreeModel.Events.LayerTreeChanged, this._onLayerTreeUpdated, this);
        this._target.layerTreeModel.addEventListener(WebInspector.LayerTreeModel.Events.LayerPainted, this._onLayerPainted, this);
        if (this.isShowing())
            this._target.layerTreeModel.enable();
    },

    /**
     * @param {!WebInspector.Target} target
     */
    targetRemoved: function(target)
    {
        if (this._target !== target)
            return;
        this._target.layerTreeModel.removeEventListener(WebInspector.LayerTreeModel.Events.LayerTreeChanged, this._onLayerTreeUpdated, this);
        this._target.layerTreeModel.removeEventListener(WebInspector.LayerTreeModel.Events.LayerPainted, this._onLayerPainted, this);
        this._target.layerTreeModel.disable();
        this._target = null;
    },

    /**
     * @param {!WebInspector.DeferredLayerTree} deferredLayerTree
     */
    _showLayerTree: function(deferredLayerTree)
    {
        deferredLayerTree.resolve(this._setLayerTree.bind(this));
    },

    _onLayerTreeUpdated: function()
    {
        if (this._target)
            this._setLayerTree(this._target.layerTreeModel.layerTree());
    },

    /**
     * @param {?WebInspector.LayerTreeBase} layerTree
     */
    _setLayerTree: function(layerTree)
    {
        this._layers3DView.setLayerTree(layerTree);
        this._layerTreeOutline.update(layerTree);
        if (this._currentlySelectedLayer && (!layerTree || !layerTree.layerById(this._currentlySelectedLayer.layer.id())))
            this._selectObject(null);
        if (this._currentlyHoveredLayer && (!layerTree || !layerTree.layerById(this._currentlyHoveredLayer.layer.id())))
            this._hoverObject(null);
        this._layerDetailsView.update();
    },

    /**
     * @param {!WebInspector.Event} event
     */
    _onLayerPainted: function(event)
    {
        if (!this._target)
            return;
        this._layers3DView.setLayerTree(this._target.layerTreeModel.layerTree());
        if (this._currentlySelectedLayer && this._currentlySelectedLayer.layer === event.data)
            this._layerDetailsView.update();
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

    /**
     * @param {!WebInspector.Event} event
     */
    _onSnapshotRequested: function(event)
    {
        var layer = /** @type {!WebInspector.Layer} */ (event.data);
        this._tabbedPane.selectTab(WebInspector.LayersPanel.DetailsViewTabs.Profiler);
        this._paintProfilerView.profileLayer(layer);
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
        var node = layer ? layer.nodeForSelfOrAncestor() : null;
        if (node)
            node.highlightForTwoSeconds();
        else if (this._target)
            this._target.domModel.hideDOMNodeHighlight();
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
        var node = layer ? layer.nodeForSelfOrAncestor() : null;
        if (node)
            node.highlight();
        else if (this._target)
            this._target.domModel.hideDOMNodeHighlight();
        this._layerTreeOutline.hoverLayer(layer);
        this._layers3DView.hoverObject(selection);
    },

    __proto__: WebInspector.PanelWithSidebarTree.prototype
}

/**
 * @constructor
 * @implements {WebInspector.Revealer}
 */
WebInspector.LayersPanel.LayerTreeRevealer = function()
{
}

WebInspector.LayersPanel.LayerTreeRevealer.prototype = {
    /**
     * @param {!Object} snapshotData
     * @return {!Promise}
     */
    reveal: function(snapshotData)
    {
        if (!(snapshotData instanceof WebInspector.DeferredLayerTree))
            return Promise.rejectWithError("Internal error: not a WebInspector.DeferredLayerTree");
        var panel = WebInspector.LayersPanel._instance();
        WebInspector.inspectorView.setCurrentPanel(panel);
        panel._showLayerTree(/** @type {!WebInspector.DeferredLayerTree} */ (snapshotData));
        return Promise.resolve();
    }
}

/**
 * @return {!WebInspector.LayersPanel}
 */
WebInspector.LayersPanel._instance = function()
{
    if (!WebInspector.LayersPanel._instanceObject)
        WebInspector.LayersPanel._instanceObject = new WebInspector.LayersPanel();
    return WebInspector.LayersPanel._instanceObject;
}

/**
 * @constructor
 * @implements {WebInspector.PanelFactory}
 */
WebInspector.LayersPanelFactory = function()
{
}

WebInspector.LayersPanelFactory.prototype = {
    /**
     * @return {!WebInspector.Panel}
     */
    createPanel: function()
    {
        return WebInspector.LayersPanel._instance();
    }
}
