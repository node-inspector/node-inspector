/*
 * Copyright (C) 2012 Google Inc. All rights reserved.
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
 * @param {!WebInspector.Workspace} workspace
 */
WebInspector.PresentationConsoleMessageHelper = function(workspace)
{
    this._workspace = workspace;

    /** @type {!Object.<string, !Array.<!WebInspector.ConsoleMessage>>} */
    this._pendingConsoleMessages = {};

    /** @type {!Array.<!WebInspector.PresentationConsoleMessage>} */
    this._presentationConsoleMessages = [];

    /** @type {!Map.<!WebInspector.UISourceCode, !Array.<!WebInspector.PresentationConsoleMessage>>} */
    this._uiSourceCodeToMessages = new Map();

    /** @type {!Map.<!WebInspector.UISourceCode, !WebInspector.Object>} */
    this._uiSourceCodeToEventTarget = new Map();

    workspace.addEventListener(WebInspector.Workspace.Events.UISourceCodeRemoved, this._uiSourceCodeRemoved, this);
    workspace.addEventListener(WebInspector.Workspace.Events.ProjectRemoved, this._projectRemoved, this);
    WebInspector.multitargetConsoleModel.addEventListener(WebInspector.ConsoleModel.Events.ConsoleCleared, this._consoleCleared, this);
    WebInspector.multitargetConsoleModel.addEventListener(WebInspector.ConsoleModel.Events.MessageAdded, this._onConsoleMessageAdded, this);
    WebInspector.multitargetConsoleModel.messages().forEach(this._consoleMessageAdded, this);
    WebInspector.targetManager.addModelListener(WebInspector.DebuggerModel, WebInspector.DebuggerModel.Events.ParsedScriptSource, this._parsedScriptSource, this);
    WebInspector.targetManager.addModelListener(WebInspector.DebuggerModel, WebInspector.DebuggerModel.Events.FailedToParseScriptSource, this._parsedScriptSource, this);
    WebInspector.targetManager.addModelListener(WebInspector.DebuggerModel, WebInspector.DebuggerModel.Events.GlobalObjectCleared, this._debuggerReset, this);
}

/**
 * @enum {string}
 */
WebInspector.PresentationConsoleMessageHelper.Events = {
    ConsoleMessageAdded: "ConsoleMessageAdded",
    ConsoleMessageRemoved: "ConsoleMessageRemoved",
    ConsoleMessagesCleared: "ConsoleMessagesCleared",
}

WebInspector.PresentationConsoleMessageHelper.prototype = {
    /**
     * @param {!WebInspector.PresentationConsoleMessageHelper.Events} eventType
     * @param {!WebInspector.UISourceCode} uiSourceCode
     * @param {function(!WebInspector.Event)} listener
     * @param {!Object=} thisObject
     */
    addConsoleMessageEventListener: function(eventType, uiSourceCode, listener, thisObject)
    {
        var target = this._uiSourceCodeToEventTarget.get(uiSourceCode);
        if (!target) {
            target = new WebInspector.Object();
            this._uiSourceCodeToEventTarget.set(uiSourceCode, target);
        }
        target.addEventListener(eventType, listener, thisObject);
    },

    /**
     * @param {!WebInspector.PresentationConsoleMessageHelper.Events} eventType
     * @param {!WebInspector.UISourceCode} uiSourceCode
     * @param {function(!WebInspector.Event)} listener
     * @param {!Object=} thisObject
     */
    removeConsoleMessageEventListener: function(eventType, uiSourceCode, listener, thisObject)
    {
        var target = this._uiSourceCodeToEventTarget.get(uiSourceCode);
        if (!target)
            return;
        target.removeEventListener(eventType, listener, thisObject);
    },

    /**
     * @param {!WebInspector.UISourceCode} uiSourceCode
     * @return {!Array.<!WebInspector.PresentationConsoleMessage>}
     */
    consoleMessages: function(uiSourceCode)
    {
        return this._uiSourceCodeToMessages.get(uiSourceCode) || [];
    },

    /**
     * @param {!WebInspector.PresentationConsoleMessageHelper.Events} eventType
     * @param {!WebInspector.UISourceCode} uiSourceCode
     * @param {!WebInspector.PresentationConsoleMessage=} message
     */
    _dispatchConsoleEvent: function(eventType, uiSourceCode, message)
    {
        var target = this._uiSourceCodeToEventTarget.get(uiSourceCode);
        if (!target)
            return;
        target.dispatchEventToListeners(eventType, message);
    },

    /**
     * @param {!WebInspector.Event} event
     */
    _uiSourceCodeRemoved: function(event)
    {
        var uiSourceCode = /** @type {!WebInspector.UISourceCode} */ (event.data);
        this._uiSourceCodeToEventTarget.remove(uiSourceCode);
        this._uiSourceCodeToMessages.remove(uiSourceCode);
    },

    /**
     * @param {!WebInspector.Event} event
     */
    _projectRemoved: function(event)
    {
        var project = /** @type {!WebInspector.Project} */ (event.data);
        var uiSourceCodes = project.uiSourceCodes();
        for (var i = 0; i < uiSourceCodes.length; ++i) {
            this._uiSourceCodeToEventTarget.remove(uiSourceCodes[i]);
            this._uiSourceCodeToMessages.remove(uiSourceCodes[i]);
        }
    },

    /**
     * @param {!WebInspector.Event} event
     */
    _onConsoleMessageAdded: function(event)
    {
        var message = /** @type {!WebInspector.ConsoleMessage} */ (event.data);
        this._consoleMessageAdded(message)
    },

    /**
     * @param {!WebInspector.ConsoleMessage} message
     */
    _consoleMessageAdded: function(message)
    {
        if (!message.url || !message.isErrorOrWarning())
            return;

        var rawLocation = this._rawLocation(message);
        if (rawLocation)
            this._addConsoleMessageToScript(message, rawLocation);
        else
            this._addPendingConsoleMessage(message);
    },

    /**
     * @param {!WebInspector.ConsoleMessage} message
     * @return {?WebInspector.DebuggerModel.Location}
     */
    _rawLocation: function(message)
    {
        // FIXME(62725): stack trace line/column numbers are one-based.
        var lineNumber = message.stackTrace ? message.stackTrace[0].lineNumber - 1 : message.line - 1;
        var columnNumber = message.stackTrace && message.stackTrace[0].columnNumber ? message.stackTrace[0].columnNumber - 1 : 0;
        if (message.scriptId)
            return message.target().debuggerModel.createRawLocationByScriptId(message.scriptId, message.url || "", lineNumber, columnNumber);
        return message.target().debuggerModel.createRawLocationByURL(message.url || "", lineNumber, columnNumber);
    },

    /**
     * @param {!WebInspector.ConsoleMessage} message
     * @param {!WebInspector.DebuggerModel.Location} rawLocation
     */
    _addConsoleMessageToScript: function(message, rawLocation)
    {
        this._presentationConsoleMessages.push(new WebInspector.PresentationConsoleMessage(message, rawLocation));
    },

    /**
     * @param {!WebInspector.ConsoleMessage} message
     */
    _addPendingConsoleMessage: function(message)
    {
        if (!message.url)
            return;
        if (!this._pendingConsoleMessages[message.url])
            this._pendingConsoleMessages[message.url] = [];
        this._pendingConsoleMessages[message.url].push(message);
    },

    /**
     * @param {!WebInspector.Event} event
     */
    _parsedScriptSource: function(event)
    {
        var script = /** @type {!WebInspector.Script} */ (event.data);

        var messages = this._pendingConsoleMessages[script.sourceURL];
        if (!messages)
            return;

        var pendingMessages = [];
        for (var i = 0; i < messages.length; i++) {
            var message = messages[i];
            var rawLocation = this._rawLocation(message);
            if (script.target() === message.target() && script.scriptId === rawLocation.scriptId)
                this._addConsoleMessageToScript(message, rawLocation);
            else
                pendingMessages.push(message);
        }

        if (pendingMessages.length)
            this._pendingConsoleMessages[script.sourceURL] = pendingMessages;
        else
            delete this._pendingConsoleMessages[script.sourceURL];
    },

    /**
     * @param {!WebInspector.PresentationConsoleMessage} message
     */
    _presentationConsoleMessageAdded: function(message)
    {
        var uiSourceCode = message._uiLocation.uiSourceCode;
        var messages = this._uiSourceCodeToMessages.get(uiSourceCode);
        if (!messages) {
            messages = [];
            this._uiSourceCodeToMessages.set(uiSourceCode, messages);
        }
        messages.push(message);
        this._dispatchConsoleEvent(WebInspector.PresentationConsoleMessageHelper.Events.ConsoleMessageAdded, uiSourceCode, message);
    },

    /**
     * @param {!WebInspector.PresentationConsoleMessage} message
     */
    _presentationConsoleMessageRemoved: function(message)
    {
        var uiSourceCode = message._uiLocation.uiSourceCode;
        var messages = this._uiSourceCodeToMessages.get(uiSourceCode);
        if (!messages)
            return;
        messages.remove(message);
        this._dispatchConsoleEvent(WebInspector.PresentationConsoleMessageHelper.Events.ConsoleMessageRemoved, uiSourceCode, message);
    },

    _consoleCleared: function()
    {
        this._pendingConsoleMessages = {};
        for (var i = 0; i < this._presentationConsoleMessages.length; ++i)
            this._presentationConsoleMessages[i].dispose();
        this._presentationConsoleMessages = [];
        var targets = this._uiSourceCodeToEventTarget.valuesArray();
        for (var i = 0; i < targets.length; ++i)
            targets[i].dispatchEventToListeners(WebInspector.PresentationConsoleMessageHelper.Events.ConsoleMessagesCleared);
        this._uiSourceCodeToMessages.clear();
    },

    _debuggerReset: function()
    {
        this._consoleCleared();
    }
}

/**
 * @constructor
 * @param {!WebInspector.ConsoleMessage} message
 * @param {!WebInspector.DebuggerModel.Location} rawLocation
 */
WebInspector.PresentationConsoleMessage = function(message, rawLocation)
{
    this.originalMessage = message;
    this._liveLocation = WebInspector.debuggerWorkspaceBinding.createLiveLocation(rawLocation, this._updateLocation.bind(this));
}

WebInspector.PresentationConsoleMessage.prototype = {
    /**
     * @param {!WebInspector.UILocation} uiLocation
     */
    _updateLocation: function(uiLocation)
    {
        if (this._uiLocation)
            WebInspector.presentationConsoleMessageHelper._presentationConsoleMessageRemoved(this);
        this._uiLocation = uiLocation;
        WebInspector.presentationConsoleMessageHelper._presentationConsoleMessageAdded(this);
    },

    get lineNumber()
    {
        return this._uiLocation.lineNumber;
    },

    dispose: function()
    {
        this._liveLocation.dispose();
    }
}

/** @type {!WebInspector.PresentationConsoleMessageHelper} */
WebInspector.presentationConsoleMessageHelper;