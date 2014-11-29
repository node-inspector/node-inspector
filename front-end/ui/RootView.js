// Copyright 2014 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

/**
 * @constructor
 * @extends {WebInspector.VBox}
 */
WebInspector.RootView = function()
{
    WebInspector.VBox.call(this);
    this.markAsRoot();
    this.element.classList.add("root-view");
    this.element.setAttribute("spellcheck", false);
}

WebInspector.RootView.prototype = {
    /**
     * @param {!Document} document
     */
    attachToDocument: function(document)
    {
        document.defaultView.addEventListener("resize", this.doResize.bind(this), false);
        this._window = document.defaultView;
        this.doResize();
        this.show(document.body);
    },

    doResize: function()
    {
        if (this._window) {
            var size = this.constraints().minimum;
            var zoom = WebInspector.zoomManager.zoomFactor();
            var right = Math.min(0, this._window.innerWidth - size.width / zoom);
            this.element.style.marginRight = right + "px";
            var bottom = Math.min(0, this._window.innerHeight - size.height / zoom);
            this.element.style.marginBottom = bottom + "px";
        }
        WebInspector.VBox.prototype.doResize.call(this);
    },

    __proto__: WebInspector.VBox.prototype
}
