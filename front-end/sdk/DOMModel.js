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
 * @extends {WebInspector.SDKObject}
 * @param {!WebInspector.DOMModel} domModel
 * @param {?WebInspector.DOMDocument} doc
 * @param {boolean} isInShadowTree
 * @param {!DOMAgent.Node} payload
 */
WebInspector.DOMNode = function(domModel, doc, isInShadowTree, payload) {
    WebInspector.SDKObject.call(this, domModel.target());
    this._domModel = domModel;
    this._agent = domModel._agent;
    this.ownerDocument = doc;
    this._isInShadowTree = isInShadowTree;

    this.id = payload.nodeId;
    domModel._idToDOMNode[this.id] = this;
    this._nodeType = payload.nodeType;
    this._nodeName = payload.nodeName;
    this._localName = payload.localName;
    this._nodeValue = payload.nodeValue;
    this._pseudoType = payload.pseudoType;
    this._shadowRootType = payload.shadowRootType;
    this._frameId = payload.frameId || null;

    this._shadowRoots = [];

    this._attributes = [];
    this._attributesMap = {};
    if (payload.attributes)
        this._setAttributesPayload(payload.attributes);

    this._userProperties = {};
    this._descendantUserPropertyCounters = {};

    this._childNodeCount = payload.childNodeCount || 0;
    this._children = null;

    this.nextSibling = null;
    this.previousSibling = null;
    this.firstChild = null;
    this.lastChild = null;
    this.parentNode = null;

    if (payload.shadowRoots) {
        for (var i = 0; i < payload.shadowRoots.length; ++i) {
            var root = payload.shadowRoots[i];
            var node = new WebInspector.DOMNode(this._domModel, this.ownerDocument, true, root);
            this._shadowRoots.push(node);
            node.parentNode = this;
        }
    }

    if (payload.templateContent) {
        this._templateContent = new WebInspector.DOMNode(this._domModel, this.ownerDocument, true, payload.templateContent);
        this._templateContent.parentNode = this;
    }

    if (payload.importedDocument) {
        this._importedDocument = new WebInspector.DOMNode(this._domModel, this.ownerDocument, true, payload.importedDocument);
        this._importedDocument.parentNode = this;
    }

    if (payload.children)
        this._setChildrenPayload(payload.children);

    this._setPseudoElements(payload.pseudoElements);

    if (payload.contentDocument) {
        this._contentDocument = new WebInspector.DOMDocument(domModel, payload.contentDocument);
        this._children = [this._contentDocument];
        this._renumber();
    }

    if (this._nodeType === Node.ELEMENT_NODE) {
        // HTML and BODY from internal iframes should not overwrite top-level ones.
        if (this.ownerDocument && !this.ownerDocument.documentElement && this._nodeName === "HTML")
            this.ownerDocument.documentElement = this;
        if (this.ownerDocument && !this.ownerDocument.body && this._nodeName === "BODY")
            this.ownerDocument.body = this;
    } else if (this._nodeType === Node.DOCUMENT_TYPE_NODE) {
        this.publicId = payload.publicId;
        this.systemId = payload.systemId;
        this.internalSubset = payload.internalSubset;
    } else if (this._nodeType === Node.ATTRIBUTE_NODE) {
        this.name = payload.name;
        this.value = payload.value;
    }
}

/**
 * @enum {string}
 */
WebInspector.DOMNode.PseudoElementNames = {
    Before: "before",
    After: "after"
}

/**
 * @enum {string}
 */
WebInspector.DOMNode.ShadowRootTypes = {
    UserAgent: "user-agent",
    Author: "author"
}

WebInspector.DOMNode.prototype = {
    /**
     * @return {!WebInspector.DOMModel}
     */
    domModel: function()
    {
        return this._domModel;
    },

    /**
     * @return {?Array.<!WebInspector.DOMNode>}
     */
    children: function()
    {
        return this._children ? this._children.slice() : null;
    },

    /**
     * @return {boolean}
     */
    hasAttributes: function()
    {
        return this._attributes.length > 0;
    },

    /**
     * @return {number}
     */
    childNodeCount: function()
    {
        return this._childNodeCount;
    },

    /**
     * @return {boolean}
     */
    hasShadowRoots: function()
    {
        return !!this._shadowRoots.length;
    },

    /**
     * @return {!Array.<!WebInspector.DOMNode>}
     */
    shadowRoots: function()
    {
        return this._shadowRoots.slice();
    },

    /**
     * @return {?WebInspector.DOMNode}
     */
    templateContent: function()
    {
        return this._templateContent || null;
    },

    /**
     * @return {?WebInspector.DOMNode}
     */
    importedDocument: function()
    {
        return this._importedDocument || null;
    },

    /**
     * @return {number}
     */
    nodeType: function()
    {
        return this._nodeType;
    },

    /**
     * @return {string}
     */
    nodeName: function()
    {
        return this._nodeName;
    },

    /**
     * @return {string|undefined}
     */
    pseudoType: function()
    {
        return this._pseudoType;
    },

    /**
     * @return {boolean}
     */
    hasPseudoElements: function()
    {
        return this._pseudoElements.size > 0;
    },

    /**
     * @return {!Map<string, !WebInspector.DOMNode>}
     */
    pseudoElements: function()
    {
        return this._pseudoElements;
    },

    /**
     * @return {?WebInspector.DOMNode}
     */
    beforePseudoElement: function()
    {
        if (!this._pseudoElements)
            return null;
        return this._pseudoElements.get(WebInspector.DOMNode.PseudoElementNames.Before);
    },

    /**
     * @return {?WebInspector.DOMNode}
     */
    afterPseudoElement: function()
    {
        if (!this._pseudoElements)
            return null;
        return this._pseudoElements.get(WebInspector.DOMNode.PseudoElementNames.After);
    },

    /**
     * @return {boolean}
     */
    isInShadowTree: function()
    {
        return this._isInShadowTree;
    },

    /**
     * @return {?WebInspector.DOMNode}
     */
    ancestorUserAgentShadowRoot: function()
    {
        if (!this._isInShadowTree)
            return null;

        var current = this;
        while (!current.isShadowRoot())
            current = current.parentNode;
        return current.shadowRootType() === WebInspector.DOMNode.ShadowRootTypes.UserAgent ? current : null;
    },

    /**
     * @return {boolean}
     */
    isShadowRoot: function()
    {
        return !!this._shadowRootType;
    },

    /**
     * @return {?string}
     */
    shadowRootType: function()
    {
        return this._shadowRootType || null;
    },

    /**
     * @return {string}
     */
    nodeNameInCorrectCase: function()
    {
        var shadowRootType = this.shadowRootType();
        if (shadowRootType)
            return "#shadow-root" + (shadowRootType === WebInspector.DOMNode.ShadowRootTypes.UserAgent ? " (user-agent)" : "");
        return this.isXMLNode() ? this.nodeName() : this.nodeName().toLowerCase();
    },

    /**
     * @param {string} name
     * @param {function(?Protocol.Error, number)=} callback
     */
    setNodeName: function(name, callback)
    {
        this._agent.setNodeName(this.id, name, this._domModel._markRevision(this, callback));
    },

    /**
     * @return {string}
     */
    localName: function()
    {
        return this._localName;
    },

    /**
     * @return {string}
     */
    nodeValue: function()
    {
        return this._nodeValue;
    },

    /**
     * @param {string} value
     * @param {function(?Protocol.Error)=} callback
     */
    setNodeValue: function(value, callback)
    {
        this._agent.setNodeValue(this.id, value, this._domModel._markRevision(this, callback));
    },

    /**
     * @param {string} name
     * @return {string}
     */
    getAttribute: function(name)
    {
        var attr = this._attributesMap[name];
        return attr ? attr.value : undefined;
    },

    /**
     * @param {string} name
     * @param {string} text
     * @param {function(?Protocol.Error)=} callback
     */
    setAttribute: function(name, text, callback)
    {
        this._agent.setAttributesAsText(this.id, text, name, this._domModel._markRevision(this, callback));
    },

    /**
     * @param {string} name
     * @param {string} value
     * @param {function(?Protocol.Error)=} callback
     */
    setAttributeValue: function(name, value, callback)
    {
        this._agent.setAttributeValue(this.id, name, value, this._domModel._markRevision(this, callback));
    },

    /**
     * @return {!Object}
     */
    attributes: function()
    {
        return this._attributes;
    },

    /**
     * @param {string} name
     * @param {function(?Protocol.Error)=} callback
     */
    removeAttribute: function(name, callback)
    {
        /**
         * @param {?Protocol.Error} error
         * @this {WebInspector.DOMNode}
         */
        function mycallback(error)
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

            this._domModel._markRevision(this, callback)(error);
        }
        this._agent.removeAttribute(this.id, name, mycallback.bind(this));
    },

    /**
     * @param {function(?Array.<!WebInspector.DOMNode>)=} callback
     */
    getChildNodes: function(callback)
    {
        if (this._children) {
            if (callback)
                callback(this.children());
            return;
        }

        /**
         * @this {WebInspector.DOMNode}
         * @param {?Protocol.Error} error
         */
        function mycallback(error)
        {
            if (callback)
                callback(error ? null : this.children());
        }

        this._agent.requestChildNodes(this.id, undefined, mycallback.bind(this));
    },

    /**
     * @param {number} depth
     * @param {function(?Array.<!WebInspector.DOMNode>)=} callback
     */
    getSubtree: function(depth, callback)
    {
        /**
         * @this {WebInspector.DOMNode}
         * @param {?Protocol.Error} error
         */
        function mycallback(error)
        {
            if (callback)
                callback(error ? null : this._children);
        }

        this._agent.requestChildNodes(this.id, depth, mycallback.bind(this));
    },

    /**
     * @param {function(?Protocol.Error, string)=} callback
     */
    getOuterHTML: function(callback)
    {
        this._agent.getOuterHTML(this.id, callback);
    },

    /**
     * @param {string} html
     * @param {function(?Protocol.Error)=} callback
     */
    setOuterHTML: function(html, callback)
    {
        this._agent.setOuterHTML(this.id, html, this._domModel._markRevision(this, callback));
    },

    /**
     * @param {function(?Protocol.Error, !DOMAgent.NodeId=)=} callback
     */
    removeNode: function(callback)
    {
        this._agent.removeNode(this.id, this._domModel._markRevision(this, callback));
    },

    /**
     * @param {function(?string)=} callback
     */
    copyNode: function(callback)
    {
        function copy(error, text)
        {
            if (!error)
                InspectorFrontendHost.copyText(text);
            if (callback)
                callback(error ? null : text);
        }
        this._agent.getOuterHTML(this.id, copy);
    },

    /**
     * @param {string} objectGroupId
     * @param {function(?Array.<!WebInspector.DOMModel.EventListener>)} callback
     */
    eventListeners: function(objectGroupId, callback)
    {
        var target = this.target();

        /**
         * @param {?Protocol.Error} error
         * @param {!Array.<!DOMAgent.EventListener>} payloads
         */
        function mycallback(error, payloads)
        {
            if (error) {
                callback(null);
                return;
            }
            callback(payloads.map(function(payload) {
                return new WebInspector.DOMModel.EventListener(target, payload);
            }));
        }
        this._agent.getEventListenersForNode(this.id, objectGroupId, mycallback);
    },

    /**
     * @return {string}
     */
    path: function()
    {
        /**
         * @param {?WebInspector.DOMNode} node
         */
        function canPush(node)
        {
            return node && ("index" in node || (node.isShadowRoot() && node.parentNode)) && node._nodeName.length;
        }

        var path = [];
        var node = this;
        while (canPush(node)) {
            var index = typeof node.index === "number" ? node.index : (node.shadowRootType() === WebInspector.DOMNode.ShadowRootTypes.UserAgent ? "u" : "a");
            path.push([index, node._nodeName]);
            node = node.parentNode;
        }
        path.reverse();
        return path.join(",");
    },

    /**
     * @param {!WebInspector.DOMNode} node
     * @return {boolean}
     */
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

    /**
     * @param {!WebInspector.DOMNode} descendant
     * @return {boolean}
     */
    isDescendant: function(descendant)
    {
        return descendant !== null && descendant.isAncestor(this);
    },

    /**
     * @return {?PageAgent.FrameId}
     */
    frameId: function()
    {
        var node = this;
        while (!node._frameId && node.parentNode)
            node = node.parentNode;
        return node._frameId;
    },

    /**
     * @param {!Array.<string>} attrs
     * @return {boolean}
     */
    _setAttributesPayload: function(attrs)
    {
        var attributesChanged = !this._attributes || attrs.length !== this._attributes.length * 2;
        var oldAttributesMap = this._attributesMap || {};

        this._attributes = [];
        this._attributesMap = {};

        for (var i = 0; i < attrs.length; i += 2) {
            var name = attrs[i];
            var value = attrs[i + 1];
            this._addAttribute(name, value);

            if (attributesChanged)
                continue;

            if (!oldAttributesMap[name] || oldAttributesMap[name].value !== value)
              attributesChanged = true;
        }
        return attributesChanged;
    },

    /**
     * @param {!WebInspector.DOMNode} prev
     * @param {!DOMAgent.Node} payload
     * @return {!WebInspector.DOMNode}
     */
    _insertChild: function(prev, payload)
    {
        var node = new WebInspector.DOMNode(this._domModel, this.ownerDocument, this._isInShadowTree, payload);
        this._children.splice(this._children.indexOf(prev) + 1, 0, node);
        this._renumber();
        return node;
    },

    /**
     * @param {!WebInspector.DOMNode} node
     */
    _removeChild: function(node)
    {
        if (node.pseudoType()) {
            this._pseudoElements.delete(node.pseudoType());
        } else {
            var shadowRootIndex = this._shadowRoots.indexOf(node);
            if (shadowRootIndex !== -1)
                this._shadowRoots.splice(shadowRootIndex, 1);
            else
                this._children.splice(this._children.indexOf(node), 1);
        }
        node.parentNode = null;
        node._updateChildUserPropertyCountsOnRemoval(this);
        this._renumber();
    },

    /**
     * @param {!Array.<!DOMAgent.Node>} payloads
     */
    _setChildrenPayload: function(payloads)
    {
        // We set children in the constructor.
        if (this._contentDocument)
            return;

        this._children = [];
        for (var i = 0; i < payloads.length; ++i) {
            var payload = payloads[i];
            var node = new WebInspector.DOMNode(this._domModel, this.ownerDocument, this._isInShadowTree, payload);
            this._children.push(node);
        }
        this._renumber();
    },

    /**
     * @param {!Array.<!DOMAgent.Node>|undefined} payloads
     */
    _setPseudoElements: function(payloads)
    {
        this._pseudoElements = new Map();
        if (!payloads)
            return;

        for (var i = 0; i < payloads.length; ++i) {
            var node = new WebInspector.DOMNode(this._domModel, this.ownerDocument, this._isInShadowTree, payloads[i]);
            node.parentNode = this;
            this._pseudoElements.set(node.pseudoType(), node);
        }
    },

    _renumber: function()
    {
        this._childNodeCount = this._children.length;
        if (this._childNodeCount == 0) {
            this.firstChild = null;
            this.lastChild = null;
            return;
        }
        this.firstChild = this._children[0];
        this.lastChild = this._children[this._childNodeCount - 1];
        for (var i = 0; i < this._childNodeCount; ++i) {
            var child = this._children[i];
            child.index = i;
            child.nextSibling = i + 1 < this._childNodeCount ? this._children[i + 1] : null;
            child.previousSibling = i - 1 >= 0 ? this._children[i - 1] : null;
            child.parentNode = this;
        }
    },

    /**
     * @param {string} name
     * @param {string} value
     */
    _addAttribute: function(name, value)
    {
        var attr = {
            name: name,
            value: value,
            _node: this
        };
        this._attributesMap[name] = attr;
        this._attributes.push(attr);
    },

    /**
     * @param {string} name
     * @param {string} value
     */
    _setAttribute: function(name, value)
    {
        var attr = this._attributesMap[name];
        if (attr)
            attr.value = value;
        else
            this._addAttribute(name, value);
    },

    /**
     * @param {string} name
     */
    _removeAttribute: function(name)
    {
        var attr = this._attributesMap[name];
        if (attr) {
            this._attributes.remove(attr);
            delete this._attributesMap[name];
        }
    },

    /**
     * @param {!WebInspector.DOMNode} targetNode
     * @param {?WebInspector.DOMNode} anchorNode
     * @param {function(?Protocol.Error, !DOMAgent.NodeId=)=} callback
     */
    copyTo: function(targetNode, anchorNode, callback)
    {
        this._agent.copyTo(this.id, targetNode.id, anchorNode ? anchorNode.id : undefined, this._domModel._markRevision(this, callback));
    },

    /**
     * @param {!WebInspector.DOMNode} targetNode
     * @param {?WebInspector.DOMNode} anchorNode
     * @param {function(?Protocol.Error, !DOMAgent.NodeId=)=} callback
     */
    moveTo: function(targetNode, anchorNode, callback)
    {
        this._agent.moveTo(this.id, targetNode.id, anchorNode ? anchorNode.id : undefined, this._domModel._markRevision(this, callback));
    },

    /**
     * @return {boolean}
     */
    isXMLNode: function()
    {
        return !!this.ownerDocument && !!this.ownerDocument.xmlVersion;
    },

    _updateChildUserPropertyCountsOnRemoval: function(parentNode)
    {
        var result = {};
        if (this._userProperties) {
            for (var name in this._userProperties)
                result[name] = (result[name] || 0) + 1;
        }

        if (this._descendantUserPropertyCounters) {
            for (var name in this._descendantUserPropertyCounters) {
                var counter = this._descendantUserPropertyCounters[name];
                result[name] = (result[name] || 0) + counter;
            }
        }

        for (var name in result)
            parentNode._updateDescendantUserPropertyCount(name, -result[name]);
    },

    _updateDescendantUserPropertyCount: function(name, delta)
    {
        if (!this._descendantUserPropertyCounters.hasOwnProperty(name))
            this._descendantUserPropertyCounters[name] = 0;
        this._descendantUserPropertyCounters[name] += delta;
        if (!this._descendantUserPropertyCounters[name])
            delete this._descendantUserPropertyCounters[name];
        if (this.parentNode)
            this.parentNode._updateDescendantUserPropertyCount(name, delta);
    },

    setUserProperty: function(name, value)
    {
        if (value === null) {
            this.removeUserProperty(name);
            return;
        }

        if (this.parentNode && !this._userProperties.hasOwnProperty(name))
            this.parentNode._updateDescendantUserPropertyCount(name, 1);

        this._userProperties[name] = value;
    },

    removeUserProperty: function(name)
    {
        if (!this._userProperties.hasOwnProperty(name))
            return;

        delete this._userProperties[name];
        if (this.parentNode)
            this.parentNode._updateDescendantUserPropertyCount(name, -1);
    },

    /**
     * @param {string} name
     * @return {?T}
     * @template T
     */
    getUserProperty: function(name)
    {
        return (this._userProperties && this._userProperties[name]) || null;
    },

    /**
     * @param {string} name
     * @return {number}
     */
    descendantUserPropertyCount: function(name)
    {
        return this._descendantUserPropertyCounters && this._descendantUserPropertyCounters[name] ? this._descendantUserPropertyCounters[name] : 0;
    },

    /**
     * @param {string} url
     * @return {?string}
     */
    resolveURL: function(url)
    {
        if (!url)
            return url;
        for (var frameOwnerCandidate = this; frameOwnerCandidate; frameOwnerCandidate = frameOwnerCandidate.parentNode) {
            if (frameOwnerCandidate.baseURL)
                return WebInspector.ParsedURL.completeURL(frameOwnerCandidate.baseURL, url);
        }
        return null;
    },

    /**
     * @param {string=} mode
     * @param {!RuntimeAgent.RemoteObjectId=} objectId
     */
    highlight: function(mode, objectId)
    {
        this._domModel.highlightDOMNode(this.id, mode, objectId);
    },

    highlightForTwoSeconds: function()
    {
        this._domModel.highlightDOMNodeForTwoSeconds(this.id);
    },

    /**
     * @param {string=} objectGroup
     * @param {function(?WebInspector.RemoteObject)=} callback
     */
    resolveToObject: function(objectGroup, callback)
    {
        this._agent.resolveNode(this.id, objectGroup, mycallback.bind(this));

        /**
         * @param {?Protocol.Error} error
         * @param {!RuntimeAgent.RemoteObject} object
         * @this {WebInspector.DOMNode}
         */
        function mycallback(error, object)
        {
            if (!callback)
                return;

            if (error || !object)
                callback(null);
            else
                callback(this.target().runtimeModel.createRemoteObject(object));
        }
    },

    /**
     * @param {function(?DOMAgent.BoxModel)} callback
     */
    boxModel: function(callback)
    {
        this._agent.getBoxModel(this.id, this._domModel._wrapClientCallback(callback));
    },

    __proto__: WebInspector.SDKObject.prototype
}

/**
 * @param {!WebInspector.Target} target
 * @param {number} backendNodeId
 * @constructor
 */
WebInspector.DeferredDOMNode = function(target, backendNodeId)
{
    this._target = target;
    this._backendNodeId = backendNodeId;
}

WebInspector.DeferredDOMNode.prototype = {
    /**
     * @param {function(?WebInspector.DOMNode)} callback
     */
    resolve: function(callback)
    {
        this._target.domModel.pushNodesByBackendIdsToFrontend([this._backendNodeId], onGotNode.bind(this));

        /**
         * @param {?Array.<number>} nodeIds
         * @this {WebInspector.DeferredDOMNode}
         */
        function onGotNode(nodeIds)
        {
            if (!nodeIds || !nodeIds[0]) {
                callback(null);
                return;
            }
            callback(this._target.domModel.nodeForId(nodeIds[0]));
        }
    }
}

/**
 * @extends {WebInspector.DOMNode}
 * @constructor
 * @param {!WebInspector.DOMModel} domModel
 * @param {!DOMAgent.Node} payload
 */
WebInspector.DOMDocument = function(domModel, payload)
{
    WebInspector.DOMNode.call(this, domModel, this, false, payload);
    this.documentURL = payload.documentURL || "";
    this.baseURL = payload.baseURL || "";
    this.xmlVersion = payload.xmlVersion;
    this._listeners = {};
}

WebInspector.DOMDocument.prototype = {
    __proto__: WebInspector.DOMNode.prototype
}

/**
 * @constructor
 * @extends {WebInspector.SDKModel}
 * @param {!WebInspector.Target} target
 */
WebInspector.DOMModel = function(target) {
    WebInspector.SDKModel.call(this, WebInspector.DOMModel, target);

    this._agent = target.domAgent();

    /** @type {!Object.<number, !WebInspector.DOMNode>} */
    this._idToDOMNode = {};
    /** @type {?WebInspector.DOMDocument} */
    this._document = null;
    /** @type {!Object.<number, boolean>} */
    this._attributeLoadNodeIds = {};
    target.registerDOMDispatcher(new WebInspector.DOMDispatcher(this));

    this._defaultHighlighter = new WebInspector.DefaultDOMNodeHighlighter(this._agent);
    this._highlighter = this._defaultHighlighter;

    this._agent.enable();
}

WebInspector.DOMModel.Events = {
    AttrModified: "AttrModified",
    AttrRemoved: "AttrRemoved",
    CharacterDataModified: "CharacterDataModified",
    NodeInserted: "NodeInserted",
    NodeInspected: "NodeInspected",
    NodeRemoved: "NodeRemoved",
    DocumentUpdated: "DocumentUpdated",
    ChildNodeCountUpdated: "ChildNodeCountUpdated",
    UndoRedoRequested: "UndoRedoRequested",
    UndoRedoCompleted: "UndoRedoCompleted",
}

WebInspector.DOMModel.prototype = {
    suspendModel: function()
    {
        this._agent.disable();
    },

    resumeModel: function()
    {
        this._agent.enable();
    },

    /**
     * @param {function(!WebInspector.DOMDocument)=} callback
     */
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

        /**
         * @this {WebInspector.DOMModel}
         * @param {?Protocol.Error} error
         * @param {!DOMAgent.Node} root
         */
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

        this._agent.getDocument(onDocumentAvailable.bind(this));
    },

    /**
     * @return {?WebInspector.DOMDocument}
     */
    existingDocument: function()
    {
        return this._document;
    },

    /**
     * @param {!RuntimeAgent.RemoteObjectId} objectId
     * @param {function(?WebInspector.DOMNode)=} callback
     */
    pushNodeToFrontend: function(objectId, callback)
    {
        /**
         * @param {?DOMAgent.NodeId} nodeId
         * @this {!WebInspector.DOMModel}
         */
        function mycallback(nodeId)
        {
            callback(nodeId ? this.nodeForId(nodeId) : null);
        }
        this._dispatchWhenDocumentAvailable(this._agent.requestNode.bind(this._agent, objectId), mycallback.bind(this));
    },

    /**
     * @param {string} path
     * @param {function(?number)=} callback
     */
    pushNodeByPathToFrontend: function(path, callback)
    {
        this._dispatchWhenDocumentAvailable(this._agent.pushNodeByPathToFrontend.bind(this._agent, path), callback);
    },

    /**
     * @param {!Array.<number>} backendNodeIds
     * @param {function(?Array.<number>)=} callback
     */
    pushNodesByBackendIdsToFrontend: function(backendNodeIds, callback)
    {
        this._dispatchWhenDocumentAvailable(this._agent.pushNodesByBackendIdsToFrontend.bind(this._agent, backendNodeIds), callback);
    },

    /**
     * @param {function(!T)=} callback
     * @return {function(?Protocol.Error, !T=)|undefined}
     * @template T
     */
    _wrapClientCallback: function(callback)
    {
        if (!callback)
            return;
        /**
         * @param {?Protocol.Error} error
         * @param {!T=} result
         * @template T
         */
        var wrapper = function(error, result)
        {
            // Caller is responsible for handling the actual error.
            callback(error ? null : result);
        };
        return wrapper;
    },

    /**
     * @param {function(function(?Protocol.Error, !T=)=)} func
     * @param {function(!T)=} callback
     * @template T
     */
    _dispatchWhenDocumentAvailable: function(func, callback)
    {
        var callbackWrapper = this._wrapClientCallback(callback);

        /**
         * @this {WebInspector.DOMModel}
         */
        function onDocumentAvailable()
        {
            if (this._document)
                func(callbackWrapper);
            else {
                if (callbackWrapper)
                    callbackWrapper("No document");
            }
        }
        this.requestDocument(onDocumentAvailable.bind(this));
    },

    /**
     * @param {!DOMAgent.NodeId} nodeId
     * @param {string} name
     * @param {string} value
     */
    _attributeModified: function(nodeId, name, value)
    {
        var node = this._idToDOMNode[nodeId];
        if (!node)
            return;

        node._setAttribute(name, value);
        this.dispatchEventToListeners(WebInspector.DOMModel.Events.AttrModified, { node: node, name: name });
    },

    /**
     * @param {!DOMAgent.NodeId} nodeId
     * @param {string} name
     */
    _attributeRemoved: function(nodeId, name)
    {
        var node = this._idToDOMNode[nodeId];
        if (!node)
            return;
        node._removeAttribute(name);
        this.dispatchEventToListeners(WebInspector.DOMModel.Events.AttrRemoved, { node: node, name: name });
    },

    /**
     * @param {!Array.<!DOMAgent.NodeId>} nodeIds
     */
    _inlineStyleInvalidated: function(nodeIds)
    {
        for (var i = 0; i < nodeIds.length; ++i)
            this._attributeLoadNodeIds[nodeIds[i]] = true;
        if ("_loadNodeAttributesTimeout" in this)
            return;
        this._loadNodeAttributesTimeout = setTimeout(this._loadNodeAttributes.bind(this), 20);
    },

    _loadNodeAttributes: function()
    {
        /**
         * @this {WebInspector.DOMModel}
         * @param {!DOMAgent.NodeId} nodeId
         * @param {?Protocol.Error} error
         * @param {!Array.<string>} attributes
         */
        function callback(nodeId, error, attributes)
        {
            if (error) {
                // We are calling _loadNodeAttributes asynchronously, it is ok if node is not found.
                return;
            }
            var node = this._idToDOMNode[nodeId];
            if (node) {
                if (node._setAttributesPayload(attributes))
                    this.dispatchEventToListeners(WebInspector.DOMModel.Events.AttrModified, { node: node, name: "style" });
            }
        }

        delete this._loadNodeAttributesTimeout;

        for (var nodeId in this._attributeLoadNodeIds) {
            var nodeIdAsNumber = parseInt(nodeId, 10);
            this._agent.getAttributes(nodeIdAsNumber, callback.bind(this, nodeIdAsNumber));
        }
        this._attributeLoadNodeIds = {};
    },

    /**
     * @param {!DOMAgent.NodeId} nodeId
     * @param {string} newValue
     */
    _characterDataModified: function(nodeId, newValue)
    {
        var node = this._idToDOMNode[nodeId];
        node._nodeValue = newValue;
        this.dispatchEventToListeners(WebInspector.DOMModel.Events.CharacterDataModified, node);
    },

    /**
     * @param {!DOMAgent.NodeId} nodeId
     * @return {?WebInspector.DOMNode}
     */
    nodeForId: function(nodeId)
    {
        return this._idToDOMNode[nodeId] || null;
    },

    _documentUpdated: function()
    {
        this._setDocument(null);
    },

    /**
     * @param {?DOMAgent.Node} payload
     */
    _setDocument: function(payload)
    {
        this._idToDOMNode = {};
        if (payload && "nodeId" in payload)
            this._document = new WebInspector.DOMDocument(this, payload);
        else
            this._document = null;
        this.dispatchEventToListeners(WebInspector.DOMModel.Events.DocumentUpdated, this._document);
    },

    /**
     * @param {!DOMAgent.Node} payload
     */
    _setDetachedRoot: function(payload)
    {
        if (payload.nodeName === "#document")
            new WebInspector.DOMDocument(this, payload);
        else
            new WebInspector.DOMNode(this, null, false, payload);
    },

    /**
     * @param {!DOMAgent.NodeId} parentId
     * @param {!Array.<!DOMAgent.Node>} payloads
     */
    _setChildNodes: function(parentId, payloads)
    {
        if (!parentId && payloads.length) {
            this._setDetachedRoot(payloads[0]);
            return;
        }

        var parent = this._idToDOMNode[parentId];
        parent._setChildrenPayload(payloads);
    },

    /**
     * @param {!DOMAgent.NodeId} nodeId
     * @param {number} newValue
     */
    _childNodeCountUpdated: function(nodeId, newValue)
    {
        var node = this._idToDOMNode[nodeId];
        node._childNodeCount = newValue;
        this.dispatchEventToListeners(WebInspector.DOMModel.Events.ChildNodeCountUpdated, node);
    },

    /**
     * @param {!DOMAgent.NodeId} parentId
     * @param {!DOMAgent.NodeId} prevId
     * @param {!DOMAgent.Node} payload
     */
    _childNodeInserted: function(parentId, prevId, payload)
    {
        var parent = this._idToDOMNode[parentId];
        var prev = this._idToDOMNode[prevId];
        var node = parent._insertChild(prev, payload);
        this._idToDOMNode[node.id] = node;
        this.dispatchEventToListeners(WebInspector.DOMModel.Events.NodeInserted, node);
    },

    /**
     * @param {!DOMAgent.NodeId} parentId
     * @param {!DOMAgent.NodeId} nodeId
     */
    _childNodeRemoved: function(parentId, nodeId)
    {
        var parent = this._idToDOMNode[parentId];
        var node = this._idToDOMNode[nodeId];
        parent._removeChild(node);
        this._unbind(node);
        this.dispatchEventToListeners(WebInspector.DOMModel.Events.NodeRemoved, {node: node, parent: parent});
    },

    /**
     * @param {!DOMAgent.NodeId} hostId
     * @param {!DOMAgent.Node} root
     */
    _shadowRootPushed: function(hostId, root)
    {
        var host = this._idToDOMNode[hostId];
        if (!host)
            return;
        var node = new WebInspector.DOMNode(this, host.ownerDocument, true, root);
        node.parentNode = host;
        this._idToDOMNode[node.id] = node;
        host._shadowRoots.push(node);
        this.dispatchEventToListeners(WebInspector.DOMModel.Events.NodeInserted, node);
    },

    /**
     * @param {!DOMAgent.NodeId} hostId
     * @param {!DOMAgent.NodeId} rootId
     */
    _shadowRootPopped: function(hostId, rootId)
    {
        var host = this._idToDOMNode[hostId];
        if (!host)
            return;
        var root = this._idToDOMNode[rootId];
        if (!root)
            return;
        host._removeChild(root);
        this._unbind(root);
        this.dispatchEventToListeners(WebInspector.DOMModel.Events.NodeRemoved, {node: root, parent: host});
    },

    /**
     * @param {!DOMAgent.NodeId} parentId
     * @param {!DOMAgent.Node} pseudoElement
     */
    _pseudoElementAdded: function(parentId, pseudoElement)
    {
        var parent = this._idToDOMNode[parentId];
        if (!parent)
            return;
        var node = new WebInspector.DOMNode(this, parent.ownerDocument, false, pseudoElement);
        node.parentNode = parent;
        this._idToDOMNode[node.id] = node;
        console.assert(!parent._pseudoElements.get(node.pseudoType()));
        parent._pseudoElements.set(node.pseudoType(), node);
        this.dispatchEventToListeners(WebInspector.DOMModel.Events.NodeInserted, node);
    },

    /**
     * @param {!DOMAgent.NodeId} parentId
     * @param {!DOMAgent.NodeId} pseudoElementId
     */
    _pseudoElementRemoved: function(parentId, pseudoElementId)
    {
        var parent = this._idToDOMNode[parentId];
        if (!parent)
            return;
        var pseudoElement = this._idToDOMNode[pseudoElementId];
        if (!pseudoElement)
            return;
        parent._removeChild(pseudoElement);
        this._unbind(pseudoElement);
        this.dispatchEventToListeners(WebInspector.DOMModel.Events.NodeRemoved, {node: pseudoElement, parent: parent});
    },

    /**
     * @param {!WebInspector.DOMNode} node
     */
    _unbind: function(node)
    {
        delete this._idToDOMNode[node.id];
        for (var i = 0; node._children && i < node._children.length; ++i)
            this._unbind(node._children[i]);
        for (var i = 0; i < node._shadowRoots.length; ++i)
            this._unbind(node._shadowRoots[i]);
        var pseudoElements = node.pseudoElements();
        for (var pseudoType of pseudoElements.keys())
            this._unbind(pseudoElements.get(pseudoType));
        if (node._templateContent)
            this._unbind(node._templateContent);
    },

    /**
     * @param {!DOMAgent.NodeId} nodeId
     */
    _inspectNodeRequested: function(nodeId)
    {
        this.dispatchEventToListeners(WebInspector.DOMModel.Events.NodeInspected, this.nodeForId(nodeId));
    },

    /**
     * @param {string} query
     * @param {boolean} includeUserAgentShadowDOM
     * @param {function(number)} searchCallback
     */
    performSearch: function(query, includeUserAgentShadowDOM, searchCallback)
    {
        this.cancelSearch();

        /**
         * @param {?Protocol.Error} error
         * @param {string} searchId
         * @param {number} resultsCount
         * @this {WebInspector.DOMModel}
         */
        function callback(error, searchId, resultsCount)
        {
            this._searchId = searchId;
            searchCallback(resultsCount);
        }
        this._agent.performSearch(query, includeUserAgentShadowDOM, callback.bind(this));
    },

    /**
     * @param {string} query
     * @param {boolean} includeUserAgentShadowDOM
     * @return {!Promise.<number>}
     */
    performSearchPromise: function(query, includeUserAgentShadowDOM)
    {
        return new Promise(performSearch.bind(this));

        /**
         * @param {function(number)} resolve
         * @this {WebInspector.DOMModel}
         */
        function performSearch(resolve)
        {
            this._agent.performSearch(query, includeUserAgentShadowDOM, callback.bind(this));

            /**
             * @param {?Protocol.Error} error
             * @param {string} searchId
             * @param {number} resultsCount
             * @this {WebInspector.DOMModel}
             */
            function callback(error, searchId, resultsCount)
            {
                if (!error)
                    this._searchId = searchId;
                resolve(error ? 0 : resultsCount);
            }
        }
    },

    /**
     * @param {number} index
     * @param {?function(?WebInspector.DOMNode)} callback
     */
    searchResult: function(index, callback)
    {
        if (this._searchId)
            this._agent.getSearchResults(this._searchId, index, index + 1, searchResultsCallback.bind(this));
        else
            callback(null);

        /**
         * @param {?Protocol.Error} error
         * @param {!Array.<number>} nodeIds
         * @this {WebInspector.DOMModel}
         */
        function searchResultsCallback(error, nodeIds)
        {
            if (error) {
                console.error(error);
                callback(null);
                return;
            }
            if (nodeIds.length != 1)
                return;

            callback(this.nodeForId(nodeIds[0]));
        }
    },

    cancelSearch: function()
    {
        if (this._searchId) {
            this._agent.discardSearchResults(this._searchId);
            delete this._searchId;
        }
    },

    /**
     * @param {!DOMAgent.NodeId} nodeId
     * @param {string} selectors
     * @param {function(?DOMAgent.NodeId)=} callback
     */
    querySelector: function(nodeId, selectors, callback)
    {
        this._agent.querySelector(nodeId, selectors, this._wrapClientCallback(callback));
    },

    /**
     * @param {!DOMAgent.NodeId} nodeId
     * @param {string} selectors
     * @param {function(!Array.<!DOMAgent.NodeId>=)=} callback
     */
    querySelectorAll: function(nodeId, selectors, callback)
    {
        this._agent.querySelectorAll(nodeId, selectors, this._wrapClientCallback(callback));
    },

    /**
     * @param {!DOMAgent.NodeId=} nodeId
     * @param {string=} mode
     * @param {!RuntimeAgent.RemoteObjectId=} objectId
     */
    highlightDOMNode: function(nodeId, mode, objectId)
    {
        this.highlightDOMNodeWithConfig(nodeId, { mode: mode }, objectId);
    },

    /**
     * @param {!DOMAgent.NodeId=} nodeId
     * @param {!{mode: (string|undefined), showInfo: (boolean|undefined)}=} config
     * @param {!RuntimeAgent.RemoteObjectId=} objectId
     */
    highlightDOMNodeWithConfig: function(nodeId, config, objectId)
    {
        config = config || { mode: "all", showInfo: undefined };
        if (this._hideDOMNodeHighlightTimeout) {
            clearTimeout(this._hideDOMNodeHighlightTimeout);
            delete this._hideDOMNodeHighlightTimeout;
        }
        var highlightConfig = this._buildHighlightConfig(config.mode);
        if (typeof config.showInfo !== "undefined")
            highlightConfig.showInfo = config.showInfo;
        this._highlighter.highlightDOMNode(this.nodeForId(nodeId || 0), highlightConfig, objectId);
    },

    hideDOMNodeHighlight: function()
    {
        this.highlightDOMNode(0);
    },

    /**
     * @param {!DOMAgent.NodeId} nodeId
     */
    highlightDOMNodeForTwoSeconds: function(nodeId)
    {
        this.highlightDOMNode(nodeId);
        this._hideDOMNodeHighlightTimeout = setTimeout(this.hideDOMNodeHighlight.bind(this), 2000);
    },

    /**
     * @param {boolean} enabled
     * @param {boolean} inspectUAShadowDOM
     * @param {function(?Protocol.Error)=} callback
     */
    setInspectModeEnabled: function(enabled, inspectUAShadowDOM, callback)
    {
        /**
         * @this {WebInspector.DOMModel}
         */
        function onDocumentAvailable()
        {
            this._highlighter.setInspectModeEnabled(enabled, inspectUAShadowDOM, this._buildHighlightConfig(), callback);
        }
        this.requestDocument(onDocumentAvailable.bind(this));
    },

    /**
     * @param {string=} mode
     * @return {!DOMAgent.HighlightConfig}
     */
    _buildHighlightConfig: function(mode)
    {
        mode = mode || "all";
        var highlightConfig = { showInfo: mode === "all", showRulers: WebInspector.overridesSupport.showMetricsRulers(), showExtensionLines: WebInspector.overridesSupport.showExtensionLines()};
        if (mode === "all" || mode === "content")
            highlightConfig.contentColor = WebInspector.Color.PageHighlight.Content.toProtocolRGBA();

        if (mode === "all" || mode === "padding")
            highlightConfig.paddingColor = WebInspector.Color.PageHighlight.Padding.toProtocolRGBA();

        if (mode === "all" || mode === "border")
            highlightConfig.borderColor = WebInspector.Color.PageHighlight.Border.toProtocolRGBA();

        if (mode === "all" || mode === "margin")
            highlightConfig.marginColor = WebInspector.Color.PageHighlight.Margin.toProtocolRGBA();

        if (mode === "all") {
            highlightConfig.eventTargetColor = WebInspector.Color.PageHighlight.EventTarget.toProtocolRGBA();
            highlightConfig.shapeColor = WebInspector.Color.PageHighlight.Shape.toProtocolRGBA();
            highlightConfig.shapeMarginColor = WebInspector.Color.PageHighlight.ShapeMargin.toProtocolRGBA();
        }
        return highlightConfig;
    },

    /**
     * @param {!WebInspector.DOMNode} node
     * @param {function(?Protocol.Error, ...)=} callback
     * @return {function(...)}
     * @template T
     */
    _markRevision: function(node, callback)
    {
        /**
         * @param {?Protocol.Error} error
         * @this {WebInspector.DOMModel}
         */
        function wrapperFunction(error)
        {
            if (!error)
                this.markUndoableState();

            if (callback)
                callback.apply(this, arguments);
        }
        return wrapperFunction.bind(this);
    },

    /**
     * @param {boolean} emulationEnabled
     * @param {string} configuration
     */
    emulateTouchEventObjects: function(emulationEnabled, configuration)
    {
        /**
         * @suppressGlobalPropertiesCheck
         */
        const injectedFunction = function() {
            const touchEvents = ["ontouchstart", "ontouchend", "ontouchmove", "ontouchcancel"];
            var recepients = [window.__proto__, document.__proto__];
            for (var i = 0; i < touchEvents.length; ++i) {
                for (var j = 0; j < recepients.length; ++j) {
                    if (!(touchEvents[i] in recepients[j]))
                        Object.defineProperty(recepients[j], touchEvents[i], { value: null, writable: true, configurable: true, enumerable: true });
                }
            }
        }

        if (emulationEnabled && !this._addTouchEventsScriptInjecting) {
            this._addTouchEventsScriptInjecting = true;
            PageAgent.addScriptToEvaluateOnLoad("(" + injectedFunction.toString() + ")()", scriptAddedCallback.bind(this));
        } else {
            if (typeof this._addTouchEventsScriptId !== "undefined") {
                PageAgent.removeScriptToEvaluateOnLoad(this._addTouchEventsScriptId);
                delete this._addTouchEventsScriptId;
            }
        }

        /**
         * @param {?Protocol.Error} error
         * @param {string} scriptId
         * @this {WebInspector.DOMModel}
         */
        function scriptAddedCallback(error, scriptId)
        {
            delete this._addTouchEventsScriptInjecting;
            if (error)
                return;
            this._addTouchEventsScriptId = scriptId;
        }

        PageAgent.setTouchEmulationEnabled(emulationEnabled, configuration);
    },

    markUndoableState: function()
    {
        this._agent.markUndoableState();
    },

    /**
     * @param {function(?Protocol.Error)=} callback
     */
    undo: function(callback)
    {
        /**
         * @param {?Protocol.Error} error
         * @this {WebInspector.DOMModel}
         */
        function mycallback(error)
        {
            this.dispatchEventToListeners(WebInspector.DOMModel.Events.UndoRedoCompleted);
            callback(error);
        }

        this.dispatchEventToListeners(WebInspector.DOMModel.Events.UndoRedoRequested);
        this._agent.undo(callback);
    },

    /**
     * @param {function(?Protocol.Error)=} callback
     */
    redo: function(callback)
    {
        /**
         * @param {?Protocol.Error} error
         * @this {WebInspector.DOMModel}
         */
        function mycallback(error)
        {
            this.dispatchEventToListeners(WebInspector.DOMModel.Events.UndoRedoCompleted);
            callback(error);
        }

        this.dispatchEventToListeners(WebInspector.DOMModel.Events.UndoRedoRequested);
        this._agent.redo(callback);
    },

    /**
     * @param {?WebInspector.DOMNodeHighlighter} highlighter
     */
    setHighlighter: function(highlighter)
    {
        this._highlighter = highlighter || this._defaultHighlighter;
    },

    /**
     * @param {number} x
     * @param {number} y
     * @param {function(?WebInspector.DOMNode)} callback
     */
    nodeForLocation: function(x, y, callback)
    {
        this._agent.getNodeForLocation(x, y, mycallback.bind(this));

        /**
         * @param {?Protocol.Error} error
         * @param {number} nodeId
         * @this {WebInspector.DOMModel}
         */
        function mycallback(error, nodeId)
        {
            if (error) {
                callback(null);
                return;
            }
            callback(this.nodeForId(nodeId));
        }
    },

    __proto__: WebInspector.SDKModel.prototype
}

/**
 * @constructor
 * @implements {DOMAgent.Dispatcher}
 * @param {!WebInspector.DOMModel} domModel
 */
WebInspector.DOMDispatcher = function(domModel)
{
    this._domModel = domModel;
}

WebInspector.DOMDispatcher.prototype = {
    documentUpdated: function()
    {
        this._domModel._documentUpdated();
    },

    /**
     * @param {!DOMAgent.NodeId} nodeId
     */
    inspectNodeRequested: function(nodeId)
    {
        this._domModel._inspectNodeRequested(nodeId);
    },

    /**
     * @param {!DOMAgent.NodeId} nodeId
     * @param {string} name
     * @param {string} value
     */
    attributeModified: function(nodeId, name, value)
    {
        this._domModel._attributeModified(nodeId, name, value);
    },

    /**
     * @param {!DOMAgent.NodeId} nodeId
     * @param {string} name
     */
    attributeRemoved: function(nodeId, name)
    {
        this._domModel._attributeRemoved(nodeId, name);
    },

    /**
     * @param {!Array.<!DOMAgent.NodeId>} nodeIds
     */
    inlineStyleInvalidated: function(nodeIds)
    {
        this._domModel._inlineStyleInvalidated(nodeIds);
    },

    /**
     * @param {!DOMAgent.NodeId} nodeId
     * @param {string} characterData
     */
    characterDataModified: function(nodeId, characterData)
    {
        this._domModel._characterDataModified(nodeId, characterData);
    },

    /**
     * @param {!DOMAgent.NodeId} parentId
     * @param {!Array.<!DOMAgent.Node>} payloads
     */
    setChildNodes: function(parentId, payloads)
    {
        this._domModel._setChildNodes(parentId, payloads);
    },

    /**
     * @param {!DOMAgent.NodeId} nodeId
     * @param {number} childNodeCount
     */
    childNodeCountUpdated: function(nodeId, childNodeCount)
    {
        this._domModel._childNodeCountUpdated(nodeId, childNodeCount);
    },

    /**
     * @param {!DOMAgent.NodeId} parentNodeId
     * @param {!DOMAgent.NodeId} previousNodeId
     * @param {!DOMAgent.Node} payload
     */
    childNodeInserted: function(parentNodeId, previousNodeId, payload)
    {
        this._domModel._childNodeInserted(parentNodeId, previousNodeId, payload);
    },

    /**
     * @param {!DOMAgent.NodeId} parentNodeId
     * @param {!DOMAgent.NodeId} nodeId
     */
    childNodeRemoved: function(parentNodeId, nodeId)
    {
        this._domModel._childNodeRemoved(parentNodeId, nodeId);
    },

    /**
     * @param {!DOMAgent.NodeId} hostId
     * @param {!DOMAgent.Node} root
     */
    shadowRootPushed: function(hostId, root)
    {
        this._domModel._shadowRootPushed(hostId, root);
    },

    /**
     * @param {!DOMAgent.NodeId} hostId
     * @param {!DOMAgent.NodeId} rootId
     */
    shadowRootPopped: function(hostId, rootId)
    {
        this._domModel._shadowRootPopped(hostId, rootId);
    },

    /**
     * @param {!DOMAgent.NodeId} parentId
     * @param {!DOMAgent.Node} pseudoElement
     */
    pseudoElementAdded: function(parentId, pseudoElement)
    {
        this._domModel._pseudoElementAdded(parentId, pseudoElement);
    },

    /**
     * @param {!DOMAgent.NodeId} parentId
     * @param {!DOMAgent.NodeId} pseudoElementId
     */
    pseudoElementRemoved: function(parentId, pseudoElementId)
    {
        this._domModel._pseudoElementRemoved(parentId, pseudoElementId);
    }
}

/**
 * @constructor
 * @extends {WebInspector.SDKObject}
 * @param {!WebInspector.Target} target
 * @param {!DOMAgent.EventListener} payload
 */
WebInspector.DOMModel.EventListener = function(target, payload)
{
    WebInspector.SDKObject.call(this, target);
    this._payload = payload;
    var sourceName = this._payload.sourceName;
    if (!sourceName) {
        var script = target.debuggerModel.scriptForId(payload.location.scriptId);
        sourceName = script ? script.contentURL() : "";
    }
    this._sourceName = sourceName;
}

WebInspector.DOMModel.EventListener.prototype = {
    /**
     * @return {!DOMAgent.EventListener}
     */
    payload: function()
    {
        return this._payload;
    },

    /**
     * @return {?WebInspector.DOMNode}
     */
    node: function()
    {
        return this.target().domModel.nodeForId(this._payload.nodeId);
    },

    /**
     * @return {!WebInspector.DebuggerModel.Location}
     */
    location: function()
    {
        return WebInspector.DebuggerModel.Location.fromPayload(this.target(), this._payload.location);
    },

    /**
     * @return {?WebInspector.RemoteObject}
     */
    handler: function()
    {
        return this._payload.handler ? this.target().runtimeModel.createRemoteObject(this._payload.handler) : null;
    },

    /**
     * @return {string}
     */
    sourceName: function()
    {
        return this._sourceName;
    },

    __proto__: WebInspector.SDKObject.prototype
}

/**
 * @interface
 */
WebInspector.DOMNodeHighlighter = function() {
}

WebInspector.DOMNodeHighlighter.prototype = {
    /**
     * @param {?WebInspector.DOMNode} node
     * @param {!DOMAgent.HighlightConfig} config
     * @param {!RuntimeAgent.RemoteObjectId=} objectId
     */
    highlightDOMNode: function(node, config, objectId) {},

    /**
     * @param {boolean} enabled
     * @param {boolean} inspectUAShadowDOM
     * @param {!DOMAgent.HighlightConfig} config
     * @param {function(?Protocol.Error)=} callback
     */
    setInspectModeEnabled: function(enabled, inspectUAShadowDOM, config, callback) {}
}

/**
 * @constructor
 * @implements {WebInspector.DOMNodeHighlighter}
 * @param {!Protocol.DOMAgent} agent
 */
WebInspector.DefaultDOMNodeHighlighter = function(agent)
{
    this._agent = agent;
}

WebInspector.DefaultDOMNodeHighlighter.prototype = {
    /**
     * @param {?WebInspector.DOMNode} node
     * @param {!DOMAgent.HighlightConfig} config
     * @param {!RuntimeAgent.RemoteObjectId=} objectId
     */
    highlightDOMNode: function(node, config, objectId)
    {
        if (objectId || node)
            this._agent.highlightNode(config, objectId ? undefined : node.id, objectId);
        else
            this._agent.hideHighlight();
    },

    /**
     * @param {boolean} enabled
     * @param {boolean} inspectUAShadowDOM
     * @param {!DOMAgent.HighlightConfig} config
     * @param {function(?Protocol.Error)=} callback
     */
    setInspectModeEnabled: function(enabled, inspectUAShadowDOM, config, callback)
    {
        WebInspector.overridesSupport.setTouchEmulationSuspended(enabled);
        this._agent.setInspectModeEnabled(enabled, inspectUAShadowDOM, config, callback);
    }
}
