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

/**
 * @constructor
 * @extends {WebInspector.Object}
 */
WebInspector.ResourceTreeModel = function(networkManager)
{
    WebInspector.networkManager.addEventListener(WebInspector.NetworkManager.EventTypes.ResourceStarted, this._onResourceStarted, this);
    WebInspector.networkManager.addEventListener(WebInspector.NetworkManager.EventTypes.ResourceUpdated, this._onResourceUpdated, this);
    WebInspector.networkManager.addEventListener(WebInspector.NetworkManager.EventTypes.ResourceFinished, this._onResourceUpdated, this);

    WebInspector.console.addEventListener(WebInspector.ConsoleModel.Events.MessageAdded, this._consoleMessageAdded, this);
    WebInspector.console.addEventListener(WebInspector.ConsoleModel.Events.RepeatCountUpdated, this._consoleMessageAdded, this);
    WebInspector.console.addEventListener(WebInspector.ConsoleModel.Events.ConsoleCleared, this._consoleCleared, this);

    this.frontendReused();
    InspectorBackend.registerPageDispatcher(new WebInspector.PageDispatcher(this));

    this._pendingConsoleMessages = {};
}

WebInspector.ResourceTreeModel.EventTypes = {
    FrameAdded: "FrameAdded",
    FrameNavigated: "FrameNavigated",
    FrameDetached: "FrameDetached",
    ResourceAdded: "ResourceAdded",
    WillLoadCachedResources: "WillLoadCachedResources",
    CachedResourcesLoaded: "CachedResourcesLoaded",
    DOMContentLoaded: "DOMContentLoaded",
    OnLoad: "OnLoad",
    InspectedURLChanged: "InspectedURLChanged"
}

WebInspector.ResourceTreeModel.prototype = {
    frontendReused: function()
    {
        this._resourcesByURL = {};
        this._resourcesByFrameId = {};
        this._subframes = {};
        this._frameIds = {};
        delete this._cachedResourcesProcessed;
        PageAgent.getResourceTree(this._processCachedResources.bind(this));
    },

    _processCachedResources: function(error, mainFramePayload)
    {
        if (error) {
            console.error(JSON.stringify(error));
            return;
        }

        this.dispatchEventToListeners(WebInspector.ResourceTreeModel.EventTypes.WillLoadCachedResources);
        this._addFramesRecursively(mainFramePayload);
        this._dispatchInspectedURLChanged(WebInspector.mainResource.url);
        this.dispatchEventToListeners(WebInspector.ResourceTreeModel.EventTypes.CachedResourcesLoaded);
        WebInspector.Resource.restoreRevisions();

        this._cachedResourcesProcessed = true;
    },

    _dispatchInspectedURLChanged: function(url)
    {
        InspectorFrontendHost.inspectedURLChanged(url);
        this.dispatchEventToListeners(WebInspector.ResourceTreeModel.EventTypes.InspectedURLChanged, url);
    },

    _addFrame: function(frame)
    {
        frame.parentId = frame.parentId || "";
        this._frameIds[frame.id] = frame;
        var subframes = this._subframes[frame.parentId];
        if (!subframes) {
            subframes = [];
            this._subframes[frame.parentId] = subframes;
        }

        subframes.push(frame);
        this.dispatchEventToListeners(WebInspector.ResourceTreeModel.EventTypes.FrameAdded, frame);
    },

    subframes: function(parentFrameId)
    {
        return this._subframes[parentFrameId] || [];
    },

    resources: function(frameId)
    {
        var result = [];
        var resources = this._resourcesByFrameId[frameId] || {};
        for (var url in resources)
            result.push(resources[url]);
        return result;
    },

    _frameNavigated: function(frame, loaderId)
    {
        var isMainFrame = !frame.parentId;

        if (isMainFrame) {
            this._cleanupFramesAfterNavigation(frame);
            if (this.resourceForURL(frame.url))
                WebInspector.mainResource = this.resourceForURL(frame.url);
        }
        // Do nothing unless cached resource tree is processed - it will overwrite everything.
        if (!this._cachedResourcesProcessed)
            return;

        // Add frame in case it is seen for the first time, otherwise, do a within-frame cleanup.
        if (!this._frameIds[frame.id])
            this._addFrame(frame);
        else {
            this._clearChildFramesAndResources(frame.id, loaderId);
            frame.parentId = frame.parentId || "";
            this._frameIds[frame.id] = frame;
        }
        // Dispatch frame navigated event to clients prior to filling it with the resources.
        this.dispatchEventToListeners(WebInspector.ResourceTreeModel.EventTypes.FrameNavigated, { frame: frame, loaderId: loaderId, isMainFrame: isMainFrame });

        // Fill frame with retained resources (the ones loaded using new loader).
        var resourcesForFrame = this._resourcesByFrameId[frame.id];
        if (resourcesForFrame) {
            for (var url in resourcesForFrame)
                this.dispatchEventToListeners(WebInspector.ResourceTreeModel.EventTypes.ResourceAdded, resourcesForFrame[url]);
        }

        if (isMainFrame)
            this._dispatchInspectedURLChanged(frame.url);
    },

    _cleanupFramesAfterNavigation: function(newMainFrame)
    {
        if (this._currentMainFrameId)
            this._frameDetached(this._currentMainFrameId);
        this._currentMainFrameId = newMainFrame.id;
    },

    _frameDetached: function(frameId)
    {
        // Do nothing unless cached resource tree is processed - it will overwrite everything.
        if (!this._cachedResourcesProcessed)
            return;

        this._clearChildFramesAndResources(frameId, "");
        var frame = this._frameIds[frameId];

        if (frame) {
            var siblings = this._subframes[frame.parentId];
            if (siblings)
                siblings.remove(frame);
            delete this._frameIds[frameId];
        }

        this.dispatchEventToListeners(WebInspector.ResourceTreeModel.EventTypes.FrameDetached, frameId);
    },

    _onResourceStarted: function(event)
    {
        if (!this._cachedResourcesProcessed)
            return;
        this._bindResourceURL(event.data);
    },

    _onResourceUpdated: function(event)
    {
        if (!this._cachedResourcesProcessed)
            return;

        var resource = event.data;
        if (resource.failed) {
            this._unbindResourceURL(resource);
            return;
        }

        if (resource.type === WebInspector.Resource.Type.XHR) {
            this._unbindResourceURL(resource);
            return;
        }

        if (resource.finished)
            this._addResourceToFrame(resource);
    },

    _addResourceToFrame: function(resource)
    {
        var frameId = resource.frameId;
        var resourcesForFrame = this._resourcesByFrameId[frameId];
        if (!resourcesForFrame) {
            resourcesForFrame = {};
            this._resourcesByFrameId[frameId] = resourcesForFrame;
        }
        if (resourcesForFrame[resource.url] === resource) {
            // Already in the tree, we just got an extra update.
            return;
        }

        resourcesForFrame[resource.url] = resource;
        this._bindResourceURL(resource);
        this.dispatchEventToListeners(WebInspector.ResourceTreeModel.EventTypes.ResourceAdded, resource);
    },

    forAllResources: function(callback)
    {
        return this._callForFrameResources("", callback);
    },

    _consoleMessageAdded: function(event)
    {
        var msg = event.data;
        var resource = this.resourceForURL(msg.url);
        if (resource)
            this._addConsoleMessageToResource(msg, resource);
        else
            this._addPendingConsoleMessage(msg);
    },

    _addPendingConsoleMessage: function(msg)
    {
        if (!msg.url)
            return;
        if (!this._pendingConsoleMessages[msg.url])
            this._pendingConsoleMessages[msg.url] = [];
        this._pendingConsoleMessages[msg.url].push(msg);
    },

    _addPendingConsoleMessagesToResource: function(resource)
    {
        var messages = this._pendingConsoleMessages[resource.url];
        if (messages) {
            for (var i = 0; i < messages.length; i++)
                this._addConsoleMessageToResource(messages[i], resource);
            delete this._pendingConsoleMessages[resource.url];
        }
    },

    _addConsoleMessageToResource: function(msg, resource)
    {
        switch (msg.level) {
        case WebInspector.ConsoleMessage.MessageLevel.Warning:
            resource.warnings += msg.repeatDelta;
            break;
        case WebInspector.ConsoleMessage.MessageLevel.Error:
            resource.errors += msg.repeatDelta;
            break;
        }
        resource.addMessage(msg);
    },

    _consoleCleared: function()
    {
        function callback(resource)
        {
            resource.clearErrorsAndWarnings();
        }

        this._pendingConsoleMessages = {};
        this.forAllResources(callback);
    },

    resourceForURL: function(url)
    {
        return this._resourcesByURL[url];
    },

    _bindResourceURL: function(resource)
    {
        this._resourcesByURL[resource.url] = resource;

        this._addPendingConsoleMessagesToResource(resource);
    },

    _clearChildFramesAndResources: function(frameId, loaderToPreserveId)
    {
        this._clearResources(frameId, loaderToPreserveId);
        var subframes = this._subframes[frameId];
        for (var i = 0; subframes && i < subframes.length; ++ i) {
            this.dispatchEventToListeners(WebInspector.ResourceTreeModel.EventTypes.FrameDetached, subframes[i].id);
            this._clearChildFramesAndResources(subframes[i].id, loaderToPreserveId);
        }
        delete this._subframes[frameId];
    },

    _clearResources: function(frameId, loaderToPreserveId)
    {
        var resourcesForFrame = this._resourcesByFrameId[frameId];
        if (!resourcesForFrame)
            return;

        var preservedResourcesForFrame = [];
        for (var url in resourcesForFrame) {
            var resource = resourcesForFrame[url];
            if (resource.loaderId === loaderToPreserveId) {
                preservedResourcesForFrame[url] = resource;
                continue;
            }
            this._unbindResourceURL(resource);
        }

        delete this._resourcesByFrameId[frameId];
        if (preservedResourcesForFrame.length) {
            this._resourcesByFrameId[frameId] = preservedResourcesForFrame;
        }
    },

    _callForFrameResources: function(frameId, callback)
    {
        var resources = this._resourcesByFrameId[frameId];

        for (var url in resources) {
            if (callback(resources[url]))
                return true;
        }

        var frames = this._subframes[frameId];
        for (var i = 0; frames && i < frames.length; ++i) {
            if (this._callForFrameResources(frames[i].id, callback))
                return true;
        }
        return false;
    },

    _unbindResourceURL: function(resource)
    {
        delete this._resourcesByURL[resource.url];
    },

    _addFramesRecursively: function(frameTreePayload)
    {
        var framePayload = frameTreePayload.frame;

        // Create frame resource.
        var frameResource = this._createResource(framePayload, framePayload.url);
        frameResource.type = WebInspector.Resource.Type.Document;
        frameResource.finished = true;

        if (!framePayload.parentId) {
            WebInspector.mainResource = frameResource;
            this._currentMainFrameId = framePayload.id;
        }
        this._addFrame(framePayload);
        this._addResourceToFrame(frameResource);

        for (var i = 0; frameTreePayload.childFrames && i < frameTreePayload.childFrames.length; ++i)
            this._addFramesRecursively(frameTreePayload.childFrames[i]);

        if (!frameTreePayload.resources)
            return;

        // Create frame subresources.
        for (var i = 0; i < frameTreePayload.resources.length; ++i) {
            var subresource = frameTreePayload.resources[i];
            var resource = this._createResource(framePayload, subresource.url);
            resource.type = WebInspector.Resource.Type[subresource.type];
            resource.mimeType = subresource.mimeType;
            resource.finished = true;
            this._addResourceToFrame(resource);
        }
    },

    _createResource: function(frame, url)
    {
        var resource = new WebInspector.Resource(null, url, frame.loaderId);
        resource.frameId = frame.id;
        resource.documentURL = frame.url;
        resource.mimeType = frame.mimeType;
        return resource;
    }
}

WebInspector.ResourceTreeModel.prototype.__proto__ = WebInspector.Object.prototype;

/**
 * @constructor
 * @implements {PageAgent.Dispatcher}
 */
WebInspector.PageDispatcher = function(resourceTreeModel)
{
    this._resourceTreeModel = resourceTreeModel;
}

WebInspector.PageDispatcher.prototype = {
    domContentEventFired: function(time)
    {
        this._resourceTreeModel.dispatchEventToListeners(WebInspector.ResourceTreeModel.EventTypes.DOMContentLoaded, time);

        // FIXME: the only client is HAR, fix it there.
        WebInspector.mainResourceDOMContentTime = time;
    },

    loadEventFired: function(time)
    {
        this._resourceTreeModel.dispatchEventToListeners(WebInspector.ResourceTreeModel.EventTypes.OnLoad, time);

        // FIXME: the only client is HAR, fix it there.
        WebInspector.mainResourceLoadTime = time;
    },

    frameNavigated: function(frame, loaderId)
    {
        this._resourceTreeModel._frameNavigated(frame, loaderId);
    },

    frameDetached: function(frameId)
    {
        this._resourceTreeModel._frameDetached(frameId);
    }
}
