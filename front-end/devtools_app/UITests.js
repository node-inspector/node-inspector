// Copyright 2014 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

if (window.domAutomationController) {
    var uiTests = {};

    uiTests.runTest = function(name)
    {
        if (uiTests._testSuite)
            uiTests._testSuite._runTest(name);
        else
            uiTests._pendingTestName = name;
    };

    uiTests.testSuiteReady = function(testSuiteConstructor)
    {
        uiTests._testSuite = testSuiteConstructor(window.domAutomationController);
        if (uiTests._pendingTestName) {
            var name = uiTests._pendingTestName;
            delete uiTests._pendingTestName;
            uiTests._testSuite._runTest(name);
        }
    };
}
