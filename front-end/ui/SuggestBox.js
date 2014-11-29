/*
 * Copyright (C) 2013 Google Inc. All rights reserved.
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
 * @interface
 */
WebInspector.SuggestBoxDelegate = function()
{
}

WebInspector.SuggestBoxDelegate.prototype = {
    /**
     * @param {string} suggestion
     * @param {boolean=} isIntermediateSuggestion
     */
    applySuggestion: function(suggestion, isIntermediateSuggestion) { },

    /**
     * acceptSuggestion will be always called after call to applySuggestion with isIntermediateSuggestion being equal to false.
     */
    acceptSuggestion: function() { },
}

/**
 * @constructor
 * @param {!WebInspector.SuggestBoxDelegate} suggestBoxDelegate
 * @param {number=} maxItemsHeight
 */
WebInspector.SuggestBox = function(suggestBoxDelegate, maxItemsHeight)
{
    this._suggestBoxDelegate = suggestBoxDelegate;
    this._length = 0;
    this._selectedIndex = -1;
    this._selectedElement = null;
    this._maxItemsHeight = maxItemsHeight;
    this._maybeHideBound = this._maybeHide.bind(this);
    this._element = createElementWithClass("div", "suggest-box");
    this._element.addEventListener("mousedown", this._onBoxMouseDown.bind(this), true);
}

WebInspector.SuggestBox.prototype = {
    /**
     * @return {boolean}
     */
    visible: function()
    {
        return !!this._element.parentElement;
    },

    /**
     * @param {!AnchorBox} anchorBox
     */
    setPosition: function(anchorBox)
    {
        this._updateBoxPosition(anchorBox);
    },

    /**
     * @param {!AnchorBox} anchorBox
     */
    _updateBoxPosition: function(anchorBox)
    {
        console.assert(this._overlay);
        if (this._lastAnchorBox && this._lastAnchorBox.equals(anchorBox))
            return;
        this._lastAnchorBox = anchorBox;

        // Position relative to main DevTools element.
        var container = WebInspector.Dialog.modalHostView().element;
        anchorBox = anchorBox.relativeToElement(container);
        var totalWidth = container.offsetWidth;
        var totalHeight = container.offsetHeight;
        var aboveHeight = anchorBox.y;
        var underHeight = totalHeight - anchorBox.y - anchorBox.height;

        var rowHeight = 17;
        const spacer = 6;

        var maxHeight = this._maxItemsHeight ? this._maxItemsHeight * rowHeight : Math.max(underHeight, aboveHeight) - spacer;
        var under = underHeight >= aboveHeight;
        this._leftSpacerElement.style.flexBasis = anchorBox.x + "px";

        this._overlay.element.classList.toggle("under-anchor", under);

        if (under) {
            this._bottomSpacerElement.style.flexBasis = "auto";
            this._topSpacerElement.style.flexBasis = (anchorBox.y + anchorBox.height) + "px";
        } else {
            this._bottomSpacerElement.style.flexBasis = (totalHeight - anchorBox.y) + "px";
            this._topSpacerElement.style.flexBasis = "auto";
        }
        this._element.style.maxHeight = maxHeight + "px";
    },

    /**
     * @param {!Event} event
     */
    _onBoxMouseDown: function(event)
    {
        if (this._hideTimeoutId) {
            window.clearTimeout(this._hideTimeoutId);
            delete this._hideTimeoutId;
        }
        event.preventDefault();
    },

    _maybeHide: function()
    {
        if (!this._hideTimeoutId)
            this._hideTimeoutId = window.setTimeout(this.hide.bind(this), 0);
    },

    /**
     * // FIXME: make SuggestBox work for multiple documents.
     * @suppressGlobalPropertiesCheck
     */
    _show: function()
    {
        if (this.visible())
            return;
        this._overlay = new WebInspector.SuggestBox.Overlay();
        this._bodyElement = document.body;
        this._bodyElement.addEventListener("mousedown", this._maybeHideBound, true);

        this._leftSpacerElement = this._overlay.element.createChild("div", "suggest-box-left-spacer");
        this._horizontalElement = this._overlay.element.createChild("div", "suggest-box-horizontal");
        this._topSpacerElement = this._horizontalElement.createChild("div", "suggest-box-top-spacer");
        this._horizontalElement.appendChild(this._element);
        this._bottomSpacerElement = this._horizontalElement.createChild("div", "suggest-box-bottom-spacer");
    },

    hide: function()
    {
        if (!this.visible())
            return;

        this._bodyElement.removeEventListener("mousedown", this._maybeHideBound, true);
        delete this._bodyElement;
        this._element.remove();
        this._overlay.dispose();
        delete this._overlay;
        delete this._selectedElement;
        this._selectedIndex = -1;
        delete this._lastAnchorBox;
    },

    removeFromElement: function()
    {
        this.hide();
    },

    /**
     * @param {boolean=} isIntermediateSuggestion
     */
    _applySuggestion: function(isIntermediateSuggestion)
    {
        if (!this.visible() || !this._selectedElement)
            return false;

        var suggestion = this._selectedElement.textContent;
        if (!suggestion)
            return false;

        this._suggestBoxDelegate.applySuggestion(suggestion, isIntermediateSuggestion);
        return true;
    },

    /**
     * @return {boolean}
     */
    acceptSuggestion: function()
    {
        var result = this._applySuggestion();
        this.hide();
        if (!result)
            return false;

        this._suggestBoxDelegate.acceptSuggestion();

        return true;
    },

    /**
     * @param {number} shift
     * @param {boolean=} isCircular
     * @return {boolean} is changed
     */
    _selectClosest: function(shift, isCircular)
    {
        if (!this._length)
            return false;

        if (this._selectedIndex === -1 && shift < 0)
            shift += 1;

        var index = this._selectedIndex + shift;

        if (isCircular)
            index = (this._length + index) % this._length;
        else
            index = Number.constrain(index, 0, this._length - 1);

        this._selectItem(index, true);
        this._applySuggestion(true);
        return true;
    },

    /**
     * @param {!Event} event
     */
    _onItemMouseDown: function(event)
    {
        this._selectedElement = event.currentTarget;
        this.acceptSuggestion();
        event.consume(true);
    },

    /**
     * @param {string} prefix
     * @param {string} text
     */
    _createItemElement: function(prefix, text)
    {
        var element = createElementWithClass("div", "suggest-box-content-item source-code");
        element.tabIndex = -1;
        if (prefix && prefix.length && !text.indexOf(prefix)) {
            element.createChild("span", "prefix").textContent = prefix;
            element.createChild("span", "suffix").textContent = text.substring(prefix.length);
        } else {
            element.createChild("span", "suffix").textContent = text;
        }
        element.createChild("span", "spacer");
        element.addEventListener("mousedown", this._onItemMouseDown.bind(this), false);
        return element;
    },

    /**
     * @param {!Array.<string>} items
     * @param {string} userEnteredText
     */
    _updateItems: function(items, userEnteredText)
    {
        this._length = items.length;
        this._element.removeChildren();
        delete this._selectedElement;

        for (var i = 0; i < items.length; ++i) {
            var item = items[i];
            var currentItemElement = this._createItemElement(userEnteredText, item);
            this._element.appendChild(currentItemElement);
        }
    },

    /**
     * @param {number} index
     * @param {boolean} scrollIntoView
     */
    _selectItem: function(index, scrollIntoView)
    {
        if (this._selectedElement)
            this._selectedElement.classList.remove("selected");

        this._selectedIndex = index;
        if (index < 0)
            return;

        this._selectedElement = this._element.children[index];
        this._selectedElement.classList.add("selected");

        if (scrollIntoView)
            this._selectedElement.scrollIntoViewIfNeeded(false);
    },

    /**
     * @param {!Array.<string>} completions
     * @param {boolean} canShowForSingleItem
     * @param {string} userEnteredText
     */
    _canShowBox: function(completions, canShowForSingleItem, userEnteredText)
    {
        if (!completions || !completions.length)
            return false;

        if (completions.length > 1)
            return true;

        // Do not show a single suggestion if it is the same as user-entered prefix, even if allowed to show single-item suggest boxes.
        return canShowForSingleItem && completions[0] !== userEnteredText;
    },

    _ensureRowCountPerViewport: function()
    {
        if (this._rowCountPerViewport)
            return;
        if (!this._element.firstChild)
            return;

        this._rowCountPerViewport = Math.floor(this._element.offsetHeight / this._element.firstChild.offsetHeight);
    },

    /**
     * @param {!AnchorBox} anchorBox
     * @param {!Array.<string>} completions
     * @param {number} selectedIndex
     * @param {boolean} canShowForSingleItem
     * @param {string} userEnteredText
     */
    updateSuggestions: function(anchorBox, completions, selectedIndex, canShowForSingleItem, userEnteredText)
    {
        if (this._canShowBox(completions, canShowForSingleItem, userEnteredText)) {
            this._updateItems(completions, userEnteredText);
            this._show();
            this._updateBoxPosition(anchorBox);
            this._selectItem(selectedIndex, selectedIndex > 0);
            delete this._rowCountPerViewport;
        } else
            this.hide();
    },

    /**
     * @param {!KeyboardEvent} event
     * @return {boolean}
     */
    keyPressed: function(event)
    {
        switch (event.keyIdentifier) {
        case "Up":
            return this.upKeyPressed();
        case "Down":
            return this.downKeyPressed();
        case "PageUp":
            return this.pageUpKeyPressed();
        case "PageDown":
            return this.pageDownKeyPressed();
        case "Enter":
            return this.enterKeyPressed();
        }
        return false;
    },

    /**
     * @return {boolean}
     */
    upKeyPressed: function()
    {
        return this._selectClosest(-1, true);
    },

    /**
     * @return {boolean}
     */
    downKeyPressed: function()
    {
        return this._selectClosest(1, true);
    },

    /**
     * @return {boolean}
     */
    pageUpKeyPressed: function()
    {
        this._ensureRowCountPerViewport();
        return this._selectClosest(-this._rowCountPerViewport, false);
    },

    /**
     * @return {boolean}
     */
    pageDownKeyPressed: function()
    {
        this._ensureRowCountPerViewport();
        return this._selectClosest(this._rowCountPerViewport, false);
    },

    /**
     * @return {boolean}
     */
    enterKeyPressed: function()
    {
        var hasSelectedItem = !!this._selectedElement;
        this.acceptSuggestion();

        // Report the event as non-handled if there is no selected item,
        // to commit the input or handle it otherwise.
        return hasSelectedItem;
    }
}

/**
 * @constructor
 * // FIXME: make SuggestBox work for multiple documents.
 * @suppressGlobalPropertiesCheck
 */
WebInspector.SuggestBox.Overlay = function()
{
    this.element = createElementWithClass("div", "suggest-box-overlay");
    this._resize();
    document.body.appendChild(this.element);
}

WebInspector.SuggestBox.Overlay.prototype = {
    _resize: function()
    {
        var container = WebInspector.Dialog.modalHostView().element;
        var containerBox = container.boxInWindow(container.ownerDocument.defaultView);

        this.element.style.left = containerBox.x + "px";
        this.element.style.top = containerBox.y + "px";
        this.element.style.height = containerBox.height + "px";
        this.element.style.width = containerBox.width + "px";
    },

    dispose: function()
    {
        this.element.remove();
    }
}
