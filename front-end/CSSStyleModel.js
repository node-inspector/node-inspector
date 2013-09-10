/*
 * Copyright (C) 2010 Google Inc. All rights reserved.
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
 * @param {WebInspector.Workspace} workspace
 */
WebInspector.CSSStyleModel = function(workspace)
{
    this._workspace = workspace;
    this._pendingCommandsMajorState = [];
    WebInspector.domAgent.addEventListener(WebInspector.DOMAgent.Events.UndoRedoRequested, this._undoRedoRequested, this);
    WebInspector.domAgent.addEventListener(WebInspector.DOMAgent.Events.UndoRedoCompleted, this._undoRedoCompleted, this);
    WebInspector.resourceTreeModel.addEventListener(WebInspector.ResourceTreeModel.EventTypes.MainFrameCreatedOrNavigated, this._mainFrameCreatedOrNavigated, this);
    this._namedFlowCollections = {};
    WebInspector.domAgent.addEventListener(WebInspector.DOMAgent.Events.DocumentUpdated, this._resetNamedFlowCollections, this);
    InspectorBackend.registerCSSDispatcher(new WebInspector.CSSDispatcher(this));
    CSSAgent.enable();
    this._resetStyleSheets();
}

/**
 * @param {Array.<CSSAgent.CSSRule>} ruleArray
 */
WebInspector.CSSStyleModel.parseRuleArrayPayload = function(ruleArray)
{
    var result = [];
    for (var i = 0; i < ruleArray.length; ++i)
        result.push(WebInspector.CSSRule.parsePayload(ruleArray[i]));
    return result;
}
    
/**
 * @param {Array.<CSSAgent.RuleMatch>} matchArray
 */
WebInspector.CSSStyleModel.parseRuleMatchArrayPayload = function(matchArray)
{
    var result = [];
    for (var i = 0; i < matchArray.length; ++i)
        result.push(WebInspector.CSSRule.parsePayload(matchArray[i].rule, matchArray[i].matchingSelectors));
    return result;
}

WebInspector.CSSStyleModel.Events = {
    StyleSheetAdded: "StyleSheetAdded",
    StyleSheetChanged: "StyleSheetChanged",
    StyleSheetRemoved: "StyleSheetRemoved",
    MediaQueryResultChanged: "MediaQueryResultChanged",
    NamedFlowCreated: "NamedFlowCreated",
    NamedFlowRemoved: "NamedFlowRemoved",
    RegionLayoutUpdated: "RegionLayoutUpdated",
    RegionOversetChanged: "RegionOversetChanged"
}

WebInspector.CSSStyleModel.MediaTypes = ["all", "braille", "embossed", "handheld", "print", "projection", "screen", "speech", "tty", "tv"];

WebInspector.CSSStyleModel.prototype = {
    /**
     * @param {DOMAgent.NodeId} nodeId
     * @param {boolean} needPseudo
     * @param {boolean} needInherited
     * @param {function(?*)} userCallback
     */
    getMatchedStylesAsync: function(nodeId, needPseudo, needInherited, userCallback)
    {
        /**
         * @param {function(?*)} userCallback
         * @param {?Protocol.Error} error
         * @param {Array.<CSSAgent.RuleMatch>=} matchedPayload
         * @param {Array.<CSSAgent.PseudoIdMatches>=} pseudoPayload
         * @param {Array.<CSSAgent.InheritedStyleEntry>=} inheritedPayload
         */
        function callback(userCallback, error, matchedPayload, pseudoPayload, inheritedPayload)
        {
            if (error) {
                if (userCallback)
                    userCallback(null);
                return;
            }

            var result = {};
            if (matchedPayload)
                result.matchedCSSRules = WebInspector.CSSStyleModel.parseRuleMatchArrayPayload(matchedPayload);

            if (pseudoPayload) {
                result.pseudoElements = [];
                for (var i = 0; i < pseudoPayload.length; ++i) {
                    var entryPayload = pseudoPayload[i];
                    result.pseudoElements.push({ pseudoId: entryPayload.pseudoId, rules: WebInspector.CSSStyleModel.parseRuleMatchArrayPayload(entryPayload.matches) });
                }
            }

            if (inheritedPayload) {
                result.inherited = [];
                for (var i = 0; i < inheritedPayload.length; ++i) {
                    var entryPayload = inheritedPayload[i];
                    var entry = {};
                    if (entryPayload.inlineStyle)
                        entry.inlineStyle = WebInspector.CSSStyleDeclaration.parsePayload(entryPayload.inlineStyle);
                    if (entryPayload.matchedCSSRules)
                        entry.matchedCSSRules = WebInspector.CSSStyleModel.parseRuleMatchArrayPayload(entryPayload.matchedCSSRules);
                    result.inherited.push(entry);
                }
            }

            if (userCallback)
                userCallback(result);
        }

        CSSAgent.getMatchedStylesForNode(nodeId, needPseudo, needInherited, callback.bind(null, userCallback));
    },

    /**
     * @param {DOMAgent.NodeId} nodeId
     * @param {function(?WebInspector.CSSStyleDeclaration)} userCallback
     */
    getComputedStyleAsync: function(nodeId, userCallback)
    {
        /**
         * @param {function(?WebInspector.CSSStyleDeclaration)} userCallback
         */
        function callback(userCallback, error, computedPayload)
        {
            if (error || !computedPayload)
                userCallback(null);
            else
                userCallback(WebInspector.CSSStyleDeclaration.parseComputedStylePayload(computedPayload));
        }

        CSSAgent.getComputedStyleForNode(nodeId, callback.bind(null, userCallback));
    },

    /**
     * @param {number} nodeId
     * @param {function(?String, ?Array.<CSSAgent.PlatformFontUsage>)} callback
     */
    getPlatformFontsForNode: function(nodeId, callback)
    {
        function platformFontsCallback(error, cssFamilyName, fonts)
        {
            if (error)
                callback(null, null);
            else
                callback(cssFamilyName, fonts);
        }
        CSSAgent.getPlatformFontsForNode(nodeId, platformFontsCallback);
    },

    /**
     * @param {DOMAgent.NodeId} nodeId
     * @param {function(?WebInspector.CSSStyleDeclaration, ?WebInspector.CSSStyleDeclaration)} userCallback
     */
    getInlineStylesAsync: function(nodeId, userCallback)
    {
        /**
         * @param {function(?WebInspector.CSSStyleDeclaration, ?WebInspector.CSSStyleDeclaration)} userCallback
         * @param {?Protocol.Error} error
         * @param {?CSSAgent.CSSStyle=} inlinePayload
         * @param {?CSSAgent.CSSStyle=} attributesStylePayload
         */
        function callback(userCallback, error, inlinePayload, attributesStylePayload)
        {
            if (error || !inlinePayload)
                userCallback(null, null);
            else
                userCallback(WebInspector.CSSStyleDeclaration.parsePayload(inlinePayload), attributesStylePayload ? WebInspector.CSSStyleDeclaration.parsePayload(attributesStylePayload) : null);
        }

        CSSAgent.getInlineStylesForNode(nodeId, callback.bind(null, userCallback));
    },

    /**
     * @param {DOMAgent.NodeId} nodeId
     * @param {?Array.<string>|undefined} forcedPseudoClasses
     * @param {function()=} userCallback
     */
    forcePseudoState: function(nodeId, forcedPseudoClasses, userCallback)
    {
        CSSAgent.forcePseudoState(nodeId, forcedPseudoClasses || [], userCallback);
    },

    /**
     * @param {DOMAgent.NodeId} documentNodeId
     * @param {function(?WebInspector.NamedFlowCollection)} userCallback
     */
    getNamedFlowCollectionAsync: function(documentNodeId, userCallback)
    {
        var namedFlowCollection = this._namedFlowCollections[documentNodeId];
        if (namedFlowCollection) {
            userCallback(namedFlowCollection);
            return;
        }

        /**
         * @param {function(?WebInspector.NamedFlowCollection)} userCallback
         * @param {?Protocol.Error} error
         * @param {?Array.<CSSAgent.NamedFlow>} namedFlowPayload
         */
        function callback(userCallback, error, namedFlowPayload)
        {
            if (error || !namedFlowPayload)
                userCallback(null);
            else {
                var namedFlowCollection = new WebInspector.NamedFlowCollection(namedFlowPayload);
                this._namedFlowCollections[documentNodeId] = namedFlowCollection;
                userCallback(namedFlowCollection);
            }
        }

        CSSAgent.getNamedFlowCollection(documentNodeId, callback.bind(this, userCallback));
    },

    /**
     * @param {DOMAgent.NodeId} documentNodeId
     * @param {string} flowName
     * @param {function(?WebInspector.NamedFlow)} userCallback
     */
    getFlowByNameAsync: function(documentNodeId, flowName, userCallback)
    {
        var namedFlowCollection = this._namedFlowCollections[documentNodeId];
        if (namedFlowCollection) {
            userCallback(namedFlowCollection.flowByName(flowName));
            return;
        }

        /**
         * @param {function(?WebInspector.NamedFlow)} userCallback
         * @param {?WebInspector.NamedFlowCollection} namedFlowCollection
         */
        function callback(userCallback, namedFlowCollection)
        {
            if (!namedFlowCollection)
                userCallback(null);
            else
                userCallback(namedFlowCollection.flowByName(flowName));
        }

        this.getNamedFlowCollectionAsync(documentNodeId, callback.bind(this, userCallback));
    },

    /**
     * @param {CSSAgent.CSSRuleId} ruleId
     * @param {DOMAgent.NodeId} nodeId
     * @param {string} newSelector
     * @param {function(WebInspector.CSSRule, boolean)} successCallback
     * @param {function()} failureCallback
     */
    setRuleSelector: function(ruleId, nodeId, newSelector, successCallback, failureCallback)
    {
        /**
         * @param {DOMAgent.NodeId} nodeId
         * @param {function(WebInspector.CSSRule, boolean)} successCallback
         * @param {CSSAgent.CSSRule} rulePayload
         * @param {?Array.<DOMAgent.NodeId>} selectedNodeIds
         */
        function checkAffectsCallback(nodeId, successCallback, rulePayload, selectedNodeIds)
        {
            if (!selectedNodeIds)
                return;
            var doesAffectSelectedNode = (selectedNodeIds.indexOf(nodeId) >= 0);
            var rule = WebInspector.CSSRule.parsePayload(rulePayload);
            successCallback(rule, doesAffectSelectedNode);
        }

        /**
         * @param {DOMAgent.NodeId} nodeId
         * @param {function(WebInspector.CSSRule, boolean)} successCallback
         * @param {function()} failureCallback
         * @param {?Protocol.Error} error
         * @param {string} newSelector
         * @param {?CSSAgent.CSSRule} rulePayload
         */
        function callback(nodeId, successCallback, failureCallback, newSelector, error, rulePayload)
        {
            this._pendingCommandsMajorState.pop();
            if (error)
                failureCallback();
            else {
                WebInspector.domAgent.markUndoableState();
                var ownerDocumentId = this._ownerDocumentId(nodeId);
                if (ownerDocumentId)
                    WebInspector.domAgent.querySelectorAll(ownerDocumentId, newSelector, checkAffectsCallback.bind(this, nodeId, successCallback, rulePayload));
                else
                    failureCallback();
            }
        }

        this._pendingCommandsMajorState.push(true);
        CSSAgent.setRuleSelector(ruleId, newSelector, callback.bind(this, nodeId, successCallback, failureCallback, newSelector));
    },

    /**
     * @param {DOMAgent.NodeId} nodeId
     * @param {string} selector
     * @param {function(WebInspector.CSSRule, boolean)} successCallback
     * @param {function()} failureCallback
     */
    addRule: function(nodeId, selector, successCallback, failureCallback)
    {
        /**
         * @param {DOMAgent.NodeId} nodeId
         * @param {function(WebInspector.CSSRule, boolean)} successCallback
         * @param {CSSAgent.CSSRule} rulePayload
         * @param {?Array.<DOMAgent.NodeId>} selectedNodeIds
         */
        function checkAffectsCallback(nodeId, successCallback, rulePayload, selectedNodeIds)
        {
            if (!selectedNodeIds)
                return;

            var doesAffectSelectedNode = (selectedNodeIds.indexOf(nodeId) >= 0);
            var rule = WebInspector.CSSRule.parsePayload(rulePayload);
            successCallback(rule, doesAffectSelectedNode);
        }

        /**
         * @param {function(WebInspector.CSSRule, boolean)} successCallback
         * @param {function()} failureCallback
         * @param {string} selector
         * @param {?Protocol.Error} error
         * @param {?CSSAgent.CSSRule} rulePayload
         */
        function callback(successCallback, failureCallback, selector, error, rulePayload)
        {
            this._pendingCommandsMajorState.pop();
            if (error) {
                // Invalid syntax for a selector
                failureCallback();
            } else {
                WebInspector.domAgent.markUndoableState();
                var ownerDocumentId = this._ownerDocumentId(nodeId);
                if (ownerDocumentId)
                    WebInspector.domAgent.querySelectorAll(ownerDocumentId, selector, checkAffectsCallback.bind(this, nodeId, successCallback, rulePayload));
                else
                    failureCallback();
            }
        }

        this._pendingCommandsMajorState.push(true);
        CSSAgent.addRule(nodeId, selector, callback.bind(this, successCallback, failureCallback, selector));
    },

    mediaQueryResultChanged: function()
    {
        this.dispatchEventToListeners(WebInspector.CSSStyleModel.Events.MediaQueryResultChanged);
    },

    /**
     * @param {!CSSAgent.StyleSheetId} id
     * @return {WebInspector.CSSStyleSheetHeader}
     */
    styleSheetHeaderForId: function(id)
    {
        return this._styleSheetIdToHeader[id];
    },

    /**
     * @return {Array.<WebInspector.CSSStyleSheetHeader>}
     */
    styleSheetHeaders: function()
    {
        return Object.values(this._styleSheetIdToHeader);
    },

    /**
     * @param {DOMAgent.NodeId} nodeId
     */
    _ownerDocumentId: function(nodeId)
    {
        var node = WebInspector.domAgent.nodeForId(nodeId);
        if (!node)
            return null;
        return node.ownerDocument ? node.ownerDocument.id : null;
    },

    /**
     * @param {CSSAgent.StyleSheetId} styleSheetId
     */
    _fireStyleSheetChanged: function(styleSheetId)
    {
        if (!this._pendingCommandsMajorState.length)
            return;

        var majorChange = this._pendingCommandsMajorState[this._pendingCommandsMajorState.length - 1];

        if (!majorChange || !styleSheetId || !this.hasEventListeners(WebInspector.CSSStyleModel.Events.StyleSheetChanged))
            return;

        this.dispatchEventToListeners(WebInspector.CSSStyleModel.Events.StyleSheetChanged, { styleSheetId: styleSheetId, majorChange: majorChange });
    },

    /**
     * @param {!CSSAgent.CSSStyleSheetHeader} header
     */
    _styleSheetAdded: function(header)
    {
        console.assert(!this._styleSheetIdToHeader[header.styleSheetId]);
        var styleSheetHeader = new WebInspector.CSSStyleSheetHeader(header);
        this._styleSheetIdToHeader[header.styleSheetId] = styleSheetHeader;
        var url = styleSheetHeader.resourceURL();
        if (!this._styleSheetIdsForURL[url])
            this._styleSheetIdsForURL[url] = {};
        var frameIdToStyleSheetIds = this._styleSheetIdsForURL[url];
        var styleSheetIds = frameIdToStyleSheetIds[styleSheetHeader.frameId];
        if (!styleSheetIds) {
            styleSheetIds = [];
            frameIdToStyleSheetIds[styleSheetHeader.frameId] = styleSheetIds;
        }
        styleSheetIds.push(styleSheetHeader.id);
        this.dispatchEventToListeners(WebInspector.CSSStyleModel.Events.StyleSheetAdded, styleSheetHeader);
    },

    /**
     * @param {!CSSAgent.StyleSheetId} id
     */
    _styleSheetRemoved: function(id)
    {
        var header = this._styleSheetIdToHeader[id];
        console.assert(header);
        delete this._styleSheetIdToHeader[id];
        var url = header.resourceURL();
        var frameIdToStyleSheetIds = this._styleSheetIdsForURL[url];
        frameIdToStyleSheetIds[header.frameId].remove(id);
        if (!frameIdToStyleSheetIds[header.frameId].length) {
            delete frameIdToStyleSheetIds[header.frameId];
            if (!Object.keys(this._styleSheetIdsForURL[url]).length)
                delete this._styleSheetIdsForURL[url];
        }
        this.dispatchEventToListeners(WebInspector.CSSStyleModel.Events.StyleSheetRemoved, header);
    },

    /**
     * @param {string} url
     * @return {Array.<CSSAgent.StyleSheetId>}
     */
    styleSheetIdsForURL: function(url)
    {
        var frameIdToStyleSheetIds = this._styleSheetIdsForURL[url];
        if (!frameIdToStyleSheetIds)
            return [];

        var result = [];
        for (var frameId in frameIdToStyleSheetIds)
            result = result.concat(frameIdToStyleSheetIds[frameId]);
        return result;
    },

    /**
     * @param {string} url
     * @return {Object.<PageAgent.FrameId, Array.<CSSAgent.StyleSheetId>>}
     */
    styleSheetIdsByFrameIdForURL: function(url)
    {
        var styleSheetIdsForFrame = this._styleSheetIdsForURL[url];
        if (!styleSheetIdsForFrame)
            return {};
        return styleSheetIdsForFrame;
    },

    /**
     * @param {CSSAgent.NamedFlow} namedFlowPayload
     */
    _namedFlowCreated: function(namedFlowPayload)
    {
        var namedFlow = WebInspector.NamedFlow.parsePayload(namedFlowPayload);
        var namedFlowCollection = this._namedFlowCollections[namedFlow.documentNodeId];

        if (!namedFlowCollection)
            return;

        namedFlowCollection._appendNamedFlow(namedFlow);
        this.dispatchEventToListeners(WebInspector.CSSStyleModel.Events.NamedFlowCreated, namedFlow);
    },

    /**
     * @param {DOMAgent.NodeId} documentNodeId
     * @param {string} flowName
     */
    _namedFlowRemoved: function(documentNodeId, flowName)
    {
        var namedFlowCollection = this._namedFlowCollections[documentNodeId];

        if (!namedFlowCollection)
            return;

        namedFlowCollection._removeNamedFlow(flowName);
        this.dispatchEventToListeners(WebInspector.CSSStyleModel.Events.NamedFlowRemoved, { documentNodeId: documentNodeId, flowName: flowName });
    },

    /**
     * @param {CSSAgent.NamedFlow} namedFlowPayload
     */
    _regionLayoutUpdated: function(namedFlowPayload)
    {
        var namedFlow = WebInspector.NamedFlow.parsePayload(namedFlowPayload);
        var namedFlowCollection = this._namedFlowCollections[namedFlow.documentNodeId];

        if (!namedFlowCollection)
            return;

        namedFlowCollection._appendNamedFlow(namedFlow);
        this.dispatchEventToListeners(WebInspector.CSSStyleModel.Events.RegionLayoutUpdated, namedFlow);
    },

    /**
     * @param {CSSAgent.NamedFlow} namedFlowPayload
     */
    _regionOversetChanged: function(namedFlowPayload)
    {
        var namedFlow = WebInspector.NamedFlow.parsePayload(namedFlowPayload);
        var namedFlowCollection = this._namedFlowCollections[namedFlow.documentNodeId];

         if (!namedFlowCollection)
            return;

        namedFlowCollection._appendNamedFlow(namedFlow);
        this.dispatchEventToListeners(WebInspector.CSSStyleModel.Events.RegionOversetChanged, namedFlow);
    },

    /**
     * @param {CSSAgent.StyleSheetId} styleSheetId
     * @param {string} newText
     * @param {boolean} majorChange
     * @param {function(?string)} userCallback
     */
    setStyleSheetText: function(styleSheetId, newText, majorChange, userCallback)
    {
        function callback(error)
        {
            this._pendingCommandsMajorState.pop();
            if (!error && majorChange)
                WebInspector.domAgent.markUndoableState();
            
            if (!error && userCallback)
                userCallback(error);
        }
        this._pendingCommandsMajorState.push(majorChange);
        CSSAgent.setStyleSheetText(styleSheetId, newText, callback.bind(this));
    },

    _undoRedoRequested: function()
    {
        this._pendingCommandsMajorState.push(true);
    },

    _undoRedoCompleted: function()
    {
        this._pendingCommandsMajorState.pop();
    },

    _mainFrameCreatedOrNavigated: function()
    {
        this._resetStyleSheets();
    },

    _resetStyleSheets: function()
    {
        /** @type {!Object.<string, !Object.<PageAgent.FrameId, !Array.<!CSSAgent.StyleSheetId>>>} */
        this._styleSheetIdsForURL = {};
        /** @type {!Object.<CSSAgent.StyleSheetId, !WebInspector.CSSStyleSheetHeader>} */
        this._styleSheetIdToHeader = {};
    },

    _resetNamedFlowCollections: function()
    {
        this._namedFlowCollections = {};
    },

    updateLocations: function()
    {
        var headers = Object.values(this._styleSheetIdToHeader);
        for (var i = 0; i < headers.length; ++i)
            headers[i].updateLocations();
    },

    /**
     * @param {CSSAgent.StyleSheetId} styleSheetId
     * @param {WebInspector.CSSLocation} rawLocation
     * @param {function(WebInspector.UILocation):(boolean|undefined)} updateDelegate
     * @return {?WebInspector.LiveLocation}
     */
    createLiveLocation: function(styleSheetId, rawLocation, updateDelegate)
    {
        if (!rawLocation)
            return null;
        var header = this.styleSheetHeaderForId(styleSheetId);
        if (!header)
            return null;
        return header.createLiveLocation(rawLocation, updateDelegate);
    },

    /**
     * @param {WebInspector.CSSLocation} rawLocation
     * @return {?WebInspector.UILocation}
     */
    rawLocationToUILocation: function(rawLocation)
    {
        var frameIdToSheetIds = this._styleSheetIdsForURL[rawLocation.url];
        if (!frameIdToSheetIds)
            return null;
        var styleSheetIds = [];
        for (var frameId in frameIdToSheetIds)
            styleSheetIds = styleSheetIds.concat(frameIdToSheetIds[frameId]);
        var uiLocation;
        for (var i = 0; !uiLocation && i < styleSheetIds.length; ++i) {
            var header = this.styleSheetHeaderForId(styleSheetIds[i]);
            console.assert(header);
            uiLocation = header.rawLocationToUILocation(rawLocation.lineNumber, rawLocation.columnNumber);
        }
        return uiLocation || null;
    },

    __proto__: WebInspector.Object.prototype
}

/**
 * @constructor
 * @extends {WebInspector.LiveLocation}
 * @param {WebInspector.CSSLocation} rawLocation
 * @param {function(WebInspector.UILocation):(boolean|undefined)} updateDelegate
 */
WebInspector.CSSStyleModel.LiveLocation = function(rawLocation, updateDelegate, header)
{
    WebInspector.LiveLocation.call(this, rawLocation, updateDelegate);
    this._header = header;
}

WebInspector.CSSStyleModel.LiveLocation.prototype = {
    /**
     * @return {WebInspector.UILocation}
     */
    uiLocation: function()
    {
        var cssLocation = /** @type WebInspector.CSSLocation */ (this.rawLocation());
        return this._header.rawLocationToUILocation(cssLocation.lineNumber, cssLocation.columnNumber);
    },

    dispose: function()
    {
        WebInspector.LiveLocation.prototype.dispose.call(this);
        this._header._removeLocation(this);
    },

    __proto__: WebInspector.LiveLocation.prototype
}

/**
 * @constructor
 * @implements {WebInspector.RawLocation}
 * @param {string} url
 * @param {number} lineNumber
 * @param {number=} columnNumber
 */
WebInspector.CSSLocation = function(url, lineNumber, columnNumber)
{
    this.url = url;
    this.lineNumber = lineNumber;
    this.columnNumber = columnNumber || 0;
}

/**
 * @constructor
 * @param {CSSAgent.CSSStyle} payload
 */
WebInspector.CSSStyleDeclaration = function(payload)
{
    this.id = payload.styleId;
    this.width = payload.width;
    this.height = payload.height;
    this.range = payload.range;
    this._shorthandValues = WebInspector.CSSStyleDeclaration.buildShorthandValueMap(payload.shorthandEntries);
    this._livePropertyMap = {}; // LIVE properties (source-based or style-based) : { name -> CSSProperty }
    this._allProperties = []; // ALL properties: [ CSSProperty ]
    this.__disabledProperties = {}; // DISABLED properties: { index -> CSSProperty }
    var payloadPropertyCount = payload.cssProperties.length;

    var propertyIndex = 0;
    for (var i = 0; i < payloadPropertyCount; ++i) {
        var property = WebInspector.CSSProperty.parsePayload(this, i, payload.cssProperties[i]);
        this._allProperties.push(property);
        if (property.disabled)
            this.__disabledProperties[i] = property;
        if (!property.active && !property.styleBased)
            continue;
        var name = property.name;
        this[propertyIndex] = name;
        this._livePropertyMap[name] = property;
        ++propertyIndex;
    }
    this.length = propertyIndex;
    if ("cssText" in payload)
        this.cssText = payload.cssText;
}

/**
 * @param {Array.<CSSAgent.ShorthandEntry>} shorthandEntries
 * @return {Object}
 */
WebInspector.CSSStyleDeclaration.buildShorthandValueMap = function(shorthandEntries)
{
    var result = {};
    for (var i = 0; i < shorthandEntries.length; ++i)
        result[shorthandEntries[i].name] = shorthandEntries[i].value;
    return result;
}

/**
 * @param {CSSAgent.CSSStyle} payload
 * @return {WebInspector.CSSStyleDeclaration}
 */
WebInspector.CSSStyleDeclaration.parsePayload = function(payload)
{
    return new WebInspector.CSSStyleDeclaration(payload);
}

/**
 * @param {Array.<CSSAgent.CSSComputedStyleProperty>} payload
 * @return {WebInspector.CSSStyleDeclaration}
 */
WebInspector.CSSStyleDeclaration.parseComputedStylePayload = function(payload)
{
    var newPayload = /** @type {CSSAgent.CSSStyle} */ ({ cssProperties: [], shorthandEntries: [], width: "", height: "" });
    if (payload)
        newPayload.cssProperties = payload;

    return new WebInspector.CSSStyleDeclaration(newPayload);
}

WebInspector.CSSStyleDeclaration.prototype = {
    get allProperties()
    {
        return this._allProperties;
    },

    /**
     * @param {string} name
     * @return {WebInspector.CSSProperty|undefined}
     */
    getLiveProperty: function(name)
    {
        return this._livePropertyMap[name];
    },

    /**
     * @param {string} name
     * @return {string}
     */
    getPropertyValue: function(name)
    {
        var property = this._livePropertyMap[name];
        return property ? property.value : "";
    },

    /**
     * @param {string} name
     * @return {string}
     */
    getPropertyPriority: function(name)
    {
        var property = this._livePropertyMap[name];
        return property ? property.priority : "";
    },

    /**
     * @param {string} name
     * @return {boolean}
     */
    isPropertyImplicit: function(name)
    {
        var property = this._livePropertyMap[name];
        return property ? property.implicit : "";
    },

    /**
     * @param {string} name
     * @return {Array.<WebInspector.CSSProperty>}
     */
    longhandProperties: function(name)
    {
        var longhands = WebInspector.CSSMetadata.cssPropertiesMetainfo.longhands(name);
        var result = [];
        for (var i = 0; longhands && i < longhands.length; ++i) {
            var property = this._livePropertyMap[longhands[i]];
            if (property)
                result.push(property);
        }
        return result;
    },

    /**
     * @param {string} shorthandProperty
     * @return {string}
     */
    shorthandValue: function(shorthandProperty)
    {
        return this._shorthandValues[shorthandProperty];
    },

    /**
     * @param {number} index
     * @return {?WebInspector.CSSProperty}
     */
    propertyAt: function(index)
    {
        return (index < this.allProperties.length) ? this.allProperties[index] : null;
    },

    /**
     * @return {number}
     */
    pastLastSourcePropertyIndex: function()
    {
        for (var i = this.allProperties.length - 1; i >= 0; --i) {
            var property = this.allProperties[i];
            if (property.active || property.disabled)
                return i + 1;
        }
        return 0;
    },

    /**
     * @param {number=} index
     */
    newBlankProperty: function(index)
    {
        index = (typeof index === "undefined") ? this.pastLastSourcePropertyIndex() : index;
        return new WebInspector.CSSProperty(this, index, "", "", "", "active", true, false, "");
    },

    /**
     * @param {number} index
     * @param {string} name
     * @param {string} value
     * @param {function(?WebInspector.CSSStyleDeclaration)=} userCallback
     */
    insertPropertyAt: function(index, name, value, userCallback)
    {
        /**
         * @param {?string} error
         * @param {CSSAgent.CSSStyle} payload
         */
        function callback(error, payload)
        {
            WebInspector.cssModel._pendingCommandsMajorState.pop();
            if (!userCallback)
                return;

            if (error) {
                console.error(error);
                userCallback(null);
            } else
                userCallback(WebInspector.CSSStyleDeclaration.parsePayload(payload));
        }

        if (!this.id)
            throw "No style id";

        WebInspector.cssModel._pendingCommandsMajorState.push(true);
        CSSAgent.setPropertyText(this.id, index, name + ": " + value + ";", false, callback.bind(this));
    },

    /**
     * @param {string} name
     * @param {string} value
     * @param {function(?WebInspector.CSSStyleDeclaration)=} userCallback
     */
    appendProperty: function(name, value, userCallback)
    {
        this.insertPropertyAt(this.allProperties.length, name, value, userCallback);
    },

    /**
     * @param {string} text
     * @param {function(?WebInspector.CSSStyleDeclaration)=} userCallback
     */
    setText: function(text, userCallback)
    {
        /**
         * @param {?string} error
         * @param {CSSAgent.CSSStyle} payload
         */
        function callback(error, payload)
        {
            WebInspector.cssModel._pendingCommandsMajorState.pop();
            if (!userCallback)
                return;

            if (error) {
                console.error(error);
                userCallback(null);
            } else
                userCallback(WebInspector.CSSStyleDeclaration.parsePayload(payload));
        }

        if (!this.id)
            throw "No style id";

        if (typeof this.cssText === "undefined") {
            userCallback(null);
            return;
        }

        WebInspector.cssModel._pendingCommandsMajorState.push(true);
        CSSAgent.setStyleText(this.id, text, callback);
    }
}

/**
 * @constructor
 * @param {CSSAgent.CSSRule} payload
 * @param {Array.<number>=} matchingSelectors
 */
WebInspector.CSSRule = function(payload, matchingSelectors)
{
    this.id = payload.ruleId;
    if (matchingSelectors)
        this.matchingSelectors = matchingSelectors;
    this.selectors = payload.selectorList.selectors;
    this.selectorText = this.selectors.join(", ");
    this.selectorRange = payload.selectorList.range;
    this.sourceURL = payload.sourceURL;
    this.origin = payload.origin;
    this.style = WebInspector.CSSStyleDeclaration.parsePayload(payload.style);
    this.style.parentRule = this;
    if (payload.media)
        this.media = WebInspector.CSSMedia.parseMediaArrayPayload(payload.media);
    this._setRawLocationAndFrameId();
}

/**
 * @param {CSSAgent.CSSRule} payload
 * @param {Array.<number>=} matchingIndices
 * @return {WebInspector.CSSRule}
 */
WebInspector.CSSRule.parsePayload = function(payload, matchingIndices)
{
    return new WebInspector.CSSRule(payload, matchingIndices);
}

WebInspector.CSSRule.prototype = {
    _setRawLocationAndFrameId: function()
    {
        if (!this.id)
            return;
        var styleSheetHeader = WebInspector.cssModel.styleSheetHeaderForId(this.id.styleSheetId);
        this.frameId = styleSheetHeader.frameId;
        var url = styleSheetHeader.resourceURL();
        if (!url)
            return;
        this.rawLocation = new WebInspector.CSSLocation(url, this.lineNumberInSource(), this.columnNumberInSource());
    },

    /**
     * @return {string}
     */
    resourceURL: function()
    {
        if (!this.id)
            return "";
        var styleSheetHeader = WebInspector.cssModel.styleSheetHeaderForId(this.id.styleSheetId);
        return styleSheetHeader.resourceURL();
    },

    /**
     * @return {number}
     */
    lineNumberInSource: function()
    {
        if (!this.selectorRange)
            return 0;
        var styleSheetHeader = WebInspector.cssModel.styleSheetHeaderForId(this.id.styleSheetId);
        return styleSheetHeader.lineNumberInSource(this.selectorRange.startLine);
    },

    /**
     * @return {number|undefined}
     */
    columnNumberInSource: function()
    {
        if (!this.selectorRange)
            return undefined;
        var styleSheetHeader = WebInspector.cssModel.styleSheetHeaderForId(this.id.styleSheetId);
        console.assert(styleSheetHeader);
        return styleSheetHeader.columnNumberInSource(this.selectorRange.startLine, this.selectorRange.startColumn);
    },

    get isUserAgent()
    {
        return this.origin === "user-agent";
    },

    get isUser()
    {
        return this.origin === "user";
    },

    get isViaInspector()
    {
        return this.origin === "inspector";
    },

    get isRegular()
    {
        return this.origin === "regular";
    }
}

/**
 * @constructor
 * @param {?WebInspector.CSSStyleDeclaration} ownerStyle
 * @param {number} index
 * @param {string} name
 * @param {string} value
 * @param {?string} priority
 * @param {string} status
 * @param {boolean} parsedOk
 * @param {boolean} implicit
 * @param {?string=} text
 * @param {CSSAgent.SourceRange=} range
 */
WebInspector.CSSProperty = function(ownerStyle, index, name, value, priority, status, parsedOk, implicit, text, range)
{
    this.ownerStyle = ownerStyle;
    this.index = index;
    this.name = name;
    this.value = value;
    this.priority = priority;
    this.status = status;
    this.parsedOk = parsedOk;
    this.implicit = implicit;
    this.text = text;
    this.range = range;
}

/**
 * @param {?WebInspector.CSSStyleDeclaration} ownerStyle
 * @param {number} index
 * @param {CSSAgent.CSSProperty} payload
 * @return {WebInspector.CSSProperty}
 */
WebInspector.CSSProperty.parsePayload = function(ownerStyle, index, payload)
{
    // The following default field values are used in the payload:
    // priority: ""
    // parsedOk: true
    // implicit: false
    // status: "style"
    var result = new WebInspector.CSSProperty(
        ownerStyle, index, payload.name, payload.value, payload.priority || "", payload.status || "style", ("parsedOk" in payload) ? !!payload.parsedOk : true, !!payload.implicit, payload.text, payload.range);
    return result;
}

WebInspector.CSSProperty.prototype = {
    get propertyText()
    {
        if (this.text !== undefined)
            return this.text;

        if (this.name === "")
            return "";
        return this.name + ": " + this.value + (this.priority ? " !" + this.priority : "") + ";";
    },

    get isLive()
    {
        return this.active || this.styleBased;
    },

    get active()
    {
        return this.status === "active";
    },

    get styleBased()
    {
        return this.status === "style";
    },

    get inactive()
    {
        return this.status === "inactive";
    },

    get disabled()
    {
        return this.status === "disabled";
    },

    /**
     * Replaces "propertyName: propertyValue [!important];" in the stylesheet by an arbitrary propertyText.
     *
     * @param {string} propertyText
     * @param {boolean} majorChange
     * @param {boolean} overwrite
     * @param {function(?WebInspector.CSSStyleDeclaration)=} userCallback
     */
    setText: function(propertyText, majorChange, overwrite, userCallback)
    {
        /**
         * @param {?WebInspector.CSSStyleDeclaration} style
         */
        function enabledCallback(style)
        {
            if (userCallback)
                userCallback(style);
        }

        /**
         * @param {?string} error
         * @param {?CSSAgent.CSSStyle} stylePayload
         */
        function callback(error, stylePayload)
        {
            WebInspector.cssModel._pendingCommandsMajorState.pop();
            if (!error) {
                if (majorChange)
                    WebInspector.domAgent.markUndoableState();
                this.text = propertyText;
                var style = WebInspector.CSSStyleDeclaration.parsePayload(stylePayload);
                var newProperty = style.allProperties[this.index];

                if (newProperty && this.disabled && !propertyText.match(/^\s*$/)) {
                    newProperty.setDisabled(false, enabledCallback);
                    return;
                }

                if (userCallback)
                    userCallback(style);
            } else {
                if (userCallback)
                    userCallback(null);
            }
        }

        if (!this.ownerStyle)
            throw "No ownerStyle for property";

        if (!this.ownerStyle.id)
            throw "No owner style id";

        // An index past all the properties adds a new property to the style.
        WebInspector.cssModel._pendingCommandsMajorState.push(majorChange);
        CSSAgent.setPropertyText(this.ownerStyle.id, this.index, propertyText, overwrite, callback.bind(this));
    },

    /**
     * @param {string} newValue
     * @param {boolean} majorChange
     * @param {boolean} overwrite
     * @param {function(?WebInspector.CSSStyleDeclaration)=} userCallback
     */
    setValue: function(newValue, majorChange, overwrite, userCallback)
    {
        var text = this.name + ": " + newValue + (this.priority ? " !" + this.priority : "") + ";"
        this.setText(text, majorChange, overwrite, userCallback);
    },

    /**
     * @param {boolean} disabled
     * @param {function(?WebInspector.CSSStyleDeclaration)=} userCallback
     */
    setDisabled: function(disabled, userCallback)
    {
        if (!this.ownerStyle && userCallback)
            userCallback(null);
        if (disabled === this.disabled && userCallback)
            userCallback(this.ownerStyle);

        /**
         * @param {?string} error
         * @param {CSSAgent.CSSStyle} stylePayload
         */
        function callback(error, stylePayload)
        {
            WebInspector.cssModel._pendingCommandsMajorState.pop();
            if (error) {
                if (userCallback)
                    userCallback(null);
                return;
            }
            WebInspector.domAgent.markUndoableState();
            if (userCallback) {
                var style = WebInspector.CSSStyleDeclaration.parsePayload(stylePayload);
                userCallback(style);
            }
        }

        if (!this.ownerStyle.id)
            throw "No owner style id";

        WebInspector.cssModel._pendingCommandsMajorState.push(false);
        CSSAgent.toggleProperty(this.ownerStyle.id, this.index, disabled, callback.bind(this));
    },

    /**
     * @param {boolean} forName
     * @return {WebInspector.UILocation}
     */
    uiLocation: function(forName)
    {
        if (!this.range || !this.ownerStyle || !this.ownerStyle.parentRule)
            return null;

        var url = this.ownerStyle.parentRule.resourceURL();
        if (!url)
            return null;

        var range = this.range;
        var line = forName ? range.startLine : range.endLine;
        // End of range is exclusive, so subtract 1 from the end offset.
        var column = forName ? range.startColumn : range.endColumn - (this.text && this.text.endsWith(";") ? 2 : 1);
        var rawLocation = new WebInspector.CSSLocation(url, line, column);
        return WebInspector.cssModel.rawLocationToUILocation(rawLocation);
    }
}

/**
 * @constructor
 * @param {CSSAgent.CSSMedia} payload
 */
WebInspector.CSSMedia = function(payload)
{
    this.text = payload.text;
    this.source = payload.source;
    this.sourceURL = payload.sourceURL || "";
    this.range = payload.range;
    this.parentStyleSheetId = payload.parentStyleSheetId;
}

WebInspector.CSSMedia.Source = {
    LINKED_SHEET: "linkedSheet",
    INLINE_SHEET: "inlineSheet",
    MEDIA_RULE: "mediaRule",
    IMPORT_RULE: "importRule"
};

/**
 * @param {CSSAgent.CSSMedia} payload
 * @return {WebInspector.CSSMedia}
 */
WebInspector.CSSMedia.parsePayload = function(payload)
{
    return new WebInspector.CSSMedia(payload);
}

/**
 * @param {Array.<CSSAgent.CSSMedia>} payload
 * @return {Array.<WebInspector.CSSMedia>}
 */
WebInspector.CSSMedia.parseMediaArrayPayload = function(payload)
{
    var result = [];
    for (var i = 0; i < payload.length; ++i)
        result.push(WebInspector.CSSMedia.parsePayload(payload[i]));
    return result;
}

WebInspector.CSSMedia.prototype = {
    /**
     * @return {number|undefined}
     */
    lineNumberInSource: function()
    {
        if (!this.range)
            return undefined;
        var header = this.header();
        if (!header)
            return undefined;
        return header.lineNumberInSource(this.range.startLine);
    },

    /**
     * @return {number|undefined}
     */
    columnNumberInSource: function()
    {
        if (!this.range)
            return undefined;
        var header = this.header();
        if (!header)
            return undefined;
        return header.columnNumberInSource(this.range.startLine, this.range.startColumn);
    },

    /**
     * @return {?WebInspector.CSSStyleSheetHeader}
     */
    header: function()
    {
        return this.parentStyleSheetId ? WebInspector.cssModel.styleSheetHeaderForId(this.parentStyleSheetId) : null;
    }
}

/**
 * @constructor
 * @implements {WebInspector.ContentProvider}
 * @param {CSSAgent.CSSStyleSheetHeader} payload
 */
WebInspector.CSSStyleSheetHeader = function(payload)
{
    this.id = payload.styleSheetId;
    this.frameId = payload.frameId;
    this.sourceURL = payload.sourceURL;
    this.hasSourceURL = !!payload.hasSourceURL;
    this.sourceMapURL = payload.sourceMapURL;
    this.origin = payload.origin;
    this.title = payload.title;
    this.disabled = payload.disabled;
    this.isInline = payload.isInline;
    this.startLine = payload.startLine;
    this.startColumn = payload.startColumn;
    /** @type {!Set.<!WebInspector.CSSStyleModel.LiveLocation>} */
    this._locations = new Set();
    /** @type {!Array.<!WebInspector.SourceMapping>} */
    this._sourceMappings = [];
}

WebInspector.CSSStyleSheetHeader.prototype = {
    /**
     * @return {string}
     */
    resourceURL: function()
    {
        return this.origin === "inspector" ? this._viaInspectorResourceURL() : this.sourceURL;
    },

    /**
     * @param {WebInspector.CSSLocation} rawLocation
     * @param {function(WebInspector.UILocation):(boolean|undefined)} updateDelegate
     * @return {?WebInspector.LiveLocation}
     */
    createLiveLocation: function(rawLocation, updateDelegate)
    {
        var location = new WebInspector.CSSStyleModel.LiveLocation(rawLocation, updateDelegate, this);
        this._locations.add(location);
        location.update();
        return location;
    },

    updateLocations: function()
    {
        var items = this._locations.items();
        for (var i = 0; i < items.length; ++i)
            items[i].update();
    },

    /**
     * @param {!WebInspector.CSSStyleModel.LiveLocation} location
     */
    _removeLocation: function(location)
    {
        this._locations.remove(location);
    },

    /**
     * @param {number} lineNumber
     * @param {number=} columnNumber
     * @return {?WebInspector.UILocation}
     */
    rawLocationToUILocation: function(lineNumber, columnNumber)
    {
        var uiLocation;
        var rawLocation = new WebInspector.CSSLocation(this.resourceURL(), lineNumber, columnNumber || 0);
        for (var i = this._sourceMappings.length - 1; !uiLocation && i >= 0; --i)
            uiLocation = this._sourceMappings[i].rawLocationToUILocation(rawLocation);
        return uiLocation || null;
    },

    /**
     * @param {!WebInspector.SourceMapping} sourceMapping
     */
    pushSourceMapping: function(sourceMapping)
    {
        this._sourceMappings.push(sourceMapping);
        this.updateLocations();
    },

    /**
     * @return {string}
     */
    _key: function()
    {
        return this.frameId + ":" + this.resourceURL();
    },

    /**
     * @return {string}
     */
    _viaInspectorResourceURL: function()
    {
        var frame = WebInspector.resourceTreeModel.frameForId(this.frameId);
        console.assert(frame);
        var parsedURL = new WebInspector.ParsedURL(frame.url);
        var fakeURL = "inspector://" + parsedURL.host + parsedURL.folderPathComponents;
        if (!fakeURL.endsWith("/"))
            fakeURL += "/";
        fakeURL += "inspector-stylesheet";
        return fakeURL;
    },

    /**
     * @param {number} lineNumberInStyleSheet
     * @return {number}
     */
    lineNumberInSource: function(lineNumberInStyleSheet)
    {
        return this.startLine + lineNumberInStyleSheet;
    },

    /**
     * @param {number} lineNumberInStyleSheet
     * @param {number} columnNumberInStyleSheet
     * @return {number|undefined}
     */
    columnNumberInSource: function(lineNumberInStyleSheet, columnNumberInStyleSheet)
    {
        return (lineNumberInStyleSheet ? 0 : this.startColumn) + columnNumberInStyleSheet;
    },

    /**
     * @override
     */
    contentURL: function()
    {
        return this.resourceURL();
    },

    /**
     * @override
     */
    contentType: function()
    {
        return WebInspector.resourceTypes.Stylesheet;
    },

    /**
     * @override
     */
    requestContent: function(callback)
    {
        CSSAgent.getStyleSheetText(this.id, textCallback.bind(this));

        function textCallback(error, text)
        {
            if (error) {
                WebInspector.log("Failed to get text for stylesheet " + this.id + ": " + error);
                text = "";
                // Fall through.
            }
            callback(text, false, "text/css");
        }
    },

    /**
     * @override
     */
    searchInContent: function(query, caseSensitive, isRegex, callback)
    {
        function performSearch(content)
        {
            callback(WebInspector.ContentProvider.performSearchInContent(content, query, caseSensitive, isRegex));
        }

        // searchInContent should call back later.
        this.requestContent(performSearch);
    }
}

/**
 * @constructor
 * @param {CSSAgent.CSSStyleSheetBody} payload
 */
WebInspector.CSSStyleSheet = function(payload)
{
    this.id = payload.styleSheetId;
    this.rules = [];
    this.styles = {};
    for (var i = 0; i < payload.rules.length; ++i) {
        var rule = WebInspector.CSSRule.parsePayload(payload.rules[i]);
        this.rules.push(rule);
        if (rule.style)
            this.styles[rule.style.id] = rule.style;
    }
    if ("text" in payload)
        this._text = payload.text;
}

/**
 * @param {CSSAgent.StyleSheetId} styleSheetId
 * @param {function(?WebInspector.CSSStyleSheet)} userCallback
 */
WebInspector.CSSStyleSheet.createForId = function(styleSheetId, userCallback)
{
    /**
     * @param {?string} error
     * @param {CSSAgent.CSSStyleSheetBody} styleSheetPayload
     */
    function callback(error, styleSheetPayload)
    {
        if (error)
            userCallback(null);
        else
            userCallback(new WebInspector.CSSStyleSheet(styleSheetPayload));
    }
    CSSAgent.getStyleSheet(styleSheetId, callback.bind(this));
}

WebInspector.CSSStyleSheet.prototype = {
    /**
     * @return {string|undefined}
     */
    getText: function()
    {
        return this._text;
    },

    /**
     * @param {string} newText
     * @param {boolean} majorChange
     * @param {function(?string)=} userCallback
     */
    setText: function(newText, majorChange, userCallback)
    {
        /**
         * @param {?string} error
         */
        function callback(error)
        {
            if (!error)
                WebInspector.domAgent.markUndoableState();

            WebInspector.cssModel._pendingCommandsMajorState.pop();
            if (userCallback)
                userCallback(error);
        }

        WebInspector.cssModel._pendingCommandsMajorState.push(majorChange);
        CSSAgent.setStyleSheetText(this.id, newText, callback.bind(this));
    }
}

/**
 * @constructor
 * @implements {CSSAgent.Dispatcher}
 * @param {WebInspector.CSSStyleModel} cssModel
 */
WebInspector.CSSDispatcher = function(cssModel)
{
    this._cssModel = cssModel;
}

WebInspector.CSSDispatcher.prototype = {
    mediaQueryResultChanged: function()
    {
        this._cssModel.mediaQueryResultChanged();
    },

    /**
     * @param {CSSAgent.StyleSheetId} styleSheetId
     */
    styleSheetChanged: function(styleSheetId)
    {
        this._cssModel._fireStyleSheetChanged(styleSheetId);
    },

    /**
     * @param {CSSAgent.CSSStyleSheetHeader} header
     */
    styleSheetAdded: function(header)
    {
        this._cssModel._styleSheetAdded(header);
    },

    /**
     * @param {CSSAgent.StyleSheetId} id
     */
    styleSheetRemoved: function(id)
    {
        this._cssModel._styleSheetRemoved(id);
    },

    /**
     * @param {CSSAgent.NamedFlow} namedFlowPayload
     */
    namedFlowCreated: function(namedFlowPayload)
    {
        this._cssModel._namedFlowCreated(namedFlowPayload);
    },

    /**
     * @param {DOMAgent.NodeId} documentNodeId
     * @param {string} flowName
     */
    namedFlowRemoved: function(documentNodeId, flowName)
    {
        this._cssModel._namedFlowRemoved(documentNodeId, flowName);
    },

    /**
     * @param {CSSAgent.NamedFlow} namedFlowPayload
     */
    regionLayoutUpdated: function(namedFlowPayload)
    {
        this._cssModel._regionLayoutUpdated(namedFlowPayload);
    },

    /**
     * @param {CSSAgent.NamedFlow} namedFlowPayload
     */
    regionOversetChanged: function(namedFlowPayload)
    {
        this._cssModel._regionOversetChanged(namedFlowPayload);
    }
}

/**
 * @constructor
 * @param {CSSAgent.NamedFlow} payload
 */
WebInspector.NamedFlow = function(payload)
{
    this.documentNodeId = payload.documentNodeId;
    this.name = payload.name;
    this.overset = payload.overset;
    this.content = payload.content;
    this.regions = payload.regions;
}

/**
 * @param {CSSAgent.NamedFlow} payload
 * @return {WebInspector.NamedFlow}
 */
WebInspector.NamedFlow.parsePayload = function(payload)
{
    return new WebInspector.NamedFlow(payload);
}

/**
 * @constructor
 * @param {Array.<CSSAgent.NamedFlow>} payload
 */
WebInspector.NamedFlowCollection = function(payload)
{
    /** @type {Object.<string, WebInspector.NamedFlow>} */
    this.namedFlowMap = {};

    for (var i = 0; i < payload.length; ++i) {
        var namedFlow = WebInspector.NamedFlow.parsePayload(payload[i]);
        this.namedFlowMap[namedFlow.name] = namedFlow;
    }
}

WebInspector.NamedFlowCollection.prototype = {
    /**
     * @param {WebInspector.NamedFlow} namedFlow
     */
    _appendNamedFlow: function(namedFlow)
    {
        this.namedFlowMap[namedFlow.name] = namedFlow;
    },

    /**
     * @param {string} flowName
     */
    _removeNamedFlow: function(flowName)
    {
        delete this.namedFlowMap[flowName];
    },

    /**
     * @param {string} flowName
     * @return {WebInspector.NamedFlow}
     */
    flowByName: function(flowName)
    {
        var namedFlow = this.namedFlowMap[flowName];

        if (!namedFlow)
            return null;
        return namedFlow;
    }
}
/**
 * @type {WebInspector.CSSStyleModel}
 */
WebInspector.cssModel = null;
