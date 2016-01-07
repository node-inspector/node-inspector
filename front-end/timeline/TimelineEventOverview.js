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
 * @param {string} id
 * @param {?string} title
 * @param {!WebInspector.TimelineModel} model
 */
WebInspector.TimelineEventOverview = function(id, title, model)
{
    WebInspector.TimelineOverviewBase.call(this);
    this.element.id = "timeline-overview-" + id;
    this.element.classList.add("overview-strip");
    if (title) {
        this._placeholder = this.element.createChild("div", "timeline-overview-strip-placeholder");
        this._placeholder.textContent = title;
    }
    this._model = model;
}

WebInspector.TimelineEventOverview.prototype = {

    /**
     * @override
     */
    update: function()
    {
        WebInspector.TimelineOverviewBase.prototype.update.call(this);
        if (this._placeholder)
            this._placeholder.classList.toggle("hidden", !this._model.isEmpty());
    },

    /**
     * @param {number} begin
     * @param {number} end
     * @param {number} position
     * @param {number} height
     * @param {string} color
     */
    _renderBar: function(begin, end, position, height, color)
    {
        var x = begin;
        var width = end - begin;
        this._context.fillStyle = color;
        this._context.fillRect(x, position, width, height);
    },

    /**
     * @override
     * @param {number} windowLeft
     * @param {number} windowRight
     * @return {!{startTime: number, endTime: number}}
     */
    windowTimes: function(windowLeft, windowRight)
    {
        var absoluteMin = this._model.minimumRecordTime();
        var timeSpan = this._model.maximumRecordTime() - absoluteMin;
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
        var absoluteMin = this._model.minimumRecordTime();
        var timeSpan = this._model.maximumRecordTime() - absoluteMin;
        var haveRecords = absoluteMin > 0;
        return {
            left: haveRecords && startTime ? Math.min((startTime - absoluteMin) / timeSpan, 1) : 0,
            right: haveRecords && endTime < Infinity ? (endTime - absoluteMin) / timeSpan : 1
        };
    },

    __proto__: WebInspector.TimelineOverviewBase.prototype
}

/**
 * @constructor
 * @extends {WebInspector.TimelineEventOverview}
 * @param {!WebInspector.TimelineModel} model
 */
WebInspector.TimelineEventOverview.Input = function(model)
{
    WebInspector.TimelineEventOverview.call(this, "input", WebInspector.UIString("Input"), model);
}

WebInspector.TimelineEventOverview.Input.prototype = {
    /**
     * @override
     */
    update: function()
    {
        WebInspector.TimelineEventOverview.prototype.update.call(this);
        var events = this._model.mainThreadEvents();
        var height = this._canvas.height;
        var descriptors = WebInspector.TimelineUIUtils.eventDispatchDesciptors();
        /** @type {!Map.<string,!WebInspector.TimelineUIUtils.EventDispatchTypeDescriptor>} */
        var descriptorsByType = new Map();
        var maxPriority = -1;
        for (var descriptor of descriptors) {
            for (var type of descriptor.eventTypes)
                descriptorsByType.set(type, descriptor);
            maxPriority = Math.max(maxPriority, descriptor.priority);
        }

        var /** @const */ minWidth = 2 * window.devicePixelRatio;
        var timeOffset = this._model.minimumRecordTime();
        var timeSpan = this._model.maximumRecordTime() - timeOffset;
        var canvasWidth = this._canvas.width;
        var scale = canvasWidth / timeSpan;

        for (var priority = 0; priority <= maxPriority; ++priority) {
            for (var i = 0; i < events.length; ++i) {
                var event = events[i];
                if (event.name !== WebInspector.TimelineModel.RecordType.EventDispatch)
                    continue;
                var descriptor = descriptorsByType.get(event.args["data"]["type"]);
                if (!descriptor || descriptor.priority !== priority)
                    continue;
                var start = Number.constrain(Math.floor((event.startTime - timeOffset) * scale), 0, canvasWidth);
                var end = Number.constrain(Math.ceil((event.endTime - timeOffset) * scale), 0, canvasWidth);
                var width = Math.max(end - start, minWidth);
                this._renderBar(start, start + width, 0, height, descriptor.color);
            }
        }
    },

    __proto__: WebInspector.TimelineEventOverview.prototype
}

/**
 * @constructor
 * @extends {WebInspector.TimelineEventOverview}
 * @param {!WebInspector.TimelineModel} model
 */
WebInspector.TimelineEventOverview.Network = function(model)
{
    WebInspector.TimelineEventOverview.call(this, "network", WebInspector.UIString("Network"), model);
}

WebInspector.TimelineEventOverview.Network.prototype = {
    /**
     * @override
     */
    update: function()
    {
        WebInspector.TimelineEventOverview.prototype.update.call(this);
        var height = this._canvas.height;
        var numBands = categoryBand(WebInspector.TimelineUIUtils.NetworkCategory.Other) + 1;
        var bandHeight = height / numBands;
        if (bandHeight % 1) {
            console.error("Network strip height should be a multiple of the categories number");
            bandHeight = Math.floor(bandHeight);
        }
        var devicePixelRatio = window.devicePixelRatio;
        var timeOffset = this._model.minimumRecordTime();
        var timeSpan = this._model.maximumRecordTime() - timeOffset;
        var canvasWidth = this._canvas.width;
        var scale = canvasWidth / timeSpan;
        var ctx = this._context;
        var requests = this._model.networkRequests();
        /** @type {!Map<string,!{waiting:!Path2D,transfer:!Path2D}>} */
        var paths = new Map();
        requests.forEach(drawRequest);
        for (var path of paths) {
            ctx.fillStyle = path[0];
            ctx.globalAlpha = 0.3;
            ctx.fill(path[1]["waiting"]);
            ctx.globalAlpha = 1;
            ctx.fill(path[1]["transfer"]);
        }

        /**
         * @param {!WebInspector.TimelineUIUtils.NetworkCategory} category
         * @return {number}
         */
        function categoryBand(category)
        {
            var categories = WebInspector.TimelineUIUtils.NetworkCategory;
            switch (category) {
            case categories.HTML: return 0;
            case categories.Script: return 1;
            case categories.Style: return 2;
            case categories.Media: return 3;
            default: return 4;
            }
        }

        /**
         * @param {!WebInspector.TimelineModel.NetworkRequest} request
         */
        function drawRequest(request)
        {
            var tickWidth = 2 * devicePixelRatio;
            var category = WebInspector.TimelineUIUtils.networkRequestCategory(request);
            var style = WebInspector.TimelineUIUtils.networkCategoryColor(category);
            var band = categoryBand(category);
            var y = band * bandHeight;
            var path = paths.get(style);
            if (!path) {
                path = { waiting: new Path2D(), transfer: new Path2D() };
                paths.set(style, path);
            }
            var s = Math.max(Math.floor((request.startTime - timeOffset) * scale), 0);
            var e = Math.min(Math.ceil((request.endTime - timeOffset) * scale), canvasWidth);
            path["waiting"].rect(s, y, e - s, bandHeight - 1);
            path["transfer"].rect(e - tickWidth / 2, y, tickWidth, bandHeight - 1);
            if (!request.responseTime)
                return;
            var r = Math.ceil((request.responseTime - timeOffset) * scale);
            path["transfer"].rect(r - tickWidth / 2, y, tickWidth, bandHeight - 1);
        }
    },

    __proto__: WebInspector.TimelineEventOverview.prototype
}

/**
 * @constructor
 * @extends {WebInspector.TimelineEventOverview}
 * @param {!WebInspector.TimelineModel} model
 */
WebInspector.TimelineEventOverview.CPUActivity = function(model)
{
    WebInspector.TimelineEventOverview.call(this, "cpu-activity", WebInspector.UIString("CPU"), model);
    this._fillStyles = {};
    var categories = WebInspector.TimelineUIUtils.categories();
    for (var category in categories) {
        this._fillStyles[category] = categories[category].fillColorStop1;
        categories[category].addEventListener(WebInspector.TimelineCategory.Events.VisibilityChanged, this._onCategoryVisibilityChanged, this);
    }
    this._disabledCategoryFillStyle = "hsl(0, 0%, 67%)";
    this._backgroundCanvas = this.element.createChild("canvas", "fill background");
}

WebInspector.TimelineEventOverview.CPUActivity.prototype = {
    /**
     * @override
     */
    dispose: function()
    {
        WebInspector.TimelineOverviewBase.prototype.dispose.call(this);
        var categories = WebInspector.TimelineUIUtils.categories();
        for (var category in categories)
            categories[category].removeEventListener(WebInspector.TimelineCategory.Events.VisibilityChanged, this._onCategoryVisibilityChanged, this);
    },

    _onCategoryVisibilityChanged: function()
    {
        this.update();
    },

    /**
     * @param {!WebInspector.TimelineCategory} category
     * @return {string}
     */
    _categoryColor: function(category)
    {
        return category.hidden ? this._disabledCategoryFillStyle : this._fillStyles[category.name];
    },

    /**
     * @override
     */
    resetCanvas: function()
    {
        WebInspector.TimelineEventOverview.prototype.resetCanvas.call(this);
        this._backgroundCanvas.width = this.element.clientWidth * window.devicePixelRatio;
        this._backgroundCanvas.height = this.element.clientHeight * window.devicePixelRatio;
    },

    /**
     * @override
     */
    update: function()
    {
        WebInspector.TimelineEventOverview.prototype.update.call(this);
        var /** @const */ quantSizePx = 4 * window.devicePixelRatio;
        var width = this._canvas.width;
        var height = this._canvas.height;
        var baseLine = height;
        var timeOffset = this._model.minimumRecordTime();
        var timeSpan = this._model.maximumRecordTime() - timeOffset;
        var scale = width / timeSpan;
        var quantTime = quantSizePx / scale;
        var categories = WebInspector.TimelineUIUtils.categories();
        var categoryOrder = ["idle", "loading", "painting", "rendering", "scripting", "other"];
        var otherIndex = categoryOrder.indexOf("other");
        var idleIndex = 0;
        console.assert(idleIndex === categoryOrder.indexOf("idle"));
        for (var i = idleIndex + 1; i < categoryOrder.length; ++i)
            categories[categoryOrder[i]]._overviewIndex = i;

        var backgroundContext = this._backgroundCanvas.getContext("2d");
        for (var thread of this._model.virtualThreads())
            drawThreadEvents.call(this, backgroundContext, thread.events);
        applyPattern(backgroundContext);
        drawThreadEvents.call(this, this._context, this._model.mainThreadEvents());

        /**
         * @param {!CanvasRenderingContext2D} ctx
         * @param {!Array<!WebInspector.TracingModel.Event>} events
         * @this {WebInspector.TimelineEventOverview}
         */
        function drawThreadEvents(ctx, events)
        {
            var quantizer = new WebInspector.Quantizer(timeOffset, quantTime, drawSample);
            var x = 0;
            var categoryIndexStack = [];
            var paths = [];
            var lastY = [];
            for (var i = 0; i < categoryOrder.length; ++i) {
                paths[i] = new Path2D();
                paths[i].moveTo(0, height);
                lastY[i] = height;
            }

            /**
             * @param {!Array<number>} counters
             */
            function drawSample(counters)
            {
                var y = baseLine;
                for (var i = idleIndex + 1; i < categoryOrder.length; ++i) {
                    var h = (counters[i] || 0) / quantTime * height;
                    y -= h;
                    paths[i].bezierCurveTo(x, lastY[i], x, y, x + quantSizePx / 2, y);
                    lastY[i] = y;
                }
                x += quantSizePx;
            }

            /**
             * @param {!WebInspector.TracingModel.Event} e
             */
            function onEventStart(e)
            {
                var index = categoryIndexStack.length ? categoryIndexStack.peekLast() : idleIndex;
                quantizer.appendInterval(e.startTime, index);
                categoryIndexStack.push(WebInspector.TimelineUIUtils.eventStyle(e).category._overviewIndex || otherIndex);
            }

            /**
             * @param {!WebInspector.TracingModel.Event} e
             */
            function onEventEnd(e)
            {
                quantizer.appendInterval(e.endTime, categoryIndexStack.pop());
            }

            WebInspector.TimelineModel.forEachEvent(events, onEventStart, onEventEnd);
            quantizer.appendInterval(timeOffset + timeSpan + quantTime, idleIndex);  // Kick drawing the last bucket.
            for (var i = categoryOrder.length - 1; i > 0; --i) {
                paths[i].lineTo(width, height);
                ctx.fillStyle = this._categoryColor(categories[categoryOrder[i]]);
                ctx.fill(paths[i]);
            }
        }

        /**
         * @param {!CanvasRenderingContext2D} ctx
         */
        function applyPattern(ctx)
        {
            var step = 4 * window.devicePixelRatio;
            ctx.save();
            ctx.lineWidth = step / 2;
            for (var i = 0; i < width + height; i += step) {
                ctx.moveTo(i, 0);
                ctx.lineTo(i - height, height);
            }
            ctx.globalCompositeOperation = "destination-out";
            ctx.stroke();
            ctx.restore();
        }
    },

    __proto__: WebInspector.TimelineEventOverview.prototype
}

/**
 * @constructor
 * @extends {WebInspector.TimelineEventOverview}
 * @param {!WebInspector.TimelineModel} model
 * @param {!WebInspector.TimelineFrameModelBase} frameModel
 */
WebInspector.TimelineEventOverview.Responsiveness = function(model, frameModel)
{
    WebInspector.TimelineEventOverview.call(this, "responsiveness", null, model)
    this._frameModel = frameModel;
}

WebInspector.TimelineEventOverview.Responsiveness.prototype = {
    /**
     * @override
     */
    update: function()
    {
        WebInspector.TimelineEventOverview.prototype.update.call(this);
        var height = this._canvas.height;
        var timeOffset = this._model.minimumRecordTime();
        var timeSpan = this._model.maximumRecordTime() - timeOffset;
        var scale = this._canvas.width / timeSpan;
        var frames = this._frameModel.frames();
        var ctx = this._context;
        var fillPath = new Path2D();
        var markersPath = new Path2D();
        for (var i = 0; i < frames.length; ++i) {
            var frame = frames[i];
            if (!frame.hasWarnings())
                continue;
            paintWarningDecoration(frame.startTime, frame.duration);
        }

        var events = this._model.mainThreadEvents();
        for (var i = 0; i < events.length; ++i) {
            if (!events[i].warning)
                continue;
            paintWarningDecoration(events[i].startTime, events[i].duration);
        }

        ctx.fillStyle = "hsl(0, 80%, 90%)";
        ctx.strokeStyle = "red";
        ctx.lineWidth = 2 * window.devicePixelRatio;
        ctx.fill(fillPath);
        ctx.stroke(markersPath);

        /**
         * @param {number} time
         * @param {number} duration
         */
        function paintWarningDecoration(time, duration)
        {
            var x = Math.round(scale * (time - timeOffset));
            var w = Math.round(scale * duration);
            fillPath.rect(x, 0, w, height);
            markersPath.moveTo(x + w, 0);
            markersPath.lineTo(x + w, height);
        }
    },

    __proto__: WebInspector.TimelineEventOverview.prototype
}

/**
 * @constructor
 * @extends {WebInspector.TimelineEventOverview}
 * @param {!WebInspector.TimelineModel} model
 * @param {!WebInspector.TracingModel} tracingModel
 */
WebInspector.TimelineFilmStripOverview = function(model, tracingModel)
{
    WebInspector.TimelineEventOverview.call(this, "filmstrip", "Screenshots", model);
    this._tracingModel = tracingModel;
    this.reset();
}

WebInspector.TimelineFilmStripOverview.prototype = {
    /**
     * @override
     */
    update: function()
    {
        WebInspector.TimelineEventOverview.prototype.update.call(this);
        if (!this._filmStripModel)
            return;
        var frames = this._filmStripModel.frames();
        if (!frames.length)
            return;

        if (this._imageWidth) {
            this._drawFrames();
            return;
        }

        this._imageByFrame(frames[0])
            .then(calculateWidth.bind(this))
            .then(this._drawFrames.bind(this));

        /**
         * @this {WebInspector.TimelineFilmStripOverview}
         * @param {!HTMLImageElement} image
         */
        function calculateWidth(image)
        {
            var naturalHeight = image.naturalHeight;
            if (!naturalHeight)
                return;
            var naturalWidth = image.naturalWidth;
            this._imageHeight = this._canvas.height - 10
            this._imageWidth = Math.floor(this._imageHeight * naturalWidth / naturalHeight);
        }
    },

    /**
     * @param {!WebInspector.FilmStripModel.Frame} frame
     * @return {!Promise<!HTMLImageElement>}
     */
    _imageByFrame: function(frame)
    {
        var imagePromise = this._frameToImagePromise.get(frame);
        if (!imagePromise) {
            imagePromise = frame.imageDataPromise().then(createImage);
            this._frameToImagePromise.set(frame, imagePromise);
        }
        return imagePromise;

        /**
         * @param {?string} data
         * @return {!HTMLImageElement}
         */
        function createImage(data)
        {
            var image = /** @type {!HTMLImageElement} */ (createElement("img"));
            if (data)
                image.src = "data:image/jpg;base64," + data;
            return image;
        }
    },

    _drawFrames: function()
    {
        if (!this._filmStripModel || !this._imageWidth)
            return;
        if (!this._filmStripModel.frames().length)
            return;
        var width = this._canvas.width;
        var zeroTime = this._tracingModel.minimumRecordTime();
        var spanTime = this._tracingModel.maximumRecordTime() - zeroTime;
        var scale = spanTime / width;
        var context = this._canvas.getContext("2d");

        context.beginPath();
        for (var x = 0; x < width; x += this._imageWidth + 5) {
            var time = zeroTime + (x + this._imageWidth / 2)* scale;
            var frame = this._frameByTime(time);
            context.rect(x + 0.5, 3.5, this._imageWidth + 1, this._imageHeight + 1);
            this._imageByFrame(frame).then(drawFrameImage.bind(null, x, this._imageWidth, this._imageHeight));
        }
        context.strokeStyle = "#ddd";
        context.stroke();

        /**
         * @param {number} x
         * @param {number} width
         * @param {number} height
         * @param {!HTMLImageElement} image
         */
        function drawFrameImage(x, width, height, image)
        {
            context.drawImage(image, x + 1, 4, width, height);
        }
    },

    /**
     * @param {number} time
     * @return {!WebInspector.FilmStripModel.Frame}
     */
    _frameByTime: function(time)
    {
        /**
         * @param {number} time
         * @param {!WebInspector.FilmStripModel.Frame} frame
         * @return {number}
         */
        function comparator(time, frame)
        {
            return time - frame.timestamp;
        }
        // Using the first frame to fill the interval between recording start
        // and a moment the frame is taken.
        var frames = this._filmStripModel.frames();
        var index = Math.max(frames.upperBound(time, comparator) - 1, 0);
        return frames[index];
    },

    /**
     * @override
     * @param {number} x
     * @return {!Promise<?Element>}
     */
    popoverElementPromise: function(x)
    {
        if (!this._filmStripModel || !this._filmStripModel.frames().length)
            return Promise.resolve(/** @type {?Element} */ (null));

        var time = this._calculator.positionToTime(x);
        var frame = this._frameByTime(time);
        if (frame === this._lastFrame)
            return Promise.resolve(this._lastElement);
        return this._imageByFrame(frame).then(createFrameElement.bind(this));

        /**
         * @this {WebInspector.TimelineFilmStripOverview}
         * @param {!HTMLImageElement} image
         * @return {?Element}
         */
        function createFrameElement(image)
        {
            var element = createElementWithClass("div", "frame");
            element.createChild("div", "thumbnail").appendChild(image);
            element.appendChild(WebInspector.Widget.createStyleElement("timeline/timelinePanel.css"));
            this._lastFrame = frame;
            this._lastElement = element;
            return element;
        }
    },

    /**
     * @override
     */
    reset: function()
    {
        this._lastFrame = null;
        this._lastElement = null;
        this._filmStripModel = new WebInspector.FilmStripModel(this._tracingModel);
        /** @type {!Map<!WebInspector.FilmStripModel.Frame,!Promise<!HTMLImageElement>>} */
        this._frameToImagePromise = new Map();
        this._imageWidth = 0;
    },

    __proto__: WebInspector.TimelineEventOverview.prototype
}

/**
 * @constructor
 * @extends {WebInspector.TimelineEventOverview}
 * @param {!WebInspector.TimelineModel} model
 * @param {!WebInspector.TimelineFrameModelBase} frameModel
 */
WebInspector.TimelineEventOverview.Frames = function(model, frameModel)
{
    WebInspector.TimelineEventOverview.call(this, "framerate", "Framerate", model);
    this._frameModel = frameModel;
}

WebInspector.TimelineEventOverview.Frames.prototype = {
    /**
     * @override
     */
    update: function()
    {
        WebInspector.TimelineEventOverview.prototype.update.call(this);
        var height = this._canvas.height;
        var /** @const */ padding = 1 * window.devicePixelRatio;
        var /** @const */ baseFrameDurationMs = 1e3 / 60;
        var visualHeight = height - 2 * padding;
        var timeOffset = this._model.minimumRecordTime();
        var timeSpan = this._model.maximumRecordTime() - timeOffset;
        var scale = this._canvas.width / timeSpan;
        var frames = this._frameModel.frames();
        var baseY = height - padding;
        var ctx = this._context;
        var bottomY = baseY + 10 * window.devicePixelRatio;
        var y = bottomY;
        if (!frames.length)
            return;

        var lineWidth = window.devicePixelRatio;
        var offset = lineWidth & 1 ? 0.5 : 0;
        var tickDepth = 1.5 * window.devicePixelRatio;
        ctx.beginPath();
        ctx.moveTo(0, y);
        for (var i = 0; i < frames.length; ++i) {
            var frame = frames[i];
            var x = Math.round((frame.startTime - timeOffset) * scale) + offset;
            ctx.lineTo(x, y);
            ctx.lineTo(x, y + tickDepth);
            y = frame.idle ? bottomY : Math.round(baseY - visualHeight * Math.min(baseFrameDurationMs / frame.duration, 1)) - offset;
            ctx.lineTo(x, y + tickDepth);
            ctx.lineTo(x, y);
        }
        if (frames.length) {
            var lastFrame = frames.peekLast();
            var x = Math.round((lastFrame.startTime + lastFrame.duration - timeOffset) * scale) + offset;
            ctx.lineTo(x, y);
        }
        ctx.lineTo(x, bottomY);
        ctx.fillStyle = "hsl(110, 50%, 88%)";
        ctx.strokeStyle = "hsl(110, 50%, 60%)";
        ctx.lineWidth = lineWidth;
        ctx.fill();
        ctx.stroke();
    },

    __proto__: WebInspector.TimelineEventOverview.prototype
}

/**
 * @constructor
 * @extends {WebInspector.TimelineEventOverview}
 * @param {!WebInspector.TimelineModel} model
 */
WebInspector.TimelineEventOverview.Memory = function(model)
{
    WebInspector.TimelineEventOverview.call(this, "memory", "Memory", model);
    this._heapSizeLabel = this.element.createChild("div", "memory-graph-label");
}

WebInspector.TimelineEventOverview.Memory.prototype = {
    resetHeapSizeLabels: function()
    {
        this._heapSizeLabel.textContent = "";
    },

    /**
     * @override
     */
    update: function()
    {
        WebInspector.TimelineEventOverview.prototype.update.call(this);
        var ratio = window.devicePixelRatio;

        var events = this._model.mainThreadEvents();
        if (!events.length) {
            this.resetHeapSizeLabels();
            return;
        }

        var lowerOffset = 3 * ratio;
        var maxUsedHeapSize = 0;
        var minUsedHeapSize = 100000000000;
        var minTime = this._model.minimumRecordTime();
        var maxTime = this._model.maximumRecordTime();
        /**
         * @param {!WebInspector.TracingModel.Event} event
         * @return {boolean}
         */
        function isUpdateCountersEvent(event)
        {
            return event.name === WebInspector.TimelineModel.RecordType.UpdateCounters;
        }
        events = events.filter(isUpdateCountersEvent);
        /**
         * @param {!WebInspector.TracingModel.Event} event
         */
        function calculateMinMaxSizes(event)
        {
            var counters = event.args.data;
            if (!counters || !counters.jsHeapSizeUsed)
                return;
            maxUsedHeapSize = Math.max(maxUsedHeapSize, counters.jsHeapSizeUsed);
            minUsedHeapSize = Math.min(minUsedHeapSize, counters.jsHeapSizeUsed);
        }
        events.forEach(calculateMinMaxSizes);
        minUsedHeapSize = Math.min(minUsedHeapSize, maxUsedHeapSize);

        var lineWidth = 1;
        var width = this._canvas.width;
        var height = this._canvas.height - lowerOffset;
        var xFactor = width / (maxTime - minTime);
        var yFactor = (height - lineWidth) / Math.max(maxUsedHeapSize - minUsedHeapSize, 1);

        var histogram = new Array(width);

        /**
         * @param {!WebInspector.TracingModel.Event} event
         */
        function buildHistogram(event)
        {
            var counters = event.args.data;
            if (!counters || !counters.jsHeapSizeUsed)
                return;
            var x = Math.round((event.startTime - minTime) * xFactor);
            var y = Math.round((counters.jsHeapSizeUsed - minUsedHeapSize) * yFactor);
            histogram[x] = Math.max(histogram[x] || 0, y);
        }
        events.forEach(buildHistogram);

        var ctx = this._context;
        var heightBeyondView = height + lowerOffset + lineWidth;

        ctx.translate(0.5, 0.5);
        ctx.beginPath();
        ctx.moveTo(-lineWidth, heightBeyondView);
        var y = 0;
        var isFirstPoint = true;
        var lastX = 0;
        for (var x = 0; x < histogram.length; x++) {
            if (typeof histogram[x] === "undefined")
                continue;
            if (isFirstPoint) {
                isFirstPoint = false;
                y = histogram[x];
                ctx.lineTo(-lineWidth, height - y);
            }
            var nextY = histogram[x];
            if (Math.abs(nextY - y) > 2 && Math.abs(x - lastX) > 1)
                ctx.lineTo(x, height - y);
            y = nextY;
            ctx.lineTo(x, height - y);
            lastX = x;
        }
        ctx.lineTo(width + lineWidth, height - y);
        ctx.lineTo(width + lineWidth, heightBeyondView);
        ctx.closePath();

        ctx.fillStyle = "hsla(220, 90%, 70%, 0.2)";
        ctx.fill();
        ctx.lineWidth = lineWidth;
        ctx.strokeStyle = "hsl(220, 90%, 70%)";
        ctx.stroke();

        this._heapSizeLabel.textContent = WebInspector.UIString("%s \u2013 %s", Number.bytesToString(minUsedHeapSize), Number.bytesToString(maxUsedHeapSize));
    },

    __proto__: WebInspector.TimelineEventOverview.prototype
}

/**
 * @constructor
 * @param {number} startTime
 * @param {number} quantDuration
 * @param {function(!Array<number>)} callback
 */
WebInspector.Quantizer = function(startTime, quantDuration, callback)
{
    this._lastTime = startTime;
    this._quantDuration = quantDuration;
    this._callback = callback;
    this._counters = [];
    this._remainder = quantDuration;
}

WebInspector.Quantizer.prototype = {
    /**
     * @param {number} time
     * @param {number} group
     */
    appendInterval: function(time, group)
    {
        var interval = time - this._lastTime;
        if (interval <= this._remainder) {
            this._counters[group] = (this._counters[group] || 0) + interval;
            this._remainder -= interval;
            this._lastTime = time;
            return;
        }
        this._counters[group] = (this._counters[group] || 0) + this._remainder;
        this._callback(this._counters);
        interval -= this._remainder;
        while (interval >= this._quantDuration) {
            var counters = [];
            counters[group] = this._quantDuration;
            this._callback(counters);
            interval -= this._quantDuration;
        }
        this._counters = [];
        this._counters[group] = interval;
        this._lastTime = time;
        this._remainder = this._quantDuration - interval;
    }
}
