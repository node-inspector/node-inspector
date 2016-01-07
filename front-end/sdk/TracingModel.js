/*
 * Copyright 2014 The Chromium Authors. All rights reserved.
 * Use of this source code is governed by a BSD-style license that can be
 * found in the LICENSE file.
 */

/**
 * @constructor
 * @param {!WebInspector.BackingStorage} backingStorage
 */
WebInspector.TracingModel = function(backingStorage)
{
    this.reset();
    // Set backing storage after reset so that we do not perform
    // an extra reset of backing storage -- this is not free.
    this._backingStorage = backingStorage;
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
    NestableAsyncInstant: "n",
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

WebInspector.TracingModel.TopLevelEventCategory = "toplevel";
WebInspector.TracingModel.DevToolsMetadataEventCategory = "disabled-by-default-devtools.timeline";
WebInspector.TracingModel.DevToolsTimelineEventCategory = "disabled-by-default-devtools.timeline";

WebInspector.TracingModel.ConsoleEventCategory = "blink.console";

WebInspector.TracingModel.FrameLifecycleEventCategory = "cc,devtools";

WebInspector.TracingModel._nestableAsyncEventsString =
    WebInspector.TracingModel.Phase.NestableAsyncBegin +
    WebInspector.TracingModel.Phase.NestableAsyncEnd +
    WebInspector.TracingModel.Phase.NestableAsyncInstant;

WebInspector.TracingModel._legacyAsyncEventsString =
    WebInspector.TracingModel.Phase.AsyncBegin +
    WebInspector.TracingModel.Phase.AsyncEnd +
    WebInspector.TracingModel.Phase.AsyncStepInto +
    WebInspector.TracingModel.Phase.AsyncStepPast;

WebInspector.TracingModel._flowEventsString =
    WebInspector.TracingModel.Phase.FlowBegin +
    WebInspector.TracingModel.Phase.FlowStep +
    WebInspector.TracingModel.Phase.FlowEnd;

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

/**
 * @param {string} phase
 * @return {boolean}
 */
WebInspector.TracingModel.isFlowPhase = function(phase)
{
    return WebInspector.TracingModel._flowEventsString.indexOf(phase) >= 0;
}

/**
 * @param {!WebInspector.TracingModel.Event} event
 * @return {boolean}
 */
WebInspector.TracingModel.isTopLevelEvent = function(event)
{
    return event.hasCategory(WebInspector.TracingModel.TopLevelEventCategory) ||
        event.hasCategory(WebInspector.TracingModel.DevToolsMetadataEventCategory) && event.name === "Program"; // Older timelines may have this instead of toplevel.
}

/**
 * @interface
 */
WebInspector.BackingStorage = function()
{
}

WebInspector.BackingStorage.prototype = {
    /**
     * @param {string} string
     */
    appendString: function(string) { },

    /**
     * @param {string} string
     * @return {function():!Promise.<?string>}
     */
    appendAccessibleString: function(string) { },

    finishWriting: function() { },

    reset: function() { },
}


WebInspector.TracingModel.prototype = {
    /**
     * @return {!Array.<!WebInspector.TracingModel.Event>}
     */
    devToolsMetadataEvents: function()
    {
        return this._devToolsMetadataEvents;
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
        this._processPendingAsyncEvents();
        this._backingStorage.finishWriting();
        for (var process of Object.values(this._processById)) {
            for (var thread of Object.values(process._threads))
                thread.tracingComplete();
        }
    },

    reset: function()
    {
        /** @type {!Object.<(number|string), !WebInspector.TracingModel.Process>} */
        this._processById = {};
        this._processByName = new Map();
        this._minimumRecordTime = 0;
        this._maximumRecordTime = 0;
        this._devToolsMetadataEvents = [];
        if (this._backingStorage)
            this._backingStorage.reset();
        this._appendDelimiter = false;
        /** @type {!Array<!WebInspector.TracingModel.Event>} */
        this._asyncEvents = [];
        /** @type {!Map<string, !WebInspector.TracingModel.AsyncEvent>} */
        this._openAsyncEvents = new Map();
        /** @type {!Map<string, !Array<!WebInspector.TracingModel.AsyncEvent>>} */
        this._openNestableAsyncEvents = new Map();
        /** @type {!Map<string, !Set<string>>} */
        this._parsedCategories = new Map();
    },

    /**
      * @param {!WebInspector.TracingManager.EventPayload} payload
      */
    _addEvent: function(payload)
    {
        var process = this._processById[payload.pid];
        if (!process) {
            process = new WebInspector.TracingModel.Process(this, payload.pid);
            this._processById[payload.pid] = process;
        }

        var eventsDelimiter = ",\n";
        if (this._appendDelimiter)
            this._backingStorage.appendString(eventsDelimiter);
        this._appendDelimiter = true;
        var stringPayload = JSON.stringify(payload);
        var isAccessible = payload.ph === WebInspector.TracingModel.Phase.SnapshotObject;
        var backingStorage = null;
        var keepStringsLessThan = 10000;
        if (isAccessible && stringPayload.length > keepStringsLessThan)
            backingStorage = this._backingStorage.appendAccessibleString(stringPayload);
        else
            this._backingStorage.appendString(stringPayload);

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
            // Build async event when we've got events from all threads & processes, so we can sort them and process in the
            // chronological order. However, also add individual async events to the thread flow (above), so we can easily
            // display them on the same chart as other events, should we choose so.
            if (WebInspector.TracingModel.isAsyncPhase(payload.ph))
                this._asyncEvents.push(event);
            event._setBackingStorage(backingStorage);
            if (event.hasCategory(WebInspector.TracingModel.DevToolsMetadataEventCategory))
                this._devToolsMetadataEvents.push(event);
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

    _processPendingAsyncEvents: function()
    {
        this._asyncEvents.sort(WebInspector.TracingModel.Event.compareStartTime);
        for (var i = 0; i < this._asyncEvents.length; ++i) {
            var event = this._asyncEvents[i];
            if (WebInspector.TracingModel.isNestableAsyncPhase(event.phase))
                this._addNestableAsyncEvent(event);
            else
                this._addAsyncEvent(event);
        }
        this._asyncEvents = [];
        this._closeOpenAsyncEvents();
    },

    _closeOpenAsyncEvents: function()
    {
        for (var event of this._openAsyncEvents.values()) {
            event.setEndTime(this._maximumRecordTime);
            // FIXME: remove this once we figure a better way to convert async console
            // events to sync [waterfall] timeline records.
            event.steps[0].setEndTime(this._maximumRecordTime);
        }
        this._openAsyncEvents.clear();

        for (var eventStack of this._openNestableAsyncEvents.values()) {
            while (eventStack.length)
                eventStack.pop().setEndTime(this._maximumRecordTime);
        }
        this._openNestableAsyncEvents.clear();
    },

    /**
     * @param {!WebInspector.TracingModel.Event} event
     */
    _addNestableAsyncEvent: function(event)
    {
        var phase = WebInspector.TracingModel.Phase;
        var key = event.categoriesString + "." + event.id;
        var openEventsStack = this._openNestableAsyncEvents.get(key);

        switch (event.phase) {
        case phase.NestableAsyncBegin:
            if (!openEventsStack) {
                openEventsStack = [];
                this._openNestableAsyncEvents.set(key, openEventsStack);
            }
            var asyncEvent = new WebInspector.TracingModel.AsyncEvent(event);
            openEventsStack.push(asyncEvent);
            event.thread._addAsyncEvent(asyncEvent);
            break;

        case phase.NestableAsyncInstant:
            if (openEventsStack && openEventsStack.length)
                openEventsStack.peekLast()._addStep(event);
            break;

        case phase.NestableAsyncEnd:
            if (!openEventsStack || !openEventsStack.length)
                break;
            var top = openEventsStack.pop();
            if (top.name !== event.name) {
                console.error("Begin/end event mismatch for nestable async event, " + top.name + " vs. " + event.name);
                break;
            }
            top._addStep(event);
        }
    },

    /**
     * @param {!WebInspector.TracingModel.Event} event
     */
    _addAsyncEvent: function(event)
    {
        var phase = WebInspector.TracingModel.Phase;
        var key = event.categoriesString + "." + event.name + "." + event.id;
        var asyncEvent = this._openAsyncEvents.get(key);

        if (event.phase === phase.AsyncBegin) {
            if (asyncEvent) {
                console.error("Event " + event.name + " has already been started");
                return;
            }
            asyncEvent = new WebInspector.TracingModel.AsyncEvent(event);
            this._openAsyncEvents.set(key, asyncEvent);
            event.thread._addAsyncEvent(asyncEvent);
            return;
        }
        if (!asyncEvent) {
            // Quietly ignore stray async events, we're probably too late for the start.
            return;
        }
        if (event.phase === phase.AsyncEnd) {
            asyncEvent._addStep(event);
            this._openAsyncEvents.delete(key);
            return;
        }
        if (event.phase === phase.AsyncStepInto || event.phase === phase.AsyncStepPast) {
            var lastStep = asyncEvent.steps.peekLast();
            if (lastStep.phase !== phase.AsyncBegin && lastStep.phase !== event.phase) {
                console.assert(false, "Async event step phase mismatch: " + lastStep.phase + " at " + lastStep.startTime + " vs. " + event.phase + " at " + event.startTime);
                return;
            }
            asyncEvent._addStep(event);
            return;
        }
        console.assert(false, "Invalid async event phase");
    },

    /**
     * @param {string} str
     * @return {!Set<string>}
     */
    _parsedCategoriesForString: function(str)
    {
        var parsedCategories = this._parsedCategories.get(str);
        if (!parsedCategories) {
            parsedCategories = new Set(str.split(","));
            this._parsedCategories.set(str, parsedCategories);
        }
        return parsedCategories;
    }
}

/**
 * @constructor
 * @param {string} categories
 * @param {string} name
 * @param {!WebInspector.TracingModel.Phase} phase
 * @param {number} startTime
 * @param {!WebInspector.TracingModel.Thread} thread
 */
WebInspector.TracingModel.Event = function(categories, name, phase, startTime, thread)
{
    /** @type {string} */
    this.categoriesString = categories;
    /** @type {!Set<string>} */
    this._parsedCategories = thread._model._parsedCategoriesForString(categories);
    /** @type {string} */
    this.name = name;
    /** @type {!WebInspector.TracingModel.Phase} */
    this.phase = phase;
    /** @type {number} */
    this.startTime = startTime;
    /** @type {!WebInspector.TracingModel.Thread} */
    this.thread = thread;
    /** @type {!Object} */
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
    this.url = null;
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
     * @param {string} categoryName
     * @return {boolean}
     */
    hasCategory: function(categoryName)
    {
        return this._parsedCategories.has(categoryName);
    },

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
     * @param {!WebInspector.TracingModel.Event} endEvent
     */
    _complete: function(endEvent)
    {
        if (endEvent.args)
            this.addArgs(endEvent.args);
        else
            console.error("Missing mandatory event argument 'args' at " + endEvent.startTime);
        this.setEndTime(endEvent.startTime);
    },

    /**
     * @param {?function():!Promise.<?string>} backingStorage
     */
    _setBackingStorage: function(backingStorage)
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
    return a.startTime - b.startTime || a.ordinal - b.ordinal || -1;
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
     * @param {function(?)} callback
     */
    requestObject: function(callback)
    {
        var snapshot = this.args["snapshot"];
        if (snapshot) {
            callback(snapshot);
            return;
        }
        this._backingStorage().then(onRead, callback.bind(null, null));
        /**
         * @param {?string} result
         */
        function onRead(result)
        {
            if (!result) {
                callback(null);
                return;
            }
            try {
                var payload = JSON.parse(result);
                callback(payload["args"]["snapshot"]);
            } catch (e) {
                WebInspector.console.error("Malformed event data in backing storage");
                callback(null);
            }
        }
    },

    /**
     * @return {!Promise<?>}
     */
    objectPromise: function()
    {
        if (!this._objectPromise)
            this._objectPromise = new Promise(this.requestObject.bind(this));
        return this._objectPromise;
    },

    /**
     * @override
     * @param {?function():!Promise.<?>} backingStorage
     */
    _setBackingStorage: function(backingStorage)
    {
        if (!backingStorage)
            return;
        this._backingStorage = backingStorage;
        this.args = {};
    },

    __proto__: WebInspector.TracingModel.Event.prototype
}

/**
 * @constructor
 * @param {!WebInspector.TracingModel.Event} startEvent
 * @extends {WebInspector.TracingModel.Event}
 */
WebInspector.TracingModel.AsyncEvent = function(startEvent)
{
    WebInspector.TracingModel.Event.call(this, startEvent.categoriesString, startEvent.name, startEvent.phase, startEvent.startTime, startEvent.thread)
    this.addArgs(startEvent.args);
    this.steps = [startEvent];
}

WebInspector.TracingModel.AsyncEvent.prototype = {
    /**
     * @param {!WebInspector.TracingModel.Event} event
     */
    _addStep: function(event)
    {
        this.steps.push(event)
        if (event.phase === WebInspector.TracingModel.Phase.AsyncEnd || event.phase === WebInspector.TracingModel.Phase.NestableAsyncEnd) {
            this.setEndTime(event.startTime);
            // FIXME: ideally, we shouldn't do this, but this makes the logic of converting
            // async console events to sync ones much simpler.
            this.steps[0].setEndTime(event.startTime);
        }
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
 * @param {!WebInspector.TracingModel} model
 * @param {number} id
 */
WebInspector.TracingModel.Process = function(model, id)
{
    WebInspector.TracingModel.NamedObject.call(this);
    this._setName("Process " + id);
    this._id = id;
    /** @type {!Object.<number, !WebInspector.TracingModel.Thread>} */
    this._threads = {};
    this._threadByName = new Map();
    this._model = model;
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
        return this._threadByName.get(name) || null;
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
        return this.threadById(payload.tid)._addEvent(payload);
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
    this._model = process._model;
}

WebInspector.TracingModel.Thread.prototype = {
    tracingComplete: function()
    {
        this._asyncEvents.stableSort(WebInspector.TracingModel.Event.compareStartTime);
        this._events.stableSort(WebInspector.TracingModel.Event.compareStartTime);
        var phases = WebInspector.TracingModel.Phase;
        var stack = [];
        for (var i = 0; i < this._events.length; ++i) {
            var e = this._events[i];
            e.ordinal = i;
            switch (e.phase) {
            case phases.End:
                this._events[i] = null;  // Mark for removal.
                // Quietly ignore unbalanced close events, they're legit (we could have missed start one).
                if (!stack.length)
                    continue;
                var top = stack.pop();
                if (top.name !== e.name || top.categoriesString !== e.categoriesString)
                    console.error("B/E events mismatch at " + top.startTime + " (" + top.name + ") vs. " + e.startTime + " (" + e.name + ")");
                else
                    top._complete(e);
                break;
            case phases.Begin:
                stack.push(e);
                break;
            }
        }
        this._events.remove(null, false);
    },

    /**
     * @param {!WebInspector.TracingManager.EventPayload} payload
     * @return {?WebInspector.TracingModel.Event} event
     */
    _addEvent: function(payload)
    {
        var event = payload.ph === WebInspector.TracingModel.Phase.SnapshotObject
            ? WebInspector.TracingModel.ObjectSnapshot.fromPayload(payload, this)
            : WebInspector.TracingModel.Event.fromPayload(payload, this);
        if (WebInspector.TracingModel.isTopLevelEvent(event)) {
            // Discard nested "top-level" events.
            if (this._lastTopLevelEvent && this._lastTopLevelEvent.endTime > event.startTime)
                return null;
            this._lastTopLevelEvent = event;
        }
        this._events.push(event);
        return event;
    },

    /**
     * @param {!WebInspector.TracingModel.AsyncEvent} asyncEvent
     */
    _addAsyncEvent: function(asyncEvent)
    {
        this._asyncEvents.push(asyncEvent);
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
     * @return {!Array.<!WebInspector.TracingModel.AsyncEvent>}
     */
    asyncEvents: function()
    {
        return this._asyncEvents;
    },

    __proto__: WebInspector.TracingModel.NamedObject.prototype
}
