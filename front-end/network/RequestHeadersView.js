/*
 * Copyright (C) 2007, 2008 Apple Inc.  All rights reserved.
 * Copyright (C) IBM Corp. 2009  All rights reserved.
 * Copyright (C) 2010 Google Inc. All rights reserved.
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
 * @extends {WebInspector.VBox}
 * @param {!WebInspector.NetworkRequest} request
 */
WebInspector.RequestHeadersView = function(request)
{
    WebInspector.VBox.call(this);
    this.registerRequiredCSS("network/requestHeadersView.css");
    this.element.classList.add("request-headers-view");

    this._request = request;
    this._decodeRequestParameters = true;
    this._showRequestHeadersText = false;
    this._showResponseHeadersText = false;

    var outline = this.element.createChild("ol", "outline-disclosure");
    var root = new TreeOutline(outline);
    root.expandTreeElementsWhenArrowing = true;

    var generalCategory = new WebInspector.RequestHeadersView.Category(root, "general", WebInspector.UIString("General"));
    generalCategory.hidden = false;
    this._remoteAddressItem = generalCategory.createLeaf();
    this._remoteAddressItem.hidden = true;
    this._urlItem = generalCategory.createLeaf();
    this._requestMethodItem = generalCategory.createLeaf();
    this._statusCodeItem = generalCategory.createLeaf();

    this._responseHeadersCategory = new WebInspector.RequestHeadersView.Category(root, "responseHeaders", "");
    this._requestHeadersCategory = new WebInspector.RequestHeadersView.Category(root, "requestHeaders", "");
    this._queryStringCategory = new WebInspector.RequestHeadersView.Category(root, "queryString", "");
    this._formDataCategory = new WebInspector.RequestHeadersView.Category(root, "formData", "");
    this._requestPayloadCategory = new WebInspector.RequestHeadersView.Category(root, "requestPayload", WebInspector.UIString("Request Payload"));
}

WebInspector.RequestHeadersView.prototype = {

    wasShown: function()
    {
        this._request.addEventListener(WebInspector.NetworkRequest.Events.RemoteAddressChanged, this._refreshRemoteAddress, this);
        this._request.addEventListener(WebInspector.NetworkRequest.Events.RequestHeadersChanged, this._refreshRequestHeaders, this);
        this._request.addEventListener(WebInspector.NetworkRequest.Events.ResponseHeadersChanged, this._refreshResponseHeaders, this);
        this._request.addEventListener(WebInspector.NetworkRequest.Events.FinishedLoading, this._refreshHTTPInformation, this);

        this._refreshURL();
        this._refreshQueryString();
        this._refreshRequestHeaders();
        this._refreshResponseHeaders();
        this._refreshHTTPInformation();
        this._refreshRemoteAddress();
    },

    willHide: function()
    {
        this._request.removeEventListener(WebInspector.NetworkRequest.Events.RemoteAddressChanged, this._refreshRemoteAddress, this);
        this._request.removeEventListener(WebInspector.NetworkRequest.Events.RequestHeadersChanged, this._refreshRequestHeaders, this);
        this._request.removeEventListener(WebInspector.NetworkRequest.Events.ResponseHeadersChanged, this._refreshResponseHeaders, this);
        this._request.removeEventListener(WebInspector.NetworkRequest.Events.FinishedLoading, this._refreshHTTPInformation, this);
    },

    /**
     * @param {string} name
     * @param {string} value
     * @return {!DocumentFragment}
     */
    _formatHeader: function(name, value)
    {
        var fragment = createDocumentFragment();
        fragment.createChild("div", "header-name").textContent = name + ":";
        fragment.createChild("div", "header-value source-code").textContent = value;

        return fragment;
    },

    /**
     * @param {string} value
     * @param {string} className
     * @param {boolean} decodeParameters
     * @return {!Element}
     */
    _formatParameter: function(value, className, decodeParameters)
    {
        var errorDecoding = false;

        if (decodeParameters) {
            value = value.replace(/\+/g, " ");
            if (value.indexOf("%") >= 0) {
                try {
                    value = decodeURIComponent(value);
                } catch (e) {
                    errorDecoding = true;
                }
            }
        }
        var div = createElementWithClass("div", className);
        if (errorDecoding)
            div.createChild("span", "error-message").textContent = WebInspector.UIString("(unable to decode value)");
        else
            div.textContent = value;
        return div;
    },

    _refreshURL: function()
    {
        this._urlItem.title = this._formatHeader(WebInspector.UIString("Request URL"), this._request.url);
    },

    _refreshQueryString: function()
    {
        var queryString = this._request.queryString();
        var queryParameters = this._request.queryParameters;
        this._queryStringCategory.hidden = !queryParameters;
        if (queryParameters)
            this._refreshParams(WebInspector.UIString("Query String Parameters"), queryParameters, queryString, this._queryStringCategory);
    },

    _refreshFormData: function()
    {
        this._formDataCategory.hidden = true;
        this._requestPayloadCategory.hidden = true;

        var formData = this._request.requestFormData;
        if (!formData)
            return;

        var formParameters = this._request.formParameters;
        if (formParameters) {
            this._formDataCategory.hidden = false;
            this._refreshParams(WebInspector.UIString("Form Data"), formParameters, formData, this._formDataCategory);
        } else {
            this._requestPayloadCategory.hidden = false;
            try {
                var json = JSON.parse(formData);
                this._refreshRequestJSONPayload(json, formData);
            } catch (e) {
                this._populateTreeElementWithSourceText(this._requestPayloadCategory, formData);
            }
        }
    },

    /**
     * @param {!TreeElement} treeElement
     * @param {?string} sourceText
     */
    _populateTreeElementWithSourceText: function(treeElement, sourceText)
    {
        var sourceTextElement = createElementWithClass("span", "header-value source-code");
        sourceTextElement.textContent = String(sourceText || "").trim();

        var sourceTreeElement = new TreeElement(sourceTextElement);
        sourceTreeElement.selectable = false;
        treeElement.removeChildren();
        treeElement.appendChild(sourceTreeElement);
    },

    /**
     * @param {string} title
     * @param {?Array.<!WebInspector.NetworkRequest.NameValue>} params
     * @param {?string} sourceText
     * @param {!TreeElement} paramsTreeElement
     */
    _refreshParams: function(title, params, sourceText, paramsTreeElement)
    {
        paramsTreeElement.removeChildren();

        paramsTreeElement.listItemElement.removeChildren();
        paramsTreeElement.listItemElement.createTextChild(title);

        var headerCount = createElementWithClass("span", "header-count");
        headerCount.textContent = WebInspector.UIString(" (%d)", params.length);
        paramsTreeElement.listItemElement.appendChild(headerCount);

        /**
         * @param {!Event} event
         * @this {WebInspector.RequestHeadersView}
         */
        function toggleViewSource(event)
        {
            paramsTreeElement._viewSource = !paramsTreeElement._viewSource;
            this._refreshParams(title, params, sourceText, paramsTreeElement);
            event.consume();
        }

        paramsTreeElement.listItemElement.appendChild(this._createViewSourceToggle(paramsTreeElement._viewSource, toggleViewSource.bind(this)));

        if (paramsTreeElement._viewSource) {
            this._populateTreeElementWithSourceText(paramsTreeElement, sourceText);
            return;
        }

        var toggleTitle = this._decodeRequestParameters ? WebInspector.UIString("view URL encoded") : WebInspector.UIString("view decoded");
        var toggleButton = this._createToggleButton(toggleTitle);
        toggleButton.addEventListener("click", this._toggleURLDecoding.bind(this), false);
        paramsTreeElement.listItemElement.appendChild(toggleButton);

        for (var i = 0; i < params.length; ++i) {
            var paramNameValue = createDocumentFragment();
            var name = this._formatParameter(params[i].name + ":", "header-name", this._decodeRequestParameters);
            var value = this._formatParameter(params[i].value, "header-value source-code", this._decodeRequestParameters);
            paramNameValue.appendChild(name);
            paramNameValue.appendChild(value);

            var parmTreeElement = new TreeElement(paramNameValue, null, false);
            parmTreeElement.selectable = false;
            paramsTreeElement.appendChild(parmTreeElement);
        }
    },

    /**
     * @param {*} parsedObject
     * @param {string} sourceText
     */
    _refreshRequestJSONPayload: function(parsedObject, sourceText)
    {
        var treeElement = this._requestPayloadCategory;
        treeElement.removeChildren();

        var listItem = this._requestPayloadCategory.listItemElement;
        listItem.removeChildren();
        listItem.createTextChild(this._requestPayloadCategory.title);

        /**
         * @param {!Event} event
         * @this {WebInspector.RequestHeadersView}
         */
        function toggleViewSource(event)
        {
            treeElement._viewSource = !treeElement._viewSource;
            this._refreshRequestJSONPayload(parsedObject, sourceText);
            event.consume();
        }

        listItem.appendChild(this._createViewSourceToggle(treeElement._viewSource, toggleViewSource.bind(this)));
        if (treeElement._viewSource) {
            this._populateTreeElementWithSourceText(this._requestPayloadCategory, sourceText);
        } else {
            var object = WebInspector.RemoteObject.fromLocalObject(parsedObject);
            var section = new WebInspector.ObjectPropertiesSection(object, object.description);
            section.expand();
            section.editable = false;
            listItem.appendChild(section.element);
        }
    },

    /**
     * @param {boolean} viewSource
     * @param {function(!Event)} handler
     * @return {!Element}
     */
    _createViewSourceToggle: function(viewSource, handler)
    {
        var viewSourceToggleTitle = viewSource ? WebInspector.UIString("view parsed") : WebInspector.UIString("view source");
        var viewSourceToggleButton = this._createToggleButton(viewSourceToggleTitle);
        viewSourceToggleButton.addEventListener("click", handler, false);
        return viewSourceToggleButton;
    },

    /**
     * @param {!Event} event
     */
    _toggleURLDecoding: function(event)
    {
        this._decodeRequestParameters = !this._decodeRequestParameters;
        this._refreshQueryString();
        this._refreshFormData();
        event.consume();
    },

    _refreshRequestHeaders: function()
    {
        var treeElement = this._requestHeadersCategory;

        var headers = this._request.requestHeaders();
        headers = headers.slice();
        headers.sort(function(a, b) { return a.name.toLowerCase().compareTo(b.name.toLowerCase()) });
        var headersText = this._request.requestHeadersText();

        if (this._showRequestHeadersText && headersText)
            this._refreshHeadersText(WebInspector.UIString("Request Headers"), headers.length, headersText, treeElement);
        else
            this._refreshHeaders(WebInspector.UIString("Request Headers"), headers, treeElement, headersText === undefined);

        if (headersText) {
            var toggleButton = this._createHeadersToggleButton(this._showRequestHeadersText);
            toggleButton.addEventListener("click", this._toggleRequestHeadersText.bind(this), false);
            treeElement.listItemElement.appendChild(toggleButton);
        }

        this._refreshFormData();
    },

    _refreshResponseHeaders: function()
    {
        var treeElement = this._responseHeadersCategory;
        var headers = this._request.sortedResponseHeaders;
        var headersText = this._request.responseHeadersText;

        if (this._showResponseHeadersText)
            this._refreshHeadersText(WebInspector.UIString("Response Headers"), headers.length, headersText, treeElement);
        else
            this._refreshHeaders(WebInspector.UIString("Response Headers"), headers, treeElement);

        if (headersText) {
            var toggleButton = this._createHeadersToggleButton(this._showResponseHeadersText);
            toggleButton.addEventListener("click", this._toggleResponseHeadersText.bind(this), false);
            treeElement.listItemElement.appendChild(toggleButton);
        }
    },

    _refreshHTTPInformation: function()
    {
        var requestMethodElement = this._requestMethodItem;
        requestMethodElement.hidden = !this._request.statusCode;
        var statusCodeElement = this._statusCodeItem;
        statusCodeElement.hidden = !this._request.statusCode;

        if (this._request.statusCode) {
            var statusCodeFragment = createDocumentFragment();
            statusCodeFragment.createChild("div", "header-name").textContent = WebInspector.UIString("Status Code") + ":";

            var statusCodeImage = statusCodeFragment.createChild("div", "resource-status-image");
            statusCodeImage.title = this._request.statusCode + " " + this._request.statusText;

            if (this._request.statusCode < 300 || this._request.statusCode === 304)
                statusCodeImage.classList.add("green-ball");
            else if (this._request.statusCode < 400)
                statusCodeImage.classList.add("orange-ball");
            else
                statusCodeImage.classList.add("red-ball");

            requestMethodElement.title = this._formatHeader(WebInspector.UIString("Request Method"), this._request.requestMethod);

            var statusTextElement = statusCodeFragment.createChild("div", "header-value source-code");
            var statusText = this._request.statusCode + " " + this._request.statusText;
            if (this._request.fetchedViaServiceWorker) {
                statusText += " " + WebInspector.UIString("(from ServiceWorker)");
                statusTextElement.classList.add("status-from-cache");
            } else if (this._request.cached()) {
                statusText += " " + WebInspector.UIString("(from cache)");
                statusTextElement.classList.add("status-from-cache");
            }
            statusTextElement.textContent = statusText;

            statusCodeElement.title = statusCodeFragment;
        }
    },

    /**
     * @param {string} title
     * @param {!TreeElement} headersTreeElement
     * @param {number} headersLength
     */
    _refreshHeadersTitle: function(title, headersTreeElement, headersLength)
    {
        headersTreeElement.listItemElement.removeChildren();
        headersTreeElement.listItemElement.createTextChild(title);

        var headerCount = WebInspector.UIString(" (%d)", headersLength);
        headersTreeElement.listItemElement.createChild("span", "header-count").textContent = headerCount;
    },

    /**
     * @param {string} title
     * @param {!Array.<!WebInspector.NetworkRequest.NameValue>} headers
     * @param {!TreeElement} headersTreeElement
     * @param {boolean=} provisionalHeaders
     */
    _refreshHeaders: function(title, headers, headersTreeElement, provisionalHeaders)
    {
        headersTreeElement.removeChildren();

        var length = headers.length;
        this._refreshHeadersTitle(title, headersTreeElement, length);

        if (provisionalHeaders) {
            var cautionText = WebInspector.UIString("Provisional headers are shown");
            var cautionFragment = createDocumentFragment();
            cautionFragment.createChild("div", "warning-icon-small");
            cautionFragment.createChild("div", "caution").textContent = cautionText;
            var cautionTreeElement = new TreeElement(cautionFragment);
            cautionTreeElement.selectable = false;
            headersTreeElement.appendChild(cautionTreeElement);
        }

        headersTreeElement.hidden = !length && !provisionalHeaders;
        for (var i = 0; i < length; ++i) {
            var headerTreeElement = new TreeElement(this._formatHeader(headers[i].name, headers[i].value));
            headerTreeElement.selectable = false;
            headersTreeElement.appendChild(headerTreeElement);
        }
    },

    /**
     * @param {string} title
     * @param {number} count
     * @param {string} headersText
     * @param {!TreeElement} headersTreeElement
     */
    _refreshHeadersText: function(title, count, headersText, headersTreeElement)
    {
        this._populateTreeElementWithSourceText(headersTreeElement, headersText);
        this._refreshHeadersTitle(title, headersTreeElement, count);
    },

    _refreshRemoteAddress: function()
    {
        var remoteAddress = this._request.remoteAddress();
        var treeElement = this._remoteAddressItem;
        treeElement.hidden = !remoteAddress;
        if (remoteAddress)
            treeElement.title = this._formatHeader(WebInspector.UIString("Remote Address"), remoteAddress);
    },

    /**
     * @param {!Event} event
     */
    _toggleRequestHeadersText: function(event)
    {
        this._showRequestHeadersText = !this._showRequestHeadersText;
        this._refreshRequestHeaders();
        event.consume();
    },

    /**
     * @param {!Event} event
     */
    _toggleResponseHeadersText: function(event)
    {
        this._showResponseHeadersText = !this._showResponseHeadersText;
        this._refreshResponseHeaders();
        event.consume();
    },

    /**
     * @param {string} title
     * @return {!Element}
     */
    _createToggleButton: function(title)
    {
        var button = createElementWithClass("span", "header-toggle");
        button.textContent = title;
        return button;
    },

    /**
     * @param {boolean} isHeadersTextShown
     * @return {!Element}
     */
    _createHeadersToggleButton: function(isHeadersTextShown)
    {
        var toggleTitle = isHeadersTextShown ? WebInspector.UIString("view parsed") : WebInspector.UIString("view source");
        return this._createToggleButton(toggleTitle);
    },

    __proto__: WebInspector.VBox.prototype
}

/**
 * @constructor
 * @extends {TreeElement}
 * @param {!TreeOutline} root
 * @param {string} name
 * @param {string=} title
 */
WebInspector.RequestHeadersView.Category = function(root, name, title)
{
    TreeElement.call(this, title || "", null, true);
    this.selectable = false;
    this.toggleOnClick = true;
    this.hidden = true;
    this._expandedSetting = WebInspector.settings.createSetting("request-info-" + name + "-category-expanded", false);
    this.expanded = this._expandedSetting.get();
    root.appendChild(this);
}

WebInspector.RequestHeadersView.Category.prototype = {
    /**
     * @return {!TreeElement}
     */
    createLeaf: function()
    {
        var leaf = new TreeElement("", null, false);
        leaf.selectable = false;
        this.appendChild(leaf);
        return leaf;
    },

    onexpand: function()
    {
        this._expandedSetting.set(true);
    },

    oncollapse: function()
    {
        this._expandedSetting.set(false);
    },

    __proto__: TreeElement.prototype
}
