/*
 * Copyright (C) 2014 Google Inc. All rights reserved.
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
 * @implements {WebInspector.FlameChartDataProvider}
 * @param {!WebInspector.TimelineModel} model
 * @param {!WebInspector.TimelineFrameModelBase} frameModel
 */
WebInspector.TimelineFlameChartDataProvider = function(model, frameModel)
{
    WebInspector.FlameChartDataProvider.call(this);
    this.reset();
    this._model = model;
    this._frameModel = frameModel;
    this._font = "12px " + WebInspector.fontFamily();
    this._linkifier = new WebInspector.Linkifier();
    this._filters = [];
    this.addFilter(WebInspector.TimelineUIUtils.hiddenEventsFilter());
    this.addFilter(new WebInspector.ExclusiveTraceEventNameFilter([WebInspector.TimelineModel.RecordType.Program]));
}

WebInspector.TimelineFlameChartDataProvider.InstantEventVisibleDurationMs = 0.001;
WebInspector.TimelineFlameChartDataProvider.JSFrameCoalesceThresholdMs = 1.1;

/**
 * @return {!WebInspector.FlameChart.ColorGenerator}
 */
WebInspector.TimelineFlameChartDataProvider.consoleEventsColorGenerator = function()
{
    if (!WebInspector.TimelineFlameChartDataProvider.consoleEventsColorGenerator._consoleEventsColorGenerator) {
        var hueSpace = { min: 30, max: 55, count: 5 };
        var satSpace = { min: 70, max: 100, count: 6 };
        var colorGenerator = new WebInspector.FlameChart.ColorGenerator(hueSpace, satSpace, 50, 0.7);
        WebInspector.TimelineFlameChartDataProvider.consoleEventsColorGenerator._consoleEventsColorGenerator = colorGenerator;
    }
    return WebInspector.TimelineFlameChartDataProvider.consoleEventsColorGenerator._consoleEventsColorGenerator;
}

WebInspector.TimelineFlameChartDataProvider.prototype = {
    /**
     * @return {number}
     */
    barHeight: function()
    {
        return 20;
    },

    /**
     * @return {number}
     */
    textBaseline: function()
    {
        return 6;
    },

    /**
     * @return {number}
     */
    textPadding: function()
    {
        return 5;
    },

    /**
     * @param {number} entryIndex
     * @return {string}
     */
    entryFont: function(entryIndex)
    {
        return this._font;
    },

    /**
     * @param {number} entryIndex
     * @return {?string}
     */
    entryTitle: function(entryIndex)
    {
        var event = this._entryEvents[entryIndex];
        if (event) {
            if (event.phase === WebInspector.TracingModel.Phase.AsyncStepInto || event.phase === WebInspector.TracingModel.Phase.AsyncStepPast)
                return event.name + ":" + event.args["step"];

            var name = WebInspector.TimelineUIUtils.eventStyle(event).title;
            // TODO(yurys): support event dividers
            var details = WebInspector.TimelineUIUtils.buildDetailsNodeForTraceEvent(event, this._model.target(), this._linkifier);
            if (event.name === WebInspector.TimelineModel.RecordType.JSFrame && details)
                return details.textContent;
            return details ? WebInspector.UIString("%s (%s)", name, details.textContent) : name;
        }
        var title = this._entryIndexToTitle[entryIndex];
        if (!title) {
            title = WebInspector.UIString("Unexpected entryIndex %d", entryIndex);
            console.error(title);
        }
        return title;
    },

    /**
     * @param {number} startTime
     * @param {number} endTime
     * @return {?Array.<number>}
     */
    dividerOffsets: function(startTime, endTime)
    {
        return null;
    },

    /**
     * @override
     * @param {number} index
     * @return {string}
     */
    markerColor: function(index)
    {
        var event = this._markerEvents[index];
        return WebInspector.TimelineUIUtils.markerEventColor(event);
    },

    /**
     * @override
     * @param {number} index
     * @return {string}
     */
    markerTitle: function(index)
    {
        var event = this._markerEvents[index];
        return WebInspector.TimelineUIUtils.eventTitle(event, this._model);
    },

    /**
     * @override
     * @param {number} index
     * @return {boolean}
     */
    isTallMarker: function(index)
    {
        var event = this._markerEvents[index];
        return WebInspector.TimelineUIUtils.isTallMarkerEvent(event);
    },

    reset: function()
    {
        this._timelineData = null;
        /** @type {!Array.<!WebInspector.TracingModel.Event>} */
        this._entryEvents = [];
        this._entryIndexToTitle = {};
        this._markerEvents = [];
        this._entryIndexToFrame = {};
        this._asyncColorByCategory = {};
    },

    /**
     * @return {!WebInspector.FlameChart.TimelineData}
     */
    timelineData: function()
    {
        if (this._timelineData)
            return this._timelineData;

        this._timelineData = new WebInspector.FlameChart.TimelineData([], [], []);

        this._minimumBoundary = this._model.minimumRecordTime();
        this._timeSpan = this._model.isEmpty() ?  1000 : this._model.maximumRecordTime() - this._minimumBoundary;
        this._currentLevel = 0;
        this._appendFrameBars(this._frameModel.frames());
        this._appendThreadTimelineData(WebInspector.UIString("Main Thread"), this._model.mainThreadEvents(), this._model.mainThreadAsyncEvents());
        if (Runtime.experiments.isEnabled("gpuTimeline"))
            this._appendGPUEvents();
        var threads = this._model.virtualThreads();
        for (var i = 0; i < threads.length; i++)
            this._appendThreadTimelineData(threads[i].name, threads[i].events, threads[i].asyncEvents);
        return this._timelineData;
    },

    /**
     * @param {string} threadTitle
     * @param {!Array.<!WebInspector.TracingModel.Event>} syncEvents
     * @param {!Array.<!Array.<!WebInspector.TracingModel.Event>>} asyncEvents
     */
    _appendThreadTimelineData: function(threadTitle, syncEvents, asyncEvents)
    {
        var levelCount = this._appendAsyncEvents(threadTitle, asyncEvents);
        levelCount += this._appendSyncEvents(levelCount ? null : threadTitle, syncEvents);
        if (levelCount)
            ++this._currentLevel;
    },

    /**
     * @param {?string} headerName
     * @param {!Array.<!WebInspector.TracingModel.Event>} events
     * @return {boolean}
     */
    _appendSyncEvents: function(headerName, events)
    {
        var openEvents = [];
        var headerAppended = false;

        var maxStackDepth = 0;
        for (var i = 0; i < events.length; ++i) {
            var e = events[i];
            if (WebInspector.TimelineUIUtils.isMarkerEvent(e)) {
                this._markerEvents.push(e);
                this._timelineData.markerTimestamps.push(e.startTime);
            }
            if (!e.endTime && e.phase !== WebInspector.TracingModel.Phase.Instant)
                continue;
            if (WebInspector.TracingModel.isAsyncPhase(e.phase))
                continue;
            if (!this._isVisible(e))
                continue;
            while (openEvents.length && openEvents.peekLast().endTime <= e.startTime)
                openEvents.pop();
            if (!headerAppended && headerName) {
                this._appendHeaderRecord(headerName, this._currentLevel++);
                headerAppended = true;
            }
            this._appendEvent(e, this._currentLevel + openEvents.length);
            maxStackDepth = Math.max(maxStackDepth, openEvents.length + 1);
            if (e.endTime)
                openEvents.push(e);
        }
        this._currentLevel += maxStackDepth;
        return !!maxStackDepth;
    },

    /**
     * @param {string} header
     * @param {!Array.<!Array.<!WebInspector.TracingModel.Event>>} eventSteps
     */
    _appendAsyncEvents: function(header, eventSteps)
    {
        var lastUsedTimeByLevel = [];
        var headerAppended = false;

        var maxStackDepth = 0;
        for (var i = 0; i < eventSteps.length; ++i) {
            var e = eventSteps[i][0];
            if (!this._isVisible(e))
                continue;
            if (!headerAppended && header) {
                this._appendHeaderRecord(header, this._currentLevel++);
                headerAppended = true;
            }
            var level;
            for (level = 0; level < lastUsedTimeByLevel.length && lastUsedTimeByLevel[level] > e.startTime; ++level) {}
            if (WebInspector.TracingModel.isNestableAsyncPhase(e.phase))
                this._appendEvent(e, this._currentLevel + level);
            else
                this._appendAsyncEventSteps(eventSteps[i], this._currentLevel + level);
            var lastStep = eventSteps[i].peekLast();
            if (lastStep.phase === WebInspector.TracingModel.Phase.AsyncEnd || lastStep.phase === WebInspector.TracingModel.Phase.NestableAsyncInstant)
                lastUsedTimeByLevel[level] = lastStep.startTime;
            else if (lastStep.phase === WebInspector.TracingModel.Phase.NestableAsyncBegin && lastStep.endTime)
                lastUsedTimeByLevel[level] = lastStep.endTime;
            else
                lastUsedTimeByLevel[level] = Infinity;
        }
        this._currentLevel += lastUsedTimeByLevel.length;
        return lastUsedTimeByLevel.length;
    },

    _appendGPUEvents: function()
    {
        function recordToEvent(record)
        {
            return record.traceEvent();
        }
        if (this._appendSyncEvents(WebInspector.UIString("GPU"), this._model.gpuTasks().map(recordToEvent)))
            ++this._currentLevel;
    },

    /**
     * @param {!Array.<!WebInspector.TimelineFrame>} frames
     */
    _appendFrameBars: function(frames)
    {
        this._frameBarsLevel = this._currentLevel++;
        for (var i = 0; i < frames.length; ++i)
            this._appendFrame(frames[i]);
    },

    /**
     * @param {!WebInspector.TraceEventFilter} filter
     */
    addFilter: function(filter)
    {
        this._filters.push(filter);
    },

    /**
     * @param {!WebInspector.TracingModel.Event} event
     * @return {boolean}
     */
    _isVisible: function(event)
    {
        return this._filters.every(function (filter) { return filter.accept(event); });
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
    totalTime: function()
    {
        return this._timeSpan;
    },

    /**
     * @return {number}
     */
    maxStackDepth: function()
    {
        return this._currentLevel;
    },

    /**
     * @param {number} entryIndex
     * @return {?Array.<!{title: string, text: string}>}
     */
    prepareHighlightedEntryInfo: function(entryIndex)
    {
        return null;
    },

    /**
     * @param {number} entryIndex
     * @return {boolean}
     */
    canJumpToEntry: function(entryIndex)
    {
        return false;
    },

    /**
     * @param {number} entryIndex
     * @return {string}
     */
    entryColor: function(entryIndex)
    {
        var event = this._entryEvents[entryIndex];
        if (!event)
            return this._entryIndexToFrame[entryIndex] ? "white" : "#555";
        if (event.name === WebInspector.TimelineModel.RecordType.JSFrame)
            return this._timelineData.entryLevels[entryIndex] % 2 ? "#efb320" : "#fcc02d";
        var category = WebInspector.TimelineUIUtils.eventStyle(event).category;
        if (WebInspector.TracingModel.isAsyncPhase(event.phase)) {
            if (event.category === WebInspector.TracingModel.ConsoleEventCategory)
                return WebInspector.TimelineFlameChartDataProvider.consoleEventsColorGenerator().colorForID(event.name);
            var color = this._asyncColorByCategory[category.name];
            if (color)
                return color;
            var parsedColor = WebInspector.Color.parse(category.fillColorStop1);
            color = parsedColor.setAlpha(0.7).asString(WebInspector.Color.Format.RGBA) || "";
            this._asyncColorByCategory[category.name] = color;
            return color;
        }
        return category.fillColorStop1;
    },

    /**
     * @param {number} entryIndex
     * @param {!CanvasRenderingContext2D} context
     * @param {?string} text
     * @param {number} barX
     * @param {number} barY
     * @param {number} barWidth
     * @param {number} barHeight
     * @param {function(number):number} offsetToPosition
     * @return {boolean}
     */
    decorateEntry: function(entryIndex, context, text, barX, barY, barWidth, barHeight, offsetToPosition)
    {
        var frame = this._entryIndexToFrame[entryIndex];
        if (frame) {
            context.save();

            context.translate(0.5, 0.5);

            // Only paint starting with certain zoom.
            var scale = barWidth / (frame.endTime - frame.startTime);
            if (scale > 4) {
                context.beginPath();
                context.lineWidth = 3;
                context.moveTo(barX, barY);
                context.lineTo(barX, context.canvas.height);
                context.strokeStyle = "rgba(100, 100, 100, 0.4)";
                context.setLineDash([3]);
                context.stroke();
                context.setLineDash([]);
                context.lineWidth = 1;
            }

            var padding = 4;
            barX += padding;
            barWidth -= 2 * padding;
            barY += padding;
            barHeight -= 2 * padding;

            var cornerRadis = 3;
            var radiusY = cornerRadis;
            var radiusX = Math.min(cornerRadis, barWidth / 2);

            context.beginPath();
            context.moveTo(barX + radiusX, barY);
            context.lineTo(barX + barWidth - radiusX, barY);
            context.quadraticCurveTo(barX + barWidth, barY, barX + barWidth, barY + radiusY);
            context.lineTo(barX + barWidth, barY + barHeight - radiusY);
            context.quadraticCurveTo(barX + barWidth, barY + barHeight, barX + barWidth - radiusX, barY + barHeight);
            context.lineTo(barX + radiusX, barY + barHeight);
            context.quadraticCurveTo(barX, barY + barHeight, barX, barY + barHeight - radiusY);
            context.lineTo(barX, barY + radiusY);
            context.quadraticCurveTo(barX, barY, barX + radiusX, barY);
            context.closePath();

            context.fillStyle = "rgba(200, 200, 200, 0.8)";
            context.fill();
            context.strokeStyle = "rgba(150, 150, 150, 0.8)";
            context.stroke();

            var frameDurationText = Number.millisToString(frame.duration, true);
            var textWidth = context.measureText(frameDurationText).width;
            if (barWidth > textWidth) {
                context.fillStyle = "#555";
                context.fillText(frameDurationText, barX + ((barWidth - textWidth) >> 1), barY + barHeight - 2);
            }
            context.restore();
            return true;
        }
        if (barWidth < 5)
            return false;

        // Paint text using white color on dark background.
        if (text) {
            context.save();
            context.fillStyle = "white";
            context.shadowColor = "rgba(0, 0, 0, 0.1)";
            context.shadowOffsetX = 1;
            context.shadowOffsetY = 1;
            context.font = this._font;
            context.fillText(text, barX + this.textPadding(), barY + barHeight - this.textBaseline());
            context.restore();
        }

        var event = this._entryEvents[entryIndex];
        if (event && event.warning) {
            context.save();

            context.rect(barX, barY, barWidth, this.barHeight());
            context.clip();

            context.beginPath();
            context.fillStyle = "red";
            context.moveTo(barX + barWidth - 15, barY + 1);
            context.lineTo(barX + barWidth - 1, barY + 1);
            context.lineTo(barX + barWidth - 1, barY + 15);
            context.fill();

            context.restore();
        }

        return true;
    },

    /**
     * @param {number} entryIndex
     * @return {boolean}
     */
    forceDecoration: function(entryIndex)
    {
        var event = this._entryEvents[entryIndex];
        if (!event)
            return !!this._entryIndexToFrame[entryIndex];
        return !!event.warning;
    },

   /**
     * @param {number} entryIndex
     * @return {?{startTime: number, endTime: number}}
     */
    highlightTimeRange: function(entryIndex)
    {
        var startTime = this._timelineData.entryStartTimes[entryIndex];
        if (!startTime)
            return null;
        return {
            startTime: startTime,
            endTime: startTime + this._timelineData.entryTotalTimes[entryIndex]
        }
    },

    /**
     * @return {number}
     */
    paddingLeft: function()
    {
        return 0;
    },

    /**
     * @param {number} entryIndex
     * @return {string}
     */
    textColor: function(entryIndex)
    {
        return "white";
    },

    /**
     * @param {string} title
     * @param {number} level
     */
    _appendHeaderRecord: function(title, level)
    {
        var index = this._entryEvents.length;
        this._entryIndexToTitle[index] = title;
        this._entryEvents.push(null);
        this._timelineData.entryLevels[index] = level;
        this._timelineData.entryTotalTimes[index] = this._timeSpan;
        this._timelineData.entryStartTimes[index] = this._minimumBoundary;
    },

    /**
     * @param {!WebInspector.TracingModel.Event} event
     * @param {number} level
     */
    _appendEvent: function(event, level)
    {
        var index = this._entryEvents.length;
        this._entryEvents.push(event);
        this._timelineData.entryLevels[index] = level;
        this._timelineData.entryTotalTimes[index] = event.duration || WebInspector.TimelineFlameChartDataProvider.InstantEventVisibleDurationMs;
        this._timelineData.entryStartTimes[index] = event.startTime;
    },

    /**
     * @param {!Array.<!WebInspector.TracingModel.Event>} steps
     * @param {number} level
     */
    _appendAsyncEventSteps: function(steps, level)
    {
        // If we have past steps, put the end event for each range rather than start one.
        var eventOffset = steps[1].phase === WebInspector.TracingModel.Phase.AsyncStepPast ? 1 : 0;
        for (var i = 0; i < steps.length - 1; ++i) {
            var index = this._entryEvents.length;
            this._entryEvents.push(steps[i + eventOffset]);
            var startTime = steps[i].startTime;
            this._timelineData.entryLevels[index] = level;
            this._timelineData.entryTotalTimes[index] = steps[i + 1].startTime - startTime;
            this._timelineData.entryStartTimes[index] = startTime;
        }
    },

    /**
     * @param {!WebInspector.TimelineFrame} frame
     */
    _appendFrame: function(frame)
    {
        var index = this._entryEvents.length;
        this._entryEvents.push(null);
        this._entryIndexToFrame[index] = frame;
        this._entryIndexToTitle[index] = Number.millisToString(frame.duration, true);
        this._timelineData.entryLevels[index] = this._frameBarsLevel;
        this._timelineData.entryTotalTimes[index] = frame.duration;
        this._timelineData.entryStartTimes[index] = frame.startTime;
    },

    /**
     * @param {number} entryIndex
     * @return {?WebInspector.TimelineSelection}
     */
    createSelection: function(entryIndex)
    {
        var event = this._entryEvents[entryIndex];
        if (event) {
            this._lastSelection = new WebInspector.TimelineFlameChart.Selection(WebInspector.TimelineSelection.fromTraceEvent(event), entryIndex);
            return this._lastSelection.timelineSelection;
        }
        var frame = this._entryIndexToFrame[entryIndex];
        if (frame) {
            this._lastSelection = new WebInspector.TimelineFlameChart.Selection(WebInspector.TimelineSelection.fromFrame(frame), entryIndex);
            return this._lastSelection.timelineSelection;
        }
        return null;
    },

    /**
     * @param {?WebInspector.TimelineSelection} selection
     * @return {number}
     */
    entryIndexForSelection: function(selection)
    {
        if (!selection)
            return -1;

        if (this._lastSelection && this._lastSelection.timelineSelection.object() === selection.object())
            return this._lastSelection.entryIndex;
        switch  (selection.type()) {
        case WebInspector.TimelineSelection.Type.TraceEvent:
            var event = /** @type{!WebInspector.TracingModel.Event} */ (selection.object());
            var entryEvents = this._entryEvents;
            for (var entryIndex = 0; entryIndex < entryEvents.length; ++entryIndex) {
                if (entryEvents[entryIndex] === event) {
                    this._lastSelection = new WebInspector.TimelineFlameChart.Selection(WebInspector.TimelineSelection.fromTraceEvent(event), entryIndex);
                    return entryIndex;
                }
            }
            break;
        case WebInspector.TimelineSelection.Type.Frame:
            var frame = /** @type {!WebInspector.TimelineFrame} */ (selection.object());
            for (var frameIndex in this._entryIndexToFrame) {
                if (this._entryIndexToFrame[frameIndex] === frame) {
                    this._lastSelection = new WebInspector.TimelineFlameChart.Selection(WebInspector.TimelineSelection.fromFrame(frame), Number(frameIndex));
                    return Number(frameIndex);
                }
            }
            break;
        }
        return -1;
    }
}

/**
 * @constructor
 * @extends {WebInspector.VBox}
 * @implements {WebInspector.TimelineModeView}
 * @implements {WebInspector.FlameChartDelegate}
 * @param {!WebInspector.TimelineModeViewDelegate} delegate
 * @param {!WebInspector.TimelineModel} tracingModel
 * @param {!WebInspector.TimelineFrameModelBase} frameModel
 */
WebInspector.TimelineFlameChart = function(delegate, tracingModel, frameModel)
{
    WebInspector.VBox.call(this);
    this.element.classList.add("timeline-flamechart");
    this._delegate = delegate;
    this._model = tracingModel;
    this._dataProvider = new WebInspector.TimelineFlameChartDataProvider(tracingModel, frameModel)
    this._mainView = new WebInspector.FlameChart(this._dataProvider, this, true);
    this._mainView.show(this.element);
    this._model.addEventListener(WebInspector.TimelineModel.Events.RecordingStarted, this._onRecordingStarted, this);
    this._mainView.addEventListener(WebInspector.FlameChart.Events.EntrySelected, this._onEntrySelected, this);
}

WebInspector.TimelineFlameChart.prototype = {
    dispose: function()
    {
        this._model.removeEventListener(WebInspector.TimelineModel.Events.RecordingStarted, this._onRecordingStarted, this);
        this._mainView.removeEventListener(WebInspector.FlameChart.Events.EntrySelected, this._onEntrySelected, this);
    },

    /**
     * @param {number} windowStartTime
     * @param {number} windowEndTime
     */
    requestWindowTimes: function(windowStartTime, windowEndTime)
    {
        this._delegate.requestWindowTimes(windowStartTime, windowEndTime);
    },

    /**
     * @param {number} startTime
     * @param {number} endTime
     */
    updateBoxSelection: function(startTime, endTime)
    {
        this._delegate.select(WebInspector.TimelineSelection.fromRange(startTime, endTime));
    },

    /**
     * @override
     * @param {?RegExp} textFilter
     */
    refreshRecords: function(textFilter)
    {
        this._dataProvider.reset();
        this._mainView.scheduleUpdate();
    },

    wasShown: function()
    {
        this._mainView.scheduleUpdate();
    },

    /**
     * @return {!WebInspector.View}
     */
    view: function()
    {
        return this;
    },

    reset: function()
    {
        this._automaticallySizeWindow = true;
        this._dataProvider.reset();
        this._mainView.reset();
        this._mainView.setWindowTimes(0, Infinity);
    },

    _onRecordingStarted: function()
    {
        this._automaticallySizeWindow = true;
        this._mainView.reset();
    },

    /**
     * @param {number} startTime
     * @param {number} endTime
     */
    setWindowTimes: function(startTime, endTime)
    {
        this._mainView.setWindowTimes(startTime, endTime);
        this._delegate.select(null);
    },

    /**
     * @param {number} width
     */
    setSidebarSize: function(width)
    {
    },

    /**
     * @param {?WebInspector.TimelineModel.Record} record
     * @param {string=} regex
     * @param {boolean=} selectRecord
     */
    highlightSearchResult: function(record, regex, selectRecord)
    {
        if (!record) {
            this._delegate.select(null);
            return;
        }
        var traceEvent = record.traceEvent();
        var entryIndex = this._dataProvider._entryEvents.indexOf(traceEvent);
        var timelineSelection = this._dataProvider.createSelection(entryIndex);
        if (timelineSelection)
            this._delegate.select(timelineSelection);
    },

    /**
     * @param {?WebInspector.TimelineSelection} selection
     */
    setSelection: function(selection)
    {
        var index = this._dataProvider.entryIndexForSelection(selection);
        this._mainView.setSelectedEntry(index);
    },

    /**
     * @param {!WebInspector.Event} event
     */
    _onEntrySelected: function(event)
    {
        var entryIndex = /** @type{number} */ (event.data);
        var timelineSelection = this._dataProvider.createSelection(entryIndex);
        if (timelineSelection)
            this._delegate.select(timelineSelection);
    },

    __proto__: WebInspector.VBox.prototype
}

/**
  * @constructor
  * @param {!WebInspector.TimelineSelection} selection
  * @param {number} entryIndex
  */
WebInspector.TimelineFlameChart.Selection = function(selection, entryIndex)
{
    this.timelineSelection = selection;
    this.entryIndex = entryIndex;
}
