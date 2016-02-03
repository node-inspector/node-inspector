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

/** @typedef {!{
        bounds: {height: number, width: number},
        children: Array.<!WebInspector.TracingLayerPayload>,
        layer_id: number,
        position: Array.<number>,
        scroll_offset: Array.<number>,
        layer_quad: Array.<number>,
        draws_content: number,
        gpu_memory_usage: number,
        transform: Array.<number>,
        owner_node: number,
        compositing_reasons: Array.<string>
    }}
*/
WebInspector.TracingLayerPayload;

/** @typedef {!{
        id: string,
        layer_id: number,
        gpu_memory_usage: number,
        content_rect: !Array.<number>
    }}
*/
WebInspector.TracingLayerTile;

/**
  * @constructor
  * @extends {WebInspector.SDKModel}
  */
WebInspector.LayerTreeModel = function(target)
{
    WebInspector.SDKModel.call(this, WebInspector.LayerTreeModel, target);
    target.registerLayerTreeDispatcher(new WebInspector.LayerTreeDispatcher(this));
    WebInspector.targetManager.addEventListener(WebInspector.TargetManager.Events.MainFrameNavigated, this._onMainFrameNavigated, this);
    /** @type {?WebInspector.LayerTreeBase} */
    this._layerTree = null;
}

WebInspector.LayerTreeModel.Events = {
    LayerTreeChanged: "LayerTreeChanged",
    LayerPainted: "LayerPainted",
}

WebInspector.LayerTreeModel.ScrollRectType = {
    NonFastScrollable: {name: "NonFastScrollable", description: "Non fast scrollable"},
    TouchEventHandler: {name: "TouchEventHandler", description: "Touch event handler"},
    WheelEventHandler: {name: "WheelEventHandler", description: "Wheel event handler"},
    RepaintsOnScroll: {name: "RepaintsOnScroll", description: "Repaints on scroll"}
}

WebInspector.LayerTreeModel.prototype = {
    disable: function()
    {
        if (!this._enabled)
            return;
        this._enabled = false;
        this._layerTree = null;
        this.target().layerTreeAgent().disable();
    },

    enable: function()
    {
        if (this._enabled)
            return;
        this._enabled = true;
        this._forceEnable();
    },

    _forceEnable: function()
    {
        this._layerTree = new WebInspector.AgentLayerTree(this.target());
        this._lastPaintRectByLayerId = {};
        this.target().layerTreeAgent().enable();
    },

    /**
     * @param {!WebInspector.LayerTreeBase} layerTree
     */
    setLayerTree: function(layerTree)
    {
        this.disable();
        this._layerTree = layerTree;
        this.dispatchEventToListeners(WebInspector.LayerTreeModel.Events.LayerTreeChanged);
    },

    /**
     * @return {?WebInspector.LayerTreeBase}
     */
    layerTree: function()
    {
        return this._layerTree;
    },

    /**
     * @param {?Array.<!LayerTreeAgent.Layer>} layers
     */
    _layerTreeChanged: function(layers)
    {
        if (!this._enabled)
            return;
        var layerTree = /** @type {!WebInspector.AgentLayerTree} */ (this._layerTree);
        layerTree.setLayers(layers, onLayersSet.bind(this));

        /**
         * @this {WebInspector.LayerTreeModel}
         */
        function onLayersSet()
        {
            for (var layerId in this._lastPaintRectByLayerId) {
                var lastPaintRect = this._lastPaintRectByLayerId[layerId];
                var layer = layerTree.layerById(layerId);
                if (layer)
                    layer._lastPaintRect = lastPaintRect;
            }
            this._lastPaintRectByLayerId = {};

            this.dispatchEventToListeners(WebInspector.LayerTreeModel.Events.LayerTreeChanged);
        }
    },

    /**
     * @param {!LayerTreeAgent.LayerId} layerId
     * @param {!DOMAgent.Rect} clipRect
     */
    _layerPainted: function(layerId, clipRect)
    {
        if (!this._enabled)
            return;
        var layerTree = /** @type {!WebInspector.AgentLayerTree} */ (this._layerTree);
        var layer = layerTree.layerById(layerId);
        if (!layer) {
            this._lastPaintRectByLayerId[layerId] = clipRect;
            return;
        }
        layer._didPaint(clipRect);
        this.dispatchEventToListeners(WebInspector.LayerTreeModel.Events.LayerPainted, layer);
    },

    _onMainFrameNavigated: function()
    {
        if (this._enabled)
            this._forceEnable();
    },

    __proto__: WebInspector.SDKModel.prototype
}

/**
  * @constructor
  * @param {?WebInspector.Target} target
  */
WebInspector.LayerTreeBase = function(target)
{
    this._target = target;
    this._domModel = target ? WebInspector.DOMModel.fromTarget(target) : null;
    this._layersById = {};
    /** @type Map<number, ?WebInspector.DOMNode> */
    this._backendNodeIdToNode = new Map();
    this._reset();
}

WebInspector.LayerTreeBase.prototype = {
    _reset: function()
    {
        this._root = null;
        this._contentRoot = null;
    },

    /**
     * @return {?WebInspector.Target}
     */
    target: function()
    {
        return this._target;
    },

    /**
     * @return {?WebInspector.Layer}
     */
    root: function()
    {
        return this._root;
    },

    /**
     * @return {?WebInspector.Layer}
     */
    contentRoot: function()
    {
        return this._contentRoot;
    },

    /**
     * @param {function(!WebInspector.Layer)} callback
     * @param {?WebInspector.Layer=} root
     * @return {boolean}
     */
    forEachLayer: function(callback, root)
    {
        if (!root) {
            root = this.root();
            if (!root)
                return false;
        }
        return callback(root) || root.children().some(this.forEachLayer.bind(this, callback));
    },

    /**
     * @param {string} id
     * @return {?WebInspector.Layer}
     */
    layerById: function(id)
    {
        return this._layersById[id] || null;
    },

    /**
     * @param {!Set<number>} requestedNodeIds
     * @param {function()} callback
     */
    _resolveBackendNodeIds: function(requestedNodeIds, callback)
    {
        if (!requestedNodeIds.size || !this._domModel) {
            callback();
            return;
        }
        if (this._domModel)
            this._domModel.pushNodesByBackendIdsToFrontend(requestedNodeIds, populateBackendNodeMap.bind(this));

        /**
         * @this {WebInspector.LayerTreeBase}
         * @param {?Map<number, ?WebInspector.DOMNode>} nodesMap
         */
        function populateBackendNodeMap(nodesMap)
        {
            if (nodesMap) {
                for (var entry of nodesMap)
                    this._backendNodeIdToNode.set(entry[0], entry[1]);
            }
            callback();
        }
    },

    /**
     * @param {!Object} viewportSize
     */
    setViewportSize: function(viewportSize)
    {
        this._viewportSize = viewportSize;
    },

    /**
     * @return {!Object | undefined}
     */
    viewportSize: function()
    {
        return this._viewportSize;
    },

    /**
     * @param {number} id
     * @return {?WebInspector.DOMNode}
     */
    _nodeForId: function(id)
    {
        return this._domModel ? this._domModel.nodeForId(id) : null;
    }
}

/**
  * @constructor
  * @extends {WebInspector.LayerTreeBase}
  * @param {?WebInspector.Target} target
  */
WebInspector.TracingLayerTree = function(target)
{
    WebInspector.LayerTreeBase.call(this, target);
    /** @type {!Map.<string, !WebInspector.TracingLayerTile>} */
    this._tileById = new Map();
}

WebInspector.TracingLayerTree.prototype = {
    /**
     * @param {!WebInspector.TracingLayerPayload} root
     * @param {function()} callback
     */
    setLayers: function(root, callback)
    {
        var idsToResolve = new Set();
        this._extractNodeIdsToResolve(idsToResolve, {}, root);
        this._resolveBackendNodeIds(idsToResolve, onBackendNodeIdsResolved.bind(this));

        /**
         * @this {WebInspector.TracingLayerTree}
         */
        function onBackendNodeIdsResolved()
        {
            var oldLayersById = this._layersById;
            this._layersById = {};
            this._contentRoot = null;
            this._root = this._innerSetLayers(oldLayersById, root);
            callback();
        }
    },

    /**
     * @param {!Array.<!WebInspector.TracingLayerTile>} tiles
     */
    setTiles: function(tiles)
    {
        this._tileById = new Map();
        for (var tile of tiles)
            this._tileById.set(tile.id, tile);
    },

    /**
     * @param {string} id
     * @return {?WebInspector.TracingLayerTile}
     */
    tileById: function(id)
    {
        return this._tileById.get(id) || null;
    },

    /**
     * @param {!Object.<(string|number), !WebInspector.Layer>} oldLayersById
     * @param {!WebInspector.TracingLayerPayload} payload
     * @return {!WebInspector.TracingLayer}
     */
    _innerSetLayers: function(oldLayersById, payload)
    {
        var layer = /** @type {?WebInspector.TracingLayer} */ (oldLayersById[payload.layer_id]);
        if (layer)
            layer._reset(payload);
        else
            layer = new WebInspector.TracingLayer(payload);
        this._layersById[payload.layer_id] = layer;
        if (payload.owner_node)
            layer._setNode(this._backendNodeIdToNode.get(payload.owner_node) || null);
        if (!this._contentRoot && layer.drawsContent())
            this._contentRoot = layer;
        for (var i = 0; payload.children && i < payload.children.length; ++i)
            layer.addChild(this._innerSetLayers(oldLayersById, payload.children[i]));
        return layer;
    },

    /**
     * @param {!Set<number>} nodeIdsToResolve
     * @param {!Object} seenNodeIds
     * @param {!WebInspector.TracingLayerPayload} payload
     */
    _extractNodeIdsToResolve: function(nodeIdsToResolve, seenNodeIds, payload)
    {
        var backendNodeId = payload.owner_node;
        if (backendNodeId && !this._backendNodeIdToNode[backendNodeId])
            nodeIdsToResolve.add(backendNodeId);
        for (var i = 0; payload.children && i < payload.children.length; ++i)
            this._extractNodeIdsToResolve(nodeIdsToResolve, seenNodeIds, payload.children[i]);
    },

    __proto__: WebInspector.LayerTreeBase.prototype
}

/**
  * @constructor
  * @param {?WebInspector.Target} target
  * @extends {WebInspector.LayerTreeBase}
  */
WebInspector.AgentLayerTree = function(target)
{
    WebInspector.LayerTreeBase.call(this, target);
}

WebInspector.AgentLayerTree.prototype = {
    /**
     * @param {?Array.<!LayerTreeAgent.Layer>} payload
     * @param {function()} callback
     */
    setLayers: function(payload, callback)
    {
        if (!payload) {
            onBackendNodeIdsResolved.call(this);
            return;
        }

        var idsToResolve = new Set();
        for (var i = 0; i < payload.length; ++i) {
            var backendNodeId = payload[i].backendNodeId;
            if (!backendNodeId || this._backendNodeIdToNode.has(backendNodeId))
                continue;
            idsToResolve.add(backendNodeId);
        }
        this._resolveBackendNodeIds(idsToResolve, onBackendNodeIdsResolved.bind(this));

        /**
         * @this {WebInspector.AgentLayerTree}
         */
        function onBackendNodeIdsResolved()
        {
            this._innerSetLayers(payload);
            callback();
        }
    },

    /**
     * @param {?Array.<!LayerTreeAgent.Layer>} layers
     */
    _innerSetLayers: function(layers)
    {
        this._reset();
        // Payload will be null when not in the composited mode.
        if (!layers)
            return;
        var oldLayersById = this._layersById;
        this._layersById = {};
        for (var i = 0; i < layers.length; ++i) {
            var layerId = layers[i].layerId;
            var layer = oldLayersById[layerId];
            if (layer)
                layer._reset(layers[i]);
            else
                layer = new WebInspector.AgentLayer(this._target, layers[i]);
            this._layersById[layerId] = layer;
            var backendNodeId = layers[i].backendNodeId;
            if (backendNodeId)
                layer._setNode(this._backendNodeIdToNode.get(backendNodeId));
            if (!this._contentRoot && layer.drawsContent())
                this._contentRoot = layer;
            var parentId = layer.parentId();
            if (parentId) {
                var parent = this._layersById[parentId];
                if (!parent)
                    console.assert(parent, "missing parent " + parentId + " for layer " + layerId);
                parent.addChild(layer);
            } else {
                if (this._root)
                    console.assert(false, "Multiple root layers");
                this._root = layer;
            }
        }
        if (this._root)
            this._root._calculateQuad(new WebKitCSSMatrix());
    },

    __proto__: WebInspector.LayerTreeBase.prototype
}

/**
 * @interface
 */
WebInspector.Layer = function()
{
}

WebInspector.Layer.prototype = {
    /**
     * @return {string}
     */
    id: function() { },

    /**
     * @return {?string}
     */
    parentId: function() { },

    /**
     * @return {?WebInspector.Layer}
     */
    parent: function() { },

    /**
     * @return {boolean}
     */
    isRoot: function() { },

    /**
     * @return {!Array.<!WebInspector.Layer>}
     */
    children: function() { },

    /**
     * @param {!WebInspector.Layer} child
     */
    addChild: function(child) { },

    /**
     * @return {?WebInspector.DOMNode}
     */
    node: function() { },

    /**
     * @return {?WebInspector.DOMNode}
     */
    nodeForSelfOrAncestor: function() { },

    /**
     * @return {number}
     */
    offsetX: function() { },

    /**
     * @return {number}
     */
    offsetY: function() { },

    /**
     * @return {number}
     */
    width: function() { },

    /**
     * @return {number}
     */
    height: function() { },

    /**
     * @return {?Array.<number>}
     */
    transform: function() { },

    /**
     * @return {!Array.<number>}
     */
    quad: function() { },

    /**
     * @return {!Array.<number>}
     */
    anchorPoint: function() { },

    /**
     * @return {boolean}
     */
    invisible: function() { },

    /**
     * @return {number}
     */
    paintCount: function() { },

    /**
     * @return {?DOMAgent.Rect}
     */
    lastPaintRect: function() { },

    /**
     * @return {!Array.<!LayerTreeAgent.ScrollRect>}
     */
    scrollRects: function() { },

    /**
     * @return {number}
     */
    gpuMemoryUsage: function() { },

    /**
     * @param {function(!Array.<string>)} callback
     */
    requestCompositingReasons: function(callback) { },

    /**
     * @return {boolean}
     */
    drawsContent: function() { }
}

/**
 * @constructor
 * @implements {WebInspector.Layer}
 * @param {?WebInspector.Target} target
 * @param {!LayerTreeAgent.Layer} layerPayload
 */
WebInspector.AgentLayer = function(target, layerPayload)
{
    this._target = target;
    this._reset(layerPayload);
}

WebInspector.AgentLayer.prototype = {
    /**
     * @override
     * @return {string}
     */
    id: function()
    {
        return this._layerPayload.layerId;
    },

    /**
     * @override
     * @return {?string}
     */
    parentId: function()
    {
        return this._layerPayload.parentLayerId;
    },

    /**
     * @override
     * @return {?WebInspector.Layer}
     */
    parent: function()
    {
        return this._parent;
    },

    /**
     * @override
     * @return {boolean}
     */
    isRoot: function()
    {
        return !this.parentId();
    },

    /**
     * @override
     * @return {!Array.<!WebInspector.Layer>}
     */
    children: function()
    {
        return this._children;
    },

    /**
     * @override
     * @param {!WebInspector.Layer} child
     */
    addChild: function(child)
    {
        if (child._parent)
            console.assert(false, "Child already has a parent");
        this._children.push(child);
        child._parent = this;
    },

    /**
     * @param {?WebInspector.DOMNode} node
     */
    _setNode: function(node)
    {
        this._node = node;
    },

    /**
     * @override
     * @return {?WebInspector.DOMNode}
     */
    node: function()
    {
        return this._node;
    },

    /**
     * @override
     * @return {?WebInspector.DOMNode}
     */
    nodeForSelfOrAncestor: function()
    {
        for (var layer = this; layer; layer = layer._parent) {
            if (layer._node)
                return layer._node;
        }
        return null;
    },

    /**
     * @override
     * @return {number}
     */
    offsetX: function()
    {
        return this._layerPayload.offsetX;
    },

    /**
     * @override
     * @return {number}
     */
    offsetY: function()
    {
        return this._layerPayload.offsetY;
    },

    /**
     * @override
     * @return {number}
     */
    width: function()
    {
        return this._layerPayload.width;
    },

    /**
     * @override
     * @return {number}
     */
    height: function()
    {
        return this._layerPayload.height;
    },

    /**
     * @override
     * @return {?Array.<number>}
     */
    transform: function()
    {
        return this._layerPayload.transform;
    },

    /**
     * @override
     * @return {!Array.<number>}
     */
    quad: function()
    {
        return this._quad;
    },

    /**
     * @override
     * @return {!Array.<number>}
     */
    anchorPoint: function()
    {
        return [
            this._layerPayload.anchorX || 0,
            this._layerPayload.anchorY || 0,
            this._layerPayload.anchorZ || 0,
        ];
    },

    /**
     * @override
     * @return {boolean}
     */
    invisible: function()
    {
        return this._layerPayload.invisible;
    },

    /**
     * @override
     * @return {number}
     */
    paintCount: function()
    {
        return this._paintCount || this._layerPayload.paintCount;
    },

    /**
     * @override
     * @return {?DOMAgent.Rect}
     */
    lastPaintRect: function()
    {
        return this._lastPaintRect;
    },

    /**
     * @override
     * @return {!Array.<!LayerTreeAgent.ScrollRect>}
     */
    scrollRects: function()
    {
        return this._scrollRects;
    },

    /**
     * @override
     * @param {function(!Array.<string>)} callback
     */
    requestCompositingReasons: function(callback)
    {
        if (!this._target) {
            callback([]);
            return;
        }

        var wrappedCallback = InspectorBackend.wrapClientCallback(callback, "LayerTreeAgent.reasonsForCompositingLayer(): ", undefined, []);
        this._target.layerTreeAgent().compositingReasons(this.id(), wrappedCallback);
    },

    /**
     * @override
     * @return {boolean}
     */
    drawsContent: function()
    {
        return this._layerPayload.drawsContent;
    },

    /**
     * @override
     * @return {number}
     */
    gpuMemoryUsage: function()
    {
        /**
         * @const
         */
        var bytesPerPixel = 4;
        return this.drawsContent() ? this.width() * this.height() * bytesPerPixel : 0;
    },

    /**
     * @param {function(!WebInspector.PaintProfilerSnapshot=)} callback
     */
    requestSnapshot: function(callback)
    {
        if (!this._target) {
            callback();
            return;
        }

        var wrappedCallback = InspectorBackend.wrapClientCallback(callback, "LayerTreeAgent.makeSnapshot(): ", WebInspector.PaintProfilerSnapshot.bind(null, this._target));
        this._target.layerTreeAgent().makeSnapshot(this.id(), wrappedCallback);
    },

    /**
     * @param {!DOMAgent.Rect} rect
     */
    _didPaint: function(rect)
    {
        this._lastPaintRect = rect;
        this._paintCount = this.paintCount() + 1;
        this._image = null;
    },

    /**
     * @param {!LayerTreeAgent.Layer} layerPayload
     */
    _reset: function(layerPayload)
    {
        /** @type {?WebInspector.DOMNode} */
        this._node = null;
        this._children = [];
        this._parent = null;
        this._paintCount = 0;
        this._layerPayload = layerPayload;
        this._image = null;
        this._scrollRects = this._layerPayload.scrollRects || [];
    },

    /**
     * @param {!Array.<number>} a
     * @return {!CSSMatrix}
     */
    _matrixFromArray: function(a)
    {
        function toFixed9(x) { return x.toFixed(9); }
        return new WebKitCSSMatrix("matrix3d(" + a.map(toFixed9).join(",") + ")");
    },

    /**
     * @param {!CSSMatrix} parentTransform
     * @return {!CSSMatrix}
     */
    _calculateTransformToViewport: function(parentTransform)
    {
        var offsetMatrix = new WebKitCSSMatrix().translate(this._layerPayload.offsetX, this._layerPayload.offsetY);
        var matrix = offsetMatrix;

        if (this._layerPayload.transform) {
            var transformMatrix = this._matrixFromArray(this._layerPayload.transform);
            var anchorVector = new WebInspector.Geometry.Vector(this._layerPayload.width * this.anchorPoint()[0], this._layerPayload.height * this.anchorPoint()[1], this.anchorPoint()[2]);
            var anchorPoint = WebInspector.Geometry.multiplyVectorByMatrixAndNormalize(anchorVector, matrix);
            var anchorMatrix = new WebKitCSSMatrix().translate(-anchorPoint.x, -anchorPoint.y, -anchorPoint.z);
            matrix = anchorMatrix.inverse().multiply(transformMatrix.multiply(anchorMatrix.multiply(matrix)));
        }

        matrix = parentTransform.multiply(matrix);
        return matrix;
    },

    /**
     * @param {number} width
     * @param {number} height
     * @return {!Array.<number>}
     */
    _createVertexArrayForRect: function(width, height)
    {
        return [0, 0, 0, width, 0, 0, width, height, 0, 0, height, 0];
    },

    /**
     * @param {!CSSMatrix} parentTransform
     */
    _calculateQuad: function(parentTransform)
    {
        var matrix = this._calculateTransformToViewport(parentTransform);
        this._quad = [];
        var vertices = this._createVertexArrayForRect(this._layerPayload.width, this._layerPayload.height);
        for (var i = 0; i < 4; ++i) {
            var point = WebInspector.Geometry.multiplyVectorByMatrixAndNormalize(new WebInspector.Geometry.Vector(vertices[i * 3], vertices[i * 3 + 1], vertices[i * 3 + 2]), matrix);
            this._quad.push(point.x, point.y);
        }

        function calculateQuadForLayer(layer)
        {
            layer._calculateQuad(matrix);
        }

        this._children.forEach(calculateQuadForLayer);
    }
}

/**
 * @constructor
 * @param {!WebInspector.TracingLayerPayload} payload
 * @implements {WebInspector.Layer}
 */
WebInspector.TracingLayer = function(payload)
{
    this._reset(payload);
}

WebInspector.TracingLayer.prototype = {
    /**
     * @param {!WebInspector.TracingLayerPayload} payload
     */
    _reset: function(payload)
    {
        /** @type {?WebInspector.DOMNode} */
        this._node = null;
        this._layerId = String(payload.layer_id);
        this._offsetX = payload.position[0];
        this._offsetY = payload.position[1];
        this._width = payload.bounds.width;
        this._height = payload.bounds.height;
        this._children = [];
        this._parentLayerId = null;
        this._parent = null;
        this._quad = payload.layer_quad || [];
        this._createScrollRects(payload);
        this._compositingReasons = payload.compositing_reasons || [];
        this._drawsContent = !!payload.draws_content;
        this._gpuMemoryUsage = payload.gpu_memory_usage;
    },

    /**
     * @override
     * @return {string}
     */
    id: function()
    {
        return this._layerId;
    },

    /**
     * @override
     * @return {?string}
     */
    parentId: function()
    {
        return this._parentLayerId;
    },

    /**
     * @override
     * @return {?WebInspector.Layer}
     */
    parent: function()
    {
        return this._parent;
    },

    /**
     * @override
     * @return {boolean}
     */
    isRoot: function()
    {
        return !this.parentId();
    },

    /**
     * @override
     * @return {!Array.<!WebInspector.Layer>}
     */
    children: function()
    {
        return this._children;
    },

    /**
     * @override
     * @param {!WebInspector.Layer} child
     */
    addChild: function(child)
    {
        if (child._parent)
            console.assert(false, "Child already has a parent");
        this._children.push(child);
        child._parent = this;
        child._parentLayerId = this._layerId;
    },


    /**
     * @param {?WebInspector.DOMNode} node
     */
    _setNode: function(node)
    {
        this._node = node;
    },

    /**
     * @override
     * @return {?WebInspector.DOMNode}
     */
    node: function()
    {
        return this._node;
    },

    /**
     * @override
     * @return {?WebInspector.DOMNode}
     */
    nodeForSelfOrAncestor: function()
    {
        for (var layer = this; layer; layer = layer._parent) {
            if (layer._node)
                return layer._node;
        }
        return null;
    },

    /**
     * @override
     * @return {number}
     */
    offsetX: function()
    {
        return this._offsetX;
    },

    /**
     * @override
     * @return {number}
     */
    offsetY: function()
    {
        return this._offsetY;
    },

    /**
     * @override
     * @return {number}
     */
    width: function()
    {
        return this._width;
    },

    /**
     * @override
     * @return {number}
     */
    height: function()
    {
        return this._height;
    },

    /**
     * @override
     * @return {?Array.<number>}
     */
    transform: function()
    {
        return null;
    },

    /**
     * @override
     * @return {!Array.<number>}
     */
    quad: function()
    {
        return this._quad;
    },

    /**
     * @override
     * @return {!Array.<number>}
     */
    anchorPoint: function()
    {
        return [0.5, 0.5, 0];
    },

    /**
     * @override
     * @return {boolean}
     */
    invisible: function()
    {
        return false;
    },

    /**
     * @override
     * @return {number}
     */
    paintCount: function()
    {
        return 0;
    },

    /**
     * @override
     * @return {?DOMAgent.Rect}
     */
    lastPaintRect: function()
    {
        return null;
    },

    /**
     * @override
     * @return {!Array.<!LayerTreeAgent.ScrollRect>}
     */
    scrollRects: function()
    {
        return this._scrollRects;
    },

    /**
     * @override
     * @return {number}
     */
    gpuMemoryUsage: function()
    {
        return this._gpuMemoryUsage;
    },

    /**
     * @param {!Array.<number>} params
     * @param {string} type
     * @return {!Object}
     */
    _scrollRectsFromParams: function(params, type)
    {
        return {rect: {x: params[0], y: params[1], width: params[2], height: params[3]}, type: type};
    },

    /**
     * @param {!WebInspector.TracingLayerPayload} payload
     */
    _createScrollRects: function(payload)
    {
        this._scrollRects = [];
        if (payload.non_fast_scrollable_region)
            this._scrollRects.push(this._scrollRectsFromParams(payload.non_fast_scrollable_region, WebInspector.LayerTreeModel.ScrollRectType.NonFastScrollable.name));
        if (payload.touch_event_handler_region)
            this._scrollRects.push(this._scrollRectsFromParams(payload.touch_event_handler_region, WebInspector.LayerTreeModel.ScrollRectType.TouchEventHandler.name));
        if (payload.wheel_event_handler_region)
            this._scrollRects.push(this._scrollRectsFromParams(payload.wheel_event_handler_region, WebInspector.LayerTreeModel.ScrollRectType.WheelEventHandler.name));
        if (payload.scroll_event_handler_region)
            this._scrollRects.push(this._scrollRectsFromParams(payload.scroll_event_handler_region, WebInspector.LayerTreeModel.ScrollRectType.RepaintsOnScroll.name));
    },

    /**
     * @override
     * @param {function(!Array.<string>)} callback
     */
    requestCompositingReasons: function(callback)
    {
        callback(this._compositingReasons);
    },

    /**
     * @override
     * @return {boolean}
     */
    drawsContent: function()
    {
        return this._drawsContent;
    }
}

/**
 * @constructor
 * @param {?WebInspector.Target} target
 */
WebInspector.DeferredLayerTree = function(target)
{
    this._target = target;
}

WebInspector.DeferredLayerTree.prototype = {
    /**
     * @param {function(!WebInspector.LayerTreeBase)} callback
     */
    resolve: function(callback) { },

    /**
     * @return {?WebInspector.Target}
     */
    target: function()
    {
        return this._target;
    }
};

/**
 * @constructor
 * @implements {LayerTreeAgent.Dispatcher}
 * @param {!WebInspector.LayerTreeModel} layerTreeModel
 */
WebInspector.LayerTreeDispatcher = function(layerTreeModel)
{
    this._layerTreeModel = layerTreeModel;
}

WebInspector.LayerTreeDispatcher.prototype = {
    /**
     * @override
     * @param {!Array.<!LayerTreeAgent.Layer>=} layers
     */
    layerTreeDidChange: function(layers)
    {
        this._layerTreeModel._layerTreeChanged(layers || null);
    },

    /**
     * @override
     * @param {!LayerTreeAgent.LayerId} layerId
     * @param {!DOMAgent.Rect} clipRect
     */
    layerPainted: function(layerId, clipRect)
    {
        this._layerTreeModel._layerPainted(layerId, clipRect);
    }
}
