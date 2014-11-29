/**
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
 * @interface
 */
WebInspector.FlameChartDelegate = function() { }

WebInspector.FlameChartDelegate.prototype = {
    /**
     * @param {number} startTime
     * @param {number} endTime
     */
    requestWindowTimes: function(startTime, endTime) { },

    /**
     * @param {number} startTime
     * @param {number} endTime
     */
    updateBoxSelection: function(startTime, endTime) { }
}

/**
 * @constructor
 * @extends {WebInspector.HBox}
 * @param {!WebInspector.FlameChartDataProvider} dataProvider
 * @param {!WebInspector.FlameChartDelegate} flameChartDelegate
 * @param {boolean} isTopDown
 */
WebInspector.FlameChart = function(dataProvider, flameChartDelegate, isTopDown)
{
    WebInspector.HBox.call(this, true);
    this.registerRequiredCSS("ui/flameChart.css");
    this.contentElement.classList.add("flame-chart-main-pane");
    this._flameChartDelegate = flameChartDelegate;
    this._isTopDown = isTopDown;

    this._calculator = new WebInspector.FlameChart.Calculator();

    this._canvas = this.contentElement.createChild("canvas");
    this._canvas.tabIndex = 1;
    this.setDefaultFocusedElement(this._canvas);
    this._canvas.addEventListener("mousemove", this._onMouseMove.bind(this), false);
    this._canvas.addEventListener("mousewheel", this._onMouseWheel.bind(this), false);
    this._canvas.addEventListener("click", this._onClick.bind(this), false);
    this._canvas.addEventListener("keydown", this._onKeyDown.bind(this), false);
    WebInspector.installDragHandle(this._canvas, this._startCanvasDragging.bind(this), this._canvasDragging.bind(this), this._endCanvasDragging.bind(this), "move", null);

    this._vScrollElement = this.contentElement.createChild("div", "flame-chart-v-scroll");
    this._vScrollContent = this._vScrollElement.createChild("div");
    this._vScrollElement.addEventListener("scroll", this.scheduleUpdate.bind(this), false);

    this._entryInfo = this.contentElement.createChild("div", "flame-chart-entry-info");
    this._markerHighlighElement = this.contentElement.createChild("div", "flame-chart-marker-highlight-element");
    this._highlightElement = this.contentElement.createChild("div", "flame-chart-highlight-element");
    this._selectedElement = this.contentElement.createChild("div", "flame-chart-selected-element");
    this._selectionOverlay = this.contentElement.createChild("div", "flame-chart-selection-overlay hidden");
    this._selectedTimeSpanLabel = this._selectionOverlay.createChild("div", "time-span");

    this._dataProvider = dataProvider;

    this._windowLeft = 0.0;
    this._windowRight = 1.0;
    this._windowWidth = 1.0;
    this._timeWindowLeft = 0;
    this._timeWindowRight = Infinity;
    this._barHeight = dataProvider.barHeight();
    this._barHeightDelta = this._isTopDown ? -this._barHeight : this._barHeight;
    this._minWidth = 2;
    this._paddingLeft = this._dataProvider.paddingLeft();
    this._markerPadding = 2;
    this._markerRadius = this._barHeight / 2 - this._markerPadding;
    this._highlightedMarkerIndex = -1;
    this._highlightedEntryIndex = -1;
    this._selectedEntryIndex = -1;
    this._rawTimelineDataLength = 0;
    this._textWidth = {};
}

WebInspector.FlameChart.DividersBarHeight = 20;

WebInspector.FlameChart.MinimalTimeWindowMs = 0.01;

/**
 * @interface
 */
WebInspector.FlameChartDataProvider = function()
{
}

/**
 * @constructor
 * @param {!Array.<number>|!Uint8Array} entryLevels
 * @param {!Array.<number>|!Float32Array} entryTotalTimes
 * @param {!Array.<number>|!Float64Array} entryStartTimes
 */
WebInspector.FlameChart.TimelineData = function(entryLevels, entryTotalTimes, entryStartTimes)
{
    this.entryLevels = entryLevels;
    this.entryTotalTimes = entryTotalTimes;
    this.entryStartTimes = entryStartTimes;
    /** @type {!Array.<number>} */
    this.markerTimestamps = [];
}

WebInspector.FlameChartDataProvider.prototype = {
    /**
     * @return {number}
     */
    barHeight: function() { },

    /**
     * @param {number} startTime
     * @param {number} endTime
     * @return {?Array.<number>}
     */
    dividerOffsets: function(startTime, endTime) { },

    /**
     * @param {number} index
     * @return {string}
     */
    markerColor: function(index) { },

    /**
     * @param {number} index
     * @return {string}
     */
    markerTitle: function(index) { },

    /**
     * @param {number} index
     * @return {boolean}
     */
    isTallMarker: function(index) { },

    /**
     * @return {number}
     */
    minimumBoundary: function() { },

    /**
     * @return {number}
     */
    totalTime: function() { },

    /**
     * @return {number}
     */
    maxStackDepth: function() { },

    /**
     * @return {?WebInspector.FlameChart.TimelineData}
     */
    timelineData: function() { },

    /**
     * @param {number} entryIndex
     * @return {?Array.<!{title: string, text: string}>}
     */
    prepareHighlightedEntryInfo: function(entryIndex) { },

    /**
     * @param {number} entryIndex
     * @return {boolean}
     */
    canJumpToEntry: function(entryIndex) { },

    /**
     * @param {number} entryIndex
     * @return {?string}
     */
    entryTitle: function(entryIndex) { },

    /**
     * @param {number} entryIndex
     * @return {?string}
     */
    entryFont: function(entryIndex) { },

    /**
     * @param {number} entryIndex
     * @return {string}
     */
    entryColor: function(entryIndex) { },

    /**
     * @param {number} entryIndex
     * @param {!CanvasRenderingContext2D} context
     * @param {?string} text
     * @param {number} barX
     * @param {number} barY
     * @param {number} barWidth
     * @param {number} barHeight
     * @param {function(number):number} timeToPosition
     * @return {boolean}
     */
    decorateEntry: function(entryIndex, context, text, barX, barY, barWidth, barHeight, timeToPosition) { },

    /**
     * @param {number} entryIndex
     * @return {boolean}
     */
    forceDecoration: function(entryIndex) { },

    /**
     * @param {number} entryIndex
     * @return {string}
     */
    textColor: function(entryIndex) { },

    /**
     * @return {number}
     */
    textBaseline: function() { },

    /**
     * @return {number}
     */
    textPadding: function() { },

    /**
     * @return {?{startTime: number, endTime: number}}
     */
    highlightTimeRange: function(entryIndex) { },

    /**
     * @return {number}
     */
    paddingLeft: function() { },
}

WebInspector.FlameChart.Events = {
    EntrySelected: "EntrySelected"
}


/**
 * @constructor
 * @param {!{min: number, max: number, count: number}|number=} hueSpace
 * @param {!{min: number, max: number, count: number}|number=} satSpace
 * @param {!{min: number, max: number, count: number}|number=} lightnessSpace
 * @param {!{min: number, max: number, count: number}|number=} alphaSpace
 */
WebInspector.FlameChart.ColorGenerator = function(hueSpace, satSpace, lightnessSpace, alphaSpace)
{
    this._hueSpace = hueSpace || { min: 0, max: 360, count: 20 };
    this._satSpace = satSpace || 67;
    this._lightnessSpace = lightnessSpace || 80;
    this._alphaSpace = alphaSpace || 1;
    this._colors = {};
}

WebInspector.FlameChart.ColorGenerator.prototype = {
    /**
     * @param {string} id
     * @param {string|!CanvasGradient} color
     */
    setColorForID: function(id, color)
    {
        this._colors[id] = color;
    },

    /**
     * @param {string} id
     * @return {string}
     */
    colorForID: function(id)
    {
        var color = this._colors[id];
        if (!color) {
            color = this._generateColorForID(id);
            this._colors[id] = color;
        }
        return color;
    },

    /**
     * @param {string} id
     * @return {string}
     */
    _generateColorForID: function(id)
    {
        var hash = id.hashCode();
        var h = this._indexToValueInSpace(hash, this._hueSpace);
        var s = this._indexToValueInSpace(hash, this._satSpace);
        var l = this._indexToValueInSpace(hash, this._lightnessSpace);
        var a = this._indexToValueInSpace(hash, this._alphaSpace);
        return "hsla(" + h + ", " + s + "%, " + l + "%, " + a + ")";
    },

    /**
     * @param {number} index
     * @param {!{min: number, max: number, count: number}|number} space
     * @return {number}
     */
    _indexToValueInSpace: function(index, space)
    {
        if (typeof space === "number")
            return space;
        index %= space.count;
        return space.min + Math.floor(index / space.count * (space.max - space.min));
    }
}


/**
 * @constructor
 * @implements {WebInspector.TimelineGrid.Calculator}
 */
WebInspector.FlameChart.Calculator = function()
{
    this._paddingLeft = 0;
}

WebInspector.FlameChart.Calculator.prototype = {
    /**
     * @return {number}
     */
    paddingLeft: function()
    {
        return this._paddingLeft;
    },

    /**
     * @param {!WebInspector.FlameChart} mainPane
     */
    _updateBoundaries: function(mainPane)
    {
        this._totalTime = mainPane._dataProvider.totalTime();
        this._zeroTime = mainPane._dataProvider.minimumBoundary();
        this._minimumBoundaries = this._zeroTime + mainPane._windowLeft * this._totalTime;
        this._maximumBoundaries = this._zeroTime + mainPane._windowRight * this._totalTime;
        this._paddingLeft = mainPane._paddingLeft;
        this._width = mainPane._canvas.width / window.devicePixelRatio - this._paddingLeft;
        this._timeToPixel = this._width / this.boundarySpan();
    },

    /**
     * @param {number} time
     * @return {number}
     */
    computePosition: function(time)
    {
        return Math.round((time - this._minimumBoundaries) * this._timeToPixel + this._paddingLeft);
    },

    /**
     * @param {number} value
     * @param {number=} precision
     * @return {string}
     */
    formatTime: function(value, precision)
    {
        return Number.preciseMillisToString(value - this._zeroTime, precision);
    },

    /**
     * @return {number}
     */
    maximumBoundary: function()
    {
        return this._maximumBoundaries;
    },

    /**
     * @return {number}
     */
    minimumBoundary: function()
    {
        return this._minimumBoundaries;
    },

    /**
     * @return {number}
     */
    zeroTime: function()
    {
        return this._zeroTime;
    },

    /**
     * @return {number}
     */
    boundarySpan: function()
    {
        return this._maximumBoundaries - this._minimumBoundaries;
    }
}

WebInspector.FlameChart.prototype = {
    _resetCanvas: function()
    {
        var ratio = window.devicePixelRatio;
        this._canvas.width = this._offsetWidth * ratio;
        this._canvas.height = this._offsetHeight * ratio;
        this._canvas.style.width = this._offsetWidth + "px";
        this._canvas.style.height = this._offsetHeight + "px";
    },

    /**
     * @return {?WebInspector.FlameChart.TimelineData}
     */
    _timelineData: function()
    {
        var timelineData = this._dataProvider.timelineData();
        if (timelineData !== this._rawTimelineData || timelineData.entryStartTimes.length !== this._rawTimelineDataLength)
            this._processTimelineData(timelineData);
        return this._rawTimelineData;
    },

    _cancelAnimation: function()
    {
        if (this._cancelWindowTimesAnimation) {
            this._timeWindowLeft = this._pendingAnimationTimeLeft;
            this._timeWindowRight = this._pendingAnimationTimeRight;
            this._cancelWindowTimesAnimation();
            delete this._cancelWindowTimesAnimation;
        }
    },

    _revealEntry: function(entryIndex)
    {
        var timelineData = this._timelineData();
        if (!timelineData)
            return;
        var entryStartTime = timelineData.entryStartTimes[entryIndex];
        var entryTotalTime = timelineData.entryTotalTimes[entryIndex];
        var entryEndTime = entryStartTime + entryTotalTime;
        var minEntryTimeWindow = Math.min(entryTotalTime, this._timeWindowRight - this._timeWindowLeft);

        var y = this._levelToHeight(timelineData.entryLevels[entryIndex]);
        if (y < this._vScrollElement.scrollTop)
            this._vScrollElement.scrollTop = y;
        else if (y > this._vScrollElement.scrollTop + this._offsetHeight + this._barHeightDelta)
            this._vScrollElement.scrollTop = y - this._offsetHeight - this._barHeightDelta;

        if (this._timeWindowLeft > entryEndTime) {
            var delta = this._timeWindowLeft - entryEndTime + minEntryTimeWindow;
            this._flameChartDelegate.requestWindowTimes(this._timeWindowLeft - delta, this._timeWindowRight - delta);
        } else if (this._timeWindowRight < entryStartTime) {
            var delta = entryStartTime - this._timeWindowRight + minEntryTimeWindow;
            this._flameChartDelegate.requestWindowTimes(this._timeWindowLeft + delta, this._timeWindowRight + delta);
        }
    },

    /**
     * @param {number} startTime
     * @param {number} endTime
     */
    setWindowTimes: function(startTime, endTime)
    {
        if (this._muteAnimation || this._timeWindowLeft === 0 || this._timeWindowRight === Infinity || (startTime === 0 && endTime === Infinity)) {
            // Initial setup.
            this._timeWindowLeft = startTime;
            this._timeWindowRight = endTime;
            this.scheduleUpdate();
            return;
        }

        this._cancelAnimation();
        this._cancelWindowTimesAnimation = WebInspector.animateFunction(this.element.window(), this._animateWindowTimes.bind(this),
            [{from: this._timeWindowLeft, to: startTime}, {from: this._timeWindowRight, to: endTime}], 5,
            this._animationCompleted.bind(this));
        this._pendingAnimationTimeLeft = startTime;
        this._pendingAnimationTimeRight = endTime;
    },

    /**
     * @param {number} startTime
     * @param {number} endTime
     */
    _animateWindowTimes: function(startTime, endTime)
    {
        this._timeWindowLeft = startTime;
        this._timeWindowRight = endTime;
        this.update();
    },

    _animationCompleted: function()
    {
        delete this._cancelWindowTimesAnimation;
    },

    /**
     * @param {!MouseEvent} event
     */
    _startCanvasDragging: function(event)
    {
        if (event.shiftKey) {
            this._startBoxSelection(event);
            this._isDragging = true;
            return true;
        }
        if (!this._timelineData() || this._timeWindowRight === Infinity)
            return false;
        this._isDragging = true;
        this._maxDragOffset = 0;
        this._dragStartPointX = event.pageX;
        this._dragStartPointY = event.pageY;
        this._dragStartScrollTop = this._vScrollElement.scrollTop;
        this._dragStartWindowLeft = this._timeWindowLeft;
        this._dragStartWindowRight = this._timeWindowRight;
        this._canvas.style.cursor = "";

        return true;
    },

    /**
     * @param {!MouseEvent} event
     */
    _canvasDragging: function(event)
    {
        if (this._isSelecting) {
            this._updateBoxSelection(event);
            return;
        }
        var pixelShift = this._dragStartPointX - event.pageX;
        this._dragStartPointX = event.pageX;
        this._muteAnimation = true;
        this._handlePanGesture(pixelShift * this._pixelToTime);
        this._muteAnimation = false;

        var pixelScroll = this._dragStartPointY - event.pageY;
        this._vScrollElement.scrollTop = this._dragStartScrollTop + pixelScroll;
        this._maxDragOffset = Math.max(this._maxDragOffset, Math.abs(pixelShift));
    },

    _endCanvasDragging: function()
    {
        this._hideBoxSelection();
        this._isDragging = false;
    },

    /**
     * @param {!MouseEvent} event
     */
    _startBoxSelection: function(event)
    {
        this._selectionOffsetShiftX = event.offsetX - event.pageX;
        this._selectionOffsetShiftY = event.offsetY - event.pageY;
        this._selectionStartX = event.offsetX;
        this._selectionStartY = event.offsetY;
        this._isSelecting = true;
        var style = this._selectionOverlay.style;
        style.left = this._selectionStartX + "px";
        style.top = this._selectionStartY + "px";
        style.width = "1px";
        style.height = "1px";
        this._selectedTimeSpanLabel.textContent = "";
        this._selectionOverlay.classList.remove("hidden");
    },

    _hideBoxSelection: function()
    {
        this._selectionOffsetShiftX = null;
        this._selectionOffsetShiftY = null;
        this._selectionStartX = null;
        this._selectionStartY = null;
        this._isSelecting = false;
        this._selectionOverlay.classList.add("hidden");
    },

    /**
     * @param {!MouseEvent} event
     */
    _updateBoxSelection: function(event)
    {
        var x = event.pageX + this._selectionOffsetShiftX;
        var y = event.pageY + this._selectionOffsetShiftY;
        x = Number.constrain(x, 0, this._offsetWidth);
        y = Number.constrain(y, 0, this._offsetHeight);
        var style = this._selectionOverlay.style;
        style.left = Math.min(x, this._selectionStartX) + "px";
        style.top = Math.min(y, this._selectionStartY) + "px";
        var selectionWidth = Math.abs(x - this._selectionStartX)
        style.width =  selectionWidth + "px";
        style.height = Math.abs(y - this._selectionStartY) + "px";

        var timeSpan = selectionWidth * this._pixelToTime;
        this._selectedTimeSpanLabel.textContent =  Number.preciseMillisToString(timeSpan, 2);
        var start = this._cursorTime(this._selectionStartX);
        var end = this._cursorTime(x);
        if (end > start)
            this._flameChartDelegate.updateBoxSelection(start, end);
        else
            this._flameChartDelegate.updateBoxSelection(end, start);
    },

    /**
     * @param {!Event} event
     */
    _onMouseMove: function(event)
    {
        this._lastMouseOffsetX = event.offsetX;

        if (!this._enabled())
            return;

        if (this._isDragging)
            return;

        var inDividersBar = event.offsetY < WebInspector.FlameChart.DividersBarHeight;
        this._highlightedMarkerIndex = inDividersBar ? this._markerIndexAtPosition(event.offsetX) : -1;
        this._updateMarkerHighlight();
        if (inDividersBar)
            return;

        var entryIndex = this._coordinatesToEntryIndex(event.offsetX, event.offsetY);

        if (this._highlightedEntryIndex === entryIndex)
            return;

        if (entryIndex === -1 || !this._dataProvider.canJumpToEntry(entryIndex))
            this._canvas.style.cursor = "default";
        else
            this._canvas.style.cursor = "pointer";

        this._highlightedEntryIndex = entryIndex;

        this._updateElementPosition(this._highlightElement, this._highlightedEntryIndex);
        this._entryInfo.removeChildren();

        if (this._highlightedEntryIndex === -1)
            return;

        if (!this._isDragging) {
            var entryInfo = this._dataProvider.prepareHighlightedEntryInfo(this._highlightedEntryIndex);
            if (entryInfo)
                this._entryInfo.appendChild(this._buildEntryInfo(entryInfo));
        }
    },

    _onClick: function()
    {
        this.focus();
        // onClick comes after dragStart and dragEnd events.
        // So if there was drag (mouse move) in the middle of that events
        // we skip the click. Otherwise we jump to the sources.
        const clickThreshold = 5;
        if (this._maxDragOffset > clickThreshold)
            return;
        if (this._highlightedEntryIndex === -1)
            return;
        this.dispatchEventToListeners(WebInspector.FlameChart.Events.EntrySelected, this._highlightedEntryIndex);
    },

    /**
     * @param {!Event} e
     */
    _onMouseWheel: function(e)
    {
        if (!this._enabled())
            return;
        // Pan vertically when shift down only.
        var panVertically = e.shiftKey && (e.wheelDeltaY || Math.abs(e.wheelDeltaX) === 120);
        var panHorizontally = Math.abs(e.wheelDeltaX) > Math.abs(e.wheelDeltaY) && !e.shiftKey;
        if (panVertically) {
            this._vScrollElement.scrollTop -= (e.wheelDeltaY || e.wheelDeltaX) / 120 * this._offsetHeight / 8;
        } else if (panHorizontally) {
            var shift = -e.wheelDeltaX * this._pixelToTime;
            this._muteAnimation = true;
            this._handlePanGesture(shift);
            this._muteAnimation = false;
        } else {  // Zoom.
            const mouseWheelZoomSpeed = 1 / 120;
            this._handleZoomGesture(Math.pow(1.2, -(e.wheelDeltaY || e.wheelDeltaX) * mouseWheelZoomSpeed) - 1);
        }

        // Block swipe gesture.
        e.consume(true);
    },

    /**
     * @param {!Event} e
     */
    _onKeyDown: function(e)
    {
        if (e.altKey || e.ctrlKey || e.metaKey)
            return;
        var zoomMultiplier = e.shiftKey ? 0.8 : 0.3;
        var panMultiplier = e.shiftKey ? 320 : 80;
        if (e.keyCode === "A".charCodeAt(0)) {
            this._handlePanGesture(-panMultiplier * this._pixelToTime);
            e.consume(true);
        } else if (e.keyCode === "D".charCodeAt(0)) {
            this._handlePanGesture(panMultiplier * this._pixelToTime);
            e.consume(true);
        } else if (e.keyCode === "W".charCodeAt(0)) {
            this._handleZoomGesture(-zoomMultiplier);
            e.consume(true);
        } else if (e.keyCode === "S".charCodeAt(0)) {
            this._handleZoomGesture(zoomMultiplier);
            e.consume(true);
        }
    },

    /**
     * @param {number} zoom
     */
    _handleZoomGesture: function(zoom)
    {
        this._cancelAnimation();
        var bounds = this._windowForGesture();
        var cursorTime = this._cursorTime(this._lastMouseOffsetX);
        bounds.left += (bounds.left - cursorTime) * zoom;
        bounds.right += (bounds.right - cursorTime) * zoom;
        this._requestWindowTimes(bounds);
    },

    /**
     * @param {number} shift
     */
    _handlePanGesture: function(shift)
    {
        this._cancelAnimation();
        var bounds = this._windowForGesture();
        shift = Number.constrain(shift, this._minimumBoundary - bounds.left, this._totalTime + this._minimumBoundary - bounds.right);
        bounds.left += shift;
        bounds.right += shift;
        this._requestWindowTimes(bounds);
    },

    /**
     * @return {{left: number, right: number}}
     */
    _windowForGesture: function()
    {
        var windowLeft = this._timeWindowLeft ? this._timeWindowLeft : this._dataProvider.minimumBoundary();
        var windowRight = this._timeWindowRight !== Infinity ? this._timeWindowRight : this._dataProvider.minimumBoundary() + this._dataProvider.totalTime();
        return {left: windowLeft, right: windowRight};
    },

    /**
     * @param {{left: number, right: number}} bounds
     */
    _requestWindowTimes: function(bounds)
    {
        bounds.left = Number.constrain(bounds.left, this._minimumBoundary, this._totalTime + this._minimumBoundary);
        bounds.right = Number.constrain(bounds.right, this._minimumBoundary, this._totalTime + this._minimumBoundary);
        if (bounds.right - bounds.left < WebInspector.FlameChart.MinimalTimeWindowMs)
            return;
        this._flameChartDelegate.requestWindowTimes(bounds.left, bounds.right);
    },

    /**
     * @param {number} x
     * @return {number}
     */
    _cursorTime: function(x)
    {
        return (x + this._pixelWindowLeft - this._paddingLeft) * this._pixelToTime + this._minimumBoundary;
    },

    /**
     * @param {number} x
     * @param {number} y
     * @return {number}
     */
    _coordinatesToEntryIndex: function(x, y)
    {
        y += this._scrollTop;
        var timelineData = this._timelineData();
        if (!timelineData)
            return -1;
        var cursorTime = this._cursorTime(x);
        var cursorLevel;
        var offsetFromLevel;
        if (this._isTopDown) {
            cursorLevel = Math.floor((y - WebInspector.FlameChart.DividersBarHeight) / this._barHeight);
            offsetFromLevel = y - WebInspector.FlameChart.DividersBarHeight - cursorLevel * this._barHeight;
        } else {
            cursorLevel = Math.floor((this._canvas.height / window.devicePixelRatio - y) / this._barHeight);
            offsetFromLevel = this._canvas.height / window.devicePixelRatio - cursorLevel * this._barHeight;
        }
        var entryStartTimes = timelineData.entryStartTimes;
        var entryTotalTimes = timelineData.entryTotalTimes;
        var entryIndexes = this._timelineLevels[cursorLevel];
        if (!entryIndexes || !entryIndexes.length)
            return -1;

        /**
         * @param {number} time
         * @param {number} entryIndex
         * @return {number}
         */
        function comparator(time, entryIndex)
        {
            return time - entryStartTimes[entryIndex];
        }
        var indexOnLevel = Math.max(entryIndexes.upperBound(cursorTime, comparator) - 1, 0);

        /**
         * @this {WebInspector.FlameChart}
         * @param {number} entryIndex
         * @return {boolean}
         */
        function checkEntryHit(entryIndex)
        {
            if (entryIndex === undefined)
                return false;
            var startTime = entryStartTimes[entryIndex];
            var duration = entryTotalTimes[entryIndex];
            if (isNaN(duration)) {
                var dx = (startTime - cursorTime) / this._pixelToTime;
                var dy = this._barHeight / 2 - offsetFromLevel;
                return dx * dx + dy * dy < this._markerRadius * this._markerRadius;
            }
            var endTime = startTime + duration;
            var barThreshold = 3 * this._pixelToTime;
            return startTime - barThreshold < cursorTime && cursorTime < endTime + barThreshold;
        }

        var entryIndex = entryIndexes[indexOnLevel];
        if (checkEntryHit.call(this, entryIndex))
            return entryIndex;
        entryIndex = entryIndexes[indexOnLevel + 1];
        if (checkEntryHit.call(this, entryIndex))
            return entryIndex;
        return -1;
    },

    /**
     * @param {number} x
     * @return {number}
     */
    _markerIndexAtPosition: function(x)
    {
        var markers = this._timelineData().markerTimestamps;
        if (!markers)
            return -1;
        var accurracyOffsetPx = 1;
        var time = this._cursorTime(x);
        var leftTime = this._cursorTime(x - accurracyOffsetPx);
        var rightTime = this._cursorTime(x + accurracyOffsetPx);

        /**
         * @param {number} time
         * @param {number} markerTimestamp
         * @return {number}
         */
        function comparator(time, markerTimestamp)
        {
            return time - markerTimestamp;
        }
        var left = markers.lowerBound(leftTime, comparator);
        var markerIndex = -1;
        var distance = Infinity;
        for (var i = left; i < markers.length && markers[i] < rightTime; i++) {
            var nextDistance = Math.abs(markers[i] - time);
            if (nextDistance < distance) {
                markerIndex = i;
                distance = nextDistance;
            }
        }
        return markerIndex;
    },

    /**
     * @param {number} height
     * @param {number} width
     */
    _draw: function(width, height)
    {
        var timelineData = this._timelineData();
        if (!timelineData)
            return;

        var context = this._canvas.getContext("2d");
        context.save();
        var ratio = window.devicePixelRatio;
        context.scale(ratio, ratio);

        var timeWindowRight = this._timeWindowRight;
        var timeWindowLeft = this._timeWindowLeft;
        var timeToPixel = this._timeToPixel;
        var pixelWindowLeft = this._pixelWindowLeft;
        var paddingLeft = this._paddingLeft;
        var minWidth = this._minWidth;
        var entryTotalTimes = timelineData.entryTotalTimes;
        var entryStartTimes = timelineData.entryStartTimes;
        var entryLevels = timelineData.entryLevels;

        var titleIndices = new Uint32Array(entryTotalTimes.length);
        var nextTitleIndex = 0;
        var markerIndices = new Uint32Array(entryTotalTimes.length);
        var nextMarkerIndex = 0;
        var textPadding = this._dataProvider.textPadding();
        this._minTextWidth = 2 * textPadding + this._measureWidth(context, "\u2026");
        var minTextWidth = this._minTextWidth;

        var barHeight = this._barHeight;

        var timeToPosition = this._timeToPosition.bind(this);
        var textBaseHeight = this._baseHeight + barHeight - this._dataProvider.textBaseline();
        var colorBuckets = {};
        var minVisibleBarLevel = Math.max(Math.floor((this._scrollTop - this._baseHeight) / barHeight), 0);
        var maxVisibleBarLevel = Math.min(Math.floor((this._scrollTop - this._baseHeight + height) / barHeight), this._dataProvider.maxStackDepth());

        context.translate(0, -this._scrollTop);

        function comparator(time, entryIndex)
        {
            return time - entryStartTimes[entryIndex];
        }

        for (var level = minVisibleBarLevel; level <= maxVisibleBarLevel; ++level) {
            // Entries are ordered by start time within a level, so find the last visible entry.
            var levelIndexes = this._timelineLevels[level];
            var rightIndexOnLevel = levelIndexes.lowerBound(timeWindowRight, comparator) - 1;
            var lastDrawOffset = Infinity;
            for (var entryIndexOnLevel = rightIndexOnLevel; entryIndexOnLevel >= 0; --entryIndexOnLevel) {
                var entryIndex = levelIndexes[entryIndexOnLevel];
                var entryStartTime = entryStartTimes[entryIndex];
                var entryOffsetRight = entryStartTime + (isNaN(entryTotalTimes[entryIndex]) ? 0 : entryTotalTimes[entryIndex]);
                if (entryOffsetRight <= timeWindowLeft)
                    break;

                var barX = this._timeToPosition(entryStartTime);
                if (barX >= lastDrawOffset)
                    continue;
                var barRight = Math.min(this._timeToPosition(entryOffsetRight), lastDrawOffset);
                lastDrawOffset = barX;

                var color = this._dataProvider.entryColor(entryIndex);
                var bucket = colorBuckets[color];
                if (!bucket) {
                    bucket = [];
                    colorBuckets[color] = bucket;
                }
                bucket.push(entryIndex);
            }
        }

        var colors = Object.keys(colorBuckets);
        // We don't use for-in here because it couldn't be optimized.
        for (var c = 0; c < colors.length; ++c) {
            var color = colors[c];
            context.fillStyle = color;
            context.strokeStyle = color;
            var indexes = colorBuckets[color];

            // First fill the boxes.
            context.beginPath();
            for (var i = 0; i < indexes.length; ++i) {
                var entryIndex = indexes[i];
                var entryStartTime = entryStartTimes[entryIndex];
                var barX = this._timeToPosition(entryStartTime);
                var barRight = this._timeToPosition(entryStartTime + entryTotalTimes[entryIndex]);
                var barWidth = Math.max(barRight - barX, minWidth);
                var barLevel = entryLevels[entryIndex];
                var barY = this._levelToHeight(barLevel);
                if (isNaN(entryTotalTimes[entryIndex])) {
                    context.moveTo(barX + this._markerRadius, barY + barHeight / 2);
                    context.arc(barX, barY + barHeight / 2, this._markerRadius, 0, Math.PI * 2);
                    markerIndices[nextMarkerIndex++] = entryIndex;
                } else {
                    context.rect(barX, barY, barWidth, barHeight);
                    if (barWidth > minTextWidth || this._dataProvider.forceDecoration(entryIndex))
                        titleIndices[nextTitleIndex++] = entryIndex;
                }
            }
            context.fill();
        }

        context.strokeStyle = "rgb(0, 0, 0)";
        context.beginPath();
        for (var m = 0; m < nextMarkerIndex; ++m) {
            var entryIndex = markerIndices[m];
            var entryStartTime = entryStartTimes[entryIndex];
            var barX = this._timeToPosition(entryStartTime);
            var barLevel = entryLevels[entryIndex];
            var barY = this._levelToHeight(barLevel);
            context.moveTo(barX + this._markerRadius, barY + barHeight / 2);
            context.arc(barX, barY + barHeight / 2, this._markerRadius, 0, Math.PI * 2);
        }
        context.stroke();

        context.textBaseline = "alphabetic";

        for (var i = 0; i < nextTitleIndex; ++i) {
            var entryIndex = titleIndices[i];
            var entryStartTime = entryStartTimes[entryIndex];
            var barX = this._timeToPosition(entryStartTime);
            var barRight = this._timeToPosition(entryStartTime + entryTotalTimes[entryIndex]);
            var barWidth = Math.max(barRight - barX, minWidth);
            var barLevel = entryLevels[entryIndex];
            var barY = this._levelToHeight(barLevel);
            var text = this._dataProvider.entryTitle(entryIndex);
            if (text && text.length) {
                context.font = this._dataProvider.entryFont(entryIndex);
                text = this._prepareText(context, text, barWidth - 2 * textPadding);
            }

            if (this._dataProvider.decorateEntry(entryIndex, context, text, barX, barY, barWidth, barHeight, timeToPosition))
                continue;
            if (!text || !text.length)
                continue;

            context.fillStyle = this._dataProvider.textColor(entryIndex);
            context.fillText(text, barX + textPadding, textBaseHeight - barLevel * this._barHeightDelta);
        }
        context.restore();

        var offsets = this._dataProvider.dividerOffsets(this._calculator.minimumBoundary(), this._calculator.maximumBoundary());
        WebInspector.TimelineGrid.drawCanvasGrid(this._canvas, this._calculator, offsets);
        this._drawMarkers();

        this._updateElementPosition(this._highlightElement, this._highlightedEntryIndex);
        this._updateElementPosition(this._selectedElement, this._selectedEntryIndex);
        this._updateMarkerHighlight();
    },

    _drawMarkers: function()
    {
        var markerTimestamps = this._timelineData().markerTimestamps;
        /**
         * @param {number} time
         * @param {number} markerTimestamp
         * @return {number}
         */
        function compare(time, markerTimestamp)
        {
            return time - markerTimestamp;
        }
        var left = markerTimestamps.lowerBound(this._calculator.minimumBoundary(), compare);
        var rightBoundary = this._calculator.maximumBoundary();

        var context = this._canvas.getContext("2d");
        context.save();
        var ratio = window.devicePixelRatio;
        context.scale(ratio, ratio);
        var height = WebInspector.FlameChart.DividersBarHeight - 1;
        context.lineWidth = 2;
        for (var i = left; i < markerTimestamps.length; i++) {
            var timestamp = markerTimestamps[i];
            if (timestamp > rightBoundary)
                break;
            var position = this._calculator.computePosition(timestamp);
            context.strokeStyle = this._dataProvider.markerColor(i);
            context.beginPath();
            context.moveTo(position, 0);
            context.lineTo(position, height);
            context.stroke();
            if (this._dataProvider.isTallMarker(i)) {
                context.save()
                context.lineWidth = 0.5;
                context.translate(0.5, 0.5);
                context.beginPath();
                context.moveTo(position, height);
                context.setLineDash([10, 5]);
                context.lineTo(position, this._canvas.height);
                context.stroke();
                context.restore();
            }
        }
        context.restore();
    },

    _updateMarkerHighlight: function()
    {
        var element = this._markerHighlighElement;
        if (element.parentElement)
            element.remove();
        var markerIndex = this._highlightedMarkerIndex;
        if (markerIndex === -1)
            return;
        var barX = this._timeToPosition(this._timelineData().markerTimestamps[markerIndex]);
        element.title = this._dataProvider.markerTitle(markerIndex);
        var style = element.style;
        style.left = barX + "px";
        style.backgroundColor = this._dataProvider.markerColor(markerIndex);
        this.contentElement.appendChild(element);
    },

    /**
     * @param {?WebInspector.FlameChart.TimelineData} timelineData
     */
    _processTimelineData: function(timelineData)
    {
        if (!timelineData) {
            this._timelineLevels = null;
            this._rawTimelineData = null;
            this._rawTimelineDataLength = 0;
            return;
        }

        var entryCounters = new Uint32Array(this._dataProvider.maxStackDepth() + 1);
        for (var i = 0; i < timelineData.entryLevels.length; ++i)
            ++entryCounters[timelineData.entryLevels[i]];
        var levelIndexes = new Array(entryCounters.length);
        for (var i = 0; i < levelIndexes.length; ++i) {
            levelIndexes[i] = new Uint32Array(entryCounters[i]);
            entryCounters[i] = 0;
        }
        for (var i = 0; i < timelineData.entryLevels.length; ++i) {
            var level = timelineData.entryLevels[i];
            levelIndexes[level][entryCounters[level]++] = i;
        }
        this._timelineLevels = levelIndexes;
        this._rawTimelineData = timelineData;
        this._rawTimelineDataLength = timelineData.entryStartTimes.length;
    },

    /**
     * @param {number} entryIndex
     */
    setSelectedEntry: function(entryIndex)
    {
        this._selectedEntryIndex = entryIndex;
        this._revealEntry(entryIndex);
        this._updateElementPosition(this._selectedElement, this._selectedEntryIndex);
    },

    _updateElementPosition: function(element, entryIndex)
    {
        if (element.parentElement)
            element.remove();
        if (entryIndex === -1)
            return;
        var timeRange = this._dataProvider.highlightTimeRange(entryIndex);
        if (!timeRange)
            return;
        var timelineData = this._timelineData();
        var barX = this._timeToPosition(timeRange.startTime);
        var barRight = this._timeToPosition(timeRange.endTime);
        if (barRight === 0 || barX === this._canvas.width)
            return;
        var barWidth = Math.max(barRight - barX, this._minWidth);
        var barY = this._levelToHeight(timelineData.entryLevels[entryIndex]) - this._scrollTop;
        var style = element.style;
        style.left = barX + "px";
        style.top = barY + "px";
        style.width = barWidth + "px";
        style.height = this._barHeight + "px";
        this.contentElement.appendChild(element);
    },

    /**
     * @param {number} time
     */
    _timeToPosition: function(time)
    {
        return Math.max(0, Math.floor((time - this._minimumBoundary) * this._timeToPixel) - this._pixelWindowLeft + this._paddingLeft);
    },

    _levelToHeight: function(level)
    {
         return this._baseHeight - level * this._barHeightDelta;
    },

    _buildEntryInfo: function(entryInfo)
    {
        var infoTable = createElementWithClass("table", "info-table");
        for (var i = 0; i < entryInfo.length; ++i) {
            var row = infoTable.createChild("tr");
            row.createChild("td", "title").textContent = entryInfo[i].title;
            row.createChild("td").textContent = entryInfo[i].text;
        }
        return infoTable;
    },

    /**
     * @param {!CanvasRenderingContext2D} context
     * @param {string} title
     * @param {number} maxSize
     * @return {string}
     */
    _prepareText: function(context, title, maxSize)
    {
        var titleWidth = this._measureWidth(context, title);
        if (maxSize >= titleWidth)
            return title;

        var l = 2;
        var r = title.length;
        while (l < r) {
            var m = (l + r) >> 1;
            if (this._measureWidth(context, title.trimMiddle(m)) <= maxSize)
                l = m + 1;
            else
                r = m;
        }
        title = title.trimMiddle(r - 1);
        return title !== "\u2026" ? title : "";
    },

    /**
     * @param {!CanvasRenderingContext2D} context
     * @param {string} text
     * @return {number}
     */
    _measureWidth: function(context, text)
    {
        if (text.length > 20)
            return context.measureText(text).width;

        var font = context.font;
        var textWidths = this._textWidth[font];
        if (!textWidths) {
            textWidths = {};
            this._textWidth[font] = textWidths;
        }
        var width = textWidths[text];
        if (!width) {
            width = context.measureText(text).width;
            textWidths[text] = width;
        }
        return width;
    },

    _updateBoundaries: function()
    {
        this._totalTime = this._dataProvider.totalTime();
        this._minimumBoundary = this._dataProvider.minimumBoundary();

        if (this._timeWindowRight !== Infinity) {
            this._windowLeft = (this._timeWindowLeft - this._minimumBoundary) / this._totalTime;
            this._windowRight = (this._timeWindowRight - this._minimumBoundary) / this._totalTime;
            this._windowWidth = this._windowRight - this._windowLeft;
        } else {
            this._windowLeft = 0;
            this._windowRight = 1;
            this._windowWidth = 1;
        }

        this._pixelWindowWidth = this._offsetWidth - this._paddingLeft;
        this._totalPixels = Math.floor(this._pixelWindowWidth / this._windowWidth);
        this._pixelWindowLeft = Math.floor(this._totalPixels * this._windowLeft);
        this._pixelWindowRight = Math.floor(this._totalPixels * this._windowRight);

        this._timeToPixel = this._totalPixels / this._totalTime;
        this._pixelToTime = this._totalTime / this._totalPixels;
        this._paddingLeftTime = this._paddingLeft / this._timeToPixel;

        this._baseHeight = this._isTopDown ? WebInspector.FlameChart.DividersBarHeight : this._offsetHeight - this._barHeight;

        this._totalHeight = this._levelToHeight(this._dataProvider.maxStackDepth() + 1);
        this._vScrollContent.style.height = this._totalHeight + "px";
        this._scrollTop = this._vScrollElement.scrollTop;
        this._updateScrollBar();
    },

    onResize: function()
    {
        this._updateScrollBar();
        this.scheduleUpdate();
    },

    _updateScrollBar: function()
    {
        var showScroll = this._totalHeight > this._offsetHeight;
        this._vScrollElement.classList.toggle("hidden", !showScroll);
        this._offsetWidth = this.contentElement.offsetWidth - (WebInspector.isMac() ? 0 : this._vScrollElement.offsetWidth);
        this._offsetHeight = this.contentElement.offsetHeight;
    },

    scheduleUpdate: function()
    {
        if (this._updateTimerId || this._cancelWindowTimesAnimation)
            return;
        this._updateTimerId = this.element.window().requestAnimationFrame(this.update.bind(this));
    },

    update: function()
    {
        this._updateTimerId = 0;
        if (!this._timelineData())
            return;
        this._resetCanvas();
        this._updateBoundaries();
        this._calculator._updateBoundaries(this);
        this._draw(this._offsetWidth, this._offsetHeight);
    },

    reset: function()
    {
        this._highlightedMarkerIndex = -1;
        this._highlightedEntryIndex = -1;
        this._selectedEntryIndex = -1;
        this._textWidth = {};
        this.update();
    },

    _enabled: function()
    {
        return this._rawTimelineDataLength !== 0;
    },

    __proto__: WebInspector.HBox.prototype
}
