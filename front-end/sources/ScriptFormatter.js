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

/**
 * @interface
 */
WebInspector.Formatter = function()
{
}

/**
 * @param {!WebInspector.ResourceType} contentType
 * @param {string} mimeType
 * @param {string} content
 * @param {function(string, !WebInspector.FormatterSourceMapping)} callback
 */
WebInspector.Formatter.format = function(contentType, mimeType, content, callback)
{
    if (contentType === WebInspector.resourceTypes.Script || contentType === WebInspector.resourceTypes.Document || contentType === WebInspector.resourceTypes.Stylesheet)
        new WebInspector.ScriptFormatter(mimeType, content, callback);
    else
        new WebInspector.IdentityFormatter(mimeType, content, callback);
}

/**
 * @param {!Array.<number>} lineEndings
 * @param {number} lineNumber
 * @param {number} columnNumber
 * @return {number}
 */
WebInspector.Formatter.locationToPosition = function(lineEndings, lineNumber, columnNumber)
{
    var position = lineNumber ? lineEndings[lineNumber - 1] + 1 : 0;
    return position + columnNumber;
}

/**
 * @param {!Array.<number>} lineEndings
 * @param {number} position
 * @return {!Array.<number>}
 */
WebInspector.Formatter.positionToLocation = function(lineEndings, position)
{
    var lineNumber = lineEndings.upperBound(position - 1);
    if (!lineNumber)
        var columnNumber = position;
    else
        var columnNumber = position - lineEndings[lineNumber - 1] - 1;
    return [lineNumber, columnNumber];
}

/**
 * @constructor
 * @implements {WebInspector.Formatter}
 * @param {string} mimeType
 * @param {string} content
 * @param {function(string, !WebInspector.FormatterSourceMapping)} callback
 */
WebInspector.ScriptFormatter = function(mimeType, content, callback)
{
    content = content.replace(/\r\n?|[\n\u2028\u2029]/g, "\n").replace(/^\uFEFF/, '');
    this._callback = callback;
    this._originalContent = content;

    this._worker = new WorkerRuntime.Worker("script_formatter_worker");
    this._worker.onmessage = this._didFormatContent.bind(this);

    var parameters = {
        mimeType: mimeType,
        content: content,
        indentString: WebInspector.moduleSetting("textEditorIndent").get()
    };
    this._worker.postMessage({ method: "format", params: parameters });
}

WebInspector.ScriptFormatter.prototype = {
    /**
     * @param {!MessageEvent} event
     */
    _didFormatContent: function(event)
    {
        this._worker.terminate();
        var originalContent = this._originalContent;
        var formattedContent = event.data.content;
        var mapping = event.data["mapping"];
        var sourceMapping = new WebInspector.FormatterSourceMappingImpl(originalContent.lineEndings(), formattedContent.lineEndings(), mapping);
        this._callback(formattedContent, sourceMapping);
    }
}

/**
 * @constructor
 * @implements {WebInspector.Formatter}
 * @param {string} mimeType
 * @param {string} content
 * @param {function(string, !WebInspector.FormatterSourceMapping)} callback
 */
WebInspector.IdentityFormatter = function(mimeType, content, callback)
{
    callback(content, new WebInspector.IdentityFormatterSourceMapping());
}

/**
 * @typedef {{original: !Array.<number>, formatted: !Array.<number>}}
 */
WebInspector.FormatterMappingPayload;

/**
 * @interface
 */
WebInspector.FormatterSourceMapping = function()
{
}

WebInspector.FormatterSourceMapping.prototype = {
    /**
     * @param {number} lineNumber
     * @param {number=} columnNumber
     * @return {!Array.<number>}
     */
    originalToFormatted: function(lineNumber, columnNumber) { },

    /**
     * @param {number} lineNumber
     * @param {number=} columnNumber
     * @return {!Array.<number>}
     */
    formattedToOriginal: function(lineNumber, columnNumber) { }
}

/**
 * @constructor
 * @implements {WebInspector.FormatterSourceMapping}
 */
WebInspector.IdentityFormatterSourceMapping = function()
{
}

WebInspector.IdentityFormatterSourceMapping.prototype = {
    /**
     * @override
     * @param {number} lineNumber
     * @param {number=} columnNumber
     * @return {!Array.<number>}
     */
    originalToFormatted: function(lineNumber, columnNumber)
    {
        return [lineNumber, columnNumber || 0];
    },

    /**
     * @override
     * @param {number} lineNumber
     * @param {number=} columnNumber
     * @return {!Array.<number>}
     */
    formattedToOriginal: function(lineNumber, columnNumber)
    {
        return [lineNumber, columnNumber || 0];
    }
}

/**
 * @constructor
 * @implements {WebInspector.FormatterSourceMapping}
 * @param {!Array.<number>} originalLineEndings
 * @param {!Array.<number>} formattedLineEndings
 * @param {!WebInspector.FormatterMappingPayload} mapping
 */
WebInspector.FormatterSourceMappingImpl = function(originalLineEndings, formattedLineEndings, mapping)
{
    this._originalLineEndings = originalLineEndings;
    this._formattedLineEndings = formattedLineEndings;
    this._mapping = mapping;
}

WebInspector.FormatterSourceMappingImpl.prototype = {
    /**
     * @override
     * @param {number} lineNumber
     * @param {number=} columnNumber
     * @return {!Array.<number>}
     */
    originalToFormatted: function(lineNumber, columnNumber)
    {
        var originalPosition = WebInspector.Formatter.locationToPosition(this._originalLineEndings, lineNumber, columnNumber || 0);
        var formattedPosition = this._convertPosition(this._mapping.original, this._mapping.formatted, originalPosition || 0);
        return WebInspector.Formatter.positionToLocation(this._formattedLineEndings, formattedPosition);
    },

    /**
     * @override
     * @param {number} lineNumber
     * @param {number=} columnNumber
     * @return {!Array.<number>}
     */
    formattedToOriginal: function(lineNumber, columnNumber)
    {
        var formattedPosition = WebInspector.Formatter.locationToPosition(this._formattedLineEndings, lineNumber, columnNumber || 0);
        var originalPosition = this._convertPosition(this._mapping.formatted, this._mapping.original, formattedPosition);
        return WebInspector.Formatter.positionToLocation(this._originalLineEndings, originalPosition || 0);
    },

    /**
     * @param {!Array.<number>} positions1
     * @param {!Array.<number>} positions2
     * @param {number} position
     * @return {number}
     */
    _convertPosition: function(positions1, positions2, position)
    {
        var index = positions1.upperBound(position) - 1;
        var convertedPosition = positions2[index] + position - positions1[index];
        if (index < positions2.length - 1 && convertedPosition > positions2[index + 1])
            convertedPosition = positions2[index + 1];
        return convertedPosition;
    }
}
