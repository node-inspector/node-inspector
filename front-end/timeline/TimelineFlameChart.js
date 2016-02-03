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
 */
WebInspector.TimelineFlameChartDataProviderBase = function(model)
{
    WebInspector.FlameChartDataProvider.call(this);
    this.reset();
    this._model = model;
    /** @type {?WebInspector.FlameChart.TimelineData} */
    this._timelineData;
    this._font = "11px " + WebInspector.fontFamily();
    this._filters = [];
    this.addFilter(WebInspector.TimelineUIUtils.visibleEventsFilter());
    this.addFilter(new WebInspector.ExcludeTopLevelFilter());
}

WebInspector.TimelineFlameChartDataProviderBase.prototype = {
    /**
     * @override
     * @return {number}
     */
    barHeight: function()
    {
        return 17;
    },

    /**
     * @override
     * @return {number}
     */
    textBaseline: function()
    {
        return 5;
    },

    /**
     * @override
     * @return {number}
     */
    textPadding: function()
    {
        return 4;
    },

    /**
     * @override
     * @param {number} entryIndex
     * @return {string}
     */
    entryFont: function(entryIndex)
    {
        return this._font;
    },

    /**
     * @override
     * @param {number} entryIndex
     * @return {?string}
     */
    entryTitle: function(entryIndex)
    {
        return null;
    },

    reset: function()
    {
        this._timelineData = null;
    },

    /**
     * @param {!WebInspector.TimelineModel.Filter} filter
     */
    addFilter: function(filter)
    {
        this._filters.push(filter);
    },

    /**
     * @override
     * @return {number}
     */
    minimumBoundary: function()
    {
        return this._minimumBoundary;
    },

    /**
     * @override
     * @return {number}
     */
    totalTime: function()
    {
        return this._timeSpan;
    },

    /**
     * @override
     * @return {number}
     */
    maxStackDepth: function()
    {
        return this._currentLevel;
    },

    /**
     * @override
     * @param {number} entryIndex
     * @return {?Array.<!{title: string, value: (string|!Element)}>}
     */
    prepareHighlightedEntryInfo: function(entryIndex)
    {
        return null;
    },

    /**
     * @override
     * @param {number} entryIndex
     * @return {boolean}
     */
    canJumpToEntry: function(entryIndex)
    {
        return false;
    },

    /**
     * @override
     * @param {number} entryIndex
     * @return {string}
     */
    entryColor: function(entryIndex)
    {
        return "red";
    },

    /**
     * @override
     * @param {number} index
     * @return {boolean}
     */
    forceDecoration: function(index)
    {
        return false;
    },

    /**
     * @override
     * @param {number} entryIndex
     * @param {!CanvasRenderingContext2D} context
     * @param {?string} text
     * @param {number} barX
     * @param {number} barY
     * @param {number} barWidth
     * @param {number} barHeight
     * @return {boolean}
     */
    decorateEntry: function(entryIndex, context, text, barX, barY, barWidth, barHeight)
    {
        return false;
    },

    /**
     * @override
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
     * @return {number}
     */
    paddingLeft: function()
    {
        return 0;
    },

    /**
     * @override
     * @param {number} entryIndex
     * @return {string}
     */
    textColor: function(entryIndex)
    {
        return "#333";
    },

    /**
     * @override
     * @param {number} entryIndex
     * @return {?{startTime: number, endTime: number}}
     */
    highlightTimeRange: function(entryIndex)
    {
        var startTime = this._timelineData.entryStartTimes[entryIndex];
        return {
            startTime: startTime,
            endTime: startTime + this._timelineData.entryTotalTimes[entryIndex]
        };
    },

    /**
     * @param {number} entryIndex
     * @return {?WebInspector.TimelineSelection}
     */
    createSelection: function(entryIndex)
    {
        return null;
    },

    /**
     * @override
     * @return {!WebInspector.FlameChart.TimelineData}
     */
    timelineData: function()
    {
        throw new Error("Not implemented");
    },

    /**
     * @param {!WebInspector.TracingModel.Event} event
     * @return {boolean}
     */
    _isVisible: function(event)
    {
        return this._filters.every(function (filter) { return filter.accept(event); });
    }
}

/**
 * @constructor
 * @extends {WebInspector.TimelineFlameChartDataProviderBase}
 * @param {!WebInspector.TimelineModel} model
 * @param {?WebInspector.TimelineFrameModelBase} frameModel
 */
WebInspector.TimelineFlameChartDataProvider = function(model, frameModel)
{
    WebInspector.TimelineFlameChartDataProviderBase.call(this, model);
    this._frameModel = frameModel;
    this._consoleColorGenerator = new WebInspector.FlameChart.ColorGenerator(
        { min: 30, max: 55, count: 5 },
        { min: 70, max: 100, count: 6 },
        50, 0.7);
}

WebInspector.TimelineFlameChartDataProvider.InstantEventVisibleDurationMs = 0.001;

WebInspector.TimelineFlameChartDataProvider.prototype = {
    /**
     * @override
     * @param {number} entryIndex
     * @return {?string}
     */
    entryTitle: function(entryIndex)
    {
        var event = this._entryEvents[entryIndex];
        if (event) {
            if (event.phase === WebInspector.TracingModel.Phase.AsyncStepInto || event.phase === WebInspector.TracingModel.Phase.AsyncStepPast)
                return event.name + ":" + event.args["step"];
            if (event._blackboxRoot)
                return WebInspector.UIString("Blackboxed");
            var name = WebInspector.TimelineUIUtils.eventStyle(event).title;
            // TODO(yurys): support event dividers
            var detailsText = WebInspector.TimelineUIUtils.buildDetailsTextForTraceEvent(event, this._model.target());
            if (event.name === WebInspector.TimelineModel.RecordType.JSFrame && detailsText)
                return detailsText;
            return detailsText ? WebInspector.UIString("%s (%s)", name, detailsText) : name;
        }
        var title = this._entryIndexToTitle[entryIndex];
        if (!title) {
            title = WebInspector.UIString("Unexpected entryIndex %d", entryIndex);
            console.error(title);
        }
        return title;
    },

    /**
     * @override
     * @param {number} index
     * @return {string}
     */
    textColor: function(index)
    {
        var event = this._entryEvents[index];
        if (event && event._blackboxRoot)
            return "#888";
        else
            return WebInspector.TimelineFlameChartDataProviderBase.prototype.textColor.call(this, index);
    },

    /**
     * @override
     */
    reset: function()
    {
        WebInspector.TimelineFlameChartDataProviderBase.prototype.reset.call(this);
        /** @type {!Array.<!WebInspector.TracingModel.Event>} */
        this._entryEvents = [];
        this._entryIndexToTitle = {};
        /** @type {!Array.<!WebInspector.TimelineFlameChartMarker>} */
        this._markers = [];
        this._entryIndexToFrame = {};
        this._asyncColorByCategory = {};
        /** @type {!Map<string, boolean>} */
        this._blackboxingURLCache = new Map();
    },

    /**
     * @override
     * @return {!WebInspector.FlameChart.TimelineData}
     */
    timelineData: function()
    {
        if (this._timelineData)
            return this._timelineData;

        this._timelineData = new WebInspector.FlameChart.TimelineData([], [], []);

        this._flowEventIndexById = {};
        this._minimumBoundary = this._model.minimumRecordTime();
        this._timeSpan = this._model.isEmpty() ?  1000 : this._model.maximumRecordTime() - this._minimumBoundary;
        this._currentLevel = 0;
        if (this._frameModel)
            this._appendFrameBars(this._frameModel.frames());
        this._appendThreadTimelineData(WebInspector.UIString("Main Thread"), this._model.mainThreadEvents(), this._model.mainThreadAsyncEvents());
        if (Runtime.experiments.isEnabled("gpuTimeline"))
            this._appendGPUEvents();
        var threads = this._model.virtualThreads();
        for (var i = 0; i < threads.length; i++)
            this._appendThreadTimelineData(threads[i].name, threads[i].events, threads[i].asyncEventsByGroup);

        /**
         * @param {!WebInspector.TimelineFlameChartMarker} a
         * @param {!WebInspector.TimelineFlameChartMarker} b
         */
        function compareStartTime(a, b)
        {
            return a.startTime() - b.startTime();
        }

        this._markers.sort(compareStartTime);
        this._timelineData.markers = this._markers;

        this._flowEventIndexById = {};
        return this._timelineData;
    },

    /**
     * @param {string} threadTitle
     * @param {!Array<!WebInspector.TracingModel.Event>} syncEvents
     * @param {!Map<!WebInspector.AsyncEventGroup, !Array<!WebInspector.TracingModel.AsyncEvent>>} asyncEvents
     */
    _appendThreadTimelineData: function(threadTitle, syncEvents, asyncEvents)
    {
        var firstLevel = this._currentLevel;
        this._appendSyncEvents(threadTitle, syncEvents);
        this._appendAsyncEvents(this._currentLevel !== firstLevel ? null : threadTitle, asyncEvents);
        if (this._currentLevel !== firstLevel)
            ++this._currentLevel;
    },

    /**
     * @param {?string} headerName
     * @param {!Array<!WebInspector.TracingModel.Event>} events
     */
    _appendSyncEvents: function(headerName, events)
    {
        var openEvents = [];
        var flowEventsEnabled = Runtime.experiments.isEnabled("timelineFlowEvents");
        var blackboxingEnabled = Runtime.experiments.isEnabled("blackboxJSFramesOnTimeline");
        var maxStackDepth = 0;
        for (var i = 0; i < events.length; ++i) {
            var e = events[i];
            if (WebInspector.TimelineUIUtils.isMarkerEvent(e))
                this._markers.push(new WebInspector.TimelineFlameChartMarker(e.startTime, e.startTime - this._model.minimumRecordTime(), WebInspector.TimelineUIUtils.markerStyleForEvent(e)));
            if (!WebInspector.TracingModel.isFlowPhase(e.phase)) {
                if (!e.endTime && e.phase !== WebInspector.TracingModel.Phase.Instant)
                    continue;
                if (WebInspector.TracingModel.isAsyncPhase(e.phase))
                    continue;
                if (!this._isVisible(e))
                    continue;
            }
            while (openEvents.length && openEvents.peekLast().endTime <= e.startTime)
                openEvents.pop();
            e._blackboxRoot = false;
            if (blackboxingEnabled && this._isBlackboxedEvent(e)) {
                var parent = openEvents.peekLast();
                if (parent && parent._blackboxRoot)
                    continue;
                e._blackboxRoot = true;
            }
            if (headerName) {
                this._appendHeaderRecord(headerName, this._currentLevel++);
                headerName = null;
            }
            var level = this._currentLevel + openEvents.length;
            this._appendEvent(e, level);
            if (flowEventsEnabled)
                this._appendFlowEvent(e, level);
            maxStackDepth = Math.max(maxStackDepth, openEvents.length + 1);
            if (e.endTime)
                openEvents.push(e);
        }
        this._currentLevel += maxStackDepth;
    },

    /**
     * @param {!WebInspector.TracingModel.Event} event
     * @return {boolean}
     */
    _isBlackboxedEvent: function(event)
    {
        if (event.name !== WebInspector.TimelineModel.RecordType.JSFrame)
            return false;
        var url = event.args["data"]["url"];
        return url && this._isBlackboxedURL(url);
    },

    /**
     * @param {string} url
     * @return {boolean}
     */
    _isBlackboxedURL: function(url)
    {
        if (this._blackboxingURLCache.has(url))
            return /** @type {boolean} */ (this._blackboxingURLCache.get(url));
        var result = WebInspector.BlackboxSupport.isBlackboxedURL(url);
        this._blackboxingURLCache.set(url, result);
        return result;
    },

    /**
     * @param {?string} header
     * @param {!Map<!WebInspector.AsyncEventGroup, !Array<!WebInspector.TracingModel.AsyncEvent>>} asyncEvents
     */
    _appendAsyncEvents: function(header, asyncEvents)
    {
        var groups = Object.values(WebInspector.TimelineUIUtils.asyncEventGroups());

        for (var groupIndex = 0; groupIndex < groups.length; ++groupIndex) {
            var lastUsedTimeByLevel = [];
            var group = groups[groupIndex];
            var events = asyncEvents.get(group);
            if (!events)
                continue;
            var groupHeaderAppended = false;
            for (var i = 0; i < events.length; ++i) {
                var asyncEvent = events[i];
                if (!this._isVisible(asyncEvent))
                    continue;
                if (header) {
                    this._appendHeaderRecord(header, this._currentLevel++);
                    header = null;
                }
                if (!groupHeaderAppended) {
                    this._appendHeaderRecord(group.title, this._currentLevel++);
                    groupHeaderAppended = true;
                }
                var startTime = asyncEvent.startTime;
                var level;
                for (level = 0; level < lastUsedTimeByLevel.length && lastUsedTimeByLevel[level] > startTime; ++level) {}
                this._appendAsyncEvent(asyncEvent, this._currentLevel + level);
                lastUsedTimeByLevel[level] = asyncEvent.endTime;
            }
            this._currentLevel += lastUsedTimeByLevel.length;
        }
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
        var style = WebInspector.TimelineUIUtils.markerStyleForFrame();
        this._frameBarsLevel = this._currentLevel++;
        for (var i = 0; i < frames.length; ++i) {
            this._markers.push(new WebInspector.TimelineFlameChartMarker(frames[i].startTime, frames[i].startTime - this._model.minimumRecordTime(), style));
            this._appendFrame(frames[i]);
        }
    },

    /**
     * @override
     * @param {number} entryIndex
     * @return {string}
     */
    entryColor: function(entryIndex)
    {
        var event = this._entryEvents[entryIndex];
        if (!event)
            return this._entryIndexToFrame[entryIndex] ? "white" : "#aaa";
        if (event.name === WebInspector.TimelineModel.RecordType.JSFrame)
            return WebInspector.TimelineUIUtils.colorForURL(event.args["data"]["url"]);
        var category = WebInspector.TimelineUIUtils.eventStyle(event).category;
        if (WebInspector.TracingModel.isAsyncPhase(event.phase)) {
            if (event.hasCategory(WebInspector.TracingModel.ConsoleEventCategory))
                return this._consoleColorGenerator.colorForID(event.name);
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
     * @override
     * @param {number} entryIndex
     * @param {!CanvasRenderingContext2D} context
     * @param {?string} text
     * @param {number} barX
     * @param {number} barY
     * @param {number} barWidth
     * @param {number} barHeight
     * @return {boolean}
     */
    decorateEntry: function(entryIndex, context, text, barX, barY, barWidth, barHeight)
    {
        var frame = this._entryIndexToFrame[entryIndex];
        var /** @const */ triangleSize = 10;
        if (frame) {
            var /** @const */ vPadding = 1;
            var /** @const */ hPadding = 1;
            barX += hPadding;
            barWidth -= 2 * hPadding;
            barY += vPadding;
            barHeight -= 2 * vPadding + 1;

            context.fillStyle = frame.idle ? "white" : "#eee";
            context.fillRect(barX, barY, barWidth, barHeight);
            if (frame.hasWarnings()) {
                context.save();
                paintWarningDecoration();
                context.restore();
            }

            var frameDurationText = Number.preciseMillisToString(frame.duration, 1);
            var textWidth = context.measureText(frameDurationText).width;
            if (barWidth > textWidth) {
                context.fillStyle = this.textColor(entryIndex);
                context.fillText(frameDurationText, barX + ((barWidth - textWidth) >> 1), barY + barHeight - 3);
            }
            return true;
        }
        if (barWidth < 5)
            return false;

        if (text) {
            context.save();
            context.fillStyle = this.textColor(entryIndex);
            context.font = this._font;
            context.fillText(text, barX + this.textPadding(), barY + barHeight - this.textBaseline());
            context.restore();
        }

        var event = this._entryEvents[entryIndex];
        if (event && event.warning) {
            context.save();

            context.rect(barX, barY, barWidth, this.barHeight());
            context.clip();
            paintWarningDecoration();
            context.restore();
        }

        function paintWarningDecoration()
        {
            context.beginPath();
            context.fillStyle = "red";
            context.moveTo(barX + barWidth - triangleSize, barY + 1);
            context.lineTo(barX + barWidth - 1, barY + 1);
            context.lineTo(barX + barWidth - 1, barY + triangleSize);
            context.fill();
        }

        return true;
    },

    /**
     * @override
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
     * @param {!WebInspector.TracingModel.Event} event
     * @param {number} level
     */
    _appendFlowEvent: function(event, level)
    {
        var timelineData = this._timelineData;
        /**
         * @param {!WebInspector.TracingModel.Event} event
         * @return {number}
         */
        function pushStartFlow(event)
        {
            var flowIndex = timelineData.flowStartTimes.length;
            timelineData.flowStartTimes.push(event.startTime);
            timelineData.flowStartLevels.push(level);
            return flowIndex;
        }

        /**
         * @param {!WebInspector.TracingModel.Event} event
         * @param {number} flowIndex
         */
        function pushEndFlow(event, flowIndex)
        {
            timelineData.flowEndTimes[flowIndex] = event.startTime;
            timelineData.flowEndLevels[flowIndex] = level;
        }

        switch(event.phase) {
        case WebInspector.TracingModel.Phase.FlowBegin:
            this._flowEventIndexById[event.id] = pushStartFlow(event);
            break;
        case WebInspector.TracingModel.Phase.FlowStep:
            pushEndFlow(event, this._flowEventIndexById[event.id]);
            this._flowEventIndexById[event.id] = pushStartFlow(event);
            break;
        case WebInspector.TracingModel.Phase.FlowEnd:
            pushEndFlow(event, this._flowEventIndexById[event.id]);
            delete this._flowEventIndexById[event.id];
            break;
        }
    },

    /**
     * @param {!WebInspector.TracingModel.AsyncEvent} asyncEvent
     * @param {number} level
     */
    _appendAsyncEvent: function(asyncEvent, level)
    {
        if (WebInspector.TracingModel.isNestableAsyncPhase(asyncEvent.phase)) {
            // FIXME: also add steps once we support event nesting in the FlameChart.
            this._appendEvent(asyncEvent, level);
            return;
        }
        var steps = asyncEvent.steps;
        // If we have past steps, put the end event for each range rather than start one.
        var eventOffset = steps.length > 1 && steps[1].phase === WebInspector.TracingModel.Phase.AsyncStepPast ? 1 : 0;
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
     * @override
     * @param {number} entryIndex
     * @return {?WebInspector.TimelineSelection}
     */
    createSelection: function(entryIndex)
    {
        var event = this._entryEvents[entryIndex];
        if (event) {
            this._lastSelection = new WebInspector.TimelineFlameChartView.Selection(WebInspector.TimelineSelection.fromTraceEvent(event), entryIndex);
            return this._lastSelection.timelineSelection;
        }
        var frame = this._entryIndexToFrame[entryIndex];
        if (frame) {
            this._lastSelection = new WebInspector.TimelineFlameChartView.Selection(WebInspector.TimelineSelection.fromFrame(frame), entryIndex);
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
            var entryIndex = this._entryEvents.indexOf(event);
            if (entryIndex !== -1)
                this._lastSelection = new WebInspector.TimelineFlameChartView.Selection(WebInspector.TimelineSelection.fromTraceEvent(event), entryIndex);
            return entryIndex;
        case WebInspector.TimelineSelection.Type.Frame:
            var frame = /** @type {!WebInspector.TimelineFrame} */ (selection.object());
            for (var frameIndex in this._entryIndexToFrame) {
                if (this._entryIndexToFrame[frameIndex] === frame) {
                    this._lastSelection = new WebInspector.TimelineFlameChartView.Selection(WebInspector.TimelineSelection.fromFrame(frame), Number(frameIndex));
                    return Number(frameIndex);
                }
            }
            break;
        }
        return -1;
    },

    __proto__: WebInspector.TimelineFlameChartDataProviderBase.prototype
}

/**
 * @constructor
 * @extends {WebInspector.TimelineFlameChartDataProviderBase}
 * @param {!WebInspector.TimelineModel} model
 */
WebInspector.TimelineFlameChartNetworkDataProvider = function(model)
{
    WebInspector.TimelineFlameChartDataProviderBase.call(this, model);
    var loadingCategory = WebInspector.TimelineUIUtils.categories()["loading"];
    this._waitingColor = loadingCategory.backgroundColor;
    this._processingColor = loadingCategory.fillColorStop1;
}

WebInspector.TimelineFlameChartNetworkDataProvider.prototype = {
    /**
     * @override
     * @return {number}
     */
    barHeight: function()
    {
        return 5;
    },

    /**
     * @override
     * @return {!WebInspector.FlameChart.TimelineData}
     */
    timelineData: function()
    {
        if (this._timelineData)
            return this._timelineData;
        /** @type {!Array<!WebInspector.TimelineModel.NetworkRequest>} */
        this._requests = [];
        this._timelineData = new WebInspector.FlameChart.TimelineData([], [], []);
        this._appendTimelineData(this._model.mainThreadEvents());
        return this._timelineData;
    },

    /**
     * @override
     */
    reset: function()
    {
        WebInspector.TimelineFlameChartDataProviderBase.prototype.reset.call(this);
        /** @type {!Array<!WebInspector.TimelineModel.NetworkRequest>} */
        this._requests = [];
    },

    /**
     * @param {number} startTime
     * @param {number} endTime
     */
    setWindowTimes: function(startTime, endTime)
    {
        this._startTime = startTime;
        this._endTime = endTime;
        this._updateTimelineData();
    },

    /**
     * @override
     * @param {number} index
     * @return {?WebInspector.TimelineSelection}
     */
    createSelection: function(index)
    {
        if (index === -1)
            return null;
        var request = this._requests[index];
        this._lastSelection = new WebInspector.TimelineFlameChartView.Selection(WebInspector.TimelineSelection.fromNetworkRequest(request), index);
        return this._lastSelection.timelineSelection;
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

        if (selection.type() !== WebInspector.TimelineSelection.Type.NetworkRequest)
            return -1;
        var request = /** @type{!WebInspector.TimelineModel.NetworkRequest} */ (selection.object());
        var index = this._requests.indexOf(request);
        if (index !== -1)
            this._lastSelection = new WebInspector.TimelineFlameChartView.Selection(WebInspector.TimelineSelection.fromNetworkRequest(request), index);
        return index;
    },

    /**
     * @override
     * @param {number} index
     * @return {string}
     */
    entryColor: function(index)
    {
        var request = /** @type {!WebInspector.TimelineModel.NetworkRequest} */ (this._requests[index]);
        var category = WebInspector.TimelineUIUtils.networkRequestCategory(request);
        return WebInspector.TimelineUIUtils.networkCategoryColor(category);
    },

    /**
     * @override
     * @param {number} index
     * @param {!CanvasRenderingContext2D} context
     * @param {?string} text
     * @param {number} barX
     * @param {number} barY
     * @param {number} barWidth
     * @param {number} barHeight
     * @return {boolean}
     */
    decorateEntry: function(index, context, text, barX, barY, barWidth, barHeight)
    {
        var minTransferWidthPx = 2;
        var request = /** @type {!WebInspector.TimelineModel.NetworkRequest} */ (this._requests[index]);
        var startTime = request.startTime;
        var responseTime = request.responseTime || request.endTime;
        var requestDuration = request.endTime - startTime;
        var waitingWidth;
        if (isFinite(requestDuration))
            waitingWidth = requestDuration ? (responseTime - startTime) / requestDuration * barWidth : 0;
        else
            waitingWidth = barWidth;
        waitingWidth = Math.min(waitingWidth, barWidth - minTransferWidthPx);
        context.fillStyle = "hsla(0, 0%, 100%, 0.5)";
        context.fillRect(barX, barY, waitingWidth, barHeight);
        return false;
    },

    /**
     * @override
     * @param {number} index
     * @return {boolean}
     */
    forceDecoration: function(index)
    {
        return true;
    },

    /**
     * @override
     * @param {number} index
     * @return {?Array.<!{title: string, value: (string|!Element)}>}
     */
    prepareHighlightedEntryInfo: function(index)
    {
        var request = /** @type {!WebInspector.TimelineModel.NetworkRequest} */ (this._requests[index]);
        return WebInspector.TimelineUIUtils.buildNetworkRequestInfo(request);
    },

    /**
     * @param {!Array.<!WebInspector.TracingModel.Event>} events
     */
    _appendTimelineData: function(events)
    {
        this._minimumBoundary = this._model.minimumRecordTime();
        this._maximumBoundary = this._model.maximumRecordTime();
        this._timeSpan = this._model.isEmpty() ? 1000 : this._maximumBoundary - this._minimumBoundary;
        this._model.networkRequests().forEach(this._appendEntry.bind(this));
        this._currentLevel = this._requests.length;
    },

    _updateTimelineData: function()
    {
        if (!this._timelineData)
            return;
        var index = 0;
        for (var i = 0; i < this._requests.length; ++i) {
            var r = this._requests[i];
            var visible = r.startTime < this._endTime && r.endTime > this._startTime;
            this._timelineData.entryLevels[i] = visible ? index++ : 0;
        }
        this._timelineData = new WebInspector.FlameChart.TimelineData(
             this._timelineData.entryLevels,
             this._timelineData.entryTotalTimes,
             this._timelineData.entryStartTimes);
        this._currentLevel = index;
    },

    /**
     * @param {!WebInspector.TimelineModel.NetworkRequest} request
     */
    _appendEntry: function(request)
    {
        this._requests.push(request);
        this._timelineData.entryStartTimes.push(request.startTime);
        this._timelineData.entryTotalTimes.push(request.endTime - request.startTime);
        this._timelineData.entryLevels.push(this._requests.length - 1);
    },

    __proto__: WebInspector.TimelineFlameChartDataProviderBase.prototype
}

/**
 * @constructor
 * @implements {WebInspector.FlameChartMarker}
 * @param {number} startTime
 * @param {number} startOffset
 * @param {!WebInspector.TimelineMarkerStyle} style
 */
WebInspector.TimelineFlameChartMarker = function(startTime, startOffset, style)
{
    this._startTime = startTime;
    this._startOffset = startOffset;
    this._style = style;
}

WebInspector.TimelineFlameChartMarker.prototype = {
    /**
     * @override
     * @return {number}
     */
    startTime: function()
    {
        return this._startTime;
    },

    /**
     * @override
     * @return {string}
     */
    color: function()
    {
        return this._style.color;
    },

    /**
     * @override
     * @return {string}
     */
    title: function()
    {
        var startTime = Number.millisToString(this._startOffset);
        return WebInspector.UIString("%s at %s", this._style.title, startTime);
    },

    /**
     * @override
     * @param {!CanvasRenderingContext2D} context
     * @param {number} x
     * @param {number} height
     * @param {number} pixelsPerMillisecond
     */
    draw: function(context, x, height, pixelsPerMillisecond)
    {
        var lowPriorityVisibilityThresholdInPixelsPerMs = 4;

        if (this._style.lowPriority && pixelsPerMillisecond < lowPriorityVisibilityThresholdInPixelsPerMs)
            return;
        context.save();

        if (!this._style.lowPriority) {
            context.strokeStyle = this._style.color;
            context.lineWidth = 2;
            context.beginPath();
            context.moveTo(x, 0);
            context.lineTo(x, height);
            context.stroke();
        }

        if (this._style.tall) {
            context.strokeStyle = this._style.color;
            context.lineWidth = this._style.lineWidth;
            context.translate(this._style.lineWidth < 1 || (this._style.lineWidth & 1) ? 0.5 : 0, 0.5);
            context.beginPath();
            context.moveTo(x, height);
            context.setLineDash(this._style.dashStyle);
            context.lineTo(x, context.canvas.height);
            context.stroke();
        }
        context.restore();
    }
}

/**
 * @constructor
 * @extends {WebInspector.VBox}
 * @implements {WebInspector.TimelineModeView}
 * @implements {WebInspector.FlameChartDelegate}
 * @param {!WebInspector.TimelineModeViewDelegate} delegate
 * @param {!WebInspector.TimelineModel} timelineModel
 * @param {!WebInspector.TimelineFrameModelBase} frameModel
 */
WebInspector.TimelineFlameChartView = function(delegate, timelineModel, frameModel)
{
    WebInspector.VBox.call(this);
    this.element.classList.add("timeline-flamechart");
    this._delegate = delegate;
    this._model = timelineModel;

    this._splitWidget = new WebInspector.SplitWidget(false, false, "timelineFlamechartMainView", 150);

    this._dataProvider = new WebInspector.TimelineFlameChartDataProvider(this._model, frameModel);
    this._mainView = new WebInspector.FlameChart(this._dataProvider, this, true);

    this._networkDataProvider = new WebInspector.TimelineFlameChartNetworkDataProvider(this._model);
    this._networkView = new WebInspector.FlameChart(this._networkDataProvider, this, true);

    if (Runtime.experiments.isEnabled("networkRequestsOnTimeline")) {
        this._splitWidget.setMainWidget(this._mainView);
        this._splitWidget.setSidebarWidget(this._networkView);
        this._splitWidget.show(this.element);
    } else {
        this._mainView.show(this.element);
    }

    this._onMainEntrySelected = this._onEntrySelected.bind(this, this._dataProvider);
    this._onNetworkEntrySelected = this._onEntrySelected.bind(this, this._networkDataProvider);
    this._model.addEventListener(WebInspector.TimelineModel.Events.RecordingStarted, this._onRecordingStarted, this);
    this._mainView.addEventListener(WebInspector.FlameChart.Events.EntrySelected, this._onMainEntrySelected, this);
    this._networkView.addEventListener(WebInspector.FlameChart.Events.EntrySelected, this._onNetworkEntrySelected, this);
    WebInspector.BlackboxSupport.addChangeListener(this._refresh, this);
}

WebInspector.TimelineFlameChartView.prototype = {
    /**
     * @override
     */
    dispose: function()
    {
        this._model.removeEventListener(WebInspector.TimelineModel.Events.RecordingStarted, this._onRecordingStarted, this);
        this._mainView.removeEventListener(WebInspector.FlameChart.Events.EntrySelected, this._onMainEntrySelected, this);
        this._networkView.removeEventListener(WebInspector.FlameChart.Events.EntrySelected, this._onNetworkEntrySelected, this);
        WebInspector.BlackboxSupport.removeChangeListener(this._refresh, this);
    },

    /**
     * @override
     * @param {number} windowStartTime
     * @param {number} windowEndTime
     */
    requestWindowTimes: function(windowStartTime, windowEndTime)
    {
        this._delegate.requestWindowTimes(windowStartTime, windowEndTime);
    },

    /**
     * @override
     * @param {number} startTime
     * @param {number} endTime
     */
    updateRangeSelection: function(startTime, endTime)
    {
        this._delegate.select(WebInspector.TimelineSelection.fromRange(startTime, endTime));
    },

    /**
     * @override
     */
    endRangeSelection: function()
    {
        if (Runtime.experiments.isEnabled("multipleTimelineViews"))
            this._delegate.select(null);
    },

    /**
     * @override
     * @param {?RegExp} textFilter
     */
    refreshRecords: function(textFilter)
    {
        this._refresh();
    },

    /**
     * @override
     */
    wasShown: function()
    {
        this._mainView.scheduleUpdate();
        this._networkView.scheduleUpdate();
    },

    /**
     * @override
     * @return {!WebInspector.Widget}
     */
    view: function()
    {
        return this;
    },

    /**
     * @override
     */
    reset: function()
    {
        this._automaticallySizeWindow = true;
        this._dataProvider.reset();
        this._mainView.reset();
        this._mainView.setWindowTimes(0, Infinity);
        this._networkDataProvider.reset();
        this._networkView.reset();
        this._networkView.setWindowTimes(0, Infinity);
    },

    _onRecordingStarted: function()
    {
        this._automaticallySizeWindow = true;
        this._mainView.reset();
        this._networkView.reset();
    },

    /**
     * @override
     * @param {number} startTime
     * @param {number} endTime
     */
    setWindowTimes: function(startTime, endTime)
    {
        this._mainView.setWindowTimes(startTime, endTime);
        this._networkView.setWindowTimes(startTime, endTime);
        this._networkDataProvider.setWindowTimes(startTime, endTime);
    },

    /**
     * @override
     * @param {number} width
     */
    setSidebarSize: function(width)
    {
    },

    /**
     * @override
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
     * @override
     * @param {?WebInspector.TimelineSelection} selection
     */
    setSelection: function(selection)
    {
        var index = this._dataProvider.entryIndexForSelection(selection);
        this._mainView.setSelectedEntry(index);
        index = this._networkDataProvider.entryIndexForSelection(selection);
        this._networkView.setSelectedEntry(index);
    },

    /**
     * @param {!WebInspector.FlameChartDataProvider} dataProvider
     * @param {!WebInspector.Event} event
     */
    _onEntrySelected: function(dataProvider, event)
    {
        var entryIndex = /** @type{number} */ (event.data);
        this._delegate.select(dataProvider.createSelection(entryIndex));
    },

    /**
     * @param {boolean} enable
     * @param {boolean=} animate
     */
    enableNetworkPane: function(enable, animate)
    {
        if (enable)
            this._splitWidget.showBoth(animate);
        else
            this._splitWidget.hideSidebar(animate);
    },

    _refresh: function()
    {
        this._dataProvider.reset();
        this._mainView.scheduleUpdate();
        this._networkDataProvider.reset();
        this._networkView.scheduleUpdate();
    },

    __proto__: WebInspector.VBox.prototype
}

/**
  * @constructor
  * @param {!WebInspector.TimelineSelection} selection
  * @param {number} entryIndex
  */
WebInspector.TimelineFlameChartView.Selection = function(selection, entryIndex)
{
    this.timelineSelection = selection;
    this.entryIndex = entryIndex;
}
