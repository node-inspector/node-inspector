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

/**
 * @constructor
 * @extends {WebInspector.VBox}
 * @implements {WebInspector.Searchable}
 * @implements {WebInspector.TargetManager.Observer}
 * @implements {WebInspector.ViewportControl.Provider}
 */
WebInspector.ConsoleView = function()
{
    WebInspector.VBox.call(this);
    this.setMinimumSize(0, 35);
    this.registerRequiredCSS("ui/filter.css");
    this.registerRequiredCSS("console/consoleView.css");

    this._searchableView = new WebInspector.SearchableView(this);
    this._searchableView.setPlaceholder(WebInspector.UIString("Find string in logs"));
    this._searchableView.setMinimalSearchQuerySize(0);
    this._searchableView.show(this.element);

    this._contentsElement = this._searchableView.element;
    this._contentsElement.classList.add("console-view");
    /** @type {!Array.<!WebInspector.ConsoleViewMessage>} */
    this._visibleViewMessages = [];
    this._urlToMessageCount = {};
    this._hiddenByFilterCount = 0;

    /**
     * @type {!Array.<!WebInspector.ConsoleView.RegexMatchRange>}
     */
    this._regexMatchRanges = [];

    this._clearConsoleButton = WebInspector.ToolbarButton.createActionButton("console.clear");

    this._executionContextComboBox = new WebInspector.ToolbarComboBox(null, "console-context");
    this._executionContextComboBox.setMaxWidth(200);
    this._executionContextModel = new WebInspector.ExecutionContextModel(this._executionContextComboBox.selectElement());

    this._filter = new WebInspector.ConsoleViewFilter(this);
    this._filter.addEventListener(WebInspector.ConsoleViewFilter.Events.FilterChanged, this._updateMessageList.bind(this));

    this._filterBar = new WebInspector.FilterBar("consoleView");

    this._preserveLogCheckbox = new WebInspector.ToolbarCheckbox(WebInspector.UIString("Preserve log"), WebInspector.UIString("Do not clear log on page reload / navigation"), WebInspector.moduleSetting("preserveConsoleLog"));
    this._progressToolbarItem = new WebInspector.ToolbarItem(createElement("div"));

    var toolbar = new WebInspector.Toolbar(this._contentsElement);
    toolbar.appendToolbarItem(this._clearConsoleButton);
    toolbar.appendToolbarItem(this._filterBar.filterButton());
    toolbar.appendToolbarItem(this._executionContextComboBox);
    toolbar.appendToolbarItem(this._preserveLogCheckbox);
    toolbar.appendToolbarItem(this._progressToolbarItem);

    this._contentsElement.appendChild(this._filterBar.filtersElement());
    this._filter.addFilters(this._filterBar);

    this._viewport = new WebInspector.ViewportControl(this);
    this._viewport.setStickToBottom(true);
    this._viewport.contentElement().classList.add("console-group", "console-group-messages");
    this._contentsElement.appendChild(this._viewport.element);
    this._messagesElement = this._viewport.element;
    this._messagesElement.id = "console-messages";
    this._messagesElement.classList.add("monospace");
    this._messagesElement.addEventListener("click", this._messagesClicked.bind(this), true);

    this._viewportThrottler = new WebInspector.Throttler(50);

    this._filterStatusMessageElement = createElementWithClass("div", "console-message");
    this._messagesElement.insertBefore(this._filterStatusMessageElement, this._messagesElement.firstChild);
    this._filterStatusTextElement = this._filterStatusMessageElement.createChild("span", "console-info");
    this._filterStatusMessageElement.createTextChild(" ");
    var resetFiltersLink = this._filterStatusMessageElement.createChild("span", "console-info link");
    resetFiltersLink.textContent = WebInspector.UIString("Show all messages.");
    resetFiltersLink.addEventListener("click", this._filter.reset.bind(this._filter), true);

    this._topGroup = WebInspector.ConsoleGroup.createTopGroup();
    this._currentGroup = this._topGroup;

    this._promptElement = this._messagesElement.createChild("div", "source-code");
    this._promptElement.id = "console-prompt";
    this._promptElement.spellcheck = false;

    this._searchableView.setDefaultFocusedElement(this._promptElement);

    // FIXME: This is a workaround for the selection machinery bug. See crbug.com/410899
    var selectAllFixer = this._messagesElement.createChild("div", "console-view-fix-select-all");
    selectAllFixer.textContent = ".";

    this._showAllMessagesCheckbox = new WebInspector.ToolbarCheckbox(WebInspector.UIString("Show all messages"));
    this._showAllMessagesCheckbox.inputElement.checked = true;
    this._showAllMessagesCheckbox.inputElement.addEventListener("change", this._updateMessageList.bind(this), false);

    this._showAllMessagesCheckbox.element.classList.add("hidden");

    toolbar.appendToolbarItem(this._showAllMessagesCheckbox);

    this._registerShortcuts();

    this._messagesElement.addEventListener("contextmenu", this._handleContextMenuEvent.bind(this), false);
    WebInspector.moduleSetting("monitoringXHREnabled").addChangeListener(this._monitoringXHREnabledSettingChanged, this);

    this._linkifier = new WebInspector.Linkifier();

    /** @type {!Array.<!WebInspector.ConsoleViewMessage>} */
    this._consoleMessages = [];
    this._viewMessageSymbol = Symbol("viewMessage");

    this._prompt = new WebInspector.TextPromptWithHistory(WebInspector.ExecutionContextSelector.completionsForTextPromptInCurrentContext);
    this._prompt.setSuggestBoxEnabled(true);
    this._prompt.setAutocompletionTimeout(0);
    this._prompt.renderAsBlock();
    var proxyElement = this._prompt.attach(this._promptElement);
    proxyElement.addEventListener("keydown", this._promptKeyDown.bind(this), false);

    this._consoleHistorySetting = WebInspector.settings.createLocalSetting("consoleHistory", []);
    var historyData = this._consoleHistorySetting.get();
    this._prompt.setHistoryData(historyData);

    this._updateFilterStatus();
    WebInspector.moduleSetting("consoleTimestampsEnabled").addChangeListener(this._consoleTimestampsSettingChanged, this);

    this._registerWithMessageSink();
    WebInspector.targetManager.observeTargets(this);
    WebInspector.targetManager.addEventListener(WebInspector.TargetManager.Events.MainFrameNavigated, this._onMainFrameNavigated, this);

    this._initConsoleMessages();

    WebInspector.context.addFlavorChangeListener(WebInspector.ExecutionContext, this._executionContextChanged, this);
}

WebInspector.ConsoleView.persistedHistorySize = 300;

WebInspector.ConsoleView.prototype = {
    /**
     * @return {!WebInspector.SearchableView}
     */
    searchableView: function()
    {
        return this._searchableView;
    },

    /**
     * @param {!WebInspector.Event} event
     */
    _onMainFrameNavigated: function(event)
    {
        var frame = /** @type {!WebInspector.ResourceTreeFrame} */(event.data);
        WebInspector.console.addMessage(WebInspector.UIString("Navigated to %s", frame.url));
    },

    _initConsoleMessages: function()
    {
        var mainTarget = WebInspector.targetManager.mainTarget();
        if (!mainTarget || !mainTarget.resourceTreeModel.cachedResourcesLoaded()) {
            WebInspector.targetManager.addModelListener(WebInspector.ResourceTreeModel, WebInspector.ResourceTreeModel.EventTypes.CachedResourcesLoaded, this._onResourceTreeModelLoaded, this);
            return;
        }
        this._fetchMultitargetMessages();
    },

    /**
     * @param {!WebInspector.Event} event
     */
    _onResourceTreeModelLoaded: function(event)
    {
        var resourceTreeModel = event.target;
        if (resourceTreeModel.target() !== WebInspector.targetManager.mainTarget())
            return;
        WebInspector.targetManager.removeModelListener(WebInspector.ResourceTreeModel, WebInspector.ResourceTreeModel.EventTypes.CachedResourcesLoaded, this._onResourceTreeModelLoaded, this);
        this._fetchMultitargetMessages();
    },

    _fetchMultitargetMessages: function()
    {
        WebInspector.multitargetConsoleModel.addEventListener(WebInspector.ConsoleModel.Events.ConsoleCleared, this._consoleCleared, this);
        WebInspector.multitargetConsoleModel.addEventListener(WebInspector.ConsoleModel.Events.MessageAdded, this._onConsoleMessageAdded, this);
        WebInspector.multitargetConsoleModel.addEventListener(WebInspector.ConsoleModel.Events.MessageUpdated, this._onConsoleMessageUpdated, this);
        WebInspector.multitargetConsoleModel.addEventListener(WebInspector.ConsoleModel.Events.CommandEvaluated, this._commandEvaluated, this);
        WebInspector.multitargetConsoleModel.messages().forEach(this._addConsoleMessage, this);
    },

    /**
     * @override
     * @return {number}
     */
    itemCount: function()
    {
        return this._visibleViewMessages.length;
    },

    /**
     * @override
     * @param {number} index
     * @return {?WebInspector.ViewportElement}
     */
    itemElement: function(index)
    {
        return this._visibleViewMessages[index];
    },

    /**
     * @override
     * @param {number} index
     * @return {number}
     */
    fastHeight: function(index)
    {
        return this._visibleViewMessages[index].fastHeight();
    },

    /**
     * @override
     * @return {number}
     */
    minimumRowHeight: function()
    {
        return 16;
    },

    /**
     * @override
     * @param {!WebInspector.Target} target
     */
    targetAdded: function(target)
    {
        this._viewport.invalidate();
        if (WebInspector.targetManager.targets().length > 1 && WebInspector.targetManager.mainTarget().isPage())
            this._showAllMessagesCheckbox.element.classList.toggle("hidden", false);
    },

    /**
     * @override
     * @param {!WebInspector.Target} target
     */
    targetRemoved: function(target)
    {
    },

    _registerWithMessageSink: function()
    {
        WebInspector.console.messages().forEach(this._addSinkMessage, this);
        WebInspector.console.addEventListener(WebInspector.Console.Events.MessageAdded, messageAdded, this);

        /**
         * @param {!WebInspector.Event} event
         * @this {WebInspector.ConsoleView}
         */
        function messageAdded(event)
        {
            this._addSinkMessage(/** @type {!WebInspector.Console.Message} */ (event.data));
        }
    },

    /**
     * @param {!WebInspector.Console.Message} message
     */
    _addSinkMessage: function(message)
    {
        var level = WebInspector.ConsoleMessage.MessageLevel.Debug;
        switch (message.level) {
        case WebInspector.Console.MessageLevel.Error:
            level = WebInspector.ConsoleMessage.MessageLevel.Error;
            break;
        case WebInspector.Console.MessageLevel.Warning:
            level = WebInspector.ConsoleMessage.MessageLevel.Warning;
            break;
        }

        var consoleMessage = new WebInspector.ConsoleMessage(null, WebInspector.ConsoleMessage.MessageSource.Other, level, message.text,
                undefined, undefined, undefined, undefined, undefined, undefined, undefined, message.timestamp);
        this._addConsoleMessage(consoleMessage);
    },

    /**
     * @param {!WebInspector.Event} event
     */
    _consoleTimestampsSettingChanged: function(event)
    {
        var enabled = /** @type {boolean} */ (event.data);
        this._updateMessageList();
        this._consoleMessages.forEach(function(viewMessage) {
            viewMessage.updateTimestamp(enabled);
        });
    },

    /**
     * @override
     * @return {!Element}
     */
    defaultFocusedElement: function()
    {
        return this._promptElement;
    },

    _executionContextChanged: function()
    {
        this._prompt.clearAutoComplete(true);
        if (!this._showAllMessagesCheckbox.checked())
            this._updateMessageList();
    },

    willHide: function()
    {
        this._hidePromptSuggestBox();
    },

    wasShown: function()
    {
        this._viewport.refresh();
        if (!this._prompt.isCaretInsidePrompt())
            this._prompt.moveCaretToEndOfPrompt();
    },

    focus: function()
    {
        if (this._promptElement === WebInspector.currentFocusElement())
            return;
        WebInspector.setCurrentFocusElement(this._promptElement);
        this._prompt.moveCaretToEndOfPrompt();
    },

    restoreScrollPositions: function()
    {
        if (this._viewport.scrolledToBottom())
            this._immediatelyScrollToBottom();
        else
            WebInspector.Widget.prototype.restoreScrollPositions.call(this);
    },

    onResize: function()
    {
        this._scheduleViewportRefresh();
        this._hidePromptSuggestBox();
        if (this._viewport.scrolledToBottom())
            this._immediatelyScrollToBottom();
    },

    _hidePromptSuggestBox: function()
    {
        this._prompt.hideSuggestBox();
        this._prompt.clearAutoComplete(true);
    },

    _scheduleViewportRefresh: function()
    {
        /**
         * @this {WebInspector.ConsoleView}
         * @return {!Promise.<undefined>}
         */
        function invalidateViewport()
        {
            if (this._needsFullUpdate) {
                this._updateMessageList();
                delete this._needsFullUpdate;
            } else {
                this._viewport.invalidate();
            }
            return Promise.resolve();
        }
        this._viewportThrottler.schedule(invalidateViewport.bind(this));
    },

    _immediatelyScrollToBottom: function()
    {
        // This will scroll viewport and trigger its refresh.
        this._promptElement.scrollIntoView(true);
    },

    _updateFilterStatus: function()
    {
        this._filterStatusTextElement.textContent = WebInspector.UIString(this._hiddenByFilterCount === 1 ? "%d message is hidden by filters." : "%d messages are hidden by filters.", this._hiddenByFilterCount);
        this._filterStatusMessageElement.style.display = this._hiddenByFilterCount ? "" : "none";
    },

    /**
     * @param {!WebInspector.Event} event
     */
    _onConsoleMessageAdded: function(event)
    {
        var message = /** @type {!WebInspector.ConsoleMessage} */ (event.data);
        this._addConsoleMessage(message);
    },

    /**
     * @param {!WebInspector.ConsoleMessage} message
     */
    _addConsoleMessage: function(message)
    {
        /**
         * @param {!WebInspector.ConsoleViewMessage} viewMessage1
         * @param {!WebInspector.ConsoleViewMessage} viewMessage2
         * @return {number}
         */
        function compareTimestamps(viewMessage1, viewMessage2)
        {
            return WebInspector.ConsoleMessage.timestampComparator(viewMessage1.consoleMessage(), viewMessage2.consoleMessage());
        }

        if (message.type === WebInspector.ConsoleMessage.MessageType.Command || message.type === WebInspector.ConsoleMessage.MessageType.Result)
            message.timestamp = this._consoleMessages.length ? this._consoleMessages.peekLast().consoleMessage().timestamp : 0;
        var viewMessage = this._createViewMessage(message);
        message[this._viewMessageSymbol] = viewMessage;
        var insertAt = insertionIndexForObjectInListSortedByFunction(viewMessage, this._consoleMessages, compareTimestamps, true);
        var insertedInMiddle = insertAt < this._consoleMessages.length;
        this._consoleMessages.splice(insertAt, 0, viewMessage);

        if (this._urlToMessageCount[message.url])
            ++this._urlToMessageCount[message.url];
        else
            this._urlToMessageCount[message.url] = 1;

        if (!insertedInMiddle) {
            this._appendMessageToEnd(viewMessage);
            this._updateFilterStatus();
            this._searchableView.updateSearchMatchesCount(this._regexMatchRanges.length);
        } else {
            this._needsFullUpdate = true;
        }

        this._scheduleViewportRefresh();
        this._consoleMessageAddedForTest(viewMessage);
    },

    /**
     * @param {!WebInspector.Event} event
     */
    _onConsoleMessageUpdated: function(event)
    {
        var message = /** @type {!WebInspector.ConsoleMessage} */ (event.data);
        var viewMessage = message[this._viewMessageSymbol];
        if (viewMessage) {
            viewMessage.updateMessageElement();
            this._updateMessageList();
        }
    },

    /**
     * @param {!WebInspector.ConsoleViewMessage} viewMessage
     */
    _consoleMessageAddedForTest: function(viewMessage) { },

    /**
     * @param {!WebInspector.ConsoleViewMessage} viewMessage
     */
    _appendMessageToEnd: function(viewMessage)
    {
        if (!this._filter.shouldBeVisible(viewMessage)) {
            this._hiddenByFilterCount++;
            return;
        }

        if (this._tryToCollapseMessages(viewMessage, this._visibleViewMessages.peekLast()))
            return;

        var lastMessage = this._visibleViewMessages.peekLast();
        if (viewMessage.consoleMessage().type === WebInspector.ConsoleMessage.MessageType.EndGroup) {
            if (lastMessage && !this._currentGroup.messagesHidden())
                lastMessage.incrementCloseGroupDecorationCount();
            this._currentGroup = this._currentGroup.parentGroup();
            return;
        }
        if (!this._currentGroup.messagesHidden()) {
            var originatingMessage = viewMessage.consoleMessage().originatingMessage();
            if (lastMessage && originatingMessage && lastMessage.consoleMessage() === originatingMessage)
                lastMessage.toMessageElement().classList.add("console-adjacent-user-command-result");

            this._visibleViewMessages.push(viewMessage);
            this._searchMessage(this._visibleViewMessages.length - 1);
        }

        if (viewMessage.consoleMessage().isGroupStartMessage())
            this._currentGroup = new WebInspector.ConsoleGroup(this._currentGroup, viewMessage);

        this._messageAppendedForTests();
    },

    _messageAppendedForTests: function()
    {
        // This method is sniffed in tests.
    },

    /**
     * @param {!WebInspector.ConsoleMessage} message
     * @return {!WebInspector.ConsoleViewMessage}
     */
    _createViewMessage: function(message)
    {
        var nestingLevel = this._currentGroup.nestingLevel();
        switch (message.type) {
        case WebInspector.ConsoleMessage.MessageType.Command:
            return new WebInspector.ConsoleCommand(message, this._linkifier, nestingLevel);
        case WebInspector.ConsoleMessage.MessageType.Result:
            return new WebInspector.ConsoleCommandResult(message, this._linkifier, nestingLevel);
        case WebInspector.ConsoleMessage.MessageType.StartGroupCollapsed:
        case WebInspector.ConsoleMessage.MessageType.StartGroup:
            return new WebInspector.ConsoleGroupViewMessage(message, this._linkifier, nestingLevel);
        default:
            return new WebInspector.ConsoleViewMessage(message, this._linkifier, nestingLevel);
        }
    },

    _consoleCleared: function()
    {
        this._currentMatchRangeIndex = -1;
        this._consoleMessages = [];
        this._updateMessageList();
        this._hidePromptSuggestBox();
        this._linkifier.reset();
    },

    _handleContextMenuEvent: function(event)
    {
        if (event.target.enclosingNodeOrSelfWithNodeName("a"))
            return;

        var contextMenu = new WebInspector.ContextMenu(event);
        if (event.target.isSelfOrDescendant(this._promptElement)) {
            contextMenu.show()
            return;
        }

        function monitoringXHRItemAction()
        {
            WebInspector.moduleSetting("monitoringXHREnabled").set(!WebInspector.moduleSetting("monitoringXHREnabled").get());
        }
        contextMenu.appendCheckboxItem(WebInspector.UIString("Log XMLHttpRequests"), monitoringXHRItemAction, WebInspector.moduleSetting("monitoringXHREnabled").get());

        var sourceElement = event.target.enclosingNodeOrSelfWithClass("console-message-wrapper");
        var consoleMessage = sourceElement ? sourceElement.message.consoleMessage() : null;

        var filterSubMenu = contextMenu.appendSubMenuItem(WebInspector.UIString("Filter"));

        if (consoleMessage && consoleMessage.url) {
            var menuTitle = WebInspector.UIString.capitalize("Hide ^messages from %s", new WebInspector.ParsedURL(consoleMessage.url).displayName);
            filterSubMenu.appendItem(menuTitle, this._filter.addMessageURLFilter.bind(this._filter, consoleMessage.url));
        }

        filterSubMenu.appendSeparator();
        var unhideAll = filterSubMenu.appendItem(WebInspector.UIString.capitalize("Unhide ^all"), this._filter.removeMessageURLFilter.bind(this._filter));
        filterSubMenu.appendSeparator();

        var hasFilters = false;

        for (var url in this._filter.messageURLFilters) {
            filterSubMenu.appendCheckboxItem(String.sprintf("%s (%d)", new WebInspector.ParsedURL(url).displayName, this._urlToMessageCount[url]), this._filter.removeMessageURLFilter.bind(this._filter, url), true);
            hasFilters = true;
        }

        filterSubMenu.setEnabled(hasFilters || (consoleMessage && consoleMessage.url));
        unhideAll.setEnabled(hasFilters);

        contextMenu.appendSeparator();
        contextMenu.appendAction("console.clear");
        contextMenu.appendItem(WebInspector.UIString("Save as..."), this._saveConsole.bind(this));

        var request = consoleMessage ? consoleMessage.request : null;
        if (request && request.resourceType() === WebInspector.resourceTypes.XHR) {
            contextMenu.appendSeparator();
            contextMenu.appendItem(WebInspector.UIString("Replay XHR"), request.replayXHR.bind(request));
        }

        contextMenu.show();
    },

    _saveConsole: function()
    {
        var filename = String.sprintf("%s-%d.log", WebInspector.targetManager.inspectedPageDomain(), Date.now());
        var stream = new WebInspector.FileOutputStream();

        var progressIndicator = new WebInspector.ProgressIndicator();
        progressIndicator.setTitle(WebInspector.UIString("Writing file…"));
        progressIndicator.setTotalWork(this.itemCount());

        /** @const */
        var chunkSize = 350;
        var messageIndex = 0;

        stream.open(filename, openCallback.bind(this));

        /**
         * @param {boolean} accepted
         * @this {WebInspector.ConsoleView}
         */
        function openCallback(accepted)
        {
            if (!accepted)
                return;
            this._progressToolbarItem.element.appendChild(progressIndicator.element);
            writeNextChunk.call(this, stream);
        }

        /**
         * @param {!WebInspector.OutputStream} stream
         * @param {string=} error
         * @this {WebInspector.ConsoleView}
         */
        function writeNextChunk(stream, error)
        {
            if (messageIndex >= this.itemCount() || error) {
                stream.close();
                progressIndicator.done();
                return;
            }
            var lines = [];
            for (var i = 0; i < chunkSize && i + messageIndex < this.itemCount(); ++i) {
                var message = this.itemElement(messageIndex + i);
                lines.push(message.searchableElement().deepTextContent());
            }
            messageIndex += i;
            stream.write(lines.join("\n") + "\n", writeNextChunk.bind(this));
            progressIndicator.setWorked(messageIndex);
        }

    },

    /**
     * @param {!WebInspector.ConsoleViewMessage} lastMessage
     * @param {?WebInspector.ConsoleViewMessage=} viewMessage
     * @return {boolean}
     */
    _tryToCollapseMessages: function(lastMessage, viewMessage)
    {
        if (!WebInspector.moduleSetting("consoleTimestampsEnabled").get() && viewMessage && !lastMessage.consoleMessage().isGroupMessage() && lastMessage.consoleMessage().isEqual(viewMessage.consoleMessage())) {
            viewMessage.incrementRepeatCount();
            return true;
        }

        return false;
    },

    _updateMessageList: function()
    {
        this._topGroup = WebInspector.ConsoleGroup.createTopGroup();
        this._currentGroup = this._topGroup;
        this._regexMatchRanges = [];
        this._hiddenByFilterCount = 0;
        for (var i = 0; i < this._visibleViewMessages.length; ++i) {
            this._visibleViewMessages[i].resetCloseGroupDecorationCount();
            this._visibleViewMessages[i].resetIncrementRepeatCount();
        }
        this._visibleViewMessages = [];
        for (var i = 0; i < this._consoleMessages.length; ++i)
            this._appendMessageToEnd(this._consoleMessages[i]);
        this._updateFilterStatus();
        this._searchableView.updateSearchMatchesCount(this._regexMatchRanges.length);
        this._viewport.invalidate();
    },

    /**
     * @param {!WebInspector.Event} event
     */
    _monitoringXHREnabledSettingChanged: function(event)
    {
        var enabled = /** @type {boolean} */ (event.data);
        WebInspector.targetManager.targets().forEach(function(target) {target.networkAgent().setMonitoringXHREnabled(enabled);});
    },

    /**
     * @param {!Event} event
     */
    _messagesClicked: function(event)
    {
        var targetElement = event.deepElementFromPoint();
        if (!this._prompt.isCaretInsidePrompt() && (!targetElement || targetElement.isComponentSelectionCollapsed()))
            this._prompt.moveCaretToEndOfPrompt();
        var groupMessage = event.target.enclosingNodeOrSelfWithClass("console-group-title");
        if (!groupMessage)
            return;
        var consoleGroupViewMessage = groupMessage.parentElement.message;
        consoleGroupViewMessage.setCollapsed(!consoleGroupViewMessage.collapsed());
        this._updateMessageList();
    },

    _registerShortcuts: function()
    {
        this._shortcuts = {};

        var shortcut = WebInspector.KeyboardShortcut;
        var section = WebInspector.shortcutsScreen.section(WebInspector.UIString("Console"));

        var shortcutL = shortcut.makeDescriptor("l", WebInspector.KeyboardShortcut.Modifiers.Ctrl);
        var keys = [shortcutL];
        if (WebInspector.isMac()) {
            var shortcutK = shortcut.makeDescriptor("k", WebInspector.KeyboardShortcut.Modifiers.Meta);
            keys.unshift(shortcutK);
        }
        section.addAlternateKeys(keys, WebInspector.UIString("Clear console"));

        section.addKey(shortcut.makeDescriptor(shortcut.Keys.Tab), WebInspector.UIString("Autocomplete common prefix"));
        section.addKey(shortcut.makeDescriptor(shortcut.Keys.Right), WebInspector.UIString("Accept suggestion"));

        var shortcutU = shortcut.makeDescriptor("u", WebInspector.KeyboardShortcut.Modifiers.Ctrl);
        this._shortcuts[shortcutU.key] = this._clearPromptBackwards.bind(this);
        section.addAlternateKeys([shortcutU], WebInspector.UIString("Clear console prompt"));

        keys = [
            shortcut.makeDescriptor(shortcut.Keys.Down),
            shortcut.makeDescriptor(shortcut.Keys.Up)
        ];
        section.addRelatedKeys(keys, WebInspector.UIString("Next/previous line"));

        if (WebInspector.isMac()) {
            keys = [
                shortcut.makeDescriptor("N", shortcut.Modifiers.Alt),
                shortcut.makeDescriptor("P", shortcut.Modifiers.Alt)
            ];
            section.addRelatedKeys(keys, WebInspector.UIString("Next/previous command"));
        }

        section.addKey(shortcut.makeDescriptor(shortcut.Keys.Enter), WebInspector.UIString("Execute command"));
    },

    _clearPromptBackwards: function()
    {
        this._prompt.setText("");
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
        }
    },

    _enterKeyPressed: function(event)
    {
        if (event.altKey || event.ctrlKey || event.shiftKey)
            return;

        event.consume(true);

        this._prompt.clearAutoComplete(true);

        var str = this._prompt.text();
        if (!str.length)
            return;
        this._appendCommand(str, true);
    },

    /**
     * @param {?WebInspector.RemoteObject} result
     * @param {boolean} wasThrown
     * @param {!WebInspector.ConsoleMessage} originatingConsoleMessage
     * @param {?DebuggerAgent.ExceptionDetails=} exceptionDetails
     */
    _printResult: function(result, wasThrown, originatingConsoleMessage, exceptionDetails)
    {
        if (!result)
            return;

        var level = wasThrown ? WebInspector.ConsoleMessage.MessageLevel.Error : WebInspector.ConsoleMessage.MessageLevel.Log;
        var message;
        if (!wasThrown)
            message = new WebInspector.ConsoleMessage(result.target(), WebInspector.ConsoleMessage.MessageSource.JS, level, "", WebInspector.ConsoleMessage.MessageType.Result, undefined, undefined, undefined, undefined, [result]);
        else
            message = new WebInspector.ConsoleMessage(result.target(), WebInspector.ConsoleMessage.MessageSource.JS, level, exceptionDetails.text, WebInspector.ConsoleMessage.MessageType.Result, exceptionDetails.url, exceptionDetails.line, exceptionDetails.column, undefined, [WebInspector.UIString("Uncaught"), result], exceptionDetails.stackTrace, undefined, undefined, undefined, exceptionDetails.scriptId);
        message.setOriginatingMessage(originatingConsoleMessage);
        result.target().consoleModel.addMessage(message);
    },

    /**
     * @param {string} text
     * @param {boolean} useCommandLineAPI
     */
    _appendCommand: function(text, useCommandLineAPI)
    {
        this._prompt.setText("");
        var currentExecutionContext = WebInspector.context.flavor(WebInspector.ExecutionContext);
        if (currentExecutionContext) {
            WebInspector.ConsoleModel.evaluateCommandInConsole(currentExecutionContext, text, useCommandLineAPI);
            if (WebInspector.inspectorView.currentPanel() && WebInspector.inspectorView.currentPanel().name === "console")
                WebInspector.userMetrics.CommandEvaluatedInConsolePanel.record();
        }
    },

    /**
     * @param {!WebInspector.Event} event
     */
    _commandEvaluated: function(event)
    {
        var data = /**{{result: ?WebInspector.RemoteObject, wasThrown: boolean, text: string, commandMessage: !WebInspector.ConsoleMessage}} */ (event.data);
        this._prompt.pushHistoryItem(data.text);
        this._consoleHistorySetting.set(this._prompt.historyData().slice(-WebInspector.ConsoleView.persistedHistorySize));
        this._printResult(data.result, data.wasThrown, data.commandMessage, data.exceptionDetails);
    },

    /**
     * @override
     * @return {!Array.<!Element>}
     */
    elementsToRestoreScrollPositionsFor: function()
    {
        return [this._messagesElement];
    },

    /**
     * @override
     */
    searchCanceled: function()
    {
        this._cleanupAfterSearch();
        for (var i = 0; i < this._visibleViewMessages.length; ++i) {
            var message = this._visibleViewMessages[i];
            message.setSearchRegex(null);
        }
        this._currentMatchRangeIndex = -1;
        this._regexMatchRanges = [];
        delete this._searchRegex;
        this._viewport.refresh();
    },

    /**
     * @override
     * @param {!WebInspector.SearchableView.SearchConfig} searchConfig
     * @param {boolean} shouldJump
     * @param {boolean=} jumpBackwards
     */
    performSearch: function(searchConfig, shouldJump, jumpBackwards)
    {
        this.searchCanceled();
        this._searchableView.updateSearchMatchesCount(0);

        this._searchRegex = searchConfig.toSearchRegex(true);

        this._regexMatchRanges = [];
        this._currentMatchRangeIndex = -1;

        if (shouldJump)
            this._searchShouldJumpBackwards = !!jumpBackwards;

        this._searchProgressIndicator = new WebInspector.ProgressIndicator();
        this._searchProgressIndicator.setTitle(WebInspector.UIString("Searching…"));
        this._searchProgressIndicator.setTotalWork(this._visibleViewMessages.length);
        this._progressToolbarItem.element.appendChild(this._searchProgressIndicator.element);

        this._innerSearch(0);
    },

    _cleanupAfterSearch: function()
    {
        delete this._searchShouldJumpBackwards;
        if (this._innerSearchTimeoutId) {
            clearTimeout(this._innerSearchTimeoutId);
            delete this._innerSearchTimeoutId;
        }
        if (this._searchProgressIndicator) {
            this._searchProgressIndicator.done();
            delete this._searchProgressIndicator;
        }
    },

    _searchFinishedForTests: function()
    {
        // This method is sniffed in tests.
    },

    /**
     * @param {number} index
     */
    _innerSearch: function(index)
    {
        delete this._innerSearchTimeoutId;
        if (this._searchProgressIndicator.isCanceled()) {
            this._cleanupAfterSearch();
            return;
        }

        var startTime = Date.now();
        for (; index < this._visibleViewMessages.length && Date.now() - startTime < 100; ++index)
            this._searchMessage(index);

        this._searchableView.updateSearchMatchesCount(this._regexMatchRanges.length);
        if (typeof this._searchShouldJumpBackwards !== "undefined" && this._regexMatchRanges.length) {
            this._jumpToMatch(this._searchShouldJumpBackwards ? -1 : 0);
            delete this._searchShouldJumpBackwards;
        }

        if (index === this._visibleViewMessages.length) {
            this._cleanupAfterSearch();
            setTimeout(this._searchFinishedForTests.bind(this), 0);
            return;
        }

        this._innerSearchTimeoutId = setTimeout(this._innerSearch.bind(this, index), 100);
        this._searchProgressIndicator.setWorked(index);
    },

    /**
     * @param {number} index
     */
    _searchMessage: function(index)
    {
        var message = this._visibleViewMessages[index];
        message.setSearchRegex(this._searchRegex);
        for (var i = 0; i < message.searchCount(); ++i) {
            this._regexMatchRanges.push({
                messageIndex: index,
                matchIndex: i
            });
        }
    },

    /**
     * @override
     */
    jumpToNextSearchResult: function()
    {
        this._jumpToMatch(this._currentMatchRangeIndex + 1);
    },

    /**
     * @override
     */
    jumpToPreviousSearchResult: function()
    {
        this._jumpToMatch(this._currentMatchRangeIndex - 1);
    },

    /**
     * @override
     * @return {boolean}
     */
    supportsCaseSensitiveSearch: function()
    {
        return true;
    },

    /**
     * @override
     * @return {boolean}
     */
    supportsRegexSearch: function()
    {
        return true;
    },

    /**
     * @param {number} index
     */
    _jumpToMatch: function(index)
    {
        if (!this._regexMatchRanges.length)
            return;

        var currentSearchResultClassName = "current-search-result";

        var matchRange;
        if (this._currentMatchRangeIndex >= 0) {
            matchRange = this._regexMatchRanges[this._currentMatchRangeIndex];
            var message = this._visibleViewMessages[matchRange.messageIndex];
            message.searchHighlightNode(matchRange.matchIndex).classList.remove(currentSearchResultClassName);
        }

        index = mod(index, this._regexMatchRanges.length);
        this._currentMatchRangeIndex = index;
        this._searchableView.updateCurrentMatchIndex(index);
        matchRange = this._regexMatchRanges[index];
        var message = this._visibleViewMessages[matchRange.messageIndex];
        var highlightNode = message.searchHighlightNode(matchRange.matchIndex);
        highlightNode.classList.add(currentSearchResultClassName);
        this._viewport.scrollItemIntoView(matchRange.messageIndex);
        highlightNode.scrollIntoViewIfNeeded();
    },

    __proto__: WebInspector.VBox.prototype
}

/**
 * @constructor
 * @extends {WebInspector.Object}
 * @param {!WebInspector.ConsoleView} view
 */
WebInspector.ConsoleViewFilter = function(view)
{
    this._messageURLFiltersSetting = WebInspector.settings.createSetting("messageURLFilters", {});
    this._messageLevelFiltersSetting = WebInspector.settings.createSetting("messageLevelFilters", {});

    this._view = view;
    this._messageURLFilters = this._messageURLFiltersSetting.get();
    this._filterChanged = this.dispatchEventToListeners.bind(this, WebInspector.ConsoleViewFilter.Events.FilterChanged);
};

WebInspector.ConsoleViewFilter.Events = {
    FilterChanged: "FilterChanged"
};

WebInspector.ConsoleViewFilter.prototype = {
    addFilters: function(filterBar)
    {
        this._textFilterUI = new WebInspector.TextFilterUI(true);
        this._textFilterUI.addEventListener(WebInspector.FilterUI.Events.FilterChanged, this._textFilterChanged, this);
        filterBar.addFilter(this._textFilterUI);

        this._hideNetworkMessagesCheckbox = new WebInspector.CheckboxFilterUI("hide-network-messages", WebInspector.UIString("Hide network messages"), true, WebInspector.moduleSetting("hideNetworkMessages"));
        this._hideNetworkMessagesCheckbox.addEventListener(WebInspector.FilterUI.Events.FilterChanged, this._filterChanged.bind(this), this);
        filterBar.addFilter(this._hideNetworkMessagesCheckbox);

        var levels = [
            {name: WebInspector.ConsoleMessage.MessageLevel.Error, label: WebInspector.UIString("Errors")},
            {name: WebInspector.ConsoleMessage.MessageLevel.Warning, label: WebInspector.UIString("Warnings")},
            {name: WebInspector.ConsoleMessage.MessageLevel.Info, label: WebInspector.UIString("Info")},
            {name: WebInspector.ConsoleMessage.MessageLevel.Log, label: WebInspector.UIString("Logs")},
            {name: WebInspector.ConsoleMessage.MessageLevel.Debug, label: WebInspector.UIString("Debug")},
            {name: WebInspector.ConsoleMessage.MessageLevel.RevokedError, label: WebInspector.UIString("Handled")}
        ];
        this._levelFilterUI = new WebInspector.NamedBitSetFilterUI(levels, this._messageLevelFiltersSetting);
        this._levelFilterUI.addEventListener(WebInspector.FilterUI.Events.FilterChanged, this._filterChanged, this);
        filterBar.addFilter(this._levelFilterUI);
    },

    _textFilterChanged: function(event)
    {
        this._filterRegex = this._textFilterUI.regex();

        this._filterChanged();
    },

    /**
     * @param {string} url
     */
    addMessageURLFilter: function(url)
    {
        this._messageURLFilters[url] = true;
        this._messageURLFiltersSetting.set(this._messageURLFilters);
        this._filterChanged();
    },

    /**
     * @param {string} url
     */
    removeMessageURLFilter: function(url)
    {
        if (!url)
            this._messageURLFilters = {};
        else
            delete this._messageURLFilters[url];

        this._messageURLFiltersSetting.set(this._messageURLFilters);
        this._filterChanged();
    },

    /**
     * @returns {!Object}
     */
    get messageURLFilters()
    {
        return this._messageURLFilters;
    },

    /**
     * @param {!WebInspector.ConsoleViewMessage} viewMessage
     * @return {boolean}
     */
    shouldBeVisible: function(viewMessage)
    {
        var message = viewMessage.consoleMessage();
        var executionContext = WebInspector.context.flavor(WebInspector.ExecutionContext);
        if (!message.target())
            return true;

        if (!this._view._showAllMessagesCheckbox.checked() && executionContext) {
            if (message.target() !== executionContext.target())
                return false;
            if (message.executionContextId  && message.executionContextId !== executionContext.id) {
                return false;
            }
        }

        if (WebInspector.moduleSetting("hideNetworkMessages").get() && viewMessage.consoleMessage().source === WebInspector.ConsoleMessage.MessageSource.Network)
            return false;

        if (viewMessage.consoleMessage().isGroupMessage())
            return true;

        if (message.type === WebInspector.ConsoleMessage.MessageType.Result || message.type === WebInspector.ConsoleMessage.MessageType.Command)
            return true;

        if (message.url && this._messageURLFilters[message.url])
            return false;

        if (message.level && !this._levelFilterUI.accept(message.level))
            return false;

        if (this._filterRegex) {
            this._filterRegex.lastIndex = 0;
            if (!viewMessage.matchesFilterRegex(this._filterRegex))
                return false;
        }

        return true;
    },

    reset: function()
    {
        this._messageURLFilters = {};
        this._messageURLFiltersSetting.set(this._messageURLFilters);
        this._messageLevelFiltersSetting.set({});
        this._view._showAllMessagesCheckbox.inputElement.checked = true;
        WebInspector.moduleSetting("hideNetworkMessages").set(false);
        this._textFilterUI.setValue("");
        this._filterChanged();
    },

    __proto__: WebInspector.Object.prototype
};


/**
 * @constructor
 * @extends {WebInspector.ConsoleViewMessage}
 * @param {!WebInspector.ConsoleMessage} message
 * @param {!WebInspector.Linkifier} linkifier
 * @param {number} nestingLevel
 */
WebInspector.ConsoleCommand = function(message, linkifier, nestingLevel)
{
    WebInspector.ConsoleViewMessage.call(this, message, linkifier, nestingLevel);
}

WebInspector.ConsoleCommand.prototype = {
    /**
     * @override
     * @return {!Element})
     */
    searchableElement: function()
    {
        return this.contentElement();
    },

    /**
     * @override
     * @return {!Element}
     */
    contentElement: function()
    {
        if (!this._element) {
            this._element = createElementWithClass("div", "console-user-command");
            this._element.message = this;

            this._formattedCommand = createElementWithClass("span", "console-message-text source-code");
            this._formattedCommand.textContent = this.text;
            this._element.appendChild(this._formattedCommand);

            var javascriptSyntaxHighlighter = new WebInspector.DOMSyntaxHighlighter("text/javascript", true);
            javascriptSyntaxHighlighter.syntaxHighlightNode(this._formattedCommand).then(this._updateSearch.bind(this))
        }
        return this._element;
    },

    _updateSearch: function()
    {
        this.setSearchRegex(this.searchRegex());
    },

    __proto__: WebInspector.ConsoleViewMessage.prototype
}

/**
 * @constructor
 * @extends {WebInspector.ConsoleViewMessage}
 * @param {!WebInspector.ConsoleMessage} message
 * @param {!WebInspector.Linkifier} linkifier
 * @param {number} nestingLevel
 */
WebInspector.ConsoleCommandResult = function(message, linkifier, nestingLevel)
{
    WebInspector.ConsoleViewMessage.call(this, message, linkifier, nestingLevel);
}

WebInspector.ConsoleCommandResult.prototype = {
    /**
     * @override
     * @param {!WebInspector.RemoteObject} array
     * @return {boolean}
     */
    useArrayPreviewInFormatter: function(array)
    {
        return false;
    },

    /**
     * @override
     * @return {!Element}
     */
    contentElement: function()
    {
        var element = WebInspector.ConsoleViewMessage.prototype.contentElement.call(this);
        element.classList.add("console-user-command-result");
        this.updateTimestamp(false);
        return element;
    },

    __proto__: WebInspector.ConsoleViewMessage.prototype
}

/**
 * @constructor
 * @param {?WebInspector.ConsoleGroup} parentGroup
 * @param {?WebInspector.ConsoleViewMessage} groupMessage
 */
WebInspector.ConsoleGroup = function(parentGroup, groupMessage)
{
    this._parentGroup = parentGroup;
    this._nestingLevel = parentGroup ? parentGroup.nestingLevel() + 1 : 0;
    this._messagesHidden = groupMessage && groupMessage.collapsed() || this._parentGroup && this._parentGroup.messagesHidden();
}

/**
 * @return {!WebInspector.ConsoleGroup}
 */
WebInspector.ConsoleGroup.createTopGroup = function()
{
    return new WebInspector.ConsoleGroup(null, null);
}

WebInspector.ConsoleGroup.prototype = {
    /**
     * @return {boolean}
     */
    messagesHidden: function()
    {
        return this._messagesHidden;
    },

    /**
     * @return {number}
     */
    nestingLevel: function()
    {
        return this._nestingLevel;
    },

    /**
     * @return {?WebInspector.ConsoleGroup}
     */
    parentGroup: function()
    {
        return this._parentGroup || this;
    },
}

/**
 * @constructor
 * @implements {WebInspector.ActionDelegate}
 */
WebInspector.ConsoleView.ActionDelegate = function()
{
}

WebInspector.ConsoleView.ActionDelegate.prototype = {
    /**
     * @override
     * @param {!WebInspector.Context} context
     * @param {string} actionId
     */
    handleAction: function(context, actionId)
    {
        if (actionId === "console.show")
            WebInspector.console.show();
        else if (actionId === "console.clear")
            WebInspector.ConsoleModel.clearConsole();
    }
}

/**
* @typedef {{messageIndex: number, matchIndex: number}}
*/
WebInspector.ConsoleView.RegexMatchRange;
