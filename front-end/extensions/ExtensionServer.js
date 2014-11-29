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
 * @suppressGlobalPropertiesCheck
 */
WebInspector.ExtensionServer = function()
{
    this._clientObjects = {};
    this._handlers = {};
    this._subscribers = {};
    this._subscriptionStartHandlers = {};
    this._subscriptionStopHandlers = {};
    this._extraHeaders = {};
    this._requests = {};
    this._lastRequestId = 0;
    this._registeredExtensions = {};
    this._status = new WebInspector.ExtensionStatus();
    /** @type {!Array.<!WebInspector.ExtensionSidebarPane>} */
    this._sidebarPanes = [];
    /** @type {!Array.<!WebInspector.ExtensionAuditCategory>} */
    this._auditCategories = [];

    var commands = WebInspector.extensionAPI.Commands;

    this._registerHandler(commands.AddAuditCategory, this._onAddAuditCategory.bind(this));
    this._registerHandler(commands.AddAuditResult, this._onAddAuditResult.bind(this));
    this._registerHandler(commands.AddConsoleMessage, this._onAddConsoleMessage.bind(this));
    this._registerHandler(commands.AddRequestHeaders, this._onAddRequestHeaders.bind(this));
    this._registerHandler(commands.ApplyStyleSheet, this._onApplyStyleSheet.bind(this));
    this._registerHandler(commands.CreatePanel, this._onCreatePanel.bind(this));
    this._registerHandler(commands.CreateSidebarPane, this._onCreateSidebarPane.bind(this));
    this._registerHandler(commands.CreateStatusBarButton, this._onCreateStatusBarButton.bind(this));
    this._registerHandler(commands.EvaluateOnInspectedPage, this._onEvaluateOnInspectedPage.bind(this));
    this._registerHandler(commands.ForwardKeyboardEvent, this._onForwardKeyboardEvent.bind(this));
    this._registerHandler(commands.GetHAR, this._onGetHAR.bind(this));
    this._registerHandler(commands.GetConsoleMessages, this._onGetConsoleMessages.bind(this));
    this._registerHandler(commands.GetPageResources, this._onGetPageResources.bind(this));
    this._registerHandler(commands.GetRequestContent, this._onGetRequestContent.bind(this));
    this._registerHandler(commands.GetResourceContent, this._onGetResourceContent.bind(this));
    this._registerHandler(commands.Reload, this._onReload.bind(this));
    this._registerHandler(commands.SetOpenResourceHandler, this._onSetOpenResourceHandler.bind(this));
    this._registerHandler(commands.SetResourceContent, this._onSetResourceContent.bind(this));
    this._registerHandler(commands.SetSidebarHeight, this._onSetSidebarHeight.bind(this));
    this._registerHandler(commands.SetSidebarContent, this._onSetSidebarContent.bind(this));
    this._registerHandler(commands.SetSidebarPage, this._onSetSidebarPage.bind(this));
    this._registerHandler(commands.ShowPanel, this._onShowPanel.bind(this));
    this._registerHandler(commands.StopAuditCategoryRun, this._onStopAuditCategoryRun.bind(this));
    this._registerHandler(commands.Subscribe, this._onSubscribe.bind(this));
    this._registerHandler(commands.OpenResource, this._onOpenResource.bind(this));
    this._registerHandler(commands.Unsubscribe, this._onUnsubscribe.bind(this));
    this._registerHandler(commands.UpdateButton, this._onUpdateButton.bind(this));
    this._registerHandler(commands.UpdateAuditProgress, this._onUpdateAuditProgress.bind(this));
    window.addEventListener("message", this._onWindowMessage.bind(this), false);  // Only for main window.

    InspectorFrontendHost.events.addEventListener(InspectorFrontendHostAPI.Events.AddExtensions, this._addExtensions, this);
    InspectorFrontendHost.events.addEventListener(InspectorFrontendHostAPI.Events.SetInspectedTabId, this._setInspectedTabId, this);

    this._initExtensions();
}

WebInspector.ExtensionServer.Events = {
    SidebarPaneAdded: "SidebarPaneAdded",
    AuditCategoryAdded: "AuditCategoryAdded"
}

WebInspector.ExtensionServer.prototype = {
    initializeExtensions: function()
    {
        this._initializeCommandIssued = true;
        if (this._pendingExtensionInfos) {
            this._pendingExtensionInfos.forEach(this._addExtension, this);
            delete this._pendingExtensionInfos;
        }
    },

    /**
     * @return {boolean}
     */
    hasExtensions: function()
    {
        return !!Object.keys(this._registeredExtensions).length;
    },

    /**
     * @param {string} panelId
     * @param {string} action
     * @param {string=} searchString
     */
    notifySearchAction: function(panelId, action, searchString)
    {
        this._postNotification(WebInspector.extensionAPI.Events.PanelSearch + panelId, action, searchString);
    },

    /**
     * @param {string} identifier
     * @param {number=} frameIndex
     */
    notifyViewShown: function(identifier, frameIndex)
    {
        this._postNotification(WebInspector.extensionAPI.Events.ViewShown + identifier, frameIndex);
    },

    /**
     * @param {string} identifier
     */
    notifyViewHidden: function(identifier)
    {
        this._postNotification(WebInspector.extensionAPI.Events.ViewHidden + identifier);
    },

    /**
     * @param {string} identifier
     */
    notifyButtonClicked: function(identifier)
    {
        this._postNotification(WebInspector.extensionAPI.Events.ButtonClicked + identifier);
    },

    _inspectedURLChanged: function(event)
    {
        this._requests = {};
        var url = event.data;
        this._postNotification(WebInspector.extensionAPI.Events.InspectedURLChanged, url);
    },


    /**
     * @param {string} categoryId
     * @param {!WebInspector.ExtensionAuditCategoryResults} auditResults
     */
    startAuditRun: function(categoryId, auditResults)
    {
        this._clientObjects[auditResults.id()] = auditResults;
        this._postNotification("audit-started-" + categoryId, auditResults.id());
    },

    /**
     * @param {!WebInspector.ExtensionAuditCategoryResults} auditResults
     */
    stopAuditRun: function(auditResults)
    {
        delete this._clientObjects[auditResults.id()];
    },

    /**
     * @param {string} type
     * @return {boolean}
     */
    hasSubscribers: function(type)
    {
        return !!this._subscribers[type];
    },

    /**
     * @param {string} type
     * @param {...*} vararg
     */
    _postNotification: function(type, vararg)
    {
        var subscribers = this._subscribers[type];
        if (!subscribers)
            return;
        var message = {
            command: "notify-" + type,
            arguments: Array.prototype.slice.call(arguments, 1)
        };
        for (var i = 0; i < subscribers.length; ++i)
            subscribers[i].postMessage(message);
    },

    _onSubscribe: function(message, port)
    {
        var subscribers = this._subscribers[message.type];
        if (subscribers)
            subscribers.push(port);
        else {
            this._subscribers[message.type] = [ port ];
            if (this._subscriptionStartHandlers[message.type])
                this._subscriptionStartHandlers[message.type]();
        }
    },

    _onUnsubscribe: function(message, port)
    {
        var subscribers = this._subscribers[message.type];
        if (!subscribers)
            return;
        subscribers.remove(port);
        if (!subscribers.length) {
            delete this._subscribers[message.type];
            if (this._subscriptionStopHandlers[message.type])
                this._subscriptionStopHandlers[message.type]();
        }
    },

    _onAddRequestHeaders: function(message)
    {
        var id = message.extensionId;
        if (typeof id !== "string")
            return this._status.E_BADARGTYPE("extensionId", typeof id, "string");
        var extensionHeaders = this._extraHeaders[id];
        if (!extensionHeaders) {
            extensionHeaders = {};
            this._extraHeaders[id] = extensionHeaders;
        }
        for (var name in message.headers)
            extensionHeaders[name] = message.headers[name];
        var allHeaders = /** @type {!NetworkAgent.Headers} */ ({});
        for (var extension in this._extraHeaders) {
            var headers = this._extraHeaders[extension];
            for (name in headers) {
                if (typeof headers[name] === "string")
                    allHeaders[name] = headers[name];
            }
        }
        NetworkAgent.setExtraHTTPHeaders(allHeaders);
    },

    /**
     * @param {*} message
     * @suppressGlobalPropertiesCheck
     */
    _onApplyStyleSheet: function(message)
    {
        if (!Runtime.experiments.isEnabled("applyCustomStylesheet"))
            return;
        var styleSheet = createElement("style");
        styleSheet.textContent = message.styleSheet;
        document.head.appendChild(styleSheet);
    },

    _onCreatePanel: function(message, port)
    {
        var id = message.id;
        // The ids are generated on the client API side and must be unique, so the check below
        // shouldn't be hit unless someone is bypassing the API.
        if (id in this._clientObjects || WebInspector.inspectorView.hasPanel(id))
            return this._status.E_EXISTS(id);

        var page = this._expandResourcePath(port._extensionOrigin, message.page);
        var panelDescriptor = new WebInspector.ExtensionServerPanelDescriptor(id, message.title, new WebInspector.ExtensionPanel(this, id, page));
        this._clientObjects[id] = panelDescriptor;
        WebInspector.inspectorView.addPanel(panelDescriptor);
        return this._status.OK();
    },

    _onShowPanel: function(message)
    {
        WebInspector.inspectorView.showPanel(message.id).done();
    },

    _onCreateStatusBarButton: function(message, port)
    {
        var panelDescriptor = this._clientObjects[message.panel];
        if (!panelDescriptor || !(panelDescriptor instanceof WebInspector.ExtensionServerPanelDescriptor))
            return this._status.E_NOTFOUND(message.panel);
        var button = new WebInspector.ExtensionButton(this, message.id, this._expandResourcePath(port._extensionOrigin, message.icon), message.tooltip, message.disabled);
        this._clientObjects[message.id] = button;

        panelDescriptor.panel().then(appendButton).done();

        /**
         * @param {!WebInspector.Panel} panel
         */
        function appendButton(panel)
        {
            /** @type {!WebInspector.ExtensionPanel} panel*/ (panel).addStatusBarItem(button.statusBarButton());
        }

        return this._status.OK();
    },

    _onUpdateButton: function(message, port)
    {
        var button = this._clientObjects[message.id];
        if (!button || !(button instanceof WebInspector.ExtensionButton))
            return this._status.E_NOTFOUND(message.id);
        button.update(this._expandResourcePath(port._extensionOrigin, message.icon), message.tooltip, message.disabled);
        return this._status.OK();
    },

    _onCreateSidebarPane: function(message)
    {
        if (message.panel !== "elements" && message.panel !== "sources")
            return this._status.E_NOTFOUND(message.panel);
        var id = message.id;
        var sidebar = new WebInspector.ExtensionSidebarPane(this, message.panel, message.title, id);
        this._sidebarPanes.push(sidebar);
        this._clientObjects[id] = sidebar;
        this.dispatchEventToListeners(WebInspector.ExtensionServer.Events.SidebarPaneAdded, sidebar);

        return this._status.OK();
    },

    /**
     * @return {!Array.<!WebInspector.ExtensionSidebarPane>}
     */
    sidebarPanes: function()
    {
        return this._sidebarPanes;
    },

    _onSetSidebarHeight: function(message)
    {
        var sidebar = this._clientObjects[message.id];
        if (!sidebar)
            return this._status.E_NOTFOUND(message.id);
        sidebar.setHeight(message.height);
        return this._status.OK();
    },

    _onSetSidebarContent: function(message, port)
    {
        var sidebar = this._clientObjects[message.id];
        if (!sidebar)
            return this._status.E_NOTFOUND(message.id);

        /**
         * @this {WebInspector.ExtensionServer}
         */
        function callback(error)
        {
            var result = error ? this._status.E_FAILED(error) : this._status.OK();
            this._dispatchCallback(message.requestId, port, result);
        }
        if (message.evaluateOnPage)
            return sidebar.setExpression(message.expression, message.rootTitle, message.evaluateOptions, port._extensionOrigin, callback.bind(this));
        sidebar.setObject(message.expression, message.rootTitle, callback.bind(this));
    },

    _onSetSidebarPage: function(message, port)
    {
        var sidebar = this._clientObjects[message.id];
        if (!sidebar)
            return this._status.E_NOTFOUND(message.id);
        sidebar.setPage(this._expandResourcePath(port._extensionOrigin, message.page));
    },

    _onOpenResource: function(message)
    {
        var uiSourceCode = WebInspector.workspace.uiSourceCodeForURL(message.url);
        if (uiSourceCode) {
            WebInspector.Revealer.reveal(uiSourceCode.uiLocation(message.lineNumber, 0));
            return this._status.OK();
        }

        var resource = WebInspector.resourceForURL(message.url);
        if (resource) {
            WebInspector.Revealer.reveal(resource, message.lineNumber);
            return this._status.OK();
        }

        var request = WebInspector.networkLog.requestForURL(message.url);
        if (request) {
            WebInspector.Revealer.reveal(request);
            return this._status.OK();
        }

        return this._status.E_NOTFOUND(message.url);
    },

    _onSetOpenResourceHandler: function(message, port)
    {
        var name = this._registeredExtensions[port._extensionOrigin].name || ("Extension " + port._extensionOrigin);
        if (message.handlerPresent)
            WebInspector.openAnchorLocationRegistry.registerHandler(name, this._handleOpenURL.bind(this, port));
        else
            WebInspector.openAnchorLocationRegistry.unregisterHandler(name);
    },

    _handleOpenURL: function(port, details)
    {
        var url = /** @type {string} */ (details.url);
        var contentProvider = WebInspector.workspace.uiSourceCodeForOriginURL(url) || WebInspector.resourceForURL(url);
        if (!contentProvider)
            return false;

        var lineNumber = details.lineNumber;
        if (typeof lineNumber === "number")
            lineNumber += 1;
        port.postMessage({
            command: "open-resource",
            resource: this._makeResource(contentProvider),
            lineNumber: lineNumber
        });
        return true;
    },

    _onReload: function(message)
    {
        var options = /** @type {!ExtensionReloadOptions} */ (message.options || {});
        NetworkAgent.setUserAgentOverride(typeof options.userAgent === "string" ? options.userAgent : "");
        var injectedScript;
        if (options.injectedScript)
            injectedScript = "(function(){" + options.injectedScript + "})()";
        var preprocessingScript = options.preprocessingScript;
        WebInspector.resourceTreeModel.reloadPage(!!options.ignoreCache, injectedScript, preprocessingScript);
        return this._status.OK();
    },

    _onEvaluateOnInspectedPage: function(message, port)
    {
        /**
         * @param {?Protocol.Error} error
         * @param {?RuntimeAgent.RemoteObject} resultPayload
         * @param {boolean=} wasThrown
         * @this {WebInspector.ExtensionServer}
         */
        function callback(error, resultPayload, wasThrown)
        {
            var result;
            if (error || !resultPayload)
                result = this._status.E_PROTOCOLERROR(error.toString());
            else if (wasThrown)
                result = { isException: true, value: resultPayload.description };
            else
                result = { value: resultPayload.value };

            this._dispatchCallback(message.requestId, port, result);
        }
        return this.evaluate(message.expression, true, true, message.evaluateOptions, port._extensionOrigin, callback.bind(this));
    },

    _onGetConsoleMessages: function()
    {
        return WebInspector.multitargetConsoleModel.messages().map(this._makeConsoleMessage);
    },

    _onAddConsoleMessage: function(message)
    {
        function convertSeverity(level)
        {
            switch (level) {
                case WebInspector.extensionAPI.console.Severity.Log:
                    return WebInspector.ConsoleMessage.MessageLevel.Log;
                case WebInspector.extensionAPI.console.Severity.Warning:
                    return WebInspector.ConsoleMessage.MessageLevel.Warning;
                case WebInspector.extensionAPI.console.Severity.Error:
                    return WebInspector.ConsoleMessage.MessageLevel.Error;
                case WebInspector.extensionAPI.console.Severity.Debug:
                    return WebInspector.ConsoleMessage.MessageLevel.Debug;
            }
        }
        var level = convertSeverity(message.severity);
        if (!level)
            return this._status.E_BADARG("message.severity", message.severity);

        var mainTarget = WebInspector.targetManager.mainTarget();
        var consoleMessage = new WebInspector.ConsoleMessage(
            mainTarget,
            WebInspector.ConsoleMessage.MessageSource.JS,
            level,
            message.text,
            WebInspector.ConsoleMessage.MessageType.Log,
            message.url,
            message.line);
        mainTarget.consoleModel.addMessage(consoleMessage);
    },

    _makeConsoleMessage: function(message)
    {
        function convertLevel(level)
        {
            if (!level)
                return;
            switch (level) {
                case WebInspector.ConsoleMessage.MessageLevel.Log:
                    return WebInspector.extensionAPI.console.Severity.Log;
                case WebInspector.ConsoleMessage.MessageLevel.Warning:
                    return WebInspector.extensionAPI.console.Severity.Warning;
                case WebInspector.ConsoleMessage.MessageLevel.Error:
                    return WebInspector.extensionAPI.console.Severity.Error;
                case WebInspector.ConsoleMessage.MessageLevel.Debug:
                    return WebInspector.extensionAPI.console.Severity.Debug;
                default:
                    return WebInspector.extensionAPI.console.Severity.Log;
            }
        }
        var result = {
            severity: convertLevel(message.level),
            text: message.messageText,
        };
        if (message.url)
            result.url = message.url;
        if (message.line)
            result.line = message.line;
        return result;
    },

    _onGetHAR: function()
    {
        var requests = WebInspector.networkLog.requests;
        var harLog = (new WebInspector.HARLog(requests)).build();
        for (var i = 0; i < harLog.entries.length; ++i)
            harLog.entries[i]._requestId = this._requestId(requests[i]);
        return harLog;
    },

    /**
     * @param {!WebInspector.ContentProvider} contentProvider
     */
    _makeResource: function(contentProvider)
    {
        return {
            url: contentProvider.contentURL(),
            type: contentProvider.contentType().name()
        };
    },

    /**
     * @return {!Array.<!WebInspector.ContentProvider>}
     */
    _onGetPageResources: function()
    {
        var resources = {};

        /**
         * @this {WebInspector.ExtensionServer}
         */
        function pushResourceData(contentProvider)
        {
            if (!resources[contentProvider.contentURL()])
                resources[contentProvider.contentURL()] = this._makeResource(contentProvider);
        }
        var uiSourceCodes = WebInspector.workspace.uiSourceCodesForProjectType(WebInspector.projectTypes.Network);
        uiSourceCodes = uiSourceCodes.concat(WebInspector.workspace.uiSourceCodesForProjectType(WebInspector.projectTypes.ContentScripts));
        uiSourceCodes.forEach(pushResourceData.bind(this));
        WebInspector.resourceTreeModel.forAllResources(pushResourceData.bind(this));
        return Object.values(resources);
    },

    /**
     * @param {!WebInspector.ContentProvider} contentProvider
     * @param {!Object} message
     * @param {!MessagePort} port
     */
    _getResourceContent: function(contentProvider, message, port)
    {
        /**
         * @param {?string} content
         * @this {WebInspector.ExtensionServer}
         */
        function onContentAvailable(content)
        {
            var contentEncoded = false;
            if (contentProvider instanceof WebInspector.Resource)
                contentEncoded = contentProvider.contentEncoded;
            if (contentProvider instanceof WebInspector.NetworkRequest)
                contentEncoded = contentProvider.contentEncoded;
            var response = {
                encoding: contentEncoded && content ? "base64" : "",
                content: content
            };
            this._dispatchCallback(message.requestId, port, response);
        }

        contentProvider.requestContent(onContentAvailable.bind(this));
    },

    _onGetRequestContent: function(message, port)
    {
        var request = this._requestById(message.id);
        if (!request)
            return this._status.E_NOTFOUND(message.id);
        this._getResourceContent(request, message, port);
    },

    _onGetResourceContent: function(message, port)
    {
        var url = /** @type {string} */ (message.url);
        var contentProvider = WebInspector.workspace.uiSourceCodeForOriginURL(url) || WebInspector.resourceForURL(url);
        if (!contentProvider)
            return this._status.E_NOTFOUND(url);
        this._getResourceContent(contentProvider, message, port);
    },

    _onSetResourceContent: function(message, port)
    {
        /**
         * @param {?Protocol.Error} error
         * @this {WebInspector.ExtensionServer}
         */
        function callbackWrapper(error)
        {
            var response = error ? this._status.E_FAILED(error) : this._status.OK();
            this._dispatchCallback(message.requestId, port, response);
        }

        var url = /** @type {string} */ (message.url);
        var uiSourceCode = WebInspector.workspace.uiSourceCodeForOriginURL(url);
        if (!uiSourceCode) {
            var resource = WebInspector.resourceTreeModel.resourceForURL(url);
            if (!resource)
                return this._status.E_NOTFOUND(url);
            return this._status.E_NOTSUPPORTED("Resource is not editable")
        }
        uiSourceCode.setWorkingCopy(message.content);
        if (message.commit)
            uiSourceCode.commitWorkingCopy();
        callbackWrapper.call(this, null);
    },

    _requestId: function(request)
    {
        if (!request._extensionRequestId) {
            request._extensionRequestId = ++this._lastRequestId;
            this._requests[request._extensionRequestId] = request;
        }
        return request._extensionRequestId;
    },

    _requestById: function(id)
    {
        return this._requests[id];
    },

    _onAddAuditCategory: function(message, port)
    {
        var category = new WebInspector.ExtensionAuditCategory(port._extensionOrigin, message.id, message.displayName, message.resultCount);
        this._clientObjects[message.id] = category;
        this._auditCategories.push(category);
        this.dispatchEventToListeners(WebInspector.ExtensionServer.Events.AuditCategoryAdded, category);
    },

    /**
     * @return {!Array.<!WebInspector.ExtensionAuditCategory>}
     */
    auditCategories: function()
    {
        return this._auditCategories;
    },

    _onAddAuditResult: function(message)
    {
        var auditResult = /** {!WebInspector.ExtensionAuditCategoryResults} */ (this._clientObjects[message.resultId]);
        if (!auditResult)
            return this._status.E_NOTFOUND(message.resultId);
        try {
            auditResult.addResult(message.displayName, message.description, message.severity, message.details);
        } catch (e) {
            return e;
        }
        return this._status.OK();
    },

    _onUpdateAuditProgress: function(message)
    {
        var auditResult = /** {!WebInspector.ExtensionAuditCategoryResults} */ (this._clientObjects[message.resultId]);
        if (!auditResult)
            return this._status.E_NOTFOUND(message.resultId);
        auditResult.updateProgress(Math.min(Math.max(0, message.progress), 1));
    },

    _onStopAuditCategoryRun: function(message)
    {
        var auditRun = /** {!WebInspector.ExtensionAuditCategoryResults} */ (this._clientObjects[message.resultId]);
        if (!auditRun)
            return this._status.E_NOTFOUND(message.resultId);
        auditRun.done();
    },

    _onForwardKeyboardEvent: function(message)
    {
        const Esc = "U+001B";
        message.entries.forEach(handleEventEntry);

        /**
         * @param {*} entry
         * @suppressGlobalPropertiesCheck
         */
        function handleEventEntry(entry)
        {
            if (!entry.ctrlKey && !entry.altKey && !entry.metaKey && !/^F\d+$/.test(entry.keyIdentifier) && entry.keyIdentifier !== Esc)
                return;
            // Fool around closure compiler -- it has its own notion of both KeyboardEvent constructor
            // and initKeyboardEvent methods and overriding these in externs.js does not have effect.
            var event = new window.KeyboardEvent(entry.eventType, {
                keyIdentifier: entry.keyIdentifier,
                location: entry.location,
                ctrlKey: entry.ctrlKey,
                altKey: entry.altKey,
                shiftKey: entry.shiftKey,
                metaKey: entry.metaKey
            });
            event.__keyCode = keyCodeForEntry(entry);
            document.dispatchEvent(event);
        }

        function keyCodeForEntry(entry)
        {
            var keyCode = entry.keyCode;
            if (!keyCode) {
                // This is required only for synthetic events (e.g. dispatched in tests).
                var match = entry.keyIdentifier.match(/^U\+([\dA-Fa-f]+)$/);
                if (match)
                    keyCode = parseInt(match[1], 16);
            }
            return keyCode || 0;
        }
    },

    _dispatchCallback: function(requestId, port, result)
    {
        if (requestId)
            port.postMessage({ command: "callback", requestId: requestId, result: result });
    },

    _initExtensions: function()
    {
        this._registerAutosubscriptionTargetManagerHandler(WebInspector.extensionAPI.Events.ConsoleMessageAdded,
            WebInspector.ConsoleModel, WebInspector.ConsoleModel.Events.MessageAdded, this._notifyConsoleMessageAdded);
        this._registerAutosubscriptionHandler(WebInspector.extensionAPI.Events.ResourceAdded,
            WebInspector.workspace, WebInspector.Workspace.Events.UISourceCodeAdded, this._notifyResourceAdded);
        this._registerAutosubscriptionTargetManagerHandler(WebInspector.extensionAPI.Events.NetworkRequestFinished,
            WebInspector.NetworkManager, WebInspector.NetworkManager.EventTypes.RequestFinished, this._notifyRequestFinished);

        /**
         * @this {WebInspector.ExtensionServer}
         */
        function onElementsSubscriptionStarted()
        {
            WebInspector.notifications.addEventListener(WebInspector.NotificationService.Events.SelectedNodeChanged, this._notifyElementsSelectionChanged, this);
        }

        /**
         * @this {WebInspector.ExtensionServer}
         */
        function onElementsSubscriptionStopped()
        {
            WebInspector.notifications.removeEventListener(WebInspector.NotificationService.Events.SelectedNodeChanged, this._notifyElementsSelectionChanged, this);
        }

        this._registerSubscriptionHandler(WebInspector.extensionAPI.Events.PanelObjectSelected + "elements",
            onElementsSubscriptionStarted.bind(this), onElementsSubscriptionStopped.bind(this));
        this._registerResourceContentCommittedHandler(this._notifyUISourceCodeContentCommitted);

        WebInspector.targetManager.addEventListener(WebInspector.TargetManager.Events.InspectedURLChanged,
            this._inspectedURLChanged, this);

        InspectorExtensionRegistry.getExtensionsAsync();
    },

    _notifyConsoleMessageAdded: function(event)
    {
        this._postNotification(WebInspector.extensionAPI.Events.ConsoleMessageAdded, this._makeConsoleMessage(event.data));
    },

    _notifyResourceAdded: function(event)
    {
        var uiSourceCode = /** @type {!WebInspector.UISourceCode} */ (event.data);
        this._postNotification(WebInspector.extensionAPI.Events.ResourceAdded, this._makeResource(uiSourceCode));
    },

    _notifyUISourceCodeContentCommitted: function(event)
    {
        var uiSourceCode = /** @type {!WebInspector.UISourceCode} */ (event.data.uiSourceCode);
        var content = /** @type {string} */ (event.data.content);
        this._postNotification(WebInspector.extensionAPI.Events.ResourceContentCommitted, this._makeResource(uiSourceCode), content);
    },

    _notifyRequestFinished: function(event)
    {
        var request = /** @type {!WebInspector.NetworkRequest} */ (event.data);
        this._postNotification(WebInspector.extensionAPI.Events.NetworkRequestFinished, this._requestId(request), (new WebInspector.HAREntry(request)).build());
    },

    _notifyElementsSelectionChanged: function()
    {
        this._postNotification(WebInspector.extensionAPI.Events.PanelObjectSelected + "elements");
    },

    /**
     * @param {!WebInspector.Event} event
     */
    _addExtensions: function(event)
    {
        if (WebInspector.extensionServer._overridePlatformExtensionAPIForTest)
            window.buildPlatformExtensionAPI = WebInspector.extensionServer._overridePlatformExtensionAPIForTest;

        var extensionInfos = /** @type {!Array.<!ExtensionDescriptor>} */ (event.data);
        if (this._initializeCommandIssued)
            extensionInfos.forEach(this._addExtension, this);
        else
            this._pendingExtensionInfos = extensionInfos;
    },

    /**
     * @param {!WebInspector.Event} event
     */
    _setInspectedTabId: function(event)
    {
        this._inspectedTabId = /** @type {string} */ (event.data);
    },

    /**
     * @param {!ExtensionDescriptor} extensionInfo
     * @suppressGlobalPropertiesCheck
     */
    _addExtension: function(extensionInfo)
    {
        const urlOriginRegExp = new RegExp("([^:]+:\/\/[^/]*)\/"); // Can't use regexp literal here, MinJS chokes on it.
        var startPage = extensionInfo.startPage;
        var name = extensionInfo.name;

        try {
            var originMatch = urlOriginRegExp.exec(startPage);
            if (!originMatch) {
                console.error("Skipping extension with invalid URL: " + startPage);
                return false;
            }
            var extensionOrigin = originMatch[1];
            if (!this._registeredExtensions[extensionOrigin]) {
                // See ExtensionAPI.js for details.
                InspectorFrontendHost.setInjectedScriptForOrigin(extensionOrigin, buildExtensionAPIInjectedScript(extensionInfo, this._inspectedTabId));
                this._registeredExtensions[extensionOrigin] = { name: name };
            }
            var iframe = createElement("iframe");
            iframe.src = startPage;
            iframe.style.display = "none";
            document.body.appendChild(iframe);  // Only for main window.
        } catch (e) {
            console.error("Failed to initialize extension " + startPage + ":" + e);
            return false;
        }
        return true;
    },

    _registerExtension: function(origin, port)
    {
        if (!this._registeredExtensions.hasOwnProperty(origin)) {
            if (origin !== window.location.origin) // Just ignore inspector frames.
                console.error("Ignoring unauthorized client request from " + origin);
            return;
        }
        port._extensionOrigin = origin;
        port.addEventListener("message", this._onmessage.bind(this), false);
        port.start();
    },

    _onWindowMessage: function(event)
    {
        if (event.data === "registerExtension")
            this._registerExtension(event.origin, event.ports[0]);
    },

    _onmessage: function(event)
    {
        var message = event.data;
        var result;

        if (message.command in this._handlers)
            result = this._handlers[message.command](message, event.target);
        else
            result = this._status.E_NOTSUPPORTED(message.command);

        if (result && message.requestId)
            this._dispatchCallback(message.requestId, event.target, result);
    },

    _registerHandler: function(command, callback)
    {
        console.assert(command);
        this._handlers[command] = callback;
    },

    _registerSubscriptionHandler: function(eventTopic, onSubscribeFirst, onUnsubscribeLast)
    {
        this._subscriptionStartHandlers[eventTopic] = onSubscribeFirst;
        this._subscriptionStopHandlers[eventTopic] = onUnsubscribeLast;
    },

    /**
     * @param {string} eventTopic
     * @param {!Object} eventTarget
     * @param {string} frontendEventType
     * @param {function(!WebInspector.Event)} handler
     */
    _registerAutosubscriptionHandler: function(eventTopic, eventTarget, frontendEventType, handler)
    {
        this._registerSubscriptionHandler(eventTopic,
            eventTarget.addEventListener.bind(eventTarget, frontendEventType, handler, this),
            eventTarget.removeEventListener.bind(eventTarget, frontendEventType, handler, this));
    },

    /**
     * @param {string} eventTopic
     * @param {!Function} modelClass
     * @param {string} frontendEventType
     * @param {function(!WebInspector.Event)} handler
     */
    _registerAutosubscriptionTargetManagerHandler: function(eventTopic, modelClass, frontendEventType, handler)
    {
        this._registerSubscriptionHandler(eventTopic,
            WebInspector.targetManager.addModelListener.bind(WebInspector.targetManager, modelClass, frontendEventType, handler, this),
            WebInspector.targetManager.removeModelListener.bind(WebInspector.targetManager, modelClass, frontendEventType, handler, this));
    },

    _registerResourceContentCommittedHandler: function(handler)
    {
        /**
         * @this {WebInspector.ExtensionServer}
         */
        function addFirstEventListener()
        {
            WebInspector.workspace.addEventListener(WebInspector.Workspace.Events.UISourceCodeContentCommitted, handler, this);
            WebInspector.workspace.setHasResourceContentTrackingExtensions(true);
        }

        /**
         * @this {WebInspector.ExtensionServer}
         */
        function removeLastEventListener()
        {
            WebInspector.workspace.setHasResourceContentTrackingExtensions(false);
            WebInspector.workspace.removeEventListener(WebInspector.Workspace.Events.UISourceCodeContentCommitted, handler, this);
        }

        this._registerSubscriptionHandler(WebInspector.extensionAPI.Events.ResourceContentCommitted,
            addFirstEventListener.bind(this),
            removeLastEventListener.bind(this));
    },

    _expandResourcePath: function(extensionPath, resourcePath)
    {
        if (!resourcePath)
            return;
        return extensionPath + this._normalizePath(resourcePath);
    },

    _normalizePath: function(path)
    {
        var source = path.split("/");
        var result = [];

        for (var i = 0; i < source.length; ++i) {
            if (source[i] === ".")
                continue;
            // Ignore empty path components resulting from //, as well as a leading and traling slashes.
            if (source[i] === "")
                continue;
            if (source[i] === "..")
                result.pop();
            else
                result.push(source[i]);
        }
        return "/" + result.join("/");
    },

    /**
     * @param {string} expression
     * @param {boolean} exposeCommandLineAPI
     * @param {boolean} returnByValue
     * @param {?Object} options
     * @param {string} securityOrigin
     * @param {function(?string, !RuntimeAgent.RemoteObject, boolean=)} callback
     * @return {!WebInspector.ExtensionStatus.Record|undefined}
     */
    evaluate: function(expression, exposeCommandLineAPI, returnByValue, options, securityOrigin, callback)
    {
        var contextId;

        /**
         * @param {string} url
         * @return {boolean}
         */
        function resolveURLToFrame(url)
        {
            var found;
            function hasMatchingURL(frame)
            {
                found = (frame.url === url) ? frame : null;
                return found;
            }
            WebInspector.resourceTreeModel.frames().some(hasMatchingURL);
            return found;
        }

        if (typeof options === "object") {
            var frame = options.frameURL ? resolveURLToFrame(options.frameURL) : WebInspector.resourceTreeModel.mainFrame;
            if (!frame) {
                if (options.frameURL)
                    console.warn("evaluate: there is no frame with URL " + options.frameURL);
                else
                    console.warn("evaluate: the main frame is not yet available");
                return this._status.E_NOTFOUND(options.frameURL || "<top>");
            }

            var contextSecurityOrigin;
            if (options.useContentScriptContext)
                contextSecurityOrigin = securityOrigin;
            else if (options.scriptExecutionContext)
                contextSecurityOrigin = options.scriptExecutionContext;

            var context;
            var executionContexts = WebInspector.runtimeModel.executionContexts();
            if (contextSecurityOrigin) {
                for (var i = 0; i < executionContexts.length; ++i) {
                    var executionContext = executionContexts[i];
                    if (executionContext.frameId === frame.id && executionContext.origin === contextSecurityOrigin && !executionContext.isMainWorldContext)
                        context = executionContext;

                }
                if (!context) {
                    console.warn("The JavaScript context " + contextSecurityOrigin + " was not found in the frame " + frame.url)
                    return this._status.E_NOTFOUND(contextSecurityOrigin)
                }
            } else {
                for (var i = 0; i < executionContexts.length; ++i) {
                    var executionContext = executionContexts[i];
                    if (executionContext.frameId === frame.id && executionContext.isMainWorldContext)
                        context = executionContext;

                }
                if (!context)
                    return this._status.E_FAILED(frame.url + " has no execution context");
            }

            contextId = context.id;
        }
        RuntimeAgent.evaluate(expression, "extension", exposeCommandLineAPI, true, contextId, returnByValue, false, callback);
    },

    __proto__: WebInspector.Object.prototype
}

/**
 * @constructor
 * @param {string} name
 * @param {string} title
 * @param {!WebInspector.Panel} panel
 * @implements {WebInspector.PanelDescriptor}
 */
WebInspector.ExtensionServerPanelDescriptor = function(name, title, panel)
{
    this._name = name;
    this._title = title;
    this._panel = panel;
}

WebInspector.ExtensionServerPanelDescriptor.prototype = {
    /**
     * @return {string}
     */
    name: function()
    {
        return this._name;
    },

    /**
     * @return {string}
     */
    title: function()
    {
        return this._title;
    },

    /**
     * @return {!Promise.<!WebInspector.Panel>}
     */
    panel: function()
    {
        return Promise.resolve(this._panel);
    }
}

/**
 * @constructor
 */
WebInspector.ExtensionStatus = function()
{
    /**
     * @param {string} code
     * @param {string} description
     * @return {!WebInspector.ExtensionStatus.Record}
     */
    function makeStatus(code, description)
    {
        var details = Array.prototype.slice.call(arguments, 2);
        var status = { code: code, description: description, details: details };
        if (code !== "OK") {
            status.isError = true;
            console.log("Extension server error: " + String.vsprintf(description, details));
        }
        return status;
    }

    this.OK = makeStatus.bind(null, "OK", "OK");
    this.E_EXISTS = makeStatus.bind(null, "E_EXISTS", "Object already exists: %s");
    this.E_BADARG = makeStatus.bind(null, "E_BADARG", "Invalid argument %s: %s");
    this.E_BADARGTYPE = makeStatus.bind(null, "E_BADARGTYPE", "Invalid type for argument %s: got %s, expected %s");
    this.E_NOTFOUND = makeStatus.bind(null, "E_NOTFOUND", "Object not found: %s");
    this.E_NOTSUPPORTED = makeStatus.bind(null, "E_NOTSUPPORTED", "Object does not support requested operation: %s");
    this.E_PROTOCOLERROR = makeStatus.bind(null, "E_PROTOCOLERROR", "Inspector protocol error: %s");
    this.E_FAILED = makeStatus.bind(null, "E_FAILED", "Operation failed: %s");
}

/**
 * @typedef {{code: string, description: string, details: !Array.<*>}}
 */
WebInspector.ExtensionStatus.Record;

WebInspector.extensionAPI = {};
defineCommonExtensionSymbols(WebInspector.extensionAPI);
