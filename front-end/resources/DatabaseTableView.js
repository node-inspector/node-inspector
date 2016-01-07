/*
 * Copyright (C) 2008 Apple Inc. All Rights Reserved.
 *
 * Redistribution and use in source and binary forms, with or without
 * modification, are permitted provided that the following conditions
 * are met:
 * 1. Redistributions of source code must retain the above copyright
 *    notice, this list of conditions and the following disclaimer.
 * 2. Redistributions in binary form must reproduce the above copyright
 *    notice, this list of conditions and the following disclaimer in the
 *    documentation and/or other materials provided with the distribution.
 *
 * THIS SOFTWARE IS PROVIDED BY APPLE INC. ``AS IS'' AND ANY
 * EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE
 * IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR
 * PURPOSE ARE DISCLAIMED.  IN NO EVENT SHALL APPLE INC. OR
 * CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL,
 * EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO,
 * PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR
 * PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY
 * OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT
 * (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE
 * OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
 */

/**
 * @constructor
 * @extends {WebInspector.VBox}
 */
WebInspector.DatabaseTableView = function(database, tableName)
{
    WebInspector.VBox.call(this);

    this.database = database;
    this.tableName = tableName;

    this.element.classList.add("storage-view", "table");

    this._visibleColumnsSetting = WebInspector.settings.createSetting("databaseTableViewVisibleColumns", {});

    this.refreshButton = new WebInspector.ToolbarButton(WebInspector.UIString("Refresh"), "refresh-toolbar-item");
    this.refreshButton.addEventListener("click", this._refreshButtonClicked, this);
    this._visibleColumnsInput = new WebInspector.ToolbarInput(WebInspector.UIString("Visible columns"), 1);
    this._visibleColumnsInput.addEventListener(WebInspector.ToolbarInput.Event.TextChanged, this._onVisibleColumnsChanged, this);
}

WebInspector.DatabaseTableView.prototype = {
    wasShown: function()
    {
        this.update();
    },

    /**
     * @return {!Array.<!WebInspector.ToolbarItem>}
     */
    toolbarItems: function()
    {
        return [this.refreshButton, this._visibleColumnsInput];
    },

    /**
     * @param {string} tableName
     * @return {string}
     */
    _escapeTableName: function(tableName)
    {
        return tableName.replace(/\"/g, "\"\"");
    },

    update: function()
    {
        this.database.executeSql("SELECT rowid, * FROM \"" + this._escapeTableName(this.tableName) + "\"", this._queryFinished.bind(this), this._queryError.bind(this));
    },

    _queryFinished: function(columnNames, values)
    {
        this.detachChildWidgets();
        this.element.removeChildren();

        this._dataGrid = WebInspector.SortableDataGrid.create(columnNames, values);
        this._visibleColumnsInput.setVisible(!!this._dataGrid);
        if (!this._dataGrid) {
            this._emptyWidget = new WebInspector.EmptyWidget(WebInspector.UIString("The “%s”\ntable is empty.", this.tableName));
            this._emptyWidget.show(this.element);
            return;
        }
        this._dataGrid.show(this.element);
        this._dataGrid.autoSizeColumns(5);

        this._columnsMap = new Map();
        for (var i = 1; i < columnNames.length; ++i)
            this._columnsMap.set(columnNames[i], String(i));
        this._lastVisibleColumns = "";
        var visibleColumnsText = this._visibleColumnsSetting.get()[this.tableName] || "";
        this._visibleColumnsInput.setValue(visibleColumnsText);
        this._onVisibleColumnsChanged();
    },

    _onVisibleColumnsChanged: function()
    {
        if (!this._dataGrid)
            return;
        var text = this._visibleColumnsInput.value();
        var parts = text.split(/[\s,]+/);
        var matches = new Set();
        var columnsVisibility = {};
        columnsVisibility["0"] = true;
        for (var i = 0; i < parts.length; ++i) {
            var part = parts[i];
            if (this._columnsMap.has(part)) {
                matches.add(part);
                columnsVisibility[this._columnsMap.get(part)] = true;
            }
        }
        var newVisibleColumns = matches.valuesArray().sort().join(", ");
        if (newVisibleColumns.length === 0) {
            for (var v of this._columnsMap.values())
                columnsVisibility[v] = true;
        }
        if (newVisibleColumns === this._lastVisibleColumns)
            return;
        var visibleColumnsRegistry = this._visibleColumnsSetting.get();
        visibleColumnsRegistry[this.tableName] = text;
        this._visibleColumnsSetting.set(visibleColumnsRegistry);
        this._dataGrid.setColumnsVisiblity(columnsVisibility);
        this._lastVisibleColumns = newVisibleColumns;
    },

    _queryError: function(error)
    {
        this.detachChildWidgets();
        this.element.removeChildren();

        var errorMsgElement = createElement("div");
        errorMsgElement.className = "storage-table-error";
        errorMsgElement.textContent = WebInspector.UIString("An error occurred trying to\nread the “%s” table.", this.tableName);
        this.element.appendChild(errorMsgElement);
    },

    _refreshButtonClicked: function(event)
    {
        this.update();
    },

    __proto__: WebInspector.VBox.prototype
}
