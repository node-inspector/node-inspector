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

WebInspector.HeapSnapshotSortableDataGrid = function(columns)
{
    WebInspector.DataGrid.call(this, columns);
    this.addEventListener("sorting changed", this.sortingChanged, this);
}

WebInspector.HeapSnapshotSortableDataGrid.prototype = {
    dispose: function()
    {
        for (var i = 0, l = this.children.length; i < l; ++i)
            this.children[i].dispose();
    },

    resetSortingCache: function()
    {
        delete this._lastSortColumnIdentifier;
        delete this._lastSortAscending;
    },

    sortingChanged: function()
    {
        var sortAscending = this.sortOrder === "ascending";
        var sortColumnIdentifier = this.sortColumnIdentifier;
        if (this._lastSortColumnIdentifier === sortColumnIdentifier && this._lastSortAscending === sortAscending)
            return;
        this._lastSortColumnIdentifier = sortColumnIdentifier;
        this._lastSortAscending = sortAscending;
        var sortFields = this._sortFields(sortColumnIdentifier, sortAscending);

        function SortByTwoFields(nodeA, nodeB)
        {
            var field1 = nodeA[sortFields[0]];
            var field2 = nodeB[sortFields[0]];
            var result = field1 < field2 ? -1 : (field1 > field2 ? 1 : 0);
            if (!sortFields[1])
                result = -result;
            if (result !== 0)
                return result;
            field1 = nodeA[sortFields[2]];
            field2 = nodeB[sortFields[2]];
            result = field1 < field2 ? -1 : (field1 > field2 ? 1 : 0);
            if (!sortFields[3])
                result = -result;
            return result;
        }
        this._performSorting(SortByTwoFields);
    },

    _performSorting: function(sortFunction)
    {
        this.recursiveSortingEnter();
        var children = this.children;
        this.removeChildren();
        children.sort(sortFunction);
        for (var i = 0, l = children.length; i < l; ++i) {
            var child = children[i];
            this.appendChild(child);
            if (child.expanded)
                child.sort();
        }
        this.recursiveSortingLeave();
    },

    recursiveSortingEnter: function()
    {
        if (!("_recursiveSortingDepth" in this))
            this._recursiveSortingDepth = 1;
        else
            ++this._recursiveSortingDepth;
    },

    recursiveSortingLeave: function()
    {
        if (!("_recursiveSortingDepth" in this))
            return;
        if (!--this._recursiveSortingDepth) {
            delete this._recursiveSortingDepth;
            this.dispatchEventToListeners("sorting complete");
        }
    }
};

WebInspector.HeapSnapshotSortableDataGrid.prototype.__proto__ = WebInspector.DataGrid.prototype;

WebInspector.HeapSnapshotContainmentDataGrid = function()
{
    var columns = {
        object: { title: WebInspector.UIString("Object"), disclosure: true, sortable: true, sort: "ascending" },
        shallowSize: { title: WebInspector.UIString("Shallow Size"), width: "90px", sortable: true },
        retainedSize: { title: WebInspector.UIString("Retained Size"), width: "90px", sortable: true }
    };
    WebInspector.HeapSnapshotSortableDataGrid.call(this, columns);
}

WebInspector.HeapSnapshotContainmentDataGrid.prototype = {
    _defaultPopulateCount: 100,

    expandRoute: function(route)
    {
        function nextStep(parent, hopIndex)
        {
            if (hopIndex >= route.length) {
                parent.element.scrollIntoViewIfNeeded(true);
                parent.select();
                return;
            }
            var nodeIndex = route[hopIndex];
            for (var i = 0, l = parent.children.length; i < l; ++i) {
                var child = parent.children[i];
                if (child.snapshotNodeIndex === nodeIndex) {
                    if (child.expanded)
                        nextStep(child, hopIndex + 1);
                    else {
                        function afterExpand()
                        {
                            child.removeEventListener("populate complete", afterExpand, null);
                            var lastChild = child.children[child.children.length - 1];
                            if (!lastChild.showAll)
                                nextStep(child, hopIndex + 1);
                            else {
                                child.addEventListener("populate complete", afterExpand, null);
                                lastChild.showAll.click();
                            }
                        }
                        child.addEventListener("populate complete", afterExpand, null);
                        child.expand();
                    }
                    break;
                }
            }
        }
        nextStep(this, 0);
    },

    setDataSource: function(snapshotView, snapshot)
    {
        this.snapshotView = snapshotView;
        this.snapshot = snapshot;
        this.snapshotNodeIndex = this.snapshot.rootNodeIndex;
        this._provider = this._createProvider(snapshot, this.snapshotNodeIndex);
        this.sort();
    },

    sortingChanged: function()
    {
        this.sort();
    }
};

MixInSnapshotNodeFunctions(WebInspector.HeapSnapshotObjectNode.prototype, WebInspector.HeapSnapshotContainmentDataGrid.prototype);
WebInspector.HeapSnapshotContainmentDataGrid.prototype.__proto__ = WebInspector.HeapSnapshotSortableDataGrid.prototype;

WebInspector.HeapSnapshotConstructorsDataGrid = function()
{
    var columns = {
        object: { title: WebInspector.UIString("Constructor"), disclosure: true, sortable: true },
        count: { title: WebInspector.UIString("#"), width: "45px", sortable: true },
        shallowSize: { title: WebInspector.UIString("Shallow Size"), width: "90px", sortable: true },
        retainedSize: { title: WebInspector.UIString("Retained Size"), width: "90px", sort: "descending", sortable: true }
    };
    WebInspector.HeapSnapshotSortableDataGrid.call(this, columns);
}

WebInspector.HeapSnapshotConstructorsDataGrid.prototype = {
    _defaultPopulateCount: 100,

    _sortFields: function(sortColumn, sortAscending)
    {
        return {
            object: ["_name", sortAscending, "_count", false],
            count: ["_count", sortAscending, "_name", true],
            shallowSize: ["_shallowSize", sortAscending, "_name", true],
            retainedSize: ["_retainedSize", sortAscending, "_name", true]
        }[sortColumn];
    },

    setDataSource: function(snapshotView, snapshot)
    {
        this.snapshotView = snapshotView;
        this.snapshot = snapshot;
        this.populateChildren();
    },

    populateChildren: function()
    {
        function aggregatesReceived(aggregates)
        {
            for (var constructor in aggregates)
                this.appendChild(new WebInspector.HeapSnapshotConstructorNode(this, constructor, aggregates[constructor]));
            this.sortingChanged();
        }
        this.snapshot.aggregates(false, aggregatesReceived.bind(this));
    }
};

WebInspector.HeapSnapshotConstructorsDataGrid.prototype.__proto__ = WebInspector.HeapSnapshotSortableDataGrid.prototype;

WebInspector.HeapSnapshotDiffDataGrid = function()
{
    var columns = {
        object: { title: WebInspector.UIString("Constructor"), disclosure: true, sortable: true },
        addedCount: { title: WebInspector.UIString("# New"), width: "72px", sortable: true, sort: "descending" },
        removedCount: { title: WebInspector.UIString("# Deleted"), width: "72px", sortable: true },
        // \u0394 is a Greek delta letter.
        countDelta: { title: "\u0394", width: "40px", sortable: true },
        addedSize: { title: WebInspector.UIString("Alloc. Size"), width: "72px", sortable: true },
        removedSize: { title: WebInspector.UIString("Freed Size"), width: "72px", sortable: true },
        sizeDelta: { title: "\u0394", width: "72px", sortable: true }
    };
    WebInspector.HeapSnapshotSortableDataGrid.call(this, columns);
}

WebInspector.HeapSnapshotDiffDataGrid.prototype = {
    _defaultPopulateCount: 50,

    _sortFields: function(sortColumn, sortAscending)
    {
        return {
            object: ["_name", sortAscending, "_count", false],
            addedCount: ["_addedCount", sortAscending, "_name", true],
            removedCount: ["_removedCount", sortAscending, "_name", true],
            countDelta: ["_countDelta", sortAscending, "_name", true],
            addedSize: ["_addedSize", sortAscending, "_name", true],
            removedSize: ["_removedSize", sortAscending, "_name", true],
            sizeDelta: ["_sizeDelta", sortAscending, "_name", true]
        }[sortColumn];
    },

    setDataSource: function(snapshotView, snapshot)
    {
        this.snapshotView = snapshotView;
        this.snapshot = snapshot;
    },

    setBaseDataSource: function(baseSnapshot)
    {
        this.baseSnapshot = baseSnapshot;
        this.dispose();
        this.removeChildren();
        this.resetSortingCache();
        if (this.baseSnapshot === this.snapshot) {
            this.dispatchEventToListeners("sorting complete");
            return;
        }
        this.populateChildren();
    },

    populateChildren: function()
    {
        function baseAggregatesReceived(baseClasses)
        {
            function aggregatesReceived(classes)
            {
                var nodeCount = 0;
                var nodes = [];
                for (var clss in baseClasses)
                    nodes.push(new WebInspector.HeapSnapshotDiffNode(this, clss, baseClasses[clss], classes[clss]));
                for (clss in classes) {
                    if (!(clss in baseClasses))
                        nodes.push(new WebInspector.HeapSnapshotDiffNode(this, clss, null, classes[clss]));
                }
                nodeCount = nodes.length;
                function addNodeIfNonZeroDiff(boundNode, zeroDiff)
                {
                    if (!zeroDiff)
                        this.appendChild(boundNode);
                    if (!--nodeCount)
                        this.sortingChanged();
                }
                for (var i = 0, l = nodes.length; i < l; ++i) {
                    var node = nodes[i];
                    node.calculateDiff(this, addNodeIfNonZeroDiff.bind(this, node));
                }
            }
            this.snapshot.aggregates(true, aggregatesReceived.bind(this));
        }
        this.baseSnapshot.aggregates(true, baseAggregatesReceived.bind(this));
    }
};

WebInspector.HeapSnapshotDiffDataGrid.prototype.__proto__ = WebInspector.HeapSnapshotSortableDataGrid.prototype;

WebInspector.HeapSnapshotDominatorsDataGrid = function()
{
    var columns = {
        object: { title: WebInspector.UIString("Object"), disclosure: true, sortable: true },
        shallowSize: { title: WebInspector.UIString("Shallow Size"), width: "90px", sortable: true },
        retainedSize: { title: WebInspector.UIString("Retained Size"), width: "90px", sort: "descending", sortable: true }
    };
    WebInspector.HeapSnapshotSortableDataGrid.call(this, columns);
}

WebInspector.HeapSnapshotDominatorsDataGrid.prototype = {
    _defaultPopulateCount: 25,

    setDataSource: function(snapshotView, snapshot)
    {
        this.snapshotView = snapshotView;
        this.snapshot = snapshot;
        this.snapshotNodeIndex = this.snapshot.rootNodeIndex;
        this._provider = this._createProvider(snapshot, this.snapshotNodeIndex);
        this.sort();
    },

    sortingChanged: function()
    {
        this.sort();
    }
};

MixInSnapshotNodeFunctions(WebInspector.HeapSnapshotDominatorObjectNode.prototype, WebInspector.HeapSnapshotDominatorsDataGrid.prototype);
WebInspector.HeapSnapshotDominatorsDataGrid.prototype.__proto__ = WebInspector.HeapSnapshotSortableDataGrid.prototype;

WebInspector.HeapSnapshotPathFinderState = function(snapshot, nodeIndex, rootFilter)
{
    this._pathFinder = snapshot.createPathFinder(nodeIndex, !WebInspector.DetailedHeapshotView.prototype.showHiddenData);
    this._pathFinder.updateRoots(rootFilter);
    this._foundCount = 0;
    this._foundCountMax = null;
    this._totalFoundCount = 0;
    this._cancelled = false;
}

WebInspector.HeapSnapshotPathFinderState.prototype = {
    batchDone: function(status)
    {
    },

    pathFound: function(path)
    {
    },

    cancel: function()
    {
        this._cancelled = true;
        this._pathFinder.dispose();
    },

    startBatch: function(count)
    {
        if (this._cancelled)
            return;
        this._foundCount = 0;
        this._foundCountMax = count;
        this._pathFinder.findNext(this._pathFound.bind(this));
    },

    _pathFound: function(result)
    {
        if (this._cancelled)
            return;
        if (result === null) {
            if (!this._totalFoundCount)
                this.batchDone("no-paths-at-all");
        } else if (result !== false) {
            this.pathFound(result);
            ++this._foundCount;
            ++this._totalFoundCount;
            if (this._foundCount < this._foundCountMax)
                this._pathFinder.findNext(this._pathFound.bind(this));
            else
                this.batchDone("have-more-paths");
        } else {
            this.batchDone("no-more-paths");
        }
    }
};

WebInspector.HeapSnapshotRetainingPathsList = function()
{
    var columns = {
        path: { title: WebInspector.UIString("Retaining path"), sortable: true },
        len: { title: WebInspector.UIString("Length"), width: "90px", sortable: true, sort: "ascending" }
    };
    WebInspector.HeapSnapshotSortableDataGrid.call(this, columns);
    this._defaultPopulateCount = 100;
    this._nodeIndex = null;
    this._state = null;
    this._prefix = null;
}

WebInspector.HeapSnapshotRetainingPathsList.prototype = {
    dispose: function()
    {
        if (this._state)
            this._state.cancel();
    },

    _sortFields: function(sortColumn, sortAscending)
    {
        return {
            path: ["path", sortAscending, "len", true],
            len: ["len", sortAscending, "path", true]
        }[sortColumn];
    },

    _resetPaths: function()
    {
        var rootFilter = this.snapshotView.isTracingToWindowObjects ?
            "function (node) { return node.name.substr(0, 9) === \"DOMWindow\"; }" : null;
        if (this._state)
            this._state.cancel();
        this._state = new WebInspector.HeapSnapshotPathFinderState(this._snapshot, this._nodeIndex, rootFilter);
        this._state.batchDone = this._batchDone.bind(this);
        this._state.pathFound = this._pathFound.bind(this);
        this.removeChildren();
        this.resetSortingCache();
        this.showNext(this._defaultPopulateCount);
    },

    setDataSource: function(snapshotView, snapshot, nodeIndex, prefix)
    {
        if (this._nodeIndex === nodeIndex)
            return;
        this.snapshotView = snapshotView;
        this._snapshot = snapshot;
        this._nodeIndex = nodeIndex;
        this._prefix = prefix;
        this._resetPaths();
    },

    refresh: function()
    {
        if (this.snapshotView)
            this._resetPaths();
    },

    reset: function()
    {
        if (this._state)
            this._state.cancel();
        this.removeChildren();
        this.resetSortingCache();
        this.appendChild(new WebInspector.DataGridNode({path:WebInspector.UIString("Click on an object to show retaining paths"), len:""}, false));
    },

    _batchDone: function(state)
    {
        switch (state) {
        case "no-paths-at-all":
            this.appendChild(new WebInspector.DataGridNode({path:WebInspector.UIString("Can't find any paths."), len:""}, false));
            break;
        case "have-more-paths":
            this.appendChild(new WebInspector.ShowMoreDataGridNode(this.showNext.bind(this), this._defaultPopulateCount));
            this.resetSortingCache();
            this.sortingChanged();
            break;
        case "no-more-paths":
            // Nothing to do.
            break;
        }
    },

    _pathFound: function(result)
    {
        if (WebInspector.HeapSnapshotGenericObjectNode.prototype.isDOMWindow(result.path))
            result.path = WebInspector.HeapSnapshotGenericObjectNode.prototype.shortenWindowURL(result.path, true);
        if (this._prefix)
            result.path = this._prefix + result.path;
        var node = new WebInspector.DataGridNode(result, false);
        node.route = result.route;
        this.appendChild(node);
    },

    showNext: function(pathsCount)
    {
        this._state.startBatch(pathsCount);
    },

    _performSorting: function(sortFunction)
    {
        function DataExtractorWrapper(nodeA, nodeB)
        {
            return sortFunction(nodeA.data, nodeB.data);
        }
        this.recursiveSortingEnter();
        this.sortNodes(DataExtractorWrapper);
        this.recursiveSortingLeave();
    }
};

WebInspector.HeapSnapshotRetainingPathsList.prototype.__proto__ = WebInspector.HeapSnapshotSortableDataGrid.prototype;

WebInspector.DetailedHeapshotView = function(parent, profile)
{
    WebInspector.View.call(this);

    this.element.addStyleClass("detailed-heapshot-view");

    this.parent = parent;
    this.parent.addEventListener("profile added", this._updateBaseOptions, this);

    this.showCountAsPercent = false;
    this.showShallowSizeAsPercent = false;
    this.showRetainedSizeAsPercent = false;

    this.viewsContainer = document.createElement("div");
    this.viewsContainer.addStyleClass("views-container");
    this.element.appendChild(this.viewsContainer);

    this.containmentView = new WebInspector.View();
    this.containmentView.element.addStyleClass("view");
    this.containmentDataGrid = new WebInspector.HeapSnapshotContainmentDataGrid();
    this.containmentDataGrid.element.addEventListener("click", this._mouseClickInContentsGrid.bind(this), true);
    this.containmentDataGrid.element.addEventListener("mousedown", this._mouseDownInContentsGrid.bind(this), true);
    this.containmentView.element.appendChild(this.containmentDataGrid.element);
    this.viewsContainer.appendChild(this.containmentView.element);

    this.constructorsView = new WebInspector.View();
    this.constructorsView.element.addStyleClass("view");
    this.constructorsDataGrid = new WebInspector.HeapSnapshotConstructorsDataGrid();
    this.constructorsDataGrid.element.addEventListener("click", this._mouseClickInContentsGrid.bind(this), true);
    this.constructorsDataGrid.element.addEventListener("mousedown", this._mouseDownInContentsGrid.bind(this), true);
    this.constructorsView.element.appendChild(this.constructorsDataGrid.element);
    this.viewsContainer.appendChild(this.constructorsView.element);

    this.diffView = new WebInspector.View();
    this.diffView.element.addStyleClass("view");
    this.diffDataGrid = new WebInspector.HeapSnapshotDiffDataGrid();
    this.diffDataGrid.element.addEventListener("click", this._mouseClickInContentsGrid.bind(this), true);
    this.diffView.element.appendChild(this.diffDataGrid.element);
    this.viewsContainer.appendChild(this.diffView.element);

    this.dominatorView = new WebInspector.View();
    this.dominatorView.element.addStyleClass("view");
    this.dominatorDataGrid = new WebInspector.HeapSnapshotDominatorsDataGrid();
    this.dominatorDataGrid.element.addEventListener("click", this._mouseClickInContentsGrid.bind(this), true);
    this.dominatorDataGrid.element.addEventListener("mousedown", this._mouseDownInContentsGrid.bind(this), true);
    this.dominatorView.element.appendChild(this.dominatorDataGrid.element);
    this.viewsContainer.appendChild(this.dominatorView.element);

    this.retainmentViewHeader = document.createElement("div");
    this.retainmentViewHeader.addStyleClass("retainers-view-header");
    this.retainmentViewHeader.addEventListener("mousedown", this._startRetainersHeaderDragging.bind(this), true);
    var retainingPathsTitleDiv = document.createElement("div");
    retainingPathsTitleDiv.className = "title";
    var retainingPathsTitle = document.createElement("span");
    retainingPathsTitle.textContent = WebInspector.UIString("Paths from the selected object");
    this.retainingPathsRoot = document.createElement("select");
    this.retainingPathsRoot.className = "status-bar-item";
    this.retainingPathsRoot.addEventListener("change", this._changeRetainingPathsRoot.bind(this), false);
    var toGCRootsTraceOption = document.createElement("option");
    toGCRootsTraceOption.label = WebInspector.UIString("to GC roots");
    var toWindowObjectsTraceOption = document.createElement("option");
    toWindowObjectsTraceOption.label = WebInspector.UIString("to window objects");
    this.retainingPathsRoot.appendChild(toGCRootsTraceOption);
    this.retainingPathsRoot.appendChild(toWindowObjectsTraceOption);
    retainingPathsTitleDiv.appendChild(retainingPathsTitle);
    retainingPathsTitleDiv.appendChild(this.retainingPathsRoot);
    this.retainmentViewHeader.appendChild(retainingPathsTitleDiv);
    this.element.appendChild(this.retainmentViewHeader);

    this.retainmentView = new WebInspector.View();
    this.retainmentView.element.addStyleClass("view");
    this.retainmentView.element.addStyleClass("retaining-paths-view");
    this.retainmentDataGrid = new WebInspector.HeapSnapshotRetainingPathsList();
    this.retainmentDataGrid.element.addEventListener("click", this._mouseClickInRetainmentGrid.bind(this), true);
    this.retainmentView.element.appendChild(this.retainmentDataGrid.element);
    this.retainmentView.visible = true;
    this.element.appendChild(this.retainmentView.element);
    this.retainmentDataGrid.reset();

    this.dataGrid = this.constructorsDataGrid;
    this.currentView = this.constructorsView;

    this.viewSelectElement = document.createElement("select");
    this.viewSelectElement.className = "status-bar-item";
    this.viewSelectElement.addEventListener("change", this._changeView.bind(this), false);

    this.views = [{title: "Summary", view: this.constructorsView, grid: this.constructorsDataGrid},
                  {title: "Comparison", view: this.diffView, grid: this.diffDataGrid},
                  {title: "Containment", view: this.containmentView, grid: this.containmentDataGrid},
                  {title: "Dominators", view: this.dominatorView, grid: this.dominatorDataGrid}];
    this.views.current = 0;
    for (var i = 0; i < this.views.length; ++i) {
        var view = this.views[i];
        var option = document.createElement("option");
        option.label = WebInspector.UIString(view.title);
        this.viewSelectElement.appendChild(option);
    }

    this._profileUid = profile.uid;

    this.baseSelectElement = document.createElement("select");
    this.baseSelectElement.className = "status-bar-item hidden";
    this.baseSelectElement.addEventListener("change", this._changeBase.bind(this), false);
    this._updateBaseOptions();

    this.percentButton = new WebInspector.StatusBarButton("", "percent-time-status-bar-item status-bar-item");
    this.percentButton.addEventListener("click", this._percentClicked.bind(this), false);
    this.helpButton = new WebInspector.StatusBarButton("", "heapshot-help-status-bar-item status-bar-item");
    this.helpButton.addEventListener("click", this._helpClicked.bind(this), false);

    var popoverHelper = new WebInspector.PopoverHelper(this.element, this._getHoverAnchor.bind(this), this._showStringContentPopover.bind(this));

    this._loadProfile(this._profileUid, profileCallback.bind(this));

    function profileCallback()
    {
        var list = this._profiles();
        var profileIndex;
        for (var i = 0; i < list.length; ++i)
            if (list[i].uid === this._profileUid) {
                profileIndex = i;
                break;
            }
        if (profileIndex > 0)
            this.baseSelectElement.selectedIndex = profileIndex - 1;
        else
            this.baseSelectElement.selectedIndex = profileIndex;
        this.dataGrid.setDataSource(this, this.profileWrapper);
        this._updatePercentButton();
    }
}

WebInspector.DetailedHeapshotView.prototype = {
    dispose: function()
    {
        this.profileWrapper.dispose();
        if (this.baseProfile)
            this.baseProfileWrapper.dispose();
        this.containmentDataGrid.dispose();
        this.constructorsDataGrid.dispose();
        this.diffDataGrid.dispose();
        this.dominatorDataGrid.dispose();
        this.retainmentDataGrid.dispose();
    },

    get statusBarItems()
    {
        return [this.viewSelectElement, this.baseSelectElement, this.percentButton.element, this.helpButton.element];
    },

    get profile()
    {
        return this.parent.getProfile(WebInspector.DetailedHeapshotProfileType.TypeId, this._profileUid);
    },

    get profileWrapper()
    {
        return this.profile.proxy;
    },

    get baseProfile()
    {
        return this.parent.getProfile(WebInspector.DetailedHeapshotProfileType.TypeId, this._baseProfileUid);
    },

    get baseProfileWrapper()
    {
        return this.baseProfile.proxy;
    },

    show: function(parentElement)
    {
        WebInspector.View.prototype.show.call(this, parentElement);
        if (!this.profileWrapper.loaded)
            this._loadProfile(this._profileUid, profileCallback1.bind(this));
        else
            profileCallback1.call(this);

        function profileCallback1() {
            if (this.baseProfile && !this.baseProfileWrapper.loaded)
                this._loadProfile(this._baseProfileUid, profileCallback2.bind(this));
            else
                profileCallback2.call(this);
        }

        function profileCallback2() {
            this.currentView.show();
            this.dataGrid.updateWidths();
        }
    },

    hide: function()
    {
        WebInspector.View.prototype.hide.call(this);
        this._currentSearchResultIndex = -1;
    },

    onResize: function()
    {
        if (this.dataGrid)
            this.dataGrid.updateWidths();

        var height = this.retainmentView.element.clientHeight;
        this._updateRetainmentViewHeight(height);
    },

    refreshShowAsPercents: function()
    {
        this._updatePercentButton();
        this.refreshVisibleData();
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
            return ("name" in gridNode) && gridNode.name.hasSubstring(query, true);
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

        var current = this.dataGrid.children[0];
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
        var child = this.dataGrid.children[0];
        while (child) {
            child.refresh();
            child = child.traverseNextNode(false, null, true);
        }
    },

    _changeBase: function()
    {
        if (this._baseProfileUid === this._profiles()[this.baseSelectElement.selectedIndex].uid)
            return;

        this._baseProfileUid = this._profiles()[this.baseSelectElement.selectedIndex].uid;
        this._loadProfile(this._baseProfileUid, baseProfileLoaded.bind(this));

        function baseProfileLoaded()
        {
            delete this._baseProfileWrapper;
            this.baseProfile._lastShown = Date.now();
            this.diffDataGrid.setBaseDataSource(this.baseProfileWrapper);
        }

        if (!this.currentQuery || !this._searchFinishedCallback || !this._searchResults)
            return;

        // The current search needs to be performed again. First negate out previous match
        // count by calling the search finished callback with a negative number of matches.
        // Then perform the search again with the same query and callback.
        this._searchFinishedCallback(this, -this._searchResults.length);
        this.performSearch(this.currentQuery, this._searchFinishedCallback);
    },

    _profiles: function()
    {
        return WebInspector.panels.profiles.getProfiles(WebInspector.DetailedHeapshotProfileType.TypeId);
    },

    _loadProfile: function(profileUid, callback)
    {
        WebInspector.panels.profiles.loadHeapSnapshot(profileUid, callback);
    },

    isDetailedSnapshot: function(snapshot)
    {
        var s = new WebInspector.HeapSnapshot(snapshot);
        for (var iter = s.rootNode.edges; iter.hasNext(); iter.next())
            if (iter.edge.node.name === "(GC roots)")
                return true;
        return false;
    },

    processLoadedSnapshot: function(profile, snapshot)
    {
        profile.nodes = snapshot.nodes;
        profile.strings = snapshot.strings;
        var s = new WebInspector.HeapSnapshot(profile);
        profile.sidebarElement.subtitle = Number.bytesToString(s.totalSize);
    },

    _mouseClickInContentsGrid: function(event)
    {
        var cell = event.target.enclosingNodeOrSelfWithNodeName("td");
        if (!cell || (!cell.hasStyleClass("object-column")))
            return;
        var row = event.target.enclosingNodeOrSelfWithNodeName("tr");
        if (!row)
            return;
        var nodeItem = row._dataGridNode;
        if (!nodeItem || nodeItem.isEventWithinDisclosureTriangle(event))
            return;
        if (nodeItem.snapshotNodeIndex)
            this.retainmentDataGrid.setDataSource(this, nodeItem.isDeletedNode ? nodeItem.dataGrid.baseSnapshot : nodeItem.dataGrid.snapshot, nodeItem.snapshotNodeIndex, nodeItem.isDeletedNode ? this.baseSelectElement.childNodes[this.baseSelectElement.selectedIndex].label + " | " : "");
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

        if (cell.hasStyleClass("count-column"))
            this.showCountAsPercent = !this.showCountAsPercent;
        else if (cell.hasStyleClass("shallowSize-column"))
            this.showShallowSizeAsPercent = !this.showShallowSizeAsPercent;
        else if (cell.hasStyleClass("retainedSize-column"))
            this.showRetainedSizeAsPercent = !this.showRetainedSizeAsPercent;
        this.refreshShowAsPercents();

        event.preventDefault();
        event.stopPropagation();
    },

    _mouseClickInRetainmentGrid: function(event)
    {
        var cell = event.target.enclosingNodeOrSelfWithNodeName("td");
        if (!cell || (!cell.hasStyleClass("path-column")))
            return;
        var row = event.target.enclosingNodeOrSelfWithNodeName("tr");
        var nodeItem = row._dataGridNode;
        if (!nodeItem || !nodeItem.route)
            return;
        function expandRoute()
        {
            this.dataGrid.expandRoute(nodeItem.route);
        }
        this.changeView("Containment", expandRoute.bind(this));
    },

    changeView: function(viewTitle, callback)
    {
        var viewIndex = null;
        for (var i = 0; i < this.views.length; ++i)
            if (this.views[i].title === viewTitle) {
                viewIndex = i;
                break;
            }
        if (this.views.current === viewIndex) {
            setTimeout(callback, 0);
            return;
        }
        var grid = this.views[viewIndex].grid;
        function sortingComplete()
        {
            grid.removeEventListener("sorting complete", sortingComplete, this);
            setTimeout(callback, 0);
        }
        this.views[viewIndex].grid.addEventListener("sorting complete", sortingComplete, this);
        this.viewSelectElement.selectedIndex = viewIndex;
        this._changeView({target: {selectedIndex: viewIndex}});
    },

    _changeView: function(event)
    {
        if (!event || !this._profileUid)
            return;
        if (event.target.selectedIndex === this.views.current)
            return;

        this.views.current = event.target.selectedIndex;
        this.currentView.hide();
        var view = this.views[this.views.current];
        this.currentView = view.view;
        this.dataGrid = view.grid;
        this.currentView.show();
        this.refreshVisibleData();
        this.dataGrid.updateWidths();
        if (this.currentView === this.diffView) {
            this.baseSelectElement.removeStyleClass("hidden");
            if (!this.dataGrid.snapshotView) {
                this.dataGrid.setDataSource(this, this.profileWrapper);
                this._changeBase();
            }
        } else {
            this.baseSelectElement.addStyleClass("hidden");
            if (!this.dataGrid.snapshotView)
                this.dataGrid.setDataSource(this, this.profileWrapper);
        }

        if (!this.currentQuery || !this._searchFinishedCallback || !this._searchResults)
            return;

        // The current search needs to be performed again. First negate out previous match
        // count by calling the search finished callback with a negative number of matches.
        // Then perform the search again the with same query and callback.
        this._searchFinishedCallback(this, -this._searchResults.length);
        this.performSearch(this.currentQuery, this._searchFinishedCallback);
    },

    _changeRetainingPathsRoot: function(event)
    {
        if (!event)
            return;
        this.retainmentDataGrid.refresh();
    },

    _getHoverAnchor: function(target)
    {
        var span = target.enclosingNodeOrSelfWithNodeName("span");
        if (!span)
            return;
        var row = target.enclosingNodeOrSelfWithNodeName("tr");
        if (!row)
            return;
        var gridNode = row._dataGridNode;
        if (!gridNode.hasHoverMessage)
            return;
        span.node = gridNode;
        return span;
    },

    get isTracingToWindowObjects()
    {
        return this.retainingPathsRoot.selectedIndex === 1;
    },

    get _isShowingAsPercent()
    {
        return this.showCountAsPercent && this.showShallowSizeAsPercent && this.showRetainedSizeAsPercent;
    },

    _percentClicked: function(event)
    {
        var currentState = this._isShowingAsPercent;
        this.showCountAsPercent = !currentState;
        this.showShallowSizeAsPercent = !currentState;
        this.showRetainedSizeAsPercent = !currentState;
        this.refreshShowAsPercents();
    },

    _showStringContentPopover: function(anchor, popover)
    {
        var stringContentElement = document.createElement("span");
        stringContentElement.className = "monospace";
        stringContentElement.style.whiteSpace = "pre";

        function displayString(name, className)
        {
            stringContentElement.textContent = name;
            stringContentElement.className += " " + className;
            popover.show(stringContentElement, anchor);
        }
        anchor.node.hoverMessage(displayString);
    },

    _helpClicked: function(event)
    {
        if (!this.helpPopover) {
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
            contentElement.className = "heapshot-help";
            var headerRow = document.createElement("tr");
            var propsHeader = document.createElement("th");
            propsHeader.textContent = WebInspector.UIString("Property types:");
            headerRow.appendChild(propsHeader);
            var objsHeader = document.createElement("th");
            objsHeader.textContent = WebInspector.UIString("Object types:");
            headerRow.appendChild(objsHeader);
            contentElement.appendChild(headerRow);
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
            this.helpPopover = new WebInspector.Popover(contentElement);

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
        }
        if (this.helpPopover.visible)
            this.helpPopover.hide();
        else
            this.helpPopover.show(this.helpButton.element);
    },

    _startRetainersHeaderDragging: function(event)
    {
        if (!this.visible || event.target === this.retainingPathsRoot)
            return;

        WebInspector.elementDragStart(this.retainmentViewHeader, this._retainersHeaderDragging.bind(this), this._endRetainersHeaderDragging.bind(this), event, "row-resize");
        this._previousDragPosition = event.pageY;
        event.stopPropagation();
    },

    _retainersHeaderDragging: function(event)
    {
        var height = this.retainmentView.element.clientHeight;
        height += this._previousDragPosition - event.pageY;
        this._previousDragPosition = event.pageY;
        this._updateRetainmentViewHeight(height);
        event.preventDefault();
        event.stopPropagation();
    },

    _endRetainersHeaderDragging: function(event)
    {
        WebInspector.elementDragEnd(event);
        delete this._previousDragPosition;
        event.stopPropagation();
    },

    _updateRetainmentViewHeight: function(height)
    {
        height = Number.constrain(height, Preferences.minConsoleHeight, this.element.clientHeight - Preferences.minConsoleHeight);
        this.viewsContainer.style.bottom = (height + this.retainmentViewHeader.clientHeight) + "px";
        this.retainmentView.element.style.height = height + "px";
        this.retainmentViewHeader.style.bottom = height + "px";
    },

    _updateBaseOptions: function()
    {
        var list = this._profiles();
        // We're assuming that snapshots can only be added.
        if (this.baseSelectElement.length === list.length)
            return;

        for (var i = this.baseSelectElement.length, n = list.length; i < n; ++i) {
            var baseOption = document.createElement("option");
            var title = list[i].title;
            if (!title.indexOf(UserInitiatedProfileName))
                title = WebInspector.UIString("Snapshot %d", title.substring(UserInitiatedProfileName.length + 1));
            baseOption.label = title;
            this.baseSelectElement.appendChild(baseOption);
        }
    },

    _updatePercentButton: function()
    {
        if (this._isShowingAsPercent) {
            this.percentButton.title = WebInspector.UIString("Show absolute counts and sizes.");
            this.percentButton.toggled = true;
        } else {
            this.percentButton.title = WebInspector.UIString("Show counts and sizes as percentages.");
            this.percentButton.toggled = false;
        }
    }
};

WebInspector.DetailedHeapshotView.prototype.__proto__ = WebInspector.View.prototype;

WebInspector.DetailedHeapshotView.prototype.showHiddenData = true;

WebInspector.DetailedHeapshotProfileType = function()
{
    WebInspector.ProfileType.call(this, WebInspector.DetailedHeapshotProfileType.TypeId, WebInspector.UIString("HEAP SNAPSHOTS"));
}

WebInspector.DetailedHeapshotProfileType.TypeId = "HEAP";

WebInspector.DetailedHeapshotProfileType.prototype = {
    get buttonTooltip()
    {
        return WebInspector.UIString("Take heap snapshot.");
    },

    get buttonStyle()
    {
        return "heap-snapshot-status-bar-item status-bar-item";
    },

    buttonClicked: function()
    {
        WebInspector.panels.profiles.takeHeapSnapshot();
    },

    get welcomeMessage()
    {
        return WebInspector.UIString("Get a heap snapshot by pressing the %s button on the status bar.");
    },

    createSidebarTreeElementForProfile: function(profile)
    {
        return new WebInspector.ProfileSidebarTreeElement(profile, WebInspector.UIString("Snapshot %d"), "heap-snapshot-sidebar-tree-item");
    },

    createView: function(profile)
    {
        return new WebInspector.DetailedHeapshotView(WebInspector.panels.profiles, profile);
    }
}

WebInspector.DetailedHeapshotProfileType.prototype.__proto__ = WebInspector.ProfileType.prototype;
