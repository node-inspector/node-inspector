/*
 * Copyright 2015 The Chromium Authors. All rights reserved.
 * Use of this source code is governed by a BSD-style license that can be
 * found in the LICENSE file.
 */

/**
 * @constructor
 * @param {!WebInspector.TracingModel} tracingModel
 * @param {number=} zeroTime
 */
WebInspector.FilmStripModel = function(tracingModel, zeroTime)
{
    this._tracingModel = tracingModel;
    this._zeroTime = zeroTime || tracingModel.minimumRecordTime();

    /** @type {!Array<!WebInspector.FilmStripModel.Frame>} */
    this._frames = [];

    var browserProcess = tracingModel.processByName("Browser");
    if (!browserProcess)
        return;
    var mainThread = browserProcess.threadByName("CrBrowserMain");
    if (!mainThread)
        return;

    var events = mainThread.events();
    for (var i = 0; i < events.length; ++i) {
        var event = events[i];
        if (event.startTime < this._zeroTime)
            continue;
        if (!event.hasCategory(WebInspector.FilmStripModel._category))
            continue;
        if (event.name === WebInspector.FilmStripModel.TraceEvents.CaptureFrame) {
            var data = event.args["data"];
            if (data)
                this._frames.push(WebInspector.FilmStripModel.Frame._fromEvent(this, event, this._frames.length));
        } else if (event.name === WebInspector.FilmStripModel.TraceEvents.Screenshot) {
            this._frames.push(WebInspector.FilmStripModel.Frame._fromSnapshot(this, /** @type {!WebInspector.TracingModel.ObjectSnapshot} */ (event), this._frames.length));
        }
    }
}

WebInspector.FilmStripModel._category = "disabled-by-default-devtools.screenshot";

WebInspector.FilmStripModel.TraceEvents = {
    CaptureFrame: "CaptureFrame",
    Screenshot: "Screenshot"
}

WebInspector.FilmStripModel.prototype = {
    /**
     * @return {!Array<!WebInspector.FilmStripModel.Frame>}
     */
    frames: function()
    {
        return this._frames;
    },

    /**
     * @return {number}
     */
    zeroTime: function()
    {
        return this._zeroTime;
    },

    /**
     * @param {number} timestamp
     * @return {?WebInspector.FilmStripModel.Frame}
     */
    frameByTimestamp: function(timestamp)
    {
        /**
         * @param {number} timestamp
         * @param {!WebInspector.FilmStripModel.Frame} frame
         * @return {number}
         */
        function comparator(timestamp, frame)
        {
            return timestamp - frame.timestamp;
        }
        var index = this._frames.lowerBound(timestamp, comparator);
        return index < this._frames.length ? this._frames[index] : null;
    }
}

/**
 * @constructor
 * @param {!WebInspector.FilmStripModel} model
 * @param {number} timestamp
 * @param {number} index
 */
WebInspector.FilmStripModel.Frame = function(model, timestamp, index)
{
    this._model = model;
    this.timestamp = timestamp;
    this.index = index;
    /** @type {?string} */
    this._imageData = null;
    /** @type {?WebInspector.TracingModel.ObjectSnapshot} */
    this._snapshot = null;
}

/**
 * @param {!WebInspector.FilmStripModel} model
 * @param {!WebInspector.TracingModel.Event} event
 * @param {number} index
 * @return {!WebInspector.FilmStripModel.Frame}
 */
WebInspector.FilmStripModel.Frame._fromEvent = function(model, event, index)
{
    var frame = new WebInspector.FilmStripModel.Frame(model, event.startTime, index);
    frame._imageData = event.args["data"];
    return frame;
}

/**
 * @param {!WebInspector.FilmStripModel} model
 * @param {!WebInspector.TracingModel.ObjectSnapshot} snapshot
 * @param {number} index
 * @return {!WebInspector.FilmStripModel.Frame}
 */
WebInspector.FilmStripModel.Frame._fromSnapshot = function(model, snapshot, index)
{
    var frame = new WebInspector.FilmStripModel.Frame(model, snapshot.startTime, index);
    frame._snapshot = snapshot;
    return frame;
}

WebInspector.FilmStripModel.Frame.prototype = {
    /**
     * @return {!WebInspector.FilmStripModel}
     */
    model: function()
    {
        return this._model;
    },

    /**
     * @return {!Promise<?string>}
     */
    imageDataPromise: function()
    {
        if (this._imageData || !this._snapshot)
            return Promise.resolve(this._imageData);

        return /** @type {!Promise<?string>} */ (this._snapshot.objectPromise());
    }
}
