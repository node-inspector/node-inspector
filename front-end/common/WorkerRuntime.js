/*
 * Copyright (C) 2014 Google Inc. All rights reserved.
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

var WorkerRuntime = {};

/**
 * @param {string} moduleName
 * @param {string} workerName
 * @return {!Promise.<!SharedWorker>}
 */
WorkerRuntime.startSharedWorker = function(moduleName, workerName)
{
    if (Runtime.isReleaseMode()) {
        try {
            var worker = new SharedWorker(moduleName + "_module.js", workerName);
            return Promise.resolve(worker);
        } catch (e) {
            return Promise.reject(e);
        }
    }

    return loadResourcePromise(moduleName + "/module.json").then(start, start.bind(null, undefined));

    /**
     * @param {string=} content
     * @return {!SharedWorker}
     */
    function start(content)
    {
        if (!content)
            throw new Error("Worker is not defined: " + moduleName + " " + new Error().stack);
        var scripts = JSON.parse(content)["scripts"];
        if (scripts.length !== 1)
            throw new Error("WorkerRuntime.startSharedWorker supports modules with only one script!");
        return new SharedWorker(moduleName + "/" + scripts[0], workerName);
    }
}

/**
 * @param {string} moduleName
 * @return {!Promise.<!Worker>}
 */
WorkerRuntime.startWorker = function(moduleName)
{
    if (Runtime.isReleaseMode())
        return Promise.resolve(new Worker(moduleName + "_module.js"));

    /**
     * @suppress {checkTypes}
     */
    var loader = function() {
        self.onmessage = function(event) {
            self.onmessage = null;
            var scripts = event.data;
            for (var i = 0; i < scripts.length; ++i) {
                var source = scripts[i]["source"];
                self.eval(source + "\n//# sourceURL=" + scripts[i]["url"]);
            }
        };
    };

    return loadResourcePromise(moduleName + "/module.json").then(start, start.bind(null, undefined));

    /**
     * @param {string=} content
     */
    function start(content)
    {
        if (!content)
            throw new Error("Worker is not defined: " + moduleName + " " + new Error().stack);
        var message = [];
        var scripts = JSON.parse(content)["scripts"];
        var promise = Promise.resolve();
        for (var i = 0; i < scripts.length; ++i) {
            var url = self._importScriptPathPrefix + moduleName + "/" + scripts[i];
            var parts = url.split("://");
            url = parts.length === 1 ? url : parts[0] + "://" + normalizePath(parts[1]);
            promise = promise.then(promiseGetter(loadResourcePromise(moduleName + "/" + scripts[i]))).then(pushSource.bind(null, url), pushSource.bind(null, null, null));
        }

        return promise.then(createWorker);

        function promiseGetter(promise)
        {
            return function() {
                return promise;
            };
        }

        /**
         * @param {?string} url
         * @param {?string} source
         */
        function pushSource(url, source)
        {
            if (!url) {
                console.error("Failed to load " + url);
                return;
            }
            message.push({ source: source, url: url });
        }

        /**
         * @return {!Worker}
         */
        function createWorker()
        {
            var blob = new Blob(["(" + loader.toString() + ")()\n//# sourceURL=" + moduleName], { type: "text/javascript" });
            var workerURL = window.URL.createObjectURL(blob);
            try {
                var worker = new Worker(workerURL);
                worker.postMessage(message);
                return worker;
            } finally {
                window.URL.revokeObjectURL(workerURL);
            }
        }
    }
}

/**
 * @constructor
 * @param {string} moduleName
 * @param {string=} workerName
 */
WorkerRuntime.Worker = function(moduleName, workerName)
{
    this._workerPromise = workerName ? WorkerRuntime.startSharedWorker(moduleName, /** @type {string} */ (workerName)) : WorkerRuntime.startWorker(moduleName);
}

WorkerRuntime.Worker.prototype = {
    /**
     * @param {*} message
     */
    postMessage: function(message)
    {
        this._workerPromise.then(postToWorker.bind(this));

        /**
         * @param {!Worker|!SharedWorker} worker
         * @this {WorkerRuntime.Worker}
         */
        function postToWorker(worker)
        {
            if (!this._disposed)
                worker.postMessage(message);
        }
    },

    dispose: function()
    {
        this._disposed = true;
        this._workerPromise.then(terminate);

        /**
         * @param {!Worker|!SharedWorker} worker
         */
        function terminate(worker)
        {
            worker.terminate();
        }
    },

    terminate: function()
    {
        this.dispose();
    },

    /**
     * @param {?function(!MessageEvent.<*>)} listener
     */
    set onmessage(listener)
    {
        this._workerPromise.then(setOnMessage);

        /**
         * @param {!Worker|!SharedWorker} worker
         */
        function setOnMessage(worker)
        {
            worker.onmessage = listener;
        }
    },

    /**
     * @param {?function(!Event)} listener
     */
    set onerror(listener)
    {
        this._workerPromise.then(setOnError);

        /**
         * @param {!Worker|!SharedWorker} worker
         */
        function setOnError(worker)
        {
            worker.onerror = listener;
        }
    },

    get port()
    {
        return new WorkerRuntime.Worker.FuturePort(this);
    }
}

/**
 * @constructor
 * @param {!WorkerRuntime.Worker} worker
 */
WorkerRuntime.Worker.FuturePort = function(worker)
{
    this._worker = worker;
}

WorkerRuntime.Worker.FuturePort.prototype = {
    /**
     * @param {?function(!MessageEvent.<?>)} listener
     */
    set onmessage(listener)
    {
        this._worker._workerPromise.then(setOnMessage);

        /**
         * @param {!SharedWorker} worker
         */
        function setOnMessage(worker)
        {
            worker.port.onmessage = listener;
        }
    },

    /**
     * @param {?function(!Event)} listener
     */
    set onerror(listener)
    {
        this._worker._workerPromise.then(setOnError);

        /**
         * @param {!SharedWorker} worker
         */
        function setOnError(worker)
        {
            worker.port.onerror = listener;
        }
    }
}
