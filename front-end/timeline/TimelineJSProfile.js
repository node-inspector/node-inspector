// Copyright 2014 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.


WebInspector.TimelineJSProfileProcessor = { };

/**
 * @param {!ProfilerAgent.CPUProfile} jsProfile
 * @param {!WebInspector.TracingModel.Thread} thread
 * @return {!Array<!WebInspector.TracingModel.Event>}
 */
WebInspector.TimelineJSProfileProcessor.generateTracingEventsFromCpuProfile = function(jsProfile, thread)
{
    if (!jsProfile.samples)
        return [];
    var jsProfileModel = new WebInspector.CPUProfileDataModel(jsProfile);
    var idleNode = jsProfileModel.idleNode;
    var programNode = jsProfileModel.programNode;
    var gcNode = jsProfileModel.gcNode;
    var samples = jsProfileModel.samples;
    var timestamps = jsProfileModel.timestamps;
    var jsEvents = [];
    for (var i = 0; i < samples.length; ++i) {
        var node = jsProfileModel.nodeByIndex(i);
        if (node === programNode || node === gcNode || node === idleNode)
            continue;
        var stackTrace = node._stackTraceArray;
        if (!stackTrace) {
            stackTrace = /** @type {!ConsoleAgent.StackTrace} */ (new Array(node.depth + 1));
            node._stackTraceArray = stackTrace;
            for (var j = 0; node.parent; node = node.parent)
                stackTrace[j++] = /** @type {!ConsoleAgent.CallFrame} */ (node);
        }
        var jsEvent = new WebInspector.TracingModel.Event(WebInspector.TracingModel.DevToolsTimelineEventCategory, WebInspector.TimelineModel.RecordType.JSSample,
            WebInspector.TracingModel.Phase.Instant, timestamps[i], thread);
        jsEvent.args["data"] = { stackTrace: stackTrace };
        jsEvents.push(jsEvent);
    }
    return jsEvents;
}

/**
 * @param {!Array<!WebInspector.TracingModel.Event>} events
 * @return {!Array<!WebInspector.TracingModel.Event>}
 */
WebInspector.TimelineJSProfileProcessor.generateJSFrameEvents = function(events)
{
    /**
     * @param {!ConsoleAgent.CallFrame} frame1
     * @param {!ConsoleAgent.CallFrame} frame2
     * @return {boolean}
     */
    function equalFrames(frame1, frame2)
    {
        return frame1.scriptId === frame2.scriptId && frame1.functionName === frame2.functionName;
    }

    /**
     * @param {!WebInspector.TracingModel.Event} e
     * @return {number}
     */
    function eventEndTime(e)
    {
        return e.endTime || e.startTime;
    }

    /**
     * @param {!WebInspector.TracingModel.Event} e
     * @return {boolean}
     */
    function isJSInvocationEvent(e)
    {
        switch (e.name) {
        case WebInspector.TimelineModel.RecordType.FunctionCall:
        case WebInspector.TimelineModel.RecordType.EvaluateScript:
            return true;
        }
        return false;
    }

    var jsFrameEvents = [];
    var jsFramesStack = [];
    var lockedJsStackDepth = [];
    var currentSamplingIntervalMs = 0.1;
    var lastStackSampleTime = 0;
    var ordinal = 0;
    var filterNativeFunctions = !WebInspector.moduleSetting("showNativeFunctionsInJSProfile").get();

    /**
     * @param {!WebInspector.TracingModel.Event} e
     */
    function updateSamplingInterval(e)
    {
        if (e.name !== WebInspector.TimelineModel.RecordType.JSSample)
            return;
        var time = e.startTime;
        var interval = time - lastStackSampleTime;
        lastStackSampleTime = time;
        // Do not take into account intervals longer than 10ms.
        if (!interval || interval > 10)
            return;
        // Use exponential moving average with a smoothing factor of 0.1
        var alpha = 0.1;
        currentSamplingIntervalMs += alpha * (interval - currentSamplingIntervalMs);
    }

    /**
     * @param {!WebInspector.TracingModel.Event} e
     */
    function onStartEvent(e)
    {
        e.ordinal = ++ordinal;
        extractStackTrace(e);
        // For the duration of the event we cannot go beyond the stack associated with it.
        lockedJsStackDepth.push(jsFramesStack.length);
    }

    /**
     * @param {!WebInspector.TracingModel.Event} e
     * @param {?WebInspector.TracingModel.Event} parent
     */
    function onInstantEvent(e, parent)
    {
        e.ordinal = ++ordinal;
        updateSamplingInterval(e);
        if (parent && isJSInvocationEvent(parent))
            extractStackTrace(e);
    }

    /**
     * @param {!WebInspector.TracingModel.Event} e
     */
    function onEndEvent(e)
    {
        truncateJSStack(lockedJsStackDepth.pop(), e.endTime);
    }

    /**
     * @param {number} depth
     * @param {number} time
     */
    function truncateJSStack(depth, time)
    {
        if (lockedJsStackDepth.length) {
            var lockedDepth = lockedJsStackDepth.peekLast();
            if (depth < lockedDepth) {
                console.error("Child stack is shallower (" + depth + ") than the parent stack (" + lockedDepth + ") at " + time);
                depth = lockedDepth;
            }
        }
        if (jsFramesStack.length < depth) {
            console.error("Trying to truncate higher than the current stack size at " + time);
            depth = jsFramesStack.length;
        }
        var minFrameDurationMs = currentSamplingIntervalMs / 2;
        for (var k = depth; k < jsFramesStack.length; ++k)
            jsFramesStack[k].setEndTime(Math.min(eventEndTime(jsFramesStack[k]) + minFrameDurationMs, time));
        jsFramesStack.length = depth;
    }

    /**
     * @param {!Array<!ConsoleAgent.CallFrame>} stack
     */
    function filterStackFrames(stack)
    {
        for (var i = 0, j = 0; i < stack.length; ++i) {
            var url = stack[i].url;
            if (url && url.startsWith("native "))
                continue;
            stack[j++] = stack[i];
        }
        stack.length = j;
    }

    /**
     * @param {!WebInspector.TracingModel.Event} e
     */
    function extractStackTrace(e)
    {
        var eventData = e.args["data"] || e.args["beginData"];
        var stackTrace = eventData && eventData["stackTrace"];
        var recordTypes = WebInspector.TimelineModel.RecordType;
        // GC events do not hold call stack, so make a copy of the current stack.
        if (e.name === recordTypes.GCEvent || e.name === recordTypes.MajorGC || e.name === recordTypes.MinorGC)
            stackTrace = jsFramesStack.map(function(frameEvent) { return frameEvent.args["data"]; }).reverse();
        if (!stackTrace)
            return;
        if (filterNativeFunctions)
            filterStackFrames(stackTrace);
        var endTime = eventEndTime(e);
        var numFrames = stackTrace.length;
        var minFrames = Math.min(numFrames, jsFramesStack.length);
        var i;
        for (i = lockedJsStackDepth.peekLast() || 0; i < minFrames; ++i) {
            var newFrame = stackTrace[numFrames - 1 - i];
            var oldFrame = jsFramesStack[i].args["data"];
            if (!equalFrames(newFrame, oldFrame))
                break;
            jsFramesStack[i].setEndTime(Math.max(jsFramesStack[i].endTime, endTime));
        }
        truncateJSStack(i, e.startTime);
        for (; i < numFrames; ++i) {
            var frame = stackTrace[numFrames - 1 - i];
            var jsFrameEvent = new WebInspector.TracingModel.Event(WebInspector.TracingModel.DevToolsTimelineEventCategory, WebInspector.TimelineModel.RecordType.JSFrame,
                WebInspector.TracingModel.Phase.Complete, e.startTime, e.thread);
            jsFrameEvent.ordinal = e.ordinal;
            jsFrameEvent.addArgs({ data: frame });
            jsFrameEvent.setEndTime(endTime);
            jsFramesStack.push(jsFrameEvent);
            jsFrameEvents.push(jsFrameEvent);
        }
    }

    WebInspector.TimelineModel.forEachEvent(events, onStartEvent, onEndEvent, onInstantEvent);
    return jsFrameEvents;
}

/**
 * @constructor
 */
WebInspector.TimelineJSProfileProcessor.CodeMap = function()
{
    /** @type {!Map<string, !WebInspector.TimelineJSProfileProcessor.CodeMap.Bank>} */
    this._banks = new Map();
}

/**
 * @constructor
 * @param {number} address
 * @param {number} size
 * @param {!ConsoleAgent.CallFrame} callFrame
 */
WebInspector.TimelineJSProfileProcessor.CodeMap.Entry = function(address, size, callFrame)
{
    this.address = address;
    this.size = size;
    this.callFrame = callFrame;
}

/**
 * @param {number} address
 * @param {!WebInspector.TimelineJSProfileProcessor.CodeMap.Entry} entry
 * @return {number}
 */
WebInspector.TimelineJSProfileProcessor.CodeMap.comparator = function(address, entry)
{
    return address - entry.address;
}

WebInspector.TimelineJSProfileProcessor.CodeMap.prototype = {
    /**
     * @param {string} addressHex
     * @param {number} size
     * @param {!ConsoleAgent.CallFrame} callFrame
     */
    addEntry: function(addressHex, size, callFrame)
    {
        var entry = new WebInspector.TimelineJSProfileProcessor.CodeMap.Entry(this._getAddress(addressHex), size, callFrame);
        this._addEntry(addressHex, entry);
    },

    /**
     * @param {string} oldAddressHex
     * @param {string} newAddressHex
     * @param {number} size
     */
    moveEntry: function(oldAddressHex, newAddressHex, size)
    {
        var entry = this._getBank(oldAddressHex).removeEntry(this._getAddress(oldAddressHex));
        if (!entry) {
            console.error("Entry at address " + oldAddressHex + " not found");
            return;
        }
        entry.address = this._getAddress(newAddressHex);
        entry.size = size;
        this._addEntry(newAddressHex, entry);
    },

    /**
     * @param {string} addressHex
     * @return {?ConsoleAgent.CallFrame}
     */
    lookupEntry: function(addressHex)
    {
        return this._getBank(addressHex).lookupEntry(this._getAddress(addressHex));
    },

    /**
     * @param {string} addressHex
     * @param {!WebInspector.TimelineJSProfileProcessor.CodeMap.Entry} entry
     */
    _addEntry: function(addressHex, entry)
    {
        // FIXME: deal with entries that span across [multiple] banks.
        this._getBank(addressHex).addEntry(entry);
    },

    /**
     * @param {string} addressHex
     * @return {!WebInspector.TimelineJSProfileProcessor.CodeMap.Bank}
     */
    _getBank: function(addressHex)
    {
        addressHex = addressHex.slice(2);  // cut 0x prefix.
        // 13 hex digits == 52 bits, double mantissa fits 53 bits.
        var /** @const */ bankSizeHexDigits = 13;
        var /** @const */ maxHexDigits = 16;
        var bankName = addressHex.slice(-maxHexDigits, -bankSizeHexDigits);
        var bank = this._banks.get(bankName);
        if (!bank) {
            bank = new WebInspector.TimelineJSProfileProcessor.CodeMap.Bank();
            this._banks.set(bankName, bank);
        }
        return bank;
    },

    /**
     * @param {string} addressHex
     * @return {number}
     */
    _getAddress: function(addressHex)
    {
        // 13 hex digits == 52 bits, double mantissa fits 53 bits.
        var /** @const */ bankSizeHexDigits = 13;
        addressHex = addressHex.slice(2);  // cut 0x prefix.
        return parseInt(addressHex.slice(-bankSizeHexDigits), 16);
    }
}

/**
 * @constructor
 */
WebInspector.TimelineJSProfileProcessor.CodeMap.Bank = function()
{
    /** @type {!Array<!WebInspector.TimelineJSProfileProcessor.CodeMap.Entry>} */
    this._entries = [];
}

WebInspector.TimelineJSProfileProcessor.CodeMap.Bank.prototype = {
    /**
     * @param {number} address
     * @return {?WebInspector.TimelineJSProfileProcessor.CodeMap.Entry}
     */
    removeEntry: function(address)
    {
        var index = this._entries.lowerBound(address, WebInspector.TimelineJSProfileProcessor.CodeMap.comparator);
        var entry = this._entries[index];
        if (!entry || entry.address !== address)
            return null;
        this._entries.splice(index, 1);
        return entry;
    },

    /**
     * @param {number} address
     * @return {?ConsoleAgent.CallFrame}
     */
    lookupEntry: function(address)
    {
        var index = this._entries.upperBound(address, WebInspector.TimelineJSProfileProcessor.CodeMap.comparator) - 1;
        var entry = this._entries[index];
        return entry && address < entry.address + entry.size ? entry.callFrame : null;
    },

    /**
     * @param {!WebInspector.TimelineJSProfileProcessor.CodeMap.Entry} newEntry
     */
    addEntry: function(newEntry)
    {
        var endAddress = newEntry.address + newEntry.size;
        var lastIndex = this._entries.lowerBound(endAddress, WebInspector.TimelineJSProfileProcessor.CodeMap.comparator);
        var index;
        for (index = lastIndex - 1; index >= 0; --index) {
            var entry = this._entries[index];
            var entryEndAddress = entry.address + entry.size;
            if (entryEndAddress <= newEntry.address)
                break;
        }
        ++index;
        this._entries.splice(index, lastIndex - index, newEntry);
    }
}

/**
 * @param {string} name
 * @param {number} scriptId
 * @return {!ConsoleAgent.CallFrame}
 */
WebInspector.TimelineJSProfileProcessor._buildCallFrame = function(name, scriptId)
{
    /**
     * @param {string} functionName
     * @param {string=} url
     * @param {string=} scriptId
     * @param {number=} line
     * @param {number=} column
     * @param {boolean=} isNative
     * @return {!ConsoleAgent.CallFrame}
     */
    function createFrame(functionName, url, scriptId, line, column, isNative)
    {
        return /** @type {!ConsoleAgent.CallFrame} */ ({
            "functionName": functionName,
            "url": url || "",
            "scriptId": scriptId || "0",
            "lineNumber": line || 0,
            "columnNumber": column || 0,
            "isNative": isNative || false
        });
    }

    // Code states:
    // (empty) -> compiled
    //    ~    -> optimizable
    //    *    -> optimized
    var rePrefix = /^(\w*:)?[*~]?(.*)$/m;
    var tokens = rePrefix.exec(name);
    var prefix = tokens[1];
    var body = tokens[2];
    var rawName;
    var rawUrl;
    if (prefix === "Script:") {
        rawName = "";
        rawUrl = body;
    } else {
        var spacePos = body.lastIndexOf(" ");
        rawName = spacePos !== -1 ? body.substr(0, spacePos) : body;
        rawUrl = spacePos !== -1 ? body.substr(spacePos + 1) : "";
    }
    var nativeSuffix = " native";
    var isNative = rawName.endsWith(nativeSuffix);
    var functionName = isNative ? rawName.slice(0, -nativeSuffix.length) : rawName;
    var urlData = WebInspector.ParsedURL.splitLineAndColumn(rawUrl);
    var url = urlData.url || "";
    var line = urlData.lineNumber || 0;
    var column = urlData.columnNumber || 0;
    return createFrame(functionName, url, String(scriptId), line, column, isNative);
}

/**
 * @param {!Array<!WebInspector.TracingModel.Event>} events
 * @return {!Array<!WebInspector.TracingModel.Event>}
 */
WebInspector.TimelineJSProfileProcessor.processRawV8Samples = function(events)
{
    var missingAddesses = new Set();

    /**
     * @param {string} address
     * @return {?ConsoleAgent.CallFrame}
     */
    function convertRawFrame(address)
    {
        var entry = codeMap.lookupEntry(address);
        if (entry)
            return entry.isNative ? null : entry;
        if (!missingAddesses.has(address)) {
            missingAddesses.add(address);
            console.error("Address " + address + " has missing code entry");
        }
        return null;
    }

    var recordTypes = WebInspector.TimelineModel.RecordType;
    var samples = [];
    var codeMap = new WebInspector.TimelineJSProfileProcessor.CodeMap();
    for (var i = 0; i < events.length; ++i) {
        var e = events[i];
        var data = e.args["data"];
        switch (e.name) {
        case recordTypes.JitCodeAdded:
            var frame = WebInspector.TimelineJSProfileProcessor._buildCallFrame(data["name"], data["script_id"]);
            codeMap.addEntry(data["code_start"], data["code_len"], frame);
            break;
        case recordTypes.JitCodeMoved:
            codeMap.moveEntry(data["code_start"], data["new_code_start"], data["code_len"]);
            break;
        case recordTypes.V8Sample:
            var rawStack = data["stack"];
            // Sometimes backend fails to collect a stack and returns an empty stack.
            // Skip these bogus samples.
            if (data["vm_state"] === "js" && !rawStack.length)
                break;
            var stack = rawStack.map(convertRawFrame);
            stack.remove(null);
            var sampleEvent = new WebInspector.TracingModel.Event(
                WebInspector.TracingModel.DevToolsTimelineEventCategory,
                WebInspector.TimelineModel.RecordType.JSSample,
                WebInspector.TracingModel.Phase.Instant, e.startTime, e.thread);
            sampleEvent.ordinal = e.ordinal;
            sampleEvent.args = {"data": {"stackTrace": stack }};
            samples.push(sampleEvent);
            break;
        }
    }

    return samples;
}
