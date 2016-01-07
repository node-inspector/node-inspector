// Copyright 2015 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

WebInspector.DebuggerPresentationUtils = {}

/**
 * @param {?WebInspector.DebuggerModel} debuggerModel
 * @param {!Array.<!ConsoleAgent.CallFrame>=} stackTrace
 * @param {!ConsoleAgent.AsyncStackTrace=} asyncStackTrace
 * @param {boolean=} showBlackboxed
 * @return {?ConsoleAgent.CallFrame}
 */
WebInspector.DebuggerPresentationUtils.callFrameAnchorFromStackTrace = function(debuggerModel, stackTrace, asyncStackTrace, showBlackboxed)
{
    /**
     * @param {?Array.<!ConsoleAgent.CallFrame>=} stackTrace
     * @return {?ConsoleAgent.CallFrame}
     */
    function innerCallFrameAnchorFromStackTrace(stackTrace)
    {
        if (!stackTrace || !stackTrace.length)
            return null;
        if (showBlackboxed)
            return stackTrace[0];
        for (var i = 0; i < stackTrace.length; ++i) {
            var script = debuggerModel && debuggerModel.scriptForId(stackTrace[i].scriptId);
            var blackboxed = script ?
                WebInspector.BlackboxSupport.isBlackboxed(script.sourceURL, script.isContentScript()) :
                WebInspector.BlackboxSupport.isBlackboxedURL(stackTrace[i].url);
            if (!blackboxed)
                return stackTrace[i];
        }
        return null;
    }

    var callFrame = innerCallFrameAnchorFromStackTrace(stackTrace);
    if (callFrame)
        return callFrame;

    while (asyncStackTrace) {
        callFrame = innerCallFrameAnchorFromStackTrace(asyncStackTrace.callFrames);
        if (callFrame)
            return callFrame;
        asyncStackTrace = asyncStackTrace.asyncStackTrace;
    }

    return stackTrace ? stackTrace[0] : null;
}
