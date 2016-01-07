// Copyright 2014 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

/**
 * @constructor
 * @extends {WebInspector.Widget}
 */
WebInspector.InspectedPagePlaceholder = function()
{
    WebInspector.Widget.call(this);
    this.element.classList.add("inspected-page-placeholder");
    WebInspector.zoomManager.addEventListener(WebInspector.ZoomManager.Events.ZoomChanged, this._scheduleUpdate, this);
    this._margins = { top: 0, right: 0, bottom: 0, left: 0 };
    this.restoreMinimumSizeAndMargins();
};

WebInspector.InspectedPagePlaceholder.Events = {
    Update: "Update"
};

WebInspector.InspectedPagePlaceholder.MarginValue = 3;

WebInspector.InspectedPagePlaceholder.prototype = {
    _findMargins: function()
    {
        var margins = { top: 0, right: 0, bottom: 0, left: 0 };

        if (this._useMargins) {
            var adjacent = { top: true, right: true, bottom: true, left: true };
            var widget = this;
            while (widget.parentWidget()) {
                var parent = widget.parentWidget();
                // This view assumes it's always inside the main split widget element, not a sidebar.
                // Every parent which is not a split widget, must be of the same size as this widget.
                if (parent instanceof WebInspector.SplitWidget) {
                    var side = parent.sidebarSide();
                    if (adjacent[side] && !parent.hasCustomResizer() && parent.isResizable())
                        margins[side] = WebInspector.InspectedPagePlaceholder.MarginValue;
                    adjacent[side] = false;
                }
                widget = parent;
            }
        }

        if (this._margins.top !== margins.top || this._margins.left !== margins.left || this._margins.right !== margins.right || this._margins.bottom !== margins.bottom) {
            this._margins = margins;
            this._scheduleUpdate();
        }
    },

    onResize: function()
    {
        this._findMargins();
        this._scheduleUpdate();
    },

    _scheduleUpdate: function()
    {
        if (this._updateId)
            this.element.window().cancelAnimationFrame(this._updateId);
        this._updateId = this.element.window().requestAnimationFrame(this.update.bind(this));
    },

    restoreMinimumSizeAndMargins: function()
    {
        this._useMargins = true;
        this.setMinimumSize(50, 50);
        this._findMargins();
    },

    clearMinimumSizeAndMargins: function()
    {
        this._useMargins = false;
        this.setMinimumSize(1, 1);
        this._findMargins();
    },

    _dipPageRect: function()
    {
        var zoomFactor = WebInspector.zoomManager.zoomFactor();
        var rect = this.element.getBoundingClientRect();
        var bodyRect = this.element.ownerDocument.body.getBoundingClientRect();

        var left = Math.max(rect.left * zoomFactor + this._margins.left, bodyRect.left * zoomFactor);
        var top = Math.max(rect.top * zoomFactor + this._margins.top, bodyRect.top * zoomFactor);
        var bottom = Math.min(rect.bottom * zoomFactor - this._margins.bottom, bodyRect.bottom * zoomFactor);
        var right = Math.min(rect.right * zoomFactor - this._margins.right, bodyRect.right * zoomFactor);

        return { x: left, y: top, width: right - left, height: bottom - top };
    },

    update: function()
    {
        delete this._updateId;
        var rect = this._dipPageRect();
        var bounds = { x: Math.round(rect.x), y: Math.round(rect.y), height: Math.max(1, Math.round(rect.height)), width: Math.max(1, Math.round(rect.width)) };
        this.dispatchEventToListeners(WebInspector.InspectedPagePlaceholder.Events.Update, bounds);
    },

    __proto__: WebInspector.Widget.prototype
};
