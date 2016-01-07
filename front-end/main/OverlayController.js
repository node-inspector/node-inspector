// Copyright 2015 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

/**
 * @constructor
 */
WebInspector.OverlayController = function()
{
    WebInspector.moduleSetting("disablePausedStateOverlay").addChangeListener(this._updateOverlayMessage, this);
    WebInspector.targetManager.addModelListener(WebInspector.DebuggerModel, WebInspector.DebuggerModel.Events.DebuggerPaused, this._updateOverlayMessage, this);
    WebInspector.targetManager.addModelListener(WebInspector.DebuggerModel, WebInspector.DebuggerModel.Events.DebuggerResumed, this._updateOverlayMessage, this);
    WebInspector.targetManager.addModelListener(WebInspector.DebuggerModel, WebInspector.DebuggerModel.Events.GlobalObjectCleared, this._updateOverlayMessage, this);
}

WebInspector.OverlayController.prototype = {

    /**
     * @param {!WebInspector.Event} event
     */
    _updateOverlayMessage: function(event)
    {
        var debuggerModel = /** @type {!WebInspector.DebuggerModel} */ (event.target);
        var message = debuggerModel.isPaused() && !WebInspector.moduleSetting("disablePausedStateOverlay").get() ? WebInspector.UIString("Paused in debugger") : undefined;
        debuggerModel.target().pageAgent().setOverlayMessage(message);
    }
}