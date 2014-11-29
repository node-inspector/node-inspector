/*
 * Copyright (C) 2013 Google Inc. All rights reserved.
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
 * @extends {WebInspector.HBox}
 * @implements {WebInspector.TimelineModeView}
 * @param {!WebInspector.TimelineModeViewDelegate} delegate
 * @param {!WebInspector.TimelineModel} model
 */
WebInspector.TimelineView = function(delegate, model)
{
    WebInspector.HBox.call(this);
    this.element.classList.add("timeline-view");

    this._delegate = delegate;
    this._model = model;
    this._presentationModel = new WebInspector.TimelinePresentationModel(model);
    this._calculator = new WebInspector.TimelineCalculator(model);
    this._linkifier = new WebInspector.Linkifier();
    this._frameStripByFrame = new Map();

    this._boundariesAreValid = true;
    this._scrollTop = 0;

    this._recordsView = this._createRecordsView();
    this._recordsView.addEventListener(WebInspector.SplitView.Events.SidebarSizeChanged, this._sidebarResized, this);
    this._recordsView.show(this.element);
    this._headerElement = this.element.createChild("div", "fill");
    this._headerElement.id = "timeline-graph-records-header";

    // Create gpu tasks containers.
    this._cpuBarsElement = this._headerElement.createChild("div", "timeline-utilization-strip");
    if (Runtime.experiments.isEnabled("gpuTimeline"))
        this._gpuBarsElement = this._headerElement.createChild("div", "timeline-utilization-strip gpu");

    this._popoverHelper = new WebInspector.PopoverHelper(this.element, this._getPopoverAnchor.bind(this), this._showPopover.bind(this));

    this.element.addEventListener("mousemove", this._mouseMove.bind(this), false);
    this.element.addEventListener("mouseleave", this._mouseLeave.bind(this), false);
    this.element.addEventListener("keydown", this._keyDown.bind(this), false);

    this._expandOffset = 15;
}

WebInspector.TimelineView.prototype = {
    /**
     * @param {?WebInspector.TimelineFrameModelBase} frameModel
     */
    setFrameModel: function(frameModel)
    {
        this._frameModel = frameModel;
    },

    /**
     * @return {!WebInspector.SplitView}
     */
    _createRecordsView: function()
    {
        var recordsView = new WebInspector.SplitView(true, false, "timelinePanelRecorsSplitViewState");
        this._containerElement = recordsView.element;
        this._containerElement.tabIndex = 0;
        this._containerElement.id = "timeline-container";
        this._containerElement.addEventListener("scroll", this._onScroll.bind(this), false);

        // Create records list in the records sidebar.
        var sidebarView = new WebInspector.VBox();
        sidebarView.element.createChild("div", "timeline-records-title").textContent = WebInspector.UIString("RECORDS");
        recordsView.setSidebarView(sidebarView);
        this._sidebarListElement = sidebarView.element.createChild("div", "timeline-records-list");

        // Create grid in the records main area.
        this._gridContainer = new WebInspector.VBoxWithResizeCallback(this._onViewportResize.bind(this));
        this._gridContainer.element.id = "resources-container-content";
        recordsView.setMainView(this._gridContainer);
        this._timelineGrid = new WebInspector.TimelineGrid();
        this._gridContainer.element.appendChild(this._timelineGrid.element);

        this._itemsGraphsElement = this._gridContainer.element.createChild("div");
        this._itemsGraphsElement.id = "timeline-graphs";

        // Create gap elements
        this._topGapElement = this._itemsGraphsElement.createChild("div", "timeline-gap");
        this._graphRowsElement = this._itemsGraphsElement.createChild("div");
        this._bottomGapElement = this._itemsGraphsElement.createChild("div", "timeline-gap");
        this._expandElements = this._itemsGraphsElement.createChild("div");
        this._expandElements.id = "orphan-expand-elements";

        return recordsView;
    },

    _rootRecord: function()
    {
        return this._presentationModel.rootRecord();
    },

    _updateEventDividers: function()
    {
        this._timelineGrid.removeEventDividers();
        var clientWidth = this._graphRowsElementWidth;
        var dividers = [];
        var eventDividerRecords = this._model.eventDividerRecords();

        for (var i = 0; i < eventDividerRecords.length; ++i) {
            var record = eventDividerRecords[i];
            var position = this._calculator.computePosition(record.startTime());
            var dividerPosition = Math.round(position);
            if (dividerPosition < 0 || dividerPosition >= clientWidth || dividers[dividerPosition])
                continue;
            var title = WebInspector.TimelineUIUtils.titleForRecord(record);
            var divider = WebInspector.TimelineUIUtils.createEventDivider(record.type(), title);
            divider.style.left = dividerPosition + "px";
            dividers[dividerPosition] = divider;
        }
        this._timelineGrid.addEventDividers(dividers);
    },

    _updateFrameBars: function(frames)
    {
        var clientWidth = this._graphRowsElementWidth;
        if (this._frameContainer) {
            this._frameContainer.removeChildren();
        } else {
            const frameContainerBorderWidth = 1;
            this._frameContainer = createElementWithClass("div", "fill timeline-frame-container");
            this._frameContainer.style.height = WebInspector.TimelinePanel.rowHeight + frameContainerBorderWidth + "px";
            this._frameContainer.addEventListener("dblclick", this._onFrameDoubleClicked.bind(this), false);
            this._frameContainer.addEventListener("click", this._onFrameClicked.bind(this), false);
        }
        this._frameStripByFrame.clear();

        var dividers = [];

        for (var i = 0; i < frames.length; ++i) {
            var frame = frames[i];
            var frameStart = this._calculator.computePosition(frame.startTime);
            var frameEnd = this._calculator.computePosition(frame.endTime);

            var frameStrip = createElementWithClass("div", "timeline-frame-strip");
            var actualStart = Math.max(frameStart, 0);
            var width = frameEnd - actualStart;
            frameStrip.style.left = actualStart + "px";
            frameStrip.style.width = width + "px";
            frameStrip._frame = frame;
            this._frameStripByFrame.set(frame, frameStrip);

            const minWidthForFrameInfo = 60;
            if (width > minWidthForFrameInfo)
                frameStrip.textContent = Number.millisToString(frame.endTime - frame.startTime, true);

            this._frameContainer.appendChild(frameStrip);

            if (actualStart > 0) {
                var frameMarker = WebInspector.TimelineUIUtils.createEventDivider(WebInspector.TimelineModel.RecordType.BeginFrame);
                frameMarker.style.left = frameStart + "px";
                dividers.push(frameMarker);
            }
        }
        this._timelineGrid.addEventDividers(dividers);
        this._headerElement.appendChild(this._frameContainer);
    },

    _onFrameDoubleClicked: function(event)
    {
        var frameBar = event.target.enclosingNodeOrSelfWithClass("timeline-frame-strip");
        if (!frameBar)
            return;
        this._delegate.requestWindowTimes(frameBar._frame.startTime, frameBar._frame.endTime);
    },

    _onFrameClicked: function(event)
    {
        var frameBar = event.target.enclosingNodeOrSelfWithClass("timeline-frame-strip");
        if (!frameBar)
            return;
        this._delegate.select(WebInspector.TimelineSelection.fromFrame(frameBar._frame));
    },

    /**
     * @param {number} width
     */
    setSidebarSize: function(width)
    {
        this._recordsView.setSidebarSize(width);
    },

    /**
     * @param {!WebInspector.Event} event
     */
    _sidebarResized: function(event)
    {
        this.dispatchEventToListeners(WebInspector.SplitView.Events.SidebarSizeChanged, event.data);
    },

    _onViewportResize: function()
    {
        this._resize(this._recordsView.sidebarSize());
    },

    /**
     * @param {number} sidebarWidth
     */
    _resize: function(sidebarWidth)
    {
        this._closeRecordDetails();
        this._graphRowsElementWidth = this._graphRowsElement.offsetWidth;
        this._headerElement.style.left = sidebarWidth + "px";
        this._headerElement.style.width = this._itemsGraphsElement.offsetWidth + "px";
        this._scheduleRefresh(false, true);
    },

    _resetView: function()
    {
        this._windowStartTime = 0;
        this._windowEndTime = 0;
        this._boundariesAreValid = false;
        this._adjustScrollPosition(0);
        this._linkifier.reset();
        this._closeRecordDetails();
        this._automaticallySizeWindow = true;
        this._presentationModel.reset();
    },


    /**
     * @return {!WebInspector.View}
     */
    view: function()
    {
        return this;
    },

    dispose: function()
    {
    },

    reset: function()
    {
        this._resetView();
        this._invalidateAndScheduleRefresh(true, true);
    },

    /**
     * @return {!Array.<!Element>}
     */
    elementsToRestoreScrollPositionsFor: function()
    {
        return [this._containerElement];
    },

    /**
     * @param {?RegExp} textFilter
     */
    refreshRecords: function(textFilter)
    {
        this._automaticallySizeWindow = false;
        this._presentationModel.setTextFilter(textFilter);
        this._invalidateAndScheduleRefresh(false, true);
    },

    willHide: function()
    {
        this._closeRecordDetails();
        WebInspector.View.prototype.willHide.call(this);
    },

    wasShown: function()
    {
        this._presentationModel.refreshRecords();
        WebInspector.HBox.prototype.wasShown.call(this);
    },

    _onScroll: function(event)
    {
        this._closeRecordDetails();
        this._scrollTop = this._containerElement.scrollTop;
        var dividersTop = Math.max(0, this._scrollTop);
        this._timelineGrid.setScrollAndDividerTop(this._scrollTop, dividersTop);
        this._scheduleRefresh(true, true);
    },

    /**
     * @param {boolean} preserveBoundaries
     * @param {boolean} userGesture
     */
    _invalidateAndScheduleRefresh: function(preserveBoundaries, userGesture)
    {
        this._presentationModel.invalidateFilteredRecords();
        this._scheduleRefresh(preserveBoundaries, userGesture);
    },

    _clearSelection: function()
    {
        this._delegate.select(null);
    },

    /**
     * @param {?WebInspector.TimelinePresentationModel.Record} presentationRecord
     */
    _selectRecord: function(presentationRecord)
    {
        if (presentationRecord.coalesced()) {
            // Presentation record does not have model record to highlight.
            this._innerSetSelectedRecord(presentationRecord);
            var aggregatedStats = {};
            var presentationChildren = presentationRecord.presentationChildren();
            for (var i = 0; i < presentationChildren.length; ++i)
                WebInspector.TimelineUIUtils.aggregateTimeForRecord(aggregatedStats, presentationChildren[i].record());
            var idle = presentationRecord.endTime() - presentationRecord.startTime();
            for (var category in aggregatedStats)
                idle -= aggregatedStats[category];
            aggregatedStats["idle"] = idle;

            var contentHelper = new WebInspector.TimelineDetailsContentHelper(null, null, true);
            var pieChart = WebInspector.TimelineUIUtils.generatePieChart(aggregatedStats);
            var title = WebInspector.TimelineUIUtils.titleForRecord(presentationRecord.record());
            contentHelper.appendTextRow(WebInspector.UIString("Type"), title);
            contentHelper.appendElementRow(WebInspector.UIString("Aggregated Time"), pieChart);
            this._delegate.showInDetails(contentHelper.element);
            return;
        }
        this._delegate.select(WebInspector.TimelineSelection.fromRecord(presentationRecord.record()));
    },

    /**
     * @param {?WebInspector.TimelineSelection} selection
     */
    setSelection: function(selection)
    {
        if (!selection) {
            this._innerSetSelectedRecord(null);
            this._setSelectedFrame(null);
            return;
        }
        if (selection.type() === WebInspector.TimelineSelection.Type.Record) {
            var record = /** @type {!WebInspector.TimelineModel.Record} */ (selection.object());
            this._innerSetSelectedRecord(this._presentationModel.toPresentationRecord(record));
            this._setSelectedFrame(null);
        } else if (selection.type() === WebInspector.TimelineSelection.Type.Frame) {
            var frame = /** @type {!WebInspector.TimelineFrame} */ (selection.object());
            this._innerSetSelectedRecord(null);
            this._setSelectedFrame(frame);
        }
    },

    /**
     * @param {?WebInspector.TimelinePresentationModel.Record} presentationRecord
     */
    _innerSetSelectedRecord: function(presentationRecord)
    {
        if (presentationRecord === this._lastSelectedRecord)
            return;

        // Remove selection rendering.p
        if (this._lastSelectedRecord) {
            if (this._lastSelectedRecord.listRow())
                this._lastSelectedRecord.listRow().renderAsSelected(false);
            if (this._lastSelectedRecord.graphRow())
                this._lastSelectedRecord.graphRow().renderAsSelected(false);
        }

        this._lastSelectedRecord = presentationRecord;
        if (!presentationRecord)
            return;

        this._innerRevealRecord(presentationRecord);
        if (presentationRecord.listRow())
            presentationRecord.listRow().renderAsSelected(true);
        if (presentationRecord.graphRow())
            presentationRecord.graphRow().renderAsSelected(true);
    },

    /**
     * @param {?WebInspector.TimelineFrame} frame
     */
    _setSelectedFrame: function(frame)
    {
        if (this._lastSelectedFrame === frame)
            return;
        var oldStripElement = this._lastSelectedFrame && this._frameStripByFrame.get(this._lastSelectedFrame);
        if (oldStripElement)
            oldStripElement.classList.remove("selected");
        var newStripElement = frame && this._frameStripByFrame.get(frame);
        if (newStripElement)
            newStripElement.classList.add("selected");
        this._lastSelectedFrame = frame;
    },

    /**
     * @param {number} startTime
     * @param {number} endTime
     */
    setWindowTimes: function(startTime, endTime)
    {
        this._windowStartTime = startTime;
        this._windowEndTime = endTime;
        this._presentationModel.setWindowTimes(startTime, endTime);
        this._automaticallySizeWindow = false;
        this._invalidateAndScheduleRefresh(false, true);
        this._clearSelection();
    },

    /**
     * @param {boolean} preserveBoundaries
     * @param {boolean} userGesture
     */
    _scheduleRefresh: function(preserveBoundaries, userGesture)
    {
        this._closeRecordDetails();
        this._boundariesAreValid &= preserveBoundaries;

        if (!this.isShowing())
            return;

        if (preserveBoundaries || userGesture)
            this._refresh();
        else {
            if (!this._refreshTimeout)
                this._refreshTimeout = setTimeout(this._refresh.bind(this), 300);
        }
    },

    _refresh: function()
    {
        if (this._refreshTimeout) {
            clearTimeout(this._refreshTimeout);
            delete this._refreshTimeout;
        }
        var windowStartTime = this._windowStartTime || this._model.minimumRecordTime();
        var windowEndTime = this._windowEndTime || this._model.maximumRecordTime();
        this._timelinePaddingLeft = this._expandOffset;
        this._calculator.setWindow(windowStartTime, windowEndTime);
        this._calculator.setDisplayWindow(this._timelinePaddingLeft, this._graphRowsElementWidth);

        this._refreshRecords();
        if (!this._boundariesAreValid) {
            this._updateEventDividers();
            if (this._frameContainer)
                this._frameContainer.remove();
            if (this._frameModel) {
                var frames = this._frameModel.filteredFrames(windowStartTime, windowEndTime);
                const maxFramesForFrameBars = 30;
                if  (frames.length && frames.length < maxFramesForFrameBars) {
                    this._timelineGrid.removeDividers();
                    this._updateFrameBars(frames);
                } else {
                    this._timelineGrid.updateDividers(this._calculator);
                }
            } else
                this._timelineGrid.updateDividers(this._calculator);
            this._refreshAllUtilizationBars();
        }
        this._boundariesAreValid = true;
    },

    /**
     * @param {!WebInspector.TimelinePresentationModel.Record} recordToReveal
     */
    _innerRevealRecord: function(recordToReveal)
    {
        var needRefresh = false;
        // Expand all ancestors.
        for (var parent = recordToReveal.presentationParent(); parent !== this._rootRecord(); parent = parent.presentationParent()) {
            if (!parent.collapsed())
                continue;
            this._presentationModel.invalidateFilteredRecords();
            parent.setCollapsed(false);
            needRefresh = true;
        }
        var recordsInWindow = this._presentationModel.filteredRecords();
        var index = recordsInWindow.indexOf(recordToReveal);

        var itemOffset = index * WebInspector.TimelinePanel.rowHeight;
        var visibleTop = this._scrollTop - WebInspector.TimelinePanel.headerHeight;
        var visibleBottom = visibleTop + this._containerElementHeight - WebInspector.TimelinePanel.rowHeight;
        if (itemOffset < visibleTop)
            this._containerElement.scrollTop = itemOffset;
        else if (itemOffset > visibleBottom)
            this._containerElement.scrollTop = itemOffset - this._containerElementHeight + WebInspector.TimelinePanel.headerHeight + WebInspector.TimelinePanel.rowHeight;
        else if (needRefresh)
            this._refreshRecords();
    },

    _refreshRecords: function()
    {
        this._containerElementHeight = this._containerElement.clientHeight;
        var recordsInWindow = this._presentationModel.filteredRecords();

        // Calculate the visible area.
        var visibleTop = this._scrollTop;
        var visibleBottom = visibleTop + this._containerElementHeight;

        var rowHeight = WebInspector.TimelinePanel.rowHeight;
        var headerHeight = WebInspector.TimelinePanel.headerHeight;

        // Convert visible area to visible indexes. Always include top-level record for a visible nested record.
        var startIndex = Math.max(0, Math.min(Math.floor((visibleTop - headerHeight) / rowHeight), recordsInWindow.length - 1));
        var endIndex = Math.min(recordsInWindow.length, Math.ceil(visibleBottom / rowHeight));
        var lastVisibleLine = Math.max(0, Math.floor((visibleBottom - headerHeight) / rowHeight));
        if (this._automaticallySizeWindow && recordsInWindow.length > lastVisibleLine) {
            this._automaticallySizeWindow = false;
            this._clearSelection();
            // If we're at the top, always use real timeline start as a left window bound so that expansion arrow padding logic works.
            var windowStartTime = startIndex ? recordsInWindow[startIndex].startTime() : this._model.minimumRecordTime();
            var windowEndTime = recordsInWindow[Math.max(0, lastVisibleLine - 1)].endTime();
            this._delegate.requestWindowTimes(windowStartTime, windowEndTime);
            recordsInWindow = this._presentationModel.filteredRecords();
            endIndex = Math.min(recordsInWindow.length, lastVisibleLine);
        }

        // Resize gaps first.
        this._topGapElement.style.height = (startIndex * rowHeight) + "px";
        this._recordsView.sidebarView().element.firstElementChild.style.flexBasis = (startIndex * rowHeight + headerHeight) + "px";
        this._bottomGapElement.style.height = (recordsInWindow.length - endIndex) * rowHeight + "px";
        var rowsHeight = headerHeight + recordsInWindow.length * rowHeight;
        var totalHeight = Math.max(this._containerElementHeight, rowsHeight);

        this._recordsView.mainView().element.style.height = totalHeight + "px";
        this._recordsView.sidebarView().element.style.height = totalHeight + "px";
        this._recordsView.resizerElement().style.height = totalHeight + "px";

        // Update visible rows.
        var listRowElement = this._sidebarListElement.firstChild;
        var width = this._graphRowsElementWidth;
        this._itemsGraphsElement.removeChild(this._graphRowsElement);
        var graphRowElement = this._graphRowsElement.firstChild;
        var scheduleRefreshCallback = this._invalidateAndScheduleRefresh.bind(this, true, true);
        var selectRecordCallback = this._selectRecord.bind(this);
        this._itemsGraphsElement.removeChild(this._expandElements);
        this._expandElements.removeChildren();

        for (var i = 0; i < endIndex; ++i) {
            var record = recordsInWindow[i];

            if (i < startIndex) {
                var lastChildIndex = i + record.visibleChildrenCount();
                if (lastChildIndex >= startIndex && lastChildIndex < endIndex) {
                    var expandElement = new WebInspector.TimelineExpandableElement(this._expandElements);
                    var positions = this._calculator.computeBarGraphWindowPosition(record);
                    expandElement._update(record, i, positions.left - this._expandOffset, positions.width);
                }
            } else {
                if (!listRowElement) {
                    listRowElement = new WebInspector.TimelineRecordListRow(this._linkifier, this._model.target(), selectRecordCallback, scheduleRefreshCallback).element;
                    this._sidebarListElement.appendChild(listRowElement);
                }
                if (!graphRowElement) {
                    graphRowElement = new WebInspector.TimelineRecordGraphRow(this._itemsGraphsElement, selectRecordCallback, scheduleRefreshCallback).element;
                    this._graphRowsElement.appendChild(graphRowElement);
                }

                listRowElement.row.update(record, visibleTop);
                graphRowElement.row.update(record, this._calculator, this._expandOffset, i);
                if (this._lastSelectedRecord === record) {
                    listRowElement.row.renderAsSelected(true);
                    graphRowElement.row.renderAsSelected(true);
                }

                listRowElement = listRowElement.nextSibling;
                graphRowElement = graphRowElement.nextSibling;
            }
        }

        // Remove extra rows.
        while (listRowElement) {
            var nextElement = listRowElement.nextSibling;
            listRowElement.row.dispose();
            listRowElement = nextElement;
        }
        while (graphRowElement) {
            var nextElement = graphRowElement.nextSibling;
            graphRowElement.row.dispose();
            graphRowElement = nextElement;
        }

        this._itemsGraphsElement.insertBefore(this._graphRowsElement, this._bottomGapElement);
        this._itemsGraphsElement.appendChild(this._expandElements);
        this._adjustScrollPosition(recordsInWindow.length * rowHeight + headerHeight);

        return recordsInWindow.length;
    },

    _refreshAllUtilizationBars: function()
    {
        this._refreshUtilizationBars(WebInspector.UIString("CPU"), this._model.mainThreadTasks(), this._cpuBarsElement);
        if (Runtime.experiments.isEnabled("gpuTimeline"))
            this._refreshUtilizationBars(WebInspector.UIString("GPU"), this._model.gpuTasks(), this._gpuBarsElement);
    },

    /**
     * @param {string} name
     * @param {!Array.<!WebInspector.TimelineModel.Record>} tasks
     * @param {?Element} container
     */
    _refreshUtilizationBars: function(name, tasks, container)
    {
        if (!container)
            return;

        const barOffset = 3;
        const minGap = 3;

        var minWidth = WebInspector.TimelineCalculator._minWidth;
        var widthAdjustment = minWidth / 2;

        var width = this._graphRowsElementWidth;
        var boundarySpan = this._windowEndTime - this._windowStartTime;
        var scale = boundarySpan / (width - minWidth - this._timelinePaddingLeft);
        var startTime = (this._windowStartTime - this._timelinePaddingLeft * scale);
        var endTime = startTime + width * scale;

        /**
         * @param {number} value
         * @param {!WebInspector.TimelineModel.Record} task
         * @return {number}
         */
        function compareEndTime(value, task)
        {
            return value < task.endTime() ? -1 : 1;
        }

        var taskIndex = insertionIndexForObjectInListSortedByFunction(startTime, tasks, compareEndTime);

        var foreignStyle = "gpu-task-foreign";
        var element = /** @type {?Element} */ (container.firstChild);
        var lastElement;
        var lastLeft;
        var lastRight;

        for (; taskIndex < tasks.length; ++taskIndex) {
            var task = tasks[taskIndex];
            if (task.startTime() > endTime)
                break;

            var left = Math.max(0, this._calculator.computePosition(task.startTime()) + barOffset - widthAdjustment);
            var right = Math.min(width, this._calculator.computePosition(task.endTime() || 0) + barOffset + widthAdjustment);

            if (lastElement) {
                var gap = Math.floor(left) - Math.ceil(lastRight);
                if (gap < minGap) {
                    if (!task.data["foreign"])
                        lastElement.classList.remove(foreignStyle);
                    lastRight = right;
                    lastElement._tasksInfo.lastTaskIndex = taskIndex;
                    continue;
                }
                lastElement.style.width = (lastRight - lastLeft) + "px";
            }

            if (!element)
                element = container.createChild("div", "timeline-graph-bar");
            element.style.left = left + "px";
            element._tasksInfo = {name: name, tasks: tasks, firstTaskIndex: taskIndex, lastTaskIndex: taskIndex};
            if (task.data["foreign"])
                element.classList.add(foreignStyle);
            lastLeft = left;
            lastRight = right;
            lastElement = element;
            element = /** @type {?Element} */ (element.nextSibling);
        }

        if (lastElement)
            lastElement.style.width = (lastRight - lastLeft) + "px";

        while (element) {
            var nextElement = element.nextSibling;
            element._tasksInfo = null;
            container.removeChild(element);
            element = nextElement;
        }
    },

    _adjustScrollPosition: function(totalHeight)
    {
        // Prevent the container from being scrolled off the end.
        if ((this._scrollTop + this._containerElementHeight) > totalHeight + 1)
            this._containerElement.scrollTop = (totalHeight - this._containerElement.offsetHeight);
    },

    /**
     * @param {!Element} element
     * @param {!Event} event
     * @return {!Element|!AnchorBox|undefined}
     */
    _getPopoverAnchor: function(element, event)
    {
        var anchor = element.enclosingNodeOrSelfWithClass("timeline-graph-bar");
        if (anchor && anchor._tasksInfo)
            return anchor;
    },

    _mouseLeave: function()
    {
        this._hideQuadHighlight();
    },

    /**
     * @param {!Event} e
     */
    _mouseMove: function(e)
    {
        var rowElement = e.target.enclosingNodeOrSelfWithClass("timeline-tree-item");
        if (!this._highlightQuad(rowElement))
            this._hideQuadHighlight();

        var taskBarElement = e.target.enclosingNodeOrSelfWithClass("timeline-graph-bar");
        if (taskBarElement && taskBarElement._tasksInfo) {
            var offset = taskBarElement.offsetLeft;
            this._timelineGrid.showCurtains(offset >= 0 ? offset : 0, taskBarElement.offsetWidth);
        } else
            this._timelineGrid.hideCurtains();
    },

    /**
     * @param {!Event} event
     */
    _keyDown: function(event)
    {
        if (!this._lastSelectedRecord || event.shiftKey || event.metaKey || event.ctrlKey)
            return;

        var record = this._lastSelectedRecord;
        var recordsInWindow = this._presentationModel.filteredRecords();
        var index = recordsInWindow.indexOf(record);
        var recordsInPage = Math.floor(this._containerElementHeight / WebInspector.TimelinePanel.rowHeight);
        var rowHeight = WebInspector.TimelinePanel.rowHeight;

        if (index === -1)
            index = 0;

        switch (event.keyIdentifier) {
        case "Left":
            if (record.presentationParent()) {
                if ((!record.expandable() || record.collapsed()) && record.presentationParent() !== this._presentationModel.rootRecord()) {
                    this._selectRecord(record.presentationParent());
                } else {
                    record.setCollapsed(true);
                    this._invalidateAndScheduleRefresh(true, true);
                }
            }
            event.consume(true);
            break;
        case "Up":
            if (--index < 0)
                break;
            this._selectRecord(recordsInWindow[index]);
            event.consume(true);
            break;
        case "Right":
            if (record.expandable() && record.collapsed()) {
                record.setCollapsed(false);
                this._invalidateAndScheduleRefresh(true, true);
            } else {
                if (++index >= recordsInWindow.length)
                    break;
                this._selectRecord(recordsInWindow[index]);
            }
            event.consume(true);
            break;
        case "Down":
            if (++index >= recordsInWindow.length)
                break;
            this._selectRecord(recordsInWindow[index]);
            event.consume(true);
            break;
        case "PageUp":
            index = Math.max(0, index - recordsInPage);
            this._scrollTop = Math.max(0, this._scrollTop - recordsInPage * rowHeight);
            this._containerElement.scrollTop = this._scrollTop;
            this._selectRecord(recordsInWindow[index]);
            event.consume(true);
            break;
        case "PageDown":
            index = Math.min(recordsInWindow.length - 1, index + recordsInPage);
            this._scrollTop = Math.min(this._containerElement.scrollHeight - this._containerElementHeight, this._scrollTop + recordsInPage * rowHeight);
            this._containerElement.scrollTop = this._scrollTop;
            this._selectRecord(recordsInWindow[index]);
            event.consume(true);
            break;
        case "Home":
            index = 0;
            this._selectRecord(recordsInWindow[index]);
            event.consume(true);
            break;
        case "End":
            index = recordsInWindow.length - 1;
            this._selectRecord(recordsInWindow[index]);
            event.consume(true);
            break;
        }
    },

    /**
     * @param {?Element} rowElement
     * @return {boolean}
     */
    _highlightQuad: function(rowElement)
    {
        if (!rowElement || !rowElement.row)
            return false;
        var presentationRecord = rowElement.row._record;
        if (presentationRecord.coalesced())
            return false;
        var record = presentationRecord.record();
        if (this._highlightedQuadRecord === record)
            return true;

        var quad = record.traceEvent().highlightQuad;
        var target = record.target();
        if (!quad || !target)
            return false;
        this._highlightedQuadRecord = record;
        target.domAgent().highlightQuad(quad, WebInspector.Color.PageHighlight.Content.toProtocolRGBA(), WebInspector.Color.PageHighlight.ContentOutline.toProtocolRGBA());
        return true;
    },

    _hideQuadHighlight: function()
    {
        var target = this._highlightedQuadRecord ? this._highlightedQuadRecord.target() : null;
        if (target)
            target.domAgent().hideHighlight();

        if (this._highlightedQuadRecord)
            delete this._highlightedQuadRecord;
    },

    /**
     * @param {!Element} anchor
     * @param {!WebInspector.Popover} popover
     */
    _showPopover: function(anchor, popover)
    {
        if (!anchor._tasksInfo)
            return;
        popover.showForAnchor(WebInspector.TimelineUIUtils.generateMainThreadBarPopupContent(this._model, anchor._tasksInfo), anchor, null, null, WebInspector.Popover.Orientation.Bottom);
    },

    _closeRecordDetails: function()
    {
        this._popoverHelper.hidePopover();
    },

    /**
     * @param {?WebInspector.TimelineModel.Record} record
     * @param {string=} regex
     * @param {boolean=} selectRecord
     */
    highlightSearchResult: function(record, regex, selectRecord)
    {
       if (this._highlightDomChanges)
            WebInspector.revertDomChanges(this._highlightDomChanges);
        this._highlightDomChanges = [];

        var presentationRecord = this._presentationModel.toPresentationRecord(record);
        if (!presentationRecord)
            return;

        if (selectRecord)
            this._selectRecord(presentationRecord);

        for (var element = this._sidebarListElement.firstChild; element; element = element.nextSibling) {
            if (element.row._record === presentationRecord) {
                element.row.highlight(regex, this._highlightDomChanges);
                break;
            }
        }
    },

    __proto__: WebInspector.HBox.prototype
}

/**
 * @constructor
 * @param {!WebInspector.TimelineModel} model
 * @implements {WebInspector.TimelineGrid.Calculator}
 */
WebInspector.TimelineCalculator = function(model)
{
    this._model = model;
}

WebInspector.TimelineCalculator._minWidth = 5;

WebInspector.TimelineCalculator.prototype = {
    /**
     * @return {number}
     */
    paddingLeft: function()
    {
        return this._paddingLeft;
    },

    /**
     * @param {number} time
     * @return {number}
     */
    computePosition: function(time)
    {
        return (time - this._minimumBoundary) / this.boundarySpan() * this._workingArea + this._paddingLeft;
    },

    /**
     * @param {!WebInspector.TimelinePresentationModel.Record} record
     * @return {!{start: number, end: number, cpuWidth: number}}
     */
    computeBarGraphPercentages: function(record)
    {
        var start = (record.startTime() - this._minimumBoundary) / this.boundarySpan() * 100;
        var end = (record.startTime() + record.selfTime() - this._minimumBoundary) / this.boundarySpan() * 100;
        var cpuWidth = (record.endTime() - record.startTime()) / this.boundarySpan() * 100;
        return {start: start, end: end, cpuWidth: cpuWidth};
    },

    /**
     * @param {!WebInspector.TimelinePresentationModel.Record} record
     * @return {!{left: number, width: number, cpuWidth: number}}
     */
    computeBarGraphWindowPosition: function(record)
    {
        var percentages = this.computeBarGraphPercentages(record);
        var widthAdjustment = 0;

        var left = this.computePosition(record.startTime());
        var width = (percentages.end - percentages.start) / 100 * this._workingArea;
        if (width < WebInspector.TimelineCalculator._minWidth) {
            widthAdjustment = WebInspector.TimelineCalculator._minWidth - width;
            width = WebInspector.TimelineCalculator._minWidth;
        }
        var cpuWidth = percentages.cpuWidth / 100 * this._workingArea + widthAdjustment;
        return {left: left, width: width, cpuWidth: cpuWidth};
    },

    setWindow: function(minimumBoundary, maximumBoundary)
    {
        this._minimumBoundary = minimumBoundary;
        this._maximumBoundary = maximumBoundary;
    },

    /**
     * @param {number} paddingLeft
     * @param {number} clientWidth
     */
    setDisplayWindow: function(paddingLeft, clientWidth)
    {
        this._workingArea = clientWidth - WebInspector.TimelineCalculator._minWidth - paddingLeft;
        this._paddingLeft = paddingLeft;
    },

    /**
     * @param {number} value
     * @param {number=} precision
     * @return {string}
     */
    formatTime: function(value, precision)
    {
        return Number.preciseMillisToString(value - this.zeroTime(), precision);
    },

    /**
     * @return {number}
     */
    maximumBoundary: function()
    {
        return this._maximumBoundary;
    },

    /**
     * @return {number}
     */
    minimumBoundary: function()
    {
        return this._minimumBoundary;
    },

    /**
     * @return {number}
     */
    zeroTime: function()
    {
        return this._model.minimumRecordTime();
    },

    /**
     * @return {number}
     */
    boundarySpan: function()
    {
        return this._maximumBoundary - this._minimumBoundary;
    }
}

/**
 * @constructor
 * @param {!WebInspector.Linkifier} linkifier
 * @param {function(!WebInspector.TimelinePresentationModel.Record)} selectRecord
 * @param {?WebInspector.Target} target
 * @param {function()} scheduleRefresh
 */
WebInspector.TimelineRecordListRow = function(linkifier, target, selectRecord, scheduleRefresh)
{
    this.element = createElement("div");
    this.element.row = this;
    this.element.style.cursor = "pointer";
    this.element.addEventListener("click", this._onClick.bind(this), false);
    this.element.addEventListener("mouseover", this._onMouseOver.bind(this), false);
    this.element.addEventListener("mouseleave", this._onMouseLeave.bind(this), false);
    this._linkifier = linkifier;

    // Warning is float right block, it goes first.
    this._warningElement = this.element.createChild("div", "timeline-tree-item-warning hidden");

    this._expandArrowElement = this.element.createChild("div", "timeline-tree-item-expand-arrow");
    this._expandArrowElement.addEventListener("click", this._onExpandClick.bind(this), false);
    var iconElement = this.element.createChild("span", "timeline-tree-icon");
    this._typeElement = this.element.createChild("span", "type");

    this._dataElement = this.element.createChild("span", "data dimmed");
    this._scheduleRefresh = scheduleRefresh;
    this._selectRecord = selectRecord;
    this._target = target;
}

WebInspector.TimelineRecordListRow.prototype = {
    /**
     * @param {!WebInspector.TimelinePresentationModel.Record} presentationRecord
     * @param {number} offset
     */
    update: function(presentationRecord, offset)
    {
        this._record = presentationRecord;
        var record = presentationRecord.record();
        this._offset = offset;

        this.element.className = "timeline-tree-item timeline-category-" + WebInspector.TimelineUIUtils.categoryForRecord(record).name;
        var paddingLeft = 5;
        var step = -3;
        for (var currentRecord = presentationRecord.presentationParent() ? presentationRecord.presentationParent().presentationParent() : null; currentRecord; currentRecord = currentRecord.presentationParent())
            paddingLeft += 12 / (Math.max(1, step++));
        this.element.style.paddingLeft = paddingLeft + "px";
        if (record.thread() !== WebInspector.TimelineModel.MainThreadName)
            this.element.classList.add("background");

        this._typeElement.textContent = WebInspector.TimelineUIUtils.titleForRecord(record);

        if (this._dataElement.firstChild)
            this._dataElement.removeChildren();

        this._warningElement.classList.toggle("hidden", !presentationRecord.hasWarnings() && !presentationRecord.childHasWarnings());
        this._warningElement.classList.toggle("timeline-tree-item-child-warning", presentationRecord.childHasWarnings() && !presentationRecord.hasWarnings());

        if (presentationRecord.coalesced()) {
            this._dataElement.createTextChild(WebInspector.UIString("× %d", presentationRecord.presentationChildren().length));
        } else {
            var detailsNode = WebInspector.TimelineUIUtils.buildDetailsNodeForTraceEvent(record.traceEvent(), this._target, this._linkifier);
            if (detailsNode) {
                this._dataElement.createTextChild("(");
                this._dataElement.appendChild(detailsNode);
                this._dataElement.createTextChild(")");
            }
        }

        this._expandArrowElement.classList.toggle("parent", presentationRecord.expandable());
        this._expandArrowElement.classList.toggle("expanded", !!presentationRecord.visibleChildrenCount());
        this._record.setListRow(this);
    },

    highlight: function(regExp, domChanges)
    {
        var matchInfo = this.element.textContent.match(regExp);
        if (matchInfo)
            WebInspector.highlightSearchResult(this.element, matchInfo.index, matchInfo[0].length, domChanges);
    },

    dispose: function()
    {
        this.element.remove();
    },

    /**
     * @param {!Event} event
     */
    _onExpandClick: function(event)
    {
        this._record.setCollapsed(!this._record.collapsed());
        this._scheduleRefresh();
        event.consume(true);
    },

    /**
     * @param {!Event} event
     */
    _onClick: function(event)
    {
        this._selectRecord(this._record);
    },

    /**
     * @param {boolean} selected
     */
    renderAsSelected: function(selected)
    {
        this.element.classList.toggle("selected", selected);
    },

    /**
     * @param {!Event} event
     */
    _onMouseOver: function(event)
    {
        this.element.classList.add("hovered");
        if (this._record.graphRow())
            this._record.graphRow().element.classList.add("hovered");
    },

    /**
     * @param {!Event} event
     */
    _onMouseLeave: function(event)
    {
        this.element.classList.remove("hovered");
        if (this._record.graphRow())
            this._record.graphRow().element.classList.remove("hovered");
    }
}

/**
 * @constructor
 * @param {!Element} graphContainer
 * @param {function(!WebInspector.TimelinePresentationModel.Record)} selectRecord
 * @param {function()} scheduleRefresh
 */
WebInspector.TimelineRecordGraphRow = function(graphContainer, selectRecord, scheduleRefresh)
{
    this.element = createElement("div");
    this.element.row = this;
    this.element.addEventListener("mouseover", this._onMouseOver.bind(this), false);
    this.element.addEventListener("mouseleave", this._onMouseLeave.bind(this), false);
    this.element.addEventListener("click", this._onClick.bind(this), false);

    this._barAreaElement = this.element.createChild("div", "timeline-graph-bar-area");

    this._barCpuElement = this._barAreaElement.createChild("div", "timeline-graph-bar cpu");
    this._barCpuElement.row = this;

    this._barElement = this._barAreaElement.createChild("div", "timeline-graph-bar");
    this._barElement.row = this;

    this._expandElement = new WebInspector.TimelineExpandableElement(graphContainer);

    this._selectRecord = selectRecord;
    this._scheduleRefresh = scheduleRefresh;
}

WebInspector.TimelineRecordGraphRow.prototype = {
    /**
     * @param {!WebInspector.TimelinePresentationModel.Record} presentationRecord
     * @param {!WebInspector.TimelineCalculator} calculator
     * @param {number} expandOffset
     * @param {number} index
     */
    update: function(presentationRecord, calculator, expandOffset, index)
    {
        this._record = presentationRecord;
        var record = presentationRecord.record();
        this.element.className = "timeline-graph-side timeline-category-" + WebInspector.TimelineUIUtils.categoryForRecord(record).name;
        if (record.thread() !== WebInspector.TimelineModel.MainThreadName)
            this.element.classList.add("background");

        var barPosition = calculator.computeBarGraphWindowPosition(presentationRecord);
        this._barElement.style.left = barPosition.left + "px";
        this._barElement.style.width = barPosition.width + "px";
        this._barCpuElement.style.left = barPosition.left + "px";
        this._barCpuElement.style.width = barPosition.cpuWidth + "px";
        this._expandElement._update(presentationRecord, index, barPosition.left - expandOffset, barPosition.width);
        this._record.setGraphRow(this);
    },

    /**
     * @param {!Event} event
     */
    _onClick: function(event)
    {
        // check if we click arrow and expand if yes.
        if (this._expandElement._arrow.containsEventPoint(event))
            this._expand();
        this._selectRecord(this._record);
    },

    /**
     * @param {boolean} selected
     */
    renderAsSelected: function(selected)
    {
        this.element.classList.toggle("selected", selected);
    },

    _expand: function()
    {
        this._record.setCollapsed(!this._record.collapsed());
        this._scheduleRefresh();
    },

    /**
     * @param {!Event} event
     */
    _onMouseOver: function(event)
    {
        this.element.classList.add("hovered");
        if (this._record.listRow())
            this._record.listRow().element.classList.add("hovered");
    },

    /**
     * @param {!Event} event
     */
    _onMouseLeave: function(event)
    {
        this.element.classList.remove("hovered");
        if (this._record.listRow())
            this._record.listRow().element.classList.remove("hovered");
    },

    dispose: function()
    {
        this.element.remove();
        this._expandElement._dispose();
    }
}

/**
 * @constructor
 */
WebInspector.TimelineExpandableElement = function(container)
{
    this._element = container.createChild("div", "timeline-expandable");
    this._element.createChild("div", "timeline-expandable-left");
    this._arrow = this._element.createChild("div", "timeline-expandable-arrow");
}

WebInspector.TimelineExpandableElement.prototype = {
    /**
     * @param {!WebInspector.TimelinePresentationModel.Record} record
     * @param {number} index
     * @param {number} left
     * @param {number} width
     */
    _update: function(record, index, left, width)
    {
        const rowHeight = WebInspector.TimelinePanel.rowHeight;
        if (record.visibleChildrenCount() || record.expandable()) {
            this._element.style.top = index * rowHeight + "px";
            this._element.style.left = left + "px";
            this._element.style.width = Math.max(12, width + 25) + "px";
            if (!record.collapsed()) {
                this._element.style.height = (record.visibleChildrenCount() + 1) * rowHeight + "px";
                this._element.classList.add("timeline-expandable-expanded");
                this._element.classList.remove("timeline-expandable-collapsed");
            } else {
                this._element.style.height = rowHeight + "px";
                this._element.classList.add("timeline-expandable-collapsed");
                this._element.classList.remove("timeline-expandable-expanded");
            }
            this._element.classList.remove("hidden");
        } else {
            this._element.classList.add("hidden");
        }
    },

    _dispose: function()
    {
        this._element.remove();
    }
}
