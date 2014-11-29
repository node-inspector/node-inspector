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
 * @constructor
 * @extends {WebInspector.Object}
 * @param {!WebInspector.Workspace} workspace
 */
WebInspector.SourcesNavigator = function(workspace)
{
    WebInspector.Object.call(this);
    this._workspace = workspace;

    this._tabbedPane = new WebInspector.TabbedPane();
    this._tabbedPane.shrinkableTabs = true;
    this._tabbedPane.element.classList.add("navigator-tabbed-pane");
    this._tabbedPaneController = new WebInspector.ExtensibleTabbedPaneController(this._tabbedPane, "navigator-view", this._navigatorViewCreated.bind(this));
    /** @type {!Map.<string, ?WebInspector.NavigatorView>} */
    this._navigatorViews = new Map();
}

WebInspector.SourcesNavigator.Events = {
    SourceSelected: "SourceSelected",
    SourceRenamed: "SourceRenamed"
}

WebInspector.SourcesNavigator.prototype = {
    /**
     * @param {string} id
     * @param {!WebInspector.View} view
     */
    _navigatorViewCreated: function(id, view)
    {
        var navigatorView = /** @type {!WebInspector.NavigatorView} */ (view);
        navigatorView.addEventListener(WebInspector.NavigatorView.Events.ItemSelected, this._sourceSelected, this);
        navigatorView.addEventListener(WebInspector.NavigatorView.Events.ItemRenamed, this._sourceRenamed, this);
        this._navigatorViews.set(id, navigatorView);
        navigatorView.setWorkspace(this._workspace);
    },

    /**
     * @return {!WebInspector.View}
     */
    get view()
    {
        return this._tabbedPane;
    },

    /**
     * @param {!WebInspector.UISourceCode} uiSourceCode
     */
    revealUISourceCode: function(uiSourceCode)
    {
        var ids = this._tabbedPaneController.viewIds();
        var promises = [];
        for (var i = 0; i < ids.length; ++i)
            promises.push(this._tabbedPaneController.viewForId(ids[i]));
        Promise.all(promises).then(filterNavigators.bind(this)).done();

        /**
         * @param {!Array.<!Object>} objects
         * @this {WebInspector.SourcesNavigator}
         */
        function filterNavigators(objects)
        {
            for (var i = 0; i < objects.length; ++i) {
                var navigatorView = /** @type {!WebInspector.NavigatorView} */ (objects[i]);
                if (navigatorView.accept(uiSourceCode)) {
                    this._tabbedPane.selectTab(ids[i]);
                    navigatorView.revealUISourceCode(uiSourceCode, true);
                }
            }
        }
    },

    /**
     * @param {!WebInspector.Event} event
     */
    _sourceSelected: function(event)
    {
        this.dispatchEventToListeners(WebInspector.SourcesNavigator.Events.SourceSelected, event.data);
    },

    /**
     * @param {!WebInspector.Event} event
     */
    _sourceRenamed: function(event)
    {
        this.dispatchEventToListeners(WebInspector.SourcesNavigator.Events.SourceRenamed, event.data);
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
     * @override
     * @param {!WebInspector.UISourceCode} uiSourceCode
     * @return {boolean}
     */
    accept: function(uiSourceCode)
    {
        if (!WebInspector.NavigatorView.prototype.accept(uiSourceCode))
            return false;
        return uiSourceCode.project().type() === WebInspector.projectTypes.Snippets;
    },

    /**
     * @param {!Event} event
     */
    handleContextMenu: function(event)
    {
        var contextMenu = new WebInspector.ContextMenu(event);
        contextMenu.appendItem(WebInspector.UIString("New"), this._handleCreateSnippet.bind(this));
        contextMenu.show();
    },

    /**
     * @param {!Event} event
     * @param {!WebInspector.UISourceCode} uiSourceCode
     */
    handleFileContextMenu: function(event, uiSourceCode)
    {
        var contextMenu = new WebInspector.ContextMenu(event);
        contextMenu.appendItem(WebInspector.UIString("Run"), this._handleEvaluateSnippet.bind(this, uiSourceCode));
        contextMenu.appendItem(WebInspector.UIString("Rename"), this.rename.bind(this, uiSourceCode));
        contextMenu.appendItem(WebInspector.UIString("Remove"), this._handleRemoveSnippet.bind(this, uiSourceCode));
        contextMenu.appendSeparator();
        contextMenu.appendItem(WebInspector.UIString("New"), this._handleCreateSnippet.bind(this));
        contextMenu.show();
    },

    /**
     * @param {!WebInspector.UISourceCode} uiSourceCode
     */
    _handleEvaluateSnippet: function(uiSourceCode)
    {
        var executionContext = WebInspector.context.flavor(WebInspector.ExecutionContext);
        if (uiSourceCode.project().type() !== WebInspector.projectTypes.Snippets || !executionContext)
            return;
        WebInspector.scriptSnippetModel.evaluateScriptSnippet(executionContext, uiSourceCode);
    },

    /**
     * @param {!WebInspector.UISourceCode} uiSourceCode
     */
    _handleRemoveSnippet: function(uiSourceCode)
    {
        if (uiSourceCode.project().type() !== WebInspector.projectTypes.Snippets)
            return;
        uiSourceCode.remove();
    },

    _handleCreateSnippet: function()
    {
        this.create(WebInspector.scriptSnippetModel.project(), "")
    },

    /**
     * @override
     */
    sourceDeleted: function(uiSourceCode)
    {
        this._handleRemoveSnippet(uiSourceCode);
    },

    __proto__: WebInspector.NavigatorView.prototype
}
