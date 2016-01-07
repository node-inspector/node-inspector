/*
 * Copyright (C) 2007, 2008 Apple Inc.  All rights reserved.
 * Copyright (C) 2008 Matt Lilek <webkit@mattlilek.com>
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
 * @constructor
 * @extends {TreeOutline}
 * @param {!WebInspector.DOMModel} domModel
 * @param {boolean=} omitRootDOMNode
 * @param {boolean=} selectEnabled
 */
WebInspector.ElementsTreeOutline = function(domModel, omitRootDOMNode, selectEnabled)
{
    this._domModel = domModel;
    this._treeElementSymbol = Symbol("treeElement");

    var element = createElement("div");

    this._shadowRoot = WebInspector.createShadowRootWithCoreStyles(element);
    this._shadowRoot.appendChild(WebInspector.Widget.createStyleElement("elements/elementsTreeOutline.css"));
    var outlineDisclosureElement = this._shadowRoot.createChild("div", "elements-disclosure");

    TreeOutline.call(this);
    this._element = this.element;
    this._element.classList.add("elements-tree-outline", "source-code");
    this._element.addEventListener("mousedown", this._onmousedown.bind(this), false);
    this._element.addEventListener("mousemove", this._onmousemove.bind(this), false);
    this._element.addEventListener("mouseleave", this._onmouseleave.bind(this), false);
    this._element.addEventListener("dragstart", this._ondragstart.bind(this), false);
    this._element.addEventListener("dragover", this._ondragover.bind(this), false);
    this._element.addEventListener("dragleave", this._ondragleave.bind(this), false);
    this._element.addEventListener("drop", this._ondrop.bind(this), false);
    this._element.addEventListener("dragend", this._ondragend.bind(this), false);
    this._element.addEventListener("webkitAnimationEnd", this._onAnimationEnd.bind(this), false);
    this._element.addEventListener("contextmenu", this._contextMenuEventFired.bind(this), false);

    outlineDisclosureElement.appendChild(this._element);
    this.element = element;

    this._includeRootDOMNode = !omitRootDOMNode;
    this._selectEnabled = selectEnabled;
    /** @type {?WebInspector.DOMNode} */
    this._rootDOMNode = null;
    /** @type {?WebInspector.DOMNode} */
    this._selectedDOMNode = null;

    this._visible = false;
    this._pickNodeMode = false;

    this._popoverHelper = new WebInspector.PopoverHelper(this._element, this._getPopoverAnchor.bind(this), this._showPopover.bind(this));
    this._popoverHelper.setTimeout(0);

    /** @type {!Map<!WebInspector.DOMNode, !WebInspector.ElementsTreeOutline.UpdateRecord>} */
    this._updateRecords = new Map();
    /** @type {!Set<!WebInspector.ElementsTreeElement>} */
    this._treeElementsBeingUpdated = new Set();

    this._domModel.addEventListener(WebInspector.DOMModel.Events.MarkersChanged, this._markersChanged, this);
}

/** @typedef {{node: !WebInspector.DOMNode, isCut: boolean}} */
WebInspector.ElementsTreeOutline.ClipboardData;

/**
 * @enum {string}
 */
WebInspector.ElementsTreeOutline.Events = {
    NodePicked: "NodePicked",
    SelectedNodeChanged: "SelectedNodeChanged",
    ElementsTreeUpdated: "ElementsTreeUpdated",
    DecorationsClicked: "DecorationsClicked"
}

/**
 * @const
 * @type {!Object.<string, string>}
 */
WebInspector.ElementsTreeOutline.MappedCharToEntity = {
    "\u00a0": "nbsp",
    "\u0093": "#147", // <control>
    "\u00ad": "shy",
    "\u2002": "ensp",
    "\u2003": "emsp",
    "\u2009": "thinsp",
    "\u200a": "#8202", // Hairspace
    "\u200b": "#8203", // ZWSP
    "\u200c": "zwnj",
    "\u200d": "zwj",
    "\u200e": "lrm",
    "\u200f": "rlm",
    "\u202a": "#8234", // LRE
    "\u202b": "#8235", // RLE
    "\u202c": "#8236", // PDF
    "\u202d": "#8237", // LRO
    "\u202e": "#8238", // RLO
    "\ufeff": "#65279" // BOM
}

WebInspector.ElementsTreeOutline.prototype = {
    /**
     * @return {symbol}
     */
    treeElementSymbol: function()
    {
        return this._treeElementSymbol;
    },

    focus: function()
    {
        this._element.focus();
    },

    /**
     * @return {boolean}
     */
    hasFocus: function()
    {
        return this._element === WebInspector.currentFocusElement();
    },

    /**
     * @param {boolean} wrap
     */
    setWordWrap: function(wrap)
    {
        this._element.classList.toggle("elements-tree-nowrap", !wrap);
    },

    /**
     * @param {!Event} event
     */
    _onAnimationEnd: function(event)
    {
        event.target.classList.remove("elements-tree-element-pick-node-1");
        event.target.classList.remove("elements-tree-element-pick-node-2");
    },

    /**
     * @return {boolean}
     */
    pickNodeMode: function()
    {
        return this._pickNodeMode;
    },

    /**
     * @param {boolean} value
     */
    setPickNodeMode: function(value)
    {
        this._pickNodeMode = value;
        this._element.classList.toggle("pick-node-mode", value);
    },

    /**
     * @param {!Element} element
     * @param {?WebInspector.DOMNode} node
     * @return {boolean}
     */
    handlePickNode: function(element, node)
    {
        if (!this._pickNodeMode)
            return false;

        this.dispatchEventToListeners(WebInspector.ElementsTreeOutline.Events.NodePicked, node);
        var hasRunningAnimation = element.classList.contains("elements-tree-element-pick-node-1") || element.classList.contains("elements-tree-element-pick-node-2");
        element.classList.toggle("elements-tree-element-pick-node-1");
        if (hasRunningAnimation)
            element.classList.toggle("elements-tree-element-pick-node-2");
        return true;
    },

    /**
     * @return {!WebInspector.DOMModel}
     */
    domModel: function()
    {
        return this._domModel;
    },

    /**
     * @param {?WebInspector.InplaceEditor.Controller} multilineEditing
     */
    setMultilineEditing: function(multilineEditing)
    {
        this._multilineEditing = multilineEditing;
    },

    /**
     * @return {number}
     */
    visibleWidth: function()
    {
        return this._visibleWidth;
    },

    /**
     * @param {number} width
     */
    setVisibleWidth: function(width)
    {
        this._visibleWidth = width;
        if (this._multilineEditing)
            this._multilineEditing.setWidth(this._visibleWidth);
    },

    /**
     * @param {?WebInspector.ElementsTreeOutline.ClipboardData} data
     */
    _setClipboardData: function(data)
    {
        if (this._clipboardNodeData) {
            var treeElement = this.findTreeElement(this._clipboardNodeData.node);
            if (treeElement)
                treeElement.setInClipboard(false);
            delete this._clipboardNodeData;
        }

        if (data) {
            var treeElement = this.findTreeElement(data.node);
            if (treeElement)
                treeElement.setInClipboard(true);
            this._clipboardNodeData = data;
        }
    },

    /**
     * @param {!WebInspector.DOMNode} removedNode
     */
    resetClipboardIfNeeded: function(removedNode)
    {
        if (this._clipboardNodeData && this._clipboardNodeData.node === removedNode)
            this._setClipboardData(null);
    },

    /**
     * @param {boolean} isCut
     * @param {!Event} event
     */
    handleCopyOrCutKeyboardEvent: function(isCut, event)
    {
        this._setClipboardData(null);

        // Don't prevent the normal copy if the user has a selection.
        if (!event.target.isComponentSelectionCollapsed())
            return;

        // Do not interfere with text editing.
        if (WebInspector.isEditing())
            return;

        var targetNode = this.selectedDOMNode();
        if (!targetNode)
            return;

        event.clipboardData.clearData();
        event.preventDefault();

        this.performCopyOrCut(isCut, targetNode);
    },

    /**
     * @param {boolean} isCut
     * @param {?WebInspector.DOMNode} node
     */
    performCopyOrCut: function(isCut, node)
    {
        if (isCut && (node.isShadowRoot() || node.ancestorUserAgentShadowRoot()))
            return;

        node.copyNode();
        this._setClipboardData({ node: node, isCut: isCut });
    },

    /**
     * @param {!WebInspector.DOMNode} targetNode
     * @return {boolean}
     */
    canPaste: function(targetNode)
    {
        if (targetNode.isShadowRoot() || targetNode.ancestorUserAgentShadowRoot())
            return false;

        if (!this._clipboardNodeData)
            return false;

        var node = this._clipboardNodeData.node;
        if (this._clipboardNodeData.isCut && (node === targetNode || node.isAncestor(targetNode)))
            return false;

        if (targetNode.target() !== node.target())
            return false;
        return true;
    },

    /**
     * @param {!WebInspector.DOMNode} targetNode
     */
    pasteNode: function(targetNode)
    {
        if (this.canPaste(targetNode))
            this._performPaste(targetNode);
    },

    /**
     * @param {!Event} event
     */
    handlePasteKeyboardEvent: function(event)
    {
        // Do not interfere with text editing.
        if (WebInspector.isEditing())
            return;

        var targetNode = this.selectedDOMNode();
        if (!targetNode || !this.canPaste(targetNode))
            return;

        event.preventDefault();
        this._performPaste(targetNode);
    },

    /**
     * @param {!WebInspector.DOMNode} targetNode
     */
    _performPaste: function(targetNode)
    {
        if (this._clipboardNodeData.isCut) {
            this._clipboardNodeData.node.moveTo(targetNode, null, expandCallback.bind(this));
            this._setClipboardData(null);
        } else {
            this._clipboardNodeData.node.copyTo(targetNode, null, expandCallback.bind(this));
        }

        /**
         * @param {?Protocol.Error} error
         * @param {!DOMAgent.NodeId} nodeId
         * @this {WebInspector.ElementsTreeOutline}
         */
        function expandCallback(error, nodeId)
        {
            if (error)
                return;
            var pastedNode = this._domModel.nodeForId(nodeId);
            if (!pastedNode)
                return;
            this.selectDOMNode(pastedNode);
        }
    },

    /**
     * @param {boolean} visible
     */
    setVisible: function(visible)
    {
        this._visible = visible;
        if (!this._visible) {
            this._popoverHelper.hidePopover();
            if (this._multilineEditing)
                this._multilineEditing.cancel();
            return;
        }

        this.runPendingUpdates();
        if (this._selectedDOMNode)
            this._revealAndSelectNode(this._selectedDOMNode, false);
    },

    get rootDOMNode()
    {
        return this._rootDOMNode;
    },

    set rootDOMNode(x)
    {
        if (this._rootDOMNode === x)
            return;

        this._rootDOMNode = x;

        this._isXMLMimeType = x && x.isXMLNode();

        this.update();
    },

    get isXMLMimeType()
    {
        return this._isXMLMimeType;
    },

    /**
     * @return {?WebInspector.DOMNode}
     */
    selectedDOMNode: function()
    {
        return this._selectedDOMNode;
    },

    /**
     * @param {?WebInspector.DOMNode} node
     * @param {boolean=} focus
     */
    selectDOMNode: function(node, focus)
    {
        if (this._selectedDOMNode === node) {
            this._revealAndSelectNode(node, !focus);
            return;
        }

        this._selectedDOMNode = node;
        this._revealAndSelectNode(node, !focus);

        // The _revealAndSelectNode() method might find a different element if there is inlined text,
        // and the select() call would change the selectedDOMNode and reenter this setter. So to
        // avoid calling _selectedNodeChanged() twice, first check if _selectedDOMNode is the same
        // node as the one passed in.
        if (this._selectedDOMNode === node)
            this._selectedNodeChanged();
    },

    /**
     * @return {boolean}
     */
    editing: function()
    {
        var node = this.selectedDOMNode();
        if (!node)
            return false;
        var treeElement = this.findTreeElement(node);
        if (!treeElement)
            return false;
        return treeElement.isEditing() || false;
    },

    update: function()
    {
        var selectedTreeElement = this.selectedTreeElement;
        if (!(selectedTreeElement instanceof WebInspector.ElementsTreeElement))
            selectedTreeElement = null;

        var selectedNode = selectedTreeElement ? selectedTreeElement.node() : null;

        this.removeChildren();

        if (!this.rootDOMNode)
            return;

        var treeElement;
        if (this._includeRootDOMNode) {
            treeElement = this._createElementTreeElement(this.rootDOMNode);
            this.appendChild(treeElement);
        } else {
            // FIXME: this could use findTreeElement to reuse a tree element if it already exists
            var node = this.rootDOMNode.firstChild;
            while (node) {
                treeElement = this._createElementTreeElement(node);
                this.appendChild(treeElement);
                node = node.nextSibling;
            }
        }

        if (selectedNode)
            this._revealAndSelectNode(selectedNode, true);
    },

    updateSelection: function()
    {
        if (!this.selectedTreeElement)
            return;
        var element = this.selectedTreeElement;
        element.updateSelection();
    },

    /**
     * @param {!WebInspector.DOMNode} node
     */
    updateOpenCloseTags: function(node)
    {
        var treeElement = this.findTreeElement(node);
        if (treeElement)
            treeElement.updateTitle(this._updateRecordForHighlight(node));
        var closingTagElement = treeElement.lastChild();
        if (closingTagElement && closingTagElement.isClosingTag())
            closingTagElement.updateTitle(this._updateRecordForHighlight(node));
    },

    _selectedNodeChanged: function()
    {
        this.dispatchEventToListeners(WebInspector.ElementsTreeOutline.Events.SelectedNodeChanged, this._selectedDOMNode);
    },

    /**
     * @param {!Array.<!WebInspector.DOMNode>} nodes
     */
    _fireElementsTreeUpdated: function(nodes)
    {
        this.dispatchEventToListeners(WebInspector.ElementsTreeOutline.Events.ElementsTreeUpdated, nodes);
    },

    /**
     * @param {!WebInspector.DOMNode} node
     * @return {?WebInspector.ElementsTreeElement}
     */
    findTreeElement: function(node)
    {
        var treeElement = this._lookUpTreeElement(node);
        if (!treeElement && node.nodeType() === Node.TEXT_NODE) {
            // The text node might have been inlined if it was short, so try to find the parent element.
            treeElement = this._lookUpTreeElement(node.parentNode);
        }

        return /** @type {?WebInspector.ElementsTreeElement} */ (treeElement);
    },

    /**
     * @param {?WebInspector.DOMNode} node
     * @return {?TreeElement}
     */
    _lookUpTreeElement: function(node)
    {
        if (!node)
            return null;

        var cachedElement = node[this._treeElementSymbol];
        if (cachedElement)
            return cachedElement;

        // Walk up the parent pointers from the desired node
        var ancestors = [];
        for (var currentNode = node.parentNode; currentNode; currentNode = currentNode.parentNode) {
            ancestors.push(currentNode);
            if (currentNode[this._treeElementSymbol])  // stop climbing as soon as we hit
                break;
        }

        if (!currentNode)
            return null;

        // Walk down to populate each ancestor's children, to fill in the tree and the cache.
        for (var i = ancestors.length - 1; i >= 0; --i) {
            var treeElement = ancestors[i][this._treeElementSymbol];
            if (treeElement)
                treeElement.onpopulate();  // fill the cache with the children of treeElement
        }

        return node[this._treeElementSymbol];
    },

    /**
     * @param {!WebInspector.DOMNode} node
     * @return {?WebInspector.ElementsTreeElement}
     */
    createTreeElementFor: function(node)
    {
        var treeElement = this.findTreeElement(node);
        if (treeElement)
            return treeElement;
        if (!node.parentNode)
            return null;

        treeElement = this.createTreeElementFor(node.parentNode);
        return treeElement ? this._showChild(treeElement, node) : null;
    },

    set suppressRevealAndSelect(x)
    {
        if (this._suppressRevealAndSelect === x)
            return;
        this._suppressRevealAndSelect = x;
    },

    /**
     * @param {?WebInspector.DOMNode} node
     * @param {boolean} omitFocus
     */
    _revealAndSelectNode: function(node, omitFocus)
    {
        if (this._suppressRevealAndSelect)
            return;

        if (!this._includeRootDOMNode && node === this.rootDOMNode && this.rootDOMNode)
            node = this.rootDOMNode.firstChild;
        if (!node)
            return;
        var treeElement = this.createTreeElementFor(node);
        if (!treeElement)
            return;

        treeElement.revealAndSelect(omitFocus);
    },

    /**
     * @return {?TreeElement}
     */
    _treeElementFromEvent: function(event)
    {
        var scrollContainer = this.element.parentElement;

        // We choose this X coordinate based on the knowledge that our list
        // items extend at least to the right edge of the outer <ol> container.
        // In the no-word-wrap mode the outer <ol> may be wider than the tree container
        // (and partially hidden), in which case we are left to use only its right boundary.
        var x = scrollContainer.totalOffsetLeft() + scrollContainer.offsetWidth - 36;

        var y = event.pageY;

        // Our list items have 1-pixel cracks between them vertically. We avoid
        // the cracks by checking slightly above and slightly below the mouse
        // and seeing if we hit the same element each time.
        var elementUnderMouse = this.treeElementFromPoint(x, y);
        var elementAboveMouse = this.treeElementFromPoint(x, y - 2);
        var element;
        if (elementUnderMouse === elementAboveMouse)
            element = elementUnderMouse;
        else
            element = this.treeElementFromPoint(x, y + 2);

        return element;
    },

    /**
     * @param {!Element} element
     * @param {!Event} event
     * @return {!Element|!AnchorBox|undefined}
     */
    _getPopoverAnchor: function(element, event)
    {
        var anchor = element.enclosingNodeOrSelfWithClass("webkit-html-resource-link");
        if (!anchor || !anchor.href)
            return;

        return anchor;
    },

    /**
     * @param {!WebInspector.DOMNode} node
     * @param {function()} callback
     */
    _loadDimensionsForNode: function(node, callback)
    {
        if (!node.nodeName() || node.nodeName().toLowerCase() !== "img") {
            callback();
            return;
        }

        node.resolveToObject("", resolvedNode);

        function resolvedNode(object)
        {
            if (!object) {
                callback();
                return;
            }

            object.callFunctionJSON(features, undefined, callback);
            object.release();

            /**
             * @return {!{offsetWidth: number, offsetHeight: number, naturalWidth: number, naturalHeight: number, currentSrc: (string|undefined)}}
             * @suppressReceiverCheck
             * @this {!Element}
             */
            function features()
            {
                return { offsetWidth: this.offsetWidth, offsetHeight: this.offsetHeight, naturalWidth: this.naturalWidth, naturalHeight: this.naturalHeight, currentSrc: this.currentSrc };
            }
        }
    },

    /**
     * @param {!Element} anchor
     * @param {!WebInspector.Popover} popover
     */
    _showPopover: function(anchor, popover)
    {
        var listItem = anchor.enclosingNodeOrSelfWithNodeName("li");
        var node = /** @type {!WebInspector.ElementsTreeElement} */ (listItem.treeElement).node();
        this._loadDimensionsForNode(node, WebInspector.DOMPresentationUtils.buildImagePreviewContents.bind(WebInspector.DOMPresentationUtils, node.target(), anchor.href, true, showPopover));

        /**
         * @param {!Element=} contents
         */
        function showPopover(contents)
        {
            if (!contents)
                return;
            popover.setCanShrink(false);
            popover.showForAnchor(contents, anchor);
        }
    },

    _onmousedown: function(event)
    {
        var element = this._treeElementFromEvent(event);

        if (!element || element.isEventWithinDisclosureTriangle(event))
            return;

        element.select();
    },

    _onmousemove: function(event)
    {
        var element = this._treeElementFromEvent(event);
        if (element && this._previousHoveredElement === element)
            return;

        if (this._previousHoveredElement) {
            this._previousHoveredElement.hovered = false;
            delete this._previousHoveredElement;
        }

        if (element) {
            element.hovered = true;
            this._previousHoveredElement = element;
        }

        if (element instanceof WebInspector.ElementsTreeElement) {
            this._domModel.highlightDOMNodeWithConfig(element.node().id, { mode: "all", showInfo: !WebInspector.KeyboardShortcut.eventHasCtrlOrMeta(event) });
            return;
        }

        if (element instanceof WebInspector.ElementsTreeOutline.ShortcutTreeElement)
            this._domModel.highlightDOMNodeWithConfig(undefined, { mode: "all", showInfo: !WebInspector.KeyboardShortcut.eventHasCtrlOrMeta(event) }, element.backendNodeId());
    },

    _onmouseleave: function(event)
    {
        if (this._previousHoveredElement) {
            this._previousHoveredElement.hovered = false;
            delete this._previousHoveredElement;
        }

        WebInspector.DOMModel.hideDOMNodeHighlight();
    },

    _ondragstart: function(event)
    {
        if (!event.target.isComponentSelectionCollapsed())
            return false;
        if (event.target.nodeName === "A")
            return false;

        var treeElement = this._treeElementFromEvent(event);
        if (!this._isValidDragSourceOrTarget(treeElement))
            return false;

        if (treeElement.node().nodeName() === "BODY" || treeElement.node().nodeName() === "HEAD")
            return false;

        event.dataTransfer.setData("text/plain", treeElement.listItemElement.textContent.replace(/\u200b/g, ""));
        event.dataTransfer.effectAllowed = "copyMove";
        this._treeElementBeingDragged = treeElement;

        WebInspector.DOMModel.hideDOMNodeHighlight();

        return true;
    },

    _ondragover: function(event)
    {
        if (!this._treeElementBeingDragged)
            return false;

        var treeElement = this._treeElementFromEvent(event);
        if (!this._isValidDragSourceOrTarget(treeElement))
            return false;

        var node = treeElement.node();
        while (node) {
            if (node === this._treeElementBeingDragged._node)
                return false;
            node = node.parentNode;
        }

        treeElement.updateSelection();
        treeElement.listItemElement.classList.add("elements-drag-over");
        this._dragOverTreeElement = treeElement;
        event.preventDefault();
        event.dataTransfer.dropEffect = 'move';
        return false;
    },

    _ondragleave: function(event)
    {
        this._clearDragOverTreeElementMarker();
        event.preventDefault();
        return false;
    },

    /**
     * @param {?TreeElement} treeElement
     * @return {boolean}
     */
    _isValidDragSourceOrTarget: function(treeElement)
    {
        if (!treeElement)
            return false;

        if (!(treeElement instanceof WebInspector.ElementsTreeElement))
            return false;
        var elementsTreeElement = /** @type {!WebInspector.ElementsTreeElement} */ (treeElement);

        var node = elementsTreeElement.node();
        if (!node.parentNode || node.parentNode.nodeType() !== Node.ELEMENT_NODE)
            return false;

        return true;
    },

    _ondrop: function(event)
    {
        event.preventDefault();
        var treeElement = this._treeElementFromEvent(event);
        if (treeElement)
            this._doMove(treeElement);
    },

    /**
     * @param {!TreeElement} treeElement
     */
    _doMove: function(treeElement)
    {
        if (!this._treeElementBeingDragged)
            return;

        var parentNode;
        var anchorNode;

        if (treeElement.isClosingTag()) {
            // Drop onto closing tag -> insert as last child.
            parentNode = treeElement.node();
        } else {
            var dragTargetNode = treeElement.node();
            parentNode = dragTargetNode.parentNode;
            anchorNode = dragTargetNode;
        }

        var wasExpanded = this._treeElementBeingDragged.expanded;
        this._treeElementBeingDragged._node.moveTo(parentNode, anchorNode, this.selectNodeAfterEdit.bind(this, wasExpanded));

        delete this._treeElementBeingDragged;
    },

    _ondragend: function(event)
    {
        event.preventDefault();
        this._clearDragOverTreeElementMarker();
        delete this._treeElementBeingDragged;
    },

    _clearDragOverTreeElementMarker: function()
    {
        if (this._dragOverTreeElement) {
            this._dragOverTreeElement.updateSelection();
            this._dragOverTreeElement.listItemElement.classList.remove("elements-drag-over");
            delete this._dragOverTreeElement;
        }
    },

    _contextMenuEventFired: function(event)
    {
        var treeElement = this._treeElementFromEvent(event);
        if (!(treeElement instanceof WebInspector.ElementsTreeElement) || WebInspector.isEditing())
            return;

        var contextMenu = new WebInspector.ContextMenu(event);
        var isPseudoElement = !!treeElement.node().pseudoType();
        var isTag = treeElement.node().nodeType() === Node.ELEMENT_NODE && !isPseudoElement;
        var textNode = event.target.enclosingNodeOrSelfWithClass("webkit-html-text-node");
        if (textNode && textNode.classList.contains("bogus"))
            textNode = null;
        var commentNode = event.target.enclosingNodeOrSelfWithClass("webkit-html-comment");
        contextMenu.appendApplicableItems(event.target);
        if (textNode) {
            contextMenu.appendSeparator();
            treeElement.populateTextContextMenu(contextMenu, textNode);
        } else if (isTag) {
            contextMenu.appendSeparator();
            treeElement.populateTagContextMenu(contextMenu, event);
        } else if (commentNode) {
            contextMenu.appendSeparator();
            treeElement.populateNodeContextMenu(contextMenu);
        } else if (isPseudoElement) {
            treeElement.populateScrollIntoView(contextMenu);
        }

        contextMenu.appendApplicableItems(treeElement.node());
        contextMenu.show();
    },

    runPendingUpdates: function()
    {
        this._updateModifiedNodes();
    },

    handleShortcut: function(event)
    {
        var node = this.selectedDOMNode();
        if (!node)
            return;
        var treeElement = node[this._treeElementSymbol];
        if (!treeElement)
            return;

        if (WebInspector.KeyboardShortcut.eventHasCtrlOrMeta(event) && node.parentNode) {
            if (event.keyIdentifier === "Up" && node.previousSibling) {
                node.moveTo(node.parentNode, node.previousSibling, this.selectNodeAfterEdit.bind(this, treeElement.expanded));
                event.handled = true;
                return;
            }
            if (event.keyIdentifier === "Down" && node.nextSibling) {
                node.moveTo(node.parentNode, node.nextSibling.nextSibling, this.selectNodeAfterEdit.bind(this, treeElement.expanded));
                event.handled = true;
                return;
            }
        }
    },

    /**
     * @param {!WebInspector.DOMNode} node
     * @param {boolean=} startEditing
     * @param {function()=} callback
     */
    toggleEditAsHTML: function(node, startEditing, callback)
    {
        var treeElement = node[this._treeElementSymbol];
        if (!treeElement || !treeElement.hasEditableNode())
            return;

        if (node.pseudoType())
            return;

        var parentNode = node.parentNode;
        var index = node.index;
        var wasExpanded = treeElement.expanded;

        treeElement.toggleEditAsHTML(editingFinished.bind(this), startEditing);

        /**
         * @this {WebInspector.ElementsTreeOutline}
         * @param {boolean} success
         */
        function editingFinished(success)
        {
            if (callback)
                callback();
            if (!success)
                return;

            // Select it and expand if necessary. We force tree update so that it processes dom events and is up to date.
            this.runPendingUpdates();

            var newNode = parentNode ? parentNode.children()[index] || parentNode : null;
            if (!newNode)
                return;

            this.selectDOMNode(newNode, true);

            if (wasExpanded) {
                var newTreeItem = this.findTreeElement(newNode);
                if (newTreeItem)
                    newTreeItem.expand();
            }
        }
    },

    /**
     * @param {boolean} wasExpanded
     * @param {?Protocol.Error} error
     * @param {!DOMAgent.NodeId=} nodeId
     * @return {?WebInspector.ElementsTreeElement} nodeId
     */
    selectNodeAfterEdit: function(wasExpanded, error, nodeId)
    {
        if (error)
            return null;

        // Select it and expand if necessary. We force tree update so that it processes dom events and is up to date.
        this.runPendingUpdates();

        var newNode = nodeId ? this._domModel.nodeForId(nodeId) : null;
        if (!newNode)
            return null;

        this.selectDOMNode(newNode, true);

        var newTreeItem = this.findTreeElement(newNode);
        if (wasExpanded) {
            if (newTreeItem)
                newTreeItem.expand();
        }
        return newTreeItem;
    },

    /**
     * Runs a script on the node's remote object that toggles a class name on
     * the node and injects a stylesheet into the head of the node's document
     * containing a rule to set "visibility: hidden" on the class and all it's
     * ancestors.
     *
     * @param {!WebInspector.DOMNode} node
     * @param {function(?WebInspector.RemoteObject, boolean=)=} userCallback
     */
    toggleHideElement: function(node, userCallback)
    {
        var pseudoType = node.pseudoType();
        var effectiveNode = pseudoType ? node.parentNode : node;
        if (!effectiveNode)
            return;

        var hidden = node.marker("hidden-marker");

        function resolvedNode(object)
        {
            if (!object)
                return;

            /**
             * @param {?string} pseudoType
             * @param {boolean} hidden
             * @suppressGlobalPropertiesCheck
             * @suppressReceiverCheck
             * @this {!Element}
             */
            function toggleClassAndInjectStyleRule(pseudoType, hidden)
            {
                const classNamePrefix = "__web-inspector-hide";
                const classNameSuffix = "-shortcut__";
                const styleTagId = "__web-inspector-hide-shortcut-style__";
                var selectors = [];
                selectors.push(".__web-inspector-hide-shortcut__");
                selectors.push(".__web-inspector-hide-shortcut__ *");
                selectors.push(".__web-inspector-hidebefore-shortcut__::before");
                selectors.push(".__web-inspector-hideafter-shortcut__::after");
                var selector = selectors.join(", ");
                var ruleBody = "    visibility: hidden !important;";
                var rule = "\n" + selector + "\n{\n" + ruleBody + "\n}\n";
                var className = classNamePrefix + (pseudoType || "") + classNameSuffix;
                this.classList.toggle(className, hidden);

                var localRoot = this;
                while (localRoot.parentNode)
                    localRoot = localRoot.parentNode;
                if (localRoot.nodeType === Node.DOCUMENT_NODE)
                    localRoot = document.head;

                var style = localRoot.querySelector("style#" + styleTagId);
                if (style)
                    return;

                style = document.createElement("style");
                style.id = styleTagId;
                style.type = "text/css";
                style.textContent = rule;

                localRoot.appendChild(style);
            }

            object.callFunction(toggleClassAndInjectStyleRule, [{ value: pseudoType }, { value: !hidden}], userCallback);
            object.release();
            node.setMarker("hidden-marker", hidden ? null : true);
        }

        effectiveNode.resolveToObject("", resolvedNode);
    },

    /**
     * @param {!WebInspector.DOMNode} node
     * @return {boolean}
     */
    isToggledToHidden: function(node)
    {
        return !!node.marker("hidden-marker");
    },

    _reset: function()
    {
        this.rootDOMNode = null;
        this.selectDOMNode(null, false);
        this._popoverHelper.hidePopover();
        delete this._clipboardNodeData;
        WebInspector.DOMModel.hideDOMNodeHighlight();
        this._updateRecords.clear();
    },

    wireToDOMModel: function()
    {
        this._domModel.addEventListener(WebInspector.DOMModel.Events.NodeInserted, this._nodeInserted, this);
        this._domModel.addEventListener(WebInspector.DOMModel.Events.NodeRemoved, this._nodeRemoved, this);
        this._domModel.addEventListener(WebInspector.DOMModel.Events.AttrModified, this._attributeModified, this);
        this._domModel.addEventListener(WebInspector.DOMModel.Events.AttrRemoved, this._attributeRemoved, this);
        this._domModel.addEventListener(WebInspector.DOMModel.Events.CharacterDataModified, this._characterDataModified, this);
        this._domModel.addEventListener(WebInspector.DOMModel.Events.DocumentUpdated, this._documentUpdated, this);
        this._domModel.addEventListener(WebInspector.DOMModel.Events.ChildNodeCountUpdated, this._childNodeCountUpdated, this);
        this._domModel.addEventListener(WebInspector.DOMModel.Events.DistributedNodesChanged, this._distributedNodesChanged, this);
    },

    unwireFromDOMModel: function()
    {
        this._domModel.removeEventListener(WebInspector.DOMModel.Events.NodeInserted, this._nodeInserted, this);
        this._domModel.removeEventListener(WebInspector.DOMModel.Events.NodeRemoved, this._nodeRemoved, this);
        this._domModel.removeEventListener(WebInspector.DOMModel.Events.AttrModified, this._attributeModified, this);
        this._domModel.removeEventListener(WebInspector.DOMModel.Events.AttrRemoved, this._attributeRemoved, this);
        this._domModel.removeEventListener(WebInspector.DOMModel.Events.CharacterDataModified, this._characterDataModified, this);
        this._domModel.removeEventListener(WebInspector.DOMModel.Events.DocumentUpdated, this._documentUpdated, this);
        this._domModel.removeEventListener(WebInspector.DOMModel.Events.ChildNodeCountUpdated, this._childNodeCountUpdated, this);
        this._domModel.removeEventListener(WebInspector.DOMModel.Events.DistributedNodesChanged, this._distributedNodesChanged, this);
    },

    /**
     * @param {!WebInspector.DOMNode} node
     * @return {!WebInspector.ElementsTreeOutline.UpdateRecord}
     */
    _addUpdateRecord: function(node)
    {
        var record = this._updateRecords.get(node);
        if (!record) {
            record = new WebInspector.ElementsTreeOutline.UpdateRecord();
            this._updateRecords.set(node, record);
        }
        return record;
    },

    /**
     * @param {!WebInspector.DOMNode} node
     * @return {?WebInspector.ElementsTreeOutline.UpdateRecord}
     */
    _updateRecordForHighlight: function(node)
    {
        if (!this._visible)
            return null;
        return this._updateRecords.get(node) || null;
    },

    /**
     * @param {!WebInspector.Event} event
     */
    _documentUpdated: function(event)
    {
        var inspectedRootDocument = event.data;

        this._reset();

        if (!inspectedRootDocument)
            return;

        this.rootDOMNode = inspectedRootDocument;
    },

    /**
     * @param {!WebInspector.Event} event
     */
    _attributeModified: function(event)
    {
        var node = /** @type {!WebInspector.DOMNode} */ (event.data.node);
        this._addUpdateRecord(node).attributeModified(event.data.name);
        this._updateModifiedNodesSoon();
    },

    /**
     * @param {!WebInspector.Event} event
     */
    _attributeRemoved: function(event)
    {
        var node = /** @type {!WebInspector.DOMNode} */ (event.data.node);
        this._addUpdateRecord(node).attributeRemoved(event.data.name);
        this._updateModifiedNodesSoon();
    },

    /**
     * @param {!WebInspector.Event} event
     */
    _characterDataModified: function(event)
    {
        var node = /** @type {!WebInspector.DOMNode} */ (event.data);
        this._addUpdateRecord(node).charDataModified();
        // Text could be large and force us to render itself as the child in the tree outline.
        if (node.parentNode && node.parentNode.firstChild === node.parentNode.lastChild)
            this._addUpdateRecord(node.parentNode).childrenModified();
        this._updateModifiedNodesSoon();
    },

    /**
     * @param {!WebInspector.Event} event
     */
    _nodeInserted: function(event)
    {
        var node = /** @type {!WebInspector.DOMNode} */ (event.data);
        this._addUpdateRecord(/** @type {!WebInspector.DOMNode} */ (node.parentNode)).nodeInserted(node);
        this._updateModifiedNodesSoon();
    },

    /**
     * @param {!WebInspector.Event} event
     */
    _nodeRemoved: function(event)
    {
        var node = /** @type {!WebInspector.DOMNode} */ (event.data.node);
        var parentNode = /** @type {!WebInspector.DOMNode} */ (event.data.parent);
        this.resetClipboardIfNeeded(node);
        this._addUpdateRecord(parentNode).nodeRemoved(node);
        this._updateModifiedNodesSoon();
    },

    /**
     * @param {!WebInspector.Event} event
     */
    _childNodeCountUpdated: function(event)
    {
        var node = /** @type {!WebInspector.DOMNode} */ (event.data);
        this._addUpdateRecord(node).childrenModified();
        this._updateModifiedNodesSoon();
    },

    /**
     * @param {!WebInspector.Event} event
     */
    _distributedNodesChanged: function(event)
    {
        var node = /** @type {!WebInspector.DOMNode} */ (event.data);
        this._addUpdateRecord(node).childrenModified();
        this._updateModifiedNodesSoon();
    },

    _updateModifiedNodesSoon: function()
    {
        if (!this._updateRecords.size)
            return;
        if (this._updateModifiedNodesTimeout)
            return;
        this._updateModifiedNodesTimeout = setTimeout(this._updateModifiedNodes.bind(this), 50);
    },

    _updateModifiedNodes: function()
    {
        if (this._updateModifiedNodesTimeout) {
            clearTimeout(this._updateModifiedNodesTimeout);
            delete this._updateModifiedNodesTimeout;
        }

        var updatedNodes = this._updateRecords.keysArray();
        var hidePanelWhileUpdating = updatedNodes.length > 10;
        if (hidePanelWhileUpdating) {
            var treeOutlineContainerElement = this.element.parentNode;
            var originalScrollTop = treeOutlineContainerElement ? treeOutlineContainerElement.scrollTop : 0;
            this._element.classList.add("hidden");
        }

        if (this._rootDOMNode && this._updateRecords.get(this._rootDOMNode) && this._updateRecords.get(this._rootDOMNode).hasChangedChildren()) {
            // Document's children have changed, perform total update.
            this.update();
        } else {
            for (var node of this._updateRecords.keys()) {
                if (this._updateRecords.get(node).hasChangedChildren())
                    this._updateModifiedParentNode(node);
                else
                    this._updateModifiedNode(node);
            }
        }

        if (hidePanelWhileUpdating) {
            this._element.classList.remove("hidden");
            if (originalScrollTop)
                treeOutlineContainerElement.scrollTop = originalScrollTop;
            this.updateSelection();
        }

        this._updateRecords.clear();
        this._fireElementsTreeUpdated(updatedNodes);
    },

    _updateModifiedNode: function(node)
    {
        var treeElement = this.findTreeElement(node);
        if (treeElement)
            treeElement.updateTitle(this._updateRecordForHighlight(node));
    },

    _updateModifiedParentNode: function(node)
    {
        var parentTreeElement = this.findTreeElement(node);
        if (parentTreeElement) {
            parentTreeElement.setExpandable(this._hasVisibleChildren(node));
            parentTreeElement.updateTitle(this._updateRecordForHighlight(node));
            if (parentTreeElement.populated)
                this._updateChildren(parentTreeElement);
        }
    },

    /**
     * @param {!WebInspector.ElementsTreeElement} treeElement
     */
    populateTreeElement: function(treeElement)
    {
        if (treeElement.childCount() || !treeElement.isExpandable())
            return;

        this._updateModifiedParentNode(treeElement.node());
    },

    /**
     * @param {!WebInspector.DOMNode} node
     * @param {boolean=} closingTag
     * @return {!WebInspector.ElementsTreeElement}
     */
    _createElementTreeElement: function(node, closingTag)
    {
        var treeElement = new WebInspector.ElementsTreeElement(node, closingTag);
        treeElement.setExpandable(!closingTag && this._hasVisibleChildren(node));
        treeElement.selectable = this._selectEnabled;
        return treeElement;
    },

    /**
     * @param {!WebInspector.ElementsTreeElement} treeElement
     * @param {!WebInspector.DOMNode} child
     * @return {?WebInspector.ElementsTreeElement}
     */
    _showChild: function(treeElement, child)
    {
        if (treeElement.isClosingTag())
            return null;

        var index = this._visibleChildren(treeElement.node()).indexOf(child);
        if (index === -1)
            return null;

        if (index >= treeElement.expandedChildrenLimit())
            this.setExpandedChildrenLimit(treeElement, index + 1);
        return /** @type {!WebInspector.ElementsTreeElement} */ (treeElement.childAt(index));
    },

    /**
     * @param {!WebInspector.DOMNode} node
     * @return {!Array.<!WebInspector.DOMNode>} visibleChildren
     */
    _visibleChildren: function(node)
    {
        var visibleChildren = WebInspector.ElementsTreeElement.visibleShadowRoots(node);

        if (node.importedDocument())
            visibleChildren.push(node.importedDocument());

        if (node.templateContent())
            visibleChildren.push(node.templateContent());

        var beforePseudoElement = node.beforePseudoElement();
        if (beforePseudoElement)
            visibleChildren.push(beforePseudoElement);

        if (node.childNodeCount())
            visibleChildren = visibleChildren.concat(node.children());

        var afterPseudoElement = node.afterPseudoElement();
        if (afterPseudoElement)
            visibleChildren.push(afterPseudoElement);

        return visibleChildren;
    },

    /**
     * @param {!WebInspector.DOMNode} node
     * @return {boolean}
     */
    _hasVisibleChildren: function(node)
    {
        if (node.importedDocument())
            return true;
        if (node.templateContent())
            return true;
        if (WebInspector.ElementsTreeElement.visibleShadowRoots(node).length)
            return true;
        if (node.hasPseudoElements())
            return true;
        if (node.isInsertionPoint())
            return true;
        return !!node.childNodeCount() && !WebInspector.ElementsTreeElement.canShowInlineText(node);
    },

    /**
     * @param {!WebInspector.ElementsTreeElement} treeElement
     */
    _createExpandAllButtonTreeElement: function(treeElement)
    {
        var button = createTextButton("", handleLoadAllChildren.bind(this));
        button.value = "";
        var expandAllButtonElement = new TreeElement(button);
        expandAllButtonElement.selectable = false;
        expandAllButtonElement.expandAllButton = true;
        expandAllButtonElement.button = button;
        return expandAllButtonElement;

        /**
         * @this {WebInspector.ElementsTreeOutline}
         * @param {!Event} event
         */
        function handleLoadAllChildren(event)
        {
            var visibleChildCount = this._visibleChildren(treeElement.node()).length;
            this.setExpandedChildrenLimit(treeElement, Math.max(visibleChildCount, treeElement.expandedChildrenLimit() + WebInspector.ElementsTreeElement.InitialChildrenLimit));
            event.consume();
        }
    },

    /**
     * @param {!WebInspector.ElementsTreeElement} treeElement
     * @param {number} expandedChildrenLimit
     */
    setExpandedChildrenLimit: function(treeElement, expandedChildrenLimit)
    {
        if (treeElement.expandedChildrenLimit() === expandedChildrenLimit)
            return;

        treeElement.setExpandedChildrenLimit(expandedChildrenLimit);
        if (treeElement.treeOutline && !this._treeElementsBeingUpdated.has(treeElement))
            this._updateModifiedParentNode(treeElement.node());
    },

    /**
     * @param {!WebInspector.ElementsTreeElement} treeElement
     */
    _updateChildren: function(treeElement)
    {
        if (!treeElement.isExpandable()) {
            var selectedTreeElement = treeElement.treeOutline.selectedTreeElement;
            if (selectedTreeElement && selectedTreeElement.hasAncestor(treeElement))
                treeElement.select(true);
            treeElement.removeChildren();
            return;
        }

        console.assert(!treeElement.isClosingTag());

        treeElement.node().getChildNodes(childNodesLoaded.bind(this));

       /**
         * @param {?Array.<!WebInspector.DOMNode>} children
         * @this {WebInspector.ElementsTreeOutline}
         */
        function childNodesLoaded(children)
        {
            // FIXME: sort this out, it should not happen.
            if (!children)
                return;
            this._innerUpdateChildren(treeElement);
        }
    },

    /**
     * @param {!WebInspector.ElementsTreeElement} treeElement
     * @param {!WebInspector.DOMNode} child
     * @param {number} index
     * @param {boolean=} closingTag
     * @return {!WebInspector.ElementsTreeElement}
     */
    insertChildElement: function(treeElement, child, index, closingTag)
    {
        var newElement = this._createElementTreeElement(child, closingTag);
        treeElement.insertChild(newElement, index);
        return newElement;
    },

    /**
     * @param {!WebInspector.ElementsTreeElement} treeElement
     * @param {!WebInspector.ElementsTreeElement} child
     * @param {number} targetIndex
     */
    _moveChild: function(treeElement, child, targetIndex)
    {
        if (treeElement.indexOfChild(child) === targetIndex)
            return;
        var wasSelected = child.selected;
        if (child.parent)
            child.parent.removeChild(child);
        treeElement.insertChild(child, targetIndex);
        if (wasSelected)
            child.select();
    },

    /**
     * @param {!WebInspector.ElementsTreeElement} treeElement
     */
    _innerUpdateChildren: function(treeElement)
    {
        if (this._treeElementsBeingUpdated.has(treeElement))
            return;

        this._treeElementsBeingUpdated.add(treeElement);

        var node = treeElement.node();
        var visibleChildren = this._visibleChildren(node);
        var visibleChildrenSet = new Set(visibleChildren);

        // Remove any tree elements that no longer have this node as their parent and save
        // all existing elements that could be reused. This also removes closing tag element.
        var existingTreeElements = new Map();
        for (var i = treeElement.childCount() - 1; i >= 0; --i) {
            var existingTreeElement = treeElement.childAt(i);
            if (!(existingTreeElement instanceof WebInspector.ElementsTreeElement)) {
                // Remove expand all button and shadow host toolbar.
                treeElement.removeChildAtIndex(i);
                continue;
            }
            var elementsTreeElement = /** @type {!WebInspector.ElementsTreeElement} */ (existingTreeElement);
            var existingNode = elementsTreeElement.node();

            if (visibleChildrenSet.has(existingNode)) {
                existingTreeElements.set(existingNode, existingTreeElement);
                continue;
            }

            treeElement.removeChildAtIndex(i);
        }

        for (var i = 0; i < visibleChildren.length && i < treeElement.expandedChildrenLimit(); ++i) {
            var child = visibleChildren[i];
            var existingTreeElement = existingTreeElements.get(child) || this.findTreeElement(child);
            if (existingTreeElement && existingTreeElement !== treeElement) {
                // If an existing element was found, just move it.
                this._moveChild(treeElement, existingTreeElement, i);
            } else {
                // No existing element found, insert a new element.
                var newElement = this.insertChildElement(treeElement, child, i);
                if (this._updateRecordForHighlight(node) && treeElement.expanded)
                    WebInspector.ElementsTreeElement.animateOnDOMUpdate(newElement);
                // If a node was inserted in the middle of existing list dynamically we might need to increase the limit.
                if (treeElement.childCount() > treeElement.expandedChildrenLimit())
                    this.setExpandedChildrenLimit(treeElement, treeElement.expandedChildrenLimit() + 1);
            }
        }

        // Update expand all button.
        var expandedChildCount = treeElement.childCount();
        if (visibleChildren.length > expandedChildCount) {
            var targetButtonIndex = expandedChildCount;
            if (!treeElement.expandAllButtonElement)
                treeElement.expandAllButtonElement = this._createExpandAllButtonTreeElement(treeElement);
            treeElement.insertChild(treeElement.expandAllButtonElement, targetButtonIndex);
            treeElement.expandAllButtonElement.button.textContent = WebInspector.UIString("Show All Nodes (%d More)", visibleChildren.length - expandedChildCount);
        } else if (treeElement.expandAllButtonElement) {
            delete treeElement.expandAllButtonElement;
        }

        // Insert shortcuts to distrubuted children.
        if (node.isInsertionPoint()) {
            for (var distributedNode of node.distributedNodes())
                treeElement.appendChild(new WebInspector.ElementsTreeOutline.ShortcutTreeElement(distributedNode));
        }

        // Insert close tag.
        if (node.nodeType() === Node.ELEMENT_NODE && treeElement.isExpandable())
            this.insertChildElement(treeElement, node, treeElement.childCount(), true);

        this._treeElementsBeingUpdated.delete(treeElement);
    },

    /**
     * @param {!WebInspector.Event} event
     */
    _markersChanged: function(event)
    {
        var node = /** @type {!WebInspector.DOMNode} */ (event.data);
        var treeElement = node[this._treeElementSymbol];
        if (treeElement)
            treeElement.updateDecorations();
    },

    __proto__: TreeOutline.prototype
}

/**
 * @constructor
 */
WebInspector.ElementsTreeOutline.UpdateRecord = function()
{
}

WebInspector.ElementsTreeOutline.UpdateRecord.prototype = {
    /**
     * @param {string} attrName
     */
    attributeModified: function(attrName)
    {
        if (this._removedAttributes && this._removedAttributes.has(attrName))
            this._removedAttributes.delete(attrName);
        if (!this._modifiedAttributes)
            this._modifiedAttributes = /** @type {!Set.<string>} */ (new Set());
        this._modifiedAttributes.add(attrName);
    },

    /**
     * @param {string} attrName
     */
    attributeRemoved: function(attrName)
    {
        if (this._modifiedAttributes && this._modifiedAttributes.has(attrName))
            this._modifiedAttributes.delete(attrName);
        if (!this._removedAttributes)
            this._removedAttributes = /** @type {!Set.<string>} */ (new Set());
        this._removedAttributes.add(attrName);
    },

    /**
     * @param {!WebInspector.DOMNode} node
     */
    nodeInserted: function(node)
    {
        this._hasChangedChildren = true;
    },

    nodeRemoved: function(node)
    {
        this._hasChangedChildren = true;
        this._hasRemovedChildren = true;
    },

    charDataModified: function()
    {
        this._charDataModified = true;
    },

    childrenModified: function()
    {
        this._hasChangedChildren = true;
    },

    /**
     * @param {string} attributeName
     * @return {boolean}
     */
    isAttributeModified: function(attributeName)
    {
        return this._modifiedAttributes && this._modifiedAttributes.has(attributeName);
    },

    /**
     * @return {boolean}
     */
    hasRemovedAttributes: function()
    {
        return !!this._removedAttributes && !!this._removedAttributes.size;
    },

    /**
     * @return {boolean}
     */
    isCharDataModified: function()
    {
        return !!this._charDataModified;
    },

    /**
     * @return {boolean}
     */
    hasChangedChildren: function()
    {
        return !!this._hasChangedChildren;
    },

    /**
     * @return {boolean}
     */
    hasRemovedChildren: function()
    {
        return !!this._hasRemovedChildren;
    }
}

/**
 * @constructor
 * @implements {WebInspector.Renderer}
 */
WebInspector.ElementsTreeOutline.Renderer = function()
{
}

WebInspector.ElementsTreeOutline.Renderer.prototype = {
    /**
     * @override
     * @param {!Object} object
     * @return {!Promise.<!Element>}
     */
    render: function(object)
    {
        return new Promise(renderPromise);

        /**
         * @param {function(!Element)} resolve
         * @param {function(!Error)} reject
         */
        function renderPromise(resolve, reject)
        {
            if (object instanceof WebInspector.DOMNode) {
                onNodeResolved(/** @type {!WebInspector.DOMNode} */ (object));
            } else if (object instanceof WebInspector.DeferredDOMNode) {
                (/** @type {!WebInspector.DeferredDOMNode} */ (object)).resolve(onNodeResolved);
            } else if (object instanceof WebInspector.RemoteObject) {
                var domModel = WebInspector.DOMModel.fromTarget((/** @type {!WebInspector.RemoteObject} */ (object)).target());
                if (domModel)
                    domModel.pushObjectAsNodeToFrontend(object, onNodeResolved);
                else
                    reject(new Error("No dom model for given JS object target found."));
            } else {
                reject(new Error("Can't reveal not a node."));
            }

            /**
             * @param {?WebInspector.DOMNode} node
             */
            function onNodeResolved(node)
            {
                if (!node) {
                    reject(new Error("Could not resolve node."));
                    return;
                }
                var treeOutline = new WebInspector.ElementsTreeOutline(node.domModel(), false, false);
                treeOutline.rootDOMNode = node;
                if (!treeOutline.firstChild().isExpandable())
                    treeOutline._element.classList.add("single-node");
                treeOutline.setVisible(true);
                treeOutline.element.treeElementForTest = treeOutline.firstChild();
                resolve(treeOutline.element);
            }
        }
    }
}

/**
 * @constructor
 * @extends {TreeElement}
 * @param {!WebInspector.DOMNodeShortcut} nodeShortcut
 */
WebInspector.ElementsTreeOutline.ShortcutTreeElement = function(nodeShortcut)
{
    TreeElement.call(this, "");
    this.listItemElement.createChild("div", "selection");
    var title = this.listItemElement.createChild("span", "elements-tree-shortcut-title");
    var text = nodeShortcut.nodeName.toLowerCase();
    if (nodeShortcut.nodeType === Node.ELEMENT_NODE)
        text = "<" + text + ">";
    title.textContent = "\u21AA " + text;

    var link = WebInspector.DOMPresentationUtils.linkifyDeferredNodeReference(nodeShortcut.deferredNode);
    this.listItemElement.createTextChild(" ");
    link.classList.add("elements-tree-shortcut-link");
    link.textContent = WebInspector.UIString("reveal");
    this.listItemElement.appendChild(link);
    this._nodeShortcut = nodeShortcut;
}

WebInspector.ElementsTreeOutline.ShortcutTreeElement.prototype = {
    /**
     * @return {boolean}
     */
    get hovered()
    {
        return this._hovered;
    },

    set hovered(x)
    {
        if (this._hovered === x)
            return;
        this._hovered = x;
        this.listItemElement.classList.toggle("hovered", x);
    },

    updateSelection: function()
    {
    },

    /**
     * @return {number}
     */
    backendNodeId: function()
    {
        return this._nodeShortcut.deferredNode.backendNodeId();
    },

    /**
     * @override
     * @param {boolean=} selectedByUser
     * @return {boolean}
     */
    onselect: function(selectedByUser)
    {
        if (!selectedByUser)
            return true;
        this._nodeShortcut.deferredNode.highlight();
        this._nodeShortcut.deferredNode.resolve(resolved.bind(this));
        /**
         * @param {?WebInspector.DOMNode} node
         * @this {WebInspector.ElementsTreeOutline.ShortcutTreeElement}
         */
        function resolved(node)
        {
            if (node) {
                this.treeOutline._selectedDOMNode = node;
                this.treeOutline._selectedNodeChanged();
            }
        }
        return true;
    },

    __proto__: TreeElement.prototype
}
