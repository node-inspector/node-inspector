/*
 * Copyright (C) 2012 Google Inc. All rights reserved.
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

/**
 * @constructor
 * @param {!Element} relativeToElement
 * @param {!WebInspector.DialogDelegate} delegate
 */
WebInspector.Dialog = function(relativeToElement, delegate)
{
    this._delegate = delegate;
    this._relativeToElement = relativeToElement;

    this._glassPane = new WebInspector.GlassPane(/** @type {!Document} */ (relativeToElement.ownerDocument));
    WebInspector.GlassPane.DefaultFocusedViewStack.push(this);

    // Install glass pane capturing events.
    this._glassPane.element.tabIndex = 0;
    this._glassPane.element.addEventListener("focus", this._onGlassPaneFocus.bind(this), false);

    this._element = this._glassPane.element.createChild("div");
    this._element.tabIndex = 0;
    this._element.addEventListener("focus", this._onFocus.bind(this), false);
    this._element.addEventListener("keydown", this._onKeyDown.bind(this), false);
    this._closeKeys = [
        WebInspector.KeyboardShortcut.Keys.Enter.code,
        WebInspector.KeyboardShortcut.Keys.Esc.code,
    ];

    delegate.show(this._element);

    this._position();
    this._delegate.focus();
}

/**
 * @return {?WebInspector.Dialog}
 */
WebInspector.Dialog.currentInstance = function()
{
    return WebInspector.Dialog._instance;
}

/**
 * @param {!Element} relativeToElement
 * @param {!WebInspector.DialogDelegate} delegate
 */
WebInspector.Dialog.show = function(relativeToElement, delegate)
{
    if (WebInspector.Dialog._instance)
        return;
    WebInspector.Dialog._instance = new WebInspector.Dialog(relativeToElement, delegate);
}

WebInspector.Dialog.hide = function()
{
    if (!WebInspector.Dialog._instance)
        return;
    WebInspector.Dialog._instance._hide();
}

WebInspector.Dialog.prototype = {
    focus: function()
    {
        this._element.focus();
    },

    _hide: function()
    {
        if (this._isHiding)
            return;
        this._isHiding = true;

        this._delegate.willHide();

        delete WebInspector.Dialog._instance;
        WebInspector.GlassPane.DefaultFocusedViewStack.pop();
        this._glassPane.dispose();
    },

    _onGlassPaneFocus: function(event)
    {
        this._hide();
    },

    _onFocus: function(event)
    {
        this._delegate.focus();
    },

    _position: function()
    {
        this._delegate.position(this._element, this._relativeToElement);
    },

    _onKeyDown: function(event)
    {
        if (event.keyCode === WebInspector.KeyboardShortcut.Keys.Tab.code) {
            event.preventDefault();
            return;
        }

        if (event.keyCode === WebInspector.KeyboardShortcut.Keys.Enter.code)
            this._delegate.onEnter(event);

        if (!event.handled && this._closeKeys.indexOf(event.keyCode) >= 0) {
            this._hide();
            event.consume(true);
        }
    }
};

/**
 * @constructor
 * @extends {WebInspector.Object}
 */
WebInspector.DialogDelegate = function()
{
    /** @type {!Element} */
    this.element;
}

WebInspector.DialogDelegate.prototype = {
    /**
     * @param {!Element} element
     */
    show: function(element)
    {
        element.appendChild(this.element);
        this.element.classList.add("dialog-contents");
        element.classList.add("dialog", "toolbar-colors");
    },

    /**
     * @param {!Element} element
     * @param {!Element} relativeToElement
     */
    position: function(element, relativeToElement)
    {
        var container = WebInspector.Dialog._modalHostView.element;
        var box = relativeToElement.boxInWindow(window).relativeToElement(container);

        var positionX = box.x + (relativeToElement.offsetWidth - element.offsetWidth) / 2;
        positionX = Number.constrain(positionX, 0, container.offsetWidth - element.offsetWidth);

        var positionY = box.y + (relativeToElement.offsetHeight - element.offsetHeight) / 2;
        positionY = Number.constrain(positionY, 0, container.offsetHeight - element.offsetHeight);

        element.style.position = "absolute";
        element.positionAt(positionX, positionY, container);
    },

    focus: function() { },

    onEnter: function(event) { },

    willHide: function() { },

    __proto__: WebInspector.Object.prototype
}

/** @type {?WebInspector.View} */
WebInspector.Dialog._modalHostView = null;

/**
 * @param {!WebInspector.View} view
 */
WebInspector.Dialog.setModalHostView = function(view)
{
    WebInspector.Dialog._modalHostView = view;
};

/**
 * FIXME: make utility method in Dialog, so clients use it instead of this getter.
 * Method should be like Dialog.showModalElement(position params, reposition callback).
 * @return {?WebInspector.View}
 */
WebInspector.Dialog.modalHostView = function()
{
    return WebInspector.Dialog._modalHostView;
};

WebInspector.Dialog.modalHostRepositioned = function()
{
    if (WebInspector.Dialog._instance)
        WebInspector.Dialog._instance._position();
};

