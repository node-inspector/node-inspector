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
    this.clearButton.addEventListener("click", this._requestClearMessages.bind(this), false);

    this._contextSelectElement = document.getElementById("console-context");
    if (WebInspector.WorkerManager.isWorkerFrontend())
        this._contextSelectElement.addStyleClass("hidden");

    this.messagesElement = document.getElementById("console-messages");
    this.messagesElement.addEventListener("click", this._messagesClicked.bind(this), true);

    this.promptElement = document.getElementById("console-prompt");
    this.promptElement.className = "source-code";
    this.promptElement.addEventListener("keydown", this._promptKeyDown.bind(this), true);
    this.prompt = new WebInspector.TextPrompt(this.promptElement, this.completions.bind(this), ExpressionStopCharacters + ".");
    this.prompt.history = WebInspector.settings.consoleHistory.get();

    this.topGroup = new WebInspector.ConsoleGroup(null);
    this.messagesElement.insertBefore(this.topGroup.element, this.promptElement);
    this.currentGroup = this.topGroup;

    this.toggleConsoleButton = new WebInspector.StatusBarButton(WebInspector.UIString("Show console."), "console-status-bar-item");
    this.toggleConsoleButton.addEventListener("click", this._toggleConsoleButtonClicked.bind(this), false);

    // Will hold the list of filter elements
    this.filterBarElement = document.getElementById("console-filter");

    function createDividerElement() {
        var dividerElement = document.createElement("div");
        dividerElement.addStyleClass("scope-bar-divider");
        this.filterBarElement.appendChild(dividerElement);
    }

    var updateFilterHandler = this._updateFilter.bind(this);
    function createFilterElement(category, label) {
        var categoryElement = document.createElement("li");
        categoryElement.category = category;
        categoryElement.className = category;
        categoryElement.addEventListener("click", updateFilterHandler, false);
        categoryElement.textContent = label;

        this.filterBarElement.appendChild(categoryElement);

        return categoryElement;
    }

    this.allElement = createFilterElement.call(this, "all", WebInspector.UIString("All"));
    createDividerElement.call(this);
    this.errorElement = createFilterElement.call(this, "errors", WebInspector.UIString("Errors"));
    this.warningElement = createFilterElement.call(this, "warnings", WebInspector.UIString("Warnings"));
    this.logElement = createFilterElement.call(this, "logs", WebInspector.UIString("Logs"));

    this.filter(this.allElement, false);
    this._registerShortcuts();

    this.messagesElement.addEventListener("contextmenu", this._handleContextMenuEvent.bind(this), false);

    this._customFormatters = {
        "object": this._formatobject,
        "array":  this._formatarray,
        "node":   this._formatnode,
        "string": this._formatstring
    };

    WebInspector.settings.monitoringXHREnabled.addChangeListener(this._monitoringXHREnabledSettingChanged.bind(this));

    WebInspector.console.addEventListener(WebInspector.ConsoleModel.Events.MessageAdded, this._consoleMessageAdded, this);
    WebInspector.console.addEventListener(WebInspector.ConsoleModel.Events.ConsoleCleared, this._consoleCleared, this);
}

WebInspector.ConsoleView.Events = {
  ConsoleCleared: "console-cleared",
  EntryAdded: "console-entry-added",
}

WebInspector.ConsoleView.prototype = {
    addContext: function(context)
    {
        var option = document.createElement("option");
        option.text = context.displayName;
        option.title = context.url;
        option._context = context;
        context._consoleOption = option;
        this._contextSelectElement.appendChild(option);
        context.addEventListener(WebInspector.FrameEvaluationContext.EventTypes.Updated, this._contextUpdated, this);
    },

    removeContext: function(context)
    {
        this._contextSelectElement.removeChild(context._consoleOption);
    },

    _contextUpdated: function(event)
    {
        var context = event.data;
        var option= context._consoleOption;
        option.text = context.displayName;
        option.title = context.url;
    },

    _currentEvaluationContextId: function()
    {
        if (this._contextSelectElement.selectedIndex === -1)
            return undefined;
        return this._contextSelectElement[this._contextSelectElement.selectedIndex]._context.frameId;
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

        var targetFilterClass = "filter-" + target.category;

        if (target.category === "all") {
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

    populateStatusBar: function(statusBarElement)
    {
        statusBarElement.appendChild(this.clearButton);
        statusBarElement.appendChild(this.filterBarElement);
    },

    show: function()
    {
        this.toggleConsoleButton.toggled = true;
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
        this.toggleConsoleButton.toggled = false;
        this.toggleConsoleButton.title = WebInspector.UIString("Show console.");
    },

    _isScrollIntoViewScheduled: function()
    {
        return !!this._scrollIntoViewTimer;
    },

    _scheduleScrollIntoView: function()
    {
        if (this._scrollIntoViewTimer)
            return;

        function scrollIntoView()
        {
            this.promptElement.scrollIntoView(true);
            delete this._scrollIntoViewTimer;
        }
        this._scrollIntoViewTimer = setTimeout(scrollIntoView.bind(this), 20);
    },

    _consoleMessageAdded: function(event)
    {
        this._appendConsoleMessage(event.data);
    },

    _appendConsoleMessage: function(msg)
    {
        // this.messagesElement.isScrolledToBottom() is forcing style recalculation.
        // We just skip it if the scroll action has been scheduled.
        if (!this._isScrollIntoViewScheduled() && ((msg instanceof WebInspector.ConsoleCommandResult) || this.messagesElement.isScrolledToBottom()))
            this._scheduleScrollIntoView();

        this.messages.push(msg);

        if (msg.type === WebInspector.ConsoleMessage.MessageType.EndGroup) {
            var parentGroup = this.currentGroup.parentGroup
            if (parentGroup)
                this.currentGroup = parentGroup;
        } else {
            if (msg.type === WebInspector.ConsoleMessage.MessageType.StartGroup || msg.type === WebInspector.ConsoleMessage.MessageType.StartGroupCollapsed) {
                var group = new WebInspector.ConsoleGroup(this.currentGroup);
                this.currentGroup.messagesElement.appendChild(group.element);
                this.currentGroup = group;
            }

            this.currentGroup.addMessage(msg);
        }

        this.dispatchEventToListeners(WebInspector.ConsoleView.Events.EntryAdded, msg);
    },

    _consoleCleared: function()
    {
        this.messages = [];

        this.currentGroup = this.topGroup;
        this.topGroup.messagesElement.removeChildren();

        delete this.commandSincePreviousMessage;
        delete this.previousMessage;

        this.dispatchEventToListeners(WebInspector.ConsoleView.Events.ConsoleCleared);
    },

    completions: function(wordRange, bestMatchOnly, completionsReadyCallback)
    {
        // Pass less stop characters to rangeOfWord so the range will be a more complete expression.
        var expressionRange = wordRange.startContainer.rangeOfWord(wordRange.startOffset, ExpressionStopCharacters, this.promptElement, "backward");
        var expressionString = expressionRange.toString();
        var prefix = wordRange.toString();
        this._completions(expressionString, prefix, bestMatchOnly, completionsReadyCallback);
    },

    _completions: function(expressionString, prefix, bestMatchOnly, completionsReadyCallback)
    {
        var lastIndex = expressionString.length - 1;

        var dotNotation = (expressionString[lastIndex] === ".");
        var bracketNotation = (expressionString[lastIndex] === "[");

        if (dotNotation || bracketNotation)
            expressionString = expressionString.substr(0, lastIndex);

        if (!expressionString && !prefix) {
            completionsReadyCallback([]);
            return;
        }

        if (parseInt(expressionString) == expressionString) {
            // User is entering float value, do not suggest anything.
            completionsReadyCallback([]);
            return;
        }

        if (!expressionString && WebInspector.panels.scripts.paused)
            WebInspector.panels.scripts.getSelectedCallFrameVariables(receivedPropertyNames.bind(this));
        else
            this.evalInInspectedWindow(expressionString, "completion", true, true, undefined, evaluated.bind(this));

        function evaluated(result, wasThrown)
        {
            if (!result || wasThrown) {
                completionsReadyCallback([]);
                return;
            }

            function getCompletions(primitiveType)
            {
                var object;
                if (primitiveType === "string")
                    object = new String();
                else if (primitiveType === "number")
                    object = new Number();
                else if (primitiveType === "boolean")
                    object = new Boolean();
                else
                    object = this;

                var resultSet = {};
                for (var o = object; o; o = o.__proto__) {
                    try {
                        var names = Object.getOwnPropertyNames(o);
                        for (var i = 0; i < names.length; ++i)
                            resultSet[names[i]] = true;
                    } catch (e) {
                    }
                }
                return resultSet;
            }

            if (result.type === "object" || result.type === "function")
                result.callFunctionJSON(getCompletions, receivedPropertyNames.bind(this));
            else if (result.type === "string" || result.type === "number" || result.type === "boolean")
                this.evalInInspectedWindow("(" + getCompletions + ")(\"" + result.type + "\")", "completion", undefined, true, true, receivedPropertyNamesFromEval.bind(this));
        }

        function receivedPropertyNamesFromEval(result, wasThrown)
        {
            if (result && !wasThrown)
                receivedPropertyNames.call(this, result.value);
            else
                completionsReadyCallback([]);
        }

        function receivedPropertyNames(propertyNames)
        {
            RuntimeAgent.releaseObjectGroup("completion");
            if (!propertyNames) {
                completionsReadyCallback([]);
                return;
            }
            var includeCommandLineAPI = (!dotNotation && !bracketNotation);
            if (includeCommandLineAPI) {
                const commandLineAPI = ["dir", "dirxml", "keys", "values", "profile", "profileEnd", "monitorEvents", "unmonitorEvents", "inspect", "copy", "clear"];
                for (var i = 0; i < commandLineAPI.length; ++i)
                    propertyNames[commandLineAPI[i]] = true;
            }
            this._reportCompletions(bestMatchOnly, completionsReadyCallback, dotNotation, bracketNotation, prefix, Object.keys(propertyNames));
        }
    },

    _reportCompletions: function(bestMatchOnly, completionsReadyCallback, dotNotation, bracketNotation, prefix, properties) {
        if (bracketNotation) {
            if (prefix.length && prefix[0] === "'")
                var quoteUsed = "'";
            else
                var quoteUsed = "\"";
        }

        var results = [];
        properties.sort();

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

    _handleContextMenuEvent: function(event)
    {
        if (!window.getSelection().isCollapsed) {
            // If there is a selection, we want to show our normal context menu
            // (with Copy, etc.), and not Clear Console.
            return;
        }

        var contextMenu = new WebInspector.ContextMenu();

        if (WebInspector.populateHrefContextMenu(contextMenu, null, event))
            contextMenu.appendSeparator();

        function monitoringXHRItemAction()
        {
            WebInspector.settings.monitoringXHREnabled.set(!WebInspector.settings.monitoringXHREnabled.get());
        }
        contextMenu.appendCheckboxItem(WebInspector.UIString("Log XMLHttpRequests"), monitoringXHRItemAction.bind(this), WebInspector.settings.monitoringXHREnabled.get());

        function preserveLogItemAction()
        {
            WebInspector.settings.preserveConsoleLog.set(!WebInspector.settings.preserveConsoleLog.get());
        }
        contextMenu.appendCheckboxItem(WebInspector.UIString(WebInspector.useLowerCaseMenuTitles() ? "Preserve log upon navigation" : "Preserve Log upon Navigation"), preserveLogItemAction.bind(this), WebInspector.settings.preserveConsoleLog.get());

        contextMenu.appendSeparator();
        contextMenu.appendItem(WebInspector.UIString(WebInspector.useLowerCaseMenuTitles() ? "Clear console" : "Clear Console"), this._requestClearMessages.bind(this));
        contextMenu.show(event);
    },

    _monitoringXHREnabledSettingChanged: function(event)
    {
        ConsoleAgent.setMonitoringXHREnabled(event.data);
    },

    _messagesClicked: function(event)
    {
        var link = event.target.enclosingNodeOrSelfWithNodeName("a");
        if (!link || !link.representedNode) {
            if (!this.prompt.isCaretInsidePrompt() && window.getSelection().isCollapsed)
                this.prompt.moveCaretToEndOfPrompt();
            return;
        }

        WebInspector.updateFocusedNode(link.representedNode.id);
        event.stopPropagation();
        event.preventDefault();
    },

    _registerShortcuts: function()
    {
        this._shortcuts = {};

        var shortcut = WebInspector.KeyboardShortcut;

        if (WebInspector.isMac()) {
            var shortcutK = shortcut.makeDescriptor("k", WebInspector.KeyboardShortcut.Modifiers.Meta);
            this._shortcuts[shortcutK.key] = this._requestClearMessages.bind(this);
        }

        var shortcutL = shortcut.makeDescriptor("l", WebInspector.KeyboardShortcut.Modifiers.Ctrl);
        this._shortcuts[shortcutL.key] = this._requestClearMessages.bind(this);

        var section = WebInspector.shortcutsScreen.section(WebInspector.UIString("Console"));
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

    _requestClearMessages: function()
    {
        WebInspector.console.requestClearMessages();
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
            handler();
            event.preventDefault();
            return;
        }
    },

    evalInInspectedWindow: function(expression, objectGroup, includeCommandLineAPI, doNotPauseOnExceptions, returnByValue, callback)
    {
        if (WebInspector.panels.scripts && WebInspector.panels.scripts.paused) {
            WebInspector.panels.scripts.evaluateInSelectedCallFrame(expression, objectGroup, includeCommandLineAPI, returnByValue, callback);
            return;
        }

        if (!expression) {
            // There is no expression, so the completion should happen against global properties.
            expression = "this";
        }

        function evalCallback(error, result, wasThrown)
        {
            if (error) {
                console.error(error);
                callback(null);
                return;
            }

            if (returnByValue && !wasThrown)
                callback(result, wasThrown);
            else
                callback(WebInspector.RemoteObject.fromPayload(result), wasThrown);
        }
        RuntimeAgent.evaluate(expression, objectGroup, includeCommandLineAPI, doNotPauseOnExceptions, this._currentEvaluationContextId(), returnByValue, evalCallback);
    },

    _enterKeyPressed: function(event)
    {
        if (event.altKey || event.ctrlKey || event.shiftKey)
            return;

        event.preventDefault();
        event.stopPropagation();

        this.prompt.clearAutoComplete(true);

        var str = this.prompt.text;
        if (!str.length)
            return;

        var commandMessage = new WebInspector.ConsoleCommand(str);
        WebInspector.console.interruptRepeatCount();
        this._appendConsoleMessage(commandMessage);

        function printResult(result, wasThrown)
        {
            if (!result)
                return;

            this.prompt.history.push(str);
            this.prompt.historyOffset = 0;
            this.prompt.text = "";

            WebInspector.settings.consoleHistory.set(this.prompt.history.slice(-30));

            this._appendConsoleMessage(new WebInspector.ConsoleCommandResult(result, wasThrown, commandMessage));
        }
        this.evalInInspectedWindow(str, "console", true, undefined, undefined, printResult.bind(this));

        WebInspector.userMetrics.ConsoleEvaluated.record();
    },

    _format: function(output, forceObjectFormat)
    {
        var type;
        if (forceObjectFormat)
            type = "object";
        else if (output instanceof WebInspector.RemoteObject)
            type = output.subtype || output.type;
        else
            type = typeof output;

        var formatter = this._customFormatters[type];
        if (!formatter) {
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
        elem.appendChild(new WebInspector.ObjectPropertiesSection(obj, obj.description).element);
    },

    _formatnode: function(object, elem)
    {
        function printNode(nodeId)
        {
            if (!nodeId) {
                // Sometimes DOM is loaded after the sync message is being formatted, so we get no
                // nodeId here. So we fall back to object formatting here.
                this._formatobject(object, elem);
                return;
            }
            var treeOutline = new WebInspector.ElementsTreeOutline();
            treeOutline.showInElementsPanelEnabled = true;
            treeOutline.rootDOMNode = WebInspector.domAgent.nodeForId(nodeId);
            treeOutline.element.addStyleClass("outline-disclosure");
            if (!treeOutline.children[0].hasChildren)
                treeOutline.element.addStyleClass("single-node");
            elem.appendChild(treeOutline.element);
        }
        object.pushNodeToFrontend(printNode.bind(this));
    },

    _formatarray: function(arr, elem)
    {
        arr.getOwnProperties(this._printArray.bind(this, elem));
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
        // Prevent infinite expansion of cross-referencing arrays.
        return this._format(output, output.subtype && output.subtype === "array");
    },

    elementsToRestoreScrollPositionsFor: function()
    {
        return [this.messagesElement];
    }
}

WebInspector.ConsoleView.prototype.__proto__ = WebInspector.View.prototype;

WebInspector.ConsoleCommand = function(command)
{
    this.command = command;
}

WebInspector.ConsoleCommand.prototype = {
    clearHighlight: function()
    {
        var highlightedMessage = this._formattedCommand;
        delete this._formattedCommand;
        this._formatCommand();
        this._element.replaceChild(this._formattedCommand, highlightedMessage);
    },

    highlightSearchResults: function(regexObject)
    {
        regexObject.lastIndex = 0;
        var text = this.command;
        var match = regexObject.exec(text);
        var offset = 0;
        var matchRanges = [];
        while (match) {
            matchRanges.push({ offset: match.index, length: match[0].length });
            match = regexObject.exec(text);
        }
        highlightSearchResults(this._formattedCommand, matchRanges);
        this._element.scrollIntoViewIfNeeded();
    },

    matchesRegex: function(regexObject)
    {
        return regexObject.test(this.command);
    },

    toMessageElement: function()
    {
        if (!this._element) {
            this._element = document.createElement("div");
            this._element.command = this;
            this._element.className = "console-user-command";

            this._formatCommand();
            this._element.appendChild(this._formattedCommand);
        }
        return this._element;
    },

    _formatCommand: function()
    {
        this._formattedCommand = document.createElement("span");
        this._formattedCommand.className = "console-message-text source-code";
        this._formattedCommand.textContent = this.command;
    },
}

WebInspector.ConsoleCommandResult = function(result, wasThrown, originatingCommand)
{
    var level = (wasThrown ? WebInspector.ConsoleMessage.MessageLevel.Error : WebInspector.ConsoleMessage.MessageLevel.Log);
    this.originatingCommand = originatingCommand;
    WebInspector.ConsoleMessage.call(this, WebInspector.ConsoleMessage.MessageSource.JS, WebInspector.ConsoleMessage.MessageType.Result, level, -1, null, 1, null, [result]);
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

WebInspector.ConsoleGroup = function(parentGroup)
{
    this.parentGroup = parentGroup;

    var element = document.createElement("div");
    element.className = "console-group";
    element.group = this;
    this.element = element;

    if (parentGroup) {
        var bracketElement = document.createElement("div");
        bracketElement.className = "console-group-bracket";
        element.appendChild(bracketElement);
    }

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
            element.addEventListener("click", this._titleClicked.bind(this), false);
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
