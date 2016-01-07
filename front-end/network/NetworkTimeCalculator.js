/*
 * Copyright (C) 2007, 2008 Apple Inc.  All rights reserved.
 * Copyright (C) 2008, 2009 Anthony Ricaud <rik@webkit.org>
 * Copyright (C) 2011 Google Inc. All rights reserved.
 *
 * Redistribution and use in source and binary forms, with or without
 * modification, are permitted provided that the following conditions
 * are met:
 *
 * 1.  Redistributions of source code must retain the above copyright
 *     notice, this list of conditions and the following disclaimer.
 * 2.  Redistributions in binary form must reproduce the above copyright
 *     notice, this list of conditions and the following disclaimer in the
 *     documentation and/or other materials provided with the distribution.
 * 3.  Neither the name of Apple Computer, Inc. ("Apple") nor the names of
 *     its contributors may be used to endorse or promote products derived
 *     from this software without specific prior written permission.
 *
 * THIS SOFTWARE IS PROVIDED BY APPLE AND ITS CONTRIBUTORS "AS IS" AND ANY
 * EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED
 * WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
 * DISCLAIMED. IN NO EVENT SHALL APPLE OR ITS CONTRIBUTORS BE LIABLE FOR ANY
 * DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES
 * (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES;
 * LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND
 * ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT
 * (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF
 * THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
 */

/**
 * @constructor
 * @param {number} minimum
 * @param {number} maximum
 */
WebInspector.NetworkTimeBoundary = function(minimum, maximum)
{
    this.minimum = minimum;
    this.maximum = maximum;
}

WebInspector.NetworkTimeBoundary.prototype = {
    /**
     * @param {!WebInspector.NetworkTimeBoundary} other
     * @return {boolean}
     */
    equals: function(other)
    {
        return (this.minimum === other.minimum) && (this.maximum === other.maximum);
    }
}

/**
 * @constructor
 * @extends {WebInspector.Object}
 * @implements {WebInspector.TimelineGrid.Calculator}
 */
WebInspector.NetworkTimeCalculator = function(startAtZero)
{
    this.startAtZero = startAtZero;
    this._boundryChangedEventThrottler = new WebInspector.Throttler(0);
    /** @type {?WebInspector.NetworkTimeBoundary} */
    this._window = null;
}

/** @enum {string} */
WebInspector.NetworkTimeCalculator.Events = {
    BoundariesChanged: "BoundariesChanged"
}

/** @type {!WebInspector.UIStringFormat} */
WebInspector.NetworkTimeCalculator._latencyDownloadTotalFormat = new WebInspector.UIStringFormat("%s latency, %s download (%s total)");

/** @type {!WebInspector.UIStringFormat} */
WebInspector.NetworkTimeCalculator._latencyFormat = new WebInspector.UIStringFormat("%s latency");

/** @type {!WebInspector.UIStringFormat} */
WebInspector.NetworkTimeCalculator._downloadFormat = new WebInspector.UIStringFormat("%s download");

/** @type {!WebInspector.UIStringFormat} */
WebInspector.NetworkTimeCalculator._fromServiceWorkerFormat = new WebInspector.UIStringFormat("%s (from ServiceWorker)");

/** @type {!WebInspector.UIStringFormat} */
WebInspector.NetworkTimeCalculator._fromCacheFormat = new WebInspector.UIStringFormat("%s (from cache)");

WebInspector.NetworkTimeCalculator.prototype = {
    /**
     * @param {?WebInspector.NetworkTimeBoundary} window
     */
    setWindow: function(window)
    {
        this._window = window;
        this._boundaryChanged();
    },

    setInitialUserFriendlyBoundaries: function()
    {
        this._minimumBoundary = 0;
        this._maximumBoundary = 1;
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
     * @param {number} time
     * @return {number}
     */
    computePosition: function(time)
    {
        return (time - this.minimumBoundary()) / this.boundarySpan() * this._workingArea;
    },

    /**
     * @override
     * @param {number} value
     * @param {number=} precision
     * @return {string}
     */
    formatTime: function(value, precision)
    {
        return Number.secondsToString(value, !!precision);
    },

    /**
     * @override
     * @return {number}
     */
    minimumBoundary: function()
    {
        return this._window ? this._window.minimum : this._minimumBoundary;
    },

    /**
     * @override
     * @return {number}
     */
    zeroTime: function()
    {
        return this._minimumBoundary;
    },

    /**
     * @override
     * @return {number}
     */
    maximumBoundary: function()
    {
        return this._window ? this._window.maximum : this._maximumBoundary;
    },

    /**
     * @return {!WebInspector.NetworkTimeBoundary}
     */
    boundary: function()
    {
        return new WebInspector.NetworkTimeBoundary(this.minimumBoundary(), this.maximumBoundary());
    },

    /**
     * @override
     * @return {number}
     */
    boundarySpan: function()
    {
        return this.maximumBoundary() - this.minimumBoundary();
    },

    reset: function()
    {
        delete this._minimumBoundary;
        delete this._maximumBoundary;
        this._boundaryChanged();
    },

    /**
     * @return {number}
     */
    _value: function(item)
    {
        return 0;
    },

    /**
     * @param {number} clientWidth
     */
    setDisplayWindow: function(clientWidth)
    {
        this._workingArea = clientWidth;
    },

    /**
     * @param {!WebInspector.NetworkRequest} request
     * @return {!{start: number, middle: number, end: number}}
     */
    computeBarGraphPercentages: function(request)
    {
        if (request.startTime !== -1)
            var start = ((request.startTime - this.minimumBoundary()) / this.boundarySpan()) * 100;
        else
            var start = 0;

        if (request.responseReceivedTime !== -1)
            var middle = ((request.responseReceivedTime - this.minimumBoundary()) / this.boundarySpan()) * 100;
        else
            var middle = (this.startAtZero ? start : 100);

        if (request.endTime !== -1)
            var end = ((request.endTime - this.minimumBoundary()) / this.boundarySpan()) * 100;
        else
            var end = (this.startAtZero ? middle : 100);

        if (this.startAtZero) {
            end -= start;
            middle -= start;
            start = 0;
        }

        return {start: start, middle: middle, end: end};
    },

    /**
     * @param {number} eventTime
     * @return {number}
     */
    computePercentageFromEventTime: function(eventTime)
    {
        // This function computes a percentage in terms of the total loading time
        // of a specific event. If startAtZero is set, then this is useless, and we
        // want to return 0.
        if (eventTime !== -1 && !this.startAtZero)
            return ((eventTime - this.minimumBoundary()) / this.boundarySpan()) * 100;

        return 0;
    },

    /**
     * @param {number} percentage
     * @return {number}
     */
    percentageToTime: function(percentage)
    {
        return percentage * this.boundarySpan() / 100 + this.minimumBoundary();
    },

    _boundaryChanged: function()
    {
        this._boundryChangedEventThrottler.schedule(dispatchEvent.bind(this));

        /**
         * @return {!Promise.<undefined>}
         * @this {WebInspector.NetworkTimeCalculator}
         */
        function dispatchEvent()
        {
            this.dispatchEventToListeners(WebInspector.NetworkTimeCalculator.Events.BoundariesChanged);
            return Promise.resolve();
        }
    },

    /**
     * @param {number} eventTime
     */
    updateBoundariesForEventTime: function(eventTime)
    {
        if (eventTime === -1 || this.startAtZero)
            return;

        if (this._maximumBoundary === undefined || eventTime > this._maximumBoundary) {
            this._maximumBoundary = eventTime;
            this._boundaryChanged();
        }
    },

    /**
     * @param {!WebInspector.NetworkRequest} request
     * @return {!{left: string, right: string, tooltip: (string|undefined)}}
     */
    computeBarGraphLabels: function(request)
    {
        var rightLabel = "";
        if (request.responseReceivedTime !== -1 && request.endTime !== -1)
            rightLabel = Number.secondsToString(request.endTime - request.responseReceivedTime);

        var hasLatency = request.latency > 0;
        if (hasLatency)
            var leftLabel = Number.secondsToString(request.latency);
        else
            var leftLabel = rightLabel;

        if (request.timing)
            return {left: leftLabel, right: rightLabel};

        if (hasLatency && rightLabel) {
            var total = Number.secondsToString(request.duration);
            var tooltip = WebInspector.NetworkTimeCalculator._latencyDownloadTotalFormat.format(leftLabel, rightLabel, total);
        } else if (hasLatency) {
            var tooltip = WebInspector.NetworkTimeCalculator._latencyFormat.format(leftLabel);
        } else if (rightLabel) {
            var tooltip = WebInspector.NetworkTimeCalculator._downloadFormat.format(rightLabel);
        }

        if (request.fetchedViaServiceWorker)
            tooltip = WebInspector.NetworkTimeCalculator._fromServiceWorkerFormat.format(tooltip);
        else if (request.cached())
            tooltip = WebInspector.NetworkTimeCalculator._fromCacheFormat.format(tooltip);
        return {left: leftLabel, right: rightLabel, tooltip: tooltip};
    },

    /**
     * @param {!WebInspector.NetworkRequest} request
     */
    updateBoundaries: function(request)
    {
        var lowerBound = this._lowerBound(request);
        var upperBound = this._upperBound(request);
        var changed = false;
        if (lowerBound !== -1 || this.startAtZero)
            changed = this._extendBoundariesToIncludeTimestamp(this.startAtZero ? 0 : lowerBound);
        if (upperBound !== -1)
            changed = this._extendBoundariesToIncludeTimestamp(upperBound) || changed;
        if (changed)
            this._boundaryChanged();
    },

    /**
     * @param {number} timestamp
     * @return {boolean}
     */
    _extendBoundariesToIncludeTimestamp: function(timestamp)
    {
        var previousMinimumBoundary = this._minimumBoundary;
        var previousMaximumBoundary = this._maximumBoundary;
        if (typeof this._minimumBoundary === "undefined" || typeof this._maximumBoundary === "undefined") {
            this._minimumBoundary = timestamp;
            this._maximumBoundary = timestamp + 1;
        } else {
            this._minimumBoundary = Math.min(timestamp, this._minimumBoundary);
            this._maximumBoundary = Math.max(timestamp, this._minimumBoundary + 1, this._maximumBoundary);
        }
        return previousMinimumBoundary !== this._minimumBoundary || previousMaximumBoundary !== this._maximumBoundary;
    },

    /**
     * @param {!WebInspector.NetworkRequest} request
     * @return {number}
     */
    _lowerBound: function(request)
    {
        return 0;
    },

    /**
     * @param {!WebInspector.NetworkRequest} request
     * @return {number}
     */
    _upperBound: function(request)
    {
        return 0;
    },

    __proto__: WebInspector.Object.prototype
}

/**
 * @constructor
 * @extends {WebInspector.NetworkTimeCalculator}
 */
WebInspector.NetworkTransferTimeCalculator = function()
{
    WebInspector.NetworkTimeCalculator.call(this, false);
}

WebInspector.NetworkTransferTimeCalculator.prototype = {
    /**
     * @override
     * @param {number} value
     * @param {number=} precision
     * @return {string}
     */
    formatTime: function(value, precision)
    {
        return Number.secondsToString(value - this.zeroTime(), !!precision);
    },

    /**
     * @override
     * @param {!WebInspector.NetworkRequest} request
     * @return {number}
     */
    _lowerBound: function(request)
    {
        return request.issueTime();
    },

    /**
     * @override
     * @param {!WebInspector.NetworkRequest} request
     * @return {number}
     */
    _upperBound: function(request)
    {
        return request.endTime;
    },

    __proto__: WebInspector.NetworkTimeCalculator.prototype
}

/**
 * @constructor
 * @extends {WebInspector.NetworkTimeCalculator}
 */
WebInspector.NetworkTransferDurationCalculator = function()
{
    WebInspector.NetworkTimeCalculator.call(this, true);
}

WebInspector.NetworkTransferDurationCalculator.prototype = {
    /**
     * @override
     * @param {number} value
     * @param {number=} precision
     * @return {string}
     */
    formatTime: function(value, precision)
    {
        return Number.secondsToString(value, !!precision);
    },

    /**
     * @override
     * @param {!WebInspector.NetworkRequest} request
     * @return {number}
     */
    _upperBound: function(request)
    {
        return request.duration;
    },

    __proto__: WebInspector.NetworkTimeCalculator.prototype
}
