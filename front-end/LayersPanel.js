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

importScript("LayerTreeModel.js");
importScript("LayerTree.js");
importScript("Layers3DView.js");
importScript("LayerDetailsView.js");

/**
 * @constructor
 * @extends {WebInspector.Panel}
 */
WebInspector.LayersPanel = function()
{
    WebInspector.Panel.call(this, "layers");
    this.registerRequiredCSS("layersPanel.css");

    const initialLayerTreeSidebarWidth = 225;
    const minimumMainWidthPercent = 0.5;
    this.createSidebarViewWithTree();
    this.sidebarElement.addStyleClass("outline-disclosure");
    this.sidebarTreeElement.removeStyleClass("sidebar-tree");

    this._model = new WebInspector.LayerTreeModel();
    this._model.addEventListener(WebInspector.LayerTreeModel.Events.LayerTreeChanged, this._onLayerTreeUpdated, this);
    this._currentlySelectedLayer = null;
    this._currentlyHoveredLayer = null;

    this._layerTree = new WebInspector.LayerTree(this._model, this.sidebarTree);
    this._layerTree.addEventListener(WebInspector.LayerTree.Events.LayerSelected, this._onLayerSelected, this);
    this._layerTree.addEventListener(WebInspector.LayerTree.Events.LayerHovered, this._onLayerHovered, this);

    this._layerDetailsSplitView = new WebInspector.SplitView(false, "layerDetailsSplitView");
    this._layerDetailsSplitView.show(this.splitView.mainElement);

    this._layers3DView = new WebInspector.Layers3DView(this._model);
    this._layers3DView.show(this._layerDetailsSplitView.firstElement());
    this._layers3DView.addEventListener(WebInspector.Layers3DView.Events.LayerSelected, this._onLayerSelected, this);
    this._layers3DView.addEventListener(WebInspector.Layers3DView.Events.LayerHovered, this._onLayerHovered, this);

    this._layerDetailsView = new WebInspector.LayerDetailsView();
    this._layerDetailsView.show(this._layerDetailsSplitView.secondElement());

    this._model.requestLayers();
}

WebInspector.LayersPanel.prototype = {
    wasShown: function()
    {
        WebInspector.Panel.prototype.wasShown.call(this);
        this._layerTree.setVisible(true);
        this.sidebarTreeElement.focus();
    },

    willHide: function()
    {
        this._layerTree.setVisible(false);
        WebInspector.Panel.prototype.willHide.call(this);
    },

    _onLayerTreeUpdated: function()
    {
        if (this._currentlySelectedLayer && !this._model.layerById(this._currentlySelectedLayer.id()))
            this._selectLayer(null);
        if (this._currentlyHoveredLayer && !this._model.layerById(this._currentlyHoveredLayer.id()))
            this._hoverLayer(null);
    },

    /**
     * @param {WebInspector.Event} event
     */
    _onLayerSelected: function(event)
    {
        var layer = /** @type WebInspector.Layer */ (event.data);
        this._selectLayer(layer);
    },

    /**
     * @param {WebInspector.Event} event
     */
    _onLayerHovered: function(event)
    {
        var layer = /** @type WebInspector.Layer */ (event.data);
        this._hoverLayer(layer);
    },

    /**
     * @param {WebInspector.Layer?} layer
     */
    _selectLayer: function(layer)
    {
        if (this._currentlySelectedLayer === layer)
            return;
        this._currentlySelectedLayer = layer;
        var nodeId = layer && layer.nodeIdForSelfOrAncestor();
        if (nodeId)
            WebInspector.domAgent.highlightDOMNodeForTwoSeconds(nodeId);
        else
            WebInspector.domAgent.hideDOMNodeHighlight();
        this._layerTree.selectLayer(layer);
        this._layers3DView.selectLayer(layer);
        this._layerDetailsView.showLayer(layer);
    },

    /**
     * @param {WebInspector.Layer?} layer
     */
    _hoverLayer: function(layer)
    {
        if (this._currentlyHoveredLayer === layer)
            return;
        this._currentlyHoveredLayer = layer;
        var nodeId = layer && layer.nodeIdForSelfOrAncestor();
        if (nodeId)
            WebInspector.domAgent.highlightDOMNode(nodeId);
        else
            WebInspector.domAgent.hideDOMNodeHighlight();
        this._layerTree.hoverLayer(layer);
        this._layers3DView.hoverLayer(layer);
    },

    __proto__: WebInspector.Panel.prototype
}
