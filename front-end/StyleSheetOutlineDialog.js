/*
 * Copyright (C) 2012 Google Inc. All rights reserved.
 *
 * Redistribution and use in source and binary forms, with or without
 * modification, are permitted provided that the following conditions are
 * met:
 *
 * 1. Redistributions of source code must retain the above copyright
 * notice, this list of conditions and the following disclaimer.
 *
 * 2. Redistributions in binary form must reproduce the above
 * copyright notice, this list of conditions and the following disclaimer
 * in the documentation and/or other materials provided with the
 * distribution.
 *
 * THIS SOFTWARE IS PROVIDED BY GOOGLE INC. AND ITS CONTRIBUTORS
 * "AS IS" AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT
 * LIMITED TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR
 * A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL GOOGLE INC.
 * OR ITS CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL,
 * SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT
 * LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE,
 * DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY
 * THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT
 * (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE
 * OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
 */

/**
 * @constructor
 * @extends {WebInspector.SelectionDialogContentProvider}
 * @param {WebInspector.View} view
 * @param {WebInspector.UISourceCode} uiSourceCode
 */
WebInspector.StyleSheetOutlineDialog = function(view, uiSourceCode)
{
    WebInspector.SelectionDialogContentProvider.call(this);

    this._rules = [];
    this._view = view;
    this._uiSourceCode = uiSourceCode;
    this._requestItems();
}

/**
 * @param {WebInspector.View} view
 * @param {WebInspector.UISourceCode} uiSourceCode
 */
WebInspector.StyleSheetOutlineDialog.show = function(view, uiSourceCode)
{
    if (WebInspector.Dialog.currentInstance())
        return null;
    var delegate = new WebInspector.StyleSheetOutlineDialog(view, uiSourceCode);
    var filteredItemSelectionDialog = new WebInspector.FilteredItemSelectionDialog(delegate);
    WebInspector.Dialog.show(view.element, filteredItemSelectionDialog);
}

WebInspector.StyleSheetOutlineDialog.prototype = {
    /**
     * @return {number}
     */
    itemCount: function()
    {
        return this._rules.length;
    },

    /**
     * @param {number} itemIndex
     * @return {string}
     */
    itemKeyAt: function(itemIndex)
    {
        return this._rules[itemIndex].selectorText;
    },

    /**
     * @param {number} itemIndex
     * @param {string} query
     * @return {number}
     */
    itemScoreAt: function(itemIndex, query)
    {
        var rule = this._rules[itemIndex];
        return -rule.rawLocation.lineNumber;
    },

    /**
     * @param {number} itemIndex
     * @param {string} query
     * @param {Element} titleElement
     * @param {Element} subtitleElement
     */
    renderItem: function(itemIndex, query, titleElement, subtitleElement)
    {
        var rule = this._rules[itemIndex];
        titleElement.textContent = rule.selectorText;
        this.highlightRanges(titleElement, query);
        subtitleElement.textContent = ":" + (rule.rawLocation.lineNumber + 1);
    },

    _requestItems: function()
    {
        function didGetAllStyleSheets(error, infos)
        {
            if (error)
                return;

            for (var i = 0; i < infos.length; ++i) {
                var info = infos[i];
                if (info.sourceURL === this._uiSourceCode.url) {
                    WebInspector.CSSStyleSheet.createForId(info.styleSheetId, didGetStyleSheet.bind(this));
                    return;
                }
            }
        }

        CSSAgent.getAllStyleSheets(didGetAllStyleSheets.bind(this));

        /**
         * @param {?WebInspector.CSSStyleSheet} styleSheet
         */
        function didGetStyleSheet(styleSheet)
        {
            if (!styleSheet)
                return;

            this._rules = styleSheet.rules;
            this.refresh();
        }
    },

    /**
     * @param {number} itemIndex
     * @param {string} promptValue
     */
    selectItem: function(itemIndex, promptValue)
    {
        var rule = this._rules[itemIndex];
        var lineNumber = rule.rawLocation.lineNumber;
        if (!isNaN(lineNumber) && lineNumber >= 0)
            this._view.highlightPosition(lineNumber, rule.rawLocation.columnNumber);
        this._view.focus();
    },

    __proto__: WebInspector.SelectionDialogContentProvider.prototype
}
