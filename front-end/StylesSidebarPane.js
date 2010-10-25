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

WebInspector.StylesSidebarPane = function(computedStylePane)
{
    WebInspector.SidebarPane.call(this, WebInspector.UIString("Styles"));

    this.settingsSelectElement = document.createElement("select");

    var option = document.createElement("option");
    option.value = "hex";
    option.action = this._changeColorFormat.bind(this);
    option.label = WebInspector.UIString("Hex Colors");
    this.settingsSelectElement.appendChild(option);

    option = document.createElement("option");
    option.value = "rgb";
    option.action = this._changeColorFormat.bind(this);
    option.label = WebInspector.UIString("RGB Colors");
    this.settingsSelectElement.appendChild(option);

    option = document.createElement("option");
    option.value = "hsl";
    option.action = this._changeColorFormat.bind(this);
    option.label = WebInspector.UIString("HSL Colors");
    this.settingsSelectElement.appendChild(option);

    this.settingsSelectElement.appendChild(document.createElement("hr"));

    option = document.createElement("option");
    option.action = this._createNewRule.bind(this);
    option.label = WebInspector.UIString("New Style Rule");
    this.settingsSelectElement.appendChild(option);

    this.settingsSelectElement.addEventListener("click", function(event) { event.stopPropagation() }, false);
    this.settingsSelectElement.addEventListener("change", this._changeSetting.bind(this), false);
    WebInspector.applicationSettings.addEventListener("loaded", this._settingsLoaded, this);

    this.titleElement.appendChild(this.settingsSelectElement);
    this._computedStylePane = computedStylePane;
    this.element.addEventListener("contextmenu", this._contextMenuEventFired.bind(this), true);
}

// Taken from http://www.w3.org/TR/CSS21/propidx.html.
WebInspector.StylesSidebarPane.InheritedProperties = [
    "azimuth", "border-collapse", "border-spacing", "caption-side", "color", "cursor", "direction", "elevation",
    "empty-cells", "font-family", "font-size", "font-style", "font-variant", "font-weight", "font", "letter-spacing",
    "line-height", "list-style-image", "list-style-position", "list-style-type", "list-style", "orphans", "pitch-range",
    "pitch", "quotes", "richness", "speak-header", "speak-numeral", "speak-punctuation", "speak", "speech-rate", "stress",
    "text-align", "text-indent", "text-transform", "text-shadow", "visibility", "voice-family", "volume", "white-space", "widows", "word-spacing"
].keySet();

// Keep in sync with RenderStyleConstants.h PseudoId enum. Array below contains pseudo id names for corresponding enum indexes.
// First item is empty due to its artificial NOPSEUDO nature in the enum.
// FIXME: find a way of generating this mapping or getting it from combination of RenderStyleConstants and CSSSelector.cpp at
// runtime.
WebInspector.StylesSidebarPane.PseudoIdNames = [
    "", "first-line", "first-letter", "before", "after", "selection", "", "-webkit-scrollbar", "-webkit-file-upload-button",
    "-webkit-input-placeholder", "-webkit-slider-thumb", "-webkit-search-cancel-button", "-webkit-search-decoration",
    "-webkit-search-results-decoration", "-webkit-search-results-button", "-webkit-media-controls-panel",
    "-webkit-media-controls-play-button", "-webkit-media-controls-mute-button", "-webkit-media-controls-timeline",
    "-webkit-media-controls-timeline-container", "-webkit-media-controls-volume-slider",
    "-webkit-media-controls-volume-slider-container", "-webkit-media-controls-current-time-display",
    "-webkit-media-controls-time-remaining-display", "-webkit-media-controls-seek-back-button", "-webkit-media-controls-seek-forward-button",
    "-webkit-media-controls-fullscreen-button", "-webkit-media-controls-rewind-button", "-webkit-media-controls-return-to-realtime-button",
    "-webkit-media-controls-toggle-closed-captions-button", "-webkit-media-controls-status-display", "-webkit-scrollbar-thumb",
    "-webkit-scrollbar-button", "-webkit-scrollbar-track", "-webkit-scrollbar-track-piece", "-webkit-scrollbar-corner",
    "-webkit-resizer", "-webkit-input-list-button", "-webkit-inner-spin-button", "-webkit-outer-spin-button"
];

WebInspector.StylesSidebarPane.prototype = {
    _settingsLoaded: function()
    {
        var format = WebInspector.applicationSettings.colorFormat;
        if (format === "hex")
            this.settingsSelectElement[0].selected = true;
        if (format === "rgb")
            this.settingsSelectElement[1].selected = true;
        if (format === "hsl")
            this.settingsSelectElement[2].selected = true;
    },

    _contextMenuEventFired: function(event)
    {
        var href = event.target.enclosingNodeOrSelfWithClass("webkit-html-resource-link") || event.target.enclosingNodeOrSelfWithClass("webkit-html-external-link");
        if (href) {
            var contextMenu = new WebInspector.ContextMenu();
            var filled = WebInspector.panels.elements.populateHrefContextMenu(contextMenu, event, href);
            if (filled)
                contextMenu.show(event);
        }
    },

    update: function(node, editedSection, forceUpdate)
    {
        var refresh = false;

        if (forceUpdate)
            delete this.node;

        if (!forceUpdate && (!node || node === this.node))
            refresh = true;

        if (node && node.nodeType === Node.TEXT_NODE && node.parentNode)
            node = node.parentNode;

        if (node && node.nodeType !== Node.ELEMENT_NODE)
            node = null;

        if (node)
            this.node = node;
        else
            node = this.node;

        if (!node) {
            this.bodyElement.removeChildren();
            this._computedStylePane.bodyElement.removeChildren();
            this.sections = {};
            return;
        }

        function stylesCallback(styles)
        {
            if (styles)
                this._rebuildUpdate(node, styles);
        }

        function computedStyleCallback(computedStyle)
        {
            if (computedStyle)
                this._refreshUpdate(node, computedStyle, editedSection);
        }

        if (refresh)
            WebInspector.cssModel.getComputedStyleAsync(node.id, computedStyleCallback.bind(this));
        else
            WebInspector.cssModel.getStylesAsync(node.id, !WebInspector.applicationSettings.showUserAgentStyles, stylesCallback.bind(this));
    },

    _refreshUpdate: function(node, computedStyle, editedSection)
    {
        for (var pseudoId in this.sections) {
            var styleRules = this._refreshStyleRules(this.sections[pseudoId], computedStyle);
            var usedProperties = {};
            var disabledComputedProperties = {};
            this._markUsedProperties(styleRules, usedProperties, disabledComputedProperties);
            this._refreshSectionsForStyleRules(styleRules, usedProperties, disabledComputedProperties, editedSection);
        }
        // Trace the computed style.
        this.sections[0][0].rebuildComputedTrace(this.sections[0]);
    },

    _rebuildUpdate: function(node, styles)
    {
        this.bodyElement.removeChildren();
        this._computedStylePane.bodyElement.removeChildren();

        var styleRules = this._rebuildStyleRules(node, styles);
        var usedProperties = {};
        var disabledComputedProperties = {};
        this._markUsedProperties(styleRules, usedProperties, disabledComputedProperties);
        this.sections[0] = this._rebuildSectionsForStyleRules(styleRules, usedProperties, disabledComputedProperties, 0);
        var anchorElement = this.sections[0].inheritedPropertiesSeparatorElement;
        // Trace the computed style.
        this.sections[0][0].rebuildComputedTrace(this.sections[0]);

        for (var i = 0; i < styles.pseudoElements.length; ++i) {
            var pseudoElementCSSRules = styles.pseudoElements[i];

            styleRules = [];
            var pseudoId = pseudoElementCSSRules.pseudoId;

            var entry = { isStyleSeparator: true, pseudoId: pseudoId };
            styleRules.push(entry);

            // Add rules in reverse order to match the cascade order.
            for (var j = pseudoElementCSSRules.rules.length - 1; j >= 0; --j) {
                var rule = WebInspector.CSSStyleDeclaration.parseRule(pseudoElementCSSRules.rules[j]);
                styleRules.push({ style: rule.style, selectorText: rule.selectorText, parentStyleSheet: rule.parentStyleSheet, rule: rule });
            }
            usedProperties = {};
            disabledComputedProperties = {};
            this._markUsedProperties(styleRules, usedProperties, disabledComputedProperties);
            this.sections[pseudoId] = this._rebuildSectionsForStyleRules(styleRules, usedProperties, disabledComputedProperties, pseudoId, anchorElement);
        }
    },

    _refreshStyleRules: function(sections, computedStyle)
    {
        var nodeComputedStyle = new WebInspector.CSSStyleDeclaration(computedStyle);
        var styleRules = [];
        for (var i = 0; sections && i < sections.length; ++i) {
            var section = sections[i];
            if (section instanceof WebInspector.BlankStylePropertiesSection)
                continue;
            if (section.computedStyle)
                section.styleRule.style = nodeComputedStyle;
            var styleRule = { section: section, style: section.styleRule.style, computedStyle: section.computedStyle, rule: section.rule };
            styleRules.push(styleRule);
        }
        return styleRules;
    },

    _rebuildStyleRules: function(node, styles)
    {
        var nodeComputedStyle = new WebInspector.CSSStyleDeclaration(styles.computedStyle);
        this.sections = {};

        var styleRules = [];

        styleRules.push({ computedStyle: true, selectorText: "", style: nodeComputedStyle, editable: false });

        var styleAttributes = {};
        for (var name in styles.styleAttributes) {
            var attrStyle = { style: new WebInspector.CSSStyleDeclaration(styles.styleAttributes[name]), editable: false };
            attrStyle.selectorText = WebInspector.panels.elements.treeOutline.nodeNameToCorrectCase(node.nodeName) + "[" + name;
            if (node.getAttribute(name))
                attrStyle.selectorText += "=" + node.getAttribute(name);
            attrStyle.selectorText += "]";
            styleRules.push(attrStyle);
        }

        // Show element's Style Attributes
        if (styles.inlineStyle && node.nodeType === Node.ELEMENT_NODE) {
            var inlineStyle = { selectorText: "element.style", style: new WebInspector.CSSStyleDeclaration(styles.inlineStyle), isAttribute: true };
            styleRules.push(inlineStyle);
        }

        // Add rules in reverse order to match the cascade order.
        if (styles.matchedCSSRules.length)
            styleRules.push({ isStyleSeparator: true, text: WebInspector.UIString("Matched CSS Rules") });
        for (var i = styles.matchedCSSRules.length - 1; i >= 0; --i) {
            var rule = WebInspector.CSSStyleDeclaration.parseRule(styles.matchedCSSRules[i]);
            styleRules.push({ style: rule.style, selectorText: rule.selectorText, parentStyleSheet: rule.parentStyleSheet, rule: rule });
        }

        // Walk the node structure and identify styles with inherited properties.
        var parentStyles = styles.parent;
        var parentNode = node.parentNode;
        function insertInheritedNodeSeparator(node)
        {
            var entry = {};
            entry.isStyleSeparator = true;
            entry.node = node;
            styleRules.push(entry);
        }

        while (parentStyles) {
            var separatorInserted = false;
            if (parentStyles.inlineStyle) {
                if (this._containsInherited(parentStyles.inlineStyle)) {
                    var inlineStyle = { selectorText: WebInspector.UIString("Style Attribute"), style: new WebInspector.CSSStyleDeclaration(parentStyles.inlineStyle), isAttribute: true, isInherited: true };
                    if (!separatorInserted) {
                        insertInheritedNodeSeparator(parentNode);
                        separatorInserted = true;
                    }
                    styleRules.push(inlineStyle);
                }
            }

            for (var i = parentStyles.matchedCSSRules.length - 1; i >= 0; --i) {
                var rulePayload = parentStyles.matchedCSSRules[i];
                if (!this._containsInherited(rulePayload.style))
                    continue;
                var rule = WebInspector.CSSStyleDeclaration.parseRule(rulePayload);
                if (!separatorInserted) {
                    insertInheritedNodeSeparator(parentNode);
                    separatorInserted = true;
                }
                styleRules.push({ style: rule.style, selectorText: rule.selectorText, parentStyleSheet: rule.parentStyleSheet, rule: rule, isInherited: true });
            }
            parentStyles = parentStyles.parent;
            parentNode = parentNode.parentNode;
        }
        return styleRules;
    },

    _markUsedProperties: function(styleRules, usedProperties, disabledComputedProperties)
    {
        function deleteDisabledProperty(style, name)
        {
            if (!style || !name)
                return;
            if (style.__disabledPropertyValues)
                delete style.__disabledPropertyValues[name];
            if (style.__disabledPropertyPriorities)
                delete style.__disabledPropertyPriorities[name];
            if (style.__disabledProperties)
                delete style.__disabledProperties[name];
        }

        var priorityUsed = false;

        // Walk the style rules and make a list of all used and overloaded properties.
        for (var i = 0; i < styleRules.length; ++i) {
            var styleRule = styleRules[i];
            if (styleRule.computedStyle || styleRule.isStyleSeparator)
                continue;
            if (styleRule.section && styleRule.section.noAffect)
                continue;

            styleRule.usedProperties = {};

            var style = styleRule.style;
            for (var j = 0; j < style.length; ++j) {
                var name = style[j];

                if (!priorityUsed && style.getPropertyPriority(name).length)
                    priorityUsed = true;

                // If the property name is already used by another rule then this rule's
                // property is overloaded, so don't add it to the rule's usedProperties.
                if (!(name in usedProperties))
                    styleRule.usedProperties[name] = true;

                if (name === "font") {
                    // The font property is not reported as a shorthand. Report finding the individual
                    // properties so they are visible in computed style.
                    // FIXME: remove this when http://bugs.webkit.org/show_bug.cgi?id=15598 is fixed.
                    styleRule.usedProperties["font-family"] = true;
                    styleRule.usedProperties["font-size"] = true;
                    styleRule.usedProperties["font-style"] = true;
                    styleRule.usedProperties["font-variant"] = true;
                    styleRule.usedProperties["font-weight"] = true;
                    styleRule.usedProperties["line-height"] = true;
                }

                // Delete any disabled properties, since the property does exist.
                // This prevents it from showing twice.
                deleteDisabledProperty(style, name);
                deleteDisabledProperty(style, style.getPropertyShorthand(name));
            }

            // Add all the properties found in this style to the used properties list.
            // Do this here so only future rules are affect by properties used in this rule.
            for (var name in styleRules[i].usedProperties)
                usedProperties[name] = true;

            // Remember all disabled properties so they show up in computed style.
            if (style.__disabledProperties)
                for (var name in style.__disabledProperties)
                    disabledComputedProperties[name] = true;
        }

        if (priorityUsed) {
            // Walk the properties again and account for !important.
            var foundPriorityProperties = [];

            // Walk in reverse to match the order !important overrides.
            for (var i = (styleRules.length - 1); i >= 0; --i) {
                if (styleRules[i].computedStyle || styleRules[i].isStyleSeparator)
                    continue;

                var style = styleRules[i].style;
                for (var j = 0; j < style.length; ++j) {
                    var name = style[j];
                    if (style.getPropertyPriority(name).length) {
                        if (!(name in foundPriorityProperties))
                            styleRules[i].usedProperties[name] = true;
                        else
                            delete styleRules[i].usedProperties[name];
                        foundPriorityProperties[name] = true;
                    } else if (name in foundPriorityProperties)
                        delete styleRules[i].usedProperties[name];
                }
            }
        }
    },

    _refreshSectionsForStyleRules: function(styleRules, usedProperties, disabledComputedProperties, editedSection)
    {
        // Walk the style rules and update the sections with new overloaded and used properties.
        for (var i = 0; i < styleRules.length; ++i) {
            var styleRule = styleRules[i];
            var section = styleRule.section;
            if (styleRule.computedStyle) {
                section._disabledComputedProperties = disabledComputedProperties;
                section._usedProperties = usedProperties;
                section.update();
            } else {
                section._usedProperties = styleRule.usedProperties;
                section.update(section === editedSection);
            }
        }
    },

    _rebuildSectionsForStyleRules: function(styleRules, usedProperties, disabledComputedProperties, pseudoId, anchorElement)
    {
        // Make a property section for each style rule.
        var sections = [];
        var lastWasSeparator = true;
        for (var i = 0; i < styleRules.length; ++i) {
            var styleRule = styleRules[i];
            if (styleRule.isStyleSeparator) {
                var separatorElement = document.createElement("div");
                separatorElement.className = "styles-sidebar-separator";
                if (styleRule.node) {
                    var link = WebInspector.panels.elements.linkifyNodeReference(styleRule.node);
                    separatorElement.appendChild(document.createTextNode(WebInspector.UIString("Inherited from") + " "));
                    separatorElement.appendChild(link);
                    if (!sections.inheritedPropertiesSeparatorElement)
                        sections.inheritedPropertiesSeparatorElement = separatorElement;
                } else if ("pseudoId" in styleRule) {
                    var pseudoName = WebInspector.StylesSidebarPane.PseudoIdNames[styleRule.pseudoId];
                    if (pseudoName)
                        separatorElement.textContent = WebInspector.UIString("Pseudo ::%s element", pseudoName);
                    else
                        separatorElement.textContent = WebInspector.UIString("Pseudo element");
                } else
                    separatorElement.textContent = styleRule.text;
                this.bodyElement.insertBefore(separatorElement, anchorElement);
                lastWasSeparator = true;
                continue;
            }
            var computedStyle = styleRule.computedStyle;

            // Default editable to true if it was omitted.
            var editable = styleRule.editable;
            if (typeof editable === "undefined")
                editable = true;

            if (computedStyle)
                var section = new WebInspector.ComputedStylePropertiesSection(styleRule, usedProperties, disabledComputedProperties, styleRules);
            else
                var section = new WebInspector.StylePropertiesSection(styleRule, editable, styleRule.isInherited, lastWasSeparator);
            section.pane = this;
            section.expanded = true;

            if (computedStyle) {
                this._computedStylePane.bodyElement.appendChild(section.element);
                lastWasSeparator = true;
            } else {
                this.bodyElement.insertBefore(section.element, anchorElement);
                lastWasSeparator = false;
            }
            sections.push(section);
        }
        return sections;
    },

    _containsInherited: function(payload)
    {
        if (this._arrayContainsInheritedProperty(payload.properties))
            return true;
        if (payload.disabled && this._arrayContainsInheritedProperty(payload.disabled))
            return true;
        return false;
    },

    _arrayContainsInheritedProperty: function(properties)
    {
        for (var i = 0; i < properties.length; ++i) {
            var property = properties[i];
            // Does this style contain non-overridden inherited property?
            if (property.name in WebInspector.StylesSidebarPane.InheritedProperties)
                return true;
        }
        return false;
    },

    _changeSetting: function(event)
    {
        var options = this.settingsSelectElement.options;
        var selectedOption = options[this.settingsSelectElement.selectedIndex];
        selectedOption.action(event);

        // Select the correct color format setting again, since it needs to be selected.
        var selectedIndex = 0;
        for (var i = 0; i < options.length; ++i) {
            if (options[i].value === WebInspector.applicationSettings.colorFormat) {
                selectedIndex = i;
                break;
            }
        }

        this.settingsSelectElement.selectedIndex = selectedIndex;
    },

    _changeColorFormat: function(event)
    {
        var selectedOption = this.settingsSelectElement[this.settingsSelectElement.selectedIndex];
        WebInspector.applicationSettings.colorFormat = selectedOption.value;

        for (var pseudoId in this.sections) {
            var sections = this.sections[pseudoId];
            for (var i = 0; i < sections.length; ++i)
                sections[i].update(true);
        }
    },

    _createNewRule: function(event)
    {
        this.addBlankSection().startEditingSelector();
    },

    addBlankSection: function()
    {
        var blankSection = new WebInspector.BlankStylePropertiesSection(appropriateSelectorForNode(this.node, true));
        blankSection.pane = this;

        var elementStyleSection = this.sections[0][1];
        this.bodyElement.insertBefore(blankSection.element, elementStyleSection.element.nextSibling);

        this.sections[0].splice(2, 0, blankSection);

        return blankSection;
    },

    removeSection: function(section)
    {
        for (var pseudoId in this.sections) {
            var sections = this.sections[pseudoId];
            var index = sections.indexOf(section);
            if (index === -1)
                continue;
            sections.splice(index, 1);
            if (section.element.parentNode)
                section.element.parentNode.removeChild(section.element);
        }
    },

    registerShortcuts: function()
    {
        var section = WebInspector.shortcutsHelp.section(WebInspector.UIString("Styles Pane"));
        var shortcut = WebInspector.KeyboardShortcut;
        var keys = [
            shortcut.shortcutToString(shortcut.Keys.Tab),
            shortcut.shortcutToString(shortcut.Keys.Tab, shortcut.Modifiers.Shift)
        ];
        section.addRelatedKeys(keys, WebInspector.UIString("Next/previous property"));
        keys = [
            shortcut.shortcutToString(shortcut.Keys.Up),
            shortcut.shortcutToString(shortcut.Keys.Down)
        ];
        section.addRelatedKeys(keys, WebInspector.UIString("Increment/decrement value"));
        keys = [
            shortcut.shortcutToString(shortcut.Keys.Up, shortcut.Modifiers.Shift),
            shortcut.shortcutToString(shortcut.Keys.Down, shortcut.Modifiers.Shift)
        ];
        section.addRelatedKeys(keys, WebInspector.UIString("Increment/decrement by %f", 10));
        keys = [
            shortcut.shortcutToString(shortcut.Keys.PageUp),
            shortcut.shortcutToString(shortcut.Keys.PageDown)
        ];
        section.addRelatedKeys(keys, WebInspector.UIString("Increment/decrement by %f", 10));
        keys = [
            shortcut.shortcutToString(shortcut.Keys.PageUp, shortcut.Modifiers.Shift),
            shortcut.shortcutToString(shortcut.Keys.PageDown, shortcut.Modifiers.Shift)
        ];
        section.addRelatedKeys(keys, WebInspector.UIString("Increment/decrement by %f", 100));
        keys = [
            shortcut.shortcutToString(shortcut.Keys.PageUp, shortcut.Modifiers.Alt),
            shortcut.shortcutToString(shortcut.Keys.PageDown, shortcut.Modifiers.Alt)
        ];
        section.addRelatedKeys(keys, WebInspector.UIString("Increment/decrement by %f", 0.1));
    }
}

WebInspector.StylesSidebarPane.prototype.__proto__ = WebInspector.SidebarPane.prototype;

WebInspector.ComputedStyleSidebarPane = function()
{
    WebInspector.SidebarPane.call(this, WebInspector.UIString("Computed Style"));
    var showInheritedCheckbox = new WebInspector.Checkbox(WebInspector.UIString("Show inherited"), "sidebar-pane-subtitle");
    this.titleElement.appendChild(showInheritedCheckbox.element);

    function settingsLoaded()
    {
        if (WebInspector.applicationSettings.showInheritedComputedStyleProperties) {
            this.bodyElement.addStyleClass("show-inherited");
            showInheritedCheckbox.checked = true;
        }
    }

    WebInspector.applicationSettings.addEventListener("loaded", settingsLoaded.bind(this));

    function showInheritedToggleFunction(event)
    {
        WebInspector.applicationSettings.showInheritedComputedStyleProperties = showInheritedCheckbox.checked;
        if (WebInspector.applicationSettings.showInheritedComputedStyleProperties)
            this.bodyElement.addStyleClass("show-inherited");
        else
            this.bodyElement.removeStyleClass("show-inherited");
    }

    showInheritedCheckbox.addEventListener(showInheritedToggleFunction.bind(this));
}

WebInspector.ComputedStyleSidebarPane.prototype.__proto__ = WebInspector.SidebarPane.prototype;

WebInspector.StylePropertiesSection = function(styleRule, editable, isInherited, isFirstSection)
{
    WebInspector.PropertiesSection.call(this, "");
    this.element.className = "styles-section monospace" + (isFirstSection ? " first-styles-section" : "");

    this._selectorElement = document.createElement("span");
    this._selectorElement.textContent = styleRule.selectorText;
    this.titleElement.appendChild(this._selectorElement);

    var openBrace = document.createElement("span");
    openBrace.textContent = " {";
    this.titleElement.appendChild(openBrace);

    var closeBrace = document.createElement("div");
    closeBrace.textContent = "}";
    this.element.appendChild(closeBrace);

    this._selectorElement.addEventListener("dblclick", this._handleSelectorDoubleClick.bind(this), false);
    this.element.addEventListener("dblclick", this._handleEmptySpaceDoubleClick.bind(this), false);

    this.styleRule = styleRule;
    this.rule = this.styleRule.rule;
    this.editable = editable;
    this.isInherited = isInherited;

    // Prevent editing the user agent and user rules.
    var isUserAgent = this.rule && this.rule.isUserAgent;
    var isUser = this.rule && this.rule.isUser;
    var isViaInspector = this.rule && this.rule.isViaInspector;

    if (isUserAgent || isUser)
        this.editable = false;

    this._usedProperties = styleRule.usedProperties;

    if (this.rule)
        this.titleElement.addStyleClass("styles-selector");

    function linkifyUncopyable(url, line)
    {
        var link = WebInspector.linkifyResourceAsNode(url, "resources", line + 1);
        link.setAttribute("data-uncopyable", link.textContent);
        link.textContent = "";
        return link;
    }

    var subtitle = "";
    if (this.styleRule.parentStyleSheet && this.styleRule.parentStyleSheet.href)
        this.subtitleElement.appendChild(linkifyUncopyable(this.styleRule.parentStyleSheet.href, this.rule.sourceLine));
    else if (isUserAgent)
        subtitle = WebInspector.UIString("user agent stylesheet");
    else if (isUser)
        subtitle = WebInspector.UIString("user stylesheet");
    else if (isViaInspector)
        subtitle = WebInspector.UIString("via inspector");
    else if (this.rule && this.rule.documentURL)
        this.subtitleElement.appendChild(linkifyUncopyable(this.rule.documentURL, this.rule.sourceLine));

    if (isInherited)
        this.element.addStyleClass("show-inherited"); // This one is related to inherited rules, not compted style.
    if (subtitle)
        this.subtitle = subtitle;

    this.identifier = styleRule.selectorText;
    if (this.subtitle)
        this.identifier += ":" + this.subtitle;

    if (!this.editable)
        this.element.addStyleClass("read-only");
}

WebInspector.StylePropertiesSection.prototype = {
    collapse: function(dontRememberState)
    {
        // Overriding with empty body.
    },

    isPropertyInherited: function(property)
    {
        if (this.isInherited) {
            // While rendering inherited stylesheet, reverse meaning of this property.
            // Render truly inherited properties with black, i.e. return them as non-inherited.
            return !(property in WebInspector.StylesSidebarPane.InheritedProperties);
        }
        return false;
    },

    isPropertyOverloaded: function(property, shorthand)
    {
        if (!this._usedProperties || this.noAffect)
            return false;

        if (this.isInherited && !(property in WebInspector.StylesSidebarPane.InheritedProperties)) {
            // In the inherited sections, only show overrides for the potentially inherited properties.
            return false;
        }

        var used = (property in this._usedProperties);
        if (used || !shorthand)
            return !used;

        // Find out if any of the individual longhand properties of the shorthand
        // are used, if none are then the shorthand is overloaded too.
        var longhandProperties = this.styleRule.style.getLonghandProperties(property);
        for (var j = 0; j < longhandProperties.length; ++j) {
            var individualProperty = longhandProperties[j];
            if (individualProperty in this._usedProperties)
                return false;
        }

        return true;
    },

    isPropertyDisabled: function(property)
    {
        if (!this.styleRule.style.__disabledPropertyValues)
            return false;
        return property in this.styleRule.style.__disabledPropertyValues;
    },

    update: function(full)
    {
        if (full) {
            this.propertiesTreeOutline.removeChildren();
            this.populated = false;
        } else {
            var child = this.propertiesTreeOutline.children[0];
            while (child) {
                child.overloaded = this.isPropertyOverloaded(child.name, child.shorthand);
                child = child.traverseNextTreeElement(false, null, true);
            }
        }
        this.afterUpdate();
    },

    afterUpdate: function()
    {
        if (this._afterUpdate) {
            this._afterUpdate(this);
            delete this._afterUpdate;
        }
    },

    onpopulate: function()
    {
        var style = this.styleRule.style;

        var foundShorthands = {};
        var disabledProperties = style.__disabledPropertyValues || {};

        this.uniqueProperties = [];
        for (var i = 0; i < style.length; ++i)
            this.uniqueProperties.push(style[i]);

        for (var name in disabledProperties)
            this.uniqueProperties.push(name);

        this.uniqueProperties.sort();

        for (var i = 0; i < this.uniqueProperties.length; ++i) {
            var name = this.uniqueProperties[i];
            var disabled = name in disabledProperties;
            var shorthand = !disabled ? style.getPropertyShorthand(name) : null;

            if (shorthand && shorthand in foundShorthands)
                continue;

            if (shorthand) {
                foundShorthands[shorthand] = true;
                name = shorthand;
            }

            var isShorthand = (shorthand ? true : false);
            var inherited = this.isPropertyInherited(name);
            var overloaded = this.isPropertyOverloaded(name, isShorthand);

            var item = new WebInspector.StylePropertyTreeElement(this.styleRule, style, name, isShorthand, inherited, overloaded, disabled);
            this.propertiesTreeOutline.appendChild(item);
        }
    },

    findTreeElementWithName: function(name)
    {
        var treeElement = this.propertiesTreeOutline.children[0];
        while (treeElement) {
            if (treeElement.name === name)
                return treeElement;
            treeElement = treeElement.traverseNextTreeElement(true, null, true);
        }
        return null;
    },

    addNewBlankProperty: function()
    {
        var item = new WebInspector.StylePropertyTreeElement(this.styleRule, this.styleRule.style, "", false, false, false, false);
        this.propertiesTreeOutline.appendChild(item);
        item.listItemElement.textContent = "";
        item._newProperty = true;
        return item;
    },

    _handleEmptySpaceDoubleClick: function(event)
    {
        if (event.target.hasStyleClass("header")) {
            event.stopPropagation();
            return;
        }
        this.expand();
        this.addNewBlankProperty().startEditing();
    },

    _handleSelectorClick: function(event)
    {
        event.stopPropagation();
    },

    _handleSelectorDoubleClick: function(event)
    {
        this._startEditingOnMouseEvent();
        event.stopPropagation();
    },

    _startEditingOnMouseEvent: function()
    {
        if (!this.editable)
            return;

        if (!this.rule && this.propertiesTreeOutline.children.length === 0) {
            this.expand();
            this.addNewBlankProperty().startEditing();
            return;
        }

        if (!this.rule)
            return;

        this.startEditingSelector();
    },

    startEditingSelector: function()
    {
        var element = this._selectorElement;
        if (WebInspector.isBeingEdited(element))
            return;

        WebInspector.startEditing(this._selectorElement, this.editingSelectorCommitted.bind(this), this.editingSelectorCancelled.bind(this), null);
        window.getSelection().setBaseAndExtent(element, 0, element, 1);
    },

    editingSelectorCommitted: function(element, newContent, oldContent, context, moveDirection)
    {
        function moveToNextIfNeeded() {
            if (!moveDirection || moveDirection !== "forward")
                return;

            this.expand();
            if (this.propertiesTreeOutline.children.length === 0)
                this.addNewBlankProperty().startEditing();
            else {
                var item = this.propertiesTreeOutline.children[0]
                item.startEditing(item.valueElement);
            }
        }

        if (newContent === oldContent)
            return moveToNextIfNeeded.call(this);

        var self = this;

        function successCallback(newRule, doesAffectSelectedNode)
        {
            if (!doesAffectSelectedNode) {
                self.noAffect = true;
                self.element.addStyleClass("no-affect");
            } else {
                delete self.noAffect;
                self.element.removeStyleClass("no-affect");
            }

            self.rule = newRule;
            self.styleRule = { section: self, style: newRule.style, selectorText: newRule.selectorText, parentStyleSheet: newRule.parentStyleSheet, rule: newRule };

            var oldIdentifier = this.identifier;
            self.identifier = newRule.selectorText + ":" + self.subtitleElement.textContent;

            self.pane.update();

            WebInspector.panels.elements.renameSelector(oldIdentifier, this.identifier, oldContent, newContent);

            moveToNextIfNeeded.call(self);
        }

        WebInspector.cssModel.setRuleSelector(this.rule.id, newContent, this.pane.node.id, successCallback, moveToNextIfNeeded.bind(this));
    },

    editingSelectorCancelled: function()
    {
        // Do nothing, this is overridden by BlankStylePropertiesSection.
    }
}

WebInspector.StylePropertiesSection.prototype.__proto__ = WebInspector.PropertiesSection.prototype;

WebInspector.ComputedStylePropertiesSection = function(styleRule, usedProperties, disabledComputedProperties)
{
    WebInspector.PropertiesSection.call(this, "");
    this.headerElement.addStyleClass("hidden");
    this.element.className = "styles-section monospace first-styles-section read-only computed-style";
    this.styleRule = styleRule;
    this._usedProperties = usedProperties;
    this._disabledComputedProperties = disabledComputedProperties;
    this._alwaysShowComputedProperties = { "display": true, "height": true, "width": true };
    this.computedStyle = true;
    this._propertyTreeElements = {};
    this._expandedPropertyNames = {};
}

WebInspector.ComputedStylePropertiesSection.prototype = {
    collapse: function(dontRememberState)
    {
        // Overriding with empty body.
    },

    _isPropertyInherited: function(property)
    {
        return !(property in this._usedProperties) && !(property in this._alwaysShowComputedProperties) && !(property in this._disabledComputedProperties);
    },

    update: function()
    {
        this._expandedPropertyNames = {};
        for (var name in this._propertyTreeElements) {
            if (this._propertyTreeElements[name].expanded)
                this._expandedPropertyNames[name] = true;
        }
        this._propertyTreeElements = {};
        this.propertiesTreeOutline.removeChildren();
        this.populated = false;
    },

    onpopulate: function()
    {
        var style = this.styleRule.style;
        var uniqueProperties = [];
        for (var i = 0; i < style.length; ++i)
            uniqueProperties.push(style[i]);
        uniqueProperties.sort();

        this._propertyTreeElements = {};
        for (var i = 0; i < uniqueProperties.length; ++i) {
            var name = uniqueProperties[i];
            var inherited = this._isPropertyInherited(name);
            var item = new WebInspector.StylePropertyTreeElement(this.styleRule, style, name, false, inherited, false, false);
            this.propertiesTreeOutline.appendChild(item);
            this._propertyTreeElements[name] = item;
        }
    },

    rebuildComputedTrace: function(sections)
    {
        for (var i = 0; i < sections.length; ++i) {
            var section = sections[i];
            if (section.computedStyle || section instanceof WebInspector.BlankStylePropertiesSection)
                continue;

            for (var j = 0; j < section.uniqueProperties.length; ++j) {
                var name = section.uniqueProperties[j];
                if (section.isPropertyDisabled(name))
                    continue;
                if (section.isInherited && !(name in WebInspector.StylesSidebarPane.InheritedProperties))
                    continue;

                var treeElement = this._propertyTreeElements[name];
                if (treeElement) {
                    var selectorText = section.styleRule.selectorText;
                    var value = section.styleRule.style.getPropertyValue(name);
                    var title = "<span style='color: gray'>" + selectorText + "</span> - " + value;
                    var subtitle = " <span style='float:right'>" + section.subtitleElement.innerHTML + "</span>";
                    var childElement = new TreeElement(title + subtitle, null, false);
                    treeElement.appendChild(childElement);
                    if (section.isPropertyOverloaded(name))
                        childElement.listItemElement.addStyleClass("overloaded");
                }
            }
        }

        // Restore expanded state after update.
        for (var name in this._expandedPropertyNames) {
            if (name in this._propertyTreeElements)
                this._propertyTreeElements[name].expand();
        }
    }
}

WebInspector.ComputedStylePropertiesSection.prototype.__proto__ = WebInspector.PropertiesSection.prototype;

WebInspector.BlankStylePropertiesSection = function(defaultSelectorText)
{
    WebInspector.StylePropertiesSection.call(this, {selectorText: defaultSelectorText, rule: {isViaInspector: true}}, true, false, false);
    this.element.addStyleClass("blank-section");
}

WebInspector.BlankStylePropertiesSection.prototype = {
    expand: function()
    {
        // Do nothing, blank sections are not expandable.
    },

    editingSelectorCommitted: function(element, newContent, oldContent, context)
    {
        var self = this;
        function successCallback(styleRule, doesSelectorAffectSelectedNode)
        {
            self.makeNormal(styleRule);

            if (!doesSelectorAffectSelectedNode) {
                self.noAffect = true;
                self.element.addStyleClass("no-affect");
            }

            self.subtitleElement.textContent = WebInspector.UIString("via inspector");
            self.expand();

            self.addNewBlankProperty().startEditing();
        }

        WebInspector.cssModel.addRule(this.pane.node.id, newContent, successCallback, this.editingSelectorCancelled.bind(this));
    },

    editingSelectorCancelled: function()
    {
        this.pane.removeSection(this);
    },

    makeNormal: function(styleRule)
    {
        this.element.removeStyleClass("blank-section");
        this.styleRule = styleRule;
        this.rule = styleRule.rule;
        this.identifier = styleRule.selectorText + ":via inspector";
        this.__proto__ = WebInspector.StylePropertiesSection.prototype;
    }
}

WebInspector.BlankStylePropertiesSection.prototype.__proto__ = WebInspector.StylePropertiesSection.prototype;

WebInspector.StylePropertyTreeElement = function(styleRule, style, name, shorthand, inherited, overloaded, disabled)
{
    this._styleRule = styleRule;
    this.style = style;
    this.name = name;
    this.shorthand = shorthand;
    this._inherited = inherited;
    this._overloaded = overloaded;
    this._disabled = disabled;

    // Pass an empty title, the title gets made later in onattach.
    TreeElement.call(this, "", null, shorthand);
}

WebInspector.StylePropertyTreeElement.prototype = {
    get inherited()
    {
        return this._inherited;
    },

    set inherited(x)
    {
        if (x === this._inherited)
            return;
        this._inherited = x;
        this.updateState();
    },

    get overloaded()
    {
        return this._overloaded;
    },

    set overloaded(x)
    {
        if (x === this._overloaded)
            return;
        this._overloaded = x;
        this.updateState();
    },

    get disabled()
    {
        return this._disabled;
    },

    set disabled(x)
    {
        if (x === this._disabled)
            return;
        this._disabled = x;
        this.updateState();
    },

    get priority()
    {
        if (this.disabled && this.style.__disabledPropertyPriorities && this.name in this.style.__disabledPropertyPriorities)
            return this.style.__disabledPropertyPriorities[this.name];
        return (this.shorthand ? this.style.getShorthandPriority(this.name) : this.style.getPropertyPriority(this.name));
    },

    get value()
    {
        if (this.disabled && this.style.__disabledPropertyValues && this.name in this.style.__disabledPropertyValues)
            return this.style.__disabledPropertyValues[this.name];
        return (this.shorthand ? this.style.getShorthandValue(this.name) : this.style.getPropertyValue(this.name));
    },

    onattach: function()
    {
        this.updateTitle();
    },

    updateTitle: function()
    {
        var priority = this.priority;
        var value = this.value;

        if (priority && !priority.length)
            delete priority;
        if (priority)
            priority = "!" + priority;

        this.updateState();

        var enabledCheckboxElement = document.createElement("input");
        enabledCheckboxElement.className = "enabled-button";
        enabledCheckboxElement.type = "checkbox";
        enabledCheckboxElement.checked = !this.disabled;
        enabledCheckboxElement.addEventListener("change", this.toggleEnabled.bind(this), false);

        var nameElement = document.createElement("span");
        nameElement.className = "webkit-css-property";
        nameElement.textContent = this.name;
        this.nameElement = nameElement;

        var valueElement = document.createElement("span");
        valueElement.className = "value";
        this.valueElement = valueElement;

        if (value) {
            function processValue(regex, processor, nextProcessor, valueText)
            {
                var container = document.createDocumentFragment();

                var items = valueText.replace(regex, "\0$1\0").split("\0");
                for (var i = 0; i < items.length; ++i) {
                    if ((i % 2) === 0) {
                        if (nextProcessor)
                            container.appendChild(nextProcessor(items[i]));
                        else
                            container.appendChild(document.createTextNode(items[i]));
                    } else {
                        var processedNode = processor(items[i]);
                        if (processedNode)
                            container.appendChild(processedNode);
                    }
                }

                return container;
            }

            function linkifyURL(url)
            {
                var container = document.createDocumentFragment();
                container.appendChild(document.createTextNode("url("));
                container.appendChild(WebInspector.linkifyURLAsNode(url, url, null, (url in WebInspector.resourceURLMap)));
                container.appendChild(document.createTextNode(")"));
                return container;
            }

            function processColor(text)
            {
                try {
                    var color = new WebInspector.Color(text);
                } catch (e) {
                    return document.createTextNode(text);
                }

                var swatchElement = document.createElement("span");
                swatchElement.title = WebInspector.UIString("Click to change color format");
                swatchElement.className = "swatch";
                swatchElement.style.setProperty("background-color", text);

                swatchElement.addEventListener("click", changeColorDisplay, false);
                swatchElement.addEventListener("dblclick", function(event) { event.stopPropagation() }, false);

                var format;
                if (Preferences.showColorNicknames && color.nickname)
                    format = "nickname";
                else if (WebInspector.applicationSettings.colorFormat === "rgb")
                    format = (color.simple ? "rgb" : "rgba");
                else if (WebInspector.applicationSettings.colorFormat === "hsl")
                    format = (color.simple ? "hsl" : "hsla");
                else if (color.simple)
                    format = (color.hasShortHex() ? "shorthex" : "hex");
                else
                    format = "rgba";

                var colorValueElement = document.createElement("span");
                colorValueElement.textContent = color.toString(format);

                function changeColorDisplay(event)
                {
                    switch (format) {
                        case "rgb":
                            format = "hsl";
                            break;

                        case "shorthex":
                            format = "hex";
                            break;

                        case "hex":
                            format = "rgb";
                            break;

                        case "nickname":
                            if (color.simple) {
                                if (color.hasShortHex())
                                    format = "shorthex";
                                else
                                    format = "hex";
                                break;
                            }

                            format = "rgba";
                            break;

                        case "hsl":
                            if (color.nickname)
                                format = "nickname";
                            else if (color.hasShortHex())
                                format = "shorthex";
                            else
                                format = "hex";
                            break;

                        case "rgba":
                            format = "hsla";
                            break;

                        case "hsla":
                            if (color.nickname)
                                format = "nickname";
                            else
                                format = "rgba";
                            break;
                    }

                    colorValueElement.textContent = color.toString(format);
                }

                var container = document.createDocumentFragment();
                container.appendChild(swatchElement);
                container.appendChild(colorValueElement);
                return container;
            }

            var colorRegex = /((?:rgb|hsl)a?\([^)]+\)|#[0-9a-fA-F]{6}|#[0-9a-fA-F]{3}|\b\w+\b(?!-))/g;
            var colorProcessor = processValue.bind(window, colorRegex, processColor, null);

            valueElement.appendChild(processValue(/url\(([^)]+)\)/g, linkifyURL, colorProcessor, value));
        }

        if (priority) {
            var priorityElement = document.createElement("span");
            priorityElement.className = "priority";
            priorityElement.textContent = priority;
        }

        this.listItemElement.removeChildren();

        if (!this.treeOutline)
            return;

        // Append the checkbox for root elements of an editable section.
        if (this.treeOutline.section && this.treeOutline.section.editable && this.parent.root)
            this.listItemElement.appendChild(enabledCheckboxElement);
        this.listItemElement.appendChild(nameElement);
        this.listItemElement.appendChild(document.createTextNode(": "));
        this.listItemElement.appendChild(valueElement);

        if (priorityElement) {
            this.listItemElement.appendChild(document.createTextNode(" "));
            this.listItemElement.appendChild(priorityElement);
        }

        this.listItemElement.appendChild(document.createTextNode(";"));

        this.tooltip = this.name + ": " + valueElement.textContent + (priority ? " " + priority : "");
    },

    updateAll: function(updateAllRules)
    {
        if (!this.treeOutline)
            return;
        if (updateAllRules && this.treeOutline.section && this.treeOutline.section.pane)
            this.treeOutline.section.pane.update(null, this.treeOutline.section);
        else if (this.treeOutline.section)
            this.treeOutline.section.update(true);
        else
            this.updateTitle(); // FIXME: this will not show new properties. But we don't hit his case yet.
    },

    toggleEnabled: function(event)
    {
        var disabled = !event.target.checked;

        var self = this;
        function callback(newStyle)
        {
            if (!newStyle)
                return;

            self.style = newStyle;
            self._styleRule.style = self.style;

            // Set the disabled property here, since the code above replies on it not changing
            // until after the value and priority are retrieved.
            self.disabled = disabled;

            if (self.treeOutline.section && self.treeOutline.section.pane)
                self.treeOutline.section.pane.dispatchEventToListeners("style property toggled");

            self.updateAll(true);
        }

        WebInspector.cssModel.toggleStyleEnabled(this.style.id, this.name, disabled, callback);
    },

    updateState: function()
    {
        if (!this.listItemElement)
            return;

        if (this.style.isPropertyImplicit(this.name) || this.value === "initial")
            this.listItemElement.addStyleClass("implicit");
        else
            this.listItemElement.removeStyleClass("implicit");

        if (this.inherited)
            this.listItemElement.addStyleClass("inherited");
        else
            this.listItemElement.removeStyleClass("inherited");

        if (this.overloaded)
            this.listItemElement.addStyleClass("overloaded");
        else
            this.listItemElement.removeStyleClass("overloaded");

        if (this.disabled)
            this.listItemElement.addStyleClass("disabled");
        else
            this.listItemElement.removeStyleClass("disabled");
    },

    onpopulate: function()
    {
        // Only populate once and if this property is a shorthand.
        if (this.children.length || !this.shorthand)
            return;

        var longhandProperties = this.style.getLonghandProperties(this.name);
        for (var i = 0; i < longhandProperties.length; ++i) {
            var name = longhandProperties[i];

            if (this.treeOutline.section) {
                var inherited = this.treeOutline.section.isPropertyInherited(name);
                var overloaded = this.treeOutline.section.isPropertyOverloaded(name);
            }

            var item = new WebInspector.StylePropertyTreeElement(this._styleRule, this.style, name, false, inherited, overloaded);
            this.appendChild(item);
        }
    },

    ondblclick: function(event)
    {
        this.startEditing(event.target);
        event.stopPropagation();
    },

    restoreNameElement: function()
    {
        // Restore <span class="webkit-css-property"> if it doesn't yet exist or was accidentally deleted.
        if (this.nameElement === this.listItemElement.querySelector(".webkit-css-property"))
            return;

        this.nameElement = document.createElement("span");
        this.nameElement.className = "webkit-css-property";
        this.nameElement.textContent = "";
        this.listItemElement.insertBefore(this.nameElement, this.listItemElement.firstChild);
    },

    startEditing: function(selectElement)
    {
        // FIXME: we don't allow editing of longhand properties under a shorthand right now.
        if (this.parent.shorthand)
            return;

        if (WebInspector.isBeingEdited(this.listItemElement) || (this.treeOutline.section && !this.treeOutline.section.editable))
            return;

        var context = {
            expanded: this.expanded,
            hasChildren: this.hasChildren,
            keyDownListener: this.editingKeyDown.bind(this),
            keyPressListener: this.editingKeyPress.bind(this)
        };

        // Lie about our children to prevent expanding on double click and to collapse shorthands.
        this.hasChildren = false;

        if (!selectElement)
            selectElement = this.listItemElement;

        this.listItemElement.addEventListener("keydown", context.keyDownListener, false);
        this.listItemElement.addEventListener("keypress", context.keyPressListener, false);

        WebInspector.startEditing(this.listItemElement, this.editingCommitted.bind(this), this.editingCancelled.bind(this), context);
        window.getSelection().setBaseAndExtent(selectElement, 0, selectElement, 1);
    },

    editingKeyPress: function(event)
    {
        var selection = window.getSelection();
        var colonIndex = this.listItemElement.textContent.indexOf(":");
        var selectionLeftOffset = event.target.selectionLeftOffset;

        if (colonIndex < 0 || selectionLeftOffset <= colonIndex) {
            // Complete property names.
            var character = event.data.toLowerCase();
            if (character && /[a-z-]/.test(character)) {
                var prefix = selection.anchorNode.textContent.substring(0, selection.anchorOffset);
                var property = WebInspector.CSSCompletions.firstStartsWith(prefix + character);

                if (!selection.isCollapsed)
                    selection.deleteFromDocument();

                this.restoreNameElement();

                if (property) {
                    if (property !== this.nameElement.textContent)
                        this.nameElement.textContent = property;
                    this.nameElement.firstChild.select(prefix.length + 1);
                    event.preventDefault();
                }
            }
        } else {
            // FIXME: This should complete property values.
        }
    },

    editingKeyDown: function(event)
    {
        var arrowKeyPressed = (event.keyIdentifier === "Up" || event.keyIdentifier === "Down");
        var pageKeyPressed = (event.keyIdentifier === "PageUp" || event.keyIdentifier === "PageDown");
        if (!arrowKeyPressed && !pageKeyPressed)
            return;

        var selection = window.getSelection();
        if (!selection.rangeCount)
            return;

        var selectionRange = selection.getRangeAt(0);
        if (selectionRange.commonAncestorContainer !== this.listItemElement && !selectionRange.commonAncestorContainer.isDescendant(this.listItemElement))
            return;

        const styleValueDelimeters = " \t\n\"':;,/()";
        var wordRange = selectionRange.startContainer.rangeOfWord(selectionRange.startOffset, styleValueDelimeters, this.listItemElement);
        var wordString = wordRange.toString();
        var replacementString = wordString;

        var matches = /(.*?)(-?\d+(?:\.\d+)?)(.*)/.exec(wordString);
        if (matches && matches.length) {
            var prefix = matches[1];
            var number = parseFloat(matches[2]);
            var suffix = matches[3];

            // If the number is near zero or the number is one and the direction will take it near zero.
            var numberNearZero = (number < 1 && number > -1);
            if (number === 1 && event.keyIdentifier === "Down")
                numberNearZero = true;
            else if (number === -1 && event.keyIdentifier === "Up")
                numberNearZero = true;

            if (numberNearZero && event.altKey && arrowKeyPressed) {
                if (event.keyIdentifier === "Down")
                    number = Math.ceil(number - 1);
                else
                    number = Math.floor(number + 1);
            } else {
                // Jump by 10 when shift is down or jump by 0.1 when near zero or Alt/Option is down.
                // Also jump by 10 for page up and down, or by 100 if shift is held with a page key.
                var changeAmount = 1;
                if (event.shiftKey && pageKeyPressed)
                    changeAmount = 100;
                else if (event.shiftKey || pageKeyPressed)
                    changeAmount = 10;
                else if (event.altKey || numberNearZero)
                    changeAmount = 0.1;

                if (event.keyIdentifier === "Down" || event.keyIdentifier === "PageDown")
                    changeAmount *= -1;

                // Make the new number and constrain it to a precision of 6, this matches numbers the engine returns.
                // Use the Number constructor to forget the fixed precision, so 1.100000 will print as 1.1.
                number = Number((number + changeAmount).toFixed(6));
            }

            replacementString = prefix + number + suffix;
        } else if (selection.containsNode(this.nameElement, true)) {
            var prefix = selectionRange.startContainer.textContent.substring(0, selectionRange.startOffset);
            var property;

            if (event.keyIdentifier === "Up")
                property = WebInspector.CSSCompletions.previous(wordString, prefix);
            else if (event.keyIdentifier === "Down")
                property = WebInspector.CSSCompletions.next(wordString, prefix);

            var startOffset = selectionRange.startOffset;
            if (property) {
                this.nameElement.textContent = property;
                this.nameElement.firstChild.select(startOffset);
            }
            event.preventDefault();
            return;
        } else {
            // FIXME: this should cycle through known keywords for the current property value.
        }

        var replacementTextNode = document.createTextNode(replacementString);

        wordRange.deleteContents();
        wordRange.insertNode(replacementTextNode);

        var finalSelectionRange = document.createRange();
        finalSelectionRange.setStart(replacementTextNode, 0);
        finalSelectionRange.setEnd(replacementTextNode, replacementString.length);

        selection.removeAllRanges();
        selection.addRange(finalSelectionRange);

        event.preventDefault();

        if (!this.originalCSSText) {
            // Remember the rule's original CSS text, so it can be restored
            // if the editing is canceled and before each apply.
            this.originalCSSText = this.style.styleTextWithShorthands();
        } else {
            // Restore the original CSS text before applying user changes. This is needed to prevent
            // new properties from sticking around if the user adds one, then removes it.
            WebInspector.cssModel.setCSSText(this.style.id, this.originalCSSText);
        }

        this.applyStyleText(this.listItemElement.textContent);
    },

    editingEnded: function(context)
    {
        this.hasChildren = context.hasChildren;
        if (context.expanded)
            this.expand();
        this.listItemElement.removeEventListener("keydown", context.keyDownListener, false);
        this.listItemElement.removeEventListener("keypress", context.keyPressListener, false);
        delete this.originalCSSText;
    },

    editingCancelled: function(element, context)
    {
        if (this._newProperty)
            this.treeOutline.removeChild(this);
        else if (this.originalCSSText) {
            WebInspector.cssModel.setCSSText(this.style.id, this.originalCSSText);

            if (this.treeOutline.section && this.treeOutline.section.pane)
                this.treeOutline.section.pane.dispatchEventToListeners("style edited");

            this.updateAll();
        } else
            this.updateTitle();

        this.editingEnded(context);
    },

    editingCommitted: function(element, userInput, previousContent, context, moveDirection)
    {
        this.editingEnded(context);

        // Determine where to move to before making changes
        var newProperty, moveToPropertyName, moveToSelector;
        var moveTo = (moveDirection === "forward" ? this.nextSibling : this.previousSibling);
        if (moveTo)
            moveToPropertyName = moveTo.name;
        else if (moveDirection === "forward")
            newProperty = true;
        else if (moveDirection === "backward" && this.treeOutline.section.rule)
            moveToSelector = true;

        // Make the Changes and trigger the moveToNextCallback after updating
        var blankInput = /^\s*$/.test(userInput);
        if (userInput !== previousContent || (this._newProperty && blankInput)) { // only if something changed, or adding a new style and it was blank
            this.treeOutline.section._afterUpdate = moveToNextCallback.bind(this, this._newProperty, !blankInput);
            this.applyStyleText(userInput, true);
        } else
            moveToNextCallback(this._newProperty, false, this.treeOutline.section, false);

        // The Callback to start editing the next property
        function moveToNextCallback(alreadyNew, valueChanged, section)
        {
            if (!moveDirection)
                return;

            // User just tabbed through without changes
            if (moveTo && moveTo.parent) {
                moveTo.startEditing(moveTo.valueElement);
                return;
            }

            // User has made a change then tabbed, wiping all the original treeElements,
            // recalculate the new treeElement for the same property we were going to edit next
            if (moveTo && !moveTo.parent) {
                var treeElement = section.findTreeElementWithName(moveToPropertyName);
                if (treeElement)
                    treeElement.startEditing(treeElement.valueElement);
                return;
            }

            // Create a new attribute in this section
            if (newProperty) {
                if (alreadyNew && !valueChanged)
                    return;

                section.addNewBlankProperty().startEditing();
                return;
            }

            if (moveToSelector)
                section.startEditingSelector();
        }
    },

    applyStyleText: function(styleText, updateInterface)
    {
        var section = this.treeOutline.section;
        var elementsPanel = WebInspector.panels.elements;
        styleText = styleText.replace(/\s/g, " ").trim(); // replace &nbsp; with whitespace.
        var styleTextLength = styleText.length;
        if (!styleTextLength && updateInterface) {
            if (this._newProperty) {
                // The user deleted everything, so remove the tree element and update.
                this.parent.removeChild(this);
                section.afterUpdate();
                return;
            } else {
                delete section._afterUpdate;
            }
        }

        var self = this;

        function failureCallback()
        {
            // The user typed something, but it didn't parse. Just abort and restore
            // the original title for this property.  If this was a new attribute and
            // we couldn't parse, then just remove it.
            if (self._newProperty) {
                self.parent.removeChild(self);
                return;
            }
            if (updateInterface)
                self.updateTitle();
        }

        function successCallback(newStyle, changedProperties)
        {
            elementsPanel.removeStyleChange(section.identifier, self.style, self.name);

            if (!styleTextLength) {
                // Do remove ourselves from UI when the property removal is confirmed.
                self.parent.removeChild(self);
            } else {
                self.style = newStyle;
                for (var i = 0; i < changedProperties.length; ++i)
                    elementsPanel.addStyleChange(section.identifier, self.style, changedProperties[i]);
                self._styleRule.style = self.style;
            }

            if (section && section.pane)
                section.pane.dispatchEventToListeners("style edited");

            if (updateInterface)
                self.updateAll(true);
        }

        WebInspector.cssModel.applyStyleText(this.style.id, styleText, this.name, successCallback, failureCallback);
    }
}

WebInspector.StylePropertyTreeElement.prototype.__proto__ = TreeElement.prototype;
