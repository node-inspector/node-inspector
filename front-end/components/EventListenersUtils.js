// Copyright 2015 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

/** @typedef {{eventListeners:!Array<!WebInspector.EventListener>, internalHandlers:?WebInspector.RemoteArray}} */
WebInspector.FrameworkEventListenersObject;

/** @typedef {{type: string, useCapture: boolean, handler: function()}} */
WebInspector.EventListenerObjectInInspectedPage;

/**
 * @param {!WebInspector.RemoteObject} object
 * @return {!Promise<!WebInspector.FrameworkEventListenersObject>}
 */
WebInspector.EventListener.frameworkEventListeners = function(object)
{
    var listenersResult = /** @type {!WebInspector.FrameworkEventListenersObject} */({eventListeners: []});
    return object.callFunctionPromise(frameworkEventListeners, undefined)
                 .then(assertCallFunctionResult)
                 .then(getOwnProperties)
                 .then(createEventListeners)
                 .then(returnResult)
                 .catchException(listenersResult);

    /**
     * @param {!WebInspector.RemoteObject} object
     * @return {!Promise<!{properties: ?Array.<!WebInspector.RemoteObjectProperty>, internalProperties: ?Array.<!WebInspector.RemoteObjectProperty>}>}
     */
    function getOwnProperties(object)
    {
        return object.getOwnPropertiesPromise();
    }

    /**
     * @param {!{properties: ?Array<!WebInspector.RemoteObjectProperty>, internalProperties: ?Array<!WebInspector.RemoteObjectProperty>}} result
     * @return {!Promise<undefined>}
     */
    function createEventListeners(result)
    {
        if (!result.properties)
            throw new Error("Object properties is empty");
        var promises = [];
        for (var property of result.properties) {
            if (property.name === "eventListeners" && property.value)
                promises.push(convertToEventListeners(property.value).then(storeEventListeners));
            if (property.name === "internalHandlers" && property.value)
                promises.push(convertToInternalHandlers(property.value).then(storeInternalHandlers));
            if (property.name === "errorString" && property.value)
                printErrorString(property.value);
        }
        return /** @type {!Promise<undefined>} */(Promise.all(promises));
    }

    /**
     * @param {!WebInspector.RemoteObject} pageEventListenersObject
     * @return {!Promise<!Array<!WebInspector.EventListener>>}
     */
    function convertToEventListeners(pageEventListenersObject)
    {
        return WebInspector.RemoteArray.objectAsArray(pageEventListenersObject).map(toEventListener).then(filterOutEmptyObjects);

        /**
         * @param {!WebInspector.RemoteObject} listenerObject
         * @return {!Promise<?WebInspector.EventListener>}
         */
        function toEventListener(listenerObject)
        {
            /** @type {string} */
            var type;
            /** @type {boolean} */
            var useCapture;
            /** @type {?WebInspector.RemoteObject} */
            var handler = null;
            /** @type {?WebInspector.RemoteObject} */
            var originalHandler = null;
            /** @type {?WebInspector.DebuggerModel.Location} */
            var location = null;
            /** @type {?WebInspector.RemoteObject} */
            var removeFunctionObject = null;

            var promises = [];
            promises.push(listenerObject.callFunctionJSONPromise(truncatePageEventListener, undefined).then(storeTruncatedListener));

            /**
             * @suppressReceiverCheck
             * @this {WebInspector.EventListenerObjectInInspectedPage}
             * @return {!{type:string, useCapture:boolean}}
             */
            function truncatePageEventListener()
            {
                return {type: this.type, useCapture: this.useCapture};
            }

            /**
             * @param {!{type:string, useCapture: boolean}} truncatedListener
             */
            function storeTruncatedListener(truncatedListener)
            {
                type = truncatedListener.type;
                useCapture = truncatedListener.useCapture;
            }

            promises.push(listenerObject.callFunctionPromise(handlerFunction).then(assertCallFunctionResult).then(storeOriginalHandler).then(toTargetFunction).then(storeFunctionWithDetails));

            /**
             * @suppressReceiverCheck
             * @return {function()}
             * @this {WebInspector.EventListenerObjectInInspectedPage}
             */
            function handlerFunction()
            {
                return this.handler;
            }

            /**
             * @param {!WebInspector.RemoteObject} functionObject
             * @return {!WebInspector.RemoteObject}
             */
            function storeOriginalHandler(functionObject)
            {
                originalHandler = functionObject;
                return originalHandler;
            }

            /**
             * @param {!WebInspector.RemoteObject} functionObject
             * @return {!Promise<undefined>}
             */
            function storeFunctionWithDetails(functionObject)
            {
                handler = functionObject;
                return /** @type {!Promise<undefined>} */(functionObject.functionDetailsPromise().then(storeFunctionDetails));
            }

            /**
             * @param {?WebInspector.DebuggerModel.FunctionDetails} functionDetails
             */
            function storeFunctionDetails(functionDetails)
            {
                location = functionDetails ? functionDetails.location : null;
            }

            promises.push(listenerObject.callFunctionPromise(getRemoveFunction).then(assertCallFunctionResult).then(storeRemoveFunction));

            /**
             * @suppressReceiverCheck
             * @return {function()}
             * @this {WebInspector.EventListenerObjectInInspectedPage}
             */
            function getRemoveFunction()
            {
                return this.remove;
            }

            /**
             * @param {!WebInspector.RemoteObject} functionObject
             */
            function storeRemoveFunction(functionObject)
            {
                if (functionObject.type !== "function")
                    return;
                removeFunctionObject = functionObject;
            }

            return Promise.all(promises).then(createEventListener).catchException(/** @type {?WebInspector.EventListener} */(null));

            /**
             * @return {!WebInspector.EventListener}
             */
            function createEventListener()
            {
                if (!location)
                    throw new Error("Empty event listener's location");
                return new WebInspector.EventListener(handler._target, type, useCapture, handler, originalHandler, location, removeFunctionObject, "frameworkUser");
            }
        }
    }

    /**
     * @param {!WebInspector.RemoteObject} pageInternalHandlersObject
     * @return {!Promise<!WebInspector.RemoteArray>}
     */
    function convertToInternalHandlers(pageInternalHandlersObject)
    {
        return WebInspector.RemoteArray.objectAsArray(pageInternalHandlersObject).map(toTargetFunction)
                                       .then(WebInspector.RemoteArray.createFromRemoteObjects);
    }

    /**
     * @param {!WebInspector.RemoteObject} functionObject
     * @return {!Promise<!WebInspector.RemoteObject>}
     */
    function toTargetFunction(functionObject)
    {
        return WebInspector.RemoteFunction.objectAsFunction(functionObject).targetFunction();
    }

    /**
     * @param {!Array<!WebInspector.EventListener>} eventListeners
     */
    function storeEventListeners(eventListeners)
    {
        listenersResult.eventListeners = eventListeners;
    }

    /**
     * @param {!WebInspector.RemoteArray} internalHandlers
     */
    function storeInternalHandlers(internalHandlers)
    {
        listenersResult.internalHandlers = internalHandlers;
    }

    /**
     * @param {!WebInspector.RemoteObject} errorString
     */
    function printErrorString(errorString)
    {
        WebInspector.console.error(errorString.value);
    }

    /**
     * @return {!WebInspector.FrameworkEventListenersObject}
     */
    function returnResult()
    {
        return listenersResult;
    }

    /**
     * @param {!WebInspector.CallFunctionResult} result
     * @return {!WebInspector.RemoteObject}
     */
    function assertCallFunctionResult(result)
    {
        if (result.wasThrown || !result.object)
            throw new Error("Exception in callFunction or empty result");
        return result.object;
    }

    /**
     * @param {!Array<?T>} objects
     * @return {!Array<!T>}
     * @template T
     */
    function filterOutEmptyObjects(objects)
    {
        return objects.filter(filterOutEmpty);

        /**
         * @param {?T} object
         * @return {boolean}
         * @template T
         */
        function filterOutEmpty(object)
        {
            return !!object;
        }
    }

    /*
    frameworkEventListeners fetcher functions should produce following output:
        {
          // framework event listeners
          "eventListeners": [
            {
              "handler": function(),
              "useCapture": true,
              "type": "change",
              "remove": function(type, handler, useCapture)
            },
            ...
          ],
          // internal framework event handlers
          "internalHandlers": [
            function(),
            function(),
            ...
          ]
        }
    */
    /**
     * @suppressReceiverCheck
     * @return {!{eventListeners:!Array<!WebInspector.EventListenerObjectInInspectedPage>, internalHandlers:?Array<function()>}}
     * @this {Object}
     */
    function frameworkEventListeners()
    {
        var errorLines = [];
        var eventListeners = [];
        var internalHandlers = [];
        var fetchers = [jQueryFetcher];
        try {
            if (self.devtoolsFrameworkEventListeners && isArrayLike(self.devtoolsFrameworkEventListeners))
                fetchers = fetchers.concat(self.devtoolsFrameworkEventListeners);
        } catch (e) {
            errorLines.push("devtoolsFrameworkEventListeners call produced error: " + toString(e));
        }

        for (var i = 0; i < fetchers.length; ++i) {
            try {
                var fetcherResult = fetchers[i](this);
                if (fetcherResult.eventListeners && isArrayLike(fetcherResult.eventListeners)) {
                    eventListeners = eventListeners.concat(fetcherResult.eventListeners.map(checkEventListener).filter(nonEmptyObject));
                }
                if (fetcherResult.internalHandlers && isArrayLike(fetcherResult.internalHandlers))
                    internalHandlers = internalHandlers.concat(fetcherResult.internalHandlers.map(checkInternalHandler).filter(nonEmptyObject));
            } catch (e) {
                errorLines.push("fetcher call produced error: " + toString(e));
            }
        }
        var result = {eventListeners: eventListeners};
        if (internalHandlers.length)
            result.internalHandlers = internalHandlers;
        if (errorLines.length) {
            var errorString = "Framework Event Listeners API Errors:\n\t" + errorLines.join("\n\t");
            errorString = errorString.substr(0, errorString.length - 1);
            result.errorString = errorString;
        }
        return result;

        /**
         * @param {?Object} obj
         * @return {boolean}
         */
        function isArrayLike(obj)
        {
            if (!obj || typeof obj !== "object")
                return false;
            try {
                if (typeof obj.splice === "function") {
                    var len = obj.length;
                    return typeof len === "number" && (len >>> 0 === len && (len > 0 || 1 / len > 0));
                }
            } catch (e) {
            }
            return false;
        }

        /**
         * @param {*} eventListener
         * @return {?WebInspector.EventListenerObjectInInspectedPage}
         */
        function checkEventListener(eventListener)
        {
            try {
                var errorString = "";
                if (!eventListener)
                    errorString += "empty event listener, ";
                var type = eventListener.type;
                if (!type || (typeof type !== "string"))
                    errorString += "event listener's type isn't string or empty, ";
                var useCapture = eventListener.useCapture;
                if (typeof useCapture !== "boolean")
                    errorString += "event listener's useCapture isn't boolean or undefined, ";
                var handler = eventListener.handler;
                if (!handler || (typeof handler !== "function"))
                    errorString += "event listener's handler isn't a function or empty, ";
                var remove = eventListener.remove;
                if (remove && (typeof remove !== "function"))
                    errorString += "event listener's remove isn't a function, ";
                if (!errorString){
                    return {type: type, useCapture: useCapture, handler: handler, remove: remove};
                } else {
                    errorLines.push(errorString.substr(0, errorString.length - 2));
                    return null;
                }
            } catch (e) {
                errorLines.push(toString(e));
                return null;
            }
        }

        /**
         * @param {*} handler
         * @return {function()|null}
         */
        function checkInternalHandler(handler)
        {
            if (handler && (typeof handler === "function"))
                return handler;
            errorLines.push("internal handler isn't a function or empty");
            return null;
        }

        /**
         * @param {*} obj
         * @return {string}
         * @suppress {uselessCode}
         */
        function toString(obj)
        {
            try {
                return "" + obj;
            } catch (e) {
                return "<error>";
            }
        }

        /**
         * @param {*} obj
         * @return {boolean}
         */
        function nonEmptyObject(obj)
        {
            return !!obj;
        }

        function jQueryFetcher(node)
        {
            if (!node || !(node instanceof Node))
                return {eventListeners: []};
            var jQuery = /** @type {?{fn,data,_data}}*/(window["jQuery"]);
            if (!jQuery || !jQuery.fn)
                return {eventListeners: []};
            var jQueryFunction = /** @type {function(!Node)} */(jQuery);
            var data = jQuery._data || jQuery.data;

            var eventListeners = [];
            var internalHandlers = [];

            if (typeof data === "function") {
                var events = data(node, "events");
                for (var type in events) {
                    for (var key in events[type]) {
                        var frameworkListener = events[type][key];
                        if (typeof frameworkListener === "object" || typeof frameworkListener === "function") {
                            var listener = {
                                handler: frameworkListener.handler || frameworkListener,
                                useCapture: true,
                                type: type
                            };
                            listener.remove = jQueryRemove.bind(node, frameworkListener.selector);
                            eventListeners.push(listener);
                        }
                    }
                }
                var nodeData = data(node);
                if (nodeData && typeof nodeData.handle === "function")
                    internalHandlers.push(nodeData.handle);
            }
            var entry = jQueryFunction(node)[0];
            if (entry) {
                var entryEvents = entry["$events"];
                for (var type in entryEvents) {
                    var events = entryEvents[type];
                    for (var key in events) {
                        if (typeof events[key] === "function") {
                            var listener = {
                                handler: events[key],
                                useCapture: true,
                                type: type
                            };
                            // We don't support removing for old version < 1.4 of jQuery because it doesn't provide API for getting "selector".
                            eventListeners.push(listener);
                        }
                    }
                }
                if (entry && entry["$handle"])
                    internalHandlers.push(entry["$handle"]);
            }
            return {eventListeners: eventListeners, internalHandlers: internalHandlers};
        }

        /**
         * @param {string} selector
         * @param {string} type
         * @param {function()} handler
         * @this {?Object}
         */
        function jQueryRemove(selector, type, handler)
        {
            if (!this || !(this instanceof Node))
                return;
            var node = /** @type {!Node} */(this);
            var jQuery = /** @type {?{fn,data,_data}}*/(window["jQuery"]);
            if (!jQuery || !jQuery.fn)
                return;
            var jQueryFunction = /** @type {function(!Node)} */(jQuery);
            jQueryFunction(node).off(type, selector, handler);
        }
    }
}
