// Copyright (c) 2015 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

/**
 * @constructor
 * @param {!WebInspector.StylesSidebarPane} ssp
 */
WebInspector.PropertyChangeHighlighter = function(ssp)
{
    this._styleSidebarPane = ssp;
    WebInspector.targetManager.addModelListener(WebInspector.CSSStyleModel, WebInspector.CSSStyleModel.Events.LayoutEditorChange, this._onLayoutEditorChange, this);
    this._animationDuration = 1400;
    this._requestAnimationFrame = ssp.element.window().requestAnimationFrame;
}

WebInspector.PropertyChangeHighlighter.prototype = {
    /**
     * @param {!WebInspector.Event} event
     */
    _onLayoutEditorChange: function(event)
    {
        this._target = event.target.target();
        this._styleSheetId = event.data.id;
        this._changeRange = event.data.range;
        delete this._animationStart;
        if (!this._nextAnimation)
            this._nextAnimation = this._requestAnimationFrame.call(null, this.update.bind(this));
    },

    /**
     * @param {number} now
     */
    update: function(now)
    {
        delete this._nextAnimation;
        if (!this._styleSheetId)
            return;
        var node = this._styleSidebarPane.node();
        if (!node || this._target !== node.target()) {
            this._clear();
            return;
        }

        var sectionBlocks = this._styleSidebarPane.sectionBlocks();
        var foundSection = null;
        for (var block of sectionBlocks) {
            for (var section of block.sections) {
                var declaration = section.styleRule.style();
                if (declaration.styleSheetId !== this._styleSheetId)
                    continue;

                if (this._checkRanges(declaration.range, this._changeRange)) {
                    foundSection = section;
                    break;
                }
            }
            if (foundSection)
                break;
        }

        if (!foundSection) {
            this._clear();
            return;
        }

        var treeElement = foundSection.propertiesTreeOutline.firstChild();
        var foundTreeElement = null;
        while (treeElement) {
            if (treeElement.property.range  && this._checkRanges(treeElement.property.range, this._changeRange)) {
                foundTreeElement = treeElement;
                break;
            }
            treeElement = treeElement.traverseNextTreeElement(false, null, true);
        }

        if (!foundTreeElement) {
            this._clear();
            return;
        }

        if (!this._animationStart)
            this._animationStart = now;

        var animationProgress = (now - this._animationStart) / this._animationDuration;
        var valueElement = foundTreeElement.valueElement;
        valueElement.classList.toggle("css-update-highlight", animationProgress < 1);
        valueElement.classList.toggle("first-part", animationProgress < 0.2);

        if (animationProgress > 1) {
            this._clear();
            delete valueElement.style.backgroundColor;
            return;
        }

        valueElement.style.backgroundColor = "rgba(158, 54, 153, " + (1 - animationProgress) + ")";
        this._nextAnimation = this._requestAnimationFrame.call(null, this.update.bind(this));
    },

    _clear: function()
    {
        delete this._styleSheetId;
        delete this._changeRange;
        delete this._target;
        delete this._animationStart;
    },

    /**
     *
     * @param {!CSSAgent.SourceRange} outterRange
     * @param {!CSSAgent.SourceRange} innerRange
     * @return {boolean}
     */
    _checkRanges: function(outterRange, innerRange)
    {
        var startsBefore = outterRange.startLine < innerRange.startLine || (outterRange.startLine === innerRange.startLine && outterRange.startColumn <= innerRange.startColumn);
        // SSP might be outdated, so inner range will a bit bigger than outter. E.g.; "padding-left: 9px" -> "padding-left: 10px"
        var eps = 5;
        var endsAfter = outterRange.endLine > innerRange.endLine || (outterRange.endLine === innerRange.endLine && outterRange.endColumn + eps >= innerRange.endColumn);
        return startsBefore && endsAfter;
    }
}