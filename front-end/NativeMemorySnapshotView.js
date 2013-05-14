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
 * @extends {WebInspector.View}
 * @param {WebInspector.NativeMemoryProfileHeader} profile
 */
WebInspector.NativeMemorySnapshotView = function(profile)
{
    WebInspector.View.call(this);
    this.registerRequiredCSS("nativeMemoryProfiler.css");

    this.element.addStyleClass("native-snapshot-view");
    this._containmentDataGrid = new WebInspector.NativeSnapshotDataGrid(profile);
    this._containmentDataGrid.show(this.element);
}

WebInspector.NativeMemorySnapshotView.prototype = {
    __proto__: WebInspector.View.prototype
}


/**
 * @constructor
 * @extends {WebInspector.DataGrid}
 * @param {WebInspector.NativeMemoryProfileHeader} profile
 */
WebInspector.NativeSnapshotDataGrid = function(profile)
{
    var columns = [
        {id: "name", title: WebInspector.UIString("Object"), width: "200px", disclosure: true, sortable: true},
        {id: "size", title: WebInspector.UIString("Size"), sortable: true, sort: WebInspector.DataGrid.Order.Descending},
    ];
    WebInspector.DataGrid.call(this, columns);
    this._profile = profile;
    this._totalNode = new WebInspector.NativeSnapshotNode(profile._memoryBlock, profile);
    if (WebInspector.settings.showNativeSnapshotUninstrumentedSize.get()) {
        this.setRootNode(new WebInspector.DataGridNode(null, true));
        this.rootNode().appendChild(this._totalNode)
        this._totalNode.expand();
    } else {
        this.setRootNode(this._totalNode);
        this._totalNode.populate();
    }
    this.addEventListener(WebInspector.DataGrid.Events.SortingChanged, this.sortingChanged.bind(this), this);
}

WebInspector.NativeSnapshotDataGrid.prototype = {
    sortingChanged: function()
    {
        var expandedNodes = {};
        this._totalNode._storeState(expandedNodes);
        this._totalNode.removeChildren();
        this._totalNode._populated = false;
        this._totalNode.populate();
        this._totalNode._shouldRefreshChildren = true;
        this._totalNode._restoreState(expandedNodes);
    },

    /**
     * @param {MemoryAgent.MemoryBlock} nodeA
     * @param {MemoryAgent.MemoryBlock} nodeB
     */
    _sortingFunction: function(nodeA, nodeB)
    {
        var sortColumnIdentifier = this.sortColumnIdentifier();
        var sortAscending = this.isSortOrderAscending();
        var field1 = nodeA[sortColumnIdentifier];
        var field2 = nodeB[sortColumnIdentifier];
        var result = field1 < field2 ? -1 : (field1 > field2 ? 1 : 0);
        if (!sortAscending)
            result = -result;
        return result;
    },

    __proto__: WebInspector.DataGrid.prototype
}

/**
 * @constructor
 * @extends {WebInspector.DataGridNode}
 * @param {MemoryAgent.MemoryBlock} nodeData
 */
WebInspector.NativeSnapshotNode = function(nodeData, profile)
{
    this._nodeData = nodeData;
    this._profile = profile;
    var viewProperties = WebInspector.MemoryBlockViewProperties._forMemoryBlock(nodeData);
    var data = { name: viewProperties._description, size: this._nodeData.size };
    var hasChildren = this._addChildrenFromGraph();
    WebInspector.DataGridNode.call(this, data, hasChildren);
}

WebInspector.NativeSnapshotNode.prototype = {
    /**
     * @override
     * @param {string} columnIdentifier
     * @return {Element}
     */
    createCell: function(columnIdentifier)
    {
        var cell = columnIdentifier === "size" ?
            this._createSizeCell(columnIdentifier) :
            WebInspector.DataGridNode.prototype.createCell.call(this, columnIdentifier);
        return cell;
    },

    /**
     * @param {Object} expandedNodes
     */
    _storeState: function(expandedNodes)
    {
        if (!this.expanded)
            return;
        expandedNodes[this.uid()] = true;
        for (var i in this.children)
            this.children[i]._storeState(expandedNodes);
    },

    /**
     * @param {Object} expandedNodes
     */
    _restoreState: function(expandedNodes)
    {
        if (!expandedNodes[this.uid()])
            return;
        this.expand();
        for (var i in this.children)
            this.children[i]._restoreState(expandedNodes);
    },

    /**
     * @return {string}
     */
    uid: function()
    {
        if (!this._uid)
            this._uid = (!this.parent || !this.parent.uid ? "" : this.parent.uid() || "") + "/" + this._nodeData.name;
        return this._uid;
    },

    /**
     * @param {string} columnIdentifier
     * @return {Element}
     */
    _createSizeCell: function(columnIdentifier)
    {
        var node = this;
        var viewProperties = null;
        var dimmed = false;
        while (!viewProperties || viewProperties._fillStyle === "inherit") {
            viewProperties = WebInspector.MemoryBlockViewProperties._forMemoryBlock(node._nodeData);
            if (viewProperties._fillStyle === "inherit")
                dimmed = true;
            node = node.parent;
        }

        var sizeKB = this._nodeData.size / 1024;
        var totalSize = this._profile._memoryBlock.size;
        var percentage = this._nodeData.size / totalSize  * 100;

        var cell = document.createElement("td");
        cell.className = columnIdentifier + "-column";

        var textDiv = document.createElement("div");
        textDiv.textContent = Number.withThousandsSeparator(sizeKB.toFixed(0)) + "\u2009" + WebInspector.UIString("KB");
        textDiv.className = "size-text";
        cell.appendChild(textDiv);

        var barDiv = document.createElement("div");
        barDiv.className = "size-bar";
        barDiv.style.width = percentage + "%";
        barDiv.style.backgroundColor = viewProperties._fillStyle;
        // fillerDiv displaces percentage text out of the bar visible area if it doesn't fit.
        var fillerDiv = document.createElement("div");
        fillerDiv.className = "percent-text"
        barDiv.appendChild(fillerDiv);
        var percentDiv = document.createElement("div");
        percentDiv.textContent = percentage.toFixed(1) + "%";
        percentDiv.className = "percent-text"
        barDiv.appendChild(percentDiv);

        var barHolderDiv = document.createElement("div");
        if (dimmed)
            barHolderDiv.className = "dimmed";
        barHolderDiv.appendChild(barDiv);
        cell.appendChild(barHolderDiv);

        return cell;
    },

    populate: function() {
        if (this._populated)
            return;
        this._populated = true;
        if (this._nodeData.children)
            this._addChildren();
    },

    _addChildren: function()
    {
        this._nodeData.children.sort(this.dataGrid._sortingFunction.bind(this.dataGrid));

        for (var node in this._nodeData.children) {
            var nodeData = this._nodeData.children[node];
            if (WebInspector.settings.showNativeSnapshotUninstrumentedSize.get() || nodeData.name !== "Other")
                this.appendChild(new WebInspector.NativeSnapshotNode(nodeData, this._profile));
        }
    },

    _addChildrenFromGraph: function()
    {
        var memoryBlock = this._nodeData;
        if (memoryBlock.children)
             return memoryBlock.children.length > 0;
        if (memoryBlock.name === "Image") {
            this._addImageDetails();
            return true;
        }
        return false;
    },

    _addImageDetails: function()
    {
        /**
         * @param {WebInspector.NativeHeapSnapshotProxy} proxy
         */
        function didLoad(proxy)
        {
            function didReceiveImages(result)
            {
                this._nodeData.children = result;
                if (this.expanded)
                    this._addChildren();
            }
            proxy.images(didReceiveImages.bind(this));

        }
        this._profile.load(didLoad.bind(this));
    },

    __proto__: WebInspector.DataGridNode.prototype
}


/**
 * @constructor
 * @implements {MemoryAgent.Dispatcher}
 */
WebInspector.MemoryAgentDispatcher = function()
{
    InspectorBackend.registerMemoryDispatcher(this);
    this._currentProfileHeader = null;
}

WebInspector.MemoryAgentDispatcher.instance = function()
{
    if (!WebInspector.MemoryAgentDispatcher._instance)
        WebInspector.MemoryAgentDispatcher._instance = new WebInspector.MemoryAgentDispatcher();
    return WebInspector.MemoryAgentDispatcher._instance;
}

WebInspector.MemoryAgentDispatcher.prototype = {
    /**
     * @override
     * @param {MemoryAgent.HeapSnapshotChunk} chunk
     */
    addNativeSnapshotChunk: function(chunk)
    {
        if (this._currentProfileHeader)
            this._currentProfileHeader.addNativeSnapshotChunk(chunk);
    },

    _onRemoveProfileHeader: function(event)
    {
        if (event.data === this._currentProfileHeader)
            this._currentProfileHeader = null;
    }
};


/**
 * @constructor
 * @extends {WebInspector.ProfileType}
 * @param {string} id
 * @param {string} name
 */
WebInspector.NativeProfileTypeBase = function(profileHeaderConstructor, id, name)
{
    WebInspector.ProfileType.call(this, id, name);
    this._profileHeaderConstructor = profileHeaderConstructor;
    this._nextProfileUid = 1;
    this.addEventListener(WebInspector.ProfileType.Events.RemoveProfileHeader,
                          WebInspector.MemoryAgentDispatcher.prototype._onRemoveProfileHeader,
                          WebInspector.MemoryAgentDispatcher.instance());
}

WebInspector.NativeProfileTypeBase.prototype = {
    /**
     * @override
     * @return {boolean}
     */
    isInstantProfile: function()
    {
        return true;
    },

    /**
     * @override
     * @return {boolean}
     */
    buttonClicked: function()
    {
        if (WebInspector.MemoryAgentDispatcher.instance()._currentProfileHeader)
            return false;

        var profileHeader = new this._profileHeaderConstructor(this, WebInspector.UIString("Snapshot %d", this._nextProfileUid), this._nextProfileUid);
        ++this._nextProfileUid;
        profileHeader.isTemporary = true;
        this.addProfile(profileHeader);
        WebInspector.MemoryAgentDispatcher.instance()._currentProfileHeader = profileHeader;
        profileHeader.load(function() { });


        /**
         * @param {?string} error
         * @param {?MemoryAgent.MemoryBlock} memoryBlock
         * @param {Object=} graphMetaInformation
         */
        function didReceiveMemorySnapshot(error, memoryBlock, graphMetaInformation)
        {
            console.assert(this === WebInspector.MemoryAgentDispatcher.instance()._currentProfileHeader);
            WebInspector.MemoryAgentDispatcher.instance()._currentProfileHeader = null;
            this._didReceiveMemorySnapshot(error, memoryBlock, graphMetaInformation);
        }
        MemoryAgent.getProcessMemoryDistribution(true, didReceiveMemorySnapshot.bind(profileHeader));
        return false;
    },

    /**
     * @override
     * @param {!WebInspector.ProfileHeader} profile
     */
    removeProfile: function(profile)
    {
        if (WebInspector.MemoryAgentDispatcher.instance()._currentProfileHeader === profile)
            WebInspector.MemoryAgentDispatcher.instance()._currentProfileHeader = null;
        WebInspector.ProfileType.prototype.removeProfile.call(this, profile);
    },

    /**
     * @override
     * @param {string=} title
     * @return {WebInspector.ProfileHeader}
     */
    createTemporaryProfile: function(title)
    {
        title = title || WebInspector.UIString("Snapshotting\u2026");
        return new this._profileHeaderConstructor(this, title);
    },

    /**
     * @override
     * @param {ProfilerAgent.ProfileHeader} profile
     * @return {WebInspector.ProfileHeader}
     */
    createProfile: function(profile)
    {
        return new this._profileHeaderConstructor(this, profile.title, -1);
    },

    __proto__: WebInspector.ProfileType.prototype
}

/**
 * @constructor
 * @extends {WebInspector.NativeProfileTypeBase}
 */
WebInspector.NativeSnapshotProfileType = function()
{
    WebInspector.NativeProfileTypeBase.call(this, WebInspector.NativeSnapshotProfileHeader,  WebInspector.NativeSnapshotProfileType.TypeId, WebInspector.UIString("Take Native Heap Snapshot"));
}

WebInspector.NativeSnapshotProfileType.TypeId = "NATIVE_SNAPSHOT";

WebInspector.NativeSnapshotProfileType.prototype = {
    get buttonTooltip()
    {
        return WebInspector.UIString("Capture native heap graph.");
    },

    get treeItemTitle()
    {
        return WebInspector.UIString("NATIVE SNAPSHOT");
    },

    get description()
    {
        return WebInspector.UIString("Native memory snapshot profiles show native heap graph.");
    },

    __proto__: WebInspector.NativeProfileTypeBase.prototype
}


/**
 * @constructor
 * @extends {WebInspector.HeapProfileHeader}
 * @param {!WebInspector.ProfileType} type
 * @param {string} title
 * @param {number=} uid
 */
WebInspector.NativeSnapshotProfileHeader = function(type, title, uid)
{
    WebInspector.HeapProfileHeader.call(this, type, title, uid, 0);
    this._strings = [];
    this._nodes = [];
    this._edges = [];
    this._baseToRealNodeId = [];
}

WebInspector.NativeSnapshotProfileHeader.prototype = {
    /**
     * @override
     * @param {!WebInspector.ProfilesPanel} profilesPanel
     */
    createView: function(profilesPanel)
    {
        return new WebInspector.NativeHeapSnapshotView(profilesPanel, this);
    },

    startSnapshotTransfer: function()
    {
    },

    snapshotConstructorName: function()
    {
        return "NativeHeapSnapshot";
    },

    snapshotProxyConstructor: function()
    {
        return WebInspector.NativeHeapSnapshotProxy;
    },

    addNativeSnapshotChunk: function(chunk)
    {
        this._strings = this._strings.concat(chunk.strings);
        this._nodes = this._nodes.concat(chunk.nodes);
        this._edges = this._edges.concat(chunk.edges);
        this._baseToRealNodeId = this._baseToRealNodeId.concat(chunk.baseToRealNodeId);
    },

    /**
     * @param {?string} error
     * @param {?MemoryAgent.MemoryBlock} memoryBlock
     * @param {Object=} graphMetaInformation
     */
    _didReceiveMemorySnapshot: function(error, memoryBlock, graphMetaInformation)
    {
        var metaInformation = /** @type{HeapSnapshotMetainfo} */ (graphMetaInformation);
        this.isTemporary = false;

        var edgeFieldCount = metaInformation.edge_fields.length;
        var nodeFieldCount = metaInformation.node_fields.length;
        var nodeIdFieldOffset = metaInformation.node_fields.indexOf("id");
        var toNodeIdFieldOffset = metaInformation.edge_fields.indexOf("to_node");

        var baseToRealNodeIdMap = {};
        for (var i = 0; i < this._baseToRealNodeId.length; i += 2)
            baseToRealNodeIdMap[this._baseToRealNodeId[i]] = this._baseToRealNodeId[i + 1];

        var nodeId2NodeIndex = {};
        for (var i = nodeIdFieldOffset; i < this._nodes.length; i += nodeFieldCount)
            nodeId2NodeIndex[this._nodes[i]] = i - nodeIdFieldOffset;

        // Translate nodeId to nodeIndex.
        var edges = this._edges;
        for (var i = toNodeIdFieldOffset; i < edges.length; i += edgeFieldCount) {
            if (edges[i] in baseToRealNodeIdMap)
                edges[i] = baseToRealNodeIdMap[edges[i]];
            edges[i] = nodeId2NodeIndex[edges[i]];
        }

        var heapSnapshot = {
            "snapshot": {
                "meta": metaInformation,
                node_count: this._nodes.length / nodeFieldCount,
                edge_count: this._edges.length / edgeFieldCount,
                root_index: this._nodes.length - nodeFieldCount
            },
            nodes: this._nodes,
            edges: this._edges,
            strings: this._strings
        };

        var chunk = JSON.stringify(heapSnapshot);
        this.transferChunk(chunk);
        this.finishHeapSnapshot();
    },

    __proto__: WebInspector.HeapProfileHeader.prototype
}


/**
 * @constructor
 * @extends {WebInspector.HeapSnapshotView}
 * @param {!WebInspector.ProfilesPanel} parent
 * @param {!WebInspector.NativeSnapshotProfileHeader} profile
 */
WebInspector.NativeHeapSnapshotView = function(parent, profile)
{
    this._profile = profile;
    WebInspector.HeapSnapshotView.call(this, parent, profile);
}


WebInspector.NativeHeapSnapshotView.prototype = {
    get profile()
    {
        return this._profile;
    },

    __proto__: WebInspector.HeapSnapshotView.prototype
};


/**
 * @constructor
 * @extends {WebInspector.NativeProfileTypeBase}
 */
WebInspector.NativeMemoryProfileType = function()
{
    WebInspector.NativeProfileTypeBase.call(this, WebInspector.NativeMemoryProfileHeader, WebInspector.NativeMemoryProfileType.TypeId, WebInspector.UIString("Capture Native Memory Distribution"));
}

WebInspector.NativeMemoryProfileType.TypeId = "NATIVE_MEMORY_DISTRIBUTION";

WebInspector.NativeMemoryProfileType.prototype = {
    get buttonTooltip()
    {
        return WebInspector.UIString("Capture native memory distribution.");
    },

    get treeItemTitle()
    {
        return WebInspector.UIString("MEMORY DISTRIBUTION");
    },

    get description()
    {
        return WebInspector.UIString("Native memory snapshot profiles show memory distribution among browser subsystems.");
    },

    __proto__: WebInspector.NativeProfileTypeBase.prototype
}

/**
 * @constructor
 * @extends {WebInspector.NativeSnapshotProfileHeader}
 * @param {!WebInspector.ProfileType} type
 * @param {string} title
 * @param {number=} uid
 */
WebInspector.NativeMemoryProfileHeader = function(type, title, uid)
{
    WebInspector.NativeSnapshotProfileHeader.call(this, type, title, uid);

    /**
     * @type {MemoryAgent.MemoryBlock}
     */
    this._memoryBlock = null;
}

WebInspector.NativeMemoryProfileHeader.prototype = {
    /**
     * @override
     */
    createSidebarTreeElement: function()
    {
        return new WebInspector.ProfileSidebarTreeElement(this, WebInspector.UIString("Snapshot %d"), "heap-snapshot-sidebar-tree-item");
    },

    /**
     * @override
     * @param {WebInspector.ProfilesPanel} profilesPanel
     */
    createView: function(profilesPanel)
    {
        return new WebInspector.NativeMemorySnapshotView(this);
    },

    /**
     * @override
     */
    _updateSnapshotStatus: function()
    {
        WebInspector.NativeSnapshotProfileHeader.prototype._updateSnapshotStatus.call(this);
        this.sidebarElement.subtitle = Number.bytesToString(/** @type{number} */ (this._memoryBlock.size));
    },

    /**
     * @override
     * @param {?string} error
     * @param {?MemoryAgent.MemoryBlock} memoryBlock
     * @param {Object=} graphMetaInformation
     */
    _didReceiveMemorySnapshot: function(error, memoryBlock, graphMetaInformation)
    {
        WebInspector.NativeSnapshotProfileHeader.prototype._didReceiveMemorySnapshot.call(this, error, memoryBlock, graphMetaInformation);
        if (memoryBlock.size && memoryBlock.children) {
            var knownSize = 0;
            for (var i = 0; i < memoryBlock.children.length; i++) {
                var size = memoryBlock.children[i].size;
                if (size)
                    knownSize += size;
            }
            var otherSize = memoryBlock.size - knownSize;

            if (otherSize) {
                memoryBlock.children.push({
                    name: "Other",
                    size: otherSize
                });
            }
        }
        this._memoryBlock = memoryBlock;
    },

    __proto__: WebInspector.NativeSnapshotProfileHeader.prototype
}

/**
 * @constructor
 * @param {string} fillStyle
 * @param {string} name
 * @param {string} description
 */
WebInspector.MemoryBlockViewProperties = function(fillStyle, name, description)
{
    this._fillStyle = fillStyle;
    this._name = name;
    this._description = description;
}

/**
 * @type {Object.<string, WebInspector.MemoryBlockViewProperties>}
 */
WebInspector.MemoryBlockViewProperties._standardBlocks = null;

WebInspector.MemoryBlockViewProperties._initialize = function()
{
    if (WebInspector.MemoryBlockViewProperties._standardBlocks)
        return;
    WebInspector.MemoryBlockViewProperties._standardBlocks = {};
    function addBlock(fillStyle, name, description)
    {
        WebInspector.MemoryBlockViewProperties._standardBlocks[name] = new WebInspector.MemoryBlockViewProperties(fillStyle, name, WebInspector.UIString(description));
    }
    addBlock("hsl(  0,  0%,  60%)", "ProcessPrivateMemory", "Total");
    addBlock("hsl(  0,  0%,  80%)", "OwnersTypePlaceholder", "OwnersTypePlaceholder");
    addBlock("hsl(  0,  0%,  60%)", "Other", "Other");
    addBlock("hsl(220, 80%,  70%)", "Image", "Images");
    addBlock("hsl(100, 60%,  50%)", "JSHeap", "JavaScript heap");
    addBlock("hsl( 90, 40%,  80%)", "JSExternalResources", "JavaScript external resources");
    addBlock("hsl( 90, 60%,  80%)", "CSS", "CSS");
    addBlock("hsl(  0, 50%,  60%)", "DOM", "DOM");
    addBlock("hsl(  0, 80%,  60%)", "WebInspector", "Inspector data");
    addBlock("hsl( 36, 90%,  50%)", "Resources", "Resources");
    addBlock("hsl( 40, 80%,  80%)", "GlyphCache", "Glyph cache resources");
    addBlock("hsl( 35, 80%,  80%)", "DOMStorageCache", "DOM storage cache");
    addBlock("hsl( 60, 80%,  60%)", "RenderTree", "Render tree");
    addBlock("hsl( 20, 80%,  50%)", "MallocWaste", "Memory allocator waste");
}

WebInspector.MemoryBlockViewProperties._forMemoryBlock = function(memoryBlock)
{
    WebInspector.MemoryBlockViewProperties._initialize();
    var result = WebInspector.MemoryBlockViewProperties._standardBlocks[memoryBlock.name];
    if (result)
        return result;
    return new WebInspector.MemoryBlockViewProperties("inherit", memoryBlock.name, memoryBlock.name);
}

