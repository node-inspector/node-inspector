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
 * @constructor
 * @param {string|undefined} objectId
 * @param {string} type
 * @param {string|undefined} subtype
 * @param {*} value
 * @param {string=} description
 * @param {RuntimeAgent.ObjectPreview=} preview
 */
WebInspector.RemoteObject = function(objectId, type, subtype, value, description, preview)
{
    this._type = type;
    this._subtype = subtype;
    if (objectId) {
        // handle
        this._objectId = objectId;
        this._description = description;
        this._hasChildren = true;
        this._preview = preview;
    } else {
        // Primitive or null object.
        console.assert(type !== "object" || value === null);
        this._description = description || (value + "");
        this._hasChildren = false;
        this.value = value;
    }
}

/**
 * @param {number|string|boolean} value
 * @return {WebInspector.RemoteObject}
 */
WebInspector.RemoteObject.fromPrimitiveValue = function(value)
{
    return new WebInspector.RemoteObject(undefined, typeof value, undefined, value);
}

/**
 * @param {*} value
 * @return {WebInspector.RemoteObject}
 */
WebInspector.RemoteObject.fromLocalObject = function(value)
{
    return new WebInspector.LocalJSONObject(value);
}

/**
 * @param {WebInspector.DOMNode} node
 * @param {string} objectGroup
 * @param {function(?WebInspector.RemoteObject)} callback
 */
WebInspector.RemoteObject.resolveNode = function(node, objectGroup, callback)
{
    /**
     * @param {?Protocol.Error} error
     * @param {RuntimeAgent.RemoteObject} object
     */
    function mycallback(error, object)
    {
        if (!callback)
            return;

        if (error || !object)
            callback(null);
        else
            callback(WebInspector.RemoteObject.fromPayload(object));
    }
    DOMAgent.resolveNode(node.id, objectGroup, mycallback);
}

/**
 * @param {RuntimeAgent.RemoteObject=} payload
 * @return {WebInspector.RemoteObject}
 */
WebInspector.RemoteObject.fromPayload = function(payload)
{
    console.assert(typeof payload === "object", "Remote object payload should only be an object");

    return new WebInspector.RemoteObject(payload.objectId, payload.type, payload.subtype, payload.value, payload.description, payload.preview);
}

/**
 * @param {WebInspector.RemoteObject} remoteObject
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

WebInspector.RemoteObject.prototype = {
    /** @return {RuntimeAgent.RemoteObjectId} */
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

    /** @return {RuntimeAgent.ObjectPreview|undefined} */
    get preview()
    {
        return this._preview;
    },

    /**
     * @param {function(Array.<WebInspector.RemoteObjectProperty>, Array.<WebInspector.RemoteObjectProperty>=)} callback
     */
    getOwnProperties: function(callback)
    {
        this.doGetProperties(true, callback);
    },

    /**
     * @param {function(Array.<WebInspector.RemoteObjectProperty>, Array.<WebInspector.RemoteObjectProperty>=)} callback
     */
    getAllProperties: function(callback)
    {
        this.doGetProperties(false, callback);
    },

    /**
     * @param {boolean} ownProperties
     * @param {function(Array.<WebInspector.RemoteObjectProperty>, Array.<WebInspector.RemoteObjectProperty>=)} callback
     */
    doGetProperties: function(ownProperties, callback)
    {
        if (!this._objectId) {
            callback([]);
            return;
        }

        /**
         * @param {?Protocol.Error} error
         * @param {Array.<RuntimeAgent.PropertyDescriptor>} properties
         * @param {Array.<RuntimeAgent.InternalPropertyDescriptor>=} internalProperties
         */
        function remoteObjectBinder(error, properties, internalProperties)
        {
            if (error) {
                callback(null);
                return;
            }
            var result = [];
            for (var i = 0; properties && i < properties.length; ++i) {
                var property = properties[i];
                if (property.get || property.set) {
                    if (property.get)
                        result.push(new WebInspector.RemoteObjectProperty("get " + property.name, WebInspector.RemoteObject.fromPayload(property.get), property));
                    if (property.set)
                        result.push(new WebInspector.RemoteObjectProperty("set " + property.name, WebInspector.RemoteObject.fromPayload(property.set), property));
                } else
                    result.push(new WebInspector.RemoteObjectProperty(property.name, WebInspector.RemoteObject.fromPayload(property.value), property));
            }
            var internalPropertiesResult;
            if (internalProperties) {
                internalPropertiesResult = [];
                for (var i = 0; i < internalProperties.length; i++) {
                    var property = internalProperties[i];
                    internalPropertiesResult.push(new WebInspector.RemoteObjectProperty(property.name, WebInspector.RemoteObject.fromPayload(property.value)));
                }
            }
            callback(result, internalPropertiesResult);
        }
        RuntimeAgent.getProperties(this._objectId, ownProperties, remoteObjectBinder);
    },

    /**
     * @param {string} name
     * @param {string} value
     * @param {function(string=)} callback
     */
    setPropertyValue: function(name, value, callback)
    {
        if (!this._objectId) {
            callback("Can't set a property of non-object.");
            return;
        }

        RuntimeAgent.evaluate.invoke({expression:value, doNotPauseOnExceptionsAndMuteConsole:true}, evaluatedCallback.bind(this));

        /**
         * @param {?Protocol.Error} error
         * @param {RuntimeAgent.RemoteObject} result
         * @param {boolean=} wasThrown
         */
        function evaluatedCallback(error, result, wasThrown)
        {
            if (error || wasThrown) {
                callback(error || result.description);
                return;
            }

            this.doSetObjectPropertyValue(result, name, callback);

            if (result._objectId)
                RuntimeAgent.releaseObject(result._objectId);
        }
    },

    /**
     * @param {RuntimeAgent.RemoteObject} result
     * @param {string} name
     * @param {function(string=)} callback
     */
    doSetObjectPropertyValue: function(result, name, callback)
    {
        // Note that it is not that simple with accessor properties. The proto object may contain the property,
        // however not the proto object must be 'this', but the main object.
        var setPropertyValueFunction = "function(a, b) { this[a] = b; }";

        // Special case for NaN, Infinity and -Infinity
        if (result.type === "number" && typeof result.value !== "number")
            setPropertyValueFunction = "function(a) { this[a] = " + result.description + "; }";

        delete result.description; // Optimize on traffic.
        RuntimeAgent.callFunctionOn(this._objectId, setPropertyValueFunction, [{ value:name }, result], true, undefined, undefined, propertySetCallback.bind(this));

        /**
         * @param {?Protocol.Error} error
         * @param {RuntimeAgent.RemoteObject} result
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
     * @param {function(?DOMAgent.NodeId)} callback
     */
    pushNodeToFrontend: function(callback)
    {
        if (this._objectId)
            WebInspector.domAgent.pushNodeToFrontend(this._objectId, callback);
        else
            callback(0);
    },

    highlightAsDOMNode: function()
    {
        WebInspector.domAgent.highlightDOMNode(undefined, undefined, this._objectId);
    },

    hideDOMNodeHighlight: function()
    {
        WebInspector.domAgent.hideDOMNodeHighlight();
    },

    /**
     * @param {function(this:Object)} functionDeclaration
     * @param {Array.<RuntimeAgent.CallArgument>=} args
     * @param {function(?WebInspector.RemoteObject)=} callback
     */
    callFunction: function(functionDeclaration, args, callback)
    {
        /**
         * @param {?Protocol.Error} error
         * @param {RuntimeAgent.RemoteObject} result
         * @param {boolean=} wasThrown
         */
        function mycallback(error, result, wasThrown)
        {
            if (!callback)
                return;

            callback((error || wasThrown) ? null : WebInspector.RemoteObject.fromPayload(result));
        }

        RuntimeAgent.callFunctionOn(this._objectId, functionDeclaration.toString(), args, true, undefined, undefined, mycallback);
    },

    /**
     * @param {function(this:Object)} functionDeclaration
     * @param {Array.<RuntimeAgent.CallArgument>|undefined} args
     * @param {function(*)} callback
     */
    callFunctionJSON: function(functionDeclaration, args, callback)
    {
        /**
         * @param {?Protocol.Error} error
         * @param {RuntimeAgent.RemoteObject} result
         * @param {boolean=} wasThrown
         */
        function mycallback(error, result, wasThrown)
        {
            callback((error || wasThrown) ? null : result.value);
        }

        RuntimeAgent.callFunctionOn(this._objectId, functionDeclaration.toString(), args, true, true, false, mycallback);
    },

    release: function()
    {
        if (!this._objectId)
            return;
        RuntimeAgent.releaseObject(this._objectId);
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
    }
}


/**
 * @constructor
 * @extends {WebInspector.RemoteObject}
 * @param {string|undefined} objectId
 * @param {WebInspector.ScopeRef} scopeRef
 * @param {string} type
 * @param {string|undefined} subtype
 * @param {*} value
 * @param {string=} description
 * @param {RuntimeAgent.ObjectPreview=} preview
 */
WebInspector.ScopeRemoteObject = function(objectId, scopeRef, type, subtype, value, description, preview)
{
    WebInspector.RemoteObject.call(this, objectId, type, subtype, value, description, preview);
    this._scopeRef = scopeRef;
    this._savedScopeProperties = undefined;
};

/**
 * @param {RuntimeAgent.RemoteObject} payload
 * @param {WebInspector.ScopeRef=} scopeRef
 * @return {WebInspector.RemoteObject}
 */
WebInspector.ScopeRemoteObject.fromPayload = function(payload, scopeRef)
{
    if (scopeRef)
        return new WebInspector.ScopeRemoteObject(payload.objectId, scopeRef, payload.type, payload.subtype, payload.value, payload.description, payload.preview);
    else
        return new WebInspector.RemoteObject(payload.objectId, payload.type, payload.subtype, payload.value, payload.description, payload.preview);
}

WebInspector.ScopeRemoteObject.prototype = {
    /**
     * @param {boolean} ownProperties
     * @param {function(Array.<WebInspector.RemoteObjectProperty>, Array.<WebInspector.RemoteObjectProperty>=)} callback
     * @override
     */
    doGetProperties: function(ownProperties, callback)
    {
        if (this._savedScopeProperties) {
            // No need to reload scope variables, as the remote object never
            // changes its properties. If variable is updated, the properties
            // array is patched locally.
            callback(this._savedScopeProperties.slice(), []);
            return;
        }

        /**
         * @param {Array.<WebInspector.RemoteObjectProperty>} properties
         * @param {Array.<WebInspector.RemoteObjectProperty>=} internalProperties
         */
        function wrappedCallback(properties, internalProperties)
        {
            if (this._scopeRef && properties instanceof Array)
                this._savedScopeProperties = properties.slice();
            callback(properties, internalProperties);
        }

        WebInspector.RemoteObject.prototype.doGetProperties.call(this, ownProperties, wrappedCallback.bind(this));
    },

    /**
     * @override
     * @param {RuntimeAgent.RemoteObject} result
     * @param {string} name
     * @param {function(string=)} callback
     */
    doSetObjectPropertyValue: function(result, name, callback)
    {
        var newValue;

        switch (result.type) {
            case "undefined":
                newValue = {};
                break;
            case "object":
            case "function":
                newValue = { objectId: result.objectId };
                break;
            default:
                newValue = { value: result.value };
        }

        DebuggerAgent.setVariableValue(this._scopeRef.number, name, newValue, this._scopeRef.callFrameId, this._scopeRef.functionId, setVariableValueCallback.bind(this));

        /**
         * @param {?Protocol.Error} error
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
                        this._savedScopeProperties[i].value = WebInspector.RemoteObject.fromPayload(result);
                }
            }
            callback();
        }
    },

    __proto__: WebInspector.RemoteObject.prototype
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
 * @param {WebInspector.RemoteObject} value
 * @param {Object=} descriptor
 */
WebInspector.RemoteObjectProperty = function(name, value, descriptor)
{
    this.name = name;
    this.value = value;
    this.enumerable = descriptor ? !!descriptor.enumerable : true;
    this.writable = descriptor ? !!descriptor.writable : true;
    if (descriptor && descriptor.wasThrown)
        this.wasThrown = true;
}

/**
 * @param {string} name
 * @param {string} value
 * @return {WebInspector.RemoteObjectProperty}
 */
WebInspector.RemoteObjectProperty.fromPrimitiveValue = function(name, value)
{
    return new WebInspector.RemoteObjectProperty(name, WebInspector.RemoteObject.fromPrimitiveValue(value));
}

/**
 * @param {string} name
 * @param {WebInspector.RemoteObject} value
 * @return {WebInspector.RemoteObjectProperty}
 */
WebInspector.RemoteObjectProperty.fromScopeValue = function(name, value)
{
    var result = new WebInspector.RemoteObjectProperty(name, value);
    result.writable = false;
    return result;
}

// The below is a wrapper around a local object that provides an interface comaptible
// with RemoteObject, to be used by the UI code (primarily ObjectPropertiesSection).
// Note that only JSON-compliant objects are currently supported, as there's no provision
// for traversing prototypes, extracting class names via constuctor, handling properties
// or functions.

/**
 * @constructor
 * @extends {WebInspector.RemoteObject}
 * @param {*} value
 */
WebInspector.LocalJSONObject = function(value)
{
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

        if (this.type === "object") {
            switch (this.subtype) {
            case "array":
                function formatArrayItem(property)
                {
                    return property.value.description;
                }
                this._cachedDescription = this._concatenate("[", "]", formatArrayItem);
                break;
            case "date":
                this._cachedDescription = "" + this._value;
                break;
            case "null":
                this._cachedDescription = "null";
                break;
            default:
                function formatObjectItem(property)
                {
                    return property.name + ":" + property.value.description;
                }
                this._cachedDescription = this._concatenate("{", "}", formatObjectItem);
            }
        } else
            this._cachedDescription = String(this._value);

        return this._cachedDescription;
    },

    /**
     * @param {string} prefix
     * @param {string} suffix
     * @return {string}
     */
    _concatenate: function(prefix, suffix, formatProperty)
    {
        const previewChars = 100;

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
     * @param {function(Array.<WebInspector.RemoteObjectProperty>)} callback
     */
    getOwnProperties: function(callback)
    {
        callback(this._children());
    },

    /**
     * @param {function(Array.<WebInspector.RemoteObjectProperty>)} callback
     */
    getAllProperties: function(callback)
    {
        callback(this._children());
    },

    /**
     * @return {Array.<WebInspector.RemoteObjectProperty>}
     */
    _children: function()
    {
        if (!this.hasChildren)
            return [];
        var value = /** @type {!Object} */ (this._value);

        function buildProperty(propName)
        {
            return new WebInspector.RemoteObjectProperty(propName, new WebInspector.LocalJSONObject(this._value[propName]));
        }
        if (!this._cachedChildren)
            this._cachedChildren = Object.keys(value).map(buildProperty.bind(this));
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
    }
}
