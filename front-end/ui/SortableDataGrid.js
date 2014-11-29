// Copyright 2014 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

/**
 * @constructor
 * @extends {WebInspector.ViewportDataGrid}
 * @param {!Array.<!WebInspector.DataGrid.ColumnDescriptor>} columnsArray
 * @param {function(!WebInspector.DataGridNode, string, string, string)=} editCallback
 * @param {function(!WebInspector.DataGridNode)=} deleteCallback
 * @param {function()=} refreshCallback
 * @param {function(!WebInspector.ContextMenu, !WebInspector.DataGridNode)=} contextMenuCallback
 */
WebInspector.SortableDataGrid = function(columnsArray, editCallback, deleteCallback, refreshCallback, contextMenuCallback)
{
    WebInspector.ViewportDataGrid.call(this, columnsArray, editCallback, deleteCallback, refreshCallback, contextMenuCallback);
    /** @type {!WebInspector.SortableDataGrid.NodeComparator} */
    this._sortingFunction = WebInspector.SortableDataGrid.TrivialComparator;
    this.setRootNode(new WebInspector.SortableDataGridNode());
}

/** @typedef {function(!WebInspector.DataGridNode, !WebInspector.DataGridNode):number} */
WebInspector.SortableDataGrid.NodeComparator;

/**
 * @param {!WebInspector.DataGridNode} a
 * @param {!WebInspector.DataGridNode} b
 * @return {number}
 */
WebInspector.SortableDataGrid.TrivialComparator = function(a, b)
{
    return 0;
}

/**
 * @param {string} columnIdentifier
 * @param {!WebInspector.DataGridNode} a
 * @param {!WebInspector.DataGridNode} b
 * @return {number}
 */
WebInspector.SortableDataGrid.NumericComparator = function(columnIdentifier, a, b)
{
    var aValue = a.data[columnIdentifier];
    var bValue = b.data[columnIdentifier];
    var aNumber = Number(aValue instanceof Node ? aValue.textContent : aValue);
    var bNumber = Number(bValue instanceof Node ? bValue.textContent : bValue);
    return aNumber < bNumber ? -1 : (aNumber > bNumber ? 1 : 0);
}

/**
 * @param {string} columnIdentifier
 * @param {!WebInspector.DataGridNode} a
 * @param {!WebInspector.DataGridNode} b
 * @return {number}
 */
WebInspector.SortableDataGrid.StringComparator = function(columnIdentifier, a, b)
{
    var aValue = a.data[columnIdentifier];
    var bValue = b.data[columnIdentifier];
    var aString = aValue instanceof Node ? aValue.textContent : String(aValue);
    var bString = bValue instanceof Node ? bValue.textContent : String(bValue);
    return aString < bString ? -1 : (aString > bString ? 1 : 0);
}

/**
 * @param {!WebInspector.SortableDataGrid.NodeComparator} comparator
 * @param {boolean} reverseMode
 * @param {!WebInspector.DataGridNode} a
 * @param {!WebInspector.DataGridNode} b
 * @return {number}
 */
WebInspector.SortableDataGrid.Comparator = function(comparator, reverseMode, a, b)
{
    return reverseMode ? comparator(b, a) : comparator(a, b);
}

/**
 * @param {!Array.<string>} columnNames
 * @param {!Array.<string>} values
 * @return {?WebInspector.SortableDataGrid}
 */
WebInspector.SortableDataGrid.create = function(columnNames, values)
{
    var numColumns = columnNames.length;
    if (!numColumns)
        return null;

    var columns = [];
    for (var i = 0; i < columnNames.length; ++i)
        columns.push({ title: columnNames[i], width: columnNames[i].length, sortable: true });

    var nodes = [];
    for (var i = 0; i < values.length / numColumns; ++i) {
        var data = {};
        for (var j = 0; j < columnNames.length; ++j)
            data[j] = values[numColumns * i + j];

        var node = new WebInspector.SortableDataGridNode(data);
        node.selectable = false;
        nodes.push(node);
    }

    var dataGrid = new WebInspector.SortableDataGrid(columns);
    var length = nodes.length;
    var rootNode = dataGrid.rootNode();
    for (var i = 0; i < length; ++i)
        rootNode.appendChild(nodes[i]);

    dataGrid.addEventListener(WebInspector.DataGrid.Events.SortingChanged, sortDataGrid);

    function sortDataGrid()
    {
        var nodes = dataGrid.rootNode().children;
        var sortColumnIdentifier = dataGrid.sortColumnIdentifier();
        if (!sortColumnIdentifier)
            return;

        var columnIsNumeric = true;
        for (var i = 0; i < nodes.length; i++) {
            var value = nodes[i].data[sortColumnIdentifier];
            if (isNaN(value instanceof Node ? value.textContent : value)) {
                columnIsNumeric = false;
                break;
            }
        }

        var comparator = columnIsNumeric ? WebInspector.SortableDataGrid.NumericComparator : WebInspector.SortableDataGrid.StringComparator;
        dataGrid.sortNodes(comparator.bind(null, sortColumnIdentifier), !dataGrid.isSortOrderAscending());
    }
    return dataGrid;
}

WebInspector.SortableDataGrid.prototype = {
    /**
     * @param {!WebInspector.DataGridNode} node
     */
    insertChild: function(node)
    {
        var parentNode = this.rootNode();
        parentNode.insertChild(node, parentNode.children.upperBound(node, this._sortingFunction));
    },

    /**
     * @param {!WebInspector.SortableDataGrid.NodeComparator} comparator
     * @param {boolean} reverseMode
     */
    sortNodes: function(comparator, reverseMode)
    {
        this._sortingFunction = WebInspector.SortableDataGrid.Comparator.bind(null, comparator, reverseMode);
        var children = this._rootNode.children;
        children.sort(this._sortingFunction);
        for (var i = 0; i < children.length; ++i)
            children[i].recalculateSiblings(i);
        this.scheduleUpdate();
    },

    __proto__: WebInspector.ViewportDataGrid.prototype
}

/**
 * @constructor
 * @extends {WebInspector.ViewportDataGridNode}
 * @param {?Object.<string, *>=} data
 */
WebInspector.SortableDataGridNode = function(data)
{
    WebInspector.ViewportDataGridNode.call(this, data);
}

WebInspector.SortableDataGridNode.prototype = {
    __proto__: WebInspector.ViewportDataGridNode.prototype
}
