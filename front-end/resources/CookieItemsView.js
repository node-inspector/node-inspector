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

/**
 * @constructor
 * @extends {WebInspector.VBox}
 */
WebInspector.CookieItemsView = function(treeElement, cookieDomain)
{
    WebInspector.VBox.call(this);

    this.element.classList.add("storage-view");

    this._deleteButton = new WebInspector.StatusBarButton(WebInspector.UIString("Delete"), "delete-status-bar-item");
    this._deleteButton.setVisible(false);
    this._deleteButton.addEventListener("click", this._deleteButtonClicked, this);

    this._clearButton = new WebInspector.StatusBarButton(WebInspector.UIString("Clear"), "clear-status-bar-item");
    this._clearButton.setVisible(false);
    this._clearButton.addEventListener("click", this._clearButtonClicked, this);

    this._refreshButton = new WebInspector.StatusBarButton(WebInspector.UIString("Refresh"), "refresh-status-bar-item");
    this._refreshButton.addEventListener("click", this._refreshButtonClicked, this);

    this._treeElement = treeElement;
    this._cookieDomain = cookieDomain;

    this._emptyView = new WebInspector.EmptyView(cookieDomain ? WebInspector.UIString("This site has no cookies.") : WebInspector.UIString("By default cookies are disabled for local files.\nYou could override this by starting the browser with --enable-file-cookies command line flag."));
    this._emptyView.show(this.element);

    this.element.addEventListener("contextmenu", this._contextMenu.bind(this), true);
}

WebInspector.CookieItemsView.prototype = {
    /**
     * @return {!Array.<!WebInspector.StatusBarItem>}
     */
    statusBarItems: function()
    {
        return [this._refreshButton, this._clearButton, this._deleteButton];
    },

    wasShown: function()
    {
        this._update();
    },

    willHide: function()
    {
        this._deleteButton.setVisible(false);
    },

    _update: function()
    {
        WebInspector.Cookies.getCookiesAsync(this._updateWithCookies.bind(this));
    },

    /**
     * @param {!Array.<!WebInspector.Cookie>} allCookies
     */
    _updateWithCookies: function(allCookies)
    {
        this._cookies = this._filterCookiesForDomain(allCookies);

        if (!this._cookies.length) {
            // Nothing to show.
            this._emptyView.show(this.element);
            this._clearButton.setVisible(false);
            this._deleteButton.setVisible(false);
            if (this._cookiesTable)
                this._cookiesTable.detach();
            return;
        }

        if (!this._cookiesTable)
            this._cookiesTable = new WebInspector.CookiesTable(false, this._update.bind(this), this._showDeleteButton.bind(this));

        this._cookiesTable.setCookies(this._cookies);
        this._emptyView.detach();
        this._cookiesTable.show(this.element);
        this._treeElement.subtitle = String.sprintf(WebInspector.UIString("%d cookies (%s)"), this._cookies.length,
            Number.bytesToString(this._totalSize));
        this._clearButton.setVisible(true);
        this._deleteButton.setVisible(!!this._cookiesTable.selectedCookie());
    },

    /**
     * @param {!Array.<!WebInspector.Cookie>} allCookies
     */
    _filterCookiesForDomain: function(allCookies)
    {
        var cookies = [];
        var resourceURLsForDocumentURL = [];
        this._totalSize = 0;

        /**
         * @this {WebInspector.CookieItemsView}
         */
        function populateResourcesForDocuments(resource)
        {
            var url = resource.documentURL.asParsedURL();
            if (url && url.host == this._cookieDomain)
                resourceURLsForDocumentURL.push(resource.url);
        }
        WebInspector.forAllResources(populateResourcesForDocuments.bind(this));

        for (var i = 0; i < allCookies.length; ++i) {
            var pushed = false;
            var size = allCookies[i].size();
            for (var j = 0; j < resourceURLsForDocumentURL.length; ++j) {
                var resourceURL = resourceURLsForDocumentURL[j];
                if (WebInspector.Cookies.cookieMatchesResourceURL(allCookies[i], resourceURL)) {
                    this._totalSize += size;
                    if (!pushed) {
                        pushed = true;
                        cookies.push(allCookies[i]);
                    }
                }
            }
        }
        return cookies;
    },

    clear: function()
    {
        this._cookiesTable.clear();
        this._update();
    },

    _clearButtonClicked: function()
    {
        this.clear();
    },

    _showDeleteButton: function()
    {
        this._deleteButton.setVisible(true);
    },

    _deleteButtonClicked: function()
    {
        var selectedCookie = this._cookiesTable.selectedCookie();
        if (selectedCookie) {
            selectedCookie.remove();
            this._update();
        }
    },

    _refreshButtonClicked: function(event)
    {
        this._update();
    },

    _contextMenu: function(event)
    {
        if (!this._cookies.length) {
            var contextMenu = new WebInspector.ContextMenu(event);
            contextMenu.appendItem(WebInspector.UIString("Refresh"), this._update.bind(this));
            contextMenu.show();
        }
    },

    __proto__: WebInspector.VBox.prototype
}
