// Copyright 2014 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

/**
 * Test suite for interactive UI tests.
 * @constructor
 * @param {Object} domAutomationController DomAutomationController instance.
 */
WebInspector.TestBase = function(domAutomationController)
{
    this.domAutomationController_ = domAutomationController;
    this.controlTaken_ = false;
    this.timerId_ = -1;
};


/**
 * Reports test failure.
 * @param {string} message Failure description.
 */
WebInspector.TestBase.prototype.fail = function(message)
{
    if (this.controlTaken_)
        this.reportFailure_(message);
    else
        throw message;
};


/**
 * Equals assertion tests that expected === actual.
 * @param {!Object|boolean} expected Expected object.
 * @param {!Object|boolean} actual Actual object.
 * @param {string} opt_message User message to print if the test fails.
 */
WebInspector.TestBase.prototype.assertEquals = function(expected, actual, opt_message)
{
    if (expected !== actual) {
        var message = "Expected: '" + expected + "', but was '" + actual + "'";
        if (opt_message)
            message = opt_message + "(" + message + ")";
        this.fail(message);
    }
};


/**
 * True assertion tests that value == true.
 * @param {!Object} value Actual object.
 * @param {string} opt_message User message to print if the test fails.
 */
WebInspector.TestBase.prototype.assertTrue = function(value, opt_message)
{
    this.assertEquals(true, !!value, opt_message);
};


/**
 * Takes control over execution.
 */
WebInspector.TestBase.prototype.takeControl = function()
{
    this.controlTaken_ = true;
    // Set up guard timer.
    var self = this;
    this.timerId_ = setTimeout(function() {
        self.reportFailure_("Timeout exceeded: 20 sec");
    }, 20000);
};


/**
 * Releases control over execution.
 */
WebInspector.TestBase.prototype.releaseControl = function()
{
    if (this.timerId_ !== -1) {
        clearTimeout(this.timerId_);
        this.timerId_ = -1;
    }
    this.reportOk_();
};


/**
 * Async tests use this one to report that they are completed.
 */
WebInspector.TestBase.prototype.reportOk_ = function()
{
    this.domAutomationController_.send("[OK]");
};


/**
 * Async tests use this one to report failures.
 */
WebInspector.TestBase.prototype.reportFailure_ = function(error)
{
    if (this.timerId_ !== -1) {
        clearTimeout(this.timerId_);
        this.timerId_ = -1;
    }
    this.domAutomationController_.send("[FAILED] " + error);
};


/**
 * Run specified test on a fresh instance of the test suite.
 * @param {string} name Name of a test method from implementation class.
 */
WebInspector.TestBase.prototype.runTest = function(testName)
{
    try {
        this[testName]();
        if (!this.controlTaken_)
            this.reportOk_();
    } catch (e) {
        this.reportFailure_(e);
    }
};


/**
 * Overrides the method with specified name until it's called first time.
 * @param {!Object} receiver An object whose method to override.
 * @param {string} methodName Name of the method to override.
 * @param {!Function} override A function that should be called right after the
 *     overridden method returns.
 * @param {?boolean} opt_sticky Whether restore original method after first run
 *     or not.
 */
WebInspector.TestBase.prototype.addSniffer = function(receiver, methodName, override, opt_sticky)
{
    var orig = receiver[methodName];
    if (typeof orig !== "function")
        this.fail("Cannot find method to override: " + methodName);
    var test = this;
    receiver[methodName] = function(var_args) {
        try {
            var result = orig.apply(this, arguments);
        } finally {
            if (!opt_sticky)
                receiver[methodName] = orig;
        }
        // In case of exception the override won't be called.
        try {
            override.apply(this, arguments);
        } catch (e) {
            test.fail("Exception in overriden method '" + methodName + "': " + e);
        }
        return result;
    };
};

/**
 * Waits for current throttler invocations, if any.
 * @param {!WebInspector.Throttler} throttler
 * @param {function()} callback
 */
WebInspector.TestBase.prototype.waitForThrottler = function(throttler, callback)
{
    var test = this;
    var scheduleShouldFail = true;
    test.addSniffer(throttler, "schedule", onSchedule);

    function hasSomethingScheduled()
    {
        return throttler._isRunningProcess || throttler._process;
    }

    function checkState()
    {
        if (!hasSomethingScheduled()) {
            scheduleShouldFail = false;
            callback();
            return;
        }

        test.addSniffer(throttler, "_processCompletedForTests", checkState);
    }

    function onSchedule()
    {
        if (scheduleShouldFail)
            test.fail("Unexpected Throttler.schedule");
    }

    checkState();
};
