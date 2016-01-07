// Copyright (c) 2015 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

/**
 * @constructor
 * @extends {WebInspector.Object}
 */
WebInspector.StylesPopoverHelper = function()
{
    this._popover = new WebInspector.Popover();
    this._popover.setCanShrink(false);
    this._popover.setNoMargins(true);
    this._popover.element.addEventListener("mousedown", consumeEvent, false);

    this._hideProxy = this.hide.bind(this, true);
    this._boundOnKeyDown = this._onKeyDown.bind(this);
    this._repositionBound = this.reposition.bind(this);
    this._boundFocusOut = this._onFocusOut.bind(this);
}

WebInspector.StylesPopoverHelper.prototype = {
    /**
     * @param {!Event} event
     */
    _onFocusOut: function(event)
    {
        if (!event.relatedTarget || event.relatedTarget.isSelfOrDescendant(this._view.contentElement))
            return;
        this._hideProxy();
    },

    /**
     * @return {boolean}
     */
    isShowing: function()
    {
        return this._popover.isShowing();
    },

    /**
     * @param {!WebInspector.Widget} view
     * @param {!Element} anchorElement
     * @param {function(boolean)=} hiddenCallback
     */
    show: function(view, anchorElement, hiddenCallback)
    {
        if (this._popover.isShowing()) {
            if (this._anchorElement === anchorElement)
                return;

            // Reopen the picker for another anchor element.
            this.hide(true);
        }

        delete this._isHidden;
        this._anchorElement = anchorElement;
        this._view = view;
        this._hiddenCallback = hiddenCallback;
        this.reposition();

        var document = this._popover.element.ownerDocument;
        document.addEventListener("mousedown", this._hideProxy, false);
        document.defaultView.addEventListener("resize", this._hideProxy, false);
        this._view.contentElement.addEventListener("keydown", this._boundOnKeyDown, false);

        this._scrollerElement = anchorElement.enclosingNodeOrSelfWithClass("style-panes-wrapper");
        if (this._scrollerElement)
            this._scrollerElement.addEventListener("scroll", this._repositionBound, false);
    },

    /**
     * @param {!Event=} event
     */
    reposition: function(event)
    {
        if (!this._previousFocusElement)
            this._previousFocusElement = WebInspector.currentFocusElement();
        // Unbind "blur" listener to avoid reenterability: |popover.showView| will hide the popover and trigger it synchronously.
        this._view.contentElement.removeEventListener("focusout", this._boundFocusOut, false);
        this._popover.showView(this._view, this._anchorElement);
        this._view.contentElement.addEventListener("focusout", this._boundFocusOut, false);
        WebInspector.setCurrentFocusElement(this._view.contentElement);
    },

    /**
     * @param {boolean=} commitEdit
     */
    hide: function(commitEdit)
    {
        if (this._isHidden)
            return;
        var document = this._popover.element.ownerDocument;
        this._isHidden = true;
        this._popover.hide();

        if (this._scrollerElement)
            this._scrollerElement.removeEventListener("scroll", this._repositionBound, false);

        document.removeEventListener("mousedown", this._hideProxy, false);
        document.defaultView.removeEventListener("resize", this._hideProxy, false);

        if (this._hiddenCallback)
            this._hiddenCallback.call(null, !!commitEdit);

        WebInspector.setCurrentFocusElement(this._previousFocusElement);
        delete this._previousFocusElement;
        delete this._anchorElement;
        if (this._view) {
            this._view.detach();
            this._view.contentElement.removeEventListener("keydown", this._boundOnKeyDown, false);
            this._view.contentElement.removeEventListener("focusout", this._boundFocusOut, false);
            delete this._view;
        }
    },

    /**
     * @param {!Event} event
     */
    _onKeyDown: function(event)
    {
        if (event.keyIdentifier === "Enter") {
            this.hide(true);
            event.consume(true);
            return;
        }
        if (event.keyIdentifier === "U+001B") { // Escape key
            this.hide(false);
            event.consume(true);
        }
    },

    __proto__: WebInspector.Object.prototype
}

/**
 * @constructor
 * @param {!WebInspector.StylePropertyTreeElement} treeElement
 * @param {!WebInspector.StylesPopoverHelper} stylesPopoverHelper
 * @param {string} text
 */
WebInspector.BezierPopoverIcon = function(treeElement, stylesPopoverHelper, text)
{
    this._treeElement = treeElement;
    this._stylesPopoverHelper = stylesPopoverHelper;
    this._createDOM(text);

    this._boundBezierChanged = this._bezierChanged.bind(this);
}

WebInspector.BezierPopoverIcon.prototype = {
    /**
     * @return {!Element}
     */
    element: function()
    {
        return this._element;
    },

    /**
     * @param {string} text
     */
    _createDOM: function(text)
    {
        this._element = createElement("nobr");
        this._element.title = WebInspector.UIString("Open cubic bezier editor");

        this._iconElement = this._element.createSVGChild("svg", "popover-icon bezier-icon");
        this._iconElement.setAttribute("height", 10);
        this._iconElement.setAttribute("width", 10);
        this._iconElement.addEventListener("click", this._iconClick.bind(this), false);
        var g = this._iconElement.createSVGChild("g");
        var path = g.createSVGChild("path");
        path.setAttribute("d", "M2,8 C2,3 8,7 8,2");

        this._bezierValueElement = this._element.createChild("span");
        this._bezierValueElement.textContent = text;
    },

    /**
     * @param {!Event} event
     */
    _iconClick: function(event)
    {
        event.consume(true);
        if (this._stylesPopoverHelper.isShowing()) {
            this._stylesPopoverHelper.hide(true);
            return;
        }

        this._bezierEditor = new WebInspector.BezierEditor();
        var geometry = WebInspector.Geometry.CubicBezier.parse(this._bezierValueElement.textContent);
        this._bezierEditor.setBezier(geometry);
        this._bezierEditor.addEventListener(WebInspector.BezierEditor.Events.BezierChanged, this._boundBezierChanged);
        this._stylesPopoverHelper.show(this._bezierEditor, this._iconElement, this._onPopoverHidden.bind(this));

        this._originalPropertyText = this._treeElement.property.propertyText;
        this._treeElement.parentPane().setEditingStyle(true);
    },

    /**
     * @param {!WebInspector.Event} event
     */
    _bezierChanged: function(event)
    {
        this._bezierValueElement.textContent = /** @type {string} */ (event.data);
        this._treeElement.applyStyleText(this._treeElement.renderedPropertyText(), false);
    },

    /**
     * @param {boolean} commitEdit
     */
    _onPopoverHidden: function(commitEdit)
    {
        this._bezierEditor.removeEventListener(WebInspector.BezierEditor.Events.BezierChanged, this._boundBezierChanged);
        delete this._bezierEditor;

        var propertyText = commitEdit ? this._treeElement.renderedPropertyText() : this._originalPropertyText;
        this._treeElement.applyStyleText(propertyText, true);
        this._treeElement.parentPane().setEditingStyle(false);
        delete this._originalPropertyText;
    }
}

/**
 * @constructor
 * @param {!WebInspector.StylePropertyTreeElement} treeElement
 * @param {!WebInspector.StylesPopoverHelper} stylesPopoverHelper
 * @param {string} colorText
 */
WebInspector.ColorSwatchPopoverIcon = function(treeElement, stylesPopoverHelper, colorText)
{
    this._treeElement = treeElement;
    this._stylesPopoverHelper = stylesPopoverHelper;

    this._swatch = WebInspector.ColorSwatch.create();
    this._swatch.setColorText(colorText);
    this._swatch.setFormat(WebInspector.ColorSwatchPopoverIcon._colorFormat(this._swatch.color()));
    var shiftClickMessage = WebInspector.UIString("Shift + Click to change color format.");
    this._swatch.iconElement().title = WebInspector.UIString("Open color picker. %s", shiftClickMessage);
    this._swatch.iconElement().addEventListener("click", this._iconClick.bind(this));
    this._contrastColor = null;

    this._boundSpectrumChanged = this._spectrumChanged.bind(this);
}

/**
 * @param {!WebInspector.Color} color
 * @return {!WebInspector.Color.Format}
 */
WebInspector.ColorSwatchPopoverIcon._colorFormat = function(color)
{
    const cf = WebInspector.Color.Format;
    var format;
    var formatSetting = WebInspector.moduleSetting("colorFormat").get();
    if (formatSetting === cf.Original)
        format = cf.Original;
    else if (formatSetting === cf.RGB)
        format = (color.hasAlpha() ? cf.RGBA : cf.RGB);
    else if (formatSetting === cf.HSL)
        format = (color.hasAlpha() ? cf.HSLA : cf.HSL);
    else if (!color.hasAlpha())
        format = (color.canBeShortHex() ? cf.ShortHEX : cf.HEX);
    else
        format = cf.RGBA;

    return format;
}

WebInspector.ColorSwatchPopoverIcon.prototype = {
    /**
     * @return {!Element}
     */
    element: function()
    {
        return this._swatch;
    },

    /**
     * @param {!WebInspector.Color} color
     */
    setContrastColor: function(color)
    {
        this._contrastColor = color;
        if (this._spectrum)
            this._spectrum.setContrastColor(this._contrastColor);
    },

    /**
     * @param {!Event} event
     */
    _iconClick: function(event)
    {
        event.consume(true);
        if (this._stylesPopoverHelper.isShowing()) {
            this._stylesPopoverHelper.hide(true);
            return;
        }

        var color = this._swatch.color();
        var format = this._swatch.format();
        if (format === WebInspector.Color.Format.Original)
            format = color.format();
        this._spectrum = new WebInspector.Spectrum();
        this._spectrum.setColor(color, format);
        if (this._contrastColor)
            this._spectrum.setContrastColor(this._contrastColor);

        this._spectrum.addEventListener(WebInspector.Spectrum.Events.SizeChanged, this._spectrumResized, this);
        this._spectrum.addEventListener(WebInspector.Spectrum.Events.ColorChanged, this._boundSpectrumChanged);
        this._stylesPopoverHelper.show(this._spectrum, this._swatch.iconElement(), this._onPopoverHidden.bind(this));

        this._originalPropertyText = this._treeElement.property.propertyText;
        this._treeElement.parentPane().setEditingStyle(true);
    },

    /**
     * @param {!WebInspector.Event} event
     */
    _spectrumResized: function(event)
    {
        this._stylesPopoverHelper.reposition();
    },

    /**
     * @param {!WebInspector.Event} event
     */
    _spectrumChanged: function(event)
    {
        var colorString = /** @type {string} */ (event.data);
        this._swatch.setColorText(colorString);
        this._treeElement.applyStyleText(this._treeElement.renderedPropertyText(), false);
    },

    /**
     * @param {boolean} commitEdit
     */
    _onPopoverHidden: function(commitEdit)
    {
        this._spectrum.removeEventListener(WebInspector.Spectrum.Events.ColorChanged, this._boundSpectrumChanged);
        delete this._spectrum;

        var propertyText = commitEdit ? this._treeElement.renderedPropertyText() : this._originalPropertyText;
        this._treeElement.applyStyleText(propertyText, true);
        this._treeElement.parentPane().setEditingStyle(false);
        delete this._originalPropertyText;
    }
}
