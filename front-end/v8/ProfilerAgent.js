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
 * @fileoverview Provides communication interface to remote v8 profiler.
 */

/**
 * @constructor
 */
devtools.ProfilerAgent = function()
{

    /**
     * Profiler log position.
     * @type {number}
     */
    this._logPosition = 0;

    /**
     * Last requested log position.
     * @type {number}
     */
    this._lastRequestedLogPosition = -1;

    /**
     * Profiler processor instance.
     * @type {devtools.profiler.Processor}
     */
    this._profilerProcessor = new devtools.profiler.Processor();
};


/**
 * A copy of enum from include/v8.h
 * @enum {number}
 */
devtools.ProfilerAgent.ProfilerModules = {
    PROFILER_MODULE_NONE: 0,
    PROFILER_MODULE_CPU: 1,
    PROFILER_MODULE_HEAP_STATS: 1 << 1,
    PROFILER_MODULE_JS_CONSTRUCTORS: 1 << 2,
    PROFILER_MODULE_HEAP_SNAPSHOT: 1 << 16
};


/**
 * Initializes profiling state.
 */
devtools.ProfilerAgent.prototype.initializeProfiling = function()
{
    this._getNextLogLines(false);
};


/**
 * Requests the next chunk of log lines.
 * @param {boolean} immediately Do not postpone the request.
 * @private
 */
devtools.ProfilerAgent.prototype._getNextLogLines = function(immediately)
{
    if (this._lastRequestedLogPosition == this._logPosition)
        return;
    var pos = this._lastRequestedLogPosition = this._logPosition;

    var callId = WebInspector.Callback.wrap(this._didGetProfilerLogLines.bind(this));
    if (immediately)
        InspectorBackend.getProfilerLogLines(callId, pos);
    else {
        function delayedRequest()
        {
            InspectorBackend.getProfilerLogLines(callId, pos);
        }
        setTimeout(delayedRequest, 500);
    }
};


/**
 * Starts profiling.
 * @param {number} modules List of modules to enable.
 */
devtools.ProfilerAgent.prototype.startProfiling = function(modules)
{
    if (modules & devtools.ProfilerAgent.ProfilerModules.PROFILER_MODULE_HEAP_SNAPSHOT) {
        InspectorBackend.takeHeapSnapshot();
        // Active modules will not change, instead, a snapshot will be logged.
        this._getNextLogLines();
    }
};


/**
 * Handles a portion of a profiler log retrieved by getLogLines call.
 * @param {number} pos Current position in log.
 * @param {string} log A portion of profiler log.
 */
devtools.ProfilerAgent.prototype._didGetProfilerLogLines = function(pos, log)
{
    this._logPosition = pos;
    if (log.length > 0) {
        this._profilerProcessor.processLogChunk(log);
        this._getNextLogLines();
    } else {
        // Allow re-reading from the last position.
        this._lastRequestedLogPosition = this._logPosition - 1;
    }
};

WebInspector.didGetProfilerLogLines = WebInspector.Callback.processCallback;
