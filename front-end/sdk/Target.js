/*
 * Copyright 2014 The Chromium Authors. All rights reserved.
 * Use of this source code is governed by a BSD-style license that can be
 * found in the LICENSE file.
 */

/**
 * @constructor
 * @extends {Protocol.Agents}
 * @param {string} name
 * @param {number} type
 * @param {!InspectorBackendClass.Connection} connection
 * @param {?WebInspector.Target} parentTarget
 * @param {function(?WebInspector.Target)=} callback
 */
WebInspector.Target = function(name, type, connection, parentTarget, callback)
{
    Protocol.Agents.call(this, connection.agentsMap());
    this._name = name;
    this._type = type;
    this._connection = connection;
    this._parentTarget = parentTarget;
    connection.addEventListener(InspectorBackendClass.Connection.Events.Disconnected, this._onDisconnect, this);
    this._id = WebInspector.Target._nextId++;

    /** @type {!Map.<!Function, !WebInspector.SDKModel>} */
    this._modelByConstructor = new Map();

    /** @type {!Object.<string, boolean>} */
    this._capabilities = {};
    this.pageAgent().canScreencast(this._initializeCapability.bind(this, WebInspector.Target.Capabilities.CanScreencast, this._loadedWithCapabilities.bind(this, callback)));
}

/**
 * @enum {string}
 */
WebInspector.Target.Capabilities = {
    CanScreencast: "CanScreencast"
}

/**
 * @enum {number}
 */
WebInspector.Target.Type = {
    Page: 1,
    DedicatedWorker: 2,
    ServiceWorker: 4
}

WebInspector.Target._nextId = 1;

WebInspector.Target.prototype = {
    /**
     * @return {number}
     */
    id: function()
    {
        return this._id;
    },

    /**
     *
     * @return {string}
     */
    name: function()
    {
        return this._name;
    },

    /**
     * @param {string} label
     * @return {string}
     */
    decorateLabel: function(label)
    {
        return this.isWorker() ? "\u2699 " + label : label;
    },

    /**
     * @param {string} name
     * @param {function()|null} callback
     * @param {?Protocol.Error} error
     * @param {boolean} result
     */
    _initializeCapability: function(name, callback, error, result)
    {
        this._capabilities[name] = result;
        if (callback)
            callback();
    },

    /**
     * @param {string} capability
     * @return {boolean}
     */
    hasCapability: function(capability)
    {
        return !!this._capabilities[capability];
    },

    /**
     * @param {function(?WebInspector.Target)=} callback
     */
    _loadedWithCapabilities: function(callback)
    {
        if (this._connection.isClosed()) {
            callback(null);
            return;
        }

        /** @type {!WebInspector.ConsoleModel} */
        this.consoleModel = new WebInspector.ConsoleModel(this);
        /** @type {!WebInspector.NetworkManager} */
        this.networkManager = new WebInspector.NetworkManager(this);
        /** @type {!WebInspector.ResourceTreeModel} */
        this.resourceTreeModel = new WebInspector.ResourceTreeModel(this);
        /** @type {!WebInspector.NetworkLog} */
        this.networkLog = new WebInspector.NetworkLog(this);

        if (this.hasJSContext())
            new WebInspector.DebuggerModel(this);

        /** @type {!WebInspector.RuntimeModel} */
        this.runtimeModel = new WebInspector.RuntimeModel(this);

        if (this._type === WebInspector.Target.Type.Page) {
            new WebInspector.DOMModel(this);
            new WebInspector.CSSStyleModel(this);
        }

        /** @type {?WebInspector.WorkerManager} */
        this.workerManager = !this.isDedicatedWorker() ? new WebInspector.WorkerManager(this) : null;
        /** @type {!WebInspector.CPUProfilerModel} */
        this.cpuProfilerModel = new WebInspector.CPUProfilerModel(this);
        /** @type {!WebInspector.HeapProfilerModel} */
        this.heapProfilerModel = new WebInspector.HeapProfilerModel(this);
        /** @type {!WebInspector.LayerTreeModel} */
        this.layerTreeModel = new WebInspector.LayerTreeModel(this);

        this.tracingManager = new WebInspector.TracingManager(this);

        if (this.isPage())
            this.serviceWorkerManager = new WebInspector.ServiceWorkerManager(this);

        if (callback)
            callback(this);
    },

    /**
     * @override
     * @param {string} domain
     * @param {!Object} dispatcher
     */
    registerDispatcher: function(domain, dispatcher)
    {
        this._connection.registerDispatcher(domain, dispatcher);
    },

    /**
     * @return {boolean}
     */
    isPage: function()
    {
        return this._type === WebInspector.Target.Type.Page;
    },

    /**
     * @return {boolean}
     */
    isWorker: function()
    {
        return this.isDedicatedWorker() || this.isServiceWorker();
    },

    /**
     * @return {boolean}
     */
    isDedicatedWorker: function()
    {
        return this._type === WebInspector.Target.Type.DedicatedWorker;
    },

    /**
     * @return {boolean}
     */
    isServiceWorker: function()
    {
        return this._type === WebInspector.Target.Type.ServiceWorker;
    },

    /**
     * @return {boolean}
     */
    hasJSContext: function()
    {
        return !this.isServiceWorker();
    },

    /**
     * @return {?WebInspector.Target}
     */
    parentTarget: function()
    {
        return this._parentTarget;
    },

    _onDisconnect: function()
    {
        WebInspector.targetManager.removeTarget(this);
        this._dispose();
    },

    _dispose: function()
    {
        WebInspector.targetManager.dispatchEventToListeners(WebInspector.TargetManager.Events.TargetDisposed, this);
        this.networkManager.dispose();
        this.cpuProfilerModel.dispose();
        WebInspector.ServiceWorkerCacheModel.fromTarget(this).dispose();
        if (this.workerManager)
            this.workerManager.dispose();
    },

    /**
     * @return {boolean}
     */
    isDetached: function()
    {
        return this._connection.isClosed();
    },

    /**
     * @param {!Function} modelClass
     * @return {?WebInspector.SDKModel}
     */
    model: function(modelClass)
    {
        return this._modelByConstructor.get(modelClass) || null;
    },

    __proto__: Protocol.Agents.prototype
}

/**
 * @constructor
 * @extends {WebInspector.Object}
 * @param {!WebInspector.Target} target
 */
WebInspector.SDKObject = function(target)
{
    WebInspector.Object.call(this);
    this._target = target;
}

WebInspector.SDKObject.prototype = {
    /**
     * @return {!WebInspector.Target}
     */
    target: function()
    {
        return this._target;
    },

    __proto__: WebInspector.Object.prototype
}

/**
 * @constructor
 * @extends {WebInspector.SDKObject}
 * @param {!Function} modelClass
 * @param {!WebInspector.Target} target
 */
WebInspector.SDKModel = function(modelClass, target)
{
    WebInspector.SDKObject.call(this, target);
    target._modelByConstructor.set(modelClass, this);
}

WebInspector.SDKModel.prototype = {
    __proto__: WebInspector.SDKObject.prototype
}

/**
 * @constructor
 * @extends {WebInspector.Object}
 */
WebInspector.TargetManager = function()
{
    WebInspector.Object.call(this);
    /** @type {!Array.<!WebInspector.Target>} */
    this._targets = [];
    /** @type {!Array.<!WebInspector.TargetManager.Observer>} */
    this._observers = [];
    this._observerTypeSymbol = Symbol("observerType");
    /** @type {!Object.<string, !Array.<{modelClass: !Function, thisObject: (!Object|undefined), listener: function(!WebInspector.Event)}>>} */
    this._modelListeners = {};
    /** @type {number} */
    this._suspendCount = 0;
}

WebInspector.TargetManager.Events = {
    InspectedURLChanged: "InspectedURLChanged",
    MainFrameNavigated: "MainFrameNavigated",
    Load: "Load",
    PageReloadRequested: "PageReloadRequested",
    WillReloadPage: "WillReloadPage",
    SuspendStateChanged: "SuspendStateChanged",
    TargetDisposed: "TargetDisposed"
}

WebInspector.TargetManager.prototype = {
    suspendAllTargets: function()
    {
        if (this._suspendCount++)
            return;
        this.dispatchEventToListeners(WebInspector.TargetManager.Events.SuspendStateChanged);
    },

    resumeAllTargets: function()
    {
        console.assert(this._suspendCount > 0);
        if (--this._suspendCount)
            return;
        this.dispatchEventToListeners(WebInspector.TargetManager.Events.SuspendStateChanged);
    },

    /**
     * @return {boolean}
     */
    allTargetsSuspended: function()
    {
        return !!this._suspendCount;
    },

    /**
     * @return {string}
     */
    inspectedPageURL: function()
    {
        if (!this._targets.length)
            return "";

        return this._targets[0].resourceTreeModel.inspectedPageURL();
    },

    /**
     * @return {string}
     */
    inspectedPageDomain: function()
    {
        if (!this._targets.length)
            return "";

        return this._targets[0].resourceTreeModel.inspectedPageDomain();
    },

    /**
     * @param {!WebInspector.Event} event
     */
    _redispatchEvent: function(event)
    {
        this.dispatchEventToListeners(event.type, event.data);
    },

    /**
     * @param {boolean=} ignoreCache
     */
    reloadPage: function(ignoreCache)
    {
        if (this._targets.length)
            this._targets[0].resourceTreeModel.reloadPage(ignoreCache);
    },

    /**
     * @param {!Function} modelClass
     * @param {string} eventType
     * @param {function(!WebInspector.Event)} listener
     * @param {!Object=} thisObject
     */
    addModelListener: function(modelClass, eventType, listener, thisObject)
    {
        for (var i = 0; i < this._targets.length; ++i) {
            var model = this._targets[i]._modelByConstructor.get(modelClass);
            if (model)
                model.addEventListener(eventType, listener, thisObject);
        }
        if (!this._modelListeners[eventType])
            this._modelListeners[eventType] = [];
        this._modelListeners[eventType].push({ modelClass: modelClass, thisObject: thisObject, listener: listener });
    },

    /**
     * @param {!Function} modelClass
     * @param {string} eventType
     * @param {function(!WebInspector.Event)} listener
     * @param {!Object=} thisObject
     */
    removeModelListener: function(modelClass, eventType, listener, thisObject)
    {
        if (!this._modelListeners[eventType])
            return;

        for (var i = 0; i < this._targets.length; ++i) {
            var model = this._targets[i]._modelByConstructor.get(modelClass);
            if (model)
                model.removeEventListener(eventType, listener, thisObject);
        }

        var listeners = this._modelListeners[eventType];
        for (var i = 0; i < listeners.length; ++i) {
            if (listeners[i].modelClass === modelClass && listeners[i].listener === listener && listeners[i].thisObject === thisObject)
                listeners.splice(i--, 1);
        }
        if (!listeners.length)
            delete this._modelListeners[eventType];
    },

    /**
     * @param {!WebInspector.TargetManager.Observer} targetObserver
     * @param {number=} type
     */
    observeTargets: function(targetObserver, type)
    {
        if (this._observerTypeSymbol in targetObserver)
            throw new Error("Observer can only be registered once");
        targetObserver[this._observerTypeSymbol] = type || 0x7fff;
        this.targets(type).forEach(targetObserver.targetAdded.bind(targetObserver));
        this._observers.push(targetObserver);
    },

    /**
     * @param {!WebInspector.TargetManager.Observer} targetObserver
     */
    unobserveTargets: function(targetObserver)
    {
        delete targetObserver[this._observerTypeSymbol];
        this._observers.remove(targetObserver);
    },

    /**
     * @param {string} name
     * @param {number} type
     * @param {!InspectorBackendClass.Connection} connection
     * @param {?WebInspector.Target} parentTarget
     * @param {function(?WebInspector.Target)=} callback
     */
    createTarget: function(name, type, connection, parentTarget, callback)
    {
        new WebInspector.Target(name, type, connection, parentTarget, callbackWrapper.bind(this));

        /**
         * @this {WebInspector.TargetManager}
         * @param {?WebInspector.Target} newTarget
         */
        function callbackWrapper(newTarget)
        {
            if (newTarget)
                this.addTarget(newTarget);
            if (callback)
                callback(newTarget);
        }
    },

    /**
     * @param {number} type
     * @return {!Array<!WebInspector.TargetManager.Observer>}
     */
    _observersByType: function(type)
    {
        var result = [];
        for (var observer of this._observers) {
            if (observer[this._observerTypeSymbol] & type)
                result.push(observer);
        }
        return result;
    },

    /**
     * @param {!WebInspector.Target} target
     */
    addTarget: function(target)
    {
        this._targets.push(target);
        if (this._targets.length === 1) {
            target.resourceTreeModel.addEventListener(WebInspector.ResourceTreeModel.EventTypes.InspectedURLChanged, this._redispatchEvent, this);
            target.resourceTreeModel.addEventListener(WebInspector.ResourceTreeModel.EventTypes.MainFrameNavigated, this._redispatchEvent, this);
            target.resourceTreeModel.addEventListener(WebInspector.ResourceTreeModel.EventTypes.Load, this._redispatchEvent, this);
            target.resourceTreeModel.addEventListener(WebInspector.ResourceTreeModel.EventTypes.PageReloadRequested, this._redispatchEvent, this);
            target.resourceTreeModel.addEventListener(WebInspector.ResourceTreeModel.EventTypes.WillReloadPage, this._redispatchEvent, this);
        }
        var copy = this._observersByType(target._type);
        for (var i = 0; i < copy.length; ++i)
            copy[i].targetAdded(target);

        for (var eventType in this._modelListeners) {
            var listeners = this._modelListeners[eventType];
            for (var i = 0; i < listeners.length; ++i) {
                var model = target._modelByConstructor.get(listeners[i].modelClass);
                if (model)
                    model.addEventListener(eventType, listeners[i].listener, listeners[i].thisObject);
            }
        }
    },

    /**
     * @param {!WebInspector.Target} target
     */
    removeTarget: function(target)
    {
        this._targets.remove(target);
        if (this._targets.length === 0) {
            target.resourceTreeModel.removeEventListener(WebInspector.ResourceTreeModel.EventTypes.InspectedURLChanged, this._redispatchEvent, this);
            target.resourceTreeModel.removeEventListener(WebInspector.ResourceTreeModel.EventTypes.MainFrameNavigated, this._redispatchEvent, this);
            target.resourceTreeModel.removeEventListener(WebInspector.ResourceTreeModel.EventTypes.Load, this._redispatchEvent, this);
            target.resourceTreeModel.removeEventListener(WebInspector.ResourceTreeModel.EventTypes.WillReloadPage, this._redispatchEvent, this);
        }
        var copy = this._observersByType(target._type);
        for (var i = 0; i < copy.length; ++i)
            copy[i].targetRemoved(target);

        for (var eventType in this._modelListeners) {
            var listeners = this._modelListeners[eventType];
            for (var i = 0; i < listeners.length; ++i) {
                var model = target._modelByConstructor.get(listeners[i].modelClass);
                if (model)
                    model.removeEventListener(eventType, listeners[i].listener, listeners[i].thisObject);
            }
        }
    },

    /**
     * @param {number=} type
     * @return {boolean}
     */
    hasTargets: function(type)
    {
        return !!this.targets(type).length;
    },

    /**
     * @param {number=} type
     * @return {!Array.<!WebInspector.Target>}
     */
    targets: function(type)
    {
        if (!type)
            return this._targets.slice();

        var result = [];
        for (var target of this._targets) {
            if (target._type & type)
                result.push(target);
        }
        return result;
    },

    /**
     * @return {!Array.<!WebInspector.Target>}
     */
    targetsWithJSContext: function()
    {
        var result = [];
        for (var target of this._targets) {
            if (target.hasJSContext())
                result.push(target);
        }
        return result;
    },

    /**
     *
     * @param {number} id
     * @return {?WebInspector.Target}
     */
    targetById: function(id)
    {
        for (var i = 0; i < this._targets.length; ++i) {
            if (this._targets[i].id() === id)
                return this._targets[i];
        }
        return null;
    },

    /**
     * @return {?WebInspector.Target}
     */
    mainTarget: function()
    {
        return this._targets[0] || null;
    },

    __proto__: WebInspector.Object.prototype
}

/**
 * @interface
 */
WebInspector.TargetManager.Observer = function()
{
}

WebInspector.TargetManager.Observer.prototype = {
    /**
     * @param {!WebInspector.Target} target
     */
    targetAdded: function(target) { },

    /**
     * @param {!WebInspector.Target} target
     */
    targetRemoved: function(target) { },
}

/**
 * @type {!WebInspector.TargetManager}
 */
WebInspector.targetManager = new WebInspector.TargetManager();
