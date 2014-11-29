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
    this.registerRequiredCSS("toolbox/responsiveDesignView.css");

    this._responsiveDesignContainer = new WebInspector.VBox();

    this._createToolbar();

    this._canvasContainer = new WebInspector.View();
    this._canvasContainer.element.classList.add("responsive-design");
    this._canvasContainer.show(this._responsiveDesignContainer.element);

    this._canvas = this._canvasContainer.element.createChild("canvas", "fill responsive-design-canvas");

    this._mediaInspectorContainer = this._canvasContainer.element.createChild("div", "responsive-design-media-container");
    this._mediaInspector = new WebInspector.MediaQueryInspector();
    this._updateMediaQueryInspector();

    this._warningMessage = this._canvasContainer.element.createChild("div", "responsive-design-warning hidden");
    this._warningMessage.createChild("div", "warning-icon-small");
    this._warningMessage.createChild("span");
    var warningDisableButton = this._warningMessage.createChild("div", "disable-warning");
    warningDisableButton.textContent = WebInspector.UIString("Never show");
    warningDisableButton.addEventListener("click", this._disableOverridesWarnings.bind(this), false);
    var warningCloseButton = this._warningMessage.createChild("div", "close-button");
    warningCloseButton.addEventListener("click", WebInspector.overridesSupport.clearWarningMessage.bind(WebInspector.overridesSupport), false);
    WebInspector.overridesSupport.addEventListener(WebInspector.OverridesSupport.Events.OverridesWarningUpdated, this._overridesWarningUpdated, this);
    WebInspector.settings.disableOverridesWarning.addChangeListener(this._overridesWarningUpdated, this);

    this._slidersContainer = this._canvasContainer.element.createChild("div", "vbox responsive-design-sliders-container");
    var genericDeviceOutline = this._slidersContainer.createChild("div", "responsive-design-generic-outline-container");
    genericDeviceOutline.createChild("div", "responsive-design-generic-outline");
    var widthSlider = this._slidersContainer.createChild("div", "responsive-design-slider-width");
    widthSlider.createChild("div", "responsive-design-thumb-handle");
    this._createResizer(widthSlider, false);
    var heightSlider = this._slidersContainer.createChild("div", "responsive-design-slider-height");
    heightSlider.createChild("div", "responsive-design-thumb-handle");
    this._createResizer(heightSlider, true);
    this._pageContainer = this._slidersContainer.createChild("div", "vbox flex-auto");

    // Page scale controls.
    this._pageScaleContainer = this._canvasContainer.element.createChild("div", "hbox responsive-design-page-scale-container");
    this._decreasePageScaleButton = this._pageScaleContainer.createChild("button", "responsive-design-page-scale-button responsive-design-page-scale-decrease");
    this._decreasePageScaleButton.createChild("div", "glyph");
    this._decreasePageScaleButton.tabIndex = -1;
    this._decreasePageScaleButton.addEventListener("click", this._pageScaleButtonClicked.bind(this, false), false);

    this._pageScaleLabel = this._pageScaleContainer.createChild("label", "responsive-design-page-scale-label");
    this._pageScaleLabel.title = WebInspector.UIString("For a simpler way to change the current page scale, hold down Shift and drag with your mouse.");
    this._pageScaleLabel.addEventListener("dblclick", this._resetPageScale.bind(this), false);


    this._increasePageScaleButton = this._pageScaleContainer.createChild("button", "responsive-design-page-scale-button responsive-design-page-scale-increase");
    this._increasePageScaleButton.tabIndex = -1;
    this._increasePageScaleButton.createChild("div", "glyph");
    this._increasePageScaleButton.addEventListener("click", this._pageScaleButtonClicked.bind(this, true), false);

    this._inspectedPagePlaceholder = inspectedPagePlaceholder;
    inspectedPagePlaceholder.show(this.element);

    this._enabled = false;
    this._viewport = { scrollX: 0, scrollY: 0, contentsWidth: 0, contentsHeight: 0, pageScaleFactor: 1, minimumPageScaleFactor: 1, maximumPageScaleFactor: 1 };
    this._drawContentsSize = true;
    this._viewportChangedThrottler = new WebInspector.Throttler(0);
    this._pageScaleFactorThrottler = new WebInspector.Throttler(50);

    WebInspector.zoomManager.addEventListener(WebInspector.ZoomManager.Events.ZoomChanged, this._onZoomChanged, this);
    WebInspector.overridesSupport.addEventListener(WebInspector.OverridesSupport.Events.EmulationStateChanged, this._emulationEnabledChanged, this);
    this._mediaInspector.addEventListener(WebInspector.MediaQueryInspector.Events.CountUpdated, this._updateMediaQueryInspectorButton, this);
    this._mediaInspector.addEventListener(WebInspector.MediaQueryInspector.Events.HeightUpdated, this.onResize, this);
    WebInspector.targetManager.observeTargets(this);

    this._emulationEnabledChanged();
    this._overridesWarningUpdated();
};

// Measured in DIP.
WebInspector.ResponsiveDesignView.RulerWidth = 34;
WebInspector.ResponsiveDesignView.RulerHeight = 22;
WebInspector.ResponsiveDesignView.RulerTopHeight = 11;
WebInspector.ResponsiveDesignView.RulerBottomHeight = 9;

WebInspector.ResponsiveDesignView.prototype = {

    /**
     * @param {!WebInspector.Target} target
     */
    targetAdded: function(target)
    {
        // FIXME: adapt this to multiple targets.
        if (this._target)
            return;
        this._target = target;
        target.resourceTreeModel.addEventListener(WebInspector.ResourceTreeModel.EventTypes.ViewportChanged, this._viewportChanged, this);
    },

    /**
     * @param {!WebInspector.Target} target
     */
    targetRemoved: function(target)
    {
        if (target !== this._target)
            return;
        target.resourceTreeModel.removeEventListener(WebInspector.ResourceTreeModel.EventTypes.ViewportChanged, this._viewportChanged, this);
    },

    _invalidateCache: function()
    {
        delete this._cachedScale;
        delete this._cachedCssCanvasWidth;
        delete this._cachedCssCanvasHeight;
        delete this._cachedCssHeight;
        delete this._cachedCssWidth;
        delete this._cachedZoomFactor;
        delete this._cachedViewport;
        delete this._cachedDrawContentsSize;
        delete this._cachedMediaInspectorHeight;
        delete this._availableSize;
    },

    _emulationEnabledChanged: function()
    {
        var enabled = WebInspector.overridesSupport.emulationEnabled();
        this._mediaInspector.setEnabled(enabled);
        if (enabled && !this._enabled) {
            this._invalidateCache();
            this._ignoreResize = true;
            this._enabled = true;
            this._inspectedPagePlaceholder.clearMinimumSizeAndMargins();
            this._inspectedPagePlaceholder.show(this._pageContainer);
            this._responsiveDesignContainer.show(this.element);
            delete this._ignoreResize;
            this.onResize();
        } else if (!enabled && this._enabled) {
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
        WebInspector.overridesSupport.setPageResizer(this, this._availableDipSize());
    },

    /**
     * @return {!Size}
     */
    _availableDipSize: function()
    {
        if (typeof this._availableSize === "undefined") {
            var zoomFactor = WebInspector.zoomManager.zoomFactor();
            var rect = this._canvasContainer.element.getBoundingClientRect();
            var rulerTotalHeight = this._rulerTotalHeightDIP();
            this._availableSize = new Size(Math.max(rect.width * zoomFactor - WebInspector.ResponsiveDesignView.RulerWidth, 1),
                                           Math.max(rect.height * zoomFactor - rulerTotalHeight, 1));
        }
        return this._availableSize;
    },

    /**
     * @param {!Element} element
     * @param {boolean} vertical
     * @return {!WebInspector.ResizerWidget}
     */
    _createResizer: function(element, vertical)
    {
        var resizer = new WebInspector.ResizerWidget();
        resizer.addElement(element);
        resizer.setVertical(vertical);
        resizer.addEventListener(WebInspector.ResizerWidget.Events.ResizeStart, this._onResizeStart, this);
        resizer.addEventListener(WebInspector.ResizerWidget.Events.ResizeUpdate, this._onResizeUpdate, this);
        resizer.addEventListener(WebInspector.ResizerWidget.Events.ResizeEnd, this._onResizeEnd, this);
        return resizer;
    },

    /**
     * @param {!WebInspector.Event} event
     */
    _onResizeStart: function(event)
    {
        this._drawContentsSize = false;
        var available = this._availableDipSize();
        this._slowPositionStart = null;
        this._resizeStartSize = event.target.isVertical() ? (this._dipHeight || available.height) : (this._dipWidth || available.width);
        this.dispatchEventToListeners(WebInspector.OverridesSupport.PageResizer.Events.FixedScaleRequested, true);
        this._updateUI();
    },

    /**
     * @param {!WebInspector.Event} event
     */
    _onResizeUpdate: function(event)
    {
        if (event.data.shiftKey !== !!this._slowPositionStart)
            this._slowPositionStart = event.data.shiftKey ? event.data.currentPosition : null;
        var cssOffset = this._slowPositionStart ? (event.data.currentPosition - this._slowPositionStart) / 10 + this._slowPositionStart - event.data.startPosition : event.data.currentPosition - event.data.startPosition;
        var dipOffset = Math.round(cssOffset * WebInspector.zoomManager.zoomFactor());
        var newSize = this._resizeStartSize + dipOffset;
        newSize = Math.round(newSize / (this._scale || 1));
        newSize = Math.max(Math.min(newSize, WebInspector.OverridesSupport.MaxDeviceSize), 1);
        var requested = {};
        if (event.target.isVertical())
            requested.height = newSize;
        else
            requested.width = newSize;
        this.dispatchEventToListeners(WebInspector.OverridesSupport.PageResizer.Events.ResizeRequested, requested);
    },

    /**
     * @param {!WebInspector.Event} event
     */
    _onResizeEnd: function(event)
    {
        this._drawContentsSize = true;
        this.dispatchEventToListeners(WebInspector.OverridesSupport.PageResizer.Events.FixedScaleRequested, false);
        delete this._resizeStartSize;
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
        drawGrid(dipScrollX, dipScrollY, darkLineColor, gridSubStep);
        drawGrid(dipScrollX, dipScrollY, lightLineColor, gridStep);

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
            context.fillStyle = contentsSizeColor;
            var visibleContentsWidth = Math.max(0, Math.min(dipGridWidth, this._viewport.contentsWidth * scale - dipScrollX));
            var visibleContentsHeight = Math.max(0, Math.min(dipGridHeight, this._viewport.contentsHeight * scale - dipScrollY));
            context.fillRect(0, 0, visibleContentsWidth, visibleContentsHeight);
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
        var availableDip = this._availableDipSize();
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
            this._warningMessage.style.height = cssCanvasOffset;
            this._pageScaleContainer.style.top = cssCanvasOffset;
            this._mediaInspectorContainer.style.left = cssRulerWidth;
            this._mediaInspectorContainer.style.marginTop = cssRulerHeight;
        }

        var cssWidth = (this._dipWidth ? this._dipWidth : availableDip.width) / zoomFactor;
        var cssHeight = (this._dipHeight ? this._dipHeight : availableDip.height) / zoomFactor;
        if (this._cachedCssWidth !== cssWidth || this._cachedCssHeight !== cssHeight) {
            this._slidersContainer.style.width = cssWidth + "px";
            this._slidersContainer.style.height = cssHeight + "px";
            this._inspectedPagePlaceholder.onResize();
        }

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
            this._cachedMediaInspectorHeight !== mediaInspectorHeight;

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
        this._cachedZoomFactor = zoomFactor;
        this._cachedViewport = this._viewport;
        this._cachedDrawContentsSize = this._drawContentsSize;
        this._cachedMediaInspectorHeight = mediaInspectorHeight;
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
        if (!newSize.isEqual(oldSize))
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
        var buttonsStatusBar = new WebInspector.StatusBar(this._toolbarElement);
        buttonsStatusBar.makeVertical();
        buttonsStatusBar.setColor("white");
        buttonsStatusBar.setToggledColor("rgb(105, 194, 236)");
        buttonsStatusBar.element.classList.add("responsive-design-section", "responsive-design-section-buttons");

        var resetButton = new WebInspector.StatusBarButton(WebInspector.UIString("Reset all overrides."), "clear-status-bar-item");
        buttonsStatusBar.appendStatusBarItem(resetButton);
        resetButton.addEventListener("click", WebInspector.overridesSupport.reset, WebInspector.overridesSupport);

        // Media Query Inspector.
        this._toggleMediaInspectorButton = new WebInspector.StatusBarButton(WebInspector.UIString("Media queries not found"), "waterfall-status-bar-item");
        this._toggleMediaInspectorButton.setToggled(WebInspector.settings.showMediaQueryInspector.get());
        this._toggleMediaInspectorButton.setEnabled(false);
        this._toggleMediaInspectorButton.addEventListener("click", this._onToggleMediaInspectorButtonClick, this);
        WebInspector.settings.showMediaQueryInspector.addChangeListener(this._updateMediaQueryInspector, this);
        buttonsStatusBar.appendStatusBarItem(this._toggleMediaInspectorButton);
    },

    _createDeviceSection: function()
    {
        var deviceSection = this._toolbarElement.createChild("div", "responsive-design-section responsive-design-section-device");

        var separator = deviceSection.createChild("div", "responsive-design-section-decorator");

        // Device.
        var deviceElement = deviceSection.createChild("div", "responsive-design-suite responsive-design-suite-top").createChild("div");

        var fieldsetElement = deviceElement.createChild("fieldset");
        fieldsetElement.createChild("label").textContent = WebInspector.UIString("Device");
        var deviceSelectElement = WebInspector.OverridesUI.createDeviceSelect();
        fieldsetElement.appendChild(deviceSelectElement);
        deviceSelectElement.classList.add("responsive-design-device-select");

        var detailsElement = deviceSection.createChild("div", "responsive-design-suite");

        // Dimensions.
        var screenElement = detailsElement.createChild("div", "");
        fieldsetElement = screenElement.createChild("fieldset");

        var emulateResolutionCheckbox = WebInspector.SettingsUI.createSettingCheckbox("", WebInspector.overridesSupport.settings.emulateResolution, true, undefined, WebInspector.UIString("Emulate screen resolution"));
        fieldsetElement.appendChild(emulateResolutionCheckbox);

        var resolutionIcon = fieldsetElement.createChild("div", "responsive-design-icon responsive-design-icon-resolution");
        resolutionIcon.title = WebInspector.UIString("Screen resolution");
        var resolutionFieldset = WebInspector.SettingsUI.createSettingFieldset(WebInspector.overridesSupport.settings.emulateResolution);
        fieldsetElement.appendChild(resolutionFieldset);

        resolutionFieldset.appendChild(WebInspector.SettingsUI.createSettingInputField("", WebInspector.overridesSupport.settings.deviceWidth, true, 4, "3em", WebInspector.OverridesSupport.deviceSizeValidator, true, true, WebInspector.UIString("\u2013")));
        resolutionFieldset.createTextChild("\u00D7");
        resolutionFieldset.appendChild(WebInspector.SettingsUI.createSettingInputField("", WebInspector.overridesSupport.settings.deviceHeight, true, 4, "3em", WebInspector.OverridesSupport.deviceSizeValidator, true, true, WebInspector.UIString("\u2013")));

        var swapButton = resolutionFieldset.createChild("div", "responsive-design-icon responsive-design-icon-swap");
        swapButton.title = WebInspector.UIString("Swap dimensions");
        swapButton.addEventListener("click", WebInspector.overridesSupport.swapDimensions.bind(WebInspector.overridesSupport), false);

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
        fieldsetElement.appendChild(WebInspector.SettingsUI.createSettingCheckbox(WebInspector.UIString("Fit"), WebInspector.overridesSupport.settings.deviceFitWindow, true, undefined, WebInspector.UIString("Zoom to fit available space")));
    },

    _createNetworkSection: function()
    {
        var networkSection = this._toolbarElement.createChild("div", "responsive-design-section responsive-design-section-network");

        var separator = networkSection.createChild("div", "responsive-design-section-decorator");

        // Bandwidth.
        var bandwidthElement = networkSection.createChild("div", "responsive-design-suite responsive-design-suite-top").createChild("div");
        var fieldsetElement = bandwidthElement.createChild("fieldset");
        var networkCheckbox = fieldsetElement.createChild("label");
        networkCheckbox.textContent = WebInspector.UIString("Network");
        fieldsetElement.appendChild(WebInspector.OverridesUI.createNetworkConditionsSelect());

        // User agent.
        var userAgentElement = networkSection.createChild("div", "responsive-design-suite").createChild("div");
        fieldsetElement = userAgentElement.createChild("fieldset");
        fieldsetElement.appendChild(WebInspector.SettingsUI.createSettingInputField("UA", WebInspector.overridesSupport.settings.userAgent, false, 0, "", undefined, false, false, WebInspector.UIString("No override")));
    },

    _onToggleMediaInspectorButtonClick: function()
    {
        WebInspector.settings.showMediaQueryInspector.set(!this._toggleMediaInspectorButton.toggled());
    },

    _updateMediaQueryInspector: function()
    {
        this._toggleMediaInspectorButton.setToggled(WebInspector.settings.showMediaQueryInspector.get());
        if (this._mediaInspector.isShowing() === WebInspector.settings.showMediaQueryInspector.get())
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
        var message = WebInspector.settings.disableOverridesWarning.get() ? "" : WebInspector.overridesSupport.warningMessage();
        if (this._warning === message)
            return;
        this._warning = message;
        this._warningMessage.classList.toggle("hidden", !message);
        this._warningMessage.querySelector("span").textContent = message;
        this._invalidateCache();
        this.onResize();
    },

    _disableOverridesWarnings: function()
    {
        WebInspector.settings.disableOverridesWarning.set(true);
    },

    _showEmulationInDrawer: function()
    {
        WebInspector.Revealer.reveal(WebInspector.overridesSupport);
    },

    /**
     * @param {!WebInspector.Event} event
     */
    _viewportChanged: function(event)
    {
        var viewport = /** @type {?PageAgent.Viewport} */ (event.data);
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
     * @param {!WebInspector.Throttler.FinishCallback} finishCallback
     */
    _updateUIThrottled: function(finishCallback)
    {
        this._updateUI();
        finishCallback();
    },

    /**
     * @param {boolean} increase
     * @param {!Event} event
     */
    _pageScaleButtonClicked: function(increase, event)
    {
        this._pageScaleFactorThrottler.schedule(updatePageScaleFactor.bind(this));

        /**
         * @param {!WebInspector.Throttler.FinishCallback} finishCallback
         * @this {WebInspector.ResponsiveDesignView}
         */
        function updatePageScaleFactor(finishCallback)
        {
            if (this._target && this._viewport) {
                var value = this._viewport.pageScaleFactor;
                value = increase ? value * 1.1 : value / 1.1;
                value = Math.min(this._viewport.maximumPageScaleFactor, value);
                value = Math.max(this._viewport.minimumPageScaleFactor, value)
                this._target.pageAgent().setPageScaleFactor(value);
            }
            finishCallback();
        }
    },

    _resetPageScale: function()
    {
        this._pageScaleFactorThrottler.schedule(updatePageScaleFactor.bind(this));

        /**
         * @param {!WebInspector.Throttler.FinishCallback} finishCallback
         * @this {WebInspector.ResponsiveDesignView}
         */
        function updatePageScaleFactor(finishCallback)
        {
            if (this._target && this._viewport && this._viewport.minimumPageScaleFactor <= 1 && this._viewport.maximumPageScaleFactor >= 1)
                this._target.pageAgent().setPageScaleFactor(1);
            finishCallback();
        }
    },

    __proto__: WebInspector.VBox.prototype
};
