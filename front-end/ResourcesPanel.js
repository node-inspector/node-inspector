/*
 * Copyright (C) 2007, 2008 Apple Inc.  All rights reserved.
 * Copyright (C) 2008, 2009 Anthony Ricaud <rik@webkit.org>
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

WebInspector.ResourcesPanel = function()
{
    WebInspector.AbstractTimelinePanel.call(this, "resources");

    this._createPanelEnabler();

    this.viewsContainerElement = document.createElement("div");
    this.viewsContainerElement.id = "resource-views";
    this.element.appendChild(this.viewsContainerElement);

    this.createFilterPanel();
    this.createInterface();

    this._createStatusbarButtons();
    this._popoverHelper = new WebInspector.PopoverHelper(this.element, this._getPopoverAnchor.bind(this), this._showPopover.bind(this), true);

    this.reset();
    this.filter(this.filterAllElement, false);
    this.graphsTreeElement.children[0].select();
    this._resourceTrackingEnabled = false;
}

WebInspector.ResourcesPanel.prototype = {
    get toolbarItemLabel()
    {
        return WebInspector.UIString("Resources");
    },

    get statusBarItems()
    {
        return [this.enableToggleButton.element, this.largerResourcesButton.element, this.sortingSelectElement];
    },

    get categories()
    {
        return WebInspector.resourceCategories;
    },

    createItemTreeElement: function(item)
    {
        return new WebInspector.ResourceSidebarTreeElement(item);
    },

    createItemGraph: function(item)
    {
        return new WebInspector.ResourceGraph(item);
    },

    isCategoryVisible: function(categoryName)
    {
        return (this.itemsGraphsElement.hasStyleClass("filter-all") || this.itemsGraphsElement.hasStyleClass("filter-" + categoryName.toLowerCase()));
    },

    populateSidebar: function()
    {
        var timeGraphItem = new WebInspector.SidebarTreeElement("resources-time-graph-sidebar-item", WebInspector.UIString("Time"));
        timeGraphItem.onselect = this._graphSelected.bind(this);

        var transferTimeCalculator = new WebInspector.ResourceTransferTimeCalculator();
        var transferDurationCalculator = new WebInspector.ResourceTransferDurationCalculator();

        timeGraphItem.sortingOptions = [
            { name: WebInspector.UIString("Sort by Start Time"), sortingFunction: WebInspector.ResourceSidebarTreeElement.CompareByAscendingStartTime, calculator: transferTimeCalculator },
            { name: WebInspector.UIString("Sort by Response Time"), sortingFunction: WebInspector.ResourceSidebarTreeElement.CompareByAscendingResponseReceivedTime, calculator: transferTimeCalculator },
            { name: WebInspector.UIString("Sort by End Time"), sortingFunction: WebInspector.ResourceSidebarTreeElement.CompareByAscendingEndTime, calculator: transferTimeCalculator },
            { name: WebInspector.UIString("Sort by Duration"), sortingFunction: WebInspector.ResourceSidebarTreeElement.CompareByDescendingDuration, calculator: transferDurationCalculator },
            { name: WebInspector.UIString("Sort by Latency"), sortingFunction: WebInspector.ResourceSidebarTreeElement.CompareByDescendingLatency, calculator: transferDurationCalculator },
        ];

        timeGraphItem.isBarOpaqueAtLeft = false;
        timeGraphItem.selectedSortingOptionIndex = 1;

        this.sizeGraphItem = new WebInspector.SidebarTreeElement("resources-size-graph-sidebar-item", WebInspector.UIString("Size"));
        this.sizeGraphItem.onselect = this._graphSelected.bind(this);

        var transferSizeCalculator = new WebInspector.ResourceTransferSizeCalculator();
        this.sizeGraphItem.sortingOptions = [
            { name: WebInspector.UIString("Sort by Transfer Size"), sortingFunction: WebInspector.ResourceSidebarTreeElement.CompareByDescendingTransferSize, calculator: transferSizeCalculator },
            { name: WebInspector.UIString("Sort by Size"), sortingFunction: WebInspector.ResourceSidebarTreeElement.CompareByDescendingSize, calculator: transferSizeCalculator },
        ];

        this.sizeGraphItem.isBarOpaqueAtLeft = true;
        this.sizeGraphItem.selectedSortingOptionIndex = 0;

        this.graphsTreeElement = new WebInspector.SidebarSectionTreeElement(WebInspector.UIString("GRAPHS"), {}, true);
        this.sidebarTree.appendChild(this.graphsTreeElement);

        this.graphsTreeElement.appendChild(timeGraphItem);
        this.graphsTreeElement.appendChild(this.sizeGraphItem);
        this.graphsTreeElement.expand();

        this.itemsTreeElement = new WebInspector.SidebarSectionTreeElement(WebInspector.UIString("RESOURCES"), {}, true);
        this.sidebarTree.appendChild(this.itemsTreeElement);

        this.itemsTreeElement.expand();
    },

    get resourceTrackingEnabled()
    {
        return this._resourceTrackingEnabled;
    },

    _createPanelEnabler: function()
    {
        var panelEnablerHeading = WebInspector.UIString("You need to enable resource tracking to use this panel.");
        var panelEnablerDisclaimer = WebInspector.UIString("Enabling resource tracking will reload the page and make page loading slower.");
        var panelEnablerButton = WebInspector.UIString("Enable resource tracking");

        this.panelEnablerView = new WebInspector.PanelEnablerView("resources", panelEnablerHeading, panelEnablerDisclaimer, panelEnablerButton);
        this.panelEnablerView.addEventListener("enable clicked", this._enableResourceTracking, this);

        this.element.appendChild(this.panelEnablerView.element);

        this.enableToggleButton = new WebInspector.StatusBarButton("", "enable-toggle-status-bar-item");
        this.enableToggleButton.addEventListener("click", this._toggleResourceTracking.bind(this), false);
    },

    _createStatusbarButtons: function()
    {
        this.largerResourcesButton = new WebInspector.StatusBarButton(WebInspector.UIString("Use small resource rows."), "resources-larger-resources-status-bar-item");

        WebInspector.applicationSettings.addEventListener("loaded", this._settingsLoaded, this);
        this.largerResourcesButton.addEventListener("click", this._toggleLargerResources.bind(this), false);
        this.sortingSelectElement = document.createElement("select");
        this.sortingSelectElement.className = "status-bar-item";
        this.sortingSelectElement.addEventListener("change", this._changeSortingFunction.bind(this), false);
    },

    _settingsLoaded: function()
    {
        this.largerResourcesButton.toggled = WebInspector.applicationSettings.resourcesLargeRows;
        if (!WebInspector.applicationSettings.resourcesLargeRows)
            this._setLargerResources(WebInspector.applicationSettings.resourcesLargeRows);
    },

    get mainResourceLoadTime()
    {
        return this._mainResourceLoadTime || -1;
    },
    
    set mainResourceLoadTime(x)
    {
        if (this._mainResourceLoadTime === x)
            return;
        
        this._mainResourceLoadTime = x;
        
        // Update the dividers to draw the new line
        this.updateGraphDividersIfNeeded(true);
    },
    
    get mainResourceDOMContentTime()
    {
        return this._mainResourceDOMContentTime || -1;
    },
    
    set mainResourceDOMContentTime(x)
    {
        if (this._mainResourceDOMContentTime === x)
            return;
        
        this._mainResourceDOMContentTime = x;
        
        this.updateGraphDividersIfNeeded(true);
    },

    show: function()
    {
        WebInspector.AbstractTimelinePanel.prototype.show.call(this);

        var visibleView = this.visibleView;
        if (this.visibleResource) {
            this.visibleView.headersVisible = true;
            this.visibleView.show(this.viewsContainerElement);
        } else if (visibleView)
            visibleView.show();

        // Hide any views that are visible that are not this panel's current visible view.
        // This can happen when a ResourceView is visible in the Scripts panel then switched
        // to the this panel.
        var resourcesLength = this._resources.length;
        for (var i = 0; i < resourcesLength; ++i) {
            var resource = this._resources[i];
            var view = resource._resourcesView;
            if (!view || view === visibleView)
                continue;
            view.visible = false;
        }
    },

    get searchableViews()
    {
        var views = [];

        const visibleView = this.visibleView;
        if (visibleView && visibleView.performSearch)
            views.push(visibleView);

        var resourcesLength = this._resources.length;
        for (var i = 0; i < resourcesLength; ++i) {
            var resource = this._resources[i];
            if (!resource._itemsTreeElement)
                continue;
            var resourceView = this.resourceViewForResource(resource);
            if (!resourceView.performSearch || resourceView === visibleView)
                continue;
            views.push(resourceView);
        }

        return views;
    },

    get searchResultsSortFunction()
    {
        const resourceTreeElementSortFunction = this.sortingFunction;

        function sortFuction(a, b)
        {
            return resourceTreeElementSortFunction(a.resource._itemsTreeElement, b.resource._itemsTreeElement);
        }

        return sortFuction;
    },

    searchMatchFound: function(view, matches)
    {
        view.resource._itemsTreeElement.searchMatches = matches;
    },

    searchCanceled: function(startingNewSearch)
    {
        WebInspector.Panel.prototype.searchCanceled.call(this, startingNewSearch);

        if (startingNewSearch || !this._resources)
            return;

        for (var i = 0; i < this._resources.length; ++i) {
            var resource = this._resources[i];
            if (resource._itemsTreeElement)
                resource._itemsTreeElement.updateErrorsAndWarnings();
        }
    },

    performSearch: function(query)
    {
        for (var i = 0; i < this._resources.length; ++i) {
            var resource = this._resources[i];
            if (resource._itemsTreeElement)
                resource._itemsTreeElement.resetBubble();
        }

        WebInspector.Panel.prototype.performSearch.call(this, query);
    },

    get visibleView()
    {
        if (this.visibleResource)
            return this.visibleResource._resourcesView;
        return this._resourceTrackingEnabled ? null : this.panelEnablerView;
    },

    get sortingFunction()
    {
        return this._sortingFunction;
    },

    set sortingFunction(x)
    {
        this._sortingFunction = x;
        this._sortResourcesIfNeeded();
    },

    refresh: function()
    {
        WebInspector.AbstractTimelinePanel.prototype.refresh.call(this);

        this._sortResourcesIfNeeded();
        this._updateSummaryGraph();
    },

    _updateSummaryGraph: function()
    {
        this.summaryBar.update(this._resources);
    },

    resourceTrackingWasEnabled: function()
    {
        this._resourceTrackingEnabled = true;
        this.reset();
        this.restoreSidebarWidth();
    },

    resourceTrackingWasDisabled: function()
    {
        this._resourceTrackingEnabled = false;
        this.reset();
    },

    reset: function()
    {
        this._popoverHelper.hidePopup();
        this.closeVisibleResource();

        delete this.currentQuery;
        this.searchCanceled();

        if (this._resources) {
            var resourcesLength = this._resources.length;
            for (var i = 0; i < resourcesLength; ++i) {
                var resource = this._resources[i];

                resource.warnings = 0;
                resource.errors = 0;

                delete resource._resourcesView;
            }
        }

        WebInspector.AbstractTimelinePanel.prototype.reset.call(this);
        
        this.mainResourceLoadTime = -1;
        this.mainResourceDOMContentTime = -1;
 
        this.viewsContainerElement.removeChildren();

        this.summaryBar.reset();

        if (this._resourceTrackingEnabled) {
            this.enableToggleButton.title = WebInspector.UIString("Resource tracking enabled. Click to disable.");
            this.enableToggleButton.toggled = true;
            this.largerResourcesButton.visible = true;
            this.sortingSelectElement.removeStyleClass("hidden");
            this.panelEnablerView.visible = false;
        } else {
            this.enableToggleButton.title = WebInspector.UIString("Resource tracking disabled. Click to enable.");
            this.enableToggleButton.toggled = false;
            this.largerResourcesButton.visible = false;
            this.sortingSelectElement.addStyleClass("hidden");
            this.panelEnablerView.visible = true;
        }
    },

    addResource: function(resource)
    {
        this._resources.push(resource);
        this.refreshResource(resource);
    },

    removeResource: function(resource)
    {
        if (this.visibleView === resource._resourcesView)
            this.closeVisibleResource();

        this.removeItem(resource);

        resource.warnings = 0;
        resource.errors = 0;

        delete resource._resourcesView;
    },

    addMessageToResource: function(resource, msg)
    {
        if (!resource)
            return;

        switch (msg.level) {
        case WebInspector.ConsoleMessage.MessageLevel.Warning:
            resource.warnings += msg.repeatDelta;
            break;
        case WebInspector.ConsoleMessage.MessageLevel.Error:
            resource.errors += msg.repeatDelta;
            break;
        }

        if (!this.currentQuery && resource._itemsTreeElement)
            resource._itemsTreeElement.updateErrorsAndWarnings();

        var view = this.resourceViewForResource(resource);
        if (view.addMessage)
            view.addMessage(msg);
    },

    clearMessages: function()
    {
        var resourcesLength = this._resources.length;
        for (var i = 0; i < resourcesLength; ++i) {
            var resource = this._resources[i];
            resource.warnings = 0;
            resource.errors = 0;

            if (!this.currentQuery && resource._itemsTreeElement)
                resource._itemsTreeElement.updateErrorsAndWarnings();

            var view = resource._resourcesView;
            if (!view || !view.clearMessages)
                continue;
            view.clearMessages();
        }
    },

    refreshResource: function(resource)
    {
        this.refreshItem(resource);
    },

    recreateViewForResourceIfNeeded: function(resource)
    {
        if (!resource || !resource._resourcesView)
            return;

        var newView = this._createResourceView(resource);
        if (newView.__proto__ === resource._resourcesView.__proto__)
            return;

        if (!this.currentQuery && resource._itemsTreeElement)
            resource._itemsTreeElement.updateErrorsAndWarnings();

        var oldView = resource._resourcesView;
        var oldViewParentNode = oldView.visible ? oldView.element.parentNode : null;

        resource._resourcesView.detach();
        delete resource._resourcesView;

        resource._resourcesView = newView;

        newView.headersVisible = oldView.headersVisible;

        if (oldViewParentNode)
            newView.show(oldViewParentNode);

        WebInspector.panels.scripts.viewRecreated(oldView, newView);
    },

    canShowSourceLine: function(url, line)
    {
        return this._resourceTrackingEnabled && !!WebInspector.resourceForURL(url);
    },

    showSourceLine: function(url, line)
    {
        this.showResource(WebInspector.resourceForURL(url), line);
    },

    showResource: function(resource, line)
    {
        if (!resource)
            return;

        this._popoverHelper.hidePopup();

        this.containerElement.addStyleClass("viewing-resource");

        if (this.visibleResource && this.visibleResource._resourcesView)
            this.visibleResource._resourcesView.hide();

        var view = this.resourceViewForResource(resource);
        view.headersVisible = true;
        view.show(this.viewsContainerElement);

        if (line) {
            view.selectContentTab(true);
            if (view.revealLine)
                view.revealLine(line);
            if (view.highlightLine)
                view.highlightLine(line);
        }

        this.revealAndSelectItem(resource);

        this.visibleResource = resource;

        this.updateSidebarWidth();
    },

    showView: function(view)
    {
        if (!view)
            return;
        this.showResource(view.resource);
    },

    closeVisibleResource: function()
    {
        this.containerElement.removeStyleClass("viewing-resource");
        this._updateDividersLabelBarPosition();

        if (this.visibleResource && this.visibleResource._resourcesView)
            this.visibleResource._resourcesView.hide();
        delete this.visibleResource;

        if (this._lastSelectedGraphTreeElement)
            this._lastSelectedGraphTreeElement.select(true);

        this.updateSidebarWidth();
    },

    resourceViewForResource: function(resource)
    {
        if (!resource)
            return null;
        if (!resource._resourcesView)
            resource._resourcesView = this._createResourceView(resource);
        return resource._resourcesView;
    },

    sourceFrameForResource: function(resource)
    {
        var view = this.resourceViewForResource(resource);
        if (!view)
            return null;

        if (!view.setupSourceFrameIfNeeded)
            return null;

        // Setting up the source frame requires that we be attached.
        if (!this.element.parentNode)
            this.attach();

        view.setupSourceFrameIfNeeded();
        return view.sourceFrame;
    },

    _sortResourcesIfNeeded: function()
    {
        this.sortItems(this.sortingFunction);
    },

    updateGraphDividersIfNeeded: function(force)
    {
        var proceed = WebInspector.AbstractTimelinePanel.prototype.updateGraphDividersIfNeeded.call(this, force);
        
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
        if (this.mainResourceLoadTime !== -1) {
            var percent = this.calculator.computePercentageFromEventTime(this.mainResourceLoadTime);

            var loadDivider = document.createElement("div");
            loadDivider.className = "resources-event-divider resources-red-divider";

            var loadDividerPadding = document.createElement("div");
            loadDividerPadding.className = "resources-event-divider-padding";
            loadDividerPadding.style.left = percent + "%";
            loadDividerPadding.title = WebInspector.UIString("Load event fired");
            loadDividerPadding.appendChild(loadDivider);

            this.addEventDivider(loadDividerPadding);
        }
        
        if (this.mainResourceDOMContentTime !== -1) {
            var percent = this.calculator.computePercentageFromEventTime(this.mainResourceDOMContentTime);

            var domContentDivider = document.createElement("div");
            domContentDivider.className = "resources-event-divider resources-blue-divider";
            
            var domContentDividerPadding = document.createElement("div");
            domContentDividerPadding.className = "resources-event-divider-padding";
            domContentDividerPadding.style.left = percent + "%";
            domContentDividerPadding.title = WebInspector.UIString("DOMContent event fired");
            domContentDividerPadding.appendChild(domContentDivider);

            this.addEventDivider(domContentDividerPadding);
        }
    },

    _graphSelected: function(treeElement)
    {
        if (this._lastSelectedGraphTreeElement)
            this._lastSelectedGraphTreeElement.selectedSortingOptionIndex = this.sortingSelectElement.selectedIndex;

        this._lastSelectedGraphTreeElement = treeElement;

        this.sortingSelectElement.removeChildren();
        for (var i = 0; i < treeElement.sortingOptions.length; ++i) {
            var sortingOption = treeElement.sortingOptions[i];
            var option = document.createElement("option");
            option.label = sortingOption.name;
            option.sortingFunction = sortingOption.sortingFunction;
            option.calculator = sortingOption.calculator;
            this.sortingSelectElement.appendChild(option);
        }

        this.sortingSelectElement.selectedIndex = treeElement.selectedSortingOptionIndex;
        this._changeSortingFunction();

        this.closeVisibleResource();
        this.containerElement.scrollTop = 0;

        if (treeElement === this.sizeGraphItem)
            this.hideEventDividers();
        else
            this.showEventDividers();
    },

    _toggleLargerResources: function()
    {
        if (!this.itemsTreeElement._childrenListNode)
            return;

        WebInspector.applicationSettings.resourcesLargeRows = !WebInspector.applicationSettings.resourcesLargeRows;
        this._setLargerResources(this.itemsTreeElement.smallChildren);
    },

    _setLargerResources: function(enabled)
    {
        this.largerResourcesButton.toggled = enabled;
        this.itemsTreeElement.smallChildren = !enabled;
        if (!enabled) {
            this.itemsGraphsElement.addStyleClass("small");
            this.largerResourcesButton.title = WebInspector.UIString("Use large resource rows.");
            this.adjustScrollPosition();
        } else {
            this.itemsGraphsElement.removeStyleClass("small");
            this.largerResourcesButton.title = WebInspector.UIString("Use small resource rows.");
        }
    },

    _changeSortingFunction: function()
    {
        var selectedOption = this.sortingSelectElement[this.sortingSelectElement.selectedIndex];
        this.sortingFunction = selectedOption.sortingFunction;
        this.calculator = this.summaryBar.calculator = selectedOption.calculator;
    },

    _createResourceView: function(resource)
    {
        switch (resource.category) {
            case WebInspector.resourceCategories.documents:
            case WebInspector.resourceCategories.stylesheets:
            case WebInspector.resourceCategories.scripts:
            case WebInspector.resourceCategories.xhr:
                return new WebInspector.SourceView(resource);
            case WebInspector.resourceCategories.images:
                return new WebInspector.ImageView(resource);
            case WebInspector.resourceCategories.fonts:
                return new WebInspector.FontView(resource);
            default:
                return new WebInspector.ResourceView(resource);
        }
    },

    setSidebarWidth: function(width)
    {
        if (this.visibleResource) {
            this.containerElement.style.width = width + "px";
            this.sidebarElement.style.removeProperty("width");
        } else {
            this.sidebarElement.style.width = width + "px";
            this.containerElement.style.removeProperty("width");
        }

        this.sidebarResizeElement.style.left = (width - 3) + "px";
    },

    updateMainViewWidth: function(width)
    {
        this.viewsContainerElement.style.left = width + "px";

        WebInspector.AbstractTimelinePanel.prototype.updateMainViewWidth.call(this, width);
        this.resize();
    },

    _enableResourceTracking: function()
    {
        if (this._resourceTrackingEnabled)
            return;
        this._toggleResourceTracking(this.panelEnablerView.alwaysEnabled);
    },

    _toggleResourceTracking: function(optionalAlways)
    {
        if (this._resourceTrackingEnabled) {
            this.largerResourcesButton.visible = false;
            this.sortingSelectElement.visible = false;
            WebInspector.resources = {};
            WebInspector.resourceURLMap = {};
            InspectorBackend.disableResourceTracking(true);
        } else {
            this.largerResourcesButton.visible = true;
            this.sortingSelectElement.visible = true;
            InspectorBackend.enableResourceTracking(!!optionalAlways);
        }
    },

    get _resources()
    {
        return this.items;
    },

    searchIteratesOverViews: function()
    {
        return true;
    },

    elementsToRestoreScrollPositionsFor: function()
    {
        return [ this.containerElement ];
    },

    _getPopoverAnchor: function(element)
    {
        var anchor = element.enclosingNodeOrSelfWithClass("resources-graph-bar") || element.enclosingNodeOrSelfWithClass("resources-graph-label");
        if (!anchor)
            return null;
        var resource = anchor.parentElement.resource;
        return resource && resource.timing ? anchor : null;
    },

    _showPopover: function(anchor)
    {
        var tableElement = document.createElement("table");
        var resource = anchor.parentElement.resource;
        var data = [];

        if (resource.timing.proxyDuration !== -1) {
            data.push(WebInspector.UIString("Proxy"));
            data.push(Number.secondsToString(resource.timing.proxyDuration));
        }

        if (resource.timing.dnsDuration !== -1) {
            data.push(WebInspector.UIString("DNS Lookup"));
            data.push(Number.secondsToString(resource.timing.dnsDuration));
        }

        if (resource.timing.connectDuration !== -1) {
            if (resource.connectionReused) {
                data.push(WebInspector.UIString("Blocking"));
                data.push(Number.secondsToString(resource.timing.connectDuration));
            } else {
                data.push(WebInspector.UIString("Connecting"));
                // Connection includes DNS, subtract it here.
                var connectDuration = resource.timing.connectDuration;
                if (resource.timing.dnsDuration !== -1)
                    connectDuration -= resource.timing.dnsDuration;
                data.push(Number.secondsToString(connectDuration));
            }
        }

        if (resource.timing.sslDuration !== -1) {
            data.push(WebInspector.UIString("SSL"));
            data.push(Number.secondsToString(resource.timing.sslDuration));
        }

        data.push(WebInspector.UIString("Sending"));
        data.push(Number.secondsToString(resource.timing.sendDuration));

        data.push(WebInspector.UIString("Waiting"));
        // Waiting includes SSL, subtract it here.
        var waitDuration = resource.timing.waitDuration;
        if (resource.timing.sslDuration !== -1)
            waitDuration -= resource.timing.sslDuration;
        data.push(Number.secondsToString(waitDuration));

        data.push(WebInspector.UIString("Receiving"));
        data.push(Number.secondsToString(resource.endTime - resource.responseReceivedTime));

        for (var i = 0; i < data.length; i += 2) {
            var tr = document.createElement("tr");
            tableElement.appendChild(tr);

            var td = document.createElement("td");
            td.textContent = data[i];
            tr.appendChild(td);

            td = document.createElement("td");
            td.align = "right";
            td.textContent = data[i + 1];
            tr.appendChild(td);
        }

        var popover = new WebInspector.Popover(tableElement);
        popover.show(anchor);
        return popover;
    },

    hide: function()
    {
        WebInspector.Panel.prototype.hide.call(this);
        this._popoverHelper.hidePopup();
    }
}

WebInspector.ResourcesPanel.prototype.__proto__ = WebInspector.AbstractTimelinePanel.prototype;

WebInspector.getResourceContent = function(identifier, callback)
{
    InspectorBackend.getResourceContent(WebInspector.Callback.wrap(callback), identifier);
}

WebInspector.didGetResourceContent = WebInspector.Callback.processCallback;

WebInspector.ResourceTimeCalculator = function(startAtZero)
{
    WebInspector.AbstractTimelineCalculator.call(this);
    this.startAtZero = startAtZero;
}

WebInspector.ResourceTimeCalculator.prototype = {
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
        return Number.secondsToString(value, WebInspector.UIString);
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

WebInspector.ResourceTimeCalculator.prototype.__proto__ = WebInspector.AbstractTimelineCalculator.prototype;

WebInspector.ResourceTransferTimeCalculator = function()
{
    WebInspector.ResourceTimeCalculator.call(this, false);
}

WebInspector.ResourceTransferTimeCalculator.prototype = {
    formatValue: function(value)
    {
        return Number.secondsToString(value, WebInspector.UIString);
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

WebInspector.ResourceTransferTimeCalculator.prototype.__proto__ = WebInspector.ResourceTimeCalculator.prototype;

WebInspector.ResourceTransferDurationCalculator = function()
{
    WebInspector.ResourceTimeCalculator.call(this, true);
}

WebInspector.ResourceTransferDurationCalculator.prototype = {
    formatValue: function(value)
    {
        return Number.secondsToString(value, WebInspector.UIString);
    },

    _upperBound: function(resource)
    {
        return resource.duration;
    }
}

WebInspector.ResourceTransferDurationCalculator.prototype.__proto__ = WebInspector.ResourceTimeCalculator.prototype;

WebInspector.ResourceTransferSizeCalculator = function()
{
    WebInspector.AbstractTimelineCalculator.call(this);
}

WebInspector.ResourceTransferSizeCalculator.prototype = {
    computeBarGraphLabels: function(resource)
    {
        var networkBytes = this._networkBytes(resource);
        var resourceBytes = this._value(resource);
        if (networkBytes && networkBytes !== resourceBytes) {
            // Transferred size is not the same as reported resource length.
            var networkBytesString = this.formatValue(networkBytes);
            var left = networkBytesString;
            var right = this.formatValue(resourceBytes);
            var tooltip = right ? WebInspector.UIString("%s (%s transferred)", right, networkBytesString) : right;
        } else {
            var left = this.formatValue(resourceBytes);
            var right = left;
            var tooltip = left;
        }
        if (resource.cached)
            tooltip = WebInspector.UIString("%s (from cache)", tooltip);
        return {left: left, right: right, tooltip: tooltip};
    },

    computeBarGraphPercentages: function(item)
    {
        const resourceBytesAsPercent = (this._value(item) / this.boundarySpan) * 100;
        const networkBytesAsPercent = this._networkBytes(item) ? (this._networkBytes(item) / this.boundarySpan) * 100 : resourceBytesAsPercent;
        return {start: 0, middle: networkBytesAsPercent, end: resourceBytesAsPercent};
    },

    _value: function(resource)
    {
        return resource.resourceSize;
    },

    _networkBytes: function(resource)
    {
        return resource.transferSize;
    },

    formatValue: function(value)
    {
        return Number.bytesToString(value, WebInspector.UIString);
    }
}

WebInspector.ResourceTransferSizeCalculator.prototype.__proto__ = WebInspector.AbstractTimelineCalculator.prototype;

WebInspector.ResourceSidebarTreeElement = function(resource)
{
    this.resource = resource;

    this.createIconElement();

    WebInspector.SidebarTreeElement.call(this, "resource-sidebar-tree-item", "", "", resource);

    this.refreshTitles();
}

WebInspector.ResourceSidebarTreeElement.prototype = {
    onattach: function()
    {
        WebInspector.SidebarTreeElement.prototype.onattach.call(this);

        this._listItemNode.addStyleClass("resources-category-" + this.resource.category.name);
        this._listItemNode.draggable = true;
        
        // FIXME: should actually add handler to parent, to be resolved via
        // https://bugs.webkit.org/show_bug.cgi?id=30227
        this._listItemNode.addEventListener("dragstart", this.ondragstart.bind(this), false);
        this.updateErrorsAndWarnings();
    },

    onselect: function()
    {
        WebInspector.panels.resources.showResource(this.resource);
    },
    
    ondblclick: function(event)
    {
        InjectedScriptAccess.getDefault().openInInspectedWindow(this.resource.url, function() {});
    },

    ondragstart: function(event) {
        event.dataTransfer.setData("text/plain", this.resource.url);
        event.dataTransfer.setData("text/uri-list", this.resource.url + "\r\n");
        event.dataTransfer.effectAllowed = "copy";
        return true;
    },

    get mainTitle()
    {
        return this.resource.displayName;
    },

    set mainTitle(x)
    {
        // Do nothing.
    },

    get subtitle()
    {
        var subtitle = this.resource.displayDomain;

        if (this.resource.path && this.resource.lastPathComponent) {
            var lastPathComponentIndex = this.resource.path.lastIndexOf("/" + this.resource.lastPathComponent);
            if (lastPathComponentIndex != -1)
                subtitle += this.resource.path.substring(0, lastPathComponentIndex);
        }

        return subtitle;
    },

    set subtitle(x)
    {
        // Do nothing.
    },

    get selectable()
    {
        return WebInspector.panels.resources.isCategoryVisible(this.resource.category.name);
    },

    createIconElement: function()
    {
        var previousIconElement = this.iconElement;

        if (this.resource.category === WebInspector.resourceCategories.images) {
            var previewImage = document.createElement("img");
            previewImage.className = "image-resource-icon-preview";
            previewImage.src = this.resource.url;

            this.iconElement = document.createElement("div");
            this.iconElement.className = "icon";
            this.iconElement.appendChild(previewImage);
        } else {
            this.iconElement = document.createElement("img");
            this.iconElement.className = "icon";
        }

        if (previousIconElement)
            previousIconElement.parentNode.replaceChild(this.iconElement, previousIconElement);
    },

    refresh: function()
    {
        this.refreshTitles();

        if (!this._listItemNode.hasStyleClass("resources-category-" + this.resource.category.name)) {
            this._listItemNode.removeMatchingStyleClasses("resources-category-\\w+");
            this._listItemNode.addStyleClass("resources-category-" + this.resource.category.name);

            this.createIconElement();
        }

        this.tooltip = this.resource.url;
    },

    resetBubble: function()
    {
        this.bubbleText = "";
        this.bubbleElement.removeStyleClass("search-matches");
        this.bubbleElement.removeStyleClass("warning");
        this.bubbleElement.removeStyleClass("error");
    },

    set searchMatches(matches)
    {
        this.resetBubble();

        if (!matches)
            return;

        this.bubbleText = matches;
        this.bubbleElement.addStyleClass("search-matches");
    },

    updateErrorsAndWarnings: function()
    {
        this.resetBubble();

        if (this.resource.warnings || this.resource.errors)
            this.bubbleText = (this.resource.warnings + this.resource.errors);

        if (this.resource.warnings)
            this.bubbleElement.addStyleClass("warning");

        if (this.resource.errors)
            this.bubbleElement.addStyleClass("error");
    }
}

WebInspector.ResourceSidebarTreeElement.CompareByAscendingStartTime = function(a, b)
{
    return WebInspector.Resource.CompareByStartTime(a.resource, b.resource)
        || WebInspector.Resource.CompareByEndTime(a.resource, b.resource)
        || WebInspector.Resource.CompareByResponseReceivedTime(a.resource, b.resource);
}

WebInspector.ResourceSidebarTreeElement.CompareByAscendingResponseReceivedTime = function(a, b)
{
    return WebInspector.Resource.CompareByResponseReceivedTime(a.resource, b.resource)
        || WebInspector.Resource.CompareByStartTime(a.resource, b.resource)
        || WebInspector.Resource.CompareByEndTime(a.resource, b.resource);
}

WebInspector.ResourceSidebarTreeElement.CompareByAscendingEndTime = function(a, b)
{
    return WebInspector.Resource.CompareByEndTime(a.resource, b.resource)
        || WebInspector.Resource.CompareByStartTime(a.resource, b.resource)
        || WebInspector.Resource.CompareByResponseReceivedTime(a.resource, b.resource);
}

WebInspector.ResourceSidebarTreeElement.CompareByDescendingDuration = function(a, b)
{
    return -1 * WebInspector.Resource.CompareByDuration(a.resource, b.resource);
}

WebInspector.ResourceSidebarTreeElement.CompareByDescendingLatency = function(a, b)
{
    return -1 * WebInspector.Resource.CompareByLatency(a.resource, b.resource);
}

WebInspector.ResourceSidebarTreeElement.CompareByDescendingSize = function(a, b)
{
    return -1 * WebInspector.Resource.CompareBySize(a.resource, b.resource);
}

WebInspector.ResourceSidebarTreeElement.CompareByDescendingTransferSize = function(a, b)
{
    return -1 * WebInspector.Resource.CompareByTransferSize(a.resource, b.resource);
}

WebInspector.ResourceSidebarTreeElement.prototype.__proto__ = WebInspector.SidebarTreeElement.prototype;

WebInspector.ResourceGraph = function(resource)
{
    this.resource = resource;

    this._graphElement = document.createElement("div");
    this._graphElement.className = "resources-graph-side";
    this._graphElement.addEventListener("mouseover", this.refreshLabelPositions.bind(this), false);

    this._cachedChanged();

    this._barAreaElement = document.createElement("div");
    this._barAreaElement.className = "resources-graph-bar-area hidden";
    this._barAreaElement.resource = resource;
    this._graphElement.appendChild(this._barAreaElement);

    this._barLeftElement = document.createElement("div");
    this._barLeftElement.className = "resources-graph-bar waiting";
    this._barAreaElement.appendChild(this._barLeftElement);

    this._barRightElement = document.createElement("div");
    this._barRightElement.className = "resources-graph-bar";
    this._barAreaElement.appendChild(this._barRightElement);

    this._labelLeftElement = document.createElement("div");
    this._labelLeftElement.className = "resources-graph-label waiting";
    this._barAreaElement.appendChild(this._labelLeftElement);

    this._labelRightElement = document.createElement("div");
    this._labelRightElement.className = "resources-graph-label";
    this._barAreaElement.appendChild(this._labelRightElement);

    this._graphElement.addStyleClass("resources-category-" + resource.category.name);

    resource.addEventListener("cached changed", this._cachedChanged, this);
}

WebInspector.ResourceGraph.prototype = {
    get graphElement()
    {
        return this._graphElement;
    },

    refreshLabelPositions: function()
    {
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

        if (this._isBarOpaqueAtLeft) {
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
    },

    refresh: function(calculator, isBarOpaqueAtLeft)
    {
        var percentages = calculator.computeBarGraphPercentages(this.resource);
        var labels = calculator.computeBarGraphLabels(this.resource);

        this._percentages = percentages;

        this._barAreaElement.removeStyleClass("hidden");

        if (!this._graphElement.hasStyleClass("resources-category-" + this.resource.category.name)) {
            this._graphElement.removeMatchingStyleClasses("resources-category-\\w+");
            this._graphElement.addStyleClass("resources-category-" + this.resource.category.name);
        }

        this._barLeftElement.style.setProperty("left", percentages.start + "%");
        this._barRightElement.style.setProperty("right", (100 - percentages.end) + "%");

        if (!isBarOpaqueAtLeft) {
            this._barLeftElement.style.setProperty("right", (100 - percentages.end) + "%");
            this._barRightElement.style.setProperty("left", percentages.middle + "%");

            if (this._isBarOpaqueAtLeft != isBarOpaqueAtLeft) {
                this._barLeftElement.addStyleClass("waiting");
                this._barRightElement.removeStyleClass("waiting-right");
                this._labelLeftElement.addStyleClass("waiting");
                this._labelRightElement.removeStyleClass("waiting-right");
            }
        } else {
            this._barLeftElement.style.setProperty("right", (100 - percentages.middle) + "%");
            this._barRightElement.style.setProperty("left", percentages.start + "%");

            if (this._isBarOpaqueAtLeft != isBarOpaqueAtLeft) {
                this._barLeftElement.removeStyleClass("waiting");
                this._barRightElement.addStyleClass("waiting-right");
                this._labelLeftElement.removeStyleClass("waiting");
                this._labelRightElement.addStyleClass("waiting-right");
            }
        }

        this._isBarOpaqueAtLeft = isBarOpaqueAtLeft;

        this._labelLeftElement.textContent = labels.left;
        this._labelRightElement.textContent = labels.right;

        var tooltip = (labels.tooltip || "");
        this._barLeftElement.title = tooltip;
        this._labelLeftElement.title = tooltip;
        this._labelRightElement.title = tooltip;
        this._barRightElement.title = tooltip;
    },

    _cachedChanged: function()
    {
        if (this.resource.cached)
            this._graphElement.addStyleClass("resource-cached");
    }
}
