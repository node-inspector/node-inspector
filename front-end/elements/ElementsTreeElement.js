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
 * @extends {TreeElement}
 * @param {!WebInspector.DOMNode} node
 * @param {boolean=} elementCloseTag
 */
WebInspector.ElementsTreeElement = function(node, elementCloseTag)
{
    // The title will be updated in onattach.
    TreeElement.call(this);
    this._node = node;

    this._gutterContainer = this.listItemElement.createChild("div", "gutter-container");
    this._decorationsElement = this._gutterContainer.createChild("div", "hidden");
    this._decorationsElement.addEventListener("mousedown", this._decorationsClicked.bind(this));

    this._elementCloseTag = elementCloseTag;

    if (this._node.nodeType() == Node.ELEMENT_NODE && !elementCloseTag)
        this._canAddAttributes = true;
    this._searchQuery = null;
    this._expandedChildrenLimit = WebInspector.ElementsTreeElement.InitialChildrenLimit;
    if (this._node.nodeType() === Node.ELEMENT_NODE && this._node.parentNode && this._node.parentNode.nodeType() === Node.DOCUMENT_NODE && !this._node.parentNode.parentNode)
        this.setCollapsible(false);
}

WebInspector.ElementsTreeElement.InitialChildrenLimit = 500;

// A union of HTML4 and HTML5-Draft elements that explicitly
// or implicitly (for HTML5) forbid the closing tag.
WebInspector.ElementsTreeElement.ForbiddenClosingTagElements = [
    "area", "base", "basefont", "br", "canvas", "col", "command", "embed", "frame",
    "hr", "img", "input", "keygen", "link", "menuitem", "meta", "param", "source", "track", "wbr"
].keySet();

// These tags we do not allow editing their tag name.
WebInspector.ElementsTreeElement.EditTagBlacklist = [
    "html", "head", "body"
].keySet();

/**
 * @param {!WebInspector.ElementsTreeElement} treeElement
 */
WebInspector.ElementsTreeElement.animateOnDOMUpdate = function(treeElement)
{
    var tagName = treeElement.listItemElement.querySelector(".webkit-html-tag-name");
    WebInspector.runCSSAnimationOnce(tagName || treeElement.listItemElement, "dom-update-highlight");
}

/**
 * @param {!WebInspector.DOMNode} node
 * @return {!Array<!WebInspector.DOMNode>}
 */
WebInspector.ElementsTreeElement.visibleShadowRoots = function(node)
{
    var roots = node.shadowRoots();
    if (roots.length && !WebInspector.moduleSetting("showUAShadowDOM").get())
        roots = roots.filter(filter);

    /**
     * @param {!WebInspector.DOMNode} root
     */
    function filter(root)
    {
        return root.shadowRootType() !== WebInspector.DOMNode.ShadowRootTypes.UserAgent;
    }
    return roots;
}

/**
 * @param {!WebInspector.DOMNode} node
 * @return {boolean}
 */
WebInspector.ElementsTreeElement.canShowInlineText = function(node)
{
    if (node.importedDocument() || node.templateContent() || WebInspector.ElementsTreeElement.visibleShadowRoots(node).length || node.hasPseudoElements())
        return false;
    if (node.nodeType() !== Node.ELEMENT_NODE)
        return false;
    if (!node.firstChild || node.firstChild !== node.lastChild || node.firstChild.nodeType() !== Node.TEXT_NODE)
        return false;
    var textChild = node.firstChild;
    var maxInlineTextChildLength = 80;
    if (textChild.nodeValue().length < maxInlineTextChildLength)
        return true;
    return false;
}

/**
 * @param {!WebInspector.ContextSubMenuItem} subMenu
 * @param {!WebInspector.DOMNode} node
 */
WebInspector.ElementsTreeElement.populateForcedPseudoStateItems = function(subMenu, node)
{
    const pseudoClasses = ["active", "hover", "focus", "visited"];
    var forcedPseudoState = WebInspector.CSSStyleModel.fromNode(node).pseudoState(node);
    for (var i = 0; i < pseudoClasses.length; ++i) {
        var pseudoClassForced = forcedPseudoState.indexOf(pseudoClasses[i]) >= 0;
        subMenu.appendCheckboxItem(":" + pseudoClasses[i], setPseudoStateCallback.bind(null, pseudoClasses[i], !pseudoClassForced), pseudoClassForced, false);
    }

    /**
     * @param {string} pseudoState
     * @param {boolean} enabled
     */
    function setPseudoStateCallback(pseudoState, enabled)
    {
        WebInspector.CSSStyleModel.fromNode(node).forcePseudoState(node, pseudoState, enabled);
    }
}

WebInspector.ElementsTreeElement.prototype = {
    /**
     * @return {boolean}
     */
    isClosingTag: function()
    {
        return !!this._elementCloseTag;
    },

    /**
     * @return {!WebInspector.DOMNode}
     */
    node: function()
    {
        return this._node;
    },

    /**
     * @return {boolean}
     */
    isEditing: function()
    {
        return !!this._editing;
    },

    /**
     * @return {!Element}
     */
    gutterElement: function()
    {
        return this._gutterContainer;
    },

    _decorationsClicked: function()
    {
        this.treeOutline.dispatchEventToListeners(WebInspector.ElementsTreeOutline.Events.DecorationsClicked, this._node);
    },

    /**
     * @param {string} searchQuery
     */
    highlightSearchResults: function(searchQuery)
    {
        if (this._searchQuery !== searchQuery)
            this._hideSearchHighlight();

        this._searchQuery = searchQuery;
        this._searchHighlightsVisible = true;
        this.updateTitle(null, true);
    },

    hideSearchHighlights: function()
    {
        delete this._searchHighlightsVisible;
        this._hideSearchHighlight();
    },

    _hideSearchHighlight: function()
    {
        if (!this._highlightResult)
            return;

        function updateEntryHide(entry)
        {
            switch (entry.type) {
                case "added":
                    entry.node.remove();
                    break;
                case "changed":
                    entry.node.textContent = entry.oldText;
                    break;
            }
        }

        for (var i = (this._highlightResult.length - 1); i >= 0; --i)
            updateEntryHide(this._highlightResult[i]);

        delete this._highlightResult;
    },

    /**
     * @param {boolean} inClipboard
     */
    setInClipboard: function(inClipboard)
    {
        if (this._inClipboard === inClipboard)
            return;
        this._inClipboard = inClipboard;
        this.listItemElement.classList.toggle("in-clipboard", inClipboard);
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
                this.listItemElement.classList.add("hovered");
            } else {
                this.listItemElement.classList.remove("hovered");
            }
        }
    },

    /**
     * @return {number}
     */
    expandedChildrenLimit: function()
    {
        return this._expandedChildrenLimit;
    },

    /**
     * @param {number} expandedChildrenLimit
     */
    setExpandedChildrenLimit: function(expandedChildrenLimit)
    {
        this._expandedChildrenLimit = expandedChildrenLimit;
    },

    updateSelection: function()
    {
        var listItemElement = this.listItemElement;
        if (!listItemElement)
            return;

        if (!this.selectionElement) {
            this.selectionElement = createElement("div");
            this.selectionElement.className = "selection selected";
            listItemElement.insertBefore(this.selectionElement, listItemElement.firstChild);
        }

        this.selectionElement.style.height = listItemElement.offsetHeight + "px";
    },

    /**
     * @override
     */
    onbind: function()
    {
        if (!this._elementCloseTag)
            this._node[this.treeOutline.treeElementSymbol()] = this;
    },

    /**
     * @override
     */
    onunbind: function()
    {
        if (this._node[this.treeOutline.treeElementSymbol()] === this)
            this._node[this.treeOutline.treeElementSymbol()] = null;
    },

    /**
     * @override
     */
    onattach: function()
    {
        if (this._hovered) {
            this.updateSelection();
            this.listItemElement.classList.add("hovered");
        }

        this.updateTitle();
        this._preventFollowingLinksOnDoubleClick();
        this.listItemElement.draggable = true;
    },

    _preventFollowingLinksOnDoubleClick: function()
    {
        var links = this.listItemElement.querySelectorAll("li .webkit-html-tag > .webkit-html-attribute > .webkit-html-external-link, li .webkit-html-tag > .webkit-html-attribute > .webkit-html-resource-link");
        if (!links)
            return;

        for (var i = 0; i < links.length; ++i)
            links[i].preventFollowOnDoubleClick = true;
    },

    onpopulate: function()
    {
        this.populated = true;
        this.treeOutline.populateTreeElement(this);
    },

    expandRecursively: function()
    {
        /**
         * @this {WebInspector.ElementsTreeElement}
         */
        function callback()
        {
            TreeElement.prototype.expandRecursively.call(this, Number.MAX_VALUE);
        }

        this._node.getSubtree(-1, callback.bind(this));
    },

    /**
     * @override
     */
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

    /**
     * @override
     */
    onreveal: function()
    {
        if (this.listItemElement) {
            var tagSpans = this.listItemElement.getElementsByClassName("webkit-html-tag-name");
            if (tagSpans.length)
                tagSpans[0].scrollIntoViewIfNeeded(true);
            else
                this.listItemElement.scrollIntoViewIfNeeded(true);
        }
    },

    /**
     * @override
     * @param {boolean=} omitFocus
     * @param {boolean=} selectedByUser
     * @return {boolean}
     */
    select: function(omitFocus, selectedByUser)
    {
        if (this._editing)
            return false;
        if (selectedByUser && this.treeOutline.handlePickNode(this.title, this._node))
            return true;
        return TreeElement.prototype.select.call(this, omitFocus, selectedByUser);
    },

    /**
     * @override
     * @param {boolean=} selectedByUser
     * @return {boolean}
     */
    onselect: function(selectedByUser)
    {
        this.treeOutline.suppressRevealAndSelect = true;
        this.treeOutline.selectDOMNode(this._node, selectedByUser);
        if (selectedByUser)
            this._node.highlight();
        this.updateSelection();
        this.treeOutline.suppressRevealAndSelect = false;
        return true;
    },

    /**
     * @override
     * @return {boolean}
     */
    ondelete: function()
    {
        var startTagTreeElement = this.treeOutline.findTreeElement(this._node);
        startTagTreeElement ? startTagTreeElement.remove() : this.remove();
        return true;
    },

    /**
     * @override
     * @return {boolean}
     */
    onenter: function()
    {
        // On Enter or Return start editing the first attribute
        // or create a new attribute on the selected element.
        if (this._editing)
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

        // Prevent selecting the nearest word on double click.
        if (event.detail >= 2)
            event.preventDefault();
    },

    /**
     * @override
     * @return {boolean}
     */
    ondblclick: function(event)
    {
        if (this._editing || this._elementCloseTag)
            return false;

        if (this._startEditingTarget(/** @type {!Element} */(event.target)))
            return false;

        if (this.isExpandable() && !this.expanded)
            this.expand();
        return false;
    },

    /**
     * @return {boolean}
     */
    hasEditableNode: function()
    {
        return !this._node.isShadowRoot() && !this._node.ancestorUserAgentShadowRoot();
    },

    _insertInLastAttributePosition: function(tag, node)
    {
        if (tag.getElementsByClassName("webkit-html-attribute").length > 0)
            tag.insertBefore(node, tag.lastChild);
        else {
            var nodeName = tag.textContent.match(/^<(.*?)>$/)[1];
            tag.textContent = '';
            tag.createTextChild('<' + nodeName);
            tag.appendChild(node);
            tag.createTextChild('>');
        }

        this.updateSelection();
    },

    /**
     * @param {!Element} eventTarget
     * @return {boolean}
     */
    _startEditingTarget: function(eventTarget)
    {
        if (this.treeOutline.selectedDOMNode() != this._node)
            return false;

        if (this._node.nodeType() != Node.ELEMENT_NODE && this._node.nodeType() != Node.TEXT_NODE)
            return false;

        if (this.treeOutline.pickNodeMode())
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

    /**
     * @param {!WebInspector.ContextMenu} contextMenu
     * @param {!Event} event
     */
    populateTagContextMenu: function(contextMenu, event)
    {
        // Add attribute-related actions.
        var treeElement = this._elementCloseTag ? this.treeOutline.findTreeElement(this._node) : this;
        contextMenu.appendItem(WebInspector.UIString.capitalize("Add ^attribute"), treeElement._addNewAttribute.bind(treeElement));

        var attribute = event.target.enclosingNodeOrSelfWithClass("webkit-html-attribute");
        var newAttribute = event.target.enclosingNodeOrSelfWithClass("add-attribute");
        if (attribute && !newAttribute)
            contextMenu.appendItem(WebInspector.UIString.capitalize("Edit ^attribute"), this._startEditingAttribute.bind(this, attribute, event.target));
        contextMenu.appendSeparator();
        var pseudoSubMenu = contextMenu.appendSubMenuItem(WebInspector.UIString.capitalize("Force ^element ^state"));
        WebInspector.ElementsTreeElement.populateForcedPseudoStateItems(pseudoSubMenu, treeElement.node());
        contextMenu.appendSeparator();
        this.populateNodeContextMenu(contextMenu);
        this.populateScrollIntoView(contextMenu);
    },

    /**
     * @param {!WebInspector.ContextMenu} contextMenu
     */
    populateScrollIntoView: function(contextMenu)
    {
        contextMenu.appendSeparator();
        contextMenu.appendItem(WebInspector.UIString.capitalize("Scroll into ^view"), this._scrollIntoView.bind(this));
    },

    populateTextContextMenu: function(contextMenu, textNode)
    {
        if (!this._editing)
            contextMenu.appendItem(WebInspector.UIString.capitalize("Edit ^text"), this._startEditingTextNode.bind(this, textNode));
        this.populateNodeContextMenu(contextMenu);
    },

    populateNodeContextMenu: function(contextMenu)
    {
        // Add free-form node-related actions.
        var openTagElement = this._node[this.treeOutline.treeElementSymbol()] || this;
        var isEditable = this.hasEditableNode();
        if (isEditable && !this._editing)
            contextMenu.appendItem(WebInspector.UIString("Edit as HTML"), openTagElement.toggleEditAsHTML.bind(openTagElement));
        var isShadowRoot = this._node.isShadowRoot();

        // Place it here so that all "Copy"-ing items stick together.
        if (this._node.nodeType() === Node.ELEMENT_NODE)
            contextMenu.appendItem(WebInspector.UIString.capitalize("Copy CSS ^path"), this._copyCSSPath.bind(this));
        if (!isShadowRoot)
            contextMenu.appendItem(WebInspector.UIString("Copy XPath"), this._copyXPath.bind(this));
        if (!isShadowRoot) {
            var treeOutline = this.treeOutline;
            contextMenu.appendSeparator();
            contextMenu.appendItem(WebInspector.UIString("Cut"), treeOutline.performCopyOrCut.bind(treeOutline, true, this._node), !this.hasEditableNode());
            contextMenu.appendItem(WebInspector.UIString("Copy"), treeOutline.performCopyOrCut.bind(treeOutline, false, this._node));
            contextMenu.appendItem(WebInspector.UIString("Paste"), treeOutline.pasteNode.bind(treeOutline, this._node), !treeOutline.canPaste(this._node));
        }

        if (isEditable)
            contextMenu.appendItem(WebInspector.UIString("Delete"), this.remove.bind(this));
        contextMenu.appendSeparator();
    },

    _startEditing: function()
    {
        if (this.treeOutline.selectedDOMNode() !== this._node)
            return;

        var listItem = this._listItemNode;

        if (this._canAddAttributes) {
            var attribute = listItem.getElementsByClassName("webkit-html-attribute")[0];
            if (attribute)
                return this._startEditingAttribute(attribute, attribute.getElementsByClassName("webkit-html-attribute-value")[0]);

            return this._addNewAttribute();
        }

        if (this._node.nodeType() === Node.TEXT_NODE) {
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
        var container = createElement("span");
        this._buildAttributeDOM(container, " ", "", null);
        var attr = container.firstElementChild;
        attr.style.marginLeft = "2px"; // overrides the .editing margin rule
        attr.style.marginRight = "2px"; // overrides the .editing margin rule

        var tag = this.listItemElement.getElementsByClassName("webkit-html-tag")[0];
        this._insertInLastAttributePosition(tag, attr);
        attr.scrollIntoViewIfNeeded(true);
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

                    if (elem.classList.contains("webkit-html-attribute-value"))
                        return this._startEditingAttribute(elem.parentNode, elem);
                }
            }
        }
    },

    _startEditingAttribute: function(attribute, elementForSelection)
    {
        console.assert(this.listItemElement.isAncestor(attribute));

        if (WebInspector.isBeingEdited(attribute))
            return true;

        var attributeNameElement = attribute.getElementsByClassName("webkit-html-attribute-name")[0];
        if (!attributeNameElement)
            return false;

        var attributeName = attributeNameElement.textContent;
        var attributeValueElement = attribute.getElementsByClassName("webkit-html-attribute-value")[0];

        // Make sure elementForSelection is not a child of attributeValueElement.
        elementForSelection = attributeValueElement.isAncestor(elementForSelection) ? attributeValueElement : elementForSelection;

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

        var attributeValue = attributeName && attributeValueElement ? this._node.getAttribute(attributeName) : undefined;
        if (attributeValue !== undefined)
            attributeValueElement.setTextContentTruncatedIfNeeded(attributeValue, WebInspector.UIString("<value is too large to edit>"));

        // Remove zero-width spaces that were added by nodeTitleInfo.
        removeZeroWidthSpaceRecursive(attribute);

        var config = new WebInspector.InplaceEditor.Config(this._attributeEditingCommitted.bind(this), this._editingCancelled.bind(this), attributeName);

        /**
         * @param {!Event} event
         * @return {string}
         */
        function postKeyDownFinishHandler(event)
        {
            WebInspector.handleElementValueModifications(event, attribute);
            return "";
        }
        config.setPostKeydownFinishHandler(postKeyDownFinishHandler);

        this._editing = WebInspector.InplaceEditor.startEditing(attribute, config);

        this.listItemElement.getComponentSelection().setBaseAndExtent(elementForSelection, 0, elementForSelection, 1);

        return true;
    },

    /**
     * @param {!Element} textNodeElement
     */
    _startEditingTextNode: function(textNodeElement)
    {
        if (WebInspector.isBeingEdited(textNodeElement))
            return true;

        var textNode = this._node;
        // We only show text nodes inline in elements if the element only
        // has a single child, and that child is a text node.
        if (textNode.nodeType() === Node.ELEMENT_NODE && textNode.firstChild)
            textNode = textNode.firstChild;

        var container = textNodeElement.enclosingNodeOrSelfWithClass("webkit-html-text-node");
        if (container)
            container.textContent = textNode.nodeValue(); // Strip the CSS or JS highlighting if present.
        var config = new WebInspector.InplaceEditor.Config(this._textNodeEditingCommitted.bind(this, textNode), this._editingCancelled.bind(this));
        this._editing = WebInspector.InplaceEditor.startEditing(textNodeElement, config);
        this.listItemElement.getComponentSelection().setBaseAndExtent(textNodeElement, 0, textNodeElement, 1);

        return true;
    },

    /**
     * @param {!Element=} tagNameElement
     */
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

        /**
         * @param {!Event} event
         */
        function keyupListener(event)
        {
            if (closingTagElement)
                closingTagElement.textContent = "</" + tagNameElement.textContent + ">";
        }

        /**
         * @param {!Element} element
         * @param {string} newTagName
         * @this {WebInspector.ElementsTreeElement}
         */
        function editingComitted(element, newTagName)
        {
            tagNameElement.removeEventListener('keyup', keyupListener, false);
            this._tagNameEditingCommitted.apply(this, arguments);
        }

        /**
         * @this {WebInspector.ElementsTreeElement}
         */
        function editingCancelled()
        {
            tagNameElement.removeEventListener('keyup', keyupListener, false);
            this._editingCancelled.apply(this, arguments);
        }

        tagNameElement.addEventListener('keyup', keyupListener, false);

        var config = new WebInspector.InplaceEditor.Config(editingComitted.bind(this), editingCancelled.bind(this), tagName);
        this._editing = WebInspector.InplaceEditor.startEditing(tagNameElement, config);
        this.listItemElement.getComponentSelection().setBaseAndExtent(tagNameElement, 0, tagNameElement, 1);
        return true;
    },

    /**
     * @param {function(string, string)} commitCallback
     * @param {function()} disposeCallback
     * @param {?Protocol.Error} error
     * @param {string} initialValue
     */
    _startEditingAsHTML: function(commitCallback, disposeCallback, error, initialValue)
    {
        if (error)
            return;
        if (this._editing)
            return;

        function consume(event)
        {
            if (event.eventPhase === Event.AT_TARGET)
                event.consume(true);
        }

        initialValue = this._convertWhitespaceToEntities(initialValue).text;

        this._htmlEditElement = createElement("div");
        this._htmlEditElement.className = "source-code elements-tree-editor";

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
        this.treeOutline.element.addEventListener("mousedown", consume, false);

        this.updateSelection();

        /**
         * @param {!Element} element
         * @param {string} newValue
         * @this {WebInspector.ElementsTreeElement}
         */
        function commit(element, newValue)
        {
            commitCallback(initialValue, newValue);
            dispose.call(this);
        }

        /**
         * @this {WebInspector.ElementsTreeElement}
         */
        function dispose()
        {
            disposeCallback();
            delete this._editing;
            this.treeOutline.setMultilineEditing(null);

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

            this.treeOutline.element.removeEventListener("mousedown", consume, false);
            this.updateSelection();
            this.treeOutline.focus();
        }

        var config = new WebInspector.InplaceEditor.Config(commit.bind(this), dispose.bind(this));
        config.setMultilineOptions(initialValue, { name: "xml", htmlMode: true }, "web-inspector-html", WebInspector.moduleSetting("domWordWrap").get(), true);
        WebInspector.InplaceEditor.startMultilineEditing(this._htmlEditElement, config).then(markAsBeingEdited.bind(this));

        /**
         * @param {!Object} controller
         * @this {WebInspector.ElementsTreeElement}
         */
        function markAsBeingEdited(controller)
        {
            this._editing = /** @type {!WebInspector.InplaceEditor.Controller} */ (controller);
            this._editing.setWidth(this.treeOutline.visibleWidth());
            this.treeOutline.setMultilineEditing(this._editing);
        }
    },

    _attributeEditingCommitted: function(element, newText, oldText, attributeName, moveDirection)
    {
        delete this._editing;

        var treeOutline = this.treeOutline;

        /**
         * @param {?Protocol.Error=} error
         * @this {WebInspector.ElementsTreeElement}
         */
        function moveToNextAttributeIfNeeded(error)
        {
            if (error)
                this._editingCancelled(element, attributeName);

            if (!moveDirection)
                return;

            treeOutline.runPendingUpdates();

            // Search for the attribute's position, and then decide where to move to.
            var attributes = this._node.attributes();
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


        if ((attributeName.trim() || newText.trim()) && oldText !== newText) {
            this._node.setAttribute(attributeName, newText, moveToNextAttributeIfNeeded.bind(this));
            return;
        }

        this.updateTitle();
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

        /**
         * @this {WebInspector.ElementsTreeElement}
         */
        function moveToNextAttributeIfNeeded()
        {
            if (moveDirection !== "forward") {
                this._addNewAttribute();
                return;
            }

            var attributes = this._node.attributes();
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
            var newTreeItem = treeOutline.selectNodeAfterEdit(wasExpanded, error, nodeId);
            moveToNextAttributeIfNeeded.call(newTreeItem);
        }
        this._node.setNodeName(newText, changeTagNameCallback);
    },

    /**
     * @param {!WebInspector.DOMNode} textNode
     * @param {!Element} element
     * @param {string} newText
     */
    _textNodeEditingCommitted: function(textNode, element, newText)
    {
        delete this._editing;

        /**
         * @this {WebInspector.ElementsTreeElement}
         */
        function callback()
        {
            this.updateTitle();
        }
        textNode.setNodeValue(newText, callback.bind(this));
    },

    /**
     * @param {!Element} element
     * @param {*} context
     */
    _editingCancelled: function(element, context)
    {
        delete this._editing;

        // Need to restore attributes structure.
        this.updateTitle();
    },

    /**
     * @return {!Element}
     */
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

    /**
     * @param {?WebInspector.ElementsTreeOutline.UpdateRecord=} updateRecord
     * @param {boolean=} onlySearchQueryChanged
     */
    updateTitle: function(updateRecord, onlySearchQueryChanged)
    {
        // If we are editing, return early to prevent canceling the edit.
        // After editing is committed updateTitle will be called.
        if (this._editing)
            return;

        if (onlySearchQueryChanged) {
            this._hideSearchHighlight();
        } else {
            var nodeInfo = this._nodeTitleInfo(updateRecord || null);
            if (this._node.nodeType() === Node.DOCUMENT_FRAGMENT_NODE && this._node.isInShadowTree() && this._node.shadowRootType()) {
                this.childrenListElement.classList.add("shadow-root");
                var depth = 4;
                for (var node = this._node; depth && node; node = node.parentNode) {
                    if (node.nodeType() === Node.DOCUMENT_FRAGMENT_NODE)
                        depth--;
                }
                if (!depth)
                    this.childrenListElement.classList.add("shadow-root-deep");
                else
                    this.childrenListElement.classList.add("shadow-root-depth-" + depth);
            }
            var highlightElement = createElement("span");
            highlightElement.className = "highlight";
            highlightElement.appendChild(nodeInfo);
            this.title = highlightElement;
            this.updateDecorations();
            this.listItemElement.insertBefore(this._gutterContainer, this.listItemElement.firstChild);
            delete this._highlightResult;
        }

        delete this.selectionElement;
        if (this.selected)
            this.updateSelection();
        this._preventFollowingLinksOnDoubleClick();
        this._highlightSearchResults();
    },

    updateDecorations: function()
    {
        if (this.isClosingTag())
            return;
        var node = this._node;
        if (node.nodeType() !== Node.ELEMENT_NODE)
            return;

        var extensions = runtime.extensions(WebInspector.DOMPresentationUtils.MarkerDecorator);
        var markerToExtension = new Map();
        for (var extension of extensions)
            markerToExtension.set(extension.descriptor()["marker"], extension);

        var promises = [];
        var decorations = [];
        var descendantDecorations = [];
        node.traverseMarkers(visitor);

        /**
         * @param {!WebInspector.DOMNode} n
         * @param {string} marker
         */
        function visitor(n, marker)
        {
            var extension = markerToExtension.get(marker);
            if (!extension)
                return;
            promises.push(extension.instancePromise().then(collectDecoration.bind(null, n)));
        }

        /**
         * @param {!WebInspector.DOMNode} n
         * @param {!WebInspector.DOMPresentationUtils.MarkerDecorator} decorator
         */
        function collectDecoration(n, decorator)
        {
            var decoration = decorator.decorate(n);
            if (!decoration)
                return;
            (n === node ? decorations : descendantDecorations).push(decoration);
        }

        Promise.all(promises).then(updateDecorationsUI.bind(this));

        /**
         * @this {WebInspector.ElementsTreeElement}
         */
        function updateDecorationsUI()
        {
            this._decorationsElement.removeChildren();
            this._decorationsElement.classList.add("hidden");
            if (!decorations.length && !descendantDecorations.length)
                return;

            var colors = new Set();
            var titles = createElement("div");

            for (var decoration of decorations) {
                var titleElement = titles.createChild("div");
                titleElement.textContent = decoration.title;
                colors.add(decoration.color);
            }
            if (this.expanded && !decorations.length)
                return;

            var descendantColors = new Set();
            if (descendantDecorations.length) {
                var element = titles.createChild("div");
                element.textContent = WebInspector.UIString("Children:");
                for (var decoration of descendantDecorations) {
                    element = titles.createChild("div");
                    element.style.marginLeft = "15px";
                    element.textContent = decoration.title;
                    descendantColors.add(decoration.color);
                }
            }

            var offset = 0;
            processColors.call(this, colors, "elements-gutter-decoration");
            if (!this.expanded)
                processColors.call(this, descendantColors, "elements-gutter-decoration elements-has-decorated-children");
            WebInspector.Tooltip.install(this._decorationsElement, titles);

            this._gutterContainer.classList.toggle("has-decorations", this._decorationsElement.hasChildNodes());

            /**
             * @param {!Set<string>} colors
             * @param {string} className
             * @this {WebInspector.ElementsTreeElement}
             */
            function processColors(colors, className)
            {
                for (var color of colors) {
                    var child = this._decorationsElement.createChild("div", className);
                    this._decorationsElement.classList.remove("hidden");
                    child.style.backgroundColor = color;
                    child.style.borderColor = color;
                    if (offset)
                        child.style.marginLeft = offset + "px";
                    offset += 3;
                }
            }
        }
    },

    /**
     * @param {!Node} parentElement
     * @param {string} name
     * @param {string} value
     * @param {?WebInspector.ElementsTreeOutline.UpdateRecord} updateRecord
     * @param {boolean=} forceValue
     * @param {!WebInspector.DOMNode=} node
     */
    _buildAttributeDOM: function(parentElement, name, value, updateRecord, forceValue, node)
    {
        var closingPunctuationRegex = /[\/;:\)\]\}]/g;
        var highlightIndex = 0;
        var highlightCount;
        var additionalHighlightOffset = 0;
        var result;

        /**
         * @param {string} match
         * @param {number} replaceOffset
         * @return {string}
         */
        function replacer(match, replaceOffset) {
            while (highlightIndex < highlightCount && result.entityRanges[highlightIndex].offset < replaceOffset) {
                result.entityRanges[highlightIndex].offset += additionalHighlightOffset;
                ++highlightIndex;
            }
            additionalHighlightOffset += 1;
            return match + "\u200B";
        }

        /**
         * @param {!Element} element
         * @param {string} value
         * @this {WebInspector.ElementsTreeElement}
         */
        function setValueWithEntities(element, value)
        {
            result = this._convertWhitespaceToEntities(value);
            highlightCount = result.entityRanges.length;
            value = result.text.replace(closingPunctuationRegex, replacer);
            while (highlightIndex < highlightCount) {
                result.entityRanges[highlightIndex].offset += additionalHighlightOffset;
                ++highlightIndex;
            }
            element.setTextContentTruncatedIfNeeded(value);
            WebInspector.highlightRangesWithStyleClass(element, result.entityRanges, "webkit-html-entity-value");
        }

        var hasText = (forceValue || value.length > 0);
        var attrSpanElement = parentElement.createChild("span", "webkit-html-attribute");
        var attrNameElement = attrSpanElement.createChild("span", "webkit-html-attribute-name");
        attrNameElement.textContent = name;

        if (hasText)
            attrSpanElement.createTextChild("=\u200B\"");

        var attrValueElement = attrSpanElement.createChild("span", "webkit-html-attribute-value");

        if (updateRecord && updateRecord.isAttributeModified(name))
            WebInspector.runCSSAnimationOnce(hasText ? attrValueElement : attrNameElement, "dom-update-highlight");

        /**
         * @this {WebInspector.ElementsTreeElement}
         * @param {string} value
         * @return {!Element}
         */
        function linkifyValue(value)
        {
            var rewrittenHref = node.resolveURL(value);
            if (rewrittenHref === null) {
                var span = createElement("span");
                setValueWithEntities.call(this, span, value);
                return span;
            }
            value = value.replace(closingPunctuationRegex, "$&\u200B");
            if (value.startsWith("data:"))
                value = value.trimMiddle(60);
            var anchor = WebInspector.linkifyURLAsNode(rewrittenHref, value, "", node.nodeName().toLowerCase() === "a");
            anchor.preventFollow = true;
            return anchor;
        }

        if (node && name === "src" || name === "href") {
            attrValueElement.appendChild(linkifyValue.call(this, value));
        } else if (node && node.nodeName().toLowerCase() === "img" && name === "srcset") {
            var sources = value.split(",");
            for (var i = 0; i < sources.length; ++i) {
                if (i > 0)
                    attrValueElement.createTextChild(", ");
                var source = sources[i].trim();
                var indexOfSpace = source.indexOf(" ");
                var url = source.substring(0, indexOfSpace);
                var tail = source.substring(indexOfSpace);
                attrValueElement.appendChild(linkifyValue.call(this, url));
                attrValueElement.createTextChild(tail);
            }
        } else {
            setValueWithEntities.call(this, attrValueElement, value);
        }

        if (hasText)
            attrSpanElement.createTextChild("\"");
    },

    /**
     * @param {!Node} parentElement
     * @param {string} pseudoElementName
     */
    _buildPseudoElementDOM: function(parentElement, pseudoElementName)
    {
        var pseudoElement = parentElement.createChild("span", "webkit-html-pseudo-element");
        pseudoElement.textContent = "::" + pseudoElementName;
        parentElement.createTextChild("\u200B");
    },

    /**
     * @param {!Node} parentElement
     * @param {string} tagName
     * @param {boolean} isClosingTag
     * @param {boolean} isDistinctTreeElement
     * @param {?WebInspector.ElementsTreeOutline.UpdateRecord} updateRecord
     */
    _buildTagDOM: function(parentElement, tagName, isClosingTag, isDistinctTreeElement, updateRecord)
    {
        var node = this._node;
        var classes = [ "webkit-html-tag" ];
        if (isClosingTag && isDistinctTreeElement)
            classes.push("close");
        var tagElement = parentElement.createChild("span", classes.join(" "));
        tagElement.createTextChild("<");
        var tagNameElement = tagElement.createChild("span", isClosingTag ? "webkit-html-close-tag-name" : "webkit-html-tag-name");
        tagNameElement.textContent = (isClosingTag ? "/" : "") + tagName;
        if (!isClosingTag) {
            if (node.hasAttributes()) {
                var attributes = node.attributes();
                for (var i = 0; i < attributes.length; ++i) {
                    var attr = attributes[i];
                    tagElement.createTextChild(" ");
                    this._buildAttributeDOM(tagElement, attr.name, attr.value, updateRecord, false, node);
                }
            }
            if (updateRecord) {
                var hasUpdates = updateRecord.hasRemovedAttributes() || updateRecord.hasRemovedChildren();
                hasUpdates |= !this.expanded && updateRecord.hasChangedChildren();
                if (hasUpdates)
                    WebInspector.runCSSAnimationOnce(tagNameElement, "dom-update-highlight");
            }
        }

        tagElement.createTextChild(">");
        parentElement.createTextChild("\u200B");
    },

    /**
     * @param {string} text
     * @return {!{text: string, entityRanges: !Array.<!WebInspector.SourceRange>}}
     */
    _convertWhitespaceToEntities: function(text)
    {
        var result = "";
        var lastIndexAfterEntity = 0;
        var entityRanges = [];
        var charToEntity = WebInspector.ElementsTreeOutline.MappedCharToEntity;
        for (var i = 0, size = text.length; i < size; ++i) {
            var char = text.charAt(i);
            if (charToEntity[char]) {
                result += text.substring(lastIndexAfterEntity, i);
                var entityValue = "&" + charToEntity[char] + ";";
                entityRanges.push({offset: result.length, length: entityValue.length});
                result += entityValue;
                lastIndexAfterEntity = i + 1;
            }
        }
        if (result)
            result += text.substring(lastIndexAfterEntity);
        return {text: result || text, entityRanges: entityRanges};
    },

    /**
     * @param {?WebInspector.ElementsTreeOutline.UpdateRecord} updateRecord
     * @return {!DocumentFragment} result
     */
    _nodeTitleInfo: function(updateRecord)
    {
        var node = this._node;
        var titleDOM = createDocumentFragment();

        switch (node.nodeType()) {
            case Node.ATTRIBUTE_NODE:
                this._buildAttributeDOM(titleDOM, /** @type {string} */ (node.name), /** @type {string} */ (node.value), updateRecord, true);
                break;

            case Node.ELEMENT_NODE:
                var pseudoType = node.pseudoType();
                if (pseudoType) {
                    this._buildPseudoElementDOM(titleDOM, pseudoType);
                    break;
                }

                var tagName = node.nodeNameInCorrectCase();
                if (this._elementCloseTag) {
                    this._buildTagDOM(titleDOM, tagName, true, true, updateRecord);
                    break;
                }

                this._buildTagDOM(titleDOM, tagName, false, false, updateRecord);

                if (this.isExpandable()) {
                    if (!this.expanded) {
                        var textNodeElement = titleDOM.createChild("span", "webkit-html-text-node bogus");
                        textNodeElement.textContent = "\u2026";
                        titleDOM.createTextChild("\u200B");
                        this._buildTagDOM(titleDOM, tagName, true, false, updateRecord);
                    }
                    break;
                }

                if (WebInspector.ElementsTreeElement.canShowInlineText(node)) {
                    var textNodeElement = titleDOM.createChild("span", "webkit-html-text-node");
                    var result = this._convertWhitespaceToEntities(node.firstChild.nodeValue());
                    textNodeElement.textContent = result.text;
                    WebInspector.highlightRangesWithStyleClass(textNodeElement, result.entityRanges, "webkit-html-entity-value");
                    titleDOM.createTextChild("\u200B");
                    this._buildTagDOM(titleDOM, tagName, true, false, updateRecord);
                    if (updateRecord && updateRecord.hasChangedChildren())
                        WebInspector.runCSSAnimationOnce(textNodeElement, "dom-update-highlight");
                    if (updateRecord && updateRecord.isCharDataModified())
                        WebInspector.runCSSAnimationOnce(textNodeElement, "dom-update-highlight");
                    break;
                }

                if (this.treeOutline.isXMLMimeType || !WebInspector.ElementsTreeElement.ForbiddenClosingTagElements[tagName])
                    this._buildTagDOM(titleDOM, tagName, true, false, updateRecord);
                break;

            case Node.TEXT_NODE:
                if (node.parentNode && node.parentNode.nodeName().toLowerCase() === "script") {
                    var newNode = titleDOM.createChild("span", "webkit-html-text-node webkit-html-js-node");
                    newNode.textContent = node.nodeValue();

                    var javascriptSyntaxHighlighter = new WebInspector.DOMSyntaxHighlighter("text/javascript", true);
                    javascriptSyntaxHighlighter.syntaxHighlightNode(newNode).then(updateSearchHighlight.bind(this));
                } else if (node.parentNode && node.parentNode.nodeName().toLowerCase() === "style") {
                    var newNode = titleDOM.createChild("span", "webkit-html-text-node webkit-html-css-node");
                    newNode.textContent = node.nodeValue();

                    var cssSyntaxHighlighter = new WebInspector.DOMSyntaxHighlighter("text/css", true);
                    cssSyntaxHighlighter.syntaxHighlightNode(newNode).then(updateSearchHighlight.bind(this));
                } else {
                    titleDOM.createTextChild("\"");
                    var textNodeElement = titleDOM.createChild("span", "webkit-html-text-node");
                    var result = this._convertWhitespaceToEntities(node.nodeValue());
                    textNodeElement.textContent = result.text;
                    WebInspector.highlightRangesWithStyleClass(textNodeElement, result.entityRanges, "webkit-html-entity-value");
                    titleDOM.createTextChild("\"");
                    if (updateRecord && updateRecord.isCharDataModified())
                        WebInspector.runCSSAnimationOnce(textNodeElement, "dom-update-highlight");
                }
                break;

            case Node.COMMENT_NODE:
                var commentElement = titleDOM.createChild("span", "webkit-html-comment");
                commentElement.createTextChild("<!--" + node.nodeValue() + "-->");
                break;

            case Node.DOCUMENT_TYPE_NODE:
                var docTypeElement = titleDOM.createChild("span", "webkit-html-doctype");
                docTypeElement.createTextChild("<!DOCTYPE " + node.nodeName());
                if (node.publicId) {
                    docTypeElement.createTextChild(" PUBLIC \"" + node.publicId + "\"");
                    if (node.systemId)
                        docTypeElement.createTextChild(" \"" + node.systemId + "\"");
                } else if (node.systemId)
                    docTypeElement.createTextChild(" SYSTEM \"" + node.systemId + "\"");

                if (node.internalSubset)
                    docTypeElement.createTextChild(" [" + node.internalSubset + "]");

                docTypeElement.createTextChild(">");
                break;

            case Node.CDATA_SECTION_NODE:
                var cdataElement = titleDOM.createChild("span", "webkit-html-text-node");
                cdataElement.createTextChild("<![CDATA[" + node.nodeValue() + "]]>");
                break;

            case Node.DOCUMENT_FRAGMENT_NODE:
                var fragmentElement = titleDOM.createChild("span", "webkit-html-fragment");
                fragmentElement.textContent = node.nodeNameInCorrectCase().collapseWhitespace();
                break;
            default:
                titleDOM.createTextChild(node.nodeNameInCorrectCase().collapseWhitespace());
        }

        /**
         * @this {WebInspector.ElementsTreeElement}
         */
        function updateSearchHighlight()
        {
            delete this._highlightResult;
            this._highlightSearchResults();
        }

        return titleDOM;
    },

    remove: function()
    {
        if (this._node.pseudoType())
            return;
        var parentElement = this.parent;
        if (!parentElement)
            return;

        if (!this._node.parentNode || this._node.parentNode.nodeType() === Node.DOCUMENT_NODE)
            return;
        this._node.removeNode();
    },

    /**
     * @param {function(boolean)=} callback
     * @param {boolean=} startEditing
     */
    toggleEditAsHTML: function(callback, startEditing)
    {
        if (this._editing && this._htmlEditElement && WebInspector.isBeingEdited(this._htmlEditElement)) {
            this._editing.commit();
            return;
        }

        if (startEditing === false)
            return;

        /**
         * @param {?Protocol.Error} error
         */
        function selectNode(error)
        {
            if (callback)
                callback(!error);
        }

        /**
         * @param {string} initialValue
         * @param {string} value
         */
        function commitChange(initialValue, value)
        {
            if (initialValue !== value)
                node.setOuterHTML(value, selectNode);
        }

        function disposeCallback()
        {
            if (callback)
                callback(false);
        }

        var node = this._node;
        node.getOuterHTML(this._startEditingAsHTML.bind(this, commitChange, disposeCallback));
    },

    _copyCSSPath: function()
    {
        InspectorFrontendHost.copyText(WebInspector.DOMPresentationUtils.cssPath(this._node, true));
    },

    _copyXPath: function()
    {
        InspectorFrontendHost.copyText(WebInspector.DOMPresentationUtils.xPath(this._node, true));
    },

    _highlightSearchResults: function()
    {
        if (!this._searchQuery || !this._searchHighlightsVisible)
            return;
        this._hideSearchHighlight();

        var text = this.listItemElement.textContent;
        var regexObject = createPlainTextSearchRegex(this._searchQuery, "gi");

        var match = regexObject.exec(text);
        var matchRanges = [];
        while (match) {
            matchRanges.push(new WebInspector.SourceRange(match.index, match[0].length));
            match = regexObject.exec(text);
        }

        // Fall back for XPath, etc. matches.
        if (!matchRanges.length)
            matchRanges.push(new WebInspector.SourceRange(0, text.length));

        this._highlightResult = [];
        WebInspector.highlightSearchResults(this.listItemElement, matchRanges, this._highlightResult);
    },

    _scrollIntoView: function()
    {
        function scrollIntoViewCallback(object)
        {
            /**
             * @suppressReceiverCheck
             * @this {!Element}
             */
            function scrollIntoView()
            {
                this.scrollIntoViewIfNeeded(true);
            }

            if (object)
                object.callFunction(scrollIntoView);
        }

        this._node.resolveToObject("", scrollIntoViewCallback);
    },

    __proto__: TreeElement.prototype
}
