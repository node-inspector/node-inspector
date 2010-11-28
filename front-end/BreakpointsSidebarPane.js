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

    addBreakpointItem: function(breakpointItem)
    {
        var element = breakpointItem.element;
        element._breakpointItem = breakpointItem;

        breakpointItem.addEventListener("breakpoint-hit", this.expand, this);
        breakpointItem.addEventListener("removed", this._removeListElement.bind(this, element), this);

        var currentElement = this.listElement.firstChild;
        while (currentElement) {
            if (currentElement._breakpointItem && currentElement._breakpointItem.compareTo(element._breakpointItem) > 0)
                break;
            currentElement = currentElement.nextSibling;
        }
        this._addListElement(element, currentElement);

        if (breakpointItem.click) {
            element.addStyleClass("cursor-pointer");
            element.addEventListener("click", breakpointItem.click.bind(breakpointItem), false);
        }
        element.addEventListener("contextmenu", this._contextMenuEventFired.bind(this, breakpointItem), true);
    },

    _contextMenuEventFired: function(breakpointItem, event)
    {
        var contextMenu = new WebInspector.ContextMenu();
        contextMenu.appendItem(WebInspector.UIString("Remove Breakpoint"), breakpointItem.remove.bind(breakpointItem));
        contextMenu.show(event);
    },

    _addListElement: function(element, beforeElement)
    {
        if (beforeElement)
            this.listElement.insertBefore(element, beforeElement);
        else {
            if (!this.listElement.firstChild) {
                this.bodyElement.removeChild(this.emptyElement);
                this.bodyElement.appendChild(this.listElement);
            }
            this.listElement.appendChild(element);
        }
    },

    _removeListElement: function(element)
    {
        this.listElement.removeChild(element);
        if (!this.listElement.firstChild) {
            this.bodyElement.removeChild(this.listElement);
            this.bodyElement.appendChild(this.emptyElement);
        }
    }
}

WebInspector.BreakpointsSidebarPane.prototype.__proto__ = WebInspector.SidebarPane.prototype;

WebInspector.XHRBreakpointsSidebarPane = function()
{
    WebInspector.BreakpointsSidebarPane.call(this, WebInspector.UIString("XHR Breakpoints"));

    function addButtonClicked(event)
    {
        event.stopPropagation();
        this._startEditingBreakpoint(null);
    }

    var addButton = document.createElement("button");
    addButton.className = "add";
    addButton.addEventListener("click", addButtonClicked.bind(this), false);
    this.titleElement.appendChild(addButton);
}

WebInspector.XHRBreakpointsSidebarPane.prototype = {
    addBreakpointItem: function(breakpointItem)
    {
        WebInspector.BreakpointsSidebarPane.prototype.addBreakpointItem.call(this, breakpointItem);
        breakpointItem._labelElement.addEventListener("dblclick", this._startEditingBreakpoint.bind(this, breakpointItem), false);
    },

    _startEditingBreakpoint: function(breakpointItem)
    {
        if (this._editingBreakpoint)
            return;
        this._editingBreakpoint = true;

        if (!this.expanded)
            this.expanded = true;

        var inputElement = document.createElement("span");
        inputElement.className = "breakpoint-condition editing";
        if (breakpointItem) {
            breakpointItem.populateEditElement(inputElement);
            this.listElement.insertBefore(inputElement, breakpointItem.element);
            breakpointItem.element.addStyleClass("hidden");
        } else
            this._addListElement(inputElement, this.listElement.firstChild);

        var commitHandler = this._hideEditBreakpointDialog.bind(this, inputElement, true, breakpointItem);
        var cancelHandler = this._hideEditBreakpointDialog.bind(this, inputElement, false, breakpointItem);
        WebInspector.startEditing(inputElement, commitHandler, cancelHandler);
    },

    _hideEditBreakpointDialog: function(inputElement, accept, breakpointItem)
    {
        this._removeListElement(inputElement);
        this._editingBreakpoint = false;
        if (accept) {
            if (breakpointItem)
                breakpointItem.remove();
            WebInspector.breakpointManager.createXHRBreakpoint(inputElement.textContent.toLowerCase());
        } else if (breakpointItem)
            breakpointItem.element.removeStyleClass("hidden");
    }
}

WebInspector.XHRBreakpointsSidebarPane.prototype.__proto__ = WebInspector.BreakpointsSidebarPane.prototype;

WebInspector.BreakpointItem = function(breakpoint)
{
    this._breakpoint = breakpoint;

    this._element = document.createElement("li");

    var checkboxElement = document.createElement("input");
    checkboxElement.className = "checkbox-elem";
    checkboxElement.type = "checkbox";
    checkboxElement.checked = this._breakpoint.enabled;
    checkboxElement.addEventListener("click", this._checkboxClicked.bind(this), false);
    this._element.appendChild(checkboxElement);

    this._createLabelElement();

    this._breakpoint.addEventListener("enable-changed", this._enableChanged, this);
    this._breakpoint.addEventListener("hit-state-changed", this._hitStateChanged, this);
    this._breakpoint.addEventListener("label-changed", this._labelChanged, this);
    this._breakpoint.addEventListener("removed", this.dispatchEventToListeners.bind(this, "removed"));
    if (breakpoint.click)
        this.click = breakpoint.click.bind(breakpoint);
}

WebInspector.BreakpointItem.prototype = {
    get element()
    {
        return this._element;
    },

    compareTo: function(other)
    {
        return this._breakpoint.compareTo(other._breakpoint);
    },

    populateEditElement: function(element)
    {
        this._breakpoint.populateEditElement(element);
    },

    remove: function()
    {
        this._breakpoint.remove();
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
        if (event.target.hit) {
            this._element.addStyleClass("breakpoint-hit");
            this.dispatchEventToListeners("breakpoint-hit");
        } else
            this._element.removeStyleClass("breakpoint-hit");
    },

    _labelChanged: function(event)
    {
        this._element.removeChild(this._labelElement);
        this._createLabelElement();
    },

    _createLabelElement: function()
    {
        this._labelElement = document.createElement("span");
        this._breakpoint.populateLabelElement(this._labelElement);
        this._element.appendChild(this._labelElement);
    }
}

WebInspector.BreakpointItem.prototype.__proto__ = WebInspector.Object.prototype;

WebInspector.EventListenerBreakpointsSidebarPane = function()
{
    WebInspector.SidebarPane.call(this, WebInspector.UIString("Event Listener Breakpoints"));

    this.categoriesElement = document.createElement("ol");
    this.categoriesElement.tabIndex = 0;
    this.categoriesElement.addStyleClass("properties-tree event-listener-breakpoints");
    this.categoriesTreeOutline = new TreeOutline(this.categoriesElement);
    this.bodyElement.appendChild(this.categoriesElement);

    WebInspector.breakpointManager.addEventListener("event-listener-breakpoint-added", this._breakpointAdded, this);

    this._breakpointItems = {};
    this._createCategory("Keyboard", "listener", ["keydown", "keyup", "keypress", "textInput"]);
    this._createCategory("Mouse", "listener", ["click", "dblclick", "mousedown", "mouseup", "mouseover", "mousemove", "mouseout", "mousewheel"]);
    // FIXME: uncomment following once inspector stops being drop targer in major ports.
    // Otherwise, inspector page reacts on drop event and tries to load the event data.
    // this._createCategory("Drag", "listener", ["drag", "drop", "dragstart", "dragend", "dragenter", "dragleave", "dragover"]);
    this._createCategory("Control", "listener", ["resize", "scroll", "zoom", "focus", "blur", "select", "change", "submit", "reset"]);
    this._createCategory("Clipboard", "listener", ["copy", "cut", "paste", "beforecopy", "beforecut", "beforepaste"]);
    this._createCategory("Load", "listener", ["load", "unload", "abort", "error"]);
    this._createCategory("DOM Mutation", "listener", ["DOMActivate", "DOMFocusIn", "DOMFocusOut", "DOMAttrModified", "DOMCharacterDataModified", "DOMNodeInserted", "DOMNodeInsertedIntoDocument", "DOMNodeRemoved", "DOMNodeRemovedFromDocument", "DOMSubtreeModified", "DOMContentLoaded"]);
    this._createCategory("Device", "listener", ["deviceorientation", "devicemotion"]);
    this._createCategory("Timer", "instrumentation", ["setTimer", "clearTimer", "timerFired"]);
}

WebInspector.EventListenerBreakpointsSidebarPane.prototype = {
    _createCategory: function(name, type, eventNames)
    {
        var categoryItem = {};
        categoryItem.element = new TreeElement(WebInspector.UIString(name));
        this.categoriesTreeOutline.appendChild(categoryItem.element);
        categoryItem.element.listItemElement.addStyleClass("event-category");
        categoryItem.element.selectable = true;

        categoryItem.checkbox = this._createCheckbox(categoryItem.element);
        categoryItem.checkbox.addEventListener("click", this._categoryCheckboxClicked.bind(this, categoryItem), true);

        categoryItem.children = {};
        for (var i = 0; i < eventNames.length; ++i) {
            var eventName = type + ":" + eventNames[i];

            var breakpointItem = {};
            var title = WebInspector.EventListenerBreakpoint.eventNameForUI(eventName);
            breakpointItem.element = new TreeElement(title);
            categoryItem.element.appendChild(breakpointItem.element);
            var hitMarker = document.createElement("div");
            hitMarker.className = "breakpoint-hit-marker";
            breakpointItem.element.listItemElement.appendChild(hitMarker);
            breakpointItem.element.listItemElement.addStyleClass("source-code");
            breakpointItem.element.selectable = true;

            breakpointItem.checkbox = this._createCheckbox(breakpointItem.element);
            breakpointItem.checkbox.addEventListener("click", this._breakpointCheckboxClicked.bind(this, breakpointItem), true);
            breakpointItem.parent = categoryItem;
            breakpointItem.eventName = eventName;

            this._breakpointItems[eventName] = breakpointItem;
            categoryItem.children[eventName] = breakpointItem;
        }
    },

    _createCheckbox: function(treeElement)
    {
        var checkbox = document.createElement("input");
        checkbox.className = "checkbox-elem";
        checkbox.type = "checkbox";
        treeElement.listItemElement.insertBefore(checkbox, treeElement.listItemElement.firstChild);
        return checkbox;
    },

    _categoryCheckboxClicked: function(categoryItem)
    {
        var checked = categoryItem.checkbox.checked;
        for (var eventName in categoryItem.children) {
            var breakpointItem = categoryItem.children[eventName];
            if (breakpointItem.checkbox.checked !== checked) {
                breakpointItem.checkbox.checked = checked;
                this._breakpointCheckboxClicked(breakpointItem);
            }
        }
    },

    _breakpointCheckboxClicked: function(breakpointItem)
    {
        if (breakpointItem.checkbox.checked)
            WebInspector.breakpointManager.createEventListenerBreakpoint(breakpointItem.eventName);
        else
            breakpointItem.breakpoint.remove();
    },

    _breakpointAdded: function(event)
    {
        var breakpoint = event.data.breakpoint;
        var eventName = event.data.eventName;

        var breakpointItem = this._breakpointItems[eventName];
        breakpointItem.breakpoint = breakpoint;
        breakpoint.addEventListener("hit-state-changed", this._breakpointHitStateChanged.bind(this, breakpointItem));
        breakpoint.addEventListener("removed", this._breakpointRemoved.bind(this, breakpointItem));
        breakpointItem.checkbox.checked = true;
        this._updateCategoryCheckbox(breakpointItem);
    },

    _breakpointHitStateChanged: function(breakpointItem, event)
    {
        if (event.target.hit) {
            this.expanded = true;
            var categoryItem = breakpointItem.parent;
            categoryItem.element.expand();
            breakpointItem.element.listItemElement.addStyleClass("breakpoint-hit");
        } else
            breakpointItem.element.listItemElement.removeStyleClass("breakpoint-hit");
    },

    _breakpointRemoved: function(breakpointItem)
    {
        breakpointItem.breakpoint = null;
        breakpointItem.checkbox.checked = false;
        this._updateCategoryCheckbox(breakpointItem);
    },

    _updateCategoryCheckbox: function(breakpointItem)
    {
        var categoryItem = breakpointItem.parent;
        var hasEnabled = false, hasDisabled = false;
        for (var eventName in categoryItem.children) {
            var breakpointItem = categoryItem.children[eventName];
            if (breakpointItem.checkbox.checked)
                hasEnabled = true;
            else
                hasDisabled = true;
        }
        categoryItem.checkbox.checked = hasEnabled;
        categoryItem.checkbox.indeterminate = hasEnabled && hasDisabled;
    },

    reset: function()
    {
        for (var eventName in this._breakpointItems) {
            var breakpointItem = this._breakpointItems[eventName];
            breakpointItem.breakpoint = null;
            breakpointItem.checkbox.checked = false;
            this._updateCategoryCheckbox(breakpointItem);
        }
    }
}

WebInspector.EventListenerBreakpointsSidebarPane.prototype.__proto__ = WebInspector.SidebarPane.prototype;
