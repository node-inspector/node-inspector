/*
 * Copyright (C) 2007, 2008 Apple Inc.  All rights reserved.
 * Copyright (C) 2008, 2009 Anthony Ricaud <rik@webkit.org>
 * Copyright (C) 2011 Google Inc. All rights reserved.
 *
 * Redistribution and use in source and binary forms, with or without
 * modification, are permitted provided that the following conditions
 * are met:
 *
 * 1.  Redistributions of source code must retain the above copyright
 *     notice, this list of conditions and the following disclaimer.
 * 2.  Redistributions in binary form must reproduce the above copyright
 *     notice, this list of conditions and the following disclaimer in the
 *     documentation and/or other materials provided with the distribution.
 * 3.  Neither the name of Apple Computer, Inc. ("Apple") nor the names of
 *     its contributors may be used to endorse or promote products derived
 *     from this software without specific prior written permission.
 *
 * THIS SOFTWARE IS PROVIDED BY APPLE AND ITS CONTRIBUTORS "AS IS" AND ANY
 * EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED
 * WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
 * DISCLAIMED. IN NO EVENT SHALL APPLE OR ITS CONTRIBUTORS BE LIABLE FOR ANY
 * DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES
 * (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES;
 * LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND
 * ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT
 * (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF
 * THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
 */

/**
 * @constructor
 * @implements {WebInspector.Searchable}
 * @implements {WebInspector.TargetManager.Observer}
 * @extends {WebInspector.VBox}
 * @param {!WebInspector.FilterBar} filterBar
 * @param {!Element} progressBarContainer
 * @param {!WebInspector.Setting} networkLogLargeRowsSetting
 */
WebInspector.NetworkLogView = function(filterBar, progressBarContainer, networkLogLargeRowsSetting)
{
    WebInspector.VBox.call(this);
    this.setMinimumSize(50, 64);
    this.registerRequiredCSS("network/networkLogView.css");
    this.registerRequiredCSS("ui/filter.css");

    this._networkHideDataURLSetting = WebInspector.settings.createSetting("networkHideDataURL", false);
    this._networkResourceTypeFiltersSetting = WebInspector.settings.createSetting("networkResourceTypeFilters", {});
    this._networkShowPrimaryLoadWaterfallSetting = WebInspector.settings.createSetting("networkShowPrimaryLoadWaterfall", false);

    this._filterBar = filterBar;
    this._progressBarContainer = progressBarContainer;
    this._networkLogLargeRowsSetting = networkLogLargeRowsSetting;

    var defaultColumnsVisibility = WebInspector.NetworkLogView._defaultColumnsVisibility;
    this._columnsVisibilitySetting = WebInspector.settings.createSetting("networkLogColumnsVisibility", defaultColumnsVisibility);
    var savedColumnsVisibility = this._columnsVisibilitySetting.get();
    var columnsVisibility = {};
    for (var columnId in defaultColumnsVisibility)
        columnsVisibility[columnId] = savedColumnsVisibility.hasOwnProperty(columnId) ? savedColumnsVisibility[columnId] : defaultColumnsVisibility[columnId];
    this._columnsVisibilitySetting.set(columnsVisibility);

    /** @type {!Map.<string, !WebInspector.NetworkDataGridNode>} */
    this._nodesByRequestId = new Map();
    /** @type {!Object.<string, boolean>} */
    this._staleRequestIds = {};
    /** @type {number} */
    this._mainRequestLoadTime = -1;
    /** @type {number} */
    this._mainRequestDOMContentLoadedTime = -1;
    this._matchedRequestCount = 0;
    /** @type {!Array<{time: number, element: !Element}>} */
    this._eventDividers = [];
    this._highlightedSubstringChanges = [];

    /** @type {!Array.<!WebInspector.NetworkLogView.Filter>} */
    this._filters = [];
    /** @type {?WebInspector.NetworkLogView.Filter} */
    this._timeFilter = null;

    this._currentMatchedRequestNode = null;
    this._currentMatchedRequestIndex = -1;

    /** @type {!WebInspector.Linkifier} */
    this._popupLinkifier = new WebInspector.Linkifier();
    /** @type {!WebInspector.Linkifier} */
    this.linkifier = new WebInspector.Linkifier();

    this._gridMode = true;
    this._recording = false;
    this._preserveLog = false;

    /** @type {number} */
    this._rowHeight = 0;

    this._addFilters();
    this._resetSuggestionBuilder();
    this._initializeView();

    WebInspector.moduleSetting("networkColorCodeResourceTypes").addChangeListener(this._invalidateAllItems, this);
    this._networkLogLargeRowsSetting.addChangeListener(this._updateRowsSize, this);

    WebInspector.targetManager.observeTargets(this);
    WebInspector.targetManager.addModelListener(WebInspector.NetworkManager, WebInspector.NetworkManager.EventTypes.RequestStarted, this._onRequestStarted, this);
    WebInspector.targetManager.addModelListener(WebInspector.NetworkManager, WebInspector.NetworkManager.EventTypes.RequestUpdated, this._onRequestUpdated, this);
    WebInspector.targetManager.addModelListener(WebInspector.NetworkManager, WebInspector.NetworkManager.EventTypes.RequestFinished, this._onRequestUpdated, this);

    WebInspector.targetManager.addModelListener(WebInspector.ResourceTreeModel, WebInspector.ResourceTreeModel.EventTypes.MainFrameNavigated, this._mainFrameNavigated, this);
    WebInspector.targetManager.addModelListener(WebInspector.ResourceTreeModel, WebInspector.ResourceTreeModel.EventTypes.Load, this._loadEventFired, this);
    WebInspector.targetManager.addModelListener(WebInspector.ResourceTreeModel, WebInspector.ResourceTreeModel.EventTypes.DOMContentLoaded, this._domContentLoadedEventFired, this);
}

WebInspector.NetworkLogView._isFilteredOutSymbol = Symbol("isFilteredOut");
WebInspector.NetworkLogView._isMatchingSearchQuerySymbol = Symbol("isMatchingSearchQuery");

WebInspector.NetworkLogView.HTTPSchemas = {"http": true, "https": true, "ws": true, "wss": true};
WebInspector.NetworkLogView._responseHeaderColumns = ["Cache-Control", "Connection", "Content-Encoding", "Content-Length", "ETag", "Keep-Alive", "Last-Modified", "Server", "Vary"];
WebInspector.NetworkLogView._defaultColumnsVisibility = {
    method: false, status: true, protocol: false, scheme: false, domain: false, remoteAddress: false, type: true, initiator: true, cookies: false, setCookies: false, size: true, time: true, priority: false, connectionId: false,
    "Cache-Control": false, "Connection": false, "Content-Encoding": false, "Content-Length": false, "ETag": false, "Keep-Alive": false, "Last-Modified": false, "Server": false, "Vary": false
};
WebInspector.NetworkLogView._defaultRefreshDelay = 200;

WebInspector.NetworkLogView._waterfallMinOvertime = 1;
WebInspector.NetworkLogView._waterfallMaxOvertime = 3;

/** @enum {string} */
WebInspector.NetworkLogView.FilterType = {
    Domain: "domain",
    HasResponseHeader: "has-response-header",
    Is: "is",
    LargerThan: "larger-than",
    Method: "method",
    MimeType: "mime-type",
    MixedContent: "mixed-content",
    Scheme: "scheme",
    SetCookieDomain: "set-cookie-domain",
    SetCookieName: "set-cookie-name",
    SetCookieValue: "set-cookie-value",
    StatusCode: "status-code"
};

/** @enum {string} */
WebInspector.NetworkLogView.MixedContentFilterValues = {
    All: "all",
    Displayed: "displayed",
    Blocked: "blocked",
    BlockOverridden: "block-overridden"
}

/** @enum {string} */
WebInspector.NetworkLogView.IsFilterType = {
    Running: "running"
};

/** @type {!Array.<string>} */
WebInspector.NetworkLogView._searchKeys = Object.values(WebInspector.NetworkLogView.FilterType);

/** @type {!Object.<string, string>} */
WebInspector.NetworkLogView._columnTitles = {
    "name": WebInspector.UIString("Name"),
    "method": WebInspector.UIString("Method"),
    "status": WebInspector.UIString("Status"),
    "protocol": WebInspector.UIString("Protocol"),
    "scheme": WebInspector.UIString("Scheme"),
    "domain": WebInspector.UIString("Domain"),
    "remoteAddress": WebInspector.UIString("Remote Address"),
    "type": WebInspector.UIString("Type"),
    "initiator": WebInspector.UIString("Initiator"),
    "cookies": WebInspector.UIString("Cookies"),
    "setCookies": WebInspector.UIString("Set-Cookies"),
    "size": WebInspector.UIString("Size"),
    "time": WebInspector.UIString("Time"),
    "connectionId": WebInspector.UIString("Connection Id"),
    "priority": WebInspector.UIString("Priority"),
    "timeline": WebInspector.UIString("Timeline"),

    // Response header columns
    "Cache-Control": WebInspector.UIString("Cache-Control"),
    "Connection": WebInspector.UIString("Connection"),
    "Content-Encoding": WebInspector.UIString("Content-Encoding"),
    "Content-Length": WebInspector.UIString("Content-Length"),
    "ETag": WebInspector.UIString("ETag"),
    "Keep-Alive": WebInspector.UIString("Keep-Alive"),
    "Last-Modified": WebInspector.UIString("Last-Modified"),
    "Server": WebInspector.UIString("Server"),
    "Vary": WebInspector.UIString("Vary")
};

WebInspector.NetworkLogView.prototype = {
    /**
     * @param {boolean} recording
     */
    setRecording: function(recording)
    {
        this._recording = recording;
        this._updateSummaryBar();
    },

    /**
     * @param {boolean} preserveLog
     */
    setPreserveLog: function(preserveLog)
    {
        this._preserveLog = preserveLog;
    },

    /**
     * @override
     * @param {!WebInspector.Target} target
     */
    targetAdded: function(target)
    {
        target.networkLog.requests().forEach(this._appendRequest.bind(this));
    },

    /**
     * @override
     * @param {!WebInspector.Target} target
     */
    targetRemoved: function(target)
    {
    },

    /**
     * @param {number} start
     * @param {number} end
     */
    setWindow: function(start, end)
    {
        if (!start && !end) {
            this._timeFilter = null;
            this._timeCalculator.setWindow(null);
        } else {
            this._timeFilter = WebInspector.NetworkLogView._requestTimeFilter.bind(null, start, end);
            this._timeCalculator.setWindow(new WebInspector.NetworkTimeBoundary(start, end));
        }
        this._updateDividersIfNeeded();
        this._filterRequests();
    },

    clearSelection: function()
    {
        if (this._dataGrid.selectedNode)
            this._dataGrid.selectedNode.deselect();
    },

    _addFilters: function()
    {
        this._textFilterUI = new WebInspector.TextFilterUI();
        this._textFilterUI.addEventListener(WebInspector.FilterUI.Events.FilterChanged, this._filterChanged, this);
        this._filterBar.addFilter(this._textFilterUI);

        var dataURLSetting = this._networkHideDataURLSetting;
        this._dataURLFilterUI = new WebInspector.CheckboxFilterUI("hide-data-url", WebInspector.UIString("Hide data URLs"), true, dataURLSetting);
        this._dataURLFilterUI.addEventListener(WebInspector.FilterUI.Events.FilterChanged, this._filterChanged.bind(this), this);
        this._filterBar.addFilter(this._dataURLFilterUI);

        var filterItems = [];
        for (var categoryId in WebInspector.resourceCategories) {
            var category = WebInspector.resourceCategories[categoryId];
            filterItems.push({name: category.title, label: category.shortTitle, title: category.title});
        }
        this._resourceCategoryFilterUI = new WebInspector.NamedBitSetFilterUI(filterItems, this._networkResourceTypeFiltersSetting);
        this._resourceCategoryFilterUI.addEventListener(WebInspector.FilterUI.Events.FilterChanged, this._filterChanged.bind(this), this);
        this._filterBar.addFilter(this._resourceCategoryFilterUI);
    },

    _resetSuggestionBuilder: function()
    {
        this._suggestionBuilder = new WebInspector.FilterSuggestionBuilder(WebInspector.NetworkLogView._searchKeys);
        this._suggestionBuilder.addItem(WebInspector.NetworkLogView.FilterType.Is, WebInspector.NetworkLogView.IsFilterType.Running);
        this._suggestionBuilder.addItem(WebInspector.NetworkLogView.FilterType.LargerThan, "100");
        this._suggestionBuilder.addItem(WebInspector.NetworkLogView.FilterType.LargerThan, "10k");
        this._suggestionBuilder.addItem(WebInspector.NetworkLogView.FilterType.LargerThan, "1M");
        this._textFilterUI.setSuggestionBuilder(this._suggestionBuilder);
    },

    /**
     * @param {!WebInspector.Event} event
     */
    _filterChanged: function(event)
    {
        this._removeAllNodeHighlights();
        this._parseFilterQuery(this._textFilterUI.value());
        this._filterRequests();
    },

    _initializeView: function()
    {
        this.element.id = "network-container";

        this._createSortingFunctions();
        this._createCalculators();
        this._createTable();
        this._createTimelineGrid();
        this._summaryBarElement = this.element.createChild("div", "network-summary-bar");

        this._updateRowsSize();

        this._popoverHelper = new WebInspector.PopoverHelper(this.element, this._getPopoverAnchor.bind(this), this._showPopover.bind(this), this._onHidePopover.bind(this));
        this.switchViewMode(true);
    },

    _showRecordingHint: function()
    {
        this._hideRecordingHint();
        this._recordingHint = this.element.createChild("div", "network-status-pane fill");
        var hintText = this._recordingHint.createChild("div", "recording-hint");
        var reloadShortcutNode = this._recordingHint.createChild("b");
        reloadShortcutNode.textContent = WebInspector.ShortcutsScreen.TimelinePanelShortcuts.RecordPageReload[0].name;

        if (this._recording) {
            var recordingText = hintText.createChild("span");
            recordingText.textContent = WebInspector.UIString("Recording network activity\u2026");
            hintText.createChild("br");
            hintText.appendChild(WebInspector.formatLocalized(WebInspector.UIString("Perform a request or hit %s to record the reload."), [reloadShortcutNode], null));
        } else {
            var recordNode = hintText.createChild("b");
            recordNode.textContent = WebInspector.shortcutRegistry.shortcutTitleForAction("network.toggle-recording");
            hintText.appendChild(WebInspector.formatLocalized(WebInspector.UIString("Record (%s) or reload (%s) to display network activity."), [recordNode, reloadShortcutNode], null));
        }
    },

    _hideRecordingHint: function()
    {
        if (this._recordingHint)
            this._recordingHint.remove();
        delete this._recordingHint;
    },

    /**
     * @override
     * @return {!Array.<!Element>}
     */
    elementsToRestoreScrollPositionsFor: function()
    {
        if (!this._dataGrid) // Not initialized yet.
            return [];
        return [this._dataGrid.scrollContainer];
    },

    _createTimelineGrid: function()
    {
        this._timelineGrid = new WebInspector.TimelineGrid();
        this._timelineGrid.element.classList.add("network-timeline-grid");
        this._dataGrid.element.appendChild(this._timelineGrid.element);
    },

    _createTable: function()
    {
        var columns = [];
        columns.push({
            id: "name",
            titleDOMFragment: this._makeHeaderFragment(WebInspector.UIString("Name"), WebInspector.UIString("Path")),
            title: WebInspector.NetworkLogView._columnTitles["name"],
            weight: 20
        });

        columns.push({
            id: "method",
            title: WebInspector.NetworkLogView._columnTitles["method"],
            weight: 6
        });

        columns.push({
            id: "status",
            titleDOMFragment: this._makeHeaderFragment(WebInspector.UIString("Status"), WebInspector.UIString("Text")),
            title: WebInspector.NetworkLogView._columnTitles["status"],
            weight: 6
        });

        columns.push({
            id: "protocol",
            title: WebInspector.NetworkLogView._columnTitles["protocol"],
            weight: 6
        });

        columns.push({
            id: "scheme",
            title: WebInspector.NetworkLogView._columnTitles["scheme"],
            weight: 6
        });

        columns.push({
            id: "domain",
            title: WebInspector.NetworkLogView._columnTitles["domain"],
            weight: 6
        });

        columns.push({
            id: "remoteAddress",
            title: WebInspector.NetworkLogView._columnTitles["remoteAddress"],
            weight: 10,
            align: WebInspector.DataGrid.Align.Right
        });

        columns.push({
            id: "type",
            title: WebInspector.NetworkLogView._columnTitles["type"],
            weight: 6
        });

        columns.push({
            id: "initiator",
            title: WebInspector.NetworkLogView._columnTitles["initiator"],
            weight: 10
        });

        columns.push({
            id: "cookies",
            title: WebInspector.NetworkLogView._columnTitles["cookies"],
            weight: 6,
            align: WebInspector.DataGrid.Align.Right
        });

        columns.push({
            id: "setCookies",
            title: WebInspector.NetworkLogView._columnTitles["setCookies"],
            weight: 6,
            align: WebInspector.DataGrid.Align.Right
        });

        columns.push({
            id: "size",
            titleDOMFragment: this._makeHeaderFragment(WebInspector.UIString("Size"), WebInspector.UIString("Content")),
            title: WebInspector.NetworkLogView._columnTitles["size"],
            weight: 6,
            align: WebInspector.DataGrid.Align.Right
        });

        columns.push({
            id: "time",
            titleDOMFragment: this._makeHeaderFragment(WebInspector.UIString("Time"), WebInspector.UIString("Latency")),
            title: WebInspector.NetworkLogView._columnTitles["time"],
            weight: 6,
            align: WebInspector.DataGrid.Align.Right
        });

        columns.push({
            id: "priority",
            title: WebInspector.NetworkLogView._columnTitles["priority"],
            weight: 6
        });

        columns.push({
            id: "connectionId",
            title: WebInspector.NetworkLogView._columnTitles["connectionId"],
            weight: 6
        });

        var responseHeaderColumns = WebInspector.NetworkLogView._responseHeaderColumns;
        for (var i = 0; i < responseHeaderColumns.length; ++i) {
            var headerName = responseHeaderColumns[i];
            var descriptor = {
                id: headerName,
                title: WebInspector.NetworkLogView._columnTitles[headerName],
                weight: 6
            };
            if (headerName === "Content-Length")
                descriptor.align = WebInspector.DataGrid.Align.Right;
            columns.push(descriptor);
        }

        columns.push({
            id: "timeline",
            title: WebInspector.NetworkLogView._columnTitles["timeline"],
            sortable: false,
            weight: 40,
            sort: WebInspector.DataGrid.Order.Ascending
        });

        for (var column of columns) {
            column.sortable = column.id !== "timeline";
            column.nonSelectable = column.id !== "name";
        }

        this._dataGrid = new WebInspector.SortableDataGrid(columns);
        this._dataGrid.setStickToBottom(true);
        this._updateColumns();
        this._dataGrid.setName("networkLog");
        this._dataGrid.setResizeMethod(WebInspector.DataGrid.ResizeMethod.Last);
        this._dataGrid.element.classList.add("network-log-grid");
        this._dataGrid.element.addEventListener("contextmenu", this._contextMenu.bind(this), true);
        this._dataGrid.element.addEventListener("mousedown", this._dataGridMouseDown.bind(this), true);
        this._dataGrid.element.addEventListener("mousemove", this._dataGridMouseMove.bind(this), true);
        this._dataGrid.element.addEventListener("mouseleave", this._highlightInitiatorChain.bind(this, null), true);
        this._dataGrid.show(this.element);

        // Event listeners need to be added _after_ we attach to the document, so that owner document is properly update.
        this._dataGrid.addEventListener(WebInspector.DataGrid.Events.SortingChanged, this._sortItems, this);
        this._dataGrid.addEventListener(WebInspector.DataGrid.Events.ColumnsResized, this._updateDividersIfNeeded, this);

        this._patchTimelineHeader();
        this._dataGrid.sortNodes(this._sortingFunctions.startTime, false);
    },

    /**
     * @param {!Event} event
     */
    _dataGridMouseDown: function(event)
    {
        if ((!this._dataGrid.selectedNode && event.button) || event.target.enclosingNodeOrSelfWithNodeName("a"))
            event.consume();
    },

    /**
     * @param {!Event} event
     */
    _dataGridMouseMove: function(event)
    {
        var node = event.shiftKey ? this._dataGrid.dataGridNodeFromNode(event.target) : null;
        this._highlightInitiatorChain(node ? node.request() : null);
    },

    /**
     * @param {?WebInspector.NetworkRequest} request
     */
    _highlightInitiatorChain: function(request)
    {
        if (this._requestWithHighlightedInitiators === request)
            return;
        this._requestWithHighlightedInitiators = request;

        if (!request) {
            for (var node of this._nodesByRequestId.values()) {
                if (!node.dataGrid)
                    continue;
                node.element().classList.remove("network-node-on-initiator-path", "network-node-on-initiated-path");
            }
            return;
        }

        var initiators = request.initiatorChain();
        var initiated = new Set();
        for (var node of this._nodesByRequestId.values()) {
            if (!node.dataGrid)
                continue;
            var localInitiators = node.request().initiatorChain();
            if (localInitiators.has(request))
                initiated.add(node.request());
        }

        for (var node of this._nodesByRequestId.values()) {
            if (!node.dataGrid)
                continue;
            node.element().classList.toggle("network-node-on-initiator-path", node.request() !== request && initiators.has(node.request()));
            node.element().classList.toggle("network-node-on-initiated-path", node.request() !== request && initiated.has(node.request()));
        }
    },

    /**
     * @param {string} title
     * @param {string} subtitle
     * @return {!DocumentFragment}
     */
    _makeHeaderFragment: function(title, subtitle)
    {
        var fragment = createDocumentFragment();
        fragment.createTextChild(title);
        var subtitleDiv = fragment.createChild("div", "network-header-subtitle");
        subtitleDiv.createTextChild(subtitle);
        return fragment;
    },

    _patchTimelineHeader: function()
    {
        var timelineSorting = createElement("select");

        var option = createElement("option");
        option.value = "startTime";
        option.label = WebInspector.UIString("Timeline");
        option.disabled = true;
        timelineSorting.appendChild(option);

        option = createElement("option");
        option.value = "startTime";
        option.label = WebInspector.UIString("Timeline \u2013 Start Time");
        option.sortOrder = WebInspector.DataGrid.Order.Ascending;
        timelineSorting.appendChild(option);

        option = createElement("option");
        option.value = "responseTime";
        option.label = WebInspector.UIString("Timeline \u2013 Response Time");
        option.sortOrder = WebInspector.DataGrid.Order.Ascending;
        timelineSorting.appendChild(option);

        option = createElement("option");
        option.value = "endTime";
        option.label = WebInspector.UIString("Timeline \u2013 End Time");
        option.sortOrder = WebInspector.DataGrid.Order.Ascending;
        timelineSorting.appendChild(option);

        option = createElement("option");
        option.value = "duration";
        option.label = WebInspector.UIString("Timeline \u2013 Total Duration");
        option.sortOrder = WebInspector.DataGrid.Order.Descending;
        timelineSorting.appendChild(option);

        option = createElement("option");
        option.value = "latency";
        option.label = WebInspector.UIString("Timeline \u2013 Latency");
        option.sortOrder = WebInspector.DataGrid.Order.Descending;
        timelineSorting.appendChild(option);

        var header = this._dataGrid.headerTableHeader("timeline");
        header.replaceChild(timelineSorting, header.firstChild);
        header.createChild("div", "sort-order-icon-container").createChild("div", "sort-order-icon");

        timelineSorting.selectedIndex = 1;
        timelineSorting.addEventListener("click", function(event) { event.consume(); }, false);
        timelineSorting.addEventListener("change", this._sortByTimeline.bind(this), false);
        this._timelineSortSelector = timelineSorting;
    },

    _createSortingFunctions: function()
    {
        this._sortingFunctions = {};
        this._sortingFunctions.name = WebInspector.NetworkDataGridNode.NameComparator;
        this._sortingFunctions.method = WebInspector.NetworkDataGridNode.RequestPropertyComparator.bind(null, "method", false);
        this._sortingFunctions.status = WebInspector.NetworkDataGridNode.RequestPropertyComparator.bind(null, "statusCode", false);
        this._sortingFunctions.protocol = WebInspector.NetworkDataGridNode.RequestPropertyComparator.bind(null, "protocol", false);
        this._sortingFunctions.scheme = WebInspector.NetworkDataGridNode.RequestPropertyComparator.bind(null, "scheme", false);
        this._sortingFunctions.domain = WebInspector.NetworkDataGridNode.RequestPropertyComparator.bind(null, "domain", false);
        this._sortingFunctions.remoteAddress = WebInspector.NetworkDataGridNode.RemoteAddressComparator;
        this._sortingFunctions.type = WebInspector.NetworkDataGridNode.RequestPropertyComparator.bind(null, "mimeType", false);
        this._sortingFunctions.initiator = WebInspector.NetworkDataGridNode.InitiatorComparator;
        this._sortingFunctions.cookies = WebInspector.NetworkDataGridNode.RequestCookiesCountComparator;
        this._sortingFunctions.setCookies = WebInspector.NetworkDataGridNode.ResponseCookiesCountComparator;
        this._sortingFunctions.size = WebInspector.NetworkDataGridNode.SizeComparator;
        this._sortingFunctions.time = WebInspector.NetworkDataGridNode.RequestPropertyComparator.bind(null, "duration", false);
        this._sortingFunctions.connectionId = WebInspector.NetworkDataGridNode.RequestPropertyComparator.bind(null, "connectionId", false);
        this._sortingFunctions.priority = WebInspector.NetworkDataGridNode.InitialPriorityComparator;
        this._sortingFunctions.timeline = WebInspector.NetworkDataGridNode.RequestPropertyComparator.bind(null, "startTime", false);
        this._sortingFunctions.startTime = WebInspector.NetworkDataGridNode.RequestPropertyComparator.bind(null, "startTime", false);
        this._sortingFunctions.endTime = WebInspector.NetworkDataGridNode.RequestPropertyComparator.bind(null, "endTime", false);
        this._sortingFunctions.responseTime = WebInspector.NetworkDataGridNode.RequestPropertyComparator.bind(null, "responseReceivedTime", false);
        this._sortingFunctions.duration = WebInspector.NetworkDataGridNode.RequestPropertyComparator.bind(null, "duration", true);
        this._sortingFunctions.latency = WebInspector.NetworkDataGridNode.RequestPropertyComparator.bind(null, "latency", true);
    },

    _createCalculators: function()
    {
        /** @type {!WebInspector.NetworkTransferTimeCalculator} */
        this._timeCalculator = new WebInspector.NetworkTransferTimeCalculator();
        /** @type {!WebInspector.NetworkTransferDurationCalculator} */
        this._durationCalculator = new WebInspector.NetworkTransferDurationCalculator();

        /** @type {!Object.<string, !WebInspector.NetworkTimeCalculator>} */
        this._calculators = {};
        this._calculators.timeline = this._timeCalculator;
        this._calculators.startTime = this._timeCalculator;
        this._calculators.endTime = this._timeCalculator;
        this._calculators.responseTime = this._timeCalculator;
        this._calculators.duration = this._durationCalculator;
        this._calculators.latency = this._durationCalculator;

        this._calculator = this._timeCalculator;
    },

    _sortItems: function()
    {
        this._removeAllNodeHighlights();
        var columnIdentifier = this._dataGrid.sortColumnIdentifier();
        if (columnIdentifier === "timeline") {
            this._sortByTimeline();
            return;
        }
        var sortingFunction = this._sortingFunctions[columnIdentifier];
        if (!sortingFunction)
            return;

        this._dataGrid.sortNodes(sortingFunction, !this._dataGrid.isSortOrderAscending());
        this._highlightNthMatchedRequestForSearch(this._updateMatchCountAndFindMatchIndex(this._currentMatchedRequestNode), false);
        this._timelineSortSelector.selectedIndex = 0;
    },

    _sortByTimeline: function()
    {
        this._removeAllNodeHighlights();
        var selectedIndex = this._timelineSortSelector.selectedIndex;
        if (!selectedIndex)
            selectedIndex = 1; // Sort by start time by default.
        var selectedOption = this._timelineSortSelector[selectedIndex];
        var value = selectedOption.value;

        this._setCalculator(this._calculators[value]);
        var sortingFunction = this._sortingFunctions[value];
        this._dataGrid.sortNodes(sortingFunction);
        this._highlightNthMatchedRequestForSearch(this._updateMatchCountAndFindMatchIndex(this._currentMatchedRequestNode), false);
        this._dataGrid.markColumnAsSortedBy("timeline", selectedOption.sortOrder);
    },

    _updateSummaryBar: function()
    {
        var requestsNumber = this._nodesByRequestId.size;

        if (!requestsNumber) {
            this._showRecordingHint();
            return;
        }
        this._hideRecordingHint();

        var transferSize = 0;
        var selectedRequestsNumber = 0;
        var selectedTransferSize = 0;
        var baseTime = -1;
        var maxTime = -1;
        var nodes = this._nodesByRequestId.valuesArray();
        for (var i = 0; i < nodes.length; ++i) {
            var request = nodes[i].request();
            var requestTransferSize = request.transferSize;
            transferSize += requestTransferSize;
            if (!nodes[i][WebInspector.NetworkLogView._isFilteredOutSymbol]) {
                selectedRequestsNumber++;
                selectedTransferSize += requestTransferSize;
            }
            if (request.url === request.target().resourceTreeModel.inspectedPageURL() && request.resourceType() === WebInspector.resourceTypes.Document)
                baseTime = request.startTime;
            if (request.endTime > maxTime)
                maxTime = request.endTime;
        }

        var summaryBar = this._summaryBarElement;
        summaryBar.removeChildren();
        var separator = "\u2002\u2758\u2002";
        var text = "";
        /**
         * @param {string} chunk
         * @return {!Element}
         */
        function appendChunk(chunk)
        {
            var span = summaryBar.createChild("span");
            span.textContent = chunk;
            text += chunk;
            return span;
        }

        if (selectedRequestsNumber !== requestsNumber) {
            appendChunk(WebInspector.UIString("%d / %d requests", selectedRequestsNumber, requestsNumber));
            appendChunk(separator);
            appendChunk(WebInspector.UIString("%s / %s transferred", Number.bytesToString(selectedTransferSize), Number.bytesToString(transferSize)));
        } else {
            appendChunk(WebInspector.UIString("%d requests", requestsNumber));
            appendChunk(separator);
            appendChunk(WebInspector.UIString("%s transferred", Number.bytesToString(transferSize)));
        }
        if (baseTime !== -1) {
            appendChunk(separator);
            appendChunk(WebInspector.UIString("Finish: %s", Number.secondsToString(maxTime - baseTime)));
            if (this._mainRequestDOMContentLoadedTime !== -1 && this._mainRequestDOMContentLoadedTime > baseTime) {
                appendChunk(separator);
                var domContentLoadedText = WebInspector.UIString("DOMContentLoaded: %s", Number.secondsToString(this._mainRequestDOMContentLoadedTime - baseTime));
                appendChunk(domContentLoadedText).classList.add("summary-blue");
            }
            if (this._mainRequestLoadTime !== -1) {
                appendChunk(separator);
                var loadText = WebInspector.UIString("Load: %s", Number.secondsToString(this._mainRequestLoadTime - baseTime));
                appendChunk(loadText).classList.add("summary-red");
            }
        }
        summaryBar.title = text;
    },

    _scheduleRefresh: function()
    {
        if (this._needsRefresh)
            return;

        this._needsRefresh = true;

        if (this.isShowing() && !this._refreshTimeout)
            this._refreshTimeout = setTimeout(this.refresh.bind(this), WebInspector.NetworkLogView._defaultRefreshDelay);
    },

    _updateDividersIfNeeded: function()
    {
        if (!this.isShowing()) {
            this._scheduleRefresh();
            return;
        }

        var timelineOffset = this._dataGrid.columnOffset("timeline");
        // Position timline grid location.
        if (timelineOffset)
            this._timelineGrid.element.style.left = timelineOffset + "px";

        var calculator = this.calculator();
        calculator.setDisplayWindow(this._timelineGrid.dividersElement.clientWidth);
        this._timelineGrid.updateDividers(calculator, 75);

        if (calculator.startAtZero) {
            // If our current sorting method starts at zero, that means it shows all
            // requests starting at the same point, and so onLoad event and DOMContent
            // event lines really wouldn't make much sense here, so don't render them.
            return;
        }

        this._updateEventDividers();
    },

    /**
     * @param {!Array<number>} times
     */
    addFilmStripFrames: function(times)
    {
        this._addEventDividers(times, "network-frame-divider");
    },

    /**
     * @param {number} time
     */
    selectFilmStripFrame: function(time)
    {
        for (var divider of this._eventDividers)
            divider.element.classList.toggle("network-frame-divider-selected", divider.time === time);
    },

    clearFilmStripFrame: function()
    {
        for (var divider of this._eventDividers)
            divider.element.classList.toggle("network-frame-divider-selected", false);
    },

    /**
     * @param {!Array<number>} times
     * @param {string} className
     */
    _addEventDividers: function(times, className)
    {
        for (var i = 0; i < times.length; ++i) {
            var element = createElementWithClass("div", "network-event-divider " + className);
            this._timelineGrid.addEventDivider(element);
            this._eventDividers.push({time: times[i], element: element});
        }
        // Update event dividers immediately
        this._updateEventDividers();
        // Schedule refresh in case dividers change the calculator span.
        this._scheduleRefresh();
    },

    _updateEventDividers: function()
    {
        var calculator = this.calculator();
        for (var divider of this._eventDividers) {
            var timePercent = calculator.computePercentageFromEventTime(divider.time);
            divider.element.classList.toggle("invisible", timePercent < 0);
            divider.element.style.left = timePercent + "%";
        }
    },

    _refreshIfNeeded: function()
    {
        if (this._needsRefresh)
            this.refresh();
    },

    _invalidateAllItems: function()
    {
        var requestIds = this._nodesByRequestId.keysArray();
        for (var i = 0; i < requestIds.length; ++i)
            this._staleRequestIds[requestIds[i]] = true;
        this.refresh();
    },

    /**
     * @return {!WebInspector.NetworkTimeCalculator}
     */
    timeCalculator: function()
    {
        return this._timeCalculator;
    },

    /**
     * @return {!WebInspector.NetworkTimeCalculator}
     */
    calculator: function()
    {
        return this._calculator;
    },

    /**
     * @param {!WebInspector.NetworkTimeCalculator} x
     */
    _setCalculator: function(x)
    {
        if (!x || this._calculator === x)
            return;

        this._calculator = x;
        this._calculator.reset();

        if (this._calculator.startAtZero)
            this._timelineGrid.hideEventDividers();
        else
            this._timelineGrid.showEventDividers();

        this._invalidateAllItems();
    },

    /**
     * @param {!WebInspector.Event} event
     */
    _loadEventFired: function(event)
    {
        if (!this._recording)
            return;

        var data = /** @type {number} */ (event.data);
        if (data) {
            this._mainRequestLoadTime = data;
            this._addEventDividers([data], "network-red-divider");
        }
    },

    /**
     * @param {!WebInspector.Event} event
     */
    _domContentLoadedEventFired: function(event)
    {
        if (!this._recording)
            return;
        var data = /** @type {number} */ (event.data);
        if (data) {
            this._mainRequestDOMContentLoadedTime = data;
            this._addEventDividers([data], "network-blue-divider");
        }
    },

    wasShown: function()
    {
        this._refreshIfNeeded();
    },

    willHide: function()
    {
        this._popoverHelper.hidePopover();
    },

    refresh: function()
    {
        this._needsRefresh = false;
        if (this._refreshTimeout) {
            clearTimeout(this._refreshTimeout);
            delete this._refreshTimeout;
        }

        this._removeAllNodeHighlights();

        var oldBoundary = this.calculator().boundary();
        this._timeCalculator.updateBoundariesForEventTime(this._mainRequestLoadTime);
        this._durationCalculator.updateBoundariesForEventTime(this._mainRequestLoadTime);
        this._timeCalculator.updateBoundariesForEventTime(this._mainRequestDOMContentLoadedTime);
        this._durationCalculator.updateBoundariesForEventTime(this._mainRequestDOMContentLoadedTime);

        var dataGrid = this._dataGrid;
        var rootNode = dataGrid.rootNode();
        var nodesToInsert = [];
        for (var requestId in this._staleRequestIds) {
            var node = this._nodesByRequestId.get(requestId);
            if (!node)
                continue;
            if (!node[WebInspector.NetworkLogView._isFilteredOutSymbol])
                rootNode.removeChild(node);
            node[WebInspector.NetworkLogView._isFilteredOutSymbol] = !this._applyFilter(node);
            if (!node[WebInspector.NetworkLogView._isFilteredOutSymbol])
                nodesToInsert.push(node);
            var request = node.request();
            this._timeCalculator.updateBoundaries(request);
            this._durationCalculator.updateBoundaries(request);
        }

        for (var i = 0; i < nodesToInsert.length; ++i) {
            var node = nodesToInsert[i];
            var request = node.request();
            node.refresh();
            dataGrid.insertChild(node);
            node[WebInspector.NetworkLogView._isMatchingSearchQuerySymbol] = this._matchRequest(request);
        }

        this._highlightNthMatchedRequestForSearch(this._updateMatchCountAndFindMatchIndex(this._currentMatchedRequestNode), false);

        if (this._shouldSetWaterfallWindow && this._mainRequestLoadTime !== -1) {
            var waterfallWindow = this.calculator().boundary();
            var overtime = this._mainRequestLoadTime - waterfallWindow.minimum;
            overtime = Number.constrain(overtime, WebInspector.NetworkLogView._waterfallMinOvertime, WebInspector.NetworkLogView._waterfallMaxOvertime)
            var waterfallEnd = this._mainRequestLoadTime + overtime;
            if (waterfallEnd <= waterfallWindow.maximum) {
                waterfallWindow.maximum = waterfallEnd;
                this._shouldSetWaterfallWindow = false;
                this._timeCalculator.setWindow(waterfallWindow);
            }
        }

        if (!this.calculator().boundary().equals(oldBoundary)) {
            // The boundaries changed, so all item graphs are stale.
            this._updateDividersIfNeeded();
            var nodes = this._nodesByRequestId.valuesArray();
            for (var i = 0; i < nodes.length; ++i)
                nodes[i].refreshGraph();
        }

        this._staleRequestIds = {};
        this._updateSummaryBar();
    },

    reset: function()
    {
        this._requestWithHighlightedInitiators = null;
        this.dispatchEventToListeners(WebInspector.NetworkLogView.EventTypes.RequestSelected, null);

        /** @type {boolean} */
        this._shouldSetWaterfallWindow = Runtime.experiments.isEnabled("showPrimaryLoadWaterfallInNetworkTimeline") && this._networkShowPrimaryLoadWaterfallSetting.get();

        this._clearSearchMatchedList();
        if (this._popoverHelper)
            this._popoverHelper.hidePopover();

        this._timeFilter = null;
        this._calculator.reset();

        this._timeCalculator.setWindow(null);

        var nodes = this._nodesByRequestId.valuesArray();
        for (var i = 0; i < nodes.length; ++i)
            nodes[i].dispose();

        this._nodesByRequestId.clear();
        this._staleRequestIds = {};
        this._resetSuggestionBuilder();

        this._mainRequestLoadTime = -1;
        this._mainRequestDOMContentLoadedTime = -1;
        this._eventDividers = [];
        this._timelineGrid.removeEventDividers();

        if (this._dataGrid) {
            this._dataGrid.rootNode().removeChildren();
            this._updateDividersIfNeeded();
            this._updateSummaryBar();
        }
    },

    /**
      * @param {!WebInspector.NetworkLogView.FilterType} filterType
      * @param {string} filterValue
      */
    setTextFilterValue: function(filterType, filterValue)
    {
        this._textFilterUI.setValue(filterType + ":" + filterValue);
    },

    /**
     * @param {!WebInspector.Event} event
     */
    _onRequestStarted: function(event)
    {
        if (!this._recording)
            return;
        var request = /** @type {!WebInspector.NetworkRequest} */ (event.data);
        this._appendRequest(request);
    },

    /**
     * @param {!WebInspector.NetworkRequest} request
     */
    _appendRequest: function(request)
    {
        var node = new WebInspector.NetworkDataGridNode(this, request);
        node[WebInspector.NetworkLogView._isFilteredOutSymbol] = true;
        node[WebInspector.NetworkLogView._isMatchingSearchQuerySymbol] = false;

        // In case of redirect request id is reassigned to a redirected
        // request and we need to update _nodesByRequestId and search results.
        var originalRequestNode = this._nodesByRequestId.get(request.requestId);
        if (originalRequestNode)
            this._nodesByRequestId.set(originalRequestNode.request().requestId, originalRequestNode);
        this._nodesByRequestId.set(request.requestId, node);

        // Pull all the redirects of the main request upon commit load.
        if (request.redirects) {
            for (var i = 0; i < request.redirects.length; ++i)
                this._refreshRequest(request.redirects[i]);
        }

        this._refreshRequest(request);
    },

    /**
     * @param {!WebInspector.Event} event
     */
    _onRequestUpdated: function(event)
    {
        var request = /** @type {!WebInspector.NetworkRequest} */ (event.data);
        this._refreshRequest(request);
    },

    /**
     * @param {!WebInspector.NetworkRequest} request
     */
    _refreshRequest: function(request)
    {
        if (!this._nodesByRequestId.get(request.requestId))
            return;

        WebInspector.NetworkLogView._subdomains(request.domain).forEach(this._suggestionBuilder.addItem.bind(this._suggestionBuilder, WebInspector.NetworkLogView.FilterType.Domain));
        this._suggestionBuilder.addItem(WebInspector.NetworkLogView.FilterType.Method, request.requestMethod);
        this._suggestionBuilder.addItem(WebInspector.NetworkLogView.FilterType.MimeType, request.mimeType);
        this._suggestionBuilder.addItem(WebInspector.NetworkLogView.FilterType.Scheme, "" + request.scheme);
        this._suggestionBuilder.addItem(WebInspector.NetworkLogView.FilterType.StatusCode, "" + request.statusCode);

        if (request.mixedContentType !== "none") {
            this._suggestionBuilder.addItem(WebInspector.NetworkLogView.FilterType.MixedContent, WebInspector.NetworkLogView.MixedContentFilterValues.All);
        }

        if (request.mixedContentType === "optionally-blockable") {
            this._suggestionBuilder.addItem(WebInspector.NetworkLogView.FilterType.MixedContent, WebInspector.NetworkLogView.MixedContentFilterValues.Displayed);
        }

        if (request.mixedContentType === "blockable") {
            var suggestion = request.wasBlocked() ? WebInspector.NetworkLogView.MixedContentFilterValues.Blocked : WebInspector.NetworkLogView.MixedContentFilterValues.BlockOverridden;
            this._suggestionBuilder.addItem(WebInspector.NetworkLogView.FilterType.MixedContent, suggestion);
        }

        var responseHeaders = request.responseHeaders;
        for (var i = 0, l = responseHeaders.length; i < l; ++i)
            this._suggestionBuilder.addItem(WebInspector.NetworkLogView.FilterType.HasResponseHeader, responseHeaders[i].name);
        var cookies = request.responseCookies;
        for (var i = 0, l = cookies ? cookies.length : 0; i < l; ++i) {
            var cookie = cookies[i];
            this._suggestionBuilder.addItem(WebInspector.NetworkLogView.FilterType.SetCookieDomain, cookie.domain());
            this._suggestionBuilder.addItem(WebInspector.NetworkLogView.FilterType.SetCookieName, cookie.name());
            this._suggestionBuilder.addItem(WebInspector.NetworkLogView.FilterType.SetCookieValue, cookie.value());
        }

        this._staleRequestIds[request.requestId] = true;
        this.dispatchEventToListeners(WebInspector.NetworkLogView.EventTypes.UpdateRequest, request);
        this._scheduleRefresh();
    },

    /**
     * @param {!WebInspector.Event} event
     */
    _mainFrameNavigated: function(event)
    {
        if (!this._recording)
            return;

        var frame = /** @type {!WebInspector.ResourceTreeFrame} */ (event.data);
        var loaderId = frame.loaderId;

        // Pick provisional load requests.
        var requestsToPick = [];
        var requests = frame.target().networkLog.requests();
        for (var i = 0; i < requests.length; ++i) {
            var request = requests[i];
            if (request.loaderId === loaderId)
                requestsToPick.push(request);
        }

        if (!this._preserveLog) {
            this.reset();
            for (var i = 0; i < requestsToPick.length; ++i)
                this._appendRequest(requestsToPick[i]);
        }
        for (var i = 0; i < requestsToPick.length; ++i) {
            var request = requestsToPick[i];
            var node = this._nodesByRequestId.get(request.requestId);
            if (node) {
                node.markAsNavigationRequest();
                break;
            }
        }
    },

    /**
     * @param {boolean} gridMode
     */
    switchViewMode: function(gridMode)
    {
        if (this._gridMode === gridMode)
            return;
        this._gridMode = gridMode;

        if (gridMode) {
            if (this._dataGrid.selectedNode)
                this._dataGrid.selectedNode.selected = false;
        } else {
            this._removeAllNodeHighlights();
            this._popoverHelper.hidePopover();
        }

        this.element.classList.toggle("brief-mode", !gridMode);
        this._updateColumns();
    },

    /**
     * @return {number}
     */
    rowHeight: function()
    {
        return this._rowHeight;
    },

    _updateRowsSize: function()
    {
        var largeRows = !!this._networkLogLargeRowsSetting.get();
        this._rowHeight = largeRows ? 41 : 21;
        this._dataGrid.element.classList.toggle("small", !largeRows);
        this._timelineGrid.element.classList.toggle("small", !largeRows);
        this._dataGrid.scheduleUpdate();
    },

    /**
     * @param {!Element} element
     * @param {!Event} event
     * @return {!Element|!AnchorBox|undefined}
     */
    _getPopoverAnchor: function(element, event)
    {
        if (!this._gridMode)
            return;
        var anchor = element.enclosingNodeOrSelfWithClass("network-graph-bar") || element.enclosingNodeOrSelfWithClass("network-graph-label");
        if (anchor && anchor.parentElement.request && anchor.parentElement.request.timing)
            return anchor;
        anchor = element.enclosingNodeOrSelfWithClass("network-script-initiated");
        if (anchor && anchor.request) {
            var initiator = /** @type {!WebInspector.NetworkRequest} */ (anchor.request).initiator();
            if (initiator && (initiator.stackTrace || initiator.asyncStackTrace))
                return anchor;
        }
    },

    /**
     * @param {!Element} anchor
     * @param {!WebInspector.Popover} popover
     */
    _showPopover: function(anchor, popover)
    {
        var content;
        if (anchor.classList.contains("network-script-initiated")) {
            var request = /** @type {!WebInspector.NetworkRequest} */ (anchor.request);
            var initiator = /** @type {!NetworkAgent.Initiator} */ (request.initiator());
            content = WebInspector.DOMPresentationUtils.buildStackTracePreviewContents(request.target(), this._popupLinkifier, initiator.stackTrace, initiator.asyncStackTrace);
            popover.setCanShrink(true);
        } else {
            content = WebInspector.RequestTimingView.createTimingTable(anchor.parentElement.request, this._timeCalculator.minimumBoundary());
            popover.setCanShrink(false);
        }
        popover.showForAnchor(content, anchor);
    },

    _onHidePopover: function()
    {
        this._popupLinkifier.reset();
    },

    _updateColumns: function()
    {
        if (!this._dataGrid)
            return;
        var gridMode = this._gridMode;
        var visibleColumns = {"name": true};
        if (gridMode)
            visibleColumns["timeline"] = true;
        if (gridMode) {
            var columnsVisibility = this._columnsVisibilitySetting.get();
            for (var columnIdentifier in columnsVisibility)
                visibleColumns[columnIdentifier] = columnsVisibility[columnIdentifier];
        }

        this._dataGrid.setColumnsVisiblity(visibleColumns);
    },

    /**
     * @param {string} columnIdentifier
     */
    _toggleColumnVisibility: function(columnIdentifier)
    {
        var columnsVisibility = this._columnsVisibilitySetting.get();
        columnsVisibility[columnIdentifier] = !columnsVisibility[columnIdentifier];
        this._columnsVisibilitySetting.set(columnsVisibility);

        this._updateColumns();
    },

    /**
     * @return {!Array.<string>}
     */
    _getConfigurableColumnIDs: function()
    {
        if (this._configurableColumnIDs)
            return this._configurableColumnIDs;

        var columnTitles = WebInspector.NetworkLogView._columnTitles;
        function compare(id1, id2)
        {
            return columnTitles[id1].compareTo(columnTitles[id2]);
        }

        var columnIDs = Object.keys(this._columnsVisibilitySetting.get());
        this._configurableColumnIDs = columnIDs.sort(compare);
        return this._configurableColumnIDs;
    },

    /**
     * @param {!Event} event
     */
    _contextMenu: function(event)
    {
        var contextMenu = new WebInspector.ContextMenu(event);

        if (this._gridMode && event.target.isSelfOrDescendant(this._dataGrid.headerTableBody)) {
            var columnsVisibility = this._columnsVisibilitySetting.get();
            var columnIDs = this._getConfigurableColumnIDs();
            var columnTitles = WebInspector.NetworkLogView._columnTitles;
            for (var i = 0; i < columnIDs.length; ++i) {
                var columnIdentifier = columnIDs[i];
                contextMenu.appendCheckboxItem(columnTitles[columnIdentifier], this._toggleColumnVisibility.bind(this, columnIdentifier), !!columnsVisibility[columnIdentifier]);
            }
            contextMenu.show();
            return;
        }

        var gridNode = this._dataGrid.dataGridNodeFromNode(event.target);
        var request = gridNode && gridNode.request();

        /**
         * @param {string} url
         */
        function openResourceInNewTab(url)
        {
            InspectorFrontendHost.openInNewTab(url);
        }

        if (request) {
            contextMenu.appendApplicableItems(request);
            if (request.requestHeadersText())
                contextMenu.appendItem(WebInspector.UIString.capitalize("Copy ^request ^headers"), this._copyRequestHeaders.bind(this, request));
            if (request.responseHeadersText)
                contextMenu.appendItem(WebInspector.UIString.capitalize("Copy ^response ^headers"), this._copyResponseHeaders.bind(this, request));
            if (request.finished)
                contextMenu.appendItem(WebInspector.UIString.capitalize("Copy ^response"), this._copyResponse.bind(this, request));

            if (WebInspector.isWin()) {
                contextMenu.appendItem(WebInspector.UIString("Copy as cURL (cmd)"), this._copyCurlCommand.bind(this, request, "win"));
                contextMenu.appendItem(WebInspector.UIString("Copy as cURL (bash)"), this._copyCurlCommand.bind(this, request, "unix"));
            } else {
                contextMenu.appendItem(WebInspector.UIString("Copy as cURL"), this._copyCurlCommand.bind(this, request, "unix"));
            }
        }
        contextMenu.appendItem(WebInspector.UIString.capitalize("Copy ^all as HAR"), this._copyAll.bind(this));

        contextMenu.appendSeparator();
        contextMenu.appendItem(WebInspector.UIString.capitalize("Save as HAR with ^content"), this._exportAll.bind(this));

        contextMenu.appendSeparator();
        contextMenu.appendItem(WebInspector.UIString.capitalize("Clear ^browser ^cache"), this._clearBrowserCache.bind(this));
        contextMenu.appendItem(WebInspector.UIString.capitalize("Clear ^browser ^cookies"), this._clearBrowserCookies.bind(this));

        var blockedSetting = WebInspector.moduleSetting("blockedURLs");
        if (request) {
            contextMenu.appendSeparator();

            var urlWithoutScheme = request.parsedURL.urlWithoutScheme();
            if (urlWithoutScheme && blockedSetting.get().indexOf(urlWithoutScheme) === -1)
                contextMenu.appendItem(WebInspector.UIString.capitalize("Block ^request URL"), addBlockedURL.bind(null, urlWithoutScheme));

            var domain = request.parsedURL.domain();
            if (domain && blockedSetting.get().indexOf(domain) === -1)
                contextMenu.appendItem(WebInspector.UIString.capitalize("Block ^request ^domain"), addBlockedURL.bind(null, domain));

            function addBlockedURL(url)
            {
                var list = blockedSetting.get();
                list.push(url);
                blockedSetting.set(list);
                WebInspector.BlockedURLsPane.reveal();
            }
        }

        if (request && request.resourceType() === WebInspector.resourceTypes.XHR) {
            contextMenu.appendSeparator();
            contextMenu.appendItem(WebInspector.UIString("Replay XHR"), request.replayXHR.bind(request));
            contextMenu.appendSeparator();
        }

        contextMenu.show();
    },

    _harRequests: function()
    {
        var requests = this._nodesByRequestId.valuesArray().map(function(node) { return node.request(); });
        var httpRequests = requests.filter(WebInspector.NetworkLogView.HTTPRequestsFilter);
        return httpRequests.filter(WebInspector.NetworkLogView.FinishedRequestsFilter);
    },

    _copyAll: function()
    {
        var harArchive = {
            log: (new WebInspector.HARLog(this._harRequests())).build()
        };
        InspectorFrontendHost.copyText(JSON.stringify(harArchive, null, 2));
    },

    /**
     * @param {!WebInspector.NetworkRequest} request
     */
    _copyRequestHeaders: function(request)
    {
        InspectorFrontendHost.copyText(request.requestHeadersText());
    },

    /**
     * @param {!WebInspector.NetworkRequest} request
     */
    _copyResponse: function(request)
    {
        /**
         * @param {?string} content
         */
        function callback(content)
        {
            if (request.contentEncoded)
                content = request.asDataURL();
            InspectorFrontendHost.copyText(content || "");
        }
        request.requestContent(callback);
    },

    /**
     * @param {!WebInspector.NetworkRequest} request
     */
    _copyResponseHeaders: function(request)
    {
        InspectorFrontendHost.copyText(request.responseHeadersText);
    },

    /**
     * @param {!WebInspector.NetworkRequest} request
     * @param {string} platform
     */
    _copyCurlCommand: function(request, platform)
    {
        InspectorFrontendHost.copyText(this._generateCurlCommand(request, platform));
    },

    _exportAll: function()
    {
        var filename = WebInspector.targetManager.inspectedPageDomain() + ".har";
        var stream = new WebInspector.FileOutputStream();
        stream.open(filename, openCallback.bind(this));

        /**
         * @param {boolean} accepted
         * @this {WebInspector.NetworkLogView}
         */
        function openCallback(accepted)
        {
            if (!accepted)
                return;
            var progressIndicator = new WebInspector.ProgressIndicator();
            this._progressBarContainer.appendChild(progressIndicator.element);
            var harWriter = new WebInspector.HARWriter();
            harWriter.write(stream, this._harRequests(), progressIndicator);
        }
    },

    _clearBrowserCache: function()
    {
        if (confirm(WebInspector.UIString("Are you sure you want to clear browser cache?"))) {
            var target = WebInspector.targetManager.mainTarget()
            if (target)
                target.networkManager.clearBrowserCache();
        }
    },

    _clearBrowserCookies: function()
    {
        if (confirm(WebInspector.UIString("Are you sure you want to clear browser cookies?"))) {
            var target = WebInspector.targetManager.mainTarget()
            if (target)
                target.networkManager.clearBrowserCookies();
        }
    },

    /**
     * @param {!WebInspector.NetworkRequest} request
     * @return {boolean}
     */
    _matchRequest: function(request)
    {
        var re = this._searchRegExp;
        if (!re)
            return false;
        return re.test(request.name()) || (this._networkLogLargeRowsSetting.get() && re.test(request.path()));
    },

    _clearSearchMatchedList: function()
    {
        this._matchedRequestCount = -1;
        this._currentMatchedRequestNode = null;
        this._removeAllHighlights();
    },

    _removeAllHighlights: function()
    {
        this._removeAllNodeHighlights();
        for (var i = 0; i < this._highlightedSubstringChanges.length; ++i)
            WebInspector.revertDomChanges(this._highlightedSubstringChanges[i]);
        this._highlightedSubstringChanges = [];
    },

    /**
     * @param {number} n
     * @param {boolean} reveal
     */
    _highlightNthMatchedRequestForSearch: function(n, reveal)
    {
        this._removeAllHighlights();

        /** @type {!Array.<!WebInspector.NetworkDataGridNode>} */
        var nodes = this._dataGrid.rootNode().children;
        var matchCount = 0;
        var node = null;
        for (var i = 0; i < nodes.length; ++i) {
            if (nodes[i][WebInspector.NetworkLogView._isMatchingSearchQuerySymbol]) {
                if (matchCount === n) {
                    node = nodes[i];
                    break;
                }
                matchCount++;
            }
        }
        if (!node) {
            this._currentMatchedRequestNode = null;
            return;
        }

        var request = node.request();
        if (reveal)
            WebInspector.Revealer.reveal(request);
        var highlightedSubstringChanges = node.highlightMatchedSubstring(this._searchRegExp);
        this._highlightedSubstringChanges.push(highlightedSubstringChanges);

        this._currentMatchedRequestNode = node;
        this._currentMatchedRequestIndex = n;
        this.dispatchEventToListeners(WebInspector.NetworkLogView.EventTypes.SearchIndexUpdated, n);
    },

    /**
     * @override
     * @param {!WebInspector.SearchableView.SearchConfig} searchConfig
     * @param {boolean} shouldJump
     * @param {boolean=} jumpBackwards
     */
    performSearch: function(searchConfig, shouldJump, jumpBackwards)
    {
        var query = searchConfig.query;
        var currentMatchedRequestNode = this._currentMatchedRequestNode;
        this._clearSearchMatchedList();
        this._searchRegExp = createPlainTextSearchRegex(query, "i");

        /** @type {!Array.<!WebInspector.NetworkDataGridNode>} */
        var nodes = this._dataGrid.rootNode().children;
        for (var i = 0; i < nodes.length; ++i)
            nodes[i][WebInspector.NetworkLogView._isMatchingSearchQuerySymbol] = this._matchRequest(nodes[i].request());
        var newMatchedRequestIndex = this._updateMatchCountAndFindMatchIndex(currentMatchedRequestNode);
        if (!newMatchedRequestIndex && jumpBackwards)
            newMatchedRequestIndex = this._matchedRequestCount - 1;
        this._highlightNthMatchedRequestForSearch(newMatchedRequestIndex, shouldJump);
    },

    /**
     * @override
     * @return {boolean}
     */
    supportsCaseSensitiveSearch: function()
    {
        return false;
    },

    /**
     * @override
     * @return {boolean}
     */
    supportsRegexSearch: function()
    {
        return false;
    },

    /**
     * @param {?WebInspector.NetworkDataGridNode} node
     * @return {number}
     */
    _updateMatchCountAndFindMatchIndex: function(node)
    {
        /** @type {!Array.<!WebInspector.NetworkDataGridNode>} */
        var nodes = this._dataGrid.rootNode().children;
        var matchCount = 0;
        var matchIndex = 0;
        for (var i = 0; i < nodes.length; ++i) {
            if (!nodes[i][WebInspector.NetworkLogView._isMatchingSearchQuerySymbol])
                continue;
            if (node === nodes[i])
                matchIndex = matchCount;
            matchCount++;
        }
        if (this._matchedRequestCount !== matchCount) {
            this._matchedRequestCount = matchCount;
            this.dispatchEventToListeners(WebInspector.NetworkLogView.EventTypes.SearchCountUpdated, matchCount);
        }
        return matchIndex;
    },

    /**
     * @param {number} index
     * @return {number}
     */
    _normalizeSearchResultIndex: function(index)
    {
        return (index + this._matchedRequestCount) % this._matchedRequestCount;
    },

    /**
     * @param {!WebInspector.NetworkDataGridNode} node
     * @return {boolean}
     */
    _applyFilter: function(node)
    {
        var request = node.request();
        if (this._timeFilter && !this._timeFilter(request))
            return false;
        var categoryName = request.resourceType().category().title;
        if (!this._resourceCategoryFilterUI.accept(categoryName))
            return false;
        if (this._dataURLFilterUI.checked() && request.parsedURL.isDataURL())
            return false;
        for (var i = 0; i < this._filters.length; ++i) {
            if (!this._filters[i](request))
                return false;
        }
        return true;
    },

    /**
     * @param {string} query
     */
    _parseFilterQuery: function(query)
    {
        var parsedQuery = this._suggestionBuilder.parseQuery(query);
        this._filters = parsedQuery.text.map(this._createTextFilter);
        var n = parsedQuery.filters.length;
        for (var i = 0; i < n; ++i) {
            var filter = parsedQuery.filters[i];
            var filterType = /** @type {!WebInspector.NetworkLogView.FilterType} */ (filter.type.toLowerCase());
            this._filters.push(this._createFilter(filterType, filter.data, filter.negative));
        }
    },

    /**
     * @param {string} text
     * @return {!WebInspector.NetworkLogView.Filter}
     */
    _createTextFilter: function(text)
    {
        var negative = false;
        if (text[0] === "-" && text.length > 1) {
            negative = true;
            text = text.substring(1);
        }
        var regexp = new RegExp(text.escapeForRegExp(), "i");
        var filter = WebInspector.NetworkLogView._requestNameOrPathFilter.bind(null, regexp);
        if (negative)
            filter = WebInspector.NetworkLogView._negativeFilter.bind(null, filter);
        return filter;
    },

    /**
     * @param {!WebInspector.NetworkLogView.FilterType} type
     * @param {string} value
     * @param {boolean} negative
     * @return {!WebInspector.NetworkLogView.Filter}
     */
    _createFilter: function(type, value, negative)
    {
        var filter = this._createSpecialFilter(type, value);
        if (!filter)
            return this._createTextFilter((negative ? "-" : "") + type + ":" + value);
        if (negative)
            return WebInspector.NetworkLogView._negativeFilter.bind(null, filter);
        return filter;
    },

    /**
     * @param {!WebInspector.NetworkLogView.FilterType} type
     * @param {string} value
     * @return {?WebInspector.NetworkLogView.Filter}
     */
    _createSpecialFilter: function(type, value)
    {
        switch (type) {
        case WebInspector.NetworkLogView.FilterType.Domain:
            return WebInspector.NetworkLogView._createRequestDomainFilter(value);

        case WebInspector.NetworkLogView.FilterType.HasResponseHeader:
            return WebInspector.NetworkLogView._requestResponseHeaderFilter.bind(null, value);

        case WebInspector.NetworkLogView.FilterType.Is:
            if (value.toLowerCase() === WebInspector.NetworkLogView.IsFilterType.Running)
                return WebInspector.NetworkLogView._runningRequestFilter;
            break;

        case WebInspector.NetworkLogView.FilterType.LargerThan:
            return this._createSizeFilter(value.toLowerCase());

        case WebInspector.NetworkLogView.FilterType.Method:
            return WebInspector.NetworkLogView._requestMethodFilter.bind(null, value);

        case WebInspector.NetworkLogView.FilterType.MimeType:
            return WebInspector.NetworkLogView._requestMimeTypeFilter.bind(null, value);

        case WebInspector.NetworkLogView.FilterType.MixedContent:
            return WebInspector.NetworkLogView._requestMixedContentFilter.bind(null, /** @type {!WebInspector.NetworkLogView.MixedContentFilterValues} */ (value));

        case WebInspector.NetworkLogView.FilterType.Scheme:
            return WebInspector.NetworkLogView._requestSchemeFilter.bind(null, value);

        case WebInspector.NetworkLogView.FilterType.SetCookieDomain:
            return WebInspector.NetworkLogView._requestSetCookieDomainFilter.bind(null, value);

        case WebInspector.NetworkLogView.FilterType.SetCookieName:
            return WebInspector.NetworkLogView._requestSetCookieNameFilter.bind(null, value);

        case WebInspector.NetworkLogView.FilterType.SetCookieValue:
            return WebInspector.NetworkLogView._requestSetCookieValueFilter.bind(null, value);

        case WebInspector.NetworkLogView.FilterType.StatusCode:
            return WebInspector.NetworkLogView._statusCodeFilter.bind(null, value);
        }
        return null;
    },

    /**
     * @param {string} value
     * @return {?WebInspector.NetworkLogView.Filter}
     */
    _createSizeFilter: function(value)
    {
        var multiplier = 1;
        if (value.endsWith("k")) {
            multiplier = 1024;
            value = value.substring(0, value.length - 1);
        } else if (value.endsWith("m")) {
            multiplier = 1024 * 1024;
            value = value.substring(0, value.length - 1);
        }
        var quantity  = Number(value);
        if (isNaN(quantity))
            return null;
        return WebInspector.NetworkLogView._requestSizeLargerThanFilter.bind(null, quantity * multiplier);
    },

    _filterRequests: function()
    {
        this._removeAllHighlights();
        this._invalidateAllItems();
    },

    /**
     * @override
     */
    jumpToPreviousSearchResult: function()
    {
        if (!this._matchedRequestCount)
            return;
        var index = this._normalizeSearchResultIndex(this._currentMatchedRequestIndex - 1);
        this._highlightNthMatchedRequestForSearch(index, true);
    },

    /**
     * @override
     */
    jumpToNextSearchResult: function()
    {
        if (!this._matchedRequestCount)
            return;
        var index = this._normalizeSearchResultIndex(this._currentMatchedRequestIndex + 1);
        this._highlightNthMatchedRequestForSearch(index, true);
    },

    /**
     * @override
     */
    searchCanceled: function()
    {
        delete this._searchRegExp;
        this._clearSearchMatchedList();
        this.dispatchEventToListeners(WebInspector.NetworkLogView.EventTypes.SearchCountUpdated, 0);
    },

    /**
     * @param {!WebInspector.NetworkRequest} request
     */
    revealAndHighlightRequest: function(request)
    {
        this._removeAllNodeHighlights();

        var node = this._nodesByRequestId.get(request.requestId);
        if (node) {
            node.reveal();
            this._highlightNode(node);
        }
    },

    _removeAllNodeHighlights: function()
    {
        if (this._highlightedNode) {
            this._highlightedNode.element().classList.remove("highlighted-row");
            delete this._highlightedNode;
        }
    },

    /**
     * @param {!WebInspector.NetworkDataGridNode} node
     */
    _highlightNode: function(node)
    {
        WebInspector.runCSSAnimationOnce(node.element(), "highlighted-row");
        this._highlightedNode = node;
    },

    /**
     * @param {!WebInspector.NetworkRequest} request
     * @param {string} platform
     * @return {string}
     */
    _generateCurlCommand: function(request, platform)
    {
        var command = ["curl"];
        // These headers are derived from URL (except "version") and would be added by cURL anyway.
        var ignoredHeaders = {"host": 1, "method": 1, "path": 1, "scheme": 1, "version": 1};

        function escapeStringWin(str)
        {
            /* Replace quote by double quote (but not by \") because it is
               recognized by both cmd.exe and MS Crt arguments parser.

               Replace % by "%" because it could be expanded to an environment
               variable value. So %% becomes "%""%". Even if an env variable ""
               (2 doublequotes) is declared, the cmd.exe will not
               substitute it with its value.

               Replace each backslash with double backslash to make sure
               MS Crt arguments parser won't collapse them.

               Replace new line outside of quotes since cmd.exe doesn't let
               to do it inside.
            */
            return "\"" + str.replace(/"/g, "\"\"")
                             .replace(/%/g, "\"%\"")
                             .replace(/\\/g, "\\\\")
                             .replace(/[\r\n]+/g, "\"^$&\"") + "\"";
        }

        function escapeStringPosix(str)
        {
            function escapeCharacter(x)
            {
                var code = x.charCodeAt(0);
                if (code < 256) {
                    // Add leading zero when needed to not care about the next character.
                    return code < 16 ? "\\x0" + code.toString(16) : "\\x" + code.toString(16);
                 }
                 code = code.toString(16);
                 return "\\u" + ("0000" + code).substr(code.length, 4);
             }

            if (/[^\x20-\x7E]|\'/.test(str)) {
                // Use ANSI-C quoting syntax.
                return "$\'" + str.replace(/\\/g, "\\\\")
                                  .replace(/\'/g, "\\\'")
                                  .replace(/\n/g, "\\n")
                                  .replace(/\r/g, "\\r")
                                  .replace(/[^\x20-\x7E]/g, escapeCharacter) + "'";
            } else {
                // Use single quote syntax.
                return "'" + str + "'";
            }
        }

        // cURL command expected to run on the same platform that DevTools run
        // (it may be different from the inspected page platform).
        var escapeString = platform === "win" ? escapeStringWin : escapeStringPosix;

        command.push(escapeString(request.url).replace(/[[{}\]]/g, "\\$&"));

        var inferredMethod = "GET";
        var data = [];
        var requestContentType = request.requestContentType();
        if (requestContentType && requestContentType.startsWith("application/x-www-form-urlencoded") && request.requestFormData) {
           data.push("--data");
           data.push(escapeString(request.requestFormData));
           ignoredHeaders["content-length"] = true;
           inferredMethod = "POST";
        } else if (request.requestFormData) {
           data.push("--data-binary");
           data.push(escapeString(request.requestFormData));
           ignoredHeaders["content-length"] = true;
           inferredMethod = "POST";
        }

        if (request.requestMethod !== inferredMethod) {
            command.push("-X");
            command.push(request.requestMethod);
        }

        var requestHeaders = request.requestHeaders();
        for (var i = 0; i < requestHeaders.length; i++) {
            var header = requestHeaders[i];
            var name = header.name.replace(/^:/, ""); // Translate SPDY v3 headers to HTTP headers.
            if (name.toLowerCase() in ignoredHeaders)
                continue;
            command.push("-H");
            command.push(escapeString(name + ": " + header.value));
        }
        command = command.concat(data);
        command.push("--compressed");

        if (request.securityState() === SecurityAgent.SecurityState.Insecure)
            command.push("--insecure");
        return command.join(" ");
    },

    __proto__: WebInspector.VBox.prototype
}

/** @typedef {function(!WebInspector.NetworkRequest): boolean} */
WebInspector.NetworkLogView.Filter;

/**
 * @param {!WebInspector.NetworkLogView.Filter} filter
 * @param {!WebInspector.NetworkRequest} request
 * @return {boolean}
 */
WebInspector.NetworkLogView._negativeFilter = function(filter, request)
{
    return !filter(request);
}

/**
 * @param {!RegExp} regex
 * @param {!WebInspector.NetworkRequest} request
 * @return {boolean}
 */
WebInspector.NetworkLogView._requestNameOrPathFilter = function(regex, request)
{
    return regex.test(request.name()) || regex.test(request.path());
}

/**
 * @param {string} domain
 * @return {!Array.<string>}
 */
WebInspector.NetworkLogView._subdomains = function(domain)
{
    var result = [domain];
    var indexOfPeriod = domain.indexOf(".");
    while (indexOfPeriod !== -1) {
        result.push("*" + domain.substring(indexOfPeriod));
        indexOfPeriod = domain.indexOf(".", indexOfPeriod + 1);
    }
    return result;
}

/**
 * @param {string} value
 * @return {!WebInspector.NetworkLogView.Filter}
 */
WebInspector.NetworkLogView._createRequestDomainFilter = function(value)
{
    /**
     * @param {string} string
     * @return {string}
     */
    function escapeForRegExp(string)
    {
        return string.escapeForRegExp();
    }
    var escapedPattern = value.split("*").map(escapeForRegExp).join(".*");
    return WebInspector.NetworkLogView._requestDomainFilter.bind(null, new RegExp("^" + escapedPattern + "$", "i"));
}

/**
 * @param {!RegExp} regex
 * @param {!WebInspector.NetworkRequest} request
 * @return {boolean}
 */
WebInspector.NetworkLogView._requestDomainFilter = function(regex, request)
{
    return regex.test(request.domain);
}

/**
 * @param {!WebInspector.NetworkRequest} request
 * @return {boolean}
 */
WebInspector.NetworkLogView._runningRequestFilter = function(request)
{
    return !request.finished;
}

/**
 * @param {string} value
 * @param {!WebInspector.NetworkRequest} request
 * @return {boolean}
 */
WebInspector.NetworkLogView._requestResponseHeaderFilter = function(value, request)
{
    return request.responseHeaderValue(value) !== undefined;
}

/**
 * @param {string} value
 * @param {!WebInspector.NetworkRequest} request
 * @return {boolean}
 */
WebInspector.NetworkLogView._requestMethodFilter = function(value, request)
{
    return request.requestMethod === value;
}

/**
 * @param {string} value
 * @param {!WebInspector.NetworkRequest} request
 * @return {boolean}
 */
WebInspector.NetworkLogView._requestMimeTypeFilter = function(value, request)
{
    return request.mimeType === value;
}

/**
 * @param {!WebInspector.NetworkLogView.MixedContentFilterValues} value
 * @param {!WebInspector.NetworkRequest} request
 * @return {boolean}
 */
WebInspector.NetworkLogView._requestMixedContentFilter = function(value, request)
{
    if (value === WebInspector.NetworkLogView.MixedContentFilterValues.Displayed) {
        return request.mixedContentType === "optionally-blockable";
    } else if (value === WebInspector.NetworkLogView.MixedContentFilterValues.Blocked) {
        return request.mixedContentType === "blockable" && request.wasBlocked();
    } else if (value === WebInspector.NetworkLogView.MixedContentFilterValues.BlockOverridden) {
        return request.mixedContentType === "blockable" && !request.wasBlocked();
    } else if (value === WebInspector.NetworkLogView.MixedContentFilterValues.All) {
        return request.mixedContentType !== "none";
    }
    return false;
}

/**
 * @param {string} value
 * @param {!WebInspector.NetworkRequest} request
 * @return {boolean}
 */
WebInspector.NetworkLogView._requestSchemeFilter = function(value, request)
{
    return request.scheme === value;
}

/**
 * @param {string} value
 * @param {!WebInspector.NetworkRequest} request
 * @return {boolean}
 */
WebInspector.NetworkLogView._requestSetCookieDomainFilter = function(value, request)
{
    var cookies = request.responseCookies;
    for (var i = 0, l = cookies ? cookies.length : 0; i < l; ++i) {
        if (cookies[i].domain() === value)
            return true;
    }
    return false;
}

/**
 * @param {string} value
 * @param {!WebInspector.NetworkRequest} request
 * @return {boolean}
 */
WebInspector.NetworkLogView._requestSetCookieNameFilter = function(value, request)
{
    var cookies = request.responseCookies;
    for (var i = 0, l = cookies ? cookies.length : 0; i < l; ++i) {
        if (cookies[i].name() === value)
            return true;
    }
    return false;
}

/**
 * @param {string} value
 * @param {!WebInspector.NetworkRequest} request
 * @return {boolean}
 */
WebInspector.NetworkLogView._requestSetCookieValueFilter = function(value, request)
{
    var cookies = request.responseCookies;
    for (var i = 0, l = cookies ? cookies.length : 0; i < l; ++i) {
        if (cookies[i].value() === value)
            return true;
    }
    return false;
}

/**
 * @param {number} value
 * @param {!WebInspector.NetworkRequest} request
 * @return {boolean}
 */
WebInspector.NetworkLogView._requestSizeLargerThanFilter = function(value, request)
{
    return request.transferSize >= value;
}

/**
 * @param {string} value
 * @param {!WebInspector.NetworkRequest} request
 * @return {boolean}
 */
WebInspector.NetworkLogView._statusCodeFilter = function(value, request)
{
    return ("" + request.statusCode) === value;
}

/**
 * @param {!WebInspector.NetworkRequest} request
 * @return {boolean}
 */
WebInspector.NetworkLogView.HTTPRequestsFilter = function(request)
{
    return request.parsedURL.isValid && (request.scheme in WebInspector.NetworkLogView.HTTPSchemas);
}

/**
 * @param {!WebInspector.NetworkRequest} request
 * @return {boolean}
 */
WebInspector.NetworkLogView.FinishedRequestsFilter = function(request)
{
    return request.finished;
}

/**
 * @param {number} windowStart
 * @param {number} windowEnd
 * @param {!WebInspector.NetworkRequest} request
 * @return {boolean}
 */
WebInspector.NetworkLogView._requestTimeFilter = function(windowStart, windowEnd, request)
{
    if (request.issueTime() > windowEnd)
        return false;
    if (request.endTime !== -1 && request.endTime < windowStart)
        return false;
    return true;
}

WebInspector.NetworkLogView.EventTypes = {
    RequestSelected: "RequestSelected",
    SearchCountUpdated: "SearchCountUpdated",
    SearchIndexUpdated: "SearchIndexUpdated",
    UpdateRequest: "UpdateRequest"
};
