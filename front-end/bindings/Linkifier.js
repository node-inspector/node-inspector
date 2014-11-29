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
    /** @type {!Map.<!WebInspector.Target, !Array.<{anchor: !Element, location: !WebInspector.LiveLocation}>>}*/
    this._liveLocationsByTarget = new Map();
    WebInspector.targetManager.observeTargets(this);
}

/**
 * @param {!WebInspector.Linkifier.LinkHandler} handler
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
    return WebInspector.Linkifier._linkHandler.handleLink(url, lineNumber)
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

WebInspector.Linkifier.prototype = {
    /**
     * @param {!WebInspector.Target} target
     */
    targetAdded: function(target)
    {
        this._liveLocationsByTarget.set(target, []);
    },

    /**
     * @param {!WebInspector.Target} target
     */
    targetRemoved: function(target)
    {
        var liveLocations = this._liveLocationsByTarget.remove(target);
        for (var i = 0; i < liveLocations.length; ++i) {
            delete liveLocations[i].anchor.__uiLocation;
            var anchor = liveLocations[i].anchor;
            if (anchor.__fallbackAnchor) {
                anchor.href = anchor.__fallbackAnchor.href;
                anchor.lineNumber = anchor.__fallbackAnchor.lineNumber;
                anchor.title = anchor.__fallbackAnchor.title;
                anchor.className = anchor.__fallbackAnchor.className;
                anchor.textContent = anchor.__fallbackAnchor.textContent;
            }
            liveLocations[i].location.dispose();
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
        var rawLocation = target && !target.isDetached() ? target.debuggerModel.createRawLocationByScriptId(scriptId, sourceURL, lineNumber, columnNumber || 0) : null;
        var fallbackAnchor = WebInspector.linkifyResourceAsNode(sourceURL, lineNumber, classes);
        if (!rawLocation)
            return fallbackAnchor;

        var anchor = this._createAnchor(classes);
        var liveLocation = WebInspector.debuggerWorkspaceBinding.createLiveLocation(rawLocation, this._updateAnchor.bind(this, anchor));
        this._liveLocationsByTarget.get(rawLocation.target()).push({ anchor: anchor, location: liveLocation });
        anchor.__fallbackAnchor = fallbackAnchor;
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

        var script = target && target.debuggerModel.scriptForId(callFrame.scriptId);
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
        this._liveLocationsByTarget.get(rawLocation.target()).push({ anchor: anchor, location: liveLocation });
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
            if (!anchor.__uiLocation)
                return;

            event.consume(true);
            if (WebInspector.Linkifier.handleLink(anchor.__uiLocation.uiSourceCode.url, anchor.__uiLocation.lineNumber))
                return;
            WebInspector.Revealer.reveal(anchor.__uiLocation);
        }
        anchor.addEventListener("click", clickHandler, false);
        return anchor;
    },

    reset: function()
    {
        var keys = this._liveLocationsByTarget.keysArray();
        for (var i = 0; i < keys.length; ++i) {
            var target = keys[i];
            this.targetRemoved(target);
            this.targetAdded(target);
        }
    },

    /**
     * @param {!Element} anchor
     * @param {!WebInspector.UILocation} uiLocation
     */
    _updateAnchor: function(anchor, uiLocation)
    {
        anchor.__uiLocation = uiLocation;
        this._formatter.formatLiveAnchor(anchor, uiLocation);
    }
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
    var script = target.debuggerModel.scriptForId(scriptId);
    if (!script)
        return "";
    var location = /** @type {!WebInspector.DebuggerModel.Location} */ (target.debuggerModel.createRawLocation(script, lineNumber, columnNumber || 0));
    var uiLocation = /** @type {!WebInspector.UILocation} */ (WebInspector.debuggerWorkspaceBinding.rawLocationToUILocation(location));
    return uiLocation.linkText();
}
