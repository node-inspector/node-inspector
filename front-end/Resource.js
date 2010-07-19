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

WebInspector.Resource = function(identifier, url)
{
    this.identifier = identifier;
    this._url = url;
    this._startTime = -1;
    this._endTime = -1;
    this._requestMethod = "";
    this._category = WebInspector.resourceCategories.other;
}

// Keep these in sync with WebCore::InspectorResource::Type
WebInspector.Resource.Type = {
    Document:   0,
    Stylesheet: 1,
    Image:      2,
    Font:       3,
    Script:     4,
    XHR:        5,
    Media:      6,
    Other:      7,

    isTextType: function(type)
    {
        return (type === this.Document) || (type === this.Stylesheet) || (type === this.Script) || (type === this.XHR);
    },

    toString: function(type)
    {
        switch (type) {
            case this.Document:
                return WebInspector.UIString("document");
            case this.Stylesheet:
                return WebInspector.UIString("stylesheet");
            case this.Image:
                return WebInspector.UIString("image");
            case this.Font:
                return WebInspector.UIString("font");
            case this.Script:
                return WebInspector.UIString("script");
            case this.XHR:
                return WebInspector.UIString("XHR");
            case this.Other:
            default:
                return WebInspector.UIString("other");
        }
    }
}

WebInspector.Resource.prototype = {
    get url()
    {
        return this._url;
    },

    set url(x)
    {
        if (this._url === x)
            return;

        var oldURL = this._url;
        this._url = x;
        delete this._parsedQueryParameters;
        // FIXME: We should make the WebInspector object listen for the "url changed" event.
        // Then resourceURLChanged can be removed.
        WebInspector.resourceURLChanged(this, oldURL);

        this.dispatchEventToListeners("url changed");
    },

    get documentURL()
    {
        return this._documentURL;
    },

    set documentURL(x)
    {
        if (this._documentURL === x)
            return;
        this._documentURL = x;
    },

    get domain()
    {
        return this._domain;
    },

    set domain(x)
    {
        if (this._domain === x)
            return;
        this._domain = x;
    },

    get lastPathComponent()
    {
        return this._lastPathComponent;
    },

    set lastPathComponent(x)
    {
        if (this._lastPathComponent === x)
            return;
        this._lastPathComponent = x;
        this._lastPathComponentLowerCase = x ? x.toLowerCase() : null;
    },

    get displayName()
    {
        var title = this.lastPathComponent;
        if (!title)
            title = this.displayDomain;
        if (!title && this.url)
            title = this.url.trimURL(WebInspector.mainResource ? WebInspector.mainResource.domain : "");
        if (title === "/")
            title = this.url;
        return title;
    },

    get displayDomain()
    {
        // WebInspector.Database calls this, so don't access more than this.domain.
        if (this.domain && (!WebInspector.mainResource || (WebInspector.mainResource && this.domain !== WebInspector.mainResource.domain)))
            return this.domain;
        return "";
    },

    get startTime()
    {
        return this._startTime || -1;
    },

    set startTime(x)
    {
        if (this._startTime === x)
            return;

        this._startTime = x;

        if (WebInspector.panels.resources)
            WebInspector.panels.resources.refreshResource(this);
    },

    get responseReceivedTime()
    {
        return this._responseReceivedTime || -1;
    },

    set responseReceivedTime(x)
    {
        if (this._responseReceivedTime === x)
            return;

        this._responseReceivedTime = x;

        if (WebInspector.panels.resources)
            WebInspector.panels.resources.refreshResource(this);
    },

    get endTime()
    {
        return this._endTime || -1;
    },

    set endTime(x)
    {
        if (this._endTime === x)
            return;

        this._endTime = x;

        if (WebInspector.panels.resources)
            WebInspector.panels.resources.refreshResource(this);
    },

    get duration()
    {
        if (this._endTime === -1 || this._startTime === -1)
            return -1;
        return this._endTime - this._startTime;
    },

    get latency()
    {
        if (this._responseReceivedTime === -1 || this._startTime === -1)
            return -1;
        return this._responseReceivedTime - this._startTime;
    },

    get receiveDuration()
    {
        if (this._endTime === -1 || this._responseReceivedTime === -1)
            return -1;
        return this._endTime - this._responseReceivedTime;
    },

    get resourceSize()
    {
        return this._resourceSize || 0;
    },

    set resourceSize(x)
    {
        if (this._resourceSize === x)
            return;

        this._resourceSize = x;

        if (WebInspector.panels.resources)
            WebInspector.panels.resources.refreshResource(this);
    },

    get transferSize()
    {
        // FIXME: this is wrong for chunked-encoding resources.
        return this.cached ? 0 : Number(this.responseHeaders["Content-Length"] || this.resourceSize || 0);
    },

    get expectedContentLength()
    {
        return this._expectedContentLength || 0;
    },

    set expectedContentLength(x)
    {
        if (this._expectedContentLength === x)
            return;
        this._expectedContentLength = x;
    },

    get finished()
    {
        return this._finished;
    },

    set finished(x)
    {
        if (this._finished === x)
            return;

        this._finished = x;

        if (x) {
            this._checkWarnings();
            this.dispatchEventToListeners("finished");
        }
    },

    get failed()
    {
        return this._failed;
    },

    set failed(x)
    {
        this._failed = x;
    },

    get category()
    {
        return this._category;
    },

    set category(x)
    {
        if (this._category === x)
            return;

        var oldCategory = this._category;
        if (oldCategory)
            oldCategory.removeResource(this);

        this._category = x;

        if (this._category)
            this._category.addResource(this);

        if (WebInspector.panels.resources) {
            WebInspector.panels.resources.refreshResource(this);
            WebInspector.panels.resources.recreateViewForResourceIfNeeded(this);
        }
    },

    get cached()
    {
        return this._cached;
    },

    set cached(x)
    {
        this._cached = x;
        this.dispatchEventToListeners("cached changed");
    },

    get mimeType()
    {
        return this._mimeType;
    },

    set mimeType(x)
    {
        if (this._mimeType === x)
            return;

        this._mimeType = x;
    },

    get type()
    {
        return this._type;
    },

    set type(x)
    {
        if (this._type === x)
            return;

        this._type = x;

        switch (x) {
            case WebInspector.Resource.Type.Document:
                this.category = WebInspector.resourceCategories.documents;
                break;
            case WebInspector.Resource.Type.Stylesheet:
                this.category = WebInspector.resourceCategories.stylesheets;
                break;
            case WebInspector.Resource.Type.Script:
                this.category = WebInspector.resourceCategories.scripts;
                break;
            case WebInspector.Resource.Type.Image:
                this.category = WebInspector.resourceCategories.images;
                break;
            case WebInspector.Resource.Type.Font:
                this.category = WebInspector.resourceCategories.fonts;
                break;
            case WebInspector.Resource.Type.XHR:
                this.category = WebInspector.resourceCategories.xhr;
                break;
            case WebInspector.Resource.Type.Other:
            default:
                this.category = WebInspector.resourceCategories.other;
                break;
        }
    },

    get requestHeaders()
    {
        if (this._requestHeaders === undefined)
            this._requestHeaders = {};
        return this._requestHeaders;
    },

    set requestHeaders(x)
    {
        if (this._requestHeaders === x)
            return;

        this._requestHeaders = x;
        delete this._sortedRequestHeaders;

        this.dispatchEventToListeners("requestHeaders changed");
    },

    get sortedRequestHeaders()
    {
        if (this._sortedRequestHeaders !== undefined)
            return this._sortedRequestHeaders;

        this._sortedRequestHeaders = [];
        for (var key in this.requestHeaders)
            this._sortedRequestHeaders.push({header: key, value: this.requestHeaders[key]});
        this._sortedRequestHeaders.sort(function(a,b) { return a.header.localeCompare(b.header) });

        return this._sortedRequestHeaders;
    },

    requestHeaderValue: function(headerName)
    {
        return this._headerValue(this.requestHeaders, headerName);
    },

    get requestFormData()
    {
        return this._requestFormData;
    },

    set requestFormData(x)
    {
        this._requestFormData = x;
        delete this._parsedFormParameters;
    },

    get responseHeaders()
    {
        if (this._responseHeaders === undefined)
            this._responseHeaders = {};
        return this._responseHeaders;
    },

    set responseHeaders(x)
    {
        if (this._responseHeaders === x)
            return;

        this._responseHeaders = x;
        delete this._sortedResponseHeaders;

        this.dispatchEventToListeners("responseHeaders changed");
    },

    get sortedResponseHeaders()
    {
        if (this._sortedResponseHeaders !== undefined)
            return this._sortedResponseHeaders;

        this._sortedResponseHeaders = [];
        for (var key in this.responseHeaders)
            this._sortedResponseHeaders.push({header: key, value: this.responseHeaders[key]});
        this._sortedResponseHeaders.sort(function(a,b) { return a.header.localeCompare(b.header) });

        return this._sortedResponseHeaders;
    },

    responseHeaderValue: function(headerName)
    {
        return this._headerValue(this.responseHeaders, headerName);
    },

    get queryParameters()
    {
        if (this._parsedQueryParameters)
            return this._parsedQueryParameters;
        var queryString = this.url.split("?", 2)[1];
        if (!queryString)
            return;
        this._parsedQueryParameters = this._parseParameters(queryString);
        return this._parsedQueryParameters;
    },

    get formParameters()
    {
        if (this._parsedFormParameters)
            return this._parsedFormParameters;
        if (!this.requestFormData)
            return;
        var requestContentType = this.requestHeaderValue("Content-Type");
        if (!requestContentType || !requestContentType.match(/^application\/x-www-form-urlencoded\s*(;.*)?$/i))
            return;
        this._parsedFormParameters = this._parseParameters(this.requestFormData);
        return this._parsedFormParameters;
    },

    _parseParameters: function(queryString)
    {
        function parseNameValue(pair)
        {
            var parameter = {};
            var splitPair = pair.split("=", 2);

            parameter.name = splitPair[0];
            if (splitPair.length === 1)
                parameter.value = "";
            else
                parameter.value = splitPair[1];
            return parameter;
        }
        return queryString.split("&").map(parseNameValue);
    },

    _headerValue: function(headers, headerName)
    {
        headerName = headerName.toLowerCase();
        for (var header in headers) {
            if (header.toLowerCase() === headerName)
                return headers[header];
        }
    },

    get scripts()
    {
        if (!("_scripts" in this))
            this._scripts = [];
        return this._scripts;
    },

    addScript: function(script)
    {
        if (!script)
            return;
        this.scripts.unshift(script);
        script.resource = this;
    },

    removeAllScripts: function()
    {
        if (!this._scripts)
            return;

        for (var i = 0; i < this._scripts.length; ++i) {
            if (this._scripts[i].resource === this)
                delete this._scripts[i].resource;
        }

        delete this._scripts;
    },

    removeScript: function(script)
    {
        if (!script)
            return;

        if (script.resource === this)
            delete script.resource;

        if (!this._scripts)
            return;

        this._scripts.remove(script);
    },

    get errors()
    {
        return this._errors || 0;
    },

    set errors(x)
    {
        this._errors = x;
    },

    get warnings()
    {
        return this._warnings || 0;
    },

    set warnings(x)
    {
        this._warnings = x;
    },

    _mimeTypeIsConsistentWithType: function()
    {
        // If status is an error, content is likely to be of an inconsistent type,
        // as it's going to be an error message. We do not want to emit a warning
        // for this, though, as this will already be reported as resource loading failure.
        if (this.statusCode >= 400)
            return true;

        if (typeof this.type === "undefined"
         || this.type === WebInspector.Resource.Type.Other
         || this.type === WebInspector.Resource.Type.XHR)
            return true;

        if (this.mimeType in WebInspector.MIMETypes)
            return this.type in WebInspector.MIMETypes[this.mimeType];

        return false;
    },

    _checkWarnings: function()
    {
        for (var warning in WebInspector.Warnings)
            this._checkWarning(WebInspector.Warnings[warning]);
    },

    _checkWarning: function(warning)
    {
        var msg;
        switch (warning.id) {
            case WebInspector.Warnings.IncorrectMIMEType.id:
                if (!this._mimeTypeIsConsistentWithType())
                    msg = new WebInspector.ConsoleMessage(WebInspector.ConsoleMessage.MessageSource.Other,
                        WebInspector.ConsoleMessage.MessageType.Log, 
                        WebInspector.ConsoleMessage.MessageLevel.Warning,
                        -1,
                        this.url,
                        null,
                        1,
                        String.sprintf(WebInspector.Warnings.IncorrectMIMEType.message, WebInspector.Resource.Type.toString(this.type), this.mimeType),
                        null,
                        null);
                break;
        }

        if (msg)
            WebInspector.console.addMessage(msg);
    }
}

WebInspector.Resource.prototype.__proto__ = WebInspector.Object.prototype;

WebInspector.Resource.CompareByStartTime = function(a, b)
{
    return a.startTime - b.startTime;
}

WebInspector.Resource.CompareByResponseReceivedTime = function(a, b)
{
    var aVal = a.responseReceivedTime;
    var bVal = b.responseReceivedTime;
    if (aVal === -1 ^ bVal === -1)
        return bVal - aVal;
    return aVal - bVal;
}

WebInspector.Resource.CompareByEndTime = function(a, b)
{
    var aVal = a.endTime;
    var bVal = b.endTime;
    if (aVal === -1 ^ bVal === -1)
        return bVal - aVal;
    return aVal - bVal;
}

WebInspector.Resource.CompareByDuration = function(a, b)
{
    return a.duration - b.duration;
}

WebInspector.Resource.CompareByLatency = function(a, b)
{
    return a.latency - b.latency;
}

WebInspector.Resource.CompareBySize = function(a, b)
{
    return a.resourceSize - b.resourceSize;
}

WebInspector.Resource.CompareByTransferSize = function(a, b)
{
    return a.transferSize - b.transferSize;
}
