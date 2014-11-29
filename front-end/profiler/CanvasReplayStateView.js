/*
 * Copyright (C) 2013 Google Inc. All rights reserved.
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
 * @extends {WebInspector.VBox}
 * @param {!WebInspector.CanvasTraceLogPlayerProxy} traceLogPlayer
 */
WebInspector.CanvasReplayStateView = function(traceLogPlayer)
{
    WebInspector.VBox.call(this);
    this.registerRequiredCSS("profiler/canvasProfiler.css");
    this.element.classList.add("canvas-replay-state-view");
    this._traceLogPlayer = traceLogPlayer;

    var controlsToolbar = new WebInspector.StatusBar(this.element);
    this._prevButton = this._createControlButton(controlsToolbar, "play-backwards-step-status-bar-item", WebInspector.UIString("Previous resource."), this._onResourceNavigationClick.bind(this, false));
    this._nextButton = this._createControlButton(controlsToolbar, "play-status-bar-item", WebInspector.UIString("Next resource."), this._onResourceNavigationClick.bind(this, true));
    this._createControlButton(controlsToolbar, "refresh-status-bar-item", WebInspector.UIString("Refresh."), this._onStateRefreshClick.bind(this));

    this._resourceSelector = new WebInspector.StatusBarComboBox(this._onReplayResourceChanged.bind(this));
    this._currentOption = this._resourceSelector.createOption(WebInspector.UIString("<auto>"), WebInspector.UIString("Show state of the last replayed resource."), "");
    controlsToolbar.appendStatusBarItem(this._resourceSelector);

    /** @type {!Object.<string, string>} */
    this._resourceIdToDescription = {};

    /** @type {!Object.<string, !Object.<string, boolean>>} */
    this._gridNodesExpandedState = {};
    /** @type {!Object.<string, !{scrollTop: number, scrollLeft: number}>} */
    this._gridScrollPositions = {};

    /** @type {?CanvasAgent.ResourceId} */
    this._currentResourceId = null;
    /** @type {!Array.<!Element>} */
    this._prevOptionsStack = [];
    /** @type {!Array.<!Element>} */
    this._nextOptionsStack = [];

    /** @type {!Array.<!WebInspector.DataGridNode>} */
    this._highlightedGridNodes = [];

    var columns = [
        {title: WebInspector.UIString("Name"), sortable: false, width: "50%", disclosure: true},
        {title: WebInspector.UIString("Value"), sortable: false, width: "50%"}
    ];

    this._stateGrid = new WebInspector.DataGrid(columns);
    this._stateGrid.element.classList.add("fill");
    this._stateGrid.show(this.element);

    this._traceLogPlayer.addEventListener(WebInspector.CanvasTraceLogPlayerProxy.Events.CanvasReplayStateChanged, this._onReplayResourceChanged, this);
    this._traceLogPlayer.addEventListener(WebInspector.CanvasTraceLogPlayerProxy.Events.CanvasTraceLogReceived, this._onCanvasTraceLogReceived, this);
    this._traceLogPlayer.addEventListener(WebInspector.CanvasTraceLogPlayerProxy.Events.CanvasResourceStateReceived, this._onCanvasResourceStateReceived, this);

    this._updateButtonsEnabledState();
}

WebInspector.CanvasReplayStateView.prototype = {
    /**
     * @param {string} resourceId
     */
    selectResource: function(resourceId)
    {
        if (resourceId === this._resourceSelector.selectedOption().value)
            return;
        var option = this._resourceSelector.selectElement().firstChild;
        for (var index = 0; option; ++index, option = option.nextSibling) {
            if (resourceId === option.value) {
                this._resourceSelector.setSelectedIndex(index);
                this._onReplayResourceChanged();
                break;
            }
        }
    },

    /**
     * @param {!WebInspector.StatusBar} toolbar
     * @param {string} className
     * @param {string} title
     * @param {function(this:WebInspector.CanvasProfileView)} clickCallback
     * @return {!WebInspector.StatusBarButton}
     */
    _createControlButton: function(toolbar, className, title, clickCallback)
    {
        var button = new WebInspector.StatusBarButton(title, className);
        toolbar.appendStatusBarItem(button);

        button.makeLongClickEnabled();
        button.addEventListener("click", clickCallback, this);
        button.addEventListener("longClickDown", clickCallback, this);
        button.addEventListener("longClickPress", clickCallback, this);
        return button;
    },

    /**
     * @param {boolean} forward
     */
    _onResourceNavigationClick: function(forward)
    {
        var newOption = forward ? this._nextOptionsStack.pop() : this._prevOptionsStack.pop();
        if (!newOption)
            return;
        (forward ? this._prevOptionsStack : this._nextOptionsStack).push(this._currentOption);
        this._isNavigationButton = true;
        this.selectResource(newOption.value);
        delete this._isNavigationButton;
        this._updateButtonsEnabledState();
    },

    _onStateRefreshClick: function()
    {
        this._traceLogPlayer.clearResourceStates();
    },

    _updateButtonsEnabledState: function()
    {
        this._prevButton.setEnabled(this._prevOptionsStack.length > 0);
        this._nextButton.setEnabled(this._nextOptionsStack.length > 0);
    },

    _updateCurrentOption: function()
    {
        const maxStackSize = 256;
        var selectedOption = this._resourceSelector.selectedOption();
        if (this._currentOption === selectedOption)
            return;
        if (!this._isNavigationButton) {
            this._prevOptionsStack.push(this._currentOption);
            this._nextOptionsStack = [];
            if (this._prevOptionsStack.length > maxStackSize)
                this._prevOptionsStack.shift();
            this._updateButtonsEnabledState();
        }
        this._currentOption = selectedOption;
    },

    /**
     * @param {!CanvasAgent.TraceLog} traceLog
     */
    _collectResourcesFromTraceLog: function(traceLog)
    {
        /** @type {!Array.<!CanvasAgent.CallArgument>} */
        var collectedResources = [];
        var calls = traceLog.calls;
        for (var i = 0, n = calls.length; i < n; ++i) {
            var call = calls[i];
            var args = call.arguments || [];
            for (var j = 0; j < args.length; ++j)
                this._collectResourceFromCallArgument(args[j], collectedResources);
            this._collectResourceFromCallArgument(call.result, collectedResources);
            this._collectResourceFromCallArgument(call.value, collectedResources);
        }
        var contexts = traceLog.contexts;
        for (var i = 0, n = contexts.length; i < n; ++i)
            this._collectResourceFromCallArgument(contexts[i], collectedResources);
        this._addCollectedResourcesToSelector(collectedResources);
    },

    /**
     * @param {!CanvasAgent.ResourceState} resourceState
     */
    _collectResourcesFromResourceState: function(resourceState)
    {
        /** @type {!Array.<!CanvasAgent.CallArgument>} */
        var collectedResources = [];
        this._collectResourceFromResourceStateDescriptors(resourceState.descriptors, collectedResources);
        this._addCollectedResourcesToSelector(collectedResources);
    },

    /**
     * @param {!Array.<!CanvasAgent.ResourceStateDescriptor>|undefined} descriptors
     * @param {!Array.<!CanvasAgent.CallArgument>} output
     */
    _collectResourceFromResourceStateDescriptors: function(descriptors, output)
    {
        if (!descriptors)
            return;
        for (var i = 0, n = descriptors.length; i < n; ++i) {
            var descriptor = descriptors[i];
            this._collectResourceFromCallArgument(descriptor.value, output);
            this._collectResourceFromResourceStateDescriptors(descriptor.values, output);
        }
    },

    /**
     * @param {!CanvasAgent.CallArgument|undefined} argument
     * @param {!Array.<!CanvasAgent.CallArgument>} output
     */
    _collectResourceFromCallArgument: function(argument, output)
    {
        if (!argument)
            return;
        var resourceId = argument.resourceId;
        if (!resourceId || this._resourceIdToDescription[resourceId])
            return;
        this._resourceIdToDescription[resourceId] = argument.description;
        output.push(argument);
    },

    /**
     * @param {!Array.<!CanvasAgent.CallArgument>} collectedResources
     */
    _addCollectedResourcesToSelector: function(collectedResources)
    {
        if (!collectedResources.length)
            return;
        /**
         * @param {!CanvasAgent.CallArgument} arg1
         * @param {!CanvasAgent.CallArgument} arg2
         * @return {number}
         */
        function comparator(arg1, arg2)
        {
            var a = arg1.description;
            var b = arg2.description;
            return String.naturalOrderComparator(a, b);
        }
        collectedResources.sort(comparator);

        var selectElement = this._resourceSelector.selectElement();
        var currentOption = selectElement.firstChild;
        currentOption = currentOption.nextSibling; // Skip the "<auto>" option.
        for (var i = 0, n = collectedResources.length; i < n; ++i) {
            var argument = collectedResources[i];
            while (currentOption && String.naturalOrderComparator(currentOption.text, argument.description) < 0)
                currentOption = currentOption.nextSibling;
            var option = this._resourceSelector.createOption(argument.description, WebInspector.UIString("Show state of this resource."), argument.resourceId);
            if (currentOption)
                selectElement.insertBefore(option, currentOption);
        }
    },

    _onReplayResourceChanged: function()
    {
        this._updateCurrentOption();
        var selectedResourceId = this._resourceSelector.selectedOption().value;

        /**
         * @param {?CanvasAgent.ResourceState} resourceState
         * @this {WebInspector.CanvasReplayStateView}
         */
        function didReceiveResourceState(resourceState)
        {
            if (selectedResourceId !== this._resourceSelector.selectedOption().value)
                return;
            this._showResourceState(resourceState);
        }
        this._traceLogPlayer.getResourceState(selectedResourceId, didReceiveResourceState.bind(this));
    },

    /**
     * @param {!WebInspector.Event} event
     */
    _onCanvasTraceLogReceived: function(event)
    {
        var traceLog = /** @type {!CanvasAgent.TraceLog} */ (event.data);
        console.assert(traceLog);
        this._collectResourcesFromTraceLog(traceLog);
    },

    /**
     * @param {!WebInspector.Event} event
     */
    _onCanvasResourceStateReceived: function(event)
    {
        var resourceState = /** @type {!CanvasAgent.ResourceState} */ (event.data);
        console.assert(resourceState);
        this._collectResourcesFromResourceState(resourceState);
    },

    /**
     * @param {?CanvasAgent.ResourceState} resourceState
     */
    _showResourceState: function(resourceState)
    {
        this._saveExpandedState();
        this._saveScrollState();

        var rootNode = this._stateGrid.rootNode();
        if (!resourceState) {
            this._currentResourceId = null;
            this._updateDataGridHighlights([]);
            rootNode.removeChildren();
            return;
        }

        var nodesToHighlight = [];
        var nameToOldGridNodes = {};

        /**
         * @param {!Object} map
         * @param {!WebInspector.DataGridNode=} node
         */
        function populateNameToNodesMap(map, node)
        {
            if (!node)
                return;
            for (var i = 0, child; child = node.children[i]; ++i) {
                var item = {
                    node: child,
                    children: {}
                };
                map[child.name] = item;
                populateNameToNodesMap(item.children, child);
            }
        }
        populateNameToNodesMap(nameToOldGridNodes, rootNode);
        rootNode.removeChildren();

        /**
         * @param {!CanvasAgent.ResourceStateDescriptor} d1
         * @param {!CanvasAgent.ResourceStateDescriptor} d2
         * @return {number}
         */
        function comparator(d1, d2)
        {
            var hasChildren1 = !!d1.values;
            var hasChildren2 = !!d2.values;
            if (hasChildren1 !== hasChildren2)
                return hasChildren1 ? 1 : -1;
            return String.naturalOrderComparator(d1.name, d2.name);
        }
        /**
         * @param {!Array.<!CanvasAgent.ResourceStateDescriptor>|undefined} descriptors
         * @param {!WebInspector.DataGridNode} parent
         * @param {!Object=} nameToOldChildren
         * @this {WebInspector.CanvasReplayStateView}
         */
        function appendResourceStateDescriptors(descriptors, parent, nameToOldChildren)
        {
            descriptors = descriptors || [];
            descriptors.sort(comparator);
            var oldChildren = nameToOldChildren || {};
            for (var i = 0, n = descriptors.length; i < n; ++i) {
                var descriptor = descriptors[i];
                var childNode = this._createDataGridNode(descriptor);
                parent.appendChild(childNode);
                var oldChildrenItem = oldChildren[childNode.name] || {};
                var oldChildNode = oldChildrenItem.node;
                if (!oldChildNode || oldChildNode.element().textContent !== childNode.element().textContent)
                    nodesToHighlight.push(childNode);
                appendResourceStateDescriptors.call(this, descriptor.values, childNode, oldChildrenItem.children);
            }
        }
        appendResourceStateDescriptors.call(this, resourceState.descriptors, rootNode, nameToOldGridNodes);

        var shouldHighlightChanges = (this._resourceKindId(this._currentResourceId) === this._resourceKindId(resourceState.id));
        this._currentResourceId = resourceState.id;
        this._restoreExpandedState();
        this._updateDataGridHighlights(shouldHighlightChanges ? nodesToHighlight : []);
        this._restoreScrollState();
    },

    /**
     * @param {!Array.<!WebInspector.DataGridNode>} nodes
     */
    _updateDataGridHighlights: function(nodes)
    {
        for (var i = 0, n = this._highlightedGridNodes.length; i < n; ++i)
            this._highlightedGridNodes[i].element().classList.remove("canvas-grid-node-highlighted");

        this._highlightedGridNodes = nodes;

        for (var i = 0, n = this._highlightedGridNodes.length; i < n; ++i) {
            var node = this._highlightedGridNodes[i];
            WebInspector.runCSSAnimationOnce(node.element(), "canvas-grid-node-highlighted");
            node.reveal();
        }
    },

    /**
     * @param {?CanvasAgent.ResourceId} resourceId
     * @return {string}
     */
    _resourceKindId: function(resourceId)
    {
        var description = (resourceId && this._resourceIdToDescription[resourceId]) || "";
        return description.replace(/\d+/g, "");
    },

    /**
     * @param {function(!WebInspector.DataGridNode, string):void} callback
     */
    _forEachGridNode: function(callback)
    {
        /**
         * @param {!WebInspector.DataGridNode} node
         * @param {string} key
         */
        function processRecursively(node, key)
        {
            for (var i = 0, child; child = node.children[i]; ++i) {
                var childKey = key + "#" + child.name;
                callback(child, childKey);
                processRecursively(child, childKey);
            }
        }
        processRecursively(this._stateGrid.rootNode(), "");
    },

    _saveExpandedState: function()
    {
        if (!this._currentResourceId)
            return;
        var expandedState = {};
        var key = this._resourceKindId(this._currentResourceId);
        this._gridNodesExpandedState[key] = expandedState;
        /**
         * @param {!WebInspector.DataGridNode} node
         * @param {string} key
         */
        function callback(node, key)
        {
            if (node.expanded)
                expandedState[key] = true;
        }
        this._forEachGridNode(callback);
    },

    _restoreExpandedState: function()
    {
        if (!this._currentResourceId)
            return;
        var key = this._resourceKindId(this._currentResourceId);
        var expandedState = this._gridNodesExpandedState[key];
        if (!expandedState)
            return;
        /**
         * @param {!WebInspector.DataGridNode} node
         * @param {string} key
         */
        function callback(node, key)
        {
            if (expandedState[key])
                node.expand();
        }
        this._forEachGridNode(callback);
    },

    _saveScrollState: function()
    {
        if (!this._currentResourceId)
            return;
        var key = this._resourceKindId(this._currentResourceId);
        this._gridScrollPositions[key] = {
            scrollTop: this._stateGrid.scrollContainer.scrollTop,
            scrollLeft: this._stateGrid.scrollContainer.scrollLeft
        };
    },

    _restoreScrollState: function()
    {
        if (!this._currentResourceId)
            return;
        var key = this._resourceKindId(this._currentResourceId);
        var scrollState = this._gridScrollPositions[key];
        if (!scrollState)
            return;
        this._stateGrid.scrollContainer.scrollTop = scrollState.scrollTop;
        this._stateGrid.scrollContainer.scrollLeft = scrollState.scrollLeft;
    },

    /**
     * @param {!CanvasAgent.ResourceStateDescriptor} descriptor
     * @return {!WebInspector.DataGridNode}
     */
    _createDataGridNode: function(descriptor)
    {
        var name = descriptor.name;
        var callArgument = descriptor.value;

        /** @type {!Element|string} */
        var valueElement = callArgument ? WebInspector.CanvasProfileDataGridHelper.createCallArgumentElement(callArgument) : "";

        /** @type {!Element|string} */
        var nameElement = name;
        if (typeof descriptor.enumValueForName !== "undefined")
            nameElement = WebInspector.CanvasProfileDataGridHelper.createEnumValueElement(name, +descriptor.enumValueForName);

        if (descriptor.isArray && descriptor.values) {
            if (typeof nameElement === "string")
                nameElement += "[" + descriptor.values.length + "]";
            else {
                var element = createElement("span");
                element.appendChild(nameElement);
                element.createTextChild("[" + descriptor.values.length + "]");
                nameElement = element;
            }
        }

        var data = {};
        data[0] = nameElement;
        data[1] = valueElement;
        var node = new WebInspector.DataGridNode(data);
        node.selectable = false;
        node.name = name;
        return node;
    },

    __proto__: WebInspector.VBox.prototype
}
