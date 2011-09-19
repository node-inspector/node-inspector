/*
 * Copyright (C) 2009, 2010 Google Inc. All rights reserved.
 * Copyright (C) 2009 Joseph Pecoraro
 *
 * Redistribution and use in source and binary forms, with or without
 * modification, are permitted provided that the following conditions are
 * met:
 *
 *     * Redistributions of source code must retain the above copyright
 * notice, this list of conditions and the following disclaimer.
 *     * Redistributions in binary form must reproduce the above
 * copyright notice, this list of conditions and the following disclaimer
 * in the documentation and/or other materials provided with the
 * distribution.
 *     * Neither the name of Google Inc. nor the names of its
 * contributors may be used to endorse or promote products derived from
 * this software without specific prior written permission.
 *
 * THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS
 * "AS IS" AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT
 * LIMITED TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR
 * A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT
 * OWNER OR CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL,
 * SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT
 * LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE,
 * DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY
 * THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT
 * (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE
 * OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
 */

/**
 * @constructor
 */
WebInspector.DOMNode = function(doc, payload) {
    this.ownerDocument = doc;

    this.id = payload.nodeId;
    this._nodeType = payload.nodeType;
    this._nodeName = payload.nodeName;
    this._localName = payload.localName;
    this._nodeValue = payload.nodeValue;

    this._attributes = [];
    this._attributesMap = {};
    if (payload.attributes)
        this._setAttributesPayload(payload.attributes);

    this._childNodeCount = payload.childNodeCount;
    this.children = null;

    this.nextSibling = null;
    this.prevSibling = null;
    this.firstChild = null;
    this.lastChild = null;
    this.parentNode = null;

    if (payload.children)
        this._setChildrenPayload(payload.children);

    this._computedStyle = null;
    this.style = null;
    this._matchedCSSRules = [];

    if (this._nodeType === Node.ELEMENT_NODE) {
        // HTML and BODY from internal iframes should not overwrite top-level ones.
        if (!this.ownerDocument.documentElement && this._nodeName === "HTML")
            this.ownerDocument.documentElement = this;
        if (!this.ownerDocument.body && this._nodeName === "BODY")
            this.ownerDocument.body = this;
        if (payload.documentURL)
            this.documentURL = payload.documentURL;
    } else if (this._nodeType === Node.DOCUMENT_TYPE_NODE) {
        this.publicId = payload.publicId;
        this.systemId = payload.systemId;
        this.internalSubset = payload.internalSubset;
    } else if (this._nodeType === Node.DOCUMENT_NODE) {
        this.documentURL = payload.documentURL;
        this.xmlVersion = payload.xmlVersion;
    } else if (this._nodeType === Node.ATTRIBUTE_NODE) {
        this.name = payload.name;
        this.value = payload.value;
    }
}

WebInspector.DOMNode.prototype = {
    hasAttributes: function()
    {
        return this._attributes.length > 0;
    },

    hasChildNodes: function()
    {
        return this._childNodeCount > 0;
    },

    nodeType: function()
    {
        return this._nodeType;
    },

    nodeName: function()
    {
        return this._nodeName;
    },

    setNodeName: function(name, callback)
    {
        DOMAgent.setNodeName(this.id, name, callback);
    },

    localName: function()
    {
        return this._localName;
    },

    nodeValue: function()
    {
        return this._nodeValue;
    },

    setNodeValue: function(value, callback)
    {
        DOMAgent.setNodeValue(this.id, value, callback);
    },

    getAttribute: function(name)
    {
        var attr = this._attributesMap[name];
        return attr ? attr.value : undefined;
    },

    setAttribute: function(name, text, callback)
    {
        DOMAgent.setAttributesText(this.id, text, name, callback);
    },

    setAttributeValue: function(name, value, callback)
    {
        DOMAgent.setAttributeValue(this.id, name, value, callback);
    },

    attributes: function()
    {
        return this._attributes;
    },

    removeAttribute: function(name, callback)
    {
        function mycallback(error, success)
        {
            if (!error) {
                delete this._attributesMap[name];
                for (var i = 0;  i < this._attributes.length; ++i) {
                    if (this._attributes[i].name === name) {
                        this._attributes.splice(i, 1);
                        break;
                    }
                }
            }

            if (callback)
                callback();
        }
        DOMAgent.removeAttribute(this.id, name, mycallback.bind(this));
    },

    getChildNodes: function(callback)
    {
        if (this.children) {
            if (callback)
                callback(this.children);
            return;
        }

        function mycallback(error) {
            if (!error && callback)
                callback(this.children);
        }
        DOMAgent.requestChildNodes(this.id, mycallback.bind(this));
    },

    getOuterHTML: function(callback)
    {
        DOMAgent.getOuterHTML(this.id, callback);
    },

    setOuterHTML: function(html, callback)
    {
        DOMAgent.setOuterHTML(this.id, html, callback);
    },

    removeNode: function(callback)
    {
        DOMAgent.removeNode(this.id, callback);
    },

    copyNode: function(callback)
    {
        DOMAgent.copyNode(this.id, callback);
    },

    eventListeners: function(callback)
    {
        DOMAgent.getEventListenersForNode(this.id, callback);
    },

    path: function()
    {
        var path = [];
        var node = this;
        while (node && "index" in node && node._nodeName.length) {
            path.push([node.index, node._nodeName]);
            node = node.parentNode;
        }
        path.reverse();
        return path.join(",");
    },

    appropriateSelectorFor: function(justSelector)
    {
        var lowerCaseName = this.localName() || this.nodeName().toLowerCase();

        var id = this.getAttribute("id");
        if (id) {
            var selector = "#" + id;
            return (justSelector ? selector : lowerCaseName + selector);
        }

        var className = this.getAttribute("class");
        if (className) {
            var selector = "." + className.replace(/\s+/, ".");
            return (justSelector ? selector : lowerCaseName + selector);
        }

        if (lowerCaseName === "input" && this.getAttribute("type"))
            return lowerCaseName + "[type=\"" + this.getAttribute("type") + "\"]";

        return lowerCaseName;
    },

    isAncestor: function(node)
    {
        if (!node)
            return false;

        var currentNode = node.parentNode;
        while (currentNode) {
            if (this === currentNode)
                return true;
            currentNode = currentNode.parentNode;
        }
        return false;
    },

    isDescendant: function(descendant)
    {
        return descendant !== null && descendant.isAncestor(this);
    },

    isWhitespace: function()
    {
        if (this.nodeType !== Node.TEXT_NODE)
            return false;
        if (!this.nodeValue.length)
            return true;
        return this.nodeValue.match(/^[\s\xA0]+$/);
    },

    _setAttributesPayload: function(attrs)
    {
        this._attributes = [];
        this._attributesMap = {};
        for (var i = 0; i < attrs.length; i += 2)
            this._addAttribute(attrs[i], attrs[i + 1]);
    },

    _insertChild: function(prev, payload)
    {
        var node = new WebInspector.DOMNode(this.ownerDocument, payload);
        if (!prev) {
            if (!this.children) {
                // First node
                this.children = [ node ];
            } else
                this.children.unshift(node);
        } else
            this.children.splice(this.children.indexOf(prev) + 1, 0, node);
        this._renumber();
        return node;
    },

    _removeChild: function(node)
    {
        this.children.splice(this.children.indexOf(node), 1);
        node.parentNode = null;
        this._renumber();
    },

    _setChildrenPayload: function(payloads)
    {
        this.children = [];
        for (var i = 0; i < payloads.length; ++i) {
            var payload = payloads[i];
            var node = new WebInspector.DOMNode(this.ownerDocument, payload);
            this.children.push(node);
        }
        this._renumber();
    },

    _renumber: function()
    {
        this._childNodeCount = this.children.length;
        if (this._childNodeCount == 0) {
            this.firstChild = null;
            this.lastChild = null;
            return;
        }
        this.firstChild = this.children[0];
        this.lastChild = this.children[this._childNodeCount - 1];
        for (var i = 0; i < this._childNodeCount; ++i) {
            var child = this.children[i];
            child.index = i;
            child.nextSibling = i + 1 < this._childNodeCount ? this.children[i + 1] : null;
            child.prevSibling = i - 1 >= 0 ? this.children[i - 1] : null;
            child.parentNode = this;
        }
    },

    _addAttribute: function(name, value)
    {
        var attr = {
            "name": name,
            "value": value,
            "_node": this
        };
        this._attributesMap[name] = attr;
        this._attributes.push(attr);
    },

    ownerDocumentElement: function()
    {
        // document element is the child of the document / frame owner node that has documentURL property.
        // FIXME: return document nodes as a part of the DOM tree structure.
        var node = this;
        while (node.parentNode && !node.parentNode.documentURL)
            node = node.parentNode;
        return node;
    },

    moveTo: function(targetNode, anchorNode, callback)
    {
        DOMAgent.moveTo(this.id, targetNode.id, anchorNode ? anchorNode.id : undefined, callback);
    }
}

/**
 * @extends {WebInspector.DOMNode}
 * @constructor
 */
WebInspector.DOMDocument = function(domAgent, payload)
{
    WebInspector.DOMNode.call(this, this, payload);
    this._listeners = {};
    this._domAgent = domAgent;
}

WebInspector.DOMDocument.prototype.__proto__ = WebInspector.DOMNode.prototype;

/**
 * @extends {WebInspector.Object}
 * @constructor
 */
WebInspector.DOMAgent = function() {
    this._idToDOMNode = null;
    this._document = null;
    this._attributeLoadNodeIds = {};
    InspectorBackend.registerDOMDispatcher(new WebInspector.DOMDispatcher(this));
}

WebInspector.DOMAgent.Events = {
    AttrModified: "AttrModified",
    CharacterDataModified: "CharacterDataModified",
    NodeInserted: "NodeInserted",
    NodeRemoved: "NodeRemoved",
    DocumentUpdated: "DocumentUpdated",
    ChildNodeCountUpdated: "ChildNodeCountUpdated",
    InspectElementRequested: "InspectElementRequested"
}

WebInspector.DOMAgent.prototype = {
    requestDocument: function(callback)
    {
        if (this._document) {
            if (callback)
                callback(this._document);
            return;
        }

        if (this._pendingDocumentRequestCallbacks) {
            this._pendingDocumentRequestCallbacks.push(callback);
            return;
        }

        this._pendingDocumentRequestCallbacks = [callback];

        function onDocumentAvailable(error, root)
        {
            if (!error)
                this._setDocument(root);

            for (var i = 0; i < this._pendingDocumentRequestCallbacks.length; ++i) {
                var callback = this._pendingDocumentRequestCallbacks[i];
                if (callback)
                    callback(this._document);
            }
            delete this._pendingDocumentRequestCallbacks;
        }

        DOMAgent.getDocument(onDocumentAvailable.bind(this));
    },

    pushNodeToFrontend: function(objectId, callback)
    {
        this._dispatchWhenDocumentAvailable(DOMAgent.requestNode.bind(DOMAgent), objectId, callback);
    },

    pushNodeByPathToFrontend: function(path, callback)
    {
        this._dispatchWhenDocumentAvailable(DOMAgent.pushNodeByPathToFrontend.bind(DOMAgent), path, callback);
    },

    _wrapClientCallback: function(callback)
    {
        if (!callback)
            return;
        return function(error, result)
        {
            if (error)
                console.error("Error during DOMAgent operation: " + error);
            callback(error ? null : result);
        }
    },

    _dispatchWhenDocumentAvailable: function(action)
    {
        var requestArguments = Array.prototype.slice.call(arguments, 1);
        var callbackWrapper;

        if (typeof requestArguments[requestArguments.length - 1] === "function") {
            var callback = requestArguments.pop();
            callbackWrapper = this._wrapClientCallback(callback);
            requestArguments.push(callbackWrapper);
        }
        function onDocumentAvailable()
        {
            if (this._document)
                action.apply(null, requestArguments);
            else {
                if (callbackWrapper)
                    callbackWrapper("No document");
            }
        }
        this.requestDocument(onDocumentAvailable.bind(this));
    },

    _attributesUpdated: function(nodeIds)
    {
        this._loadNodeAttributesSoon(nodeIds);
    },

    _inlineStyleInvalidated: function(nodeIds)
    {
        // FIXME: handle differently (we don't necessarily need to update attributes upon this message).
        this._loadNodeAttributesSoon(nodeIds);
    },

    _loadNodeAttributesSoon: function(nodeIds)
    {
        for (var i = 0; i < nodeIds.length; ++i)
            this._attributeLoadNodeIds[nodeIds[i]] = true;
        if ("_loadNodeAttributesTimeout" in this)
            return;
        this._loadNodeAttributesTimeout = setTimeout(this._loadNodeAttributes.bind(this), 0);
    },

    _loadNodeAttributes: function()
    {
        function callback(nodeId, attributes)
        {
            if (!attributes)
                return;
            var node = this._idToDOMNode[nodeId];
            if (node) {
                node._setAttributesPayload(attributes);
                this.dispatchEventToListeners(WebInspector.DOMAgent.Events.AttrModified, node);
            }
        }

        delete this._loadNodeAttributesTimeout;

        for (var nodeId in this._attributeLoadNodeIds)
            DOMAgent.getAttributes(parseInt(nodeId, 10), this._wrapClientCallback(callback.bind(this, nodeId)));
        this._attributeLoadNodeIds = {};
    },

    _characterDataModified: function(nodeId, newValue)
    {
        var node = this._idToDOMNode[nodeId];
        node._nodeValue = newValue;
        this.dispatchEventToListeners(WebInspector.DOMAgent.Events.CharacterDataModified, node);
    },

    nodeForId: function(nodeId)
    {
        return this._idToDOMNode[nodeId];
    },

    _documentUpdated: function()
    {
        this._setDocument(null);
        this.requestDocument();
    },

    /**
     * @param {*} payload
     */
    _setDocument: function(payload)
    {
        this._idToDOMNode = {};
        if (payload && "nodeId" in payload) {
            this._document = new WebInspector.DOMDocument(this, payload);
            this._idToDOMNode[payload.nodeId] = this._document;
            if (this._document.children)
                this._bindNodes(this._document.children);
        } else
            this._document = null;
        this.dispatchEventToListeners(WebInspector.DOMAgent.Events.DocumentUpdated, this._document);
    },

    /**
     * @param {*} payload
     */
    _setDetachedRoot: function(payload)
    {
        var root = new WebInspector.DOMNode(this._document, payload);
        this._idToDOMNode[payload.nodeId] = root;
    },

    _setChildNodes: function(parentId, payloads)
    {
        if (!parentId && payloads.length) {
            this._setDetachedRoot(payloads[0]);
            return;
        }

        var parent = this._idToDOMNode[parentId];
        parent._setChildrenPayload(payloads);
        this._bindNodes(parent.children);
    },

    _bindNodes: function(children)
    {
        for (var i = 0; i < children.length; ++i) {
            var child = children[i];
            this._idToDOMNode[child.id] = child;
            if (child.children)
                this._bindNodes(child.children);
        }
    },

    _childNodeCountUpdated: function(nodeId, newValue)
    {
        var node = this._idToDOMNode[nodeId];
        node._childNodeCount = newValue;
        this.dispatchEventToListeners(WebInspector.DOMAgent.Events.ChildNodeCountUpdated, node);
    },

    _childNodeInserted: function(parentId, prevId, payload)
    {
        var parent = this._idToDOMNode[parentId];
        var prev = this._idToDOMNode[prevId];
        var node = parent._insertChild(prev, payload);
        this._idToDOMNode[node.id] = node;
        this.dispatchEventToListeners(WebInspector.DOMAgent.Events.NodeInserted, node);
    },

    _childNodeRemoved: function(parentId, nodeId)
    {
        var parent = this._idToDOMNode[parentId];
        var node = this._idToDOMNode[nodeId];
        parent._removeChild(node);
        this.dispatchEventToListeners(WebInspector.DOMAgent.Events.NodeRemoved, {node:node, parent:parent});
        delete this._idToDOMNode[nodeId];
    },

    _inspectElementRequested: function(nodeId)
    {
        var node = this._idToDOMNode[nodeId];
        if (node)
            this.dispatchEventToListeners(WebInspector.DOMAgent.Events.InspectElementRequested, node);
    },

    performSearch: function(query, searchResultCollector, searchSynchronously)
    {
        this._searchResultCollector = searchResultCollector;
        DOMAgent.performSearch(query, !!searchSynchronously);
    },

    cancelSearch: function()
    {
        delete this._searchResultCollector;
        DOMAgent.cancelSearch();
    },

    querySelector: function(nodeId, selectors, callback)
    {
        DOMAgent.querySelector(nodeId, selectors, this._wrapClientCallback(callback));
    },

    querySelectorAll: function(nodeId, selectors, callback)
    {
        DOMAgent.querySelectorAll(nodeId, selectors, this._wrapClientCallback(callback));
    }
}

WebInspector.DOMAgent.prototype.__proto__ = WebInspector.Object.prototype;

/**
 * @constructor
 * @implements {DOMAgent.Dispatcher}
 */
WebInspector.DOMDispatcher = function(domAgent)
{
    this._domAgent = domAgent;
}

WebInspector.DOMDispatcher.prototype = {
    documentUpdated: function()
    {
        this._domAgent._documentUpdated();
    },

    attributesUpdated: function(nodeId)
    {
        this._domAgent._attributesUpdated([nodeId]);
    },

    inlineStyleInvalidated: function(nodeIds)
    {
        this._domAgent._inlineStyleInvalidated(nodeIds);
    },

    characterDataModified: function(nodeId, newValue)
    {
        this._domAgent._characterDataModified(nodeId, newValue);
    },

    setChildNodes: function(parentId, payloads)
    {
        this._domAgent._setChildNodes(parentId, payloads);
    },

    childNodeCountUpdated: function(nodeId, newValue)
    {
        this._domAgent._childNodeCountUpdated(nodeId, newValue);
    },

    childNodeInserted: function(parentId, prevId, payload)
    {
        this._domAgent._childNodeInserted(parentId, prevId, payload);
    },

    childNodeRemoved: function(parentId, nodeId)
    {
        this._domAgent._childNodeRemoved(parentId, nodeId);
    },

    inspectElementRequested: function(nodeId)
    {
        this._domAgent._inspectElementRequested(nodeId);
    },

    searchResults: function(nodeIds)
    {
        if (this._domAgent._searchResultCollector)
            this._domAgent._searchResultCollector(nodeIds);
    }
}

/**
 * @type {?WebInspector.DOMAgent}
 */
WebInspector.domAgent = null;
