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

// See http://www.softwareishard.com/blog/har-12-spec/
// for HAR specification.

// FIXME: Some fields are not yet supported due to back-end limitations.
// See https://bugs.webkit.org/show_bug.cgi?id=58127 for details.

/**
 * @constructor
 * @param {!WebInspector.NetworkRequest} request
 */
WebInspector.HAREntry = function(request)
{
    this._request = request;
}

WebInspector.HAREntry.prototype = {
    /**
     * @return {!Object}
     */
    build: function()
    {
        var entry = {
            startedDateTime: new Date(this._request.startTime * 1000),
            time: this._request.timing ? WebInspector.HAREntry._toMilliseconds(this._request.duration) : 0,
            request: this._buildRequest(),
            response: this._buildResponse(),
            cache: { }, // Not supported yet.
            timings: this._buildTimings()
        };

        if (this._request.connectionId !== "0")
            entry.connection = this._request.connectionId;
        var page = this._request.target().networkLog.pageLoadForRequest(this._request);
        if (page)
            entry.pageref = "page_" + page.id;
        return entry;
    },

    /**
     * @return {!Object}
     */
    _buildRequest: function()
    {
        var headersText = this._request.requestHeadersText();
        var res = {
            method: this._request.requestMethod,
            url: this._buildRequestURL(this._request.url),
            httpVersion: this._request.requestHttpVersion(),
            headers: this._request.requestHeaders(),
            queryString: this._buildParameters(this._request.queryParameters || []),
            cookies: this._buildCookies(this._request.requestCookies || []),
            headersSize: headersText ? headersText.length : -1,
            bodySize: this.requestBodySize
        };
        if (this._request.requestFormData)
            res.postData = this._buildPostData();

        return res;
    },

    /**
     * @return {!Object}
     */
    _buildResponse: function()
    {
        var headersText = this._request.responseHeadersText;
        return {
            status: this._request.statusCode,
            statusText: this._request.statusText,
            httpVersion: this._request.responseHttpVersion(),
            headers: this._request.responseHeaders,
            cookies: this._buildCookies(this._request.responseCookies || []),
            content: this._buildContent(),
            redirectURL: this._request.responseHeaderValue("Location") || "",
            headersSize: headersText ? headersText.length : -1,
            bodySize: this.responseBodySize,
            _error: this._request.localizedFailDescription
        };
    },

    /**
     * @return {!Object}
     */
    _buildContent: function()
    {
        var content = {
            size: this._request.resourceSize,
            mimeType: this._request.mimeType || "x-unknown",
            // text: this._request.content // TODO: pull out into a boolean flag, as content can be huge (and needs to be requested with an async call)
        };
        var compression = this.responseCompression;
        if (typeof compression === "number")
            content.compression = compression;
        return content;
    },

    /**
     * @return {!Object}
     */
    _buildTimings: function()
    {
        // Order of events: request_start = 0, [proxy], [dns], [connect [ssl]], [send], receive_headers_end
        // HAR 'blocked' time is time before first network activity.

        var timing = this._request.timing;
        if (!timing)
            return {blocked: -1, dns: -1, connect: -1, send: 0, wait: 0, receive: 0, ssl: -1};

        function firstNonNegative(values)
        {
            for (var i = 0; i < values.length; ++i) {
                if (values[i] >= 0)
                    return values[i];
            }
            console.assert(false, "Incomplete requet timing information.");
        }

        var blocked = firstNonNegative([timing.dnsStart, timing.connectStart, timing.sendStart]);

        var dns = -1;
        if (timing.dnsStart >= 0)
            dns = firstNonNegative([timing.connectStart, timing.sendStart]) - timing.dnsStart;

        var connect = -1;
        if (timing.connectStart >= 0)
            connect = timing.sendStart - timing.connectStart;

        var send = timing.sendEnd - timing.sendStart;
        var wait = timing.receiveHeadersEnd - timing.sendEnd;
        var receive = WebInspector.HAREntry._toMilliseconds(this._request.duration) - timing.receiveHeadersEnd;

        var ssl = -1;
        if (timing.sslStart >= 0 && timing.sslEnd >= 0)
            ssl = timing.sslEnd - timing.sslStart;

        return {blocked: blocked, dns: dns, connect: connect, send: send, wait: wait, receive: receive, ssl: ssl};
    },

    /**
     * @return {!Object}
     */
    _buildPostData: function()
    {
        var res = {
            mimeType: this._request.requestContentType(),
            text: this._request.requestFormData
        };
        if (this._request.formParameters)
            res.params = this._buildParameters(this._request.formParameters);
        return res;
    },

    /**
     * @param {!Array.<!Object>} parameters
     * @return {!Array.<!Object>}
     */
    _buildParameters: function(parameters)
    {
        return parameters.slice();
    },

    /**
     * @param {string} url
     * @return {string}
     */
    _buildRequestURL: function(url)
    {
        return url.split("#", 2)[0];
    },

    /**
     * @param {!Array.<!WebInspector.Cookie>} cookies
     * @return {!Array.<!Object>}
     */
    _buildCookies: function(cookies)
    {
        return cookies.map(this._buildCookie.bind(this));
    },

    /**
     * @param {!WebInspector.Cookie} cookie
     * @return {!Object}
     */
    _buildCookie: function(cookie)
    {
        return {
            name: cookie.name(),
            value: cookie.value(),
            path: cookie.path(),
            domain: cookie.domain(),
            expires: cookie.expiresDate(new Date(this._request.startTime * 1000)),
            httpOnly: cookie.httpOnly(),
            secure: cookie.secure()
        };
    },

    /**
     * @return {number}
     */
    get requestBodySize()
    {
        return !this._request.requestFormData ? 0 : this._request.requestFormData.length;
    },

    /**
     * @return {number}
     */
    get responseBodySize()
    {
        if (this._request.cached() || this._request.statusCode === 304)
            return 0;
        if (!this._request.responseHeadersText)
            return -1;
        return this._request.transferSize - this._request.responseHeadersText.length;
    },

    /**
     * @return {number|undefined}
     */
    get responseCompression()
    {
        if (this._request.cached() || this._request.statusCode === 304 || this._request.statusCode === 206)
            return;
        if (!this._request.responseHeadersText)
            return;
        return this._request.resourceSize - this.responseBodySize;
    }
}

/**
 * @param {number} time
 * @return {number}
 */
WebInspector.HAREntry._toMilliseconds = function(time)
{
    return time === -1 ? -1 : time * 1000;
}

/**
 * @constructor
 * @param {!Array.<!WebInspector.NetworkRequest>} requests
 */
WebInspector.HARLog = function(requests)
{
    this._requests = requests;
}

WebInspector.HARLog.prototype = {
    /**
     * @return {!Object}
     */
    build: function()
    {
        return {
            version: "1.2",
            creator: this._creator(),
            pages: this._buildPages(),
            entries: this._requests.map(this._convertResource.bind(this))
        }
    },

    _creator: function()
    {
        var webKitVersion = /AppleWebKit\/([^ ]+)/.exec(window.navigator.userAgent);

        return {
            name: "WebInspector",
            version: webKitVersion ? webKitVersion[1] : "n/a"
        };
    },

    /**
     * @return {!Array.<!Object>}
     */
    _buildPages: function()
    {
        var seenIdentifiers = {};
        var pages = [];
        for (var i = 0; i < this._requests.length; ++i) {
            var page = this._requests[i].target().networkLog.pageLoadForRequest(this._requests[i]);
            if (!page || seenIdentifiers[page.id])
                continue;
            seenIdentifiers[page.id] = true;
            pages.push(this._convertPage(page));
        }
        return pages;
    },

    /**
     * @param {!WebInspector.PageLoad} page
     * @return {!Object}
     */
    _convertPage: function(page)
    {
        return {
            startedDateTime: new Date(page.startTime * 1000),
            id: "page_" + page.id,
            title: page.url, // We don't have actual page title here. URL is probably better than nothing.
            pageTimings: {
                onContentLoad: this._pageEventTime(page, page.contentLoadTime),
                onLoad: this._pageEventTime(page, page.loadTime)
            }
        }
    },

    /**
     * @param {!WebInspector.NetworkRequest} request
     * @return {!Object}
     */
    _convertResource: function(request)
    {
        return (new WebInspector.HAREntry(request)).build();
    },

    /**
     * @param {!WebInspector.PageLoad} page
     * @param {number} time
     * @return {number}
     */
    _pageEventTime: function(page, time)
    {
        var startTime = page.startTime;
        if (time === -1 || startTime === -1)
            return -1;
        return WebInspector.HAREntry._toMilliseconds(time - startTime);
    }
}
