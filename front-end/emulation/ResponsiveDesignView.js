// Copyright 2014 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

/**
 * @constructor
 * @extends {WebInspector.VBox}
 * @implements {WebInspector.OverridesSupport.PageResizer}
 * @implements {WebInspector.TargetManager.Observer}
 * @param {!WebInspector.InspectedPagePlaceholder} inspectedPagePlaceholder
 */
WebInspector.ResponsiveDesignView = function(inspectedPagePlaceholder)
{
    WebInspector.VBox.call(this);
    this.setMinimumSize(150, 150);
    this.element.classList.add("responsive-design-view");
    this.registerRequiredCSS("emulation/responsiveDesignView.css");

    this._showMediaQueryInspectorSetting = WebInspector.settings.createSetting("showMediaQueryInspector", false);

    this._responsiveDesignContainer = new WebInspector.VBox();
    this._uiInitialized = false;

    this._inspectedPagePlaceholder = inspectedPagePlaceholder;
    inspectedPagePlaceholder.show(this.element);

    this._enabled = false;
    this._viewport = { scrollX: 0, scrollY: 0, contentsWidth: 0, contentsHeight: 0, pageScaleFactor: 1, minimumPageScaleFactor: 1, maximumPageScaleFactor: 1 };
    this._drawContentsSize = true;
    this._deviceInsets = new Insets(0, 0, 0, 0);
    this._pageContainerSrcset = "";
    this._viewportChangedThrottler = new WebInspector.Throttler(0);
    this._pageScaleFactorThrottler = new WebInspector.Throttler(50);

    WebInspector.zoomManager.addEventListener(WebInspector.ZoomManager.Events.ZoomChanged, this._onZoomChanged, this);
    WebInspector.overridesSupport.addEventListener(WebInspector.OverridesSupport.Events.EmulationStateChanged, this._emulationEnabledChanged, this);
    WebInspector.targetManager.observeTargets(this, WebInspector.Target.Type.Page);
    this._emulationEnabledChanged();
};

// Measured in DIP.
WebInspector.ResponsiveDesignView.RulerWidth = 26;
WebInspector.ResponsiveDesignView.RulerHeight = 22;
WebInspector.ResponsiveDesignView.RulerTopHeight = 11;
WebInspector.ResponsiveDesignView.RulerBottomHeight = 9;

WebInspector.ResponsiveDesignView.prototype = {
    _ensureUIInitialized: function()
    {
        if (this._uiInitialized)
            return;

        this._uiInitialized = true;

        this._createToolbar();

        this._canvasContainer = new WebInspector.Widget();
        this._canvasContainer.element.classList.add("responsive-design");
        this._canvasContainer.show(this._responsiveDesignContainer.element);

        this._canvas = this._canvasContainer.element.createChild("canvas", "fill responsive-design-canvas");

        this._mediaInspectorContainer = this._canvasContainer.element.createChild("div", "responsive-design-media-container");
        WebInspector.Tooltip.addNativeOverrideContainer(this._mediaInspectorContainer);
        this._mediaInspector = new WebInspector.MediaQueryInspector();
        this._updateMediaQueryInspector();

        this._warningInfobar = new WebInspector.Infobar(WebInspector.Infobar.Type.Warning, WebInspector.moduleSetting("disableOverridesWarning"));
        this._warningInfobar.element.classList.add("responsive-design-warning");
        this._warningInfobar.setCloseCallback(WebInspector.overridesSupport.clearWarningMessage.bind(WebInspector.overridesSupport));
        this._canvasContainer.element.appendChild(this._warningInfobar.element);
        this._warningMessage = this._warningInfobar.element.createChild("span");
        WebInspector.overridesSupport.addEventListener(WebInspector.OverridesSupport.Events.OverridesWarningUpdated, this._overridesWarningUpdated, this);

        this._slidersContainer = this._canvasContainer.element.createChild("div", "vbox responsive-design-sliders-container");
        var genericDeviceOutline = this._slidersContainer.createChild("div", "responsive-design-generic-outline-container");
        genericDeviceOutline.createChild("div", "responsive-design-generic-outline");
        var widthSlider = this._slidersContainer.createChild("div", "responsive-design-slider-width");
        widthSlider.createChild("div", "responsive-design-thumb-handle");
        this._createResizer(widthSlider, true, false);
        var heightSlider = this._slidersContainer.createChild("div", "responsive-design-slider-height");
        heightSlider.createChild("div", "responsive-design-thumb-handle");
        this._createResizer(heightSlider, false, true);
        var cornerSlider = this._slidersContainer.createChild("div", "responsive-design-slider-corner");
        this._createResizer(cornerSlider, true, true);
        this._pageContainer = this._slidersContainer.createChild("div", "vbox flex-auto responsive-design-page-container");
        this._pageContainerImage = this._pageContainer.createChild("img", "responsive-design-page-container-image hidden");
        this._pageContainerImage.addEventListener("load", this._onPageContainerImageLoaded.bind(this, true), false);
        this._pageContainerImage.addEventListener("error", this._onPageContainerImageLoaded.bind(this, false), false);

        // Page scale controls.
        this._pageScaleContainer = this._canvasContainer.element.createChild("div", "hbox responsive-design-page-scale-container");
        this._decreasePageScaleButton = this._pageScaleContainer.createChild("button", "responsive-design-page-scale-button responsive-design-page-scale-decrease");
        this._decreasePageScaleButton.createChild("div", "glyph");
        this._decreasePageScaleButton.tabIndex = -1;
        this._decreasePageScaleButton.addEventListener("click", this._pageScaleButtonClicked.bind(this, false), false);

        this._pageScaleLabel = this._pageScaleContainer.createChild("label", "responsive-design-page-scale-label");
        this._pageScaleLabel.title = WebInspector.UIString("Shift + drag to change page scale");
        this._pageScaleLabel.addEventListener("dblclick", this._resetPageScale.bind(this), false);

        this._increasePageScaleButton = this._pageScaleContainer.createChild("button", "responsive-design-page-scale-button responsive-design-page-scale-increase");
        this._increasePageScaleButton.tabIndex = -1;
        this._increasePageScaleButton.createChild("div", "glyph");
        this._increasePageScaleButton.addEventListener("click", this._pageScaleButtonClicked.bind(this, true), false);

        this._mediaInspector.addEventListener(WebInspector.MediaQueryInspector.Events.CountUpdated, this._updateMediaQueryInspectorButton, this);
        this._mediaInspector.addEventListener(WebInspector.MediaQueryInspector.Events.HeightUpdated, this.onResize, this);
        this._overridesWarningUpdated();
    },

    /**
     * @override
     * @param {!WebInspector.Target} target
     */
    targetAdded: function(target)
    {
        if (this._target)
            return;
        this._target = target;
        target.registerEmulationDispatcher(new WebInspector.EmulationDispatcher(this));
    },

    /**
     * @override
     * @param {!WebInspector.Target} target
     */
    targetRemoved: function(target)
    {
    },

    _invalidateCache: function()
    {
        delete this._cachedScale;
        delete this._cachedCssCanvasWidth;
        delete this._cachedCssCanvasHeight;
        delete this._cachedCssHeight;
        delete this._cachedCssWidth;
        delete this._cachedDeviceInsets;
        delete this._cachedZoomFactor;
        delete this._cachedViewport;
        delete this._cachedDrawContentsSize;
        delete this._cachedMediaInspectorHeight;
        delete this._availableSize;
    },

    _emulationEnabledChanged: function()
    {
        var enabled = WebInspector.overridesSupport.emulationEnabled();
        if (enabled && !this._enabled) {
            WebInspector.userMetrics.DeviceModeEnabled.record();
            this._invalidateCache();
            this._ignoreResize = true;
            this._ensureUIInitialized();
            this._enabled = true;
            this._mediaInspector.setEnabled(true);
            this._inspectedPagePlaceholder.clearMinimumSizeAndMargins();
            this._inspectedPagePlaceholder.show(this._pageContainer);
            this._responsiveDesignContainer.show(this.element);
            delete this._ignoreResize;
            this.onResize();
        } else if (!enabled && this._enabled) {
            this._mediaInspector.setEnabled(false);
            this._invalidateCache();
            this._ignoreResize = true;
            this._enabled = false;
            this._scale = 1;
            this._inspectedPagePlaceholder.restoreMinimumSizeAndMargins();
            this._responsiveDesignContainer.detach();
            this._inspectedPagePlaceholder.show(this.element);
            delete this._ignoreResize;
            this.onResize();
        }
    },

    /**
     * @override
     * WebInspector.OverridesSupport.PageResizer override.
     * @param {number} dipWidth
     * @param {number} dipHeight
     * @param {number} scale
     */
    update: function(dipWidth, dipHeight, scale)
    {
        this._scale = scale;
        this._dipWidth = dipWidth ? Math.max(dipWidth, 1) : 0;
        this._dipHeight = dipHeight ? Math.max(dipHeight, 1) : 0;
        this._updateUI();
    },

    updatePageResizer: function()
    {
        var available = this._availableDipSize();
        WebInspector.overridesSupport.setPageResizer(this, available.size, available.insets);
    },

    /**
     * @return {!{size: !Size, insets: !Insets}}
     */
    _availableDipSize: function()
    {
        if (typeof this._availableSize === "undefined") {
            if (!this._enabled)
                return {size: new Size(1, 1), insets: new Insets(0, 0, 0, 0)};
            var zoomFactor = WebInspector.zoomManager.zoomFactor();
            var rect = this._canvasContainer.element.getBoundingClientRect();
            var rulerTotalHeight = this._rulerTotalHeightDIP();
            this._availableSize = {size: new Size(Math.max(rect.width * zoomFactor - WebInspector.ResponsiveDesignView.RulerWidth, 1),
                                                  Math.max(rect.height * zoomFactor - rulerTotalHeight, 1)),
                                   insets: this._deviceInsets};
        }
        return this._availableSize;
    },

    /**
     * @param {!Element} element
     * @param {boolean} x
     * @param {boolean} y
     * @return {!WebInspector.ResizerWidget}
     */
    _createResizer: function(element, x, y)
    {
        var resizer = new WebInspector.ResizerWidget();
        resizer.addElement(element);
        resizer.setCursor(x && y ? "nwse-resize" : (x ? "ew-resize" : "ns-resize"));
        resizer.addEventListener(WebInspector.ResizerWidget.Events.ResizeStart, this._onResizeStart, this);
        resizer.addEventListener(WebInspector.ResizerWidget.Events.ResizeUpdate, this._onResizeUpdate.bind(this, x, y));
        resizer.addEventListener(WebInspector.ResizerWidget.Events.ResizeEnd, this._onResizeEnd, this);
        return resizer;
    },

    /**
     * @param {!WebInspector.Event} event
     */
    _onResizeStart: function(event)
    {
        this._drawContentsSize = false;
        var available = this._availableDipSize().size;
        this._slowPositionStart = null;
        this._resizeStart = { x: this._dipWidth || available.width, y : this._dipHeight || available.height };
        this.dispatchEventToListeners(WebInspector.OverridesSupport.PageResizer.Events.FixedScaleRequested, true);
        this._updateUI();
    },

    /**
     * @param {boolean} x
     * @param {boolean} y
     * @param {!WebInspector.Event} event
     */
    _onResizeUpdate: function(x, y, event)
    {
        if (event.data.shiftKey !== !!this._slowPositionStart)
            this._slowPositionStart = event.data.shiftKey ? { x: event.data.currentX, y: event.data.currentY } : null;

        var cssOffsetX = event.data.currentX - event.data.startX;
        var cssOffsetY = event.data.currentY - event.data.startY;
        if (this._slowPositionStart) {
            cssOffsetX = (event.data.currentX - this._slowPositionStart.x) / 10 + this._slowPositionStart.x - event.data.startX;
            cssOffsetY = (event.data.currentY - this._slowPositionStart.y) / 10 + this._slowPositionStart.y - event.data.startY;
        }
        var dipOffsetX = Math.round(cssOffsetX * WebInspector.zoomManager.zoomFactor());
        var dipOffsetY = Math.round(cssOffsetY * WebInspector.zoomManager.zoomFactor());

        var newSizeX = this._resizeStart.x + dipOffsetX;
        newSizeX = Math.round(newSizeX / (this._scale || 1));
        newSizeX = Math.max(Math.min(newSizeX, WebInspector.OverridesSupport.MaxDeviceSize), 1);
        var newSizeY = this._resizeStart.y + dipOffsetY;
        newSizeY = Math.round(newSizeY / (this._scale || 1));
        newSizeY = Math.max(Math.min(newSizeY, WebInspector.OverridesSupport.MaxDeviceSize), 1);

        var requested = {};
        if (x)
            requested.width = newSizeX;
        if (y)
            requested.height = newSizeY;
        this.dispatchEventToListeners(WebInspector.OverridesSupport.PageResizer.Events.ResizeRequested, requested);
    },

    /**
     * @param {!WebInspector.Event} event
     */
    _onResizeEnd: function(event)
    {
        this._drawContentsSize = true;
        this.dispatchEventToListeners(WebInspector.OverridesSupport.PageResizer.Events.FixedScaleRequested, false);
        delete this._resizeStart;
        this._updateUI();
    },

    /**
     * Draws canvas of the specified css size in DevTools page space.
     * Canvas contains grid and rulers.
     * @param {number} cssCanvasWidth
     * @param {number} cssCanvasHeight
     * @param {number} rulerHeight
     */
    _drawCanvas: function(cssCanvasWidth, cssCanvasHeight, rulerHeight)
    {
        if (!this._enabled)
            return;

        var canvas = this._canvas;
        var context = canvas.getContext("2d");
        canvas.style.width = cssCanvasWidth + "px";
        canvas.style.height = cssCanvasHeight + "px";

        var zoomFactor = WebInspector.zoomManager.zoomFactor();
        var dipCanvasWidth = cssCanvasWidth * zoomFactor;
        var dipCanvasHeight = cssCanvasHeight * zoomFactor;

        var deviceScaleFactor = window.devicePixelRatio;
        canvas.width = deviceScaleFactor * cssCanvasWidth;
        canvas.height = deviceScaleFactor * cssCanvasHeight;
        context.scale(canvas.width / dipCanvasWidth, canvas.height / dipCanvasHeight);
        context.font = "11px " + WebInspector.fontFamily();

        const backgroundColor = "rgb(102, 102, 102)";
        const lightLineColor = "rgb(132, 132, 132)";
        const darkLineColor = "rgb(114, 114, 114)";
        const rulerColor = "rgb(125, 125, 125)";
        const textColor = "rgb(186, 186, 186)";
        const contentsSizeColor = "rgba(0, 0, 0, 0.3)";

        var scale = (this._scale || 1) * this._viewport.pageScaleFactor;
        var rulerScale = 0.5;
        while (Math.abs(rulerScale * scale - 1) > Math.abs((rulerScale + 0.5) * scale - 1))
            rulerScale += 0.5;

        var gridStep = 50 * scale * rulerScale;
        var gridSubStep = 10 * scale * rulerScale;

        var rulerSubStep = 5 * scale * rulerScale;
        var rulerStepCount = 20;

        var rulerWidth = WebInspector.ResponsiveDesignView.RulerWidth;

        var dipGridWidth = dipCanvasWidth - rulerWidth;
        var dipGridHeight = dipCanvasHeight - rulerHeight;
        var dipScrollX = this._viewport.scrollX * scale;
        var dipScrollY = this._viewport.scrollY * scale;
        context.translate(rulerWidth, rulerHeight);

        context.fillStyle = backgroundColor;
        context.fillRect(0, 0, dipGridWidth, dipGridHeight);

        context.translate(0.5, 0.5);
        context.strokeStyle = rulerColor;
        context.fillStyle = textColor;
        context.lineWidth = 1;

        // Draw horizontal ruler.
        context.save();

        var minXIndex = Math.ceil(dipScrollX / rulerSubStep);
        var maxXIndex = Math.floor((dipScrollX + dipGridWidth) / rulerSubStep);
        if (minXIndex) {
            context.beginPath();
            context.moveTo(0, -rulerHeight);
            context.lineTo(0, 0);
            context.stroke();
        }

        context.translate(-dipScrollX, 0);
        for (var index = minXIndex; index <= maxXIndex; index++) {
            var x = index * rulerSubStep;
            var height = WebInspector.ResponsiveDesignView.RulerHeight * 0.25;

            if (!(index % (rulerStepCount / 4)))
                height = WebInspector.ResponsiveDesignView.RulerHeight * 0.5;

            if (!(index % (rulerStepCount / 2)))
                height = rulerHeight;

            if (!(index % rulerStepCount)) {
                context.save();
                context.translate(x, 0);
                context.fillText(Math.round(x / scale), 2, -rulerHeight + 10);
                context.restore();
                height = rulerHeight;
            }

            context.beginPath();
            context.moveTo(x, - height);
            context.lineTo(x, 0);
            context.stroke();
        }
        context.restore();

        // Draw vertical ruler.
        context.save();
        context.translate(0, this._deviceInsets.top);
        var minYIndex = Math.ceil(dipScrollY / rulerSubStep);
        var maxYIndex = Math.floor((dipScrollY + dipGridHeight) / rulerSubStep);
        context.translate(0, -dipScrollY);
        for (var index = minYIndex; index <= maxYIndex; index++) {
            var y = index * rulerSubStep;
            var x = -rulerWidth * 0.25;
            if (!(index % (rulerStepCount / 4)))
                x = -rulerWidth * 0.5;
            if (!(index % (rulerStepCount / 2)))
                x = -rulerWidth * 0.75;

            if (!(index % rulerStepCount)) {
                context.save();
                context.translate(0, y);
                context.rotate(-Math.PI / 2);
                context.fillText(Math.round(y / scale), 2, -rulerWidth + 10);
                context.restore();
                x = -rulerWidth;
            }

            context.beginPath();
            context.moveTo(x, y);
            context.lineTo(0, y);
            context.stroke();
        }
        context.restore();

        // Draw grid.
        drawGrid(dipScrollX, dipScrollY + this._deviceInsets.top, darkLineColor, gridSubStep);
        drawGrid(dipScrollX, dipScrollY + this._deviceInsets.top, lightLineColor, gridStep);

        /**
         * @param {number} scrollX
         * @param {number} scrollY
         * @param {string} color
         * @param {number} step
         */
        function drawGrid(scrollX, scrollY, color, step)
        {
            context.strokeStyle = color;
            var minX = Math.ceil(scrollX / step) * step;
            var maxX = Math.floor((scrollX + dipGridWidth) / step) * step - minX;
            var minY = Math.ceil(scrollY / step) * step;
            var maxY = Math.floor((scrollY + dipGridHeight) / step) * step - minY;

            context.save();
            context.translate(minX - scrollX, 0);
            for (var x = 0; x <= maxX; x += step) {
                context.beginPath();
                context.moveTo(x, 0);
                context.lineTo(x, dipGridHeight);
                context.stroke();
            }
            context.restore();

            context.save();
            context.translate(0, minY - scrollY);
            for (var y = 0; y <= maxY; y += step) {
                context.beginPath();
                context.moveTo(0, y);
                context.lineTo(dipGridWidth, y);
                context.stroke();
            }
            context.restore();
        }

        context.translate(-0.5, -0.5);

        // Draw contents size.
        var pageScaleAvailable = WebInspector.overridesSupport.settings.emulateMobile.get() || WebInspector.overridesSupport.settings.emulateTouch.get();
        if (this._drawContentsSize && pageScaleAvailable) {
            context.save();
            context.fillStyle = contentsSizeColor;
            var visibleContentsWidth = Math.max(0, Math.min(dipGridWidth, this._viewport.contentsWidth * scale - dipScrollX));
            var visibleContentsHeight = Math.max(0, Math.min(dipGridHeight, this._viewport.contentsHeight * scale - dipScrollY + this._deviceInsets.top));
            context.translate(0, this._deviceInsets.top);
            context.fillRect(0, Math.max(-this._deviceInsets.top, -dipScrollY), visibleContentsWidth, visibleContentsHeight);
            context.restore();
        }
    },

    /**
     * @return {number}
     */
    _rulerTotalHeightDIP: function()
    {
        var mediaInspectorHeight = this._mediaInspector.isShowing() ? this._mediaInspector.element.offsetHeight : 0;
        if (!mediaInspectorHeight)
            return WebInspector.ResponsiveDesignView.RulerHeight;
        return WebInspector.ResponsiveDesignView.RulerTopHeight + WebInspector.ResponsiveDesignView.RulerBottomHeight + mediaInspectorHeight * WebInspector.zoomManager.zoomFactor();
    },

    _updateUI: function()
    {
        if (!this._enabled || !this.isShowing())
            return;

        var zoomFactor = WebInspector.zoomManager.zoomFactor();
        var rect = this._canvas.parentElement.getBoundingClientRect();
        var availableDip = this._availableDipSize().size;
        var cssCanvasWidth = rect.width;
        var cssCanvasHeight = rect.height;
        var mediaInspectorHeight = this._mediaInspector.isShowing() ? this._mediaInspector.element.offsetHeight : 0;
        var rulerTotalHeight = this._rulerTotalHeightDIP();

        this._mediaInspector.setAxisTransform(this._viewport.scrollX, this._scale * this._viewport.pageScaleFactor);

        if (this._cachedZoomFactor !== zoomFactor || this._cachedMediaInspectorHeight !== mediaInspectorHeight) {
            var cssRulerWidth = WebInspector.ResponsiveDesignView.RulerWidth / zoomFactor + "px";
            var cssRulerHeight = (mediaInspectorHeight ? WebInspector.ResponsiveDesignView.RulerTopHeight : WebInspector.ResponsiveDesignView.RulerHeight) / zoomFactor + "px";
            var cssCanvasOffset = rulerTotalHeight / zoomFactor + "px";
            this._slidersContainer.style.left = cssRulerWidth;
            this._slidersContainer.style.top = cssCanvasOffset;
            this._warningInfobar.element.style.height = cssCanvasOffset;
            this._pageScaleContainer.style.top = cssCanvasOffset;
            this._mediaInspectorContainer.style.left = cssRulerWidth;
            this._mediaInspectorContainer.style.marginTop = cssRulerHeight;
        }

        var cssWidth = (this._dipWidth ? this._dipWidth : availableDip.width) / zoomFactor;
        var cssHeight = (this._dipHeight ? this._dipHeight : availableDip.height) / zoomFactor;
        var deviceInsets = new Insets(this._deviceInsets.left * this._scale / zoomFactor, this._deviceInsets.top * this._scale / zoomFactor, this._deviceInsets.right * this._scale / zoomFactor, this._deviceInsets.bottom * this._scale / zoomFactor);
        cssWidth += deviceInsets.left + deviceInsets.right;
        cssHeight += deviceInsets.top + deviceInsets.bottom;
        var insetsChanged = !deviceInsets.isEqual(this._cachedDeviceInsets);
        if (this._cachedCssWidth !== cssWidth || this._cachedCssHeight !== cssHeight || insetsChanged) {
            this._slidersContainer.style.width = cssWidth + "px";
            this._slidersContainer.style.height = cssHeight + "px";
            this._pageContainer.style.paddingLeft = deviceInsets.left + "px";
            this._pageContainer.style.paddingTop = deviceInsets.top + "px";
            this._pageContainer.style.paddingRight = deviceInsets.right + "px";
            this._pageContainer.style.paddingBottom = deviceInsets.bottom + "px";
            this._inspectedPagePlaceholder.onResize();
        }

        this._loadPageContainerImage();

        var pageScaleVisible = cssWidth + this._pageScaleContainerWidth + WebInspector.ResponsiveDesignView.RulerWidth / zoomFactor <= rect.width;
        this._pageScaleContainer.classList.toggle("hidden", !pageScaleVisible);

        var viewportChanged = !this._cachedViewport
            || this._cachedViewport.scrollX !== this._viewport.scrollX || this._cachedViewport.scrollY !== this._viewport.scrollY
            || this._cachedViewport.contentsWidth !== this._viewport.contentsWidth || this._cachedViewport.contentsHeight !== this._viewport.contentsHeight
            || this._cachedViewport.pageScaleFactor !== this._viewport.pageScaleFactor
            || this._cachedViewport.minimumPageScaleFactor !== this._viewport.minimumPageScaleFactor
            || this._cachedViewport.maximumPageScaleFactor !== this._viewport.maximumPageScaleFactor;

        var canvasInvalidated = viewportChanged || this._drawContentsSize !== this._cachedDrawContentsSize || this._cachedScale !== this._scale ||
            this._cachedCssCanvasWidth !== cssCanvasWidth || this._cachedCssCanvasHeight !== cssCanvasHeight || this._cachedZoomFactor !== zoomFactor ||
            this._cachedMediaInspectorHeight !== mediaInspectorHeight || insetsChanged;

        if (canvasInvalidated)
            this._drawCanvas(cssCanvasWidth, cssCanvasHeight, rulerTotalHeight);

        if (viewportChanged) {
            this._pageScaleLabel.textContent = WebInspector.UIString("%.1f", this._viewport.pageScaleFactor);
            this._decreasePageScaleButton.title = WebInspector.UIString("Scale down (minimum %.1f)", this._viewport.minimumPageScaleFactor);
            this._decreasePageScaleButton.disabled = this._viewport.pageScaleFactor <= this._viewport.minimumPageScaleFactor;
            this._increasePageScaleButton.title = WebInspector.UIString("Scale up (maximum %.1f)", this._viewport.maximumPageScaleFactor);
            this._increasePageScaleButton.disabled = this._viewport.pageScaleFactor >= this._viewport.maximumPageScaleFactor;
        }

        this._cachedScale = this._scale;
        this._cachedCssCanvasWidth = cssCanvasWidth;
        this._cachedCssCanvasHeight = cssCanvasHeight;
        this._cachedCssHeight = cssHeight;
        this._cachedCssWidth = cssWidth;
        this._cachedDeviceInsets = deviceInsets;
        this._cachedZoomFactor = zoomFactor;
        this._cachedViewport = this._viewport;
        this._cachedDrawContentsSize = this._drawContentsSize;
        this._cachedMediaInspectorHeight = mediaInspectorHeight;
    },

    _loadPageContainerImage: function()
    {
        if (this._pageContainerImage.getAttribute("srcset") === this._pageContainerSrcset)
            return;
        this._pageContainerImage.setAttribute("srcset", this._pageContainerSrcset);
        if (!this._pageContainerSrcset)
            this._pageContainerImage.classList.toggle("hidden", true);
    },

    /**
     * @param {boolean} success
     */
    _onPageContainerImageLoaded: function(success)
    {
        this._pageContainerImage.classList.toggle("hidden", !success);
    },

    onResize: function()
    {
        if (!this._enabled || this._ignoreResize)
            return;
        var oldSize = this._availableSize;

        this._pageScaleContainer.classList.remove("hidden");
        this._pageScaleContainerWidth = this._pageScaleContainer.offsetWidth;

        delete this._availableSize;
        var newSize = this._availableDipSize();
        if (!oldSize || !newSize.size.isEqual(oldSize.size) || !newSize.insets.isEqual(oldSize.insets))
            this.dispatchEventToListeners(WebInspector.OverridesSupport.PageResizer.Events.AvailableSizeChanged, newSize);
        this._updateUI();
        this._inspectedPagePlaceholder.onResize();
    },

    _onZoomChanged: function()
    {
        this._updateUI();
    },

    _createToolbar: function()
    {
        this._toolbarElement = this._responsiveDesignContainer.element.createChild("div", "responsive-design-toolbar");
        this._createButtonsSection();
        this._createDeviceSection();
        this._toolbarElement.createChild("div", "responsive-design-separator");
        this._createNetworkSection();
        this._toolbarElement.createChild("div", "responsive-design-separator");

        var moreButtonContainer = this._toolbarElement.createChild("div", "responsive-design-more-button-container");
        var moreButton = moreButtonContainer.createChild("button", "responsive-design-more-button");
        moreButton.title = WebInspector.UIString("More overrides");
        moreButton.addEventListener("click", this._showEmulationInDrawer.bind(this), false);
        moreButton.textContent = "\u2026";
    },

    _createButtonsSection: function()
    {
        var buttonsToolbar = new WebInspector.Toolbar(this._toolbarElement);
        buttonsToolbar.makeVertical();
        buttonsToolbar.setColor("white");
        buttonsToolbar.setToggledColor("rgb(105, 194, 236)");
        buttonsToolbar.element.classList.add("responsive-design-section", "responsive-design-section-buttons");

        var resetButton = new WebInspector.ToolbarButton(WebInspector.UIString("Reset all overrides"), "clear-toolbar-item");
        buttonsToolbar.appendToolbarItem(resetButton);
        resetButton.addEventListener("click", WebInspector.overridesSupport.reset, WebInspector.overridesSupport);

        // Media Query Inspector.
        this._toggleMediaInspectorButton = new WebInspector.ToolbarButton(WebInspector.UIString("Media queries not found"), "waterfall-toolbar-item");
        this._toggleMediaInspectorButton.setToggled(this._showMediaQueryInspectorSetting.get());
        this._toggleMediaInspectorButton.setEnabled(false);
        this._toggleMediaInspectorButton.addEventListener("click", this._onToggleMediaInspectorButtonClick, this);
        this._showMediaQueryInspectorSetting.addChangeListener(this._updateMediaQueryInspector, this);
        buttonsToolbar.appendToolbarItem(this._toggleMediaInspectorButton);
    },

    _createDeviceSection: function()
    {
        var deviceSection = this._toolbarElement.createChild("div", "responsive-design-section responsive-design-section-device");
        deviceSection.createChild("div", "responsive-design-section-decorator");

        // Device.
        var deviceElement = deviceSection.createChild("div", "responsive-design-suite responsive-design-suite-top").createChild("div");

        var fieldsetElement = deviceElement.createChild("fieldset");
        fieldsetElement.createChild("label").textContent = WebInspector.UIString("Device");
        var deviceSelect = new WebInspector.DeviceSelect(createElementWithClass("button", "responsive-design-icon responsive-design-icon-swap"), this._deviceModeSelected.bind(this));
        fieldsetElement.appendChild(deviceSelect.element);
        deviceSelect.element.classList.add("responsive-design-device-select");

        var detailsElement = deviceSection.createChild("div", "responsive-design-suite");

        // Dimensions.
        var screenElement = detailsElement.createChild("div", "");
        fieldsetElement = screenElement.createChild("fieldset");

        var emulateResolutionCheckbox = WebInspector.SettingsUI.createSettingCheckbox("", WebInspector.overridesSupport.settings.emulateResolution, true, WebInspector.UIString("Emulate screen resolution"));
        themeCheckbox(emulateResolutionCheckbox);
        fieldsetElement.appendChild(emulateResolutionCheckbox);

        fieldsetElement.createChild("label").textContent = WebInspector.UIString("Screen");
        var resolutionFieldset = WebInspector.SettingsUI.createSettingFieldset(WebInspector.overridesSupport.settings.emulateResolution);
        fieldsetElement.appendChild(resolutionFieldset);

        resolutionFieldset.appendChild(WebInspector.SettingsUI.createSettingInputField("", WebInspector.overridesSupport.settings.deviceWidth, true, 4, "3em", WebInspector.OverridesSupport.deviceSizeValidator, true, true, WebInspector.UIString("\u2013")));
        resolutionFieldset.createTextChild("\u00D7");
        resolutionFieldset.appendChild(WebInspector.SettingsUI.createSettingInputField("", WebInspector.overridesSupport.settings.deviceHeight, true, 4, "3em", WebInspector.OverridesSupport.deviceSizeValidator, true, true, WebInspector.UIString("\u2013")));

        // Device pixel ratio.
        detailsElement.createChild("div", "responsive-design-suite-separator");

        var dprElement = detailsElement.createChild("div", "");
        var resolutionFieldset2 = WebInspector.SettingsUI.createSettingFieldset(WebInspector.overridesSupport.settings.emulateResolution);
        dprElement.appendChild(resolutionFieldset2);
        var dprButton = resolutionFieldset2.createChild("div", "responsive-design-icon responsive-design-icon-dpr");
        dprButton.title = WebInspector.UIString("Device pixel ratio");
        resolutionFieldset2.appendChild(WebInspector.SettingsUI.createSettingInputField("", WebInspector.overridesSupport.settings.deviceScaleFactor, true, 4, "1.9em", WebInspector.OverridesSupport.deviceScaleFactorValidator, true, true, WebInspector.UIString("\u2013")));

        // Fit to window.
        detailsElement.createChild("div", "responsive-design-suite-separator");
        var fitToWindowElement = detailsElement.createChild("div", "");
        fieldsetElement = fitToWindowElement.createChild("fieldset");
        var fitCheckbox = WebInspector.SettingsUI.createSettingCheckbox(WebInspector.UIString("Zoom to fit"), WebInspector.overridesSupport.settings.deviceFitWindow, true, WebInspector.UIString("Zoom to fit available space"))
        fieldsetElement.appendChild(fitCheckbox);
        themeCheckbox(fitCheckbox);

        /**
         * @param {!Element} checkbox
         */
        function themeCheckbox(checkbox)
        {
            checkbox.checkColor = "rgb(255, 156, 0)";
            checkbox.backgroundColor = "rgb(102, 102, 102)";
            checkbox.borderColor = "rgb(45, 45, 45)";
        }
    },

    _createNetworkSection: function()
    {
        var networkSection = this._toolbarElement.createChild("div", "responsive-design-section responsive-design-section-network");
        networkSection.createChild("div", "responsive-design-section-decorator");

        // Bandwidth.
        var bandwidthElement = networkSection.createChild("div", "responsive-design-suite responsive-design-suite-top").createChild("div");
        var fieldsetElement = bandwidthElement.createChild("fieldset");
        var networkCheckbox = fieldsetElement.createChild("label");
        networkCheckbox.textContent = WebInspector.UIString("Network");
        new WebInspector.NetworkConditionsSelector(fieldsetElement.createChild("select"));

        // User agent.
        var userAgentElement = networkSection.createChild("div", "responsive-design-suite").createChild("div");
        fieldsetElement = userAgentElement.createChild("fieldset");
        fieldsetElement.appendChild(WebInspector.SettingsUI.createSettingInputField("UA", WebInspector.overridesSupport.settings.userAgent, false, 0, "", undefined, false, false, WebInspector.UIString("No override")));
    },

    _onToggleMediaInspectorButtonClick: function()
    {
        this._showMediaQueryInspectorSetting.set(!this._toggleMediaInspectorButton.toggled());
    },

    _updateMediaQueryInspector: function()
    {
        this._toggleMediaInspectorButton.setToggled(this._showMediaQueryInspectorSetting.get());
        if (this._mediaInspector.isShowing() === this._showMediaQueryInspectorSetting.get())
            return;
        if (this._mediaInspector.isShowing())
            this._mediaInspector.detach();
        else
            this._mediaInspector.show(this._mediaInspectorContainer);
        this.onResize();
    },

    /**
     * @param {!WebInspector.Event} event
     */
    _updateMediaQueryInspectorButton: function(event)
    {
        var count = /** @type {number} */ (event.data);
        this._toggleMediaInspectorButton.setEnabled(!!count);
        this._toggleMediaInspectorButton.setTitle(!count ? WebInspector.UIString("Media queries not found") :
            WebInspector.UIString((count === 1 ? "%d media query found" : "%d media queries found"), count));
    },

    _overridesWarningUpdated: function()
    {
        var message = WebInspector.overridesSupport.warningMessage();
        this._warningMessage.textContent = message;
        this._warningInfobar.setVisible(!!message);
    },

    _showEmulationInDrawer: function()
    {
        WebInspector.Revealer.reveal(WebInspector.overridesSupport);
    },

    /**
     * @param {?WebInspector.EmulatedDevice} device
     * @param {?WebInspector.EmulatedDevice.Mode} mode
     */
    _deviceModeSelected: function(device, mode)
    {
        this._pageContainerSrcset = "";
        if (device && mode) {
            var orientation = device.orientationByName(mode.orientation);
            this._deviceInsets = mode.insets;
            WebInspector.overridesSupport.settings.screenOrientationOverride.set(mode.orientation == WebInspector.EmulatedDevice.Horizontal ? "landscapePrimary" : "portraitPrimary");
            this._pageContainerSrcset = device.modeImage(mode);
        } else {
            this._deviceInsets = new Insets(0, 0, 0, 0);
            WebInspector.overridesSupport.settings.screenOrientationOverride.set("");
        }
        this.dispatchEventToListeners(WebInspector.OverridesSupport.PageResizer.Events.InsetsChanged, this._deviceInsets);
    },

    /**
     * @param {!EmulationAgent.Viewport=} viewport
     */
    _viewportChanged: function(viewport)
    {
        if (viewport) {
            this._viewport = viewport;
            this._viewport.minimumPageScaleFactor = Math.max(0.1, this._viewport.minimumPageScaleFactor);
            this._viewport.minimumPageScaleFactor = Math.min(this._viewport.minimumPageScaleFactor, this._viewport.pageScaleFactor);
            this._viewport.maximumPageScaleFactor = Math.min(10, this._viewport.maximumPageScaleFactor);
            this._viewport.maximumPageScaleFactor = Math.max(this._viewport.maximumPageScaleFactor, this._viewport.pageScaleFactor);
            this._viewportChangedThrottler.schedule(this._updateUIThrottled.bind(this));
        }
    },

    /**
     * @return {!Promise.<?>}
     */
    _updateUIThrottled: function()
    {
        this._updateUI();
        return Promise.resolve();
    },

    /**
     * @param {boolean} increase
     * @param {!Event} event
     */
    _pageScaleButtonClicked: function(increase, event)
    {
        this._pageScaleFactorThrottler.schedule(updatePageScaleFactor.bind(this));

        /**
         * @return {!Promise.<?>}
         * @this {WebInspector.ResponsiveDesignView}
         */
        function updatePageScaleFactor()
        {
            if (this._target && this._viewport) {
                var value = this._viewport.pageScaleFactor;
                value = increase ? value * 1.1 : value / 1.1;
                value = Math.min(this._viewport.maximumPageScaleFactor, value);
                value = Math.max(this._viewport.minimumPageScaleFactor, value);
                this._target.emulationAgent().setPageScaleFactor(value);
            }
            return Promise.resolve();
        }
    },

    _resetPageScale: function()
    {
        this._pageScaleFactorThrottler.schedule(updatePageScaleFactor.bind(this));

        /**
         * @return {!Promise.<?>}
         * @this {WebInspector.ResponsiveDesignView}
         */
        function updatePageScaleFactor()
        {
            if (this._target && this._viewport && this._viewport.minimumPageScaleFactor <= 1 && this._viewport.maximumPageScaleFactor >= 1)
                this._target.emulationAgent().setPageScaleFactor(1);
            return Promise.resolve();
        }
    },

    __proto__: WebInspector.VBox.prototype
};


/**
 * @constructor
 * @implements {EmulationAgent.Dispatcher}
 * @param {!WebInspector.ResponsiveDesignView} responsiveDesignView
 */
WebInspector.EmulationDispatcher = function(responsiveDesignView)
{
    this._responsiveDesignView = responsiveDesignView;
}

WebInspector.EmulationDispatcher.prototype = {
    /**
     * @override
     * @param {!EmulationAgent.Viewport=} viewport
     */
    viewportChanged: function(viewport)
    {
        this._responsiveDesignView._viewportChanged(viewport);
    }
}
