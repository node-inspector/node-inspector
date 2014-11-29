// Copyright 2014 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

/**
 * @constructor
 * @extends {WebInspector.CountersGraph}
 * @implements {WebInspector.TimelineModeView}
 * @param {!WebInspector.TimelineModeViewDelegate} delegate
 * @param {!WebInspector.TimelineModel} model
 */
WebInspector.TimelinePowerGraph = function(delegate, model)
{
    WebInspector.CountersGraph.call(this, WebInspector.UIString("POWER"), delegate, model);

    this._counter = this.createCounter(WebInspector.UIString("Power"), WebInspector.UIString("Power: %.2f\u2009watts"), "#d00");
    WebInspector.powerProfiler.addEventListener(WebInspector.PowerProfiler.EventTypes.PowerEventRecorded, this._onRecordAdded, this);
}

WebInspector.TimelinePowerGraph.prototype = {
    dispose: function()
    {
        WebInspector.CountersGraph.prototype.dispose.call(this);
        WebInspector.powerProfiler.removeEventListener(WebInspector.PowerProfiler.EventTypes.PowerEventRecorded, this._onRecordAdded, this);
    },

    _onRecordAdded: function(event)
    {
        var record = event.data;
        if (!this._previousRecord) {
            this._previousRecord = record;
            return;
        }

        // "value" of original PowerEvent means the average power between previous sampling to current one.
        // Here, it is converted to average power between current sampling to next one.
        this._counter.appendSample(this._previousRecord.timestamp, record.value);
        this._previousRecord = record;
        this.scheduleRefresh();
    },

    __proto__: WebInspector.CountersGraph.prototype
}
