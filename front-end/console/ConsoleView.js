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
    this.registerRequiredCSS("ui/filter.css");
    this.registerRequiredCSS("console/consoleView.css");

    this._searchableView = new WebInspector.SearchableView(this);
    this._searchableView.setMinimalSearchQuerySize(0);
    this._searchableView.show(this.element);

    this._contentsElement = this._searchableView.element;
    this._contentsElement.classList.add("console-view");
    this._visibleViewMessages = [];
    this._urlToMessageCount = {};
    this._hiddenByFilterCount = 0;

    this._clearConsoleButton = new WebInspector.StatusBarButton(WebInspector.UIString("Clear console log."), "clear-status-bar-item");
    this._clearConsoleButton.addEventListener("click", this._requestClearMessages, this);

    this._executionContextSelector = new WebInspector.StatusBarComboBox(this._executionContextChanged.bind(this), "console-context");

    /**
     * @type {!Map.<!WebInspector.ExecutionContext, !Element>}
     */
    this._optionByExecutionContext = new Map();

    this._filter = new WebInspector.ConsoleViewFilter(this);
    this._filter.addEventListener(WebInspector.ConsoleViewFilter.Events.FilterChanged, this._updateMessageList.bind(this));

    this._filterBar = new WebInspector.FilterBar();

    this._preserveLogCheckbox = new WebInspector.StatusBarCheckbox(WebInspector.UIString("Preserve log"));
    WebInspector.SettingsUI.bindCheckbox(this._preserveLogCheckbox.inputElement, WebInspector.settings.preserveConsoleLog);
    this._preserveLogCheckbox.element.title = WebInspector.UIString("Do not clear log on page reload / navigation.");

    var statusBar = new WebInspector.StatusBar(this._contentsElement);
    statusBar.appendStatusBarItem(this._clearConsoleButton);
    statusBar.appendStatusBarItem(this._filterBar.filterButton());
    statusBar.appendStatusBarItem(this._executionContextSelector);
    statusBar.appendStatusBarItem(this._preserveLogCheckbox);

    this._filtersContainer = this._contentsElement.createChild("div", "console-filters-header hidden");
    this._filtersContainer.appendChild(this._filterBar.filtersElement());
    this._filterBar.addEventListener(WebInspector.FilterBar.Events.FiltersToggled, this._onFiltersToggled, this);
    this._filterBar.setName("consoleView");
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
    var resetFiltersLink = this._filterStatusMessageElement.createChild("span", "console-info node-link");
    resetFiltersLink.textContent = WebInspector.UIString("Show all messages.");
    resetFiltersLink.addEventListener("click", this._filter.reset.bind(this._filter), true);

    this._topGroup = WebInspector.ConsoleGroup.createTopGroup();
    this._currentGroup = this._topGroup;

    this._promptElement = this._messagesElement.createChild("div", "source-code");
    this._promptElement.id = "console-prompt";
    this._promptElement.spellcheck = false;

    // FIXME: This is a workaround for the selection machinery bug. See crbug.com/410899
    var selectAllFixer = this._messagesElement.createChild("div", "console-view-fix-select-all");
    selectAllFixer.textContent = ".";

    this._showAllMessagesCheckbox = new WebInspector.StatusBarCheckbox(WebInspector.UIString("Show all messages"));
    this._showAllMessagesCheckbox.inputElement.checked = true;
    this._showAllMessagesCheckbox.inputElement.addEventListener("change", this._updateMessageList.bind(this), false);

    this._showAllMessagesCheckbox.element.classList.add("hidden");

    statusBar.appendStatusBarItem(this._showAllMessagesCheckbox);

    this._registerShortcuts();

    this._messagesElement.addEventListener("contextmenu", this._handleContextMenuEvent.bind(this), false);
    WebInspector.settings.monitoringXHREnabled.addChangeListener(this._monitoringXHREnabledSettingChanged, this);

    this._linkifier = new WebInspector.Linkifier();

    /** @type {!Array.<!WebInspector.ConsoleViewMessage>} */
    this._consoleMessages = [];

    this._prompt = new WebInspector.TextPromptWithHistory(WebInspector.ExecutionContextSelector.completionsForTextPromptInCurrentContext);
    this._prompt.setSuggestBoxEnabled(true);
    this._prompt.renderAsBlock();
    this._prompt.attach(this._promptElement);
    this._prompt.proxyElement.addEventListener("keydown", this._promptKeyDown.bind(this), false);
    this._prompt.setHistoryData(WebInspector.settings.consoleHistory.get());
    var historyData = WebInspector.settings.consoleHistory.get();
    this._prompt.setHistoryData(historyData);

    this._updateFilterStatus();
    WebInspector.settings.consoleTimestampsEnabled.addChangeListener(this._consoleTimestampsSettingChanged, this);

    this._registerWithMessageSink();
    WebInspector.targetManager.observeTargets(this);
    WebInspector.targetManager.addModelListener(WebInspector.RuntimeModel, WebInspector.RuntimeModel.Events.ExecutionContextCreated, this._onExecutionContextCreated, this);
    WebInspector.targetManager.addModelListener(WebInspector.RuntimeModel, WebInspector.RuntimeModel.Events.ExecutionContextDestroyed, this._onExecutionContextDestroyed, this);
    WebInspector.targetManager.addEventListener(WebInspector.TargetManager.Events.MainFrameNavigated, this._onMainFrameNavigated, this);

    this._initConsoleMessages();

    WebInspector.context.addFlavorChangeListener(WebInspector.ExecutionContext, this._executionContextChangedExternally, this);
}

WebInspector.ConsoleView.prototype = {
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
        if (!WebInspector.isWorkerFrontend() && (!mainTarget || !mainTarget.resourceTreeModel.cachedResourcesLoaded())) {
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
        WebInspector.multitargetConsoleModel.addEventListener(WebInspector.ConsoleModel.Events.CommandEvaluated, this._commandEvaluated, this);
        WebInspector.multitargetConsoleModel.messages().forEach(this._addConsoleMessage, this);
    },

    /**
     * @return {number}
     */
    itemCount: function()
    {
        return this._visibleViewMessages.length;
    },

    /**
     * @param {number} index
     * @return {?WebInspector.ViewportElement}
     */
    itemElement: function(index)
    {
        return this._visibleViewMessages[index];
    },

    /**
     * @param {number} index
     * @return {number}
     */
    fastHeight: function(index)
    {
        return this._visibleViewMessages[index].fastHeight();
    },

    /**
     * @return {number}
     */
    minimumRowHeight: function()
    {
        return 16;
    },

    /**
     * @param {!WebInspector.Target} target
     */
    targetAdded: function(target)
    {
        this._viewport.invalidate();
        target.runtimeModel.executionContexts().forEach(this._executionContextCreated, this);
        if (WebInspector.targetManager.targets().length > 1 && !WebInspector.isWorkerFrontend())
            this._showAllMessagesCheckbox.element.classList.toggle("hidden", false);
    },

    /**
     * @param {!WebInspector.Target} target
     */
    targetRemoved: function(target)
    {
        this._clearExecutionContextsForTarget(target);
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
     * @return {!Element}
     */
    defaultFocusedElement: function()
    {
        return this._promptElement
    },

    _onFiltersToggled: function(event)
    {
        var toggled = /** @type {boolean} */ (event.data);
        this._filtersContainer.classList.toggle("hidden", !toggled);
    },

    /**
     * @param {!WebInspector.ExecutionContext} executionContext
     * @return {string}
     */
    _titleFor: function(executionContext)
    {
        var result;
        if (executionContext.isMainWorldContext) {
            if (executionContext.frameId) {
                var frame = executionContext.target().resourceTreeModel.frameForId(executionContext.frameId);
                result =  frame ? frame.displayName() : (executionContext.origin || executionContext.name);
            } else {
                result = WebInspector.displayNameForURL(executionContext.origin) || executionContext.name;
            }
        } else
            result = "\u00a0\u00a0\u00a0\u00a0" + (executionContext.name || executionContext.origin);

        var maxLength = 50;
        return result.trimMiddle(maxLength);
    },

    /**
     * @param {!WebInspector.Event} event
     */
    _onExecutionContextCreated: function(event)
    {
        var executionContext = /** @type {!WebInspector.ExecutionContext} */ (event.data);
        this._executionContextCreated(executionContext);
    },

    /**
     * @param {!WebInspector.ExecutionContext} executionContext
     */
    _executionContextCreated: function(executionContext)
    {
        // FIXME(413886): We never want to show execution context for the main thread of shadow page in service/shared worker frontend.
        // This check could be removed once we do not send this context to frontend.
        if (WebInspector.isWorkerFrontend() && executionContext.target() === WebInspector.targetManager.mainTarget())
            return;

        var newOption = createElement("option");
        newOption.__executionContext = executionContext;
        newOption.text = this._titleFor(executionContext);
        this._optionByExecutionContext.set(executionContext, newOption);
        var sameGroupExists = false;
        var options = this._executionContextSelector.selectElement().options;
        var insertBeforeOption = null;
        for (var i = 0; i < options.length; ++i) {
            var optionContext = options[i].__executionContext;
            var isSameGroup = executionContext.target() === optionContext.target() && executionContext.frameId === optionContext.frameId;
            sameGroupExists |= isSameGroup;
            if ((isSameGroup && WebInspector.ExecutionContext.comparator(optionContext, executionContext) > 0) || (sameGroupExists && !isSameGroup)) {
                insertBeforeOption = options[i];
                break;
            }
        }
        this._executionContextSelector.selectElement().insertBefore(newOption, insertBeforeOption);
        if (executionContext === WebInspector.context.flavor(WebInspector.ExecutionContext))
            this._executionContextSelector.select(newOption);
    },

    /**
     * @param {!WebInspector.Event} event
     */
    _onExecutionContextDestroyed: function(event)
    {
        var executionContext = /** @type {!WebInspector.ExecutionContext} */ (event.data);
        this._executionContextDestroyed(executionContext);
    },

    /**
     * @param {!WebInspector.ExecutionContext} executionContext
     */
    _executionContextDestroyed: function(executionContext)
    {
        var option = this._optionByExecutionContext.remove(executionContext);
        option.remove();
    },

    /**
     * @param {!WebInspector.Target} target
     */
    _clearExecutionContextsForTarget: function(target)
    {
        var executionContexts = this._optionByExecutionContext.keysArray();
        for (var i = 0; i < executionContexts.length; ++i) {
            if (executionContexts[i].target() === target)
                this._executionContextDestroyed(executionContexts[i]);
        }
    },

    _executionContextChanged: function()
    {
        var newContext = this._currentExecutionContext();
        WebInspector.context.setFlavor(WebInspector.ExecutionContext, newContext);
        this._prompt.clearAutoComplete(true);
        if (!this._showAllMessagesCheckbox.checked())
            this._updateMessageList();
    },

    /**
     * @param {!WebInspector.Event} event
     */
    _executionContextChangedExternally: function(event)
    {
        var executionContext =  /** @type {?WebInspector.ExecutionContext} */ (event.data);
        if (!executionContext)
            return;

        var options = this._executionContextSelector.selectElement().options;
        for (var i = 0; i < options.length; ++i) {
            if (options[i].__executionContext === executionContext)
                this._executionContextSelector.select(options[i]);
        }
    },

    /**
     * @return {?WebInspector.ExecutionContext}
     */
    _currentExecutionContext: function()
    {
        var option = this._executionContextSelector.selectedOption();
        return option ? option.__executionContext : null;
    },

    willHide: function()
    {
        this._prompt.hideSuggestBox();
        this._prompt.clearAutoComplete(true);
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
            WebInspector.View.prototype.restoreScrollPositions.call(this);
    },

    onResize: function()
    {
        this._scheduleViewportRefresh();
        this._prompt.hideSuggestBox();
        if (this._viewport.scrolledToBottom())
            this._immediatelyScrollToBottom();
    },

    _scheduleViewportRefresh: function()
    {
        /**
         * @param {!WebInspector.Throttler.FinishCallback} finishCallback
         * @this {WebInspector.ConsoleView}
         */
        function invalidateViewport(finishCallback)
        {
            if (this._needsFullUpdate) {
                this._updateMessageList();
                delete this._needsFullUpdate;
            } else {
                this._viewport.invalidate();
            }
            finishCallback();
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
        var insertAt = insertionIndexForObjectInListSortedByFunction(viewMessage, this._consoleMessages, compareTimestamps, true);
        var insertedInMiddle = insertAt < this._consoleMessages.length;
        this._consoleMessages.splice(insertAt, 0, viewMessage);

        if (this._urlToMessageCount[message.url])
            ++this._urlToMessageCount[message.url];
        else
            this._urlToMessageCount[message.url] = 1;

        if (!insertedInMiddle) {
            this._appendMessageToEnd(viewMessage)
            this._updateFilterStatus();
        } else {
            this._needsFullUpdate = true;
        }

        this._scheduleViewportRefresh();
        this._consoleMessageAddedForTest(viewMessage);
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

            if (this._searchRegex && viewMessage.matchesRegex(this._searchRegex)) {
                this._searchResults.push(viewMessage);
                this._searchableView.updateSearchMatchesCount(this._searchResults.length);
            }
        }

        if (viewMessage.consoleMessage().isGroupStartMessage())
            this._currentGroup = new WebInspector.ConsoleGroup(this._currentGroup, viewMessage);
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
        this._clearCurrentSearchResultHighlight();
        this._consoleMessages = [];
        this._updateMessageList();

        if (this._searchRegex)
            this._searchableView.updateSearchMatchesCount(0);

        this._linkifier.reset();
    },

    _handleContextMenuEvent: function(event)
    {
        if (event.target.enclosingNodeOrSelfWithNodeName("a"))
            return;

        var contextMenu = new WebInspector.ContextMenu(event);

        function monitoringXHRItemAction()
        {
            WebInspector.settings.monitoringXHREnabled.set(!WebInspector.settings.monitoringXHREnabled.get());
        }
        contextMenu.appendCheckboxItem(WebInspector.UIString("Log XMLHttpRequests"), monitoringXHRItemAction, WebInspector.settings.monitoringXHREnabled.get());

        var sourceElement = event.target.enclosingNodeOrSelfWithClass("console-message-wrapper");
        var consoleMessage = sourceElement ? sourceElement.message.consoleMessage() : null;

        var filterSubMenu = contextMenu.appendSubMenuItem(WebInspector.UIString("Filter"));

        if (consoleMessage && consoleMessage.url) {
            var menuTitle = WebInspector.UIString(WebInspector.useLowerCaseMenuTitles() ? "Hide messages from %s" : "Hide Messages from %s", new WebInspector.ParsedURL(consoleMessage.url).displayName);
            filterSubMenu.appendItem(menuTitle, this._filter.addMessageURLFilter.bind(this._filter, consoleMessage.url));
        }

        filterSubMenu.appendSeparator();
        var unhideAll = filterSubMenu.appendItem(WebInspector.UIString(WebInspector.useLowerCaseMenuTitles() ? "Unhide all" : "Unhide All"), this._filter.removeMessageURLFilter.bind(this._filter));
        filterSubMenu.appendSeparator();

        var hasFilters = false;

        for (var url in this._filter.messageURLFilters) {
            filterSubMenu.appendCheckboxItem(String.sprintf("%s (%d)", new WebInspector.ParsedURL(url).displayName, this._urlToMessageCount[url]), this._filter.removeMessageURLFilter.bind(this._filter, url), true);
            hasFilters = true;
        }

        filterSubMenu.setEnabled(hasFilters || (consoleMessage && consoleMessage.url));
        unhideAll.setEnabled(hasFilters);

        contextMenu.appendSeparator();
        contextMenu.appendItem(WebInspector.UIString(WebInspector.useLowerCaseMenuTitles() ? "Clear console" : "Clear Console"), this._requestClearMessages.bind(this));

        var request = consoleMessage ? consoleMessage.request : null;
        if (request && request.resourceType() === WebInspector.resourceTypes.XHR) {
            contextMenu.appendSeparator();
            contextMenu.appendItem(WebInspector.UIString("Replay XHR"), request.replayXHR.bind(request));
        }

        contextMenu.show();
    },

    /**
     * @param {!WebInspector.ConsoleViewMessage} lastMessage
     * @param {?WebInspector.ConsoleViewMessage} viewMessage
     * @return {boolean}
     */
    _tryToCollapseMessages: function(lastMessage, viewMessage)
    {
        if (!WebInspector.settings.consoleTimestampsEnabled.get() && viewMessage && !lastMessage.consoleMessage().isGroupMessage() && lastMessage.consoleMessage().isEqual(viewMessage.consoleMessage())) {
            viewMessage.incrementRepeatCount();
            return true;
        }

        return false;
    },

    _updateMessageList: function()
    {
        this._topGroup = WebInspector.ConsoleGroup.createTopGroup();
        this._currentGroup = this._topGroup;
        this._searchResults = [];
        this._hiddenByFilterCount = 0;
        for (var i = 0; i < this._visibleViewMessages.length; ++i) {
            this._visibleViewMessages[i].resetCloseGroupDecorationCount();
            this._visibleViewMessages[i].resetIncrementRepeatCount();
        }
        this._visibleViewMessages = [];
        for (var i = 0; i < this._consoleMessages.length; ++i)
            this._appendMessageToEnd(this._consoleMessages[i]);
        this._updateFilterStatus();
        this._viewport.invalidate();
    },

    /**
     * @param {!WebInspector.Event} event
     */
    _monitoringXHREnabledSettingChanged: function(event)
    {
        var enabled = /** @type {boolean} */ (event.data);
        WebInspector.targetManager.targets().forEach(function(target) {target.consoleAgent().setMonitoringXHREnabled(enabled);});
    },

    /**
     * @param {!Event} event
     */
    _messagesClicked: function(event)
    {
        if (!this._prompt.isCaretInsidePrompt() && event.target.window().getSelection().isCollapsed)
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
        this._shortcuts[shortcutL.key] = this._requestClearMessages.bind(this);
        var keys = [shortcutL];
        if (WebInspector.isMac()) {
            var shortcutK = shortcut.makeDescriptor("k", WebInspector.KeyboardShortcut.Modifiers.Meta);
            this._shortcuts[shortcutK.key] = this._requestClearMessages.bind(this);
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
        this._prompt.text = "";
    },

    _requestClearMessages: function()
    {
        var targets = WebInspector.targetManager.targets();
        for (var i = 0; i < targets.length; ++i)
            targets[i].consoleModel.requestClearMessages();
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

        var str = this._prompt.text;
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

        var target = result.target();
        /**
         * @param {string=} url
         * @param {number=} lineNumber
         * @param {number=} columnNumber
         */
        function addMessage(url, lineNumber, columnNumber)
        {
            var level = wasThrown ? WebInspector.ConsoleMessage.MessageLevel.Error : WebInspector.ConsoleMessage.MessageLevel.Log;
            var message;
            if (!wasThrown)
                message = new WebInspector.ConsoleMessage(target, WebInspector.ConsoleMessage.MessageSource.JS, level, "", WebInspector.ConsoleMessage.MessageType.Result, url, lineNumber, columnNumber, undefined, [result]);
            else
                message = new WebInspector.ConsoleMessage(target, WebInspector.ConsoleMessage.MessageSource.JS, level, exceptionDetails.text, WebInspector.ConsoleMessage.MessageType.Result, exceptionDetails.url, exceptionDetails.line, exceptionDetails.column, undefined, [WebInspector.UIString("Uncaught"), result], exceptionDetails.stackTrace, undefined, undefined, undefined, undefined, exceptionDetails.scriptId);
            message.setOriginatingMessage(originatingConsoleMessage);
            target.consoleModel.addMessage(message);
        }

        if (result.type !== "function") {
            addMessage();
            return;
        }

        result.functionDetails(didGetDetails);

        /**
         * @param {?WebInspector.DebuggerModel.FunctionDetails} response
         */
        function didGetDetails(response)
        {
            if (!response || !response.location) {
                addMessage();
                return;
            }
            var url;
            var lineNumber;
            var columnNumber;
            var script = target.debuggerModel.scriptForId(response.location.scriptId);
            if (script && script.sourceURL) {
                url = script.sourceURL;
                // FIXME(WK62725): Debugger line/column are 0-based, while console ones are 1-based.
                lineNumber = response.location.lineNumber + 1;
                columnNumber = response.location.columnNumber + 1;
            }
            // FIXME: this should be using live location.
            addMessage(url, lineNumber, columnNumber);
        }
    },

    /**
     * @param {string} text
     * @param {boolean} useCommandLineAPI
     */
    _appendCommand: function(text, useCommandLineAPI)
    {

        this._prompt.text = "";
        var currentExecutionContext = WebInspector.context.flavor(WebInspector.ExecutionContext);
        if (currentExecutionContext)
            WebInspector.ConsoleModel.evaluateCommandInConsole(currentExecutionContext, text, useCommandLineAPI);
    },

    /**
     * @param {!WebInspector.Event} event
     */
    _commandEvaluated: function(event)
    {
        var data = /**{{result: ?WebInspector.RemoteObject, wasThrown: boolean, text: string, commandMessage: !WebInspector.ConsoleMessage}} */ (event.data);
        this._prompt.pushHistoryItem(data.text);
        WebInspector.settings.consoleHistory.set(this._prompt.historyData.slice(-30));
        this._printResult(data.result, data.wasThrown, data.commandMessage, data.exceptionDetails);
    },

    /**
     * @return {!Array.<!Element>}
     */
    elementsToRestoreScrollPositionsFor: function()
    {
        return [this._messagesElement];
    },

    searchCanceled: function()
    {
        this._clearCurrentSearchResultHighlight();
        delete this._searchResults;
        delete this._searchRegex;
        this._viewport.refresh();
    },

    /**
     * @param {!WebInspector.SearchableView.SearchConfig} searchConfig
     * @param {boolean} shouldJump
     * @param {boolean=} jumpBackwards
     */
    performSearch: function(searchConfig, shouldJump, jumpBackwards)
    {
        var query = searchConfig.query;
        this.searchCanceled();
        this._searchableView.updateSearchMatchesCount(0);
        this._searchRegex = createPlainTextSearchRegex(query, "gi");

        /** @type {!Array.<number>} */
        this._searchResults = [];
        for (var i = 0; i < this._visibleViewMessages.length; i++) {
            if (this._visibleViewMessages[i].matchesRegex(this._searchRegex))
                this._searchResults.push(i);
        }
        this._searchableView.updateSearchMatchesCount(this._searchResults.length);
        this._currentSearchResultIndex = -1;
        if (shouldJump && this._searchResults.length)
            this._jumpToSearchResult(jumpBackwards ? -1 : 0);
        this._viewport.refresh();
    },

    jumpToNextSearchResult: function()
    {
        if (!this._searchResults || !this._searchResults.length)
            return;
        this._jumpToSearchResult(this._currentSearchResultIndex + 1);
    },

    jumpToPreviousSearchResult: function()
    {
        if (!this._searchResults || !this._searchResults.length)
            return;
        this._jumpToSearchResult(this._currentSearchResultIndex - 1);
    },

    /**
     * @return {boolean}
     */
    supportsCaseSensitiveSearch: function()
    {
        return false;
    },

    /**
     * @return {boolean}
     */
    supportsRegexSearch: function()
    {
        return false;
    },

    _clearCurrentSearchResultHighlight: function()
    {
        if (!this._searchResults)
            return;

        var highlightedViewMessage = this._visibleViewMessages[this._searchResults[this._currentSearchResultIndex]];
        if (highlightedViewMessage)
            highlightedViewMessage.clearHighlight();
        this._currentSearchResultIndex = -1;
    },

    _jumpToSearchResult: function(index)
    {
        index = mod(index, this._searchResults.length);
        this._clearCurrentSearchResultHighlight();
        this._currentSearchResultIndex = index;
        this._searchableView.updateCurrentMatchIndex(this._currentSearchResultIndex);
        var currentViewMessageIndex = this._searchResults[index];
        this._viewport.scrollItemIntoView(currentViewMessageIndex);
        this._visibleViewMessages[currentViewMessageIndex].highlightSearchResults(this._searchRegex);
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
    this._view = view;
    this._messageURLFilters = WebInspector.settings.messageURLFilters.get();
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

        var levels = [
            {name: "error", label: WebInspector.UIString("Errors")},
            {name: "warning", label: WebInspector.UIString("Warnings")},
            {name: "info", label: WebInspector.UIString("Info")},
            {name: "log", label: WebInspector.UIString("Logs")},
            {name: "debug", label: WebInspector.UIString("Debug")}
        ];
        this._levelFilterUI = new WebInspector.NamedBitSetFilterUI(levels, WebInspector.settings.messageLevelFilters);
        this._levelFilterUI.addEventListener(WebInspector.FilterUI.Events.FilterChanged, this._filterChanged, this);
        filterBar.addFilter(this._levelFilterUI);
        this._hideNetworkMessagesCheckbox = new WebInspector.CheckboxFilterUI("hide-network-messages", WebInspector.UIString("Hide network messages"), true, WebInspector.settings.hideNetworkMessages);
        this._hideNetworkMessagesCheckbox.addEventListener(WebInspector.FilterUI.Events.FilterChanged, this._filterChanged.bind(this), this);
        filterBar.addFilter(this._hideNetworkMessagesCheckbox);
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
        WebInspector.settings.messageURLFilters.set(this._messageURLFilters);
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

        WebInspector.settings.messageURLFilters.set(this._messageURLFilters);
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

        if (WebInspector.settings.hideNetworkMessages.get() && viewMessage.consoleMessage().source === WebInspector.ConsoleMessage.MessageSource.Network)
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
            if (!viewMessage.matchesRegex(this._filterRegex))
                return false;
        }

        return true;
    },

    reset: function()
    {
        this._messageURLFilters = {};
        WebInspector.settings.messageURLFilters.set(this._messageURLFilters);
        WebInspector.settings.messageLevelFilters.set({});
        this._view._showAllMessagesCheckbox.inputElement.checked = true;
        this._hideNetworkMessagesCheckbox.setState(false);
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
    clearHighlight: function()
    {
        var highlightedMessage = this._formattedCommand;
        delete this._formattedCommand;
        this._formatCommand();
        this._element.replaceChild(this._formattedCommand, highlightedMessage);
    },

    /**
     * @param {!RegExp} regexObject
     */
    highlightSearchResults: function(regexObject)
    {
        regexObject.lastIndex = 0;
        var match = regexObject.exec(this.text);
        var matchRanges = [];
        while (match) {
            matchRanges.push(new WebInspector.SourceRange(match.index, match[0].length));
            match = regexObject.exec(this.text);
        }
        WebInspector.highlightSearchResults(this._formattedCommand, matchRanges);
        this._element.scrollIntoViewIfNeeded();
    },

    /**
     * @param {!RegExp} regexObject
     * @return {boolean}
     */
    matchesRegex: function(regexObject)
    {
        regexObject.lastIndex = 0;
        return regexObject.test(this.text);
    },

    /**
     * @return {!Element}
     */
    contentElement: function()
    {
        if (!this._element) {
            this._element = createElementWithClass("div", "console-user-command");
            this._element.message = this;

            this._formatCommand();
            this._element.appendChild(this._formattedCommand);
        }
        return this._element;
    },

    _formatCommand: function()
    {
        this._formattedCommand = createElementWithClass("span", "console-message-text source-code");
        this._formattedCommand.textContent = this.text;
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
WebInspector.ConsoleView.ShowConsoleActionDelegate = function()
{
}

WebInspector.ConsoleView.ShowConsoleActionDelegate.prototype = {
    /**
     * @return {boolean}
     */
    handleAction: function()
    {
        WebInspector.console.show();
        return true;
    }
}
