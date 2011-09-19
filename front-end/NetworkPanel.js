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

WebInspector.NetworkLogView = function(parentElement)
{
    // FIXME: some of the styles should be loaded on demand by components that need them.
    var styles = [
        "inspectorCommon.css",
        "dataGrid.css",
        "networkLogView.css"
    ];
    WebInspector.IFrameView.call(this, parentElement, styles);

    this._allowResourceSelection = false;
    this._resources = [];
    this._resourcesById = {};
    this._resourcesByURL = {};
    this._staleResources = [];
    this._resourceGridNodes = {};
    this._lastResourceGridNodeId = 0;
    this._mainResourceLoadTime = -1;
    this._mainResourceDOMContentTime = -1;
    this._hiddenCategories = {};
    this._matchedResources = [];
    this._matchedResourcesMap = {};
    this._currentMatchedResourceIndex = -1;

    this._categories = WebInspector.resourceCategories;

    this._createStatusbarButtons();
    this._createFilterStatusBarItems();

    WebInspector.networkManager.addEventListener(WebInspector.NetworkManager.EventTypes.ResourceStarted, this._onResourceStarted, this);
    WebInspector.networkManager.addEventListener(WebInspector.NetworkManager.EventTypes.ResourceUpdated, this._onResourceUpdated, this);
    WebInspector.networkManager.addEventListener(WebInspector.NetworkManager.EventTypes.ResourceFinished, this._onResourceUpdated, this);

    WebInspector.resourceTreeModel.addEventListener(WebInspector.ResourceTreeModel.EventTypes.FrameNavigated, this._frameNavigated, this);
    WebInspector.resourceTreeModel.addEventListener(WebInspector.ResourceTreeModel.EventTypes.OnLoad, this._onLoadEventFired, this);
    WebInspector.resourceTreeModel.addEventListener(WebInspector.ResourceTreeModel.EventTypes.DOMContentLoaded, this._domContentLoadedEventFired, this);
}

WebInspector.NetworkLogView.prototype = {
    initializeView: function()
    {
        this.element.id = "network-container";

        this._createSortingFunctions();
        this._createTable();
        this._createTimelineGrid();
        this._createSummaryBar();

        if (!this.useLargeRows)
            this._setLargerResources(this.useLargeRows);

        this._allowPopover = true;
        this._popoverHelper = new WebInspector.PopoverHelper(this.element, this._getPopoverAnchor.bind(this), this._showPopover.bind(this));
        // Enable faster hint.
        this._popoverHelper.setTimeout(100);

        this.calculator = new WebInspector.NetworkTransferTimeCalculator();
        this._filter(this._filterAllElement, false);

        this.switchToDetailedView();
    },

    get statusBarItems()
    {
        return [this._largerResourcesButton.element, this._preserveLogToggle.element, this._clearButton.element, this._filterBarElement];
    },

    get useLargeRows()
    {
        return WebInspector.settings.resourcesLargeRows.get();
    },

    set allowPopover(flag)
    {
        this._allowPopover = flag;
    },

    get allowResourceSelection()
    {
        return this._allowResourceSelection;
    },

    set allowResourceSelection(flag)
    {
        this._allowResourceSelection = !!flag;
    },

    elementsToRestoreScrollPositionsFor: function()
    {
        if (!this._dataGrid) // Not initialized yet.
            return [];
        return [this._dataGrid.scrollContainer];
    },

    onResize: function()
    {
        this._dataGrid.updateWidths();
        this._updateOffscreenRows();
    },

    _createTimelineGrid: function()
    {
        this._timelineGrid = new WebInspector.TimelineGrid();
        this._timelineGrid.element.addStyleClass("network-timeline-grid");
        this._dataGrid.element.appendChild(this._timelineGrid.element);
    },

    _createTable: function()
    {
        var columns;
        if (Preferences.showNetworkPanelInitiatorColumn)
            columns = {name: {}, method: {}, status: {}, type: {}, initiator: {}, size: {}, time: {}, timeline: {}};
        else
            columns = {name: {}, method: {}, status: {}, type: {}, size: {}, time: {}, timeline: {}};
        columns.name.titleDOMFragment = this._makeHeaderFragment(WebInspector.UIString("Name"), WebInspector.UIString("Path"));
        columns.name.sortable = true;
        columns.name.width = "20%";
        columns.name.disclosure = true;

        columns.method.title = WebInspector.UIString("Method");
        columns.method.sortable = true;
        columns.method.width = "6%";

        columns.status.titleDOMFragment = this._makeHeaderFragment(WebInspector.UIString("Status"), WebInspector.UIString("Text"));
        columns.status.sortable = true;
        columns.status.width = "6%";

        columns.type.title = WebInspector.UIString("Type");
        columns.type.sortable = true;
        columns.type.width = "6%";

        if (Preferences.showNetworkPanelInitiatorColumn) {
            columns.initiator.title = WebInspector.UIString("Initiator");
            columns.initiator.sortable = true;
            columns.initiator.width = "10%";
        }

        columns.size.titleDOMFragment = this._makeHeaderFragment(WebInspector.UIString("Size"), WebInspector.UIString("Content"));
        columns.size.sortable = true;
        columns.size.width = "6%";
        columns.size.aligned = "right";

        columns.time.titleDOMFragment = this._makeHeaderFragment(WebInspector.UIString("Time"), WebInspector.UIString("Latency"));
        columns.time.sortable = true;
        columns.time.width = "6%";
        columns.time.aligned = "right";

        columns.timeline.title = "";
        columns.timeline.sortable = false;
        if (Preferences.showNetworkPanelInitiatorColumn)
            columns.timeline.width = "40%";
        else
            columns.timeline.width = "50%";
        columns.timeline.sort = "ascending";

        this._dataGrid = new WebInspector.DataGrid(columns);
        this._dataGrid.resizeMethod = WebInspector.DataGrid.ResizeMethod.Last;
        this._dataGrid.element.addStyleClass("network-log-grid");
        this._dataGrid.element.addEventListener("contextmenu", this._contextMenu.bind(this), true);

        this.element.appendChild(this._dataGrid.element);

        // Event listeners need to be added _after_ we attach to the document, so that owner document is properly update.
        this._dataGrid.addEventListener("sorting changed", this._sortItems, this);
        this._dataGrid.addEventListener("width changed", this._updateDividersIfNeeded, this);
        this._dataGrid.scrollContainer.addEventListener("scroll", this._updateOffscreenRows.bind(this));

        this._patchTimelineHeader();
    },

    _makeHeaderFragment: function(title, subtitle)
    {
        var fragment = document.createDocumentFragment();
        fragment.appendChild(document.createTextNode(title));
        var subtitleDiv = document.createElement("div");
        subtitleDiv.className = "network-header-subtitle";
        subtitleDiv.textContent = subtitle;
        fragment.appendChild(subtitleDiv);
        return fragment;
    },

    _patchTimelineHeader: function()
    {
        var timelineSorting = document.createElement("select");

        var option = document.createElement("option");
        option.value = "startTime";
        option.label = WebInspector.UIString("Timeline");
        timelineSorting.appendChild(option);

        option = document.createElement("option");
        option.value = "startTime";
        option.label = WebInspector.UIString("Start Time");
        timelineSorting.appendChild(option);

        option = document.createElement("option");
        option.value = "responseTime";
        option.label = WebInspector.UIString("Response Time");
        timelineSorting.appendChild(option);

        option = document.createElement("option");
        option.value = "endTime";
        option.label = WebInspector.UIString("End Time");
        timelineSorting.appendChild(option);

        option = document.createElement("option");
        option.value = "duration";
        option.label = WebInspector.UIString("Duration");
        timelineSorting.appendChild(option);

        option = document.createElement("option");
        option.value = "latency";
        option.label = WebInspector.UIString("Latency");
        timelineSorting.appendChild(option);

        var header = this._dataGrid.headerTableHeader("timeline");
        header.replaceChild(timelineSorting, header.firstChild);

        timelineSorting.addEventListener("click", function(event) { event.stopPropagation() }, false);
        timelineSorting.addEventListener("change", this._sortByTimeline.bind(this), false);
        this._timelineSortSelector = timelineSorting;
    },

    _createSortingFunctions: function()
    {
        this._sortingFunctions = {};
        this._sortingFunctions.name = WebInspector.NetworkDataGridNode.NameComparator;
        this._sortingFunctions.method = WebInspector.NetworkDataGridNode.ResourcePropertyComparator.bind(null, "method", false);
        this._sortingFunctions.status = WebInspector.NetworkDataGridNode.ResourcePropertyComparator.bind(null, "statusCode", false);
        this._sortingFunctions.type = WebInspector.NetworkDataGridNode.ResourcePropertyComparator.bind(null, "mimeType", false);
        this._sortingFunctions.initiator = WebInspector.NetworkDataGridNode.InitiatorComparator;
        this._sortingFunctions.size = WebInspector.NetworkDataGridNode.SizeComparator;
        this._sortingFunctions.time = WebInspector.NetworkDataGridNode.ResourcePropertyComparator.bind(null, "duration", false);
        this._sortingFunctions.timeline = WebInspector.NetworkDataGridNode.ResourcePropertyComparator.bind(null, "startTime", false);
        this._sortingFunctions.startTime = WebInspector.NetworkDataGridNode.ResourcePropertyComparator.bind(null, "startTime", false);
        this._sortingFunctions.endTime = WebInspector.NetworkDataGridNode.ResourcePropertyComparator.bind(null, "endTime", false);
        this._sortingFunctions.responseTime = WebInspector.NetworkDataGridNode.ResourcePropertyComparator.bind(null, "responseReceivedTime", false);
        this._sortingFunctions.duration = WebInspector.NetworkDataGridNode.ResourcePropertyComparator.bind(null, "duration", true);
        this._sortingFunctions.latency = WebInspector.NetworkDataGridNode.ResourcePropertyComparator.bind(null, "latency", true);

        var timeCalculator = new WebInspector.NetworkTransferTimeCalculator();
        var durationCalculator = new WebInspector.NetworkTransferDurationCalculator();

        this._calculators = {};
        this._calculators.timeline = timeCalculator;
        this._calculators.startTime = timeCalculator;
        this._calculators.endTime = timeCalculator;
        this._calculators.responseTime = timeCalculator;
        this._calculators.duration = durationCalculator;
        this._calculators.latency = durationCalculator;
    },

    _sortItems: function()
    {
        this._removeAllNodeHighlights();
        var columnIdentifier = this._dataGrid.sortColumnIdentifier;
        if (columnIdentifier === "timeline") {
            this._sortByTimeline();
            return;
        }
        var sortingFunction = this._sortingFunctions[columnIdentifier];
        if (!sortingFunction)
            return;

        this._dataGrid.sortNodes(sortingFunction, this._dataGrid.sortOrder === "descending");
        this._timelineSortSelector.selectedIndex = 0;
        this._updateOffscreenRows();

        this.performSearch(null, true);
    },

    _sortByTimeline: function()
    {
        this._removeAllNodeHighlights();
        var selectedIndex = this._timelineSortSelector.selectedIndex;
        if (!selectedIndex)
            selectedIndex = 1; // Sort by start time by default.
        var selectedOption = this._timelineSortSelector[selectedIndex];
        var value = selectedOption.value;

        var sortingFunction = this._sortingFunctions[value];
        this._dataGrid.sortNodes(sortingFunction);
        this.calculator = this._calculators[value];
        if (this.calculator.startAtZero)
            this._timelineGrid.hideEventDividers();
        else
            this._timelineGrid.showEventDividers();
        this._dataGrid.markColumnAsSortedBy("timeline", "ascending");
        this._updateOffscreenRows();
    },

    _createFilterStatusBarItems: function()
    {
        var filterBarElement = document.createElement("div");
        filterBarElement.className = "scope-bar status-bar-item";
        filterBarElement.id = "network-filter";

        function createFilterElement(category, label)
        {
            var categoryElement = document.createElement("li");
            categoryElement.category = category;
            categoryElement.className = category;
            categoryElement.appendChild(document.createTextNode(label));
            categoryElement.addEventListener("click", this._updateFilter.bind(this), false);
            filterBarElement.appendChild(categoryElement);

            return categoryElement;
        }

        this._filterAllElement = createFilterElement.call(this, "all", WebInspector.UIString("All"));

        // Add a divider
        var dividerElement = document.createElement("div");
        dividerElement.addStyleClass("scope-bar-divider");
        filterBarElement.appendChild(dividerElement);

        for (var category in this._categories)
            createFilterElement.call(this, category, this._categories[category].title);
        this._filterBarElement = filterBarElement;
    },

    _createSummaryBar: function()
    {
        var tbody = this._dataGrid.dataTableBody;
        var tfoot = document.createElement("tfoot");
        var tr = tfoot.createChild("tr", "revealed network-summary-bar");
        var td = tr.createChild("td");
        td.setAttribute("colspan", 7);
        tbody.parentNode.insertBefore(tfoot, tbody);
        this._summaryBarElement = td;
    },

    _updateSummaryBar: function()
    {
        var requestsNumber = this._resources.length;

        if (!requestsNumber) {
            if (this._summaryBarElement._isDisplayingWarning)
                return;
            this._summaryBarElement._isDisplayingWarning = true;

            var img = document.createElement("img");
            img.src = "Images/warningIcon.png";
            this._summaryBarElement.removeChildren();
            this._summaryBarElement.appendChild(img);
            this._summaryBarElement.appendChild(document.createTextNode(
                WebInspector.UIString("No requests captured. Reload the page to see detailed information on the network activity.")));
            return;
        }
        delete this._summaryBarElement._isDisplayingWarning;

        var transferSize = 0;
        var selectedRequestsNumber = 0;
        var selectedTransferSize = 0;
        var baseTime = -1;
        var maxTime = -1;
        for (var i = 0; i < this._resources.length; ++i) {
            var resource = this._resources[i];
            var resourceTransferSize = (resource.cached || !resource.transferSize) ? 0 : resource.transferSize;
            transferSize += resourceTransferSize;
            if (!this._hiddenCategories.all || !this._hiddenCategories[resource.category.name]) {
                selectedRequestsNumber++;
                selectedTransferSize += resourceTransferSize;
            }
            if (resource === WebInspector.mainResource)
                baseTime = resource.startTime;
            if (resource.endTime > maxTime)
                maxTime = resource.endTime;
        }
        var text = "";
        if (this._hiddenCategories.all) {
            text += String.sprintf(WebInspector.UIString("%d / %d requests"), selectedRequestsNumber, requestsNumber);
            text += "  \u2758  " + String.sprintf(WebInspector.UIString("%s / %s transferred"), Number.bytesToString(selectedTransferSize), Number.bytesToString(transferSize));
        } else {
            text += String.sprintf(WebInspector.UIString("%d requests"), requestsNumber);
            text += "  \u2758  " + String.sprintf(WebInspector.UIString("%s transferred"), Number.bytesToString(transferSize));
        }
        if (baseTime !== -1 && this._mainResourceLoadTime !== -1 && this._mainResourceDOMContentTime !== -1 && this._mainResourceDOMContentTime > baseTime) {
            text += "  \u2758  " + String.sprintf(WebInspector.UIString("%s (onload: %s, DOMContentLoaded: %s)"),
                        Number.secondsToString(maxTime - baseTime),
                        Number.secondsToString(this._mainResourceLoadTime - baseTime),
                        Number.secondsToString(this._mainResourceDOMContentTime - baseTime));
        }
        this._summaryBarElement.textContent = text;
    },

    _showCategory: function(category)
    {
        this._dataGrid.element.addStyleClass("filter-" + category);
        delete this._hiddenCategories[category];
    },

    _hideCategory: function(category)
    {
        this._dataGrid.element.removeStyleClass("filter-" + category);
        this._hiddenCategories[category] = true;
    },

    _updateFilter: function(e)
    {
        this._removeAllNodeHighlights();
        var isMac = WebInspector.isMac();
        var selectMultiple = false;
        if (isMac && e.metaKey && !e.ctrlKey && !e.altKey && !e.shiftKey)
            selectMultiple = true;
        if (!isMac && e.ctrlKey && !e.metaKey && !e.altKey && !e.shiftKey)
            selectMultiple = true;

        this._filter(e.target, selectMultiple);
        this.performSearch(null, true);
        this._updateSummaryBar();
    },

    _filter: function(target, selectMultiple)
    {
        function unselectAll()
        {
            for (var i = 0; i < this._filterBarElement.childNodes.length; ++i) {
                var child = this._filterBarElement.childNodes[i];
                if (!child.category)
                    continue;

                child.removeStyleClass("selected");
                this._hideCategory(child.category);
            }
        }

        if (target.category === this._filterAllElement) {
            if (target.hasStyleClass("selected")) {
                // We can't unselect All, so we break early here
                return;
            }

            // If All wasn't selected, and now is, unselect everything else.
            unselectAll.call(this);
        } else {
            // Something other than All is being selected, so we want to unselect All.
            if (this._filterAllElement.hasStyleClass("selected")) {
                this._filterAllElement.removeStyleClass("selected");
                this._hideCategory("all");
            }
        }

        if (!selectMultiple) {
            // If multiple selection is off, we want to unselect everything else
            // and just select ourselves.
            unselectAll.call(this);

            target.addStyleClass("selected");
            this._showCategory(target.category);
            this._updateOffscreenRows();
            return;
        }

        if (target.hasStyleClass("selected")) {
            // If selectMultiple is turned on, and we were selected, we just
            // want to unselect ourselves.
            target.removeStyleClass("selected");
            this._hideCategory(target.category);
        } else {
            // If selectMultiple is turned on, and we weren't selected, we just
            // want to select ourselves.
            target.addStyleClass("selected");
            this._showCategory(target.category);
        }
        this._updateOffscreenRows();
    },

    _scheduleRefresh: function()
    {
        if (this._needsRefresh)
            return;

        this._needsRefresh = true;

        if (this.visible && !("_refreshTimeout" in this))
            this._refreshTimeout = setTimeout(this.refresh.bind(this), 500);
    },

    _updateDividersIfNeeded: function(force)
    {
        if (!this._dataGrid)
            return;
        var timelineColumn = this._dataGrid.columns.timeline;
        for (var i = 0; i < this._dataGrid.resizers.length; ++i) {
            if (timelineColumn.ordinal === this._dataGrid.resizers[i].rightNeighboringColumnID) {
                // Position timline grid location.
                this._timelineGrid.element.style.left = this._dataGrid.resizers[i].style.left;
                this._timelineGrid.element.style.right = "18px";
            }
        }

        var proceed = true;
        if (!this.visible) {
            this._scheduleRefresh();
            proceed = false;
        } else
            proceed = this._timelineGrid.updateDividers(force, this.calculator);

        if (!proceed)
            return;

        if (this.calculator.startAtZero || !this.calculator.computePercentageFromEventTime) {
            // If our current sorting method starts at zero, that means it shows all
            // resources starting at the same point, and so onLoad event and DOMContent
            // event lines really wouldn't make much sense here, so don't render them.
            // Additionally, if the calculator doesn't have the computePercentageFromEventTime
            // function defined, we are probably sorting by size, and event times aren't relevant
            // in this case.
            return;
        }

        this._timelineGrid.removeEventDividers();
        if (this._mainResourceLoadTime !== -1) {
            var percent = this.calculator.computePercentageFromEventTime(this._mainResourceLoadTime);

            var loadDivider = document.createElement("div");
            loadDivider.className = "network-event-divider network-red-divider";

            var loadDividerPadding = document.createElement("div");
            loadDividerPadding.className = "network-event-divider-padding";
            loadDividerPadding.title = WebInspector.UIString("Load event fired");
            loadDividerPadding.appendChild(loadDivider);
            loadDividerPadding.style.left = percent + "%";
            this._timelineGrid.addEventDivider(loadDividerPadding);
        }

        if (this._mainResourceDOMContentTime !== -1) {
            var percent = this.calculator.computePercentageFromEventTime(this._mainResourceDOMContentTime);

            var domContentDivider = document.createElement("div");
            domContentDivider.className = "network-event-divider network-blue-divider";

            var domContentDividerPadding = document.createElement("div");
            domContentDividerPadding.className = "network-event-divider-padding";
            domContentDividerPadding.title = WebInspector.UIString("DOMContent event fired");
            domContentDividerPadding.appendChild(domContentDivider);
            domContentDividerPadding.style.left = percent + "%";
            this._timelineGrid.addEventDivider(domContentDividerPadding);
        }
    },

    _refreshIfNeeded: function()
    {
        if (this._needsRefresh)
            this.refresh();
    },

    _invalidateAllItems: function()
    {
        this._staleResources = this._resources.slice();
    },

    get calculator()
    {
        return this._calculator;
    },

    set calculator(x)
    {
        if (!x || this._calculator === x)
            return;

        this._calculator = x;
        this._calculator.reset();

        this._invalidateAllItems();
        this.refresh();
    },

    _resourceGridNode: function(resource)
    {
        return this._resourceGridNodes[resource.__gridNodeId];
    },

    _createResourceGridNode: function(resource)
    {
        var node = new WebInspector.NetworkDataGridNode(this, resource);
        resource.__gridNodeId = this._lastResourceGridNodeId++;
        this._resourceGridNodes[resource.__gridNodeId] = node;
        return node;
    },

    _createStatusbarButtons: function()
    {
        this._preserveLogToggle = new WebInspector.StatusBarButton(WebInspector.UIString("Preserve Log upon Navigation"), "record-profile-status-bar-item");
        this._preserveLogToggle.addEventListener("click", this._onPreserveLogClicked.bind(this), false);

        this._clearButton = new WebInspector.StatusBarButton(WebInspector.UIString("Clear"), "clear-status-bar-item");
        this._clearButton.addEventListener("click", this._reset.bind(this), false);

        this._largerResourcesButton = new WebInspector.StatusBarButton(WebInspector.UIString("Use small resource rows."), "network-larger-resources-status-bar-item");
        this._largerResourcesButton.toggled = WebInspector.settings.resourcesLargeRows.get();
        this._largerResourcesButton.addEventListener("click", this._toggleLargerResources.bind(this), false);
    },

    _onLoadEventFired: function(event)
    {
        this._mainResourceLoadTime = event.data || -1;
        // Schedule refresh to update boundaries and draw the new line.
        this._scheduleRefresh(true);
    },

    _domContentLoadedEventFired: function(event)
    {
        this._mainResourceDOMContentTime = event.data || -1;
        // Schedule refresh to update boundaries and draw the new line.
        this._scheduleRefresh(true);
    },

    wasShown: function()
    {
        WebInspector.IFrameView.prototype.wasShown.call(this);
        this._refreshIfNeeded();
    },

    willHide: function()
    {
        WebInspector.IFrameView.prototype.willHide.call(this);
        this._popoverHelper.hidePopover();
    },

    refresh: function()
    {
        this._needsRefresh = false;
        if ("_refreshTimeout" in this) {
            clearTimeout(this._refreshTimeout);
            delete this._refreshTimeout;
        }

        this._removeAllNodeHighlights();
        var wasScrolledToLastRow = this._dataGrid.isScrolledToLastRow();
        var staleItemsLength = this._staleResources.length;
        var boundariesChanged = false;
        if (this.calculator.updateBoundariesForEventTime) {
            boundariesChanged = this.calculator.updateBoundariesForEventTime(this._mainResourceLoadTime) || boundariesChanged;
            boundariesChanged = this.calculator.updateBoundariesForEventTime(this._mainResourceDOMContentTime) || boundariesChanged;
        }

        for (var i = 0; i < staleItemsLength; ++i) {
            var resource = this._staleResources[i];
            var node = this._resourceGridNode(resource);
            if (!node) {
                // Create the timeline tree element and graph.
                node = this._createResourceGridNode(resource);
                this._dataGrid.appendChild(node);
            }
            node.refreshResource();

            if (this.calculator.updateBoundaries(resource))
                boundariesChanged = true;

            if (!node.isFilteredOut())
                this._updateHighlightIfMatched(resource);
        }

        if (boundariesChanged) {
            // The boundaries changed, so all item graphs are stale.
            this._invalidateAllItems();
            staleItemsLength = this._staleResources.length;
        }

        for (var i = 0; i < staleItemsLength; ++i)
            this._resourceGridNode(this._staleResources[i]).refreshGraph(this.calculator);

        this._staleResources = [];
        this._sortItems();
        this._updateSummaryBar();
        this._updateOffscreenRows();
        this._dataGrid.updateWidths();

        if (wasScrolledToLastRow)
            this._dataGrid.scrollToLastRow();
    },

    _onPreserveLogClicked: function(e)
    {
        this._preserveLogToggle.toggled = !this._preserveLogToggle.toggled;
    },

    _reset: function()
    {
        this.dispatchEventToListeners(WebInspector.NetworkLogView.EventTypes.ViewCleared);

        this._clearSearchMatchedList();
        if (this._popoverHelper)
            this._popoverHelper.hidePopover();

        if (this._calculator)
            this._calculator.reset();

        this._resources = [];
        this._resourcesById = {};
        this._resourcesByURL = {};
        this._staleResources = [];
        this._resourceGridNodes = {};

        if (this._dataGrid) {
            this._dataGrid.removeChildren();
            this._updateDividersIfNeeded(true);
            this._updateSummaryBar();
        }

        this._mainResourceLoadTime = -1;
        this._mainResourceDOMContentTime = -1;

    },

    get resources()
    {
        return this._resources;
    },

    resourceById: function(id)
    {
        return this._resourcesById[id];
    },

    _onResourceStarted: function(event)
    {
        this._appendResource(event.data);
    },

    _appendResource: function(resource)
    {
        this._resources.push(resource);

        // In case of redirect request id is reassigned to a redirected
        // resource and we need to update _resourcesById ans search results.
        if (this._resourcesById[resource.requestId]) {
            var oldResource = resource.redirects[resource.redirects.length - 1];
            this._resourcesById[oldResource.requestId] = oldResource;

            this._updateSearchMatchedListAfterRequestIdChanged(resource.requestId, oldResource.requestId);
        }
        this._resourcesById[resource.requestId] = resource;

        this._resourcesByURL[resource.url] = resource;

        // Pull all the redirects of the main resource upon commit load.
        if (resource.redirects) {
            for (var i = 0; i < resource.redirects.length; ++i)
                this._refreshResource(resource.redirects[i]);
        }

        this._refreshResource(resource);
    },

    _onResourceUpdated: function(event)
    {
        this._refreshResource(event.data);
    },

    _refreshResource: function(resource)
    {
        this._staleResources.push(resource);
        this._scheduleRefresh();
    },

    clear: function()
    {
        if (this._preserveLogToggle.toggled)
            return;
        this._reset();
    },

    _frameNavigated: function(event)
    {
        if (!event.data.isMainFrame)
            return;

        var loaderId = event.data.loaderId;
        // Main frame committed load.
        if (this._preserveLogToggle.toggled)
            return;

        // Preserve provisional load resources.
        var resourcesToPreserve = [];
        for (var i = 0; i < this._resources.length; ++i) {
            var resource = this._resources[i];
            if (resource.loaderId === loaderId)
                resourcesToPreserve.push(resource);
        }

        this._reset();

        // Restore preserved items.
        for (var i = 0; i < resourcesToPreserve.length; ++i)
            this._appendResource(resourcesToPreserve[i]);
    },

    switchToDetailedView: function()
    {
        if (!this._dataGrid)
            return;
        if (this._dataGrid.selectedNode)
            this._dataGrid.selectedNode.selected = false;

        this.element.removeStyleClass("brief-mode");

        this._dataGrid.showColumn("method");
        this._dataGrid.showColumn("status");
        this._dataGrid.showColumn("type");
        if (Preferences.showNetworkPanelInitiatorColumn)
            this._dataGrid.showColumn("initiator");
        this._dataGrid.showColumn("size");
        this._dataGrid.showColumn("time");
        this._dataGrid.showColumn("timeline");

        var widths = {};
        widths.name = 20;
        widths.method = 6;
        widths.status = 6;
        widths.type = 6;
        if (Preferences.showNetworkPanelInitiatorColumn)
            widths.initiator = 10;
        widths.size = 6;
        widths.time = 6;
        if (Preferences.showNetworkPanelInitiatorColumn)
            widths.timeline = 40;
        else
            widths.timeline = 50;

        this._dataGrid.applyColumnWidthsMap(widths);
    },

    switchToBriefView: function()
    {
        this.element.addStyleClass("brief-mode");
        this._removeAllNodeHighlights();

        this._dataGrid.hideColumn("method");
        this._dataGrid.hideColumn("status");
        this._dataGrid.hideColumn("type");
        if (Preferences.showNetworkPanelInitiatorColumn)
            this._dataGrid.hideColumn("initiator");
        this._dataGrid.hideColumn("size");
        this._dataGrid.hideColumn("time");
        this._dataGrid.hideColumn("timeline");

        var widths = {};
        widths.name = 100;
        this._dataGrid.applyColumnWidthsMap(widths);

        this._popoverHelper.hidePopover();
    },

    _toggleLargerResources: function()
    {
        WebInspector.settings.resourcesLargeRows.set(!WebInspector.settings.resourcesLargeRows.get());
        this._setLargerResources(WebInspector.settings.resourcesLargeRows.get());
    },

    _setLargerResources: function(enabled)
    {
        this._largerResourcesButton.toggled = enabled;
        if (!enabled) {
            this._largerResourcesButton.title = WebInspector.UIString("Use large resource rows.");
            this._dataGrid.element.addStyleClass("small");
            this._timelineGrid.element.addStyleClass("small");
        } else {
            this._largerResourcesButton.title = WebInspector.UIString("Use small resource rows.");
            this._dataGrid.element.removeStyleClass("small");
            this._timelineGrid.element.removeStyleClass("small");
        }
        this.dispatchEventToListeners(WebInspector.NetworkLogView.EventTypes.RowSizeChanged, { largeRows: enabled });
        this._updateOffscreenRows();
    },

    _getPopoverAnchor: function(element)
    {
        if (!this._allowPopover)
            return;
        var anchor = element.enclosingNodeOrSelfWithClass("network-graph-bar") || element.enclosingNodeOrSelfWithClass("network-graph-label");
        if (!anchor)
            return null;
        var resource = anchor.parentElement.resource;
        return resource && resource.timing ? anchor : null;
    },

    _showPopover: function(anchor, popover)
    {
        var resource = anchor.parentElement.resource;
        var tableElement = WebInspector.ResourceTimingView.createTimingTable(resource);
        popover.show(tableElement, anchor);
    },

    _toggleGridMode: function()
    {
        if (this._viewingResourceMode) {
            this._viewingResourceMode = false;
            this.element.removeStyleClass("viewing-resource");
            this._viewsContainerElement.addStyleClass("hidden");
            this.sidebarElement.style.right = 0;
            this.sidebarElement.style.removeProperty("width");
            if (this._dataGrid.selectedNode)
                this._dataGrid.selectedNode.selected = false;
        }

        this._dataGrid.showColumn("method");
        this._dataGrid.showColumn("status");
        this._dataGrid.showColumn("type");
        if (Preferences.showNetworkPanelInitiatorColumn)
            this._dataGrid.showColumn("initiator");
        this._dataGrid.showColumn("size");
        this._dataGrid.showColumn("time");

        var widths = {};
        widths.name = 20;
        widths.method = 6;
        widths.status = 6;
        widths.type = 6;
        if (Preferences.showNetworkPanelInitiatorColumn)
            widths.initiator = 10;
        widths.size = 6;
        widths.time = 6;
        if (Preferences.showNetworkPanelInitiatorColumn)
            widths.timeline = 40;
        else
            widths.timeline = 50;

        this._dataGrid.showColumn("timeline");
        this._dataGrid.applyColumnWidthsMap(widths);
    },

    _toggleViewingResourceMode: function()
    {
        if (this._viewingResourceMode)
            return;
        this._viewingResourceMode = true;

        this.element.addStyleClass("viewing-resource");

        this._dataGrid.hideColumn("method");
        this._dataGrid.hideColumn("status");
        this._dataGrid.hideColumn("type");
        if (Preferences.showNetworkPanelInitiatorColumn)
            this._dataGrid.hideColumn("initiator");
        this._dataGrid.hideColumn("size");
        this._dataGrid.hideColumn("time");
        this._dataGrid.hideColumn("timeline");

        this._viewsContainerElement.removeStyleClass("hidden");
        this.restoreSidebarWidth();

        var widths = {};
        widths.name = 100;
        this._dataGrid.applyColumnWidthsMap(widths);
    },

    _contextMenu: function(event)
    {
        var contextMenu = new WebInspector.ContextMenu();
        var gridNode = this._dataGrid.dataGridNodeFromNode(event.target);
        var resource = gridNode && gridNode._resource;

        if (resource) {
            contextMenu.appendItem(WebInspector.openLinkExternallyLabel(), WebInspector.openResource.bind(WebInspector, resource.url, false));
            contextMenu.appendSeparator();
            contextMenu.appendItem(WebInspector.copyLinkAddressLabel(), this._copyLocation.bind(this, resource));
            if (resource.requestHeadersText)
                contextMenu.appendItem(WebInspector.UIString(WebInspector.useLowerCaseMenuTitles() ? "Copy request headers" : "Copy Request Headers"), this._copyRequestHeaders.bind(this, resource));
            if (resource.responseHeadersText)
                contextMenu.appendItem(WebInspector.UIString(WebInspector.useLowerCaseMenuTitles() ? "Copy response headers" : "Copy Response Headers"), this._copyResponseHeaders.bind(this, resource));
            contextMenu.appendItem(WebInspector.UIString(WebInspector.useLowerCaseMenuTitles() ? "Copy entry as HAR" : "Copy Entry as HAR"), this._copyResource.bind(this, resource));
        }
        contextMenu.appendItem(WebInspector.UIString(WebInspector.useLowerCaseMenuTitles() ? "Copy all as HAR" : "Copy All as HAR"), this._copyAll.bind(this));

        if (Preferences.saveAsAvailable) {
            contextMenu.appendSeparator();
            if (resource)
                contextMenu.appendItem(WebInspector.UIString(WebInspector.useLowerCaseMenuTitles() ? "Save entry as HAR" : "Save Entry as HAR"), this._exportResource.bind(this, resource));
            contextMenu.appendItem(WebInspector.UIString(WebInspector.useLowerCaseMenuTitles() ? "Save all as HAR" : "Save All as HAR"), this._exportAll.bind(this));
        }

        if (Preferences.canClearCacheAndCookies) {
            contextMenu.appendSeparator();
            contextMenu.appendItem(WebInspector.UIString(WebInspector.useLowerCaseMenuTitles() ? "Clear browser cache" : "Clear Browser Cache"), this._clearBrowserCache.bind(this));
            contextMenu.appendItem(WebInspector.UIString(WebInspector.useLowerCaseMenuTitles() ? "Clear browser cookies" : "Clear Browser Cookies"), this._clearBrowserCookies.bind(this));
        }

        contextMenu.show(event);
    },

    _copyAll: function()
    {
        var harArchive = {
            log: (new WebInspector.HARLog(this._resources)).build()
        };
        InspectorFrontendHost.copyText(JSON.stringify(harArchive));
    },

    _copyResource: function(resource)
    {
        var har = (new WebInspector.HAREntry(resource)).build();
        InspectorFrontendHost.copyText(JSON.stringify(har));
    },

    _copyLocation: function(resource)
    {
        InspectorFrontendHost.copyText(resource.url);
    },

    _copyRequestHeaders: function(resource)
    {
        InspectorFrontendHost.copyText(resource.requestHeadersText);
    },

    _copyResponseHeaders: function(resource)
    {
        InspectorFrontendHost.copyText(resource.responseHeadersText);
    },

    _exportAll: function()
    {
        var harArchive = {
            log: (new WebInspector.HARLog(this._resources)).build()
        };
        InspectorFrontendHost.saveAs(WebInspector.mainResource.domain + ".har", JSON.stringify(harArchive));
    },

    _exportResource: function(resource)
    {
        var har = (new WebInspector.HAREntry(resource)).build();
        InspectorFrontendHost.saveAs(resource.displayName + ".har", JSON.stringify(har));
    },

    _clearBrowserCache: function(event)
    {
        if (confirm(WebInspector.UIString("Are you sure you want to clear browser cache?")))
            NetworkAgent.clearBrowserCache();
    },

    _clearBrowserCookies: function(event)
    {
        if (confirm(WebInspector.UIString("Are you sure you want to clear browser cookies?")))
            NetworkAgent.clearBrowserCookies();
    },

    _updateOffscreenRows: function(e)
    {
        var dataTableBody = this._dataGrid.dataTableBody;
        var rows = dataTableBody.children;
        var recordsCount = rows.length;
        if (recordsCount < 2)
            return;  // Filler row only.

        var visibleTop = this._dataGrid.scrollContainer.scrollTop;
        var visibleBottom = visibleTop + this._dataGrid.scrollContainer.offsetHeight;

        var rowHeight = 0;

        // Filler is at recordsCount - 1.
        var unfilteredRowIndex = 0;
        for (var i = 0; i < recordsCount - 1; ++i) {
            var row = rows[i];

            var dataGridNode = this._dataGrid.dataGridNodeFromNode(row);
            if (dataGridNode.isFilteredOut()) {
                row.removeStyleClass("offscreen");
                continue;
            }

            if (!rowHeight)
                rowHeight = row.offsetHeight;

            var rowIsVisible = unfilteredRowIndex * rowHeight < visibleBottom && (unfilteredRowIndex + 1) * rowHeight > visibleTop;
            if (rowIsVisible !== row.rowIsVisible) {
                if (rowIsVisible)
                    row.removeStyleClass("offscreen");
                else
                    row.addStyleClass("offscreen");
                row.rowIsVisible = rowIsVisible;
            }
            unfilteredRowIndex++;
        }
    },

    _matchResource: function(resource)
    {
        if (!this._searchRegExp)
            return -1;

        if ((!resource.displayName || !resource.displayName.match(this._searchRegExp)) && !resource.folder.match(this._searchRegExp))
            return -1;

        if (resource.requestId in this._matchedResourcesMap)
            return this._matchedResourcesMap[resource.requestId];

        var matchedResourceIndex = this._matchedResources.length;
        this._matchedResourcesMap[resource.requestId] = matchedResourceIndex;
        this._matchedResources.push(resource.requestId);

        return matchedResourceIndex;
    },

    _clearSearchMatchedList: function()
    {
        this._matchedResources = [];
        this._matchedResourcesMap = {};
        this._highlightNthMatchedResource(-1, false);
    },

    _updateSearchMatchedListAfterRequestIdChanged: function(oldRequestId, newRequestId)
    {
        var resourceIndex = this._matchedResourcesMap[oldRequestId];
        if (resourceIndex) {
            delete this._matchedResourcesMap[oldRequestId];
            this._matchedResourcesMap[newRequestId] = resourceIndex;
            this._matchedResources[resourceIndex] = newRequestId;
        }
    },

    _updateHighlightIfMatched: function(resource)
    {
        var matchedResourceIndex = this._matchResource(resource);
        if (matchedResourceIndex === -1)
            return;

        this.dispatchEventToListeners(WebInspector.NetworkLogView.EventTypes.SearchCountUpdated, this._matchedResources.length);

        if (this._currentMatchedResourceIndex !== -1 && this._currentMatchedResourceIndex !== matchedResourceIndex)
            return;

        this._highlightNthMatchedResource(matchedResourceIndex, false);
    },

    _highlightNthMatchedResource: function(matchedResourceIndex, reveal)
    {
        if (this._highlightedSubstringChanges) {
            revertDomChanges(this._highlightedSubstringChanges);
            this._highlightedSubstringChanges = null;
        }

        if (matchedResourceIndex === -1) {
            this._currentMatchedResourceIndex = matchedResourceIndex;
            return;
        }

        var resource = this._resourcesById[this._matchedResources[matchedResourceIndex]];
        if (!resource)
            return;

        var nameMatched = resource.displayName && resource.displayName.match(this._searchRegExp);
        var pathMatched = resource.path && resource.folder.match(this._searchRegExp);
        if (!nameMatched && pathMatched && !this._largerResourcesButton.toggled)
            this._toggleLargerResources();

        var node = this._resourceGridNode(resource);
        if (node) {
            this._highlightedSubstringChanges = node._highlightMatchedSubstring(this._searchRegExp);
            if (reveal)
                node.reveal();
            this._currentMatchedResourceIndex = matchedResourceIndex;
        }
        this.dispatchEventToListeners(WebInspector.NetworkLogView.EventTypes.SearchIndexUpdated, this._currentMatchedResourceIndex + 1);
    },

    performSearch: function(searchQuery, sortOrFilterApplied)
    {
        var newMatchedResourceIndex = 0;
        var currentMatchedRequestId;
        if (this._currentMatchedResourceIndex !== -1)
            currentMatchedRequestId = this._matchedResources[this._currentMatchedResourceIndex];

        if (!sortOrFilterApplied)
            this._searchRegExp = createSearchRegex(searchQuery);

        this._clearSearchMatchedList();

        var childNodes = this._dataGrid.dataTableBody.childNodes;
        var resourceNodes = Array.prototype.slice.call(childNodes, 0, childNodes.length - 1); // drop the filler row.

        for (var i = 0; i < resourceNodes.length; ++i) {
            var dataGridNode = this._dataGrid.dataGridNodeFromNode(resourceNodes[i]);
            if (dataGridNode.isFilteredOut())
                continue;

            if (this._matchResource(dataGridNode._resource) !== -1 && dataGridNode._resource.requestId === currentMatchedRequestId)
                newMatchedResourceIndex = this._matchedResources.length - 1;
        }

        this.dispatchEventToListeners(WebInspector.NetworkLogView.EventTypes.SearchCountUpdated, this._matchedResources.length);
        this._highlightNthMatchedResource(newMatchedResourceIndex, !sortOrFilterApplied);
    },

    jumpToPreviousSearchResult: function()
    {
        if (!this._matchedResources.length)
            return;
        this._highlightNthMatchedResource((this._currentMatchedResourceIndex + this._matchedResources.length - 1) % this._matchedResources.length, true);
    },

    jumpToNextSearchResult: function()
    {
        if (!this._matchedResources.length)
            return;
        this._highlightNthMatchedResource((this._currentMatchedResourceIndex + 1) % this._matchedResources.length, true);
    },

    searchCanceled: function()
    {
        this._clearSearchMatchedList();
        this.dispatchEventToListeners(WebInspector.NetworkLogView.EventTypes.SearchCountUpdated, 0);
    },

    revealAndHighlightResource: function(resource)
    {
        this._removeAllNodeHighlights();

        var node = this._resourceGridNode(resource);
        if (node) {
            this._dataGrid.element.focus();
            node.reveal();
            this._highlightNode(node);
        }
    },

    _removeAllNodeHighlights: function(node, decoration)
    {
        if (this._highlightedNode) {
            this._highlightedNode.element.removeStyleClass("highlighted-row");
            delete this._highlightedNode;
        }
    },

    _highlightNode: function(node)
    {
        node.element.addStyleClass("highlighted-row");
        this._highlightedNode = node;
    }
};

WebInspector.NetworkLogView.prototype.__proto__ = WebInspector.IFrameView.prototype;

WebInspector.NetworkLogView.EventTypes = {
    ViewCleared: "ViewCleared",
    RowSizeChanged: "RowSizeChanged",
    ResourceSelected: "ResourceSelected",
    SearchCountUpdated: "SearchCountUpdated",
    SearchIndexUpdated: "SearchIndexUpdated"
};

WebInspector.NetworkPanel = function()
{
    WebInspector.Panel.call(this, "network");

    this.createSidebar();
    this._networkLogView = new WebInspector.NetworkLogView(this.sidebarElement);
    this.addChildView(this._networkLogView);

    this._viewsContainerElement = document.createElement("div");
    this._viewsContainerElement.id = "network-views";
    this._viewsContainerElement.className = "hidden";
    if (!this._networkLogView.useLargeRows)
        this._viewsContainerElement.addStyleClass("small");

    this.element.appendChild(this._viewsContainerElement);

    this._networkLogView.addEventListener(WebInspector.NetworkLogView.EventTypes.ViewCleared, this._onViewCleared, this);
    this._networkLogView.addEventListener(WebInspector.NetworkLogView.EventTypes.RowSizeChanged, this._onRowSizeChanged, this);
    this._networkLogView.addEventListener(WebInspector.NetworkLogView.EventTypes.ResourceSelected, this._onResourceSelected, this);
    this._networkLogView.addEventListener(WebInspector.NetworkLogView.EventTypes.SearchCountUpdated, this._onSearchCountUpdated, this);
    this._networkLogView.addEventListener(WebInspector.NetworkLogView.EventTypes.SearchIndexUpdated, this._onSearchIndexUpdated, this);

    this._closeButtonElement = document.createElement("button");
    this._closeButtonElement.id = "network-close-button";
    this._closeButtonElement.addEventListener("click", this._toggleGridMode.bind(this), false);
    this._viewsContainerElement.appendChild(this._closeButtonElement);

    this.registerShortcuts();
}

WebInspector.NetworkPanel.prototype = {
    get toolbarItemLabel()
    {
        return WebInspector.UIString("Network");
    },

    get statusBarItems()
    {
        return this._networkLogView.statusBarItems;
    },

    elementsToRestoreScrollPositionsFor: function()
    {
        return this._networkLogView.elementsToRestoreScrollPositionsFor();
    },

    // FIXME: only used by the layout tests, should not be exposed.
    _reset: function()
    {
        this._networkLogView._reset();
    },

    restoreSidebarWidth: function()
    {
        if (!this._viewingResourceMode)
            return;

        var preferredWidth = WebInspector.Panel.prototype.preferredSidebarWidth.call(this);
        if (typeof(preferredWidth) === "undefined")
            preferredWidth = 200;
        WebInspector.Panel.prototype.updateSidebarWidth.call(this, preferredWidth);
    },

    updateMainViewWidth: function(width)
    {
        this._viewsContainerElement.style.left = width + "px";
    },

    handleShortcut: function(event)
    {
        if (this._viewingResourceMode && event.keyCode === WebInspector.KeyboardShortcut.Keys.Esc.code) {
            this._toggleGridMode();
            event.handled = true;
            return;
        }

        WebInspector.Panel.prototype.handleShortcut.call(this, event);
    },

    show: function()
    {
        WebInspector.Panel.prototype.show.call(this);
        this._networkLogView.show();
    },

    get resources()
    {
        return this._networkLogView.resources;
    },

    resourceById: function(id)
    {
        return this._networkLogView.resourceById(id);
    },

    _resourceByAnchor: function(anchor)
    {
        var resource;
        if (anchor.getAttribute("request_id"))
            resource = this.resourceById(anchor.getAttribute("request_id"));
        if (!resource)
            resource = this._resourcesByURL[anchor.href];

        return resource;
    },

    canShowAnchorLocation: function(anchor)
    {
        return !!this._resourceByAnchor(anchor);
    },

    showAnchorLocation: function(anchor)
    {
        var resource = this._resourceByAnchor(anchor);

        this._toggleGridMode();
        if (resource)
            this._networkLogView.revealAndHighlightResource(resource);
    },

    _onViewCleared: function(event)
    {
        this._closeVisibleResource();
        this._toggleGridMode();
        this._viewsContainerElement.removeChildren();
        this._viewsContainerElement.appendChild(this._closeButtonElement);
    },

    _onRowSizeChanged: function(event)
    {
        if (event.data.largeRows)
            this._viewsContainerElement.removeStyleClass("small");
        else
            this._viewsContainerElement.addStyleClass("small");
    },

    _onSearchCountUpdated: function(event)
    {
        WebInspector.searchController.updateSearchMatchesCount(event.data, this);
    },

    _onSearchIndexUpdated: function(event)
    {
        WebInspector.searchController.updateCurrentMatchIndex(event.data, this);
    },

    _onResourceSelected: function(event)
    {
        this._showResource(event.data);
    },

    _showResource: function(resource)
    {
        if (!resource)
            return;

        this._toggleViewingResourceMode();

        if (this.visibleView) {
            this.removeChildView(this.visibleView);
            delete this.visibleView;
        }

        var view = new WebInspector.NetworkItemView(resource);
        this.addChildView(view);
        view.show(this._viewsContainerElement);
        this.visibleView = view;

        this.restoreSidebarWidth();
    },

    _closeVisibleResource: function()
    {
        this.element.removeStyleClass("viewing-resource");

        if (this.visibleView) {
            this.removeChildView(this.visibleView);
            delete this.visibleView;
        }

        this.restoreSidebarWidth();
    },

    _toggleGridMode: function()
    {
        if (this._viewingResourceMode) {
            this._viewingResourceMode = false;
            this.element.removeStyleClass("viewing-resource");
            this._viewsContainerElement.addStyleClass("hidden");
            this.sidebarElement.style.right = 0;
            this.sidebarElement.style.removeProperty("width");
        }

        this._networkLogView.switchToDetailedView();
        this._networkLogView.allowPopover = true;
        this._networkLogView.allowResourceSelection = false;
    },

    _toggleViewingResourceMode: function()
    {
        if (this._viewingResourceMode)
            return;
        this._viewingResourceMode = true;

        this.element.addStyleClass("viewing-resource");
        this._viewsContainerElement.removeStyleClass("hidden");
        this.restoreSidebarWidth();
        this._networkLogView.allowPopover = false;
        this._networkLogView.allowResourceSelection = true;
        this._networkLogView.switchToBriefView();
    },

    performSearch: function(searchQuery, sortOrFilterApplied)
    {
        this._networkLogView.performSearch(searchQuery, sortOrFilterApplied);
    },

    jumpToPreviousSearchResult: function()
    {
        this._networkLogView.jumpToPreviousSearchResult();
    },

    jumpToNextSearchResult: function()
    {
        this._networkLogView.jumpToNextSearchResult();
    },

    searchCanceled: function()
    {
        this._networkLogView.searchCanceled();
    }
}

WebInspector.NetworkPanel.prototype.__proto__ = WebInspector.Panel.prototype;

WebInspector.NetworkBaseCalculator = function()
{
}

WebInspector.NetworkBaseCalculator.prototype = {
    computeSummaryValues: function(items)
    {
        var total = 0;
        var categoryValues = {};

        var itemsLength = items.length;
        for (var i = 0; i < itemsLength; ++i) {
            var item = items[i];
            var value = this._value(item);
            if (typeof value === "undefined")
                continue;
            if (!(item.category.name in categoryValues))
                categoryValues[item.category.name] = 0;
            categoryValues[item.category.name] += value;
            total += value;
        }

        return {categoryValues: categoryValues, total: total};
    },

    computeBarGraphPercentages: function(item)
    {
        return {start: 0, middle: 0, end: (this._value(item) / this.boundarySpan) * 100};
    },

    computeBarGraphLabels: function(item)
    {
        const label = this.formatValue(this._value(item));
        return {left: label, right: label, tooltip: label};
    },

    get boundarySpan()
    {
        return this.maximumBoundary - this.minimumBoundary;
    },

    updateBoundaries: function(item)
    {
        this.minimumBoundary = 0;

        var value = this._value(item);
        if (typeof this.maximumBoundary === "undefined" || value > this.maximumBoundary) {
            this.maximumBoundary = value;
            return true;
        }
        return false;
    },

    reset: function()
    {
        delete this.minimumBoundary;
        delete this.maximumBoundary;
    },

    _value: function(item)
    {
        return 0;
    },

    formatValue: function(value)
    {
        return value.toString();
    }
}

WebInspector.NetworkTimeCalculator = function(startAtZero)
{
    WebInspector.NetworkBaseCalculator.call(this);
    this.startAtZero = startAtZero;
}

WebInspector.NetworkTimeCalculator.prototype = {
    computeSummaryValues: function(resources)
    {
        var resourcesByCategory = {};
        var resourcesLength = resources.length;
        for (var i = 0; i < resourcesLength; ++i) {
            var resource = resources[i];
            if (!(resource.category.name in resourcesByCategory))
                resourcesByCategory[resource.category.name] = [];
            resourcesByCategory[resource.category.name].push(resource);
        }

        var earliestStart;
        var latestEnd;
        var categoryValues = {};
        for (var category in resourcesByCategory) {
            resourcesByCategory[category].sort(WebInspector.Resource.CompareByTime);
            categoryValues[category] = 0;

            var segment = {start: -1, end: -1};

            var categoryResources = resourcesByCategory[category];
            var resourcesLength = categoryResources.length;
            for (var i = 0; i < resourcesLength; ++i) {
                var resource = categoryResources[i];
                if (resource.startTime === -1 || resource.endTime === -1)
                    continue;

                if (typeof earliestStart === "undefined")
                    earliestStart = resource.startTime;
                else
                    earliestStart = Math.min(earliestStart, resource.startTime);

                if (typeof latestEnd === "undefined")
                    latestEnd = resource.endTime;
                else
                    latestEnd = Math.max(latestEnd, resource.endTime);

                if (resource.startTime <= segment.end) {
                    segment.end = Math.max(segment.end, resource.endTime);
                    continue;
                }

                categoryValues[category] += segment.end - segment.start;

                segment.start = resource.startTime;
                segment.end = resource.endTime;
            }

            // Add the last segment
            categoryValues[category] += segment.end - segment.start;
        }

        return {categoryValues: categoryValues, total: latestEnd - earliestStart};
    },

    computeBarGraphPercentages: function(resource)
    {
        if (resource.startTime !== -1)
            var start = ((resource.startTime - this.minimumBoundary) / this.boundarySpan) * 100;
        else
            var start = 0;

        if (resource.responseReceivedTime !== -1)
            var middle = ((resource.responseReceivedTime - this.minimumBoundary) / this.boundarySpan) * 100;
        else
            var middle = (this.startAtZero ? start : 100);

        if (resource.endTime !== -1)
            var end = ((resource.endTime - this.minimumBoundary) / this.boundarySpan) * 100;
        else
            var end = (this.startAtZero ? middle : 100);

        if (this.startAtZero) {
            end -= start;
            middle -= start;
            start = 0;
        }

        return {start: start, middle: middle, end: end};
    },

    computePercentageFromEventTime: function(eventTime)
    {
        // This function computes a percentage in terms of the total loading time
        // of a specific event. If startAtZero is set, then this is useless, and we
        // want to return 0.
        if (eventTime !== -1 && !this.startAtZero)
            return ((eventTime - this.minimumBoundary) / this.boundarySpan) * 100;

        return 0;
    },

    updateBoundariesForEventTime: function(eventTime)
    {
        if (eventTime === -1 || this.startAtZero)
            return false;

        if (typeof this.maximumBoundary === "undefined" || eventTime > this.maximumBoundary) {
            this.maximumBoundary = eventTime;
            return true;
        }
        return false;
    },

    computeBarGraphLabels: function(resource)
    {
        var rightLabel = "";
        if (resource.responseReceivedTime !== -1 && resource.endTime !== -1)
            rightLabel = this.formatValue(resource.endTime - resource.responseReceivedTime);

        var hasLatency = resource.latency > 0;
        if (hasLatency)
            var leftLabel = this.formatValue(resource.latency);
        else
            var leftLabel = rightLabel;

        if (resource.timing)
            return {left: leftLabel, right: rightLabel};

        if (hasLatency && rightLabel) {
            var total = this.formatValue(resource.duration);
            var tooltip = WebInspector.UIString("%s latency, %s download (%s total)", leftLabel, rightLabel, total);
        } else if (hasLatency)
            var tooltip = WebInspector.UIString("%s latency", leftLabel);
        else if (rightLabel)
            var tooltip = WebInspector.UIString("%s download", rightLabel);

        if (resource.cached)
            tooltip = WebInspector.UIString("%s (from cache)", tooltip);
        return {left: leftLabel, right: rightLabel, tooltip: tooltip};
    },

    updateBoundaries: function(resource)
    {
        var didChange = false;

        var lowerBound;
        if (this.startAtZero)
            lowerBound = 0;
        else
            lowerBound = this._lowerBound(resource);

        if (lowerBound !== -1 && (typeof this.minimumBoundary === "undefined" || lowerBound < this.minimumBoundary)) {
            this.minimumBoundary = lowerBound;
            didChange = true;
        }

        var upperBound = this._upperBound(resource);
        if (upperBound !== -1 && (typeof this.maximumBoundary === "undefined" || upperBound > this.maximumBoundary)) {
            this.maximumBoundary = upperBound;
            didChange = true;
        }

        return didChange;
    },

    formatValue: function(value)
    {
        return Number.secondsToString(value);
    },

    _lowerBound: function(resource)
    {
        return 0;
    },

    _upperBound: function(resource)
    {
        return 0;
    }
}

WebInspector.NetworkTimeCalculator.prototype.__proto__ = WebInspector.NetworkBaseCalculator.prototype;

WebInspector.NetworkTransferTimeCalculator = function()
{
    WebInspector.NetworkTimeCalculator.call(this, false);
}

WebInspector.NetworkTransferTimeCalculator.prototype = {
    formatValue: function(value)
    {
        return Number.secondsToString(value);
    },

    _lowerBound: function(resource)
    {
        return resource.startTime;
    },

    _upperBound: function(resource)
    {
        return resource.endTime;
    }
}

WebInspector.NetworkTransferTimeCalculator.prototype.__proto__ = WebInspector.NetworkTimeCalculator.prototype;

WebInspector.NetworkTransferDurationCalculator = function()
{
    WebInspector.NetworkTimeCalculator.call(this, true);
}

WebInspector.NetworkTransferDurationCalculator.prototype = {
    formatValue: function(value)
    {
        return Number.secondsToString(value);
    },

    _upperBound: function(resource)
    {
        return resource.duration;
    }
}

WebInspector.NetworkTransferDurationCalculator.prototype.__proto__ = WebInspector.NetworkTimeCalculator.prototype;

WebInspector.NetworkDataGridNode = function(parentView, resource)
{
    WebInspector.DataGridNode.call(this, {});
    this._parentView = parentView;
    this._resource = resource;
}

WebInspector.NetworkDataGridNode.prototype = {
    createCells: function()
    {
        this._nameCell = this._createDivInTD("name");
        this._methodCell = this._createDivInTD("method");
        this._statusCell = this._createDivInTD("status");
        this._typeCell = this._createDivInTD("type");
        if (Preferences.showNetworkPanelInitiatorColumn)
            this._initiatorCell = this._createDivInTD("initiator");
        this._sizeCell = this._createDivInTD("size");
        this._timeCell = this._createDivInTD("time");
        this._createTimelineCell();
        this._nameCell.addEventListener("click", this.select.bind(this), false);
        this._nameCell.addEventListener("dblclick", this._openInNewTab.bind(this), false);
    },

    isFilteredOut: function()
    {
        if (!this._parentView._hiddenCategories.all)
            return false;
        return this._resource.category.name in this._parentView._hiddenCategories;
    },

    select: function()
    {
        this._parentView.dispatchEventToListeners(WebInspector.NetworkLogView.EventTypes.ResourceSelected, this._resource);
        WebInspector.DataGridNode.prototype.select.apply(this, arguments);
    },

    _highlightMatchedSubstring: function(regexp)
    {
        var domChanges = [];
        var matchInfo = this._nameCell.textContent.match(regexp);
        highlightSearchResult(this._nameCell, matchInfo.index, matchInfo[0].length, domChanges);
        return domChanges;
    },

    _openInNewTab: function()
    {
        PageAgent.open(this._resource.url, true);
    },

    get selectable()
    {
        return this._parentView.allowResourceSelection && !this.isFilteredOut();
    },

    _createDivInTD: function(columnIdentifier)
    {
        var td = document.createElement("td");
        td.className = columnIdentifier + "-column";
        var div = document.createElement("div");
        td.appendChild(div);
        this._element.appendChild(td);
        return div;
    },

    _createTimelineCell: function()
    {
        this._graphElement = document.createElement("div");
        this._graphElement.className = "network-graph-side";

        this._barAreaElement = document.createElement("div");
        //    this._barAreaElement.className = "network-graph-bar-area hidden";
        this._barAreaElement.className = "network-graph-bar-area";
        this._barAreaElement.resource = this._resource;
        this._graphElement.appendChild(this._barAreaElement);

        this._barLeftElement = document.createElement("div");
        this._barLeftElement.className = "network-graph-bar waiting";
        this._barAreaElement.appendChild(this._barLeftElement);

        this._barRightElement = document.createElement("div");
        this._barRightElement.className = "network-graph-bar";
        this._barAreaElement.appendChild(this._barRightElement);


        this._labelLeftElement = document.createElement("div");
        this._labelLeftElement.className = "network-graph-label waiting";
        this._barAreaElement.appendChild(this._labelLeftElement);

        this._labelRightElement = document.createElement("div");
        this._labelRightElement.className = "network-graph-label";
        this._barAreaElement.appendChild(this._labelRightElement);

        this._graphElement.addEventListener("mouseover", this._refreshLabelPositions.bind(this), false);

        this._timelineCell = document.createElement("td");
        this._timelineCell.className = "timeline-column";
        this._element.appendChild(this._timelineCell);
        this._timelineCell.appendChild(this._graphElement);
    },

    refreshResource: function()
    {
        this._refreshNameCell();

        this._methodCell.setTextAndTitle(this._resource.requestMethod);

        this._refreshStatusCell();
        this._refreshTypeCell();
        if (Preferences.showNetworkPanelInitiatorColumn)
            this._refreshInitiatorCell();
        this._refreshSizeCell();
        this._refreshTimeCell();

        if (this._resource.cached)
            this._graphElement.addStyleClass("resource-cached");

        this._element.addStyleClass("network-item");
        if (!this._element.hasStyleClass("network-category-" + this._resource.category.name)) {
            this._element.removeMatchingStyleClasses("network-category-\\w+");
            this._element.addStyleClass("network-category-" + this._resource.category.name);
        }
    },

    _refreshNameCell: function()
    {
        this._nameCell.removeChildren();

        if (this._resource.category === WebInspector.resourceCategories.images) {
            var previewImage = document.createElement("img");
            previewImage.className = "image-network-icon-preview";
            this._resource.populateImageSource(previewImage);

            var iconElement = document.createElement("div");
            iconElement.className = "icon";
            iconElement.appendChild(previewImage);
        } else {
            var iconElement = document.createElement("img");
            iconElement.className = "icon";
        }
        this._nameCell.appendChild(iconElement);
        this._nameCell.appendChild(document.createTextNode(this._fileName()));


        var subtitle = this._resource.displayDomain;

        if (this._resource.path)
            subtitle += this._resource.folder;

        this._appendSubtitle(this._nameCell, subtitle);
        this._nameCell.title = this._resource.url;
    },

    _fileName: function()
    {
        var fileName = this._resource.displayName;
        if (this._resource.queryString)
            fileName += "?" + this._resource.queryString;
        return fileName;
    },

    _refreshStatusCell: function()
    {
        this._statusCell.removeChildren();

        if (this._resource.failed) {
            if (this._resource.canceled)
                this._statusCell.setTextAndTitle(WebInspector.UIString("(canceled)"));
            else
                this._statusCell.setTextAndTitle(WebInspector.UIString("(failed)"));
            this._statusCell.addStyleClass("network-dim-cell");
            this.element.addStyleClass("network-error-row");
            return;
        }

        this._statusCell.removeStyleClass("network-dim-cell");
        this.element.removeStyleClass("network-error-row");

        if (this._resource.statusCode) {
            this._statusCell.appendChild(document.createTextNode(this._resource.statusCode));
            this._appendSubtitle(this._statusCell, this._resource.statusText);
            this._statusCell.title = this._resource.statusCode + " " + this._resource.statusText;
            if (this._resource.statusCode >= 400)
                this.element.addStyleClass("network-error-row");
            if (this._resource.cached)
                this._statusCell.addStyleClass("network-dim-cell");
        } else {
            if (!this._resource.isHttpFamily() && this._resource.finished)
                this._statusCell.setTextAndTitle(WebInspector.UIString("Success"));
            else if (this._resource.isPingRequest())
                this._statusCell.setTextAndTitle(WebInspector.UIString("(ping)"));
            else
                this._statusCell.setTextAndTitle(WebInspector.UIString("(pending)"));
            this._statusCell.addStyleClass("network-dim-cell");
        }
    },

    _refreshTypeCell: function()
    {
        if (this._resource.mimeType) {
            this._typeCell.removeStyleClass("network-dim-cell");
            this._typeCell.setTextAndTitle(this._resource.mimeType);
        } else if (this._resource.isPingRequest) {
            this._typeCell.removeStyleClass("network-dim-cell");
            this._typeCell.setTextAndTitle(this._resource.requestContentType());
        } else {
            this._typeCell.addStyleClass("network-dim-cell");
            this._typeCell.setTextAndTitle(WebInspector.UIString("Pending"));
        }
    },

    _refreshInitiatorCell: function()
    {
        var initiator = this._resource.initiator;
        if ((initiator && initiator.type !== "other") || this._resource.redirectSource) {
            this._initiatorCell.removeStyleClass("network-dim-cell");
            this._initiatorCell.removeChildren();
            if (this._resource.redirectSource) {
                var redirectSource = this._resource.redirectSource;
                var anchor = WebInspector.linkifyURLAsNode(redirectSource.url, redirectSource.url, null, false);
                anchor.setAttribute("request_id", redirectSource.requestId);
                anchor.setAttribute("preferred_panel", "network");
                this._initiatorCell.title = redirectSource.url;
                this._initiatorCell.appendChild(anchor);
                this._appendSubtitle(this._initiatorCell, WebInspector.UIString("Redirect"));
            } else if (initiator.type === "script") {
                var topFrame = initiator.stackTrace[0];
                // This could happen when resource loading was triggered by console.
                if (!topFrame.url) {
                    this._initiatorCell.addStyleClass("network-dim-cell");
                    this._initiatorCell.setTextAndTitle(WebInspector.UIString("Other"));
                    return;
                }
                this._initiatorCell.title = topFrame.url + ":" + topFrame.lineNumber;
                var urlElement = WebInspector.debuggerPresentationModel.linkifyLocation(topFrame.url, topFrame.lineNumber - 1, 0);
                this._initiatorCell.appendChild(urlElement);
                this._appendSubtitle(this._initiatorCell, WebInspector.UIString("Script"));
            } else { // initiator.type === "parser"
                this._initiatorCell.title = initiator.url + ":" + initiator.lineNumber;
                this._initiatorCell.appendChild(WebInspector.linkifyResourceAsNode(initiator.url, initiator.lineNumber - 1));
                this._appendSubtitle(this._initiatorCell, WebInspector.UIString("Parser"));
            }
        } else {
            this._initiatorCell.addStyleClass("network-dim-cell");
            this._initiatorCell.setTextAndTitle(WebInspector.UIString("Other"));
        }
    },

    _refreshSizeCell: function()
    {
        if (this._resource.cached) {
            this._sizeCell.setTextAndTitle(WebInspector.UIString("(from cache)"));
            this._sizeCell.addStyleClass("network-dim-cell");
        } else {
            var resourceSize = typeof this._resource.resourceSize === "number" ? Number.bytesToString(this._resource.resourceSize) : "?";
            var transferSize = typeof this._resource.transferSize === "number" ? Number.bytesToString(this._resource.transferSize) : "?";
            this._sizeCell.setTextAndTitle(transferSize);
            this._sizeCell.removeStyleClass("network-dim-cell");
            this._appendSubtitle(this._sizeCell, resourceSize);
        }
    },

    _refreshTimeCell: function()
    {
        if (this._resource.duration > 0) {
            this._timeCell.removeStyleClass("network-dim-cell");
            this._timeCell.setTextAndTitle(Number.secondsToString(this._resource.duration));
            this._appendSubtitle(this._timeCell, Number.secondsToString(this._resource.latency));
        } else {
            this._timeCell.addStyleClass("network-dim-cell");
            this._timeCell.setTextAndTitle(WebInspector.UIString("Pending"));
        }
    },

    _appendSubtitle: function(cellElement, subtitleText)
    {
        var subtitleElement = document.createElement("div");
        subtitleElement.className = "network-cell-subtitle";
        subtitleElement.textContent = subtitleText;
        cellElement.appendChild(subtitleElement);
    },

    refreshGraph: function(calculator)
    {
        var percentages = calculator.computeBarGraphPercentages(this._resource);
        this._percentages = percentages;

        this._barAreaElement.removeStyleClass("hidden");

        if (!this._graphElement.hasStyleClass("network-category-" + this._resource.category.name)) {
            this._graphElement.removeMatchingStyleClasses("network-category-\\w+");
            this._graphElement.addStyleClass("network-category-" + this._resource.category.name);
        }

        this._barLeftElement.style.setProperty("left", percentages.start + "%");
        this._barRightElement.style.setProperty("right", (100 - percentages.end) + "%");

        this._barLeftElement.style.setProperty("right", (100 - percentages.end) + "%");
        this._barRightElement.style.setProperty("left", percentages.middle + "%");

        var labels = calculator.computeBarGraphLabels(this._resource);
        this._labelLeftElement.textContent = labels.left;
        this._labelRightElement.textContent = labels.right;

        var tooltip = (labels.tooltip || "");
        this._barLeftElement.title = tooltip;
        this._labelLeftElement.title = tooltip;
        this._labelRightElement.title = tooltip;
        this._barRightElement.title = tooltip;
    },

    _refreshLabelPositions: function()
    {
        if (!this._percentages)
            return;
        this._labelLeftElement.style.removeProperty("left");
        this._labelLeftElement.style.removeProperty("right");
        this._labelLeftElement.removeStyleClass("before");
        this._labelLeftElement.removeStyleClass("hidden");

        this._labelRightElement.style.removeProperty("left");
        this._labelRightElement.style.removeProperty("right");
        this._labelRightElement.removeStyleClass("after");
        this._labelRightElement.removeStyleClass("hidden");

        const labelPadding = 10;
        const barRightElementOffsetWidth = this._barRightElement.offsetWidth;
        const barLeftElementOffsetWidth = this._barLeftElement.offsetWidth;

        if (this._barLeftElement) {
            var leftBarWidth = barLeftElementOffsetWidth - labelPadding;
            var rightBarWidth = (barRightElementOffsetWidth - barLeftElementOffsetWidth) - labelPadding;
        } else {
            var leftBarWidth = (barLeftElementOffsetWidth - barRightElementOffsetWidth) - labelPadding;
            var rightBarWidth = barRightElementOffsetWidth - labelPadding;
        }

        const labelLeftElementOffsetWidth = this._labelLeftElement.offsetWidth;
        const labelRightElementOffsetWidth = this._labelRightElement.offsetWidth;

        const labelBefore = (labelLeftElementOffsetWidth > leftBarWidth);
        const labelAfter = (labelRightElementOffsetWidth > rightBarWidth);
        const graphElementOffsetWidth = this._graphElement.offsetWidth;

        if (labelBefore && (graphElementOffsetWidth * (this._percentages.start / 100)) < (labelLeftElementOffsetWidth + 10))
            var leftHidden = true;

        if (labelAfter && (graphElementOffsetWidth * ((100 - this._percentages.end) / 100)) < (labelRightElementOffsetWidth + 10))
            var rightHidden = true;

        if (barLeftElementOffsetWidth == barRightElementOffsetWidth) {
            // The left/right label data are the same, so a before/after label can be replaced by an on-bar label.
            if (labelBefore && !labelAfter)
                leftHidden = true;
            else if (labelAfter && !labelBefore)
                rightHidden = true;
        }

        if (labelBefore) {
            if (leftHidden)
                this._labelLeftElement.addStyleClass("hidden");
            this._labelLeftElement.style.setProperty("right", (100 - this._percentages.start) + "%");
            this._labelLeftElement.addStyleClass("before");
        } else {
            this._labelLeftElement.style.setProperty("left", this._percentages.start + "%");
            this._labelLeftElement.style.setProperty("right", (100 - this._percentages.middle) + "%");
        }

        if (labelAfter) {
            if (rightHidden)
                this._labelRightElement.addStyleClass("hidden");
            this._labelRightElement.style.setProperty("left", this._percentages.end + "%");
            this._labelRightElement.addStyleClass("after");
        } else {
            this._labelRightElement.style.setProperty("left", this._percentages.middle + "%");
            this._labelRightElement.style.setProperty("right", (100 - this._percentages.end) + "%");
        }
    }
}

WebInspector.NetworkDataGridNode.NameComparator = function(a, b)
{
    var aFileName = a._resource.displayName + (a._resource.queryString ? a._resource.queryString : "");
    var bFileName = b._resource.displayName + (b._resource.queryString ? b._resource.queryString : "");
    if (aFileName > bFileName)
        return 1;
    if (bFileName > aFileName)
        return -1;
    return 0;
}

WebInspector.NetworkDataGridNode.SizeComparator = function(a, b)
{
    if (b._resource.cached && !a._resource.cached)
        return 1;
    if (a._resource.cached && !b._resource.cached)
        return -1;

    if (a._resource.resourceSize === b._resource.resourceSize)
        return 0;

    return a._resource.resourceSize - b._resource.resourceSize;
}

WebInspector.NetworkDataGridNode.InitiatorComparator = function(a, b)
{
    if (!a._resource.initiator || a._resource.initiator.type === "Other")
        return -1;
    if (!b._resource.initiator || b._resource.initiator.type === "Other")
        return 1;

    if (a._resource.initiator.url < b._resource.initiator.url)
        return -1;
    if (a._resource.initiator.url > b._resource.initiator.url)
        return 1;

    return a._resource.initiator.lineNumber - b._resource.initiator.lineNumber;
}

WebInspector.NetworkDataGridNode.ResourcePropertyComparator = function(propertyName, revert, a, b)
{
    var aValue = a._resource[propertyName];
    var bValue = b._resource[propertyName];
    if (aValue > bValue)
        return revert ? -1 : 1;
    if (bValue > aValue)
        return revert ? 1 : -1;
    return 0;
}

WebInspector.NetworkDataGridNode.prototype.__proto__ = WebInspector.DataGridNode.prototype;
