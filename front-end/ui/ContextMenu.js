/*
 * Copyright (C) 2009 Google Inc. All rights reserved.
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
 * @param {!WebInspector.ContextMenu} topLevelMenu
 * @param {string} type
 * @param {string=} label
 * @param {boolean=} disabled
 * @param {boolean=} checked
 */
WebInspector.ContextMenuItem = function(topLevelMenu, type, label, disabled, checked)
{
    this._type = type;
    this._label = label;
    this._disabled = disabled;
    this._checked = checked;
    this._contextMenu = topLevelMenu;
    if (type === "item" || type === "checkbox")
        this._id = topLevelMenu.nextId();
}

WebInspector.ContextMenuItem.prototype = {
    /**
     * @return {number}
     */
    id: function()
    {
        return this._id;
    },

    /**
     * @return {string}
     */
    type: function()
    {
        return this._type;
    },

    /**
     * @return {boolean}
     */
    isEnabled: function()
    {
        return !this._disabled;
    },

    /**
     * @param {boolean} enabled
     */
    setEnabled: function(enabled)
    {
        this._disabled = !enabled;
    },

    /**
     * @return {!InspectorFrontendHostAPI.ContextMenuDescriptor}
     */
    _buildDescriptor: function()
    {
        switch (this._type) {
        case "item":
            return { type: "item", id: this._id, label: this._label, enabled: !this._disabled };
        case "separator":
            return { type: "separator" };
        case "checkbox":
            return { type: "checkbox", id: this._id, label: this._label, checked: !!this._checked, enabled: !this._disabled };
        }
        throw new Error("Invalid item type:"  + this._type);
    }
}

/**
 * @constructor
 * @extends {WebInspector.ContextMenuItem}
 * @param {!WebInspector.ContextMenu} topLevelMenu
 * @param {string=} label
 * @param {boolean=} disabled
 */
WebInspector.ContextSubMenuItem = function(topLevelMenu, label, disabled)
{
    WebInspector.ContextMenuItem.call(this, topLevelMenu, "subMenu", label, disabled);
    /** @type {!Array.<!WebInspector.ContextMenuItem>} */
    this._items = [];
}

WebInspector.ContextSubMenuItem.prototype = {
    /**
     * @param {string} label
     * @param {function(?)} handler
     * @param {boolean=} disabled
     * @return {!WebInspector.ContextMenuItem}
     */
    appendItem: function(label, handler, disabled)
    {
        var item = new WebInspector.ContextMenuItem(this._contextMenu, "item", label, disabled);
        this._pushItem(item);
        this._contextMenu._setHandler(item.id(), handler);
        return item;
    },

    /**
     * @param {string} label
     * @param {boolean=} disabled
     * @return {!WebInspector.ContextSubMenuItem}
     */
    appendSubMenuItem: function(label, disabled)
    {
        var item = new WebInspector.ContextSubMenuItem(this._contextMenu, label, disabled);
        this._pushItem(item);
        return item;
    },

    /**
     * @param {string} label
     * @param {function()} handler
     * @param {boolean=} checked
     * @param {boolean=} disabled
     * @return {!WebInspector.ContextMenuItem}
     */
    appendCheckboxItem: function(label, handler, checked, disabled)
    {
        var item = new WebInspector.ContextMenuItem(this._contextMenu, "checkbox", label, disabled, checked);
        this._pushItem(item);
        this._contextMenu._setHandler(item.id(), handler);
        return item;
    },

    appendSeparator: function()
    {
        if (this._items.length)
            this._pendingSeparator = true;
    },

    /**
     * @param {!WebInspector.ContextMenuItem} item
     */
    _pushItem: function(item)
    {
        if (this._pendingSeparator) {
            this._items.push(new WebInspector.ContextMenuItem(this._contextMenu, "separator"));
            delete this._pendingSeparator;
        }
        this._items.push(item);
    },

    /**
     * @return {boolean}
     */
    isEmpty: function()
    {
        return !this._items.length;
    },

    /**
     * @return {!InspectorFrontendHostAPI.ContextMenuDescriptor}
     */
    _buildDescriptor: function()
    {
        var result = { type: "subMenu", label: this._label, enabled: !this._disabled, subItems: [] };
        for (var i = 0; i < this._items.length; ++i)
            result.subItems.push(this._items[i]._buildDescriptor());
        return result;
    },

    __proto__: WebInspector.ContextMenuItem.prototype
}

/**
 * @constructor
 * @extends {WebInspector.ContextSubMenuItem}
 * @param {!Event} event
 */
WebInspector.ContextMenu = function(event)
{
    WebInspector.ContextSubMenuItem.call(this, this, "");
    /** @type {!Array.<!Promise.<!Array.<!WebInspector.ContextMenu.Provider>>>} */
    this._pendingPromises = [];
    /** @type {!Array.<!Promise.<!Object>>} */
    this._pendingTargets = [];
    this._event = event;
    this._x = event.x;
    this._y = event.y;
    this._handlers = {};
    this._id = 0;
}

WebInspector.ContextMenu.initialize = function()
{
    InspectorFrontendHost.events.addEventListener(InspectorFrontendHostAPI.Events.SetUseSoftMenu, setUseSoftMenu);
    /**
     * @param {!WebInspector.Event} event
     */
    function setUseSoftMenu(event)
    {
        WebInspector.ContextMenu._useSoftMenu = /** @type {boolean} */ (event.data);
    }
}

/**
 * @param {!Document} doc
 */
WebInspector.ContextMenu.installHandler = function(doc)
{
    doc.body.addEventListener("contextmenu", handler, false);

    /**
     * @param {!Event} event
     */
    function handler(event)
    {
        var contextMenu = new WebInspector.ContextMenu(event);
        contextMenu.appendApplicableItems(/** @type {!Object} */ (event.target));
        contextMenu.show();
    }
}

WebInspector.ContextMenu.prototype = {
    /**
     * @return {number}
     */
    nextId: function()
    {
        return this._id++;
    },

    show: function()
    {
        Promise.all(this._pendingPromises).then(populateAndShow.bind(this)).done();
        WebInspector.ContextMenu._pendingMenu = this;

        /**
         * @param {!Array.<!Array.<!WebInspector.ContextMenu.Provider>>} appendCallResults
         * @this {WebInspector.ContextMenu}
         */
        function populateAndShow(appendCallResults)
        {
            if (WebInspector.ContextMenu._pendingMenu !== this)
                return;
            delete WebInspector.ContextMenu._pendingMenu;

            for (var i = 0; i < appendCallResults.length; ++i) {
                var providers = appendCallResults[i];
                var target = this._pendingTargets[i];

                for (var j = 0; j < providers.length; ++j) {
                    var provider = /** @type {!WebInspector.ContextMenu.Provider} */ (providers[j]);
                    this.appendSeparator();
                    provider.appendApplicableItems(this._event, this, target);
                    this.appendSeparator();
                }
            }

            this._pendingPromises = [];
            this._pendingTargets = [];
            this._innerShow();
        }

        this._event.consume(true);
    },

    _innerShow: function()
    {
        var menuObject = this._buildDescriptors();

        WebInspector._contextMenu = this;
        if (WebInspector.ContextMenu._useSoftMenu || InspectorFrontendHost.isHostedMode()) {
            var softMenu = new WebInspector.SoftContextMenu(menuObject, this._itemSelected.bind(this));
            softMenu.show(this._event.target.ownerDocument, this._x, this._y);
        } else {
            InspectorFrontendHost.showContextMenuAtPoint(this._x, this._y, menuObject, this._event.target.ownerDocument);
            InspectorFrontendHost.events.addEventListener(InspectorFrontendHostAPI.Events.ContextMenuCleared, this._menuCleared, this);
            InspectorFrontendHost.events.addEventListener(InspectorFrontendHostAPI.Events.ContextMenuItemSelected, this._onItemSelected, this);
        }
    },

    /**
     * @param {number} id
     * @param {function(?)} handler
     */
    _setHandler: function(id, handler)
    {
        if (handler)
            this._handlers[id] = handler;
    },

    /**
     * @return {!Array.<!InspectorFrontendHostAPI.ContextMenuDescriptor>}
     */
    _buildDescriptors: function()
    {
        var result = [];
        for (var i = 0; i < this._items.length; ++i)
            result.push(this._items[i]._buildDescriptor());
        return result;
    },

    /**
     * @param {!WebInspector.Event} event
     */
    _onItemSelected: function(event)
    {
        this._itemSelected(/** @type {string} */ (event.data));
    },

    /**
     * @param {string} id
     */
    _itemSelected: function(id)
    {
        if (this._handlers[id])
            this._handlers[id].call(this);
        this._menuCleared();
    },

    _menuCleared: function()
    {
        InspectorFrontendHost.events.removeEventListener(InspectorFrontendHostAPI.Events.ContextMenuCleared, this._menuCleared, this);
        InspectorFrontendHost.events.removeEventListener(InspectorFrontendHostAPI.Events.ContextMenuItemSelected, this._onItemSelected, this);
    },

    /**
     * @param {!Object} target
     */
    appendApplicableItems: function(target)
    {
        this._pendingPromises.push(self.runtime.instancesPromise(WebInspector.ContextMenu.Provider, target));
        this._pendingTargets.push(target);
    },

    __proto__: WebInspector.ContextSubMenuItem.prototype
}

/**
 * @interface
 */
WebInspector.ContextMenu.Provider = function() {
}

WebInspector.ContextMenu.Provider.prototype = {
    /**
     * @param {!Event} event
     * @param {!WebInspector.ContextMenu} contextMenu
     * @param {!Object} target
     */
    appendApplicableItems: function(event, contextMenu, target) { }
}
