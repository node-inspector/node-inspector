/*
 * Copyright (C) 2010 Nikita Vasilyev. All rights reserved.
 * Copyright (C) 2010 Joseph Pecoraro. All rights reserved.
 * Copyright (C) 2010 Google Inc. All rights reserved.
 *
 * Redistribution and use in source and binary forms, with or without
 * modification, are permitted provided that the following conditions are
 * met:
 *
 *     * Redistributions of source code must retain the above copyright
 * notice, this list of conditions and the following disclaimer.
 *     * Redistributions in binary form must reproduce the above
 * copyright notice, this list of conditions and the following disclaimer
 * in the documentation and/or other materials provided with the
 * distribution.
 *     * Neither the name of Google Inc. nor the names of its
 * contributors may be used to endorse or promote products derived from
 * this software without specific prior written permission.
 *
 * THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS
 * "AS IS" AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT
 * LIMITED TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR
 * A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT
 * OWNER OR CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL,
 * SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT
 * LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE,
 * DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY
 * THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT
 * (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE
 * OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
 */

/**
 * @constructor
 * @param {!Array.<!{name: string, longhands: !Array.<string>}|string>} properties
 */
WebInspector.CSSMetadata = function(properties)
{
    this._values = /** !Array.<string> */ ([]);
    this._longhands = {};
    this._shorthands = {};
    for (var i = 0; i < properties.length; ++i) {
        var property = properties[i];
        if (typeof property === "string") {
            this._values.push(property);
            continue;
        }
        var propertyName = property.name;
        if (!CSS.supports(propertyName, "initial"))
            continue;
        this._values.push(propertyName);

        var longhands = properties[i].longhands;
        if (longhands) {
            this._longhands[propertyName] = longhands;
            for (var j = 0; j < longhands.length; ++j) {
                var longhandName = longhands[j];
                var shorthands = this._shorthands[longhandName];
                if (!shorthands) {
                    shorthands = [];
                    this._shorthands[longhandName] = shorthands;
                }
                shorthands.push(propertyName);
            }
        }
    }
    this._values.sort();
}

/**
 * @type {!WebInspector.CSSMetadata}
 */
WebInspector.CSSMetadata.cssPropertiesMetainfo = new WebInspector.CSSMetadata([]);

/**
 * @param {string} propertyName
 * @return {boolean}
 */
WebInspector.CSSMetadata.isColorAwareProperty = function(propertyName)
{
    return !!WebInspector.CSSMetadata._colorAwareProperties[propertyName.toLowerCase()];
}

/**
 * @param {string} propertyName
 * @return {boolean}
 */
WebInspector.CSSMetadata.isLengthProperty = function(propertyName)
{
    if (propertyName === "line-height")
        return false;
    if (!WebInspector.CSSMetadata._distancePropertiesKeySet)
        WebInspector.CSSMetadata._distancePropertiesKeySet = WebInspector.CSSMetadata._distanceProperties.keySet();
    return WebInspector.CSSMetadata._distancePropertiesKeySet[propertyName] || propertyName.startsWith("margin") || propertyName.startsWith("padding") || propertyName.indexOf("width") !== -1 || propertyName.indexOf("height") !== -1;
}

/**
 * @param {string} propertyName
 * @return {boolean}
 */
WebInspector.CSSMetadata.isBezierAwareProperty = function(propertyName)
{
    return !!WebInspector.CSSMetadata._bezierAwareProperties[propertyName.toLowerCase()];
}

// Originally taken from http://www.w3.org/TR/CSS21/propidx.html and augmented.
WebInspector.CSSMetadata.InheritedProperties = [
    "azimuth", "border-collapse", "border-spacing", "caption-side", "color", "cursor", "direction", "elevation",
    "empty-cells", "font-family", "font-size", "font-style", "font-variant", "font-weight", "font", "letter-spacing",
    "line-height", "list-style-image", "list-style-position", "list-style-type", "list-style", "orphans", "overflow-wrap", "pitch-range",
    "pitch", "quotes", "resize", "richness", "speak-header", "speak-numeral", "speak-punctuation", "speak", "speech-rate", "stress",
    "text-align", "text-indent", "text-transform", "text-shadow", "-webkit-user-select", "visibility", "voice-family", "volume", "white-space", "widows",
    "word-spacing", "word-wrap", "zoom"
].keySet();

// These non-standard Blink-specific properties augment the InheritedProperties.
WebInspector.CSSMetadata.NonStandardInheritedProperties = [
    "-webkit-font-smoothing"
].keySet();

/**
 * @param {string} name
 * @return {string}
 */
WebInspector.CSSMetadata.canonicalPropertyName = function(name)
{
    if (!name || name.length < 9 || name.charAt(0) !== "-")
        return name.toLowerCase();
    var match = name.match(/(?:-webkit-)(.+)/);
    var propertiesSet = WebInspector.CSSMetadata.cssPropertiesMetainfoKeySet();
    var hasSupportedProperties = WebInspector.CSSMetadata.cssPropertiesMetainfo._values.length > 0;
    if (!match || (hasSupportedProperties && !propertiesSet.hasOwnProperty(match[1].toLowerCase())))
        return name.toLowerCase();
    return match[1].toLowerCase();
}

/**
 * @param {string} propertyName
 * @return {boolean}
 */
WebInspector.CSSMetadata.isPropertyInherited = function(propertyName)
{
    return !!(WebInspector.CSSMetadata.InheritedProperties[WebInspector.CSSMetadata.canonicalPropertyName(propertyName)]
            || WebInspector.CSSMetadata.NonStandardInheritedProperties[propertyName.toLowerCase()]);
}

WebInspector.CSSMetadata._distanceProperties = [
    'background-position', 'border-spacing', 'bottom', 'font-size', 'height', 'left', 'letter-spacing', 'max-height', 'max-width', 'min-height',
    'min-width', 'right', 'text-indent', 'top', 'width', 'word-spacing'
];

WebInspector.CSSMetadata._bezierAwareProperties = [
    "animation", "animation-timing-function", "transition", "transition-timing-function", "-webkit-animation", "-webkit-animation-timing-function",
    "-webkit-transition", "-webkit-transition-timing-function"
].keySet();

WebInspector.CSSMetadata._colorAwareProperties = [
    "background", "background-color", "background-image", "border", "border-color", "border-top", "border-right", "border-bottom",
    "border-left", "border-top-color", "border-right-color", "border-bottom-color", "border-left-color", "box-shadow", "color",
    "fill", "outline", "outline-color", "stroke", "text-shadow", "-webkit-box-shadow", "-webkit-column-rule-color",
    "-webkit-text-decoration-color", "-webkit-text-emphasis", "-webkit-text-emphasis-color"
].keySet();

WebInspector.CSSMetadata._propertyDataMap = {
    "table-layout": { values: [
        "auto", "fixed"
    ] },
    "visibility": { values: [
        "hidden", "visible", "collapse"
    ] },
    "background-repeat": { values: [
        "repeat", "repeat-x", "repeat-y", "no-repeat", "space", "round"
    ] },
    "content": { values: [
        "list-item", "close-quote", "no-close-quote", "no-open-quote", "open-quote"
    ] },
    "list-style-image": { values: [
        "none"
    ] },
    "clear": { values: [
        "none", "left", "right", "both"
    ] },
    "overflow-x": { values: [
        "hidden", "auto", "visible", "overlay", "scroll"
    ] },
    "stroke-linejoin": { values: [
        "round", "miter", "bevel"
    ] },
    "baseline-shift": { values: [
        "baseline", "sub", "super"
    ] },
    "border-bottom-width": { values: [
        "medium", "thick", "thin"
    ] },
    "margin-top-collapse": { values: [
        "collapse", "separate", "discard"
    ] },
    "max-height": { values: [
        "none"
    ] },
    "box-orient": { values: [
        "horizontal", "vertical", "inline-axis", "block-axis"
    ], },
    "font-stretch": { values: [
        "normal", "wider", "narrower", "ultra-condensed", "extra-condensed", "condensed", "semi-condensed",
        "semi-expanded", "expanded", "extra-expanded", "ultra-expanded"
    ] },
    "-webkit-background-composite": { values: [
        "highlight", "clear", "copy", "source-over", "source-in", "source-out", "source-atop", "destination-over",
        "destination-in", "destination-out", "destination-atop", "xor", "plus-darker", "plus-lighter"
    ] },
    "border-left-width": { values: [
        "medium", "thick", "thin"
    ] },
    "box-shadow": { values: [
        "inset", "none"
    ] },
    "-webkit-writing-mode": { values: [
        "lr", "rl", "tb", "lr-tb", "rl-tb", "tb-rl", "horizontal-tb", "vertical-rl", "vertical-lr", "horizontal-bt"
    ] },
    "border-collapse": { values: [
        "collapse", "separate"
    ] },
    "page-break-inside": { values: [
        "auto", "avoid"
    ] },
    "border-top-width": { values: [
        "medium", "thick", "thin"
    ] },
    "outline-color": { values: [
        "invert"
    ] },
    "outline-style": { values: [
        "none", "hidden", "inset", "groove", "ridge", "outset", "dotted", "dashed", "solid", "double"
    ] },
    "cursor": { values: [
        "none", "copy", "auto", "crosshair", "default", "pointer", "move", "vertical-text", "cell", "context-menu",
        "alias", "progress", "no-drop", "not-allowed", "-webkit-zoom-in", "-webkit-zoom-out", "e-resize", "ne-resize",
        "nw-resize", "n-resize", "se-resize", "sw-resize", "s-resize", "w-resize", "ew-resize", "ns-resize",
        "nesw-resize", "nwse-resize", "col-resize", "row-resize", "text", "wait", "help", "all-scroll", "-webkit-grab",
        "-webkit-grabbing"
    ] },
    "border-width": { values: [
        "medium", "thick", "thin"
    ] },
    "border-style": { values: [
        "none", "hidden", "inset", "groove", "ridge", "outset", "dotted", "dashed", "solid", "double"
    ] },
    "size": { values: [
        "a3", "a4", "a5", "b4", "b5", "landscape", "ledger", "legal", "letter", "portrait"
    ] },
    "background-size": { values: [
        "contain", "cover"
    ] },
    "direction": { values: [
        "ltr", "rtl"
    ] },
    "enable-background": { values: [
        "accumulate", "new"
    ] },
    "float": { values: [
        "none", "left", "right"
    ] },
    "overflow-y": { values: [
        "hidden", "auto", "visible", "overlay", "scroll"
    ] },
    "margin-bottom-collapse": { values: [
        "collapse",  "separate", "discard"
    ] },
    "box-reflect": { values: [
        "left", "right", "above", "below"
    ] },
    "overflow": { values: [
        "hidden", "auto", "visible", "overlay", "scroll"
    ] },
    "text-rendering": { values: [
        "auto", "optimizeSpeed", "optimizeLegibility", "geometricPrecision"
    ] },
    "text-align": { values: [
        "-webkit-auto", "start", "end", "left", "right", "center", "justify", "-webkit-left", "-webkit-right", "-webkit-center"
    ] },
    "list-style-position": { values: [
        "outside", "inside", "hanging"
    ] },
    "margin-bottom": { values: [
        "auto"
    ] },
    "color-interpolation": { values: [
        "linearrgb"
    ] },
    "background-origin": { values: [
        "border-box", "content-box", "padding-box"
    ] },
    "word-wrap": { values: [
        "normal", "break-word"
    ] },
    "font-weight": { values: [
        "normal", "bold", "bolder", "lighter", "100", "200", "300", "400", "500", "600", "700", "800", "900"
    ] },
    "margin-before-collapse": { values: [
        "collapse", "separate", "discard"
    ] },
    "text-transform": { values: [
        "none", "capitalize", "uppercase", "lowercase"
    ] },
    "border-right-style": { values: [
        "none", "hidden", "inset", "groove", "ridge", "outset", "dotted", "dashed", "solid", "double"
    ] },
    "border-left-style": { values: [
        "none", "hidden", "inset", "groove", "ridge", "outset", "dotted", "dashed", "solid", "double"
    ] },
    "-webkit-text-emphasis": { values: [
        "circle", "filled", "open", "dot", "double-circle", "triangle", "sesame"
    ] },
    "font-style": { values: [
        "italic", "oblique", "normal"
    ] },
    "speak": { values: [
        "none", "normal", "spell-out", "digits", "literal-punctuation", "no-punctuation"
    ] },
    "color-rendering": { values: [
        "auto", "optimizeSpeed", "optimizeQuality"
    ] },
    "list-style-type": { values: [
        "none", "inline", "disc", "circle", "square", "decimal", "decimal-leading-zero", "arabic-indic", "binary", "bengali",
        "cambodian", "khmer", "devanagari", "gujarati", "gurmukhi", "kannada", "lower-hexadecimal", "lao", "malayalam",
        "mongolian", "myanmar", "octal", "oriya", "persian", "urdu", "telugu", "tibetan", "thai", "upper-hexadecimal",
        "lower-roman", "upper-roman", "lower-greek", "lower-alpha", "lower-latin", "upper-alpha", "upper-latin", "afar",
        "ethiopic-halehame-aa-et", "ethiopic-halehame-aa-er", "amharic", "ethiopic-halehame-am-et", "amharic-abegede",
        "ethiopic-abegede-am-et", "cjk-earthly-branch", "cjk-heavenly-stem", "ethiopic", "ethiopic-halehame-gez",
        "ethiopic-abegede", "ethiopic-abegede-gez", "hangul-consonant", "hangul", "lower-norwegian", "oromo",
        "ethiopic-halehame-om-et", "sidama", "ethiopic-halehame-sid-et", "somali", "ethiopic-halehame-so-et", "tigre",
        "ethiopic-halehame-tig", "tigrinya-er", "ethiopic-halehame-ti-er", "tigrinya-er-abegede",
        "ethiopic-abegede-ti-er", "tigrinya-et", "ethiopic-halehame-ti-et", "tigrinya-et-abegede",
        "ethiopic-abegede-ti-et", "upper-greek", "upper-norwegian", "asterisks", "footnotes", "hebrew", "armenian",
        "lower-armenian", "upper-armenian", "georgian", "cjk-ideographic", "hiragana", "katakana", "hiragana-iroha",
        "katakana-iroha"
    ] },
    "-webkit-text-combine": { values: [
        "none", "horizontal"
    ] },
    "outline": { values: [
        "none", "hidden", "inset", "groove", "ridge", "outset", "dotted", "dashed", "solid", "double"
    ] },
    "font": { values: [
        "caption", "icon", "menu", "message-box", "small-caption", "-webkit-mini-control", "-webkit-small-control",
        "-webkit-control", "status-bar", "italic", "oblique", "small-caps", "normal", "bold", "bolder", "lighter",
        "100", "200", "300", "400", "500", "600", "700", "800", "900", "xx-small", "x-small", "small", "medium",
        "large", "x-large", "xx-large", "-webkit-xxx-large", "smaller", "larger", "serif", "sans-serif", "cursive",
        "fantasy", "monospace", "-webkit-body", "-webkit-pictograph"
    ] },
    "dominant-baseline": { values: [
        "middle", "auto", "central", "text-before-edge", "text-after-edge", "ideographic", "alphabetic", "hanging",
        "mathematical", "use-script", "no-change", "reset-size"
    ] },
    "display": { values: [
        "none", "inline", "block", "list-item", "run-in", "inline-block", "table", "inline-table",
        "table-row-group", "table-header-group", "table-footer-group", "table-row", "table-column-group",
        "table-column", "table-cell", "table-caption", "-webkit-box", "-webkit-inline-box",
        "flex", "inline-flex", "grid", "inline-grid"
    ] },
    "-webkit-text-emphasis-position": { values: [
        "over", "under"
    ] },
    "image-rendering": { values: [
        "auto", "optimizeSpeed", "optimizeQuality", "pixelated"
    ] },
    "alignment-baseline": { values: [
        "baseline", "middle", "auto", "before-edge", "after-edge", "central", "text-before-edge", "text-after-edge",
        "ideographic", "alphabetic", "hanging", "mathematical"
    ] },
    "outline-width": { values: [
        "medium", "thick", "thin"
    ] },
    "box-align": { values: [
        "baseline", "center", "stretch", "start", "end"
    ] },
    "border-right-width": { values: [
        "medium", "thick", "thin"
    ] },
    "border-top-style": { values: [
        "none", "hidden", "inset", "groove", "ridge", "outset", "dotted", "dashed", "solid", "double"
    ] },
    "line-height": { values: [
        "normal"
    ] },
    "text-overflow": { values: [
        "clip", "ellipsis"
    ] },
    "overflow-wrap": { values: [
        "normal", "break-word"
    ] },
    "box-direction": { values: [
        "normal", "reverse"
    ] },
    "margin-after-collapse": { values: [
        "collapse", "separate", "discard"
    ] },
    "page-break-before": { values: [
        "left", "right", "auto", "always", "avoid"
    ] },
    "border-image": { values: [
        "repeat", "stretch"
    ] },
    "text-decoration": { values: [
        "blink", "line-through", "overline", "underline"
    ] },
    "position": { values: [
        "absolute", "fixed", "relative", "static"
    ] },
    "font-family": { values: [
        "serif", "sans-serif", "cursive", "fantasy", "monospace", "-webkit-body", "-webkit-pictograph"
    ] },
    "text-overflow-mode": { values: [
        "clip", "ellipsis"
    ] },
    "border-bottom-style": { values: [
        "none", "hidden", "inset", "groove", "ridge", "outset", "dotted", "dashed", "solid", "double"
    ] },
    "unicode-bidi": { values: [
        "normal", "bidi-override", "embed", "isolate", "isolate-override", "plaintext"
    ] },
    "clip-rule": { values: [
        "nonzero", "evenodd"
    ] },
    "margin-left": { values: [
        "auto"
    ] },
    "margin-top": { values: [
        "auto"
    ] },
    "zoom": { values: [
        "normal", "document", "reset"
    ] },
    "max-width": { values: [
        "none"
    ] },
    "caption-side": { values: [
        "top", "bottom"
    ] },
    "empty-cells": { values: [
        "hide", "show"
    ] },
    "pointer-events": { values: [
        "none", "all", "auto", "visible", "visiblepainted", "visiblefill", "visiblestroke", "painted", "fill", "stroke", "bounding-box"
    ] },
    "letter-spacing": { values: [
        "normal"
    ] },
    "background-clip": { values: [
        "border-box", "content-box", "padding-box"
    ] },
    "-webkit-font-smoothing": { values: [
        "none", "auto", "antialiased", "subpixel-antialiased"
    ] },
    "border": { values: [
        "none", "hidden", "inset", "groove", "ridge", "outset", "dotted", "dashed", "solid", "double"
    ] },
    "font-size": { values: [
        "xx-small", "x-small", "small", "medium", "large", "x-large", "xx-large", "-webkit-xxx-large", "smaller",
        "larger"
    ] },
    "font-variant": { values: [
        "small-caps", "normal"
    ] },
    "vertical-align": { values: [
        "baseline", "middle", "sub", "super", "text-top", "text-bottom", "top", "bottom", "-webkit-baseline-middle"
    ] },
    "white-space": { values: [
        "normal", "nowrap", "pre", "pre-line", "pre-wrap"
    ] },
    "box-lines": { values: [
        "single", "multiple"
    ] },
    "page-break-after": { values: [
        "left", "right", "auto", "always", "avoid"
    ] },
    "clip-path": { values: [
        "none"
    ] },
    "margin": { values: [
        "auto"
    ] },
    "margin-right": { values: [
        "auto"
    ] },
    "word-break": { values: [
        "normal", "break-all", "break-word"
    ] },
    "word-spacing": { values: [
        "normal"
    ] },
    "-webkit-text-emphasis-style": { values: [
        "circle", "filled", "open", "dot", "double-circle", "triangle", "sesame"
    ] },
    "transform": { values: [
        "scale", "scaleX", "scaleY", "scale3d", "rotate", "rotateX", "rotateY", "rotateZ", "rotate3d", "skew", "skewX", "skewY",
        "translate", "translateX", "translateY", "translateZ", "translate3d", "matrix", "matrix3d", "perspective"
    ] },
    "image-resolution": { values: [
        "from-image", "snap"
    ] },
    "box-sizing": { values: [
        "content-box", "border-box"
    ] },
    "clip": { values: [
        "auto"
    ] },
    "resize": { values: [
        "none", "both", "horizontal", "vertical"
    ] },
    "align-content": { values: [
        "flex-start", "flex-end", "center", "space-between", "space-around", "stretch"
    ] },
    "align-items": {  values: [
        "flex-start", "flex-end", "center", "baseline", "stretch"
    ] },
    "align-self": {  values: [
        "auto", "flex-start", "flex-end", "center", "baseline", "stretch"
    ] },
    "flex-direction": { values: [
        "row", "row-reverse", "column", "column-reverse"
    ] },
    "justify-content": { values: [
        "flex-start", "flex-end", "center", "space-between", "space-around"
    ] },
    "flex-wrap": { values: [
        "nowrap", "wrap", "wrap-reverse"
    ] },
    "perspective": { values: [
        "none"
    ] },
    "perspective-origin": { values: [
        "left", "center", "right", "top", "bottom"
    ] },
    "transform-origin": { values: [
        "left", "center", "right", "top", "bottom"
    ] },
    "transform-style": { values: [
        "flat", "preserve-3d"
    ] },
    "transition-timing-function": { values: [
        "ease", "linear", "ease-in", "ease-out", "ease-in-out", "step-start", "step-end", "steps", "cubic-bezier"
    ] },
    "animation-timing-function": { values: [
        "ease", "linear", "ease-in", "ease-out", "ease-in-out", "step-start", "step-end", "steps", "cubic-bezier"
    ] },
    "animation-direction": { values: [
        "normal", "reverse", "alternate", "alternate-reverse"
    ] },
    "animation-play-state": { values: [
        "running", "paused"
    ] },
    "animation-fill-mode": { values: [
        "none", "forwards", "backwards", "both"
    ] },
    "-webkit-backface-visibility": { values: [
        "visible", "hidden"
    ] },
    "-webkit-box-decoration-break": { values: [
        "slice", "clone"
    ] },
    "-webkit-column-break-after": { values: [
        "auto", "always", "avoid", "left", "right", "page", "column", "avoid-page", "avoid-column"
    ] },
    "-webkit-column-break-before": { values: [
        "auto", "always", "avoid", "left", "right", "page", "column", "avoid-page", "avoid-column"
    ] },
    "-webkit-column-break-inside": { values: [
        "auto", "avoid", "avoid-page", "avoid-column"
    ] },
    "-webkit-column-span": { values: [
        "none", "all"
    ] },
    "-webkit-column-count": { values: [
        "auto"
    ] },
    "-webkit-column-gap": { values: [
        "normal"
    ] },
    "-webkit-filter": { values: [
        "url", "blur", "brightness", "contrast", "drop-shadow", "grayscale", "hue-rotate", "invert", "opacity", "saturate", "sepia"
    ] },
    "-webkit-line-break": { values: [
        "auto", "loose", "normal", "strict"
    ] },
    "text-align-last": { values: [
        "auto", "start", "end", "left", "right", "center", "justify"
    ] },
    "-webkit-text-decoration-line": { values: [
        "none", "underline", "overline", "line-through", "blink"
    ] },
    "-webkit-text-decoration-style": { values: [
        "solid", "double", "dotted", "dashed", "wavy"
    ] },
    "-webkit-text-decoration-skip": { values: [
        "none", "objects", "spaces", "ink", "edges", "box-decoration"
    ] }
}

/**
 * @param {string} propertyName
 * @return {!WebInspector.CSSMetadata}
 */
WebInspector.CSSMetadata.keywordsForProperty = function(propertyName)
{
    var acceptedKeywords = ["inherit", "initial"];
    var descriptor = WebInspector.CSSMetadata.descriptor(propertyName);
    if (descriptor && descriptor.values)
        acceptedKeywords.push.apply(acceptedKeywords, descriptor.values);
    if (WebInspector.CSSMetadata.isColorAwareProperty(propertyName)) {
        acceptedKeywords.push("currentColor");
        for (var color in WebInspector.Color.Nicknames)
            acceptedKeywords.push(color);
    }
    return new WebInspector.CSSMetadata(acceptedKeywords);
}

/**
 * @param {string} propertyName
 * @return {?Object}
 */
WebInspector.CSSMetadata.descriptor = function(propertyName)
{
    if (!propertyName)
        return null;
    var unprefixedName = propertyName.replace(/^-webkit-/, "");
    propertyName = propertyName.toLowerCase();
    var entry = WebInspector.CSSMetadata._propertyDataMap[propertyName];
    if (!entry && unprefixedName !== propertyName)
        entry = WebInspector.CSSMetadata._propertyDataMap[unprefixedName];
    return entry || null;
}

WebInspector.CSSMetadata.initializeWithSupportedProperties = function(properties)
{
    WebInspector.CSSMetadata.cssPropertiesMetainfo = new WebInspector.CSSMetadata(properties);
}

/**
 * @return {!Object.<string, boolean>}
 */
WebInspector.CSSMetadata.cssPropertiesMetainfoKeySet = function()
{
    if (!WebInspector.CSSMetadata._cssPropertiesMetainfoKeySet)
        WebInspector.CSSMetadata._cssPropertiesMetainfoKeySet = WebInspector.CSSMetadata.cssPropertiesMetainfo.keySet();
    return WebInspector.CSSMetadata._cssPropertiesMetainfoKeySet;
}

// Weight of CSS properties based on their usage from https://www.chromestatus.com/metrics/css/popularity
WebInspector.CSSMetadata.Weight = {
    "align-content": 57,
    "align-items": 129,
    "align-self": 55,
    "animation": 175,
    "animation-delay": 114,
    "animation-direction": 113,
    "animation-duration": 137,
    "animation-fill-mode": 132,
    "animation-iteration-count": 124,
    "animation-name": 139,
    "animation-play-state": 104,
    "animation-timing-function": 141,
    "backface-visibility": 123,
    "background": 260,
    "background-attachment": 119,
    "background-clip": 165,
    "background-color": 259,
    "background-image": 246,
    "background-origin": 107,
    "background-position": 237,
    "background-position-x": 108,
    "background-position-y": 93,
    "background-repeat": 234,
    "background-size": 203,
    "border": 263,
    "border-bottom": 233,
    "border-bottom-color": 190,
    "border-bottom-left-radius": 186,
    "border-bottom-right-radius": 185,
    "border-bottom-style": 150,
    "border-bottom-width": 179,
    "border-collapse": 209,
    "border-color": 226,
    "border-image": 89,
    "border-image-outset": 50,
    "border-image-repeat": 49,
    "border-image-slice": 58,
    "border-image-source": 32,
    "border-image-width": 52,
    "border-left": 221,
    "border-left-color": 174,
    "border-left-style": 142,
    "border-left-width": 172,
    "border-radius": 224,
    "border-right": 223,
    "border-right-color": 182,
    "border-right-style": 130,
    "border-right-width": 178,
    "border-spacing": 198,
    "border-style": 206,
    "border-top": 231,
    "border-top-color": 192,
    "border-top-left-radius": 187,
    "border-top-right-radius": 189,
    "border-top-style": 152,
    "border-top-width": 180,
    "border-width": 214,
    "bottom": 227,
    "box-shadow": 213,
    "box-sizing": 216,
    "caption-side": 96,
    "clear": 229,
    "clip": 173,
    "clip-rule": 5,
    "color": 256,
    "content": 219,
    "counter-increment": 111,
    "counter-reset": 110,
    "cursor": 250,
    "direction": 176,
    "display": 262,
    "empty-cells": 99,
    "fill": 140,
    "fill-opacity": 82,
    "fill-rule": 22,
    "filter": 160,
    "flex": 133,
    "flex-basis": 66,
    "flex-direction": 85,
    "flex-flow": 94,
    "flex-grow": 112,
    "flex-shrink": 61,
    "flex-wrap": 68,
    "float": 252,
    "font": 211,
    "font-family": 254,
    "font-kerning": 18,
    "font-size": 264,
    "font-stretch": 77,
    "font-style": 220,
    "font-variant": 161,
    "font-weight": 257,
    "height": 266,
    "image-rendering": 90,
    "justify-content": 127,
    "left": 248,
    "letter-spacing": 188,
    "line-height": 244,
    "list-style": 215,
    "list-style-image": 145,
    "list-style-position": 149,
    "list-style-type": 199,
    "margin": 267,
    "margin-bottom": 241,
    "margin-left": 243,
    "margin-right": 238,
    "margin-top": 253,
    "mask": 20,
    "max-height": 205,
    "max-width": 225,
    "min-height": 217,
    "min-width": 218,
    "object-fit": 33,
    "opacity": 251,
    "order": 117,
    "orphans": 146,
    "outline": 222,
    "outline-color": 153,
    "outline-offset": 147,
    "outline-style": 151,
    "outline-width": 148,
    "overflow": 255,
    "overflow-wrap": 105,
    "overflow-x": 184,
    "overflow-y": 196,
    "padding": 265,
    "padding-bottom": 230,
    "padding-left": 235,
    "padding-right": 232,
    "padding-top": 240,
    "page": 8,
    "page-break-after": 120,
    "page-break-before": 69,
    "page-break-inside": 121,
    "perspective": 92,
    "perspective-origin": 103,
    "pointer-events": 183,
    "position": 261,
    "quotes": 158,
    "resize": 168,
    "right": 245,
    "shape-rendering": 38,
    "size": 64,
    "speak": 118,
    "src": 170,
    "stop-color": 42,
    "stop-opacity": 31,
    "stroke": 98,
    "stroke-dasharray": 36,
    "stroke-dashoffset": 3,
    "stroke-linecap": 30,
    "stroke-linejoin": 21,
    "stroke-miterlimit": 12,
    "stroke-opacity": 34,
    "stroke-width": 87,
    "table-layout": 171,
    "tab-size": 46,
    "text-align": 260,
    "text-anchor": 35,
    "text-decoration": 247,
    "text-indent": 207,
    "text-overflow": 204,
    "text-rendering": 155,
    "text-shadow": 208,
    "text-transform": 202,
    "top": 258,
    "touch-action": 80,
    "transform": 181,
    "transform-origin": 162,
    "transform-style": 86,
    "transition": 193,
    "transition-delay": 134,
    "transition-duration": 135,
    "transition-property": 131,
    "transition-timing-function": 122,
    "unicode-bidi": 156,
    "unicode-range": 136,
    "vertical-align": 236,
    "visibility": 242,
    "-webkit-appearance": 191,
    "-webkit-backface-visibility": 154,
    "-webkit-background-clip": 164,
    "-webkit-background-origin": 40,
    "-webkit-background-size": 163,
    "-webkit-border-end": 9,
    "-webkit-border-horizontal-spacing": 81,
    "-webkit-border-image": 75,
    "-webkit-border-radius": 212,
    "-webkit-border-start": 10,
    "-webkit-border-start-color": 16,
    "-webkit-border-start-width": 13,
    "-webkit-border-vertical-spacing": 43,
    "-webkit-box-align": 101,
    "-webkit-box-direction": 51,
    "-webkit-box-flex": 128,
    "-webkit-box-lines": 2,
    "-webkit-box-ordinal-group": 91,
    "-webkit-box-orient": 144,
    "-webkit-box-pack": 106,
    "-webkit-box-reflect": 39,
    "-webkit-box-shadow": 210,
    "-webkit-column-break-inside": 60,
    "-webkit-column-count": 84,
    "-webkit-column-gap": 76,
    "-webkit-column-rule": 25,
    "-webkit-column-rule-color": 23,
    "-webkit-columns": 44,
    "-webkit-column-span": 29,
    "-webkit-column-width": 47,
    "-webkit-filter": 159,
    "-webkit-font-feature-settings": 59,
    "-webkit-font-smoothing": 177,
    "-webkit-highlight": 1,
    "-webkit-line-break": 45,
    "-webkit-line-clamp": 126,
    "-webkit-margin-after": 67,
    "-webkit-margin-before": 70,
    "-webkit-margin-collapse": 14,
    "-webkit-margin-end": 65,
    "-webkit-margin-start": 100,
    "-webkit-margin-top-collapse": 78,
    "-webkit-mask": 19,
    "-webkit-mask-box-image": 72,
    "-webkit-mask-image": 88,
    "-webkit-mask-position": 54,
    "-webkit-mask-repeat": 63,
    "-webkit-mask-size": 79,
    "-webkit-padding-after": 15,
    "-webkit-padding-before": 28,
    "-webkit-padding-end": 48,
    "-webkit-padding-start": 73,
    "-webkit-print-color-adjust": 83,
    "-webkit-rtl-ordering": 7,
    "-webkit-tap-highlight-color": 169,
    "-webkit-text-emphasis-color": 11,
    "-webkit-text-fill-color": 71,
    "-webkit-text-security": 17,
    "-webkit-text-stroke": 56,
    "-webkit-text-stroke-color": 37,
    "-webkit-text-stroke-width": 53,
    "-webkit-user-drag": 95,
    "-webkit-user-modify": 62,
    "-webkit-user-select": 194,
    "-webkit-writing-mode": 4,
    "white-space": 228,
    "widows": 115,
    "width": 268,
    "will-change": 74,
    "word-break": 166,
    "word-spacing": 157,
    "word-wrap": 197,
    "writing-mode": 41,
    "z-index": 239,
    "zoom": 200
};


WebInspector.CSSMetadata.prototype = {
    /**
     * @param {string} prefix
     * @return {!Array.<string>}
     */
    startsWith: function(prefix)
    {
        var firstIndex = this._firstIndexOfPrefix(prefix);
        if (firstIndex === -1)
            return [];

        var results = [];
        while (firstIndex < this._values.length && this._values[firstIndex].startsWith(prefix))
            results.push(this._values[firstIndex++]);
        return results;
    },

    /**
     * @param {!Array.<string>} properties
     * @return {number}
     */
    mostUsedOf: function(properties)
    {
        var maxWeight = 0;
        var index = 0;
        for (var i = 0; i < properties.length; i++) {
            var weight = WebInspector.CSSMetadata.Weight[properties[i]];
            if (!weight)
                weight = WebInspector.CSSMetadata.Weight[WebInspector.CSSMetadata.canonicalPropertyName(properties[i])];
            if (weight > maxWeight) {
                maxWeight = weight;
                index = i;
            }
        }
        return index;
    },

    _firstIndexOfPrefix: function(prefix)
    {
        if (!this._values.length)
            return -1;
        if (!prefix)
            return 0;

        var maxIndex = this._values.length - 1;
        var minIndex = 0;
        var foundIndex;

        do {
            var middleIndex = (maxIndex + minIndex) >> 1;
            if (this._values[middleIndex].startsWith(prefix)) {
                foundIndex = middleIndex;
                break;
            }
            if (this._values[middleIndex] < prefix)
                minIndex = middleIndex + 1;
            else
                maxIndex = middleIndex - 1;
        } while (minIndex <= maxIndex);

        if (foundIndex === undefined)
            return -1;

        while (foundIndex && this._values[foundIndex - 1].startsWith(prefix))
            foundIndex--;

        return foundIndex;
    },

    /**
     * @return {!Object.<string, boolean>}
     */
    keySet: function()
    {
        if (!this._keySet)
            this._keySet = this._values.keySet();
        return this._keySet;
    },

    /**
     * @param {string} str
     * @param {string} prefix
     * @return {string}
     */
    next: function(str, prefix)
    {
        return this._closest(str, prefix, 1);
    },

    /**
     * @param {string} str
     * @param {string} prefix
     * @return {string}
     */
    previous: function(str, prefix)
    {
        return this._closest(str, prefix, -1);
    },

    /**
     * @param {string} str
     * @param {string} prefix
     * @param {number} shift
     * @return {string}
     */
    _closest: function(str, prefix, shift)
    {
        if (!str)
            return "";

        var index = this._values.indexOf(str);
        if (index === -1)
            return "";

        if (!prefix) {
            index = (index + this._values.length + shift) % this._values.length;
            return this._values[index];
        }

        var propertiesWithPrefix = this.startsWith(prefix);
        var j = propertiesWithPrefix.indexOf(str);
        j = (j + propertiesWithPrefix.length + shift) % propertiesWithPrefix.length;
        return propertiesWithPrefix[j];
    },

    /**
     * @param {string} shorthand
     * @return {?Array.<string>}
     */
    longhands: function(shorthand)
    {
        return this._longhands[shorthand];
    },

    /**
     * @param {string} longhand
     * @return {?Array.<string>}
     */
    shorthands: function(longhand)
    {
        return this._shorthands[longhand];
    }
}

WebInspector.CSSMetadata.initializeWithSupportedProperties([]);
