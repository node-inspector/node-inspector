// Copyright 2014 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

/**
 * @constructor
 * @param {!WebInspector.JavaScriptSourceFrame} sourceFrame
 */
WebInspector.JavaScriptCompiler = function(sourceFrame)
{
    this._sourceFrame = sourceFrame;
    this._compiling = false;
}

WebInspector.JavaScriptCompiler.CompileDelay = 1000;

WebInspector.JavaScriptCompiler.prototype = {
    scheduleCompile: function()
    {
        if (this._compiling) {
            this._recompileScheduled = true;
            return;
        }
        if (this._timeout)
            clearTimeout(this._timeout);
        this._timeout = setTimeout(this._compile.bind(this), WebInspector.JavaScriptCompiler.CompileDelay);
    },

    /**
     * @return {?WebInspector.Target}
     */
    _findTarget: function()
    {
        var targets = WebInspector.targetManager.targets();
        var sourceCode = this._sourceFrame.uiSourceCode();
        for (var i = 0; i < targets.length; ++i) {
            var scriptFile = WebInspector.debuggerWorkspaceBinding.scriptFile(sourceCode, targets[i]);
            if (scriptFile)
                return targets[i];
        }
        return WebInspector.targetManager.mainTarget();
    },

    _compile: function()
    {
        var target = this._findTarget();
        if (!target)
            return;
        var debuggerModel = WebInspector.DebuggerModel.fromTarget(target);
        if (!debuggerModel)
            return;

        this._compiling = true;
        var code = this._sourceFrame.textEditor.text();
        debuggerModel.compileScript(code, "", false, undefined, compileCallback.bind(this, target));

        /**
         * @param {!WebInspector.Target} target
         * @param {!DebuggerAgent.ScriptId=} scriptId
         * @param {?DebuggerAgent.ExceptionDetails=} exceptionDetails
         * @this {WebInspector.JavaScriptCompiler}
         */
        function compileCallback(target, scriptId, exceptionDetails)
        {
            this._compiling = false;
            if (this._recompileScheduled) {
                delete this._recompileScheduled;
                this.scheduleCompile();
                return;
            }
            if (!exceptionDetails)
                return;
            var message = new WebInspector.SourceFrameMessage(exceptionDetails.text, WebInspector.SourceFrameMessage.Level.Error, exceptionDetails.line - 1, exceptionDetails.column + 1);
            this._sourceFrame.addMessageToSource(message);
            this._compilationFinishedForTest();
        }
    },

    _compilationFinishedForTest: function() {}
}
