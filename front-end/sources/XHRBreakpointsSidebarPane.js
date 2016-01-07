// Copyright (c) 2015 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

/**
 * @constructor
 * @extends {WebInspector.BreakpointsSidebarPaneBase}
 * @implements {WebInspector.TargetManager.Observer}
 */
WebInspector.XHRBreakpointsSidebarPane = function()
{
    WebInspector.BreakpointsSidebarPaneBase.call(this, WebInspector.UIString("XHR Breakpoints"));
    this._xhrBreakpointsSetting = WebInspector.settings.createLocalSetting("xhrBreakpoints", []);

    /** @type {!Map.<string, !Element>} */
    this._breakpointElements = new Map();

    var addButton = new WebInspector.ToolbarButton(WebInspector.UIString("Add breakpoint"), "add-toolbar-item");
    addButton.addEventListener("click", this._addButtonClicked.bind(this));
    this.toolbar().appendToolbarItem(addButton);

    this.emptyElement.addEventListener("contextmenu", this._emptyElementContextMenu.bind(this), true);

    WebInspector.targetManager.observeTargets(this);
}

WebInspector.XHRBreakpointsSidebarPane.prototype = {
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

    _emptyElementContextMenu: function(event)
    {
        var contextMenu = new WebInspector.ContextMenu(event);
        contextMenu.appendItem(WebInspector.UIString.capitalize("Add ^breakpoint"), this._addButtonClicked.bind(this));
        contextMenu.show();
    },

    _addButtonClicked: function(event)
    {
        if (event)
            event.consume();

        this.expand();

        var inputElementContainer = createElementWithClass("p", "breakpoint-condition");
        inputElementContainer.textContent = WebInspector.UIString("Break when URL contains:");

        var inputElement = inputElementContainer.createChild("span", "editing");
        inputElement.id = "breakpoint-condition-input";
        this.addListElement(inputElementContainer, /** @type {?Element} */ (this.listElement.firstChild));

        /**
         * @param {boolean} accept
         * @param {!Element} e
         * @param {string} text
         * @this {WebInspector.XHRBreakpointsSidebarPane}
         */
        function finishEditing(accept, e, text)
        {
            this.removeListElement(inputElementContainer);
            if (accept) {
                this._setBreakpoint(text, true);
                this._saveBreakpoints();
            }
        }

        var config = new WebInspector.InplaceEditor.Config(finishEditing.bind(this, true), finishEditing.bind(this, false));
        WebInspector.InplaceEditor.startEditing(inputElement, config);
    },

    /**
     * @param {string} url
     * @param {boolean} enabled
     * @param {!WebInspector.Target=} target
     */
    _setBreakpoint: function(url, enabled, target)
    {
        if (enabled)
            this._updateBreakpointOnTarget(url, true, target);

        if (this._breakpointElements.has(url))
            return;

        var element = createElement("li");
        element._url = url;
        element.addEventListener("contextmenu", this._contextMenu.bind(this, url), true);

        var title = url ? WebInspector.UIString("URL contains \"%s\"", url) : WebInspector.UIString("Any XHR");
        var label = createCheckboxLabel(title, enabled);
        element.appendChild(label);
        label.checkboxElement.addEventListener("click", this._checkboxClicked.bind(this, url), false);
        element._checkboxElement = label.checkboxElement;

        label.textElement.classList.add("cursor-auto");
        label.textElement.addEventListener("dblclick", this._labelClicked.bind(this, url), false);

        var currentElement = /** @type {?Element} */ (this.listElement.firstChild);
        while (currentElement) {
            if (currentElement._url && currentElement._url < element._url)
                break;
            currentElement = /** @type {?Element} */ (currentElement.nextSibling);
        }
        this.addListElement(element, currentElement);
        this._breakpointElements.set(url, element);
    },

    /**
     * @param {string} url
     * @param {!WebInspector.Target=} target
     */
    _removeBreakpoint: function(url, target)
    {
        var element = this._breakpointElements.get(url);
        if (!element)
            return;

        this.removeListElement(element);
        this._breakpointElements.delete(url);
        if (element._checkboxElement.checked)
            this._updateBreakpointOnTarget(url, false, target);
    },

    /**
     * @param {string} url
     * @param {boolean} enable
     * @param {!WebInspector.Target=} target
     */
    _updateBreakpointOnTarget: function(url, enable, target)
    {
        var targets = target ? [target] : WebInspector.targetManager.targets();
        for (var i = 0; i < targets.length; ++i) {
            if (enable)
                targets[i].domdebuggerAgent().setXHRBreakpoint(url);
            else
                targets[i].domdebuggerAgent().removeXHRBreakpoint(url);
        }
    },

    _contextMenu: function(url, event)
    {
        var contextMenu = new WebInspector.ContextMenu(event);

        /**
         * @this {WebInspector.XHRBreakpointsSidebarPane}
         */
        function removeBreakpoint()
        {
            this._removeBreakpoint(url);
            this._saveBreakpoints();
        }

        /**
         * @this {WebInspector.XHRBreakpointsSidebarPane}
         */
        function removeAllBreakpoints()
        {
            for (var url of this._breakpointElements.keys())
                this._removeBreakpoint(url);
            this._saveBreakpoints();
        }
        var removeAllTitle = WebInspector.UIString.capitalize("Remove ^all ^breakpoints");

        contextMenu.appendItem(WebInspector.UIString.capitalize("Add ^breakpoint"), this._addButtonClicked.bind(this));
        contextMenu.appendItem(WebInspector.UIString.capitalize("Remove ^breakpoint"), removeBreakpoint.bind(this));
        contextMenu.appendItem(removeAllTitle, removeAllBreakpoints.bind(this));
        contextMenu.show();
    },

    _checkboxClicked: function(url, event)
    {
        this._updateBreakpointOnTarget(url, event.target.checked);
        this._saveBreakpoints();
    },

    _labelClicked: function(url)
    {
        var element = this._breakpointElements.get(url) || null;
        var inputElement = createElementWithClass("span", "breakpoint-condition editing");
        inputElement.textContent = url;
        this.listElement.insertBefore(inputElement, element);
        element.classList.add("hidden");

        /**
         * @param {boolean} accept
         * @param {!Element} e
         * @param {string} text
         * @this {WebInspector.XHRBreakpointsSidebarPane}
         */
        function finishEditing(accept, e, text)
        {
            this.removeListElement(inputElement);
            if (accept) {
                this._removeBreakpoint(url);
                this._setBreakpoint(text, element._checkboxElement.checked);
                this._saveBreakpoints();
            } else
                element.classList.remove("hidden");
        }

        WebInspector.InplaceEditor.startEditing(inputElement, new WebInspector.InplaceEditor.Config(finishEditing.bind(this, true), finishEditing.bind(this, false)));
    },

    highlightBreakpoint: function(url)
    {
        var element = this._breakpointElements.get(url);
        if (!element)
            return;
        this.expand();
        element.classList.add("breakpoint-hit");
        this._highlightedElement = element;
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
        for (var url of this._breakpointElements.keys())
            breakpoints.push({ url: url, enabled: this._breakpointElements.get(url)._checkboxElement.checked });
        this._xhrBreakpointsSetting.set(breakpoints);
    },

    /**
     * @param {!WebInspector.Target} target
     */
    _restoreBreakpoints: function(target)
    {
        var breakpoints = this._xhrBreakpointsSetting.get();
        for (var i = 0; i < breakpoints.length; ++i) {
            var breakpoint = breakpoints[i];
            if (breakpoint && typeof breakpoint.url === "string")
                this._setBreakpoint(breakpoint.url, breakpoint.enabled, target);
        }
    },

    __proto__: WebInspector.BreakpointsSidebarPaneBase.prototype
}
