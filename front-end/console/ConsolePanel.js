/*
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
 * @extends {WebInspector.Panel}
 */
WebInspector.ConsolePanel = function()
{
    WebInspector.Panel.call(this, "console");
    this._view = WebInspector.ConsolePanel._view();
}

/**
 * @return {!WebInspector.ConsoleView}
 */
WebInspector.ConsolePanel._view = function()
{
    if (!WebInspector.ConsolePanel._consoleView)
        WebInspector.ConsolePanel._consoleView = new WebInspector.ConsoleView();

    return WebInspector.ConsolePanel._consoleView;
}

WebInspector.ConsolePanel.prototype = {
    /**
     * @override
     * @return {!Element}
     */
    defaultFocusedElement: function()
    {
        return this._view.defaultFocusedElement();
    },

    /**
     * @override
     */
    wasShown: function()
    {
        WebInspector.Panel.prototype.wasShown.call(this);
        this._view.show(this.element);
    },

    /**
     * @override
     */
    willHide: function()
    {
        WebInspector.Panel.prototype.willHide.call(this);
        if (WebInspector.ConsolePanel.WrapperView._instance)
            WebInspector.ConsolePanel.WrapperView._instance._showViewInWrapper();
    },

    /**
     * @override
     * @return {?WebInspector.SearchableView}
     */
    searchableView: function()
    {
        return WebInspector.ConsolePanel._view().searchableView();
    },

    __proto__: WebInspector.Panel.prototype
}

/**
 * @constructor
 * @extends {WebInspector.VBox}
 */
WebInspector.ConsolePanel.WrapperView = function()
{
    WebInspector.VBox.call(this);
    this.element.classList.add("console-view-wrapper");

    WebInspector.ConsolePanel.WrapperView._instance = this;

    this._view = WebInspector.ConsolePanel._view();
}

WebInspector.ConsolePanel.WrapperView.prototype = {
    wasShown: function()
    {
        if (!WebInspector.inspectorView.currentPanel() || WebInspector.inspectorView.currentPanel().name !== "console")
            this._showViewInWrapper();
    },

    /**
     * @override
     * @return {!Element}
     */
    defaultFocusedElement: function()
    {
        return this._view.defaultFocusedElement();
    },

    focus: function()
    {
        this._view.focus();
    },

    _showViewInWrapper: function()
    {
        this._view.show(this.element);
    },

    __proto__: WebInspector.VBox.prototype
}

/**
 * @constructor
 * @implements {WebInspector.Revealer}
 */
WebInspector.ConsolePanel.ConsoleRevealer = function()
{
}

WebInspector.ConsolePanel.ConsoleRevealer.prototype = {
    /**
     * @override
     * @param {!Object} object
     * @return {!Promise}
     */
    reveal: function(object)
    {
        var consoleView = WebInspector.ConsolePanel._view();
        if (consoleView.isShowing()) {
            consoleView.focus();
            return Promise.resolve();
        }
        WebInspector.inspectorView.showViewInDrawer("console");
        return Promise.resolve();
    }
}

WebInspector.ConsolePanel.show = function()
{
    WebInspector.inspectorView.setCurrentPanel(WebInspector.ConsolePanel._instance());
}

/**
 * @return {!WebInspector.ConsolePanel}
 */
WebInspector.ConsolePanel._instance = function()
{
    if (!WebInspector.ConsolePanel._instanceObject)
        WebInspector.ConsolePanel._instanceObject = new WebInspector.ConsolePanel();
    return WebInspector.ConsolePanel._instanceObject;
}

/**
 * @constructor
 * @implements {WebInspector.PanelFactory}
 */
WebInspector.ConsolePanelFactory = function()
{
}

WebInspector.ConsolePanelFactory.prototype = {
    /**
     * @override
     * @return {!WebInspector.Panel}
     */
    createPanel: function()
    {
        return WebInspector.ConsolePanel._instance();
    }
}
