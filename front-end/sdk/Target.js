/*
 * Copyright 2014 The Chromium Authors. All rights reserved.
 * Use of this source code is governed by a BSD-style license that can be
 * found in the LICENSE file.
 */

/**
 * @constructor
 * @extends {Protocol.Agents}
 * @param {string} name
 * @param {!InspectorBackendClass.Connection} connection
 * @param {function(?WebInspector.Target)=} callback
 */
WebInspector.Target = function(name, connection, callback)
{
    Protocol.Agents.call(this, connection.agentsMap());
    this._name = name;
    this._connection = connection;
    connection.addEventListener(InspectorBackendClass.Connection.Events.Disconnected, this._onDisconnect, this);
    this._id = WebInspector.Target._nextId++;

    /** @type {!Map.<!Function, !WebInspector.SDKModel>} */
    this._modelByConstructor = new Map();

    /** @type {!Object.<string, boolean>} */
    this._capabilities = {};
    this.pageAgent().canScreencast(this._initializeCapability.bind(this, WebInspector.Target.Capabilities.CanScreencast, null));
    this.pageAgent().canEmulate(this._initializeCapability.bind(this, WebInspector.Target.Capabilities.CanEmulate, null));
    if (Runtime.experiments.isEnabled("timelinePowerProfiler"))
        this.powerAgent().canProfilePower(this._initializeCapability.bind(this, WebInspector.Target.Capabilities.CanProfilePower, null));
    this.workerAgent().canInspectWorkers(this._initializeCapability.bind(this, WebInspector.Target.Capabilities.CanInspectWorkers, this._loadedWithCapabilities.bind(this, callback)));
    this.consoleAgent().setTracingBasedTimeline(true);
}

/**
 * @enum {string}
 */
WebInspector.Target.Capabilities = {
    CanScreencast: "CanScreencast",
    HasTouchInputs: "HasTouchInputs",
    CanProfilePower: "CanProfilePower",
    CanInspectWorkers: "CanInspectWorkers",
    CanEmulate: "CanEmulate"
}

WebInspector.Target._nextId = 1;

WebInspector.Target.prototype = {
    suspend: function()
    {
        if (!Runtime.experiments.isEnabled("disableAgentsWhenProfile")) {
            this.debuggerModel.asyncStackTracesStateChanged();
            return;
        }
        this.debuggerModel.suspendModel();
        this.cssModel.suspendModel();
        this.domModel.suspendModel();
    },

    resume: function()
    {
        if (Runtime.experiments.isEnabled("disableAgentsWhenProfile")) {
            this.domModel.resumeModel();
            this.cssModel.resumeModel();
            this.debuggerModel.resumeModel();
        } else {
            this.debuggerModel.asyncStackTracesStateChanged();
        }
    },

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
        if (!WebInspector.resourceTreeModel)
            WebInspector.resourceTreeModel = this.resourceTreeModel;

        /** @type {!WebInspector.NetworkLog} */
        this.networkLog = new WebInspector.NetworkLog(this);
        if (!WebInspector.networkLog)
            WebInspector.networkLog = this.networkLog;

        /** @type {!WebInspector.DebuggerModel} */
        this.debuggerModel = new WebInspector.DebuggerModel(this);
        if (!WebInspector.debuggerModel)
            WebInspector.debuggerModel = this.debuggerModel;

        /** @type {!WebInspector.RuntimeModel} */
        this.runtimeModel = new WebInspector.RuntimeModel(this);
        if (!WebInspector.runtimeModel)
            WebInspector.runtimeModel = this.runtimeModel;

        /** @type {!WebInspector.DOMModel} */
        this.domModel = new WebInspector.DOMModel(this);

        /** @type {!WebInspector.CSSStyleModel} */
        this.cssModel = new WebInspector.CSSStyleModel(this);
        if (!WebInspector.cssModel)
            WebInspector.cssModel = this.cssModel;

        /** @type {!WebInspector.WorkerManager} */
        this.workerManager = new WebInspector.WorkerManager(this, this.hasCapability(WebInspector.Target.Capabilities.CanInspectWorkers));
        if (!WebInspector.workerManager)
            WebInspector.workerManager = this.workerManager;

        if (this.hasCapability(WebInspector.Target.Capabilities.CanProfilePower))
            WebInspector.powerProfiler = new WebInspector.PowerProfiler(this);

        /** @type {!WebInspector.DatabaseModel} */
        this.databaseModel = new WebInspector.DatabaseModel(this);
        if (!WebInspector.databaseModel)
            WebInspector.databaseModel = this.databaseModel;

        /** @type {!WebInspector.DOMStorageModel} */
        this.domStorageModel = new WebInspector.DOMStorageModel(this);
        if (!WebInspector.domStorageModel)
            WebInspector.domStorageModel = this.domStorageModel;

        /** @type {!WebInspector.CPUProfilerModel} */
        this.cpuProfilerModel = new WebInspector.CPUProfilerModel(this);
        if (!WebInspector.cpuProfilerModel)
            WebInspector.cpuProfilerModel = this.cpuProfilerModel;

        /** @type {!WebInspector.HeapProfilerModel} */
        this.heapProfilerModel = new WebInspector.HeapProfilerModel(this);

        /** @type {!WebInspector.IndexedDBModel} */
        this.indexedDBModel = new WebInspector.IndexedDBModel(this);

        /** @type {!WebInspector.LayerTreeModel} */
        this.layerTreeModel = new WebInspector.LayerTreeModel(this);

        /** @type {!WebInspector.AnimationModel} */
        this.animationModel = new WebInspector.AnimationModel(this);

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
    isWorkerTarget: function()
    {
        return !this.hasCapability(WebInspector.Target.Capabilities.CanInspectWorkers);
    },

    /**
     * @return {boolean}
     */
    canEmulate: function()
    {
        return this.hasCapability(WebInspector.Target.Capabilities.CanEmulate);
    },

    _onDisconnect: function()
    {
        WebInspector.targetManager.removeTarget(this);
        this._dispose();
    },

    _dispose: function()
    {
        this.debuggerModel.dispose();
        this.networkManager.dispose();
        this.cpuProfilerModel.dispose();
    },

    /**
     * @return {boolean}
     */
    isDetached: function()
    {
        return this._connection.isClosed();
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
    /** @type {!Object.<string, !Array.<{modelClass: !Function, thisObject: (!Object|undefined), listener: function(!WebInspector.Event)}>>} */
    this._modelListeners = {};
    /** @type {boolean} */
    this._allTargetsSuspended = false;
}

WebInspector.TargetManager.Events = {
    InspectedURLChanged: "InspectedURLChanged",
    MainFrameNavigated: "MainFrameNavigated",
    Load: "Load",
    WillReloadPage: "WillReloadPage",
    SuspendStateChanged: "SuspendStateChanged"
}

WebInspector.TargetManager.prototype = {
    suspendAllTargets: function()
    {
        console.assert(!this._allTargetsSuspended);
        if (this._allTargetsSuspended)
            return;
        this._allTargetsSuspended = true;
        this._targets.forEach(function(target)
        {
            target.suspend();
        });
        this.dispatchEventToListeners(WebInspector.TargetManager.Events.SuspendStateChanged);
    },

    resumeAllTargets: function()
    {
        console.assert(this._allTargetsSuspended);
        if (!this._allTargetsSuspended)
            return;
        this._allTargetsSuspended = false;
        this._targets.forEach(function(target)
        {
            target.resume();
        });
        this.dispatchEventToListeners(WebInspector.TargetManager.Events.SuspendStateChanged);
    },

    /**
     * @return {boolean}
     */
    allTargetsSuspended: function()
    {
        return this._allTargetsSuspended;
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
     */
    observeTargets: function(targetObserver)
    {
        this.targets().forEach(targetObserver.targetAdded.bind(targetObserver));
        this._observers.push(targetObserver);
    },

    /**
     * @param {!WebInspector.TargetManager.Observer} targetObserver
     */
    unobserveTargets: function(targetObserver)
    {
        this._observers.remove(targetObserver);
    },

    /**
     * @param {string} name
     * @param {!InspectorBackendClass.Connection} connection
     * @param {function(?WebInspector.Target)=} callback
     */
    createTarget: function(name, connection, callback)
    {
        var target = new WebInspector.Target(name, connection, callbackWrapper.bind(this));

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
     * @param {!WebInspector.Target} target
     */
    addTarget: function(target)
    {
        this._targets.push(target);
        if (this._targets.length === 1) {
            target.resourceTreeModel.addEventListener(WebInspector.ResourceTreeModel.EventTypes.InspectedURLChanged, this._redispatchEvent, this);
            target.resourceTreeModel.addEventListener(WebInspector.ResourceTreeModel.EventTypes.MainFrameNavigated, this._redispatchEvent, this);
            target.resourceTreeModel.addEventListener(WebInspector.ResourceTreeModel.EventTypes.Load, this._redispatchEvent, this);
            target.resourceTreeModel.addEventListener(WebInspector.ResourceTreeModel.EventTypes.WillReloadPage, this._redispatchEvent, this);
        }
        var copy = this._observers.slice();
        for (var i = 0; i < copy.length; ++i)
            copy[i].targetAdded(target);

        for (var eventType in this._modelListeners) {
            var listeners = this._modelListeners[eventType];
            for (var i = 0; i < listeners.length; ++i) {
                var model = target._modelByConstructor.get(listeners[i].modelClass);
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
        var copy = this._observers.slice();
        for (var i = 0; i < copy.length; ++i)
            copy[i].targetRemoved(target);

        for (var eventType in this._modelListeners) {
            var listeners = this._modelListeners[eventType];
            for (var i = 0; i < listeners.length; ++i) {
                var model = target._modelByConstructor.get(listeners[i].modelClass);
                model.removeEventListener(eventType, listeners[i].listener, listeners[i].thisObject);
            }
        }
    },

    /**
     * @return {boolean}
     */
    hasTargets: function()
    {
        return !!this._targets.length;
    },

    /**
     * @return {!Array.<!WebInspector.Target>}
     */
    targets: function()
    {
        return this._targets.slice();
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
