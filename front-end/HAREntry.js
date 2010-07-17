/*
 * Copyright (C) 2010 Google Inc. All rights reserved.
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

// See http://groups.google.com/group/http-archive-specification/web/har-1-2-spec
// for HAR specification.

WebInspector.HAREntry = function(resource)
{
    this._resource = resource;
}

WebInspector.HAREntry.prototype = {
    build: function()
    {
        return {
            pageref: this._resource.documentURL,
            startedDateTime: new Date(this._resource.startTime * 1000),
            time: this._toMilliseconds(this._resource.duration),
            request: this._buildRequest(),
            response: this._buildResponse(),
            // cache: {...}, -- Not supproted yet.
            timings: this._buildTimings()
        };
    },

    _buildRequest: function()
    {
        var res = {
            method: this._resource.requestMethod,
            url: this._resource.url,
            // httpVersion: "HTTP/1.1" -- Not available.
            // cookies: [] -- Not available.
            headers: this._buildHeaders(this._resource.requestHeaders),
            headersSize: -1, // Not available.
            bodySize: -1 // Not available.
        };
        if (this._resource.queryParameters)
            res.queryString = this._buildParameters(this._resource.queryParameters);
        if (this._resource.requestFormData)
            res.postData = this._buildPostData();
        return res;
    },

    _buildResponse: function()
    {
        return {
            status: this._resource.statusCode,
            statusText: this._resource.statusText,
            // "httpVersion": "HTTP/1.1" -- Not available.
            // "cookies": [],  -- Not available.
            headers: this._buildHeaders(this._resource.responseHeaders),
            content: this._buildContent(),
            redirectURL: this._resource.responseHeaderValue("Location") || "",
            headersSize: -1, // Not available.
            bodySize: this._resource.resourceSize
        };
    },

    _buildContent: function()
    {
        return {
            size: this._resource.resourceSize,
            // compression: 0, -- Not available.
            mimeType: this._resource.mimeType,
            // text: -- Not available.
        };
    },

    _buildTimings: function()
    {
        return {
            blocked: -1, // Not available.
            dns: -1, // Not available.
            connect: -1, // Not available.
            send: -1, // Not available.
            wait: this._toMilliseconds(this._resource.latency),
            receive: this._toMilliseconds(this._resource.receiveDuration),
            ssl: -1 // Not available.
        };
    },

    _buildHeaders: function(headers)
    {
        var result = [];
        for (var name in headers)
            result.push({ name: name, value: headers[name] });
        return result;
    },

    _buildPostData: function()
    {
        return {
            mimeType: this._resource.requestHeaderValue("Content-Type"),
            params: this._buildParameters(this._resource.formParameters),
            text: this._resource.requestFormData
        };
    },

    _buildParameters: function(parameters)
    {
        return parameters.slice();
    },

    _toMilliseconds: function(time)
    {
        return time === -1 ? -1 : Math.round(time * 1000);
    }
};
