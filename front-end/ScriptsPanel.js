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

importScript("BreakpointsSidebarPane.js");
importScript("CallStackSidebarPane.js");
importScript("FilePathScoreFunction.js");
importScript("FilteredItemSelectionDialog.js");
importScript("UISourceCodeFrame.js");
importScript("JavaScriptSourceFrame.js");
importScript("NavigatorOverlayController.js");
importScript("NavigatorView.js");
importScript("RevisionHistoryView.js");
importScript("ScopeChainSidebarPane.js");
importScript("ScriptsNavigator.js");
importScript("ScriptsSearchScope.js");
importScript("StyleSheetOutlineDialog.js");
importScript("TabbedEditorContainer.js");
importScript("WatchExpressionsSidebarPane.js");
importScript("WorkersSidebarPane.js");

/**
 * @constructor
 * @implements {WebInspector.TabbedEditorContainerDelegate}
 * @implements {WebInspector.ContextMenu.Provider}
 * @extends {WebInspector.Panel}
 * @param {WebInspector.Workspace=} workspaceForTest
 */
WebInspector.ScriptsPanel = function(workspaceForTest)
{
    WebInspector.Panel.call(this, "scripts");
    this.registerRequiredCSS("scriptsPanel.css");
    this.registerRequiredCSS("textPrompt.css"); // Watch Expressions autocomplete.

    WebInspector.settings.navigatorWasOnceHidden = WebInspector.settings.createSetting("navigatorWasOnceHidden", false);
    WebInspector.settings.debuggerSidebarHidden = WebInspector.settings.createSetting("debuggerSidebarHidden", false);

    this._workspace = workspaceForTest || WebInspector.workspace;

    function viewGetter()
    {
        return this.visibleView;
    }
    WebInspector.GoToLineDialog.install(this, viewGetter.bind(this));

    var helpSection = WebInspector.shortcutsScreen.section(WebInspector.UIString("Sources Panel"));
    this.debugToolbar = this._createDebugToolbar();

    const initialDebugSidebarWidth = 225;
    const minimumDebugSidebarWidthPercent = 0.5;
    this.createSidebarView(this.element, WebInspector.SidebarView.SidebarPosition.End, initialDebugSidebarWidth);
    this.splitView.element.id = "scripts-split-view";
    this.splitView.setSidebarElementConstraints(Preferences.minScriptsSidebarWidth);
    this.splitView.setMainElementConstraints(minimumDebugSidebarWidthPercent);

    // Create scripts navigator
    const initialNavigatorWidth = 225;
    const minimumViewsContainerWidthPercent = 0.5;
    this.editorView = new WebInspector.SidebarView(WebInspector.SidebarView.SidebarPosition.Start, "scriptsPanelNavigatorSidebarWidth", initialNavigatorWidth);
    this.editorView.element.tabIndex = 0;

    this.editorView.setSidebarElementConstraints(Preferences.minScriptsSidebarWidth);
    this.editorView.setMainElementConstraints(minimumViewsContainerWidthPercent);
    this.editorView.show(this.splitView.mainElement);

    this._navigator = new WebInspector.ScriptsNavigator();
    this._navigator.view.show(this.editorView.sidebarElement);

    var tabbedEditorPlaceholderText = WebInspector.isMac() ? WebInspector.UIString("Hit Cmd+O to open a file") : WebInspector.UIString("Hit Ctrl+O to open a file");

    this._editorContentsElement = this.editorView.mainElement.createChild("div", "fill");
    this._editorFooterElement = this.editorView.mainElement.createChild("div", "inspector-footer status-bar hidden");
    this._editorContainer = new WebInspector.TabbedEditorContainer(this, "previouslyViewedFiles", tabbedEditorPlaceholderText);
    this._editorContainer.show(this._editorContentsElement);

    this._navigatorController = new WebInspector.NavigatorOverlayController(this.editorView, this._navigator.view, this._editorContainer.view);

    this._navigator.addEventListener(WebInspector.ScriptsNavigator.Events.ScriptSelected, this._scriptSelected, this);
    this._navigator.addEventListener(WebInspector.ScriptsNavigator.Events.ItemSearchStarted, this._itemSearchStarted, this);
    this._navigator.addEventListener(WebInspector.ScriptsNavigator.Events.ItemCreationRequested, this._itemCreationRequested, this);
    this._navigator.addEventListener(WebInspector.ScriptsNavigator.Events.ItemRenamingRequested, this._itemRenamingRequested, this);

    this._editorContainer.addEventListener(WebInspector.TabbedEditorContainer.Events.EditorSelected, this._editorSelected, this);
    this._editorContainer.addEventListener(WebInspector.TabbedEditorContainer.Events.EditorClosed, this._editorClosed, this);

    this._debugSidebarResizeWidgetElement = this.splitView.mainElement.createChild("div", "resizer-widget");
    this._debugSidebarResizeWidgetElement.id = "scripts-debug-sidebar-resizer-widget";
    this.splitView.installResizer(this._debugSidebarResizeWidgetElement);

    this.sidebarPanes = {};
    this.sidebarPanes.watchExpressions = new WebInspector.WatchExpressionsSidebarPane();
    this.sidebarPanes.callstack = new WebInspector.CallStackSidebarPane();
    this.sidebarPanes.callstack.addEventListener(WebInspector.CallStackSidebarPane.Events.CallFrameSelected, this._callFrameSelectedInSidebar.bind(this));

    this.sidebarPanes.scopechain = new WebInspector.ScopeChainSidebarPane();
    this.sidebarPanes.jsBreakpoints = new WebInspector.JavaScriptBreakpointsSidebarPane(WebInspector.breakpointManager, this._showSourceLocation.bind(this));
    this.sidebarPanes.domBreakpoints = WebInspector.domBreakpointsSidebarPane.createProxy(this);
    this.sidebarPanes.xhrBreakpoints = new WebInspector.XHRBreakpointsSidebarPane();
    this.sidebarPanes.eventListenerBreakpoints = new WebInspector.EventListenerBreakpointsSidebarPane();

    if (Capabilities.canInspectWorkers && !WebInspector.WorkerManager.isWorkerFrontend()) {
        WorkerAgent.enable();
        this.sidebarPanes.workerList = new WebInspector.WorkersSidebarPane(WebInspector.workerManager);
    }

    this.sidebarPanes.callstack.registerShortcuts(this.registerShortcuts.bind(this));
    this.registerShortcuts(WebInspector.ScriptsPanelDescriptor.ShortcutKeys.GoToMember, this._showOutlineDialog.bind(this));
    this.registerShortcuts(WebInspector.ScriptsPanelDescriptor.ShortcutKeys.ToggleBreakpoint, this._toggleBreakpoint.bind(this));

    this._pauseOnExceptionButton = new WebInspector.StatusBarButton("", "scripts-pause-on-exceptions-status-bar-item", 3);
    this._pauseOnExceptionButton.addEventListener("click", this._togglePauseOnExceptions, this);

    this._toggleFormatSourceButton = new WebInspector.StatusBarButton(WebInspector.UIString("Pretty print"), "scripts-toggle-pretty-print-status-bar-item");
    this._toggleFormatSourceButton.toggled = false;
    this._toggleFormatSourceButton.addEventListener("click", this._toggleFormatSource, this);

    this._scriptViewStatusBarItemsContainer = document.createElement("div");
    this._scriptViewStatusBarItemsContainer.className = "inline-block";

    this._scriptViewStatusBarTextContainer = document.createElement("div");
    this._scriptViewStatusBarTextContainer.className = "inline-block";

    this._installDebuggerSidebarController();

    WebInspector.dockController.addEventListener(WebInspector.DockController.Events.DockSideChanged, this._dockSideChanged.bind(this));
    WebInspector.settings.splitVerticallyWhenDockedToRight.addChangeListener(this._dockSideChanged.bind(this));
    this._dockSideChanged();

    /** @type {!Map.<!WebInspector.UISourceCode, !WebInspector.SourceFrame>} */
    this._sourceFramesByUISourceCode = new Map();
    this._updateDebuggerButtons();
    this._pauseOnExceptionStateChanged();
    if (WebInspector.debuggerModel.isPaused())
        this._debuggerPaused();

    WebInspector.settings.pauseOnExceptionStateString.addChangeListener(this._pauseOnExceptionStateChanged, this);
    WebInspector.debuggerModel.addEventListener(WebInspector.DebuggerModel.Events.DebuggerWasEnabled, this._debuggerWasEnabled, this);
    WebInspector.debuggerModel.addEventListener(WebInspector.DebuggerModel.Events.DebuggerWasDisabled, this._debuggerWasDisabled, this);
    WebInspector.debuggerModel.addEventListener(WebInspector.DebuggerModel.Events.DebuggerPaused, this._debuggerPaused, this);
    WebInspector.debuggerModel.addEventListener(WebInspector.DebuggerModel.Events.DebuggerResumed, this._debuggerResumed, this);
    WebInspector.debuggerModel.addEventListener(WebInspector.DebuggerModel.Events.CallFrameSelected, this._callFrameSelected, this);
    WebInspector.debuggerModel.addEventListener(WebInspector.DebuggerModel.Events.ConsoleCommandEvaluatedInSelectedCallFrame, this._consoleCommandEvaluatedInSelectedCallFrame, this);
    WebInspector.debuggerModel.addEventListener(WebInspector.DebuggerModel.Events.BreakpointsActiveStateChanged, this._breakpointsActiveStateChanged, this);

    WebInspector.startBatchUpdate();
    this._workspace.uiSourceCodes().forEach(this._addUISourceCode.bind(this));
    WebInspector.endBatchUpdate();

    this._workspace.addEventListener(WebInspector.Workspace.Events.UISourceCodeAdded, this._uiSourceCodeAdded, this);
    this._workspace.addEventListener(WebInspector.Workspace.Events.UISourceCodeRemoved, this._uiSourceCodeRemoved, this);
    this._workspace.addEventListener(WebInspector.Workspace.Events.ProjectWillReset, this._projectWillReset.bind(this), this);
    WebInspector.debuggerModel.addEventListener(WebInspector.DebuggerModel.Events.GlobalObjectCleared, this._debuggerReset, this);

    WebInspector.advancedSearchController.registerSearchScope(new WebInspector.ScriptsSearchScope(this._workspace));

    this._boundOnKeyUp = this._onKeyUp.bind(this);
    this._boundOnKeyDown = this._onKeyDown.bind(this);
}

WebInspector.ScriptsPanel.prototype = {
    get statusBarItems()
    {
        return [this._pauseOnExceptionButton.element, this._toggleFormatSourceButton.element, this._scriptViewStatusBarItemsContainer];
    },

    /**
     * @return {?Element}
     */
    statusBarText: function()
    {
        return this._scriptViewStatusBarTextContainer;
    },

    defaultFocusedElement: function()
    {
        return this._editorContainer.view.defaultFocusedElement() || this._navigator.view.defaultFocusedElement();
    },

    get paused()
    {
        return this._paused;
    },

    wasShown: function()
    {
        WebInspector.Panel.prototype.wasShown.call(this);
        this._navigatorController.wasShown();

        this.element.addEventListener("keydown", this._boundOnKeyDown, false);
        this.element.addEventListener("keyup", this._boundOnKeyUp, false);
    },

    willHide: function()
    {
        this.element.removeEventListener("keydown", this._boundOnKeyDown, false);
        this.element.removeEventListener("keyup", this._boundOnKeyUp, false);

        WebInspector.Panel.prototype.willHide.call(this);
        WebInspector.closeViewInDrawer();
    },

    /**
     * @param {WebInspector.Event} event
     */
    _uiSourceCodeAdded: function(event)
    {
        var uiSourceCode = /** @type {WebInspector.UISourceCode} */ (event.data);
        this._addUISourceCode(uiSourceCode);
    },

    /**
     * @param {WebInspector.UISourceCode} uiSourceCode
     */
    _addUISourceCode: function(uiSourceCode)
    {
        if (this._toggleFormatSourceButton.toggled)
            uiSourceCode.setFormatted(true);
        if (uiSourceCode.project().isServiceProject())
            return;
        this._navigator.addUISourceCode(uiSourceCode);
        this._editorContainer.addUISourceCode(uiSourceCode);
        // Replace debugger script-based uiSourceCode with a network-based one.
        var currentUISourceCode = this._currentUISourceCode;
        if (currentUISourceCode && currentUISourceCode.project().isServiceProject() && currentUISourceCode !== uiSourceCode && currentUISourceCode.url === uiSourceCode.url) {
            this._showFile(uiSourceCode);
            this._editorContainer.removeUISourceCode(currentUISourceCode);
        }
    },

    _uiSourceCodeRemoved: function(event)
    {
        var uiSourceCode = /** @type {WebInspector.UISourceCode} */ (event.data);
        this._removeUISourceCodes([uiSourceCode]);
    },

    /**
     * @param {Array.<WebInspector.UISourceCode>} uiSourceCodes
     */
    _removeUISourceCodes: function(uiSourceCodes)
    {
        for (var i = 0; i < uiSourceCodes.length; ++i) {
            this._navigator.removeUISourceCode(uiSourceCodes[i]);
            this._removeSourceFrame(uiSourceCodes[i]);
        }
        this._editorContainer.removeUISourceCodes(uiSourceCodes);
    },

    _consoleCommandEvaluatedInSelectedCallFrame: function(event)
    {
        this.sidebarPanes.scopechain.update(WebInspector.debuggerModel.selectedCallFrame());
    },

    _debuggerPaused: function()
    {
        var details = WebInspector.debuggerModel.debuggerPausedDetails();

        this._paused = true;
        this._waitingToPause = false;
        this._stepping = false;

        this._updateDebuggerButtons();

        WebInspector.inspectorView.setCurrentPanel(this);
        this.sidebarPanes.callstack.update(details.callFrames);

        if (details.reason === WebInspector.DebuggerModel.BreakReason.DOM) {
            WebInspector.domBreakpointsSidebarPane.highlightBreakpoint(details.auxData);
            function didCreateBreakpointHitStatusMessage(element)
            {
                this.sidebarPanes.callstack.setStatus(element);
            }
            WebInspector.domBreakpointsSidebarPane.createBreakpointHitStatusMessage(details.auxData, didCreateBreakpointHitStatusMessage.bind(this));
        } else if (details.reason === WebInspector.DebuggerModel.BreakReason.EventListener) {
            var eventName = details.auxData.eventName;
            this.sidebarPanes.eventListenerBreakpoints.highlightBreakpoint(details.auxData.eventName);
            var eventNameForUI = WebInspector.EventListenerBreakpointsSidebarPane.eventNameForUI(eventName, details.auxData);
            this.sidebarPanes.callstack.setStatus(WebInspector.UIString("Paused on a \"%s\" Event Listener.", eventNameForUI));
        } else if (details.reason === WebInspector.DebuggerModel.BreakReason.XHR) {
            this.sidebarPanes.xhrBreakpoints.highlightBreakpoint(details.auxData["breakpointURL"]);
            this.sidebarPanes.callstack.setStatus(WebInspector.UIString("Paused on a XMLHttpRequest."));
        } else if (details.reason === WebInspector.DebuggerModel.BreakReason.Exception)
            this.sidebarPanes.callstack.setStatus(WebInspector.UIString("Paused on exception: '%s'.", details.auxData.description));
        else if (details.reason === WebInspector.DebuggerModel.BreakReason.Assert)
            this.sidebarPanes.callstack.setStatus(WebInspector.UIString("Paused on assertion."));
        else if (details.reason === WebInspector.DebuggerModel.BreakReason.CSPViolation)
            this.sidebarPanes.callstack.setStatus(WebInspector.UIString("Paused on a script blocked due to Content Security Policy directive: \"%s\".", details.auxData["directiveText"]));
        else if (details.reason === WebInspector.DebuggerModel.BreakReason.DebugCommand)
            this.sidebarPanes.callstack.setStatus(WebInspector.UIString("Paused on a debugged function"));
        else {
            function didGetUILocation(uiLocation)
            {
                var breakpoint = WebInspector.breakpointManager.findBreakpoint(uiLocation.uiSourceCode, uiLocation.lineNumber);
                if (!breakpoint)
                    return;
                this.sidebarPanes.jsBreakpoints.highlightBreakpoint(breakpoint);
                this.sidebarPanes.callstack.setStatus(WebInspector.UIString("Paused on a JavaScript breakpoint."));
            }
            if (details.callFrames.length) 
                details.callFrames[0].createLiveLocation(didGetUILocation.bind(this));
            else
                console.warn("ScriptsPanel paused, but callFrames.length is zero."); // TODO remove this once we understand this case better
        }

        this._enableDebuggerSidebar(true);
        this._toggleDebuggerSidebarButton.setEnabled(false);
        window.focus();
        InspectorFrontendHost.bringToFront();
    },

    _debuggerResumed: function()
    {
        this._paused = false;
        this._waitingToPause = false;
        this._stepping = false;

        this._clearInterface();
        this._toggleDebuggerSidebarButton.setEnabled(true);
    },

    _debuggerWasEnabled: function()
    {
        this._updateDebuggerButtons();
    },

    _debuggerWasDisabled: function()
    {
        this._debuggerReset();
    },

    _debuggerReset: function()
    {
        this._debuggerResumed();
        this.sidebarPanes.watchExpressions.reset();
        delete this._skipExecutionLineRevealing;
    },

    _projectWillReset: function(event)
    {
        var project = event.data;
        var uiSourceCodes = project.uiSourceCodes();
        this._removeUISourceCodes(uiSourceCodes);
        if (project.type() === WebInspector.projectTypes.Network)
            this._editorContainer.reset();
    },

    get visibleView()
    {
        return this._editorContainer.visibleView;
    },

    _updateScriptViewStatusBarItems: function()
    {
        this._scriptViewStatusBarItemsContainer.removeChildren();
        this._scriptViewStatusBarTextContainer.removeChildren();

        var sourceFrame = this.visibleView;
        if (sourceFrame) {
            var statusBarItems = sourceFrame.statusBarItems() || [];
            for (var i = 0; i < statusBarItems.length; ++i)
                this._scriptViewStatusBarItemsContainer.appendChild(statusBarItems[i]);
            var statusBarText = sourceFrame.statusBarText();
            if (statusBarText)
                this._scriptViewStatusBarTextContainer.appendChild(statusBarText);
        }
    },

    /**
     * @param {Element} anchor
     */
    canShowAnchorLocation: function(anchor)
    {
        if (WebInspector.debuggerModel.debuggerEnabled() && anchor.uiSourceCode)
            return true;
        var uiSourceCode = WebInspector.workspace.uiSourceCodeForURL(anchor.href);
        if (uiSourceCode) {
            anchor.uiSourceCode = uiSourceCode;
            return true;
        }
        return false;
    },

    /**
     * @param {Element} anchor
     */
    showAnchorLocation: function(anchor)
    {
        this._showSourceLocation(anchor.uiSourceCode, anchor.lineNumber, anchor.columnNumber);
    },

    /**
     * @param {WebInspector.UISourceCode} uiSourceCode
     * @param {number=} lineNumber
     * @param {number=} columnNumber
     */
    showUISourceCode: function(uiSourceCode, lineNumber, columnNumber)
    {
        this._showSourceLocation(uiSourceCode, lineNumber, columnNumber);
    },

    /**
     * @return {?WebInspector.UISourceCode}
     */
    currentUISourceCode: function()
    {
        return this._currentUISourceCode;
    },

    /**
     * @param {WebInspector.UILocation} uiLocation
     */
    showUILocation: function(uiLocation)
    {
        this._showSourceLocation(uiLocation.uiSourceCode, uiLocation.lineNumber, uiLocation.columnNumber);
    },

    /**
     * @param {WebInspector.UISourceCode} uiSourceCode
     * @param {number=} lineNumber
     * @param {number=} columnNumber
     */
    _showSourceLocation: function(uiSourceCode, lineNumber, columnNumber)
    {
        var sourceFrame = this._showFile(uiSourceCode);
        if (typeof lineNumber === "number")
            sourceFrame.highlightPosition(lineNumber, columnNumber);
        sourceFrame.focus();

        WebInspector.notifications.dispatchEventToListeners(WebInspector.UserMetrics.UserAction, {
            action: WebInspector.UserMetrics.UserActionNames.OpenSourceLink,
            url: uiSourceCode.originURL(),
            lineNumber: lineNumber
        });
    },

    /**
     * @param {WebInspector.UISourceCode} uiSourceCode
     * @return {WebInspector.SourceFrame}
     */
    _showFile: function(uiSourceCode)
    {
        var sourceFrame = this._getOrCreateSourceFrame(uiSourceCode);
        if (this._currentUISourceCode === uiSourceCode)
            return sourceFrame;
        this._currentUISourceCode = uiSourceCode;
        if (!uiSourceCode.project().isServiceProject())
            this._navigator.revealUISourceCode(uiSourceCode, true);
        this._editorContainer.showFile(uiSourceCode);
        this._updateScriptViewStatusBarItems();

        if (this._currentUISourceCode.project().type() === WebInspector.projectTypes.Snippets)
            this._runSnippetButton.element.removeStyleClass("hidden");
        else
            this._runSnippetButton.element.addStyleClass("hidden");

        return sourceFrame;
    },

    /**
     * @param {WebInspector.UISourceCode} uiSourceCode
     * @return {WebInspector.SourceFrame}
     */
    _createSourceFrame: function(uiSourceCode)
    {
        var sourceFrame;
        switch (uiSourceCode.contentType()) {
        case WebInspector.resourceTypes.Script:
            sourceFrame = new WebInspector.JavaScriptSourceFrame(this, uiSourceCode);
            break;
        case WebInspector.resourceTypes.Document:
            sourceFrame = new WebInspector.JavaScriptSourceFrame(this, uiSourceCode);
            break;
        case WebInspector.resourceTypes.Stylesheet:
        default:
            sourceFrame = new WebInspector.UISourceCodeFrame(uiSourceCode);
        break;
        }
        this._sourceFramesByUISourceCode.put(uiSourceCode, sourceFrame);
        return sourceFrame;
    },

    /**
     * @param {WebInspector.UISourceCode} uiSourceCode
     * @return {WebInspector.SourceFrame}
     */
    _getOrCreateSourceFrame: function(uiSourceCode)
    {
        return this._sourceFramesByUISourceCode.get(uiSourceCode) || this._createSourceFrame(uiSourceCode);
    },

    /**
     * @param {WebInspector.UISourceCode} uiSourceCode
     * @return {WebInspector.SourceFrame}
     */
    viewForFile: function(uiSourceCode)
    {
        return this._getOrCreateSourceFrame(uiSourceCode);
    },

    /**
     * @param {WebInspector.UISourceCode} uiSourceCode
     */
    _removeSourceFrame: function(uiSourceCode)
    {
        var sourceFrame = this._sourceFramesByUISourceCode.get(uiSourceCode);
        if (!sourceFrame)
            return;
        this._sourceFramesByUISourceCode.remove(uiSourceCode);
        sourceFrame.dispose();
    },

    _clearCurrentExecutionLine: function()
    {
        if (this._executionSourceFrame)
            this._executionSourceFrame.clearExecutionLine();
        delete this._executionSourceFrame;
    },

    _setExecutionLine: function(uiLocation)
    {
        var callFrame = WebInspector.debuggerModel.selectedCallFrame()
        var sourceFrame = this._getOrCreateSourceFrame(uiLocation.uiSourceCode);
        sourceFrame.setExecutionLine(uiLocation.lineNumber, callFrame);
        this._executionSourceFrame = sourceFrame;
    },

    _executionLineChanged: function(uiLocation)
    {
        this._clearCurrentExecutionLine();
        this._setExecutionLine(uiLocation);

        var uiSourceCode = uiLocation.uiSourceCode;
        var scriptFile = this._currentUISourceCode ? this._currentUISourceCode.scriptFile() : null;
        if (this._skipExecutionLineRevealing)
            return;
        this._skipExecutionLineRevealing = true;
        var sourceFrame = this._showFile(uiSourceCode);
        sourceFrame.revealLine(uiLocation.lineNumber);
        if (sourceFrame.canEditSource())
            sourceFrame.setSelection(WebInspector.TextRange.createFromLocation(uiLocation.lineNumber, 0));
        sourceFrame.focus();
    },

    _callFrameSelected: function(event)
    {
        var callFrame = event.data;

        if (!callFrame)
            return;

        this.sidebarPanes.scopechain.update(callFrame);
        this.sidebarPanes.watchExpressions.refreshExpressions();
        this.sidebarPanes.callstack.setSelectedCallFrame(callFrame);
        callFrame.createLiveLocation(this._executionLineChanged.bind(this));
    },

    _editorClosed: function(event)
    {
        this._navigatorController.hideNavigatorOverlay();
        var uiSourceCode = /** @type {WebInspector.UISourceCode} */ (event.data);

        if (this._currentUISourceCode === uiSourceCode)
            delete this._currentUISourceCode;

        // ScriptsNavigator does not need to update on EditorClosed.
        this._updateScriptViewStatusBarItems();
        WebInspector.searchController.resetSearch();
    },

    _editorSelected: function(event)
    {
        var uiSourceCode = /** @type {WebInspector.UISourceCode} */ (event.data);
        var sourceFrame = this._showFile(uiSourceCode);
        this._navigatorController.hideNavigatorOverlay();
        if (!this._navigatorController.isNavigatorPinned())
            sourceFrame.focus();
        WebInspector.searchController.resetSearch();
    },

    _scriptSelected: function(event)
    {
        var uiSourceCode = /** @type {WebInspector.UISourceCode} */ (event.data.uiSourceCode);
        var sourceFrame = this._showFile(uiSourceCode);
        this._navigatorController.hideNavigatorOverlay();
        if (sourceFrame && (!this._navigatorController.isNavigatorPinned() || event.data.focusSource))
            sourceFrame.focus();
    },

    _itemSearchStarted: function(event)
    {
        var searchText = /** @type {string} */ (event.data);
        WebInspector.OpenResourceDialog.show(this, this.editorView.mainElement, searchText);
    },

    _pauseOnExceptionStateChanged: function()
    {
        var pauseOnExceptionsState = WebInspector.settings.pauseOnExceptionStateString.get();
        switch (pauseOnExceptionsState) {
        case WebInspector.DebuggerModel.PauseOnExceptionsState.DontPauseOnExceptions:
            this._pauseOnExceptionButton.title = WebInspector.UIString("Don't pause on exceptions.\nClick to Pause on all exceptions.");
            break;
        case WebInspector.DebuggerModel.PauseOnExceptionsState.PauseOnAllExceptions:
            this._pauseOnExceptionButton.title = WebInspector.UIString("Pause on all exceptions.\nClick to Pause on uncaught exceptions.");
            break;
        case WebInspector.DebuggerModel.PauseOnExceptionsState.PauseOnUncaughtExceptions:
            this._pauseOnExceptionButton.title = WebInspector.UIString("Pause on uncaught exceptions.\nClick to Not pause on exceptions.");
            break;
        }
        this._pauseOnExceptionButton.state = pauseOnExceptionsState;
    },

    _updateDebuggerButtons: function()
    {
        if (WebInspector.debuggerModel.debuggerEnabled()) {
            this._pauseOnExceptionButton.visible = true;
        } else {
            this._pauseOnExceptionButton.visible = false;
        }

        if (this._paused) {
            this._updateButtonTitle(this._pauseButton, WebInspector.UIString("Resume script execution (%s)."))
            this._pauseButton.state = true;
            this._pauseButton.setLongClickOptionsEnabled((function() { return [ this._longResumeButton ] }).bind(this));

            this._pauseButton.setEnabled(true);
            this._stepOverButton.setEnabled(true);
            this._stepIntoButton.setEnabled(true);
            this._stepOutButton.setEnabled(true);

            this.debuggerStatusElement.textContent = WebInspector.UIString("Paused");
        } else {
            this._updateButtonTitle(this._pauseButton, WebInspector.UIString("Pause script execution (%s)."))
            this._pauseButton.state = false;
            this._pauseButton.setLongClickOptionsEnabled(null);

            this._pauseButton.setEnabled(!this._waitingToPause);
            this._stepOverButton.setEnabled(false);
            this._stepIntoButton.setEnabled(false);
            this._stepOutButton.setEnabled(false);

            if (this._waitingToPause)
                this.debuggerStatusElement.textContent = WebInspector.UIString("Pausing");
            else if (this._stepping)
                this.debuggerStatusElement.textContent = WebInspector.UIString("Stepping");
            else
                this.debuggerStatusElement.textContent = "";
        }
    },

    _clearInterface: function()
    {
        this.sidebarPanes.callstack.update(null);
        this.sidebarPanes.scopechain.update(null);
        this.sidebarPanes.jsBreakpoints.clearBreakpointHighlight();
        WebInspector.domBreakpointsSidebarPane.clearBreakpointHighlight();
        this.sidebarPanes.eventListenerBreakpoints.clearBreakpointHighlight();
        this.sidebarPanes.xhrBreakpoints.clearBreakpointHighlight();

        this._clearCurrentExecutionLine();
        this._updateDebuggerButtons();
    },

    _togglePauseOnExceptions: function()
    {
        var nextStateMap = {};
        var stateEnum = WebInspector.DebuggerModel.PauseOnExceptionsState;
        nextStateMap[stateEnum.DontPauseOnExceptions] = stateEnum.PauseOnAllExceptions;
        nextStateMap[stateEnum.PauseOnAllExceptions] = stateEnum.PauseOnUncaughtExceptions;
        nextStateMap[stateEnum.PauseOnUncaughtExceptions] = stateEnum.DontPauseOnExceptions;
        WebInspector.settings.pauseOnExceptionStateString.set(nextStateMap[this._pauseOnExceptionButton.state]);
    },

    /**
     * @param {Event=} event
     * @return {boolean}
     */
    _runSnippet: function(event)
    {
        if (this._currentUISourceCode.project().type() !== WebInspector.projectTypes.Snippets)
            return false;
        WebInspector.scriptSnippetModel.evaluateScriptSnippet(this._currentUISourceCode);
        return true;
    },

    /**
     * @param {Event=} event
     * @return {boolean}
     */
    _togglePause: function(event)
    {
        if (this._paused) {
            delete this._skipExecutionLineRevealing;
            this._paused = false;
            this._waitingToPause = false;
            DebuggerAgent.resume();
        } else {
            this._stepping = false;
            this._waitingToPause = true;
            // Make sure pauses didn't stick skipped.
            DebuggerAgent.setSkipAllPauses(false);
            DebuggerAgent.pause();
        }

        this._clearInterface();
        return true;
    },

    /**
     * @param {WebInspector.Event=} event
     * @return {boolean}
     */
    _longResume: function(event)
    {
        if (!this._paused)
            return true;

        this._paused = false;
        this._waitingToPause = false;
        DebuggerAgent.setSkipAllPauses(true, true);
        setTimeout(DebuggerAgent.setSkipAllPauses.bind(DebuggerAgent, false), 500);
        DebuggerAgent.resume();

        this._clearInterface();
        return true;
    },

    /**
     * @param {Event=} event
     * @return {boolean}
     */
    _stepOverClicked: function(event)
    {
        if (!this._paused)
            return true;

        delete this._skipExecutionLineRevealing;
        this._paused = false;
        this._stepping = true;

        this._clearInterface();

        DebuggerAgent.stepOver();
        return true;
    },

    /**
     * @param {Event=} event
     * @return {boolean}
     */
    _stepIntoClicked: function(event)
    {
        if (!this._paused)
            return true;

        delete this._skipExecutionLineRevealing;
        this._paused = false;
        this._stepping = true;

        this._clearInterface();

        DebuggerAgent.stepInto();
        return true;
    },

    /**
     * @param {Event=} event
     * @return {boolean}
     */
    _stepIntoSelectionClicked: function(event)
    {
        if (!this._paused)
            return true;

        if (this._executionSourceFrame) {
            var stepIntoMarkup = this._executionSourceFrame.stepIntoMarkup();
            if (stepIntoMarkup)
                stepIntoMarkup.iterateSelection(event.shiftKey);
        }
        return true;
    },

    doStepIntoSelection: function(rawLocation)
    {
        if (!this._paused)
            return;

        delete this._skipExecutionLineRevealing;
        this._paused = false;
        this._stepping = true;
        this._clearInterface();
        WebInspector.debuggerModel.stepIntoSelection(rawLocation);
    },

    /**
     * @param {Event=} event
     * @return {boolean}
     */
    _stepOutClicked: function(event)
    {
        if (!this._paused)
            return true;

        delete this._skipExecutionLineRevealing;
        this._paused = false;
        this._stepping = true;

        this._clearInterface();

        DebuggerAgent.stepOut();
        return true;
    },

    /**
     * @param {WebInspector.Event} event
     */
    _callFrameSelectedInSidebar: function(event)
    {
        var callFrame = /** @type {WebInspector.DebuggerModel.CallFrame} */ (event.data);
        delete this._skipExecutionLineRevealing;
        WebInspector.debuggerModel.setSelectedCallFrame(callFrame);
    },

    continueToLocation: function(rawLocation)
    {
        if (!this._paused)
            return;

        delete this._skipExecutionLineRevealing;
        this._paused = false;
        this._stepping = true;
        this._clearInterface();
        WebInspector.debuggerModel.continueToLocation(rawLocation);
    },

    _toggleBreakpointsClicked: function(event)
    {
        WebInspector.debuggerModel.setBreakpointsActive(!WebInspector.debuggerModel.breakpointsActive());
    },

    _breakpointsActiveStateChanged: function(event)
    {
        var active = event.data;
        this._toggleBreakpointsButton.toggled = !active;
        if (active) {
            this._toggleBreakpointsButton.title = WebInspector.UIString("Deactivate breakpoints.");
            WebInspector.inspectorView.element.removeStyleClass("breakpoints-deactivated");
            this.sidebarPanes.jsBreakpoints.listElement.removeStyleClass("breakpoints-list-deactivated");
        } else {
            this._toggleBreakpointsButton.title = WebInspector.UIString("Activate breakpoints.");
            WebInspector.inspectorView.element.addStyleClass("breakpoints-deactivated");
            this.sidebarPanes.jsBreakpoints.listElement.addStyleClass("breakpoints-list-deactivated");
        }
    },

    _createDebugToolbar: function()
    {
        var debugToolbar = document.createElement("div");
        debugToolbar.className = "status-bar";
        debugToolbar.id = "scripts-debug-toolbar";

        var title, handler;
        var platformSpecificModifier = WebInspector.KeyboardShortcut.Modifiers.CtrlOrMeta;

        // Run snippet.
        title = WebInspector.UIString("Run snippet (%s).");
        handler = this._runSnippet.bind(this);
        this._runSnippetButton = this._createButtonAndRegisterShortcuts("scripts-run-snippet", title, handler, WebInspector.ScriptsPanelDescriptor.ShortcutKeys.RunSnippet);
        debugToolbar.appendChild(this._runSnippetButton.element);
        this._runSnippetButton.element.addStyleClass("hidden");

        // Continue.
        handler = this._togglePause.bind(this);
        this._pauseButton = this._createButtonAndRegisterShortcuts("scripts-pause", "", handler, WebInspector.ScriptsPanelDescriptor.ShortcutKeys.PauseContinue);
        debugToolbar.appendChild(this._pauseButton.element);

        // Long resume.
        title = WebInspector.UIString("Resume with all pauses blocked for 500 ms");
        this._longResumeButton = new WebInspector.StatusBarButton(title, "scripts-long-resume");
        this._longResumeButton.addEventListener("click", this._longResume.bind(this), this);

        // Step over.
        title = WebInspector.UIString("Step over next function call (%s).");
        handler = this._stepOverClicked.bind(this);
        this._stepOverButton = this._createButtonAndRegisterShortcuts("scripts-step-over", title, handler, WebInspector.ScriptsPanelDescriptor.ShortcutKeys.StepOver);
        debugToolbar.appendChild(this._stepOverButton.element);

        // Step into.
        title = WebInspector.UIString("Step into next function call (%s).");
        handler = this._stepIntoClicked.bind(this);
        this._stepIntoButton = this._createButtonAndRegisterShortcuts("scripts-step-into", title, handler, WebInspector.ScriptsPanelDescriptor.ShortcutKeys.StepInto);
        debugToolbar.appendChild(this._stepIntoButton.element);

        // Step into selection (keyboard shortcut only).
        this.registerShortcuts(WebInspector.ScriptsPanelDescriptor.ShortcutKeys.StepIntoSelection, this._stepIntoSelectionClicked.bind(this))

        // Step out.
        title = WebInspector.UIString("Step out of current function (%s).");
        handler = this._stepOutClicked.bind(this);
        this._stepOutButton = this._createButtonAndRegisterShortcuts("scripts-step-out", title, handler, WebInspector.ScriptsPanelDescriptor.ShortcutKeys.StepOut);
        debugToolbar.appendChild(this._stepOutButton.element);

        this._toggleBreakpointsButton = new WebInspector.StatusBarButton(WebInspector.UIString("Deactivate breakpoints."), "scripts-toggle-breakpoints");
        this._toggleBreakpointsButton.toggled = false;
        this._toggleBreakpointsButton.addEventListener("click", this._toggleBreakpointsClicked, this);
        debugToolbar.appendChild(this._toggleBreakpointsButton.element);

        this.debuggerStatusElement = document.createElement("div");
        this.debuggerStatusElement.id = "scripts-debugger-status";
        debugToolbar.appendChild(this.debuggerStatusElement);

        return debugToolbar;
    },

    /**
     * @param {WebInspector.StatusBarButton} button
     * @param {string} buttonTitle
     */
    _updateButtonTitle: function(button, buttonTitle)
    {
        var hasShortcuts = button.shortcuts && button.shortcuts.length;
        if (hasShortcuts)
            button.title = String.vsprintf(buttonTitle, [button.shortcuts[0].name]);
        else
            button.title = buttonTitle;
    },

    /**
     * @param {string} buttonId
     * @param {string} buttonTitle
     * @param {function(Event=):boolean} handler
     * @param {!Array.<!WebInspector.KeyboardShortcut.Descriptor>} shortcuts
     * @return {WebInspector.StatusBarButton}
     */
    _createButtonAndRegisterShortcuts: function(buttonId, buttonTitle, handler, shortcuts)
    {
        var button = new WebInspector.StatusBarButton(buttonTitle, buttonId);
        button.element.addEventListener("click", handler, false);
        button.shortcuts = shortcuts;
        this._updateButtonTitle(button, buttonTitle);
        this.registerShortcuts(shortcuts, handler);
        return button;
    },

    searchCanceled: function()
    {
        if (this._searchView)
            this._searchView.searchCanceled();

        delete this._searchView;
        delete this._searchQuery;
    },

    /**
     * @param {string} query
     * @param {boolean} shouldJump
     */
    performSearch: function(query, shouldJump)
    {
        WebInspector.searchController.updateSearchMatchesCount(0, this);

        if (!this.visibleView)
            return;

        this._searchView = this.visibleView;
        this._searchQuery = query;

        function finishedCallback(view, searchMatches)
        {
            if (!searchMatches)
                return;

            WebInspector.searchController.updateSearchMatchesCount(searchMatches, this);
        }

        function currentMatchChanged(currentMatchIndex)
        {
            WebInspector.searchController.updateCurrentMatchIndex(currentMatchIndex, this);
        }

        this._searchView.performSearch(query, shouldJump, finishedCallback.bind(this), currentMatchChanged.bind(this));
    },

    /**
     * @return {number}
     */
    minimalSearchQuerySize: function()
    {
        return 0;
    },

    jumpToNextSearchResult: function()
    {
        if (!this._searchView)
            return;

        if (this._searchView !== this.visibleView) {
            this.performSearch(this._searchQuery, true);
            return;
        }

        this._searchView.jumpToNextSearchResult();
        return true;
    },

    jumpToPreviousSearchResult: function()
    {
        if (!this._searchView)
            return;

        if (this._searchView !== this.visibleView) {
            this.performSearch(this._searchQuery, true);
            if (this._searchView)
                this._searchView.jumpToLastSearchResult();
            return;
        }

        this._searchView.jumpToPreviousSearchResult();
    },

    /**
     * @return {boolean}
     */
    canSearchAndReplace: function()
    {
        var view = /** @type {WebInspector.SourceFrame} */ (this.visibleView);
        return !!view && view.canEditSource();
    },

    /**
     * @param {string} text
     */
    replaceSelectionWith: function(text)
    {
        var view = /** @type {WebInspector.SourceFrame} */ (this.visibleView);
        view.replaceSearchMatchWith(text);
    },

    /**
     * @param {string} query
     * @param {string} text
     */
    replaceAllWith: function(query, text)
    {
        var view = /** @type {WebInspector.SourceFrame} */ (this.visibleView);
        view.replaceAllWith(query, text);
    },

    _onKeyDown: function(event)
    {
        if (event.keyCode !== WebInspector.KeyboardShortcut.Keys.CtrlOrMeta.code)
            return;
        if (!this._paused || !this._executionSourceFrame)
            return;
        var stepIntoMarkup = this._executionSourceFrame.stepIntoMarkup();
        if (stepIntoMarkup)
            stepIntoMarkup.startIteratingSelection();
    },

    _onKeyUp: function(event)
    {
        if (event.keyCode !== WebInspector.KeyboardShortcut.Keys.CtrlOrMeta.code)
            return;
        if (!this._paused || !this._executionSourceFrame)
            return;
        var stepIntoMarkup = this._executionSourceFrame.stepIntoMarkup();
        if (!stepIntoMarkup)
            return;
        var currentPosition = stepIntoMarkup.getSelectedItemIndex();
        if (typeof currentPosition === "undefined") {
            stepIntoMarkup.stopIteratingSelection();
        } else {
            var rawLocation = stepIntoMarkup.getRawPosition(currentPosition);
            this.doStepIntoSelection(rawLocation);
        }
    },

    _toggleFormatSource: function()
    {
        delete this._skipExecutionLineRevealing;
        this._toggleFormatSourceButton.toggled = !this._toggleFormatSourceButton.toggled;
        var uiSourceCodes = this._workspace.uiSourceCodes();
        for (var i = 0; i < uiSourceCodes.length; ++i)
            uiSourceCodes[i].setFormatted(this._toggleFormatSourceButton.toggled);

        var currentFile = this._editorContainer.currentFile();

        WebInspector.notifications.dispatchEventToListeners(WebInspector.UserMetrics.UserAction, {
            action: WebInspector.UserMetrics.UserActionNames.TogglePrettyPrint,
            enabled: this._toggleFormatSourceButton.toggled,
            url: currentFile ? currentFile.originURL() : null
        });
    },

    addToWatch: function(expression)
    {
        this.sidebarPanes.watchExpressions.addExpression(expression);
    },

    /**
     * @return {boolean}
     */
    _toggleBreakpoint: function()
    {
        var sourceFrame = this.visibleView;
        if (!sourceFrame)
            return false;

        if (sourceFrame instanceof WebInspector.JavaScriptSourceFrame) {
            var javaScriptSourceFrame = /** @type {WebInspector.JavaScriptSourceFrame} */ (sourceFrame);
            javaScriptSourceFrame.toggleBreakpointOnCurrentLine();
            return true;
        }
        return false;
    },

    /**
     * @param {Event=} event
     * @return {boolean}
     */
    _showOutlineDialog: function(event)
    {
        var uiSourceCode = this._editorContainer.currentFile();
        if (!uiSourceCode)
            return false;

        switch (uiSourceCode.contentType()) {
        case WebInspector.resourceTypes.Document:
        case WebInspector.resourceTypes.Script:
            WebInspector.JavaScriptOutlineDialog.show(this.visibleView, uiSourceCode);
            return true;
        case WebInspector.resourceTypes.Stylesheet:
            WebInspector.StyleSheetOutlineDialog.show(this.visibleView, uiSourceCode);
            return true;
        }
        return false;
    },

    _installDebuggerSidebarController: function()
    {
        this._toggleDebuggerSidebarButton = new WebInspector.StatusBarButton("", "right-sidebar-show-hide-button scripts-debugger-show-hide-button", 3);
        this._toggleDebuggerSidebarButton.addEventListener("click", clickHandler, this);
        this.editorView.element.appendChild(this._toggleDebuggerSidebarButton.element);
        this._enableDebuggerSidebar(!WebInspector.settings.debuggerSidebarHidden.get());

        function clickHandler()
        {
            this._enableDebuggerSidebar(this._toggleDebuggerSidebarButton.state === "left");
        }
    },

    /**
     * @param {boolean} show
     */
    _enableDebuggerSidebar: function(show)
    {
        this._toggleDebuggerSidebarButton.state = show ? "right" : "left";
        this._toggleDebuggerSidebarButton.title = show ? WebInspector.UIString("Hide debugger") : WebInspector.UIString("Show debugger");
        if (show)
            this.splitView.showSidebarElement();
        else
            this.splitView.hideSidebarElement();
        this._debugSidebarResizeWidgetElement.enableStyleClass("hidden", !show);
        WebInspector.settings.debuggerSidebarHidden.set(!show);
    },

    /**
     * @param {WebInspector.Event} event
     */
    _itemCreationRequested: function(event)
    {
        var project = event.data.project;
        var path = event.data.path;
        var filePath;
        var shouldHideNavigator;
        var uiSourceCode;
        project.createFile(path, null, fileCreated.bind(this));
        
        /**
         * @param {?string} path
         */
        function fileCreated(path)
        {
            if (!path)
                return;
            filePath = path;
            uiSourceCode = project.uiSourceCode(filePath);
            this._showSourceLocation(uiSourceCode);

            shouldHideNavigator = !this._navigatorController.isNavigatorPinned();
            if (this._navigatorController.isNavigatorHidden())
                this._navigatorController.showNavigatorOverlay();
            this._navigator.rename(uiSourceCode, callback.bind(this));
        }
    
        /**
         * @param {boolean} committed
         */
        function callback(committed)
        {
            if (shouldHideNavigator)
                this._navigatorController.hideNavigatorOverlay();

            if (!committed) {
                project.deleteFile(uiSourceCode);
                return;
            }

            this._showSourceLocation(uiSourceCode);
        }
    },

    /**
     * @param {WebInspector.Event} event
     */
    _itemRenamingRequested: function(event)
    {
        var uiSourceCode = /** @type {WebInspector.UISourceCode} */ (event.data);
        
        var shouldHideNavigator = !this._navigatorController.isNavigatorPinned();
        if (this._navigatorController.isNavigatorHidden())
            this._navigatorController.showNavigatorOverlay();
        this._navigator.rename(uiSourceCode, callback.bind(this));
    
        /**
         * @param {boolean} committed
         */
        function callback(committed)
        {
            if (shouldHideNavigator && committed) {
                this._navigatorController.hideNavigatorOverlay();
                this._showSourceLocation(uiSourceCode);
            }
        }
    },

    /**
     * @param {WebInspector.UISourceCode} uiSourceCode
     */
    _showLocalHistory: function(uiSourceCode)
    {
        WebInspector.RevisionHistoryView.showHistory(uiSourceCode);
    },

    /**
     * @param {WebInspector.ContextMenu} contextMenu
     * @param {Object} target
     */
    appendApplicableItems: function(event, contextMenu, target)
    {
        this._appendUISourceCodeItems(contextMenu, target);
        this._appendFunctionItems(contextMenu, target);
    },

    /** 
     * @param {WebInspector.UISourceCode} uiSourceCode
     */
    _mapFileSystemToNetwork: function(uiSourceCode)
    {
        WebInspector.SelectUISourceCodeForProjectTypeDialog.show(uiSourceCode.name(), WebInspector.projectTypes.Network, mapFileSystemToNetwork.bind(this), this.editorView.mainElement)                

        /** 
         * @param {WebInspector.UISourceCode} networkUISourceCode
         */
        function mapFileSystemToNetwork(networkUISourceCode)
        {
            this._workspace.addMapping(networkUISourceCode, uiSourceCode, WebInspector.fileSystemWorkspaceProvider);
        }
    },

    /** 
     * @param {WebInspector.UISourceCode} uiSourceCode
     */
    _removeNetworkMapping: function(uiSourceCode)
    {
        if (confirm(WebInspector.UIString("Are you sure you want to remove network mapping?")))
            this._workspace.removeMapping(uiSourceCode);
    },

    /** 
     * @param {WebInspector.UISourceCode} networkUISourceCode
     */
    _mapNetworkToFileSystem: function(networkUISourceCode)
    {
        WebInspector.SelectUISourceCodeForProjectTypeDialog.show(networkUISourceCode.name(), WebInspector.projectTypes.FileSystem, mapNetworkToFileSystem.bind(this), this.editorView.mainElement)                

        /** 
         * @param {WebInspector.UISourceCode} uiSourceCode
         */
        function mapNetworkToFileSystem(uiSourceCode)
        {
            this._workspace.addMapping(networkUISourceCode, uiSourceCode, WebInspector.fileSystemWorkspaceProvider);
        }
    },

    /** 
     * @param {WebInspector.ContextMenu} contextMenu
     * @param {WebInspector.UISourceCode} uiSourceCode
     */
    _appendUISourceCodeMappingItems: function(contextMenu, uiSourceCode)
    {
        if (uiSourceCode.project().type() === WebInspector.projectTypes.FileSystem) {
            var hasMappings = !!uiSourceCode.url;
            if (!hasMappings)
                contextMenu.appendItem(WebInspector.UIString(WebInspector.useLowerCaseMenuTitles() ? "Map to network resource\u2026" : "Map to Network Resource\u2026"), this._mapFileSystemToNetwork.bind(this, uiSourceCode));
            else
                contextMenu.appendItem(WebInspector.UIString(WebInspector.useLowerCaseMenuTitles() ? "Remove network mapping" : "Remove Network Mapping"), this._removeNetworkMapping.bind(this, uiSourceCode));
        }

        if (uiSourceCode.project().type() === WebInspector.projectTypes.Network) {
            /** 
             * @param {WebInspector.Project} project
             */
            function filterProject(project)
            {
                return project.type() === WebInspector.projectTypes.FileSystem;
            }

            if (!this._workspace.projects().filter(filterProject).length)
                return;
            if (this._workspace.uiSourceCodeForURL(uiSourceCode.url) === uiSourceCode)
                contextMenu.appendItem(WebInspector.UIString(WebInspector.useLowerCaseMenuTitles() ? "Map to file system resource\u2026" : "Map to File System Resource\u2026"), this._mapNetworkToFileSystem.bind(this, uiSourceCode));
        }
    },

    /** 
     * @param {WebInspector.ContextMenu} contextMenu
     * @param {Object} target
     */
    _appendUISourceCodeItems: function(contextMenu, target)
    {
        if (!(target instanceof WebInspector.UISourceCode))
            return;

        var uiSourceCode = /** @type {WebInspector.UISourceCode} */ (target);
        contextMenu.appendItem(WebInspector.UIString(WebInspector.useLowerCaseMenuTitles() ? "Local modifications\u2026" : "Local Modifications\u2026"), this._showLocalHistory.bind(this, uiSourceCode));

        if (WebInspector.isolatedFileSystemManager.supportsFileSystems())
            this._appendUISourceCodeMappingItems(contextMenu, uiSourceCode);
    },

    /** 
     * @param {WebInspector.ContextMenu} contextMenu
     * @param {Object} target
     */
    _appendFunctionItems: function(contextMenu, target)
    {
        if (!(target instanceof WebInspector.RemoteObject))
            return;
        var remoteObject = /** @type {WebInspector.RemoteObject} */ (target);
        if (remoteObject.type !== "function")
            return;

        function didGetDetails(error, response)
        {
            if (error) {
                console.error(error);
                return;
            }

            WebInspector.inspectorView.setCurrentPanel(this);
            var uiLocation = WebInspector.debuggerModel.rawLocationToUILocation(response.location);
            this._showSourceLocation(uiLocation.uiSourceCode, uiLocation.lineNumber, uiLocation.columnNumber);
        }

        function revealFunction()
        {
            DebuggerAgent.getFunctionDetails(remoteObject.objectId, didGetDetails.bind(this));
        }

        contextMenu.appendItem(WebInspector.UIString(WebInspector.useLowerCaseMenuTitles() ? "Show function definition" : "Show Function Definition"), revealFunction.bind(this));
    },

    showGoToSourceDialog: function()
    {
        var uiSourceCodes = this._editorContainer.historyUISourceCodes();
        /** @type {!Map.<WebInspector.UISourceCode, number>} */
        var defaultScores = new Map();
        for (var i = 1; i < uiSourceCodes.length; ++i) // Skip current element
            defaultScores.put(uiSourceCodes[i], uiSourceCodes.length - i);
        WebInspector.OpenResourceDialog.show(this, this.editorView.mainElement, undefined, defaultScores);
    },

    _dockSideChanged: function()
    {
        var dockSide = WebInspector.dockController.dockSide();
        var vertically = dockSide === WebInspector.DockController.State.DockedToRight && WebInspector.settings.splitVerticallyWhenDockedToRight.get();
        this._splitVertically(vertically);
    },

    /**
     * @param {boolean} vertically
     */
    _splitVertically: function(vertically)
    {
        if (this.sidebarPaneView && vertically === !this.splitView.isVertical())
            return;

        if (this.sidebarPaneView)
            this.sidebarPaneView.detach();

        this.splitView.setVertical(!vertically);

        if (!vertically) {
            this.sidebarPaneView = new WebInspector.SidebarPaneStack();
            for (var pane in this.sidebarPanes)
                this.sidebarPaneView.addPane(this.sidebarPanes[pane]);

            this.sidebarElement.appendChild(this.debugToolbar);
        } else {
            this._enableDebuggerSidebar(true);

            this.sidebarPaneView = new WebInspector.SplitView(true, this.name + "PanelSplitSidebarRatio", 0.5);

            var group1 = new WebInspector.SidebarPaneStack();
            group1.show(this.sidebarPaneView.firstElement());
            group1.element.id = "scripts-sidebar-stack-pane";
            group1.addPane(this.sidebarPanes.callstack);
            group1.addPane(this.sidebarPanes.jsBreakpoints);
            group1.addPane(this.sidebarPanes.domBreakpoints);
            group1.addPane(this.sidebarPanes.xhrBreakpoints);
            group1.addPane(this.sidebarPanes.eventListenerBreakpoints);
            if (this.sidebarPanes.workerList)
                group1.addPane(this.sidebarPanes.workerList);

            var group2 = new WebInspector.SidebarTabbedPane();
            group2.show(this.sidebarPaneView.secondElement());
            group2.addPane(this.sidebarPanes.scopechain);
            group2.addPane(this.sidebarPanes.watchExpressions);

            this.sidebarPaneView.firstElement().appendChild(this.debugToolbar);
        }

        this.sidebarPaneView.element.id = "scripts-debug-sidebar-contents";
        this.sidebarPaneView.show(this.splitView.sidebarElement);

        this.sidebarPanes.scopechain.expand();
        this.sidebarPanes.jsBreakpoints.expand();
        this.sidebarPanes.callstack.expand();

        if (WebInspector.settings.watchExpressions.get().length > 0)
            this.sidebarPanes.watchExpressions.expand();
    },

    /**
     * @return {boolean}
     */
    canSetFooterElement: function()
    {
        return true;
    },

    /**
     * @param {Element?} element
     */
    setFooterElement: function(element)
    {
        if (element) {
            this._editorFooterElement.removeStyleClass("hidden");
            this._editorFooterElement.appendChild(element);
            this._editorContentsElement.style.bottom = this._editorFooterElement.offsetHeight + "px";
        } else {
            this._editorFooterElement.addStyleClass("hidden");
            this._editorFooterElement.removeChildren();
            this._editorContentsElement.style.bottom = 0;
        }
        this.doResize();
    },

    __proto__: WebInspector.Panel.prototype
}
