/*
 * Copyright (C) 2011 Google Inc.  All rights reserved.
 * Copyright (C) 2007, 2008 Apple Inc.  All rights reserved.
 * Copyright (C) 2009 Joseph Pecoraro
 *
 * Redistribution and use in source and binary forms, with or without
 * modification, are permitted provided that the following conditions
 * are met:
 *
 * 1.  Redistributions of source code must retain the above copyright
 *     notice, this list of conditions and the following disclaimer.
 * 2.  Redistributions in binary form must reproduce the above copyright
 *     notice, this list of conditions and the following disclaimer in the
 *     documentation and/or other materials provided with the distribution.
 * 3.  Neither the name of Apple Computer, Inc. ("Apple") nor the names of
 *     its contributors may be used to endorse or promote products derived
 *     from this software without specific prior written permission.
 *
 * THIS SOFTWARE IS PROVIDED BY APPLE AND ITS CONTRIBUTORS "AS IS" AND ANY
 * EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED
 * WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
 * DISCLAIMED. IN NO EVENT SHALL APPLE OR ITS CONTRIBUTORS BE LIABLE FOR ANY
 * DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES
 * (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES;
 * LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND
 * ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT
 * (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF
 * THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
 */

/**
 * @constructor
 */
WebInspector.ConsoleStackFrame = function()
{
    this.url = undefined;
    this.functionName = undefined;
    this.lineNumber = undefined;
    this.columnNumber = undefined;
}

/**
 * @constructor
 * @param {Array.<WebInspector.ConsoleStackFrame>=} stackTrace
 * @param {number=} request
 */
WebInspector.ConsoleMessage = function(source, type, level, line, url, repeatCount, message, parameters, stackTrace, request)
{
    this.source = source;
    this.type = type;
    this.level = level;
    this.line = line;
    this.url = url;
    this.repeatCount = repeatCount;
    this.repeatDelta = repeatCount;
    this.totalRepeatCount = repeatCount;
    this._messageText = message;
    this._parameters = parameters;
    this._stackTrace = stackTrace;
    this._request = request;

    if (stackTrace && stackTrace.length) {
        var topCallFrame = stackTrace[0];
        if (!this.url)
            this.url = topCallFrame.url;
        if (!this.line)
            this.line = topCallFrame.lineNumber;
    }

    this._formatMessage();
}

WebInspector.ConsoleMessage.createTextMessage = function(text, level)
{
    level = level || WebInspector.ConsoleMessage.MessageLevel.Log;
    return new WebInspector.ConsoleMessage(WebInspector.ConsoleMessage.MessageSource.JS, WebInspector.ConsoleMessage.MessageType.Log, level, 0, null, 1, null, [text], null);
}

WebInspector.ConsoleMessage.prototype = {
    _formatMessage: function()
    {
        var stackTrace = this._stackTrace;

        this._formattedMessage = document.createElement("span");
        this._formattedMessage.className = "console-message-text source-code";

        var messageText;
        switch (this.type) {
            case WebInspector.ConsoleMessage.MessageType.Trace:
                messageText = document.createTextNode("console.trace()");
                break;
            case WebInspector.ConsoleMessage.MessageType.UncaughtException:
                messageText = document.createTextNode(this._messageText);
                break;
            case WebInspector.ConsoleMessage.MessageType.NetworkError:
                if (this._request) {
                    stackTrace = this._request.stackTrace;

                    messageText = document.createElement("span");
                    messageText.appendChild(document.createTextNode(this._request.requestMethod + " "));
                    var anchor = WebInspector.linkifyURLAsNode(this._request.url);
                    anchor.setAttribute("request_id", this._request.requestId);
                    anchor.setAttribute("preferred_panel", "network");
                    messageText.appendChild(anchor);
                    if (this._request.failed)
                        messageText.appendChild(document.createTextNode(" " + this._request.localizedFailDescription));
                    else
                        messageText.appendChild(document.createTextNode(" " + this._request.statusCode + " (" + this._request.statusText + ")"));
                } else {
                    var isExternal = !WebInspector.resourceForURL(this.url);
                    var anchor = WebInspector.linkifyURLAsNode(this.url, this.url, "console-message-url", isExternal);
                    this._formattedMessage.appendChild(anchor);
                    messageText = this._format([this._messageText]);
                }
                break;
            case WebInspector.ConsoleMessage.MessageType.Assert:
                var args = [WebInspector.UIString("Assertion failed:")];
                if (this._parameters)
                    args = args.concat(this._parameters);
                messageText = this._format(args);
                break;
            case WebInspector.ConsoleMessage.MessageType.Object:
                var obj = this._parameters ? this._parameters[0] : undefined;
                var args = ["%O", obj];
                messageText = this._format(args);
                break;
            default:
                var args = this._parameters || [this._messageText];
                messageText = this._format(args);
                break;
        }

        if (this.type !== WebInspector.ConsoleMessage.MessageType.NetworkError) {
            if (this._stackTrace && this._stackTrace.length && this._stackTrace[0].url) {
                var urlElement = this._linkifyCallFrame(this._stackTrace[0]);
                this._formattedMessage.appendChild(urlElement);
            } else if (this.url && this.url !== "undefined") {
                var urlElement = this._linkifyLocation(this.url, this.line, 0);
                this._formattedMessage.appendChild(urlElement);
            }
        }

        this._formattedMessage.appendChild(messageText);

        if (this._stackTrace) {
            switch (this.type) {
                case WebInspector.ConsoleMessage.MessageType.Trace:
                case WebInspector.ConsoleMessage.MessageType.UncaughtException:
                case WebInspector.ConsoleMessage.MessageType.NetworkError:
                case WebInspector.ConsoleMessage.MessageType.Assert: {
                    var ol = document.createElement("ol");
                    ol.className = "outline-disclosure";
                    var treeOutline = new TreeOutline(ol);

                    var content = this._formattedMessage;
                    var root = new TreeElement(content, null, true);
                    content.treeElementForTest = root;
                    treeOutline.appendChild(root);
                    if (this.type === WebInspector.ConsoleMessage.MessageType.Trace)
                        root.expand();

                    this._populateStackTraceTreeElement(root);
                    this._formattedMessage = ol;
                }
            }
        }

        // This is used for inline message bubbles in SourceFrames, or other plain-text representations.
        this.message = (urlElement ? urlElement.textContent + " " : "") + messageText.textContent;
    },

    _linkifyLocation: function(url, lineNumber, columnNumber)
    {
        // FIXME(62725): stack trace line/column numbers are one-based.
        lineNumber = lineNumber ? lineNumber - 1 : undefined;
        columnNumber = columnNumber ? columnNumber - 1 : 0;
        return WebInspector.debuggerPresentationModel.linkifyLocation(url, lineNumber, columnNumber, "console-message-url");
    },

    _linkifyCallFrame: function(callFrame)
    {
        return this._linkifyLocation(callFrame.url, callFrame.lineNumber, callFrame.columnNumber);
    },

    isErrorOrWarning: function()
    {
        return (this.level === WebInspector.ConsoleMessage.MessageLevel.Warning || this.level === WebInspector.ConsoleMessage.MessageLevel.Error);
    },

    _format: function(parameters)
    {
        // This node is used like a Builder. Values are continually appended onto it.
        var formattedResult = document.createElement("span");
        if (!parameters.length)
            return formattedResult;

        // Formatting code below assumes that parameters are all wrappers whereas frontend console
        // API allows passing arbitrary values as messages (strings, numbers, etc.). Wrap them here.
        for (var i = 0; i < parameters.length; ++i) {
            // FIXME: Only pass runtime wrappers here.
            if (parameters[i] instanceof WebInspector.RemoteObject)
                continue;

            if (typeof parameters[i] === "object")
                parameters[i] = WebInspector.RemoteObject.fromPayload(parameters[i]);
            else
                parameters[i] = WebInspector.RemoteObject.fromPrimitiveValue(parameters[i]);
        }

        // There can be string log and string eval result. We distinguish between them based on message type.
        var shouldFormatMessage = WebInspector.RemoteObject.type(parameters[0]) === "string" && this.type !== WebInspector.ConsoleMessage.MessageType.Result;

        // Multiple parameters with the first being a format string. Save unused substitutions.
        if (shouldFormatMessage) {
            // Multiple parameters with the first being a format string. Save unused substitutions.
            var result = this._formatWithSubstitutionString(parameters, formattedResult);
            parameters = result.unusedSubstitutions;
            if (parameters.length)
                formattedResult.appendChild(document.createTextNode(" "));
        }

        // Single parameter, or unused substitutions from above.
        for (var i = 0; i < parameters.length; ++i) {
            // Inline strings when formatting.
            if (shouldFormatMessage && parameters[i].type === "string")
                formattedResult.appendChild(document.createTextNode(parameters[i].description));
            else
                formattedResult.appendChild(WebInspector.consoleView._format(parameters[i]));
            if (i < parameters.length - 1)
                formattedResult.appendChild(document.createTextNode(" "));
        }
        return formattedResult;
    },

    _formatWithSubstitutionString: function(parameters, formattedResult)
    {
        var formatters = {}

        function consoleFormatWrapper(force)
        {
            return function(obj) {
                return WebInspector.consoleView._format(obj, force);
            };
        }

        function valueFormatter(obj)
        {
            return obj.description;
        }

        // Firebug uses %o for formatting objects.
        formatters.o = consoleFormatWrapper(false);
        formatters.s = valueFormatter;
        formatters.f = valueFormatter;
        // Firebug allows both %i and %d for formatting integers.
        formatters.i = valueFormatter;
        formatters.d = valueFormatter;

        // Support %O to force object formatting, instead of the type-based %o formatting.
        formatters.O = consoleFormatWrapper(true);

        function append(a, b)
        {
            if (!(b instanceof Node))
                a.appendChild(WebInspector.linkifyStringAsFragment(b.toString()));
            else
                a.appendChild(b);
            return a;
        }

        // String.format does treat formattedResult like a Builder, result is an object.
        return String.format(parameters[0].description, parameters.slice(1), formatters, formattedResult, append);
    },

    clearHighlight: function()
    {
        var highlightedMessage = this._formattedMessage;
        delete this._formattedMessage;
        this._formatMessage();
        this._element.replaceChild(this._formattedMessage, highlightedMessage);
    },

    highlightSearchResults: function(regexObject)
    {
        regexObject.lastIndex = 0;
        var text = this.message;
        var match = regexObject.exec(text);
        var offset = 0;
        var matchRanges = [];
        while (match) {
            matchRanges.push({ offset: match.index, length: match[0].length });
            match = regexObject.exec(text);
        }
        highlightSearchResults(this._formattedMessage, matchRanges);
        this._element.scrollIntoViewIfNeeded();
    },

    matchesRegex: function(regexObject)
    {
        return regexObject.test(this.message);
    },

    toMessageElement: function()
    {
        if (this._element)
            return this._element;

        var element = document.createElement("div");
        element.message = this;
        element.className = "console-message";

        this._element = element;

        switch (this.level) {
            case WebInspector.ConsoleMessage.MessageLevel.Tip:
                element.addStyleClass("console-tip-level");
                break;
            case WebInspector.ConsoleMessage.MessageLevel.Log:
                element.addStyleClass("console-log-level");
                break;
            case WebInspector.ConsoleMessage.MessageLevel.Debug:
                element.addStyleClass("console-debug-level");
                break;
            case WebInspector.ConsoleMessage.MessageLevel.Warning:
                element.addStyleClass("console-warning-level");
                break;
            case WebInspector.ConsoleMessage.MessageLevel.Error:
                element.addStyleClass("console-error-level");
                break;
        }

        if (this.type === WebInspector.ConsoleMessage.MessageType.StartGroup || this.type === WebInspector.ConsoleMessage.MessageType.StartGroupCollapsed)
            element.addStyleClass("console-group-title");

        element.appendChild(this._formattedMessage);

        if (this.repeatCount > 1)
            this._updateRepeatCount();

        return element;
    },

    _populateStackTraceTreeElement: function(parentTreeElement)
    {
        for (var i = 0; i < this._stackTrace.length; i++) {
            var frame = this._stackTrace[i];

            var content = document.createElement("div");
            var messageTextElement = document.createElement("span");
            messageTextElement.className = "console-message-text source-code";
            var functionName = frame.functionName || WebInspector.UIString("(anonymous function)");
            messageTextElement.appendChild(document.createTextNode(functionName));
            content.appendChild(messageTextElement);

            if (frame.url) {
                var urlElement = this._linkifyCallFrame(frame);
                content.appendChild(urlElement);
            }

            var treeElement = new TreeElement(content);
            parentTreeElement.appendChild(treeElement);
        }
    },

    _updateRepeatCount: function() {
        if (!this.repeatCountElement) {
            this.repeatCountElement = document.createElement("span");
            this.repeatCountElement.className = "bubble";

            this._element.insertBefore(this.repeatCountElement, this._element.firstChild);
            this._element.addStyleClass("repeated-message");
        }
        this.repeatCountElement.textContent = this.repeatCount;
    },

    toString: function()
    {
        var sourceString;
        switch (this.source) {
            case WebInspector.ConsoleMessage.MessageSource.HTML:
                sourceString = "HTML";
                break;
            case WebInspector.ConsoleMessage.MessageSource.XML:
                sourceString = "XML";
                break;
            case WebInspector.ConsoleMessage.MessageSource.JS:
                sourceString = "JS";
                break;
            case WebInspector.ConsoleMessage.MessageSource.CSS:
                sourceString = "CSS";
                break;
            case WebInspector.ConsoleMessage.MessageSource.Other:
                sourceString = "Other";
                break;
        }

        var typeString;
        switch (this.type) {
            case WebInspector.ConsoleMessage.MessageType.Log:
            case WebInspector.ConsoleMessage.MessageType.UncaughtException:
            case WebInspector.ConsoleMessage.MessageType.NetworkError:
                typeString = "Log";
                break;
            case WebInspector.ConsoleMessage.MessageType.Object:
                typeString = "Object";
                break;
            case WebInspector.ConsoleMessage.MessageType.Trace:
                typeString = "Trace";
                break;
            case WebInspector.ConsoleMessage.MessageType.StartGroupCollapsed:
            case WebInspector.ConsoleMessage.MessageType.StartGroup:
                typeString = "Start Group";
                break;
            case WebInspector.ConsoleMessage.MessageType.EndGroup:
                typeString = "End Group";
                break;
            case WebInspector.ConsoleMessage.MessageType.Assert:
                typeString = "Assert";
                break;
            case WebInspector.ConsoleMessage.MessageType.Result:
                typeString = "Result";
                break;
        }

        var levelString;
        switch (this.level) {
            case WebInspector.ConsoleMessage.MessageLevel.Tip:
                levelString = "Tip";
                break;
            case WebInspector.ConsoleMessage.MessageLevel.Log:
                levelString = "Log";
                break;
            case WebInspector.ConsoleMessage.MessageLevel.Warning:
                levelString = "Warning";
                break;
            case WebInspector.ConsoleMessage.MessageLevel.Debug:
                levelString = "Debug";
                break;
            case WebInspector.ConsoleMessage.MessageLevel.Error:
                levelString = "Error";
                break;
        }

        return sourceString + " " + typeString + " " + levelString + ": " + this._formattedMessage.textContent + "\n" + this.url + " line " + this.line;
    },

    get text()
    {
        return this._messageText;
    },

    isEqual: function(msg)
    {
        if (!msg)
            return false;

        if (this._stackTrace) {
            if (!msg._stackTrace)
                return false;
            var l = this._stackTrace;
            var r = msg._stackTrace;
            for (var i = 0; i < l.length; i++) {
                if (l[i].url !== r[i].url ||
                    l[i].functionName !== r[i].functionName ||
                    l[i].lineNumber !== r[i].lineNumber ||
                    l[i].columnNumber !== r[i].columnNumber)
                    return false;
            }
        }

        return (this.source === msg.source)
            && (this.type === msg.type)
            && (this.level === msg.level)
            && (this.line === msg.line)
            && (this.url === msg.url)
            && (this.message === msg.message)
            && (this._request === msg._request);
    },

    get stackTrace()
    {
        return this._stackTrace;
    }
}

// Note: Keep these constants in sync with the ones in Console.h
WebInspector.ConsoleMessage.MessageSource = {
    HTML: "html",
    XML: "xml",
    JS: "javascript",
    CSS: "css",
    Other: "other"
}

WebInspector.ConsoleMessage.MessageType = {
    Log: "log",
    Object: "other",
    Trace: "trace",
    StartGroup: "startGroup",
    StartGroupCollapsed: "startGroupCollapsed",
    EndGroup: "endGroup",
    Assert: "assert",
    UncaughtException: "uncaughtException",
    NetworkError: "networkError",
    Result: "result"
}

WebInspector.ConsoleMessage.MessageLevel = {
    Tip: "tip",
    Log: "log",
    Warning: "warning",
    Error: "error",
    Debug: "debug"
}
