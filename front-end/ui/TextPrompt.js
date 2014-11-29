/*
 * Copyright (C) 2008 Apple Inc.  All rights reserved.
 * Copyright (C) 2011 Google Inc.  All rights reserved.
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
 * @extends {WebInspector.Object}
 * @implements {WebInspector.SuggestBoxDelegate}
 * @param {function(!Element, !Range, boolean, function(!Array.<string>, number=))} completions
 * @param {string=} stopCharacters
 */
WebInspector.TextPrompt = function(completions, stopCharacters)
{
    /**
     * @type {!Element|undefined}
     */
    this._proxyElement;
    this._proxyElementDisplay = "inline-block";
    this._loadCompletions = completions;
    this._completionStopCharacters = stopCharacters || " =:[({;,!+-*/&|^<>.";
    this._autocompletionTimeout = WebInspector.TextPrompt.DefaultAutocompletionTimeout;
}

WebInspector.TextPrompt.DefaultAutocompletionTimeout = 250;

WebInspector.TextPrompt.Events = {
    ItemApplied: "text-prompt-item-applied",
    ItemAccepted: "text-prompt-item-accepted"
};

WebInspector.TextPrompt.prototype = {
    /**
     * @param {number} timeout
     */
    setAutocompletionTimeout: function(timeout)
    {
        this._autocompletionTimeout = timeout;
    },

    get proxyElement()
    {
        return this._proxyElement;
    },

    /**
     * @param {boolean} suggestBoxEnabled
     */
    setSuggestBoxEnabled: function(suggestBoxEnabled)
    {
        this._suggestBoxEnabled = suggestBoxEnabled;
    },

    renderAsBlock: function()
    {
        this._proxyElementDisplay = "block";
    },

    /**
     * Clients should never attach any event listeners to the |element|. Instead,
     * they should use the result of this method to attach listeners for bubbling events.
     *
     * @param {!Element} element
     * @return {!Element}
     */
    attach: function(element)
    {
        return this._attachInternal(element);
    },

    /**
     * Clients should never attach any event listeners to the |element|. Instead,
     * they should use the result of this method to attach listeners for bubbling events
     * or the |blurListener| parameter to register a "blur" event listener on the |element|
     * (since the "blur" event does not bubble.)
     *
     * @param {!Element} element
     * @param {function(!Event)} blurListener
     * @return {!Element}
     */
    attachAndStartEditing: function(element, blurListener)
    {
        this._attachInternal(element);
        this._startEditing(blurListener);
        return this.proxyElement;
    },

    /**
     * @param {!Element} element
     * @return {!Element}
     */
    _attachInternal: function(element)
    {
        if (this.proxyElement)
            throw "Cannot attach an attached TextPrompt";
        this._element = element;

        this._boundOnKeyDown = this.onKeyDown.bind(this);
        this._boundOnInput = this.onInput.bind(this);
        this._boundOnMouseWheel = this.onMouseWheel.bind(this);
        this._boundSelectStart = this._selectStart.bind(this);
        this._boundRemoveSuggestionAids = this._removeSuggestionAids.bind(this);
        this._proxyElement = element.ownerDocument.createElement("span");
        this._proxyElement.style.display = this._proxyElementDisplay;
        element.parentElement.insertBefore(this.proxyElement, element);
        this.proxyElement.appendChild(element);
        this._element.classList.add("text-prompt");
        this._element.addEventListener("keydown", this._boundOnKeyDown, false);
        this._element.addEventListener("input", this._boundOnInput, false);
        this._element.addEventListener("mousewheel", this._boundOnMouseWheel, false);
        this._element.addEventListener("selectstart", this._boundSelectStart, false);
        this._element.addEventListener("blur", this._boundRemoveSuggestionAids, false);
        this._element.ownerDocument.defaultView.addEventListener("resize", this._boundRemoveSuggestionAids, false);

        if (this._suggestBoxEnabled)
            this._suggestBox = new WebInspector.SuggestBox(this);

        return this.proxyElement;
    },

    detach: function()
    {
        this._removeFromElement();
        this.proxyElement.parentElement.insertBefore(this._element, this.proxyElement);
        this.proxyElement.remove();
        delete this._proxyElement;
        this._element.classList.remove("text-prompt");
        WebInspector.restoreFocusFromElement(this._element);
    },

    /**
     * @type {string}
     */
    get text()
    {
        return this._element.textContent;
    },

    /**
     * @param {string} x
     */
    set text(x)
    {
        this._removeSuggestionAids();
        if (!x) {
            // Append a break element instead of setting textContent to make sure the selection is inside the prompt.
            this._element.removeChildren();
            this._element.createChild("br");
        } else {
            this._element.textContent = x;
        }

        this.moveCaretToEndOfPrompt();
        this._element.scrollIntoView();
    },

    _removeFromElement: function()
    {
        this.clearAutoComplete(true);
        this._element.removeEventListener("keydown", this._boundOnKeyDown, false);
        this._element.removeEventListener("input", this._boundOnInput, false);
        this._element.removeEventListener("selectstart", this._boundSelectStart, false);
        this._element.removeEventListener("blur", this._boundRemoveSuggestionAids, false);
        this._element.ownerDocument.defaultView.removeEventListener("resize", this._boundRemoveSuggestionAids, false);
        if (this._isEditing)
            this._stopEditing();
        if (this._suggestBox)
            this._suggestBox.removeFromElement();
    },

    /**
     * @param {function(!Event)=} blurListener
     */
    _startEditing: function(blurListener)
    {
        this._isEditing = true;
        this._element.classList.add("editing");
        if (blurListener) {
            this._blurListener = blurListener;
            this._element.addEventListener("blur", this._blurListener, false);
        }
        this._oldTabIndex = this._element.tabIndex;
        if (this._element.tabIndex < 0)
            this._element.tabIndex = 0;
        WebInspector.setCurrentFocusElement(this._element);
        if (!this.text)
            this._updateAutoComplete();
    },

    _stopEditing: function()
    {
        this._element.tabIndex = this._oldTabIndex;
        if (this._blurListener)
            this._element.removeEventListener("blur", this._blurListener, false);
        this._element.classList.remove("editing");
        delete this._isEditing;
    },

    _removeSuggestionAids: function()
    {
        this.clearAutoComplete();
        this.hideSuggestBox();
    },

    _selectStart: function()
    {
        if (this._selectionTimeout)
            clearTimeout(this._selectionTimeout);

        this._removeSuggestionAids();

        /**
         * @this {WebInspector.TextPrompt}
         */
        function moveBackIfOutside()
        {
            delete this._selectionTimeout;
            if (!this.isCaretInsidePrompt() && this._element.window().getSelection().isCollapsed) {
                this.moveCaretToEndOfPrompt();
                this.autoCompleteSoon();
            }
        }

        this._selectionTimeout = setTimeout(moveBackIfOutside.bind(this), 100);
    },

    /**
     * @param {boolean=} force
     */
    _updateAutoComplete: function(force)
    {
        this.clearAutoComplete();
        this.autoCompleteSoon(force);
    },

    /**
     * @param {!Event} event
     */
    onMouseWheel: function(event)
    {
        // Subclasses can implement.
    },

    /**
     * @param {!Event} event
     */
    onKeyDown: function(event)
    {
        var handled = false;
        delete this._needUpdateAutocomplete;

        switch (event.keyIdentifier) {
        case "U+0009": // Tab
            handled = this.tabKeyPressed(event);
            break;
        case "Left":
        case "Home":
            this._removeSuggestionAids();
            break;
        case "Right":
        case "End":
            if (this.isCaretAtEndOfPrompt())
                handled = this.acceptAutoComplete();
            else
                this._removeSuggestionAids();
            break;
        case "U+001B": // Esc
            if (this.isSuggestBoxVisible()) {
                this._removeSuggestionAids();
                handled = true;
            }
            break;
        case "U+0020": // Space
            if (event.ctrlKey && !event.metaKey && !event.altKey && !event.shiftKey) {
                this._updateAutoComplete(true);
                handled = true;
            }
            break;
        case "Alt":
        case "Meta":
        case "Shift":
        case "Control":
            break;
        }

        if (!handled && this.isSuggestBoxVisible())
            handled = this._suggestBox.keyPressed(event);

        if (!handled)
            this._needUpdateAutocomplete = true;

        if (handled)
            event.consume(true);
    },

    /**
     * @param {!Event} event
     */
    onInput: function(event)
    {
        if (this._needUpdateAutocomplete)
            this._updateAutoComplete();
    },

    /**
     * @return {boolean}
     */
    acceptAutoComplete: function()
    {
        var result = false;
        if (this.isSuggestBoxVisible())
            result = this._suggestBox.acceptSuggestion();
        if (!result)
            result = this._acceptSuggestionInternal();

        return result;
    },

    /**
     * @param {boolean=} includeTimeout
     */
    clearAutoComplete: function(includeTimeout)
    {
        if (includeTimeout && this._completeTimeout) {
            clearTimeout(this._completeTimeout);
            delete this._completeTimeout;
        }
        delete this._waitingForCompletions;

        if (!this.autoCompleteElement)
            return;

        this.autoCompleteElement.remove();
        delete this.autoCompleteElement;
        delete this._userEnteredRange;
        delete this._userEnteredText;
    },

    /**
     * @param {boolean=} force
     */
    autoCompleteSoon: function(force)
    {
        var immediately = this.isSuggestBoxVisible() || force;
        if (!this._completeTimeout)
            this._completeTimeout = setTimeout(this.complete.bind(this, force), immediately ? 0 : this._autocompletionTimeout);
    },

    /**
     * @param {boolean=} force
     * @param {boolean=} reverse
     */
    complete: function(force, reverse)
    {
        this.clearAutoComplete(true);
        var selection = this._element.window().getSelection();
        if (!selection.rangeCount)
            return;

        var selectionRange = selection.getRangeAt(0);
        var shouldExit;

        if (!force && !this.isCaretAtEndOfPrompt() && !this.isSuggestBoxVisible())
            shouldExit = true;
        else if (!selection.isCollapsed)
            shouldExit = true;
        else if (!force) {
            // BUG72018: Do not show suggest box if caret is followed by a non-stop character.
            var wordSuffixRange = selectionRange.startContainer.rangeOfWord(selectionRange.endOffset, this._completionStopCharacters, this._element, "forward");
            if (wordSuffixRange.toString().length)
                shouldExit = true;
        }
        if (shouldExit) {
            this.hideSuggestBox();
            return;
        }

        var wordPrefixRange = selectionRange.startContainer.rangeOfWord(selectionRange.startOffset, this._completionStopCharacters, this._element, "backward");
        this._waitingForCompletions = true;
        this._loadCompletions(this.proxyElement, wordPrefixRange, force || false, this._completionsReady.bind(this, selection, wordPrefixRange, !!reverse));
    },

    disableDefaultSuggestionForEmptyInput: function()
    {
        this._disableDefaultSuggestionForEmptyInput = true;
    },

    /**
     * @param {!Selection} selection
     * @param {!Range} textRange
     */
    _boxForAnchorAtStart: function(selection, textRange)
    {
        var rangeCopy = selection.getRangeAt(0).cloneRange();
        var anchorElement = createElement("span");
        anchorElement.textContent = "\u200B";
        textRange.insertNode(anchorElement);
        var box = anchorElement.boxInWindow(window);
        anchorElement.remove();
        selection.removeAllRanges();
        selection.addRange(rangeCopy);
        return box;
    },

    /**
     * @param {!Array.<string>} completions
     * @param {number} wordPrefixLength
     */
    _buildCommonPrefix: function(completions, wordPrefixLength)
    {
        var commonPrefix = completions[0];
        for (var i = 0; i < completions.length; ++i) {
            var completion = completions[i];
            var lastIndex = Math.min(commonPrefix.length, completion.length);
            for (var j = wordPrefixLength; j < lastIndex; ++j) {
                if (commonPrefix[j] !== completion[j]) {
                    commonPrefix = commonPrefix.substr(0, j);
                    break;
                }
            }
        }
        return commonPrefix;
    },

    /**
     * @return {?Range}
     * @suppressGlobalPropertiesCheck
     */
    _createRange: function()
    {
        return document.createRange();
    },

    /**
     * @param {!Selection} selection
     * @param {!Range} originalWordPrefixRange
     * @param {boolean} reverse
     * @param {!Array.<string>} completions
     * @param {number=} selectedIndex
     */
    _completionsReady: function(selection, originalWordPrefixRange, reverse, completions, selectedIndex)
    {
        if (!this._waitingForCompletions || !completions.length) {
            this.hideSuggestBox();
            return;
        }
        delete this._waitingForCompletions;

        var selectionRange = selection.getRangeAt(0);

        var fullWordRange = this._createRange();
        fullWordRange.setStart(originalWordPrefixRange.startContainer, originalWordPrefixRange.startOffset);
        fullWordRange.setEnd(selectionRange.endContainer, selectionRange.endOffset);

        if (originalWordPrefixRange.toString() + selectionRange.toString() !== fullWordRange.toString())
            return;

        selectedIndex = (this._disableDefaultSuggestionForEmptyInput && !this.text) ? -1 : (selectedIndex || 0);

        this._userEnteredRange = fullWordRange;
        this._userEnteredText = fullWordRange.toString();

        if (this._suggestBox)
            this._suggestBox.updateSuggestions(this._boxForAnchorAtStart(selection, fullWordRange), completions, selectedIndex, !this.isCaretAtEndOfPrompt(), this._userEnteredText);

        if (selectedIndex === -1)
            return;

        var wordPrefixLength = originalWordPrefixRange.toString().length;
        this._commonPrefix = this._buildCommonPrefix(completions, wordPrefixLength);

        if (this.isCaretAtEndOfPrompt()) {
            var completionText = completions[selectedIndex];
            var prefixText = this._userEnteredRange.toString();
            var suffixText = completionText.substring(wordPrefixLength);
            this._userEnteredRange.deleteContents();
            this._element.normalize();
            var finalSelectionRange = this._createRange();

            var prefixTextNode = createTextNode(prefixText);
            fullWordRange.insertNode(prefixTextNode);

            this.autoCompleteElement = createElementWithClass("span", "auto-complete-text");
            this.autoCompleteElement.textContent = suffixText;

            prefixTextNode.parentNode.insertBefore(this.autoCompleteElement, prefixTextNode.nextSibling);

            finalSelectionRange.setStart(prefixTextNode, wordPrefixLength);
            finalSelectionRange.setEnd(prefixTextNode, wordPrefixLength);
            selection.removeAllRanges();
            selection.addRange(finalSelectionRange);
            this.dispatchEventToListeners(WebInspector.TextPrompt.Events.ItemApplied);
        }
    },

    _completeCommonPrefix: function()
    {
        if (!this.autoCompleteElement || !this._commonPrefix || !this._userEnteredText || !this._commonPrefix.startsWith(this._userEnteredText))
            return;

        if (!this.isSuggestBoxVisible()) {
            this.acceptAutoComplete();
            return;
        }

        this.autoCompleteElement.textContent = this._commonPrefix.substring(this._userEnteredText.length);
        this._acceptSuggestionInternal(true);
    },

    /**
     * @param {string} completionText
     * @param {boolean=} isIntermediateSuggestion
     */
    applySuggestion: function(completionText, isIntermediateSuggestion)
    {
        this._applySuggestion(completionText, isIntermediateSuggestion);
    },

    /**
     * @param {string} completionText
     * @param {boolean=} isIntermediateSuggestion
     * @param {!Range=} originalPrefixRange
     */
    _applySuggestion: function(completionText, isIntermediateSuggestion, originalPrefixRange)
    {
        var wordPrefixLength;
        if (originalPrefixRange)
            wordPrefixLength = originalPrefixRange.toString().length;
        else
            wordPrefixLength = this._userEnteredText ? this._userEnteredText.length : 0;

        this._userEnteredRange.deleteContents();
        this._element.normalize();
        var finalSelectionRange = this._createRange();
        var completionTextNode = createTextNode(completionText);
        this._userEnteredRange.insertNode(completionTextNode);
        if (this.autoCompleteElement) {
            this.autoCompleteElement.remove();
            delete this.autoCompleteElement;
        }

        if (isIntermediateSuggestion)
            finalSelectionRange.setStart(completionTextNode, wordPrefixLength);
        else
            finalSelectionRange.setStart(completionTextNode, completionText.length);

        finalSelectionRange.setEnd(completionTextNode, completionText.length);

        var selection = this._element.window().getSelection();
        selection.removeAllRanges();
        selection.addRange(finalSelectionRange);
        if (isIntermediateSuggestion)
            this.dispatchEventToListeners(WebInspector.TextPrompt.Events.ItemApplied, { itemText: completionText });
    },

    /**
     * @override
     */
    acceptSuggestion: function()
    {
        this._acceptSuggestionInternal();
    },

    /**
     * @param {boolean=} prefixAccepted
     * @return {boolean}
     */
    _acceptSuggestionInternal: function(prefixAccepted)
    {
        if (!this.autoCompleteElement || !this.autoCompleteElement.parentNode)
            return false;

        var text = this.autoCompleteElement.textContent;
        var textNode = createTextNode(text);
        this.autoCompleteElement.parentNode.replaceChild(textNode, this.autoCompleteElement);
        delete this.autoCompleteElement;

        var finalSelectionRange = this._createRange();
        finalSelectionRange.setStart(textNode, text.length);
        finalSelectionRange.setEnd(textNode, text.length);

        var selection = this._element.window().getSelection();
        selection.removeAllRanges();
        selection.addRange(finalSelectionRange);

        if (!prefixAccepted) {
            this.hideSuggestBox();
            this.dispatchEventToListeners(WebInspector.TextPrompt.Events.ItemAccepted);
        } else
            this.autoCompleteSoon(true);

        return true;
    },

    hideSuggestBox: function()
    {
        if (this.isSuggestBoxVisible())
            this._suggestBox.hide();
    },

    /**
     * @return {boolean}
     */
    isSuggestBoxVisible: function()
    {
        return this._suggestBox && this._suggestBox.visible();
    },

    /**
     * @return {boolean}
     */
    isCaretInsidePrompt: function()
    {
        return this._element.isInsertionCaretInside();
    },

    /**
     * @return {boolean}
     */
    isCaretAtEndOfPrompt: function()
    {
        var selection = this._element.window().getSelection();
        if (!selection.rangeCount || !selection.isCollapsed)
            return false;

        var selectionRange = selection.getRangeAt(0);
        var node = selectionRange.startContainer;
        if (!node.isSelfOrDescendant(this._element))
            return false;

        if (node.nodeType === Node.TEXT_NODE && selectionRange.startOffset < node.nodeValue.length)
            return false;

        var foundNextText = false;
        while (node) {
            if (node.nodeType === Node.TEXT_NODE && node.nodeValue.length) {
                if (foundNextText && (!this.autoCompleteElement || !this.autoCompleteElement.isAncestor(node)))
                    return false;
                foundNextText = true;
            }

            node = node.traverseNextNode(this._element);
        }

        return true;
    },

    /**
     * @return {boolean}
     */
    isCaretOnFirstLine: function()
    {
        var selection = this._element.window().getSelection();
        var focusNode = selection.focusNode;
        if (!focusNode || focusNode.nodeType !== Node.TEXT_NODE || focusNode.parentNode !== this._element)
            return true;

        if (focusNode.textContent.substring(0, selection.focusOffset).indexOf("\n") !== -1)
            return false;
        focusNode = focusNode.previousSibling;

        while (focusNode) {
            if (focusNode.nodeType !== Node.TEXT_NODE)
                return true;
            if (focusNode.textContent.indexOf("\n") !== -1)
                return false;
            focusNode = focusNode.previousSibling;
        }

        return true;
    },

    /**
     * @return {boolean}
     */
    isCaretOnLastLine: function()
    {
        var selection = this._element.window().getSelection();
        var focusNode = selection.focusNode;
        if (!focusNode || focusNode.nodeType !== Node.TEXT_NODE || focusNode.parentNode !== this._element)
            return true;

        if (focusNode.textContent.substring(selection.focusOffset).indexOf("\n") !== -1)
            return false;
        focusNode = focusNode.nextSibling;

        while (focusNode) {
            if (focusNode.nodeType !== Node.TEXT_NODE)
                return true;
            if (focusNode.textContent.indexOf("\n") !== -1)
                return false;
            focusNode = focusNode.nextSibling;
        }

        return true;
    },

    moveCaretToEndOfPrompt: function()
    {
        var selection = this._element.window().getSelection();
        var selectionRange = this._createRange();

        var offset = this._element.childNodes.length;
        selectionRange.setStart(this._element, offset);
        selectionRange.setEnd(this._element, offset);

        selection.removeAllRanges();
        selection.addRange(selectionRange);
    },

    /**
     * @param {!Event} event
     * @return {boolean}
     */
    tabKeyPressed: function(event)
    {
        this._completeCommonPrefix();

        // Consume the key.
        return true;
    },

    __proto__: WebInspector.Object.prototype
}


/**
 * @constructor
 * @extends {WebInspector.TextPrompt}
 * @param {function(!Element, !Range, boolean, function(!Array.<string>, number=))} completions
 * @param {string=} stopCharacters
 */
WebInspector.TextPromptWithHistory = function(completions, stopCharacters)
{
    WebInspector.TextPrompt.call(this, completions, stopCharacters);

    /**
     * @type {!Array.<string>}
     */
    this._data = [];

    /**
     * 1-based entry in the history stack.
     * @type {number}
     */
    this._historyOffset = 1;

    /**
     * Whether to coalesce duplicate items in the history, default is true.
     * @type {boolean}
     */
    this._coalesceHistoryDupes = true;
}

WebInspector.TextPromptWithHistory.prototype = {
    /**
     * @return {!Array.<string>}
     */
    get historyData()
    {
        // FIXME: do we need to copy this?
        return this._data;
    },

    /**
     * @param {boolean} x
     */
    setCoalesceHistoryDupes: function(x)
    {
        this._coalesceHistoryDupes = x;
    },

    /**
     * @param {!Array.<string>} data
     */
    setHistoryData: function(data)
    {
        this._data = [].concat(data);
        this._historyOffset = 1;
    },

    /**
     * Pushes a committed text into the history.
     * @param {string} text
     */
    pushHistoryItem: function(text)
    {
        if (this._uncommittedIsTop) {
            this._data.pop();
            delete this._uncommittedIsTop;
        }

        this._historyOffset = 1;
        if (this._coalesceHistoryDupes && text === this._currentHistoryItem())
            return;
        this._data.push(text);
    },

    /**
     * Pushes the current (uncommitted) text into the history.
     */
    _pushCurrentText: function()
    {
        if (this._uncommittedIsTop)
            this._data.pop(); // Throw away obsolete uncommitted text.
        this._uncommittedIsTop = true;
        this.clearAutoComplete(true);
        this._data.push(this.text);
    },

    /**
     * @return {string|undefined}
     */
    _previous: function()
    {
        if (this._historyOffset > this._data.length)
            return undefined;
        if (this._historyOffset === 1)
            this._pushCurrentText();
        ++this._historyOffset;
        return this._currentHistoryItem();
    },

    /**
     * @return {string|undefined}
     */
    _next: function()
    {
        if (this._historyOffset === 1)
            return undefined;
        --this._historyOffset;
        return this._currentHistoryItem();
    },

    /**
     * @return {string|undefined}
     */
    _currentHistoryItem: function()
    {
        return this._data[this._data.length - this._historyOffset];
    },

    /**
     * @override
     */
    onKeyDown: function(event)
    {
        var newText;
        var isPrevious;

        switch (event.keyIdentifier) {
        case "Up":
            if (!this.isCaretOnFirstLine() || this.isSuggestBoxVisible())
                break;
            newText = this._previous();
            isPrevious = true;
            break;
        case "Down":
            if (!this.isCaretOnLastLine() || this.isSuggestBoxVisible())
                break;
            newText = this._next();
            break;
        case "U+0050": // Ctrl+P = Previous
            if (WebInspector.isMac() && event.ctrlKey && !event.metaKey && !event.altKey && !event.shiftKey) {
                newText = this._previous();
                isPrevious = true;
            }
            break;
        case "U+004E": // Ctrl+N = Next
            if (WebInspector.isMac() && event.ctrlKey && !event.metaKey && !event.altKey && !event.shiftKey)
                newText = this._next();
            break;
        }

        if (newText !== undefined) {
            event.consume(true);
            this.text = newText;

            if (isPrevious) {
                var firstNewlineIndex = this.text.indexOf("\n");
                if (firstNewlineIndex === -1)
                    this.moveCaretToEndOfPrompt();
                else {
                    var selection = this._element.window().getSelection();
                    var selectionRange = this._createRange();

                    selectionRange.setStart(this._element.firstChild, firstNewlineIndex);
                    selectionRange.setEnd(this._element.firstChild, firstNewlineIndex);

                    selection.removeAllRanges();
                    selection.addRange(selectionRange);
                }
            }

            return;
        }

        WebInspector.TextPrompt.prototype.onKeyDown.apply(this, arguments);
    },

    __proto__: WebInspector.TextPrompt.prototype
}

