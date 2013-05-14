/*
 * Copyright (C) 2013 Google Inc. All rights reserved.
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
 * @param {WebInspector.CPUProfileView} cpuProfileView
 */
WebInspector.FlameChart = function(cpuProfileView)
{
    WebInspector.View.call(this);
    this.registerRequiredCSS("flameChart.css");
    this.element.className = "fill";
    this.element.id = "cpu-flame-chart";

    this._overviewContainer = this.element.createChild("div", "overview-container");
    this._overviewGrid = new WebInspector.OverviewGrid("flame-chart");
    this._overviewCanvas = this._overviewContainer.createChild("canvas", "flame-chart-overview-canvas");
    this._overviewContainer.appendChild(this._overviewGrid.element);
    this._overviewCalculator = new WebInspector.FlameChart.OverviewCalculator();
    this._overviewGrid.addEventListener(WebInspector.OverviewGrid.Events.WindowChanged, this._onWindowChanged, this);

    this._chartContainer = this.element.createChild("div", "chart-container");
    this._timelineGrid = new WebInspector.TimelineGrid();
    this._chartContainer.appendChild(this._timelineGrid.element);
    this._calculator = new WebInspector.FlameChart.Calculator();

    this._canvas = this._chartContainer.createChild("canvas");
    this._canvas.addEventListener("mousemove", this._onMouseMove.bind(this));
    WebInspector.installDragHandle(this._canvas, this._startCanvasDragging.bind(this), this._canvasDragging.bind(this), this._endCanvasDragging.bind(this), "col-resize");

    this._cpuProfileView = cpuProfileView;
    this._windowLeft = 0.0;
    this._windowRight = 1.0;
    this._barHeight = 15;
    this._minWidth = 1;
    this._paddingLeft = 15;
    this._canvas.addEventListener("mousewheel", this._onMouseWheel.bind(this), false);
    this.element.addEventListener("click", this._onClick.bind(this), false);
    this._linkifier = new WebInspector.Linkifier();
    this._highlightedNodeIndex = -1;

    if (!WebInspector.FlameChart._colorGenerator)
        WebInspector.FlameChart._colorGenerator = new WebInspector.FlameChart.ColorGenerator();
}

/**
 * @constructor
 * @implements {WebInspector.TimelineGrid.Calculator}
 */
WebInspector.FlameChart.Calculator = function()
{
}

WebInspector.FlameChart.Calculator.prototype = {
    /**
     * @param {WebInspector.FlameChart} flameChart
     */
    _updateBoundaries: function(flameChart)
    {
        this._minimumBoundaries = flameChart._windowLeft * flameChart._timelineData.totalTime;
        this._maximumBoundaries = flameChart._windowRight * flameChart._timelineData.totalTime;
        this.paddingLeft = flameChart._paddingLeft;
        this._width = flameChart._canvas.width - this.paddingLeft;
        this._timeToPixel = this._width / this.boundarySpan();
    },

    /**
     * @param {number} time
     */
    computePosition: function(time)
    {
        return (time - this._minimumBoundaries) * this._timeToPixel + this.paddingLeft;
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
        return 0;
    },

    boundarySpan: function()
    {
        return this._maximumBoundaries - this._minimumBoundaries;
    }
}

/**
 * @constructor
 * @implements {WebInspector.TimelineGrid.Calculator}
 */
WebInspector.FlameChart.OverviewCalculator = function()
{
}

WebInspector.FlameChart.OverviewCalculator.prototype = {
    /**
     * @param {WebInspector.FlameChart} flameChart
     */
    _updateBoundaries: function(flameChart)
    {
        this._minimumBoundaries = 0;
        this._maximumBoundaries = flameChart._timelineData.totalTime;
        this._xScaleFactor = flameChart._canvas.width / flameChart._timelineData.totalTime;
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

WebInspector.FlameChart.Events = {
    SelectedNode: "SelectedNode"
}

/**
 * @constructor
 */
WebInspector.FlameChart.ColorGenerator = function()
{
    this._colorPairs = {};
    this._currentColorIndex = 0;
}

WebInspector.FlameChart.ColorGenerator.prototype = {
    /**
     * @param {!string} id
     */
    _colorPairForID: function(id)
    {
        var colorPairs = this._colorPairs;
        var colorPair = colorPairs[id];
        if (!colorPair) {
            var currentColorIndex = ++this._currentColorIndex;
            var hue = (currentColorIndex * 5 + 11 * (currentColorIndex % 2)) % 360;
            colorPairs[id] = colorPair = {highlighted: "hsla(" + hue + ", 100%, 33%, 0.7)", normal: "hsla(" + hue + ", 100%, 66%, 0.7)"};
        }
        return colorPair;
    }
}

/**
 * @constructor
 * @param {!Object} colorPair
 * @param {!number} depth
 * @param {!number} duration
 * @param {!number} startTime
 * @param {Object} node
 */
WebInspector.FlameChart.Entry = function(colorPair, depth, duration, startTime, node)
{
    this.colorPair = colorPair;
    this.depth = depth;
    this.duration = duration;
    this.startTime = startTime;
    this.node = node;
    this.selfTime = 0;
}

WebInspector.FlameChart.prototype = {
    /**
     * @param {!number} timeLeft
     * @param {!number} timeRight
     */
    selectRange: function(timeLeft, timeRight)
    {
        this._overviewGrid.setWindow(timeLeft / this._totalTime, timeRight / this._totalTime);
    },

    _onWindowChanged: function(event)
    {
        this._scheduleUpdate();
    },

    _startCanvasDragging: function(event)
    {
        if (!this._timelineData)
            return false;
        this._isDragging = true;
        this._dragStartPoint = event.pageX;
        this._dragStartWindowLeft = this._windowLeft;
        this._dragStartWindowRight = this._windowRight;
        return true;
    },

    _canvasDragging: function(event)
    {
        var pixelShift = this._dragStartPoint - event.pageX;
        var windowShift = pixelShift / this._totalPixels;

        var windowLeft = Math.max(0, this._dragStartWindowLeft + windowShift);
        if (windowLeft === this._windowLeft)
            return;
        windowShift = windowLeft - this._dragStartWindowLeft;
        
        var windowRight = Math.min(1, this._dragStartWindowRight + windowShift);
        if (windowRight === this._windowRight)
            return;
        windowShift = windowRight - this._dragStartWindowRight;
        this._overviewGrid.setWindow(this._dragStartWindowLeft + windowShift, this._dragStartWindowRight + windowShift);
    },

    _endCanvasDragging: function()
    {
        this._isDragging = false;
    },

    _calculateTimelineData: function()
    {
        if (this._cpuProfileView.samples)
            return this._calculateTimelineDataForSamples();

        if (this._timelineData)
            return this._timelineData;

        if (!this._cpuProfileView.profileHead)
            return null;

        var index = 0;
        var entries = [];

        function appendReversedArray(toArray, fromArray)
        {
            for (var i = fromArray.length - 1; i >= 0; --i)
                toArray.push(fromArray[i]);
        }

        var stack = [];
        appendReversedArray(stack, this._cpuProfileView.profileHead.children);

        var levelOffsets = /** @type {Array.<!number>} */ ([0]);
        var levelExitIndexes = /** @type {Array.<!number>} */ ([0]);
        var colorGenerator = WebInspector.FlameChart._colorGenerator;

        while (stack.length) {
            var level = levelOffsets.length - 1;
            var node = stack.pop();
            var offset = levelOffsets[level];

            var colorPair = colorGenerator._colorPairForID(node.functionName + ":" + node.url + ":" + node.lineNumber);

            entries.push(new WebInspector.FlameChart.Entry(colorPair, level, node.totalTime, offset, node));

            ++index;

            levelOffsets[level] += node.totalTime;
            if (node.children.length) {
                levelExitIndexes.push(stack.length);
                levelOffsets.push(offset + node.selfTime / 2);
                appendReversedArray(stack, node.children);
            }

            while (stack.length === levelExitIndexes[levelExitIndexes.length - 1]) {
                levelOffsets.pop();
                levelExitIndexes.pop();
            }
        }

        this._timelineData = {
            entries: entries,
            totalTime: this._cpuProfileView.profileHead.totalTime,
        }

        return this._timelineData;
    },

    _calculateTimelineDataForSamples: function()
    {
        if (this._timelineData)
            return this._timelineData;

        if (!this._cpuProfileView.profileHead)
            return null;

        var samples = this._cpuProfileView.samples;
        var idToNode = this._cpuProfileView._idToNode;
        var samplesCount = samples.length;

        var index = 0;
        var entries = /** @type {Array.<!WebInspector.FlameChart.Entry>} */ ([]);

        var openIntervals = [];
        var stackTrace = [];
        var colorGenerator = WebInspector.FlameChart._colorGenerator;
        for (var sampleIndex = 0; sampleIndex < samplesCount; sampleIndex++) {
            var node = idToNode[samples[sampleIndex]];
            stackTrace.length = 0;
            while (node) {
                stackTrace.push(node);
                node = node.parent;
            }
            stackTrace.pop(); // Remove (root) node

            var depth = 0;
            node = stackTrace.pop();
            var intervalIndex;
            while (node && depth < openIntervals.length && node === openIntervals[depth].node) {
                intervalIndex = openIntervals[depth].index;
                entries[intervalIndex].duration += 1;
                node = stackTrace.pop();
                ++depth;
            }
            if (depth < openIntervals.length)
                openIntervals.length = depth;
            if (!node) {
                entries[intervalIndex].selfTime += 1;
                continue;
            }

            while (node) {
                var colorPair = colorGenerator._colorPairForID(node.functionName + ":" + node.url + ":" + node.lineNumber);

                entries.push(new WebInspector.FlameChart.Entry(colorPair, depth, 1, sampleIndex, node));
                openIntervals.push({node: node, index: index});
                ++index;

                node = stackTrace.pop();
                ++depth;
            }
            entries[entries.length - 1].selfTime += 1;
        }

        this._timelineData = {
            entries: entries,
            totalTime: samplesCount,
        };

        return this._timelineData;
    },

    _onMouseMove: function(event)
    {
        if (this._isDragging)
            return;

        var nodeIndex = this._coordinatesToNodeIndex(event.offsetX, event.offsetY);

        if (this._highlightedNodeIndex === nodeIndex)
            return;

        this._highlightedNodeIndex = nodeIndex;
        this._scheduleUpdate();
    },

    _prepareHighlightedEntryInfo: function()
    {
        if (this._isDragging)
            return null;
        var entry = this._timelineData.entries[this._highlightedNodeIndex];
        if (!entry)
            return null;
        var node = entry.node;
        if (!node)
            return null;

        var entryInfo = [];
        function pushEntryInfoRow(title, text)
        {
            var row = {};
            row.title = title;
            row.text = text;
            entryInfo.push(row);
        }

        pushEntryInfoRow(WebInspector.UIString("Name"), node.functionName);
        if (this._cpuProfileView.samples) {
            pushEntryInfoRow(WebInspector.UIString("Self time"), Number.secondsToString(entry.selfTime / 1000, true));
            pushEntryInfoRow(WebInspector.UIString("Total time"), Number.secondsToString(entry.duration / 1000, true));
        }
        pushEntryInfoRow(WebInspector.UIString("Aggregated self time"), Number.secondsToString(node.selfTime / 1000, true));
        pushEntryInfoRow(WebInspector.UIString("Aggregated total time"), Number.secondsToString(node.totalTime / 1000, true));
        return entryInfo;
    },

    _onClick: function(e)
    {
        if (this._highlightedNodeIndex === -1)
            return;
        var node = this._timelineData.entries[this._highlightedNodeIndex].node;
        this.dispatchEventToListeners(WebInspector.FlameChart.Events.SelectedNode, node);
    },

    _onMouseWheel: function(e)
    {
        if (e.wheelDeltaY) {
            const zoomFactor = 1.1;
            const mouseWheelZoomSpeed = 1 / 120;

            var zoom = Math.pow(zoomFactor, -e.wheelDeltaY * mouseWheelZoomSpeed);
            var overviewReference = (this._pixelWindowLeft + e.offsetX - this._paddingLeft) / this._totalPixels;
            this._overviewGrid.zoom(zoom, overviewReference);
        } else {
            var shift = Number.constrain(-1 * this._windowWidth / 4 * e.wheelDeltaX / 120, -this._windowLeft, 1 - this._windowRight);
            this._overviewGrid.setWindow(this._windowLeft + shift, this._windowRight + shift);
        }
    },

    /**
     * @param {!number} x
     * @param {!number} y
     */
    _coordinatesToNodeIndex: function(x, y)
    {
        var timelineData = this._timelineData;
        if (!timelineData)
            return -1;
        var timelineEntries = timelineData.entries;
        var cursorTime = (x + this._pixelWindowLeft - this._paddingLeft) * this._pixelToTime;
        var cursorLevel = Math.floor((this._canvas.height / window.devicePixelRatio - y) / this._barHeight);

        for (var i = 0; i < timelineEntries.length; ++i) {
            if (cursorTime < timelineEntries[i].startTime)
                return -1;
            if (cursorTime < (timelineEntries[i].startTime + timelineEntries[i].duration)
                && cursorLevel === timelineEntries[i].depth)
                return i;
        }
        return -1;
    },

    onResize: function()
    {
        this._updateOverviewCanvas = true;
        this._scheduleUpdate();
    },

    _drawOverviewCanvas: function(width, height)
    {
        if (!this._timelineData)
            return;

        var timelineEntries = this._timelineData.entries;

        var drawData = new Uint8Array(width);
        var scaleFactor = width / this._totalTime;
        var maxStackDepth = 5; // minimum stack depth for the case when we see no activity.

        for (var nodeIndex = 0; nodeIndex < timelineEntries.length; ++nodeIndex) {
            var entry = timelineEntries[nodeIndex];
            var start = Math.floor(entry.startTime * scaleFactor);
            var finish = Math.floor((entry.startTime + entry.duration) * scaleFactor);
            for (var x = start; x < finish; ++x) {
                drawData[x] = Math.max(drawData[x], entry.depth + 1);
                maxStackDepth = Math.max(maxStackDepth, entry.depth + 1);
            }
        }

        var ratio = window.devicePixelRatio;
        var canvasWidth = width * ratio;
        var canvasHeight = height * ratio;
        this._overviewCanvas.width = canvasWidth;
        this._overviewCanvas.height = canvasHeight;
        this._overviewCanvas.style.width = width + "px";
        this._overviewCanvas.style.height = height + "px";

        var context = this._overviewCanvas.getContext("2d");

        var yScaleFactor = canvasHeight / (maxStackDepth * 1.1);
        context.lineWidth = 1;
        context.translate(0.5, 0.5);
        context.strokeStyle = "rgba(20,0,0,0.4)";
        context.fillStyle = "rgba(214,225,254,0.8)";
        context.moveTo(-1, canvasHeight - 1);
        if (drawData)
          context.lineTo(-1, Math.round(height - drawData[0] * yScaleFactor - 1));
        var value;
        for (var x = 0; x < width; ++x) {
            value = Math.round(canvasHeight - drawData[x] * yScaleFactor - 1);
            context.lineTo(x * ratio, value);
        }
        context.lineTo(canvasWidth + 1, value);
        context.lineTo(canvasWidth + 1, canvasHeight - 1);
        context.fill();
        context.stroke();
        context.closePath();
    },

    /**
     * @param {WebInspector.FlameChart.Entry} entry
     * @param {AnchorBox} anchorBox
     */
    _entryToAnchorBox: function(entry, anchorBox)
    {
        anchorBox.x = Math.floor(entry.startTime * this._timeToPixel) - this._pixelWindowLeft + this._paddingLeft;
        anchorBox.y = this._canvas.height / window.devicePixelRatio - (entry.depth + 1) * this._barHeight;
        anchorBox.width = Math.floor(entry.duration * this._timeToPixel);
        anchorBox.height = this._barHeight;
        if (anchorBox.x < 0) {
            anchorBox.width += anchorBox.x;
            anchorBox.x = 0;
        }
        anchorBox.width = Number.constrain(anchorBox.width, 0, this._canvas.width - anchorBox.x);
    },

    /**
     * @param {!number} height
     * @param {!number} width
     */
    draw: function(width, height)
    {
        var timelineData = this._calculateTimelineData();
        if (!timelineData)
            return;
        var timelineEntries = timelineData.entries;

        var ratio = window.devicePixelRatio;
        var canvasWidth = width * ratio;
        var canvasHeight = height * ratio;
        this._canvas.width = canvasWidth;
        this._canvas.height = canvasHeight;
        this._canvas.style.width = width + "px";
        this._canvas.style.height = height + "px";

        var barHeight = this._barHeight;

        var context = this._canvas.getContext("2d");
        var textPaddingLeft = 2;
        context.scale(ratio, ratio);
        context.font = (barHeight - 3) + "px sans-serif";
        context.textBaseline = "top";
        this._dotsWidth = context.measureText("\u2026").width;
        var visibleTimeLeft = this._timeWindowLeft - this._paddingLeftTime;

        var anchorBox = new AnchorBox();
        for (var i = 0; i < timelineEntries.length; ++i) {
            var entry = timelineEntries[i];
            var startTime = entry.startTime;
            if (startTime > this._timeWindowRight)
                break;
            if ((startTime + entry.duration) < visibleTimeLeft)
                continue;
            this._entryToAnchorBox(entry, anchorBox);
            if (anchorBox.width < this._minWidth)
                continue;

            var colorPair = entry.colorPair;
            var color;
            if (this._highlightedNodeIndex === i)
                color =  colorPair.highlighted;
            else
                color = colorPair.normal;

            context.beginPath();
            context.rect(anchorBox.x, anchorBox.y, anchorBox.width - 1, anchorBox.height - 1);
            context.fillStyle = color;
            context.fill();

            var xText = Math.max(0, anchorBox.x);
            var widthText = anchorBox.width - textPaddingLeft + anchorBox.x - xText;
            var title = this._prepareText(context, entry.node.functionName, widthText);
            if (title) {
                context.fillStyle = "#333";
                context.fillText(title, xText + textPaddingLeft, anchorBox.y - 1);
            }
        }

        var entryInfo = this._prepareHighlightedEntryInfo();
        if (entryInfo)
            this._printEntryInfo(context, entryInfo, 0, 25);
    },

    _printEntryInfo: function(context, entryInfo, x, y)
    {
        const lineHeight = 18;
        const maxTextWidth = 290;
        const paddingLeft = 10;
        const paddingTop = 5;
        const paddingLeftText = 10;
        var maxTitleWidth = 0;
        context.font = "bold " + (this._barHeight - 3) + "px sans-serif";
        for (var i = 0; i < entryInfo.length; ++i)
            maxTitleWidth = Math.max(maxTitleWidth, context.measureText(entryInfo[i].title).width);

        context.beginPath();
        context.rect(x, y, maxTextWidth + 5, lineHeight * entryInfo.length + 5);
        context.strokeStyle = "rgba(0,0,0,0)";
        context.fillStyle = "rgba(254,254,254,0.8)";
        context.fill();
        context.stroke();

        context.fillStyle = "#333";
        for (var i = 0; i < entryInfo.length; ++i)
            context.fillText(entryInfo[i].title, x + paddingLeft, y + lineHeight * i);

        context.font = (this._barHeight - 3) + "px sans-serif";
        for (var i = 0; i < entryInfo.length; ++i) {
            var text = this._prepareText(context, entryInfo[i].text, maxTextWidth - maxTitleWidth - 2 * paddingLeft);
            context.fillText(text, x + paddingLeft + maxTitleWidth + paddingLeft, y + lineHeight * i);
        }
    },

    _prepareText: function(context, title, maxSize)
    {
        if (maxSize < this._dotsWidth)
            return null;
        var titleWidth = context.measureText(title).width;
        if (maxSize > titleWidth)
            return title;
        maxSize -= this._dotsWidth;
        var dotRegExp=/[\.\$]/g;
        var match = dotRegExp.exec(title);
        if (!match) {
            var visiblePartSize = maxSize / titleWidth;
            var newTextLength = Math.floor(title.length * visiblePartSize) + 1;
            var minTextLength = 4;
            if (newTextLength < minTextLength)
                return null;
            var substring;
            do {
                --newTextLength;
                substring = title.substring(0, newTextLength);
            } while (context.measureText(substring).width > maxSize);
            return title.substring(0, newTextLength) + "\u2026";
        }
        while (match) {
            var substring = title.substring(match.index + 1);
            var width = context.measureText(substring).width;
            if (maxSize > width)
                return "\u2026" + substring;
            match = dotRegExp.exec(title);
        }
        var i = 0;
        do {
            ++i;
        } while (context.measureText(title.substring(0, i)).width < maxSize);
        return title.substring(0, i - 1) + "\u2026";
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

        this._totalTime = this._timelineData.totalTime;
        this._timeWindowLeft = this._windowLeft * this._totalTime;
        this._timeWindowRight = this._windowRight * this._totalTime;

        this._pixelWindowWidth = this._chartContainer.clientWidth;
        this._totalPixels = Math.floor(this._pixelWindowWidth / this._windowWidth);
        this._pixelWindowLeft = Math.floor(this._totalPixels * this._windowLeft);
        this._pixelWindowRight = Math.floor(this._totalPixels * this._windowRight);

        this._timeToPixel = this._totalPixels / this._totalTime;
        this._pixelToTime = this._totalTime / this._totalPixels;
        this._paddingLeftTime = this._paddingLeft / this._timeToPixel;
    },

    update: function()
    {
        this._updateTimerId = 0;
        if (!this._timelineData)
            this._calculateTimelineData();
        if (!this._timelineData)
            return;
        this._updateBoundaries();
        this.draw(this._chartContainer.clientWidth, this._chartContainer.clientHeight);
        this._calculator._updateBoundaries(this);
        this._overviewCalculator._updateBoundaries(this);
        this._timelineGrid.element.style.width = this.element.clientWidth;
        this._timelineGrid.updateDividers(this._calculator);
        this._overviewGrid.updateDividers(this._overviewCalculator);
        if (this._updateOverviewCanvas) {
            this._drawOverviewCanvas(this._overviewContainer.clientWidth, this._overviewContainer.clientHeight - 20);
            this._updateOverviewCanvas = false;
        }
    },

    __proto__: WebInspector.View.prototype
};
