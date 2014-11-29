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
 * @extends {WebInspector.TimelineOverviewBase}
 * @param {!WebInspector.TimelineModel} model
 */
WebInspector.TimelineMemoryOverview = function(model)
{
    WebInspector.TimelineOverviewBase.call(this, model);
    this.element.id = "timeline-overview-memory";

    this._heapSizeLabel = this.element.createChild("div", "memory-graph-label");
}

WebInspector.TimelineMemoryOverview.prototype = {
    resetHeapSizeLabels: function()
    {
        this._heapSizeLabel.textContent = "";
    },

    update: function()
    {
        this.resetCanvas();
        var ratio = window.devicePixelRatio;

        var records = this._model.records();
        if (!records.length) {
            this.resetHeapSizeLabels();
            return;
        }

        var lowerOffset = 3 * ratio;
        var maxUsedHeapSize = 0;
        var minUsedHeapSize = 100000000000;
        var minTime = this._model.minimumRecordTime();
        var maxTime = this._model.maximumRecordTime();
        /**
         * @param {!WebInspector.TimelineModel.Record} record
         */
        function calculateMinMaxSizes(record)
        {
            var counters = WebInspector.TimelineUIUtils.isCoalescable.countersForRecord(record);
            if (!counters || !counters.jsHeapSizeUsed)
                return;
            maxUsedHeapSize = Math.max(maxUsedHeapSize, counters.jsHeapSizeUsed);
            minUsedHeapSize = Math.min(minUsedHeapSize, counters.jsHeapSizeUsed);
        }
        this._model.forAllRecords(calculateMinMaxSizes);
        minUsedHeapSize = Math.min(minUsedHeapSize, maxUsedHeapSize);

        var lineWidth = 1;
        var width = this._canvas.width;
        var height = this._canvas.height - lowerOffset;
        var xFactor = width / (maxTime - minTime);
        var yFactor = (height - lineWidth) / Math.max(maxUsedHeapSize - minUsedHeapSize, 1);

        var histogram = new Array(width);

        /**
         * @param {!WebInspector.TimelineModel.Record} record
         */
        function buildHistogram(record)
        {
            var counters = WebInspector.TimelineUIUtils.isCoalescable.countersForRecord(record);
            if (!counters || !counters.jsHeapSizeUsed)
                return;
            var x = Math.round((record.endTime() - minTime) * xFactor);
            var y = Math.round((counters.jsHeapSizeUsed - minUsedHeapSize) * yFactor);
            histogram[x] = Math.max(histogram[x] || 0, y);
        }
        this._model.forAllRecords(buildHistogram);

        var ctx = this._context;
        var heightBeyondView = height + lowerOffset + lineWidth;

        ctx.translate(0.5, 0.5);
        ctx.beginPath();
        ctx.moveTo(-lineWidth, heightBeyondView);
        var y = 0;
        var isFirstPoint = true;
        var lastX = 0;
        for (var x = 0; x < histogram.length; x++) {
            if (typeof histogram[x] === "undefined")
                continue;
            if (isFirstPoint) {
                isFirstPoint = false;
                y = histogram[x];
                ctx.lineTo(-lineWidth, height - y);
            }
            var nextY = histogram[x];
            if (Math.abs(nextY - y) > 2 && Math.abs(x - lastX) > 1)
                ctx.lineTo(x, height - y);
            y = nextY;
            ctx.lineTo(x, height - y);
            lastX = x;
        }
        ctx.lineTo(width + lineWidth, height - y);
        ctx.lineTo(width + lineWidth, heightBeyondView);
        ctx.closePath();

        ctx.fillStyle = "hsla(220, 90%, 70%, 0.2)";
        ctx.fill();
        ctx.lineWidth = lineWidth;
        ctx.strokeStyle = "hsl(220, 90%, 70%)";
        ctx.stroke();

        this._heapSizeLabel.textContent = WebInspector.UIString("%s \u2013 %s", Number.bytesToString(minUsedHeapSize), Number.bytesToString(maxUsedHeapSize));
    },

    __proto__: WebInspector.TimelineOverviewBase.prototype
}
