// Copyright 2014 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

/**
 * @constructor
 * @extends {WebInspector.SplitView}
 */
WebInspector.TimelinePaintProfilerView = function()
{
    WebInspector.SplitView.call(this, false, false);
    this.element.classList.add("timeline-paint-profiler-view");

    this.setSidebarSize(60);
    this.setResizable(false);
    this._logAndImageSplitView = new WebInspector.SplitView(true, false);
    this._logAndImageSplitView.element.classList.add("timeline-paint-profiler-log-split");
    this.setMainView(this._logAndImageSplitView);
    this._imageView = new WebInspector.TimelinePaintImageView();
    this._logAndImageSplitView.setMainView(this._imageView);

    this._paintProfilerView = new WebInspector.PaintProfilerView(this._imageView.showImage.bind(this._imageView));
    this._paintProfilerView.addEventListener(WebInspector.PaintProfilerView.Events.WindowChanged, this._onWindowChanged, this);
    this.setSidebarView(this._paintProfilerView);

    this._logTreeView = new WebInspector.PaintProfilerCommandLogView();
    this._logAndImageSplitView.setSidebarView(this._logTreeView);
}

WebInspector.TimelinePaintProfilerView.prototype = {
    wasShown: function()
    {
        if (this._updateWhenVisible) {
            this._updateWhenVisible = false;
            this._update();
        }
    },

    /**
     * @param {?WebInspector.Target} target
     * @param {string} encodedPicture
     */
    setPicture: function(target, encodedPicture)
    {
        this._disposeSnapshot();
        this._picture = encodedPicture;
        this._target = target;
        if (this.isShowing())
            this._update();
        else
            this._updateWhenVisible = true;
    },

    _update: function()
    {
        this._logTreeView.setCommandLog(null, []);
        this._paintProfilerView.setSnapshotAndLog(null, []);
        if (!this._target)
            return;
        WebInspector.PaintProfilerSnapshot.load(this._target, this._picture, onSnapshotLoaded.bind(this));
        /**
         * @param {?WebInspector.PaintProfilerSnapshot} snapshot
         * @this WebInspector.TimelinePaintProfilerView
         */
        function onSnapshotLoaded(snapshot)
        {
            this._disposeSnapshot();
            this._lastLoadedSnapshot = snapshot;
            snapshot.commandLog(onCommandLogDone.bind(this, snapshot));
        }

        /**
         * @param {!WebInspector.PaintProfilerSnapshot=} snapshot
         * @param {!Array.<!WebInspector.PaintProfilerLogItem>=} log
         * @this {WebInspector.TimelinePaintProfilerView}
         */
        function onCommandLogDone(snapshot, log)
        {
            this._logTreeView.setCommandLog(snapshot.target(), log);
            this._paintProfilerView.setSnapshotAndLog(snapshot || null, log || []);
        }
    },

    _disposeSnapshot: function()
    {
        if (!this._lastLoadedSnapshot)
            return;
        this._lastLoadedSnapshot.dispose();
        this._lastLoadedSnapshot = null;
    },

    _onWindowChanged: function()
    {
        var window = this._paintProfilerView.windowBoundaries();
        this._logTreeView.updateWindow(window.left, window.right);
    },

    __proto__: WebInspector.SplitView.prototype
};

/**
 * @constructor
 * @extends {WebInspector.View}
 */
WebInspector.TimelinePaintImageView = function()
{
    WebInspector.View.call(this);
    this.element.classList.add("fill", "paint-profiler-image-view");
    this._imageElement = this.element.createChild("img");
    this._imageElement.addEventListener("load", this._updateImagePosition.bind(this), false);

    this._transformController = new WebInspector.TransformController(this.element, true);
    this._transformController.addEventListener(WebInspector.TransformController.Events.TransformChanged, this._updateImagePosition, this);
}

WebInspector.TimelinePaintImageView.prototype = {
    onResize: function()
    {
        if (this._imageElement.src)
            this._updateImagePosition();
    },

    _updateImagePosition: function()
    {
        var width = this._imageElement.naturalWidth;
        var height = this._imageElement.naturalHeight;
        var clientWidth = this.element.clientWidth;
        var clientHeight = this.element.clientHeight;

        var paddingFraction = 0.1;
        var paddingX = clientWidth * paddingFraction;
        var paddingY = clientHeight * paddingFraction;
        var scaleX = (clientWidth - paddingX) / width;
        var scaleY = (clientHeight - paddingY) / height;
        var scale = Math.min(scaleX, scaleY);

        this._transformController.setScaleConstraints(0.5, 10 / scale);
        var matrix = new WebKitCSSMatrix()
            .scale(this._transformController.scale(), this._transformController.scale())
            .translate(clientWidth / 2, clientHeight / 2)
            .scale(scale, scale)
            .translate(-width / 2, -height / 2);
        var bounds = WebInspector.Geometry.boundsForTransformedPoints(matrix, [0, 0, 0, width, height, 0]);
        this._transformController.clampOffsets(paddingX - bounds.maxX, clientWidth - paddingX - bounds.minX,
            paddingY - bounds.maxY, clientHeight - paddingY - bounds.minY);
        matrix = new WebKitCSSMatrix().translate(this._transformController.offsetX(), this._transformController.offsetY()).multiply(matrix);
        this._imageElement.style.webkitTransform = matrix.toString();
    },

    /**
     * @param {string=} imageURL
     */
    showImage: function(imageURL)
    {
        this._imageElement.classList.toggle("hidden", !imageURL);
        this._imageElement.src = imageURL;
    },

    __proto__: WebInspector.View.prototype
};
