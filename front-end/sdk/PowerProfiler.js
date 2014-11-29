// Copyright 2014 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

/**
 * @constructor
 * @extends {WebInspector.Object}
 * @param {!WebInspector.Target} target
 */
WebInspector.PowerProfiler = function(target)
{
    WebInspector.Object.call(this);
    this._dispatcher = new WebInspector.PowerDispatcher(this);
    this._target = target;
    target.registerPowerDispatcher(this._dispatcher);
    target.powerAgent().getAccuracyLevel(this._onAccuracyLevel.bind(this));
}

WebInspector.PowerProfiler.EventTypes = {
    PowerEventRecorded: "PowerEventRecorded"
}

WebInspector.PowerProfiler.prototype = {
    startProfile: function ()
    {
        this._target.powerAgent().start();
    },

    stopProfile: function ()
    {
        this._target.powerAgent().end();
    },

    /**
     * @return {string}
     */
    getAccuracyLevel: function()
    {
        return this._accuracyLevel;
    },

    _onAccuracyLevel: function(error, result) {
        this._accuracyLevel = "";
        if (error) {
            console.log("Unable to retrieve PowerProfiler accuracy level: " + error);
            return;
        }
        this._accuracyLevel = result;
    },

    __proto__: WebInspector.Object.prototype
}

/**
 * @constructor
 * @implements {PowerAgent.Dispatcher}
 */
WebInspector.PowerDispatcher = function(profiler)
{
    this._profiler = profiler;
}

WebInspector.PowerDispatcher.prototype = {
    dataAvailable: function(events)
    {
        for (var i = 0; i < events.length; ++i)
            this._profiler.dispatchEventToListeners(WebInspector.PowerProfiler.EventTypes.PowerEventRecorded, events[i]);
    }
}

/**
 * @type {!WebInspector.PowerProfiler}
 */
WebInspector.powerProfiler;
