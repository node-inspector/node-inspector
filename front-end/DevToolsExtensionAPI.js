/*
 * Copyright (C) 2011 Google Inc. All rights reserved.
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

function platformExtensionAPI(coreAPI)
{
    function getTabId()
    {
        return tabId;
    }
    chrome = window.chrome || {};
    // Override chrome.devtools as a workaround for a error-throwing getter being exposed
    // in extension pages loaded into a non-extension process (only happens for remote client
    // extensions)
    var devtools_descriptor = Object.getOwnPropertyDescriptor(chrome, "devtools");
    if (!devtools_descriptor || devtools_descriptor.get)
        Object.defineProperty(chrome, "devtools", { value: {}, enumerable: true });
    // Only expose tabId on chrome.devtools.inspectedWindow, not webInspector.inspectedWindow.
    chrome.devtools.inspectedWindow = {};
    chrome.devtools.inspectedWindow.__defineGetter__("tabId", getTabId);
    chrome.devtools.inspectedWindow.__proto__ = coreAPI.inspectedWindow;
    chrome.devtools.network = coreAPI.network;
    chrome.devtools.panels = coreAPI.panels;

    // default to expose experimental APIs for now.
    if (extensionInfo.exposeExperimentalAPIs !== false) {
        chrome.experimental = chrome.experimental || {};
        chrome.experimental.devtools = chrome.experimental.devtools || {};

        var properties = Object.getOwnPropertyNames(coreAPI);
        for (var i = 0; i < properties.length; ++i) {
            var descriptor = Object.getOwnPropertyDescriptor(coreAPI, properties[i]);
            Object.defineProperty(chrome.experimental.devtools, properties[i], descriptor);
        }
        chrome.experimental.devtools.inspectedWindow = chrome.devtools.inspectedWindow;
    }
    if (extensionInfo.exposeWebInspectorNamespace)
        window.webInspector = coreAPI;
}
