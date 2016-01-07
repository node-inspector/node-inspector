/*
 * Copyright (C) 2012 Google Inc. All rights reserved.
 * Copyright (C) 2012 Intel Inc. All rights reserved.
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
 * @extends {WebInspector.Panel}
 * @implements {WebInspector.TimelineModeViewDelegate}
 * @implements {WebInspector.Searchable}
 */
WebInspector.TimelinePanel = function()
{
    WebInspector.Panel.call(this, "timeline");
    this.registerRequiredCSS("timeline/timelinePanel.css");
    this.registerRequiredCSS("ui/filter.css");
    this.element.addEventListener("contextmenu", this._contextMenu.bind(this), false);
    this._dropTarget = new WebInspector.DropTarget(this.element, [WebInspector.DropTarget.Types.Files, WebInspector.DropTarget.Types.URIList], WebInspector.UIString("Drop timeline file or URL here"), this._handleDrop.bind(this));

    this._detailsLinkifier = new WebInspector.Linkifier();
    this._windowStartTime = 0;
    this._windowEndTime = Infinity;
    this._millisecondsToRecordAfterLoadEvent = 3000;

    // Create model.
    this._tracingModelBackingStorage = new WebInspector.TempFileBackingStorage("tracing");
    this._tracingModel = new WebInspector.TracingModel(this._tracingModelBackingStorage);
    this._model = new WebInspector.TimelineModel(this._tracingModel, WebInspector.TimelineUIUtils.visibleEventsFilter());

    this._model.addEventListener(WebInspector.TimelineModel.Events.RecordingStarted, this._onRecordingStarted, this);
    this._model.addEventListener(WebInspector.TimelineModel.Events.RecordingStopped, this._onRecordingStopped, this);
    this._model.addEventListener(WebInspector.TimelineModel.Events.RecordsCleared, this._onRecordsCleared, this);
    this._model.addEventListener(WebInspector.TimelineModel.Events.RecordFilterChanged, this._refreshViews, this);
    this._model.addEventListener(WebInspector.TimelineModel.Events.BufferUsage, this._onTracingBufferUsage, this);
    this._model.addEventListener(WebInspector.TimelineModel.Events.RetrieveEventsProgress, this._onRetrieveEventsProgress, this);

    this._categoryFilter = new WebInspector.TimelineCategoryFilter();
    this._durationFilter = new WebInspector.TimelineIsLongFilter();
    this._textFilter = new WebInspector.TimelineTextFilter();
    this._model.addFilter(this._categoryFilter);
    this._model.addFilter(this._durationFilter);
    this._model.addFilter(this._textFilter);
    this._model.addFilter(new WebInspector.TimelineStaticFilter());

    /** @type {!Array.<!WebInspector.TimelineModeView>} */
    this._currentViews = [];

    this._flameChartEnabledSetting = WebInspector.settings.createSetting("timelineFlameChartEnabled", true);
    this._viewModeSetting = WebInspector.settings.createSetting("timelineViewMode", WebInspector.TimelinePanel.ViewMode.FlameChart);
    this._createToolbarItems();

    var topPaneElement = this.element.createChild("div", "hbox");
    topPaneElement.id = "timeline-overview-panel";

    // Create top overview component.
    this._overviewPane = new WebInspector.TimelineOverviewPane("timeline");
    this._overviewPane.addEventListener(WebInspector.TimelineOverviewPane.Events.WindowChanged, this._onWindowChanged.bind(this));
    this._overviewPane.show(topPaneElement);

    this._createFileSelector();
    this._registerShortcuts();

    WebInspector.targetManager.addEventListener(WebInspector.TargetManager.Events.PageReloadRequested, this._pageReloadRequested, this);
    WebInspector.targetManager.addEventListener(WebInspector.TargetManager.Events.Load, this._loadEventFired, this);

    // Create top level properties splitter.
    this._detailsSplitWidget = new WebInspector.SplitWidget(false, true, "timelinePanelDetailsSplitViewState");
    this._detailsSplitWidget.element.classList.add("timeline-details-split");
    this._detailsView = new WebInspector.TimelineDetailsView(this._model);
    this._detailsSplitWidget.installResizer(this._detailsView.headerElement());
    this._detailsSplitWidget.setSidebarWidget(this._detailsView);

    this._searchableView = new WebInspector.SearchableView(this);
    this._searchableView.setMinimumSize(0, 100);
    this._searchableView.element.classList.add("searchable-view");
    this._detailsSplitWidget.setMainWidget(this._searchableView);

    this._stackView = new WebInspector.StackView(false);
    this._stackView.element.classList.add("timeline-view-stack");
    if (Runtime.experiments.isEnabled("multipleTimelineViews")) {
        this._tabbedPane = new WebInspector.TabbedPane();
        this._tabbedPane.appendTab(WebInspector.TimelinePanel.ViewMode.FlameChart, WebInspector.UIString("Flame Chart"), new WebInspector.VBox());
        this._tabbedPane.appendTab(WebInspector.TimelinePanel.ViewMode.Waterfall, WebInspector.UIString("Waterfall"), new WebInspector.VBox());
        this._tabbedPane.appendTab(WebInspector.TimelinePanel.ViewMode.TreeView, WebInspector.UIString("Tree View"), new WebInspector.VBox());
        this._tabbedPane.addEventListener(WebInspector.TabbedPane.EventTypes.TabSelected, this._onMainViewChanged.bind(this));
        this._tabbedPane.show(this._searchableView.element);
    } else {
        this._stackView.show(this._searchableView.element);
        this._onModeChanged();
    }
    this._flameChartEnabledSetting.addChangeListener(this._onModeChanged, this);
    this._detailsSplitWidget.show(this.element);
    WebInspector.targetManager.addEventListener(WebInspector.TargetManager.Events.SuspendStateChanged, this._onSuspendStateChanged, this);
    this._showRecordingHelpMessage();
}

/**
 * @enum {string}
 */
WebInspector.TimelinePanel.ViewMode = {
    Waterfall: "Waterfall",
    FlameChart: "FlameChart",
    TreeView: "TreeView"
}

/**
 * @enum {string}
 */
WebInspector.TimelinePanel.DetailsTab = {
    Details: "Details",
    BottomUpTree: "BottomUpTree",
    PaintProfiler: "PaintProfiler",
    LayerViewer: "LayerViewer"
};

// Define row and header height, should be in sync with styles for timeline graphs.
WebInspector.TimelinePanel.rowHeight = 18;
WebInspector.TimelinePanel.headerHeight = 20;

WebInspector.TimelinePanel._aggregatedStatsKey = Symbol("aggregatedStats");

WebInspector.TimelinePanel.durationFilterPresetsMs = [0, 1, 15];

WebInspector.TimelinePanel.prototype = {
    /**
     * @override
     * @return {?WebInspector.SearchableView}
     */
    searchableView: function()
    {
        return this._searchableView;
    },

    wasShown: function()
    {
        if (!WebInspector.TimelinePanel._categoryStylesInitialized) {
            WebInspector.TimelinePanel._categoryStylesInitialized = true;
            var style = createElement("style");
            var categories = WebInspector.TimelineUIUtils.categories();
            style.textContent = Object.values(categories).map(WebInspector.TimelineUIUtils.createStyleRuleForCategory).join("\n");
            this.element.ownerDocument.head.appendChild(style);
        }
        WebInspector.context.setFlavor(WebInspector.TimelinePanel, this);
    },

    willHide: function()
    {
        WebInspector.context.setFlavor(WebInspector.TimelinePanel, null);
    },

    /**
     * @return {number}
     */
    windowStartTime: function()
    {
        if (this._windowStartTime)
            return this._windowStartTime;
        return this._model.minimumRecordTime();
    },

    /**
     * @return {number}
     */
    windowEndTime: function()
    {
        if (this._windowEndTime < Infinity)
            return this._windowEndTime;
        return this._model.maximumRecordTime() || Infinity;
    },

    /**
     * @param {!WebInspector.Event} event
     */
    _sidebarResized: function(event)
    {
        var width = /** @type {number} */ (event.data);
        for (var i = 0; i < this._currentViews.length; ++i)
            this._currentViews[i].setSidebarSize(width);
    },

    /**
     * @param {!WebInspector.Event} event
     */
    _onWindowChanged: function(event)
    {
        this._windowStartTime = event.data.startTime;
        this._windowEndTime = event.data.endTime;

        for (var i = 0; i < this._currentViews.length; ++i)
            this._currentViews[i].setWindowTimes(this._windowStartTime, this._windowEndTime);

        if (!this._selection || this._selection.type() === WebInspector.TimelineSelection.Type.Range)
            this.select(null);
    },

    _onMainViewChanged: function()
    {
        this._viewModeSetting.set(this._tabbedPane.selectedTabId);
        this._onModeChanged();
    },

    /**
     * @param {!WebInspector.Event} event
     */
    _onOverviewSelectionChanged: function(event)
    {
        var selection = /** @type {!WebInspector.TimelineSelection} */ (event.data);
        this.select(selection);
    },

    /**
     * @override
     * @param {number} windowStartTime
     * @param {number} windowEndTime
     */
    requestWindowTimes: function(windowStartTime, windowEndTime)
    {
        this._overviewPane.requestWindowTimes(windowStartTime, windowEndTime);
    },

    /**
     * @return {!WebInspector.TimelineFrameModelBase}
     */
    _frameModel: function()
    {
        if (!this._lazyFrameModel) {
            var tracingFrameModel = new WebInspector.TracingTimelineFrameModel();
            tracingFrameModel.addTraceEvents(this._model.target(), this._model.inspectedTargetEvents(), this._model.sessionId() || "");
            this._lazyFrameModel = tracingFrameModel;
        }
        return this._lazyFrameModel;
    },

    /**
     * @return {!WebInspector.Widget}
     */
    _layersView: function()
    {
        if (this._lazyLayersView)
            return this._lazyLayersView;
        this._lazyLayersView = new WebInspector.TimelineLayersView();
        this._lazyLayersView.setTimelineModelAndDelegate(this._model, this);
        return this._lazyLayersView;
    },

    _paintProfilerView: function()
    {
        if (this._lazyPaintProfilerView)
            return this._lazyPaintProfilerView;
        this._lazyPaintProfilerView = new WebInspector.TimelinePaintProfilerView(/** @type {!WebInspector.TracingTimelineFrameModel} */(this._frameModel()));
        return this._lazyPaintProfilerView;
    },

    /**
     * @param {!WebInspector.TimelineModeView} modeView
     */
    _addModeView: function(modeView)
    {
        modeView.setWindowTimes(this.windowStartTime(), this.windowEndTime());
        modeView.refreshRecords(this._textFilter._regex);
        this._stackView.appendView(modeView.view(), "timelinePanelTimelineStackSplitViewState", undefined, 112);
        modeView.view().addEventListener(WebInspector.SplitWidget.Events.SidebarSizeChanged, this._sidebarResized, this);
        this._currentViews.push(modeView);
    },

    _removeAllModeViews: function()
    {
        for (var i = 0; i < this._currentViews.length; ++i) {
            this._currentViews[i].removeEventListener(WebInspector.SplitWidget.Events.SidebarSizeChanged, this._sidebarResized, this);
            this._currentViews[i].dispose();
        }
        this._currentViews = [];
        this._stackView.detachChildWidgets();
    },

    /**
     * @param {string} name
     * @param {!WebInspector.Setting} setting
     * @param {string} tooltip
     * @return {!WebInspector.ToolbarItem}
     */
    _createSettingCheckbox: function(name, setting, tooltip)
    {
        if (!this._recordingOptionUIControls)
            this._recordingOptionUIControls = [];
        var checkboxItem = new WebInspector.ToolbarCheckbox(name, tooltip, setting);
        this._recordingOptionUIControls.push(checkboxItem);
        return checkboxItem;
    },

    _createToolbarItems: function()
    {
        this._panelToolbar = new WebInspector.Toolbar(this.element);

        this.toggleTimelineButton = WebInspector.ToolbarButton.createActionButton("timeline.toggle-recording");
        this._panelToolbar.appendToolbarItem(this.toggleTimelineButton);
        this._updateToggleTimelineButton(false);

        var clearButton = new WebInspector.ToolbarButton(WebInspector.UIString("Clear recording"), "clear-toolbar-item");
        clearButton.addEventListener("click", this._onClearButtonClick, this);
        this._panelToolbar.appendToolbarItem(clearButton);
        this._panelToolbar.appendSeparator();

        this._filterBar = this._createFilterBar();
        this._panelToolbar.appendToolbarItem(this._filterBar.filterButton());

        var garbageCollectButton = new WebInspector.ToolbarButton(WebInspector.UIString("Collect garbage"), "garbage-collect-toolbar-item");
        garbageCollectButton.addEventListener("click", this._garbageCollectButtonClicked, this);
        this._panelToolbar.appendToolbarItem(garbageCollectButton);
        this._panelToolbar.appendSeparator();

        if (!Runtime.experiments.isEnabled("multipleTimelineViews")) {
            var viewModeLabel = new WebInspector.ToolbarText(WebInspector.UIString("View:"), "toolbar-group-label");
            this._panelToolbar.appendToolbarItem(viewModeLabel);

            this._flameChartToggleButton = new WebInspector.ToolbarSettingToggle(this._flameChartEnabledSetting, "flame-chart-toolbar-item", WebInspector.UIString("Flame chart view. (Use WASD or time selection to navigate)"));
            this._panelToolbar.appendToolbarItem(this._flameChartToggleButton);
            this._panelToolbar.appendSeparator();
        }

        var captureSettingsLabel = new WebInspector.ToolbarText(WebInspector.UIString("Capture:"), "toolbar-group-label");
        this._panelToolbar.appendToolbarItem(captureSettingsLabel);

        this._captureNetworkSetting = WebInspector.settings.createSetting("timelineCaptureNetwork", false);
        this._captureNetworkSetting.addChangeListener(this._onNetworkChanged, this);
        if (Runtime.experiments.isEnabled("networkRequestsOnTimeline")) {
            this._panelToolbar.appendToolbarItem(this._createSettingCheckbox(WebInspector.UIString("Network"),
                                                                             this._captureNetworkSetting,
                                                                             WebInspector.UIString("Capture network requests information")));
        }
        this._enableJSSamplingSettingSetting = WebInspector.settings.createSetting("timelineEnableJSSampling", true);
        this._panelToolbar.appendToolbarItem(this._createSettingCheckbox(WebInspector.UIString("JS Profile"),
                                                                         this._enableJSSamplingSettingSetting,
                                                                         WebInspector.UIString("Capture JavaScript stacks with sampling profiler. (Has performance overhead)")));

        this._captureMemorySetting = WebInspector.settings.createSetting("timelineCaptureMemory", false);
        this._panelToolbar.appendToolbarItem(this._createSettingCheckbox(WebInspector.UIString("Memory"),
                                                                         this._captureMemorySetting,
                                                                         WebInspector.UIString("Capture memory information on every timeline event.")));
        this._captureMemorySetting.addChangeListener(this._onModeChanged, this);
        this._captureLayersAndPicturesSetting = WebInspector.settings.createSetting("timelineCaptureLayersAndPictures", false);
        this._panelToolbar.appendToolbarItem(this._createSettingCheckbox(WebInspector.UIString("Paint"),
                                                                         this._captureLayersAndPicturesSetting,
                                                                         WebInspector.UIString("Capture graphics layer positions and painted pictures. (Has performance overhead)")));

        this._captureFilmStripSetting = WebInspector.settings.createSetting("timelineCaptureFilmStrip", false);
        this._captureFilmStripSetting.addChangeListener(this._onModeChanged, this);
        this._panelToolbar.appendToolbarItem(this._createSettingCheckbox(WebInspector.UIString("Screenshots"),
                                                                         this._captureFilmStripSetting,
                                                                         WebInspector.UIString("Capture screenshots while recording. (Has performance overhead)")));

        this._progressToolbarItem = new WebInspector.ToolbarItem(createElement("div"));
        this._progressToolbarItem.setVisible(false);
        this._panelToolbar.appendToolbarItem(this._progressToolbarItem);

        this.element.appendChild(this._filterBar.filtersElement());
    },

    /**
     * @return {!WebInspector.FilterBar}
     */
    _createFilterBar: function()
    {
        this._filterBar = new WebInspector.FilterBar("timelinePanel");
        this._filters = {};
        this._filters._textFilterUI = new WebInspector.TextFilterUI();
        this._filters._textFilterUI.addEventListener(WebInspector.FilterUI.Events.FilterChanged, this._textFilterChanged, this);
        this._filterBar.addFilter(this._filters._textFilterUI);

        var durationOptions = [];
        for (var presetIndex = 0; presetIndex < WebInspector.TimelinePanel.durationFilterPresetsMs.length; ++presetIndex) {
            var durationMs = WebInspector.TimelinePanel.durationFilterPresetsMs[presetIndex];
            var durationOption = {};
            if (!durationMs) {
                durationOption.label = WebInspector.UIString("All");
                durationOption.title = WebInspector.UIString("Show all records");
            } else {
                durationOption.label = WebInspector.UIString("\u2265 %dms", durationMs);
                durationOption.title = WebInspector.UIString("Hide records shorter than %dms", durationMs);
            }
            durationOption.value = durationMs;
            durationOptions.push(durationOption);
        }
        this._filters._durationFilterUI = new WebInspector.ComboBoxFilterUI(durationOptions);
        this._filters._durationFilterUI.addEventListener(WebInspector.FilterUI.Events.FilterChanged, this._durationFilterChanged, this);
        this._filterBar.addFilter(this._filters._durationFilterUI);

        this._filters._categoryFiltersUI = {};
        var categories = WebInspector.TimelineUIUtils.categories();
        for (var categoryName in categories) {
            var category = categories[categoryName];
            if (!category.visible)
                continue;
            var filter = new WebInspector.CheckboxFilterUI(category.name, category.title);
            filter.setColor(category.fillColorStop0, category.borderColor);
            this._filters._categoryFiltersUI[category.name] = filter;
            filter.addEventListener(WebInspector.FilterUI.Events.FilterChanged, this._categoriesFilterChanged.bind(this, categoryName), this);
            this._filterBar.addFilter(filter);
        }
        return this._filterBar;
    },

    _textFilterChanged: function(event)
    {
        var searchQuery = this._filters._textFilterUI.value();
        this.searchCanceled();
        this._textFilter.setRegex(searchQuery ? createPlainTextSearchRegex(searchQuery, "i") : null);
    },

    _durationFilterChanged: function()
    {
        var duration = this._filters._durationFilterUI.value();
        var minimumRecordDuration = parseInt(duration, 10);
        this._durationFilter.setMinimumRecordDuration(minimumRecordDuration);
    },

    _categoriesFilterChanged: function(name, event)
    {
        var categories = WebInspector.TimelineUIUtils.categories();
        categories[name].hidden = !this._filters._categoryFiltersUI[name].checked();
        this._categoryFilter.notifyFilterChanged();
    },

    /**
     * @return {!WebInspector.Progress}
     */
    _prepareToLoadTimeline: function()
    {
        if (this._recordingInProgress()) {
            this._updateToggleTimelineButton(false);
            this._stopRecording();
        }

        /**
         * @this {!WebInspector.TimelinePanel}
         */
        function finishLoading()
        {
            this._setOperationInProgress(null);
            this._updateToggleTimelineButton(false);
            this._hideRecordingHelpMessage();
        }
        var progressIndicator = new WebInspector.ProgressIndicator();
        this._setOperationInProgress(progressIndicator);
        return new WebInspector.ProgressProxy(progressIndicator, finishLoading.bind(this));
    },

    /**
     * @param {?WebInspector.ProgressIndicator} indicator
     */
    _setOperationInProgress: function(indicator)
    {
        this._operationInProgress = !!indicator;
        this._panelToolbar.setEnabled(!this._operationInProgress);
        this._dropTarget.setEnabled(!this._operationInProgress);

        this._progressToolbarItem.setVisible(this._operationInProgress);
        this._progressToolbarItem.element.removeChildren();
        if (indicator)
            this._progressToolbarItem.element.appendChild(indicator.element);
    },

    _registerShortcuts: function()
    {
        this.registerShortcuts(WebInspector.ShortcutsScreen.TimelinePanelShortcuts.SaveToFile, this._saveToFile.bind(this));
        this.registerShortcuts(WebInspector.ShortcutsScreen.TimelinePanelShortcuts.LoadFromFile, this._selectFileToLoad.bind(this));
        this.registerShortcuts(WebInspector.ShortcutsScreen.TimelinePanelShortcuts.JumpToPreviousFrame, this._jumpToFrame.bind(this, -1));
        this.registerShortcuts(WebInspector.ShortcutsScreen.TimelinePanelShortcuts.JumpToNextFrame, this._jumpToFrame.bind(this, 1));
    },

    _createFileSelector: function()
    {
        if (this._fileSelectorElement)
            this._fileSelectorElement.remove();

        this._fileSelectorElement = WebInspector.createFileSelectorElement(this._loadFromFile.bind(this));
        this.element.appendChild(this._fileSelectorElement);
    },

    _contextMenu: function(event)
    {
        var contextMenu = new WebInspector.ContextMenu(event);
        contextMenu.appendItem(WebInspector.UIString.capitalize("Save Timeline ^data\u2026"), this._saveToFile.bind(this), this._operationInProgress);
        contextMenu.appendItem(WebInspector.UIString.capitalize("Load Timeline ^data\u2026"), this._selectFileToLoad.bind(this), this._operationInProgress);
        contextMenu.show();
    },

    /**
     * @return {boolean}
     */
    _saveToFile: function()
    {
        if (this._operationInProgress)
            return true;

        var now = new Date();
        var fileName = "TimelineRawData-" + now.toISO8601Compact() + ".json";
        var stream = new WebInspector.FileOutputStream();

        /**
         * @param {boolean} accepted
         * @this {WebInspector.TimelinePanel}
         */
        function callback(accepted)
        {
            if (!accepted)
                return;
            var saver = new WebInspector.TracingTimelineSaver(stream);
            this._tracingModelBackingStorage.writeToStream(stream, saver);
        }
        stream.open(fileName, callback.bind(this));
        return true;
    },

    /**
     * @return {boolean}
     */
    _selectFileToLoad: function()
    {
        this._fileSelectorElement.click();
        return true;
    },

    /**
     * @param {!File} file
     */
    _loadFromFile: function(file)
    {
        if (this._operationInProgress)
            return;
        this._model.loadFromFile(file, this._prepareToLoadTimeline());
        this._createFileSelector();
    },

    /**
     * @param {string} url
     */
    _loadFromURL: function(url)
    {
        console.assert(!this._operationInProgress);
        this._model.loadFromURL(url, this._prepareToLoadTimeline());
    },

    _refreshViews: function()
    {
        for (var i = 0; i < this._currentViews.length; ++i) {
            var view = this._currentViews[i];
            view.refreshRecords(this._textFilter._regex);
        }
        this._updateSelectionDetails();
    },

    _onModeChanged: function()
    {
        // Set up overview controls.
        this._overviewControls = [];
        if (Runtime.experiments.isEnabled("inputEventsOnTimelineOverview"))
            this._overviewControls.push(new WebInspector.TimelineEventOverview.Input(this._model));
        this._overviewControls.push(new WebInspector.TimelineEventOverview.Responsiveness(this._model, this._frameModel()));
        this._overviewControls.push(new WebInspector.TimelineEventOverview.Frames(this._model, this._frameModel()));
        this._overviewControls.push(new WebInspector.TimelineEventOverview.CPUActivity(this._model));
        this._overviewControls.push(new WebInspector.TimelineEventOverview.Network(this._model));
        if (this._captureFilmStripSetting.get())
            this._overviewControls.push(new WebInspector.TimelineFilmStripOverview(this._model, this._tracingModel));
        if (this._captureMemorySetting.get())
            this._overviewControls.push(new WebInspector.TimelineEventOverview.Memory(this._model));
        this._overviewPane.setOverviewControls(this._overviewControls);

        // Set up the main view.
        this._stackView.detach();
        this._removeAllModeViews();
        var viewMode = this._flameChartEnabledSetting.get() ? WebInspector.TimelinePanel.ViewMode.FlameChart : WebInspector.TimelinePanel.ViewMode.Waterfall;
        if (Runtime.experiments.isEnabled("multipleTimelineViews") && this._tabbedPane) {
            viewMode = this._tabbedPane.selectedTabId;
            this._stackView.show(this._tabbedPane.visibleView.element);
        } else {
            this._stackView.show(this._searchableView.element);
        }
        this._flameChart = null;
        if (viewMode === WebInspector.TimelinePanel.ViewMode.FlameChart) {
            this._filterBar.filterButton().setEnabled(false);
            this._filterBar.filtersElement().classList.toggle("hidden", true);
            this._flameChart = new WebInspector.TimelineFlameChartView(this, this._model, this._frameModel());
            this._flameChart.enableNetworkPane(this._captureNetworkSetting.get());
            this._addModeView(this._flameChart);
        } else if (viewMode === WebInspector.TimelinePanel.ViewMode.Waterfall) {
            this._filterBar.filterButton().setEnabled(true);
            this._filterBar.filtersElement().classList.toggle("hidden", !this._filterBar.filtersToggled());
            var timelineView = new WebInspector.TimelineView(this, this._model);
            this._addModeView(timelineView);
            timelineView.setFrameModel(this._frameModel());
        } else if (viewMode === WebInspector.TimelinePanel.ViewMode.TreeView) {
            this._filterBar.filterButton().setEnabled(false);
            this._filterBar.filtersElement().classList.toggle("hidden", true);
            var treeView = new WebInspector.TimelineTreeModeView(this, this._model);
            this._addModeView(treeView);
        }

        if (this._captureMemorySetting.get() && viewMode !== WebInspector.TimelinePanel.ViewMode.TreeView)
            this._addModeView(new WebInspector.MemoryCountersGraph(this, this._model));

        var mainTarget = WebInspector.targetManager.mainTarget();
        this.doResize();
        this.select(null);
    },

    _onNetworkChanged: function()
    {
        if (this._flameChart)
            this._flameChart.enableNetworkPane(this._captureNetworkSetting.get(), true);
    },

    /**
     * @param {boolean} enabled
     */
    _setUIControlsEnabled: function(enabled)
    {
        /**
         * @param {!WebInspector.ToolbarButton} toolbarItem
         */
        function handler(toolbarItem)
        {
            toolbarItem.setEnabled(enabled);
        }
        this._recordingOptionUIControls.forEach(handler);
    },

    /**
     * @param {boolean} userInitiated
     */
    _startRecording: function(userInitiated)
    {
        console.assert(!this._statusDialog, "Status dialog is already opened.");
        this._statusDialog = new WebInspector.TimelinePanel.StatusDialog();
        this._statusDialog.addEventListener(WebInspector.TimelinePanel.StatusDialog.Events.Finish, this._stopRecording, this);
        WebInspector.Dialog.show(this._statusDialog, true);
        this._updateStatus(WebInspector.UIString("Initializing recording\u2026"));

        this._autoRecordGeneration = userInitiated ? null : {};
        this._model.startRecording(true, this._enableJSSamplingSettingSetting.get(), this._captureMemorySetting.get(), this._captureLayersAndPicturesSetting.get(), this._captureFilmStripSetting && this._captureFilmStripSetting.get());
        if (this._lazyFrameModel)
            this._lazyFrameModel.setMergeRecords(false);

        for (var i = 0; i < this._overviewControls.length; ++i)
            this._overviewControls[i].timelineStarted();

        if (userInitiated)
            WebInspector.userMetrics.TimelineStarted.record();
        this._setUIControlsEnabled(false);
        this._hideRecordingHelpMessage();
    },

    _stopRecording: function()
    {
        if (this._statusDialog)
            this._statusDialog.finish();
        this._updateStatus(WebInspector.UIString("Retrieving timeline\u2026"));
        this._stopPending = true;
        this._updateToggleTimelineButton(false);
        this._autoRecordGeneration = null;
        this._model.stopRecording();
        this._setUIControlsEnabled(true);
    },

    _onSuspendStateChanged: function()
    {
        this._updateToggleTimelineButton(this.toggleTimelineButton.toggled());
    },

    /**
     * @param {boolean} toggled
     */
    _updateToggleTimelineButton: function(toggled)
    {
        this.toggleTimelineButton.setToggled(toggled);
        if (toggled) {
            this.toggleTimelineButton.setTitle(WebInspector.UIString("Stop"));
            this.toggleTimelineButton.setEnabled(true);
        } else if (this._stopPending) {
            this.toggleTimelineButton.setTitle(WebInspector.UIString("Stop pending"));
            this.toggleTimelineButton.setEnabled(false);
        } else if (WebInspector.targetManager.allTargetsSuspended()) {
            this.toggleTimelineButton.setTitle(WebInspector.anotherProfilerActiveLabel());
            this.toggleTimelineButton.setEnabled(false);
        } else {
            this.toggleTimelineButton.setTitle(WebInspector.UIString("Record"));
            this.toggleTimelineButton.setEnabled(true);
        }
    },

    /**
     * @return {boolean}
     */
    _toggleTimelineButtonClicked: function()
    {
        if (!this.toggleTimelineButton.enabled())
            return true;
        if (this._operationInProgress)
            return true;
        if (this._recordingInProgress())
            this._stopRecording();
        else
            this._startRecording(true);
        return true;
    },

    _garbageCollectButtonClicked: function()
    {
        var targets = WebInspector.targetManager.targets();
        for (var i = 0; i < targets.length; ++i)
            targets[i].heapProfilerAgent().collectGarbage();
    },

    _onClearButtonClick: function()
    {
        this._tracingModel.reset();
        this._model.reset();
        this._showRecordingHelpMessage();
    },

    _onRecordsCleared: function()
    {
        this.requestWindowTimes(0, Infinity);
        delete this._selection;
        if (this._lazyFrameModel)
            this._lazyFrameModel.reset();
        this._overviewPane.reset();
        for (var i = 0; i < this._currentViews.length; ++i)
            this._currentViews[i].reset();
        for (var i = 0; i < this._overviewControls.length; ++i)
            this._overviewControls[i].reset();
        this.select(null);
        delete this._filmStripModel;
    },

    /**
     * @param {!WebInspector.Event} event
     */
    _onRecordingStarted: function(event)
    {
        this._updateToggleTimelineButton(true);
        var message = event.data && event.data.fromFile ? WebInspector.UIString("Loading\u2026") : WebInspector.UIString("Recording\u2026");
        this._updateStatus(message);
        if (this._statusDialog)
            this._statusDialog.startTimer();
    },

    _recordingInProgress: function()
    {
        return this.toggleTimelineButton.toggled();
    },

    /**
     * @param {!WebInspector.Event} event
     */
    _onTracingBufferUsage: function(event)
    {
        var usage = /** @type {number} */ (event.data);
        if (this._statusDialog)
            this._statusDialog.updateBufferUsage(usage * 100);
    },

    _onRetrieveEventsProgress: function()
    {
        this._updateStatus(WebInspector.UIString("Retrieving timeline\u2026"));
    },

    /**
     * @param {string} statusMessage
     */
    _updateStatus: function(statusMessage)
    {
        if (this._statusDialog)
            this._statusDialog.updateStatus(statusMessage);
    },

    _showRecordingHelpMessage: function()
    {
        /**
         * @param {string} tagName
         * @param {string} contents
         * @return {!Element}
         */
        function encloseWithTag(tagName, contents)
        {
            var e = createElement(tagName);
            e.textContent = contents;
            return e;
        }

        var recordNode = encloseWithTag("b", WebInspector.ShortcutsScreen.TimelinePanelShortcuts.StartStopRecording[0].name);
        var reloadNode = encloseWithTag("b", WebInspector.ShortcutsScreen.TimelinePanelShortcuts.RecordPageReload[0].name);
        var navigateNode = encloseWithTag("b", WebInspector.UIString("WASD"));
        var hintText = createElementWithClass("div", "recording-hint");
        hintText.appendChild(WebInspector.formatLocalized(WebInspector.UIString("To capture a new timeline, click the record toolbar button or hit %s."), [recordNode], null));
        hintText.createChild("br");
        hintText.appendChild(WebInspector.formatLocalized(WebInspector.UIString("To evaluate page load performance, hit %s to record the reload."), [reloadNode], null));
        hintText.createChild("p");
        hintText.appendChild(WebInspector.formatLocalized(WebInspector.UIString("After recording, select an area of interest in the overview by dragging."), [], null));
        hintText.createChild("br");
        hintText.appendChild(WebInspector.formatLocalized(WebInspector.UIString("Then, zoom and pan the timeline with the mousewheel and %s keys."), [navigateNode], null));
        this._hideRecordingHelpMessage();
        this._helpMessageElement = this._searchableView.element.createChild("div", "timeline-status-pane fill");
        this._helpMessageElement.appendChild(hintText);
    },

    _hideRecordingHelpMessage: function()
    {
        if (this._helpMessageElement)
            this._helpMessageElement.remove();
        delete this._helpMessageElement;
    },

    _onRecordingStopped: function()
    {
        this._stopPending = false;
        this._updateToggleTimelineButton(false);
        if (this._lazyFrameModel) {
            this._lazyFrameModel.reset();
            this._lazyFrameModel.addTraceEvents(this._model.target(), this._model.inspectedTargetEvents(), this._model.sessionId());
        }
        this._overviewPane.reset();
        this._overviewPane.setBounds(this._model.minimumRecordTime(), this._model.maximumRecordTime());
        this.requestWindowTimes(this._model.minimumRecordTime(), this._model.maximumRecordTime());
        this._refreshViews();
        for (var i = 0; i < this._overviewControls.length; ++i)
            this._overviewControls[i].timelineStopped();
        this._setMarkers();
        this._overviewPane.scheduleUpdate();
        this._updateSearchHighlight(false, true);
        if (this._statusDialog) {
            this._statusDialog.hide();
            delete this._statusDialog;
        }
    },

    _setMarkers: function()
    {
        var markers = new Map();
        var recordTypes = WebInspector.TimelineModel.RecordType;
        var zeroTime = this._model.minimumRecordTime();
        for (var record of this._model.eventDividerRecords()) {
            if (record.type() === recordTypes.TimeStamp || record.type() === recordTypes.ConsoleTime)
                continue;
            markers.set(record.startTime(), WebInspector.TimelineUIUtils.createDividerForRecord(record, zeroTime, 0));
        }
        this._overviewPane.setMarkers(markers);
    },

    /**
     * @param {!WebInspector.Event} event
     */
    _pageReloadRequested: function(event)
    {
        if (this._operationInProgress || this._recordingInProgress() || !this.isShowing())
            return;
        this._startRecording(false);
    },

    /**
     * @param {!WebInspector.Event} event
     */
    _loadEventFired: function(event)
    {
        if (!this._recordingInProgress() || !this._autoRecordGeneration)
            return;
        setTimeout(stopRecordingOnReload.bind(this, this._autoRecordGeneration), this._millisecondsToRecordAfterLoadEvent);

        /**
         * @this {WebInspector.TimelinePanel}
         * @param {!Object} recordGeneration
         */
        function stopRecordingOnReload(recordGeneration)
        {
            // Check if we're still in the same recording session.
            if (this._autoRecordGeneration !== recordGeneration)
                return;
            this._stopRecording();
        }
    },

    // WebInspector.Searchable implementation

    /**
     * @override
     */
    jumpToNextSearchResult: function()
    {
        if (!this._searchResults || !this._searchResults.length)
            return;
        var index = this._selectedSearchResult ? this._searchResults.indexOf(this._selectedSearchResult) : -1;
        this._jumpToSearchResult(index + 1);
    },

    /**
     * @override
     */
    jumpToPreviousSearchResult: function()
    {
        if (!this._searchResults || !this._searchResults.length)
            return;
        var index = this._selectedSearchResult ? this._searchResults.indexOf(this._selectedSearchResult) : 0;
        this._jumpToSearchResult(index - 1);
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

    _jumpToSearchResult: function(index)
    {
        this._selectSearchResult((index + this._searchResults.length) % this._searchResults.length);
        this._currentViews[0].highlightSearchResult(this._selectedSearchResult, this._searchRegex, true);
    },

    _selectSearchResult: function(index)
    {
        this._selectedSearchResult = this._searchResults[index];
        this._searchableView.updateCurrentMatchIndex(index);
    },

    _clearHighlight: function()
    {
        this._currentViews[0].highlightSearchResult(null);
    },

    /**
     * @param {boolean} revealRecord
     * @param {boolean} shouldJump
     * @param {boolean=} jumpBackwards
     */
    _updateSearchHighlight: function(revealRecord, shouldJump, jumpBackwards)
    {
        if (!this._textFilter.isEmpty() || !this._searchRegex) {
            this._clearHighlight();
            return;
        }

        if (!this._searchResults)
            this._updateSearchResults(shouldJump, jumpBackwards);
        this._currentViews[0].highlightSearchResult(this._selectedSearchResult, this._searchRegex, revealRecord);
    },

    /**
     * @param {boolean} shouldJump
     * @param {boolean=} jumpBackwards
     */
    _updateSearchResults: function(shouldJump, jumpBackwards)
    {
        var searchRegExp = this._searchRegex;
        if (!searchRegExp)
            return;

        var matches = [];

        /**
         * @param {!WebInspector.TimelineModel.Record} record
         * @this {WebInspector.TimelinePanel}
         */
        function processRecord(record)
        {
            if (record.endTime() < this._windowStartTime ||
                record.startTime() > this._windowEndTime)
                return;
            if (WebInspector.TimelineUIUtils.testContentMatching(record.traceEvent(), searchRegExp))
                matches.push(record);
        }
        this._model.forAllFilteredRecords(processRecord.bind(this));

        var matchesCount = matches.length;
        if (matchesCount) {
            this._searchResults = matches;
            this._searchableView.updateSearchMatchesCount(matchesCount);

            var selectedIndex = matches.indexOf(this._selectedSearchResult);
            if (shouldJump && selectedIndex === -1)
                selectedIndex = jumpBackwards ? this._searchResults.length - 1 : 0;
            this._selectSearchResult(selectedIndex);
        } else {
            this._searchableView.updateSearchMatchesCount(0);
            delete this._selectedSearchResult;
        }
    },

    /**
     * @override
     */
    searchCanceled: function()
    {
        this._clearHighlight();
        delete this._searchResults;
        delete this._selectedSearchResult;
        delete this._searchRegex;
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
        this._searchRegex = createPlainTextSearchRegex(query, "i");
        delete this._searchResults;
        this._updateSearchHighlight(true, shouldJump, jumpBackwards);
    },

    _updateSelectionDetails: function()
    {
        switch (this._selection.type()) {
        case WebInspector.TimelineSelection.Type.Record:
            var record = /** @type {!WebInspector.TimelineModel.Record} */ (this._selection.object());
            var event = record.traceEvent();
            WebInspector.TimelineUIUtils.buildTraceEventDetails(event, this._model, this._detailsLinkifier, this._appendDetailsTabsForTraceEventAndShowDetails.bind(this, event));
            break;
        case WebInspector.TimelineSelection.Type.TraceEvent:
            var event = /** @type {!WebInspector.TracingModel.Event} */ (this._selection.object());
            WebInspector.TimelineUIUtils.buildTraceEventDetails(event, this._model, this._detailsLinkifier, this._appendDetailsTabsForTraceEventAndShowDetails.bind(this, event));
            break;
        case WebInspector.TimelineSelection.Type.Frame:
            var frame = /** @type {!WebInspector.TimelineFrame} */ (this._selection.object());
            if (!this._filmStripModel)
                this._filmStripModel = new WebInspector.FilmStripModel(this._tracingModel);
            var screenshotTime = frame.idle ? frame.startTime : frame.endTime; // For idle frames, look at the state at the beginning of the frame.
            var filmStripFrame = this._filmStripModel && this._filmStripModel.frameByTimestamp(screenshotTime);
            if (filmStripFrame && filmStripFrame.timestamp - frame.endTime > 10)
                filmStripFrame = null;
            this.showInDetails(WebInspector.TimelineUIUtils.generateDetailsContentForFrame(this._lazyFrameModel, frame, filmStripFrame));
            if (frame.layerTree) {
                var layersView = this._layersView();
                layersView.showLayerTree(frame.layerTree, frame.paints);
                if (!this._detailsView.hasTab(WebInspector.TimelinePanel.DetailsTab.LayerViewer))
                    this._detailsView.appendTab(WebInspector.TimelinePanel.DetailsTab.LayerViewer, WebInspector.UIString("Layers"), layersView);
            }
            break;
        case WebInspector.TimelineSelection.Type.NetworkRequest:
            var request = /** @type {!WebInspector.TimelineModel.NetworkRequest} */ (this._selection.object());
            WebInspector.TimelineUIUtils.buildNetworkRequestDetails(request, this._model, this._detailsLinkifier)
                .then(this.showInDetails.bind(this));
            break;
        case WebInspector.TimelineSelection.Type.Range:
            this._updateSelectedRangeStats(this._selection._startTime, this._selection._endTime);
            break;
        }

        this._detailsView.updateContents(this._selection);
    },

    /**
     * @param {!WebInspector.TimelineSelection} selection
     * @return {?WebInspector.TimelineFrame}
     */
    _frameForSelection: function(selection)
    {
        switch (selection.type()) {
        case WebInspector.TimelineSelection.Type.Frame:
            return /** @type {!WebInspector.TimelineFrame} */ (selection.object());
        case WebInspector.TimelineSelection.Type.Range:
            return null;
        case WebInspector.TimelineSelection.Type.Record:
        case WebInspector.TimelineSelection.Type.TraceEvent:
            return this._frameModel().filteredFrames(selection._endTime, selection._endTime)[0];
        default:
            console.assert(false, "Should never be reached");
            return null;
        }
    },

    /**
     * @param {number} offset
     */
    _jumpToFrame: function(offset)
    {
        var currentFrame = this._frameForSelection(this._selection);
        if (!currentFrame)
            return;
        var frames = this._frameModel().frames();
        var index = frames.indexOf(currentFrame);
        console.assert(index >= 0, "Can't find current frame in the frame list");
        index = Number.constrain(index + offset, 0, frames.length - 1);
        var frame = frames[index];
        this._revealTimeRange(frame.startTime, frame.endTime);
        this.select(WebInspector.TimelineSelection.fromFrame(frame));
        return true;
    },

    /**
     * @param {!WebInspector.TracingModel.Event} event
     * @param {!Node} content
     */
    _appendDetailsTabsForTraceEventAndShowDetails: function(event, content)
    {
        this.showInDetails(content);
        if (event.name === WebInspector.TimelineModel.RecordType.Paint || event.name === WebInspector.TimelineModel.RecordType.RasterTask)
            this._showEventInPaintProfiler(event);
    },

    /**
     * @param {!WebInspector.TracingModel.Event} event
     * @param {boolean=} isCloseable
     */
    _showEventInPaintProfiler: function(event, isCloseable)
    {
        var target = this._model.target();
        if (!target)
            return;
        var paintProfilerView = this._paintProfilerView();
        var hasProfileData = paintProfilerView.setEvent(target, event);
        if (!hasProfileData)
            return;
        if (!this._detailsView.hasTab(WebInspector.TimelinePanel.DetailsTab.PaintProfiler))
            this._detailsView.appendTab(WebInspector.TimelinePanel.DetailsTab.PaintProfiler, WebInspector.UIString("Paint Profiler"), paintProfilerView, undefined, undefined, isCloseable);
    },

    /**
     * @param {!WebInspector.TimelineModel.Record} record
     * @param {number} startTime
     * @param {number} endTime
     * @param {!Object} aggregatedStats
     */
    _collectAggregatedStatsForRecord: function(record, startTime, endTime, aggregatedStats)
    {
        var records = [];

        if (!record.endTime() || record.endTime() < startTime || record.startTime() > endTime)
            return;

        var childrenTime = 0;
        var children = record.children() || [];
        for (var i = 0; i < children.length; ++i) {
            var child = children[i];
            if (!child.endTime() || child.endTime() < startTime || child.startTime() > endTime)
                continue;
            childrenTime += Math.min(endTime, child.endTime()) - Math.max(startTime, child.startTime());
            this._collectAggregatedStatsForRecord(child, startTime, endTime, aggregatedStats);
        }
        var categoryName = WebInspector.TimelineUIUtils.categoryForRecord(record).name;
        var ownTime = Math.min(endTime, record.endTime()) - Math.max(startTime, record.startTime()) - childrenTime;
        aggregatedStats[categoryName] = (aggregatedStats[categoryName] || 0) + ownTime;
    },

    /**
     * @param {number} startTime
     * @param {number} endTime
     */
    _updateSelectedRangeStats: function(startTime, endTime)
    {
        // Return early in case 0 selection window.
        if (startTime < 0)
            return;

        var aggregatedStats = {};

        /**
         * @param {number} value
         * @param {!WebInspector.TimelineModel.Record} task
         * @return {number}
         */
        function compareEndTime(value, task)
        {
            return value < task.endTime() ? -1 : 1;
        }
        var mainThreadTasks = this._model.mainThreadTasks();
        var taskIndex = insertionIndexForObjectInListSortedByFunction(startTime, mainThreadTasks, compareEndTime);
        for (; taskIndex < mainThreadTasks.length; ++taskIndex) {
            var task = mainThreadTasks[taskIndex];
            if (task.startTime() > endTime)
                break;
            if (task.startTime() > startTime && task.endTime() < endTime) {
                // cache stats for top-level entries that fit the range entirely.
                var taskStats = task[WebInspector.TimelinePanel._aggregatedStatsKey];
                if (!taskStats) {
                    taskStats = {};
                    this._collectAggregatedStatsForRecord(task, startTime, endTime, taskStats);
                    task[WebInspector.TimelinePanel._aggregatedStatsKey] = taskStats;
                }
                for (var key in taskStats)
                    aggregatedStats[key] = (aggregatedStats[key] || 0) + taskStats[key];
                continue;
            }
            this._collectAggregatedStatsForRecord(task, startTime, endTime, aggregatedStats);
        }

        var aggregatedTotal = 0;
        for (var categoryName in aggregatedStats)
            aggregatedTotal += aggregatedStats[categoryName];
        aggregatedStats["idle"] = Math.max(0, endTime - startTime - aggregatedTotal);

        var contentHelper = new WebInspector.TimelineDetailsContentHelper(null, null, null, true);
        var pieChart = WebInspector.TimelineUIUtils.generatePieChart(aggregatedStats);

        var startOffset = startTime - this._model.minimumRecordTime();
        var endOffset = endTime - this._model.minimumRecordTime();
        contentHelper.appendTextRow(WebInspector.UIString("Range"), WebInspector.UIString("%s \u2013 %s", Number.millisToString(startOffset), Number.millisToString(endOffset)));
        contentHelper.appendElementRow(WebInspector.UIString("Aggregated Time"), pieChart);

        this.showInDetails(contentHelper.element);
    },

    /**
     * @override
     * @param {?WebInspector.TimelineSelection} selection
     * @param {!WebInspector.TimelinePanel.DetailsTab=} preferredTab
     */
    select: function(selection, preferredTab)
    {
        if (!selection)
            selection = WebInspector.TimelineSelection.fromRange(this._windowStartTime, this._windowEndTime);
        this._selection = selection;
        this._detailsLinkifier.reset();
        if (preferredTab)
            this._detailsView.setPreferredTab(preferredTab);

        for (var i = 0; i < this._currentViews.length; ++i) {
            var view = this._currentViews[i];
            view.setSelection(selection);
        }
        this._updateSelectionDetails();
    },

    /**
     * @param {number} startTime
     * @param {number} endTime
     */
    _revealTimeRange: function(startTime, endTime)
    {
        var timeShift = 0;
        if (this._windowEndTime < endTime)
            timeShift = endTime - this._windowEndTime;
        else if (this._windowStartTime > startTime)
            timeShift = startTime - this._windowStartTime;
        if (timeShift)
            this.requestWindowTimes(this._windowStartTime + timeShift, this._windowEndTime + timeShift);
    },

    /**
     * @override
     * @param {!WebInspector.TimelineModel.Record} record
     */
    showNestedRecordDetails: function(record)
    {
        var event = record.traceEvent();
        this._showEventInPaintProfiler(event, true);
        this._detailsView.selectTab(WebInspector.TimelinePanel.DetailsTab.PaintProfiler, true);
    },

    /**
     * @override
     * @param {!Node} node
     */
    showInDetails: function(node)
    {
        this._detailsView.setContent(node);
    },

    /**
     * @param {!DataTransfer} dataTransfer
     */
    _handleDrop: function(dataTransfer)
    {
        var items = dataTransfer.items;
        if (!items.length)
            return;
        var item = items[0];
        if (item.kind === "string") {
            var url = dataTransfer.getData("text/uri-list");
            if (new WebInspector.ParsedURL(url).isValid)
                this._loadFromURL(url);
        } else if (item.kind === "file") {
            var entry = items[0].webkitGetAsEntry();
            if (!entry.isFile)
                return;
            entry.file(this._loadFromFile.bind(this));
        }
    },

    __proto__: WebInspector.Panel.prototype
}

/**
 * @constructor
 * @extends {WebInspector.VBox}
 * @implements {WebInspector.TimelineModeView}
 * @param {!WebInspector.TimelineModeViewDelegate} delegate
 * @param {!WebInspector.TimelineModel} model
 */
WebInspector.TimelineTreeModeView = function(delegate, model)
{
    WebInspector.VBox.call(this);
    this._treeView = new WebInspector.TimelineTreeView(model);
    this._treeView.show(this.element);
}

WebInspector.TimelineTreeModeView.prototype = {
    /**
     * @override
     */
    dispose: function()
    {
    },

    /**
     * @override
     */
    highlightSearchResult: function()
    {
    },

    /**
     * @override
     */
    refreshRecords: function()
    {
    },

    /**
     * @override
     */
    reset: function()
    {
    },

    /**
     * @override
     */
    setSelection: function()
    {
    },

    /**
     * @override
     */
    setSidebarSize: function()
    {
    },

    /**
     * @override
     * @param {number} startTime
     * @param {number} endTime
     */
    setWindowTimes: function(startTime, endTime)
    {
        this._treeView.setRange(startTime, endTime);
    },

    /**
     * @override
     * @return {!WebInspector.Widget}
     */
    view: function()
    {
        return this;
    },

    __proto__: WebInspector.VBox.prototype
}

/**
 * @constructor
 * @extends {WebInspector.TabbedPane}
 * @param {!WebInspector.TimelineModel} timelineModel
 */
WebInspector.TimelineDetailsView = function(timelineModel)
{
    WebInspector.TabbedPane.call(this);
    this.element.classList.add("timeline-details");

    this._defaultDetailsWidget = new WebInspector.VBox();
    this._defaultDetailsWidget.element.classList.add("timeline-details-view");
    this._defaultDetailsContentElement = this._defaultDetailsWidget.element.createChild("div", "timeline-details-view-body vbox");
    this.appendTab(WebInspector.TimelinePanel.DetailsTab.Details, WebInspector.UIString("Summary"), this._defaultDetailsWidget);
    this.setPreferredTab(WebInspector.TimelinePanel.DetailsTab.Details);

    if (!Runtime.experiments.isEnabled("multipleTimelineViews")) {
        this._heavyTreeView = new WebInspector.TimelineTreeView(timelineModel);
        this.appendTab(WebInspector.TimelinePanel.DetailsTab.BottomUpTree, WebInspector.UIString("Aggregated Details"), this._heavyTreeView);
    }

    this._staticTabs = new Set([
        WebInspector.TimelinePanel.DetailsTab.Details,
        WebInspector.TimelinePanel.DetailsTab.BottomUpTree
    ]);

    this.addEventListener(WebInspector.TabbedPane.EventTypes.TabSelected, this._tabSelected, this);
}

WebInspector.TimelineDetailsView.prototype = {
    /**
     * @param {!Node} node
     */
    setContent: function(node)
    {
        var allTabs = this.allTabs();
        for (var i = 0; i < allTabs.length; ++i) {
            var tabId = allTabs[i].id;
            if (this._staticTabs.has(tabId))
                this.closeTab(tabId);
        }
        this._defaultDetailsContentElement.removeChildren();
        this._defaultDetailsContentElement.appendChild(node);
    },

    /**
     * @param {!WebInspector.TimelineSelection} selection
     */
    updateContents: function(selection)
    {
        this._selection = selection;
        if (this.selectedTabId === WebInspector.TimelinePanel.DetailsTab.BottomUpTree && this._heavyTreeView)
            this._heavyTreeView.updateContents(selection);
    },

    /**
     * @override
     * @param {string} id
     * @param {string} tabTitle
     * @param {!WebInspector.Widget} view
     * @param {string=} tabTooltip
     * @param {boolean=} userGesture
     * @param {boolean=} isCloseable
     */
    appendTab: function(id, tabTitle, view, tabTooltip, userGesture, isCloseable)
    {
        WebInspector.TabbedPane.prototype.appendTab.call(this, id, tabTitle, view, tabTooltip, userGesture, isCloseable);
        if (this._preferredTabId !== this.selectedTabId)
            this.selectTab(id);
    },

    /**
     * @param {string} tabId
     */
    setPreferredTab: function(tabId)
    {
        this._preferredTabId = tabId;
    },

    /**
     * @param {!WebInspector.Event} event
     */
    _tabSelected: function(event)
    {
        if (!event.data.isUserGesture)
            return;
        this.setPreferredTab(event.data.tabId);
        this.updateContents(this._selection);
    },

    __proto__: WebInspector.TabbedPane.prototype
}

/**
 * @constructor
 * @param {!WebInspector.TimelineSelection.Type} type
 * @param {number} startTime
 * @param {number} endTime
 * @param {!Object=} object
 */
WebInspector.TimelineSelection = function(type, startTime, endTime, object)
{
    this._type = type;
    this._startTime = startTime;
    this._endTime = endTime;
    this._object = object || null;
}

/**
 * @enum {string}
 */
WebInspector.TimelineSelection.Type = {
    Record: "Record",
    Frame: "Frame",
    NetworkRequest: "NetworkRequest",
    TraceEvent: "TraceEvent",
    Range: "Range"
};

/**
 * @param {!WebInspector.TimelineModel.Record} record
 * @return {!WebInspector.TimelineSelection}
 */
WebInspector.TimelineSelection.fromRecord = function(record)
{
    return new WebInspector.TimelineSelection(
        WebInspector.TimelineSelection.Type.Record,
        record.startTime(), record.endTime(),
        record);
}

/**
 * @param {!WebInspector.TimelineFrame} frame
 * @return {!WebInspector.TimelineSelection}
 */
WebInspector.TimelineSelection.fromFrame = function(frame)
{
    return new WebInspector.TimelineSelection(
        WebInspector.TimelineSelection.Type.Frame,
        frame.startTime, frame.endTime,
        frame);
}

/**
 * @param {!WebInspector.TimelineModel.NetworkRequest} request
 * @return {!WebInspector.TimelineSelection}
 */
WebInspector.TimelineSelection.fromNetworkRequest = function(request)
{
    return new WebInspector.TimelineSelection(
        WebInspector.TimelineSelection.Type.NetworkRequest,
        request.startTime, request.endTime || request.startTime,
        request);
}

/**
 * @param {!WebInspector.TracingModel.Event} event
 * @return {!WebInspector.TimelineSelection}
 */
WebInspector.TimelineSelection.fromTraceEvent = function(event)
{
    return new WebInspector.TimelineSelection(
        WebInspector.TimelineSelection.Type.TraceEvent,
        event.startTime, event.endTime || (event.startTime + 1),
        event);
}

/**
 * @param {number} startTime
 * @param {number} endTime
 * @return {!WebInspector.TimelineSelection}
 */
WebInspector.TimelineSelection.fromRange = function(startTime, endTime)
{
    return new WebInspector.TimelineSelection(
        WebInspector.TimelineSelection.Type.Range,
        startTime, endTime);
}

WebInspector.TimelineSelection.prototype = {
    /**
     * @return {!WebInspector.TimelineSelection.Type}
     */
    type: function()
    {
        return this._type;
    },

    /**
     * @return {?Object}
     */
    object: function()
    {
        return this._object;
    },

    /**
     * @return {number}
     */
    startTime: function()
    {
        return this._startTime;
    },

    /**
     * @return {number}
     */
    endTime: function()
    {
        return this._endTime;
    }
};

/**
 * @interface
 * @extends {WebInspector.EventTarget}
 */
WebInspector.TimelineModeView = function()
{
}

WebInspector.TimelineModeView.prototype = {
    /**
     * @return {!WebInspector.Widget}
     */
    view: function() {},

    dispose: function() {},

    reset: function() {},

    /**
     * @param {?RegExp} textFilter
     */
    refreshRecords: function(textFilter) {},

    /**
     * @param {?WebInspector.TimelineModel.Record} record
     * @param {string=} regex
     * @param {boolean=} selectRecord
     */
    highlightSearchResult: function(record, regex, selectRecord) {},

    /**
     * @param {number} startTime
     * @param {number} endTime
     */
    setWindowTimes: function(startTime, endTime) {},

    /**
     * @param {number} width
     */
    setSidebarSize: function(width) {},

    /**
     * @param {?WebInspector.TimelineSelection} selection
     */
    setSelection: function(selection) {},
}

/**
 * @interface
 */
WebInspector.TimelineModeViewDelegate = function() {}

WebInspector.TimelineModeViewDelegate.prototype = {
    /**
     * @param {number} startTime
     * @param {number} endTime
     */
    requestWindowTimes: function(startTime, endTime) {},

    /**
     * @param {?WebInspector.TimelineSelection} selection
     * @param {!WebInspector.TimelinePanel.DetailsTab=} preferredTab
     */
    select: function(selection, preferredTab) {},

    /**
     * @param {!WebInspector.TimelineModel.Record} record
     */
    showNestedRecordDetails: function(record) {},

    /**
     * @param {!Node} node
     */
    showInDetails: function(node) {},
}

/**
 * @constructor
 * @extends {WebInspector.TimelineModel.Filter}
 */
WebInspector.TimelineCategoryFilter = function()
{
    WebInspector.TimelineModel.Filter.call(this);
}

WebInspector.TimelineCategoryFilter.prototype = {
    /**
     * @override
     * @param {!WebInspector.TracingModel.Event} event
     * @return {boolean}
     */
    accept: function(event)
    {
        return !WebInspector.TimelineUIUtils.eventStyle(event).category.hidden;
    },

    __proto__: WebInspector.TimelineModel.Filter.prototype
}

/**
 * @constructor
 * @extends {WebInspector.TimelineModel.Filter}
 */
WebInspector.TimelineIsLongFilter = function()
{
    WebInspector.TimelineModel.Filter.call(this);
    this._minimumRecordDuration = 0;
}

WebInspector.TimelineIsLongFilter.prototype = {
    /**
     * @param {number} value
     */
    setMinimumRecordDuration: function(value)
    {
        this._minimumRecordDuration = value;
        this.notifyFilterChanged();
    },

    /**
     * @override
     * @param {!WebInspector.TracingModel.Event} event
     * @return {boolean}
     */
    accept: function(event)
    {
        var duration = event.endTime ? event.endTime - event.startTime : 0;
        return duration >= this._minimumRecordDuration;
    },

    __proto__: WebInspector.TimelineModel.Filter.prototype

}

/**
 * @constructor
 * @extends {WebInspector.TimelineModel.Filter}
 */
WebInspector.TimelineTextFilter = function()
{
    WebInspector.TimelineModel.Filter.call(this);
}

WebInspector.TimelineTextFilter.prototype = {
    /**
     * @return {boolean}
     */
    isEmpty: function()
    {
        return !this._regex;
    },

    /**
     * @param {?RegExp} regex
     */
    setRegex: function(regex)
    {
        this._regex = regex;
        this.notifyFilterChanged();
    },

    /**
     * @override
     * @param {!WebInspector.TracingModel.Event} event
     * @return {boolean}
     */
    accept: function(event)
    {
        return !this._regex || WebInspector.TimelineUIUtils.testContentMatching(event, this._regex);
    },

    __proto__: WebInspector.TimelineModel.Filter.prototype
}

/**
 * @constructor
 * @extends {WebInspector.TimelineModel.Filter}
 */
WebInspector.TimelineStaticFilter = function()
{
    WebInspector.TimelineModel.Filter.call(this);
}

WebInspector.TimelineStaticFilter.prototype = {
    /**
     * @override
     * @param {!WebInspector.TracingModel.Event} event
     * @return {boolean}
     */
    accept: function(event)
    {
        switch (event.name) {
        case WebInspector.TimelineModel.RecordType.EventDispatch:
            return event.hasChildren;
        case WebInspector.TimelineModel.RecordType.JSFrame:
            return false;
        default:
            return true;
        }
    },

    __proto__: WebInspector.TimelineModel.Filter.prototype
}

/**
 * @constructor
 * @extends {WebInspector.DialogDelegate}
 */
WebInspector.TimelinePanel.StatusDialog = function()
{
    WebInspector.DialogDelegate.call(this);
    var shadowRoot = WebInspector.createShadowRootWithCoreStyles(this.element);
    shadowRoot.appendChild(WebInspector.Widget.createStyleElement("timeline/timelineStatusDialog.css"));
    this._contentElement = shadowRoot.createChild("div", "timeline-status-dialog");
    this._contentElement.createChild("div", "title").textContent = WebInspector.UIString("Recording Timeline");
    this._status = this._contentElement.createChild("div", "status");
    this._time = this._contentElement.createChild("div", "time");
    this._bufferUsage = this._contentElement.createChild("div", "buffer-usage").createChild("div", "indicator-container").createChild("div", "indicator");
    this._stopButton = createTextButton(WebInspector.UIString("Finish"), this._onFinish.bind(this));
    this._contentElement.createChild("div", "stop-button").appendChild(this._stopButton);
    this._finishKeys = new Set([
        WebInspector.KeyboardShortcut.makeDescriptor(WebInspector.KeyboardShortcut.Keys.Space).key,
        WebInspector.KeyboardShortcut.makeDescriptor(WebInspector.KeyboardShortcut.Keys.Enter).key,
        WebInspector.ShortcutsScreen.TimelinePanelShortcuts.StartStopRecording[0].key
    ]);
}

WebInspector.TimelinePanel.StatusDialog.Events = {
    Finish: "Finish"
}

WebInspector.TimelinePanel.StatusDialog.prototype = {
    /**
     * @override
     */
    willHide: function()
    {
        this._stopTimer();
    },

    finish: function()
    {
        this._stopButton.disabled = true;
        this._stopTimer();
    },

    hide: function()
    {
        WebInspector.Dialog.hide();
    },

    /**
     * @param {string} text
     */
    updateStatus: function(text)
    {
        this._status.textContent = text;
    },

    /**
     * @param {number} percent
     */
    updateBufferUsage: function(percent)
    {
        this._bufferUsage.style.width = percent.toFixed(1) + "%";
        this._updateTimer();
    },

    /**
     * @override
     * @param {!KeyboardEvent} event
     */
    onKeyDown: function(event)
    {
        var key = WebInspector.KeyboardShortcut.makeKeyFromEvent(event);
        if (this._finishKeys.has(key))
            this._onFinish();
        event.consume();
    },

    _onFinish: function()
    {
        this.dispatchEventToListeners(WebInspector.TimelinePanel.StatusDialog.Events.Finish);
    },

    startTimer: function()
    {
        this._startTime = Date.now();
        this._timeUpdateTimer = setInterval(this._updateTimer.bind(this, false), 1000);
    },

    _stopTimer: function()
    {
        if (!this._timeUpdateTimer)
            return;
        clearInterval(this._timeUpdateTimer);
        this._updateTimer(true);
        delete this._timeUpdateTimer;
    },

    /**
     * @param {boolean=} precise
     */
    _updateTimer: function(precise)
    {
        var elapsed = (Date.now() - this._startTime) / 1000;
        this._time.textContent = WebInspector.UIString("%s\u2009sec", elapsed.toFixed(precise ? 1 : 0));
    },

    __proto__: WebInspector.DialogDelegate.prototype
}

WebInspector.TimelinePanel.show = function()
{
    WebInspector.inspectorView.setCurrentPanel(WebInspector.TimelinePanel.instance());
}

/**
 * @return {!WebInspector.TimelinePanel}
 */
WebInspector.TimelinePanel.instance = function()
{
    if (!WebInspector.TimelinePanel._instanceObject)
        WebInspector.TimelinePanel._instanceObject = new WebInspector.TimelinePanel();
    return WebInspector.TimelinePanel._instanceObject;
}

/**
 * @constructor
 * @implements {WebInspector.PanelFactory}
 */
WebInspector.TimelinePanelFactory = function()
{
}

WebInspector.TimelinePanelFactory.prototype = {
    /**
     * @override
     * @return {!WebInspector.Panel}
     */
    createPanel: function()
    {
        return WebInspector.TimelinePanel.instance();
    }
}

/**
 * @constructor
 * @implements {WebInspector.QueryParamHandler}
 */
WebInspector.LoadTimelineHandler = function()
{
}

WebInspector.LoadTimelineHandler.prototype = {
    /**
     * @override
     * @param {string} value
     */
    handleQueryParam: function(value)
    {
        WebInspector.TimelinePanel.show();
        WebInspector.TimelinePanel.instance()._loadFromURL(value);
    }
}

/**
 * @constructor
 * @implements {WebInspector.ActionDelegate}
 */
WebInspector.TimelinePanel.RecordActionDelegate = function()
{
}

WebInspector.TimelinePanel.RecordActionDelegate.prototype = {
    /**
     * @override
     * @param {!WebInspector.Context} context
     * @param {string} actionId
     */
    handleAction: function(context, actionId)
    {
        var panel = WebInspector.context.flavor(WebInspector.TimelinePanel);
        console.assert(panel && panel instanceof WebInspector.TimelinePanel);
        panel._toggleTimelineButtonClicked();
    }
}
