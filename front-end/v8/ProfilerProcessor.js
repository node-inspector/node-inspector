/*
 * Copyright (C) 2010 Google Inc. All rights reserved.
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
 * @fileoverview Profiler processor is used to process log file produced
 * by V8 and produce an internal profile representation which is used
 * for building profile views in "Profiles" tab.
 */


/**
 * Creates a Profile View builder object compatible with WebKit Profiler UI.
 *
 * @param {number} samplingRate Number of ms between profiler ticks.
 * @constructor
 */
devtools.profiler.WebKitViewBuilder = function(samplingRate)
{
    devtools.profiler.ViewBuilder.call(this, samplingRate);
};
devtools.profiler.WebKitViewBuilder.prototype.__proto__ = devtools.profiler.ViewBuilder.prototype;


/**
 * @override
 */
devtools.profiler.WebKitViewBuilder.prototype.createViewNode = function(funcName, totalTime, selfTime, head)
{
    return new devtools.profiler.WebKitViewNode(funcName, totalTime, selfTime, head);
};


/**
 * Constructs a Profile View node object for displaying in WebKit Profiler UI.
 *
 * @param {string} internalFuncName A fully qualified function name.
 * @param {number} totalTime Amount of time that application spent in the
 *     corresponding function and its descendants (not that depending on
 *     profile they can be either callees or callers.)
 * @param {number} selfTime Amount of time that application spent in the
 *     corresponding function only.
 * @param {devtools.profiler.ProfileView.Node} head Profile view head.
 * @constructor
 */
devtools.profiler.WebKitViewNode = function(internalFuncName, totalTime, selfTime, head)
{
    devtools.profiler.ProfileView.Node.call(this, internalFuncName, totalTime, selfTime, head);
    this.initFuncInfo_();
    this.callUID = internalFuncName;
};
devtools.profiler.WebKitViewNode.prototype.__proto__ = devtools.profiler.ProfileView.Node.prototype;


/**
 * RegEx for stripping V8's prefixes of compiled functions.
 */
devtools.profiler.WebKitViewNode.FUNC_NAME_STRIP_RE = /^(?:LazyCompile|Function|Callback): (.*)$/;


/**
 * RegEx for extracting script source URL and line number.
 */
devtools.profiler.WebKitViewNode.FUNC_NAME_PARSE_RE = /^((?:get | set )?[^ ]+) (.*):(\d+)( \{\d+\})?$/;


/**
 * Inits "functionName", "url", and "lineNumber" fields using "internalFuncName"
 * field.
 * @private
 */
devtools.profiler.WebKitViewNode.prototype.initFuncInfo_ = function()
{
    var nodeAlias = devtools.profiler.WebKitViewNode;
    this.functionName = this.internalFuncName;

    var strippedName = nodeAlias.FUNC_NAME_STRIP_RE.exec(this.functionName);
    if (strippedName)
        this.functionName = strippedName[1];

    var parsedName = nodeAlias.FUNC_NAME_PARSE_RE.exec(this.functionName);
    if (parsedName) {
        this.functionName = parsedName[1];
        if (parsedName[4])
            this.functionName += parsedName[4];
        this.url = parsedName[2];
        this.lineNumber = parsedName[3];
    } else {
        this.url = '';
        this.lineNumber = 0;
    }
};


/**
 * Ancestor of a profile object that leaves out only JS-related functions.
 * @constructor
 */
devtools.profiler.JsProfile = function()
{
    devtools.profiler.Profile.call(this);
};
devtools.profiler.JsProfile.prototype.__proto__ = devtools.profiler.Profile.prototype;


/**
 * RegExp that leaves only non-native JS functions.
 * @type {RegExp}
 */
devtools.profiler.JsProfile.JS_NON_NATIVE_RE = new RegExp(
      "^" +
        "(?:Callback:)|" +
        "(?:Script: (?!native))|" +
        "(?:(?:LazyCompile|Function): [^ ]*(?: (?!native )[^ ]+:\\d+)?$)");


/**
 * @override
 */
devtools.profiler.JsProfile.prototype.skipThisFunction = function(name)
{
    return !devtools.profiler.JsProfile.JS_NON_NATIVE_RE.test(name);
};


/**
 * Profiler processor. Consumes profiler log and builds profile views.
 * FIXME: change field naming style to use trailing underscore.
 *
 * @param {function(devtools.profiler.ProfileView)} newProfileCallback Callback
 *     that receives a new processed profile.
 * @constructor
 */
devtools.profiler.Processor = function()
{
    var dispatches = {
        "code-creation": {
            parsers: [null, this.createAddressParser("code"), parseInt, null],
            processor: this.processCodeCreation_, backrefs: true,
            needsProfile: true },
        "code-move": { parsers: [this.createAddressParser("code"),
            this.createAddressParser("code-move-to")],
            processor: this.processCodeMove_, backrefs: true,
            needsProfile: true },
        "code-delete": { parsers: [this.createAddressParser("code")],
            processor: this.processCodeDelete_, backrefs: true,
            needsProfile: true },
        "function-creation": { parsers: [this.createAddressParser("code"),
            this.createAddressParser("function-obj")],
            processor: this.processFunctionCreation_, backrefs: true },
        "function-move": { parsers: [this.createAddressParser("code"),
            this.createAddressParser("code-move-to")],
            processor: this.processFunctionMove_, backrefs: true },
        "function-delete": { parsers: [this.createAddressParser("code")],
            processor: this.processFunctionDelete_, backrefs: true },
        "tick": { parsers: [this.createAddressParser("code"),
            this.createAddressParser("stack"), parseInt, "var-args"],
            processor: this.processTick_, backrefs: true, needProfile: true },
        "profiler": { parsers: [null, "var-args"],
            processor: this.processProfiler_, needsProfile: false },
        "heap-sample-begin": { parsers: [null, null, parseInt],
            processor: this.processHeapSampleBegin_ },
        "heap-sample-stats": { parsers: [null, null, parseInt, parseInt],
            processor: this.processHeapSampleStats_ },
        "heap-sample-item": { parsers: [null, parseInt, parseInt],
            processor: this.processHeapSampleItem_ },
        "heap-js-cons-item": { parsers: [null, parseInt, parseInt],
            processor: this.processHeapJsConsItem_ },
        "heap-js-ret-item": { parsers: [null, "var-args"],
            processor: this.processHeapJsRetItem_ },
        "heap-sample-end": { parsers: [null, null],
            processor: this.processHeapSampleEnd_ },
        // Not used in DevTools Profiler.
        "shared-library": null,
        // Obsolete row types.
        "code-allocate": null,
        "begin-code-region": null,
        "end-code-region": null};

    if (devtools.profiler.Profile.VERSION === 2) {
        dispatches["tick"] =  { parsers: [this.createAddressParser("code"),
            this.createAddressParser("stack"),
            this.createAddressParser("func"), parseInt, "var-args"],
            processor: this.processTickV2_, backrefs: true };
    }

    devtools.profiler.LogReader.call(this, dispatches);

    /**
     * Callback that is called when a new profile is encountered in the log.
     * @type {function()}
     */
    this.startedProfileProcessing_ = null;

    /**
     * Callback that is called periodically to display processing status.
     * @type {function()}
     */
    this.profileProcessingStatus_ = null;

    /**
     * Callback that is called when a profile has been processed and is ready
     * to be shown.
     * @type {function(devtools.profiler.ProfileView)}
     */
    this.finishedProfileProcessing_ = null;

    /**
     * The current profile.
     * @type {devtools.profiler.JsProfile}
     */
    this.currentProfile_ = null;

    /**
     * Builder of profile views. Created during "profiler,begin" event processing.
     * @type {devtools.profiler.WebKitViewBuilder}
     */
    this.viewBuilder_ = null;

    /**
     * Next profile id.
     * @type {number}
     */
    this.profileId_ = 1;

    /**
     * Counter for processed ticks.
     * @type {number}
     */
    this.ticksCount_ = 0;

    /**
     * Interval id for updating processing status.
     * @type {number}
     */
    this.processingInterval_ = null;

    /**
     * The current heap snapshot.
     * @type {string}
     */
    this.currentHeapSnapshot_ = null;

    /**
     * Next heap snapshot id.
     * @type {number}
     */
    this.heapSnapshotId_ = 1;
};
devtools.profiler.Processor.prototype.__proto__ = devtools.profiler.LogReader.prototype;


/**
 * @override
 */
devtools.profiler.Processor.prototype.printError = function(str)
{
    WebInspector.log(str);
};


/**
 * @override
 */
devtools.profiler.Processor.prototype.skipDispatch = function(dispatch)
{
    return dispatch.needsProfile && this.currentProfile_ === null;
};


/**
 * Sets profile processing callbacks.
 *
 * @param {function()} started Started processing callback.
 * @param {function(devtools.profiler.ProfileView)} finished Finished
 *     processing callback.
 */
devtools.profiler.Processor.prototype.setCallbacks = function(started, processing, finished)
{
    this.startedProfileProcessing_ = started;
    this.profileProcessingStatus_ = processing;
    this.finishedProfileProcessing_ = finished;
};


/**
 * An address for the fake "(program)" entry. WebKit's visualisation
 * has assumptions on how the top of the call tree should look like,
 * and we need to add a fake entry as the topmost function. This
 * address is chosen because it's the end address of the first memory
 * page, which is never used for code or data, but only as a guard
 * page for catching AV errors.
 *
 * @type {number}
 */
devtools.profiler.Processor.PROGRAM_ENTRY = 0xffff;
/**
 * @type {string}
 */
devtools.profiler.Processor.PROGRAM_ENTRY_STR = "0xffff";


/**
 * Sets new profile callback.
 * @param {function(devtools.profiler.ProfileView)} callback Callback function.
 */
devtools.profiler.Processor.prototype.setNewProfileCallback = function(callback)
{
    this.newProfileCallback_ = callback;
};


devtools.profiler.Processor.prototype.processProfiler_ = function(state, params)
{
    switch (state) {
        case "resume":
            if (this.currentProfile_ === null) {
                this.currentProfile_ = new devtools.profiler.JsProfile();
                // see the comment for devtools.profiler.Processor.PROGRAM_ENTRY
                this.currentProfile_.addCode("Function", "(program)", devtools.profiler.Processor.PROGRAM_ENTRY, 1);
                if (this.startedProfileProcessing_)
                    this.startedProfileProcessing_();
                this.ticksCount_ = 0;
                var self = this;
                if (this.profileProcessingStatus_) {
                    this.processingInterval_ = window.setInterval(
                        function() { self.profileProcessingStatus_(self.ticksCount_); },
                        1000);
                }
            }
            break;
        case "pause":
            if (this.currentProfile_ !== null) {
                window.clearInterval(this.processingInterval_);
                this.processingInterval_ = null;
                if (this.finishedProfileProcessing_)
                    this.finishedProfileProcessing_(this.createProfileForView());
                this.currentProfile_ = null;
            }
            break;
        case "begin":
            var samplingRate = NaN;
            if (params.length > 0)
                samplingRate = parseInt(params[0]);
            if (isNaN(samplingRate))
                samplingRate = 1;
            this.viewBuilder_ = new devtools.profiler.WebKitViewBuilder(samplingRate);
            break;
        // These events are valid but aren't used.
        case "compression":
        case "end": break;
        default:
            throw new Error("unknown profiler state: " + state);
    }
};


devtools.profiler.Processor.prototype.processCodeCreation_ = function(type, start, size, name)
{
    this.currentProfile_.addCode(this.expandAlias(type), name, start, size);
};


devtools.profiler.Processor.prototype.processCodeMove_ = function(from, to)
{
    this.currentProfile_.moveCode(from, to);
};


devtools.profiler.Processor.prototype.processCodeDelete_ = function(start)
{
    this.currentProfile_.deleteCode(start);
};


devtools.profiler.Processor.prototype.processFunctionCreation_ = function(functionAddr, codeAddr)
{
    this.currentProfile_.addCodeAlias(functionAddr, codeAddr);
};


devtools.profiler.Processor.prototype.processFunctionMove_ = function(from, to)
{
    this.currentProfile_.safeMoveDynamicCode(from, to);
};


devtools.profiler.Processor.prototype.processFunctionDelete_ = function(start)
{
    this.currentProfile_.safeDeleteDynamicCode(start);
};


// TODO(mnaganov): Remove after next V8 roll.
devtools.profiler.Processor.prototype.processTick_ = function(pc, sp, vmState, stack)
{
    // see the comment for devtools.profiler.Processor.PROGRAM_ENTRY
    stack.push(devtools.profiler.Processor.PROGRAM_ENTRY_STR);
    this.currentProfile_.recordTick(this.processStack(pc, stack));
    this.ticksCount_++;
};


devtools.profiler.Processor.prototype.processTickV2_ = function(pc, sp, func, vmState, stack)
{
    // see the comment for devtools.profiler.Processor.PROGRAM_ENTRY
    stack.push(devtools.profiler.Processor.PROGRAM_ENTRY_STR);


    if (func) {
        var funcEntry = this.currentProfile_.findEntry(func);
        if (!funcEntry || !funcEntry.isJSFunction || !funcEntry.isJSFunction())
            func = 0;
        else {
            var currEntry = this.currentProfile_.findEntry(pc);
            if (!currEntry || !currEntry.isJSFunction || currEntry.isJSFunction()) {
                func = 0;
            }
        }
    }

    this.currentProfile_.recordTick(this.processStack(pc, func, stack));
    this.ticksCount_++;
};


devtools.profiler.Processor.prototype.processHeapSampleBegin_ = function(space, state, ticks)
{
    if (space !== "Heap") return;
    this.currentHeapSnapshot_ = {
        number: this.heapSnapshotId_++,
        entries: {},
        clusters: {},
        lowlevels: {},
        ticks: ticks
    };
};


devtools.profiler.Processor.prototype.processHeapSampleStats_ = function(space, state, capacity, used)
{
    if (space !== "Heap") return;
};


devtools.profiler.Processor.prototype.processHeapSampleItem_ = function(item, number, size)
{
    if (!this.currentHeapSnapshot_) return;
    this.currentHeapSnapshot_.lowlevels[item] = {
        type: item, count: number, size: size
    };
};


devtools.profiler.Processor.prototype.processHeapJsConsItem_ = function(item, number, size)
{
    if (!this.currentHeapSnapshot_) return;
    this.currentHeapSnapshot_.entries[item] = {
        cons: item, count: number, size: size, retainers: {}
    };
};


devtools.profiler.Processor.prototype.processHeapJsRetItem_ = function(item, retainersArray)
{
    if (!this.currentHeapSnapshot_) return;
    var rawRetainers = {};
    for (var i = 0, n = retainersArray.length; i < n; ++i) {
        var entry = retainersArray[i].split(";");
        rawRetainers[entry[0]] = parseInt(entry[1], 10);
    }

    function mergeRetainers(entry) {
        for (var rawRetainer in rawRetainers) {
            var consName = rawRetainer.indexOf(":") !== -1 ? rawRetainer.split(":")[0] : rawRetainer;
            if (!(consName in entry.retainers))
                entry.retainers[consName] = { cons: consName, count: 0, clusters: {} };
            var retainer = entry.retainers[consName];
            retainer.count += rawRetainers[rawRetainer];
            if (consName !== rawRetainer)
                retainer.clusters[rawRetainer] = true;
        }
    }

    if (item.indexOf(":") !== -1) {
      // Array, Function, or Object instances cluster case.
      if (!(item in this.currentHeapSnapshot_.clusters)) {
          this.currentHeapSnapshot_.clusters[item] = {
              cons: item, retainers: {}
          };
      }
      mergeRetainers(this.currentHeapSnapshot_.clusters[item]);
      item = item.split(":")[0];
    }
    mergeRetainers(this.currentHeapSnapshot_.entries[item]);
};


devtools.profiler.Processor.prototype.processHeapSampleEnd_ = function(space, state)
{
    if (space !== "Heap") return;
    var snapshot = this.currentHeapSnapshot_;
    this.currentHeapSnapshot_ = null;
    WebInspector.panels.profiles.addSnapshot(snapshot);
};


/**
 * Creates a profile for further displaying in ProfileView.
 */
devtools.profiler.Processor.prototype.createProfileForView = function()
{
    var profile = this.viewBuilder_.buildView(this.currentProfile_.getTopDownProfile());
    profile.uid = this.profileId_++;
    profile.title = UserInitiatedProfileName + "." + profile.uid;
    return profile;
};
