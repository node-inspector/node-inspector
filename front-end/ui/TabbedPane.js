/*
 * Copyright (C) 2010 Google Inc. All rights reserved.
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
 * @extends {WebInspector.VBox}
 * @constructor
 */
WebInspector.TabbedPane = function()
{
    WebInspector.VBox.call(this);
    this.element.classList.add("tabbed-pane");
    this.element.tabIndex = -1;
    this._headerElement = this.element.createChild("div", "tabbed-pane-header");
    this._headerContentsElement = this._headerElement.createChild("div", "tabbed-pane-header-contents");
    this._tabsElement = this._headerContentsElement.createChild("div", "tabbed-pane-header-tabs");
    this._contentElement = this.element.createChild("div", "tabbed-pane-content");
    /** @type {!Array.<!WebInspector.TabbedPaneTab>} */
    this._tabs = [];
    /** @type {!Array.<!WebInspector.TabbedPaneTab>} */
    this._tabsHistory = [];
    /** @type {!Object.<string, !WebInspector.TabbedPaneTab>} */
    this._tabsById = {};
    this._currentTabLocked = false;

    this._dropDownButton = this._createDropDownButton();
    WebInspector.zoomManager.addEventListener(WebInspector.ZoomManager.Events.ZoomChanged, this._zoomChanged, this);
}

WebInspector.TabbedPane.EventTypes = {
    TabSelected: "TabSelected",
    TabClosed: "TabClosed"
}

WebInspector.TabbedPane.prototype = {
    /**
     * @param {boolean} locked
     */
    setCurrentTabLocked: function(locked)
    {
        this._currentTabLocked = locked;
        this._headerElement.classList.toggle("locked", this._currentTabLocked);
    },

    /**
     * @return {?WebInspector.View}
     */
    get visibleView()
    {
        return this._currentTab ? this._currentTab.view : null;
    },

    /**
     * @return {!Array.<!WebInspector.View>}
     */
    tabViews: function()
    {
        /**
         * @param {!WebInspector.TabbedPaneTab} tab
         * @return {!WebInspector.View}
         */
        function tabToView(tab)
        {
            return tab.view;
        }
        return this._tabs.map(tabToView);
    },

    /**
     * @return {?string}
     */
    get selectedTabId()
    {
        return this._currentTab ? this._currentTab.id : null;
    },

    /**
     * @type {boolean} shrinkableTabs
     */
    set shrinkableTabs(shrinkableTabs)
    {
        this._shrinkableTabs = shrinkableTabs;
    },

    /**
     * @type {boolean} verticalTabLayout
     */
    set verticalTabLayout(verticalTabLayout)
    {
        this._verticalTabLayout = verticalTabLayout;
        this.invalidateConstraints();
    },

    /**
     * @type {boolean} closeableTabs
     */
    set closeableTabs(closeableTabs)
    {
        this._closeableTabs = closeableTabs;
    },

    /**
     * @param {boolean} retainTabOrder
     * @param {function(string, string):number=} tabOrderComparator
     */
    setRetainTabOrder: function(retainTabOrder, tabOrderComparator)
    {
        this._retainTabOrder = retainTabOrder;
        this._tabOrderComparator = tabOrderComparator;
    },

    /**
     * @return {!Element}
     */
    defaultFocusedElement: function()
    {
        return this.visibleView ? this.visibleView.defaultFocusedElement() : this.element;
    },

    focus: function()
    {
        if (this.visibleView)
            this.visibleView.focus();
        else
            this.element.focus();
    },

    /**
     * @return {!Element}
     */
    headerElement: function()
    {
        return this._headerElement;
    },

    /**
     * @param {string} id
     * @return {boolean}
     */
    isTabCloseable: function(id)
    {
        var tab = this._tabsById[id];
        return tab ? tab.isCloseable() : false;
    },

    /**
     * @param {!WebInspector.TabbedPaneTabDelegate} delegate
     */
    setTabDelegate: function(delegate)
    {
        var tabs = this._tabs.slice();
        for (var i = 0; i < tabs.length; ++i)
            tabs[i].setDelegate(delegate);
        this._delegate = delegate;
    },

    /**
     * @param {string} id
     * @param {string} tabTitle
     * @param {!WebInspector.View} view
     * @param {string=} tabTooltip
     * @param {boolean=} userGesture
     * @param {boolean=} isCloseable
     */
    appendTab: function(id, tabTitle, view, tabTooltip, userGesture, isCloseable)
    {
        isCloseable = typeof isCloseable === "boolean" ? isCloseable : this._closeableTabs;
        var tab = new WebInspector.TabbedPaneTab(this, id, tabTitle, isCloseable, view, tabTooltip);
        tab.setDelegate(this._delegate);
        this._tabsById[id] = tab;

        /**
         * @param {!WebInspector.TabbedPaneTab} tab1
         * @param {!WebInspector.TabbedPaneTab} tab2
         * @this {WebInspector.TabbedPane}
         * @return {number}
         */
        function comparator(tab1, tab2)
        {
            return this._tabOrderComparator(tab1.id, tab2.id);
        }

        if (this._tabOrderComparator)
            this._tabs.splice(insertionIndexForObjectInListSortedByFunction(tab, this._tabs, comparator.bind(this)), 0, tab);
        else
            this._tabs.push(tab);

        this._tabsHistory.push(tab);

        if (this._tabsHistory[0] === tab && this.isShowing())
            this.selectTab(tab.id, userGesture);

        this._updateTabElements();
    },

    /**
     * @param {string} id
     * @param {boolean=} userGesture
     */
    closeTab: function(id, userGesture)
    {
        this.closeTabs([id], userGesture);
    },

    /**
     * @param {!Array.<string>} ids
     * @param {boolean=} userGesture
     */
    closeTabs: function(ids, userGesture)
    {
        var focused = this.hasFocus();
        for (var i = 0; i < ids.length; ++i)
            this._innerCloseTab(ids[i], userGesture);
        this._updateTabElements();
        if (this._tabsHistory.length)
            this.selectTab(this._tabsHistory[0].id, false);
        if (focused)
            this.focus();
    },

    /**
     * @param {string} id
     * @param {boolean=} userGesture
     */
    _innerCloseTab: function(id, userGesture)
    {
        if (!this._tabsById[id])
            return;
        if (userGesture && !this._tabsById[id]._closeable)
            return;
        if (this._currentTab && this._currentTab.id === id)
            this._hideCurrentTab();

        var tab = this._tabsById[id];
        delete this._tabsById[id];

        this._tabsHistory.splice(this._tabsHistory.indexOf(tab), 1);
        this._tabs.splice(this._tabs.indexOf(tab), 1);
        if (tab._shown)
            this._hideTabElement(tab);

        var eventData = { tabId: id, view: tab.view, isUserGesture: userGesture };
        this.dispatchEventToListeners(WebInspector.TabbedPane.EventTypes.TabClosed, eventData);
        return true;
    },

    /**
     * @param {string} tabId
     * @return {boolean}
     */
    hasTab: function(tabId)
    {
        return !!this._tabsById[tabId];
    },

    /**
     * @return {!Array.<string>}
     */
    allTabs: function()
    {
        var result = [];
        var tabs = this._tabs.slice();
        for (var i = 0; i < tabs.length; ++i)
            result.push(tabs[i].id);
        return result;
    },

    /**
     * @param {string} id
     * @return {!Array.<string>}
     */
    otherTabs: function(id)
    {
        var result = [];
        var tabs = this._tabs.slice();
        for (var i = 0; i < tabs.length; ++i) {
            if (tabs[i].id !== id)
                result.push(tabs[i].id);
        }
        return result;
    },

    /**
     * @param {string} id
     * @param {boolean=} userGesture
     * @return {boolean}
     */
    selectTab: function(id, userGesture)
    {
        if (this._currentTabLocked)
            return false;
        var focused = this.hasFocus();
        var tab = this._tabsById[id];
        if (!tab)
            return false;
        if (this._currentTab && this._currentTab.id === id)
            return true;

        this._hideCurrentTab();
        this._showTab(tab);
        this._currentTab = tab;

        this._tabsHistory.splice(this._tabsHistory.indexOf(tab), 1);
        this._tabsHistory.splice(0, 0, tab);

        this._updateTabElements();
        if (focused)
            this.focus();

        var eventData = { tabId: id, view: tab.view, isUserGesture: userGesture };
        this.dispatchEventToListeners(WebInspector.TabbedPane.EventTypes.TabSelected, eventData);
        return true;
    },

    /**
     * @param {number} tabsCount
     * @return {!Array.<string>}
     */
    lastOpenedTabIds: function(tabsCount)
    {
        function tabToTabId(tab) {
            return tab.id;
        }

        return this._tabsHistory.slice(0, tabsCount).map(tabToTabId);
    },

    /**
     * @param {string} id
     * @param {string} iconClass
     * @param {string=} iconTooltip
     */
    setTabIcon: function(id, iconClass, iconTooltip)
    {
        var tab = this._tabsById[id];
        if (tab._setIconClass(iconClass, iconTooltip))
            this._updateTabElements();
    },

    /**
     * @param {string} id
     * @param {string} className
     * @param {boolean=} force
     */
    toggleTabClass: function(id, className, force)
    {
        var tab = this._tabsById[id];
        if (tab._toggleClass(className, force))
            this._updateTabElements();
    },

    /**
     * @param {!WebInspector.Event} event
     */
    _zoomChanged: function(event)
    {
        for (var i = 0; i < this._tabs.length; ++i)
            delete this._tabs[i]._measuredWidth;
        if (this.isShowing())
            this._updateTabElements();
    },

    /**
     * @param {string} id
     * @param {string} tabTitle
     */
    changeTabTitle: function(id, tabTitle)
    {
        var tab = this._tabsById[id];
        if (tab.title === tabTitle)
            return;
        tab.title = tabTitle;
        this._updateTabElements();
    },

    /**
     * @param {string} id
     * @param {!WebInspector.View} view
     */
    changeTabView: function(id, view)
    {
        var tab = this._tabsById[id];
        if (this._currentTab && this._currentTab.id === tab.id) {
            if (tab.view !== view)
                this._hideTab(tab);
            tab.view = view;
            this._showTab(tab);
        } else
            tab.view = view;
    },

    /**
     * @param {string} id
     * @param {string=} tabTooltip
     */
    changeTabTooltip: function(id, tabTooltip)
    {
        var tab = this._tabsById[id];
        tab.tooltip = tabTooltip;
    },

    onResize: function()
    {
        this._updateTabElements();
    },

    headerResized: function()
    {
        this._updateTabElements();
    },

    wasShown: function()
    {
        var effectiveTab = this._currentTab || this._tabsHistory[0];
        if (effectiveTab)
            this.selectTab(effectiveTab.id);
    },

    /**
     * @return {!Constraints}
     */
    calculateConstraints: function()
    {
        var constraints = WebInspector.VBox.prototype.calculateConstraints.call(this);
        var minContentConstraints = new Constraints(new Size(0, 0), new Size(50, 50));
        constraints = constraints.widthToMax(minContentConstraints).heightToMax(minContentConstraints);
        if (this._verticalTabLayout)
            constraints = constraints.addWidth(new Constraints(new Size(this._headerElement.offsetWidth, 0)));
        else
            constraints = constraints.addHeight(new Constraints(new Size(0, this._headerElement.offsetHeight)));
        return constraints;
    },

    _updateTabElements: function()
    {
        WebInspector.invokeOnceAfterBatchUpdate(this, this._innerUpdateTabElements);
    },

    /**
     * @param {string} text
     */
    setPlaceholderText: function(text)
    {
        this._noTabsMessage = text;
    },

    _innerUpdateTabElements: function()
    {
        if (!this.isShowing())
            return;

        if (!this._tabs.length) {
            this._contentElement.classList.add("has-no-tabs");
            if (this._noTabsMessage && !this._noTabsMessageElement) {
                this._noTabsMessageElement = this._contentElement.createChild("div", "tabbed-pane-placeholder fill");
                this._noTabsMessageElement.textContent = this._noTabsMessage;
            }
        } else {
            this._contentElement.classList.remove("has-no-tabs");
            if (this._noTabsMessageElement) {
                this._noTabsMessageElement.remove();
                delete this._noTabsMessageElement;
            }
        }

        if (!this._measuredDropDownButtonWidth)
            this._measureDropDownButton();

        this._updateWidths();
        this._updateTabsDropDown();
    },

    /**
     * @param {number} index
     * @param {!WebInspector.TabbedPaneTab} tab
     */
    _showTabElement: function(index, tab)
    {
        if (index >= this._tabsElement.children.length)
            this._tabsElement.appendChild(tab.tabElement);
        else
            this._tabsElement.insertBefore(tab.tabElement, this._tabsElement.children[index]);
        tab._shown = true;
    },

    /**
     * @param {!WebInspector.TabbedPaneTab} tab
     */
    _hideTabElement: function(tab)
    {
        this._tabsElement.removeChild(tab.tabElement);
        tab._shown = false;
    },

    _createDropDownButton: function()
    {
        var dropDownContainer = createElementWithClass("div", "tabbed-pane-header-tabs-drop-down-container");
        var dropDownButton = dropDownContainer.createChild("div", "tabbed-pane-header-tabs-drop-down");
        dropDownButton.createTextChild("\u00bb");

        this._dropDownMenu = new WebInspector.DropDownMenu();
        this._dropDownMenu.addEventListener(WebInspector.DropDownMenu.Events.ItemSelected, this._dropDownMenuItemSelected, this);
        dropDownButton.appendChild(this._dropDownMenu.element);

        return dropDownContainer;
    },

    /**
     * @param {!WebInspector.Event} event
     */
    _dropDownMenuItemSelected: function(event)
    {
        var tabId = /** @type {string} */ (event.data);
        this.selectTab(tabId, true);
    },

    _totalWidth: function()
    {
        return this._headerContentsElement.getBoundingClientRect().width;
    },

    _updateTabsDropDown: function()
    {
        var tabsToShowIndexes = this._tabsToShowIndexes(this._tabs, this._tabsHistory, this._totalWidth(), this._measuredDropDownButtonWidth);

        for (var i = 0; i < this._tabs.length; ++i) {
            if (this._tabs[i]._shown && tabsToShowIndexes.indexOf(i) === -1)
                this._hideTabElement(this._tabs[i]);
        }
        for (var i = 0; i < tabsToShowIndexes.length; ++i) {
            var tab = this._tabs[tabsToShowIndexes[i]];
            if (!tab._shown)
                this._showTabElement(i, tab);
        }

        this._populateDropDownFromIndex();
    },

    _populateDropDownFromIndex: function()
    {
        if (this._dropDownButton.parentElement)
            this._headerContentsElement.removeChild(this._dropDownButton);

        this._dropDownMenu.clear();

        var tabsToShow = [];
        for (var i = 0; i < this._tabs.length; ++i) {
            if (!this._tabs[i]._shown)
                tabsToShow.push(this._tabs[i]);
                continue;
        }

        function compareFunction(tab1, tab2)
        {
            return tab1.title.localeCompare(tab2.title);
        }
        if (!this._retainTabOrder)
            tabsToShow.sort(compareFunction);

        var selectedId = null;
        for (var i = 0; i < tabsToShow.length; ++i) {
            var tab = tabsToShow[i];
            this._dropDownMenu.addItem(tab.id, tab.title);
            if (this._tabsHistory[0] === tab)
                selectedId = tab.id;
        }
        if (tabsToShow.length) {
            this._headerContentsElement.appendChild(this._dropDownButton);
            this._dropDownMenu.selectItem(selectedId);
        }
    },

    _measureDropDownButton: function()
    {
        this._dropDownButton.classList.add("measuring");
        this._headerContentsElement.appendChild(this._dropDownButton);
        this._measuredDropDownButtonWidth = this._dropDownButton.getBoundingClientRect().width;
        this._headerContentsElement.removeChild(this._dropDownButton);
        this._dropDownButton.classList.remove("measuring");
    },

    _updateWidths: function()
    {
        var measuredWidths = this._measureWidths();
        var maxWidth = this._shrinkableTabs ? this._calculateMaxWidth(measuredWidths.slice(), this._totalWidth()) : Number.MAX_VALUE;

        var i = 0;
        for (var tabId in this._tabs) {
            var tab = this._tabs[tabId];
            tab.setWidth(this._verticalTabLayout ? -1 : Math.min(maxWidth, measuredWidths[i++]));
        }
    },

    _measureWidths: function()
    {
        // Add all elements to measure into this._tabsElement
        this._tabsElement.style.setProperty("width", "2000px");
        var measuringTabElements = [];
        for (var tabId in this._tabs) {
            var tab = this._tabs[tabId];
            if (typeof tab._measuredWidth === "number")
                continue;
            var measuringTabElement = tab._createTabElement(true);
            measuringTabElement.__tab = tab;
            measuringTabElements.push(measuringTabElement);
            this._tabsElement.appendChild(measuringTabElement);
        }

        // Perform measurement
        for (var i = 0; i < measuringTabElements.length; ++i) {
            var width = measuringTabElements[i].getBoundingClientRect().width;
            measuringTabElements[i].__tab._measuredWidth = width;
        }

        // Nuke elements from the UI
        for (var i = 0; i < measuringTabElements.length; ++i)
            measuringTabElements[i].remove();

        // Combine the results.
        var measuredWidths = [];
        for (var tabId in this._tabs)
            measuredWidths.push(this._tabs[tabId]._measuredWidth);
        this._tabsElement.style.removeProperty("width");

        return measuredWidths;
    },

    /**
     * @param {!Array.<number>} measuredWidths
     * @param {number} totalWidth
     */
    _calculateMaxWidth: function(measuredWidths, totalWidth)
    {
        if (!measuredWidths.length)
            return 0;

        measuredWidths.sort(function(x, y) { return x - y });

        var totalMeasuredWidth = 0;
        for (var i = 0; i < measuredWidths.length; ++i)
            totalMeasuredWidth += measuredWidths[i];

        if (totalWidth >= totalMeasuredWidth)
            return measuredWidths[measuredWidths.length - 1];

        var totalExtraWidth = 0;
        for (var i = measuredWidths.length - 1; i > 0; --i) {
            var extraWidth = measuredWidths[i] - measuredWidths[i - 1];
            totalExtraWidth += (measuredWidths.length - i) * extraWidth;

            if (totalWidth + totalExtraWidth >= totalMeasuredWidth)
                return measuredWidths[i - 1] + (totalWidth + totalExtraWidth - totalMeasuredWidth) / (measuredWidths.length - i);
        }

        return totalWidth / measuredWidths.length;
    },

    /**
     * @param {!Array.<!WebInspector.TabbedPaneTab>} tabsOrdered
     * @param {!Array.<!WebInspector.TabbedPaneTab>} tabsHistory
     * @param {number} totalWidth
     * @param {number} measuredDropDownButtonWidth
     * @return {!Array.<number>}
     */
    _tabsToShowIndexes: function(tabsOrdered, tabsHistory, totalWidth, measuredDropDownButtonWidth)
    {
        var tabsToShowIndexes = [];

        var totalTabsWidth = 0;
        var tabCount = tabsOrdered.length;
        for (var i = 0; i < tabCount; ++i) {
            var tab = this._retainTabOrder ? tabsOrdered[i] : tabsHistory[i];
            totalTabsWidth += tab.width();
            var minimalRequiredWidth = totalTabsWidth;
            if (i !== tabCount - 1)
                minimalRequiredWidth += measuredDropDownButtonWidth;
            if (!this._verticalTabLayout && minimalRequiredWidth > totalWidth)
                break;
            tabsToShowIndexes.push(tabsOrdered.indexOf(tab));
        }

        tabsToShowIndexes.sort(function(x, y) { return x - y });

        return tabsToShowIndexes;
    },

    _hideCurrentTab: function()
    {
        if (!this._currentTab)
            return;

        this._hideTab(this._currentTab);
        delete this._currentTab;
    },

    /**
     * @param {!WebInspector.TabbedPaneTab} tab
     */
    _showTab: function(tab)
    {
        tab.tabElement.classList.add("selected");
        tab.view.show(this._contentElement);
    },

    /**
     * @param {!WebInspector.TabbedPaneTab} tab
     */
    _hideTab: function(tab)
    {
        tab.tabElement.classList.remove("selected");
        tab.view.detach();
    },

    /**
     * @return {!Array.<!Element>}
     */
    elementsToRestoreScrollPositionsFor: function()
    {
        return [ this._contentElement ];
    },

    /**
     * @param {!WebInspector.TabbedPaneTab} tab
     * @param {number} index
     */
    _insertBefore: function(tab, index)
    {
        this._tabsElement.insertBefore(tab._tabElement || null, this._tabsElement.childNodes[index]);
        var oldIndex = this._tabs.indexOf(tab);
        this._tabs.splice(oldIndex, 1);
        if (oldIndex < index)
            --index;
        this._tabs.splice(index, 0, tab);
    },

    __proto__: WebInspector.VBox.prototype
}

/**
 * @constructor
 * @param {!WebInspector.TabbedPane} tabbedPane
 * @param {string} id
 * @param {string} title
 * @param {boolean} closeable
 * @param {!WebInspector.View} view
 * @param {string=} tooltip
 */
WebInspector.TabbedPaneTab = function(tabbedPane, id, title, closeable, view, tooltip)
{
    this._closeable = closeable;
    this._tabbedPane = tabbedPane;
    this._id = id;
    this._title = title;
    this._tooltip = tooltip;
    this._view = view;
    this._shown = false;
    /** @type {number} */ this._measuredWidth;
    /** @type {!Element|undefined} */ this._tabElement;
}

WebInspector.TabbedPaneTab.prototype = {
    /**
     * @return {string}
     */
    get id()
    {
        return this._id;
    },

    /**
     * @return {string}
     */
    get title()
    {
        return this._title;
    },

    set title(title)
    {
        if (title === this._title)
            return;
        this._title = title;
        if (this._titleElement)
            this._titleElement.textContent = title;
        delete this._measuredWidth;
    },

    /**
     * @return {string}
     */
    iconClass: function()
    {
        return this._iconClass;
    },

    /**
     * @return {boolean}
     */
    isCloseable: function()
    {
        return this._closeable;
    },

    /**
     * @param {string} iconClass
     * @param {string=} iconTooltip
     * @return {boolean}
     */
    _setIconClass: function(iconClass, iconTooltip)
    {
        if (iconClass === this._iconClass && iconTooltip === this._iconTooltip)
            return false;
        this._iconClass = iconClass;
        this._iconTooltip = iconTooltip;
        if (this._iconElement)
            this._iconElement.remove();
        if (this._iconClass && this._tabElement)
            this._iconElement = this._createIconElement(this._tabElement, this._titleElement);
        delete this._measuredWidth;
        return true;
    },

    /**
     * @param {string} className
     * @param {boolean=} force
     * @return {boolean}
     */
    _toggleClass: function(className, force)
    {
        var element = this.tabElement;
        var hasClass = element.classList.contains(className);
        if (hasClass === force)
            return false;
        element.classList.toggle(className, force);
        delete this._measuredWidth;
        return true;
    },

    /**
     * @return {!WebInspector.View}
     */
    get view()
    {
        return this._view;
    },

    set view(view)
    {
        this._view = view;
    },

    /**
     * @return {string|undefined}
     */
    get tooltip()
    {
        return this._tooltip;
    },

    set tooltip(tooltip)
    {
        this._tooltip = tooltip;
        if (this._titleElement)
            this._titleElement.title = tooltip || "";
    },

    /**
     * @return {!Element}
     */
    get tabElement()
    {
        if (!this._tabElement)
            this._tabElement = this._createTabElement(false);

        return this._tabElement;
    },

    /**
     * @return {number}
     */
    width: function()
    {
        return this._width;
    },

    /**
     * @param {number} width
     */
    setWidth: function(width)
    {
        this.tabElement.style.width = width === -1 ? "" : (width + "px");
        this._width = width;
    },

    /**
     * @param {!WebInspector.TabbedPaneTabDelegate} delegate
     */
    setDelegate: function(delegate)
    {
        this._delegate = delegate;
    },

    _createIconElement: function(tabElement, titleElement)
    {
        var iconElement = createElementWithClass("span", "tabbed-pane-header-tab-icon " + this._iconClass);
        if (this._iconTooltip)
            iconElement.title = this._iconTooltip;
        tabElement.insertBefore(iconElement, titleElement);
        return iconElement;
    },

    /**
     * @param {boolean} measuring
     * @return {!Element}
     */
    _createTabElement: function(measuring)
    {
        var tabElement = createElementWithClass("div", "tabbed-pane-header-tab");
        tabElement.id = "tab-" + this._id;
        tabElement.tabIndex = -1;
        tabElement.selectTabForTest = this._tabbedPane.selectTab.bind(this._tabbedPane, this.id, true);

        var titleElement = tabElement.createChild("span", "tabbed-pane-header-tab-title");
        titleElement.textContent = this.title;
        titleElement.title = this.tooltip || "";
        if (this._iconClass)
            this._createIconElement(tabElement, titleElement);
        if (!measuring)
            this._titleElement = titleElement;

        if (this._closeable)
            tabElement.createChild("div", "close-button-gray");

        if (measuring) {
            tabElement.classList.add("measuring");
        } else {
            tabElement.addEventListener("click", this._tabClicked.bind(this), false);
            tabElement.addEventListener("mousedown", this._tabMouseDown.bind(this), false);
            tabElement.addEventListener("mouseup", this._tabMouseUp.bind(this), false);

            if (this._closeable) {
                tabElement.addEventListener("contextmenu", this._tabContextMenu.bind(this), false);
                WebInspector.installDragHandle(tabElement, this._startTabDragging.bind(this), this._tabDragging.bind(this), this._endTabDragging.bind(this), "pointer");
            }
        }

        return tabElement;
    },

    /**
     * @param {!Event} event
     */
    _tabClicked: function(event)
    {
        var middleButton = event.button === 1;
        var shouldClose = this._closeable && (middleButton || event.target.classList.contains("close-button-gray"));
        if (!shouldClose) {
            this._tabbedPane.focus();
            return;
        }
        this._closeTabs([this.id]);
        event.consume(true);
    },

    /**
     * @param {!Event} event
     */
    _tabMouseDown: function(event)
    {
        if (event.target.classList.contains("close-button-gray") || event.button === 1)
            return;
        this._tabbedPane.selectTab(this.id, true);
    },

    /**
     * @param {!Event} event
     */
    _tabMouseUp: function(event)
    {
        // This is needed to prevent middle-click pasting on linux when tabs are clicked.
        if (event.button === 1)
            event.consume(true);
    },

    /**
     * @param {!Array.<string>} ids
     */
    _closeTabs: function(ids)
    {
        if (this._delegate) {
            this._delegate.closeTabs(this._tabbedPane, ids);
            return;
        }
        this._tabbedPane.closeTabs(ids, true);
    },

    _tabContextMenu: function(event)
    {
        /**
         * @this {WebInspector.TabbedPaneTab}
         */
        function close()
        {
            this._closeTabs([this.id]);
        }

        /**
         * @this {WebInspector.TabbedPaneTab}
         */
        function closeOthers()
        {
            this._closeTabs(this._tabbedPane.otherTabs(this.id));
        }

        /**
         * @this {WebInspector.TabbedPaneTab}
         */
        function closeAll()
        {
            this._closeTabs(this._tabbedPane.allTabs());
        }

        var contextMenu = new WebInspector.ContextMenu(event);
        contextMenu.appendItem(WebInspector.UIString("Close"), close.bind(this));
        contextMenu.appendItem(WebInspector.UIString(WebInspector.useLowerCaseMenuTitles() ? "Close others" : "Close Others"), closeOthers.bind(this));
        contextMenu.appendItem(WebInspector.UIString(WebInspector.useLowerCaseMenuTitles() ? "Close all" : "Close All"), closeAll.bind(this));
        contextMenu.show();
    },

    /**
     * @param {!Event} event
     * @return {boolean}
     */
    _startTabDragging: function(event)
    {
        if (event.target.classList.contains("close-button-gray"))
            return false;
        this._dragStartX = event.pageX;
        return true;
    },

    /**
     * @param {!Event} event
     */
    _tabDragging: function(event)
    {
        var tabElements = this._tabbedPane._tabsElement.childNodes;
        for (var i = 0; i < tabElements.length; ++i) {
            var tabElement = tabElements[i];
            if (tabElement === this._tabElement)
                continue;

            var intersects = tabElement.offsetLeft + tabElement.clientWidth > this._tabElement.offsetLeft &&
                this._tabElement.offsetLeft + this._tabElement.clientWidth > tabElement.offsetLeft;
            if (!intersects)
                continue;

            if (Math.abs(event.pageX - this._dragStartX) < tabElement.clientWidth / 2 + 5)
                break;

            if (event.pageX - this._dragStartX > 0) {
                tabElement = tabElement.nextSibling;
                ++i;
            }

            var oldOffsetLeft = this._tabElement.offsetLeft;
            this._tabbedPane._insertBefore(this, i);
            this._dragStartX += this._tabElement.offsetLeft - oldOffsetLeft;
            break;
        }

        if (!this._tabElement.previousSibling && event.pageX - this._dragStartX < 0) {
            this._tabElement.style.setProperty("left", "0px");
            return;
        }
        if (!this._tabElement.nextSibling && event.pageX - this._dragStartX > 0) {
            this._tabElement.style.setProperty("left", "0px");
            return;
        }

        this._tabElement.style.setProperty("position", "relative");
        this._tabElement.style.setProperty("left", (event.pageX - this._dragStartX) + "px");
    },

    /**
     * @param {!Event} event
     */
    _endTabDragging: function(event)
    {
        this._tabElement.style.removeProperty("position");
        this._tabElement.style.removeProperty("left");
        delete this._dragStartX;
    }
}

/**
 * @interface
 */
WebInspector.TabbedPaneTabDelegate = function()
{
}

WebInspector.TabbedPaneTabDelegate.prototype = {
    /**
     * @param {!WebInspector.TabbedPane} tabbedPane
     * @param {!Array.<string>} ids
     */
    closeTabs: function(tabbedPane, ids) { }
}

/**
 * @constructor
 * @param {!WebInspector.TabbedPane} tabbedPane
 * @param {string} extensionPoint
 * @param {function(string, !WebInspector.View)=} viewCallback
 */
WebInspector.ExtensibleTabbedPaneController = function(tabbedPane, extensionPoint, viewCallback)
{
    this._tabbedPane = tabbedPane;
    this._extensionPoint = extensionPoint;
    this._viewCallback = viewCallback;
    this._tabOrders = {};
    /** @type {!Object.<string, !Promise.<!WebInspector.View>>} */
    this._promiseForId = {};

    this._tabbedPane.setRetainTabOrder(true, this._tabOrderComparator.bind(this));
    this._tabbedPane.addEventListener(WebInspector.TabbedPane.EventTypes.TabSelected, this._tabSelected, this);
    /** @type {!Map.<string, ?WebInspector.View>} */
    this._views = new Map();
    this._initialize();
}

WebInspector.ExtensibleTabbedPaneController.prototype = {
    _initialize: function()
    {
        /** @type {!Map.<string, !Runtime.Extension>} */
        this._extensions = new Map();
        var extensions = self.runtime.extensions(this._extensionPoint);

        for (var i = 0; i < extensions.length; ++i) {
            var descriptor = extensions[i].descriptor();
            var id = descriptor["name"];
            this._tabOrders[id] = i;
            var title = WebInspector.UIString(descriptor["title"]);
            var settingName = descriptor["setting"];
            var setting = settingName ? /** @type {!WebInspector.Setting|undefined} */ (WebInspector.settings[settingName]) : null;

            this._extensions.set(id, extensions[i]);

            if (setting) {
                setting.addChangeListener(this._toggleSettingBasedView.bind(this, id, title, setting));
                if (setting.get())
                    this._tabbedPane.appendTab(id, title, new WebInspector.View());
            } else {
                this._tabbedPane.appendTab(id, title, new WebInspector.View());
            }
        }
    },

    /**
     * @param {string} id
     * @param {string} title
     * @param {!WebInspector.Setting} setting
     */
    _toggleSettingBasedView: function(id, title, setting)
    {
        this._tabbedPane.closeTab(id);
        if (setting.get())
            this._tabbedPane.appendTab(id, title, new WebInspector.View());
    },

    /**
     * @param {!WebInspector.Event} event
     */
    _tabSelected: function(event)
    {
        var tabId = /** @type {string} */ (event.data.tabId);
        this.viewForId(tabId).then(viewLoaded.bind(this)).done();

        /**
         * @this {WebInspector.ExtensibleTabbedPaneController}
         * @param {!WebInspector.View} view
         */
        function viewLoaded(view)
        {
            this._tabbedPane.changeTabView(tabId, view);
            var shouldFocus = this._tabbedPane.visibleView.element.isSelfOrAncestor(WebInspector.currentFocusElement());
            if (shouldFocus)
                view.focus();
        }
    },

    /**
     * @return {!Array.<string>}
     */
    viewIds: function()
    {
        return this._extensions.keysArray();
    },

    /**
     * @param {string} id
     * @return {!Promise.<!WebInspector.View>}
     */
    viewForId: function(id)
    {
        if (this._views.has(id))
            return Promise.resolve(/** @type {!WebInspector.View} */ (this._views.get(id)));
        if (!this._extensions.has(id))
            return Promise.rejectWithError("No view registered for given type and id: " + this._extensionPoint + ", " + id);
        if (this._promiseForId[id])
            return this._promiseForId[id];

        var promise = this._extensions.get(id).instancePromise();
        this._promiseForId[id] = /** @type {!Promise.<!WebInspector.View>} */ (promise);
        return promise.then(cacheView.bind(this));

        /**
         * @param {!Object} object
         * @this {WebInspector.ExtensibleTabbedPaneController}
         */
        function cacheView(object)
        {
            var view = /** @type {!WebInspector.View} */ (object);
            delete this._promiseForId[id];
            this._views.set(id, view);
            if (this._viewCallback && view)
                this._viewCallback(id, view);
            return view;
        }
    },

    /**
     * @param {string} id1
     * @param {string} id2
     * @return {number}
     */
    _tabOrderComparator: function(id1, id2)
    {
        return this._tabOrders[id2] = this._tabOrders[id1];
    }
}
