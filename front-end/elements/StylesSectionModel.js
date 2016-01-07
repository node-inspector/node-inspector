// Copyright (c) 2014 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

/**
 * @constructor
 * @param {!WebInspector.SectionCascade} cascade
 * @param {?WebInspector.CSSRule} rule
 * @param {!WebInspector.CSSStyleDeclaration} style
 * @param {string} customSelectorText
 * @param {?WebInspector.DOMNode=} inheritedFromNode
 */
WebInspector.StylesSectionModel = function(cascade, rule, style, customSelectorText, inheritedFromNode)
{
    this._cascade = cascade;
    this._rule = rule;
    this._style = style;
    this._customSelectorText = customSelectorText;
    this._editable = !!(this._style && this._style.styleSheetId);
    this._inheritedFromNode = inheritedFromNode || null;
}

WebInspector.StylesSectionModel.prototype = {
    /**
     * @return {!WebInspector.SectionCascade}
     */
    cascade: function()
    {
        return this._cascade;
    },

    /**
     * @return {boolean}
     */
    hasMatchingSelectors: function()
    {
        return this.rule() ? this.rule().matchingSelectors.length > 0 && this.mediaMatches() : true;
    },

    /**
     * @return {boolean}
     */
    mediaMatches: function()
    {
        var media = this.media();
        for (var i = 0; media && i < media.length; ++i) {
            if (!media[i].active())
                return false;
        }
        return true;
    },

    /**
     * @return {boolean}
     */
    inherited: function()
    {
        return !!this._inheritedFromNode;
    },

    /**
     * @return {?WebInspector.DOMNode}
     */
    parentNode: function()
    {
        return this._inheritedFromNode;
    },

    /**
     * @return {string}
     */
    selectorText: function()
    {
        if (this._customSelectorText)
            return this._customSelectorText;
        return this.rule() ? this.rule().selectorText() : "";
    },

    /**
     * @return {boolean}
     */
    editable: function()
    {
        return this._editable;
    },

    /**
     * @param {boolean} editable
     */
    setEditable: function(editable)
    {
        this._editable = editable;
    },

    /**
     * @return {!WebInspector.CSSStyleDeclaration}
     */
    style: function()
    {
        return this._style;
    },

    /**
     * @return {?WebInspector.CSSRule}
     */
    rule: function()
    {
        return this._rule;
    },

    /**
     * @return {?Array.<!WebInspector.CSSMedia>}
     */
    media: function()
    {
        return this.rule() ? this.rule().media : null;
    },

    /**
     * @param {!WebInspector.CSSRule} rule
     */
    updateRule: function(rule)
    {
        this._rule = rule;
        this._style = rule.style;
        this._cascade._resetUsedProperties();
    },

    resetCachedData: function()
    {
        this._cascade._resetUsedProperties();
    },

    /**
     * @param {string} propertyName
     * @return {boolean}
     */
    isPropertyInCascade: function(propertyName)
    {
        if (!this.hasMatchingSelectors())
            return false;
        if (this.inherited() && !WebInspector.CSSMetadata.isPropertyInherited(propertyName))
            return false;
        return true;
    },

    /**
     * @param {string} propertyName
     * @return {boolean}
     */
    isPropertyOverloaded: function(propertyName)
    {
        if (!this.isPropertyInCascade(propertyName))
            return false;
        var usedProperties = this._cascade._usedPropertiesForModel(this);
        var canonicalName = WebInspector.CSSMetadata.canonicalPropertyName(propertyName);
        return !usedProperties.has(canonicalName);
    }
}

/**
 * @constructor
 */
WebInspector.SectionCascade = function()
{
    this._models = [];
    this._resetUsedProperties();
}

WebInspector.SectionCascade.prototype = {
    /**
     * @return {!Array.<!WebInspector.StylesSectionModel>}
     */
    sectionModels: function()
    {
        return this._models;
    },

    /**
     * @param {!WebInspector.CSSRule} rule
     * @param {?WebInspector.DOMNode=} inheritedFromNode
     * @return {!WebInspector.StylesSectionModel}
     */
    appendModelFromRule: function(rule, inheritedFromNode)
    {
        return this._insertModel(new WebInspector.StylesSectionModel(this, rule, rule.style, "", inheritedFromNode));
    },

    /**
     * @param {!WebInspector.CSSRule} rule
     * @param {!WebInspector.StylesSectionModel} insertAfterStyleRule
     * @return {!WebInspector.StylesSectionModel}
     */
    insertModelFromRule: function(rule, insertAfterStyleRule)
    {
        return this._insertModel(new WebInspector.StylesSectionModel(this, rule, rule.style, "", null), insertAfterStyleRule);
    },

    /**
     * @param {!WebInspector.CSSStyleDeclaration} style
     * @param {string} selectorText
     * @param {?WebInspector.DOMNode=} inheritedFromNode
     * @return {!WebInspector.StylesSectionModel}
     */
    appendModelFromStyle: function(style, selectorText, inheritedFromNode)
    {
        return this._insertModel(new WebInspector.StylesSectionModel(this, null, style, selectorText, inheritedFromNode));
    },

    /**
     * @return {!Set.<string>}
     */
    allUsedProperties: function()
    {
        this._recomputeUsedPropertiesIfNeeded();
        return this._allUsedProperties;
    },

    /**
     * @param {!WebInspector.StylesSectionModel} model
     * @param {!WebInspector.StylesSectionModel=} insertAfter
     * @return {!WebInspector.StylesSectionModel}
     */
    _insertModel: function(model, insertAfter)
    {
        if (insertAfter) {
            var index = this._models.indexOf(insertAfter);
            console.assert(index !== -1, "The insertAfter anchor could not be found in cascade");
            this._models.splice(index + 1, 0, model);
        } else {
            this._models.push(model);
        }
        this._resetUsedProperties();
        return model;
    },

    _recomputeUsedPropertiesIfNeeded: function()
    {
        if (this._usedPropertiesPerModel.size > 0)
            return;
        var usedProperties = WebInspector.SectionCascade._computeUsedProperties(this._models, this._allUsedProperties);
        for (var i = 0; i < usedProperties.length; ++i)
            this._usedPropertiesPerModel.set(this._models[i], usedProperties[i]);
    },

    _resetUsedProperties: function()
    {
        /** @type {!Set.<string>} */
        this._allUsedProperties = new Set();
        /** @type {!Map.<!WebInspector.StylesSectionModel, !Set.<string>>} */
        this._usedPropertiesPerModel = new Map();
    },

    /**
     * @param {!WebInspector.StylesSectionModel} model
     * @return {!Set.<string>}
     */
    _usedPropertiesForModel: function(model)
    {
        this._recomputeUsedPropertiesIfNeeded();
        return /**@type {!Set.<string>}*/ (this._usedPropertiesPerModel.get(model));
    }
}

/**
 * @param {!Array.<!WebInspector.StylesSectionModel>} styleRules
 * @param {!Set.<string>} allUsedProperties
 * @return {!Array.<!Set.<string>>}
 */
WebInspector.SectionCascade._computeUsedProperties = function(styleRules, allUsedProperties)
{
    /** @type {!Set.<string>} */
    var foundImportantProperties = new Set();
    /** @type {!Map.<string, !Set.<string>>} */
    var propertyToEffectiveRule = new Map();
    /** @type {!Map.<string, !WebInspector.DOMNode>} */
    var inheritedPropertyToNode = new Map();
    var stylesUsedProperties = [];
    for (var i = 0; i < styleRules.length; ++i) {
        var styleRule = styleRules[i];
        /** @type {!Set.<string>} */
        var styleRuleUsedProperties = new Set();
        stylesUsedProperties.push(styleRuleUsedProperties);
        if (!styleRule.hasMatchingSelectors())
            continue;

        var style = styleRule.style();
        var allProperties = style.allProperties;
        for (var j = 0; j < allProperties.length; ++j) {
            var property = allProperties[j];
            if (!property.activeInStyle())
                continue;

            // Do not pick non-inherited properties from inherited styles.
            if (styleRule.inherited() && !WebInspector.CSSMetadata.isPropertyInherited(property.name))
                continue;

            var canonicalName = WebInspector.CSSMetadata.canonicalPropertyName(property.name);
            if (foundImportantProperties.has(canonicalName))
                continue;

            if (!property.important && allUsedProperties.has(canonicalName))
                continue;

            var isKnownProperty = propertyToEffectiveRule.has(canonicalName);
            var parentNode = styleRule.parentNode();
            if (!isKnownProperty && parentNode && !inheritedPropertyToNode.has(canonicalName))
                inheritedPropertyToNode.set(canonicalName, parentNode);

            if (property.important) {
                if (styleRule.inherited() && isKnownProperty && styleRule.parentNode() !== inheritedPropertyToNode.get(canonicalName))
                    continue;

                foundImportantProperties.add(canonicalName);
                if (isKnownProperty)
                    propertyToEffectiveRule.get(canonicalName).delete(canonicalName);
            }

            styleRuleUsedProperties.add(canonicalName);
            allUsedProperties.add(canonicalName);
            propertyToEffectiveRule.set(canonicalName, styleRuleUsedProperties);
        }

        // If every longhand of the shorthand is not active, then the shorthand is not active too.
        for (var property of style.leadingProperties()) {
            var canonicalName = WebInspector.CSSMetadata.canonicalPropertyName(property.name);
            if (!styleRuleUsedProperties.has(canonicalName))
                continue;
            var longhands = style.longhandProperties(property.name);
            if (!longhands.length)
                continue;
            var notUsed = true;
            for (var longhand of longhands) {
                var longhandCanonicalName = WebInspector.CSSMetadata.canonicalPropertyName(longhand.name);
                notUsed = notUsed && !styleRuleUsedProperties.has(longhandCanonicalName);
            }
            if (!notUsed)
                continue;
            styleRuleUsedProperties.delete(canonicalName);
            allUsedProperties.delete(canonicalName);
        }
    }
    return stylesUsedProperties;
}
