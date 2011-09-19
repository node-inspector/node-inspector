/*
 * Copyright (C) 2011 Google Inc. All rights reserved.
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
WebInspector.ConsoleModel = function(drawer)
{
    this.messages = [];
    this.warnings = 0;
    this.errors = 0;
    this._interruptRepeatCount = false;
    InspectorBackend.registerConsoleDispatcher(new WebInspector.ConsoleDispatcher(this));
}

WebInspector.ConsoleModel.Events = {
    ConsoleCleared: "console-cleared",
    MessageAdded: "console-message-added",
    RepeatCountUpdated: "repeat-count-updated"
}

WebInspector.ConsoleModel.prototype = {
    enableAgent: function()
    {
        if (WebInspector.settings.monitoringXHREnabled.get())
            ConsoleAgent.setMonitoringXHREnabled(true);

        // There is no console agent for workers yet.
        if (!WebInspector.WorkerManager.isWorkerFrontend())
            ConsoleAgent.enable(this._setConsoleMessageExpiredCount.bind(this));
    },

    _setConsoleMessageExpiredCount: function(count)
    {
        if (count) {
            var message = String.sprintf(WebInspector.UIString("%d console messages are not shown."), count);
            this.addMessage(WebInspector.ConsoleMessage.createTextMessage(message, WebInspector.ConsoleMessage.MessageLevel.Warning));
        }
    },

    addMessage: function(msg)
    {
        this.messages.push(msg);
        this._previousMessage = msg;
        this._incrementErrorWarningCount(msg);
        this.dispatchEventToListeners(WebInspector.ConsoleModel.Events.MessageAdded, msg);
        this._interruptRepeatCount = false;
    },

    _incrementErrorWarningCount: function(msg)
    {
        switch (msg.level) {
            case WebInspector.ConsoleMessage.MessageLevel.Warning:
                this.warnings += msg.repeatDelta;
                break;
            case WebInspector.ConsoleMessage.MessageLevel.Error:
                this.errors += msg.repeatDelta;
                break;
        }
    },

    requestClearMessages: function()
    {
        ConsoleAgent.clearMessages();
        this.clearMessages();
    },

    clearMessages: function()
    {
        this.messages = [];

        this.errors = 0;
        this.warnings = 0;

        this.dispatchEventToListeners(WebInspector.ConsoleModel.Events.ConsoleCleared);
    },

    interruptRepeatCount: function()
    {
        this._interruptRepeatCount = true;
    },

    _messageRepeatCountUpdated: function(count)
    {
        var msg = this._previousMessage;
        if (!msg)
            return;

        var prevRepeatCount = msg.totalRepeatCount;

        if (!this._interruptRepeatCount) {
            msg.repeatDelta = count - prevRepeatCount;
            msg.repeatCount = msg.repeatCount + msg.repeatDelta;
            msg.totalRepeatCount = count;
            msg._updateRepeatCount();

            this._incrementErrorWarningCount(msg);
            this.dispatchEventToListeners(WebInspector.ConsoleModel.Events.RepeatCountUpdated, msg);
        } else {
            var msgCopy = new WebInspector.ConsoleMessage(msg.source, msg.type, msg.level, msg.line, msg.url, count - prevRepeatCount, msg._messageText, msg._parameters, msg._stackTrace, msg._request);
            msgCopy.totalRepeatCount = count;
            msgCopy._formatMessage();
            this.addMessage(msgCopy);
        }
    }
}

WebInspector.ConsoleModel.prototype.__proto__ = WebInspector.Object.prototype;

/**
 * @constructor
 * @implements {ConsoleAgent.Dispatcher}
 * @param {WebInspector.ConsoleModel} console
 */
WebInspector.ConsoleDispatcher = function(console)
{
    this._console = console;
}

WebInspector.ConsoleDispatcher.prototype = {
    messageAdded: function(payload)
    {
        var consoleMessage = new WebInspector.ConsoleMessage(
            payload.source,
            payload.type,
            payload.level,
            payload.line,
            payload.url,
            payload.repeatCount,
            payload.text,
            payload.parameters,
            payload.stackTrace,
            payload.networkRequestId ? WebInspector.networkResourceById(payload.networkRequestId) : undefined);
        this._console.addMessage(consoleMessage);
    },

    messageRepeatCountUpdated: function(count)
    {
        this._console._messageRepeatCountUpdated(count);
    },

    messagesCleared: function()
    {
        if (!WebInspector.settings.preserveConsoleLog.get())
            this._console.clearMessages();
    }
}

/**
 * @type {?WebInspector.ConsoleModel}
 */
WebInspector.console = null;
