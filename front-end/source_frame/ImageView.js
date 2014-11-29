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
 * @extends {WebInspector.VBox}
 * @constructor
 * @param {string} url
 * @param {string} mimeType
 * @param {!WebInspector.ContentProvider} contentProvider
 */
WebInspector.ImageView = function(url, mimeType, contentProvider)
{
    WebInspector.VBox.call(this);
    this.registerRequiredCSS("source_frame/imageView.css");
    this.element.classList.add("image-view");
    this._url = url;
    this._parsedURL = new WebInspector.ParsedURL(url);
    this._mimeType = mimeType;
    this._contentProvider = contentProvider;
}

WebInspector.ImageView.prototype = {
    wasShown: function()
    {
        this._createContentIfNeeded();
    },

    _createContentIfNeeded: function()
    {
        if (this._container)
            return;

        var imageContainer = this.element.createChild("div", "image");
        var imagePreviewElement = imageContainer.createChild("img", "resource-image-view");
        imagePreviewElement.addEventListener("contextmenu", this._contextMenu.bind(this), true);

        this._container = this.element.createChild("div", "info");
        this._container.createChild("h1", "title").textContent = this._parsedURL.displayName;

        var infoListElement = createElementWithClass("dl", "infoList");

        WebInspector.Resource.populateImageSource(this._url, this._mimeType, this._contentProvider, imagePreviewElement);
        this._contentProvider.requestContent(onContentAvailable.bind(this));

        /**
         * @param {?string} content
         * @this {WebInspector.ImageView}
         */
        function onContentAvailable(content)
        {
            var resourceSize = this._base64ToSize(content);

            var imageProperties = [
                { name: WebInspector.UIString("Dimensions"), value: WebInspector.UIString("%d × %d", imagePreviewElement.naturalWidth, imagePreviewElement.naturalHeight) },
                { name: WebInspector.UIString("File size"), value: Number.bytesToString(resourceSize) },
                { name: WebInspector.UIString("MIME type"), value: this._mimeType }
            ];

            infoListElement.removeChildren();
            for (var i = 0; i < imageProperties.length; ++i) {
                infoListElement.createChild("dt").textContent = imageProperties[i].name;
                infoListElement.createChild("dd").textContent = imageProperties[i].value;
            }
            infoListElement.createChild("dt").textContent = WebInspector.UIString("URL");
            infoListElement.createChild("dd").appendChild(WebInspector.createExternalAnchor(this._url));
            this._container.appendChild(infoListElement);
        }
        this._imagePreviewElement = imagePreviewElement;
    },

    /**
     * @param {?string} content
     * @return {number}
     */
    _base64ToSize: function(content)
    {
        if (!content || !content.length)
            return 0;
        var size = (content.length || 0) * 3 / 4;
        if (content.length > 0 && content[content.length - 1] === "=")
            size--;
        if (content.length > 1 && content[content.length - 2] === "=")
            size--;
        return size;
    },

    _contextMenu: function(event)
    {
        var contextMenu = new WebInspector.ContextMenu(event);
        contextMenu.appendItem(WebInspector.UIString(WebInspector.useLowerCaseMenuTitles() ? "Copy image URL" : "Copy Image URL"), this._copyImageURL.bind(this));
        if (this._imagePreviewElement.src)
            contextMenu.appendItem(WebInspector.UIString(WebInspector.useLowerCaseMenuTitles() ? "Copy image as Data URL" : "Copy Image As Data URL"), this._copyImageAsDataURL.bind(this));
        contextMenu.appendItem(WebInspector.UIString(WebInspector.useLowerCaseMenuTitles() ? "Open image in new tab" : "Open Image in New Tab"), this._openInNewTab.bind(this));
        contextMenu.show();
    },

    _copyImageAsDataURL: function()
    {
        InspectorFrontendHost.copyText(this._imagePreviewElement.src);
    },

    _copyImageURL: function()
    {
        InspectorFrontendHost.copyText(this._url);
    },

    _openInNewTab: function()
    {
        InspectorFrontendHost.openInNewTab(this._url);
    },

    __proto__: WebInspector.VBox.prototype
}
