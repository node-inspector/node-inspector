// Copyright 2014 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

/**
 * @constructor
 * @extends {WebInspector.VBox}
 * @implements {WebInspector.TargetManager.Observer}
 */
WebInspector.PromisePane = function()
{
    WebInspector.VBox.call(this);
    this.registerRequiredCSS("ui/filter.css");
    this.registerRequiredCSS("promises/promisePane.css");
    this.element.classList.add("promises");

    var toolbar = new WebInspector.Toolbar(this.element);
    this._recordButton = new WebInspector.ToolbarButton("", "record-toolbar-item");
    this._recordButton.addEventListener("click", this._recordButtonClicked.bind(this));
    toolbar.appendToolbarItem(this._recordButton);

    var clearButton = new WebInspector.ToolbarButton(WebInspector.UIString("Clear"), "clear-toolbar-item");
    clearButton.addEventListener("click", this._clearButtonClicked.bind(this));
    toolbar.appendToolbarItem(clearButton);
    toolbar.appendSeparator();

    this._promiseStatusFiltersSetting = WebInspector.settings.createSetting("promiseStatusFilters", {});
    this._hideCollectedPromisesSetting = WebInspector.settings.createSetting("hideCollectedPromises", false);

    this._createFilterBar();
    toolbar.appendToolbarItem(this._filterBar.filterButton());

    var garbageCollectButton = new WebInspector.ToolbarButton(WebInspector.UIString("Collect garbage"), "garbage-collect-toolbar-item");
    garbageCollectButton.addEventListener("click", this._garbageCollectButtonClicked, this);
    toolbar.appendToolbarItem(garbageCollectButton);

    toolbar.appendSeparator();
    var asyncCheckbox = new WebInspector.ToolbarCheckbox(WebInspector.UIString("Async"), WebInspector.UIString("Capture async stack traces"), WebInspector.moduleSetting("enableAsyncStackTraces"));
    toolbar.appendToolbarItem(asyncCheckbox);

    this.element.appendChild(this._filterBar.filtersElement());

    this._hiddenByFilterCount = 0;
    this._filterStatusMessageElement = this.element.createChild("div", "promises-filter-status hidden");
    this._filterStatusTextElement = this._filterStatusMessageElement.createChild("span");
    this._filterStatusMessageElement.createTextChild(" ");
    var resetFiltersLink = this._filterStatusMessageElement.createChild("span", "link");
    resetFiltersLink.textContent = WebInspector.UIString("Show all promises.");
    resetFiltersLink.addEventListener("click", this._resetFilters.bind(this), true);

    this._dataGridContainer = new WebInspector.VBox();
    this._dataGridContainer.show(this.element);
    // FIXME: Make "status" column width fixed to ~16px.
    var columns = [
        { id: "status", weight: 1 },
        { id: "function", title: WebInspector.UIString("Function"), disclosure: true, weight: 10 },
        { id: "created", title: WebInspector.UIString("Created"), weight: 10 },
        { id: "settled", title: WebInspector.UIString("Settled"), weight: 10 },
        { id: "tts", title: WebInspector.UIString("Time to settle"), weight: 10 }
    ];
    this._dataGrid = new WebInspector.ViewportDataGrid(columns, undefined, undefined, undefined, this._onContextMenu.bind(this));
    this._dataGrid.setStickToBottom(true);
    this._dataGrid.show(this._dataGridContainer.element);

    this._linkifier = new WebInspector.Linkifier();

    /** @type {!Map.<!WebInspector.DebuggerModel, !Map.<number, !WebInspector.PromiseDetails>>} */
    this._promiseDetailsByDebuggerModel = new Map();
    /** @type {!Map.<number, !WebInspector.DataGridNode>} */
    this._promiseIdToNode = new Map();

    this._popoverHelper = new WebInspector.PopoverHelper(this.element, this._getPopoverAnchor.bind(this), this._showPopover.bind(this));
    this._popoverHelper.setTimeout(250, 250);

    this.element.addEventListener("click", this._hidePopover.bind(this), true);

    WebInspector.targetManager.addModelListener(WebInspector.DebuggerModel, WebInspector.DebuggerModel.Events.PromiseUpdated, this._onPromiseUpdated, this);
    WebInspector.targetManager.addModelListener(WebInspector.ResourceTreeModel, WebInspector.ResourceTreeModel.EventTypes.MainFrameNavigated, this._mainFrameNavigated, this);
    WebInspector.context.addFlavorChangeListener(WebInspector.Target, this._targetChanged, this);

    WebInspector.targetManager.observeTargets(this);
}

WebInspector.PromisePane._maxPromiseCount = 10000;


/**
 * @constructor
 * @param {!DebuggerAgent.PromiseDetails} details
 */
WebInspector.PromiseDetails = function(details)
{
    this.id = details.id;
    this.isGarbageCollected = false;
    this.update(details);
}

WebInspector.PromiseDetails.prototype = {
    /**
     * @param {!DebuggerAgent.PromiseDetails} details
     */
    update: function(details)
    {
        if (this.id !== details.id)
            throw new Error("Invalid id, expected " + this.id + " was " + details.id);
        if (details.status)
            this.status = details.status;
        if (details.parentId)
            this.parentId = details.parentId;
        if (details.callFrame)
            this.callFrame = details.callFrame;
        if (details.creationTime)
            this.creationTime = details.creationTime;
        if (details.settlementTime)
            this.settlementTime = details.settlementTime;
        if (details.creationStack)
            this.creationStack = details.creationStack;
        if (details.asyncCreationStack)
            this.asyncCreationStack = details.asyncCreationStack;
        if (details.settlementStack)
            this.settlementStack = details.settlementStack;
        if (details.asyncSettlementStack)
            this.asyncSettlementStack = details.asyncSettlementStack;
    }
}


WebInspector.PromisePane.prototype = {
    _createFilterBar: function()
    {
        this._filterBar = new WebInspector.FilterBar("promisePane");

        this._textFilterUI = new WebInspector.TextFilterUI(true);
        this._textFilterUI.addEventListener(WebInspector.FilterUI.Events.FilterChanged, this._onFilterChanged, this);
        this._filterBar.addFilter(this._textFilterUI);

        var statuses = [
            { name: "pending", label: WebInspector.UIString("Pending") },
            { name: "resolved", label: WebInspector.UIString("Fulfilled") },
            { name: "rejected", label: WebInspector.UIString("Rejected") }
        ];
        this._statusFilterUI = new WebInspector.NamedBitSetFilterUI(statuses, this._promiseStatusFiltersSetting);
        this._statusFilterUI.addEventListener(WebInspector.FilterUI.Events.FilterChanged, this._onFilterChanged, this);
        this._filterBar.addFilter(this._statusFilterUI);

        var hideCollectedCheckbox = new WebInspector.CheckboxFilterUI("hide-collected-promises", WebInspector.UIString("Hide collected promises"), true, this._hideCollectedPromisesSetting);
        hideCollectedCheckbox.addEventListener(WebInspector.FilterUI.Events.FilterChanged, this._onFilterChanged, this);
        this._filterBar.addFilter(hideCollectedCheckbox);
    },

    /**
     * @param {!WebInspector.PromiseDetails} details
     * @param {!WebInspector.DataGridNode} node
     * @return {boolean}
     */
    _shouldBeVisible: function(details, node)
    {
        if (!this._statusFilterUI.accept(details.status))
            return false;

        if (this._hideCollectedPromisesSetting.get() && details.isGarbageCollected)
            return false;

        var regex = this._textFilterUI.regex();
        if (!regex)
            return true;

        var text = node.dataTextForSearch();
        regex.lastIndex = 0;
        return regex.test(text);
    },

    _onFilterChanged: function()
    {
        if (this._filterChangedTimeout)
            clearTimeout(this._filterChangedTimeout);
        this._filterChangedTimeout = setTimeout(onTimerFired.bind(this), 100);

        /**
         * @this {WebInspector.PromisePane}
         */
        function onTimerFired()
        {
            delete this._filterChangedTimeout;
            this._refresh();
        }
    },

    /**
     * @override
     * @return {!Array.<!Element>}
     */
    elementsToRestoreScrollPositionsFor: function()
    {
        return [this._dataGrid.scrollContainer];
    },

    /**
     * @override
     * @param {!WebInspector.Target} target
     */
    targetAdded: function(target)
    {
        var debuggerModel = WebInspector.DebuggerModel.fromTarget(target);
        if (debuggerModel && this._enabled)
            this._enablePromiseTracker(debuggerModel);
    },

    /**
     * @override
     * @param {!WebInspector.Target} target
     */
    targetRemoved: function(target)
    {
        var debuggerModel = WebInspector.DebuggerModel.fromTarget(target);
        if (!debuggerModel)
            return;
        this._promiseDetailsByDebuggerModel.delete(debuggerModel);
        if (this._debuggerModel === debuggerModel) {
            this._clear();
            delete this._debuggerModel;
        }
    },

    /**
     * @param {!WebInspector.Event} event
     */
    _targetChanged: function(event)
    {
        if (!this._enabled)
            return;
        var target = /** @type {!WebInspector.Target} */ (event.data);
        var debuggerModel = WebInspector.DebuggerModel.fromTarget(target);
        if (!debuggerModel || this._debuggerModel === debuggerModel)
            return;
        this._debuggerModel = debuggerModel;
        this._refresh();
    },

    /**
     * @param {!WebInspector.Event} event
     */
    _mainFrameNavigated: function(event)
    {
        var frame = /** @type {!WebInspector.ResourceTreeFrame} */ (event.data);
        var target = frame.target();
        var debuggerModel = WebInspector.DebuggerModel.fromTarget(target);
        if (!debuggerModel)
            return;
        this._promiseDetailsByDebuggerModel.delete(debuggerModel);
        if (this._debuggerModel === debuggerModel)
            this._clear();
    },

    /** @override */
    wasShown: function()
    {
        // Auto enable upon the very first show.
        if (typeof this._enabled === "undefined") {
            var target = WebInspector.context.flavor(WebInspector.Target);
            this._debuggerModel = WebInspector.DebuggerModel.fromTarget(target);
            this._updateRecordingState(true);
        }
        if (this._refreshIsNeeded)
            this._refresh();
    },

    /**
     * @param {!WebInspector.DebuggerModel} debuggerModel
     */
    _enablePromiseTracker: function(debuggerModel)
    {
        debuggerModel.enablePromiseTracker(true);
    },

    /**
     * @param {!WebInspector.DebuggerModel} debuggerModel
     */
    _disablePromiseTracker: function(debuggerModel)
    {
        debuggerModel.disablePromiseTracker();
    },

    /** @override */
    willHide: function()
    {
        this._hidePopover();
    },

    _hidePopover: function()
    {
        this._popoverHelper.hidePopover();
    },

    _recordButtonClicked: function()
    {
        this._updateRecordingState(!this._recordButton.toggled());
    },

    /**
     * @param {boolean} enabled
     */
    _updateRecordingState: function(enabled)
    {
        this._enabled = enabled;
        this._recordButton.setToggled(this._enabled);
        this._recordButton.setTitle(this._enabled ? WebInspector.UIString("Stop Recording Promises Log") : WebInspector.UIString("Record Promises Log"));
        WebInspector.DebuggerModel.instances().forEach(this._enabled ? this._enablePromiseTracker : this._disablePromiseTracker, this);
    },

    _clearButtonClicked: function()
    {
        this._clear();
        if (this._debuggerModel)
            this._promiseDetailsByDebuggerModel.delete(this._debuggerModel);
    },

    _resetFilters: function()
    {
        this._hideCollectedPromisesSetting.set(false);
        this._promiseStatusFiltersSetting.set({});
        this._textFilterUI.setValue("");
    },

    _updateFilterStatus: function()
    {
        this._filterStatusTextElement.textContent = WebInspector.UIString(this._hiddenByFilterCount === 1 ? "%d promise is hidden by filters." : "%d promises are hidden by filters.", this._hiddenByFilterCount);
        this._filterStatusMessageElement.classList.toggle("hidden", !this._hiddenByFilterCount);
    },

    _garbageCollectButtonClicked: function()
    {
        var targets = WebInspector.targetManager.targets();
        for (var i = 0; i < targets.length; ++i)
            targets[i].heapProfilerAgent().collectGarbage();
    },

    /**
     * @param {!WebInspector.DebuggerModel} debuggerModel
     * @return {boolean}
     */
    _truncateLogIfNeeded: function(debuggerModel)
    {
        var promiseIdToDetails = this._promiseDetailsByDebuggerModel.get(debuggerModel);
        if (!promiseIdToDetails || promiseIdToDetails.size <= WebInspector.PromisePane._maxPromiseCount)
            return false;

        var elementsToTruncate = WebInspector.PromisePane._maxPromiseCount / 10;
        var sortedDetails = promiseIdToDetails.valuesArray().sort(compare);
        for (var i = 0; i < elementsToTruncate; ++i)
            promiseIdToDetails.delete(sortedDetails[i].id);
        return true;

        /**
         * @param {!WebInspector.PromiseDetails} x
         * @param {!WebInspector.PromiseDetails} y
         * @return {number}
         */
        function compare(x, y)
        {
            var t1 = x.creationTime || 0;
            var t2 = y.creationTime || 0;
            return t1 - t2 || x.id - y.id;
        }
    },

    /**
     * @param {!WebInspector.Event} event
     */
    _onPromiseUpdated: function(event)
    {
        var debuggerModel = /** @type {!WebInspector.DebuggerModel} */ (event.target);
        var eventType = /** @type {string} */ (event.data.eventType);
        var protocolDetails = /** @type {!DebuggerAgent.PromiseDetails} */ (event.data.promise);

        var promiseIdToDetails = this._promiseDetailsByDebuggerModel.get(debuggerModel);
        if (!promiseIdToDetails) {
            promiseIdToDetails = new Map();
            this._promiseDetailsByDebuggerModel.set(debuggerModel, promiseIdToDetails);
        }

        var details = promiseIdToDetails.get(protocolDetails.id);
        if (!details && eventType === "gc")
            return;

        var truncated = this._truncateLogIfNeeded(debuggerModel);
        if (details)
            details.update(protocolDetails)
        else
            details = new WebInspector.PromiseDetails(protocolDetails);
        promiseIdToDetails.set(details.id, details);

        if (eventType === "gc")
            details.isGarbageCollected = true;

        if (debuggerModel === this._debuggerModel) {
            if (!this.isShowing()) {
                this._refreshIsNeeded = true;
                return;
            }
            if (truncated || this._refreshIsNeeded) {
                this._refresh();
                return;
            }

            var node = /** @type {!WebInspector.DataGridNode} */ (this._promiseIdToNode.get(details.id));
            var wasVisible = !node || !node._isPromiseHidden;

            // Check for the fast path on GC events.
            if (eventType === "gc" && node && node.parent && !this._hideCollectedPromisesSetting.get())
                node.update(details);
            else
                this._attachDataGridNode(details);

            var isVisible = this._shouldBeVisible(details, /** @type {!WebInspector.DataGridNode} */(this._promiseIdToNode.get(details.id)));
            if (wasVisible !== isVisible) {
                this._hiddenByFilterCount += wasVisible ? 1 : -1;
                this._updateFilterStatus();
            }
        }
    },

    /**
     * @param {!WebInspector.PromiseDetails} details
     */
    _attachDataGridNode: function(details)
    {
        var node = this._createDataGridNode(details);
        var parentNode = this._findVisibleParentNodeDetails(details);
        if (parentNode !== node.parent)
            parentNode.appendChild(node);
        if (this._shouldBeVisible(details, node))
            parentNode.expanded = true;
        else
            node.remove();
    },

    /**
     * @param {!WebInspector.PromiseDetails} details
     * @return {!WebInspector.DataGridNode}
     */
    _findVisibleParentNodeDetails: function(details)
    {
        var promiseIdToDetails = /** @type {!Map.<number, !WebInspector.PromiseDetails>} */ (this._promiseDetailsByDebuggerModel.get(this._debuggerModel));
        var currentDetails = details;
        while (currentDetails) {
            var parentId = currentDetails.parentId;
            if (typeof parentId !== "number")
                break;
            currentDetails = promiseIdToDetails.get(parentId);
            if (!currentDetails)
                break;
            var node = this._promiseIdToNode.get(currentDetails.id);
            if (node && this._shouldBeVisible(currentDetails, node))
                return node;
        }
        return this._dataGrid.rootNode();
    },

    /**
     * @param {!WebInspector.PromiseDetails} details
     * @return {!WebInspector.DataGridNode}
     */
    _createDataGridNode: function(details)
    {
        var node = this._promiseIdToNode.get(details.id);
        if (!node) {
            node = new WebInspector.PromiseDataGridNode(details, this._debuggerModel, this._linkifier, this._dataGrid);
            this._promiseIdToNode.set(details.id, node);
        } else {
            node.update(details);
        }
        return node;
    },

    _refresh: function()
    {
        delete this._refreshIsNeeded;
        this._clear();
        if (!this._debuggerModel)
            return;
        if (!this._promiseDetailsByDebuggerModel.has(this._debuggerModel))
            return;

        var rootNode = this._dataGrid.rootNode();
        var promiseIdToDetails = /** @type {!Map.<number, !WebInspector.PromiseDetails>} */ (this._promiseDetailsByDebuggerModel.get(this._debuggerModel));

        var nodesToInsert = { __proto__: null };
        // The for..of loop iterates in insertion order.
        for (var pair of promiseIdToDetails) {
            var id = /** @type {number} */ (pair[0]);
            var details = /** @type {!WebInspector.PromiseDetails} */ (pair[1]);
            var node = this._createDataGridNode(details);
            node._isPromiseHidden = !this._shouldBeVisible(details, node);
            if (node._isPromiseHidden) {
                ++this._hiddenByFilterCount;
                continue;
            }
            nodesToInsert[id] = { details: details, node: node };
        }

        for (var id in nodesToInsert) {
            var node = nodesToInsert[id].node;
            var details = nodesToInsert[id].details;
            this._findVisibleParentNodeDetails(details).appendChild(node);
        }

        for (var id in nodesToInsert) {
            var node = nodesToInsert[id].node;
            var details = nodesToInsert[id].details;
            node.expanded = true;
        }

        this._updateFilterStatus();
    },

    _clear: function()
    {
        this._hiddenByFilterCount = 0;
        this._updateFilterStatus();
        this._promiseIdToNode.clear();
        this._hidePopover();
        this._dataGrid.rootNode().removeChildren();
        this._linkifier.reset();
    },

    /**
     * @param {!WebInspector.ContextMenu} contextMenu
     * @param {!WebInspector.DataGridNode} node
     */
    _onContextMenu: function(contextMenu, node)
    {
        var debuggerModel = this._debuggerModel;
        if (!debuggerModel)
            return;

        var promiseId = node.promiseId();
        if (this._promiseDetailsByDebuggerModel.has(debuggerModel)) {
            var details = this._promiseDetailsByDebuggerModel.get(debuggerModel).get(promiseId);
            if (details.isGarbageCollected)
                return;
        }

        contextMenu.appendItem(WebInspector.UIString.capitalize("Show in ^console"), showPromiseInConsole);
        contextMenu.show();

        function showPromiseInConsole()
        {
            debuggerModel.getPromiseById(promiseId, "console", didGetPromiseById);
        }

        /**
         * @param {?RuntimeAgent.RemoteObject} promise
         */
        function didGetPromiseById(promise)
        {
            if (!promise)
                return;
            var object = debuggerModel.target().runtimeModel.createRemoteObject(promise);
            object.callFunction(dumpIntoConsole);
            object.release();
            /**
             * @suppressReceiverCheck
             * @this {Object}
             */
            function dumpIntoConsole()
            {
                console.log(this);
            }
            WebInspector.console.show();
        }
    },

    /**
     * @param {!Element} element
     * @param {!Event} event
     * @return {!Element|!AnchorBox|undefined}
     */
    _getPopoverAnchor: function(element, event)
    {
        if (!this._debuggerModel || !this._promiseDetailsByDebuggerModel.has(this._debuggerModel))
            return undefined;
        var node = this._dataGrid.dataGridNodeFromNode(element);
        if (!node)
            return undefined;
        var details = this._promiseDetailsByDebuggerModel.get(this._debuggerModel).get(node.promiseId());
        if (!details)
            return undefined;
        var anchor = element.enclosingNodeOrSelfWithClass("created-column");
        if (anchor)
            return details.creationStack ? anchor : undefined;
        anchor = element.enclosingNodeOrSelfWithClass("settled-column");
        return (anchor && details.settlementStack) ? anchor : undefined;
    },

    /**
     * @param {!Element} anchor
     * @param {!WebInspector.Popover} popover
     */
    _showPopover: function(anchor, popover)
    {
        var node = this._dataGrid.dataGridNodeFromNode(anchor);
        var details = this._promiseDetailsByDebuggerModel.get(this._debuggerModel).get(node.promiseId());

        var stackTrace;
        var asyncStackTrace;
        if (anchor.classList.contains("created-column")) {
            stackTrace = details.creationStack;
            asyncStackTrace = details.asyncCreationStack;
        } else {
            stackTrace = details.settlementStack;
            asyncStackTrace = details.asyncSettlementStack;
        }

        var content = WebInspector.DOMPresentationUtils.buildStackTracePreviewContents(this._debuggerModel.target(), this._linkifier, stackTrace, asyncStackTrace);
        popover.setCanShrink(true);
        popover.showForAnchor(content, anchor);
    },

    __proto__: WebInspector.VBox.prototype
}

/**
 * @constructor
 * @extends {WebInspector.ViewportDataGridNode}
 * @param {!WebInspector.PromiseDetails} details
 * @param {!WebInspector.DebuggerModel} debuggerModel
 * @param {!WebInspector.Linkifier} linkifier
 * @param {!WebInspector.ViewportDataGrid} dataGrid
 */
WebInspector.PromiseDataGridNode = function(details, debuggerModel, linkifier, dataGrid)
{
    WebInspector.ViewportDataGridNode.call(this, {});
    this._details = details;
    this._debuggerModel = debuggerModel;
    this._linkifier = linkifier;
    /** @type {!Array.<!Element>} */
    this._linkifiedAnchors = [];
    this.dataGrid = dataGrid;
}

WebInspector.PromiseDataGridNode.prototype = {
    _disposeAnchors: function()
    {
        for (var i = 0; i < this._linkifiedAnchors.length; ++i)
            this._linkifier.disposeAnchor(this._debuggerModel.target(), this._linkifiedAnchors[i]);
        this._linkifiedAnchors = [];
    },

    /**
     * @param {!WebInspector.PromiseDetails} details
     */
    update: function(details)
    {
        this._disposeAnchors();
        this._details = details;
        this.refresh();
    },

    /**
     * @override
     */
    wasDetached: function()
    {
        this._disposeAnchors();
    },

    /**
     * @override
     * @return {number}
     */
    nodeSelfHeight: function()
    {
        return 24;
    },

    /**
     * @return {number}
     */
    promiseId: function()
    {
        return this._details.id;
    },

    /**
     * @override
     */
    createCells: function()
    {
        this._element.classList.toggle("promise-gc", !!this._details.isGarbageCollected);
        WebInspector.ViewportDataGridNode.prototype.createCells.call(this);
    },

    /**
     * @param {!Element} cell
     * @param {?ConsoleAgent.CallFrame=} callFrame
     */
    _appendCallFrameAnchor: function(cell, callFrame)
    {
        if (!callFrame)
            return;
        var anchor = this._linkifier.linkifyConsoleCallFrame(this._debuggerModel.target(), callFrame);
        this._linkifiedAnchors.push(anchor);
        cell.appendChild(anchor);
    },

    /**
     * @override
     * @param {string} columnIdentifier
     * @return {!Element}
     */
    createCell: function(columnIdentifier)
    {
        var cell = this.createTD(columnIdentifier);
        var details = this._details;

        switch (columnIdentifier) {
        case "status":
            var title = "";
            switch (details.status) {
            case "pending":
                title = WebInspector.UIString("Pending");
                break;
            case "resolved":
                title = WebInspector.UIString("Fulfilled");
                break;
            case "rejected":
                title = WebInspector.UIString("Rejected");
                break;
            }
            if (details.isGarbageCollected)
                title += " " + WebInspector.UIString("(garbage collected)");
            cell.createChild("div", "status " + details.status).title = title;
            break;

        case "function":
            cell.createTextChild(WebInspector.beautifyFunctionName(details.callFrame ? details.callFrame.functionName : ""));
            break;

        case "created":
            this._appendCallFrameAnchor(cell, details.callFrame);
            break;

        case "settled":
            this._appendCallFrameAnchor(cell, details.settlementStack ? details.settlementStack[0] : null);
            break;

        case "tts":
            cell.createTextChild(this._ttsCellText());
            break;
        }

        return cell;
    },

    /**
     * @return {string}
     */
    _ttsCellText: function()
    {
        var details = this._details;
        if (details.creationTime && details.settlementTime && details.settlementTime >= details.creationTime)
            return Number.millisToString(details.settlementTime - details.creationTime);
        return "";
    },

    /**
     * @param {?ConsoleAgent.CallFrame=} callFrame
     * @return {string}
     */
    _callFrameAnchorTextForSearch: function(callFrame)
    {
        if (!callFrame)
            return "";
        var script = callFrame.scriptId && this._debuggerModel ? this._debuggerModel.scriptForId(callFrame.scriptId) : null;
        var sourceURL = script ? script.sourceURL : callFrame.url;
        var lineNumber = callFrame.lineNumber || 0;
        return WebInspector.displayNameForURL(sourceURL) + ":" + lineNumber;
    },

    /**
     * @return {string}
     */
    dataTextForSearch: function()
    {
        var details = this._details;
        var texts = [
            WebInspector.beautifyFunctionName(details.callFrame ? details.callFrame.functionName : ""),
            this._callFrameAnchorTextForSearch(details.callFrame),
            this._callFrameAnchorTextForSearch(details.settlementStack ? details.settlementStack[0] : null),
            this._ttsCellText().replace(/\u2009/g, " ") // \u2009 is a thin space.
        ];
        return texts.join(" ");
    },

    __proto__: WebInspector.ViewportDataGridNode.prototype
}
