/*
 * Copyright (C) 2011 Google Inc. All Rights Reserved.
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

if (!InspectorFrontendHost.showContextMenu) {

/**
 * @constructor
 */
WebInspector.SoftContextMenu = function(items)
{
    this._items = items;
}

WebInspector.SoftContextMenu.prototype = {
    show: function(event)
    {
        this._x = event.x;
        this._y = event.y;
        this._time = new Date().getTime();

        // Absolutely position menu for iframes.
        var absoluteX = event.pageX;
        var absoluteY = event.pageY;
        var targetElement = event.target;
        while (targetElement && window !== targetElement.ownerDocument.defaultView) {
            var frameElement = targetElement.ownerDocument.defaultView.frameElement;
            absoluteY += frameElement.totalOffsetTop();
            absoluteX += frameElement.totalOffsetLeft();
            targetElement = frameElement;
        }

        // Install glass pane capturing events.
        this._glassPaneElement = document.createElement("div");
        this._glassPaneElement.className = "soft-context-menu-glass-pane";
        this._glassPaneElement.tabIndex = 0;
        this._glassPaneElement.addEventListener("mouseup", this._glassPaneMouseUp.bind(this), false);

        // Create context menu.
        this._contextMenuElement = document.createElement("div");
        this._contextMenuElement.className = "soft-context-menu";
        this._contextMenuElement.tabIndex = 0;
        this._contextMenuElement.style.top = absoluteY + "px";
        this._contextMenuElement.style.left = absoluteX + "px";

        this._contextMenuElement.addEventListener("mousedown", this._discardMenu.bind(this), false);
        this._contextMenuElement.addEventListener("keydown", this._menuKeyDown.bind(this), false);
        this._contextMenuElement.addEventListener("blur", this._discardMenu.bind(this), false);

        for (var i = 0; i < this._items.length; ++i)
            this._contextMenuElement.appendChild(this._createMenuItem(this._items[i]));

        this._glassPaneElement.appendChild(this._contextMenuElement);
        document.body.appendChild(this._glassPaneElement);
        this._contextMenuElement.focus();

        // Re-position menu in case it does not fit.
        if (document.body.offsetWidth <  this._contextMenuElement.offsetLeft + this._contextMenuElement.offsetWidth)
            this._contextMenuElement.style.left = (absoluteX - this._contextMenuElement.offsetWidth) + "px";
        if (document.body.offsetHeight < this._contextMenuElement.offsetTop + this._contextMenuElement.offsetHeight)
            this._contextMenuElement.style.top = (document.body.offsetHeight - this._contextMenuElement.offsetHeight) + "px";

        event.stopPropagation();
        event.preventDefault();
    },

    _createMenuItem: function(item)
    {
        if (item.type === "separator")
            return this._createSeparator();

        var menuItemElement = document.createElement("div");
        menuItemElement.className = "soft-context-menu-item";

        var checkMarkElement = document.createElement("span");
        checkMarkElement.textContent = "\u2713 "; // Checkmark Unicode symbol
        checkMarkElement.style.pointerEvents = "none";
        if (!item.checked)
            checkMarkElement.style.opacity = "0";

        menuItemElement.appendChild(checkMarkElement);
        menuItemElement.appendChild(document.createTextNode(item.label));

        menuItemElement.addEventListener("mousedown", this._menuItemMouseDown.bind(this), false);
        menuItemElement.addEventListener("mouseup", this._menuItemMouseUp.bind(this), false);

        // Manually manage hover highlight since :hover does not work in case of click-and-hold menu invocation.
        menuItemElement.addEventListener("mouseover", this._menuItemMouseOver.bind(this), false);
        menuItemElement.addEventListener("mouseout", this._menuItemMouseOut.bind(this), false);

        menuItemElement._actionId = item.id;
        return menuItemElement;
    },

    _createSeparator: function()
    {
        var separatorElement = document.createElement("div");
        separatorElement.className = "soft-context-menu-separator";
        separatorElement._isSeparator = true;
        return separatorElement;
    },

    _menuItemMouseDown: function(event)
    {
        // Do not let separator's mouse down hit menu's handler - we need to receive mouse up!
        event.stopPropagation();
        event.preventDefault();
    },

    _menuItemMouseUp: function(event)
    {
        this._triggerAction(event.target, event);
    },

    _triggerAction: function(menuItemElement, event)
    {
        this._discardMenu(event);
        if (typeof menuItemElement._actionId !== "undefined") {
            WebInspector.contextMenuItemSelected(menuItemElement._actionId);
            delete menuItemElement._actionId;
        }
    },

    _menuItemMouseOver: function(event)
    {
        this._highlightMenuItem(event.target);
    },

    _menuItemMouseOut: function(event)
    {
        this._highlightMenuItem(null);
    },

    _highlightMenuItem: function(menuItemElement)
    {
        if (this._highlightedMenuItemElement)
            this._highlightedMenuItemElement.removeStyleClass("soft-context-menu-item-mouse-over");
        this._highlightedMenuItemElement = menuItemElement;
        if (this._highlightedMenuItemElement)
            this._highlightedMenuItemElement.addStyleClass("soft-context-menu-item-mouse-over");
    },

    _highlightPrevious: function()
    {
        var menuItemElement = this._highlightedMenuItemElement ? this._highlightedMenuItemElement.previousSibling : this._contextMenuElement.lastChild;
        while (menuItemElement && menuItemElement._isSeparator)
            menuItemElement = menuItemElement.previousSibling;
        if (menuItemElement)
            this._highlightMenuItem(menuItemElement);
    },

    _highlightNext: function()
    {
        var menuItemElement = this._highlightedMenuItemElement ? this._highlightedMenuItemElement.nextSibling : this._contextMenuElement.firstChild;
        while (menuItemElement && menuItemElement._isSeparator)
            menuItemElement = menuItemElement.nextSibling;
        if (menuItemElement)
            this._highlightMenuItem(menuItemElement);
    },

    _menuKeyDown: function(event)
    {
        switch (event.keyIdentifier) {
        case "Up":
            this._highlightPrevious(); break;
        case "Down":
            this._highlightNext(); break;
        case "U+001B": // Escape
            this._discardMenu(event); break;
        case "Enter":
            if (!isEnterKey(event))
                break;
            // Fall through
        case "U+0020": // Space
            if (this._highlightedMenuItemElement)
                this._triggerAction(this._highlightedMenuItemElement, event);
            break;
        }
        event.stopPropagation();
        event.preventDefault();
    },

    _glassPaneMouseUp: function(event)
    {
        // Return if this is simple 'click', since dispatched on glass pane, can't use 'click' event.
        if (event.x === this._x && event.y === this._y && new Date().getTime() - this._time < 300)
            return;
        this._discardMenu(event);
    },

    _discardMenu: function(event)
    {
        if (this._glassPaneElement) {
            var glassPane = this._glassPaneElement;
            delete this._glassPaneElement;
            // This can re-enter discardMenu due to blur.
            document.body.removeChild(glassPane);

            event.stopPropagation();
            event.preventDefault();
        }
    }
}

InspectorFrontendHost.showContextMenu = function(event, items)
{
    new WebInspector.SoftContextMenu(items).show(event);
}

}
