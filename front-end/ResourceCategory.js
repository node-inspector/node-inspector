/*
 * Copyright (C) 2007, 2008 Apple Inc.  All rights reserved.
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
 */
WebInspector.ResourceCategory = function(name, title, color)
{
    this.name = name;
    this._title = title;
    this.color = color;
}

WebInspector.ResourceCategory.prototype = {
    toString: function()
    {
        return this.title;
    },

    get title()
    {
        return WebInspector.UIString(this._title);
    }
}

WebInspector.resourceCategories = {
    documents: new WebInspector.ResourceCategory("documents", "Documents", "rgb(47,102,236)"),
    stylesheets: new WebInspector.ResourceCategory("stylesheets", "Stylesheets", "rgb(157,231,119)"),
    images: new WebInspector.ResourceCategory("images", "Images", "rgb(164,60,255)"),
    scripts: new WebInspector.ResourceCategory("scripts", "Scripts", "rgb(255,121,0)"),
    xhr: new WebInspector.ResourceCategory("xhr", "XHR", "rgb(231,231,10)"),
    fonts: new WebInspector.ResourceCategory("fonts", "Fonts", "rgb(255,82,62)"),
    websockets: new WebInspector.ResourceCategory("websockets", "WebSockets", "rgb(186,186,186)"), // FIXME: Decide the color.
    other: new WebInspector.ResourceCategory("other", "Other", "rgb(186,186,186)")
}
