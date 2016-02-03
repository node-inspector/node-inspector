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
 * @extends {WebInspector.SourceFrame}
 * @param {!WebInspector.UISourceCode} uiSourceCode
 */
WebInspector.UISourceCodeFrame = function(uiSourceCode)
{
    this._uiSourceCode = uiSourceCode;
    WebInspector.SourceFrame.call(this, this._uiSourceCode);
    this.textEditor.setAutocompleteDelegate(new WebInspector.SimpleAutocompleteDelegate());

    this._uiSourceCode.addEventListener(WebInspector.UISourceCode.Events.WorkingCopyChanged, this._onWorkingCopyChanged, this);
    this._uiSourceCode.addEventListener(WebInspector.UISourceCode.Events.WorkingCopyCommitted, this._onWorkingCopyCommitted, this);
    this._uiSourceCode.addEventListener(WebInspector.UISourceCode.Events.SavedStateUpdated, this._onSavedStateUpdated, this);
    this._updateStyle();
}

WebInspector.UISourceCodeFrame.prototype = {
    /**
     * @return {!WebInspector.UISourceCode}
     */
    uiSourceCode: function()
    {
        return this._uiSourceCode;
    },

    wasShown: function()
    {
        WebInspector.SourceFrame.prototype.wasShown.call(this);
        this._boundWindowFocused = this._windowFocused.bind(this);
        this.element.ownerDocument.defaultView.addEventListener("focus", this._boundWindowFocused, false);
        this._checkContentUpdated();
    },

    willHide: function()
    {
        WebInspector.SourceFrame.prototype.willHide.call(this);
        this.element.ownerDocument.defaultView.removeEventListener("focus", this._boundWindowFocused, false);
        delete this._boundWindowFocused;
        this._uiSourceCode.removeWorkingCopyGetter();
    },

    /**
     * @override
     * @return {boolean}
     */
    canEditSource: function()
    {
        var projectType = this._uiSourceCode.project().type();
        if (projectType === WebInspector.projectTypes.Service || projectType === WebInspector.projectTypes.Debugger || projectType === WebInspector.projectTypes.Formatter)
            return false;
        if (projectType === WebInspector.projectTypes.Network && this._uiSourceCode.contentType() === WebInspector.resourceTypes.Document)
            return false;
        return true;
    },

    _windowFocused: function(event)
    {
        this._checkContentUpdated();
    },

    _checkContentUpdated: function()
    {
        if (!this.loaded || !this.isShowing())
            return;
        this._uiSourceCode.checkContentUpdated();
    },

    commitEditing: function()
    {
        if (!this._uiSourceCode.isDirty())
            return;

        this._muteSourceCodeEvents = true;
        this._uiSourceCode.commitWorkingCopy();
        delete this._muteSourceCodeEvents;
    },

    onTextChanged: function(oldRange, newRange)
    {
        WebInspector.SourceFrame.prototype.onTextChanged.call(this, oldRange, newRange);
        if (this._isSettingContent)
            return;
        this._muteSourceCodeEvents = true;
        if (this._textEditor.isClean())
            this._uiSourceCode.resetWorkingCopy();
        else
            this._uiSourceCode.setWorkingCopyGetter(this._textEditor.text.bind(this._textEditor));
        delete this._muteSourceCodeEvents;
    },

    /**
     * @param {!WebInspector.Event} event
     */
    _onWorkingCopyChanged: function(event)
    {
        if (this._muteSourceCodeEvents)
            return;
        this._innerSetContent(this._uiSourceCode.workingCopy());
        this.onUISourceCodeContentChanged();
    },

    /**
     * @param {!WebInspector.Event} event
     */
    _onWorkingCopyCommitted: function(event)
    {
        if (!this._muteSourceCodeEvents) {
            this._innerSetContent(this._uiSourceCode.workingCopy());
            this.onUISourceCodeContentChanged();
        }
        this._textEditor.markClean();
        this._updateStyle();
    },

    /**
     * @param {!WebInspector.Event} event
     */
    _onSavedStateUpdated: function(event)
    {
        this._updateStyle();
    },

    _updateStyle: function()
    {
        this.element.classList.toggle("source-frame-unsaved-committed-changes", this._uiSourceCode.hasUnsavedCommittedChanges());
    },

    onUISourceCodeContentChanged: function()
    {
    },

    /**
     * @param {string} content
     */
    _innerSetContent: function(content)
    {
        this._isSettingContent = true;
        this.setContent(content);
        delete this._isSettingContent;
    },

    populateTextAreaContextMenu: function(contextMenu, lineNumber, columnNumber)
    {
        WebInspector.SourceFrame.prototype.populateTextAreaContextMenu.call(this, contextMenu, lineNumber, columnNumber);
        contextMenu.appendApplicableItems(this._uiSourceCode);
        contextMenu.appendApplicableItems(new WebInspector.UILocation(this._uiSourceCode, lineNumber, columnNumber));
        contextMenu.appendSeparator();
    },

    /**
     * @param {!Array.<!WebInspector.UISourceCodeFrame.Infobar|undefined>} infobars
     */
    attachInfobars: function(infobars)
    {
        for (var i = infobars.length - 1; i >= 0; --i) {
            var infobar = infobars[i];
            if (!infobar)
                continue;
            this.element.insertBefore(infobar.element, this.element.children[0]);
            infobar._attached(this);
        }
        this.doResize();
    },

    dispose: function()
    {
        this._textEditor.dispose();
        this.detach();
    },

    __proto__: WebInspector.SourceFrame.prototype
}

/**
 * @constructor
 * @extends {WebInspector.Infobar}
 * @param {!WebInspector.Infobar.Type} type
 * @param {string} message
 * @param {!WebInspector.Setting=} disableSetting
 */
WebInspector.UISourceCodeFrame.Infobar = function(type, message, disableSetting)
{
    WebInspector.Infobar.call(this, type, disableSetting);
    this.setCloseCallback(this.dispose.bind(this));
    this.element.classList.add("source-frame-infobar");
    this._rows = this.element.createChild("div", "source-frame-infobar-rows");

    this._mainRow = this._rows.createChild("div", "source-frame-infobar-main-row");
    this._mainRow.createChild("span", "source-frame-infobar-row-message").textContent = message;

    this._toggleElement = this._mainRow.createChild("div", "source-frame-infobar-toggle link");
    this._toggleElement.addEventListener("click", this._onToggleDetails.bind(this), false);
    this._detailsContainer = this._rows.createChild("div", "source-frame-infobar-details-container");
    this._updateToggleElement();
}

WebInspector.UISourceCodeFrame.Infobar.prototype = {
    _onResize: function()
    {
        if (this._uiSourceCodeFrame)
            this._uiSourceCodeFrame.doResize();
    },

    _onToggleDetails: function()
    {
        this._toggled = !this._toggled;
        this._updateToggleElement();
        this._onResize();
    },

    _updateToggleElement: function()
    {
        this._toggleElement.textContent = this._toggled ? WebInspector.UIString("less") : WebInspector.UIString("more");
        this._detailsContainer.classList.toggle("hidden", !this._toggled);
    },

    /**
     * @param {!WebInspector.UISourceCodeFrame} uiSourceCodeFrame
     */
    _attached: function(uiSourceCodeFrame)
    {
        this._uiSourceCodeFrame = uiSourceCodeFrame;
        this.setVisible(true);
    },

    /**
     * @param {string=} message
     * @return {!Element}
     */
    createDetailsRowMessage: function(message)
    {
        var infobarDetailsRow = this._detailsContainer.createChild("div", "source-frame-infobar-details-row");
        var detailsRowMessage = infobarDetailsRow.createChild("span", "source-frame-infobar-row-message");
        detailsRowMessage.textContent = message || "";
        return detailsRowMessage;
    },

    dispose: function()
    {
        this.element.remove();
        this._onResize();
        delete this._uiSourceCodeFrame;
    },

    __proto__: WebInspector.Infobar.prototype
}
