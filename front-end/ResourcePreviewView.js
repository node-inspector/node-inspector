/*
 * Copyright (C) 2011 Google Inc. All rights reserved.
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

WebInspector.ResourcePreviewView = function(resource, responseView)
{
    WebInspector.ResourceContentView.call(this, resource);
    this._responseView = responseView;
}

WebInspector.ResourcePreviewView.prototype = {
    contentLoaded: function()
    {
        if (!this.resource.content) {
            if (!this._emptyView) {
                this._emptyView = this._createEmptyView();
                this.addChildView(this._emptyView);
                this._emptyView.show();
                this.innerView = this._emptyView;
            }
        } else {
            if (this._emptyView) {
                this.removeChildView(this._emptyView);
                delete this._emptyView;
            }
            if (!this._previewView)
                this._previewView = this._createPreviewView();
            this.addChildView(this._previewView);
            this._previewView.show();
            this.innerView = this._previewView;
        }
    },

    _createEmptyView: function()
    {
        return new WebInspector.EmptyView(WebInspector.UIString("This request has no preview available."));
    },

    _createPreviewView: function()
    {
        if (this.resource.hasErrorStatusCode() && this.resource.content)
            return new WebInspector.ResourceHTMLView(this.resource);

        if (this.resource.category === WebInspector.resourceCategories.xhr && this.resource.content) {
            var parsedJSON = WebInspector.ResourceJSONView.parseJSON(this.resource.content);
            if (parsedJSON)
                return new WebInspector.ResourceJSONView(this.resource, parsedJSON);
        }

        if (this.resource.content && this.resource.category === WebInspector.resourceCategories.scripts && this.resource.mimeType === "application/json") {
            var parsedJSONP = WebInspector.ResourceJSONView.parseJSONP(this.resource.content);
            if (parsedJSONP)
                return new WebInspector.ResourceJSONView(this.resource, parsedJSONP);
        }

        if (this._responseView.sourceView)
            return this._responseView.sourceView;

        if (this.resource.category === WebInspector.resourceCategories.other)
            return this._createEmptyView();

        return WebInspector.ResourceView.nonSourceViewForResource(this.resource);
    }
}

WebInspector.ResourcePreviewView.prototype.__proto__ = WebInspector.ResourceContentView.prototype;
