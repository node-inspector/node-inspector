/*
 * Copyright (C) 2006, 2007, 2008 Apple Inc.  All rights reserved.
 * Copyright (C) 2007 Matt Lilek (pewtermoose@gmail.com).
 * Copyright (C) 2009 Joseph Pecoraro
 * Copyright (C) 2011 Google Inc. All rights reserved.
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
 */
WebInspector.SearchController = function()
{
    this._element = document.createElement("table");
    this._element.className = "toolbar-search";
    this._element.cellSpacing = 0;

    this._firstRowElement = this._element.createChild("tr");
    this._secondRowElement = this._element.createChild("tr", "hidden");

    // Column 1
    var searchControlElementColumn = this._firstRowElement.createChild("td");
    this._searchControlElement = searchControlElementColumn.createChild("span", "toolbar-search-control");
    this._searchInputElement = this._searchControlElement.createChild("input", "search-replace");
    this._searchInputElement.id = "search-input-field";

    this._matchesElement = this._searchControlElement.createChild("label", "search-results-matches");
    this._matchesElement.setAttribute("for", "search-input-field");

    this._searchNavigationElement = this._searchControlElement.createChild("div", "toolbar-search-navigation-controls");
    this._toggleFilterUI(false);

    this._searchNavigationPrevElement = this._searchNavigationElement.createChild("div", "toolbar-search-navigation toolbar-search-navigation-prev");
    this._searchNavigationPrevElement.addEventListener("click", this._onPrevButtonSearch.bind(this), false);
    this._searchNavigationPrevElement.title = WebInspector.UIString("Search Previous");

    this._searchNavigationNextElement = this._searchNavigationElement.createChild("div", "toolbar-search-navigation toolbar-search-navigation-next");
    this._searchNavigationNextElement.addEventListener("click", this._onNextButtonSearch.bind(this), false);
    this._searchNavigationNextElement.title = WebInspector.UIString("Search Next");

    this._searchInputElement.addEventListener("mousedown", this._onSearchFieldManualFocus.bind(this), false); // when the search field is manually selected
    this._searchInputElement.addEventListener("keydown", this._onKeyDown.bind(this), true);
    this._searchInputElement.addEventListener("input", this._onInput.bind(this), false);

    this._replaceInputElement = this._secondRowElement.createChild("td").createChild("input", "search-replace toolbar-replace-control");
    this._replaceInputElement.addEventListener("keydown", this._onKeyDown.bind(this), true);
    this._replaceInputElement.placeholder = WebInspector.UIString("Replace");

    // Column 2
    this._findButtonElement = this._firstRowElement.createChild("td").createChild("button", "hidden");
    this._findButtonElement.textContent = WebInspector.UIString("Find");
    this._findButtonElement.tabIndex = -1;
    this._findButtonElement.addEventListener("click", this._onNextButtonSearch.bind(this), false);

    this._replaceButtonElement = this._secondRowElement.createChild("td").createChild("button");
    this._replaceButtonElement.textContent = WebInspector.UIString("Replace");
    this._replaceButtonElement.disabled = true;
    this._replaceButtonElement.tabIndex = -1;
    this._replaceButtonElement.addEventListener("click", this._replace.bind(this), false);

    // Column 3
    this._prevButtonElement = this._firstRowElement.createChild("td").createChild("button", "hidden");
    this._prevButtonElement.textContent = WebInspector.UIString("Previous");
    this._prevButtonElement.disabled = true;
    this._prevButtonElement.tabIndex = -1;
    this._prevButtonElement.addEventListener("click", this._onPrevButtonSearch.bind(this), false);

    this._replaceAllButtonElement = this._secondRowElement.createChild("td").createChild("button");
    this._replaceAllButtonElement.textContent = WebInspector.UIString("Replace All");
    this._replaceAllButtonElement.addEventListener("click", this._replaceAll.bind(this), false);

    // Column 4
    this._replaceElement = this._firstRowElement.createChild("td").createChild("span");

    this._replaceCheckboxElement = this._replaceElement.createChild("input");
    this._replaceCheckboxElement.type = "checkbox";
    this._replaceCheckboxElement.id = "search-replace-trigger";
    this._replaceCheckboxElement.addEventListener("click", this._updateSecondRowVisibility.bind(this), false);

    this._replaceLabelElement = this._replaceElement.createChild("label");
    this._replaceLabelElement.textContent = WebInspector.UIString("Replace");
    this._replaceLabelElement.setAttribute("for", "search-replace-trigger");

    // Column 5
    this._filterCheckboxContainer = this._firstRowElement.createChild("td").createChild("label");
    this._filterCheckboxContainer.setAttribute("for", "filter-trigger");

    this._filterCheckboxElement = this._filterCheckboxContainer.createChild("input");
    this._filterCheckboxElement.type = "checkbox";
    this._filterCheckboxElement.id = "filter-trigger";
    this._filterCheckboxElement.addEventListener("click", this._filterCheckboxClick.bind(this), false);

    this._filterCheckboxContainer.createTextChild(WebInspector.UIString("Filter"));

    // Column 6
    var cancelButtonElement = this._firstRowElement.createChild("td").createChild("button");
    cancelButtonElement.textContent = WebInspector.UIString("Cancel");
    cancelButtonElement.tabIndex = -1;
    cancelButtonElement.addEventListener("click", this.closeSearch.bind(this), false);
}

WebInspector.SearchController.prototype = {
    /**
     * @param {number} matches
     * @param {WebInspector.Searchable} provider
     */
    updateSearchMatchesCount: function(matches, provider)
    {
        provider.currentSearchMatches = matches;

        if (provider === this._searchProvider)
            this._updateSearchMatchesCountAndCurrentMatchIndex(provider.currentQuery ? matches : 0, -1);
    },

    /**
     * @param {number} currentMatchIndex
     * @param {WebInspector.Searchable} provider
     */
    updateCurrentMatchIndex: function(currentMatchIndex, provider)
    {
        if (provider === this._searchProvider)
            this._updateSearchMatchesCountAndCurrentMatchIndex(provider.currentSearchMatches, currentMatchIndex);
    },

    isSearchVisible: function()
    {
        return this._searchIsVisible;
    },

    closeSearch: function()
    {
        this.cancelSearch();
        WebInspector.setCurrentFocusElement(WebInspector.previousFocusElement());
    },

    cancelSearch: function()
    {
        if (!this._searchIsVisible)
            return;
        if (this._filterCheckboxElement.checked) {
            this._filterCheckboxElement.checked = false;
            this._toggleFilterUI(false);
            this.resetFilter();
        } else
            this.resetSearch();
        delete this._searchIsVisible;
        this._searchHost.setFooterElement(null);
        this.resetSearch();
        delete this._searchHost;
        delete this._searchProvider;
    },

    resetSearch: function()
    {
        this._clearSearch();
        this._updateReplaceVisibility();
        this._matchesElement.textContent = "";
    },

    /**
     * @param {Event} event
     * @return {boolean}
     */
    handleShortcut: function(event)
    {
        var isMac = WebInspector.isMac();

        switch (event.keyIdentifier) {
            case "U+0046": // F key
                if (isMac)
                    var isFindKey = event.metaKey && !event.ctrlKey && !event.altKey && !event.shiftKey;
                else
                    var isFindKey = event.ctrlKey && !event.metaKey && !event.altKey && !event.shiftKey;

                if (isFindKey) {
                    this.showSearchField();
                    event.consume(true);
                    return true;
                }
                break;

            case "F3":
                if (!isMac) {
                    this.showSearchField();
                    event.consume(true);
                    return true;
                }
                break;

            case "U+0047": // G key
                if (isMac && event.metaKey && !event.ctrlKey && !event.altKey && this._searchHost) {
                    if (event.shiftKey)
                        this._searchProvider.jumpToPreviousSearchResult();
                    else
                        this._searchProvider.jumpToNextSearchResult();
                    event.consume(true);
                    return true;
                }
                break;
        }
        return false;
    },

    /**
     * @param {boolean} enabled
     */
    _updateSearchNavigationButtonState: function(enabled)
    {
        this._replaceButtonElement.disabled = !enabled;
        this._prevButtonElement.disabled = !enabled;
        if (enabled) {
            this._searchNavigationPrevElement.addStyleClass("enabled");
            this._searchNavigationNextElement.addStyleClass("enabled");
        } else {
            this._searchNavigationPrevElement.removeStyleClass("enabled");
            this._searchNavigationNextElement.removeStyleClass("enabled");
        }
    },

    /**
     * @param {number} matches
     * @param {number} currentMatchIndex
     */
    _updateSearchMatchesCountAndCurrentMatchIndex: function(matches, currentMatchIndex)
    {
        if (!this._currentQuery)
            this._matchesElement.textContent = "";
        else if (matches === 0 || currentMatchIndex >= 0)
            this._matchesElement.textContent = WebInspector.UIString("%d of %d", currentMatchIndex + 1, matches);
        else if (matches === 1)
            this._matchesElement.textContent = WebInspector.UIString("1 match");
        else
            this._matchesElement.textContent = WebInspector.UIString("%d matches", matches);
        this._updateSearchNavigationButtonState(matches > 0);
    },

    showSearchField: function()
    {
        if (this._searchIsVisible)
            this.cancelSearch();

        if (WebInspector.drawer.element.isAncestor(document.activeElement) && WebInspector.drawer.getSearchProvider())
            this._searchHost = WebInspector.drawer;
        else
            this._searchHost = WebInspector.inspectorView;

        this._searchProvider = this._searchHost.getSearchProvider();
        this._searchHost.setFooterElement(this._element);

        this._updateReplaceVisibility();
        this._updateFilterVisibility();
        if (WebInspector.currentFocusElement() !== this._searchInputElement) {
            var selection = window.getSelection();
            if (selection.rangeCount) {
                var queryCandidate = selection.toString().replace(/\r?\n.*/, "");
                if (queryCandidate)
                    this._searchInputElement.value = queryCandidate;
            }
        }
        this._performSearch(false, false);
        this._searchInputElement.focus();
        this._searchInputElement.select();
        this._searchIsVisible = true;
    },

    /**
     * @param {boolean} filter
     */
    _toggleFilterUI: function(filter)
    {
        this._matchesElement.enableStyleClass("hidden", filter);
        this._searchNavigationElement.enableStyleClass("hidden", filter);
        this._searchInputElement.placeholder = filter ? WebInspector.UIString("Filter") : WebInspector.UIString("Find");
    },

    _updateFilterVisibility: function()
    {
        if (this._searchProvider.canFilter())
            this._filterCheckboxContainer.removeStyleClass("hidden");
        else
            this._filterCheckboxContainer.addStyleClass("hidden");
    },

    _updateReplaceVisibility: function()
    {
        if (!this._searchProvider)
            return;

        if (this._searchProvider.canSearchAndReplace())
            this._replaceElement.removeStyleClass("hidden");
        else {
            this._replaceElement.addStyleClass("hidden");
            this._replaceCheckboxElement.checked = false;
            this._updateSecondRowVisibility();
        }
    },

    /**
     * @param {Event} event
     */
    _onSearchFieldManualFocus: function(event)
    {
        WebInspector.setCurrentFocusElement(event.target);
    },

    /**
     * @param {KeyboardEvent} event
     */
    _onKeyDown: function(event)
    {
        if (isEnterKey(event)) {
            if (event.target === this._searchInputElement) {
                // FIXME: This won't start backwards search with Shift+Enter correctly.
                if (!this._currentQuery)
                    this._performSearch(true, true);
                else
                    this._jumpToNextSearchResult(event.shiftKey);
            } else if (event.target === this._replaceInputElement)
                this._replace();
        }
    },

    /**
     * @param {boolean=} isBackwardSearch
     */
    _jumpToNextSearchResult: function(isBackwardSearch)
    {
        if (!this._currentQuery || !this._searchNavigationPrevElement.hasStyleClass("enabled"))
            return;

        if (isBackwardSearch)
            this._searchProvider.jumpToPreviousSearchResult();
        else
            this._searchProvider.jumpToNextSearchResult();
    },

    _onNextButtonSearch: function(event)
    {
        if (!this._searchNavigationNextElement.hasStyleClass("enabled"))
            return;
        // Simulate next search on search-navigation-button click.
        this._jumpToNextSearchResult();
        this._searchInputElement.focus();
    },

    _onPrevButtonSearch: function(event)
    {
        if (!this._searchNavigationPrevElement.hasStyleClass("enabled"))
            return;
        // Simulate previous search on search-navigation-button click.
        this._jumpToNextSearchResult(true);
        this._searchInputElement.focus();
    },

    _clearSearch: function()
    {
        delete this._currentQuery;
        if (this._searchHost){
            var searchProvider = this._searchHost.getSearchProvider();
            if (searchProvider && !!searchProvider.currentQuery) {
                delete searchProvider.currentQuery;
                searchProvider.searchCanceled();
            }
        }
        this._updateSearchMatchesCountAndCurrentMatchIndex(0, -1);
    },

    /**
     * @param {boolean} forceSearch
     * @param {boolean} shouldJump
     */
    _performSearch: function(forceSearch, shouldJump)
    {
        var query = this._searchInputElement.value;
        var minimalSearchQuerySize = this._searchProvider.minimalSearchQuerySize();
        if (!query || !this._searchProvider || (!forceSearch && query.length < minimalSearchQuerySize && !this._currentQuery)) {
            this._clearSearch();
            return;
        }

        this._currentQuery = query;
        this._searchProvider.currentQuery = query;
        this._searchProvider.performSearch(query, shouldJump);
    },

    _updateSecondRowVisibility: function()
    {
        if (!this._searchIsVisible || !this._searchHost)
            return;
        if (this._replaceCheckboxElement.checked) {
            this._element.addStyleClass("toolbar-search-replace");
            this._secondRowElement.removeStyleClass("hidden");
            this._prevButtonElement.removeStyleClass("hidden");
            this._findButtonElement.removeStyleClass("hidden");
            this._replaceCheckboxElement.tabIndex = -1;
            this._replaceInputElement.focus();
        } else {
            this._element.removeStyleClass("toolbar-search-replace");
            this._secondRowElement.addStyleClass("hidden");
            this._prevButtonElement.addStyleClass("hidden");
            this._findButtonElement.addStyleClass("hidden");
            this._replaceCheckboxElement.tabIndex = 0;
            this._searchInputElement.focus();
        }
        this._searchHost.setFooterElement(this._element);
    },

    _replace: function()
    {
        this._searchProvider.replaceSelectionWith(this._replaceInputElement.value);
        delete this._currentQuery;
        this._performSearch(true, true);
    },

    _replaceAll: function()
    {
        this._searchProvider.replaceAllWith(this._searchInputElement.value, this._replaceInputElement.value);
    },

    _filterCheckboxClick: function()
    {
        this._searchInputElement.focus();
        this._searchInputElement.select();

        if (this._filterCheckboxElement.checked) {
            this._toggleFilterUI(true);
            this.resetSearch();
            this._performFilter(this._searchInputElement.value);
        } else {
            this._toggleFilterUI(false);
            this.resetFilter();
            this._performSearch(false, false);
        }
    },

    /**
     * @param {string} query
     */
    _performFilter: function(query)
    {
        this._searchProvider.performFilter(query);
    },

    _onInput: function(event)
    {
        if (this._filterCheckboxElement.checked)
            this._performFilter(event.target.value);
        else
            this._performSearch(false, true);
    },

    resetFilter: function()
    {
        this._performFilter("");
    }
}

/**
 * @type {?WebInspector.SearchController}
 */
WebInspector.searchController = null;

/**
 * @interface
 */
WebInspector.Searchable = function()
{
}

WebInspector.Searchable.prototype = {
    /**
     * @return {boolean}
     */
    canSearchAndReplace: function() { },

    /**
     * @return {boolean}
     */
    canFilter: function() { },

    searchCanceled: function() { },

    /**
     * @param {string} query
     * @param {boolean} shouldJump
     * @param {WebInspector.Searchable=} self
     */
    performSearch: function(query, shouldJump, self) { },

    /**
     * @return {number}
     */
    minimalSearchQuerySize: function() { },

    /**
     * @param {WebInspector.Searchable=} self
     */
    jumpToNextSearchResult: function(self) { },

    /**
     * @param {WebInspector.Searchable=} self
     */
    jumpToPreviousSearchResult: function(self) { },
}
