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
 * @interface
 */
WebInspector.LinkifierFormatter = function()
{
}

WebInspector.LinkifierFormatter.prototype = {
    /**
     * @param {!Element} anchor
     * @param {!WebInspector.UILocation} uiLocation
     */
    formatLiveAnchor: function(anchor, uiLocation) { }
}

/**
 * @constructor
 * @implements {WebInspector.TargetManager.Observer}
 * @param {!WebInspector.LinkifierFormatter=} formatter
 */
WebInspector.Linkifier = function(formatter)
{
    this._formatter = formatter || new WebInspector.Linkifier.DefaultFormatter(WebInspector.Linkifier.MaxLengthForDisplayedURLs);
    /** @type {!Map.<!WebInspector.Target, !Map.<!Element, !WebInspector.LiveLocation>>}*/
    this._liveLocationsByTarget = new Map();
    WebInspector.targetManager.observeTargets(this);
}

/**
 * @param {?WebInspector.Linkifier.LinkHandler} handler
 */
WebInspector.Linkifier.setLinkHandler = function(handler)
{
    WebInspector.Linkifier._linkHandler = handler;
}

/**
 * @param {string} url
 * @param {number=} lineNumber
 * @return {boolean}
 */
WebInspector.Linkifier.handleLink = function(url, lineNumber)
{
    if (!WebInspector.Linkifier._linkHandler)
        return false;
    return WebInspector.Linkifier._linkHandler.handleLink(url, lineNumber);
}

/**
 * @param {!Object} revealable
 * @param {string} text
 * @param {string=} fallbackHref
 * @param {number=} fallbackLineNumber
 * @param {string=} title
 * @param {string=} classes
 * @return {!Element}
 */
WebInspector.Linkifier.linkifyUsingRevealer = function(revealable, text, fallbackHref, fallbackLineNumber, title, classes)
{
    var a = createElement("a");
    a.className = (classes || "") + " webkit-html-resource-link";
    a.textContent = text.trimMiddle(WebInspector.Linkifier.MaxLengthForDisplayedURLs);
    a.title = title || text;
    if (fallbackHref) {
        a.href = fallbackHref;
        a.lineNumber = fallbackLineNumber;
    }
    /**
     * @param {!Event} event
     * @this {Object}
     */
    function clickHandler(event)
    {
        event.stopImmediatePropagation();
        event.preventDefault();
        if (fallbackHref && WebInspector.Linkifier.handleLink(fallbackHref, fallbackLineNumber))
            return;

        WebInspector.Revealer.reveal(this);
    }
    a.addEventListener("click", clickHandler.bind(revealable), false);
    return a;
}

WebInspector.Linkifier._uiLocationSymbol = Symbol("uiLocation");
WebInspector.Linkifier._fallbackAnchorSymbol = Symbol("fallbackAnchor");;

WebInspector.Linkifier.prototype = {
    /**
     * @override
     * @param {!WebInspector.Target} target
     */
    targetAdded: function(target)
    {
        this._liveLocationsByTarget.set(target, new Map());
    },

    /**
     * @override
     * @param {!WebInspector.Target} target
     */
    targetRemoved: function(target)
    {
        var liveLocations = this._liveLocationsByTarget.remove(target);
        var anchors = liveLocations.keysArray();
        for (var i = 0; i < anchors.length; ++i) {
            var anchor = anchors[i];
            var location = liveLocations.get(anchor);
            delete anchor[WebInspector.Linkifier._uiLocationSymbol];
            var fallbackAnchor = anchor[WebInspector.Linkifier._fallbackAnchorSymbol];
            if (fallbackAnchor) {
                anchor.href = fallbackAnchor.href;
                anchor.lineNumber = fallbackAnchor.lineNumber;
                anchor.title = fallbackAnchor.title;
                anchor.className = fallbackAnchor.className;
                anchor.textContent = fallbackAnchor.textContent;
                delete anchor[WebInspector.Linkifier._fallbackAnchorSymbol];
            }
            location.dispose();
        }
    },

    /**
     * @param {?WebInspector.Target} target
     * @param {?string} scriptId
     * @param {string} sourceURL
     * @param {number} lineNumber
     * @param {number=} columnNumber
     * @param {string=} classes
     * @return {!Element}
     */
    linkifyScriptLocation: function(target, scriptId, sourceURL, lineNumber, columnNumber, classes)
    {
        var fallbackAnchor = WebInspector.linkifyResourceAsNode(sourceURL, lineNumber, classes);
        if (!target || target.isDetached())
            return fallbackAnchor;
        var debuggerModel = WebInspector.DebuggerModel.fromTarget(target);
        if (!debuggerModel)
            return fallbackAnchor;

        var rawLocation = scriptId ? debuggerModel.createRawLocationByScriptId(scriptId, lineNumber, columnNumber || 0) :
                                     debuggerModel.createRawLocationByURL(sourceURL, lineNumber, columnNumber || 0);
        if (!rawLocation)
            return fallbackAnchor;

        var anchor = this._createAnchor(classes);
        var liveLocation = WebInspector.debuggerWorkspaceBinding.createLiveLocation(rawLocation, this._updateAnchor.bind(this, anchor));
        this._liveLocationsByTarget.get(rawLocation.target()).set(anchor, liveLocation);
        anchor[WebInspector.Linkifier._fallbackAnchorSymbol] = fallbackAnchor;
        return anchor;
    },

    /**
     * @param {!WebInspector.DebuggerModel.Location} rawLocation
     * @param {string} fallbackUrl
     * @param {string=} classes
     * @return {!Element}
     */
    linkifyRawLocation: function(rawLocation, fallbackUrl, classes)
    {
        return this.linkifyScriptLocation(rawLocation.target(), rawLocation.scriptId, fallbackUrl, rawLocation.lineNumber, rawLocation.columnNumber, classes);
    },

    /**
     * @param {?WebInspector.Target} target
     * @param {!ConsoleAgent.CallFrame} callFrame
     * @param {string=} classes
     * @return {!Element}
     */
    linkifyConsoleCallFrame: function(target, callFrame, classes)
    {
        // FIXME(62725): console stack trace line/column numbers are one-based.
        var lineNumber = callFrame.lineNumber ? callFrame.lineNumber - 1 : 0;
        var columnNumber = callFrame.columnNumber ? callFrame.columnNumber - 1 : 0;
        var anchor = this.linkifyScriptLocation(target, callFrame.scriptId, callFrame.url, lineNumber, columnNumber, classes);
        var debuggerModel = WebInspector.DebuggerModel.fromTarget(target);
        var script = debuggerModel && debuggerModel.scriptForId(callFrame.scriptId);
        var blackboxed = script ?
            WebInspector.BlackboxSupport.isBlackboxed(script.sourceURL, script.isContentScript()) :
            WebInspector.BlackboxSupport.isBlackboxedURL(callFrame.url);
        if (blackboxed)
            anchor.classList.add("webkit-html-blackbox-link");

        return anchor;
    },

    /**
     * @param {!WebInspector.CSSLocation} rawLocation
     * @param {string=} classes
     * @return {!Element}
     */
    linkifyCSSLocation: function(rawLocation, classes)
    {
        var anchor = this._createAnchor(classes);
        var liveLocation = WebInspector.cssWorkspaceBinding.createLiveLocation(rawLocation, this._updateAnchor.bind(this, anchor));
        this._liveLocationsByTarget.get(rawLocation.target()).set(anchor, liveLocation);
        return anchor;
    },

    /**
     * @param {!WebInspector.CSSMedia} media
     * @return {?Element}
     */
    linkifyMedia: function(media)
    {
        var location = media.rawLocation();
        if (location)
            return this.linkifyCSSLocation(location);

        // The "linkedStylesheet" case.
        return WebInspector.linkifyResourceAsNode(media.sourceURL, undefined, "subtitle", media.sourceURL);
    },

    /**
     * @param {!WebInspector.Target} target
     * @param {!Element} anchor
     */
    disposeAnchor: function(target, anchor)
    {
        delete anchor[WebInspector.Linkifier._uiLocationSymbol];
        delete anchor[WebInspector.Linkifier._fallbackAnchorSymbol];
        var liveLocations = this._liveLocationsByTarget.get(target);
        if (!liveLocations)
            return;
        var location = liveLocations.remove(anchor);
        if (location)
            location.dispose();
    },

    /**
     * @param {string=} classes
     * @return {!Element}
     */
    _createAnchor: function(classes)
    {
        var anchor = createElement("a");
        anchor.className = (classes || "") + " webkit-html-resource-link";

        /**
         * @param {!Event} event
         */
        function clickHandler(event)
        {
            var uiLocation = anchor[WebInspector.Linkifier._uiLocationSymbol];
            if (!uiLocation)
                return;

            event.consume(true);
            var networkURL = WebInspector.networkMapping.networkURL(uiLocation.uiSourceCode);
            if (WebInspector.Linkifier.handleLink(networkURL, uiLocation.lineNumber))
                return;
            WebInspector.Revealer.reveal(uiLocation);
        }
        anchor.addEventListener("click", clickHandler, false);
        return anchor;
    },

    reset: function()
    {
        var targets = this._liveLocationsByTarget.keysArray();
        for (var i = 0; i < targets.length; ++i) {
            var target = targets[i];
            this.targetRemoved(target);
            this.targetAdded(target);
        }
    },

    dispose: function()
    {
        this.reset();
        WebInspector.targetManager.unobserveTargets(this);
        this._liveLocationsByTarget.clear();
    },

    /**
     * @param {!Element} anchor
     * @param {!WebInspector.UILocation} uiLocation
     */
    _updateAnchor: function(anchor, uiLocation)
    {
        anchor[WebInspector.Linkifier._uiLocationSymbol] = uiLocation;
        this._formatter.formatLiveAnchor(anchor, uiLocation);
    }
}

/**
 * @param {!Element} anchor
 * @return {?WebInspector.UILocation} uiLocation
 */
WebInspector.Linkifier.uiLocationByAnchor = function(anchor)
{
    return anchor[WebInspector.Linkifier._uiLocationSymbol];
}

/**
 * @constructor
 * @implements {WebInspector.LinkifierFormatter}
 * @param {number=} maxLength
 */
WebInspector.Linkifier.DefaultFormatter = function(maxLength)
{
    this._maxLength = maxLength;
}

WebInspector.Linkifier.DefaultFormatter.prototype = {
    /**
     * @override
     * @param {!Element} anchor
     * @param {!WebInspector.UILocation} uiLocation
     */
    formatLiveAnchor: function(anchor, uiLocation)
    {
        var text = uiLocation.linkText();
        if (this._maxLength)
            text = text.trimMiddle(this._maxLength);
        anchor.textContent = text;

        var titleText = uiLocation.uiSourceCode.originURL();
        if (typeof uiLocation.lineNumber === "number")
            titleText += ":" + (uiLocation.lineNumber + 1);
        anchor.title = titleText;
    }
}

/**
 * @constructor
 * @extends {WebInspector.Linkifier.DefaultFormatter}
 */
WebInspector.Linkifier.DefaultCSSFormatter = function()
{
    WebInspector.Linkifier.DefaultFormatter.call(this, WebInspector.Linkifier.DefaultCSSFormatter.MaxLengthForDisplayedURLs);
}

WebInspector.Linkifier.DefaultCSSFormatter.MaxLengthForDisplayedURLs = 30;

WebInspector.Linkifier.DefaultCSSFormatter.prototype = {
    /**
     * @override
     * @param {!Element} anchor
     * @param {!WebInspector.UILocation} uiLocation
     */
    formatLiveAnchor: function(anchor, uiLocation)
    {
        WebInspector.Linkifier.DefaultFormatter.prototype.formatLiveAnchor.call(this, anchor, uiLocation);
        anchor.classList.add("webkit-html-resource-link");
        anchor.setAttribute("data-uncopyable", anchor.textContent);
        anchor.textContent = "";
    },
    __proto__: WebInspector.Linkifier.DefaultFormatter.prototype
}

/**
 * The maximum number of characters to display in a URL.
 * @const
 * @type {number}
 */
WebInspector.Linkifier.MaxLengthForDisplayedURLs = 150;

/**
 * @interface
 */
WebInspector.Linkifier.LinkHandler = function()
{
}

WebInspector.Linkifier.LinkHandler.prototype = {
    /**
     * @param {string} url
     * @param {number=} lineNumber
     * @return {boolean}
     */
    handleLink: function(url, lineNumber) {}
}

/**
 * @param {!WebInspector.Target} target
 * @param {string} scriptId
 * @param {number} lineNumber
 * @param {number=} columnNumber
 * @return {string}
 */
WebInspector.Linkifier.liveLocationText = function(target, scriptId, lineNumber, columnNumber)
{
    var debuggerModel = WebInspector.DebuggerModel.fromTarget(target);
    if (!debuggerModel)
        return "";
    var script = debuggerModel.scriptForId(scriptId);
    if (!script)
        return "";
    var location = /** @type {!WebInspector.DebuggerModel.Location} */ (debuggerModel.createRawLocation(script, lineNumber, columnNumber || 0));
    var uiLocation = /** @type {!WebInspector.UILocation} */ (WebInspector.debuggerWorkspaceBinding.rawLocationToUILocation(location));
    return uiLocation.linkText();
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
        var splitResult = WebInspector.ParsedURL.splitLineAndColumn(realURL);
        var linkNode;
        if (splitResult)
            linkNode = linkifier(title, splitResult.url, splitResult.lineNumber, splitResult.columnNumber);
        else
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
        var isExternal = !WebInspector.resourceForURL(url) && !WebInspector.networkMapping.uiSourceCodeForURLForAnyTarget(url);
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
    if (!tooltipText && linkText !== url)
        a.title = url;
    else if (tooltipText)
        a.title = tooltipText;
    a.textContent = linkText.trimMiddle(WebInspector.Linkifier.MaxLengthForDisplayedURLs);
    if (isExternal)
        a.setAttribute("target", "_blank");

    return a;
}

/**
 * @param {string} article
 * @param {string} title
 * @return {!Element}
 */
WebInspector.linkifyDocumentationURLAsNode = function(article, title)
{
    return WebInspector.linkifyURLAsNode("https://developers.google.com/web/tools/" + article, title, undefined, true);
}

/**
 * @param {string} url
 * @param {number=} lineNumber
 * @param {string=} classes
 * @param {string=} tooltipText
 * @param {string=} urlDisplayName
 * @return {!Element}
 */
WebInspector.linkifyResourceAsNode = function(url, lineNumber, classes, tooltipText, urlDisplayName)
{
    var linkText = urlDisplayName ? urlDisplayName : url ? WebInspector.displayNameForURL(url) : WebInspector.UIString("(program)");
    if (typeof lineNumber === "number")
        linkText += ":" + (lineNumber + 1);
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
