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
    WebInspector.VBox.call(this, true);
    this.registerRequiredCSS("ui/tabbedPane.css");
    this.element.classList.add("tabbed-pane");
    this.contentElement.classList.add("tabbed-pane-shadow");
    this.contentElement.tabIndex = -1;
    this._headerElement = this.contentElement.createChild("div", "tabbed-pane-header toolbar-colors");
    this._headerElement.createChild("content").select = ".tabbed-pane-header-before";
    this._headerContentsElement = this._headerElement.createChild("div", "tabbed-pane-header-contents");
    this._tabSlider = createElementWithClass("div", "tabbed-pane-tab-slider");
    this._headerElement.createChild("content").select = ".tabbed-pane-header-after";
    this._tabsElement = this._headerContentsElement.createChild("div", "tabbed-pane-header-tabs");
    this._contentElement = this.contentElement.createChild("div", "tabbed-pane-content");
    this._contentElement.createChild("content");
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
    TabClosed: "TabClosed",
    TabOrderChanged: "TabOrderChanged"
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
     * @return {?WebInspector.Widget}
     */
    get visibleView()
    {
        return this._currentTab ? this._currentTab.view : null;
    },

    /**
     * @return {!Array.<!WebInspector.Widget>}
     */
    tabViews: function()
    {
        /**
         * @param {!WebInspector.TabbedPaneTab} tab
         * @return {!WebInspector.Widget}
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
     * @param {boolean} shrinkableTabs
     */
    setShrinkableTabs: function(shrinkableTabs)
    {
        this._shrinkableTabs = shrinkableTabs;
    },

    /**
     * @param {boolean} verticalTabLayout
     */
    setVerticalTabLayout: function(verticalTabLayout)
    {
        this._verticalTabLayout = verticalTabLayout;
        this.contentElement.classList.add("vertical-tab-layout");
        this.invalidateConstraints();
    },

    /**
     * @param {boolean} closeableTabs
     */
    setCloseableTabs: function(closeableTabs)
    {
        this._closeableTabs = closeableTabs;
    },

    /**
     * @override
     * @return {!Element}
     */
    defaultFocusedElement: function()
    {
        return this.visibleView ? this.visibleView.defaultFocusedElement() : this.contentElement;
    },

    focus: function()
    {
        if (this.visibleView)
            this.visibleView.focus();
        else
            this.contentElement.focus();
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
     * @param {!WebInspector.Widget} view
     * @param {string=} tabTooltip
     * @param {boolean=} userGesture
     * @param {boolean=} isCloseable
     * @param {number=} index
     */
    appendTab: function(id, tabTitle, view, tabTooltip, userGesture, isCloseable, index)
    {
        isCloseable = typeof isCloseable === "boolean" ? isCloseable : this._closeableTabs;
        var tab = new WebInspector.TabbedPaneTab(this, id, tabTitle, isCloseable, view, tabTooltip);
        tab.setDelegate(this._delegate);
        this._tabsById[id] = tab;
        if (index !== undefined)
            this._tabs.splice(index, 0, tab);
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
        return this._tabs.map(function (tab) { return tab.id; });
    },

    /**
     * @param {string} id
     * @return {!Array.<string>}
     */
    otherTabs: function(id)
    {
        var result = [];
        for (var i = 0; i < this._tabs.length; ++i) {
            if (this._tabs[i].id !== id)
                result.push(this._tabs[i].id);
        }
        return result;
    },

    /**
     * @param {string} id
     * @return {!Array.<string>}
     */
    _tabsToTheRight: function(id)
    {
        var index = -1;
        for (var i = 0; i < this._tabs.length; ++i) {
            if (this._tabs[i].id === id) {
                index = i;
                break;
            }
        }
        if (index === -1)
            return [];
        return this._tabs.slice(index + 1).map(function (tab) { return tab.id; });
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
     * @param {string} iconType
     * @param {string=} iconTooltip
     */
    setTabIcon: function(id, iconType, iconTooltip)
    {
        var tab = this._tabsById[id];
        if (tab._setIconType(iconType, iconTooltip))
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
     * @param {!WebInspector.Widget} view
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
     * @param {boolean} enable
     */
    setTabSlider: function(enable)
    {
        this._sliderEnabled = enable;
        this._tabSlider.classList.toggle("enabled", enable);
    },

    /**
     * @override
     * @return {!Constraints}
     */
    calculateConstraints: function()
    {
        var constraints = WebInspector.VBox.prototype.calculateConstraints.call(this);
        var minContentConstraints = new Constraints(new Size(0, 0), new Size(50, 50));
        constraints = constraints.widthToMax(minContentConstraints).heightToMax(minContentConstraints);
        if (this._verticalTabLayout)
            constraints = constraints.addWidth(new Constraints(new Size(120, 0)));
        else
            constraints = constraints.addHeight(new Constraints(new Size(0, 30)));
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
        this._updateTabSlider();
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
        dropDownContainer.createChild("div", "glyph");
        this._dropDownMenu = new WebInspector.DropDownMenu(dropDownContainer);
        this._dropDownMenu.addEventListener(WebInspector.DropDownMenu.Events.ItemSelected, this._dropDownMenuItemSelected, this);

        return dropDownContainer;
    },

    /**
     * @param {!WebInspector.Event} event
     */
    _dropDownMenuItemSelected: function(event)
    {
        var tabId = /** @type {string} */ (event.data);
        this._lastSelectedOverflowTab = this._tabsById[tabId];
        this.selectTab(tabId, true);
    },

    _totalWidth: function()
    {
        return this._headerContentsElement.getBoundingClientRect().width;
    },

    /**
     * @return {number}
     */
    _numberOfTabsShown: function()
    {
        var numTabsShown = 0;
        for (var tab of this._tabs) {
            if (tab._shown)
                numTabsShown++;
        }
        return numTabsShown;
    },

    _updateTabsDropDown: function()
    {
        var tabsToShowIndexes = this._tabsToShowIndexes(this._tabs, this._tabsHistory, this._totalWidth(), this._measuredDropDownButtonWidth);
        if (this._lastSelectedOverflowTab && this._numberOfTabsShown() !== tabsToShowIndexes.length) {
            delete this._lastSelectedOverflowTab;
            this._updateTabsDropDown();
            return;
        }

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
            measuringTabElements[i].__tab._measuredWidth = Math.ceil(width);
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

        measuredWidths.sort(function(x, y) { return x - y; });

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
        var tabsToLookAt = tabsOrdered.slice(0);
        if (this._currentTab !== undefined)
            tabsToLookAt.unshift(tabsToLookAt.splice(tabsToLookAt.indexOf(this._currentTab), 1)[0]);
        if (this._lastSelectedOverflowTab !== undefined)
            tabsToLookAt.unshift(tabsToLookAt.splice(tabsToLookAt.indexOf(this._lastSelectedOverflowTab), 1)[0]);
        for (var i = 0; i < tabCount; ++i) {
            var tab = this._automaticReorder ? tabsHistory[i] : tabsToLookAt[i];
            totalTabsWidth += tab.width();
            var minimalRequiredWidth = totalTabsWidth;
            if (i !== tabCount - 1)
                minimalRequiredWidth += measuredDropDownButtonWidth;
            if (!this._verticalTabLayout && minimalRequiredWidth > totalWidth)
                break;
            tabsToShowIndexes.push(tabsOrdered.indexOf(tab));
        }

        tabsToShowIndexes.sort(function(x, y) { return x - y; });

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
        tab.view.show(this.element);
        this._updateTabSlider();
    },

    _updateTabSlider: function()
    {
        if (!this._currentTab || !this._sliderEnabled)
            return;
        var left = 0;
        for (var i = 0; i < this._tabs.length && this._currentTab !== this._tabs[i] && this._tabs[i]._shown; i++)
            left += this._tabs[i]._measuredWidth;
        var sliderWidth = this._currentTab._shown ? this._currentTab._measuredWidth : this._dropDownButton.offsetWidth;
        var scaleFactor = window.devicePixelRatio >= 1.5 ? " scaleY(0.75)" : "";
        this._tabSlider.style.transform = "translateX(" + left + "px)" + scaleFactor;
        this._tabSlider.style.width = sliderWidth + "px";

        if (this._tabSlider.parentElement !== this._headerContentsElement)
            this._headerContentsElement.appendChild(this._tabSlider);
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
     * @override
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
        this.dispatchEventToListeners(WebInspector.TabbedPane.EventTypes.TabOrderChanged, this._tabs);
    },

    /**
     * @param {!Element} element
     */
    insertBeforeTabStrip: function(element)
    {
        element.classList.add("tabbed-pane-header-before");
        this.element.appendChild(element);
    },

    /**
     * @param {!Element} element
     */
    appendAfterTabStrip: function(element)
    {
        element.classList.add("tabbed-pane-header-after");
        this.element.appendChild(element);
    },

    renderWithNoHeaderBackground: function()
    {
        this._headerElement.classList.add("tabbed-pane-no-header-background");
    },

    /**
     * @param {boolean} allow
     * @param {boolean=} automatic
     */
    setAllowTabReorder: function(allow, automatic)
    {
        this._allowTabReorder = allow;
        this._automaticReorder = automatic;
    },

    __proto__: WebInspector.VBox.prototype
}

/**
 * @constructor
 * @param {!WebInspector.TabbedPane} tabbedPane
 * @param {string} id
 * @param {string} title
 * @param {boolean} closeable
 * @param {!WebInspector.Widget} view
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
     * @return {boolean}
     */
    isCloseable: function()
    {
        return this._closeable;
    },

    /**
     * @param {string} iconType
     * @param {string=} iconTooltip
     * @return {boolean}
     */
    _setIconType: function(iconType, iconTooltip)
    {
        if (iconType === this._iconType && iconTooltip === this._iconTooltip)
            return false;
        this._iconType = iconType;
        this._iconTooltip = iconTooltip;
        if (this._tabElement)
            this._createIconElement(this._tabElement, this._titleElement);
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
     * @return {!WebInspector.Widget}
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

    /**
     * @param {!Element} tabElement
     * @param {!Element} titleElement
     */
    _createIconElement: function(tabElement, titleElement)
    {
        if (tabElement.__iconElement)
            tabElement.__iconElement.remove();
        if (!this._iconType)
            return;

        var iconElement = createElementWithClass("label", "tabbed-pane-header-tab-icon", "dt-icon-label");
        iconElement.type = this._iconType;
        if (this._iconTooltip)
            iconElement.title = this._iconTooltip;
        tabElement.insertBefore(iconElement, titleElement);
        tabElement.__iconElement = iconElement;
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
        this._createIconElement(tabElement, titleElement);
        if (!measuring)
            this._titleElement = titleElement;

        if (this._closeable)
            tabElement.createChild("div", "tabbed-pane-close-button", "dt-close-button").gray = true;

        if (measuring) {
            tabElement.classList.add("measuring");
        } else {
            tabElement.addEventListener("click", this._tabClicked.bind(this), false);
            tabElement.addEventListener("mousedown", this._tabMouseDown.bind(this), false);
            tabElement.addEventListener("mouseup", this._tabMouseUp.bind(this), false);

            tabElement.addEventListener("contextmenu", this._tabContextMenu.bind(this), false);
            if (this._tabbedPane._allowTabReorder)
                WebInspector.installDragHandle(tabElement, this._startTabDragging.bind(this), this._tabDragging.bind(this), this._endTabDragging.bind(this), "-webkit-grabbing", "pointer");
        }

        return tabElement;
    },

    /**
     * @param {!Event} event
     */
    _tabClicked: function(event)
    {
        var middleButton = event.button === 1;
        var shouldClose = this._closeable && (middleButton || event.target.classList.contains("tabbed-pane-close-button"));
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
        if (event.target.classList.contains("tabbed-pane-close-button") || event.button === 1)
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

        /**
         * @this {WebInspector.TabbedPaneTab}
         */
        function closeToTheRight()
        {
            this._closeTabs(this._tabbedPane._tabsToTheRight(this.id));
        }

        var contextMenu = new WebInspector.ContextMenu(event);
        if (this._closeable) {
            contextMenu.appendItem(WebInspector.UIString.capitalize("Close"), close.bind(this));
            contextMenu.appendItem(WebInspector.UIString.capitalize("Close ^others"), closeOthers.bind(this));
            contextMenu.appendItem(WebInspector.UIString.capitalize("Close ^tabs to the ^right"), closeToTheRight.bind(this));
            contextMenu.appendItem(WebInspector.UIString.capitalize("Close ^all"), closeAll.bind(this));
        }
        if (this._delegate)
            this._delegate.onContextMenu(this.id, contextMenu);
        contextMenu.show();
    },

    /**
     * @param {!Event} event
     * @return {boolean}
     */
    _startTabDragging: function(event)
    {
        if (event.target.classList.contains("tabbed-pane-close-button"))
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

        this._tabElement.classList.add("dragging");
        this._tabElement.style.setProperty("left", (event.pageX - this._dragStartX) + "px");
        this._tabbedPane._tabSlider.remove();
    },

    /**
     * @param {!Event} event
     */
    _endTabDragging: function(event)
    {
        this._tabElement.classList.remove("dragging");
        this._tabElement.style.removeProperty("left");
        delete this._dragStartX;
        this._tabbedPane._updateTabSlider();
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
    closeTabs: function(tabbedPane, ids) { },

    /**
     * @param {string} tabId
     * @param {!WebInspector.ContextMenu} contextMenu
     */
    onContextMenu: function(tabId, contextMenu) { }
}

/**
 * @constructor
 * @param {!WebInspector.TabbedPane} tabbedPane
 * @param {string} extensionPoint
 * @param {function(string, !WebInspector.Widget)=} viewCallback
 */
WebInspector.ExtensibleTabbedPaneController = function(tabbedPane, extensionPoint, viewCallback)
{
    this._tabbedPane = tabbedPane;
    this._extensionPoint = extensionPoint;
    this._viewCallback = viewCallback;
    this._tabOrders = {};
    /** @type {!Object.<string, !Promise.<?WebInspector.Widget>>} */
    this._promiseForId = {};

    this._tabbedPane.addEventListener(WebInspector.TabbedPane.EventTypes.TabSelected, this._tabSelected, this);
    /** @type {!Map.<string, ?WebInspector.Widget>} */
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

            this._extensions.set(id, extensions[i]);
            this._tabbedPane.appendTab(id, title, new WebInspector.Widget());
        }
    },

    /**
     * @param {!WebInspector.Event} event
     */
    _tabSelected: function(event)
    {
        var tabId = /** @type {string} */ (event.data.tabId);
        this.viewForId(tabId).then(viewLoaded.bind(this));

        /**
         * @this {WebInspector.ExtensibleTabbedPaneController}
         * @param {?WebInspector.Widget} view
         */
        function viewLoaded(view)
        {
            if (!view)
                return;
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
     * @return {!Promise.<?WebInspector.Widget>}
     */
    viewForId: function(id)
    {
        if (this._views.has(id))
            return Promise.resolve(/** @type {?WebInspector.Widget} */ (this._views.get(id)));
        if (!this._extensions.has(id))
            return Promise.resolve(/** @type {?WebInspector.Widget} */ (null));
        if (this._promiseForId[id])
            return this._promiseForId[id];

        var promise = this._extensions.get(id).instancePromise();
        this._promiseForId[id] = /** @type {!Promise.<?WebInspector.Widget>} */ (promise);
        return promise.then(cacheView.bind(this));

        /**
         * @param {!Object} object
         * @this {WebInspector.ExtensibleTabbedPaneController}
         */
        function cacheView(object)
        {
            var view = /** @type {!WebInspector.Widget} */ (object);
            delete this._promiseForId[id];
            this._views.set(id, view);
            if (this._viewCallback && view)
                this._viewCallback(id, view);
            return view;
        }
    }
}
