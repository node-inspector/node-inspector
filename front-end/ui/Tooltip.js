// Copyright (c) 2015 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

/**
 * @constructor
 * @param {!Document} doc
 */
WebInspector.Tooltip = function(doc)
{
    this.element = doc.body.createChild("div");
    this._shadowRoot = WebInspector.createShadowRootWithCoreStyles(this.element);
    this._shadowRoot.appendChild(WebInspector.Widget.createStyleElement("ui/tooltip.css"));

    this._tooltipElement = this._shadowRoot.createChild("div", "tooltip");
    doc.addEventListener("mousemove", this._mouseMove.bind(this), true);
    doc.addEventListener("mousedown", this._hide.bind(this, true), true);
    doc.addEventListener("mouseout", this._hide.bind(this, true), true);
    doc.addEventListener("keydown", this._hide.bind(this, true), true);
}

WebInspector.Tooltip.Timing = {
    // Max time between tooltips showing that no opening delay is required.
    "InstantThreshold": 300,
    // Wait time before opening a tooltip.
    "OpeningDelay": 600
}

WebInspector.Tooltip.prototype = {
    /**
     * @param {!Event} event
     */
    _mouseMove: function(event)
    {
        var path = event.deepPath ? event.deepPath : event.path;
        if (!path || event.buttons !== 0)
            return;

        if (this._anchorElement && path.indexOf(this._anchorElement) === -1)
            this._hide();

        for (var element of path) {
            if (element === this._anchorElement) {
                return;
            } else if (element[WebInspector.Tooltip._symbol]) {
                this._show(element, event);
                return;
            }
        }
    },

    /**
     * @param {!Element} anchorElement
     * @param {!Event} event
     */
    _show: function(anchorElement, event)
    {
        var tooltip = anchorElement[WebInspector.Tooltip._symbol];
        this._anchorElement = anchorElement;
        this._tooltipElement.removeChildren();

        // Check if native tooltips should be used.
        for (var element of WebInspector.Tooltip._nativeOverrideContainer) {
            if (this._anchorElement.isSelfOrDescendant(element)) {
                Object.defineProperty(this._anchorElement, "title", WebInspector.Tooltip._nativeTitle);
                this._anchorElement.title = tooltip.content;
                return;
            }
        }

        if (typeof tooltip.content === "string")
            this._tooltipElement.textContent = tooltip.content;
        else
            this._tooltipElement.appendChild(tooltip.content);

        if (tooltip.actionId) {
            var shortcuts = WebInspector.shortcutRegistry.shortcutDescriptorsForAction(tooltip.actionId);
            for (var shortcut of shortcuts) {
                var shortcutElement = this._tooltipElement.createChild("div", "tooltip-shortcut");
                shortcutElement.textContent = shortcut.name;
            }
        }

        this._tooltipElement.classList.add("shown");
        // Reposition to ensure text doesn't overflow unnecessarily.
        this._tooltipElement.positionAt(0, 0);

        // Show tooltip instantly if a tooltip was shown recently.
        var now = Date.now();
        var instant = (this._tooltipLastClosed && now - this._tooltipLastClosed < WebInspector.Tooltip.Timing.InstantThreshold);
        this._tooltipElement.classList.toggle("instant", instant);
        this._tooltipLastOpened = instant ? now : now + WebInspector.Tooltip.Timing.OpeningDelay;

        // Get container element.
        var container = WebInspector.Dialog.modalHostView().element;
        if (!anchorElement.isDescendant(container))
            container = this.element.parentElement;

        // Posititon tooltip based on the anchor element.
        var containerOffset = container.offsetRelativeToWindow(this.element.window());
        var containerOffsetWidth = container.offsetWidth;
        var containerOffsetHeight = container.offsetHeight;
        var anchorBox = this._anchorElement.boxInWindow(this.element.window());
        const anchorOffset = 2;
        const pageMargin = 2;
        var cursorOffset = 10;
        this._tooltipElement.style.maxWidth = (containerOffsetWidth - pageMargin * 2) + "px";
        var tooltipWidth = this._tooltipElement.offsetWidth;
        var tooltipHeight = this._tooltipElement.offsetHeight;
        var anchorTooltipAtElement = this._anchorElement.nodeName === "BUTTON" || this._anchorElement.nodeName === "LABEL";
        var tooltipX = anchorTooltipAtElement ? anchorBox.x : event.x + cursorOffset;
        tooltipX = Number.constrain(tooltipX,
            containerOffset.x + pageMargin,
            containerOffset.x + containerOffsetWidth - tooltipWidth - pageMargin);
        var tooltipY;
        if (!anchorTooltipAtElement) {
            tooltipY = event.y + cursorOffset + tooltipHeight < containerOffset.y + containerOffsetHeight ? event.y + cursorOffset : event.y - tooltipHeight;
        } else {
            var onBottom = anchorBox.y + anchorOffset + anchorBox.height + tooltipHeight < containerOffset.y + containerOffsetHeight;
            tooltipY = onBottom ? anchorBox.y + anchorBox.height + anchorOffset : anchorBox.y - tooltipHeight - anchorOffset;
        }
        this._tooltipElement.positionAt(tooltipX, tooltipY);
    },

    /**
     * @param {boolean=} removeInstant
     */
    _hide: function(removeInstant)
    {
        delete this._anchorElement;
        this._tooltipElement.classList.remove("shown");
        if (Date.now() > this._tooltipLastOpened)
            this._tooltipLastClosed = Date.now();
        if (removeInstant)
            delete this._tooltipLastClosed;
    }
}

WebInspector.Tooltip._symbol = Symbol("Tooltip");

/**
 * @param {!Document} doc
 */
WebInspector.Tooltip.installHandler = function(doc)
{
    new WebInspector.Tooltip(doc);
}

/**
 * @param {!Element} element
 * @param {!Element|string} tooltipContent
 * @param {string=} actionId
 * @param {!Object=} options
 */
WebInspector.Tooltip.install = function(element, tooltipContent, actionId, options)
{
    if (typeof tooltipContent === "string" && tooltipContent === "") {
        delete element[WebInspector.Tooltip._symbol];
        return;
    }
    element[WebInspector.Tooltip._symbol] = { content: tooltipContent, actionId: actionId, options: options || {} };
}

/**
 * @param {!Element} element
 */
WebInspector.Tooltip.addNativeOverrideContainer = function(element)
{
    WebInspector.Tooltip._nativeOverrideContainer.push(element);
}

/** @type {!Array.<!Element>} */
WebInspector.Tooltip._nativeOverrideContainer = [];
WebInspector.Tooltip._nativeTitle = /** @type {!ObjectPropertyDescriptor} */(Object.getOwnPropertyDescriptor(HTMLElement.prototype, "title"));

Object.defineProperty(HTMLElement.prototype, "title", {
    /**
     * @return {!Element|string}
     * @this {!Element}
     */
    get: function()
    {
        var tooltip = this[WebInspector.Tooltip._symbol];
        return tooltip ? tooltip.content : "";
    },

    /**
     * @param {!Element|string} x
     * @this {!Element}
     */
    set: function(x)
    {
        WebInspector.Tooltip.install(this, x);
    }
});
