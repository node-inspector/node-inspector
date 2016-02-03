// Copyright 2015 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

/**
 * @constructor
 * @extends {WebInspector.TimelineOverviewBase}
 */
WebInspector.NetworkOverview = function()
{
    WebInspector.TimelineOverviewBase.call(this);
    this.element.classList.add("network-overview");

    /** @type {number} */
    this._numBands = 1;
    /** @type {number} */
    this._windowStart = 0;
    /** @type {number} */
    this._windowEnd = 0;
    /** @type {boolean} */
    this._restoringWindow = false;
    /** @type {boolean} */
    this._updateScheduled = false;
    /** @type {number} */
    this._canvasWidth = 0;
    /** @type {number} */
    this._canvasHeight = 0;

    WebInspector.targetManager.addModelListener(WebInspector.ResourceTreeModel, WebInspector.ResourceTreeModel.EventTypes.Load, this._loadEventFired, this);
    WebInspector.targetManager.addModelListener(WebInspector.ResourceTreeModel, WebInspector.ResourceTreeModel.EventTypes.DOMContentLoaded, this._domContentLoadedEventFired, this);

    this.reset();
}

/** @type {number} */
WebInspector.NetworkOverview._bandHeight = 3;

/** @typedef {{start: number, end: number}} */
WebInspector.NetworkOverview.Window;

WebInspector.NetworkOverview.prototype = {
    /**
     * @param {?WebInspector.FilmStripModel} filmStripModel
     */
    setFilmStripModel: function(filmStripModel)
    {
        this._filmStripModel = filmStripModel;
        this.scheduleUpdate();
    },

    /**
     * @param {number} time
     */
    selectFilmStripFrame: function(time)
    {
        this._selectedFilmStripTime = time;
        this.scheduleUpdate();
    },

    clearFilmStripFrame: function()
    {
        this._selectedFilmStripTime = -1;
        this.scheduleUpdate();
    },

    /**
     * @param {!WebInspector.Event} event
     */
    _loadEventFired: function(event)
    {
        var data = /** @type {number} */ (event.data);
        if (data)
            this._loadEvents.push(data * 1000);
        this.scheduleUpdate();
    },

    /**
     * @param {!WebInspector.Event} event
     */
    _domContentLoadedEventFired: function(event)
    {
        var data = /** @type {number} */ (event.data);
        if (data)
            this._domContentLoadedEvents.push(data * 1000);
        this.scheduleUpdate();
    },

    /**
     * @param {string} connectionId
     * @return {number}
     */
    _bandId: function(connectionId)
    {
        if (!connectionId || connectionId === "0")
            return -1;
        if (this._bandMap.has(connectionId))
            return /** @type {number} */ (this._bandMap.get(connectionId));
        var result = this._nextBand++;
        this._bandMap.set(connectionId, result);
        return result;
    },

    /**
     * @param {!WebInspector.NetworkRequest} request
     */
    updateRequest: function(request)
    {
        if (!this._requestsSet.has(request)) {
            this._requestsSet.add(request);
            this._requestsList.push(request);
        }
        this.scheduleUpdate();
    },

    /**
     * @override
     */
    wasShown: function()
    {
        this.onResize();
    },

    /**
     * @override
     */
    onResize: function()
    {
        var width = this.element.offsetWidth;
        var height = this.element.offsetHeight;
        this._calculator.setDisplayWindow(width);
        this.resetCanvas();
        var numBands = (((height - 1) / WebInspector.NetworkOverview._bandHeight) - 1) | 0;
        this._numBands = (numBands > 0) ? numBands : 1;
        this.scheduleUpdate();
    },

    /**
     * @override
     */
    reset: function()
    {
        this._windowStart = 0;
        this._windowEnd = 0;
        /** @type {?WebInspector.FilmStripModel} */
        this._filmStripModel = null;

        /** @type {number} */
        this._span = 1;
        /** @type {?WebInspector.NetworkTimeBoundary} */
        this._lastBoundary = null;
        /** @type {number} */
        this._nextBand = 0;
        /** @type {!Map.<string, number>} */
        this._bandMap = new Map();
        /** @type {!Array.<!WebInspector.NetworkRequest>} */
        this._requestsList = [];
        /** @type {!Set.<!WebInspector.NetworkRequest>} */
        this._requestsSet = new Set();
        /** @type {!Array.<number>} */
        this._loadEvents = [];
        /** @type {!Array.<number>} */
        this._domContentLoadedEvents = [];

        // Clear screen.
        this.resetCanvas();
    },

    /**
     * @protected
     */
    scheduleUpdate: function()
    {
        if (this._updateScheduled || !this.isShowing())
            return;
        this._updateScheduled = true;
        this.element.window().requestAnimationFrame(this.update.bind(this));
    },

    /**
     * @override
     */
    update: function()
    {
        this._updateScheduled = false;

        var newBoundary = new WebInspector.NetworkTimeBoundary(this._calculator.minimumBoundary(), this._calculator.maximumBoundary());
        if (!this._lastBoundary || !newBoundary.equals(this._lastBoundary)) {
            var span = this._calculator.boundarySpan();
            while (this._span < span)
                this._span *= 1.25;
            this._calculator.setBounds(this._calculator.minimumBoundary(), this._calculator.minimumBoundary() + this._span);
            this._lastBoundary = new WebInspector.NetworkTimeBoundary(this._calculator.minimumBoundary(), this._calculator.maximumBoundary());
            if (this._windowStart || this._windowEnd) {
                this._restoringWindow = true;
                var startTime = this._calculator.minimumBoundary();
                var totalTime = this._calculator.boundarySpan();
                var left = (this._windowStart - startTime) / totalTime;
                var right = (this._windowEnd - startTime) / totalTime;
                this._restoringWindow = false;
            }
        }

        var context = this._canvas.getContext("2d");
        var calculator = this._calculator;
        var linesByType = {};
        var paddingTop = 2;

        /**
         * @param {string} type
         * @param {string} strokeStyle
         */
        function drawLines(type, strokeStyle)
        {
            var lines = linesByType[type];
            if (!lines)
                return;
            var n = lines.length;
            context.beginPath();
            context.strokeStyle = strokeStyle;
            for (var i = 0; i < n;) {
                var y = lines[i++] * WebInspector.NetworkOverview._bandHeight + paddingTop;
                var startTime = lines[i++];
                var endTime = lines[i++];
                if (endTime === Number.MAX_VALUE)
                    endTime = calculator.maximumBoundary();
                context.moveTo(calculator.computePosition(startTime), y);
                context.lineTo(calculator.computePosition(endTime) + 1, y);
            }
            context.stroke();
        }

        /**
         * @param {string} type
         * @param {number} y
         * @param {number} start
         * @param {number} end
         */
        function addLine(type, y, start, end)
        {
            var lines = linesByType[type];
            if (!lines) {
                lines = [];
                linesByType[type] = lines;
            }
            lines.push(y, start, end);
        }

        var requests = this._requestsList;
        var n = requests.length;
        for (var i = 0; i < n; ++i) {
            var request = requests[i];
            var band = this._bandId(request.connectionId);
            var y = (band === -1) ? 0 : (band % this._numBands + 1);
            var timeRanges = WebInspector.RequestTimingView.calculateRequestTimeRanges(request);
            for (var j = 0; j < timeRanges.length; ++j) {
                var type = timeRanges[j].name;
                if (band !== -1 || type === WebInspector.RequestTimeRangeNames.Total)
                    addLine(type, y, timeRanges[j].start * 1000, timeRanges[j].end * 1000);
            }
        }

        context.clearRect(0, 0, this._canvas.width, this._canvas.height);
        context.save();
        context.scale(window.devicePixelRatio, window.devicePixelRatio);
        context.lineWidth = 2;
        drawLines(WebInspector.RequestTimeRangeNames.Total, "#CCCCCC");
        drawLines(WebInspector.RequestTimeRangeNames.Blocking, "#AAAAAA");
        drawLines(WebInspector.RequestTimeRangeNames.Connecting, "#FF9800");
        drawLines(WebInspector.RequestTimeRangeNames.ServiceWorker, "#FF9800");
        drawLines(WebInspector.RequestTimeRangeNames.ServiceWorkerPreparation, "#FF9800");
        drawLines(WebInspector.RequestTimeRangeNames.Proxy, "#A1887F");
        drawLines(WebInspector.RequestTimeRangeNames.DNS, "#009688");
        drawLines(WebInspector.RequestTimeRangeNames.SSL, "#9C27B0");
        drawLines(WebInspector.RequestTimeRangeNames.Sending, "#B0BEC5");
        drawLines(WebInspector.RequestTimeRangeNames.Waiting, "#00C853");
        drawLines(WebInspector.RequestTimeRangeNames.Receiving, "#03A9F4");

        var height = this.element.offsetHeight;
        context.lineWidth = 1;
        context.beginPath();
        context.strokeStyle = "#8080FF"; // Keep in sync with .network-blue-divider CSS rule.
        for (var i = this._domContentLoadedEvents.length - 1; i >= 0; --i) {
            var x = Math.round(calculator.computePosition(this._domContentLoadedEvents[i])) + 0.5;
            context.moveTo(x, 0);
            context.lineTo(x, height);
        }
        context.stroke();

        context.beginPath();
        context.strokeStyle = "#FF8080"; // Keep in sync with .network-red-divider CSS rule.
        for (var i = this._loadEvents.length - 1; i >= 0; --i) {
            var x = Math.round(calculator.computePosition(this._loadEvents[i])) + 0.5;
            context.moveTo(x, 0);
            context.lineTo(x, height);
        }
        context.stroke();

        if (this._selectedFilmStripTime !== -1) {
            context.lineWidth = 2;
            context.beginPath();
            context.strokeStyle = "#FCCC49"; // Keep in sync with .network-frame-divider CSS rule.
            var x = Math.round(calculator.computePosition(this._selectedFilmStripTime));
            context.moveTo(x, 0);
            context.lineTo(x, height);
            context.stroke();
        }
        context.restore();
    },

    __proto__: WebInspector.TimelineOverviewBase.prototype
}
