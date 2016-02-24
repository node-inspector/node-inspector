/**
 * @constructor
 * @extends {WebInspector.SDKModel}
 * @param {!WebInspector.Target} target
 */
WebInspector.HeapProfilerModel = function(target)
{
    WebInspector.SDKModel.call(this, WebInspector.HeapProfilerModel, target);
    target.registerHeapProfilerDispatcher(new WebInspector.HeapProfilerDispatcher(this));
    this._enabled = false;
    this._heapProfilerAgent = target.heapProfilerAgent();
}

WebInspector.HeapProfilerModel.Events = {
    HeapStatsUpdate: "HeapStatsUpdate",
    LastSeenObjectId: "LastSeenObjectId",
    AddHeapSnapshotChunk: "AddHeapSnapshotChunk",
    ReportHeapSnapshotProgress: "ReportHeapSnapshotProgress",
    ResetProfiles: "ResetProfiles"
}

WebInspector.HeapProfilerModel.prototype = {

    enable: function()
    {
        if (this._enabled)
            return;

        this._enabled = true;
        this._heapProfilerAgent.enable();
    },

    /**
     * @param {!Array.<number>} samples
     */
    heapStatsUpdate: function(samples)
    {
        this.dispatchEventToListeners(WebInspector.HeapProfilerModel.Events.HeapStatsUpdate, samples);
    },

    /**
     * @param {number} lastSeenObjectId
     * @param {number} timestamp
     */
    lastSeenObjectId: function(lastSeenObjectId, timestamp)
    {
        this.dispatchEventToListeners(WebInspector.HeapProfilerModel.Events.LastSeenObjectId ,{lastSeenObjectId: lastSeenObjectId, timestamp: timestamp});
    },

    /**
     * @param {string} chunk
     */
    addHeapSnapshotChunk: function(chunk)
    {
        this.dispatchEventToListeners(WebInspector.HeapProfilerModel.Events.AddHeapSnapshotChunk, chunk);
    },

    /**
     * @param {number} done
     * @param {number} total
     * @param {boolean=} finished
     */
    reportHeapSnapshotProgress: function(done, total, finished)
    {
        this.dispatchEventToListeners(WebInspector.HeapProfilerModel.Events.ReportHeapSnapshotProgress, {done: done, total: total, finished: finished});
    },

    resetProfiles: function()
    {
        this.dispatchEventToListeners(WebInspector.HeapProfilerModel.Events.ResetProfiles);
    },

    __proto__: WebInspector.SDKModel.prototype
}


/**
 * @constructor
 * @implements {HeapProfilerAgent.Dispatcher}
 */
WebInspector.HeapProfilerDispatcher = function(model)
{
    this._heapProfilerModel = model;
}

WebInspector.HeapProfilerDispatcher.prototype = {
    /**
     * @override
     * @param {!Array.<number>} samples
     */
    heapStatsUpdate: function(samples)
    {
        this._heapProfilerModel.heapStatsUpdate(samples);
    },

    /**
     * @override
     * @param {number} lastSeenObjectId
     * @param {number} timestamp
     */
    lastSeenObjectId: function(lastSeenObjectId, timestamp)
    {
        this._heapProfilerModel.lastSeenObjectId(lastSeenObjectId, timestamp);
    },

    /**
     * @override
     * @param {string} chunk
     */
    addHeapSnapshotChunk: function(chunk)
    {
        this._heapProfilerModel.addHeapSnapshotChunk(chunk);
    },

    /**
     * @override
     * @param {number} done
     * @param {number} total
     * @param {boolean=} finished
     */
    reportHeapSnapshotProgress: function(done, total, finished)
    {
        this._heapProfilerModel.reportHeapSnapshotProgress(done, total, finished);
    },

    /**
     * @override
     */
    resetProfiles: function()
    {
        this._heapProfilerModel.resetProfiles();
    }
}