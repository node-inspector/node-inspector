// Copyright 2014 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

/**
 * Invariant: This model can only be constructed on a ServiceWorker target.
 * @constructor
 * @extends {WebInspector.SDKModel}
 */
WebInspector.ServiceWorkerCacheModel = function(target)
{
    WebInspector.SDKModel.call(this, WebInspector.ServiceWorkerCacheModel, target);

    /** @type {!Map<string, !WebInspector.ServiceWorkerCacheModel.Cache>} */
    this._caches = new Map();

    this._agent = target.cacheStorageAgent();

    /** @type {boolean} */
    this._enabled = false;
}

WebInspector.ServiceWorkerCacheModel.EventTypes = {
    CacheAdded: "CacheAdded",
    CacheRemoved: "CacheRemoved"
}

WebInspector.ServiceWorkerCacheModel.prototype = {
    enable: function()
    {
        if (this._enabled)
            return;

        this.target().resourceTreeModel.addEventListener(WebInspector.ResourceTreeModel.EventTypes.SecurityOriginAdded, this._securityOriginAdded, this);
        this.target().resourceTreeModel.addEventListener(WebInspector.ResourceTreeModel.EventTypes.SecurityOriginRemoved, this._securityOriginRemoved, this);

        var securityOrigins = this.target().resourceTreeModel.securityOrigins();
        for (var i = 0; i < securityOrigins.length; ++i)
            this._addOrigin(securityOrigins[i]);
        this._enabled = true;
    },

    refreshCacheNames: function()
    {
        var securityOrigins = this.target().resourceTreeModel.securityOrigins();
        for (var securityOrigin of securityOrigins)
            this._loadCacheNames(securityOrigin);
    },

    /**
     * @param {!WebInspector.ServiceWorkerCacheModel.Cache} cache
     */
    deleteCache: function(cache)
    {
        /**
         * @this {WebInspector.ServiceWorkerCacheModel}
         */
        function callback(error)
        {
            if (error) {
                console.error("ServiceWorkerCacheAgent error deleting cache ", cache.toString(), ": ", error);
                return;
            }
            this._caches.delete(cache.cacheId);
            this._cacheRemoved(cache);
        }
        this._agent.deleteCache(cache.cacheId, callback.bind(this));
    },

    /**
     * @param {!WebInspector.ServiceWorkerCacheModel.Cache} cache
     * @param {string} request
     * @param {function()} callback
     */
    deleteCacheEntry: function(cache, request, callback)
    {

        /**
         * @param {?Protocol.Error} error
         */
        function myCallback(error)
        {
            if (error) {
                WebInspector.console.error(WebInspector.UIString("ServiceWorkerCacheAgent error deleting cache entry %s in cache: %s", cache.toString(), error));
                return;
            }
            callback();
        }
        this._agent.deleteEntry(cache.cacheId, request, myCallback);
    },

    /**
     * @param {!WebInspector.ServiceWorkerCacheModel.Cache} cache
     * @param {number} skipCount
     * @param {number} pageSize
     * @param {function(!Array.<!WebInspector.ServiceWorkerCacheModel.Entry>, boolean)} callback
     */
    loadCacheData: function(cache, skipCount, pageSize, callback)
    {
        this._requestEntries(cache, skipCount, pageSize, callback);
    },

    /**
     * @return {!Array.<!WebInspector.ServiceWorkerCacheModel.Cache>}
     */
    caches: function()
    {
        var caches = new Array();
        for (var cache of this._caches.values())
            caches.push(cache);
        return caches;
    },

    dispose: function()
    {
        for (var cache of this._caches.values())
            this._cacheRemoved(cache);
        this._caches.clear();
        if (this._enabled) {
            this.target().resourceTreeModel.removeEventListener(WebInspector.ResourceTreeModel.EventTypes.SecurityOriginAdded, this._securityOriginAdded, this);
            this.target().resourceTreeModel.removeEventListener(WebInspector.ResourceTreeModel.EventTypes.SecurityOriginRemoved, this._securityOriginRemoved, this);
        }
    },

    _addOrigin: function(securityOrigin)
    {
        this._loadCacheNames(securityOrigin);
    },

    /**
     * @param {string} securityOrigin
     */
    _removeOrigin: function(securityOrigin)
    {
        for (var opaqueId of this._caches.keys()) {
            var cache = this._caches.get(opaqueId);
            if (cache.securityOrigin == securityOrigin) {
                this._caches.delete(opaqueId);
                this._cacheRemoved(cache);
            }
        }
    },

    /**
     * @param {string} securityOrigin
     */
    _loadCacheNames: function(securityOrigin)
    {
        /**
         * @param {?Protocol.Error} error
         * @param {!Array.<!WebInspector.ServiceWorkerCacheModel.Cache>} caches
         * @this {WebInspector.ServiceWorkerCacheModel}
         */
        function callback(error, caches)
        {
            if (error) {
                console.error("ServiceWorkerCacheAgent error while loading caches: ", error);
                return;
            }
            this._updateCacheNames(securityOrigin, caches);
        }
        this._agent.requestCacheNames(securityOrigin, callback.bind(this));
    },

    /**
     * @param {string} securityOrigin
     * @param {!Array} cachesJson
     */
    _updateCacheNames: function(securityOrigin, cachesJson)
    {
        /**
         * @param {!WebInspector.ServiceWorkerCacheModel.Cache} cache
         * @this {WebInspector.ServiceWorkerCacheModel}
         */
        function deleteAndSaveOldCaches(cache)
        {
            if (cache.securityOrigin == securityOrigin && !updatingCachesIds.has(cache.cacheId)) {
                oldCaches.set(cache.cacheId, cache);
                this._caches.delete(cache.cacheId);
            }
        }

        /** @type {!Set<string>} */
        var updatingCachesIds = new Set();
        /** @type {!Map<string, !WebInspector.ServiceWorkerCacheModel.Cache>} */
        var newCaches = new Map();
        /** @type {!Map<string, !WebInspector.ServiceWorkerCacheModel.Cache>} */
        var oldCaches = new Map();

        for (var cacheJson of cachesJson) {
            var cache = new WebInspector.ServiceWorkerCacheModel.Cache(cacheJson.securityOrigin, cacheJson.cacheName, cacheJson.cacheId);
            updatingCachesIds.add(cache.cacheId);
            if (this._caches.has(cache.cacheId))
                continue;
            newCaches.set(cache.cacheId, cache);
            this._caches.set(cache.cacheId, cache);
        }
        this._caches.forEach(deleteAndSaveOldCaches, this);
        newCaches.forEach(this._cacheAdded, this);
        oldCaches.forEach(this._cacheRemoved, this);
    },

    /**
     * @param {!WebInspector.Event} event
     */
    _securityOriginAdded: function(event)
    {
        var securityOrigin = /** @type {string} */ (event.data);
        this._addOrigin(securityOrigin);
    },

    /**
     * @param {!WebInspector.Event} event
     */
    _securityOriginRemoved: function(event)
    {
        var securityOrigin = /** @type {string} */ (event.data);
        this._removeOrigin(securityOrigin);
    },

    /**
     * @param {!WebInspector.ServiceWorkerCacheModel.Cache} cache
     */
    _cacheAdded: function(cache)
    {
        this.dispatchEventToListeners(WebInspector.ServiceWorkerCacheModel.EventTypes.CacheAdded, cache);
    },

    /**
     * @param {!WebInspector.ServiceWorkerCacheModel.Cache} cache
     */
    _cacheRemoved: function(cache)
    {
        this.dispatchEventToListeners(WebInspector.ServiceWorkerCacheModel.EventTypes.CacheRemoved, cache);
    },

    /**
     * @param {!WebInspector.ServiceWorkerCacheModel.Cache} cache
     * @param {number} skipCount
     * @param {number} pageSize
     * @param {function(!Array.<!WebInspector.ServiceWorkerCacheModel.Entry>, boolean)} callback
     */
    _requestEntries: function(cache, skipCount, pageSize, callback)
    {
        /**
         * @param {?Protocol.Error} error
         * @param {!Array.<!WebInspector.ServiceWorkerCacheModel.Entry>} dataEntries
         * @param {boolean} hasMore
         */
        function innerCallback(error, dataEntries, hasMore)
        {
            if (error) {
                console.error("ServiceWorkerCacheAgent error while requesting entries: ", error);
                return;
            }
            var entries = [];
            for (var i = 0; i < dataEntries.length; ++i) {
                entries.push(new WebInspector.ServiceWorkerCacheModel.Entry(dataEntries[i].request, dataEntries[i].response));
            }
            callback(entries, hasMore);
        }
        this._agent.requestEntries(cache.cacheId, skipCount, pageSize, innerCallback);
    },

    __proto__: WebInspector.SDKModel.prototype
}

/**
 * @constructor
 * @param {string} request
 * @param {string} response
 */
WebInspector.ServiceWorkerCacheModel.Entry = function(request, response)
{
    this.request = request;
    this.response = response;
}

/**
 * @constructor
 * @param {string} securityOrigin
 * @param {string} cacheName
 * @param {string} cacheId
 */
WebInspector.ServiceWorkerCacheModel.Cache = function(securityOrigin, cacheName, cacheId)
{
    this.securityOrigin = securityOrigin;
    this.cacheName = cacheName;
    this.cacheId = cacheId;
}

WebInspector.ServiceWorkerCacheModel.Cache.prototype = {
    /**
     * @param {!WebInspector.ServiceWorkerCacheModel.Cache} cache
     * @return {boolean}
     */
    equals: function(cache)
    {
        return this.cacheId == cache.cacheId;
    },

    /**
     * @override
     * @return {string}
     */
    toString: function()
    {
        return this.securityOrigin + this.cacheName;
    }
}


WebInspector.ServiceWorkerCacheModel._symbol = Symbol("CacheStorageModel");
/**
 * @param {!WebInspector.Target} target
 * @return {!WebInspector.ServiceWorkerCacheModel}
 */
WebInspector.ServiceWorkerCacheModel.fromTarget = function(target)
{
    if (!target[WebInspector.ServiceWorkerCacheModel._symbol])
        target[WebInspector.ServiceWorkerCacheModel._symbol] = new WebInspector.ServiceWorkerCacheModel(target);

    return target[WebInspector.ServiceWorkerCacheModel._symbol];
}