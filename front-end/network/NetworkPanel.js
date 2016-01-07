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
 * @implements {WebInspector.ContextMenu.Provider}
 * @implements {WebInspector.Searchable}
 * @extends {WebInspector.Panel}
 */
WebInspector.NetworkPanel = function()
{
    WebInspector.Panel.call(this, "network");
    this.registerRequiredCSS("network/networkPanel.css");

    this._networkLogShowOverviewSetting = WebInspector.settings.createSetting("networkLogShowOverview", true);
    this._networkLogLargeRowsSetting = WebInspector.settings.createSetting("networkLogLargeRows", false);
    this._networkRecordFilmStripSetting = WebInspector.settings.createSetting("networkRecordFilmStripSetting", false);

    /** @type {?WebInspector.FilmStripView} */
    this._filmStripView = null;
    /** @type {?WebInspector.NetworkPanel.FilmStripRecorder} */
    this._filmStripRecorder = null;

    this._panelToolbar = new WebInspector.Toolbar(this.element);
    this._filterBar = new WebInspector.FilterBar("networkPanel", true);
    this.element.appendChild(this._filterBar.filtersElement());

    this._searchableView = new WebInspector.SearchableView(this);
    this._searchableView.setPlaceholder(WebInspector.UIString("Find by filename or path"));
    this._searchableView.show(this.element);

    // Create top overview component.
    this._overviewPane = new WebInspector.TimelineOverviewPane("network");
    this._overviewPane.addEventListener(WebInspector.TimelineOverviewPane.Events.WindowChanged, this._onWindowChanged.bind(this));
    this._overviewPane.element.id = "network-overview-panel";
    this._networkOverview = new WebInspector.NetworkOverview();
    this._overviewPane.setOverviewControls([this._networkOverview]);
    this._calculator = new WebInspector.NetworkTransferTimeCalculator();

    this._splitWidget = new WebInspector.SplitWidget(true, false, "networkPanelSplitViewState");
    this._splitWidget.hideMain();

    this._splitWidget.show(this._searchableView.element);

    this._progressBarContainer = createElement("div");
    this._createToolbarButtons();

    /** @type {!WebInspector.NetworkLogView} */
    this._networkLogView = new WebInspector.NetworkLogView(this._filterBar, this._progressBarContainer, this._networkLogLargeRowsSetting);
    this._splitWidget.setSidebarWidget(this._networkLogView);

    this._detailsWidget = new WebInspector.VBox();
    this._detailsWidget.element.classList.add("network-details-view");
    this._splitWidget.setMainWidget(this._detailsWidget);

    this._closeButtonElement = createElementWithClass("div", "network-close-button", "dt-close-button");
    this._closeButtonElement.addEventListener("click", this._showRequest.bind(this, null), false);

    this._networkLogShowOverviewSetting.addChangeListener(this._toggleShowOverview, this);
    this._networkLogLargeRowsSetting.addChangeListener(this._toggleLargerRequests, this);
    this._networkRecordFilmStripSetting.addChangeListener(this._toggleRecordFilmStrip, this);

    this._toggleRecordButton(true);
    this._toggleShowOverview();
    this._toggleLargerRequests();
    this._toggleRecordFilmStrip();
    this._updateUI();

    WebInspector.targetManager.addModelListener(WebInspector.ResourceTreeModel, WebInspector.ResourceTreeModel.EventTypes.WillReloadPage, this._willReloadPage, this);
    WebInspector.targetManager.addModelListener(WebInspector.ResourceTreeModel, WebInspector.ResourceTreeModel.EventTypes.Load, this._load, this);
    this._networkLogView.addEventListener(WebInspector.NetworkLogView.EventTypes.RequestSelected, this._onRequestSelected, this);
    this._networkLogView.addEventListener(WebInspector.NetworkLogView.EventTypes.SearchCountUpdated, this._onSearchCountUpdated, this);
    this._networkLogView.addEventListener(WebInspector.NetworkLogView.EventTypes.SearchIndexUpdated, this._onSearchIndexUpdated, this);
    this._networkLogView.addEventListener(WebInspector.NetworkLogView.EventTypes.UpdateRequest, this._onUpdateRequest, this);

    /**
     * @this {WebInspector.NetworkPanel}
     * @return {?WebInspector.SourceFrame}
     */
    function sourceFrameGetter()
    {
        return this._networkItemView.currentSourceFrame();
    }
    WebInspector.GoToLineDialog.install(this, sourceFrameGetter.bind(this));
    WebInspector.DataSaverInfobar.maybeShowInPanel(this);
}

WebInspector.NetworkPanel.prototype = {
    /**
     * @param {!WebInspector.Event} event
     */
    _onWindowChanged: function(event)
    {
        var startTime = Math.max(this._calculator.minimumBoundary(), event.data.startTime / 1000);
        var endTime = Math.min(this._calculator.maximumBoundary(), event.data.endTime / 1000);
        this._networkLogView.setWindow(startTime, endTime);
    },

    _createToolbarButtons: function()
    {
        this._recordButton = WebInspector.ToolbarButton.createActionButton("network.toggle-recording");
        this._panelToolbar.appendToolbarItem(this._recordButton);

        this._clearButton = new WebInspector.ToolbarButton(WebInspector.UIString("Clear"), "clear-toolbar-item");
        this._clearButton.addEventListener("click", this._onClearButtonClicked, this);
        this._panelToolbar.appendToolbarItem(this._clearButton);
        this._panelToolbar.appendSeparator();
        var recordFilmStripButton = new WebInspector.ToolbarSettingToggle(this._networkRecordFilmStripSetting, "camera-toolbar-item", WebInspector.UIString("Capture screenshots"));
        this._panelToolbar.appendToolbarItem(recordFilmStripButton);

        this._panelToolbar.appendToolbarItem(this._filterBar.filterButton());
        this._panelToolbar.appendSeparator();

        var viewModeLabel = new WebInspector.ToolbarText(WebInspector.UIString("View:"), "toolbar-group-label");
        this._panelToolbar.appendToolbarItem(viewModeLabel);

        var largerRequestsButton = new WebInspector.ToolbarSettingToggle(this._networkLogLargeRowsSetting, "large-list-toolbar-item", WebInspector.UIString("Use large request rows"), WebInspector.UIString("Use small request rows"));
        this._panelToolbar.appendToolbarItem(largerRequestsButton);

        var showOverviewButton = new WebInspector.ToolbarSettingToggle(this._networkLogShowOverviewSetting, "waterfall-toolbar-item", WebInspector.UIString("Show overview"), WebInspector.UIString("Hide overview"));
        this._panelToolbar.appendToolbarItem(showOverviewButton);
        this._panelToolbar.appendSeparator();

        this._preserveLogCheckbox = new WebInspector.ToolbarCheckbox(WebInspector.UIString("Preserve log"), WebInspector.UIString("Do not clear log on page reload / navigation"));
        this._preserveLogCheckbox.inputElement.addEventListener("change", this._onPreserveLogCheckboxChanged.bind(this), false);
        this._panelToolbar.appendToolbarItem(this._preserveLogCheckbox);

        this._disableCacheCheckbox = new WebInspector.ToolbarCheckbox(WebInspector.UIString("Disable cache"), WebInspector.UIString("Disable cache (while DevTools is open)"), WebInspector.moduleSetting("cacheDisabled"));
        this._panelToolbar.appendToolbarItem(this._disableCacheCheckbox);

        this._panelToolbar.appendSeparator();
        this._panelToolbar.appendToolbarItem(this._createBlockedURLsButton());
        this._panelToolbar.appendToolbarItem(this._createNetworkConditionsSelect());
        this._panelToolbar.appendToolbarItem(new WebInspector.ToolbarItem(this._progressBarContainer));
    },

    /**
     * @return {!WebInspector.ToolbarItem}
     */
    _createBlockedURLsButton: function()
    {
        var setting = WebInspector.moduleSetting("blockedURLs");
        setting.addChangeListener(updateButton);
        var button = new WebInspector.ToolbarButton(WebInspector.UIString("Block network requests"), "block-toolbar-item", 2);
        button.setAction("network.blocked-urls.show");
        updateButton();
        return button;

        function updateButton()
        {
            button.setState(setting.get().length ? "active" : "inactive");
        }
    },

    /**
     * @return {!WebInspector.ToolbarComboBox}
     */
    _createNetworkConditionsSelect: function()
    {
        var toolbarItem = new WebInspector.ToolbarComboBox(null);
        toolbarItem.setMaxWidth(140);
        new WebInspector.NetworkConditionsSelector(toolbarItem.selectElement());
        return toolbarItem;
    },

    _toggleRecording: function()
    {
        if (!this._preserveLogCheckbox.checked() && !this._recordButton.toggled())
            this._reset();
        this._toggleRecordButton(!this._recordButton.toggled());
    },

    /**
     * @param {boolean} toggled
     */
    _toggleRecordButton: function(toggled)
    {
        this._recordButton.setToggled(toggled);
        this._recordButton.setTitle(toggled ? WebInspector.UIString("Stop recording network log") : WebInspector.UIString("Record network log"));
        this._networkLogView.setRecording(toggled);
        if (!toggled && this._filmStripRecorder)
            this._filmStripRecorder.stopRecording(this._filmStripAvailable.bind(this));
    },

    /**
     * @param {?WebInspector.FilmStripModel} filmStripModel
     */
    _filmStripAvailable: function(filmStripModel)
    {
        if (!filmStripModel)
            return;
        var calculator = this._networkLogView.timeCalculator();
        this._filmStripView.setModel(filmStripModel, calculator.minimumBoundary() * 1000, calculator.boundarySpan() * 1000);
        this._networkOverview.setFilmStripModel(filmStripModel);
        var timestamps = filmStripModel.frames().map(mapTimestamp);

        /**
         * @param {!WebInspector.FilmStripModel.Frame} frame
         * @return {number}
         */
        function mapTimestamp(frame)
        {
            return frame.timestamp / 1000;
        }

        this._networkLogView.addFilmStripFrames(timestamps);
    },

    /**
     * @param {!Event} event
     */
    _onPreserveLogCheckboxChanged: function(event)
    {
        this._networkLogView.setPreserveLog(this._preserveLogCheckbox.checked());
    },

    /**
     * @param {!WebInspector.Event} event
     */
    _onClearButtonClicked: function(event)
    {
        this._reset();
    },

    _reset: function()
    {
        this._calculator.reset();
        this._overviewPane.reset();
        this._networkLogView.reset();
        WebInspector.BlockedURLsPane.reset();
        if (this._filmStripView)
            this._resetFilmStripView();
    },

    /**
     * @param {!WebInspector.Event} event
     */
    _willReloadPage: function(event)
    {
        if (!this._preserveLogCheckbox.checked())
            this._reset();
        this._toggleRecordButton(true);
        if (this._pendingStopTimer) {
            clearTimeout(this._pendingStopTimer);
            delete this._pendingStopTimer;
        }
        if (this.isShowing() && this._filmStripRecorder)
            this._filmStripRecorder.startRecording();
    },

    /**
     * @param {!WebInspector.Event} event
     */
    _load: function(event)
    {
        if (this._filmStripRecorder && this._filmStripRecorder.isRecording())
            this._pendingStopTimer = setTimeout(this._toggleRecordButton.bind(this, false), 1000);
    },

    _toggleLargerRequests: function()
    {
        this._updateUI();
    },

    _toggleShowOverview: function()
    {
        var toggled = this._networkLogShowOverviewSetting.get();
        if (toggled)
            this._overviewPane.show(this._searchableView.element, this._splitWidget.element);
        else
            this._overviewPane.detach();
        this.doResize();
    },

    _toggleRecordFilmStrip: function()
    {
        var toggled = this._networkRecordFilmStripSetting.get();
        if (toggled && !this._filmStripRecorder) {
            this._filmStripView = new WebInspector.FilmStripView();
            this._filmStripView.setMode(WebInspector.FilmStripView.Modes.FrameBased);
            this._filmStripView.element.classList.add("network-film-strip");
            this._filmStripRecorder = new WebInspector.NetworkPanel.FilmStripRecorder(this._networkLogView.timeCalculator(), this._filmStripView);
            this._filmStripView.show(this._searchableView.element, this._searchableView.element.firstElementChild);
            this._filmStripView.addEventListener(WebInspector.FilmStripView.Events.FrameSelected, this._onFilmFrameSelected, this);
            this._filmStripView.addEventListener(WebInspector.FilmStripView.Events.FrameEnter, this._onFilmFrameEnter, this);
            this._filmStripView.addEventListener(WebInspector.FilmStripView.Events.FrameExit, this._onFilmFrameExit, this);
            this._resetFilmStripView();
        }

        if (!toggled && this._filmStripRecorder) {
            this._filmStripView.detach();
            this._filmStripView = null;
            this._filmStripRecorder = null;
        }
    },

    _resetFilmStripView: function()
    {
        this._filmStripView.reset();
        this._filmStripView.setStatusText(WebInspector.UIString("Hit %s to reload and capture filmstrip.", WebInspector.ShortcutsScreen.TimelinePanelShortcuts.RecordPageReload[0].name));
    },

    /**
     * @override
     * @return {!Array.<!Element>}
     */
    elementsToRestoreScrollPositionsFor: function()
    {
        return this._networkLogView.elementsToRestoreScrollPositionsFor();
    },

    /**
     * @override
     * @return {!WebInspector.SearchableView}
     */
    searchableView: function()
    {
        return this._searchableView;
    },

    /**
     * @override
     * @param {!KeyboardEvent} event
     */
    handleShortcut: function(event)
    {
        if (this._networkItemView && event.keyCode === WebInspector.KeyboardShortcut.Keys.Esc.code) {
            this._showRequest(null);
            event.handled = true;
            return;
        }

        WebInspector.Panel.prototype.handleShortcut.call(this, event);
    },

    wasShown: function()
    {
        WebInspector.context.setFlavor(WebInspector.NetworkPanel, this);
    },

    willHide: function()
    {
        WebInspector.context.setFlavor(WebInspector.NetworkPanel, null);
    },

    /**
     * @param {!WebInspector.NetworkRequest} request
     */
    revealAndHighlightRequest: function(request)
    {
        this._showRequest(null);
        if (request)
            this._networkLogView.revealAndHighlightRequest(request);
    },

    /**
     * @param {!WebInspector.Event} event
     */
    _onRowSizeChanged: function(event)
    {
        this._updateUI();
    },

    /**
     * @param {!WebInspector.Event} event
     */
    _onSearchCountUpdated: function(event)
    {
        var count = /** @type {number} */ (event.data);
        this._searchableView.updateSearchMatchesCount(count);
    },

    /**
     * @param {!WebInspector.Event} event
     */
    _onSearchIndexUpdated: function(event)
    {
        var index = /** @type {number} */ (event.data);
        this._searchableView.updateCurrentMatchIndex(index);
    },

    /**
     * @param {!WebInspector.Event} event
     */
    _onRequestSelected: function(event)
    {
        var request = /** @type {?WebInspector.NetworkRequest} */ (event.data);
        this._showRequest(request);
    },

    /**
     * @param {?WebInspector.NetworkRequest} request
     */
    _showRequest: function(request)
    {
        if (this._networkItemView) {
            this._networkItemView.detach();
            this._networkItemView = null;
        }

        if (request) {
            this._networkItemView = new WebInspector.NetworkItemView(request, this._networkLogView.timeCalculator());
            this._networkItemView.insertBeforeTabStrip(this._closeButtonElement);
            this._networkItemView.show(this._detailsWidget.element);
            this._splitWidget.showBoth();
        } else {
            this._splitWidget.hideMain();
            this._networkLogView.clearSelection();
        }
        this._updateUI();
    },

    _updateUI: function()
    {
        this._detailsWidget.element.classList.toggle("network-details-view-tall-header", this._networkLogLargeRowsSetting.get());
        this._networkLogView.switchViewMode(!this._splitWidget.isResizable());
    },

    /**
     * @override
     * @param {!WebInspector.SearchableView.SearchConfig} searchConfig
     * @param {boolean} shouldJump
     * @param {boolean=} jumpBackwards
     */
    performSearch: function(searchConfig, shouldJump, jumpBackwards)
    {
        this._networkLogView.performSearch(searchConfig, shouldJump, jumpBackwards);
    },

    /**
     * @override
     */
    jumpToPreviousSearchResult: function()
    {
        this._networkLogView.jumpToPreviousSearchResult();
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
     * @override
     */
    jumpToNextSearchResult: function()
    {
        this._networkLogView.jumpToNextSearchResult();
    },

    /**
     * @override
     */
    searchCanceled: function()
    {
        this._networkLogView.searchCanceled();
    },

    /**
     * @override
     * @param {!Event} event
     * @param {!WebInspector.ContextMenu} contextMenu
     * @param {!Object} target
     * @this {WebInspector.NetworkPanel}
     */
    appendApplicableItems: function(event, contextMenu, target)
    {
        /**
         * @this {WebInspector.NetworkPanel}
         */
        function reveal(request)
        {
            WebInspector.inspectorView.setCurrentPanel(this);
            this.revealAndHighlightRequest(request);
        }

        /**
         * @this {WebInspector.NetworkPanel}
         */
        function appendRevealItem(request)
        {
            contextMenu.appendItem(WebInspector.UIString.capitalize("Reveal in Network ^panel"), reveal.bind(this, request));
        }

        if (event.target.isSelfOrDescendant(this.element))
            return;

        if (target instanceof WebInspector.Resource) {
            var resource = /** @type {!WebInspector.Resource} */ (target);
            if (resource.request)
                appendRevealItem.call(this, resource.request);
            return;
        }
        if (target instanceof WebInspector.UISourceCode) {
            var uiSourceCode = /** @type {!WebInspector.UISourceCode} */ (target);
            var resource = WebInspector.resourceForURL(WebInspector.networkMapping.networkURL(uiSourceCode));
            if (resource && resource.request)
                appendRevealItem.call(this, resource.request);
            return;
        }

        if (!(target instanceof WebInspector.NetworkRequest))
            return;
        var request = /** @type {!WebInspector.NetworkRequest} */ (target);
        if (this._networkItemView && this._networkItemView.isShowing() && this._networkItemView.request() === request)
            return;

        appendRevealItem.call(this, request);
    },

    /**
     * @param {!WebInspector.Event} event
     */
    _onFilmFrameSelected: function(event)
    {
        var timestamp = /** @type {number} */ (event.data);
        this._overviewPane.requestWindowTimes(0, timestamp);
    },

    /**
     * @param {!WebInspector.Event} event
     */
    _onFilmFrameEnter: function(event)
    {
        var timestamp = /** @type {number} */ (event.data);
        this._networkOverview.selectFilmStripFrame(timestamp);
        this._networkLogView.selectFilmStripFrame(timestamp / 1000);
    },

    /**
     * @param {!WebInspector.Event} event
     */
    _onFilmFrameExit: function(event)
    {
        this._networkOverview.clearFilmStripFrame();
        this._networkLogView.clearFilmStripFrame();
    },

    /**
     * @param {!WebInspector.Event} event
     */
    _onUpdateRequest: function(event)
    {
        var request = /** @type {!WebInspector.NetworkRequest} */ (event.data);
        this._calculator.updateBoundaries(request);
        // FIXME: Unify all time units across the frontend!
        this._overviewPane.setBounds(this._calculator.minimumBoundary() * 1000, this._calculator.maximumBoundary() * 1000);
        this._networkOverview.updateRequest(request);
        this._overviewPane.scheduleUpdate();
    },

    __proto__: WebInspector.Panel.prototype
}

/**
 * @constructor
 * @implements {WebInspector.ContextMenu.Provider}
 */
WebInspector.NetworkPanel.ContextMenuProvider = function()
{
}

WebInspector.NetworkPanel.ContextMenuProvider.prototype = {
    /**
     * @override
     * @param {!Event} event
     * @param {!WebInspector.ContextMenu} contextMenu
     * @param {!Object} target
     */
    appendApplicableItems: function(event, contextMenu, target)
    {
        WebInspector.NetworkPanel._instance().appendApplicableItems(event, contextMenu, target);
    }
}

/**
 * @constructor
 * @implements {WebInspector.Revealer}
 */
WebInspector.NetworkPanel.RequestRevealer = function()
{
}

WebInspector.NetworkPanel.RequestRevealer.prototype = {
    /**
     * @override
     * @param {!Object} request
     * @param {number=} lineNumber
     * @return {!Promise}
     */
    reveal: function(request, lineNumber)
    {
        if (!(request instanceof WebInspector.NetworkRequest))
            return Promise.reject(new Error("Internal error: not a network request"));
        var panel = WebInspector.NetworkPanel._instance();
        WebInspector.inspectorView.setCurrentPanel(panel);
        panel.revealAndHighlightRequest(request);
        return Promise.resolve();
    }
}


WebInspector.NetworkPanel.show = function()
{
    WebInspector.inspectorView.setCurrentPanel(WebInspector.NetworkPanel._instance());
}

/**
  * @param {!WebInspector.NetworkLogView.FilterType} filterType
  * @param {string} filterValue
  */
WebInspector.NetworkPanel.revealAndFilter = function(filterType, filterValue)
{
    var panel = WebInspector.NetworkPanel._instance();
    panel._networkLogView.setTextFilterValue(filterType, filterValue);
    WebInspector.inspectorView.setCurrentPanel(panel);
}

/**
 * @return {!WebInspector.NetworkPanel}
 */
WebInspector.NetworkPanel._instance = function()
{
    if (!WebInspector.NetworkPanel._instanceObject)
        WebInspector.NetworkPanel._instanceObject = new WebInspector.NetworkPanel();
    return WebInspector.NetworkPanel._instanceObject;
}

/**
 * @constructor
 * @implements {WebInspector.PanelFactory}
 */
WebInspector.NetworkPanelFactory = function()
{
}

WebInspector.NetworkPanelFactory.prototype = {
    /**
     * @override
     * @return {!WebInspector.Panel}
     */
    createPanel: function()
    {
        return WebInspector.NetworkPanel._instance();
    }
}

/**
 * @constructor
 * @implements {WebInspector.TracingManagerClient}
 * @param {!WebInspector.NetworkTimeCalculator} timeCalculator
 * @param {!WebInspector.FilmStripView} filmStripView
 */
WebInspector.NetworkPanel.FilmStripRecorder = function(timeCalculator, filmStripView)
{
    this._timeCalculator = timeCalculator;
    this._filmStripView = filmStripView;
}

WebInspector.NetworkPanel.FilmStripRecorder.prototype = {
    /**
     * @override
     */
    tracingStarted: function()
    {
    },

    /**
     * @override
     * @param {!Array.<!WebInspector.TracingManager.EventPayload>} events
     */
    traceEventsCollected: function(events)
    {
        if (this._tracingModel)
            this._tracingModel.addEvents(events);
    },

    /**
     * @override
     */
    tracingComplete: function()
    {
        if (!this._tracingModel)
            return;
        this._tracingModel.tracingComplete();
        var resourceTreeModel = this._target.resourceTreeModel;
        this._target = null;
        setImmediate(resourceTreeModel.resumeReload.bind(resourceTreeModel));
        this._callback(new WebInspector.FilmStripModel(this._tracingModel, this._timeCalculator.minimumBoundary() * 1000));
        delete this._callback;
    },

    /**
     * @override
     */
    tracingBufferUsage: function()
    {
    },

    /**
     * @override
     * @param {number} progress
     */
    eventsRetrievalProgress: function(progress)
    {
    },

    startRecording: function()
    {
        this._filmStripView.reset();
        this._filmStripView.setStatusText(WebInspector.UIString("Recording frames..."));
        if (this._target)
            return;

        this._target = WebInspector.targetManager.mainTarget();
        if (this._tracingModel)
            this._tracingModel.reset();
        else
            this._tracingModel = new WebInspector.TracingModel(new WebInspector.TempFileBackingStorage("tracing"));
        this._target.tracingManager.start(this, "-*,disabled-by-default-devtools.screenshot", "");
    },

    /**
     * @return {boolean}
     */
    isRecording: function()
    {
        return !!this._target;
    },

    /**
     * @param {function(?WebInspector.FilmStripModel)} callback
     */
    stopRecording: function(callback)
    {
        if (!this._target)
            return;

        this._target.tracingManager.stop();
        this._target.resourceTreeModel.suspendReload();
        this._callback = callback;
        this._filmStripView.setStatusText(WebInspector.UIString("Fetching frames..."));
    }
}

/**
 * @constructor
 * @implements {WebInspector.ActionDelegate}
 */
WebInspector.NetworkPanel.RecordActionDelegate = function()
{
}
WebInspector.NetworkPanel.RecordActionDelegate.prototype = {
    /**
     * @override
     * @param {!WebInspector.Context} context
     * @param {string} actionId
     */
    handleAction: function(context, actionId)
    {
        var panel = WebInspector.context.flavor(WebInspector.NetworkPanel);
        console.assert(panel && panel instanceof WebInspector.NetworkPanel);
        panel._toggleRecording();
    }
}
