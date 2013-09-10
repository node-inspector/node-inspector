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
WebInspector.TracingAgent = function()
{
    this._active = false;
    InspectorBackend.registerTracingDispatcher(new WebInspector.TracingDispatcher(this));
}

WebInspector.TracingAgent.prototype = {
    /**
     * @param {string} categoryPatterns
     * @param {function(?string)=} callback
     */
    start: function(categoryPatterns, callback)
    {
        TracingAgent.start(categoryPatterns, callback);
        this._active = true;
        this._events = [];
    },

    /**
     * @param {function()} callback
     */
    stop: function(callback)
    {
        if (!this._active) {
            callback();
            return;
        }
        this._pendingStopCallback = callback;
        TracingAgent.end();
    },

    events: function()
    {
        return this._events;
    },

    _eventsCollected: function(events)
    {
        Array.prototype.push.apply(this._events, events);
    },

    _tracingComplete: function()
    {
        this._active = false;
        if (this._pendingStopCallback) {
            this._pendingStopCallback();
            this._pendingStopCallback = null;
        }
    }
}

/**
 * @constructor
 * @implements {TracingAgent.Dispatcher}
 * @param {WebInspector.TracingAgent} tracingAgent
 */
WebInspector.TracingDispatcher = function(tracingAgent)
{
    this._tracingAgent = tracingAgent;
}

WebInspector.TracingDispatcher.prototype = {
    dataCollected: function(data)
    {
        this._tracingAgent._eventsCollected(data);
    },

    tracingComplete: function()
    {
        this._tracingAgent._tracingComplete();
    }
}
