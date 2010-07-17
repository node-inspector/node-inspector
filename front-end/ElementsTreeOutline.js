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

    TreeOutline.call(this, this.element);

    this.includeRootDOMNode = true;
    this.selectEnabled = false;
    this.showInElementsPanelEnabled = false;
    this.rootDOMNode = null;
    this.focusedDOMNode = null;

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

        this._isXMLMimeType = !!(WebInspector.mainResource && WebInspector.mainResource.mimeType && WebInspector.mainResource.mimeType.match(/x(?:ht)?ml/i));

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

    get focusedDOMNode()
    {
        return this._focusedDOMNode;
    },

    set focusedDOMNode(x)
    {
        if (this._focusedDOMNode === x) {
            this.revealAndSelectNode(x);
            return;
        }

        this._focusedDOMNode = x;

        this.revealAndSelectNode(x);

        // The revealAndSelectNode() method might find a different element if there is inlined text,
        // and the select() call would change the focusedDOMNode and reenter this setter. So to
        // avoid calling focusedNodeChanged() twice, first check if _focusedDOMNode is the same
        // node as the one passed in.
        if (this._focusedDOMNode === x) {
            this.focusedNodeChanged();

            if (x && !this.suppressSelectHighlight) {
                InspectorBackend.highlightDOMNode(x.id);

                if ("_restorePreviousHighlightNodeTimeout" in this)
                    clearTimeout(this._restorePreviousHighlightNodeTimeout);

                function restoreHighlightToHoveredNode()
                {
                    var hoveredNode = WebInspector.hoveredDOMNode;
                    if (hoveredNode)
                        InspectorBackend.highlightDOMNode(hoveredNode.id);
                    else
                        InspectorBackend.hideDOMNodeHighlight();
                }

                this._restorePreviousHighlightNodeTimeout = setTimeout(restoreHighlightToHoveredNode, 2000);
            }
        }
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
            this.revealAndSelectNode(selectedNode);
    },

    updateSelection: function()
    {
        if (!this.selectedTreeElement)
            return;
        var element = this.treeOutline.selectedTreeElement;
        element.updateSelection();
    },

    focusedNodeChanged: function(forceUpdate) {},

    findTreeElement: function(node)
    {
        var treeElement = TreeOutline.prototype.findTreeElement.call(this, node, isAncestorNode, parentNode);
        if (!treeElement && node.nodeType === Node.TEXT_NODE) {
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

    revealAndSelectNode: function(node)
    {
        if (!node || this._suppressRevealAndSelect)
            return;

        var treeElement = this.createTreeElementFor(node);
        if (!treeElement)
            return;

        treeElement.reveal();
        treeElement.select();
    },

    _treeElementFromEvent: function(event)
    {
        var root = this.element;

        // We choose this X coordinate based on the knowledge that our list
        // items extend nearly to the right edge of the outer <ol>.
        var x = root.totalOffsetLeft + root.offsetWidth - 20;

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

        WebInspector.hoveredDOMNode = (element ? element.representedObject : null);
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

        WebInspector.hoveredDOMNode = null;
    },

    _contextMenuEventFired: function(event)
    {
        var listItem = event.target.enclosingNodeOrSelfWithNodeName("LI");
        if (!listItem || !listItem.treeElement)
            return;

        var contextMenu = new WebInspector.ContextMenu();

        var tag = event.target.enclosingNodeOrSelfWithClass("webkit-html-tag");
        var textNode = event.target.enclosingNodeOrSelfWithClass("webkit-html-text-node");
        if (tag && listItem.treeElement._populateTagContextMenu)
            listItem.treeElement._populateTagContextMenu(contextMenu, event);
        else if (textNode && listItem.treeElement._populateTextContextMenu)
            listItem.treeElement._populateTextContextMenu(contextMenu, textNode);
        contextMenu.show(event);
    }
}

WebInspector.ElementsTreeOutline.prototype.__proto__ = TreeOutline.prototype;

WebInspector.ElementsTreeElement = function(node, elementCloseTag)
{
    this._elementCloseTag = elementCloseTag;
    var hasChildrenOverride = !elementCloseTag && node.hasChildNodes() && !this._showInlineText(node);

    // The title will be updated in onattach.
    TreeElement.call(this, "", node, hasChildrenOverride);

    if (this.representedObject.nodeType == Node.ELEMENT_NODE && !elementCloseTag)
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
        if (this._searchQuery === searchQuery)
            return;

        this._searchQuery = searchQuery;
        this.updateTitle();
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
        if (!node.nodeName || node.nodeName.toLowerCase() !== "img")
            return;
        
        function setTooltip(properties)
        {
            if (!properties)
                return;

            if (properties.offsetHeight === properties.naturalHeight && properties.offsetWidth === properties.naturalWidth)
                this.tooltip = WebInspector.UIString("%d × %d pixels", properties.offsetWidth, properties.offsetHeight);
            else
                this.tooltip = WebInspector.UIString("%d × %d pixels (Natural: %d × %d pixels)", properties.offsetWidth, properties.offsetHeight, properties.naturalWidth, properties.naturalHeight);
        }
        var objectProxy = new WebInspector.ObjectProxy(node.injectedScriptId, node.id);
        WebInspector.ObjectProxy.getPropertiesAsync(objectProxy, ["naturalHeight", "naturalWidth", "offsetHeight", "offsetWidth"], setTooltip.bind(this));
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

        WebInspector.domAgent.getChildNodesAsync(this.representedObject, this._updateChildren.bind(this, fullRefresh));
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
        var focusedNode = this.treeOutline.focusedDOMNode;
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
                            if (child === focusedNode)
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
        this.adjustCollapsedRange(false);

        var lastChild = this.children[this.children.length - 1];
        if (this.representedObject.nodeType == Node.ELEMENT_NODE && (!lastChild || !lastChild._elementCloseTag))
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
                var title = "<button class=\"show-all-nodes\" value=\"\" />";
                var item = new TreeElement(title, null, false);
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
        if (this.listItemElement)
            this.listItemElement.scrollIntoViewIfNeeded(false);
    },

    onselect: function()
    {
        this.treeOutline.suppressRevealAndSelect = true;
        this.treeOutline.focusedDOMNode = this.representedObject;
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
            WebInspector.showElementsPanel();
            WebInspector.panels.elements.focusedDOMNode = this.representedObject;
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
        if (this.treeOutline.focusedDOMNode != this.representedObject)
            return;

        if (this.representedObject.nodeType != Node.ELEMENT_NODE && this.representedObject.nodeType != Node.TEXT_NODE)
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
        contextMenu.appendItem(WebInspector.UIString("Add Attribute"), this._addNewAttribute.bind(this));
        if (attribute && !newAttribute)
            contextMenu.appendItem(WebInspector.UIString("Edit Attribute"), this._startEditingAttribute.bind(this, attribute, event.target));
        contextMenu.appendSeparator();

        // Add free-form node-related actions.
        contextMenu.appendItem(WebInspector.UIString("Edit as HTML"), this._editAsHTML.bind(this));
        contextMenu.appendItem(WebInspector.UIString("Copy as HTML"), this._copyHTML.bind(this));
        contextMenu.appendItem(WebInspector.UIString("Delete Node"), this.remove.bind(this));
    },

    _populateTextContextMenu: function(contextMenu, textNode)
    {
        contextMenu.appendItem(WebInspector.UIString("Edit Text"), this._startEditingTextNode.bind(this, textNode));
    },

    _startEditing: function()
    {
        if (this.treeOutline.focusedDOMNode !== this.representedObject)
            return;

        var listItem = this._listItemNode;

        if (this._canAddAttributes) {
            var attribute = listItem.getElementsByClassName("webkit-html-attribute")[0];
            if (attribute)
                return this._startEditingAttribute(attribute, attribute.getElementsByClassName("webkit-html-attribute-value")[0]);

            return this._addNewAttribute();
        }

        if (this.representedObject.nodeType === Node.TEXT_NODE) {
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
        container.innerHTML = this._attributeHTML(" ", "");
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

        var attributeName = attributeNameElement.innerText;

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

        this._editing = WebInspector.startEditing(attribute, this._attributeEditingCommitted.bind(this), this._editingCancelled.bind(this), attributeName);
        window.getSelection().setBaseAndExtent(elementForSelection, 0, elementForSelection, 1);

        return true;
    },

    _startEditingTextNode: function(textNode)
    {
        if (WebInspector.isBeingEdited(textNode))
            return true;

        this._editing = WebInspector.startEditing(textNode, this._textNodeEditingCommitted.bind(this), this._editingCancelled.bind(this));
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

        this._editing = WebInspector.startEditing(tagNameElement, editingComitted.bind(this), editingCancelled.bind(this), tagName);
        window.getSelection().setBaseAndExtent(tagNameElement, 0, tagNameElement, 1);
        return true;
    },

    _startEditingAsHTML: function(commitCallback, initialValue)
    {
        if (this._htmlEditElement && WebInspector.isBeingEdited(this._htmlEditElement))
            return true;

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

        this._editing = WebInspector.startEditing(this._htmlEditElement, commit.bind(this), dispose.bind(this), null, true);
    },

    _attributeEditingCommitted: function(element, newText, oldText, attributeName, moveDirection)
    {
        delete this._editing;

        // Before we do anything, determine where we should move
        // next based on the current element's settings
        var moveToAttribute, moveToTagName, moveToNewAttribute;
        if (moveDirection) {
            var found = false;

            // Search for the attribute's position, and then decide where to move to.
            var attributes = this.representedObject.attributes;
            for (var i = 0; i < attributes.length; ++i) {
                if (attributes[i].name === attributeName) {
                    found = true;
                    if (moveDirection === "backward") {
                        if (i === 0)
                            moveToTagName = true;
                        else
                            moveToAttribute = attributes[i - 1].name;
                    } else if (moveDirection === "forward") {
                        if (i === attributes.length - 1)
                            moveToNewAttribute = true;
                        else
                            moveToAttribute = attributes[i + 1].name;
                    }
                }
            }

            // Moving From the "New Attribute" position.
            if (!found) {
                if (moveDirection === "backward" && attributes.length > 0)
                    moveToAttribute = attributes[attributes.length - 1].name;
                else if (moveDirection === "forward" && !/^\s*$/.test(newText))
                    moveToNewAttribute = true;
            }
        }

        function moveToNextAttributeIfNeeded()
        {
            // Cleanup empty new attribute sections.
            if (element.textContent.trim().length === 0)
                element.parentNode.removeChild(element);

            // Make the move.
            if (moveToAttribute)
                this._triggerEditAttribute(moveToAttribute);
            else if (moveToNewAttribute)
                this._addNewAttribute();
            else if (moveToTagName)
                this._startEditingTagName();
        }

        function regenerateStyledAttribute(name, value)
        {
            var previous = element.previousSibling;
            if (!previous || previous.nodeType !== Node.TEXT_NODE)
                element.parentNode.insertBefore(document.createTextNode(" "), element);
            element.outerHTML = this._attributeHTML(name, value);
        }

        var parseContainerElement = document.createElement("span");
        parseContainerElement.innerHTML = "<span " + newText + "></span>";
        var parseElement = parseContainerElement.firstChild;

        if (!parseElement) {
            this._editingCancelled(element, attributeName);
            moveToNextAttributeIfNeeded.call(this);
            return;
        }

        if (!parseElement.hasAttributes()) {
            this.representedObject.removeAttribute(attributeName);
            moveToNextAttributeIfNeeded.call(this);
            return;
        }

        var foundOriginalAttribute = false;
        for (var i = 0; i < parseElement.attributes.length; ++i) {
            var attr = parseElement.attributes[i];
            foundOriginalAttribute = foundOriginalAttribute || attr.name === attributeName;
            try {
                this.representedObject.setAttribute(attr.name, attr.value);
                regenerateStyledAttribute.call(this, attr.name, attr.value);
            } catch(e) {} // ignore invalid attribute (innerHTML doesn't throw errors, but this can)
        }

        if (!foundOriginalAttribute)
            this.representedObject.removeAttribute(attributeName);

        this.treeOutline.focusedNodeChanged(true);

        moveToNextAttributeIfNeeded.call(this);
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
            if (moveDirection !== "forward")
                return;

            var attributes = this.representedObject.attributes;
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

        function changeTagNameCallback(nodeId)
        {
            if (!nodeId) {
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

        var callId = WebInspector.Callback.wrap(changeTagNameCallback);
        InspectorBackend.changeTagName(callId, this.representedObject.id, newText);
    },

    _textNodeEditingCommitted: function(element, newText)
    {
        delete this._editing;

        var textNode;
        if (this.representedObject.nodeType == Node.ELEMENT_NODE) {
            // We only show text nodes inline in elements if the element only
            // has a single child, and that child is a text node.
            textNode = this.representedObject.firstChild;
        } else if (this.representedObject.nodeType == Node.TEXT_NODE)
            textNode = this.representedObject;

        textNode.nodeValue = newText;

        // Need to restore attributes / node structure.
        this.updateTitle();
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

    updateTitle: function()
    {
        // If we are editing, return early to prevent canceling the edit.
        // After editing is committed updateTitle will be called.
        if (this._editing)
            return;

        var title = this._nodeTitleInfo(WebInspector.linkifyURL).title;
        this.title = "<span class=\"highlight\">" + title + "</span>";
        delete this.selectionElement;
        this.updateSelection();
        this._preventFollowingLinksOnDoubleClick();
        this._highlightSearchResults();
    },

    _rewriteAttrHref: function(node, hrefValue)
    {
        if (!hrefValue || hrefValue.indexOf("://") > 0)
            return hrefValue;

        for (var frameOwnerCandidate = node; frameOwnerCandidate; frameOwnerCandidate = frameOwnerCandidate.parentNode) {
            if (frameOwnerCandidate.documentURL) {
                var result = WebInspector.completeURL(frameOwnerCandidate.documentURL, hrefValue);
                if (result)
                    return result;
                break;
            }
        }

        // documentURL not found or has bad value
        for (var url in WebInspector.resourceURLMap) {
            var match = url.match(WebInspector.URLRegExp);
            if (match && match[4] === hrefValue)
                return url;
        }
        return hrefValue;
    },

    _attributeHTML: function(name, value, node, linkify)
    {
        var hasText = (value.length > 0);
        var html = "<span class=\"webkit-html-attribute\"><span class=\"webkit-html-attribute-name\">" + name.escapeHTML() + "</span>";

        if (hasText)
            html += "=&#8203;\"";

        if (linkify && (name === "src" || name === "href")) {
            value = value.replace(/([\/;:\)\]\}])/g, "$1\u200B");
            html += linkify(this._rewriteAttrHref(node, value), value, "webkit-html-attribute-value", node.nodeName.toLowerCase() === "a");
        } else {
            value = value.escapeHTML().replace(/([\/;:\)\]\}])/g, "$1&#8203;");
            html += "<span class=\"webkit-html-attribute-value\">" + value + "</span>";
        }

        if (hasText)
            html += "\"";

        html += "</span>";
        return html;
    },

    _tagHTML: function(tagName, isClosingTag, isDistinctTreeElement, linkify)
    {
        var node = this.representedObject;
        var result = "<span class=\"webkit-html-tag" + (isClosingTag && isDistinctTreeElement ? " close" : "")  + "\">&lt;";
        result += "<span " + (isClosingTag ? "" : "class=\"webkit-html-tag-name\"") + ">" + (isClosingTag ? "/" : "") + tagName + "</span>";
        if (!isClosingTag && node.hasAttributes()) {
            for (var i = 0; i < node.attributes.length; ++i) {
                var attr = node.attributes[i];
                result += " " + this._attributeHTML(attr.name, attr.value, node, linkify);
            }
        }
        result += "&gt;</span>&#8203;";

        return result;
    },

    _nodeTitleInfo: function(linkify)
    {
        var node = this.representedObject;
        var info = {title: "", hasChildren: this.hasChildren};

        switch (node.nodeType) {
            case Node.DOCUMENT_NODE:
                info.title = "Document";
                break;

            case Node.DOCUMENT_FRAGMENT_NODE:
                info.title = "Document Fragment";
                break;

            case Node.ELEMENT_NODE:
                var tagName = this.treeOutline.nodeNameToCorrectCase(node.nodeName).escapeHTML();
                if (this._elementCloseTag) {
                    info.title = this._tagHTML(tagName, true, true);
                    info.hasChildren = false;
                    break;
                }

                info.title = this._tagHTML(tagName, false, false, linkify);

                var textChild = onlyTextChild.call(node);
                var showInlineText = textChild && textChild.textContent.length < Preferences.maxInlineTextChildLength;

                if (!this.expanded && (!showInlineText && (this.treeOutline.isXMLMimeType || !WebInspector.ElementsTreeElement.ForbiddenClosingTagElements[tagName]))) {
                    if (this.hasChildren)
                        info.title += "<span class=\"webkit-html-text-node\">&#8230;</span>&#8203;";
                    info.title += this._tagHTML(tagName, true, false);
                }

                // If this element only has a single child that is a text node,
                // just show that text and the closing tag inline rather than
                // create a subtree for them
                if (showInlineText) {
                    info.title += "<span class=\"webkit-html-text-node\">" + textChild.nodeValue.escapeHTML() + "</span>&#8203;" + this._tagHTML(tagName, true, false);
                    info.hasChildren = false;
                }
                break;

            case Node.TEXT_NODE:
                if (isNodeWhitespace.call(node))
                    info.title = "(whitespace)";
                else {
                    if (node.parentNode && node.parentNode.nodeName.toLowerCase() === "script") {
                        var newNode = document.createElement("span");
                        newNode.textContent = node.textContent;

                        var javascriptSyntaxHighlighter = new WebInspector.DOMSyntaxHighlighter("text/javascript");
                        javascriptSyntaxHighlighter.syntaxHighlightNode(newNode);

                        info.title = "<span class=\"webkit-html-text-node webkit-html-js-node\">" + newNode.innerHTML.replace(/^[\n\r]*/, "").replace(/\s*$/, "") + "</span>";
                    } else if (node.parentNode && node.parentNode.nodeName.toLowerCase() === "style") {
                        var newNode = document.createElement("span");
                        newNode.textContent = node.textContent;

                        var cssSyntaxHighlighter = new WebInspector.DOMSyntaxHighlighter("text/css");
                        cssSyntaxHighlighter.syntaxHighlightNode(newNode);

                        info.title = "<span class=\"webkit-html-text-node webkit-html-css-node\">" + newNode.innerHTML.replace(/^[\n\r]*/, "").replace(/\s*$/, "") + "</span>";
                    } else {
                        info.title = "\"<span class=\"webkit-html-text-node\">" + node.nodeValue.escapeHTML() + "</span>\"";
                    }
                }
                break;

            case Node.COMMENT_NODE:
                info.title = "<span class=\"webkit-html-comment\">&lt;!--" + node.nodeValue.escapeHTML() + "--&gt;</span>";
                break;

            case Node.DOCUMENT_TYPE_NODE:
                info.title = "<span class=\"webkit-html-doctype\">&lt;!DOCTYPE " + node.nodeName;
                if (node.publicId) {
                    info.title += " PUBLIC \"" + node.publicId + "\"";
                    if (node.systemId)
                        info.title += " \"" + node.systemId + "\"";
                } else if (node.systemId)
                    info.title += " SYSTEM \"" + node.systemId + "\"";
                if (node.internalSubset)
                    info.title += " [" + node.internalSubset + "]";
                info.title += "&gt;</span>";
                break;
            default:
                info.title = this.treeOutline.nodeNameToCorrectCase(node.nodeName).collapseWhitespace().escapeHTML();
        }

        return info;
    },

    _showInlineText: function(node)
    {
        if (node.nodeType === Node.ELEMENT_NODE) {
            var textChild = onlyTextChild.call(node);
            if (textChild && textChild.textContent.length < Preferences.maxInlineTextChildLength)
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
        function removeNodeCallback(removedNodeId)
        {
            // -1 is an error code, which means removing the node from the DOM failed,
            // so we shouldn't remove it from the tree.
            if (removedNodeId === -1)
                return;

            parentElement.removeChild(self);
            parentElement.adjustCollapsedRange(true);
        }

        var callId = WebInspector.Callback.wrap(removeNodeCallback);
        InspectorBackend.removeNode(callId, this.representedObject.id);
    },

    _editAsHTML: function()
    {
        var treeOutline = this.treeOutline;
        var node = this.representedObject;
        var wasExpanded = this.expanded;

        function selectNode(nodeId)
        {
            if (!nodeId)
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
            var setCallId = WebInspector.Callback.wrap(selectNode);
            InspectorBackend.setOuterHTML(setCallId, node.id, value);
        }

        var getCallId = WebInspector.Callback.wrap(this._startEditingAsHTML.bind(this, commitChange));
        InspectorBackend.getOuterHTML(getCallId, node.id);
    },

    _copyHTML: function()
    {
        InspectorBackend.copyNode(this.representedObject.id);
    },

    _highlightSearchResults: function()
    {
        if (!this._searchQuery)
            return;
        var text = this.listItemElement.textContent;
        var regexObject = createSearchRegex(this._searchQuery);

        var offset = 0;
        var match = regexObject.exec(text);
        while (match) {
            highlightSearchResult(this.listItemElement, offset + match.index, match[0].length);
            offset += match.index + 1;
            text = text.substring(match.index + 1);
            match = regexObject.exec(text);
        }
    }
}

WebInspector.ElementsTreeElement.prototype.__proto__ = TreeElement.prototype;
