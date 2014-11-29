// Copyright 2014 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

/**
 * @constructor
 * @implements {WebInspector.TargetManager.Observer}
 */
WebInspector.CSSWorkspaceBinding = function()
{
    /** @type {!Map.<!WebInspector.Target, !WebInspector.CSSWorkspaceBinding.TargetInfo>} */
    this._targetToTargetInfo = new Map();
    WebInspector.targetManager.observeTargets(this);

    WebInspector.targetManager.addModelListener(WebInspector.ResourceTreeModel, WebInspector.ResourceTreeModel.EventTypes.MainFrameNavigated, this._mainFrameCreatedOrNavigated, this);
}

WebInspector.CSSWorkspaceBinding.prototype = {
    /**
     * @param {!WebInspector.Target} target
     */
    targetAdded: function(target)
    {
        this._targetToTargetInfo.set(target, new WebInspector.CSSWorkspaceBinding.TargetInfo(target, WebInspector.workspace, WebInspector.networkWorkspaceBinding));
    },

    /**
     * @param {!WebInspector.Target} target
     */
    targetRemoved: function(target)
    {
        this._targetToTargetInfo.remove(target)._dispose();
    },

    /**
     * @param {!WebInspector.CSSStyleSheetHeader} header
     * @param {!WebInspector.CSSSourceMapping} mapping
     */
    pushSourceMapping: function(header, mapping)
    {
        this._ensureInfoForHeader(header)._pushSourceMapping(mapping);
    },

    /**
     * @param {!WebInspector.CSSStyleSheetHeader} header
     * @return {?WebInspector.CSSWorkspaceBinding.HeaderInfo}
     */
    _headerInfo: function(header)
    {
        var map = this._targetToTargetInfo.get(header.target());
        return map._headerInfo(header.id) || null;
    },

    /**
     * @param {!WebInspector.CSSStyleSheetHeader} header
     * @return {!WebInspector.CSSWorkspaceBinding.HeaderInfo}
     */
    _ensureInfoForHeader: function(header)
    {
        var targetInfo = this._targetToTargetInfo.get(header.target());
        if (!targetInfo) {
            targetInfo = new WebInspector.CSSWorkspaceBinding.TargetInfo(header.target(), WebInspector.workspace, WebInspector.networkWorkspaceBinding);
            this._targetToTargetInfo.set(header.target(), targetInfo);
        }
        return targetInfo._ensureInfoForHeader(header);
    },

    /**
     * @param {!WebInspector.Event} event
     */
    _mainFrameCreatedOrNavigated: function(event)
    {
        var target = /** @type {!WebInspector.ResourceTreeModel} */ (event.target).target();
        this._targetToTargetInfo.get(target)._reset();
    },

    /**
     * @param {!WebInspector.CSSStyleSheetHeader} header
     */
    updateLocations: function(header)
    {
        var info = this._headerInfo(header);
        if (info)
            info._updateLocations();
    },

    /**
     * @param {!WebInspector.CSSLocation} rawLocation
     * @param {function(!WebInspector.UILocation):(boolean|undefined)} updateDelegate
     * @return {!WebInspector.CSSWorkspaceBinding.LiveLocation}
     */
    createLiveLocation: function(rawLocation, updateDelegate)
    {
        var header = rawLocation.styleSheetId ? rawLocation.target().cssModel.styleSheetHeaderForId(rawLocation.styleSheetId) : null;
        return new WebInspector.CSSWorkspaceBinding.LiveLocation(rawLocation.target().cssModel, header, rawLocation, updateDelegate);
    },

    /**
     * @param {!WebInspector.CSSWorkspaceBinding.LiveLocation} location
     */
    _addLiveLocation: function(location)
    {
        this._ensureInfoForHeader(location._header)._addLocation(location);
    },

    /**
     * @param {!WebInspector.CSSWorkspaceBinding.LiveLocation} location
     */
    _removeLiveLocation: function(location)
    {
        var info = this._headerInfo(location._header);
        if (info)
            info._removeLocation(location);
    },

    /**
     * @param {!WebInspector.CSSProperty} cssProperty
     * @param {boolean} forName
     * @return {?WebInspector.UILocation}
     */
    propertyUILocation: function(cssProperty, forName)
    {
        var style = cssProperty.ownerStyle;
        if (!style || !style.parentRule || !style.styleSheetId)
            return null;

        var range = cssProperty.range;
        if (!range)
            return null;

        var url = style.parentRule.resourceURL();
        if (!url)
            return null;

        var line = forName ? range.startLine : range.endLine;
        // End of range is exclusive, so subtract 1 from the end offset.
        var column = forName ? range.startColumn : range.endColumn - (cssProperty.text && cssProperty.text.endsWith(";") ? 2 : 1);
        var rawLocation = new WebInspector.CSSLocation(style.target(), style.styleSheetId, url, line, column);
        return this.rawLocationToUILocation(rawLocation);
    },

    /**
     * @param {?WebInspector.CSSLocation} rawLocation
     * @return {?WebInspector.UILocation}
     */
    rawLocationToUILocation: function(rawLocation)
    {
        if (!rawLocation)
            return null;
        var cssModel = rawLocation.target().cssModel;
        var frameIdToSheetIds = cssModel.styleSheetIdsByFrameIdForURL(rawLocation.url);
        if (!Object.values(frameIdToSheetIds).length)
            return null;
        var styleSheetIds = [];
        for (var frameId in frameIdToSheetIds)
            styleSheetIds = styleSheetIds.concat(frameIdToSheetIds[frameId]);
        var uiLocation;
        for (var i = 0; !uiLocation && i < styleSheetIds.length; ++i) {
            var header = cssModel.styleSheetHeaderForId(styleSheetIds[i]);
            if (!header)
                continue;
            var info = this._headerInfo(header);
            if (info)
                uiLocation = info._rawLocationToUILocation(rawLocation.lineNumber, rawLocation.columnNumber);
        }
        return uiLocation || null;
    }
}

/**
 * @constructor
 * @param {!WebInspector.Target} target
 * @param {!WebInspector.Workspace} workspace
 * @param {!WebInspector.NetworkWorkspaceBinding} networkWorkspaceBinding
 */
WebInspector.CSSWorkspaceBinding.TargetInfo = function(target, workspace, networkWorkspaceBinding)
{
    this._target = target;
    this._workspace = workspace;

    var cssModel = target.cssModel;
    this._stylesSourceMapping = new WebInspector.StylesSourceMapping(cssModel, workspace);
    this._sassSourceMapping = new WebInspector.SASSSourceMapping(cssModel, workspace, networkWorkspaceBinding);

    /** @type {!Map.<string, !WebInspector.CSSWorkspaceBinding.HeaderInfo>} */
    this._headerInfoById = new Map();

    cssModel.addEventListener(WebInspector.CSSStyleModel.Events.StyleSheetAdded, this._styleSheetAdded, this);
    cssModel.addEventListener(WebInspector.CSSStyleModel.Events.StyleSheetRemoved, this._styleSheetRemoved, this);
}

WebInspector.CSSWorkspaceBinding.TargetInfo.prototype = {
    /**
     * @param {!WebInspector.Event} event
     */
    _styleSheetAdded: function(event)
    {
        var header = /** @type {!WebInspector.CSSStyleSheetHeader} */ (event.data);
        this._stylesSourceMapping.addHeader(header);
        this._sassSourceMapping.addHeader(header);
    },

    /**
     * @param {!WebInspector.Event} event
     */
    _styleSheetRemoved: function(event)
    {
        var header = /** @type {!WebInspector.CSSStyleSheetHeader} */ (event.data);
        this._stylesSourceMapping.removeHeader(header);
        this._sassSourceMapping.removeHeader(header);
        this._headerInfoById.remove(header.id);
    },

    /**
     * @param {!CSSAgent.StyleSheetId} id
     */
    _headerInfo: function(id)
    {
        return this._headerInfoById.get(id);
    },

    _ensureInfoForHeader: function(header)
    {
        var info = this._headerInfoById.get(header.id);
        if (!info) {
            info = new WebInspector.CSSWorkspaceBinding.HeaderInfo(header);
            this._headerInfoById.set(header.id, info);
        }
        return info;
    },

    _dispose: function()
    {
        this._reset();
        this._target.cssModel.removeEventListener(WebInspector.CSSStyleModel.Events.StyleSheetAdded, this._styleSheetAdded, this);
        this._target.cssModel.removeEventListener(WebInspector.CSSStyleModel.Events.StyleSheetRemoved, this._styleSheetRemoved, this);
    },

    _reset: function()
    {
        this._headerInfoById.clear();
    }
}

/**
 * @constructor
 * @param {!WebInspector.CSSStyleSheetHeader} header
 */
WebInspector.CSSWorkspaceBinding.HeaderInfo = function(header)
{
    this._header = header;

    /** @type {!Array.<!WebInspector.CSSSourceMapping>} */
    this._sourceMappings = [];

    /** @type {!Set.<!WebInspector.LiveLocation>} */
    this._locations = new Set();
}

WebInspector.CSSWorkspaceBinding.HeaderInfo.prototype = {
    /**
     * @param {!WebInspector.LiveLocation} location
     */
    _addLocation: function(location)
    {
        this._locations.add(location);
        location.update();
    },

    /**
     * @param {!WebInspector.LiveLocation} location
     */
    _removeLocation: function(location)
    {
        this._locations.remove(location);
    },

    _updateLocations: function()
    {
        var items = this._locations.valuesArray();
        for (var i = 0; i < items.length; ++i)
            items[i].update();
    },

    /**
     * @param {number} lineNumber
     * @param {number=} columnNumber
     * @return {?WebInspector.UILocation}
     */
    _rawLocationToUILocation: function(lineNumber, columnNumber)
    {
        var uiLocation = null;
        var rawLocation = new WebInspector.CSSLocation(this._header.target(), this._header.id, this._header.resourceURL(), lineNumber, columnNumber);
        for (var i = this._sourceMappings.length - 1; !uiLocation && i >= 0; --i)
            uiLocation = this._sourceMappings[i].rawLocationToUILocation(rawLocation);
        return uiLocation;
    },

    /**
     * @param {!WebInspector.CSSSourceMapping} sourceMapping
     */
    _pushSourceMapping: function(sourceMapping)
    {
        this._sourceMappings.push(sourceMapping);
        this._updateLocations();
    }
}

/**
 * @constructor
 * @extends {WebInspector.LiveLocation}
 * @param {!WebInspector.CSSStyleModel} cssModel
 * @param {?WebInspector.CSSStyleSheetHeader} header
 * @param {!WebInspector.CSSLocation} rawLocation
 * @param {function(!WebInspector.UILocation):(boolean|undefined)} updateDelegate
 */
WebInspector.CSSWorkspaceBinding.LiveLocation = function(cssModel, header, rawLocation, updateDelegate)
{
    WebInspector.LiveLocation.call(this, updateDelegate);
    this._cssModel = cssModel;
    this._rawLocation = rawLocation;
    if (!header)
        this._clearStyleSheet();
    else
        this._setStyleSheet(header);
}

WebInspector.CSSWorkspaceBinding.LiveLocation.prototype = {
    /**
     * @param {!WebInspector.Event} event
     */
    _styleSheetAdded: function(event)
    {
        console.assert(!this._header);
        var header = /** @type {!WebInspector.CSSStyleSheetHeader} */ (event.data);
        if (header.sourceURL && header.sourceURL === this._rawLocation.url)
            this._setStyleSheet(header);
    },

    /**
     * @param {!WebInspector.Event} event
     */
    _styleSheetRemoved: function(event)
    {
        console.assert(this._header);
        var header = /** @type {!WebInspector.CSSStyleSheetHeader} */ (event.data);
        if (this._header !== header)
            return;
        WebInspector.cssWorkspaceBinding._removeLiveLocation(this);
        this._clearStyleSheet();
    },

    /**
     * @param {!WebInspector.CSSStyleSheetHeader} header
     */
    _setStyleSheet: function(header)
    {
        this._header = header;
        WebInspector.cssWorkspaceBinding._addLiveLocation(this);
        this._cssModel.removeEventListener(WebInspector.CSSStyleModel.Events.StyleSheetAdded, this._styleSheetAdded, this);
        this._cssModel.addEventListener(WebInspector.CSSStyleModel.Events.StyleSheetRemoved, this._styleSheetRemoved, this);
    },

    _clearStyleSheet: function()
    {
        delete this._header;
        this._cssModel.removeEventListener(WebInspector.CSSStyleModel.Events.StyleSheetRemoved, this._styleSheetRemoved, this);
        this._cssModel.addEventListener(WebInspector.CSSStyleModel.Events.StyleSheetAdded, this._styleSheetAdded, this);
    },

    /**
     * @return {?WebInspector.UILocation}
     */
    uiLocation: function()
    {
        var cssLocation = this._rawLocation;
        if (this._header) {
            var headerInfo = WebInspector.cssWorkspaceBinding._headerInfo(this._header);
            return headerInfo._rawLocationToUILocation(cssLocation.lineNumber, cssLocation.columnNumber);
        }
        var uiSourceCode = WebInspector.workspace.uiSourceCodeForURL(cssLocation.url);
        if (!uiSourceCode)
            return null;
        return uiSourceCode.uiLocation(cssLocation.lineNumber, cssLocation.columnNumber);
    },

    dispose: function()
    {
        WebInspector.LiveLocation.prototype.dispose.call(this);
        if (this._header)
            WebInspector.cssWorkspaceBinding._removeLiveLocation(this);
        this._cssModel.removeEventListener(WebInspector.CSSStyleModel.Events.StyleSheetAdded, this._styleSheetAdded, this);
        this._cssModel.removeEventListener(WebInspector.CSSStyleModel.Events.StyleSheetRemoved, this._styleSheetRemoved, this);
    },

    __proto__: WebInspector.LiveLocation.prototype
}

/**
 * @interface
 */
WebInspector.CSSSourceMapping = function()
{
}

WebInspector.CSSSourceMapping.prototype = {
    /**
     * @param {!WebInspector.CSSLocation} rawLocation
     * @return {?WebInspector.UILocation}
     */
    rawLocationToUILocation: function(rawLocation) { },

    /**
     * @param {!WebInspector.UISourceCode} uiSourceCode
     * @param {number} lineNumber
     * @param {number} columnNumber
     * @return {?WebInspector.CSSLocation}
     */
    uiLocationToRawLocation: function(uiSourceCode, lineNumber, columnNumber) { },

    /**
     * @return {boolean}
     */
    isIdentity: function() { },

    /**
     * @param {!WebInspector.UISourceCode} uiSourceCode
     * @param {number} lineNumber
     * @return {boolean}
     */
    uiLineHasMapping: function(uiSourceCode, lineNumber) { }
}

/**
 * @type {!WebInspector.CSSWorkspaceBinding}
 */
WebInspector.cssWorkspaceBinding;
