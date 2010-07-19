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

WebInspector.ImageView = function(resource)
{
    WebInspector.ResourceView.call(this, resource);

    this.element.addStyleClass("image");
}

WebInspector.ImageView.prototype = {
    hasContentTab: function()
    {
        return true;
    },

    contentTabSelected: function()
    {
        if (this._container)
            return;
        this._container = document.createElement("div");
        this._container.className = "image";
        this.contentElement.appendChild(this._container);

        this.imagePreviewElement = document.createElement("img");
        this.imagePreviewElement.addStyleClass("resource-image-view");
        this.imagePreviewElement.setAttribute("src", this.resource.url);

        this._container.appendChild(this.imagePreviewElement);

        this._container = document.createElement("div");
        this._container.className = "info";
        this.contentElement.appendChild(this._container);

        var imageNameElement = document.createElement("h1");
        imageNameElement.className = "title";
        imageNameElement.textContent = this.resource.displayName;
        this._container.appendChild(imageNameElement);

        var infoListElement = document.createElement("dl");
        infoListElement.className = "infoList";

        var imageProperties = [
            { name: WebInspector.UIString("Dimensions"), value: WebInspector.UIString("%d × %d", this.imagePreviewElement.naturalWidth, this.imagePreviewElement.height) },
            { name: WebInspector.UIString("File size"), value: Number.bytesToString(this.resource.resourceSize, WebInspector.UIString) },
            { name: WebInspector.UIString("MIME type"), value: this.resource.mimeType }
        ];

        var listHTML = '';
        for (var i = 0; i < imageProperties.length; ++i)
            listHTML += "<dt>" + imageProperties[i].name + "</dt><dd>" + imageProperties[i].value + "</dd>";

        infoListElement.innerHTML = listHTML;
        this._container.appendChild(infoListElement);
    }
}

WebInspector.ImageView.prototype.__proto__ = WebInspector.ResourceView.prototype;
