// Copyright 2014 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

/**
 * @constructor
 * @extends {WebInspector.SidebarPane}
 * @implements {WebInspector.TargetManager.Observer}
 */
WebInspector.ThreadsSidebarPane = function()
{
    WebInspector.SidebarPane.call(this, WebInspector.UIString("Threads"));
    this.setVisible(false);

    /** @type {!Map.<!WebInspector.DebuggerModel, !WebInspector.UIList.Item>} */
    this._debuggerModelToListItems = new Map();
    /** @type {!Map.<!WebInspector.UIList.Item, !WebInspector.Target>} */
    this._listItemsToTargets = new Map();
    /** @type {?WebInspector.UIList.Item} */
    this._selectedListItem = null;
    this.threadList = new WebInspector.UIList();
    this.threadList.show(this.element);
    WebInspector.targetManager.addModelListener(WebInspector.DebuggerModel, WebInspector.DebuggerModel.Events.DebuggerPaused, this._onDebuggerStateChanged, this);
    WebInspector.targetManager.addModelListener(WebInspector.DebuggerModel, WebInspector.DebuggerModel.Events.DebuggerResumed, this._onDebuggerStateChanged, this);
    WebInspector.context.addFlavorChangeListener(WebInspector.Target, this._targetChanged, this);
    WebInspector.targetManager.observeTargets(this);
}

WebInspector.ThreadsSidebarPane.prototype = {
    /**
     * @override
     * @param {!WebInspector.Target} target
     */
    targetAdded: function(target)
    {
        var debuggerModel = WebInspector.DebuggerModel.fromTarget(target)
        if (!debuggerModel) {
            this._updateVisibility();
            return;
        }
        var listItem = new WebInspector.UIList.Item(target.name(), "");
        listItem.element.addEventListener("click", this._onListItemClick.bind(this, listItem), false);
        var currentTarget = WebInspector.context.flavor(WebInspector.Target);
        if (currentTarget === target)
            this._selectListItem(listItem);

        this._debuggerModelToListItems.set(debuggerModel, listItem);
        this._listItemsToTargets.set(listItem, target);
        this.threadList.addItem(listItem);
        this._updateDebuggerState(debuggerModel);
        this._updateVisibility();
    },

    _updateVisibility: function()
    {
        this._wasVisibleAtLeastOnce = this._wasVisibleAtLeastOnce || this._debuggerModelToListItems.size > 1;
        this.setVisible(this._wasVisibleAtLeastOnce);
    },

    /**
     * @override
     * @param {!WebInspector.Target} target
     */
    targetRemoved: function(target)
    {
        var debuggerModel = WebInspector.DebuggerModel.fromTarget(target)
        if (!debuggerModel)
            return;
        var listItem = this._debuggerModelToListItems.remove(debuggerModel);
        if (listItem) {
            this._listItemsToTargets.remove(listItem);
            this.threadList.removeItem(listItem);
        }
        this._updateVisibility();
    },

    /**
     * @param {!WebInspector.Event} event
     */
    _targetChanged: function(event)
    {
        var newTarget = /** @type {!WebInspector.Target} */(event.data);
        var debuggerModel = WebInspector.DebuggerModel.fromTarget(newTarget)
        if (!debuggerModel)
            return;
        var listItem =  /** @type {!WebInspector.UIList.Item} */ (this._debuggerModelToListItems.get(debuggerModel));
        this._selectListItem(listItem);
    },

    /**
     * @param {!WebInspector.Event} event
     */
    _onDebuggerStateChanged: function(event)
    {
        var debuggerModel = /** @type {!WebInspector.DebuggerModel} */ (event.target);
        this._updateDebuggerState(debuggerModel);
    },

    /**
     * @param {!WebInspector.DebuggerModel} debuggerModel
     */
    _updateDebuggerState: function(debuggerModel)
    {
        var listItem = this._debuggerModelToListItems.get(debuggerModel);
        listItem.setSubtitle(WebInspector.UIString(debuggerModel.isPaused() ? "paused" : ""));
    },

    /**
     * @param {!WebInspector.UIList.Item} listItem
     */
    _selectListItem: function(listItem)
    {
        if (listItem === this._selectedListItem)
            return;

        if (this._selectedListItem)
            this._selectedListItem.setSelected(false);

        this._selectedListItem = listItem;
        listItem.setSelected(true);
    },

    /**
     * @param {!WebInspector.UIList.Item} listItem
     */
    _onListItemClick: function(listItem)
    {
        WebInspector.context.setFlavor(WebInspector.Target, this._listItemsToTargets.get(listItem));
        listItem.element.scrollIntoViewIfNeeded();
    },


    __proto__: WebInspector.SidebarPane.prototype
}
