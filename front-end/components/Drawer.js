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
 * @param {!WebInspector.SplitView} splitView
 */
WebInspector.Drawer = function(splitView)
{
    WebInspector.VBox.call(this);
    this.element.id = "drawer-contents";

    this._splitView = splitView;
    splitView.hideDefaultResizer();
    splitView.setSidebarView(this);

    this._toggleDrawerButton = new WebInspector.StatusBarButton(WebInspector.UIString("Show drawer."), "console-status-bar-item");
    this._toggleDrawerButton.addEventListener("click", this.toggle, this);

    this._tabbedPane = new WebInspector.TabbedPane();
    this._tabbedPane.element.id = "drawer-tabbed-pane";
    this._tabbedPane.closeableTabs = false;
    this._tabbedPane.addEventListener(WebInspector.TabbedPane.EventTypes.TabSelected, this._tabSelected, this);
    new WebInspector.ExtensibleTabbedPaneController(this._tabbedPane, "drawer-view");

    splitView.installResizer(this._tabbedPane.headerElement());
    this._lastSelectedViewSetting = WebInspector.settings.createSetting("WebInspector.Drawer.lastSelectedView", "console");
    this._tabbedPane.show(this.element);
}

WebInspector.Drawer.prototype = {
    /**
     * @return {!WebInspector.StatusBarButton}
     */
    toggleButton: function()
    {
        return this._toggleDrawerButton;
    },

    /**
     * @param {string} id
     */
    closeView: function(id)
    {
        this._tabbedPane.closeTab(id);
    },

    /**
     * @param {string} id
     * @param {boolean=} immediate
     */
    showView: function(id, immediate)
    {
        if (!this._tabbedPane.hasTab(id)) {
            // Hidden tab.
            this._innerShow(immediate);
            return;
        }
        this._innerShow(immediate);
        this._tabbedPane.selectTab(id, true);
        // In case this id is already selected, anyways persist it as the last saved value.
        this._lastSelectedViewSetting.set(id);
    },

    /**
     * @param {string} id
     * @param {string} title
     * @param {!WebInspector.View} view
     */
    showCloseableView: function(id, title, view)
    {
        if (!this._tabbedPane.hasTab(id)) {
            this._tabbedPane.appendTab(id, title, view, undefined, false, true);
        } else {
            this._tabbedPane.changeTabView(id, view);
            this._tabbedPane.changeTabTitle(id, title);
        }
        this._innerShow();
        this._tabbedPane.selectTab(id, true);
    },

    showDrawer: function()
    {
        this.showView(this._lastSelectedViewSetting.get());
    },

    wasShown: function()
    {
        this.showView(this._lastSelectedViewSetting.get());
        this._toggleDrawerButton.setToggled(true);
        this._toggleDrawerButton.setTitle(WebInspector.UIString("Hide drawer."));
    },

    willHide: function()
    {
        this._toggleDrawerButton.setToggled(false);
        this._toggleDrawerButton.setTitle(WebInspector.UIString("Show drawer."));
    },

    /**
     * @param {boolean=} immediate
     */
    _innerShow: function(immediate)
    {
        if (this.isShowing())
            return;

        this._splitView.showBoth(!immediate);

        if (this._visibleView())
            this._visibleView().focus();
    },

    closeDrawer: function()
    {
        if (!this.isShowing())
            return;

        WebInspector.restoreFocusFromElement(this.element);
        this._splitView.hideSidebar(true);
    },

    /**
     * @return {?WebInspector.View} view
     */
    _visibleView: function()
    {
        return this._tabbedPane.visibleView;
    },

    /**
     * @param {!WebInspector.Event} event
     */
    _tabSelected: function(event)
    {
        var tabId = this._tabbedPane.selectedTabId;
        if (tabId && event.data["isUserGesture"] && !this._tabbedPane.isTabCloseable(tabId))
            this._lastSelectedViewSetting.set(tabId);
    },

    toggle: function()
    {
        if (this._toggleDrawerButton.toggled())
            this.closeDrawer();
        else
            this.showDrawer();
    },

    /**
     * @return {boolean}
     */
    visible: function()
    {
        return this._toggleDrawerButton.toggled();
    },

    /**
     * @return {?string}
     */
    selectedViewId: function()
    {
        return this._tabbedPane.selectedTabId;
    },

    initialPanelShown: function()
    {
        this._initialPanelWasShown = true;
    },

    __proto__: WebInspector.VBox.prototype
}

/**
 * @interface
 */
WebInspector.Drawer.ViewFactory = function()
{
}

WebInspector.Drawer.ViewFactory.prototype = {
    /**
     * @return {!WebInspector.View}
     */
    createView: function() {}
}

/**
 * @constructor
 * @implements {WebInspector.Drawer.ViewFactory}
 * @param {function(new:T)} constructor
 * @template T
 */
WebInspector.Drawer.SingletonViewFactory = function(constructor)
{
    this._constructor = constructor;
}

WebInspector.Drawer.SingletonViewFactory.prototype = {
    /**
     * @return {!WebInspector.View}
     */
    createView: function()
    {
        if (!this._instance)
            this._instance = /** @type {!WebInspector.View} */(new this._constructor());
        return this._instance;
    }
}
