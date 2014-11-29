/*
 * Copyright (C) 2008 Apple Inc. All Rights Reserved.
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
 * @extends {TreeElement}
 */
WebInspector.SidebarSectionTreeElement = function(title, representedObject, hasChildren)
{
    TreeElement.call(this, title.escapeHTML(), representedObject || {}, hasChildren);
    this.expand();
}

WebInspector.SidebarSectionTreeElement.prototype = {
    selectable: false,

    collapse: function()
    {
        // Should not collapse as it is not selectable.
    },

    get smallChildren()
    {
        return this._smallChildren;
    },

    set smallChildren(x)
    {
        if (this._smallChildren === x)
            return;

        this._smallChildren = x;

        this._childrenListNode.classList.toggle("small", this._smallChildren);
    },

    onattach: function()
    {
        this.listItemElement.classList.add("sidebar-tree-section");
    },

    onreveal: function()
    {
        if (this.listItemElement)
            this.listItemElement.scrollIntoViewIfNeeded(false);
    },

    __proto__: TreeElement.prototype
}

/**
 * @constructor
 * @extends {TreeElement}
 * @param {string} className
 * @param {string} title
 * @param {string=} subtitle
 * @param {?Object=} representedObject
 * @param {boolean=} hasChildren
 */
WebInspector.SidebarTreeElement = function(className, title, subtitle, representedObject, hasChildren)
{
    TreeElement.call(this, "", representedObject, hasChildren);

    if (hasChildren)
        this.disclosureButton = createElementWithClass("button", "disclosure-button");

    this.iconElement = createElementWithClass("div", "icon");
    this.statusElement = createElementWithClass("div", "status");
    this.titlesElement = createElementWithClass("div", "titles");

    this.titleContainer = this.titlesElement.createChild("span", "title-container");
    this.titleElement = this.titleContainer.createChild("span", "title");

    this.subtitleElement = this.titlesElement.createChild("span", "subtitle");

    this.className = className;
    this.mainTitle = title;
    this.subtitle = subtitle;
}

WebInspector.SidebarTreeElement.prototype = {
    get small()
    {
        return this._small;
    },

    set small(x)
    {
        this._small = x;
        if (this.listItemElement)
            this.listItemElement.classList.toggle("small", this._small);
    },

    get mainTitle()
    {
        return this._mainTitle;
    },

    set mainTitle(x)
    {
        this._mainTitle = x;
        this.refreshTitles();
    },

    get subtitle()
    {
        return this._subtitle;
    },

    set subtitle(x)
    {
        this._subtitle = x;
        this.refreshTitles();
    },

    set wait(x)
    {
        this.listItemElement.classList.toggle("wait", x);
    },

    refreshTitles: function()
    {
        var mainTitle = this.mainTitle;
        if (this.titleElement.textContent !== mainTitle)
            this.titleElement.textContent = mainTitle;

        var subtitle = this.subtitle;
        if (subtitle) {
            if (this.subtitleElement.textContent !== subtitle)
                this.subtitleElement.textContent = subtitle;
            this.titlesElement.classList.remove("no-subtitle");
        } else {
            this.subtitleElement.textContent = "";
            this.titlesElement.classList.add("no-subtitle");
        }
    },

    /**
     * @return {boolean}
     */
    isEventWithinDisclosureTriangle: function(event)
    {
        return event.target === this.disclosureButton;
    },

    onattach: function()
    {
        this.listItemElement.classList.add("sidebar-tree-item");

        if (this.className)
            this.listItemElement.classList.add(this.className);

        if (this.small)
            this.listItemElement.classList.add("small");

        if (this.hasChildren && this.disclosureButton)
            this.listItemElement.appendChild(this.disclosureButton);

        this.listItemElement.appendChildren(this.iconElement, this.statusElement, this.titlesElement);
    },

    onreveal: function()
    {
        if (this.listItemElement)
            this.listItemElement.scrollIntoViewIfNeeded(false);
    },

    __proto__: TreeElement.prototype
}
