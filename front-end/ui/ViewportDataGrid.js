// Copyright 2014 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

/**
 * @constructor
 * @extends {WebInspector.DataGrid}
 * @param {!Array.<!WebInspector.DataGrid.ColumnDescriptor>} columnsArray
 * @param {function(!WebInspector.DataGridNode, string, string, string)=} editCallback
 * @param {function(!WebInspector.DataGridNode)=} deleteCallback
 * @param {function()=} refreshCallback
 * @param {function(!WebInspector.ContextMenu, !WebInspector.DataGridNode)=} contextMenuCallback
 */
WebInspector.ViewportDataGrid = function(columnsArray, editCallback, deleteCallback, refreshCallback, contextMenuCallback)
{
    WebInspector.DataGrid.call(this, columnsArray, editCallback, deleteCallback, refreshCallback, contextMenuCallback);
    this._scrollContainer.addEventListener("scroll", this._onScroll.bind(this), true);
    this._scrollContainer.addEventListener("mousewheel", this._onWheel.bind(this), true);
    /** @type {!Array.<!WebInspector.ViewportDataGridNode>} */
    this._visibleNodes = [];
    /** @type {boolean} */
    this._updateScheduled = false;
    /** @type {boolean} */
    this._inline = false;

    // Wheel target shouldn't be removed from DOM to preserve native kinetic scrolling.
    /** @type {?Node} */
    this._wheelTarget = null;

    // Element that was hidden earlier, but hasn't been removed yet.
    /** @type {?Node} */
    this._hiddenWheelTarget = null;

    /** @type {boolean} */
    this._stickToBottom = false;
    /** @type {boolean} */
    this._atBottom = true;
    /** @type {number} */
    this._lastScrollTop = 0;

    this.setRootNode(new WebInspector.ViewportDataGridNode());
}

WebInspector.ViewportDataGrid.prototype = {
    /**
     * @override
     */
    onResize: function()
    {
        if (this._stickToBottom && this._atBottom)
            this._scrollContainer.scrollTop = this._scrollContainer.scrollHeight - this._scrollContainer.clientHeight;
        this.scheduleUpdate();
        WebInspector.DataGrid.prototype.onResize.call(this);
    },

    /**
     * @param {boolean} stick
     */
    setStickToBottom: function(stick)
    {
        this._stickToBottom = stick;
    },

    /**
     * @param {?Event} event
     */
    _onWheel: function(event)
    {
        this._wheelTarget = event.target ? event.target.enclosingNodeOrSelfWithNodeName("tr") : null;
    },

    /**
     * @param {?Event} event
     */
    _onScroll: function(event)
    {
        this._atBottom = this._scrollContainer.isScrolledToBottom();
        if (this._lastScrollTop !== this._scrollContainer.scrollTop)
            this.scheduleUpdate();
    },

    /**
     * @protected
     */
    scheduleUpdate: function()
    {
        if (this._updateScheduled)
            return;
        this._updateScheduled = true;
        this.element.window().requestAnimationFrame(this._update.bind(this));
    },

    /**
     * @override
     */
    renderInline: function()
    {
        this._inline = true;
        WebInspector.DataGrid.prototype.renderInline.call(this);
        this._update();
    },

    /**
     * @param {number} clientHeight
     * @param {number} scrollTop
     * @return {{topPadding: number, bottomPadding: number, visibleNodes: !Array.<!WebInspector.ViewportDataGridNode>, offset: number}}
     */
    _calculateVisibleNodes: function(clientHeight, scrollTop)
    {
        var nodes = this._rootNode.children;
        if (this._inline)
            return {topPadding: 0, bottomPadding: 0, visibleNodes: nodes, offset: 0};

        var size = nodes.length;
        var i = 0;
        var y = 0;

        for (; i < size && y + nodes[i].nodeSelfHeight() < scrollTop; ++i)
            y += nodes[i].nodeSelfHeight();
        var start = i;
        var topPadding = y;

        for (; i < size && y < scrollTop + clientHeight; ++i)
            y += nodes[i].nodeSelfHeight();
        var end = i;

        var bottomPadding = 0;
        for (; i < size; ++i)
            bottomPadding += nodes[i].nodeSelfHeight();

        return {topPadding: topPadding, bottomPadding: bottomPadding, visibleNodes: nodes.slice(start, end), offset: start};
    },

    /**
     * @return {number}
     */
    _contentHeight: function()
    {
        var nodes = this._rootNode.children;
        var result = 0;
        for (var i = 0, size = nodes.length; i < size; ++i)
            result += nodes[i].nodeSelfHeight();
        return result;
    },

    _update: function()
    {
        this._updateScheduled = false;

        var clientHeight = this._scrollContainer.clientHeight;
        var scrollTop = this._scrollContainer.scrollTop;
        var currentScrollTop = scrollTop;
        var maxScrollTop = Math.max(0, this._contentHeight() - clientHeight);
        if (this._stickToBottom && this._atBottom)
            scrollTop = maxScrollTop;
        scrollTop = Math.min(maxScrollTop, scrollTop);
        this._atBottom = scrollTop === maxScrollTop;

        var viewportState = this._calculateVisibleNodes(clientHeight, scrollTop);
        var visibleNodes = viewportState.visibleNodes;
        var visibleNodesSet = Set.fromArray(visibleNodes);

        if (this._hiddenWheelTarget && this._hiddenWheelTarget !== this._wheelTarget) {
            this._hiddenWheelTarget.remove();
            this._hiddenWheelTarget = null;
        }

        for (var i = 0; i < this._visibleNodes.length; ++i) {
            var oldNode = this._visibleNodes[i];
            if (!visibleNodesSet.has(oldNode)) {
                var element = oldNode.element();
                if (element === this._wheelTarget)
                    this._hiddenWheelTarget = oldNode.abandonElement();
                else
                    element.remove();
                oldNode.wasDetached();
            }
        }

        var previousElement = this._topFillerRow;
        if (previousElement.nextSibling === this._hiddenWheelTarget)
            previousElement = this._hiddenWheelTarget;
        var tBody = this.dataTableBody;
        var offset = viewportState.offset;
        for (var i = 0; i < visibleNodes.length; ++i) {
            var node = visibleNodes[i];
            var element = node.element();
            node.willAttach();
            element.classList.toggle("odd", (offset + i) % 2 === 0);
            tBody.insertBefore(element, previousElement.nextSibling);
            previousElement = element;
        }

        this.setVerticalPadding(viewportState.topPadding, viewportState.bottomPadding);
        this._lastScrollTop = scrollTop;
        if (scrollTop !== currentScrollTop)
            this._scrollContainer.scrollTop = scrollTop;
        this._visibleNodes = visibleNodes;
    },

    /**
     * @param {!WebInspector.ViewportDataGridNode} node
     */
    _revealViewportNode: function(node)
    {
        var nodes = this._rootNode.children;
        var index = nodes.indexOf(node);
        if (index === -1)
            return;
        var fromY = 0;
        for (var i = 0; i < index; ++i)
            fromY += nodes[i].nodeSelfHeight();
        var toY = fromY + node.nodeSelfHeight();

        var scrollTop = this._scrollContainer.scrollTop;
        if (scrollTop > fromY)
            scrollTop = fromY;
        else if (scrollTop + this._scrollContainer.offsetHeight < toY)
            scrollTop = toY - this._scrollContainer.offsetHeight;
        this._scrollContainer.scrollTop = scrollTop;
    },

    __proto__: WebInspector.DataGrid.prototype
}

/**
 * @constructor
 * @extends {WebInspector.DataGridNode}
 * @param {?Object.<string, *>=} data
 */
WebInspector.ViewportDataGridNode = function(data)
{
    WebInspector.DataGridNode.call(this, data, false);
    /** @type {boolean} */
    this._stale = false;
}

WebInspector.ViewportDataGridNode.prototype = {
    /**
     * @override
     * @return {!Element}
     */
    element: function()
    {
        if (!this._element) {
            this.createElement();
            this.createCells();
            this._stale = false;
        }

        if (this._stale) {
            this.createCells();
            this._stale = false;
        }

        return /** @type {!Element} */ (this._element);
    },

    /**
     * @override
     * @param {!WebInspector.DataGridNode} child
     * @param {number} index
     */
    insertChild: function(child, index)
    {
        child.parent = this;
        child.dataGrid = this.dataGrid;
        this.children.splice(index, 0, child);
        child.recalculateSiblings(index);
        this.dataGrid.scheduleUpdate();
    },

    /**
     * @override
     * @param {!WebInspector.DataGridNode} child
     */
    removeChild: function(child)
    {
        child.deselect();
        this.children.remove(child, true);

        if (child.previousSibling)
            child.previousSibling.nextSibling = child.nextSibling;
        if (child.nextSibling)
            child.nextSibling.previousSibling = child.previousSibling;

        this.dataGrid.scheduleUpdate();
    },

    /**
     * @override
     */
    removeChildren: function()
    {
        for (var i = 0; i < this.children.length; ++i)
            this.children[i].deselect();
        this.children = [];

        this.dataGrid.scheduleUpdate();
    },

    /**
     * @override
     */
    expand: function()
    {
    },

    /**
     * @protected
     */
    willAttach: function() { },

    /**
     * @protected
     * @return {boolean}
     */
    attached: function()
    {
        return !!(this._element && this._element.parentElement);
    },

    /**
     * @override
     */
    refresh: function()
    {
        if (this.attached()) {
            this._stale = true;
            this.dataGrid.scheduleUpdate();
        } else {
            this._element = null;
        }
    },

    /**
     * @return {?Element}
     */
     abandonElement: function()
     {
        var result = this._element;
        if (result)
            result.style.display = "none";
        this._element = null;
        return result;
     },

    reveal: function()
    {
        this.dataGrid._revealViewportNode(this);
    },

    __proto__: WebInspector.DataGridNode.prototype
}
