// Copyright 2015 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

/**
 * @constructor
 * @extends {WebInspector.ThrottledWidget}
 */
WebInspector.AccessibilitySidebarView = function()
{
    WebInspector.ThrottledWidget.call(this);
    this._computedTextSubPane = null;
    this._axNodeSubPane = null;
    this._node = null;
    this._sidebarPaneStack = null;
    WebInspector.context.addFlavorChangeListener(WebInspector.DOMNode, this._pullNode, this);
    this._pullNode();
}

WebInspector.AccessibilitySidebarView.prototype = {
    /**
     * @return {?WebInspector.DOMNode}
     */
    node: function()
    {
        return this._node;
    },

    /**
     * @override
     * @protected
     * @return {!Promise.<?>}
     */
    doUpdate: function()
    {
        /**
         * @param {?AccessibilityAgent.AXNode} accessibilityNode
         * @this {WebInspector.AccessibilitySidebarView}
         */
        function accessibilityNodeCallback(accessibilityNode)
        {
            if (this._computedTextSubPane)
                this._computedTextSubPane.setAXNode(accessibilityNode);
            if (this._axNodeSubPane)
                this._axNodeSubPane.setAXNode(accessibilityNode);
        }
        var node = this.node();
        return WebInspector.AccessibilityModel.fromTarget(node.target()).getAXNode(node.id)
            .then(accessibilityNodeCallback.bind(this))
    },

    /**
     * @override
     */
    wasShown: function()
    {
        WebInspector.ThrottledWidget.prototype.wasShown.call(this);

        if (!this._sidebarPaneStack) {
            this._computedTextSubPane = new WebInspector.AXComputedTextSubPane();
            this._computedTextSubPane.setNode(this.node());
            this._computedTextSubPane.show(this.element);
            this._computedTextSubPane.expand();

            this._axNodeSubPane = new WebInspector.AXNodeSubPane();
            this._axNodeSubPane.setNode(this.node());
            this._axNodeSubPane.show(this.element);
            this._axNodeSubPane.expand();

            this._sidebarPaneStack = new WebInspector.SidebarPaneStack();
            this._sidebarPaneStack.element.classList.add("flex-auto");
            this._sidebarPaneStack.show(this.element);
            this._sidebarPaneStack.addPane(this._computedTextSubPane);
            this._sidebarPaneStack.addPane(this._axNodeSubPane);
        }

        WebInspector.targetManager.addModelListener(WebInspector.DOMModel, WebInspector.DOMModel.Events.AttrModified, this._onAttrChange, this);
        WebInspector.targetManager.addModelListener(WebInspector.DOMModel, WebInspector.DOMModel.Events.AttrRemoved, this._onAttrChange, this);
        WebInspector.targetManager.addModelListener(WebInspector.DOMModel, WebInspector.DOMModel.Events.CharacterDataModified, this._onNodeChange, this);
        WebInspector.targetManager.addModelListener(WebInspector.DOMModel, WebInspector.DOMModel.Events.ChildNodeCountUpdated, this._onNodeChange, this);
    },

    /**
     * @override
     */
    willHide: function()
    {
        WebInspector.targetManager.removeModelListener(WebInspector.DOMModel, WebInspector.DOMModel.Events.AttrModified, this._onAttrChange, this);
        WebInspector.targetManager.removeModelListener(WebInspector.DOMModel, WebInspector.DOMModel.Events.AttrRemoved, this._onAttrChange, this);
        WebInspector.targetManager.removeModelListener(WebInspector.DOMModel, WebInspector.DOMModel.Events.CharacterDataModified, this._onNodeChange, this);
        WebInspector.targetManager.removeModelListener(WebInspector.DOMModel, WebInspector.DOMModel.Events.ChildNodeCountUpdated, this._onNodeChange, this);
    },

    _pullNode: function()
    {
        this._node = WebInspector.context.flavor(WebInspector.DOMNode);
        if (this._computedTextSubPane)
            this._computedTextSubPane.setNode(this._node);
        if (this._axNodeSubPane)
            this._axNodeSubPane.setNode(this._node);
        this.update();
    },

    /**
     * @param {!WebInspector.Event} event
     */
    _onAttrChange: function(event)
    {
        if (!this.node())
            return;
        var node = event.data.node;
        if (this.node() !== node)
            return;
        this.update();
    },

    /**
     * @param {!WebInspector.Event} event
     */
    _onNodeChange: function(event)
    {
        if (!this.node())
            return;
        var node = event.data;
        if (this.node() !== node)
            return;
        this.update();
    },


    __proto__: WebInspector.ThrottledWidget.prototype
};

/**
 * @constructor
 * @extends {WebInspector.SidebarPane}
 * @param {string} name
 */
WebInspector.AccessibilitySubPane = function(name)
{
    WebInspector.SidebarPane.call(this, name);

    this._axNode = null;
    this.registerRequiredCSS("accessibility/accessibilityNode.css");
}

WebInspector.AccessibilitySubPane.prototype = {
    /**
     * @param {?AccessibilityAgent.AXNode} axNode
     * @protected
     */
    setAXNode: function(axNode)
    {
    },

    /**
     * @return {?WebInspector.DOMNode}
     */
    node: function()
    {
        return this._node;
    },

    /**
     * @param {?WebInspector.DOMNode} node
     */
    setNode: function(node)
    {
        this._node = node;
    },

    /**
     * @param {string} textContent
     * @param {string=} className
     * @return {!Element}
     */
    createInfo: function(textContent, className)
    {
        var classNameOrDefault = className || "info";
        var info = createElementWithClass("div", classNameOrDefault);
        info.textContent = textContent;
        this.element.appendChild(info);
        return info;
    },

    /**
     * @param {string=} className
     * @return {!TreeOutline}
     */
    createTreeOutline: function(className)
    {
        var treeOutline = new TreeOutlineInShadow(className);
        treeOutline.registerRequiredCSS("accessibility/accessibilityNode.css");
        treeOutline.registerRequiredCSS("components/objectValue.css");
        treeOutline.element.classList.add("hidden");
        this.element.appendChild(treeOutline.element);
        return treeOutline;
    },

    __proto__: WebInspector.SidebarPane.prototype
}

/**
 * @constructor
 * @extends {WebInspector.AccessibilitySubPane}
 */
WebInspector.AXComputedTextSubPane = function()
{
    WebInspector.AccessibilitySubPane.call(this, WebInspector.UIString("Computed Text"));

    this._computedTextElement = this.element.createChild("div", "ax-computed-text hidden");

    this._noTextInfo = this.createInfo(WebInspector.UIString("Node has no text alternative."));
    this._treeOutline = this.createTreeOutline();
};


WebInspector.AXComputedTextSubPane.prototype = {
    /**
     * @param {?AccessibilityAgent.AXNode} axNode
     * @override
     */
    setAXNode: function(axNode)
    {
        if (this._axNode === axNode)
            return;
        this._axNode = axNode;

        var treeOutline = this._treeOutline;
        treeOutline.removeChildren();
        var target = this.node().target();

        if (!axNode || axNode.ignored) {
            this._computedTextElement.classList.add("hidden");
            treeOutline.element.classList.add("hidden");

            this._noTextInfo.classList.remove("hidden");
            return;
        }
        this._computedTextElement.removeChildren();

        // TODO(aboxhall): include contents where appropriate (requires protocol change)
        this._computedTextElement.classList.toggle("hidden", !axNode.name || !axNode.name.value);
        if (axNode.name && axNode.name.value)
            this._computedTextElement.createChild("div").textContent = axNode.name.value;

        var foundProperty = false;
        /**
         * @param {!AccessibilityAgent.AXProperty} property
         */
        function addProperty(property)
        {
            foundProperty = true;
            treeOutline.appendChild(new WebInspector.AXNodePropertyTreeElement(property, target));
        }

        if ("value" in axNode && axNode.value.type === "string")
            addProperty(/** @type {!AccessibilityAgent.AXProperty} */ ({name: "value", value: axNode.value}));

        var propertiesArray = /** @type {!Array.<!AccessibilityAgent.AXProperty> } */ (axNode.properties);
        for (var property of propertiesArray) {
            if (property.name == AccessibilityAgent.AXWidgetAttributes.Valuetext) {
                addProperty(property);
                break;
            }
        }

        treeOutline.element.classList.toggle("hidden", !foundProperty)
        this._noTextInfo.classList.toggle("hidden", !treeOutline.element.classList.contains("hidden") || !this._computedTextElement.classList.contains("hidden"));
    },

    __proto__: WebInspector.AccessibilitySubPane.prototype
};

/**
 * @constructor
 * @extends {WebInspector.AccessibilitySubPane}
 */
WebInspector.AXNodeSubPane = function()
{
    WebInspector.AccessibilitySubPane.call(this, WebInspector.UIString("Accessibility Node"));

    this._noNodeInfo = this.createInfo(WebInspector.UIString("No accessibility node"));
    this._ignoredInfo = this.createInfo(WebInspector.UIString("Accessibility node not exposed"), "ax-ignored-info hidden");

    this._treeOutline = this.createTreeOutline();
    this._ignoredReasonsTree = this.createTreeOutline();
};


WebInspector.AXNodeSubPane.prototype = {
    /**
     * @param {?AccessibilityAgent.AXNode} axNode
     * @override
     */
    setAXNode: function(axNode)
    {
        if (this._axNode === axNode)
            return;
        this._axNode = axNode;

        var treeOutline = this._treeOutline;
        treeOutline.removeChildren();
        var ignoredReasons = this._ignoredReasonsTree;
        ignoredReasons.removeChildren();
        var target = this.node().target();

        if (!axNode) {
            treeOutline.element.classList.add("hidden");
            this._ignoredInfo.classList.add("hidden");
            ignoredReasons.element.classList.add("hidden");

            this._noNodeInfo.classList.remove("hidden");
            this.element.classList.add("ax-ignored-node-pane");

            return;
        } else if (axNode.ignored) {
            this._noNodeInfo.classList.add("hidden");
            treeOutline.element.classList.add("hidden");
            this.element.classList.add("ax-ignored-node-pane");

            this._ignoredInfo.classList.remove("hidden");
            ignoredReasons.element.classList.remove("hidden");
            /**
             * @param {!AccessibilityAgent.AXProperty} property
             */
            function addIgnoredReason(property)
            {
                ignoredReasons.appendChild(new WebInspector.AXNodeIgnoredReasonTreeElement(property, axNode, target));
            }
            var ignoredReasonsArray = /** @type {!Array.<!Object>} */(axNode.ignoredReasons);
            for (var reason of ignoredReasonsArray)
                addIgnoredReason(reason);
            if (!ignoredReasons.firstChild())
                ignoredReasons.element.classList.add("hidden");
            return;
        }
        this.element.classList.remove("ax-ignored-node-pane");

        this._ignoredInfo.classList.add("hidden");
        ignoredReasons.element.classList.add("hidden");
        this._noNodeInfo.classList.add("hidden");

        treeOutline.element.classList.remove("hidden");

        /**
         * @param {!AccessibilityAgent.AXProperty} property
         */
        function addProperty(property)
        {
            treeOutline.appendChild(new WebInspector.AXNodePropertyTreeElement(property, target));
        }

        for (var propertyName of ["name", "description", "help", "value"]) {
            if (propertyName in axNode) {
                var defaultProperty = /** @type {!AccessibilityAgent.AXProperty} */ ({name: propertyName, value: axNode[propertyName]});
                addProperty(defaultProperty);
            }
        }

        var roleProperty = /** @type {!AccessibilityAgent.AXProperty} */ ({name: "role", value: axNode.role});
        addProperty(roleProperty);

        var propertyMap = {};
        var propertiesArray = /** @type {!Array.<!AccessibilityAgent.AXProperty>} */ (axNode.properties);
        for (var property of propertiesArray)
            propertyMap[property.name] = property;

        for (var propertySet of [AccessibilityAgent.AXWidgetAttributes, AccessibilityAgent.AXWidgetStates, AccessibilityAgent.AXGlobalStates, AccessibilityAgent.AXLiveRegionAttributes, AccessibilityAgent.AXRelationshipAttributes]) {
            for (var propertyKey in propertySet) {
                var property = propertySet[propertyKey];
                if (property in propertyMap)
                    addProperty(propertyMap[property]);
            }
        }
    },

    __proto__: WebInspector.AccessibilitySubPane.prototype
};

/**
 * @constructor
 * @extends {TreeElement}
 * @param {!AccessibilityAgent.AXProperty} property
 * @param {!WebInspector.Target} target
 */
WebInspector.AXNodePropertyTreeElement = function(property, target)
{
    this._property = property;
    this._target = target;

    // Pass an empty title, the title gets made later in onattach.
    TreeElement.call(this, "");
    this.toggleOnClick = true;
    this.selectable = false;
}

WebInspector.AXNodePropertyTreeElement.prototype = {
    /**
     * @override
     */
    onattach: function()
    {
        this._update();
    },


    _update: function()
    {
        this._nameElement = WebInspector.AXNodePropertyTreeElement.createNameElement(this._property.name);

        var value = this._property.value;
        if (value.type === "idref") {
            this._valueElement = WebInspector.AXNodePropertyTreeElement.createRelationshipValueElement(value, this._target);
        } else if (value.type === "idrefList") {
            var relatedNodes = value.relatedNodeArrayValue;
            var numNodes = relatedNodes.length;
            var description = "(" + numNodes + (numNodes == 1 ? " node" : " nodes") + ")";
            value.value = description;
            for (var i = 0; i < relatedNodes.length; i++) {
                var backendId = relatedNodes[i].backendNodeId;
                var deferredNode = new WebInspector.DeferredDOMNode(this._target, relatedNodes[i].backendNodeId);
                var child = new WebInspector.AXRelatedNodeTreeElement(deferredNode);
                this.appendChild(child);
            }
            this._valueElement = WebInspector.AXNodePropertyTreeElement.createValueElement(value, this.listItemElement);
            if (relatedNodes.length <= 3)
                this.expand();
            else
                this.collapse();
        } else {
            this._valueElement = WebInspector.AXNodePropertyTreeElement.createValueElement(value, this.listItemElement);
        }

        var separatorElement = createElementWithClass("span", "separator");
        separatorElement.textContent = ": ";

        this.listItemElement.removeChildren();
        this.listItemElement.appendChildren(this._nameElement, separatorElement, this._valueElement);
    },

    __proto__: TreeElement.prototype
}

/**
 * @param {!TreeElement} treeNode
 * @param {?AccessibilityAgent.AXNode} axNode
 * @param {!WebInspector.Target} target
 */
WebInspector.AXNodePropertyTreeElement.populateWithNode = function(treeNode, axNode, target)
{
}

/**
 * @param {?string} name
 * @return {!Element}
 */
WebInspector.AXNodePropertyTreeElement.createNameElement = function(name)
{
    var nameElement = createElement("span");
    var AXAttributes = WebInspector.AccessibilityStrings.AXAttributes;
    if (name in AXAttributes) {
        nameElement.textContent = WebInspector.UIString(AXAttributes[name].name);
        nameElement.title = AXAttributes[name].description;
        nameElement.classList.add("ax-readable-name");
    } else {
        nameElement.textContent = name;
        nameElement.classList.add("ax-name");
    }
    return nameElement;
}

/**
 * @param {!AccessibilityAgent.AXValue} value
 * @param {!WebInspector.Target} target
 * @return {?Element}
 */
WebInspector.AXNodePropertyTreeElement.createRelationshipValueElement = function(value, target)
{
    var deferredNode = new WebInspector.DeferredDOMNode(target, value.relatedNodeValue.backendNodeId);
    var valueElement = createElement("span");

    /**
     * @param {?WebInspector.DOMNode} node
     */
    function onNodeResolved(node)
    {
        valueElement.appendChild(WebInspector.DOMPresentationUtils.linkifyNodeReference(node));
    }
    deferredNode.resolve(onNodeResolved);

    return valueElement;
}

/**
 * @param {!AccessibilityAgent.AXValue} value
 * @param {!Element} parentElement
 * @return {!Element}
 */
WebInspector.AXNodePropertyTreeElement.createValueElement = function(value, parentElement)
{
    var valueElement = createElementWithClass("span", "monospace");
    var type = value.type;
    var prefix;
    var valueText;
    var suffix;
    if (type === "string") {
        // Render \n as a nice unicode cr symbol.
        prefix = "\"";
        valueText = value.value.replace(/\n/g, "\u21B5");
        suffix = "\"";
        valueElement._originalTextContent = "\"" + value.value + "\"";
    } else {
        valueText = String(value.value);
    }

    if (type in WebInspector.AXNodePropertyTreeElement.TypeStyles)
        valueElement.classList.add(WebInspector.AXNodePropertyTreeElement.TypeStyles[type]);

    valueElement.setTextContentTruncatedIfNeeded(valueText || "");
    if (prefix)
        valueElement.insertBefore(createTextNode(prefix), valueElement.firstChild);
    if (suffix)
        valueElement.createTextChild(suffix);

    valueElement.title = String(value.value) || "";

    return valueElement;
}

/**
 * @constructor
 * @extends {TreeElement}
 * @param {!WebInspector.DeferredDOMNode} deferredNode
 */
WebInspector.AXRelatedNodeTreeElement = function(deferredNode)
{
    this._deferredNode = deferredNode;

    TreeElement.call(this, "");
};

WebInspector.AXRelatedNodeTreeElement.prototype = {
    onattach: function()
    {
        this._update();
    },

    _update: function()
    {
        var valueElement = createElement("div");
        this.listItemElement.appendChild(valueElement);

        /**
         * @param {?WebInspector.DOMNode} node
         */
        function onNodeResolved(node)
        {
            valueElement.appendChild(WebInspector.DOMPresentationUtils.linkifyNodeReference(node));
        }
        this._deferredNode.resolve(onNodeResolved);
    },

    __proto__: TreeElement.prototype
};

/** @type {!Object<string, string>} */
WebInspector.AXNodePropertyTreeElement.TypeStyles = {
    boolean: "object-value-boolean",
    booleanOrUndefined: "object-value-boolean",
    tristate: "object-value-boolean",
    number: "object-value-number",
    integer: "object-value-number",
    string: "object-value-string",
    role: "ax-role",
    internalRole: "ax-internal-role"
};

/**
 * @constructor
 * @extends {TreeElement}
 * @param {!AccessibilityAgent.AXProperty} property
 * @param {?AccessibilityAgent.AXNode} axNode
 * @param {!WebInspector.Target} target
 */
WebInspector.AXNodeIgnoredReasonTreeElement = function(property, axNode, target)
{
    this._property = property;
    this._axNode = axNode;
    this._target = target;

    // Pass an empty title, the title gets made later in onattach.
    TreeElement.call(this, "");
    this.toggleOnClick = true;
    this.selectable = false;
}

WebInspector.AXNodeIgnoredReasonTreeElement.prototype = {
    /**
     * @override
     */
    onattach: function()
    {
        this.listItemElement.removeChildren();

        this._reasonElement = WebInspector.AXNodeIgnoredReasonTreeElement.createReasonElement(this._property.name, this._axNode);
        this.listItemElement.appendChild(this._reasonElement);

        var value = this._property.value;
        if (value.type === "idref") {
            this._valueElement = WebInspector.AXNodePropertyTreeElement.createRelationshipValueElement(value, this._target);
            this.listItemElement.appendChild(this._valueElement);
        }
    },

    __proto__: TreeElement.prototype
};

/**
 * @param {?string} reason
 * @param {?AccessibilityAgent.AXNode} axNode
 * @return {?Element}
 */
WebInspector.AXNodeIgnoredReasonTreeElement.createReasonElement = function(reason, axNode)
{
    var reasonElement = null;
    switch(reason) {
    case "activeModalDialog":
        reasonElement = WebInspector.formatLocalized("Element is hidden by active modal dialog: ", [], "");
        break;
    case "ancestorDisallowsChild":
        reasonElement = WebInspector.formatLocalized("Element is not permitted as child of ", [], "");
        break;
    // http://www.w3.org/TR/wai-aria/roles#childrenArePresentational
    case "ancestorIsLeafNode":
        reasonElement = WebInspector.formatLocalized("Ancestor's children are all presentational: ", [], "");
        break;
    case "ariaHidden":
        var ariaHiddenSpan = createElement("span", "source-code").textContent = "aria-hidden";
        reasonElement = WebInspector.formatLocalized("Element is %s.", [ ariaHiddenSpan ], "");
        break;
    case "ariaHiddenRoot":
        var ariaHiddenSpan = createElement("span", "source-code").textContent = "aria-hidden";
        var trueSpan = createElement("span", "source-code").textContent = "true";
        reasonElement = WebInspector.formatLocalized("%s is %s on ancestor: ", [ ariaHiddenSpan, trueSpan ], "");
        break;
    case "emptyAlt":
        reasonElement = WebInspector.formatLocalized("Element has empty alt text.", [], "");
        break;
    case "emptyText":
        reasonElement = WebInspector.formatLocalized("No text content.", [], "");
        break;
    case "inert":
        reasonElement = WebInspector.formatLocalized("Element is inert.", [], "");
        break;
    case "inheritsPresentation":
        reasonElement = WebInspector.formatLocalized("Element inherits presentational role from ", [], "");
        break;
    case "labelContainer":
        reasonElement = WebInspector.formatLocalized("Part of label element: ", [], "");
        break;
    case "labelFor":
        reasonElement = WebInspector.formatLocalized("Label for ", [], "");
        break;
    case "notRendered":
        reasonElement = WebInspector.formatLocalized("Element is not rendered.", [], "");
        break;
    case "notVisible":
        reasonElement = WebInspector.formatLocalized("Element is not visible.", [], "");
        break;
    case "presentationalRole":
        var rolePresentationSpan = createElement("span", "source-code").textContent = "role=" + axNode.role.value;
        reasonElement = WebInspector.formatLocalized("Element has %s.", [ rolePresentationSpan ], "");
        break;
    case "probablyPresentational":
        reasonElement = WebInspector.formatLocalized("Element is presentational.", [], "");
        break;
    case "staticTextUsedAsNameFor":
        reasonElement = WebInspector.formatLocalized("Static text node is used as name for ", [], "");
        break;
    case "uninteresting":
        reasonElement = WebInspector.formatLocalized("Element not interesting for accessibility.", [], "")
        break;
    }
    if (reasonElement)
        reasonElement.classList.add("ax-reason");
    return reasonElement;
}
