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

    this.tabbedPane = new WebInspector.TabbedPane(this.element);

    this.headersElement = document.createElement("div");
    this.headersElement.className = "resource-view-headers";
    this.tabbedPane.appendTab("headers", WebInspector.UIString("Headers"), this.headersElement, this._selectHeadersTab.bind(this, true));

    if (this.hasContentTab()) {
        this.contentElement = document.createElement("div");
        this.contentElement.className = "resource-view-content";
        this.tabbedPane.appendTab("content", WebInspector.UIString("Content"), this.contentElement, this.selectContentTab.bind(this, true));
    }

    this.headersListElement = document.createElement("ol");
    this.headersListElement.className = "outline-disclosure";
    this.headersElement.appendChild(this.headersListElement);

    this.headersTreeOutline = new TreeOutline(this.headersListElement);
    this.headersTreeOutline.expandTreeElementsWhenArrowing = true;

    this.urlTreeElement = new TreeElement("", null, false);
    this.urlTreeElement.selectable = false;
    this.headersTreeOutline.appendChild(this.urlTreeElement);

    this.requestMethodTreeElement = new TreeElement("", null, false);
    this.requestMethodTreeElement.selectable = false;
    this.headersTreeOutline.appendChild(this.requestMethodTreeElement);

    this.statusCodeTreeElement = new TreeElement("", null, false);
    this.statusCodeTreeElement.selectable = false;
    this.headersTreeOutline.appendChild(this.statusCodeTreeElement);
     
    this.requestHeadersTreeElement = new TreeElement("", null, true);
    this.requestHeadersTreeElement.expanded = true;
    this.requestHeadersTreeElement.selectable = false;
    this.headersTreeOutline.appendChild(this.requestHeadersTreeElement);

    this._decodeHover = WebInspector.UIString("Double-Click to toggle between URL encoded and decoded formats");
    this._decodeRequestParameters = true;

    this.queryStringTreeElement = new TreeElement("", null, true);
    this.queryStringTreeElement.expanded = true;
    this.queryStringTreeElement.selectable = false;
    this.queryStringTreeElement.hidden = true;
    this.headersTreeOutline.appendChild(this.queryStringTreeElement);

    this.formDataTreeElement = new TreeElement("", null, true);
    this.formDataTreeElement.expanded = true;
    this.formDataTreeElement.selectable = false;
    this.formDataTreeElement.hidden = true;
    this.headersTreeOutline.appendChild(this.formDataTreeElement);

    this.requestPayloadTreeElement = new TreeElement(WebInspector.UIString("Request Payload"), null, true);
    this.requestPayloadTreeElement.expanded = true;
    this.requestPayloadTreeElement.selectable = false;
    this.requestPayloadTreeElement.hidden = true;
    this.headersTreeOutline.appendChild(this.requestPayloadTreeElement);

    this.responseHeadersTreeElement = new TreeElement("", null, true);
    this.responseHeadersTreeElement.expanded = true;
    this.responseHeadersTreeElement.selectable = false;
    this.headersTreeOutline.appendChild(this.responseHeadersTreeElement);

    this.headersVisible = true;

    resource.addEventListener("url changed", this._refreshURL, this);
    resource.addEventListener("requestHeaders changed", this._refreshRequestHeaders, this);
    resource.addEventListener("responseHeaders changed", this._refreshResponseHeaders, this);
    resource.addEventListener("finished", this._refreshHTTPInformation, this);

    this._refreshURL();
    this._refreshQueryString();
    this._refreshRequestHeaders();
    this._refreshResponseHeaders();
    this._refreshHTTPInformation();
    this._selectTab();
}

WebInspector.ResourceView.prototype = {
    attach: function()
    {
        if (!this.element.parentNode) {
            var parentElement = (document.getElementById("resource-views") || document.getElementById("script-resource-views"));
            if (parentElement)
                parentElement.appendChild(this.element);
        }
    },

    show: function(parentElement)
    {
        WebInspector.View.prototype.show.call(this, parentElement);
        this._selectTab();
    },

    set headersVisible(x)
    {
        if (x === this._headersVisible)
            return;
        this._headersVisible = x;
        if (x)
            this.element.addStyleClass("headers-visible"); 
        else
            this.element.removeStyleClass("headers-visible"); 
        this._selectTab();
    },

    _selectTab: function()
    {
        if (this._headersVisible) {
            if (!this.hasContentTab() || WebInspector.applicationSettings.resourceViewTab === "headers")
                this._selectHeadersTab();
            else
                this.selectContentTab();
        } else
            this._innerSelectContentTab();
    },

    _selectHeadersTab: function(updatePrefs)
    {
        if (updatePrefs)
            WebInspector.applicationSettings.resourceViewTab = "headers";
        this.tabbedPane.selectTabById("headers");
    },

    selectContentTab: function(updatePrefs)
    {
        if (updatePrefs)
            WebInspector.applicationSettings.resourceViewTab = "content";
        this._innerSelectContentTab();
    },

    hasContentTab: function()
    {
        // Derived classes should override this method and define this.contentTabSelected for content rendering.
        return false;
    },

    _innerSelectContentTab: function()
    {
        this.tabbedPane.selectTabById("content");
        if ("resize" in this)
            this.resize();
        if (this.hasContentTab())
            this.contentTabSelected();
    },

    _refreshURL: function()
    {
        this.urlTreeElement.title = "<div class=\"header-name\">" + WebInspector.UIString("Request URL") + ":</div>" +
            "<div class=\"header-value source-code\">" + this.resource.url.escapeHTML() + "</div>";
    },

    _refreshQueryString: function()
    {
        var queryParameters = this.resource.queryParameters;
        this.queryStringTreeElement.hidden = !queryParameters;
        if (queryParameters)
            this._refreshParms(WebInspector.UIString("Query String Parameters"), queryParameters, this.queryStringTreeElement);
    },

    _refreshFormData: function()
    {
        this.formDataTreeElement.hidden = true;
        this.requestPayloadTreeElement.hidden = true;

        var formData = this.resource.requestFormData;
        if (!formData)
            return;

        var formParameters = this.resource.formParameters;
        if (formParameters) {
            this.formDataTreeElement.hidden = false;
            this._refreshParms(WebInspector.UIString("Form Data"), formParameters, this.formDataTreeElement);
        } else {
            this.requestPayloadTreeElement.hidden = false;
            this._refreshRequestPayload(formData);
        }
    },

    _refreshRequestPayload: function(formData)
    {
        this.requestPayloadTreeElement.removeChildren();

        var title = "<div class=\"raw-form-data header-value source-code\">" + formData.escapeHTML() + "</div>";
        var parmTreeElement = new TreeElement(title, null, false);
        parmTreeElement.selectable = false;
        this.requestPayloadTreeElement.appendChild(parmTreeElement);
    },

    _refreshParms: function(title, parms, parmsTreeElement)
    {
        parmsTreeElement.removeChildren();

        parmsTreeElement.title = title + "<span class=\"header-count\">" + WebInspector.UIString(" (%d)", parms.length) + "</span>";

        for (var i = 0; i < parms.length; ++i) {
            var name = parms[i].name;
            var value = parms[i].value;

            var errorDecoding = false;
            if (this._decodeRequestParameters) {
                if (value.indexOf("%") >= 0) {
                    try {
                        value = decodeURIComponent(value);
                    } catch(e) {
                        errorDecoding = true;
                    }
                }
                    
                value = value.replace(/\+/g, " ");
            }

            valueEscaped = value.escapeHTML();
            if (errorDecoding)
                valueEscaped += " <span class=\"error-message\">" + WebInspector.UIString("(unable to decode value)").escapeHTML() + "</span>";

            var title = "<div class=\"header-name\">" + name.escapeHTML() + ":</div>";
            title += "<div class=\"header-value source-code\">" + valueEscaped + "</div>";

            var parmTreeElement = new TreeElement(title, null, false);
            parmTreeElement.selectable = false;
            parmTreeElement.tooltip = this._decodeHover;
            parmTreeElement.ondblclick = this._toggleURLdecoding.bind(this);
            parmsTreeElement.appendChild(parmTreeElement);
        }
    },

    _toggleURLdecoding: function(event)
    {
        this._decodeRequestParameters = !this._decodeRequestParameters;
        this._refreshQueryString();
        this._refreshFormData();
    },

    _getHeaderValue: function(headers, key)
    {
        var lowerKey = key.toLowerCase();
        for (var testKey in headers) {
            if (testKey.toLowerCase() === lowerKey)
                return headers[testKey];
        }
    },

    _refreshRequestHeaders: function()
    {
        var additionalRow = null;
        if (typeof this.resource.webSocketRequestKey3 !== "undefined")
            additionalRow = {header: "(Key3)", value: this.resource.webSocketRequestKey3};
        this._refreshHeaders(WebInspector.UIString("Request Headers"), this.resource.sortedRequestHeaders, additionalRow, this.requestHeadersTreeElement);
        this._refreshFormData();
    },

    _refreshResponseHeaders: function()
    {
        var additionalRow = null;
        if (typeof this.resource.webSocketChallengeResponse !== "undefined")
            additionalRow = {header: "(Challenge Response)", value: this.resource.webSocketChallengeResponse};
        this._refreshHeaders(WebInspector.UIString("Response Headers"), this.resource.sortedResponseHeaders, additionalRow, this.responseHeadersTreeElement);
    },

    _refreshHTTPInformation: function()
    {
        var requestMethodElement = this.requestMethodTreeElement;
        requestMethodElement.hidden = !this.resource.statusCode;
        var statusCodeElement = this.statusCodeTreeElement;
        statusCodeElement.hidden = !this.resource.statusCode;
        var statusCodeImage = "";

        if (this.resource.statusCode) {
            var statusImageSource = "";
            if (this.resource.statusCode < 300)
                statusImageSource = "Images/successGreenDot.png";
            else if (this.resource.statusCode < 400)
                statusImageSource = "Images/warningOrangeDot.png";
            else
                statusImageSource = "Images/errorRedDot.png";

            var statusTextEscaped = this.resource.statusCode + " " + this.resource.statusText.escapeHTML();
            statusCodeImage = "<img class=\"resource-status-image\" src=\"" + statusImageSource + "\" title=\"" + statusTextEscaped + "\">";
    
            requestMethodElement.title = "<div class=\"header-name\">" + WebInspector.UIString("Request Method") + ":</div>" +
                "<div class=\"header-value source-code\">" + this.resource.requestMethod + "</div>";

            statusCodeElement.title = "<div class=\"header-name\">" + WebInspector.UIString("Status Code") + ":</div>" +
                statusCodeImage + "<div class=\"header-value source-code\">" + statusTextEscaped + "</div>";
        }
    },
    
    _refreshHeaders: function(title, headers, additionalRow, headersTreeElement)
    {
        headersTreeElement.removeChildren();

        var length = headers.length;
        headersTreeElement.title = title.escapeHTML() + "<span class=\"header-count\">" + WebInspector.UIString(" (%d)", length) + "</span>";
        headersTreeElement.hidden = !length;

        var length = headers.length;
        for (var i = 0; i < length; ++i) {
            var title = "<div class=\"header-name\">" + headers[i].header.escapeHTML() + ":</div>";
            title += "<div class=\"header-value source-code\">" + headers[i].value.escapeHTML() + "</div>"

            var headerTreeElement = new TreeElement(title, null, false);
            headerTreeElement.selectable = false;
            headersTreeElement.appendChild(headerTreeElement);
        }

        if (additionalRow) {
            var title = "<div class=\"header-name\">" + additionalRow.header.escapeHTML() + ":</div>";
            title += "<div class=\"header-value source-code\">" + additionalRow.value.escapeHTML() + "</div>"

            var headerTreeElement = new TreeElement(title, null, false);
            headerTreeElement.selectable = false;
            headersTreeElement.appendChild(headerTreeElement);
        }
    }
}

WebInspector.ResourceView.prototype.__proto__ = WebInspector.View.prototype;
