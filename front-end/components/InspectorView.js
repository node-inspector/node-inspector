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
 * @extends {WebInspector.VBox}
 */
WebInspector.InspectorView = function()
{
    WebInspector.VBox.call(this);
    WebInspector.Dialog.setModalHostView(this);
    WebInspector.GlassPane.DefaultFocusedViewStack.push(this);
    this.setMinimumSize(180, 72);

    // DevTools sidebar is a vertical split of panels tabbed pane and a drawer.
    this._drawerSplitView = new WebInspector.SplitView(false, true, "Inspector.drawerSplitViewState", 200, 200);
    this._drawerSplitView.hideSidebar();
    this._drawerSplitView.enableShowModeSaving();
    this._drawerSplitView.show(this.element);

    this._tabbedPane = new WebInspector.TabbedPane();
    this._tabbedPane.setRetainTabOrder(true);
    this._drawerSplitView.setMainView(this._tabbedPane);
    this._drawer = new WebInspector.Drawer(this._drawerSplitView);

    // Patch tabbed pane header with toolbar actions.
    this._toolbarElement = createElement("div");
    this._toolbarElement.className = "toolbar toolbar-background toolbar-colors";
    var headerElement = this._tabbedPane.headerElement();
    headerElement.parentElement.insertBefore(this._toolbarElement, headerElement);

    this._leftToolbar = new WebInspector.StatusBar(this._toolbarElement);
    this._leftToolbar.element.classList.add("toolbar-left");
    this._leftToolbar.makeNarrow();
    this._toolbarElement.appendChild(headerElement);
    this._rightToolbar = new WebInspector.StatusBar(this._toolbarElement);

    this._closeButtonToolbarItem = createElementWithClass("div", "toolbar-close-button-item");
    var closeButtonElement = this._closeButtonToolbarItem.createChild("div", "close-button");
    closeButtonElement.addEventListener("click", InspectorFrontendHost.closeWindow.bind(InspectorFrontendHost), true);
    this._toolbarElement.appendChild(this._closeButtonToolbarItem);

    this._panels = {};
    // Used by tests.
    WebInspector["panels"] = this._panels;

    this._history = [];
    this._historyIterator = -1;
    this._keyDownBound = this._keyDown.bind(this);
    this._keyPressBound = this._keyPress.bind(this);
    /** @type {!Object.<string, !WebInspector.PanelDescriptor>} */
    this._panelDescriptors = {};
    /** @type {!Object.<string, !Promise.<!WebInspector.Panel> >} */
    this._panelPromises = {};

    // Windows and Mac have two different definitions of '[' and ']', so accept both of each.
    this._openBracketIdentifiers = ["U+005B", "U+00DB"].keySet();
    this._closeBracketIdentifiers = ["U+005D", "U+00DD"].keySet();
    this._lastActivePanelSetting = WebInspector.settings.createSetting("lastActivePanel", "elements");

    InspectorFrontendHost.events.addEventListener(InspectorFrontendHostAPI.Events.ShowConsole, showConsole.bind(this));
    this._loadPanelDesciptors();

    /**
     * @this {WebInspector.InspectorView}
     */
    function showConsole()
    {
        this.showPanel("console").done();
    }

    WebInspector.targetManager.addEventListener(WebInspector.TargetManager.Events.SuspendStateChanged, this._onSuspendStateChanged.bind(this));
};

WebInspector.InspectorView.prototype = {
    wasShown: function()
    {
        this.element.ownerDocument.addEventListener("keydown", this._keyDownBound, false);
        this.element.ownerDocument.addEventListener("keypress", this._keyPressBound, false);
    },

    willHide: function()
    {
        this.element.ownerDocument.removeEventListener("keydown", this._keyDownBound, false);
        this.element.ownerDocument.removeEventListener("keypress", this._keyPressBound, false);
    },

    _loadPanelDesciptors: function()
    {
        WebInspector.startBatchUpdate();
        self.runtime.extensions(WebInspector.PanelFactory).forEach(processPanelExtensions.bind(this));
        /**
         * @param {!Runtime.Extension} extension
         * @this {!WebInspector.InspectorView}
         */
        function processPanelExtensions(extension)
        {
            this.addPanel(new WebInspector.RuntimeExtensionPanelDescriptor(extension));
        }
        WebInspector.endBatchUpdate();
    },

    /**
     * @param {!WebInspector.StatusBarItem} item
     */
    appendToLeftToolbar: function(item)
    {
        this._leftToolbar.appendStatusBarItem(item);
    },

    /**
     * @param {!WebInspector.StatusBarItem} item
     */
    appendToRightToolbar: function(item)
    {
        this._rightToolbar.appendStatusBarItem(item);
    },

    /**
     * @param {!WebInspector.PanelDescriptor} panelDescriptor
     */
    addPanel: function(panelDescriptor)
    {
        var panelName = panelDescriptor.name();
        this._panelDescriptors[panelName] = panelDescriptor;
        this._tabbedPane.appendTab(panelName, panelDescriptor.title(), new WebInspector.View());
        if (this._lastActivePanelSetting.get() === panelName)
            this._tabbedPane.selectTab(panelName);
    },

    /**
     * @param {string} panelName
     * @return {boolean}
     */
    hasPanel: function(panelName)
    {
        return !!this._panelDescriptors[panelName];
    },

    /**
     * @param {string} panelName
     * @return {!Promise.<!WebInspector.Panel>}
     */
    panel: function(panelName)
    {
        var panelDescriptor = this._panelDescriptors[panelName];
        if (!panelDescriptor)
            return Promise.rejectWithError("Can't load panel without the descriptor: " + panelName);

        var promise = this._panelPromises[panelName];
        if (promise)
            return promise;

        promise = panelDescriptor.panel();
        this._panelPromises[panelName] = promise;

        promise.then(cachePanel.bind(this));

        /**
         * @param {!WebInspector.Panel} panel
         * @return {!WebInspector.Panel}
         * @this {WebInspector.InspectorView}
         */
        function cachePanel(panel)
        {
            delete this._panelPromises[panelName];
            this._panels[panelName] = panel;
            return panel;
        }
        return promise;
    },

    /**
     * @param {!WebInspector.Event} event
     */
    _onSuspendStateChanged: function(event)
    {
        this._currentPanelLocked = WebInspector.targetManager.allTargetsSuspended();
        this._tabbedPane.setCurrentTabLocked(this._currentPanelLocked);
        this._leftToolbar.setEnabled(!this._currentPanelLocked);
        this._rightToolbar.setEnabled(!this._currentPanelLocked);
    },

    /**
     * The returned Promise is resolved with null if another showPanel()
     * gets called while this.panel(panelName) Promise is in flight.
     *
     * @param {string} panelName
     * @return {!Promise.<?WebInspector.Panel>}
     */
    showPanel: function(panelName)
    {
        if (this._currentPanelLocked)
            return this._currentPanel === this._panels[panelName] ? Promise.resolve(this._currentPanel) : Promise.rejectWithError("Current panel locked");

        this._panelForShowPromise = this.panel(panelName);
        return this._panelForShowPromise.then(setCurrentPanelIfNecessary.bind(this, this._panelForShowPromise));

        /**
         * @param {!Promise.<!WebInspector.Panel>} panelPromise
         * @param {!WebInspector.Panel} panel
         * @return {?WebInspector.Panel}
         * @this {WebInspector.InspectorView}
         */
        function setCurrentPanelIfNecessary(panelPromise, panel)
        {
            if (this._panelForShowPromise !== panelPromise)
                return null;

            this.setCurrentPanel(panel);
            return panel;
        }
    },

    /**
     * @return {!WebInspector.Panel}
     */
    currentPanel: function()
    {
        return this._currentPanel;
    },

    showInitialPanel: function()
    {
        if (InspectorFrontendHost.isUnderTest())
            return;
        this._showInitialPanel();
    },

    _showInitialPanel: function()
    {
        this._tabbedPane.addEventListener(WebInspector.TabbedPane.EventTypes.TabSelected, this._tabSelected, this);
        this._tabSelected();
        this._drawer.initialPanelShown();
    },

    /**
     * @param {string} panelName
     */
    showInitialPanelForTest: function(panelName)
    {
        this._tabbedPane.addEventListener(WebInspector.TabbedPane.EventTypes.TabSelected, this._tabSelected, this);
        this.setCurrentPanel(this._panels[panelName]);
        this._drawer.initialPanelShown();
    },

    _tabSelected: function()
    {
        var panelName = this._tabbedPane.selectedTabId;
        if (!panelName)
            return;

        this.showPanel(panelName).done();
    },

    /**
     * @param {!WebInspector.Panel} panel
     * @return {!WebInspector.Panel}
     */
    setCurrentPanel: function(panel)
    {
        delete this._panelForShowPromise;

        if (this._currentPanelLocked) {
            console.error("Current panel is locked");
            return this._currentPanel;
        }
        InspectorFrontendHost.bringToFront();

        if (this._currentPanel === panel)
            return panel;

        this._currentPanel = panel;
        if (!this._panels[panel.name])
            this._panels[panel.name] = panel;
        this._tabbedPane.changeTabView(panel.name, panel);
        this._tabbedPane.removeEventListener(WebInspector.TabbedPane.EventTypes.TabSelected, this._tabSelected, this);
        this._tabbedPane.selectTab(panel.name);
        this._tabbedPane.addEventListener(WebInspector.TabbedPane.EventTypes.TabSelected, this._tabSelected, this);

        this._lastActivePanelSetting.set(panel.name);
        this._pushToHistory(panel.name);
        WebInspector.userMetrics.panelShown(panel.name);
        panel.focus();
        return panel;
    },

    /**
     * @param {string} id
     */
    closeViewInDrawer: function(id)
    {
        this._drawer.closeView(id);
    },

    /**
     * @param {string} id
     * @param {string} title
     * @param {!WebInspector.View} view
     */
    showCloseableViewInDrawer: function(id, title, view)
    {
        this._drawer.showCloseableView(id, title, view);
    },

    showDrawer: function()
    {
        this._drawer.showDrawer();
    },

    /**
     * @return {boolean}
     */
    drawerVisible: function()
    {
        return this._drawer.isShowing();
    },

    /**
     * @param {string} id
     * @param {boolean=} immediate
     */
    showViewInDrawer: function(id, immediate)
    {
        this._drawer.showView(id, immediate);
    },

    /**
     * @return {?string}
     */
    selectedViewInDrawer: function()
    {
        return this._drawer.selectedViewId();
    },

    closeDrawer: function()
    {
        this._drawer.closeDrawer();
    },

    /**
     * @return {!Element}
     */
    defaultFocusedElement: function()
    {
        return this._currentPanel ? this._currentPanel.defaultFocusedElement() : null;
    },

    _keyPress: function(event)
    {
        // BUG 104250: Windows 7 posts a WM_CHAR message upon the Ctrl+']' keypress.
        // Any charCode < 32 is not going to be a valid keypress.
        if (event.charCode < 32 && WebInspector.isWin())
            return;
        clearTimeout(this._keyDownTimer);
        delete this._keyDownTimer;
    },

    _keyDown: function(event)
    {
        if (!WebInspector.KeyboardShortcut.eventHasCtrlOrMeta(event))
            return;

        var keyboardEvent = /** @type {!KeyboardEvent} */ (event);
        // Ctrl/Cmd + 1-9 should show corresponding panel.
        var panelShortcutEnabled = WebInspector.settings.shortcutPanelSwitch.get();
        if (panelShortcutEnabled && !event.shiftKey && !event.altKey) {
            var panelIndex = -1;
            if (event.keyCode > 0x30 && event.keyCode < 0x3A)
                panelIndex = event.keyCode - 0x31;
            else if (event.keyCode > 0x60 && event.keyCode < 0x6A && keyboardEvent.location === KeyboardEvent.DOM_KEY_LOCATION_NUMPAD)
                panelIndex = event.keyCode - 0x61;
            if (panelIndex !== -1) {
                var panelName = this._tabbedPane.allTabs()[panelIndex];
                if (panelName) {
                    if (!WebInspector.Dialog.currentInstance() && !this._currentPanelLocked)
                        this.showPanel(panelName).done();
                    event.consume(true);
                }
                return;
            }
        }

        // BUG85312: On French AZERTY keyboards, AltGr-]/[ combinations (synonymous to Ctrl-Alt-]/[ on Windows) are used to enter ]/[,
        // so for a ]/[-related keydown we delay the panel switch using a timer, to see if there is a keypress event following this one.
        // If there is, we cancel the timer and do not consider this a panel switch.
        if (!WebInspector.isWin() || (!this._openBracketIdentifiers[event.keyIdentifier] && !this._closeBracketIdentifiers[event.keyIdentifier])) {
            this._keyDownInternal(event);
            return;
        }

        this._keyDownTimer = setTimeout(this._keyDownInternal.bind(this, event), 0);
    },

    _keyDownInternal: function(event)
    {
        if (this._currentPanelLocked)
            return;

        var direction = 0;

        if (this._openBracketIdentifiers[event.keyIdentifier])
            direction = -1;

        if (this._closeBracketIdentifiers[event.keyIdentifier])
            direction = 1;

        if (!direction)
            return;

        if (!event.shiftKey && !event.altKey) {
            if (!WebInspector.Dialog.currentInstance())
                this._changePanelInDirection(direction);
            event.consume(true);
            return;
        }

        if (event.altKey && this._moveInHistory(direction))
            event.consume(true)
    },

    /**
     * @param {number} direction
     */
    _changePanelInDirection: function(direction)
    {
        var panelOrder = this._tabbedPane.allTabs();
        var index = panelOrder.indexOf(this.currentPanel().name);
        index = (index + panelOrder.length + direction) % panelOrder.length;
        this.showPanel(panelOrder[index]).done();
    },

    /**
     * @param {number} move
     */
    _moveInHistory: function(move)
    {
        var newIndex = this._historyIterator + move;
        if (newIndex >= this._history.length || newIndex < 0)
            return false;

        this._inHistory = true;
        this._historyIterator = newIndex;
        if (!WebInspector.Dialog.currentInstance())
            this.setCurrentPanel(this._panels[this._history[this._historyIterator]]);
        delete this._inHistory;

        return true;
    },

    _pushToHistory: function(panelName)
    {
        if (this._inHistory)
            return;

        this._history.splice(this._historyIterator + 1, this._history.length - this._historyIterator - 1);
        if (!this._history.length || this._history[this._history.length - 1] !== panelName)
            this._history.push(panelName);
        this._historyIterator = this._history.length - 1;
    },

    onResize: function()
    {
        WebInspector.Dialog.modalHostRepositioned();
    },

    /**
     * @return {!Element}
     */
    topResizerElement: function()
    {
        return this._tabbedPane.headerElement();
    },

    toolbarItemResized: function()
    {
        this._tabbedPane.headerResized();
    },

    __proto__: WebInspector.VBox.prototype
};

/**
 * @type {!WebInspector.InspectorView}
 */
WebInspector.inspectorView;

/**
 * @constructor
 * @implements {WebInspector.ActionDelegate}
 */
WebInspector.InspectorView.DrawerToggleActionDelegate = function()
{
}

WebInspector.InspectorView.DrawerToggleActionDelegate.prototype = {
    /**
     * @return {boolean}
     */
    handleAction: function()
    {
        if (WebInspector.inspectorView.drawerVisible()) {
            WebInspector.inspectorView.closeDrawer();
            return true;
        }
        WebInspector.inspectorView.showDrawer();
        return true;
    }
}

/**
 * @constructor
 * @implements {WebInspector.StatusBarItem.Provider}
 */
WebInspector.InspectorView.ToggleDrawerButtonProvider = function()
{
}

WebInspector.InspectorView.ToggleDrawerButtonProvider.prototype = {
    /**
     * @return {?WebInspector.StatusBarItem}
     */
    item: function()
    {
        return WebInspector.inspectorView._drawer.toggleButton();
    }
}
