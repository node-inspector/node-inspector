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

WebInspector.WatchExpressionsSidebarPane = function()
{
    WebInspector.SidebarPane.call(this, WebInspector.UIString("Watch Expressions"));

    this.section = new WebInspector.WatchExpressionsSection();
    this.bodyElement.appendChild(this.section.element);

    var refreshButton = document.createElement("button");
    refreshButton.className = "pane-title-button refresh";
    refreshButton.addEventListener("click", this._refreshButtonClicked.bind(this), false);
    this.titleElement.appendChild(refreshButton);

    var addButton = document.createElement("button");
    addButton.className = "pane-title-button add";
    addButton.addEventListener("click", this._addButtonClicked.bind(this), false);
    this.titleElement.appendChild(addButton);
    this._requiresUpdate = true;
}

WebInspector.WatchExpressionsSidebarPane.prototype = {
    show: function()
    {
        this._visible = true;

        // Expand and update watches first time they are shown.
        if (!this._wasShown && WebInspector.settings.watchExpressions.get().length > 0)
            this.expanded = true;

        this._refreshExpressionsIfNeeded();
        this._wasShown = true;
    },

    hide: function()
    {
        this._visible = false;
    },

    reset: function()
    {
        this.refreshExpressions();
    },

    refreshExpressions: function()
    {
        this._requiresUpdate = true;
        this._refreshExpressionsIfNeeded();
    },

    _refreshExpressionsIfNeeded: function()
    {
        if (this._requiresUpdate && this._visible) {
            this.section.update();
            delete this._requiresUpdate;
        } else
            this._requiresUpdate = true;
    },

    _addButtonClicked: function(event)
    {
        event.stopPropagation();
        this.expanded = true;
        this.section.addExpression();
    },

    _refreshButtonClicked: function(event)
    {
        event.stopPropagation();
        this.refreshExpressions();
    }
}

WebInspector.WatchExpressionsSidebarPane.prototype.__proto__ = WebInspector.SidebarPane.prototype;

WebInspector.WatchExpressionsSection = function()
{
    this._watchObjectGroupId = "watch-group";

    WebInspector.ObjectPropertiesSection.call(this);
    this.emptyElement = document.createElement("div");
    this.emptyElement.className = "info";
    this.emptyElement.textContent = WebInspector.UIString("No Watch Expressions");

    this.watchExpressions = WebInspector.settings.watchExpressions.get();

    this.headerElement.className = "hidden";
    this.editable = true;
    this.expanded = true;
    this.propertiesElement.addStyleClass("watch-expressions");

    this.element.addEventListener("mousemove", this._mouseMove.bind(this), true);
    this.element.addEventListener("mouseout", this._mouseOut.bind(this), true);
}

WebInspector.WatchExpressionsSection.NewWatchExpression = "\xA0";

WebInspector.WatchExpressionsSection.prototype = {
    update: function(e)
    {
        if (e)
            e.stopPropagation();

        function appendResult(expression, watchIndex, result, wasThrown)
        {
            if (!result)
                return;

            var property = new WebInspector.RemoteObjectProperty(expression, result);
            property.watchIndex = watchIndex;
            property.wasThrown = wasThrown;

            // To clarify what's going on here:
            // In the outer function, we calculate the number of properties
            // that we're going to be updating, and set that in the
            // propertyCount variable.
            // In this function, we test to see when we are processing the
            // last property, and then call the superclass's updateProperties()
            // method to get all the properties refreshed at once.
            properties.push(property);

            if (properties.length == propertyCount) {
                this.updateProperties(properties, WebInspector.WatchExpressionTreeElement, WebInspector.WatchExpressionsSection.CompareProperties);

                // check to see if we just added a new watch expression,
                // which will always be the last property
                if (this._newExpressionAdded) {
                    delete this._newExpressionAdded;

                    treeElement = this.findAddedTreeElement();
                    if (treeElement)
                        treeElement.startEditing();
                }

                // Force displaying delete button for hovered element.
                if (this._lastMouseMovePageY)
                    this._updateHoveredElement(this._lastMouseMovePageY);
            }
        }

        // TODO: pass exact injected script id.
        RuntimeAgent.releaseObjectGroup(this._watchObjectGroupId)
        var properties = [];

        // Count the properties, so we known when to call this.updateProperties()
        // in appendResult()
        var propertyCount = 0;
        for (var i = 0; i < this.watchExpressions.length; ++i) {
            if (!this.watchExpressions[i])
                continue;
            ++propertyCount;
        }

        // Now process all the expressions, since we have the actual count,
        // which is checked in the appendResult inner function.
        for (var i = 0; i < this.watchExpressions.length; ++i) {
            var expression = this.watchExpressions[i];
            if (!expression)
                continue;

            WebInspector.consoleView.evalInInspectedWindow(expression, this._watchObjectGroupId, false, true, undefined, appendResult.bind(this, expression, i));
        }

        if (!propertyCount) {
            if (!this.emptyElement.parentNode)
                this.element.appendChild(this.emptyElement);
        } else {
            if (this.emptyElement.parentNode)
                this.element.removeChild(this.emptyElement);
        }

        // note this is setting the expansion of the tree, not the section;
        // with no expressions, and expanded tree, we get some extra vertical
        // white space
        this.expanded = (propertyCount != 0);
    },

    addExpression: function()
    {
        this._newExpressionAdded = true;
        this.watchExpressions.push(WebInspector.WatchExpressionsSection.NewWatchExpression);
        this.update();
    },

    updateExpression: function(element, value)
    {
        this.watchExpressions[element.property.watchIndex] = value;
        this.saveExpressions();
        this.update();
    },

    findAddedTreeElement: function()
    {
        var children = this.propertiesTreeOutline.children;
        for (var i = 0; i < children.length; ++i)
            if (children[i].property.name === WebInspector.WatchExpressionsSection.NewWatchExpression)
                return children[i];
    },

    saveExpressions: function()
    {
        var toSave = [];
        for (var i = 0; i < this.watchExpressions.length; i++)
            if (this.watchExpressions[i])
                toSave.push(this.watchExpressions[i]);

        WebInspector.settings.watchExpressions.set(toSave);
        return toSave.length;
    },

    _mouseMove: function(e)
    {
        if (this.propertiesElement.firstChild)
            this._updateHoveredElement(e.pageY);
    },

    _mouseOut: function()
    {
        if (this._hoveredElement)
            this._hoveredElement.removeStyleClass("hovered");
        delete this._lastMouseMovePageY;
    },

    _updateHoveredElement: function(pageY)
    {
        if (this._hoveredElement)
            this._hoveredElement.removeStyleClass("hovered");

        this._hoveredElement = this.propertiesElement.firstChild;
        while (true) {
            var next = this._hoveredElement.nextSibling;
            while(next && !next.clientHeight)
                next = next.nextSibling;
            if (!next || next.totalOffsetTop() > pageY)
                break;
            this._hoveredElement = next;
        }
        this._hoveredElement.addStyleClass("hovered");

        this._lastMouseMovePageY = pageY;
    }
}

WebInspector.WatchExpressionsSection.prototype.__proto__ = WebInspector.ObjectPropertiesSection.prototype;

WebInspector.WatchExpressionsSection.CompareProperties = function(propertyA, propertyB)
{
    if (propertyA.watchIndex == propertyB.watchIndex)
        return 0;
    else if (propertyA.watchIndex < propertyB.watchIndex)
        return -1;
    else
        return 1;
}

WebInspector.WatchExpressionTreeElement = function(property)
{
    WebInspector.ObjectPropertyTreeElement.call(this, property);
}

WebInspector.WatchExpressionTreeElement.prototype = {
    update: function()
    {
        WebInspector.ObjectPropertyTreeElement.prototype.update.call(this);

        if (this.property.wasThrown)
            this.valueElement.addStyleClass("watch-expressions-error-level");

        var deleteButton = document.createElement("input");
        deleteButton.type = "button";
        deleteButton.title = WebInspector.UIString("Delete watch expression.");
        deleteButton.addStyleClass("enabled-button");
        deleteButton.addStyleClass("delete-button");
        deleteButton.addEventListener("click", this._deleteButtonClicked.bind(this), false);
        this.listItemElement.insertBefore(deleteButton, this.listItemElement.firstChild);
    },

    _deleteButtonClicked: function()
    {
        this.treeOutline.section.updateExpression(this, null);
    },

    startEditing: function()
    {
        if (WebInspector.isBeingEdited(this.nameElement) || !this.treeOutline.section.editable)
            return;

        this.nameElement.textContent = this.property.name.trim();

        var context = { expanded: this.expanded };

        // collapse temporarily, if required
        this.hasChildren = false;

        this.listItemElement.addStyleClass("editing-sub-part");

        WebInspector.startEditing(this.nameElement, {
            context: context,
            commitHandler: this.editingCommitted.bind(this),
            cancelHandler: this.editingCancelled.bind(this)
        });
    },

    editingCancelled: function(element, context)
    {
        if (!this.nameElement.textContent)
            this.treeOutline.section.updateExpression(this, null);

        this.update();
        this.editingEnded(context);
    },

    applyExpression: function(expression, updateInterface)
    {
        expression = expression.trim();

        if (!expression)
            expression = null;

        this.property.name = expression;
        this.treeOutline.section.updateExpression(this, expression);
    }
}

WebInspector.WatchExpressionTreeElement.prototype.__proto__ = WebInspector.ObjectPropertyTreeElement.prototype;
