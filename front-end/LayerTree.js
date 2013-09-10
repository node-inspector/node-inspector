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
 * @param {WebInspector.LayerTreeModel} model
 * @param {TreeOutline} treeOutline
 * @extends {WebInspector.Object}
 */
WebInspector.LayerTree = function(model, treeOutline)
{
    WebInspector.Object.call(this);
    this._model = model;
    this._treeOutline = treeOutline;
    this._treeOutline.childrenListElement.addEventListener("mousemove", this._onMouseMove.bind(this), false);
    this._treeOutline.childrenListElement.addEventListener("mouseout", this._onMouseMove.bind(this), false);
    this._treeOutline.childrenListElement.addEventListener("contextmenu", this._onContextMenu.bind(this), true);
    this._model.addEventListener(WebInspector.LayerTreeModel.Events.LayerTreeChanged, this._update.bind(this));
    this._lastHoveredNode = null;
    this._needsUpdate = true;
}

/**
 * @enum {string}
 */
WebInspector.LayerTree.Events = {
    LayerHovered: "LayerHovered",
    LayerSelected: "LayerSelected"
}

WebInspector.LayerTree.prototype = {
    /**
     * @param {boolean} visible
     */
    setVisible: function(visible)
    {
        if (this._isVisible === visible)
            return;
        this._isVisible = visible;
        if (visible && this._needsUpdate)
            this._update();
    },

    /**
     * @param {WebInspector.Layer} layer
     */
    selectLayer: function(layer)
    {
        this.hoverLayer(null);
        var node = layer && this._treeOutline.getCachedTreeElement(layer);
        if (node)
            node.revealAndSelect(true);
        else if (this._treeOutline.selectedTreeElement)
            this._treeOutline.selectedTreeElement.deselect();
    },

    /**
     * @param {WebInspector.Layer} layer
     */
    hoverLayer: function(layer)
    {
        var node = layer && this._treeOutline.getCachedTreeElement(layer);
        if (node === this._lastHoveredNode)
            return;
        if (this._lastHoveredNode)
            this._lastHoveredNode.setHovered(false);
        if (node)
            node.setHovered(true);
        this._lastHoveredNode = node;
    },

    _update: function()
    {
        if (!this._isVisible) {
            this._needsUpdate = true;
            return;
        }
        this._needsUpdate = false;
        var seenLayers = {};

        /**
         * @param {WebInspector.Layer} layer
         */
        function updateLayer(layer)
        {
            var id = layer.id();
            if (seenLayers[id])
                console.assert(false, "Duplicate layer id: " + id);
            seenLayers[id] = true;
            var node = this._treeOutline.getCachedTreeElement(layer);
            var parent = layer === this._model.contentRoot() ? this._treeOutline : this._treeOutline.getCachedTreeElement(layer.parent());
            if (!parent)
                console.assert(false, "Parent is not in the tree");
            if (!node) {
                node = new WebInspector.LayerTreeElement(this, layer);
                parent.appendChild(node);
            } else {
                var oldParentId = node.parent.representedObject && node.parent.representedObject.id();
                if (oldParentId !== layer.parentId()) {
                    (node.parent || this._treeOutline).removeChild(node);
                    parent.appendChild(node);
                }
                node._update();
            }
        }
        this._model.forEachLayer(updateLayer.bind(this), this._model.contentRoot());
        // Cleanup layers that don't exist anymore from tree
        for (var i = 0; i < this._treeOutline.children.length; ++i) {
            for (var node = this._treeOutline.children[i]; node;) {
                if (seenLayers[node.representedObject.id()]) {
                    node = node.traverseNextTreeElement(false);
                } else {
                    var nextNode = node.nextSibling || node.parent;
                    node.parent.removeChild(node);
                    if (node === this._lastHoveredNode)
                        this._lastHoveredNode = null;
                    node = nextNode;
                }
            }
        }
    },

    /**
     * @param {Event} event
     */
    _onMouseMove: function(event)
    {
        var node = this._treeOutline.treeElementFromPoint(event.pageX, event.pageY);
        if (node === this._lastHoveredNode)
            return;
        this.dispatchEventToListeners(WebInspector.LayerTree.Events.LayerHovered, node && node.representedObject);
    },

    /**
     * @param {WebInspector.LayerTreeElement} node
     */
    _selectedNodeChanged: function(node)
    {
        var layer = /** @type {WebInspector.Layer} */ (node.representedObject);
        this.dispatchEventToListeners(WebInspector.LayerTree.Events.LayerSelected, layer);
    },

    /**
     * @param {Event} event
     */
    _onContextMenu: function(event)
    {
        var node = this._treeOutline.treeElementFromPoint(event.pageX, event.pageY);
        if (!node || !node.representedObject)
            return;
        var layer = /** @type {WebInspector.Layer} */ (node.representedObject);
        if (!layer)
            return;
        var nodeId = layer.nodeId();
        if (!nodeId)
            return;
        var domNode = WebInspector.domAgent.nodeForId(nodeId);
        if (!domNode)
            return;
        var contextMenu = new WebInspector.ContextMenu(event);
        contextMenu.appendApplicableItems(domNode);
        contextMenu.show();
    },

    __proto__: WebInspector.Object.prototype
}

/**
  * @constructor
  * @param {WebInspector.LayerTree} tree
  * @param {WebInspector.Layer} layer
  * @extends {TreeElement}
  */
WebInspector.LayerTreeElement = function(tree, layer)
{
    TreeElement.call(this, "", layer);
    this._layerTree = tree;
    this._update();
}

WebInspector.LayerTreeElement.prototype = {
    onattach: function()
    {
        var selection = document.createElement("div");
        selection.className = "selection";
        this.listItemElement.insertBefore(selection, this.listItemElement.firstChild);
    },

    _update: function()
    {
        var layer = /** @type {WebInspector.Layer} */ (this.representedObject);
        var nodeId = layer.nodeIdForSelfOrAncestor();
        var node = nodeId && WebInspector.domAgent.nodeForId(nodeId);
        var title = document.createDocumentFragment();
        title.createChild("div", "selection");
        title.appendChild(document.createTextNode(node ? node.appropriateSelectorFor(false) :  "#" + layer.id()));
        var details = title.createChild("span", "dimmed");
        details.textContent = WebInspector.UIString(" (%d × %d)", layer.width(), layer.height());
        this.title = title;
    },

    onselect: function()
    {
        this._layerTree._selectedNodeChanged(this);
    },

    /**
     * @param {boolean} hovered
     */
    setHovered: function(hovered)
    {
        this.listItemElement.enableStyleClass("hovered", hovered);
    },

    __proto__: TreeElement.prototype
}
