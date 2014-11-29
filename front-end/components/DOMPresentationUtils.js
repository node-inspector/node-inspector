/*
 * Copyright (C) 2011 Google Inc.  All rights reserved.
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

WebInspector.DOMPresentationUtils = {}

WebInspector.DOMPresentationUtils.decorateNodeLabel = function(node, parentElement)
{
    var title = node.nodeNameInCorrectCase();

    var nameElement = createElement("span");
    nameElement.textContent = title;
    parentElement.appendChild(nameElement);

    var idAttribute = node.getAttribute("id");
    if (idAttribute) {
        var idElement = createElement("span");
        parentElement.appendChild(idElement);

        var part = "#" + idAttribute;
        title += part;
        idElement.createTextChild(part);

        // Mark the name as extra, since the ID is more important.
        nameElement.className = "extra";
    }

    var classAttribute = node.getAttribute("class");
    if (classAttribute) {
        var classes = classAttribute.split(/\s+/);
        var foundClasses = {};

        if (classes.length) {
            var classesElement = createElement("span");
            classesElement.className = "extra";
            parentElement.appendChild(classesElement);

            for (var i = 0; i < classes.length; ++i) {
                var className = classes[i];
                if (className && !(className in foundClasses)) {
                    var part = "." + className;
                    title += part;
                    classesElement.createTextChild(part);
                    foundClasses[className] = true;
                }
            }
        }
    }
    parentElement.title = title;
}

/**
 * @param {!Element} container
 * @param {string} nodeTitle
 */
WebInspector.DOMPresentationUtils.createSpansForNodeTitle = function(container, nodeTitle)
{
    var match = nodeTitle.match(/([^#.]+)(#[^.]+)?(\..*)?/);
    container.createChild("span", "webkit-html-tag-name").textContent = match[1];
    if (match[2])
        container.createChild("span", "webkit-html-attribute-value").textContent = match[2];
    if (match[3])
        container.createChild("span", "webkit-html-attribute-name").textContent = match[3];
}

/**
 * @param {?WebInspector.DOMNode} node
 * @return {!Node}
 */
WebInspector.DOMPresentationUtils.linkifyNodeReference = function(node)
{
    if (!node)
        return createTextNode(WebInspector.UIString("<node>"));

    var link = createElement("span");
    link.className = "node-link";
    WebInspector.DOMPresentationUtils.decorateNodeLabel(node, link);

    link.addEventListener("click", WebInspector.Revealer.reveal.bind(WebInspector.Revealer, node, undefined), false);
    link.addEventListener("mouseover", node.highlight.bind(node, undefined, undefined), false);
    link.addEventListener("mouseleave", node.domModel().hideDOMNodeHighlight.bind(node.domModel()), false);

    return link;
}

/**
 * @param {string} imageURL
 * @param {!WebInspector.Target} target
 * @param {boolean} showDimensions
 * @param {function(!Element=)} userCallback
 * @param {!Object=} precomputedDimensions
 */
WebInspector.DOMPresentationUtils.buildImagePreviewContents = function(target, imageURL, showDimensions, userCallback, precomputedDimensions)
{
    var resource = target.resourceTreeModel.resourceForURL(imageURL);
    if (!resource || resource.resourceType() !== WebInspector.resourceTypes.Image) {
        userCallback();
        return;
    }

    var imageElement = createElement("img");
    imageElement.addEventListener("load", buildContent, false);
    imageElement.addEventListener("error", errorCallback, false);
    resource.populateImageSource(imageElement);

    function errorCallback()
    {
        // Drop the event parameter when invoking userCallback.
        userCallback();
    }

    function buildContent()
    {
        var container = createElement("table");
        container.className = "image-preview-container";
        var naturalWidth = precomputedDimensions ? precomputedDimensions.naturalWidth : imageElement.naturalWidth;
        var naturalHeight = precomputedDimensions ? precomputedDimensions.naturalHeight : imageElement.naturalHeight;
        var offsetWidth = precomputedDimensions ? precomputedDimensions.offsetWidth : naturalWidth;
        var offsetHeight = precomputedDimensions ? precomputedDimensions.offsetHeight : naturalHeight;
        var description;
        if (showDimensions) {
            if (offsetHeight === naturalHeight && offsetWidth === naturalWidth)
                description = WebInspector.UIString("%d \xd7 %d pixels", offsetWidth, offsetHeight);
            else
                description = WebInspector.UIString("%d \xd7 %d pixels (Natural: %d \xd7 %d pixels)", offsetWidth, offsetHeight, naturalWidth, naturalHeight);
        }

        container.createChild("tr").createChild("td", "image-container").appendChild(imageElement);
        if (description)
            container.createChild("tr").createChild("td").createChild("span", "description").textContent = description;
        userCallback(container);
    }
}

/**
 * @param {!WebInspector.DOMNode} node
 * @param {boolean=} justSelector
 * @return {string}
 */
WebInspector.DOMPresentationUtils.fullQualifiedSelector = function(node, justSelector)
{
    if (node.nodeType() !== Node.ELEMENT_NODE)
        return node.localName() || node.nodeName().toLowerCase();
    return WebInspector.DOMPresentationUtils.cssPath(node, justSelector);
}

/**
 * @param {!WebInspector.DOMNode} node
 * @return {string}
 */
WebInspector.DOMPresentationUtils.simpleSelector = function(node)
{
    var lowerCaseName = node.localName() || node.nodeName().toLowerCase();
    if (node.nodeType() !== Node.ELEMENT_NODE)
        return lowerCaseName;
    if (lowerCaseName === "input" && node.getAttribute("type") && !node.getAttribute("id") && !node.getAttribute("class"))
        return lowerCaseName + "[type=\"" + node.getAttribute("type") + "\"]";
    if (node.getAttribute("id"))
        return lowerCaseName + "#" + node.getAttribute("id");
    if (node.getAttribute("class"))
        return (lowerCaseName === "div" ? "" : lowerCaseName) + "." + node.getAttribute("class").trim().replace(/\s+/g, ".");
    return lowerCaseName;
}

/**
 * @param {!WebInspector.DOMNode} node
 * @param {boolean=} optimized
 * @return {string}
 */
WebInspector.DOMPresentationUtils.cssPath = function(node, optimized)
{
    if (node.nodeType() !== Node.ELEMENT_NODE)
        return "";

    var steps = [];
    var contextNode = node;
    while (contextNode) {
        var step = WebInspector.DOMPresentationUtils._cssPathStep(contextNode, !!optimized, contextNode === node);
        if (!step)
            break; // Error - bail out early.
        steps.push(step);
        if (step.optimized)
            break;
        contextNode = contextNode.parentNode;
    }

    steps.reverse();
    return steps.join(" > ");
}

/**
 * @param {!WebInspector.DOMNode} node
 * @param {boolean} optimized
 * @param {boolean} isTargetNode
 * @return {?WebInspector.DOMNodePathStep}
 */
WebInspector.DOMPresentationUtils._cssPathStep = function(node, optimized, isTargetNode)
{
    if (node.nodeType() !== Node.ELEMENT_NODE)
        return null;

    var id = node.getAttribute("id");
    if (optimized) {
        if (id)
            return new WebInspector.DOMNodePathStep(idSelector(id), true);
        var nodeNameLower = node.nodeName().toLowerCase();
        if (nodeNameLower === "body" || nodeNameLower === "head" || nodeNameLower === "html")
            return new WebInspector.DOMNodePathStep(node.nodeNameInCorrectCase(), true);
    }
    var nodeName = node.nodeNameInCorrectCase();

    if (id)
        return new WebInspector.DOMNodePathStep(nodeName + idSelector(id), true);
    var parent = node.parentNode;
    if (!parent || parent.nodeType() === Node.DOCUMENT_NODE)
        return new WebInspector.DOMNodePathStep(nodeName, true);

    /**
     * @param {!WebInspector.DOMNode} node
     * @return {!Array.<string>}
     */
    function prefixedElementClassNames(node)
    {
        var classAttribute = node.getAttribute("class");
        if (!classAttribute)
            return [];

        return classAttribute.split(/\s+/g).filter(Boolean).map(function(name) {
            // The prefix is required to store "__proto__" in a object-based map.
            return "$" + name;
        });
    }

    /**
     * @param {string} id
     * @return {string}
     */
    function idSelector(id)
    {
        return "#" + escapeIdentifierIfNeeded(id);
    }

    /**
     * @param {string} ident
     * @return {string}
     */
    function escapeIdentifierIfNeeded(ident)
    {
        if (isCSSIdentifier(ident))
            return ident;
        var shouldEscapeFirst = /^(?:[0-9]|-[0-9-]?)/.test(ident);
        var lastIndex = ident.length - 1;
        return ident.replace(/./g, function(c, i) {
            return ((shouldEscapeFirst && i === 0) || !isCSSIdentChar(c)) ? escapeAsciiChar(c, i === lastIndex) : c;
        });
    }

    /**
     * @param {string} c
     * @param {boolean} isLast
     * @return {string}
     */
    function escapeAsciiChar(c, isLast)
    {
        return "\\" + toHexByte(c) + (isLast ? "" : " ");
    }

    /**
     * @param {string} c
     */
    function toHexByte(c)
    {
        var hexByte = c.charCodeAt(0).toString(16);
        if (hexByte.length === 1)
          hexByte = "0" + hexByte;
        return hexByte;
    }

    /**
     * @param {string} c
     * @return {boolean}
     */
    function isCSSIdentChar(c)
    {
        if (/[a-zA-Z0-9_-]/.test(c))
            return true;
        return c.charCodeAt(0) >= 0xA0;
    }

    /**
     * @param {string} value
     * @return {boolean}
     */
    function isCSSIdentifier(value)
    {
        return /^-?[a-zA-Z_][a-zA-Z0-9_-]*$/.test(value);
    }

    var prefixedOwnClassNamesArray = prefixedElementClassNames(node);
    var needsClassNames = false;
    var needsNthChild = false;
    var ownIndex = -1;
    var elementIndex = -1;
    var siblings = parent.children();
    for (var i = 0; (ownIndex === -1 || !needsNthChild) && i < siblings.length; ++i) {
        var sibling = siblings[i];
        if (sibling.nodeType() !== Node.ELEMENT_NODE)
            continue;
        elementIndex += 1;
        if (sibling === node) {
            ownIndex = elementIndex;
            continue;
        }
        if (needsNthChild)
            continue;
        if (sibling.nodeNameInCorrectCase() !== nodeName)
            continue;

        needsClassNames = true;
        var ownClassNames = prefixedOwnClassNamesArray.keySet();
        var ownClassNameCount = 0;
        for (var name in ownClassNames)
            ++ownClassNameCount;
        if (ownClassNameCount === 0) {
            needsNthChild = true;
            continue;
        }
        var siblingClassNamesArray = prefixedElementClassNames(sibling);
        for (var j = 0; j < siblingClassNamesArray.length; ++j) {
            var siblingClass = siblingClassNamesArray[j];
            if (!ownClassNames.hasOwnProperty(siblingClass))
                continue;
            delete ownClassNames[siblingClass];
            if (!--ownClassNameCount) {
                needsNthChild = true;
                break;
            }
        }
    }

    var result = nodeName;
    if (isTargetNode && nodeName.toLowerCase() === "input" && node.getAttribute("type") && !node.getAttribute("id") && !node.getAttribute("class"))
        result += "[type=\"" + node.getAttribute("type") + "\"]";
    if (needsNthChild) {
        result += ":nth-child(" + (ownIndex + 1) + ")";
    } else if (needsClassNames) {
        for (var prefixedName in prefixedOwnClassNamesArray.keySet())
            result += "." + escapeIdentifierIfNeeded(prefixedName.substr(1));
    }

    return new WebInspector.DOMNodePathStep(result, false);
}

/**
 * @param {!WebInspector.DOMNode} node
 * @param {boolean=} optimized
 * @return {string}
 */
WebInspector.DOMPresentationUtils.xPath = function(node, optimized)
{
    if (node.nodeType() === Node.DOCUMENT_NODE)
        return "/";

    var steps = [];
    var contextNode = node;
    while (contextNode) {
        var step = WebInspector.DOMPresentationUtils._xPathValue(contextNode, optimized);
        if (!step)
            break; // Error - bail out early.
        steps.push(step);
        if (step.optimized)
            break;
        contextNode = contextNode.parentNode;
    }

    steps.reverse();
    return (steps.length && steps[0].optimized ? "" : "/") + steps.join("/");
}

/**
 * @param {!WebInspector.DOMNode} node
 * @param {boolean=} optimized
 * @return {?WebInspector.DOMNodePathStep}
 */
WebInspector.DOMPresentationUtils._xPathValue = function(node, optimized)
{
    var ownValue;
    var ownIndex = WebInspector.DOMPresentationUtils._xPathIndex(node);
    if (ownIndex === -1)
        return null; // Error.

    switch (node.nodeType()) {
    case Node.ELEMENT_NODE:
        if (optimized && node.getAttribute("id"))
            return new WebInspector.DOMNodePathStep("//*[@id=\"" + node.getAttribute("id") + "\"]", true);
        ownValue = node.localName();
        break;
    case Node.ATTRIBUTE_NODE:
        ownValue = "@" + node.nodeName();
        break;
    case Node.TEXT_NODE:
    case Node.CDATA_SECTION_NODE:
        ownValue = "text()";
        break;
    case Node.PROCESSING_INSTRUCTION_NODE:
        ownValue = "processing-instruction()";
        break;
    case Node.COMMENT_NODE:
        ownValue = "comment()";
        break;
    case Node.DOCUMENT_NODE:
        ownValue = "";
        break;
    default:
        ownValue = "";
        break;
    }

    if (ownIndex > 0)
        ownValue += "[" + ownIndex + "]";

    return new WebInspector.DOMNodePathStep(ownValue, node.nodeType() === Node.DOCUMENT_NODE);
},

/**
 * @param {!WebInspector.DOMNode} node
 * @return {number}
 */
WebInspector.DOMPresentationUtils._xPathIndex = function(node)
{
    // Returns -1 in case of error, 0 if no siblings matching the same expression, <XPath index among the same expression-matching sibling nodes> otherwise.
    function areNodesSimilar(left, right)
    {
        if (left === right)
            return true;

        if (left.nodeType() === Node.ELEMENT_NODE && right.nodeType() === Node.ELEMENT_NODE)
            return left.localName() === right.localName();

        if (left.nodeType() === right.nodeType())
            return true;

        // XPath treats CDATA as text nodes.
        var leftType = left.nodeType() === Node.CDATA_SECTION_NODE ? Node.TEXT_NODE : left.nodeType();
        var rightType = right.nodeType() === Node.CDATA_SECTION_NODE ? Node.TEXT_NODE : right.nodeType();
        return leftType === rightType;
    }

    var siblings = node.parentNode ? node.parentNode.children() : null;
    if (!siblings)
        return 0; // Root node - no siblings.
    var hasSameNamedElements;
    for (var i = 0; i < siblings.length; ++i) {
        if (areNodesSimilar(node, siblings[i]) && siblings[i] !== node) {
            hasSameNamedElements = true;
            break;
        }
    }
    if (!hasSameNamedElements)
        return 0;
    var ownIndex = 1; // XPath indices start with 1.
    for (var i = 0; i < siblings.length; ++i) {
        if (areNodesSimilar(node, siblings[i])) {
            if (siblings[i] === node)
                return ownIndex;
            ++ownIndex;
        }
    }
    return -1; // An error occurred: |node| not found in parent's children.
}

/**
 * @constructor
 * @param {string} value
 * @param {boolean} optimized
 */
WebInspector.DOMNodePathStep = function(value, optimized)
{
    this.value = value;
    this.optimized = optimized || false;
}

WebInspector.DOMNodePathStep.prototype = {
    /**
     * @return {string}
     */
    toString: function()
    {
        return this.value;
    }
}
