/*
 * Copyright (C) 2007 Apple Inc.  All rights reserved.
 * Copyright (C) 2009 Joseph Pecoraro
 *
 * Redistribution and use in source and binary forms, with or without
 * modification, are permitted provided that the following conditions
 * are met:
 *
 * 1.  Redistributions of source code must retain the above copyright
 *     notice, this list of conditions and the following disclaimer.
 * 2.  Redistributions in binary form must reproduce the above copyright
 *     notice, this list of conditions and the following disclaimer in the
 *     documentation and/or other materials provided with the distribution.
 * 3.  Neither the name of Apple Computer, Inc. ("Apple") nor the names of
 *     its contributors may be used to endorse or promote products derived
 *     from this software without specific prior written permission.
 *
 * THIS SOFTWARE IS PROVIDED BY APPLE AND ITS CONTRIBUTORS "AS IS" AND ANY
 * EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED
 * WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
 * DISCLAIMED. IN NO EVENT SHALL APPLE OR ITS CONTRIBUTORS BE LIABLE FOR ANY
 * DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES
 * (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES;
 * LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND
 * ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT
 * (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF
 * THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
 */

/**
 * @constructor
 * @param {!WebInspector.StylesSidebarPane} stylesSidebarPane
 * @param {!WebInspector.SharedSidebarModel} sharedModel
 * @extends {WebInspector.ThrottledWidget}
 */
WebInspector.ComputedStyleWidget = function(stylesSidebarPane, sharedModel)
{
    WebInspector.ThrottledWidget.call(this);
    this.element.classList.add("computed-style-sidebar-pane");

    this.registerRequiredCSS("elements/computedStyleSidebarPane.css");
    this._alwaysShowComputedProperties = { "display": true, "height": true, "width": true };

    this._sharedModel = sharedModel;
    this._sharedModel.addEventListener(WebInspector.SharedSidebarModel.Events.ComputedStyleChanged, this.update, this);

    this._showInheritedComputedStylePropertiesSetting = WebInspector.settings.createSetting("showInheritedComputedStyleProperties", false);
    this._showInheritedComputedStylePropertiesSetting.addChangeListener(this._showInheritedComputedStyleChanged.bind(this));

    var hbox = this.element.createChild("div", "hbox styles-sidebar-pane-toolbar");
    var filterContainerElement = hbox.createChild("div", "styles-sidebar-pane-filter-box");
    var filterInput = WebInspector.StylesSidebarPane.createPropertyFilterElement(WebInspector.UIString("Filter"), hbox, filterCallback.bind(this));
    filterContainerElement.appendChild(filterInput);

    var toolbar = new WebInspector.Toolbar(hbox);
    toolbar.element.classList.add("styles-pane-toolbar");
    toolbar.appendToolbarItem(new WebInspector.ToolbarCheckbox(WebInspector.UIString("Show all"), undefined, this._showInheritedComputedStylePropertiesSetting));

    this._propertiesOutline = new TreeOutlineInShadow();
    this._propertiesOutline.registerRequiredCSS("elements/computedStyleSidebarPane.css");
    this._propertiesOutline.element.classList.add("monospace", "computed-properties");
    this.element.appendChild(this._propertiesOutline.element);

    this._stylesSidebarPane = stylesSidebarPane;
    this._linkifier = new WebInspector.Linkifier(new WebInspector.Linkifier.DefaultCSSFormatter());

    /**
     * @param {?RegExp} regex
     * @this {WebInspector.ComputedStyleWidget}
     */
    function filterCallback(regex)
    {
        this._filterRegex = regex;
        this._updateFilter(regex);
    }
}

/**
 * @param {!WebInspector.StylesSidebarPane} stylesSidebarPane
 * @param {!WebInspector.SharedSidebarModel} sharedModel
 * @return {!WebInspector.ElementsSidebarViewWrapperPane}
 */
WebInspector.ComputedStyleWidget.createSidebarWrapper = function(stylesSidebarPane, sharedModel)
{
    var widget = new WebInspector.ComputedStyleWidget(stylesSidebarPane, sharedModel);
    return new WebInspector.ElementsSidebarViewWrapperPane(WebInspector.UIString("Computed Style"), widget)
}

WebInspector.ComputedStyleWidget._propertySymbol = Symbol("property");

WebInspector.ComputedStyleWidget.prototype = {
    _showInheritedComputedStyleChanged: function()
    {
        this.update();
    },

    /**
     * @override
     * @return {!Promise.<?>}
     */
    doUpdate: function()
    {
        var promises = [
            this._sharedModel.fetchComputedStyle(),
            this._stylesSidebarPane.fetchMatchedCascade()
        ];
        return Promise.all(promises)
            .spread(this._innerRebuildUpdate.bind(this));
    },

    /**
     * @param {string} text
     * @return {!Node}
     */
    _processColor: function(text)
    {
        var color = WebInspector.Color.parse(text);
        if (!color)
            return createTextNode(text);
        var swatch = WebInspector.ColorSwatch.create();
        swatch.setColorText(text);
        return swatch;
    },

    /**
     * @param {?WebInspector.SharedSidebarModel.ComputedStyle} nodeStyle
     * @param {?{matched: !WebInspector.SectionCascade, pseudo: !Map.<number, !WebInspector.SectionCascade>}} cascades
     */
    _innerRebuildUpdate: function(nodeStyle, cascades)
    {
        this._propertiesOutline.removeChildren();
        this._linkifier.reset();
        var cssModel = this._sharedModel.cssModel();
        if (!nodeStyle || !cascades || !cssModel)
            return;

        var uniqueProperties = nodeStyle.computedStyle.keysArray();
        uniqueProperties.sort(propertySorter);

        var propertyTraces = this._computePropertyTraces(cascades.matched);
        var showInherited = this._showInheritedComputedStylePropertiesSetting.get();
        for (var i = 0; i < uniqueProperties.length; ++i) {
            var propertyName = uniqueProperties[i];
            var propertyValue = nodeStyle.computedStyle.get(propertyName);
            var inherited = this._isPropertyInherited(cascades.matched, propertyName);
            if (!showInherited && inherited && !(propertyName in this._alwaysShowComputedProperties))
                continue;
            var canonicalName = WebInspector.CSSMetadata.canonicalPropertyName(propertyName);
            if (propertyName !== canonicalName && propertyValue === nodeStyle.computedStyle.get(canonicalName))
                continue;

            var propertyElement = createElement("div");
            propertyElement.classList.add("computed-style-property");
            propertyElement.classList.toggle("computed-style-property-inherited", inherited);
            var renderer = new WebInspector.StylesSidebarPropertyRenderer(null, nodeStyle.node, propertyName, /** @type {string} */(propertyValue));
            renderer.setColorHandler(this._processColor.bind(this));
            var propertyNameElement = renderer.renderName();
            propertyNameElement.classList.add("property-name");
            propertyElement.appendChild(propertyNameElement);
            var propertyValueElement = renderer.renderValue();
            propertyValueElement.classList.add("property-value");
            propertyElement.appendChild(propertyValueElement);

            var treeElement = new TreeElement();
            treeElement.selectable = false;
            treeElement.title = propertyElement;
            treeElement[WebInspector.ComputedStyleWidget._propertySymbol] = {
                name: propertyName,
                value: propertyValue
            };
            var isOdd = this._propertiesOutline.rootElement().children().length % 2 === 0;
            treeElement.listItemElement.classList.toggle("odd-row", isOdd);
            this._propertiesOutline.appendChild(treeElement);

            var trace = propertyTraces.get(propertyName);
            if (trace) {
                this._renderPropertyTrace(cssModel, nodeStyle.node, treeElement, trace);
                treeElement.listItemElement.addEventListener("mousedown", consumeEvent, false);
                treeElement.listItemElement.addEventListener("dblclick", consumeEvent, false);
                treeElement.listItemElement.addEventListener("click", handleClick.bind(null, treeElement), false);
            }
        }

        this._updateFilter(this._filterRegex);

        /**
         * @param {string} a
         * @param {string} b
         * @return {number}
         */
        function propertySorter(a, b)
        {
            if (a.startsWith("-webkit") ^ b.startsWith("-webkit"))
                return a.startsWith("-webkit") ? 1 : -1;
            var canonicalName = WebInspector.CSSMetadata.canonicalPropertyName;
            return canonicalName(a).compareTo(canonicalName(b));
        }

        /**
         * @param {!TreeElement} treeElement
         * @param {!Event} event
         */
        function handleClick(treeElement, event)
        {
            if (!treeElement.expanded)
                treeElement.expand();
            else
                treeElement.collapse();
            consumeEvent(event);
        }
    },

    /**
     * @param {!WebInspector.CSSStyleModel} cssModel
     * @param {!WebInspector.DOMNode} node
     * @param {!TreeElement} rootTreeElement
     * @param {!Array.<!{property: !WebInspector.CSSProperty, overloaded: boolean}>} tracedProperties
     */
    _renderPropertyTrace: function(cssModel, node, rootTreeElement, tracedProperties)
    {
        for (var propertyInfo of tracedProperties) {
            var trace = createElement("div");
            trace.classList.add("property-trace");
            if (propertyInfo.overloaded)
                trace.classList.add("property-trace-inactive");

            var renderer = new WebInspector.StylesSidebarPropertyRenderer(null, node, propertyInfo.property.name, /** @type {string} */(propertyInfo.property.value));
            renderer.setColorHandler(this._processColor.bind(this));
            var valueElement = renderer.renderValue();
            valueElement.classList.add("property-trace-value");
            trace.appendChild(valueElement);

            var rule = propertyInfo.property.ownerStyle.parentRule;
            if (rule) {
                var linkSpan = trace.createChild("span", "trace-link");
                linkSpan.appendChild(WebInspector.StylePropertiesSection.createRuleOriginNode(cssModel, this._linkifier, rule));
            }

            var selectorElement = trace.createChild("span", "property-trace-selector");
            selectorElement.textContent = rule ? rule.selectorText() : "element.style";
            selectorElement.title = selectorElement.textContent;

            var traceTreeElement = new TreeElement();
            traceTreeElement.title = trace;
            traceTreeElement.selectable = false;
            rootTreeElement.appendChild(traceTreeElement);
        }
    },

    /**
     * @param {!WebInspector.SectionCascade} matchedCascade
     * @return {!Map.<string, !Array.<!{property: !WebInspector.CSSProperty, overloaded: boolean}>>}
     */
    _computePropertyTraces: function(matchedCascade)
    {
        var result = new Map();
        var models = matchedCascade.sectionModels();
        for (var model of models) {
            var allProperties = model.style().allProperties;
            for (var property of allProperties) {
                if (!property.activeInStyle() || !model.isPropertyInCascade(property.name))
                    continue;
                if (!result.has(property.name))
                    result.set(property.name, []);
                result.get(property.name).push({
                    property: property,
                    overloaded: model.isPropertyOverloaded(property.name)
                });
            }
        }
        return result;
    },

    /**
     * @param {!WebInspector.SectionCascade} matchedCascade
     * @param {string} propertyName
     */
    _isPropertyInherited: function(matchedCascade, propertyName)
    {
        var canonicalName = WebInspector.CSSMetadata.canonicalPropertyName(propertyName);
        return !matchedCascade.allUsedProperties().has(canonicalName);
    },

    /**
     * @param {?RegExp} regex
     */
    _updateFilter: function(regex)
    {
        var children = this._propertiesOutline.rootElement().children();
        for (var child of children) {
            var property = child[WebInspector.ComputedStyleWidget._propertySymbol];
            var matched = !regex || regex.test(property.name) || regex.test(property.value);
            child.hidden = !matched;
        }
    },

    __proto__: WebInspector.ThrottledWidget.prototype
}
