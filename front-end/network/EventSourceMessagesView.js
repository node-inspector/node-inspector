// Copyright 2014 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

/**
 * @constructor
 * @extends {WebInspector.VBox}
 * @param {!WebInspector.NetworkRequest} request
 */
WebInspector.EventSourceMessagesView = function(request)
{
    WebInspector.VBox.call(this);
    this.registerRequiredCSS("network/eventSourceMessagesView.css");
    this.element.classList.add("event-source-messages-view");
    this._request = request;

    var columns = [
        {id: "id", title: WebInspector.UIString("Id"), sortable: true, weight: 8},
        {id: "type", title: WebInspector.UIString("Type"), sortable: true, weight: 8},
        {id: "data", title: WebInspector.UIString("Data"), sortable: false, weight: 88},
        {id: "time", title: WebInspector.UIString("Time"), sortable: true, weight: 8}
    ];

    this._dataGrid = new WebInspector.SortableDataGrid(columns);
    this._dataGrid.setStickToBottom(true);
    this._dataGrid.markColumnAsSortedBy("time", WebInspector.DataGrid.Order.Ascending);
    this._sortItems();
    this._dataGrid.addEventListener(WebInspector.DataGrid.Events.SortingChanged, this._sortItems, this);

    this._dataGrid.setName("EventSourceMessagesView");
    this._dataGrid.show(this.element);
}

WebInspector.EventSourceMessagesView.prototype = {
    wasShown: function()
    {
        this._dataGrid.rootNode().removeChildren();
        var messages = this._request.eventSourceMessages();
        for (var i = 0; i < messages.length; ++i)
            this._dataGrid.insertChild(new WebInspector.EventSourceMessageNode(messages[i]));

        this._request.addEventListener(WebInspector.NetworkRequest.Events.EventSourceMessageAdded, this._messageAdded, this);
    },

    willHide: function()
    {
        this._request.removeEventListener(WebInspector.NetworkRequest.Events.EventSourceMessageAdded, this._messageAdded, this);
    },

    /**
     * @param {!WebInspector.Event} event
     */
    _messageAdded: function(event)
    {
        var message = /** @type {!WebInspector.NetworkRequest.EventSourceMessage} */ (event.data);
        this._dataGrid.insertChild(new WebInspector.EventSourceMessageNode(message));
    },

    _sortItems: function()
    {
        var sortColumnIdentifier = this._dataGrid.sortColumnIdentifier();
        if (!sortColumnIdentifier)
            return;
        var comparator = WebInspector.EventSourceMessageNode.Comparators[sortColumnIdentifier];
        if (!comparator)
            return;
        this._dataGrid.sortNodes(comparator, !this._dataGrid.isSortOrderAscending());
    },

    __proto__: WebInspector.VBox.prototype
}

/**
 * @constructor
 * @extends {WebInspector.SortableDataGridNode}
 * @param {!WebInspector.NetworkRequest.EventSourceMessage} message
 */
WebInspector.EventSourceMessageNode = function(message)
{
    this._message = message;
    var time = new Date(message.time * 1000);
    var timeText = ("0" + time.getHours()).substr(-2) + ":" + ("0" + time.getMinutes()).substr(-2)+ ":" + ("0" + time.getSeconds()).substr(-2) + "." + ("00" + time.getMilliseconds()).substr(-3);
    var timeNode = createElement("div");
    timeNode.createTextChild(timeText);
    timeNode.title = time.toLocaleString();
    WebInspector.SortableDataGridNode.call(this, {id: message.eventId, type: message.eventName, data: message.data, time: timeNode});
}

WebInspector.EventSourceMessageNode.prototype = {
    __proto__: WebInspector.SortableDataGridNode.prototype
}

/**
 * @param {string} field
 * @param {!WebInspector.EventSourceMessageNode} a
 * @param {!WebInspector.EventSourceMessageNode} b
 * @return {number}
 */
WebInspector.EventSourceMessageNodeComparator = function(field, a, b)
{
    var aValue = a._message[field];
    var bValue = b._message[field];
    return aValue < bValue ? -1 : aValue > bValue ? 1 : 0;
}

/** @type {!Object.<string, !WebInspector.SortableDataGrid.NodeComparator>} */
WebInspector.EventSourceMessageNode.Comparators = {
    "id": WebInspector.EventSourceMessageNodeComparator.bind(null, "eventId"),
    "type": WebInspector.EventSourceMessageNodeComparator.bind(null, "eventName"),
    "time": WebInspector.EventSourceMessageNodeComparator.bind(null, "time")
};
