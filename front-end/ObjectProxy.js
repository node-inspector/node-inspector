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

WebInspector.ObjectProxy = function(injectedScriptId, objectId, path, description, hasChildren)
{
    this.objectId = objectId;
    this.injectedScriptId = injectedScriptId;
    this.path = path || [];
    this.description = description;
    this.hasChildren = hasChildren;
}

WebInspector.ObjectProxy.wrapPrimitiveValue = function(value)
{
    var proxy = new WebInspector.ObjectProxy();
    proxy.type = typeof value;
    proxy.description = value;
    return proxy;
}

WebInspector.ObjectProxy.getPropertiesAsync = function(objectProxy, propertiesToQueryFor, callback)
{
    function createPropertiesMapThenCallback(propertiesPayload)
    {
        if (!propertiesPayload) {
            callback();
            return;
        }

        var result = [];
        for (var i = 0; i < propertiesPayload.length; ++i)
            if (propertiesToQueryFor.indexOf(propertiesPayload[i].name) !== -1)
                result[propertiesPayload[i].name] = propertiesPayload[i].value.description;
        callback(result);
    };
    InjectedScriptAccess.get(objectProxy.injectedScriptId).getProperties(objectProxy, true, false, createPropertiesMapThenCallback);
}

WebInspector.ObjectPropertyProxy = function(name, value)
{
    this.name = name;
    this.value = value;
}
