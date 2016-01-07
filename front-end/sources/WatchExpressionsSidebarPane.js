/*
 * Copyright (C) IBM Corp. 2009  All rights reserved.
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
 *     * Neither the name of IBM Corp. nor the names of its
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
 * @extends {WebInspector.SidebarPane}
 */
WebInspector.WatchExpressionsSidebarPane = function()
{
    WebInspector.SidebarPane.call(this, WebInspector.UIString("Watch"));
    this.registerRequiredCSS("components/objectValue.css");

    this._requiresUpdate = true;
    /** @type {!Array.<!WebInspector.WatchExpression>} */
    this._watchExpressions = [];
    this._watchExpressionsSetting = WebInspector.settings.createLocalSetting("watchExpressions", []);

    var addButton = new WebInspector.ToolbarButton(WebInspector.UIString("Add expression"), "add-toolbar-item");
    addButton.addEventListener("click", this._addButtonClicked.bind(this));
    this.toolbar().appendToolbarItem(addButton);
    var refreshButton = new WebInspector.ToolbarButton(WebInspector.UIString("Refresh"), "refresh-toolbar-item");
    refreshButton.addEventListener("click", this._refreshButtonClicked.bind(this));
    this.toolbar().appendToolbarItem(refreshButton);

    this._bodyElement = this.element.createChild("div", "vbox watch-expressions");
    this._bodyElement.addEventListener("contextmenu", this._contextMenu.bind(this), false);

    WebInspector.context.addFlavorChangeListener(WebInspector.ExecutionContext, this.refreshExpressions, this);
}

WebInspector.WatchExpressionsSidebarPane.prototype = {
    wasShown: function()
    {
        this._refreshExpressionsIfNeeded();
    },

    refreshExpressions: function()
    {
        this._requiresUpdate = true;
        this._refreshExpressionsIfNeeded();
    },

    /**
     * @param {string} expressionString
     */
    addExpression: function(expressionString)
    {
        this.expand();
        if (this._requiresUpdate) {
            this._rebuildWatchExpressions();
            delete this._requiresUpdate;
        }
        this._createWatchExpression(expressionString);
        this._saveExpressions();
    },

    expandIfNecessary: function()
    {
        if (this._watchExpressionsSetting.get().length)
            this.expand();
    },

    _saveExpressions: function()
    {
        var toSave = [];
        for (var i = 0; i < this._watchExpressions.length; i++)
            if (this._watchExpressions[i].expression())
                toSave.push(this._watchExpressions[i].expression());

        this._watchExpressionsSetting.set(toSave);
    },

    _refreshExpressionsIfNeeded: function()
    {
        if (this._requiresUpdate && this.isShowing()) {
            this._rebuildWatchExpressions();
            delete this._requiresUpdate;
        } else
            this._requiresUpdate = true;
    },

    /**
     * @param {!WebInspector.Event=} event
     */
    _addButtonClicked: function(event)
    {
        if (event)
            event.consume(true);
        this.expand();
        this._createWatchExpression(null).startEditing();
    },

    /**
     * @param {!WebInspector.Event} event
     */
    _refreshButtonClicked: function(event)
    {
        event.consume();
        this.refreshExpressions();
    },

    _rebuildWatchExpressions: function()
    {
        this._bodyElement.removeChildren();
        this._watchExpressions = [];
        this._emptyElement = this._bodyElement.createChild("div", "info");
        this._emptyElement.textContent = WebInspector.UIString("No Watch Expressions");
        var watchExpressionStrings = this._watchExpressionsSetting.get();
        for (var i = 0; i < watchExpressionStrings.length; ++i) {
            var expression = watchExpressionStrings[i];
            if (!expression)
                continue;

            this._createWatchExpression(expression);
        }
    },

    /**
     * @param {?string} expression
     * @return {!WebInspector.WatchExpression}
     */
    _createWatchExpression: function(expression)
    {
        this._emptyElement.classList.add("hidden");
        var watchExpression = new WebInspector.WatchExpression(expression);
        watchExpression.addEventListener(WebInspector.WatchExpression.Events.ExpressionUpdated, this._watchExpressionUpdated.bind(this));
        this._bodyElement.appendChild(watchExpression.element());
        this._watchExpressions.push(watchExpression);
        return watchExpression;
    },

    /**
     * @param {!WebInspector.Event} event
     */
    _watchExpressionUpdated: function(event)
    {
        var watchExpression = /** @type {!WebInspector.WatchExpression} */ (event.target);
        if (!watchExpression.expression()) {
            this._watchExpressions.remove(watchExpression);
            this._bodyElement.removeChild(watchExpression.element());
            this._emptyElement.classList.toggle("hidden", !!this._watchExpressions.length);
        }

        this._saveExpressions();
    },

    /**
     * @param {!Event} event
     */
    _contextMenu: function(event)
    {
        var contextMenu = new WebInspector.ContextMenu(event);
        this._populateContextMenu(contextMenu, event);
        contextMenu.show();
    },

    /**
     * @param {!WebInspector.ContextMenu} contextMenu
     * @param {!Event} event
     */
    _populateContextMenu: function(contextMenu, event)
    {
        var isEditing = false;
        for (var watchExpression of this._watchExpressions)
           isEditing |=  watchExpression.isEditing();

        if (!isEditing)
            contextMenu.appendItem(WebInspector.UIString.capitalize("Add ^watch ^expression"), this._addButtonClicked.bind(this));

        if (this._watchExpressions.length > 1)
            contextMenu.appendItem(WebInspector.UIString.capitalize("Delete ^all ^watch ^expressions"), this._deleteAllButtonClicked.bind(this));

        for (var watchExpression of this._watchExpressions)
            if (watchExpression.element().containsEventPoint(event))
                watchExpression._populateContextMenu(contextMenu, event);
    },

    _deleteAllButtonClicked: function()
    {
        this._watchExpressions = [];
        this._saveExpressions();
        this._rebuildWatchExpressions();
    },

    __proto__: WebInspector.SidebarPane.prototype
}

/**
 * @constructor
 * @extends {WebInspector.Object}
 * @param {?string} expression
 */
WebInspector.WatchExpression = function(expression)
{
    this._expression = expression;
    this._element = createElementWithClass("div", "watch-expression monospace");
    this._editing = false;

    this._createWatchExpression(null, false);
    this.update();
}

WebInspector.WatchExpression._watchObjectGroupId = "watch-group";

WebInspector.WatchExpression.Events = {
    ExpressionUpdated: "ExpressionUpdated"
}

WebInspector.WatchExpression.prototype = {

    /**
     * @return {!Element}
     */
    element: function()
    {
        return this._element;
    },

    /**
     * @return {?string}
     */
    expression: function()
    {
        return this._expression;
    },

    update: function()
    {
        var currentExecutionContext = WebInspector.context.flavor(WebInspector.ExecutionContext);
        if (currentExecutionContext && this._expression)
            currentExecutionContext.evaluate(this._expression, WebInspector.WatchExpression._watchObjectGroupId, false, true, false, false, this._createWatchExpression.bind(this));
    },

    startEditing: function()
    {
        this._editing = true;
        this._element.removeChild(this._objectPresentationElement);
        var newDiv = this._element.createChild("div");
        newDiv.textContent = this._nameElement.textContent;
        this._textPrompt = new WebInspector.ObjectPropertyPrompt();
        this._textPrompt.renderAsBlock();
        var proxyElement = this._textPrompt.attachAndStartEditing(newDiv, this._finishEditing.bind(this));
        proxyElement.classList.add("watch-expression-text-prompt-proxy");
        proxyElement.addEventListener("keydown", this._promptKeyDown.bind(this), false);
        this._element.getComponentSelection().setBaseAndExtent(newDiv, 0, newDiv, 1);
    },

    /**
     * @return {boolean}
     */
    isEditing: function()
    {
        return !!this._editing;
    },

    /**
     * @param {!Event} event
     * @param {boolean=} canceled
     */
    _finishEditing: function(event, canceled)
    {
        if (event)
            event.consume(true);

        this._editing = false;
        this._textPrompt.detach();
        var newExpression = canceled ? this._expression : this._textPrompt.text();
        delete this._textPrompt;
        this._element.removeChildren();
        this._element.appendChild(this._objectPresentationElement);
        this._updateExpression(newExpression);
    },

    /**
     * @param {!Event} event
     */
    _dblClickOnWatchExpression: function(event)
    {
        event.consume();
        if (!this.isEditing())
            this.startEditing();
    },

    /**
     * @param {?string} newExpression
     */
    _updateExpression: function(newExpression)
    {
        this._expression = newExpression;
        this.update();
        this.dispatchEventToListeners(WebInspector.WatchExpression.Events.ExpressionUpdated);
    },

    /**
     * @param {!Event} event
     */
    _deleteWatchExpression: function(event)
    {
        event.consume(true);
        this._updateExpression(null);
    },

    /**
     * @param {?WebInspector.RemoteObject} result
     * @param {boolean} wasThrown
     */
    _createWatchExpression: function(result, wasThrown)
    {
        this._result = result;

        var headerElement= createElementWithClass("div", "watch-expression-header");
        var deleteButton = headerElement.createChild("button", "watch-expression-delete-button");
        deleteButton.title = WebInspector.UIString("Delete watch expression");
        deleteButton.addEventListener("click", this._deleteWatchExpression.bind(this), false);

        var titleElement = headerElement.createChild("div", "watch-expression-title");
        this._nameElement = WebInspector.ObjectPropertiesSection.createNameElement(this._expression);
        if (wasThrown || !result) {
            this._valueElement = createElementWithClass("span", "error-message value");
            titleElement.classList.add("dimmed");
            this._valueElement.textContent = WebInspector.UIString("<not available>");
        } else {
            this._valueElement = WebInspector.ObjectPropertiesSection.createValueElementWithCustomSupport(result, wasThrown, titleElement);
        }
        var separatorElement = createElementWithClass("span", "watch-expressions-separator");
        separatorElement.textContent = ": ";
        titleElement.appendChildren(this._nameElement, separatorElement, this._valueElement);

        this._element.removeChildren();
        this._objectPropertiesSection = null;
        if (!wasThrown && result && result.hasChildren && !result.customPreview()) {
            this._objectPropertiesSection = new WebInspector.ObjectPropertiesSection(result, headerElement);
            this._objectPresentationElement = this._objectPropertiesSection.element;
            var objectTreeElement = this._objectPropertiesSection.objectTreeElement();
            objectTreeElement.toggleOnClick = false;
            objectTreeElement.listItemElement.addEventListener("click", this._onSectionClick.bind(this), false);
            objectTreeElement.listItemElement.addEventListener("dblclick", this._dblClickOnWatchExpression.bind(this));
        } else {
            this._objectPresentationElement = headerElement;
            this._objectPresentationElement.addEventListener("dblclick", this._dblClickOnWatchExpression.bind(this));
        }

        this._element.appendChild(this._objectPresentationElement);
    },

    /**
     * @param {!Event} event
     */
    _onSectionClick: function(event)
    {
        event.consume(true);
        if (event.detail == 1) {
            this._preventClickTimeout = setTimeout(handleClick.bind(this), 333);
        } else {
            clearTimeout(this._preventClickTimeout);
            delete this._preventClickTimeout;
        }

        /**
         * @this {WebInspector.WatchExpression}
         */
        function handleClick()
        {
            if (!this._objectPropertiesSection)
                return;

            var objectTreeElement = this._objectPropertiesSection.objectTreeElement();
            if (objectTreeElement.expanded)
                objectTreeElement.collapse();
            else
                objectTreeElement.expand();
        }
    },

    /**
     * @param {!Event} event
     */
    _promptKeyDown: function(event)
    {
        if (isEnterKey(event) || isEscKey(event))
            this._finishEditing(event, isEscKey(event));
    },

    /**
     * @param {!WebInspector.ContextMenu} contextMenu
     * @param {!Event} event
     */
    _populateContextMenu: function(contextMenu, event)
    {
        if (!this.isEditing())
            contextMenu.appendItem(WebInspector.UIString.capitalize("Delete ^watch ^expression"), this._updateExpression.bind(this, null));

        if (!this.isEditing() && this._result && (this._result.type === "number" || this._result.type === "string"))
            contextMenu.appendItem(WebInspector.UIString.capitalize("Copy ^value"), this._copyValueButtonClicked.bind(this));

        if (this._valueElement.containsEventPoint(event))
            contextMenu.appendApplicableItems(this._result);
    },

    _copyValueButtonClicked: function()
    {
        InspectorFrontendHost.copyText(this._valueElement.textContent);
    },

    __proto__: WebInspector.Object.prototype
}
