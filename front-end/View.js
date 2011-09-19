/*
 * Copyright (C) 2008 Apple Inc. All Rights Reserved.
 * Copyright (C) 2011 Google Inc. All Rights Reserved.
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

/**
 * @constructor
 * @param {Element=} element
 */
WebInspector.View = function(element)
{
    this.element = element || document.createElement("div");
    this._visible = false;
    this._children = [];
}

WebInspector.View.prototype = {
    get visible()
    {
        return this._visible;
    },

    set visible(x)
    {
        if (this._visible === x)
            return;

        if (x)
            this.show();
        else
            this.hide();
    },

    wasShown: function()
    {
        this.restoreScrollPositions();
        this.onResize();
    },

    willHide: function()
    {
        this.storeScrollPositions();
    },

    _innerShow: function()
    {
        this.element.addStyleClass("visible");
    },

    show: function(parentElement)
    {
        this._visible = true;
        if (parentElement && parentElement !== this.element.parentNode) {
            this._detach();
            parentElement.appendChild(this.element);
        }
        if (!this.element.parentNode) {
            if (this.attach)
                this.attach();
            else if (this._parentView)
                this._parentView.element.appendChild(this.element);
        }
        this._innerShow();
        this.dispatchToSelfAndVisibleChildren("wasShown");
    },

    _innerHide: function()
    {
        this.element.removeStyleClass("visible");
    },

    hide: function()
    {
        this.dispatchToSelfAndVisibleChildren("willHide");
        this._innerHide();
        this._visible = false;
    },

    _detach: function()
    {
        if (this.element.parentNode)
            this.element.parentNode.removeChild(this.element);
    },

    elementsToRestoreScrollPositionsFor: function()
    {
        return [this.element];
    },

    storeScrollPositions: function()
    {
        var elements = this.elementsToRestoreScrollPositionsFor();
        for (var i = 0; i < elements.length; ++i) {
            var container = elements[i];
            container._scrollTop = container.scrollTop;
            container._scrollLeft = container.scrollLeft;
        }
    },

    restoreScrollPositions: function()
    {
        var elements = this.elementsToRestoreScrollPositionsFor();
        for (var i = 0; i < elements.length; ++i) {
            var container = elements[i];
            if (container._scrollTop)
                container.scrollTop = container._scrollTop;
            if (container._scrollLeft)
                container.scrollLeft = container._scrollLeft;
        }
    },

    addChildView: function(view)
    {
        if (view._parentView === this)
            return;
        if (view._parentView)
            view._parentView.removeChildView(view);
        this._children.push(view);
        view._parentView = this;
    },

    removeChildView: function(view)
    {
        var childIndex = this._children.indexOf(view);
        if (childIndex < 0)
            return;

        this._children.splice(childIndex, 1);
        view._parentView = null;
        view._detach();
    },

    onResize: function()
    {
    },

    doResize: function()
    {
        this.dispatchToSelfAndVisibleChildren("onResize");
    },

    dispatchToSelfAndVisibleChildren: function(methodName)
    {
        if (!this.visible)
            return;
        if (typeof this[methodName] === "function")
            this[methodName].call(this);
        this.dispatchToVisibleChildren(methodName);
    },

    dispatchToVisibleChildren: function(methodName)
    {
        if (!this.visible)
            return;
        for (var i = 0; i < this._children.length; ++i)
            this._children[i].dispatchToSelfAndVisibleChildren(methodName);
    }
}

WebInspector.View.prototype.__proto__ = WebInspector.Object.prototype;
