// Copyright (c) 2015 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

/**
 * @constructor
 * @extends {WebInspector.VBox}
 */
WebInspector.BlockedURLsPane = function()
{
    WebInspector.VBox.call(this, true);
    this.registerRequiredCSS("network/blockedURLsPane.css");
    this.contentElement.classList.add("blocked-urls-pane");

    this._blockedURLsSetting = WebInspector.moduleSetting("blockedURLs");
    this._blockedURLsSetting.addChangeListener(this._update, this);

    this._toolbar = new WebInspector.Toolbar(this.contentElement);
    this._toolbar.element.addEventListener("click", consumeEvent);
    var addButton = new WebInspector.ToolbarButton(WebInspector.UIString("Add pattern"), "add-toolbar-item");
    addButton.addEventListener("click", this._addButtonClicked.bind(this));
    this._toolbar.appendToolbarItem(addButton);
    var clearButton = new WebInspector.ToolbarButton(WebInspector.UIString("Remove all"), "clear-toolbar-item");
    clearButton.addEventListener("click", this._removeAll.bind(this));
    this._toolbar.appendToolbarItem(clearButton);

    this._emptyElement = this.contentElement.createChild("div", "no-blocked-urls");
    this._emptyElement.createChild("span").textContent = WebInspector.UIString("Requests are not blocked. ");
    var addLink = this._emptyElement.createChild("span", "link");
    addLink.textContent = WebInspector.UIString("Add pattern.");
    addLink.href = "";
    addLink.addEventListener("click", this._addButtonClicked.bind(this), false);
    this._emptyElement.addEventListener("contextmenu", this._emptyElementContextMenu.bind(this), true);

    this._listElement = this.contentElement.createChild("div", "blocked-urls-list");

    /** @type {!Map<string, number>} */
    this._blockedCountForUrl = new Map();
    WebInspector.targetManager.addModelListener(WebInspector.NetworkManager, WebInspector.NetworkManager.EventTypes.RequestFinished, this._onRequestFinished, this);

    this._updateThrottler = new WebInspector.Throttler(200);

    this._update();
}

WebInspector.BlockedURLsPane.prototype = {
    /**
     * @param {!Event} event
     */
    _emptyElementContextMenu: function(event)
    {
        var contextMenu = new WebInspector.ContextMenu(event);
        contextMenu.appendItem(WebInspector.UIString.capitalize("Add ^pattern"), this._addButtonClicked.bind(this));
        contextMenu.show();
    },

    _addButtonClicked: function()
    {
        this._emptyElement.classList.add("hidden");
        var element = this._createElement("", this._blockedURLsSetting.get().length);
        this._listElement.appendChild(element);
        element.scrollIntoView();
        this._edit("", element, this._addBlockedURL.bind(this));
    },

    /**
     * @param {string} content
     * @param {!Element} element
     * @param {function(string)} onAccept
     * @private
     */
    _edit: function(content, element, onAccept)
    {
        this._editing = true;

        element.classList.add("blocked-url-editing");
        var input = element.createChild("input");
        input.setAttribute("type", "text");
        input.value = content;
        input.placeholder = WebInspector.UIString("Text pattern to block matching requests; use * for wildcard");
        input.addEventListener("blur", commit.bind(this), false);
        input.addEventListener("keydown", keydown.bind(this), false);
        input.focus();

        /**
         * @this {WebInspector.BlockedURLsPane}
         */
        function finish()
        {
            this._editing = false;
            element.removeChild(input);
            element.classList.remove("blocked-url-editing");
        }

        /**
         * @this {WebInspector.BlockedURLsPane}
         */
        function commit()
        {
            if (!this._editing)
                return;
            var text = input.value.trim();
            finish.call(this);
            if (text)
                onAccept(text);
            else
                this._update();
        }

        /**
         * @this {WebInspector.BlockedURLsPane}
         * @param {!Event} event
         */
        function keydown(event)
        {
            if (isEnterKey(event)) {
                event.consume();
                commit.call(this);
            } else if (event.keyCode === WebInspector.KeyboardShortcut.Keys.Esc.code || event.keyIdentifier === "U+001B") {
                event.consume();
                finish.call(this);
                this._update();
            }
        }
    },

    /**
     * @param {string} url
     */
    _addBlockedURL: function(url)
    {
        var blocked = this._blockedURLsSetting.get();
        blocked.push(url);
        this._blockedURLsSetting.set(blocked);
    },

    /**
     * @param {number} index
     */
    _removeBlockedURL: function(index)
    {
        var blocked = this._blockedURLsSetting.get();
        blocked.splice(index, 1);
        this._blockedURLsSetting.set(blocked);
    },

    /**
     * @param {number} index
     * @param {string} url
     */
    _changeBlockedURL: function(index, url)
    {
        var blocked = this._blockedURLsSetting.get();
        blocked.splice(index, 1, url);
        this._blockedURLsSetting.set(blocked);
    },

    _removeAll: function()
    {
        this._blockedURLsSetting.set([]);
    },

    /**
     * @param {number} index
     * @param {!Event} event
     */
    _contextMenu: function(index, event)
    {
        var contextMenu = new WebInspector.ContextMenu(event);
        contextMenu.appendItem(WebInspector.UIString.capitalize("Add ^pattern"), this._addButtonClicked.bind(this));
        contextMenu.appendItem(WebInspector.UIString.capitalize("Remove ^pattern"), this._removeBlockedURL.bind(this, index));
        contextMenu.appendItem(WebInspector.UIString.capitalize("Remove ^all"), this._removeAll.bind(this));
        contextMenu.show();
    },

    /**
     * @return {!Promise<?>}
     */
    _update: function()
    {
        if (this._editing)
            return Promise.resolve();

        this._listElement.removeChildren();
        var blocked = this._blockedURLsSetting.get();
        for (var index = 0; index < blocked.length; index++)
            this._listElement.appendChild(this._createElement(blocked[index], index));

        this._emptyElement.classList.toggle("hidden", !!blocked.length);
        return Promise.resolve();
    },

    /**
     * @param {string} url
     * @param {number} index
     * @return {!Element}
     */
    _createElement: function(url, index)
    {
        var element = createElementWithClass("div", "blocked-url");

        var label = element.createChild("div", "blocked-url-text");
        label.textContent = url;

        var count = this._blockedRequestsCount(url);
        var countElement = element.createChild("div", "blocked-count monospace");
        countElement.textContent = String.sprintf("[%d]", count);
        countElement.title = WebInspector.UIString(count === 1 ? "%d request blocked by this pattern" : "%d requests blocked by this pattern", count);

        var removeButton = element.createChild("div", "remove-button");
        removeButton.title = WebInspector.UIString("Remove");
        removeButton.addEventListener("click", this._removeBlockedURL.bind(this, index), false);

        element.addEventListener("contextmenu", this._contextMenu.bind(this, index), true);
        element.addEventListener("dblclick", this._edit.bind(this, url, element, this._changeBlockedURL.bind(this, index)), false);
        return element;
    },

    /**
     * @param {string} url
     * @return {number}
     */
    _blockedRequestsCount: function(url)
    {
        if (!url)
            return 0;

        var result = 0;
        for (var blockedUrl of this._blockedCountForUrl.keys()) {
            if (this._matches(url, blockedUrl))
                result += this._blockedCountForUrl.get(blockedUrl);
        }
        return result;
    },

    /**
     * @param {string} pattern
     * @param {string} url
     * @return {boolean}
     */
    _matches: function(pattern, url)
    {
        var pos = 0;
        var parts = pattern.split("*");
        for (var index = 0; index < parts.length; index++) {
            var part = parts[index];
            if (!part.length)
                continue;
            pos = url.indexOf(part, pos);
            if (pos === -1)
                return false;
            pos += part.length;
        }
        return true;
    },

    reset: function()
    {
        this._blockedCountForUrl.clear();
    },

    /**
     * @param {!WebInspector.Event} event
     */
    _onRequestFinished: function(event)
    {
        var request = /** @type {!WebInspector.NetworkRequest} */ (event.data);
        if (request.wasBlocked()) {
            var count = this._blockedCountForUrl.get(request.url) || 0;
            this._blockedCountForUrl.set(request.url, count + 1);
            this._updateThrottler.schedule(this._update.bind(this));
        }
    },

    __proto__: WebInspector.VBox.prototype
}


/** @type {?WebInspector.BlockedURLsPane} */
WebInspector.BlockedURLsPane._instance = null;

WebInspector.BlockedURLsPane.reset = function()
{
    if (WebInspector.BlockedURLsPane._instance)
        WebInspector.BlockedURLsPane._instance.reset();
}

WebInspector.BlockedURLsPane.reveal = function()
{
    if (!WebInspector.BlockedURLsPane._instance)
        WebInspector.BlockedURLsPane._instance = new WebInspector.BlockedURLsPane();
    WebInspector.inspectorView.showCloseableViewInDrawer("network.blocked-urls", WebInspector.UIString("Request blocking"), WebInspector.BlockedURLsPane._instance);
}

/**
 * @constructor
 * @implements {WebInspector.ActionDelegate}
 */
WebInspector.BlockedURLsPane.ActionDelegate = function()
{
}

WebInspector.BlockedURLsPane.ActionDelegate.prototype = {
    /**
     * @override
     * @param {!WebInspector.Context} context
     * @param {string} actionId
     */
    handleAction: function(context, actionId)
    {
        WebInspector.BlockedURLsPane.reveal();
    }
}

