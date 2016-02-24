/*
 * Copyright (C) 2011 Google Inc. All rights reserved.
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
 * @extends {WebInspector.BreakpointsSidebarPaneBase}
 */
WebInspector.DOMBreakpointsSidebarPane = function()
{
    WebInspector.BreakpointsSidebarPaneBase.call(this, WebInspector.UIString("DOM Breakpoints"));
    this._domBreakpointsSetting = WebInspector.settings.createLocalSetting("domBreakpoints", []);
    this.listElement.classList.add("dom-breakpoints-list");

    this._breakpointElements = {};

    this._breakpointTypes = {
        SubtreeModified: "subtree-modified",
        AttributeModified: "attribute-modified",
        NodeRemoved: "node-removed"
    };
    this._breakpointTypeLabels = {};
    this._breakpointTypeLabels[this._breakpointTypes.SubtreeModified] = WebInspector.UIString("Subtree Modified");
    this._breakpointTypeLabels[this._breakpointTypes.AttributeModified] = WebInspector.UIString("Attribute Modified");
    this._breakpointTypeLabels[this._breakpointTypes.NodeRemoved] = WebInspector.UIString("Node Removed");

    this._contextMenuLabels = {};
    this._contextMenuLabels[this._breakpointTypes.SubtreeModified] = WebInspector.UIString.capitalize("Subtree ^modifications");
    this._contextMenuLabels[this._breakpointTypes.AttributeModified] = WebInspector.UIString.capitalize("Attributes ^modifications");
    this._contextMenuLabels[this._breakpointTypes.NodeRemoved] = WebInspector.UIString.capitalize("Node ^removal");

    WebInspector.targetManager.addEventListener(WebInspector.TargetManager.Events.InspectedURLChanged, this._inspectedURLChanged, this);
    WebInspector.targetManager.addModelListener(WebInspector.DOMModel, WebInspector.DOMModel.Events.NodeRemoved, this._nodeRemoved, this);
}

WebInspector.DOMBreakpointsSidebarPane.Marker = "breakpoint-marker";

WebInspector.DOMBreakpointsSidebarPane.prototype = {
    _inspectedURLChanged: function(event)
    {
        this._breakpointElements = {};
        this.reset();
        var url = /** @type {string} */ (event.data);
        this._inspectedURL = url.removeURLFragment();
    },

    /**
     * @param {!WebInspector.DOMNode} node
     * @param {!WebInspector.ContextMenu} contextMenu
     * @param {boolean} createSubMenu
     */
    populateNodeContextMenu: function(node, contextMenu, createSubMenu)
    {
        if (node.pseudoType())
            return;

        var nodeBreakpoints = this._nodeBreakpoints(node);

        /**
         * @param {!DOMDebuggerAgent.DOMBreakpointType} type
         * @this {WebInspector.DOMBreakpointsSidebarPane}
         */
        function toggleBreakpoint(type)
        {
            if (!nodeBreakpoints[type])
                this._setBreakpoint(node, type, true);
            else
                this._removeBreakpoint(node, type);
            this._saveBreakpoints();
        }

        var breakpointsMenu = createSubMenu ? contextMenu.appendSubMenuItem(WebInspector.UIString("Break on...")) : contextMenu;
        for (var key in this._breakpointTypes) {
            var type = this._breakpointTypes[key];
            var label = this._contextMenuLabels[type];
            breakpointsMenu.appendCheckboxItem(label, toggleBreakpoint.bind(this, type), nodeBreakpoints[type]);
        }
    },

    /**
     * @param {!WebInspector.DOMNode} node
     * @return {!Object<string, boolean>}
     */
    _nodeBreakpoints: function(node)
    {
        var nodeBreakpoints = {};
        for (var id in this._breakpointElements) {
            var element = this._breakpointElements[id];
            if (element._node === node && element._checkboxElement.checked)
                nodeBreakpoints[element._type] = true;
        }
        return nodeBreakpoints;
    },

    /**
     * @param {!WebInspector.DOMNode} node
     * @return {boolean}
     */
    hasBreakpoints: function(node)
    {
        for (var id in this._breakpointElements) {
            var element = this._breakpointElements[id];
            if (element._node === node && element._checkboxElement.checked)
                return true;
        }
        return false;
    },

    /**
     * @param {!WebInspector.DebuggerPausedDetails} details
     * @param {function(!Element)} callback
     */
    createBreakpointHitStatusMessage: function(details, callback)
    {
        var auxData = /** @type {!Object} */ (details.auxData);
        var domModel = WebInspector.DOMModel.fromTarget(details.target());
        if (!domModel)
            return;
        if (auxData.type === this._breakpointTypes.SubtreeModified) {
            var targetNodeObject = details.target().runtimeModel.createRemoteObject(auxData["targetNode"]);
            domModel.pushObjectAsNodeToFrontend(targetNodeObject, didPushNodeToFrontend.bind(this));
        } else {
            this._doCreateBreakpointHitStatusMessage(auxData, domModel.nodeForId(auxData.nodeId), null, callback);
        }

        /**
         * @param {?WebInspector.DOMNode} targetNode
         * @this {WebInspector.DOMBreakpointsSidebarPane}
         */
        function didPushNodeToFrontend(targetNode)
        {
            if (targetNode)
                targetNodeObject.release();
            this._doCreateBreakpointHitStatusMessage(auxData, domModel.nodeForId(auxData.nodeId), targetNode, callback);
        }
    },

    /**
     * @param {!Object} auxData
     * @param {?WebInspector.DOMNode} node
     * @param {?WebInspector.DOMNode} targetNode
     * @param {function(!Element)} callback
     */
    _doCreateBreakpointHitStatusMessage: function(auxData, node, targetNode, callback)
    {
        var message;
        var typeLabel = this._breakpointTypeLabels[auxData.type];
        var linkifiedNode = WebInspector.DOMPresentationUtils.linkifyNodeReference(node);
        var substitutions = [typeLabel, linkifiedNode];
        var targetNodeLink = "";
        if (targetNode)
            targetNodeLink = WebInspector.DOMPresentationUtils.linkifyNodeReference(targetNode);

        if (auxData.type === this._breakpointTypes.SubtreeModified) {
            if (auxData.insertion) {
                if (targetNode !== node) {
                    message = "Paused on a \"%s\" breakpoint set on %s, because a new child was added to its descendant %s.";
                    substitutions.push(targetNodeLink);
                } else
                    message = "Paused on a \"%s\" breakpoint set on %s, because a new child was added to that node.";
            } else {
                message = "Paused on a \"%s\" breakpoint set on %s, because its descendant %s was removed.";
                substitutions.push(targetNodeLink);
            }
        } else
            message = "Paused on a \"%s\" breakpoint set on %s.";

        var element = WebInspector.formatLocalized(message, substitutions, "");

        callback(element);
    },

    _nodeRemoved: function(event)
    {
        var node = event.data.node;
        this._removeBreakpointsForNode(event.data.node);
        var children = node.children();
        if (!children)
            return;
        for (var i = 0; i < children.length; ++i)
            this._removeBreakpointsForNode(children[i]);
        this._saveBreakpoints();
    },

    /**
     * @param {!WebInspector.DOMNode} node
     */
    _removeBreakpointsForNode: function(node)
    {
        for (var id in this._breakpointElements) {
            var element = this._breakpointElements[id];
            if (element._node === node)
                this._removeBreakpoint(element._node, element._type);
        }
    },

    /**
     * @param {!WebInspector.DOMNode} node
     * @param {!DOMDebuggerAgent.DOMBreakpointType} type
     * @param {boolean} enabled
     */
    _setBreakpoint: function(node, type, enabled)
    {
        var breakpointId = this._createBreakpointId(node.id, type);
        var breakpointElement = this._breakpointElements[breakpointId];
        if (!breakpointElement) {
            breakpointElement = this._createBreakpointElement(node, type, enabled);
            this._breakpointElements[breakpointId] = breakpointElement;
        } else {
            breakpointElement._checkboxElement.checked = enabled;
        }
        if (enabled)
            node.target().domdebuggerAgent().setDOMBreakpoint(node.id, type);
        node.setMarker(WebInspector.DOMBreakpointsSidebarPane.Marker, true);
    },

    /**
     * @param {!WebInspector.DOMNode} node
     * @param {!DOMDebuggerAgent.DOMBreakpointType} type
     * @param {boolean} enabled
     */
    _createBreakpointElement: function(node, type, enabled)
    {
        var element = createElement("li");
        element._node = node;
        element._type = type;
        element.addEventListener("contextmenu", this._contextMenu.bind(this, node, type), true);

        var checkboxLabel = createCheckboxLabel("", enabled);
        checkboxLabel.addEventListener("click", this._checkboxClicked.bind(this, node, type), false);
        element._checkboxElement = checkboxLabel.checkboxElement;
        element.appendChild(checkboxLabel);

        var labelElement = createElementWithClass("div", "dom-breakpoint");
        element.appendChild(labelElement);

        var linkifiedNode = WebInspector.DOMPresentationUtils.linkifyNodeReference(node);
        linkifiedNode.classList.add("monospace");
        linkifiedNode.style.display = "block";
        labelElement.appendChild(linkifiedNode);

        var description = createElement("div");
        description.textContent = this._breakpointTypeLabels[type];
        labelElement.appendChild(description);

        var currentElement = this.listElement.firstChild;
        while (currentElement) {
            if (currentElement._type && currentElement._type < element._type)
                break;
            currentElement = currentElement.nextSibling;
        }
        this.addListElement(element, currentElement);
        return element;
    },

    _removeAllBreakpoints: function()
    {
        for (var id in this._breakpointElements) {
            var element = this._breakpointElements[id];
            this._removeBreakpoint(element._node, element._type);
        }
        this._saveBreakpoints();
    },

    /**
     * @param {!WebInspector.DOMNode} node
     * @param {!DOMDebuggerAgent.DOMBreakpointType} type
     */
    _removeBreakpoint: function(node, type)
    {
        var breakpointId = this._createBreakpointId(node.id, type);
        var element = this._breakpointElements[breakpointId];
        if (!element)
            return;

        this.removeListElement(element);
        delete this._breakpointElements[breakpointId];
        if (element._checkboxElement.checked)
            node.target().domdebuggerAgent().removeDOMBreakpoint(node.id, type);
        node.setMarker(WebInspector.DOMBreakpointsSidebarPane.Marker, this.hasBreakpoints(node) ? true : null);
    },

    /**
     * @param {!WebInspector.DOMNode} node
     * @param {!DOMDebuggerAgent.DOMBreakpointType} type
     * @param {!Event} event
     */
    _contextMenu: function(node, type, event)
    {
        var contextMenu = new WebInspector.ContextMenu(event);

        /**
         * @this {WebInspector.DOMBreakpointsSidebarPane}
         */
        function removeBreakpoint()
        {
            this._removeBreakpoint(node, type);
            this._saveBreakpoints();
        }
        contextMenu.appendItem(WebInspector.UIString.capitalize("Remove ^breakpoint"), removeBreakpoint.bind(this));
        contextMenu.appendItem(WebInspector.UIString.capitalize("Remove ^all DOM breakpoints"), this._removeAllBreakpoints.bind(this));
        contextMenu.show();
    },

    /**
     * @param {!WebInspector.DOMNode} node
     * @param {!DOMDebuggerAgent.DOMBreakpointType} type
     * @param {!Event} event
     */
    _checkboxClicked: function(node, type, event)
    {
        if (event.target.checked)
            node.target().domdebuggerAgent().setDOMBreakpoint(node.id, type);
        else
            node.target().domdebuggerAgent().removeDOMBreakpoint(node.id, type);
        this._saveBreakpoints();
    },

    highlightBreakpoint: function(auxData)
    {
        var breakpointId = this._createBreakpointId(auxData.nodeId, auxData.type);
        var element = this._breakpointElements[breakpointId];
        if (!element)
            return;
        this.expand();
        element.classList.add("breakpoint-hit");
        this._highlightedElement = element;
    },

    clearBreakpointHighlight: function()
    {
        if (this._highlightedElement) {
            this._highlightedElement.classList.remove("breakpoint-hit");
            delete this._highlightedElement;
        }
    },

    /**
     * @param {number} nodeId
     * @param {!DOMDebuggerAgent.DOMBreakpointType} type
     */
    _createBreakpointId: function(nodeId, type)
    {
        return nodeId + ":" + type;
    },

    _saveBreakpoints: function()
    {
        var breakpoints = [];
        var storedBreakpoints = this._domBreakpointsSetting.get();
        for (var i = 0; i < storedBreakpoints.length; ++i) {
            var breakpoint = storedBreakpoints[i];
            if (breakpoint.url !== this._inspectedURL)
                breakpoints.push(breakpoint);
        }
        for (var id in this._breakpointElements) {
            var element = this._breakpointElements[id];
            breakpoints.push({ url: this._inspectedURL, path: element._node.path(), type: element._type, enabled: element._checkboxElement.checked });
        }
        this._domBreakpointsSetting.set(breakpoints);
    },

    /**
     * @param {!WebInspector.DOMModel} domModel
     */
    restoreBreakpoints: function(domModel)
    {
        var pathToBreakpoints = {};

        /**
         * @param {string} path
         * @param {?DOMAgent.NodeId} nodeId
         * @this {WebInspector.DOMBreakpointsSidebarPane}
         */
        function didPushNodeByPathToFrontend(path, nodeId)
        {
            var node = nodeId ? domModel.nodeForId(nodeId) : null;
            if (!node)
                return;

            var breakpoints = pathToBreakpoints[path];
            for (var i = 0; i < breakpoints.length; ++i)
                this._setBreakpoint(node, breakpoints[i].type, breakpoints[i].enabled);
        }

        var breakpoints = this._domBreakpointsSetting.get();
        for (var i = 0; i < breakpoints.length; ++i) {
            var breakpoint = breakpoints[i];
            if (breakpoint.url !== this._inspectedURL)
                continue;
            var path = breakpoint.path;
            if (!pathToBreakpoints[path]) {
                pathToBreakpoints[path] = [];
                domModel.pushNodeByPathToFrontend(path, didPushNodeByPathToFrontend.bind(this, path));
            }
            pathToBreakpoints[path].push(breakpoint);
        }
    },

    /**
     * @param {!WebInspector.Panel} panel
     * @return {!WebInspector.DOMBreakpointsSidebarPane.Proxy}
     */
    createProxy: function(panel)
    {
        var proxy = new WebInspector.DOMBreakpointsSidebarPane.Proxy(this, panel);
        if (!this._proxies)
            this._proxies = [];
        this._proxies.push(proxy);
        return proxy;
    },

    onContentReady: function()
    {
        for (var i = 0; i != this._proxies.length; i++)
            this._proxies[i].onContentReady();
    },

    __proto__: WebInspector.BreakpointsSidebarPaneBase.prototype
}

/**
 * @constructor
 * @extends {WebInspector.SidebarPane}
 * @param {!WebInspector.DOMBreakpointsSidebarPane} pane
 * @param {!WebInspector.Panel} panel
 */
WebInspector.DOMBreakpointsSidebarPane.Proxy = function(pane, panel)
{
    WebInspector.SidebarPane.call(this, pane.title());
    this.registerRequiredCSS("components/breakpointsList.css");

    this._wrappedPane = pane;
    this._panel = panel;
}

WebInspector.DOMBreakpointsSidebarPane.Proxy.prototype = {
    expand: function()
    {
        this._wrappedPane.expand();
    },

    onContentReady: function()
    {
        if (this._panel.isShowing())
            this._reattachBody();

        WebInspector.SidebarPane.prototype.onContentReady.call(this);
    },

    wasShown: function()
    {
        WebInspector.SidebarPane.prototype.wasShown.call(this);
        this._reattachBody();
    },

    _reattachBody: function()
    {
        if (this._wrappedPane.element.parentNode !== this.element)
            this._wrappedPane.show(this.element);
    },

    __proto__: WebInspector.SidebarPane.prototype
}

/**
 * @constructor
 * @implements {WebInspector.DOMPresentationUtils.MarkerDecorator}
 */
WebInspector.DOMBreakpointsSidebarPane.MarkerDecorator = function()
{
}

WebInspector.DOMBreakpointsSidebarPane.MarkerDecorator.prototype = {
    /**
     * @override
     * @param {!WebInspector.DOMNode} node
     * @return {?{title: string, color: string}}
     */
    decorate: function(node)
    {
        return { title: WebInspector.UIString("DOM Breakpoint"), color: "rgb(105, 140, 254)" };
    }
}

/**
 * @type {!WebInspector.DOMBreakpointsSidebarPane}
 */
WebInspector.domBreakpointsSidebarPane;
