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

// RawSourceCode represents JavaScript resource or HTML resource with inlined scripts
// as it came from network.

/**
 * @constructor
 * @extends {WebInspector.Object}
 */
WebInspector.RawSourceCode = function(id, script, resource, formatter, formatted)
{
    this.id = id;
    this.url = script.sourceURL;
    this.isContentScript = script.isContentScript;
    this._scripts = [script];
    this._formatter = formatter;
    this._formatted = formatted;
    this._resource = resource;
    this.messages = [];

    this._useTemporaryContent = this._resource && !this._resource.finished;
    this._hasNewScripts = true;
    if (!this._useTemporaryContent)
        this._updateSourceMapping();
    else if (this._resource)
        this._resource.addEventListener("finished", this._resourceFinished.bind(this));
}

WebInspector.RawSourceCode.Events = {
    SourceMappingUpdated: "source-mapping-updated"
}

WebInspector.RawSourceCode.prototype = {
    addScript: function(script)
    {
        this._scripts.push(script);
        this._hasNewScripts = true;
    },

    get uiSourceCode()
    {
        return this._uiSourceCode;
    },

    setFormatted: function(formatted)
    {
        if (this._formatted === formatted)
            return;
        this._formatted = formatted;
        this._updateSourceMapping();
    },

    contentEdited: function()
    {
        this._updateSourceMapping();
    },

    _resourceFinished: function()
    {
        this._useTemporaryContent = false;
        this._updateSourceMapping();
    },

    rawLocationToUILocation: function(rawLocation)
    {
        var location = this._mapping ? this._mapping.originalToFormatted(rawLocation) : rawLocation;
        return new WebInspector.UILocation(this.uiSourceCode, location.lineNumber, location.columnNumber);
    },

    uiLocationToRawLocation: function(lineNumber, columnNumber)
    {
        var rawLocation = { lineNumber: lineNumber, columnNumber: columnNumber };
        if (this._mapping)
            rawLocation = this._mapping.formattedToOriginal(rawLocation);
        rawLocation.scriptId = this._scriptForRawLocation(rawLocation.lineNumber, rawLocation.columnNumber).scriptId;
        return rawLocation;
    },

    _scriptForRawLocation: function(lineNumber, columnNumber)
    {
        var closestScript = this._scripts[0];
        for (var i = 1; i < this._scripts.length; ++i) {
            var script = this._scripts[i];
            if (script.lineOffset > lineNumber || (script.lineOffset === lineNumber && script.columnOffset > columnNumber))
                continue;
            if (script.lineOffset > closestScript.lineOffset ||
                (script.lineOffset === closestScript.lineOffset && script.columnOffset > closestScript.columnOffset))
                closestScript = script;
        }
        return closestScript;
    },

    forceUpdateSourceMapping: function(script)
    {
        if (!this._useTemporaryContent || !this._hasNewScripts)
            return;
        this._hasNewScripts = false;
        this._updateSourceMapping();
    },

    _updateSourceMapping: function()
    {
        if (this._updatingSourceMapping) {
            this._updateNeeded = true;
            return;
        }
        this._updatingSourceMapping = true;
        this._updateNeeded = false;

        var originalContentProvider = this._createContentProvider();
        this._createSourceMapping(originalContentProvider, didCreateSourceMapping.bind(this));

        function didCreateSourceMapping(contentProvider, mapping)
        {
            this._updatingSourceMapping = false;
            if (!this._updateNeeded)
                this._saveSourceMapping(contentProvider, mapping);
            else
                this._updateSourceMapping();
        }
    },

    _createContentProvider: function()
    {
        if (this._resource && this._resource.finished)
            return new WebInspector.ResourceContentProvider(this._resource);
        if (this._scripts.length === 1 && !this._scripts[0].lineOffset && !this._scripts[0].columnOffset)
            return new WebInspector.ScriptContentProvider(this._scripts[0]);
        return new WebInspector.ConcatenatedScriptsContentProvider(this._scripts);
    },

    _createSourceMapping: function(originalContentProvider, callback)
    {
        if (!this._formatted) {
            callback(originalContentProvider, null);
            return;
        }

        function didRequestContent(mimeType, content)
        {
            function didFormatContent(formattedContent, mapping)
            {
                var contentProvider = new WebInspector.StaticContentProvider(mimeType, formattedContent)
                callback(contentProvider, mapping);
            }
            this._formatter.formatContent(mimeType, content, didFormatContent.bind(this));
        }
        originalContentProvider.requestContent(didRequestContent.bind(this));
    },

    _saveSourceMapping: function(contentProvider, mapping)
    {
        var oldUISourceCode = this._uiSourceCode;
        var uiSourceCodeId = (this._formatted ? "deobfuscated:" : "") + (this._scripts[0].sourceURL || this._scripts[0].scriptId);
        this._uiSourceCode = new WebInspector.UISourceCode(uiSourceCodeId, this.url, this.isContentScript, this, contentProvider);
        this._mapping = mapping;
        this.dispatchEventToListeners(WebInspector.RawSourceCode.Events.SourceMappingUpdated, { oldUISourceCode: oldUISourceCode });
    }
}

WebInspector.RawSourceCode.prototype.__proto__ = WebInspector.Object.prototype;


/**
 * @constructor
 */
WebInspector.UILocation = function(uiSourceCode, lineNumber, columnNumber)
{
    this.uiSourceCode = uiSourceCode;
    this.lineNumber = lineNumber;
    this.columnNumber = columnNumber;
}


/**
 * @constructor
 * @implements {WebInspector.ContentProvider}
 */
WebInspector.ScriptContentProvider = function(script)
{
    this._mimeType = "text/javascript";
    this._script = script;
};

WebInspector.ScriptContentProvider.prototype = {
    requestContent: function(callback)
    {
        function didRequestSource(source)
        {
            callback(this._mimeType, source);
        }
        this._script.requestSource(didRequestSource.bind(this));
    }
}

WebInspector.ScriptContentProvider.prototype.__proto__ = WebInspector.ContentProvider.prototype;

/**
 * @constructor
 * @implements {WebInspector.ContentProvider}
 */
WebInspector.ConcatenatedScriptsContentProvider = function(scripts)
{
    this._mimeType = "text/html";
    this._scripts = scripts;
};

WebInspector.ConcatenatedScriptsContentProvider.prototype = {
   requestContent: function(callback)
   {
       var scripts = this._scripts.slice();
       scripts.sort(function(x, y) { return x.lineOffset - y.lineOffset || x.columnOffset - y.columnOffset; });
       var sources = [];
       function didRequestSource(source)
       {
           sources.push(source);
           if (sources.length == scripts.length)
               callback(this._mimeType, this._concatenateScriptsContent(scripts, sources));
       }
       for (var i = 0; i < scripts.length; ++i)
           scripts[i].requestSource(didRequestSource.bind(this));
   },

   _concatenateScriptsContent: function(scripts, sources)
   {
       var content = "";
       var lineNumber = 0;
       var columnNumber = 0;

       function appendChunk(chunk)
       {
           var start = { lineNumber: lineNumber, columnNumber: columnNumber };
           content += chunk;
           var lineEndings = chunk.lineEndings();
           var lineCount = lineEndings.length;
           if (lineCount === 1)
               columnNumber += chunk.length;
           else {
               lineNumber += lineCount - 1;
               columnNumber = lineEndings[lineCount - 1] - lineEndings[lineCount - 2] - 1;
           }
           var end = { lineNumber: lineNumber, columnNumber: columnNumber };
       }

       var scriptOpenTag = "<script>";
       var scriptCloseTag = "</script>";
       for (var i = 0; i < scripts.length; ++i) {
           // Fill the gap with whitespace characters.
           while (lineNumber < scripts[i].lineOffset)
               appendChunk("\n");
           while (columnNumber < scripts[i].columnOffset - scriptOpenTag.length)
               appendChunk(" ");

           // Add script tag.
           appendChunk(scriptOpenTag);
           appendChunk(sources[i]);
           appendChunk(scriptCloseTag);
       }

       return content;
   }
}

WebInspector.ConcatenatedScriptsContentProvider.prototype.__proto__ = WebInspector.ContentProvider.prototype;

/**
 * @constructor
 * @implements {WebInspector.ContentProvider}
 */
WebInspector.ResourceContentProvider = function(resource)
{
    this._mimeType = resource.type === WebInspector.Resource.Type.Script ? "text/javascript" : "text/html";
    this._resource = resource;
};

WebInspector.ResourceContentProvider.prototype = {
    requestContent: function(callback)
    {
        function didRequestContent(content)
        {
            callback(this._mimeType, content);
        }
        this._resource.requestContent(didRequestContent.bind(this));
    }
}

WebInspector.ResourceContentProvider.prototype.__proto__ = WebInspector.ContentProvider.prototype;


WebInspector.StaticContentProvider = function(mimeType, content)
{
    this._mimeType = mimeType;
    this._content = content;
};

WebInspector.StaticContentProvider.prototype = {
    requestContent: function(callback)
    {
        callback(this._mimeType, this._content);
    }
}

WebInspector.StaticContentProvider.prototype.__proto__ = WebInspector.ContentProvider.prototype;
