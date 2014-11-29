// Copyright 2014 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

/**
 * @constructor
 * @extends {WebInspector.Object}
 */
WebInspector.DropDownMenu = function()
{
    this.element = createElementWithClass("select", "drop-down-menu");
    this.element.addEventListener("mousedown", this._onBeforeMouseDown.bind(this), true);
    this.element.addEventListener("mousedown", consumeEvent, false);
    this.element.addEventListener("change", this._onChange.bind(this), false);
}

WebInspector.DropDownMenu.Events = {
    BeforeShow: "BeforeShow",
    ItemSelected: "ItemSelected"
}

WebInspector.DropDownMenu.prototype = {
    _onBeforeMouseDown: function()
    {
        this.dispatchEventToListeners(WebInspector.DropDownMenu.Events.BeforeShow, null);
    },

    _onChange: function()
    {
        var options = this.element.options;
        var selectedOption = options[this.element.selectedIndex];
        this.dispatchEventToListeners(WebInspector.DropDownMenu.Events.ItemSelected, selectedOption.id);
    },

    /**
     * @param {string} id
     * @param {string} title
     */
    addItem: function(id, title)
    {
        var option = new Option(title);
        option.id = id;
        this.element.appendChild(option);
    },

    /**
     * @param {?string} id
     */
    selectItem: function(id)
    {
        var children = this.element.children;
        for (var i = 0; i < children.length; ++i) {
            var child = children[i];
            if (child.id === id) {
                this.element.selectedIndex = i;
                return;
            }
        }
        this.element.selectedIndex = -1;
    },

    clear: function()
    {
        this.element.removeChildren();
    },

    __proto__: WebInspector.Object.prototype
}
