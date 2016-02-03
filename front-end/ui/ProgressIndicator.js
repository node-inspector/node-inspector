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
 * @implements {WebInspector.Progress}
 */
WebInspector.ProgressIndicator = function()
{
    this.element = createElementWithClass("div", "progress-indicator");
    this._shadowRoot = WebInspector.createShadowRootWithCoreStyles(this.element);
    this._shadowRoot.appendChild(WebInspector.Widget.createStyleElement("ui/progressIndicator.css"));
    this._contentElement = this._shadowRoot.createChild("div", "progress-indicator-shadow-container");

    this._labelElement = this._contentElement.createChild("div", "title");
    this._progressElement = this._contentElement.createChild("progress");
    this._progressElement.value = 0;
    this._stopButton = this._contentElement.createChild("button", "progress-indicator-shadow-stop-button");
    this._stopButton.addEventListener("click", this.cancel.bind(this));

    this._isCanceled = false;
    this._worked = 0;
}

WebInspector.ProgressIndicator.prototype = {
    /**
     * @param {!Element} parent
     */
    show: function(parent)
    {
        parent.appendChild(this.element);
    },

    /**
     * @override
     */
    done: function()
    {
        if (this._isDone)
            return;
        this._isDone = true;
        this.element.remove();
    },

    cancel: function()
    {
        this._isCanceled = true;
    },

    /**
     * @override
     * @return {boolean}
     */
    isCanceled: function()
    {
        return this._isCanceled;
    },

    /**
     * @override
     * @param {string} title
     */
    setTitle: function(title)
    {
        this._labelElement.textContent = title;
    },

    /**
     * @override
     * @param {number} totalWork
     */
    setTotalWork: function(totalWork)
    {
        this._progressElement.max = totalWork;
    },

    /**
     * @override
     * @param {number} worked
     * @param {string=} title
     */
    setWorked: function(worked, title)
    {
        this._worked = worked;
        this._progressElement.value = worked;
        if (title)
            this.setTitle(title);
    },

    /**
     * @override
     * @param {number=} worked
     */
    worked: function(worked)
    {
        this.setWorked(this._worked + (worked || 1));
    }
}
