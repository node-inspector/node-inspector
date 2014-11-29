// Copyright 2014 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

/**
 * @constructor
 */
function DevToolsAPIImpl()
{
    /**
     * @type {?Window}
     */
    this._inspectorWindow;

    /**
     * @type {!Array.<function(!Window)>}
     */
    this._pendingDispatches = [];

    /**
     * @type {number}
     */
    this._lastCallId = 0;

    /**
     * @type {!Object.<number, function(?string)>}
     */
    this._callbacks = {};
}

DevToolsAPIImpl.prototype = {
    /**
     * @param {number} id
     * @param {?string} error
     */
    embedderMessageAck: function(id, error)
    {
        var callback = this._callbacks[id];
        delete this._callbacks[id];
        if (callback)
            callback(error);
    },

    /**
     * @param {string} method
     * @param {!Array.<*>} args
     * @param {?function(?string)} callback
     */
    sendMessageToEmbedder: function(method, args, callback)
    {
        var callId = ++this._lastCallId;
        var argsArray = Array.prototype.slice.call(arguments, 2);
        if (callback)
            this._callbacks[callId] = callback;
        var message = { "id": callId, "method": method };
        if (args.length)
            message.params = args;
        DevToolsHost.sendMessageToEmbedder(JSON.stringify(message));
    },

    /**
     * @param {?Window} inspectorWindow
     */
    setInspectorWindow: function(inspectorWindow)
    {
        this._inspectorWindow = inspectorWindow;
        if (!inspectorWindow)
            return;
        while (this._pendingDispatches.length)
            this._pendingDispatches.shift()(inspectorWindow);
    },

    /**
     * @param {function(!Window)} callback
     */
    _dispatchOnInspectorWindow: function(callback)
    {
        if (this._inspectorWindow) {
            callback(this._inspectorWindow);
        } else {
            this._pendingDispatches.push(callback);
        }
    },

    /**
     * @param {string} method
     * @param {!Array.<*>} args
     */
    _dispatchOnInspectorFrontendAPI: function(method, args)
    {
        /**
         * @param {!Window} inspectorWindow
         */
        function dispatch(inspectorWindow)
        {
            var api = inspectorWindow.InspectorFrontendAPI;
            api[method].apply(api, args);
        }

        this._dispatchOnInspectorWindow(dispatch);
    },

    // API methods below this line --------------------------------------------

    /**
     * @param {!Array.<!ExtensionDescriptor>} extensions
     */
    addExtensions: function(extensions)
    {
        /**
         * @param {!Window} inspectorWindow
         */
        function dispatch(inspectorWindow)
        {
            // Support for legacy front-ends (<M41).
            if (inspectorWindow.WebInspector.addExtensions)
                inspectorWindow.WebInspector.addExtensions(extensions);
            else
                inspectorWindow.InspectorFrontendAPI.addExtensions(extensions);
        }

        this._dispatchOnInspectorWindow(dispatch);
    },

    /**
     * @param {string} url
     */
    appendedToURL: function(url)
    {
        this._dispatchOnInspectorFrontendAPI("appendedToURL", [url]);
    },

    /**
     * @param {string} url
     */
    canceledSaveURL: function(url)
    {
        this._dispatchOnInspectorFrontendAPI("canceledSaveURL", [url]);
    },

    contextMenuCleared: function()
    {
        this._dispatchOnInspectorFrontendAPI("contextMenuCleared", []);
    },

    /**
     * @param {string} id
     */
    contextMenuItemSelected: function(id)
    {
        this._dispatchOnInspectorFrontendAPI("contextMenuItemSelected", [id]);
    },

    /**
     * @param {number} count
     */
    deviceCountUpdated: function(count)
    {
        this._dispatchOnInspectorFrontendAPI("deviceCountUpdated", [count]);
    },

    /**
     * @param {!Array.<!Adb.Device>} devices
     */
    devicesUpdated: function(devices)
    {
        this._dispatchOnInspectorFrontendAPI("devicesUpdated", [devices]);
    },

    /**
     * @param {string} message
     */
    dispatchMessage: function(message)
    {
        this._dispatchOnInspectorFrontendAPI("dispatchMessage", [message]);
    },

    /**
     * @param {string} messageChunk
     * @param {number} messageSize
     */
    dispatchMessageChunk: function(messageChunk, messageSize)
    {
        this._dispatchOnInspectorFrontendAPI("dispatchMessageChunk", [messageChunk, messageSize]);
    },

    enterInspectElementMode: function()
    {
        this._dispatchOnInspectorFrontendAPI("enterInspectElementMode", []);
    },

    /**
     * @param {!Array.<!{fileSystemName: string, rootURL: string, fileSystemPath: string}>} fileSystems
     */
    fileSystemsLoaded: function(fileSystems)
    {
        this._dispatchOnInspectorFrontendAPI("fileSystemsLoaded", [fileSystems]);
    },

    /**
     * @param {string} fileSystemPath
     */
    fileSystemRemoved: function(fileSystemPath)
    {
        this._dispatchOnInspectorFrontendAPI("fileSystemRemoved", [fileSystemPath]);
    },

    /**
     * @param {string} errorMessage
     * @param {!{fileSystemName: string, rootURL: string, fileSystemPath: string}} fileSystem
     */
    fileSystemAdded: function(errorMessage, fileSystem)
    {
        this._dispatchOnInspectorFrontendAPI("fileSystemAdded", [errorMessage, fileSystem]);
    },

    /**
     * @param {number} requestId
     * @param {string} fileSystemPath
     * @param {number} totalWork
     */
    indexingTotalWorkCalculated: function(requestId, fileSystemPath, totalWork)
    {
        this._dispatchOnInspectorFrontendAPI("indexingTotalWorkCalculated", [requestId, fileSystemPath, totalWork]);
    },

    /**
     * @param {number} requestId
     * @param {string} fileSystemPath
     * @param {number} worked
     */
    indexingWorked: function(requestId, fileSystemPath, worked)
    {
        this._dispatchOnInspectorFrontendAPI("indexingWorked", [requestId, fileSystemPath, worked]);
    },

    /**
     * @param {number} requestId
     * @param {string} fileSystemPath
     */
    indexingDone: function(requestId, fileSystemPath)
    {
        this._dispatchOnInspectorFrontendAPI("indexingDone", [requestId, fileSystemPath]);
    },

    /**
     * @param {{type: string, keyIdentifier: string, keyCode: number, modifiers: number}} event
     */
    keyEventUnhandled: function(event)
    {
        this._dispatchOnInspectorFrontendAPI("keyEventUnhandled", [event]);
    },

    /**
     * @param {string} url
     * @param {number} lineNumber
     * @param {number} columnNumber
     */
    revealSourceLine: function(url, lineNumber, columnNumber)
    {
        this._dispatchOnInspectorFrontendAPI("revealSourceLine", [url, lineNumber, columnNumber]);
    },

    /**
     * @param {string} url
     */
    savedURL: function(url)
    {
        this._dispatchOnInspectorFrontendAPI("savedURL", [url]);
    },

    /**
     * @param {number} requestId
     * @param {string} fileSystemPath
     * @param {!Array.<string>} files
     */
    searchCompleted: function(requestId, fileSystemPath, files)
    {
        this._dispatchOnInspectorFrontendAPI("searchCompleted", [requestId, fileSystemPath, files]);
    },

    /**
     * @param {string} tabId
     */
    setInspectedTabId: function(tabId)
    {
        /**
         * @param {!Window} inspectorWindow
         */
        function dispatch(inspectorWindow)
        {
            // Support for legacy front-ends (<M41).
            if (inspectorWindow.WebInspector.setInspectedTabId)
                inspectorWindow.WebInspector.setInspectedTabId(tabId);
            else
                inspectorWindow.InspectorFrontendAPI.setInspectedTabId(tabId);
        }

        this._dispatchOnInspectorWindow(dispatch);
    },

    /**
     * @param {string} backgroundColor
     * @param {string} color
     */
    setToolbarColors: function(backgroundColor, color)
    {
        this._dispatchOnInspectorFrontendAPI("setToolbarColors", [backgroundColor, color]);
    },

    /**
     * @param {boolean} useSoftMenu
     */
    setUseSoftMenu: function(useSoftMenu)
    {
        this._dispatchOnInspectorFrontendAPI("setUseSoftMenu", [useSoftMenu]);
    },

    showConsole: function()
    {
        this._dispatchOnInspectorFrontendAPI("showConsole", []);
    }
}

var DevToolsAPI = new DevToolsAPIImpl();
