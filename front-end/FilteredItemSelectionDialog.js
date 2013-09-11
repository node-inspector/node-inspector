/*
 * Copyright (C) 2012 Google Inc. All rights reserved.
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
 *     * Neither the name of Google Inc. nor the names of its
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
 * @extends {WebInspector.DialogDelegate}
 * @implements {WebInspector.ViewportControl.Provider}
 * @param {WebInspector.SelectionDialogContentProvider} delegate
 */
WebInspector.FilteredItemSelectionDialog = function(delegate)
{
    WebInspector.DialogDelegate.call(this);

    var xhr = new XMLHttpRequest();
    xhr.open("GET", "filteredItemSelectionDialog.css", false);
    xhr.send(null);

    this.element = document.createElement("div");
    this.element.className = "filtered-item-list-dialog";
    this.element.addEventListener("keydown", this._onKeyDown.bind(this), false);
    var styleElement = this.element.createChild("style");
    styleElement.type = "text/css";
    styleElement.textContent = xhr.responseText;

    this._promptElement = this.element.createChild("input", "monospace");
    this._promptElement.addEventListener("input", this._onInput.bind(this), false);
    this._promptElement.type = "text";
    this._promptElement.setAttribute("spellcheck", "false");

    this._filteredItems = [];
    this._viewportControl = new WebInspector.ViewportControl(this);
    this._itemElementsContainer = this._viewportControl.element;
    this._itemElementsContainer.addStyleClass("container");
    this._itemElementsContainer.addStyleClass("monospace");
    this._itemElementsContainer.addEventListener("click", this._onClick.bind(this), false);
    this.element.appendChild(this._itemElementsContainer);

    this._delegate = delegate;
    this._delegate.setRefreshCallback(this._itemsLoaded.bind(this));
    this._itemsLoaded();

    this._shouldShowMatchingItems = true;
}

WebInspector.FilteredItemSelectionDialog.prototype = {
    /**
     * @param {Element} element
     * @param {Element} relativeToElement
     */
    position: function(element, relativeToElement)
    {
        const minWidth = 500;
        const minHeight = 204;
        var width = Math.max(relativeToElement.offsetWidth * 2 / 3, minWidth);
        var height = Math.max(relativeToElement.offsetHeight * 2 / 3, minHeight);

        this.element.style.width = width + "px";

        const shadowPadding = 20; // shadow + padding
        element.positionAt(
            relativeToElement.totalOffsetLeft() + Math.max((relativeToElement.offsetWidth - width - 2 * shadowPadding) / 2, shadowPadding),
            relativeToElement.totalOffsetTop() + Math.max((relativeToElement.offsetHeight - height - 2 * shadowPadding) / 2, shadowPadding));
        this._dialogHeight = height;

        this._updateShowMatchingItems();
    },

    focus: function()
    {
        WebInspector.setCurrentFocusElement(this._promptElement);
        if (this._filteredItems.length && this._viewportControl.lastVisibleIndex() === -1)
            this._viewportControl.refresh();
    },

    willHide: function()
    {
        if (this._isHiding)
            return;
        this._isHiding = true;
        this._delegate.dispose();
        if (this._filterTimer)
            clearTimeout(this._filterTimer);
    },

    renderAsTwoRows: function()
    {
        this._renderAsTwoRows = true;
    },

    onEnter: function()
    {
        if (!this._delegate.itemCount())
            return;
        this._delegate.selectItem(this._filteredItems[this._selectedIndexInFiltered], this._promptElement.value.trim());
    },

    _itemsLoaded: function()
    {

        if (this._loadTimeout)
            return;
        this._loadTimeout = setTimeout(this._updateAfterItemsLoaded.bind(this), 0);
    },

    _updateAfterItemsLoaded: function()
    {
        delete this._loadTimeout;
        this._filterItems();
    },

    /**
     * @param {number} index
     * @return {Element}
     */
    _createItemElement: function(index)
    {
        var itemElement = document.createElement("div");
        itemElement.className = "filtered-item-list-dialog-item " + (this._renderAsTwoRows ? "two-rows" : "one-row");
        itemElement._titleElement = itemElement.createChild("span");
        itemElement._titleSuffixElement = itemElement.createChild("span");
        itemElement._subtitleElement = itemElement.createChild("div", "filtered-item-list-dialog-subtitle");
        itemElement._subtitleElement.textContent = "\u200B";
        itemElement._index = index;
        this._delegate.renderItem(index, this._promptElement.value.trim(), itemElement._titleElement, itemElement._subtitleElement);
        return itemElement;
    },

    /**
     * @param {string} query
     */
    setQuery: function(query)
    {
        this._promptElement.value = query;
        this._scheduleFilter();
    },

    _filterItems: function()
    {
        delete this._filterTimer;
        if (this._scoringTimer) {
            clearTimeout(this._scoringTimer);
            delete this._scoringTimer;
        }

        var query = this._delegate.rewriteQuery(this._promptElement.value.trim());
        this._query = query;
        var queryLength = query.length;
        var filterRegex = query ? WebInspector.FilePathScoreFunction.filterRegex(query) : null;

        var oldSelectedAbsoluteIndex = this._selectedIndexInFiltered ? this._filteredItems[this._selectedIndexInFiltered] : null;
        var filteredItems = [];
        this._selectedIndexInFiltered = 0;

        var bestScores = [];
        var bestItems = [];
        var bestItemsToCollect = 100;
        var minBestScore = 0;
        var overflowItems = [];

        scoreItems.call(this, 0);

        /**
         * @param {number} a
         * @param {number} b
         * @return {number}
         */
        function compareIntegers(a, b)
        {
            return b - a;
        }

        function scoreItems(fromIndex)
        {
            var maxWorkItems = 1000;
            var workDone = 0;
            for (var i = fromIndex; i < this._delegate.itemCount() && workDone < maxWorkItems; ++i) {
                // Filter out non-matching items quickly.
                if (filterRegex && !filterRegex.test(this._delegate.itemKeyAt(i)))
                    continue;

                // Score item.
                var score = this._delegate.itemScoreAt(i, query);
                if (query)
                    workDone++;

                // Find its index in the scores array (earlier elements have bigger scores).
                if (score > minBestScore || bestScores.length < bestItemsToCollect) {
                    var index = insertionIndexForObjectInListSortedByFunction(score, bestScores, compareIntegers, true);
                    bestScores.splice(index, 0, score);
                    bestItems.splice(index, 0, i);
                    if (bestScores.length > bestItemsToCollect) {
                        // Best list is too large -> drop last elements.
                        overflowItems.push(bestItems.peekLast());
                        bestScores.length = bestItemsToCollect;
                        bestItems.length = bestItemsToCollect;
                    }
                    minBestScore = bestScores.peekLast();
                } else
                    filteredItems.push(i);
            }

            // Process everything in chunks.
            if (i < this._delegate.itemCount()) {
                this._scoringTimer = setTimeout(scoreItems.bind(this, i), 0);
                return;
            }
            delete this._scoringTimer;

            this._filteredItems = bestItems.concat(overflowItems).concat(filteredItems);
            for (var i = 0; i < this._filteredItems.length; ++i) {
                if (this._filteredItems[i] === oldSelectedAbsoluteIndex) {
                    this._selectedIndexInFiltered = i;
                    break;
                }
            }
            this._viewportControl.refresh();
            if (!query)
                this._selectedIndexInFiltered = 0;
            this._updateSelection(this._selectedIndexInFiltered, false);
        }
    },

    _onInput: function(event)
    {
        this._shouldShowMatchingItems = this._delegate.shouldShowMatchingItems(this._promptElement.value);
        this._updateShowMatchingItems();
        this._scheduleFilter();
    },

    _updateShowMatchingItems: function()
    {
        this._itemElementsContainer.enableStyleClass("hidden", !this._shouldShowMatchingItems);
        this.element.style.height = this._shouldShowMatchingItems ? this._dialogHeight + "px" : "auto";
    },

    _onKeyDown: function(event)
    {
        var newSelectedIndex = this._selectedIndexInFiltered;

        switch (event.keyCode) {
        case WebInspector.KeyboardShortcut.Keys.Down.code:
            if (++newSelectedIndex >= this._filteredItems.length)
                newSelectedIndex = this._filteredItems.length - 1;
            this._updateSelection(newSelectedIndex, true);
            event.consume(true);
            break;
        case WebInspector.KeyboardShortcut.Keys.Up.code:
            if (--newSelectedIndex < 0)
                newSelectedIndex = 0;
            this._updateSelection(newSelectedIndex, false);
            event.consume(true);
            break;
        case WebInspector.KeyboardShortcut.Keys.PageDown.code:
            newSelectedIndex = Math.min(newSelectedIndex + this._viewportControl.rowsPerViewport(), this._filteredItems.length - 1);
            this._updateSelection(newSelectedIndex, true);
            event.consume(true);
            break;
        case WebInspector.KeyboardShortcut.Keys.PageUp.code:
            newSelectedIndex = Math.max(newSelectedIndex - this._viewportControl.rowsPerViewport(), 0);
            this._updateSelection(newSelectedIndex, false);
            event.consume(true);
            break;
        default:
        }
    },

    _scheduleFilter: function()
    {
        if (this._filterTimer)
            return;
        this._filterTimer = setTimeout(this._filterItems.bind(this), 0);
    },

    /**
     * @param {number} index  
     * @param {boolean} makeLast
     */
    _updateSelection: function(index, makeLast)
    { 
        var element = this._viewportControl.renderedElementAt(this._selectedIndexInFiltered);
        if (element)
            element.removeStyleClass("selected");
        this._viewportControl.scrollItemIntoView(index, makeLast);
        this._selectedIndexInFiltered = index;
        element = this._viewportControl.renderedElementAt(index);
        if (element)
            element.addStyleClass("selected");
    },

    _onClick: function(event)
    {
        var itemElement = event.target.enclosingNodeOrSelfWithClass("filtered-item-list-dialog-item");
        if (!itemElement)
            return;
        this._delegate.selectItem(itemElement._index, this._promptElement.value.trim());
        WebInspector.Dialog.hide();
    },

    /**
     * @return {number}
     */
    itemCount: function()
    {
        return this._filteredItems.length;
    },

    /**
     * @param {number} index
     * @return {Element}
     */
    itemElement: function(index)
    {
        var delegateIndex = this._filteredItems[index];
        var element = this._createItemElement(delegateIndex);
        if (index === this._selectedIndexInFiltered)
            element.addStyleClass("selected");
        return element;
    },

    __proto__: WebInspector.DialogDelegate.prototype
}

/**
 * @constructor
 */
WebInspector.SelectionDialogContentProvider = function()
{
}

WebInspector.SelectionDialogContentProvider.prototype = {
    /**
     * @param {function():void} refreshCallback
     */
    setRefreshCallback: function(refreshCallback)
    {
        this._refreshCallback = refreshCallback;
    },

    /**
     * @param {string} query
     * @return {boolean}
     */
    shouldShowMatchingItems: function(query)
    {
        return true;
    },

    /**
     * @return {number}
     */
    itemCount: function()
    {
        return 0;
    },

    /**
     * @param {number} itemIndex
     * @return {string}
     */
    itemKeyAt: function(itemIndex)
    {
        return "";
    },

    /**
     * @param {number} itemIndex
     * @param {string} query
     * @return {number}
     */
    itemScoreAt: function(itemIndex, query)
    {
        return 1;
    },

    /**
     * @param {number} itemIndex
     * @param {string} query
     * @param {Element} titleElement
     * @param {Element} subtitleElement
     */
    renderItem: function(itemIndex, query, titleElement, subtitleElement)
    {
    },

    /**
     * @param {Element} element
     * @param {string} query
     * @return {boolean}
     */
    highlightRanges: function(element, query)
    {
        if (!query)
            return false;

        /**
         * @param {string} text
         * @param {string} query
         * @return {?Array.<{offset:number, length:number}>}
         */
        function rangesForMatch(text, query)
        {
            var sm = new difflib.SequenceMatcher(query, text);
            var opcodes = sm.get_opcodes();
            var ranges = [];

            for (var i = 0; i < opcodes.length; ++i) {
                var opcode = opcodes[i];
                if (opcode[0] === "equal")
                    ranges.push({offset: opcode[3], length: opcode[4] - opcode[3]});
                else if (opcode[0] !== "insert")
                    return null;
            }
            return ranges;
        }

        var text = element.textContent;
        var ranges = rangesForMatch(text, query);
        if (!ranges)
            ranges = rangesForMatch(text.toUpperCase(), query.toUpperCase());
        if (ranges) {
            WebInspector.highlightRangesWithStyleClass(element, ranges, "highlight");
            return true;
        }
        return false;
    },

    /**
     * @param {number} itemIndex
     * @param {string} promptValue
     */
    selectItem: function(itemIndex, promptValue)
    {
    },

    refresh: function()
    {
        this._refreshCallback();
    },

    /**
     * @param {string} query
     * @return {string}
     */
    rewriteQuery: function(query)
    {
        return query;
    },

    dispose: function()
    {
    }
}

/**
 * @constructor
 * @extends {WebInspector.SelectionDialogContentProvider}
 * @param {WebInspector.View} view
 * @param {WebInspector.ContentProvider} contentProvider
 */
WebInspector.JavaScriptOutlineDialog = function(view, contentProvider)
{
    WebInspector.SelectionDialogContentProvider.call(this);

    this._functionItems = [];
    this._view = view;
    contentProvider.requestContent(this._contentAvailable.bind(this));
}

/**
 * @param {WebInspector.View} view
 * @param {WebInspector.ContentProvider} contentProvider
 */
WebInspector.JavaScriptOutlineDialog.show = function(view, contentProvider)
{
    if (WebInspector.Dialog.currentInstance())
        return null;
    var filteredItemSelectionDialog = new WebInspector.FilteredItemSelectionDialog(new WebInspector.JavaScriptOutlineDialog(view, contentProvider));
    WebInspector.Dialog.show(view.element, filteredItemSelectionDialog);
}

WebInspector.JavaScriptOutlineDialog.prototype = {
    /**
     * @param {?string} content
     * @param {boolean} contentEncoded
     * @param {string} mimeType
     */
    _contentAvailable: function(content, contentEncoded, mimeType)
    {
        this._outlineWorker = new Worker("ScriptFormatterWorker.js");
        this._outlineWorker.onmessage = this._didBuildOutlineChunk.bind(this);
        const method = "outline";
        this._outlineWorker.postMessage({ method: method, params: { content: content } });
    },

    _didBuildOutlineChunk: function(event)
    {
        var data = event.data;
        var chunk = data["chunk"];
        for (var i = 0; i < chunk.length; ++i)
            this._functionItems.push(chunk[i]);

        if (data.total === data.index)
            this.dispose();

        this.refresh();
    },

    /**
     * @return {number}
     */
    itemCount: function()
    {
        return this._functionItems.length;
    },

    /**
     * @param {number} itemIndex
     * @return {string}
     */
    itemKeyAt: function(itemIndex)
    {
        return this._functionItems[itemIndex].name;
    },

    /**
     * @param {number} itemIndex
     * @param {string} query
     * @return {number}
     */
    itemScoreAt: function(itemIndex, query)
    {
        var item = this._functionItems[itemIndex];
        return -item.line;
    },

    /**
     * @param {number} itemIndex
     * @param {string} query
     * @param {Element} titleElement
     * @param {Element} subtitleElement
     */
    renderItem: function(itemIndex, query, titleElement, subtitleElement)
    {
        var item = this._functionItems[itemIndex];
        titleElement.textContent = item.name + (item.arguments ? item.arguments : "");
        this.highlightRanges(titleElement, query);
        subtitleElement.textContent = ":" + (item.line + 1);
    },

    /**
     * @param {number} itemIndex
     * @param {string} promptValue
     */
    selectItem: function(itemIndex, promptValue)
    {
        var lineNumber = this._functionItems[itemIndex].line;
        if (!isNaN(lineNumber) && lineNumber >= 0)
            this._view.highlightPosition(lineNumber, this._functionItems[itemIndex].column);
        this._view.focus();
    },

    dispose: function()
    {
        if (this._outlineWorker) {
            this._outlineWorker.terminate();
            delete this._outlineWorker;
        }
    },

    __proto__: WebInspector.SelectionDialogContentProvider.prototype
}

/**
 * @constructor
 * @extends {WebInspector.SelectionDialogContentProvider}
 * @param {Map.<WebInspector.UISourceCode, number>=} defaultScores
 */
WebInspector.SelectUISourceCodeDialog = function(defaultScores)
{
    WebInspector.SelectionDialogContentProvider.call(this);

    /** @type {!Array.<!WebInspector.UISourceCode>} */
    this._uiSourceCodes = [];
    var projects = WebInspector.workspace.projects().filter(this.filterProject.bind(this));
    for (var i = 0; i < projects.length; ++i)
        this._uiSourceCodes = this._uiSourceCodes.concat(projects[i].uiSourceCodes());
    this._defaultScores = defaultScores;
    this._scorer = new WebInspector.FilePathScoreFunction("");
    WebInspector.workspace.addEventListener(WebInspector.Workspace.Events.UISourceCodeAdded, this._uiSourceCodeAdded, this);
}

WebInspector.SelectUISourceCodeDialog.prototype = {
    /**
     * @param {WebInspector.UISourceCode} uiSourceCode
     * @param {number=} lineNumber
     */
    uiSourceCodeSelected: function(uiSourceCode, lineNumber)
    {
        // Overridden by subclasses
    },

    /**
     * @param {WebInspector.Project} project
     */
    filterProject: function(project)
    {
        return true;
        // Overridden by subclasses
    },

    /**
     * @return {number}
     */
    itemCount: function()
    {
        return this._uiSourceCodes.length;
    },

    /**
     * @param {number} itemIndex
     * @return {string}
     */
    itemKeyAt: function(itemIndex)
    {
        return this._uiSourceCodes[itemIndex].fullDisplayName();
    },

    /**
     * @param {number} itemIndex
     * @param {string} query
     * @return {number}
     */
    itemScoreAt: function(itemIndex, query)
    {
        var uiSourceCode = this._uiSourceCodes[itemIndex];
        var score = this._defaultScores ? (this._defaultScores.get(uiSourceCode) || 0) : 0;
        if (!query || query.length < 2)
            return score;

        if (this._query !== query) {
            this._query = query;
            this._scorer = new WebInspector.FilePathScoreFunction(query);
        }

        var path = uiSourceCode.fullDisplayName();
        return score + 10 * this._scorer.score(path, null);
    },

    /**
     * @param {number} itemIndex
     * @param {string} query
     * @param {Element} titleElement
     * @param {Element} subtitleElement
     */
    renderItem: function(itemIndex, query, titleElement, subtitleElement)
    {
        query = this.rewriteQuery(query);
        var uiSourceCode = this._uiSourceCodes[itemIndex];
        titleElement.textContent = uiSourceCode.displayName() + (this._queryLineNumber ? this._queryLineNumber : "");
        subtitleElement.textContent = uiSourceCode.fullDisplayName().trimEnd(100);

        var indexes = [];
        var score = new WebInspector.FilePathScoreFunction(query).score(subtitleElement.textContent, indexes);
        var fileNameIndex = subtitleElement.textContent.lastIndexOf("/");
        var ranges = [];
        for (var i = 0; i < indexes.length; ++i)
            ranges.push({offset: indexes[i], length: 1});
        if (indexes[0] > fileNameIndex) {
            for (var i = 0; i < ranges.length; ++i)
                ranges[i].offset -= fileNameIndex + 1;
            return WebInspector.highlightRangesWithStyleClass(titleElement, ranges, "highlight");
        } else {
            return WebInspector.highlightRangesWithStyleClass(subtitleElement, ranges, "highlight");
        }
    },

    /**
     * @param {number} itemIndex
     * @param {string} promptValue
     */
    selectItem: function(itemIndex, promptValue)
    {
        if (/^:\d+$/.test(promptValue.trimRight())) {
            var lineNumber = parseInt(promptValue.trimRight().substring(1), 10) - 1;
            if (!isNaN(lineNumber) && lineNumber >= 0)
                this.uiSourceCodeSelected(null, lineNumber);
            return;
        }
        var lineNumberMatch = promptValue.match(/[^:]+\:([\d]*)$/);
        var lineNumber = lineNumberMatch ? Math.max(parseInt(lineNumberMatch[1], 10) - 1, 0) : undefined;
        this.uiSourceCodeSelected(this._uiSourceCodes[itemIndex], lineNumber);
    },

    /**
     * @param {string} query
     * @return {string}
     */
    rewriteQuery: function(query)
    {
        if (!query)
            return query;
        query = query.trim();
        var lineNumberMatch = query.match(/([^:]+)(\:[\d]*)$/);
        this._queryLineNumber = lineNumberMatch ? lineNumberMatch[2] : "";
        return lineNumberMatch ? lineNumberMatch[1] : query;
    },

    /**
     * @param {WebInspector.Event} event
     */
    _uiSourceCodeAdded: function(event)
    {
        var uiSourceCode = /** @type {WebInspector.UISourceCode} */ (event.data);
        if (!this.filterProject(uiSourceCode.project()))
            return;
        this._uiSourceCodes.push(uiSourceCode)
        this.refresh();
    },

    dispose: function()
    {
        WebInspector.workspace.removeEventListener(WebInspector.Workspace.Events.UISourceCodeAdded, this._uiSourceCodeAdded, this);
    },

    __proto__: WebInspector.SelectionDialogContentProvider.prototype
}

/**
 * @constructor
 * @extends {WebInspector.SelectUISourceCodeDialog}
 * @param {WebInspector.ScriptsPanel} panel
 * @param {Map.<WebInspector.UISourceCode, number>=} defaultScores
 */
WebInspector.OpenResourceDialog = function(panel, defaultScores)
{
    WebInspector.SelectUISourceCodeDialog.call(this, defaultScores);
    this._panel = panel;
}

WebInspector.OpenResourceDialog.prototype = {

    /**
     * @param {?WebInspector.UISourceCode} uiSourceCode
     * @param {number=} lineNumber
     */
    uiSourceCodeSelected: function(uiSourceCode, lineNumber)
    {
        if (!uiSourceCode)
            uiSourceCode = this._panel.currentUISourceCode();
        if (!uiSourceCode)
            return;
        this._panel.showUISourceCode(uiSourceCode, lineNumber);
    },

    /**
     * @param {string} query
     * @return {boolean}
     */
    shouldShowMatchingItems: function(query)
    {
        return !query.startsWith(":");
    },

    /**
     * @param {WebInspector.Project} project
     */
    filterProject: function(project)
    {
        return !project.isServiceProject();
    },

    __proto__: WebInspector.SelectUISourceCodeDialog.prototype
}

/**
 * @param {WebInspector.ScriptsPanel} panel
 * @param {Element} relativeToElement
 * @param {string=} name
 * @param {Map.<WebInspector.UISourceCode, number>=} defaultScores
 */
WebInspector.OpenResourceDialog.show = function(panel, relativeToElement, name, defaultScores)
{
    if (WebInspector.Dialog.currentInstance())
        return;

    var filteredItemSelectionDialog = new WebInspector.FilteredItemSelectionDialog(new WebInspector.OpenResourceDialog(panel, defaultScores));
    filteredItemSelectionDialog.renderAsTwoRows();
    if (name)
        filteredItemSelectionDialog.setQuery(name);
    WebInspector.Dialog.show(relativeToElement, filteredItemSelectionDialog);
}

/**
 * @constructor
 * @extends {WebInspector.SelectUISourceCodeDialog}
 * @param {string} type
 * @param {function(WebInspector.UISourceCode)} callback
 */
WebInspector.SelectUISourceCodeForProjectTypeDialog = function(type, callback)
{
    this._type = type;
    WebInspector.SelectUISourceCodeDialog.call(this);
    this._callback = callback;
}

WebInspector.SelectUISourceCodeForProjectTypeDialog.prototype = {
    /**
     * @param {WebInspector.UISourceCode} uiSourceCode
     * @param {number=} lineNumber
     */
    uiSourceCodeSelected: function(uiSourceCode, lineNumber)
    {
        this._callback(uiSourceCode);
    },

    /**
     * @param {WebInspector.Project} project
     */
    filterProject: function(project)
    {
        return project.type() === this._type;
    },

    __proto__: WebInspector.SelectUISourceCodeDialog.prototype
}

/**
 * @param {string} type
 * @param {function(WebInspector.UISourceCode)} callback
 * @param {Element} relativeToElement
 */
WebInspector.SelectUISourceCodeForProjectTypeDialog.show = function(name, type, callback, relativeToElement)
{
    if (WebInspector.Dialog.currentInstance())
        return;

    var filteredItemSelectionDialog = new WebInspector.FilteredItemSelectionDialog(new WebInspector.SelectUISourceCodeForProjectTypeDialog(type, callback));
    filteredItemSelectionDialog.setQuery(name);
    filteredItemSelectionDialog.renderAsTwoRows();
    WebInspector.Dialog.show(relativeToElement, filteredItemSelectionDialog);
}
