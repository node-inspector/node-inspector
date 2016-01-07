// Copyright 2015 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

/**
* @typedef {Array<{object: !WebInspector.RemoteObject, eventListeners: ?Array<!WebInspector.EventListener>, frameworkEventListeners: ?{eventListeners: ?Array<!WebInspector.EventListener>, internalHandlers: ?WebInspector.RemoteArray}, isInternal: ?Array<boolean>}>}
*/
WebInspector.EventListenersResult;

/**
 * @constructor
 * @param {!Element} element
 */
WebInspector.EventListenersView = function(element)
{
    this._element = element;
    this._treeOutline = new TreeOutlineInShadow("event-listener-tree");
    this._treeOutline.registerRequiredCSS("components/objectValue.css");
    this._treeOutline.registerRequiredCSS("components/eventListenersView.css");
    this._treeOutline.setComparator(WebInspector.EventListenersTreeElement.comparator);
    this._treeOutline.element.classList.add("monospace");
    this._element.appendChild(this._treeOutline.element)
    this._emptyHolder = createElementWithClass("div", "info");
    this._emptyHolder.textContent = WebInspector.UIString("No Event Listeners");
    this._linkifier = new WebInspector.Linkifier();
    /** @type {!Map<string, !WebInspector.EventListenersTreeElement>} */
    this._treeItemMap = new Map();
}

WebInspector.EventListenersView.prototype = {
    /**
     * @param {!Array<!WebInspector.RemoteObject>} objects
     * @return {!Promise<undefined>}
     */
    addObjects: function(objects)
    {
        this.reset();
        var promises = [];
        for (var object of objects)
            promises.push(this._addObject(object));
        return Promise.all(promises).then(this.addEmptyHolderIfNeeded.bind(this)).then(this._eventListenersArrivedForTest.bind(this));
     },

    /**
     * @param {!WebInspector.RemoteObject} object
     * @return {!Promise<undefined>}
     */
    _addObject: function(object)
    {
        /** @type {?Array<!WebInspector.EventListener>} */
        var eventListeners = null;
        /** @type {?WebInspector.FrameworkEventListenersObject}*/
        var frameworkEventListenersObject = null;

        var promises = [];
        promises.push(object.eventListeners().then(storeEventListeners));
        promises.push(WebInspector.EventListener.frameworkEventListeners(object).then(storeFrameworkEventListenersObject));
        return Promise.all(promises).then(markInternalEventListeners).then(addEventListeners.bind(this));

        /**
         * @param {?Array<!WebInspector.EventListener>} result
         */
        function storeEventListeners(result)
        {
            eventListeners = result;
        }

        /**
         * @param {?WebInspector.FrameworkEventListenersObject} result
         */
        function storeFrameworkEventListenersObject(result)
        {
            frameworkEventListenersObject = result;
        }

        /**
         * @return {!Promise<undefined>}
         */
        function markInternalEventListeners()
        {
            if (!eventListeners || !frameworkEventListenersObject.internalHandlers)
                return Promise.resolve(undefined);
            return frameworkEventListenersObject.internalHandlers.object().callFunctionJSONPromise(isInternalEventListener, eventListeners.map(handlerArgument)).then(setIsInternal);

            /**
             * @param {!WebInspector.EventListener} listener
             * @return {!RuntimeAgent.CallArgument}
             */
            function handlerArgument(listener)
            {
                return WebInspector.RemoteObject.toCallArgument(listener.handler());
            }

            /**
             * @suppressReceiverCheck
             * @return {!Array<boolean>}
             * @this {Array<*>}
             */
            function isInternalEventListener()
            {
                var isInternal = [];
                var internalHandlersSet = new Set(this);
                for (var handler of arguments)
                    isInternal.push(internalHandlersSet.has(handler));
                return isInternal;
            }

            /**
             * @param {!Array<boolean>} isInternal
             */
            function setIsInternal(isInternal)
            {
                for (var i = 0; i < eventListeners.length; ++i) {
                    if (isInternal[i])
                        eventListeners[i].setListenerType("frameworkInternal");
                }
            }
        }

        /**
         * @this {WebInspector.EventListenersView}
         */
        function addEventListeners()
        {
            this._addObjectEventListeners(object, eventListeners);
            this._addObjectEventListeners(object, frameworkEventListenersObject.eventListeners);
        }
    },

    /**
     * @param {!WebInspector.RemoteObject} object
     * @param {?Array<!WebInspector.EventListener>} eventListeners
     */
    _addObjectEventListeners: function(object, eventListeners)
    {
        if (!eventListeners)
            return;
        for (var eventListener of eventListeners) {
            var treeItem = this._getOrCreateTreeElementForType(eventListener.type());
            treeItem.addObjectEventListener(eventListener, object);
        }
    },

    /**
     * @param {boolean} showFramework
     */
    showFrameworkListeners: function(showFramework)
    {
        var eventTypes = this._treeOutline.rootElement().children();
        for (var eventType of eventTypes) {
            var hiddenEventType = true;
            for (var listenerElement of eventType.children()) {
                var listenerType = listenerElement.eventListener().listenerType();
                var hidden = false;
                if (listenerType === "frameworkUser" && !showFramework)
                    hidden = true;
                if (listenerType === "frameworkInternal" && showFramework)
                    hidden = true;
                listenerElement.hidden = hidden;
                hiddenEventType = hiddenEventType && hidden;
            }
            eventType.hidden = hiddenEventType;
        }
    },

    /**
     * @param {string} type
     * @return {!WebInspector.EventListenersTreeElement}
     */
    _getOrCreateTreeElementForType: function(type)
    {
        var treeItem = this._treeItemMap.get(type);
        if (!treeItem) {
            treeItem = new WebInspector.EventListenersTreeElement(type, this._linkifier);
            this._treeItemMap.set(type, treeItem);
            treeItem.hidden = true;
            this._treeOutline.appendChild(treeItem);
        }
        this._emptyHolder.remove();
        return treeItem;
    },

    addEmptyHolderIfNeeded: function()
    {
        var allHidden = true;
        for (var eventType of this._treeOutline.rootElement().children()) {
            eventType.hidden = !eventType.firstChild();
            allHidden = allHidden && eventType.hidden;
        }
        if (allHidden && !this._emptyHolder.parentNode)
           this._element.appendChild(this._emptyHolder);
    },

    reset: function()
    {
        var eventTypes = this._treeOutline.rootElement().children();
        for (var eventType of eventTypes)
            eventType.removeChildren();
        this._linkifier.reset();
    },

    _eventListenersArrivedForTest: function()
    {
    }
}

/**
 * @constructor
 * @extends {TreeElement}
 * @param {string} type
 * @param {!WebInspector.Linkifier} linkifier
 */
WebInspector.EventListenersTreeElement = function(type, linkifier)
{
    TreeElement.call(this, type);
    this.toggleOnClick = true;
    this.selectable = false;
    this._linkifier = linkifier;
}

/**
 * @param {!TreeElement} element1
 * @param {!TreeElement} element2
 * @return {number}
 */
WebInspector.EventListenersTreeElement.comparator = function(element1, element2) {
    if (element1.title === element2.title)
        return 0;
    return element1.title > element2.title ? 1 : -1;
}

WebInspector.EventListenersTreeElement.prototype = {
    /**
     * @param {!WebInspector.EventListener} eventListener
     * @param {!WebInspector.RemoteObject} object
     */
    addObjectEventListener: function(eventListener, object)
    {
        var treeElement = new WebInspector.ObjectEventListenerBar(eventListener, object, this._linkifier);
        this.appendChild(/** @type {!TreeElement} */ (treeElement));
    },

    __proto__: TreeElement.prototype
}

/**
 * @constructor
 * @extends {TreeElement}
 * @param {!WebInspector.EventListener} eventListener
 * @param {!WebInspector.RemoteObject} object
 * @param {!WebInspector.Linkifier} linkifier
 */
WebInspector.ObjectEventListenerBar = function(eventListener, object, linkifier)
{
    TreeElement.call(this, "", true);
    this._eventListener = eventListener;
    this.editable = false;
    this.selectable = false;
    this._setTitle(object, linkifier);
}

WebInspector.ObjectEventListenerBar.prototype = {
    onpopulate: function()
    {
        var properties = [];
        var eventListener = this._eventListener;
        var runtimeModel = eventListener.target().runtimeModel;
        properties.push(runtimeModel.createRemotePropertyFromPrimitiveValue("useCapture", eventListener.useCapture()));
        if (typeof eventListener.handler() !== "undefined")
            properties.push(new WebInspector.RemoteObjectProperty("handler", eventListener.handler()));
        WebInspector.ObjectPropertyTreeElement.populateWithProperties(this, properties, [], true, null);
    },

    /**
     * @param {!WebInspector.RemoteObject} object
     * @param {!WebInspector.Linkifier} linkifier
     */
    _setTitle: function(object, linkifier)
    {
        var title = this.listItemElement.createChild("span");
        var subtitle = this.listItemElement.createChild("span", "event-listener-tree-subtitle");
        subtitle.appendChild(linkifier.linkifyRawLocation(this._eventListener.location(), this._eventListener.sourceURL()));

        title.appendChild(WebInspector.ObjectPropertiesSection.createValueElement(object, false));

        if (this._eventListener.removeFunction()) {
            var deleteButton = title.createChild("span", "event-listener-delete-button");
            deleteButton.textContent = WebInspector.UIString("Remove");
            deleteButton.title = WebInspector.UIString("Delete event listener");
            deleteButton.addEventListener("click", removeListener.bind(this), false);
            title.appendChild(deleteButton);
        }

        /**
         * @param {!WebInspector.Event} event
         * @this {WebInspector.ObjectEventListenerBar}
         */
        function removeListener(event)
        {
            event.consume();
            this._removeListenerBar();
            this._eventListener.remove();
        }
    },

    _removeListenerBar: function()
    {
        var parent = this.parent;
        parent.removeChild(this);
        if (!parent.childCount()) {
            parent.parent.removeChild(parent);
            return;
        }
        var allHidden = true;
        for (var i = 0; i < parent.childCount(); ++i)
            if (!parent.childAt(i).hidden)
                allHidden = false;
        parent.hidden = allHidden;
    },

    /**
     * @return {!WebInspector.EventListener}
     */
    eventListener: function()
    {
        return this._eventListener;
    },

    __proto__: TreeElement.prototype
}
