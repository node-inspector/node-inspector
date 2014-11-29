/*
 * Copyright (C) 2006, 2007, 2008 Apple Inc.  All rights reserved.
 * Copyright (C) 2007 Matt Lilek (pewtermoose@gmail.com).
 * Copyright (C) 2009 Joseph Pecoraro
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
 * @param {string} url
 * @return {?WebInspector.Resource}
 */
WebInspector.resourceForURL = function(url)
{
    var targets = WebInspector.targetManager.targets();
    for (var i = 0; i < targets.length; ++i) {
        var resource = targets[i].resourceTreeModel.resourceForURL(url);
        if (resource)
            return resource;
    }
    return null;
}

/**
 * @param {function(!WebInspector.Resource)} callback
 */
WebInspector.forAllResources = function(callback)
{
    var targets = WebInspector.targetManager.targets();
    for (var i = 0; i < targets.length; ++i)
        targets[i].resourceTreeModel.forAllResources(callback);
}

/**
 * @param {string} url
 * @return {string}
 */
WebInspector.displayNameForURL = function(url)
{
    if (!url)
        return "";

    var resource = WebInspector.resourceForURL(url);
    if (resource)
        return resource.displayName;

    var uiSourceCode = WebInspector.workspace.uiSourceCodeForURL(url);
    if (uiSourceCode)
        return uiSourceCode.displayName();

    if (!WebInspector.targetManager.inspectedPageURL())
        return url.trimURL("");

    var parsedURL = WebInspector.targetManager.inspectedPageURL().asParsedURL();
    var lastPathComponent = parsedURL ? parsedURL.lastPathComponent : parsedURL;
    var index = WebInspector.targetManager.inspectedPageURL().indexOf(lastPathComponent);
    if (index !== -1 && index + lastPathComponent.length === WebInspector.targetManager.inspectedPageURL().length) {
        var baseURL = WebInspector.targetManager.inspectedPageURL().substring(0, index);
        if (url.startsWith(baseURL))
            return url.substring(index);
    }

    if (!parsedURL)
        return url;

    var displayName = url.trimURL(parsedURL.host);
    return displayName === "/" ? parsedURL.host + "/" : displayName;
}

/**
 * @param {string} string
 * @param {function(string,string,number=,number=):!Node} linkifier
 * @return {!DocumentFragment}
 */
WebInspector.linkifyStringAsFragmentWithCustomLinkifier = function(string, linkifier)
{
    var container = createDocumentFragment();
    var linkStringRegEx = /(?:[a-zA-Z][a-zA-Z0-9+.-]{2,}:\/\/|data:|www\.)[\w$\-_+*'=\|\/\\(){}[\]^%@&#~,:;.!?]{2,}[\w$\-_+*=\|\/\\({^%@&#~]/;

    while (string) {
        var linkString = linkStringRegEx.exec(string);
        if (!linkString)
            break;

        linkString = linkString[0];
        var linkIndex = string.indexOf(linkString);
        var nonLink = string.substring(0, linkIndex);
        container.appendChild(createTextNode(nonLink));

        var title = linkString;
        var realURL = (linkString.startsWith("www.") ? "http://" + linkString : linkString);
        var parsedURL = new WebInspector.ParsedURL(realURL);
        var splitResult = WebInspector.ParsedURL.splitLineAndColumn(parsedURL.lastPathComponent);
        var linkNode;
        if (splitResult) {
            var link = realURL.substring(0, realURL.length - parsedURL.lastPathComponent.length + splitResult.url.length);
            linkNode = linkifier(title, link, splitResult.lineNumber, splitResult.columnNumber);
        } else
            linkNode = linkifier(title, realURL);

        container.appendChild(linkNode);
        string = string.substring(linkIndex + linkString.length, string.length);
    }

    if (string)
        container.appendChild(createTextNode(string));

    return container;
}

/**
 * @param {string} string
 * @return {!DocumentFragment}
 */
WebInspector.linkifyStringAsFragment = function(string)
{
    /**
     * @param {string} title
     * @param {string} url
     * @param {number=} lineNumber
     * @param {number=} columnNumber
     * @return {!Node}
     */
    function linkifier(title, url, lineNumber, columnNumber)
    {
        var isExternal = !WebInspector.resourceForURL(url) && !WebInspector.workspace.uiSourceCodeForURL(url);
        var urlNode = WebInspector.linkifyURLAsNode(url, title, undefined, isExternal);
        if (typeof lineNumber !== "undefined") {
            urlNode.lineNumber = lineNumber;
            if (typeof columnNumber !== "undefined")
                urlNode.columnNumber = columnNumber;
        }

        return urlNode;
    }

    return WebInspector.linkifyStringAsFragmentWithCustomLinkifier(string, linkifier);
}

/**
 * @param {string} url
 * @param {string=} linkText
 * @param {string=} classes
 * @param {boolean=} isExternal
 * @param {string=} tooltipText
 * @return {!Element}
 */
WebInspector.linkifyURLAsNode = function(url, linkText, classes, isExternal, tooltipText)
{
    if (!linkText)
        linkText = url;
    classes = (classes ? classes + " " : "");
    classes += isExternal ? "webkit-html-external-link" : "webkit-html-resource-link";

    var a = createElement("a");
    var href = sanitizeHref(url);
    if (href !== null)
        a.href = href;
    a.className = classes;
    if (typeof tooltipText === "undefined")
        a.title = url;
    else if (typeof tooltipText !== "string" || tooltipText.length)
        a.title = tooltipText;
    a.textContent = linkText.trimMiddle(WebInspector.Linkifier.MaxLengthForDisplayedURLs);
    if (isExternal)
        a.setAttribute("target", "_blank");

    return a;
}

/**
 * @param {string} url
 * @param {number=} lineNumber
 * @return {string}
 */
WebInspector.formatLinkText = function(url, lineNumber)
{
    var text = url ? WebInspector.displayNameForURL(url) : WebInspector.UIString("(program)");
    if (typeof lineNumber === "number")
        text += ":" + (lineNumber + 1);
    return text;
}

/**
 * @param {string} url
 * @param {number=} lineNumber
 * @param {string=} classes
 * @param {string=} tooltipText
 * @return {!Element}
 */
WebInspector.linkifyResourceAsNode = function(url, lineNumber, classes, tooltipText)
{
    var linkText = WebInspector.formatLinkText(url, lineNumber);
    var anchor = WebInspector.linkifyURLAsNode(url, linkText, classes, false, tooltipText);
    anchor.lineNumber = lineNumber;
    return anchor;
}

/**
 * @param {!WebInspector.NetworkRequest} request
 * @return {!Element}
 */
WebInspector.linkifyRequestAsNode = function(request)
{
    var anchor = WebInspector.linkifyURLAsNode(request.url);
    anchor.requestId = request.requestId;
    return anchor;
}
