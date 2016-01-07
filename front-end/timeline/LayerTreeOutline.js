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
 * @param {!WebInspector.LayerViewHost} layerViewHost
 * @extends {WebInspector.Object}
 * @implements {WebInspector.LayerView}
 */
WebInspector.LayerTreeOutline = function(layerViewHost)
{
    WebInspector.Object.call(this);
    this._layerViewHost = layerViewHost;
    this._layerViewHost.registerView(this);

    this._treeOutline = new TreeOutlineInShadow();
    this._treeOutline.element.classList.add("layer-tree");
    this._treeOutline.element.addEventListener("mousemove", this._onMouseMove.bind(this), false);
    this._treeOutline.element.addEventListener("mouseout", this._onMouseMove.bind(this), false);
    this._treeOutline.element.addEventListener("contextmenu", this._onContextMenu.bind(this), true);

    this._lastHoveredNode = null;
    this.element = this._treeOutline.element;
    this._layerViewHost.showInternalLayersSetting().addChangeListener(this._update, this);
}

WebInspector.LayerTreeOutline.prototype = {
    focus: function()
    {
        this._treeOutline.focus();
    },

    /**
     * @param {?WebInspector.LayerView.Selection} selection
     * @override
     */
    selectObject: function(selection)
    {
        this.hoverObject(null);
        var layer = selection && selection.layer();
        var node = layer && layer[WebInspector.LayerTreeElement._symbol];
        if (node)
            node.revealAndSelect(true);
        else if (this._treeOutline.selectedTreeElement)
            this._treeOutline.selectedTreeElement.deselect();
    },

    /**
     * @param {?WebInspector.LayerView.Selection} selection
     * @override
     */
    hoverObject: function(selection)
    {
        var layer = selection && selection.layer();
        var node = layer && layer[WebInspector.LayerTreeElement._symbol];
        if (node === this._lastHoveredNode)
            return;
        if (this._lastHoveredNode)
            this._lastHoveredNode.setHovered(false);
        if (node)
            node.setHovered(true);
        this._lastHoveredNode = node;
    },

    /**
     * @param {?WebInspector.LayerTreeBase} layerTree
     * @override
     */
    setLayerTree: function(layerTree)
    {
        this._layerTree = layerTree;
        this._update();
    },

    _update: function()
    {
        var showInternalLayers = this._layerViewHost.showInternalLayersSetting().get();
        var seenLayers = new Map();
        var root = null;
        if (this._layerTree) {
            if (!showInternalLayers)
                root = this._layerTree.contentRoot();
            if (!root)
                root = this._layerTree.root();
        }

        /**
         * @param {!WebInspector.Layer} layer
         * @this {WebInspector.LayerTreeOutline}
         */
        function updateLayer(layer)
        {
            if (!layer.drawsContent() && !showInternalLayers)
                return;
            if (seenLayers.get(layer))
                console.assert(false, "Duplicate layer: " + layer.id());
            seenLayers.set(layer, true);
            var node = layer[WebInspector.LayerTreeElement._symbol];
            var parentLayer = layer.parent();
            // Skip till nearest visible ancestor.
            while (parentLayer && parentLayer !== root && !parentLayer.drawsContent() && !showInternalLayers)
                parentLayer = parentLayer.parent();
            var parent = layer === root ? this._treeOutline : parentLayer[WebInspector.LayerTreeElement._symbol];
            if (!parent) {
                console.assert(false, "Parent is not in the tree");
                return;
            }
            if (!node) {
                node = new WebInspector.LayerTreeElement(this, layer);
                parent.appendChild(node);
                // Expand all new non-content layers to expose content layers better.
                if (!layer.drawsContent())
                    node.expand();
            } else {
                if (node.parent !== parent) {
                    var oldSelection = this._treeOutline.selectedTreeElement;
                    node.parent.removeChild(node);
                    parent.appendChild(node);
                    if (oldSelection !== this._treeOutline.selectedTreeElement)
                        oldSelection.select();
                }
                node._update();
            }
        }
        if (root)
            this._layerTree.forEachLayer(updateLayer.bind(this), root);
        // Cleanup layers that don't exist anymore from tree.
        var rootElement = this._treeOutline.rootElement();
        for (var node = rootElement.firstChild(); node && !node.root;) {
            if (seenLayers.get(node._layer)) {
                node = node.traverseNextTreeElement(false);
            } else {
                var nextNode = node.nextSibling || node.parent;
                node.parent.removeChild(node);
                if (node === this._lastHoveredNode)
                    this._lastHoveredNode = null;
                node = nextNode;
            }
        }
        if (!this._treeOutline.selectedTreeElement) {
            var elementToSelect = this._layerTree.contentRoot() || this._layerTree.root();
            elementToSelect[WebInspector.LayerTreeElement._symbol].revealAndSelect(true);
        }
    },

    /**
     * @param {!Event} event
     */
    _onMouseMove: function(event)
    {
        var node = this._treeOutline.treeElementFromEvent(event);
        if (node === this._lastHoveredNode)
            return;
        this._layerViewHost.hoverObject(this._selectionForNode(node));
    },

    /**
     * @param {!WebInspector.LayerTreeElement} node
     */
    _selectedNodeChanged: function(node)
    {
        this._layerViewHost.selectObject(this._selectionForNode(node));
    },

    /**
     * @param {!Event} event
     */
    _onContextMenu: function(event)
    {
        var selection = this._selectionForNode(this._treeOutline.treeElementFromEvent(event));
        var contextMenu = new WebInspector.ContextMenu(event);
        this._layerViewHost.showContextMenu(contextMenu, selection);
    },

    /**
     * @param {?TreeElement} node
     * @return {?WebInspector.LayerView.Selection}
     */
    _selectionForNode: function(node)
    {
        return node && node._layer ? new WebInspector.LayerView.LayerSelection(node._layer) : null;
    },

    __proto__: WebInspector.Object.prototype
}

/**
  * @constructor
  * @param {!WebInspector.LayerTreeOutline} tree
  * @param {!WebInspector.Layer} layer
  * @extends {TreeElement}
  */
WebInspector.LayerTreeElement = function(tree, layer)
{
    TreeElement.call(this);
    this._treeOutline = tree;
    this._layer = layer;
    this._layer[WebInspector.LayerTreeElement._symbol] = this;
    this._update();
}

WebInspector.LayerTreeElement._symbol = Symbol("layer");

WebInspector.LayerTreeElement.prototype = {
    _update: function()
    {
        var node = this._layer.nodeForSelfOrAncestor();
        var title = createDocumentFragment();
        title.createTextChild(node ? WebInspector.DOMPresentationUtils.simpleSelector(node) : "#" + this._layer.id());
        var details = title.createChild("span", "dimmed");
        details.textContent = WebInspector.UIString(" (%d × %d)", this._layer.width(), this._layer.height());
        this.title = title;
    },

    /**
     * @override
     * @return {boolean}
     */
    onselect: function()
    {
        this._treeOutline._selectedNodeChanged(this);
        return false;
    },

    /**
     * @param {boolean} hovered
     */
    setHovered: function(hovered)
    {
        this.listItemElement.classList.toggle("hovered", hovered);
    },

    __proto__: TreeElement.prototype
}
