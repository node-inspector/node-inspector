/*
 * Copyright (C) 2008 Apple Inc. All Rights Reserved.
 *
 * Redistribution and use in source and binary forms, with or without
 * modification, are permitted provided that the following conditions
 * are met:
 * 1. Redistributions of source code must retain the above copyright
 *        notice, this list of conditions and the following disclaimer.
 * 2. Redistributions in binary form must reproduce the above copyright
 *        notice, this list of conditions and the following disclaimer in the
 *        documentation and/or other materials provided with the distribution.
 *
 * THIS SOFTWARE IS PROVIDED BY APPLE INC. ``AS IS'' AND ANY
 * EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE
 * IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR
 * PURPOSE ARE DISCLAIMED.         IN NO EVENT SHALL APPLE INC. OR
 * CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL,
 * EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO,
 * PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR
 * PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY
 * OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT
 * (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE
 * OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
 */

/**
 * @constructor
 * @extends {WebInspector.View}
 * @param {!Array.<!WebInspector.DataGrid.ColumnDescriptor>} columnsArray
 * @param {function(!WebInspector.DataGridNode, string, string, string)=} editCallback
 * @param {function(!WebInspector.DataGridNode)=} deleteCallback
 * @param {function()=} refreshCallback
 * @param {function(!WebInspector.ContextMenu, !WebInspector.DataGridNode)=} contextMenuCallback
 */
WebInspector.DataGrid = function(columnsArray, editCallback, deleteCallback, refreshCallback, contextMenuCallback)
{
    WebInspector.View.call(this);
    this.registerRequiredCSS("ui/dataGrid.css");

    this.element.className = "data-grid"; // Override
    this.element.tabIndex = 0;
    this.element.addEventListener("keydown", this._keyDown.bind(this), false);

    var headerContainer = createElementWithClass("div", "header-container");
    /** @type {!Element} */
    this._headerTable = headerContainer.createChild("table", "header");
    /** @type {!Object.<string, !Element>} */
    this._headerTableHeaders = {};

    /** @type {!Element} */
    this._scrollContainer = createElementWithClass("div", "data-container");
    /** @type {!Element} */
    this._dataTable = this._scrollContainer.createChild("table", "data");

    this._dataTable.addEventListener("mousedown", this._mouseDownInDataTable.bind(this), true);
    this._dataTable.addEventListener("click", this._clickInDataTable.bind(this), true);

    this._dataTable.addEventListener("contextmenu", this._contextMenuInDataTable.bind(this), true);

    // FIXME: Add a createCallback which is different from editCallback and has different
    // behavior when creating a new node.
    if (editCallback)
        this._dataTable.addEventListener("dblclick", this._ondblclick.bind(this), false);
    /** @type {function(!WebInspector.DataGridNode, string, string, string)|undefined} */
    this._editCallback = editCallback;
    /** @type {function(!WebInspector.DataGridNode)|undefined} */
    this._deleteCallback = deleteCallback;
    /** @type {function()|undefined} */
    this._refreshCallback = refreshCallback;
    /** @type {function(!WebInspector.ContextMenu, !WebInspector.DataGridNode)|undefined} */
    this._contextMenuCallback = contextMenuCallback;

    this.element.appendChild(headerContainer);
    this.element.appendChild(this._scrollContainer);

    /** @type {!Element} */
    this._headerRow = createElement("tr");
    /** @type {!Element} */
    this._headerTableColumnGroup = createElement("colgroup");
    /** @type {!Element} */
    this._dataTableColumnGroup = createElement("colgroup");

    /** @type {!Element} */
    this._topFillerRow = createElementWithClass("tr", "revealed");
    /** @type {!Element} */
    this._bottomFillerRow = createElementWithClass("tr", "revealed");
    this.setVerticalPadding(0, 0);

    /** @type {!Array.<!WebInspector.DataGrid.ColumnDescriptor>} */
    this._columnsArray = columnsArray;
    /** @type {!Array.<!WebInspector.DataGrid.ColumnDescriptor>} */
    this._visibleColumnsArray = columnsArray;
    /** @type {!Object.<string, !WebInspector.DataGrid.ColumnDescriptor>} */
    this._columns = {};

    /** @type {?string} */
    this._cellClass = null;

    for (var i = 0; i < columnsArray.length; ++i) {
        var column = columnsArray[i];
        var columnIdentifier = column.identifier = column.id || i;
        this._columns[columnIdentifier] = column;
        if (column.disclosure)
            this.disclosureColumnIdentifier = columnIdentifier;

        var cell = createElement("th");
        cell.className = columnIdentifier + "-column";
        cell.columnIdentifier = columnIdentifier;
        this._headerTableHeaders[columnIdentifier] = cell;

        var div = createElement("div");
        if (column.titleDOMFragment)
            div.appendChild(column.titleDOMFragment);
        else
            div.textContent = column.title;
        cell.appendChild(div);

        if (column.sort) {
            cell.classList.add(column.sort);
            this._sortColumnCell = cell;
        }

        if (column.sortable) {
            cell.addEventListener("click", this._clickInHeaderCell.bind(this), false);
            cell.classList.add("sortable");
            cell.createChild("div", "sort-order-icon-container").createChild("div", "sort-order-icon");
        }
    }

    this._headerTable.appendChild(this._headerTableColumnGroup);
    this.headerTableBody.appendChild(this._headerRow);

    this._dataTable.appendChild(this._dataTableColumnGroup);
    this.dataTableBody.appendChild(this._topFillerRow);
    this.dataTableBody.appendChild(this._bottomFillerRow);

    this._refreshHeader();

    /** @type {boolean} */
    this._editing = false;
    /** @type {?WebInspector.DataGridNode} */
    this.selectedNode = null;
    /** @type {boolean} */
    this.expandNodesWhenArrowing = false;
    this.setRootNode(new WebInspector.DataGridNode());
    /** @type {number} */
    this.indentWidth = 15;
    /** @type {!Array.<!Element|{__index: number, __position: number}>} */
    this._resizers = [];
    /** @type {boolean} */
    this._columnWidthsInitialized = false;
    /** @type {number} */
    this._cornerWidth = WebInspector.DataGrid.CornerWidth;
    /** @type {!WebInspector.DataGrid.ResizeMethod} */
    this._resizeMethod = WebInspector.DataGrid.ResizeMethod.Nearest;
}

// Keep in sync with .data-grid col.corner style rule.
WebInspector.DataGrid.CornerWidth = 14;

/** @typedef {!{id: ?string, editable: boolean, longText: ?boolean, sort: !WebInspector.DataGrid.Order, sortable: boolean, align: !WebInspector.DataGrid.Align}} */
WebInspector.DataGrid.ColumnDescriptor;

WebInspector.DataGrid.Events = {
    SelectedNode: "SelectedNode",
    DeselectedNode: "DeselectedNode",
    SortingChanged: "SortingChanged",
    ColumnsResized: "ColumnsResized"
}

/** @enum {string} */
WebInspector.DataGrid.Order = {
    Ascending: "sort-ascending",
    Descending: "sort-descending"
}

/** @enum {string} */
WebInspector.DataGrid.Align = {
    Center: "center",
    Right: "right"
}

WebInspector.DataGrid.prototype = {
    /**
     * @param {string} cellClass
     */
    setCellClass: function(cellClass)
    {
        this._cellClass = cellClass;
    },

    _refreshHeader: function()
    {
        this._headerTableColumnGroup.removeChildren();
        this._dataTableColumnGroup.removeChildren();
        this._headerRow.removeChildren();
        this._topFillerRow.removeChildren();
        this._bottomFillerRow.removeChildren();

        for (var i = 0; i < this._visibleColumnsArray.length; ++i) {
            var column = this._visibleColumnsArray[i];
            var columnIdentifier = column.identifier;
            var headerColumn = this._headerTableColumnGroup.createChild("col");
            var dataColumn = this._dataTableColumnGroup.createChild("col");
            if (column.width) {
                headerColumn.style.width = column.width;
                dataColumn.style.width = column.width;
            }
            this._headerRow.appendChild(this._headerTableHeaders[columnIdentifier]);
            this._topFillerRow.createChild("td", "top-filler-td");
            this._bottomFillerRow.createChild("td", "bottom-filler-td");
        }

        this._headerRow.createChild("th", "corner");
        this._topFillerRow.createChild("td", "corner").classList.add("top-filler-td");
        this._bottomFillerRow.createChild("td", "corner").classList.add("bottom-filler-td");
        this._headerTableColumnGroup.createChild("col", "corner");
        this._dataTableColumnGroup.createChild("col", "corner");
    },

    /**
     * @param {number} top
     * @param {number} bottom
     * @protected
     */
    setVerticalPadding: function(top, bottom)
    {
        this._topFillerRow.style.height = top + "px";
        if (top || bottom)
            this._bottomFillerRow.style.height = bottom + "px";
        else
            this._bottomFillerRow.style.height = "auto";
    },

    /**
     * @param {!WebInspector.DataGridNode} rootNode
     * @protected
     */
    setRootNode: function(rootNode)
    {
        if (this._rootNode) {
            this._rootNode.removeChildren();
            this._rootNode.dataGrid = null;
            this._rootNode._isRoot = false;
        }
        /** @type {!WebInspector.DataGridNode} */
        this._rootNode = rootNode;
        rootNode._isRoot = true;
        rootNode.hasChildren = false;
        rootNode._expanded = true;
        rootNode._revealed = true;
        rootNode.dataGrid = this;
    },

    /**
     * @return {!WebInspector.DataGridNode}
     */
    rootNode: function()
    {
        return this._rootNode;
    },

    _ondblclick: function(event)
    {
        if (this._editing || this._editingNode)
            return;

        var columnIdentifier = this.columnIdentifierFromNode(event.target);
        if (!columnIdentifier || !this._columns[columnIdentifier].editable)
            return;
        this._startEditing(event.target);
    },

    /**
     * @param {!WebInspector.DataGridNode} node
     * @param {number} cellIndex
     */
    _startEditingColumnOfDataGridNode: function(node, cellIndex)
    {
        this._editing = true;
        /** @type {?WebInspector.DataGridNode} */
        this._editingNode = node;
        this._editingNode.select();

        var element = this._editingNode._element.children[cellIndex];
        WebInspector.InplaceEditor.startEditing(element, this._startEditingConfig(element));
        element.window().getSelection().setBaseAndExtent(element, 0, element, 1);
    },

    _startEditing: function(target)
    {
        var element = target.enclosingNodeOrSelfWithNodeName("td");
        if (!element)
            return;

        this._editingNode = this.dataGridNodeFromNode(target);
        if (!this._editingNode) {
            if (!this.creationNode)
                return;
            this._editingNode = this.creationNode;
        }

        // Force editing the 1st column when editing the creation node
        if (this._editingNode.isCreationNode)
            return this._startEditingColumnOfDataGridNode(this._editingNode, this._nextEditableColumn(-1));

        this._editing = true;
        WebInspector.InplaceEditor.startEditing(element, this._startEditingConfig(element));

        element.window().getSelection().setBaseAndExtent(element, 0, element, 1);
    },

    renderInline: function()
    {
        this.element.classList.add("inline");
        this._cornerWidth = 0;
        this.updateWidths();
    },

    _startEditingConfig: function(element)
    {
        return new WebInspector.InplaceEditor.Config(this._editingCommitted.bind(this), this._editingCancelled.bind(this), element.textContent);
    },

    _editingCommitted: function(element, newText, oldText, context, moveDirection)
    {
        var columnIdentifier = this.columnIdentifierFromNode(element);
        if (!columnIdentifier) {
            this._editingCancelled(element);
            return;
        }
        var column = this._columns[columnIdentifier];
        var cellIndex = this._visibleColumnsArray.indexOf(column);
        var textBeforeEditing = this._editingNode.data[columnIdentifier];
        var currentEditingNode = this._editingNode;

        /**
         * @param {boolean} wasChange
         * @this {WebInspector.DataGrid}
         */
        function moveToNextIfNeeded(wasChange) {
            if (!moveDirection)
                return;

            if (moveDirection === "forward") {
                var firstEditableColumn = this._nextEditableColumn(-1);
                if (currentEditingNode.isCreationNode && cellIndex === firstEditableColumn && !wasChange)
                    return;

                var nextEditableColumn = this._nextEditableColumn(cellIndex);
                if (nextEditableColumn !== -1)
                    return this._startEditingColumnOfDataGridNode(currentEditingNode, nextEditableColumn);

                var nextDataGridNode = currentEditingNode.traverseNextNode(true, null, true);
                if (nextDataGridNode)
                    return this._startEditingColumnOfDataGridNode(nextDataGridNode, firstEditableColumn);
                if (currentEditingNode.isCreationNode && wasChange) {
                    this.addCreationNode(false);
                    return this._startEditingColumnOfDataGridNode(this.creationNode, firstEditableColumn);
                }
                return;
            }

            if (moveDirection === "backward") {
                var prevEditableColumn = this._nextEditableColumn(cellIndex, true);
                if (prevEditableColumn !== -1)
                    return this._startEditingColumnOfDataGridNode(currentEditingNode, prevEditableColumn);

                var lastEditableColumn = this._nextEditableColumn(this._visibleColumnsArray.length, true);
                var nextDataGridNode = currentEditingNode.traversePreviousNode(true, true);
                if (nextDataGridNode)
                    return this._startEditingColumnOfDataGridNode(nextDataGridNode, lastEditableColumn);
                return;
            }
        }

        if (textBeforeEditing == newText) {
            this._editingCancelled(element);
            moveToNextIfNeeded.call(this, false);
            return;
        }

        // Update the text in the datagrid that we typed
        this._editingNode.data[columnIdentifier] = newText;

        // Make the callback - expects an editing node (table row), the column number that is being edited,
        // the text that used to be there, and the new text.
        this._editCallback(this._editingNode, columnIdentifier, textBeforeEditing, newText);

        if (this._editingNode.isCreationNode)
            this.addCreationNode(false);

        this._editingCancelled(element);
        moveToNextIfNeeded.call(this, true);
    },

    _editingCancelled: function(element)
    {
        this._editing = false;
        this._editingNode = null;
    },

    /**
     * @param {number} cellIndex
     * @param {boolean=} moveBackward
     * @return {number}
     */
    _nextEditableColumn: function(cellIndex, moveBackward)
    {
        var increment = moveBackward ? -1 : 1;
        var columns = this._visibleColumnsArray;
        for (var i = cellIndex + increment; (i >= 0) && (i < columns.length); i += increment) {
            if (columns[i].editable)
                return i;
        }
        return -1;
    },

    /**
     * @return {?string}
     */
    sortColumnIdentifier: function()
    {
        if (!this._sortColumnCell)
            return null;
        return this._sortColumnCell.columnIdentifier;
    },

    /**
     * @return {?string}
     */
    sortOrder: function()
    {
        if (!this._sortColumnCell || this._sortColumnCell.classList.contains(WebInspector.DataGrid.Order.Ascending))
            return WebInspector.DataGrid.Order.Ascending;
        if (this._sortColumnCell.classList.contains(WebInspector.DataGrid.Order.Descending))
            return WebInspector.DataGrid.Order.Descending;
        return null;
    },

    /**
     * @return {boolean}
     */
    isSortOrderAscending: function()
    {
        return !this._sortColumnCell || this._sortColumnCell.classList.contains(WebInspector.DataGrid.Order.Ascending);
    },

    get headerTableBody()
    {
        if ("_headerTableBody" in this)
            return this._headerTableBody;

        this._headerTableBody = this._headerTable.getElementsByTagName("tbody")[0];
        if (!this._headerTableBody) {
            this._headerTableBody = this.element.ownerDocument.createElement("tbody");
            this._headerTable.insertBefore(this._headerTableBody, this._headerTable.tFoot);
        }

        return this._headerTableBody;
    },

    get dataTableBody()
    {
        if ("_dataTableBody" in this)
            return this._dataTableBody;

        this._dataTableBody = this._dataTable.getElementsByTagName("tbody")[0];
        if (!this._dataTableBody) {
            this._dataTableBody = this.element.ownerDocument.createElement("tbody");
            this._dataTable.insertBefore(this._dataTableBody, this._dataTable.tFoot);
        }

        return this._dataTableBody;
    },

    /**
     * @param {!Array.<number>} widths
     * @param {number} minPercent
     * @param {number=} maxPercent
     * @return {!Array.<number>}
     */
    _autoSizeWidths: function(widths, minPercent, maxPercent)
    {
        if (minPercent)
            minPercent = Math.min(minPercent, Math.floor(100 / widths.length));
        var totalWidth = 0;
        for (var i = 0; i < widths.length; ++i)
            totalWidth += widths[i];
        var totalPercentWidth = 0;
        for (var i = 0; i < widths.length; ++i) {
            var width = Math.round(100 * widths[i] / totalWidth);
            if (minPercent && width < minPercent)
                width = minPercent;
            else if (maxPercent && width > maxPercent)
                width = maxPercent;
            totalPercentWidth += width;
            widths[i] = width;
        }
        var recoupPercent = totalPercentWidth - 100;

        while (minPercent && recoupPercent > 0) {
            for (var i = 0; i < widths.length; ++i) {
                if (widths[i] > minPercent) {
                    --widths[i];
                    --recoupPercent;
                    if (!recoupPercent)
                        break;
                }
            }
        }

        while (maxPercent && recoupPercent < 0) {
            for (var i = 0; i < widths.length; ++i) {
                if (widths[i] < maxPercent) {
                    ++widths[i];
                    ++recoupPercent;
                    if (!recoupPercent)
                        break;
                }
            }
        }

        return widths;
    },

    /**
     * @param {number} minPercent
     * @param {number=} maxPercent
     * @param {number=} maxDescentLevel
     */
    autoSizeColumns: function(minPercent, maxPercent, maxDescentLevel)
    {
        var widths = [];
        for (var i = 0; i < this._columnsArray.length; ++i)
            widths.push((this._columnsArray[i].title || "").length);

        maxDescentLevel = maxDescentLevel || 0;
        var children = this._enumerateChildren(this._rootNode, [], maxDescentLevel + 1);
        for (var i = 0; i < children.length; ++i) {
            var node = children[i];
            for (var j = 0; j < this._columnsArray.length; ++j) {
                var text = node.data[this._columnsArray[j].identifier] || "";
                if (text.length > widths[j])
                    widths[j] = text.length;
            }
        }

        widths = this._autoSizeWidths(widths, minPercent, maxPercent);

        for (var i = 0; i < this._columnsArray.length; ++i)
            this._columnsArray[i].weight = widths[i];
        this._columnWidthsInitialized = false;
        this.updateWidths();
    },

    _enumerateChildren: function(rootNode, result, maxLevel)
    {
        if (!rootNode._isRoot)
            result.push(rootNode);
        if (!maxLevel)
            return;
        for (var i = 0; i < rootNode.children.length; ++i)
            this._enumerateChildren(rootNode.children[i], result, maxLevel - 1);
        return result;
    },

    onResize: function()
    {
        this.updateWidths();
    },

    // Updates the widths of the table, including the positions of the column
    // resizers.
    //
    // IMPORTANT: This function MUST be called once after the element of the
    // DataGrid is attached to its parent element and every subsequent time the
    // width of the parent element is changed in order to make it possible to
    // resize the columns.
    //
    // If this function is not called after the DataGrid is attached to its
    // parent element, then the DataGrid's columns will not be resizable.
    updateWidths: function()
    {
        var headerTableColumns = this._headerTableColumnGroup.children;

        // Use container size to avoid changes of table width caused by change of column widths.
        var tableWidth = this.element.offsetWidth - this._cornerWidth;
        var numColumns = headerTableColumns.length - 1; // Do not process corner column.

        // Do not attempt to use offsetes if we're not attached to the document tree yet.
        if (!this._columnWidthsInitialized && this.element.offsetWidth) {
            // Give all the columns initial widths now so that during a resize,
            // when the two columns that get resized get a percent value for
            // their widths, all the other columns already have percent values
            // for their widths.
            for (var i = 0; i < numColumns; i++) {
                var columnWidth = this.headerTableBody.rows[0].cells[i].offsetWidth;
                var column = this._visibleColumnsArray[i];
                if (!column.weight)
                    column.weight = 100 * columnWidth / tableWidth;
            }
            this._columnWidthsInitialized = true;
        }
        this._applyColumnWeights();
    },

    /**
     * @param {string} name
     */
    setName: function(name)
    {
        this._columnWeightsSetting = WebInspector.settings.createSetting("dataGrid-" + name + "-columnWeights", {});
        this._loadColumnWeights();
    },

    _loadColumnWeights: function()
    {
        if (!this._columnWeightsSetting)
            return;
        var weights = this._columnWeightsSetting.get();
        for (var i = 0; i < this._columnsArray.length; ++i) {
            var column = this._columnsArray[i];
            var weight = weights[column.identifier];
            if (weight)
                column.weight = weight;
        }
        this._applyColumnWeights();
    },

    _saveColumnWeights: function()
    {
        if (!this._columnWeightsSetting)
            return;
        var weights = {};
        for (var i = 0; i < this._columnsArray.length; ++i) {
            var column = this._columnsArray[i];
            weights[column.identifier] = column.weight;
        }
        this._columnWeightsSetting.set(weights);
    },

    wasShown: function()
    {
       this._loadColumnWeights();
    },

    _applyColumnWeights: function()
    {
        var tableWidth = this.element.offsetWidth - this._cornerWidth;
        if (tableWidth <= 0)
            return;

        var sumOfWeights = 0.0;
        for (var i = 0; i < this._visibleColumnsArray.length; ++i)
            sumOfWeights += this._visibleColumnsArray[i].weight;

        var sum = 0;
        var lastOffset = 0;

        for (var i = 0; i < this._visibleColumnsArray.length; ++i) {
            sum += this._visibleColumnsArray[i].weight;
            var offset = (sum * tableWidth / sumOfWeights) | 0;
            var width = (offset - lastOffset) + "px";
            this._headerTableColumnGroup.children[i].style.width = width;
            this._dataTableColumnGroup.children[i].style.width = width;
            lastOffset = offset;
        }

        this._positionResizers();
        this.dispatchEventToListeners(WebInspector.DataGrid.Events.ColumnsResized);
    },

    /**
     * @param {!Object.<string, boolean>} columnsVisibility
     */
    setColumnsVisiblity: function(columnsVisibility)
    {
        this._visibleColumnsArray = [];
        for (var i = 0; i < this._columnsArray.length; ++i) {
            var column = this._columnsArray[i];
            if (columnsVisibility[column.identifier])
                this._visibleColumnsArray.push(column);
        }
        this._refreshHeader();
        this._applyColumnWeights();
        var nodes = this._enumerateChildren(this.rootNode(), [], -1);
        for (var i = 0; i < nodes.length; ++i)
            nodes[i].refresh();
    },

    get scrollContainer()
    {
        return this._scrollContainer;
    },

    _positionResizers: function()
    {
        var headerTableColumns = this._headerTableColumnGroup.children;
        var numColumns = headerTableColumns.length - 1; // Do not process corner column.
        var left = [];
        var resizers = this._resizers;

        while (resizers.length > numColumns - 1)
            resizers.pop().remove();

        for (var i = 0; i < numColumns - 1; i++) {
            // Get the width of the cell in the first (and only) row of the
            // header table in order to determine the width of the column, since
            // it is not possible to query a column for its width.
            left[i] = (left[i-1] || 0) + this.headerTableBody.rows[0].cells[i].offsetWidth;
        }

        // Make n - 1 resizers for n columns.
        for (var i = 0; i < numColumns - 1; i++) {
            var resizer = resizers[i];
            if (!resizer) {
                // This is the first call to updateWidth, so the resizers need
                // to be created.
                resizer = createElement("div");
                resizer.__index = i;
                resizer.classList.add("data-grid-resizer");
                // This resizer is associated with the column to its right.
                WebInspector.installDragHandle(resizer, this._startResizerDragging.bind(this), this._resizerDragging.bind(this), this._endResizerDragging.bind(this), "col-resize");
                this.element.appendChild(resizer);
                resizers.push(resizer);
            }
            if (resizer.__position !== left[i]) {
                resizer.__position = left[i];
                resizer.style.left = left[i] + "px";
            }
        }
    },

    addCreationNode: function(hasChildren)
    {
        if (this.creationNode)
            this.creationNode.makeNormal();

        var emptyData = {};
        for (var column in this._columns)
            emptyData[column] = null;
        this.creationNode = new WebInspector.CreationDataGridNode(emptyData, hasChildren);
        this.rootNode().appendChild(this.creationNode);
    },

    _keyDown: function(event)
    {
        if (!this.selectedNode || event.shiftKey || event.metaKey || event.ctrlKey || this._editing)
            return;

        var handled = false;
        var nextSelectedNode;
        if (event.keyIdentifier === "Up" && !event.altKey) {
            nextSelectedNode = this.selectedNode.traversePreviousNode(true);
            while (nextSelectedNode && !nextSelectedNode.selectable)
                nextSelectedNode = nextSelectedNode.traversePreviousNode(true);
            handled = nextSelectedNode ? true : false;
        } else if (event.keyIdentifier === "Down" && !event.altKey) {
            nextSelectedNode = this.selectedNode.traverseNextNode(true);
            while (nextSelectedNode && !nextSelectedNode.selectable)
                nextSelectedNode = nextSelectedNode.traverseNextNode(true);
            handled = nextSelectedNode ? true : false;
        } else if (event.keyIdentifier === "Left") {
            if (this.selectedNode.expanded) {
                if (event.altKey)
                    this.selectedNode.collapseRecursively();
                else
                    this.selectedNode.collapse();
                handled = true;
            } else if (this.selectedNode.parent && !this.selectedNode.parent._isRoot) {
                handled = true;
                if (this.selectedNode.parent.selectable) {
                    nextSelectedNode = this.selectedNode.parent;
                    handled = nextSelectedNode ? true : false;
                } else if (this.selectedNode.parent)
                    this.selectedNode.parent.collapse();
            }
        } else if (event.keyIdentifier === "Right") {
            if (!this.selectedNode.revealed) {
                this.selectedNode.reveal();
                handled = true;
            } else if (this.selectedNode.hasChildren) {
                handled = true;
                if (this.selectedNode.expanded) {
                    nextSelectedNode = this.selectedNode.children[0];
                    handled = nextSelectedNode ? true : false;
                } else {
                    if (event.altKey)
                        this.selectedNode.expandRecursively();
                    else
                        this.selectedNode.expand();
                }
            }
        } else if (event.keyCode === 8 || event.keyCode === 46) {
            if (this._deleteCallback) {
                handled = true;
                this._deleteCallback(this.selectedNode);
                this.changeNodeAfterDeletion();
            }
        } else if (isEnterKey(event)) {
            if (this._editCallback) {
                handled = true;
                this._startEditing(this.selectedNode._element.children[this._nextEditableColumn(-1)]);
            }
        }

        if (nextSelectedNode) {
            nextSelectedNode.reveal();
            nextSelectedNode.select();
        }

        if (handled)
            event.consume(true);
    },

    changeNodeAfterDeletion: function()
    {
        var nextSelectedNode = this.selectedNode.traverseNextNode(true);
        while (nextSelectedNode && !nextSelectedNode.selectable)
            nextSelectedNode = nextSelectedNode.traverseNextNode(true);

        if (!nextSelectedNode || nextSelectedNode.isCreationNode) {
            nextSelectedNode = this.selectedNode.traversePreviousNode(true);
            while (nextSelectedNode && !nextSelectedNode.selectable)
                nextSelectedNode = nextSelectedNode.traversePreviousNode(true);
        }

        if (nextSelectedNode) {
            nextSelectedNode.reveal();
            nextSelectedNode.select();
        }
    },

    /**
     * @param {!Node} target
     * @return {?WebInspector.DataGridNode}
     */
    dataGridNodeFromNode: function(target)
    {
        var rowElement = target.enclosingNodeOrSelfWithNodeName("tr");
        return rowElement && rowElement._dataGridNode;
    },

    /**
     * @param {!Node} target
     * @return {?string}
     */
    columnIdentifierFromNode: function(target)
    {
        var cellElement = target.enclosingNodeOrSelfWithNodeName("td");
        return cellElement && cellElement.columnIdentifier_;
    },

    _clickInHeaderCell: function(event)
    {
        var cell = event.target.enclosingNodeOrSelfWithNodeName("th");
        if (!cell || (cell.columnIdentifier === undefined) || !cell.classList.contains("sortable"))
            return;

        var sortOrder = WebInspector.DataGrid.Order.Ascending;
        if ((cell === this._sortColumnCell) && this.isSortOrderAscending())
            sortOrder = WebInspector.DataGrid.Order.Descending;

        if (this._sortColumnCell)
            this._sortColumnCell.classList.remove(WebInspector.DataGrid.Order.Ascending, WebInspector.DataGrid.Order.Descending);
        this._sortColumnCell = cell;

        cell.classList.add(sortOrder);

        this.dispatchEventToListeners(WebInspector.DataGrid.Events.SortingChanged);
    },

    /**
     * @param {string} columnIdentifier
     * @param {!WebInspector.DataGrid.Order} sortOrder
     */
    markColumnAsSortedBy: function(columnIdentifier, sortOrder)
    {
        if (this._sortColumnCell)
            this._sortColumnCell.classList.remove(WebInspector.DataGrid.Order.Ascending, WebInspector.DataGrid.Order.Descending);
        this._sortColumnCell = this._headerTableHeaders[columnIdentifier];
        this._sortColumnCell.classList.add(sortOrder);
    },

    /**
     * @param {string} columnIdentifier
     * @return {!Element}
     */
    headerTableHeader: function(columnIdentifier)
    {
        return this._headerTableHeaders[columnIdentifier];
    },

    _mouseDownInDataTable: function(event)
    {
        var gridNode = this.dataGridNodeFromNode(event.target);
        if (!gridNode || !gridNode.selectable)
            return;

        if (gridNode.isEventWithinDisclosureTriangle(event))
            return;

        if (event.metaKey) {
            if (gridNode.selected)
                gridNode.deselect();
            else
                gridNode.select();
        } else
            gridNode.select();
    },

    _contextMenuInDataTable: function(event)
    {
        var contextMenu = new WebInspector.ContextMenu(event);

        var gridNode = this.dataGridNodeFromNode(event.target);
        if (this._refreshCallback && (!gridNode || gridNode !== this.creationNode))
            contextMenu.appendItem(WebInspector.UIString("Refresh"), this._refreshCallback.bind(this));

        if (gridNode && gridNode.selectable && !gridNode.isEventWithinDisclosureTriangle(event)) {
            if (this._editCallback) {
                if (gridNode === this.creationNode)
                    contextMenu.appendItem(WebInspector.UIString(WebInspector.useLowerCaseMenuTitles() ? "Add new" : "Add New"), this._startEditing.bind(this, event.target));
                else {
                    var columnIdentifier = this.columnIdentifierFromNode(event.target);
                    if (columnIdentifier && this._columns[columnIdentifier].editable)
                        contextMenu.appendItem(WebInspector.UIString("Edit \"%s\"", this._columns[columnIdentifier].title), this._startEditing.bind(this, event.target));
                }
            }
            if (this._deleteCallback && gridNode !== this.creationNode)
                contextMenu.appendItem(WebInspector.UIString("Delete"), this._deleteCallback.bind(this, gridNode));
            if (this._contextMenuCallback)
                this._contextMenuCallback(contextMenu, gridNode);
        }

        contextMenu.show();
    },

    _clickInDataTable: function(event)
    {
        var gridNode = this.dataGridNodeFromNode(event.target);
        if (!gridNode || !gridNode.hasChildren)
            return;

        if (!gridNode.isEventWithinDisclosureTriangle(event))
            return;

        if (gridNode.expanded) {
            if (event.altKey)
                gridNode.collapseRecursively();
            else
                gridNode.collapse();
        } else {
            if (event.altKey)
                gridNode.expandRecursively();
            else
                gridNode.expand();
        }
    },

    /**
     * @param {!WebInspector.DataGrid.ResizeMethod} method
     */
    setResizeMethod: function(method)
    {
        this._resizeMethod = method;
    },

    /**
     * @return {boolean}
     */
    _startResizerDragging: function(event)
    {
        this._currentResizer = event.target;
        return true;
    },

    _resizerDragging: function(event)
    {
        var resizer = this._currentResizer;
        if (!resizer)
            return;

        var tableWidth = this.element.offsetWidth; // Cache it early, before we invalidate layout.

        // Constrain the dragpoint to be within the containing div of the
        // datagrid.
        var dragPoint = event.clientX - this.element.totalOffsetLeft();
        var firstRowCells = this.headerTableBody.rows[0].cells;
        var leftEdgeOfPreviousColumn = 0;
        // Constrain the dragpoint to be within the space made up by the
        // column directly to the left and the column directly to the right.
        var leftCellIndex = resizer.__index;
        var rightCellIndex = leftCellIndex + 1;
        for (var i = 0; i < leftCellIndex; i++)
            leftEdgeOfPreviousColumn += firstRowCells[i].offsetWidth;

        // Differences for other resize methods
        if (this._resizeMethod === WebInspector.DataGrid.ResizeMethod.Last) {
            rightCellIndex = this._resizers.length;
        } else if (this._resizeMethod === WebInspector.DataGrid.ResizeMethod.First) {
            leftEdgeOfPreviousColumn += firstRowCells[leftCellIndex].offsetWidth - firstRowCells[0].offsetWidth;
            leftCellIndex = 0;
        }

        var rightEdgeOfNextColumn = leftEdgeOfPreviousColumn + firstRowCells[leftCellIndex].offsetWidth + firstRowCells[rightCellIndex].offsetWidth;

        // Give each column some padding so that they don't disappear.
        var leftMinimum = leftEdgeOfPreviousColumn + this.ColumnResizePadding;
        var rightMaximum = rightEdgeOfNextColumn - this.ColumnResizePadding;
        if (leftMinimum > rightMaximum)
            return;

        dragPoint = Number.constrain(dragPoint, leftMinimum, rightMaximum);

        var position = (dragPoint - this.CenterResizerOverBorderAdjustment);
        resizer.__position = position;
        resizer.style.left = position + "px";

        var pxLeftColumn = (dragPoint - leftEdgeOfPreviousColumn) + "px";
        this._headerTableColumnGroup.children[leftCellIndex].style.width = pxLeftColumn;
        this._dataTableColumnGroup.children[leftCellIndex].style.width = pxLeftColumn;

        var pxRightColumn = (rightEdgeOfNextColumn - dragPoint) + "px";
        this._headerTableColumnGroup.children[rightCellIndex].style.width = pxRightColumn;
        this._dataTableColumnGroup.children[rightCellIndex].style.width = pxRightColumn;

        var leftColumn = this._visibleColumnsArray[leftCellIndex];
        var rightColumn = this._visibleColumnsArray[rightCellIndex];
        if (leftColumn.weight || rightColumn.weight) {
            var sumOfWeights = leftColumn.weight + rightColumn.weight;
            var delta = rightEdgeOfNextColumn - leftEdgeOfPreviousColumn;
            leftColumn.weight = (dragPoint - leftEdgeOfPreviousColumn) * sumOfWeights / delta;
            rightColumn.weight = (rightEdgeOfNextColumn - dragPoint) * sumOfWeights / delta;
        }

        this._positionResizers();
        event.preventDefault();
        this.dispatchEventToListeners(WebInspector.DataGrid.Events.ColumnsResized);
    },

    /**
     * @param {string} columnId
     * @return {number}
     */
    columnOffset: function(columnId)
    {
        if (!this.element.offsetWidth)
            return 0;
        for (var i = 1; i < this._visibleColumnsArray.length; ++i) {
            if (columnId === this._visibleColumnsArray[i].identifier) {
                if (this._resizers[i - 1])
                    return this._resizers[i - 1].__position;
            }
        }
        return 0;
    },

    _endResizerDragging: function(event)
    {
        this._currentResizer = null;
        this._saveColumnWeights();
        this.dispatchEventToListeners(WebInspector.DataGrid.Events.ColumnsResized);
    },

    ColumnResizePadding: 24,

    CenterResizerOverBorderAdjustment: 3,

    __proto__: WebInspector.View.prototype
}

/** @enum {string} */
WebInspector.DataGrid.ResizeMethod = {
    Nearest: "nearest",
    First: "first",
    Last: "last"
}

/**
 * @constructor
 * @extends {WebInspector.Object}
 * @param {?Object.<string, *>=} data
 * @param {boolean=} hasChildren
 */
WebInspector.DataGridNode = function(data, hasChildren)
{
    /** @type {?Element} */
    this._element = null;
    /** @type {boolean} */
    this._expanded = false;
    /** @type {boolean} */
    this._selected = false;
    /** @type {number|undefined} */
    this._depth;
    /** @type {boolean|undefined} */
    this._revealed;
    /** @type {boolean} */
    this._attached = false;
    /** @type {?{parent: !WebInspector.DataGridNode, index: number}} */
    this._savedPosition = null;
    /** @type {boolean} */
    this._shouldRefreshChildren = true;
    /** @type {!Object.<string, *>} */
    this._data = data || {};
    /** @type {boolean} */
    this.hasChildren = hasChildren || false;
    /** @type {!Array.<!WebInspector.DataGridNode>} */
    this.children = [];
    /** @type {?WebInspector.DataGrid} */
    this.dataGrid = null;
    /** @type {?WebInspector.DataGridNode} */
    this.parent = null;
    /** @type {?WebInspector.DataGridNode} */
    this.previousSibling = null;
    /** @type {?WebInspector.DataGridNode} */
    this.nextSibling = null;
    /** @type {number} */
    this.disclosureToggleWidth = 10;
}

WebInspector.DataGridNode.prototype = {
    /** @type {boolean} */
    selectable: true,

    /** @type {boolean} */
    _isRoot: false,

    /**
     * @return {!Element}
     */
    element: function()
    {
        if (!this._element) {
            this.createElement();
            this.createCells();
        }
        return /** @type {!Element} */ (this._element);
    },

    /**
     * @protected
     */
    createElement: function()
    {
        this._element = createElement("tr");
        this._element._dataGridNode = this;

        if (this.hasChildren)
            this._element.classList.add("parent");
        if (this.expanded)
            this._element.classList.add("expanded");
        if (this.selected)
            this._element.classList.add("selected");
        if (this.revealed)
            this._element.classList.add("revealed");
    },

    /**
     * @protected
     */
    createCells: function()
    {
        this._element.removeChildren();
        var columnsArray = this.dataGrid._visibleColumnsArray;
        for (var i = 0; i < columnsArray.length; ++i)
            this._element.appendChild(this.createCell(columnsArray[i].identifier));
        this._element.appendChild(this._createTDWithClass("corner"));
    },

    get data()
    {
        return this._data;
    },

    set data(x)
    {
        this._data = x || {};
        this.refresh();
    },

    get revealed()
    {
        if (this._revealed !== undefined)
            return this._revealed;

        var currentAncestor = this.parent;
        while (currentAncestor && !currentAncestor._isRoot) {
            if (!currentAncestor.expanded) {
                this._revealed = false;
                return false;
            }

            currentAncestor = currentAncestor.parent;
        }

        this._revealed = true;
        return true;
    },

    set hasChildren(x)
    {
        if (this._hasChildren === x)
            return;

        this._hasChildren = x;

        if (!this._element)
            return;

        this._element.classList.toggle("parent", this._hasChildren);
        this._element.classList.toggle("expanded", this._hasChildren && this.expanded);
    },

    get hasChildren()
    {
        return this._hasChildren;
    },

    set revealed(x)
    {
        if (this._revealed === x)
            return;

        this._revealed = x;

        if (this._element)
            this._element.classList.toggle("revealed", this._revealed);

        for (var i = 0; i < this.children.length; ++i)
            this.children[i].revealed = x && this.expanded;
    },

    /**
     * @return {number}
     */
    get depth()
    {
        if (this._depth !== undefined)
            return this._depth;
        if (this.parent && !this.parent._isRoot)
            this._depth = this.parent.depth + 1;
        else
            this._depth = 0;
        return this._depth;
    },

    get leftPadding()
    {
        if (typeof this._leftPadding === "number")
            return this._leftPadding;

        this._leftPadding = this.depth * this.dataGrid.indentWidth;
        return this._leftPadding;
    },

    get shouldRefreshChildren()
    {
        return this._shouldRefreshChildren;
    },

    set shouldRefreshChildren(x)
    {
        this._shouldRefreshChildren = x;
        if (x && this.expanded)
            this.expand();
    },

    get selected()
    {
        return this._selected;
    },

    set selected(x)
    {
        if (x)
            this.select();
        else
            this.deselect();
    },

    get expanded()
    {
        return this._expanded;
    },

    /**
     * @param {boolean} x
     */
    set expanded(x)
    {
        if (x)
            this.expand();
        else
            this.collapse();
    },

    refresh: function()
    {
        if (!this.dataGrid)
            this._element = null;
        if (!this._element)
            return;
        this.createCells();
    },

    /**
     * @param {string} className
     * @return {!Element}
     */
    _createTDWithClass: function(className)
    {
        var cell = createElementWithClass("td", className);
        var cellClass = this.dataGrid._cellClass;
        if (cellClass)
            cell.classList.add(cellClass);
        return cell;
    },

    /**
     * @param {string} columnIdentifier
     * @return {!Element}
     */
    createTD: function(columnIdentifier)
    {
        var cell = this._createTDWithClass(columnIdentifier + "-column");
        cell.columnIdentifier_ = columnIdentifier;

        var alignment = this.dataGrid._columns[columnIdentifier].align;
        if (alignment)
            cell.classList.add(alignment);

        return cell;
    },

    /**
     * @param {string} columnIdentifier
     * @return {!Element}
     */
    createCell: function(columnIdentifier)
    {
        var cell = this.createTD(columnIdentifier);

        var data = this.data[columnIdentifier];
        if (data instanceof Node) {
            cell.appendChild(data);
        } else {
            cell.textContent = data;
            if (this.dataGrid._columns[columnIdentifier].longText)
                cell.title = data;
        }

        if (columnIdentifier === this.dataGrid.disclosureColumnIdentifier) {
            cell.classList.add("disclosure");
            if (this.leftPadding)
                cell.style.setProperty("padding-left", this.leftPadding + "px");
        }

        return cell;
    },

    /**
     * @return {number}
     */
    nodeSelfHeight: function()
    {
        return 16;
    },

    /**
     * @param {!WebInspector.DataGridNode} child
     */
    appendChild: function(child)
    {
        this.insertChild(child, this.children.length);
    },

    /**
     * @param {!WebInspector.DataGridNode} child
     * @param {number} index
     */
    insertChild: function(child, index)
    {
        if (!child)
            throw("insertChild: Node can't be undefined or null.");
        if (child.parent === this)
            throw("insertChild: Node is already a child of this node.");

        if (child.parent)
            child.parent.removeChild(child);

        this.children.splice(index, 0, child);
        this.hasChildren = true;

        child.parent = this;
        child.dataGrid = this.dataGrid;
        child.recalculateSiblings(index);

        child._depth = undefined;
        child._revealed = undefined;
        child._attached = false;
        child._shouldRefreshChildren = true;

        var current = child.children[0];
        while (current) {
            current.dataGrid = this.dataGrid;
            current._depth = undefined;
            current._revealed = undefined;
            current._attached = false;
            current._shouldRefreshChildren = true;
            current = current.traverseNextNode(false, child, true);
        }

        if (this.expanded)
            child._attach();
        if (!this.revealed)
            child.revealed = false;
    },

    /**
     * @param {!WebInspector.DataGridNode} child
     */
    removeChild: function(child)
    {
        if (!child)
            throw("removeChild: Node can't be undefined or null.");
        if (child.parent !== this)
            throw("removeChild: Node is not a child of this node.");

        child.deselect();
        child._detach();

        this.children.remove(child, true);

        if (child.previousSibling)
            child.previousSibling.nextSibling = child.nextSibling;
        if (child.nextSibling)
            child.nextSibling.previousSibling = child.previousSibling;

        child.dataGrid = null;
        child.parent = null;
        child.nextSibling = null;
        child.previousSibling = null;

        if (this.children.length <= 0)
            this.hasChildren = false;
    },

    removeChildren: function()
    {
        for (var i = 0; i < this.children.length; ++i) {
            var child = this.children[i];
            child.deselect();
            child._detach();

            child.dataGrid = null;
            child.parent = null;
            child.nextSibling = null;
            child.previousSibling = null;
        }

        this.children = [];
        this.hasChildren = false;
    },

    /**
     * @param {number} myIndex
     */
    recalculateSiblings: function(myIndex)
    {
        if (!this.parent)
            return;

        var previousChild = this.parent.children[myIndex - 1] || null;
        if (previousChild)
            previousChild.nextSibling = this;
        this.previousSibling = previousChild;

        var nextChild = this.parent.children[myIndex + 1] || null;
        if (nextChild)
            nextChild.previousSibling = this;
        this.nextSibling = nextChild;
    },

    collapse: function()
    {
        if (this._isRoot)
            return;
        if (this._element)
            this._element.classList.remove("expanded");

        this._expanded = false;

        for (var i = 0; i < this.children.length; ++i)
            this.children[i].revealed = false;
    },

    collapseRecursively: function()
    {
        var item = this;
        while (item) {
            if (item.expanded)
                item.collapse();
            item = item.traverseNextNode(false, this, true);
        }
    },

    populate: function() { },

    expand: function()
    {
        if (!this.hasChildren || this.expanded)
            return;
        if (this._isRoot)
            return;

        if (this.revealed && !this._shouldRefreshChildren)
            for (var i = 0; i < this.children.length; ++i)
                this.children[i].revealed = true;

        if (this._shouldRefreshChildren) {
            for (var i = 0; i < this.children.length; ++i)
                this.children[i]._detach();

            this.populate();

            if (this._attached) {
                for (var i = 0; i < this.children.length; ++i) {
                    var child = this.children[i];
                    if (this.revealed)
                        child.revealed = true;
                    child._attach();
                }
            }

            this._shouldRefreshChildren = false;
        }

        if (this._element)
            this._element.classList.add("expanded");

        this._expanded = true;
    },

    expandRecursively: function()
    {
        var item = this;
        while (item) {
            item.expand();
            item = item.traverseNextNode(false, this);
        }
    },

    reveal: function()
    {
        if (this._isRoot)
            return;
        var currentAncestor = this.parent;
        while (currentAncestor && !currentAncestor._isRoot) {
            if (!currentAncestor.expanded)
                currentAncestor.expand();
            currentAncestor = currentAncestor.parent;
        }

        this.element().scrollIntoViewIfNeeded(false);
    },

    /**
     * @param {boolean=} supressSelectedEvent
     */
    select: function(supressSelectedEvent)
    {
        if (!this.dataGrid || !this.selectable || this.selected)
            return;

        if (this.dataGrid.selectedNode)
            this.dataGrid.selectedNode.deselect();

        this._selected = true;
        this.dataGrid.selectedNode = this;

        if (this._element)
            this._element.classList.add("selected");

        if (!supressSelectedEvent)
            this.dataGrid.dispatchEventToListeners(WebInspector.DataGrid.Events.SelectedNode);
    },

    revealAndSelect: function()
    {
        if (this._isRoot)
            return;
        this.reveal();
        this.select();
    },

    /**
     * @param {boolean=} supressDeselectedEvent
     */
    deselect: function(supressDeselectedEvent)
    {
        if (!this.dataGrid || this.dataGrid.selectedNode !== this || !this.selected)
            return;

        this._selected = false;
        this.dataGrid.selectedNode = null;

        if (this._element)
            this._element.classList.remove("selected");

        if (!supressDeselectedEvent)
            this.dataGrid.dispatchEventToListeners(WebInspector.DataGrid.Events.DeselectedNode);
    },

    /**
     * @param {boolean} skipHidden
     * @param {?WebInspector.DataGridNode=} stayWithin
     * @param {boolean=} dontPopulate
     * @param {!Object=} info
     * @return {?WebInspector.DataGridNode}
     */
    traverseNextNode: function(skipHidden, stayWithin, dontPopulate, info)
    {
        if (!dontPopulate && this.hasChildren)
            this.populate();

        if (info)
            info.depthChange = 0;

        var node = (!skipHidden || this.revealed) ? this.children[0] : null;
        if (node && (!skipHidden || this.expanded)) {
            if (info)
                info.depthChange = 1;
            return node;
        }

        if (this === stayWithin)
            return null;

        node = (!skipHidden || this.revealed) ? this.nextSibling : null;
        if (node)
            return node;

        node = this;
        while (node && !node._isRoot && !((!skipHidden || node.revealed) ? node.nextSibling : null) && node.parent !== stayWithin) {
            if (info)
                info.depthChange -= 1;
            node = node.parent;
        }

        if (!node)
            return null;

        return (!skipHidden || node.revealed) ? node.nextSibling : null;
    },

    /**
     * @param {boolean} skipHidden
     * @param {boolean=} dontPopulate
     * @return {?WebInspector.DataGridNode}
     */
    traversePreviousNode: function(skipHidden, dontPopulate)
    {
        var node = (!skipHidden || this.revealed) ? this.previousSibling : null;
        if (!dontPopulate && node && node.hasChildren)
            node.populate();

        while (node && ((!skipHidden || (node.revealed && node.expanded)) ? node.children[node.children.length - 1] : null)) {
            if (!dontPopulate && node.hasChildren)
                node.populate();
            node = ((!skipHidden || (node.revealed && node.expanded)) ? node.children[node.children.length - 1] : null);
        }

        if (node)
            return node;

        if (!this.parent || this.parent._isRoot)
            return null;

        return this.parent;
    },

    /**
     * @return {boolean}
     */
    isEventWithinDisclosureTriangle: function(event)
    {
        if (!this.hasChildren)
            return false;
        var cell = event.target.enclosingNodeOrSelfWithNodeName("td");
        if (!cell.classList.contains("disclosure"))
            return false;

        var left = cell.totalOffsetLeft() + this.leftPadding;
        return event.pageX >= left && event.pageX <= left + this.disclosureToggleWidth;
    },

    _attach: function()
    {
        if (!this.dataGrid || this._attached)
            return;

        this._attached = true;

        var nextNode = null;
        var previousNode = this.traversePreviousNode(true, true);
        var previousElement = previousNode ? previousNode.element() : this.dataGrid._topFillerRow;
        this.dataGrid.dataTableBody.insertBefore(this.element(), previousElement.nextSibling);

        if (this.expanded)
            for (var i = 0; i < this.children.length; ++i)
                this.children[i]._attach();
    },

    _detach: function()
    {
        if (!this._attached)
            return;

        this._attached = false;

        if (this._element)
            this._element.remove();

        for (var i = 0; i < this.children.length; ++i)
            this.children[i]._detach();

        this.wasDetached();
    },

    wasDetached: function()
    {
    },

    savePosition: function()
    {
        if (this._savedPosition)
            return;

        if (!this.parent)
            throw("savePosition: Node must have a parent.");
        this._savedPosition = {
            parent: this.parent,
            index: this.parent.children.indexOf(this)
        };
    },

    restorePosition: function()
    {
        if (!this._savedPosition)
            return;

        if (this.parent !== this._savedPosition.parent)
            this._savedPosition.parent.insertChild(this, this._savedPosition.index);

        this._savedPosition = null;
    },

    __proto__: WebInspector.Object.prototype
}

/**
 * @constructor
 * @extends {WebInspector.DataGridNode}
 */
WebInspector.CreationDataGridNode = function(data, hasChildren)
{
    WebInspector.DataGridNode.call(this, data, hasChildren);
    /** @type {boolean} */
    this.isCreationNode = true;
}

WebInspector.CreationDataGridNode.prototype = {
    makeNormal: function()
    {
        this.isCreationNode = false;
    },

    __proto__: WebInspector.DataGridNode.prototype
}
