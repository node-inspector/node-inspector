// Copyright 2014 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

/**
 * @constructor
 * @extends {WebInspector.Object}
 */
WebInspector.ResizerWidget = function()
{
    WebInspector.Object.call(this);

    this._isEnabled = true;
    this._elements = [];
    this._installDragOnMouseDownBound = this._installDragOnMouseDown.bind(this);
    this._cursor = "nwse-resize";
};

WebInspector.ResizerWidget.Events = {
    ResizeStart: "ResizeStart",
    ResizeUpdate: "ResizeUpdate",
    ResizeEnd: "ResizeEnd"
};

WebInspector.ResizerWidget.prototype = {
    /**
     * @return {boolean}
     */
    isEnabled: function()
    {
        return this._isEnabled;
    },

    /**
     * @param {boolean} enabled
     */
    setEnabled: function(enabled)
    {
        this._isEnabled = enabled;
        this.updateElementCursors();
    },

    /**
     * @return {!Array.<!Element>}
     */
    elements: function()
    {
        return this._elements.slice();
    },

    /**
     * @param {!Element} element
     */
    addElement: function(element)
    {
        if (this._elements.indexOf(element) !== -1)
            return;

        this._elements.push(element);
        element.addEventListener("mousedown", this._installDragOnMouseDownBound, false);
        this._updateElementCursor(element);
    },

    /**
     * @param {!Element} element
     */
    removeElement: function(element)
    {
        if (this._elements.indexOf(element) === -1)
            return;

        this._elements.remove(element);
        element.removeEventListener("mousedown", this._installDragOnMouseDownBound, false);
        element.style.removeProperty("cursor");
    },

    updateElementCursors: function()
    {
        this._elements.forEach(this._updateElementCursor.bind(this));
    },

    /**
     * @param {!Element} element
     */
    _updateElementCursor: function(element)
    {
        if (this._isEnabled)
            element.style.setProperty("cursor", this.cursor());
        else
            element.style.removeProperty("cursor");
    },

    /**
     * @return {string}
     */
    cursor: function()
    {
        return this._cursor;
    },

    /**
     * @param {string} cursor
     */
    setCursor: function(cursor)
    {
        this._cursor = cursor;
        this.updateElementCursors();
    },

    /**
     * @param {!Event} event
     */
    _installDragOnMouseDown: function(event)
    {
        // Only handle drags of the nodes specified.
        if (this._elements.indexOf(event.target) === -1)
            return false;
        WebInspector.elementDragStart(this._dragStart.bind(this), this._drag.bind(this), this._dragEnd.bind(this), this.cursor(), event);
    },

    /**
     * @param {!MouseEvent} event
     * @return {boolean}
     */
    _dragStart: function(event)
    {
        if (!this._isEnabled)
            return false;
        this._startX = event.pageX;
        this._startY = event.pageY;
        this.sendDragStart(this._startX, this._startY);
        return true;
    },

    /**
     * @param {number} x
     * @param {number} y
     */
    sendDragStart: function(x, y)
    {
        this.dispatchEventToListeners(WebInspector.ResizerWidget.Events.ResizeStart, { startX: x, currentX: x, startY: y, currentY: y });
    },

    /**
     * @param {!MouseEvent} event
     * @return {boolean}
     */
    _drag: function(event)
    {
        if (!this._isEnabled) {
            this._dragEnd(event);
            return true;  // Cancel drag.
        }

        this.sendDragMove(this._startX, event.pageX, this._startY, event.pageY, event.shiftKey);
        event.preventDefault();
        return false;  // Continue drag.
    },

    /**
     * @param {number} startX
     * @param {number} currentX
     * @param {number} startY
     * @param {number} currentY
     * @param {boolean} shiftKey
     */
    sendDragMove: function(startX, currentX, startY, currentY, shiftKey)
    {
        this.dispatchEventToListeners(WebInspector.ResizerWidget.Events.ResizeUpdate, { startX: startX, currentX: currentX, startY: startY, currentY: currentY, shiftKey: shiftKey });
    },

    /**
     * @param {!MouseEvent} event
     */
    _dragEnd: function(event)
    {
        this.dispatchEventToListeners(WebInspector.ResizerWidget.Events.ResizeEnd);
        delete this._startX;
        delete this._startY;
    },

    __proto__: WebInspector.Object.prototype
};

/**
 * @constructor
 * @extends {WebInspector.ResizerWidget}
 */
WebInspector.SimpleResizerWidget = function()
{
    WebInspector.ResizerWidget.call(this);
    this._isVertical = true;
};

WebInspector.SimpleResizerWidget.prototype = {
    /**
     * @return {boolean}
     */
    isVertical: function()
    {
        return this._isVertical;
    },

    /**
     * Vertical widget resizes height (along y-axis).
     * @param {boolean} vertical
     */
    setVertical: function(vertical)
    {
        this._isVertical = vertical;
        this.updateElementCursors();
    },

    /**
     * @override
     * @return {string}
     */
    cursor: function()
    {
        return this._isVertical ? "ns-resize" : "ew-resize";
    },

    /**
     * @override
     * @param {number} x
     * @param {number} y
     */
    sendDragStart: function(x, y)
    {
        var position = this._isVertical ? y : x;
        this.dispatchEventToListeners(WebInspector.ResizerWidget.Events.ResizeStart, { startPosition: position, currentPosition: position });
    },

    /**
     * @override
     * @param {number} startX
     * @param {number} currentX
     * @param {number} startY
     * @param {number} currentY
     * @param {boolean} shiftKey
     */
    sendDragMove: function(startX, currentX, startY, currentY, shiftKey)
    {
        if (this._isVertical)
            this.dispatchEventToListeners(WebInspector.ResizerWidget.Events.ResizeUpdate, { startPosition: startY, currentPosition: currentY, shiftKey: shiftKey });
        else
            this.dispatchEventToListeners(WebInspector.ResizerWidget.Events.ResizeUpdate, { startPosition: startX, currentPosition: currentX, shiftKey: shiftKey });
    },

    __proto__: WebInspector.ResizerWidget.prototype
};
