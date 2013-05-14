/*
 * Copyright (C) 2009 Apple Inc.  All rights reserved.
 * Copyright (C) 2009 Joseph Pecoraro
 *
 * Redistribution and use in source and binary forms, with or without
 * modification, are permitted provided that the following conditions
 * are met:
 *
 * 1.  Redistributions of source code must retain the above copyright
 *     notice, this list of conditions and the following disclaimer.
 * 2.  Redistributions in binary form must reproduce the above copyright
 *     notice, this list of conditions and the following disclaimer in the
 *     documentation and/or other materials provided with the distribution.
 * 3.  Neither the name of Apple Computer, Inc. ("Apple") nor the names of
 *     its contributors may be used to endorse or promote products derived
 *     from this software without specific prior written permission.
 *
 * THIS SOFTWARE IS PROVIDED BY APPLE AND ITS CONTRIBUTORS "AS IS" AND ANY
 * EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED
 * WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
 * DISCLAIMED. IN NO EVENT SHALL APPLE OR ITS CONTRIBUTORS BE LIABLE FOR ANY
 * DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES
 * (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES;
 * LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND
 * ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT
 * (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF
 * THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
 */

/**
 * @param {Array.<number>} rgba
 * @param {string=} format
 * @param {string=} originalText
 * @constructor
 */
WebInspector.Color = function(rgba, format, originalText)
{
    this._rgba = rgba;
    this._originalText = originalText || null;
    this._format = format || null;
    if (typeof this._rgba[3] === "undefined")
        this._rgba[3] = 1;
    for (var i = 0; i < 4; ++i) {
        if (this._rgba[i] < 0)
            this._rgba[i] = 0;
        if (this._rgba[i] > 1)
            this._rgba[i] = 1;
    }
}

/**
 * @param {string} text
 * @return {?WebInspector.Color}
 */
WebInspector.Color.parse = function(text)
{
    // Simple - #hex, rgb(), nickname, hsl()
    var value = text.toLowerCase().replace(/\s+/g, "");
    var simple = /^(?:#([0-9a-f]{3,6})|rgb\(([^)]+)\)|(\w+)|hsl\(([^)]+)\))$/i;
    var match = value.match(simple);
    if (match) {
        if (match[1]) { // hex
            var hex = match[1].toUpperCase();
            var format;
            if (hex.length === 3) {
                format = WebInspector.Color.Format.ShortHEX;
                hex = hex.charAt(0) + hex.charAt(0) + hex.charAt(1) + hex.charAt(1) + hex.charAt(2) + hex.charAt(2);
            } else
                format = WebInspector.Color.Format.HEX;
            var r = parseInt(hex.substring(0,2), 16);
            var g = parseInt(hex.substring(2,4), 16);
            var b = parseInt(hex.substring(4,6), 16);
            return new WebInspector.Color([r / 255, g / 255, b / 255, 1], format, text);
        }

        if (match[2]) { // rgb
            var rgbString = match[2].split(/\s*,\s*/);
            var rgba = [ WebInspector.Color._parseRgbNumeric(rgbString[0]),
                         WebInspector.Color._parseRgbNumeric(rgbString[1]),
                         WebInspector.Color._parseRgbNumeric(rgbString[2]), 1 ];
            return new WebInspector.Color(rgba, WebInspector.Color.Format.RGB, text);
        }

        if (match[3]) { // nickname
            var nickname = match[3].toLowerCase();
            if (nickname in WebInspector.Color.Nicknames) {
                var rgba = WebInspector.Color.Nicknames[nickname];
                var color = WebInspector.Color.fromRGBA(rgba);
                color._format = WebInspector.Color.Format.Nickname;
                color._originalText = nickname;
                return color;
            }
            return null;
        }

        if (match[4]) { // hsl
            var hslString = match[4].replace(/%/g, "").split(/\s*,\s*/);
            var hsla = [ WebInspector.Color._parseHueNumeric(hslString[0]),
                         WebInspector.Color._parseSatLightNumeric(hslString[1]),
                         WebInspector.Color._parseSatLightNumeric(hslString[2]), 1 ];
            var rgba = WebInspector.Color._hsl2rgb(hsla);
            return new WebInspector.Color(rgba, WebInspector.Color.Format.HSL, text);
        }

        return null;
    }

    // Advanced - rgba(), hsla()
    var advanced = /^(?:rgba\(([^)]+)\)|hsla\(([^)]+)\))$/;
    match = value.match(advanced);
    if (match) {
        if (match[1]) { // rgba
            var rgbaString = match[1].split(/\s*,\s*/);
            var rgba = [ WebInspector.Color._parseRgbNumeric(rgbaString[0]),
                         WebInspector.Color._parseRgbNumeric(rgbaString[1]),
                         WebInspector.Color._parseRgbNumeric(rgbaString[2]),
                         WebInspector.Color._parseAlphaNumeric(rgbaString[3]) ];
            return new WebInspector.Color(rgba, WebInspector.Color.Format.RGBA, text);
        }

        if (match[2]) { // hsla
            var hslaString = match[2].replace(/%/g, "").split(/\s*,\s*/);
            var hsla = [ WebInspector.Color._parseHueNumeric(hslaString[0]),
                         WebInspector.Color._parseSatLightNumeric(hslaString[1]),
                         WebInspector.Color._parseSatLightNumeric(hslaString[2]),
                         WebInspector.Color._parseAlphaNumeric(hslaString[3]) ];
            var rgba = WebInspector.Color._hsl2rgb(hsla);
            return new WebInspector.Color(rgba, WebInspector.Color.Format.HSLA, text);
        }
    }

    return null;
}

/**
 * @param {Array.<number>} rgba
 * @return {WebInspector.Color}
 */
WebInspector.Color.fromRGBA = function(rgba)
{
    return new WebInspector.Color([rgba[0] / 255, rgba[1] / 255, rgba[2] / 255, rgba[3]]);
}

/**
 * @param {Array.<number>} hsva
 * @return {WebInspector.Color}
 */
WebInspector.Color.fromHSVA = function(hsva)
{
    var h = hsva[0];
    var s = hsva[1];
    var v = hsva[2];

    var t = (2 - s) * v;
    if (v === 0 || s === 0)
        s = 0;
    else
        s *= v / (t < 1 ? t : 2 - t);
    var hsla = [h, s, t / 2, hsva[3]];

    return new WebInspector.Color(WebInspector.Color._hsl2rgb(hsla), WebInspector.Color.Format.HSLA);
}

WebInspector.Color.prototype = {
    /**
     * @return {?string}
     */
    format: function()
    {
        return this._format;
    },

    /**
     * @return {Array.<number>} HSLA with components within [0..1]
     */
    hsla: function()
    {
        if (this._hsla)
            return this._hsla;
        var r = this._rgba[0];
        var g = this._rgba[1];
        var b = this._rgba[2];
        var max = Math.max(r, g, b);
        var min = Math.min(r, g, b);
        var diff = max - min;
        var add = max + min;

        if (min === max)
            var h = 0;
        else if (r === max)
            var h = ((1/6 * (g - b) / diff) + 1) % 1;
        else if (g === max)
            var h = (1/6 * (b - r) / diff) + 1/3;
        else
            var h = (1/6 * (r - g) / diff) + 2/3;

        var l = 0.5 * add;

        if (l === 0)
            var s = 0;
        else if (l === 1)
            var s = 1;
        else if (l <= 0.5)
            var s = diff / add;
        else
            var s = diff / (2 - add);

        this._hsla = [h, s, l, this._rgba[3]];
        return this._hsla;
    },

    /**
     * @return {Array.<number>} HSVA with components within [0..1]
     */
    hsva: function()
    {
        var hsla = this.hsla();
        var h = hsla[0];
        var s = hsla[1];
        var l = hsla[2];

        s *= l < 0.5 ? l : 1 - l;
        return [h, s !== 0 ? 2 * s / (l + s) : 0, (l + s), hsla[3]];
    },

    /**
     * @return {boolean}
     */
    hasAlpha: function()
    {
        return this._rgba[3] !== 1;
    },

    /**
     * @return {boolean}
     */
    canBeShortHex: function()
    {
        if (this.hasAlpha())
            return false;
        for (var i = 0; i < 3; ++i) {
            var c = Math.round(this._rgba[i] * 255);
            if (c % 17)
                return false;
        }
        return true;
    },

    /**
     * @return {?string}
     */
    toString: function(format)
    {
        if (!format)
            format = this._format;

        /**
         * @param {number} value
         * @return {number}
         */
        function toRgbValue(value)
        {
            return Math.round(value * 255);
        }

        /**
         * @param {number} value
         * @return {string}
         */
        function toHexValue(value)
        {
            var hex = Math.round(value * 255).toString(16);
            return hex.length === 1 ? "0" + hex : hex;
        }

        /**
         * @param {number} value
         * @return {string}
         */
        function toShortHexValue(value)
        {
            return (Math.round(value * 255) / 17).toString(16);
        }

        switch (format) {
        case WebInspector.Color.Format.Original:
            return this._originalText;
        case WebInspector.Color.Format.RGB:
            if (this.hasAlpha())
                return null;
            return String.sprintf("rgb(%d, %d, %d)", toRgbValue(this._rgba[0]), toRgbValue(this._rgba[1]), toRgbValue(this._rgba[2]));
        case WebInspector.Color.Format.RGBA:
            return String.sprintf("rgba(%d, %d, %d, %f)", toRgbValue(this._rgba[0]), toRgbValue(this._rgba[1]), toRgbValue(this._rgba[2]), this._rgba[3]);
        case WebInspector.Color.Format.HSL:
            if (this.hasAlpha())
                return null;
            var hsl = this.hsla();
            return String.sprintf("hsl(%d, %d%, %d%)", Math.round(hsl[0] * 360), Math.round(hsl[1] * 100), Math.round(hsl[2] * 100));
        case WebInspector.Color.Format.HSLA:
            var hsla = this.hsla();
            return String.sprintf("hsla(%d, %d%, %d%, %f)", Math.round(hsla[0] * 360), Math.round(hsla[1] * 100), Math.round(hsla[2] * 100), hsla[3]);
        case WebInspector.Color.Format.HEX:
            if (this.hasAlpha())
                return null;
            return String.sprintf("#%s%s%s", toHexValue(this._rgba[0]), toHexValue(this._rgba[1]), toHexValue(this._rgba[2])).toUpperCase();
        case WebInspector.Color.Format.ShortHEX:
            if (!this.canBeShortHex())
                return null;
            return String.sprintf("#%s%s%s", toShortHexValue(this._rgba[0]), toShortHexValue(this._rgba[1]), toShortHexValue(this._rgba[2])).toUpperCase();
        case WebInspector.Color.Format.Nickname:
            return this.nickname();
        }

        return this._originalText;
    },

    /**
     * @return {Array.<number>}
     */
    _canonicalRGBA: function()
    {
        var rgba = new Array(3);
        for (var i = 0; i < 3; ++i)
            rgba[i] = Math.round(this._rgba[i] * 255);
        if (this._rgba[3] !== 1)
            rgba.push(this._rgba[3]);
        return rgba;
    },

    /**
     * @return {?string} nickname
     */
    nickname: function()
    {
        if (!WebInspector.Color._rgbaToNickname) {
            WebInspector.Color._rgbaToNickname = {};
            for (var nickname in WebInspector.Color.Nicknames) {
                var rgba = WebInspector.Color.Nicknames[nickname];
                WebInspector.Color._rgbaToNickname[rgba] = nickname;
            }
        }

        return WebInspector.Color._rgbaToNickname[this._canonicalRGBA()] || null;
    },

    /**
     * @return {DOMAgent.RGBA}
     */
    toProtocolRGBA: function()
    {
        var rgba = this._canonicalRGBA();
        var result = { r: rgba[0], g: rgba[1], b: rgba[2] };
        if (rgba[3] !== 1)
            result.a = rgba[3];
        return result;
    }
}

/**
 * @param {string} value
 * return {number}
 */
WebInspector.Color._parseRgbNumeric = function(value)
{
    var parsed = parseInt(value, 10);
    if (value.indexOf("%") !== -1)
        parsed /= 100;
    else
        parsed /= 255;
    return parsed;
}

/**
 * @param {string} value
 * return {number}
 */
WebInspector.Color._parseHueNumeric = function(value)
{
    return isNaN(value) ? 0 : (parseFloat(value) / 360) % 1;
}

/**
 * @param {string} value
 * return {number}
 */
WebInspector.Color._parseSatLightNumeric = function(value)
{
    return parseFloat(value) / 100;
}

/**
 * @param {string} value
 * return {number}
 */
WebInspector.Color._parseAlphaNumeric = function(value)
{
    return isNaN(value) ? 0 : parseFloat(value);
}

/**
 * @param {Array.<number>} hsl
 * @return {Array.<number>}
 */
WebInspector.Color._hsl2rgb = function(hsl)
{
    var h = hsl[0];
    var s = hsl[1];
    var l = hsl[2];

    function hue2rgb(p, q, h)
    {
        if (h < 0)
            h += 1;
        else if (h > 1)
            h -= 1;

        if ((h * 6) < 1)
            return p + (q - p) * h * 6;
        else if ((h * 2) < 1)
            return q;
        else if ((h * 3) < 2)
            return p + (q - p) * ((2 / 3) - h) * 6;
        else
            return p;
    }

    if (s < 0)
        s = 0;

    if (l <= 0.5)
        var q = l * (1 + s);
    else
        var q = l + s - (l * s);

    var p = 2 * l - q;

    var tr = h + (1 / 3);
    var tg = h;
    var tb = h - (1 / 3);

    var r = hue2rgb(p, q, tr);
    var g = hue2rgb(p, q, tg);
    var b = hue2rgb(p, q, tb);
    return [r, g, b, hsl[3]];
}

WebInspector.Color.Nicknames = {
    "aliceBlue":          [240,248,255],
    "antiqueWhite":       [250,235,215],
    "aquamarine":         [127,255,212],
    "azure":              [240,255,255],
    "beige":              [245,245,220],
    "bisque":             [255,228,196],
    "black":              [0,0,0],
    "blanchedAlmond":     [255,235,205],
    "blue":               [0,0,255],
    "blueViolet":         [138,43,226],
    "brown":              [165,42,42],
    "burlyWood":          [222,184,135],
    "cadetBlue":          [95,158,160],
    "chartreuse":         [127,255,0],
    "chocolate":          [210,105,30],
    "coral":              [255,127,80],
    "cornflowerBlue":     [100,149,237],
    "cornsilk":           [255,248,220],
    "crimson":            [237,20,61],
    "cyan":               [0,255,255],
    "darkBlue":           [0,0,139],
    "darkCyan":           [0,139,139],
    "darkGoldenrod":      [184,134,11],
    "darkGray":           [169,169,169],
    "darkGreen":          [0,100,0],
    "darkKhaki":          [189,183,107],
    "darkMagenta":        [139,0,139],
    "darkOliveGreen":     [85,107,47],
    "darkOrange":         [255,140,0],
    "darkOrchid":         [153,50,204],
    "darkRed":            [139,0,0],
    "darkSalmon":         [233,150,122],
    "darkSeaGreen":       [143,188,143],
    "darkSlateBlue":      [72,61,139],
    "darkSlateGray":      [47,79,79],
    "darkTurquoise":      [0,206,209],
    "darkViolet":         [148,0,211],
    "deepPink":           [255,20,147],
    "deepSkyBlue":        [0,191,255],
    "dimGray":            [105,105,105],
    "dodgerBlue":         [30,144,255],
    "fireBrick":          [178,34,34],
    "floralWhite":        [255,250,240],
    "forestGreen":        [34,139,34],
    "gainsboro":          [220,220,220],
    "ghostWhite":         [248,248,255],
    "gold":               [255,215,0],
    "goldenrod":          [218,165,32],
    "gray":               [128,128,128],
    "green":              [0,128,0],
    "greenYellow":        [173,255,47],
    "honeyDew":           [240,255,240],
    "hotPink":            [255,105,180],
    "indianRed":          [205,92,92],
    "indigo":             [75,0,130],
    "ivory":              [255,255,240],
    "khaki":              [240,230,140],
    "lavender":           [230,230,250],
    "lavenderBlush":      [255,240,245],
    "lawnGreen":          [124,252,0],
    "lemonChiffon":       [255,250,205],
    "lightBlue":          [173,216,230],
    "lightCoral":         [240,128,128],
    "lightCyan":          [224,255,255],
    "lightGoldenrodYellow":[250,250,210],
    "lightGreen":         [144,238,144],
    "lightGrey":          [211,211,211],
    "lightPink":          [255,182,193],
    "lightSalmon":        [255,160,122],
    "lightSeaGreen":      [32,178,170],
    "lightSkyBlue":       [135,206,250],
    "lightSlateGray":     [119,136,153],
    "lightSteelBlue":     [176,196,222],
    "lightYellow":        [255,255,224],
    "lime":               [0,255,0],
    "limeGreen":          [50,205,50],
    "linen":              [250,240,230],
    "magenta":            [255,0,255],
    "maroon":             [128,0,0],
    "mediumAquaMarine":   [102,205,170],
    "mediumBlue":         [0,0,205],
    "mediumOrchid":       [186,85,211],
    "mediumPurple":       [147,112,219],
    "mediumSeaGreen":     [60,179,113],
    "mediumSlateBlue":    [123,104,238],
    "mediumSpringGreen":  [0,250,154],
    "mediumTurquoise":    [72,209,204],
    "mediumVioletRed":    [199,21,133],
    "midnightBlue":       [25,25,112],
    "mintCream":          [245,255,250],
    "mistyRose":          [255,228,225],
    "moccasin":           [255,228,181],
    "navajoWhite":        [255,222,173],
    "navy":               [0,0,128],
    "oldLace":            [253,245,230],
    "olive":              [128,128,0],
    "oliveDrab":          [107,142,35],
    "orange":             [255,165,0],
    "orangeRed":          [255,69,0],
    "orchid":             [218,112,214],
    "paleGoldenrod":      [238,232,170],
    "paleGreen":          [152,251,152],
    "paleTurquoise":      [175,238,238],
    "paleVioletRed":      [219,112,147],
    "papayaWhip":         [255,239,213],
    "peachPuff":          [255,218,185],
    "peru":               [205,133,63],
    "pink":               [255,192,203],
    "plum":               [221,160,221],
    "powderBlue":         [176,224,230],
    "purple":             [128,0,128],
    "red":                [255,0,0],
    "rosyBrown":          [188,143,143],
    "royalBlue":          [65,105,225],
    "saddleBrown":        [139,69,19],
    "salmon":             [250,128,114],
    "sandyBrown":         [244,164,96],
    "seaGreen":           [46,139,87],
    "seaShell":           [255,245,238],
    "sienna":             [160,82,45],
    "silver":             [192,192,192],
    "skyBlue":            [135,206,235],
    "slateBlue":          [106,90,205],
    "slateGray":          [112,128,144],
    "snow":               [255,250,250],
    "springGreen":        [0,255,127],
    "steelBlue":          [70,130,180],
    "tan":                [210,180,140],
    "teal":               [0,128,128],
    "thistle":            [216,191,216],
    "tomato":             [255,99,71],
    "turquoise":          [64,224,208],
    "violet":             [238,130,238],
    "wheat":              [245,222,179],
    "white":              [255,255,255],
    "whiteSmoke":         [245,245,245],
    "yellow":             [255,255,0],
    "yellowGreen":        [154,205,50],
    "transparent":        [0, 0, 0, 0],
};

WebInspector.Color.PageHighlight = {
    Content: WebInspector.Color.fromRGBA([111, 168, 220, .66]),
    ContentLight: WebInspector.Color.fromRGBA([111, 168, 220, .5]),
    ContentOutline: WebInspector.Color.fromRGBA([9, 83, 148]),
    Padding: WebInspector.Color.fromRGBA([147, 196, 125, .55]),
    PaddingLight: WebInspector.Color.fromRGBA([147, 196, 125, .4]),
    Border: WebInspector.Color.fromRGBA([255, 229, 153, .66]),
    BorderLight: WebInspector.Color.fromRGBA([255, 229, 153, .5]),
    Margin: WebInspector.Color.fromRGBA([246, 178, 107, .66]),
    MarginLight: WebInspector.Color.fromRGBA([246, 178, 107, .5]),
    EventTarget: WebInspector.Color.fromRGBA([255, 196, 196, .66])
}

WebInspector.Color.Format = {
    Original: "original",
    Nickname: "nickname",
    HEX: "hex",
    ShortHEX: "shorthex",
    RGB: "rgb",
    RGBA: "rgba",
    HSL: "hsl",
    HSLA: "hsla"
}
