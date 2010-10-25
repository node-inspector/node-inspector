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

WebInspector.BreakpointsSidebarPane = function(title)
{
    WebInspector.SidebarPane.call(this, title);

    this.listElement = document.createElement("ol");
    this.listElement.className = "breakpoint-list";

    this.emptyElement = document.createElement("div");
    this.emptyElement.className = "info";
    this.emptyElement.textContent = WebInspector.UIString("No Breakpoints");

    this.bodyElement.appendChild(this.emptyElement);
}

WebInspector.BreakpointsSidebarPane.prototype = {
    reset: function()
    {
        this.listElement.removeChildren();
        if (this.listElement.parentElement) {
            this.bodyElement.removeChild(this.listElement);
            this.bodyElement.appendChild(this.emptyElement);
        }
    },

    addBreakpoint: function(breakpointItem)
    {
        breakpointItem.addEventListener("removed", this._breakpointRemoved, this);

        var element = breakpointItem.element();
        element._breakpointItem = breakpointItem;

        var currentElement = this.listElement.firstChild;
        while (currentElement) {
             if (currentElement._breakpointItem.compareTo(element._breakpointItem) > 0) {
                this.listElement.insertBefore(element, currentElement);
                break;
            }
            currentElement = currentElement.nextSibling;
        }
        if (!currentElement)
            this.listElement.appendChild(element);

        element.addEventListener("contextmenu", this._contextMenuEventFired.bind(this, breakpointItem), true);

        if (this.emptyElement.parentElement) {
            this.bodyElement.removeChild(this.emptyElement);
            this.bodyElement.appendChild(this.listElement);
        }
    },

    _breakpointRemoved: function(event)
    {
        this.listElement.removeChild(event.target.element());
        if (!this.listElement.firstChild) {
            this.bodyElement.removeChild(this.listElement);
            this.bodyElement.appendChild(this.emptyElement);
        }
    },

    _contextMenuEventFired: function(breakpointItem, event)
    {
        var contextMenu = new WebInspector.ContextMenu();
        contextMenu.appendItem(WebInspector.UIString("Remove Breakpoint"), breakpointItem.remove.bind(breakpointItem));
        contextMenu.show(event);
    }
}

WebInspector.BreakpointsSidebarPane.prototype.__proto__ = WebInspector.SidebarPane.prototype;

WebInspector.XHRBreakpointsSidebarPane = function()
{
    WebInspector.BreakpointsSidebarPane.call(this, WebInspector.UIString("XHR Breakpoints"));

    var addButton = document.createElement("button");
    addButton.className = "add";
    addButton.addEventListener("click", this._showEditBreakpointDialog.bind(this), false);
    this.titleElement.appendChild(addButton);

    this.urlInputElement = document.createElement("span");
    this.urlInputElement.className = "breakpoint-condition editing";
}

WebInspector.XHRBreakpointsSidebarPane.prototype = {
    _showEditBreakpointDialog: function(event)
    {
        event.stopPropagation();

        if (this.urlInputElement.parentElement)
            return;

        if (!this.expanded)
            this.expanded = true;

        this.urlInputElement.textContent = "";
        this.bodyElement.insertBefore(this.urlInputElement, this.bodyElement.firstChild);
        WebInspector.startEditing(this.urlInputElement, this._hideEditBreakpointDialog.bind(this, false), this._hideEditBreakpointDialog.bind(this, true));
    },

    _hideEditBreakpointDialog: function(discard)
    {
        if (!discard)
            WebInspector.breakpointManager.createXHRBreakpoint(this.urlInputElement.textContent.toLowerCase());
        this.bodyElement.removeChild(this.urlInputElement);
    }
}

WebInspector.XHRBreakpointsSidebarPane.prototype.__proto__ = WebInspector.BreakpointsSidebarPane.prototype;

WebInspector.BreakpointItem = function(breakpoint)
{
    this._breakpoint = breakpoint;

    this._element = document.createElement("li");
    this._element.addEventListener("click", this._breakpointClicked.bind(this), false);

    var checkboxElement = document.createElement("input");
    checkboxElement.className = "checkbox-elem";
    checkboxElement.type = "checkbox";
    checkboxElement.checked = this._breakpoint.enabled;
    checkboxElement.addEventListener("click", this._checkboxClicked.bind(this), false);
    this._element.appendChild(checkboxElement);

    if ("populateLabelElement" in this._breakpoint)
        this._breakpoint.populateLabelElement(this._element);

    this._breakpoint.addEventListener("enable-changed", this._enableChanged, this);
    this._breakpoint.addEventListener("hit-state-changed", this._hitStateChanged, this);
    this._breakpoint.addEventListener("removed", this.dispatchEventToListeners.bind(this, "removed"));
}

WebInspector.BreakpointItem.prototype = {
    element: function()
    {
        return this._element;
    },

    compareTo: function(other)
    {
        return this._breakpoint.compareTo(other._breakpoint);
    },

    remove: function()
    {
        this._breakpoint.remove();
    },

    _breakpointClicked: function(event)
    {
        if ("click" in this._breakpoint)
            this._breakpoint.click();
    },

    _checkboxClicked: function(event)
    {
        this._breakpoint.enabled = !this._breakpoint.enabled;

        // Breakpoint element may have it's own click handler.
        event.stopPropagation();
    },

    _enableChanged: function(event)
    {
        var checkbox = this._element.firstChild;
        checkbox.checked = this._breakpoint.enabled;
    },

    _hitStateChanged: function(event)
    {
        if (event.target.hit)
            this._element.addStyleClass("breakpoint-hit");
        else
            this._element.removeStyleClass("breakpoint-hit");
    }
}

WebInspector.BreakpointItem.prototype.__proto__ = WebInspector.Object.prototype;

WebInspector.JSBreakpointItem = function(breakpoint)
{
    WebInspector.BreakpointItem.call(this, breakpoint);

    var displayName = this._breakpoint.url ? WebInspector.displayNameForURL(this._breakpoint.url) : WebInspector.UIString("(program)");
    var labelElement = document.createTextNode(displayName + ":" + this._breakpoint.line);
    this._element.appendChild(labelElement);

    var sourceTextElement = document.createElement("div");
    sourceTextElement.textContent = this._breakpoint.sourceText;
    sourceTextElement.className = "source-text monospace";
    this._element.appendChild(sourceTextElement);

    this._breakpoint.addEventListener("text-changed", this._textChanged, this);
}

WebInspector.JSBreakpointItem.prototype = {
    _breakpointClicked: function()
    {
        WebInspector.panels.scripts.showSourceLine(this._breakpoint.url, this._breakpoint.line);
    },

    _textChanged: function()
    {
        var sourceTextElement = this._element.firstChild.nextSibling.nextSibling;
        sourceTextElement.textContent = this._breakpoint.sourceText;
    }
}

WebInspector.JSBreakpointItem.prototype.__proto__ = WebInspector.BreakpointItem.prototype;

WebInspector.EventListenerBreakpointsSidebarPane = function()
{
    WebInspector.SidebarPane.call(this, WebInspector.UIString("Event Listener Breakpoints"));

    this.categoriesElement = document.createElement("ol");
    this.categoriesElement.tabIndex = 0;
    this.categoriesElement.addStyleClass("properties-tree event-listener-breakpoints");
    this.categoriesTreeOutline = new TreeOutline(this.categoriesElement);
    this.bodyElement.appendChild(this.categoriesElement);
}

WebInspector.EventListenerBreakpointsSidebarPane.prototype = {
    _populate: function()
    {
        var categories = {
            "Mouse": { type: "listener", eventNames: ["click", "dblclick", "mousedown", "mouseup", "mouseover", "mousemove", "mouseout", "mousewheel"] },
            "Keyboard": { type: "listener", eventNames: ["keydown", "keypress", "keyup"] },
            "HTML frame/object":  { type: "listener", eventNames: ["load", "error", "resize", "scroll"] },
            "Timer": { type: "instrumentation", eventNames: ["setTimer", "clearTimer", "timerFired"] }
        };

        for (var category in categories) {
            var categoryTreeElement = new TreeElement(WebInspector.UIString(category));
            this.categoriesTreeOutline.appendChild(categoryTreeElement);
            categoryTreeElement.listItemElement.addStyleClass("event-category");
            categoryTreeElement.selectable = true;

            var categoryItem = {};
            categoryItem.checkbox = this._createCheckbox(categoryTreeElement, this._categoryCheckboxClicked.bind(this, categoryItem));
            categoryItem.children = {};

            var categoryType = categories[category].type;
            var eventNames = categories[category].eventNames;
            for (var i = 0; i < eventNames.length; ++i) {
                var eventName = categoryType + ":" + eventNames[i];

                var breakpoint = WebInspector.breakpointManager.createEventListenerBreakpoint(eventName, true);
                if (!breakpoint)
                    continue;

                var labelElement = document.createElement("div");
                breakpoint.populateLabelElement(labelElement);
                var eventNameTreeElement = new TreeElement(labelElement);
                categoryTreeElement.appendChild(eventNameTreeElement);
                eventNameTreeElement.listItemElement.addStyleClass("source-code");
                eventNameTreeElement.selectable = true;

                var eventNameItem = {};
                eventNameItem.checkbox = this._createCheckbox(eventNameTreeElement, this._eventNameCheckboxClicked.bind(this, categoryItem, eventNameItem));
                eventNameItem.breakpoint = breakpoint;

                breakpoint.addEventListener("enable-changed", this._breakpointEnableChanged.bind(this, categoryItem, eventNameItem), true);

                categoryItem.children[eventName] = eventNameItem;
            }
        }
    },

    _createCheckbox: function(treeElement, checkboxClickedDelegate)
    {
        var checkbox = document.createElement("input");
        checkbox.className = "checkbox-elem";
        checkbox.type = "checkbox";
        checkbox.addEventListener("click", checkboxClickedDelegate, true);
        treeElement.listItemElement.insertBefore(checkbox, treeElement.listItemElement.firstChild);
        return checkbox;
    },

    _categoryCheckboxClicked: function(categoryItem)
    {
        var checkbox = categoryItem.checkbox;
        checkbox.indeterminate = false;
        for (var eventName in categoryItem.children) {
            var eventNameItem = categoryItem.children[eventName];
            eventNameItem.checkbox.checked = checkbox.checked;
            eventNameItem.breakpoint.enabled = checkbox.checked;
        }
    },

    _eventNameCheckboxClicked: function(categoryItem, eventNameItem)
    {
        this._updateCategoryCheckbox(categoryItem);
        eventNameItem.breakpoint.enabled = eventNameItem.checkbox.checked;
    },

    _breakpointEnableChanged: function(categoryItem, eventNameItem)
    {
        if (eventNameItem.checkbox.checked === eventNameItem.breakpoint.enabled)
            return;

        eventNameItem.checkbox.checked = eventNameItem.breakpoint.enabled;
        this._updateCategoryCheckbox(categoryItem);
    },

    _updateCategoryCheckbox: function(categoryItem)
    {
        var hasEnabled = false, hasDisabled = false;
        for (var eventName in categoryItem.children) {
            var eventNameItem = categoryItem.children[eventName];
            if (eventNameItem.checkbox.checked)
                hasEnabled = true;
            else
                hasDisabled = true;
        }
        categoryItem.checkbox.checked = hasEnabled;
        categoryItem.checkbox.indeterminate = hasEnabled && hasDisabled;
    },

    reset: function()
    {
        this.categoriesTreeOutline.removeChildren();
        this._populate();
    }
}

WebInspector.EventListenerBreakpointsSidebarPane.prototype.__proto__ = WebInspector.SidebarPane.prototype;
