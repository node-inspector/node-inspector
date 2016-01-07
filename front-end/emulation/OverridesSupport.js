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
 * @constructor
 * @extends {WebInspector.Object}
 */
WebInspector.OverridesSupport = function()
{
    this._touchEmulationSuspended = false;
    this._emulateMobileEnabled = false;
    this._userAgent = "";
    this._pageResizer = null;
    this._deviceScale = 1;
    this._fixedDeviceScale = false;
    this._initialized = false;
    this._deviceMetricsThrottler = new WebInspector.Throttler(0);

    this.settings = {};
    this.settings._emulationEnabled = WebInspector.settings.createSetting("emulationEnabled", false);

    this.settings.userAgent = WebInspector.settings.createSetting("userAgent", "");

    this.settings.emulateResolution = WebInspector.settings.createSetting("emulateResolution", true);
    this.settings.deviceWidth = WebInspector.settings.createSetting("deviceWidth", 360);
    this.settings.deviceHeight = WebInspector.settings.createSetting("deviceHeight", 640);
    this.settings.deviceScaleFactor = WebInspector.settings.createSetting("deviceScaleFactor", 0);
    this.settings.deviceFitWindow = WebInspector.settings.createSetting("deviceFitWindow", true);
    this.settings.emulateMobile = WebInspector.settings.createSetting("emulateMobile", false);

    this.settings.emulateTouch = WebInspector.settings.createSetting("emulateTouch", false);

    this.settings.overrideGeolocation = WebInspector.settings.createSetting("overrideGeolocation", false);
    this.settings.geolocationOverride = WebInspector.settings.createSetting("geolocationOverride", "");

    this.settings.overrideDeviceOrientation = WebInspector.settings.createSetting("overrideDeviceOrientation", false);
    this.settings.deviceOrientationOverride = WebInspector.settings.createSetting("deviceOrientationOverride", "");

    this.settings.screenOrientationOverride = WebInspector.settings.createSetting("screenOrientationOverride", "");

    this.settings.overrideCSSMedia = WebInspector.settings.createSetting("overrideCSSMedia", false);
    this.settings.emulatedCSSMedia = WebInspector.settings.createSetting("emulatedCSSMedia", "print");

    this.settings.javaScriptDisabled = WebInspector.moduleSetting("javaScriptDisabled");
}

WebInspector.OverridesSupport.Events = {
    OverridesWarningUpdated: "OverridesWarningUpdated",
    EmulationStateChanged: "EmulationStateChanged"
}

WebInspector.OverridesSupport.MaxDeviceSize = 9999;

/**
 * @interface
 * @extends {WebInspector.EventTarget}
 */
WebInspector.OverridesSupport.PageResizer = function()
{
};

WebInspector.OverridesSupport.PageResizer.Events = {
    AvailableSizeChanged: "AvailableSizeChanged",
    ResizeRequested: "ResizeRequested",
    FixedScaleRequested: "FixedScaleRequested",
    InsetsChanged: "InsetsChanged"
};

WebInspector.OverridesSupport.PageResizer.prototype = {
    /**
     * Zero width and height mean default size.
     * Scale should be applied to page-scale-dependent UI bits. Zero means no scale.
     * @param {number} dipWidth
     * @param {number} dipHeight
     * @param {number} scale
     */
    update: function(dipWidth, dipHeight, scale) { }
};

/** @typedef {{width: number, height: number, deviceScaleFactor: number, userAgent: string, touch: boolean, mobile: boolean}} */
WebInspector.OverridesSupport.Device = {};

/**
 * @constructor
 * @param {number} latitude
 * @param {number} longitude
 * @param {string} error
 */
WebInspector.OverridesSupport.GeolocationPosition = function(latitude, longitude, error)
{
    this.latitude = latitude;
    this.longitude = longitude;
    this.error = error;
}

WebInspector.OverridesSupport.GeolocationPosition.prototype = {
    /**
     * @return {string}
     */
    toSetting: function()
    {
        return (typeof this.latitude === "number" && typeof this.longitude === "number" && typeof this.error === "string") ? this.latitude + "@" + this.longitude + ":" + this.error : "";
    }
}

/**
 * @return {!WebInspector.OverridesSupport.GeolocationPosition}
 */
WebInspector.OverridesSupport.GeolocationPosition.parseSetting = function(value)
{
    if (value) {
        var splitError = value.split(":");
        if (splitError.length === 2) {
            var splitPosition = splitError[0].split("@");
            if (splitPosition.length === 2)
                return new WebInspector.OverridesSupport.GeolocationPosition(parseFloat(splitPosition[0]), parseFloat(splitPosition[1]), splitError[1]);
        }
    }
    return new WebInspector.OverridesSupport.GeolocationPosition(0, 0, "");
}

/**
 * @return {?WebInspector.OverridesSupport.GeolocationPosition}
 */
WebInspector.OverridesSupport.GeolocationPosition.parseUserInput = function(latitudeString, longitudeString, errorStatus)
{
    function isUserInputValid(value)
    {
        if (!value)
            return true;
        return /^[-]?[0-9]*[.]?[0-9]*$/.test(value);
    }

    if (!latitudeString && !longitudeString)
        return null;

    var isLatitudeValid = isUserInputValid(latitudeString);
    var isLongitudeValid = isUserInputValid(longitudeString);

    if (!isLatitudeValid && !isLongitudeValid)
        return null;

    var latitude = isLatitudeValid ? parseFloat(latitudeString) : -1;
    var longitude = isLongitudeValid ? parseFloat(longitudeString) : -1;

    return new WebInspector.OverridesSupport.GeolocationPosition(latitude, longitude, errorStatus ? "PositionUnavailable" : "");
}

/**
 * @constructor
 * @param {number} alpha
 * @param {number} beta
 * @param {number} gamma
 */
WebInspector.OverridesSupport.DeviceOrientation = function(alpha, beta, gamma)
{
    this.alpha = alpha;
    this.beta = beta;
    this.gamma = gamma;
}

WebInspector.OverridesSupport.DeviceOrientation.prototype = {
    /**
     * @return {string}
     */
    toSetting: function()
    {
        return JSON.stringify(this);
    }
}

/**
 * @return {!WebInspector.OverridesSupport.DeviceOrientation}
 */
WebInspector.OverridesSupport.DeviceOrientation.parseSetting = function(value)
{
    if (value) {
        var jsonObject = JSON.parse(value);
        return new WebInspector.OverridesSupport.DeviceOrientation(jsonObject.alpha, jsonObject.beta, jsonObject.gamma);
    }
    return new WebInspector.OverridesSupport.DeviceOrientation(0, 0, 0);
}

/**
 * @return {?WebInspector.OverridesSupport.DeviceOrientation}
 */
WebInspector.OverridesSupport.DeviceOrientation.parseUserInput = function(alphaString, betaString, gammaString)
{
    function isUserInputValid(value)
    {
        if (!value)
            return true;
        return /^[-]?[0-9]*[.]?[0-9]*$/.test(value);
    }

    if (!alphaString && !betaString && !gammaString)
        return null;

    var isAlphaValid = isUserInputValid(alphaString);
    var isBetaValid = isUserInputValid(betaString);
    var isGammaValid = isUserInputValid(gammaString);

    if (!isAlphaValid && !isBetaValid && !isGammaValid)
        return null;

    var alpha = isAlphaValid ? parseFloat(alphaString) : -1;
    var beta = isBetaValid ? parseFloat(betaString) : -1;
    var gamma = isGammaValid ? parseFloat(gammaString) : -1;

    return new WebInspector.OverridesSupport.DeviceOrientation(alpha, beta, gamma);
}

/**
 * @param {string} value
 * @return {string}
 */
WebInspector.OverridesSupport.deviceSizeValidator = function(value)
{
    if (!value || (/^[\d]+$/.test(value) && value >= 0 && value <= WebInspector.OverridesSupport.MaxDeviceSize))
        return "";
    return WebInspector.UIString("Value must be non-negative integer");
}

/**
 * @param {string} value
 * @return {string}
 */
WebInspector.OverridesSupport.deviceScaleFactorValidator = function(value)
{
    if (!value || (/^[\d]+(\.\d+)?|\.\d+$/.test(value) && value >= 0 && value <= 10))
        return "";
    return WebInspector.UIString("Value must be non-negative float");
}

WebInspector.OverridesSupport._touchEventsScriptIdSymbol = Symbol("OverridesSupport.touchEventsScriptIdSymbol");

WebInspector.OverridesSupport.prototype = {
    /**
     * @return {boolean}
     */
    canEmulate: function()
    {
        return !!this._target && this._targetCanEmulate;
    },

    /**
     * @return {boolean}
     */
    emulationEnabled: function()
    {
        return this.canEmulate() && this.settings._emulationEnabled.get();
    },

    /**
     * @param {boolean} enabled
     */
    setEmulationEnabled: function(enabled)
    {
        if (this.canEmulate()) {
            this.settings._emulationEnabled.set(enabled);
            this.dispatchEventToListeners(WebInspector.OverridesSupport.Events.EmulationStateChanged);
            if (enabled && this.settings.emulateResolution.get())
                this._target.emulationAgent().resetScrollAndPageScaleFactor();
        }
    },

    /**
     * @param {!WebInspector.Target} target
     * @param {function()} callback
     */
    init: function(target, callback)
    {
        if (target.isPage())
            target.emulationAgent().canEmulate(canEmulateCallback.bind(this));
        else
            canEmulateCallback.call(this, null, false);

        /**
         * @param {?Protocol.Error} error
         * @param {boolean} canEmulate
         * @this {WebInspector.OverridesSupport}
         */
        function canEmulateCallback(error, canEmulate)
        {
            this._target = target;
            this._targetCanEmulate = !error && canEmulate;
            this._initialized = true;

            if (this.canEmulate()) {
                target.resourceTreeModel.addEventListener(WebInspector.ResourceTreeModel.EventTypes.MainFrameNavigated, this._onMainFrameNavigated, this);
                var domModel = WebInspector.DOMModel.fromTarget(this._target);
                if (domModel)
                    domModel.addEventListener(WebInspector.DOMModel.Events.InspectModeWillBeToggled, this._inspectModeWillBeToggled, this);
                this._applyInitialOverrides();
            }

            this.dispatchEventToListeners(WebInspector.OverridesSupport.Events.EmulationStateChanged);

            callback();
        }
    },

    /**
     * @param {?WebInspector.OverridesSupport.PageResizer} pageResizer
     * @param {!Size} availableSize
     * @param {!Insets} insets
     */
    setPageResizer: function(pageResizer, availableSize, insets)
    {
        if (pageResizer === this._pageResizer)
            return;

        if (this._pageResizer) {
            this._pageResizer.removeEventListener(WebInspector.OverridesSupport.PageResizer.Events.AvailableSizeChanged, this._onPageResizerAvailableSizeChanged, this);
            this._pageResizer.removeEventListener(WebInspector.OverridesSupport.PageResizer.Events.ResizeRequested, this._onPageResizerResizeRequested, this);
            this._pageResizer.removeEventListener(WebInspector.OverridesSupport.PageResizer.Events.FixedScaleRequested, this._onPageResizerFixedScaleRequested, this);
            this._pageResizer.removeEventListener(WebInspector.OverridesSupport.PageResizer.Events.InsetsChanged, this._onPageResizerInsetsChanged, this);
        }
        this._pageResizer = pageResizer;
        this._pageResizerAvailableSize = availableSize;
        this._pageResizerInsets = insets;
        if (this._pageResizer) {
            this._pageResizer.addEventListener(WebInspector.OverridesSupport.PageResizer.Events.AvailableSizeChanged, this._onPageResizerAvailableSizeChanged, this);
            this._pageResizer.addEventListener(WebInspector.OverridesSupport.PageResizer.Events.ResizeRequested, this._onPageResizerResizeRequested, this);
            this._pageResizer.addEventListener(WebInspector.OverridesSupport.PageResizer.Events.FixedScaleRequested, this._onPageResizerFixedScaleRequested, this);
            this._pageResizer.addEventListener(WebInspector.OverridesSupport.PageResizer.Events.InsetsChanged, this._onPageResizerInsetsChanged, this);
        }
        this._deviceMetricsChanged(false);
    },

    /**
     * @param {!WebInspector.OverridesSupport.Device} device
     */
    emulateDevice: function(device)
    {
        this._deviceMetricsChangedListenerMuted = true;
        this._userAgentChangedListenerMuted = true;
        this.settings.userAgent.set(device.userAgent);
        this.settings.emulateResolution.set(true);
        this.settings.deviceWidth.set(device.width);
        this.settings.deviceHeight.set(device.height);
        this.settings.deviceScaleFactor.set(device.deviceScaleFactor);
        this.settings.emulateTouch.set(device.touch);
        this.settings.emulateMobile.set(device.mobile);
        delete this._deviceMetricsChangedListenerMuted;
        delete this._userAgentChangedListenerMuted;

        if (this._initialized) {
            this._deviceMetricsChanged(true);
            this._userAgentChanged();
        }
    },

    reset: function()
    {
        this._deviceMetricsChangedListenerMuted = true;
        this._userAgentChangedListenerMuted = true;
        this.settings.userAgent.set("");
        this.settings.emulateResolution.set(false);
        this.settings.deviceScaleFactor.set(0);
        this.settings.emulateTouch.set(false);
        this.settings.emulateMobile.set(false);
        this.settings.overrideDeviceOrientation.set(false);
        this.settings.screenOrientationOverride.set("");
        this.settings.overrideGeolocation.set(false);
        this.settings.overrideCSSMedia.set(false);
        delete this._deviceMetricsChangedListenerMuted;
        delete this._userAgentChangedListenerMuted;

        if (this._initialized) {
            this._deviceMetricsChanged(false);
            this._userAgentChanged();
        }
    },

    /**
     * @param {!WebInspector.OverridesSupport.Device} device
     * @return {boolean}
     */
    isEmulatingDevice: function(device)
    {
        var sameResolution = this.settings.emulateResolution.get() ?
            (this.settings.deviceWidth.get() === device.width && this.settings.deviceHeight.get() === device.height && this.settings.deviceScaleFactor.get() === device.deviceScaleFactor) :
            (!device.width && !device.height && !device.deviceScaleFactor);
        return this.settings.userAgent.get() === device.userAgent
            && this.settings.emulateTouch.get() === device.touch
            && this.settings.emulateMobile.get() === device.mobile
            && sameResolution;
    },

    /**
     * @param {!WebInspector.Event} event
     */
    _inspectModeWillBeToggled: function(event)
    {
        var inspectModeEnabled = /** @type {boolean} */ (event.data);
        this._touchEmulationSuspended = inspectModeEnabled;
        this._emulateTouchEventsChanged();
    },

    _applyInitialOverrides: function()
    {
        this.settings._emulationEnabled.addChangeListener(this._userAgentChanged, this);
        this.settings.userAgent.addChangeListener(this._userAgentChanged, this);

        this.settings._emulationEnabled.addChangeListener(this._deviceMetricsChanged.bind(this, false));
        this.settings.emulateResolution.addChangeListener(this._deviceMetricsChanged.bind(this, false));
        this.settings.deviceWidth.addChangeListener(this._deviceMetricsChanged.bind(this, false));
        this.settings.deviceHeight.addChangeListener(this._deviceMetricsChanged.bind(this, false));
        this.settings.deviceScaleFactor.addChangeListener(this._deviceMetricsChanged.bind(this, false));
        this.settings.emulateMobile.addChangeListener(this._deviceMetricsChanged.bind(this, false));
        this.settings.deviceFitWindow.addChangeListener(this._deviceMetricsChanged.bind(this, false));

        this.settings._emulationEnabled.addChangeListener(this._geolocationPositionChanged, this);
        this.settings.overrideGeolocation.addChangeListener(this._geolocationPositionChanged, this);
        this.settings.geolocationOverride.addChangeListener(this._geolocationPositionChanged, this);

        this.settings._emulationEnabled.addChangeListener(this._deviceOrientationChanged, this);
        this.settings.overrideDeviceOrientation.addChangeListener(this._deviceOrientationChanged, this);
        this.settings.deviceOrientationOverride.addChangeListener(this._deviceOrientationChanged, this);

        this.settings._emulationEnabled.addChangeListener(this._screenOrientationChanged, this);
        this.settings.screenOrientationOverride.addChangeListener(this._screenOrientationChanged, this);

        this.settings._emulationEnabled.addChangeListener(this._emulateTouchEventsChanged, this);
        this.settings.emulateTouch.addChangeListener(this._emulateTouchEventsChanged, this);

        this.settings._emulationEnabled.addChangeListener(this._cssMediaChanged, this);
        this.settings.overrideCSSMedia.addChangeListener(this._cssMediaChanged, this);
        this.settings.emulatedCSSMedia.addChangeListener(this._cssMediaChanged, this);

        this.settings.javaScriptDisabled.addChangeListener(this._javaScriptDisabledChanged, this);
        this._javaScriptDisabledChanged();

        this.settings._emulationEnabled.addChangeListener(this._showRulersChanged, this);
        WebInspector.moduleSetting("showMetricsRulers").addChangeListener(this._showRulersChanged, this);
        this._showRulersChanged();

        if (this.emulationEnabled()) {
            if (this.settings.overrideDeviceOrientation.get())
                this._deviceOrientationChanged();

            if (this.settings.screenOrientationOverride.get())
                this._screenOrientationChanged();

            if (this.settings.overrideGeolocation.get())
                this._geolocationPositionChanged();

            if (this.settings.emulateTouch.get())
                this._emulateTouchEventsChanged();

            if (this.settings.overrideCSSMedia.get())
                this._cssMediaChanged();

            this._deviceMetricsChanged(true);

            this._userAgentChanged();
        }
    },

    _userAgentChanged: function()
    {
        if (this._userAgentChangedListenerMuted)
            return;
        var userAgent = this.emulationEnabled() ? this.settings.userAgent.get() : "";
        WebInspector.multitargetNetworkManager.setUserAgentOverride(userAgent);
        if (this._userAgent !== userAgent)
            this._updateUserAgentWarningMessage(WebInspector.UIString("You might need to reload the page for proper user agent spoofing and viewport rendering."));
        this._userAgent = userAgent;
    },

    /**
     * @param {!WebInspector.Event} event
     */
    _onPageResizerAvailableSizeChanged: function(event)
    {
        this._pageResizerAvailableSize = /** @type {!Size} */ (event.data.size);
        this._pageResizerInsets = /** @type {!Insets} */ (event.data.insets);
        this._deviceMetricsChanged(false);
    },

    /**
     * @param {!WebInspector.Event} event
     */
    _onPageResizerInsetsChanged: function(event)
    {
        this._pageResizerInsets = /** @type {!Insets} */ (event.data);
    },

    /**
     * @param {!WebInspector.Event} event
     */
    _onPageResizerResizeRequested: function(event)
    {
        if (typeof event.data.width !== "undefined") {
            var width = /** @type {number} */ (event.data.width);
            if (width !== this.settings.deviceWidth.get())
                this.settings.deviceWidth.set(width);
        }
        if (typeof event.data.height !== "undefined") {
            var height = /** @type {number} */ (event.data.height);
            if (height !== this.settings.deviceHeight.get())
                this.settings.deviceHeight.set(height);
        }
    },

    /**
     * @param {!WebInspector.Event} event
     */
    _onPageResizerFixedScaleRequested: function(event)
    {
        this._fixedDeviceScale = /** @type {boolean} */ (event.data);
        this._deviceMetricsChanged(false);
    },

    /**
     * @param {boolean} resetScrollAndPageScale
     */
    _deviceMetricsChanged: function(resetScrollAndPageScale)
    {
        if (!this._initialized)
            return;

        this._showRulersChanged();

        if (this._deviceMetricsChangedListenerMuted)
            return;

        if (!this.emulationEnabled()) {
            this._deviceMetricsThrottler.schedule(clearDeviceMetricsOverride.bind(this));
            if (this._pageResizer)
                this._pageResizer.update(0, 0, 1);
            return;
        }

        var dipWidth = this.settings.emulateResolution.get() ? this.settings.deviceWidth.get() : 0;
        var dipHeight = this.settings.emulateResolution.get() ? this.settings.deviceHeight.get() : 0;

        var overrideWidth = dipWidth;
        var overrideHeight = dipHeight;
        var screenWidth = dipWidth;
        var screenHeight = dipHeight;
        var positionX = 0;
        var positionY = 0;
        var scale = 1;
        if (this._pageResizer) {
            var available = this._pageResizerAvailableSize;
            var insets = this._pageResizerInsets;
            if (this.settings.deviceFitWindow.get()) {
                if (this._fixedDeviceScale) {
                    scale = this._deviceScale;
                } else {
                    scale = 1;
                    while (available.width < (dipWidth + insets.left + insets.right) * scale || available.height < (dipHeight + insets.top + insets.bottom) * scale)
                        scale *= 0.8;
                }
            }

            this._pageResizer.update(Math.min(dipWidth * scale, available.width - insets.left * scale), Math.min(dipHeight * scale, available.height - insets.top * scale), scale);
            if (scale === 1 && available.width >= dipWidth && available.height >= dipHeight) {
                // When we have enough space, no page size override is required. This will speed things up and remove lag.
                overrideWidth = 0;
                overrideHeight = 0;
            }
            if (dipWidth === 0 && dipHeight !== 0)
                overrideWidth = Math.round(available.width / scale);
            if (dipHeight === 0 && dipWidth !== 0)
                overrideHeight = Math.round(available.height / scale);
            screenWidth = dipWidth + insets.left + insets.right;
            screenHeight = dipHeight + insets.top + insets.bottom;
            positionX = insets.left;
            positionY = insets.top;
        }
        this._deviceScale = scale;

        this._deviceMetricsThrottler.schedule(setDeviceMetricsOverride.bind(this));

        /**
         * @this {WebInspector.OverridesSupport}
         * @return {!Promise.<?>}
         */
        function setDeviceMetricsOverride()
        {
            var setDevicePromise = this._target.emulationAgent().setDeviceMetricsOverride(
                overrideWidth, overrideHeight, this.settings.emulateResolution.get() ? this.settings.deviceScaleFactor.get() : 0,
                this.settings.emulateMobile.get(), this._pageResizer ? false : this.settings.deviceFitWindow.get(), scale, 0, 0,
                screenWidth, screenHeight, positionX, positionY, apiCallback.bind(this))
            var allPromises = [ setDevicePromise ];
            if (resetScrollAndPageScale)
                allPromises.push(this._target.emulationAgent().resetScrollAndPageScaleFactor());
            return Promise.all(allPromises);
        }

        /**
         * @this {WebInspector.OverridesSupport}
         * @return {!Promise.<?>}
         */
        function clearDeviceMetricsOverride()
        {
            return this._target.emulationAgent().clearDeviceMetricsOverride(apiCallback.bind(this))
        }

        /**
         * @param {?Protocol.Error} error
         * @this {WebInspector.OverridesSupport}
         */
        function apiCallback(error)
        {
            if (error) {
                this._updateDeviceMetricsWarningMessage(WebInspector.UIString("Screen emulation is not available on this page."));
                this._deviceMetricsOverrideAppliedForTest();
                return;
            }

            var mobileEnabled = this.emulationEnabled() && this.settings.emulateMobile.get();
            if (this._emulateMobileEnabled !== mobileEnabled)
                this._updateDeviceMetricsWarningMessage(WebInspector.UIString("You might need to reload the page for proper user agent spoofing and viewport rendering."));
            this._emulateMobileEnabled = mobileEnabled;
            this._deviceMetricsOverrideAppliedForTest();
        }
    },

    _deviceMetricsOverrideAppliedForTest: function()
    {
        // Used for sniffing in tests.
    },

    _geolocationPositionChanged: function()
    {
        if (!this.emulationEnabled() || !this.settings.overrideGeolocation.get()) {
            this._target.emulationAgent().clearGeolocationOverride();
            return;
        }
        var geolocation = WebInspector.OverridesSupport.GeolocationPosition.parseSetting(this.settings.geolocationOverride.get());
        if (geolocation.error)
            this._target.emulationAgent().setGeolocationOverride();
        else
            this._target.emulationAgent().setGeolocationOverride(geolocation.latitude, geolocation.longitude, 150);
    },

    _deviceOrientationChanged: function()
    {
        if (!this.emulationEnabled() || !this.settings.overrideDeviceOrientation.get()) {
            this._target.deviceOrientationAgent().clearDeviceOrientationOverride();
            return;
        }

        var deviceOrientation = WebInspector.OverridesSupport.DeviceOrientation.parseSetting(this.settings.deviceOrientationOverride.get());
        this._target.deviceOrientationAgent().setDeviceOrientationOverride(deviceOrientation.alpha, deviceOrientation.beta, deviceOrientation.gamma);
    },

    _screenOrientationChanged: function()
    {
        if (!this.emulationEnabled() || !this.settings.screenOrientationOverride.get()) {
            this._target.screenOrientationAgent().clearScreenOrientationOverride();
            return;
        }

        var screenOrientation = this.settings.screenOrientationOverride.get();
        this._target.screenOrientationAgent().setScreenOrientationOverride(screenOrientation === "landscapePrimary" ? 90 : 0, screenOrientation);
    },

    _emulateTouchEventsChanged: function()
    {
        var emulationEnabled = this.emulationEnabled() && this.settings.emulateTouch.get() && !this._touchEmulationSuspended;
        var configuration = this.settings.emulateMobile.get() ? "mobile" : "desktop";
        var target = this._target;

        /**
         * @suppressGlobalPropertiesCheck
         */
        const injectedFunction = function() {
            const touchEvents = ["ontouchstart", "ontouchend", "ontouchmove", "ontouchcancel"];
            var recepients = [window.__proto__, document.__proto__];
            for (var i = 0; i < touchEvents.length; ++i) {
                for (var j = 0; j < recepients.length; ++j) {
                    if (!(touchEvents[i] in recepients[j]))
                        Object.defineProperty(recepients[j], touchEvents[i], { value: null, writable: true, configurable: true, enumerable: true });
                }
            }
        };

        var symbol = WebInspector.OverridesSupport._touchEventsScriptIdSymbol;

        if (typeof target[symbol] !== "undefined") {
            target.pageAgent().removeScriptToEvaluateOnLoad(target[symbol]);
            delete target[symbol];
        }

        if (emulationEnabled)
            target.pageAgent().addScriptToEvaluateOnLoad("(" + injectedFunction.toString() + ")()", scriptAddedCallback);

        /**
         * @param {?Protocol.Error} error
         * @param {string} scriptId
         */
        function scriptAddedCallback(error, scriptId)
        {
            if (error)
                delete target[symbol];
            else
                target[symbol] = scriptId;
        }

        target.emulationAgent().setTouchEmulationEnabled(emulationEnabled, configuration);
    },

    _cssMediaChanged: function()
    {
        var enabled = this.emulationEnabled() && this.settings.overrideCSSMedia.get();
        this._target.emulationAgent().setEmulatedMedia(enabled ? this.settings.emulatedCSSMedia.get() : "");
        var cssModel = WebInspector.CSSStyleModel.fromTarget(this._target);
        if (cssModel)
            cssModel.mediaQueryResultChanged();
    },

    _javaScriptDisabledChanged: function()
    {
        this._target.emulationAgent().setScriptExecutionDisabled(this.settings.javaScriptDisabled.get());
    },

    _pageResizerActive: function()
    {
        return this._pageResizer && this.emulationEnabled();
    },

    _showRulersChanged: function()
    {
        var showRulersValue = WebInspector.moduleSetting("showMetricsRulers").get();
        for (var target of WebInspector.targetManager.targets(WebInspector.Target.Type.Page)) {
            target.pageAgent().setShowViewportSizeOnResize(!this._pageResizerActive(), showRulersValue);
            var domModel = WebInspector.DOMModel.fromTarget(target);
            if (domModel)
                domModel.setHighlightSettings(showRulersValue && !this._pageResizerActive(), showRulersValue);
        }
    },

    _onMainFrameNavigated: function()
    {
        this._deviceMetricsChanged(false);
        this._updateUserAgentWarningMessage("");
        this._updateDeviceMetricsWarningMessage("");
    },

    _dispatchWarningChanged: function()
    {
        this.dispatchEventToListeners(WebInspector.OverridesSupport.Events.OverridesWarningUpdated);
    },

    /**
     * @param {string} warningMessage
     */
    _updateDeviceMetricsWarningMessage: function(warningMessage)
    {
        this._deviceMetricsWarningMessage = warningMessage;
        this._dispatchWarningChanged();
    },

    /**
     * @param {string} warningMessage
     */
    _updateUserAgentWarningMessage: function(warningMessage)
    {
        this._userAgentWarningMessage = warningMessage;
        this._dispatchWarningChanged();
    },

    /**
     * @return {string}
     */
    warningMessage: function()
    {
        return this._deviceMetricsWarningMessage || this._userAgentWarningMessage || "";
    },

    clearWarningMessage: function()
    {
        this._deviceMetricsWarningMessage = "";
        this._userAgentWarningMessage = "";
        this._dispatchWarningChanged();
    },

    swapDimensions: function()
    {
        var width = WebInspector.overridesSupport.settings.deviceWidth.get();
        var height = WebInspector.overridesSupport.settings.deviceHeight.get();
        WebInspector.overridesSupport.settings.deviceWidth.set(height);
        WebInspector.overridesSupport.settings.deviceHeight.set(width);
    },

    __proto__: WebInspector.Object.prototype
}


/**
 * @type {!WebInspector.OverridesSupport}
 */
WebInspector.overridesSupport;
