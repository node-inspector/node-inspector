/*
 * Copyright 2014 The Chromium Authors. All rights reserved.
 * Use of this source code is governed by a BSD-style license that can be
 * found in the LICENSE file.
 */

/**
 * @constructor
 * @extends {WebInspector.Object}
 */
WebInspector.NotificationService = function() { }

WebInspector.NotificationService.prototype = {
    __proto__: WebInspector.Object.prototype
}

WebInspector.NotificationService.Events = {
    InspectorAgentEnabledForTests: "InspectorAgentEnabledForTests",
    SelectedNodeChanged: "SelectedNodeChanged"
}

WebInspector.notifications = new WebInspector.NotificationService();
