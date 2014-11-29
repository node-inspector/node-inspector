/*
 * Copyright 2014 The Chromium Authors. All rights reserved.
 * Use of this source code is governed by a BSD-style license that can be
 * found in the LICENSE file.
 */

/**
 * @constructor
 */
WebInspector.TracingModel = function()
{
    this.reset();
}

/**
 * @enum {string}
 */
WebInspector.TracingModel.Phase = {
    Begin: "B",
    End: "E",
    Complete: "X",
    Instant: "I",
    AsyncBegin: "S",
    AsyncStepInto: "T",
    AsyncStepPast: "p",
    AsyncEnd: "F",
    NestableAsyncBegin: "b",
    NestableAsyncEnd: "e",
    NestableAsyncInstant: "i",
    FlowBegin: "s",
    FlowStep: "t",
    FlowEnd: "f",
    Metadata: "M",
    Counter: "C",
    Sample: "P",
    CreateObject: "N",
    SnapshotObject: "O",
    DeleteObject: "D"
};

WebInspector.TracingModel.MetadataEvent = {
    ProcessSortIndex: "process_sort_index",
    ProcessName: "process_name",
    ThreadSortIndex: "thread_sort_index",
    ThreadName: "thread_name"
}

WebInspector.TracingModel.DevToolsMetadataEventCategory = "disabled-by-default-devtools.timeline";

WebInspector.TracingModel.ConsoleEventCategory = "blink.console";

WebInspector.TracingModel.FrameLifecycleEventCategory = "cc,devtools";

WebInspector.TracingModel.DevToolsMetadataEvent = {
    TracingStartedInPage: "TracingStartedInPage",
    TracingSessionIdForWorker: "TracingSessionIdForWorker",
};

WebInspector.TracingModel._nestableAsyncEventsString =
    WebInspector.TracingModel.Phase.NestableAsyncBegin +
    WebInspector.TracingModel.Phase.NestableAsyncEnd +
    WebInspector.TracingModel.Phase.NestableAsyncInstant;

WebInspector.TracingModel._legacyAsyncEventsString =
    WebInspector.TracingModel.Phase.AsyncBegin +
    WebInspector.TracingModel.Phase.AsyncEnd +
    WebInspector.TracingModel.Phase.AsyncStepInto +
    WebInspector.TracingModel.Phase.AsyncStepPast;

WebInspector.TracingModel._asyncEventsString = WebInspector.TracingModel._nestableAsyncEventsString + WebInspector.TracingModel._legacyAsyncEventsString;

/**
 * @param {string} phase
 * @return {boolean}
 */
WebInspector.TracingModel.isNestableAsyncPhase = function(phase)
{
    return WebInspector.TracingModel._nestableAsyncEventsString.indexOf(phase) >= 0;
}

/**
 * @param {string} phase
 * @return {boolean}
 */
WebInspector.TracingModel.isAsyncBeginPhase = function(phase)
{
    return phase === WebInspector.TracingModel.Phase.AsyncBegin || phase === WebInspector.TracingModel.Phase.NestableAsyncBegin;
}

/**
 * @param {string} phase
 * @return {boolean}
 */
WebInspector.TracingModel.isAsyncPhase = function(phase)
{
    return WebInspector.TracingModel._asyncEventsString.indexOf(phase) >= 0;
}

WebInspector.TracingModel.prototype = {
    /**
     * @return {!Array.<!WebInspector.TracingModel.Event>}
     */
    devtoolsPageMetadataEvents: function()
    {
        return this._devtoolsPageMetadataEvents;
    },

    /**
     * @return {!Array.<!WebInspector.TracingModel.Event>}
     */
    devtoolsWorkerMetadataEvents: function()
    {
        return this._devtoolsWorkerMetadataEvents;
    },

    /**
     * @return {?string}
     */
    sessionId: function()
    {
        return this._sessionId;
    },

    /**
     * @param {!Array.<!WebInspector.TracingManager.EventPayload>} events
     */
    setEventsForTest: function(events)
    {
        this.reset();
        this.addEvents(events);
        this.tracingComplete();
    },

    /**
     * @param {!Array.<!WebInspector.TracingManager.EventPayload>} events
     */
    addEvents: function(events)
    {
        for (var i = 0; i < events.length; ++i)
            this._addEvent(events[i]);
    },

    tracingComplete: function()
    {
        this._processMetadataEvents();
        for (var process in this._processById)
            this._processById[process]._tracingComplete(this._maximumRecordTime);
        this._backingStorage.finishWriting(function() {});
    },

    reset: function()
    {
        /** @type {!Object.<(number|string), !WebInspector.TracingModel.Process>} */
        this._processById = {};
        this._processByName = new Map();
        this._minimumRecordTime = 0;
        this._maximumRecordTime = 0;
        this._sessionId = null;
        this._devtoolsPageMetadataEvents = [];
        this._devtoolsWorkerMetadataEvents = [];
        if (this._backingStorage)
            this._backingStorage.remove();
        this._backingStorage = new WebInspector.DeferredTempFile("tracing", String(Date.now()));
        this._storageOffset = 0;
    },

    /**
     * @param {!WebInspector.OutputStream} outputStream
     * @param {!WebInspector.OutputStreamDelegate} delegate
     */
    writeToStream: function(outputStream, delegate)
    {
        this._backingStorage.writeToOutputStream(outputStream, delegate);
    },

    /**
      * @param {!WebInspector.TracingManager.EventPayload} payload
      */
    _addEvent: function(payload)
    {
        var process = this._processById[payload.pid];
        if (!process) {
            process = new WebInspector.TracingModel.Process(payload.pid);
            this._processById[payload.pid] = process;
        }

        var stringPayload = JSON.stringify(payload);
        var startOffset = this._storageOffset;
        if (startOffset) {
            var recordDelimiter = ",\n";
            stringPayload = recordDelimiter + stringPayload;
            startOffset += recordDelimiter.length;
        }
        var blob = new Blob([stringPayload]);
        this._storageOffset += blob.size;
        this._backingStorage.write([stringPayload]);

        if (payload.ph !== WebInspector.TracingModel.Phase.Metadata) {
            var timestamp = payload.ts / 1000;
            // We do allow records for unrelated threads to arrive out-of-order,
            // so there's a chance we're getting records from the past.
            if (timestamp && (!this._minimumRecordTime || timestamp < this._minimumRecordTime))
                this._minimumRecordTime = timestamp;
            var endTimeStamp = (payload.ts + (payload.dur || 0)) / 1000;
            this._maximumRecordTime = Math.max(this._maximumRecordTime, endTimeStamp);
            var event = process._addEvent(payload);
            if (!event)
                return;
            event._setBackingStorage(this._backingStorage, startOffset, this._storageOffset);
            if (event.name === WebInspector.TracingModel.DevToolsMetadataEvent.TracingStartedInPage &&
                event.category === WebInspector.TracingModel.DevToolsMetadataEventCategory) {
                this._devtoolsPageMetadataEvents.push(event);
            }
            if (event.name === WebInspector.TracingModel.DevToolsMetadataEvent.TracingSessionIdForWorker &&
                event.category === WebInspector.TracingModel.DevToolsMetadataEventCategory) {
                this._devtoolsWorkerMetadataEvents.push(event);
            }
            return;
        }
        switch (payload.name) {
        case WebInspector.TracingModel.MetadataEvent.ProcessSortIndex:
            process._setSortIndex(payload.args["sort_index"]);
            break;
        case WebInspector.TracingModel.MetadataEvent.ProcessName:
            var processName = payload.args["name"];
            process._setName(processName);
            this._processByName.set(processName, process);
            break;
        case WebInspector.TracingModel.MetadataEvent.ThreadSortIndex:
            process.threadById(payload.tid)._setSortIndex(payload.args["sort_index"]);
            break;
        case WebInspector.TracingModel.MetadataEvent.ThreadName:
            process.threadById(payload.tid)._setName(payload.args["name"]);
            break;
        }
    },

    _processMetadataEvents: function()
    {
        this._devtoolsPageMetadataEvents.sort(WebInspector.TracingModel.Event.compareStartTime);
        if (!this._devtoolsPageMetadataEvents.length) {
            WebInspector.console.error(WebInspector.TracingModel.DevToolsMetadataEvent.TracingStartedInPage + " event not found.");
            return;
        }
        var sessionId = this._devtoolsPageMetadataEvents[0].args["sessionId"];
        this._sessionId = sessionId;

        var mismatchingIds = {};
        function checkSessionId(event)
        {
            var args = event.args;
            // FIXME: put sessionId into args["data"] for TracingStartedInPage event.
            if (args["data"])
                args = args["data"];
            var id = args["sessionId"];
            if (id === sessionId)
                return true;
            mismatchingIds[id] = true;
            return false;
        }
        this._devtoolsPageMetadataEvents = this._devtoolsPageMetadataEvents.filter(checkSessionId);
        this._devtoolsWorkerMetadataEvents = this._devtoolsWorkerMetadataEvents.filter(checkSessionId);

        var idList = Object.keys(mismatchingIds);
        if (idList.length)
            WebInspector.console.error("Timeline recording was started in more than one page simulaniously. Session id mismatch: " + this._sessionId + " and " + idList + ".");
    },

    /**
     * @return {number}
     */
    minimumRecordTime: function()
    {
        return this._minimumRecordTime;
    },

    /**
     * @return {number}
     */
    maximumRecordTime: function()
    {
        return this._maximumRecordTime;
    },

    /**
     * @return {!Array.<!WebInspector.TracingModel.Process>}
     */
    sortedProcesses: function()
    {
        return WebInspector.TracingModel.NamedObject._sort(Object.values(this._processById));
    },

    /**
     * @param {string} name
     * @return {?WebInspector.TracingModel.Process}
     */
    processByName: function(name)
    {
        return this._processByName.get(name);
    },
}


/**
 * @constructor
 * @param {!WebInspector.TracingModel} tracingModel
 */
WebInspector.TracingModel.Loader = function(tracingModel)
{
    this._tracingModel = tracingModel;
    this._firstChunkReceived = false;
}

WebInspector.TracingModel.Loader.prototype = {
    /**
     * @param {!Array.<!WebInspector.TracingManager.EventPayload>} events
     */
    loadNextChunk: function(events)
    {
        if (!this._firstChunkReceived) {
            this._tracingModel.reset();
            this._firstChunkReceived = true;
        }
        this._tracingModel.addEvents(events);
    },

    finish: function()
    {
        this._tracingModel.tracingComplete();
    }
}


/**
 * @constructor
 * @param {string} category
 * @param {string} name
 * @param {!WebInspector.TracingModel.Phase} phase
 * @param {number} startTime
 * @param {!WebInspector.TracingModel.Thread} thread
 */
WebInspector.TracingModel.Event = function(category, name, phase, startTime, thread)
{
    /** @type {string} */
    this.category = category;
    /** @type {string} */
    this.name = name;
    /** @type {!WebInspector.TracingModel.Phase} */
    this.phase = phase;
    /** @type {number} */
    this.startTime = startTime;
    /** @type {!WebInspector.TracingModel.Thread} */
    this.thread = thread;
    this.args = {};

    /** @type {?string} */
    this.warning = null;
    /** @type {?WebInspector.TracingModel.Event} */
    this.initiator = null;
    /** @type {?Array.<!ConsoleAgent.CallFrame>} */
    this.stackTrace = null;
    /** @type {?Element} */
    this.previewElement = null;
    /** @type {?string} */
    this.imageURL = null;
    /** @type {number} */
    this.backendNodeId = 0;

    /** @type {number} */
    this.selfTime = 0;
}

/**
 * @param {!WebInspector.TracingManager.EventPayload} payload
 * @param {!WebInspector.TracingModel.Thread} thread
 * @return {!WebInspector.TracingModel.Event}
 */
WebInspector.TracingModel.Event.fromPayload = function(payload, thread)
{
    var event = new WebInspector.TracingModel.Event(payload.cat, payload.name, /** @type {!WebInspector.TracingModel.Phase} */ (payload.ph), payload.ts / 1000, thread);
    if (payload.args)
        event.addArgs(payload.args);
    else
        console.error("Missing mandatory event argument 'args' at " + payload.ts / 1000);
    if (typeof payload.dur === "number")
        event.setEndTime((payload.ts + payload.dur) / 1000);
    if (payload.id)
        event.id = payload.id;
    return event;
}

WebInspector.TracingModel.Event.prototype = {
    /**
     * @param {number} endTime
     */
    setEndTime: function(endTime)
    {
        if (endTime < this.startTime) {
            console.assert(false, "Event out of order: " + this.name);
            return;
        }
        this.endTime = endTime;
        this.duration = endTime - this.startTime;
    },

    /**
     * @param {!Object} args
     */
    addArgs: function(args)
    {
        // Shallow copy args to avoid modifying original payload which may be saved to file.
        for (var name in args) {
            if (name in this.args)
                console.error("Same argument name (" + name +  ") is used for begin and end phases of " + this.name);
            this.args[name] = args[name];
        }
    },

    /**
     * @param {!WebInspector.TracingManager.EventPayload} payload
     */
    _complete: function(payload)
    {
        if (payload.args)
            this.addArgs(payload.args);
        else
            console.error("Missing mandatory event argument 'args' at " + payload.ts / 1000);
        this.setEndTime(payload.ts / 1000);
    },

    /**
     * @param {!WebInspector.DeferredTempFile} backingFile
     * @param {number} startOffset
     * @param {number} endOffset
     */
    _setBackingStorage: function(backingFile, startOffset, endOffset)
    {
    }
}

/**
 * @param {!WebInspector.TracingModel.Event} a
 * @param {!WebInspector.TracingModel.Event} b
 * @return {number}
 */
WebInspector.TracingModel.Event.compareStartTime = function (a, b)
{
    return a.startTime - b.startTime;
}

/**
 * @param {!WebInspector.TracingModel.Event} a
 * @param {!WebInspector.TracingModel.Event} b
 * @return {number}
 */
WebInspector.TracingModel.Event.orderedCompareStartTime = function (a, b)
{
    // Array.mergeOrdered coalesces objects if comparator returns 0.
    // To change this behavior this comparator return -1 in the case events
    // startTime's are equal, so both events got placed into the result array.
    return a.startTime - b.startTime || -1;
}

/**
 * @constructor
 * @extends {WebInspector.TracingModel.Event}
 * @param {string} category
 * @param {string} name
 * @param {number} startTime
 * @param {!WebInspector.TracingModel.Thread} thread
 */
WebInspector.TracingModel.ObjectSnapshot = function(category, name, startTime, thread)
{
    WebInspector.TracingModel.Event.call(this, category, name, WebInspector.TracingModel.Phase.SnapshotObject, startTime, thread);
}

/**
 * @param {!WebInspector.TracingManager.EventPayload} payload
 * @param {!WebInspector.TracingModel.Thread} thread
 * @return {!WebInspector.TracingModel.ObjectSnapshot}
 */
WebInspector.TracingModel.ObjectSnapshot.fromPayload = function(payload, thread)
{
    var snapshot = new WebInspector.TracingModel.ObjectSnapshot(payload.cat, payload.name, payload.ts / 1000, thread);
    if (payload.id)
        snapshot.id = payload.id;
    if (!payload.args || !payload.args["snapshot"]) {
        console.error("Missing mandatory 'snapshot' argument at " + payload.ts / 1000);
        return snapshot;
    }
    if (payload.args)
        snapshot.addArgs(payload.args);
    return snapshot;
}

WebInspector.TracingModel.ObjectSnapshot.prototype = {
   /**
    * @param {function(?Object)} callback
    */
   requestObject: function(callback)
   {
       var snapshot = this.args["snapshot"];
       if (snapshot) {
           callback(snapshot);
           return;
       }
       this._file.readRange(this._startOffset, this._endOffset, onRead);
       /**
        * @param {?string} result
        */
       function onRead(result)
       {
           if (!result) {
               callback(null);
               return;
           }
           var snapshot;
           try {
               var payload = JSON.parse(result);
               snapshot = payload["args"]["snapshot"];
           } catch (e) {
               WebInspector.console.error("Malformed event data in backing storage");
           }
           callback(snapshot);
       }
    },

    /**
     * @param {!WebInspector.DeferredTempFile} backingFile
     * @param {number} startOffset
     * @param {number} endOffset
     * @override
     */
    _setBackingStorage: function(backingFile, startOffset, endOffset)
    {
        if (endOffset - startOffset < 10000)
            return;
        this._file = backingFile;
        this._startOffset = startOffset;
        this._endOffset = endOffset;
        this.args = {};
    },

    __proto__: WebInspector.TracingModel.Event.prototype
}


/**
 * @constructor
 */
WebInspector.TracingModel.NamedObject = function()
{
}

WebInspector.TracingModel.NamedObject.prototype =
{
    /**
     * @param {string} name
     */
    _setName: function(name)
    {
        this._name = name;
    },

    /**
     * @return {string}
     */
    name: function()
    {
        return this._name;
    },

    /**
     * @param {number} sortIndex
     */
    _setSortIndex: function(sortIndex)
    {
        this._sortIndex = sortIndex;
    },
}

/**
 * @param {!Array.<!WebInspector.TracingModel.NamedObject>} array
 */
WebInspector.TracingModel.NamedObject._sort = function(array)
{
    /**
     * @param {!WebInspector.TracingModel.NamedObject} a
     * @param {!WebInspector.TracingModel.NamedObject} b
     */
    function comparator(a, b)
    {
        return a._sortIndex !== b._sortIndex ? a._sortIndex - b._sortIndex : a.name().localeCompare(b.name());
    }
    return array.sort(comparator);
}

/**
 * @constructor
 * @extends {WebInspector.TracingModel.NamedObject}
 * @param {number} id
 */
WebInspector.TracingModel.Process = function(id)
{
    WebInspector.TracingModel.NamedObject.call(this);
    this._setName("Process " + id);
    this._id = id;
    /** @type {!Object.<number, !WebInspector.TracingModel.Thread>} */
    this._threads = {};
    this._threadByName = new Map();
    this._objects = {};
    /** @type {!Array.<!WebInspector.TracingModel.Event>} */
    this._asyncEvents = [];
    /** @type {!Object.<string, ?Array.<!WebInspector.TracingModel.Event>>} */
    this._openAsyncEvents = {};
    /** @type {!Object.<string, !Array.<!WebInspector.TracingModel.Event>>} */
    this._openNestableAsyncEvents = {};
}

WebInspector.TracingModel.Process.prototype = {
    /**
     * @return {number}
     */
    id: function()
    {
        return this._id;
    },

    /**
     * @param {number} id
     * @return {!WebInspector.TracingModel.Thread}
     */
    threadById: function(id)
    {
        var thread = this._threads[id];
        if (!thread) {
            thread = new WebInspector.TracingModel.Thread(this, id);
            this._threads[id] = thread;
        }
        return thread;
    },

    /**
     * @param {string} name
     * @return {?WebInspector.TracingModel.Thread}
     */
    threadByName: function(name)
    {
        return this._threadByName.get(name);
    },

    /**
     * @param {string} name
     * @param {!WebInspector.TracingModel.Thread} thread
     */
    _setThreadByName: function(name, thread)
    {
        this._threadByName.set(name, thread);
    },

    /**
     * @param {!WebInspector.TracingManager.EventPayload} payload
     * @return {?WebInspector.TracingModel.Event} event
     */
    _addEvent: function(payload)
    {
        var phase = WebInspector.TracingModel.Phase;

        var event = this.threadById(payload.tid)._addEvent(payload);
        if (!event)
            return null;
        // Build async event when we've got events from all threads, so we can sort them and process in the chronological order.
        // However, also add individual async events to the thread flow (above), so we can easily display them on the same chart as
        // other events, should we choose so.
        if (WebInspector.TracingModel.isAsyncPhase(payload.ph))
            this._asyncEvents.push(event);
        if (payload.ph === phase.SnapshotObject)
            this.objectsByName(event.name).push(event);
        return event;
    },

    /**
     * @param {number} lastEventTimeMs
     */
    _tracingComplete: function(lastEventTimeMs)
    {
        this._asyncEvents.sort(WebInspector.TracingModel.Event.compareStartTime);
        for (var i = 0; i < this._asyncEvents.length; ++i) {
            var event = this._asyncEvents[i];
            if (WebInspector.TracingModel.isNestableAsyncPhase(event.phase))
                this._addNestableAsyncEvent(event);
            else
                this._addAsyncEvent(event);
        }

        for (var key in this._openAsyncEvents) {
            var steps = this._openAsyncEvents[key];
            if (!steps)
                continue;
            var startEvent = steps[0];
            var syntheticEndEvent = new WebInspector.TracingModel.Event(startEvent.category, startEvent.name, WebInspector.TracingModel.Phase.AsyncEnd, lastEventTimeMs, startEvent.thread);
            steps.push(syntheticEndEvent);
            startEvent.setEndTime(lastEventTimeMs)
        }
        for (var key in this._openNestableAsyncEvents) {
            var openEvents = this._openNestableAsyncEvents[key];
            while (openEvents.length)
                openEvents.pop().setEndTime(lastEventTimeMs);
        }
        this._asyncEvents = [];
        this._openAsyncEvents = {};
        this._openNestableAsyncEvents = {};
    },

    /**
     * @param {!WebInspector.TracingModel.Event} event
     */
    _addNestableAsyncEvent: function(event)
    {
        var phase = WebInspector.TracingModel.Phase;
        var key = event.category + "." + event.id;
        var openEventsStack = this._openNestableAsyncEvents[key];

        switch (event.phase) {
        case phase.NestableAsyncBegin:
            if (!openEventsStack) {
                openEventsStack = [];
                this._openNestableAsyncEvents[key] = openEventsStack;
            }
            openEventsStack.push(event);
            // fall-through intended
        case phase.NestableAsyncInstant:
            event.thread._addAsyncEventSteps([event]);
            break;
        case phase.NestableAsyncEnd:
            if (!openEventsStack)
                break;
            var top = openEventsStack.pop();
            if (top.name !== event.name) {
                console.error("Begin/end event mismatch for nestable async event, " + top.name + " vs. " + event.name);
                break;
            }
            top.setEndTime(event.startTime);
        }
    },

    /**
     * @param {!WebInspector.TracingModel.Event} event
     */
    _addAsyncEvent: function(event)
    {
        var phase = WebInspector.TracingModel.Phase;
        var key = event.category + "." + event.name + "." + event.id;
        var steps = this._openAsyncEvents[key];

        if (event.phase === phase.AsyncBegin) {
            if (steps) {
                console.error("Event " + event.name + " has already been started");
                return;
            }
            steps = [event];
            this._openAsyncEvents[key] = steps;
            event.thread._addAsyncEventSteps(steps);
            return;
        }
        if (!steps) {
            console.error("Unexpected async event " + event.name + ", phase " + event.phase);
            return;
        }
        if (event.phase === phase.AsyncEnd) {
            steps.push(event);
            steps[0].setEndTime(event.startTime);
            delete this._openAsyncEvents[key];
        } else if (event.phase === phase.AsyncStepInto || event.phase === phase.AsyncStepPast) {
            var lastPhase = steps.peekLast().phase;
            if (lastPhase !== phase.AsyncBegin && lastPhase !== event.phase) {
                console.assert(false, "Async event step phase mismatch: " + lastPhase + " at " + steps.peekLast().startTime + " vs. " + event.phase + " at " + event.startTime);
                return;
            }
            steps.push(event);
        } else {
            console.assert(false, "Invalid async event phase");
        }
    },

    /**
     * @param {string} name
     * @return {!Array.<!WebInspector.TracingModel.Event>}
     */
    objectsByName: function(name)
    {
        var objects = this._objects[name];
        if (!objects) {
            objects = [];
            this._objects[name] = objects;
        }
        return objects;
    },

    /**
     * @return {!Array.<string>}
     */
    sortedObjectNames: function()
    {
        return Object.keys(this._objects).sort();
    },

    /**
     * @return {!Array.<!WebInspector.TracingModel.Thread>}
     */
    sortedThreads: function()
    {
        return WebInspector.TracingModel.NamedObject._sort(Object.values(this._threads));
    },

    __proto__: WebInspector.TracingModel.NamedObject.prototype
}

/**
 * @constructor
 * @extends {WebInspector.TracingModel.NamedObject}
 * @param {!WebInspector.TracingModel.Process} process
 * @param {number} id
 */
WebInspector.TracingModel.Thread = function(process, id)
{
    WebInspector.TracingModel.NamedObject.call(this);
    this._process = process;
    this._setName("Thread " + id);
    this._events = [];
    this._asyncEvents = [];
    this._id = id;

    this._stack = [];
}

WebInspector.TracingModel.Thread.prototype = {
    /**
     * @return {?WebInspector.Target}
     */
    target: function()
    {
        //FIXME: correctly specify target
        if (this.name() === "CrRendererMain")
            return WebInspector.targetManager.targets()[0] || null;
        else
            return null;
    },

    /**
     * @param {!WebInspector.TracingManager.EventPayload} payload
     * @return {?WebInspector.TracingModel.Event} event
     */
    _addEvent: function(payload)
    {
        var timestamp = payload.ts / 1000;
        if (payload.ph === WebInspector.TracingModel.Phase.End) {
            // Quietly ignore unbalanced close events, they're legit (we could have missed start one).
            if (!this._stack.length)
                return null;
            var top = this._stack.pop();
            if (top.name !== payload.name || top.category !== payload.cat)
                console.error("B/E events mismatch at " + top.startTime + " (" + top.name + ") vs. " + timestamp + " (" + payload.name + ")");
            else
                top._complete(payload);
            return null;
        }
        var event = payload.ph === WebInspector.TracingModel.Phase.SnapshotObject
            ? WebInspector.TracingModel.ObjectSnapshot.fromPayload(payload, this)
            : WebInspector.TracingModel.Event.fromPayload(payload, this);
        if (payload.ph === WebInspector.TracingModel.Phase.Begin)
            this._stack.push(event);
        if (this._events.length && this._events.peekLast().startTime > event.startTime)
            console.assert(false, "Event is out of order: " + event.name);
        this._events.push(event);
        return event;
    },

    /**
     * @param {!Array.<!WebInspector.TracingModel.Event>} eventSteps
     */
    _addAsyncEventSteps: function(eventSteps)
    {
        this._asyncEvents.push(eventSteps);
    },

    /**
     * @override
     * @param {string} name
     */
    _setName: function(name)
    {
        WebInspector.TracingModel.NamedObject.prototype._setName.call(this, name);
        this._process._setThreadByName(name, this);
    },

    /**
     * @return {number}
     */
    id: function()
    {
        return this._id;
    },

    /**
     * @return {!WebInspector.TracingModel.Process}
     */
    process: function()
    {
        return this._process;
    },

    /**
     * @return {!Array.<!WebInspector.TracingModel.Event>}
     */
    events: function()
    {
        return this._events;
    },

    /**
     * @return {!Array.<!WebInspector.TracingModel.Event>}
     */
    asyncEvents: function()
    {
        return this._asyncEvents;
    },

    __proto__: WebInspector.TracingModel.NamedObject.prototype
}
