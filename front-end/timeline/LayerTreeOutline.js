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
 * @extends {WebInspector.Object}
 * @param {!TreeOutline} treeOutline
 */
WebInspector.LayerTreeOutline = function(treeOutline)
{
    WebInspector.Object.call(this);
    this._treeOutline = treeOutline;
    this._treeOutline.childrenListElement.addEventListener("mousemove", this._onMouseMove.bind(this), false);
    this._treeOutline.childrenListElement.addEventListener("mouseout", this._onMouseMove.bind(this), false);
    this._treeOutline.childrenListElement.addEventListener("contextmenu", this._onContextMenu.bind(this), true);
    this._lastHoveredNode = null;
}

/**
 * @enum {string}
 */
WebInspector.LayerTreeOutline.Events = {
    LayerHovered: "LayerHovered",
    LayerSelected: "LayerSelected"
}

WebInspector.LayerTreeOutline.prototype = {
    /**
     * @param {?WebInspector.Layer} layer
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
     * @param {?WebInspector.Layer} layer
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

    /**
     * @param {?WebInspector.LayerTreeBase} layerTree
     */
    update: function(layerTree)
    {
        var seenLayers = new Map();
        var root = layerTree && (layerTree.contentRoot() || layerTree.root());

        /**
         * @param {!WebInspector.Layer} layer
         * @this {WebInspector.LayerTreeOutline}
         */
        function updateLayer(layer)
        {
            if (seenLayers.get(layer))
                console.assert(false, "Duplicate layer: " + layer.id());
            seenLayers.set(layer, true);
            var node = this._treeOutline.getCachedTreeElement(layer);
            var parent = layer === root ? this._treeOutline : this._treeOutline.getCachedTreeElement(layer.parent());
            if (!parent) {
                console.assert(false, "Parent is not in the tree");
                return;
            }
            if (!node) {
                node = new WebInspector.LayerTreeElement(this, layer);
                parent.appendChild(node);
            } else {
                if (node.parent !== parent) {
                    node.parent.removeChild(node);
                    parent.appendChild(node);
                }
                node._update();
            }
        }
        if (root)
            layerTree.forEachLayer(updateLayer.bind(this), root);
        // Cleanup layers that don't exist anymore from tree.
        for (var node = /** @type {!TreeElement|!TreeOutline|null} */ (this._treeOutline.children[0]); node && !node.root;) {
            if (seenLayers.get(node.representedObject)) {
                node = node.traverseNextTreeElement(false);
            } else {
                var nextNode = node.nextSibling || node.parent;
                node.parent.removeChild(node);
                if (node === this._lastHoveredNode)
                    this._lastHoveredNode = null;
                node = nextNode;
            }
        }
        if (this._treeOutline.children[0])
            this._treeOutline.children[0].expand();
    },

    /**
     * @param {!Event} event
     */
    _onMouseMove: function(event)
    {
        var node = this._treeOutline.treeElementFromEvent(event);
        if (node === this._lastHoveredNode)
            return;
        var selection = node && node.representedObject ? new WebInspector.Layers3DView.LayerSelection(node.representedObject) : null;
        this.dispatchEventToListeners(WebInspector.LayerTreeOutline.Events.LayerHovered, selection);
    },

    /**
     * @param {!WebInspector.LayerTreeElement} node
     */
    _selectedNodeChanged: function(node)
    {
        var layer = /** @type {!WebInspector.Layer} */ (node.representedObject);
        var selection = node.representedObject ? new WebInspector.Layers3DView.LayerSelection(node.representedObject) : null;
        this.dispatchEventToListeners(WebInspector.LayerTreeOutline.Events.LayerSelected, selection);
    },

    /**
     * @param {!Event} event
     */
    _onContextMenu: function(event)
    {
        var node = this._treeOutline.treeElementFromEvent(event);
        if (!node || !node.representedObject)
            return;
        var layer = /** @type {!WebInspector.Layer} */ (node.representedObject);
        if (!layer)
            return;
        var domNode = layer.nodeForSelfOrAncestor();
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
  * @param {!WebInspector.LayerTreeOutline} tree
  * @param {!WebInspector.Layer} layer
  * @extends {TreeElement}
  */
WebInspector.LayerTreeElement = function(tree, layer)
{
    TreeElement.call(this, "", layer);
    this._treeOutline = tree;
    this._update();
}

WebInspector.LayerTreeElement.prototype = {
    onattach: function()
    {
        var selection = createElement("div");
        selection.className = "selection";
        this.listItemElement.insertBefore(selection, this.listItemElement.firstChild);
    },

    _update: function()
    {
        var layer = /** @type {!WebInspector.Layer} */ (this.representedObject);
        var node = layer.nodeForSelfOrAncestor();
        var title = createDocumentFragment();
        title.createChild("div", "selection");
        title.createTextChild(node ? WebInspector.DOMPresentationUtils.simpleSelector(node) : "#" + layer.id());
        var details = title.createChild("span", "dimmed");
        details.textContent = WebInspector.UIString(" (%d × %d)", layer.width(), layer.height());
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
