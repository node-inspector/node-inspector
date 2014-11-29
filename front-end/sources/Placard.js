/*
 * Copyright (C) 2008 Apple Inc. All Rights Reserved.
 * Copyright (C) 2013 Google Inc. All rights reserved.
 *
 * Redistribution and use in source and binary forms, with or without
 * modification, are permitted provided that the following conditions
 * are met:
 * 1. Redistributions of source code must retain the above copyright
 *    notice, this list of conditions and the following disclaimer.
 * 2. Redistributions in binary form must reproduce the above copyright
 *    notice, this list of conditions and the following disclaimer in the
 *    documentation and/or other materials provided with the distribution.
 *
 * THIS SOFTWARE IS PROVIDED BY APPLE INC. ``AS IS'' AND ANY
 * EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE
 * IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR
 * PURPOSE ARE DISCLAIMED.  IN NO EVENT SHALL APPLE INC. OR
 * CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL,
 * EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO,
 * PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR
 * PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY
 * OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT
 * (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE
 * OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
 */

/**
 * @constructor
 * @param {string} title
 * @param {string} subtitle
 */
WebInspector.Placard = function(title, subtitle)
{
    this.element = createElementWithClass("div", "placard");
    this.element.placard = this;

    this.subtitleElement = this.element.createChild("div", "subtitle");
    this.titleElement = this.element.createChild("div", "title");

    this._hidden = false;
    this.title = title;
    this.subtitle = subtitle;
    this.selected = false;
}

WebInspector.Placard.prototype = {
    /** @return {string} */
    get title()
    {
        return this._title;
    },

    set title(x)
    {
        if (this._title === x)
            return;
        this._title = x;
        this.titleElement.textContent = x;
    },

    /** @return {string} */
    get subtitle()
    {
        return this._subtitle;
    },

    set subtitle(x)
    {
        if (this._subtitle === x)
            return;
        this._subtitle = x;
        this.subtitleElement.textContent = x;
    },

    /** @return {boolean} */
    get selected()
    {
        return this._selected;
    },

    set selected(x)
    {
        if (x)
            this.select();
        else
            this.deselect();
    },

    select: function()
    {
        if (this._selected)
            return;
        this._selected = true;
        this.element.classList.add("selected");
    },

    deselect: function()
    {
        if (!this._selected)
            return;
        this._selected = false;
        this.element.classList.remove("selected");
    },

    toggleSelected: function()
    {
        this.selected = !this.selected;
    },

    /**
     * @return {boolean}
     */
    isHidden: function()
    {
        return this._hidden;
    },

    /**
     * @param {boolean} x
     */
    setHidden: function(x)
    {
        if (this._hidden === x)
            return;
        this._hidden = x;
        this.element.classList.toggle("hidden", x);
    },

    discard: function()
    {
    }
}
