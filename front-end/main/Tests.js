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
 * @fileoverview This file contains small testing framework along with the
 * test suite for the frontend. These tests are a part of the continues build
 * and are executed by the devtools_sanity_unittest.cc as a part of the
 * Interactive UI Test suite.
 * FIXME: change field naming style to use trailing underscore.
 */

function createTestSuite(domAutomationController)
{

/**
 * Test suite for interactive UI tests.
 * @constructor
 */
function TestSuite()
{
    WebInspector.TestBase.call(this, domAutomationController);
};

TestSuite.prototype = {
    __proto__: WebInspector.TestBase.prototype
};


/**
 * @param {string} panelName Name of the panel to show.
 */
TestSuite.prototype.showPanel = function(panelName)
{
    return WebInspector.inspectorView.showPanel(panelName);
};

// UI Tests


/**
 * Tests that scripts tab can be open and populated with inspected scripts.
 */
TestSuite.prototype.testShowScriptsTab = function()
{
    var test = this;
    this.showPanel("sources").then(function() {
        // There should be at least main page script.
        this._waitUntilScriptsAreParsed(["debugger_test_page.html"],
            function() {
                test.releaseControl();
            });
    }.bind(this));
    // Wait until all scripts are added to the debugger.
    this.takeControl();
};


/**
 * Tests that scripts tab is populated with inspected scripts even if it
 * hadn't been shown by the moment inspected paged refreshed.
 * @see http://crbug.com/26312
 */
TestSuite.prototype.testScriptsTabIsPopulatedOnInspectedPageRefresh = function()
{
    var test = this;
    var debuggerModel = WebInspector.DebuggerModel.fromTarget(WebInspector.targetManager.mainTarget());
    debuggerModel.addEventListener(WebInspector.DebuggerModel.Events.GlobalObjectCleared, waitUntilScriptIsParsed);

    this.showPanel("elements").then(function() {
        // Reload inspected page. It will reset the debugger agent.
        test.evaluateInConsole_("window.location.reload(true);", function(resultText) {});
    });

    function waitUntilScriptIsParsed()
    {
        debuggerModel.removeEventListener(WebInspector.DebuggerModel.Events.GlobalObjectCleared, waitUntilScriptIsParsed);
        test.showPanel("sources").then(function() {
            test._waitUntilScriptsAreParsed(["debugger_test_page.html"],
                function() {
                    test.releaseControl();
                });
        });
    }

    // Wait until all scripts are added to the debugger.
    this.takeControl();
};


/**
 * Tests that scripts list contains content scripts.
 */
TestSuite.prototype.testContentScriptIsPresent = function()
{
    var test = this;
    this.showPanel("sources").then(function() {
        test._waitUntilScriptsAreParsed(
            ["page_with_content_script.html", "simple_content_script.js"],
            function() {
                test.releaseControl();
            });
    });

    // Wait until all scripts are added to the debugger.
    this.takeControl();
};


/**
 * Tests that scripts are not duplicaed on Scripts tab switch.
 */
TestSuite.prototype.testNoScriptDuplicatesOnPanelSwitch = function()
{
    var test = this;

    // There should be two scripts: one for the main page and another
    // one which is source of console API(see
    // InjectedScript._ensureCommandLineAPIInstalled).
    var expectedScriptsCount = 2;
    var parsedScripts = [];

    function switchToElementsTab() {
        test.showPanel("elements").then(function() {
            setTimeout(switchToScriptsTab, 0);
        });
    }

    function switchToScriptsTab() {
        test.showPanel("sources").then(function() {
            setTimeout(checkScriptsPanel, 0);
        });
    }

    function checkScriptsPanel() {
        test.assertTrue(test._scriptsAreParsed(["debugger_test_page.html"]), "Some scripts are missing.");
        checkNoDuplicates();
        test.releaseControl();
    }

    function checkNoDuplicates() {
        var uiSourceCodes = test.nonAnonymousUISourceCodes_();
        for (var i = 0; i < uiSourceCodes.length; i++) {
            var scriptName = WebInspector.networkMapping.networkURL(uiSourceCodes[i]);
            for (var j = i + 1; j < uiSourceCodes.length; j++)
                test.assertTrue(scriptName !== WebInspector.networkMapping.networkURL(uiSourceCodes[j]), "Found script duplicates: " + test.uiSourceCodesToString_(uiSourceCodes));
        }
    }

    this.showPanel("sources").then(function() {
        test._waitUntilScriptsAreParsed(
            ["debugger_test_page.html"],
            function() {
                checkNoDuplicates();
                setTimeout(switchToElementsTab, 0);
            });
    });

    // Wait until all scripts are added to the debugger.
    this.takeControl();
};


// Tests that debugger works correctly if pause event occurs when DevTools
// frontend is being loaded.
TestSuite.prototype.testPauseWhenLoadingDevTools = function()
{
    var debuggerModel = WebInspector.DebuggerModel.fromTarget(WebInspector.targetManager.mainTarget());
    if (debuggerModel.debuggerPausedDetails)
        return;

    this.showPanel("sources").then(function() {
        // Script execution can already be paused.

        this._waitForScriptPause(this.releaseControl.bind(this));
    }.bind(this));

    this.takeControl();
};


// Tests that pressing "Pause" will pause script execution if the script
// is already running.
TestSuite.prototype.testPauseWhenScriptIsRunning = function()
{
    this.showPanel("sources").then(function() {
        this.evaluateInConsole_(
            'setTimeout("handleClick()", 0)',
            didEvaluateInConsole.bind(this));
    }.bind(this));

    function didEvaluateInConsole(resultText) {
        this.assertTrue(!isNaN(resultText), "Failed to get timer id: " + resultText);
        // Wait for some time to make sure that inspected page is running the
        // infinite loop.
        setTimeout(testScriptPause.bind(this), 300);
    }

    function testScriptPause() {
        // The script should be in infinite loop. Click "Pause" button to
        // pause it and wait for the result.
        WebInspector.panels.sources._pauseButton.element.click();

        this._waitForScriptPause(this.releaseControl.bind(this));
    }

    this.takeControl();
};


/**
 * Tests network size.
 */
TestSuite.prototype.testNetworkSize = function()
{
    var test = this;

    function finishResource(resource, finishTime)
    {
        test.assertEquals(219, resource.transferSize, "Incorrect total encoded data length");
        test.assertEquals(25, resource.resourceSize, "Incorrect total data length");
        test.releaseControl();
    }

    this.addSniffer(WebInspector.NetworkDispatcher.prototype, "_finishNetworkRequest", finishResource);

    // Reload inspected page to sniff network events
    test.evaluateInConsole_("window.location.reload(true);", function(resultText) {});

    this.takeControl();
};


/**
 * Tests network sync size.
 */
TestSuite.prototype.testNetworkSyncSize = function()
{
    var test = this;

    function finishResource(resource, finishTime)
    {
        test.assertEquals(219, resource.transferSize, "Incorrect total encoded data length");
        test.assertEquals(25, resource.resourceSize, "Incorrect total data length");
        test.releaseControl();
    }

    this.addSniffer(WebInspector.NetworkDispatcher.prototype, "_finishNetworkRequest", finishResource);

    // Send synchronous XHR to sniff network events
    test.evaluateInConsole_("var xhr = new XMLHttpRequest(); xhr.open(\"GET\", \"chunked\", false); xhr.send(null);", function() {});

    this.takeControl();
};


/**
 * Tests network raw headers text.
 */
TestSuite.prototype.testNetworkRawHeadersText = function()
{
    var test = this;

    function finishResource(resource, finishTime)
    {
        if (!resource.responseHeadersText)
            test.fail("Failure: resource does not have response headers text");
        test.assertEquals(164, resource.responseHeadersText.length, "Incorrect response headers text length");
        test.releaseControl();
    }

    this.addSniffer(WebInspector.NetworkDispatcher.prototype, "_finishNetworkRequest", finishResource);

    // Reload inspected page to sniff network events
    test.evaluateInConsole_("window.location.reload(true);", function(resultText) {});

    this.takeControl();
};


/**
 * Tests network timing.
 */
TestSuite.prototype.testNetworkTiming = function()
{
    var test = this;

    function finishResource(resource, finishTime)
    {
        // Setting relaxed expectations to reduce flakiness.
        // Server sends headers after 100ms, then sends data during another 100ms.
        // We expect these times to be measured at least as 70ms.
        test.assertTrue(resource.timing.receiveHeadersEnd - resource.timing.connectStart >= 70,
                        "Time between receiveHeadersEnd and connectStart should be >=70ms, but was " +
                        "receiveHeadersEnd=" + resource.timing.receiveHeadersEnd + ", connectStart=" + resource.timing.connectStart + ".");
        test.assertTrue(resource.responseReceivedTime - resource.startTime >= 0.07,
                "Time between responseReceivedTime and startTime should be >=0.07s, but was " +
                "responseReceivedTime=" + resource.responseReceivedTime + ", startTime=" + resource.startTime + ".");
        test.assertTrue(resource.endTime - resource.startTime >= 0.14,
                "Time between endTime and startTime should be >=0.14s, but was " +
                "endtime=" + resource.endTime + ", startTime=" + resource.startTime + ".");

        test.releaseControl();
    }

    this.addSniffer(WebInspector.NetworkDispatcher.prototype, "_finishNetworkRequest", finishResource);

    // Reload inspected page to sniff network events
    test.evaluateInConsole_("window.location.reload(true);", function(resultText) {});

    this.takeControl();
};


TestSuite.prototype.testConsoleOnNavigateBack = function()
{
    if (WebInspector.multitargetConsoleModel.messages().length === 1)
        firstConsoleMessageReceived.call(this);
    else
        WebInspector.multitargetConsoleModel.addEventListener(WebInspector.ConsoleModel.Events.MessageAdded, firstConsoleMessageReceived, this);

    function firstConsoleMessageReceived() {
        WebInspector.multitargetConsoleModel.removeEventListener(WebInspector.ConsoleModel.Events.MessageAdded, firstConsoleMessageReceived, this);
        this.evaluateInConsole_("clickLink();", didClickLink.bind(this));
    }

    function didClickLink() {
        // Check that there are no new messages(command is not a message).
        this.assertEquals(3, WebInspector.multitargetConsoleModel.messages().length);
        this.evaluateInConsole_("history.back();", didNavigateBack.bind(this));
    }

    function didNavigateBack()
    {
        // Make sure navigation completed and possible console messages were pushed.
        this.evaluateInConsole_("void 0;", didCompleteNavigation.bind(this));
    }

    function didCompleteNavigation() {
        this.assertEquals(7, WebInspector.multitargetConsoleModel.messages().length);
        this.releaseControl();
    }

    this.takeControl();
};

TestSuite.prototype.testReattachAfterCrash = function()
{
    var target = WebInspector.targetManager.mainTarget();
    target.pageAgent().navigate("about:crash");
    target.pageAgent().navigate("about:blank");
    target.runtimeModel.addEventListener(WebInspector.RuntimeModel.Events.ExecutionContextCreated, this.releaseControl, this);
};


TestSuite.prototype.testSharedWorker = function()
{
    function didEvaluateInConsole(resultText) {
        this.assertEquals("2011", resultText);
        this.releaseControl();
    }
    this.evaluateInConsole_("globalVar", didEvaluateInConsole.bind(this));
    this.takeControl();
};


TestSuite.prototype.testPauseInSharedWorkerInitialization1 = function()
{
    // Make sure the worker is loaded.
    function isReady()
    {
        return WebInspector.targetManager.targets().length == 2;
    }

    if (isReady())
        return;
    this.takeControl();
    this.addSniffer(WebInspector.TargetManager.prototype, "addTarget", targetAdded.bind(this));

    function targetAdded()
    {
        if (isReady()) {
            this.releaseControl();
            return;
        }
        this.addSniffer(WebInspector.TargetManager.prototype, "addTarget", targetAdded.bind(this));
    }
};

TestSuite.prototype.testPauseInSharedWorkerInitialization2 = function()
{
    var debuggerModel = WebInspector.DebuggerModel.fromTarget(WebInspector.targetManager.mainTarget());
    if (debuggerModel.isPaused())
        return;
    this._waitForScriptPause(this.releaseControl.bind(this));
    this.takeControl();
};

TestSuite.prototype.enableTouchEmulation = function()
{
    WebInspector.overridesSupport._emulateTouchEventsInTarget(WebInspector.targetManager.mainTarget(), true, "mobile");
};


// Regression test for crbug.com/370035.
TestSuite.prototype.testDeviceMetricsOverrides = function()
{
    const dumpPageMetrics = function()
    {
        return JSON.stringify({
            width: window.innerWidth,
            height: window.innerHeight,
            deviceScaleFactor: window.devicePixelRatio
        });
    };

    var test = this;

    function testOverrides(params, metrics, callback)
    {
        WebInspector.targetManager.mainTarget().emulationAgent().invoke_setDeviceMetricsOverride(params, getMetrics);

        function getMetrics()
        {
            test.evaluateInConsole_("(" + dumpPageMetrics.toString() + ")()", checkMetrics);
        }

        function checkMetrics(consoleResult)
        {
            test.assertEquals('"' + JSON.stringify(metrics) + '"', consoleResult, "Wrong metrics for params: " + JSON.stringify(params));
            callback();
        }
    }

    function step1()
    {
        testOverrides({width: 1200, height: 1000, deviceScaleFactor: 1, mobile: false, fitWindow: true}, {width: 1200, height: 1000, deviceScaleFactor: 1}, step2);
    }

    function step2()
    {
        testOverrides({width: 1200, height: 1000, deviceScaleFactor: 1, mobile: false, fitWindow: false}, {width: 1200, height: 1000, deviceScaleFactor: 1}, step3);
    }

    function step3()
    {
        testOverrides({width: 1200, height: 1000, deviceScaleFactor: 3, mobile: false, fitWindow: true}, {width: 1200, height: 1000, deviceScaleFactor: 3}, step4);
    }

    function step4()
    {
        testOverrides({width: 1200, height: 1000, deviceScaleFactor: 3, mobile: false, fitWindow: false}, {width: 1200, height: 1000, deviceScaleFactor: 3}, finish);
    }

    function finish()
    {
        test.releaseControl();
    }

    WebInspector.overridesSupport._deviceMetricsChangedListenerMuted = true;
    test.takeControl();
    this.waitForThrottler(WebInspector.overridesSupport._deviceMetricsThrottler, step1);
};

TestSuite.prototype.testScreenshotRecording = function()
{
    var test = this;

    function performActionsInPage(callback)
    {
        var count = 0;
        var div = document.createElement("div");
        div.setAttribute("style", "left: 0px; top: 0px; width: 100px; height: 100px; position: absolute;");
        document.body.appendChild(div);
        requestAnimationFrame(frame);
        function frame()
        {
            var color = [0, 0, 0];
            color[count % 3] = 255;
            div.style.backgroundColor = "rgb(" + color.join(",") + ")";
            if (++count > 10)
                requestAnimationFrame(callback);
            else
                requestAnimationFrame(frame);
        }
    }

    var captureFilmStripSetting = WebInspector.settings.createSetting("timelineCaptureFilmStrip", false);
    captureFilmStripSetting.set(true);
    test.evaluateInConsole_(performActionsInPage.toString(), function() {});
    test.invokeAsyncWithTimeline_("performActionsInPage", onTimelineDone);

    function onTimelineDone()
    {
        captureFilmStripSetting.set(false);
        var filmStripModel = new WebInspector.FilmStripModel(WebInspector.panels.timeline._tracingModel);
        var frames = filmStripModel.frames();
        test.assertTrue(frames.length > 4 && typeof frames.length === "number");
        loadFrameImages(frames);
    }

    function loadFrameImages(frames)
    {
        var readyImages = [];
        for (var frame of frames)
            frame.imageDataPromise().then(onGotImageData)

        function onGotImageData(data)
        {
            var image = new Image();
            test.assertTrue(!!data, "No image data for frame");
            image.addEventListener("load", onLoad);
            image.src = "data:image/jpg;base64," + data;
        }

        function onLoad(event)
        {
            readyImages.push(event.target);
            if (readyImages.length === frames.length)
                validateImagesAndCompleteTest(readyImages);
        }
    }

    function validateImagesAndCompleteTest(images)
    {
        var redString = [255, 0, 0, 255].join(",");
        var greenString = [0, 255, 0, 255].join(",");
        var blueString = [0, 0, 255, 255].join(",");
        var redCount = 0;
        var greenCount = 0;
        var blueCount = 0;

        var canvas = document.createElement("canvas");
        var ctx = canvas.getContext("2d");
        for (var image of images) {
            test.assertTrue(image.naturalWidth > 10);
            test.assertTrue(image.naturalHeight > 10);
            canvas.width = image.naturalWidth;
            canvas.height = image.naturalHeight;
            ctx.drawImage(image, 0, 0);
            var data = ctx.getImageData(0, 0, 1, 1);
            var color = Array.prototype.join.call(data.data, ",");
            if (color === redString)
                redCount++;
            else if (color === greenString)
                greenCount++;
            else if (color === blueString)
                blueCount++;
            else
                test.fail("Unexpected color: " + color);
        }
        test.assertTrue(redCount && greenCount && blueCount, "Color sanity check failed");
        test.releaseControl();
    }

    test.takeControl();
}

TestSuite.prototype.testSettings = function()
{
    var test = this;

    createSettings();
    test.takeControl();
    setTimeout(reset, 0);

    function createSettings()
    {
        var localSetting = WebInspector.settings.createSetting("local", undefined, true);
        localSetting.set({s: "local", n: 1 });
        var globalSetting = WebInspector.settings.createSetting("global", undefined, false);
        globalSetting.set({s: "global", n: 2 });
    }

    function reset()
    {
        Runtime.experiments.clearForTest();
        InspectorFrontendHost.getPreferences(gotPreferences);
    }

    function gotPreferences(prefs)
    {
        WebInspector.Main._instanceForTest._createSettings(prefs);

        var localSetting = WebInspector.settings.createSetting("local", undefined, true);
        test.assertEquals("object", typeof localSetting.get());
        test.assertEquals("local", localSetting.get().s);
        test.assertEquals(1, localSetting.get().n);
        var globalSetting = WebInspector.settings.createSetting("global", undefined, false);
        test.assertEquals("object", typeof globalSetting.get());
        test.assertEquals("global", globalSetting.get().s);
        test.assertEquals(2, globalSetting.get().n);
        test.releaseControl();
    }
}

TestSuite.prototype.waitForTestResultsInConsole = function()
{
    var messages = WebInspector.multitargetConsoleModel.messages();
    for (var i = 0; i < messages.length; ++i) {
        var text = messages[i].messageText;
        if (text === "PASS")
            return;
        else if (/^FAIL/.test(text))
            this.fail(text); // This will throw.
    }
    // Neither PASS nor FAIL, so wait for more messages.
    function onConsoleMessage(event)
    {
        var text = event.data.messageText;
        if (text === "PASS")
            this.releaseControl();
        else if (/^FAIL/.test(text))
            this.fail(text);
    }

    WebInspector.multitargetConsoleModel.addEventListener(WebInspector.ConsoleModel.Events.MessageAdded, onConsoleMessage, this);
    this.takeControl();
};

TestSuite.prototype.invokeAsyncWithTimeline_ = function(functionName, callback)
{
    var test = this;
    test.showPanel("timeline").then(function() {
        WebInspector.panels.timeline._model.addEventListener(WebInspector.TimelineModel.Events.RecordingStarted, onRecordingStarted);
        WebInspector.panels.timeline.toggleTimelineButton.element.click();
    });

    function onRecordingStarted()
    {
        WebInspector.panels.timeline._model.removeEventListener(WebInspector.TimelineModel.Events.RecordingStarted, onRecordingStarted);
        test.evaluateInConsole_(functionName + "(function() { console.log('DONE'); });", function() {});
        WebInspector.multitargetConsoleModel.addEventListener(WebInspector.ConsoleModel.Events.MessageAdded, onConsoleMessage);
    }

    function onConsoleMessage(event)
    {
        var text = event.data.messageText;
        if (text === "DONE") {
            WebInspector.multitargetConsoleModel.removeEventListener(WebInspector.ConsoleModel.Events.MessageAdded, onConsoleMessage);
            pageActionsDone();
        }
    }

    function pageActionsDone()
    {
        WebInspector.panels.timeline._model.addEventListener(WebInspector.TimelineModel.Events.RecordingStopped, onRecordingStopped);
        WebInspector.panels.timeline.toggleTimelineButton.element.click();
    }

    function onRecordingStopped()
    {
        WebInspector.panels.timeline._model.removeEventListener(WebInspector.TimelineModel.Events.RecordingStopped, onRecordingStopped);
        callback();
    }
};

/**
 * Serializes array of uiSourceCodes to string.
 * @param {!Array.<!WebInspectorUISourceCode>} uiSourceCodes
 * @return {string}
 */
TestSuite.prototype.uiSourceCodesToString_ = function(uiSourceCodes)
{
    var names = [];
    for (var i = 0; i < uiSourceCodes.length; i++)
        names.push('"' + WebInspector.networkMapping.networkURL(uiSourceCodes[i]) + '"');
    return names.join(",");
};


/**
 * Returns all loaded non anonymous uiSourceCodes.
 * @return {!Array.<!WebInspectorUISourceCode>}
 */
TestSuite.prototype.nonAnonymousUISourceCodes_ = function()
{
    function filterOutAnonymous(uiSourceCode)
    {
        return !!WebInspector.networkMapping.networkURL(uiSourceCode);
    }

    function filterOutService(uiSourceCode)
    {
        return !uiSourceCode.project().isServiceProject();
    }

    var uiSourceCodes = WebInspector.workspace.uiSourceCodes();
    uiSourceCodes = uiSourceCodes.filter(filterOutService);
    return uiSourceCodes.filter(filterOutAnonymous);
};


/*
 * Evaluates the code in the console as if user typed it manually and invokes
 * the callback when the result message is received and added to the console.
 * @param {string} code
 * @param {function(string)} callback
 */
TestSuite.prototype.evaluateInConsole_ = function(code, callback)
{
    function innerEvaluate()
    {
        WebInspector.context.removeFlavorChangeListener(WebInspector.ExecutionContext, showConsoleAndEvaluate, this);
        var consoleView = WebInspector.ConsolePanel._view();
        consoleView._prompt.setText(code);
        consoleView._promptElement.dispatchEvent(TestSuite.createKeyEvent("Enter"));

        this.addSniffer(WebInspector.ConsoleView.prototype, "_consoleMessageAddedForTest",
            function(viewMessage) {
                callback(viewMessage.toMessageElement().deepTextContent());
            }.bind(this));
    }

    function showConsoleAndEvaluate()
    {
        WebInspector.console.showPromise().then(innerEvaluate.bind(this));
    }

    if (!WebInspector.context.flavor(WebInspector.ExecutionContext)) {
        WebInspector.context.addFlavorChangeListener(WebInspector.ExecutionContext, showConsoleAndEvaluate, this);
        return;
    }
    showConsoleAndEvaluate.call(this);
};

/**
 * Checks that all expected scripts are present in the scripts list
 * in the Scripts panel.
 * @param {!Array.<string>} expected Regular expressions describing
 *     expected script names.
 * @return {boolean} Whether all the scripts are in "scripts-files" select
 *     box
 */
TestSuite.prototype._scriptsAreParsed = function(expected)
{
    var uiSourceCodes = this.nonAnonymousUISourceCodes_();
    // Check that at least all the expected scripts are present.
    var missing = expected.slice(0);
    for (var i = 0; i < uiSourceCodes.length; ++i) {
        for (var j = 0; j < missing.length; ++j) {
            if (uiSourceCodes[i].name().search(missing[j]) !== -1) {
                missing.splice(j, 1);
                break;
            }
        }
    }
    return missing.length === 0;
};


/**
 * Waits for script pause, checks expectations, and invokes the callback.
 * @param {function():void} callback
 */
TestSuite.prototype._waitForScriptPause = function(callback)
{
    this.addSniffer(WebInspector.DebuggerModel.prototype, "_pausedScript", callback);
};


/**
 * Waits until all the scripts are parsed and invokes the callback.
 */
TestSuite.prototype._waitUntilScriptsAreParsed = function(expectedScripts, callback)
{
    var test = this;

    function waitForAllScripts() {
        if (test._scriptsAreParsed(expectedScripts))
            callback();
        else
            test.addSniffer(WebInspector.panels.sources.sourcesView(), "_addUISourceCode", waitForAllScripts);
    }

    waitForAllScripts();
};


/**
 * Key event with given key identifier.
 */
TestSuite.createKeyEvent = function(keyIdentifier)
{
    var evt = document.createEvent("KeyboardEvent");
    evt.initKeyboardEvent("keydown", true /* can bubble */, true /* can cancel */, null /* view */, keyIdentifier, "");
    return evt;
};

/**
 * Run specified test.
 * @param {string} name Name of a test method from TestSuite class.
 * @override
 */
TestSuite.prototype.runTest = function(name)
{
    var test = WebInspector.TestBase.prototype.runTest.bind(this, name);
    if (TestSuite._populatedInterface)
        test();
    else
        TestSuite._pendingTest = test;
};

function runTests()
{
    TestSuite._populatedInterface = true;
    var test = TestSuite._pendingTest;
    delete TestSuite._pendingTest;
    if (test)
        test();
}

WebInspector.notifications.addEventListener(WebInspector.NotificationService.Events.InspectorAgentEnabledForTests, runTests);

return new TestSuite();

}

if (window.uiTests)
    window.uiTests.testSuiteReady(createTestSuite, WebInspector.TestBase);
