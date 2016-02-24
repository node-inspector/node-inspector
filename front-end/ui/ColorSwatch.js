// Copyright (c) 2015 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

/**
 * @constructor
 * @extends {HTMLSpanElement}
 */
WebInspector.ColorSwatch = function()
{
}

/**
 * @return {!WebInspector.ColorSwatch}
 */
WebInspector.ColorSwatch.create = function()
{
    if (!WebInspector.ColorSwatch._constructor)
        WebInspector.ColorSwatch._constructor = registerCustomElement("span", "color-swatch", WebInspector.ColorSwatch.prototype);

    return /** @type {!WebInspector.ColorSwatch} */(new WebInspector.ColorSwatch._constructor());
}

WebInspector.ColorSwatch.prototype = {
    /**
     * @return {!WebInspector.Color} color
     */
    color: function()
    {
        return this._color;
    },

    /**
     * @param {string} colorText
     */
    setColorText: function(colorText)
    {
        this._color = WebInspector.Color.parse(colorText);
        console.assert(this._color, "Color text could not be parsed.");
        this._format = this._color.format();
        this._colorValueElement.textContent = this._color.asString(this._format);
        this._swatchInner.style.backgroundColor = colorText;
    },

    /**
     * @return {!WebInspector.Color.Format}
     */
    format: function()
    {
        return this._format;
    },

    /**
     * @param {!WebInspector.Color.Format} format
     */
    setFormat: function(format)
    {
        this._format = format;
        this._colorValueElement.textContent = this._color.asString(this._format);
    },

    toggleNextFormat: function()
    {
        do {
            this._format = WebInspector.ColorSwatch._nextColorFormat(this._color, this._format);
            var currentValue = this._color.asString(this._format);
        } while (currentValue === this._colorValueElement.textContent);
        this._colorValueElement.textContent = currentValue;
    },

    /**
     * @return {!Element}
     */
    iconElement: function()
    {
        return this._iconElement;
    },

    createdCallback: function()
    {
        var root = WebInspector.createShadowRootWithCoreStyles(this);
        root.appendChild(WebInspector.Widget.createStyleElement("ui/colorSwatch.css"));

        this._iconElement = root.createChild("span", "color-swatch");
        this._iconElement.title = WebInspector.UIString("Shift-click to change color format");
        this._swatchInner = this._iconElement.createChild("span", "color-swatch-inner");
        this._swatchInner.addEventListener("dblclick", consumeEvent, false);
        this._swatchInner.addEventListener("mousedown", consumeEvent, false);
        this._swatchInner.addEventListener("click", this._handleClick.bind(this), true);

        root.createChild("content");
        this._colorValueElement = this.createChild("span");

        this.setColorText("white");
    },

    /**
     * @param {!Event} event
     */
    _handleClick: function(event)
    {
        if (!event.shiftKey)
            return;
        event.target.parentNode.parentNode.host.toggleNextFormat();
        event.consume(true);
    },

    __proto__: HTMLSpanElement.prototype
}

/**
 * @param {!WebInspector.Color} color
 * @param {string} curFormat
 */
WebInspector.ColorSwatch._nextColorFormat = function(color, curFormat)
{
    // The format loop is as follows:
    // * original
    // * rgb(a)
    // * hsl(a)
    // * nickname (if the color has a nickname)
    // * if the color is simple:
    //   - shorthex (if has short hex)
    //   - hex
    var cf = WebInspector.Color.Format;

    switch (curFormat) {
        case cf.Original:
            return !color.hasAlpha() ? cf.RGB : cf.RGBA;

        case cf.RGB:
        case cf.RGBA:
            return !color.hasAlpha() ? cf.HSL : cf.HSLA;

        case cf.HSL:
        case cf.HSLA:
            if (color.nickname())
                return cf.Nickname;
            if (!color.hasAlpha())
                return color.canBeShortHex() ? cf.ShortHEX : cf.HEX;
            else
                return cf.Original;

        case cf.ShortHEX:
            return cf.HEX;

        case cf.HEX:
            return cf.Original;

        case cf.Nickname:
            if (!color.hasAlpha())
                return color.canBeShortHex() ? cf.ShortHEX : cf.HEX;
            else
                return cf.Original;

        default:
            return cf.RGBA;
    }
}
