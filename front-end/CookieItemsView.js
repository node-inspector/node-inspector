/*
 * Copyright (C) 2009 Apple Inc.  All rights reserved.
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

WebInspector.CookieItemsView = function(treeElement, cookieDomain)
{
    WebInspector.View.call(this);

    this.element.addStyleClass("storage-view");
    this.element.addStyleClass("table");

    this.deleteButton = new WebInspector.StatusBarButton(WebInspector.UIString("Delete"), "delete-storage-status-bar-item");
    this.deleteButton.visible = false;
    this.deleteButton.addEventListener("click", this._deleteButtonClicked.bind(this), false);

    this.refreshButton = new WebInspector.StatusBarButton(WebInspector.UIString("Refresh"), "refresh-storage-status-bar-item");
    this.refreshButton.addEventListener("click", this._refreshButtonClicked.bind(this), false);
    
    this._treeElement = treeElement;
    this._cookieDomain = cookieDomain;

    this._emptyMsgElement = document.createElement("div");
    this._emptyMsgElement.className = "storage-table-empty";
    this._emptyMsgElement.textContent = WebInspector.UIString("This site has no cookies.");
    this.element.appendChild(this._emptyMsgElement);
}

WebInspector.CookieItemsView.prototype = {
    get statusBarItems()
    {
        return [this.refreshButton.element, this.deleteButton.element];
    },

    show: function(parentElement)
    {
        WebInspector.View.prototype.show.call(this, parentElement);
        this._update();
    },

    hide: function()
    {
        WebInspector.View.prototype.hide.call(this);
        this.deleteButton.visible = false;
    },

    _update: function()
    {
        WebInspector.Cookies.getCookiesAsync(this._updateWithCookies.bind(this));
    },

    _updateWithCookies: function(allCookies, isAdvanced)
    {
        if (isAdvanced)
            this._filterCookiesForDomain(allCookies);
        else
            this._cookies = allCookies;

        if (!this._cookies.length) {
            // Nothing to show.
            this._emptyMsgElement.removeStyleClass("hidden");
            this.deleteButton.visible = false;
            if (this._dataGrid)
                this._dataGrid.element.addStyleClass("hidden");
            return;
        }

        if (!this._dataGrid) {
            if (isAdvanced) {
                this._createDataGrid();
                this._populateDataGrid();
                this._dataGrid.autoSizeColumns(6, 33);
                this._treeElement.subtitle = String.sprintf(WebInspector.UIString("%d cookies (%s)"), this._cookies.length,
                    Number.bytesToString(this._totalSize, WebInspector.UIString));
            } else {
                this._createSimpleDataGrid();
                this._populateSimpleDataGrid();
                this._dataGrid.autoSizeColumns(20, 80);
            }
        } else {
            if (isAdvanced)
                this._populateDataGrid();
            else
                this._populateSimpleDataGrid();
        }

        this._dataGrid.element.removeStyleClass("hidden");
        this._emptyMsgElement.addStyleClass("hidden");
        if (isAdvanced)
            this.deleteButton.visible = true;
    },

    _filterCookiesForDomain: function(allCookies)
    {
        this._cookies = [];
        var resourceURLsForDocumentURL = [];
        this._totalSize = 0;

        for (var id in WebInspector.resources) {
            var resource = WebInspector.resources[id];
            var match = resource.documentURL.match(WebInspector.GenericURLRegExp);
            if (match && match[2] === this._cookieDomain)
                resourceURLsForDocumentURL.push(resource.url);
        }

        for (var i = 0; i < allCookies.length; ++i) {
            var pushed = false;
            var size = allCookies[i].size;
            for (var j = 0; j < resourceURLsForDocumentURL.length; ++j) {
                var resourceURL = resourceURLsForDocumentURL[j];
                if (WebInspector.Cookies.cookieMatchesResourceURL(allCookies[i], resourceURL)) {
                    this._totalSize += size;
                    if (!pushed) {
                        pushed = true;
                        this._cookies.push(allCookies[i]);
                    }
                }
            }
        }
    },

    _createDataGrid: function()
    {
        var columns = { 0: {}, 1: {}, 2: {}, 3: {}, 4: {}, 5: {}, 6: {}, 7: {} };
        columns[0].title = WebInspector.UIString("Name");
        columns[0].sortable = true;
        columns[1].title = WebInspector.UIString("Value");
        columns[1].sortable = true;
        columns[2].title = WebInspector.UIString("Domain");
        columns[2].sortable = true;
        columns[3].title = WebInspector.UIString("Path");
        columns[3].sortable = true;
        columns[4].title = WebInspector.UIString("Expires");
        columns[4].sortable = true;
        columns[5].title = WebInspector.UIString("Size");
        columns[5].aligned = "right";
        columns[5].sortable = true;
        columns[6].title = WebInspector.UIString("HTTP");
        columns[6].aligned = "centered";
        columns[6].sortable = true;
        columns[7].title = WebInspector.UIString("Secure");
        columns[7].aligned = "centered";
        columns[7].sortable = true;

        this._dataGrid = new WebInspector.DataGrid(columns, null, this._deleteCookieCallback.bind(this));
        this._dataGrid.addEventListener("sorting changed", this._populateDataGrid, this);
        this.element.appendChild(this._dataGrid.element);
        this._dataGrid.updateWidths();
    },

    _populateDataGrid: function()
    {
        var selectedCookie = this._dataGrid.selectedNode ? this._dataGrid.selectedNode.cookie : null;
        var sortDirection = this._dataGrid.sortOrder === "ascending" ? 1 : -1;

        function localeCompare(field, cookie1, cookie2)
        {
            return sortDirection * (cookie1[field] + "").localeCompare(cookie2[field] + "")
        }

        function numberCompare(field, cookie1, cookie2)
        {
            return sortDirection * (cookie1[field] - cookie2[field]);
        }

        function expiresCompare(cookie1, cookie2)
        {
            if (cookie1.session !== cookie2.session)
                return sortDirection * (cookie1.session ? 1 : -1);

            if (cookie1.session)
                return 0;

            return sortDirection * (cookie1.expires - cookie2.expires);
        }

        var comparator;
        switch (parseInt(this._dataGrid.sortColumnIdentifier)) {
            case 0: comparator = localeCompare.bind(this, "name"); break;
            case 1: comparator = localeCompare.bind(this, "value"); break;
            case 2: comparator = localeCompare.bind(this, "domain"); break;
            case 3: comparator = localeCompare.bind(this, "path"); break;
            case 4: comparator = expiresCompare; break;
            case 5: comparator = numberCompare.bind(this, "size"); break;
            case 6: comparator = localeCompare.bind(this, "httpOnly"); break;
            case 7: comparator = localeCompare.bind(this, "secure"); break;
            default: localeCompare.bind(this, "name");
        }

        this._cookies.sort(comparator);

        this._dataGrid.removeChildren();
        var nodeToSelect;
        for (var i = 0; i < this._cookies.length; ++i) {
            var data = {};
            var cookie = this._cookies[i];
            data[0] = cookie.name;
            data[1] = cookie.value;
            data[2] = cookie.domain;
            data[3] = cookie.path;
            data[4] = (cookie.session ? WebInspector.UIString("Session") : new Date(cookie.expires).toGMTString());
            data[5] = Number.bytesToString(cookie.size, WebInspector.UIString);
            data[6] = (cookie.httpOnly ? "\u2713" : ""); // Checkmark
            data[7] = (cookie.secure ? "\u2713" : ""); // Checkmark

            var node = new WebInspector.DataGridNode(data);
            node.cookie = cookie;
            node.selectable = true;
            this._dataGrid.appendChild(node);
            if (cookie === selectedCookie)
                nodeToSelect = node;
        }
        if (nodeToSelect)
            nodeToSelect.selected = true;
        else
            this._dataGrid.children[0].selected = true;
    },

    _createSimpleDataGrid: function()
    {
        var columns = {};
        columns[0] = {};
        columns[1] = {};
        columns[0].title = WebInspector.UIString("Name");
        columns[1].title = WebInspector.UIString("Value");

        this._dataGrid = new WebInspector.DataGrid(columns);
        this.element.appendChild(this._dataGrid.element);
        this._dataGrid.updateWidths();
    },

    _populateSimpleDataGrid: function()
    {
        var cookies = this._cookies;
        this._dataGrid.removeChildren();
        var addedCookies = {};
        for (var i = 0; i < cookies.length; ++i) {
            if (addedCookies[cookies[i].name])
                continue;
            addedCookies[cookies[i].name] = true;
            var data = {};
            data[0] = cookies[i].name;
            data[1] = cookies[i].value;

            var node = new WebInspector.DataGridNode(data, false);
            node.selectable = true;
            this._dataGrid.appendChild(node);
        }
        this._dataGrid.children[0].selected = true;
    },

    resize: function()
    {
        if (this._dataGrid)
            this._dataGrid.updateWidths();
    },

    _deleteButtonClicked: function(event)
    {
        if (!this._dataGrid || !this._dataGrid.selectedNode)
            return;

        this._deleteCookieCallback(this._dataGrid.selectedNode);
    },

    _deleteCookieCallback: function(node)
    {
        var cookie = node.cookie;
        InspectorBackend.deleteCookie(cookie.name, this._cookieDomain);
        this._update();
    },

    _refreshButtonClicked: function(event)
    {
        this._update();
    }
}

WebInspector.CookieItemsView.prototype.__proto__ = WebInspector.View.prototype;
