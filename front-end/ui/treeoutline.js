/*
 * Copyright (C) 2007 Apple Inc.  All rights reserved.
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
 * @constructor
 */
function TreeContainerNode()
{
    /** @type {!Array.<!TreeElement>} */
    this.children = [];
}

TreeContainerNode.prototype = {
    /**
     * @param {number} x
     * @param {number} y
     * @return {?TreeElement}
     */
    treeElementFromPoint: function(x, y)
    {
        var node = this._childrenListNode.ownerDocument.deepElementFromPoint(x, y);
        if (!node)
            return null;

        var listNode = node.enclosingNodeOrSelfWithNodeNameInArray(["ol", "li"]);
        if (listNode)
            return listNode.parentTreeElement || listNode.treeElement;
        return null;
    },

    /**
     * @param {?Event} event
     * @return {?TreeElement}
     */
    treeElementFromEvent: function(event)
    {
        return event ? this.treeElementFromPoint(event.pageX, event.pageY) : null;
    },

    /**
     * @param {?TreeElement} ancestor
     * @return {boolean}
     */
    hasAncestor: function(ancestor) {
        if (!ancestor)
            return false;

        var currentNode = this.parent;
        while (currentNode) {
            if (ancestor === currentNode)
                return true;
            currentNode = currentNode.parent;
        }

        return false;
    },

    /**
     * @param {!TreeElement} child
     */
    appendChild: function(child)
    {
        var insertionIndex;
        if (this.treeOutline.comparator)
            insertionIndex = insertionIndexForObjectInListSortedByFunction(child, this.children, this.treeOutline.comparator);
        else
            insertionIndex = this.children.length;
        this.insertChild(child, insertionIndex);
    },

    /**
     * @param {!TreeElement} child
     * @param {!TreeElement} beforeChild
     */
    insertBeforeChild: function(child, beforeChild)
    {
        if (!child)
            throw("child can't be undefined or null");

        if (!beforeChild)
            throw("beforeChild can't be undefined or null");

        var childIndex = this.children.indexOf(beforeChild);
        if (childIndex === -1)
            throw("beforeChild not found in this node's children");

        this.insertChild(child, childIndex);
    },

    /**
     * @param {!TreeElement} child
     * @param {number} index
     */
    insertChild: function(child, index)
    {
        if (!child)
            throw("child can't be undefined or null");

        var previousChild = (index > 0 ? this.children[index - 1] : null);
        if (previousChild) {
            previousChild.nextSibling = child;
            child.previousSibling = previousChild;
        } else {
            child.previousSibling = null;
        }

        var nextChild = this.children[index];
        if (nextChild) {
            nextChild.previousSibling = child;
            child.nextSibling = nextChild;
        } else {
            child.nextSibling = null;
        }

        this.children.splice(index, 0, child);
        this.hasChildren = true;
        child.parent = this;
        child.treeOutline = this.treeOutline;
        child.treeOutline._rememberTreeElement(child);

        var current = child.children[0];
        while (current) {
            current.treeOutline = this.treeOutline;
            current.treeOutline._rememberTreeElement(current);
            current = current.traverseNextTreeElement(false, child, true);
        }

        if (child.hasChildren && typeof(child.treeOutline._expandedStateMap.get(child.representedObject)) !== "undefined")
            child.expanded = child.treeOutline._expandedStateMap.get(child.representedObject);

        if (!this._childrenListNode) {
            this._childrenListNode = this.treeOutline._childrenListNode.ownerDocument.createElement("ol");
            this._childrenListNode.parentTreeElement = this;
            this._childrenListNode.classList.add("children");
            if (this.hidden)
                this._childrenListNode.classList.add("hidden");
        }

        child._attach();
    },

    /**
     * @param {number} childIndex
     */
    removeChildAtIndex: function(childIndex)
    {
        if (childIndex < 0 || childIndex >= this.children.length)
            throw("childIndex out of range");

        var child = this.children[childIndex];
        this.children.splice(childIndex, 1);

        var parent = child.parent;
        if (child.deselect()) {
            if (child.previousSibling)
                child.previousSibling.select();
            else if (child.nextSibling)
                child.nextSibling.select();
            else
                parent.select();
        }

        if (child.previousSibling)
            child.previousSibling.nextSibling = child.nextSibling;
        if (child.nextSibling)
            child.nextSibling.previousSibling = child.previousSibling;

        if (child.treeOutline) {
            child.treeOutline._forgetTreeElement(child);
            child.treeOutline._forgetChildrenRecursive(child);
        }

        child._detach();
        child.treeOutline = null;
        child.parent = null;
        child.nextSibling = null;
        child.previousSibling = null;
    },

    /**
     * @param {!TreeElement} child
     */
    removeChild: function(child)
    {
        if (!child)
            throw("child can't be undefined or null");

        var childIndex = this.children.indexOf(child);
        if (childIndex === -1)
            throw("child not found in this node's children");

        this.removeChildAtIndex(childIndex);
    },

    removeChildren: function()
    {
        for (var i = 0; i < this.children.length; ++i) {
            var child = this.children[i];
            child.deselect();

            if (child.treeOutline) {
                child.treeOutline._forgetTreeElement(child);
                child.treeOutline._forgetChildrenRecursive(child);
            }

            child._detach();
            child.treeOutline = null;
            child.parent = null;
            child.nextSibling = null;
            child.previousSibling = null;
        }

        this.children = [];
    },

    expand: function()
    {
    },

    collapse: function()
    {
    },

    select: function()
    {
    },

    deselect: function()
    {
    }
}

/**
 * @constructor
 * @extends {TreeContainerNode}
 * @param {!Element} listNode
 * @param {boolean=} nonFocusable
 */
function TreeOutline(listNode, nonFocusable)
{
    TreeContainerNode.call(this);

    this.selectedTreeElement = null;
    this._childrenListNode = listNode;
    this.childrenListElement = this._childrenListNode;
    this._childrenListNode.removeChildren();
    this.expandTreeElementsWhenArrowing = false;
    this.root = true;
    this.hasChildren = false;
    this.expanded = true;
    this.selected = false;
    this.treeOutline = this;
    /** @type {?function(!TreeElement, !TreeElement):number} */
    this.comparator = null;

    this.setFocusable(!nonFocusable);
    this._childrenListNode.addEventListener("keydown", this._treeKeyDown.bind(this), true);

    /** @type {!Map.<!Object, !Array.<!TreeElement>>} */
    this._treeElementsMap = new Map();
    /** @type {!Map.<!Object, boolean>} */
    this._expandedStateMap = new Map();
    this.element = listNode;
}

TreeOutline.prototype = {
    setFocusable: function(focusable)
    {
        if (focusable)
            this._childrenListNode.setAttribute("tabIndex", 0);
        else
            this._childrenListNode.removeAttribute("tabIndex");
    },

    /**
     * @param {!TreeElement} element
     */
    _rememberTreeElement: function(element)
    {
        var elements = this._treeElementsMap.get(element.representedObject);
        if (!elements) {
            elements = [];
            this._treeElementsMap.set(element.representedObject, elements);
        }

        if (elements.indexOf(element) !== -1)
            return;

        elements.push(element);
    },

    /**
     * @param {!TreeElement} element
     */
    _forgetTreeElement: function(element)
    {
        var elements = this._treeElementsMap.get(element.representedObject);
        if (elements) {
            elements.remove(element, true);
            if (!elements.length)
                this._treeElementsMap.remove(element.representedObject);
        }
    },

    /**
     * @param {!TreeElement} parentElement
     */
    _forgetChildrenRecursive: function(parentElement)
    {
        var child = parentElement.children[0];
        while (child) {
            this._forgetTreeElement(child);
            child = child.traverseNextTreeElement(false, parentElement, true);
        }
    },

    /**
     * @param {?Object} representedObject
     * @return {?TreeElement}
     */
    getCachedTreeElement: function(representedObject)
    {
        if (!representedObject)
            return null;

        var elements = this._treeElementsMap.get(representedObject);
        if (elements && elements.length)
            return elements[0];
        return null;
    },

    _treeKeyDown: function(event)
    {
        if (event.target !== this._childrenListNode)
            return;

        if (!this.selectedTreeElement || event.shiftKey || event.metaKey || event.ctrlKey)
            return;

        var handled = false;
        var nextSelectedElement;
        if (event.keyIdentifier === "Up" && !event.altKey) {
            nextSelectedElement = this.selectedTreeElement.traversePreviousTreeElement(true);
            while (nextSelectedElement && !nextSelectedElement.selectable)
                nextSelectedElement = nextSelectedElement.traversePreviousTreeElement(!this.expandTreeElementsWhenArrowing);
            handled = nextSelectedElement ? true : false;
        } else if (event.keyIdentifier === "Down" && !event.altKey) {
            nextSelectedElement = this.selectedTreeElement.traverseNextTreeElement(true);
            while (nextSelectedElement && !nextSelectedElement.selectable)
                nextSelectedElement = nextSelectedElement.traverseNextTreeElement(!this.expandTreeElementsWhenArrowing);
            handled = nextSelectedElement ? true : false;
        } else if (event.keyIdentifier === "Left") {
            if (this.selectedTreeElement.expanded) {
                if (event.altKey)
                    this.selectedTreeElement.collapseRecursively();
                else
                    this.selectedTreeElement.collapse();
                handled = true;
            } else if (this.selectedTreeElement.parent && !this.selectedTreeElement.parent.root) {
                handled = true;
                if (this.selectedTreeElement.parent.selectable) {
                    nextSelectedElement = this.selectedTreeElement.parent;
                    while (nextSelectedElement && !nextSelectedElement.selectable)
                        nextSelectedElement = nextSelectedElement.parent;
                    handled = nextSelectedElement ? true : false;
                } else if (this.selectedTreeElement.parent)
                    this.selectedTreeElement.parent.collapse();
            }
        } else if (event.keyIdentifier === "Right") {
            if (!this.selectedTreeElement.revealed()) {
                this.selectedTreeElement.reveal();
                handled = true;
            } else if (this.selectedTreeElement.hasChildren) {
                handled = true;
                if (this.selectedTreeElement.expanded) {
                    nextSelectedElement = this.selectedTreeElement.children[0];
                    while (nextSelectedElement && !nextSelectedElement.selectable)
                        nextSelectedElement = nextSelectedElement.nextSibling;
                    handled = nextSelectedElement ? true : false;
                } else {
                    if (event.altKey)
                        this.selectedTreeElement.expandRecursively();
                    else
                        this.selectedTreeElement.expand();
                }
            }
        } else if (event.keyCode === 8 /* Backspace */ || event.keyCode === 46 /* Delete */)
            handled = this.selectedTreeElement.ondelete();
        else if (isEnterKey(event))
            handled = this.selectedTreeElement.onenter();
        else if (event.keyCode === WebInspector.KeyboardShortcut.Keys.Space.code)
            handled = this.selectedTreeElement.onspace();

        if (nextSelectedElement) {
            nextSelectedElement.reveal();
            nextSelectedElement.select(false, true);
        }

        if (handled)
            event.consume(true);
    },

    __proto__: TreeContainerNode.prototype
}

/**
 * @constructor
 * @extends {TreeContainerNode}
 * @param {string|!Node} title
 * @param {?Object=} representedObject
 * @param {boolean=} hasChildren
 */
function TreeElement(title, representedObject, hasChildren)
{
    TreeContainerNode.call(this);
    this._title = title;
    this.representedObject = representedObject || {};

    this.root = false;
    this._hidden = false;
    this._selectable = true;
    this.expanded = false;
    this.selected = false;
    this.hasChildren = hasChildren;
    this.treeOutline = null;
    this.parent = null;
    this.previousSibling = null;
    this.nextSibling = null;
    this._listItemNode = null;
}

/** @const */
TreeElement._ArrowToggleWidth = 10;

TreeElement.prototype = {
    get selectable() {
        if (this._hidden)
            return false;
        return this._selectable;
    },

    set selectable(x) {
        this._selectable = x;
    },

    get listItemElement() {
        return this._listItemNode;
    },

    get childrenListElement() {
        return this._childrenListNode;
    },

    get title() {
        return this._title;
    },

    set title(x) {
        this._title = x;
        this._setListItemNodeContent();
    },

    get tooltip() {
        return this._tooltip;
    },

    set tooltip(x) {
        this._tooltip = x;
        if (this._listItemNode)
            this._listItemNode.title = x ? x : "";
    },

    get hasChildren() {
        return this._hasChildren;
    },

    /**
     * Used inside subclasses.
     *
     * @param {boolean} hasChildren
     */
    setHasChildren: function(hasChildren)
    {
        this.hasChildren = hasChildren;
    },

    set hasChildren(x) {
        if (this._hasChildren === x)
            return;

        this._hasChildren = x;

        if (!this._listItemNode)
            return;

        if (x)
            this._listItemNode.classList.add("parent");
        else {
            this._listItemNode.classList.remove("parent");
            this.collapse();
        }
    },

    get hidden() {
        return this._hidden;
    },

    set hidden(x) {
        if (this._hidden === x)
            return;

        this._hidden = x;

        if (x) {
            if (this._listItemNode)
                this._listItemNode.classList.add("hidden");
            if (this._childrenListNode)
                this._childrenListNode.classList.add("hidden");
        } else {
            if (this._listItemNode)
                this._listItemNode.classList.remove("hidden");
            if (this._childrenListNode)
                this._childrenListNode.classList.remove("hidden");
        }
    },

    get shouldRefreshChildren() {
        return this._shouldRefreshChildren;
    },

    set shouldRefreshChildren(x) {
        this._shouldRefreshChildren = x;
        if (x && this.expanded)
            this.expand();
    },

    _setListItemNodeContent: function()
    {
        if (!this._listItemNode)
            return;

        if (typeof this._title === "string")
            this._listItemNode.textContent = this._title;
        else {
            this._listItemNode.removeChildren();
            if (this._title)
                this._listItemNode.appendChild(this._title);
        }
    },

    _attach: function()
    {
        if (!this._listItemNode || this.parent._shouldRefreshChildren) {
            if (this._listItemNode && this._listItemNode.parentNode)
                this._listItemNode.parentNode.removeChild(this._listItemNode);

            this._listItemNode = this.treeOutline._childrenListNode.ownerDocument.createElement("li");
            this._listItemNode.treeElement = this;
            this._setListItemNodeContent();
            this._listItemNode.title = this._tooltip ? this._tooltip : "";

            if (this.hidden)
                this._listItemNode.classList.add("hidden");
            if (this.hasChildren)
                this._listItemNode.classList.add("parent");
            if (this.expanded)
                this._listItemNode.classList.add("expanded");
            if (this.selected)
                this._listItemNode.classList.add("selected");

            this._listItemNode.addEventListener("mousedown", this._handleMouseDown.bind(this), false);
            this._listItemNode.addEventListener("selectstart", treeElementSelectStart, false);
            this._listItemNode.addEventListener("click", this._treeElementToggled.bind(this), false);
            this._listItemNode.addEventListener("dblclick", this._handleDoubleClick.bind(this), false);

            this.onattach();
        }

        /**
         * @param {!Event} event
         */
        function treeElementSelectStart(event)
        {
            event.currentTarget._selectionStarted = true;
        }

        var nextSibling = null;
        if (this.nextSibling && this.nextSibling._listItemNode && this.nextSibling._listItemNode.parentNode === this.parent._childrenListNode)
            nextSibling = this.nextSibling._listItemNode;
        this.parent._childrenListNode.insertBefore(this._listItemNode, nextSibling);
        if (this._childrenListNode)
            this.parent._childrenListNode.insertBefore(this._childrenListNode, this._listItemNode.nextSibling);
        if (this.selected)
            this.select();
        if (this.expanded)
            this.expand();
    },

    /**
     * @param {!Event} event
     */
    _treeElementToggled: function(event)
    {
        var element = event.currentTarget;
        if (element._selectionStarted) {
            delete element._selectionStarted;
            var selection = element.window().getSelection();
            if (selection && !selection.isCollapsed && element.isSelfOrAncestor(selection.anchorNode) && element.isSelfOrAncestor(selection.focusNode))
                return;
        }

        if (element.treeElement !== this)
            return;

        var toggleOnClick = this.toggleOnClick && !this.selectable;
        var isInTriangle = this.isEventWithinDisclosureTriangle(event);
        if (!toggleOnClick && !isInTriangle)
            return;

        if (event.target && event.target.enclosingNodeOrSelfWithNodeName("a"))
            return;

        if (this.expanded) {
            if (event.altKey)
                this.collapseRecursively();
            else
                this.collapse();
        } else {
            if (event.altKey)
                this.expandRecursively();
            else
                this.expand();
        }
        event.consume();
    },

    /**
     * @param {!Event} event
     */
    _handleMouseDown: function(event)
    {
        var element = event.currentTarget;
        if (!element)
            return;
        delete element._selectionStarted;

        if (!this.selectable)
            return;
        if (element.treeElement !== this)
            return;

        if (this.isEventWithinDisclosureTriangle(event))
            return;

        this.selectOnMouseDown(event);
    },

    /**
     * @param {!MouseEvent} event
     */
    _handleDoubleClick: function(event)
    {
        var element = event.currentTarget;
        if (!element || element.treeElement !== this)
            return;

        var handled = this.ondblclick(event);
        if (handled)
            return;
        if (this.hasChildren && !this.expanded)
            this.expand();
    },

    _detach: function()
    {
        if (this._listItemNode && this._listItemNode.parentNode)
            this._listItemNode.parentNode.removeChild(this._listItemNode);
        if (this._childrenListNode && this._childrenListNode.parentNode)
            this._childrenListNode.parentNode.removeChild(this._childrenListNode);
    },

    collapse: function()
    {
        if (this._listItemNode)
            this._listItemNode.classList.remove("expanded");
        if (this._childrenListNode)
            this._childrenListNode.classList.remove("expanded");

        this.expanded = false;

        if (this.treeOutline)
            this.treeOutline._expandedStateMap.set(this.representedObject, false);

        this.oncollapse();
    },

    collapseRecursively: function()
    {
        var item = this;
        while (item) {
            if (item.expanded)
                item.collapse();
            item = item.traverseNextTreeElement(false, this, true);
        }
    },

    expand: function()
    {
        if (!this.hasChildren || (this.expanded && !this._shouldRefreshChildren && this._childrenListNode))
            return;

        // Set this before onpopulate. Since onpopulate can add elements, this makes
        // sure the expanded flag is true before calling those functions. This prevents the possibility
        // of an infinite loop if onpopulate were to call expand.

        this.expanded = true;
        if (this.treeOutline)
            this.treeOutline._expandedStateMap.set(this.representedObject, true);

        if (this.treeOutline && (!this._childrenListNode || this._shouldRefreshChildren)) {
            if (this._childrenListNode && this._childrenListNode.parentNode)
                this._childrenListNode.parentNode.removeChild(this._childrenListNode);

            this._childrenListNode = this.treeOutline._childrenListNode.ownerDocument.createElement("ol");
            this._childrenListNode.parentTreeElement = this;
            this._childrenListNode.classList.add("children");

            if (this.hidden)
                this._childrenListNode.classList.add("hidden");

            this.onpopulate();

            for (var i = 0; i < this.children.length; ++i)
                this.children[i]._attach();

            delete this._shouldRefreshChildren;
        }

        if (this._listItemNode) {
            this._listItemNode.classList.add("expanded");
            if (this._childrenListNode && this._childrenListNode.parentNode != this._listItemNode.parentNode)
                this.parent._childrenListNode.insertBefore(this._childrenListNode, this._listItemNode.nextSibling);
        }

        if (this._childrenListNode)
            this._childrenListNode.classList.add("expanded");

        this.onexpand();
    },

    /**
     * @param {number=} maxDepth
     */
    expandRecursively: function(maxDepth)
    {
        var item = this;
        var info = {};
        var depth = 0;

        // The Inspector uses TreeOutlines to represents object properties, so recursive expansion
        // in some case can be infinite, since JavaScript objects can hold circular references.
        // So default to a recursion cap of 3 levels, since that gives fairly good results.
        if (isNaN(maxDepth))
            maxDepth = 3;

        while (item) {
            if (depth < maxDepth)
                item.expand();
            item = item.traverseNextTreeElement(false, this, (depth >= maxDepth), info);
            depth += info.depthChange;
        }
    },

    reveal: function()
    {
        var currentAncestor = this.parent;
        while (currentAncestor && !currentAncestor.root) {
            if (!currentAncestor.expanded)
                currentAncestor.expand();
            currentAncestor = currentAncestor.parent;
        }

        this.listItemElement.scrollIntoViewIfNeeded();

        this.onreveal();
    },

    /**
     * @return {boolean}
     */
    revealed: function()
    {
        var currentAncestor = this.parent;
        while (currentAncestor && !currentAncestor.root) {
            if (!currentAncestor.expanded)
                return false;
            currentAncestor = currentAncestor.parent;
        }

        return true;
    },

    selectOnMouseDown: function(event)
    {
        if (this.select(false, true))
            event.consume(true);
    },

    /**
     * @param {boolean=} omitFocus
     * @param {boolean=} selectedByUser
     * @return {boolean}
     */
    select: function(omitFocus, selectedByUser)
    {
        if (!this.treeOutline || !this.selectable || this.selected)
            return false;

        if (this.treeOutline.selectedTreeElement)
            this.treeOutline.selectedTreeElement.deselect();

        this.selected = true;

        if (!omitFocus)
            this.treeOutline._childrenListNode.focus();

        // Focusing on another node may detach "this" from tree.
        if (!this.treeOutline)
            return false;
        this.treeOutline.selectedTreeElement = this;
        if (this._listItemNode)
            this._listItemNode.classList.add("selected");

        return this.onselect(selectedByUser);
    },

    /**
     * @param {boolean=} omitFocus
     */
    revealAndSelect: function(omitFocus)
    {
        this.reveal();
        this.select(omitFocus);
    },

    /**
     * @param {boolean=} supressOnDeselect
     * @return {boolean}
     */
    deselect: function(supressOnDeselect)
    {
        if (!this.treeOutline || this.treeOutline.selectedTreeElement !== this || !this.selected)
            return false;

        this.selected = false;
        this.treeOutline.selectedTreeElement = null;
        if (this._listItemNode)
            this._listItemNode.classList.remove("selected");
        return true;
    },

    onpopulate: function()
    {
        // Overridden by subclasses.
    },

    /**
     * @return {boolean}
     */
    onenter: function()
    {
        return false;
    },

    /**
     * @return {boolean}
     */
    ondelete: function()
    {
        return false;
    },

    /**
     * @return {boolean}
     */
    onspace: function()
    {
        return false;
    },

    onattach: function()
    {
    },

    onexpand: function()
    {
    },

    oncollapse: function()
    {
    },

    /**
     * @param {!MouseEvent} e
     * @return {boolean}
     */
    ondblclick: function(e)
    {
        return false;
    },

    onreveal: function()
    {
    },

    /**
     * @param {boolean=} selectedByUser
     * @return {boolean}
     */
    onselect: function(selectedByUser)
    {
        return false;
    },

    /**
     * @param {boolean} skipUnrevealed
     * @param {(!TreeOutline|!TreeElement|null)=} stayWithin
     * @param {boolean=} dontPopulate
     * @param {!Object=} info
     * @return {?TreeElement}
     */
    traverseNextTreeElement: function(skipUnrevealed, stayWithin, dontPopulate, info)
    {
        if (!dontPopulate && this.hasChildren)
            this.onpopulate();

        if (info)
            info.depthChange = 0;

        var element = skipUnrevealed ? (this.revealed() ? this.children[0] : null) : this.children[0];
        if (element && (!skipUnrevealed || (skipUnrevealed && this.expanded))) {
            if (info)
                info.depthChange = 1;
            return element;
        }

        if (this === stayWithin)
            return null;

        element = skipUnrevealed ? (this.revealed() ? this.nextSibling : null) : this.nextSibling;
        if (element)
            return element;

        element = this;
        while (element && !element.root && !(skipUnrevealed ? (element.revealed() ? element.nextSibling : null) : element.nextSibling) && element.parent !== stayWithin) {
            if (info)
                info.depthChange -= 1;
            element = element.parent;
        }

        if (!element)
            return null;

        return (skipUnrevealed ? (element.revealed() ? element.nextSibling : null) : element.nextSibling);
    },

    /**
     * @param {boolean} skipUnrevealed
     * @param {boolean=} dontPopulate
     * @return {?TreeElement}
     */
    traversePreviousTreeElement: function(skipUnrevealed, dontPopulate)
    {
        var element = skipUnrevealed ? (this.revealed() ? this.previousSibling : null) : this.previousSibling;
        if (!dontPopulate && element && element.hasChildren)
            element.onpopulate();

        while (element && (skipUnrevealed ? (element.revealed() && element.expanded ? element.children[element.children.length - 1] : null) : element.children[element.children.length - 1])) {
            if (!dontPopulate && element.hasChildren)
                element.onpopulate();
            element = (skipUnrevealed ? (element.revealed() && element.expanded ? element.children[element.children.length - 1] : null) : element.children[element.children.length - 1]);
        }

        if (element)
            return element;

        if (!this.parent || this.parent.root)
            return null;

        return this.parent;
    },

    /**
     * @return {boolean}
     */
    isEventWithinDisclosureTriangle: function(event)
    {
        // FIXME: We should not use getComputedStyle(). For that we need to get rid of using ::before for disclosure triangle. (http://webk.it/74446)
        var paddingLeftValue = window.getComputedStyle(this._listItemNode).paddingLeft;
        console.assert(paddingLeftValue.endsWith("px"));
        var computedLeftPadding = parseFloat(paddingLeftValue);
        var left = this._listItemNode.totalOffsetLeft() + computedLeftPadding;
        return event.pageX >= left && event.pageX <= left + TreeElement._ArrowToggleWidth && this.hasChildren;
    },

    __proto__: TreeContainerNode.prototype
}
