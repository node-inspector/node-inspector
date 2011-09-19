/*
 * Copyright (C) 2010 Google Inc. All rights reserved.
 *
 * Redistribution and use in source and binary forms, with or without
 * modification, are permitted provided that the following conditions are
 * met:
 *
 *     * Redistributions of source code must retain the above copyright
 * notice, this list of conditions and the following disclaimer.
 *     * Redistributions in binary form must reproduce the above
 * copyright notice, this list of conditions and the following disclaimer
 * in the documentation and/or other materials provided with the
 * distribution.
 *     * Neither the name of Google Inc. nor the names of its
 * contributors may be used to endorse or promote products derived from
 * this software without specific prior written permission.
 *
 * THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS
 * "AS IS" AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT
 * LIMITED TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR
 * A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT
 * OWNER OR CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL,
 * SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT
 * LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE,
 * DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY
 * THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT
 * (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE
 * OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
 */

WebInspector.HelpScreen = function(title)
{
    this._element = document.createElement("div");
    this._element.className = "help-window-outer";
    this._element.addEventListener("keydown", this._onKeyDown.bind(this), false);

    var mainWindow = this._element.createChild("div", "help-window-main");
    var captionWindow = mainWindow.createChild("div", "help-window-caption");
    var closeButton = captionWindow.createChild("button", "help-close-button");
    this.contentElement = mainWindow.createChild("div", "help-content");
    this.contentElement.tabIndex = 0;
    this.contentElement.addEventListener("blur", this._onBlur.bind(this), false);
    captionWindow.createChild("h1", "help-window-title").textContent = title;

    closeButton.textContent = "\u2716"; // Code stands for HEAVY MULTIPLICATION X.
    closeButton.addEventListener("click", this.hide.bind(this), false);
    this._closeKeys = [
        WebInspector.KeyboardShortcut.Keys.Enter.code,
        WebInspector.KeyboardShortcut.Keys.Esc.code,
        WebInspector.KeyboardShortcut.Keys.Space.code,
    ];
}

WebInspector.HelpScreen.prototype = {
    show: function(onHide)
    {
        if (this._isShown)
            return;

        document.body.appendChild(this._element);
        this._isShown = true;
        this._onHide = onHide;
        this._previousFocusElement = WebInspector.currentFocusElement;
        WebInspector.currentFocusElement = this.contentElement;
    },

    hide: function()
    {
        if (!this._isShown)
            return;

        this._isShown = false;
        document.body.removeChild(this._element);
        WebInspector.currentFocusElement = this._previousFocusElement;
        if (this._onHide) {
            this._onHide();
            delete this._onHide;
        }
    },

    _onKeyDown: function(event)
    {
        if (this._isShown && this._closeKeys.indexOf(event.keyCode) >= 0) {
            this.hide();
            event.stopPropagation();
        }
    },

    _onBlur: function()
    {
         // Pretend we're modal, grab focus back if we're still shown.
        if (this._isShown)
            WebInspector.currentFocusElement = this.contentElement;
    }
}
