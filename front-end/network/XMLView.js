// Copyright 2014 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

/**
 * @constructor
 * @extends {WebInspector.Widget}
 * @param {!Document} parsedXML
 */
WebInspector.XMLView = function(parsedXML)
{
    WebInspector.Widget.call(this, true);
    this.registerRequiredCSS("network/xmlView.css");
    this.contentElement.classList.add("shadow-xml-view", "source-code");
    var treeOutline = new TreeOutline();
    this.contentElement.appendChild(treeOutline.element);
    WebInspector.XMLView.Node.populate(treeOutline, parsedXML);
}

/**
 * @param {string} text
 * @param {string} mimeType
 * @return {?Document}
 */
WebInspector.XMLView.parseXML = function(text, mimeType)
{
    var parsedXML;
    try {
        parsedXML = (new DOMParser()).parseFromString(text, mimeType);
    } catch (e) {
        return null;
    }
    if (parsedXML.body)
        return null;
    return parsedXML;
}

WebInspector.XMLView.prototype = {
    __proto__: WebInspector.Widget.prototype
}

/**
 * @constructor
 * @extends {TreeElement}
 * @param {!Node} node
 * @param {boolean} closeTag
 */
WebInspector.XMLView.Node = function(node, closeTag)
{
    TreeElement.call(this, "", !closeTag && !!node.childElementCount);
    this._node = node;
    this._closeTag = closeTag;
    this.selectable = false;
    this._updateTitle();
}

/**
 * @param {!TreeOutline|!TreeElement} root
 * @param {!Node} xmlNode
 */
WebInspector.XMLView.Node.populate = function(root, xmlNode)
{
    var node = xmlNode.firstChild;
    while (node) {
        var currentNode = node;
        node = node.nextSibling;
        var nodeType = currentNode.nodeType;
        // ignore empty TEXT
        if (nodeType === 3 && currentNode.nodeValue.match(/\s+/))
            continue;
        // ignore ATTRIBUTE, ENTITY_REFERENCE, ENTITY, DOCUMENT, DOCUMENT_TYPE, DOCUMENT_FRAGMENT, NOTATION
        if ((nodeType !== 1) && (nodeType !== 3) && (nodeType !== 4) && (nodeType !== 7) && (nodeType !== 8))
            continue;
        root.appendChild(new WebInspector.XMLView.Node(currentNode, false));
    }
}

WebInspector.XMLView.Node.prototype = {
    _updateTitle: function()
    {
        var node = this._node;
        switch (node.nodeType) {
        case 1: // ELEMENT
            var tag = node.tagName;
            if (this._closeTag) {
                this._setTitle(["</" + tag + ">", "shadow-xml-view-tag"]);
                return;
            }
            var titleItems = ["<" + tag, "shadow-xml-view-tag"];
            var attributes = node.attributes;
            for (var i = 0; i < attributes.length; ++i) {
                var attributeNode = attributes.item(i);
                titleItems.push(
                    "\u00a0", "shadow-xml-view-tag",
                    attributeNode.name, "shadow-xml-view-attribute-name",
                    "=\"", "shadow-xml-view-tag",
                    attributeNode.value, "shadow-xml-view-attribute-value",
                    "\"", "shadow-xml-view-tag")
            }
            if (!this.expanded) {
                if (node.childElementCount) {
                    titleItems.push(
                        ">", "shadow-xml-view-tag",
                        "\u2026", "shadow-xml-view-comment",
                        "</" + tag, "shadow-xml-view-tag");
                } else if (this._node.textContent) {
                    titleItems.push(
                        ">", "shadow-xml-view-tag",
                        node.textContent, "shadow-xml-view-text",
                        "</" + tag, "shadow-xml-view-tag");
                } else {
                    titleItems.push(" /", "shadow-xml-view-tag");
                }
            }
            titleItems.push(">", "shadow-xml-view-tag");
            this._setTitle(titleItems);
            return;
        case 3: // TEXT
            this._setTitle([node.nodeValue, "shadow-xml-view-text"]);
            return;
        case 4: // CDATA
            this._setTitle([
                "<![CDATA[", "shadow-xml-view-cdata",
                node.nodeValue, "shadow-xml-view-text",
                "]]>", "shadow-xml-view-cdata"]);
            return;
        case 7: // PROCESSING_INSTRUCTION
            this._setTitle(["<?" + node.nodeName + " " + node.nodeValue + "?>", "shadow-xml-view-processing-instruction"]);
            return;
        case 8: // COMMENT
            this._setTitle(["<!--" + node.nodeValue + "-->", "shadow-xml-view-comment"]);
            return;
        }
    },

    /**
     * @param {!Array.<string>} items
     */
    _setTitle: function(items)
    {
        var titleFragment = createDocumentFragment();
        for (var i = 0; i < items.length; i += 2)
            titleFragment.createChild("span", items[i + 1]).textContent = items[i];
        this.title = titleFragment;
    },

    onattach: function()
    {
        this.listItemElement.classList.toggle("shadow-xml-view-close-tag", this._closeTag);
    },

    onexpand: function()
    {
        this._updateTitle();
    },

    oncollapse: function()
    {
        this._updateTitle();
    },

    onpopulate: function()
    {
        WebInspector.XMLView.Node.populate(this, this._node);
        this.appendChild(new WebInspector.XMLView.Node(this._node, true));
    },

    __proto__: TreeElement.prototype
}
