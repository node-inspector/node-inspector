// Copyright (c) 2015 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

/**
 * @constructor
 * @extends {WebInspector.SidebarPane}
 * @implements {WebInspector.TargetManager.Observer}
 */
WebInspector.EventListenerBreakpointsSidebarPane = function()
{
    WebInspector.SidebarPane.call(this, WebInspector.UIString("Event Listener Breakpoints"));
    this.registerRequiredCSS("components/breakpointsList.css");

    this._eventListenerBreakpointsSetting = WebInspector.settings.createLocalSetting("eventListenerBreakpoints", []);

    this._categoriesTreeOutline = new TreeOutline();
    this._categoriesTreeOutline.element.tabIndex = 0;
    this._categoriesTreeOutline.element.classList.add("event-listener-breakpoints");
    this.element.appendChild(this._categoriesTreeOutline.element);

    this._categoryItems = [];
    // FIXME: uncomment following once inspector stops being drop targer in major ports.
    // Otherwise, inspector page reacts on drop event and tries to load the event data.
    // this._createCategory(WebInspector.UIString("Drag"), ["drag", "drop", "dragstart", "dragend", "dragenter", "dragleave", "dragover"]);
    this._createCategory(WebInspector.UIString("Animation"), ["requestAnimationFrame", "cancelAnimationFrame", "animationFrameFired"], true);
    this._createCategory(WebInspector.UIString("Clipboard"), ["copy", "cut", "paste", "beforecopy", "beforecut", "beforepaste"]);
    this._createCategory(WebInspector.UIString("Control"), ["resize", "scroll", "zoom", "focus", "blur", "select", "change", "submit", "reset"]);
    this._createCategory(WebInspector.UIString("Device"), ["deviceorientation", "devicemotion"]);
    this._createCategory(WebInspector.UIString("DOM Mutation"), ["DOMActivate", "DOMFocusIn", "DOMFocusOut", "DOMAttrModified", "DOMCharacterDataModified", "DOMNodeInserted", "DOMNodeInsertedIntoDocument", "DOMNodeRemoved", "DOMNodeRemovedFromDocument", "DOMSubtreeModified", "DOMContentLoaded"]);
    this._createCategory(WebInspector.UIString("Drag / drop"), ["dragenter", "dragover", "dragleave", "drop"]);
    this._createCategory(WebInspector.UIString("Keyboard"), ["keydown", "keyup", "keypress", "input"]);
    this._createCategory(WebInspector.UIString("Load"), ["load", "beforeunload", "unload", "abort", "error", "hashchange", "popstate"]);
    this._createCategory(WebInspector.UIString("Media"), ["play", "pause", "playing", "canplay", "canplaythrough", "seeking", "seeked", "timeupdate", "ended", "ratechange", "durationchange", "volumechange", "loadstart", "progress", "suspend", "abort", "error", "emptied", "stalled", "loadedmetadata", "loadeddata", "waiting"], false, ["audio", "video"]);
    this._createCategory(WebInspector.UIString("Mouse"), ["click", "dblclick", "mousedown", "mouseup", "mouseover", "mousemove", "mouseout", "mouseenter", "mouseleave", "mousewheel", "wheel", "contextmenu"]);
    this._createCategory(WebInspector.UIString("Parse"), ["setInnerHTML"], true);
    this._createCategory(WebInspector.UIString("Pointer"), ["pointerover", "pointerout", "pointerenter", "pointerleave", "pointerdown", "pointerup", "pointermove", "pointercancel", "gotpointercapture", "lostpointercapture"], true);
    this._createCategory(WebInspector.UIString("Script"), ["scriptFirstStatement"], true);
    this._createCategory(WebInspector.UIString("Timer"), ["setTimer", "clearTimer", "timerFired"], true);
    this._createCategory(WebInspector.UIString("Touch"), ["touchstart", "touchmove", "touchend", "touchcancel"]);
    this._createCategory(WebInspector.UIString("WebGL"), ["webglErrorFired", "webglWarningFired"], true);
    this._createCategory(WebInspector.UIString("Window"), ["close"], true);
    this._createCategory(WebInspector.UIString("XHR"), ["readystatechange", "load", "loadstart", "loadend", "abort", "error", "progress", "timeout"], false, ["XMLHttpRequest", "XMLHttpRequestUpload"]);

    WebInspector.targetManager.observeTargets(this);
}

WebInspector.EventListenerBreakpointsSidebarPane.categoryListener = "listener:";
WebInspector.EventListenerBreakpointsSidebarPane.categoryInstrumentation = "instrumentation:";
WebInspector.EventListenerBreakpointsSidebarPane.eventTargetAny = "*";

/**
 * @param {string} eventName
 * @param {!Object=} auxData
 * @return {string}
 */
WebInspector.EventListenerBreakpointsSidebarPane.eventNameForUI = function(eventName, auxData)
{
    if (!WebInspector.EventListenerBreakpointsSidebarPane._eventNamesForUI) {
        WebInspector.EventListenerBreakpointsSidebarPane._eventNamesForUI = {
            "instrumentation:setTimer": WebInspector.UIString("Set Timer"),
            "instrumentation:clearTimer": WebInspector.UIString("Clear Timer"),
            "instrumentation:timerFired": WebInspector.UIString("Timer Fired"),
            "instrumentation:scriptFirstStatement": WebInspector.UIString("Script First Statement"),
            "instrumentation:requestAnimationFrame": WebInspector.UIString("Request Animation Frame"),
            "instrumentation:cancelAnimationFrame": WebInspector.UIString("Cancel Animation Frame"),
            "instrumentation:animationFrameFired": WebInspector.UIString("Animation Frame Fired"),
            "instrumentation:webglErrorFired": WebInspector.UIString("WebGL Error Fired"),
            "instrumentation:webglWarningFired": WebInspector.UIString("WebGL Warning Fired"),
            "instrumentation:setInnerHTML": WebInspector.UIString("Set innerHTML"),
        };
    }
    if (auxData) {
        if (eventName === "instrumentation:webglErrorFired" && auxData["webglErrorName"]) {
            var errorName = auxData["webglErrorName"];
            // If there is a hex code of the error, display only this.
            errorName = errorName.replace(/^.*(0x[0-9a-f]+).*$/i, "$1");
            return WebInspector.UIString("WebGL Error Fired (%s)", errorName);
        }
    }
    return WebInspector.EventListenerBreakpointsSidebarPane._eventNamesForUI[eventName] || eventName.substring(eventName.indexOf(":") + 1);
}

WebInspector.EventListenerBreakpointsSidebarPane.prototype = {
    /**
     * @override
     * @param {!WebInspector.Target} target
     */
    targetAdded: function(target)
    {
        this._restoreBreakpoints(target);
    },

    /**
     * @override
     * @param {!WebInspector.Target} target
     */
    targetRemoved: function(target) { },

    /**
     * @param {string} name
     * @param {!Array.<string>} eventNames
     * @param {boolean=} isInstrumentationEvent
     * @param {!Array.<string>=} targetNames
     */
    _createCategory: function(name, eventNames, isInstrumentationEvent, targetNames)
    {
        var labelNode = createCheckboxLabel(name);

        var categoryItem = {};
        categoryItem.element = new TreeElement(labelNode);
        this._categoriesTreeOutline.appendChild(categoryItem.element);
        categoryItem.element.listItemElement.classList.add("event-category");
        categoryItem.element.selectable = true;

        categoryItem.checkbox = labelNode.checkboxElement;
        categoryItem.checkbox.addEventListener("click", this._categoryCheckboxClicked.bind(this, categoryItem), true);

        categoryItem.targetNames = this._stringArrayToLowerCase(targetNames || [WebInspector.EventListenerBreakpointsSidebarPane.eventTargetAny]);
        categoryItem.children = {};
        var category = (isInstrumentationEvent ? WebInspector.EventListenerBreakpointsSidebarPane.categoryInstrumentation :  WebInspector.EventListenerBreakpointsSidebarPane.categoryListener);
        for (var i = 0; i < eventNames.length; ++i) {
            var eventName = category + eventNames[i];

            var breakpointItem = {};
            var title = WebInspector.EventListenerBreakpointsSidebarPane.eventNameForUI(eventName);

            labelNode = createCheckboxLabel(title);
            labelNode.classList.add("source-code");

            breakpointItem.element = new TreeElement(labelNode);
            categoryItem.element.appendChild(breakpointItem.element);

            breakpointItem.element.listItemElement.createChild("div", "breakpoint-hit-marker");
            breakpointItem.element.selectable = false;

            breakpointItem.checkbox = labelNode.checkboxElement;
            breakpointItem.checkbox.addEventListener("click", this._breakpointCheckboxClicked.bind(this, eventName, categoryItem.targetNames), true);
            breakpointItem.parent = categoryItem;

            categoryItem.children[eventName] = breakpointItem;
        }
        this._categoryItems.push(categoryItem);
    },

    /**
     * @param {!Array.<string>} array
     * @return {!Array.<string>}
     */
    _stringArrayToLowerCase: function(array)
    {
        return array.map(function(value) {
            return value.toLowerCase();
        });
    },

    _categoryCheckboxClicked: function(categoryItem)
    {
        var checked = categoryItem.checkbox.checked;
        for (var eventName in categoryItem.children) {
            var breakpointItem = categoryItem.children[eventName];
            if (breakpointItem.checkbox.checked === checked)
                continue;
            if (checked)
                this._setBreakpoint(eventName, categoryItem.targetNames);
            else
                this._removeBreakpoint(eventName, categoryItem.targetNames);
        }
        this._saveBreakpoints();
    },

    /**
     * @param {string} eventName
     * @param {!Array.<string>} targetNames
     * @param {!Event} event
     */
    _breakpointCheckboxClicked: function(eventName, targetNames, event)
    {
        if (event.target.checked)
            this._setBreakpoint(eventName, targetNames);
        else
            this._removeBreakpoint(eventName, targetNames);
        this._saveBreakpoints();
    },

    /**
     * @param {string} eventName
     * @param {?Array.<string>=} eventTargetNames
     * @param {!WebInspector.Target=} target
     */
    _setBreakpoint: function(eventName, eventTargetNames, target)
    {
        eventTargetNames = eventTargetNames || [WebInspector.EventListenerBreakpointsSidebarPane.eventTargetAny];
        for (var i = 0; i < eventTargetNames.length; ++i) {
            var eventTargetName = eventTargetNames[i];
            var breakpointItem = this._findBreakpointItem(eventName, eventTargetName);
            if (!breakpointItem)
                continue;
            breakpointItem.checkbox.checked = true;
            breakpointItem.parent.dirtyCheckbox = true;
            this._updateBreakpointOnTarget(eventName, eventTargetName, true, target);
        }
        this._updateCategoryCheckboxes();
    },

    /**
     * @param {string} eventName
     * @param {?Array.<string>=} eventTargetNames
     * @param {!WebInspector.Target=} target
     */
    _removeBreakpoint: function(eventName, eventTargetNames, target)
    {
        eventTargetNames = eventTargetNames || [WebInspector.EventListenerBreakpointsSidebarPane.eventTargetAny];
        for (var i = 0; i < eventTargetNames.length; ++i) {
            var eventTargetName = eventTargetNames[i];
            var breakpointItem = this._findBreakpointItem(eventName, eventTargetName);
            if (!breakpointItem)
                continue;
            breakpointItem.checkbox.checked = false;
            breakpointItem.parent.dirtyCheckbox = true;
            this._updateBreakpointOnTarget(eventName, eventTargetName, false, target);
        }
        this._updateCategoryCheckboxes();
    },

    /**
     * @param {string} eventName
     * @param {string} eventTargetName
     * @param {boolean} enable
     * @param {!WebInspector.Target=} target
     */
    _updateBreakpointOnTarget: function(eventName, eventTargetName, enable, target)
    {
        var targets = target ? [target] : WebInspector.targetManager.targets();
        for (var i = 0; i < targets.length; ++i) {
            if (eventName.startsWith(WebInspector.EventListenerBreakpointsSidebarPane.categoryListener)) {
                var protocolEventName = eventName.substring(WebInspector.EventListenerBreakpointsSidebarPane.categoryListener.length);
                if (enable)
                    targets[i].domdebuggerAgent().setEventListenerBreakpoint(protocolEventName, eventTargetName);
                else
                    targets[i].domdebuggerAgent().removeEventListenerBreakpoint(protocolEventName, eventTargetName);
            } else if (eventName.startsWith(WebInspector.EventListenerBreakpointsSidebarPane.categoryInstrumentation)) {
                var protocolEventName = eventName.substring(WebInspector.EventListenerBreakpointsSidebarPane.categoryInstrumentation.length);
                if (enable)
                    targets[i].domdebuggerAgent().setInstrumentationBreakpoint(protocolEventName);
                else
                    targets[i].domdebuggerAgent().removeInstrumentationBreakpoint(protocolEventName);
            }
        }
    },

    _updateCategoryCheckboxes: function()
    {
        for (var i = 0; i < this._categoryItems.length; ++i) {
            var categoryItem = this._categoryItems[i];
            if (!categoryItem.dirtyCheckbox)
                continue;
            categoryItem.dirtyCheckbox = false;
            var hasEnabled = false;
            var hasDisabled = false;
            for (var eventName in categoryItem.children) {
                var breakpointItem = categoryItem.children[eventName];
                if (breakpointItem.checkbox.checked)
                    hasEnabled = true;
                else
                    hasDisabled = true;
            }
            categoryItem.checkbox.checked = hasEnabled;
            categoryItem.checkbox.indeterminate = hasEnabled && hasDisabled;
        }
    },

    /**
     * @param {string} eventName
     * @param {string=} targetName
     * @return {?Object}
     */
    _findBreakpointItem: function(eventName, targetName)
    {
        targetName = (targetName || WebInspector.EventListenerBreakpointsSidebarPane.eventTargetAny).toLowerCase();
        for (var i = 0; i < this._categoryItems.length; ++i) {
            var categoryItem = this._categoryItems[i];
            if (categoryItem.targetNames.indexOf(targetName) === -1)
                continue;
            var breakpointItem = categoryItem.children[eventName];
            if (breakpointItem)
                return breakpointItem;
        }
        return null;
    },

    /**
     * @param {string} eventName
     * @param {string=} targetName
     */
    highlightBreakpoint: function(eventName, targetName)
    {
        var breakpointItem = this._findBreakpointItem(eventName, targetName);
        if (!breakpointItem || !breakpointItem.checkbox.checked)
            breakpointItem = this._findBreakpointItem(eventName, WebInspector.EventListenerBreakpointsSidebarPane.eventTargetAny);
        if (!breakpointItem)
            return;
        this.expand();
        breakpointItem.parent.element.expand();
        breakpointItem.element.listItemElement.classList.add("breakpoint-hit");
        this._highlightedElement = breakpointItem.element.listItemElement;
    },

    clearBreakpointHighlight: function()
    {
        if (this._highlightedElement) {
            this._highlightedElement.classList.remove("breakpoint-hit");
            delete this._highlightedElement;
        }
    },

    _saveBreakpoints: function()
    {
        var breakpoints = [];
        for (var i = 0; i < this._categoryItems.length; ++i) {
            var categoryItem = this._categoryItems[i];
            for (var eventName in categoryItem.children) {
                var breakpointItem = categoryItem.children[eventName];
                if (breakpointItem.checkbox.checked)
                    breakpoints.push({ eventName: eventName, targetNames: categoryItem.targetNames });
            }
        }
        this._eventListenerBreakpointsSetting.set(breakpoints);
    },

    /**
     * @param {!WebInspector.Target} target
     */
    _restoreBreakpoints: function(target)
    {
        var breakpoints = this._eventListenerBreakpointsSetting.get();
        for (var i = 0; i < breakpoints.length; ++i) {
            var breakpoint = breakpoints[i];
            if (breakpoint && typeof breakpoint.eventName === "string")
                this._setBreakpoint(breakpoint.eventName, breakpoint.targetNames, target);
        }
    },

    __proto__: WebInspector.SidebarPane.prototype
}
