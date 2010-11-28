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
    var format = WebInspector.settings.colorFormat;
    if (format === "hex")
        this.settingsSelectElement[0].selected = true;
    else if (format === "rgb")
        this.settingsSelectElement[1].selected = true;
    else if (format === "hsl")
        this.settingsSelectElement[2].selected = true;

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
            WebInspector.cssModel.getStylesAsync(node.id, stylesCallback.bind(this));
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
                var rule = pseudoElementCSSRules.rules[j];
                styleRules.push({ style: rule.style, selectorText: rule.selectorText, sourceURL: rule.sourceURL, rule: rule, editable: !!(rule.style && rule.style.id) });
            }
            usedProperties = {};
            disabledComputedProperties = {};
            this._markUsedProperties(styleRules, usedProperties, disabledComputedProperties);
            this.sections[pseudoId] = this._rebuildSectionsForStyleRules(styleRules, usedProperties, disabledComputedProperties, pseudoId, anchorElement);
        }
    },

    _refreshStyleRules: function(sections, computedStyle)
    {
        var nodeComputedStyle = computedStyle;
        var styleRules = [];
        for (var i = 0; sections && i < sections.length; ++i) {
            var section = sections[i];
            if (section instanceof WebInspector.BlankStylePropertiesSection)
                continue;
            if (section.computedStyle)
                section.styleRule.style = nodeComputedStyle;
            var styleRule = { section: section, style: section.styleRule.style, computedStyle: section.computedStyle, rule: section.rule, editable: !!(section.styleRule.style && section.styleRule.style.id) };
            styleRules.push(styleRule);
        }
        return styleRules;
    },

    _rebuildStyleRules: function(node, styles)
    {
        var nodeComputedStyle = styles.computedStyle;
        this.sections = {};

        var styleRules = [];

        styleRules.push({ computedStyle: true, selectorText: "", style: nodeComputedStyle, editable: false });

        var styleAttributes = {};
        for (var name in styles.styleAttributes) {
            var attrStyle = { style: styles.styleAttributes[name], editable: false };
            attrStyle.selectorText = WebInspector.panels.elements.treeOutline.nodeNameToCorrectCase(node.nodeName) + "[" + name;
            if (node.getAttribute(name))
                attrStyle.selectorText += "=" + node.getAttribute(name);
            attrStyle.selectorText += "]";
            styleRules.push(attrStyle);
        }

        // Show element's Style Attributes
        if (styles.inlineStyle && node.nodeType === Node.ELEMENT_NODE) {
            var inlineStyle = { selectorText: "element.style", style: styles.inlineStyle, isAttribute: true };
            styleRules.push(inlineStyle);
        }

        // Add rules in reverse order to match the cascade order.
        if (styles.matchedCSSRules.length)
            styleRules.push({ isStyleSeparator: true, text: WebInspector.UIString("Matched CSS Rules") });
        for (var i = styles.matchedCSSRules.length - 1; i >= 0; --i) {
            var rule = styles.matchedCSSRules[i];
            styleRules.push({ style: rule.style, selectorText: rule.selectorText, sourceURL: rule.sourceURL, rule: rule, editable: !!(rule.style && rule.style.id) });
        }

        // Walk the node structure and identify styles with inherited properties.
        var parentNode = node.parentNode;
        function insertInheritedNodeSeparator(node)
        {
            var entry = {};
            entry.isStyleSeparator = true;
            entry.node = node;
            styleRules.push(entry);
        }

        for (var parentOrdinal = 0; parentOrdinal < styles.inherited.length; ++parentOrdinal) {
            var parentStyles = styles.inherited[parentOrdinal];
            var separatorInserted = false;
            if (parentStyles.inlineStyle) {
                if (this._containsInherited(parentStyles.inlineStyle)) {
                    var inlineStyle = { selectorText: WebInspector.UIString("Style Attribute"), style: parentStyles.inlineStyle, isAttribute: true, isInherited: true };
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
                var rule = rulePayload;
                if (!separatorInserted) {
                    insertInheritedNodeSeparator(parentNode);
                    separatorInserted = true;
                }
                styleRules.push({ style: rule.style, selectorText: rule.selectorText, sourceURL: rule.sourceURL, rule: rule, isInherited: true, editable: !!(rule.style && rule.style.id) });
            }
            parentNode = parentNode.parentNode;
        }
        return styleRules;
    },

    _markUsedProperties: function(styleRules, usedProperties, disabledComputedProperties)
    {
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
            var allProperties = style.allProperties;
            for (var j = 0; j < allProperties.length; ++j) {
                var property = allProperties[j];
                if (!property.isLive)
                    continue;
                var name = property.name;

                if (!priorityUsed && property.priority.length)
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
            }

            // Add all the properties found in this style to the used properties list.
            // Do this here so only future rules are affect by properties used in this rule.
            for (var name in styleRules[i].usedProperties)
                usedProperties[name] = true;
        }

        if (priorityUsed) {
            // Walk the properties again and account for !important.
            var foundPriorityProperties = [];

            // Walk in reverse to match the order !important overrides.
            for (var i = (styleRules.length - 1); i >= 0; --i) {
                if (styleRules[i].computedStyle || styleRules[i].isStyleSeparator)
                    continue;

                var style = styleRules[i].style;
                var allProperties = style.allProperties;
                for (var j = 0; j < allProperties.length; ++j) {
                    var property = allProperties[j];
                    if (!property.isLive)
                        continue;
                    var name = property.name;
                    if (property.priority.length) {
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

    _containsInherited: function(style)
    {
        var properties = style.allProperties;
        for (var i = 0; i < properties.length; ++i) {
            var property = properties[i];
            // Does this style contain non-overridden inherited property?
            if (property.isLive && property.name in WebInspector.StylesSidebarPane.InheritedProperties)
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
            if (options[i].value === WebInspector.settings.colorFormat) {
                selectedIndex = i;
                break;
            }
        }

        this.settingsSelectElement.selectedIndex = selectedIndex;
    },

    _changeColorFormat: function(event)
    {
        var selectedOption = this.settingsSelectElement[this.settingsSelectElement.selectedIndex];
        WebInspector.settings.colorFormat = selectedOption.value;

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

    if (WebInspector.settings.showInheritedComputedStyleProperties) {
        this.bodyElement.addStyleClass("show-inherited");
        showInheritedCheckbox.checked = true;
    }

    function showInheritedToggleFunction(event)
    {
        WebInspector.settings.showInheritedComputedStyleProperties = showInheritedCheckbox.checked;
        if (WebInspector.settings.showInheritedComputedStyleProperties)
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
    if (Preferences.debugMode)
        this._selectorElement.addEventListener("click", this._debugShowStyle.bind(this), false);

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
    if (this.styleRule.sourceURL)
        this.subtitleElement.appendChild(linkifyUncopyable(this.styleRule.sourceURL, this.rule.sourceLine));
    else if (isUserAgent)
        subtitle = WebInspector.UIString("user agent stylesheet");
    else if (isUser)
        subtitle = WebInspector.UIString("user stylesheet");
    else if (isViaInspector)
        subtitle = WebInspector.UIString("via inspector");
    else if (this.rule && this.rule.sourceURL)
        this.subtitleElement.appendChild(linkifyUncopyable(this.rule.sourceURL, this.rule.sourceLine));

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

    isPropertyInherited: function(propertyName)
    {
        if (this.isInherited) {
            // While rendering inherited stylesheet, reverse meaning of this property.
            // Render truly inherited properties with black, i.e. return them as non-inherited.
            return !(propertyName in WebInspector.StylesSidebarPane.InheritedProperties);
        }
        return false;
    },

    isPropertyOverloaded: function(propertyName, shorthand)
    {
        if (!this._usedProperties || this.noAffect)
            return false;

        if (this.isInherited && !(propertyName in WebInspector.StylesSidebarPane.InheritedProperties)) {
            // In the inherited sections, only show overrides for the potentially inherited properties.
            return false;
        }

        var used = (propertyName in this._usedProperties);
        if (used || !shorthand)
            return !used;

        // Find out if any of the individual longhand properties of the shorthand
        // are used, if none are then the shorthand is overloaded too.
        var longhandProperties = this.styleRule.style.getLonghandProperties(propertyName);
        for (var j = 0; j < longhandProperties.length; ++j) {
            var individualProperty = longhandProperties[j];
            if (individualProperty.name in this._usedProperties)
                return false;
        }

        return true;
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

        var handledProperties = {};
        var shorthandNames = {};

        this.uniqueProperties = [];
        var allProperties = style.allProperties;
        for (var i = 0; i < allProperties.length; ++i)
            this.uniqueProperties.push(allProperties[i]);

        // Collect all shorthand names.
        for (var i = 0; i < this.uniqueProperties.length; ++i) {
            var property = this.uniqueProperties[i];
            if (property.disabled)
                continue;
            if (property.shorthand)
                shorthandNames[property.shorthand] = true;
        }

        // Collect all shorthand names.
        for (var i = 0; i < this.uniqueProperties.length; ++i) {
            var property = this.uniqueProperties[i];
            var disabled = property.disabled;
            if (!disabled && this.disabledComputedProperties && !(property.name in this.usedProperties) && property.name in this.disabledComputedProperties)
                disabled = true;

            var shorthand = !disabled ? property.shorthand : null;

            if (shorthand && shorthand in handledProperties)
                continue;

            if (shorthand) {
                property = style.getLiveProperty(shorthand);
                if (!property)
                    property = new WebInspector.CSSProperty(style, style.allProperties.length, shorthand, style.getShorthandValue(shorthand), style.getShorthandPriority(shorthand), "style", true, true, "");
            }

            var isShorthand = !!(property.isLive && (shorthand || shorthandNames[property.name]));
            var inherited = this.isPropertyInherited(property.name);
            var overloaded = this.isPropertyOverloaded(property.name, isShorthand);

            var item = new WebInspector.StylePropertyTreeElement(this.styleRule, style, property, isShorthand, inherited, overloaded);
            this.propertiesTreeOutline.appendChild(item);
            handledProperties[property.name] = property;
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

    addNewBlankProperty: function(optionalIndex)
    {
        var style = this.styleRule.style;
        var property = style.newBlankProperty();
        var item = new WebInspector.StylePropertyTreeElement(this.styleRule, style, property, false, false, false);
        this.propertiesTreeOutline.appendChild(item);
        item.listItemElement.textContent = "";
        item._newProperty = true;
        return item;
    },

    _debugShowStyle: function(anchor)
    {
        var boundHandler;
        function removeStyleBox(element, event)
        {
            if (event.target === element) {
                event.stopPropagation();
                return;
            }
            document.body.removeChild(element);
            document.getElementById("main").removeEventListener("mousedown", boundHandler, true);
        }

        if (!event.shiftKey)
            return;

        var container = document.createElement("div");
        var element = document.createElement("span");
        container.appendChild(element);
        element.style.background = "yellow";
        element.style.display = "inline-block";
        container.style.cssText = "z-index: 2000000; position: absolute; top: 50px; left: 50px; white-space: pre; overflow: auto; background: white; font-family: monospace; font-size: 12px; border: 1px solid black; opacity: 0.85; -webkit-user-select: text; padding: 2px;";
        container.style.width = (document.body.offsetWidth - 100) + "px";
        container.style.height = (document.body.offsetHeight - 100) + "px";
        document.body.appendChild(container);
        if (this.rule)
            element.textContent = this.rule.selectorText + " {" + ((this.styleRule.style.cssText !== undefined) ? this.styleRule.style.cssText : "<no cssText>") + "}";
        else
            element.textContent = this.styleRule.style.cssText;
        boundHandler = removeStyleBox.bind(null, container);
        document.getElementById("main").addEventListener("mousedown", boundHandler, true);
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
            self.styleRule = { section: self, style: newRule.style, selectorText: newRule.selectorText, sourceURL: newRule.sourceURL, rule: newRule };

            var oldIdentifier = this.identifier;
            self.identifier = newRule.selectorText + ":" + self.subtitleElement.textContent;

            self.pane.update();

            WebInspector.panels.elements.renameSelector(oldIdentifier, this.identifier, oldContent, newContent);

            moveToNextIfNeeded.call(self);
        }

        var focusedNode = WebInspector.panels.elements.focusedDOMNode;
        WebInspector.cssModel.setRuleSelector(this.rule.id, focusedNode ? focusedNode.id : 0, newContent, successCallback, moveToNextIfNeeded.bind(this));
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

    _isPropertyInherited: function(propertyName)
    {
        return !(propertyName in this._usedProperties) && !(propertyName in this._alwaysShowComputedProperties) && !(propertyName in this._disabledComputedProperties);
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
        function sorter(a, b)
        {
            return a.name.localeCompare(b.name);
        }

        var style = this.styleRule.style;
        var uniqueProperties = [];
        var allProperties = style.allProperties;
        for (var i = 0; i < allProperties.length; ++i)
            uniqueProperties.push(allProperties[i]);
        uniqueProperties.sort(sorter);

        this._propertyTreeElements = {};
        for (var i = 0; i < uniqueProperties.length; ++i) {
            var property = uniqueProperties[i];
            var inherited = this._isPropertyInherited(property.name);
            var item = new WebInspector.StylePropertyTreeElement(this.styleRule, style, property, false, inherited, false);
            this.propertiesTreeOutline.appendChild(item);
            this._propertyTreeElements[property.name] = item;
        }
    },

    rebuildComputedTrace: function(sections)
    {
        for (var i = 0; i < sections.length; ++i) {
            var section = sections[i];
            if (section.computedStyle || section instanceof WebInspector.BlankStylePropertiesSection)
                continue;

            for (var j = 0; j < section.uniqueProperties.length; ++j) {
                var property = section.uniqueProperties[j];
                if (property.disabled)
                    continue;
                if (section.isInherited && !(property.name in WebInspector.StylesSidebarPane.InheritedProperties))
                    continue;

                var treeElement = this._propertyTreeElements[property.name];
                if (treeElement) {
                    var selectorText = section.styleRule.selectorText;
                    var value = property.value;
                    var title = "<span style='color: gray'>" + selectorText + "</span> - " + value;
                    var subtitle = " <span style='float:right'>" + section.subtitleElement.innerHTML + "</span>";
                    var childElement = new TreeElement(null, null, false);
                    childElement.titleHTML = title + subtitle;
                    treeElement.appendChild(childElement);
                    if (section.isPropertyOverloaded(property.name))
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
        function successCallback(newRule, doesSelectorAffectSelectedNode)
        {
            var styleRule = { section: self, style: newRule.style, selectorText: newRule.selectorText, sourceURL: newRule.sourceURL, rule: newRule };
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

WebInspector.StylePropertyTreeElement = function(styleRule, style, property, shorthand, inherited, overloaded)
{
    this._styleRule = styleRule;
    this.style = style;
    this.property = property;
    this.shorthand = shorthand;
    this._inherited = inherited;
    this._overloaded = overloaded;

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
        return this.property.disabled;
    },

    get name()
    {
        if (!this.disabled || !this.property.text)
            return this.property.name;

        var text = this.property.text;
        var index = text.indexOf(":");
        if (index < 1)
            return this.property.name;

        return text.substring(0, index).trim();
    },

    get priority()
    {
        if (this.disabled)
            return ""; // rely upon raw text to render it in the value field
        return this.property.priority;
    },

    get value()
    {
        if (!this.disabled || !this.property.text)
            return this.property.value;

        var match = this.property.text.match(/(.*);\s*/);
        if (!match || !match[1])
            return this.property.value;

        var text = match[1];
        var index = text.indexOf(":");
        if (index < 1)
            return this.property.value;

        return text.substring(index + 1).trim();
    },

    get parsedOk()
    {
        return this.property.parsedOk;
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

        var enabledCheckboxElement;
        if (this.parsedOk) {
            enabledCheckboxElement = document.createElement("input");
            enabledCheckboxElement.className = "enabled-button";
            enabledCheckboxElement.type = "checkbox";
            enabledCheckboxElement.checked = !this.disabled;
            enabledCheckboxElement.addEventListener("change", this.toggleEnabled.bind(this), false);
        }

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
                var hasResource = !!WebInspector.resourceForURL(url);
                container.appendChild(WebInspector.linkifyURLAsNode(url, url, null, hasResource));
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
                else if (WebInspector.settings.colorFormat === "rgb")
                    format = (color.simple ? "rgb" : "rgba");
                else if (WebInspector.settings.colorFormat === "hsl")
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
        if (enabledCheckboxElement && this.treeOutline.section && this.treeOutline.section.editable && this.parent.root)
            this.listItemElement.appendChild(enabledCheckboxElement);
        this.listItemElement.appendChild(nameElement);
        this.listItemElement.appendChild(document.createTextNode(": "));
        this.listItemElement.appendChild(valueElement);

        if (priorityElement) {
            this.listItemElement.appendChild(document.createTextNode(" "));
            this.listItemElement.appendChild(priorityElement);
        }

        this.listItemElement.appendChild(document.createTextNode(";"));

        if (!this.parsedOk)
            this.listItemElement.addStyleClass("not-parsed-ok");
        if (this.property.inactive)
            this.listItemElement.addStyleClass("inactive");

        this.tooltip = this.property.propertyText;
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
            this.updateTitle(); // FIXME: this will not show new properties. But we don't hit this case yet.
    },

    toggleEnabled: function(event)
    {
        var disabled = !event.target.checked;

        function callback(newStyle)
        {
            if (!newStyle)
                return;

            this.style = newStyle;
            this._styleRule.style = newStyle;

            if (this.treeOutline.section && this.treeOutline.section.pane)
                this.treeOutline.section.pane.dispatchEventToListeners("style property toggled");

            this.updateAll(true);
        }

        this.property.setDisabled(disabled, callback.bind(this));
    },

    updateState: function()
    {
        if (!this.listItemElement)
            return;

        if (this.style.isPropertyImplicit(this.name) || this.value === "initial")
            this.listItemElement.addStyleClass("implicit");
        else
            this.listItemElement.removeStyleClass("implicit");

        this.selectable = !this.inherited;
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
            var name = longhandProperties[i].name;


            if (this.treeOutline.section) {
                var inherited = this.treeOutline.section.isPropertyInherited(name);
                var overloaded = this.treeOutline.section.isPropertyOverloaded(name);
            }

            var liveProperty = this.style.getLiveProperty(name);
            var item = new WebInspector.StylePropertyTreeElement(this._styleRule, this.style, liveProperty, false, inherited, overloaded);
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

        // If there are several properties in the text, do not handle increments/decrements.
        var text = event.target.textContent.trim();
        var openQuote;
        var wasEscape = false;
        // Exclude the last character from the check since it is allowed to be ";".
        for (var i = 0; i < text.length - 1; ++i) {
            var ch = text.charAt(i);
            if (ch === "\\") {
                wasEscape = true;
                continue;
            }
            if (ch === ";" && !openQuote)
                return; // Do not handle name/value shifts if the property is compound.
            if ((ch === "'" || ch === "\"") && !wasEscape) {
                if (!openQuote)
                    openQuote = ch;
                else if (ch === openQuote)
                    openQuote = null;
            }
            wasEscape = false;
        }

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

        if (!("originalPropertyText" in this)) {
            // Remember the rule's original CSS text, so it can be restored
            // if the editing is canceled and before each apply.
            this.originalPropertyText = this.property.propertyText;
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
        delete this.originalPropertyText;
    },

    editingCancelled: function(element, context)
    {
        if ("originalPropertyText" in this)
            this.applyStyleText(this.originalPropertyText, true);
        else {
            if (this._newProperty)
                this.treeOutline.removeChild(this);
            else
                this.updateTitle();
        }
        this.editingEnded(context);
    },

    editingCommitted: function(element, userInput, previousContent, context, moveDirection)
    {
        this.editingEnded(context);

        // Determine where to move to before making changes
        var newProperty, moveToPropertyName, moveToSelector;
        var moveTo = this;
        do {
            moveTo = (moveDirection === "forward" ? moveTo.nextSibling : moveTo.previousSibling);
        } while(moveTo && !moveTo.selectable);

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
            // FIXME(apavlov): this will not work for multiple same-named properties in a style
            //                 (the first one will always be returned).
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
            } else
                delete section._afterUpdate;
        }

        function callback(newStyle)
        {
            if (!newStyle) {
                // The user typed something, but it didn't parse. Just abort and restore
                // the original title for this property.  If this was a new attribute and
                // we couldn't parse, then just remove it.
                if (this._newProperty) {
                    this.parent.removeChild(this);
                    return;
                }
                if (updateInterface)
                    this.updateTitle();
                return;
            }

            this.style = newStyle;
            this.property = newStyle.propertyAt(this.property.index);
            this._styleRule.style = this.style;

            if (section && section.pane)
                section.pane.dispatchEventToListeners("style edited");

            if (updateInterface)
                this.updateAll(true);
        }

        // Append a ";" if the new text does not end in ";".
        // FIXME: this does not handle trailing comments.
        if (styleText.length && !/;\s*$/.test(styleText))
            styleText += ";";
        this.property.setText(styleText, updateInterface, callback.bind(this));
    }
}

WebInspector.StylePropertyTreeElement.prototype.__proto__ = TreeElement.prototype;
