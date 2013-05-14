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
 * @extends {WebInspector.View}
 * @param {!WebInspector.ProfilesPanel} parent
 * @param {!WebInspector.HeapProfileHeader} profile
 */
WebInspector.HeapSnapshotView = function(parent, profile)
{
    WebInspector.View.call(this);

    this.element.addStyleClass("heap-snapshot-view");

    this.parent = parent;
    this.parent.addEventListener("profile added", this._onProfileHeaderAdded, this);

    if (profile._profileSamples) {
        this._trackingOverviewGrid = new WebInspector.HeapTrackingOverviewGrid(profile);
        this._trackingOverviewGrid.addEventListener(WebInspector.HeapTrackingOverviewGrid.IdsRangeChanged, this._onIdsRangeChanged.bind(this));
        this._trackingOverviewGrid.show(this.element);
    }

    this.viewsContainer = document.createElement("div");
    this.viewsContainer.addStyleClass("views-container");
    this.element.appendChild(this.viewsContainer);

    this.containmentView = new WebInspector.View();
    this.containmentView.element.addStyleClass("view");
    this.containmentDataGrid = new WebInspector.HeapSnapshotContainmentDataGrid();
    this.containmentDataGrid.element.addEventListener("mousedown", this._mouseDownInContentsGrid.bind(this), true);
    this.containmentDataGrid.show(this.containmentView.element);
    this.containmentDataGrid.addEventListener(WebInspector.DataGrid.Events.SelectedNode, this._selectionChanged, this);

    this.constructorsView = new WebInspector.View();
    this.constructorsView.element.addStyleClass("view");
    this.constructorsView.element.appendChild(this._createToolbarWithClassNameFilter());

    this.constructorsDataGrid = new WebInspector.HeapSnapshotConstructorsDataGrid();
    this.constructorsDataGrid.element.addStyleClass("class-view-grid");
    this.constructorsDataGrid.element.addEventListener("mousedown", this._mouseDownInContentsGrid.bind(this), true);
    this.constructorsDataGrid.show(this.constructorsView.element);
    this.constructorsDataGrid.addEventListener(WebInspector.DataGrid.Events.SelectedNode, this._selectionChanged, this);

    this.diffView = new WebInspector.View();
    this.diffView.element.addStyleClass("view");
    this.diffView.element.appendChild(this._createToolbarWithClassNameFilter());

    this.diffDataGrid = new WebInspector.HeapSnapshotDiffDataGrid();
    this.diffDataGrid.element.addStyleClass("class-view-grid");
    this.diffDataGrid.show(this.diffView.element);
    this.diffDataGrid.addEventListener(WebInspector.DataGrid.Events.SelectedNode, this._selectionChanged, this);

    this.dominatorView = new WebInspector.View();
    this.dominatorView.element.addStyleClass("view");
    this.dominatorDataGrid = new WebInspector.HeapSnapshotDominatorsDataGrid();
    this.dominatorDataGrid.element.addEventListener("mousedown", this._mouseDownInContentsGrid.bind(this), true);
    this.dominatorDataGrid.show(this.dominatorView.element);
    this.dominatorDataGrid.addEventListener(WebInspector.DataGrid.Events.SelectedNode, this._selectionChanged, this);

    this.retainmentViewHeader = document.createElement("div");
    this.retainmentViewHeader.addStyleClass("retainers-view-header");
    WebInspector.installDragHandle(this.retainmentViewHeader, this._startRetainersHeaderDragging.bind(this), this._retainersHeaderDragging.bind(this), this._endRetainersHeaderDragging.bind(this), "row-resize");
    var retainingPathsTitleDiv = document.createElement("div");
    retainingPathsTitleDiv.className = "title";
    var retainingPathsTitle = document.createElement("span");
    retainingPathsTitle.textContent = WebInspector.UIString("Object's retaining tree");
    retainingPathsTitleDiv.appendChild(retainingPathsTitle);
    this.retainmentViewHeader.appendChild(retainingPathsTitleDiv);
    this.element.appendChild(this.retainmentViewHeader);

    this.retainmentView = new WebInspector.View();
    this.retainmentView.element.addStyleClass("view");
    this.retainmentView.element.addStyleClass("retaining-paths-view");
    this.retainmentDataGrid = new WebInspector.HeapSnapshotRetainmentDataGrid();
    this.retainmentDataGrid.show(this.retainmentView.element);
    this.retainmentDataGrid.addEventListener(WebInspector.DataGrid.Events.SelectedNode, this._inspectedObjectChanged, this);
    this.retainmentView.show(this.element);
    this.retainmentDataGrid.reset();

    this.dataGrid = /** @type {WebInspector.HeapSnapshotSortableDataGrid} */ (this.constructorsDataGrid);
    this.currentView = this.constructorsView;

    this.viewSelect = new WebInspector.StatusBarComboBox(this._onSelectedViewChanged.bind(this));

    this.views = [{title: "Summary", view: this.constructorsView, grid: this.constructorsDataGrid},
                  {title: "Comparison", view: this.diffView, grid: this.diffDataGrid},
                  {title: "Containment", view: this.containmentView, grid: this.containmentDataGrid},
                  {title: "Dominators", view: this.dominatorView, grid: this.dominatorDataGrid}];
    this.views.current = 0;
    for (var i = 0; i < this.views.length; ++i)
        this.viewSelect.createOption(WebInspector.UIString(this.views[i].title));

    this._profileUid = profile.uid;
    this._profileTypeId = profile.profileType().id;

    this.baseSelect = new WebInspector.StatusBarComboBox(this._changeBase.bind(this));
    this.baseSelect.element.addStyleClass("hidden");
    this._updateBaseOptions();

    this.filterSelect = new WebInspector.StatusBarComboBox(this._changeFilter.bind(this));
    this._updateFilterOptions();

    this.helpButton = new WebInspector.StatusBarButton("", "heap-snapshot-help-status-bar-item status-bar-item");
    this.helpButton.addEventListener("click", this._helpClicked, this);

    this.selectedSizeText = new WebInspector.StatusBarText("");

    this._popoverHelper = new WebInspector.ObjectPopoverHelper(this.element, this._getHoverAnchor.bind(this), this._resolveObjectForPopover.bind(this), undefined, true);

    this.profile.load(profileCallback.bind(this));

    function profileCallback(heapSnapshotProxy)
    {
        var list = this._profiles();
        var profileIndex;
        for (var i = 0; i < list.length; ++i) {
            if (list[i].uid === this._profileUid) {
                profileIndex = i;
                break;
            }
        }

        if (profileIndex > 0)
            this.baseSelect.setSelectedIndex(profileIndex - 1);
        else
            this.baseSelect.setSelectedIndex(profileIndex);
        this.dataGrid.setDataSource(heapSnapshotProxy);
    }
}

WebInspector.HeapSnapshotView.prototype = {
    _onIdsRangeChanged: function(event)
    {
        var minId = event.data.minId;
        var maxId = event.data.maxId;
        this.selectedSizeText.setText(WebInspector.UIString("Selected size: %s", Number.bytesToString(event.data.size)));
        if (this.constructorsDataGrid._minNodeId !== minId || this.constructorsDataGrid._maxNodeId !== maxId) {
            // FIXME(loislo): we should implement rangeFilter method in constructorsDataGrid.
            this.constructorsDataGrid._minNodeId = minId;
            this.constructorsDataGrid._maxNodeId = maxId;
            if (this.constructorsDataGrid.snapshot) {
                this.constructorsDataGrid._profileIndex = 1;
                this.constructorsDataGrid._populateChildren();
            }
        }
    },

    dispose: function()
    {
        this.profile.dispose();
        if (this.baseProfile)
            this.baseProfile.dispose();
        this.containmentDataGrid.dispose();
        this.constructorsDataGrid.dispose();
        this.diffDataGrid.dispose();
        this.dominatorDataGrid.dispose();
        this.retainmentDataGrid.dispose();
    },

    get statusBarItems()
    {
        return [this.viewSelect.element, this.baseSelect.element, this.filterSelect.element, this.helpButton.element, this.selectedSizeText.element];
    },

    get profile()
    {
        return this.parent.getProfile(this._profileTypeId, this._profileUid);
    },

    get baseProfile()
    {
        return this.parent.getProfile(this._profileTypeId, this._baseProfileUid);
    },

    wasShown: function()
    {
        // FIXME: load base and current snapshots in parallel
        this.profile.load(profileCallback1.bind(this));

        function profileCallback1() {
            if (this.baseProfile)
                this.baseProfile.load(profileCallback2.bind(this));
            else
                profileCallback2.call(this);
        }

        function profileCallback2() {
            this.currentView.show(this.viewsContainer);
        }
    },

    willHide: function()
    {
        this._currentSearchResultIndex = -1;
        this._popoverHelper.hidePopover();
        if (this.helpPopover && this.helpPopover.isShowing())
            this.helpPopover.hide();
    },

    onResize: function()
    {
        var height = this.retainmentView.element.clientHeight;
        this._updateRetainmentViewHeight(height);
    },

    searchCanceled: function()
    {
        if (this._searchResults) {
            for (var i = 0; i < this._searchResults.length; ++i) {
                var node = this._searchResults[i].node;
                delete node._searchMatched;
                node.refresh();
            }
        }

        delete this._searchFinishedCallback;
        this._currentSearchResultIndex = -1;
        this._searchResults = [];
    },

    performSearch: function(query, finishedCallback)
    {
        // Call searchCanceled since it will reset everything we need before doing a new search.
        this.searchCanceled();

        query = query.trim();

        if (!query.length)
            return;
        if (this.currentView !== this.constructorsView && this.currentView !== this.diffView)
            return;

        this._searchFinishedCallback = finishedCallback;

        function matchesByName(gridNode) {
            return ("_name" in gridNode) && gridNode._name.hasSubstring(query, true);
        }

        function matchesById(gridNode) {
            return ("snapshotNodeId" in gridNode) && gridNode.snapshotNodeId === query;
        }

        var matchPredicate;
        if (query.charAt(0) !== "@")
            matchPredicate = matchesByName;
        else {
            query = parseInt(query.substring(1), 10);
            matchPredicate = matchesById;
        }

        function matchesQuery(gridNode)
        {
            delete gridNode._searchMatched;
            if (matchPredicate(gridNode)) {
                gridNode._searchMatched = true;
                gridNode.refresh();
                return true;
            }
            return false;
        }

        var current = this.dataGrid.rootNode().children[0];
        var depth = 0;
        var info = {};

        // Restrict to type nodes and instances.
        const maxDepth = 1;

        while (current) {
            if (matchesQuery(current))
                this._searchResults.push({ node: current });
            current = current.traverseNextNode(false, null, (depth >= maxDepth), info);
            depth += info.depthChange;
        }

        finishedCallback(this, this._searchResults.length);
    },

    jumpToFirstSearchResult: function()
    {
        if (!this._searchResults || !this._searchResults.length)
            return;
        this._currentSearchResultIndex = 0;
        this._jumpToSearchResult(this._currentSearchResultIndex);
    },

    jumpToLastSearchResult: function()
    {
        if (!this._searchResults || !this._searchResults.length)
            return;
        this._currentSearchResultIndex = (this._searchResults.length - 1);
        this._jumpToSearchResult(this._currentSearchResultIndex);
    },

    jumpToNextSearchResult: function()
    {
        if (!this._searchResults || !this._searchResults.length)
            return;
        if (++this._currentSearchResultIndex >= this._searchResults.length)
            this._currentSearchResultIndex = 0;
        this._jumpToSearchResult(this._currentSearchResultIndex);
    },

    jumpToPreviousSearchResult: function()
    {
        if (!this._searchResults || !this._searchResults.length)
            return;
        if (--this._currentSearchResultIndex < 0)
            this._currentSearchResultIndex = (this._searchResults.length - 1);
        this._jumpToSearchResult(this._currentSearchResultIndex);
    },

    showingFirstSearchResult: function()
    {
        return (this._currentSearchResultIndex === 0);
    },

    showingLastSearchResult: function()
    {
        return (this._searchResults && this._currentSearchResultIndex === (this._searchResults.length - 1));
    },

    _jumpToSearchResult: function(index)
    {
        var searchResult = this._searchResults[index];
        if (!searchResult)
            return;

        var node = searchResult.node;
        node.revealAndSelect();
    },

    refreshVisibleData: function()
    {
        var child = this.dataGrid.rootNode().children[0];
        while (child) {
            child.refresh();
            child = child.traverseNextNode(false, null, true);
        }
    },

    _changeBase: function()
    {
        if (this._baseProfileUid === this._profiles()[this.baseSelect.selectedIndex()].uid)
            return;

        this._baseProfileUid = this._profiles()[this.baseSelect.selectedIndex()].uid;
        var dataGrid = /** @type {WebInspector.HeapSnapshotDiffDataGrid} */ (this.dataGrid);
        // Change set base data source only if main data source is already set.
        if (dataGrid.snapshot)
            this.baseProfile.load(dataGrid.setBaseDataSource.bind(dataGrid));

        if (!this.currentQuery || !this._searchFinishedCallback || !this._searchResults)
            return;

        // The current search needs to be performed again. First negate out previous match
        // count by calling the search finished callback with a negative number of matches.
        // Then perform the search again with the same query and callback.
        this._searchFinishedCallback(this, -this._searchResults.length);
        this.performSearch(this.currentQuery, this._searchFinishedCallback);
    },

    _changeFilter: function()
    {
        var profileIndex = this.filterSelect.selectedIndex() - 1;
        this.dataGrid.filterSelectIndexChanged(this._profiles(), profileIndex);

        WebInspector.notifications.dispatchEventToListeners(WebInspector.UserMetrics.UserAction, {
            action: WebInspector.UserMetrics.UserActionNames.HeapSnapshotFilterChanged,
            label: this.filterSelect.selectedOption().label
        });

        if (!this.currentQuery || !this._searchFinishedCallback || !this._searchResults)
            return;

        // The current search needs to be performed again. First negate out previous match
        // count by calling the search finished callback with a negative number of matches.
        // Then perform the search again with the same query and callback.
        this._searchFinishedCallback(this, -this._searchResults.length);
        this.performSearch(this.currentQuery, this._searchFinishedCallback);
    },

    _createToolbarWithClassNameFilter: function()
    {
        var toolbar = document.createElement("div");
        toolbar.addStyleClass("class-view-toolbar");
        var classNameFilter = document.createElement("input");
        classNameFilter.addStyleClass("class-name-filter");
        classNameFilter.setAttribute("placeholder", WebInspector.UIString("Class filter"));
        classNameFilter.addEventListener("keyup", this._changeNameFilter.bind(this, classNameFilter), false);
        toolbar.appendChild(classNameFilter);
        return toolbar;
    },

    _changeNameFilter: function(classNameInputElement)
    {
        var filter = classNameInputElement.value;
        this.dataGrid.changeNameFilter(filter);
    },

    /**
     * @return {!Array.<!WebInspector.ProfileHeader>}
     */
    _profiles: function()
    {
        return this.parent.getProfileType(this._profileTypeId).getProfiles();
    },

    /**
     * @param {WebInspector.ContextMenu} contextMenu
     * @param {Event} event
     */
    populateContextMenu: function(contextMenu, event)
    {
        this.dataGrid.populateContextMenu(this.parent, contextMenu, event);
    },

    _selectionChanged: function(event)
    {
        var selectedNode = event.target.selectedNode;
        this._setRetainmentDataGridSource(selectedNode);
        this._inspectedObjectChanged(event);
    },

    _inspectedObjectChanged: function(event)
    {
        var selectedNode = event.target.selectedNode;
        if (!this.profile.fromFile() && selectedNode instanceof WebInspector.HeapSnapshotGenericObjectNode)
            ConsoleAgent.addInspectedHeapObject(selectedNode.snapshotNodeId);
    },

    _setRetainmentDataGridSource: function(nodeItem)
    {
        if (nodeItem && nodeItem.snapshotNodeIndex)
            this.retainmentDataGrid.setDataSource(nodeItem.isDeletedNode ? nodeItem.dataGrid.baseSnapshot : nodeItem.dataGrid.snapshot, nodeItem.snapshotNodeIndex);
        else
            this.retainmentDataGrid.reset();
    },

    _mouseDownInContentsGrid: function(event)
    {
        if (event.detail < 2)
            return;

        var cell = event.target.enclosingNodeOrSelfWithNodeName("td");
        if (!cell || (!cell.hasStyleClass("count-column") && !cell.hasStyleClass("shallowSize-column") && !cell.hasStyleClass("retainedSize-column")))
            return;

        event.consume(true);
    },

    changeView: function(viewTitle, callback)
    {
        var viewIndex = null;
        for (var i = 0; i < this.views.length; ++i) {
            if (this.views[i].title === viewTitle) {
                viewIndex = i;
                break;
            }
        }
        if (this.views.current === viewIndex || viewIndex == null) {
            setTimeout(callback, 0);
            return;
        }

        function dataGridContentShown(event)
        {
            var dataGrid = event.data;
            dataGrid.removeEventListener(WebInspector.HeapSnapshotSortableDataGrid.Events.ContentShown, dataGridContentShown, this);
            if (dataGrid === this.dataGrid)
                callback();
        }
        this.views[viewIndex].grid.addEventListener(WebInspector.HeapSnapshotSortableDataGrid.Events.ContentShown, dataGridContentShown, this);

        this.viewSelect.setSelectedIndex(viewIndex);
        this._changeView(viewIndex);
    },

    _updateDataSourceAndView: function()
    {
        var dataGrid = this.dataGrid;
        if (dataGrid.snapshot)
            return;

        this.profile.load(didLoadSnapshot.bind(this));
        function didLoadSnapshot(snapshotProxy)
        {
            if (this.dataGrid !== dataGrid)
                return;
            if (dataGrid.snapshot !== snapshotProxy)
                dataGrid.setDataSource(snapshotProxy);
            if (dataGrid === this.diffDataGrid) {
                if (!this._baseProfileUid)
                    this._baseProfileUid = this._profiles()[this.baseSelect.selectedIndex()].uid;
                this.baseProfile.load(didLoadBaseSnaphot.bind(this));
            }
        }

        function didLoadBaseSnaphot(baseSnapshotProxy)
        {
            if (this.diffDataGrid.baseSnapshot !== baseSnapshotProxy)
                this.diffDataGrid.setBaseDataSource(baseSnapshotProxy);
        }
    },

    _onSelectedViewChanged: function(event)
    {
        this._changeView(event.target.selectedIndex);
    },

    _updateSelectorsVisibility: function()
    {
        if (this.currentView === this.diffView)
            this.baseSelect.element.removeStyleClass("hidden");
        else
            this.baseSelect.element.addStyleClass("hidden");

        if (this.currentView === this.constructorsView) {
            if (this._trackingOverviewGrid) {
                this._trackingOverviewGrid.element.removeStyleClass("hidden");
                this._trackingOverviewGrid.update(true);
                this.viewsContainer.addStyleClass("reserve-80px-at-top");
            }
            this.filterSelect.element.removeStyleClass("hidden");
        } else {
            this.filterSelect.element.addStyleClass("hidden");
            if (this._trackingOverviewGrid) {
                this._trackingOverviewGrid.element.addStyleClass("hidden");
                this.viewsContainer.removeStyleClass("reserve-80px-at-top");
            }
        }
    },

    _changeView: function(selectedIndex)
    {
        if (selectedIndex === this.views.current)
            return;

        this.views.current = selectedIndex;
        this.currentView.detach();
        var view = this.views[this.views.current];
        this.currentView = view.view;
        this.dataGrid = view.grid;
        this.currentView.show(this.viewsContainer);
        this.refreshVisibleData();
        this.dataGrid.updateWidths();

        this._updateSelectorsVisibility();

        this._updateDataSourceAndView();

        if (!this.currentQuery || !this._searchFinishedCallback || !this._searchResults)
            return;

        // The current search needs to be performed again. First negate out previous match
        // count by calling the search finished callback with a negative number of matches.
        // Then perform the search again the with same query and callback.
        this._searchFinishedCallback(this, -this._searchResults.length);
        this.performSearch(this.currentQuery, this._searchFinishedCallback);
    },

    _getHoverAnchor: function(target)
    {
        var span = target.enclosingNodeOrSelfWithNodeName("span");
        if (!span)
            return;
        var row = target.enclosingNodeOrSelfWithNodeName("tr");
        if (!row)
            return;
        span.node = row._dataGridNode;
        return span;
    },

    _resolveObjectForPopover: function(element, showCallback, objectGroupName)
    {
        if (this.profile.fromFile())
            return;
        element.node.queryObjectContent(showCallback, objectGroupName);
    },

    _helpClicked: function(event)
    {
        if (!this._helpPopoverContentElement) {
            var refTypes = ["a:", "console-formatted-name", WebInspector.UIString("property"),
                            "0:", "console-formatted-name", WebInspector.UIString("element"),
                            "a:", "console-formatted-number", WebInspector.UIString("context var"),
                            "a:", "console-formatted-null", WebInspector.UIString("system prop")];
            var objTypes = [" a ", "console-formatted-object", "Object",
                            "\"a\"", "console-formatted-string", "String",
                            "/a/", "console-formatted-string", "RegExp",
                            "a()", "console-formatted-function", "Function",
                            "a[]", "console-formatted-object", "Array",
                            "num", "console-formatted-number", "Number",
                            " a ", "console-formatted-null", "System"];

            var contentElement = document.createElement("table");
            contentElement.className = "heap-snapshot-help";
            var headerRow = document.createElement("tr");
            var propsHeader = document.createElement("th");
            propsHeader.textContent = WebInspector.UIString("Property types:");
            headerRow.appendChild(propsHeader);
            var objsHeader = document.createElement("th");
            objsHeader.textContent = WebInspector.UIString("Object types:");
            headerRow.appendChild(objsHeader);
            contentElement.appendChild(headerRow);

            function appendHelp(help, index, cell)
            {
                var div = document.createElement("div");
                div.className = "source-code event-properties";
                var name = document.createElement("span");
                name.textContent = help[index];
                name.className = help[index + 1];
                div.appendChild(name);
                var desc = document.createElement("span");
                desc.textContent = " " + help[index + 2];
                div.appendChild(desc);
                cell.appendChild(div);
            }

            var len = Math.max(refTypes.length, objTypes.length);
            for (var i = 0; i < len; i += 3) {
                var row = document.createElement("tr");
                var refCell = document.createElement("td");
                if (refTypes[i])
                    appendHelp(refTypes, i, refCell);
                row.appendChild(refCell);
                var objCell = document.createElement("td");
                if (objTypes[i])
                    appendHelp(objTypes, i, objCell);
                row.appendChild(objCell);
                contentElement.appendChild(row);
            }
            this._helpPopoverContentElement = contentElement;
            this.helpPopover = new WebInspector.Popover();
        }
        if (this.helpPopover.isShowing())
            this.helpPopover.hide();
        else
            this.helpPopover.show(this._helpPopoverContentElement, this.helpButton.element);
    },

    /**
     * @return {boolean}
     */
    _startRetainersHeaderDragging: function(event)
    {
        if (!this.isShowing())
            return false;

        this._previousDragPosition = event.pageY;
        return true;
    },

    _retainersHeaderDragging: function(event)
    {
        var height = this.retainmentView.element.clientHeight;
        height += this._previousDragPosition - event.pageY;
        this._previousDragPosition = event.pageY;
        this._updateRetainmentViewHeight(height);
        event.consume(true);
    },

    _endRetainersHeaderDragging: function(event)
    {
        delete this._previousDragPosition;
        event.consume();
    },

    _updateRetainmentViewHeight: function(height)
    {
        height = Number.constrain(height, Preferences.minConsoleHeight, this.element.clientHeight - Preferences.minConsoleHeight);
        this.viewsContainer.style.bottom = (height + this.retainmentViewHeader.clientHeight) + "px";
        if (this._trackingOverviewGrid && this.currentView === this.constructorsView)
            this.viewsContainer.addStyleClass("reserve-80px-at-top");
        this.retainmentView.element.style.height = height + "px";
        this.retainmentViewHeader.style.bottom = height + "px";
        this.currentView.doResize();
    },

    _updateBaseOptions: function()
    {
        var list = this._profiles();
        // We're assuming that snapshots can only be added.
        if (this.baseSelect.size() === list.length)
            return;

        for (var i = this.baseSelect.size(), n = list.length; i < n; ++i) {
            var title = list[i].title;
            if (WebInspector.ProfilesPanelDescriptor.isUserInitiatedProfile(title))
                title = WebInspector.UIString("Snapshot %d", WebInspector.ProfilesPanelDescriptor.userInitiatedProfileIndex(title));
            this.baseSelect.createOption(title);
        }
    },

    _updateFilterOptions: function()
    {
        var list = this._profiles();
        // We're assuming that snapshots can only be added.
        if (this.filterSelect.size() - 1 === list.length)
            return;

        if (!this.filterSelect.size())
            this.filterSelect.createOption(WebInspector.UIString("All objects"));

        if (this.profile.fromFile())
            return;
        for (var i = this.filterSelect.size() - 1, n = list.length; i < n; ++i) {
            var profile = list[i];
            var title = list[i].title;
            if (WebInspector.ProfilesPanelDescriptor.isUserInitiatedProfile(title)) {
                var profileIndex = WebInspector.ProfilesPanelDescriptor.userInitiatedProfileIndex(title);
                if (!i)
                    title = WebInspector.UIString("Objects allocated before Snapshot %d", profileIndex);
                else
                    title = WebInspector.UIString("Objects allocated between Snapshots %d and %d", profileIndex - 1, profileIndex);
            }
            this.filterSelect.createOption(title);
        }
    },

    /**
     * @param {WebInspector.Event} event
     */
    _onProfileHeaderAdded: function(event)
    {
        if (!event.data || event.data.type !== this._profileTypeId)
            return;
        this._updateBaseOptions();
        this._updateFilterOptions();
    },

    __proto__: WebInspector.View.prototype
}


/**
 * @constructor
 * @extends {WebInspector.ProfileType}
 * @implements {HeapProfilerAgent.Dispatcher}
 */
WebInspector.HeapSnapshotProfileType = function()
{
    WebInspector.ProfileType.call(this, WebInspector.HeapSnapshotProfileType.TypeId, WebInspector.UIString("Take Heap Snapshot"));
    InspectorBackend.registerHeapProfilerDispatcher(this);
}

WebInspector.HeapSnapshotProfileType.TypeId = "HEAP";

WebInspector.HeapSnapshotProfileType.prototype = {
    /**
     * @override
     * @return {string}
     */
    fileExtension: function()
    {
        return ".heapsnapshot";
    },

    get buttonTooltip()
    {
        return WebInspector.UIString("Take heap snapshot.");
    },

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
        this._takeHeapSnapshot();
        return false;
    },

    startRecordingProfile: function()
    {
        this._lastSeenIndex = -1;
        this._profileSamples = {
            'sizes': [],
            'ids': [],
            'timestamps': [],
            'max': []
        };
        this._recording = true;
        this._currentIndex = 0;
        HeapProfilerAgent.startTrackingHeapObjects();
    },

    stopRecordingProfile: function()
    {
        HeapProfilerAgent.stopTrackingHeapObjects();
        this.addProfile(this.createTemporaryProfile());
        HeapProfilerAgent.takeHeapSnapshot(true);
        this._recording = false;
    },

    toggleRecording: function()
    {
        if (this._recording)
            this.stopRecordingProfile();
        else
            this.startRecordingProfile();
        return this._recording;
    },

    /**
     * @override
     * @param {Array.<number>} samples
     */
    heapStatsUpdate: function(samples)
    {
        if (!this._profileSamples) {
            HeapProfilerAgent.stopTrackingHeapObjects();
            return;
        }
        var index;
        for (var i = 0; i < samples.length; i += 3) {
            index = samples[i];
            var count = samples[i+1];
            var size  = samples[i+2];
            this._profileSamples.sizes[index] = size;
            if (size > this._profileSamples.max[index])
                this._profileSamples.max[index] = size;
        }
        this._lastUpdatedIndex = index;
    },

    /**
     * @override
     * @param {number} lastSeenObjectId
     * @param {number} timestamp
     */
    lastSeenObjectId: function(lastSeenObjectId, timestamp)
    {
        this._profileSamples.ids[this._currentIndex] = lastSeenObjectId;
        this._profileSamples.timestamps[this._currentIndex] = timestamp;
        if (!this._profileSamples.max[this._currentIndex]) {
            this._profileSamples.max[this._currentIndex] = 0;
            this._profileSamples.sizes[this._currentIndex] = 0;
        }
        ++this._currentIndex;
    },

    get  treeItemTitle()
    {
        return WebInspector.UIString("HEAP SNAPSHOTS");
    },

    get description()
    {
        return WebInspector.UIString("Heap snapshot profiles show memory distribution among your page's JavaScript objects and related DOM nodes.");
    },

    /**
     * @override
     * @param {string=} title
     * @return {!WebInspector.ProfileHeader}
     */
    createTemporaryProfile: function(title)
    {
        title = title || WebInspector.UIString("Snapshotting\u2026");
        return new WebInspector.HeapProfileHeader(this, title);
    },

    /**
     * @override
     * @param {HeapProfilerAgent.ProfileHeader} profile
     * @return {!WebInspector.ProfileHeader}
     */
    createProfile: function(profile)
    {
        return new WebInspector.HeapProfileHeader(this, profile.title, profile.uid, profile.maxJSObjectId || 0);
    },

    _takeHeapSnapshot: function()
    {
        var temporaryProfile = this.findTemporaryProfile();
        if (!temporaryProfile)
            this.addProfile(this.createTemporaryProfile());
        HeapProfilerAgent.takeHeapSnapshot(true, function() {});
        WebInspector.userMetrics.ProfilesHeapProfileTaken.record();
    },

    /**
     * @param {HeapProfilerAgent.ProfileHeader} profileHeader
     */
    addProfileHeader: function(profileHeader)
    {
        var profile = this.createProfile(profileHeader);
        profile._profileSamples = this._profileSamples;
        this._profileSamples = null;
        this.addProfile(profile);
    },

    /**
     * @override
     * @param {number} uid
     * @param {string} chunk
     */
    addHeapSnapshotChunk: function(uid, chunk)
    {
        var profile = this._profilesIdMap[this._makeKey(uid)];
        if (profile)
            profile.transferChunk(chunk);
    },

    /**
     * @override
     * @param {number} uid
     */
    finishHeapSnapshot: function(uid)
    {
        var profile = this._profilesIdMap[this._makeKey(uid)];
        if (profile)
            profile.finishHeapSnapshot();
    },

    /**
     * @override
     * @param {number} done
     * @param {number} total
     */
    reportHeapSnapshotProgress: function(done, total)
    {
        var profile = this.findTemporaryProfile();
        if (profile)
            this.dispatchEventToListeners(WebInspector.ProfileType.Events.ProgressUpdated, {"profile": profile, "done": done, "total": total});
    },

    /**
     * @override
     */
    resetProfiles: function()
    {
        this._reset();
    },

    /**
     * @override
     * @param {!WebInspector.ProfileHeader} profile
     */
    removeProfile: function(profile)
    {
        WebInspector.ProfileType.prototype.removeProfile.call(this, profile);
        if (!profile.isTemporary)
            HeapProfilerAgent.removeProfile(profile.uid);
    },

    /**
     * @override
     * @param {function(this:WebInspector.ProfileType, ?string, Array.<HeapProfilerAgent.ProfileHeader>)} populateCallback
     */
    _requestProfilesFromBackend: function(populateCallback)
    {
        HeapProfilerAgent.getProfileHeaders(populateCallback);
    },

    __proto__: WebInspector.ProfileType.prototype
}


/**
 * @constructor
 * @extends {WebInspector.ProfileType}
 * @param {WebInspector.ProfilesPanel} profilesPanel
 * @param {WebInspector.HeapSnapshotProfileType} profileType
 */
WebInspector.TrackingHeapSnapshotProfileType = function(profilesPanel, profileType)
{
    WebInspector.ProfileType.call(this, WebInspector.TrackingHeapSnapshotProfileType.TypeId, WebInspector.UIString("Track Allocations"));
    this._profilesPanel = profilesPanel;
    this._parentType = profileType;
}

WebInspector.TrackingHeapSnapshotProfileType.TypeId = "HEAP-RECORD";

WebInspector.TrackingHeapSnapshotProfileType.prototype = {
    get buttonTooltip()
    {
        return this._recording ? WebInspector.UIString("Stop recording heap profile.") : WebInspector.UIString("Start recording heap profile.");
    },

    /**
     * @override
     * @return {boolean}
     */
    isInstantProfile: function()
    {
        return false;
    },

    /**
     * @override
     * @return {boolean}
     */
    buttonClicked: function()
    {
        var profile = this.findTemporaryProfile();
        var result = this._parentType.toggleRecording();
        if (!result && profile)
            this._profilesPanel._removeProfileHeader(profile);
        return result;
    },

    get treeItemTitle()
    {
        return WebInspector.UIString("TRACK HEAP SNAPSHOTS");
    },

    get description()
    {
        return WebInspector.UIString("Run heap profiler continuously to track JavaScript allocations over time.");
    },

    /**
     * @override
     * @param {string=} title
     * @return {!WebInspector.ProfileHeader}
     */
    createTemporaryProfile: function(title)
    {
        title = title || WebInspector.UIString("Recording\u2026");
        return new WebInspector.HeapProfileHeader(this, title);
    },

    /**
     * @override
     */
    resetProfiles: function()
    {
        this._reset();
    },

    __proto__: WebInspector.ProfileType.prototype
}

/**
 * @constructor
 * @extends {WebInspector.ProfileHeader}
 * @param {!WebInspector.ProfileType} type
 * @param {string} title
 * @param {number=} uid
 * @param {number=} maxJSObjectId
 */
WebInspector.HeapProfileHeader = function(type, title, uid, maxJSObjectId)
{
    WebInspector.ProfileHeader.call(this, type, title, uid);
    this.maxJSObjectId = maxJSObjectId;
    /**
     * @type {WebInspector.OutputStream}
     */
    this._receiver = null;
    /**
     * @type {WebInspector.HeapSnapshotProxy}
     */
    this._snapshotProxy = null;
    this._totalNumberOfChunks = 0;
}

WebInspector.HeapProfileHeader.prototype = {
    /**
     * @override
     */
    createSidebarTreeElement: function()
    {
        return new WebInspector.ProfileSidebarTreeElement(this, WebInspector.UIString("Snapshot %d"), "heap-snapshot-sidebar-tree-item");
    },

    /**
     * @override
     * @param {!WebInspector.ProfilesPanel} profilesPanel
     */
    createView: function(profilesPanel)
    {
        return new WebInspector.HeapSnapshotView(profilesPanel, this);
    },

    /**
     * @override
     * @param {function(WebInspector.HeapSnapshotProxy):void} callback
     */
    load: function(callback)
    {
        if (this._snapshotProxy) {
            callback(this._snapshotProxy);
            return;
        }

        this._numberOfChunks = 0;
        this._savedChunks = 0;
        this._savingToFile = false;
        if (!this._receiver) {
            this._setupWorker();
            this.sidebarElement.subtitle = WebInspector.UIString("Loading\u2026");
            this.sidebarElement.wait = true;
            this.startSnapshotTransfer();
        }
        var loaderProxy = /** @type {WebInspector.HeapSnapshotLoaderProxy} */ (this._receiver);
        loaderProxy.addConsumer(callback);
    },

    startSnapshotTransfer: function()
    {
        HeapProfilerAgent.getHeapSnapshot(this.uid);
    },

    snapshotConstructorName: function()
    {
        return "JSHeapSnapshot";
    },

    snapshotProxyConstructor: function()
    {
        return WebInspector.HeapSnapshotProxy;
    },

    _setupWorker: function()
    {
        function setProfileWait(event)
        {
            this.sidebarElement.wait = event.data;
        }
        var worker = new WebInspector.HeapSnapshotWorker();
        worker.addEventListener("wait", setProfileWait, this);
        var loaderProxy = worker.createLoader(this.snapshotConstructorName(), this.snapshotProxyConstructor());
        loaderProxy.addConsumer(this._snapshotReceived.bind(this));
        this._receiver = loaderProxy;
    },

    /**
     * @override
     */
    dispose: function()
    {
        if (this._receiver)
            this._receiver.close();
        else if (this._snapshotProxy)
            this._snapshotProxy.dispose();
    },

    /**
     * @param {number} value
     * @param {number} maxValue
     */
    _updateTransferProgress: function(value, maxValue)
    {
        var percentValue = ((maxValue ? (value / maxValue) : 0) * 100).toFixed(0);
        if (this._savingToFile)
            this.sidebarElement.subtitle = WebInspector.UIString("Saving\u2026 %d\%", percentValue);
        else
            this.sidebarElement.subtitle = WebInspector.UIString("Loading\u2026 %d\%", percentValue);
    },

    _updateSnapshotStatus: function()
    {
        this.sidebarElement.subtitle = Number.bytesToString(this._snapshotProxy.totalSize);
        this.sidebarElement.wait = false;
    },

    /**
     * @param {string} chunk
     */
    transferChunk: function(chunk)
    {
        ++this._numberOfChunks;
        this._receiver.write(chunk, callback.bind(this));
        function callback()
        {
            this._updateTransferProgress(++this._savedChunks, this._totalNumberOfChunks);
            if (this._totalNumberOfChunks === this._savedChunks) {
                if (this._savingToFile)
                    this._updateSnapshotStatus();
                else
                    this.sidebarElement.subtitle = WebInspector.UIString("Parsing\u2026");

                this._receiver.close();
            }
        }
    },

    _snapshotReceived: function(snapshotProxy)
    {
        this._receiver = null;
        if (snapshotProxy)
            this._snapshotProxy = snapshotProxy;
        this._updateSnapshotStatus();
        var worker = /** @type {WebInspector.HeapSnapshotWorker} */ (this._snapshotProxy.worker);
        this.isTemporary = false;
        worker.startCheckingForLongRunningCalls();
    },

    finishHeapSnapshot: function()
    {
        this._totalNumberOfChunks = this._numberOfChunks;
    },

    /**
     * @override
     * @return {boolean}
     */
    canSaveToFile: function()
    {
        return !this.fromFile() && !!this._snapshotProxy && !this._receiver;
    },

    /**
     * @override
     */
    saveToFile: function()
    {
        this._numberOfChunks = 0;

        var fileOutputStream = new WebInspector.FileOutputStream();
        function onOpen()
        {
            this._receiver = fileOutputStream;
            this._savedChunks = 0;
            this._updateTransferProgress(0, this._totalNumberOfChunks);
            HeapProfilerAgent.getHeapSnapshot(this.uid);
        }
        this._savingToFile = true;
        this._fileName = this._fileName || "Heap-" + new Date().toISO8601Compact() + this._profileType.fileExtension();
        fileOutputStream.open(this._fileName, onOpen.bind(this));
    },

    /**
     * @override
     * @param {File} file
     */
    loadFromFile: function(file)
    {
        this.title = file.name;
        this.sidebarElement.subtitle = WebInspector.UIString("Loading\u2026");
        this.sidebarElement.wait = true;
        this._setupWorker();
        this._numberOfChunks = 0;
        this._savingToFile = false;

        var delegate = new WebInspector.HeapSnapshotLoadFromFileDelegate(this);
        var fileReader = this._createFileReader(file, delegate);
        fileReader.start(this._receiver);
    },

    _createFileReader: function(file, delegate)
    {
        return new WebInspector.ChunkedFileReader(file, 10000000, delegate);
    },

    __proto__: WebInspector.ProfileHeader.prototype
}

/**
 * @constructor
 * @implements {WebInspector.OutputStreamDelegate}
 */
WebInspector.HeapSnapshotLoadFromFileDelegate = function(snapshotHeader)
{
    this._snapshotHeader = snapshotHeader;
}

WebInspector.HeapSnapshotLoadFromFileDelegate.prototype = {
    onTransferStarted: function()
    {
    },

    /**
     * @param {WebInspector.ChunkedReader} reader
     */
    onChunkTransferred: function(reader)
    {
        this._snapshotHeader._updateTransferProgress(reader.loadedSize(), reader.fileSize());
    },

    onTransferFinished: function()
    {
        this._snapshotHeader.finishHeapSnapshot();
    },

    /**
     * @param {WebInspector.ChunkedReader} reader
     */
    onError: function (reader, e)
    {
        switch(e.target.error.code) {
        case e.target.error.NOT_FOUND_ERR:
            this._snapshotHeader.sidebarElement.subtitle = WebInspector.UIString("'%s' not found.", reader.fileName());
        break;
        case e.target.error.NOT_READABLE_ERR:
            this._snapshotHeader.sidebarElement.subtitle = WebInspector.UIString("'%s' is not readable", reader.fileName());
        break;
        case e.target.error.ABORT_ERR:
            break;
        default:
            this._snapshotHeader.sidebarElement.subtitle = WebInspector.UIString("'%s' error %d", reader.fileName(), e.target.error.code);
        }
    }
}

/**
 * @constructor
 * @extends {WebInspector.View}
 * @param {!WebInspector.HeapProfileHeader} heapProfileHeader
 */
WebInspector.HeapTrackingOverviewGrid = function(heapProfileHeader)
{
    WebInspector.View.call(this);
    this.registerRequiredCSS("flameChart.css");
    this.element.id = "heap-recording-view";

    this._overviewContainer = this.element.createChild("div", "overview-container");
    this._overviewGrid = new WebInspector.OverviewGrid("heap-recording");
    this._overviewCanvas = this._overviewContainer.createChild("canvas", "heap-recording-overview-canvas");
    this._overviewContainer.appendChild(this._overviewGrid.element);
    this._overviewCalculator = new WebInspector.HeapTrackingOverviewGrid.OverviewCalculator();
    this._overviewGrid.addEventListener(WebInspector.OverviewGrid.Events.WindowChanged, this._onWindowChanged, this);

    this._profileSamples = heapProfileHeader._profileSamples;
    var timestamps = this._profileSamples.timestamps;
    var startTime = timestamps[0];
    this._totalTime = timestamps[timestamps.length - 1] - startTime;
    this._windowLeft = 0.0;
    this._windowRight = 1.0;
}

WebInspector.HeapTrackingOverviewGrid.IdsRangeChanged = "IdsRangeChanged";

WebInspector.HeapTrackingOverviewGrid.prototype = {
    /**
      * @param {number} width
      * @param {number} height
      */
    _drawOverviewCanvas: function(width, height)
    {
        var sizes = this._profileSamples.sizes;
        var usedSizes = this._profileSamples.max;
        var timestamps = this._profileSamples.timestamps;

        var scaleFactor = width / this._totalTime;
        var maxUsedSize = 0;
        var currentX = 0;
        /**
          * @param {Array.<number>} sizes
          * @param {function(number, number):void} callback
          */
        function aggregateAndCall(sizes, callback)
        {
            var size = 0;
            var currentX = 0;
            for (var i = 1; i < timestamps.length; ++i) {
                var x  = Math.floor((timestamps[i] - startTime) * scaleFactor) ;
                if (x !== currentX) {
                    if (size)
                        callback(currentX, size);
                    size = 0;
                    currentX = x;
                }
                size += sizes[i];
            }
            callback(currentX, size);
        }

        /**
          * @param {number} x
          * @param {number} size
          */
        function maxUsedSizeCallback(x, size)
        {
            maxUsedSize = Math.max(maxUsedSize, size);
        }

        aggregateAndCall(usedSizes, maxUsedSizeCallback);

        this._overviewCanvas.width = width * window.devicePixelRatio;
        this._overviewCanvas.height = height * window.devicePixelRatio;
        this._overviewCanvas.style.width = width + "px";
        this._overviewCanvas.style.height = height + "px";
        var yScaleFactor = height / (maxUsedSize * 1.1);
        var startTime = timestamps[0];

        var context = this._overviewCanvas.getContext("2d");
        context.scale(window.devicePixelRatio, window.devicePixelRatio);

        /**
          * @param {number} x
          * @param {number} size
          */
        function drawBarCallback(x, size)
        {
            context.moveTo(x, height - 1);
            context.lineTo(x, Math.round(height - size * yScaleFactor - 1));
        }

        context.beginPath();
        context.lineWidth = 2;
        context.strokeStyle = "rgba(192, 192, 192, 0.6)";
        aggregateAndCall(usedSizes, drawBarCallback);
        context.stroke();
        context.closePath();

        context.beginPath();
        context.lineWidth = 2;
        context.strokeStyle = "rgba(0, 0, 192, 0.8)";
        aggregateAndCall(sizes, drawBarCallback);
        context.stroke();
        context.closePath();
    },

    onResize: function()
    {
        this._updateOverviewCanvas = true;
        this._scheduleUpdate();
    },

    _onWindowChanged: function()
    {
        if (!this._updateGridTimerId)
            this._updateGridTimerId = setTimeout(this._updateGrid.bind(this), 10);
    },

    _scheduleUpdate: function()
    {
        if (this._updateTimerId)
            return;
        this._updateTimerId = setTimeout(this.update.bind(this), 10);
    },

    _updateBoundaries: function()
    {
        this._windowLeft = this._overviewGrid.windowLeft();
        this._windowRight = this._overviewGrid.windowRight();
        this._windowWidth = this._windowRight - this._windowLeft;
    },

    /**
     * @param {boolean} updateOverviewCanvas
     */
    update: function(updateOverviewCanvas)
    {
        this._updateTimerId = null;
        this._updateBoundaries();
        this._overviewCalculator._updateBoundaries(this);
        this._overviewGrid.updateDividers(this._overviewCalculator);
        if (this._updateOverviewCanvas || updateOverviewCanvas) {
            this._drawOverviewCanvas(this._overviewContainer.clientWidth, this._overviewContainer.clientHeight - 20);
            this._updateOverviewCanvas = false;
        }
    },

    _updateGrid: function()
    {
        this._updateGridTimerId = 0;
        this._updateBoundaries();
        var ids = this._profileSamples.ids;
        var timestamps = this._profileSamples.timestamps;
        var sizes = this._profileSamples.sizes;
        var startTime = timestamps[0];
        var finishTime = timestamps[timestamps.length - 1];
        var timeRange = finishTime - startTime;
        var timeLeft = startTime + timeRange * this._windowLeft;
        var timeRight = startTime + timeRange * this._windowRight;
        var minId = 0;
        var maxId = ids[ids.length - 1] + 1;
        var size = 0;
        for (var i = 1; i < timestamps.length; ++i) {
            if (!timestamps[i])
                continue;
            if (timestamps[i] > timeRight)
                break;
            maxId = ids[i];
            if (timestamps[i] <= timeLeft) {
                minId = ids[i];
                continue;
            }
            size += sizes[i];
        }

        this.dispatchEventToListeners(WebInspector.HeapTrackingOverviewGrid.IdsRangeChanged, {minId: minId, maxId: maxId, size: size});
    },

    __proto__: WebInspector.View.prototype
}


/**
 * @constructor
 * @implements {WebInspector.TimelineGrid.Calculator}
 */
WebInspector.HeapTrackingOverviewGrid.OverviewCalculator = function()
{
}

WebInspector.HeapTrackingOverviewGrid.OverviewCalculator.prototype = {
    /**
     * @param {WebInspector.HeapTrackingOverviewGrid} chart
     */
    _updateBoundaries: function(chart)
    {
        this._minimumBoundaries = 0;
        this._maximumBoundaries = chart._totalTime;
        this._xScaleFactor = chart._overviewContainer.clientWidth / this._maximumBoundaries;
    },

    /**
     * @param {number} time
     */
    computePosition: function(time)
    {
        return (time - this._minimumBoundaries) * this._xScaleFactor;
    },

    formatTime: function(value)
    {
        return Number.secondsToString((value + this._minimumBoundaries) / 1000);
    },

    maximumBoundary: function()
    {
        return this._maximumBoundaries;
    },

    minimumBoundary: function()
    {
        return this._minimumBoundaries;
    },

    zeroTime: function()
    {
        return this._minimumBoundaries;
    },

    boundarySpan: function()
    {
        return this._maximumBoundaries - this._minimumBoundaries;
    }
}
