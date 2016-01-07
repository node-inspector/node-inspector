/*
 * Copyright (C) 2010 Google Inc. All rights reserved.
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
 * @param {!WebInspector.NetworkRequest} request
 * @param {!WebInspector.NetworkTimeCalculator} calculator
 */
WebInspector.RequestTimingView = function(request, calculator)
{
    WebInspector.VBox.call(this);
    this.element.classList.add("resource-timing-view");

    this._request = request;
    this._calculator = calculator;
}

WebInspector.RequestTimingView.prototype = {
    wasShown: function()
    {
        this._request.addEventListener(WebInspector.NetworkRequest.Events.TimingChanged, this._refresh, this);
        this._request.addEventListener(WebInspector.NetworkRequest.Events.FinishedLoading, this._refresh, this);
        this._calculator.addEventListener(WebInspector.NetworkTimeCalculator.Events.BoundariesChanged, this._refresh, this);
        this._refresh();
    },

    willHide: function()
    {
        this._request.removeEventListener(WebInspector.NetworkRequest.Events.TimingChanged, this._refresh, this);
        this._request.removeEventListener(WebInspector.NetworkRequest.Events.FinishedLoading, this._refresh, this);
        this._calculator.removeEventListener(WebInspector.NetworkTimeCalculator.Events.BoundariesChanged, this._refresh, this);
    },

    _refresh: function()
    {
        if (this._tableElement)
            this._tableElement.remove();

        this._tableElement = WebInspector.RequestTimingView.createTimingTable(this._request, this._calculator.minimumBoundary());
        this.element.appendChild(this._tableElement);
    },

    __proto__: WebInspector.VBox.prototype
}

/** @enum {string} */
WebInspector.RequestTimeRangeNames = {
    Queueing: "queueing",
    Blocking: "blocking",
    Connecting: "connecting",
    DNS: "dns",
    Proxy: "proxy",
    Receiving: "receiving",
    Sending: "sending",
    ServiceWorker: "serviceworker",
    ServiceWorkerPreparation: "serviceworker-preparation",
    SSL: "ssl",
    Total: "total",
    Waiting: "waiting"
};

WebInspector.RequestTimingView.ConnectionSetupRangeNames = [
    WebInspector.RequestTimeRangeNames.Queueing,
    WebInspector.RequestTimeRangeNames.Blocking,
    WebInspector.RequestTimeRangeNames.Connecting,
    WebInspector.RequestTimeRangeNames.DNS,
    WebInspector.RequestTimeRangeNames.Proxy,
    WebInspector.RequestTimeRangeNames.SSL
].keySet();

/** @typedef {{name: !WebInspector.RequestTimeRangeNames, start: number, end: number}} */
WebInspector.RequestTimeRange;

/**
 * @param {!WebInspector.RequestTimeRangeNames} name
 * @return {string}
 */
WebInspector.RequestTimingView._timeRangeTitle = function(name)
{
    switch (name) {
    case WebInspector.RequestTimeRangeNames.Queueing: return WebInspector.UIString("Queueing");
    case WebInspector.RequestTimeRangeNames.Blocking: return WebInspector.UIString("Stalled");
    case WebInspector.RequestTimeRangeNames.Connecting: return WebInspector.UIString("Initial connection");
    case WebInspector.RequestTimeRangeNames.DNS: return WebInspector.UIString("DNS Lookup");
    case WebInspector.RequestTimeRangeNames.Proxy: return WebInspector.UIString("Proxy negotiation");
    case WebInspector.RequestTimeRangeNames.Receiving: return WebInspector.UIString("Content Download");
    case WebInspector.RequestTimeRangeNames.Sending: return WebInspector.UIString("Request sent");
    case WebInspector.RequestTimeRangeNames.ServiceWorker: return WebInspector.UIString("Request to ServiceWorker");
    case WebInspector.RequestTimeRangeNames.ServiceWorkerPreparation: return WebInspector.UIString("ServiceWorker Preparation");
    case WebInspector.RequestTimeRangeNames.SSL: return WebInspector.UIString("SSL");
    case WebInspector.RequestTimeRangeNames.Total: return WebInspector.UIString("Total");
    case WebInspector.RequestTimeRangeNames.Waiting: return WebInspector.UIString("Waiting (TTFB)");
    default: return WebInspector.UIString(name);
    }
}

/**
 * @param {!WebInspector.NetworkRequest} request
 * @return {!Array.<!WebInspector.RequestTimeRange>}
 */
WebInspector.RequestTimingView.calculateRequestTimeRanges = function(request)
{
    var result = [];
    /**
     * @param {!WebInspector.RequestTimeRangeNames} name
     * @param {number} start
     * @param {number} end
     */
    function addRange(name, start, end)
    {
        if (start < Number.MAX_VALUE && start <= end)
            result.push({name: name, start: start, end: end});
    }

    /**
     * @param {!Array.<number>} numbers
     * @return {number|undefined}
     */
    function firstPositive(numbers)
    {
        for (var i = 0; i < numbers.length; ++i) {
            if (numbers[i] > 0)
                return numbers[i];
        }
        return undefined;
    }

    /**
     * @param {!WebInspector.RequestTimeRangeNames} name
     * @param {number} start
     * @param {number} end
     */
    function addOffsetRange(name, start, end)
    {
        if (start >= 0 && end >= 0)
            addRange(name, startTime + (start / 1000), startTime + (end / 1000));
    }

    var timing = request.timing;
    if (!timing) {
        var start = request.issueTime() !== -1 ? request.issueTime() : request.startTime !== -1 ? request.startTime : 0;
        var middle = (request.responseReceivedTime === -1) ? Number.MAX_VALUE : request.responseReceivedTime;
        var end = (request.endTime === -1) ? Number.MAX_VALUE : request.endTime;
        addRange(WebInspector.RequestTimeRangeNames.Total, start, end);
        addRange(WebInspector.RequestTimeRangeNames.Blocking, start, middle);
        addRange(WebInspector.RequestTimeRangeNames.Receiving, middle, end);
        return result;
    }

    var issueTime = request.issueTime();
    var startTime = timing.requestTime;
    var endTime = firstPositive([request.endTime, request.responseReceivedTime]) || startTime;

    addRange(WebInspector.RequestTimeRangeNames.Total, issueTime < startTime ? issueTime : startTime, endTime);
    if (issueTime < startTime)
        addRange(WebInspector.RequestTimeRangeNames.Queueing, issueTime, startTime);

    if (request.fetchedViaServiceWorker) {
        addOffsetRange(WebInspector.RequestTimeRangeNames.Blocking, 0, timing.workerStart);
        addOffsetRange(WebInspector.RequestTimeRangeNames.ServiceWorkerPreparation, timing.workerStart, timing.workerReady);
        addOffsetRange(WebInspector.RequestTimeRangeNames.ServiceWorker, timing.workerReady, timing.sendEnd);
        addOffsetRange(WebInspector.RequestTimeRangeNames.Waiting, timing.sendEnd, timing.receiveHeadersEnd);
    } else {
        var blocking = firstPositive([timing.dnsStart, timing.connectStart, timing.sendStart]) || 0;
        addOffsetRange(WebInspector.RequestTimeRangeNames.Blocking, 0, blocking);
        addOffsetRange(WebInspector.RequestTimeRangeNames.Proxy, timing.proxyStart, timing.proxyEnd);
        addOffsetRange(WebInspector.RequestTimeRangeNames.DNS, timing.dnsStart, timing.dnsEnd);
        addOffsetRange(WebInspector.RequestTimeRangeNames.Connecting, timing.connectStart, timing.connectEnd);
        addOffsetRange(WebInspector.RequestTimeRangeNames.SSL, timing.sslStart, timing.sslEnd);
        addOffsetRange(WebInspector.RequestTimeRangeNames.Sending, timing.sendStart, timing.sendEnd);
        addOffsetRange(WebInspector.RequestTimeRangeNames.Waiting, timing.sendEnd, timing.receiveHeadersEnd);
    }

    if (request.endTime !== -1)
        addRange(WebInspector.RequestTimeRangeNames.Receiving, request.responseReceivedTime, endTime);

    return result;
}

/**
 * @param {!WebInspector.NetworkRequest} request
 * @param {number} navigationStart
 * @return {!Element}
 */
WebInspector.RequestTimingView.createTimingTable = function(request, navigationStart)
{
    var tableElement = createElementWithClass("table", "network-timing-table");
    var colgroup = tableElement.createChild("colgroup");
    colgroup.createChild("col", "labels");
    colgroup.createChild("col", "bars");
    colgroup.createChild("col", "duration");

    var timeRanges = WebInspector.RequestTimingView.calculateRequestTimeRanges(request);
    var startTime = timeRanges[0].start;
    var endTime = timeRanges[0].end;
    var scale = 100 / (endTime - startTime);

    var connectionHeader;
    var dataHeader;
    var totalDuration = 0;

    for (var i = 0; i < timeRanges.length; ++i) {
        var range = timeRanges[i];
        var rangeName = range.name;
        if (rangeName === WebInspector.RequestTimeRangeNames.Total) {
            totalDuration = range.end - range.start;
            continue;
        }
        if (WebInspector.RequestTimingView.ConnectionSetupRangeNames[rangeName]) {
            if (!connectionHeader) {
                connectionHeader = tableElement.createChild("tr", "network-timing-table-header");
                connectionHeader.createChild("td").createTextChild("Connection Setup");
                connectionHeader.createChild("td").createTextChild("");
                connectionHeader.createChild("td").createTextChild("TIME");
            }
        } else {
            if (!dataHeader) {
                dataHeader = tableElement.createChild("tr", "network-timing-table-header");
                dataHeader.createChild("td").createTextChild("Request/Response");
                dataHeader.createChild("td").createTextChild("");
                dataHeader.createChild("td").createTextChild("TIME");
            }
        }

        var left = (scale * (range.start - startTime));
        var right = (scale * (endTime - range.end));
        var duration = range.end - range.start;

        var tr = tableElement.createChild("tr");
        tr.createChild("td").createTextChild(WebInspector.RequestTimingView._timeRangeTitle(rangeName));

        var row = tr.createChild("td").createChild("div", "network-timing-row");
        var bar = row.createChild("span", "network-timing-bar " + rangeName);
        bar.style.left = left + "%";
        bar.style.right = right + "%";
        bar.textContent = "\u200B"; // Important for 0-time items to have 0 width.
        var label = tr.createChild("td").createChild("div", "network-timing-bar-title");
        label.textContent = Number.secondsToString(duration, true);
    }

    if (!request.finished) {
        var cell = tableElement.createChild("tr").createChild("td", "caution");
        cell.colSpan = 3;
        cell.createTextChild(WebInspector.UIString("CAUTION: request is not finished yet!"));
    }

    var footer = tableElement.createChild("tr", "network-timing-footer");
    var note = footer.createChild("td");
    note.colSpan = 2;
    note.appendChild(WebInspector.linkifyDocumentationURLAsNode("profile-performance/network-performance/resource-loading#resource-network-timing", WebInspector.UIString("Explanation")));
    footer.createChild("td").createTextChild(Number.secondsToString(totalDuration, true));

    return tableElement;
}
