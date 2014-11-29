// Copyright 2014 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

/**
 * @constructor
 * @param {number} timeout
 */
WebInspector.Throttler = function(timeout)
{
    this._timeout = timeout;
    this._isRunningProcess = false;
    this._asSoonAsPossible = false;
    /** @type {?function(!WebInspector.Throttler.FinishCallback)} */
    this._process = null;
}

WebInspector.Throttler.prototype = {
    _processCompleted: function()
    {
        this._isRunningProcess = false;
        if (this._process)
            this._innerSchedule(false);
        this._processCompletedForTests();
    },

    _processCompletedForTests: function()
    {
        // For sniffing in tests.
    },

    _onTimeout: function()
    {
        delete this._processTimeout;
        this._asSoonAsPossible = false;
        this._isRunningProcess = true;

        // Process might issue synchronous calls to this throttler.
        var process = this._process;
        this._process = null;
        process(this._processCompleted.bind(this));
    },

    /**
     * @param {function(!WebInspector.Throttler.FinishCallback)} process
     * @param {boolean=} asSoonAsPossible
     */
    schedule: function(process, asSoonAsPossible)
    {
        // Deliberately skip previous process.
        this._process = process;

        // Run the first scheduled task instantly.
        var hasScheduledTasks = !!this._processTimeout || this._isRunningProcess;
        asSoonAsPossible = !!asSoonAsPossible || !hasScheduledTasks;

        var forceTimerUpdate = asSoonAsPossible && !this._asSoonAsPossible;
        this._asSoonAsPossible = this._asSoonAsPossible || asSoonAsPossible;

        this._innerSchedule(forceTimerUpdate);
    },

    /**
     * @param {boolean} forceTimerUpdate
     */
    _innerSchedule: function(forceTimerUpdate)
    {
        if (this._isRunningProcess)
            return;
        if (this._processTimeout && !forceTimerUpdate)
            return;
        if (this._processTimeout)
            this._clearTimeout(this._processTimeout);

        var timeout = this._asSoonAsPossible ? 0 : this._timeout;
        this._processTimeout = this._setTimeout(this._onTimeout.bind(this), timeout);
    },

    /**
     *  @param {number} timeoutId
     */
    _clearTimeout: function(timeoutId)
    {
        clearTimeout(timeoutId);
    },

    /**
     * @param {function()} operation
     * @param {number} timeout
     * @return {number}
     */
    _setTimeout: function(operation, timeout)
    {
        return setTimeout(operation, timeout);
    }
}

/** @typedef {function()} */
WebInspector.Throttler.FinishCallback;
