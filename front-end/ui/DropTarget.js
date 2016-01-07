// Copyright (c) 2015 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

/**
 * @constructor
 * @param {!Element} element
 * @param {!Array.<string>} transferTypes
 * @param {string} messageText
 * @param {function(!DataTransfer)} handleDrop
 */
WebInspector.DropTarget = function(element, transferTypes, messageText, handleDrop)
{
    element.addEventListener("dragenter", this._onDragEnter.bind(this), true);
    element.addEventListener("dragover", this._onDragOver.bind(this), true);
    this._element = element;
    this._transferTypes = transferTypes;
    this._messageText = messageText;
    this._handleDrop = handleDrop;
    this._enabled = true;
}

WebInspector.DropTarget.Types = {
    Files: "Files",
    URIList: "text/uri-list"
}

WebInspector.DropTarget.prototype = {
    /**
     * @param {boolean} enabled
     */
    setEnabled: function(enabled)
    {
        this._enabled = enabled;
    },

    /**
     * @param {!Event} event
     */
    _onDragEnter: function(event)
    {
        if (this._enabled && this._hasMatchingType(event))
            event.consume(true);
    },

    /**
     * @param {!Event} event
     * @return {boolean}
     */
    _hasMatchingType: function(event)
    {
        for (var type of this._transferTypes) {
            if (event.dataTransfer.types.indexOf(type) !== -1)
                return true;
        }
        return false;
    },

    /**
     * @param {!Event} event
     */
    _onDragOver: function(event)
    {
        if (!this._enabled || !this._hasMatchingType(event))
            return;
        event.dataTransfer.dropEffect = "copy";
        event.consume(true);
        if (this._dragMaskElement)
            return;
        this._dragMaskElement = this._element.createChild("div", "");
        var shadowRoot = WebInspector.createShadowRootWithCoreStyles(this._dragMaskElement);
        shadowRoot.appendChild(WebInspector.Widget.createStyleElement("ui/dropTarget.css"));
        shadowRoot.createChild("div", "drop-target-message").textContent = this._messageText;
        this._dragMaskElement.addEventListener("drop", this._onDrop.bind(this), true);
        this._dragMaskElement.addEventListener("dragleave", this._onDragLeave.bind(this), true);
    },

    /**
     * @param {!Event} event
     */
    _onDrop: function(event)
    {
        event.consume(true);
        this._removeMask();
        if (this._enabled)
            this._handleDrop(event.dataTransfer);
    },

    /**
     * @param {!Event} event
     */
    _onDragLeave: function(event)
    {
        event.consume(true);
        this._removeMask();
    },

    _removeMask: function()
    {
        this._dragMaskElement.remove();
        delete this._dragMaskElement;
    }
}
