// Copyright 2014 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

/**
 * @constructor
 * @extends {WebInspector.SearchResultsPane}
 * @param {!WebInspector.ProjectSearchConfig} searchConfig
 */
WebInspector.FileBasedSearchResultsPane = function(searchConfig)
{
    WebInspector.SearchResultsPane.call(this, searchConfig);

    this._searchResults = [];

    this.element.id = "search-results-pane-file-based";

    this._treeOutlineElement = createElement("ol");
    this._treeOutlineElement.className = "search-results-outline-disclosure";
    this.element.appendChild(this._treeOutlineElement);
    this._treeOutline = new TreeOutline(this._treeOutlineElement);

    this._matchesExpandedCount = 0;
}

WebInspector.FileBasedSearchResultsPane.matchesExpandedByDefaultCount = 20;
WebInspector.FileBasedSearchResultsPane.fileMatchesShownAtOnce = 20;

WebInspector.FileBasedSearchResultsPane.prototype = {
    /**
     * @param {!WebInspector.FileBasedSearchResult} searchResult
     */
    addSearchResult: function(searchResult)
    {
        this._searchResults.push(searchResult);
        var uiSourceCode = searchResult.uiSourceCode;
        if (!uiSourceCode)
            return;
        this._addFileTreeElement(searchResult);
    },

    /**
     * @param {!WebInspector.FileBasedSearchResult} searchResult
     */
    _addFileTreeElement: function(searchResult)
    {
        var fileTreeElement = new WebInspector.FileBasedSearchResultsPane.FileTreeElement(this._searchConfig, searchResult);
        this._treeOutline.appendChild(fileTreeElement);
        // Expand until at least a certain number of matches is expanded.
        if (this._matchesExpandedCount < WebInspector.FileBasedSearchResultsPane.matchesExpandedByDefaultCount)
            fileTreeElement.expand();
        this._matchesExpandedCount += searchResult.searchMatches.length;
    },

    __proto__: WebInspector.SearchResultsPane.prototype
}

/**
 * @constructor
 * @extends {TreeElement}
 * @param {!WebInspector.ProjectSearchConfig} searchConfig
 * @param {!WebInspector.FileBasedSearchResult} searchResult
 */
WebInspector.FileBasedSearchResultsPane.FileTreeElement = function(searchConfig, searchResult)
{
    TreeElement.call(this, "", null, true);
    this._searchConfig = searchConfig;
    this._searchResult = searchResult;

    this.toggleOnClick = true;
    this.selectable = false;
}

WebInspector.FileBasedSearchResultsPane.FileTreeElement.prototype = {
    onexpand: function()
    {
        if (this._initialized)
            return;

        this._updateMatchesUI();
        this._initialized = true;
    },

    _updateMatchesUI: function()
    {
        this.removeChildren();
        var toIndex = Math.min(this._searchResult.searchMatches.length, WebInspector.FileBasedSearchResultsPane.fileMatchesShownAtOnce);
        if (toIndex < this._searchResult.searchMatches.length) {
            this._appendSearchMatches(0, toIndex - 1);
            this._appendShowMoreMatchesElement(toIndex - 1);
        } else {
            this._appendSearchMatches(0, toIndex);
        }
    },

    onattach: function()
    {
        this._updateSearchMatches();
    },

    _updateSearchMatches: function()
    {
        this.listItemElement.classList.add("search-result");

        var fileNameSpan = createElement("span");
        fileNameSpan.className = "search-result-file-name";
        fileNameSpan.textContent = this._searchResult.uiSourceCode.fullDisplayName();
        this.listItemElement.appendChild(fileNameSpan);

        var matchesCountSpan = createElement("span");
        matchesCountSpan.className = "search-result-matches-count";

        var searchMatchesCount = this._searchResult.searchMatches.length;
        if (searchMatchesCount === 1)
            matchesCountSpan.textContent = WebInspector.UIString("(%d match)", searchMatchesCount);
        else
            matchesCountSpan.textContent = WebInspector.UIString("(%d matches)", searchMatchesCount);

        this.listItemElement.appendChild(matchesCountSpan);
        if (this.expanded)
            this._updateMatchesUI();
    },

    /**
     * @param {number} fromIndex
     * @param {number} toIndex
     */
    _appendSearchMatches: function(fromIndex, toIndex)
    {
        var searchResult = this._searchResult;
        var uiSourceCode = searchResult.uiSourceCode;
        var searchMatches = searchResult.searchMatches;

        var queries = this._searchConfig.queries();
        var regexes = [];
        for (var i = 0; i < queries.length; ++i)
            regexes.push(createSearchRegex(queries[i], !this._searchConfig.ignoreCase(), this._searchConfig.isRegex()));

        for (var i = fromIndex; i < toIndex; ++i) {
            var lineNumber = searchMatches[i].lineNumber;
            var lineContent = searchMatches[i].lineContent;
            var matchRanges = [];
            for (var j = 0; j < regexes.length; ++j)
                matchRanges = matchRanges.concat(this._regexMatchRanges(lineContent, regexes[j]));

            var anchor = this._createAnchor(uiSourceCode, lineNumber, matchRanges[0].offset);

            var numberString = numberToStringWithSpacesPadding(lineNumber + 1, 4);
            var lineNumberSpan = createElement("span");
            lineNumberSpan.classList.add("search-match-line-number");
            lineNumberSpan.textContent = numberString;
            anchor.appendChild(lineNumberSpan);

            var contentSpan = this._createContentSpan(lineContent, matchRanges);
            anchor.appendChild(contentSpan);

            var searchMatchElement = new TreeElement("");
            searchMatchElement.selectable = false;
            this.appendChild(searchMatchElement);
            searchMatchElement.listItemElement.className = "search-match source-code";
            searchMatchElement.listItemElement.appendChild(anchor);
        }
    },

    /**
     * @param {number} startMatchIndex
     */
    _appendShowMoreMatchesElement: function(startMatchIndex)
    {
        var matchesLeftCount = this._searchResult.searchMatches.length - startMatchIndex;
        var showMoreMatchesText = WebInspector.UIString("Show all matches (%d more).", matchesLeftCount);
        this._showMoreMatchesTreeElement = new TreeElement(showMoreMatchesText);
        this.appendChild(this._showMoreMatchesTreeElement);
        this._showMoreMatchesTreeElement.listItemElement.classList.add("show-more-matches");
        this._showMoreMatchesTreeElement.onselect = this._showMoreMatchesElementSelected.bind(this, startMatchIndex);
    },

    /**
     * @param {!WebInspector.UISourceCode} uiSourceCode
     * @param {number} lineNumber
     * @param {number} columnNumber
     * @return {!Element}
     */
    _createAnchor: function(uiSourceCode, lineNumber, columnNumber)
    {
        return WebInspector.Linkifier.linkifyUsingRevealer(uiSourceCode.uiLocation(lineNumber, columnNumber), "", uiSourceCode.url, lineNumber);
    },

    /**
     * @param {string} lineContent
     * @param {!Array.<!WebInspector.SourceRange>} matchRanges
     */
    _createContentSpan: function(lineContent, matchRanges)
    {
        var contentSpan = createElement("span");
        contentSpan.className = "search-match-content";
        contentSpan.textContent = lineContent;
        WebInspector.highlightRangesWithStyleClass(contentSpan, matchRanges, "highlighted-match");
        return contentSpan;
    },

    /**
     * @param {string} lineContent
     * @param {!RegExp} regex
     * @return {!Array.<!WebInspector.SourceRange>}
     */
    _regexMatchRanges: function(lineContent, regex)
    {
        regex.lastIndex = 0;
        var match;
        var offset = 0;
        var matchRanges = [];
        while ((regex.lastIndex < lineContent.length) && (match = regex.exec(lineContent)))
            matchRanges.push(new WebInspector.SourceRange(match.index, match[0].length));

        return matchRanges;
    },

    /**
     * @param {number} startMatchIndex
     * @return {boolean}
     */
    _showMoreMatchesElementSelected: function(startMatchIndex)
    {
        this.removeChild(this._showMoreMatchesTreeElement);
        this._appendSearchMatches(startMatchIndex, this._searchResult.searchMatches.length);
        return false;
    },

    __proto__: TreeElement.prototype
}
