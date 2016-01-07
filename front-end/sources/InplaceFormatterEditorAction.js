
// Copyright 2014 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

/**
 * @constructor
 * @implements {WebInspector.SourcesView.EditorAction}
 */
WebInspector.InplaceFormatterEditorAction = function()
{
}

WebInspector.InplaceFormatterEditorAction.prototype = {
    /**
     * @param {!WebInspector.Event} event
     */
    _editorSelected: function(event)
    {
        var uiSourceCode = /** @type {!WebInspector.UISourceCode} */ (event.data);
        this._updateButton(uiSourceCode);
    },

    /**
     * @param {!WebInspector.Event} event
     */
    _editorClosed: function(event)
    {
        var wasSelected = /** @type {boolean} */ (event.data.wasSelected);
        if (wasSelected)
            this._updateButton(null);
    },

    /**
     * @param {?WebInspector.UISourceCode} uiSourceCode
     */
    _updateButton: function(uiSourceCode)
    {
        this._button.element.classList.toggle("hidden", !this._isFormattable(uiSourceCode));
    },

    /**
     * @override
     * @param {!WebInspector.SourcesView} sourcesView
     * @return {!WebInspector.ToolbarButton}
     */
    button: function(sourcesView)
    {
        if (this._button)
            return this._button;

        this._sourcesView = sourcesView;
        this._sourcesView.addEventListener(WebInspector.SourcesView.Events.EditorSelected, this._editorSelected.bind(this));
        this._sourcesView.addEventListener(WebInspector.SourcesView.Events.EditorClosed, this._editorClosed.bind(this));

        this._button = new WebInspector.ToolbarButton(WebInspector.UIString("Format"), "format-toolbar-item");
        this._button.setToggled(false);
        this._button.addEventListener("click", this._formatSourceInPlace, this);
        this._updateButton(sourcesView.currentUISourceCode());

        return this._button;
    },

    /**
     * @param {?WebInspector.UISourceCode} uiSourceCode
     * @return {boolean}
     */
    _isFormattable: function(uiSourceCode)
    {
        if (!uiSourceCode)
            return false;
        if (uiSourceCode.project().type() === WebInspector.projectTypes.FileSystem)
            return true;
        return uiSourceCode.contentType() === WebInspector.resourceTypes.Stylesheet
            || uiSourceCode.project().type() === WebInspector.projectTypes.Snippets;
    },

    _formatSourceInPlace: function()
    {
        var uiSourceCode = this._sourcesView.currentUISourceCode();
        if (!this._isFormattable(uiSourceCode))
            return;

        if (uiSourceCode.isDirty())
            contentLoaded.call(this, uiSourceCode.workingCopy());
        else
            uiSourceCode.requestContent(contentLoaded.bind(this));

        /**
         * @this {WebInspector.InplaceFormatterEditorAction}
         * @param {?string} content
         */
        function contentLoaded(content)
        {
            var highlighterType = WebInspector.SourcesView.uiSourceCodeHighlighterType(uiSourceCode);
            WebInspector.Formatter.format(uiSourceCode.contentType(), highlighterType, content || "", innerCallback.bind(this));
        }

        /**
         * @this {WebInspector.InplaceFormatterEditorAction}
         * @param {string} formattedContent
         * @param {!WebInspector.FormatterSourceMapping} formatterMapping
         */
        function innerCallback(formattedContent, formatterMapping)
        {
            if (uiSourceCode.workingCopy() === formattedContent)
                return;
            var sourceFrame = this._sourcesView.viewForFile(uiSourceCode);
            var start = [0, 0];
            if (sourceFrame) {
                var selection = sourceFrame.selection();
                start = formatterMapping.originalToFormatted(selection.startLine, selection.startColumn);
            }
            uiSourceCode.setWorkingCopy(formattedContent);
            this._sourcesView.showSourceLocation(uiSourceCode, start[0], start[1]);
        }
    },
}
