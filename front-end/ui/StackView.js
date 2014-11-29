/*
 * Copyright (C) 2014 Google Inc. All rights reserved.
 *
 * Redistribution and use in source and binary forms, with or without
 * modification, are permitted provided that the following conditions are
 * met:
 *
 * 1. Redistributions of source code must retain the above copyright
 * notice, this list of conditions and the following disclaimer.
 *
 * 2. Redistributions in binary form must reproduce the above
 * copyright notice, this list of conditions and the following disclaimer
 * in the documentation and/or other materials provided with the
 * distribution.
 *
 * THIS SOFTWARE IS PROVIDED BY GOOGLE INC. AND ITS CONTRIBUTORS
 * "AS IS" AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT
 * LIMITED TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR
 * A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL GOOGLE INC.
 * OR ITS CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL,
 * SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT
 * LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE,
 * DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY
 * THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT
 * (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE
 * OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
 */

/**
 * @constructor
 * @extends {WebInspector.VBox}
 * @param {boolean} isVertical
 */
WebInspector.StackView = function(isVertical)
{
    WebInspector.VBox.call(this);
    this._isVertical = isVertical;
    this._currentSplitView = null;
}

WebInspector.StackView.prototype = {
    /**
     * @param {!WebInspector.View} view
     * @param {string=} sidebarSizeSettingName
     * @param {number=} defaultSidebarWidth
     * @param {number=} defaultSidebarHeight
     * @return {!WebInspector.SplitView}
     */
    appendView: function(view, sidebarSizeSettingName, defaultSidebarWidth, defaultSidebarHeight)
    {
        var splitView = new WebInspector.SplitView(this._isVertical, true, sidebarSizeSettingName, defaultSidebarWidth, defaultSidebarHeight);
        splitView.setMainView(view);
        splitView.hideSidebar();

        if (!this._currentSplitView) {
            splitView.show(this.element);
        } else {
            this._currentSplitView.setSidebarView(splitView);
            this._currentSplitView.showBoth();
        }

        this._currentSplitView = splitView;
        return splitView;
    },

    detachChildViews: function()
    {
        WebInspector.View.prototype.detachChildViews.call(this);
        this._currentSplitView = null;
    },

    __proto__: WebInspector.VBox.prototype
}
