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
 */
WebInspector.TimelineFrameModelBase = function()
{
    this.reset();
}

WebInspector.TimelineFrameModelBase.prototype = {
    /**
     * @param {boolean} value
     */
    setMergeRecords: function(value)
    {
    },

    /**
     * @return {!Array.<!WebInspector.TimelineFrame>}
     */
    frames: function()
    {
        return this._frames;
    },

    /**
     * @param {number} startTime
     * @param {number} endTime
     * @return {!Array.<!WebInspector.TimelineFrame>}
     */
    filteredFrames: function(startTime, endTime)
    {
        /**
         * @param {number} value
         * @param {!WebInspector.TimelineFrame} object
         * @return {number}
         */
        function compareStartTime(value, object)
        {
            return value - object.startTime;
        }
        /**
         * @param {number} value
         * @param {!WebInspector.TimelineFrame} object
         * @return {number}
         */
        function compareEndTime(value, object)
        {
            return value - object.endTime;
        }
        var frames = this._frames;
        var firstFrame = insertionIndexForObjectInListSortedByFunction(startTime, frames, compareEndTime);
        var lastFrame = insertionIndexForObjectInListSortedByFunction(endTime, frames, compareStartTime);
        return frames.slice(firstFrame, lastFrame);
    },

    reset: function()
    {
        this._minimumRecordTime = Infinity;
        this._frames = [];
        this._lastFrame = null;
        this._lastLayerTree = null;
        this._hasThreadedCompositing = false;
        this._mainFrameCommitted = false;
        this._mainFrameRequested = false;
        this._framePendingCommit = null;
    },

    /**
     * @param {number} startTime
     */
    handleBeginFrame: function(startTime)
    {
        if (!this._lastFrame)
            this._startBackgroundFrame(startTime);
    },

    /**
     * @param {number} startTime
     */
    handleDrawFrame: function(startTime)
    {
        if (!this._lastFrame) {
            this._startBackgroundFrame(startTime);
            return;
        }

        // - if it wasn't drawn, it didn't happen!
        // - only show frames that either did not wait for the main thread frame or had one committed.
        if (this._mainFrameCommitted || !this._mainFrameRequested)
            this._startBackgroundFrame(startTime);
        this._mainFrameCommitted = false;
    },

    handleActivateLayerTree: function()
    {
        if (!this._lastFrame)
            return;
        this._mainFrameRequested = false;
        this._mainFrameCommitted = true;
        if (this._framePendingActivation) {
            this._lastFrame._addTimeForCategories(this._framePendingActivation.timeByCategory);
            this._lastFrame.paints = this._framePendingActivation.paints;
            this._framePendingActivation = null;
        }
    },

    handleRequestMainThreadFrame: function()
    {
        if (!this._lastFrame)
            return;
        this._mainFrameRequested = true;
    },

    handleCompositeLayers: function()
    {
        if (!this._hasThreadedCompositing || !this._framePendingCommit)
            return;
        this._framePendingActivation = this._framePendingCommit;
        this._framePendingCommit = null;
    },

    /**
     * @param {!WebInspector.DeferredLayerTree} layerTree
     */
    handleLayerTreeSnapshot: function(layerTree)
    {
        this._lastLayerTree = layerTree;
    },

    /**
     * @param {number} startTime
     */
    _startBackgroundFrame: function(startTime)
    {
        if (!this._hasThreadedCompositing) {
            this._lastFrame = null;
            this._hasThreadedCompositing = true;
        }
        if (this._lastFrame)
            this._flushFrame(this._lastFrame, startTime);

        this._lastFrame = new WebInspector.TimelineFrame(startTime, startTime - this._minimumRecordTime);
    },

    /**
     * @param {number} startTime
     */
    _startMainThreadFrame: function(startTime)
    {
        if (this._lastFrame)
            this._flushFrame(this._lastFrame, startTime);
        this._lastFrame = new WebInspector.TimelineFrame(startTime, startTime - this._minimumRecordTime);
    },

    /**
     * @param {!WebInspector.TimelineFrame} frame
     * @param {number} endTime
     */
    _flushFrame: function(frame, endTime)
    {
        frame._setLayerTree(this._lastLayerTree);
        frame._setEndTime(endTime);
        this._frames.push(frame);
    },

    /**
     * @param {!Array.<string>} types
     * @param {!WebInspector.TimelineModel.Record} record
     * @return {?WebInspector.TimelineModel.Record} record
     */
    _findRecordRecursively: function(types, record)
    {
        if (types.indexOf(record.type()) >= 0)
            return record;
        if (!record.children())
            return null;
        for (var i = 0; i < record.children().length; ++i) {
            var result = this._findRecordRecursively(types, record.children()[i]);
            if (result)
                return result;
        }
        return null;
    }
}

/**
 * @constructor
 * @extends {WebInspector.TimelineFrameModelBase}
 */
WebInspector.TracingTimelineFrameModel = function()
{
    WebInspector.TimelineFrameModelBase.call(this);
}

WebInspector.TracingTimelineFrameModel._mainFrameMarkers = [
    WebInspector.TimelineModel.RecordType.ScheduleStyleRecalculation,
    WebInspector.TimelineModel.RecordType.InvalidateLayout,
    WebInspector.TimelineModel.RecordType.BeginMainThreadFrame,
    WebInspector.TimelineModel.RecordType.ScrollLayer
];

WebInspector.TracingTimelineFrameModel.prototype = {
    reset: function()
    {
        WebInspector.TimelineFrameModelBase.prototype.reset.call(this);
        this._target = null;
        this._sessionId = null;
    },

    /**
     * @param {?WebInspector.Target} target
     * @param {!Array.<!WebInspector.TracingModel.Event>} events
     * @param {string} sessionId
     */
    addTraceEvents: function(target, events, sessionId)
    {
        this._target = target;
        this._sessionId = sessionId;
        if (!events.length)
            return;
        if (events[0].startTime < this._minimumRecordTime)
            this._minimumRecordTime = events[0].startTime;
        for (var i = 0; i < events.length; ++i)
            this._addTraceEvent(events[i]);
    },

    /**
     * @param {!WebInspector.TracingModel.Event} event
     */
    _addTraceEvent: function(event)
    {
        var eventNames = WebInspector.TimelineModel.RecordType;

        if (event.name === eventNames.SetLayerTreeId) {
            if (this._sessionId === event.args["sessionId"])
                this._layerTreeId = event.args["layerTreeId"];
        } else if (event.name === eventNames.TracingStartedInPage) {
            this._mainThread = event.thread;
        } else if (event.phase === WebInspector.TracingModel.Phase.SnapshotObject && event.name === eventNames.LayerTreeHostImplSnapshot && parseInt(event.id, 0) === this._layerTreeId) {
            var snapshot = /** @type {!WebInspector.TracingModel.ObjectSnapshot} */ (event);
            this.handleLayerTreeSnapshot(new WebInspector.DeferredTracingLayerTree(snapshot, this._target));
        } else if (event.thread === this._mainThread) {
            this._addMainThreadTraceEvent(event);
        } else {
            this._addBackgroundTraceEvent(event);
        }
    },

    /**
     * @param {!WebInspector.TracingModel.Event} event
     */
    _addBackgroundTraceEvent: function(event)
    {
        var eventNames = WebInspector.TimelineModel.RecordType;
        if (this._lastFrame && event.selfTime)
            this._lastFrame._addTimeForCategory(WebInspector.TimelineUIUtils.eventStyle(event).category.name, event.selfTime);

        if (event.args["layerTreeId"] !== this._layerTreeId)
            return;

        var timestamp = event.startTime;
        if (event.name === eventNames.BeginFrame)
            this.handleBeginFrame(timestamp);
        else if (event.name === eventNames.DrawFrame)
            this.handleDrawFrame(timestamp);
        else if (event.name === eventNames.ActivateLayerTree)
            this.handleActivateLayerTree();
        else if (event.name === eventNames.RequestMainThreadFrame)
            this.handleRequestMainThreadFrame();
    },

    /**
     * @param {!WebInspector.TracingModel.Event} event
     */
    _addMainThreadTraceEvent: function(event)
    {
        var eventNames = WebInspector.TimelineModel.RecordType;
        var timestamp = event.startTime;
        var selfTime = event.selfTime || 0;

        if (!this._hasThreadedCompositing) {
            if (event.name === eventNames.BeginMainThreadFrame)
                this._startMainThreadFrame(timestamp);
            if (!this._lastFrame)
                return;
            if (!selfTime)
                return;

            var categoryName = WebInspector.TimelineUIUtils.eventStyle(event).category.name;
            this._lastFrame._addTimeForCategory(categoryName, selfTime);
            return;
        }

        if (!this._framePendingCommit && WebInspector.TracingTimelineFrameModel._mainFrameMarkers.indexOf(event.name) >= 0)
            this._framePendingCommit = new WebInspector.PendingFrame();
        if (!this._framePendingCommit)
            return;
        if (event.name === eventNames.Paint && event.args["data"]["layerId"] && event.picture && this._target)
            this._framePendingCommit.paints.push(new WebInspector.LayerPaintEvent(event, this._target));

        if (selfTime) {
            var categoryName = WebInspector.TimelineUIUtils.eventStyle(event).category.name;
            this._framePendingCommit.timeByCategory[categoryName] = (this._framePendingCommit.timeByCategory[categoryName] || 0) + selfTime;
        }
        if (event.name === eventNames.CompositeLayers && event.args["layerTreeId"] === this._layerTreeId)
            this.handleCompositeLayers();
    },

    __proto__: WebInspector.TimelineFrameModelBase.prototype
}

/**
 * @constructor
 * @extends {WebInspector.DeferredLayerTree}
 * @param {!WebInspector.TracingModel.ObjectSnapshot} snapshot
 * @param {?WebInspector.Target} target
 */
WebInspector.DeferredTracingLayerTree = function(snapshot, target)
{
    WebInspector.DeferredLayerTree.call(this, target);
    this._snapshot = snapshot;
}

WebInspector.DeferredTracingLayerTree.prototype = {
    /**
     * @param {function(!WebInspector.LayerTreeBase)} callback
     */
    resolve: function(callback)
    {
        this._snapshot.requestObject(onGotObject.bind(this));
        /**
         * @this {WebInspector.DeferredTracingLayerTree}
         * @param {?Object} result
         */
        function onGotObject(result)
        {
            if (!result)
                return;
            var viewport = result["device_viewport_size"];
            var rootLayer = result["active_tree"]["root_layer"];
            var layerTree = new WebInspector.TracingLayerTree(this._target);
            layerTree.setViewportSize(viewport);
            layerTree.setLayers(rootLayer, callback.bind(null, layerTree));
        }
    },

    __proto__: WebInspector.DeferredLayerTree.prototype
};


/**
 * @constructor
 * @param {number} startTime
 * @param {number} startTimeOffset
 */
WebInspector.TimelineFrame = function(startTime, startTimeOffset)
{
    this.startTime = startTime;
    this.startTimeOffset = startTimeOffset;
    this.endTime = this.startTime;
    this.duration = 0;
    this.timeByCategory = {};
    this.cpuTime = 0;
    /** @type {?WebInspector.DeferredLayerTree} */
    this.layerTree = null;
}

WebInspector.TimelineFrame.prototype = {
    /**
     * @param {number} endTime
     */
    _setEndTime: function(endTime)
    {
        this.endTime = endTime;
        this.duration = this.endTime - this.startTime;
    },

    /**
     * @param {?WebInspector.DeferredLayerTree} layerTree
     */
    _setLayerTree: function(layerTree)
    {
        this.layerTree = layerTree;
    },

    /**
     * @param {!Object} timeByCategory
     */
    _addTimeForCategories: function(timeByCategory)
    {
        for (var category in timeByCategory)
            this._addTimeForCategory(category, timeByCategory[category]);
    },

    /**
     * @param {string} category
     * @param {number} time
     */
    _addTimeForCategory: function(category, time)
    {
        this.timeByCategory[category] = (this.timeByCategory[category] || 0) + time;
        this.cpuTime += time;
    },
}

/**
 * @constructor
 * @param {!WebInspector.TracingModel.Event} event
 * @param {?WebInspector.Target} target
 */
WebInspector.LayerPaintEvent = function(event, target)
{
    this._event = event;
    this._target = target;
}

WebInspector.LayerPaintEvent.prototype = {
    /**
     * @return {string}
     */
    layerId: function()
    {
        return this._event.args["data"]["layerId"];
    },

    /**
     * @return {!WebInspector.TracingModel.Event}
     */
    event: function()
    {
        return this._event;
    },

    /**
     * @param {function(?Array.<number>, ?WebInspector.PaintProfilerSnapshot)} callback
     */
    loadPicture: function(callback)
    {
        this._event.picture.requestObject(onGotObject.bind(this));
        /**
         * @param {?Object} result
         * @this {WebInspector.LayerPaintEvent}
         */
        function onGotObject(result)
        {
            if (!result || !result["skp64"] || !this._target) {
                callback(null, null);
                return;
            }
            var rect = result["params"] && result["params"]["layer_rect"];
            WebInspector.PaintProfilerSnapshot.load(this._target, result["skp64"], callback.bind(null, rect));
        }
    }
};

/**
 * @constructor
 */
WebInspector.PendingFrame = function()
{
    /** @type {!Object.<string, number>} */
    this.timeByCategory = {};
    /** @type {!Array.<!WebInspector.LayerPaintEvent>} */
    this.paints = [];
}
