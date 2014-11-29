/*
 * Copyright 2014 The Chromium Authors. All rights reserved.
 * Use of this source code is governed by a BSD-style license that can be
 * found in the LICENSE file.
 */

/**
 * @constructor
 * @extends {WebInspector.Object}
 * @implements {WebInspector.TargetManager.Observer}
 */
WebInspector.TracingManager = function()
{
    WebInspector.Object.call(this);
    this._active = false;
    this._eventBufferSize = 0;
    this._eventsRetrieved = 0;
    WebInspector.targetManager.observeTargets(this);
}

WebInspector.TracingManager.Events = {
    "RetrieveEventsProgress": "RetrieveEventsProgress",
    "BufferUsage": "BufferUsage",
    "TracingStarted": "TracingStarted",
    "EventsCollected": "EventsCollected",
    "TracingStopped": "TracingStopped",
    "TracingComplete": "TracingComplete"
}

/** @typedef {!{
        cat: string,
        pid: number,
        tid: number,
        ts: number,
        ph: string,
        name: string,
        args: !Object,
        dur: number,
        id: number,
        s: string
    }}
 */
WebInspector.TracingManager.EventPayload;

WebInspector.TracingManager.prototype = {
    /**
     * @param {!WebInspector.Target} target
     */
    targetAdded: function(target)
    {
        if (this._target)
            return;
        this._target = target;
        target.registerTracingDispatcher(new WebInspector.TracingDispatcher(this));
    },

    /**
     * @param {!WebInspector.Target} target
     */
    targetRemoved: function(target)
    {
        if (this._target !== target)
            return;
        delete this._target;
    },

    /**
     * @return {?WebInspector.Target}
     */
    target: function()
    {
        return this._target;
    },

    /**
     * @param {number=} usage
     * @param {number=} eventCount
     * @param {number=} percentFull
     */
    _bufferUsage: function(usage, eventCount, percentFull)
    {
        this._eventBufferSize = eventCount;
        this.dispatchEventToListeners(WebInspector.TracingManager.Events.BufferUsage, usage || percentFull);
    },

    /**
     * @param {!Array.<!WebInspector.TracingManager.EventPayload>} events
     */
    _eventsCollected: function(events)
    {
        this.dispatchEventToListeners(WebInspector.TracingManager.Events.EventsCollected, events);
        this._eventsRetrieved += events.length;
        if (!this._eventBufferSize)
            return;
        if (this._eventsRetrieved > this._eventBufferSize)
            this._eventsRetrieved = this._eventBufferSize;
        this.dispatchEventToListeners(WebInspector.TracingManager.Events.RetrieveEventsProgress, this._eventsRetrieved / this._eventBufferSize);
    },

    _tracingComplete: function()
    {
        this._eventBufferSize = 0;
        this._eventsRetrieved = 0;
        this.dispatchEventToListeners(WebInspector.TracingManager.Events.TracingComplete);
    },

    /**
     * @param {string} categoryFilter
     * @param {string} options
     * @param {function(?string)=} callback
     */
    start: function(categoryFilter, options, callback)
    {
        if (this._active)
            return;
        WebInspector.targetManager.suspendAllTargets();
        var bufferUsageReportingIntervalMs = 500;
        TracingAgent.start(categoryFilter, options, bufferUsageReportingIntervalMs, callback);
        this._active = true;
        this.dispatchEventToListeners(WebInspector.TracingManager.Events.TracingStarted);
    },

    stop: function()
    {
        if (!this._active)
            return;
        TracingAgent.end(this._onStop.bind(this));
        WebInspector.targetManager.resumeAllTargets();
    },

    _onStop: function()
    {
        if (!this._active)
            return;
        this.dispatchEventToListeners(WebInspector.TracingManager.Events.TracingStopped);
        this._active = false;
    },

    __proto__: WebInspector.Object.prototype
}

/**
 * @constructor
 * @implements {TracingAgent.Dispatcher}
 * @param {!WebInspector.TracingManager} tracingManager
 */
WebInspector.TracingDispatcher = function(tracingManager)
{
    this._tracingManager = tracingManager;
}

WebInspector.TracingDispatcher.prototype = {
    /**
     * @param {number=} usage
     * @param {number=} eventCount
     * @param {number=} percentFull
     */
    bufferUsage: function(usage, eventCount, percentFull)
    {
        this._tracingManager._bufferUsage(usage, eventCount, percentFull);
    },

    /**
     * @param {!Array.<!WebInspector.TracingManager.EventPayload>} data
     */
    dataCollected: function(data)
    {
        this._tracingManager._eventsCollected(data);
    },

    tracingComplete: function()
    {
        this._tracingManager._tracingComplete();
    }
}
