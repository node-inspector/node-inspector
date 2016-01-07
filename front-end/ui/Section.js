/*
 * Copyright (C) 2007 Apple Inc.  All rights reserved.
 * Copyright (C) 2009 Google Inc.  All rights reserved.
 *
 * Redistribution and use in source and binary forms, with or without
 * modification, are permitted provided that the following conditions
 * are met:
 *
 * 1.  Redistributions of source code must retain the above copyright
 *     notice, this list of conditions and the following disclaimer.
 * 2.  Redistributions in binary form must reproduce the above copyright
 *     notice, this list of conditions and the following disclaimer in the
 *     documentation and/or other materials provided with the distribution.
 * 3.  Neither the name of Apple Computer, Inc. ("Apple") nor the names of
 *     its contributors may be used to endorse or promote products derived
 *     from this software without specific prior written permission.
 *
 * THIS SOFTWARE IS PROVIDED BY APPLE AND ITS CONTRIBUTORS "AS IS" AND ANY
 * EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED
 * WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
 * DISCLAIMED. IN NO EVENT SHALL APPLE OR ITS CONTRIBUTORS BE LIABLE FOR ANY
 * DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES
 * (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES;
 * LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND
 * ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT
 * (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF
 * THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
 */

/**
 * @constructor
 * @param {string|!Node} title
 * @param {string=} subtitle
 */
WebInspector.Section = function(title, subtitle)
{
    this.element = createElementWithClass("div", "section");
    this.element._section = this;
    this.registerRequiredCSS("ui/section.css");

    this.headerElement = createElementWithClass("div", "header monospace");

    this.titleElement = createElementWithClass("div", "title");

    this.subtitleElement = createElementWithClass("div", "subtitle");

    this.headerElement.appendChild(this.subtitleElement);
    this.headerElement.appendChild(this.titleElement);

    this.headerElement.addEventListener("click", this.handleClick.bind(this), false);
    this.element.appendChild(this.headerElement);

    this.title = title;
    if (subtitle) {
        this._subtitle = subtitle;
        this.subtitleElement.textContent = subtitle;
    }
    this._expanded = false;
}

WebInspector.Section.prototype = {
    get title()
    {
        return this._title;
    },

    set title(x)
    {
        if (this._title === x)
            return;
        this._title = x;

        if (x instanceof Node) {
            this.titleElement.removeChildren();
            this.titleElement.appendChild(x);
        } else
          this.titleElement.textContent = x;
    },

    get subtitle()
    {
        return this._subtitle;
    },

    get expanded()
    {
        return this._expanded;
    },

    repopulate: function()
    {
        this._populated = false;
        if (this._expanded) {
            this.onpopulate();
            this._populated = true;
        }
    },

    /**
     * @protected
     */
    onpopulate: function()
    {
        // Overridden by subclasses.
    },

    expand: function()
    {
        if (this._expanded)
            return;
        this._expanded = true;
        this.element.classList.add("expanded");

        if (!this._populated) {
            this.onpopulate();
            this._populated = true;
        }
    },

    collapse: function()
    {
        if (!this._expanded)
            return;
        this._expanded = false;
        this.element.classList.remove("expanded");
    },

    /**
     * @param {string} cssFile
     */
    registerRequiredCSS: function(cssFile)
    {
        this.element.insertBefore(WebInspector.Widget.createStyleElement(cssFile), this.headerElement);
    },

    /**
     * @param {!Event} event
     * @protected
     */
    handleClick: function(event)
    {
        if (this._doNotExpandOnTitleClick)
            return;

        if (this._expanded)
            this.collapse();
        else
            this.expand();
        event.consume();
    },

    doNotExpandOnTitleClick: function()
    {
        this._doNotExpandOnTitleClick = true;
    }
}

/**
 * @constructor
 * @extends {WebInspector.Section}
 * @param {string|!Node} title
 * @param {string=} subtitle
 */
WebInspector.PropertiesSection = function(title, subtitle)
{
    WebInspector.Section.call(this, title, subtitle);
    this.registerRequiredCSS("ui/propertiesSection.css");

    this.propertiesTreeOutline = new TreeOutline(true);
    this.propertiesElement = this.propertiesTreeOutline.element;
    this.propertiesElement.classList.add("properties", "properties-tree", "monospace");
    this.propertiesTreeOutline.setFocusable(false);
    this.propertiesTreeOutline.section = this;

    this.element.appendChild(this.propertiesElement);
}

WebInspector.PropertiesSection.prototype = {
    __proto__: WebInspector.Section.prototype
}
