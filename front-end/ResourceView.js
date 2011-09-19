/*
 * Copyright (C) 2007, 2008 Apple Inc.  All rights reserved.
 * Copyright (C) IBM Corp. 2009  All rights reserved.
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

WebInspector.ResourceView = function(resource)
{
    WebInspector.View.call(this);
    this.element.addStyleClass("resource-view");
    this.resource = resource;
}

WebInspector.ResourceView.prototype = {
    hasContent: function()
    {
        return false;
    }
}

WebInspector.ResourceView.prototype.__proto__ = WebInspector.View.prototype;

WebInspector.ResourceView.hasTextContent = function(resource)
{
    switch (resource.category) {
    case WebInspector.resourceCategories.documents:
    case WebInspector.resourceCategories.scripts:
    case WebInspector.resourceCategories.xhr:
    case WebInspector.resourceCategories.stylesheets:
        return true;
    case WebInspector.resourceCategories.other:
        return resource.content && !resource.contentEncoded;
    default:
        return false;
    }
}

WebInspector.ResourceView.nonSourceViewForResource = function(resource)
{
    switch (resource.category) {
    case WebInspector.resourceCategories.images:
        return new WebInspector.ImageView(resource);
    case WebInspector.resourceCategories.fonts:
        return new WebInspector.FontView(resource);
    default:
        return new WebInspector.ResourceView(resource);
    }
}

WebInspector.ResourceSourceFrame = function(resource)
{
    WebInspector.SourceFrame.call(this, new WebInspector.SourceFrameDelegate(resource), resource.url);
    this._resource = resource;
}

//This is a map from resource.type to mime types
//found in WebInspector.SourceTokenizer.Registry.
WebInspector.ResourceSourceFrame.DefaultMIMETypeForResourceType = {
    0: "text/html",
    1: "text/css",
    4: "text/javascript"
}

WebInspector.ResourceSourceFrame.mimeTypeForResource = function(resource) {
    return WebInspector.ResourceSourceFrame.DefaultMIMETypeForResourceType[resource.type] || resource.mimeType;
}

WebInspector.ResourceSourceFrame.prototype = {
    get resource()
    {
        return this._resource;
    },

    requestContent: function(callback)
    {
        function contentLoaded(text)
        {
            var mimeType = WebInspector.ResourceSourceFrame.mimeTypeForResource(this.resource);
            callback(mimeType, text);
        }

        this.resource.requestContent(contentLoaded.bind(this));
    },

    suggestedFileName: function()
    {
        return this.resource.displayName;
    }
}

WebInspector.ResourceSourceFrame.prototype.__proto__ = WebInspector.SourceFrame.prototype;

WebInspector.EditableResourceSourceFrame = function(resource)
{
    WebInspector.ResourceSourceFrame.call(this, resource);
}

WebInspector.EditableResourceSourceFrame.prototype = {
    canEditSource: function()
    {
        return this.resource.isEditable() && !this._commitEditingInProgress;
    },

    editContent: function(newText, callback)
    {
        this._clearIncrementalUpdateTimer();
        var majorChange = true;
        this.resource.setContent(newText, majorChange, callback);
    },

    cancelEditing: function()
    {
        this._clearIncrementalUpdateTimer();
        const majorChange = false;
        if (this._viewerState)
            this.resource.setContent(this._viewerState.textModelContent, majorChange);
        WebInspector.SourceFrame.prototype.cancelEditing.call(this);
    },

    afterTextChanged: function(oldRange, newRange)
    {
        function commitIncrementalEdit()
        {
            var majorChange = false;
            this.resource.setContent(this._textModel.text, majorChange, function() {});
        }
        const updateTimeout = 200;
        this._incrementalUpdateTimer = setTimeout(commitIncrementalEdit.bind(this), updateTimeout);
    },

    _clearIncrementalUpdateTimer: function()
    {
        if (this._incrementalUpdateTimer)
            clearTimeout(this._incrementalUpdateTimer);
        delete this._incrementalUpdateTimer;
    },
}

WebInspector.EditableResourceSourceFrame.prototype.__proto__ = WebInspector.ResourceSourceFrame.prototype;

WebInspector.ResourceRevisionSourceFrame = function(revision)
{
    WebInspector.ResourceSourceFrame.call(this, revision.resource);
    this._revision = revision;
}

WebInspector.ResourceRevisionSourceFrame.prototype = {
    get resource()
    {
        return this._revision.resource;
    },

    requestContent: function(callback)
    {
        function contentLoaded(text)
        {
            var mimeType = WebInspector.ResourceSourceFrame.mimeTypeForResource(this.resource);
            callback(mimeType, text);
        }

        this._revision.requestContent(contentLoaded.bind(this));
    },
}

WebInspector.ResourceRevisionSourceFrame.prototype.__proto__ = WebInspector.ResourceSourceFrame.prototype;
