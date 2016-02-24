/*
 * Copyright (C) 2012 Google Inc. All rights reserved.
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
 * @extends {WebInspector.HeapSnapshot}
 * @param {!Object} profile
 * @param {!WebInspector.HeapSnapshotProgress} progress
 * @param {boolean} showHiddenData
 */
WebInspector.JSHeapSnapshot = function(profile, progress, showHiddenData)
{
    this._nodeFlags = { // bit flags
        canBeQueried: 1,
        detachedDOMTreeNode: 2,
        pageObject: 4, // The idea is to track separately the objects owned by the page and the objects owned by debugger.

        visitedMarkerMask: 0x0ffff,
        visitedMarker:     0x10000
    };
    this._lazyStringCache = { };
    this._showHiddenData = showHiddenData;
    WebInspector.HeapSnapshot.call(this, profile, progress);
}

WebInspector.JSHeapSnapshot.prototype = {
    /**
     * @override
     * @param {number=} nodeIndex
     * @return {!WebInspector.JSHeapSnapshotNode}
     */
    createNode: function(nodeIndex)
    {
        return new WebInspector.JSHeapSnapshotNode(this, nodeIndex === undefined ? -1 : nodeIndex);
    },

    /**
     * @override
     * @param {number} edgeIndex
     * @return {!WebInspector.JSHeapSnapshotEdge}
     */
    createEdge: function(edgeIndex)
    {
        return new WebInspector.JSHeapSnapshotEdge(this, edgeIndex);
    },

    /**
     * @override
     * @param {number} retainerIndex
     * @return {!WebInspector.JSHeapSnapshotRetainerEdge}
     */
    createRetainingEdge: function(retainerIndex)
    {
        return new WebInspector.JSHeapSnapshotRetainerEdge(this, retainerIndex);
    },

    /**
     * @override
     * @return {?function(!WebInspector.HeapSnapshotNode):boolean}
     */
    classNodesFilter: function()
    {
        var mapAndFlag = this.userObjectsMapAndFlag();
        if (!mapAndFlag)
            return null;
        var map = mapAndFlag.map;
        var flag = mapAndFlag.flag;
        /**
         * @param {!WebInspector.HeapSnapshotNode} node
         * @return {boolean}
         */
        function filter(node)
        {
            return !!(map[node.ordinal()] & flag);
        }
        return filter;
    },

    /**
     * @override
     * @return {function(!WebInspector.HeapSnapshotEdge):boolean}
     */
    containmentEdgesFilter: function()
    {
        var showHiddenData = this._showHiddenData;
        function filter(edge)
        {
            if (edge.isInvisible())
                return false;
            if (showHiddenData)
                return true;
            return !edge.isHidden() && !edge.node().isHidden();
        }
        return filter;
    },

    /**
     * @override
     * @return {function(!WebInspector.HeapSnapshotEdge):boolean}
     */
    retainingEdgesFilter: function()
    {
        var containmentEdgesFilter = this.containmentEdgesFilter();
        function filter(edge)
        {
            return containmentEdgesFilter(edge) && !edge.node().isRoot() && !edge.isWeak();
        }
        return filter;
    },

    _calculateFlags: function()
    {
        this._flags = new Uint32Array(this.nodeCount);
        this._markDetachedDOMTreeNodes();
        this._markQueriableHeapObjects();
        this._markPageOwnedNodes();
    },

    calculateDistances: function()
    {
        /**
         * @param {!WebInspector.HeapSnapshotNode} node
         * @param {!WebInspector.HeapSnapshotEdge} edge
         * @return {boolean}
         */
        function filter(node, edge)
        {
            if (node.isHidden())
                return edge.name() !== "sloppy_function_map" || node.rawName() !== "system / NativeContext";
            if (node.isArray()) {
                // DescriptorArrays are fixed arrays used to hold instance descriptors.
                // The format of the these objects is:
                //   [0]: Number of descriptors
                //   [1]: Either Smi(0) if uninitialized, or a pointer to small fixed array:
                //          [0]: pointer to fixed array with enum cache
                //          [1]: either Smi(0) or pointer to fixed array with indices
                //   [i*3+2]: i-th key
                //   [i*3+3]: i-th type
                //   [i*3+4]: i-th descriptor
                // As long as maps may share descriptor arrays some of the descriptor
                // links may not be valid for all the maps. We just skip
                // all the descriptor links when calculating distances.
                // For more details see http://crbug.com/413608
                if (node.rawName() !== "(map descriptors)")
                    return true;
                var index = edge.name();
                return index < 2 || (index % 3) !== 1;
            }
            return true;
        }
        WebInspector.HeapSnapshot.prototype.calculateDistances.call(this, filter);
    },

    /**
     * @override
     * @protected
     * @param {!WebInspector.HeapSnapshotNode} node
     * @return {boolean}
     */
    isUserRoot: function(node)
    {
        return node.isUserRoot() || node.isDocumentDOMTreesRoot();
    },

    /**
     * @override
     * @param {function(!WebInspector.HeapSnapshotNode)} action
     * @param {boolean=} userRootsOnly
     */
    forEachRoot: function(action, userRootsOnly)
    {
        /**
         * @param {!WebInspector.HeapSnapshotNode} node
         * @param {string} name
         * @return {?WebInspector.HeapSnapshotNode}
         */
        function getChildNodeByName(node, name)
        {
            for (var iter = node.edges(); iter.hasNext(); iter.next()) {
                var child = iter.edge.node();
                if (child.name() === name)
                    return child;
            }
            return null;
        }

        var visitedNodes = {};
        /**
         * @param {!WebInspector.HeapSnapshotNode} node
         */
        function doAction(node)
        {
            var ordinal = node.ordinal();
            if (!visitedNodes[ordinal]) {
                action(node);
                visitedNodes[ordinal] = true;
            }
        }

        var gcRoots = getChildNodeByName(this.rootNode(), "(GC roots)");
        if (!gcRoots)
            return;

        if (userRootsOnly) {
            for (var iter = this.rootNode().edges(); iter.hasNext(); iter.next()) {
                var node = iter.edge.node();
                if (this.isUserRoot(node))
                    doAction(node);
            }
        } else {
            for (var iter = gcRoots.edges(); iter.hasNext(); iter.next()) {
                var subRoot = iter.edge.node();
                for (var iter2 = subRoot.edges(); iter2.hasNext(); iter2.next())
                    doAction(iter2.edge.node());
                doAction(subRoot);
            }
            for (var iter = this.rootNode().edges(); iter.hasNext(); iter.next())
                doAction(iter.edge.node());
        }
    },

    /**
     * @return {?{map: !Uint32Array, flag: number}}
     */
    userObjectsMapAndFlag: function()
    {
        return this._showHiddenData ? null : {
            map: this._flags,
            flag: this._nodeFlags.pageObject
        };
    },

    _flagsOfNode: function(node)
    {
        return this._flags[node.nodeIndex / this._nodeFieldCount];
    },

    _markDetachedDOMTreeNodes: function()
    {
        var flag = this._nodeFlags.detachedDOMTreeNode;
        var detachedDOMTreesRoot;
        for (var iter = this.rootNode().edges(); iter.hasNext(); iter.next()) {
            var node = iter.edge.node();
            if (node.name() === "(Detached DOM trees)") {
                detachedDOMTreesRoot = node;
                break;
            }
        }

        if (!detachedDOMTreesRoot)
            return;

        var detachedDOMTreeRE = /^Detached DOM tree/;
        for (var iter = detachedDOMTreesRoot.edges(); iter.hasNext(); iter.next()) {
            var node = iter.edge.node();
            if (detachedDOMTreeRE.test(node.className())) {
                for (var edgesIter = node.edges(); edgesIter.hasNext(); edgesIter.next())
                    this._flags[edgesIter.edge.node().nodeIndex / this._nodeFieldCount] |= flag;
            }
        }
    },

    _markQueriableHeapObjects: function()
    {
        // Allow runtime properties query for objects accessible from Window objects
        // via regular properties, and for DOM wrappers. Trying to access random objects
        // can cause a crash due to insonsistent state of internal properties of wrappers.
        var flag = this._nodeFlags.canBeQueried;
        var hiddenEdgeType = this._edgeHiddenType;
        var internalEdgeType = this._edgeInternalType;
        var invisibleEdgeType = this._edgeInvisibleType;
        var weakEdgeType = this._edgeWeakType;
        var edgeToNodeOffset = this._edgeToNodeOffset;
        var edgeTypeOffset = this._edgeTypeOffset;
        var edgeFieldsCount = this._edgeFieldsCount;
        var containmentEdges = this.containmentEdges;
        var nodeFieldCount = this._nodeFieldCount;
        var firstEdgeIndexes = this._firstEdgeIndexes;

        var flags = this._flags;
        var list = [];

        for (var iter = this.rootNode().edges(); iter.hasNext(); iter.next()) {
            if (iter.edge.node().isUserRoot())
                list.push(iter.edge.node().nodeIndex / nodeFieldCount);
        }

        while (list.length) {
            var nodeOrdinal = list.pop();
            if (flags[nodeOrdinal] & flag)
                continue;
            flags[nodeOrdinal] |= flag;
            var beginEdgeIndex = firstEdgeIndexes[nodeOrdinal];
            var endEdgeIndex = firstEdgeIndexes[nodeOrdinal + 1];
            for (var edgeIndex = beginEdgeIndex; edgeIndex < endEdgeIndex; edgeIndex += edgeFieldsCount) {
                var childNodeIndex = containmentEdges[edgeIndex + edgeToNodeOffset];
                var childNodeOrdinal = childNodeIndex / nodeFieldCount;
                if (flags[childNodeOrdinal] & flag)
                    continue;
                var type = containmentEdges[edgeIndex + edgeTypeOffset];
                if (type === hiddenEdgeType || type === invisibleEdgeType || type === internalEdgeType || type === weakEdgeType)
                    continue;
                list.push(childNodeOrdinal);
            }
        }
    },

    _markPageOwnedNodes: function()
    {
        var edgeShortcutType = this._edgeShortcutType;
        var edgeElementType = this._edgeElementType;
        var edgeToNodeOffset = this._edgeToNodeOffset;
        var edgeTypeOffset = this._edgeTypeOffset;
        var edgeFieldsCount = this._edgeFieldsCount;
        var edgeWeakType = this._edgeWeakType;
        var firstEdgeIndexes = this._firstEdgeIndexes;
        var containmentEdges = this.containmentEdges;
        var nodeFieldCount = this._nodeFieldCount;
        var nodesCount = this.nodeCount;

        var flags = this._flags;
        var flag = this._nodeFlags.pageObject;
        var visitedMarker = this._nodeFlags.visitedMarker;
        var visitedMarkerMask = this._nodeFlags.visitedMarkerMask;
        var markerAndFlag = visitedMarker | flag;

        var nodesToVisit = new Uint32Array(nodesCount);
        var nodesToVisitLength = 0;

        var rootNodeOrdinal = this._rootNodeIndex / nodeFieldCount;
        var node = this.rootNode();
        for (var edgeIndex = firstEdgeIndexes[rootNodeOrdinal], endEdgeIndex = firstEdgeIndexes[rootNodeOrdinal + 1];
             edgeIndex < endEdgeIndex;
             edgeIndex += edgeFieldsCount) {
            var edgeType = containmentEdges[edgeIndex + edgeTypeOffset];
            var nodeIndex = containmentEdges[edgeIndex + edgeToNodeOffset];
            if (edgeType === edgeElementType) {
                node.nodeIndex = nodeIndex;
                if (!node.isDocumentDOMTreesRoot())
                    continue;
            } else if (edgeType !== edgeShortcutType)
                continue;
            var nodeOrdinal = nodeIndex / nodeFieldCount;
            nodesToVisit[nodesToVisitLength++] = nodeOrdinal;
            flags[nodeOrdinal] |= visitedMarker;
        }

        while (nodesToVisitLength) {
            var nodeOrdinal = nodesToVisit[--nodesToVisitLength];
            flags[nodeOrdinal] |= flag;
            flags[nodeOrdinal] &= visitedMarkerMask;
            var beginEdgeIndex = firstEdgeIndexes[nodeOrdinal];
            var endEdgeIndex = firstEdgeIndexes[nodeOrdinal + 1];
            for (var edgeIndex = beginEdgeIndex; edgeIndex < endEdgeIndex; edgeIndex += edgeFieldsCount) {
                var childNodeIndex = containmentEdges[edgeIndex + edgeToNodeOffset];
                var childNodeOrdinal = childNodeIndex / nodeFieldCount;
                if (flags[childNodeOrdinal] & markerAndFlag)
                    continue;
                var type = containmentEdges[edgeIndex + edgeTypeOffset];
                if (type === edgeWeakType)
                    continue;
                nodesToVisit[nodesToVisitLength++] = childNodeOrdinal;
                flags[childNodeOrdinal] |= visitedMarker;
            }
        }
    },

    /**
     * @override
     */
    _calculateStatistics: function()
    {
        var nodeFieldCount = this._nodeFieldCount;
        var nodes = this.nodes;
        var nodesLength = nodes.length;
        var nodeTypeOffset = this._nodeTypeOffset;
        var nodeSizeOffset = this._nodeSelfSizeOffset;;
        var nodeNativeType = this._nodeNativeType;
        var nodeCodeType = this._nodeCodeType;
        var nodeConsStringType = this._nodeConsStringType;
        var nodeSlicedStringType = this._nodeSlicedStringType;
        var distances = this._nodeDistances;
        var sizeNative = 0;
        var sizeCode = 0;
        var sizeStrings = 0;
        var sizeJSArrays = 0;
        var sizeSystem = 0;
        var node = this.rootNode();
        for (var nodeIndex = 0; nodeIndex < nodesLength; nodeIndex += nodeFieldCount) {
            var nodeSize = nodes[nodeIndex + nodeSizeOffset];
            var ordinal = nodeIndex / nodeFieldCount;
            if (distances[ordinal] >= WebInspector.HeapSnapshotCommon.baseSystemDistance) {
                sizeSystem += nodeSize;
                continue;
            }
            var nodeType = nodes[nodeIndex + nodeTypeOffset];
            node.nodeIndex = nodeIndex;
            if (nodeType === nodeNativeType)
                sizeNative += nodeSize;
            else if (nodeType === nodeCodeType)
                sizeCode += nodeSize;
            else if (nodeType === nodeConsStringType || nodeType === nodeSlicedStringType || node.type() === "string")
                sizeStrings += nodeSize;
            else if (node.name() === "Array")
                sizeJSArrays += this._calculateArraySize(node);
        }
        this._statistics = new WebInspector.HeapSnapshotCommon.Statistics();
        this._statistics.total = this.totalSize;
        this._statistics.v8heap = this.totalSize - sizeNative;
        this._statistics.native = sizeNative;
        this._statistics.code = sizeCode;
        this._statistics.jsArrays = sizeJSArrays;
        this._statistics.strings = sizeStrings;
        this._statistics.system = sizeSystem;
    },

    /**
     * @param {!WebInspector.HeapSnapshotNode} node
     * @return {number}
     */
    _calculateArraySize: function(node)
    {
        var size = node.selfSize();
        var beginEdgeIndex = node.edgeIndexesStart();
        var endEdgeIndex = node.edgeIndexesEnd();
        var containmentEdges = this.containmentEdges;
        var strings = this.strings;
        var edgeToNodeOffset = this._edgeToNodeOffset;
        var edgeTypeOffset = this._edgeTypeOffset;
        var edgeNameOffset = this._edgeNameOffset;
        var edgeFieldsCount = this._edgeFieldsCount;
        var edgeInternalType = this._edgeInternalType;
        for (var edgeIndex = beginEdgeIndex; edgeIndex < endEdgeIndex; edgeIndex += edgeFieldsCount) {
            var edgeType = containmentEdges[edgeIndex + edgeTypeOffset];
            if (edgeType !== edgeInternalType)
                continue;
            var edgeName = strings[containmentEdges[edgeIndex + edgeNameOffset]];
            if (edgeName !== "elements")
                continue;
            var elementsNodeIndex = containmentEdges[edgeIndex + edgeToNodeOffset];
            node.nodeIndex = elementsNodeIndex;
            if (node.retainersCount() === 1)
                size += node.selfSize();
            break;
        }
        return size;
    },

    /**
     * @return {!WebInspector.HeapSnapshotCommon.Statistics}
     */
    getStatistics: function()
    {
        return this._statistics;
    },

    __proto__: WebInspector.HeapSnapshot.prototype
};

/**
 * @constructor
 * @extends {WebInspector.HeapSnapshotNode}
 * @param {!WebInspector.JSHeapSnapshot} snapshot
 * @param {number=} nodeIndex
 */
WebInspector.JSHeapSnapshotNode = function(snapshot, nodeIndex)
{
    WebInspector.HeapSnapshotNode.call(this, snapshot, nodeIndex);
}

WebInspector.JSHeapSnapshotNode.prototype = {
    /**
     * @return {boolean}
     */
    canBeQueried: function()
    {
        var flags = this._snapshot._flagsOfNode(this);
        return !!(flags & this._snapshot._nodeFlags.canBeQueried);
    },

    /**
     * @return {string}
     */
    rawName: WebInspector.HeapSnapshotNode.prototype.name,

    /**
     * @override
     * @return {string}
     */
    name: function()
    {
        var snapshot = this._snapshot;
        if (this._type() === snapshot._nodeConsStringType) {
            var string = snapshot._lazyStringCache[this.nodeIndex];
            if (typeof string === "undefined") {
                string = this._consStringName();
                snapshot._lazyStringCache[this.nodeIndex] = string;
            }
            return string;
        }
        return this.rawName();
    },

    /**
     * @return {string}
     */
    _consStringName: function()
    {
        var snapshot = this._snapshot;
        var consStringType = snapshot._nodeConsStringType;
        var edgeInternalType = snapshot._edgeInternalType;
        var edgeFieldsCount = snapshot._edgeFieldsCount;
        var edgeToNodeOffset = snapshot._edgeToNodeOffset;
        var edgeTypeOffset = snapshot._edgeTypeOffset;
        var edgeNameOffset = snapshot._edgeNameOffset;
        var strings = snapshot.strings;
        var edges = snapshot.containmentEdges;
        var firstEdgeIndexes = snapshot._firstEdgeIndexes;
        var nodeFieldCount = snapshot._nodeFieldCount;
        var nodeTypeOffset = snapshot._nodeTypeOffset;
        var nodeNameOffset = snapshot._nodeNameOffset;
        var nodes = snapshot.nodes;
        var nodesStack = [];
        nodesStack.push(this.nodeIndex);
        var name = "";

        while (nodesStack.length && name.length < 1024) {
            var nodeIndex = nodesStack.pop();
            if (nodes[nodeIndex + nodeTypeOffset] !== consStringType) {
                name += strings[nodes[nodeIndex + nodeNameOffset]];
                continue;
            }
            var nodeOrdinal = nodeIndex / nodeFieldCount;
            var beginEdgeIndex = firstEdgeIndexes[nodeOrdinal];
            var endEdgeIndex = firstEdgeIndexes[nodeOrdinal + 1];
            var firstNodeIndex = 0;
            var secondNodeIndex = 0;
            for (var edgeIndex = beginEdgeIndex; edgeIndex < endEdgeIndex && (!firstNodeIndex || !secondNodeIndex); edgeIndex += edgeFieldsCount) {
                var edgeType = edges[edgeIndex + edgeTypeOffset];
                if (edgeType === edgeInternalType) {
                    var edgeName = strings[edges[edgeIndex + edgeNameOffset]];
                    if (edgeName === "first")
                        firstNodeIndex = edges[edgeIndex + edgeToNodeOffset];
                    else if (edgeName === "second")
                        secondNodeIndex = edges[edgeIndex + edgeToNodeOffset];
                }
            }
            nodesStack.push(secondNodeIndex);
            nodesStack.push(firstNodeIndex);
        }
        return name;
    },

    /**
     * @override
     * @return {string}
     */
    className: function()
    {
        var type = this.type();
        switch (type) {
        case "hidden":
            return "(system)";
        case "object":
        case "native":
            return this.name();
        case "code":
            return "(compiled code)";
        default:
            return "(" + type + ")";
        }
    },

    /**
     * @override
     * @return {number}
     */
    classIndex: function()
    {
        var snapshot = this._snapshot;
        var nodes = snapshot.nodes;
        var type = nodes[this.nodeIndex + snapshot._nodeTypeOffset];;
        if (type === snapshot._nodeObjectType || type === snapshot._nodeNativeType)
            return nodes[this.nodeIndex + snapshot._nodeNameOffset];
        return -1 - type;
    },

    /**
     * @override
     * @return {number}
     */
    id: function()
    {
        var snapshot = this._snapshot;
        return snapshot.nodes[this.nodeIndex + snapshot._nodeIdOffset];
    },

    /**
     * @return {boolean}
     */
    isHidden: function()
    {
        return this._type() === this._snapshot._nodeHiddenType;
    },

    /**
     * @return {boolean}
     */
    isArray: function()
    {
        return this._type() === this._snapshot._nodeArrayType;
    },

    /**
     * @return {boolean}
     */
    isSynthetic: function()
    {
        return this._type() === this._snapshot._nodeSyntheticType;
    },

    /**
     * @return {boolean}
     */
    isUserRoot: function()
    {
        return !this.isSynthetic();
    },

    /**
     * @return {boolean}
     */
    isDocumentDOMTreesRoot: function()
    {
        return this.isSynthetic() && this.name() === "(Document DOM trees)";
    },

    /**
     * @override
     * @return {!WebInspector.HeapSnapshotCommon.Node}
     */
    serialize: function()
    {
        var result = WebInspector.HeapSnapshotNode.prototype.serialize.call(this);
        var flags = this._snapshot._flagsOfNode(this);
        if (flags & this._snapshot._nodeFlags.canBeQueried)
            result.canBeQueried = true;
        if (flags & this._snapshot._nodeFlags.detachedDOMTreeNode)
            result.detachedDOMTreeNode = true;
        return result;
    },

    __proto__: WebInspector.HeapSnapshotNode.prototype
};

/**
 * @constructor
 * @extends {WebInspector.HeapSnapshotEdge}
 * @param {!WebInspector.JSHeapSnapshot} snapshot
 * @param {number=} edgeIndex
 */
WebInspector.JSHeapSnapshotEdge = function(snapshot, edgeIndex)
{
    WebInspector.HeapSnapshotEdge.call(this, snapshot, edgeIndex);
}

WebInspector.JSHeapSnapshotEdge.prototype = {
    /**
     * @override
     * @return {!WebInspector.JSHeapSnapshotEdge}
     */
    clone: function()
    {
        var snapshot = /** @type {!WebInspector.JSHeapSnapshot} */ (this._snapshot);
        return new WebInspector.JSHeapSnapshotEdge(snapshot, this.edgeIndex);
    },

    /**
     * @override
     * @return {boolean}
     */
    hasStringName: function()
    {
        if (!this.isShortcut())
            return this._hasStringName();
        return isNaN(parseInt(this._name(), 10));
    },

    /**
     * @return {boolean}
     */
    isElement: function()
    {
        return this._type() === this._snapshot._edgeElementType;
    },

    /**
     * @return {boolean}
     */
    isHidden: function()
    {
        return this._type() === this._snapshot._edgeHiddenType;
    },

    /**
     * @return {boolean}
     */
    isWeak: function()
    {
        return this._type() === this._snapshot._edgeWeakType;
    },

    /**
     * @return {boolean}
     */
    isInternal: function()
    {
        return this._type() === this._snapshot._edgeInternalType;
    },

    /**
     * @return {boolean}
     */
    isInvisible: function()
    {
        return this._type() === this._snapshot._edgeInvisibleType;
    },

    /**
     * @return {boolean}
     */
    isShortcut: function()
    {
        return this._type() === this._snapshot._edgeShortcutType;
    },

    /**
     * @override
     * @return {string}
     */
    name: function()
    {
        var name = this._name();
        if (!this.isShortcut())
            return String(name);
        var numName = parseInt(name, 10);
        return String(isNaN(numName) ? name : numName);
    },

    /**
     * @override
     * @return {string}
     */
    toString: function()
    {
        var name = this.name();
        switch (this.type()) {
        case "context": return "->" + name;
        case "element": return "[" + name + "]";
        case "weak": return "[[" + name + "]]";
        case "property":
            return name.indexOf(" ") === -1 ? "." + name : "[\"" + name + "\"]";
        case "shortcut":
            if (typeof name === "string")
                return name.indexOf(" ") === -1 ? "." + name : "[\"" + name + "\"]";
            else
                return "[" + name + "]";
        case "internal":
        case "hidden":
        case "invisible":
            return "{" + name + "}";
        };
        return "?" + name + "?";
    },

    /**
     * @return {boolean}
     */
    _hasStringName: function()
    {
        var type = this._type();
        var snapshot = this._snapshot;
        return type !== snapshot._edgeElementType && type !== snapshot._edgeHiddenType;
    },

    /**
     * @return {string|number}
     */
    _name: function()
    {
        return this._hasStringName() ? this._snapshot.strings[this._nameOrIndex()] : this._nameOrIndex();
    },

    /**
     * @return {number}
     */
    _nameOrIndex: function()
    {
        return this._edges[this.edgeIndex + this._snapshot._edgeNameOffset];
    },

    /**
     * @return {number}
     */
    _type: function()
    {
        return this._edges[this.edgeIndex + this._snapshot._edgeTypeOffset];
    },

    __proto__: WebInspector.HeapSnapshotEdge.prototype
};


/**
 * @constructor
 * @extends {WebInspector.HeapSnapshotRetainerEdge}
 * @param {!WebInspector.JSHeapSnapshot} snapshot
 * @param {number} retainerIndex
 */
WebInspector.JSHeapSnapshotRetainerEdge = function(snapshot, retainerIndex)
{
    WebInspector.HeapSnapshotRetainerEdge.call(this, snapshot, retainerIndex);
}

WebInspector.JSHeapSnapshotRetainerEdge.prototype = {
    /**
     * @override
     * @return {!WebInspector.JSHeapSnapshotRetainerEdge}
     */
    clone: function()
    {
        var snapshot = /** @type {!WebInspector.JSHeapSnapshot} */ (this._snapshot);
        return new WebInspector.JSHeapSnapshotRetainerEdge(snapshot, this.retainerIndex());
    },

    /**
     * @return {boolean}
     */
    isHidden: function()
    {
        return this._edge().isHidden();
    },

    /**
     * @return {boolean}
     */
    isInternal: function()
    {
        return this._edge().isInternal();
    },

    /**
     * @return {boolean}
     */
    isInvisible: function()
    {
        return this._edge().isInvisible();
    },

    /**
     * @return {boolean}
     */
    isShortcut: function()
    {
        return this._edge().isShortcut();
    },

    /**
     * @return {boolean}
     */
    isWeak: function()
    {
        return this._edge().isWeak();
    },

    __proto__: WebInspector.HeapSnapshotRetainerEdge.prototype
}

