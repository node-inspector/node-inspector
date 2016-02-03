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
 * @extends {WebInspector.SDKObject}
 * @param {!WebInspector.Target} target
 */
WebInspector.WorkerManager = function(target)
{
    WebInspector.SDKObject.call(this, target);
    target.registerWorkerDispatcher(new WebInspector.WorkerDispatcher(this));
    this._lastAnonymousTargetId = 0;
    /** @type {!Map.<string, !WebInspector.WorkerConnection>} */
    this._connections = new Map();

    /** @type {!Map.<string, !WebInspector.Target>} */
    this._targetsByWorkerId = new Map();

    WebInspector.targetManager.addEventListener(WebInspector.TargetManager.Events.SuspendStateChanged, this._onSuspendStateChanged, this);
    this._onSuspendStateChanged();
    this.enable();
}

WebInspector.WorkerManager.prototype = {
    enable: function()
    {
        if (this._enabled)
            return;
        this._enabled = true;

        this.target().workerAgent().enable();
        this.target().resourceTreeModel.addEventListener(WebInspector.TargetManager.Events.MainFrameNavigated, this._mainFrameNavigated, this);
    },

    disable: function()
    {
        if (!this._enabled)
            return;
        this._enabled = false;
        this._reset();
        this.target().workerAgent().disable();
        this.target().resourceTreeModel.removeEventListener(WebInspector.TargetManager.Events.MainFrameNavigated, this._mainFrameNavigated, this);
    },

    dispose: function()
    {
        this._reset();
    },

    _reset: function()
    {
        for (var connection of this._connections.values())
            connection._close();
        this._connections.clear();
        this._targetsByWorkerId.clear();
    },

    _onSuspendStateChanged: function()
    {
        var suspended = WebInspector.targetManager.allTargetsSuspended();
        this.target().workerAgent().setAutoconnectToWorkers(!suspended);
    },

    /**
     * @param {string} workerId
     * @param {string} url
     * @param {boolean} inspectorConnected
     */
    _workerCreated: function(workerId, url, inspectorConnected)
    {
        var connection = new WebInspector.WorkerConnection(this, workerId, inspectorConnected, onConnectionReady.bind(this));
        this._connections.set(workerId, connection);

        /**
         * @param {!InspectorBackendClass.Connection} connection
         * @this {WebInspector.WorkerManager}
         */
        function onConnectionReady(connection)
        {
            var parsedURL = url.asParsedURL();
            var workerName = parsedURL ? parsedURL.lastPathComponentWithFragment() : "#" + (++this._lastAnonymousTargetId);
            var title = WebInspector.UIString("\u2699 %s", workerName);
            WebInspector.targetManager.createTarget(title, WebInspector.Target.Type.DedicatedWorker, connection, this.target(), targetCreated.bind(this));
        }

        /**
         * @param {?WebInspector.Target} target
         * @this {WebInspector.WorkerManager}
         */
        function targetCreated(target)
        {
            if (!target)
                return;
            this._targetsByWorkerId.set(workerId, target);

            if (inspectorConnected)
                target.runtimeAgent().isRunRequired(pauseInDebuggerAndRunIfRequired.bind(null, target));
        }

        /**
         * @param {!WebInspector.Target} target
         * @param {?Protocol.Error} error
         * @param {boolean} required
         */
        function pauseInDebuggerAndRunIfRequired(target, error, required)
        {
            // Only pause new worker if debugging SW - we are going through the
            // pause on start checkbox.
            var mainIsServiceWorker = WebInspector.targetManager.mainTarget().isServiceWorker();
            if (mainIsServiceWorker && required)
                target.debuggerAgent().pause();
            target.runtimeAgent().run();
        }
    },

    /**
     * @param {string} workerId
     */
    _workerTerminated: function(workerId)
    {
        var connection = this._connections.get(workerId);
        if (connection)
            connection._close();
        this._connections.delete(workerId);
        this._targetsByWorkerId.delete(workerId);
    },

    /**
     * @param {string} workerId
     * @param {string} message
     */
    _dispatchMessageFromWorker: function(workerId, message)
    {
        var connection = this._connections.get(workerId);
        if (connection)
            connection.dispatch(message);
    },

    /**
     * @param {!WebInspector.Event} event
     */
    _mainFrameNavigated: function(event)
    {
        this._reset();
    },

    /**
     * @param {string} workerId
     * @return {?WebInspector.Target}
     */
    targetByWorkerId: function(workerId)
    {
        return this._targetsByWorkerId.get(workerId) || null;
    },

    __proto__: WebInspector.SDKObject.prototype
}

/**
 * @constructor
 * @implements {WorkerAgent.Dispatcher}
 */
WebInspector.WorkerDispatcher = function(workerManager)
{
    this._workerManager = workerManager;
}

WebInspector.WorkerDispatcher.prototype = {
    /**
     * @override
     * @param {string} workerId
     * @param {string} url
     * @param {boolean} inspectorConnected
     */
    workerCreated: function(workerId, url, inspectorConnected)
    {
        this._workerManager._workerCreated(workerId, url, inspectorConnected);
    },

    /**
     * @override
     * @param {string} workerId
     */
    workerTerminated: function(workerId)
    {
        this._workerManager._workerTerminated(workerId);
    },

    /**
     * @override
     * @param {string} workerId
     * @param {string} message
     */
    dispatchMessageFromWorker: function(workerId, message)
    {
        this._workerManager._dispatchMessageFromWorker(workerId, message);
    }
}

/**
 * @constructor
 * @extends {InspectorBackendClass.Connection}
 * @param {!WebInspector.WorkerManager} workerManager
 * @param {string} workerId
 * @param {boolean} inspectorConnected
 * @param {function(!InspectorBackendClass.Connection)} onConnectionReady
 */
WebInspector.WorkerConnection = function(workerManager, workerId, inspectorConnected, onConnectionReady)
{
    InspectorBackendClass.Connection.call(this);
    //FIXME: remove resourceTreeModel and others from worker targets
    this.suppressErrorsForDomains(["Worker", "Page", "CSS", "DOM", "DOMStorage", "Database", "Network", "IndexedDB"]);
    this._agent = workerManager.target().workerAgent();
    this._workerId = workerId;


    if (!inspectorConnected)
        this._agent.connectToWorker(workerId, onConnectionReady.bind(null, this));
    else
        onConnectionReady.call(null, this);
}

WebInspector.WorkerConnection.prototype = {
    /**
     * @override
     * @param {!Object} messageObject
     */
    sendMessage: function(messageObject)
    {
        this._agent.sendMessageToWorker(this._workerId, JSON.stringify(messageObject));
    },

    _close: function()
    {
        this.connectionClosed("worker_terminated");
    },

    __proto__: InspectorBackendClass.Connection.prototype
}
