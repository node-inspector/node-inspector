/*
 * Copyright (C) 2008 Apple Inc. All Rights Reserved.
 * Copyright (C) 2009 Joseph Pecoraro
 *
 * Redistribution and use in source and binary forms, with or without
 * modification, are permitted provided that the following conditions
 * are met:
 * 1. Redistributions of source code must retain the above copyright
 *    notice, this list of conditions and the following disclaimer.
 * 2. Redistributions in binary form must reproduce the above copyright
 *    notice, this list of conditions and the following disclaimer in the
 *    documentation and/or other materials provided with the distribution.
 *
 * THIS SOFTWARE IS PROVIDED BY APPLE INC. ``AS IS'' AND ANY
 * EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE
 * IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR
 * PURPOSE ARE DISCLAIMED.  IN NO EVENT SHALL APPLE INC. OR
 * CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL,
 * EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO,
 * PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR
 * PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY
 * OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT
 * (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE
 * OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
 */

/**
 * @constructor
 * @extends {TreeOutlineInShadow}
 * @param {!WebInspector.RemoteObject} object
 * @param {?string|!Element=} title
 * @param {?string=} emptyPlaceholder
 * @param {boolean=} ignoreHasOwnProperty
 * @param {!Array.<!WebInspector.RemoteObjectProperty>=} extraProperties
 */
WebInspector.ObjectPropertiesSection = function(object, title, emptyPlaceholder, ignoreHasOwnProperty, extraProperties)
{
    this._object = object;
    this._editable = true;
    TreeOutlineInShadow.call(this);
    this.setFocusable(false);
    this._objectTreeElement = new WebInspector.ObjectPropertiesSection.RootElement(object, emptyPlaceholder, ignoreHasOwnProperty, extraProperties);
    this.appendChild(this._objectTreeElement);
    if (typeof title === "string" || !title)
        this.element.createChild("span").textContent = title || "";
    else
        this.element.appendChild(title);

    this.element._section = this;
    this.registerRequiredCSS("components/objectValue.css");
    this.registerRequiredCSS("components/objectPropertiesSection.css");
    this.rootElement().childrenListElement.classList.add("source-code", "object-properties-section")
}

/** @const */
WebInspector.ObjectPropertiesSection._arrayLoadThreshold = 100;

/**
 * @param {!WebInspector.RemoteObject} object
 * @param {boolean=} skipProto
 * @return {!Element}
 */
WebInspector.ObjectPropertiesSection.defaultObjectPresentation = function(object, skipProto)
{
    var componentRoot = createElementWithClass("span", "source-code");
    var shadowRoot = WebInspector.createShadowRootWithCoreStyles(componentRoot);
    shadowRoot.appendChild(WebInspector.Widget.createStyleElement("components/objectValue.css"));
    shadowRoot.appendChild(WebInspector.ObjectPropertiesSection.createValueElement(object, false));
    if (!object.hasChildren)
        return componentRoot;

    var objectPropertiesSection = new WebInspector.ObjectPropertiesSection(object, componentRoot);
    objectPropertiesSection.editable = false;
    if (skipProto)
        objectPropertiesSection.skipProto();

    return objectPropertiesSection.element;
}

WebInspector.ObjectPropertiesSection.prototype = {
    skipProto: function()
    {
        this._skipProto = true;
    },

    expand: function()
    {
        this._objectTreeElement.expand();
    },

    /**
     * @return {!TreeElement}
     */
    objectTreeElement: function()
    {
        return this._objectTreeElement;
    },

    enableContextMenu: function()
    {
        this.element.addEventListener("contextmenu", this._contextMenuEventFired.bind(this), false);
    },

    _contextMenuEventFired: function(event)
    {
        var contextMenu = new WebInspector.ContextMenu(event);
        contextMenu.appendApplicableItems(this._object);
        contextMenu.show();
    },

    titleLessMode: function()
    {
        this._objectTreeElement.listItemElement.classList.add("hidden");
        this._objectTreeElement.childrenListElement.classList.add("title-less-mode");
        this._objectTreeElement.expand();
    },

    __proto__: TreeOutlineInShadow.prototype
}

/**
 * @param {!WebInspector.RemoteObjectProperty} propertyA
 * @param {!WebInspector.RemoteObjectProperty} propertyB
 * @return {number}
 */
WebInspector.ObjectPropertiesSection.CompareProperties = function(propertyA, propertyB)
{
    var a = propertyA.name;
    var b = propertyB.name;
    if (a === "__proto__")
        return 1;
    if (b === "__proto__")
        return -1;
    if (propertyA.symbol && !propertyB.symbol)
        return 1;
    if (propertyB.symbol && !propertyA.symbol)
        return -1;
    return String.naturalOrderComparator(a, b);
}

/**
 * @constructor
 * @extends {TreeElement}
 * @param {!WebInspector.RemoteObject} object
 * @param {?string=} emptyPlaceholder
 * @param {boolean=} ignoreHasOwnProperty
 * @param {!Array.<!WebInspector.RemoteObjectProperty>=} extraProperties
 */
WebInspector.ObjectPropertiesSection.RootElement = function(object, emptyPlaceholder, ignoreHasOwnProperty, extraProperties)
{
    this._object = object;
    this._extraProperties = extraProperties || [];
    this._ignoreHasOwnProperty = !!ignoreHasOwnProperty;
    this._emptyPlaceholder = emptyPlaceholder;
    var contentElement = createElement("content");
    TreeElement.call(this, contentElement);
    this.setExpandable(true);
    this.selectable = false;
    this.toggleOnClick = true;
}

WebInspector.ObjectPropertiesSection.RootElement.prototype = {

    onexpand: function()
    {
        if (this.treeOutline)
            this.treeOutline.element.classList.add("expanded");
    },

    oncollapse: function()
    {
        if (this.treeOutline)
            this.treeOutline.element.classList.remove("expanded");
    },

    /**
     * @override
     * @param {!Event} e
     * @return {boolean}
     */
    ondblclick: function(e)
    {
        return true;
    },

    onpopulate: function()
    {
        WebInspector.ObjectPropertyTreeElement._populate(this, this._object, !!this.treeOutline._skipProto, this._emptyPlaceholder, this._ignoreHasOwnProperty, this._extraProperties);
    },

    __proto__: TreeElement.prototype
}

/**
 * @constructor
 * @extends {TreeElement}
 * @param {!WebInspector.RemoteObjectProperty} property
 */
WebInspector.ObjectPropertyTreeElement = function(property)
{
    this.property = property;

    // Pass an empty title, the title gets made later in onattach.
    TreeElement.call(this);
    this.toggleOnClick = true;
    this.selectable = false;
}

WebInspector.ObjectPropertyTreeElement.prototype = {
    onpopulate: function()
    {
        var propertyValue = /** @type {!WebInspector.RemoteObject} */ (this.property.value);
        console.assert(propertyValue);
        var skipProto = this.treeOutline ? this.treeOutline._skipProto : true;
        WebInspector.ObjectPropertyTreeElement._populate(this, propertyValue, skipProto);
    },

    /**
     * @override
     * @return {boolean}
     */
    ondblclick: function(event)
    {
        var editableElement = this.valueElement;
        if (!this.property.value.customPreview() && (this.property.writable || this.property.setter) && event.target.isSelfOrDescendant(editableElement))
            this._startEditing();
        return false;
    },

    /**
     * @override
     */
    onattach: function()
    {
        this.update();
        if (this.property.value)
            this.setExpandable(!this.property.value.customPreview() && this.property.value.hasChildren && !this.property.wasThrown);
    },

    update: function()
    {
        this.nameElement = WebInspector.ObjectPropertiesSection.createNameElement(this.property.name);
        if (!this.property.enumerable)
            this.nameElement.classList.add("object-properties-section-dimmed");
        if (this.property.isAccessorProperty())
            this.nameElement.classList.add("properties-accessor-property-name");
        if (this.property.symbol)
            this.nameElement.addEventListener("contextmenu", this._contextMenuFired.bind(this, this.property.symbol), false);

        var separatorElement = createElementWithClass("span", "object-properties-section-separator");
        separatorElement.textContent = ": ";

        if (this.property.value) {
            this.valueElement = WebInspector.ObjectPropertiesSection.createValueElementWithCustomSupport(this.property.value, this.property.wasThrown, this.listItemElement);
            this.valueElement.addEventListener("contextmenu", this._contextMenuFired.bind(this, this.property.value), false);
        } else if (this.property.getter) {
            this.valueElement = WebInspector.ObjectPropertyTreeElement.createRemoteObjectAccessorPropertySpan(this.property.parentObject, [this.property.name], this._onInvokeGetterClick.bind(this));
        } else {
            this.valueElement = createElementWithClass("span", "object-value-undefined");
            this.valueElement.textContent = WebInspector.UIString("<unreadable>");
            this.valueElement.title = WebInspector.UIString("No property getter");
        }

        this.listItemElement.removeChildren();
        this.listItemElement.appendChildren(this.nameElement, separatorElement, this.valueElement);
    },

    _contextMenuFired: function(value, event)
    {
        var contextMenu = new WebInspector.ContextMenu(event);
        contextMenu.appendApplicableItems(value);
        contextMenu.show();
    },

    _startEditing: function()
    {
        if (this._prompt || !this.treeOutline._editable || this._readOnly)
            return;

        this._editableDiv = this.listItemElement.createChild("span");

        var text = this.property.value.description;
        if (this.property.value.type === "string" && typeof text === "string")
            text = "\"" + text + "\"";

        this._editableDiv.setTextContentTruncatedIfNeeded(text, WebInspector.UIString("<string is too large to edit>"));
        var originalContent = this._editableDiv.textContent;

        this.valueElement.classList.add("hidden");

        // Lie about our children to prevent expanding on double click and to collapse subproperties.
        this.setExpandable(false);
        this.listItemElement.classList.add("editing-sub-part");

        this._prompt = new WebInspector.ObjectPropertyPrompt();

        var proxyElement = this._prompt.attachAndStartEditing(this._editableDiv, this._editingCommitted.bind(this, originalContent));
        this.listItemElement.getComponentSelection().setBaseAndExtent(this._editableDiv, 0, this._editableDiv, 1);
        proxyElement.addEventListener("keydown", this._promptKeyDown.bind(this, originalContent), false);
    },

    _editingEnded: function()
    {
       this._prompt.detach();
       delete this._prompt;
       this._editableDiv.remove();
       this.setExpandable(this.property.value.hasChildren && !this.property.wasThrown);
       this.listItemElement.scrollLeft = 0;
       this.listItemElement.classList.remove("editing-sub-part");
    },

    _editingCancelled: function()
    {
       this.valueElement.classList.remove("hidden");
       this._editingEnded();
    },

    /**
     * @param {string} originalContent
     */
    _editingCommitted: function(originalContent)
    {
       var userInput = this._prompt.text();
       if (userInput === originalContent) {
           this._editingCancelled(); // nothing changed, so cancel
           return;
       }

       this._editingEnded();
       this._applyExpression(userInput);
    },

    /**
     * @param {string} originalContent
     * @param {!Event} event
     */
    _promptKeyDown: function(originalContent, event)
    {
        if (isEnterKey(event)) {
            event.consume(true);
            this._editingCommitted(originalContent);
            return;
        }
        if (event.keyIdentifier === "U+001B") { // Esc
            event.consume();
            this._editingCancelled();
            return;
        }
    },

    /**
     * @param {string} expression
     */
    _applyExpression: function(expression)
    {
        var property = WebInspector.RemoteObject.toCallArgument(this.property.symbol || this.property.name);
        expression = expression.trim();
        if (expression)
            this.property.parentObject.setPropertyValue(property, expression, callback.bind(this));
        else
            this.property.parentObject.deleteProperty(property, callback.bind(this));

        /**
         * @param {?Protocol.Error} error
         * @this {WebInspector.ObjectPropertyTreeElement}
         */
        function callback(error)
        {
            if (error) {
                this.update();
                return;
            }

            if (!expression) {
                // The property was deleted, so remove this tree element.
                this.parent.removeChild(this);
            } else {
                // Call updateSiblings since their value might be based on the value that just changed.
                var parent = this.parent;
                parent.invalidateChildren();
                parent.expand();
            }
        };
    },

    /**
     * @return {string|undefined}
     */
    propertyPath: function()
    {
        if (this._cachedPropertyPath)
            return this._cachedPropertyPath;

        var current = this;
        var result;

        do {
            if (current.property) {
                if (result)
                    result = current.property.name + "." + result;
                else
                    result = current.property.name;
            }
            current = current.parent;
        } while (current && !current.root);

        this._cachedPropertyPath = result;
        return result;
    },

    /**
     * @param {?WebInspector.RemoteObject} result
     * @param {boolean=} wasThrown
     */
    _onInvokeGetterClick: function(result, wasThrown)
    {
        if (!result)
            return;
        this.property.value = result;
        this.property.wasThrown = wasThrown;

        this.update();
        this.invalidateChildren();
    },

    __proto__: TreeElement.prototype
}

/**
 * @param {!TreeElement} treeElement
 * @param {!WebInspector.RemoteObject} value
 * @param {boolean} skipProto
 * @param {?string=} emptyPlaceholder
 * @param {boolean=} flattenProtoChain
 * @param {!Array.<!WebInspector.RemoteObjectProperty>=} extraProperties
 */
WebInspector.ObjectPropertyTreeElement._populate = function(treeElement, value, skipProto, emptyPlaceholder, flattenProtoChain, extraProperties)
{
    if (value.arrayLength() > WebInspector.ObjectPropertiesSection._arrayLoadThreshold) {
        treeElement.removeChildren();
        WebInspector.ArrayGroupingTreeElement._populateArray(treeElement, value, 0, value.arrayLength() - 1);
        return;
    }

    /**
     * @param {?Array.<!WebInspector.RemoteObjectProperty>} properties
     * @param {?Array.<!WebInspector.RemoteObjectProperty>} internalProperties
     */
    function callback(properties, internalProperties)
    {
        treeElement.removeChildren();
        if (!properties)
            return;

        extraProperties = extraProperties || [];
        for (var i = 0; i < extraProperties.length; ++i)
            properties.push(extraProperties[i]);

        WebInspector.ObjectPropertyTreeElement.populateWithProperties(treeElement, properties, internalProperties,
            skipProto, value, emptyPlaceholder);
    }

    if (flattenProtoChain)
        value.getAllProperties(false, callback);
    else
        WebInspector.RemoteObject.loadFromObjectPerProto(value, callback);
}

/**
 * @param {!TreeElement} treeNode
 * @param {!Array.<!WebInspector.RemoteObjectProperty>} properties
 * @param {?Array.<!WebInspector.RemoteObjectProperty>} internalProperties
 * @param {boolean} skipProto
 * @param {?WebInspector.RemoteObject} value
 * @param {?string=} emptyPlaceholder
 */
WebInspector.ObjectPropertyTreeElement.populateWithProperties = function(treeNode, properties, internalProperties, skipProto, value, emptyPlaceholder) {
    properties.sort(WebInspector.ObjectPropertiesSection.CompareProperties);

    for (var i = 0; i < properties.length; ++i) {
        var property = properties[i];
        if (skipProto && property.name === "__proto__")
            continue;
        if (property.isAccessorProperty()) {
            if (property.name !== "__proto__" && property.getter) {
                property.parentObject = value;
                treeNode.appendChild(new WebInspector.ObjectPropertyTreeElement(property));
            }
            if (property.isOwn) {
                if (property.getter) {
                    var getterProperty = new WebInspector.RemoteObjectProperty("get " + property.name, property.getter);
                    getterProperty.parentObject = value;
                    treeNode.appendChild(new WebInspector.ObjectPropertyTreeElement(getterProperty));
                }
                if (property.setter) {
                    var setterProperty = new WebInspector.RemoteObjectProperty("set " + property.name, property.setter);
                    setterProperty.parentObject = value;
                    treeNode.appendChild(new WebInspector.ObjectPropertyTreeElement(setterProperty));
                }
            }
        } else {
            property.parentObject = value;
            treeNode.appendChild(new WebInspector.ObjectPropertyTreeElement(property));
        }
    }
    if (internalProperties) {
        for (var i = 0; i < internalProperties.length; i++) {
            internalProperties[i].parentObject = value;
            treeNode.appendChild(new WebInspector.ObjectPropertyTreeElement(internalProperties[i]));
        }
    }
    if (value && value.type === "function") {
        // Whether function has TargetFunction internal property.
        // This is a simple way to tell that the function is actually a bound function (we are not told).
        // Bound function never has inner scope and doesn't need corresponding UI node.
        var hasTargetFunction = false;

        if (internalProperties) {
            for (var i = 0; i < internalProperties.length; i++) {
                if (internalProperties[i].name == "[[TargetFunction]]") {
                    hasTargetFunction = true;
                    break;
                }
            }
        }
        if (!hasTargetFunction)
            treeNode.appendChild(new WebInspector.FunctionScopeMainTreeElement(value));
    }
    if (value && value.type === "object" && (value.subtype === "map" || value.subtype === "set" || value.subtype === "iterator"))
        treeNode.appendChild(new WebInspector.CollectionEntriesMainTreeElement(value));

    WebInspector.ObjectPropertyTreeElement._appendEmptyPlaceholderIfNeeded(treeNode, emptyPlaceholder);
}

/**
 * @param {!TreeElement} treeNode
 * @param {?string=} emptyPlaceholder
 */
WebInspector.ObjectPropertyTreeElement._appendEmptyPlaceholderIfNeeded = function(treeNode, emptyPlaceholder)
{
    if (treeNode.childCount())
        return;
    var title = createElementWithClass("div", "info");
    title.textContent = emptyPlaceholder || WebInspector.UIString("No Properties");
    var infoElement = new TreeElement(title);
    treeNode.appendChild(infoElement);
}

/**
 * @param {?WebInspector.RemoteObject} object
 * @param {!Array.<string>} propertyPath
 * @param {function(?WebInspector.RemoteObject, boolean=)} callback
 * @return {!Element}
 */
WebInspector.ObjectPropertyTreeElement.createRemoteObjectAccessorPropertySpan = function(object, propertyPath, callback)
{
    var rootElement = createElement("span");
    var element = rootElement.createChild("span");
    element.textContent = WebInspector.UIString("(...)");
    if (!object)
        return rootElement;
    element.classList.add("object-value-calculate-value-button");
    element.title = WebInspector.UIString("Invoke property getter");
    element.addEventListener("click", onInvokeGetterClick, false);

    function onInvokeGetterClick(event)
    {
        event.consume();
        object.getProperty(propertyPath, callback);
    }

    return rootElement;
}

/**
 * @constructor
 * @extends {TreeElement}
 * @param {!WebInspector.RemoteObject} remoteObject
 */
WebInspector.FunctionScopeMainTreeElement = function(remoteObject)
{
    TreeElement.call(this, "<function scope>", true);
    this.toggleOnClick = true;
    this.selectable = false;
    this._remoteObject = remoteObject;
}

WebInspector.FunctionScopeMainTreeElement.prototype = {
    onpopulate: function()
    {
        /**
         * @param {?WebInspector.DebuggerModel.FunctionDetails} response
         * @this {WebInspector.FunctionScopeMainTreeElement}
         */
        function didGetDetails(response)
        {
            if (!response)
                return;
            this.removeChildren();

            var scopeChain = response.scopeChain || [];
            for (var i = 0; i < scopeChain.length; ++i) {
                var scope = scopeChain[i];
                var title = null;
                var isTrueObject = false;

                switch (scope.type) {
                case DebuggerAgent.ScopeType.Local:
                    // Not really expecting this scope type here.
                    title = WebInspector.UIString("Local");
                    break;
                case DebuggerAgent.ScopeType.Closure:
                    title = WebInspector.UIString("Closure");
                    break;
                case DebuggerAgent.ScopeType.Catch:
                    title = WebInspector.UIString("Catch");
                    break;
                case DebuggerAgent.ScopeType.Block:
                    title = WebInspector.UIString("Block");
                    break;
                case DebuggerAgent.ScopeType.Script:
                    title = WebInspector.UIString("Script");
                    break;
                case DebuggerAgent.ScopeType.With:
                    title = WebInspector.UIString("With Block");
                    isTrueObject = true;
                    break;
                case DebuggerAgent.ScopeType.Global:
                    title = WebInspector.UIString("Global");
                    isTrueObject = true;
                    break;
                default:
                    console.error("Unknown scope type: " + scope.type);
                    continue;
                }

                var runtimeModel = this._remoteObject.target().runtimeModel;
                if (isTrueObject) {
                    var remoteObject = runtimeModel.createRemoteObject(scope.object);
                    var property = new WebInspector.RemoteObjectProperty(title, remoteObject);
                    property.writable = false;
                    property.parentObject = null;
                    this.appendChild(new WebInspector.ObjectPropertyTreeElement(property));
                } else {
                    var scopeRef = new WebInspector.ScopeRef(i, undefined, this._remoteObject.objectId);
                    var remoteObject = runtimeModel.createScopeRemoteObject(scope.object, scopeRef);
                    var scopeTreeElement = new WebInspector.ScopeTreeElement(title, remoteObject);
                    this.appendChild(scopeTreeElement);
                }
            }

            WebInspector.ObjectPropertyTreeElement._appendEmptyPlaceholderIfNeeded(this, WebInspector.UIString("No Scopes"));
        }

        this._remoteObject.functionDetails(didGetDetails.bind(this));
    },

    __proto__: TreeElement.prototype
}

/**
 * @constructor
 * @extends {TreeElement}
 * @param {!WebInspector.RemoteObject} remoteObject
 */
WebInspector.CollectionEntriesMainTreeElement = function(remoteObject)
{
    TreeElement.call(this, "<entries>", true);
    this.toggleOnClick = true;
    this.selectable = false;
    this._remoteObject = remoteObject;
    this.expand();
}

WebInspector.CollectionEntriesMainTreeElement.prototype = {
    onpopulate: function()
    {
        /**
         * @param {?Array.<!DebuggerAgent.CollectionEntry>} entries
         * @this {WebInspector.CollectionEntriesMainTreeElement}
         */
        function didGetCollectionEntries(entries)
        {
            if (!entries)
                return;
            this.removeChildren();

            var entriesLocalObject = [];
            var runtimeModel = this._remoteObject.target().runtimeModel;
            for (var i = 0; i < entries.length; ++i) {
                var entry = entries[i];
                if (entry.key) {
                    entriesLocalObject.push(new WebInspector.MapEntryLocalJSONObject({
                        key: runtimeModel.createRemoteObject(entry.key),
                        value: runtimeModel.createRemoteObject(entry.value)
                    }));
                } else {
                    entriesLocalObject.push(runtimeModel.createRemoteObject(entry.value));
                }
            }
            WebInspector.ObjectPropertyTreeElement._populate(this, WebInspector.RemoteObject.fromLocalObject(entriesLocalObject), true, WebInspector.UIString("No Entries"));
            this.title = "<entries>[" + entriesLocalObject.length + "]";
        }

        this._remoteObject.collectionEntries(didGetCollectionEntries.bind(this));
    },

    __proto__: TreeElement.prototype
}

/**
 * @constructor
 * @extends {TreeElement}
 * @param {string} title
 * @param {!WebInspector.RemoteObject} remoteObject
 */
WebInspector.ScopeTreeElement = function(title, remoteObject)
{
    TreeElement.call(this, title, true);
    this.toggleOnClick = true;
    this.selectable = false;
    this._remoteObject = remoteObject;
}

WebInspector.ScopeTreeElement.prototype = {
    onpopulate: function()
    {
        WebInspector.ObjectPropertyTreeElement._populate(this, this._remoteObject, false);
    },

    __proto__: TreeElement.prototype
}

/**
 * @constructor
 * @extends {TreeElement}
 * @param {!WebInspector.RemoteObject} object
 * @param {number} fromIndex
 * @param {number} toIndex
 * @param {number} propertyCount
 */
WebInspector.ArrayGroupingTreeElement = function(object, fromIndex, toIndex, propertyCount)
{
    TreeElement.call(this, String.sprintf("[%d \u2026 %d]", fromIndex, toIndex), true);
    this.toggleOnClick = true;
    this.selectable = false;
    this._fromIndex = fromIndex;
    this._toIndex = toIndex;
    this._object = object;
    this._readOnly = true;
    this._propertyCount = propertyCount;
}

WebInspector.ArrayGroupingTreeElement._bucketThreshold = 100;
WebInspector.ArrayGroupingTreeElement._sparseIterationThreshold = 250000;
WebInspector.ArrayGroupingTreeElement._getOwnPropertyNamesThreshold = 500000;

/**
 * @param {!TreeElement} treeNode
 * @param {!WebInspector.RemoteObject} object
 * @param {number} fromIndex
 * @param {number} toIndex
 */
WebInspector.ArrayGroupingTreeElement._populateArray = function(treeNode, object, fromIndex, toIndex)
{
    WebInspector.ArrayGroupingTreeElement._populateRanges(treeNode, object, fromIndex, toIndex, true);
}

/**
 * @param {!TreeElement} treeNode
 * @param {!WebInspector.RemoteObject} object
 * @param {number} fromIndex
 * @param {number} toIndex
 * @param {boolean} topLevel
 * @this {WebInspector.ArrayGroupingTreeElement}
 */
WebInspector.ArrayGroupingTreeElement._populateRanges = function(treeNode, object, fromIndex, toIndex, topLevel)
{
    object.callFunctionJSON(packRanges, [
        { value: fromIndex },
        { value: toIndex },
        { value: WebInspector.ArrayGroupingTreeElement._bucketThreshold },
        { value: WebInspector.ArrayGroupingTreeElement._sparseIterationThreshold },
        { value: WebInspector.ArrayGroupingTreeElement._getOwnPropertyNamesThreshold }
    ], callback);

    /**
     * Note: must declare params as optional.
     * @param {number=} fromIndex
     * @param {number=} toIndex
     * @param {number=} bucketThreshold
     * @param {number=} sparseIterationThreshold
     * @param {number=} getOwnPropertyNamesThreshold
     * @suppressReceiverCheck
     * @this {Object}
     */
    function packRanges(fromIndex, toIndex, bucketThreshold, sparseIterationThreshold, getOwnPropertyNamesThreshold)
    {
        var ownPropertyNames = null;
        var consecutiveRange = (toIndex - fromIndex >= sparseIterationThreshold) && ArrayBuffer.isView(this);
        var skipGetOwnPropertyNames = consecutiveRange && (toIndex - fromIndex >= getOwnPropertyNamesThreshold);

        function* arrayIndexes(object)
        {
            if (toIndex - fromIndex < sparseIterationThreshold) {
                for (var i = fromIndex; i <= toIndex; ++i) {
                    if (i in object)
                        yield i;
                }
            } else {
                ownPropertyNames = ownPropertyNames || Object.getOwnPropertyNames(object);
                for (var i = 0; i < ownPropertyNames.length; ++i) {
                    var name = ownPropertyNames[i];
                    var index = name >>> 0;
                    if (("" + index) === name && fromIndex <= index && index <= toIndex)
                        yield index;
                }
            }
        }

        var count = 0;
        if (consecutiveRange) {
            count = toIndex - fromIndex + 1;
        } else {
            for (var i of arrayIndexes(this))
                ++count;
        }

        var bucketSize = count;
        if (count <= bucketThreshold)
            bucketSize = count;
        else
            bucketSize = Math.pow(bucketThreshold, Math.ceil(Math.log(count) / Math.log(bucketThreshold)) - 1);

        var ranges = [];
        if (consecutiveRange) {
            for (var i = fromIndex; i <= toIndex; i += bucketSize) {
                var groupStart = i;
                var groupEnd = groupStart + bucketSize - 1;
                if (groupEnd > toIndex)
                    groupEnd = toIndex;
                ranges.push([groupStart, groupEnd, groupEnd - groupStart + 1]);
            }
        } else {
            count = 0;
            var groupStart = -1;
            var groupEnd = 0;
            for (var i of arrayIndexes(this)) {
                if (groupStart === -1)
                    groupStart = i;
                groupEnd = i;
                if (++count === bucketSize) {
                    ranges.push([groupStart, groupEnd, count]);
                    count = 0;
                    groupStart = -1;
                }
            }
            if (count > 0)
                ranges.push([groupStart, groupEnd, count]);
        }

        return { ranges: ranges, skipGetOwnPropertyNames: skipGetOwnPropertyNames };
    }

    function callback(result)
    {
        if (!result)
            return;
        var ranges = /** @type {!Array.<!Array.<number>>} */ (result.ranges);
        if (ranges.length == 1) {
            WebInspector.ArrayGroupingTreeElement._populateAsFragment(treeNode, object, ranges[0][0], ranges[0][1]);
        } else {
            for (var i = 0; i < ranges.length; ++i) {
                var fromIndex = ranges[i][0];
                var toIndex = ranges[i][1];
                var count = ranges[i][2];
                if (fromIndex == toIndex)
                    WebInspector.ArrayGroupingTreeElement._populateAsFragment(treeNode, object, fromIndex, toIndex);
                else
                    treeNode.appendChild(new WebInspector.ArrayGroupingTreeElement(object, fromIndex, toIndex, count));
            }
        }
        if (topLevel)
            WebInspector.ArrayGroupingTreeElement._populateNonIndexProperties(treeNode, object, result.skipGetOwnPropertyNames);
    }
}

/**
 * @param {!TreeElement} treeNode
 * @param {!WebInspector.RemoteObject} object
 * @param {number} fromIndex
 * @param {number} toIndex
 * @this {WebInspector.ArrayGroupingTreeElement}
 */
WebInspector.ArrayGroupingTreeElement._populateAsFragment = function(treeNode, object, fromIndex, toIndex)
{
    object.callFunction(buildArrayFragment, [{value: fromIndex}, {value: toIndex}, {value: WebInspector.ArrayGroupingTreeElement._sparseIterationThreshold}], processArrayFragment.bind(this));

    /**
     * @suppressReceiverCheck
     * @this {Object}
     * @param {number=} fromIndex // must declare optional
     * @param {number=} toIndex // must declare optional
     * @param {number=} sparseIterationThreshold // must declare optional
     */
    function buildArrayFragment(fromIndex, toIndex, sparseIterationThreshold)
    {
        var result = Object.create(null);
        if (toIndex - fromIndex < sparseIterationThreshold) {
            for (var i = fromIndex; i <= toIndex; ++i) {
                if (i in this)
                    result[i] = this[i];
            }
        } else {
            var ownPropertyNames = Object.getOwnPropertyNames(this);
            for (var i = 0; i < ownPropertyNames.length; ++i) {
                var name = ownPropertyNames[i];
                var index = name >>> 0;
                if (String(index) === name && fromIndex <= index && index <= toIndex)
                    result[index] = this[index];
            }
        }
        return result;
    }

    /**
     * @param {?WebInspector.RemoteObject} arrayFragment
     * @param {boolean=} wasThrown
     * @this {WebInspector.ArrayGroupingTreeElement}
     */
    function processArrayFragment(arrayFragment, wasThrown)
    {
        if (!arrayFragment || wasThrown)
            return;
        arrayFragment.getAllProperties(false, processProperties.bind(this));
    }

    /** @this {WebInspector.ArrayGroupingTreeElement} */
    function processProperties(properties, internalProperties)
    {
        if (!properties)
            return;

        properties.sort(WebInspector.ObjectPropertiesSection.CompareProperties);
        for (var i = 0; i < properties.length; ++i) {
            properties[i].parentObject = this._object;
            var childTreeElement = new WebInspector.ObjectPropertyTreeElement(properties[i]);
            childTreeElement._readOnly = true;
            treeNode.appendChild(childTreeElement);
        }
    }
}

/**
 * @param {!TreeElement} treeNode
 * @param {!WebInspector.RemoteObject} object
 * @param {boolean} skipGetOwnPropertyNames
 * @this {WebInspector.ArrayGroupingTreeElement}
 */
WebInspector.ArrayGroupingTreeElement._populateNonIndexProperties = function(treeNode, object, skipGetOwnPropertyNames)
{
    object.callFunction(buildObjectFragment, [{value: skipGetOwnPropertyNames}], processObjectFragment.bind(this));

    /**
     * @param {boolean=} skipGetOwnPropertyNames
     * @suppressReceiverCheck
     * @this {Object}
     */
    function buildObjectFragment(skipGetOwnPropertyNames)
    {
        var result = { __proto__: this.__proto__ };
        if (skipGetOwnPropertyNames)
            return result;
        var names = Object.getOwnPropertyNames(this);
        for (var i = 0; i < names.length; ++i) {
            var name = names[i];
            // Array index check according to the ES5-15.4.
            if (String(name >>> 0) === name && name >>> 0 !== 0xffffffff)
                continue;
            var descriptor = Object.getOwnPropertyDescriptor(this, name);
            if (descriptor)
                Object.defineProperty(result, name, descriptor);
        }
        return result;
    }

    /**
     * @param {?WebInspector.RemoteObject} arrayFragment
     * @param {boolean=} wasThrown
     * @this {WebInspector.ArrayGroupingTreeElement}
     */
    function processObjectFragment(arrayFragment, wasThrown)
    {
        if (!arrayFragment || wasThrown)
            return;
        arrayFragment.getOwnProperties(processProperties.bind(this));
    }

    /**
     * @param {?Array.<!WebInspector.RemoteObjectProperty>} properties
     * @param {?Array.<!WebInspector.RemoteObjectProperty>=} internalProperties
     * @this {WebInspector.ArrayGroupingTreeElement}
     */
    function processProperties(properties, internalProperties)
    {
        if (!properties)
            return;
        properties.sort(WebInspector.ObjectPropertiesSection.CompareProperties);
        for (var i = 0; i < properties.length; ++i) {
            properties[i].parentObject = this._object;
            var childTreeElement = new WebInspector.ObjectPropertyTreeElement(properties[i]);
            childTreeElement._readOnly = true;
            treeNode.appendChild(childTreeElement);
        }
    }
}

WebInspector.ArrayGroupingTreeElement.prototype = {
    onpopulate: function()
    {
        if (this._propertyCount >= WebInspector.ArrayGroupingTreeElement._bucketThreshold) {
            WebInspector.ArrayGroupingTreeElement._populateRanges(this, this._object, this._fromIndex, this._toIndex, false);
            return;
        }
        WebInspector.ArrayGroupingTreeElement._populateAsFragment(this, this._object, this._fromIndex, this._toIndex);
    },

    onattach: function()
    {
        this.listItemElement.classList.add("object-properties-section-name");
    },

    __proto__: TreeElement.prototype
}

/**
 * @constructor
 * @extends {WebInspector.TextPrompt}
 */
WebInspector.ObjectPropertyPrompt = function()
{
    WebInspector.TextPrompt.call(this, WebInspector.ExecutionContextSelector.completionsForTextPromptInCurrentContext);
    this.setSuggestBoxEnabled(true);
}

WebInspector.ObjectPropertyPrompt.prototype = {
    __proto__: WebInspector.TextPrompt.prototype
}

/**
 * @param {?string} name
 * @return {!Element}
 */
WebInspector.ObjectPropertiesSection.createNameElement = function(name)
{
    var nameElement = createElementWithClass("span", "name");
    if (/^\s|\s$|^$|\n/.test(name))
        nameElement.createTextChildren("\"", name.replace(/\n/g, "\u21B5"), "\"");
    else
        nameElement.textContent = name;
    return nameElement;
}

/**
 * @param {?string=} description
 * @return {string} valueText
 */
WebInspector.ObjectPropertiesSection.valueTextForFunctionDescription = function(description)
{
    var matches = /function\s([^)]*)/.exec(description);
    if (!matches) {
        // process shorthand methods
        matches = /[^(]*(\([^)]*)/.exec(description);
    }
    var match = matches ? matches[1] : null;
    return match ? match.replace(/\n/g, " ") + ")" : (description || "");
}

/**
 * @param {!WebInspector.RemoteObject} value
 * @param {boolean} wasThrown
 * @param {!Element=} parentElement
 * @return {!Element}
 */
WebInspector.ObjectPropertiesSection.createValueElementWithCustomSupport = function(value, wasThrown, parentElement)
{
    if (value.customPreview()) {
        var result = (new WebInspector.CustomPreviewComponent(value)).element;
        result.classList.add("object-properties-section-custom-section");
        return result
    }
    return WebInspector.ObjectPropertiesSection.createValueElement(value, wasThrown, parentElement);
}

/**
 * @param {!WebInspector.RemoteObject} value
 * @param {boolean} wasThrown
 * @param {!Element=} parentElement
 * @return {!Element}
 */
WebInspector.ObjectPropertiesSection.createValueElement = function(value, wasThrown, parentElement)
{
    var valueElement = createElementWithClass("span", "value");
    var type = value.type;
    var subtype = value.subtype;
    var description = value.description;
    var prefix;
    var valueText;
    var suffix;
    if (wasThrown) {
        prefix = "[Exception: ";
        valueText = description;
        suffix = "]";
    } else if (type === "string" && typeof description === "string") {
        // Render \n as a nice unicode cr symbol.
        prefix = "\"";
        valueText = description.replace(/\n/g, "\u21B5");
        suffix = "\"";
    } else if (type === "function") {
        valueText = WebInspector.ObjectPropertiesSection.valueTextForFunctionDescription(description);
    } else if (type !== "object" || subtype !== "node") {
        valueText = description;
    }
    if (type !== "number" || valueText.indexOf("e") === -1) {
        valueElement.setTextContentTruncatedIfNeeded(valueText || "");
        if (prefix)
            valueElement.insertBefore(createTextNode(prefix), valueElement.firstChild);
        if (suffix)
            valueElement.createTextChild(suffix);
    } else {
        var numberParts = valueText.split("e");
        var mantissa = valueElement.createChild("span", "object-value-scientific-notation-mantissa");
        mantissa.textContent = numberParts[0];
        var exponent = valueElement.createChild("span", "object-value-scientific-notation-exponent");
        exponent.textContent = "e" + numberParts[1];
        valueElement.classList.add("object-value-scientific-notation-number");
        if (parentElement)  // FIXME: do it in the caller.
            parentElement.classList.add("hbox");
    }

    if (wasThrown)
        valueElement.classList.add("error");
    if (subtype || type)
        valueElement.classList.add("object-value-" + (subtype || type));

    if (type === "object" && subtype === "node" && description) {
        WebInspector.DOMPresentationUtils.createSpansForNodeTitle(valueElement, description);
        valueElement.addEventListener("click", mouseClick, false);
        valueElement.addEventListener("mousemove", mouseMove, false);
        valueElement.addEventListener("mouseleave", mouseLeave, false);
    } else {
        valueElement.title = description || "";
    }

    function mouseMove()
    {
        WebInspector.DOMModel.highlightObjectAsDOMNode(value);
    }

    function mouseLeave()
    {
        WebInspector.DOMModel.hideDOMNodeHighlight();
    }

    /**
     * @param {!Event} event
     */
    function mouseClick(event)
    {
        WebInspector.Revealer.reveal(value);
        event.consume(true);
    }

    return valueElement;
}

/**
 * @param {!WebInspector.RemoteObject} func
 * @param {!Element} element
 * @param {boolean} linkify
 * @param {boolean=} includePreview
 */
WebInspector.ObjectPropertiesSection.formatObjectAsFunction = function(func, element, linkify, includePreview)
{
    func.functionDetails(didGetDetails);

    /**
     * @param {?WebInspector.DebuggerModel.FunctionDetails} response
     */
    function didGetDetails(response)
    {
        if (!response) {
            var valueText = WebInspector.ObjectPropertiesSection.valueTextForFunctionDescription(func.description);
            element.createTextChild(valueText);
            return;
        }

        if (linkify && response && response.location) {
            var anchor = createElement("span");
            element.classList.add("linkified");
            element.appendChild(anchor);
            element.addEventListener("click", WebInspector.Revealer.reveal.bind(WebInspector.Revealer, response.location, undefined));
            element = anchor;
        }

        var text = func.description.substring(0, 200);
        if (includePreview) {
            element.textContent = text.replace(/^function /, "") + (func.description.length > 200 ? "\u2026" : "");
            return;
        }

        // Now parse description and get the real params and title.
        self.runtime.instancePromise(WebInspector.TokenizerFactory).then(processTokens);

        var params = null;
        var functionName = response ? response.functionName : "";

        /**
         * @param {!WebInspector.TokenizerFactory} tokenizerFactory
         */
        function processTokens(tokenizerFactory)
        {
            var tokenize = tokenizerFactory.createTokenizer("text/javascript");
            tokenize(text, processToken);
            element.textContent = (functionName || "anonymous") + "(" + (params || []).join(", ") + ")";
        }

        var doneProcessing = false;

        /**
         * @param {string} token
         * @param {?string} tokenType
         * @param {number} column
         * @param {number} newColumn
         */
        function processToken(token, tokenType, column, newColumn)
        {
            if (!params && tokenType === "js-variable" && !functionName)
                functionName = token;
            doneProcessing = doneProcessing || token === ")";
            if (doneProcessing)
                return;
            if (token === "(") {
                params = [];
                return;
            }
            if (params && tokenType === "js-def")
                params.push(token);
        }
    }
}
