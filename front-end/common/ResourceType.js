/*
 * Copyright (C) 2012 Google Inc.  All rights reserved.
 * Copyright (C) 2007, 2008 Apple Inc.  All rights reserved.
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
 * @param {string} name
 * @param {string} title
 * @param {!WebInspector.ResourceCategory} category
 * @param {boolean} isTextType
 */
WebInspector.ResourceType = function(name, title, category, isTextType)
{
    this._name = name;
    this._title = title;
    this._category = category;
    this._isTextType = isTextType;
}

WebInspector.ResourceType.prototype = {
    /**
     * @return {string}
     */
    name: function()
    {
        return this._name;
    },

    /**
     * @return {string}
     */
    title: function()
    {
        return this._title;
    },

    /**
     * @return {!WebInspector.ResourceCategory}
     */
    category: function()
    {
        return this._category;
    },

    /**
     * @return {boolean}
     */
    isTextType: function()
    {
        return this._isTextType;
    },

    /**
     * @override
     * @return {string}
     */
    toString: function()
    {
        return this._name;
    },

    /**
     * @return {string}
     */
    canonicalMimeType: function()
    {
        if (this === WebInspector.resourceTypes.Document)
            return "text/html";
        if (this === WebInspector.resourceTypes.Script)
            return "text/javascript";
        if (this === WebInspector.resourceTypes.Stylesheet)
            return "text/css";
        return "";
    }
}

/**
 * @constructor
 * @param {string} title
 * @param {string} shortTitle
 */
WebInspector.ResourceCategory = function(title, shortTitle)
{
    this.title = title;
    this.shortTitle = shortTitle;
}

WebInspector.resourceCategories = {
    XHR: new WebInspector.ResourceCategory("XHR and Fetch", "XHR"),
    Script: new WebInspector.ResourceCategory("Scripts", "JS"),
    Stylesheet: new WebInspector.ResourceCategory("Stylesheets", "CSS"),
    Image: new WebInspector.ResourceCategory("Images", "Img"),
    Media: new WebInspector.ResourceCategory("Media", "Media"),
    Font: new WebInspector.ResourceCategory("Fonts", "Font"),
    Document: new WebInspector.ResourceCategory("Documents", "Doc"),
    WebSocket: new WebInspector.ResourceCategory("WebSockets", "WS"),
    Other: new WebInspector.ResourceCategory("Other", "Other")
}

/**
 * Keep these in sync with WebCore::InspectorPageAgent::resourceTypeJson
 * @enum {!WebInspector.ResourceType}
 */
WebInspector.resourceTypes = {
    XHR: new WebInspector.ResourceType("xhr", "XHR", WebInspector.resourceCategories.XHR, true),
    Fetch: new WebInspector.ResourceType("fetch", "Fetch", WebInspector.resourceCategories.XHR, true),
    EventSource: new WebInspector.ResourceType("eventsource", "EventSource", WebInspector.resourceCategories.XHR, true),
    Script: new WebInspector.ResourceType("script", "Script", WebInspector.resourceCategories.Script, true),
    Stylesheet: new WebInspector.ResourceType("stylesheet", "Stylesheet", WebInspector.resourceCategories.Stylesheet, true),
    Image: new WebInspector.ResourceType("image", "Image", WebInspector.resourceCategories.Image, false),
    Media: new WebInspector.ResourceType("media", "Media", WebInspector.resourceCategories.Media, false),
    Font: new WebInspector.ResourceType("font", "Font", WebInspector.resourceCategories.Font, false),
    Document: new WebInspector.ResourceType("document", "Document", WebInspector.resourceCategories.Document, true),
    TextTrack: new WebInspector.ResourceType("texttrack", "TextTrack", WebInspector.resourceCategories.Other, true),
    WebSocket: new WebInspector.ResourceType("websocket", "WebSocket", WebInspector.resourceCategories.WebSocket, false),
    Other: new WebInspector.ResourceType("other", "Other", WebInspector.resourceCategories.Other, false)
}

WebInspector.ResourceType.mimeTypesForExtensions = {
    // Web extensions
    "js": "text/javascript",
    "css": "text/css",
    "html": "text/html",
    "htm": "text/html",
    "xml": "application/xml",
    "xsl": "application/xml",

    // HTML Embedded Scripts: ASP, JSP
    "asp": "application/x-aspx",
    "aspx": "application/x-aspx",
    "jsp": "application/x-jsp",

    // C/C++
    "c": "text/x-c++src",
    "cc": "text/x-c++src",
    "cpp": "text/x-c++src",
    "h": "text/x-c++src",
    "m": "text/x-c++src",
    "mm": "text/x-c++src",

    // CoffeeScript
    "coffee": "text/x-coffeescript",

    // Dart
    "dart": "text/javascript",

    // TypeScript
    "ts": "text/typescript",

    // JSON
    "json": "application/json",
    "gyp": "application/json",
    "gypi": "application/json",

    // C#
    "cs": "text/x-csharp",

    // Java
    "java": "text/x-java",

    // Less
    "less": "text/x-less",

    // PHP
    "php": "text/x-php",
    "phtml": "application/x-httpd-php",

    // Python
    "py": "text/x-python",

    // Shell
    "sh": "text/x-sh",

    // SCSS
    "scss": "text/x-scss",

    // Video Text Tracks.
    "vtt": "text/vtt",

    // LiveScript
    "ls": "text/x-livescript",

    // ClojureScript
    "cljs": "text/x-clojure",
    "cljc": "text/x-clojure",
    "cljx": "text/x-clojure"
}
