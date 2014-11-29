/*
 * Copyright (C) 2007, 2008 Apple Inc.  All rights reserved.
 * Copyright (C) 2008, 2009 Anthony Ricaud <rik@webkit.org>
 * Copyright (C) 2009 Google Inc. All rights reserved.
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
 */
WebInspector.TimelineGrid = function()
{
    this.element = createElement("div");

    this._dividersElement = this.element.createChild("div", "resources-dividers");

    this._gridHeaderElement = createElement("div");
    this._gridHeaderElement.id = "timeline-grid-header";
    this._eventDividersElement = this._gridHeaderElement.createChild("div", "resources-event-dividers");
    this._dividersLabelBarElement = this._gridHeaderElement.createChild("div", "resources-dividers-label-bar");
    this.element.appendChild(this._gridHeaderElement);

    this._leftCurtainElement = this.element.createChild("div", "timeline-cpu-curtain-left");
    this._rightCurtainElement = this.element.createChild("div", "timeline-cpu-curtain-right");
}

/**
 * @param {!WebInspector.TimelineGrid.Calculator} calculator
 * @return {!{offsets: !Array.<number>, precision: number}}
 */
WebInspector.TimelineGrid.calculateDividerOffsets = function(calculator)
{
    const minGridSlicePx = 64; // minimal distance between grid lines.
    const gridFreeZoneAtLeftPx = 50;

    var clientWidth = calculator.computePosition(calculator.maximumBoundary());
    var dividersCount = clientWidth / minGridSlicePx;
    var gridSliceTime = calculator.boundarySpan() / dividersCount;
    var pixelsPerTime = clientWidth / calculator.boundarySpan();

    // Align gridSliceTime to a nearest round value.
    // We allow spans that fit into the formula: span = (1|2|5)x10^n,
    // e.g.: ...  .1  .2  .5  1  2  5  10  20  50  ...
    // After a span has been chosen make grid lines at multiples of the span.

    var logGridSliceTime = Math.ceil(Math.log(gridSliceTime) / Math.LN10);
    gridSliceTime = Math.pow(10, logGridSliceTime);
    if (gridSliceTime * pixelsPerTime >= 5 * minGridSlicePx)
        gridSliceTime = gridSliceTime / 5;
    if (gridSliceTime * pixelsPerTime >= 2 * minGridSlicePx)
        gridSliceTime = gridSliceTime / 2;

    var firstDividerTime = Math.ceil((calculator.minimumBoundary() - calculator.zeroTime()) / gridSliceTime) * gridSliceTime + calculator.zeroTime();
    var lastDividerTime = calculator.maximumBoundary();
    // Add some extra space past the right boundary as the rightmost divider label text
    // may be partially shown rather than just pop up when a new rightmost divider gets into the view.
    if (calculator.paddingLeft() > 0)
        lastDividerTime = lastDividerTime + minGridSlicePx / pixelsPerTime;
    dividersCount = Math.ceil((lastDividerTime - firstDividerTime) / gridSliceTime);

    var skipLeftmostDividers = calculator.paddingLeft() === 0;

    if (!gridSliceTime)
        dividersCount = 0;

    var offsets = [];
    for (var i = 0; i < dividersCount; ++i) {
        var left = calculator.computePosition(firstDividerTime + gridSliceTime * i);
        if (skipLeftmostDividers && left < gridFreeZoneAtLeftPx)
            continue;
        offsets.push(firstDividerTime + gridSliceTime * i);
    }

    return {offsets: offsets, precision: Math.max(0, -Math.floor(Math.log(gridSliceTime * 1.01) / Math.LN10))};
}

/**
 * @param {!Object} canvas
 * @param {!WebInspector.TimelineGrid.Calculator} calculator
 * @param {?Array.<number>=} dividerOffsets
 */
WebInspector.TimelineGrid.drawCanvasGrid = function(canvas, calculator, dividerOffsets)
{
    var context = canvas.getContext("2d");
    context.save();
    var ratio = window.devicePixelRatio;
    context.scale(ratio, ratio);
    var printDeltas = !!dividerOffsets;
    var width = canvas.width / window.devicePixelRatio;
    var height = canvas.height / window.devicePixelRatio;
    var precision = 0;
    if (!dividerOffsets) {
        var dividersData = WebInspector.TimelineGrid.calculateDividerOffsets(calculator);
        dividerOffsets = dividersData.offsets;
        precision = dividersData.precision;
    }

    context.fillStyle = "rgba(255, 255, 255, 0.5)";
    context.fillRect(0, 0, width, 15);

    context.fillStyle = "#333";
    context.strokeStyle = "rgba(0, 0, 0, 0.1)";
    context.textBaseline = "hanging";
    context.font = (printDeltas ? "italic bold 11px " : " 11px ") + WebInspector.fontFamily();
    context.lineWidth = 1;

    context.translate(0.5, 0.5);
    const minWidthForTitle = 60;
    var lastPosition = 0;
    var time = 0;
    var lastTime = 0;
    var paddingRight = 4;
    var paddingTop = 3;
    for (var i = 0; i < dividerOffsets.length; ++i) {
        time = dividerOffsets[i];
        var position = calculator.computePosition(time);
        context.beginPath();
        if (position - lastPosition > minWidthForTitle) {
            if (!printDeltas || i !== 0) {
                var text = printDeltas ? calculator.formatTime(calculator.zeroTime() + time - lastTime) : calculator.formatTime(time, precision);
                var textWidth = context.measureText(text).width;
                var textPosition = printDeltas ? (position + lastPosition - textWidth) / 2 : position - textWidth - paddingRight;
                context.fillText(text, textPosition, paddingTop);
            }
        }
        context.moveTo(position, 0);
        context.lineTo(position, height);
        context.stroke();
        lastTime = time;
        lastPosition = position;
    }
    context.restore();
},

WebInspector.TimelineGrid.prototype = {
    get dividersElement()
    {
        return this._dividersElement;
    },

    get dividersLabelBarElement()
    {
        return this._dividersLabelBarElement;
    },

    removeDividers: function()
    {
        this._dividersElement.removeChildren();
        this._dividersLabelBarElement.removeChildren();
    },

    /**
     * @param {!WebInspector.TimelineGrid.Calculator} calculator
     * @param {?Array.<number>=} dividerOffsets
     * @param {boolean=} printDeltas
     * @return {boolean}
     */
    updateDividers: function(calculator, dividerOffsets, printDeltas)
    {
        var precision = 0;
        if (!dividerOffsets) {
            var dividersData = WebInspector.TimelineGrid.calculateDividerOffsets(calculator);
            dividerOffsets = dividersData.offsets;
            precision = dividersData.precision;
            printDeltas = false;
        }

        var dividersElementClientWidth = this._dividersElement.clientWidth;

        // Reuse divider elements and labels.
        var divider = /** @type {?Element} */ (this._dividersElement.firstChild);
        var dividerLabelBar = /** @type {?Element} */ (this._dividersLabelBarElement.firstChild);

        const minWidthForTitle = 60;
        var lastPosition = 0;
        var lastTime = 0;
        for (var i = 0; i < dividerOffsets.length; ++i) {
            if (!divider) {
                divider = createElement("div");
                divider.className = "resources-divider";
                this._dividersElement.appendChild(divider);

                dividerLabelBar = createElement("div");
                dividerLabelBar.className = "resources-divider";
                var label = createElement("div");
                label.className = "resources-divider-label";
                dividerLabelBar._labelElement = label;
                dividerLabelBar.appendChild(label);
                this._dividersLabelBarElement.appendChild(dividerLabelBar);
            }

            var time = dividerOffsets[i];
            var position = calculator.computePosition(time);
            if (position - lastPosition > minWidthForTitle)
                dividerLabelBar._labelElement.textContent = printDeltas ? calculator.formatTime(time - lastTime) : calculator.formatTime(time, precision);
            else
                dividerLabelBar._labelElement.textContent = "";

            if (printDeltas)
                dividerLabelBar._labelElement.style.width = Math.ceil(position - lastPosition) + "px";
            else
                dividerLabelBar._labelElement.style.removeProperty("width");

            lastPosition = position;
            lastTime = time;
            var percentLeft = 100 * position / dividersElementClientWidth;
            divider.style.left = percentLeft + "%";
            dividerLabelBar.style.left = percentLeft + "%";

            divider = /** @type {?Element} */ (divider.nextSibling);
            dividerLabelBar = /** @type {?Element} */ (dividerLabelBar.nextSibling);
        }

        // Remove extras.
        while (divider) {
            var nextDivider = divider.nextSibling;
            this._dividersElement.removeChild(divider);
            divider = nextDivider;
        }
        while (dividerLabelBar) {
            var nextDivider = dividerLabelBar.nextSibling;
            this._dividersLabelBarElement.removeChild(dividerLabelBar);
            dividerLabelBar = nextDivider;
        }
        return true;
    },

    addEventDivider: function(divider)
    {
        this._eventDividersElement.appendChild(divider);
    },

    addEventDividers: function(dividers)
    {
        this._gridHeaderElement.removeChild(this._eventDividersElement);
        for (var i = 0; i < dividers.length; ++i) {
            if (dividers[i])
                this._eventDividersElement.appendChild(dividers[i]);
        }
        this._gridHeaderElement.appendChild(this._eventDividersElement);
    },

    removeEventDividers: function()
    {
        this._eventDividersElement.removeChildren();
    },

    hideEventDividers: function()
    {
        this._eventDividersElement.classList.add("hidden");
    },

    showEventDividers: function()
    {
        this._eventDividersElement.classList.remove("hidden");
    },

    hideDividers: function()
    {
        this._dividersElement.classList.add("hidden");
    },

    showDividers: function()
    {
        this._dividersElement.classList.remove("hidden");
    },

    hideCurtains: function()
    {
        this._leftCurtainElement.classList.add("hidden");
        this._rightCurtainElement.classList.add("hidden");
    },

    /**
     * @param {number} gapOffset
     * @param {number} gapWidth
     */
    showCurtains: function(gapOffset, gapWidth)
    {
        this._leftCurtainElement.style.width = gapOffset + "px";
        this._leftCurtainElement.classList.remove("hidden");
        this._rightCurtainElement.style.left = (gapOffset + gapWidth) + "px";
        this._rightCurtainElement.classList.remove("hidden");
    },

    setScrollAndDividerTop: function(scrollTop, dividersTop)
    {
        this._dividersLabelBarElement.style.top = scrollTop + "px";
        this._eventDividersElement.style.top = scrollTop + "px";
        this._leftCurtainElement.style.top = scrollTop + "px";
        this._rightCurtainElement.style.top = scrollTop + "px";
    }
}

/**
 * @interface
 */
WebInspector.TimelineGrid.Calculator = function() { }

WebInspector.TimelineGrid.Calculator.prototype = {
    /**
     * @return {number}
     */
    paddingLeft: function() { },

    /**
     * @param {number} time
     * @return {number}
     */
    computePosition: function(time) { },

    /**
     * @param {number} time
     * @param {number=} precision
     * @return {string}
     */
    formatTime: function(time, precision) { },

    /** @return {number} */
    minimumBoundary: function() { },

    /** @return {number} */
    zeroTime: function() { },

    /** @return {number} */
    maximumBoundary: function() { },

    /** @return {number} */
    boundarySpan: function() { }
}
