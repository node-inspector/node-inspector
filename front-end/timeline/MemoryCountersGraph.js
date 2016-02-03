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
 * @extends {WebInspector.CountersGraph}
 * @implements {WebInspector.TimelineModeView}
 * @param {!WebInspector.TimelineModeViewDelegate} delegate
 * @param {!WebInspector.TimelineModel} model
 */
WebInspector.MemoryCountersGraph = function(delegate, model)
{
    WebInspector.CountersGraph.call(this, WebInspector.UIString("MEMORY"), delegate, model);
    this._countersByName = {};
    this._countersByName["jsHeapSizeUsed"] = this.createCounter(WebInspector.UIString("JS Heap"), WebInspector.UIString("JS Heap: %s"), "hsl(220, 90%, 43%)", Number.bytesToString);
    this._countersByName["documents"] = this.createCounter(WebInspector.UIString("Documents"), WebInspector.UIString("Documents: %s"), "hsl(0, 90%, 43%)");
    this._countersByName["nodes"] = this.createCounter(WebInspector.UIString("Nodes"), WebInspector.UIString("Nodes: %s"), "hsl(120, 90%, 43%)");
    this._countersByName["jsEventListeners"] = this.createCounter(WebInspector.UIString("Listeners"), WebInspector.UIString("Listeners: %s"), "hsl(38, 90%, 43%)");
    if (Runtime.experiments.isEnabled("gpuTimeline")) {
        this._gpuMemoryCounter = this.createCounter(WebInspector.UIString("GPU Memory"), WebInspector.UIString("GPU Memory [KB]: %s"), "hsl(300, 90%, 43%)", Number.bytesToString);
        this._countersByName["gpuMemoryUsedKB"] = this._gpuMemoryCounter;
    }
}

WebInspector.MemoryCountersGraph.prototype = {
    /**
     * @override
     * @param {?RegExp} textFilter
     */
    refreshRecords: function(textFilter)
    {
        this.reset();
        var events = this._model.mainThreadEvents();
        for (var i = 0; i < events.length; ++i) {
            var event = events[i];
            if (event.name !== WebInspector.TimelineModel.RecordType.UpdateCounters)
                continue;

            var counters = event.args.data;
            if (!counters)
                return;
            for (var name in counters) {
                var counter = this._countersByName[name];
                if (counter)
                    counter.appendSample(event.startTime, counters[name]);
            }

            var gpuMemoryLimitCounterName = "gpuMemoryLimitKB";
            if (this._gpuMemoryCounter && (gpuMemoryLimitCounterName in counters))
                this._gpuMemoryCounter.setLimit(counters[gpuMemoryLimitCounterName]);
        }
        this.scheduleRefresh();
    },

    __proto__: WebInspector.CountersGraph.prototype
}
