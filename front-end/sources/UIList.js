/*
 * Copyright (C) 2008 Apple Inc. All Rights Reserved.
 * Copyright (C) 2013 Google Inc. All rights reserved.
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

/**
 * @constructor
 * @extends {WebInspector.VBox}
 */
WebInspector.UIList = function()
{
    WebInspector.VBox.call(this, true);
    this.registerRequiredCSS("sources/uiList.css");

    /** @type {!Array.<!WebInspector.UIList.Item>} */
    this._items = [];
}

WebInspector.UIList._Key = Symbol("ownerList");

WebInspector.UIList.prototype = {
    /**
     * @param {!WebInspector.UIList.Item} item
     * @param {?WebInspector.UIList.Item=} beforeItem
     */
    addItem: function(item, beforeItem)
    {
        item[WebInspector.UIList._Key] = this;
        var beforeElement = beforeItem ? beforeItem.element : null;
        this.contentElement.insertBefore(item.element, beforeElement);

        var index = beforeItem ? this._items.indexOf(beforeItem) : this._items.length;
        console.assert(index >= 0, "Anchor item not found in UIList");
        this._items.splice(index, 0, item);
    },

    /**
     * @param {!WebInspector.UIList.Item} item
     */
    removeItem: function(item)
    {
        var index = this._items.indexOf(item);
        console.assert(index >= 0);
        this._items.splice(index, 1);
        item.element.remove();
    },

    clear: function()
    {
        this.contentElement.removeChildren();
        this._items = [];
    },

    __proto__: WebInspector.VBox.prototype
}

/**
 * @constructor
 * @param {string} title
 * @param {string} subtitle
 * @param {boolean=} isLabel
 */
WebInspector.UIList.Item = function(title, subtitle, isLabel)
{
    this.element = createElementWithClass("div", "list-item");
    if (isLabel)
        this.element.classList.add("label");

    this.subtitleElement = this.element.createChild("div", "subtitle");
    this.titleElement = this.element.createChild("div", "title");

    this._hidden = false;
    this._isLabel = !!isLabel;
    this.setTitle(title);
    this.setSubtitle(subtitle);
    this.setSelected(false);
}

WebInspector.UIList.Item.prototype = {
    /**
     * @return {?WebInspector.UIList.Item}
     */
    nextSibling: function()
    {
        var list = this[WebInspector.UIList._Key];
        var index = list._items.indexOf(this);
        console.assert(index >= 0);
        return list._items[index + 1] || null;
    },

    /**
     * @return {string}
     */
    title: function()
    {
        return this._title;
    },

    /**
     * @param {string} x
     */
    setTitle: function(x)
    {
        if (this._title === x)
            return;
        this._title = x;
        this.titleElement.textContent = x;
    },

    /**
     * @return {string}
     */
    subtitle: function()
    {
        return this._subtitle;
    },

    /**
     * @param {string} x
     */
    setSubtitle: function(x)
    {
        if (this._subtitle === x)
            return;
        this._subtitle = x;
        this.subtitleElement.textContent = x;
    },

    /**
     * @return {boolean}
     */
    isSelected: function()
    {
        return this._selected;
    },

    /**
     * @param {boolean} x
     */
    setSelected: function(x)
    {
        if (x)
            this.select();
        else
            this.deselect();
    },

    select: function()
    {
        if (this._selected)
            return;
        this._selected = true;
        this.element.classList.add("selected");
    },

    deselect: function()
    {
        if (!this._selected)
            return;
        this._selected = false;
        this.element.classList.remove("selected");
    },

    toggleSelected: function()
    {
        this.setSelected(!this.isSelected());
    },

    /**
     * @return {boolean}
     */
    isHidden: function()
    {
        return this._hidden;
    },

    /**
     * @param {boolean} x
     */
    setHidden: function(x)
    {
        if (this._hidden === x)
            return;
        this._hidden = x;
        this.element.classList.toggle("hidden", x);
    },

    /**
     * @return {boolean}
     */
    isLabel: function()
    {
        return this._isLabel;
    },

    /**
     * @param {boolean} x
     */
    setDimmed: function(x)
    {
        this.element.classList.toggle("dimmed", x);
    },

    discard: function()
    {
    }
}
