/*
 * Copyright (C) 2012 Google Inc. All rights reserved.
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
 * @implements {WebInspector.CSSSourceMapping}
 * @param {!WebInspector.CSSStyleModel} cssModel
 * @param {!WebInspector.Workspace} workspace
 * @param {!WebInspector.NetworkMapping} networkMapping
 */
WebInspector.StylesSourceMapping = function(cssModel, workspace, networkMapping)
{
    this._cssModel = cssModel;
    this._workspace = workspace;
    this._workspace.addEventListener(WebInspector.Workspace.Events.ProjectRemoved, this._projectRemoved, this);
    this._workspace.addEventListener(WebInspector.Workspace.Events.UISourceCodeAdded, this._uiSourceCodeAddedToWorkspace, this);
    this._workspace.addEventListener(WebInspector.Workspace.Events.UISourceCodeRemoved, this._uiSourceCodeRemoved, this);
    this._networkMapping = networkMapping;

    cssModel.target().resourceTreeModel.addEventListener(WebInspector.ResourceTreeModel.EventTypes.MainFrameNavigated, this._mainFrameNavigated, this);

    this._cssModel.addEventListener(WebInspector.CSSStyleModel.Events.StyleSheetChanged, this._styleSheetChanged, this);
    this._initialize();
}

WebInspector.StylesSourceMapping.ChangeUpdateTimeoutMs = 200;

WebInspector.StylesSourceMapping.prototype = {
    /**
     * @override
     * @param {!WebInspector.CSSLocation} rawLocation
     * @return {?WebInspector.UILocation}
     */
    rawLocationToUILocation: function(rawLocation)
    {
        var uiSourceCode = this._networkMapping.uiSourceCodeForURL(rawLocation.url, rawLocation.target());
        if (!uiSourceCode)
            return null;
        var lineNumber = rawLocation.lineNumber;
        var columnNumber = rawLocation.columnNumber;
        var header = this._cssModel.styleSheetHeaderForId(rawLocation.styleSheetId);
        if (header && header.isInline && header.hasSourceURL) {
            lineNumber -= header.lineNumberInSource(0);
            columnNumber -= header.columnNumberInSource(lineNumber, 0);
        }
        return uiSourceCode.uiLocation(lineNumber, columnNumber);
    },

    /**
     * @override
     * @param {!WebInspector.UISourceCode} uiSourceCode
     * @param {number} lineNumber
     * @param {number} columnNumber
     * @return {?WebInspector.CSSLocation}
     */
    uiLocationToRawLocation: function(uiSourceCode, lineNumber, columnNumber)
    {
        return null;
    },

    /**
     * @override
     * @return {boolean}
     */
    isIdentity: function()
    {
        return true;
    },

    /**
     * @override
     * @param {!WebInspector.UISourceCode} uiSourceCode
     * @param {number} lineNumber
     * @return {boolean}
     */
    uiLineHasMapping: function(uiSourceCode, lineNumber)
    {
        return true;
    },

    /**
     * @return {!WebInspector.Target}
     */
    target: function()
    {
        return this._cssModel.target();
    },

    /**
     * @param {!WebInspector.CSSStyleSheetHeader} header
     */
    addHeader: function(header)
    {
        var url = header.resourceURL();
        if (!url)
            return;

        WebInspector.cssWorkspaceBinding.pushSourceMapping(header, this);
        var map = this._urlToHeadersByFrameId[url];
        if (!map) {
            map = /** @type {!Map.<string, !Map.<string, !WebInspector.CSSStyleSheetHeader>>} */ (new Map());
            this._urlToHeadersByFrameId[url] = map;
        }
        var headersById = map.get(header.frameId);
        if (!headersById) {
            headersById = /** @type {!Map.<string, !WebInspector.CSSStyleSheetHeader>} */ (new Map());
            map.set(header.frameId, headersById);
        }
        headersById.set(header.id, header);
        var uiSourceCode = this._networkMapping.uiSourceCodeForURL(url, header.target());
        if (uiSourceCode)
            this._bindUISourceCode(uiSourceCode, header);
    },

    /**
     * @param {!WebInspector.CSSStyleSheetHeader} header
     */
    removeHeader: function(header)
    {
        var url = header.resourceURL();
        if (!url)
            return;

        var map = this._urlToHeadersByFrameId[url];
        console.assert(map);
        var headersById = map.get(header.frameId);
        console.assert(headersById);
        headersById.remove(header.id);

        if (!headersById.size) {
            map.remove(header.frameId);
            if (!map.size) {
                delete this._urlToHeadersByFrameId[url];
                var uiSourceCode = this._networkMapping.uiSourceCodeForURL(url, header.target());
                if (uiSourceCode)
                    this._unbindUISourceCode(uiSourceCode);
            }
        }
    },

    /**
     * @param {!WebInspector.UISourceCode} uiSourceCode
     */
    _unbindUISourceCode: function(uiSourceCode)
    {
        var styleFile = this._styleFiles.get(uiSourceCode);
        if (!styleFile)
            return;
        styleFile.dispose();
        this._styleFiles.remove(uiSourceCode);
    },

    /**
     * @param {!WebInspector.Event} event
     */
    _uiSourceCodeAddedToWorkspace: function(event)
    {
        var uiSourceCode = /** @type {!WebInspector.UISourceCode} */ (event.data);
        var networkURL = this._networkMapping.networkURL(uiSourceCode);
        if (!networkURL || !this._urlToHeadersByFrameId[networkURL])
            return;
        this._bindUISourceCode(uiSourceCode, this._urlToHeadersByFrameId[networkURL].valuesArray()[0].valuesArray()[0]);
    },

    /**
     * @param {!WebInspector.UISourceCode} uiSourceCode
     * @param {!WebInspector.CSSStyleSheetHeader} header
     */
    _bindUISourceCode: function(uiSourceCode, header)
    {
        if (this._styleFiles.get(uiSourceCode) || (header.isInline && !header.hasSourceURL))
            return;
        this._styleFiles.set(uiSourceCode, new WebInspector.StyleFile(uiSourceCode, this));
        WebInspector.cssWorkspaceBinding.updateLocations(header);
    },

    /**
     * @param {!WebInspector.Event} event
     */
    _projectRemoved: function(event)
    {
        var project = /** @type {!WebInspector.Project} */ (event.data);
        var uiSourceCodes = project.uiSourceCodes();
        for (var i = 0; i < uiSourceCodes.length; ++i)
            this._unbindUISourceCode(uiSourceCodes[i]);
    },

    /**
     * @param {!WebInspector.Event} event
     */
    _uiSourceCodeRemoved: function(event)
    {
        var uiSourceCode = /** @type {!WebInspector.UISourceCode} */ (event.data);
        this._unbindUISourceCode(uiSourceCode);
    },

    _initialize: function()
    {
        /** @type {!Object.<string, !Map.<string, !Map.<string, !WebInspector.CSSStyleSheetHeader>>>} */
        this._urlToHeadersByFrameId = {};
        /** @type {!Map.<!WebInspector.UISourceCode, !WebInspector.StyleFile>} */
        this._styleFiles = new Map();
    },

    /**
     * @param {!WebInspector.Event} event
     */
    _mainFrameNavigated: function(event)
    {
        for (var url in this._urlToHeadersByFrameId) {
            var uiSourceCode = this._networkMapping.uiSourceCodeForURL(url, this._cssModel.target());
            if (!uiSourceCode)
                continue;
            this._unbindUISourceCode(uiSourceCode);
        }
        this._initialize();
    },

    /**
     * @param {!WebInspector.UISourceCode} uiSourceCode
     * @param {string} content
     * @param {boolean} majorChange
     * @return {!Promise<?string>}
     */
    _setStyleContent: function(uiSourceCode, content, majorChange)
    {
        var networkURL = this._networkMapping.networkURL(uiSourceCode);
        var styleSheetIds = this._cssModel.styleSheetIdsForURL(networkURL);
        if (!styleSheetIds.length)
            return Promise.resolve(/** @type {?string} */("No stylesheet found: " + networkURL));

        this._isSettingContent = true;

        /**
         * @param {?string} error
         * @this {WebInspector.StylesSourceMapping}
         * @return {?string}
         */
        function callback(error)
        {
            delete this._isSettingContent;
            return error || null;
        }

        var promises = [];
        for (var i = 0; i < styleSheetIds.length; ++i)
            promises.push(this._cssModel.setStyleSheetText(styleSheetIds[i], content, majorChange));

        return Promise.all(promises).spread(callback.bind(this));
    },

    /**
     * @param {!WebInspector.Event} event
     */
    _styleSheetChanged: function(event)
    {
        if (this._isSettingContent)
            return;

        this._updateStyleSheetTextSoon(event.data.styleSheetId);
    },

    /**
     * @param {!CSSAgent.StyleSheetId} styleSheetId
     */
    _updateStyleSheetTextSoon: function(styleSheetId)
    {
        if (this._updateStyleSheetTextTimer)
            clearTimeout(this._updateStyleSheetTextTimer);

        this._updateStyleSheetTextTimer = setTimeout(this._updateStyleSheetText.bind(this, styleSheetId), WebInspector.StylesSourceMapping.ChangeUpdateTimeoutMs);
    },

    /**
     * @param {!CSSAgent.StyleSheetId} styleSheetId
     */
    _updateStyleSheetText: function(styleSheetId)
    {
        if (this._updateStyleSheetTextTimer) {
            clearTimeout(this._updateStyleSheetTextTimer);
            delete this._updateStyleSheetTextTimer;
        }

        var header = this._cssModel.styleSheetHeaderForId(styleSheetId);
        if (!header)
            return;
        var styleSheetURL = header.resourceURL();
        if (!styleSheetURL)
            return;
        var uiSourceCode = this._networkMapping.uiSourceCodeForURL(styleSheetURL, header.target());
        if (!uiSourceCode)
            return;
        header.requestContent(callback.bind(this, uiSourceCode));

        /**
         * @param {!WebInspector.UISourceCode} uiSourceCode
         * @param {?string} content
         * @this {WebInspector.StylesSourceMapping}
         */
        function callback(uiSourceCode, content)
        {
            var styleFile = this._styleFiles.get(uiSourceCode);
            if (styleFile)
                styleFile.addRevision(content || "");
        }
    }
}

/**
 * @constructor
 * @param {!WebInspector.UISourceCode} uiSourceCode
 * @param {!WebInspector.StylesSourceMapping} mapping
 */
WebInspector.StyleFile = function(uiSourceCode, mapping)
{
    this._uiSourceCode = uiSourceCode;
    this._mapping = mapping;
    this._uiSourceCode.addEventListener(WebInspector.UISourceCode.Events.WorkingCopyChanged, this._workingCopyChanged, this);
    this._uiSourceCode.addEventListener(WebInspector.UISourceCode.Events.WorkingCopyCommitted, this._workingCopyCommitted, this);
    this._commitThrottler = new WebInspector.Throttler(WebInspector.StyleFile.updateTimeout);
}

WebInspector.StyleFile.updateTimeout = 200;

WebInspector.StyleFile.prototype = {
    /**
     * @param {!WebInspector.Event} event
     */
    _workingCopyCommitted: function(event)
    {
        if (this._isAddingRevision)
            return;

        this._isMajorChangePending = true;
        this._commitThrottler.schedule(this._commitIncrementalEdit.bind(this), true);
    },

    /**
     * @param {!WebInspector.Event} event
     */
    _workingCopyChanged: function(event)
    {
        if (this._isAddingRevision)
            return;

        this._commitThrottler.schedule(this._commitIncrementalEdit.bind(this), false);
    },

    _commitIncrementalEdit: function()
    {
        var promise = this._mapping._setStyleContent(this._uiSourceCode, this._uiSourceCode.workingCopy(), this._isMajorChangePending)
            .then(this._styleContentSet.bind(this))
        this._isMajorChangePending = false;
        return promise;
    },

    /**
     * @param {?string} error
     */
    _styleContentSet: function(error)
    {
        if (error)
            WebInspector.console.error(error);
    },

    /**
     * @param {string} content
     */
    addRevision: function(content)
    {
        this._isAddingRevision = true;
        this._uiSourceCode.addRevision(content);
        delete this._isAddingRevision;
    },

    dispose: function()
    {
        this._uiSourceCode.removeEventListener(WebInspector.UISourceCode.Events.WorkingCopyCommitted, this._workingCopyCommitted, this);
        this._uiSourceCode.removeEventListener(WebInspector.UISourceCode.Events.WorkingCopyChanged, this._workingCopyChanged, this);
    }
}
