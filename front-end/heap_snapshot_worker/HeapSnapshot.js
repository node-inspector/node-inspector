/*
 * Copyright (C) 2011 Google Inc. All rights reserved.
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
 * @interface
 */
WebInspector.HeapSnapshotItem = function() { }

WebInspector.HeapSnapshotItem.prototype = {
    /**
     * @return {number}
     */
    itemIndex: function() { },

    /**
     * @return {!Object}
     */
    serialize: function() { }
};

/**
 * @constructor
 * @implements {WebInspector.HeapSnapshotItem}
 * @param {!WebInspector.HeapSnapshot} snapshot
 * @param {number=} edgeIndex
 */
WebInspector.HeapSnapshotEdge = function(snapshot, edgeIndex)
{
    this._snapshot = snapshot;
    this._edges = snapshot.containmentEdges;
    this.edgeIndex = edgeIndex || 0;
}

WebInspector.HeapSnapshotEdge.prototype = {
    /**
     * @return {!WebInspector.HeapSnapshotEdge}
     */
    clone: function()
    {
        return new WebInspector.HeapSnapshotEdge(this._snapshot, this.edgeIndex);
    },

    /**
     * @return {boolean}
     */
    hasStringName: function()
    {
        throw new Error("Not implemented");
    },

    /**
     * @return {string}
     */
    name: function()
    {
        throw new Error("Not implemented");
    },

    /**
     * @return {!WebInspector.HeapSnapshotNode}
     */
    node: function()
    {
        return this._snapshot.createNode(this.nodeIndex());
    },

    /**
     * @return {number}
     */
    nodeIndex: function()
    {
        return this._edges[this.edgeIndex + this._snapshot._edgeToNodeOffset];
    },

    /**
     * @override
     * @return {string}
     */
    toString: function()
    {
        return "HeapSnapshotEdge: " + this.name();
    },

    /**
     * @return {string}
     */
    type: function()
    {
        return this._snapshot._edgeTypes[this._type()];
    },

    /**
     * @override
     * @return {number}
     */
    itemIndex: function()
    {
        return this.edgeIndex;
    },

    /**
     * @override
     * @return {!WebInspector.HeapSnapshotCommon.Edge}
     */
    serialize: function()
    {
        return new WebInspector.HeapSnapshotCommon.Edge(this.name(), this.node().serialize(), this.type(), this.edgeIndex);
    },

    _type: function()
    {
        return this._edges[this.edgeIndex + this._snapshot._edgeTypeOffset];
    }
};


/**
 * @interface
 */
WebInspector.HeapSnapshotItemIterator = function() { }

WebInspector.HeapSnapshotItemIterator.prototype = {
    /**
     * @return {boolean}
     */
    hasNext: function() { },

    /**
     * @return {!WebInspector.HeapSnapshotItem}
     */
    item: function() { },

    next: function() { }
};


/**
 * @interface
 */
WebInspector.HeapSnapshotItemIndexProvider = function() { }

WebInspector.HeapSnapshotItemIndexProvider.prototype = {
    /**
     * @param {number} newIndex
     * @return {!WebInspector.HeapSnapshotItem}
     */
    itemForIndex: function(newIndex) { },
};

/**
 * @constructor
 * @implements {WebInspector.HeapSnapshotItemIndexProvider}
 * @param {!WebInspector.HeapSnapshot} snapshot
 */
WebInspector.HeapSnapshotNodeIndexProvider = function(snapshot)
{
    this._node = snapshot.createNode();
}

WebInspector.HeapSnapshotNodeIndexProvider.prototype = {
    /**
     * @override
     * @param {number} index
     * @return {!WebInspector.HeapSnapshotNode}
     */
    itemForIndex: function(index)
    {
        this._node.nodeIndex = index;
        return this._node;
    }
};


/**
 * @constructor
 * @implements {WebInspector.HeapSnapshotItemIndexProvider}
 * @param {!WebInspector.HeapSnapshot} snapshot
 */
WebInspector.HeapSnapshotEdgeIndexProvider = function(snapshot)
{
    this._edge = snapshot.createEdge(0);
}

WebInspector.HeapSnapshotEdgeIndexProvider.prototype = {
    /**
     * @override
     * @param {number} index
     * @return {!WebInspector.HeapSnapshotEdge}
     */
    itemForIndex: function(index)
    {
        this._edge.edgeIndex = index;
        return this._edge;
    }
};


/**
 * @constructor
 * @implements {WebInspector.HeapSnapshotItemIndexProvider}
 * @param {!WebInspector.HeapSnapshot} snapshot
 */
WebInspector.HeapSnapshotRetainerEdgeIndexProvider = function(snapshot)
{
    this._retainerEdge = snapshot.createRetainingEdge(0);
}

WebInspector.HeapSnapshotRetainerEdgeIndexProvider.prototype = {
    /**
     * @override
     * @param {number} index
     * @return {!WebInspector.HeapSnapshotRetainerEdge}
     */
    itemForIndex: function(index)
    {
        this._retainerEdge.setRetainerIndex(index);
        return this._retainerEdge;
    }
};


/**
 * @constructor
 * @implements {WebInspector.HeapSnapshotItemIterator}
 * @param {!WebInspector.HeapSnapshotNode} node
 */
WebInspector.HeapSnapshotEdgeIterator = function(node)
{
    this._sourceNode = node;
    this.edge = node._snapshot.createEdge(node.edgeIndexesStart());
}

WebInspector.HeapSnapshotEdgeIterator.prototype = {
    /**
     * @override
     * @return {boolean}
     */
    hasNext: function()
    {
        return this.edge.edgeIndex < this._sourceNode.edgeIndexesEnd();
    },

    /**
     * @override
     * @return {!WebInspector.HeapSnapshotEdge}
     */
    item: function()
    {
        return this.edge;
    },

    /**
     * @override
     */
    next: function()
    {
        this.edge.edgeIndex += this.edge._snapshot._edgeFieldsCount;
    }
};

/**
 * @constructor
 * @implements {WebInspector.HeapSnapshotItem}
 * @param {!WebInspector.HeapSnapshot} snapshot
 * @param {number} retainerIndex
 */
WebInspector.HeapSnapshotRetainerEdge = function(snapshot, retainerIndex)
{
    this._snapshot = snapshot;
    this.setRetainerIndex(retainerIndex);
}

WebInspector.HeapSnapshotRetainerEdge.prototype = {
    /**
     * @return {!WebInspector.HeapSnapshotRetainerEdge}
     */
    clone: function()
    {
        return new WebInspector.HeapSnapshotRetainerEdge(this._snapshot, this.retainerIndex());
    },

    /**
     * @return {boolean}
     */
    hasStringName: function()
    {
        return this._edge().hasStringName();
    },

    /**
     * @return {string}
     */
    name: function()
    {
        return this._edge().name();
    },

    /**
     * @return {!WebInspector.HeapSnapshotNode}
     */
    node: function()
    {
        return this._node();
    },

    /**
     * @return {number}
     */
    nodeIndex: function()
    {
        return this._retainingNodeIndex;
    },

    /**
     * @return {number}
     */
    retainerIndex: function()
    {
        return this._retainerIndex;
    },

    /**
     * @param {number} retainerIndex
     */
    setRetainerIndex: function(retainerIndex)
    {
        if (retainerIndex === this._retainerIndex)
            return;
        this._retainerIndex = retainerIndex;
        this._globalEdgeIndex = this._snapshot._retainingEdges[retainerIndex];
        this._retainingNodeIndex = this._snapshot._retainingNodes[retainerIndex];
        this._edgeInstance = null;
        this._nodeInstance = null;
    },

    /**
     * @param {number} edgeIndex
     */
    set edgeIndex(edgeIndex)
    {
        this.setRetainerIndex(edgeIndex);
    },

    _node: function()
    {
        if (!this._nodeInstance)
            this._nodeInstance = this._snapshot.createNode(this._retainingNodeIndex);
        return this._nodeInstance;
    },

    _edge: function()
    {
        if (!this._edgeInstance)
            this._edgeInstance = this._snapshot.createEdge(this._globalEdgeIndex);
        return this._edgeInstance;
    },

    /**
     * @override
     * @return {string}
     */
    toString: function()
    {
        return this._edge().toString();
    },

    /**
     * @override
     * @return {number}
     */
    itemIndex: function()
    {
        return this._retainerIndex;
    },

    /**
     * @override
     * @return {!WebInspector.HeapSnapshotCommon.Edge}
     */
    serialize: function()
    {
        return new WebInspector.HeapSnapshotCommon.Edge(this.name(), this.node().serialize(), this.type(), this._globalEdgeIndex);
    },

    /**
     * @return {string}
     */
    type: function()
    {
        return this._edge().type();
    }
}

/**
 * @constructor
 * @implements {WebInspector.HeapSnapshotItemIterator}
 * @param {!WebInspector.HeapSnapshotNode} retainedNode
 */
WebInspector.HeapSnapshotRetainerEdgeIterator = function(retainedNode)
{
    var snapshot = retainedNode._snapshot;
    var retainedNodeOrdinal = retainedNode.ordinal();
    var retainerIndex = snapshot._firstRetainerIndex[retainedNodeOrdinal];
    this._retainersEnd = snapshot._firstRetainerIndex[retainedNodeOrdinal + 1];
    this.retainer = snapshot.createRetainingEdge(retainerIndex);
}

WebInspector.HeapSnapshotRetainerEdgeIterator.prototype = {
    /**
     * @override
     * @return {boolean}
     */
    hasNext: function()
    {
        return this.retainer.retainerIndex() < this._retainersEnd;
    },

    /**
     * @override
     * @return {!WebInspector.HeapSnapshotRetainerEdge}
     */
    item: function()
    {
        return this.retainer;
    },

    /**
     * @override
     */
    next: function()
    {
        this.retainer.setRetainerIndex(this.retainer.retainerIndex() + 1);
    }
};

/**
 * @constructor
 * @implements {WebInspector.HeapSnapshotItem}
 * @param {!WebInspector.HeapSnapshot} snapshot
 * @param {number=} nodeIndex
 */
WebInspector.HeapSnapshotNode = function(snapshot, nodeIndex)
{
    this._snapshot = snapshot;
    this.nodeIndex = nodeIndex || 0;
}

WebInspector.HeapSnapshotNode.prototype = {
    /**
     * @return {number}
     */
    distance: function()
    {
        return this._snapshot._nodeDistances[this.nodeIndex / this._snapshot._nodeFieldCount];
    },

    /**
     * @return {string}
     */
    className: function()
    {
        throw new Error("Not implemented");
    },

    /**
     * @return {number}
     */
    classIndex: function()
    {
        throw new Error("Not implemented");
    },

    /**
     * @return {number}
     */
    dominatorIndex: function()
    {
        var nodeFieldCount = this._snapshot._nodeFieldCount;
        return this._snapshot._dominatorsTree[this.nodeIndex / this._snapshot._nodeFieldCount] * nodeFieldCount;
    },

    /**
     * @return {!WebInspector.HeapSnapshotEdgeIterator}
     */
    edges: function()
    {
        return new WebInspector.HeapSnapshotEdgeIterator(this);
    },

    /**
     * @return {number}
     */
    edgesCount: function()
    {
        return (this.edgeIndexesEnd() - this.edgeIndexesStart()) / this._snapshot._edgeFieldsCount;
    },

    /**
     * @return {number}
     */
    id: function()
    {
        throw new Error("Not implemented");
    },

    /**
     * @return {boolean}
     */
    isRoot: function()
    {
        return this.nodeIndex === this._snapshot._rootNodeIndex;
    },

    /**
     * @return {string}
     */
    name: function()
    {
        return this._snapshot.strings[this._name()];
    },

    /**
     * @return {number}
     */
    retainedSize: function()
    {
        return this._snapshot._retainedSizes[this.ordinal()];
    },

    /**
     * @return {!WebInspector.HeapSnapshotRetainerEdgeIterator}
     */
    retainers: function()
    {
        return new WebInspector.HeapSnapshotRetainerEdgeIterator(this);
    },

    /**
     * @return {number}
     */
    retainersCount: function()
    {
        var snapshot = this._snapshot;
        var ordinal = this.ordinal();
        return snapshot._firstRetainerIndex[ordinal + 1] - snapshot._firstRetainerIndex[ordinal];
    },

    /**
     * @return {number}
     */
    selfSize: function()
    {
        var snapshot = this._snapshot;
        return snapshot.nodes[this.nodeIndex + snapshot._nodeSelfSizeOffset];
    },

    /**
     * @return {string}
     */
    type: function()
    {
        return this._snapshot._nodeTypes[this._type()];
    },

    /**
     * @return {number}
     */
    traceNodeId: function()
    {
        var snapshot = this._snapshot;
        return snapshot.nodes[this.nodeIndex + snapshot._nodeTraceNodeIdOffset];
    },

    /**
     * @override
     * @return {number}
     */
    itemIndex: function()
    {
        return this.nodeIndex;
    },

    /**
     * @override
     * @return {!WebInspector.HeapSnapshotCommon.Node}
     */
    serialize: function()
    {
        return new WebInspector.HeapSnapshotCommon.Node(this.id(), this.name(), this.distance(), this.nodeIndex, this.retainedSize(), this.selfSize(), this.type());
    },

    /**
     * @return {number}
     */
    _name: function()
    {
        var snapshot = this._snapshot;
        return snapshot.nodes[this.nodeIndex + snapshot._nodeNameOffset];
    },

    /**
     * @return {number}
     */
    edgeIndexesStart: function()
    {
        return this._snapshot._firstEdgeIndexes[this.ordinal()];
    },

    /**
     * @return {number}
     */
    edgeIndexesEnd: function()
    {
        return this._snapshot._firstEdgeIndexes[this.ordinal() + 1];
    },

    /**
     * @return {number}
     */
    ordinal: function()
    {
        return this.nodeIndex / this._snapshot._nodeFieldCount;
    },

    /**
     * @return {number}
     */
    _nextNodeIndex: function()
    {
        return this.nodeIndex + this._snapshot._nodeFieldCount;
    },

    /**
     * @return {number}
     */
    _type: function()
    {
        var snapshot = this._snapshot;
        return snapshot.nodes[this.nodeIndex + snapshot._nodeTypeOffset];
    }
};

/**
 * @constructor
 * @implements {WebInspector.HeapSnapshotItemIterator}
 * @param {!WebInspector.HeapSnapshotNode} node
 */
WebInspector.HeapSnapshotNodeIterator = function(node)
{
    this.node = node;
    this._nodesLength = node._snapshot.nodes.length;
}

WebInspector.HeapSnapshotNodeIterator.prototype = {
    /**
     * @override
     * @return {boolean}
     */
    hasNext: function()
    {
        return this.node.nodeIndex < this._nodesLength;
    },

    /**
     * @override
     * @return {!WebInspector.HeapSnapshotNode}
     */
    item: function()
    {
        return this.node;
    },

    /**
     * @override
     */
    next: function()
    {
        this.node.nodeIndex = this.node._nextNodeIndex();
    }
}


/**
 * @constructor
 * @implements {WebInspector.HeapSnapshotItemIterator}
 * @param {!WebInspector.HeapSnapshotItemIndexProvider} itemProvider
 * @param {!Array.<number>|!Uint32Array} indexes
 */
WebInspector.HeapSnapshotIndexRangeIterator = function(itemProvider, indexes)
{
    this._itemProvider = itemProvider;
    this._indexes = indexes;
    this._position = 0;
}

WebInspector.HeapSnapshotIndexRangeIterator.prototype = {
    /**
     * @override
     * @return {boolean}
     */
    hasNext: function()
    {
        return this._position < this._indexes.length;
    },

    /**
     * @override
     * @return {!WebInspector.HeapSnapshotItem}
     */
    item: function()
    {
        var index = this._indexes[this._position];
        return this._itemProvider.itemForIndex(index);
    },

    /**
     * @override
     */
    next: function()
    {
        ++this._position;
    }
}


/**
 * @constructor
 * @implements {WebInspector.HeapSnapshotItemIterator}
 * @param {!WebInspector.HeapSnapshotItemIterator} iterator
 * @param {function(!WebInspector.HeapSnapshotItem):boolean=} filter
 */
WebInspector.HeapSnapshotFilteredIterator = function(iterator, filter)
{
    this._iterator = iterator;
    this._filter = filter;
    this._skipFilteredItems();
}

WebInspector.HeapSnapshotFilteredIterator.prototype = {
    /**
     * @override
     * @return {boolean}
     */
    hasNext: function()
    {
        return this._iterator.hasNext();
    },

    /**
     * @override
     * @return {!WebInspector.HeapSnapshotItem}
     */
    item: function()
    {
        return this._iterator.item();
    },

    /**
     * @override
     */
    next: function()
    {
        this._iterator.next();
        this._skipFilteredItems();
    },

    _skipFilteredItems: function()
    {
        while (this._iterator.hasNext() && !this._filter(this._iterator.item())) {
            this._iterator.next();
        }
    }
}


/**
 * @param {!WebInspector.HeapSnapshotWorkerDispatcher=} dispatcher
 * @constructor
 */
WebInspector.HeapSnapshotProgress = function(dispatcher)
{
    this._dispatcher = dispatcher;
}

WebInspector.HeapSnapshotProgress.prototype = {
    /**
     * @param {string} status
     */
    updateStatus: function(status)
    {
        this._sendUpdateEvent(WebInspector.UIString(status));
    },

    /**
     * @param {string} title
     * @param {number} value
     * @param {number} total
     */
    updateProgress: function(title, value, total)
    {
        var percentValue = ((total ? (value / total) : 0) * 100).toFixed(0);
        this._sendUpdateEvent(WebInspector.UIString(title, percentValue));
    },

    /**
     * @param {string} error
     */
    reportProblem: function(error)
    {
        // May be undefined in tests.
        if (this._dispatcher)
            this._dispatcher.sendEvent(WebInspector.HeapSnapshotProgressEvent.BrokenSnapshot, error);
    },

    /**
     * @param {string} text
     */
    _sendUpdateEvent: function(text)
    {
        // May be undefined in tests.
        if (this._dispatcher)
            this._dispatcher.sendEvent(WebInspector.HeapSnapshotProgressEvent.Update, text);
    }
}


/**
 * @param {string} title
 * @constructor
 */
WebInspector.HeapSnapshotProblemReport = function(title)
{
    this._errors = [title];
}

WebInspector.HeapSnapshotProblemReport.prototype = {
    /**
     * @param {string} error
     */
    addError: function(error)
    {
        if (this._errors.length > 100)
            return;
        this._errors.push(error);
    },

    /**
     * @override
     * @return {string}
     */
    toString: function()
    {
        return this._errors.join("\n  ");
    }
}


/**
 * @param {!Object} profile
 * @param {!WebInspector.HeapSnapshotProgress} progress
 * @constructor
 */
WebInspector.HeapSnapshot = function(profile, progress)
{
    /** @type {!Uint32Array} */
    this.nodes = profile.nodes;
    /** @type {!Uint32Array} */
    this.containmentEdges = profile.edges;
    /** @type {!HeapSnapshotMetainfo} */
    this._metaNode = profile.snapshot.meta;
    /** @type {!Array.<number>} */
    this._rawSamples = profile.samples;
    /** @type {?WebInspector.HeapSnapshotCommon.Samples} */
    this._samples = null;
    /** @type {!Array.<string>} */
    this.strings = profile.strings;
    this._progress = progress;

    this._noDistance = -5;
    this._rootNodeIndex = 0;
    if (profile.snapshot.root_index)
        this._rootNodeIndex = profile.snapshot.root_index;

    this._snapshotDiffs = {};
    this._aggregatesForDiff = null;
    this._aggregates = {};
    this._aggregatesSortedFlags = {};

    this._init();

    if (profile.snapshot.trace_function_count) {
        this._progress.updateStatus("Building allocation statistics\u2026");
        var nodes = this.nodes;
        var nodesLength = nodes.length;
        var nodeFieldCount = this._nodeFieldCount;
        var node = this.rootNode();
        var liveObjects = {};
        for (var nodeIndex = 0; nodeIndex < nodesLength; nodeIndex += nodeFieldCount) {
            node.nodeIndex = nodeIndex;
            var traceNodeId = node.traceNodeId();
            var stats = liveObjects[traceNodeId];
            if (!stats)
                liveObjects[traceNodeId] = stats = { count: 0, size: 0, ids: [] };
            stats.count++;
            stats.size += node.selfSize();
            stats.ids.push(node.id());
        }
        this._allocationProfile = new WebInspector.AllocationProfile(profile, liveObjects);
        this._progress.updateStatus("Done");
    }
}

/**
 * @constructor
 */
function HeapSnapshotMetainfo()
{
    // New format.
    this.node_fields = [];
    this.node_types = [];
    this.edge_fields = [];
    this.edge_types = [];
    this.trace_function_info_fields = [];
    this.trace_node_fields = [];
    this.sample_fields = [];
    this.type_strings = {};
}

/**
 * @constructor
 */
function HeapSnapshotHeader()
{
    // New format.
    this.title = "";
    this.meta = new HeapSnapshotMetainfo();
    this.node_count = 0;
    this.edge_count = 0;
    this.trace_function_count = 0;
}

WebInspector.HeapSnapshot.prototype = {
    _init: function()
    {
        var meta = this._metaNode;

        this._nodeTypeOffset = meta.node_fields.indexOf("type");
        this._nodeNameOffset = meta.node_fields.indexOf("name");
        this._nodeIdOffset = meta.node_fields.indexOf("id");
        this._nodeSelfSizeOffset = meta.node_fields.indexOf("self_size");
        this._nodeEdgeCountOffset = meta.node_fields.indexOf("edge_count");
        this._nodeTraceNodeIdOffset = meta.node_fields.indexOf("trace_node_id");
        this._nodeFieldCount = meta.node_fields.length;

        this._nodeTypes = meta.node_types[this._nodeTypeOffset];
        this._nodeArrayType = this._nodeTypes.indexOf("array");
        this._nodeHiddenType = this._nodeTypes.indexOf("hidden");
        this._nodeObjectType = this._nodeTypes.indexOf("object");
        this._nodeNativeType = this._nodeTypes.indexOf("native");
        this._nodeConsStringType = this._nodeTypes.indexOf("concatenated string");
        this._nodeSlicedStringType = this._nodeTypes.indexOf("sliced string");
        this._nodeCodeType = this._nodeTypes.indexOf("code");
        this._nodeSyntheticType = this._nodeTypes.indexOf("synthetic");

        this._edgeFieldsCount = meta.edge_fields.length;
        this._edgeTypeOffset = meta.edge_fields.indexOf("type");
        this._edgeNameOffset = meta.edge_fields.indexOf("name_or_index");
        this._edgeToNodeOffset = meta.edge_fields.indexOf("to_node");

        this._edgeTypes = meta.edge_types[this._edgeTypeOffset];
        this._edgeTypes.push("invisible");
        this._edgeElementType = this._edgeTypes.indexOf("element");
        this._edgeHiddenType = this._edgeTypes.indexOf("hidden");
        this._edgeInternalType = this._edgeTypes.indexOf("internal");
        this._edgeShortcutType = this._edgeTypes.indexOf("shortcut");
        this._edgeWeakType = this._edgeTypes.indexOf("weak");
        this._edgeInvisibleType = this._edgeTypes.indexOf("invisible");

        this.nodeCount = this.nodes.length / this._nodeFieldCount;
        this._edgeCount = this.containmentEdges.length / this._edgeFieldsCount;

        this._retainedSizes = new Float64Array(this.nodeCount);
        this._firstEdgeIndexes = new Uint32Array(this.nodeCount + 1);
        this._retainingNodes = new Uint32Array(this._edgeCount);
        this._retainingEdges = new Uint32Array(this._edgeCount);
        this._firstRetainerIndex = new Uint32Array(this.nodeCount + 1);
        this._nodeDistances = new Int32Array(this.nodeCount);
        this._firstDominatedNodeIndex = new Uint32Array(this.nodeCount + 1);
        this._dominatedNodes = new Uint32Array(this.nodeCount - 1);

        this._progress.updateStatus("Building edge indexes\u2026");
        this._buildEdgeIndexes();
        this._progress.updateStatus("Building retainers\u2026");
        this._buildRetainers();
        this._progress.updateStatus("Calculating node flags\u2026");
        this._calculateFlags();
        this._progress.updateStatus("Calculating distances\u2026");
        this.calculateDistances();
        this._progress.updateStatus("Building postorder index\u2026");
        var result = this._buildPostOrderIndex();
        // Actually it is array that maps node ordinal number to dominator node ordinal number.
        this._progress.updateStatus("Building dominator tree\u2026");
        this._dominatorsTree = this._buildDominatorTree(result.postOrderIndex2NodeOrdinal, result.nodeOrdinal2PostOrderIndex);
        this._progress.updateStatus("Calculating retained sizes\u2026");
        this._calculateRetainedSizes(result.postOrderIndex2NodeOrdinal);
        this._progress.updateStatus("Buiding dominated nodes\u2026");
        this._buildDominatedNodes();
        this._progress.updateStatus("Calculating statistics\u2026");
        this._calculateStatistics();
        this._progress.updateStatus("Calculating samples\u2026");
        this._buildSamples();
        this._progress.updateStatus("Finished processing.");
    },

    _buildEdgeIndexes: function()
    {
        var nodes = this.nodes;
        var nodeCount = this.nodeCount;
        var firstEdgeIndexes = this._firstEdgeIndexes;
        var nodeFieldCount = this._nodeFieldCount;
        var edgeFieldsCount = this._edgeFieldsCount;
        var nodeEdgeCountOffset = this._nodeEdgeCountOffset;
        firstEdgeIndexes[nodeCount] = this.containmentEdges.length;
        for (var nodeOrdinal = 0, edgeIndex = 0; nodeOrdinal < nodeCount; ++nodeOrdinal) {
            firstEdgeIndexes[nodeOrdinal] = edgeIndex;
            edgeIndex += nodes[nodeOrdinal * nodeFieldCount + nodeEdgeCountOffset] * edgeFieldsCount;
        }
    },

    _buildRetainers: function()
    {
        var retainingNodes = this._retainingNodes;
        var retainingEdges = this._retainingEdges;
        // Index of the first retainer in the _retainingNodes and _retainingEdges
        // arrays. Addressed by retained node index.
        var firstRetainerIndex = this._firstRetainerIndex;

        var containmentEdges = this.containmentEdges;
        var edgeFieldsCount = this._edgeFieldsCount;
        var nodeFieldCount = this._nodeFieldCount;
        var edgeToNodeOffset = this._edgeToNodeOffset;
        var firstEdgeIndexes = this._firstEdgeIndexes;
        var nodeCount = this.nodeCount;

        for (var toNodeFieldIndex = edgeToNodeOffset, l = containmentEdges.length; toNodeFieldIndex < l; toNodeFieldIndex += edgeFieldsCount) {
            var toNodeIndex = containmentEdges[toNodeFieldIndex];
            if (toNodeIndex % nodeFieldCount)
                throw new Error("Invalid toNodeIndex " + toNodeIndex);
            ++firstRetainerIndex[toNodeIndex / nodeFieldCount];
        }
        for (var i = 0, firstUnusedRetainerSlot = 0; i < nodeCount; i++) {
            var retainersCount = firstRetainerIndex[i];
            firstRetainerIndex[i] = firstUnusedRetainerSlot;
            retainingNodes[firstUnusedRetainerSlot] = retainersCount;
            firstUnusedRetainerSlot += retainersCount;
        }
        firstRetainerIndex[nodeCount] = retainingNodes.length;

        var nextNodeFirstEdgeIndex = firstEdgeIndexes[0];
        for (var srcNodeOrdinal = 0; srcNodeOrdinal < nodeCount; ++srcNodeOrdinal) {
            var firstEdgeIndex = nextNodeFirstEdgeIndex;
            nextNodeFirstEdgeIndex = firstEdgeIndexes[srcNodeOrdinal + 1];
            var srcNodeIndex = srcNodeOrdinal * nodeFieldCount;
            for (var edgeIndex = firstEdgeIndex; edgeIndex < nextNodeFirstEdgeIndex; edgeIndex += edgeFieldsCount) {
                var toNodeIndex = containmentEdges[edgeIndex + edgeToNodeOffset];
                if (toNodeIndex % nodeFieldCount)
                    throw new Error("Invalid toNodeIndex " + toNodeIndex);
                var firstRetainerSlotIndex = firstRetainerIndex[toNodeIndex / nodeFieldCount];
                var nextUnusedRetainerSlotIndex = firstRetainerSlotIndex + (--retainingNodes[firstRetainerSlotIndex]);
                retainingNodes[nextUnusedRetainerSlotIndex] = srcNodeIndex;
                retainingEdges[nextUnusedRetainerSlotIndex] = edgeIndex;
            }
        }
    },

    /**
     * @param {number=} nodeIndex
     */
    createNode: function(nodeIndex)
    {
        throw new Error("Not implemented");
    },

    /**
     * @param {number} edgeIndex
     * @return {!WebInspector.JSHeapSnapshotEdge}
     */
    createEdge: function(edgeIndex)
    {
        throw new Error("Not implemented");
    },

    /**
     * @param {number} retainerIndex
     * @return {!WebInspector.JSHeapSnapshotRetainerEdge}
     */
    createRetainingEdge: function(retainerIndex)
    {
        throw new Error("Not implemented");
    },

    _allNodes: function()
    {
        return new WebInspector.HeapSnapshotNodeIterator(this.rootNode());
    },

    /**
     * @return {!WebInspector.HeapSnapshotNode}
     */
    rootNode: function()
    {
        return this.createNode(this._rootNodeIndex);
    },

    get rootNodeIndex()
    {
        return this._rootNodeIndex;
    },

    get totalSize()
    {
        return this.rootNode().retainedSize();
    },

    _getDominatedIndex: function(nodeIndex)
    {
        if (nodeIndex % this._nodeFieldCount)
            throw new Error("Invalid nodeIndex: " + nodeIndex);
        return this._firstDominatedNodeIndex[nodeIndex / this._nodeFieldCount];
    },

    /**
     * @param {!WebInspector.HeapSnapshotCommon.NodeFilter} nodeFilter
     * @return {undefined|function(!WebInspector.HeapSnapshotNode):boolean}
     */
    _createFilter: function(nodeFilter)
    {
        var minNodeId = nodeFilter.minNodeId;
        var maxNodeId = nodeFilter.maxNodeId;
        var allocationNodeId = nodeFilter.allocationNodeId;
        var filter;
        if (typeof allocationNodeId === "number") {
            filter = this._createAllocationStackFilter(allocationNodeId);
            filter.key = "AllocationNodeId: " + allocationNodeId;
        } else if (typeof minNodeId === "number" && typeof maxNodeId === "number") {
            filter = this._createNodeIdFilter(minNodeId, maxNodeId);
            filter.key = "NodeIdRange: " + minNodeId + ".." + maxNodeId;
        }
        return filter;
    },

    /**
     * @param {!WebInspector.HeapSnapshotCommon.SearchConfig} searchConfig
     * @param {!WebInspector.HeapSnapshotCommon.NodeFilter} nodeFilter
     * @return {!Array.<number>}
     */
    search: function(searchConfig, nodeFilter)
    {
        var query = searchConfig.query;

        function filterString(matchedStringIndexes, string, index)
        {
            if (string.indexOf(query) !== -1)
                matchedStringIndexes.add(index);
            return matchedStringIndexes;
        }

        var regexp = searchConfig.isRegex ? new RegExp(query) : createPlainTextSearchRegex(query, "i");
        function filterRegexp(matchedStringIndexes, string, index)
        {
            if (regexp.test(string))
                matchedStringIndexes.add(index);
            return matchedStringIndexes;
        }

        var stringFilter = (searchConfig.isRegex || !searchConfig.caseSensitive) ? filterRegexp : filterString;
        var stringIndexes = this.strings.reduce(stringFilter, new Set());

        if (!stringIndexes.size)
            return [];

        var filter = this._createFilter(nodeFilter);
        var nodeIds = [];
        var nodesLength = this.nodes.length;
        var nodes = this.nodes;
        var nodeNameOffset = this._nodeNameOffset;
        var nodeIdOffset = this._nodeIdOffset;
        var nodeFieldCount = this._nodeFieldCount;
        var node = this.rootNode();

        for (var nodeIndex = 0; nodeIndex < nodesLength; nodeIndex += nodeFieldCount) {
            node.nodeIndex = nodeIndex;
            if (filter && !filter(node))
                continue;
            if (stringIndexes.has(nodes[nodeIndex + nodeNameOffset]))
                nodeIds.push(nodes[nodeIndex + nodeIdOffset]);
        }
        return nodeIds;
    },

    /**
     * @param {!WebInspector.HeapSnapshotCommon.NodeFilter} nodeFilter
     * @return {!Object.<string, !WebInspector.HeapSnapshotCommon.Aggregate>}
     */
    aggregatesWithFilter: function(nodeFilter)
    {
        var filter = this._createFilter(nodeFilter);
        var key = filter ? filter.key : "allObjects";
        return this.aggregates(false, key, filter);
    },

    /**
     * @param {number} minNodeId
     * @param {number} maxNodeId
     * @return {function(!WebInspector.HeapSnapshotNode):boolean}
     */
    _createNodeIdFilter: function(minNodeId, maxNodeId)
    {
        /**
         * @param {!WebInspector.HeapSnapshotNode} node
         * @return {boolean}
         */
        function nodeIdFilter(node)
        {
            var id = node.id();
            return id > minNodeId && id <= maxNodeId;
        }
        return nodeIdFilter;
    },

    /**
     * @param {number} bottomUpAllocationNodeId
     * @return {function(!WebInspector.HeapSnapshotNode):boolean|undefined}
     */
    _createAllocationStackFilter: function(bottomUpAllocationNodeId)
    {
        var traceIds = this._allocationProfile.traceIds(bottomUpAllocationNodeId);
        if (!traceIds.length)
            return undefined;
        var set = {};
        for (var i = 0; i < traceIds.length; i++)
            set[traceIds[i]] = true;
        /**
         * @param {!WebInspector.HeapSnapshotNode} node
         * @return {boolean}
         */
        function traceIdFilter(node)
        {
            return !!set[node.traceNodeId()];
        };
        return traceIdFilter;
    },

    /**
     * @param {boolean} sortedIndexes
     * @param {string=} key
     * @param {function(!WebInspector.HeapSnapshotNode):boolean=} filter
     * @return {!Object.<string, !WebInspector.HeapSnapshotCommon.Aggregate>}
     */
    aggregates: function(sortedIndexes, key, filter)
    {
        var aggregatesByClassName = key && this._aggregates[key];
        if (!aggregatesByClassName) {
            var aggregates = this._buildAggregates(filter);
            this._calculateClassesRetainedSize(aggregates.aggregatesByClassIndex, filter);
            aggregatesByClassName = aggregates.aggregatesByClassName;
            if (key)
                this._aggregates[key] = aggregatesByClassName;
        }

        if (sortedIndexes && (!key || !this._aggregatesSortedFlags[key])) {
            this._sortAggregateIndexes(aggregatesByClassName);
            if (key)
                this._aggregatesSortedFlags[key] = sortedIndexes;
        }
        return aggregatesByClassName;
    },

    /**
     * @return {!Array.<!WebInspector.HeapSnapshotCommon.SerializedAllocationNode>}
     */
    allocationTracesTops: function()
    {
        return this._allocationProfile.serializeTraceTops();
    },

    /**
     * @param {number} nodeId
     * @return {!WebInspector.HeapSnapshotCommon.AllocationNodeCallers}
     */
    allocationNodeCallers: function(nodeId)
    {
        return this._allocationProfile.serializeCallers(nodeId);
    },

    /**
     * @param {number} nodeIndex
     * @return {?Array.<!WebInspector.HeapSnapshotCommon.AllocationStackFrame>}
     */
    allocationStack: function(nodeIndex)
    {
        var node = this.createNode(nodeIndex);
        var allocationNodeId = node.traceNodeId();
        if (!allocationNodeId)
            return null;
        return this._allocationProfile.serializeAllocationStack(allocationNodeId);
    },

    /**
     * @return {!Object.<string, !WebInspector.HeapSnapshotCommon.AggregateForDiff>}
     */
    aggregatesForDiff: function()
    {
        if (this._aggregatesForDiff)
            return this._aggregatesForDiff;

        var aggregatesByClassName = this.aggregates(true, "allObjects");
        this._aggregatesForDiff  = {};

        var node = this.createNode();
        for (var className in aggregatesByClassName) {
            var aggregate = aggregatesByClassName[className];
            var indexes = aggregate.idxs;
            var ids = new Array(indexes.length);
            var selfSizes = new Array(indexes.length);
            for (var i = 0; i < indexes.length; i++) {
                node.nodeIndex = indexes[i];
                ids[i] = node.id();
                selfSizes[i] = node.selfSize();
            }

            this._aggregatesForDiff[className] = {
                indexes: indexes,
                ids: ids,
                selfSizes: selfSizes
            };
        }
        return this._aggregatesForDiff;
    },

    /**
     * @protected
     * @param {!WebInspector.HeapSnapshotNode} node
     * @return {boolean}
     */
    isUserRoot: function(node)
    {
        return true;
    },

    /**
     * @param {function(!WebInspector.HeapSnapshotNode)} action
     * @param {boolean=} userRootsOnly
     */
    forEachRoot: function(action, userRootsOnly)
    {
        for (var iter = this.rootNode().edges(); iter.hasNext(); iter.next()) {
            var node = iter.edge.node();
            if (!userRootsOnly || this.isUserRoot(node))
                action(node);
        }
    },

    /**
     * @param {function(!WebInspector.HeapSnapshotNode,!WebInspector.HeapSnapshotEdge):boolean=} filter
     */
    calculateDistances: function(filter)
    {
        var nodeCount = this.nodeCount;
        var distances = this._nodeDistances;
        var noDistance = this._noDistance;
        for (var i = 0; i < nodeCount; ++i)
            distances[i] = noDistance;

        var nodesToVisit = new Uint32Array(this.nodeCount);
        var nodesToVisitLength = 0;

        /**
         * @param {number} distance
         * @param {!WebInspector.HeapSnapshotNode} node
         */
        function enqueueNode(distance, node)
        {
            var ordinal = node.ordinal();
            if (distances[ordinal] !== noDistance)
                return;
            distances[ordinal] = distance;
            nodesToVisit[nodesToVisitLength++] = node.nodeIndex;
        }

        this.forEachRoot(enqueueNode.bind(null, 1), true);
        this._bfs(nodesToVisit, nodesToVisitLength, distances, filter);

        // bfs for the rest of objects
        nodesToVisitLength = 0;
        this.forEachRoot(enqueueNode.bind(null, WebInspector.HeapSnapshotCommon.baseSystemDistance), false);
        this._bfs(nodesToVisit, nodesToVisitLength, distances, filter);
    },

    /**
     * @param {!Uint32Array} nodesToVisit
     * @param {number} nodesToVisitLength
     * @param {!Int32Array} distances
     * @param {function(!WebInspector.HeapSnapshotNode,!WebInspector.HeapSnapshotEdge):boolean=} filter
     */
    _bfs: function(nodesToVisit, nodesToVisitLength, distances, filter)
    {
        // Preload fields into local variables for better performance.
        var edgeFieldsCount = this._edgeFieldsCount;
        var nodeFieldCount = this._nodeFieldCount;
        var containmentEdges = this.containmentEdges;
        var firstEdgeIndexes = this._firstEdgeIndexes;
        var edgeToNodeOffset = this._edgeToNodeOffset;
        var edgeTypeOffset = this._edgeTypeOffset;
        var nodeCount = this.nodeCount;
        var edgeWeakType = this._edgeWeakType;
        var noDistance = this._noDistance;

        var index = 0;
        var edge = this.createEdge(0);
        var node = this.createNode(0);
        while (index < nodesToVisitLength) {
            var nodeIndex = nodesToVisit[index++]; // shift generates too much garbage.
            var nodeOrdinal = nodeIndex / nodeFieldCount;
            var distance = distances[nodeOrdinal] + 1;
            var firstEdgeIndex = firstEdgeIndexes[nodeOrdinal];
            var edgesEnd = firstEdgeIndexes[nodeOrdinal + 1];
            node.nodeIndex = nodeIndex;
            for (var edgeIndex = firstEdgeIndex; edgeIndex < edgesEnd; edgeIndex += edgeFieldsCount) {
                var edgeType = containmentEdges[edgeIndex + edgeTypeOffset];
                if (edgeType === edgeWeakType)
                    continue;
                var childNodeIndex = containmentEdges[edgeIndex + edgeToNodeOffset];
                var childNodeOrdinal = childNodeIndex / nodeFieldCount;
                if (distances[childNodeOrdinal] !== noDistance)
                    continue;
                edge.edgeIndex = edgeIndex;
                if (filter && !filter(node, edge))
                    continue;
                distances[childNodeOrdinal] = distance;
                nodesToVisit[nodesToVisitLength++] = childNodeIndex;
            }
        }
        if (nodesToVisitLength > nodeCount)
            throw new Error("BFS failed. Nodes to visit (" + nodesToVisitLength + ") is more than nodes count (" + nodeCount + ")");
    },

    _buildAggregates: function(filter)
    {
        var aggregates = {};
        var aggregatesByClassName = {};
        var classIndexes = [];
        var nodes = this.nodes;
        var mapAndFlag = this.userObjectsMapAndFlag();
        var flags = mapAndFlag ? mapAndFlag.map : null;
        var flag = mapAndFlag ? mapAndFlag.flag : 0;
        var nodesLength = nodes.length;
        var nodeNativeType = this._nodeNativeType;
        var nodeFieldCount = this._nodeFieldCount;
        var selfSizeOffset = this._nodeSelfSizeOffset;
        var nodeTypeOffset = this._nodeTypeOffset;
        var node = this.rootNode();
        var nodeDistances = this._nodeDistances;

        for (var nodeIndex = 0; nodeIndex < nodesLength; nodeIndex += nodeFieldCount) {
            var nodeOrdinal = nodeIndex / nodeFieldCount;
            if (flags && !(flags[nodeOrdinal] & flag))
                continue;
            node.nodeIndex = nodeIndex;
            if (filter && !filter(node))
                continue;
            var selfSize = nodes[nodeIndex + selfSizeOffset];
            if (!selfSize && nodes[nodeIndex + nodeTypeOffset] !== nodeNativeType)
                continue;
            var classIndex = node.classIndex();
            if (!(classIndex in aggregates)) {
                var nodeType = node.type();
                var nameMatters = nodeType === "object" || nodeType === "native";
                var value = {
                    count: 1,
                    distance: nodeDistances[nodeOrdinal],
                    self: selfSize,
                    maxRet: 0,
                    type: nodeType,
                    name: nameMatters ? node.name() : null,
                    idxs: [nodeIndex]
                };
                aggregates[classIndex] = value;
                classIndexes.push(classIndex);
                aggregatesByClassName[node.className()] = value;
            } else {
                var clss = aggregates[classIndex];
                clss.distance = Math.min(clss.distance, nodeDistances[nodeOrdinal]);
                ++clss.count;
                clss.self += selfSize;
                clss.idxs.push(nodeIndex);
            }
        }

        // Shave off provisionally allocated space.
        for (var i = 0, l = classIndexes.length; i < l; ++i) {
            var classIndex = classIndexes[i];
            aggregates[classIndex].idxs = aggregates[classIndex].idxs.slice();
        }
        return {aggregatesByClassName: aggregatesByClassName, aggregatesByClassIndex: aggregates};
    },

    _calculateClassesRetainedSize: function(aggregates, filter)
    {
        var rootNodeIndex = this._rootNodeIndex;
        var node = this.createNode(rootNodeIndex);
        var list = [rootNodeIndex];
        var sizes = [-1];
        var classes = [];
        var seenClassNameIndexes = {};
        var nodeFieldCount = this._nodeFieldCount;
        var nodeTypeOffset = this._nodeTypeOffset;
        var nodeNativeType = this._nodeNativeType;
        var dominatedNodes = this._dominatedNodes;
        var nodes = this.nodes;
        var mapAndFlag = this.userObjectsMapAndFlag();
        var flags = mapAndFlag ? mapAndFlag.map : null;
        var flag = mapAndFlag ? mapAndFlag.flag : 0;
        var firstDominatedNodeIndex = this._firstDominatedNodeIndex;

        while (list.length) {
            var nodeIndex = list.pop();
            node.nodeIndex = nodeIndex;
            var classIndex = node.classIndex();
            var seen = !!seenClassNameIndexes[classIndex];
            var nodeOrdinal = nodeIndex / nodeFieldCount;
            var dominatedIndexFrom = firstDominatedNodeIndex[nodeOrdinal];
            var dominatedIndexTo = firstDominatedNodeIndex[nodeOrdinal + 1];

            if (!seen &&
                (!flags || (flags[nodeOrdinal] & flag)) &&
                (!filter || filter(node)) &&
                (node.selfSize() || nodes[nodeIndex + nodeTypeOffset] === nodeNativeType)
               ) {
                aggregates[classIndex].maxRet += node.retainedSize();
                if (dominatedIndexFrom !== dominatedIndexTo) {
                    seenClassNameIndexes[classIndex] = true;
                    sizes.push(list.length);
                    classes.push(classIndex);
                }
            }
            for (var i = dominatedIndexFrom; i < dominatedIndexTo; i++)
                list.push(dominatedNodes[i]);

            var l = list.length;
            while (sizes[sizes.length - 1] === l) {
                sizes.pop();
                classIndex = classes.pop();
                seenClassNameIndexes[classIndex] = false;
            }
        }
    },

    _sortAggregateIndexes: function(aggregates)
    {
        var nodeA = this.createNode();
        var nodeB = this.createNode();
        for (var clss in aggregates)
            aggregates[clss].idxs.sort(
                function(idxA, idxB) {
                    nodeA.nodeIndex = idxA;
                    nodeB.nodeIndex = idxB;
                    return nodeA.id() < nodeB.id() ? -1 : 1;
                });
    },

    _buildPostOrderIndex: function()
    {
        var nodeFieldCount = this._nodeFieldCount;
        var nodeCount = this.nodeCount;
        var rootNodeOrdinal = this._rootNodeIndex / nodeFieldCount;

        var edgeFieldsCount = this._edgeFieldsCount;
        var edgeTypeOffset = this._edgeTypeOffset;
        var edgeToNodeOffset = this._edgeToNodeOffset;
        var edgeShortcutType = this._edgeShortcutType;
        var edgeWeakType = this._edgeWeakType;
        var firstEdgeIndexes = this._firstEdgeIndexes;
        var containmentEdges = this.containmentEdges;

        var mapAndFlag = this.userObjectsMapAndFlag();
        var flags = mapAndFlag ? mapAndFlag.map : null;
        var flag = mapAndFlag ? mapAndFlag.flag : 0;

        var stackNodes = new Uint32Array(nodeCount);
        var stackCurrentEdge = new Uint32Array(nodeCount);
        var postOrderIndex2NodeOrdinal = new Uint32Array(nodeCount);
        var nodeOrdinal2PostOrderIndex = new Uint32Array(nodeCount);
        var visited = new Uint8Array(nodeCount);
        var postOrderIndex = 0;

        var stackTop = 0;
        stackNodes[0] = rootNodeOrdinal;
        stackCurrentEdge[0] = firstEdgeIndexes[rootNodeOrdinal];
        visited[rootNodeOrdinal] = 1;

        var iteration = 0;
        while (true) {
            ++iteration;
            while (stackTop >= 0) {
                var nodeOrdinal = stackNodes[stackTop];
                var edgeIndex = stackCurrentEdge[stackTop];
                var edgesEnd = firstEdgeIndexes[nodeOrdinal + 1];

                if (edgeIndex < edgesEnd) {
                    stackCurrentEdge[stackTop] += edgeFieldsCount;
                    var edgeType = containmentEdges[edgeIndex + edgeTypeOffset];
                    if (edgeType === edgeWeakType || edgeType === edgeShortcutType)
                        continue;
                    var childNodeIndex = containmentEdges[edgeIndex + edgeToNodeOffset];
                    var childNodeOrdinal = childNodeIndex / nodeFieldCount;
                    if (visited[childNodeOrdinal])
                        continue;
                    var nodeFlag = !flags || (flags[nodeOrdinal] & flag);
                    var childNodeFlag = !flags || (flags[childNodeOrdinal] & flag);
                    // We are skipping the edges from non-page-owned nodes to page-owned nodes.
                    // Otherwise the dominators for the objects that also were retained by debugger would be affected.
                    if (nodeOrdinal !== rootNodeOrdinal && childNodeFlag && !nodeFlag)
                        continue;
                    ++stackTop;
                    stackNodes[stackTop] = childNodeOrdinal;
                    stackCurrentEdge[stackTop] = firstEdgeIndexes[childNodeOrdinal];
                    visited[childNodeOrdinal] = 1;
                } else {
                    // Done with all the node children
                    nodeOrdinal2PostOrderIndex[nodeOrdinal] = postOrderIndex;
                    postOrderIndex2NodeOrdinal[postOrderIndex++] = nodeOrdinal;
                    --stackTop;
                }
            }

            if (postOrderIndex === nodeCount || iteration > 1)
                break;
            var errors = new WebInspector.HeapSnapshotProblemReport("Heap snapshot: " + (nodeCount - postOrderIndex) + " nodes are unreachable from the root. Following nodes have only weak retainers:");
            var dumpNode = this.rootNode();
            // Remove root from the result (last node in the array) and put it at the bottom of the stack so that it is
            // visited after all orphan nodes and their subgraphs.
            --postOrderIndex;
            stackTop = 0;
            stackNodes[0] = rootNodeOrdinal;
            stackCurrentEdge[0] = firstEdgeIndexes[rootNodeOrdinal + 1]; // no need to reiterate its edges
            for (var i = 0; i < nodeCount; ++i) {
                if (!visited[i]) {
                    dumpNode.nodeIndex = i * nodeFieldCount;
                    // Add all nodes that have only weak retainers to traverse their subgraphs.
                    if (this._hasOnlyWeakRetainers(i)) {
                        stackNodes[++stackTop] = i;
                        stackCurrentEdge[stackTop] = firstEdgeIndexes[i];
                        visited[i] = 1;
                        errors.addError(dumpNode.name() + " @" + dumpNode.id());
                    }
                }
            }
            console.warn(errors.toString());
        }

        // If we already processed all orphan nodes that have only weak retainers and still have some orphans...
        if (postOrderIndex !== nodeCount) {
            var errors = new WebInspector.HeapSnapshotProblemReport("Still found " + (nodeCount - postOrderIndex) + " unreachable nodes in heap snapshot:");
            var dumpNode = this.rootNode();
            // Remove root from the result (last node in the array) and put it at the bottom of the stack so that it is
            // visited after all orphan nodes and their subgraphs.
            --postOrderIndex;
            for (var i = 0; i < nodeCount; ++i) {
                if (visited[i])
                    continue;
                dumpNode.nodeIndex = i * nodeFieldCount;
                errors.addError(dumpNode.name() + " @" + dumpNode.id());
                // Fix it by giving the node a postorder index anyway.
                nodeOrdinal2PostOrderIndex[i] = postOrderIndex;
                postOrderIndex2NodeOrdinal[postOrderIndex++] = i;
            }
            nodeOrdinal2PostOrderIndex[rootNodeOrdinal] = postOrderIndex;
            postOrderIndex2NodeOrdinal[postOrderIndex++] = rootNodeOrdinal;
            console.warn(errors.toString());
        }

        return {postOrderIndex2NodeOrdinal: postOrderIndex2NodeOrdinal, nodeOrdinal2PostOrderIndex: nodeOrdinal2PostOrderIndex};
    },

    /**
     * @param {number} nodeOrdinal
     * @return {boolean}
     */
    _hasOnlyWeakRetainers: function(nodeOrdinal)
    {
        var edgeTypeOffset = this._edgeTypeOffset;
        var edgeWeakType = this._edgeWeakType;
        var edgeShortcutType = this._edgeShortcutType;
        var containmentEdges = this.containmentEdges;
        var retainingEdges = this._retainingEdges;
        var beginRetainerIndex = this._firstRetainerIndex[nodeOrdinal];
        var endRetainerIndex = this._firstRetainerIndex[nodeOrdinal + 1];
        for (var retainerIndex = beginRetainerIndex; retainerIndex < endRetainerIndex; ++retainerIndex) {
            var retainerEdgeIndex = retainingEdges[retainerIndex];
            var retainerEdgeType = containmentEdges[retainerEdgeIndex + edgeTypeOffset];
            if (retainerEdgeType !== edgeWeakType && retainerEdgeType !== edgeShortcutType)
                return false;
        }
        return true;
    },

    // The algorithm is based on the article:
    // K. Cooper, T. Harvey and K. Kennedy "A Simple, Fast Dominance Algorithm"
    // Softw. Pract. Exper. 4 (2001), pp. 1-10.
    /**
     * @param {!Array.<number>} postOrderIndex2NodeOrdinal
     * @param {!Array.<number>} nodeOrdinal2PostOrderIndex
     */
    _buildDominatorTree: function(postOrderIndex2NodeOrdinal, nodeOrdinal2PostOrderIndex)
    {
        var nodeFieldCount = this._nodeFieldCount;
        var firstRetainerIndex = this._firstRetainerIndex;
        var retainingNodes = this._retainingNodes;
        var retainingEdges = this._retainingEdges;
        var edgeFieldsCount = this._edgeFieldsCount;
        var edgeTypeOffset = this._edgeTypeOffset;
        var edgeToNodeOffset = this._edgeToNodeOffset;
        var edgeShortcutType = this._edgeShortcutType;
        var edgeWeakType = this._edgeWeakType;
        var firstEdgeIndexes = this._firstEdgeIndexes;
        var containmentEdges = this.containmentEdges;
        var rootNodeIndex = this._rootNodeIndex;

        var mapAndFlag = this.userObjectsMapAndFlag();
        var flags = mapAndFlag ? mapAndFlag.map : null;
        var flag = mapAndFlag ? mapAndFlag.flag : 0;

        var nodesCount = postOrderIndex2NodeOrdinal.length;
        var rootPostOrderedIndex = nodesCount - 1;
        var noEntry = nodesCount;
        var dominators = new Uint32Array(nodesCount);
        for (var i = 0; i < rootPostOrderedIndex; ++i)
            dominators[i] = noEntry;
        dominators[rootPostOrderedIndex] = rootPostOrderedIndex;

        // The affected array is used to mark entries which dominators
        // have to be racalculated because of changes in their retainers.
        var affected = new Uint8Array(nodesCount);
        var nodeOrdinal;

        { // Mark the root direct children as affected.
            nodeOrdinal = this._rootNodeIndex / nodeFieldCount;
            var endEdgeIndex = firstEdgeIndexes[nodeOrdinal + 1];
            for (var edgeIndex = firstEdgeIndexes[nodeOrdinal];
                 edgeIndex < endEdgeIndex;
                 edgeIndex += edgeFieldsCount) {
                var edgeType = containmentEdges[edgeIndex + edgeTypeOffset];
                if (edgeType === edgeWeakType || edgeType === edgeShortcutType)
                    continue;
                var childNodeOrdinal = containmentEdges[edgeIndex + edgeToNodeOffset] / nodeFieldCount;
                affected[nodeOrdinal2PostOrderIndex[childNodeOrdinal]] = 1;
            }
        }

        var changed = true;
        while (changed) {
            changed = false;
            for (var postOrderIndex = rootPostOrderedIndex - 1; postOrderIndex >= 0; --postOrderIndex) {
                if (affected[postOrderIndex] === 0)
                    continue;
                affected[postOrderIndex] = 0;
                // If dominator of the entry has already been set to root,
                // then it can't propagate any further.
                if (dominators[postOrderIndex] === rootPostOrderedIndex)
                    continue;
                nodeOrdinal = postOrderIndex2NodeOrdinal[postOrderIndex];
                var nodeFlag = !flags || (flags[nodeOrdinal] & flag);
                var newDominatorIndex = noEntry;
                var beginRetainerIndex = firstRetainerIndex[nodeOrdinal];
                var endRetainerIndex = firstRetainerIndex[nodeOrdinal + 1];
                var orphanNode = true;
                for (var retainerIndex = beginRetainerIndex; retainerIndex < endRetainerIndex; ++retainerIndex) {
                    var retainerEdgeIndex = retainingEdges[retainerIndex];
                    var retainerEdgeType = containmentEdges[retainerEdgeIndex + edgeTypeOffset];
                    if (retainerEdgeType === edgeWeakType || retainerEdgeType === edgeShortcutType)
                        continue;
                    orphanNode = false;
                    var retainerNodeIndex = retainingNodes[retainerIndex];
                    var retainerNodeOrdinal = retainerNodeIndex / nodeFieldCount;
                    var retainerNodeFlag = !flags || (flags[retainerNodeOrdinal] & flag);
                    // We are skipping the edges from non-page-owned nodes to page-owned nodes.
                    // Otherwise the dominators for the objects that also were retained by debugger would be affected.
                    if (retainerNodeIndex !== rootNodeIndex && nodeFlag && !retainerNodeFlag)
                        continue;
                    var retanerPostOrderIndex = nodeOrdinal2PostOrderIndex[retainerNodeOrdinal];
                    if (dominators[retanerPostOrderIndex] !== noEntry) {
                        if (newDominatorIndex === noEntry)
                            newDominatorIndex = retanerPostOrderIndex;
                        else {
                            while (retanerPostOrderIndex !== newDominatorIndex) {
                                while (retanerPostOrderIndex < newDominatorIndex)
                                    retanerPostOrderIndex = dominators[retanerPostOrderIndex];
                                while (newDominatorIndex < retanerPostOrderIndex)
                                    newDominatorIndex = dominators[newDominatorIndex];
                            }
                        }
                        // If idom has already reached the root, it doesn't make sense
                        // to check other retainers.
                        if (newDominatorIndex === rootPostOrderedIndex)
                            break;
                    }
                }
                // Make root dominator of orphans.
                if (orphanNode)
                    newDominatorIndex = rootPostOrderedIndex;
                if (newDominatorIndex !== noEntry && dominators[postOrderIndex] !== newDominatorIndex) {
                    dominators[postOrderIndex] = newDominatorIndex;
                    changed = true;
                    nodeOrdinal = postOrderIndex2NodeOrdinal[postOrderIndex];
                    var beginEdgeToNodeFieldIndex = firstEdgeIndexes[nodeOrdinal] + edgeToNodeOffset;
                    var endEdgeToNodeFieldIndex = firstEdgeIndexes[nodeOrdinal + 1];
                    for (var toNodeFieldIndex = beginEdgeToNodeFieldIndex;
                         toNodeFieldIndex < endEdgeToNodeFieldIndex;
                         toNodeFieldIndex += edgeFieldsCount) {
                        var childNodeOrdinal = containmentEdges[toNodeFieldIndex] / nodeFieldCount;
                        affected[nodeOrdinal2PostOrderIndex[childNodeOrdinal]] = 1;
                    }
                }
            }
        }

        var dominatorsTree = new Uint32Array(nodesCount);
        for (var postOrderIndex = 0, l = dominators.length; postOrderIndex < l; ++postOrderIndex) {
            nodeOrdinal = postOrderIndex2NodeOrdinal[postOrderIndex];
            dominatorsTree[nodeOrdinal] = postOrderIndex2NodeOrdinal[dominators[postOrderIndex]];
        }
        return dominatorsTree;
    },

    _calculateRetainedSizes: function(postOrderIndex2NodeOrdinal)
    {
        var nodeCount = this.nodeCount;
        var nodes = this.nodes;
        var nodeSelfSizeOffset = this._nodeSelfSizeOffset;
        var nodeFieldCount = this._nodeFieldCount;
        var dominatorsTree = this._dominatorsTree;
        var retainedSizes = this._retainedSizes;

        for (var nodeOrdinal = 0; nodeOrdinal < nodeCount; ++nodeOrdinal)
            retainedSizes[nodeOrdinal] = nodes[nodeOrdinal * nodeFieldCount + nodeSelfSizeOffset];

        // Propagate retained sizes for each node excluding root.
        for (var postOrderIndex = 0; postOrderIndex < nodeCount - 1; ++postOrderIndex) {
            var nodeOrdinal = postOrderIndex2NodeOrdinal[postOrderIndex];
            var dominatorOrdinal = dominatorsTree[nodeOrdinal];
            retainedSizes[dominatorOrdinal] += retainedSizes[nodeOrdinal];
        }
    },

    _buildDominatedNodes: function()
    {
        // Builds up two arrays:
        //  - "dominatedNodes" is a continuous array, where each node owns an
        //    interval (can be empty) with corresponding dominated nodes.
        //  - "indexArray" is an array of indexes in the "dominatedNodes"
        //    with the same positions as in the _nodeIndex.
        var indexArray = this._firstDominatedNodeIndex;
        // All nodes except the root have dominators.
        var dominatedNodes = this._dominatedNodes;

        // Count the number of dominated nodes for each node. Skip the root (node at
        // index 0) as it is the only node that dominates itself.
        var nodeFieldCount = this._nodeFieldCount;
        var dominatorsTree = this._dominatorsTree;

        var fromNodeOrdinal = 0;
        var toNodeOrdinal = this.nodeCount;
        var rootNodeOrdinal = this._rootNodeIndex / nodeFieldCount;
        if (rootNodeOrdinal === fromNodeOrdinal)
            fromNodeOrdinal = 1;
        else if (rootNodeOrdinal === toNodeOrdinal - 1)
            toNodeOrdinal = toNodeOrdinal - 1;
        else
            throw new Error("Root node is expected to be either first or last");
        for (var nodeOrdinal = fromNodeOrdinal; nodeOrdinal < toNodeOrdinal; ++nodeOrdinal)
            ++indexArray[dominatorsTree[nodeOrdinal]];
        // Put in the first slot of each dominatedNodes slice the count of entries
        // that will be filled.
        var firstDominatedNodeIndex = 0;
        for (var i = 0, l = this.nodeCount; i < l; ++i) {
            var dominatedCount = dominatedNodes[firstDominatedNodeIndex] = indexArray[i];
            indexArray[i] = firstDominatedNodeIndex;
            firstDominatedNodeIndex += dominatedCount;
        }
        indexArray[this.nodeCount] = dominatedNodes.length;
        // Fill up the dominatedNodes array with indexes of dominated nodes. Skip the root (node at
        // index 0) as it is the only node that dominates itself.
        for (var nodeOrdinal = fromNodeOrdinal; nodeOrdinal < toNodeOrdinal; ++nodeOrdinal) {
            var dominatorOrdinal = dominatorsTree[nodeOrdinal];
            var dominatedRefIndex = indexArray[dominatorOrdinal];
            dominatedRefIndex += (--dominatedNodes[dominatedRefIndex]);
            dominatedNodes[dominatedRefIndex] = nodeOrdinal * nodeFieldCount;
        }
    },

    _buildSamples: function()
    {
        var samples = this._rawSamples;
        if (!samples || !samples.length)
            return;
        var sampleCount = samples.length / 2;
        var sizeForRange = new Array(sampleCount);
        var timestamps = new Array(sampleCount);
        var lastAssignedIds = new Array(sampleCount);

        var timestampOffset = this._metaNode.sample_fields.indexOf("timestamp_us");
        var lastAssignedIdOffset = this._metaNode.sample_fields.indexOf("last_assigned_id");
        for (var i = 0; i < sampleCount; i++) {
            sizeForRange[i] = 0;
            timestamps[i] = (samples[2 * i + timestampOffset]) / 1000;
            lastAssignedIds[i] = samples[2 * i + lastAssignedIdOffset];
        }

        var nodes = this.nodes;
        var nodesLength = nodes.length;
        var nodeFieldCount = this._nodeFieldCount;
        var node = this.rootNode();
        for (var nodeIndex = 0; nodeIndex < nodesLength; nodeIndex += nodeFieldCount) {
            node.nodeIndex = nodeIndex;

            var nodeId = node.id();
            // JS objects have odd ids, skip native objects.
            if (nodeId % 2 === 0)
                continue;
            var rangeIndex = lastAssignedIds.lowerBound(nodeId);
            if (rangeIndex === sampleCount) {
                // TODO: make heap profiler not allocate while taking snapshot
                continue;
            }
            sizeForRange[rangeIndex] += node.selfSize();
        }
        this._samples = new WebInspector.HeapSnapshotCommon.Samples(timestamps, lastAssignedIds, sizeForRange);
    },

    /**
     * @return {?WebInspector.HeapSnapshotCommon.Samples}
     */
    getSamples: function()
    {
        return this._samples;
    },

    _calculateFlags: function()
    {
        throw new Error("Not implemented");
    },

    _calculateStatistics: function()
    {
        throw new Error("Not implemented");
    },

    userObjectsMapAndFlag: function()
    {
        throw new Error("Not implemented");
    },

    /**
     * @param {string} baseSnapshotId
     * @param {!Object.<string, !WebInspector.HeapSnapshotCommon.AggregateForDiff>} baseSnapshotAggregates
     * @return {!Object.<string, !WebInspector.HeapSnapshotCommon.Diff>}
     */
    calculateSnapshotDiff: function(baseSnapshotId, baseSnapshotAggregates)
    {
        var snapshotDiff = this._snapshotDiffs[baseSnapshotId];
        if (snapshotDiff)
            return snapshotDiff;
        snapshotDiff = {};

        var aggregates = this.aggregates(true, "allObjects");
        for (var className in baseSnapshotAggregates) {
            var baseAggregate = baseSnapshotAggregates[className];
            var diff = this._calculateDiffForClass(baseAggregate, aggregates[className]);
            if (diff)
                snapshotDiff[className] = diff;
        }
        var emptyBaseAggregate = new WebInspector.HeapSnapshotCommon.AggregateForDiff();
        for (var className in aggregates) {
            if (className in baseSnapshotAggregates)
                continue;
            snapshotDiff[className] = this._calculateDiffForClass(emptyBaseAggregate, aggregates[className]);
        }

        this._snapshotDiffs[baseSnapshotId] = snapshotDiff;
        return snapshotDiff;
    },

    /**
     * @param {!WebInspector.HeapSnapshotCommon.AggregateForDiff} baseAggregate
     * @param {!WebInspector.HeapSnapshotCommon.Aggregate} aggregate
     * @return {?WebInspector.HeapSnapshotCommon.Diff}
     */
    _calculateDiffForClass: function(baseAggregate, aggregate)
    {
        var baseIds = baseAggregate.ids;
        var baseIndexes = baseAggregate.indexes;
        var baseSelfSizes = baseAggregate.selfSizes;

        var indexes = aggregate ? aggregate.idxs : [];

        var i = 0, l = baseIds.length;
        var j = 0, m = indexes.length;
        var diff = new WebInspector.HeapSnapshotCommon.Diff();

        var nodeB = this.createNode(indexes[j]);
        while (i < l && j < m) {
            var nodeAId = baseIds[i];
            if (nodeAId < nodeB.id()) {
                diff.deletedIndexes.push(baseIndexes[i]);
                diff.removedCount++;
                diff.removedSize += baseSelfSizes[i];
                ++i;
            } else if (nodeAId > nodeB.id()) { // Native nodes(e.g. dom groups) may have ids less than max JS object id in the base snapshot
                diff.addedIndexes.push(indexes[j]);
                diff.addedCount++;
                diff.addedSize += nodeB.selfSize();
                nodeB.nodeIndex = indexes[++j];
            } else { // nodeAId === nodeB.id()
                ++i;
                nodeB.nodeIndex = indexes[++j];
            }
        }
        while (i < l) {
            diff.deletedIndexes.push(baseIndexes[i]);
            diff.removedCount++;
            diff.removedSize += baseSelfSizes[i];
            ++i;
        }
        while (j < m) {
            diff.addedIndexes.push(indexes[j]);
            diff.addedCount++;
            diff.addedSize += nodeB.selfSize();
            nodeB.nodeIndex = indexes[++j];
        }
        diff.countDelta = diff.addedCount - diff.removedCount;
        diff.sizeDelta = diff.addedSize - diff.removedSize;
        if (!diff.addedCount && !diff.removedCount)
            return null;
        return diff;
    },

    _nodeForSnapshotObjectId: function(snapshotObjectId)
    {
        for (var it = this._allNodes(); it.hasNext(); it.next()) {
            if (it.node.id() === snapshotObjectId)
                return it.node;
        }
        return null;
    },

    /**
     * @param {string} snapshotObjectId
     * @return {?string}
     */
    nodeClassName: function(snapshotObjectId)
    {
        var node = this._nodeForSnapshotObjectId(snapshotObjectId);
        if (node)
            return node.className();
        return null;
    },

    /**
     * @param {string} name
     * @return {!Array.<number>}
     */
    idsOfObjectsWithName: function(name)
    {
        var ids = [];
        for (var it = this._allNodes(); it.hasNext(); it.next()) {
            if (it.item().name() === name)
                ids.push(it.item().id());
        }
        return ids;
    },

    /**
     * @param {number} nodeIndex
     * @return {!WebInspector.HeapSnapshotEdgesProvider}
     */
    createEdgesProvider: function(nodeIndex)
    {
        var node = this.createNode(nodeIndex);
        var filter = this.containmentEdgesFilter();
        var indexProvider = new WebInspector.HeapSnapshotEdgeIndexProvider(this);
        return new WebInspector.HeapSnapshotEdgesProvider(this, filter, node.edges(), indexProvider);
    },

    /**
     * @param {number} nodeIndex
     * @param {?function(!WebInspector.HeapSnapshotEdge):boolean} filter
     * @return {!WebInspector.HeapSnapshotEdgesProvider}
     */
    createEdgesProviderForTest: function(nodeIndex, filter)
    {
        var node = this.createNode(nodeIndex);
        var indexProvider = new WebInspector.HeapSnapshotEdgeIndexProvider(this);
        return new WebInspector.HeapSnapshotEdgesProvider(this, filter, node.edges(), indexProvider);
    },

    /**
     * @return {?function(!WebInspector.HeapSnapshotEdge):boolean}
     */
    retainingEdgesFilter: function()
    {
        return null;
    },

    /**
     * @return {?function(!WebInspector.HeapSnapshotEdge):boolean}
     */
    containmentEdgesFilter: function()
    {
        return null;
    },

    /**
     * @param {number} nodeIndex
     * @return {!WebInspector.HeapSnapshotEdgesProvider}
     */
    createRetainingEdgesProvider: function(nodeIndex)
    {
        var node = this.createNode(nodeIndex);
        var filter = this.retainingEdgesFilter();
        var indexProvider = new WebInspector.HeapSnapshotRetainerEdgeIndexProvider(this);
        return new WebInspector.HeapSnapshotEdgesProvider(this, filter, node.retainers(), indexProvider);
    },

    /**
     * @param {string} baseSnapshotId
     * @param {string} className
     * @return {!WebInspector.HeapSnapshotNodesProvider}
     */
    createAddedNodesProvider: function(baseSnapshotId, className)
    {
        var snapshotDiff = this._snapshotDiffs[baseSnapshotId];
        var diffForClass = snapshotDiff[className];
        return new WebInspector.HeapSnapshotNodesProvider(this, null, diffForClass.addedIndexes);
    },

    /**
     * @param {!Array.<number>} nodeIndexes
     * @return {!WebInspector.HeapSnapshotNodesProvider}
     */
    createDeletedNodesProvider: function(nodeIndexes)
    {
        return new WebInspector.HeapSnapshotNodesProvider(this, null, nodeIndexes);
    },

    /**
     * @return {?function(!WebInspector.HeapSnapshotNode):boolean}
     */
    classNodesFilter: function()
    {
        return null;
    },

    /**
     * @param {string} className
     * @param {!WebInspector.HeapSnapshotCommon.NodeFilter} nodeFilter
     * @return {!WebInspector.HeapSnapshotNodesProvider}
     */
    createNodesProviderForClass: function(className, nodeFilter)
    {
        return new WebInspector.HeapSnapshotNodesProvider(this, this.classNodesFilter(), this.aggregatesWithFilter(nodeFilter)[className].idxs);
    },

    /**
     * @return {number}
     */
    _maxJsNodeId: function()
    {
        var nodeFieldCount = this._nodeFieldCount;
        var nodes = this.nodes;
        var nodesLength = nodes.length;
        var id = 0;
        for (var nodeIndex = this._nodeIdOffset; nodeIndex < nodesLength; nodeIndex += nodeFieldCount) {
            var nextId = nodes[nodeIndex];
            // JS objects have odd ids, skip native objects.
            if (nextId % 2 === 0)
                continue;
            if (id < nextId)
                id = nextId;
        }
        return id;
    },

    /**
     * @return {!WebInspector.HeapSnapshotCommon.StaticData}
     */
    updateStaticData: function()
    {
        return new WebInspector.HeapSnapshotCommon.StaticData(this.nodeCount, this._rootNodeIndex, this.totalSize, this._maxJsNodeId());
    }
};

/**
 * @constructor
 * @param {!WebInspector.HeapSnapshotItemIterator} iterator
 * @param {!WebInspector.HeapSnapshotItemIndexProvider} indexProvider
 */
WebInspector.HeapSnapshotItemProvider = function(iterator, indexProvider)
{
    this._iterator = iterator;
    this._indexProvider = indexProvider;
    this._isEmpty = !iterator.hasNext();
    /** @type {?Array.<number>} */
    this._iterationOrder = null;
    this._currentComparator = null;
    this._sortedPrefixLength = 0;
    this._sortedSuffixLength = 0;
}

WebInspector.HeapSnapshotItemProvider.prototype = {
    _createIterationOrder: function()
    {
        if (this._iterationOrder)
            return;
        this._iterationOrder = [];
        for (var iterator = this._iterator; iterator.hasNext(); iterator.next())
            this._iterationOrder.push(iterator.item().itemIndex());
    },

    /**
     * @return {boolean}
     */
    isEmpty: function()
    {
        return this._isEmpty;
    },

    /**
     * @param {number} begin
     * @param {number} end
     * @return {!WebInspector.HeapSnapshotCommon.ItemsRange}
     */
    serializeItemsRange: function(begin, end)
    {
        this._createIterationOrder();
        if (begin > end)
            throw new Error("Start position > end position: " + begin + " > " + end);
        if (end > this._iterationOrder.length)
            end = this._iterationOrder.length;
        if (this._sortedPrefixLength < end && begin < this._iterationOrder.length - this._sortedSuffixLength) {
            this.sort(this._currentComparator, this._sortedPrefixLength, this._iterationOrder.length - 1 - this._sortedSuffixLength, begin, end - 1);
            if (begin <= this._sortedPrefixLength)
                this._sortedPrefixLength = end;
            if (end >= this._iterationOrder.length - this._sortedSuffixLength)
                this._sortedSuffixLength = this._iterationOrder.length - begin;
        }
        var position = begin;
        var count = end - begin;
        var result = new Array(count);
        for (var i = 0 ; i < count; ++i) {
            var itemIndex = this._iterationOrder[position++];
            var item = this._indexProvider.itemForIndex(itemIndex);
            result[i] = item.serialize();
        }
        return new WebInspector.HeapSnapshotCommon.ItemsRange(begin, end, this._iterationOrder.length, result);
    },

    sortAndRewind: function(comparator)
    {
        this._currentComparator = comparator;
        this._sortedPrefixLength = 0;
        this._sortedSuffixLength = 0;
    }
}

/**
 * @constructor
 * @extends {WebInspector.HeapSnapshotItemProvider}
 * @param {!WebInspector.HeapSnapshot} snapshot
 * @param {?function(!WebInspector.HeapSnapshotEdge):boolean} filter
 * @param {!WebInspector.HeapSnapshotEdgeIterator} edgesIter
 * @param {!WebInspector.HeapSnapshotItemIndexProvider} indexProvider
 */
WebInspector.HeapSnapshotEdgesProvider = function(snapshot, filter, edgesIter, indexProvider)
{
    this.snapshot = snapshot;
    var iter = filter ? new WebInspector.HeapSnapshotFilteredIterator(edgesIter, /** @type {function(!WebInspector.HeapSnapshotItem):boolean} */ (filter)) : edgesIter;
    WebInspector.HeapSnapshotItemProvider.call(this, iter, indexProvider);
}

WebInspector.HeapSnapshotEdgesProvider.prototype = {
    /**
     * @param {!WebInspector.HeapSnapshotCommon.ComparatorConfig} comparator
     * @param {number} leftBound
     * @param {number} rightBound
     * @param {number} windowLeft
     * @param {number} windowRight
     */
    sort: function(comparator, leftBound, rightBound, windowLeft, windowRight)
    {
        var fieldName1 = comparator.fieldName1;
        var fieldName2 = comparator.fieldName2;
        var ascending1 = comparator.ascending1;
        var ascending2 = comparator.ascending2;

        var edgeA = this._iterator.item().clone();
        var edgeB = edgeA.clone();
        var nodeA = this.snapshot.createNode();
        var nodeB = this.snapshot.createNode();

        function compareEdgeFieldName(ascending, indexA, indexB)
        {
            edgeA.edgeIndex = indexA;
            edgeB.edgeIndex = indexB;
            if (edgeB.name() === "__proto__") return -1;
            if (edgeA.name() === "__proto__") return 1;
            var result =
                edgeA.hasStringName() === edgeB.hasStringName() ?
                (edgeA.name() < edgeB.name() ? -1 : (edgeA.name() > edgeB.name() ? 1 : 0)) :
                (edgeA.hasStringName() ? -1 : 1);
            return ascending ? result : -result;
        }

        function compareNodeField(fieldName, ascending, indexA, indexB)
        {
            edgeA.edgeIndex = indexA;
            nodeA.nodeIndex = edgeA.nodeIndex();
            var valueA = nodeA[fieldName]();

            edgeB.edgeIndex = indexB;
            nodeB.nodeIndex = edgeB.nodeIndex();
            var valueB = nodeB[fieldName]();

            var result = valueA < valueB ? -1 : (valueA > valueB ? 1 : 0);
            return ascending ? result : -result;
        }

        function compareEdgeAndNode(indexA, indexB) {
            var result = compareEdgeFieldName(ascending1, indexA, indexB);
            if (result === 0)
                result = compareNodeField(fieldName2, ascending2, indexA, indexB);
            if (result === 0)
                return indexA - indexB;
            return result;
        }

        function compareNodeAndEdge(indexA, indexB) {
            var result = compareNodeField(fieldName1, ascending1, indexA, indexB);
            if (result === 0)
                result = compareEdgeFieldName(ascending2, indexA, indexB);
            if (result === 0)
                return indexA - indexB;
            return result;
        }

        function compareNodeAndNode(indexA, indexB) {
            var result = compareNodeField(fieldName1, ascending1, indexA, indexB);
            if (result === 0)
                result = compareNodeField(fieldName2, ascending2, indexA, indexB);
            if (result === 0)
                return indexA - indexB;
            return result;
        }

        if (fieldName1 === "!edgeName")
            this._iterationOrder.sortRange(compareEdgeAndNode, leftBound, rightBound, windowLeft, windowRight);
        else if (fieldName2 === "!edgeName")
            this._iterationOrder.sortRange(compareNodeAndEdge, leftBound, rightBound, windowLeft, windowRight);
        else
            this._iterationOrder.sortRange(compareNodeAndNode, leftBound, rightBound, windowLeft, windowRight);
    },

    __proto__: WebInspector.HeapSnapshotItemProvider.prototype
}


/**
 * @constructor
 * @extends {WebInspector.HeapSnapshotItemProvider}
 * @param {!WebInspector.HeapSnapshot} snapshot
 * @param {?function(!WebInspector.HeapSnapshotNode):boolean} filter
 * @param {(!Array.<number>|!Uint32Array)} nodeIndexes
 */
WebInspector.HeapSnapshotNodesProvider = function(snapshot, filter, nodeIndexes)
{
    this.snapshot = snapshot;
    var indexProvider = new WebInspector.HeapSnapshotNodeIndexProvider(snapshot);
    var it = new WebInspector.HeapSnapshotIndexRangeIterator(indexProvider, nodeIndexes);

    if (filter)
        it = new WebInspector.HeapSnapshotFilteredIterator(it, /** @type {function(!WebInspector.HeapSnapshotItem):boolean} */ (filter));
    WebInspector.HeapSnapshotItemProvider.call(this, it, indexProvider);
}

WebInspector.HeapSnapshotNodesProvider.prototype = {
    /**
     * @param {string} snapshotObjectId
     * @return {number}
     */
    nodePosition: function(snapshotObjectId)
    {
        this._createIterationOrder();
        var node = this.snapshot.createNode();
        for (var i = 0; i < this._iterationOrder.length; i++) {
            node.nodeIndex = this._iterationOrder[i];
            if (node.id() === snapshotObjectId)
                break;
        }
        if (i === this._iterationOrder.length)
            return -1;
        var targetNodeIndex = this._iterationOrder[i];
        var smallerCount = 0;
        var compare = this._buildCompareFunction(this._currentComparator);
        for (var i = 0; i < this._iterationOrder.length; i++) {
            if (compare(this._iterationOrder[i], targetNodeIndex) < 0)
                ++smallerCount;
        }
        return smallerCount;
    },

    /**
     * @return {function(number,number):number}
     */
    _buildCompareFunction: function(comparator)
    {
        var nodeA = this.snapshot.createNode();
        var nodeB = this.snapshot.createNode();
        var fieldAccessor1 = nodeA[comparator.fieldName1];
        var fieldAccessor2 = nodeA[comparator.fieldName2];
        var ascending1 = comparator.ascending1 ? 1 : -1;
        var ascending2 = comparator.ascending2 ? 1 : -1;

        /**
         * @param {function():*} fieldAccessor
         * @param {number} ascending
         * @return {number}
         */
        function sortByNodeField(fieldAccessor, ascending)
        {
            var valueA = fieldAccessor.call(nodeA);
            var valueB = fieldAccessor.call(nodeB);
            return valueA < valueB ? -ascending : (valueA > valueB ? ascending : 0);
        }

        /**
         * @param {number} indexA
         * @param {number} indexB
         * @return {number}
         */
        function sortByComparator(indexA, indexB)
        {
            nodeA.nodeIndex = indexA;
            nodeB.nodeIndex = indexB;
            var result = sortByNodeField(fieldAccessor1, ascending1);
            if (result === 0)
                result = sortByNodeField(fieldAccessor2, ascending2);
            return result || indexA - indexB;
        }

        return sortByComparator;
    },

    /**
     * @param {!WebInspector.HeapSnapshotCommon.ComparatorConfig} comparator
     * @param {number} leftBound
     * @param {number} rightBound
     * @param {number} windowLeft
     * @param {number} windowRight
     */
    sort: function(comparator, leftBound, rightBound, windowLeft, windowRight)
    {
        this._iterationOrder.sortRange(this._buildCompareFunction(comparator), leftBound, rightBound, windowLeft, windowRight);
    },

    __proto__: WebInspector.HeapSnapshotItemProvider.prototype
}

