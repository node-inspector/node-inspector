// Copyright 2014 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

/**
 * @constructor
 * @extends {WebInspector.VBox}
 * @param {!WebInspector.ServiceWorkerCacheModel} model
 * @param {!WebInspector.ServiceWorkerCacheModel.Cache} cache
 */
WebInspector.ServiceWorkerCacheView = function(model, cache)
{
    WebInspector.VBox.call(this);
    this.registerRequiredCSS("resources/serviceWorkerCacheViews.css");

    this._model = model;

    this.element.classList.add("service-worker-cache-data-view");
    this.element.classList.add("storage-view");

    this._createEditorToolbar();

    this._refreshButton = new WebInspector.ToolbarButton(WebInspector.UIString("Refresh"), "refresh-toolbar-item");
    this._refreshButton.addEventListener("click", this._refreshButtonClicked, this);

    this._pageSize = 50;
    this._skipCount = 0;

    this.update(cache);
    this._entries = [];
}

WebInspector.ServiceWorkerCacheView.prototype = {
    /**
     * @return {!WebInspector.DataGrid}
     */
    _createDataGrid: function()
    {
        var columns = [];
        columns.push({id: "number", title: WebInspector.UIString("#"), width: "50px"});
        columns.push({id: "request", title: WebInspector.UIString("Request")});
        columns.push({id: "response", title: WebInspector.UIString("Response")});

        var dataGrid = new WebInspector.DataGrid(columns, undefined, this._deleteButtonClicked.bind(this), this._updateData.bind(this, true));
        return dataGrid;
    },

    _createEditorToolbar: function()
    {
        var editorToolbar = new WebInspector.Toolbar(this.element);
        editorToolbar.element.classList.add("data-view-toolbar");

        this._pageBackButton = new WebInspector.ToolbarButton(WebInspector.UIString("Show previous page"), "play-backwards-toolbar-item");
        this._pageBackButton.addEventListener("click", this._pageBackButtonClicked, this);
        editorToolbar.appendToolbarItem(this._pageBackButton);

        this._pageForwardButton = new WebInspector.ToolbarButton(WebInspector.UIString("Show next page"), "play-toolbar-item");
        this._pageForwardButton.setEnabled(false);
        this._pageForwardButton.addEventListener("click", this._pageForwardButtonClicked, this);
        editorToolbar.appendToolbarItem(this._pageForwardButton);
    },

    _pageBackButtonClicked: function()
    {
        this._skipCount = Math.max(0, this._skipCount - this._pageSize);
        this._updateData(false);
    },

    _pageForwardButtonClicked: function()
    {
        this._skipCount = this._skipCount + this._pageSize;
        this._updateData(false);
    },

    /**
     * @param {!WebInspector.DataGridNode} node
     */
    _deleteButtonClicked: function(node)
    {
        this._model.deleteCacheEntry(this._cache, node.data["request"], node.remove.bind(node));
    },

    /**
     * @param {!WebInspector.ServiceWorkerCacheModel.Cache} cache
     */
    update: function(cache)
    {
        this._cache = cache;

        if (this._dataGrid)
            this._dataGrid.detach();
        this._dataGrid = this._createDataGrid();
        this._dataGrid.show(this.element);

        this._skipCount = 0;
        this._updateData(true);
    },

    /**
     * @param {number} skipCount
     * @param {!Array.<!WebInspector.ServiceWorkerCacheModel.Entry>} entries
     * @param {boolean} hasMore
     * @this {WebInspector.ServiceWorkerCacheView}
     */
    _updateDataCallback(skipCount, entries, hasMore)
    {
        this._refreshButton.setEnabled(true);
        this.clear();
        this._entries = entries;
        for (var i = 0; i < entries.length; ++i) {
            var data = {};
            data["number"] = i + skipCount;
            data["request"] = entries[i].request;
            data["response"] = entries[i].response;
            var node = new WebInspector.DataGridNode(data);
            node.selectable = true;
            this._dataGrid.rootNode().appendChild(node);
        }
        this._pageBackButton.setEnabled(!!skipCount);
        this._pageForwardButton.setEnabled(hasMore);
    },

    /**
     * @param {boolean} force
     */
    _updateData: function(force)
    {
        var pageSize = this._pageSize;
        var skipCount = this._skipCount;
        this._refreshButton.setEnabled(false);

        if (!force && this._lastPageSize === pageSize && this._lastSkipCount === skipCount)
            return;

        if (this._lastPageSize !== pageSize) {
            skipCount = 0;
            this._skipCount = 0;
        }
        this._lastPageSize = pageSize;
        this._lastSkipCount = skipCount;
        this._model.loadCacheData(this._cache, skipCount, pageSize, this._updateDataCallback.bind(this, skipCount));
    },

    _refreshButtonClicked: function(event)
    {
        this._updateData(true);
    },

    /**
     * @return {!Array.<!WebInspector.ToolbarItem>}
     */
    toolbarItems: function()
    {
        return [this._refreshButton];
    },

    clear: function()
    {
        this._dataGrid.rootNode().removeChildren();
        this._entries = [];
    },

    __proto__: WebInspector.VBox.prototype
}
