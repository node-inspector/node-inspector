/*
 * Copyright (C) 2012 Google Inc. All rights reserved.
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

/**
 * @constructor
 * @extends {WebInspector.SDKObject}
 * @implements {WebInspector.ContentProvider}
 * @param {!NetworkAgent.RequestId} requestId
 * @param {!WebInspector.Target} target
 * @param {string} url
 * @param {string} documentURL
 * @param {!PageAgent.FrameId} frameId
 * @param {!NetworkAgent.LoaderId} loaderId
 * @param {?NetworkAgent.Initiator} initiator
 */
WebInspector.NetworkRequest = function(target, requestId, url, documentURL, frameId, loaderId, initiator)
{
    WebInspector.SDKObject.call(this, target);

    this._requestId = requestId;
    this.url = url;
    this._documentURL = documentURL;
    this._frameId = frameId;
    this._loaderId = loaderId;
    /** @type {?NetworkAgent.Initiator} */
    this._initiator = initiator;
    this._startTime = -1;
    this._endTime = -1;

    this.statusCode = 0;
    this.statusText = "";
    this.requestMethod = "";
    this.requestTime = 0;

    /** @type {!WebInspector.ResourceType} */
    this._resourceType = WebInspector.resourceTypes.Other;
    this._contentEncoded = false;
    this._pendingContentCallbacks = [];
    /** @type {!Array.<!WebInspector.NetworkRequest.WebSocketFrame>} */
    this._frames = [];

    this._responseHeaderValues = {};

    this._remoteAddress = "";

    /** @type {string} */
    this.connectionId = "0";
}

WebInspector.NetworkRequest.Events = {
    FinishedLoading: "FinishedLoading",
    TimingChanged: "TimingChanged",
    RemoteAddressChanged: "RemoteAddressChanged",
    RequestHeadersChanged: "RequestHeadersChanged",
    ResponseHeadersChanged: "ResponseHeadersChanged",
    WebsocketFrameAdded: "WebsocketFrameAdded",
}

/** @enum {string} */
WebInspector.NetworkRequest.InitiatorType = {
    Other: "other",
    Parser: "parser",
    Redirect: "redirect",
    Script: "script"
}

/** @typedef {!{name: string, value: string}} */
WebInspector.NetworkRequest.NameValue;

/** @enum {string} */
WebInspector.NetworkRequest.WebSocketFrameType = {
    Send: "send",
    Receive: "receive",
    Error: "error"
}

/** @typedef {!{type: WebInspector.NetworkRequest.WebSocketFrameType, time: number, text: string, opCode: number, mask: boolean}} */
WebInspector.NetworkRequest.WebSocketFrame;

WebInspector.NetworkRequest.prototype = {
    /**
     * @param {!WebInspector.NetworkRequest} other
     * @return {number}
     */
    indentityCompare: function(other) {
        if (this._requestId > other._requestId)
            return 1;
        if (this._requestId < other._requestId)
            return -1;
        return 0;
    },

    /**
     * @return {!NetworkAgent.RequestId}
     */
    get requestId()
    {
        return this._requestId;
    },

    set requestId(requestId)
    {
        this._requestId = requestId;
    },

    /**
     * @return {string}
     */
    get url()
    {
        return this._url;
    },

    set url(x)
    {
        if (this._url === x)
            return;

        this._url = x;
        this._parsedURL = new WebInspector.ParsedURL(x);
        delete this._queryString;
        delete this._parsedQueryParameters;
        delete this._name;
        delete this._path;
    },

    /**
     * @return {string}
     */
    get documentURL()
    {
        return this._documentURL;
    },

    get parsedURL()
    {
        return this._parsedURL;
    },

    /**
     * @return {!PageAgent.FrameId}
     */
    get frameId()
    {
        return this._frameId;
    },

    /**
     * @return {!NetworkAgent.LoaderId}
     */
    get loaderId()
    {
        return this._loaderId;
    },

    /**
     * @param {string} ip
     * @param {number} port
     */
    setRemoteAddress: function(ip, port)
    {
        if (ip.indexOf(":") !== -1)
            ip = "[" + ip + "]";
        this._remoteAddress = ip + ":" + port;
        this.dispatchEventToListeners(WebInspector.NetworkRequest.Events.RemoteAddressChanged, this);
    },

    /**
     * @return {string}
     */
    remoteAddress: function()
    {
        return this._remoteAddress;
    },

    /**
     * @return {number}
     */
    get startTime()
    {
        return this._startTime || -1;
    },

    set startTime(x)
    {
        this._startTime = x;
    },

    /**
     * @return {number}
     */
    get responseReceivedTime()
    {
        return this._responseReceivedTime || -1;
    },

    set responseReceivedTime(x)
    {
        this._responseReceivedTime = x;
    },

    /**
     * @return {number}
     */
    get endTime()
    {
        return this._endTime || -1;
    },

    set endTime(x)
    {
        if (this.timing && this.timing.requestTime) {
            // Check against accurate responseReceivedTime.
            this._endTime = Math.max(x, this.responseReceivedTime);
        } else {
            // Prefer endTime since it might be from the network stack.
            this._endTime = x;
            if (this._responseReceivedTime > x)
                this._responseReceivedTime = x;
        }
        this.dispatchEventToListeners(WebInspector.NetworkRequest.Events.TimingChanged, this);
    },

    /**
     * @return {number}
     */
    get duration()
    {
        if (this._endTime === -1 || this._startTime === -1)
            return -1;
        return this._endTime - this._startTime;
    },

    /**
     * @return {number}
     */
    get latency()
    {
        if (this._responseReceivedTime === -1 || this._startTime === -1)
            return -1;
        return this._responseReceivedTime - this._startTime;
    },

    /**
     * @return {number}
     */
    get resourceSize()
    {
        return this._resourceSize || 0;
    },

    set resourceSize(x)
    {
        this._resourceSize = x;
    },

    /**
     * @return {number}
     */
    get transferSize()
    {
        return this._transferSize || 0;
    },

    /**
     * @param {number} x
     */
    increaseTransferSize: function(x)
    {
        this._transferSize = (this._transferSize || 0) + x;
    },

    /**
     * @param {number} x
     */
    setTransferSize: function(x)
    {
        this._transferSize = x;
    },

    /**
     * @return {boolean}
     */
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
            this.dispatchEventToListeners(WebInspector.NetworkRequest.Events.FinishedLoading, this);
            if (this._pendingContentCallbacks.length)
                this._innerRequestContent();
        }
    },

    /**
     * @return {boolean}
     */
    get failed()
    {
        return this._failed;
    },

    set failed(x)
    {
        this._failed = x;
    },

    /**
     * @return {boolean}
     */
    get canceled()
    {
        return this._canceled;
    },

    set canceled(x)
    {
        this._canceled = x;
    },

    /**
     * @return {boolean}
     */
    cached: function()
    {
        return (!!this._fromMemoryCache || !!this._fromDiskCache) && !this._transferSize;
    },

    setFromMemoryCache: function()
    {
        this._fromMemoryCache = true;
        delete this._timing;
    },

    setFromDiskCache: function()
    {
        this._fromDiskCache = true;
    },

    /**
     * @return {boolean}
     */
    get fetchedViaServiceWorker()
    {
        return this._fetchedViaServiceWorker;
    },

    set fetchedViaServiceWorker(x)
    {
        this._fetchedViaServiceWorker = x;
    },

    /**
     * @return {!NetworkAgent.ResourceTiming|undefined}
     */
    get timing()
    {
        return this._timing;
    },

    set timing(x)
    {
        if (x && !this._fromMemoryCache) {
            // Take startTime and responseReceivedTime from timing data for better accuracy.
            // Timing's requestTime is a baseline in seconds, rest of the numbers there are ticks in millis.
            this._startTime = x.requestTime;
            this._responseReceivedTime = x.requestTime + x.receiveHeadersEnd / 1000.0;

            this._timing = x;
            this.dispatchEventToListeners(WebInspector.NetworkRequest.Events.TimingChanged, this);
        }
    },

    /**
     * @return {string}
     */
    get mimeType()
    {
        return this._mimeType;
    },

    set mimeType(x)
    {
        this._mimeType = x;
    },

    /**
     * @return {string}
     */
    get displayName()
    {
        return this._parsedURL.displayName;
    },

    /**
     * @return {string}
     */
    name: function()
    {
        if (this._name)
            return this._name;
        this._parseNameAndPathFromURL();
        return this._name;
    },

    /**
     * @return {string}
     */
    path: function()
    {
        if (this._path)
            return this._path;
        this._parseNameAndPathFromURL();
        return this._path;
    },

    _parseNameAndPathFromURL: function()
    {
        if (this._parsedURL.isDataURL()) {
            this._name = this._parsedURL.dataURLDisplayName();
            this._path = "";
        } else if (this._parsedURL.isAboutBlank()) {
            this._name = this._parsedURL.url;
            this._path = "";
        } else {
            this._path = this._parsedURL.host + this._parsedURL.folderPathComponents;
            this._path = this._path.trimURL(this.target().resourceTreeModel.inspectedPageDomain());
            if (this._parsedURL.lastPathComponent || this._parsedURL.queryParams)
                this._name = this._parsedURL.lastPathComponent + (this._parsedURL.queryParams ? "?" + this._parsedURL.queryParams : "");
            else if (this._parsedURL.folderPathComponents) {
                this._name = this._parsedURL.folderPathComponents.substring(this._parsedURL.folderPathComponents.lastIndexOf("/") + 1) + "/";
                this._path = this._path.substring(0, this._path.lastIndexOf("/"));
            } else {
                this._name = this._parsedURL.host;
                this._path = "";
            }
        }
    },

    /**
     * @return {string}
     */
    get folder()
    {
        var path = this._parsedURL.path;
        var indexOfQuery = path.indexOf("?");
        if (indexOfQuery !== -1)
            path = path.substring(0, indexOfQuery);
        var lastSlashIndex = path.lastIndexOf("/");
        return lastSlashIndex !== -1 ? path.substring(0, lastSlashIndex) : "";
    },

    /**
     * @return {!WebInspector.ResourceType}
     */
    resourceType: function()
    {
        return this._resourceType;
    },

    /**
     * @param {!WebInspector.ResourceType} resourceType
     */
    setResourceType: function(resourceType)
    {
        this._resourceType = resourceType;
    },

    /**
     * @return {string}
     */
    get domain()
    {
        return this._parsedURL.host;
    },

    /**
     * @return {string}
     */
    get scheme()
    {
        return this._parsedURL.scheme;
    },

    /**
     * @return {?WebInspector.NetworkRequest}
     */
    get redirectSource()
    {
        if (this.redirects && this.redirects.length > 0)
            return this.redirects[this.redirects.length - 1];
        return this._redirectSource;
    },

    set redirectSource(x)
    {
        this._redirectSource = x;
        delete this._initiatorInfo;
    },

    /**
     * @return {!Array.<!WebInspector.NetworkRequest.NameValue>}
     */
    requestHeaders: function()
    {
        return this._requestHeaders || [];
    },

    /**
     * @param {!Array.<!WebInspector.NetworkRequest.NameValue>} headers
     */
    setRequestHeaders: function(headers)
    {
        this._requestHeaders = headers;
        delete this._requestCookies;

        this.dispatchEventToListeners(WebInspector.NetworkRequest.Events.RequestHeadersChanged);
    },

    /**
     * @return {string|undefined}
     */
    requestHeadersText: function()
    {
        return this._requestHeadersText;
    },

    /**
     * @param {string} text
     */
    setRequestHeadersText: function(text)
    {
        this._requestHeadersText = text;

        this.dispatchEventToListeners(WebInspector.NetworkRequest.Events.RequestHeadersChanged);
    },

    /**
     * @param {string} headerName
     * @return {string|undefined}
     */
    requestHeaderValue: function(headerName)
    {
        return this._headerValue(this.requestHeaders(), headerName);
    },

    /**
     * @return {!Array.<!WebInspector.Cookie>}
     */
    get requestCookies()
    {
        if (!this._requestCookies)
            this._requestCookies = WebInspector.CookieParser.parseCookie(this.requestHeaderValue("Cookie"));
        return this._requestCookies;
    },

    /**
     * @return {string|undefined}
     */
    get requestFormData()
    {
        return this._requestFormData;
    },

    set requestFormData(x)
    {
        this._requestFormData = x;
        delete this._parsedFormParameters;
    },

    /**
     * @return {string}
     */
    requestHttpVersion: function()
    {
        var headersText = this.requestHeadersText();
        if (!headersText)
            return this.requestHeaderValue("version") || this.requestHeaderValue(":version") || "unknown";
        var firstLine = headersText.split(/\r\n/)[0];
        var match = firstLine.match(/(HTTP\/\d+\.\d+)$/);
        return match ? match[1] : "HTTP/0.9";
    },

    /**
     * @return {!Array.<!WebInspector.NetworkRequest.NameValue>}
     */
    get responseHeaders()
    {
        return this._responseHeaders || [];
    },

    set responseHeaders(x)
    {
        this._responseHeaders = x;
        delete this._sortedResponseHeaders;
        delete this._responseCookies;
        this._responseHeaderValues = {};

        this.dispatchEventToListeners(WebInspector.NetworkRequest.Events.ResponseHeadersChanged);
    },

    /**
     * @return {string}
     */
    get responseHeadersText()
    {
        return this._responseHeadersText;
    },

    set responseHeadersText(x)
    {
        this._responseHeadersText = x;

        this.dispatchEventToListeners(WebInspector.NetworkRequest.Events.ResponseHeadersChanged);
    },

    /**
     * @return {!Array.<!WebInspector.NetworkRequest.NameValue>}
     */
    get sortedResponseHeaders()
    {
        if (this._sortedResponseHeaders !== undefined)
            return this._sortedResponseHeaders;

        this._sortedResponseHeaders = this.responseHeaders.slice();
        this._sortedResponseHeaders.sort(function(a, b) { return a.name.toLowerCase().compareTo(b.name.toLowerCase()); });
        return this._sortedResponseHeaders;
    },

    /**
     * @param {string} headerName
     * @return {string|undefined}
     */
    responseHeaderValue: function(headerName)
    {
        var value = this._responseHeaderValues[headerName];
        if (value === undefined) {
            value = this._headerValue(this.responseHeaders, headerName);
            this._responseHeaderValues[headerName] = (value !== undefined) ? value : null;
        }
        return (value !== null) ? value : undefined;
    },

    /**
     * @return {!Array.<!WebInspector.Cookie>}
     */
    get responseCookies()
    {
        if (!this._responseCookies)
            this._responseCookies = WebInspector.CookieParser.parseSetCookie(this.responseHeaderValue("Set-Cookie"));
        return this._responseCookies;
    },

    /**
     * @return {?string}
     */
    queryString: function()
    {
        if (this._queryString !== undefined)
            return this._queryString;

        var queryString = null;
        var url = this.url;
        var questionMarkPosition = url.indexOf("?");
        if (questionMarkPosition !== -1) {
            queryString = url.substring(questionMarkPosition + 1);
            var hashSignPosition = queryString.indexOf("#");
            if (hashSignPosition !== -1)
                queryString = queryString.substring(0, hashSignPosition);
        }
        this._queryString = queryString;
        return this._queryString;
    },

    /**
     * @return {?Array.<!WebInspector.NetworkRequest.NameValue>}
     */
    get queryParameters()
    {
        if (this._parsedQueryParameters)
            return this._parsedQueryParameters;
        var queryString = this.queryString();
        if (!queryString)
            return null;
        this._parsedQueryParameters = this._parseParameters(queryString);
        return this._parsedQueryParameters;
    },

    /**
     * @return {?Array.<!WebInspector.NetworkRequest.NameValue>}
     */
    get formParameters()
    {
        if (this._parsedFormParameters)
            return this._parsedFormParameters;
        if (!this.requestFormData)
            return null;
        var requestContentType = this.requestContentType();
        if (!requestContentType || !requestContentType.match(/^application\/x-www-form-urlencoded\s*(;.*)?$/i))
            return null;
        this._parsedFormParameters = this._parseParameters(this.requestFormData);
        return this._parsedFormParameters;
    },

    /**
     * @return {string}
     */
    responseHttpVersion: function()
    {
        var headersText = this._responseHeadersText;
        if (!headersText)
            return this.responseHeaderValue("version") || this.responseHeaderValue(":version") || "unknown";
        var firstLine = headersText.split(/\r\n/)[0];
        var match = firstLine.match(/^(HTTP\/\d+\.\d+)/);
        return match ? match[1] : "HTTP/0.9";
    },

    /**
     * @param {string} queryString
     * @return {!Array.<!WebInspector.NetworkRequest.NameValue>}
     */
    _parseParameters: function(queryString)
    {
        function parseNameValue(pair)
        {
            var position = pair.indexOf("=");
            if (position === -1)
                return {name: pair, value: ""};
            else
                return {name: pair.substring(0, position), value: pair.substring(position + 1)};
        }
        return queryString.split("&").map(parseNameValue);
    },

    /**
     * @param {!Array.<!WebInspector.NetworkRequest.NameValue>} headers
     * @param {string} headerName
     * @return {string|undefined}
     */
    _headerValue: function(headers, headerName)
    {
        headerName = headerName.toLowerCase();

        var values = [];
        for (var i = 0; i < headers.length; ++i) {
            if (headers[i].name.toLowerCase() === headerName)
                values.push(headers[i].value);
        }
        if (!values.length)
            return undefined;
        // Set-Cookie values should be separated by '\n', not comma, otherwise cookies could not be parsed.
        if (headerName === "set-cookie")
            return values.join("\n");
        return values.join(", ");
    },

    /**
     * @return {?string|undefined}
     */
    get content()
    {
        return this._content;
    },

    /**
     * @return {?Protocol.Error|undefined}
     */
    contentError: function()
    {
        return this._contentError;
    },

    /**
     * @return {boolean}
     */
    get contentEncoded()
    {
        return this._contentEncoded;
    },

    /**
     * @return {string}
     */
    contentURL: function()
    {
        return this._url;
    },

    /**
     * @return {!WebInspector.ResourceType}
     */
    contentType: function()
    {
        return this._resourceType;
    },

    /**
     * @param {function(?string)} callback
     */
    requestContent: function(callback)
    {
        // We do not support content retrieval for WebSockets at the moment.
        // Since WebSockets are potentially long-living, fail requests immediately
        // to prevent caller blocking until resource is marked as finished.
        if (this._resourceType === WebInspector.resourceTypes.WebSocket) {
            callback(null);
            return;
        }
        if (typeof this._content !== "undefined") {
            callback(this.content || null);
            return;
        }
        this._pendingContentCallbacks.push(callback);
        if (this.finished)
            this._innerRequestContent();
    },

    /**
     * @param {string} query
     * @param {boolean} caseSensitive
     * @param {boolean} isRegex
     * @param {function(!Array.<!WebInspector.ContentProvider.SearchMatch>)} callback
     */
    searchInContent: function(query, caseSensitive, isRegex, callback)
    {
        callback([]);
    },

    /**
     * @return {boolean}
     */
    isHttpFamily: function()
    {
        return !!this.url.match(/^https?:/i);
    },

    /**
     * @return {string|undefined}
     */
    requestContentType: function()
    {
        return this.requestHeaderValue("Content-Type");
    },

    /**
     * @return {boolean}
     */
    hasErrorStatusCode: function()
    {
        return this.statusCode >= 400;
    },

    /**
     * @param {!Element} image
     */
    populateImageSource: function(image)
    {
        WebInspector.Resource.populateImageSource(this._url, this._mimeType, this, image);
    },

    /**
     * @return {?string}
     */
    asDataURL: function()
    {
        var content = this._content;
        if (!this._contentEncoded)
            content = window.btoa(content);
        return WebInspector.Resource.contentAsDataURL(content, this.mimeType, true);
    },

    _innerRequestContent: function()
    {
        if (this._contentRequested)
            return;
        this._contentRequested = true;

        /**
         * @param {?Protocol.Error} error
         * @param {string} content
         * @param {boolean} contentEncoded
         * @this {WebInspector.NetworkRequest}
         */
        function onResourceContent(error, content, contentEncoded)
        {
            this._content = error ? null : content;
            this._contentError = error;
            this._contentEncoded = contentEncoded;
            var callbacks = this._pendingContentCallbacks.slice();
            for (var i = 0; i < callbacks.length; ++i)
                callbacks[i](this._content);
            this._pendingContentCallbacks.length = 0;
            delete this._contentRequested;
        }
        NetworkAgent.getResponseBody(this._requestId, onResourceContent.bind(this));
    },

    /**
     * @return {?NetworkAgent.Initiator}
     */
    initiator: function()
    {
        return this._initiator;
    },

    /**
     * @return {!{type: !WebInspector.NetworkRequest.InitiatorType, url: string, lineNumber: number, columnNumber: number}}
     */
    initiatorInfo: function()
    {
        if (this._initiatorInfo)
            return this._initiatorInfo;

        var type = WebInspector.NetworkRequest.InitiatorType.Other;
        var url = "";
        var lineNumber = -Infinity;
        var columnNumber = -Infinity;
        var initiator = this._initiator;

        if (this.redirectSource) {
            type = WebInspector.NetworkRequest.InitiatorType.Redirect;
            url = this.redirectSource.url;
        } else if (initiator) {
            if (initiator.type === NetworkAgent.InitiatorType.Parser) {
                type = WebInspector.NetworkRequest.InitiatorType.Parser;
                url = initiator.url ? initiator.url : url;
                lineNumber = initiator.lineNumber ? initiator.lineNumber : lineNumber;
            } else if (initiator.type === NetworkAgent.InitiatorType.Script) {
                var topFrame = initiator.stackTrace[0];
                if (topFrame.url) {
                    type = WebInspector.NetworkRequest.InitiatorType.Script;
                    url = topFrame.url;
                    lineNumber = topFrame.lineNumber;
                    columnNumber = topFrame.columnNumber;
                }
            }
        }

        this._initiatorInfo = {type: type, url: url, lineNumber: lineNumber, columnNumber: columnNumber};
        return this._initiatorInfo;
    },

    /**
     * @return {!Array.<!WebInspector.NetworkRequest.WebSocketFrame>}
     */
    frames: function()
    {
        return this._frames;
    },

    /**
     * @param {string} errorMessage
     * @param {number} time
     */
    addFrameError: function(errorMessage, time)
    {
        this._addFrame({ type: WebInspector.NetworkRequest.WebSocketFrameType.Error, text: errorMessage, time: time, opCode: -1, mask: false });
    },

    /**
     * @param {!NetworkAgent.WebSocketFrame} response
     * @param {number} time
     * @param {boolean} sent
     */
    addFrame: function(response, time, sent)
    {
        var type = sent ? WebInspector.NetworkRequest.WebSocketFrameType.Send : WebInspector.NetworkRequest.WebSocketFrameType.Receive;
        this._addFrame({ type: type, text: response.payloadData, time: time, opCode: response.opcode, mask: response.mask });
    },

    /**
     * @param {!WebInspector.NetworkRequest.WebSocketFrame} frame
     */
    _addFrame: function(frame)
    {
        this._frames.push(frame);
        this.dispatchEventToListeners(WebInspector.NetworkRequest.Events.WebsocketFrameAdded, frame);
    },

    replayXHR: function()
    {
        this.target().networkAgent().replayXHR(this.requestId);
    },

    __proto__: WebInspector.SDKObject.prototype
}
