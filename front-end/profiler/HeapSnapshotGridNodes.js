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
 * @constructor
 * @extends {WebInspector.DataGridNode}
 * @param {!WebInspector.HeapSnapshotSortableDataGrid} tree
 * @param {boolean} hasChildren
 */
WebInspector.HeapSnapshotGridNode = function(tree, hasChildren)
{
    WebInspector.DataGridNode.call(this, null, hasChildren);
    this._dataGrid = tree;
    this._instanceCount = 0;

    this._savedChildren = null;
    /**
     * List of position ranges for all visible nodes: [startPos1, endPos1),...,[startPosN, endPosN)
     * Position is an item position in the provider.
     */
    this._retrievedChildrenRanges = [];

    /**
      * @type {?WebInspector.HeapSnapshotGridNode.ChildrenProvider}
      */
    this._providerObject = null;
}

WebInspector.HeapSnapshotGridNode.Events = {
    PopulateComplete: "PopulateComplete"
}

/**
 * @param {!Array.<string>} fieldNames
 * @return {!WebInspector.HeapSnapshotCommon.ComparatorConfig}
 */
WebInspector.HeapSnapshotGridNode.createComparator = function(fieldNames)
{
    return /** @type {!WebInspector.HeapSnapshotCommon.ComparatorConfig} */ ({fieldName1: fieldNames[0], ascending1: fieldNames[1], fieldName2: fieldNames[2], ascending2: fieldNames[3]});
}


/**
 * @interface
 */
WebInspector.HeapSnapshotGridNode.ChildrenProvider = function() { }

WebInspector.HeapSnapshotGridNode.ChildrenProvider.prototype = {
    dispose: function() { },

    /**
     * @param {number} snapshotObjectId
     * @return {!Promise<number>}
     */
    nodePosition: function(snapshotObjectId) { },

    /**
     * @param {function(boolean)} callback
     */
    isEmpty: function(callback) { },

    /**
     * @param {number} startPosition
     * @param {number} endPosition
     * @param {function(!WebInspector.HeapSnapshotCommon.ItemsRange)} callback
     */
    serializeItemsRange: function(startPosition, endPosition, callback) { },

    /**
     * @param {!WebInspector.HeapSnapshotCommon.ComparatorConfig} comparator
     * @return {!Promise<?>}
     */
    sortAndRewind: function(comparator) { }
}


WebInspector.HeapSnapshotGridNode.prototype = {
    /**
     * @return {!WebInspector.HeapSnapshotSortableDataGrid}
     */
    heapSnapshotDataGrid: function()
    {
        return this._dataGrid;
    },

    /**
     * @return {!WebInspector.HeapSnapshotGridNode.ChildrenProvider}
     */
    createProvider: function()
    {
        throw new Error("Not implemented.");
    },

    /**
     * @return {?{snapshot:!WebInspector.HeapSnapshotProxy, snapshotNodeIndex:number}}
     */
    retainersDataSource: function()
    {
        return null;
    },

    /**
     * @return {!WebInspector.HeapSnapshotGridNode.ChildrenProvider}
     */
    _provider: function()
    {
        if (!this._providerObject)
            this._providerObject = this.createProvider();
        return this._providerObject;
    },

    /**
     * @override
     * @param {string} columnIdentifier
     * @return {!Element}
     */
    createCell: function(columnIdentifier)
    {
        var cell = WebInspector.DataGridNode.prototype.createCell.call(this, columnIdentifier);
        if (this._searchMatched)
            cell.classList.add("highlight");
        return cell;
    },

    /**
     * @override
     */
    collapse: function()
    {
        WebInspector.DataGridNode.prototype.collapse.call(this);
        this._dataGrid.updateVisibleNodes(true);
    },

    /**
     * @override
     */
    expand: function()
    {
        WebInspector.DataGridNode.prototype.expand.call(this);
        this._dataGrid.updateVisibleNodes(true);
    },

    dispose: function()
    {
        if (this._providerObject)
            this._providerObject.dispose();
        for (var node = this.children[0]; node; node = node.traverseNextNode(true, this, true))
            if (node.dispose)
                node.dispose();
    },

    _reachableFromWindow: false,

    queryObjectContent: function(callback)
    {
    },

    /**
     * @override
     */
    wasDetached: function()
    {
        this._dataGrid.nodeWasDetached(this);
    },

    /**
     * @param {number} num
     * @return {string}
     */
    _toPercentString: function(num)
    {
        return num.toFixed(0) + "\u2009%"; // \u2009 is a thin space.
    },

    /**
     * @param {number} distance
     * @return {string}
     */
    _toUIDistance: function(distance)
    {
        var baseSystemDistance = WebInspector.HeapSnapshotCommon.baseSystemDistance;
        return distance >= 0 && distance < baseSystemDistance ? WebInspector.UIString("%d", distance) : WebInspector.UIString("\u2212");
    },

    /**
     * @return {!Array.<!WebInspector.DataGridNode>}
     */
    allChildren: function()
    {
        return this._dataGrid.allChildren(this);
    },

    /**
     * @param {number} index
     */
    removeChildByIndex: function(index)
    {
        this._dataGrid.removeChildByIndex(this, index);
    },

    /**
     * @param {number} nodePosition
     * @return {?WebInspector.DataGridNode}
     */
    childForPosition: function(nodePosition)
    {
        var indexOfFirstChildInRange = 0;
        for (var i = 0; i < this._retrievedChildrenRanges.length; i++) {
           var range = this._retrievedChildrenRanges[i];
           if (range.from <= nodePosition && nodePosition < range.to) {
               var childIndex = indexOfFirstChildInRange + nodePosition - range.from;
               return this.allChildren()[childIndex];
           }
           indexOfFirstChildInRange += range.to - range.from + 1;
        }
        return null;
    },

    /**
     * @param {string} columnIdentifier
     * @return {!Element}
     */
    _createValueCell: function(columnIdentifier)
    {
        var cell = createElement("td");
        cell.className = "numeric-column";
        if (this.dataGrid.snapshot.totalSize !== 0) {
            var div = createElement("div");
            var valueSpan = createElement("span");
            valueSpan.textContent = this.data[columnIdentifier];
            div.appendChild(valueSpan);
            var percentColumn = columnIdentifier + "-percent";
            if (percentColumn in this.data) {
                var percentSpan = createElement("span");
                percentSpan.className = "percent-column";
                percentSpan.textContent = this.data[percentColumn];
                div.appendChild(percentSpan);
                div.classList.add("profile-multiple-values");
            }
            cell.appendChild(div);
        }
        return cell;
    },

    populate: function(event)
    {
        if (this._populated)
            return;
        this._populated = true;
        this._provider().sortAndRewind(this.comparator()).then(this._populateChildren.bind(this));
    },

    /**
     * @return {!Promise<?>}
     */
    expandWithoutPopulate: function()
    {
        // Make sure default populate won't take action.
        this._populated = true;
        this.expand();
        return this._provider().sortAndRewind(this.comparator());
    },

    /**
     * @param {?number=} fromPosition
     * @param {?number=} toPosition
     * @param {function()=} afterPopulate
     */
    _populateChildren: function(fromPosition, toPosition, afterPopulate)
    {
        fromPosition = fromPosition || 0;
        toPosition = toPosition || fromPosition + this._dataGrid.defaultPopulateCount();
        var firstNotSerializedPosition = fromPosition;

        /**
         * @this {WebInspector.HeapSnapshotGridNode}
         */
        function serializeNextChunk()
        {
            if (firstNotSerializedPosition >= toPosition)
                return;
            var end = Math.min(firstNotSerializedPosition + this._dataGrid.defaultPopulateCount(), toPosition);
            this._provider().serializeItemsRange(firstNotSerializedPosition, end, childrenRetrieved.bind(this));
            firstNotSerializedPosition = end;
        }

        /**
         * @this {WebInspector.HeapSnapshotGridNode}
         */
        function insertRetrievedChild(item, insertionIndex)
        {
            if (this._savedChildren) {
                var hash = this._childHashForEntity(item);
                if (hash in this._savedChildren) {
                    this._dataGrid.insertChild(this, this._savedChildren[hash], insertionIndex);
                    return;
                }
            }
            this._dataGrid.insertChild(this, this._createChildNode(item), insertionIndex);
        }

        /**
         * @this {WebInspector.HeapSnapshotGridNode}
         */
        function insertShowMoreButton(from, to, insertionIndex)
        {
            var button = new WebInspector.ShowMoreDataGridNode(this._populateChildren.bind(this), from, to, this._dataGrid.defaultPopulateCount());
            this._dataGrid.insertChild(this, button, insertionIndex);
        }

        /**
         * @param {!WebInspector.HeapSnapshotCommon.ItemsRange} itemsRange
         * @this {WebInspector.HeapSnapshotGridNode}
         */
        function childrenRetrieved(itemsRange)
        {
            var itemIndex = 0;
            var itemPosition = itemsRange.startPosition;
            var items = itemsRange.items;
            var insertionIndex = 0;

            if (!this._retrievedChildrenRanges.length) {
                if (itemsRange.startPosition > 0) {
                    this._retrievedChildrenRanges.push({from: 0, to: 0});
                    insertShowMoreButton.call(this, 0, itemsRange.startPosition, insertionIndex++);
                }
                this._retrievedChildrenRanges.push({from: itemsRange.startPosition, to: itemsRange.endPosition});
                for (var i = 0, l = items.length; i < l; ++i)
                    insertRetrievedChild.call(this, items[i], insertionIndex++);
                if (itemsRange.endPosition < itemsRange.totalLength)
                    insertShowMoreButton.call(this, itemsRange.endPosition, itemsRange.totalLength, insertionIndex++);
            } else {
                var rangeIndex = 0;
                var found = false;
                var range;
                while (rangeIndex < this._retrievedChildrenRanges.length) {
                    range = this._retrievedChildrenRanges[rangeIndex];
                    if (range.to >= itemPosition) {
                        found = true;
                        break;
                    }
                    insertionIndex += range.to - range.from;
                    // Skip the button if there is one.
                    if (range.to < itemsRange.totalLength)
                        insertionIndex += 1;
                    ++rangeIndex;
                }

                if (!found || itemsRange.startPosition < range.from) {
                    // Update previous button.
                    this.allChildren()[insertionIndex - 1].setEndPosition(itemsRange.startPosition);
                    insertShowMoreButton.call(this, itemsRange.startPosition, found ? range.from : itemsRange.totalLength, insertionIndex);
                    range = {from: itemsRange.startPosition, to: itemsRange.startPosition};
                    if (!found)
                        rangeIndex = this._retrievedChildrenRanges.length;
                    this._retrievedChildrenRanges.splice(rangeIndex, 0, range);
                } else {
                    insertionIndex += itemPosition - range.from;
                }
                // At this point insertionIndex is always an index before button or between nodes.
                // Also it is always true here that range.from <= itemPosition <= range.to

                // Stretch the range right bound to include all new items.
                while (range.to < itemsRange.endPosition) {
                    // Skip already added nodes.
                    var skipCount = range.to - itemPosition;
                    insertionIndex += skipCount;
                    itemIndex += skipCount;
                    itemPosition = range.to;

                    // We're at the position before button: ...<?node>x<button>
                    var nextRange = this._retrievedChildrenRanges[rangeIndex + 1];
                    var newEndOfRange = nextRange ? nextRange.from : itemsRange.totalLength;
                    if (newEndOfRange > itemsRange.endPosition)
                        newEndOfRange = itemsRange.endPosition;
                    while (itemPosition < newEndOfRange) {
                        insertRetrievedChild.call(this, items[itemIndex++], insertionIndex++);
                        ++itemPosition;
                    }

                    // Merge with the next range.
                    if (nextRange && newEndOfRange === nextRange.from) {
                        range.to = nextRange.to;
                        // Remove "show next" button if there is one.
                        this.removeChildByIndex(insertionIndex);
                        this._retrievedChildrenRanges.splice(rangeIndex + 1, 1);
                    } else {
                        range.to = newEndOfRange;
                        // Remove or update next button.
                        if (newEndOfRange === itemsRange.totalLength)
                            this.removeChildByIndex(insertionIndex);
                        else
                            this.allChildren()[insertionIndex].setStartPosition(itemsRange.endPosition);
                    }
                }
            }

            // TODO: fix this.
            this._instanceCount += items.length;
            if (firstNotSerializedPosition < toPosition) {
                serializeNextChunk.call(this);
                return;
            }

            if (this.expanded)
                this._dataGrid.updateVisibleNodes(true);
            if (afterPopulate)
                afterPopulate();
            this.dispatchEventToListeners(WebInspector.HeapSnapshotGridNode.Events.PopulateComplete);
        }
        serializeNextChunk.call(this);
    },

    _saveChildren: function()
    {
        this._savedChildren = null;
        var children = this.allChildren();
        for (var i = 0, l = children.length; i < l; ++i) {
            var child = children[i];
            if (!child.expanded)
                continue;
            if (!this._savedChildren)
                this._savedChildren = {};
            this._savedChildren[this._childHashForNode(child)] = child;
        }
    },

    sort: function()
    {
        this._dataGrid.recursiveSortingEnter();

        /**
         * @this {WebInspector.HeapSnapshotGridNode}
         */
        function afterSort()
        {
            this._saveChildren();
            this._dataGrid.removeAllChildren(this);
            this._retrievedChildrenRanges = [];

            /**
             * @this {WebInspector.HeapSnapshotGridNode}
             */
            function afterPopulate()
            {
                var children = this.allChildren();
                for (var i = 0, l = children.length; i < l; ++i) {
                    var child = children[i];
                    if (child.expanded)
                        child.sort();
                }
                this._dataGrid.recursiveSortingLeave();
            }
            var instanceCount = this._instanceCount;
            this._instanceCount = 0;
            this._populateChildren(0, instanceCount, afterPopulate.bind(this));
        }

        this._provider().sortAndRewind(this.comparator()).then(afterSort.bind(this));
    },

    __proto__: WebInspector.DataGridNode.prototype
}


/**
 * @constructor
 * @extends {WebInspector.HeapSnapshotGridNode}
 * @param {!WebInspector.HeapSnapshotSortableDataGrid} dataGrid
 * @param {!WebInspector.HeapSnapshotCommon.Node} node
 */
WebInspector.HeapSnapshotGenericObjectNode = function(dataGrid, node)
{
    WebInspector.HeapSnapshotGridNode.call(this, dataGrid, false);
    // node is null for DataGrid root nodes.
    if (!node)
        return;
    this._name = node.name;
    this._type = node.type;
    this._distance = node.distance;
    this._shallowSize = node.selfSize;
    this._retainedSize = node.retainedSize;
    this.snapshotNodeId = node.id;
    this.snapshotNodeIndex = node.nodeIndex;
    if (this._type === "string")
        this._reachableFromWindow = true;
    else if (this._type === "object" && this._name.startsWith("Window")) {
        this._name = this.shortenWindowURL(this._name, false);
        this._reachableFromWindow = true;
    } else if (node.canBeQueried)
        this._reachableFromWindow = true;
    if (node.detachedDOMTreeNode)
        this.detachedDOMTreeNode = true;

    var snapshot = dataGrid.snapshot;
    var shallowSizePercent = this._shallowSize / snapshot.totalSize * 100.0;
    var retainedSizePercent = this._retainedSize / snapshot.totalSize * 100.0;
    this.data = {
        "distance": this._toUIDistance(this._distance),
        "shallowSize": Number.withThousandsSeparator(this._shallowSize),
        "retainedSize": Number.withThousandsSeparator(this._retainedSize),
        "shallowSize-percent": this._toPercentString(shallowSizePercent),
        "retainedSize-percent": this._toPercentString(retainedSizePercent)
    };
};

WebInspector.HeapSnapshotGenericObjectNode.prototype = {
    /**
     * @override
     * @return {?{snapshot:!WebInspector.HeapSnapshotProxy, snapshotNodeIndex:number}}
     */
    retainersDataSource: function()
    {
        return {snapshot: this._dataGrid.snapshot, snapshotNodeIndex: this.snapshotNodeIndex};
    },

    /**
     * @override
     * @param {string} columnIdentifier
     * @return {!Element}
     */
    createCell: function(columnIdentifier)
    {
        var cell = columnIdentifier !== "object" ? this._createValueCell(columnIdentifier) : this._createObjectCell();
        if (this._searchMatched)
            cell.classList.add("highlight");
        return cell;
    },

    /**
     * @return {!Element}
     */
    _createObjectCell: function()
    {
        var value = this._name;
        var valueStyle = "object";
        switch (this._type) {
        case "concatenated string":
        case "string":
            value = "\"" + value + "\"";
            valueStyle = "string";
            break;
        case "regexp":
            value = "/" + value + "/";
            valueStyle = "string";
            break;
        case "closure":
            value = value + "()";
            valueStyle = "function";
            break;
        case "number":
            valueStyle = "number";
            break;
        case "hidden":
            valueStyle = "null";
            break;
        case "array":
            value = (value || "") + "[]";
            break;
        };
        if (this._reachableFromWindow)
            valueStyle += " highlight";
        if (value === "Object")
            value = "";
        if (this.detachedDOMTreeNode)
            valueStyle += " detached-dom-tree-node";
        return this._createObjectCellWithValue(valueStyle, value);
    },

    _createObjectCellWithValue: function(valueStyle, value)
    {
        var cell = createElement("td");
        cell.className = "object-column";
        var div = createElement("div");
        div.className = "source-code event-properties";
        div.style.overflow = "visible";

        this._prefixObjectCell(div);

        var valueSpan = createElement("span");
        valueSpan.className = "value object-value-" + valueStyle;
        valueSpan.textContent = value;
        div.appendChild(valueSpan);

        var idSpan = createElement("span");
        idSpan.className = "object-value-id";
        idSpan.textContent = " @" + this.snapshotNodeId;
        div.appendChild(idSpan);

        cell.appendChild(div);
        cell.classList.add("disclosure");
        if (this.depth)
            cell.style.setProperty("padding-left", (this.depth * this.dataGrid.indentWidth) + "px");
        cell.heapSnapshotNode = this;
        return cell;
    },

    _prefixObjectCell: function(div)
    {
    },

    /**
     * @param {!WebInspector.Target} target
     * @param {function(!WebInspector.RemoteObject)} callback
     * @param {string} objectGroupName
     */
    queryObjectContent: function(target, callback, objectGroupName)
    {
        /**
         * @param {?Protocol.Error} error
         * @param {!RuntimeAgent.RemoteObject} object
         */
        function formatResult(error, object)
        {
            if (!error && object.type)
                callback(target.runtimeModel.createRemoteObject(object));
            else
                callback(target.runtimeModel.createRemoteObjectFromPrimitiveValue(WebInspector.UIString("Preview is not available")));
        }

        if (this._type === "string")
            callback(target.runtimeModel.createRemoteObjectFromPrimitiveValue(this._name));
        else
            target.heapProfilerAgent().getObjectByHeapObjectId(String(this.snapshotNodeId), objectGroupName, formatResult);
    },

    updateHasChildren: function()
    {
        /**
         * @this {WebInspector.HeapSnapshotGenericObjectNode}
         */
        function isEmptyCallback(isEmpty)
        {
            this.hasChildren = !isEmpty;
        }
        this._provider().isEmpty(isEmptyCallback.bind(this));
    },

    /**
     * @param {string} fullName
     * @param {boolean} hasObjectId
     * @return {string}
     */
    shortenWindowURL: function(fullName, hasObjectId)
    {
        var startPos = fullName.indexOf("/");
        var endPos = hasObjectId ? fullName.indexOf("@") : fullName.length;
        if (startPos !== -1 && endPos !== -1) {
            var fullURL = fullName.substring(startPos + 1, endPos).trimLeft();
            var url = fullURL.trimURL();
            if (url.length > 40)
                url = url.trimMiddle(40);
            return fullName.substr(0, startPos + 2) + url + fullName.substr(endPos);
        } else
            return fullName;
    },

    __proto__: WebInspector.HeapSnapshotGridNode.prototype
}

/**
 * @constructor
 * @extends {WebInspector.HeapSnapshotGenericObjectNode}
 * @param {!WebInspector.HeapSnapshotSortableDataGrid} dataGrid
 * @param {!WebInspector.HeapSnapshotProxy} snapshot
 * @param {!WebInspector.HeapSnapshotCommon.Edge} edge
 * @param {?WebInspector.HeapSnapshotObjectNode} parentObjectNode
 */
WebInspector.HeapSnapshotObjectNode = function(dataGrid, snapshot, edge, parentObjectNode)
{
    WebInspector.HeapSnapshotGenericObjectNode.call(this, dataGrid, edge.node);
    this._referenceName = edge.name;
    this._referenceType = edge.type;
    this._edgeIndex = edge.edgeIndex;
    this._snapshot = snapshot;

    this._parentObjectNode = parentObjectNode;
    this._cycledWithAncestorGridNode = this._findAncestorWithSameSnapshotNodeId();
    if (!this._cycledWithAncestorGridNode)
        this.updateHasChildren();

    var data = this.data;
    data["count"] = "";
    data["addedCount"] = "";
    data["removedCount"] = "";
    data["countDelta"] = "";
    data["addedSize"] = "";
    data["removedSize"] = "";
    data["sizeDelta"] = "";
}

WebInspector.HeapSnapshotObjectNode.prototype = {
    /**
     * @override
     * @return {?{snapshot:!WebInspector.HeapSnapshotProxy, snapshotNodeIndex:number}}
     */
    retainersDataSource: function()
    {
        return {snapshot: this._snapshot, snapshotNodeIndex: this.snapshotNodeIndex};
    },

    /**
     * @override
     * @return {!WebInspector.HeapSnapshotProviderProxy}
     */
    createProvider: function()
    {
        return this._snapshot.createEdgesProvider(this.snapshotNodeIndex);
    },

    _findAncestorWithSameSnapshotNodeId: function()
    {
        var ancestor = this._parentObjectNode;
        while (ancestor) {
            if (ancestor.snapshotNodeId === this.snapshotNodeId)
                return ancestor;
            ancestor = ancestor._parentObjectNode;
        }
        return null;
    },

    /**
     * @param {!WebInspector.HeapSnapshotCommon.Edge} item
     * @return {!WebInspector.HeapSnapshotObjectNode}
     */
    _createChildNode: function(item)
    {
        return new WebInspector.HeapSnapshotObjectNode(this._dataGrid, this._snapshot, item, this);
    },

    /**
     * @param {!WebInspector.HeapSnapshotCommon.Edge} edge
     * @return {number}
     */
    _childHashForEntity: function(edge)
    {
        return edge.edgeIndex;
    },

    /**
     * @param {!WebInspector.HeapSnapshotObjectNode} childNode
     * @return {number}
     */
    _childHashForNode: function(childNode)
    {
        return childNode._edgeIndex;
    },

    /**
     * @return {!WebInspector.HeapSnapshotCommon.ComparatorConfig}
     */
    comparator: function()
    {
        var sortAscending = this._dataGrid.isSortOrderAscending();
        var sortColumnIdentifier = this._dataGrid.sortColumnIdentifier();
        var sortFields = {
            object: ["!edgeName", sortAscending, "retainedSize", false],
            count: ["!edgeName", true, "retainedSize", false],
            shallowSize: ["selfSize", sortAscending, "!edgeName", true],
            retainedSize: ["retainedSize", sortAscending, "!edgeName", true],
            distance: ["distance", sortAscending, "_name", true]
        }[sortColumnIdentifier] || ["!edgeName", true, "retainedSize", false];
        return WebInspector.HeapSnapshotGridNode.createComparator(sortFields);
    },

    _prefixObjectCell: function(div)
    {
        var name = this._referenceName || "(empty)";
        var nameClass = "name";
        switch (this._referenceType) {
        case "context":
            nameClass = "object-value-number";
            break;
        case "internal":
        case "hidden":
        case "weak":
            nameClass = "object-value-null";
            break;
        case "element":
            name = "[" + name + "]";
            break;
        }

        if (this._cycledWithAncestorGridNode)
            div.className += " cycled-ancessor-node";

        var nameSpan = createElement("span");
        nameSpan.className = nameClass;
        nameSpan.textContent = name;
        div.appendChild(nameSpan);

        var separatorSpan = createElement("span");
        separatorSpan.className = "grayed";
        separatorSpan.textContent = this._edgeNodeSeparator();
        div.appendChild(separatorSpan);
    },

    /**
     * @return {string}
     */
    _edgeNodeSeparator: function()
    {
        return " :: ";
    },

    __proto__: WebInspector.HeapSnapshotGenericObjectNode.prototype
}

/**
 * @constructor
 * @extends {WebInspector.HeapSnapshotObjectNode}
 * @param {!WebInspector.HeapSnapshotSortableDataGrid} dataGrid
 * @param {!WebInspector.HeapSnapshotProxy} snapshot
 * @param {!WebInspector.HeapSnapshotCommon.Edge} edge
 * @param {?WebInspector.HeapSnapshotRetainingObjectNode} parentRetainingObjectNode
 */
WebInspector.HeapSnapshotRetainingObjectNode = function(dataGrid, snapshot, edge, parentRetainingObjectNode)
{
    WebInspector.HeapSnapshotObjectNode.call(this, dataGrid, snapshot, edge, parentRetainingObjectNode);
}

WebInspector.HeapSnapshotRetainingObjectNode.prototype = {
    /**
     * @override
     * @return {!WebInspector.HeapSnapshotProviderProxy}
     */
    createProvider: function()
    {
        return this._snapshot.createRetainingEdgesProvider(this.snapshotNodeIndex);
    },

    /**
     * @override
     * @param {!WebInspector.HeapSnapshotCommon.Edge} item
     * @return {!WebInspector.HeapSnapshotRetainingObjectNode}
     */
    _createChildNode: function(item)
    {
        return new WebInspector.HeapSnapshotRetainingObjectNode(this._dataGrid, this._snapshot, item, this);
    },

    /**
     * @override
     * @return {string}
     */
    _edgeNodeSeparator: function()
    {
        return " in ";
    },

    expand: function()
    {
        this._expandRetainersChain(20);
    },

    /**
     * @param {number} maxExpandLevels
     */
    _expandRetainersChain: function(maxExpandLevels)
    {
        /**
         * @this {!WebInspector.HeapSnapshotRetainingObjectNode}
         */
        function populateComplete()
        {
            this.removeEventListener(WebInspector.HeapSnapshotGridNode.Events.PopulateComplete, populateComplete, this);
            this._expandRetainersChain(maxExpandLevels);
        }

        if (!this._populated) {
            this.addEventListener(WebInspector.HeapSnapshotGridNode.Events.PopulateComplete, populateComplete, this);
            this.populate();
            return;
        }
        WebInspector.HeapSnapshotGenericObjectNode.prototype.expand.call(this);
        if (--maxExpandLevels > 0 && this.children.length > 0) {
            var retainer = this.children[0];
            if (retainer._distance > 1) {
                retainer._expandRetainersChain(maxExpandLevels);
                return;
            }
        }
        this._dataGrid.dispatchEventToListeners(WebInspector.HeapSnapshotRetainmentDataGrid.Events.ExpandRetainersComplete);
    },

    __proto__: WebInspector.HeapSnapshotObjectNode.prototype
}

/**
 * @constructor
 * @extends {WebInspector.HeapSnapshotGenericObjectNode}
 * @param {!WebInspector.HeapSnapshotSortableDataGrid} dataGrid
 * @param {!WebInspector.HeapSnapshotProxy} snapshot
 * @param {!WebInspector.HeapSnapshotCommon.Node} node
 * @param {boolean} isDeletedNode
 */
WebInspector.HeapSnapshotInstanceNode = function(dataGrid, snapshot, node, isDeletedNode)
{
    WebInspector.HeapSnapshotGenericObjectNode.call(this, dataGrid, node);
    this._baseSnapshotOrSnapshot = snapshot;
    this._isDeletedNode = isDeletedNode;
    this.updateHasChildren();

    var data = this.data;
    data["count"] = "";
    data["countDelta"] = "";
    data["sizeDelta"] = "";
    if (this._isDeletedNode) {
        data["addedCount"] = "";
        data["addedSize"] = "";
        data["removedCount"] = "\u2022";
        data["removedSize"] = Number.withThousandsSeparator(this._shallowSize);
    } else {
        data["addedCount"] = "\u2022";
        data["addedSize"] = Number.withThousandsSeparator(this._shallowSize);
        data["removedCount"] = "";
        data["removedSize"] = "";
    }
};

WebInspector.HeapSnapshotInstanceNode.prototype = {
    /**
     * @override
     * @return {?{snapshot:!WebInspector.HeapSnapshotProxy, snapshotNodeIndex:number}}
     */
    retainersDataSource: function()
    {
        return {snapshot: this._baseSnapshotOrSnapshot, snapshotNodeIndex: this.snapshotNodeIndex};
    },

    /**
     * @override
     * @return {!WebInspector.HeapSnapshotProviderProxy}
     */
    createProvider: function()
    {
        return this._baseSnapshotOrSnapshot.createEdgesProvider(this.snapshotNodeIndex);
    },

    /**
     * @param {!WebInspector.HeapSnapshotCommon.Edge} item
     * @return {!WebInspector.HeapSnapshotObjectNode}
     */
    _createChildNode: function(item)
    {
        return new WebInspector.HeapSnapshotObjectNode(this._dataGrid, this._baseSnapshotOrSnapshot, item, null);
    },

    /**
     * @param {!WebInspector.HeapSnapshotCommon.Edge} edge
     * @return {number}
     */
    _childHashForEntity: function(edge)
    {
        return edge.edgeIndex;
    },

    /**
     * @param {!WebInspector.HeapSnapshotObjectNode} childNode
     * @return {number}
     */
    _childHashForNode: function(childNode)
    {
        return childNode._edgeIndex;
    },

    /**
     * @return {!WebInspector.HeapSnapshotCommon.ComparatorConfig}
     */
    comparator: function()
    {
        var sortAscending = this._dataGrid.isSortOrderAscending();
        var sortColumnIdentifier = this._dataGrid.sortColumnIdentifier();
        var sortFields = {
            object: ["!edgeName", sortAscending, "retainedSize", false],
            distance: ["distance", sortAscending, "retainedSize", false],
            count: ["!edgeName", true, "retainedSize", false],
            addedSize: ["selfSize", sortAscending, "!edgeName", true],
            removedSize: ["selfSize", sortAscending, "!edgeName", true],
            shallowSize: ["selfSize", sortAscending, "!edgeName", true],
            retainedSize: ["retainedSize", sortAscending, "!edgeName", true]
        }[sortColumnIdentifier] || ["!edgeName", true, "retainedSize", false];
        return WebInspector.HeapSnapshotGridNode.createComparator(sortFields);
    },

    __proto__: WebInspector.HeapSnapshotGenericObjectNode.prototype
}

/**
 * @constructor
 * @param {!WebInspector.HeapSnapshotConstructorsDataGrid} dataGrid
 * @param {string} className
 * @param {!WebInspector.HeapSnapshotCommon.Aggregate} aggregate
 * @param {!WebInspector.HeapSnapshotCommon.NodeFilter} nodeFilter
 * @extends {WebInspector.HeapSnapshotGridNode}
 */
WebInspector.HeapSnapshotConstructorNode = function(dataGrid, className, aggregate, nodeFilter)
{
    WebInspector.HeapSnapshotGridNode.call(this, dataGrid, aggregate.count > 0);
    this._name = className;
    this._nodeFilter = nodeFilter;
    this._distance = aggregate.distance;
    this._count = aggregate.count;
    this._shallowSize = aggregate.self;
    this._retainedSize = aggregate.maxRet;

    var snapshot = dataGrid.snapshot;
    var countPercent = this._count / snapshot.nodeCount * 100.0;
    var retainedSizePercent = this._retainedSize / snapshot.totalSize * 100.0;
    var shallowSizePercent = this._shallowSize / snapshot.totalSize * 100.0;

    this.data = {
        "object": className,
        "count": Number.withThousandsSeparator(this._count),
        "distance": this._toUIDistance(this._distance),
        "shallowSize": Number.withThousandsSeparator(this._shallowSize),
        "retainedSize": Number.withThousandsSeparator(this._retainedSize),
        "count-percent": this._toPercentString(countPercent),
        "shallowSize-percent": this._toPercentString(shallowSizePercent),
        "retainedSize-percent": this._toPercentString(retainedSizePercent)
    };
}

WebInspector.HeapSnapshotConstructorNode.prototype = {
    /**
     * @override
     * @return {!WebInspector.HeapSnapshotProviderProxy}
     */
    createProvider: function()
    {
        return this._dataGrid.snapshot.createNodesProviderForClass(this._name, this._nodeFilter)
    },

    /**
     * @param {number} snapshotObjectId
     * @return {!Promise<!Array<!WebInspector.HeapSnapshotGridNode>>}
     */
    populateNodeBySnapshotObjectId: function(snapshotObjectId)
    {
        /**
         * @this {WebInspector.HeapSnapshotConstructorNode}
         */
        function didExpand()
        {
            return this._provider().nodePosition(snapshotObjectId).then(didGetNodePosition.bind(this));
        }

        /**
         * @this {WebInspector.HeapSnapshotConstructorNode}
         * @param {number} nodePosition
         * @return {!Promise<!Array<!WebInspector.HeapSnapshotGridNode>>}
         */
        function didGetNodePosition(nodePosition)
        {
            if (nodePosition === -1) {
                this.collapse();
                return Promise.resolve([]);
            } else {
                /**
                 * @param {function(!Array<!WebInspector.HeapSnapshotGridNode>)} fulfill
                 * @this {WebInspector.HeapSnapshotConstructorNode}
                 */
                function action(fulfill)
                {
                    this._populateChildren(nodePosition, null, didPopulateChildren.bind(this, nodePosition, fulfill));
                }
                return new Promise(action.bind(this));
            }
        }

        /**
         * @this {WebInspector.HeapSnapshotConstructorNode}
         * @param {number} nodePosition
         * @param {function(!Array<!WebInspector.HeapSnapshotGridNode>)} callback
         */
        function didPopulateChildren(nodePosition, callback)
        {
            var node = /** @type {?WebInspector.HeapSnapshotGridNode} */ (this.childForPosition(nodePosition));
            callback(node ? [this, node] : []);
        }

        this._dataGrid.resetNameFilter();
        return this.expandWithoutPopulate().then(didExpand.bind(this));
    },

    /**
     * @param {string} filterValue
     * @return {boolean}
     */
    filteredOut: function(filterValue)
    {
        return this._name.toLowerCase().indexOf(filterValue) === -1;
    },

    /**
     * @override
     * @param {string} columnIdentifier
     * @return {!Element}
     */
    createCell: function(columnIdentifier)
    {
        var cell = columnIdentifier !== "object" ? this._createValueCell(columnIdentifier) : WebInspector.HeapSnapshotGridNode.prototype.createCell.call(this, columnIdentifier);
        if (this._searchMatched)
            cell.classList.add("highlight");
        return cell;
    },

    /**
     * @param {!WebInspector.HeapSnapshotCommon.Node} item
     * @return {!WebInspector.HeapSnapshotInstanceNode}
     */
    _createChildNode: function(item)
    {
        return new WebInspector.HeapSnapshotInstanceNode(this._dataGrid, this._dataGrid.snapshot, item, false);
    },

    /**
     * @return {!WebInspector.HeapSnapshotCommon.ComparatorConfig}
     */
    comparator: function()
    {
        var sortAscending = this._dataGrid.isSortOrderAscending();
        var sortColumnIdentifier = this._dataGrid.sortColumnIdentifier();
        var sortFields = {
            object: ["name", sortAscending, "id", true],
            distance: ["distance", sortAscending, "retainedSize", false],
            count: ["name", true, "id", true],
            shallowSize: ["selfSize", sortAscending, "id", true],
            retainedSize: ["retainedSize", sortAscending, "id", true]
        }[sortColumnIdentifier];
        return WebInspector.HeapSnapshotGridNode.createComparator(sortFields);
    },

    /**
     * @param {!WebInspector.HeapSnapshotCommon.Node} node
     * @return {number}
     */
    _childHashForEntity: function(node)
    {
        return node.id;
    },

    /**
     * @param {!WebInspector.HeapSnapshotInstanceNode} childNode
     * @return {number}
     */
    _childHashForNode: function(childNode)
    {
        return childNode.snapshotNodeId;
    },

    __proto__: WebInspector.HeapSnapshotGridNode.prototype
}


/**
 * @constructor
 * @implements {WebInspector.HeapSnapshotGridNode.ChildrenProvider}
 * @param {!WebInspector.HeapSnapshotProviderProxy} addedNodesProvider
 * @param {!WebInspector.HeapSnapshotProviderProxy} deletedNodesProvider
 * @param {number} addedCount
 * @param {number} removedCount
 */
WebInspector.HeapSnapshotDiffNodesProvider = function(addedNodesProvider, deletedNodesProvider, addedCount, removedCount)
{
    this._addedNodesProvider = addedNodesProvider;
    this._deletedNodesProvider = deletedNodesProvider;
    this._addedCount = addedCount;
    this._removedCount = removedCount;
}

WebInspector.HeapSnapshotDiffNodesProvider.prototype = {
    /**
     * @override
     */
    dispose: function()
    {
        this._addedNodesProvider.dispose();
        this._deletedNodesProvider.dispose();
    },

    /**
     * @override
     * @param {number} snapshotObjectId
     * @return {!Promise<number>}
     */
    nodePosition: function(snapshotObjectId)
    {
        throw new Error("Unreachable");
    },

    /**
     * @override
     * @param {function(boolean)} callback
     */
    isEmpty: function(callback)
    {
        callback(false);
    },

    /**
     * @override
     * @param {number} beginPosition
     * @param {number} endPosition
     * @param {function(!WebInspector.HeapSnapshotCommon.ItemsRange)} callback
     */
    serializeItemsRange: function(beginPosition, endPosition, callback)
    {
        /**
         * @param {!WebInspector.HeapSnapshotCommon.ItemsRange} items
         * @this {WebInspector.HeapSnapshotDiffNodesProvider}
         */
        function didReceiveAllItems(items)
        {
            items.totalLength = this._addedCount + this._removedCount;
            callback(items);
        }

        /**
         * @param {!WebInspector.HeapSnapshotCommon.ItemsRange} addedItems
         * @param {!WebInspector.HeapSnapshotCommon.ItemsRange} itemsRange
         * @this {WebInspector.HeapSnapshotDiffNodesProvider}
         */
        function didReceiveDeletedItems(addedItems, itemsRange)
        {
            var items = itemsRange.items;
            if (!addedItems.items.length)
                addedItems.startPosition = this._addedCount + itemsRange.startPosition;
            for (var i = 0; i < items.length; i++) {
                items[i].isAddedNotRemoved = false;
                addedItems.items.push(items[i]);
            }
            addedItems.endPosition = this._addedCount + itemsRange.endPosition;
            didReceiveAllItems.call(this, addedItems);
        }

        /**
         * @param {!WebInspector.HeapSnapshotCommon.ItemsRange} itemsRange
         * @this {WebInspector.HeapSnapshotDiffNodesProvider}
         */
        function didReceiveAddedItems(itemsRange)
        {
            var items = itemsRange.items;
            for (var i = 0; i < items.length; i++)
                items[i].isAddedNotRemoved = true;
            if (itemsRange.endPosition < endPosition)
                return this._deletedNodesProvider.serializeItemsRange(0, endPosition - itemsRange.endPosition, didReceiveDeletedItems.bind(this, itemsRange));

            itemsRange.totalLength = this._addedCount + this._removedCount;
            didReceiveAllItems.call(this, itemsRange);
        }

        if (beginPosition < this._addedCount) {
            this._addedNodesProvider.serializeItemsRange(beginPosition, endPosition, didReceiveAddedItems.bind(this));
        } else {
            var emptyRange = new WebInspector.HeapSnapshotCommon.ItemsRange(0, 0, 0, []);
            this._deletedNodesProvider.serializeItemsRange(beginPosition - this._addedCount, endPosition - this._addedCount, didReceiveDeletedItems.bind(this, emptyRange));
        }
    },

    /**
     * @override
     * @param {!WebInspector.HeapSnapshotCommon.ComparatorConfig} comparator
     * @return {!Promise<?>}
     */
    sortAndRewind: function(comparator)
    {
        /**
         * @this {WebInspector.HeapSnapshotDiffNodesProvider}
         * @return {!Promise<?>}
         */
        function afterSort()
        {
            return this._deletedNodesProvider.sortAndRewind(comparator);
        }
        return this._addedNodesProvider.sortAndRewind(comparator).then(afterSort.bind(this));
    }
};

/**
 * @constructor
 * @param {!WebInspector.HeapSnapshotDiffDataGrid} dataGrid
 * @param {string} className
 * @param {!WebInspector.HeapSnapshotCommon.DiffForClass} diffForClass
 * @extends {WebInspector.HeapSnapshotGridNode}
 */
WebInspector.HeapSnapshotDiffNode = function(dataGrid, className, diffForClass)
{
    WebInspector.HeapSnapshotGridNode.call(this, dataGrid, true);
    this._name = className;
    this._addedCount = diffForClass.addedCount;
    this._removedCount = diffForClass.removedCount;
    this._countDelta = diffForClass.countDelta;
    this._addedSize = diffForClass.addedSize;
    this._removedSize = diffForClass.removedSize;
    this._sizeDelta = diffForClass.sizeDelta;
    this._deletedIndexes = diffForClass.deletedIndexes;
    this.data = {
        "object": className,
        "addedCount": Number.withThousandsSeparator(this._addedCount),
        "removedCount": Number.withThousandsSeparator(this._removedCount),
        "countDelta":  this._signForDelta(this._countDelta) + Number.withThousandsSeparator(Math.abs(this._countDelta)),
        "addedSize": Number.withThousandsSeparator(this._addedSize),
        "removedSize": Number.withThousandsSeparator(this._removedSize),
        "sizeDelta": this._signForDelta(this._sizeDelta) + Number.withThousandsSeparator(Math.abs(this._sizeDelta))
    };
}

WebInspector.HeapSnapshotDiffNode.prototype = {
    /**
     * @override
     * @return {!WebInspector.HeapSnapshotDiffNodesProvider}
     */
    createProvider: function()
    {
        var tree = this._dataGrid;
        return new WebInspector.HeapSnapshotDiffNodesProvider(
            tree.snapshot.createAddedNodesProvider(tree.baseSnapshot.uid, this._name),
            tree.baseSnapshot.createDeletedNodesProvider(this._deletedIndexes),
            this._addedCount,
            this._removedCount);
    },

    /**
     * @override
     * @param {string} columnIdentifier
     * @return {!Element}
     */
    createCell: function(columnIdentifier)
    {
        var cell = WebInspector.HeapSnapshotGridNode.prototype.createCell.call(this, columnIdentifier);
        if (columnIdentifier !== "object")
            cell.classList.add("numeric-column");
        return cell;
    },

    /**
     * @param {!WebInspector.HeapSnapshotCommon.Node} item
     * @return {!WebInspector.HeapSnapshotInstanceNode}
     */
    _createChildNode: function(item)
    {
        if (item.isAddedNotRemoved)
            return new WebInspector.HeapSnapshotInstanceNode(this._dataGrid, this._dataGrid.snapshot, item, false);
        else
            return new WebInspector.HeapSnapshotInstanceNode(this._dataGrid, this._dataGrid.baseSnapshot, item, true);
    },

    /**
     * @param {!WebInspector.HeapSnapshotCommon.Node} node
     * @return {number}
     */
    _childHashForEntity: function(node)
    {
        return node.id;
    },

    /**
     * @param {!WebInspector.HeapSnapshotInstanceNode} childNode
     * @return {number}
     */
    _childHashForNode: function(childNode)
    {
        return childNode.snapshotNodeId;
    },

    /**
     * @return {!WebInspector.HeapSnapshotCommon.ComparatorConfig}
     */
    comparator: function()
    {
        var sortAscending = this._dataGrid.isSortOrderAscending();
        var sortColumnIdentifier = this._dataGrid.sortColumnIdentifier();
        var sortFields = {
            object: ["name", sortAscending, "id", true],
            addedCount: ["name", true, "id", true],
            removedCount: ["name", true, "id", true],
            countDelta: ["name", true, "id", true],
            addedSize: ["selfSize", sortAscending, "id", true],
            removedSize: ["selfSize", sortAscending, "id", true],
            sizeDelta: ["selfSize", sortAscending, "id", true]
        }[sortColumnIdentifier];
        return WebInspector.HeapSnapshotGridNode.createComparator(sortFields);
    },

    /**
     * @param {string} filterValue
     * @return {boolean}
     */
    filteredOut: function(filterValue)
    {
        return this._name.toLowerCase().indexOf(filterValue) === -1;
    },

    _signForDelta: function(delta)
    {
        if (delta === 0)
            return "";
        if (delta > 0)
            return "+";
        else
            return "\u2212";  // Math minus sign, same width as plus.
    },

    __proto__: WebInspector.HeapSnapshotGridNode.prototype
}


/**
 * @constructor
 * @extends {WebInspector.HeapSnapshotGridNode}
 * @param {!WebInspector.AllocationDataGrid} dataGrid
 * @param {!WebInspector.HeapSnapshotCommon.SerializedAllocationNode} data
 */
WebInspector.AllocationGridNode = function(dataGrid, data)
{
    WebInspector.HeapSnapshotGridNode.call(this, dataGrid, data.hasChildren);
    this._populated = false;
    this._allocationNode = data;
    this.data = {
        "liveCount": Number.withThousandsSeparator(data.liveCount),
        "count": Number.withThousandsSeparator(data.count),
        "liveSize": Number.withThousandsSeparator(data.liveSize),
        "size": Number.withThousandsSeparator(data.size),
        "name": data.name
    };
}

WebInspector.AllocationGridNode.prototype = {
    populate: function()
    {
        if (this._populated)
            return;
        this._populated = true;
        this._dataGrid.snapshot.allocationNodeCallers(this._allocationNode.id, didReceiveCallers.bind(this));

        /**
         * @param {!WebInspector.HeapSnapshotCommon.AllocationNodeCallers} callers
         * @this {WebInspector.AllocationGridNode}
         */
        function didReceiveCallers(callers)
        {
            var callersChain = callers.nodesWithSingleCaller;
            var parentNode = this;
            var dataGrid = /** @type {!WebInspector.AllocationDataGrid} */ (this._dataGrid);
            for (var i = 0; i < callersChain.length; i++) {
                var child = new WebInspector.AllocationGridNode(dataGrid, callersChain[i]);
                dataGrid.appendNode(parentNode, child);
                parentNode = child;
                parentNode._populated = true;
                if (this.expanded)
                    parentNode.expand();
            }

            var callersBranch = callers.branchingCallers;
            callersBranch.sort(this._dataGrid._createComparator());
            for (var i = 0; i < callersBranch.length; i++)
                dataGrid.appendNode(parentNode, new WebInspector.AllocationGridNode(dataGrid, callersBranch[i]));
            dataGrid.updateVisibleNodes(true);
        }
    },

    /**
     * @override
     */
    expand: function()
    {
        WebInspector.HeapSnapshotGridNode.prototype.expand.call(this);
        if (this.children.length === 1)
            this.children[0].expand();
    },

    /**
     * @override
     * @param {string} columnIdentifier
     * @return {!Element}
     */
    createCell: function(columnIdentifier)
    {
        if (columnIdentifier !== "name")
            return this._createValueCell(columnIdentifier);

        var cell = WebInspector.HeapSnapshotGridNode.prototype.createCell.call(this, columnIdentifier);
        var allocationNode = this._allocationNode;
        var target = this._dataGrid.target();
        if (allocationNode.scriptId) {
            var linkifier = this._dataGrid._linkifier;
            var urlElement = linkifier.linkifyScriptLocation(target, String(allocationNode.scriptId), allocationNode.scriptName, allocationNode.line - 1, allocationNode.column - 1, "profile-node-file");
            urlElement.style.maxWidth = "75%";
            cell.insertBefore(urlElement, cell.firstChild);
        }
        return cell;
    },

    /**
     * @return {number}
     */
    allocationNodeId: function()
    {
        return this._allocationNode.id;
    },

    __proto__: WebInspector.HeapSnapshotGridNode.prototype
}
