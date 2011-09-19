/*
 * Copyright (C) 2008 Apple Inc. All Rights Reserved.
 * Copyright (C) 2011 Google Inc. All rights reserved.
 *
 * Redistribution and use in source and binary forms, with or without
 * modification, are permitted provided that the following conditions
 * are met:
 * 1. Redistributions of source code must retain the above copyright
 *    notice, this list of conditions and the following disclaimer.
 * 2. Redistributions in binary form must reproduce the above copyright
 *    notice, this list of conditions and the following disclaimer in the
 *    documentation and/or other materials provided with the distribution.
 *
 * THIS SOFTWARE IS PROVIDED BY APPLE INC. ``AS IS'' AND ANY
 * EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE
 * IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR
 * PURPOSE ARE DISCLAIMED.  IN NO EVENT SHALL APPLE INC. OR
 * CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL,
 * EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO,
 * PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR
 * PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY
 * OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT
 * (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE
 * OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
 */

WebInspector.ScriptsPanel = function(presentationModel)
{
    WebInspector.Panel.call(this, "scripts");

    WebInspector.settings.pauseOnExceptionStateString = WebInspector.settings.createSetting("pauseOnExceptionStateString", WebInspector.ScriptsPanel.PauseOnExceptionsState.DontPauseOnExceptions);

    this._presentationModel = presentationModel;

    this.registerShortcuts();

    this.topStatusBar = document.createElement("div");
    this.topStatusBar.className = "status-bar";
    this.topStatusBar.id = "scripts-status-bar";
    this.element.appendChild(this.topStatusBar);

    this.backButton = document.createElement("button");
    this.backButton.className = "status-bar-item";
    this.backButton.id = "scripts-back";
    this.backButton.title = WebInspector.UIString("Show the previous script resource.");
    this.backButton.disabled = true;
    this.backButton.appendChild(document.createElement("img"));
    this.backButton.addEventListener("click", this._goBack.bind(this), false);
    this.topStatusBar.appendChild(this.backButton);

    this.forwardButton = document.createElement("button");
    this.forwardButton.className = "status-bar-item";
    this.forwardButton.id = "scripts-forward";
    this.forwardButton.title = WebInspector.UIString("Show the next script resource.");
    this.forwardButton.disabled = true;
    this.forwardButton.appendChild(document.createElement("img"));
    this.forwardButton.addEventListener("click", this._goForward.bind(this), false);
    this.topStatusBar.appendChild(this.forwardButton);

    this._filesSelectElement = document.createElement("select");
    this._filesSelectElement.className = "status-bar-item";
    this._filesSelectElement.id = "scripts-files";
    this._filesSelectElement.addEventListener("change", this._filesSelectChanged.bind(this), false);
    this._filesSelectElement.addEventListener("keyup", this._filesSelectChanged.bind(this), false);
    this.topStatusBar.appendChild(this._filesSelectElement);

    this.functionsSelectElement = document.createElement("select");
    this.functionsSelectElement.className = "status-bar-item";
    this.functionsSelectElement.id = "scripts-functions";

    // FIXME: append the functions select element to the top status bar when it is implemented.
    // this.topStatusBar.appendChild(this.functionsSelectElement);

    this._createSidebarButtons();

    this.toggleBreakpointsButton = new WebInspector.StatusBarButton(WebInspector.UIString("Deactivate all breakpoints."), "toggle-breakpoints");
    this.toggleBreakpointsButton.toggled = true;
    this.toggleBreakpointsButton.addEventListener("click", this.toggleBreakpointsClicked.bind(this), false);
    this.sidebarButtonsElement.appendChild(this.toggleBreakpointsButton.element);

    this.debuggerStatusElement = document.createElement("div");
    this.debuggerStatusElement.id = "scripts-debugger-status";
    this.sidebarButtonsElement.appendChild(this.debuggerStatusElement);

    this.viewsContainerElement = document.createElement("div");
    this.viewsContainerElement.id = "script-resource-views";

    this.sidebarElement = document.createElement("div");
    this.sidebarElement.id = "scripts-sidebar";

    this.sidebarResizeElement = document.createElement("div");
    this.sidebarResizeElement.className = "sidebar-resizer-vertical";
    this.sidebarResizeElement.addEventListener("mousedown", this._startSidebarResizeDrag.bind(this), false);

    this.sidebarResizeWidgetElement = document.createElement("div");
    this.sidebarResizeWidgetElement.id = "scripts-sidebar-resizer-widget";
    this.sidebarResizeWidgetElement.addEventListener("mousedown", this._startSidebarResizeDrag.bind(this), false);
    this.topStatusBar.appendChild(this.sidebarResizeWidgetElement);

    this.sidebarPanes = {};
    this.sidebarPanes.watchExpressions = new WebInspector.WatchExpressionsSidebarPane();
    this.sidebarPanes.callstack = new WebInspector.CallStackSidebarPane(this._presentationModel);
    this.sidebarPanes.scopechain = new WebInspector.ScopeChainSidebarPane();
    this.sidebarPanes.jsBreakpoints = new WebInspector.JavaScriptBreakpointsSidebarPane(this._presentationModel, this._showSourceLine.bind(this));
    if (Preferences.nativeInstrumentationEnabled) {
        this.sidebarPanes.domBreakpoints = WebInspector.domBreakpointsSidebarPane;
        this.sidebarPanes.xhrBreakpoints = new WebInspector.XHRBreakpointsSidebarPane();
        this.sidebarPanes.eventListenerBreakpoints = new WebInspector.EventListenerBreakpointsSidebarPane();
    }

    if (Preferences.canInspectWorkers && WebInspector.workerManager)
        this.sidebarElement.addEventListener("contextmenu", this._contextMenu.bind(this), false);
    if (Preferences.canInspectWorkers && WebInspector.workerManager && WebInspector.settings.workerInspectionEnabled.get()) {
        WorkerAgent.setWorkerInspectionEnabled(true);
        this.sidebarPanes.workerList = new WebInspector.WorkerListSidebarPane(WebInspector.workerManager);
    } else
        this.sidebarPanes.workers = new WebInspector.WorkersSidebarPane();

    for (var pane in this.sidebarPanes)
        this.sidebarElement.appendChild(this.sidebarPanes[pane].element);

    this.sidebarPanes.callstack.expanded = true;

    this.sidebarPanes.scopechain.expanded = true;
    this.sidebarPanes.jsBreakpoints.expanded = true;

    var helpSection = WebInspector.shortcutsScreen.section(WebInspector.UIString("Scripts Panel"));
    this.sidebarPanes.callstack.registerShortcuts(helpSection, this.registerShortcut.bind(this));

    var panelEnablerHeading = WebInspector.UIString("You need to enable debugging before you can use the Scripts panel.");
    var panelEnablerDisclaimer = WebInspector.UIString("Enabling debugging will make scripts run slower.");
    var panelEnablerButton = WebInspector.UIString("Enable Debugging");

    this.panelEnablerView = new WebInspector.PanelEnablerView("scripts", panelEnablerHeading, panelEnablerDisclaimer, panelEnablerButton);
    this.panelEnablerView.addEventListener("enable clicked", this._enableDebugging, this);

    this.element.appendChild(this.panelEnablerView.element);
    this.element.appendChild(this.viewsContainerElement);
    this.element.appendChild(this.sidebarElement);
    this.element.appendChild(this.sidebarResizeElement);

    this.enableToggleButton = new WebInspector.StatusBarButton("", "enable-toggle-status-bar-item");
    this.enableToggleButton.addEventListener("click", this._toggleDebugging.bind(this), false);
    if (Preferences.debuggerAlwaysEnabled)
        this.enableToggleButton.element.addStyleClass("hidden");

    this._pauseOnExceptionButton = new WebInspector.StatusBarButton("", "scripts-pause-on-exceptions-status-bar-item", 3);
    this._pauseOnExceptionButton.addEventListener("click", this._togglePauseOnExceptions.bind(this), false);

    this._toggleFormatSourceButton = new WebInspector.StatusBarButton(WebInspector.UIString("Pretty print"), "scripts-toggle-pretty-print-status-bar-item");
    this._toggleFormatSourceButton.toggled = false;
    this._toggleFormatSourceButton.addEventListener("click", this._toggleFormatSource.bind(this), false);

    this._scriptViewStatusBarItemsContainer = document.createElement("div");
    this._scriptViewStatusBarItemsContainer.style.display = "inline-block";

    this._debuggerEnabled = Preferences.debuggerAlwaysEnabled;

    this.reset();

    WebInspector.debuggerModel.addEventListener(WebInspector.DebuggerModel.Events.DebuggerWasEnabled, this._debuggerWasEnabled, this);
    WebInspector.debuggerModel.addEventListener(WebInspector.DebuggerModel.Events.DebuggerWasDisabled, this._debuggerWasDisabled, this);

    this._presentationModel.addEventListener(WebInspector.DebuggerPresentationModel.Events.UISourceCodeAdded, this._uiSourceCodeAdded, this)
    this._presentationModel.addEventListener(WebInspector.DebuggerPresentationModel.Events.UISourceCodeReplaced, this._uiSourceCodeReplaced, this);
    this._presentationModel.addEventListener(WebInspector.DebuggerPresentationModel.Events.ConsoleMessageAdded, this._consoleMessageAdded, this);
    this._presentationModel.addEventListener(WebInspector.DebuggerPresentationModel.Events.ConsoleMessagesCleared, this._consoleMessagesCleared, this);
    this._presentationModel.addEventListener(WebInspector.DebuggerPresentationModel.Events.BreakpointAdded, this._breakpointAdded, this);
    this._presentationModel.addEventListener(WebInspector.DebuggerPresentationModel.Events.BreakpointRemoved, this._breakpointRemoved, this);
    this._presentationModel.addEventListener(WebInspector.DebuggerPresentationModel.Events.DebuggerPaused, this._debuggerPaused, this);
    this._presentationModel.addEventListener(WebInspector.DebuggerPresentationModel.Events.DebuggerResumed, this._debuggerResumed, this);
    this._presentationModel.addEventListener(WebInspector.DebuggerPresentationModel.Events.CallFrameSelected, this._callFrameSelected, this);

    var enableDebugger = Preferences.debuggerAlwaysEnabled || WebInspector.settings.debuggerEnabled.get();
    if (enableDebugger)
        WebInspector.debuggerModel.enableDebugger();

    WebInspector.settings.showScriptFolders.addChangeListener(this._showScriptFoldersSettingChanged.bind(this));
}

// Keep these in sync with WebCore::ScriptDebugServer
WebInspector.ScriptsPanel.PauseOnExceptionsState = {
    DontPauseOnExceptions : "none",
    PauseOnAllExceptions : "all",
    PauseOnUncaughtExceptions: "uncaught"
};

WebInspector.ScriptsPanel.BrowserBreakpointTypes = {
    DOM: "DOM",
    EventListener: "EventListener",
    XHR: "XHR"
}

WebInspector.ScriptsPanel.prototype = {
    get toolbarItemLabel()
    {
        return WebInspector.UIString("Scripts");
    },

    get statusBarItems()
    {
        return [this.enableToggleButton.element, this._pauseOnExceptionButton.element, this._toggleFormatSourceButton.element, this._scriptViewStatusBarItemsContainer];
    },

    get defaultFocusedElement()
    {
        return this._filesSelectElement;
    },

    get paused()
    {
        return this._paused;
    },

    show: function()
    {
        WebInspector.Panel.prototype.show.call(this);
        this.sidebarResizeElement.style.right = (this.sidebarElement.offsetWidth - 3) + "px";
        if (Preferences.nativeInstrumentationEnabled)
            this.sidebarElement.insertBefore(this.sidebarPanes.domBreakpoints.element, this.sidebarPanes.xhrBreakpoints.element);
        this.sidebarPanes.watchExpressions.show();
    },

    get breakpointsActivated()
    {
        return this.toggleBreakpointsButton.toggled;
    },

    _uiSourceCodeAdded: function(event)
    {
        var uiSourceCode = event.data;

        if (!uiSourceCode.url) {
            // Anonymous sources are shown only when stepping.
            return;
        }

        this._addOptionToFilesSelect(uiSourceCode);

        var lastViewedURL = WebInspector.settings.lastViewedScriptFile.get();
        if (!this._filesSelectElement.initialSelectionProcessed) {
            this._filesSelectElement.initialSelectionProcessed = true;
            // Option we just added is the only option in files select.
            // We have to show corresponding source frame immediately.
            this._showSourceFrameAndAddToHistory(uiSourceCode);
            // Restore original value of lastViewedScriptFile because
            // source frame was shown as a result of initial load.
            WebInspector.settings.lastViewedScriptFile.set(lastViewedURL);
        } else if (uiSourceCode.url === lastViewedURL)
            this._showSourceFrameAndAddToHistory(uiSourceCode);
    },

    _showScriptFoldersSettingChanged: function()
    {
        var selectedOption = this._filesSelectElement[this._filesSelectElement.selectedIndex];
        var uiSourceCode = selectedOption ? selectedOption._uiSourceCode : null;

        var options = Array.prototype.slice.call(this._filesSelectElement);
        this._resetFilesSelect();
        for (var i = 0; i < options.length; ++i) {
            if (options[i]._uiSourceCode)
                this._addOptionToFilesSelect(options[i]._uiSourceCode);
        }

        if (uiSourceCode) {
            var index = uiSourceCode._option.index;
            if (typeof index === "number")
                this._filesSelectElement.selectedIndex = index;
        }
    },

    _addOptionToFilesSelect: function(uiSourceCode)
    {
        var showScriptFolders = WebInspector.settings.showScriptFolders.get();

        var select = this._filesSelectElement;
        if (!select.domainOptions)
            select.domainOptions = {};
        if (!select.folderOptions)
            select.folderOptions = {};

        var option = document.createElement("option");
        option._uiSourceCode = uiSourceCode;
        var parsedURL = uiSourceCode.url.asParsedURL();

        var names = this._folderAndDisplayNameForScriptURL(uiSourceCode.url);
        const indent = (!showScriptFolders || WebInspector.isMac()) ? "" : "\u00a0\u00a0\u00a0\u00a0";
        option.text = indent + (names.displayName ? names.displayName : WebInspector.UIString("(program)"));
        option.displayName = names.displayName;

        var folderNameForSorting;
        if (uiSourceCode.isContentScript)
            folderNameForSorting = "2:" + names.folderName;
        else
            folderNameForSorting = "0:" + (names.domain ? names.domain + "\t\t" : "") + names.folderName;

        option.nameForSorting = folderNameForSorting + "\t/\t" + names.displayName; // Use '\t' to make files stick to their folder.
        option.title = uiSourceCode.url;
        if (uiSourceCode.isContentScript)
            option.addStyleClass("extension-script");

        function insertOrdered(option)
        {
            function optionCompare(a, b)
            {
                if (showScriptFolders)
                    return a.nameForSorting.localeCompare(b.nameForSorting);
                else
                    return a.displayName.localeCompare(b.displayName);
            }
            var insertionIndex = insertionIndexForObjectInListSortedByFunction(option, select.childNodes, optionCompare);
            select.insertBefore(option, insertionIndex < 0 ? null : select.childNodes.item(insertionIndex));
        }

        insertOrdered(option);

        if (uiSourceCode.isContentScript && !select.contentScriptSection) {
            var contentScriptSection = document.createElement("option");
            contentScriptSection.text = "\u2014 " + WebInspector.UIString("Content scripts") + " \u2014";
            contentScriptSection.disabled = true;
            contentScriptSection.nameForSorting = "1/ContentScriptSeparator";
            select.contentScriptSection = contentScriptSection;
            insertOrdered(contentScriptSection);
        }

        if (showScriptFolders && !uiSourceCode.isContentScript && names.domain && !select.domainOptions[names.domain]) {
            var domainOption = document.createElement("option");
            domainOption.text = "\u2014 " + names.domain + " \u2014";
            domainOption.nameForSorting = "0:" + names.domain;
            domainOption.disabled = true;
            select.domainOptions[names.domain] = domainOption;
            insertOrdered(domainOption);
        }

        if (showScriptFolders && names.folderName && !select.folderOptions[names.folderName]) {
            var folderOption = document.createElement("option");
            folderOption.text = names.folderName;
            folderOption.nameForSorting = folderNameForSorting;
            folderOption.disabled = true;
            select.folderOptions[names.folderName] = folderOption;
            insertOrdered(folderOption);
        }

        option._uiSourceCode = uiSourceCode;
        uiSourceCode._option = option;
    },

    _folderAndDisplayNameForScriptURL: function(url)
    {
        var parsedURL = url.asParsedURL();
        if (parsedURL)
            url = parsedURL.path;

        var folderName = "";
        var displayName = url;

        var pathLength = displayName.indexOf("?");
        if (pathLength === -1)
            pathLength = displayName.length;

        var fromIndex = displayName.lastIndexOf("/", pathLength - 2);
        if (fromIndex !== -1) {
            folderName = displayName.substring(0, fromIndex);
            displayName = displayName.substring(fromIndex + 1);
        }

        if (displayName.length > 80)
            displayName = "\u2026" + displayName.substring(displayName.length - 80);

        if (folderName.length > 80)
            folderName = "\u2026" + folderName.substring(folderName.length - 80);

        return { domain: (parsedURL ? parsedURL.host : ""), folderName: folderName, displayName: displayName };
    },

    setScriptSourceIsBeingEdited: function(uiSourceCode, inEditMode)
    {
        var option = uiSourceCode._option;
        if (!option)
            return;
        if (inEditMode)
            option.text = option.text.replace(/[^*]$/, "$&*");
        else
            option.text = option.text.replace(/[*]$/, "");
    },

    _consoleMessagesCleared: function()
    {
        for (var i = 0; i < this._filesSelectElement.length; ++i) {
            var option = this._filesSelectElement[i];
            if (option._uiSourceCode && option._uiSourceCode._sourceFrame)
                option._uiSourceCode._sourceFrame.clearMessages();
        }
    },

    _consoleMessageAdded: function(event)
    {
        var message = event.data;

        var sourceFrame = message.uiSourceCode._sourceFrame;
        if (sourceFrame && sourceFrame.loaded)
            sourceFrame.addMessageToSource(message.lineNumber, message.originalMessage);
    },

    _breakpointAdded: function(event)
    {
        var breakpoint = event.data;

        var sourceFrame = breakpoint.uiSourceCode._sourceFrame;
        if (sourceFrame && sourceFrame.loaded)
            sourceFrame.addBreakpoint(breakpoint.lineNumber, breakpoint.resolved, breakpoint.condition, breakpoint.enabled);

        this.sidebarPanes.jsBreakpoints.addBreakpoint(breakpoint);
    },

    _breakpointRemoved: function(event)
    {
        var breakpoint = event.data;

        var sourceFrame = breakpoint.uiSourceCode._sourceFrame;
        if (sourceFrame && sourceFrame.loaded)
            sourceFrame.removeBreakpoint(breakpoint.lineNumber);

        this.sidebarPanes.jsBreakpoints.removeBreakpoint(breakpoint.uiSourceCode, breakpoint.lineNumber);
    },

    evaluateInSelectedCallFrame: function(code, objectGroup, includeCommandLineAPI, returnByValue, callback)
    {
        function didEvaluate()
        {
            if (objectGroup === "console")
                this.sidebarPanes.scopechain.update(this._presentationModel.selectedCallFrame);
            callback.apply(null, arguments);
        }
        var selectedCallFrame = this._presentationModel.selectedCallFrame;
        selectedCallFrame.evaluate(code, objectGroup, includeCommandLineAPI, returnByValue, didEvaluate.bind(this));
    },

    getSelectedCallFrameVariables: function(callback)
    {
        var result = { this: true };

        var selectedCallFrame = this._presentationModel.selectedCallFrame;
        if (!selectedCallFrame)
            callback(result);

        var pendingRequests = 0;

        function propertiesCollected(properties)
        {
            for (var i = 0; properties && i < properties.length; ++i)
                result[properties[i].name] = true;
            if (--pendingRequests == 0)
                callback(result);
        }

        for (var i = 0; i < selectedCallFrame.scopeChain.length; ++i) {
            var scope = selectedCallFrame.scopeChain[i];
            var object = WebInspector.RemoteObject.fromPayload(scope.object);
            pendingRequests++;
            object.getAllProperties(propertiesCollected);
        }
    },

    _debuggerPaused: function(event)
    {
        var callFrames = event.data.callFrames;
        var details = event.data.details;

        this._paused = true;
        this._waitingToPause = false;
        this._stepping = false;

        this._updateDebuggerButtons();

        WebInspector.setCurrentPanel(this);

        this.sidebarPanes.callstack.update(callFrames, details);
        this.sidebarPanes.callstack.selectedCallFrame = this._presentationModel.selectedCallFrame;

        if (details.eventType === WebInspector.DebuggerEventTypes.NativeBreakpoint) {
            if (details.eventData.breakpointType === WebInspector.ScriptsPanel.BrowserBreakpointTypes.DOM) {
                this.sidebarPanes.domBreakpoints.highlightBreakpoint(details.eventData);
                function didCreateBreakpointHitStatusMessage(element)
                {
                    this.sidebarPanes.callstack.setStatus(element);
                }
                this.sidebarPanes.domBreakpoints.createBreakpointHitStatusMessage(details.eventData, didCreateBreakpointHitStatusMessage.bind(this));
            } else if (details.eventData.breakpointType === WebInspector.ScriptsPanel.BrowserBreakpointTypes.EventListener) {
                var eventName = details.eventData.eventName;
                this.sidebarPanes.eventListenerBreakpoints.highlightBreakpoint(details.eventData.eventName);
                var eventNameForUI = WebInspector.EventListenerBreakpointsSidebarPane.eventNameForUI(eventName);
                this.sidebarPanes.callstack.setStatus(WebInspector.UIString("Paused on a \"%s\" Event Listener.", eventNameForUI));
            } else if (details.eventData.breakpointType === WebInspector.ScriptsPanel.BrowserBreakpointTypes.XHR) {
                this.sidebarPanes.xhrBreakpoints.highlightBreakpoint(details.eventData.breakpointURL);
                this.sidebarPanes.callstack.setStatus(WebInspector.UIString("Paused on a XMLHttpRequest."));
            }
        } else {
            function didGetSourceLocation(uiSourceCode, lineNumber)
            {
                var exception = WebInspector.debuggerModel.debuggerPausedDetails.exception;
                if (exception) {
                    this.sidebarPanes.callstack.setStatus(WebInspector.UIString("Paused on exception: '%s'.", exception.description));
                    return;
                }

                if (!uiSourceCode || !this._presentationModel.findBreakpoint(uiSourceCode, lineNumber))
                    return;
                this.sidebarPanes.jsBreakpoints.highlightBreakpoint(uiSourceCode, lineNumber);
                this.sidebarPanes.callstack.setStatus(WebInspector.UIString("Paused on a JavaScript breakpoint."));
            }
            callFrames[0].sourceLine(didGetSourceLocation.bind(this));
        }

        window.focus();
        InspectorFrontendHost.bringToFront();
    },

    _debuggerResumed: function()
    {
        this._paused = false;
        this._waitingToPause = false;
        this._stepping = false;

        this._clearInterface();
    },

    _debuggerWasEnabled: function()
    {
        this._setPauseOnExceptions(WebInspector.settings.pauseOnExceptionStateString.get());

        if (this._debuggerEnabled)
            return;

        this._debuggerEnabled = true;
        this.reset(true);
    },

    _debuggerWasDisabled: function()
    {
        if (!this._debuggerEnabled)
            return;

        this._debuggerEnabled = false;
        this.reset(true);
    },

    reset: function(preserveItems)
    {
        this.visibleView = null;

        delete this.currentQuery;
        this.searchCanceled();

        this._debuggerResumed();

        this._backForwardList = [];
        this._currentBackForwardIndex = -1;
        this._updateBackAndForwardButtons();

        this._resetFilesSelect();
        delete this._filesSelectElement.initialSelectionProcessed;

        this.functionsSelectElement.removeChildren();
        this.viewsContainerElement.removeChildren();

        this.sidebarPanes.jsBreakpoints.reset();
        this.sidebarPanes.watchExpressions.reset();
        if (!preserveItems && this.sidebarPanes.workers)
            this.sidebarPanes.workers.reset();
    },

    _resetFilesSelect: function()
    {
        this._filesSelectElement.removeChildren();
        this._filesSelectElement.domainOptions = {};
        this._filesSelectElement.folderOptions = {};
        delete this._filesSelectElement.contentScriptSection;
    },

    get visibleView()
    {
        return this._visibleView;
    },

    set visibleView(x)
    {
        if (this._visibleView === x)
            return;

        if (this._visibleView)
            this._visibleView.hide();

        this._visibleView = x;

        if (x) {
            x.show(this.viewsContainerElement);
            this._scriptViewStatusBarItemsContainer.removeChildren();
            var statusBarItems = x.statusBarItems || [];
            for (var i = 0; i < statusBarItems.length; ++i)
                this._scriptViewStatusBarItemsContainer.appendChild(statusBarItems[i]);
        }
    },

    canShowAnchorLocation: function(anchor)
    {
        return this._debuggerEnabled && WebInspector.debuggerModel.scriptsForURL(anchor.href).length;
    },

    showAnchorLocation: function(anchor)
    {
        this._showSourceLine(anchor.uiSourceCode, anchor.lineNumber);
    },

    _showSourceLine: function(uiSourceCode, lineNumber)
    {
        var sourceFrame = this._showSourceFrameAndAddToHistory(uiSourceCode);
        sourceFrame.highlightLine(lineNumber);
    },

    _showSourceFrameAndAddToHistory: function(uiSourceCode)
    {
        if (!uiSourceCode._option)
            return;

        var sourceFrame = this._showSourceFrame(uiSourceCode);

        var oldIndex = this._currentBackForwardIndex;
        if (oldIndex >= 0)
            this._backForwardList.splice(oldIndex + 1, this._backForwardList.length - oldIndex);

        // Check for a previous entry of the same object in _backForwardList.
        // If one is found, remove it.
        var previousEntryIndex = this._backForwardList.indexOf(uiSourceCode);
        if (previousEntryIndex !== -1)
            this._backForwardList.splice(previousEntryIndex, 1);

        this._backForwardList.push(uiSourceCode);
        this._currentBackForwardIndex = this._backForwardList.length - 1;

        this._updateBackAndForwardButtons();

        return sourceFrame;
    },

    _showSourceFrame: function(uiSourceCode)
    {
        this._filesSelectElement.selectedIndex = uiSourceCode._option.index;

        var sourceFrame = uiSourceCode._sourceFrame || this._createSourceFrame(uiSourceCode);
        this.visibleView = sourceFrame;

        if (uiSourceCode.url)
            WebInspector.settings.lastViewedScriptFile.set(uiSourceCode.url);

        return sourceFrame;
    },

    _createSourceFrame: function(uiSourceCode)
    {
        var sourceFrame = new WebInspector.JavaScriptSourceFrame(this._presentationModel, uiSourceCode);
        this.addChildView(sourceFrame);
        sourceFrame._uiSourceCode = uiSourceCode;
        sourceFrame.addEventListener(WebInspector.SourceFrame.Events.Loaded, this._sourceFrameLoaded, this);
        uiSourceCode._sourceFrame = sourceFrame;
        return sourceFrame;
    },

    _removeSourceFrame: function(uiSourceCode)
    {
        var sourceFrame = uiSourceCode._sourceFrame;
        if (!sourceFrame)
            return;
        delete uiSourceCode._sourceFrame;
        this.removeChildView(sourceFrame);
        sourceFrame.removeEventListener(WebInspector.SourceFrame.Events.Loaded, this._sourceFrameLoaded, this);
    },

    _uiSourceCodeReplaced: function(event)
    {
        var oldUISourceCode = event.data.oldUISourceCode;
        var uiSourceCode = event.data.uiSourceCode;

        // Re-bind file select option from old source file to new one.
        var option = oldUISourceCode._option;
        if (!option)
            return;
        delete oldUISourceCode._option;
        option._uiSourceCode = uiSourceCode;
        uiSourceCode._option = option;

        // Remove old source frame and create new one if needed.
        this._removeSourceFrame(oldUISourceCode);
        if (option === this._filesSelectElement[this._filesSelectElement.selectedIndex])
            this._showSourceFrame(uiSourceCode);
    },

    _sourceFrameLoaded: function(event)
    {
        var sourceFrame = event.target;
        var uiSourceCode = sourceFrame._uiSourceCode;

        var messages = this._presentationModel.messagesForUISourceCode(uiSourceCode);
        for (var i = 0; i < messages.length; ++i) {
            var message = messages[i];
            sourceFrame.addMessageToSource(message.lineNumber, message.originalMessage);
        }

        var breakpoints = this._presentationModel.breakpointsForUISourceCode(uiSourceCode);
        for (var i = 0; i < breakpoints.length; ++i) {
            var breakpoint = breakpoints[i];
            sourceFrame.addBreakpoint(breakpoint.lineNumber, breakpoint.resolved, breakpoint.condition, breakpoint.enabled);
        }
    },

    _clearCurrentExecutionLine: function()
    {
        if (this._executionSourceFrame)
            this._executionSourceFrame.clearExecutionLine();
        delete this._executionSourceFrame;
    },

    _callFrameSelected: function(event)
    {
        var callFrame = event.data;

        this._clearCurrentExecutionLine();

        if (!callFrame)
            return;

        this.sidebarPanes.scopechain.update(callFrame);
        this.sidebarPanes.watchExpressions.refreshExpressions();
        this.sidebarPanes.callstack.selectedCallFrame = this._presentationModel.selectedCallFrame;

        function didGetSourceLocation(uiSourceCode, lineNumber)
        {
            if (!uiSourceCode)
                return;

            if (!uiSourceCode._option) {
                // Anonymous scripts are not added to files select by default.
                this._addOptionToFilesSelect(uiSourceCode);
            }
            var sourceFrame = this._showSourceFrameAndAddToHistory(uiSourceCode);
            sourceFrame.setExecutionLine(lineNumber);
            this._executionSourceFrame = sourceFrame;
        }
        callFrame.sourceLine(didGetSourceLocation.bind(this));
    },

    _filesSelectChanged: function()
    {
        if (this._filesSelectElement.selectedIndex === -1)
            return;

        var uiSourceCode = this._filesSelectElement[this._filesSelectElement.selectedIndex]._uiSourceCode;
        this._showSourceFrameAndAddToHistory(uiSourceCode);
    },

    _startSidebarResizeDrag: function(event)
    {
        WebInspector.elementDragStart(this.sidebarElement, this._sidebarResizeDrag.bind(this), this._endSidebarResizeDrag.bind(this), event, "ew-resize");

        if (event.target === this.sidebarResizeWidgetElement)
            this._dragOffset = (event.target.offsetWidth - (event.pageX - event.target.totalOffsetLeft()));
        else
            this._dragOffset = 0;
    },

    _endSidebarResizeDrag: function(event)
    {
        WebInspector.elementDragEnd(event);
        delete this._dragOffset;
        this.saveSidebarWidth();
    },

    _sidebarResizeDrag: function(event)
    {
        var x = event.pageX + this._dragOffset;
        var newWidth = Number.constrain(window.innerWidth - x, Preferences.minScriptsSidebarWidth, window.innerWidth * 0.66);
        this.setSidebarWidth(newWidth);
        event.preventDefault();
    },

    setSidebarWidth: function(newWidth)
    {
        this.sidebarElement.style.width = newWidth + "px";
        this.sidebarButtonsElement.style.width = newWidth + "px";
        this.viewsContainerElement.style.right = newWidth + "px";
        this.sidebarResizeWidgetElement.style.right = newWidth + "px";
        this.sidebarResizeElement.style.right = (newWidth - 3) + "px";

        this.doResize();
    },

    _setPauseOnExceptions: function(pauseOnExceptionsState)
    {
        pauseOnExceptionsState = pauseOnExceptionsState || WebInspector.ScriptsPanel.PauseOnExceptionsState.DontPauseOnExceptions;
        function callback(error)
        {
            if (error)
                return;
            if (pauseOnExceptionsState == WebInspector.ScriptsPanel.PauseOnExceptionsState.DontPauseOnExceptions)
                this._pauseOnExceptionButton.title = WebInspector.UIString("Don't pause on exceptions.\nClick to Pause on all exceptions.");
            else if (pauseOnExceptionsState == WebInspector.ScriptsPanel.PauseOnExceptionsState.PauseOnAllExceptions)
                this._pauseOnExceptionButton.title = WebInspector.UIString("Pause on all exceptions.\nClick to Pause on uncaught exceptions.");
            else if (pauseOnExceptionsState == WebInspector.ScriptsPanel.PauseOnExceptionsState.PauseOnUncaughtExceptions)
                this._pauseOnExceptionButton.title = WebInspector.UIString("Pause on uncaught exceptions.\nClick to Not pause on exceptions.");

            this._pauseOnExceptionButton.state = pauseOnExceptionsState;
            WebInspector.settings.pauseOnExceptionStateString.set(pauseOnExceptionsState);
        }
        DebuggerAgent.setPauseOnExceptions(pauseOnExceptionsState, callback.bind(this));
    },

    _updateDebuggerButtons: function()
    {
        if (this._debuggerEnabled) {
            this.enableToggleButton.title = WebInspector.UIString("Debugging enabled. Click to disable.");
            this.enableToggleButton.toggled = true;
            this._pauseOnExceptionButton.visible = true;
            this.panelEnablerView.visible = false;
        } else {
            this.enableToggleButton.title = WebInspector.UIString("Debugging disabled. Click to enable.");
            this.enableToggleButton.toggled = false;
            this._pauseOnExceptionButton.visible = false;
            this.panelEnablerView.visible = true;
        }

        if (this._paused) {
            this.pauseButton.addStyleClass("paused");

            this.pauseButton.disabled = false;
            this.stepOverButton.disabled = false;
            this.stepIntoButton.disabled = false;
            this.stepOutButton.disabled = false;

            this.debuggerStatusElement.textContent = WebInspector.UIString("Paused");
        } else {
            this.pauseButton.removeStyleClass("paused");

            this.pauseButton.disabled = this._waitingToPause;
            this.stepOverButton.disabled = true;
            this.stepIntoButton.disabled = true;
            this.stepOutButton.disabled = true;

            if (this._waitingToPause)
                this.debuggerStatusElement.textContent = WebInspector.UIString("Pausing");
            else if (this._stepping)
                this.debuggerStatusElement.textContent = WebInspector.UIString("Stepping");
            else
                this.debuggerStatusElement.textContent = "";
        }
    },

    _updateBackAndForwardButtons: function()
    {
        this.backButton.disabled = this._currentBackForwardIndex <= 0;
        this.forwardButton.disabled = this._currentBackForwardIndex >= (this._backForwardList.length - 1);
    },

    _clearInterface: function()
    {
        this.sidebarPanes.callstack.update(null);
        this.sidebarPanes.scopechain.update(null);
        this.sidebarPanes.jsBreakpoints.clearBreakpointHighlight();
        if (Preferences.nativeInstrumentationEnabled) {
            this.sidebarPanes.domBreakpoints.clearBreakpointHighlight();
            this.sidebarPanes.eventListenerBreakpoints.clearBreakpointHighlight();
            this.sidebarPanes.xhrBreakpoints.clearBreakpointHighlight();
        }

        this._clearCurrentExecutionLine();
        this._updateDebuggerButtons();
    },

    _goBack: function()
    {
        if (this._currentBackForwardIndex <= 0) {
            console.error("Can't go back from index " + this._currentBackForwardIndex);
            return;
        }

        this._showSourceFrame(this._backForwardList[--this._currentBackForwardIndex]);
        this._updateBackAndForwardButtons();
    },

    _goForward: function()
    {
        if (this._currentBackForwardIndex >= this._backForwardList.length - 1) {
            console.error("Can't go forward from index " + this._currentBackForwardIndex);
            return;
        }

        this._showSourceFrame(this._backForwardList[++this._currentBackForwardIndex]);
        this._updateBackAndForwardButtons();
    },

    _enableDebugging: function()
    {
        if (this._debuggerEnabled)
            return;
        this._toggleDebugging(this.panelEnablerView.alwaysEnabled);
    },

    _toggleDebugging: function(optionalAlways)
    {
        this._paused = false;
        this._waitingToPause = false;
        this._stepping = false;

        if (this._debuggerEnabled) {
            WebInspector.settings.debuggerEnabled.set(false);
            WebInspector.debuggerModel.disableDebugger();
        } else {
            WebInspector.settings.debuggerEnabled.set(!!optionalAlways);
            WebInspector.debuggerModel.enableDebugger();
        }
    },

    _togglePauseOnExceptions: function()
    {
        var nextStateMap = {};
        var stateEnum = WebInspector.ScriptsPanel.PauseOnExceptionsState;
        nextStateMap[stateEnum.DontPauseOnExceptions] = stateEnum.PauseOnAllExceptions;
        nextStateMap[stateEnum.PauseOnAllExceptions] = stateEnum.PauseOnUncaughtExceptions;
        nextStateMap[stateEnum.PauseOnUncaughtExceptions] = stateEnum.DontPauseOnExceptions;
        this._setPauseOnExceptions(nextStateMap[this._pauseOnExceptionButton.state]);
    },

    _togglePause: function()
    {
        if (this._paused) {
            this._paused = false;
            this._waitingToPause = false;
            DebuggerAgent.resume();
        } else {
            this._stepping = false;
            this._waitingToPause = true;
            DebuggerAgent.pause();
        }

        this._clearInterface();
    },

    _stepOverClicked: function()
    {
        if (!this._paused)
            return;

        this._paused = false;
        this._stepping = true;

        this._clearInterface();

        DebuggerAgent.stepOver();
    },

    _stepIntoClicked: function()
    {
        if (!this._paused)
            return;

        this._paused = false;
        this._stepping = true;

        this._clearInterface();

        DebuggerAgent.stepInto();
    },

    _stepOutClicked: function()
    {
        if (!this._paused)
            return;

        this._paused = false;
        this._stepping = true;

        this._clearInterface();

        DebuggerAgent.stepOut();
    },

    toggleBreakpointsClicked: function()
    {
        this.toggleBreakpointsButton.toggled = !this.toggleBreakpointsButton.toggled;
        if (this.toggleBreakpointsButton.toggled) {
            DebuggerAgent.setBreakpointsActive(true);
            this.toggleBreakpointsButton.title = WebInspector.UIString("Deactivate all breakpoints.");
            document.getElementById("main-panels").removeStyleClass("breakpoints-deactivated");
        } else {
            DebuggerAgent.setBreakpointsActive(false);
            this.toggleBreakpointsButton.title = WebInspector.UIString("Activate all breakpoints.");
            document.getElementById("main-panels").addStyleClass("breakpoints-deactivated");
        }
    },

    elementsToRestoreScrollPositionsFor: function()
    {
        return [ this.sidebarElement ];
    },

    _createSidebarButtons: function()
    {
        this.sidebarButtonsElement = document.createElement("div");
        this.sidebarButtonsElement.id = "scripts-sidebar-buttons";
        this.topStatusBar.appendChild(this.sidebarButtonsElement);

        var title, handler, shortcuts;
        var platformSpecificModifier = WebInspector.KeyboardShortcut.Modifiers.CtrlOrMeta;

        // Continue.
        title = WebInspector.UIString("Pause script execution (%s).");
        handler = this._togglePause.bind(this);
        shortcuts = [];
        shortcuts.push(WebInspector.KeyboardShortcut.makeDescriptor(WebInspector.KeyboardShortcut.Keys.F8));
        shortcuts.push(WebInspector.KeyboardShortcut.makeDescriptor(WebInspector.KeyboardShortcut.Keys.Slash, platformSpecificModifier));
        this.pauseButton = this._createSidebarButtonAndRegisterShortcuts("scripts-pause", title, handler, shortcuts, WebInspector.UIString("Pause/Continue"));

        // Step over.
        title = WebInspector.UIString("Step over next function call (%s).");
        handler = this._stepOverClicked.bind(this);
        shortcuts = [];
        shortcuts.push(WebInspector.KeyboardShortcut.makeDescriptor(WebInspector.KeyboardShortcut.Keys.F10));
        shortcuts.push(WebInspector.KeyboardShortcut.makeDescriptor(WebInspector.KeyboardShortcut.Keys.SingleQuote, platformSpecificModifier));
        this.stepOverButton = this._createSidebarButtonAndRegisterShortcuts("scripts-step-over", title, handler, shortcuts, WebInspector.UIString("Step over"));

        // Step into.
        title = WebInspector.UIString("Step into next function call (%s).");
        handler = this._stepIntoClicked.bind(this);
        shortcuts = [];
        shortcuts.push(WebInspector.KeyboardShortcut.makeDescriptor(WebInspector.KeyboardShortcut.Keys.F11));
        shortcuts.push(WebInspector.KeyboardShortcut.makeDescriptor(WebInspector.KeyboardShortcut.Keys.Semicolon, platformSpecificModifier));
        this.stepIntoButton = this._createSidebarButtonAndRegisterShortcuts("scripts-step-into", title, handler, shortcuts, WebInspector.UIString("Step into"));

        // Step out.
        title = WebInspector.UIString("Step out of current function (%s).");
        handler = this._stepOutClicked.bind(this);
        shortcuts = [];
        shortcuts.push(WebInspector.KeyboardShortcut.makeDescriptor(WebInspector.KeyboardShortcut.Keys.F11, WebInspector.KeyboardShortcut.Modifiers.Shift));
        shortcuts.push(WebInspector.KeyboardShortcut.makeDescriptor(WebInspector.KeyboardShortcut.Keys.Semicolon, WebInspector.KeyboardShortcut.Modifiers.Shift, platformSpecificModifier));
        this.stepOutButton = this._createSidebarButtonAndRegisterShortcuts("scripts-step-out", title, handler, shortcuts, WebInspector.UIString("Step out"));
    },

    _createSidebarButtonAndRegisterShortcuts: function(buttonId, buttonTitle, handler, shortcuts, shortcutDescription)
    {
        var button = document.createElement("button");
        button.className = "status-bar-item";
        button.id = buttonId;
        button.title = String.vsprintf(buttonTitle, [shortcuts[0].name]);
        button.disabled = true;
        button.appendChild(document.createElement("img"));
        button.addEventListener("click", handler, false);
        this.sidebarButtonsElement.appendChild(button);

        var shortcutNames = [];
        for (var i = 0; i < shortcuts.length; ++i) {
            this.registerShortcut(shortcuts[i].key, handler);
            shortcutNames.push(shortcuts[i].name);
        }
        var section = WebInspector.shortcutsScreen.section(WebInspector.UIString("Scripts Panel"));
        section.addAlternateKeys(shortcutNames, shortcutDescription);

        return button;
    },

    searchCanceled: function()
    {
        if (this._searchView)
            this._searchView.searchCanceled();

        delete this._searchView;
        delete this._searchQuery;
    },

    performSearch: function(query)
    {
        WebInspector.searchController.updateSearchMatchesCount(0, this);

        if (!this.visibleView)
            return;

        // Call searchCanceled since it will reset everything we need before doing a new search.
        this.searchCanceled();

        this._searchView = this.visibleView;
        this._searchQuery = query;

        function finishedCallback(view, searchMatches)
        {
            if (!searchMatches)
                return;

            WebInspector.searchController.updateSearchMatchesCount(searchMatches, this);
            view.jumpToFirstSearchResult();
            WebInspector.searchController.updateCurrentMatchIndex(view.currentSearchResultIndex + 1, this);
        }

        this._searchView.performSearch(query, finishedCallback.bind(this));
    },

    jumpToNextSearchResult: function()
    {
        if (!this._searchView)
            return;

        if (this._searchView !== this.visibleView) {
            this.performSearch(this._searchQuery);
            return;
        }

        if (this._searchView.showingLastSearchResult())
            this._searchView.jumpToFirstSearchResult();
        else
            this._searchView.jumpToNextSearchResult();
        WebInspector.searchController.updateCurrentMatchIndex(this._searchView.currentSearchResultIndex + 1, this);
    },

    jumpToPreviousSearchResult: function()
    {
        if (!this._searchView)
            return;

        if (this._searchView !== this.visibleView) {
            this.performSearch(this._searchQuery);
            if (this._searchView)
                this._searchView.jumpToLastSearchResult();
            return;
        }

        if (this._searchView.showingFirstSearchResult())
            this._searchView.jumpToLastSearchResult();
        else
            this._searchView.jumpToPreviousSearchResult();
        WebInspector.searchController.updateCurrentMatchIndex(this._searchView.currentSearchResultIndex + 1, this);
    },

    _toggleFormatSource: function()
    {
        this._toggleFormatSourceButton.toggled = !this._toggleFormatSourceButton.toggled;
        this._presentationModel.setFormatSource(this._toggleFormatSourceButton.toggled);
    },

    _contextMenu: function(event)
    {
        var contextMenu = new WebInspector.ContextMenu();

        function enableWorkerInspection()
        {
            var newValue = !WebInspector.settings.workerInspectionEnabled.get();
            WebInspector.settings.workerInspectionEnabled.set(newValue);
            WorkerAgent.setWorkerInspectionEnabled(newValue);
            if (newValue) {
                var element = this.sidebarPanes.workers.element;
                delete this.sidebarPanes.workers;
                this.sidebarPanes.workerList = new WebInspector.WorkerListSidebarPane(WebInspector.workerManager);
                element.parentNode.replaceChild(this.sidebarPanes.workerList.element, element);
            } else {
                var element = this.sidebarPanes.workerList.element;
                delete this.sidebarPanes.workerList;
                this.sidebarPanes.workers = new WebInspector.WorkersSidebarPane();
                element.parentNode.replaceChild(this.sidebarPanes.workers.element, element);
            }
        }
        contextMenu.appendCheckboxItem(WebInspector.UIString("Enable worker inspection"), enableWorkerInspection.bind(this), WebInspector.settings.workerInspectionEnabled.get());

        contextMenu.show(event);
    }
}

WebInspector.ScriptsPanel.prototype.__proto__ = WebInspector.Panel.prototype;
