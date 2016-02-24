// Copyright (c) 2015 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

WebInspector.ResourceLoader = {}

WebInspector.ResourceLoader._lastStreamId = 0;
/** @type {!Object.<number, !WebInspector.OutputStream>} */
WebInspector.ResourceLoader._boundStreams = {};

/**
 * @param {!WebInspector.OutputStream} stream
 * @return {number}
 */
WebInspector.ResourceLoader._bindOutputStream = function(stream)
{
    WebInspector.ResourceLoader._boundStreams[++WebInspector.ResourceLoader._lastStreamId] = stream;
    return WebInspector.ResourceLoader._lastStreamId;
}

/**
 * @param {number} id
 */
WebInspector.ResourceLoader._discardOutputStream = function(id)
{
    WebInspector.ResourceLoader._boundStreams[id].close();
    delete WebInspector.ResourceLoader._boundStreams[id];
}

/**
 * @param {number} id
 * @param {string} chunk
 */
WebInspector.ResourceLoader.streamWrite = function(id, chunk)
{
    WebInspector.ResourceLoader._boundStreams[id].write(chunk);
}

/**
 * @param {string} url
 * @param {?Object.<string, string>} headers
 * @param {function(number, !Object.<string, string>, string)} callback
 */
WebInspector.ResourceLoader.load = function(url, headers, callback)
{
    var stream = new WebInspector.StringOutputStream();
    WebInspector.ResourceLoader.loadAsStream(url, headers, stream, mycallback);

    /**
     * @param {number} statusCode
     * @param {!Object.<string, string>} headers
     */
    function mycallback(statusCode, headers)
    {
        callback(statusCode, headers, stream.data());
    }
}

/**
 * @type {string}
 */
WebInspector.ResourceLoader.targetUserAgent = "";

/**
 * @param {string} url
 * @param {?Object.<string, string>} headers
 * @param {function(number, !Object.<string, string>, string)} callback
 */
WebInspector.ResourceLoader.loadUsingTargetUA = function(url, headers, callback)
{
    if (!WebInspector.ResourceLoader.targetUserAgent) {
        WebInspector.ResourceLoader.load(url, headers, callback);
        return;
    }

    var headersWithUA = {};
    if (headers) {
        for (var header in headers)
            headersWithUA[header] = headers[header];
    }
    headersWithUA["User-Agent"] = WebInspector.ResourceLoader.targetUserAgent;
    WebInspector.ResourceLoader.load(url, headersWithUA, callback);
}

/**
 * @param {string} url
 * @param {?Object.<string, string>} headers
 * @param {!WebInspector.OutputStream} stream
 * @param {function(number, !Object.<string, string>)=} callback
 */
WebInspector.ResourceLoader.loadAsStream = function(url, headers, stream, callback)
{
    var streamId = WebInspector.ResourceLoader._bindOutputStream(stream);
    var parsedURL = new WebInspector.ParsedURL(url);
    if (parsedURL.isDataURL()) {
        loadXHR(url)
            .then(dataURLDecodeSuccessful)
            .catch(dataURLDecodeFailed);
        return;
    }

    var rawHeaders = [];
    if (headers) {
        for (var key in headers)
            rawHeaders.push(key + ": " + headers[key]);
    }
    InspectorFrontendHost.loadNetworkResource(url, rawHeaders.join("\r\n"), streamId, finishedCallback);

    /**
     * @param {!InspectorFrontendHostAPI.LoadNetworkResourceResult} response
     */
    function finishedCallback(response)
    {
        if (callback)
            callback(response.statusCode, response.headers || {});
        WebInspector.ResourceLoader._discardOutputStream(streamId);
    }

    /**
     * @param {string} text
     */
    function dataURLDecodeSuccessful(text)
    {
        WebInspector.ResourceLoader.streamWrite(streamId, text);
        finishedCallback(/** @type {!InspectorFrontendHostAPI.LoadNetworkResourceResult} */ ({statusCode : 200}));
    }

    function dataURLDecodeFailed()
    {
        finishedCallback(/** @type {!InspectorFrontendHostAPI.LoadNetworkResourceResult} */ ({statusCode : 404}));
    }
}
