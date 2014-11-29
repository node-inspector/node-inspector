// Copyright 2014 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

/**
 * @constructor
 * @implements {WebInspector.DebuggerSourceMapping}
 * @param {!WebInspector.Target} target
 * @param {!WebInspector.ScriptFormatterEditorAction} editorAction
 */
WebInspector.FormatterScriptMapping = function(target, editorAction)
{
    this._target = target;
    this._editorAction = editorAction;
}

WebInspector.FormatterScriptMapping.prototype = {
    /**
     * @param {!WebInspector.DebuggerModel.Location} rawLocation
     * @return {?WebInspector.UILocation}
     */
    rawLocationToUILocation: function(rawLocation)
    {
        var debuggerModelLocation = /** @type {!WebInspector.DebuggerModel.Location} */ (rawLocation);
        var script = debuggerModelLocation.script();
        var uiSourceCode = this._editorAction._uiSourceCodes.get(script);
        if (!uiSourceCode)
            return null;

        var formatData = this._editorAction._formatData.get(uiSourceCode);
        if (!formatData)
            return null;
        var mapping = formatData.mapping;
        var lineNumber = debuggerModelLocation.lineNumber;
        var columnNumber = debuggerModelLocation.columnNumber || 0;
        var formattedLocation = mapping.originalToFormatted(lineNumber, columnNumber);
        return uiSourceCode.uiLocation(formattedLocation[0], formattedLocation[1]);
    },

    /**
     * @param {!WebInspector.UISourceCode} uiSourceCode
     * @param {number} lineNumber
     * @param {number} columnNumber
     * @return {?WebInspector.DebuggerModel.Location}
     */
    uiLocationToRawLocation: function(uiSourceCode, lineNumber, columnNumber)
    {
        var formatData = this._editorAction._formatData.get(uiSourceCode);
        if (!formatData)
            return null;
        var originalLocation = formatData.mapping.formattedToOriginal(lineNumber, columnNumber);
        for (var i = 0; i < formatData.scripts.length; ++i) {
            if (formatData.scripts[i].target() === this._target)
                return this._target.debuggerModel.createRawLocation(formatData.scripts[i], originalLocation[0], originalLocation[1])
        }
        return null;
    },

    /**
     * @return {boolean}
     */
    isIdentity: function()
    {
        return false;
    },

    /**
     * @param {!WebInspector.UISourceCode} uiSourceCode
     * @param {number} lineNumber
     * @return {boolean}
     */
    uiLineHasMapping: function(uiSourceCode, lineNumber)
    {
        return true;
    }

}

/**
 * @constructor
 * @param {string} projectId
 * @param {string} path
 * @param {!WebInspector.FormatterSourceMapping} mapping
 * @param {!Array.<!WebInspector.Script>} scripts
 */
WebInspector.FormatterScriptMapping.FormatData = function(projectId, path, mapping, scripts)
{
    this.projectId = projectId;
    this.path = path;
    this.mapping = mapping;
    this.scripts = scripts;
}

/**
 * @constructor
 * @param {!WebInspector.Workspace} workspace
 * @param {string} id
 * @extends {WebInspector.ContentProviderBasedProjectDelegate}
 */
WebInspector.FormatterProjectDelegate = function(workspace, id)
{
    WebInspector.ContentProviderBasedProjectDelegate.call(this, workspace, id, WebInspector.projectTypes.Formatter);
}

WebInspector.FormatterProjectDelegate.prototype = {
    /**
     * @return {string}
     */
    displayName: function()
    {
        return "formatter";
    },

    /**
     * @param {string} name
     * @param {string} sourceURL
     * @param {!WebInspector.ResourceType} contentType
     * @param {string} content
     * @return {string}
     */
    _addFormatted: function(name, sourceURL, contentType, content)
    {
        var contentProvider = new WebInspector.StaticContentProvider(contentType, content);
        return this.addContentProvider(sourceURL, name + ":formatted", sourceURL, "deobfuscated:" + sourceURL, contentProvider);
    },

    /**
     * @param {string} path
     */
    _removeFormatted: function(path)
    {
        this.removeFile(path);
    },

    __proto__: WebInspector.ContentProviderBasedProjectDelegate.prototype
}

/**
 * @constructor
 * @implements {WebInspector.SourcesView.EditorAction}
 * @implements {WebInspector.TargetManager.Observer}
 */
WebInspector.ScriptFormatterEditorAction = function()
{
    this._projectId = "formatter:";
    this._projectDelegate = new WebInspector.FormatterProjectDelegate(WebInspector.workspace, this._projectId);

    /** @type {!Map.<!WebInspector.Script, !WebInspector.UISourceCode>} */
    this._uiSourceCodes = new Map();
    /** @type {!Map.<string, string>} */
    this._formattedPaths = new Map();
    /** @type {!Map.<!WebInspector.UISourceCode, !WebInspector.FormatterScriptMapping.FormatData>} */
    this._formatData = new Map();

    /** @type {!Set.<string>} */
    this._pathsToFormatOnLoad = new Set();

    /** @type {!Map.<!WebInspector.Target, !WebInspector.FormatterScriptMapping>} */
    this._scriptMappingByTarget = new Map();
    this._workspace = WebInspector.workspace;
    WebInspector.targetManager.observeTargets(this);
}

WebInspector.ScriptFormatterEditorAction.prototype = {
    /**
     * @param {!WebInspector.Target} target
     */
    targetAdded: function(target)
    {
        this._scriptMappingByTarget.set(target, new WebInspector.FormatterScriptMapping(target, this));
        target.debuggerModel.addEventListener(WebInspector.DebuggerModel.Events.GlobalObjectCleared, this._debuggerReset, this);
    },

    /**
     * @param {!WebInspector.Target} target
     */
    targetRemoved: function(target)
    {
        this._scriptMappingByTarget.remove(target);
        this._cleanForTarget(target);
        target.debuggerModel.removeEventListener(WebInspector.DebuggerModel.Events.GlobalObjectCleared, this._debuggerReset, this);
    },

    /**
     * @param {!WebInspector.Event} event
     */
    _editorSelected: function(event)
    {
        var uiSourceCode = /** @type {!WebInspector.UISourceCode} */ (event.data);
        this._updateButton(uiSourceCode);

        var path = uiSourceCode.project().id() + ":" + uiSourceCode.path();
        if (this._isFormatableScript(uiSourceCode) && uiSourceCode.url && this._pathsToFormatOnLoad.has(path) && !this._formattedPaths.get(path))
            this._formatUISourceCodeScript(uiSourceCode);
    },

    /**
     * @param {!WebInspector.Event} event
     */
    _editorClosed: function(event)
    {
        var uiSourceCode = /** @type {!WebInspector.UISourceCode} */ (event.data.uiSourceCode);
        var wasSelected = /** @type {boolean} */ (event.data.wasSelected);

        if (wasSelected)
            this._updateButton(null);
        this._discardFormattedUISourceCodeScript(uiSourceCode);
    },

    /**
     * @param {?WebInspector.UISourceCode} uiSourceCode
     */
    _updateButton: function(uiSourceCode)
    {
        this._button.element.classList.toggle("hidden", !this._isFormatableScript(uiSourceCode));
    },

    /**
     * @param {!WebInspector.SourcesView} sourcesView
     * @return {!WebInspector.StatusBarButton}
     */
    button: function(sourcesView)
    {
        if (this._button)
            return this._button;

        this._sourcesView = sourcesView;
        this._sourcesView.addEventListener(WebInspector.SourcesView.Events.EditorSelected, this._editorSelected.bind(this));
        this._sourcesView.addEventListener(WebInspector.SourcesView.Events.EditorClosed, this._editorClosed.bind(this));

        this._button = new WebInspector.StatusBarButton(WebInspector.UIString("Pretty print"), "format-status-bar-item");
        this._button.setToggled(false);
        this._button.addEventListener("click", this._toggleFormatScriptSource, this);
        this._updateButton(sourcesView.currentUISourceCode());

        return this._button;
    },

    /**
     * @param {?WebInspector.UISourceCode} uiSourceCode
     * @return {boolean}
     */
    _isFormatableScript: function(uiSourceCode)
    {
        if (!uiSourceCode)
            return false;
        var supportedProjectTypes = [WebInspector.projectTypes.Network, WebInspector.projectTypes.Debugger, WebInspector.projectTypes.ContentScripts];
        if (supportedProjectTypes.indexOf(uiSourceCode.project().type()) === -1)
            return false;
        var contentType = uiSourceCode.contentType();
        return contentType === WebInspector.resourceTypes.Script || contentType === WebInspector.resourceTypes.Document;
    },

    _toggleFormatScriptSource: function()
    {
        var uiSourceCode = this._sourcesView.currentUISourceCode();
        if (!this._isFormatableScript(uiSourceCode))
            return;
        this._formatUISourceCodeScript(uiSourceCode);

        WebInspector.notifications.dispatchEventToListeners(WebInspector.UserMetrics.UserAction, {
            action: WebInspector.UserMetrics.UserActionNames.TogglePrettyPrint,
            enabled: true,
            url: uiSourceCode.originURL()
        });
    },

    /**
     * @param {!WebInspector.UISourceCode} uiSourceCode
     * @param {!WebInspector.UISourceCode} formattedUISourceCode
     * @param {!WebInspector.FormatterSourceMapping} mapping
     * @private
     */
    _showIfNeeded: function(uiSourceCode, formattedUISourceCode, mapping)
    {
        if (uiSourceCode !== this._sourcesView.currentUISourceCode())
            return;
        var sourceFrame = this._sourcesView.viewForFile(uiSourceCode);
        var start = [0, 0];
        if (sourceFrame) {
            var selection = sourceFrame.selection();
            start = mapping.originalToFormatted(selection.startLine, selection.startColumn);
        }
        this._sourcesView.showSourceLocation(formattedUISourceCode, start[0], start[1]);
        this._updateButton(formattedUISourceCode);
    },

    /**
     * @param {!WebInspector.UISourceCode} formattedUISourceCode
     */
    _discardFormattedUISourceCodeScript: function(formattedUISourceCode)
    {
        var formatData = this._formatData.get(formattedUISourceCode);
        if (!formatData)
            return;

        this._formatData.remove(formattedUISourceCode);
        var path = formatData.projectId + ":" + formatData.path;
        this._formattedPaths.remove(path);
        this._pathsToFormatOnLoad.remove(path);
        for (var i = 0; i < formatData.scripts.length; ++i) {
            this._uiSourceCodes.remove(formatData.scripts[i]);
            WebInspector.debuggerWorkspaceBinding.popSourceMapping(formatData.scripts[i]);
        }
        this._projectDelegate._removeFormatted(formattedUISourceCode.path());
    },

    /**
     * @param {!WebInspector.Target} target
     */
    _cleanForTarget: function(target)
    {
        var uiSourceCodes = this._formatData.keysArray();
        for (var i = 0; i < uiSourceCodes.length; ++i) {
            WebInspector.debuggerWorkspaceBinding.setSourceMapping(target, uiSourceCodes[i], null);
            var formatData = this._formatData.get(uiSourceCodes[i]);
            var scripts = [];
            for (var j = 0; j < formatData.scripts.length; ++j) {
                if (formatData.scripts[j].target() === target)
                    this._uiSourceCodes.remove(formatData.scripts[j]);
                else
                    scripts.push(formatData.scripts[j]);
            }

            if (scripts.length)
                formatData.scripts = scripts;
            else {
                this._formattedPaths.remove(formatData.projectId + ":" + formatData.path);
                this._formatData.remove(uiSourceCodes[i]);
                this._projectDelegate._removeFormatted(uiSourceCodes[i].path());
            }
        }
    },

    /**
     * @param {!WebInspector.Event} event
     */
    _debuggerReset: function(event)
    {
        var debuggerModel = /** @type {!WebInspector.DebuggerModel} */ (event.target);
        this._cleanForTarget(debuggerModel.target());
    },

    /**
     * @param {!WebInspector.UISourceCode} uiSourceCode
     * @return {!Array.<!WebInspector.Script>}
     */
    _scriptsForUISourceCode: function(uiSourceCode)
    {
        /**
         * @param {!WebInspector.Script} script
         * @return {boolean}
         */
        function isInlineScript(script)
        {
            return script.isInlineScript() && !script.hasSourceURL;
        }

        if (uiSourceCode.contentType() === WebInspector.resourceTypes.Document) {
            var scripts = [];
            var targets = WebInspector.targetManager.targets();
            for (var i = 0; i < targets.length; ++i)
                scripts.pushAll(targets[i].debuggerModel.scriptsForSourceURL(uiSourceCode.url));
            return scripts.filter(isInlineScript);
        }
        if (uiSourceCode.contentType() === WebInspector.resourceTypes.Script) {
            var rawLocations = WebInspector.debuggerWorkspaceBinding.uiLocationToRawLocations(uiSourceCode, 0, 0);
            return rawLocations.map(function(rawLocation) { return rawLocation.script()});
        }
        return [];
    },

    /**
     * @param {!WebInspector.UISourceCode} uiSourceCode
     */
    _formatUISourceCodeScript: function(uiSourceCode)
    {
        var formattedPath = this._formattedPaths.get(uiSourceCode.project().id() + ":" + uiSourceCode.path());
        if (formattedPath) {
            var uiSourceCodePath = formattedPath;
            var formattedUISourceCode = this._workspace.uiSourceCode(this._projectId, uiSourceCodePath);
            var formatData = formattedUISourceCode ? this._formatData.get(formattedUISourceCode) : null;
            if (formatData)
                 this._showIfNeeded(uiSourceCode, /** @type {!WebInspector.UISourceCode} */ (formattedUISourceCode), formatData.mapping);
            return;
        }

        uiSourceCode.requestContent(contentLoaded.bind(this));

        /**
         * @this {WebInspector.ScriptFormatterEditorAction}
         * @param {?string} content
         */
        function contentLoaded(content)
        {
            var formatter = WebInspector.Formatter.createFormatter(uiSourceCode.contentType());
            var highlighterType = WebInspector.SourcesView.uiSourceCodeHighlighterType(uiSourceCode);
            formatter.formatContent(highlighterType, content || "", innerCallback.bind(this));
        }

        /**
         * @this {WebInspector.ScriptFormatterEditorAction}
         * @param {string} formattedContent
         * @param {!WebInspector.FormatterSourceMapping} formatterMapping
         */
        function innerCallback(formattedContent, formatterMapping)
        {
            var scripts = this._scriptsForUISourceCode(uiSourceCode);
            var name;
            if (uiSourceCode.contentType() === WebInspector.resourceTypes.Document)
                name = uiSourceCode.displayName();
            else
                name = uiSourceCode.name() || (scripts.length ? scripts[0].scriptId : "");

            formattedPath = this._projectDelegate._addFormatted(name, uiSourceCode.url, uiSourceCode.contentType(), formattedContent);
            var formattedUISourceCode = /** @type {!WebInspector.UISourceCode} */ (this._workspace.uiSourceCode(this._projectId, formattedPath));
            var formatData = new WebInspector.FormatterScriptMapping.FormatData(uiSourceCode.project().id(), uiSourceCode.path(), formatterMapping, scripts);
            this._formatData.set(formattedUISourceCode, formatData);
            var path = uiSourceCode.project().id() + ":" + uiSourceCode.path();
            this._formattedPaths.set(path, formattedPath);
            this._pathsToFormatOnLoad.add(path);
            for (var i = 0; i < scripts.length; ++i) {
                this._uiSourceCodes.set(scripts[i], formattedUISourceCode);
                var scriptMapping = /** @type {!WebInspector.FormatterScriptMapping} */(this._scriptMappingByTarget.get(scripts[i].target()));
                WebInspector.debuggerWorkspaceBinding.pushSourceMapping(scripts[i], scriptMapping);
            }

            var targets = WebInspector.targetManager.targets();
            for (var i = 0; i < targets.length; ++i) {
                var scriptMapping = /** @type {!WebInspector.FormatterScriptMapping} */(this._scriptMappingByTarget.get(targets[i]));
                WebInspector.debuggerWorkspaceBinding.setSourceMapping(targets[i], formattedUISourceCode, scriptMapping);
            }
            this._showIfNeeded(uiSourceCode, formattedUISourceCode, formatterMapping);
        }
    }
}
