/*
 * Copyright (C) 2007, 2008 Apple Inc.  All rights reserved.
 * Copyright (C) 2008, 2009 Anthony Ricaud <rik@webkit.org>
 * Copyright (C) 2011 Google Inc. All rights reserved.
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
 * @extends {WebInspector.SortableDataGridNode}
 * @param {!WebInspector.NetworkLogView} parentView
 * @param {!WebInspector.NetworkRequest} request
 */
WebInspector.NetworkDataGridNode = function(parentView, request)
{
    WebInspector.SortableDataGridNode.call(this, {});
    this._parentView = parentView;
    this._request = request;
    this._linkifier = new WebInspector.Linkifier();
    this._staleGraph = true;
}

WebInspector.NetworkDataGridNode._hoveredRowSymbol = Symbol("hoveredRow");

WebInspector.NetworkDataGridNode.prototype = {
    /**
     * @return {!WebInspector.NetworkRequest}
     */
    request: function()
    {
        return this._request;
    },

    /**
     * @override
     * @return {number}
     */
    nodeSelfHeight: function()
    {
        return this._parentView.rowHeight();
    },

    /** override */
    createCells: function()
    {
        this._nameCell = null;
        this._timelineCell = null;
        this._initiatorCell = null;

        this._element.classList.toggle("network-error-row", this._isFailed());
        WebInspector.SortableDataGridNode.prototype.createCells.call(this);

        this._updateGraph();
    },

    /**
     * @override
     * @param {string} columnIdentifier
     * @return {!Element}
     */
    createCell: function(columnIdentifier)
    {
        var cell = this.createTD(columnIdentifier);
        switch (columnIdentifier) {
        case "name": this._renderNameCell(cell); break;
        case "timeline": this._createTimelineBar(cell); break;
        case "method": cell.setTextAndTitle(this._request.requestMethod); break;
        case "status": this._renderStatusCell(cell); break;
        case "scheme": cell.setTextAndTitle(this._request.scheme); break;
        case "domain": cell.setTextAndTitle(this._request.domain); break;
        case "remoteAddress": cell.setTextAndTitle(this._request.remoteAddress()); break;
        case "cookies": cell.setTextAndTitle(this._arrayLength(this._request.requestCookies)); break;
        case "setCookies": cell.setTextAndTitle(this._arrayLength(this._request.responseCookies)); break;
        case "connectionId": cell.setTextAndTitle(this._request.connectionId); break;
        case "type": cell.setTextAndTitle(this._request.mimeType || this._request.requestContentType() || ""); break;
        case "initiator": this._renderInitiatorCell(cell); break;
        case "size": this._renderSizeCell(cell); break;
        case "time": this._renderTimeCell(cell); break;
        default: cell.setTextAndTitle(this._request.responseHeaderValue(columnIdentifier) || ""); break;
        }

        return cell;
    },

    /**
     * @param {?Array} array
     * @return {string}
     */
    _arrayLength: function(array)
    {
        return array ? "" + array.length : "";
    },

    /**
     * @override
     * @protected
     */
    willAttach: function()
    {
        if (this._staleGraph)
            this._updateGraph();
        if (this._initiatorCell && this._request.initiatorInfo().type === WebInspector.NetworkRequest.InitiatorType.Script)
            this._initiatorCell.insertBefore(this._linkifiedInitiatorAnchor, this._initiatorCell.firstChild);
    },

    wasDetached: function()
    {
        if (this._linkifiedInitiatorAnchor)
            this._linkifiedInitiatorAnchor.remove();
    },

    dispose: function()
    {
        this._linkifier.reset();
    },

    _onClick: function()
    {
        if (!this._parentView.allowRequestSelection())
            this.select();
    },

    select: function()
    {
        this._parentView.dispatchEventToListeners(WebInspector.NetworkLogView.EventTypes.RequestSelected, this._request);
        WebInspector.SortableDataGridNode.prototype.select.apply(this, arguments);

        WebInspector.notifications.dispatchEventToListeners(WebInspector.UserMetrics.UserAction, {
            action: WebInspector.UserMetrics.UserActionNames.NetworkRequestSelected,
            url: this._request.url
        });
    },

    /**
     * @param {!RegExp=} regexp
     * @return {!Array.<!Object>}
     */
    highlightMatchedSubstring: function(regexp)
    {
        // Ensure element is created.
        this.element();
        var domChanges = [];
        var matchInfo = this._nameCell.textContent.match(regexp);
        if (matchInfo)
            WebInspector.highlightSearchResult(this._nameCell, matchInfo.index, matchInfo[0].length, domChanges);
        return domChanges;
    },

    _openInNewTab: function()
    {
        InspectorFrontendHost.openInNewTab(this._request.url);
    },

    get selectable()
    {
        return this._parentView.allowRequestSelection();
    },

    /**
     * @param {!Element} cell
     */
    _createTimelineBar: function(cell)
    {
        cell = cell.createChild("div");
        this._timelineCell = cell;

        cell.className = "network-graph-side";

        this._barAreaElement = cell.createChild("div", "network-graph-bar-area");
        this._barAreaElement.request = this._request;

        var type = this._request.resourceType().name();
        var cached = this._request.cached();

        this._barLeftElement = this._barAreaElement.createChild("div", "network-graph-bar");
        this._barLeftElement.classList.add(type, "waiting");
        this._barLeftElement.classList.toggle("cached", cached);

        this._barRightElement = this._barAreaElement.createChild("div", "network-graph-bar");
        this._barRightElement.classList.add(type);
        this._barRightElement.classList.toggle("cached", cached);

        this._labelLeftElement = this._barAreaElement.createChild("div", "network-graph-label");
        this._labelLeftElement.classList.add("waiting");

        this._labelRightElement = this._barAreaElement.createChild("div", "network-graph-label");

        cell.addEventListener("mouseover", this._onMouseOver.bind(this), false);
    },

    /**
     * @param {!Event} event
     */
    _onMouseOver: function(event)
    {
        this._refreshLabelPositions();
        this._parentView[WebInspector.NetworkDataGridNode._hoveredRowSymbol] = this;
    },

    /**
     * @return {boolean}
     */
    _isFailed: function()
    {
        return (this._request.failed && !this._request.statusCode) || (this._request.statusCode >= 400);
    },

    /**
     * @param {!Element} cell
     */
    _renderNameCell: function(cell)
    {
        this._nameCell = cell;
        cell.addEventListener("click", this._onClick.bind(this), false);
        cell.addEventListener("dblclick", this._openInNewTab.bind(this), false);
        var iconElement;
        if (this._request.resourceType() === WebInspector.resourceTypes.Image) {
            var previewImage = createElementWithClass("img", "image-network-icon-preview");
            this._request.populateImageSource(previewImage);

            iconElement = createElementWithClass("div", "icon");
            iconElement.appendChild(previewImage);
        } else {
            iconElement = createElementWithClass("img", "icon");
        }
        iconElement.classList.add(this._request.resourceType().name());

        cell.appendChild(iconElement);
        cell.createTextChild(this._request.name());
        this._appendSubtitle(cell, this._request.path());
        cell.title = this._request.url;
    },

    /**
     * @param {!Element} cell
     */
    _renderStatusCell: function(cell)
    {
        cell.classList.toggle("network-dim-cell", !this._isFailed() && (this._request.cached() || !this._request.statusCode));

        if (this._request.failed && !this._request.canceled) {
            var failText = WebInspector.UIString("(failed)");
            if (this._request.localizedFailDescription) {
                cell.createTextChild(failText);
                this._appendSubtitle(cell, this._request.localizedFailDescription);
                cell.title = failText + " " + this._request.localizedFailDescription;
            } else
                cell.setTextAndTitle(failText);
        } else if (this._request.statusCode) {
            cell.createTextChild("" + this._request.statusCode);
            this._appendSubtitle(cell, this._request.statusText);
            cell.title = this._request.statusCode + " " + this._request.statusText;
        } else if (this._request.parsedURL.isDataURL()) {
            cell.setTextAndTitle(WebInspector.UIString("(data)"));
        } else if (this._request.canceled) {
            cell.setTextAndTitle(WebInspector.UIString("(canceled)"));
        } else if (this._request.finished) {
            cell.setTextAndTitle(WebInspector.UIString("Finished"));
        } else {
            cell.setTextAndTitle(WebInspector.UIString("(pending)"));
        }
    },

    /**
     * @param {!Element} cell
     */
    _renderInitiatorCell: function(cell)
    {
        this._initiatorCell = cell;
        var request = this._request;
        var initiator = request.initiatorInfo();

        switch (initiator.type) {
        case WebInspector.NetworkRequest.InitiatorType.Parser:
            cell.title = initiator.url + ":" + initiator.lineNumber;
            cell.appendChild(WebInspector.linkifyResourceAsNode(initiator.url, initiator.lineNumber - 1));
            this._appendSubtitle(cell, WebInspector.UIString("Parser"));
            break;

        case WebInspector.NetworkRequest.InitiatorType.Redirect:
            cell.title = initiator.url;
            console.assert(request.redirectSource);
            var redirectSource = /** @type {!WebInspector.NetworkRequest} */ (request.redirectSource);
            cell.appendChild(WebInspector.linkifyRequestAsNode(redirectSource));
            this._appendSubtitle(cell, WebInspector.UIString("Redirect"));
            break;

        case WebInspector.NetworkRequest.InitiatorType.Script:
            if (!this._linkifiedInitiatorAnchor) {
                this._linkifiedInitiatorAnchor = this._linkifier.linkifyScriptLocation(request.target(), null, initiator.url, initiator.lineNumber - 1, initiator.columnNumber - 1);
                this._linkifiedInitiatorAnchor.title = "";
            }
            cell.appendChild(this._linkifiedInitiatorAnchor);
            this._appendSubtitle(cell, WebInspector.UIString("Script"));
            cell.classList.add("network-script-initiated");
            cell.request = request;
            break;

        default:
            cell.title = "";
            cell.classList.add("network-dim-cell");
            cell.setTextAndTitle(WebInspector.UIString("Other"));
        }
    },

    /**
     * @param {!Element} cell
     */
    _renderSizeCell: function(cell)
    {
        if (this._request.fetchedViaServiceWorker) {
            cell.setTextAndTitle(WebInspector.UIString("(from ServiceWorker)"));
            cell.classList.add("network-dim-cell");
        } else if (this._request.cached()) {
            cell.setTextAndTitle(WebInspector.UIString("(from cache)"));
            cell.classList.add("network-dim-cell");
        } else {
            var resourceSize = Number.bytesToString(this._request.resourceSize);
            var transferSize = Number.bytesToString(this._request.transferSize);
            cell.setTextAndTitle(transferSize);
            this._appendSubtitle(cell, resourceSize);
        }
    },

    /**
     * @param {!Element} cell
     */
    _renderTimeCell: function(cell)
    {
        if (this._request.duration > 0) {
            cell.setTextAndTitle(Number.secondsToString(this._request.duration));
            this._appendSubtitle(cell, Number.secondsToString(this._request.latency));
        } else {
            cell.classList.add("network-dim-cell");
            cell.setTextAndTitle(WebInspector.UIString("Pending"));
        }
    },

    /**
     * @param {!Element} cellElement
     * @param {string} subtitleText
     */
    _appendSubtitle: function(cellElement, subtitleText)
    {
        var subtitleElement = createElement("div");
        subtitleElement.className = "network-cell-subtitle";
        subtitleElement.textContent = subtitleText;
        cellElement.appendChild(subtitleElement);
    },

    refreshGraph: function()
    {
        if (!this._timelineCell)
            return;
        this._staleGraph = true;
        if (this.attached())
            this.dataGrid.scheduleUpdate();
    },

    _updateGraph: function()
    {
        this._staleGraph = false;
        if (!this._timelineCell)
            return;

        var calculator = this._parentView.calculator();
        var percentages = calculator.computeBarGraphPercentages(this._request);
        this._percentages = percentages;

        this._barAreaElement.classList.remove("hidden");

        this._barLeftElement.style.setProperty("left", percentages.start + "%");
        this._barLeftElement.style.setProperty("right", (100 - percentages.middle) + "%");

        this._barRightElement.style.setProperty("left", percentages.middle + "%");
        this._barRightElement.style.setProperty("right", (100 - percentages.end) + "%");

        var labels = calculator.computeBarGraphLabels(this._request);
        this._labelLeftElement.textContent = labels.left;
        this._labelRightElement.textContent = labels.right;

        var tooltip = (labels.tooltip || "");
        this._barLeftElement.title = tooltip;
        this._labelLeftElement.title = tooltip;
        this._labelRightElement.title = tooltip;
        this._barRightElement.title = tooltip;

        if (this._parentView[WebInspector.NetworkDataGridNode._hoveredRowSymbol] === this)
            this._refreshLabelPositions();
    },

    _refreshLabelPositions: function()
    {
        if (!this._percentages)
            return;
        this._labelLeftElement.style.removeProperty("left");
        this._labelLeftElement.style.removeProperty("right");
        this._labelLeftElement.classList.remove("before");
        this._labelLeftElement.classList.remove("hidden");

        this._labelRightElement.style.removeProperty("left");
        this._labelRightElement.style.removeProperty("right");
        this._labelRightElement.classList.remove("after");
        this._labelRightElement.classList.remove("hidden");

        const labelPadding = 10;
        const barRightElementOffsetWidth = this._barRightElement.offsetWidth;
        const barLeftElementOffsetWidth = this._barLeftElement.offsetWidth;

        if (this._barLeftElement) {
            var leftBarWidth = barLeftElementOffsetWidth - labelPadding;
            var rightBarWidth = (barRightElementOffsetWidth - barLeftElementOffsetWidth) - labelPadding;
        } else {
            var leftBarWidth = (barLeftElementOffsetWidth - barRightElementOffsetWidth) - labelPadding;
            var rightBarWidth = barRightElementOffsetWidth - labelPadding;
        }

        const labelLeftElementOffsetWidth = this._labelLeftElement.offsetWidth;
        const labelRightElementOffsetWidth = this._labelRightElement.offsetWidth;

        const labelBefore = (labelLeftElementOffsetWidth > leftBarWidth);
        const labelAfter = (labelRightElementOffsetWidth > rightBarWidth);
        const graphElementOffsetWidth = this._timelineCell.offsetWidth;

        if (labelBefore && (graphElementOffsetWidth * (this._percentages.start / 100)) < (labelLeftElementOffsetWidth + 10))
            var leftHidden = true;

        if (labelAfter && (graphElementOffsetWidth * ((100 - this._percentages.end) / 100)) < (labelRightElementOffsetWidth + 10))
            var rightHidden = true;

        if (barLeftElementOffsetWidth == barRightElementOffsetWidth) {
            // The left/right label data are the same, so a before/after label can be replaced by an on-bar label.
            if (labelBefore && !labelAfter)
                leftHidden = true;
            else if (labelAfter && !labelBefore)
                rightHidden = true;
        }

        if (labelBefore) {
            if (leftHidden)
                this._labelLeftElement.classList.add("hidden");
            this._labelLeftElement.style.setProperty("right", (100 - this._percentages.start) + "%");
            this._labelLeftElement.classList.add("before");
        } else {
            this._labelLeftElement.style.setProperty("left", this._percentages.start + "%");
            this._labelLeftElement.style.setProperty("right", (100 - this._percentages.middle) + "%");
        }

        if (labelAfter) {
            if (rightHidden)
                this._labelRightElement.classList.add("hidden");
            this._labelRightElement.style.setProperty("left", this._percentages.end + "%");
            this._labelRightElement.classList.add("after");
        } else {
            this._labelRightElement.style.setProperty("left", this._percentages.middle + "%");
            this._labelRightElement.style.setProperty("right", (100 - this._percentages.end) + "%");
        }
    },

    __proto__: WebInspector.SortableDataGridNode.prototype
}

/**
 * @param {!WebInspector.NetworkDataGridNode} a
 * @param {!WebInspector.NetworkDataGridNode} b
 * @return {number}
 */
WebInspector.NetworkDataGridNode.NameComparator = function(a, b)
{
    var aFileName = a._request.name();
    var bFileName = b._request.name();
    if (aFileName > bFileName)
        return 1;
    if (bFileName > aFileName)
        return -1;
    return a._request.indentityCompare(b._request);
}

/**
 * @param {!WebInspector.NetworkDataGridNode} a
 * @param {!WebInspector.NetworkDataGridNode} b
 * @return {number}
 */
WebInspector.NetworkDataGridNode.RemoteAddressComparator = function(a, b)
{
    var aRemoteAddress = a._request.remoteAddress();
    var bRemoteAddress = b._request.remoteAddress();
    if (aRemoteAddress > bRemoteAddress)
        return 1;
    if (bRemoteAddress > aRemoteAddress)
        return -1;
    return a._request.indentityCompare(b._request);
}

/**
 * @param {!WebInspector.NetworkDataGridNode} a
 * @param {!WebInspector.NetworkDataGridNode} b
 * @return {number}
 */
WebInspector.NetworkDataGridNode.SizeComparator = function(a, b)
{
    if (b._request.cached() && !a._request.cached())
        return 1;
    if (a._request.cached() && !b._request.cached())
        return -1;
    return (a._request.transferSize - b._request.transferSize) || a._request.indentityCompare(b._request);
}

/**
 * @param {!WebInspector.NetworkDataGridNode} a
 * @param {!WebInspector.NetworkDataGridNode} b
 * @return {number}
 */
WebInspector.NetworkDataGridNode.InitiatorComparator = function(a, b)
{
    var aInitiator = a._request.initiatorInfo();
    var bInitiator = b._request.initiatorInfo();

    if (aInitiator.type < bInitiator.type)
        return -1;
    if (aInitiator.type > bInitiator.type)
        return 1;

    if (typeof aInitiator.__source === "undefined")
        aInitiator.__source = WebInspector.displayNameForURL(aInitiator.url);
    if (typeof bInitiator.__source === "undefined")
        bInitiator.__source = WebInspector.displayNameForURL(bInitiator.url);

    if (aInitiator.__source < bInitiator.__source)
        return -1;
    if (aInitiator.__source > bInitiator.__source)
        return 1;

    if (aInitiator.lineNumber < bInitiator.lineNumber)
        return -1;
    if (aInitiator.lineNumber > bInitiator.lineNumber)
        return 1;

    if (aInitiator.columnNumber < bInitiator.columnNumber)
        return -1;
    if (aInitiator.columnNumber > bInitiator.columnNumber)
        return 1;

    return a._request.indentityCompare(b._request);
}

/**
 * @param {!WebInspector.NetworkDataGridNode} a
 * @param {!WebInspector.NetworkDataGridNode} b
 * @return {number}
 */
WebInspector.NetworkDataGridNode.RequestCookiesCountComparator = function(a, b)
{
    var aScore = a._request.requestCookies ? a._request.requestCookies.length : 0;
    var bScore = b._request.requestCookies ? b._request.requestCookies.length : 0;
    return (aScore - bScore) || a._request.indentityCompare(b._request);
}

/**
 * @param {!WebInspector.NetworkDataGridNode} a
 * @param {!WebInspector.NetworkDataGridNode} b
 * @return {number}
 */
WebInspector.NetworkDataGridNode.ResponseCookiesCountComparator = function(a, b)
{
    var aScore = a._request.responseCookies ? a._request.responseCookies.length : 0;
    var bScore = b._request.responseCookies ? b._request.responseCookies.length : 0;
    return (aScore - bScore) || a._request.indentityCompare(b._request);
}

/**
 * @param {string} propertyName
 * @param {boolean} revert
 * @param {!WebInspector.NetworkDataGridNode} a
 * @param {!WebInspector.NetworkDataGridNode} b
 * @return {number}
 */
WebInspector.NetworkDataGridNode.RequestPropertyComparator = function(propertyName, revert, a, b)
{
    var aValue = a._request[propertyName];
    var bValue = b._request[propertyName];
    if (aValue > bValue)
        return revert ? -1 : 1;
    if (bValue > aValue)
        return revert ? 1 : -1;
    return a._request.indentityCompare(b._request);
}
