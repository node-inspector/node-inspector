/*
 * Copyright (C) 2012 Google Inc. All rights reserved.
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
 * @extends {WebInspector.SDKModel}
 * @param {!WebInspector.Target} target
 */
WebInspector.RuntimeModel = function(target)
{
    WebInspector.SDKModel.call(this, WebInspector.RuntimeModel, target);

    this._agent = target.runtimeAgent();
    this.target().registerRuntimeDispatcher(new WebInspector.RuntimeDispatcher(this));
    if (target.hasJSContext())
        this._agent.enable();
    /**
     * @type {!Object.<number, !WebInspector.ExecutionContext>}
     */
    this._executionContextById = {};

    if (WebInspector.moduleSetting("customFormatters").get())
        this._agent.setCustomObjectFormatterEnabled(true);

    WebInspector.moduleSetting("customFormatters").addChangeListener(this._customFormattersStateChanged.bind(this));
}

WebInspector.RuntimeModel.Events = {
    ExecutionContextCreated: "ExecutionContextCreated",
    ExecutionContextDestroyed: "ExecutionContextDestroyed",
}

WebInspector.RuntimeModel._privateScript = "private script";

WebInspector.RuntimeModel.prototype = {

    /**
     * @return {!Array.<!WebInspector.ExecutionContext>}
     */
    executionContexts: function()
    {
        return Object.values(this._executionContextById);
    },

    /**
     * @param {!RuntimeAgent.ExecutionContextDescription} context
     */
    _executionContextCreated: function(context)
    {
        // The private script context should be hidden behind an experiment.
        if (context.name == WebInspector.RuntimeModel._privateScript && !context.origin && !Runtime.experiments.isEnabled("privateScriptInspection")) {
            return;
        }
        var executionContext = new WebInspector.ExecutionContext(this.target(), context.id, context.name, context.origin, !context.type, context.frameId);
        this._executionContextById[executionContext.id] = executionContext;
        this.dispatchEventToListeners(WebInspector.RuntimeModel.Events.ExecutionContextCreated, executionContext);
    },

    /**
     * @param {number} executionContextId
     */
    _executionContextDestroyed: function(executionContextId)
    {
        var executionContext = this._executionContextById[executionContextId];
        if (!executionContext)
            return;
        delete this._executionContextById[executionContextId];
        this.dispatchEventToListeners(WebInspector.RuntimeModel.Events.ExecutionContextDestroyed, executionContext);
    },

    _executionContextsCleared: function()
    {
        var contexts = this.executionContexts();
        this._executionContextById = {};
        for (var  i = 0; i < contexts.length; ++i)
            this.dispatchEventToListeners(WebInspector.RuntimeModel.Events.ExecutionContextDestroyed, contexts[i]);
    },

    /**
     * @param {!RuntimeAgent.RemoteObject} payload
     * @return {!WebInspector.RemoteObject}
     */
    createRemoteObject: function(payload)
    {
        console.assert(typeof payload === "object", "Remote object payload should only be an object");
        return new WebInspector.RemoteObjectImpl(this.target(), payload.objectId, payload.type, payload.subtype, payload.value, payload.description, payload.preview, payload.customPreview);
    },

    /**
     * @param {!RuntimeAgent.RemoteObject} payload
     * @param {!WebInspector.ScopeRef} scopeRef
     * @return {!WebInspector.RemoteObject}
     */
    createScopeRemoteObject: function(payload, scopeRef)
    {
        return new WebInspector.ScopeRemoteObject(this.target(), payload.objectId, scopeRef, payload.type, payload.subtype, payload.value, payload.description, payload.preview);
    },

    /**
     * @param {number|string|boolean} value
     * @return {!WebInspector.RemoteObject}
     */
    createRemoteObjectFromPrimitiveValue: function(value)
    {
        return new WebInspector.RemoteObjectImpl(this.target(), undefined, typeof value, undefined, value);
    },

    /**
     * @param {string} name
     * @param {number|string|boolean} value
     * @return {!WebInspector.RemoteObjectProperty}
     */
    createRemotePropertyFromPrimitiveValue: function(name, value)
    {
        return new WebInspector.RemoteObjectProperty(name, this.createRemoteObjectFromPrimitiveValue(value));
    },

    /**
     * @param {!WebInspector.Event} event
     */
    _customFormattersStateChanged: function(event)
    {
        var enabled = /** @type {boolean} */ (event.data);
        this._agent.setCustomObjectFormatterEnabled(enabled);
    },

    __proto__: WebInspector.SDKModel.prototype
}

/**
 * @constructor
 * @implements {RuntimeAgent.Dispatcher}
 * @param {!WebInspector.RuntimeModel} runtimeModel
 */
WebInspector.RuntimeDispatcher = function(runtimeModel)
{
    this._runtimeModel = runtimeModel;
}

WebInspector.RuntimeDispatcher.prototype = {
    /**
     * @override
     * @param {!RuntimeAgent.ExecutionContextDescription} context
     */
    executionContextCreated: function(context)
    {
        this._runtimeModel._executionContextCreated(context);
    },

    /**
     * @override
     * @param {!RuntimeAgent.ExecutionContextId} executionContextId
     */
    executionContextDestroyed: function(executionContextId)
    {
        this._runtimeModel._executionContextDestroyed(executionContextId);
    },

    /**
     * @override
     */
    executionContextsCleared: function()
    {
        this._runtimeModel._executionContextsCleared();
    }

}

/**
 * @constructor
 * @extends {WebInspector.SDKObject}
 * @param {!WebInspector.Target} target
 * @param {number|undefined} id
 * @param {string} name
 * @param {string} origin
 * @param {boolean} isPageContext
 * @param {string=} frameId
 */
WebInspector.ExecutionContext = function(target, id, name, origin, isPageContext, frameId)
{
    WebInspector.SDKObject.call(this, target);
    this.id = id;
    this.name = name;
    this.origin = origin;
    this.isMainWorldContext = isPageContext;
    this.runtimeModel = target.runtimeModel;
    this.debuggerModel = WebInspector.DebuggerModel.fromTarget(target);
    this.frameId = frameId;
}

/**
 * @param {!WebInspector.ExecutionContext} a
 * @param {!WebInspector.ExecutionContext} b
 * @return {number}
 */
WebInspector.ExecutionContext.comparator = function(a, b)
{
    /**
     * @param {!WebInspector.Target} target
     * @return {number}
     */
    function targetWeight(target)
    {
        if (target.isPage())
            return 3;
        if (target.isDedicatedWorker())
            return 2;
        return 1;
    }

    var weightDiff = targetWeight(a.target()) - targetWeight(b.target());
    if (weightDiff)
        return -weightDiff;

    var frameIdDiff = String.hashCode(a.frameId) - String.hashCode(b.frameId);
    if (frameIdDiff)
        return frameIdDiff;

    // Main world context should always go first.
    if (a.isMainWorldContext)
        return -1;
    if (b.isMainWorldContext)
        return +1;
    return a.name.localeCompare(b.name);
}

WebInspector.ExecutionContext.prototype = {
    /**
     * @param {string} expression
     * @param {string} objectGroup
     * @param {boolean} includeCommandLineAPI
     * @param {boolean} doNotPauseOnExceptionsAndMuteConsole
     * @param {boolean} returnByValue
     * @param {boolean} generatePreview
     * @param {function(?WebInspector.RemoteObject, boolean, ?RuntimeAgent.RemoteObject=, ?DebuggerAgent.ExceptionDetails=)} callback
     */
    evaluate: function(expression, objectGroup, includeCommandLineAPI, doNotPauseOnExceptionsAndMuteConsole, returnByValue, generatePreview, callback)
    {
        // FIXME: It will be moved to separate ExecutionContext.
        if (this.debuggerModel.selectedCallFrame()) {
            this.debuggerModel.evaluateOnSelectedCallFrame(expression, objectGroup, includeCommandLineAPI, doNotPauseOnExceptionsAndMuteConsole, returnByValue, generatePreview, callback);
            return;
        }
        this._evaluateGlobal.apply(this, arguments);
    },

    /**
     * @param {string} objectGroup
     * @param {boolean} returnByValue
     * @param {boolean} generatePreview
     * @param {function(?WebInspector.RemoteObject, boolean, ?RuntimeAgent.RemoteObject=, ?DebuggerAgent.ExceptionDetails=)} callback
     */
    globalObject: function(objectGroup, returnByValue, generatePreview, callback)
    {
        this._evaluateGlobal("this", objectGroup, false, true, returnByValue, generatePreview, callback);
    },

    /**
     * @param {string} expression
     * @param {string} objectGroup
     * @param {boolean} includeCommandLineAPI
     * @param {boolean} doNotPauseOnExceptionsAndMuteConsole
     * @param {boolean} returnByValue
     * @param {boolean} generatePreview
     * @param {function(?WebInspector.RemoteObject, boolean, ?RuntimeAgent.RemoteObject=, ?DebuggerAgent.ExceptionDetails=)} callback
     */
    _evaluateGlobal: function(expression, objectGroup, includeCommandLineAPI, doNotPauseOnExceptionsAndMuteConsole, returnByValue, generatePreview, callback)
    {
        if (!expression) {
            // There is no expression, so the completion should happen against global properties.
            expression = "this";
        }

        /**
         * @this {WebInspector.ExecutionContext}
         * @param {?Protocol.Error} error
         * @param {!RuntimeAgent.RemoteObject} result
         * @param {boolean=} wasThrown
         * @param {?DebuggerAgent.ExceptionDetails=} exceptionDetails
         */
        function evalCallback(error, result, wasThrown, exceptionDetails)
        {
            if (error) {
                callback(null, false);
                return;
            }

            if (returnByValue)
                callback(null, !!wasThrown, wasThrown ? null : result, exceptionDetails);
            else
                callback(this.runtimeModel.createRemoteObject(result), !!wasThrown, undefined, exceptionDetails);
        }
        this.target().runtimeAgent().evaluate(expression, objectGroup, includeCommandLineAPI, doNotPauseOnExceptionsAndMuteConsole, this.id, returnByValue, generatePreview, evalCallback.bind(this));
    },

    /**
     * @param {string} expressionString
     * @param {string} prefix
     * @param {boolean} force
     * @param {function(!Array.<string>, number=)} completionsReadyCallback
     */
    completionsForExpression: function(expressionString, prefix, force, completionsReadyCallback)
    {
        var lastIndex = expressionString.length - 1;

        var dotNotation = (expressionString[lastIndex] === ".");
        var bracketNotation = (expressionString[lastIndex] === "[");

        if (dotNotation || bracketNotation)
            expressionString = expressionString.substr(0, lastIndex);

        if (expressionString && parseInt(expressionString, 10) == expressionString) {
            // User is entering float value, do not suggest anything.
            completionsReadyCallback([]);
            return;
        }

        if (!prefix && !expressionString && !force) {
            completionsReadyCallback([]);
            return;
        }

        if (!expressionString && this.debuggerModel.selectedCallFrame())
            this.debuggerModel.selectedCallFrame().variableNames(receivedPropertyNames.bind(this));
        else
            this.evaluate(expressionString, "completion", true, true, false, false, evaluated.bind(this));

        /**
         * @this {WebInspector.ExecutionContext}
         */
        function evaluated(result, wasThrown)
        {
            if (!result || wasThrown) {
                completionsReadyCallback([]);
                return;
            }

            /**
             * @param {string=} type
             * @suppressReceiverCheck
             * @this {WebInspector.ExecutionContext}
             */
            function getCompletions(type)
            {
                var object;
                if (type === "string")
                    object = new String("");
                else if (type === "number")
                    object = new Number(0);
                else if (type === "boolean")
                    object = new Boolean(false);
                else
                    object = this;

                var resultSet = {};
                for (var o = object; o; o = o.__proto__) {
                    try {
                        if (type === "array" && o === object && ArrayBuffer.isView(o) && o.length > 9999)
                            continue;
                        var names = Object.getOwnPropertyNames(o);
                        for (var i = 0; i < names.length; ++i)
                            resultSet[names[i]] = true;
                    } catch (e) {
                    }
                }
                return resultSet;
            }

            if (result.type === "object" || result.type === "function")
                result.callFunctionJSON(getCompletions, [WebInspector.RemoteObject.toCallArgument(result.subtype)], receivedPropertyNames.bind(this));
            else if (result.type === "string" || result.type === "number" || result.type === "boolean")
                this.evaluate("(" + getCompletions + ")(\"" + result.type + "\")", "completion", false, true, true, false, receivedPropertyNamesFromEval.bind(this));
        }

        /**
         * @param {?WebInspector.RemoteObject} notRelevant
         * @param {boolean} wasThrown
         * @param {?RuntimeAgent.RemoteObject=} result
         * @this {WebInspector.ExecutionContext}
         */
        function receivedPropertyNamesFromEval(notRelevant, wasThrown, result)
        {
            if (result && !wasThrown)
                receivedPropertyNames.call(this, result.value);
            else
                completionsReadyCallback([]);
        }

        /**
         * @this {WebInspector.ExecutionContext}
         */
        function receivedPropertyNames(propertyNames)
        {
            this.target().runtimeAgent().releaseObjectGroup("completion");
            if (!propertyNames) {
                completionsReadyCallback([]);
                return;
            }
            var includeCommandLineAPI = (!dotNotation && !bracketNotation);
            if (includeCommandLineAPI) {
                const commandLineAPI = ["dir", "dirxml", "keys", "values", "profile", "profileEnd", "monitorEvents", "unmonitorEvents", "inspect", "copy", "clear",
                    "getEventListeners", "debug", "undebug", "monitor", "unmonitor", "table", "$", "$$", "$x"];
                for (var i = 0; i < commandLineAPI.length; ++i)
                    propertyNames[commandLineAPI[i]] = true;
            }
            this._reportCompletions(completionsReadyCallback, dotNotation, bracketNotation, expressionString, prefix, Object.keys(propertyNames));
        }
    },

    /**
     * @param {function(!Array.<string>, number=)} completionsReadyCallback
     * @param {boolean} dotNotation
     * @param {boolean} bracketNotation
     * @param {string} expressionString
     * @param {string} prefix
     * @param {!Array.<string>} properties
     */
    _reportCompletions: function(completionsReadyCallback, dotNotation, bracketNotation, expressionString, prefix, properties) {
        if (bracketNotation) {
            if (prefix.length && prefix[0] === "'")
                var quoteUsed = "'";
            else
                var quoteUsed = "\"";
        }

        var results = [];

        if (!expressionString) {
            const keywords = ["break", "case", "catch", "continue", "default", "delete", "do", "else", "finally", "for", "function", "if", "in",
                              "instanceof", "new", "return", "switch", "this", "throw", "try", "typeof", "var", "void", "while", "with"];
            properties = properties.concat(keywords);
        }

        properties.sort();

        for (var i = 0; i < properties.length; ++i) {
            var property = properties[i];

            // Assume that all non-ASCII characters are letters and thus can be used as part of identifier.
            if (dotNotation && !/^[a-zA-Z_$\u008F-\uFFFF][a-zA-Z0-9_$\u008F-\uFFFF]*$/.test(property))
                continue;

            if (bracketNotation) {
                if (!/^[0-9]+$/.test(property))
                    property = quoteUsed + property.escapeCharacters(quoteUsed + "\\") + quoteUsed;
                property += "]";
            }

            if (property.length < prefix.length)
                continue;
            if (prefix.length && !property.startsWith(prefix))
                continue;

            // Substitute actual newlines with newline characters. @see crbug.com/498421
            results.push(property.split("\n").join("\\n"));
        }
        completionsReadyCallback(results);
    },

    __proto__: WebInspector.SDKObject.prototype
}

/**
 * @constructor
 * @extends {WebInspector.SDKObject}
 * @param {!WebInspector.Target} target
 * @param {string} type
 * @param {boolean} useCapture
 * @param {?WebInspector.RemoteObject} handler
 * @param {?WebInspector.RemoteObject} originalHandler
 * @param {!WebInspector.DebuggerModel.Location} location
 * @param {?WebInspector.RemoteObject} removeFunction
 * @param {string=} listenerType
 */
WebInspector.EventListener = function(target, type, useCapture, handler, originalHandler, location, removeFunction, listenerType)
{
    WebInspector.SDKObject.call(this, target);
    this._type = type;
    this._useCapture = useCapture;
    this._handler = handler;
    this._originalHandler = originalHandler || handler;
    this._location = location;
    this._sourceURL = location.script().contentURL();
    this._removeFunction = removeFunction;
    this._listenerType = listenerType || "normal";
}

WebInspector.EventListener.prototype = {
    /**
     * @return {string}
     */
    type: function()
    {
        return this._type;
    },

    /**
     * @return {boolean}
     */
    useCapture: function()
    {
        return this._useCapture;
    },

    /**
     * @return {?WebInspector.RemoteObject}
     */
    handler: function()
    {
        return this._handler;
    },

    /**
     * @return {!WebInspector.DebuggerModel.Location}
     */
    location: function()
    {
        return this._location;
    },

    /**
     * @return {string}
     */
    sourceURL: function()
    {
        return this._sourceURL;
    },

    /**
     * @return {?WebInspector.RemoteObject}
     */
    originalHandler: function()
    {
        return this._originalHandler;
    },

    /**
     * @return {?WebInspector.RemoteObject}
     */
    removeFunction: function()
    {
        return this._removeFunction;
    },

    /**
     * @return {!Promise<undefined>}
     */
    remove: function()
    {
        if (!this._removeFunction)
            return Promise.resolve();
        return new Promise(promiseConstructor.bind(this));

        /**
         * @param {function()} success
         * @this {WebInspector.EventListener}
         */
        function promiseConstructor(success)
        {
            this._removeFunction.callFunction(callCustomRemove, [
                WebInspector.RemoteObject.toCallArgument(this._removeFunction),
                WebInspector.RemoteObject.toCallArgument(this._type),
                WebInspector.RemoteObject.toCallArgument(this._originalHandler),
                WebInspector.RemoteObject.toCallArgument(this._useCapture)
            ], success);

            /**
             * @param {function(string, function(), boolean)} func
             * @param {string} type
             * @param {function()} listener
             * @param {boolean} useCapture
             */
            function callCustomRemove(func, type, listener, useCapture)
            {
                func.call(null, type, listener, useCapture);
            }
        }
    },

    /**
     * @return {string}
     */
    listenerType: function()
    {
        return this._listenerType;
    },

    /**
     * @param {string} listenerType
     */
    setListenerType: function(listenerType)
    {
        this._listenerType = listenerType;
    },

    __proto__: WebInspector.SDKObject.prototype
}
