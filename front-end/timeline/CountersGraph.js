/*
 * Copyright (C) 2012 Google Inc. All rights reserved.
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
 * @extends {WebInspector.SplitView}
 * @implements {WebInspector.TimelineModeView}
 * @param {string} title
 * @param {!WebInspector.TimelineModeViewDelegate} delegate
 * @param {!WebInspector.TimelineModel} model
 */
WebInspector.CountersGraph = function(title, delegate, model)
{
    WebInspector.SplitView.call(this, true, false);

    this.element.id = "memory-graphs-container";

    this._delegate = delegate;
    this._model = model;
    this._calculator = new WebInspector.TimelineCalculator(this._model);

    this._graphsContainer = new WebInspector.VBox();
    this.setMainView(this._graphsContainer);
    this._createCurrentValuesBar();
    this._canvasView = new WebInspector.VBoxWithResizeCallback(this._resize.bind(this));
    this._canvasView.show(this._graphsContainer.element);
    this._canvasContainer = this._canvasView.element;
    this._canvasContainer.id = "memory-graphs-canvas-container";
    this._canvas = this._canvasContainer.createChild("canvas");
    this._canvas.id = "memory-counters-graph";

    this._canvasContainer.addEventListener("mouseover", this._onMouseMove.bind(this), true);
    this._canvasContainer.addEventListener("mousemove", this._onMouseMove.bind(this), true);
    this._canvasContainer.addEventListener("mouseleave", this._onMouseLeave.bind(this), true);
    this._canvasContainer.addEventListener("click", this._onClick.bind(this), true);
    // We create extra timeline grid here to reuse its event dividers.
    this._timelineGrid = new WebInspector.TimelineGrid();
    this._canvasContainer.appendChild(this._timelineGrid.dividersElement);

    // Populate sidebar
    this._infoView = new WebInspector.VBox();
    this._infoView.element.classList.add("sidebar-tree");
    this._infoView.element.createChild("div", "sidebar-tree-section").textContent = title;
    this.setSidebarView(this._infoView);
    this._counters = [];
    this._counterUI = [];
}

WebInspector.CountersGraph.prototype = {
    _createCurrentValuesBar: function()
    {
        this._currentValuesBar = this._graphsContainer.element.createChild("div");
        this._currentValuesBar.id = "counter-values-bar";
    },

    /**
     * @param {string} uiName
     * @param {string} uiValueTemplate
     * @param {string} color
     * @return {!WebInspector.CountersGraph.Counter}
     */
    createCounter: function(uiName, uiValueTemplate, color)
    {
        var counter = new WebInspector.CountersGraph.Counter();
        this._counters.push(counter);
        this._counterUI.push(new WebInspector.CountersGraph.CounterUI(this, uiName, uiValueTemplate, color, counter));
        return counter;
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
        for (var i = 0; i < this._counters.length; ++i) {
            this._counters[i].reset();
            this._counterUI[i].reset();
        }
        this.refresh();
    },

    _resize: function()
    {
        var parentElement = this._canvas.parentElement;
        this._canvas.width = parentElement.clientWidth  * window.devicePixelRatio;
        this._canvas.height = parentElement.clientHeight * window.devicePixelRatio;
        var timelinePaddingLeft = 15;
        this._calculator.setDisplayWindow(timelinePaddingLeft, this._canvas.width);
        this.refresh();
    },

    /**
     * @param {number} startTime
     * @param {number} endTime
     */
    setWindowTimes: function(startTime, endTime)
    {
        this._calculator.setWindow(startTime, endTime);
        this.scheduleRefresh();
    },

    scheduleRefresh: function()
    {
        WebInspector.invokeOnceAfterBatchUpdate(this, this.refresh);
    },

    draw: function()
    {
        for (var i = 0; i < this._counters.length; ++i) {
            this._counters[i]._calculateVisibleIndexes(this._calculator);
            this._counters[i]._calculateXValues(this._canvas.width);
        }
        this._clear();

        for (var i = 0; i < this._counterUI.length; i++)
            this._counterUI[i]._drawGraph(this._canvas);
    },

    /**
     * @param {!Event} event
     */
    _onClick: function(event)
    {
        var x = event.x - this._canvasContainer.totalOffsetLeft();
        var minDistance = Infinity;
        var bestTime;
        for (var i = 0; i < this._counterUI.length; ++i) {
            var counterUI = this._counterUI[i];
            if (!counterUI.counter.times.length)
                continue;
            var index = counterUI._recordIndexAt(x);
            var distance = Math.abs(x * window.devicePixelRatio - counterUI.counter.x[index]);
            if (distance < minDistance) {
                minDistance = distance;
                bestTime = counterUI.counter.times[index];
            }
        }
        if (bestTime !== undefined)
            this._revealRecordAt(bestTime);
    },

    /**
     * @param {number} time
     */
    _revealRecordAt: function(time)
    {
        var recordToReveal;
        /**
         * @param {!WebInspector.TimelineModel.Record} record
         * @return {boolean}
         * @this {WebInspector.CountersGraph}
         */
        function findRecordToReveal(record)
        {
            if (!this._model.isVisible(record))
                return false;
            if (record.startTime() <= time && time <= record.endTime()) {
                recordToReveal = record;
                return true;
            }
            // If there is no record containing the time than use the latest one before that time.
            if (!recordToReveal || record.endTime() < time && recordToReveal.endTime() < record.endTime())
                recordToReveal = record;
            return false;
        }
        this._model.forAllRecords(null, findRecordToReveal.bind(this));
        this._delegate.select(recordToReveal ? WebInspector.TimelineSelection.fromRecord(recordToReveal) : null);
    },

    /**
     * @param {!Event} event
     */
    _onMouseLeave: function(event)
    {
        delete this._markerXPosition;
        this._clearCurrentValueAndMarker();
    },

    _clearCurrentValueAndMarker: function()
    {
        for (var i = 0; i < this._counterUI.length; i++)
            this._counterUI[i]._clearCurrentValueAndMarker();
    },

    /**
     * @param {!Event} event
     */
    _onMouseMove: function(event)
    {
        var x = event.x - this._canvasContainer.totalOffsetLeft();
        this._markerXPosition = x;
        this._refreshCurrentValues();
    },

    _refreshCurrentValues: function()
    {
        if (this._markerXPosition === undefined)
            return;
        for (var i = 0; i < this._counterUI.length; ++i)
            this._counterUI[i].updateCurrentValue(this._markerXPosition);
    },

    refresh: function()
    {
        this._timelineGrid.updateDividers(this._calculator);
        this.draw();
        this._refreshCurrentValues();
    },

    /**
     * @override
     * @param {?RegExp} textFilter
     */
    refreshRecords: function(textFilter)
    {
    },

    _clear: function()
    {
        var ctx = this._canvas.getContext("2d");
        ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    },

    /**
     * @param {?WebInspector.TimelineModel.Record} record
     * @param {string=} regex
     * @param {boolean=} selectRecord
     */
    highlightSearchResult: function(record, regex, selectRecord)
    {
    },

    /**
     * @param {?WebInspector.TimelineSelection} selection
     */
    setSelection: function(selection)
    {
    },

    __proto__: WebInspector.SplitView.prototype
}

/**
 * @constructor
 */
WebInspector.CountersGraph.Counter = function()
{
    this.times = [];
    this.values = [];
}

WebInspector.CountersGraph.Counter.prototype = {
    /**
     * @param {number} time
     * @param {number} value
     */
    appendSample: function(time, value)
    {
        if (this.values.length && this.values.peekLast() === value)
            return;
        this.times.push(time);
        this.values.push(value);
    },

    reset: function()
    {
        this.times = [];
        this.values = [];
    },

    /**
     * @param {number} value
     */
    setLimit: function(value)
    {
        this._limitValue = value;
    },

    /**
     * @return {!{min: number, max: number}}
     */
    _calculateBounds: function()
    {
        var maxValue;
        var minValue;
        for (var i = this._minimumIndex; i <= this._maximumIndex; i++) {
            var value = this.values[i];
            if (minValue === undefined || value < minValue)
                minValue = value;
            if (maxValue === undefined || value > maxValue)
                maxValue = value;
        }
        minValue = minValue || 0;
        maxValue = maxValue || 1;
        if (this._limitValue) {
            if (maxValue > this._limitValue * 0.5)
                maxValue = Math.max(maxValue, this._limitValue);
            minValue = Math.min(minValue, this._limitValue);
        }
        return { min: minValue, max: maxValue };
    },

    /**
     * @param {!WebInspector.TimelineCalculator} calculator
     */
    _calculateVisibleIndexes: function(calculator)
    {
        var start = calculator.minimumBoundary();
        var end = calculator.maximumBoundary();

        // Maximum index of element whose time <= start.
        this._minimumIndex = Number.constrain(this.times.upperBound(start) - 1, 0, this.times.length - 1);

        // Minimum index of element whose time >= end.
        this._maximumIndex = Number.constrain(this.times.lowerBound(end), 0, this.times.length - 1);

        // Current window bounds.
        this._minTime = start;
        this._maxTime = end;
    },

    /**
     * @param {number} width
     */
    _calculateXValues: function(width)
    {
        if (!this.values.length)
            return;

        var xFactor = width / (this._maxTime - this._minTime);

        this.x = new Array(this.values.length);
        for (var i = this._minimumIndex + 1; i <= this._maximumIndex; i++)
             this.x[i] = xFactor * (this.times[i] - this._minTime);
    }
}

/**
 * @constructor
 * @param {!WebInspector.CountersGraph} memoryCountersPane
 * @param {string} title
 * @param {string} currentValueLabel
 * @param {string} graphColor
 * @param {!WebInspector.CountersGraph.Counter} counter
 */
WebInspector.CountersGraph.CounterUI = function(memoryCountersPane, title, currentValueLabel, graphColor, counter)
{
    this._memoryCountersPane = memoryCountersPane;
    this.counter = counter;
    var container = memoryCountersPane._infoView.element.createChild("div", "memory-counter-sidebar-info");
    var swatchColor = graphColor;
    this._swatch = new WebInspector.SwatchCheckbox(WebInspector.UIString(title), swatchColor);
    this._swatch.addEventListener(WebInspector.SwatchCheckbox.Events.Changed, this._toggleCounterGraph.bind(this));
    container.appendChild(this._swatch.element);
    this._range = this._swatch.element.createChild("span");

    this._value = memoryCountersPane._currentValuesBar.createChild("span", "memory-counter-value");
    this._value.style.color = graphColor;
    this.graphColor = graphColor;
    this.limitColor = WebInspector.Color.parse(graphColor).setAlpha(0.3).asString(WebInspector.Color.Format.RGBA);
    this.graphYValues = [];
    this._verticalPadding = 10;

    this._currentValueLabel = currentValueLabel;
    this._marker = memoryCountersPane._canvasContainer.createChild("div", "memory-counter-marker");
    this._marker.style.backgroundColor = graphColor;
    this._clearCurrentValueAndMarker();
}

WebInspector.CountersGraph.CounterUI.prototype = {
    reset: function()
    {
        this._range.textContent = "";
    },

    /**
     * @param {number} minValue
     * @param {number} maxValue
     */
    setRange: function(minValue, maxValue)
    {
        this._range.textContent = WebInspector.UIString("[%.0f:%.0f]", minValue, maxValue);
    },

    _toggleCounterGraph: function(event)
    {
        this._value.classList.toggle("hidden", !this._swatch.checked);
        this._memoryCountersPane.refresh();
    },

    /**
     * @param {number} x
     * @return {number}
     */
    _recordIndexAt: function(x)
    {
        return this.counter.x.upperBound(x * window.devicePixelRatio, null, this.counter._minimumIndex + 1, this.counter._maximumIndex + 1) - 1;
    },

    /**
     * @param {number} x
     */
    updateCurrentValue: function(x)
    {
        if (!this.visible() || !this.counter.values.length || !this.counter.x)
            return;
        var index = this._recordIndexAt(x);
        this._value.textContent = WebInspector.UIString(this._currentValueLabel, this.counter.values[index]);
        var y = this.graphYValues[index] / window.devicePixelRatio;
        this._marker.style.left = x + "px";
        this._marker.style.top = y + "px";
        this._marker.classList.remove("hidden");
    },

    _clearCurrentValueAndMarker: function()
    {
        this._value.textContent = "";
        this._marker.classList.add("hidden");
    },

    /**
     * @param {!HTMLCanvasElement} canvas
     */
    _drawGraph: function(canvas)
    {
        var ctx = canvas.getContext("2d");
        var width = canvas.width;
        var height = canvas.height - 2 * this._verticalPadding;
        if (height <= 0) {
            this.graphYValues = [];
            return;
        }
        var originY = this._verticalPadding;
        var counter = this.counter;
        var values = counter.values;

        if (!values.length)
            return;

        var bounds = counter._calculateBounds();
        var minValue = bounds.min;
        var maxValue = bounds.max;
        this.setRange(minValue, maxValue);

        if (!this.visible())
            return;

        var yValues = this.graphYValues;
        var maxYRange = maxValue - minValue;
        var yFactor = maxYRange ? height / (maxYRange) : 1;

        ctx.save();
        ctx.lineWidth = window.devicePixelRatio;
        if (ctx.lineWidth % 2)
            ctx.translate(0.5, 0.5);
        ctx.beginPath();
        var value = values[counter._minimumIndex];
        var currentY = Math.round(originY + height - (value - minValue) * yFactor);
        ctx.moveTo(0, currentY);
        for (var i = counter._minimumIndex; i <= counter._maximumIndex; i++) {
             var x = Math.round(counter.x[i]);
             ctx.lineTo(x, currentY);
             var currentValue = values[i];
             if (typeof currentValue !== "undefined")
                value = currentValue;
             currentY = Math.round(originY + height - (value - minValue) * yFactor);
             ctx.lineTo(x, currentY);
             yValues[i] = currentY;
        }
        yValues.length = i;
        ctx.lineTo(width, currentY);
        ctx.strokeStyle = this.graphColor;
        ctx.stroke();
        if (counter._limitValue) {
            var limitLineY = Math.round(originY + height - (counter._limitValue - minValue) * yFactor);
            ctx.moveTo(0, limitLineY);
            ctx.lineTo(width, limitLineY);
            ctx.strokeStyle = this.limitColor;
            ctx.stroke();
        }
        ctx.closePath();
        ctx.restore();
    },

    /**
     * @return {boolean}
     */
    visible: function()
    {
        return this._swatch.checked;
    }
}


/**
 * @constructor
 * @extends {WebInspector.Object}
 */
WebInspector.SwatchCheckbox = function(title, color)
{
    this.element = createElement("div");
    this._swatch = this.element.createChild("div", "swatch");
    this.element.createChild("span", "title").textContent = title;
    this._color = color;
    this.checked = true;

    this.element.addEventListener("click", this._toggleCheckbox.bind(this), true);
}

WebInspector.SwatchCheckbox.Events = {
    Changed: "Changed"
}

WebInspector.SwatchCheckbox.prototype = {
    get checked()
    {
        return this._checked;
    },

    set checked(v)
    {
        this._checked = v;
        if (this._checked)
            this._swatch.style.backgroundColor = this._color;
        else
            this._swatch.style.backgroundColor = "";
    },

    _toggleCheckbox: function(event)
    {
        this.checked = !this.checked;
        this.dispatchEventToListeners(WebInspector.SwatchCheckbox.Events.Changed);
    },

    __proto__: WebInspector.Object.prototype
}
