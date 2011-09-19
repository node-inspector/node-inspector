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

WebInspector.ElementsTreeOutline = function() {
    this.element = document.createElement("ol");
    this.element.addEventListener("mousedown", this._onmousedown.bind(this), false);
    this.element.addEventListener("mousemove", this._onmousemove.bind(this), false);
    this.element.addEventListener("mouseout", this._onmouseout.bind(this), false);
    this.element.addEventListener("dragstart", this._ondragstart.bind(this), false);
    this.element.addEventListener("dragover", this._ondragover.bind(this), false);
    this.element.addEventListener("dragleave", this._ondragleave.bind(this), false);
    this.element.addEventListener("drop", this._ondrop.bind(this), false);
    this.element.addEventListener("dragend", this._ondragend.bind(this), false);

    TreeOutline.call(this, this.element);

    this.includeRootDOMNode = true;
    this.selectEnabled = false;
    this.showInElementsPanelEnabled = false;
    this.rootDOMNode = null;
    this._selectDOMNode = null;
    this.element.addEventListener("contextmenu", this._contextMenuEventFired.bind(this), true);
}

WebInspector.ElementsTreeOutline.prototype = {
    get rootDOMNode()
    {
        return this._rootDOMNode;
    },

    set rootDOMNode(x)
    {
        if (this._rootDOMNode === x)
            return;

        this._rootDOMNode = x;

        this._isXMLMimeType = x && !!x.xmlVersion;

        this.update();
    },

    get isXMLMimeType()
    {
        return this._isXMLMimeType;
    },

    nodeNameToCorrectCase: function(nodeName)
    {
        return this.isXMLMimeType ? nodeName : nodeName.toLowerCase();
    },

    selectedDOMNode: function()
    {
        return this._selectedDOMNode;
    },

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
        // avoid calling selectedNodeChanged() twice, first check if _selectedDOMNode is the same
        // node as the one passed in.
        if (this._selectedDOMNode === node)
            this.selectedNodeChanged();
    },

    get editing()
    {
        return this._editing;
    },

    update: function()
    {
        var selectedNode = this.selectedTreeElement ? this.selectedTreeElement.representedObject : null;

        this.removeChildren();

        if (!this.rootDOMNode)
            return;

        var treeElement;
        if (this.includeRootDOMNode) {
            treeElement = new WebInspector.ElementsTreeElement(this.rootDOMNode);
            treeElement.selectable = this.selectEnabled;
            this.appendChild(treeElement);
        } else {
            // FIXME: this could use findTreeElement to reuse a tree element if it already exists
            var node = this.rootDOMNode.firstChild;
            while (node) {
                treeElement = new WebInspector.ElementsTreeElement(node);
                treeElement.selectable = this.selectEnabled;
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
        var element = this.treeOutline.selectedTreeElement;
        element.updateSelection();
    },

    selectedNodeChanged: function(forceUpdate) {},

    findTreeElement: function(node)
    {
        function isAncestorNode(ancestor, node)
        {
            return ancestor.isAncestor(node);
        }
        var treeElement = TreeOutline.prototype.findTreeElement.call(this, node, isAncestorNode, parentNode);
        if (!treeElement && node.nodeType() === Node.TEXT_NODE) {
            // The text node might have been inlined if it was short, so try to find the parent element.
            treeElement = TreeOutline.prototype.findTreeElement.call(this, node.parentNode, isAncestorNode, parentNode);
        }

        return treeElement;
    },

    createTreeElementFor: function(node)
    {
        var treeElement = this.findTreeElement(node);
        if (treeElement)
            return treeElement;
        if (!node.parentNode)
            return null;

        var treeElement = this.createTreeElementFor(node.parentNode);
        if (treeElement && treeElement.showChild(node.index))
            return treeElement.children[node.index];

        return null;
    },

    set suppressRevealAndSelect(x)
    {
        if (this._suppressRevealAndSelect === x)
            return;
        this._suppressRevealAndSelect = x;
    },

    _revealAndSelectNode: function(node, omitFocus)
    {
        if (!node || this._suppressRevealAndSelect)
            return;

        var treeElement = this.createTreeElementFor(node);
        if (!treeElement)
            return;

        treeElement.revealAndSelect(omitFocus);
    },

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

            // Lazily compute tag-specific tooltips.
            if (element.representedObject && !element.tooltip)
                element._createTooltipForNode();
        }

        WebInspector.highlightDOMNode(element ? element.representedObject.id : 0);
    },

    _onmouseout: function(event)
    {
        var nodeUnderMouse = document.elementFromPoint(event.pageX, event.pageY);
        if (nodeUnderMouse && nodeUnderMouse.isDescendant(this.element))
            return;

        if (this._previousHoveredElement) {
            this._previousHoveredElement.hovered = false;
            delete this._previousHoveredElement;
        }

        WebInspector.highlightDOMNode(0);
    },

    _ondragstart: function(event)
    {
        var treeElement = this._treeElementFromEvent(event);
        if (!treeElement)
            return false;

        if (!this._isValidDragSourceOrTarget(treeElement))
            return false;

        if (treeElement.representedObject.nodeName() === "BODY" || treeElement.representedObject.nodeName() === "HEAD")
            return false;

        event.dataTransfer.setData("text/plain", treeElement.listItemElement.textContent);
        event.dataTransfer.effectAllowed = "copyMove";
        this._nodeBeingDragged = treeElement.representedObject;

        WebInspector.highlightDOMNode(0);

        return true;
    },

    _ondragover: function(event)
    {
        if (!this._nodeBeingDragged)
            return false;

        var treeElement = this._treeElementFromEvent(event);
        if (!this._isValidDragSourceOrTarget(treeElement))
            return false;

        var node = treeElement.representedObject;
        while (node) {
            if (node === this._nodeBeingDragged)
                return false;
            node = node.parentNode;
        }

        treeElement.updateSelection();
        treeElement.listItemElement.addStyleClass("elements-drag-over");
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

    _isValidDragSourceOrTarget: function(treeElement)
    {
        if (!treeElement)
            return false;

        var node = treeElement.representedObject;
        if (!(node instanceof WebInspector.DOMNode))
            return false;

        if (!node.parentNode || node.parentNode.nodeType() !== Node.ELEMENT_NODE)
            return false;

        return true;
    },

    _ondrop: function(event)
    {
        event.preventDefault();
        var treeElement = this._treeElementFromEvent(event);
        if (this._nodeBeingDragged && treeElement) {
            var parentNode;
            var anchorNode;

            if (treeElement._elementCloseTag) {
                // Drop onto closing tag -> insert as last child.
                parentNode = treeElement.representedObject;
            } else {
                var dragTargetNode = treeElement.representedObject;
                parentNode = dragTargetNode.parentNode;
                anchorNode = dragTargetNode;
            }

            function callback(error, newNodeId)
            {
                if (error)
                    return;

                WebInspector.panels.elements.updateModifiedNodes();
                var newNode = WebInspector.domAgent.nodeForId(newNodeId);
                if (newNode)
                    this.selectDOMNode(newNode, true);
            }
            this._nodeBeingDragged.moveTo(parentNode, anchorNode, callback.bind(this));
        }

        delete this._nodeBeingDragged;
    },

    _ondragend: function(event)
    {
        event.preventDefault();
        this._clearDragOverTreeElementMarker();
        delete this._nodeBeingDragged;
    },

    _clearDragOverTreeElementMarker: function()
    {
        if (this._dragOverTreeElement) {
            this._dragOverTreeElement.updateSelection();
            this._dragOverTreeElement.listItemElement.removeStyleClass("elements-drag-over");
            delete this._dragOverTreeElement;
        }
    },

    _contextMenuEventFired: function(event)
    {
        if (!this.showInElementsPanelEnabled)
            return;

        var treeElement = this._treeElementFromEvent(event);
        if (!treeElement)
            return;

        function focusElement()
        {
            WebInspector.panels.elements.switchToAndFocus(treeElement.representedObject);
        }
        var contextMenu = new WebInspector.ContextMenu();
        contextMenu.appendItem(WebInspector.UIString("Reveal in Elements Panel"), focusElement.bind(this));
        contextMenu.show(event);
    },

    populateContextMenu: function(contextMenu, event)
    {
        var treeElement = this._treeElementFromEvent(event);
        if (!treeElement)
            return false;

        var tag = event.target.enclosingNodeOrSelfWithClass("webkit-html-tag");
        var textNode = event.target.enclosingNodeOrSelfWithClass("webkit-html-text-node");
        var populated = WebInspector.populateHrefContextMenu(contextMenu, this.selectedDOMNode(), event);
        if (tag && treeElement._populateTagContextMenu) {
            if (populated)
                contextMenu.appendSeparator();
            treeElement._populateTagContextMenu(contextMenu, event);
            populated = true;
        } else if (textNode && treeElement._populateTextContextMenu) {
            if (populated)
                contextMenu.appendSeparator();
            treeElement._populateTextContextMenu(contextMenu, textNode);
            populated = true;
        }

        return populated;
    },

    adjustCollapsedRange: function()
    {
    }
}

WebInspector.ElementsTreeOutline.prototype.__proto__ = TreeOutline.prototype;

WebInspector.ElementsTreeElement = function(node, elementCloseTag)
{
    this._elementCloseTag = elementCloseTag;
    var hasChildrenOverride = !elementCloseTag && node.hasChildNodes() && !this._showInlineText(node);

    // The title will be updated in onattach.
    TreeElement.call(this, "", node, hasChildrenOverride);

    if (this.representedObject.nodeType() == Node.ELEMENT_NODE && !elementCloseTag)
        this._canAddAttributes = true;
    this._searchQuery = null;
    this._expandedChildrenLimit = WebInspector.ElementsTreeElement.InitialChildrenLimit;
}

WebInspector.ElementsTreeElement.InitialChildrenLimit = 500;

// A union of HTML4 and HTML5-Draft elements that explicitly
// or implicitly (for HTML5) forbid the closing tag.
// FIXME: Revise once HTML5 Final is published.
WebInspector.ElementsTreeElement.ForbiddenClosingTagElements = [
    "area", "base", "basefont", "br", "canvas", "col", "command", "embed", "frame",
    "hr", "img", "input", "isindex", "keygen", "link", "meta", "param", "source"
].keySet();

// These tags we do not allow editing their tag name.
WebInspector.ElementsTreeElement.EditTagBlacklist = [
    "html", "head", "body"
].keySet();

WebInspector.ElementsTreeElement.prototype = {
    highlightSearchResults: function(searchQuery)
    {
        if (this._searchQuery !== searchQuery) {
            this._updateSearchHighlight(false);
            delete this._highlightResult; // A new search query.
        }

        this._searchQuery = searchQuery;
        this._searchHighlightsVisible = true;
        this.updateTitle(true);
    },

    hideSearchHighlights: function()
    {
        delete this._searchHighlightsVisible;
        this._updateSearchHighlight(false);
    },

    _updateSearchHighlight: function(show)
    {
        if (!this._highlightResult)
            return;

        function updateEntryShow(entry)
        {
            switch (entry.type) {
                case "added":
                    entry.parent.insertBefore(entry.node, entry.nextSibling);
                    break;
                case "changed":
                    entry.node.textContent = entry.newText;
                    break;
            }
        }

        function updateEntryHide(entry)
        {
            switch (entry.type) {
                case "added":
                    if (entry.node.parentElement)
                        entry.node.parentElement.removeChild(entry.node);
                    break;
                case "changed":
                    entry.node.textContent = entry.oldText;
                    break;
            }
        }

        var updater = show ? updateEntryShow : updateEntryHide;

        for (var i = 0, size = this._highlightResult.length; i < size; ++i)
            updater(this._highlightResult[i]);
    },

    get hovered()
    {
        return this._hovered;
    },

    set hovered(x)
    {
        if (this._hovered === x)
            return;

        this._hovered = x;

        if (this.listItemElement) {
            if (x) {
                this.updateSelection();
                this.listItemElement.addStyleClass("hovered");
            } else {
                this.listItemElement.removeStyleClass("hovered");
            }
        }
    },

    get expandedChildrenLimit()
    {
        return this._expandedChildrenLimit;
    },

    set expandedChildrenLimit(x)
    {
        if (this._expandedChildrenLimit === x)
            return;

        this._expandedChildrenLimit = x;
        if (this.treeOutline && !this._updateChildrenInProgress)
            this._updateChildren(true);
    },

    get expandedChildCount()
    {
        var count = this.children.length;
        if (count && this.children[count - 1]._elementCloseTag)
            count--;
        if (count && this.children[count - 1].expandAllButton)
            count--;
        return count;
    },

    showChild: function(index)
    {
        if (this._elementCloseTag)
            return;

        if (index >= this.expandedChildrenLimit) {
            this._expandedChildrenLimit = index + 1;
            this._updateChildren(true);
        }

        // Whether index-th child is visible in the children tree
        return this.expandedChildCount > index;
    },

    _createTooltipForNode: function()
    {
        var node = this.representedObject;
        if (!node.nodeName() || node.nodeName().toLowerCase() !== "img")
            return;

        function setTooltip(result)
        {
            if (!result || result.type !== "string")
                return;

            try {
                var properties = JSON.parse(result.description);
                var offsetWidth = properties[0];
                var offsetHeight = properties[1];
                var naturalWidth = properties[2];
                var naturalHeight = properties[3];
                if (offsetHeight === naturalHeight && offsetWidth === naturalWidth)
                    this.tooltip = WebInspector.UIString("%d \xd7 %d pixels", offsetWidth, offsetHeight);
                else
                    this.tooltip = WebInspector.UIString("%d \xd7 %d pixels (Natural: %d \xd7 %d pixels)", offsetWidth, offsetHeight, naturalWidth, naturalHeight);
            } catch (e) {
                console.error(e);
            }
        }

        function resolvedNode(object)
        {
            if (!object)
                return;

            function dimensions()
            {
                return "[" + this.offsetWidth + "," + this.offsetHeight + "," + this.naturalWidth + "," + this.naturalHeight + "]";
            }

            object.callFunction(dimensions, setTooltip.bind(this));
            object.release();
        }
        WebInspector.RemoteObject.resolveNode(node, "", resolvedNode.bind(this));
    },

    updateSelection: function()
    {
        var listItemElement = this.listItemElement;
        if (!listItemElement)
            return;

        if (document.body.offsetWidth <= 0) {
            // The stylesheet hasn't loaded yet or the window is closed,
            // so we can't calculate what is need. Return early.
            return;
        }

        if (!this.selectionElement) {
            this.selectionElement = document.createElement("div");
            this.selectionElement.className = "selection selected";
            listItemElement.insertBefore(this.selectionElement, listItemElement.firstChild);
        }

        this.selectionElement.style.height = listItemElement.offsetHeight + "px";
    },

    onattach: function()
    {
        if (this._hovered) {
            this.updateSelection();
            this.listItemElement.addStyleClass("hovered");
        }

        this.updateTitle();
        this._preventFollowingLinksOnDoubleClick();
        this.listItemElement.draggable = true;
    },

    _preventFollowingLinksOnDoubleClick: function()
    {
        var links = this.listItemElement.querySelectorAll("li > .webkit-html-tag > .webkit-html-attribute > .webkit-html-external-link, li > .webkit-html-tag > .webkit-html-attribute > .webkit-html-resource-link");
        if (!links)
            return;

        for (var i = 0; i < links.length; ++i)
            links[i].preventFollowOnDoubleClick = true;
    },

    onpopulate: function()
    {
        if (this.children.length || this._showInlineText(this.representedObject) || this._elementCloseTag)
            return;

        this.updateChildren();
    },

    updateChildren: function(fullRefresh)
    {
        if (this._elementCloseTag)
            return;
        this.representedObject.getChildNodes(this._updateChildren.bind(this, fullRefresh));
    },

    insertChildElement: function(child, index, closingTag)
    {
        var newElement = new WebInspector.ElementsTreeElement(child, closingTag);
        newElement.selectable = this.treeOutline.selectEnabled;
        this.insertChild(newElement, index);
        return newElement;
    },

    moveChild: function(child, targetIndex)
    {
        var wasSelected = child.selected;
        this.removeChild(child);
        this.insertChild(child, targetIndex);
        if (wasSelected)
            child.select();
    },

    _updateChildren: function(fullRefresh)
    {
        if (this._updateChildrenInProgress)
            return;

        this._updateChildrenInProgress = true;
        var selectedNode = this.treeOutline.selectedDOMNode();
        var originalScrollTop;
        if (fullRefresh) {
            var treeOutlineContainerElement = this.treeOutline.element.parentNode;
            originalScrollTop = treeOutlineContainerElement.scrollTop;
            var selectedTreeElement = this.treeOutline.selectedTreeElement;
            if (selectedTreeElement && selectedTreeElement.hasAncestor(this))
                this.select();
            this.removeChildren();
        }

        var treeElement = this;
        var treeChildIndex = 0;
        var elementToSelect;

        function updateChildrenOfNode(node)
        {
            var treeOutline = treeElement.treeOutline;
            var child = node.firstChild;
            while (child) {
                var currentTreeElement = treeElement.children[treeChildIndex];
                if (!currentTreeElement || currentTreeElement.representedObject !== child) {
                    // Find any existing element that is later in the children list.
                    var existingTreeElement = null;
                    for (var i = (treeChildIndex + 1), size = treeElement.expandedChildCount; i < size; ++i) {
                        if (treeElement.children[i].representedObject === child) {
                            existingTreeElement = treeElement.children[i];
                            break;
                        }
                    }

                    if (existingTreeElement && existingTreeElement.parent === treeElement) {
                        // If an existing element was found and it has the same parent, just move it.
                        treeElement.moveChild(existingTreeElement, treeChildIndex);
                    } else {
                        // No existing element found, insert a new element.
                        if (treeChildIndex < treeElement.expandedChildrenLimit) {
                            var newElement = treeElement.insertChildElement(child, treeChildIndex);
                            if (child === selectedNode)
                                elementToSelect = newElement;
                            if (treeElement.expandedChildCount > treeElement.expandedChildrenLimit)
                                treeElement.expandedChildrenLimit++;
                        }
                    }
                }

                child = child.nextSibling;
                ++treeChildIndex;
            }
        }

        // Remove any tree elements that no longer have this node (or this node's contentDocument) as their parent.
        for (var i = (this.children.length - 1); i >= 0; --i) {
            var currentChild = this.children[i];
            var currentNode = currentChild.representedObject;
            var currentParentNode = currentNode.parentNode;

            if (currentParentNode === this.representedObject)
                continue;

            var selectedTreeElement = this.treeOutline.selectedTreeElement;
            if (selectedTreeElement && (selectedTreeElement === currentChild || selectedTreeElement.hasAncestor(currentChild)))
                this.select();

            this.removeChildAtIndex(i);
        }

        updateChildrenOfNode(this.representedObject);
        this.adjustCollapsedRange();

        var lastChild = this.children[this.children.length - 1];
        if (this.representedObject.nodeType() == Node.ELEMENT_NODE && (!lastChild || !lastChild._elementCloseTag))
            this.insertChildElement(this.representedObject, this.children.length, true);

        // We want to restore the original selection and tree scroll position after a full refresh, if possible.
        if (fullRefresh && elementToSelect) {
            elementToSelect.select();
            if (treeOutlineContainerElement && originalScrollTop <= treeOutlineContainerElement.scrollHeight)
                treeOutlineContainerElement.scrollTop = originalScrollTop;
        }

        delete this._updateChildrenInProgress;
    },

    adjustCollapsedRange: function()
    {
        // Ensure precondition: only the tree elements for node children are found in the tree
        // (not the Expand All button or the closing tag).
        if (this.expandAllButtonElement && this.expandAllButtonElement.__treeElement.parent)
            this.removeChild(this.expandAllButtonElement.__treeElement);

        const node = this.representedObject;
        if (!node.children)
            return;
        const childNodeCount = node.children.length;

        // In case some nodes from the expanded range were removed, pull some nodes from the collapsed range into the expanded range at the bottom.
        for (var i = this.expandedChildCount, limit = Math.min(this.expandedChildrenLimit, childNodeCount); i < limit; ++i)
            this.insertChildElement(node.children[i], i);

        const expandedChildCount = this.expandedChildCount;
        if (childNodeCount > this.expandedChildCount) {
            var targetButtonIndex = expandedChildCount;
            if (!this.expandAllButtonElement) {
                var item = new TreeElement(null, null, false);
                item.titleHTML = "<button class=\"show-all-nodes\" value=\"\" />";
                item.selectable = false;
                item.expandAllButton = true;
                this.insertChild(item, targetButtonIndex);
                this.expandAllButtonElement = item.listItemElement.firstChild;
                this.expandAllButtonElement.__treeElement = item;
                this.expandAllButtonElement.addEventListener("click", this.handleLoadAllChildren.bind(this), false);
            } else if (!this.expandAllButtonElement.__treeElement.parent)
                this.insertChild(this.expandAllButtonElement.__treeElement, targetButtonIndex);
            this.expandAllButtonElement.textContent = WebInspector.UIString("Show All Nodes (%d More)", childNodeCount - expandedChildCount);
        } else if (this.expandAllButtonElement)
            delete this.expandAllButtonElement;
    },

    handleLoadAllChildren: function()
    {
        this.expandedChildrenLimit = Math.max(this.representedObject._childNodeCount, this.expandedChildrenLimit + WebInspector.ElementsTreeElement.InitialChildrenLimit);
    },

    onexpand: function()
    {
        if (this._elementCloseTag)
            return;

        this.updateTitle();
        this.treeOutline.updateSelection();
    },

    oncollapse: function()
    {
        if (this._elementCloseTag)
            return;

        this.updateTitle();
        this.treeOutline.updateSelection();
    },

    onreveal: function()
    {
        if (this.listItemElement) {
            var tagSpans = this.listItemElement.getElementsByClassName("webkit-html-tag-name");
            if (tagSpans.length)
                tagSpans[0].scrollIntoViewIfNeeded(false);
            else
                this.listItemElement.scrollIntoViewIfNeeded(false);
        }
    },

    onselect: function(treeElement, selectedByUser)
    {
        this.treeOutline.suppressRevealAndSelect = true;
        this.treeOutline.selectDOMNode(this.representedObject, selectedByUser);
        if (selectedByUser)
            WebInspector.highlightDOMNode(this.representedObject.id);
        this.updateSelection();
        this.treeOutline.suppressRevealAndSelect = false;
    },

    ondelete: function()
    {
        var startTagTreeElement = this.treeOutline.findTreeElement(this.representedObject);
        startTagTreeElement ? startTagTreeElement.remove() : this.remove();
        return true;
    },

    onenter: function()
    {
        // On Enter or Return start editing the first attribute
        // or create a new attribute on the selected element.
        if (this.treeOutline.editing)
            return false;

        this._startEditing();

        // prevent a newline from being immediately inserted
        return true;
    },

    selectOnMouseDown: function(event)
    {
        TreeElement.prototype.selectOnMouseDown.call(this, event);

        if (this._editing)
            return;

        if (this.treeOutline.showInElementsPanelEnabled) {
            WebInspector.showPanel("elements");
            WebInspector.panels.elements.selectDOMNode(this.representedObject, true);
        }

        // Prevent selecting the nearest word on double click.
        if (event.detail >= 2)
            event.preventDefault();
    },

    ondblclick: function(event)
    {
        if (this._editing || this._elementCloseTag)
            return;

        if (this._startEditingTarget(event.target))
            return;

        if (this.hasChildren && !this.expanded)
            this.expand();
    },

    _insertInLastAttributePosition: function(tag, node)
    {
        if (tag.getElementsByClassName("webkit-html-attribute").length > 0)
            tag.insertBefore(node, tag.lastChild);
        else {
            var nodeName = tag.textContent.match(/^<(.*?)>$/)[1];
            tag.textContent = '';
            tag.appendChild(document.createTextNode('<'+nodeName));
            tag.appendChild(node);
            tag.appendChild(document.createTextNode('>'));
        }

        this.updateSelection();
    },

    _startEditingTarget: function(eventTarget)
    {
        if (this.treeOutline.selectedDOMNode() != this.representedObject)
            return;

        if (this.representedObject.nodeType() != Node.ELEMENT_NODE && this.representedObject.nodeType() != Node.TEXT_NODE)
            return false;

        var textNode = eventTarget.enclosingNodeOrSelfWithClass("webkit-html-text-node");
        if (textNode)
            return this._startEditingTextNode(textNode);

        var attribute = eventTarget.enclosingNodeOrSelfWithClass("webkit-html-attribute");
        if (attribute)
            return this._startEditingAttribute(attribute, eventTarget);

        var tagName = eventTarget.enclosingNodeOrSelfWithClass("webkit-html-tag-name");
        if (tagName)
            return this._startEditingTagName(tagName);

        var newAttribute = eventTarget.enclosingNodeOrSelfWithClass("add-attribute");
        if (newAttribute)
            return this._addNewAttribute();

        return false;
    },

    _populateTagContextMenu: function(contextMenu, event)
    {
        var attribute = event.target.enclosingNodeOrSelfWithClass("webkit-html-attribute");
        var newAttribute = event.target.enclosingNodeOrSelfWithClass("add-attribute");

        // Add attribute-related actions.
        contextMenu.appendItem(WebInspector.UIString(WebInspector.useLowerCaseMenuTitles() ? "Add attribute" : "Add Attribute"), this._addNewAttribute.bind(this));
        if (attribute && !newAttribute)
            contextMenu.appendItem(WebInspector.UIString(WebInspector.useLowerCaseMenuTitles() ? "Edit attribute" : "Edit Attribute"), this._startEditingAttribute.bind(this, attribute, event.target));
        contextMenu.appendSeparator();

        // Add free-form node-related actions.
        contextMenu.appendItem(WebInspector.UIString("Edit as HTML"), this._editAsHTML.bind(this));
        contextMenu.appendItem(WebInspector.UIString("Copy as HTML"), this._copyHTML.bind(this));
        contextMenu.appendItem(WebInspector.UIString(WebInspector.useLowerCaseMenuTitles() ? "Delete node" : "Delete Node"), this.remove.bind(this));

        if (Preferences.nativeInstrumentationEnabled) {
            // Add debbuging-related actions
            contextMenu.appendSeparator();
            var pane = WebInspector.panels.elements.sidebarPanes.domBreakpoints;
            pane.populateNodeContextMenu(this.representedObject, contextMenu);
        }
    },

    _populateTextContextMenu: function(contextMenu, textNode)
    {
        contextMenu.appendItem(WebInspector.UIString(WebInspector.useLowerCaseMenuTitles() ? "Edit text" : "Edit Text"), this._startEditingTextNode.bind(this, textNode));
    },

    _startEditing: function()
    {
        if (this.treeOutline.selectedDOMNode() !== this.representedObject)
            return;

        var listItem = this._listItemNode;

        if (this._canAddAttributes) {
            var attribute = listItem.getElementsByClassName("webkit-html-attribute")[0];
            if (attribute)
                return this._startEditingAttribute(attribute, attribute.getElementsByClassName("webkit-html-attribute-value")[0]);

            return this._addNewAttribute();
        }

        if (this.representedObject.nodeType() === Node.TEXT_NODE) {
            var textNode = listItem.getElementsByClassName("webkit-html-text-node")[0];
            if (textNode)
                return this._startEditingTextNode(textNode);
            return;
        }
    },

    _addNewAttribute: function()
    {
        // Cannot just convert the textual html into an element without
        // a parent node. Use a temporary span container for the HTML.
        var container = document.createElement("span");
        this._buildAttributeDOM(container, " ", "");
        var attr = container.firstChild;
        attr.style.marginLeft = "2px"; // overrides the .editing margin rule
        attr.style.marginRight = "2px"; // overrides the .editing margin rule

        var tag = this.listItemElement.getElementsByClassName("webkit-html-tag")[0];
        this._insertInLastAttributePosition(tag, attr);
        return this._startEditingAttribute(attr, attr);
    },

    _triggerEditAttribute: function(attributeName)
    {
        var attributeElements = this.listItemElement.getElementsByClassName("webkit-html-attribute-name");
        for (var i = 0, len = attributeElements.length; i < len; ++i) {
            if (attributeElements[i].textContent === attributeName) {
                for (var elem = attributeElements[i].nextSibling; elem; elem = elem.nextSibling) {
                    if (elem.nodeType !== Node.ELEMENT_NODE)
                        continue;

                    if (elem.hasStyleClass("webkit-html-attribute-value"))
                        return this._startEditingAttribute(elem.parentNode, elem);
                }
            }
        }
    },

    _startEditingAttribute: function(attribute, elementForSelection)
    {
        if (WebInspector.isBeingEdited(attribute))
            return true;

        var attributeNameElement = attribute.getElementsByClassName("webkit-html-attribute-name")[0];
        if (!attributeNameElement)
            return false;

        var attributeName = attributeNameElement.textContent;

        function removeZeroWidthSpaceRecursive(node)
        {
            if (node.nodeType === Node.TEXT_NODE) {
                node.nodeValue = node.nodeValue.replace(/\u200B/g, "");
                return;
            }

            if (node.nodeType !== Node.ELEMENT_NODE)
                return;

            for (var child = node.firstChild; child; child = child.nextSibling)
                removeZeroWidthSpaceRecursive(child);
        }

        // Remove zero-width spaces that were added by nodeTitleInfo.
        removeZeroWidthSpaceRecursive(attribute);

        this._editing = WebInspector.startEditing(attribute, {
            context: attributeName,
            commitHandler: this._attributeEditingCommitted.bind(this),
            cancelHandler: this._editingCancelled.bind(this)
        });
        window.getSelection().setBaseAndExtent(elementForSelection, 0, elementForSelection, 1);

        return true;
    },

    _startEditingTextNode: function(textNode)
    {
        if (WebInspector.isBeingEdited(textNode))
            return true;

        this._editing = WebInspector.startEditing(textNode, {
            context: null,
            commitHandler: this._textNodeEditingCommitted.bind(this),
            cancelHandler: this._editingCancelled.bind(this)
        });
        window.getSelection().setBaseAndExtent(textNode, 0, textNode, 1);

        return true;
    },

    _startEditingTagName: function(tagNameElement)
    {
        if (!tagNameElement) {
            tagNameElement = this.listItemElement.getElementsByClassName("webkit-html-tag-name")[0];
            if (!tagNameElement)
                return false;
        }

        var tagName = tagNameElement.textContent;
        if (WebInspector.ElementsTreeElement.EditTagBlacklist[tagName.toLowerCase()])
            return false;

        if (WebInspector.isBeingEdited(tagNameElement))
            return true;

        var closingTagElement = this._distinctClosingTagElement();

        function keyupListener(event)
        {
            if (closingTagElement)
                closingTagElement.textContent = "</" + tagNameElement.textContent + ">";
        }

        function editingComitted(element, newTagName)
        {
            tagNameElement.removeEventListener('keyup', keyupListener, false);
            this._tagNameEditingCommitted.apply(this, arguments);
        }

        function editingCancelled()
        {
            tagNameElement.removeEventListener('keyup', keyupListener, false);
            this._editingCancelled.apply(this, arguments);
        }

        tagNameElement.addEventListener('keyup', keyupListener, false);

        this._editing = WebInspector.startEditing(tagNameElement, {
            context: tagName,
            commitHandler: editingComitted.bind(this),
            cancelHandler: editingCancelled.bind(this)
        });
        window.getSelection().setBaseAndExtent(tagNameElement, 0, tagNameElement, 1);
        return true;
    },

    _startEditingAsHTML: function(commitCallback, error, initialValue)
    {
        if (error)
            return;
        if (this._htmlEditElement && WebInspector.isBeingEdited(this._htmlEditElement))
            return;

        this._htmlEditElement = document.createElement("div");
        this._htmlEditElement.className = "source-code elements-tree-editor";
        this._htmlEditElement.textContent = initialValue;

        // Hide header items.
        var child = this.listItemElement.firstChild;
        while (child) {
            child.style.display = "none";
            child = child.nextSibling;
        }
        // Hide children item.
        if (this._childrenListNode)
            this._childrenListNode.style.display = "none";
        // Append editor.
        this.listItemElement.appendChild(this._htmlEditElement);

        this.updateSelection();

        function commit()
        {
            commitCallback(this._htmlEditElement.textContent);
            dispose.call(this);
        }

        function dispose()
        {
            delete this._editing;

            // Remove editor.
            this.listItemElement.removeChild(this._htmlEditElement);
            delete this._htmlEditElement;
            // Unhide children item.
            if (this._childrenListNode)
                this._childrenListNode.style.removeProperty("display");
            // Unhide header items.
            var child = this.listItemElement.firstChild;
            while (child) {
                child.style.removeProperty("display");
                child = child.nextSibling;
            }

            this.updateSelection();
        }

        this._editing = WebInspector.startEditing(this._htmlEditElement, {
            context: null,
            commitHandler: commit.bind(this),
            cancelHandler: dispose.bind(this),
            multiline: true
        });
    },

    _attributeEditingCommitted: function(element, newText, oldText, attributeName, moveDirection)
    {
        delete this._editing;

        function moveToNextAttributeIfNeeded(error)
        {
            if (error)
                this._editingCancelled(element, attributeName);

            if (!moveDirection)
                return;

            WebInspector.panels.elements.updateModifiedNodes();

            // Search for the attribute's position, and then decide where to move to.
            var attributes = this.representedObject.attributes();
            for (var i = 0; i < attributes.length; ++i) {
                if (attributes[i].name !== attributeName)
                    continue;

                if (moveDirection === "backward") {
                    if (i === 0)
                        this._startEditingTagName();
                    else
                        this._triggerEditAttribute(attributes[i - 1].name);
                } else {
                    if (i === attributes.length - 1)
                        this._addNewAttribute();
                    else
                        this._triggerEditAttribute(attributes[i + 1].name);
                }
                return;
            }

            // Moving From the "New Attribute" position.
            if (moveDirection === "backward") {
                if (newText === " ") {
                    // Moving from "New Attribute" that was not edited
                    if (attributes.length > 0)
                        this._triggerEditAttribute(attributes[attributes.length - 1].name);
                } else {
                    // Moving from "New Attribute" that holds new value
                    if (attributes.length > 1)
                        this._triggerEditAttribute(attributes[attributes.length - 2].name);
                }
            } else if (moveDirection === "forward") {
                if (!/^\s*$/.test(newText))
                    this._addNewAttribute();
                else
                    this._startEditingTagName();
            }
        }

        this.representedObject.setAttribute(attributeName, newText, moveToNextAttributeIfNeeded.bind(this));
    },

    _tagNameEditingCommitted: function(element, newText, oldText, tagName, moveDirection)
    {
        delete this._editing;
        var self = this;

        function cancel()
        {
            var closingTagElement = self._distinctClosingTagElement();
            if (closingTagElement)
                closingTagElement.textContent = "</" + tagName + ">";

            self._editingCancelled(element, tagName);
            moveToNextAttributeIfNeeded.call(self);
        }

        function moveToNextAttributeIfNeeded()
        {
            if (moveDirection !== "forward") {
                this._addNewAttribute();
                return;
            }

            var attributes = this.representedObject.attributes();
            if (attributes.length > 0)
                this._triggerEditAttribute(attributes[0].name);
            else
                this._addNewAttribute();
        }

        newText = newText.trim();
        if (newText === oldText) {
            cancel();
            return;
        }

        var treeOutline = this.treeOutline;
        var wasExpanded = this.expanded;

        function changeTagNameCallback(error, nodeId)
        {
            if (error || !nodeId) {
                cancel();
                return;
            }

            // Select it and expand if necessary. We force tree update so that it processes dom events and is up to date.
            WebInspector.panels.elements.updateModifiedNodes();

            WebInspector.updateFocusedNode(nodeId);
            var newTreeItem = treeOutline.findTreeElement(WebInspector.domAgent.nodeForId(nodeId));
            if (wasExpanded)
                newTreeItem.expand();

            moveToNextAttributeIfNeeded.call(newTreeItem);
        }

        this.representedObject.setNodeName(newText, changeTagNameCallback);
    },

    _textNodeEditingCommitted: function(element, newText)
    {
        delete this._editing;

        var textNode;
        if (this.representedObject.nodeType() === Node.ELEMENT_NODE) {
            // We only show text nodes inline in elements if the element only
            // has a single child, and that child is a text node.
            textNode = this.representedObject.firstChild;
        } else if (this.representedObject.nodeType() == Node.TEXT_NODE)
            textNode = this.representedObject;

        textNode.setNodeValue(newText, this.updateTitle.bind(this));
    },

    _editingCancelled: function(element, context)
    {
        delete this._editing;

        // Need to restore attributes structure.
        this.updateTitle();
    },

    _distinctClosingTagElement: function()
    {
        // FIXME: Improve the Tree Element / Outline Abstraction to prevent crawling the DOM

        // For an expanded element, it will be the last element with class "close"
        // in the child element list.
        if (this.expanded) {
            var closers = this._childrenListNode.querySelectorAll(".close");
            return closers[closers.length-1];
        }

        // Remaining cases are single line non-expanded elements with a closing
        // tag, or HTML elements without a closing tag (such as <br>). Return
        // null in the case where there isn't a closing tag.
        var tags = this.listItemElement.getElementsByClassName("webkit-html-tag");
        return (tags.length === 1 ? null : tags[tags.length-1]);
    },

    updateTitle: function(onlySearchQueryChanged)
    {
        // If we are editing, return early to prevent canceling the edit.
        // After editing is committed updateTitle will be called.
        if (this._editing)
            return;

        if (onlySearchQueryChanged) {
            if (this._highlightResult)
                this._updateSearchHighlight(false);
        } else {
            var highlightElement = document.createElement("span");
            highlightElement.className = "highlight";
            highlightElement.appendChild(this._nodeTitleInfo(WebInspector.linkifyURLAsNode).titleDOM);
            this.title = highlightElement;
            delete this._highlightResult;
        }

        delete this.selectionElement;
        this.updateSelection();
        this._preventFollowingLinksOnDoubleClick();
        this._highlightSearchResults();
    },

    _buildAttributeDOM: function(parentElement, name, value, node, linkify)
    {
        var hasText = (value.length > 0);
        var attrSpanElement = parentElement.createChild("span", "webkit-html-attribute");
        var attrNameElement = attrSpanElement.createChild("span", "webkit-html-attribute-name");
        attrNameElement.textContent = name;

        if (hasText)
            attrSpanElement.appendChild(document.createTextNode("=\u200B\""));

        if (linkify && (name === "src" || name === "href")) {
            var rewrittenHref = WebInspector.resourceURLForRelatedNode(node, value);
            value = value.replace(/([\/;:\)\]\}])/g, "$1\u200B");
            attrSpanElement.appendChild(linkify(rewrittenHref, value, "webkit-html-attribute-value", node.nodeName().toLowerCase() === "a"));
        } else {
            value = value.replace(/([\/;:\)\]\}])/g, "$1\u200B");
            var attrValueElement = attrSpanElement.createChild("span", "webkit-html-attribute-value");
            attrValueElement.textContent = value;
        }

        if (hasText)
            attrSpanElement.appendChild(document.createTextNode("\""));
    },

    _buildTagDOM: function(parentElement, tagName, isClosingTag, isDistinctTreeElement, linkify)
    {
        var node = this.representedObject;
        var classes = [ "webkit-html-tag" ];
        if (isClosingTag && isDistinctTreeElement)
            classes.push("close");
        var tagElement = parentElement.createChild("span", classes.join(" "));
        tagElement.appendChild(document.createTextNode("<"));
        var tagNameElement = tagElement.createChild("span", isClosingTag ? "" : "webkit-html-tag-name");
        tagNameElement.textContent = (isClosingTag ? "/" : "") + tagName;
        if (!isClosingTag && node.hasAttributes()) {
            var attributes = node.attributes();
            for (var i = 0; i < attributes.length; ++i) {
                var attr = attributes[i];
                tagElement.appendChild(document.createTextNode(" "));
                this._buildAttributeDOM(tagElement, attr.name, attr.value, node, linkify);
            }
        }
        tagElement.appendChild(document.createTextNode(">"));
        parentElement.appendChild(document.createTextNode("\u200B"));
    },

    _nodeTitleInfo: function(linkify)
    {
        var node = this.representedObject;
        var info = {titleDOM: document.createDocumentFragment(), hasChildren: this.hasChildren};

        switch (node.nodeType()) {
            case Node.DOCUMENT_NODE:
                info.titleDOM.appendChild(document.createTextNode("Document"));
                break;

            case Node.DOCUMENT_FRAGMENT_NODE:
                info.titleDOM.appendChild(document.createTextNode("Document Fragment"));
                break;

            case Node.ATTRIBUTE_NODE:
                var value = node.value || "\u200B"; // Zero width space to force showing an empty value.
                this._buildAttributeDOM(info.titleDOM, node.name, value);
                break;

            case Node.ELEMENT_NODE:
                var tagName = this.treeOutline.nodeNameToCorrectCase(node.nodeName());
                if (this._elementCloseTag) {
                    this._buildTagDOM(info.titleDOM, tagName, true, true);
                    info.hasChildren = false;
                    break;
                }

                this._buildTagDOM(info.titleDOM, tagName, false, false, linkify);

                var textChild = this._singleTextChild(node);
                var showInlineText = textChild && textChild.nodeValue().length < Preferences.maxInlineTextChildLength;

                if (!this.expanded && (!showInlineText && (this.treeOutline.isXMLMimeType || !WebInspector.ElementsTreeElement.ForbiddenClosingTagElements[tagName]))) {
                    if (this.hasChildren) {
                        var textNodeElement = info.titleDOM.createChild("span", "webkit-html-text-node");
                        textNodeElement.textContent = "\u2026";
                        info.titleDOM.appendChild(document.createTextNode("\u200B"));
                    }
                    this._buildTagDOM(info.titleDOM, tagName, true, false, false);
                }

                // If this element only has a single child that is a text node,
                // just show that text and the closing tag inline rather than
                // create a subtree for them
                if (showInlineText) {
                    var textNodeElement = info.titleDOM.createChild("span", "webkit-html-text-node");
                    textNodeElement.textContent = textChild.nodeValue();
                    info.titleDOM.appendChild(document.createTextNode("\u200B"));
                    this._buildTagDOM(info.titleDOM, tagName, true, false);
                    info.hasChildren = false;
                }
                break;

            case Node.TEXT_NODE:
                if (node.isWhitespace())
                    info.titleDOM.appendChild(document.createTextNode("(whitespace)"));
                else {
                    if (node.parentNode && node.parentNode.nodeName().toLowerCase() === "script") {
                        var newNode = info.titleDOM.createChild("span", "webkit-html-text-node webkit-html-js-node");
                        newNode.textContent = node.nodeValue();

                        var javascriptSyntaxHighlighter = new WebInspector.DOMSyntaxHighlighter("text/javascript", true);
                        javascriptSyntaxHighlighter.syntaxHighlightNode(newNode);
                    } else if (node.parentNode && node.parentNode.nodeName().toLowerCase() === "style") {
                        var newNode = info.titleDOM.createChild("span", "webkit-html-text-node webkit-html-css-node");
                        newNode.textContent = node.nodeValue();

                        var cssSyntaxHighlighter = new WebInspector.DOMSyntaxHighlighter("text/css", true);
                        cssSyntaxHighlighter.syntaxHighlightNode(newNode);
                    } else {
                        info.titleDOM.appendChild(document.createTextNode("\""));
                        var textNodeElement = info.titleDOM.createChild("span", "webkit-html-text-node");
                        textNodeElement.textContent = node.nodeValue();
                        info.titleDOM.appendChild(document.createTextNode("\""));
                    }
                }
                break;

            case Node.COMMENT_NODE:
                var commentElement = info.titleDOM.createChild("span", "webkit-html-comment");
                commentElement.appendChild(document.createTextNode("<!--" + node.nodeValue() + "-->"));
                break;

            case Node.DOCUMENT_TYPE_NODE:
                var docTypeElement = info.titleDOM.createChild("span", "webkit-html-doctype");
                docTypeElement.appendChild(document.createTextNode("<!DOCTYPE " + node.nodeName()));
                if (node.publicId) {
                    docTypeElement.appendChild(document.createTextNode(" PUBLIC \"" + node.publicId + "\""));
                    if (node.systemId)
                        docTypeElement.appendChild(document.createTextNode(" \"" + node.systemId + "\""));
                } else if (node.systemId)
                    docTypeElement.appendChild(document.createTextNode(" SYSTEM \"" + node.systemId + "\""));

                if (node.internalSubset)
                    docTypeElement.appendChild(document.createTextNode(" [" + node.internalSubset + "]"));

                docTypeElement.appendChild(document.createTextNode(">"));
                break;

            case Node.CDATA_SECTION_NODE:
                var cdataElement = info.titleDOM.createChild("span", "webkit-html-text-node");
                cdataElement.appendChild(document.createTextNode("<![CDATA[" + node.nodeValue() + "]]>"));
                break;
            default:
                var defaultElement = info.titleDOM.appendChild(document.createTextNode(this.treeOutline.nodeNameToCorrectCase(node.nodeName()).collapseWhitespace()));
        }

        return info;
    },

    _singleTextChild: function(node)
    {
        if (!node)
            return null;

        var firstChild = node.firstChild;
        if (!firstChild || firstChild.nodeType() !== Node.TEXT_NODE)
            return null;

        var sibling = firstChild.nextSibling;
        return sibling ? null : firstChild;
    },

    _showInlineText: function(node)
    {
        if (node.nodeType() === Node.ELEMENT_NODE) {
            var textChild = this._singleTextChild(node);
            if (textChild && textChild.nodeValue().length < Preferences.maxInlineTextChildLength)
                return true;
        }
        return false;
    },

    remove: function()
    {
        var parentElement = this.parent;
        if (!parentElement)
            return;

        var self = this;
        function removeNodeCallback(error, removedNodeId)
        {
            if (error)
                return;

            parentElement.removeChild(self);
            parentElement.adjustCollapsedRange();
        }

        this.representedObject.removeNode(removeNodeCallback);
    },

    _editAsHTML: function()
    {
        var treeOutline = this.treeOutline;
        var node = this.representedObject;
        var wasExpanded = this.expanded;

        function selectNode(error, nodeId)
        {
            if (error || !nodeId)
                return;

            // Select it and expand if necessary. We force tree update so that it processes dom events and is up to date.
            WebInspector.panels.elements.updateModifiedNodes();

            WebInspector.updateFocusedNode(nodeId);
            if (wasExpanded) {
                var newTreeItem = treeOutline.findTreeElement(WebInspector.domAgent.nodeForId(nodeId));
                if (newTreeItem)
                    newTreeItem.expand();
            }
        }

        function commitChange(value)
        {
            node.setOuterHTML(value, selectNode);
        }

        node.getOuterHTML(this._startEditingAsHTML.bind(this, commitChange));
    },

    _copyHTML: function()
    {
        this.representedObject.copyNode();
    },

    _highlightSearchResults: function()
    {
        if (!this._searchQuery || !this._searchHighlightsVisible)
            return;
        if (this._highlightResult) {
            this._updateSearchHighlight(true);
            return;
        }

        var text = this.listItemElement.textContent;
        var regexObject = createSearchRegex(this._searchQuery, "g");

        var offset = 0;
        var match = regexObject.exec(text);
        var matchRanges = [];
        while (match) {
            matchRanges.push({ offset: match.index, length: match[0].length });
            match = regexObject.exec(text);
        }

        // Fall back for XPath, etc. matches.
        if (!matchRanges.length)
            matchRanges.push({ offset: 0, length: text.length });

        this._highlightResult = [];
        highlightSearchResults(this.listItemElement, matchRanges, this._highlightResult);
    }
}

WebInspector.ElementsTreeElement.prototype.__proto__ = TreeElement.prototype;
