/*
 * Copyright (C) 2009 Google Inc. All rights reserved.
 * Copyright (C) 2009 Joseph Pecoraro
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

function InjectedScriptAccess(injectedScriptId) {
    this._injectedScriptId = injectedScriptId;
}

InjectedScriptAccess.get = function(injectedScriptId)
{
    return new InjectedScriptAccess(injectedScriptId);
}

InjectedScriptAccess.getDefault = function()
{
    return InjectedScriptAccess.get(0);
}

InjectedScriptAccess.prototype = {};

InjectedScriptAccess._installHandler = function(methodName, async)
{
    InjectedScriptAccess.prototype[methodName] = function()
    {
        var allArgs = Array.prototype.slice.call(arguments);
        var callback = allArgs[allArgs.length - 1];
        var argsString = JSON.stringify(Array.prototype.slice.call(allArgs, 0, allArgs.length - 1));
        
        function myCallback(result, isException)
        {
            if (!isException)
                callback(result);
            else
                WebInspector.console.addMessage(WebInspector.ConsoleMessage.createTextMessage("Error dispatching: " + methodName));
        }
        var callId = WebInspector.Callback.wrap(myCallback);

        InspectorBackend.dispatchOnInjectedScript(callId, this._injectedScriptId, methodName, argsString, !!async);
    };
}

// InjectedScriptAccess message forwarding puts some constraints on the way methods are implemented and called:
// - Make sure corresponding methods in InjectedScript return non-null and non-undefined values,
// - Make sure last parameter of all the InjectedSriptAccess.* calls is a callback function.
// We keep these sorted.
InjectedScriptAccess._installHandler("evaluate");
InjectedScriptAccess._installHandler("evaluateInCallFrame");
InjectedScriptAccess._installHandler("getCompletions");
InjectedScriptAccess._installHandler("getProperties");
InjectedScriptAccess._installHandler("getPrototypes");
InjectedScriptAccess._installHandler("openInInspectedWindow");
InjectedScriptAccess._installHandler("pushNodeToFrontend");
InjectedScriptAccess._installHandler("setPropertyValue");
InjectedScriptAccess._installHandler("evaluateOnSelf");

// Some methods can't run synchronously even on the injected script side (such as DB transactions).
// Mark them as asynchronous here.
InjectedScriptAccess._installHandler("executeSql", true);

WebInspector.didDispatchOnInjectedScript = WebInspector.Callback.processCallback;
