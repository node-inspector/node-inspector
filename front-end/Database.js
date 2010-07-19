/*
 * Copyright (C) 2007, 2008 Apple Inc.  All rights reserved.
 *
 * Redistribution and use in source and binary forms, with or without
 * modification, are permitted provided that the following conditions
 * are met:
 *
 * 1.  Redistributions of source code must retain the above copyright
 *     notice, this list of conditions and the following disclaimer.
 * 2.  Redistributions in binary form must reproduce the above copyright
 *     notice, this list of conditions and the following disclaimer in the
 *     documentation and/or other materials provided with the distribution.
 * 3.  Neither the name of Apple Computer, Inc. ("Apple") nor the names of
 *     its contributors may be used to endorse or promote products derived
 *     from this software without specific prior written permission.
 *
 * THIS SOFTWARE IS PROVIDED BY APPLE AND ITS CONTRIBUTORS "AS IS" AND ANY
 * EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED
 * WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
 * DISCLAIMED. IN NO EVENT SHALL APPLE OR ITS CONTRIBUTORS BE LIABLE FOR ANY
 * DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES
 * (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES;
 * LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND
 * ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT
 * (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF
 * THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
 */

WebInspector.Database = function(id, domain, name, version)
{
    this._id = id;
    this._domain = domain;
    this._name = name;
    this._version = version;
}

WebInspector.Database.prototype = {
    get id()
    {
        return this._id;
    },

    get name()
    {
        return this._name;
    },

    set name(x)
    {
        this._name = x;
    },

    get version()
    {
        return this._version;
    },

    set version(x)
    {
        this._version = x;
    },

    get domain()
    {
        return this._domain;
    },

    set domain(x)
    {
        this._domain = x;
    },

    get displayDomain()
    {
        return WebInspector.Resource.prototype.__lookupGetter__("displayDomain").call(this);
    },

    getTableNames: function(callback)
    {
        function sortingCallback(names)
        {
            callback(names.sort());
        }
        var callId = WebInspector.Callback.wrap(sortingCallback);
        InspectorBackend.getDatabaseTableNames(callId, this._id);
    },
    
    executeSql: function(query, onSuccess, onError)
    {
        function callback(result)
        {
            if (!(result instanceof Array)) {
                onError(result);
                return;
            }
            onSuccess(result);
        }
        // FIXME: execute the query in the frame the DB comes from.
        InjectedScriptAccess.getDefault().executeSql(this._id, query, callback);
    }
}

WebInspector.didGetDatabaseTableNames = WebInspector.Callback.processCallback;
