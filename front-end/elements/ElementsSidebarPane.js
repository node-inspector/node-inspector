// Copyright (c) 2014 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

/**
 * @constructor
 * @extends {WebInspector.SidebarPane}
 * @param {string} title
 */
WebInspector.ElementsSidebarPane = function(title)
{
    WebInspector.SidebarPane.call(this, title);
    this._node = null;
    this._updateController = new WebInspector.ElementsSidebarPane._UpdateController(this, this.doUpdate.bind(this));
    WebInspector.context.addFlavorChangeListener(WebInspector.DOMNode, this._nodeChanged, this);
}

WebInspector.ElementsSidebarPane.prototype = {
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
        return this._cssModel && this._cssModel.isEnabled() ? this._cssModel : null;
    },

    /**
     * @param {!WebInspector.Event} event
     */
    _nodeChanged: function(event)
    {
        this.setNode(/** @type {?WebInspector.DOMNode} */ (event.data));
    },

    /**
     * @param {?WebInspector.DOMNode} node
     */
    setNode: function(node)
    {
        this._node = node;
        this._updateTarget(node ? node.target() : null);
        this.update();
    },

    /**
     * @protected
     * @return {!Promise.<?>}
     */
    doUpdate: function()
    {
        return Promise.resolve();
    },

    update: function()
    {
        this._updateController.update();
    },

    wasShown: function()
    {
        WebInspector.SidebarPane.prototype.wasShown.call(this);
        this._updateController.viewWasShown();
    },

    /**
     * @param {?WebInspector.Target} target
     */
    _updateTarget: function(target)
    {
        if (this._target === target)
            return;
        if (this._target) {
            this._cssModel.removeEventListener(WebInspector.CSSStyleModel.Events.StyleSheetAdded, this.onCSSModelChanged, this);
            this._cssModel.removeEventListener(WebInspector.CSSStyleModel.Events.StyleSheetRemoved, this.onCSSModelChanged, this);
            this._cssModel.removeEventListener(WebInspector.CSSStyleModel.Events.StyleSheetChanged, this.onCSSModelChanged, this);
            this._cssModel.removeEventListener(WebInspector.CSSStyleModel.Events.MediaQueryResultChanged, this.onCSSModelChanged, this);
            this._cssModel.removeEventListener(WebInspector.CSSStyleModel.Events.PseudoStateForced, this.onCSSModelChanged, this);
            this._cssModel.addEventListener(WebInspector.CSSStyleModel.Events.ModelWasEnabled, this.onCSSModelChanged, this);
            this._domModel.removeEventListener(WebInspector.DOMModel.Events.DOMMutated, this.onDOMModelChanged, this);
            this._target.resourceTreeModel.removeEventListener(WebInspector.ResourceTreeModel.EventTypes.FrameResized, this._onFrameResized, this);
        }
        this._target = target;
        if (target) {
            this._cssModel = WebInspector.CSSStyleModel.fromTarget(target);
            this._cssModel.addEventListener(WebInspector.CSSStyleModel.Events.StyleSheetAdded, this.onCSSModelChanged, this);
            this._cssModel.addEventListener(WebInspector.CSSStyleModel.Events.StyleSheetRemoved, this.onCSSModelChanged, this);
            this._cssModel.addEventListener(WebInspector.CSSStyleModel.Events.StyleSheetChanged, this.onCSSModelChanged, this);
            this._cssModel.addEventListener(WebInspector.CSSStyleModel.Events.MediaQueryResultChanged, this.onCSSModelChanged, this);
            this._cssModel.addEventListener(WebInspector.CSSStyleModel.Events.PseudoStateForced, this.onCSSModelChanged, this);
            this._cssModel.addEventListener(WebInspector.CSSStyleModel.Events.ModelWasEnabled, this.onCSSModelChanged, this);
            this._domModel = WebInspector.DOMModel.fromTarget(target);
            this._domModel.addEventListener(WebInspector.DOMModel.Events.DOMMutated, this.onDOMModelChanged, this);
            this._target.resourceTreeModel.addEventListener(WebInspector.ResourceTreeModel.EventTypes.FrameResized, this._onFrameResized, this);
        }
    },

    /**
     * @param {!WebInspector.Event} event
     */
    _onFrameResized: function(event)
    {
        /**
         * @this {WebInspector.ElementsSidebarPane}
         */
        function refreshContents()
        {
            this.onFrameResizedThrottled();
            delete this._frameResizedTimer;
        }

        if (this._frameResizedTimer)
            clearTimeout(this._frameResizedTimer);

        this._frameResizedTimer = setTimeout(refreshContents.bind(this), 100);
    },

    onDOMModelChanged: function() { },

    onCSSModelChanged: function() { },

    onFrameResizedThrottled: function() { },

    __proto__: WebInspector.SidebarPane.prototype
}

/**
 * @constructor
 * @param {!WebInspector.Widget} view
 * @param {function():!Promise.<?>} doUpdate
 */
WebInspector.ElementsSidebarPane._UpdateController = function(view, doUpdate)
{
    this._view = view;
    this._updateThrottler = new WebInspector.Throttler(100);
    this._updateWhenVisible = false;
    this._doUpdate = doUpdate;
}

WebInspector.ElementsSidebarPane._UpdateController.prototype = {
    update: function()
    {
        this._updateWhenVisible = !this._view.isShowing();
        if (this._updateWhenVisible)
            return;
        this._updateThrottler.schedule(innerUpdate.bind(this));

        /**
         * @this {WebInspector.ElementsSidebarPane._UpdateController}
         * @return {!Promise.<?>}
         */
        function innerUpdate()
        {
            return this._view.isShowing() ? this._doUpdate.call(null) : Promise.resolve();
        }
    },

    viewWasShown: function()
    {
        if (this._updateWhenVisible)
            this.update();
    }
}
