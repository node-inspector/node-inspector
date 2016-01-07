// Copyright (c) 2015 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

/**
 * @constructor
 * @extends {WebInspector.SidebarPane}
 * @param {string} title
 * @param {!WebInspector.Widget} widget
 */
WebInspector.ElementsSidebarViewWrapperPane = function(title, widget)
{
    WebInspector.SidebarPane.call(this, title);
    widget.show(this.element);
}

WebInspector.ElementsSidebarViewWrapperPane.prototype = {
    __proto__: WebInspector.SidebarPane.prototype
}
