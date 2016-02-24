/*
 * Copyright (C) 2011 Google Inc. All rights reserved.
 *
 * Redistribution and use in source and binary forms, with or without
 * modification, are permitted provided that the following conditions are
 * met:
 *
 *     * Redistributions of source code must retain the above copyrightdd
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
 * @param {function(string, *)} eventHandler
 * @extends {WebInspector.Object}
 */
WebInspector.HeapSnapshotWorkerProxy = function(eventHandler)
{
    this._eventHandler = eventHandler;
    this._nextObjectId = 1;
    this._nextCallId = 1;
    this._callbacks = [];
    this._previousCallbacks = [];
    this._worker = new WorkerRuntime.Worker("heap_snapshot_worker");
    this._worker.onmessage = this._messageReceived.bind(this);
}

WebInspector.HeapSnapshotWorkerProxy.prototype = {
    /**
     * @param {number} profileUid
     * @param {function(!WebInspector.HeapSnapshotProxy)} snapshotReceivedCallback
     * @return {!WebInspector.HeapSnapshotLoaderProxy}
     */
    createLoader: function(profileUid, snapshotReceivedCallback)
    {
        var objectId = this._nextObjectId++;
        var proxy = new WebInspector.HeapSnapshotLoaderProxy(this, objectId, profileUid, snapshotReceivedCallback);
        this._postMessage({callId: this._nextCallId++, disposition: "create", objectId: objectId, methodName: "WebInspector.HeapSnapshotLoader"});
        return proxy;
    },

    dispose: function()
    {
        this._worker.terminate();
        if (this._interval)
            clearInterval(this._interval);
    },

    disposeObject: function(objectId)
    {
        this._postMessage({callId: this._nextCallId++, disposition: "dispose", objectId: objectId});
    },

    evaluateForTest: function(script, callback)
    {
        var callId = this._nextCallId++;
        this._callbacks[callId] = callback;
        this._postMessage({callId: callId, disposition: "evaluateForTest", source: script});
    },

    /**
     * @param {?function(...?)} callback
     * @param {string} objectId
     * @param {string} methodName
     * @param {function(new:T, ...?)} proxyConstructor
     * @return {?Object}
     * @template T
     */
    callFactoryMethod: function(callback, objectId, methodName, proxyConstructor)
    {
        var callId = this._nextCallId++;
        var methodArguments = Array.prototype.slice.call(arguments, 4);
        var newObjectId = this._nextObjectId++;

        /**
         * @this {WebInspector.HeapSnapshotWorkerProxy}
         */
        function wrapCallback(remoteResult)
        {
            callback(remoteResult ? new proxyConstructor(this, newObjectId) : null);
        }

        if (callback) {
            this._callbacks[callId] = wrapCallback.bind(this);
            this._postMessage({callId: callId, disposition: "factory", objectId: objectId, methodName: methodName, methodArguments: methodArguments, newObjectId: newObjectId});
            return null;
        } else {
            this._postMessage({callId: callId, disposition: "factory", objectId: objectId, methodName: methodName, methodArguments: methodArguments, newObjectId: newObjectId});
            return new proxyConstructor(this, newObjectId);
        }
    },

    /**
     * @param {function(*)} callback
     * @param {string} objectId
     * @param {string} methodName
     */
    callMethod: function(callback, objectId, methodName)
    {
        var callId = this._nextCallId++;
        var methodArguments = Array.prototype.slice.call(arguments, 3);
        if (callback)
            this._callbacks[callId] = callback;
        this._postMessage({callId: callId, disposition: "method", objectId: objectId, methodName: methodName, methodArguments: methodArguments});
    },

    startCheckingForLongRunningCalls: function()
    {
        if (this._interval)
            return;
        this._checkLongRunningCalls();
        this._interval = setInterval(this._checkLongRunningCalls.bind(this), 300);
    },

    _checkLongRunningCalls: function()
    {
        for (var callId in this._previousCallbacks)
            if (!(callId in this._callbacks))
                delete this._previousCallbacks[callId];
        var hasLongRunningCalls = false;
        for (callId in this._previousCallbacks) {
            hasLongRunningCalls = true;
            break;
        }
        this.dispatchEventToListeners("wait", hasLongRunningCalls);
        for (callId in this._callbacks)
            this._previousCallbacks[callId] = true;
    },

    /**
     * @param {!MessageEvent} event
     */
    _messageReceived: function(event)
    {
        var data = event.data;
        if (data.eventName) {
            if (this._eventHandler)
                this._eventHandler(data.eventName, data.data);
            return;
        }
        if (data.error) {
            if (data.errorMethodName)
                WebInspector.console.error(WebInspector.UIString("An error occurred when a call to method '%s' was requested", data.errorMethodName));
            WebInspector.console.error(data["errorCallStack"]);
            delete this._callbacks[data.callId];
            return;
        }
        if (!this._callbacks[data.callId])
            return;
        var callback = this._callbacks[data.callId];
        delete this._callbacks[data.callId];
        callback(data.result);
    },

    _postMessage: function(message)
    {
        this._worker.postMessage(message);
    },

    __proto__: WebInspector.Object.prototype
}


/**
 * @constructor
 * @param {!WebInspector.HeapSnapshotWorkerProxy} worker
 * @param {number} objectId
 */
WebInspector.HeapSnapshotProxyObject = function(worker, objectId)
{
    this._worker = worker;
    this._objectId = objectId;
}

WebInspector.HeapSnapshotProxyObject.prototype = {
    /**
     * @param {string} workerMethodName
     * @param {!Array.<*>} args
     */
    _callWorker: function(workerMethodName, args)
    {
        args.splice(1, 0, this._objectId);
        return this._worker[workerMethodName].apply(this._worker, args);
    },

    dispose: function()
    {
        this._worker.disposeObject(this._objectId);
    },

    disposeWorker: function()
    {
        this._worker.dispose();
    },

    /**
     * @param {?function(...?)} callback
     * @param {string} methodName
     * @param {function (new:T, ...?)} proxyConstructor
     * @param {...*} var_args
     * @return {!T}
     * @template T
     */
    callFactoryMethod: function(callback, methodName, proxyConstructor, var_args)
    {
        return this._callWorker("callFactoryMethod", Array.prototype.slice.call(arguments, 0));
    },

    /**
     * @param {function(T)|undefined} callback
     * @param {string} methodName
     * @param {...*} var_args
     * @return {*}
     * @template T
     */
    callMethod: function(callback, methodName, var_args)
    {
        return this._callWorker("callMethod", Array.prototype.slice.call(arguments, 0));
    },

    /**
     * @param {string} methodName
     * @param {...*} var_args
     * @return {!Promise.<?T>}
     * @template T
     */
    _callMethodPromise: function(methodName, var_args)
    {
        /**
         * @param {!Array.<*>} args
         * @param {function(?T)} fulfill
         * @this {WebInspector.HeapSnapshotProxyObject}
         * @template T
         */
        function action(args, fulfill)
        {
            this._callWorker("callMethod", [fulfill].concat(args));
        }
        return new Promise(action.bind(this, Array.prototype.slice.call(arguments)));
    }
};

/**
 * @constructor
 * @extends {WebInspector.HeapSnapshotProxyObject}
 * @implements {WebInspector.OutputStream}
 * @param {!WebInspector.HeapSnapshotWorkerProxy} worker
 * @param {number} objectId
 * @param {number} profileUid
 * @param {function(!WebInspector.HeapSnapshotProxy)} snapshotReceivedCallback
 */
WebInspector.HeapSnapshotLoaderProxy = function(worker, objectId, profileUid, snapshotReceivedCallback)
{
    WebInspector.HeapSnapshotProxyObject.call(this, worker, objectId);
    this._profileUid = profileUid;
    this._snapshotReceivedCallback = snapshotReceivedCallback;
}

WebInspector.HeapSnapshotLoaderProxy.prototype = {
    /**
     * @override
     * @param {string} chunk
     * @param {function(!WebInspector.OutputStream)=} callback
     */
    write: function(chunk, callback)
    {
        this.callMethod(callback, "write", chunk);
    },

    /**
     * @override
     * @param {function()=} callback
     */
    close: function(callback)
    {
        /**
         * @this {WebInspector.HeapSnapshotLoaderProxy}
         */
        function buildSnapshot()
        {
            if (callback)
                callback();
            var showHiddenData = WebInspector.moduleSetting("showAdvancedHeapSnapshotProperties").get();
            this.callFactoryMethod(updateStaticData.bind(this), "buildSnapshot", WebInspector.HeapSnapshotProxy, showHiddenData);
        }

        /**
         * @param {!WebInspector.HeapSnapshotProxy} snapshotProxy
         * @this {WebInspector.HeapSnapshotLoaderProxy}
         */
        function updateStaticData(snapshotProxy)
        {
            this.dispose();
            snapshotProxy.setProfileUid(this._profileUid);
            snapshotProxy.updateStaticData(this._snapshotReceivedCallback.bind(this));
        }

        this.callMethod(buildSnapshot.bind(this), "close");
    },

    __proto__: WebInspector.HeapSnapshotProxyObject.prototype
}


/**
 * @constructor
 * @extends {WebInspector.HeapSnapshotProxyObject}
 * @param {!WebInspector.HeapSnapshotWorkerProxy} worker
 * @param {number} objectId
 */
WebInspector.HeapSnapshotProxy = function(worker, objectId)
{
    WebInspector.HeapSnapshotProxyObject.call(this, worker, objectId);
    /** @type {?WebInspector.HeapSnapshotCommon.StaticData} */
    this._staticData = null;
}

WebInspector.HeapSnapshotProxy.prototype = {
    /**
     * @param {!WebInspector.HeapSnapshotCommon.SearchConfig} searchConfig
     * @param {!WebInspector.HeapSnapshotCommon.NodeFilter} filter
     * @return {!Promise<!Array<number>>}
     */
    search: function(searchConfig, filter)
    {
        return this._callMethodPromise("search", searchConfig, filter);
    },

    /**
     * @param {!WebInspector.HeapSnapshotCommon.NodeFilter} filter
     * @param {function(!Object.<string, !WebInspector.HeapSnapshotCommon.Aggregate>)} callback
     */
    aggregatesWithFilter: function(filter, callback)
    {
        this.callMethod(callback, "aggregatesWithFilter", filter);
    },

    aggregatesForDiff: function(callback)
    {
        this.callMethod(callback, "aggregatesForDiff");
    },

    calculateSnapshotDiff: function(baseSnapshotId, baseSnapshotAggregates, callback)
    {
        this.callMethod(callback, "calculateSnapshotDiff", baseSnapshotId, baseSnapshotAggregates);
    },

    /**
     * @param {number} snapshotObjectId
     * @return {!Promise<?string>}
     */
    nodeClassName: function(snapshotObjectId)
    {
        return this._callMethodPromise("nodeClassName", snapshotObjectId);
    },

    /**
     * @param {number} nodeIndex
     * @return {!WebInspector.HeapSnapshotProviderProxy}
     */
    createEdgesProvider: function(nodeIndex)
    {
        return this.callFactoryMethod(null, "createEdgesProvider", WebInspector.HeapSnapshotProviderProxy, nodeIndex);
    },

    /**
     * @param {number} nodeIndex
     * @return {!WebInspector.HeapSnapshotProviderProxy}
     */
    createRetainingEdgesProvider: function(nodeIndex)
    {
        return this.callFactoryMethod(null, "createRetainingEdgesProvider", WebInspector.HeapSnapshotProviderProxy, nodeIndex);
    },

    /**
     * @param {string} baseSnapshotId
     * @param {string} className
     * @return {?WebInspector.HeapSnapshotProviderProxy}
     */
    createAddedNodesProvider: function(baseSnapshotId, className)
    {
        return this.callFactoryMethod(null, "createAddedNodesProvider", WebInspector.HeapSnapshotProviderProxy, baseSnapshotId, className);
    },

    /**
     * @param {!Array.<number>} nodeIndexes
     * @return {?WebInspector.HeapSnapshotProviderProxy}
     */
    createDeletedNodesProvider: function(nodeIndexes)
    {
        return this.callFactoryMethod(null, "createDeletedNodesProvider", WebInspector.HeapSnapshotProviderProxy, nodeIndexes);
    },

    /**
     * @param {function(*):boolean} filter
     * @return {?WebInspector.HeapSnapshotProviderProxy}
     */
    createNodesProvider: function(filter)
    {
        return this.callFactoryMethod(null, "createNodesProvider", WebInspector.HeapSnapshotProviderProxy, filter);
    },

    /**
     * @param {string} className
     * @param {!WebInspector.HeapSnapshotCommon.NodeFilter} nodeFilter
     * @return {?WebInspector.HeapSnapshotProviderProxy}
     */
    createNodesProviderForClass: function(className, nodeFilter)
    {
        return this.callFactoryMethod(null, "createNodesProviderForClass", WebInspector.HeapSnapshotProviderProxy, className, nodeFilter);
    },

    allocationTracesTops: function(callback)
    {
        this.callMethod(callback, "allocationTracesTops");
    },

    /**
     * @param {number} nodeId
     * @param {function(!WebInspector.HeapSnapshotCommon.AllocationNodeCallers)} callback
     */
    allocationNodeCallers: function(nodeId, callback)
    {
        this.callMethod(callback, "allocationNodeCallers", nodeId);
    },

    /**
     * @param {number} nodeIndex
     * @param {function(?Array.<!WebInspector.HeapSnapshotCommon.AllocationStackFrame>)} callback
     */
    allocationStack: function(nodeIndex, callback)
    {
        this.callMethod(callback, "allocationStack", nodeIndex);
    },

    dispose: function()
    {
        throw new Error("Should never be called");
    },

    get nodeCount()
    {
        return this._staticData.nodeCount;
    },

    get rootNodeIndex()
    {
        return this._staticData.rootNodeIndex;
    },

    updateStaticData: function(callback)
    {
        /**
         * @param {!WebInspector.HeapSnapshotCommon.StaticData} staticData
         * @this {WebInspector.HeapSnapshotProxy}
         */
        function dataReceived(staticData)
        {
            this._staticData = staticData;
            callback(this);
        }
        this.callMethod(dataReceived.bind(this), "updateStaticData");
    },

    /**
     * @return {!Promise.<!WebInspector.HeapSnapshotCommon.Statistics>}
     */
    getStatistics: function()
    {
        return this._callMethodPromise("getStatistics");
    },

    /**
     * @return {!Promise.<?WebInspector.HeapSnapshotCommon.Samples>}
     */
    getSamples: function()
    {
        return this._callMethodPromise("getSamples");
    },

    get totalSize()
    {
        return this._staticData.totalSize;
    },

    get uid()
    {
        return this._profileUid;
    },

    setProfileUid: function(profileUid)
    {
        this._profileUid = profileUid;
    },

    /**
     * @return {number}
     */
    maxJSObjectId: function()
    {
        return this._staticData.maxJSObjectId;
    },

    __proto__: WebInspector.HeapSnapshotProxyObject.prototype
}


/**
 * @constructor
 * @extends {WebInspector.HeapSnapshotProxyObject}
 * @implements {WebInspector.HeapSnapshotGridNode.ChildrenProvider}
 * @param {!WebInspector.HeapSnapshotWorkerProxy} worker
 * @param {number} objectId
 */
WebInspector.HeapSnapshotProviderProxy = function(worker, objectId)
{
    WebInspector.HeapSnapshotProxyObject.call(this, worker, objectId);
}

WebInspector.HeapSnapshotProviderProxy.prototype = {
    /**
     * @override
     * @param {number} snapshotObjectId
     * @return {!Promise<number>}
     */
    nodePosition: function(snapshotObjectId)
    {
        return this._callMethodPromise("nodePosition", snapshotObjectId);
    },

    /**
     * @override
     * @param {function(boolean)} callback
     */
    isEmpty: function(callback)
    {
        this.callMethod(callback, "isEmpty");
    },

    /**
     * @override
     * @param {number} startPosition
     * @param {number} endPosition
     * @param {function(!WebInspector.HeapSnapshotCommon.ItemsRange)} callback
     */
    serializeItemsRange: function(startPosition, endPosition, callback)
    {
        this.callMethod(callback, "serializeItemsRange", startPosition, endPosition);
    },

    /**
     * @override
     * @param {!WebInspector.HeapSnapshotCommon.ComparatorConfig} comparator
     * @return {!Promise<?>}
     */
    sortAndRewind: function(comparator)
    {
        return this._callMethodPromise("sortAndRewind", comparator);
    },

    __proto__: WebInspector.HeapSnapshotProxyObject.prototype
}
