// Copyright 2014 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

/**
 * @constructor
 * @implements {InspectorFrontendHostAPI}
 */
WebInspector.InspectorFrontendHostImpl = function()
{
}

WebInspector.InspectorFrontendHostImpl.prototype = {
    /**
     * @return {string}
     */
    getSelectionBackgroundColor: function()
    {
        return DevToolsHost.getSelectionBackgroundColor();
    },

    /**
     * @return {string}
     */
    getSelectionForegroundColor: function()
    {
        return DevToolsHost.getSelectionForegroundColor();
    },

    /**
     * @return {string}
     */
    platform: function()
    {
        return DevToolsHost.platform();
    },

    loadCompleted: function()
    {
        DevToolsAPI.sendMessageToEmbedder("loadCompleted", [], null);
    },

    bringToFront: function()
    {
        DevToolsAPI.sendMessageToEmbedder("bringToFront", [], null);
    },

    closeWindow: function()
    {
        DevToolsAPI.sendMessageToEmbedder("closeWindow", [], null);
    },

    /**
     * @param {boolean} isDocked
     * @param {function()} callback
     */
    setIsDocked: function(isDocked, callback)
    {
        DevToolsAPI.sendMessageToEmbedder("setIsDocked", [isDocked], callback);
    },

    /**
     * Requests inspected page to be placed atop of the inspector frontend with specified bounds.
     * @param {{x: number, y: number, width: number, height: number}} bounds
     */
    setInspectedPageBounds: function(bounds)
    {
        DevToolsAPI.sendMessageToEmbedder("setInspectedPageBounds", [bounds], null);
    },

    inspectElementCompleted: function()
    {
        DevToolsAPI.sendMessageToEmbedder("inspectElementCompleted", [], null);
    },

    /**
     * @param {string} origin
     * @param {string} script
     */
    setInjectedScriptForOrigin: function(origin, script)
    {
        DevToolsHost.setInjectedScriptForOrigin(origin, script);
    },

    /**
     * @param {string} url
     */
    inspectedURLChanged: function(url)
    {
        DevToolsAPI.sendMessageToEmbedder("inspectedURLChanged", [url], null);
    },

    /**
     * @param {string} text
     */
    copyText: function(text)
    {
        DevToolsHost.copyText(text);
    },

    /**
     * @param {string} url
     */
    openInNewTab: function(url)
    {
        DevToolsAPI.sendMessageToEmbedder("openInNewTab", [url], null);
    },

    /**
     * @param {string} url
     * @param {string} content
     * @param {boolean} forceSaveAs
     */
    save: function(url, content, forceSaveAs)
    {
        DevToolsAPI.sendMessageToEmbedder("save", [url, content, forceSaveAs], null);
    },

    /**
     * @param {string} url
     * @param {string} content
     */
    append: function(url, content)
    {
        DevToolsAPI.sendMessageToEmbedder("append", [url, content], null);
    },

    /**
     * @param {string} message
     */
    sendMessageToBackend: function(message)
    {
        DevToolsHost.sendMessageToBackend(message);
    },

    /**
     * @param {number} actionCode
     */
    recordActionTaken: function(actionCode)
    {
        DevToolsAPI.sendMessageToEmbedder("recordActionUMA", ["DevTools.ActionTaken", actionCode], null);
    },

    /**
     * @param {number} panelCode
     */
    recordPanelShown: function(panelCode)
    {
        DevToolsAPI.sendMessageToEmbedder("recordActionUMA", ["DevTools.PanelShown", panelCode], null);
    },

    requestFileSystems: function()
    {
        DevToolsAPI.sendMessageToEmbedder("requestFileSystems", [], null);
    },

    addFileSystem: function()
    {
        DevToolsAPI.sendMessageToEmbedder("addFileSystem", [], null);
    },

    /**
     * @param {string} fileSystemPath
     */
    removeFileSystem: function(fileSystemPath)
    {
        DevToolsAPI.sendMessageToEmbedder("removeFileSystem", [fileSystemPath], null);
    },

    /**
     * @param {string} fileSystemId
     * @param {string} registeredName
     * @return {?DOMFileSystem}
     */
    isolatedFileSystem: function(fileSystemId, registeredName)
    {
        return DevToolsHost.isolatedFileSystem(fileSystemId, registeredName);
    },

    /**
     * @param {!FileSystem} fileSystem
     */
    upgradeDraggedFileSystemPermissions: function(fileSystem)
    {
        DevToolsHost.upgradeDraggedFileSystemPermissions(fileSystem);
    },

    /**
     * @param {number} requestId
     * @param {string} fileSystemPath
     */
    indexPath: function(requestId, fileSystemPath)
    {
        DevToolsAPI.sendMessageToEmbedder("indexPath", [requestId, fileSystemPath], null);
    },

    /**
     * @param {number} requestId
     */
    stopIndexing: function(requestId)
    {
        DevToolsAPI.sendMessageToEmbedder("stopIndexing", [requestId], null);
    },

    /**
     * @param {number} requestId
     * @param {string} fileSystemPath
     * @param {string} query
     */
    searchInPath: function(requestId, fileSystemPath, query)
    {
        DevToolsAPI.sendMessageToEmbedder("searchInPath", [requestId, fileSystemPath, query], null);
    },

    /**
     * @return {number}
     */
    zoomFactor: function()
    {
        return DevToolsHost.zoomFactor();
    },

    zoomIn: function()
    {
        DevToolsAPI.sendMessageToEmbedder("zoomIn", [], null);
    },

    zoomOut: function()
    {
        DevToolsAPI.sendMessageToEmbedder("zoomOut", [], null);
    },

    resetZoom: function()
    {
        DevToolsAPI.sendMessageToEmbedder("resetZoom", [], null);
    },

    /**
     * @param {string} shortcuts
     */
    setWhitelistedShortcuts: function(shortcuts)
    {
        DevToolsAPI.sendMessageToEmbedder("setWhitelistedShortcuts", [shortcuts], null);
    },

    /**
     * @return {boolean}
     */
    isUnderTest: function()
    {
        return DevToolsHost.isUnderTest();
    },

    /**
     * @param {string} browserId
     * @param {string} url
     */
    openUrlOnRemoteDeviceAndInspect: function(browserId, url)
    {
        DevToolsAPI.sendMessageToEmbedder("openUrlOnRemoteDeviceAndInspect", [browserId, url], null);
    },

    /**
     * @param {boolean} enabled
     */
    setDeviceCountUpdatesEnabled: function(enabled)
    {
        DevToolsAPI.sendMessageToEmbedder("setDeviceCountUpdatesEnabled", [enabled], null);
    },

    /**
     * @param {boolean} enabled
     */
    setDevicesUpdatesEnabled: function(enabled)
    {
        DevToolsAPI.sendMessageToEmbedder("setDevicesUpdatesEnabled", [enabled], null);
    },

    /**
     * @param {number} x
     * @param {number} y
     * @param {!Array.<!InspectorFrontendHostAPI.ContextMenuDescriptor>} items
     * @param {!Document} document
     */
    showContextMenuAtPoint: function(x, y, items, document)
    {
        DevToolsHost.showContextMenuAtPoint(x, y, items, document);
    },

    /**
     * @return {boolean}
     */
    isHostedMode: function()
    {
        return DevToolsHost.isHostedMode();
    },

    /**
     * Support for legacy front-ends (<M41).
     * @return {string}
     */
    port: function()
    {
        return "unknown";
    },

    /**
     * Support for legacy front-ends (<M34).
     * @param {string} dockSide
     */
    requestSetDockSide: function(dockSide)
    {
        DevToolsAPI.sendMessageToEmbedder("setIsDocked", [dockSide !== "undocked"], null);
    },

    /**
     * Support for legacy front-ends (<M34).
     * @return {boolean}
     */
    supportsFileSystems: function()
    {
        return true;
    },

    /**
     * Support for legacy front-ends (<M28).
     * @return {boolean}
     */
    canInspectWorkers: function()
    {
        return true;
    },

    /**
     * Support for legacy front-ends (<M28).
     * @return {boolean}
     */
    canSaveAs: function()
    {
        return true;
    },

    /**
     * Support for legacy front-ends (<M28).
     * @return {boolean}
     */
    canSave: function()
    {
        return true;
    },

    /**
     * Support for legacy front-ends (<M28).
     */
    loaded: function()
    {
    },

    /**
     * Support for legacy front-ends (<M28).
     * @return {string}
     */
    hiddenPanels: function()
    {
        return "";
    },

    /**
     * Support for legacy front-ends (<M28).
     * @return {string}
     */
    localizedStringsURL: function()
    {
        return "";
    },

    /**
     * Support for legacy front-ends (<M28).
     * @param {string} url
     */
    close: function(url)
    {
    }
}
