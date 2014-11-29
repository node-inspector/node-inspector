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
 */
function SourceMapV3()
{
    /** @type {number} */ this.version;
    /** @type {string|undefined} */ this.file;
    /** @type {!Array.<string>} */ this.sources;
    /** @type {!Array.<!SourceMapV3.Section>|undefined} */ this.sections;
    /** @type {string} */ this.mappings;
    /** @type {string|undefined} */ this.sourceRoot;
}

/**
 * @constructor
 */
SourceMapV3.Section = function()
{
    /** @type {!SourceMapV3} */ this.map;
    /** @type {!SourceMapV3.Offset} */ this.offset;
}

/**
 * @constructor
 */
SourceMapV3.Offset = function()
{
    /** @type {number} */ this.line;
    /** @type {number} */ this.column;
}

/**
 * Implements Source Map V3 model. See http://code.google.com/p/closure-compiler/wiki/SourceMaps
 * for format description.
 * @constructor
 * @param {string} sourceMappingURL
 * @param {!SourceMapV3} payload
 */
WebInspector.SourceMap = function(sourceMappingURL, payload)
{
    if (!WebInspector.SourceMap.prototype._base64Map) {
        const base64Digits = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
        WebInspector.SourceMap.prototype._base64Map = {};
        for (var i = 0; i < base64Digits.length; ++i)
            WebInspector.SourceMap.prototype._base64Map[base64Digits.charAt(i)] = i;
    }

    this._sourceMappingURL = sourceMappingURL;
    this._reverseMappingsBySourceURL = {};
    this._mappings = [];
    this._sources = {};
    this._sourceContentByURL = {};
    this._parseMappingPayload(payload);
}

/**
 * @param {string} sourceMapURL
 * @param {string} compiledURL
 * @param {function(?WebInspector.SourceMap)} callback
 * @this {WebInspector.SourceMap}
 */
WebInspector.SourceMap.load = function(sourceMapURL, compiledURL, callback)
{
    var resourceTreeModel = WebInspector.resourceTreeModel;
    if (resourceTreeModel.cachedResourcesLoaded())
        loadResource();
    else
        resourceTreeModel.addEventListener(WebInspector.ResourceTreeModel.EventTypes.CachedResourcesLoaded, cachedResourcesLoaded);

    function cachedResourcesLoaded()
    {
        resourceTreeModel.removeEventListener(WebInspector.ResourceTreeModel.EventTypes.CachedResourcesLoaded, cachedResourcesLoaded);
        loadResource();
    }

    function loadResource()
    {
        var headers = {};
        NetworkAgent.loadResourceForFrontend(resourceTreeModel.mainFrame.id, sourceMapURL, headers, contentLoaded);
    }

    /**
     * @param {?Protocol.Error} error
     * @param {number} statusCode
     * @param {!NetworkAgent.Headers} headers
     * @param {string} content
     */
    function contentLoaded(error, statusCode, headers, content)
    {
        if (error || !content || statusCode >= 400) {
            callback(null);
            return;
        }

        if (content.slice(0, 3) === ")]}")
            content = content.substring(content.indexOf('\n'));
        try {
            var payload = /** @type {!SourceMapV3} */ (JSON.parse(content));
            var baseURL = sourceMapURL.startsWith("data:") ? compiledURL : sourceMapURL;
            callback(new WebInspector.SourceMap(baseURL, payload));
        } catch(e) {
            console.error(e.message);
            callback(null);
        }
    }
}

WebInspector.SourceMap.prototype = {
    /**
     * @return {string}
     */
    url: function()
    {
        return this._sourceMappingURL;
    },

   /**
     * @return {!Array.<string>}
     */
    sources: function()
    {
        return Object.keys(this._sources);
    },

    /**
     * @param {string} sourceURL
     * @return {string|undefined}
     */
    sourceContent: function(sourceURL)
    {
        return this._sourceContentByURL[sourceURL];
    },

    /**
     * @param {string} sourceURL
     * @param {!WebInspector.ResourceType} contentType
     * @return {!WebInspector.ContentProvider}
     */
    sourceContentProvider: function(sourceURL, contentType)
    {
        var sourceContent = this.sourceContent(sourceURL);
        if (sourceContent)
            return new WebInspector.StaticContentProvider(contentType, sourceContent);
        return new WebInspector.CompilerSourceMappingContentProvider(sourceURL, contentType);
    },

    /**
     * @param {!SourceMapV3} mappingPayload
     */
    _parseMappingPayload: function(mappingPayload)
    {
        if (mappingPayload.sections)
            this._parseSections(mappingPayload.sections);
        else
            this._parseMap(mappingPayload, 0, 0);
    },

    /**
     * @param {!Array.<!SourceMapV3.Section>} sections
     */
    _parseSections: function(sections)
    {
        for (var i = 0; i < sections.length; ++i) {
            var section = sections[i];
            this._parseMap(section.map, section.offset.line, section.offset.column);
        }
    },

    /**
     * @param {number} lineNumber in compiled resource
     * @param {number} columnNumber in compiled resource
     * @return {?Array.<number|string>}
     */
    findEntry: function(lineNumber, columnNumber)
    {
        var first = 0;
        var count = this._mappings.length;
        while (count > 1) {
          var step = count >> 1;
          var middle = first + step;
          var mapping = this._mappings[middle];
          if (lineNumber < mapping[0] || (lineNumber === mapping[0] && columnNumber < mapping[1]))
              count = step;
          else {
              first = middle;
              count -= step;
          }
        }
        var entry = this._mappings[first];
        if (!first && entry && (lineNumber < entry[0] || (lineNumber === entry[0] && columnNumber < entry[1])))
            return null;
        return entry;
    },

    /**
     * @param {string} sourceURL of the originating resource
     * @param {number} lineNumber in the originating resource
     * @param {number=} span
     * @return {?Array.<*>}
     */
    findEntryReversed: function(sourceURL, lineNumber, span)
    {
        var mappings = this._reverseMappingsBySourceURL[sourceURL];
        var maxLineNumber = typeof span === "number" ? Math.min(lineNumber + span + 1, mappings.length) : mappings.length;
        for ( ; lineNumber < maxLineNumber; ++lineNumber) {
            var mapping = mappings[lineNumber];
            if (mapping)
                return mapping;
        }
        return null;
    },

    /**
     * @param {!SourceMapV3} map
     * @param {number} lineNumber
     * @param {number} columnNumber
     */
    _parseMap: function(map, lineNumber, columnNumber)
    {
        var sourceIndex = 0;
        var sourceLineNumber = 0;
        var sourceColumnNumber = 0;
        var nameIndex = 0;

        var sources = [];
        var originalToCanonicalURLMap = {};
        for (var i = 0; i < map.sources.length; ++i) {
            var originalSourceURL = map.sources[i];
            var sourceRoot = map.sourceRoot || "";
            if (sourceRoot && !sourceRoot.endsWith("/"))
                sourceRoot += "/";
            var href = sourceRoot + originalSourceURL;
            var url = WebInspector.ParsedURL.completeURL(this._sourceMappingURL, href) || href;
            originalToCanonicalURLMap[originalSourceURL] = url;
            sources.push(url);
            this._sources[url] = true;

            if (map.sourcesContent && map.sourcesContent[i])
                this._sourceContentByURL[url] = map.sourcesContent[i];
        }

        var stringCharIterator = new WebInspector.SourceMap.StringCharIterator(map.mappings);
        var sourceURL = sources[sourceIndex];

        while (true) {
            if (stringCharIterator.peek() === ",")
                stringCharIterator.next();
            else {
                while (stringCharIterator.peek() === ";") {
                    lineNumber += 1;
                    columnNumber = 0;
                    stringCharIterator.next();
                }
                if (!stringCharIterator.hasNext())
                    break;
            }

            columnNumber += this._decodeVLQ(stringCharIterator);
            if (!stringCharIterator.hasNext() || this._isSeparator(stringCharIterator.peek())) {
                this._mappings.push([lineNumber, columnNumber]);
                continue;
            }

            var sourceIndexDelta = this._decodeVLQ(stringCharIterator);
            if (sourceIndexDelta) {
                sourceIndex += sourceIndexDelta;
                sourceURL = sources[sourceIndex];
            }
            sourceLineNumber += this._decodeVLQ(stringCharIterator);
            sourceColumnNumber += this._decodeVLQ(stringCharIterator);
            if (!this._isSeparator(stringCharIterator.peek()))
                nameIndex += this._decodeVLQ(stringCharIterator);

            this._mappings.push([lineNumber, columnNumber, sourceURL, sourceLineNumber, sourceColumnNumber]);
        }

        for (var i = 0; i < this._mappings.length; ++i) {
            var mapping = this._mappings[i];
            var url = mapping[2];
            if (!url)
                continue;
            if (!this._reverseMappingsBySourceURL[url])
                this._reverseMappingsBySourceURL[url] = [];
            var reverseMappings = this._reverseMappingsBySourceURL[url];
            var sourceLine = mapping[3];
            if (!reverseMappings[sourceLine])
                reverseMappings[sourceLine] = [mapping[0], mapping[1]];
        }
    },

    /**
     * @param {string} char
     * @return {boolean}
     */
    _isSeparator: function(char)
    {
        return char === "," || char === ";";
    },

    /**
     * @param {!WebInspector.SourceMap.StringCharIterator} stringCharIterator
     * @return {number}
     */
    _decodeVLQ: function(stringCharIterator)
    {
        // Read unsigned value.
        var result = 0;
        var shift = 0;
        do {
            var digit = this._base64Map[stringCharIterator.next()];
            result += (digit & this._VLQ_BASE_MASK) << shift;
            shift += this._VLQ_BASE_SHIFT;
        } while (digit & this._VLQ_CONTINUATION_MASK);

        // Fix the sign.
        var negative = result & 1;
        result >>= 1;
        return negative ? -result : result;
    },

    _VLQ_BASE_SHIFT: 5,
    _VLQ_BASE_MASK: (1 << 5) - 1,
    _VLQ_CONTINUATION_MASK: 1 << 5
}

/**
 * @constructor
 * @param {string} string
 */
WebInspector.SourceMap.StringCharIterator = function(string)
{
    this._string = string;
    this._position = 0;
}

WebInspector.SourceMap.StringCharIterator.prototype = {
    /**
     * @return {string}
     */
    next: function()
    {
        return this._string.charAt(this._position++);
    },

    /**
     * @return {string}
     */
    peek: function()
    {
        return this._string.charAt(this._position);
    },

    /**
     * @return {boolean}
     */
    hasNext: function()
    {
        return this._position < this._string.length;
    }
}
