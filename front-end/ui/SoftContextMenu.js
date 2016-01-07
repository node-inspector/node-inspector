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

/**
 * @constructor
 * @param {!Array.<!InspectorFrontendHostAPI.ContextMenuDescriptor>} items
 * @param {function(string)} itemSelectedCallback
 * @param {!WebInspector.SoftContextMenu=} parentMenu
 */
WebInspector.SoftContextMenu = function(items, itemSelectedCallback, parentMenu)
{
    this._items = items;
    this._itemSelectedCallback = itemSelectedCallback;
    this._parentMenu = parentMenu;
}

WebInspector.SoftContextMenu.prototype = {
    /**
     * @param {!Document} document
     * @param {number} x
     * @param {number} y
     */
    show: function(document, x, y)
    {
        if (!this._items.length)
            return;

        this._document = document;
        this._x = x;
        this._y = y;
        this._time = new Date().getTime();

        // Create context menu.
        this.element = createElementWithClass("div", "soft-context-menu");
        var root = WebInspector.createShadowRootWithCoreStyles(this.element);
        root.appendChild(WebInspector.Widget.createStyleElement("ui/softContextMenu.css"));
        this._contextMenuElement = root.createChild("div");
        this.element.style.top = y + "px";
        this.element.style.left = x + "px";

        var maxHeight = WebInspector.Dialog.modalHostView().element.offsetHeight;
        maxHeight -= y - WebInspector.Dialog.modalHostView().element.totalOffsetTop();
        this.element.style.maxHeight = maxHeight + "px";

        this._contextMenuElement.tabIndex = 0;
        this._contextMenuElement.addEventListener("mouseup", consumeEvent, false);
        this._contextMenuElement.addEventListener("keydown", this._menuKeyDown.bind(this), false);

        for (var i = 0; i < this._items.length; ++i)
            this._contextMenuElement.appendChild(this._createMenuItem(this._items[i]));

        // Install glass pane capturing events.
        if (!this._parentMenu) {
            this._glassPaneElement = createElementWithClass("div", "soft-context-menu-glass-pane fill");
            this._glassPaneElement.tabIndex = 0;
            this._glassPaneElement.addEventListener("mouseup", this._glassPaneMouseUp.bind(this), false);
            this._glassPaneElement.appendChild(this.element);
            document.body.appendChild(this._glassPaneElement);
            this._discardMenuOnResizeListener = this._discardMenu.bind(this, true);
            document.defaultView.addEventListener("resize", this._discardMenuOnResizeListener, false);
            this._focus();
        } else {
            this._parentMenu._parentGlassPaneElement().appendChild(this.element);
        }

        // Re-position menu in case it does not fit.
        if (document.body.offsetWidth <  this.element.offsetLeft + this.element.offsetWidth)
            this.element.style.left = Math.max(0, document.body.offsetWidth - this.element.offsetWidth) + "px";
        if (document.body.offsetHeight < this.element.offsetTop + this.element.offsetHeight)
            this.element.style.top = Math.max(0, document.body.offsetHeight - this.element.offsetHeight) + "px";
    },

    discard: function()
    {
        this._discardMenu(true);
    },

    _parentGlassPaneElement: function()
    {
        if (this._glassPaneElement)
            return this._glassPaneElement;
        if (this._parentMenu)
            return this._parentMenu._parentGlassPaneElement();
        return null;
    },

    _createMenuItem: function(item)
    {
        if (item.type === "separator")
            return this._createSeparator();

        if (item.type === "subMenu")
            return this._createSubMenu(item);

        var menuItemElement = createElementWithClass("div", "soft-context-menu-item");
        var checkMarkElement = menuItemElement.createChild("div", "checkmark");
        if (!item.checked)
            checkMarkElement.style.opacity = "0";

        if (item.element) {
            var wrapper = menuItemElement.createChild("div", "soft-context-menu-custom-item");
            wrapper.appendChild(item.element);
            menuItemElement._isCustom = true;
            return menuItemElement;
        }

        menuItemElement.createTextChild(item.label);
        menuItemElement.createChild("span", "soft-context-menu-shortcut").textContent = item.shortcut;

        menuItemElement.addEventListener("mousedown", this._menuItemMouseDown.bind(this), false);
        menuItemElement.addEventListener("mouseup", this._menuItemMouseUp.bind(this), false);

        // Manually manage hover highlight since :hover does not work in case of click-and-hold menu invocation.
        menuItemElement.addEventListener("mouseover", this._menuItemMouseOver.bind(this), false);
        menuItemElement.addEventListener("mouseleave", this._menuItemMouseLeave.bind(this), false);

        menuItemElement._actionId = item.id;
        return menuItemElement;
    },

    _createSubMenu: function(item)
    {
        var menuItemElement = createElementWithClass("div", "soft-context-menu-item");
        menuItemElement._subItems = item.subItems;

        // Occupy the same space on the left in all items.
        var checkMarkElement = menuItemElement.createChild("span", "soft-context-menu-item-checkmark");
        checkMarkElement.textContent = "\u2713 "; // Checkmark Unicode symbol
        checkMarkElement.style.opacity = "0";

        menuItemElement.createTextChild(item.label);

        var subMenuArrowElement = menuItemElement.createChild("span", "soft-context-menu-item-submenu-arrow");
        subMenuArrowElement.textContent = "\u25B6"; // BLACK RIGHT-POINTING TRIANGLE

        menuItemElement.addEventListener("mousedown", this._menuItemMouseDown.bind(this), false);
        menuItemElement.addEventListener("mouseup", this._menuItemMouseUp.bind(this), false);

        // Manually manage hover highlight since :hover does not work in case of click-and-hold menu invocation.
        menuItemElement.addEventListener("mouseover", this._menuItemMouseOver.bind(this), false);
        menuItemElement.addEventListener("mouseleave", this._menuItemMouseLeave.bind(this), false);

        return menuItemElement;
    },

    _createSeparator: function()
    {
        var separatorElement = createElementWithClass("div", "soft-context-menu-separator");
        separatorElement._isSeparator = true;
        separatorElement.addEventListener("mouseover", this._hideSubMenu.bind(this), false);
        separatorElement.createChild("div", "separator-line");
        return separatorElement;
    },

    _menuItemMouseDown: function(event)
    {
        // Do not let separator's mouse down hit menu's handler - we need to receive mouse up!
        event.consume(true);
    },

    _menuItemMouseUp: function(event)
    {
        this._triggerAction(event.target, event);
        event.consume();
    },

    _focus: function()
    {
        this._contextMenuElement.focus();
    },

    _triggerAction: function(menuItemElement, event)
    {
        if (!menuItemElement._subItems) {
            this._discardMenu(true, event);
            if (typeof menuItemElement._actionId !== "undefined") {
                this._itemSelectedCallback(menuItemElement._actionId);
                delete menuItemElement._actionId;
            }
            return;
        }

        this._showSubMenu(menuItemElement);
        event.consume();
    },

    _showSubMenu: function(menuItemElement)
    {
        if (menuItemElement._subMenuTimer) {
            clearTimeout(menuItemElement._subMenuTimer);
            delete menuItemElement._subMenuTimer;
        }
        if (this._subMenu)
            return;

        this._subMenu = new WebInspector.SoftContextMenu(menuItemElement._subItems, this._itemSelectedCallback, this);
        var menuLeft = menuItemElement.totalOffsetLeft();
        var menuRight = menuLeft + menuItemElement.offsetWidth;
        var menuX = menuRight - 3;
        if (menuRight + menuItemElement.offsetWidth > this._document.body.offsetWidth)
            menuX = Math.max(0, menuLeft - menuItemElement.offsetWidth);
        this._subMenu.show(this._document, menuX, menuItemElement.totalOffsetTop() - 1);
    },

    _hideSubMenu: function()
    {
        if (!this._subMenu)
            return;
        this._subMenu._discardSubMenus();
        this._focus();
    },

    _menuItemMouseOver: function(event)
    {
        this._highlightMenuItem(event.target);
    },

    _menuItemMouseLeave: function(event)
    {
        if (!this._subMenu || !event.relatedTarget) {
            this._highlightMenuItem(null);
            return;
        }

        var relatedTarget = event.relatedTarget;
        if (relatedTarget.classList.contains("soft-context-menu-glass-pane"))
            this._highlightMenuItem(null);
    },

    _highlightMenuItem: function(menuItemElement)
    {
        if (this._highlightedMenuItemElement ===  menuItemElement)
            return;

        this._hideSubMenu();
        if (this._highlightedMenuItemElement) {
            this._highlightedMenuItemElement.classList.remove("soft-context-menu-item-mouse-over");
            if (this._highlightedMenuItemElement._subItems && this._highlightedMenuItemElement._subMenuTimer) {
                clearTimeout(this._highlightedMenuItemElement._subMenuTimer);
                delete this._highlightedMenuItemElement._subMenuTimer;
            }
        }
        this._highlightedMenuItemElement = menuItemElement;
        if (this._highlightedMenuItemElement) {
            this._highlightedMenuItemElement.classList.add("soft-context-menu-item-mouse-over");
            this._contextMenuElement.focus();
            if (this._highlightedMenuItemElement._subItems && !this._highlightedMenuItemElement._subMenuTimer)
                this._highlightedMenuItemElement._subMenuTimer = setTimeout(this._showSubMenu.bind(this, this._highlightedMenuItemElement), 150);
        }
    },

    _highlightPrevious: function()
    {
        var menuItemElement = this._highlightedMenuItemElement ? this._highlightedMenuItemElement.previousSibling : this._contextMenuElement.lastChild;
        while (menuItemElement && (menuItemElement._isSeparator || menuItemElement._isCustom))
            menuItemElement = menuItemElement.previousSibling;
        if (menuItemElement)
            this._highlightMenuItem(menuItemElement);
    },

    _highlightNext: function()
    {
        var menuItemElement = this._highlightedMenuItemElement ? this._highlightedMenuItemElement.nextSibling : this._contextMenuElement.firstChild;
        while (menuItemElement && (menuItemElement._isSeparator || menuItemElement._isCustom))
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
        case "Left":
            if (this._parentMenu) {
                this._highlightMenuItem(null);
                this._parentMenu._focus();
            }
            break;
        case "Right":
            if (!this._highlightedMenuItemElement)
                break;
            if (this._highlightedMenuItemElement._subItems) {
                this._showSubMenu(this._highlightedMenuItemElement);
                this._subMenu._focus();
                this._subMenu._highlightNext();
            }
            break;
        case "U+001B": // Escape
            this._discardMenu(true, event); break;
        case "Enter":
            if (!isEnterKey(event))
                break;
            // Fall through
        case "U+0020": // Space
            if (this._highlightedMenuItemElement)
                this._triggerAction(this._highlightedMenuItemElement, event);
            break;
        }
        event.consume(true);
    },

    _glassPaneMouseUp: function(event)
    {
        // Return if this is simple 'click', since dispatched on glass pane, can't use 'click' event.
        if (new Date().getTime() - this._time < 300)
            return;
        if (event.target === this.element)
            return;
        this._discardMenu(true, event);
        event.consume();
    },

    /**
     * @param {boolean} closeParentMenus
     * @param {!Event=} event
     */
    _discardMenu: function(closeParentMenus, event)
    {
        if (this._subMenu && !closeParentMenus)
            return;
        if (this._glassPaneElement) {
            var glassPane = this._glassPaneElement;
            delete this._glassPaneElement;
            // This can re-enter discardMenu due to blur.
            this._document.body.removeChild(glassPane);
            if (this._parentMenu) {
                delete this._parentMenu._subMenu;
                if (closeParentMenus)
                    this._parentMenu._discardMenu(closeParentMenus, event);
            }

            if (event)
                event.consume(true);
        } else if (this._parentMenu && this._contextMenuElement.parentElement) {
            this._discardSubMenus();
            if (closeParentMenus)
                this._parentMenu._discardMenu(closeParentMenus, event);

            if (event)
                event.consume(true);
        }
        if (this._discardMenuOnResizeListener) {
            this._document.defaultView.removeEventListener(this._discardMenuOnResizeListener);
            delete this._discardMenuOnResizeListener;
        }
    },

    _discardSubMenus: function()
    {
        if (this._subMenu)
            this._subMenu._discardSubMenus();
        this._contextMenuElement.remove();
        if (this._parentMenu)
            delete this._parentMenu._subMenu;
    }
}
