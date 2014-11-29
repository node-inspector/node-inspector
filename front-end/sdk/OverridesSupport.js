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
 * @implements {WebInspector.TargetManager.Observer}
 * @extends {WebInspector.Object}
 * @param {boolean} responsiveDesignAvailable
 */
WebInspector.OverridesSupport = function(responsiveDesignAvailable)
{
    this._touchEmulationSuspended = false;
    this._emulateMobileEnabled = false;
    this._userAgent = "";
    this._pageResizer = null;
    this._deviceScale = 1;
    this._fixedDeviceScale = false;
    this._initialized = false;
    this._deviceMetricsThrottler = new WebInspector.Throttler(0);
    this._responsiveDesignAvailable = responsiveDesignAvailable;

    this.settings = {};
    this.settings._emulationEnabled = WebInspector.settings.createSetting("emulationEnabled", false);

    this.settings.userAgent = WebInspector.settings.createSetting("userAgent", "");

    this.settings.emulateResolution = WebInspector.settings.createSetting("emulateResolution", true);
    this.settings.deviceWidth = WebInspector.settings.createSetting("deviceWidth", 360);
    this.settings.deviceHeight = WebInspector.settings.createSetting("deviceHeight", 640);
    this.settings.deviceScaleFactor = WebInspector.settings.createSetting("deviceScaleFactor", 0);
    this.settings.deviceFitWindow = WebInspector.settings.createSetting("deviceFitWindow", true);
    this.settings.emulateMobile = WebInspector.settings.createSetting("emulateMobile", false);
    this.settings.customDevicePresets = WebInspector.settings.createSetting("customDevicePresets", []);

    this.settings.emulateTouch = WebInspector.settings.createSetting("emulateTouch", false);

    this.settings.overrideGeolocation = WebInspector.settings.createSetting("overrideGeolocation", false);
    this.settings.geolocationOverride = WebInspector.settings.createSetting("geolocationOverride", "");

    this.settings.overrideDeviceOrientation = WebInspector.settings.createSetting("overrideDeviceOrientation", false);
    this.settings.deviceOrientationOverride = WebInspector.settings.createSetting("deviceOrientationOverride", "");

    this.settings.overrideCSSMedia = WebInspector.settings.createSetting("overrideCSSMedia", false);
    this.settings.emulatedCSSMedia = WebInspector.settings.createSetting("emulatedCSSMedia", "print");

    this.settings.networkConditions = WebInspector.settings.createSetting("networkConditions", {throughput: WebInspector.OverridesSupport.NetworkThroughputUnlimitedValue, latency: 0});

    WebInspector.targetManager.observeTargets(this);
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
    FixedScaleRequested: "FixedScaleRequested"
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

/** @typedef {{title: string, width: number, height: number, deviceScaleFactor: number, userAgent: string, touch: boolean, mobile: boolean}} */
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
            var splitPosition = splitError[0].split("@")
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

    if (!latitudeString ^ !latitudeString)
        return null;

    var isLatitudeValid = isUserInputValid(latitudeString);
    var isLongitudeValid = isUserInputValid(longitudeString);

    if (!isLatitudeValid && !isLongitudeValid)
        return null;

    var latitude = isLatitudeValid ? parseFloat(latitudeString) : -1;
    var longitude = isLongitudeValid ? parseFloat(longitudeString) : -1;

    return new WebInspector.OverridesSupport.GeolocationPosition(latitude, longitude, errorStatus ? "PositionUnavailable" : "");
}

WebInspector.OverridesSupport.GeolocationPosition.clearGeolocationOverride = function()
{
    PageAgent.clearGeolocationOverride();
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

    if (!alphaString ^ !betaString ^ !gammaString)
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

WebInspector.OverridesSupport.DeviceOrientation.clearDeviceOrientationOverride = function()
{
    PageAgent.clearDeviceOrientationOverride();
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

WebInspector.OverridesSupport.NetworkThroughputUnlimitedValue = -1;

/** @typedef {{id: string, title: string, throughput: number, latency: number}} */
WebInspector.OverridesSupport.NetworkConditionsPreset;

WebInspector.OverridesSupport.prototype = {
    /**
     * @return {boolean}
     */
    canEmulate: function()
    {
        return !!this._target && this._target.canEmulate();
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
                this._target.pageAgent().resetScrollAndPageScaleFactor();
        }
    },

    /**
     * @return {boolean}
     */
    responsiveDesignAvailable: function()
    {
        return this._responsiveDesignAvailable;
    },

    /**
     * @param {?WebInspector.OverridesSupport.PageResizer} pageResizer
     * @param {!Size} availableSize
     */
    setPageResizer: function(pageResizer, availableSize)
    {
        if (pageResizer === this._pageResizer)
            return;

        if (this._pageResizer) {
            this._pageResizer.removeEventListener(WebInspector.OverridesSupport.PageResizer.Events.AvailableSizeChanged, this._onPageResizerAvailableSizeChanged, this);
            this._pageResizer.removeEventListener(WebInspector.OverridesSupport.PageResizer.Events.ResizeRequested, this._onPageResizerResizeRequested, this);
            this._pageResizer.removeEventListener(WebInspector.OverridesSupport.PageResizer.Events.FixedScaleRequested, this._onPageResizerFixedScaleRequested, this);
        }
        this._pageResizer = pageResizer;
        this._pageResizerAvailableSize = availableSize;
        if (this._pageResizer) {
            this._pageResizer.addEventListener(WebInspector.OverridesSupport.PageResizer.Events.AvailableSizeChanged, this._onPageResizerAvailableSizeChanged, this);
            this._pageResizer.addEventListener(WebInspector.OverridesSupport.PageResizer.Events.ResizeRequested, this._onPageResizerResizeRequested, this);
            this._pageResizer.addEventListener(WebInspector.OverridesSupport.PageResizer.Events.FixedScaleRequested, this._onPageResizerFixedScaleRequested, this);
        }
        if (this._initialized)
            this._deviceMetricsChanged();
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
            this._deviceMetricsChanged();
            this._userAgentChanged();
            this._target.pageAgent().resetScrollAndPageScaleFactor();
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
        this.settings.overrideGeolocation.set(false);
        this.settings.overrideCSSMedia.set(false);
        this.settings.networkConditions.set({throughput: WebInspector.OverridesSupport.NetworkThroughputUnlimitedValue, latency: 0});
        delete this._deviceMetricsChangedListenerMuted;
        delete this._userAgentChangedListenerMuted;

        if (this._initialized) {
            this._deviceMetricsChanged();
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
     * @return {!WebInspector.OverridesSupport.Device}
     */
    deviceFromCurrentSettings: function()
    {
        var device = {};
        if (this.settings.emulateResolution.get()) {
            device.width = this.settings.deviceWidth.get();
            device.height = this.settings.deviceHeight.get();
        } else {
            device.width = 0;
            device.height = 0;
        }
        device.deviceScaleFactor = this.settings.deviceScaleFactor.get();
        device.touch = this.settings.emulateTouch.get();
        device.mobile = this.settings.emulateMobile.get();
        device.userAgent = this.settings.userAgent.get();
        device.title = "";
        return device;
    },

    /**
     * @param {boolean} suspended
     */
    setTouchEmulationSuspended: function(suspended)
    {
        this._touchEmulationSuspended = suspended;
        if (this._initialized)
            this._emulateTouchEventsChanged();
    },

    applyInitialOverrides: function()
    {
        if (!this._target) {
            this._applyInitialOverridesOnTargetAdded = true;
            return;
        }

        this._initialized = true;

        this.settings._emulationEnabled.addChangeListener(this._userAgentChanged, this);
        this.settings.userAgent.addChangeListener(this._userAgentChanged, this);

        this.settings._emulationEnabled.addChangeListener(this._deviceMetricsChanged, this);
        this.settings.emulateResolution.addChangeListener(this._deviceMetricsChanged, this);
        this.settings.deviceWidth.addChangeListener(this._deviceMetricsChanged, this);
        this.settings.deviceHeight.addChangeListener(this._deviceMetricsChanged, this);
        this.settings.deviceScaleFactor.addChangeListener(this._deviceMetricsChanged, this);
        this.settings.emulateMobile.addChangeListener(this._deviceMetricsChanged, this);
        this.settings.deviceFitWindow.addChangeListener(this._deviceMetricsChanged, this);

        this.settings._emulationEnabled.addChangeListener(this._geolocationPositionChanged, this);
        this.settings.overrideGeolocation.addChangeListener(this._geolocationPositionChanged, this);
        this.settings.geolocationOverride.addChangeListener(this._geolocationPositionChanged, this);

        this.settings._emulationEnabled.addChangeListener(this._deviceOrientationChanged, this);
        this.settings.overrideDeviceOrientation.addChangeListener(this._deviceOrientationChanged, this);
        this.settings.deviceOrientationOverride.addChangeListener(this._deviceOrientationChanged, this);

        this.settings._emulationEnabled.addChangeListener(this._emulateTouchEventsChanged, this);
        this.settings.emulateTouch.addChangeListener(this._emulateTouchEventsChanged, this);

        this.settings._emulationEnabled.addChangeListener(this._cssMediaChanged, this);
        this.settings.overrideCSSMedia.addChangeListener(this._cssMediaChanged, this);
        this.settings.emulatedCSSMedia.addChangeListener(this._cssMediaChanged, this);

        this.settings._emulationEnabled.addChangeListener(this._networkConditionsChanged, this);
        this.settings.networkConditions.addChangeListener(this._networkConditionsChanged, this);

        this.settings._emulationEnabled.addChangeListener(this._showRulersChanged, this);
        WebInspector.settings.showMetricsRulers.addChangeListener(this._showRulersChanged, this);
        this._showRulersChanged();

        if (!this.emulationEnabled())
            return;

        if (this.settings.overrideDeviceOrientation.get())
            this._deviceOrientationChanged();

        if (this.settings.overrideGeolocation.get())
            this._geolocationPositionChanged();

        if (this.settings.emulateTouch.get())
            this._emulateTouchEventsChanged();

        if (this.settings.overrideCSSMedia.get())
            this._cssMediaChanged();

        this._deviceMetricsChanged();
        if (this.settings.emulateResolution.get())
            this._target.pageAgent().resetScrollAndPageScaleFactor();

        this._userAgentChanged();

        if (this.networkThroughputIsLimited())
            this._networkConditionsChanged();
    },

    _userAgentChanged: function()
    {
        if (this._userAgentChangedListenerMuted)
            return;
        var userAgent = this.emulationEnabled() ? this.settings.userAgent.get() : "";
        NetworkAgent.setUserAgentOverride(userAgent);
        if (this._userAgent !== userAgent)
            this._updateUserAgentWarningMessage(WebInspector.UIString("You might need to reload the page for proper user agent spoofing and viewport rendering."));
        this._userAgent = userAgent;
    },

    /**
     * @param {!WebInspector.Event} event
     */
    _onPageResizerAvailableSizeChanged: function(event)
    {
        this._pageResizerAvailableSize = /** @type {!Size} */ (event.data);
        if (this._initialized)
            this._deviceMetricsChanged();
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
        if (this._initialized)
            this._deviceMetricsChanged();
    },

    _deviceMetricsChanged: function()
    {
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
        var scale = 1;
        if (this._pageResizer) {
            var available = this._pageResizerAvailableSize;
            if (this.settings.deviceFitWindow.get()) {
                if (this._fixedDeviceScale) {
                    scale = this._deviceScale;
                } else {
                    scale = 1;
                    while (available.width < dipWidth * scale || available.height < dipHeight * scale)
                        scale *= 0.8;
                }
            }

            this._pageResizer.update(Math.min(dipWidth * scale, available.width), Math.min(dipHeight * scale, available.height), scale);
            if (scale === 1 && available.width >= dipWidth && available.height >= dipHeight) {
                // When we have enough space, no page size override is required. This will speed things up and remove lag.
                overrideWidth = 0;
                overrideHeight = 0;
            }
            if (dipWidth === 0 && dipHeight !== 0)
                overrideWidth = Math.round(available.width / scale);
            if (dipHeight === 0 && dipWidth !== 0)
                overrideHeight = Math.round(available.height / scale);
        }
        this._deviceScale = scale;

        this._deviceMetricsThrottler.schedule(setDeviceMetricsOverride.bind(this));

        /**
         * @param {!WebInspector.Throttler.FinishCallback} finishCallback
         * @this {WebInspector.OverridesSupport}
         */
        function setDeviceMetricsOverride(finishCallback)
        {
            this._target.pageAgent().setDeviceMetricsOverride(
                overrideWidth, overrideHeight, this.settings.emulateResolution.get() ? this.settings.deviceScaleFactor.get() : 0,
                this.settings.emulateMobile.get(), this._pageResizer ? false : this.settings.deviceFitWindow.get(), scale, 0, 0,
                apiCallback.bind(this, finishCallback));
        }

        /**
         * @param {!WebInspector.Throttler.FinishCallback} finishCallback
         * @this {WebInspector.OverridesSupport}
         */
        function clearDeviceMetricsOverride(finishCallback)
        {
            this._target.pageAgent().clearDeviceMetricsOverride(apiCallback.bind(this, finishCallback));
        }

        /**
         * @param {!WebInspector.Throttler.FinishCallback} finishCallback
         * @param {?Protocol.Error} error
         * @this {WebInspector.OverridesSupport}
         */
        function apiCallback(finishCallback, error)
        {
            if (error) {
                this._updateDeviceMetricsWarningMessage(WebInspector.UIString("Screen emulation is not available on this page."));
                this._deviceMetricsOverrideAppliedForTest();
                finishCallback();
                return;
            }

            var mobileEnabled = this.emulationEnabled() && this.settings.emulateMobile.get();
            if (this._emulateMobileEnabled !== mobileEnabled)
                this._updateDeviceMetricsWarningMessage(WebInspector.UIString("You might need to reload the page for proper user agent spoofing and viewport rendering."));
            this._emulateMobileEnabled = mobileEnabled;
            this._deviceMetricsOverrideAppliedForTest();
            finishCallback();
        }
    },

    _deviceMetricsOverrideAppliedForTest: function()
    {
        // Used for sniffing in tests.
    },

    _geolocationPositionChanged: function()
    {
        if (!this.emulationEnabled() || !this.settings.overrideGeolocation.get()) {
            PageAgent.clearGeolocationOverride();
            return;
        }
        var geolocation = WebInspector.OverridesSupport.GeolocationPosition.parseSetting(this.settings.geolocationOverride.get());
        if (geolocation.error)
            PageAgent.setGeolocationOverride();
        else
            PageAgent.setGeolocationOverride(geolocation.latitude, geolocation.longitude, 150);
    },

    _deviceOrientationChanged: function()
    {
        if (!this.emulationEnabled() || !this.settings.overrideDeviceOrientation.get()) {
            PageAgent.clearDeviceOrientationOverride();
            return;
        }

        var deviceOrientation = WebInspector.OverridesSupport.DeviceOrientation.parseSetting(this.settings.deviceOrientationOverride.get());
        PageAgent.setDeviceOrientationOverride(deviceOrientation.alpha, deviceOrientation.beta, deviceOrientation.gamma);
    },

    _emulateTouchEventsChanged: function()
    {
        var emulateTouch = this.emulationEnabled() && this.settings.emulateTouch.get() && !this._touchEmulationSuspended;
        var targets = WebInspector.targetManager.targets();
        for (var i = 0; i < targets.length; ++i)
            targets[i].domModel.emulateTouchEventObjects(emulateTouch, this.settings.emulateMobile.get() ? "mobile" : "desktop");
    },

    _cssMediaChanged: function()
    {
        var enabled = this.emulationEnabled() && this.settings.overrideCSSMedia.get();
        PageAgent.setEmulatedMedia(enabled ? this.settings.emulatedCSSMedia.get() : "");
        var targets = WebInspector.targetManager.targets();
        for (var i = 0; i < targets.length; ++i)
            targets[i].cssModel.mediaQueryResultChanged();
    },

    _networkConditionsChanged: function()
    {
        if (!this.emulationEnabled() || !this.networkThroughputIsLimited()) {
            NetworkAgent.emulateNetworkConditions(false, 0, 0, 0);
        } else {
            var conditions = this.settings.networkConditions.get();
            var throughput = conditions.throughput;
            var latency = conditions.latency;
            var offline = !throughput && !latency;
            NetworkAgent.emulateNetworkConditions(offline, latency, throughput, throughput);
        }
    },

    _pageResizerActive: function()
    {
        return this._pageResizer && this.emulationEnabled();
    },

    /**
     * @return {boolean}
     */
    showMetricsRulers: function()
    {
        return WebInspector.settings.showMetricsRulers.get() && !this._pageResizerActive();
    },

    /**
     * @return {boolean}
     */
    showExtensionLines: function()
    {
        return WebInspector.settings.showMetricsRulers.get();
    },

    _showRulersChanged: function()
    {
        PageAgent.setShowViewportSizeOnResize(!this._pageResizerActive(), WebInspector.settings.showMetricsRulers.get());
    },

    _onMainFrameNavigated: function()
    {
        if (this._initialized)
            this._deviceMetricsChanged();
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

    /**
     * @param {!WebInspector.Target} target
     */
    targetAdded: function(target)
    {
        if (this._target)
            return;
        this._target = target;
        target.resourceTreeModel.addEventListener(WebInspector.ResourceTreeModel.EventTypes.MainFrameNavigated, this._onMainFrameNavigated, this);

        if (this._applyInitialOverridesOnTargetAdded) {
            delete this._applyInitialOverridesOnTargetAdded;
            this.applyInitialOverrides();
        }
        this.dispatchEventToListeners(WebInspector.OverridesSupport.Events.EmulationStateChanged);
    },

    swapDimensions: function()
    {
        var width = WebInspector.overridesSupport.settings.deviceWidth.get();
        var height = WebInspector.overridesSupport.settings.deviceHeight.get();
        WebInspector.overridesSupport.settings.deviceWidth.set(height);
        WebInspector.overridesSupport.settings.deviceHeight.set(width);
    },

    /**
     * @param {!WebInspector.Target} target
     */
    targetRemoved: function(target)
    {
        if (target === this._target) {
            target.resourceTreeModel.removeEventListener(WebInspector.ResourceTreeModel.EventTypes.MainFrameNavigated, this._onMainFrameNavigated, this);
            delete this._target;
            this.dispatchEventToListeners(WebInspector.OverridesSupport.Events.EmulationStateChanged);
        }
    },

    /**
     * @return {boolean}
     */
    networkThroughputIsLimited: function()
    {
        var conditions = this.settings.networkConditions.get();
        return conditions.throughput !== WebInspector.OverridesSupport.NetworkThroughputUnlimitedValue;
    },

    __proto__: WebInspector.Object.prototype
}


/**
 * @type {!WebInspector.OverridesSupport}
 */
WebInspector.overridesSupport;
