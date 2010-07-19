/*
 * Copyright (C) 2006, 2007, 2008 Apple Inc.  All rights reserved.
 * Copyright (C) 2007 Matt Lilek (pewtermoose@gmail.com).
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

function preloadImages()
{
    (new Image()).src = "Images/clearConsoleButtonGlyph.png";
    (new Image()).src = "Images/consoleButtonGlyph.png";
    (new Image()).src = "Images/dockButtonGlyph.png";
    (new Image()).src = "Images/enableOutlineButtonGlyph.png";
    (new Image()).src = "Images/enableSolidButtonGlyph.png";
    (new Image()).src = "Images/excludeButtonGlyph.png";
    (new Image()).src = "Images/focusButtonGlyph.png";
    (new Image()).src = "Images/largerResourcesButtonGlyph.png";
    (new Image()).src = "Images/nodeSearchButtonGlyph.png";
    (new Image()).src = "Images/pauseOnExceptionButtonGlyph.png";
    (new Image()).src = "Images/percentButtonGlyph.png";
    (new Image()).src = "Images/recordButtonGlyph.png";
    (new Image()).src = "Images/recordToggledButtonGlyph.png";
    (new Image()).src = "Images/reloadButtonGlyph.png";
    (new Image()).src = "Images/undockButtonGlyph.png";
}

preloadImages();

var WebInspector = {
    resources: {},
    resourceURLMap: {},
    cookieDomains: {},
    applicationCacheDomains: {},
    missingLocalizedStrings: {},
    pendingDispatches: 0,

    // RegExp groups:
    // 1 - scheme
    // 2 - hostname
    // 3 - ?port
    // 4 - ?path
    // 5 - ?fragment
    URLRegExp: /^(http[s]?|file):\/\/([^\/:]*)(?::([\d]+))?(?:(\/[^#]*)(?:#(.*))?)?$/i,
    GenericURLRegExp: /^([^:]+):\/\/([^\/:]*)(?::([\d]+))?(?:(\/[^#]*)(?:#(.*))?)?$/i,

    get platform()
    {
        if (!("_platform" in this))
            this._platform = InspectorFrontendHost.platform();

        return this._platform;
    },

    get platformFlavor()
    {
        if (!("_platformFlavor" in this))
            this._platformFlavor = this._detectPlatformFlavor();

        return this._platformFlavor;
    },

    _detectPlatformFlavor: function()
    {
        const userAgent = navigator.userAgent;

        if (this.platform === "windows") {
            var match = userAgent.match(/Windows NT (\d+)\.(?:\d+)/);
            if (match && match[1] >= 6)
                return WebInspector.PlatformFlavor.WindowsVista;
            return null;
        } else if (this.platform === "mac") {
            var match = userAgent.match(/Mac OS X\s*(?:(\d+)_(\d+))?/);
            if (!match || match[1] != 10)
                return WebInspector.PlatformFlavor.MacSnowLeopard;
            switch (Number(match[2])) {
                case 4:
                    return WebInspector.PlatformFlavor.MacTiger;
                case 5:
                    return WebInspector.PlatformFlavor.MacLeopard;
                case 6:
                default:
                    return WebInspector.PlatformFlavor.MacSnowLeopard;
            }
        }

        return null;
    },

    get port()
    {
        if (!("_port" in this))
            this._port = InspectorFrontendHost.port();

        return this._port;
    },

    get previousFocusElement()
    {
        return this._previousFocusElement;
    },

    get currentFocusElement()
    {
        return this._currentFocusElement;
    },

    set currentFocusElement(x)
    {
        if (this._currentFocusElement !== x)
            this._previousFocusElement = this._currentFocusElement;
        this._currentFocusElement = x;

        if (this._currentFocusElement) {
            this._currentFocusElement.focus();

            // Make a caret selection inside the new element if there isn't a range selection and
            // there isn't already a caret selection inside.
            var selection = window.getSelection();
            if (selection.isCollapsed && !this._currentFocusElement.isInsertionCaretInside()) {
                var selectionRange = this._currentFocusElement.ownerDocument.createRange();
                selectionRange.setStart(this._currentFocusElement, 0);
                selectionRange.setEnd(this._currentFocusElement, 0);

                selection.removeAllRanges();
                selection.addRange(selectionRange);
            }
        } else if (this._previousFocusElement)
            this._previousFocusElement.blur();
    },

    get currentPanel()
    {
        return this._currentPanel;
    },

    set currentPanel(x)
    {
        if (this._currentPanel === x)
            return;

        if (this._currentPanel)
            this._currentPanel.hide();

        this._currentPanel = x;

        this.updateSearchLabel();

        if (x) {
            x.show();

            if (this.currentQuery) {
                if (x.performSearch) {
                    function performPanelSearch()
                    {
                        this.updateSearchMatchesCount();

                        x.currentQuery = this.currentQuery;
                        x.performSearch(this.currentQuery);
                    }

                    // Perform the search on a timeout so the panel switches fast.
                    setTimeout(performPanelSearch.bind(this), 0);
                } else {
                    // Update to show Not found for panels that can't be searched.
                    this.updateSearchMatchesCount();
                }
            }
        }

        for (var panelName in WebInspector.panels) {
            if (WebInspector.panels[panelName] === x) {
                InspectorBackend.storeLastActivePanel(panelName);
                this._panelHistory.setPanel(panelName);
            }
        }
    },

    _createPanels: function()
    {
        var hiddenPanels = (InspectorFrontendHost.hiddenPanels() || "").split(',');
        if (hiddenPanels.indexOf("elements") === -1)
            this.panels.elements = new WebInspector.ElementsPanel();
        if (hiddenPanels.indexOf("resources") === -1)
            this.panels.resources = new WebInspector.ResourcesPanel();
        if (hiddenPanels.indexOf("scripts") === -1)
            this.panels.scripts = new WebInspector.ScriptsPanel();
        if (hiddenPanels.indexOf("timeline") === -1)
            this.panels.timeline = new WebInspector.TimelinePanel();
        if (hiddenPanels.indexOf("profiles") === -1) {
            this.panels.profiles = new WebInspector.ProfilesPanel();
            this.panels.profiles.registerProfileType(new WebInspector.CPUProfileType());
        }
        if (hiddenPanels.indexOf("storage") === -1 && hiddenPanels.indexOf("databases") === -1)
            this.panels.storage = new WebInspector.StoragePanel();
        if (Preferences.auditsPanelEnabled && hiddenPanels.indexOf("audits") === -1)
            this.panels.audits = new WebInspector.AuditsPanel();
        if (hiddenPanels.indexOf("console") === -1)
            this.panels.console = new WebInspector.ConsolePanel();
    },

    get attached()
    {
        return this._attached;
    },

    set attached(x)
    {
        if (this._attached === x)
            return;

        this._attached = x;

        this.updateSearchLabel();

        var dockToggleButton = document.getElementById("dock-status-bar-item");
        var body = document.body;

        if (x) {
            body.removeStyleClass("detached");
            body.addStyleClass("attached");
            dockToggleButton.title = WebInspector.UIString("Undock into separate window.");
        } else {
            body.removeStyleClass("attached");
            body.addStyleClass("detached");
            dockToggleButton.title = WebInspector.UIString("Dock to main window.");
        }
        if (this.drawer)
            this.drawer.resize();
    },

    get errors()
    {
        return this._errors || 0;
    },

    set errors(x)
    {
        x = Math.max(x, 0);

        if (this._errors === x)
            return;
        this._errors = x;
        this._updateErrorAndWarningCounts();
    },

    get warnings()
    {
        return this._warnings || 0;
    },

    set warnings(x)
    {
        x = Math.max(x, 0);

        if (this._warnings === x)
            return;
        this._warnings = x;
        this._updateErrorAndWarningCounts();
    },

    _updateErrorAndWarningCounts: function()
    {
        var errorWarningElement = document.getElementById("error-warning-count");
        if (!errorWarningElement)
            return;

        if (!this.errors && !this.warnings) {
            errorWarningElement.addStyleClass("hidden");
            return;
        }

        errorWarningElement.removeStyleClass("hidden");

        errorWarningElement.removeChildren();

        if (this.errors) {
            var errorElement = document.createElement("span");
            errorElement.id = "error-count";
            errorElement.textContent = this.errors;
            errorWarningElement.appendChild(errorElement);
        }

        if (this.warnings) {
            var warningsElement = document.createElement("span");
            warningsElement.id = "warning-count";
            warningsElement.textContent = this.warnings;
            errorWarningElement.appendChild(warningsElement);
        }

        if (this.errors) {
            if (this.warnings) {
                if (this.errors == 1) {
                    if (this.warnings == 1)
                        errorWarningElement.title = WebInspector.UIString("%d error, %d warning", this.errors, this.warnings);
                    else
                        errorWarningElement.title = WebInspector.UIString("%d error, %d warnings", this.errors, this.warnings);
                } else if (this.warnings == 1)
                    errorWarningElement.title = WebInspector.UIString("%d errors, %d warning", this.errors, this.warnings);
                else
                    errorWarningElement.title = WebInspector.UIString("%d errors, %d warnings", this.errors, this.warnings);
            } else if (this.errors == 1)
                errorWarningElement.title = WebInspector.UIString("%d error", this.errors);
            else
                errorWarningElement.title = WebInspector.UIString("%d errors", this.errors);
        } else if (this.warnings == 1)
            errorWarningElement.title = WebInspector.UIString("%d warning", this.warnings);
        else if (this.warnings)
            errorWarningElement.title = WebInspector.UIString("%d warnings", this.warnings);
        else
            errorWarningElement.title = null;
    },

    get styleChanges()
    {
        return this._styleChanges;
    },

    set styleChanges(x)
    {
        x = Math.max(x, 0);

        if (this._styleChanges === x)
            return;
        this._styleChanges = x;
        this._updateChangesCount();
    },

    _updateChangesCount: function()
    {
        // TODO: Remove immediate return when enabling the Changes Panel
        return;

        var changesElement = document.getElementById("changes-count");
        if (!changesElement)
            return;

        if (!this.styleChanges) {
            changesElement.addStyleClass("hidden");
            return;
        }

        changesElement.removeStyleClass("hidden");
        changesElement.removeChildren();

        if (this.styleChanges) {
            var styleChangesElement = document.createElement("span");
            styleChangesElement.id = "style-changes-count";
            styleChangesElement.textContent = this.styleChanges;
            changesElement.appendChild(styleChangesElement);
        }

        if (this.styleChanges) {
            if (this.styleChanges === 1)
                changesElement.title = WebInspector.UIString("%d style change", this.styleChanges);
            else
                changesElement.title = WebInspector.UIString("%d style changes", this.styleChanges);
        }
    },

    get hoveredDOMNode()
    {
        return this._hoveredDOMNode;
    },

    set hoveredDOMNode(x)
    {
        if (this._hoveredDOMNode === x)
            return;

        this._hoveredDOMNode = x;

        if (this._hoveredDOMNode)
            this._updateHoverHighlightSoon(this.showingDOMNodeHighlight ? 50 : 500);
        else
            this._updateHoverHighlight();
    },

    _updateHoverHighlightSoon: function(delay)
    {
        if ("_updateHoverHighlightTimeout" in this)
            clearTimeout(this._updateHoverHighlightTimeout);
        this._updateHoverHighlightTimeout = setTimeout(this._updateHoverHighlight.bind(this), delay);
    },

    _updateHoverHighlight: function()
    {
        if ("_updateHoverHighlightTimeout" in this) {
            clearTimeout(this._updateHoverHighlightTimeout);
            delete this._updateHoverHighlightTimeout;
        }

        if (this._hoveredDOMNode) {
            InspectorBackend.highlightDOMNode(this._hoveredDOMNode.id);
            this.showingDOMNodeHighlight = true;
        } else {
            InspectorBackend.hideDOMNodeHighlight();
            this.showingDOMNodeHighlight = false;
        }
    }
}

WebInspector.PlatformFlavor = {
    WindowsVista: "windows-vista",
    MacTiger: "mac-tiger",
    MacLeopard: "mac-leopard",
    MacSnowLeopard: "mac-snowleopard"
}

WebInspector.loaded = function()
{
    InspectorBackend.setInjectedScriptSource("(" + injectedScriptConstructor + ");");

    var platform = WebInspector.platform;
    document.body.addStyleClass("platform-" + platform);
    var flavor = WebInspector.platformFlavor;
    if (flavor)
        document.body.addStyleClass("platform-" + flavor);
    var port = WebInspector.port;
    document.body.addStyleClass("port-" + port);

    this.applicationSettings = new WebInspector.Settings(false);
    this.sessionSettings = new WebInspector.Settings(true);
    this._registerShortcuts();

    // set order of some sections explicitly
    WebInspector.shortcutsHelp.section(WebInspector.UIString("Console"));
    WebInspector.shortcutsHelp.section(WebInspector.UIString("Elements Panel"));

    this.drawer = new WebInspector.Drawer();
    this.console = new WebInspector.ConsoleView(this.drawer);
    // TODO: Uncomment when enabling the Changes Panel
    // this.changes = new WebInspector.ChangesView(this.drawer);
    // TODO: Remove class="hidden" from inspector.html on button#changes-status-bar-item
    this.drawer.visibleView = this.console;
    this.domAgent = new WebInspector.DOMAgent();

    this.resourceCategories = {
        documents: new WebInspector.ResourceCategory("documents", WebInspector.UIString("Documents"), "rgb(47,102,236)"),
        stylesheets: new WebInspector.ResourceCategory("stylesheets", WebInspector.UIString("Stylesheets"), "rgb(157,231,119)"),
        images: new WebInspector.ResourceCategory("images", WebInspector.UIString("Images"), "rgb(164,60,255)"),
        scripts: new WebInspector.ResourceCategory("scripts", WebInspector.UIString("Scripts"), "rgb(255,121,0)"),
        xhr: new WebInspector.ResourceCategory("xhr", WebInspector.UIString("XHR"), "rgb(231,231,10)"),
        fonts: new WebInspector.ResourceCategory("fonts", WebInspector.UIString("Fonts"), "rgb(255,82,62)"),
        other: new WebInspector.ResourceCategory("other", WebInspector.UIString("Other"), "rgb(186,186,186)")
    };

    this.breakpointManager = new WebInspector.BreakpointManager();
    this.cssModel = new WebInspector.CSSStyleModel();

    this.panels = {};
    this._createPanels();
    this._panelHistory = new WebInspector.PanelHistory();

    var toolbarElement = document.getElementById("toolbar");
    var previousToolbarItem = toolbarElement.children[0];

    this.panelOrder = [];
    for (var panelName in this.panels)
        previousToolbarItem = WebInspector.addPanelToolbarIcon(toolbarElement, this.panels[panelName], previousToolbarItem);

    this.Tips = {
        ResourceNotCompressed: {id: 0, message: WebInspector.UIString("You could save bandwidth by having your web server compress this transfer with gzip or zlib.")}
    };

    this.Warnings = {
        IncorrectMIMEType: {id: 0, message: WebInspector.UIString("Resource interpreted as %s but transferred with MIME type %s.")}
    };

    this.addMainEventListeners(document);

    window.addEventListener("resize", this.windowResize.bind(this), true);

    document.addEventListener("focus", this.focusChanged.bind(this), true);
    document.addEventListener("keydown", this.documentKeyDown.bind(this), false);
    document.addEventListener("beforecopy", this.documentCanCopy.bind(this), true);
    document.addEventListener("copy", this.documentCopy.bind(this), true);
    document.addEventListener("contextmenu", this.contextMenuEventFired.bind(this), true);

    var dockToggleButton = document.getElementById("dock-status-bar-item");
    dockToggleButton.addEventListener("click", this.toggleAttach.bind(this), false);

    if (this.attached)
        dockToggleButton.title = WebInspector.UIString("Undock into separate window.");
    else
        dockToggleButton.title = WebInspector.UIString("Dock to main window.");

    var errorWarningCount = document.getElementById("error-warning-count");
    errorWarningCount.addEventListener("click", this.showConsole.bind(this), false);
    this._updateErrorAndWarningCounts();

    this.styleChanges = 0;
    // TODO: Uncomment when enabling the Changes Panel
    // var changesElement = document.getElementById("changes-count");
    // changesElement.addEventListener("click", this.showChanges.bind(this), false);
    // this._updateErrorAndWarningCounts();

    var searchField = document.getElementById("search");
    searchField.addEventListener("search", this.performSearch.bind(this), false); // when the search is emptied
    searchField.addEventListener("mousedown", this._searchFieldManualFocus.bind(this), false); // when the search field is manually selected
    searchField.addEventListener("keydown", this._searchKeyDown.bind(this), true);

    toolbarElement.addEventListener("mousedown", this.toolbarDragStart, true);
    document.getElementById("close-button-left").addEventListener("click", this.close, true);
    document.getElementById("close-button-right").addEventListener("click", this.close, true);

    InspectorFrontendHost.loaded();
}

WebInspector.addPanelToolbarIcon = function(toolbarElement, panel, previousToolbarItem)
{
    var panelToolbarItem = panel.toolbarItem;
    this.panelOrder.push(panel);
    panelToolbarItem.addEventListener("click", this._toolbarItemClicked.bind(this));
    if (previousToolbarItem)
        toolbarElement.insertBefore(panelToolbarItem, previousToolbarItem.nextSibling);
    else
        toolbarElement.insertBefore(panelToolbarItem, toolbarElement.firstChild);
    return panelToolbarItem;
}

var windowLoaded = function()
{
    var localizedStringsURL = InspectorFrontendHost.localizedStringsURL();
    if (localizedStringsURL) {
        var localizedStringsScriptElement = document.createElement("script");
        localizedStringsScriptElement.addEventListener("load", WebInspector.loaded.bind(WebInspector), false);
        localizedStringsScriptElement.type = "text/javascript";
        localizedStringsScriptElement.src = localizedStringsURL;
        document.head.appendChild(localizedStringsScriptElement);
    } else
        WebInspector.loaded();

    window.removeEventListener("load", windowLoaded, false);
    delete windowLoaded;
};

window.addEventListener("load", windowLoaded, false);

WebInspector.dispatch = function() {
    var methodName = arguments[0];
    var parameters = Array.prototype.slice.call(arguments, 1);

    // We'd like to enforce asynchronous interaction between the inspector controller and the frontend.
    // This is important to LayoutTests.
    function delayDispatch()
    {
        if (!(methodName in WebInspector)) {
            console.error("Attempted to dispatch unimplemented WebInspector method: %s", methodName);
            return;
        }

        WebInspector[methodName].apply(WebInspector, parameters);
        WebInspector.pendingDispatches--;
    }
    WebInspector.pendingDispatches++;
    setTimeout(delayDispatch, 0);
}

WebInspector.dispatchMessageFromBackend = function(arguments)
{
    WebInspector.dispatch.apply(this, arguments);
}


WebInspector.windowResize = function(event)
{
    if (this.currentPanel)
        this.currentPanel.resize();
    this.drawer.resize();
}

WebInspector.windowFocused = function(event)
{
    // Fires after blur, so when focusing on either the main inspector
    // or an <iframe> within the inspector we should always remove the
    // "inactive" class.
    if (event.target.document.nodeType === Node.DOCUMENT_NODE)
        document.body.removeStyleClass("inactive");
}

WebInspector.windowBlurred = function(event)
{
    // Leaving the main inspector or an <iframe> within the inspector.
    // We can add "inactive" now, and if we are moving the focus to another
    // part of the inspector then windowFocused will correct this.
    if (event.target.document.nodeType === Node.DOCUMENT_NODE)
        document.body.addStyleClass("inactive");
}

WebInspector.focusChanged = function(event)
{
    this.currentFocusElement = event.target;
}

WebInspector.setAttachedWindow = function(attached)
{
    this.attached = attached;
}

WebInspector.close = function(event)
{
    if (this._isClosing)
        return;
    this._isClosing = true;
    InspectorFrontendHost.closeWindow();
}

WebInspector.inspectedPageDestroyed = function()
{
    WebInspector.close();
}

WebInspector.documentMouseOver = function(event)
{
    if (event.target.tagName !== "A")
        return;

    const anchor = event.target;
    if (!anchor.hasStyleClass("webkit-html-resource-link"))
        return;
    if (anchor.href && anchor.href.indexOf("/data:") != -1)
        return;
}

WebInspector.documentClick = function(event)
{
    var anchor = event.target.enclosingNodeOrSelfWithNodeName("a");
    if (!anchor)
        return;

    // Prevent the link from navigating, since we don't do any navigation by following links normally.
    event.preventDefault();
    event.stopPropagation();

    function followLink()
    {
        // FIXME: support webkit-html-external-link links here.
        if (WebInspector.canShowSourceLine(anchor.href, anchor.lineNumber, anchor.preferredPanel)) {
            if (anchor.hasStyleClass("webkit-html-external-link")) {
                anchor.removeStyleClass("webkit-html-external-link");
                anchor.addStyleClass("webkit-html-resource-link");
            }

            WebInspector.showSourceLine(anchor.href, anchor.lineNumber, anchor.preferredPanel);
            return;
        }

        const profileMatch = WebInspector.ProfileType.URLRegExp.exec(anchor.href);
        if (profileMatch) {
            WebInspector.showProfileForURL(anchor.href);
            return;
        }

        const urlMatch = WebInspector.GenericURLRegExp.exec(anchor.href);
        if (urlMatch && urlMatch[1] === "webkit-link-action") {
            if (urlMatch[2] === "show-panel") {
                const panel = urlMatch[4].substring(1);
                if (WebInspector.panels[panel])
                    WebInspector.currentPanel = WebInspector.panels[panel];
            }
            return;
        }

        WebInspector.showResourcesPanel();
    }

    if (WebInspector.followLinkTimeout)
        clearTimeout(WebInspector.followLinkTimeout);

    if (anchor.preventFollowOnDoubleClick) {
        // Start a timeout if this is the first click, if the timeout is canceled
        // before it fires, then a double clicked happened or another link was clicked.
        if (event.detail === 1)
            WebInspector.followLinkTimeout = setTimeout(followLink, 333);
        return;
    }

    followLink();
}

WebInspector._registerShortcuts = function()
{
    var shortcut = WebInspector.KeyboardShortcut;
    var section = WebInspector.shortcutsHelp.section(WebInspector.UIString("All Panels"));
    var keys = [
        shortcut.shortcutToString("]", shortcut.Modifiers.CtrlOrMeta),
        shortcut.shortcutToString("[", shortcut.Modifiers.CtrlOrMeta)
    ];
    section.addRelatedKeys(keys, WebInspector.UIString("Next/previous panel"));
    section.addKey(shortcut.shortcutToString(shortcut.Keys.Esc), WebInspector.UIString("Toggle console"));
    section.addKey(shortcut.shortcutToString("f", shortcut.Modifiers.CtrlOrMeta), WebInspector.UIString("Search"));
    keys = [
        shortcut.shortcutToString("g", shortcut.Modifiers.CtrlOrMeta),
        shortcut.shortcutToString("g", shortcut.Modifiers.CtrlOrMeta | shortcut.Modifiers.Shift)
    ];
    section.addRelatedKeys(keys, WebInspector.UIString("Find next/previous"));
}

WebInspector.documentKeyDown = function(event)
{
    var isInputElement = event.target.nodeName === "INPUT";
    var isInEditMode = event.target.enclosingNodeOrSelfWithClass("text-prompt") || WebInspector.isEditingAnyField();
    const helpKey = WebInspector.isMac() ? "U+003F" : "U+00BF"; // "?" for both platforms

    if (event.keyIdentifier === "F1" ||
        (event.keyIdentifier === helpKey && event.shiftKey && (!isInEditMode && !isInputElement || event.metaKey))) {
        WebInspector.shortcutsHelp.show();
        event.stopPropagation();
        event.preventDefault();
        return;
    }

    if (WebInspector.isEditingAnyField())
        return;

    if (this.currentFocusElement && this.currentFocusElement.handleKeyEvent) {
        this.currentFocusElement.handleKeyEvent(event);
        if (event.handled) {
            event.preventDefault();
            return;
        }
    }

    if (this.currentPanel && this.currentPanel.handleShortcut) {
        this.currentPanel.handleShortcut(event);
        if (event.handled) {
            event.preventDefault();
            return;
        }
    }

    var isMac = WebInspector.isMac();
    switch (event.keyIdentifier) {
        case "Left":
            var isBackKey = !isInEditMode && (isMac ? event.metaKey : event.ctrlKey);
            if (isBackKey && this._panelHistory.canGoBack()) {
                this._panelHistory.goBack();
                event.preventDefault();
            }
            break;

        case "Right":
            var isForwardKey = !isInEditMode && (isMac ? event.metaKey : event.ctrlKey);
            if (isForwardKey && this._panelHistory.canGoForward()) {
                this._panelHistory.goForward();
                event.preventDefault();
            }
            break;

        case "U+001B": // Escape key
            event.preventDefault();
            if (this.drawer.fullPanel)
                return;

            this.drawer.visible = !this.drawer.visible;
            break;

        case "U+0046": // F key
            if (isMac)
                var isFindKey = event.metaKey && !event.ctrlKey && !event.altKey && !event.shiftKey;
            else
                var isFindKey = event.ctrlKey && !event.metaKey && !event.altKey && !event.shiftKey;

            if (isFindKey) {
                WebInspector.focusSearchField();
                event.preventDefault();
            }
            break;

        case "F3":
            if (!isMac) {
                WebInspector.focusSearchField();
                event.preventDefault();
            }
            break;

        case "U+0047": // G key
            if (isMac)
                var isFindAgainKey = event.metaKey && !event.ctrlKey && !event.altKey;
            else
                var isFindAgainKey = event.ctrlKey && !event.metaKey && !event.altKey;

            if (isFindAgainKey) {
                if (event.shiftKey) {
                    if (this.currentPanel.jumpToPreviousSearchResult)
                        this.currentPanel.jumpToPreviousSearchResult();
                } else if (this.currentPanel.jumpToNextSearchResult)
                    this.currentPanel.jumpToNextSearchResult();
                event.preventDefault();
            }

            break;

        // Windows and Mac have two different definitions of [, so accept both.
        case "U+005B":
        case "U+00DB": // [ key
            if (isMac)
                var isRotateLeft = event.metaKey && !event.shiftKey && !event.ctrlKey && !event.altKey;
            else
                var isRotateLeft = event.ctrlKey && !event.shiftKey && !event.metaKey && !event.altKey;

            if (isRotateLeft) {
                var index = this.panelOrder.indexOf(this.currentPanel);
                index = (index === 0) ? this.panelOrder.length - 1 : index - 1;
                this.panelOrder[index].toolbarItem.click();
                event.preventDefault();
            }

            break;

        // Windows and Mac have two different definitions of ], so accept both.
        case "U+005D":
        case "U+00DD":  // ] key
            if (isMac)
                var isRotateRight = event.metaKey && !event.shiftKey && !event.ctrlKey && !event.altKey;
            else
                var isRotateRight = event.ctrlKey && !event.shiftKey && !event.metaKey && !event.altKey;

            if (isRotateRight) {
                var index = this.panelOrder.indexOf(this.currentPanel);
                index = (index + 1) % this.panelOrder.length;
                this.panelOrder[index].toolbarItem.click();
                event.preventDefault();
            }

            break;

        case "U+0052": // R key
            if ((event.metaKey && isMac) || (event.ctrlKey && !isMac)) {
                InspectorBackend.reloadPage();
                event.preventDefault();
            }
            break;
        case "F5":
            if (!isMac)
                InspectorBackend.reloadPage();
            break;
    }
}

WebInspector.documentCanCopy = function(event)
{
    if (this.currentPanel && this.currentPanel.handleCopyEvent)
        event.preventDefault();
}

WebInspector.documentCopy = function(event)
{
    if (this.currentPanel && this.currentPanel.handleCopyEvent)
        this.currentPanel.handleCopyEvent(event);
}

WebInspector.contextMenuEventFired = function(event)
{
    if (event.handled || event.target.hasStyleClass("popup-glasspane"))
        event.preventDefault();
}

WebInspector.animateStyle = function(animations, duration, callback)
{
    var interval;
    var complete = 0;

    const intervalDuration = (1000 / 30); // 30 frames per second.
    const animationsLength = animations.length;
    const propertyUnit = {opacity: ""};
    const defaultUnit = "px";

    function cubicInOut(t, b, c, d)
    {
        if ((t/=d/2) < 1) return c/2*t*t*t + b;
        return c/2*((t-=2)*t*t + 2) + b;
    }

    // Pre-process animations.
    for (var i = 0; i < animationsLength; ++i) {
        var animation = animations[i];
        var element = null, start = null, end = null, key = null;
        for (key in animation) {
            if (key === "element")
                element = animation[key];
            else if (key === "start")
                start = animation[key];
            else if (key === "end")
                end = animation[key];
        }

        if (!element || !end)
            continue;

        if (!start) {
            var computedStyle = element.ownerDocument.defaultView.getComputedStyle(element);
            start = {};
            for (key in end)
                start[key] = parseInt(computedStyle.getPropertyValue(key));
            animation.start = start;
        } else
            for (key in start)
                element.style.setProperty(key, start[key] + (key in propertyUnit ? propertyUnit[key] : defaultUnit));
    }

    function animateLoop()
    {
        // Advance forward.
        complete += intervalDuration;
        var next = complete + intervalDuration;

        // Make style changes.
        for (var i = 0; i < animationsLength; ++i) {
            var animation = animations[i];
            var element = animation.element;
            var start = animation.start;
            var end = animation.end;
            if (!element || !end)
                continue;

            var style = element.style;
            for (key in end) {
                var endValue = end[key];
                if (next < duration) {
                    var startValue = start[key];
                    var newValue = cubicInOut(complete, startValue, endValue - startValue, duration);
                    style.setProperty(key, newValue + (key in propertyUnit ? propertyUnit[key] : defaultUnit));
                } else
                    style.setProperty(key, endValue + (key in propertyUnit ? propertyUnit[key] : defaultUnit));
            }
        }

        // End condition.
        if (complete >= duration) {
            clearInterval(interval);
            if (callback)
                callback();
        }
    }

    interval = setInterval(animateLoop, intervalDuration);
    return interval;
}

WebInspector.updateSearchLabel = function()
{
    if (!this.currentPanel)
        return;

    var newLabel = WebInspector.UIString("Search %s", this.currentPanel.toolbarItemLabel);
    if (this.attached)
        document.getElementById("search").setAttribute("placeholder", newLabel);
    else {
        document.getElementById("search").removeAttribute("placeholder");
        document.getElementById("search-toolbar-label").textContent = newLabel;
    }
}

WebInspector.focusSearchField = function()
{
    var searchField = document.getElementById("search");
    searchField.focus();
    searchField.select();
}

WebInspector.toggleAttach = function()
{
    if (!this.attached)
        InspectorFrontendHost.requestAttachWindow();
    else
        InspectorFrontendHost.requestDetachWindow();
}

WebInspector.toolbarDragStart = function(event)
{
    if ((!WebInspector.attached && WebInspector.platformFlavor !== WebInspector.PlatformFlavor.MacLeopard && WebInspector.platformFlavor !== WebInspector.PlatformFlavor.MacSnowLeopard) || WebInspector.port == "qt")
        return;

    var target = event.target;
    if (target.hasStyleClass("toolbar-item") && target.hasStyleClass("toggleable"))
        return;

    var toolbar = document.getElementById("toolbar");
    if (target !== toolbar && !target.hasStyleClass("toolbar-item"))
        return;

    toolbar.lastScreenX = event.screenX;
    toolbar.lastScreenY = event.screenY;

    WebInspector.elementDragStart(toolbar, WebInspector.toolbarDrag, WebInspector.toolbarDragEnd, event, (WebInspector.attached ? "row-resize" : "default"));
}

WebInspector.toolbarDragEnd = function(event)
{
    var toolbar = document.getElementById("toolbar");

    WebInspector.elementDragEnd(event);

    delete toolbar.lastScreenX;
    delete toolbar.lastScreenY;
}

WebInspector.toolbarDrag = function(event)
{
    var toolbar = document.getElementById("toolbar");

    if (WebInspector.attached) {
        var height = window.innerHeight - (event.screenY - toolbar.lastScreenY);

        InspectorFrontendHost.setAttachedWindowHeight(height);
    } else {
        var x = event.screenX - toolbar.lastScreenX;
        var y = event.screenY - toolbar.lastScreenY;

        // We cannot call window.moveBy here because it restricts the movement
        // of the window at the edges.
        InspectorFrontendHost.moveWindowBy(x, y);
    }

    toolbar.lastScreenX = event.screenX;
    toolbar.lastScreenY = event.screenY;

    event.preventDefault();
}

WebInspector.elementDragStart = function(element, dividerDrag, elementDragEnd, event, cursor)
{
    if (this._elementDraggingEventListener || this._elementEndDraggingEventListener)
        this.elementDragEnd(event);

    this._elementDraggingEventListener = dividerDrag;
    this._elementEndDraggingEventListener = elementDragEnd;

    document.addEventListener("mousemove", dividerDrag, true);
    document.addEventListener("mouseup", elementDragEnd, true);

    document.body.style.cursor = cursor;

    event.preventDefault();
}

WebInspector.elementDragEnd = function(event)
{
    document.removeEventListener("mousemove", this._elementDraggingEventListener, true);
    document.removeEventListener("mouseup", this._elementEndDraggingEventListener, true);

    document.body.style.removeProperty("cursor");

    delete this._elementDraggingEventListener;
    delete this._elementEndDraggingEventListener;

    event.preventDefault();
}

WebInspector.toggleSearchingForNode = function()
{
    if (this.panels.elements) {
        this.showElementsPanel();
        this.panels.elements.toggleSearchingForNode();
    }
}

WebInspector.showConsole = function()
{
    this.drawer.showView(this.console);
}

WebInspector.showChanges = function()
{
    this.drawer.showView(this.changes);
}

WebInspector.showElementsPanel = function()
{
    this.currentPanel = this.panels.elements;
}

WebInspector.showResourcesPanel = function()
{
    this.currentPanel = this.panels.resources;
}

WebInspector.showScriptsPanel = function()
{
    this.currentPanel = this.panels.scripts;
}

WebInspector.showTimelinePanel = function()
{
    this.currentPanel = this.panels.timeline;
}

WebInspector.showProfilesPanel = function()
{
    this.currentPanel = this.panels.profiles;
}

WebInspector.showStoragePanel = function()
{
    this.currentPanel = this.panels.storage;
}

WebInspector.showConsolePanel = function()
{
    this.currentPanel = this.panels.console;
}

WebInspector.showAuditsPanel = function()
{
    this.currentPanel = this.panels.audits;
}

WebInspector.clearConsoleMessages = function()
{
    WebInspector.console.clearMessages();
}

WebInspector.selectDatabase = function(o)
{
    WebInspector.showStoragePanel();
    WebInspector.panels.storage.selectDatabase(o);
}

WebInspector.selectDOMStorage = function(o)
{
    WebInspector.showStoragePanel();
    WebInspector.panels.storage.selectDOMStorage(o);
}

WebInspector.updateResource = function(identifier, payload)
{
    var resource = this.resources[identifier];
    if (!resource) {
        resource = new WebInspector.Resource(identifier, payload.url);
        this.resources[identifier] = resource;
        this.resourceURLMap[resource.url] = resource;
        if (this.panels.resources)
            this.panels.resources.addResource(resource);
        if (this.panels.audits)
            this.panels.audits.resourceStarted(resource);
    }

    if (payload.didRequestChange) {
        resource.domain = payload.host;
        resource.path = payload.path;
        resource.lastPathComponent = payload.lastPathComponent;
        resource.requestHeaders = payload.requestHeaders;
        resource.mainResource = payload.mainResource;
        resource.requestMethod = payload.requestMethod;
        resource.requestFormData = payload.requestFormData;
        resource.documentURL = payload.documentURL;

        if (resource.mainResource)
            this.mainResource = resource;

        var match = payload.documentURL.match(WebInspector.GenericURLRegExp);
        if (match) {
            var protocol = match[1].toLowerCase();
            this._addCookieDomain(match[2]);
            this._addAppCacheDomain(match[2]);
        }
    }

    if (payload.didResponseChange) {
        resource.mimeType = payload.mimeType;
        resource.suggestedFilename = payload.suggestedFilename;
        resource.expectedContentLength = payload.expectedContentLength;
        resource.statusCode = payload.statusCode;
        resource.statusText = payload.statusText;
        resource.suggestedFilename = payload.suggestedFilename;
        resource.responseHeaders = payload.responseHeaders;
        resource.connectionID = payload.connectionID;
        resource.connectionReused = payload.connectionReused;
        resource.timing = payload.timing;
        resource.cached = payload.cached;
    }

    if (payload.didTypeChange) {
        resource.type = payload.type;
    }

    if (payload.didLengthChange) {
        resource.resourceSize = payload.resourceSize;
    }

    if (payload.didCompletionChange) {
        resource.failed = payload.failed;
        resource.finished = payload.finished;
        if (this.panels.audits)
            this.panels.audits.resourceFinished(resource);
    }

    if (payload.didTimingChange) {
        if (payload.startTime)
            resource.startTime = payload.startTime;
        if (payload.responseReceivedTime)
            resource.responseReceivedTime = payload.responseReceivedTime;
        if (payload.endTime)
            resource.endTime = payload.endTime;

        if (payload.loadEventTime) {
            // This loadEventTime is for the main resource, and we want to show it
            // for all resources on this page. This means we want to set it as a member
            // of the resources panel instead of the individual resource.
            if (this.panels.resources)
                this.panels.resources.mainResourceLoadTime = payload.loadEventTime;
            if (this.panels.audits)
                this.panels.audits.mainResourceLoadTime = payload.loadEventTime;
        }

        if (payload.domContentEventTime) {
            // This domContentEventTime is for the main resource, so it should go in
            // the resources panel for the same reasons as above.
            if (this.panels.resources)
                this.panels.resources.mainResourceDOMContentTime = payload.domContentEventTime;
            if (this.panels.audits)
                this.panels.audits.mainResourceDOMContentTime = payload.domContentEventTime;
        }
    }
}

WebInspector.removeResource = function(identifier)
{
    var resource = this.resources[identifier];
    if (!resource)
        return;

    resource.category.removeResource(resource);
    delete this.resourceURLMap[resource.url];
    delete this.resources[identifier];

    if (this.panels.resources)
        this.panels.resources.removeResource(resource);
}

WebInspector.addDatabase = function(payload)
{
    if (!this.panels.storage)
        return;
    var database = new WebInspector.Database(
        payload.id,
        payload.domain,
        payload.name,
        payload.version);
    this.panels.storage.addDatabase(database);
}

WebInspector._addCookieDomain = function(domain)
{
    // Eliminate duplicate domains from the list.
    if (domain in this.cookieDomains)
        return;
    this.cookieDomains[domain] = true;

    if (!this.panels.storage)
        return;
    this.panels.storage.addCookieDomain(domain);
}

WebInspector._addAppCacheDomain = function(domain)
{
    // Eliminate duplicate domains from the list.
    if (domain in this.applicationCacheDomains)
        return;
    this.applicationCacheDomains[domain] = true;

    if (!this.panels.storage)
        return;
    this.panels.storage.addApplicationCache(domain);
}

WebInspector.addDOMStorage = function(payload)
{
    if (!this.panels.storage)
        return;
    var domStorage = new WebInspector.DOMStorage(
        payload.id,
        payload.host,
        payload.isLocalStorage);
    this.panels.storage.addDOMStorage(domStorage);
}

WebInspector.updateDOMStorage = function(storageId)
{
    this.panels.storage.updateDOMStorage(storageId);
}

WebInspector.updateApplicationCacheStatus = function(status)
{
    this.panels.storage.updateApplicationCacheStatus(status);
}

WebInspector.updateNetworkState = function(isNowOnline)
{
    this.panels.storage.updateNetworkState(isNowOnline);
}

WebInspector.resourceTrackingWasEnabled = function()
{
    this.panels.resources.resourceTrackingWasEnabled();
}

WebInspector.resourceTrackingWasDisabled = function()
{
    this.panels.resources.resourceTrackingWasDisabled();
}

WebInspector.searchingForNodeWasEnabled = function()
{
    this.panels.elements.searchingForNodeWasEnabled();
}

WebInspector.searchingForNodeWasDisabled = function()
{
    this.panels.elements.searchingForNodeWasDisabled();
}

WebInspector.monitoringXHRWasEnabled = function()
{
    this.monitoringXHREnabled = true;
}

WebInspector.monitoringXHRWasDisabled = function()
{
    this.monitoringXHREnabled = false;
}

WebInspector.attachDebuggerWhenShown = function()
{
    this.panels.scripts.attachDebuggerWhenShown();
}

WebInspector.debuggerWasEnabled = function()
{
    this.panels.scripts.debuggerWasEnabled();
}

WebInspector.updatePauseOnExceptionsState = function(pauseOnExceptionsState)
{
    this.panels.scripts.updatePauseOnExceptionsState(pauseOnExceptionsState);
}

WebInspector.debuggerWasDisabled = function()
{
    this.panels.scripts.debuggerWasDisabled();
}

WebInspector.profilerWasEnabled = function()
{
    this.panels.profiles.profilerWasEnabled();
}

WebInspector.profilerWasDisabled = function()
{
    this.panels.profiles.profilerWasDisabled();
}

WebInspector.parsedScriptSource = function(sourceID, sourceURL, source, startingLine, scriptWorldType)
{
    this.panels.scripts.addScript(sourceID, sourceURL, source, startingLine, undefined, undefined, scriptWorldType);
}

WebInspector.restoredBreakpoint = function(sourceID, sourceURL, line, enabled, condition)
{
    this.breakpointManager.restoredBreakpoint(sourceID, sourceURL, line, enabled, condition);
}

WebInspector.failedToParseScriptSource = function(sourceURL, source, startingLine, errorLine, errorMessage)
{
    this.panels.scripts.addScript(null, sourceURL, source, startingLine, errorLine, errorMessage);
}

WebInspector.pausedScript = function(callFrames)
{
    this.panels.scripts.debuggerPaused(callFrames);
}

WebInspector.resumedScript = function()
{
    this.panels.scripts.debuggerResumed();
}

WebInspector.populateInterface = function()
{
    for (var panelName in this.panels) {
        var panel = this.panels[panelName];
        if ("populateInterface" in panel)
            panel.populateInterface();
    }
}

WebInspector.reset = function()
{
    for (var panelName in this.panels) {
        var panel = this.panels[panelName];
        if ("reset" in panel)
            panel.reset();
    }

    this.sessionSettings.reset();
    this.breakpointManager.reset();

    for (var category in this.resourceCategories)
        this.resourceCategories[category].removeAllResources();

    this.resources = {};
    this.resourceURLMap = {};
    this.cookieDomains = {};
    this.applicationCacheDomains = {};
    this.hoveredDOMNode = null;

    delete this.mainResource;

    this.console.clearMessages();
}

WebInspector.resetProfilesPanel = function()
{
    if (WebInspector.panels.profiles)
        WebInspector.panels.profiles.resetProfiles();
}

WebInspector.bringToFront = function()
{
    InspectorFrontendHost.bringToFront();
}

WebInspector.inspectedURLChanged = function(url)
{
    InspectorFrontendHost.inspectedURLChanged(url);
}

WebInspector.resourceURLChanged = function(resource, oldURL)
{
    delete this.resourceURLMap[oldURL];
    this.resourceURLMap[resource.url] = resource;
}

WebInspector.didCommitLoad = function()
{
    // Cleanup elements panel early on inspected page refresh.
    WebInspector.setDocument(null);
}

WebInspector.updateConsoleMessageExpiredCount = function(count)
{
    var message = String.sprintf(WebInspector.UIString("%d console messages are not shown."), count);
    WebInspector.console.addMessage(WebInspector.ConsoleMessage.createTextMessage(message, WebInspector.ConsoleMessage.MessageLevel.Warning));
}

WebInspector.addConsoleMessage = function(payload)
{
    var consoleMessage = new WebInspector.ConsoleMessage(
        payload.source,
        payload.type,
        payload.level,
        payload.line,
        payload.url,
        payload.groupLevel,
        payload.repeatCount,
        payload.message,
        payload.parameters,
        payload.stackTrace);
    this.console.addMessage(consoleMessage);
}

WebInspector.updateConsoleMessageRepeatCount = function(count)
{
    this.console.updateMessageRepeatCount(count);
}

WebInspector.log = function(message, messageLevel)
{
    // remember 'this' for setInterval() callback
    var self = this;

    // return indication if we can actually log a message
    function isLogAvailable()
    {
        return WebInspector.ConsoleMessage && WebInspector.ObjectProxy && self.console;
    }

    // flush the queue of pending messages
    function flushQueue()
    {
        var queued = WebInspector.log.queued;
        if (!queued)
            return;

        for (var i = 0; i < queued.length; ++i)
            logMessage(queued[i]);

        delete WebInspector.log.queued;
    }

    // flush the queue if it console is available
    // - this function is run on an interval
    function flushQueueIfAvailable()
    {
        if (!isLogAvailable())
            return;

        clearInterval(WebInspector.log.interval);
        delete WebInspector.log.interval;

        flushQueue();
    }

    // actually log the message
    function logMessage(message)
    {
        var repeatCount = 1;
        if (message == WebInspector.log.lastMessage)
            repeatCount = WebInspector.log.repeatCount + 1;

        WebInspector.log.lastMessage = message;
        WebInspector.log.repeatCount = repeatCount;

        // ConsoleMessage expects a proxy object
        message = new WebInspector.ObjectProxy(null, null, [], message, false);

        // post the message
        var msg = new WebInspector.ConsoleMessage(
            WebInspector.ConsoleMessage.MessageSource.Other,
            WebInspector.ConsoleMessage.MessageType.Log,
            messageLevel || WebInspector.ConsoleMessage.MessageLevel.Debug,
            -1,
            null,
            null,
            repeatCount,
            null,
            [message],
            null);

        self.console.addMessage(msg);
    }

    // if we can't log the message, queue it
    if (!isLogAvailable()) {
        if (!WebInspector.log.queued)
            WebInspector.log.queued = [];

        WebInspector.log.queued.push(message);

        if (!WebInspector.log.interval)
            WebInspector.log.interval = setInterval(flushQueueIfAvailable, 1000);

        return;
    }

    // flush the pending queue if any
    flushQueue();

    // log the message
    logMessage(message);
}

WebInspector.addProfileHeader = function(profile)
{
    this.panels.profiles.addProfileHeader(profile);
}

WebInspector.setRecordingProfile = function(isProfiling)
{
    this.panels.profiles.getProfileType(WebInspector.CPUProfileType.TypeId).setRecordingProfile(isProfiling);
    if (this._previousIsProfiling !== isProfiling) {
        if (!this._temporaryRecordingProfile) {
            this._temporaryRecordingProfile = {
                typeId: WebInspector.CPUProfileType.TypeId,
                title: WebInspector.UIString("Recording…"),
                uid: -1,
                isTemporary: true
            };
        }
        this._previousIsProfiling = isProfiling;
        if (isProfiling)
            this.panels.profiles.addProfileHeader(this._temporaryRecordingProfile);
        else
            this.panels.profiles.removeProfileHeader(this._temporaryRecordingProfile);
    }
    this.panels.profiles.updateProfileTypeButtons();
}

WebInspector.drawLoadingPieChart = function(canvas, percent) {
    var g = canvas.getContext("2d");
    var darkColor = "rgb(122, 168, 218)";
    var lightColor = "rgb(228, 241, 251)";
    var cx = 8;
    var cy = 8;
    var r = 7;

    g.beginPath();
    g.arc(cx, cy, r, 0, Math.PI * 2, false);
    g.closePath();

    g.lineWidth = 1;
    g.strokeStyle = darkColor;
    g.fillStyle = lightColor;
    g.fill();
    g.stroke();

    var startangle = -Math.PI / 2;
    var endangle = startangle + (percent * Math.PI * 2);

    g.beginPath();
    g.moveTo(cx, cy);
    g.arc(cx, cy, r, startangle, endangle, false);
    g.closePath();

    g.fillStyle = darkColor;
    g.fill();
}

WebInspector.updateFocusedNode = function(nodeId)
{
    var node = WebInspector.domAgent.nodeForId(nodeId);
    if (!node)
        // FIXME: Should we deselect if null is passed in?
        return;

    this.currentPanel = this.panels.elements;
    this.panels.elements.focusedDOMNode = node;
}

WebInspector.displayNameForURL = function(url)
{
    if (!url)
        return "";
    var resource = this.resourceURLMap[url];
    if (resource)
        return resource.displayName;

    if (!WebInspector.mainResource)
        return url.trimURL("");

    var lastPathComponent = WebInspector.mainResource.lastPathComponent;
    var index = WebInspector.mainResource.url.indexOf(lastPathComponent);
    if (index !== -1 && index + lastPathComponent.length === WebInspector.mainResource.url.length) {
        var baseURL = WebInspector.mainResource.url.substring(0, index);
        if (url.indexOf(baseURL) === 0)
            return url.substring(index);
    }

    return url.trimURL(WebInspector.mainResource.domain);
}

WebInspector.resourceForURL = function(url)
{
    if (url in this.resourceURLMap)
        return this.resourceURLMap[url];

    // No direct match found. Search for resources that contain
    // a substring of the URL.
    for (var resourceURL in this.resourceURLMap) {
        if (resourceURL.hasSubstring(url))
            return this.resourceURLMap[resourceURL];
    }

    return null;
}

WebInspector._choosePanelToShowSourceLine = function(url, line, preferredPanel)
{
    preferredPanel = preferredPanel || "resources";
    var panel = this.panels[preferredPanel];
    if (panel && panel.canShowSourceLine(url, line))
        return panel;
    panel = this.panels.resources;
    return panel.canShowSourceLine(url, line) ? panel : null;
}

WebInspector.canShowSourceLine = function(url, line, preferredPanel)
{
    return !!this._choosePanelToShowSourceLine(url, line, preferredPanel);
}

WebInspector.showSourceLine = function(url, line, preferredPanel)
{
    this.currentPanel = this._choosePanelToShowSourceLine(url, line, preferredPanel);
    if (!this.currentPanel)
        return false;
    this.currentPanel.showSourceLine(url, line);
    return true;
}

WebInspector.linkifyStringAsFragment = function(string)
{
    var container = document.createDocumentFragment();
    var linkStringRegEx = /(?:[a-zA-Z][a-zA-Z0-9+.-]{2,}:\/\/|www\.)[\w$\-_+*'=\|\/\\(){}[\]%@&#~,:;.!?]{2,}[\w$\-_+*=\|\/\\({%@&#~]/;

    while (string) {
        var linkString = linkStringRegEx.exec(string);
        if (!linkString)
            break;

        linkString = linkString[0];
        var title = linkString;
        var linkIndex = string.indexOf(linkString);
        var nonLink = string.substring(0, linkIndex);
        container.appendChild(document.createTextNode(nonLink));

        var profileStringMatches = WebInspector.ProfileType.URLRegExp.exec(title);
        if (profileStringMatches)
            title = WebInspector.panels.profiles.displayTitleForProfileLink(profileStringMatches[2], profileStringMatches[1]);

        var realURL = (linkString.indexOf("www.") === 0 ? "http://" + linkString : linkString);
        container.appendChild(WebInspector.linkifyURLAsNode(realURL, title, null, (realURL in WebInspector.resourceURLMap)));
        string = string.substring(linkIndex + linkString.length, string.length);
    }

    if (string)
        container.appendChild(document.createTextNode(string));

    return container;
}

WebInspector.showProfileForURL = function(url)
{
    WebInspector.showProfilesPanel();
    WebInspector.panels.profiles.showProfileForURL(url);
}

WebInspector.linkifyURLAsNode = function(url, linkText, classes, isExternal, tooltipText)
{
    if (!linkText)
        linkText = url;
    classes = (classes ? classes + " " : "");
    classes += isExternal ? "webkit-html-external-link" : "webkit-html-resource-link";

    var a = document.createElement("a");
    a.href = url;
    a.className = classes;
    if (typeof tooltipText === "undefined")
        a.title = url;
    else if (typeof tooltipText !== "string" || tooltipText.length)
        a.title = tooltipText;
    a.target = "_blank";
    a.textContent = linkText;

    return a;
}

WebInspector.linkifyURL = function(url, linkText, classes, isExternal, tooltipText)
{
    // Use the DOM version of this function so as to avoid needing to escape attributes.
    // FIXME:  Get rid of linkifyURL entirely.
    return WebInspector.linkifyURLAsNode(url, linkText, classes, isExternal, tooltipText).outerHTML;
}

WebInspector.linkifyResourceAsNode = function(url, preferredPanel, lineNumber, classes, tooltipText)
{
    var linkText = WebInspector.displayNameForURL(url);
    if (lineNumber)
        linkText += ":" + lineNumber;
    var node = WebInspector.linkifyURLAsNode(url, linkText, classes, false, tooltipText);
    node.lineNumber = lineNumber;
    node.preferredPanel = preferredPanel;
    return node;
}

WebInspector.completeURL = function(baseURL, href)
{
    var match = baseURL.match(WebInspector.URLRegExp);
    if (match) {
        var path = href;
        if (path.charAt(0) !== "/") {
            var basePath = match[4] || "/";
            path = basePath.substring(0, basePath.lastIndexOf("/")) + "/" + path;
        }
        return match[1] + "://" + match[2] + (match[3] ? (":" + match[3]) : "") + path;
    }
    return null;
}

WebInspector.addMainEventListeners = function(doc)
{
    doc.defaultView.addEventListener("focus", this.windowFocused.bind(this), false);
    doc.defaultView.addEventListener("blur", this.windowBlurred.bind(this), false);
    doc.addEventListener("click", this.documentClick.bind(this), true);
    doc.addEventListener("mouseover", this.documentMouseOver.bind(this), true);
}

WebInspector._searchFieldManualFocus = function(event)
{
    this.currentFocusElement = event.target;
    this._previousFocusElement = event.target;
}

WebInspector._searchKeyDown = function(event)
{
    // Escape Key will clear the field and clear the search results
    if (event.keyCode === WebInspector.KeyboardShortcut.Keys.Esc.code) {
        // If focus belongs here and text is empty - nothing to do, return unhandled.
        if (event.target.value === "" && this.currentFocusElement === this.previousFocusElement)
            return;
        event.preventDefault();
        event.stopPropagation();
        // When search was selected manually and is currently blank, we'd like Esc stay unhandled
        // and hit console drawer handler.
        event.target.value = "";

        this.performSearch(event);
        this.currentFocusElement = this.previousFocusElement;
        if (this.currentFocusElement === event.target)
            this.currentFocusElement.select();
        return false;
    }

    if (!isEnterKey(event))
        return false;

    // Select all of the text so the user can easily type an entirely new query.
    event.target.select();

    // Only call performSearch if the Enter key was pressed. Otherwise the search
    // performance is poor because of searching on every key. The search field has
    // the incremental attribute set, so we still get incremental searches.
    this.performSearch(event);

    // Call preventDefault since this was the Enter key. This prevents a "search" event
    // from firing for key down. This stops performSearch from being called twice in a row.
    event.preventDefault();
}

WebInspector.performSearch = function(event)
{
    var query = event.target.value;
    var forceSearch = event.keyIdentifier === "Enter";
    var isShortSearch = (query.length < 3);

    // Clear a leftover short search flag due to a non-conflicting forced search.
    if (isShortSearch && this.shortSearchWasForcedByKeyEvent && this.currentQuery !== query)
        delete this.shortSearchWasForcedByKeyEvent;

    // Indicate this was a forced search on a short query.
    if (isShortSearch && forceSearch)
        this.shortSearchWasForcedByKeyEvent = true;

    if (!query || !query.length || (!forceSearch && isShortSearch)) {
        // Prevent clobbering a short search forced by the user.
        if (this.shortSearchWasForcedByKeyEvent) {
            delete this.shortSearchWasForcedByKeyEvent;
            return;
        }

        delete this.currentQuery;

        for (var panelName in this.panels) {
            var panel = this.panels[panelName];
            if (panel.currentQuery && panel.searchCanceled)
                panel.searchCanceled();
            delete panel.currentQuery;
        }

        this.updateSearchMatchesCount();

        return;
    }

    if (query === this.currentPanel.currentQuery && this.currentPanel.currentQuery === this.currentQuery) {
        // When this is the same query and a forced search, jump to the next
        // search result for a good user experience.
        if (forceSearch) {
            var backward = event.shiftKey;
            if (!backward && this.currentPanel.jumpToNextSearchResult)
                this.currentPanel.jumpToNextSearchResult();
            else if (backward && this.currentPanel.jumpToPreviousSearchResult)
                this.currentPanel.jumpToPreviousSearchResult();
        }
        return;
    }

    this.currentQuery = query;

    this.updateSearchMatchesCount();

    if (!this.currentPanel.performSearch)
        return;

    this.currentPanel.currentQuery = query;
    this.currentPanel.performSearch(query);
}

WebInspector.addNodesToSearchResult = function(nodeIds)
{
    WebInspector.panels.elements.addNodesToSearchResult(nodeIds);
}

WebInspector.updateSearchMatchesCount = function(matches, panel)
{
    if (!panel)
        panel = this.currentPanel;

    panel.currentSearchMatches = matches;

    if (panel !== this.currentPanel)
        return;

    if (!this.currentPanel.currentQuery) {
        document.getElementById("search-results-matches").addStyleClass("hidden");
        return;
    }

    if (matches) {
        if (matches === 1)
            var matchesString = WebInspector.UIString("1 match");
        else
            var matchesString = WebInspector.UIString("%d matches", matches);
    } else
        var matchesString = WebInspector.UIString("Not Found");

    var matchesToolbarElement = document.getElementById("search-results-matches");
    matchesToolbarElement.removeStyleClass("hidden");
    matchesToolbarElement.textContent = matchesString;
}

WebInspector.UIString = function(string)
{
    if (window.localizedStrings && string in window.localizedStrings)
        string = window.localizedStrings[string];
    else {
        if (!(string in WebInspector.missingLocalizedStrings)) {
            if (!WebInspector.InspectorBackendStub)
                console.error("Localized string \"" + string + "\" not found.");
            WebInspector.missingLocalizedStrings[string] = true;
        }

        if (Preferences.showMissingLocalizedStrings)
            string += " (not localized)";
    }

    return String.vsprintf(string, Array.prototype.slice.call(arguments, 1));
}

WebInspector.isMac = function()
{
    if (!("_isMac" in this))
        this._isMac = WebInspector.platform === "mac";

    return this._isMac;
}

WebInspector.isBeingEdited = function(element)
{
    return element.__editing;
}

WebInspector.isEditingAnyField = function()
{
    return this.__editing;
}

WebInspector.startEditing = function(element, committedCallback, cancelledCallback, context, multiline)
{
    if (element.__editing)
        return;
    element.__editing = true;
    WebInspector.__editing = true;

    var oldText = getContent(element);
    var moveDirection = "";

    element.addStyleClass("editing");

    var oldTabIndex = element.tabIndex;
    if (element.tabIndex < 0)
        element.tabIndex = 0;

    function blurEventListener() {
        editingCommitted.call(element);
    }

    function getContent(element) {
        if (element.tagName === "INPUT" && element.type === "text")
            return element.value;
        else
            return element.textContent;
    }

    function cleanUpAfterEditing() {
        delete this.__editing;
        delete WebInspector.__editing;

        this.removeStyleClass("editing");
        this.tabIndex = oldTabIndex;
        this.scrollTop = 0;
        this.scrollLeft = 0;

        element.removeEventListener("blur", blurEventListener, false);
        element.removeEventListener("keydown", keyDownEventListener, true);

        if (element === WebInspector.currentFocusElement || element.isAncestor(WebInspector.currentFocusElement))
            WebInspector.currentFocusElement = WebInspector.previousFocusElement;
    }

    function editingCancelled() {
        if (this.tagName === "INPUT" && this.type === "text")
            this.value = oldText;
        else
            this.textContent = oldText;

        cleanUpAfterEditing.call(this);

        if (cancelledCallback)
            cancelledCallback(this, context);
    }

    function editingCommitted() {
        cleanUpAfterEditing.call(this);

        if (committedCallback)
            committedCallback(this, getContent(this), oldText, context, moveDirection);
    }

    function keyDownEventListener(event) {
        var isMetaOrCtrl = WebInspector.isMac() ?
            event.metaKey && !event.shiftKey && !event.ctrlKey && !event.altKey :
            event.ctrlKey && !event.shiftKey && !event.metaKey && !event.altKey;
        if (isEnterKey(event) && (!multiline || isMetaOrCtrl)) {
            editingCommitted.call(element);
            event.preventDefault();
            event.stopPropagation();
        } else if (event.keyCode === WebInspector.KeyboardShortcut.Keys.Esc.code) {
            editingCancelled.call(element);
            event.preventDefault();
            event.stopPropagation();
        } else if (event.keyIdentifier === "U+0009") // Tab key
            moveDirection = (event.shiftKey ? "backward" : "forward");
    }

    element.addEventListener("blur", blurEventListener, false);
    element.addEventListener("keydown", keyDownEventListener, true);

    WebInspector.currentFocusElement = element;
    return {
        cancel: editingCancelled.bind(element),
        commit: editingCommitted.bind(element)
    };
}

WebInspector._toolbarItemClicked = function(event)
{
    var toolbarItem = event.currentTarget;
    this.currentPanel = toolbarItem.panel;
}

// This table maps MIME types to the Resource.Types which are valid for them.
// The following line:
//    "text/html":                {0: 1},
// means that text/html is a valid MIME type for resources that have type
// WebInspector.Resource.Type.Document (which has a value of 0).
WebInspector.MIMETypes = {
    "text/html":                   {0: true},
    "text/xml":                    {0: true},
    "text/plain":                  {0: true},
    "application/xhtml+xml":       {0: true},
    "text/css":                    {1: true},
    "text/xsl":                    {1: true},
    "image/jpeg":                  {2: true},
    "image/png":                   {2: true},
    "image/gif":                   {2: true},
    "image/bmp":                   {2: true},
    "image/vnd.microsoft.icon":    {2: true},
    "image/x-icon":                {2: true},
    "image/x-xbitmap":             {2: true},
    "font/ttf":                    {3: true},
    "font/opentype":               {3: true},
    "application/x-font-type1":    {3: true},
    "application/x-font-ttf":      {3: true},
    "application/x-truetype-font": {3: true},
    "text/javascript":             {4: true},
    "text/ecmascript":             {4: true},
    "application/javascript":      {4: true},
    "application/ecmascript":      {4: true},
    "application/x-javascript":    {4: true},
    "text/javascript1.1":          {4: true},
    "text/javascript1.2":          {4: true},
    "text/javascript1.3":          {4: true},
    "text/jscript":                {4: true},
    "text/livescript":             {4: true},
}

WebInspector.PanelHistory = function()
{
    this._history = [];
    this._historyIterator = -1;
}

WebInspector.PanelHistory.prototype = {
    canGoBack: function()
    {
        return this._historyIterator > 0;
    },

    goBack: function()
    {
        this._inHistory = true;
        WebInspector.currentPanel = WebInspector.panels[this._history[--this._historyIterator]];
        delete this._inHistory;
    },

    canGoForward: function()
    {
        return this._historyIterator < this._history.length - 1;
    },

    goForward: function()
    {
        this._inHistory = true;
        WebInspector.currentPanel = WebInspector.panels[this._history[++this._historyIterator]];
        delete this._inHistory;
    },

    setPanel: function(panelName)
    {
        if (this._inHistory)
            return;

        this._history.splice(this._historyIterator + 1, this._history.length - this._historyIterator - 1);
        if (!this._history.length || this._history[this._history.length - 1] !== panelName)
            this._history.push(panelName);
        this._historyIterator = this._history.length - 1;
    }
}
