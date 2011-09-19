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

WebInspector.ResourceJSONView = function(resource, parsedJSON)
{
    WebInspector.ResourceView.call(this, resource);
    this._parsedJSON = parsedJSON;
    this.element.addStyleClass("json");
}

WebInspector.ResourceJSONView.parseJSON = function(text)
{
    var prefix = "";

    // Trim while(1), for(;;), weird numbers, etc. We need JSON start.
    var start = /[{[]/.exec(text);
    if (start && start.index) {
        prefix = text.substring(0, start.index);
        text = text.substring(start.index);
    }

    try {
        return new WebInspector.ParsedJSON(JSON.parse(text), prefix, "");
    } catch (e) {
        return;
    }
}

WebInspector.ResourceJSONView.parseJSONP = function(text)
{
    // Taking everything between first and last parentheses
    var start = text.indexOf("(");
    var end = text.lastIndexOf(")");
    if (start == -1 || end == -1 || end < start)
        return;

    var prefix = text.substring(0, start + 1);
    var suffix = text.substring(end);
    var text = text.substring(start + 1, end);

    try {
        return new WebInspector.ParsedJSON(JSON.parse(text), prefix, suffix);
    } catch (e) {
        return;
    }
}

WebInspector.ResourceJSONView.prototype = {
    hasContent: function()
    {
        return true;
    },

    show: function(parentElement)
    {
        WebInspector.ResourceView.prototype.show.call(this, parentElement);
        this._initialize();
    },

    _initialize: function()
    {
        if (this._initialized)
            return;
        this._initialized = true;

        var obj = WebInspector.RemoteObject.fromLocalObject(this._parsedJSON.data);
        var title = this._parsedJSON.prefix + obj.description + this._parsedJSON.suffix;
        var section = new WebInspector.ObjectPropertiesSection(obj, title);
        section.expand();
        section.editable = false;
        this.element.appendChild(section.element);
    }
}

WebInspector.ResourceJSONView.prototype.__proto__ = WebInspector.ResourceView.prototype;

WebInspector.ParsedJSON = function(data, prefix, suffix)
{
    this.data = data;
    this.prefix = prefix;
    this.suffix = suffix;
}
