// Copyright 2014 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

/**
 * @constructor
 */
WebInspector.ForwardedInputEventHandler = function()
{
    InspectorFrontendHost.events.addEventListener(InspectorFrontendHostAPI.Events.KeyEventUnhandled, this._onKeyEventUnhandled, this);
}

WebInspector.ForwardedInputEventHandler.prototype = {
    /**
     * @param {!WebInspector.Event} event
     */
    _onKeyEventUnhandled: function(event)
    {
        var data = event.data;
        var type = /** @type {string} */ (data.type);
        var keyIdentifier = /** @type {string} */ (data.keyIdentifier);
        var keyCode = /** @type {number} */ (data.keyCode);
        var modifiers =/** @type {number} */ (data.modifiers);

        if (type !== "keydown")
            return;

        WebInspector.context.setFlavor(WebInspector.ShortcutRegistry.ForwardedShortcut, WebInspector.ShortcutRegistry.ForwardedShortcut.instance);
        WebInspector.shortcutRegistry.handleKey(WebInspector.KeyboardShortcut.makeKey(keyCode, modifiers), keyIdentifier);
        WebInspector.context.setFlavor(WebInspector.ShortcutRegistry.ForwardedShortcut, null);
    }
}

/** @type {!WebInspector.ForwardedInputEventHandler} */
WebInspector.forwardedEventHandler = new WebInspector.ForwardedInputEventHandler();
