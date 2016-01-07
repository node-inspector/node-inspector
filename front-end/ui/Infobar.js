// Copyright 2015 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

/**
 * @constructor
 * @param {!WebInspector.Infobar.Type} type
 * @param {!WebInspector.Setting=} disableSetting
 */
WebInspector.Infobar = function(type, disableSetting)
{
    this.element = createElementWithClass("div");
    this._shadowRoot = WebInspector.createShadowRootWithCoreStyles(this.element);
    this._shadowRoot.appendChild(WebInspector.Widget.createStyleElement("ui/infobar.css"));
    this._contentElement = this._shadowRoot.createChild("div", "infobar infobar-" + type);

    this._contentElement.createChild("label", "icon", "dt-icon-label").type = type + "-icon";
    this._contentElement.createChild("div", "content").createChild("content");

    /** @type {?WebInspector.Setting} */
    this._disableSetting = null;

    if (disableSetting) {
        this._disableSetting = disableSetting;
        disableSetting.addChangeListener(this._updateVisibility, this);
        var disableButton = this._contentElement.createChild("div", "disable-button");
        disableButton.textContent = WebInspector.UIString("Never show");
        disableButton.addEventListener("click", disableSetting.set.bind(disableSetting, true), false);
    }

    this._closeButton = this._contentElement.createChild("div", "close-button", "dt-close-button");
    this._closeButton.addEventListener("click", this.close.bind(this), false);
    /** @type {?function()} */
    this._closeCallback = null;

    this.setVisible(false);
}

/** @enum {string} */
WebInspector.Infobar.Type = {
    Warning: "warning",
    Info: "info"
}

WebInspector.Infobar.prototype = {
    /**
     * @param {boolean} visible
     */
    setVisible: function(visible)
    {
        this._visible = visible;
        if (this._disableSetting)
            visible = visible && !this._disableSetting.get();
        this.element.classList.toggle("hidden", !visible);
    },

    _updateVisibility: function()
    {
        this.setVisible(this._visible);
    },

    close: function()
    {
        this.setVisible(false);
        if (this._closeCallback)
            this._closeCallback.call(null);
    },

    /**
     * @param {?function()} callback
     */
    setCloseCallback: function(callback)
    {
        this._closeCallback = callback;
    }
}
