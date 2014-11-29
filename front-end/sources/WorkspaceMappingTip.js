
// Copyright 2014 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

/**
 * @constructor
 * @param {!WebInspector.SourcesPanel} sourcesPanel
 * @param {!WebInspector.Workspace} workspace
 */
WebInspector.WorkspaceMappingTip = function(sourcesPanel, workspace)
{
    this._sourcesPanel = sourcesPanel;
    this._workspace = workspace;

    this._sourcesView = this._sourcesPanel.sourcesView();
    this._sourcesView.addEventListener(WebInspector.SourcesView.Events.EditorSelected, this._editorSelected.bind(this));
    this._workspaceInfobarAllowedSetting = WebInspector.settings.createSetting("workspaceInfobarAllowed", true);
}

WebInspector.WorkspaceMappingTip._infobarSymbol = Symbol("infobar");

WebInspector.WorkspaceMappingTip.prototype = {
    /**
     * @param {!WebInspector.Event} event
     */
    _editorSelected: function(event)
    {
        var uiSourceCode = /** @type {!WebInspector.UISourceCode} */ (event.data);
        if (this._editorSelectedTimer)
            clearTimeout(this._editorSelectedTimer);
        this._editorSelectedTimer = setTimeout(this._updateSuggestedMappingInfobar.bind(this, uiSourceCode), 3000);
    },

    /**
     * @param {!WebInspector.UISourceCode} uiSourceCode
     */
    _updateSuggestedMappingInfobar: function(uiSourceCode)
    {
        var uiSourceCodeFrame = this._sourcesView.viewForFile(uiSourceCode);

        if (!uiSourceCodeFrame.isShowing())
            return;
        if (uiSourceCode[WebInspector.WorkspaceMappingTip._infobarSymbol])
            return;

        // First try mapping filesystem -> network.
        if (uiSourceCode.project().type() === WebInspector.projectTypes.FileSystem) {
            var hasMappings = !!uiSourceCode.url;
            if (hasMappings)
                return;

            var networkProjects = this._workspace.projectsForType(WebInspector.projectTypes.Network);
            networkProjects = networkProjects.concat(this._workspace.projectsForType(WebInspector.projectTypes.ContentScripts));
            for (var i = 0; i < networkProjects.length; ++i) {
                if (!this._isLocalHost(networkProjects[i].url()))
                    continue;
                var name = uiSourceCode.name();
                var networkUiSourceCodes = networkProjects[i].uiSourceCodes();
                for (var j = 0; j < networkUiSourceCodes.length; ++j) {
                    if (networkUiSourceCodes[j].name() === name) {
                        this._showMappingInfobar(uiSourceCode, false);
                        return;
                    }
                }
            }
        }

        // Then map network -> filesystem.
        if (uiSourceCode.project().type() === WebInspector.projectTypes.Network || uiSourceCode.project().type() === WebInspector.projectTypes.ContentScripts) {
            // Suggest for localhost only.
            if (!this._isLocalHost(uiSourceCode.originURL()))
                return;
            if (this._workspace.uiSourceCodeForURL(uiSourceCode.url) !== uiSourceCode)
                return;

            var filesystemProjects = this._workspace.projectsForType(WebInspector.projectTypes.FileSystem);
            for (var i = 0; i < filesystemProjects.length; ++i) {
                var name = uiSourceCode.name();
                var fsUiSourceCodes = filesystemProjects[i].uiSourceCodes();
                for (var j = 0; j < fsUiSourceCodes.length; ++j) {
                    if (fsUiSourceCodes[j].name() === name) {
                        this._showMappingInfobar(uiSourceCode, true);
                        return;
                    }
                }
            }
            if (this._workspaceInfobarAllowedSetting.get())
                this._showWorkspaceInfobar(uiSourceCode);
        }
    },

    /**
     * @param {string} url
     * @return {boolean}
     */
    _isLocalHost: function(url)
    {
        var parsedURL = url.asParsedURL();
        return !!parsedURL && parsedURL.host === "localhost";
    },

    /**
     * @param {!WebInspector.UISourceCode} uiSourceCode
     */
    _showWorkspaceInfobar: function(uiSourceCode)
    {
        var infobar = new WebInspector.UISourceCodeFrame.Infobar(WebInspector.UISourceCodeFrame.Infobar.Level.Info, WebInspector.UIString("Serving from the file system? Add your files into the workspace."));
        infobar.createDetailsRowMessage(WebInspector.UIString("If you add files into your DevTools workspace, your changes will be persisted to disk."));
        infobar.createDetailsRowMessage(WebInspector.UIString("To add a folder into the workspace, drag and drop it into the Sources panel."));
        this._appendInfobar(uiSourceCode, infobar);
    },

    _onWorkspaceInfobarDispose: function()
    {
        this._workspaceInfobarAllowedSetting.set(false);
    },

    /**
     * @param {!WebInspector.UISourceCode} uiSourceCode
     * @param {boolean} isNetwork
     */
    _showMappingInfobar: function(uiSourceCode, isNetwork)
    {
        var title;
        if (isNetwork)
            title = WebInspector.UIString("Map network resource '%s' to workspace?", uiSourceCode.originURL());
        else
            title = WebInspector.UIString("Map workspace resource '%s' to network?", uiSourceCode.path());

        var infobar = new WebInspector.UISourceCodeFrame.Infobar(WebInspector.UISourceCodeFrame.Infobar.Level.Info, title);
        infobar.createDetailsRowMessage(WebInspector.UIString("You can map files in your workspace to the ones loaded over the network. As a result, changes made in DevTools will be persisted to disk."));
        infobar.createDetailsRowMessage(WebInspector.UIString("Use context menu to establish the mapping at any time."));
        var anchor = createElementWithClass("a", "link");
        anchor.textContent = WebInspector.UIString("Establish the mapping now...");
        anchor.addEventListener("click", this._establishTheMapping.bind(this, uiSourceCode), false);
        infobar.createDetailsRowMessage("").appendChild(anchor);
        this._appendInfobar(uiSourceCode, infobar);
    },

    /**
     * @param {!WebInspector.UISourceCode} uiSourceCode
     * @param {?Event} event
     */
    _establishTheMapping: function(uiSourceCode, event)
    {
        event.consume(true);
        if (uiSourceCode.project().type() === WebInspector.projectTypes.FileSystem)
            this._sourcesPanel.mapFileSystemToNetwork(uiSourceCode);
        else
            this._sourcesPanel.mapNetworkToFileSystem(uiSourceCode);
    },

    /**
     * @param {!WebInspector.UISourceCode} uiSourceCode
     * @param {!WebInspector.UISourceCodeFrame.Infobar} infobar
     */
    _appendInfobar: function(uiSourceCode, infobar)
    {
        var uiSourceCodeFrame = this._sourcesView.viewForFile(uiSourceCode);

        var rowElement = infobar.createDetailsRowMessage(WebInspector.UIString("For more information on workspaces, refer to the "));
        rowElement.appendChild(WebInspector.createDocumentationAnchor("workspaces", WebInspector.UIString("workspaces documentation")));
        rowElement.createTextChild(".");
        uiSourceCode[WebInspector.WorkspaceMappingTip._infobarSymbol] = infobar;
        uiSourceCodeFrame.attachInfobars([infobar]);
        WebInspector.runCSSAnimationOnce(infobar.element, "source-frame-infobar-animation");
    }
}
