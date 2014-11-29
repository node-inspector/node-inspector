/*
 * Copyright (C) 2013 Google Inc. All rights reserved.
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
 * @extends {WebInspector.ElementsSidebarPane}
 */
WebInspector.PlatformFontsSidebarPane = function()
{
    WebInspector.ElementsSidebarPane.call(this, WebInspector.UIString("Fonts"));
    this.element.classList.add("platform-fonts");

    this._sectionTitle = createElementWithClass("div", "sidebar-separator");
    this.element.insertBefore(this._sectionTitle, this.bodyElement);
    this._sectionTitle.textContent = WebInspector.UIString("Rendered Fonts");
    this._fontStatsSection = this.bodyElement.createChild("div", "stats-section");
}

WebInspector.PlatformFontsSidebarPane.prototype = {
    /**
     * @param {?WebInspector.DOMNode} node
     */
    setNode: function(node)
    {
        WebInspector.ElementsSidebarPane.prototype.setNode.call(this, node);
        this._updateTarget(node.target());
    },

    /**
     * @param {!WebInspector.Target} target
     */
    _updateTarget: function(target)
    {
        if (this._target === target)
            return;
        if (this._target) {
            this._target.cssModel.removeEventListener(WebInspector.CSSStyleModel.Events.StyleSheetAdded, this.update, this);
            this._target.cssModel.removeEventListener(WebInspector.CSSStyleModel.Events.StyleSheetRemoved, this.update, this);
            this._target.cssModel.removeEventListener(WebInspector.CSSStyleModel.Events.StyleSheetChanged, this.update, this);
            this._target.cssModel.removeEventListener(WebInspector.CSSStyleModel.Events.MediaQueryResultChanged, this.update, this);
            this._target.domModel.removeEventListener(WebInspector.DOMModel.Events.AttrModified, this.update, this);
            this._target.domModel.removeEventListener(WebInspector.DOMModel.Events.AttrRemoved, this.update, this);
            this._target.domModel.removeEventListener(WebInspector.DOMModel.Events.CharacterDataModified, this.update, this);
        }
        this._target = target;
        this._target.cssModel.addEventListener(WebInspector.CSSStyleModel.Events.StyleSheetAdded, this.update, this);
        this._target.cssModel.addEventListener(WebInspector.CSSStyleModel.Events.StyleSheetRemoved, this.update, this);
        this._target.cssModel.addEventListener(WebInspector.CSSStyleModel.Events.StyleSheetChanged, this.update, this);
        this._target.cssModel.addEventListener(WebInspector.CSSStyleModel.Events.MediaQueryResultChanged, this.update, this);
        this._target.domModel.addEventListener(WebInspector.DOMModel.Events.AttrModified, this.update, this);
        this._target.domModel.addEventListener(WebInspector.DOMModel.Events.AttrRemoved, this.update, this);
        this._target.domModel.addEventListener(WebInspector.DOMModel.Events.CharacterDataModified, this.update, this);
    },

    /**
     * @param {!WebInspector.Throttler.FinishCallback} finishedCallback
     * @protected
     */
    doUpdate: function(finishedCallback)
    {
        if (!this.node())
            return;
        this._target.cssModel.getPlatformFontsForNode(this.node().id, this._refreshUI.bind(this, /** @type {!WebInspector.DOMNode} */ (this.node()), finishedCallback));
    },

    /**
     * @param {!WebInspector.DOMNode} node
     * @param {!WebInspector.Throttler.FinishCallback} finishedCallback
     * @param {?string} cssFamilyName
     * @param {?Array.<!CSSAgent.PlatformFontUsage>} platformFonts
     */
    _refreshUI: function(node, finishedCallback, cssFamilyName, platformFonts)
    {
        if (this.node() !== node) {
            finishedCallback();
            return;
        }

        this._fontStatsSection.removeChildren();

        var isEmptySection = !platformFonts || !platformFonts.length;
        this._sectionTitle.classList.toggle("hidden", isEmptySection);
        if (isEmptySection) {
            finishedCallback();
            return;
        }
        platformFonts.sort(function (a, b) {
            return b.glyphCount - a.glyphCount;
        });
        for (var i = 0; i < platformFonts.length; ++i) {
            var fontStatElement = this._fontStatsSection.createChild("div", "font-stats-item");

            var fontNameElement = fontStatElement.createChild("span", "font-name");
            fontNameElement.textContent = platformFonts[i].familyName;

            var fontDelimeterElement = fontStatElement.createChild("span", "delimeter");
            fontDelimeterElement.textContent = "\u2014";

            var fontUsageElement = fontStatElement.createChild("span", "font-usage");
            var usage = platformFonts[i].glyphCount;
            fontUsageElement.textContent = usage === 1 ? WebInspector.UIString("%d glyph", usage) : WebInspector.UIString("%d glyphs", usage);
        }
        finishedCallback();
    },

    __proto__: WebInspector.ElementsSidebarPane.prototype
}
