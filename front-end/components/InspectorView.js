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
    this.setMinimumSize(240, 72);

    // DevTools sidebar is a vertical split of panels tabbed pane and a drawer.
    this._drawerSplitWidget = new WebInspector.SplitWidget(false, true, "Inspector.drawerSplitViewState", 200, 200);
    this._drawerSplitWidget.hideSidebar();
    this._drawerSplitWidget.enableShowModeSaving();
    this._drawerSplitWidget.show(this.element);

    this._tabbedPane = new WebInspector.TabbedPane();
    this._tabbedPane.registerRequiredCSS("components/inspectorViewTabbedPane.css");
    this._tabbedPane.element.classList.add("inspector-view-tabbed-pane");
    this._tabbedPane.setTabSlider(true);
    this._tabbedPane.setAllowTabReorder(true);
    this._tabbedPane.addEventListener(WebInspector.TabbedPane.EventTypes.TabOrderChanged, this._persistPanelOrder, this);
    this._tabOrderSetting = WebInspector.settings.createSetting("InspectorView.panelOrder", {});
    this._drawerSplitWidget.setMainWidget(this._tabbedPane);
    this._drawer = new WebInspector.Drawer(this._drawerSplitWidget);

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
        this.showPanel("console");
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
        /**
         * @param {!Runtime.Extension} extension
         * @this {!WebInspector.InspectorView}
         */
        function processPanelExtensions(extension)
        {
            var descriptor = new WebInspector.RuntimeExtensionPanelDescriptor(extension);
            var weight = this._tabOrderSetting.get()[descriptor.name()];
            if (weight === undefined)
                weight = extension.descriptor()["order"];
            if (weight === undefined)
                weight = 10000;
            panelsByWeight.set(weight, descriptor);
        }

        WebInspector.startBatchUpdate();
        /** @type {!Map.<number, !WebInspector.PanelDescriptor>} */
        var panelsByWeight = new Map();
        self.runtime.extensions(WebInspector.PanelFactory).forEach(processPanelExtensions.bind(this));
        var sortedPanelOrders = panelsByWeight.keysArray().sort();
        for (var order of sortedPanelOrders) {
            var panelDescriptor = panelsByWeight.get(order);
            if (panelDescriptor)
                this._innerAddPanel(panelDescriptor);
        }
        WebInspector.endBatchUpdate();
    },

    createToolbars: function()
    {
        this._leftToolbar = new WebInspector.ExtensibleToolbar("main-toolbar-left");
        this._leftToolbar.element.classList.add("inspector-view-toolbar", "inspector-view-toolbar-left");

        this._tabbedPane.insertBeforeTabStrip(this._leftToolbar.element);

        var rightToolbarContainer = createElementWithClass("div", "hbox flex-none flex-centered");
        this._tabbedPane.appendAfterTabStrip(rightToolbarContainer);

        this._rightToolbar = new WebInspector.ExtensibleToolbar("main-toolbar-right");
        this._rightToolbar.element.classList.add("inspector-view-toolbar", "flex-none");
        rightToolbarContainer.appendChild(this._rightToolbar.element);
    },

    /**
     * @param {!WebInspector.PanelDescriptor} panelDescriptor
     * @param {number=} index
     */
    _innerAddPanel: function(panelDescriptor, index)
    {
        var panelName = panelDescriptor.name();
        this._panelDescriptors[panelName] = panelDescriptor;
        this._tabbedPane.appendTab(panelName, panelDescriptor.title(), new WebInspector.Widget(), undefined, undefined, undefined, index);
        if (this._lastActivePanelSetting.get() === panelName)
            this._tabbedPane.selectTab(panelName);
    },

    /**
     * @param {!WebInspector.PanelDescriptor} panelDescriptor
     */
    addPanel: function(panelDescriptor)
    {
        var weight = this._tabOrderSetting.get()[panelDescriptor.name()];
        this._innerAddPanel(panelDescriptor, weight);
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
            return Promise.reject(new Error("Can't load panel without the descriptor: " + panelName));

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
        if (this._leftToolbar)
            this._leftToolbar.setEnabled(!this._currentPanelLocked);
        if (this._rightToolbar)
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
        if (this._currentPanelLocked) {
            if (this._currentPanel !== this._panels[panelName])
                return Promise.reject(new Error("Current panel locked"));
            return Promise.resolve(this._currentPanel);
        }

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
     * @param {string} panelName
     * @param {string} iconType
     * @param {string=} iconTooltip
     */
    setPanelIcon: function(panelName, iconType, iconTooltip)
    {
        this._tabbedPane.setTabIcon(panelName, iconType, iconTooltip);
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

        this.showPanel(panelName);
    },

    /**
     * @param {!WebInspector.Panel} panel
     * @param {boolean=} suppressBringToFront
     * @return {!WebInspector.Panel}
     */
    setCurrentPanel: function(panel, suppressBringToFront)
    {
        delete this._panelForShowPromise;

        if (this._currentPanelLocked) {
            console.error("Current panel is locked");
            return this._currentPanel;
        }

        if (!suppressBringToFront)
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
     * @param {!WebInspector.Widget} view
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
     * @override
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
        var panelShortcutEnabled = WebInspector.moduleSetting("shortcutPanelSwitch").get();
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
                        this.showPanel(panelName);
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
            event.consume(true);
    },

    /**
     * @param {number} direction
     */
    _changePanelInDirection: function(direction)
    {
        var panelOrder = this._tabbedPane.allTabs();
        var index = panelOrder.indexOf(this.currentPanel().name);
        index = (index + panelOrder.length + direction) % panelOrder.length;
        this.showPanel(panelOrder[index]);
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

    /**
     * @param {!WebInspector.Event} event
     */
    _persistPanelOrder: function(event)
    {
        var tabs = /** @type {!Array.<!WebInspector.TabbedPaneTab>} */(event.data);
        var tabOrders = this._tabOrderSetting.get();
        for (var i = 0; i < tabs.length; i++)
            tabOrders[tabs[i].id] = i;
        this._tabOrderSetting.set(tabOrders);
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
     * @override
     * @param {!WebInspector.Context} context
     * @param {string} actionId
     */
    handleAction: function(context, actionId)
    {
        if (WebInspector.inspectorView.drawerVisible())
            WebInspector.inspectorView.closeDrawer();
        else
            WebInspector.inspectorView.showDrawer();
    }
}
