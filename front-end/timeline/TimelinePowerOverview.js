// Copyright 2014 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

/**
 * @constructor
 * @extends {WebInspector.Object}
 */
WebInspector.TimelinePowerOverviewDataProvider = function()
{
    this._records = [];
    this._energies = [];
    this._times = [];
    WebInspector.powerProfiler.addEventListener(WebInspector.PowerProfiler.EventTypes.PowerEventRecorded, this._onRecordAdded, this);
}

WebInspector.TimelinePowerOverviewDataProvider.prototype = {
    dispose: function()
    {
        WebInspector.powerProfiler.removeEventListener(WebInspector.PowerProfiler.EventTypes.PowerEventRecorded, this._onRecordAdded, this);
    },

    /**
     * @return {!Array.<!PowerAgent.PowerEvent>}
     */
    records : function()
    {
        // The last record is not used, as its "value" is not set.
        return this._records.slice(0, this._records.length - 1);
    },

    /**
     * @param {number} minTime
     * @param {number} maxTime
     * @return {number} energy in joules.
     */
    _calculateEnergy : function(minTime, maxTime)
    {
        var times = this._times;
        var energies = this._energies;
        var last = times.length - 1;

        if (last < 1 || minTime >= times[last] || maxTime <= times[0])
            return 0;

        // Maximum index of element whose time <= minTime.
        var start = Number.constrain(times.upperBound(minTime) - 1, 0, last);

        // Minimum index of element whose time >= maxTime.
        var end = Number.constrain(times.lowerBound(maxTime), 0, last);

        var startTime = minTime < times[0] ? times[0] : minTime;
        var endTime = maxTime > times[last] ? times[last] : maxTime;

        if (start + 1 === end)
           return (endTime - startTime) / (times[end] - times[start]) * (energies[end] - energies[start]) / 1000;

        var totalEnergy = 0;
        totalEnergy += energies[end - 1] - energies[start + 1];
        totalEnergy += (times[start + 1] - startTime) / (times[start + 1] - times[start]) * (energies[start + 1] - energies[start]);
        totalEnergy += (endTime - times[end - 1]) / (times[end] - times[end - 1]) * (energies[end] - energies[end - 1]);
        return totalEnergy / 1000;
    },

    _onRecordAdded: function(event)
    {
        // "value" of original PowerEvent means the average power between previous sampling to current one.
        // Here, it is converted to average power between current sampling to next one.
        var record = event.data;
        var curTime = record.timestamp;
        var length = this._records.length;
        var accumulatedEnergy = 0;
        if (length) {
            this._records[length - 1].value = record.value;

            var prevTime = this._records[length - 1].timestamp;
            accumulatedEnergy = this._energies[length - 1];
            accumulatedEnergy += (curTime - prevTime) * record.value;
        }
        this._energies.push(accumulatedEnergy);
        this._records.push(record);
        this._times.push(curTime);
    },

    __proto__: WebInspector.Object.prototype
}

/**
 * @constructor
 * @extends {WebInspector.TimelineOverviewBase}
 * @param {!WebInspector.TimelineModel} model
 */
WebInspector.TimelinePowerOverview = function(model)
{
    WebInspector.TimelineOverviewBase.call(this, model);
    this.element.id = "timeline-overview-power";
    this._dataProvider = new WebInspector.TimelinePowerOverviewDataProvider();

    this._maxPowerLabel = this.element.createChild("div", "max memory-graph-label");
    this._minPowerLabel = this.element.createChild("div", "min memory-graph-label");
}

WebInspector.TimelinePowerOverview.prototype = {
    dispose: function()
    {
        this._dataProvider.dispose();
    },

    timelineStarted: function()
    {
        if (WebInspector.targetManager.mainTarget().hasCapability(WebInspector.Target.Capabilities.CanProfilePower))
            WebInspector.powerProfiler.startProfile();
    },

    timelineStopped: function()
    {
        if (WebInspector.targetManager.mainTarget().hasCapability(WebInspector.Target.Capabilities.CanProfilePower))
            WebInspector.powerProfiler.stopProfile();
    },

    _resetPowerLabels: function()
    {
        this._maxPowerLabel.textContent = "";
        this._minPowerLabel.textContent = "";
    },

    update: function()
    {
        this.resetCanvas();

        var records = this._dataProvider.records();
        if (!records.length) {
            this._resetPowerLabels();
            return;
        }

        const lowerOffset = 3;
        var maxPower = 0;
        var minPower = 100000000000;
        var minTime = this._model.minimumRecordTime();
        var maxTime = this._model.maximumRecordTime();
        for (var i = 0; i < records.length; i++) {
            var record = records[i];
            if (record.timestamp < minTime || record.timestamp > maxTime)
                continue;
            maxPower = Math.max(maxPower, record.value);
            minPower = Math.min(minPower, record.value);
        }
        minPower = Math.min(minPower, maxPower);


        var width = this._canvas.width;
        var height = this._canvas.height - lowerOffset;
        var xFactor = width / (maxTime - minTime);
        var yFactor = height / Math.max(maxPower - minPower, 1);

        var histogram = new Array(width);
        for (var i = 0; i < records.length - 1; i++) {
            var record = records[i];
            if (record.timestamp < minTime || record.timestamp > maxTime)
                continue;
            var x = Math.round((record.timestamp - minTime) * xFactor);
            var y = Math.round((record.value- minPower ) * yFactor);
            histogram[x] = Math.max(histogram[x] || 0, y);
        }

        var y = 0;
        var isFirstPoint = true;
        var ctx = this._context;
        ctx.save();
        ctx.translate(0.5, 0.5);
        ctx.beginPath();
        ctx.moveTo(-1, this._canvas.height);
        for (var x = 0; x < histogram.length; x++) {
            if (typeof histogram[x] === "undefined")
                continue;
            if (isFirstPoint) {
                isFirstPoint = false;
                y = histogram[x];
                ctx.lineTo(-1, height - y);
            }
            ctx.lineTo(x, height - y);
            y = histogram[x];
            ctx.lineTo(x, height - y);
        }

        ctx.lineTo(width, height - y);
        ctx.lineTo(width, this._canvas.height);
        ctx.lineTo(-1, this._canvas.height);
        ctx.closePath();

        ctx.fillStyle = "rgba(255,192,0, 0.8);";
        ctx.fill();

        ctx.lineWidth = 0.5;
        ctx.strokeStyle = "rgba(20,0,0,0.8)";
        ctx.stroke();
        ctx.restore();

        this._maxPowerLabel.textContent = WebInspector.UIString("%.2f\u2009watts", maxPower);
        this._minPowerLabel.textContent = WebInspector.UIString("%.2f\u2009watts", minPower);
    },

    /**
     * @param {number} minTime
     * @param {number} maxTime
     * @return {number} energy in joules.
     */
    calculateEnergy: function(minTime, maxTime)
    {
        return this._dataProvider._calculateEnergy(minTime, maxTime);
    },

    __proto__: WebInspector.TimelineOverviewBase.prototype
}


