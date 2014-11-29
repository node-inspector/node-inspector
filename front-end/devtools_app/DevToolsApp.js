// Copyright 2014 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

/**
 * @constructor
 * @suppressGlobalPropertiesCheck
 */
WebInspector.DevToolsApp = function()
{
    this._iframe = document.getElementById("inspector-app-iframe");
    this._inspectorFrontendHostImpl = new WebInspector.InspectorFrontendHostImpl();

    /**
     * @type {!Window}
     */
    this._inspectorWindow = this._iframe.contentWindow;
    this._inspectorWindow.InspectorFrontendHost = this._inspectorFrontendHostImpl;
    DevToolsAPI.setInspectorWindow(this._inspectorWindow);
}

WebInspector.DevToolsApp.prototype = {
}

runOnWindowLoad(function() { new WebInspector.DevToolsApp(); });
