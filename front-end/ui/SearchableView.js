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
 * @extends {WebInspector.VBox}
 * @param {!WebInspector.Searchable} searchable
 * @param {string=} settingName
 */
WebInspector.SearchableView = function(searchable, settingName)
{
    WebInspector.VBox.call(this, true);
    this.registerRequiredCSS("ui/searchableView.css");

    this._searchProvider = searchable;
    this._settingName = settingName;

    this.element.addEventListener("keydown", this._onKeyDown.bind(this), false);

    this.contentElement.createChild("content");
    this._footerElementContainer = this.contentElement.createChild("div", "search-bar hidden");
    this._footerElementContainer.style.order = 100;

    var toolbar = new WebInspector.StatusBar(this._footerElementContainer);
    toolbar.makeNarrow();

    if (this._searchProvider.supportsCaseSensitiveSearch()) {
        this._caseSensitiveButton = new WebInspector.StatusBarTextButton(WebInspector.UIString("Case sensitive"), "case-sensitive-search-status-bar-item", "Aa", 2);
        this._caseSensitiveButton.addEventListener("click", this._toggleCaseSensitiveSearch, this);
        toolbar.appendStatusBarItem(this._caseSensitiveButton);
    }

    if (this._searchProvider.supportsRegexSearch()) {
        this._regexButton = new WebInspector.StatusBarTextButton(WebInspector.UIString("Regex"), "regex-search-status-bar-item", ".*", 2);
        this._regexButton.addEventListener("click", this._toggleRegexSearch, this);
        toolbar.appendStatusBarItem(this._regexButton);
    }

    this._footerElement = this._footerElementContainer.createChild("table", "toolbar-search");
    this._footerElement.cellSpacing = 0;

    this._firstRowElement = this._footerElement.createChild("tr");
    this._secondRowElement = this._footerElement.createChild("tr", "hidden");

    // Column 1
    var searchControlElementColumn = this._firstRowElement.createChild("td");
    this._searchControlElement = searchControlElementColumn.createChild("span", "toolbar-search-control");
    this._searchInputElement = this._searchControlElement.createChild("input", "search-replace");
    this._searchInputElement.id = "search-input-field";
    this._searchInputElement.placeholder = WebInspector.UIString("Find");

    this._matchesElement = this._searchControlElement.createChild("label", "search-results-matches");
    this._matchesElement.setAttribute("for", "search-input-field");

    this._searchNavigationElement = this._searchControlElement.createChild("div", "toolbar-search-navigation-controls");

    this._searchNavigationPrevElement = this._searchNavigationElement.createChild("div", "toolbar-search-navigation toolbar-search-navigation-prev");
    this._searchNavigationPrevElement.addEventListener("click", this._onPrevButtonSearch.bind(this), false);
    this._searchNavigationPrevElement.title = WebInspector.UIString("Search Previous");

    this._searchNavigationNextElement = this._searchNavigationElement.createChild("div", "toolbar-search-navigation toolbar-search-navigation-next");
    this._searchNavigationNextElement.addEventListener("click", this._onNextButtonSearch.bind(this), false);
    this._searchNavigationNextElement.title = WebInspector.UIString("Search Next");

    this._searchInputElement.addEventListener("mousedown", this._onSearchFieldManualFocus.bind(this), false); // when the search field is manually selected
    this._searchInputElement.addEventListener("keydown", this._onSearchKeyDown.bind(this), true);
    this._searchInputElement.addEventListener("input", this._onInput.bind(this), false);

    this._replaceInputElement = this._secondRowElement.createChild("td").createChild("input", "search-replace toolbar-replace-control");
    this._replaceInputElement.addEventListener("keydown", this._onReplaceKeyDown.bind(this), true);
    this._replaceInputElement.placeholder = WebInspector.UIString("Replace");

    // Column 2
    this._findButtonElement = this._firstRowElement.createChild("td").createChild("button", "search-action-button hidden");
    this._findButtonElement.textContent = WebInspector.UIString("Find");
    this._findButtonElement.tabIndex = -1;
    this._findButtonElement.addEventListener("click", this._onFindClick.bind(this), false);

    this._replaceButtonElement = this._secondRowElement.createChild("td").createChild("button", "search-action-button");
    this._replaceButtonElement.textContent = WebInspector.UIString("Replace");
    this._replaceButtonElement.disabled = true;
    this._replaceButtonElement.tabIndex = -1;
    this._replaceButtonElement.addEventListener("click", this._replace.bind(this), false);

    // Column 3
    this._prevButtonElement = this._firstRowElement.createChild("td").createChild("button", "search-action-button hidden");
    this._prevButtonElement.textContent = WebInspector.UIString("Previous");
    this._prevButtonElement.tabIndex = -1;
    this._prevButtonElement.addEventListener("click", this._onPreviousClick.bind(this), false);

    this._replaceAllButtonElement = this._secondRowElement.createChild("td").createChild("button", "search-action-button");
    this._replaceAllButtonElement.textContent = WebInspector.UIString("Replace All");
    this._replaceAllButtonElement.addEventListener("click", this._replaceAll.bind(this), false);

    // Column 4
    this._replaceElement = this._firstRowElement.createChild("td").createChild("span");

    this._replaceCheckboxElement = this._replaceElement.createChild("input");
    this._replaceCheckboxElement.type = "checkbox";
    this._uniqueId = ++WebInspector.SearchableView._lastUniqueId;
    var replaceCheckboxId = "search-replace-trigger" + this._uniqueId;
    this._replaceCheckboxElement.id = replaceCheckboxId;
    this._replaceCheckboxElement.addEventListener("change", this._updateSecondRowVisibility.bind(this), false);

    this._replaceLabelElement = this._replaceElement.createChild("label");
    this._replaceLabelElement.textContent = WebInspector.UIString("Replace");
    this._replaceLabelElement.setAttribute("for", replaceCheckboxId);

    // Column 5
    var cancelButtonElement = this._firstRowElement.createChild("td").createChild("button", "search-action-button");
    cancelButtonElement.textContent = WebInspector.UIString("Cancel");
    cancelButtonElement.tabIndex = -1;
    cancelButtonElement.addEventListener("click", this.closeSearch.bind(this), false);
    this._minimalSearchQuerySize = 3;

    this._registerShortcuts();
    this._loadSetting();
}

WebInspector.SearchableView._lastUniqueId = 0;

/**
 * @return {!Array.<!WebInspector.KeyboardShortcut.Descriptor>}
 */
WebInspector.SearchableView.findShortcuts = function()
{
    if (WebInspector.SearchableView._findShortcuts)
        return WebInspector.SearchableView._findShortcuts;
    WebInspector.SearchableView._findShortcuts = [WebInspector.KeyboardShortcut.makeDescriptor("f", WebInspector.KeyboardShortcut.Modifiers.CtrlOrMeta)];
    if (!WebInspector.isMac())
        WebInspector.SearchableView._findShortcuts.push(WebInspector.KeyboardShortcut.makeDescriptor(WebInspector.KeyboardShortcut.Keys.F3));
    return WebInspector.SearchableView._findShortcuts;
}

/**
 * @return {!Array.<!WebInspector.KeyboardShortcut.Descriptor>}
 */
WebInspector.SearchableView.cancelSearchShortcuts = function()
{
    if (WebInspector.SearchableView._cancelSearchShortcuts)
        return WebInspector.SearchableView._cancelSearchShortcuts;
    WebInspector.SearchableView._cancelSearchShortcuts = [WebInspector.KeyboardShortcut.makeDescriptor(WebInspector.KeyboardShortcut.Keys.Esc)];
    return WebInspector.SearchableView._cancelSearchShortcuts;
}

/**
 * @return {!Array.<!WebInspector.KeyboardShortcut.Descriptor>}
 */
WebInspector.SearchableView.findNextShortcut = function()
{
    if (WebInspector.SearchableView._findNextShortcut)
        return WebInspector.SearchableView._findNextShortcut;
    WebInspector.SearchableView._findNextShortcut = [];
    if (WebInspector.isMac())
        WebInspector.SearchableView._findNextShortcut.push(WebInspector.KeyboardShortcut.makeDescriptor("g", WebInspector.KeyboardShortcut.Modifiers.Meta));
    return WebInspector.SearchableView._findNextShortcut;
}

/**
 * @return {!Array.<!WebInspector.KeyboardShortcut.Descriptor>}
 */
WebInspector.SearchableView.findPreviousShortcuts = function()
{
    if (WebInspector.SearchableView._findPreviousShortcuts)
        return WebInspector.SearchableView._findPreviousShortcuts;
    WebInspector.SearchableView._findPreviousShortcuts = [];
    if (WebInspector.isMac())
        WebInspector.SearchableView._findPreviousShortcuts.push(WebInspector.KeyboardShortcut.makeDescriptor("g", WebInspector.KeyboardShortcut.Modifiers.Meta | WebInspector.KeyboardShortcut.Modifiers.Shift));
    return WebInspector.SearchableView._findPreviousShortcuts;
}

WebInspector.SearchableView.prototype = {
    _toggleCaseSensitiveSearch: function()
    {
        this._caseSensitiveButton.setToggled(!this._caseSensitiveButton.toggled());
        this._saveSetting();
        this._performSearch(false, true);
    },

    _toggleRegexSearch: function()
    {
        this._regexButton.setToggled(!this._regexButton.toggled());
        this._saveSetting();
        this._performSearch(false, true);
    },

    /**
     * @return {?WebInspector.Setting}
     */
    _setting: function()
    {
        if (!this._settingName)
            return null;
        if (!WebInspector.settings[this._settingName])
            WebInspector.settings[this._settingName] = WebInspector.settings.createSetting(this._settingName, {});
        return WebInspector.settings[this._settingName];
    },

    _saveSetting: function()
    {
        var setting = this._setting();
        if (!setting)
            return;
        var settingValue = setting.get() || {};
        settingValue.caseSensitive = this._caseSensitiveButton.toggled();
        settingValue.isRegex = this._regexButton.toggled();
        setting.set(settingValue);
    },

    _loadSetting: function()
    {
        var settingValue = this._setting() ? (this._setting().get() || {}) : {};
        if (this._searchProvider.supportsCaseSensitiveSearch())
            this._caseSensitiveButton.setToggled(!!settingValue.caseSensitive);
        if (this._searchProvider.supportsRegexSearch())
            this._regexButton.setToggled(!!settingValue.isRegex);
    },

    /**
     * @return {!Element}
     */
    defaultFocusedElement: function()
    {
        var children = this.children();
        for (var i = 0; i < children.length; ++i) {
            var element = children[i].defaultFocusedElement();
            if (element)
                return element;
        }
        return WebInspector.View.prototype.defaultFocusedElement.call(this);
    },

    /**
     * @param {!Event} event
     */
    _onKeyDown: function(event)
    {
        var shortcutKey = WebInspector.KeyboardShortcut.makeKeyFromEvent(/**@type {!KeyboardEvent}*/(event));
        var handler = this._shortcuts[shortcutKey];
        if (handler && handler(event))
            event.consume(true);
    },

    _registerShortcuts: function()
    {
        this._shortcuts = {};

        /**
         * @param {!Array.<!WebInspector.KeyboardShortcut.Descriptor>} shortcuts
         * @param {function()} handler
         * @this {WebInspector.SearchableView}
         */
        function register(shortcuts, handler)
        {
            for (var i = 0; i < shortcuts.length; ++i)
                this._shortcuts[shortcuts[i].key] = handler;
        }

        register.call(this, WebInspector.SearchableView.findShortcuts(), this.handleFindShortcut.bind(this));
        register.call(this, WebInspector.SearchableView.cancelSearchShortcuts(), this.handleCancelSearchShortcut.bind(this));
        register.call(this, WebInspector.SearchableView.findNextShortcut(), this.handleFindNextShortcut.bind(this));
        register.call(this, WebInspector.SearchableView.findPreviousShortcuts(), this.handleFindPreviousShortcut.bind(this));
    },

    /**
     * @param {number} minimalSearchQuerySize
     */
    setMinimalSearchQuerySize: function(minimalSearchQuerySize)
    {
        this._minimalSearchQuerySize = minimalSearchQuerySize;
    },

    /**
     * @param {boolean} replaceable
     */
    setReplaceable: function(replaceable)
    {
        this._replaceable = replaceable;
    },

    /**
     * @param {number} matches
     */
    updateSearchMatchesCount: function(matches)
    {
        this._searchProvider.currentSearchMatches = matches;
        this._updateSearchMatchesCountAndCurrentMatchIndex(this._searchProvider.currentQuery ? matches : 0, -1);
    },

    /**
     * @param {number} currentMatchIndex
     */
    updateCurrentMatchIndex: function(currentMatchIndex)
    {
        this._updateSearchMatchesCountAndCurrentMatchIndex(this._searchProvider.currentSearchMatches, currentMatchIndex);
    },

    /**
     * @return {boolean}
     */
    isSearchVisible: function()
    {
        return this._searchIsVisible;
    },

    closeSearch: function()
    {
        this.cancelSearch();
        if (WebInspector.currentFocusElement() && WebInspector.currentFocusElement().isDescendant(this._footerElementContainer))
            this.focus();
    },

    _toggleSearchBar: function(toggled)
    {
        this._footerElementContainer.classList.toggle("hidden", !toggled);
        this.doResize();
    },

    cancelSearch: function()
    {
        if (!this._searchIsVisible)
            return;
        this.resetSearch();
        delete this._searchIsVisible;
        this._toggleSearchBar(false);
    },

    resetSearch: function()
    {
        this._clearSearch();
        this._updateReplaceVisibility();
        this._matchesElement.textContent = "";
    },

    refreshSearch: function()
    {
        if (!this._searchIsVisible)
            return;
        this.resetSearch();
        this._performSearch(false, false);
    },

    /**
     * @return {boolean}
     */
    handleFindNextShortcut: function()
    {
        if (!this._searchIsVisible)
            return false;
        this._searchProvider.jumpToNextSearchResult();
        return true;
    },

    /**
     * @return {boolean}
     */
    handleFindPreviousShortcut: function()
    {
        if (!this._searchIsVisible)
            return false;
        this._searchProvider.jumpToPreviousSearchResult();
        return true;
    },

    /**
     * @return {boolean}
     */
    handleFindShortcut: function()
    {
        this.showSearchField();
        return true;
    },

    /**
     * @return {boolean}
     */
    handleCancelSearchShortcut: function()
    {
        if (!this._searchIsVisible)
            return false;
        this.closeSearch();
        return true;
    },

    /**
     * @param {boolean} enabled
     */
    _updateSearchNavigationButtonState: function(enabled)
    {
        this._replaceButtonElement.disabled = !enabled;
        if (enabled) {
            this._searchNavigationPrevElement.classList.add("enabled");
            this._searchNavigationNextElement.classList.add("enabled");
        } else {
            this._searchNavigationPrevElement.classList.remove("enabled");
            this._searchNavigationNextElement.classList.remove("enabled");
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

        var queryCandidate;
        if (WebInspector.currentFocusElement() !== this._searchInputElement) {
            var selection = this._searchInputElement.window().getSelection();
            if (selection.rangeCount)
                queryCandidate = selection.toString().replace(/\r?\n.*/, "");
        }

        this._toggleSearchBar(true);
        this._updateReplaceVisibility();
        if (queryCandidate)
            this._searchInputElement.value = queryCandidate;
        this._performSearch(false, false);
        this._searchInputElement.focus();
        this._searchInputElement.select();
        this._searchIsVisible = true;
    },

    _updateReplaceVisibility: function()
    {
        this._replaceElement.classList.toggle("hidden", !this._replaceable);
        if (!this._replaceable) {
            this._replaceCheckboxElement.checked = false;
            this._updateSecondRowVisibility();
        }
    },

    /**
     * @param {!Event} event
     */
    _onSearchFieldManualFocus: function(event)
    {
        WebInspector.setCurrentFocusElement(/** @type {?Node} */ (event.target));
    },

    /**
     * @param {!Event} event
     */
    _onSearchKeyDown: function(event)
    {
        if (!isEnterKey(event))
            return;

        if (!this._currentQuery)
            this._performSearch(true, true, event.shiftKey);
        else
            this._jumpToNextSearchResult(event.shiftKey);
    },

    /**
     * @param {!Event} event
     */
    _onReplaceKeyDown: function(event)
    {
        if (isEnterKey(event))
            this._replace();
    },

    /**
     * @param {boolean=} isBackwardSearch
     */
    _jumpToNextSearchResult: function(isBackwardSearch)
    {
        if (!this._currentQuery || !this._searchNavigationPrevElement.classList.contains("enabled"))
            return;

        if (isBackwardSearch)
            this._searchProvider.jumpToPreviousSearchResult();
        else
            this._searchProvider.jumpToNextSearchResult();
    },

    _onNextButtonSearch: function(event)
    {
        if (!this._searchNavigationNextElement.classList.contains("enabled"))
            return;
        this._jumpToNextSearchResult();
        this._searchInputElement.focus();
    },

    _onPrevButtonSearch: function(event)
    {
        if (!this._searchNavigationPrevElement.classList.contains("enabled"))
            return;
        this._jumpToNextSearchResult(true);
        this._searchInputElement.focus();
    },

    _onFindClick: function(event)
    {
        if (!this._currentQuery)
            this._performSearch(true, true);
        else
            this._jumpToNextSearchResult();
        this._searchInputElement.focus();
    },

    _onPreviousClick: function(event)
    {
        if (!this._currentQuery)
            this._performSearch(true, true, true);
        else
            this._jumpToNextSearchResult(true);
        this._searchInputElement.focus();
    },

    _clearSearch: function()
    {
        delete this._currentQuery;
        if (!!this._searchProvider.currentQuery) {
            delete this._searchProvider.currentQuery;
            this._searchProvider.searchCanceled();
        }
        this._updateSearchMatchesCountAndCurrentMatchIndex(0, -1);
    },

    /**
     * @param {boolean} forceSearch
     * @param {boolean} shouldJump
     * @param {boolean=} jumpBackwards
     */
    _performSearch: function(forceSearch, shouldJump, jumpBackwards)
    {
        var query = this._searchInputElement.value;
        if (!query || (!forceSearch && query.length < this._minimalSearchQuerySize && !this._currentQuery)) {
            this._clearSearch();
            return;
        }

        this._currentQuery = query;
        this._searchProvider.currentQuery = query;

        var searchConfig = this._currentSearchConfig();
        this._searchProvider.performSearch(searchConfig, shouldJump, jumpBackwards);
    },

    /**
     * @return {!WebInspector.SearchableView.SearchConfig}
     */
    _currentSearchConfig: function()
    {
        var query = this._searchInputElement.value;
        var caseSensitive = this._caseSensitiveButton ? this._caseSensitiveButton.toggled() : false;
        var isRegex = this._regexButton ? this._regexButton.toggled() : false;
        return new WebInspector.SearchableView.SearchConfig(query, caseSensitive, isRegex);
     },

    _updateSecondRowVisibility: function()
    {
        var secondRowVisible = this._replaceCheckboxElement.checked;
        this._footerElementContainer.classList.toggle("replaceable", secondRowVisible);
        this._footerElement.classList.toggle("toolbar-search-replace", secondRowVisible);
        this._secondRowElement.classList.toggle("hidden", !secondRowVisible);
        this._prevButtonElement.classList.toggle("hidden", !secondRowVisible);
        this._findButtonElement.classList.toggle("hidden", !secondRowVisible);
        this._replaceCheckboxElement.tabIndex = secondRowVisible ? -1 : 0;

        if (secondRowVisible)
            this._replaceInputElement.focus();
        else
            this._searchInputElement.focus();
        this.doResize();
    },

    _replace: function()
    {
        var searchConfig = this._currentSearchConfig();
        /** @type {!WebInspector.Replaceable} */ (this._searchProvider).replaceSelectionWith(searchConfig, this._replaceInputElement.value);
        delete this._currentQuery;
        this._performSearch(true, true);
    },

    _replaceAll: function()
    {
        var searchConfig = this._currentSearchConfig();
        /** @type {!WebInspector.Replaceable} */ (this._searchProvider).replaceAllWith(searchConfig, this._replaceInputElement.value);
    },

    _onInput: function(event)
    {
        this._onValueChanged();
    },

    _onValueChanged: function()
    {
        this._performSearch(false, true);
    },

    __proto__: WebInspector.VBox.prototype
}

/**
 * @interface
 */
WebInspector.Searchable = function()
{
}

WebInspector.Searchable.prototype = {
    searchCanceled: function() { },

    /**
     * @param {!WebInspector.SearchableView.SearchConfig} searchConfig
     * @param {boolean} shouldJump
     * @param {boolean=} jumpBackwards
     */
    performSearch: function(searchConfig, shouldJump, jumpBackwards) { },

    jumpToNextSearchResult: function() { },

    jumpToPreviousSearchResult: function() { },

    /**
     * @return {boolean}
     */
    supportsCaseSensitiveSearch: function() { },

    /**
     * @return {boolean}
     */
    supportsRegexSearch: function() { }
}

/**
 * @interface
 */
WebInspector.Replaceable = function()
{
}

WebInspector.Replaceable.prototype = {
    /**
     * @param {!WebInspector.SearchableView.SearchConfig} searchConfig
     * @param {string} replacement
     */
    replaceSelectionWith: function(searchConfig, replacement) { },

    /**
     * @param {!WebInspector.SearchableView.SearchConfig} searchConfig
     * @param {string} replacement
     */
    replaceAllWith: function(searchConfig, replacement) { }
}

/**
 * @constructor
 * @param {string} query
 * @param {boolean} caseSensitive
 * @param {boolean} isRegex
 */
WebInspector.SearchableView.SearchConfig = function(query, caseSensitive, isRegex)
{
    this.query = query;
    this.caseSensitive = caseSensitive;
    this.isRegex = isRegex;
}
