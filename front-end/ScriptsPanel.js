/*
 * Copyright (C) 2008 Apple Inc. All Rights Reserved.
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

WebInspector.ScriptsPanel = function()
{
    WebInspector.Panel.call(this, "scripts");

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

    this.filesSelectElement = document.createElement("select");
    this.filesSelectElement.className = "status-bar-item";
    this.filesSelectElement.id = "scripts-files";
    this.filesSelectElement.addEventListener("change", this._changeVisibleFile.bind(this), false);
    this.topStatusBar.appendChild(this.filesSelectElement);

    this.functionsSelectElement = document.createElement("select");
    this.functionsSelectElement.className = "status-bar-item";
    this.functionsSelectElement.id = "scripts-functions";

    // FIXME: append the functions select element to the top status bar when it is implemented.
    // this.topStatusBar.appendChild(this.functionsSelectElement);

    this.sidebarButtonsElement = document.createElement("div");
    this.sidebarButtonsElement.id = "scripts-sidebar-buttons";
    this.topStatusBar.appendChild(this.sidebarButtonsElement);

    this.pauseButton = document.createElement("button");
    this.pauseButton.className = "status-bar-item";
    this.pauseButton.id = "scripts-pause";
    this.pauseButton.title = WebInspector.UIString("Pause script execution.");
    this.pauseButton.disabled = true;
    this.pauseButton.appendChild(document.createElement("img"));
    this.pauseButton.addEventListener("click", this._togglePause.bind(this), false);
    this.sidebarButtonsElement.appendChild(this.pauseButton);

    this.stepOverButton = document.createElement("button");
    this.stepOverButton.className = "status-bar-item";
    this.stepOverButton.id = "scripts-step-over";
    this.stepOverButton.title = WebInspector.UIString("Step over next function call.");
    this.stepOverButton.disabled = true;
    this.stepOverButton.addEventListener("click", this._stepOverClicked.bind(this), false);
    this.stepOverButton.appendChild(document.createElement("img"));
    this.sidebarButtonsElement.appendChild(this.stepOverButton);

    this.stepIntoButton = document.createElement("button");
    this.stepIntoButton.className = "status-bar-item";
    this.stepIntoButton.id = "scripts-step-into";
    this.stepIntoButton.title = WebInspector.UIString("Step into next function call.");
    this.stepIntoButton.disabled = true;
    this.stepIntoButton.addEventListener("click", this._stepIntoClicked.bind(this), false);
    this.stepIntoButton.appendChild(document.createElement("img"));
    this.sidebarButtonsElement.appendChild(this.stepIntoButton);

    this.stepOutButton = document.createElement("button");
    this.stepOutButton.className = "status-bar-item";
    this.stepOutButton.id = "scripts-step-out";
    this.stepOutButton.title = WebInspector.UIString("Step out of current function.");
    this.stepOutButton.disabled = true;
    this.stepOutButton.addEventListener("click", this._stepOutClicked.bind(this), false);
    this.stepOutButton.appendChild(document.createElement("img"));
    this.sidebarButtonsElement.appendChild(this.stepOutButton);

    this.toggleBreakpointsButton = new WebInspector.StatusBarButton("", "toggle-breakpoints");
    this.toggleBreakpointsButton.addEventListener("click", this._toggleBreakpointsClicked.bind(this), false);
    this.sidebarButtonsElement.appendChild(this.toggleBreakpointsButton.element);
    // Breakpoints should be activated by default, so emulate a click to toggle on.
    this._toggleBreakpointsClicked();

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
    this.sidebarPanes.callstack = new WebInspector.CallStackSidebarPane();
    this.sidebarPanes.scopechain = new WebInspector.ScopeChainSidebarPane();
    this.sidebarPanes.breakpoints = new WebInspector.BreakpointsSidebarPane();
    this.sidebarPanes.workers = new WebInspector.WorkersSidebarPane();

    for (var pane in this.sidebarPanes)
        this.sidebarElement.appendChild(this.sidebarPanes[pane].element);

    this.sidebarPanes.callstack.expanded = true;
    this.sidebarPanes.callstack.addEventListener("call frame selected", this._callFrameSelected, this);

    this.sidebarPanes.scopechain.expanded = true;
    this.sidebarPanes.breakpoints.expanded = true;

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

    this._pauseOnExceptionButton = new WebInspector.StatusBarButton("", "scripts-pause-on-exceptions-status-bar-item", 3);
    this._pauseOnExceptionButton.addEventListener("click", this._togglePauseOnExceptions.bind(this), false);
    this._pauseOnExceptionButton.state = WebInspector.ScriptsPanel.PauseOnExceptionsState.DontPauseOnExceptions;
    this._pauseOnExceptionButton.title = WebInspector.UIString("Don't pause on exceptions.\nClick to Pause on all exceptions."); 

    this._registerShortcuts();

    this._debuggerEnabled = Preferences.debuggerAlwaysEnabled;

    WebInspector.breakpointManager.addEventListener("breakpoint-added", this._breakpointAdded, this);
    WebInspector.breakpointManager.addEventListener("breakpoint-removed", this._breakpointRemoved, this);

    this.reset();
}

// Keep these in sync with WebCore::ScriptDebugServer
WebInspector.ScriptsPanel.PauseOnExceptionsState = {
    DontPauseOnExceptions : 0,
    PauseOnAllExceptions : 1,
    PauseOnUncaughtExceptions: 2
};

WebInspector.ScriptsPanel.prototype = {
    get toolbarItemLabel()
    {
        return WebInspector.UIString("Scripts");
    },

    get statusBarItems()
    {
        return [this.enableToggleButton.element, this._pauseOnExceptionButton.element];
    },

    get defaultFocusedElement()
    {
        return this.filesSelectElement;
    },

    get paused()
    {
        return this._paused;
    },

    show: function()
    {
        WebInspector.Panel.prototype.show.call(this);
        this.sidebarResizeElement.style.right = (this.sidebarElement.offsetWidth - 3) + "px";

        if (this.visibleView) {
            if (this.visibleView instanceof WebInspector.ResourceView)
                this.visibleView.headersVisible = false;
            this.visibleView.show(this.viewsContainerElement);
        }
        if (this._attachDebuggerWhenShown) {
            InspectorBackend.enableDebugger(false);
            delete this._attachDebuggerWhenShown;
        }
    },
    
    hide: function()
    {
        if (this.visibleView)
            this.visibleView.hide();
        WebInspector.Panel.prototype.hide.call(this);
    },

    get searchableViews()
    {
        return [ this.visibleView ];
    },

    get breakpointsActivated()
    {
        return this.toggleBreakpointsButton.toggled;
    },

    addScript: function(sourceID, sourceURL, source, startingLine, errorLine, errorMessage, scriptWorldType)
    {
        var script = new WebInspector.Script(sourceID, sourceURL, source, startingLine, errorLine, errorMessage, scriptWorldType);
        this._sourceIDMap[sourceID] = script;

        var resource = WebInspector.resourceURLMap[sourceURL];
        if (resource) {
            if (resource.finished) {
                // Resource is finished, bind the script right away.
                resource.addScript(script);
                this._sourceIDMap[sourceID] = resource;
            } else {
                // Resource is not finished, bind the script later.
                if (!resource._scriptsPendingResourceLoad) {
                    resource._scriptsPendingResourceLoad = [];
                    resource.addEventListener("finished", this._resourceLoadingFinished, this);
                }
                resource._scriptsPendingResourceLoad.push(script);
            }
        }
        this._addScriptToFilesMenu(script);
    },

    continueToLine: function(sourceID, line)
    {
        WebInspector.breakpointManager.setOneTimeBreakpoint(sourceID, line);
        if (this.paused)
            this._togglePause();
    },

    _resourceLoadingFinished: function(e)
    {
        var resource = e.target;
        for (var i = 0; i < resource._scriptsPendingResourceLoad.length; ++i) {
            // Bind script to resource.
            var script = resource._scriptsPendingResourceLoad[i];
            resource.addScript(script);
            this._sourceIDMap[script.sourceID] = resource;

            // Remove script from the files list.
            script.filesSelectOption.parentElement.removeChild(script.filesSelectOption);
            
            // Move breakpoints to the resource's frame.
            if (script._scriptView) {
                var sourceFrame = script._scriptView.sourceFrame;
                var resourceFrame = this._sourceFrameForScriptOrResource(resource);
                for (var j = 0; j < sourceFrame.breakpoints; ++j)
                    resourceFrame.addBreakpoint(sourceFrame.breakpoints[j]);
            }
        }
        // Adding first script will add resource.
        this._addScriptToFilesMenu(resource._scriptsPendingResourceLoad[0]);
        delete resource._scriptsPendingResourceLoad;
    },

    _breakpointAdded: function(event)
    {
        var breakpoint = event.data;

        if (!this.breakpointsActivated)
            this._toggleBreakpointsClicked();

        var sourceFrame;
        if (breakpoint.url) {
            var resource = WebInspector.resourceURLMap[breakpoint.url];
            if (resource && resource.finished)
                sourceFrame = this._sourceFrameForScriptOrResource(resource);
        }

        if (breakpoint.sourceID && !sourceFrame) {
            var object = this._sourceIDMap[breakpoint.sourceID]
            sourceFrame = this._sourceFrameForScriptOrResource(object);
        }

        if (sourceFrame)
            sourceFrame.addBreakpoint(breakpoint);
    },

    _breakpointRemoved: function(event)
    {
        var breakpoint = event.data;

        var sourceFrame;
        if (breakpoint.url) {
            var resource = WebInspector.resourceURLMap[breakpoint.url];
            if (resource && resource.finished)
                sourceFrame = this._sourceFrameForScriptOrResource(resource);
        }

        if (breakpoint.sourceID && !sourceFrame) {
            var object = this._sourceIDMap[breakpoint.sourceID]
            sourceFrame = this._sourceFrameForScriptOrResource(object);
        }

        if (sourceFrame)
            sourceFrame.removeBreakpoint(breakpoint);
    },

    canEditScripts: function()
    {
        return Preferences.canEditScriptSource;
    },

    editScriptSource: function(sourceID, newContent, line, linesCountToShift, commitEditingCallback, cancelEditingCallback)
    {
        if (!this.canEditScripts())
            return;

        // Need to clear breakpoints and re-create them later when editing source.
        var breakpoints = WebInspector.breakpointManager.breakpointsForSourceID(sourceID);
        for (var i = 0; i < breakpoints.length; ++i)
            WebInspector.breakpointManager.removeBreakpoint(breakpoints[i]);

        function mycallback(success, newBodyOrErrorMessage, callFrames)
        {
            if (success) {
                commitEditingCallback(newBodyOrErrorMessage);
                if (callFrames && callFrames.length)
                    this.debuggerPaused(callFrames);
            } else {
                cancelEditingCallback();
                WebInspector.log(newBodyOrErrorMessage, WebInspector.ConsoleMessage.MessageLevel.Warning);
            }
            for (var i = 0; i < breakpoints.length; ++i) {
                var breakpoint = breakpoints[i];
                var newLine = breakpoint.line;
                if (success && breakpoint.line >= line)
                    newLine += linesCountToShift;
                WebInspector.breakpointManager.setBreakpoint(sourceID, breakpoint.url, newLine, breakpoint.enabled, breakpoint.condition);
            }
        };
        var callbackId = WebInspector.Callback.wrap(mycallback.bind(this))
        InspectorBackend.editScriptSource(callbackId, sourceID, newContent);
    },

    selectedCallFrameId: function()
    {
        var selectedCallFrame = this.sidebarPanes.callstack.selectedCallFrame;
        if (!selectedCallFrame)
            return null;
        return selectedCallFrame.id;
    },

    evaluateInSelectedCallFrame: function(code, updateInterface, objectGroup, callback)
    {
        var selectedCallFrame = this.sidebarPanes.callstack.selectedCallFrame;
        if (!this._paused || !selectedCallFrame)
            return;

        if (typeof updateInterface === "undefined")
            updateInterface = true;

        var self = this;
        function updatingCallbackWrapper(result, exception)
        {
            callback(result, exception);
            if (updateInterface)
                self.sidebarPanes.scopechain.update(selectedCallFrame);
        }
        this.doEvalInCallFrame(selectedCallFrame, code, objectGroup, updatingCallbackWrapper);
    },

    doEvalInCallFrame: function(callFrame, code, objectGroup, callback)
    {
        function evalCallback(result)
        {
            if (result)
                callback(result.value, result.isException);
        }
        InjectedScriptAccess.get(callFrame.injectedScriptId).evaluateInCallFrame(callFrame.id, code, objectGroup, evalCallback);
    },

    debuggerPaused: function(callFrames)
    {
        WebInspector.breakpointManager.removeOneTimeBreakpoint();
        this._paused = true;
        this._waitingToPause = false;
        this._stepping = false;

        this._updateDebuggerButtons();

        this.sidebarPanes.callstack.update(callFrames, this._sourceIDMap);
        this.sidebarPanes.callstack.selectedCallFrame = callFrames[0];

        WebInspector.currentPanel = this;
        window.focus();
    },

    debuggerResumed: function()
    {
        this._paused = false;
        this._waitingToPause = false;
        this._stepping = false;

        this._clearInterface();
    },

    attachDebuggerWhenShown: function()
    {
        if (this.element.parentElement) {
            InspectorBackend.enableDebugger(false);
        } else {
            this._attachDebuggerWhenShown = true;
        }
    },

    debuggerWasEnabled: function()
    {
        if (this._debuggerEnabled)
            return;

        this._debuggerEnabled = true;
        this.reset(true);
    },

    debuggerWasDisabled: function()
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

        if (!this._debuggerEnabled) {
            this._paused = false;
            this._waitingToPause = false;
            this._stepping = false;
        }

        this._clearInterface();

        this._backForwardList = [];
        this._currentBackForwardIndex = -1;
        this._updateBackAndForwardButtons();

        this._resourceForURLInFilesSelect = {};
        this.filesSelectElement.removeChildren();
        this.functionsSelectElement.removeChildren();
        this.viewsContainerElement.removeChildren();

        if (this._sourceIDMap) {
            for (var sourceID in this._sourceIDMap) {
                var object = this._sourceIDMap[sourceID];
                if (object instanceof WebInspector.Resource)
                    object.removeAllScripts();
            }
        }

        this._sourceIDMap = {};

        this.sidebarPanes.watchExpressions.refreshExpressions();
        if (!preserveItems) {
            this.sidebarPanes.breakpoints.reset();
            this.sidebarPanes.workers.reset();
        }
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

        if (x)
            x.show(this.viewsContainerElement);
    },

    viewRecreated: function(oldView, newView)
    {
        if (this._visibleView === oldView)
            this._visibleView = newView;
    },

    canShowSourceLine: function(url, line)
    {
        if (!this._debuggerEnabled)
            return false;
        return !!this._scriptOrResourceForURLAndLine(url, line);
    },

    showSourceLine: function(url, line)
    {
        var scriptOrResource = this._scriptOrResourceForURLAndLine(url, line);
        this._showScriptOrResource(scriptOrResource, {line: line, shouldHighlightLine: true});
    },

    _scriptOrResourceForURLAndLine: function(url, line) 
    {
        var scriptWithMatchingUrl = null;
        for (var sourceID in this._sourceIDMap) {
            var scriptOrResource = this._sourceIDMap[sourceID];
            if (scriptOrResource instanceof WebInspector.Script) {
                if (scriptOrResource.sourceURL !== url)
                    continue;
                scriptWithMatchingUrl = scriptOrResource;
                if (scriptWithMatchingUrl.startingLine <= line && scriptWithMatchingUrl.startingLine + scriptWithMatchingUrl.linesCount > line)
                    return scriptWithMatchingUrl;
            } else {
                var resource = scriptOrResource;
                if (resource.url === url)
                    return resource;
            }
        }
        return scriptWithMatchingUrl;
    },

    showView: function(view)
    {
        if (!view)
            return;
        this._showScriptOrResource(view.resource || view.script);
    },

    handleShortcut: function(event)
    {
        var shortcut = WebInspector.KeyboardShortcut.makeKeyFromEvent(event);
        var handler = this._shortcuts[shortcut];
        if (handler) {
            handler(event);
            event.handled = true;
        } else
            this.sidebarPanes.callstack.handleShortcut(event);
    },

    scriptViewForScript: function(script)
    {
        if (!script)
            return null;
        if (!script._scriptView)
            script._scriptView = new WebInspector.ScriptView(script);
        return script._scriptView;
    },

    sourceFrameForScript: function(script)
    {
        var view = this.scriptViewForScript(script);
        if (!view)
            return null;

        // Setting up the source frame requires that we be attached.
        if (!this.element.parentNode)
            this.attach();

        view.setupSourceFrameIfNeeded();
        return view.sourceFrame;
    },

    _sourceFrameForScriptOrResource: function(scriptOrResource)
    {
        if (scriptOrResource instanceof WebInspector.Resource)
            return WebInspector.panels.resources.sourceFrameForResource(scriptOrResource);
        if (scriptOrResource instanceof WebInspector.Script)
            return this.sourceFrameForScript(scriptOrResource);
    },

    _showScriptOrResource: function(scriptOrResource, options)
    {
        // options = {line:, shouldHighlightLine:, fromBackForwardAction:, initialLoad:}
        if (!options) 
            options = {};

        if (!scriptOrResource)
            return;

        var view;
        if (scriptOrResource instanceof WebInspector.Resource) {
            if (!WebInspector.panels.resources)
                return null;
            view = WebInspector.panels.resources.resourceViewForResource(scriptOrResource);
            view.headersVisible = false;
            var sourceFrame = this._sourceFrameForScriptOrResource(scriptOrResource);
            var breakpoints = WebInspector.breakpointManager.breakpointsForURL(scriptOrResource.url);
            for (var i = 0; i < breakpoints.length; ++i)
                sourceFrame.addBreakpoint(breakpoints[i]);
        } else if (scriptOrResource instanceof WebInspector.Script)
            view = this.scriptViewForScript(scriptOrResource);

        if (!view)
            return;

        var url = scriptOrResource.url || scriptOrResource.sourceURL;
        if (url && !options.initialLoad)
            WebInspector.applicationSettings.lastViewedScriptFile = url;

        if (!options.fromBackForwardAction) {
            var oldIndex = this._currentBackForwardIndex;
            if (oldIndex >= 0)
                this._backForwardList.splice(oldIndex + 1, this._backForwardList.length - oldIndex);

            // Check for a previous entry of the same object in _backForwardList.
            // If one is found, remove it and update _currentBackForwardIndex to match.
            var previousEntryIndex = this._backForwardList.indexOf(scriptOrResource);
            if (previousEntryIndex !== -1) {
                this._backForwardList.splice(previousEntryIndex, 1);
                --this._currentBackForwardIndex;
            }

            this._backForwardList.push(scriptOrResource);
            ++this._currentBackForwardIndex;

            this._updateBackAndForwardButtons();
        }

        this.visibleView = view;

        if (options.line) {
            if (view.revealLine)
                view.revealLine(options.line);
            if (view.highlightLine && options.shouldHighlightLine)
                view.highlightLine(options.line);
        }

        var option;
        if (scriptOrResource instanceof WebInspector.Script) {
            option = scriptOrResource.filesSelectOption;

            // hasn't been added yet - happens for stepping in evals,
            // so use the force option to force the script into the menu.
            if (!option) {
                this._addScriptToFilesMenu(scriptOrResource, true);
                option = scriptOrResource.filesSelectOption;
            }

            console.assert(option);
        } else
            option = scriptOrResource.filesSelectOption;

        if (option)
            this.filesSelectElement.selectedIndex = option.index;
    },

    _addScriptToFilesMenu: function(script, force)
    {
        if (!script.sourceURL && !force)
            return;

        if (script.resource) {
            if (this._resourceForURLInFilesSelect[script.resource.url])
                return;
            this._resourceForURLInFilesSelect[script.resource.url] = script.resource;
        }
 
        var displayName = script.sourceURL ? WebInspector.displayNameForURL(script.sourceURL) : WebInspector.UIString("(program)");

        var select = this.filesSelectElement;
        var option = document.createElement("option");
        option.representedObject = script.resource || script;
        option.url = displayName;
        option.startingLine = script.startingLine;
        option.text = script.resource || script.startingLine === 1 ? displayName : String.sprintf("%s:%d", displayName, script.startingLine);

        function optionCompare(a, b)
        {
            if (a.url < b.url)
                return -1;
            else if (a.url > b.url)
                return 1;

            if (typeof a.startingLine !== "number")
                return -1;
            if (typeof b.startingLine !== "number")
                return -1;
            return a.startingLine - b.startingLine;
        }

        var insertionIndex = insertionIndexForObjectInListSortedByFunction(option, select.childNodes, optionCompare);
        if (insertionIndex < 0)
            select.appendChild(option);
        else
            select.insertBefore(option, select.childNodes.item(insertionIndex));

        if (script.resource)
            script.resource.filesSelectOption = option;
        else
            script.filesSelectOption = option;

        // Call _showScriptOrResource if the option we just appended ended up being selected.
        // This will happen for the first item added to the menu.
        if (select.options[select.selectedIndex] === option)
            this._showScriptOrResource(option.representedObject, {initialLoad: true});
        else {
            // if not first item, check to see if this was the last viewed
            var url = option.representedObject.url || option.representedObject.sourceURL;
            var lastURL = WebInspector.applicationSettings.lastViewedScriptFile;
            if (url && url === lastURL)
                this._showScriptOrResource(option.representedObject, {initialLoad: true});
        }

        if (script.worldType === WebInspector.Script.WorldType.EXTENSIONS_WORLD)
            script.filesSelectOption.addStyleClass("extension-script");
    },

    _clearCurrentExecutionLine: function()
    {
        if (this._executionSourceFrame)
            this._executionSourceFrame.executionLine = 0;
        delete this._executionSourceFrame;
    },

    _callFrameSelected: function()
    {
        this._clearCurrentExecutionLine();

        var callStackPane = this.sidebarPanes.callstack;
        var currentFrame = callStackPane.selectedCallFrame;
        if (!currentFrame)
            return;

        this.sidebarPanes.scopechain.update(currentFrame);
        this.sidebarPanes.watchExpressions.refreshExpressions();

        var scriptOrResource = this._sourceIDMap[currentFrame.sourceID];
        this._showScriptOrResource(scriptOrResource, {line: currentFrame.line});

        this._executionSourceFrame = this._sourceFrameForScriptOrResource(scriptOrResource);
        if (this._executionSourceFrame)
            this._executionSourceFrame.executionLine = currentFrame.line;
    },

    _changeVisibleFile: function(event)
    {
        var select = this.filesSelectElement;
        this._showScriptOrResource(select.options[select.selectedIndex].representedObject);
    },

    _startSidebarResizeDrag: function(event)
    {
        WebInspector.elementDragStart(this.sidebarElement, this._sidebarResizeDrag.bind(this), this._endSidebarResizeDrag.bind(this), event, "col-resize");

        if (event.target === this.sidebarResizeWidgetElement)
            this._dragOffset = (event.target.offsetWidth - (event.pageX - event.target.totalOffsetLeft));
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

        this.resize();
    },
    
    updatePauseOnExceptionsState: function(pauseOnExceptionsState)
    {
        if (pauseOnExceptionsState == WebInspector.ScriptsPanel.PauseOnExceptionsState.DontPauseOnExceptions)
            this._pauseOnExceptionButton.title = WebInspector.UIString("Don't pause on exceptions.\nClick to Pause on all exceptions.");
        else if (pauseOnExceptionsState == WebInspector.ScriptsPanel.PauseOnExceptionsState.PauseOnAllExceptions)
            this._pauseOnExceptionButton.title = WebInspector.UIString("Pause on all exceptions.\nClick to Pause on uncaught exceptions.");
        else if (pauseOnExceptionsState == WebInspector.ScriptsPanel.PauseOnExceptionsState.PauseOnUncaughtExceptions)
            this._pauseOnExceptionButton.title = WebInspector.UIString("Pause on uncaught exceptions.\nClick to Not pause on exceptions.");

        this._pauseOnExceptionButton.state = pauseOnExceptionsState;
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

        this._clearCurrentExecutionLine();
        this._updateDebuggerButtons();
    },

    _goBack: function()
    {
        if (this._currentBackForwardIndex <= 0) {
            console.error("Can't go back from index " + this._currentBackForwardIndex);
            return;
        }

        this._showScriptOrResource(this._backForwardList[--this._currentBackForwardIndex], {fromBackForwardAction: true});
        this._updateBackAndForwardButtons();
    },

    _goForward: function()
    {
        if (this._currentBackForwardIndex >= this._backForwardList.length - 1) {
            console.error("Can't go forward from index " + this._currentBackForwardIndex);
            return;
        }

        this._showScriptOrResource(this._backForwardList[++this._currentBackForwardIndex], {fromBackForwardAction: true});
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

        if (this._debuggerEnabled)
            InspectorBackend.disableDebugger(true);
        else
            InspectorBackend.enableDebugger(!!optionalAlways);
    },

    _togglePauseOnExceptions: function()
    {
        InspectorBackend.setPauseOnExceptionsState((this._pauseOnExceptionButton.state + 1) % this._pauseOnExceptionButton.states);
    },

    _togglePause: function()
    {
        if (this._paused) {
            this._paused = false;
            this._waitingToPause = false;
            InspectorBackend.resume();
        } else {
            this._stepping = false;
            this._waitingToPause = true;
            InspectorBackend.pause();
        }

        this._clearInterface();
    },

    _stepOverClicked: function()
    {
        this._paused = false;
        this._stepping = true;

        this._clearInterface();

        InspectorBackend.stepOverStatement();
    },

    _stepIntoClicked: function()
    {
        this._paused = false;
        this._stepping = true;

        this._clearInterface();

        InspectorBackend.stepIntoStatement();
    },

    _stepOutClicked: function()
    {
        this._paused = false;
        this._stepping = true;

        this._clearInterface();

        InspectorBackend.stepOutOfFunction();
    },

    _toggleBreakpointsClicked: function()
    {
        this.toggleBreakpointsButton.toggled = !this.toggleBreakpointsButton.toggled;
        if (this.toggleBreakpointsButton.toggled) {
            InspectorBackend.activateBreakpoints();
            this.toggleBreakpointsButton.title = WebInspector.UIString("Deactivate all breakpoints.");
            document.getElementById("main-panels").removeStyleClass("breakpoints-deactivated");
        } else {
            InspectorBackend.deactivateBreakpoints();
            this.toggleBreakpointsButton.title = WebInspector.UIString("Activate all breakpoints.");
            document.getElementById("main-panels").addStyleClass("breakpoints-deactivated");
        }
    },

    elementsToRestoreScrollPositionsFor: function()
    {
        return [ this.sidebarElement ];
    },

    _registerShortcuts: function()
    {
        var section = WebInspector.shortcutsHelp.section(WebInspector.UIString("Scripts Panel"));
        var handler, shortcut1, shortcut2;
        var platformSpecificModifier = WebInspector.KeyboardShortcut.Modifiers.CtrlOrMeta;

        this._shortcuts = {};

        // Continue.
        handler = this.pauseButton.click.bind(this.pauseButton);
        shortcut1 = WebInspector.KeyboardShortcut.makeDescriptor(WebInspector.KeyboardShortcut.Keys.F8);
        this._shortcuts[shortcut1.key] = handler;
        shortcut2 = WebInspector.KeyboardShortcut.makeDescriptor(WebInspector.KeyboardShortcut.Keys.Slash, platformSpecificModifier);
        this._shortcuts[shortcut2.key] = handler;
        section.addAlternateKeys([ shortcut1.name, shortcut2.name ], WebInspector.UIString("Continue"));

        // Step over.
        handler = this.stepOverButton.click.bind(this.stepOverButton);
        shortcut1 = WebInspector.KeyboardShortcut.makeDescriptor(WebInspector.KeyboardShortcut.Keys.F10);
        this._shortcuts[shortcut1.key] = handler;
        shortcut2 = WebInspector.KeyboardShortcut.makeDescriptor(WebInspector.KeyboardShortcut.Keys.SingleQuote, platformSpecificModifier);
        this._shortcuts[shortcut2.key] = handler;
        section.addAlternateKeys([ shortcut1.name, shortcut2.name ], WebInspector.UIString("Step over"));

        // Step into.
        handler = this.stepIntoButton.click.bind(this.stepIntoButton);
        shortcut1 = WebInspector.KeyboardShortcut.makeDescriptor(WebInspector.KeyboardShortcut.Keys.F11);
        this._shortcuts[shortcut1.key] = handler;
        shortcut2 = WebInspector.KeyboardShortcut.makeDescriptor(WebInspector.KeyboardShortcut.Keys.Semicolon, platformSpecificModifier);
        this._shortcuts[shortcut2.key] = handler;
        section.addAlternateKeys([ shortcut1.name, shortcut2.name ], WebInspector.UIString("Step into"));

        // Step out.
        handler = this.stepOutButton.click.bind(this.stepOutButton);
        shortcut1 = WebInspector.KeyboardShortcut.makeDescriptor(WebInspector.KeyboardShortcut.Keys.F11, WebInspector.KeyboardShortcut.Modifiers.Shift);
        this._shortcuts[shortcut1.key] = handler;
        shortcut2 = WebInspector.KeyboardShortcut.makeDescriptor(WebInspector.KeyboardShortcut.Keys.Semicolon, WebInspector.KeyboardShortcut.Modifiers.Shift, platformSpecificModifier);
        this._shortcuts[shortcut2.key] = handler;
        section.addAlternateKeys([ shortcut1.name, shortcut2.name ], WebInspector.UIString("Step out"));

        this.sidebarPanes.callstack.registerShortcuts(section);
    }
}

WebInspector.ScriptsPanel.prototype.__proto__ = WebInspector.Panel.prototype;

WebInspector.didEditScriptSource = WebInspector.Callback.processCallback;
