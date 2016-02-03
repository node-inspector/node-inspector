// Copyright (c) 2015 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

/**
 * @extends {WebInspector.Object}
 * @constructor
 */
WebInspector.SharedSidebarModel = function()
{
    WebInspector.Object.call(this);
    this._node = WebInspector.context.flavor(WebInspector.DOMNode);
    WebInspector.context.addFlavorChangeListener(WebInspector.DOMNode, this._onNodeChanged, this);
}

/**
 * @param {?WebInspector.DOMNode} node
 * @return {?WebInspector.DOMNode}
 */
WebInspector.SharedSidebarModel.elementNode = function(node)
{
    if (node && node.nodeType() === Node.TEXT_NODE && node.parentNode)
        node = node.parentNode;

    if (node && node.nodeType() !== Node.ELEMENT_NODE)
        node = null;
    return node;
}

WebInspector.SharedSidebarModel.Events = {
    ComputedStyleChanged: "ComputedStyleChanged"
}

WebInspector.SharedSidebarModel.prototype = {
    /**
     * @return {?WebInspector.DOMNode}
     */
    node: function()
    {
        return this._node;
    },

    /**
     * @return {?WebInspector.CSSStyleModel}
     */
    cssModel: function()
    {
        return this._cssModel;
    },

    /**
     * @param {!WebInspector.Event} event
     */
    _onNodeChanged: function(event)
    {
        this._node = /** @type {?WebInspector.DOMNode} */(event.data);
        this._updateTarget(this._node ? this._node.target() : null);
        this._onComputedStyleChanged();
    },

    /**
     * @param {?WebInspector.Target} target
     */
    _updateTarget: function(target)
    {
        if (this._target === target)
            return;
        if (this._target) {
            this._cssModel.removeEventListener(WebInspector.CSSStyleModel.Events.StyleSheetAdded, this._onComputedStyleChanged, this);
            this._cssModel.removeEventListener(WebInspector.CSSStyleModel.Events.StyleSheetRemoved, this._onComputedStyleChanged, this);
            this._cssModel.removeEventListener(WebInspector.CSSStyleModel.Events.StyleSheetChanged, this._onComputedStyleChanged, this);
            this._cssModel.removeEventListener(WebInspector.CSSStyleModel.Events.MediaQueryResultChanged, this._onComputedStyleChanged, this);
            this._cssModel.removeEventListener(WebInspector.CSSStyleModel.Events.PseudoStateForced, this._onComputedStyleChanged, this);
            this._cssModel.removeEventListener(WebInspector.CSSStyleModel.Events.ModelWasEnabled, this._onComputedStyleChanged, this);
            this._domModel.removeEventListener(WebInspector.DOMModel.Events.DOMMutated, this._onComputedStyleChanged, this);
        }
        this._target = target;
        if (target) {
            this._cssModel = WebInspector.CSSStyleModel.fromTarget(target);
            this._cssModel.addEventListener(WebInspector.CSSStyleModel.Events.StyleSheetAdded, this._onComputedStyleChanged, this);
            this._cssModel.addEventListener(WebInspector.CSSStyleModel.Events.StyleSheetRemoved, this._onComputedStyleChanged, this);
            this._cssModel.addEventListener(WebInspector.CSSStyleModel.Events.StyleSheetChanged, this._onComputedStyleChanged, this);
            this._cssModel.addEventListener(WebInspector.CSSStyleModel.Events.MediaQueryResultChanged, this._onComputedStyleChanged, this);
            this._cssModel.addEventListener(WebInspector.CSSStyleModel.Events.PseudoStateForced, this._onComputedStyleChanged, this);
            this._cssModel.addEventListener(WebInspector.CSSStyleModel.Events.ModelWasEnabled, this._onComputedStyleChanged, this);
            this._domModel = WebInspector.DOMModel.fromTarget(target);
            this._domModel.addEventListener(WebInspector.DOMModel.Events.DOMMutated, this._onComputedStyleChanged, this);
        }
    },

    /**
     * @return {?WebInspector.DOMNode}
     */
    _elementNode: function()
    {
        return WebInspector.SharedSidebarModel.elementNode(this.node());
    },

    /**
     * @return {!Promise.<?WebInspector.SharedSidebarModel.ComputedStyle>}
     */
    fetchComputedStyle: function()
    {
        var elementNode = this._elementNode();
        var cssModel = this.cssModel();
        if (!elementNode || !cssModel)
            return Promise.resolve(/** @type {?WebInspector.SharedSidebarModel.ComputedStyle} */(null));

        if (!this._computedStylePromise)
            this._computedStylePromise = cssModel.computedStylePromise(elementNode.id).then(verifyOutdated.bind(this, elementNode));

        return this._computedStylePromise;

        /**
         * @param {!WebInspector.DOMNode} elementNode
         * @param {?Map.<string, string>} style
         * @return {?WebInspector.SharedSidebarModel.ComputedStyle}
         * @this {WebInspector.SharedSidebarModel}
         */
        function verifyOutdated(elementNode, style)
        {
            return elementNode === this._elementNode() && style ? new WebInspector.SharedSidebarModel.ComputedStyle(elementNode, style) : /** @type {?WebInspector.SharedSidebarModel.ComputedStyle} */(null);
        }
    },

    _onComputedStyleChanged: function()
    {
        delete this._computedStylePromise;
        this.dispatchEventToListeners(WebInspector.SharedSidebarModel.Events.ComputedStyleChanged);
    },

    __proto__: WebInspector.Object.prototype
}

/**
 * @constructor
 * @param {!WebInspector.DOMNode} node
 * @param {!Map.<string, string>} computedStyle
 */
WebInspector.SharedSidebarModel.ComputedStyle = function(node, computedStyle)
{
    this.node = node;
    this.computedStyle = computedStyle;
}
