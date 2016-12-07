/*
 * Copyright (C) 2007 Apple Inc.  All rights reserved.
 * Copyright (C) 2012 Google Inc. All rights reserved.
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
 *
 * Contains diff method based on Javascript Diff Algorithm By John Resig
 * http://ejohn.org/files/jsdiff.js (released under the MIT license).
 */

/**
 * @param {number} offset
 * @param {string} stopCharacters
 * @param {!Node} stayWithinNode
 * @param {string=} direction
 * @return {!Range}
 */
Node.prototype.rangeOfWord = function(offset, stopCharacters, stayWithinNode, direction)
{
    var startNode;
    var startOffset = 0;
    var endNode;
    var endOffset = 0;

    if (!stayWithinNode)
        stayWithinNode = this;

    if (!direction || direction === "backward" || direction === "both") {
        var node = this;
        while (node) {
            if (node === stayWithinNode) {
                if (!startNode)
                    startNode = stayWithinNode;
                break;
            }

            if (node.nodeType === Node.TEXT_NODE) {
                var start = (node === this ? (offset - 1) : (node.nodeValue.length - 1));
                for (var i = start; i >= 0; --i) {
                    if (stopCharacters.indexOf(node.nodeValue[i]) !== -1) {
                        startNode = node;
                        startOffset = i + 1;
                        break;
                    }
                }
            }

            if (startNode)
                break;

            node = node.traversePreviousNode(stayWithinNode);
        }

        if (!startNode) {
            startNode = stayWithinNode;
            startOffset = 0;
        }
    } else {
        startNode = this;
        startOffset = offset;
    }

    if (!direction || direction === "forward" || direction === "both") {
        node = this;
        while (node) {
            if (node === stayWithinNode) {
                if (!endNode)
                    endNode = stayWithinNode;
                break;
            }

            if (node.nodeType === Node.TEXT_NODE) {
                var start = (node === this ? offset : 0);
                for (var i = start; i < node.nodeValue.length; ++i) {
                    if (stopCharacters.indexOf(node.nodeValue[i]) !== -1) {
                        endNode = node;
                        endOffset = i;
                        break;
                    }
                }
            }

            if (endNode)
                break;

            node = node.traverseNextNode(stayWithinNode);
        }

        if (!endNode) {
            endNode = stayWithinNode;
            endOffset = stayWithinNode.nodeType === Node.TEXT_NODE ? stayWithinNode.nodeValue.length : stayWithinNode.childNodes.length;
        }
    } else {
        endNode = this;
        endOffset = offset;
    }

    var result = this.ownerDocument.createRange();
    result.setStart(startNode, startOffset);
    result.setEnd(endNode, endOffset);

    return result;
}

/**
 * @param {!Node=} stayWithin
 * @return {?Node}
 */
Node.prototype.traverseNextTextNode = function(stayWithin)
{
    var node = this.traverseNextNode(stayWithin);
    if (!node)
        return null;

    while (node && node.nodeType !== Node.TEXT_NODE)
        node = node.traverseNextNode(stayWithin);

    return node;
}

/**
 * @param {number} offset
 * @return {!{container: !Node, offset: number}}
 */
Node.prototype.rangeBoundaryForOffset = function(offset)
{
    var node = this.traverseNextTextNode(this);
    while (node && offset > node.nodeValue.length) {
        offset -= node.nodeValue.length;
        node = node.traverseNextTextNode(this);
    }
    if (!node)
        return { container: this, offset: 0 };
    return { container: node, offset: offset };
}

/**
 * @param {number|undefined} x
 * @param {number|undefined} y
 * @param {!Element=} relativeTo
 */
Element.prototype.positionAt = function(x, y, relativeTo)
{
    var shift = {x: 0, y: 0};
    if (relativeTo)
       shift = relativeTo.boxInWindow(this.ownerDocument.defaultView);

    if (typeof x === "number")
        this.style.setProperty("left", (shift.x + x) + "px");
    else
        this.style.removeProperty("left");

    if (typeof y === "number")
        this.style.setProperty("top", (shift.y + y) + "px");
    else
        this.style.removeProperty("top");
}

/**
 * @return {boolean}
 */
Element.prototype.isScrolledToBottom = function()
{
    // This code works only for 0-width border.
    // Both clientHeight and scrollHeight are rounded to integer values, so we tolerate
    // one pixel error.
    return Math.abs(this.scrollTop + this.clientHeight - this.scrollHeight) <= 1;
}

/**
 * @param {!Node} fromNode
 * @param {!Node} toNode
 */
function removeSubsequentNodes(fromNode, toNode)
{
    for (var node = fromNode; node && node !== toNode; ) {
        var nodeToRemove = node;
        node = node.nextSibling;
        nodeToRemove.remove();
    }
}

/**
 * @param {!Event} event
 * @return {boolean}
 */
Element.prototype.containsEventPoint = function(event)
{
    var box = this.getBoundingClientRect();
    return box.left < event.x  && event.x < box.right &&
           box.top < event.y && event.y < box.bottom;
}

/**
 * @param {!Array.<string>} nameArray
 * @return {?Node}
 */
Node.prototype.enclosingNodeOrSelfWithNodeNameInArray = function(nameArray)
{
    for (var node = this; node && node !== this.ownerDocument; node = node.parentNodeOrShadowHost()) {
        for (var i = 0; i < nameArray.length; ++i) {
            if (node.nodeName.toLowerCase() === nameArray[i].toLowerCase())
                return node;
        }
    }
    return null;
}

/**
 * @param {string} nodeName
 * @return {?Node}
 */
Node.prototype.enclosingNodeOrSelfWithNodeName = function(nodeName)
{
    return this.enclosingNodeOrSelfWithNodeNameInArray([nodeName]);
}

/**
 * @param {string} className
 * @param {!Element=} stayWithin
 * @return {?Element}
 */
Node.prototype.enclosingNodeOrSelfWithClass = function(className, stayWithin)
{
    for (var node = this; node && node !== stayWithin && node !== this.ownerDocument; node = node.parentNodeOrShadowHost()) {
        if (node.nodeType === Node.ELEMENT_NODE && node.classList.contains(className))
            return /** @type {!Element} */ (node);
    }
    return null;
}

/**
 * @return {?Element}
 */
Node.prototype.parentElementOrShadowHost = function()
{
    var node = this.parentNode;
    if (!node)
        return null;
    if (node.nodeType === Node.ELEMENT_NODE)
        return /** @type {!Element} */ (node);
    if (node.nodeType === Node.DOCUMENT_FRAGMENT_NODE)
        return /** @type {!Element} */ (node.host);
    return null;
}

/**
 * @return {?Node}
 */
Node.prototype.parentNodeOrShadowHost = function()
{
    return this.parentNode || this.host || null;
}

/**
 * @return {!Window}
 */
Node.prototype.window = function()
{
    return this.ownerDocument.defaultView;
}

/**
 * @param {string} query
 * @return {?Node}
 */
Element.prototype.query = function(query)
{
    return this.ownerDocument.evaluate(query, this, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue;
}

Element.prototype.removeChildren = function()
{
    if (this.firstChild)
        this.textContent = "";
}

/**
 * @return {boolean}
 */
Element.prototype.isInsertionCaretInside = function()
{
    var selection = this.window().getSelection();
    if (!selection.rangeCount || !selection.isCollapsed)
        return false;
    var selectionRange = selection.getRangeAt(0);
    return selectionRange.startContainer.isSelfOrDescendant(this);
}

/**
 * @param {string} tagName
 * @return {!Element}
 * @suppressGlobalPropertiesCheck
 */
function createElement(tagName)
{
    return document.createElement(tagName);
}

/**
 * @param {number|string} data
 * @return {!Text}
 * @suppressGlobalPropertiesCheck
 */
function createTextNode(data)
{
    return document.createTextNode(data);
}

/**
 * @param {string} elementName
 * @param {string=} className
 * @return {!Element}
 */
Document.prototype.createElementWithClass = function(elementName, className)
{
    var element = this.createElement(elementName);
    if (className)
        element.className = className;
    return element;
}

/**
 * @param {string} elementName
 * @param {string=} className
 * @return {!Element}
 * @suppressGlobalPropertiesCheck
 */
function createElementWithClass(elementName, className)
{
    return document.createElementWithClass(elementName, className);
}

/**
 * @return {!DocumentFragment}
 * @suppressGlobalPropertiesCheck
 */
function createDocumentFragment()
{
    return document.createDocumentFragment();
}

/**
 * @param {string} elementName
 * @param {string=} className
 * @return {!Element}
 */
Element.prototype.createChild = function(elementName, className)
{
    var element = this.ownerDocument.createElementWithClass(elementName, className);
    this.appendChild(element);
    return element;
}

DocumentFragment.prototype.createChild = Element.prototype.createChild;

/**
 * @param {string} text
 * @return {!Text}
 */
Element.prototype.createTextChild = function(text)
{
    var element = this.ownerDocument.createTextNode(text);
    this.appendChild(element);
    return element;
}

DocumentFragment.prototype.createTextChild = Element.prototype.createTextChild;

/**
 * @param {...string} var_args
 */
Element.prototype.createTextChildren = function(var_args)
{
    for (var i = 0, n = arguments.length; i < n; ++i)
        this.createTextChild(arguments[i]);
}

DocumentFragment.prototype.createTextChildren = Element.prototype.createTextChildren;

/**
 * @param {...!Element} var_args
 */
Element.prototype.appendChildren = function(var_args)
{
    for (var i = 0, n = arguments.length; i < n; ++i)
        this.appendChild(arguments[i]);
}

/**
 * @return {number}
 */
Element.prototype.totalOffsetLeft = function()
{
    return this.totalOffset().left;
}

/**
 * @return {number}
 */
Element.prototype.totalOffsetTop = function()
{
    return this.totalOffset().top;
}

/**
 * @return {!{left: number, top: number}}
 */
Element.prototype.totalOffset = function()
{
    var rect = this.getBoundingClientRect();
    return { left: rect.left, top: rect.top };
}

/**
 * @return {!{left: number, top: number}}
 */
Element.prototype.scrollOffset = function()
{
    var curLeft = 0;
    var curTop = 0;
    for (var element = this; element; element = element.scrollParent) {
        curLeft += element.scrollLeft;
        curTop += element.scrollTop;
    }
    return { left: curLeft, top: curTop };
}

/**
 * @constructor
 * @param {number=} x
 * @param {number=} y
 * @param {number=} width
 * @param {number=} height
 */
function AnchorBox(x, y, width, height)
{
    this.x = x || 0;
    this.y = y || 0;
    this.width = width || 0;
    this.height = height || 0;
}

/**
 * @param {!AnchorBox} box
 * @return {!AnchorBox}
 */
AnchorBox.prototype.relativeTo = function(box)
{
    return new AnchorBox(
        this.x - box.x, this.y - box.y, this.width, this.height);
}

/**
 * @param {!Element} element
 * @return {!AnchorBox}
 */
AnchorBox.prototype.relativeToElement = function(element)
{
    return this.relativeTo(element.boxInWindow(element.ownerDocument.defaultView));
}

/**
 * @param {?AnchorBox} anchorBox
 * @return {boolean}
 */
AnchorBox.prototype.equals = function(anchorBox)
{
    return !!anchorBox && this.x === anchorBox.x && this.y === anchorBox.y && this.width === anchorBox.width && this.height === anchorBox.height;
}

/**
 * @param {!Window} targetWindow
 * @return {!AnchorBox}
 */
Element.prototype.offsetRelativeToWindow = function(targetWindow)
{
    var elementOffset = new AnchorBox();
    var curElement = this;
    var curWindow = this.ownerDocument.defaultView;
    while (curWindow && curElement) {
        elementOffset.x += curElement.totalOffsetLeft();
        elementOffset.y += curElement.totalOffsetTop();
        if (curWindow === targetWindow)
            break;

        curElement = curWindow.frameElement;
        curWindow = curWindow.parent;
    }

    return elementOffset;
}

/**
 * @param {!Window=} targetWindow
 * @return {!AnchorBox}
 */
Element.prototype.boxInWindow = function(targetWindow)
{
    targetWindow = targetWindow || this.ownerDocument.defaultView;

    var anchorBox = this.offsetRelativeToWindow(window);
    anchorBox.width = Math.min(this.offsetWidth, window.innerWidth - anchorBox.x);
    anchorBox.height = Math.min(this.offsetHeight, window.innerHeight - anchorBox.y);

    return anchorBox;
}

/**
 * @param {string} text
 */
Element.prototype.setTextAndTitle = function(text)
{
    this.textContent = text;
    this.title = text;
}

KeyboardEvent.prototype.__defineGetter__("data", function()
{
    // Emulate "data" attribute from DOM 3 TextInput event.
    // See http://www.w3.org/TR/DOM-Level-3-Events/#events-Events-TextEvent-data
    switch (this.type) {
        case "keypress":
            if (!this.ctrlKey && !this.metaKey)
                return String.fromCharCode(this.charCode);
            else
                return "";
        case "keydown":
        case "keyup":
            if (!this.ctrlKey && !this.metaKey && !this.altKey)
                return String.fromCharCode(this.which);
            else
                return "";
    }
});

/**
 * @param {boolean=} preventDefault
 */
Event.prototype.consume = function(preventDefault)
{
    this.stopImmediatePropagation();
    if (preventDefault)
        this.preventDefault();
    this.handled = true;
}

/**
 * @param {number=} start
 * @param {number=} end
 * @return {!Text}
 */
Text.prototype.select = function(start, end)
{
    start = start || 0;
    end = end || this.textContent.length;

    if (start < 0)
        start = end + start;

    var selection = this.ownerDocument.defaultView.getSelection();
    selection.removeAllRanges();
    var range = this.ownerDocument.createRange();
    range.setStart(this, start);
    range.setEnd(this, end);
    selection.addRange(range);
    return this;
}

/**
 * @return {?number}
 */
Element.prototype.selectionLeftOffset = function()
{
    // Calculate selection offset relative to the current element.

    var selection = this.window().getSelection();
    if (!selection.containsNode(this, true))
        return null;

    var leftOffset = selection.anchorOffset;
    var node = selection.anchorNode;

    while (node !== this) {
        while (node.previousSibling) {
            node = node.previousSibling;
            leftOffset += node.textContent.length;
        }
        node = node.parentNodeOrShadowHost();
    }

    return leftOffset;
}

/**
 * @return {string}
 */
Node.prototype.deepTextContent = function()
{
    var node = this.traverseNextTextNode(this);
    var result = [];
    var nonTextTags = { "STYLE": 1, "SCRIPT": 1 };
    while (node) {
        if (!nonTextTags[node.parentElement.nodeName])
            result.push(node.textContent);
        node = node.traverseNextTextNode(this);
    }
    return result.join("");
}

/**
 * @param {?Node} node
 * @return {boolean}
 */
Node.prototype.isAncestor = function(node)
{
    if (!node)
        return false;

    var currentNode = node.parentNodeOrShadowHost();
    while (currentNode) {
        if (this === currentNode)
            return true;
        currentNode = currentNode.parentNodeOrShadowHost();
    }
    return false;
}

/**
 * @param {?Node} descendant
 * @return {boolean}
 */
Node.prototype.isDescendant = function(descendant)
{
    return !!descendant && descendant.isAncestor(this);
}

/**
 * @param {?Node} node
 * @return {boolean}
 */
Node.prototype.isSelfOrAncestor = function(node)
{
    return !!node && (node === this || this.isAncestor(node));
}

/**
 * @param {?Node} node
 * @return {boolean}
 */
Node.prototype.isSelfOrDescendant = function(node)
{
    return !!node && (node === this || this.isDescendant(node));
}

/**
 * @param {!Node=} stayWithin
 * @return {?Node}
 */
Node.prototype.traverseNextNode = function(stayWithin)
{
    if (this.firstChild)
        return this.firstChild;

    if (this.shadowRoot)
        return this.shadowRoot;

    if (stayWithin && this === stayWithin)
        return null;

    var node = this.nextSibling;
    if (node)
        return node;

    node = this;
    while (node && !node.nextSibling && (!stayWithin || !node.parentNodeOrShadowHost() || node.parentNodeOrShadowHost() !== stayWithin))
        node = node.parentNodeOrShadowHost();
    if (!node)
        return null;

    return node.nextSibling;
}

/**
 * @param {!Node=} stayWithin
 * @return {?Node}
 */
Node.prototype.traversePreviousNode = function(stayWithin)
{
    if (stayWithin && this === stayWithin)
        return null;
    var node = this.previousSibling;
    while (node && node.lastChild)
        node = node.lastChild;
    if (node)
        return node;
    return this.parentNodeOrShadowHost();
}

/**
 * @param {*} text
 * @param {string=} placeholder
 * @return {boolean} true if was truncated
 */
Node.prototype.setTextContentTruncatedIfNeeded = function(text, placeholder)
{
    // Huge texts in the UI reduce rendering performance drastically.
    // Moreover, Blink/WebKit uses <unsigned short> internally for storing text content
    // length, so texts longer than 65535 are inherently displayed incorrectly.
    const maxTextContentLength = 65535;

    if (typeof text === "string" && text.length > maxTextContentLength) {
        this.textContent = typeof placeholder === "string" ? placeholder : text.trimEnd(maxTextContentLength);
        return true;
    }

    this.textContent = text;
    return false;
}

/**
 * @return {?Node}
 */
Event.prototype.deepElementFromPoint = function()
{
    // 1. climb to the component root.
    var node = this.target;
    while (node && node.nodeType !== Node.DOCUMENT_FRAGMENT_NODE && node.nodeType !== Node.DOCUMENT_NODE)
        node = node.parentNode;

    if (!node)
        return null;

    // 2. Find deepest node by coordinates.
    node = node.elementFromPoint(this.pageX, this.pageY);
    while (node && node.shadowRoot)
        node = node.shadowRoot.elementFromPoint(this.pageX, this.pageY);
    return node;
}

/**
 * @param {number} x
 * @param {number} y
 * @return {?Node}
 */
Document.prototype.deepElementFromPoint = function(x, y)
{
    var node = this.elementFromPoint(x, y);
    while (node && node.shadowRoot)
        node = node.shadowRoot.elementFromPoint(x, y);
    return node;
}

/**
 * @return {boolean}
 */
function isEnterKey(event) {
    // Check if in IME.
    return event.keyCode !== 229 && (event.keyIdentifier === "Enter" || event.key === "Enter");
}

function consumeEvent(e)
{
    e.consume();
}

/**
 * @param {function()} callback
 * @suppressGlobalPropertiesCheck
 */
function runOnWindowLoad(callback)
{
    /**
     * @suppressGlobalPropertiesCheck
     */
    function windowLoaded()
    {
        window.removeEventListener("DOMContentLoaded", windowLoaded, false);
        callback();
    }

    if (document.readyState === "complete" || document.readyState === "interactive")
        callback();
    else
        window.addEventListener("DOMContentLoaded", windowLoaded, false);
}
