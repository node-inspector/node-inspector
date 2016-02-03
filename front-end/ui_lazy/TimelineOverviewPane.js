/*
 * Copyright (C) 2013 Google Inc. All rights reserved.
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
 * @extends {WebInspector.VBox}
 * @param {string} prefix
 */
WebInspector.TimelineOverviewPane = function(prefix)
{
    WebInspector.VBox.call(this);
    this.element.id = prefix + "-overview-pane";

    this._overviewCalculator = new WebInspector.TimelineOverviewCalculator();
    this._overviewGrid = new WebInspector.OverviewGrid(prefix);
    this.element.appendChild(this._overviewGrid.element);
    this._cursorArea = this._overviewGrid.element.createChild("div", "overview-grid-cursor-area");
    this._cursorElement = this._overviewGrid.element.createChild("div", "overview-grid-cursor-position");
    this._cursorArea.addEventListener("mousemove", this._onMouseMove.bind(this), true);
    this._cursorArea.addEventListener("mouseleave", this._hideCursor.bind(this), true);

    this._overviewGrid.setResizeEnabled(false);
    this._overviewGrid.addEventListener(WebInspector.OverviewGrid.Events.WindowChanged, this._onWindowChanged, this);
    this._overviewGrid.addEventListener(WebInspector.OverviewGrid.Events.Click, this._onClick, this);
    this._overviewControls = [];
    this._markers = new Map();

    this._popoverHelper = new WebInspector.PopoverHelper(this._cursorArea, this._getPopoverAnchor.bind(this), this._showPopover.bind(this), this._onHidePopover.bind(this));
    this._popoverHelper.setTimeout(0);

    this._updateThrottler = new WebInspector.Throttler(100);

    this._cursorEnabled = false;
    this._cursorPosition = 0;
    this._lastWidth = 0;
}

WebInspector.TimelineOverviewPane.Events = {
    WindowChanged: "WindowChanged"
};

WebInspector.TimelineOverviewPane.prototype = {
    /**
     * @param {!Element} element
     * @param {!Event} event
     * @return {!Element|!AnchorBox|undefined}
     */
    _getPopoverAnchor: function(element, event)
    {
        return this._cursorArea;
    },

    /**
     * @param {!Element} anchor
     * @param {!WebInspector.Popover} popover
     */
    _showPopover: function(anchor, popover)
    {
        this._buildPopoverContents().then(maybeShowPopover.bind(this));
        /**
         * @this {WebInspector.TimelineOverviewPane}
         * @param {!DocumentFragment} fragment
         */
        function maybeShowPopover(fragment)
        {
            if (!fragment.firstChild)
                return;
            var content = new WebInspector.TimelineOverviewPane.PopoverContents();
            this._popoverContents = content.contentElement.createChild("div");
            this._popoverContents.appendChild(fragment);
            this._popover = popover;
            popover.showView(content, this._cursorElement);
        }
    },

    _onHidePopover: function()
    {
        this._popover = null;
        this._popoverContents = null;
    },

    /**
     * @param {!Event} event
     */
    _onMouseMove: function(event)
    {
        if (!this._cursorEnabled)
            return;
        this._cursorPosition = event.offsetX + event.target.offsetLeft;
        this._cursorElement.style.left = this._cursorPosition + "px";
        this._cursorElement.style.visibility = "visible";
        if (!this._popover)
            return;
        this._buildPopoverContents().then(updatePopover.bind(this));
        this._popover.positionElement(this._cursorElement);

        /**
         * @param {!DocumentFragment} fragment
         * @this {WebInspector.TimelineOverviewPane}
         */
        function updatePopover(fragment)
        {
            if (!this._popoverContents)
                return;
            this._popoverContents.removeChildren();
            this._popoverContents.appendChild(fragment);
        }
    },

    /**
     * @return {!Promise<!DocumentFragment>}
     */
    _buildPopoverContents: function()
    {
        var document = this.element.ownerDocument;
        var x = this._cursorPosition;
        var promises = this._overviewControls.map(mapToPopover);

        /**
         * @param {!WebInspector.TimelineOverview} control
         * @return {!Promise<?Element>}
         */
        function mapToPopover(control)
        {
            return control.popoverElementPromise(x)
        }

        return Promise.all(promises).then(buildFragment);

        /**
         * @param {!Array<?Element>} elements
         * @return {!DocumentFragment}
         */
        function buildFragment(elements)
        {
            var fragment = document.createDocumentFragment();
            elements.remove(null);
            fragment.appendChildren.apply(fragment, elements);
            return fragment;
        }
    },

    _hideCursor: function()
    {
        this._cursorElement.style.visibility = "hidden";
    },

    /**
     * @override
     */
    wasShown: function()
    {
        this._update();
    },

    /**
     * @override
     */
    onResize: function()
    {
        var width = this.element.offsetWidth;
        if (width === this._lastWidth)
            return;
        this._lastWidth = width;
        this.scheduleUpdate();
    },

    /**
     * @param {!Array.<!WebInspector.TimelineOverview>} overviewControls
     */
    setOverviewControls: function(overviewControls)
    {
        for (var i = 0; i < this._overviewControls.length; ++i)
            this._overviewControls[i].dispose();

        for (var i = 0; i < overviewControls.length; ++i) {
            overviewControls[i].setCalculator(this._overviewCalculator);
            overviewControls[i].show(this._overviewGrid.element);
        }
        this._overviewControls = overviewControls;
        this._update();
    },

    /**
     * @param {number} minimumBoundary
     * @param {number} maximumBoundary
     */
    setBounds: function(minimumBoundary, maximumBoundary)
    {
        this._overviewCalculator.setBounds(minimumBoundary, maximumBoundary);
        this._overviewGrid.setResizeEnabled(true);
        this._cursorEnabled = true;
    },

    scheduleUpdate: function()
    {
        this._updateThrottler.schedule(process.bind(this));
        /**
         * @this {WebInspector.TimelineOverviewPane}
         * @return {!Promise.<undefined>}
         */
        function process()
        {
            this._update();
            return Promise.resolve();
        }
    },

    _update: function()
    {
        if (!this.isShowing())
            return;
        this._overviewCalculator.setDisplayWindow(this._overviewGrid.clientWidth());
        for (var i = 0; i < this._overviewControls.length; ++i)
            this._overviewControls[i].update();
        this._overviewGrid.updateDividers(this._overviewCalculator);
        this._updateMarkers();
        this._updateWindow();
    },

    /**
     * @param {!Map<number, !Element>} markers
     */
    setMarkers: function(markers)
    {
        this._markers = markers;
        this._updateMarkers();
    },

    _updateMarkers: function()
    {
        var filteredMarkers = new Map();
        for (var time of this._markers.keys()) {
            var marker = this._markers.get(time);
            var position = Math.round(this._overviewCalculator.computePosition(time));
            // Limit the number of markers to one per pixel.
            if (filteredMarkers.has(position))
                continue;
            filteredMarkers.set(position, marker);
            marker.style.left = position + "px";
        }
        this._overviewGrid.removeEventDividers();
        this._overviewGrid.addEventDividers(filteredMarkers.valuesArray());
    },

    reset: function()
    {
        this._overviewCalculator.reset();
        this._overviewGrid.reset();
        this._overviewGrid.setResizeEnabled(false);
        this._overviewGrid.updateDividers(this._overviewCalculator);
        this._cursorEnabled = false;
        this._hideCursor();
        this._markers = new Map();
        for (var i = 0; i < this._overviewControls.length; ++i)
            this._overviewControls[i].reset();
        this._popoverHelper.hidePopover();
        this._update();
    },

    /**
     * @param {!WebInspector.Event} event
     */
    _onClick: function(event)
    {
        var domEvent = /** @type {!Event} */ (event.data);
        for (var overviewControl of this._overviewControls) {
            if (overviewControl.onClick(domEvent)) {
                event.preventDefault();
                return;
            }
        }
    },

    /**
     * @param {!WebInspector.Event} event
     */
    _onWindowChanged: function(event)
    {
        if (this._muteOnWindowChanged)
            return;
        // Always use first control as a time converter.
        if (!this._overviewControls.length)
            return;
        var windowTimes = this._overviewControls[0].windowTimes(this._overviewGrid.windowLeft(), this._overviewGrid.windowRight());
        this._windowStartTime = windowTimes.startTime;
        this._windowEndTime = windowTimes.endTime;
        this.dispatchEventToListeners(WebInspector.TimelineOverviewPane.Events.WindowChanged, windowTimes);
    },

    /**
     * @param {number} startTime
     * @param {number} endTime
     */
    requestWindowTimes: function(startTime, endTime)
    {
        if (startTime === this._windowStartTime && endTime === this._windowEndTime)
            return;
        this._windowStartTime = startTime;
        this._windowEndTime = endTime;
        this._updateWindow();
        this.dispatchEventToListeners(WebInspector.TimelineOverviewPane.Events.WindowChanged, { startTime: startTime, endTime: endTime });
    },

    _updateWindow: function()
    {
        if (!this._overviewControls.length)
            return;
        var windowBoundaries = this._overviewControls[0].windowBoundaries(this._windowStartTime, this._windowEndTime);
        this._muteOnWindowChanged = true;
        this._overviewGrid.setWindow(windowBoundaries.left, windowBoundaries.right);
        this._muteOnWindowChanged = false;
    },

    __proto__: WebInspector.VBox.prototype
}

/**
 * @constructor
 * @extends {WebInspector.VBox}
 */
WebInspector.TimelineOverviewPane.PopoverContents = function()
{
    WebInspector.VBox.call(this, true);
    this.contentElement.classList.add("timeline-overview-popover");
}

WebInspector.TimelineOverviewPane.PopoverContents.prototype = {
    __proto__: WebInspector.VBox.prototype
}

/**
 * @constructor
 * @implements {WebInspector.TimelineGrid.Calculator}
 */
WebInspector.TimelineOverviewCalculator = function()
{
    this.reset();
}

WebInspector.TimelineOverviewCalculator.prototype = {
    /**
     * @override
     * @return {number}
     */
    paddingLeft: function()
    {
        return this._paddingLeft;
    },

    /**
     * @override
     * @param {number} time
     * @return {number}
     */
    computePosition: function(time)
    {
        return (time - this._minimumBoundary) / this.boundarySpan() * this._workingArea + this._paddingLeft;
    },

    /**
     * @param {number} position
     * @return {number}
     */
    positionToTime: function(position)
    {
        return (position - this._paddingLeft) / this._workingArea * this.boundarySpan() + this._minimumBoundary;
    },

    /**
     * @param {number} minimumBoundary
     * @param {number} maximumBoundary
     */
    setBounds: function(minimumBoundary, maximumBoundary)
    {
        this._minimumBoundary = minimumBoundary;
        this._maximumBoundary = maximumBoundary;
    },

    /**
     * @param {number} clientWidth
     * @param {number=} paddingLeft
     */
    setDisplayWindow: function(clientWidth, paddingLeft)
    {
        this._paddingLeft = paddingLeft || 0;
        this._workingArea = clientWidth - this._paddingLeft;
    },

    reset: function()
    {
        this.setBounds(0, 1000);
    },

    /**
     * @override
     * @param {number} value
     * @param {number=} precision
     * @return {string}
     */
    formatTime: function(value, precision)
    {
        return Number.preciseMillisToString(value - this.zeroTime(), precision);
    },

    /**
     * @override
     * @return {number}
     */
    maximumBoundary: function()
    {
        return this._maximumBoundary;
    },

    /**
     * @override
     * @return {number}
     */
    minimumBoundary: function()
    {
        return this._minimumBoundary;
    },

    /**
     * @override
     * @return {number}
     */
    zeroTime: function()
    {
        return this._minimumBoundary;
    },

    /**
     * @override
     * @return {number}
     */
    boundarySpan: function()
    {
        return this._maximumBoundary - this._minimumBoundary;
    }
}

/**
 * @interface
 */
WebInspector.TimelineOverview = function()
{
}

WebInspector.TimelineOverview.prototype = {
    /**
     * @param {?Element} parentElement
     * @param {!Element=} insertBefore
     */
    show: function(parentElement, insertBefore) { },

    update: function() { },

    dispose: function() { },

    reset: function() { },

    /**
     * @param {number} x
     * @return {!Promise<?Element>}
     */
    popoverElementPromise: function(x) { },

    /**
     * @param {!Event} event
     * @return {boolean}
     */
    onClick: function(event) { },

    /**
     * @param {number} windowLeft
     * @param {number} windowRight
     * @return {!{startTime: number, endTime: number}}
     */
    windowTimes: function(windowLeft, windowRight) { },

    /**
     * @param {number} startTime
     * @param {number} endTime
     * @return {!{left: number, right: number}}
     */
    windowBoundaries: function(startTime, endTime) { },

    timelineStarted: function() { },

    timelineStopped: function() { },
}

/**
 * @constructor
 * @extends {WebInspector.VBox}
 * @implements {WebInspector.TimelineOverview}
 */
WebInspector.TimelineOverviewBase = function()
{
    WebInspector.VBox.call(this);
    /** @type {?WebInspector.TimelineOverviewCalculator} */
    this._calculator = null;
    this._canvas = this.element.createChild("canvas", "fill");
    this._context = this._canvas.getContext("2d");
}

WebInspector.TimelineOverviewBase.prototype = {
    /**
     * @override
     */
    update: function()
    {
        this.resetCanvas();
    },

    /**
     * @override
     */
    dispose: function()
    {
        this.detach();
    },

    /**
     * @override
     */
    reset: function()
    {
    },

    /**
     * @override
     * @param {number} x
     * @return {!Promise<?Element>}
     */
    popoverElementPromise: function(x)
    {
        return Promise.resolve(/** @type {?Element} */ (null));
    },

    /**
     * @override
     */
    timelineStarted: function()
    {
    },

    /**
     * @override
     */
    timelineStopped: function()
    {
    },

    /**
     * @param {!WebInspector.TimelineOverviewCalculator} calculator
     */
    setCalculator: function(calculator)
    {
        this._calculator = calculator;
    },

    /**
     * @override
     * @param {!Event} event
     * @return {boolean}
     */
    onClick: function(event)
    {
        return false;
    },

    /**
     * @override
     * @param {number} windowLeft
     * @param {number} windowRight
     * @return {!{startTime: number, endTime: number}}
     */
    windowTimes: function(windowLeft, windowRight)
    {
        var absoluteMin = this._calculator.minimumBoundary();
        var timeSpan = this._calculator.maximumBoundary() - absoluteMin;
        return {
            startTime: absoluteMin + timeSpan * windowLeft,
            endTime: absoluteMin + timeSpan * windowRight
        };
    },

    /**
     * @override
     * @param {number} startTime
     * @param {number} endTime
     * @return {!{left: number, right: number}}
     */
    windowBoundaries: function(startTime, endTime)
    {
        var absoluteMin = this._calculator.minimumBoundary();
        var timeSpan = this._calculator.maximumBoundary() - absoluteMin;
        var haveRecords = absoluteMin > 0;
        return {
            left: haveRecords && startTime ? Math.min((startTime - absoluteMin) / timeSpan, 1) : 0,
            right: haveRecords && endTime < Infinity ? (endTime - absoluteMin) / timeSpan : 1
        };
    },

    resetCanvas: function()
    {
        this._canvas.width = this.element.clientWidth * window.devicePixelRatio;
        this._canvas.height = this.element.clientHeight * window.devicePixelRatio;
    },

    __proto__: WebInspector.VBox.prototype
}
