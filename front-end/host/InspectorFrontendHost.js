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

/** @interface */
function InspectorFrontendHostAPI()
{
    /**
     * @type {!WebInspector.EventTarget}
     */
    this.events;
}

/** @typedef {{type:string, id:(number|undefined),
               label:(string|undefined), enabled:(boolean|undefined), checked:(boolean|undefined),
               subItems:(!Array.<!InspectorFrontendHostAPI.ContextMenuDescriptor>|undefined)}} */
InspectorFrontendHostAPI.ContextMenuDescriptor;

InspectorFrontendHostAPI.Events = {
    AddExtensions: "addExtensions",
    AppendedToURL: "appendedToURL",
    CanceledSaveURL: "canceledSaveURL",
    ContextMenuCleared: "contextMenuCleared",
    ContextMenuItemSelected: "contextMenuItemSelected",
    DeviceCountUpdated: "deviceCountUpdated",
    DevicesUpdated: "devicesUpdated",
    DispatchMessage: "dispatchMessage",
    DispatchMessageChunk: "dispatchMessageChunk",
    EnterInspectElementMode: "enterInspectElementMode",
    FileSystemsLoaded: "fileSystemsLoaded",
    FileSystemRemoved: "fileSystemRemoved",
    FileSystemAdded: "fileSystemAdded",
    IndexingTotalWorkCalculated: "indexingTotalWorkCalculated",
    IndexingWorked: "indexingWorked",
    IndexingDone: "indexingDone",
    KeyEventUnhandled: "keyEventUnhandled",
    RevealSourceLine: "revealSourceLine",
    SavedURL: "savedURL",
    SearchCompleted: "searchCompleted",
    SetInspectedTabId: "setInspectedTabId",
    SetToolbarColors: "setToolbarColors",
    SetUseSoftMenu: "setUseSoftMenu",
    ShowConsole: "showConsole"
}

InspectorFrontendHostAPI.EventDescriptors = [
    [InspectorFrontendHostAPI.Events.AddExtensions, ["extensions"]],
    [InspectorFrontendHostAPI.Events.AppendedToURL, ["url"]],
    [InspectorFrontendHostAPI.Events.CanceledSaveURL, ["url"]],
    [InspectorFrontendHostAPI.Events.ContextMenuCleared, []],
    [InspectorFrontendHostAPI.Events.ContextMenuItemSelected, ["id"]],
    [InspectorFrontendHostAPI.Events.DeviceCountUpdated, ["count"]],
    [InspectorFrontendHostAPI.Events.DevicesUpdated, ["devices"]],
    [InspectorFrontendHostAPI.Events.DispatchMessage, ["messageObject"]],
    [InspectorFrontendHostAPI.Events.DispatchMessageChunk, ["messageChunk", "messageSize"]],
    [InspectorFrontendHostAPI.Events.EnterInspectElementMode, []],
    [InspectorFrontendHostAPI.Events.FileSystemsLoaded, ["fileSystems"]],
    [InspectorFrontendHostAPI.Events.FileSystemRemoved, ["fileSystemPath"]],
    [InspectorFrontendHostAPI.Events.FileSystemAdded, ["errorMessage", "fileSystem"]],
    [InspectorFrontendHostAPI.Events.IndexingTotalWorkCalculated, ["requestId", "fileSystemPath", "totalWork"]],
    [InspectorFrontendHostAPI.Events.IndexingWorked, ["requestId", "fileSystemPath", "worked"]],
    [InspectorFrontendHostAPI.Events.IndexingDone, ["requestId", "fileSystemPath"]],
    [InspectorFrontendHostAPI.Events.KeyEventUnhandled, ["event"]],
    [InspectorFrontendHostAPI.Events.RevealSourceLine, ["url", "lineNumber", "columnNumber"]],
    [InspectorFrontendHostAPI.Events.SavedURL, ["url"]],
    [InspectorFrontendHostAPI.Events.SearchCompleted, ["requestId", "fileSystemPath", "files"]],
    [InspectorFrontendHostAPI.Events.SetInspectedTabId, ["tabId"]],
    [InspectorFrontendHostAPI.Events.SetToolbarColors, ["backgroundColor", "color"]],
    [InspectorFrontendHostAPI.Events.SetUseSoftMenu, ["useSoftMenu"]],
    [InspectorFrontendHostAPI.Events.ShowConsole, []]
];

InspectorFrontendHostAPI.prototype = {
    addFileSystem: function() { },

    /**
     * @param {string} url
     * @param {string} content
     */
    append: function(url, content) { },

    loadCompleted: function() { },

    /**
     * @param {number} requestId
     * @param {string} fileSystemPath
     */
    indexPath: function(requestId, fileSystemPath) { },

    /**
     * @return {string}
     */
    getSelectionBackgroundColor: function() { },

    /**
     * @return {string}
     */
    getSelectionForegroundColor: function() { },

    /**
     * Requests inspected page to be placed atop of the inspector frontend with specified bounds.
     * @param {{x: number, y: number, width: number, height: number}} bounds
     */
    setInspectedPageBounds: function(bounds) { },

    /**
     * @param {string} shortcuts
     */
    setWhitelistedShortcuts: function(shortcuts) { },

    inspectElementCompleted: function() { },

    /**
     * @param {string} url
     */
    openInNewTab: function(url) { },

    /**
     * @param {string} fileSystemPath
     */
    removeFileSystem: function(fileSystemPath) { },

    requestFileSystems: function() { },

    /**
     * @param {string} url
     * @param {string} content
     * @param {boolean} forceSaveAs
     */
    save: function(url, content, forceSaveAs) { },

    /**
     * @param {number} requestId
     * @param {string} fileSystemPath
     * @param {string} query
     */
    searchInPath: function(requestId, fileSystemPath, query) { },

    /**
     * @param {number} requestId
     */
    stopIndexing: function(requestId) { },

    bringToFront: function() { },

    /**
     * @param {string} browserId
     * @param {string} url
     */
    openUrlOnRemoteDeviceAndInspect: function(browserId, url) { },

    closeWindow: function() { },

    copyText: function(text) { },

    /**
     * @param {string} url
     */
    inspectedURLChanged: function(url) { },

    /**
     * @param {string} fileSystemId
     * @param {string} registeredName
     * @return {?DOMFileSystem}
     */
    isolatedFileSystem: function(fileSystemId, registeredName) { },

    /**
     * @param {!FileSystem} fileSystem
     */
    upgradeDraggedFileSystemPermissions: function(fileSystem) { },

    /**
     * @return {string}
     */
    platform: function() { },

    /**
     * @param {number} actionCode
     */
    recordActionTaken: function(actionCode) { },

    /**
     * @param {number} panelCode
     */
    recordPanelShown: function(panelCode) { },

    /**
     * @param {string} message
     */
    sendMessageToBackend: function(message) { },

    /**
     * @param {boolean} enabled
     */
    setDeviceCountUpdatesEnabled: function(enabled) { },

    /**
     * @param {boolean} enabled
     */
    setDevicesUpdatesEnabled: function(enabled) { },

    /**
     * @param {string} origin
     * @param {string} script
     */
    setInjectedScriptForOrigin: function(origin, script) { },

    /**
     * @param {boolean} isDocked
     * @param {function()} callback
     */
    setIsDocked: function(isDocked, callback) { },

    /**
     * @return {number}
     */
    zoomFactor: function() { },

    zoomIn: function() { },

    zoomOut: function() { },

    resetZoom: function() { },

    /**
     * @param {number} x
     * @param {number} y
     * @param {!Array.<!InspectorFrontendHostAPI.ContextMenuDescriptor>} items
     * @param {!Document} document
     */
    showContextMenuAtPoint: function(x, y, items, document) { },

    /**
     * @return {boolean}
     */
    isUnderTest: function() { },

    /**
     * @return {boolean}
     */
    isHostedMode: function() { }
}

/**
 * @constructor
 * @implements {InspectorFrontendHostAPI}
 * @suppressGlobalPropertiesCheck
 */
WebInspector.InspectorFrontendHostStub = function()
{
    /**
     * @param {!Event} event
     */
    function stopEventPropagation(event)
    {
        // Let browser handle Ctrl+/Ctrl- shortcuts in hosted mode.
        var zoomModifier = WebInspector.isMac() ? event.metaKey : event.ctrlKey;
        if (zoomModifier && (event.keyCode === 187 || event.keyCode === 189))
            event.stopPropagation();
    }
    document.addEventListener("keydown", stopEventPropagation, true);
}

WebInspector.InspectorFrontendHostStub.prototype = {
    /**
     * @return {string}
     */
    getSelectionBackgroundColor: function()
    {
        return "#6e86ff";
    },

    /**
     * @return {string}
     */
    getSelectionForegroundColor: function()
    {
        return "#ffffff";
    },

    /**
     * @return {string}
     */
    platform: function()
    {
        var match = navigator.userAgent.match(/Windows NT/);
        if (match)
            return "windows";
        match = navigator.userAgent.match(/Mac OS X/);
        if (match)
            return "mac";
        return "linux";
    },

    loadCompleted: function()
    {
    },

    bringToFront: function()
    {
        this._windowVisible = true;
    },

    closeWindow: function()
    {
        this._windowVisible = false;
    },

    /**
     * @param {boolean} isDocked
     * @param {function()} callback
     */
    setIsDocked: function(isDocked, callback)
    {
    },

    /**
     * Requests inspected page to be placed atop of the inspector frontend with specified bounds.
     * @param {{x: number, y: number, width: number, height: number}} bounds
     */
    setInspectedPageBounds: function(bounds)
    {
    },

    inspectElementCompleted: function()
    {
    },

    /**
     * @param {string} origin
     * @param {string} script
     */
    setInjectedScriptForOrigin: function(origin, script)
    {
    },

    /**
     * @param {string} url
     * @suppressGlobalPropertiesCheck
     */
    inspectedURLChanged: function(url)
    {
        document.title = WebInspector.UIString("Developer Tools - %s", url);
    },

    /**
     * @param {string} text
     */
    copyText: function(text)
    {
        WebInspector.console.error("Clipboard is not enabled in hosted mode. Please inspect using chrome://inspect");
    },

    /**
     * @param {string} url
     */
    openInNewTab: function(url)
    {
        window.open(url, "_blank");
    },

    /**
     * @param {string} url
     * @param {string} content
     * @param {boolean} forceSaveAs
     */
    save: function(url, content, forceSaveAs)
    {
        WebInspector.console.error("Saving files is not enabled in hosted mode. Please inspect using chrome://inspect");
        this.events.dispatchEventToListeners(InspectorFrontendHostAPI.Events.CanceledSaveURL, url);
    },

    /**
     * @param {string} url
     * @param {string} content
     */
    append: function(url, content)
    {
        WebInspector.console.error("Saving files is not enabled in hosted mode. Please inspect using chrome://inspect");
    },

    /**
     * @param {string} message
     */
    sendMessageToBackend: function(message)
    {
    },

    /**
     * @param {number} actionCode
     */
    recordActionTaken: function(actionCode)
    {
    },

    /**
     * @param {number} panelCode
     */
    recordPanelShown: function(panelCode)
    {
    },

    requestFileSystems: function()
    {
    },

    addFileSystem: function()
    {
    },

    /**
     * @param {string} fileSystemPath
     */
    removeFileSystem: function(fileSystemPath)
    {
    },

    /**
     * @param {string} fileSystemId
     * @param {string} registeredName
     * @return {?DOMFileSystem}
     */
    isolatedFileSystem: function(fileSystemId, registeredName)
    {
        return null;
    },

    /**
     * @param {!FileSystem} fileSystem
     */
    upgradeDraggedFileSystemPermissions: function(fileSystem)
    {
    },

    /**
     * @param {number} requestId
     * @param {string} fileSystemPath
     */
    indexPath: function(requestId, fileSystemPath)
    {
    },

    /**
     * @param {number} requestId
     */
    stopIndexing: function(requestId)
    {
    },

    /**
     * @param {number} requestId
     * @param {string} fileSystemPath
     * @param {string} query
     */
    searchInPath: function(requestId, fileSystemPath, query)
    {
    },

    /**
     * @return {number}
     */
    zoomFactor: function()
    {
        return 1;
    },

    zoomIn: function()
    {
    },

    zoomOut: function()
    {
    },

    resetZoom: function()
    {
    },

    setWhitelistedShortcuts: function(shortcuts)
    {
    },

    /**
     * @return {boolean}
     */
    isUnderTest: function()
    {
        return false;
    },

    /**
     * @param {string} browserId
     * @param {string} url
     */
    openUrlOnRemoteDeviceAndInspect: function(browserId, url)
    {
    },

    /**
     * @param {boolean} enabled
     */
    setDeviceCountUpdatesEnabled: function(enabled)
    {
    },

    /**
     * @param {boolean} enabled
     */
    setDevicesUpdatesEnabled: function(enabled)
    {
    },

    /**
     * @param {number} x
     * @param {number} y
     * @param {!Array.<!InspectorFrontendHostAPI.ContextMenuDescriptor>} items
     * @param {!Document} document
     */
    showContextMenuAtPoint: function(x, y, items, document)
    {
        throw "Soft context menu should be used";
    },

    /**
     * @return {boolean}
     */
    isHostedMode: function()
    {
        return true;
    }
};

/**
 * @type {!InspectorFrontendHostAPI}
 */
var InspectorFrontendHost = window.InspectorFrontendHost || null;

(function(){

    function initializeInspectorFrontendHost()
    {
        if (!InspectorFrontendHost) {
            // Instantiate stub for web-hosted mode if necessary.
            InspectorFrontendHost = new WebInspector.InspectorFrontendHostStub();
        } else {
            // Otherwise add stubs for missing methods that are declared in the interface.
            var proto = WebInspector.InspectorFrontendHostStub.prototype;
            for (var name in proto) {
                var value = proto[name];
                if (typeof value !== "function" || InspectorFrontendHost[name])
                    continue;

                InspectorFrontendHost[name] = stub.bind(null, name);
            }
        }

        /**
         * @param {string} name
         */
        function stub(name)
        {
            console.error("Incompatible embedder: method InspectorFrontendHost." + name + " is missing. Using stub instead.");
            var args = Array.prototype.slice.call(arguments, 1);
            return proto[name].apply(InspectorFrontendHost, args);
        }

        // Attach the events object.
        InspectorFrontendHost.events = new WebInspector.Object();
    }

    /**
     * @constructor
     */
    function InspectorFrontendAPIImpl()
    {
        this._debugFrontend = !!Runtime.queryParam("debugFrontend");

        var descriptors = InspectorFrontendHostAPI.EventDescriptors;
        for (var i = 0; i < descriptors.length; ++i)
            this[descriptors[i][0]] = this._dispatch.bind(this, descriptors[i][0], descriptors[i][1], descriptors[i][2]);
    }

    InspectorFrontendAPIImpl.prototype = {
        /**
         * @param {string} name
         * @param {!Array.<string>} signature
         * @param {boolean} runOnceLoaded
         */
        _dispatch: function(name, signature, runOnceLoaded)
        {
            var params = Array.prototype.slice.call(arguments, 3);

            if (this._debugFrontend)
                setImmediate(innerDispatch);
            else
                innerDispatch();

            function innerDispatch()
            {
                // Single argument methods get dispatched with the param.
                if (signature.length < 2) {
                    InspectorFrontendHost.events.dispatchEventToListeners(name, params[0]);
                    return;
                }
                var data = {};
                for (var i = 0; i < signature.length; ++i)
                    data[signature[i]] = params[i];
                InspectorFrontendHost.events.dispatchEventToListeners(name, data);
            }
        }
    }

    if (!window.DevToolsHost) {
        initializeInspectorFrontendHost();
        window.InspectorFrontendAPI = new InspectorFrontendAPIImpl();
    }

})();
