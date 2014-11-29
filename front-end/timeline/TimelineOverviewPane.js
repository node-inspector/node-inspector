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
 * @extends {WebInspector.VBox}
 * @param {!WebInspector.TimelineModel} model
 */
WebInspector.TimelineOverviewPane = function(model)
{
    WebInspector.VBox.call(this);
    this.element.id = "timeline-overview-pane";

    this._model = model;
    this._overviewCalculator = new WebInspector.TimelineOverviewCalculator();

    this._overviewGrid = new WebInspector.OverviewGrid("timeline");
    this.element.appendChild(this._overviewGrid.element);

    model.addEventListener(WebInspector.TimelineModel.Events.RecordsCleared, this._reset, this);
    this._overviewGrid.addEventListener(WebInspector.OverviewGrid.Events.WindowChanged, this._onWindowChanged, this);
    this._overviewControls = [];
}

WebInspector.TimelineOverviewPane.Events = {
    WindowChanged: "WindowChanged"
};

WebInspector.TimelineOverviewPane.prototype = {
    wasShown: function()
    {
        this.update();
    },

    onResize: function()
    {
        this.update();
    },

    /**
     * @param {!Array.<!WebInspector.TimelineOverview>} overviewControls
     */
    setOverviewControls: function(overviewControls)
    {
        for (var i = 0; i < this._overviewControls.length; ++i) {
            var overviewControl = this._overviewControls[i];
            overviewControl.detach();
            overviewControl.dispose();
        }

        for (var i = 0; i < overviewControls.length; ++i) {
            overviewControls[i].setOverviewGrid(this._overviewGrid);
            overviewControls[i].show(this._overviewGrid.element);
        }
        this._overviewControls = overviewControls;
        this.update();
    },

    update: function()
    {
        if (!this.isShowing())
            return;

        if (this._model.isEmpty())
            this._overviewCalculator._setWindow(0, 1000);
        else
            this._overviewCalculator._setWindow(this._model.minimumRecordTime(), this._model.maximumRecordTime());

        this._overviewCalculator._setDisplayWindow(0, this._overviewGrid.clientWidth());
        for (var i = 0; i < this._overviewControls.length; ++i)
            this._overviewControls[i].update();
        this._overviewGrid.updateDividers(this._overviewCalculator);
        this._updateEventDividers();
        this._updateWindow();
    },

    _updateEventDividers: function()
    {
        var records = this._model.eventDividerRecords();
        this._overviewGrid.removeEventDividers();
        var dividers = [];
        for (var i = 0; i < records.length; ++i) {
            var record = records[i];
            var positions = this._overviewCalculator.computeBarGraphPercentages(record);
            var dividerPosition = Math.round(positions.start * 10);
            if (dividers[dividerPosition])
                continue;
            var title = WebInspector.TimelineUIUtils.titleForRecord(record);
            var divider = WebInspector.TimelineUIUtils.createEventDivider(record.type(), title);
            divider.style.left = positions.start + "%";
            dividers[dividerPosition] = divider;
        }
        this._overviewGrid.addEventDividers(dividers);
    },

    _reset: function()
    {
        this._overviewCalculator.reset();
        this._overviewGrid.reset();
        this._overviewGrid.setResizeEnabled(false);
        this._overviewGrid.updateDividers(this._overviewCalculator);
        for (var i = 0; i < this._overviewControls.length; ++i)
            this._overviewControls[i].reset();
        this.update();
    },

    /**
     * @param {!WebInspector.Event} event
     */
    _onWindowChanged: function(event)
    {
        if (this._muteOnWindowChanged)
            return;
        // Always use first control as a time converter.
        if (!this._overviewControls.length)
            return;
        var windowTimes = this._overviewControls[0].windowTimes(this._overviewGrid.windowLeft(), this._overviewGrid.windowRight());
        this._windowStartTime = windowTimes.startTime;
        this._windowEndTime = windowTimes.endTime;
        this.dispatchEventToListeners(WebInspector.TimelineOverviewPane.Events.WindowChanged, windowTimes);
    },

    /**
     * @param {number} startTime
     * @param {number} endTime
     */
    requestWindowTimes: function(startTime, endTime)
    {
        if (startTime === this._windowStartTime && endTime === this._windowEndTime)
            return;
        this._windowStartTime = startTime;
        this._windowEndTime = endTime;
        this._updateWindow();
        this.dispatchEventToListeners(WebInspector.TimelineOverviewPane.Events.WindowChanged, { startTime: startTime, endTime: endTime });
    },

    _updateWindow: function()
    {
        if (!this._overviewControls.length)
            return;
        var windowBoundaries = this._overviewControls[0].windowBoundaries(this._windowStartTime, this._windowEndTime);
        this._muteOnWindowChanged = true;
        this._overviewGrid.setWindow(windowBoundaries.left, windowBoundaries.right);
        this._overviewGrid.setResizeEnabled(!!this._model.records().length);
        this._muteOnWindowChanged = false;
    },

    __proto__: WebInspector.VBox.prototype
}

/**
 * @constructor
 * @implements {WebInspector.TimelineGrid.Calculator}
 */
WebInspector.TimelineOverviewCalculator = function()
{
}

WebInspector.TimelineOverviewCalculator.prototype = {
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
     * @return {!{start: number, end: number}}
     */
    computeBarGraphPercentages: function(record)
    {
        var start = (record.startTime() - this._minimumBoundary) / this.boundarySpan() * 100;
        var end = (record.endTime() - this._minimumBoundary) / this.boundarySpan() * 100;
        return {start: start, end: end};
    },

    /**
     * @param {number=} minimumRecordTime
     * @param {number=} maximumRecordTime
     */
    _setWindow: function(minimumRecordTime, maximumRecordTime)
    {
        this._minimumBoundary = minimumRecordTime;
        this._maximumBoundary = maximumRecordTime;
    },

    /**
     * @param {number} paddingLeft
     * @param {number} clientWidth
     */
    _setDisplayWindow: function(paddingLeft, clientWidth)
    {
        this._workingArea = clientWidth - paddingLeft;
        this._paddingLeft = paddingLeft;
    },

    reset: function()
    {
        this._setWindow(0, 1000);
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
        return this._minimumBoundary;
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
 * @interface
 */
WebInspector.TimelineOverview = function(model)
{
}

WebInspector.TimelineOverview.prototype = {
    /**
     * @param {?Element} parentElement
     * @param {!Element=} insertBefore
     */
    show: function(parentElement, insertBefore) { },

    /**
     * @param {!WebInspector.OverviewGrid} grid
     */
    setOverviewGrid: function(grid) { },

    update: function() { },

    dispose: function() { },

    reset: function() { },

    /**
     * @param {number} windowLeft
     * @param {number} windowRight
     * @return {!{startTime: number, endTime: number}}
     */
    windowTimes: function(windowLeft, windowRight) { },

    /**
     * @param {number} startTime
     * @param {number} endTime
     * @return {!{left: number, right: number}}
     */
    windowBoundaries: function(startTime, endTime) { },
}

/**
 * @constructor
 * @extends {WebInspector.VBox}
 * @implements {WebInspector.TimelineOverview}
 * @param {!WebInspector.TimelineModel} model
 */
WebInspector.TimelineOverviewBase = function(model)
{
    WebInspector.VBox.call(this);

    this._model = model;
    this._canvas = this.element.createChild("canvas", "fill");
    this._context = this._canvas.getContext("2d");
}

WebInspector.TimelineOverviewBase.prototype = {
    /**
     * @param {!WebInspector.OverviewGrid} grid
     */
    setOverviewGrid: function(grid)
    {
    },

    update: function()
    {
        this.resetCanvas();
    },

    dispose: function()
    {
    },

    reset: function()
    {
    },

    timelineStarted: function()
    {
    },

    timelineStopped: function()
    {
    },

    /**
     * @param {number} windowLeft
     * @param {number} windowRight
     * @return {!{startTime: number, endTime: number}}
     */
    windowTimes: function(windowLeft, windowRight)
    {
        var absoluteMin = this._model.minimumRecordTime();
        var timeSpan = this._model.maximumRecordTime() - absoluteMin;
        return {
            startTime: absoluteMin + timeSpan * windowLeft,
            endTime: absoluteMin + timeSpan * windowRight
        };
    },

    /**
     * @param {number} startTime
     * @param {number} endTime
     * @return {!{left: number, right: number}}
     */
    windowBoundaries: function(startTime, endTime)
    {
        var absoluteMin = this._model.minimumRecordTime();
        var timeSpan = this._model.maximumRecordTime() - absoluteMin;
        var haveRecords = absoluteMin > 0;
        return {
            left: haveRecords && startTime ? Math.min((startTime - absoluteMin) / timeSpan, 1) : 0,
            right: haveRecords && endTime < Infinity ? (endTime - absoluteMin) / timeSpan : 1
        }
    },

    resetCanvas: function()
    {
        this._canvas.width = this.element.clientWidth * window.devicePixelRatio;
        this._canvas.height = this.element.clientHeight * window.devicePixelRatio;
    },

    __proto__: WebInspector.VBox.prototype
}
