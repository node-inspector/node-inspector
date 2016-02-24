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
 * @extends {WebInspector.VBox}
 */
WebInspector.RevisionHistoryView = function()
{
    WebInspector.VBox.call(this);
    this.registerRequiredCSS("sources/revisionHistory.css");
    this.element.classList.add("revision-history-drawer");
    this._uiSourceCodeItems = new Map();

    this._treeOutline = new TreeOutline();
    this._treeOutline.element.classList.add("outline-disclosure");
    this.element.appendChild(this._treeOutline.element);

    /**
     * @param {!WebInspector.UISourceCode} uiSourceCode
     * @this {WebInspector.RevisionHistoryView}
     */
    function populateRevisions(uiSourceCode)
    {
        if (uiSourceCode.history.length)
            this._createUISourceCodeItem(uiSourceCode);
    }

    WebInspector.workspace.uiSourceCodes().forEach(populateRevisions.bind(this));
    WebInspector.workspace.addEventListener(WebInspector.Workspace.Events.UISourceCodeContentCommitted, this._revisionAdded, this);
    WebInspector.workspace.addEventListener(WebInspector.Workspace.Events.UISourceCodeRemoved, this._uiSourceCodeRemoved, this);
    WebInspector.workspace.addEventListener(WebInspector.Workspace.Events.ProjectRemoved, this._projectRemoved, this);
}

/**
 * @param {!WebInspector.UISourceCode} uiSourceCode
 */
WebInspector.RevisionHistoryView.showHistory = function(uiSourceCode)
{
    if (!WebInspector.RevisionHistoryView._view)
        WebInspector.RevisionHistoryView._view = new WebInspector.RevisionHistoryView();
    var view = WebInspector.RevisionHistoryView._view;
    WebInspector.inspectorView.showCloseableViewInDrawer("history", WebInspector.UIString("History"), view);
    view._revealUISourceCode(uiSourceCode);
}

WebInspector.RevisionHistoryView.prototype = {
    /**
     * @param {!WebInspector.UISourceCode} uiSourceCode
     */
    _createUISourceCodeItem: function(uiSourceCode)
    {
        var uiSourceCodeItem = new TreeElement(uiSourceCode.displayName(), true);
        uiSourceCodeItem.selectable = false;

        // Insert in sorted order
        var rootElement = this._treeOutline.rootElement();
        for (var i = 0; i < rootElement.childCount(); ++i) {
            if (rootElement.childAt(i).title.localeCompare(uiSourceCode.displayName()) > 0) {
                rootElement.insertChild(uiSourceCodeItem, i);
                break;
            }
        }
        if (i === rootElement.childCount())
            rootElement.appendChild(uiSourceCodeItem);

        this._uiSourceCodeItems.set(uiSourceCode, uiSourceCodeItem);

        var revisionCount = uiSourceCode.history.length;
        for (var i = revisionCount - 1; i >= 0; --i) {
            var revision = uiSourceCode.history[i];
            var historyItem = new WebInspector.RevisionHistoryTreeElement(revision, uiSourceCode.history[i - 1], i !== revisionCount - 1);
            uiSourceCodeItem.appendChild(historyItem);
        }

        var linkItem = new TreeElement();
        linkItem.selectable = false;
        uiSourceCodeItem.appendChild(linkItem);

        var revertToOriginal = linkItem.listItemElement.createChild("span", "revision-history-link revision-history-link-row");
        revertToOriginal.textContent = WebInspector.UIString("apply original content");
        revertToOriginal.addEventListener("click", this._revertToOriginal.bind(this, uiSourceCode));

        var clearHistoryElement = uiSourceCodeItem.listItemElement.createChild("span", "revision-history-link");
        clearHistoryElement.textContent = WebInspector.UIString("revert");
        clearHistoryElement.addEventListener("click", this._clearHistory.bind(this, uiSourceCode));
        return uiSourceCodeItem;
    },

    /**
     * @param {!WebInspector.UISourceCode} uiSourceCode
     */
    _revertToOriginal: function(uiSourceCode)
    {
        uiSourceCode.revertToOriginal();
    },

    /**
     * @param {!WebInspector.UISourceCode} uiSourceCode
     */
    _clearHistory: function(uiSourceCode)
    {
        uiSourceCode.revertAndClearHistory(this._removeUISourceCode.bind(this));
    },

    _revisionAdded: function(event)
    {
        var uiSourceCode = /** @type {!WebInspector.UISourceCode} */ (event.data.uiSourceCode);
        var uiSourceCodeItem = this._uiSourceCodeItems.get(uiSourceCode);
        if (!uiSourceCodeItem) {
            uiSourceCodeItem = this._createUISourceCodeItem(uiSourceCode);
            return;
        }

        var historyLength = uiSourceCode.history.length;
        var historyItem = new WebInspector.RevisionHistoryTreeElement(uiSourceCode.history[historyLength - 1], uiSourceCode.history[historyLength - 2], false);
        if (uiSourceCodeItem.firstChild())
            uiSourceCodeItem.firstChild().allowRevert();
        uiSourceCodeItem.insertChild(historyItem, 0);
    },

    /**
     * @param {!WebInspector.UISourceCode} uiSourceCode
     */
    _revealUISourceCode: function(uiSourceCode)
    {
        var uiSourceCodeItem = this._uiSourceCodeItems.get(uiSourceCode);
        if (uiSourceCodeItem) {
            uiSourceCodeItem.reveal();
            uiSourceCodeItem.expand();
        }
    },

    _uiSourceCodeRemoved: function(event)
    {
        var uiSourceCode = /** @type {!WebInspector.UISourceCode} */ (event.data);
        this._removeUISourceCode(uiSourceCode);
    },

    /**
     * @param {!WebInspector.UISourceCode} uiSourceCode
     */
    _removeUISourceCode: function(uiSourceCode)
    {
        var uiSourceCodeItem = this._uiSourceCodeItems.get(uiSourceCode);
        if (!uiSourceCodeItem)
            return;
        this._treeOutline.removeChild(uiSourceCodeItem);
        this._uiSourceCodeItems.remove(uiSourceCode);
    },

    _projectRemoved: function(event)
    {
        var project = event.data;
        project.uiSourceCodes().forEach(this._removeUISourceCode.bind(this));
    },

    __proto__: WebInspector.VBox.prototype
}

/**
 * @constructor
 * @extends {TreeElement}
 * @param {!WebInspector.Revision} revision
 * @param {!WebInspector.Revision} baseRevision
 * @param {boolean} allowRevert
 */
WebInspector.RevisionHistoryTreeElement = function(revision, baseRevision, allowRevert)
{
    TreeElement.call(this, revision.timestamp.toLocaleTimeString(), true);
    this.selectable = false;

    this._revision = revision;
    this._baseRevision = baseRevision;

    this._revertElement = createElement("span");
    this._revertElement.className = "revision-history-link";
    this._revertElement.textContent = WebInspector.UIString("apply revision content");
    this._revertElement.addEventListener("click", this._revision.revertToThis.bind(this._revision), false);
    if (!allowRevert)
        this._revertElement.classList.add("hidden");
}

WebInspector.RevisionHistoryTreeElement.prototype = {
    onattach: function()
    {
        this.listItemElement.classList.add("revision-history-revision");
    },

    onpopulate: function()
    {
        this.listItemElement.appendChild(this._revertElement);

        this.childrenListElement.classList.add("source-code");
        if (this._baseRevision)
            this._baseRevision.requestContent(step1.bind(this));
        else
            this._revision.uiSourceCode.requestOriginalContent(step1.bind(this));

        /**
         * @param {?string} baseContent
         * @this {WebInspector.RevisionHistoryTreeElement}
         */
        function step1(baseContent)
        {
            this._revision.requestContent(step2.bind(this, baseContent));
        }

        /**
         * @param {?string} baseContent
         * @param {?string} newContent
         * @this {WebInspector.RevisionHistoryTreeElement}
         */
        function step2(baseContent, newContent)
        {
            var baseLines = baseContent.split("\n");
            var newLines = newContent.split("\n");
            var opcodes = WebInspector.Diff.lineDiff(baseLines, newLines);
            var lastWasSeparator = false;

            var baseLineNumber = 0;
            var newLineNumber = 0;
            for (var idx = 0; idx < opcodes.length; idx++) {
                var code = opcodes[idx][0];
                var rowCount = opcodes[idx][1].length;
                if (code === WebInspector.Diff.Operation.Equal) {
                    baseLineNumber += rowCount;
                    newLineNumber += rowCount;
                    if (!lastWasSeparator)
                        this._createLine(null, null, "    \u2026", "separator");
                    lastWasSeparator = true;
                } else if (code === WebInspector.Diff.Operation.Delete) {
                    lastWasSeparator = false;
                    for (var i = 0; i < rowCount; ++i)
                        this._createLine(baseLineNumber + i, null, baseLines[baseLineNumber + i], "removed");
                    baseLineNumber += rowCount;
                } else if (code === WebInspector.Diff.Operation.Insert) {
                    lastWasSeparator = false;
                    for (var i = 0; i < rowCount; ++i)
                        this._createLine(null, newLineNumber + i, newLines[newLineNumber + i], "added");
                    newLineNumber += rowCount;
                }
            }
        }
    },

    oncollapse: function()
    {
        this._revertElement.remove();
    },

    /**
     * @param {?number} baseLineNumber
     * @param {?number} newLineNumber
     * @param {string} lineContent
     * @param {string} changeType
     */
    _createLine: function(baseLineNumber, newLineNumber, lineContent, changeType)
    {
        var child = new TreeElement();
        child.selectable = false;
        this.appendChild(child);

        function appendLineNumber(lineNumber)
        {
            var numberString = lineNumber !== null ? numberToStringWithSpacesPadding(lineNumber + 1, 4) : spacesPadding(4);
            var lineNumberSpan = createElement("span");
            lineNumberSpan.classList.add("webkit-line-number");
            lineNumberSpan.textContent = numberString;
            child.listItemElement.appendChild(lineNumberSpan);
        }

        appendLineNumber(baseLineNumber);
        appendLineNumber(newLineNumber);

        var contentSpan = createElement("span");
        contentSpan.textContent = lineContent;
        child.listItemElement.appendChild(contentSpan);
        child.listItemElement.classList.add("revision-history-line");
        contentSpan.classList.add("revision-history-line-" + changeType);
    },

    allowRevert: function()
    {
        this._revertElement.classList.remove("hidden");
    },

    __proto__: TreeElement.prototype
}
