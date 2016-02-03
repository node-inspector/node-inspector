/*
 * Copyright (C) 2012 Research In Motion Limited. All rights reserved.
 *
 * This library is free software; you can redistribute it and/or
 * modify it under the terms of the GNU Lesser General Public
 * License as published by the Free Software Foundation; either
 * version 2 of the License, or (at your option) any later version.
 *
 * This library is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the GNU
 * Lesser General Public License for more details.
 *
 * You should have received a copy of the GNU Lesser General Public
 * License along with this library; if not, write to the Free Software
 * Foundation, Inc., 51 Franklin Street, Fifth Floor, Boston, MA  02110-1301  USA
 */

/**
 * @constructor
 * @extends {WebInspector.VBox}
 * @param {!WebInspector.NetworkRequest} request
 */
WebInspector.ResourceWebSocketFrameView = function(request)
{
    WebInspector.VBox.call(this);
    this.registerRequiredCSS("network/webSocketFrameView.css");
    this.element.classList.add("websocket-frame-view");
    this._request = request;

    this._splitWidget = new WebInspector.SplitWidget(false, true, "resourceWebSocketFrameSplitViewState");
    this._splitWidget.show(this.element);

    var columns = [
        {id: "data", title: WebInspector.UIString("Data"), sortable: false, weight: 88},
        {id: "length", title: WebInspector.UIString("Length"), sortable: false, align: WebInspector.DataGrid.Align.Right, weight: 5},
        {id: "time", title: WebInspector.UIString("Time"), sortable: true, weight: 7}
    ];

    this._dataGrid = new WebInspector.SortableDataGrid(columns, undefined, undefined, undefined, this._onContextMenu.bind(this));
    this._dataGrid.setStickToBottom(true);
    this._dataGrid.setCellClass("websocket-frame-view-td");
    this._timeComparator = /** @type {!WebInspector.SortableDataGrid.NodeComparator} */ (WebInspector.ResourceWebSocketFrameNodeTimeComparator);
    this._dataGrid.sortNodes(this._timeComparator, false);
    this._dataGrid.markColumnAsSortedBy("time", WebInspector.DataGrid.Order.Ascending);
    this._dataGrid.addEventListener(WebInspector.DataGrid.Events.SortingChanged, this._sortItems, this);

    this._dataGrid.setName("ResourceWebSocketFrameView");
    this._dataGrid.addEventListener(WebInspector.DataGrid.Events.SelectedNode, this._onFrameSelected, this);
    this._splitWidget.setMainWidget(this._dataGrid);

    this._messageView = new WebInspector.EmptyWidget("Select frame to browse its content.");
    this._splitWidget.setSidebarWidget(this._messageView);
}

/** @enum {number} */
WebInspector.ResourceWebSocketFrameView.OpCodes = {
    ContinuationFrame: 0,
    TextFrame: 1,
    BinaryFrame: 2,
    ConnectionCloseFrame: 8,
    PingFrame: 9,
    PongFrame: 10
};

/** @type {!Array.<string> } */
WebInspector.ResourceWebSocketFrameView.opCodeDescriptions = (function()
{
    var opCodes = WebInspector.ResourceWebSocketFrameView.OpCodes;
    var map = [];
    map[opCodes.ContinuationFrame] = "Continuation Frame";
    map[opCodes.TextFrame] = "Text Frame";
    map[opCodes.BinaryFrame] = "Binary Frame";
    map[opCodes.ContinuationFrame] = "Connection Close Frame";
    map[opCodes.PingFrame] = "Ping Frame";
    map[opCodes.PongFrame] = "Pong Frame";
    return map;
})();

/**
 * @param {number} opCode
 * @param {boolean} mask
 * @return {string}
 */
WebInspector.ResourceWebSocketFrameView.opCodeDescription = function(opCode, mask)
{
    var rawDescription = WebInspector.ResourceWebSocketFrameView.opCodeDescriptions[opCode] || "";
    var localizedDescription = WebInspector.UIString(rawDescription);
    return WebInspector.UIString("%s (Opcode %d%s)", localizedDescription, opCode, (mask ? ", mask" : ""));
}

WebInspector.ResourceWebSocketFrameView.prototype = {
    wasShown: function()
    {
        this.refresh();
        this._request.addEventListener(WebInspector.NetworkRequest.Events.WebsocketFrameAdded, this._frameAdded, this);
    },

    willHide: function()
    {
        this._request.removeEventListener(WebInspector.NetworkRequest.Events.WebsocketFrameAdded, this._frameAdded, this);
    },

    /**
     * @param {!WebInspector.Event} event
     */
    _frameAdded: function(event)
    {
        var frame = /** @type {!WebInspector.NetworkRequest.WebSocketFrame} */ (event.data);
        this._dataGrid.insertChild(new WebInspector.ResourceWebSocketFrameNode(frame));
    },

    /**
     * @param {!WebInspector.Event} event
     */
    _onFrameSelected: function(event)
    {
        var selectedNode = /** @type {!WebInspector.ResourceWebSocketFrameNode} */ (event.target.selectedNode);
        if (this._messageView)
            this._messageView.detach();
        if (this._dataView)
            this._dataView.detach();
        this._dataView = new WebInspector.ResourceSourceFrame(selectedNode.contentProvider());
        this._splitWidget.setSidebarWidget(this._dataView);
    },

    refresh: function()
    {
        this._dataGrid.rootNode().removeChildren();
        var frames = this._request.frames();
        for (var i = 0; i < frames.length; ++i)
            this._dataGrid.insertChild(new WebInspector.ResourceWebSocketFrameNode(frames[i]));
    },

    /**
     * @param {!WebInspector.ContextMenu} contextMenu
     * @param {!WebInspector.DataGridNode} node
     */
    _onContextMenu: function(contextMenu, node)
    {
        contextMenu.appendItem(WebInspector.UIString.capitalize("Copy ^message"), this._copyMessage.bind(this, node.data));
    },

    /**
     * @param {!Object} row
     */
    _copyMessage: function(row)
    {
        InspectorFrontendHost.copyText(row.data);
    },

    _sortItems: function()
    {
        this._dataGrid.sortNodes(this._timeComparator, !this._dataGrid.isSortOrderAscending());
    },

    __proto__: WebInspector.VBox.prototype
}

/**
 * @constructor
 * @extends {WebInspector.SortableDataGridNode}
 * @param {!WebInspector.NetworkRequest.WebSocketFrame} frame
 */
WebInspector.ResourceWebSocketFrameNode = function(frame)
{
    this._frame = frame;
    this._dataText = frame.text;
    var length = frame.text.length;
    var time = new Date(frame.time * 1000);
    var timeText = ("0" + time.getHours()).substr(-2) + ":" + ("0" + time.getMinutes()).substr(-2)+ ":" + ("0" + time.getSeconds()).substr(-2) + "." + ("00" + time.getMilliseconds()).substr(-3);
    var timeNode = createElement("div");
    timeNode.createTextChild(timeText);
    timeNode.title = time.toLocaleString();

    this._isTextFrame = frame.opCode === WebInspector.ResourceWebSocketFrameView.OpCodes.TextFrame;
    if (!this._isTextFrame)
        this._dataText = WebInspector.ResourceWebSocketFrameView.opCodeDescription(frame.opCode, frame.mask);

    WebInspector.SortableDataGridNode.call(this, {data: this._dataText, length: length, time: timeNode});
}

WebInspector.ResourceWebSocketFrameNode.prototype = {
    /**
     * @override
     */
    createCells: function()
    {
        var element = this._element;
        element.classList.toggle("websocket-frame-view-row-error", this._frame.type === WebInspector.NetworkRequest.WebSocketFrameType.Error);
        element.classList.toggle("websocket-frame-view-row-outcoming", this._frame.type === WebInspector.NetworkRequest.WebSocketFrameType.Send);
        element.classList.toggle("websocket-frame-view-row-opcode", !this._isTextFrame);
        WebInspector.SortableDataGridNode.prototype.createCells.call(this);
    },

    /**
     * @override
     * @return {number}
     */
    nodeSelfHeight: function()
    {
        return 17;
    },

    /**
     * @return {!WebInspector.ContentProvider}
     */
    contentProvider: function()
    {
        return new WebInspector.StaticContentProvider(WebInspector.resourceTypes.WebSocket, this._dataText);
    },

    __proto__: WebInspector.SortableDataGridNode.prototype
}

/**
 * @param {!WebInspector.ResourceWebSocketFrameNode} a
 * @param {!WebInspector.ResourceWebSocketFrameNode} b
 * @return {number}
 */
WebInspector.ResourceWebSocketFrameNodeTimeComparator = function(a, b)
{
    return a._frame.time - b._frame.time;
}
