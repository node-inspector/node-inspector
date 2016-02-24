/**
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
 * @param {!WebInspector.CPUProfileDataModel} cpuProfile
 * @param {?WebInspector.Target} target
 */
WebInspector.CPUFlameChartDataProvider = function(cpuProfile, target)
{
    WebInspector.FlameChartDataProvider.call(this);
    this._cpuProfile = cpuProfile;
    this._target = target;
    this._colorGenerator = WebInspector.CPUFlameChartDataProvider.colorGenerator();
}

WebInspector.CPUFlameChartDataProvider.prototype = {
    /**
     * @override
     * @return {number}
     */
    barHeight: function()
    {
        return 15;
    },

    /**
     * @override
     * @return {number}
     */
    textBaseline: function()
    {
        return 4;
    },

    /**
     * @override
     * @return {number}
     */
    textPadding: function()
    {
        return 2;
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
    minimumBoundary: function()
    {
        return this._cpuProfile.profileStartTime;
    },

    /**
     * @override
     * @return {number}
     */
    totalTime: function()
    {
        return this._cpuProfile.profileHead.totalTime;
    },

    /**
     * @override
     * @return {number}
     */
    maxStackDepth: function()
    {
        return this._maxStackDepth;
    },

    /**
     * @override
     * @return {?WebInspector.FlameChart.TimelineData}
     */
    timelineData: function()
    {
        return this._timelineData || this._calculateTimelineData();
    },

    /**
     * @return {!WebInspector.FlameChart.TimelineData}
     */
    _calculateTimelineData: function()
    {
        /**
         * @constructor
         * @param {number} depth
         * @param {number} duration
         * @param {number} startTime
         * @param {number} selfTime
         * @param {!ProfilerAgent.CPUProfileNode} node
         */
        function ChartEntry(depth, duration, startTime, selfTime, node)
        {
            this.depth = depth;
            this.duration = duration;
            this.startTime = startTime;
            this.selfTime = selfTime;
            this.node = node;
        }

        /** @type {!Array.<?ChartEntry>} */
        var entries = [];
        /** @type {!Array.<number>} */
        var stack = [];
        var maxDepth = 5;

        function onOpenFrame()
        {
            stack.push(entries.length);
            // Reserve space for the entry, as they have to be ordered by startTime.
            // The entry itself will be put there in onCloseFrame.
            entries.push(null);
        }
        function onCloseFrame(depth, node, startTime, totalTime, selfTime)
        {
            var index = stack.pop();
            entries[index] = new ChartEntry(depth, totalTime, startTime, selfTime, node);
            maxDepth = Math.max(maxDepth, depth);
        }
        this._cpuProfile.forEachFrame(onOpenFrame, onCloseFrame);

        /** @type {!Array.<!ProfilerAgent.CPUProfileNode>} */
        var entryNodes = new Array(entries.length);
        var entryLevels = new Uint8Array(entries.length);
        var entryTotalTimes = new Float32Array(entries.length);
        var entrySelfTimes = new Float32Array(entries.length);
        var entryStartTimes = new Float64Array(entries.length);
        var minimumBoundary = this.minimumBoundary();

        for (var i = 0; i < entries.length; ++i) {
            var entry = entries[i];
            entryNodes[i] = entry.node;
            entryLevels[i] = entry.depth;
            entryTotalTimes[i] = entry.duration;
            entryStartTimes[i] = entry.startTime;
            entrySelfTimes[i] = entry.selfTime;
        }

        this._maxStackDepth = maxDepth;

        this._timelineData = new WebInspector.FlameChart.TimelineData(entryLevels, entryTotalTimes, entryStartTimes);

        /** @type {!Array.<!ProfilerAgent.CPUProfileNode>} */
        this._entryNodes = entryNodes;
        this._entrySelfTimes = entrySelfTimes;

        return this._timelineData;
    },

    /**
     * @param {number} ms
     * @return {string}
     */
    _millisecondsToString: function(ms)
    {
        if (ms === 0)
            return "0";
        if (ms < 1000)
            return WebInspector.UIString("%.1f\u2009ms", ms);
        return Number.secondsToString(ms / 1000, true);
    },

    /**
     * @override
     * @param {number} entryIndex
     * @return {?Array<!{title: string, value: (string,!Element)}>}
     */
    prepareHighlightedEntryInfo: function(entryIndex)
    {
        var timelineData = this._timelineData;
        var node = this._entryNodes[entryIndex];
        if (!node)
            return null;

        var entryInfo = [];
        /**
         * @param {string} title
         * @param {string} value
         */
        function pushEntryInfoRow(title, value)
        {
            entryInfo.push({ title: title, value: value });
        }
        var name = WebInspector.beautifyFunctionName(node.functionName);
        pushEntryInfoRow(WebInspector.UIString("Name"), name);
        var selfTime = this._millisecondsToString(this._entrySelfTimes[entryIndex]);
        var totalTime = this._millisecondsToString(timelineData.entryTotalTimes[entryIndex]);
        pushEntryInfoRow(WebInspector.UIString("Self time"), selfTime);
        pushEntryInfoRow(WebInspector.UIString("Total time"), totalTime);
        var text = (new WebInspector.Linkifier()).linkifyScriptLocation(this._target, node.scriptId, node.url, node.lineNumber, node.columnNumber).textContent;
        pushEntryInfoRow(WebInspector.UIString("URL"), text);
        pushEntryInfoRow(WebInspector.UIString("Aggregated self time"), Number.secondsToString(node.selfTime / 1000, true));
        pushEntryInfoRow(WebInspector.UIString("Aggregated total time"), Number.secondsToString(node.totalTime / 1000, true));
        if (node.deoptReason && node.deoptReason !== "no reason")
            pushEntryInfoRow(WebInspector.UIString("Not optimized"), node.deoptReason);

        return entryInfo;
    },

    /**
     * @override
     * @param {number} entryIndex
     * @return {boolean}
     */
    canJumpToEntry: function(entryIndex)
    {
        return this._entryNodes[entryIndex].scriptId !== "0";
    },

    /**
     * @override
     * @param {number} entryIndex
     * @return {string}
     */
    entryTitle: function(entryIndex)
    {
        var node = this._entryNodes[entryIndex];
        return WebInspector.beautifyFunctionName(node.functionName);
    },

    /**
     * @override
     * @param {number} entryIndex
     * @return {?string}
     */
    entryFont: function(entryIndex)
    {
        if (!this._font) {
            this._font = (this.barHeight() - 4) + "px " + WebInspector.fontFamily();
            this._boldFont = "bold " + this._font;
        }
        var node = this._entryNodes[entryIndex];
        var reason = node.deoptReason;
        return (reason && reason !== "no reason") ? this._boldFont : this._font;
    },

    /**
     * @override
     * @param {number} entryIndex
     * @return {string}
     */
    entryColor: function(entryIndex)
    {
        var node = this._entryNodes[entryIndex];
        return this._colorGenerator.colorForID(node.functionName + ":" + node.url);
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
     * @param {number} entryIndex
     * @return {boolean}
     */
    forceDecoration: function(entryIndex)
    {
        return false;
    },

    /**
     * @override
     * @param {number} entryIndex
     * @return {!{startTime: number, endTime: number}}
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
     * @override
     * @return {number}
     */
    paddingLeft: function()
    {
        return 15;
    },

    /**
     * @override
     * @param {number} entryIndex
     * @return {string}
     */
    textColor: function(entryIndex)
    {
        return "#333";
    }
}


/**
 * @return {!WebInspector.FlameChart.ColorGenerator}
 */
WebInspector.CPUFlameChartDataProvider.colorGenerator = function()
{
    if (!WebInspector.CPUFlameChartDataProvider._colorGenerator) {
        var colorGenerator = new WebInspector.FlameChart.ColorGenerator(
            { min: 180, max: 310, count: 7 },
            { min: 50, max: 80, count: 5 },
            { min: 80, max: 90, count: 3 });
        colorGenerator.setColorForID("(idle):", "hsl(0, 0%, 94%)");
        colorGenerator.setColorForID("(program):", "hsl(0, 0%, 80%)");
        colorGenerator.setColorForID("(garbage collector):", "hsl(0, 0%, 80%)");
        WebInspector.CPUFlameChartDataProvider._colorGenerator = colorGenerator;
    }
    return WebInspector.CPUFlameChartDataProvider._colorGenerator;
}


/**
 * @constructor
 * @implements {WebInspector.CPUProfileView.Searchable}
 * @extends {WebInspector.VBox}
 * @param {!WebInspector.FlameChartDataProvider} dataProvider
 */
WebInspector.CPUProfileFlameChart = function(dataProvider)
{
    WebInspector.VBox.call(this);
    this.element.id = "cpu-flame-chart";

    this._overviewPane = new WebInspector.CPUProfileFlameChart.OverviewPane(dataProvider);
    this._overviewPane.show(this.element);

    this._mainPane = new WebInspector.FlameChart(dataProvider, this._overviewPane, true);
    this._mainPane.show(this.element);
    this._mainPane.addEventListener(WebInspector.FlameChart.Events.EntrySelected, this._onEntrySelected, this);
    this._overviewPane.addEventListener(WebInspector.OverviewGrid.Events.WindowChanged, this._onWindowChanged, this);
    this._dataProvider = dataProvider;
    this._searchResults = [];
}

WebInspector.CPUProfileFlameChart.prototype = {
    focus: function()
    {
        this._mainPane.focus();
    },

    /**
     * @param {!WebInspector.Event} event
     */
    _onWindowChanged: function(event)
    {
        var windowLeft = event.data.windowTimeLeft;
        var windowRight = event.data.windowTimeRight;
        this._mainPane.setWindowTimes(windowLeft, windowRight);
    },

    /**
     * @param {number} timeLeft
     * @param {number} timeRight
     */
    selectRange: function(timeLeft, timeRight)
    {
        this._overviewPane._selectRange(timeLeft, timeRight);
    },

    /**
     * @param {!WebInspector.Event} event
     */
    _onEntrySelected: function(event)
    {
        this.dispatchEventToListeners(WebInspector.FlameChart.Events.EntrySelected, event.data);
    },

    update: function()
    {
        this._overviewPane.update();
        this._mainPane.update();
    },

    /**
     * @override
     * @param {!WebInspector.SearchableView.SearchConfig} searchConfig
     * @param {boolean} shouldJump
     * @param {boolean=} jumpBackwards
     * @return {number}
     */
    performSearch: function(searchConfig, shouldJump, jumpBackwards)
    {
        var matcher = createPlainTextSearchRegex(searchConfig.query, searchConfig.caseSensitive ? "": "i");

        var selectedEntryIndex = this._searchResultIndex !== -1 ? this._searchResults[this._searchResultIndex] : -1;
        this._searchResults = [];
        var entriesCount = this._dataProvider._entryNodes.length;
        for(var index = 0; index < entriesCount; ++index) {
            if (this._dataProvider.entryTitle(index).match(matcher))
                this._searchResults.push(index);
        }

        if (this._searchResults.length) {
            this._searchResultIndex = this._searchResults.indexOf(selectedEntryIndex);
            if (this._searchResultIndex === -1)
                this._searchResultIndex = jumpBackwards ? this._searchResults.length - 1 : 0;
            this._mainPane.setSelectedEntry(this._searchResults[this._searchResultIndex]);
        } else
            this.searchCanceled();

        return this._searchResults.length;
    },

    /**
     * @override
     */
    searchCanceled: function()
    {
        this._mainPane.setSelectedEntry(-1);
        this._searchResults = [];
        this._searchResultIndex = -1;
    },

    /**
     * @override
     */
    jumpToNextSearchResult: function()
    {
        this._searchResultIndex = (this._searchResultIndex + 1) % this._searchResults.length;
        this._mainPane.setSelectedEntry(this._searchResults[this._searchResultIndex]);
    },

    /**
     * @override
     */
    jumpToPreviousSearchResult: function()
    {
        this._searchResultIndex = (this._searchResultIndex - 1 + this._searchResults.length) % this._searchResults.length;
        this._mainPane.setSelectedEntry(this._searchResults[this._searchResultIndex]);
    },

    /**
     * @override
     * @return {number}
     */
    currentSearchResultIndex: function()
    {
        return this._searchResultIndex;
    },

    __proto__: WebInspector.VBox.prototype
};

/**
 * @constructor
 * @implements {WebInspector.TimelineGrid.Calculator}
 */
WebInspector.CPUProfileFlameChart.OverviewCalculator = function()
{
}

WebInspector.CPUProfileFlameChart.OverviewCalculator.prototype = {
    /**
     * @override
     * @return {number}
     */
    paddingLeft: function()
    {
        return 0;
    },

    /**
     * @param {!WebInspector.CPUProfileFlameChart.OverviewPane} overviewPane
     */
    _updateBoundaries: function(overviewPane)
    {
        this._minimumBoundaries = overviewPane._dataProvider.minimumBoundary();
        var totalTime = overviewPane._dataProvider.totalTime();
        this._maximumBoundaries = this._minimumBoundaries + totalTime;
        this._xScaleFactor = overviewPane._overviewContainer.clientWidth / totalTime;
    },

    /**
     * @override
     * @param {number} time
     * @return {number}
     */
    computePosition: function(time)
    {
        return (time - this._minimumBoundaries) * this._xScaleFactor;
    },

    /**
     * @override
     * @param {number} value
     * @param {number=} precision
     * @return {string}
     */
    formatTime: function(value, precision)
    {
        return Number.secondsToString((value - this._minimumBoundaries) / 1000, !!precision);
    },

    /**
     * @override
     * @return {number}
     */
    maximumBoundary: function()
    {
        return this._maximumBoundaries;
    },

    /**
     * @override
     * @return {number}
     */
    minimumBoundary: function()
    {
        return this._minimumBoundaries;
    },

    /**
     * @override
     * @return {number}
     */
    zeroTime: function()
    {
        return this._minimumBoundaries;
    },

    /**
     * @override
     * @return {number}
     */
    boundarySpan: function()
    {
        return this._maximumBoundaries - this._minimumBoundaries;
    }
}

/**
 * @constructor
 * @extends {WebInspector.VBox}
 * @implements {WebInspector.FlameChartDelegate}
 * @param {!WebInspector.FlameChartDataProvider} dataProvider
 */
WebInspector.CPUProfileFlameChart.OverviewPane = function(dataProvider)
{
    WebInspector.VBox.call(this);
    this.element.classList.add("cpu-profile-flame-chart-overview-pane");
    this._overviewContainer = this.element.createChild("div", "cpu-profile-flame-chart-overview-container");
    this._overviewGrid = new WebInspector.OverviewGrid("cpu-profile-flame-chart");
    this._overviewGrid.element.classList.add("fill");
    this._overviewCanvas = this._overviewContainer.createChild("canvas", "cpu-profile-flame-chart-overview-canvas");
    this._overviewContainer.appendChild(this._overviewGrid.element);
    this._overviewCalculator = new WebInspector.CPUProfileFlameChart.OverviewCalculator();
    this._dataProvider = dataProvider;
    this._overviewGrid.addEventListener(WebInspector.OverviewGrid.Events.WindowChanged, this._onWindowChanged, this);
}

WebInspector.CPUProfileFlameChart.OverviewPane.prototype = {
    /**
     * @override
     * @param {number} windowStartTime
     * @param {number} windowEndTime
     */
    requestWindowTimes: function(windowStartTime, windowEndTime)
    {
        this._selectRange(windowStartTime, windowEndTime);
    },

    /**
     * @override
     * @param {number} startTime
     * @param {number} endTime
     */
    updateRangeSelection: function(startTime, endTime)
    {
    },

    /**
     * @override
     */
    endRangeSelection: function()
    {
    },

    /**
     * @param {number} timeLeft
     * @param {number} timeRight
     */
    _selectRange: function(timeLeft, timeRight)
    {
        var startTime = this._dataProvider.minimumBoundary();
        var totalTime = this._dataProvider.totalTime();
        this._overviewGrid.setWindow((timeLeft - startTime) / totalTime, (timeRight - startTime) / totalTime);
    },

    /**
     * @param {!WebInspector.Event} event
     */
    _onWindowChanged: function(event)
    {
        var startTime = this._dataProvider.minimumBoundary();
        var totalTime = this._dataProvider.totalTime();
        var data = {
            windowTimeLeft: startTime + this._overviewGrid.windowLeft() * totalTime,
            windowTimeRight: startTime + this._overviewGrid.windowRight() * totalTime
        };
        this.dispatchEventToListeners(WebInspector.OverviewGrid.Events.WindowChanged, data);
    },

    /**
     * @return {?WebInspector.FlameChart.TimelineData}
     */
    _timelineData: function()
    {
        return this._dataProvider.timelineData();
    },

    onResize: function()
    {
        this._scheduleUpdate();
    },

    _scheduleUpdate: function()
    {
        if (this._updateTimerId)
            return;
        this._updateTimerId = this.element.window().requestAnimationFrame(this.update.bind(this));
    },

    update: function()
    {
        this._updateTimerId = 0;
        var timelineData = this._timelineData();
        if (!timelineData)
            return;
        this._resetCanvas(this._overviewContainer.clientWidth, this._overviewContainer.clientHeight - WebInspector.FlameChart.DividersBarHeight);
        this._overviewCalculator._updateBoundaries(this);
        this._overviewGrid.updateDividers(this._overviewCalculator);
        this._drawOverviewCanvas();
    },

    _drawOverviewCanvas: function()
    {
        var canvasWidth = this._overviewCanvas.width;
        var canvasHeight = this._overviewCanvas.height;
        var drawData = this._calculateDrawData(canvasWidth);
        var context = this._overviewCanvas.getContext("2d");
        var ratio = window.devicePixelRatio;
        var offsetFromBottom = ratio;
        var lineWidth = 1;
        var yScaleFactor = canvasHeight / (this._dataProvider.maxStackDepth() * 1.1);
        context.lineWidth = lineWidth;
        context.translate(0.5, 0.5);
        context.strokeStyle = "rgba(20,0,0,0.4)";
        context.fillStyle = "rgba(214,225,254,0.8)";
        context.moveTo(-lineWidth, canvasHeight + lineWidth);
        context.lineTo(-lineWidth, Math.round(canvasHeight - drawData[0] * yScaleFactor - offsetFromBottom));
        var value;
        for (var x = 0; x < canvasWidth; ++x) {
            value = Math.round(canvasHeight - drawData[x] * yScaleFactor - offsetFromBottom);
            context.lineTo(x, value);
        }
        context.lineTo(canvasWidth + lineWidth, value);
        context.lineTo(canvasWidth + lineWidth, canvasHeight + lineWidth);
        context.fill();
        context.stroke();
        context.closePath();
    },

    /**
     * @param {number} width
     * @return {!Uint8Array}
     */
    _calculateDrawData: function(width)
    {
        var dataProvider = this._dataProvider;
        var timelineData = this._timelineData();
        var entryStartTimes = timelineData.entryStartTimes;
        var entryTotalTimes = timelineData.entryTotalTimes;
        var entryLevels = timelineData.entryLevels;
        var length = entryStartTimes.length;
        var minimumBoundary = this._dataProvider.minimumBoundary();

        var drawData = new Uint8Array(width);
        var scaleFactor = width / dataProvider.totalTime();

        for (var entryIndex = 0; entryIndex < length; ++entryIndex) {
            var start = Math.floor((entryStartTimes[entryIndex] - minimumBoundary) * scaleFactor);
            var finish = Math.floor((entryStartTimes[entryIndex] - minimumBoundary + entryTotalTimes[entryIndex]) * scaleFactor);
            for (var x = start; x <= finish; ++x)
                drawData[x] = Math.max(drawData[x], entryLevels[entryIndex] + 1);
        }
        return drawData;
    },

    /**
     * @param {number} width
     * @param {number} height
     */
    _resetCanvas: function(width, height)
    {
        var ratio = window.devicePixelRatio;
        this._overviewCanvas.width = width * ratio;
        this._overviewCanvas.height = height * ratio;
        this._overviewCanvas.style.width = width + "px";
        this._overviewCanvas.style.height = height + "px";
    },

    __proto__: WebInspector.VBox.prototype
}
