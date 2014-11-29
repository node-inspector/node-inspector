/*
 * Copyright (C) 2009 Google Inc. All rights reserved.
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
 * This may not be an interface due to "instanceof WebInspector.RemoteObject" checks in the code.
 *
 * @constructor
 */
WebInspector.RemoteObject = function() { }

WebInspector.RemoteObject.prototype = {
    /** @return {string} */
    get type()
    {
        throw "Not implemented";
    },

    /** @return {string|undefined} */
    get subtype()
    {
        throw "Not implemented";
    },

    /** @return {string|undefined} */
    get description()
    {
        throw "Not implemented";
    },

    /** @return {boolean} */
    get hasChildren()
    {
        throw "Not implemented";
    },

    /**
     * @return {number}
     */
    arrayLength: function()
    {
        throw "Not implemented";
    },

    /**
     * @param {function(?Array.<!WebInspector.RemoteObjectProperty>, ?Array.<!WebInspector.RemoteObjectProperty>)} callback
     */
    getOwnProperties: function(callback)
    {
        throw "Not implemented";
    },

    /**
     * @param {boolean} accessorPropertiesOnly
     * @param {function(?Array.<!WebInspector.RemoteObjectProperty>, ?Array.<!WebInspector.RemoteObjectProperty>)} callback
     */
    getAllProperties: function(accessorPropertiesOnly, callback)
    {
        throw "Not implemented";
    },

    /**
     * @param {!RuntimeAgent.CallArgument} name
     * @param {function(string=)} callback
     */
    deleteProperty: function(name, callback)
    {
        throw "Not implemented";
    },

    /**
     * @param {function(this:Object, ...)} functionDeclaration
     * @param {!Array.<!RuntimeAgent.CallArgument>=} args
     * @param {function(?WebInspector.RemoteObject, boolean=)=} callback
     */
    callFunction: function(functionDeclaration, args, callback)
    {
        throw "Not implemented";
    },

    /**
     * @param {function(this:Object)} functionDeclaration
     * @param {!Array.<!RuntimeAgent.CallArgument>|undefined} args
     * @param {function(*)} callback
     */
    callFunctionJSON: function(functionDeclaration, args, callback)
    {
        throw "Not implemented";
    },

    /**
     * @return {!WebInspector.Target}
     */
    target: function()
    {
        throw new Error("Target-less object");
    },

    /**
     * @return {boolean}
     */
    isNode: function()
    {
        return false;
    },

    /**
     * @param {function(?WebInspector.DebuggerModel.FunctionDetails)} callback
     */
    functionDetails: function(callback)
    {
        callback(null);
    },

    /**
     * @param {function(?Array.<!DebuggerAgent.CollectionEntry>)} callback
     */
    collectionEntries: function(callback)
    {
        callback(null);
    }
}

/**
 * @param {*} value
 * @return {!WebInspector.RemoteObject}
 */
WebInspector.RemoteObject.fromLocalObject = function(value)
{
    return new WebInspector.LocalJSONObject(value);
}

/**
 * @param {!WebInspector.RemoteObject} remoteObject
 * @return {string}
 */
WebInspector.RemoteObject.type = function(remoteObject)
{
    if (remoteObject === null)
        return "null";

    var type = typeof remoteObject;
    if (type !== "object" && type !== "function")
        return type;

    return remoteObject.type;
}

/**
 * @param {!RuntimeAgent.RemoteObject|!WebInspector.RemoteObject|number|string|boolean|undefined|null} object
 * @return {!RuntimeAgent.CallArgument}
 */
WebInspector.RemoteObject.toCallArgument = function(object)
{
    var type = typeof object;
    var value = object;
    var objectId = undefined;
    var description = String(object);

    if (type === "number" && value === 0 && 1 / value < 0)
        description = "-0";

    switch (type) {
    case "number":
    case "string":
    case "boolean":
    case "undefined":
        break;
    default:
        if (object) {
            type = object.type;
            value = object.value;
            objectId = object.objectId;
            description = object.description;
        }
        break;
    }

    // Handle special numbers: NaN, Infinity, -Infinity, -0.
    if (type === "number") {
        switch (description) {
        case "NaN":
        case "Infinity":
        case "-Infinity":
        case "-0":
            value = description;
            break;
        }
    }

    return {
        value: value,
        objectId: objectId,
        type: /** @type {!RuntimeAgent.CallArgumentType.<string>} */ (type)
    };
}

/**
 * @constructor
 * @extends {WebInspector.RemoteObject}
 * @param {!WebInspector.Target} target
 * @param {string|undefined} objectId
 * @param {string} type
 * @param {string|undefined} subtype
 * @param {*} value
 * @param {string=} description
 * @param {!RuntimeAgent.ObjectPreview=} preview
 */
WebInspector.RemoteObjectImpl = function(target, objectId, type, subtype, value, description, preview)
{
    WebInspector.RemoteObject.call(this);

    this._target = target;
    this._runtimeAgent = target.runtimeAgent();
    this._domModel = target.domModel;

    this._type = type;
    this._subtype = subtype;
    if (objectId) {
        // handle
        this._objectId = objectId;
        this._description = description;
        this._hasChildren = (type !== "symbol");
        this._preview = preview;
    } else {
        // Primitive or null object.
        console.assert(type !== "object" || value === null);
        this._description = description || (value + "");
        this._hasChildren = false;
        // Handle special numbers: NaN, Infinity, -Infinity, -0.
        if (type === "number" && typeof value !== "number")
            this.value = Number(value);
        else
            this.value = value;
    }
}

WebInspector.RemoteObjectImpl.prototype = {
    /** @return {!RuntimeAgent.RemoteObjectId} */
    get objectId()
    {
        return this._objectId;
    },

    /** @return {string} */
    get type()
    {
        return this._type;
    },

    /** @return {string|undefined} */
    get subtype()
    {
        return this._subtype;
    },

    /** @return {string|undefined} */
    get description()
    {
        return this._description;
    },

    /** @return {boolean} */
    get hasChildren()
    {
        return this._hasChildren;
    },

    /** @return {!RuntimeAgent.ObjectPreview|undefined} */
    get preview()
    {
        return this._preview;
    },

    /**
     * @param {function(?Array.<!WebInspector.RemoteObjectProperty>, ?Array.<!WebInspector.RemoteObjectProperty>)} callback
     */
    getOwnProperties: function(callback)
    {
        this.doGetProperties(true, false, callback);
    },

    /**
     * @param {boolean} accessorPropertiesOnly
     * @param {function(?Array.<!WebInspector.RemoteObjectProperty>, ?Array.<!WebInspector.RemoteObjectProperty>)} callback
     */
    getAllProperties: function(accessorPropertiesOnly, callback)
    {
        this.doGetProperties(false, accessorPropertiesOnly, callback);
    },

    /**
     * @param {!Array.<string>} propertyPath
     * @param {function(?WebInspector.RemoteObject, boolean=)} callback
     */
    getProperty: function(propertyPath, callback)
    {
        /**
         * @param {string} arrayStr
         * @suppressReceiverCheck
         * @this {Object}
         */
        function remoteFunction(arrayStr)
        {
            var result = this;
            var properties = JSON.parse(arrayStr);
            for (var i = 0, n = properties.length; i < n; ++i)
                result = result[properties[i]];
            return result;
        }

        var args = [{ value: JSON.stringify(propertyPath) }];
        this.callFunction(remoteFunction, args, callback);
    },

    /**
     * @param {boolean} ownProperties
     * @param {boolean} accessorPropertiesOnly
     * @param {function(?Array.<!WebInspector.RemoteObjectProperty>, ?Array.<!WebInspector.RemoteObjectProperty>)} callback
     */
    doGetProperties: function(ownProperties, accessorPropertiesOnly, callback)
    {
        if (!this._objectId) {
            callback(null, null);
            return;
        }

        /**
         * @param {?Protocol.Error} error
         * @param {!Array.<!RuntimeAgent.PropertyDescriptor>} properties
         * @param {!Array.<!RuntimeAgent.InternalPropertyDescriptor>=} internalProperties
         * @this {WebInspector.RemoteObjectImpl}
         */
        function remoteObjectBinder(error, properties, internalProperties)
        {
            if (error) {
                callback(null, null);
                return;
            }
            var result = [];
            for (var i = 0; properties && i < properties.length; ++i) {
                var property = properties[i];
                var propertyValue = property.value ? this._target.runtimeModel.createRemoteObject(property.value) : null;
                var propertySymbol = property.symbol ? this._target.runtimeModel.createRemoteObject(property.symbol) : null;
                var remoteProperty = new WebInspector.RemoteObjectProperty(property.name, propertyValue,
                        !!property.enumerable, !!property.writable, !!property.isOwn, !!property.wasThrown, propertySymbol);

                if (typeof property.value === "undefined") {
                    if (property.get && property.get.type !== "undefined")
                        remoteProperty.getter = this._target.runtimeModel.createRemoteObject(property.get);
                    if (property.set && property.set.type !== "undefined")
                        remoteProperty.setter = this._target.runtimeModel.createRemoteObject(property.set);
                }

                result.push(remoteProperty);
            }
            var internalPropertiesResult = null;
            if (internalProperties) {
                internalPropertiesResult = [];
                for (var i = 0; i < internalProperties.length; i++) {
                    var property = internalProperties[i];
                    if (!property.value)
                        continue;
                    var propertyValue = this._target.runtimeModel.createRemoteObject(property.value);
                    internalPropertiesResult.push(new WebInspector.RemoteObjectProperty(property.name, propertyValue, true, false));
                }
            }
            callback(result, internalPropertiesResult);
        }
        this._runtimeAgent.getProperties(this._objectId, ownProperties, accessorPropertiesOnly, remoteObjectBinder.bind(this));
    },

    /**
     * @param {string|!RuntimeAgent.CallArgument} name
     * @param {string} value
     * @param {function(string=)} callback
     */
    setPropertyValue: function(name, value, callback)
    {
        if (!this._objectId) {
            callback("Can't set a property of non-object.");
            return;
        }

        this._runtimeAgent.invoke_evaluate({expression:value, doNotPauseOnExceptionsAndMuteConsole:true}, evaluatedCallback.bind(this));

        /**
         * @param {?Protocol.Error} error
         * @param {!RuntimeAgent.RemoteObject} result
         * @param {boolean=} wasThrown
         * @this {WebInspector.RemoteObject}
         */
        function evaluatedCallback(error, result, wasThrown)
        {
            if (error || wasThrown) {
                callback(error || result.description);
                return;
            }

            if (typeof name === "string")
                name = WebInspector.RemoteObject.toCallArgument(name);

            this.doSetObjectPropertyValue(result, name, callback);

            if (result.objectId)
                this._runtimeAgent.releaseObject(result.objectId);
        }
    },

    /**
     * @param {!RuntimeAgent.RemoteObject} result
     * @param {!RuntimeAgent.CallArgument} name
     * @param {function(string=)} callback
     */
    doSetObjectPropertyValue: function(result, name, callback)
    {
        // This assignment may be for a regular (data) property, and for an accessor property (with getter/setter).
        // Note the sensitive matter about accessor property: the property may be physically defined in some proto object,
        // but logically it is bound to the object in question. JavaScript passes this object to getters/setters, not the object
        // where property was defined; so do we.
        var setPropertyValueFunction = "function(a, b) { this[a] = b; }";

        var argv = [name, WebInspector.RemoteObject.toCallArgument(result)];
        this._runtimeAgent.callFunctionOn(this._objectId, setPropertyValueFunction, argv, true, undefined, undefined, propertySetCallback);

        /**
         * @param {?Protocol.Error} error
         * @param {!RuntimeAgent.RemoteObject} result
         * @param {boolean=} wasThrown
         */
        function propertySetCallback(error, result, wasThrown)
        {
            if (error || wasThrown) {
                callback(error || result.description);
                return;
            }
            callback();
        }
    },

    /**
     * @param {!RuntimeAgent.CallArgument} name
     * @param {function(string=)} callback
     */
    deleteProperty: function(name, callback)
    {
        if (!this._objectId) {
            callback("Can't delete a property of non-object.");
            return;
        }

        var deletePropertyFunction = "function(a) { delete this[a]; return !(a in this); }";
        this._runtimeAgent.callFunctionOn(this._objectId, deletePropertyFunction, [name], true, undefined, undefined, deletePropertyCallback);

        /**
         * @param {?Protocol.Error} error
         * @param {!RuntimeAgent.RemoteObject} result
         * @param {boolean=} wasThrown
         */
        function deletePropertyCallback(error, result, wasThrown)
        {
            if (error || wasThrown) {
                callback(error || result.description);
                return;
            }
            if (!result.value)
                callback("Failed to delete property.");
            else
                callback();
        }
    },

    /**
     * @param {function(?WebInspector.DOMNode)} callback
     */
    pushNodeToFrontend: function(callback)
    {
        if (this.isNode())
            this._domModel.pushNodeToFrontend(this._objectId, callback);
        else
            callback(null);
    },

    highlightAsDOMNode: function()
    {
        this._domModel.highlightDOMNode(undefined, undefined, this._objectId);
    },

    hideDOMNodeHighlight: function()
    {
        this._domModel.hideDOMNodeHighlight();
    },

    /**
     * @param {function(this:Object, ...)} functionDeclaration
     * @param {!Array.<!RuntimeAgent.CallArgument>=} args
     * @param {function(?WebInspector.RemoteObject, boolean=)=} callback
     */
    callFunction: function(functionDeclaration, args, callback)
    {
        /**
         * @param {?Protocol.Error} error
         * @param {!RuntimeAgent.RemoteObject} result
         * @param {boolean=} wasThrown
         * @this {WebInspector.RemoteObjectImpl}
         */
        function mycallback(error, result, wasThrown)
        {
            if (!callback)
                return;
            if (error)
                callback(null, false);
            else
                callback(this.target().runtimeModel.createRemoteObject(result), wasThrown);
        }

        this._runtimeAgent.callFunctionOn(this._objectId, functionDeclaration.toString(), args, true, undefined, undefined, mycallback.bind(this));
    },

    /**
     * @param {function(this:Object)} functionDeclaration
     * @param {!Array.<!RuntimeAgent.CallArgument>|undefined} args
     * @param {function(*)} callback
     */
    callFunctionJSON: function(functionDeclaration, args, callback)
    {
        /**
         * @param {?Protocol.Error} error
         * @param {!RuntimeAgent.RemoteObject} result
         * @param {boolean=} wasThrown
         */
        function mycallback(error, result, wasThrown)
        {
            callback((error || wasThrown) ? null : result.value);
        }

        this._runtimeAgent.callFunctionOn(this._objectId, functionDeclaration.toString(), args, true, true, false, mycallback);
    },

    release: function()
    {
        if (!this._objectId)
            return;
        this._runtimeAgent.releaseObject(this._objectId);
    },

    /**
     * @return {number}
     */
    arrayLength: function()
    {
        if (this.subtype !== "array")
            return 0;

        var matches = this._description.match(/\[([0-9]+)\]/);
        if (!matches)
            return 0;
        return parseInt(matches[1], 10);
    },

    /**
     * @return {!WebInspector.Target}
     */
    target: function()
    {
        return this._target;
    },

    /**
     * @return {boolean}
     */
    isNode: function()
    {
        return !!this._objectId && this.type === "object" && this.subtype === "node";
    },

    /**
     * @param {function(?WebInspector.DebuggerModel.FunctionDetails)} callback
     */
    functionDetails: function(callback)
    {
        this._target.debuggerModel.functionDetails(this, callback)
    },

    /**
     * @param {function(?Array.<!DebuggerAgent.CollectionEntry>)} callback
     */
    collectionEntries: function(callback)
    {
        if (!this._objectId) {
            callback(null);
            return;
        }

        this._target.debuggerAgent().getCollectionEntries(this._objectId, didGetCollectionEntries);

        /**
         * @param {?Protocol.Error} error
         * @param {?Array.<!DebuggerAgent.CollectionEntry>} response
         */
        function didGetCollectionEntries(error, response)
        {
            if (error) {
                console.error(error);
                callback(null);
                return;
            }
            callback(response);
        }
    },

    __proto__: WebInspector.RemoteObject.prototype
};


/**
 * @param {!WebInspector.RemoteObject} object
 * @param {boolean} flattenProtoChain
 * @param {function(?Array.<!WebInspector.RemoteObjectProperty>, ?Array.<!WebInspector.RemoteObjectProperty>)} callback
 */
WebInspector.RemoteObject.loadFromObject = function(object, flattenProtoChain, callback)
{
    if (flattenProtoChain)
        object.getAllProperties(false, callback);
    else
        WebInspector.RemoteObject.loadFromObjectPerProto(object, callback);
};

/**
 * @param {!WebInspector.RemoteObject} object
 * @param {function(?Array.<!WebInspector.RemoteObjectProperty>, ?Array.<!WebInspector.RemoteObjectProperty>)} callback
 */
WebInspector.RemoteObject.loadFromObjectPerProto = function(object, callback)
{
    // Combines 2 asynch calls. Doesn't rely on call-back orders (some calls may be loop-back).
    var savedOwnProperties;
    var savedAccessorProperties;
    var savedInternalProperties;
    var resultCounter = 2;

    function processCallback()
    {
        if (--resultCounter)
            return;
        if (savedOwnProperties && savedAccessorProperties) {
            var combinedList = savedAccessorProperties.slice(0);
            for (var i = 0; i < savedOwnProperties.length; i++) {
                var property = savedOwnProperties[i];
                if (!property.isAccessorProperty())
                    combinedList.push(property);
            }
            return callback(combinedList, savedInternalProperties ? savedInternalProperties : null);
        } else {
            callback(null, null);
        }
    }

    /**
     * @param {?Array.<!WebInspector.RemoteObjectProperty>} properties
     * @param {?Array.<!WebInspector.RemoteObjectProperty>} internalProperties
     */
    function allAccessorPropertiesCallback(properties, internalProperties)
    {
        savedAccessorProperties = properties;
        processCallback();
    }

    /**
     * @param {?Array.<!WebInspector.RemoteObjectProperty>} properties
     * @param {?Array.<!WebInspector.RemoteObjectProperty>} internalProperties
     */
    function ownPropertiesCallback(properties, internalProperties)
    {
        savedOwnProperties = properties;
        savedInternalProperties = internalProperties;
        processCallback();
    }

    object.getAllProperties(true, allAccessorPropertiesCallback);
    object.getOwnProperties(ownPropertiesCallback);
};


/**
 * @constructor
 * @extends {WebInspector.RemoteObjectImpl}
 * @param {!WebInspector.Target} target
 * @param {string|undefined} objectId
 * @param {!WebInspector.ScopeRef} scopeRef
 * @param {string} type
 * @param {string|undefined} subtype
 * @param {*} value
 * @param {string=} description
 * @param {!RuntimeAgent.ObjectPreview=} preview
 */
WebInspector.ScopeRemoteObject = function(target, objectId, scopeRef, type, subtype, value, description, preview)
{
    WebInspector.RemoteObjectImpl.call(this, target, objectId, type, subtype, value, description, preview);
    this._scopeRef = scopeRef;
    this._savedScopeProperties = undefined;
    this._debuggerAgent = target.debuggerAgent();
};

WebInspector.ScopeRemoteObject.prototype = {
    /**
     * @override
     * @param {boolean} ownProperties
     * @param {boolean} accessorPropertiesOnly
     * @param {function(?Array.<!WebInspector.RemoteObjectProperty>, ?Array.<!WebInspector.RemoteObjectProperty>)} callback
     */
    doGetProperties: function(ownProperties, accessorPropertiesOnly, callback)
    {
        if (accessorPropertiesOnly) {
            callback([], []);
            return;
        }
        if (this._savedScopeProperties) {
            // No need to reload scope variables, as the remote object never
            // changes its properties. If variable is updated, the properties
            // array is patched locally.
            callback(this._savedScopeProperties.slice(), []);
            return;
        }

        /**
         * @param {?Array.<!WebInspector.RemoteObjectProperty>} properties
         * @param {?Array.<!WebInspector.RemoteObjectProperty>} internalProperties
         * @this {WebInspector.ScopeRemoteObject}
         */
        function wrappedCallback(properties, internalProperties)
        {
            if (this._scopeRef && properties instanceof Array)
                this._savedScopeProperties = properties.slice();
            callback(properties, internalProperties);
        }

        WebInspector.RemoteObjectImpl.prototype.doGetProperties.call(this, ownProperties, accessorPropertiesOnly, wrappedCallback.bind(this));
    },

    /**
     * @override
     * @param {!RuntimeAgent.RemoteObject} result
     * @param {!RuntimeAgent.CallArgument} name
     * @param {function(string=)} callback
     */
    doSetObjectPropertyValue: function(result, name, callback)
    {
        this._debuggerAgent.setVariableValue(this._scopeRef.number, /** @type {string} */ (name.value), WebInspector.RemoteObject.toCallArgument(result), this._scopeRef.callFrameId, this._scopeRef.functionId, setVariableValueCallback.bind(this));

        /**
         * @param {?Protocol.Error} error
         * @this {WebInspector.ScopeRemoteObject}
         */
        function setVariableValueCallback(error)
        {
            if (error) {
                callback(error);
                return;
            }
            if (this._savedScopeProperties) {
                for (var i = 0; i < this._savedScopeProperties.length; i++) {
                    if (this._savedScopeProperties[i].name === name)
                        this._savedScopeProperties[i].value = this._target.runtimeModel.createRemoteObject(result);
                }
            }
            callback();
        }
    },

    __proto__: WebInspector.RemoteObjectImpl.prototype
};

/**
 * Either callFrameId or functionId (exactly one) must be defined.
 * @constructor
 * @param {number} number
 * @param {string=} callFrameId
 * @param {string=} functionId
 */
WebInspector.ScopeRef = function(number, callFrameId, functionId)
{
    this.number = number;
    this.callFrameId = callFrameId;
    this.functionId = functionId;
}

/**
 * @constructor
 * @param {string} name
 * @param {?WebInspector.RemoteObject} value
 * @param {boolean=} enumerable
 * @param {boolean=} writable
 * @param {boolean=} isOwn
 * @param {boolean=} wasThrown
 * @param {?WebInspector.RemoteObject=} symbol
 */
WebInspector.RemoteObjectProperty = function(name, value, enumerable, writable, isOwn, wasThrown, symbol)
{
    this.name = name;
    if (value !== null)
        this.value = value;
    this.enumerable = typeof enumerable !== "undefined" ? enumerable : true;
    this.writable = typeof writable !== "undefined" ? writable : true;
    this.isOwn = !!isOwn;
    this.wasThrown = !!wasThrown;
    if (symbol)
        this.symbol = symbol;
}

WebInspector.RemoteObjectProperty.prototype = {
    /**
     * @return {boolean}
     */
    isAccessorProperty: function()
    {
        return !!(this.getter || this.setter);
    }
};

// Below is a wrapper around a local object that implements the RemoteObject interface,
// which can be used by the UI code (primarily ObjectPropertiesSection).
// Note that only JSON-compliant objects are currently supported, as there's no provision
// for traversing prototypes, extracting class names via constructor, handling properties
// or functions.

/**
 * @constructor
 * @extends {WebInspector.RemoteObject}
 * @param {*} value
 */
WebInspector.LocalJSONObject = function(value)
{
    WebInspector.RemoteObject.call(this);
    this._value = value;
}

WebInspector.LocalJSONObject.prototype = {
    /**
     * @return {string}
     */
    get description()
    {
        if (this._cachedDescription)
            return this._cachedDescription;

        /**
         * @param {!WebInspector.RemoteObjectProperty} property
         * @return {string}
         * @this {WebInspector.LocalJSONObject}
         */
        function formatArrayItem(property)
        {
            return this._formatValue(property.value);
        }

        /**
         * @param {!WebInspector.RemoteObjectProperty} property
         * @return {string}
         * @this {WebInspector.LocalJSONObject}
         */
        function formatObjectItem(property)
        {
            var name = property.name;
            if (/^\s|\s$|^$|\n/.test(name))
                name = "\"" + name.replace(/\n/g, "\u21B5") + "\"";
            return name + ": " + this._formatValue(property.value);
        }

        if (this.type === "object") {
            switch (this.subtype) {
            case "array":
                this._cachedDescription = this._concatenate("[", "]", formatArrayItem.bind(this));
                break;
            case "date":
                this._cachedDescription = "" + this._value;
                break;
            case "null":
                this._cachedDescription = "null";
                break;
            default:
                this._cachedDescription = this._concatenate("{", "}", formatObjectItem.bind(this));
            }
        } else {
            this._cachedDescription = String(this._value);
        }

        return this._cachedDescription;
    },

    /**
     * @param {?WebInspector.RemoteObject} value
     * @return {string}
     */
    _formatValue: function(value)
    {
        if (!value)
            return "undefined";
        var description = value.description || "";
        if (value.type === "string")
            return "\"" + description.replace(/\n/g, "\u21B5") + "\"";
        return description;
    },

    /**
     * @param {string} prefix
     * @param {string} suffix
     * @param {function(!WebInspector.RemoteObjectProperty)} formatProperty
     * @return {string}
     */
    _concatenate: function(prefix, suffix, formatProperty)
    {
        var previewChars = 100;

        var buffer = prefix;
        var children = this._children();
        for (var i = 0; i < children.length; ++i) {
            var itemDescription = formatProperty(children[i]);
            if (buffer.length + itemDescription.length > previewChars) {
                buffer += ",\u2026";
                break;
            }
            if (i)
                buffer += ", ";
            buffer += itemDescription;
        }
        buffer += suffix;
        return buffer;
    },

    /**
     * @return {string}
     */
    get type()
    {
        return typeof this._value;
    },

    /**
     * @return {string|undefined}
     */
    get subtype()
    {
        if (this._value === null)
            return "null";

        if (this._value instanceof Array)
            return "array";

        if (this._value instanceof Date)
            return "date";

        return undefined;
    },

    /**
     * @return {boolean}
     */
    get hasChildren()
    {
        if ((typeof this._value !== "object") || (this._value === null))
            return false;
        return !!Object.keys(/** @type {!Object} */ (this._value)).length;
    },

    /**
     * @param {function(?Array.<!WebInspector.RemoteObjectProperty>, ?Array.<!WebInspector.RemoteObjectProperty>)} callback
     */
    getOwnProperties: function(callback)
    {
        callback(this._children(), null);
    },

    /**
     * @param {boolean} accessorPropertiesOnly
     * @param {function(?Array.<!WebInspector.RemoteObjectProperty>, ?Array.<!WebInspector.RemoteObjectProperty>)} callback
     */
    getAllProperties: function(accessorPropertiesOnly, callback)
    {
        if (accessorPropertiesOnly)
            callback([], null);
        else
            callback(this._children(), null);
    },

    /**
     * @return {!Array.<!WebInspector.RemoteObjectProperty>}
     */
    _children: function()
    {
        if (!this.hasChildren)
            return [];
        var value = /** @type {!Object} */ (this._value);

        /**
         * @param {string} propName
         * @return {!WebInspector.RemoteObjectProperty}
         */
        function buildProperty(propName)
        {
            var propValue = value[propName];
            if (!(propValue instanceof WebInspector.RemoteObject))
                propValue = WebInspector.RemoteObject.fromLocalObject(propValue);
            return new WebInspector.RemoteObjectProperty(propName, propValue);
        }
        if (!this._cachedChildren)
            this._cachedChildren = Object.keys(value).map(buildProperty);
        return this._cachedChildren;
    },

    /**
     * @return {boolean}
     */
    isError: function()
    {
        return false;
    },

    /**
     * @return {number}
     */
    arrayLength: function()
    {
        return this._value instanceof Array ? this._value.length : 0;
    },

    /**
     * @param {function(this:Object, ...)} functionDeclaration
     * @param {!Array.<!RuntimeAgent.CallArgument>=} args
     * @param {function(?WebInspector.RemoteObject, boolean=)=} callback
     */
    callFunction: function(functionDeclaration, args, callback)
    {
        var target = /** @type {?Object} */ (this._value);
        var rawArgs = args ? args.map(function(arg) { return arg.value; }) : [];

        var result;
        var wasThrown = false;
        try {
            result = functionDeclaration.apply(target, rawArgs);
        } catch (e) {
            wasThrown = true;
        }

        if (!callback)
            return;
        callback(WebInspector.RemoteObject.fromLocalObject(result), wasThrown);
    },

    /**
     * @param {function(this:Object)} functionDeclaration
     * @param {!Array.<!RuntimeAgent.CallArgument>|undefined} args
     * @param {function(*)} callback
     */
    callFunctionJSON: function(functionDeclaration, args, callback)
    {
        var target = /** @type {?Object} */ (this._value);
        var rawArgs = args ? args.map(function(arg) { return arg.value; }) : [];

        var result;
        try {
            result = functionDeclaration.apply(target, rawArgs);
        } catch (e) {
            result = null;
        }

        callback(result);
    },

    __proto__: WebInspector.RemoteObject.prototype
}

/**
 * @constructor
 * @extends {WebInspector.LocalJSONObject}
 * @param {*} value
 */
WebInspector.MapEntryLocalJSONObject = function(value)
{
    WebInspector.LocalJSONObject.call(this, value);
}

WebInspector.MapEntryLocalJSONObject.prototype = {
    /**
     * @return {string}
     */
    get description()
    {
        if (!this._cachedDescription) {
            var children = this._children();
            this._cachedDescription = "{" + this._formatValue(children[0].value) + " => " + this._formatValue(children[1].value) + "}";
        }
        return this._cachedDescription;
    },

    __proto__: WebInspector.LocalJSONObject.prototype
}
