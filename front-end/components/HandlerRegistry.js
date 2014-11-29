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
WebInspector.HandlerRegistry = function(setting)
{
    WebInspector.Object.call(this);
    this._handlers = {};
    this._setting = setting;
    this._activeHandler = this._setting.get();
}

WebInspector.HandlerRegistry.prototype = {
    get handlerNames()
    {
        return Object.getOwnPropertyNames(this._handlers);
    },

    get activeHandler()
    {
        return this._activeHandler;
    },

    set activeHandler(value)
    {
        this._activeHandler = value;
        this._setting.set(value);
    },

    /**
     * @param {!Object} data
     * @return {boolean}
     */
    dispatch: function(data)
    {
        return this.dispatchToHandler(this._activeHandler, data);
    },

    /**
     * @param {string} name
     * @param {!Object} data
     * @return {boolean}
     */
    dispatchToHandler: function(name, data)
    {
        var handler = this._handlers[name];
        var result = handler && handler(data);
        return !!result;
    },

    registerHandler: function(name, handler)
    {
        this._handlers[name] = handler;
        this.dispatchEventToListeners(WebInspector.HandlerRegistry.EventTypes.HandlersUpdated);
    },

    unregisterHandler: function(name)
    {
        delete this._handlers[name];
        this.dispatchEventToListeners(WebInspector.HandlerRegistry.EventTypes.HandlersUpdated);
    },

    /**
     * @param {string} url
     */
    _openInNewTab: function(url)
    {
        InspectorFrontendHost.openInNewTab(url);
    },

    /**
     * @param {!WebInspector.ContextMenu} contextMenu
     * @param {!Object} target
     */
    _appendContentProviderItems: function(contextMenu, target)
    {
        if (!(target instanceof WebInspector.UISourceCode || target instanceof WebInspector.Resource || target instanceof WebInspector.NetworkRequest))
            return;
        var contentProvider = /** @type {!WebInspector.ContentProvider} */ (target);
        if (!contentProvider.contentURL())
            return;

        contextMenu.appendItem(WebInspector.openLinkExternallyLabel(), this._openInNewTab.bind(this, contentProvider.contentURL()));
        // Skip 0th handler, as it's 'Use default panel' one.
        for (var i = 1; i < this.handlerNames.length; ++i) {
            var handler = this.handlerNames[i];
            contextMenu.appendItem(WebInspector.UIString(WebInspector.useLowerCaseMenuTitles() ? "Open using %s" : "Open Using %s", handler),
                this.dispatchToHandler.bind(this, handler, { url: contentProvider.contentURL() }));
        }
        contextMenu.appendItem(WebInspector.copyLinkAddressLabel(), InspectorFrontendHost.copyText.bind(InspectorFrontendHost, contentProvider.contentURL()));

        if (!contentProvider.contentURL())
            return;

        var contentType = contentProvider.contentType();
        if (contentType !== WebInspector.resourceTypes.Document &&
            contentType !== WebInspector.resourceTypes.Stylesheet &&
            contentType !== WebInspector.resourceTypes.Script)
            return;

        /**
         * @param {boolean} forceSaveAs
         * @param {?string} content
         */
        function doSave(forceSaveAs, content)
        {
            var url = contentProvider.contentURL();
            WebInspector.fileManager.save(url, /** @type {string} */ (content), forceSaveAs);
            WebInspector.fileManager.close(url);
        }

        /**
         * @param {boolean} forceSaveAs
         */
        function save(forceSaveAs)
        {
            if (contentProvider instanceof WebInspector.UISourceCode) {
                var uiSourceCode = /** @type {!WebInspector.UISourceCode} */ (contentProvider);
                uiSourceCode.save(forceSaveAs);
                return;
            }
            contentProvider.requestContent(doSave.bind(null, forceSaveAs));
        }

        contextMenu.appendSeparator();
        contextMenu.appendItem(WebInspector.UIString("Save"), save.bind(null, false));

        if (contentProvider instanceof WebInspector.UISourceCode) {
            var uiSourceCode = /** @type {!WebInspector.UISourceCode} */ (contentProvider);
            if (uiSourceCode.project().type() !== WebInspector.projectTypes.FileSystem && uiSourceCode.project().type() !== WebInspector.projectTypes.Snippets)
                contextMenu.appendItem(WebInspector.UIString(WebInspector.useLowerCaseMenuTitles() ? "Save as..." : "Save As..."), save.bind(null, true));
        }
    },

    /**
     * @param {!WebInspector.ContextMenu} contextMenu
     * @param {!Object} target
     */
    _appendHrefItems: function(contextMenu, target)
    {
        if (!(target instanceof Node))
            return;
        var targetNode = /** @type {!Node} */ (target);

        var anchorElement = targetNode.enclosingNodeOrSelfWithClass("webkit-html-resource-link") || targetNode.enclosingNodeOrSelfWithClass("webkit-html-external-link");
        if (!anchorElement)
            return;

        var resourceURL = anchorElement.href;
        if (!resourceURL)
            return;

        // Add resource-related actions.
        contextMenu.appendItem(WebInspector.openLinkExternallyLabel(), this._openInNewTab.bind(this, resourceURL));

        function openInResourcesPanel(resourceURL)
        {
            var resource = WebInspector.resourceForURL(resourceURL);
            if (resource)
                WebInspector.Revealer.reveal(resource);
            else
                InspectorFrontendHost.openInNewTab(resourceURL);
        }
        if (WebInspector.resourceForURL(resourceURL))
            contextMenu.appendItem(WebInspector.UIString(WebInspector.useLowerCaseMenuTitles() ? "Open link in Resources panel" : "Open Link in Resources Panel"), openInResourcesPanel.bind(null, resourceURL));
        contextMenu.appendItem(WebInspector.copyLinkAddressLabel(), InspectorFrontendHost.copyText.bind(InspectorFrontendHost, resourceURL));
    },

    __proto__: WebInspector.Object.prototype
}


WebInspector.HandlerRegistry.EventTypes = {
    HandlersUpdated: "HandlersUpdated"
}

/**
 * @constructor
 */
WebInspector.HandlerSelector = function(handlerRegistry)
{
    this._handlerRegistry = handlerRegistry;
    this.element = createElementWithClass("select", "chrome-select");
    this.element.addEventListener("change", this._onChange.bind(this), false);
    this._update();
    this._handlerRegistry.addEventListener(WebInspector.HandlerRegistry.EventTypes.HandlersUpdated, this._update.bind(this));
}

WebInspector.HandlerSelector.prototype =
{
    _update: function()
    {
        this.element.removeChildren();
        var names = this._handlerRegistry.handlerNames;
        var activeHandler = this._handlerRegistry.activeHandler;

        for (var i = 0; i < names.length; ++i) {
            var option = createElement("option");
            option.textContent = names[i];
            option.selected = activeHandler === names[i];
            this.element.appendChild(option);
        }
        this.element.disabled = names.length <= 1;
    },

    _onChange: function(event)
    {
        var value = event.target.value;
        this._handlerRegistry.activeHandler = value;
    }
}

/**
 * @constructor
 * @implements {WebInspector.ContextMenu.Provider}
 */
WebInspector.HandlerRegistry.ContextMenuProvider = function()
{
}

WebInspector.HandlerRegistry.ContextMenuProvider.prototype = {
    /**
     * @param {!Event} event
     * @param {!WebInspector.ContextMenu} contextMenu
     * @param {!Object} target
     */
    appendApplicableItems: function(event, contextMenu, target)
    {
        WebInspector.openAnchorLocationRegistry._appendContentProviderItems(contextMenu, target);
        WebInspector.openAnchorLocationRegistry._appendHrefItems(contextMenu, target);
    }
}

/**
 * @constructor
 * @implements {WebInspector.Linkifier.LinkHandler}
 */
WebInspector.HandlerRegistry.LinkHandler = function()
{
}

WebInspector.HandlerRegistry.LinkHandler.prototype = {
    /**
     * @param {string} url
     * @param {number=} lineNumber
     * @return {boolean}
     */
    handleLink: function(url, lineNumber)
    {
        return WebInspector.openAnchorLocationRegistry.dispatch({ url: url, lineNumber: lineNumber});
    }
}

/**
 * @constructor
 * @extends {WebInspector.UISettingDelegate}
 */
WebInspector.HandlerRegistry.OpenAnchorLocationSettingDelegate = function()
{
    WebInspector.UISettingDelegate.call(this);
}

WebInspector.HandlerRegistry.OpenAnchorLocationSettingDelegate.prototype = {
    /**
     * @override
     * @return {?Element}
     */
    settingElement: function()
    {
        if (!WebInspector.openAnchorLocationRegistry.handlerNames.length)
            return null;

        var handlerSelector = new WebInspector.HandlerSelector(WebInspector.openAnchorLocationRegistry);
        return WebInspector.SettingsUI.createCustomSetting(WebInspector.UIString("Open links in"), handlerSelector.element);
    },

    __proto__: WebInspector.UISettingDelegate.prototype
}

/**
 * @type {!WebInspector.HandlerRegistry}
 */
WebInspector.openAnchorLocationRegistry;
