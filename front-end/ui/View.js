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
 * @extends {WebInspector.Object}
 * @param {boolean=} isWebComponent
 */
WebInspector.View = function(isWebComponent)
{
    this.contentElement = createElementWithClass("div", "view");
    if (isWebComponent) {
        WebInspector.installComponentRootStyles(this.contentElement);
        this.element = createElementWithClass("div", "vbox flex-auto");
        this._shadowRoot = this.element.createShadowRoot();
        this._shadowRoot.appendChild(this.contentElement);
    } else {
        this.element = this.contentElement;
    }
    this._isWebComponent = isWebComponent;
    this.element.__view = this;
    this._visible = true;
    this._isRoot = false;
    this._isShowing = false;
    this._children = [];
    this._hideOnDetach = false;
    this._cssFiles = [];
    this._notificationDepth = 0;
}

/**
 * @param {string} cssFile
 * @return {!Element}
 */
WebInspector.View.createStyleElement = function(cssFile)
{
    var content = Runtime.cachedResources[cssFile] || "";
    if (!content)
        console.error(cssFile + " not preloaded. Check module.json");
    var styleElement = createElement("style");
    styleElement.type = "text/css";
    styleElement.textContent = content;
    return styleElement;
}

WebInspector.View.prototype = {
    markAsRoot: function()
    {
        WebInspector.installComponentRootStyles(this.element);
        WebInspector.View.__assert(!this.element.parentElement, "Attempt to mark as root attached node");
        this._isRoot = true;
    },

    /**
     * @return {?WebInspector.View}
     */
    parentView: function()
    {
        return this._parentView;
    },

    /**
     * @return {!Array.<!WebInspector.View>}
     */
    children: function()
    {
        return this._children;
    },

    /**
     * @param {!WebInspector.View} view
     * @protected
     */
    childWasDetached: function(view)
    {
    },

    /**
     * @return {boolean}
     */
    isShowing: function()
    {
        return this._isShowing;
    },

    /**
     * @return {boolean}
     */
    _shouldHideOnDetach: function()
    {
        if (this._hideOnDetach)
            return true;
        for (var child of this._children) {
            if (child._shouldHideOnDetach())
                return true;
        }
        return false;
    },

    setHideOnDetach: function()
    {
        this._hideOnDetach = true;
    },

    /**
     * @return {boolean}
     */
    _inNotification: function()
    {
        return !!this._notificationDepth || (this._parentView && this._parentView._inNotification());
    },

    _parentIsShowing: function()
    {
        if (this._isRoot)
            return true;
        return this._parentView && this._parentView.isShowing();
    },

    /**
     * @param {function(this:WebInspector.View)} method
     */
    _callOnVisibleChildren: function(method)
    {
        var copy = this._children.slice();
        for (var i = 0; i < copy.length; ++i) {
            if (copy[i]._parentView === this && copy[i]._visible)
                method.call(copy[i]);
        }
    },

    _processWillShow: function()
    {
        this._callOnVisibleChildren(this._processWillShow);
        this._isShowing = true;
    },

    _processWasShown: function()
    {
        if (this._inNotification())
            return;
        this.restoreScrollPositions();
        this._notify(this.wasShown);
        this._callOnVisibleChildren(this._processWasShown);
    },

    _processWillHide: function()
    {
        if (this._inNotification())
            return;
        this.storeScrollPositions();

        this._callOnVisibleChildren(this._processWillHide);
        this._notify(this.willHide);
        this._isShowing = false;
    },

    _processWasHidden: function()
    {
        this._callOnVisibleChildren(this._processWasHidden);
    },

    _processOnResize: function()
    {
        if (this._inNotification())
            return;
        if (!this.isShowing())
            return;
        this._notify(this.onResize);
        this._callOnVisibleChildren(this._processOnResize);
    },

    /**
     * @param {function(this:WebInspector.View)} notification
     */
    _notify: function(notification)
    {
        ++this._notificationDepth;
        try {
            notification.call(this);
        } finally {
            --this._notificationDepth;
        }
    },

    wasShown: function()
    {
    },

    willHide: function()
    {
    },

    onResize: function()
    {
    },

    onLayout: function()
    {
    },

    /**
     * @param {?Element} parentElement
     * @param {?Element=} insertBefore
     */
    show: function(parentElement, insertBefore)
    {
        WebInspector.View.__assert(parentElement, "Attempt to attach view with no parent element");

        // Update view hierarchy
        if (this.element.parentElement !== parentElement) {
            if (this.element.parentElement)
                this.detach();

            var currentParent = parentElement;
            while (currentParent && !currentParent.__view)
                currentParent = currentParent.parentElementOrShadowHost();

            if (currentParent) {
                this._parentView = currentParent.__view;
                this._parentView._children.push(this);
                this._isRoot = false;
            } else
                WebInspector.View.__assert(this._isRoot, "Attempt to attach view to orphan node");
        } else if (this._visible) {
            return;
        }

        this._visible = true;

        if (this._parentIsShowing())
            this._processWillShow();

        this.element.classList.add("visible");

        // Reparent
        if (this.element.parentElement !== parentElement) {
            WebInspector.View._incrementViewCounter(parentElement, this.element);
            if (insertBefore)
                WebInspector.View._originalInsertBefore.call(parentElement, this.element, insertBefore);
            else
                WebInspector.View._originalAppendChild.call(parentElement, this.element);
        }

        if (this._parentIsShowing())
            this._processWasShown();

        if (this._parentView && this._hasNonZeroConstraints())
            this._parentView.invalidateConstraints();
        else
            this._processOnResize();
    },

    /**
     * @param {boolean=} overrideHideOnDetach
     */
    detach: function(overrideHideOnDetach)
    {
        var parentElement = this.element.parentElement;
        if (!parentElement)
            return;

        if (this._parentIsShowing())
            this._processWillHide();

        if (!overrideHideOnDetach && this._shouldHideOnDetach()) {
            this.element.classList.remove("visible");
            this._visible = false;
            if (this._parentIsShowing())
                this._processWasHidden();
            if (this._parentView && this._hasNonZeroConstraints())
                this._parentView.invalidateConstraints();
            return;
        }

        // Force legal removal
        WebInspector.View._decrementViewCounter(parentElement, this.element);
        WebInspector.View._originalRemoveChild.call(parentElement, this.element);

        this._visible = false;
        if (this._parentIsShowing())
            this._processWasHidden();

        // Update view hierarchy
        if (this._parentView) {
            var childIndex = this._parentView._children.indexOf(this);
            WebInspector.View.__assert(childIndex >= 0, "Attempt to remove non-child view");
            this._parentView._children.splice(childIndex, 1);
            this._parentView.childWasDetached(this);
            var parent = this._parentView;
            this._parentView = null;
            if (this._hasNonZeroConstraints())
                parent.invalidateConstraints();
        } else
            WebInspector.View.__assert(this._isRoot, "Removing non-root view from DOM");
    },

    detachChildViews: function()
    {
        var children = this._children.slice();
        for (var i = 0; i < children.length; ++i)
            children[i].detach();
    },

    /**
     * @return {!Array.<!Element>}
     */
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

    doResize: function()
    {
        if (!this.isShowing())
            return;
        // No matter what notification we are in, dispatching onResize is not needed.
        if (!this._inNotification())
            this._callOnVisibleChildren(this._processOnResize);
    },

    doLayout: function()
    {
        if (!this.isShowing())
            return;
        this._notify(this.onLayout);
        this.doResize();
    },

    /**
     * @param {string} cssFile
     */
    registerRequiredCSS: function(cssFile)
    {
        (this._isWebComponent ? this._shadowRoot : this.element).appendChild(WebInspector.View.createStyleElement(cssFile));
    },

    printViewHierarchy: function()
    {
        var lines = [];
        this._collectViewHierarchy("", lines);
        console.log(lines.join("\n"));
    },

    _collectViewHierarchy: function(prefix, lines)
    {
        lines.push(prefix + "[" + this.element.className + "]" + (this._children.length ? " {" : ""));

        for (var i = 0; i < this._children.length; ++i)
            this._children[i]._collectViewHierarchy(prefix + "    ", lines);

        if (this._children.length)
            lines.push(prefix + "}");
    },

    /**
     * @return {!Element}
     */
    defaultFocusedElement: function()
    {
        return this._defaultFocusedElement || this.element;
    },

    /**
     * @param {!Element} element
     */
    setDefaultFocusedElement: function(element)
    {
        this._defaultFocusedElement = element;
    },

    focus: function()
    {
        var element = this.defaultFocusedElement();
        if (!element || element.isAncestor(this.element.ownerDocument.activeElement))
            return;

        WebInspector.setCurrentFocusElement(element);
    },

    /**
     * @return {boolean}
     */
    hasFocus: function()
    {
        var activeElement = this.element.ownerDocument.activeElement;
        return activeElement && activeElement.isSelfOrDescendant(this.element);
    },

    /**
     * @return {!Size}
     */
    measurePreferredSize: function()
    {
        var document = this.element.ownerDocument;
        WebInspector.View._originalAppendChild.call(document.body, this.element);
        this.element.positionAt(0, 0);
        var result = new Size(this.element.offsetWidth, this.element.offsetHeight);
        this.element.positionAt(undefined, undefined);
        WebInspector.View._originalRemoveChild.call(document.body, this.element);
        return result;
    },

    /**
     * @return {!Constraints}
     */
    calculateConstraints: function()
    {
        return new Constraints();
    },

    /**
     * @return {!Constraints}
     */
    constraints: function()
    {
        if (typeof this._constraints !== "undefined")
            return this._constraints;
        if (typeof this._cachedConstraints === "undefined")
            this._cachedConstraints = this.calculateConstraints();
        return this._cachedConstraints;
    },

    /**
     * @param {number} width
     * @param {number} height
     * @param {number} preferredWidth
     * @param {number} preferredHeight
     */
    setMinimumAndPreferredSizes: function(width, height, preferredWidth, preferredHeight)
    {
        this._constraints = new Constraints(new Size(width, height), new Size(preferredWidth, preferredHeight));
        this.invalidateConstraints();
    },

    /**
     * @param {number} width
     * @param {number} height
     */
    setMinimumSize: function(width, height)
    {
        this._constraints = new Constraints(new Size(width, height));
        this.invalidateConstraints();
    },

    /**
     * @return {boolean}
     */
    _hasNonZeroConstraints: function()
    {
        var constraints = this.constraints();
        return !!(constraints.minimum.width || constraints.minimum.height || constraints.preferred.width || constraints.preferred.height);
    },

    invalidateConstraints: function()
    {
        var cached = this._cachedConstraints;
        delete this._cachedConstraints;
        var actual = this.constraints();
        if (!actual.isEqual(cached) && this._parentView)
            this._parentView.invalidateConstraints();
        else
            this.doLayout();
    },

    __proto__: WebInspector.Object.prototype
}

WebInspector.View._originalAppendChild = Element.prototype.appendChild;
WebInspector.View._originalInsertBefore = Element.prototype.insertBefore;
WebInspector.View._originalRemoveChild = Element.prototype.removeChild;
WebInspector.View._originalRemoveChildren = Element.prototype.removeChildren;

WebInspector.View._incrementViewCounter = function(parentElement, childElement)
{
    var count = (childElement.__viewCounter || 0) + (childElement.__view ? 1 : 0);
    if (!count)
        return;

    while (parentElement) {
        parentElement.__viewCounter = (parentElement.__viewCounter || 0) + count;
        parentElement = parentElement.parentElementOrShadowHost();
    }
}

WebInspector.View._decrementViewCounter = function(parentElement, childElement)
{
    var count = (childElement.__viewCounter || 0) + (childElement.__view ? 1 : 0);
    if (!count)
        return;

    while (parentElement) {
        parentElement.__viewCounter -= count;
        parentElement = parentElement.parentElementOrShadowHost();
    }
}

WebInspector.View.__assert = function(condition, message)
{
    if (!condition) {
        console.trace();
        throw new Error(message);
    }
}

/**
 * @constructor
 * @extends {WebInspector.View}
 * @param {boolean=} isWebComponent
 */
WebInspector.VBox = function(isWebComponent)
{
    WebInspector.View.call(this, isWebComponent);
    this.contentElement.classList.add("vbox");
};

WebInspector.VBox.prototype = {
    /**
     * @return {!Constraints}
     */
    calculateConstraints: function()
    {
        var constraints = new Constraints();

        /**
         * @this {!WebInspector.View}
         * @suppressReceiverCheck
         */
        function updateForChild()
        {
            var child = this.constraints();
            constraints = constraints.widthToMax(child);
            constraints = constraints.addHeight(child);
        }

        this._callOnVisibleChildren(updateForChild);
        return constraints;
    },

    __proto__: WebInspector.View.prototype
};

/**
 * @constructor
 * @extends {WebInspector.View}
 * @param {boolean=} isWebComponent
 */
WebInspector.HBox = function(isWebComponent)
{
    WebInspector.View.call(this, isWebComponent);
    this.contentElement.classList.add("hbox");
};

WebInspector.HBox.prototype = {
    /**
     * @return {!Constraints}
     */
    calculateConstraints: function()
    {
        var constraints = new Constraints();

        /**
         * @this {!WebInspector.View}
         * @suppressReceiverCheck
         */
        function updateForChild()
        {
            var child = this.constraints();
            constraints = constraints.addWidth(child);
            constraints = constraints.heightToMax(child);
        }

        this._callOnVisibleChildren(updateForChild);
        return constraints;
    },

    __proto__: WebInspector.View.prototype
};

/**
 * @constructor
 * @extends {WebInspector.VBox}
 * @param {function()} resizeCallback
 */
WebInspector.VBoxWithResizeCallback = function(resizeCallback)
{
    WebInspector.VBox.call(this);
    this._resizeCallback = resizeCallback;
}

WebInspector.VBoxWithResizeCallback.prototype = {
    onResize: function()
    {
        this._resizeCallback();
    },

    __proto__: WebInspector.VBox.prototype
}

/**
 * @param {?Node} child
 * @return {?Node}
 * @suppress {duplicate}
 */
Element.prototype.appendChild = function(child)
{
    WebInspector.View.__assert(!child.__view || child.parentElement === this, "Attempt to add view via regular DOM operation.");
    return WebInspector.View._originalAppendChild.call(this, child);
}

/**
 * @param {?Node} child
 * @param {?Node} anchor
 * @return {!Node}
 * @suppress {duplicate}
 */
Element.prototype.insertBefore = function(child, anchor)
{
    WebInspector.View.__assert(!child.__view || child.parentElement === this, "Attempt to add view via regular DOM operation.");
    return WebInspector.View._originalInsertBefore.call(this, child, anchor);
}

/**
 * @param {?Node} child
 * @return {!Node}
 * @suppress {duplicate}
 */
Element.prototype.removeChild = function(child)
{
    WebInspector.View.__assert(!child.__viewCounter && !child.__view, "Attempt to remove element containing view via regular DOM operation");
    return WebInspector.View._originalRemoveChild.call(this, child);
}

Element.prototype.removeChildren = function()
{
    WebInspector.View.__assert(!this.__viewCounter, "Attempt to remove element containing view via regular DOM operation");
    WebInspector.View._originalRemoveChildren.call(this);
}
