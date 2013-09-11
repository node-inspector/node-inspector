/*
 * Copyright (C) 2011 Google Inc. All rights reserved.
 *
 * Redistribution and use in source and binary forms, with or without
 * modification, are permitted provided that the following conditions are
 * met:
 *
 * 1. Redistributions of source code must retain the above copyright
 * notice, this list of conditions and the following disclaimer.
 *
 * 2. Redistributions in binary form must reproduce the above
 * copyright notice, this list of conditions and the following disclaimer
 * in the documentation and/or other materials provided with the
 * distribution.
 *
 * THIS SOFTWARE IS PROVIDED BY GOOGLE INC. AND ITS CONTRIBUTORS
 * "AS IS" AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT
 * LIMITED TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR
 * A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL GOOGLE INC.
 * OR ITS CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL,
 * SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT
 * LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE,
 * DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY
 * THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT
 * (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE
 * OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
 */

/**
 * @extends {WebInspector.Object}
 * @constructor
 */
WebInspector.ScriptsNavigator = function()
{
    WebInspector.Object.call(this);
    
    this._tabbedPane = new WebInspector.TabbedPane();
    this._tabbedPane.shrinkableTabs = true;
    this._tabbedPane.element.addStyleClass("navigator-tabbed-pane");

    this._scriptsView = new WebInspector.NavigatorView();
    this._scriptsView.addEventListener(WebInspector.NavigatorView.Events.ItemSelected, this._scriptSelected, this);
    this._scriptsView.addEventListener(WebInspector.NavigatorView.Events.ItemSearchStarted, this._itemSearchStarted, this);
    this._scriptsView.addEventListener(WebInspector.NavigatorView.Events.ItemRenamingRequested, this._itemRenamingRequested, this);
    this._scriptsView.addEventListener(WebInspector.NavigatorView.Events.ItemCreationRequested, this._itemCreationRequested, this);

    this._contentScriptsView = new WebInspector.NavigatorView();
    this._contentScriptsView.addEventListener(WebInspector.NavigatorView.Events.ItemSelected, this._scriptSelected, this);
    this._contentScriptsView.addEventListener(WebInspector.NavigatorView.Events.ItemSearchStarted, this._itemSearchStarted, this);
    this._contentScriptsView.addEventListener(WebInspector.NavigatorView.Events.ItemRenamingRequested, this._itemRenamingRequested, this);
    this._contentScriptsView.addEventListener(WebInspector.NavigatorView.Events.ItemCreationRequested, this._itemCreationRequested, this);

    this._snippetsView = new WebInspector.SnippetsNavigatorView();
    this._snippetsView.addEventListener(WebInspector.NavigatorView.Events.ItemSelected, this._scriptSelected, this);
    this._snippetsView.addEventListener(WebInspector.NavigatorView.Events.ItemSearchStarted, this._itemSearchStarted, this);
    this._snippetsView.addEventListener(WebInspector.NavigatorView.Events.ItemRenamingRequested, this._itemRenamingRequested, this);
    this._snippetsView.addEventListener(WebInspector.NavigatorView.Events.ItemCreationRequested, this._itemCreationRequested, this);

    this._tabbedPane.appendTab(WebInspector.ScriptsNavigator.ScriptsTab, WebInspector.UIString("Sources"), this._scriptsView);
    this._tabbedPane.selectTab(WebInspector.ScriptsNavigator.ScriptsTab);
    this._tabbedPane.appendTab(WebInspector.ScriptsNavigator.ContentScriptsTab, WebInspector.UIString("Content scripts"), this._contentScriptsView);
    this._tabbedPane.appendTab(WebInspector.ScriptsNavigator.SnippetsTab, WebInspector.UIString("Snippets"), this._snippetsView);
}

WebInspector.ScriptsNavigator.Events = {
    ScriptSelected: "ScriptSelected",
    ItemCreationRequested: "ItemCreationRequested",
    ItemRenamingRequested: "ItemRenamingRequested",
    ItemSearchStarted: "ItemSearchStarted",
}

WebInspector.ScriptsNavigator.ScriptsTab = "scripts";
WebInspector.ScriptsNavigator.ContentScriptsTab = "contentScripts";
WebInspector.ScriptsNavigator.SnippetsTab = "snippets";

WebInspector.ScriptsNavigator.prototype = {
    /*
     * @return {WebInspector.View}
     */
    get view()
    {
        return this._tabbedPane;
    },

    /**
     * @param {WebInspector.UISourceCode} uiSourceCode
     */
    _navigatorViewForUISourceCode: function(uiSourceCode)
    {
        if (uiSourceCode.isContentScript)
            return this._contentScriptsView;
        else if (uiSourceCode.project().type() === WebInspector.projectTypes.Snippets)
            return this._snippetsView;
        else
            return this._scriptsView;
    },

    /**
     * @param {WebInspector.UISourceCode} uiSourceCode
     */
    addUISourceCode: function(uiSourceCode)
    {
        this._navigatorViewForUISourceCode(uiSourceCode).addUISourceCode(uiSourceCode);
    },

    /**
     * @param {WebInspector.UISourceCode} uiSourceCode
     */
    removeUISourceCode: function(uiSourceCode)
    {
        this._navigatorViewForUISourceCode(uiSourceCode).removeUISourceCode(uiSourceCode);
    },

    /**
     * @param {WebInspector.UISourceCode} uiSourceCode
     * @param {boolean=} select
     */
    revealUISourceCode: function(uiSourceCode, select)
    {
        this._navigatorViewForUISourceCode(uiSourceCode).revealUISourceCode(uiSourceCode, select);
        if (uiSourceCode.isContentScript)
            this._tabbedPane.selectTab(WebInspector.ScriptsNavigator.ContentScriptsTab);
        else if (uiSourceCode.project().type() !== WebInspector.projectTypes.Snippets)
            this._tabbedPane.selectTab(WebInspector.ScriptsNavigator.ScriptsTab);
    },

    /**
     * @param {WebInspector.UISourceCode} uiSourceCode
     * @param {function(boolean)=} callback
     */
    rename: function(uiSourceCode, callback)
    {
        this._navigatorViewForUISourceCode(uiSourceCode).rename(uiSourceCode, callback);
    },

    /**
     * @param {WebInspector.Event} event
     */
    _scriptSelected: function(event)
    {
        this.dispatchEventToListeners(WebInspector.ScriptsNavigator.Events.ScriptSelected, event.data);
    },

    /**
     * @param {WebInspector.Event} event
     */
    _itemSearchStarted: function(event)
    {
        this.dispatchEventToListeners(WebInspector.ScriptsNavigator.Events.ItemSearchStarted, event.data);
    },

    /**
     * @param {WebInspector.Event} event
     */
    _itemRenamingRequested: function(event)
    {
        this.dispatchEventToListeners(WebInspector.ScriptsNavigator.Events.ItemRenamingRequested, event.data);
    },

    /**
     * @param {WebInspector.Event} event
     */
    _itemCreationRequested: function(event)
    {    
        this.dispatchEventToListeners(WebInspector.ScriptsNavigator.Events.ItemCreationRequested, event.data);
    },

    __proto__: WebInspector.Object.prototype
}

/**
 * @constructor
 * @extends {WebInspector.NavigatorView}
 */
WebInspector.SnippetsNavigatorView = function()
{
    WebInspector.NavigatorView.call(this);
}

WebInspector.SnippetsNavigatorView.prototype = {
    /**
     * @param {Event} event
     */
    handleContextMenu: function(event)
    {
        var contextMenu = new WebInspector.ContextMenu(event);
        contextMenu.appendItem(WebInspector.UIString("New"), this._handleCreateSnippet.bind(this));
        contextMenu.show();
    },

    /**
     * @param {Event} event
     * @param {WebInspector.UISourceCode} uiSourceCode
     */
    handleFileContextMenu: function(event, uiSourceCode)
    {
        var contextMenu = new WebInspector.ContextMenu(event);
        contextMenu.appendItem(WebInspector.UIString("Run"), this._handleEvaluateSnippet.bind(this, uiSourceCode));
        contextMenu.appendItem(WebInspector.UIString("Rename"), this.requestRename.bind(this, uiSourceCode));
        contextMenu.appendItem(WebInspector.UIString("Remove"), this._handleRemoveSnippet.bind(this, uiSourceCode));
        contextMenu.appendSeparator();
        contextMenu.appendItem(WebInspector.UIString("New"), this._handleCreateSnippet.bind(this));
        contextMenu.show();
    },

    /**
     * @param {WebInspector.UISourceCode} uiSourceCode
     */
    _handleEvaluateSnippet: function(uiSourceCode)
    {
        if (uiSourceCode.project().type() !== WebInspector.projectTypes.Snippets)
            return;
        WebInspector.scriptSnippetModel.evaluateScriptSnippet(uiSourceCode);
    },

    /**
     * @param {WebInspector.UISourceCode} uiSourceCode
     */
    _handleRemoveSnippet: function(uiSourceCode)
    {
        if (uiSourceCode.project().type() !== WebInspector.projectTypes.Snippets)
            return;
        uiSourceCode.project().deleteFile(uiSourceCode);
    },

    _handleCreateSnippet: function()
    {
        var data = {};
        data.project = WebInspector.scriptSnippetModel.project();
        data.path = "";
        this.dispatchEventToListeners(WebInspector.NavigatorView.Events.ItemCreationRequested, data);
    },

    __proto__: WebInspector.NavigatorView.prototype
}
