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
 * @constructor
 * @param {!WebInspector.ViewportControl.Provider} provider
 */
WebInspector.ViewportControl = function(provider)
{
    this.element = createElement("div");
    this.element.style.overflow = "auto";
    this._topGapElement = this.element.createChild("div", "viewport-control-gap-element");
    this._topGapElement.textContent = ".";
    this._topGapElement.style.height = "0px";
    this._contentElement = this.element.createChild("div");
    this._bottomGapElement = this.element.createChild("div", "viewport-control-gap-element");
    this._bottomGapElement.textContent = ".";
    this._bottomGapElement.style.height = "0px";

    this._provider = provider;
    this.element.addEventListener("scroll", this._onScroll.bind(this), false);
    this.element.addEventListener("copy", this._onCopy.bind(this), false);
    this.element.addEventListener("dragstart", this._onDragStart.bind(this), false);

    this._firstVisibleIndex = 0;
    this._lastVisibleIndex = -1;
    this._renderedItems = [];
    this._anchorSelection = null;
    this._headSelection = null;
    this._stickToBottom = false;
    this._scrolledToBottom = true;
}

/**
 * @interface
 */
WebInspector.ViewportControl.Provider = function()
{
}

WebInspector.ViewportControl.Provider.prototype = {
    /**
     * @param {number} index
     * @return {number}
     */
    fastHeight: function(index) { return 0; },

    /**
     * @return {number}
     */
    itemCount: function() { return 0; },

    /**
     * @return {number}
     */
    minimumRowHeight: function() { return 0; },

    /**
     * @param {number} index
     * @return {?WebInspector.ViewportElement}
     */
    itemElement: function(index) { return null; }
}

/**
 * @interface
 */
WebInspector.ViewportElement = function() { }
WebInspector.ViewportElement.prototype = {
    cacheFastHeight: function() { },

    willHide: function() { },

    wasShown: function() { },

    /**
     * @return {!Element}
     */
    element: function() { },
}

/**
 * @constructor
 * @implements {WebInspector.ViewportElement}
 * @param {!Element} element
 */
WebInspector.StaticViewportElement = function(element)
{
    this._element = element;
}

WebInspector.StaticViewportElement.prototype = {
    /**
     * @override
     */
    cacheFastHeight: function() { },

    /**
     * @override
     */
    willHide: function() { },

    /**
     * @override
     */
    wasShown: function() { },

    /**
     * @override
     * @return {!Element}
     */
    element: function()
    {
        return this._element;
    },
}

WebInspector.ViewportControl.prototype = {
    /**
     * @return {boolean}
     */
    scrolledToBottom: function()
    {
        return this._scrolledToBottom;
    },

    /**
     * @param {boolean} value
     */
    setStickToBottom: function(value)
    {
        this._stickToBottom = value;
    },

    /**
     * @param {!Event} event
     */
    _onCopy: function(event)
    {
        var text = this._selectedText();
        if (!text)
            return;
        event.preventDefault();
        event.clipboardData.setData("text/plain", text);
    },

    /**
     * @param {!Event} event
     */
    _onDragStart: function(event)
    {
        var text = this._selectedText();
        if (!text)
            return false;
        event.dataTransfer.clearData();
        event.dataTransfer.setData("text/plain", text);
        event.dataTransfer.effectAllowed = "copy";
        return true;
    },

    /**
     * @return {!Element}
     */
    contentElement: function()
    {
        return this._contentElement;
    },

    invalidate: function()
    {
        delete this._cumulativeHeights;
        delete this._cachedProviderElements;
        this.refresh();
    },

    /**
     * @param {number} index
     * @return {?WebInspector.ViewportElement}
     */
    _providerElement: function(index)
    {
        if (!this._cachedProviderElements)
            this._cachedProviderElements = new Array(this._provider.itemCount());
        var element = this._cachedProviderElements[index];
        if (!element) {
            element = this._provider.itemElement(index);
            this._cachedProviderElements[index] = element;
        }
        return element;
    },

    _rebuildCumulativeHeightsIfNeeded: function()
    {
        if (this._cumulativeHeights)
            return;
        var itemCount = this._provider.itemCount();
        if (!itemCount)
            return;
        this._cumulativeHeights = new Int32Array(itemCount);
        this._cumulativeHeights[0] = this._provider.fastHeight(0);
        for (var i = 1; i < itemCount; ++i)
            this._cumulativeHeights[i] = this._cumulativeHeights[i - 1] + this._provider.fastHeight(i);
    },

    /**
     * @param {number} index
     * @return {number}
     */
    _cachedItemHeight: function(index)
    {
        return index === 0 ? this._cumulativeHeights[0] : this._cumulativeHeights[index] - this._cumulativeHeights[index - 1];
    },

    /**
     * @param {?Selection} selection
     * @suppressGlobalPropertiesCheck
     */
    _isSelectionBackwards: function(selection)
    {
        if (!selection || !selection.rangeCount)
            return false;
        var range = document.createRange();
        range.setStart(selection.anchorNode, selection.anchorOffset);
        range.setEnd(selection.focusNode, selection.focusOffset);
        return range.collapsed;
    },

    /**
     * @param {number} itemIndex
     * @param {!Node} node
     * @param {number} offset
     * @return {!{item: number, node: !Node, offset: number}}
     */
    _createSelectionModel: function(itemIndex, node, offset)
    {
        return {
            item: itemIndex,
            node: node,
            offset: offset
        };
    },

    /**
     * @param {?Selection} selection
     */
    _updateSelectionModel: function(selection)
    {
        if (!selection || !selection.rangeCount) {
            this._headSelection = null;
            this._anchorSelection = null;
            return false;
        }

        var firstSelected = Number.MAX_VALUE;
        var lastSelected = -1;

        var range = selection.getRangeAt(0);
        var hasVisibleSelection = false;
        for (var i = 0; i < this._renderedItems.length; ++i) {
            if (range.intersectsNode(this._renderedItems[i].element())) {
                var index = i + this._firstVisibleIndex;
                firstSelected = Math.min(firstSelected, index);
                lastSelected = Math.max(lastSelected, index);
                hasVisibleSelection = true;
            }
        }
        if (hasVisibleSelection) {
            firstSelected = this._createSelectionModel(firstSelected, /** @type {!Node} */(range.startContainer), range.startOffset);
            lastSelected = this._createSelectionModel(lastSelected, /** @type {!Node} */(range.endContainer), range.endOffset);
        }
        var topOverlap = range.intersectsNode(this._topGapElement) && this._topGapElement._active;
        var bottomOverlap = range.intersectsNode(this._bottomGapElement) && this._bottomGapElement._active;
        if (!topOverlap && !bottomOverlap && !hasVisibleSelection) {
            this._headSelection = null;
            this._anchorSelection = null;
            return false;
        }

        if (!this._anchorSelection || !this._headSelection) {
            this._anchorSelection = this._createSelectionModel(0, this.element, 0);
            this._headSelection = this._createSelectionModel(this._provider.itemCount() - 1, this.element, this.element.children.length);
            this._selectionIsBackward = false;
        }

        var isBackward = this._isSelectionBackwards(selection);
        var startSelection = this._selectionIsBackward ? this._headSelection : this._anchorSelection;
        var endSelection = this._selectionIsBackward ? this._anchorSelection : this._headSelection;
        if (topOverlap && bottomOverlap && hasVisibleSelection) {
            firstSelected = firstSelected.item < startSelection.item ? firstSelected : startSelection;
            lastSelected = lastSelected.item > endSelection.item ? lastSelected : endSelection;
        } else if (!hasVisibleSelection) {
            firstSelected = startSelection;
            lastSelected = endSelection;
        } else if (topOverlap)
            firstSelected = isBackward ? this._headSelection : this._anchorSelection;
        else if (bottomOverlap)
            lastSelected = isBackward ? this._anchorSelection : this._headSelection;

        if (isBackward) {
            this._anchorSelection = lastSelected;
            this._headSelection = firstSelected;
        } else {
            this._anchorSelection = firstSelected;
            this._headSelection = lastSelected;
        }
        this._selectionIsBackward = isBackward;
        return true;
    },

    /**
     * @param {?Selection} selection
     */
    _restoreSelection: function(selection)
    {
        var anchorElement = null;
        var anchorOffset;
        if (this._firstVisibleIndex <= this._anchorSelection.item && this._anchorSelection.item <= this._lastVisibleIndex) {
            anchorElement = this._anchorSelection.node;
            anchorOffset = this._anchorSelection.offset;
        } else {
            if (this._anchorSelection.item < this._firstVisibleIndex)
                anchorElement = this._topGapElement;
            else if (this._anchorSelection.item > this._lastVisibleIndex)
                anchorElement = this._bottomGapElement;
            anchorOffset = this._selectionIsBackward ? 1 : 0;
        }

        var headElement = null;
        var headOffset;
        if (this._firstVisibleIndex <= this._headSelection.item && this._headSelection.item <= this._lastVisibleIndex) {
            headElement = this._headSelection.node;
            headOffset = this._headSelection.offset;
        } else {
            if (this._headSelection.item < this._firstVisibleIndex)
                headElement = this._topGapElement;
            else if (this._headSelection.item > this._lastVisibleIndex)
                headElement = this._bottomGapElement;
            headOffset = this._selectionIsBackward ? 0 : 1;
        }

        selection.setBaseAndExtent(anchorElement, anchorOffset, headElement, headOffset);
    },

    refresh: function()
    {
        if (!this._visibleHeight())
            return;  // Do nothing for invisible controls.

        var itemCount = this._provider.itemCount();
        if (!itemCount) {
            for (var i = 0; i < this._renderedItems.length; ++i)
                this._renderedItems[i].cacheFastHeight();
            for (var i = 0; i < this._renderedItems.length; ++i)
                this._renderedItems[i].willHide();
            this._renderedItems = [];
            this._contentElement.removeChildren();
            this._topGapElement.style.height = "0px";
            this._bottomGapElement.style.height = "0px";
            this._firstVisibleIndex = -1;
            this._lastVisibleIndex = -1;
            return;
        }

        var selection = this.element.getComponentSelection();
        var shouldRestoreSelection = this._updateSelectionModel(selection);

        var visibleFrom = this.element.scrollTop;
        var visibleHeight = this._visibleHeight();
        this._scrolledToBottom = this.element.isScrolledToBottom();
        var isInvalidating = !this._cumulativeHeights;

        if (this._cumulativeHeights && itemCount !== this._cumulativeHeights.length)
            delete this._cumulativeHeights;
        for (var i = 0; i < this._renderedItems.length; ++i) {
            this._renderedItems[i].cacheFastHeight();
            // Tolerate 1-pixel error due to double-to-integer rounding errors.
            if (this._cumulativeHeights && Math.abs(this._cachedItemHeight(this._firstVisibleIndex + i) - this._provider.fastHeight(i + this._firstVisibleIndex)) > 1)
                delete this._cumulativeHeights;
        }
        this._rebuildCumulativeHeightsIfNeeded();
        var oldFirstVisibleIndex = this._firstVisibleIndex;
        var oldLastVisibleIndex = this._lastVisibleIndex;

        var shouldStickToBottom = this._stickToBottom && this._scrolledToBottom;
        if (shouldStickToBottom) {
            this._lastVisibleIndex = itemCount - 1;
            this._firstVisibleIndex = Math.max(itemCount - Math.ceil(visibleHeight / this._provider.minimumRowHeight()), 0);
        } else {
            this._firstVisibleIndex = Math.max(Array.prototype.lowerBound.call(this._cumulativeHeights, visibleFrom + 1), 0);
            // Proactively render more rows in case some of them will be collapsed without triggering refresh. @see crbug.com/390169
            this._lastVisibleIndex = this._firstVisibleIndex + Math.ceil(visibleHeight / this._provider.minimumRowHeight()) - 1;
            this._lastVisibleIndex = Math.min(this._lastVisibleIndex, itemCount - 1);
        }
        var topGapHeight = this._cumulativeHeights[this._firstVisibleIndex - 1] || 0;
        var bottomGapHeight = this._cumulativeHeights[this._cumulativeHeights.length - 1] - this._cumulativeHeights[this._lastVisibleIndex];

        this._topGapElement.style.height = topGapHeight + "px";
        this._bottomGapElement.style.height = bottomGapHeight + "px";
        this._topGapElement._active = !!topGapHeight;
        this._bottomGapElement._active = !!bottomGapHeight;

        this._contentElement.style.setProperty("height", "10000000px");
        if (isInvalidating)
            this._fullViewportUpdate();
        else
            this._partialViewportUpdate(oldFirstVisibleIndex, oldLastVisibleIndex);
        this._contentElement.style.removeProperty("height");
        // Should be the last call in the method as it might force layout.
        if (shouldRestoreSelection)
            this._restoreSelection(selection);
        if (shouldStickToBottom)
            this.element.scrollTop = this.element.scrollHeight;
    },

    _fullViewportUpdate: function()
    {
        for (var i = 0; i < this._renderedItems.length; ++i)
            this._renderedItems[i].willHide();
        this._renderedItems = [];
        this._contentElement.removeChildren();
        for (var i = this._firstVisibleIndex; i <= this._lastVisibleIndex; ++i) {
            var viewportElement = this._providerElement(i);
            this._contentElement.appendChild(viewportElement.element());
            this._renderedItems.push(viewportElement);
            viewportElement.wasShown();
        }
    },

    /**
     * @param {number} oldFirstVisibleIndex
     * @param {number} oldLastVisibleIndex
     */
    _partialViewportUpdate: function(oldFirstVisibleIndex, oldLastVisibleIndex)
    {
        var willBeHidden = [];
        for (var i = 0; i < this._renderedItems.length; ++i) {
            var index = oldFirstVisibleIndex + i;
            if (index < this._firstVisibleIndex || this._lastVisibleIndex < index)
                willBeHidden.push(this._renderedItems[i]);
        }
        for (var i = 0; i < willBeHidden.length; ++i)
            willBeHidden[i].willHide();
        for (var i = 0; i < willBeHidden.length; ++i)
            willBeHidden[i].element().remove();

        this._renderedItems = [];
        var anchor = this._contentElement.firstChild;
        for (var i = this._firstVisibleIndex; i <= this._lastVisibleIndex; ++i) {
            var viewportElement = this._providerElement(i);
            var element = viewportElement.element();
            if (element !== anchor) {
                this._contentElement.insertBefore(element, anchor);
                viewportElement.wasShown();
            } else {
                anchor = anchor.nextSibling;
            }
            this._renderedItems.push(viewportElement);
        }
    },

    /**
     * @return {?string}
     */
    _selectedText: function()
    {
        this._updateSelectionModel(this.element.getComponentSelection());
        if (!this._headSelection || !this._anchorSelection)
            return null;

        var startSelection = null;
        var endSelection = null;
        if (this._selectionIsBackward) {
            startSelection = this._headSelection;
            endSelection = this._anchorSelection;
        } else {
            startSelection = this._anchorSelection;
            endSelection = this._headSelection;
        }

        var textLines = [];
        for (var i = startSelection.item; i <= endSelection.item; ++i)
            textLines.push(this._providerElement(i).element().deepTextContent());

        var endSelectionElement = this._providerElement(endSelection.item).element();
        if (endSelection.node && endSelection.node.isSelfOrDescendant(endSelectionElement)) {
            var itemTextOffset = this._textOffsetInNode(endSelectionElement, endSelection.node, endSelection.offset);
            textLines[textLines.length - 1] = textLines.peekLast().substring(0, itemTextOffset);
        }

        var startSelectionElement = this._providerElement(startSelection.item).element();
        if (startSelection.node && startSelection.node.isSelfOrDescendant(startSelectionElement)) {
            var itemTextOffset = this._textOffsetInNode(startSelectionElement, startSelection.node, startSelection.offset);
            textLines[0] = textLines[0].substring(itemTextOffset);
        }

        return textLines.join("\n");
    },

    /**
     * @param {!Element} itemElement
     * @param {!Node} container
     * @param {number} offset
     * @return {number}
     */
    _textOffsetInNode: function(itemElement, container, offset)
    {
        var chars = 0;
        var node = itemElement;
        while ((node = node.traverseNextTextNode()) && node !== container)
            chars += node.textContent.length;
        return chars + offset;
    },

    /**
     * @param {!Event} event
     */
    _onScroll: function(event)
    {
        this.refresh();
    },

    /**
     * @return {number}
     */
    firstVisibleIndex: function()
    {
        return this._firstVisibleIndex;
    },

    /**
     * @return {number}
     */
    lastVisibleIndex: function()
    {
        return this._lastVisibleIndex;
    },

    /**
     * @return {?Element}
     */
    renderedElementAt: function(index)
    {
        if (index < this._firstVisibleIndex)
            return null;
        if (index > this._lastVisibleIndex)
            return null;
        return this._renderedItems[index - this._firstVisibleIndex].element();
    },

    /**
     * @param {number} index
     * @param {boolean=} makeLast
     */
    scrollItemIntoView: function(index, makeLast)
    {
        if (index > this._firstVisibleIndex && index < this._lastVisibleIndex)
            return;
        if (makeLast)
            this.forceScrollItemToBeLast(index);
        else if (index <= this._firstVisibleIndex)
            this.forceScrollItemToBeFirst(index);
        else if (index >= this._lastVisibleIndex)
            this.forceScrollItemToBeLast(index);
    },

    /**
     * @param {number} index
     */
    forceScrollItemToBeFirst: function(index)
    {
        this._rebuildCumulativeHeightsIfNeeded();
        this.element.scrollTop = index > 0 ? this._cumulativeHeights[index - 1] : 0;
        this.refresh();
    },

    /**
     * @param {number} index
     */
    forceScrollItemToBeLast: function(index)
    {
        this._rebuildCumulativeHeightsIfNeeded();
        this.element.scrollTop = this._cumulativeHeights[index] - this._visibleHeight();
        this.refresh();
    },

    /**
     * @return {number}
     */
    _visibleHeight: function()
    {
        // Use offsetHeight instead of clientHeight to avoid being affected by horizontal scroll.
        return this.element.offsetHeight;
    }
}
