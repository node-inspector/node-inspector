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
 * @extends {WebInspector.TimelineOverviewBase}
 * @param {!WebInspector.TimelineModel} model
 * @param {!WebInspector.TimelineFrameModelBase} frameModel
 */
WebInspector.TimelineFrameOverview = function(model, frameModel)
{
    WebInspector.TimelineOverviewBase.call(this, model);
    this.element.id = "timeline-overview-frames";
    this._frameModel = frameModel;
    this.reset();

    this._outerPadding = 4 * window.devicePixelRatio;
    this._maxInnerBarWidth = 10 * window.devicePixelRatio;
    this._topPadding = 6 * window.devicePixelRatio;

    // The below two are really computed by update() -- but let's have something so that windowTimes() is happy.
    this._actualPadding = 5 * window.devicePixelRatio;
    this._actualOuterBarWidth = this._maxInnerBarWidth + this._actualPadding;

    this._fillStyles = {};
    var categories = WebInspector.TimelineUIUtils.categories();
    for (var category in categories)
        this._fillStyles[category] = WebInspector.TimelineUIUtils.createFillStyleForCategory(this._context, this._maxInnerBarWidth, 0, categories[category]);

    this._frameTopShadeGradient = this._context.createLinearGradient(0, 0, 0, this._topPadding);
    this._frameTopShadeGradient.addColorStop(0, "rgba(255, 255, 255, 0.9)");
    this._frameTopShadeGradient.addColorStop(1, "rgba(255, 255, 255, 0.2)");
}

WebInspector.TimelineFrameOverview.prototype = {
    /**
     * @param {!WebInspector.OverviewGrid} grid
     */
    setOverviewGrid: function(grid)
    {
        this._overviewGrid = grid;
        this._overviewGrid.element.classList.add("timeline-overview-frames-mode");
    },

    dispose: function()
    {
        this._overviewGrid.element.classList.remove("timeline-overview-frames-mode");
    },

    reset: function()
    {
        this._recordsPerBar = 1;
        /** @type {!Array.<!{startTime:number, endTime:number}>} */
        this._barTimes = [];
    },

    update: function()
    {
        this.resetCanvas();
        this._barTimes = [];

        const minBarWidth = 4 * window.devicePixelRatio;
        var frames = this._frameModel.frames();
        var framesPerBar = Math.max(1, frames.length * minBarWidth / this._canvas.width);
        var visibleFrames = this._aggregateFrames(frames, framesPerBar);

        this._context.save();
        var scale = (this._canvas.height - this._topPadding) / this._computeTargetFrameLength(visibleFrames);
        this._renderBars(visibleFrames, scale, this._canvas.height);
        this._context.fillStyle = this._frameTopShadeGradient;
        this._context.fillRect(0, 0, this._canvas.width, this._topPadding);
        this._drawFPSMarks(scale, this._canvas.height);
        this._context.restore();
    },

    /**
     * @param {!Array.<!WebInspector.TimelineFrame>} frames
     * @param {number} framesPerBar
     * @return {!Array.<!WebInspector.TimelineFrame>}
     */
    _aggregateFrames: function(frames, framesPerBar)
    {
        var visibleFrames = [];
        for (var barNumber = 0, currentFrame = 0; currentFrame < frames.length; ++barNumber) {
            var barStartTime = frames[currentFrame].startTime;
            var longestFrame = null;
            var longestDuration = 0;

            for (var lastFrame = Math.min(Math.floor((barNumber + 1) * framesPerBar), frames.length);
                 currentFrame < lastFrame; ++currentFrame) {
                var duration = frames[currentFrame].duration;
                if (!longestFrame || longestDuration < duration) {
                    longestFrame = frames[currentFrame];
                    longestDuration = duration;
                }
            }
            var barEndTime = frames[currentFrame - 1].endTime;
            if (longestFrame) {
                visibleFrames.push(longestFrame);
                this._barTimes.push({ startTime: barStartTime, endTime: barEndTime });
            }
        }
        return visibleFrames;
    },

    /**
     * @param {!Array.<!WebInspector.TimelineFrame>} frames
     * @return {number}
     */
    _computeTargetFrameLength: function(frames)
    {
        const targetFPS = 20;
        var result = 1000.0 / targetFPS;
        if (!frames.length)
            return result;

        var durations = [];
        for (var i = 0; i < frames.length; ++i) {
            if (frames[i])
                durations.push(frames[i].duration);
        }
        var medianFrameLength = durations.qselect(Math.floor(durations.length / 2));

        // Optimize appearance for 30fps, but leave some space so it's evident when a frame overflows.
        // However, if at least half frames won't fit at this scale, fall back to using autoscale.
        if (result >= medianFrameLength)
            return result;

        var maxFrameLength = Math.max.apply(Math, durations);
        return Math.min(medianFrameLength * 2, maxFrameLength);
    },

    /**
     * @param {!Array.<!WebInspector.TimelineFrame>} frames
     * @param {number} scale
     * @param {number} windowHeight
     */
    _renderBars: function(frames, scale, windowHeight)
    {
        const maxPadding = 5 * window.devicePixelRatio;
        this._actualOuterBarWidth = Math.min((this._canvas.width - 2 * this._outerPadding) / frames.length, this._maxInnerBarWidth + maxPadding);
        this._actualPadding = Math.min(Math.floor(this._actualOuterBarWidth / 3), maxPadding);

        var barWidth = this._actualOuterBarWidth - this._actualPadding;
        for (var i = 0; i < frames.length; ++i) {
            if (frames[i])
                this._renderBar(this._barNumberToScreenPosition(i), barWidth, windowHeight, frames[i], scale);
        }
    },

    /**
     * @param {number} n
     */
    _barNumberToScreenPosition: function(n)
    {
        return this._outerPadding + this._actualOuterBarWidth * n;
    },

    /**
     * @param {number} scale
     * @param {number} height
     */
    _drawFPSMarks: function(scale, height)
    {
        const fpsMarks = [30, 60];

        this._context.save();
        this._context.beginPath();
        this._context.font = (10 * window.devicePixelRatio) + "px " + window.getComputedStyle(this.element, null).getPropertyValue("font-family");
        this._context.textAlign = "right";
        this._context.textBaseline = "alphabetic";

        const labelPadding = 4 * window.devicePixelRatio;
        const baselineHeight = 3 * window.devicePixelRatio;
        var lineHeight = 12 * window.devicePixelRatio;
        var labelTopMargin = 0;
        var labelOffsetY = 0; // Labels are going to be under their grid lines.

        for (var i = 0; i < fpsMarks.length; ++i) {
            var fps = fpsMarks[i];
            // Draw lines one pixel above they need to be, so 60pfs line does not cross most of the frames tops.
            var y = height - Math.floor(1000.0 / fps * scale) - 0.5;
            var label = WebInspector.UIString("%d\u2009fps", fps);
            var labelWidth = this._context.measureText(label).width + 2 * labelPadding;
            var labelX = this._canvas.width;

            if (!i && labelTopMargin < y - lineHeight)
                labelOffsetY = -lineHeight; // Labels are going to be over their grid lines.
            var labelY = y + labelOffsetY;
            if (labelY < labelTopMargin || labelY + lineHeight > height)
                break; // No space for the label, so no line as well.

            this._context.moveTo(0, y);
            this._context.lineTo(this._canvas.width, y);

            this._context.fillStyle = "rgba(255, 255, 255, 0.5)";
            this._context.fillRect(labelX - labelWidth, labelY, labelWidth, lineHeight);
            this._context.fillStyle = "black";
            this._context.fillText(label, labelX - labelPadding, labelY + lineHeight - baselineHeight);
            labelTopMargin = labelY + lineHeight;
        }
        this._context.strokeStyle = "rgba(60, 60, 60, 0.4)";
        this._context.stroke();
        this._context.restore();
    },

    /**
     * @param {number} left
     * @param {number} width
     * @param {number} windowHeight
     * @param {!WebInspector.TimelineFrame} frame
     * @param {number} scale
     */
    _renderBar: function(left, width, windowHeight, frame, scale)
    {
        var categories = Object.keys(WebInspector.TimelineUIUtils.categories());
        var x = Math.floor(left) + 0.5;
        width = Math.floor(width);

        var totalCPUTime = frame.cpuTime;
        var normalizedScale = scale;
        if (totalCPUTime > frame.duration)
            normalizedScale *= frame.duration / totalCPUTime;

        for (var i = 0, bottomOffset = windowHeight; i < categories.length; ++i) {
            var category = categories[i];
            var duration = frame.timeByCategory[category];
            if (!duration)
                continue;
            var height = Math.round(duration * normalizedScale);
            var y = Math.floor(bottomOffset - height) + 0.5;

            this._context.save();
            this._context.translate(x, 0);
            this._context.scale(width / this._maxInnerBarWidth, 1);
            this._context.fillStyle = this._fillStyles[category];
            this._context.fillRect(0, y, this._maxInnerBarWidth, Math.floor(height));
            this._context.strokeStyle = WebInspector.TimelineUIUtils.categories()[category].borderColor;
            this._context.beginPath();
            this._context.moveTo(0, y);
            this._context.lineTo(this._maxInnerBarWidth, y);
            this._context.stroke();
            this._context.restore();

            bottomOffset -= height;
        }
        // Draw a contour for the total frame time.
        var y0 = Math.floor(windowHeight - frame.duration * scale) + 0.5;
        var y1 = windowHeight + 0.5;

        this._context.strokeStyle = "rgba(90, 90, 90, 0.2)";
        this._context.beginPath();
        this._context.moveTo(x, y1);
        this._context.lineTo(x, y0);
        this._context.lineTo(x + width, y0);
        this._context.lineTo(x + width, y1);
        this._context.stroke();
    },

    /**
     * @param {number} windowLeft
     * @param {number} windowRight
     * @return {!{startTime: number, endTime: number}}
     */
    windowTimes: function(windowLeft, windowRight)
    {
        if (!this._barTimes.length)
            return WebInspector.TimelineOverviewBase.prototype.windowTimes.call(this, windowLeft, windowRight);
        var windowSpan = this._canvas.width;
        var leftOffset = windowLeft * windowSpan;
        var rightOffset = windowRight * windowSpan;
        var firstBar = Math.floor(Math.max(leftOffset - this._outerPadding + this._actualPadding, 0) / this._actualOuterBarWidth);
        var lastBar = Math.min(Math.floor(Math.max(rightOffset - this._outerPadding, 0)/ this._actualOuterBarWidth), this._barTimes.length - 1);
        if (firstBar >= this._barTimes.length)
            return {startTime: Infinity, endTime: Infinity};

        const snapTolerancePixels = 3;
        return {
            startTime: leftOffset > snapTolerancePixels ? this._barTimes[firstBar].startTime : this._model.minimumRecordTime(),
            endTime: (rightOffset + snapTolerancePixels > windowSpan) || (lastBar >= this._barTimes.length) ? this._model.maximumRecordTime() : this._barTimes[lastBar].endTime
        }
    },

    /**
     * @param {number} startTime
     * @param {number} endTime
     * @return {!{left: number, right: number}}
     */
    windowBoundaries: function(startTime, endTime)
    {
        if (this._barTimes.length === 0)
            return {left: 0, right: 1};
        /**
         * @param {number} time
         * @param {!{startTime:number, endTime:number}} barTime
         * @return {number}
         */
        function barStartComparator(time, barTime)
        {
            return time - barTime.startTime;
        }
        /**
         * @param {number} time
         * @param {!{startTime:number, endTime:number}} barTime
         * @return {number}
         */
        function barEndComparator(time, barTime)
        {
            // We need a frame where time is in [barTime.startTime, barTime.endTime), so exclude exact matches against endTime.
            if (time === barTime.endTime)
                return 1;
            return time - barTime.endTime;
        }
        return {
            left: this._windowBoundaryFromTime(startTime, barEndComparator),
            right: this._windowBoundaryFromTime(endTime, barStartComparator)
        }
    },

    /**
     * @param {number} time
     * @param {function(number, !{startTime:number, endTime:number}):number} comparator
     */
    _windowBoundaryFromTime: function(time, comparator)
    {
        if (time === Infinity)
            return 1;
        var index = this._firstBarAfter(time, comparator);
        if (!index)
            return 0;
        return (this._barNumberToScreenPosition(index) - this._actualPadding / 2) / this._canvas.width;
    },

    /**
     * @param {number} time
     * @param {function(number, {startTime:number, endTime:number}):number} comparator
     */
    _firstBarAfter: function(time, comparator)
    {
        return insertionIndexForObjectInListSortedByFunction(time, this._barTimes, comparator);
    },

    __proto__: WebInspector.TimelineOverviewBase.prototype
}
