/*
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

const ExpressionStopCharacters = " =:[({;,!+-*/&|^<>";

WebInspector.ConsoleView = function(drawer)
{
    WebInspector.View.call(this, document.getElementById("console-view"));

    this.messages = [];
    this.drawer = drawer;

    this.clearButton = document.getElementById("clear-console-status-bar-item");
    this.clearButton.title = WebInspector.UIString("Clear console log.");
    this.clearButton.addEventListener("click", this._clearButtonClicked.bind(this), false);

    this.messagesElement = document.getElementById("console-messages");
    this.messagesElement.addEventListener("selectstart", this._messagesSelectStart.bind(this), false);
    this.messagesElement.addEventListener("click", this._messagesClicked.bind(this), true);

    this.promptElement = document.getElementById("console-prompt");
    this.promptElement.className = "source-code";
    this.promptElement.addEventListener("keydown", this._promptKeyDown.bind(this), true);
    this.prompt = new WebInspector.TextPrompt(this.promptElement, this.completions.bind(this), ExpressionStopCharacters + ".");
    WebInspector.applicationSettings.addEventListener("loaded", this._settingsLoaded, this);

    this.topGroup = new WebInspector.ConsoleGroup(null, 0);
    this.messagesElement.insertBefore(this.topGroup.element, this.promptElement);
    this.groupLevel = 0;
    this.currentGroup = this.topGroup;

    this.toggleConsoleButton = document.getElementById("console-status-bar-item");
    this.toggleConsoleButton.title = WebInspector.UIString("Show console.");
    this.toggleConsoleButton.addEventListener("click", this._toggleConsoleButtonClicked.bind(this), false);

    // Will hold the list of filter elements
    this.filterBarElement = document.getElementById("console-filter");

    function createDividerElement() {
        var dividerElement = document.createElement("div");
        dividerElement.addStyleClass("divider");
        this.filterBarElement.appendChild(dividerElement);
    }

    var updateFilterHandler = this._updateFilter.bind(this);
    function createFilterElement(category) {
        var categoryElement = document.createElement("li");
        categoryElement.category = category;
        categoryElement.addStyleClass(categoryElement.category);            
        categoryElement.addEventListener("click", updateFilterHandler, false);

        var label = category.toString();
        categoryElement.appendChild(document.createTextNode(label));

        this.filterBarElement.appendChild(categoryElement);
        return categoryElement;
    }
    
    this.allElement = createFilterElement.call(this, WebInspector.UIString("All"));
    createDividerElement.call(this);
    this.errorElement = createFilterElement.call(this, WebInspector.UIString("Errors"));
    this.warningElement = createFilterElement.call(this, WebInspector.UIString("Warnings"));
    this.logElement = createFilterElement.call(this, WebInspector.UIString("Logs"));

    this.filter(this.allElement, false);
    this._registerShortcuts();

    this.messagesElement.addEventListener("contextmenu", this._handleContextMenuEvent.bind(this), true);
    
    this._customFormatters = {
        "object": this._formatobject,
        "array":  this._formatarray,
        "node":   this._formatnode,
        "string": this._formatstring
    };
}

WebInspector.ConsoleView.prototype = {
    _settingsLoaded: function()
    {
        this.prompt.history = WebInspector.applicationSettings.consoleHistory;
    },
    
    _updateFilter: function(e)
    {
        var isMac = WebInspector.isMac();
        var selectMultiple = false;
        if (isMac && e.metaKey && !e.ctrlKey && !e.altKey && !e.shiftKey)
            selectMultiple = true;
        if (!isMac && e.ctrlKey && !e.metaKey && !e.altKey && !e.shiftKey)
            selectMultiple = true;

        this.filter(e.target, selectMultiple);
    },
    
    filter: function(target, selectMultiple)
    {
        function unselectAll()
        {
            this.allElement.removeStyleClass("selected");
            this.errorElement.removeStyleClass("selected");
            this.warningElement.removeStyleClass("selected");
            this.logElement.removeStyleClass("selected");
            
            this.messagesElement.removeStyleClass("filter-all");
            this.messagesElement.removeStyleClass("filter-errors");
            this.messagesElement.removeStyleClass("filter-warnings");
            this.messagesElement.removeStyleClass("filter-logs");
        }
        
        var targetFilterClass = "filter-" + target.category.toLowerCase();

        if (target.category == "All") {
            if (target.hasStyleClass("selected")) {
                // We can't unselect all, so we break early here
                return;
            }

            unselectAll.call(this);
        } else {
            // Something other than all is being selected, so we want to unselect all
            if (this.allElement.hasStyleClass("selected")) {
                this.allElement.removeStyleClass("selected");
                this.messagesElement.removeStyleClass("filter-all");
            }
        }
        
        if (!selectMultiple) {
            // If multiple selection is off, we want to unselect everything else
            // and just select ourselves.
            unselectAll.call(this);
            
            target.addStyleClass("selected");
            this.messagesElement.addStyleClass(targetFilterClass);
            
            return;
        }
        
        if (target.hasStyleClass("selected")) {
            // If selectMultiple is turned on, and we were selected, we just
            // want to unselect ourselves.
            target.removeStyleClass("selected");
            this.messagesElement.removeStyleClass(targetFilterClass);
        } else {
            // If selectMultiple is turned on, and we weren't selected, we just
            // want to select ourselves.
            target.addStyleClass("selected");
            this.messagesElement.addStyleClass(targetFilterClass);
        }
    },
    
    _toggleConsoleButtonClicked: function()
    {
        this.drawer.visibleView = this;
    },

    attach: function(mainElement, statusBarElement)
    {
        mainElement.appendChild(this.element);
        statusBarElement.appendChild(this.clearButton);
        statusBarElement.appendChild(this.filterBarElement);
    },

    show: function()
    {
        this.toggleConsoleButton.addStyleClass("toggled-on");
        this.toggleConsoleButton.title = WebInspector.UIString("Hide console.");
        if (!this.prompt.isCaretInsidePrompt())
            this.prompt.moveCaretToEndOfPrompt();
    },

    afterShow: function()
    {
        WebInspector.currentFocusElement = this.promptElement;  
    },

    hide: function()
    {
        this.toggleConsoleButton.removeStyleClass("toggled-on");
        this.toggleConsoleButton.title = WebInspector.UIString("Show console.");
    },

    _scheduleScrollIntoView: function()
    {
        if (this._scrollIntoViewTimer)
            return;

        function scrollIntoView()
        {
            this.promptElement.scrollIntoView(false);
            delete this._scrollIntoViewTimer;
        }
        this._scrollIntoViewTimer = setTimeout(scrollIntoView.bind(this), 20);
    },

    addMessage: function(msg)
    {
        if (msg instanceof WebInspector.ConsoleMessage && !(msg instanceof WebInspector.ConsoleCommandResult)) {
            this._incrementErrorWarningCount(msg);

            // Add message to the resource panel
            if (msg.url in WebInspector.resourceURLMap) {
                msg.resource = WebInspector.resourceURLMap[msg.url];
                if (WebInspector.panels.resources)
                    WebInspector.panels.resources.addMessageToResource(msg.resource, msg);
            }

            this.commandSincePreviousMessage = false;
            this.previousMessage = msg;
        } else if (msg instanceof WebInspector.ConsoleCommand) {
            if (this.previousMessage) {
                this.commandSincePreviousMessage = true;
            }
        }

        this.messages.push(msg);

        if (msg.type === WebInspector.ConsoleMessage.MessageType.EndGroup) {
            if (this.groupLevel < 1)
                return;

            this.groupLevel--;

            this.currentGroup = this.currentGroup.parentGroup;
        } else {
            if (msg.type === WebInspector.ConsoleMessage.MessageType.StartGroup || msg.type === WebInspector.ConsoleMessage.MessageType.StartGroupCollapsed) {
                this.groupLevel++;

                var group = new WebInspector.ConsoleGroup(this.currentGroup, this.groupLevel);
                this.currentGroup.messagesElement.appendChild(group.element);
                this.currentGroup = group;
            }

            this.currentGroup.addMessage(msg);
        }

        this._scheduleScrollIntoView();
    },

    updateMessageRepeatCount: function(count)
    {
        var msg = this.previousMessage;
        var prevRepeatCount = msg.totalRepeatCount;
        
        if (!this.commandSincePreviousMessage) {
            msg.repeatDelta = count - prevRepeatCount;
            msg.repeatCount = msg.repeatCount + msg.repeatDelta;
            msg.totalRepeatCount = count;
            msg._updateRepeatCount();
            this._incrementErrorWarningCount(msg);
        } else {
            var msgCopy = new WebInspector.ConsoleMessage(msg.source, msg.type, msg.level, msg.line, msg.url, msg.groupLevel, count - prevRepeatCount, msg._messageText, msg._parameters, msg._stackTrace);
            msgCopy.totalRepeatCount = count;
            msgCopy._formatMessage();
            this.addMessage(msgCopy);
        }
    },

    _incrementErrorWarningCount: function(msg)
    {
        switch (msg.level) {
            case WebInspector.ConsoleMessage.MessageLevel.Warning:
                WebInspector.warnings += msg.repeatDelta;
                break;
            case WebInspector.ConsoleMessage.MessageLevel.Error:
                WebInspector.errors += msg.repeatDelta;
                break;
        }
    },

    requestClearMessages: function()
    {
        InspectorBackend.clearConsoleMessages();
    },

    clearMessages: function()
    {
        if (WebInspector.panels.resources)
            WebInspector.panels.resources.clearMessages();

        this.messages = [];

        this.groupLevel = 0;
        this.currentGroup = this.topGroup;
        this.topGroup.messagesElement.removeChildren();

        WebInspector.errors = 0;
        WebInspector.warnings = 0;

        delete this.commandSincePreviousMessage;
        delete this.previousMessage;
    },

    completions: function(wordRange, bestMatchOnly, completionsReadyCallback)
    {
        // Pass less stop characters to rangeOfWord so the range will be a more complete expression.
        var expressionRange = wordRange.startContainer.rangeOfWord(wordRange.startOffset, ExpressionStopCharacters, this.promptElement, "backward");
        var expressionString = expressionRange.toString();
        var lastIndex = expressionString.length - 1;

        var dotNotation = (expressionString[lastIndex] === ".");
        var bracketNotation = (expressionString[lastIndex] === "[");

        if (dotNotation || bracketNotation)
            expressionString = expressionString.substr(0, lastIndex);

        var prefix = wordRange.toString();
        if (!expressionString && !prefix)
            return;

        var reportCompletions = this._reportCompletions.bind(this, bestMatchOnly, completionsReadyCallback, dotNotation, bracketNotation, prefix);
        // Collect comma separated object properties for the completion.

        var includeInspectorCommandLineAPI = (!dotNotation && !bracketNotation);
        var callFrameId = WebInspector.panels.scripts.selectedCallFrameId();
        var injectedScriptAccess;
        if (WebInspector.panels.scripts && WebInspector.panels.scripts.paused) {
            var selectedCallFrame = WebInspector.panels.scripts.sidebarPanes.callstack.selectedCallFrame;
            injectedScriptAccess = InjectedScriptAccess.get(selectedCallFrame.injectedScriptId);
        } else
            injectedScriptAccess = InjectedScriptAccess.getDefault();
        injectedScriptAccess.getCompletions(expressionString, includeInspectorCommandLineAPI, callFrameId, reportCompletions);
    },

    _reportCompletions: function(bestMatchOnly, completionsReadyCallback, dotNotation, bracketNotation, prefix, result, isException) {
        if (isException)
            return;

        if (bracketNotation) {
            if (prefix.length && prefix[0] === "'")
                var quoteUsed = "'";
            else
                var quoteUsed = "\"";
        }

        var results = [];
        var properties = Object.sortedProperties(result);

        for (var i = 0; i < properties.length; ++i) {
            var property = properties[i];

            if (dotNotation && !/^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(property))
                continue;

            if (bracketNotation) {
                if (!/^[0-9]+$/.test(property))
                    property = quoteUsed + property.escapeCharacters(quoteUsed + "\\") + quoteUsed;
                property += "]";
            }

            if (property.length < prefix.length)
                continue;
            if (property.indexOf(prefix) !== 0)
                continue;

            results.push(property);
            if (bestMatchOnly)
                break;
        }
        completionsReadyCallback(results);
    },

    _clearButtonClicked: function()
    {
        this.requestClearMessages();
    },

    _handleContextMenuEvent: function(event)
    {
        if (!window.getSelection().isCollapsed) {
            // If there is a selection, we want to show our normal context menu
            // (with Copy, etc.), and not Clear Console.
            return;
        }

        var contextMenu = new WebInspector.ContextMenu();
        if (!WebInspector.monitoringXHREnabled)
            contextMenu.appendItem(WebInspector.UIString("Enable XMLHttpRequest logging"), InspectorBackend.enableMonitoringXHR.bind(InspectorBackend));
        else
            contextMenu.appendItem(WebInspector.UIString("Disable XMLHttpRequest logging"), InspectorBackend.disableMonitoringXHR.bind(InspectorBackend));
        contextMenu.appendItem(WebInspector.UIString("Clear Console"), this.requestClearMessages.bind(this));
        contextMenu.show(event);
    },

    _messagesSelectStart: function(event)
    {
        if (this._selectionTimeout)
            clearTimeout(this._selectionTimeout);

        this.prompt.clearAutoComplete();

        function moveBackIfOutside()
        {
            delete this._selectionTimeout;
            if (!this.prompt.isCaretInsidePrompt() && window.getSelection().isCollapsed)
                this.prompt.moveCaretToEndOfPrompt();
            this.prompt.autoCompleteSoon();
        }

        this._selectionTimeout = setTimeout(moveBackIfOutside.bind(this), 100);
    },

    _messagesClicked: function(event)
    {
        var link = event.target.enclosingNodeOrSelfWithNodeName("a");
        if (!link || !link.representedNode)
            return;

        WebInspector.updateFocusedNode(link.representedNode.id);
        event.stopPropagation();
        event.preventDefault();
    },

    _registerShortcuts: function()
    {
        this._shortcuts = {};

        var shortcut = WebInspector.KeyboardShortcut;
        var shortcutK = shortcut.makeDescriptor("k", WebInspector.KeyboardShortcut.Modifiers.Meta);
        // This case requires a separate bound function as its isMacOnly property should not be shared among different shortcut handlers.
        this._shortcuts[shortcutK.key] = this.requestClearMessages.bind(this);
        this._shortcuts[shortcutK.key].isMacOnly = true;

        var clearConsoleHandler = this.requestClearMessages.bind(this);
        var shortcutL = shortcut.makeDescriptor("l", WebInspector.KeyboardShortcut.Modifiers.Ctrl);
        this._shortcuts[shortcutL.key] = clearConsoleHandler;

        var section = WebInspector.shortcutsHelp.section(WebInspector.UIString("Console"));
        var keys = WebInspector.isMac() ? [ shortcutK.name, shortcutL.name ] : [ shortcutL.name ];
        section.addAlternateKeys(keys, WebInspector.UIString("Clear Console"));

        keys = [
            shortcut.shortcutToString(shortcut.Keys.Tab),
            shortcut.shortcutToString(shortcut.Keys.Tab, shortcut.Modifiers.Shift)
        ];
        section.addRelatedKeys(keys, WebInspector.UIString("Next/previous suggestion"));
        section.addKey(shortcut.shortcutToString(shortcut.Keys.Right), WebInspector.UIString("Accept suggestion"));
        keys = [
            shortcut.shortcutToString(shortcut.Keys.Down),
            shortcut.shortcutToString(shortcut.Keys.Up)
        ];
        section.addRelatedKeys(keys, WebInspector.UIString("Next/previous line"));
        keys = [
            shortcut.shortcutToString("N", shortcut.Modifiers.Alt),
            shortcut.shortcutToString("P", shortcut.Modifiers.Alt)
        ];
        if (WebInspector.isMac())
            section.addRelatedKeys(keys, WebInspector.UIString("Next/previous command"));
        section.addKey(shortcut.shortcutToString(shortcut.Keys.Enter), WebInspector.UIString("Execute command"));
    },

    _promptKeyDown: function(event)
    {
        if (isEnterKey(event)) {
            this._enterKeyPressed(event);
            return;
        }

        var shortcut = WebInspector.KeyboardShortcut.makeKeyFromEvent(event);
        var handler = this._shortcuts[shortcut];
        if (handler) {
            if (!this._shortcuts[shortcut].isMacOnly || WebInspector.isMac()) {
                handler();
                event.preventDefault();
                return;
            }
        }
    },

    evalInInspectedWindow: function(expression, objectGroup, callback)
    {
        if (WebInspector.panels.scripts && WebInspector.panels.scripts.paused) {
            WebInspector.panels.scripts.evaluateInSelectedCallFrame(expression, false, objectGroup, callback);
            return;
        }
        this.doEvalInWindow(expression, objectGroup, callback);
    },

    doEvalInWindow: function(expression, objectGroup, callback)
    {
        if (!expression) {
            // There is no expression, so the completion should happen against global properties.
            expression = "this";
        }

        function evalCallback(result)
        {
            callback(result.value, result.isException);
        };
        InjectedScriptAccess.getDefault().evaluate(expression, objectGroup, evalCallback);
    },

    _enterKeyPressed: function(event)
    {
        if (event.altKey)
            return;

        event.preventDefault();
        event.stopPropagation();

        this.prompt.clearAutoComplete(true);

        var str = this.prompt.text;
        if (!str.length)
            return;

        var commandMessage = new WebInspector.ConsoleCommand(str);
        this.addMessage(commandMessage);

        var self = this;
        function printResult(result, exception)
        {
            self.prompt.history.push(str);
            self.prompt.historyOffset = 0;
            self.prompt.text = "";

            WebInspector.applicationSettings.consoleHistory = self.prompt.history.slice(-30);

            self.addMessage(new WebInspector.ConsoleCommandResult(result, exception, commandMessage));
        }
        this.evalInInspectedWindow(str, "console", printResult);
    },

    _format: function(output, forceObjectFormat)
    {
        var isProxy = (output != null && typeof output === "object");
        var type = (forceObjectFormat ? "object" : Object.proxyType(output));

        var formatter = this._customFormatters[type];
        if (!formatter || !isProxy) {
            formatter = this._formatvalue;
            output = output.description;
        }

        var span = document.createElement("span");
        span.className = "console-formatted-" + type + " source-code";
        formatter.call(this, output, span);
        return span;
    },

    _formatvalue: function(val, elem)
    {
        elem.appendChild(document.createTextNode(val));
    },

    _formatobject: function(obj, elem)
    {
        elem.appendChild(new WebInspector.ObjectPropertiesSection(obj, obj.description, null, true).element);
    },

    _formatnode: function(object, elem)
    {
        function printNode(nodeId)
        {
            if (!nodeId)
                return;
            var treeOutline = new WebInspector.ElementsTreeOutline();
            treeOutline.showInElementsPanelEnabled = true;
            treeOutline.rootDOMNode = WebInspector.domAgent.nodeForId(nodeId);
            treeOutline.element.addStyleClass("outline-disclosure");
            if (!treeOutline.children[0].hasChildren)
                treeOutline.element.addStyleClass("single-node");
            elem.appendChild(treeOutline.element);
        }

        InjectedScriptAccess.get(object.injectedScriptId).pushNodeToFrontend(object, printNode);
    },

    _formatarray: function(arr, elem)
    {
        InjectedScriptAccess.get(arr.injectedScriptId).getProperties(arr, false, false, this._printArray.bind(this, elem));
    },

    _formatstring: function(output, elem)
    {
        var span = document.createElement("span");
        span.className = "console-formatted-string source-code";
        span.appendChild(WebInspector.linkifyStringAsFragment(output.description));

        // Make black quotes.
        elem.removeStyleClass("console-formatted-string");
        elem.appendChild(document.createTextNode("\""));
        elem.appendChild(span);
        elem.appendChild(document.createTextNode("\""));
    },

    _printArray: function(elem, properties)
    {
        if (!properties)
            return;

        var elements = [];
        for (var i = 0; i < properties.length; ++i) {
            var name = properties[i].name;
            if (name == parseInt(name))
                elements[name] = this._formatAsArrayEntry(properties[i].value);
        }

        elem.appendChild(document.createTextNode("["));
        for (var i = 0; i < elements.length; ++i) {
            var element = elements[i];
            if (element)
                elem.appendChild(element);
            else
                elem.appendChild(document.createTextNode("undefined"))
            if (i < elements.length - 1)
                elem.appendChild(document.createTextNode(", "));
        }
        elem.appendChild(document.createTextNode("]"));
    },

    _formatAsArrayEntry: function(output)
    {
        var type = Object.proxyType(output);
        // Prevent infinite expansion of cross-referencing arrays.
        return this._format(output, type === "array");
    }
}

WebInspector.ConsoleView.prototype.__proto__ = WebInspector.View.prototype;

WebInspector.ConsoleMessage = function(source, type, level, line, url, groupLevel, repeatCount, message, parameters, stackTrace)
{
    this.source = source;
    this.type = type;
    this.level = level;
    this.line = line;
    this.url = url;
    this.groupLevel = groupLevel;
    this.repeatCount = repeatCount;
    this.repeatDelta = repeatCount;
    this.totalRepeatCount = repeatCount;
    this._messageText = message;
    this._parameters = parameters;
    this._stackTrace = stackTrace;
    this._formatMessage();
}

WebInspector.ConsoleMessage.createTextMessage = function(text, level)
{
    level = level || WebInspector.ConsoleMessage.MessageLevel.Log;
    return new WebInspector.ConsoleMessage(WebInspector.ConsoleMessage.MessageSource.JS, WebInspector.ConsoleMessage.MessageType.Log, level, 0, null, null, 1, null, [text], null);
}

WebInspector.ConsoleMessage.prototype = {
    _formatMessage: function()
    {
        switch (this.type) {
            case WebInspector.ConsoleMessage.MessageType.Trace:
                this.formattedMessage = this._createStackTraceElement();
                this.formattedMessage.addStyleClass("trace-message");
                break;
            case WebInspector.ConsoleMessage.MessageType.Object:
                var obj = this._parameters ? this._parameters[0] : undefined;
                this.formattedMessage = this._format(["%O", obj]);
                break;
            default:
                var args = this._parameters || [this._messageText];
                this.formattedMessage = this._format(args);
                break;
        }

        // This is used for inline message bubbles in SourceFrames, or other plain-text representations.
        this.message = this.formattedMessage.textContent;
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
        for (var i = 0; i < parameters.length; ++i)
            if (typeof parameters[i] !== "object" && typeof parameters[i] !== "function")
                parameters[i] = WebInspector.ObjectProxy.wrapPrimitiveValue(parameters[i]);

        // There can be string log and string eval result. We distinguish between them based on message type.
        var shouldFormatMessage = Object.proxyType(parameters[0]) === "string" && this.type !== WebInspector.ConsoleMessage.MessageType.Result;

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
                formattedResult.appendChild(WebInspector.console._format(parameters[i]));
            if (i < parameters.length - 1)
                formattedResult.appendChild(document.createTextNode(" "));
        }
        return formattedResult;
    },

    _formatWithSubstitutionString: function(parameters, formattedResult)
    {
        var formatters = {}
        for (var i in String.standardFormatters)
            formatters[i] = String.standardFormatters[i];

        function consoleFormatWrapper(force)
        {
            return function(obj) {
                return WebInspector.console._format(obj, force);
            };
        }

        // Firebug uses %o for formatting objects.
        formatters.o = consoleFormatWrapper();
        // Firebug allows both %i and %d for formatting integers.
        formatters.i = formatters.d;
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

    toMessageElement: function()
    {
        if (this._element)
            return this._element;

        var element = document.createElement("div");
        element.message = this;
        element.className = "console-message";

        this._element = element;

        switch (this.source) {
            case WebInspector.ConsoleMessage.MessageSource.HTML:
                element.addStyleClass("console-html-source");
                break;
            case WebInspector.ConsoleMessage.MessageSource.WML:
                element.addStyleClass("console-wml-source");
                break;
            case WebInspector.ConsoleMessage.MessageSource.XML:
                element.addStyleClass("console-xml-source");
                break;
            case WebInspector.ConsoleMessage.MessageSource.JS:
                element.addStyleClass("console-js-source");
                break;
            case WebInspector.ConsoleMessage.MessageSource.CSS:
                element.addStyleClass("console-css-source");
                break;
            case WebInspector.ConsoleMessage.MessageSource.Other:
                element.addStyleClass("console-other-source");
                break;
        }

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

        if (this.elementsTreeOutline) {
            element.addStyleClass("outline-disclosure");
            element.appendChild(this.elementsTreeOutline.element);
            return element;
        }

        if (this.type === WebInspector.ConsoleMessage.MessageType.Trace) {
            element.appendChild(this.formattedMessage);
        } else {
            if (this.url && this.url !== "undefined") {
                var urlElement = WebInspector.linkifyResourceAsNode(this.url, "scripts", this.line, "console-message-url"); 
                element.appendChild(urlElement);
            }

            var messageTextElement = document.createElement("span");
            messageTextElement.className = "console-message-text source-code";
            if (this.type === WebInspector.ConsoleMessage.MessageType.Assert)
                messageTextElement.appendChild(document.createTextNode(WebInspector.UIString("Assertion failed: ")));
            messageTextElement.appendChild(this.formattedMessage);
            element.appendChild(messageTextElement);

            if (this._stackTrace) {
                var ol = this._createStackTraceElement();
                element.appendChild(ol);
            }
        }

        if (this.repeatCount > 1)
            this._updateRepeatCount();

        return element;
    },

    _createStackTraceElement: function()
    {
        var ol = document.createElement("ol");
        ol.addStyleClass("stack-trace");
        var treeOutline = new TreeOutline(ol);
        for (var i = 0; i < this._stackTrace.length; i++) {
            var frame = this._stackTrace[i];

            var li = document.createElement("li");
            var messageTextElement = document.createElement("span");
            messageTextElement.className = "console-message-text source-code";
            var functionName = frame.functionName || WebInspector.UIString("(anonymous function)");
            messageTextElement.appendChild(document.createTextNode(functionName));
            li.appendChild(messageTextElement);

            var urlElement = WebInspector.linkifyResourceAsNode(frame.sourceURL, "scripts", frame.lineNumber, "console-message-url"); 
            li.appendChild(urlElement);


            var treeElement = new TreeElement(li.innerHTML);
            treeOutline.appendChild(treeElement);
        }
        return ol;
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
            case WebInspector.ConsoleMessage.MessageSource.WML:
                sourceString = "WML";
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

        return sourceString + " " + typeString + " " + levelString + ": " + this.formattedMessage.textContent + "\n" + this.url + " line " + this.line;
    },

    isEqual: function(msg, disreguardGroup)
    {
        if (!msg)
            return false;

        var ret = (this.source == msg.source)
            && (this.type == msg.type)
            && (this.level == msg.level)
            && (this.line == msg.line)
            && (this.url == msg.url)
            && (this.message == msg.message);

        return (disreguardGroup ? ret : (ret && (this.groupLevel == msg.groupLevel)));
    }
}

// Note: Keep these constants in sync with the ones in Console.h
WebInspector.ConsoleMessage.MessageSource = {
    HTML: 0,
    WML: 1,
    XML: 2,
    JS: 3,
    CSS: 4,
    Other: 5
}

WebInspector.ConsoleMessage.MessageType = {
    Log: 0,
    Object: 1,
    Trace: 2,
    StartGroup: 3,
    StartGroupCollapsed: 4,
    EndGroup: 5,
    Assert: 6,
    Result: 7
}

WebInspector.ConsoleMessage.MessageLevel = {
    Tip: 0,
    Log: 1,
    Warning: 2,
    Error: 3,
    Debug: 4
}

WebInspector.ConsoleCommand = function(command)
{
    this.command = command;
}

WebInspector.ConsoleCommand.prototype = {
    toMessageElement: function()
    {
        var element = document.createElement("div");
        element.command = this;
        element.className = "console-user-command";

        var commandTextElement = document.createElement("span");
        commandTextElement.className = "console-message-text source-code";
        commandTextElement.textContent = this.command;
        element.appendChild(commandTextElement);

        return element;
    }
}

WebInspector.ConsoleCommandResult = function(result, exception, originatingCommand)
{
    var level = (exception ? WebInspector.ConsoleMessage.MessageLevel.Error : WebInspector.ConsoleMessage.MessageLevel.Log);
    var message = result;
    if (exception) {
        // Distinguish between strings and errors (no need to quote latter).
        message = WebInspector.ObjectProxy.wrapPrimitiveValue(result);
        message.type = "error";
    }
    var line = (exception ? result.line : -1);
    var url = (exception ? result.sourceURL : null);

    this.originatingCommand = originatingCommand;

    WebInspector.ConsoleMessage.call(this, WebInspector.ConsoleMessage.MessageSource.JS, WebInspector.ConsoleMessage.MessageType.Result, level, line, url, null, 1, null, [message]);
}

WebInspector.ConsoleCommandResult.prototype = {
    toMessageElement: function()
    {
        var element = WebInspector.ConsoleMessage.prototype.toMessageElement.call(this);
        element.addStyleClass("console-user-command-result");
        return element;
    }
}

WebInspector.ConsoleCommandResult.prototype.__proto__ = WebInspector.ConsoleMessage.prototype;

WebInspector.ConsoleGroup = function(parentGroup, level)
{
    this.parentGroup = parentGroup;
    this.level = level;

    var element = document.createElement("div");
    element.className = "console-group";
    element.group = this;
    this.element = element;

    var messagesElement = document.createElement("div");
    messagesElement.className = "console-group-messages";
    element.appendChild(messagesElement);
    this.messagesElement = messagesElement;
}

WebInspector.ConsoleGroup.prototype = {
    addMessage: function(msg)
    {
        var element = msg.toMessageElement();

        if (msg.type === WebInspector.ConsoleMessage.MessageType.StartGroup || msg.type === WebInspector.ConsoleMessage.MessageType.StartGroupCollapsed) {
            this.messagesElement.parentNode.insertBefore(element, this.messagesElement);
            element.addEventListener("click", this._titleClicked.bind(this), true);
            var groupElement = element.enclosingNodeOrSelfWithClass("console-group");
            if (groupElement && msg.type === WebInspector.ConsoleMessage.MessageType.StartGroupCollapsed)
                groupElement.addStyleClass("collapsed");
        } else
            this.messagesElement.appendChild(element);

        if (element.previousSibling && msg.originatingCommand && element.previousSibling.command === msg.originatingCommand)
            element.previousSibling.addStyleClass("console-adjacent-user-command-result");
    },

    _titleClicked: function(event)
    {
        var groupTitleElement = event.target.enclosingNodeOrSelfWithClass("console-group-title");
        if (groupTitleElement) {
            var groupElement = groupTitleElement.enclosingNodeOrSelfWithClass("console-group");
            if (groupElement)
                if (groupElement.hasStyleClass("collapsed"))
                    groupElement.removeStyleClass("collapsed");
                else
                    groupElement.addStyleClass("collapsed");
            groupTitleElement.scrollIntoViewIfNeeded(true);
        }

        event.stopPropagation();
        event.preventDefault();
    }
}
