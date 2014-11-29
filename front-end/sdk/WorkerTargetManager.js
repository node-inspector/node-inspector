// Copyright 2014 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.


/**
 * @constructor
 * @param {!WebInspector.Target} mainTarget
 * @param {!WebInspector.TargetManager} targetManager
 */
WebInspector.WorkerTargetManager = function(mainTarget, targetManager)
{
    this._mainTarget = mainTarget;
    this._targetManager = targetManager;
    this._targetsByWorkerId = new Map();
    mainTarget.workerManager.addEventListener(WebInspector.WorkerManager.Events.WorkerAdded, this._onWorkerAdded, this);
    mainTarget.workerManager.addEventListener(WebInspector.WorkerManager.Events.WorkerRemoved, this._onWorkerRemoved, this);
    mainTarget.workerManager.addEventListener(WebInspector.WorkerManager.Events.WorkersCleared, this._onWorkersCleared, this);
    WebInspector.targetManager.addEventListener(WebInspector.TargetManager.Events.SuspendStateChanged, this._onSuspendStateChanged, this);
    this._onSuspendStateChanged();
    this._lastAnonymousTargetId = 0;
    this._shouldPauseWorkerOnStart = WebInspector.isWorkerFrontend();
}

WebInspector.WorkerTargetManager.prototype = {
    _onSuspendStateChanged: function()
    {
        // FIXME: the logic needs to be extended and cover the case when a worker was started after disabling autoconnect
        // and still alive after enabling autoconnect.
        var suspended = WebInspector.targetManager.allTargetsSuspended();
        this._mainTarget.workerAgent().setAutoconnectToWorkers(!suspended);
    },

    /**
     * @param {!WebInspector.Event} event
     */
    _onWorkerAdded: function(event)
    {
        var data = /** @type {{workerId: number, url: string, inspectorConnected: boolean}} */ (event.data);
        new WebInspector.WorkerConnection(this._mainTarget, data.workerId, data.inspectorConnected, onConnectionReady.bind(this, data.workerId));

        /**
         * @this {WebInspector.WorkerTargetManager}
         * @param {number} workerId
         * @param {!InspectorBackendClass.Connection} connection
         */
        function onConnectionReady(workerId, connection)
        {
            var parsedURL = data.url.asParsedURL();
            var workerName = parsedURL ? parsedURL.lastPathComponent : "#" + (++this._lastAnonymousTargetId);
            this._targetManager.createTarget(WebInspector.UIString("Worker %s", workerName), connection, targetCreated.bind(this, workerId));
        }

        /**
         * @this {WebInspector.WorkerTargetManager}
         * @param {number} workerId
         * @param {?WebInspector.Target} target
         */
        function targetCreated(workerId, target)
        {
            if (!target)
                return;
            if (workerId)
                this._targetsByWorkerId.set(workerId, target);
            if (data.inspectorConnected) {
                if (this._shouldPauseWorkerOnStart)
                    target.debuggerAgent().pause();
                target.runtimeAgent().run(calculateTitle.bind(this, target));
            } else {
                calculateTitle.call(this, target);
            }
            this._shouldPauseWorkerOnStart = false;
        }

        /**
         * @this {WebInspector.WorkerTargetManager}
         * @param {!WebInspector.Target} target
         */
        function calculateTitle(target)
        {
            if (!WebInspector.isWorkerFrontend())
                return;
            this._calculateWorkerInspectorTitle(target);
        }
    },

    /**
     * @param {!WebInspector.Target} target
     */
    _calculateWorkerInspectorTitle: function(target)
    {
        var expression = "location.href";
        expression += " + (this.name ? ' (' + this.name + ')' : '')";
        target.runtimeAgent().invoke_evaluate({expression:expression, doNotPauseOnExceptionsAndMuteConsole:true, returnByValue: true}, evalCallback);

        /**
         * @param {?Protocol.Error} error
         * @param {!RuntimeAgent.RemoteObject} result
         * @param {boolean=} wasThrown
         */
        function evalCallback(error, result, wasThrown)
        {
            if (error || wasThrown) {
                console.error(error);
                return;
            }
            InspectorFrontendHost.inspectedURLChanged(String(result.value));
        }
    },

    _onWorkersCleared: function()
    {
        this._lastAnonymousTargetId = 0;
        this._targetsByWorkerId.clear();
    },

    /**
     * @param {!WebInspector.Event} event
     */
    _onWorkerRemoved: function(event)
    {
        var workerId = /** @type {number} */ (event.data);
        this._targetsByWorkerId.delete(workerId);
    },

    /**
     * @param {number} workerId
     * @return {?WebInspector.Target}
     */
    targetByWorkerId: function(workerId)
    {
        return this._targetsByWorkerId.get(workerId) || null;
    }
}

/**
 * @constructor
 * @extends {InspectorBackendClass.Connection}
 * @param {!WebInspector.Target} target
 * @param {number} workerId
 * @param {boolean} inspectorConnected
 * @param {function(!InspectorBackendClass.Connection)} onConnectionReady
 */
WebInspector.WorkerConnection = function(target, workerId, inspectorConnected, onConnectionReady)
{
    InspectorBackendClass.Connection.call(this);
    //FIXME: remove resourceTreeModel and others from worker targets
    this.suppressErrorsForDomains(["Worker", "Page", "CSS", "DOM", "DOMStorage", "Database", "Network", "IndexedDB"]);
    this._target = target;
    this._workerId = workerId;
    this._workerAgent = target.workerAgent();
    target.workerManager.addEventListener(WebInspector.WorkerManager.Events.MessageFromWorker, this._dispatchMessageFromWorker, this);
    target.workerManager.addEventListener(WebInspector.WorkerManager.Events.WorkerRemoved, this._onWorkerRemoved, this);
    target.workerManager.addEventListener(WebInspector.WorkerManager.Events.WorkersCleared, this._close, this);
    if (!inspectorConnected)
        this._workerAgent.connectToWorker(workerId, onConnectionReady.bind(null, this));
    else
        onConnectionReady.call(null, this);
}

WebInspector.WorkerConnection.prototype = {

    /**
     * @param {!WebInspector.Event} event
     */
    _dispatchMessageFromWorker: function(event)
    {
        var data = /** @type {{workerId: number, command: string, message: !Object}} */ (event.data);
        if (data.workerId === this._workerId)
            this.dispatch(data.message);
    },

    /**
     * @param {!Object} messageObject
     */
    sendMessage: function(messageObject)
    {
        this._workerAgent.sendMessageToWorker(this._workerId, messageObject);
    },

    /**
     * @param {!WebInspector.Event} event
     */
    _onWorkerRemoved: function(event)
    {
        var workerId = /** @type {number} */ (event.data);
        if (workerId === this._workerId)
            this._close();
    },

    _close: function()
    {
        this._target.workerManager.removeEventListener(WebInspector.WorkerManager.Events.MessageFromWorker, this._dispatchMessageFromWorker, this);
        this._target.workerManager.removeEventListener(WebInspector.WorkerManager.Events.WorkerRemoved, this._onWorkerRemoved, this);
        this._target.workerManager.removeEventListener(WebInspector.WorkerManager.Events.WorkersCleared, this._close, this);
        this.connectionClosed("worker_terminated");
    },

    __proto__: InspectorBackendClass.Connection.prototype
}

/**
 * @type {?WebInspector.WorkerTargetManager}
 */
WebInspector.workerTargetManager;
