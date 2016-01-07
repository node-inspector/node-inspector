/*
 * Copyright (C) 2012 Google Inc. All rights reserved.
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
 * @param {!WebInspector.TracingModel} tracingModel
 * @param {!WebInspector.TimelineModel.Filter} eventFilter
 * @extends {WebInspector.Object}
 * @implements {WebInspector.TargetManager.Observer}
 * @implements {WebInspector.TracingManagerClient}
 */
WebInspector.TimelineModel = function(tracingModel, eventFilter)
{
    WebInspector.Object.call(this);
    this._filters = [];
    this._tracingModel = tracingModel;
    this._eventFilter = eventFilter;
    this._targets = [];
    this.reset();
    WebInspector.targetManager.observeTargets(this);
}

/**
 * @enum {string}
 */
WebInspector.TimelineModel.RecordType = {
    Task: "Task",
    Program: "Program",
    EventDispatch: "EventDispatch",

    GPUTask: "GPUTask",

    Animation: "Animation",
    RequestMainThreadFrame: "RequestMainThreadFrame",
    BeginFrame: "BeginFrame",
    NeedsBeginFrameChanged: "NeedsBeginFrameChanged",
    BeginMainThreadFrame: "BeginMainThreadFrame",
    ActivateLayerTree: "ActivateLayerTree",
    DrawFrame: "DrawFrame",
    HitTest: "HitTest",
    ScheduleStyleRecalculation: "ScheduleStyleRecalculation",
    RecalculateStyles: "RecalculateStyles", // For backwards compatibility only, now replaced by UpdateLayoutTree.
    UpdateLayoutTree: "UpdateLayoutTree",
    InvalidateLayout: "InvalidateLayout",
    Layout: "Layout",
    UpdateLayer: "UpdateLayer",
    UpdateLayerTree: "UpdateLayerTree",
    PaintSetup: "PaintSetup",
    Paint: "Paint",
    PaintImage: "PaintImage",
    Rasterize: "Rasterize",
    RasterTask: "RasterTask",
    ScrollLayer: "ScrollLayer",
    CompositeLayers: "CompositeLayers",

    ScheduleStyleInvalidationTracking: "ScheduleStyleInvalidationTracking",
    StyleRecalcInvalidationTracking: "StyleRecalcInvalidationTracking",
    StyleInvalidatorInvalidationTracking: "StyleInvalidatorInvalidationTracking",
    LayoutInvalidationTracking: "LayoutInvalidationTracking",
    LayerInvalidationTracking: "LayerInvalidationTracking",
    PaintInvalidationTracking: "PaintInvalidationTracking",
    ScrollInvalidationTracking: "ScrollInvalidationTracking",

    ParseHTML: "ParseHTML",
    ParseAuthorStyleSheet: "ParseAuthorStyleSheet",

    TimerInstall: "TimerInstall",
    TimerRemove: "TimerRemove",
    TimerFire: "TimerFire",

    XHRReadyStateChange: "XHRReadyStateChange",
    XHRLoad: "XHRLoad",
    EvaluateScript: "EvaluateScript",

    CommitLoad: "CommitLoad",
    MarkLoad: "MarkLoad",
    MarkDOMContent: "MarkDOMContent",
    MarkFirstPaint: "MarkFirstPaint",

    TimeStamp: "TimeStamp",
    ConsoleTime: "ConsoleTime",

    ResourceSendRequest: "ResourceSendRequest",
    ResourceReceiveResponse: "ResourceReceiveResponse",
    ResourceReceivedData: "ResourceReceivedData",
    ResourceFinish: "ResourceFinish",

    FunctionCall: "FunctionCall",
    GCEvent: "GCEvent", // For backwards compatibility only, now replaced by MinorGC/MajorGC.
    MajorGC: "MajorGC",
    MinorGC: "MinorGC",
    JSFrame: "JSFrame",
    JSSample: "JSSample",
    // V8Sample events are coming from tracing and contain raw stacks with function addresses.
    // After being processed with help of JitCodeAdded and JitCodeMoved events they
    // get translated into function infos and stored as stacks in JSSample events.
    V8Sample: "V8Sample",
    JitCodeAdded: "JitCodeAdded",
    JitCodeMoved: "JitCodeMoved",

    UpdateCounters: "UpdateCounters",

    RequestAnimationFrame: "RequestAnimationFrame",
    CancelAnimationFrame: "CancelAnimationFrame",
    FireAnimationFrame: "FireAnimationFrame",

    WebSocketCreate : "WebSocketCreate",
    WebSocketSendHandshakeRequest : "WebSocketSendHandshakeRequest",
    WebSocketReceiveHandshakeResponse : "WebSocketReceiveHandshakeResponse",
    WebSocketDestroy : "WebSocketDestroy",

    EmbedderCallback : "EmbedderCallback",

    SetLayerTreeId: "SetLayerTreeId",
    TracingStartedInPage: "TracingStartedInPage",
    TracingSessionIdForWorker: "TracingSessionIdForWorker",

    DecodeImage: "Decode Image",
    ResizeImage: "Resize Image",
    DrawLazyPixelRef: "Draw LazyPixelRef",
    DecodeLazyPixelRef: "Decode LazyPixelRef",

    LazyPixelRef: "LazyPixelRef",
    LayerTreeHostImplSnapshot: "cc::LayerTreeHostImpl",
    PictureSnapshot: "cc::Picture",
    DisplayItemListSnapshot: "cc::DisplayItemList",

    // CpuProfile is a virtual event created on frontend to support
    // serialization of CPU Profiles within tracing timeline data.
    CpuProfile: "CpuProfile"
}

WebInspector.TimelineModel.Events = {
    RecordsCleared: "RecordsCleared",
    RecordingStarted: "RecordingStarted",
    RecordingStopped: "RecordingStopped",
    RecordFilterChanged: "RecordFilterChanged",
    BufferUsage: "BufferUsage",
    RetrieveEventsProgress: "RetrieveEventsProgress"
}

WebInspector.TimelineModel.MainThreadName = "main";
WebInspector.TimelineModel.WorkerThreadName = "DedicatedWorker Thread";
WebInspector.TimelineModel.RendererMainThreadName = "CrRendererMain";

/**
 * @param {!Array.<!WebInspector.TracingModel.Event>} events
 * @param {function(!WebInspector.TracingModel.Event)} onStartEvent
 * @param {function(!WebInspector.TracingModel.Event)} onEndEvent
 * @param {function(!WebInspector.TracingModel.Event,?WebInspector.TracingModel.Event)=} onInstantEvent
 */
WebInspector.TimelineModel.forEachEvent = function(events, onStartEvent, onEndEvent, onInstantEvent)
{
    var stack = [];
    for (var i = 0; i < events.length; ++i) {
        var e = events[i];
        if (WebInspector.TracingModel.isAsyncPhase(e.phase) || WebInspector.TracingModel.isFlowPhase(e.phase))
            continue;
        while (stack.length && stack.peekLast().endTime <= e.startTime)
            onEndEvent(stack.pop());
        if (e.duration) {
            onStartEvent(e);
            stack.push(e);
        } else {
            onInstantEvent && onInstantEvent(e, stack.peekLast() || null);
        }
    }
    while (stack.length)
        onEndEvent(stack.pop());
}

/**
 * @param {!Array.<!WebInspector.TimelineModel.Record>} recordsArray
 * @param {?function(!WebInspector.TimelineModel.Record)|?function(!WebInspector.TimelineModel.Record,number)} preOrderCallback
 * @param {function(!WebInspector.TimelineModel.Record)|function(!WebInspector.TimelineModel.Record,number)=} postOrderCallback
 * @return {boolean}
 */
WebInspector.TimelineModel.forAllRecords = function(recordsArray, preOrderCallback, postOrderCallback)
{
    /**
     * @param {!Array.<!WebInspector.TimelineModel.Record>} records
     * @param {number} depth
     * @return {boolean}
     */
    function processRecords(records, depth)
    {
        for (var i = 0; i < records.length; ++i) {
            var record = records[i];
            if (preOrderCallback && preOrderCallback(record, depth))
                return true;
            if (processRecords(record.children(), depth + 1))
                return true;
            if (postOrderCallback && postOrderCallback(record, depth))
                return true;
        }
        return false;
    }
    return processRecords(recordsArray, 0);
}

WebInspector.TimelineModel.TransferChunkLengthBytes = 5000000;

WebInspector.TimelineModel.DevToolsMetadataEvent = {
    TracingStartedInPage: "TracingStartedInPage",
    TracingSessionIdForWorker: "TracingSessionIdForWorker",
};

/**
 * @constructor
 * @param {string} name
 */
WebInspector.TimelineModel.VirtualThread = function(name)
{
    this.name = name;
    /** @type {!Array<!WebInspector.TracingModel.Event>} */
    this.events = [];
    /** @type {!Map<!WebInspector.AsyncEventGroup, !Array<!WebInspector.TracingModel.AsyncEvent>>} */
    this.asyncEventsByGroup = new Map();
}

WebInspector.TimelineModel.VirtualThread.prototype = {
    /**
     * @return {boolean}
     */
    isWorker: function()
    {
        return this.name === WebInspector.TimelineModel.WorkerThreadName;
    }
}

/**
 * @constructor
 * @param {!WebInspector.TracingModel.Event} traceEvent
 */
WebInspector.TimelineModel.Record = function(traceEvent)
{
    this._event = traceEvent;
    this._children = [];
}

/**
 * @param {!WebInspector.TimelineModel.Record} a
 * @param {!WebInspector.TimelineModel.Record} b
 * @return {number}
 */
WebInspector.TimelineModel.Record._compareStartTime = function(a, b)
{
    // Never return 0 as otherwise equal records would be merged.
    return a.startTime() <= b.startTime() ? -1 : 1;
}

WebInspector.TimelineModel.Record.prototype = {
    /**
     * @return {?WebInspector.Target}
     */
    target: function()
    {
        var threadName = this._event.thread.name();
        //FIXME: correctly specify target
        return threadName === WebInspector.TimelineModel.RendererMainThreadName ? WebInspector.targetManager.targets()[0] || null : null;
    },

    /**
     * @return {!Array.<!WebInspector.TimelineModel.Record>}
     */
    children: function()
    {
        return this._children;
    },

    /**
     * @return {number}
     */
    startTime: function()
    {
        return this._event.startTime;
    },

    /**
     * @return {number}
     */
    endTime: function()
    {
        return this._event.endTime || this._event.startTime;
    },

    /**
     * @return {string}
     */
    thread: function()
    {
        if (this._event.thread.name() === WebInspector.TimelineModel.RendererMainThreadName)
            return WebInspector.TimelineModel.MainThreadName;
        return this._event.thread.name();
    },

    /**
     * @return {!WebInspector.TimelineModel.RecordType}
     */
    type: function()
    {
        return WebInspector.TimelineModel._eventType(this._event);
    },

    /**
     * @param {string} key
     * @return {?Object}
     */
    getUserObject: function(key)
    {
        if (key === "TimelineUIUtils::preview-element")
            return this._event.previewElement;
        throw new Error("Unexpected key: " + key);
    },

    /**
     * @param {string} key
     * @param {?Object|undefined} value
     */
    setUserObject: function(key, value)
    {
        if (key !== "TimelineUIUtils::preview-element")
            throw new Error("Unexpected key: " + key);
        this._event.previewElement = /** @type {?Element} */ (value);
    },

    /**
     * @return {!WebInspector.TracingModel.Event}
     */
    traceEvent: function()
    {
        return this._event;
    },

    /**
     * @param {!WebInspector.TimelineModel.Record} child
     */
    _addChild: function(child)
    {
        this._children.push(child);
        child.parent = this;
    }
}

/** @typedef {!{page: !Array<!WebInspector.TracingModel.Event>, workers: !Array<!WebInspector.TracingModel.Event>}} */
WebInspector.TimelineModel.MetadataEvents;

/**
 * @return {!WebInspector.TimelineModel.RecordType}
 */
WebInspector.TimelineModel._eventType = function(event)
{
    if (event.hasCategory(WebInspector.TracingModel.ConsoleEventCategory))
        return WebInspector.TimelineModel.RecordType.ConsoleTime;
    return /** @type !WebInspector.TimelineModel.RecordType */ (event.name);
}

WebInspector.TimelineModel.prototype = {
    /**
     * @param {boolean} captureCauses
     * @param {boolean} enableJSSampling
     * @param {boolean} captureMemory
     * @param {boolean} capturePictures
     * @param {boolean} captureFilmStrip
     */
    startRecording: function(captureCauses, enableJSSampling, captureMemory, capturePictures, captureFilmStrip)
    {
        function disabledByDefault(category)
        {
            return "disabled-by-default-" + category;
        }
        var categoriesArray = [
            "-*",
            "devtools.timeline",
            disabledByDefault("devtools.timeline"),
            disabledByDefault("devtools.timeline.frame"),
            WebInspector.TracingModel.TopLevelEventCategory,
            WebInspector.TracingModel.ConsoleEventCategory
        ];
        if (Runtime.experiments.isEnabled("timelineFlowEvents")) {
            categoriesArray.push(disabledByDefault("toplevel.flow"),
                                 disabledByDefault("ipc.flow"));
        }
        if (Runtime.experiments.isEnabled("timelineTracingJSProfile") && enableJSSampling) {
            categoriesArray.push(disabledByDefault("v8.cpu_profile"));
            if (WebInspector.moduleSetting("highResolutionCpuProfiling").get())
                categoriesArray.push(disabledByDefault("v8.cpu_profile.hires"));
        }
        if (captureCauses || enableJSSampling)
            categoriesArray.push(disabledByDefault("devtools.timeline.stack"));
        if (captureCauses && Runtime.experiments.isEnabled("timelineInvalidationTracking"))
            categoriesArray.push(disabledByDefault("devtools.timeline.invalidationTracking"));
        if (capturePictures) {
            categoriesArray.push(disabledByDefault("devtools.timeline.layers"),
                                 disabledByDefault("devtools.timeline.picture"),
                                 disabledByDefault("blink.graphics_context_annotations"));
        }
        if (captureFilmStrip)
            categoriesArray.push(disabledByDefault("devtools.screenshot"));

        var categories = categoriesArray.join(",");
        this._startRecordingWithCategories(categories, enableJSSampling);
    },

    stopRecording: function()
    {
        WebInspector.targetManager.resumeAllTargets();
        this._allProfilesStoppedPromise = this._stopProfilingOnAllTargets();
        if (this._targets[0])
            this._targets[0].tracingManager.stop();
    },

    /**
     * @param {?function(!WebInspector.TimelineModel.Record)|?function(!WebInspector.TimelineModel.Record,number)} preOrderCallback
     * @param {function(!WebInspector.TimelineModel.Record)|function(!WebInspector.TimelineModel.Record,number)=} postOrderCallback
     */
    forAllRecords: function(preOrderCallback, postOrderCallback)
    {
        WebInspector.TimelineModel.forAllRecords(this._records, preOrderCallback, postOrderCallback);
    },

    /**
     * @param {!WebInspector.TimelineModel.Filter} filter
     */
    addFilter: function(filter)
    {
        this._filters.push(filter);
        filter.addEventListener(WebInspector.TimelineModel.Filter.Events.Changed, this._filterChanged, this);
    },

    /**
     * @param {function(!WebInspector.TimelineModel.Record)|function(!WebInspector.TimelineModel.Record,number)} callback
     */
    forAllFilteredRecords: function(callback)
    {
        /**
         * @param {!WebInspector.TimelineModel.Record} record
         * @param {number} depth
         * @this {WebInspector.TimelineModel}
         * @return {boolean}
         */
        function processRecord(record, depth)
        {
            var visible = this.isVisible(record.traceEvent());
            if (visible) {
                if (callback(record, depth))
                    return true;
            }

            for (var i = 0; i < record.children().length; ++i) {
                if (processRecord.call(this, record.children()[i], visible ? depth + 1 : depth))
                    return true;
            }
            return false;
        }

        for (var i = 0; i < this._records.length; ++i)
            processRecord.call(this, this._records[i], 0);
    },

    /**
     * @param {!WebInspector.TracingModel.Event} event
     * @return {boolean}
     */
    isVisible: function(event)
    {
        for (var i = 0; i < this._filters.length; ++i) {
            if (!this._filters[i].accept(event))
                return false;
        }
        return true;
    },

    _filterChanged: function()
    {
        this.dispatchEventToListeners(WebInspector.TimelineModel.Events.RecordFilterChanged);
    },

    /**
     * @return {!Array.<!WebInspector.TimelineModel.Record>}
     */
    records: function()
    {
        return this._records;
    },

    /**
     * @return {?string}
     */
    sessionId: function()
    {
        return this._sessionId;
    },

    /**
     * @return {?WebInspector.Target}
     */
    target: function()
    {
        // FIXME: Consider returning null for loaded traces.
        return this._targets[0];
    },

    /**
     * @param {!Array.<!WebInspector.TracingManager.EventPayload>} events
     */
    setEventsForTest: function(events)
    {
        this._startCollectingTraceEvents(false);
        this._tracingModel.addEvents(events);
        this.tracingComplete();
    },

    /**
     * @override
     * @param {!WebInspector.Target} target
     */
    targetAdded: function(target)
    {
        this._targets.push(target);
        if (this._profiling)
            this._startProfilingOnTarget(target);
    },

    /**
     * @override
     * @param {!WebInspector.Target} target
     */
    targetRemoved: function(target)
    {
        this._targets.remove(target, true);
        // FIXME: We'd like to stop profiling on the target and retrieve a profile
        // but it's too late. Backend connection is closed.
    },

    /**
     * @param {!WebInspector.Target} target
     * @return {!Promise}
     */
    _startProfilingOnTarget: function(target)
    {
        return target.profilerAgent().start();
    },

    /**
     * @return {!Promise}
     */
    _startProfilingOnAllTargets: function()
    {
        var intervalUs = WebInspector.moduleSetting("highResolutionCpuProfiling").get() ? 100 : 1000;
        this._targets[0].profilerAgent().setSamplingInterval(intervalUs);
        this._profiling = true;
        return Promise.all(this._targets.map(this._startProfilingOnTarget));
    },

    /**
     * @param {!WebInspector.Target} target
     * @return {!Promise}
     */
    _stopProfilingOnTarget: function(target)
    {
        /**
         * @param {?Protocol.Error} error
         * @param {?ProfilerAgent.CPUProfile} profile
         * @return {?ProfilerAgent.CPUProfile}
         */
        function extractProfile(error, profile)
        {
            return !error && profile ? profile : null;
        }
        return target.profilerAgent().stop(extractProfile).then(this._addCpuProfile.bind(this, target.id()));
    },

    /**
     * @return {!Promise}
     */
    _stopProfilingOnAllTargets: function()
    {
        var targets = this._profiling ? this._targets : [];
        this._profiling = false;
        return Promise.all(targets.map(this._stopProfilingOnTarget, this));
    },

    /**
     * @param {string} categories
     * @param {boolean=} enableJSSampling
     * @param {function(?string)=} callback
     */
    _startRecordingWithCategories: function(categories, enableJSSampling, callback)
    {
        if (!this._targets.length)
            return;
        WebInspector.targetManager.suspendAllTargets();
        var profilingStartedPromise = enableJSSampling && !Runtime.experiments.isEnabled("timelineTracingJSProfile") ?
            this._startProfilingOnAllTargets() : Promise.resolve();
        var samplingFrequencyHz = WebInspector.moduleSetting("highResolutionCpuProfiling").get() ? 10000 : 1000;
        var options = "sampling-frequency=" + samplingFrequencyHz;
        var mainTarget = this._targets[0];
        var tracingManager = mainTarget.tracingManager;
        mainTarget.resourceTreeModel.suspendReload();
        profilingStartedPromise.then(tracingManager.start.bind(tracingManager, this, categories, options, onTraceStarted));
        /**
         * @param {?string} error
         */
        function onTraceStarted(error)
        {
            mainTarget.resourceTreeModel.resumeReload();
            if (callback)
                callback(error);
        }
    },

    /**
     * @param {boolean} fromFile
     */
    _startCollectingTraceEvents: function(fromFile)
    {
        this._tracingModel.reset();
        this.reset();
        this.dispatchEventToListeners(WebInspector.TimelineModel.Events.RecordingStarted, { fromFile: fromFile });
    },

    /**
     * @override
     */
    tracingStarted: function()
    {
        this._startCollectingTraceEvents(false);
    },

    /**
     * @param {!Array.<!WebInspector.TracingManager.EventPayload>} events
     * @override
     */
    traceEventsCollected: function(events)
    {
        this._tracingModel.addEvents(events);
    },

    /**
     * @override
     */
    tracingComplete: function()
    {
        if (!this._allProfilesStoppedPromise) {
            this._didStopRecordingTraceEvents();
            return;
        }
        this._allProfilesStoppedPromise.then(this._didStopRecordingTraceEvents.bind(this));
        this._allProfilesStoppedPromise = null;
    },

    /**
     * @param {number} usage
     * @override
     */
    tracingBufferUsage: function(usage)
    {
        this.dispatchEventToListeners(WebInspector.TimelineModel.Events.BufferUsage, usage);
    },

    /**
     * @param {number} progress
     * @override
     */
    eventsRetrievalProgress: function(progress)
    {
        this.dispatchEventToListeners(WebInspector.TimelineModel.Events.RetrieveEventsProgress, progress);
    },

    /**
     * @param {number} targetId
     * @param {?ProfilerAgent.CPUProfile} cpuProfile
     */
    _addCpuProfile: function(targetId, cpuProfile)
    {
        if (!cpuProfile)
            return;
        if (!this._cpuProfiles)
            this._cpuProfiles = new Map();
        this._cpuProfiles.set(targetId, cpuProfile);
    },

    _didStopRecordingTraceEvents: function()
    {
        var metadataEvents = this._processMetadataEvents();
        this._injectCpuProfileEvents(metadataEvents);
        this._tracingModel.tracingComplete();

        this._resetProcessingState();
        var startTime = 0;
        for (var i = 0, length = metadataEvents.page.length; i < length; i++) {
            var metaEvent = metadataEvents.page[i];
            var process = metaEvent.thread.process();
            var endTime = i + 1 < length ? metadataEvents.page[i + 1].startTime : Infinity;
            this._currentPage = metaEvent.args["data"] && metaEvent.args["data"]["page"];
            for (var thread of process.sortedThreads()) {
                if (thread.name() === WebInspector.TimelineModel.WorkerThreadName && !metadataEvents.workers.some(function(e) { return e.args["data"]["workerThreadId"] === thread.id(); }))
                    continue;
                this._processThreadEvents(startTime, endTime, metaEvent.thread, thread);
            }
            startTime = endTime;
        }
        this._inspectedTargetEvents.sort(WebInspector.TracingModel.Event.compareStartTime);

        this._cpuProfiles = null;
        this._buildTimelineRecords();
        this._buildGPUTasks();
        this._insertFirstPaintEvent();
        this._resetProcessingState();

        this.dispatchEventToListeners(WebInspector.TimelineModel.Events.RecordingStopped);
    },

    /**
     * @return {!WebInspector.TimelineModel.MetadataEvents}
     */
    _processMetadataEvents: function()
    {
        var metadataEvents = this._tracingModel.devToolsMetadataEvents();

        var pageDevToolsMetadataEvents = [];
        var workersDevToolsMetadataEvents = [];
        for (var event of metadataEvents) {
            if (event.name === WebInspector.TimelineModel.DevToolsMetadataEvent.TracingStartedInPage)
                pageDevToolsMetadataEvents.push(event);
            else if (event.name === WebInspector.TimelineModel.DevToolsMetadataEvent.TracingSessionIdForWorker)
                workersDevToolsMetadataEvents.push(event);
        }
        if (!pageDevToolsMetadataEvents.length) {
            // The trace is probably coming not from DevTools. Make a mock Metadata event.
            var pageMetaEvent = this._loadedFromFile ? this._makeMockPageMetadataEvent() : null;
            if (!pageMetaEvent) {
                console.error(WebInspector.TimelineModel.DevToolsMetadataEvent.TracingStartedInPage + " event not found.");
                return {page: [], workers: []};
            }
            pageDevToolsMetadataEvents.push(pageMetaEvent);
        }
        var sessionId = pageDevToolsMetadataEvents[0].args["sessionId"] || pageDevToolsMetadataEvents[0].args["data"]["sessionId"];
        this._sessionId = sessionId;

        var mismatchingIds = new Set();
        /**
         * @param {!WebInspector.TracingModel.Event} event
         * @return {boolean}
         */
        function checkSessionId(event)
        {
            var args = event.args;
            // FIXME: put sessionId into args["data"] for TracingStartedInPage event.
            if (args["data"])
                args = args["data"];
            var id = args["sessionId"];
            if (id === sessionId)
                return true;
            mismatchingIds.add(id);
            return false;
        }
        var result = {
            page: pageDevToolsMetadataEvents.filter(checkSessionId).sort(WebInspector.TracingModel.Event.compareStartTime),
            workers: workersDevToolsMetadataEvents.filter(checkSessionId).sort(WebInspector.TracingModel.Event.compareStartTime)
        };
        if (mismatchingIds.size)
            WebInspector.console.error("Timeline recording was started in more than one page simultaneously. Session id mismatch: " + this._sessionId + " and " + mismatchingIds.valuesArray() + ".");
        return result;
    },

    /**
     * @return {?WebInspector.TracingModel.Event}
     */
    _makeMockPageMetadataEvent: function()
    {
        var rendererMainThreadName = WebInspector.TimelineModel.RendererMainThreadName;
        // FIXME: pick up the first renderer process for now.
        var process = Object.values(this._tracingModel.sortedProcesses()).filter(function(p) { return p.threadByName(rendererMainThreadName); })[0];
        var thread = process && process.threadByName(rendererMainThreadName);
        if (!thread)
            return null;
        var pageMetaEvent = new WebInspector.TracingModel.Event(
            WebInspector.TracingModel.DevToolsMetadataEventCategory,
            WebInspector.TimelineModel.DevToolsMetadataEvent.TracingStartedInPage,
            WebInspector.TracingModel.Phase.Metadata,
            this._tracingModel.minimumRecordTime(), thread);
        pageMetaEvent.addArgs({"data": {"sessionId": "mockSessionId"}});
        return pageMetaEvent;
    },

    /**
     * @param {number} pid
     * @param {number} tid
     * @param {?ProfilerAgent.CPUProfile} cpuProfile
     */
    _injectCpuProfileEvent: function(pid, tid, cpuProfile)
    {
        if (!cpuProfile)
            return;
        var cpuProfileEvent = /** @type {!WebInspector.TracingManager.EventPayload} */ ({
            cat: WebInspector.TracingModel.DevToolsMetadataEventCategory,
            ph: WebInspector.TracingModel.Phase.Instant,
            ts: this._tracingModel.maximumRecordTime() * 1000,
            pid: pid,
            tid: tid,
            name: WebInspector.TimelineModel.RecordType.CpuProfile,
            args: { data: { cpuProfile: cpuProfile } }
        });
        this._tracingModel.addEvents([cpuProfileEvent]);
    },

    /**
     * @param {!WebInspector.TimelineModel.MetadataEvents} metadataEvents
     */
    _injectCpuProfileEvents: function(metadataEvents)
    {
        if (!this._cpuProfiles)
            return;
        var mainMetaEvent = metadataEvents.page.peekLast();
        if (!mainMetaEvent)
            return;
        var pid = mainMetaEvent.thread.process().id();
        var mainTarget = this._targets[0];
        var mainCpuProfile = this._cpuProfiles.get(mainTarget.id());
        this._injectCpuProfileEvent(pid, mainMetaEvent.thread.id(), mainCpuProfile);
        for (var metaEvent of metadataEvents.workers) {
            var workerId = metaEvent.args["data"]["workerId"];
            var target = mainTarget.workerManager ? mainTarget.workerManager.targetByWorkerId(workerId) : null;
            if (!target)
                continue;
            var cpuProfile = this._cpuProfiles.get(target.id());
            this._injectCpuProfileEvent(pid, metaEvent.args["data"]["workerThreadId"], cpuProfile);
        }
        this._cpuProfiles = null;
    },

    _insertFirstPaintEvent: function()
    {
        if (!this._firstCompositeLayers)
            return;

        // First Paint is actually a DrawFrame that happened after first CompositeLayers following last CommitLoadEvent.
        var recordTypes = WebInspector.TimelineModel.RecordType;
        var i = insertionIndexForObjectInListSortedByFunction(this._firstCompositeLayers, this._inspectedTargetEvents, WebInspector.TracingModel.Event.compareStartTime);
        for (; i < this._inspectedTargetEvents.length && this._inspectedTargetEvents[i].name !== recordTypes.DrawFrame; ++i) { }
        if (i >= this._inspectedTargetEvents.length)
            return;
        var drawFrameEvent = this._inspectedTargetEvents[i];
        var firstPaintEvent = new WebInspector.TracingModel.Event(drawFrameEvent.categoriesString, recordTypes.MarkFirstPaint, WebInspector.TracingModel.Phase.Instant, drawFrameEvent.startTime, drawFrameEvent.thread);
        this._mainThreadEvents.splice(insertionIndexForObjectInListSortedByFunction(firstPaintEvent, this._mainThreadEvents, WebInspector.TracingModel.Event.compareStartTime), 0, firstPaintEvent);
        var firstPaintRecord = new WebInspector.TimelineModel.Record(firstPaintEvent);
        this._eventDividerRecords.splice(insertionIndexForObjectInListSortedByFunction(firstPaintRecord, this._eventDividerRecords, WebInspector.TimelineModel.Record._compareStartTime), 0, firstPaintRecord);
    },

    _buildTimelineRecords: function()
    {
        var topLevelRecords = this._buildTimelineRecordsForThread(this.mainThreadEvents());
        for (var i = 0; i < topLevelRecords.length; i++) {
            var record = topLevelRecords[i];
            if (WebInspector.TracingModel.isTopLevelEvent(record.traceEvent()))
                this._mainThreadTasks.push(record);
        }

        /**
         * @param {!WebInspector.TimelineModel.VirtualThread} virtualThread
         * @this {!WebInspector.TimelineModel}
         */
        function processVirtualThreadEvents(virtualThread)
        {
            var threadRecords = this._buildTimelineRecordsForThread(virtualThread.events);
            topLevelRecords = topLevelRecords.mergeOrdered(threadRecords, WebInspector.TimelineModel.Record._compareStartTime);
        }
        this.virtualThreads().forEach(processVirtualThreadEvents.bind(this));
        this._records = topLevelRecords;
    },

    _buildGPUTasks: function()
    {
        var gpuProcess = this._tracingModel.processByName("GPU Process");
        if (!gpuProcess)
            return;
        var mainThread = gpuProcess.threadByName("CrGpuMain");
        if (!mainThread)
            return;
        var events = mainThread.events();
        var recordTypes = WebInspector.TimelineModel.RecordType;
        for (var i = 0; i < events.length; ++i) {
            if (events[i].name === recordTypes.GPUTask)
                this._gpuTasks.push(new WebInspector.TimelineModel.Record(events[i]));
        }
    },

    /**
     * @param {!Array.<!WebInspector.TracingModel.Event>} threadEvents
     * @return {!Array.<!WebInspector.TimelineModel.Record>}
     */
    _buildTimelineRecordsForThread: function(threadEvents)
    {
        var recordStack = [];
        var topLevelRecords = [];

        for (var i = 0, size = threadEvents.length; i < size; ++i) {
            var event = threadEvents[i];
            for (var top = recordStack.peekLast(); top && top._event.endTime <= event.startTime; top = recordStack.peekLast())
                recordStack.pop();
            if (event.phase === WebInspector.TracingModel.Phase.AsyncEnd || event.phase === WebInspector.TracingModel.Phase.NestableAsyncEnd)
                continue;
            var parentRecord = recordStack.peekLast();
            // Maintain the back-end logic of old timeline, skip console.time() / console.timeEnd() that are not properly nested.
            if (WebInspector.TracingModel.isAsyncBeginPhase(event.phase) && parentRecord && event.endTime > parentRecord._event.endTime)
                continue;
            var record = new WebInspector.TimelineModel.Record(event);
            if (WebInspector.TimelineUIUtils.isMarkerEvent(event))
                this._eventDividerRecords.push(record);
            if (!this._eventFilter.accept(event) && !WebInspector.TracingModel.isTopLevelEvent(event))
                continue;
            if (parentRecord)
                parentRecord._addChild(record);
            else
                topLevelRecords.push(record);
            if (event.endTime)
                recordStack.push(record);
        }

        return topLevelRecords;
    },

    _resetProcessingState: function()
    {
        this._asyncEventTracker = new WebInspector.TimelineAsyncEventTracker();
        this._invalidationTracker = new WebInspector.InvalidationTracker();
        this._layoutInvalidate = {};
        this._lastScheduleStyleRecalculation = {};
        this._paintImageEventByPixelRefId = {};
        this._lastPaintForLayer = {};
        this._lastRecalculateStylesEvent = null;
        this._currentScriptEvent = null;
        this._eventStack = [];
        this._hadCommitLoad = false;
        this._firstCompositeLayers = null;
        this._currentPage = null;
    },

    /**
     * @param {number} startTime
     * @param {?number} endTime
     * @param {!WebInspector.TracingModel.Thread} mainThread
     * @param {!WebInspector.TracingModel.Thread} thread
     */
    _processThreadEvents: function(startTime, endTime, mainThread, thread)
    {
        var events = thread.events();
        var asyncEvents = thread.asyncEvents();

        var jsSamples;
        if (Runtime.experiments.isEnabled("timelineTracingJSProfile")) {
            jsSamples = WebInspector.TimelineJSProfileProcessor.processRawV8Samples(events);
        } else {
            var cpuProfileEvent = events.peekLast();
            if (cpuProfileEvent && cpuProfileEvent.name === WebInspector.TimelineModel.RecordType.CpuProfile) {
                var cpuProfile = cpuProfileEvent.args["data"]["cpuProfile"];
                if (cpuProfile)
                    jsSamples = WebInspector.TimelineJSProfileProcessor.generateTracingEventsFromCpuProfile(cpuProfile, thread);
            }
        }

        if (jsSamples) {
            events = events.mergeOrdered(jsSamples, WebInspector.TracingModel.Event.orderedCompareStartTime);
            var jsFrameEvents = WebInspector.TimelineJSProfileProcessor.generateJSFrameEvents(events);
            events = jsFrameEvents.mergeOrdered(events, WebInspector.TracingModel.Event.orderedCompareStartTime);
        }

        var threadEvents;
        var threadAsyncEventsByGroup;
        if (thread === mainThread) {
            threadEvents = this._mainThreadEvents;
            threadAsyncEventsByGroup = this._mainThreadAsyncEventsByGroup;
        } else {
            var virtualThread = new WebInspector.TimelineModel.VirtualThread(thread.name());
            this._virtualThreads.push(virtualThread);
            threadEvents = virtualThread.events;
            threadAsyncEventsByGroup = virtualThread.asyncEventsByGroup;
        }

        this._eventStack = [];
        var i = events.lowerBound(startTime, function (time, event) { return time - event.startTime });
        var length = events.length;
        for (; i < length; i++) {
            var event = events[i];
            if (endTime && event.startTime >= endTime)
                break;
            if (!this._processEvent(event))
                continue;
            threadEvents.push(event);
            this._inspectedTargetEvents.push(event);
        }
        i = asyncEvents.lowerBound(startTime, function (time, asyncEvent) { return time - asyncEvent.startTime });
        for (; i < asyncEvents.length; ++i) {
            var asyncEvent = asyncEvents[i];
            if (endTime && asyncEvent.startTime >= endTime)
                break;
            var asyncGroup = this._processAsyncEvent(asyncEvent);
            if (!asyncGroup)
                continue;
            var groupAsyncEvents = threadAsyncEventsByGroup.get(asyncGroup);
            if (!groupAsyncEvents) {
                groupAsyncEvents = [];
                threadAsyncEventsByGroup.set(asyncGroup, groupAsyncEvents);
            }
            groupAsyncEvents.push(asyncEvent);
        }
    },

    /**
     * @param {!WebInspector.TracingModel.Event} event
     * @return {boolean}
     */
    _processEvent: function(event)
    {
        var eventStack = this._eventStack;
        while (eventStack.length && eventStack.peekLast().endTime <= event.startTime)
            eventStack.pop();

        var recordTypes = WebInspector.TimelineModel.RecordType;

        if (this._currentScriptEvent && event.startTime > this._currentScriptEvent.endTime)
            this._currentScriptEvent = null;

        var eventData = event.args["data"] || event.args["beginData"] || {};
        if (eventData && eventData["stackTrace"])
            event.stackTrace = eventData["stackTrace"];

        if (eventStack.length && eventStack.peekLast().name === recordTypes.EventDispatch)
            eventStack.peekLast().hasChildren = true;
        this._asyncEventTracker.processEvent(event);
        if (event.initiator && event.initiator.url)
            event.url = event.initiator.url;
        switch (event.name) {
        case recordTypes.ScheduleStyleRecalculation:
            this._lastScheduleStyleRecalculation[event.args["data"]["frame"]] = event;
            break;

        case recordTypes.UpdateLayoutTree:
        case recordTypes.RecalculateStyles:
            this._invalidationTracker.didRecalcStyle(event);
            if (event.args["beginData"])
                event.initiator = this._lastScheduleStyleRecalculation[event.args["beginData"]["frame"]];
            this._lastRecalculateStylesEvent = event;
            break;

        case recordTypes.ScheduleStyleInvalidationTracking:
        case recordTypes.StyleRecalcInvalidationTracking:
        case recordTypes.StyleInvalidatorInvalidationTracking:
        case recordTypes.LayoutInvalidationTracking:
        case recordTypes.LayerInvalidationTracking:
        case recordTypes.PaintInvalidationTracking:
        case recordTypes.ScrollInvalidationTracking:
            this._invalidationTracker.addInvalidation(new WebInspector.InvalidationTrackingEvent(event));
            break;

        case recordTypes.InvalidateLayout:
            // Consider style recalculation as a reason for layout invalidation,
            // but only if we had no earlier layout invalidation records.
            var layoutInitator = event;
            var frameId = event.args["data"]["frame"];
            if (!this._layoutInvalidate[frameId] && this._lastRecalculateStylesEvent && this._lastRecalculateStylesEvent.endTime >  event.startTime)
                layoutInitator = this._lastRecalculateStylesEvent.initiator;
            this._layoutInvalidate[frameId] = layoutInitator;
            break;

        case recordTypes.Layout:
            this._invalidationTracker.didLayout(event);
            var frameId = event.args["beginData"]["frame"];
            event.initiator = this._layoutInvalidate[frameId];
            // In case we have no closing Layout event, endData is not available.
            if (event.args["endData"]) {
                event.backendNodeId = event.args["endData"]["rootNode"];
                event.highlightQuad =  event.args["endData"]["root"];
            }
            this._layoutInvalidate[frameId] = null;
            if (this._currentScriptEvent)
                event.warning = WebInspector.UIString("Forced synchronous layout is a possible performance bottleneck.");
            break;

        case recordTypes.EvaluateScript:
        case recordTypes.FunctionCall:
            if (!this._currentScriptEvent)
                this._currentScriptEvent = event;
            break;

        case recordTypes.SetLayerTreeId:
            this._inspectedTargetLayerTreeId = event.args["layerTreeId"] || event.args["data"]["layerTreeId"];
            break;

        case recordTypes.Paint:
            this._invalidationTracker.didPaint(event);
            event.highlightQuad = event.args["data"]["clip"];
            event.backendNodeId = event.args["data"]["nodeId"];
            var layerUpdateEvent = this._findAncestorEvent(recordTypes.UpdateLayer);
            if (!layerUpdateEvent || layerUpdateEvent.args["layerTreeId"] !== this._inspectedTargetLayerTreeId)
                break;
            // Only keep layer paint events, skip paints for subframes that get painted to the same layer as parent.
            if (!event.args["data"]["layerId"])
                break;
            this._lastPaintForLayer[layerUpdateEvent.args["layerId"]] = event;
            break;

        case recordTypes.DisplayItemListSnapshot:
        case recordTypes.PictureSnapshot:
            var layerUpdateEvent = this._findAncestorEvent(recordTypes.UpdateLayer);
            if (!layerUpdateEvent || layerUpdateEvent.args["layerTreeId"] !== this._inspectedTargetLayerTreeId)
                break;
            var paintEvent = this._lastPaintForLayer[layerUpdateEvent.args["layerId"]];
            if (paintEvent)
                paintEvent.picture = event;
            break;

        case recordTypes.ScrollLayer:
            event.backendNodeId = event.args["data"]["nodeId"];
            break;

        case recordTypes.PaintImage:
            event.backendNodeId = event.args["data"]["nodeId"];
            event.url = event.args["data"]["url"];
            break;

        case recordTypes.DecodeImage:
        case recordTypes.ResizeImage:
            var paintImageEvent = this._findAncestorEvent(recordTypes.PaintImage);
            if (!paintImageEvent) {
                var decodeLazyPixelRefEvent = this._findAncestorEvent(recordTypes.DecodeLazyPixelRef);
                paintImageEvent = decodeLazyPixelRefEvent && this._paintImageEventByPixelRefId[decodeLazyPixelRefEvent.args["LazyPixelRef"]];
            }
            if (!paintImageEvent)
                break;
            event.backendNodeId = paintImageEvent.backendNodeId;
            event.url = paintImageEvent.url;
            break;

        case recordTypes.DrawLazyPixelRef:
            var paintImageEvent = this._findAncestorEvent(recordTypes.PaintImage);
            if (!paintImageEvent)
                break;
            this._paintImageEventByPixelRefId[event.args["LazyPixelRef"]] = paintImageEvent;
            event.backendNodeId = paintImageEvent.backendNodeId;
            event.url = paintImageEvent.url;
            break;

        case recordTypes.MarkDOMContent:
        case recordTypes.MarkLoad:
            var page = eventData["page"];
            if (page && page !== this._currentPage)
                return false;
            break;

        case recordTypes.CommitLoad:
            var page = eventData["page"];
            if (page && page !== this._currentPage)
                return false;
            if (!eventData["isMainFrame"])
                break;
            this._hadCommitLoad = true;
            this._firstCompositeLayers = null;
            break;

        case recordTypes.CompositeLayers:
            if (!this._firstCompositeLayers && this._hadCommitLoad)
                this._firstCompositeLayers = event;
            break;

        case recordTypes.Animation:
            // FIXME: bring back Animation events as we figure out a way to show them while not cluttering the UI.
            return false;
        }
        if (WebInspector.TracingModel.isAsyncPhase(event.phase))
            return true;
        var duration = event.duration;
        if (!duration)
            return true;
        if (eventStack.length) {
            var parent = eventStack.peekLast();
            parent.selfTime -= duration;
            if (parent.selfTime < 0) {
                var epsilon = 1e-3;
                if (parent.selfTime < -epsilon)
                    console.error("Children are longer than parent at " + event.startTime + " (" + (event.startTime - this.minimumRecordTime()).toFixed(3) + ") by " + parent.selfTime.toFixed(3));
                parent.selfTime = 0;
            }
        }
        event.selfTime = duration;
        eventStack.push(event);
        return true;
    },

    /**
     * @param {!WebInspector.TracingModel.AsyncEvent} asyncEvent
     * @return {?WebInspector.AsyncEventGroup}
     */
    _processAsyncEvent: function(asyncEvent)
    {
        var groups = WebInspector.TimelineUIUtils.asyncEventGroups();
        if (asyncEvent.hasCategory(WebInspector.TracingModel.ConsoleEventCategory))
            return groups.console;

        return null;
    },

    /**
     * @param {string} name
     * @return {?WebInspector.TracingModel.Event}
     */
    _findAncestorEvent: function(name)
    {
        for (var i = this._eventStack.length - 1; i >= 0; --i) {
            var event = this._eventStack[i];
            if (event.name === name)
                return event;
        }
        return null;
    },

    /**
     * @param {!Blob} file
     * @param {!WebInspector.Progress} progress
     */
    loadFromFile: function(file, progress)
    {
        var delegate = new WebInspector.TimelineModelLoadFromFileDelegate(this, progress);
        var fileReader = this._createFileReader(file, delegate);
        var loader = new WebInspector.TracingModelLoader(this, new WebInspector.ProgressProxy(null), fileReader.cancel.bind(fileReader));
        fileReader.start(loader);
    },

    /**
     * @param {string} url
     * @param {!WebInspector.Progress} progress
     */
    loadFromURL: function(url, progress)
    {
        var stream = new WebInspector.TracingModelLoader(this, progress);
        WebInspector.ResourceLoader.loadAsStream(url, null, stream);
    },

    _createFileReader: function(file, delegate)
    {
        return new WebInspector.ChunkedFileReader(file, WebInspector.TimelineModel.TransferChunkLengthBytes, delegate);
    },

    reset: function()
    {
        this._virtualThreads = [];
        /** @type {!Array.<!WebInspector.TracingModel.Event>} */
        this._mainThreadEvents = [];
        /** @type {!Map<!WebInspector.AsyncEventGroup, !Array<!WebInspector.TracingModel.AsyncEvent>>} */
        this._mainThreadAsyncEventsByGroup = new Map();
        /** @type {!Array.<!WebInspector.TracingModel.Event>} */
        this._inspectedTargetEvents = [];
        /** @type {!Array.<!WebInspector.TimelineModel.Record>} */
        this._records = [];
        /** @type {!Array.<!WebInspector.TimelineModel.Record>} */
        this._mainThreadTasks = [];
        /** @type {!Array.<!WebInspector.TimelineModel.Record>} */
        this._gpuTasks = [];
        /** @type {!Array.<!WebInspector.TimelineModel.Record>} */
        this._eventDividerRecords = [];
        /** @type {?string} */
        this._sessionId = null;
        this._loadedFromFile = false;
        this.dispatchEventToListeners(WebInspector.TimelineModel.Events.RecordsCleared);
    },

    /**
     * @return {number}
     */
    minimumRecordTime: function()
    {
        return this._tracingModel.minimumRecordTime();
    },

    /**
     * @return {number}
     */
    maximumRecordTime: function()
    {
        return this._tracingModel.maximumRecordTime();
    },

    /**
     * @return {!Array.<!WebInspector.TracingModel.Event>}
     */
    inspectedTargetEvents: function()
    {
        return this._inspectedTargetEvents;
    },

    /**
     * @return {!Array.<!WebInspector.TracingModel.Event>}
     */
    mainThreadEvents: function()
    {
        return this._mainThreadEvents;
    },

    /**
     * @param {!Array.<!WebInspector.TracingModel.Event>} events
     */
    _setMainThreadEvents: function(events)
    {
        this._mainThreadEvents = events;
    },

    /**
     * @return {!Map<!WebInspector.AsyncEventGroup, !Array.<!WebInspector.TracingModel.AsyncEvent>>}
     */
    mainThreadAsyncEvents: function()
    {
        return this._mainThreadAsyncEventsByGroup;
    },

    /**
     * @return {!Array.<!WebInspector.TimelineModel.VirtualThread>}
     */
    virtualThreads: function()
    {
        return this._virtualThreads;
    },

    /**
     * @return {boolean}
     */
    isEmpty: function()
    {
        return this.minimumRecordTime() === 0 && this.maximumRecordTime() === 0;
    },

    /**
     * @return {!Array.<!WebInspector.TimelineModel.Record>}
     */
    mainThreadTasks: function()
    {
        return this._mainThreadTasks;
    },

    /**
     * @return {!Array.<!WebInspector.TimelineModel.Record>}
     */
    gpuTasks: function()
    {
        return this._gpuTasks;
    },

    /**
     * @return {!Array.<!WebInspector.TimelineModel.Record>}
     */
    eventDividerRecords: function()
    {
        return this._eventDividerRecords;
    },

    /**
     * @return {!Array<!WebInspector.TimelineModel.NetworkRequest>}
     */
    networkRequests: function()
    {
        /** @type {!Map<string,!WebInspector.TimelineModel.NetworkRequest>} */
        var requests = new Map();
        /** @type {!Array<!WebInspector.TimelineModel.NetworkRequest>} */
        var requestsList = [];
        /** @type {!Array<!WebInspector.TimelineModel.NetworkRequest>} */
        var zeroStartRequestsList = [];
        var types = WebInspector.TimelineModel.RecordType;
        var resourceTypes = new Set([
            types.ResourceSendRequest,
            types.ResourceReceiveResponse,
            types.ResourceReceivedData,
            types.ResourceFinish
        ]);
        var events = this.mainThreadEvents();
        for (var i = 0; i < events.length; ++i) {
            var e = events[i];
            if (!resourceTypes.has(e.name))
                continue;
            var id = e.args["data"]["requestId"];
            var request = requests.get(id);
            if (request) {
                request.addEvent(e);
            } else {
                request = new WebInspector.TimelineModel.NetworkRequest(e);
                requests.set(id, request);
                if (request.startTime)
                    requestsList.push(request);
                else
                    zeroStartRequestsList.push(request);
            }
        }
        return zeroStartRequestsList.concat(requestsList);
    },

    __proto__: WebInspector.Object.prototype
}

/**
 * @constructor
 */
WebInspector.TimelineModel.ProfileTreeNode = function()
{
    /** @type {number} */
    this.totalTime;
    /** @type {number} */
    this.selfTime;
    /** @type {string} */
    this.name;
    /** @type {string} */
    this.color;
    /** @type {string} */
    this.id;
    /** @type {!WebInspector.TracingModel.Event} */
    this.event;
    /** @type {?Map<string,!WebInspector.TimelineModel.ProfileTreeNode>} */
    this.children;
    /** @type {?WebInspector.TimelineModel.ProfileTreeNode} */
    this.parent;
}

/**
 * @param {!Array<!WebInspector.TracingModel.Event>} events
 * @param {number} startTime
 * @param {number} endTime
 * @param {!Array<!WebInspector.TimelineModel.Filter>} filters
 * @param {function(!WebInspector.TracingModel.Event):string} eventIdCallback
 * @return {!WebInspector.TimelineModel.ProfileTreeNode}
 */
WebInspector.TimelineModel.buildTopDownTree = function(events, startTime, endTime, filters, eventIdCallback)
{
    // Temporarily deposit a big enough value that exceeds the max recording time.
    var /** @const */ initialTime = 1e7;
    var root = new WebInspector.TimelineModel.ProfileTreeNode();
    root.totalTime = initialTime;
    root.selfTime = initialTime;
    root.name = WebInspector.UIString("Top-Down Chart");
    var parent = root;

    /**
     * @param {!WebInspector.TracingModel.Event} e
     * @return {boolean}
     */
    function filter(e)
    {
        if (!e.endTime && e.phase !== WebInspector.TracingModel.Phase.Instant)
            return false;
        if (e.endTime <= startTime || e.startTime >= endTime)
            return false;
        if (WebInspector.TracingModel.isAsyncPhase(e.phase))
            return false;
        for (var i = 0, l = filters.length; i < l; ++i) {
            if (!filters[i].accept(e))
                return false;
        }
        return true;
    }

    /**
     * @param {!WebInspector.TracingModel.Event} e
     */
    function onStartEvent(e)
    {
        if (!filter(e))
            return;
        var time = Math.min(endTime, e.endTime) - Math.max(startTime, e.startTime);
        var id = eventIdCallback(e);
        if (!parent.children)
            parent.children = /** @type {!Map<string,!WebInspector.TimelineModel.ProfileTreeNode>} */ (new Map());
        var node = parent.children.get(id);
        if (node) {
            node.selfTime += time;
            node.totalTime += time;
        } else {
            node = new WebInspector.TimelineModel.ProfileTreeNode();
            node.totalTime = time;
            node.selfTime = time;
            node.parent = parent;
            node.id = id;
            node.event = e;
            parent.children.set(id, node);
        }
        parent.selfTime -= time;
        if (parent.selfTime < 0) {
            console.log("Error: Negative self of " + parent.selfTime, e);
            parent.selfTime = 0;
        }
        parent = node;
    }

    /**
     * @param {!WebInspector.TracingModel.Event} e
     */
    function onEndEvent(e)
    {
        if (!filter(e))
            return;
        parent = parent.parent;
    }

    WebInspector.TimelineModel.forEachEvent(events, onStartEvent, onEndEvent);
    root.totalTime -= root.selfTime;
    root.selfTime = 0;
    return root;
}

/**
 * @param {!WebInspector.TimelineModel.ProfileTreeNode} topDownTree
 * @param {?function(!WebInspector.TimelineModel.ProfileTreeNode):!WebInspector.TimelineModel.ProfileTreeNode=} groupingCallback
 * @return {!WebInspector.TimelineModel.ProfileTreeNode}
 */
WebInspector.TimelineModel.buildBottomUpTree = function(topDownTree, groupingCallback)
{
    var buRoot = new WebInspector.TimelineModel.ProfileTreeNode();
    buRoot.selfTime = 0;
    buRoot.totalTime = 0;
    buRoot.name = WebInspector.UIString("Bottom-Up Chart");
    /** @type {!Map<string,!WebInspector.TimelineModel.ProfileTreeNode>} */
    buRoot.children = new Map();
    var nodesOnStack = /** @type {!Set<string>} */ (new Set());
    if (topDownTree.children)
        topDownTree.children.forEach(processNode);

    /**
     * @param {!WebInspector.TimelineModel.ProfileTreeNode} tdNode
     */
    function processNode(tdNode)
    {
        var buParent = groupingCallback && groupingCallback(tdNode) || buRoot;
        appendNode(tdNode, buParent);
        var hadNode = nodesOnStack.has(tdNode.id);
        if (!hadNode)
            nodesOnStack.add(tdNode.id);
        if (tdNode.children)
            tdNode.children.forEach(processNode);
        if (!hadNode)
            nodesOnStack.delete(tdNode.id);
    }

    /**
     * @param {!WebInspector.TimelineModel.ProfileTreeNode} tdNode
     * @param {!WebInspector.TimelineModel.ProfileTreeNode} buParent
     */
    function appendNode(tdNode, buParent)
    {
        var selfTime = tdNode.selfTime;
        var totalTime = tdNode.totalTime;
        buParent.selfTime += selfTime;
        buParent.totalTime += selfTime;
        while (tdNode.parent) {
            if (!buParent.children)
                buParent.children = /** @type {!Map<string,!WebInspector.TimelineModel.ProfileTreeNode>} */ (new Map());
            var id = tdNode.id;
            var buNode = buParent.children.get(id);
            if (!buNode) {
                buNode = new WebInspector.TimelineModel.ProfileTreeNode();
                buNode.selfTime = selfTime;
                buNode.totalTime = totalTime;
                buNode.name = tdNode.name;
                buNode.event = tdNode.event;
                buNode.id = id;
                buParent.children.set(id, buNode);
            } else {
                buNode.selfTime += selfTime;
                if (!nodesOnStack.has(id))
                    buNode.totalTime += totalTime;
            }
            tdNode = tdNode.parent;
            buParent = buNode;
        }
    }

    // Purge zero self time nodes.
    var rootChildren = buRoot.children;
    for (var item of rootChildren.entries()) {
        if (item[1].selfTime === 0)
            rootChildren.delete(item[0]);
    }

    return buRoot;
}

/**
 * @constructor
 * @param {!WebInspector.TracingModel.Event} event
 */
WebInspector.TimelineModel.NetworkRequest = function(event)
{
    this.startTime = event.name === WebInspector.TimelineModel.RecordType.ResourceSendRequest ? event.startTime : 0;
    this.endTime = Infinity;
    this.addEvent(event);
}

WebInspector.TimelineModel.NetworkRequest.prototype = {
    /**
     * @param {!WebInspector.TracingModel.Event} event
     */
    addEvent: function(event)
    {
        var recordType = WebInspector.TimelineModel.RecordType;
        this.startTime = Math.min(this.startTime, event.startTime);
        var eventData = event.args["data"];
        if (eventData["mimeType"])
            this.mimeType = eventData["mimeType"];
        if (event.name === recordType.ResourceFinish)
            this.endTime = event.startTime;
        if (!this.responseTime && (event.name === recordType.ResourceReceiveResponse || event.name === recordType.ResourceReceivedData))
            this.responseTime = event.startTime;
        if (!this.url)
            this.url = eventData["url"];
        if (!this.requestMethod)
            this.requestMethod = eventData["requestMethod"];
    }
}

/**
 * @constructor
 * @extends {WebInspector.Object}
 */
WebInspector.TimelineModel.Filter = function()
{
    WebInspector.Object.call(this);
}

WebInspector.TimelineModel.Filter.Events = {
    Changed: "Changed"
}

WebInspector.TimelineModel.Filter.prototype = {
    /**
     * @param {!WebInspector.TracingModel.Event} event
     * @return {boolean}
     */
    accept: function(event)
    {
        return true;
    },

    notifyFilterChanged: function()
    {
        this.dispatchEventToListeners(WebInspector.TimelineModel.Filter.Events.Changed, this);
    },

    __proto__: WebInspector.Object.prototype
}

/**
 * @constructor
 * @extends {WebInspector.TimelineModel.Filter}
 * @param {!Array.<string>} visibleTypes
 */
WebInspector.TimelineVisibleEventsFilter = function(visibleTypes)
{
    WebInspector.TimelineModel.Filter.call(this);
    this._visibleTypes = new Set(visibleTypes);
}

WebInspector.TimelineVisibleEventsFilter.prototype = {
    /**
     * @override
     * @param {!WebInspector.TracingModel.Event} event
     * @return {boolean}
     */
    accept: function(event)
    {
        return this._visibleTypes.has(WebInspector.TimelineModel._eventType(event));
    },

    __proto__: WebInspector.TimelineModel.Filter.prototype
}

/**
 * @constructor
 * @implements {WebInspector.OutputStreamDelegate}
 * @param {!WebInspector.TimelineModel} model
 * @param {!WebInspector.Progress} progress
 */
WebInspector.TimelineModelLoadFromFileDelegate = function(model, progress)
{
    this._model = model;
    this._progress = progress;
}

WebInspector.TimelineModelLoadFromFileDelegate.prototype = {
    /**
     * @override
     */
    onTransferStarted: function()
    {
        this._progress.setTitle(WebInspector.UIString("Loading\u2026"));
    },

    /**
     * @override
     * @param {!WebInspector.ChunkedReader} reader
     */
    onChunkTransferred: function(reader)
    {
        if (this._progress.isCanceled()) {
            reader.cancel();
            this._progress.done();
            this._model.reset();
            return;
        }

        var totalSize = reader.fileSize();
        if (totalSize) {
            this._progress.setTotalWork(totalSize);
            this._progress.setWorked(reader.loadedSize());
        }
    },

    /**
     * @override
     */
    onTransferFinished: function()
    {
        this._progress.done();
    },

    /**
     * @override
     * @param {!WebInspector.ChunkedReader} reader
     * @param {!Event} event
     */
    onError: function(reader, event)
    {
        this._progress.done();
        this._model.reset();
        switch (event.target.error.code) {
        case FileError.NOT_FOUND_ERR:
            WebInspector.console.error(WebInspector.UIString("File \"%s\" not found.", reader.fileName()));
            break;
        case FileError.NOT_READABLE_ERR:
            WebInspector.console.error(WebInspector.UIString("File \"%s\" is not readable", reader.fileName()));
            break;
        case FileError.ABORT_ERR:
            break;
        default:
            WebInspector.console.error(WebInspector.UIString("An error occurred while reading the file \"%s\"", reader.fileName()));
        }
    }
}

/**
 * @constructor
 * @extends {WebInspector.TimelineModel.Filter}
 * @param {!Array<string>} excludeNames
 */
WebInspector.ExclusiveNameFilter = function(excludeNames)
{
    WebInspector.TimelineModel.Filter.call(this);
    this._excludeNames = new Set(excludeNames);
}

WebInspector.ExclusiveNameFilter.prototype = {
    /**
     * @override
     * @param {!WebInspector.TracingModel.Event} event
     * @return {boolean}
     */
    accept: function(event)
    {
        return !this._excludeNames.has(event.name);
    },

    __proto__: WebInspector.TimelineModel.Filter.prototype
}

/**
 * @constructor
 * @extends {WebInspector.TimelineModel.Filter}
 */
WebInspector.ExcludeTopLevelFilter = function()
{
    WebInspector.TimelineModel.Filter.call(this);
}

WebInspector.ExcludeTopLevelFilter.prototype = {
    /**
     * @override
     * @param {!WebInspector.TracingModel.Event} event
     * @return {boolean}
     */
    accept: function(event)
    {
        return !WebInspector.TracingModel.isTopLevelEvent(event);
    },

    __proto__: WebInspector.TimelineModel.Filter.prototype
}

/**
 * @constructor
 * @implements {WebInspector.OutputStream}
 * @param {!WebInspector.TimelineModel} model
 * @param {!WebInspector.Progress} progress
 * @param {function()=} canceledCallback
 */
WebInspector.TracingModelLoader = function(model, progress, canceledCallback)
{
    this._model = model;

    this._canceledCallback = canceledCallback;
    this._progress = progress;
    this._progress.setTitle(WebInspector.UIString("Loading"));
    this._progress.setTotalWork(WebInspector.TracingModelLoader._totalProgress);  // Unknown, will loop the values.

    this._state = WebInspector.TracingModelLoader.State.Initial;
    this._buffer = "";
    this._firstChunk = true;
    this._wasCanceledOnce = false;

    this._loadedBytes = 0;
    this._jsonTokenizer = new WebInspector.TextUtils.BalancedJSONTokenizer(this._writeBalancedJSON.bind(this), true);
}

WebInspector.TracingModelLoader._totalProgress = 100000;

WebInspector.TracingModelLoader.State = {
    Initial: "Initial",
    LookingForEvents: "LookingForEvents",
    ReadingEvents: "ReadingEvents"
}

WebInspector.TracingModelLoader.prototype = {
    /**
     * @override
     * @param {string} chunk
     */
    write: function(chunk)
    {
        this._loadedBytes += chunk.length;
        if (this._progress.isCanceled() && !this._wasCanceledOnce) {
            this._wasCanceled = true;
            this._reportErrorAndCancelLoading();
            return;
        }
        this._progress.setWorked(this._loadedBytes % WebInspector.TracingModelLoader._totalProgress,
                                 WebInspector.UIString("Loaded %s", Number.bytesToString(this._loadedBytes)));
        if (this._state === WebInspector.TracingModelLoader.State.Initial) {
            if (chunk[0] === "{")
                this._state = WebInspector.TracingModelLoader.State.LookingForEvents;
            else if (chunk[0] === "[")
                this._state = WebInspector.TracingModelLoader.State.ReadingEvents;
            else {
                this._reportErrorAndCancelLoading(WebInspector.UIString("Malformed timeline data: Unknown JSON format"));
                return;
            }
        }

        if (this._state === WebInspector.TracingModelLoader.State.LookingForEvents) {
            var objectName = "\"traceEvents\":";
            var startPos = this._buffer.length - objectName.length;
            this._buffer += chunk;
            var pos = this._buffer.indexOf(objectName, startPos);
            if (pos === -1)
                return;
            chunk = this._buffer.slice(pos + objectName.length)
            this._state = WebInspector.TracingModelLoader.State.ReadingEvents;
        }

        this._jsonTokenizer.write(chunk);
    },

    /**
     * @param {string} data
     */
    _writeBalancedJSON: function(data)
    {
        var json = data + "]";

        if (this._firstChunk) {
            this._model._startCollectingTraceEvents(true);
        } else {
            var commaIndex = json.indexOf(",");
            if (commaIndex !== -1)
                json = json.slice(commaIndex + 1);
            json = "[" + json;
        }

        var items;
        try {
            items = /** @type {!Array.<!WebInspector.TracingManager.EventPayload>} */ (JSON.parse(json));
        } catch (e) {
            this._reportErrorAndCancelLoading(WebInspector.UIString("Malformed timeline data: %s", e.toString()));
            return;
        }

        if (this._firstChunk) {
            this._firstChunk = false;
            if (this._looksLikeAppVersion(items[0])) {
                this._reportErrorAndCancelLoading(WebInspector.UIString("Legacy Timeline format is not supported."));
                return;
            }
        }

        try {
            this._model._tracingModel.addEvents(items);
        } catch(e) {
            this._reportErrorAndCancelLoading(WebInspector.UIString("Malformed timeline data: %s", e.toString()));
            return;
        }
    },

    /**
     * @param {string=} message
     */
    _reportErrorAndCancelLoading: function(message)
    {
        if (message)
            WebInspector.console.error(message);
        this._model.tracingComplete();
        this._model.reset();
        if (this._canceledCallback)
            this._canceledCallback();
        this._progress.done();
    },

    _looksLikeAppVersion: function(item)
    {
        return typeof item === "string" && item.indexOf("Chrome") !== -1;
    },

    /**
     * @override
     */
    close: function()
    {
        this._model._loadedFromFile = true;
        this._model.tracingComplete();
        if (this._progress)
            this._progress.done();
    }
}

/**
 * @constructor
 * @param {!WebInspector.OutputStream} stream
 * @implements {WebInspector.OutputStreamDelegate}
 */
WebInspector.TracingTimelineSaver = function(stream)
{
    this._stream = stream;
}

WebInspector.TracingTimelineSaver.prototype = {
    /**
     * @override
     */
    onTransferStarted: function()
    {
        this._stream.write("[");
    },

    /**
     * @override
     */
    onTransferFinished: function()
    {
        this._stream.write("]");
    },

    /**
     * @override
     * @param {!WebInspector.ChunkedReader} reader
     */
    onChunkTransferred: function(reader) { },

    /**
     * @override
     * @param {!WebInspector.ChunkedReader} reader
     * @param {!Event} event
     */
    onError: function(reader, event) { }
}

/**
 * @constructor
 * @param {!WebInspector.TracingModel.Event} event
 */
WebInspector.InvalidationTrackingEvent = function(event)
{
    /** @type {string} */
    this.type = event.name;
    /** @type {number} */
    this.startTime = event.startTime;
    /** @type {!WebInspector.TracingModel.Event} */
    this._tracingEvent = event;

    var eventData = event.args["data"];

    /** @type {number} */
    this.frame = eventData["frame"];
    /** @type {?number} */
    this.nodeId = eventData["nodeId"];
    /** @type {?string} */
    this.nodeName = eventData["nodeName"];
    /** @type {?number} */
    this.paintId = eventData["paintId"];
    /** @type {?number} */
    this.invalidationSet = eventData["invalidationSet"];
    /** @type {?string} */
    this.invalidatedSelectorId = eventData["invalidatedSelectorId"];
    /** @type {?string} */
    this.changedId = eventData["changedId"];
    /** @type {?string} */
    this.changedClass = eventData["changedClass"];
    /** @type {?string} */
    this.changedAttribute = eventData["changedAttribute"];
    /** @type {?string} */
    this.changedPseudo = eventData["changedPseudo"];
    /** @type {?string} */
    this.selectorPart = eventData["selectorPart"];
    /** @type {?string} */
    this.extraData = eventData["extraData"];
    /** @type {?Array.<!Object.<string, number>>} */
    this.invalidationList = eventData["invalidationList"];
    /** @type {!WebInspector.InvalidationCause} */
    this.cause = {reason: eventData["reason"], stackTrace: eventData["stackTrace"]};

    // FIXME: Move this to TimelineUIUtils.js.
    if (!this.cause.reason && this.cause.stackTrace && this.type === WebInspector.TimelineModel.RecordType.LayoutInvalidationTracking)
        this.cause.reason = "Layout forced";
}

/** @typedef {{reason: string, stackTrace: ?Array.<!ConsoleAgent.CallFrame>}} */
WebInspector.InvalidationCause;

/**
 * @constructor
 */
WebInspector.InvalidationTracker = function()
{
    this._initializePerFrameState();
}

WebInspector.InvalidationTracker.prototype = {
    /**
     * @param {!WebInspector.InvalidationTrackingEvent} invalidation
     */
    addInvalidation: function(invalidation)
    {
        this._startNewFrameIfNeeded();

        if (!invalidation.nodeId && !invalidation.paintId) {
            console.error("Invalidation lacks node information.");
            console.error(invalidation);
            return;
        }

        // PaintInvalidationTracking events provide a paintId and a nodeId which
        // we can use to update the paintId for all other invalidation tracking
        // events.
        var recordTypes = WebInspector.TimelineModel.RecordType;
        if (invalidation.type === recordTypes.PaintInvalidationTracking && invalidation.nodeId) {
            var invalidations = this._invalidationsByNodeId[invalidation.nodeId] || [];
            for (var i = 0; i < invalidations.length; ++i)
                invalidations[i].paintId = invalidation.paintId;

            // PaintInvalidationTracking is only used for updating paintIds.
            return;
        }

        // Suppress StyleInvalidator StyleRecalcInvalidationTracking invalidations because they
        // will be handled by StyleInvalidatorInvalidationTracking.
        // FIXME: Investigate if we can remove StyleInvalidator invalidations entirely.
        if (invalidation.type === recordTypes.StyleRecalcInvalidationTracking && invalidation.cause.reason === "StyleInvalidator")
            return;

        // Style invalidation events can occur before and during recalc style. didRecalcStyle
        // handles style invalidations that occur before the recalc style event but we need to
        // handle style recalc invalidations during recalc style here.
        var styleRecalcInvalidation = (invalidation.type === recordTypes.ScheduleStyleInvalidationTracking
            || invalidation.type === recordTypes.StyleInvalidatorInvalidationTracking
            || invalidation.type === recordTypes.StyleRecalcInvalidationTracking);
        if (styleRecalcInvalidation) {
            var duringRecalcStyle = invalidation.startTime && this._lastRecalcStyle
                && invalidation.startTime >= this._lastRecalcStyle.startTime
                && invalidation.startTime <= this._lastRecalcStyle.endTime;
            if (duringRecalcStyle)
                this._associateWithLastRecalcStyleEvent(invalidation);
        }

        // Record the invalidation so later events can look it up.
        if (this._invalidations[invalidation.type])
            this._invalidations[invalidation.type].push(invalidation);
        else
            this._invalidations[invalidation.type] = [ invalidation ];
        if (invalidation.nodeId) {
            if (this._invalidationsByNodeId[invalidation.nodeId])
                this._invalidationsByNodeId[invalidation.nodeId].push(invalidation);
            else
                this._invalidationsByNodeId[invalidation.nodeId] = [ invalidation ];
        }
    },

    /**
     * @param {!WebInspector.TracingModel.Event} recalcStyleEvent
     */
    didRecalcStyle: function(recalcStyleEvent)
    {
        this._lastRecalcStyle = recalcStyleEvent;
        var types = [WebInspector.TimelineModel.RecordType.ScheduleStyleInvalidationTracking,
                WebInspector.TimelineModel.RecordType.StyleInvalidatorInvalidationTracking,
                WebInspector.TimelineModel.RecordType.StyleRecalcInvalidationTracking];
        for (var invalidation of this._invalidationsOfTypes(types))
            this._associateWithLastRecalcStyleEvent(invalidation);
    },

    /**
     * @param {!WebInspector.InvalidationTrackingEvent} invalidation
     */
    _associateWithLastRecalcStyleEvent: function(invalidation)
    {
        if (invalidation.linkedRecalcStyleEvent)
            return;

        var recordTypes = WebInspector.TimelineModel.RecordType;
        var recalcStyleFrameId = this._lastRecalcStyle.args["beginData"]["frame"];
        if (invalidation.type === recordTypes.StyleInvalidatorInvalidationTracking) {
            // Instead of calling _addInvalidationToEvent directly, we create synthetic
            // StyleRecalcInvalidationTracking events which will be added in _addInvalidationToEvent.
            this._addSyntheticStyleRecalcInvalidations(this._lastRecalcStyle, recalcStyleFrameId, invalidation);
        } else if (invalidation.type === recordTypes.ScheduleStyleInvalidationTracking) {
            // ScheduleStyleInvalidationTracking events are only used for adding information to
            // StyleInvalidatorInvalidationTracking events. See: _addSyntheticStyleRecalcInvalidations.
        } else {
            this._addInvalidationToEvent(this._lastRecalcStyle, recalcStyleFrameId, invalidation);
        }

        invalidation.linkedRecalcStyleEvent = true;
    },

    /**
     * @param {!WebInspector.TracingModel.Event} event
     * @param {number} frameId
     * @param {!WebInspector.InvalidationTrackingEvent} styleInvalidatorInvalidation
     */
    _addSyntheticStyleRecalcInvalidations: function(event, frameId, styleInvalidatorInvalidation)
    {
        if (!styleInvalidatorInvalidation.invalidationList) {
            this._addSyntheticStyleRecalcInvalidation(styleInvalidatorInvalidation._tracingEvent, styleInvalidatorInvalidation);
            return;
        }
        if (!styleInvalidatorInvalidation.nodeId) {
            console.error("Invalidation lacks node information.");
            console.error(invalidation);
            return;
        }
        for (var i = 0; i < styleInvalidatorInvalidation.invalidationList.length; i++) {
            var setId = styleInvalidatorInvalidation.invalidationList[i]["id"];
            var lastScheduleStyleRecalculation;
            var nodeInvalidations = this._invalidationsByNodeId[styleInvalidatorInvalidation.nodeId] || [];
            for (var j = 0; j < nodeInvalidations.length; j++) {
                var invalidation = nodeInvalidations[j];
                if (invalidation.frame !== frameId || invalidation.invalidationSet !== setId || invalidation.type !== WebInspector.TimelineModel.RecordType.ScheduleStyleInvalidationTracking)
                    continue;
                lastScheduleStyleRecalculation = invalidation;
            }
            if (!lastScheduleStyleRecalculation) {
                console.error("Failed to lookup the event that scheduled a style invalidator invalidation.");
                continue;
            }
            this._addSyntheticStyleRecalcInvalidation(lastScheduleStyleRecalculation._tracingEvent, styleInvalidatorInvalidation);
        }
    },

    /**
     * @param {!WebInspector.TracingModel.Event} baseEvent
     * @param {!WebInspector.InvalidationTrackingEvent} styleInvalidatorInvalidation
     */
    _addSyntheticStyleRecalcInvalidation: function(baseEvent, styleInvalidatorInvalidation)
    {
        var invalidation = new WebInspector.InvalidationTrackingEvent(baseEvent);
        invalidation.type = WebInspector.TimelineModel.RecordType.StyleRecalcInvalidationTracking;
        invalidation.synthetic = true;
        if (styleInvalidatorInvalidation.cause.reason)
            invalidation.cause.reason = styleInvalidatorInvalidation.cause.reason;
        if (styleInvalidatorInvalidation.selectorPart)
            invalidation.selectorPart = styleInvalidatorInvalidation.selectorPart;

        this.addInvalidation(invalidation);
        if (!invalidation.linkedRecalcStyleEvent)
            this._associateWithLastRecalcStyleEvent(invalidation);
    },

    /**
     * @param {!WebInspector.TracingModel.Event} layoutEvent
     */
    didLayout: function(layoutEvent)
    {
        var layoutFrameId = layoutEvent.args["beginData"]["frame"];
        for (var invalidation of this._invalidationsOfTypes([WebInspector.TimelineModel.RecordType.LayoutInvalidationTracking])) {
            if (invalidation.linkedLayoutEvent)
                continue;
            this._addInvalidationToEvent(layoutEvent, layoutFrameId, invalidation);
            invalidation.linkedLayoutEvent = true;
        }
    },

    /**
     * @param {!WebInspector.TracingModel.Event} paintEvent
     */
    didPaint: function(paintEvent)
    {
        this._didPaint = true;

        // If a paint doesn't have a corresponding graphics layer id, it paints
        // into its parent so add an effectivePaintId to these events.
        var layerId = paintEvent.args["data"]["layerId"];
        if (layerId)
            this._lastPaintWithLayer = paintEvent;
        if (!this._lastPaintWithLayer) {
            console.error("Failed to find a paint container for a paint event.");
            return;
        }

        var effectivePaintId = this._lastPaintWithLayer.args["data"]["nodeId"];
        var paintFrameId = paintEvent.args["data"]["frame"];
        var types = [WebInspector.TimelineModel.RecordType.StyleRecalcInvalidationTracking,
            WebInspector.TimelineModel.RecordType.LayoutInvalidationTracking,
            WebInspector.TimelineModel.RecordType.PaintInvalidationTracking,
            WebInspector.TimelineModel.RecordType.ScrollInvalidationTracking];
        for (var invalidation of this._invalidationsOfTypes(types)) {
            if (invalidation.paintId === effectivePaintId)
                this._addInvalidationToEvent(paintEvent, paintFrameId, invalidation);
        }
    },

    /**
     * @param {!WebInspector.TracingModel.Event} event
     * @param {number} eventFrameId
     * @param {!WebInspector.InvalidationTrackingEvent} invalidation
     */
    _addInvalidationToEvent: function(event, eventFrameId, invalidation)
    {
        if (eventFrameId !== invalidation.frame)
            return;
        if (!event.invalidationTrackingEvents)
            event.invalidationTrackingEvents = [ invalidation ];
        else
            event.invalidationTrackingEvents.push(invalidation);
    },

    /**
     * @param {!Array.<string>=} types
     * @return {!Iterator.<!WebInspector.InvalidationTrackingEvent>}
     */
    _invalidationsOfTypes: function(types)
    {
        var invalidations = this._invalidations;
        if (!types)
            types = Object.keys(invalidations);
        function* generator()
        {
            for (var i = 0; i < types.length; ++i) {
                var invalidationList = invalidations[types[i]] || [];
                for (var j = 0; j < invalidationList.length; ++j)
                    yield invalidationList[j];
            }
        }
        return generator();
    },

    _startNewFrameIfNeeded: function()
    {
        if (!this._didPaint)
            return;

        this._initializePerFrameState();
    },

    _initializePerFrameState: function()
    {
        /** @type {!Object.<string, !Array.<!WebInspector.InvalidationTrackingEvent>>} */
        this._invalidations = {};
        /** @type {!Object.<number, !Array.<!WebInspector.InvalidationTrackingEvent>>} */
        this._invalidationsByNodeId = {};

        this._lastRecalcStyle = undefined;
        this._lastPaintWithLayer = undefined;
        this._didPaint = false;
    }
}

/**
 * @constructor
 */
WebInspector.TimelineAsyncEventTracker = function()
{
    WebInspector.TimelineAsyncEventTracker._initialize();
    /** @type {!Map<!WebInspector.TimelineModel.RecordType, !Map<string, !WebInspector.TracingModel.Event>>} */
    this._initiatorByType = new Map();
    for (var initiator of WebInspector.TimelineAsyncEventTracker._asyncEvents.keys())
        this._initiatorByType.set(initiator, new Map());
}

WebInspector.TimelineAsyncEventTracker._initialize = function()
{
    if (WebInspector.TimelineAsyncEventTracker._asyncEvents)
        return;
    var events = new Map();
    var type = WebInspector.TimelineModel.RecordType;
    events.set(type.TimerInstall, {causes: [type.TimerFire], joinBy: "timerId"});
    events.set(type.ResourceSendRequest, {causes: [type.ResourceReceiveResponse, type.ResourceReceivedData, type.ResourceFinish], joinBy: "requestId"});
    events.set(type.RequestAnimationFrame, {causes: [type.FireAnimationFrame], joinBy: "id"});
    events.set(type.WebSocketCreate, {causes: [type.WebSocketSendHandshakeRequest, type.WebSocketReceiveHandshakeResponse, type.WebSocketDestroy], joinBy: "identifier"});
    WebInspector.TimelineAsyncEventTracker._asyncEvents = events;
    /** @type {!Map<!WebInspector.TimelineModel.RecordType, !WebInspector.TimelineModel.RecordType>} */
    WebInspector.TimelineAsyncEventTracker._typeToInitiator = new Map();
    for (var entry of events) {
        var types = entry[1].causes;
        for (type of types)
            WebInspector.TimelineAsyncEventTracker._typeToInitiator.set(type, entry[0]);
    }
}

WebInspector.TimelineAsyncEventTracker.prototype = {
    /**
     * @param {!WebInspector.TracingModel.Event} event
     */
    processEvent: function(event)
    {
        var initiatorType = WebInspector.TimelineAsyncEventTracker._typeToInitiator.get(/** @type {!WebInspector.TimelineModel.RecordType} */ (event.name));
        var isInitiator = !initiatorType;
        if (!initiatorType)
            initiatorType = /** @type {!WebInspector.TimelineModel.RecordType} */ (event.name);
        var initiatorInfo = WebInspector.TimelineAsyncEventTracker._asyncEvents.get(initiatorType);
        if (!initiatorInfo)
            return;
        var id = event.args["data"][initiatorInfo.joinBy];
        if (!id)
            return;
        /** @type {!Map<string, !WebInspector.TracingModel.Event>|undefined} */
        var initiatorMap = this._initiatorByType.get(initiatorType);
        if (isInitiator)
            initiatorMap.set(id, event);
        else
            event.initiator = initiatorMap.get(id) || null;
    }
}
