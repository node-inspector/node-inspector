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
 * @extends {WebInspector.View}
 */
WebInspector.OverridesView = function()
{
    WebInspector.View.call(this);
    this.registerRequiredCSS("helpScreen.css");
    this.element.addStyleClass("fill");
    this.element.addStyleClass("help-window-main");
    this.element.addStyleClass("settings-tab-container");

    var paneContent = this.element.createChild("div", "tabbed-pane-content");

    var headerTitle = paneContent.createChild("header").createChild("h3");
    headerTitle.appendChild(document.createTextNode(WebInspector.UIString("Overrides")));

    var wrapper = paneContent.createChild("div", "help-container-wrapper overrides-view");
    var topContainer = wrapper.createChild("div", "settings-tab help-content");
    var enableOptionsContainer = topContainer.createChild("div", "help-block");

    var enableOnStartupField = WebInspector.SettingsTab.createSettingCheckbox(WebInspector.UIString("Enable on DevTools startup"), WebInspector.settings.enableOverridesOnStartup);
    enableOnStartupField.id = "enable-devtools-on-startup";
    this._enableOnStartupField = enableOnStartupField;
    var enableLabel = this._createNonPersistedCheckbox(WebInspector.UIString("Enable"), this._setOverridesActive.bind(this));
    var enableCheckbox = enableLabel.getElementsByTagName("input")[0];
    enableCheckbox.checked = WebInspector.settings.enableOverridesOnStartup.get();
    enableOptionsContainer.appendChild(enableLabel);
    enableOptionsContainer.appendChild(enableOnStartupField);

    var mainContainer = topContainer.createChild("fieldset", "help-container");
    this._mainContainer = mainContainer;

    function appendBlock(contentElements)
    {
        var blockElement = mainContainer.createChild("div", "help-block");
        for (var i = 0; i < contentElements.length; ++i)
            blockElement.appendChild(contentElements[i]);
    }

    this.containerElement = topContainer;
    appendBlock([this._createUserAgentControl()]);
    appendBlock([this._createDeviceMetricsControl()]);
    appendBlock([this._createGeolocationOverrideControl()]);
    appendBlock([this._createDeviceOrientationOverrideControl()]);
    appendBlock([WebInspector.SettingsTab.createSettingCheckbox(WebInspector.UIString("Emulate touch events"), WebInspector.settings.emulateTouchEvents)]);
    appendBlock([this._createMediaEmulationElement()]);
    this._setOverridesActive(enableCheckbox.checked);

    this._statusElement = document.createElement("span");
    this._statusElement.textContent = WebInspector.UIString("Overrides");
}

WebInspector.OverridesView.showInDrawer = function()
{
    if (!WebInspector.OverridesView._view)
        WebInspector.OverridesView._view = new WebInspector.OverridesView();
    var view = WebInspector.OverridesView._view;
    WebInspector.showViewInDrawer(view._statusElement, view);
}

WebInspector.OverridesView.prototype = {
    /**
     * @param {boolean} active
     */
    _setOverridesActive: function(active)
    {
        WebInspector.overridesSupport.setOverridesActive(active);
        this._mainContainer.disabled = !active;
        this._enableOnStartupField.disabled = !active;
    },

    /**
     * @param {string} name
     * @param {!WebInspector.Setting} setting
     * @param {function(boolean)} callback
     */
    _createSettingCheckbox: function(name, setting, callback)
    {
        var checkbox = WebInspector.SettingsTab.createCheckbox(name, setting.get.bind(setting), listener);

        function listener(value)
        {
            setting.set(value);
            if (callback)
                callback(value);
        }

        return checkbox;
    },

    /**
     * @return {Element}
     */
    _createUserAgentControl: function()
    {
        var checkbox = WebInspector.SettingsTab.createSettingCheckbox(WebInspector.UIString("User Agent"), WebInspector.settings.overrideUserAgent);
        checkbox.appendChild(this._createUserAgentSelectRowElement());
        return checkbox;
    },

    /**
     * @return {Element}
     */
    _createUserAgentSelectRowElement: function()
    {
        var userAgent = WebInspector.settings.userAgent.get();

        // When present, the third element lists device metrics separated by 'x':
        // - screen width,
        // - screen height,
        // - font scale factor.
        const userAgents = [
            ["Internet Explorer 10", "Mozilla/5.0 (compatible; MSIE 10.0; Windows NT 6.2; Trident/6.0)"],
            ["Internet Explorer 9", "Mozilla/5.0 (compatible; MSIE 9.0; Windows NT 6.1; Trident/5.0)"],
            ["Internet Explorer 8", "Mozilla/4.0 (compatible; MSIE 8.0; Windows NT 6.0; Trident/4.0)"],
            ["Internet Explorer 7", "Mozilla/4.0 (compatible; MSIE 7.0; Windows NT 6.0)"],

            ["Firefox 7 \u2014 Windows", "Mozilla/5.0 (Windows NT 6.1; Intel Mac OS X 10.6; rv:7.0.1) Gecko/20100101 Firefox/7.0.1"],
            ["Firefox 7 \u2014 Mac", "Mozilla/5.0 (Macintosh; Intel Mac OS X 10.6; rv:7.0.1) Gecko/20100101 Firefox/7.0.1"],
            ["Firefox 4 \u2014 Windows", "Mozilla/5.0 (Windows NT 6.1; rv:2.0.1) Gecko/20100101 Firefox/4.0.1"],
            ["Firefox 4 \u2014 Mac", "Mozilla/5.0 (Macintosh; Intel Mac OS X 10.6; rv:2.0.1) Gecko/20100101 Firefox/4.0.1"],
            ["Firefox 14 \u2014 Android Mobile", "Mozilla/5.0 (Android; Mobile; rv:14.0) Gecko/14.0 Firefox/14.0"],
            ["Firefox 14 \u2014 Android Tablet", "Mozilla/5.0 (Android; Tablet; rv:14.0) Gecko/14.0 Firefox/14.0"],

            ["Chrome \u2014 Android Mobile", "Mozilla/5.0 (Linux; Android 4.0.4; Galaxy Nexus Build/IMM76B) AppleWebKit/535.19 (KHTML, like Gecko) Chrome/18.0.1025.133 Mobile Safari/535.19"],
            ["Chrome \u2014 Android Tablet", "Mozilla/5.0 (Linux; Android 4.1.2; Nexus 7 Build/JZ054K) AppleWebKit/535.19 (KHTML, like Gecko) Chrome/18.0.1025.166 Safari/535.19"],

            ["iPhone \u2014 iOS 6", "Mozilla/5.0 (iPhone; CPU iPhone OS 6_0 like Mac OS X) AppleWebKit/536.26 (KHTML, like Gecko) Version/6.0 Mobile/10A5376e Safari/8536.25", "640x1136x1"],
            ["iPhone \u2014 iOS 5", "Mozilla/5.0 (iPhone; CPU iPhone OS 5_0 like Mac OS X) AppleWebKit/534.46 (KHTML, like Gecko) Version/5.1 Mobile/9A334 Safari/7534.48.3", "640x960x1"],
            ["iPhone \u2014 iOS 4", "Mozilla/5.0 (iPhone; U; CPU iPhone OS 4_3_2 like Mac OS X; en-us) AppleWebKit/533.17.9 (KHTML, like Gecko) Version/5.0.2 Mobile/8H7 Safari/6533.18.5", "640x960x1"],
            ["iPad \u2014 iOS 6", "Mozilla/5.0 (iPad; CPU OS 6_0 like Mac OS X) AppleWebKit/536.26 (KHTML, like Gecko) Version/6.0 Mobile/10A5376e Safari/8536.25", "1024x768x1"],
            ["iPad \u2014 iOS 5", "Mozilla/5.0 (iPad; CPU OS 5_0 like Mac OS X) AppleWebKit/534.46 (KHTML, like Gecko) Version/5.1 Mobile/9A334 Safari/7534.48.3", "1024x768x1"],
            ["iPad \u2014 iOS 4", "Mozilla/5.0 (iPad; CPU OS 4_3_2 like Mac OS X; en-us) AppleWebKit/533.17.9 (KHTML, like Gecko) Version/5.0.2 Mobile/8H7 Safari/6533.18.5", "1024x768x1"],

            ["Android 2.3 \u2014 Nexus S", "Mozilla/5.0 (Linux; U; Android 2.3.6; en-us; Nexus S Build/GRK39F) AppleWebKit/533.1 (KHTML, like Gecko) Version/4.0 Mobile Safari/533.1", "480x800x1.1"],
            ["Android 4.0.2 \u2014 Galaxy Nexus", "Mozilla/5.0 (Linux; U; Android 4.0.2; en-us; Galaxy Nexus Build/ICL53F) AppleWebKit/534.30 (KHTML, like Gecko) Version/4.0 Mobile Safari/534.30", "720x1280x1.1"],

            ["BlackBerry \u2014 PlayBook 2.1", "Mozilla/5.0 (PlayBook; U; RIM Tablet OS 2.1.0; en-US) AppleWebKit/536.2+ (KHTML, like Gecko) Version/7.2.1.0 Safari/536.2+", "1024x600x1"],
            ["BlackBerry \u2014 9900", "Mozilla/5.0 (BlackBerry; U; BlackBerry 9900; en-US) AppleWebKit/534.11+ (KHTML, like Gecko) Version/7.0.0.187 Mobile Safari/534.11+", "640x480x1"],
            ["BlackBerry \u2014 BB10", "Mozilla/5.0 (BB10; Touch) AppleWebKit/537.1+ (KHTML, like Gecko) Version/10.0.0.1337 Mobile Safari/537.1+", "768x1280x1"],

            ["MeeGo \u2014 Nokia N9", "Mozilla/5.0 (MeeGo; NokiaN9) AppleWebKit/534.13 (KHTML, like Gecko) NokiaBrowser/8.5.0 Mobile Safari/534.13", "480x854x1"],

            [WebInspector.UIString("Other..."), "Other"]
        ];

        var fieldsetElement = WebInspector.SettingsTab.createSettingFieldset(WebInspector.settings.overrideUserAgent);
        var p = fieldsetElement.createChild("p");
        this._selectElement = p.createChild("select");
        this._otherUserAgentElement = p.createChild("input");
        this._otherUserAgentElement.type = "text";
        this._otherUserAgentElement.value = userAgent;
        this._otherUserAgentElement.title = userAgent;

        var selectionRestored = false;
        for (var i = 0; i < userAgents.length; ++i) {
            var agent = userAgents[i];
            var option = new Option(agent[0], agent[1]);
            option._metrics = agent[2] ? agent[2] : "";
            this._selectElement.add(option);
            if (userAgent === agent[1]) {
                this._selectElement.selectedIndex = i;
                selectionRestored = true;
            }
        }

        if (!selectionRestored) {
            if (!userAgent)
                this._selectElement.selectedIndex = 0;
            else
                this._selectElement.selectedIndex = userAgents.length - 1;
        }

        this._selectElement.addEventListener("change", this._selectionChanged.bind(this, true), false);

        fieldsetElement.addEventListener("dblclick", textDoubleClicked.bind(this), false);
        this._otherUserAgentElement.addEventListener("blur", textChanged.bind(this), false);

        function textDoubleClicked()
        {
            this._selectElement.selectedIndex = userAgents.length - 1;
            this._selectionChanged();
        }

        function textChanged()
        {
            WebInspector.settings.userAgent.set(this._otherUserAgentElement.value);
        }

        return fieldsetElement;
    },

    /**
     * @param {boolean=} isUserGesture
     */
    _selectionChanged: function(isUserGesture)
    {
        var value = this._selectElement.options[this._selectElement.selectedIndex].value;
        if (value !== "Other") {
            WebInspector.settings.userAgent.set(value);
            this._otherUserAgentElement.value = value;
            this._otherUserAgentElement.title = value;
            this._otherUserAgentElement.disabled = true;
        } else {
            this._otherUserAgentElement.disabled = false;
            this._otherUserAgentElement.focus();
        }

        if (isUserGesture) {
            var metrics = this._selectElement.options[this._selectElement.selectedIndex]._metrics;
            this._setDeviceMetricsOverride(WebInspector.OverridesSupport.DeviceMetrics.parseSetting(metrics), false);
        }
    },

    /**
     * Creates an input element under the parentElement with the given id and defaultText.
     * It also sets an onblur event listener.
     * @param {Element} parentElement
     * @param {string} id
     * @param {string} defaultText
     * @param {function(*)} eventListener
     * @param {boolean=} numeric
     * @return {Element} element
     */
    _createInput: function(parentElement, id, defaultText, eventListener, numeric)
    {
        var element = parentElement.createChild("input");
        element.id = id;
        element.type = "text";
        element.maxLength = 12;
        element.style.width = "80px";
        element.value = defaultText;
        element.align = "right";
        if (numeric)
            element.className = "numeric";
        element.addEventListener("blur", eventListener, false);
        return element;
    },

    /**
     * @param {string} title
     * @param {function(boolean)} callback
     */
    _createNonPersistedCheckbox: function(title, callback)
    {
        var labelElement = document.createElement("label");
        var checkboxElement = labelElement.createChild("input");
        checkboxElement.type = "checkbox";
        checkboxElement.checked = false;
        checkboxElement.addEventListener("click", onclick, false);
        labelElement.appendChild(document.createTextNode(title));
        return labelElement;

        function onclick()
        {
            callback(checkboxElement.checked);
        }
    },

    /**
     * @return {Element}
     */
    _createDeviceMetricsControl: function()
    {
        const metricsSetting = WebInspector.settings.deviceMetrics.get();
        var metrics = WebInspector.OverridesSupport.DeviceMetrics.parseSetting(metricsSetting);
        var checkbox = this._createSettingCheckbox(WebInspector.UIString("Device metrics"), WebInspector.settings.overrideDeviceMetrics, this._onMetricsCheckboxClicked.bind(this));

        checkbox.appendChild(this._createDeviceMetricsElement(metrics));
        this._onMetricsCheckboxClicked(WebInspector.settings.overrideDeviceMetrics.get());

        return checkbox;
    },

    /**
     * @param {boolean} enabled
     */
    _onMetricsCheckboxClicked: function(enabled)
    {
        if (enabled && !this._widthOverrideElement.value)
            this._widthOverrideElement.focus();
    },

    _applyDeviceMetricsUserInput: function()
    {
        this._setDeviceMetricsOverride(WebInspector.OverridesSupport.DeviceMetrics.parseUserInput(this._widthOverrideElement.value.trim(), this._heightOverrideElement.value.trim(), this._fontScaleFactorOverrideElement.value.trim()), true);
    },

    /**
     * @param {?WebInspector.OverridesSupport.DeviceMetrics} metrics
     * @param {boolean} userInputModified
     */
    _setDeviceMetricsOverride: function(metrics, userInputModified)
    {
        function setValid(condition, element)
        {
            if (condition)
                element.removeStyleClass("error-input");
            else
                element.addStyleClass("error-input");
        }

        setValid(metrics && metrics.isWidthValid(), this._widthOverrideElement);
        setValid(metrics && metrics.isHeightValid(), this._heightOverrideElement);
        setValid(metrics && metrics.isFontScaleFactorValid(), this._fontScaleFactorOverrideElement);

        if (!metrics)
            return;

        if (!userInputModified) {
            this._widthOverrideElement.value = metrics.widthToInput();
            this._heightOverrideElement.value = metrics.heightToInput();
            this._fontScaleFactorOverrideElement.value = metrics.fontScaleFactorToInput();
        }

        if (metrics.isValid()) {
            var value = metrics.toSetting();
            if (value !== WebInspector.settings.deviceMetrics.get())
                WebInspector.settings.deviceMetrics.set(value);
        }
    },

    /**
     * @param {WebInspector.OverridesSupport.DeviceMetrics} metrics
     */
    _createDeviceMetricsElement: function(metrics)
    {
        var fieldsetElement = WebInspector.SettingsTab.createSettingFieldset(WebInspector.settings.overrideDeviceMetrics);
        fieldsetElement.id = "metrics-override-section";

        var p = fieldsetElement.createChild("p");

        function swapDimensionsClicked(event)
        {
            var widthValue = this._widthOverrideElement.value;
            this._widthOverrideElement.value = this._heightOverrideElement.value;
            this._heightOverrideElement.value = widthValue;
            this._applyDeviceMetricsUserInput();
        }

        var tableElement = p.createChild("table", "nowrap");

        var rowElement = tableElement.createChild("tr");
        var cellElement = rowElement.createChild("td");
        cellElement.appendChild(document.createTextNode(WebInspector.UIString("Screen resolution:")));
        cellElement = rowElement.createChild("td");
        this._widthOverrideElement = this._createInput(cellElement, "metrics-override-width", String(metrics.width || screen.width), this._applyDeviceMetricsUserInput.bind(this), true);
        cellElement.appendChild(document.createTextNode(" \u00D7 ")); // MULTIPLICATION SIGN.
        this._heightOverrideElement = this._createInput(cellElement, "metrics-override-height", String(metrics.height || screen.height), this._applyDeviceMetricsUserInput.bind(this), true);
        cellElement.appendChild(document.createTextNode(" \u2014 ")); // EM DASH.
        this._swapDimensionsElement = cellElement.createChild("button");
        this._swapDimensionsElement.appendChild(document.createTextNode(" \u21C4 ")); // RIGHTWARDS ARROW OVER LEFTWARDS ARROW.
        this._swapDimensionsElement.title = WebInspector.UIString("Swap dimensions");
        this._swapDimensionsElement.addEventListener("click", swapDimensionsClicked.bind(this), false);

        rowElement = tableElement.createChild("tr");
        cellElement = rowElement.createChild("td");
        cellElement.appendChild(document.createTextNode(WebInspector.UIString("Font scale factor:")));
        cellElement = rowElement.createChild("td");
        this._fontScaleFactorOverrideElement = this._createInput(cellElement, "metrics-override-font-scale", String(metrics.fontScaleFactor || 1), this._applyDeviceMetricsUserInput.bind(this), true);

        rowElement = tableElement.createChild("tr");
        cellElement = rowElement.createChild("td");
        cellElement.colSpan = 2;
        var checkbox = WebInspector.SettingsTab.createSettingCheckbox(WebInspector.UIString("Fit in window"), WebInspector.settings.deviceFitWindow, true);
        cellElement.appendChild(checkbox);

        return fieldsetElement;
    },

    /**
     * @return {Element}
     */
    _createGeolocationOverrideControl: function()
    {
        const geolocationSetting = WebInspector.settings.geolocationOverride.get();
        var geolocation = WebInspector.OverridesSupport.GeolocationPosition.parseSetting(geolocationSetting);
        var checkbox = this._createSettingCheckbox(WebInspector.UIString("Override Geolocation"), WebInspector.settings.overrideGeolocation, this._geolocationOverrideCheckboxClicked.bind(this));

        var geolocationSectionElement = this._createGeolocationOverrideElement(geolocation);
        checkbox.appendChild(geolocationSectionElement);
        this._geolocationOverrideCheckboxClicked(WebInspector.settings.overrideGeolocation.get());
        return checkbox;
    },

    /**
     * @param {boolean} enabled
     */
    _geolocationOverrideCheckboxClicked: function(enabled)
    {
        if (enabled && !this._latitudeElement.value)
            this._latitudeElement.focus();
    },

    _applyGeolocationUserInput: function()
    {
        this._setGeolocationPosition(WebInspector.OverridesSupport.GeolocationPosition.parseUserInput(this._latitudeElement.value.trim(), this._longitudeElement.value.trim(), this._geolocationErrorElement.checked), true);
    },

    /**
     * @param {?WebInspector.OverridesSupport.GeolocationPosition} geolocation
     * @param {boolean} userInputModified
     */
    _setGeolocationPosition: function(geolocation, userInputModified)
    {
        if (!geolocation)
            return;

        if (!userInputModified) {
            this._latitudeElement.value = geolocation.latitude;
            this._longitudeElement.value = geolocation.longitude;
        }

        var value = geolocation.toSetting();
        WebInspector.settings.geolocationOverride.set(value);
    },

    /**
     * @param {WebInspector.OverridesSupport.GeolocationPosition} geolocation
     * @return {Element}
     */
    _createGeolocationOverrideElement: function(geolocation)
    {
        var fieldsetElement = WebInspector.SettingsTab.createSettingFieldset(WebInspector.settings.overrideGeolocation);
        fieldsetElement.id = "geolocation-override-section";

        var p = fieldsetElement.createChild("p");
        var tableElement = p.createChild("table");
        var rowElement = tableElement.createChild("tr");
        var cellElement = rowElement.createChild("td");
        cellElement.appendChild(document.createTextNode(WebInspector.UIString("Geolocation Position") + ":"));
        cellElement = rowElement.createChild("td");
        cellElement.appendChild(document.createTextNode(WebInspector.UIString("Lat = ")));
        this._latitudeElement = this._createInput(cellElement, "geolocation-override-latitude", String(geolocation.latitude), this._applyGeolocationUserInput.bind(this), true);
        cellElement.appendChild(document.createTextNode(" , "));
        cellElement.appendChild(document.createTextNode(WebInspector.UIString("Lon = ")));
        this._longitudeElement = this._createInput(cellElement, "geolocation-override-longitude", String(geolocation.longitude), this._applyGeolocationUserInput.bind(this), true);
        rowElement = tableElement.createChild("tr");
        cellElement = rowElement.createChild("td");
        cellElement.colSpan = 2;
        var geolocationErrorLabelElement = document.createElement("label");
        var geolocationErrorCheckboxElement = geolocationErrorLabelElement.createChild("input");
        geolocationErrorCheckboxElement.id = "geolocation-error";
        geolocationErrorCheckboxElement.type = "checkbox";
        geolocationErrorCheckboxElement.checked = !geolocation || geolocation.error;
        geolocationErrorCheckboxElement.addEventListener("click", this._applyGeolocationUserInput.bind(this), false);
        geolocationErrorLabelElement.appendChild(document.createTextNode(WebInspector.UIString("Emulate position unavailable")));
        this._geolocationErrorElement = geolocationErrorCheckboxElement;
        cellElement.appendChild(geolocationErrorLabelElement);

        return fieldsetElement;
    },

    /**
     * @return {Element}
     */
    _createDeviceOrientationOverrideControl: function()
    {
        const deviceOrientationSetting = WebInspector.settings.deviceOrientationOverride.get();
        var deviceOrientation = WebInspector.OverridesSupport.DeviceOrientation.parseSetting(deviceOrientationSetting);
        var checkbox = this._createSettingCheckbox(WebInspector.UIString("Override Device Orientation"), WebInspector.settings.overrideDeviceOrientation, this._deviceOrientationOverrideCheckboxClicked.bind(this));

        var deviceOrientationSectionElement = this._createDeviceOrientationOverrideElement(deviceOrientation);
        checkbox.appendChild(deviceOrientationSectionElement);
        this._deviceOrientationOverrideCheckboxClicked(WebInspector.settings.overrideDeviceOrientation.get());
        return checkbox;
    },

    /**
     * @param {boolean} enabled
     */
    _deviceOrientationOverrideCheckboxClicked: function(enabled)
    {
        if (enabled && !this._alphaElement.value)
            this._alphaElement.focus();
    },

    _applyDeviceOrientationUserInput: function()
    {
        this._setDeviceOrientation(WebInspector.OverridesSupport.DeviceOrientation.parseUserInput(this._alphaElement.value.trim(), this._betaElement.value.trim(), this._gammaElement.value.trim()), true);
    },

    /**
     * @param {?WebInspector.OverridesSupport.DeviceOrientation} deviceOrientation
     * @param {boolean} userInputModified
     */
    _setDeviceOrientation: function(deviceOrientation, userInputModified)
    {
        if (!deviceOrientation)
            return;

        if (!userInputModified) {
            this._alphaElement.value = deviceOrientation.alpha;
            this._betaElement.value = deviceOrientation.beta;
            this._gammaElement.value = deviceOrientation.gamma;
        }

        var value = deviceOrientation.toSetting();
        WebInspector.settings.deviceOrientationOverride.set(value);
    },

    /**
     * @param {WebInspector.OverridesSupport.DeviceOrientation} deviceOrientation
     */
    _createDeviceOrientationOverrideElement: function(deviceOrientation)
    {
        var fieldsetElement = WebInspector.SettingsTab.createSettingFieldset(WebInspector.settings.overrideDeviceOrientation);
        fieldsetElement.id = "device-orientation-override-section";

        var p = fieldsetElement.createChild("p");
        var tableElement = p.createChild("table");

        var rowElement = tableElement.createChild("tr");
        var cellElement = rowElement.createChild("td");
        cellElement.appendChild(document.createTextNode("\u03B1: "));
        this._alphaElement = this._createInput(cellElement, "device-orientation-override-alpha", String(deviceOrientation.alpha), this._applyDeviceOrientationUserInput.bind(this), true);
        cellElement.appendChild(document.createTextNode(" \u03B2: "));
        this._betaElement = this._createInput(cellElement, "device-orientation-override-beta", String(deviceOrientation.beta), this._applyDeviceOrientationUserInput.bind(this), true);
        cellElement.appendChild(document.createTextNode(" \u03B3: "));
        this._gammaElement = this._createInput(cellElement, "device-orientation-override-gamma", String(deviceOrientation.gamma), this._applyDeviceOrientationUserInput.bind(this), true);

        return fieldsetElement;
    },

    _createMediaEmulationElement: function()
    {
        var checkbox = WebInspector.SettingsTab.createSettingCheckbox(WebInspector.UIString("Emulate CSS media"), WebInspector.settings.overrideCSSMedia);
        var fieldsetElement = WebInspector.SettingsTab.createSettingFieldset(WebInspector.settings.overrideCSSMedia);
        checkbox.appendChild(fieldsetElement);

        var p = fieldsetElement.createChild("p");
        var mediaSelectElement = p.createChild("select");
        var mediaTypes = WebInspector.CSSStyleModel.MediaTypes;
        var defaultMedia = WebInspector.settings.emulatedCSSMedia.get();
        for (var i = 0; i < mediaTypes.length; ++i) {
            var mediaType = mediaTypes[i];
            if (mediaType === "all") {
                // "all" is not a device-specific media type.
                continue;
            }
            var option = document.createElement("option");
            option.text = mediaType;
            option.value = mediaType;
            mediaSelectElement.add(option);
            if (mediaType === defaultMedia)
                mediaSelectElement.selectedIndex = mediaSelectElement.options.length - 1;
        }

        mediaSelectElement.addEventListener("change", this._emulateMediaChanged.bind(this, mediaSelectElement), false);
        return checkbox;
    },

    _emulateMediaChanged: function(select)
    {
        var media = select.options[select.selectedIndex].value;
        WebInspector.settings.emulatedCSSMedia.set(media);
    },

    __proto__: WebInspector.View.prototype
}
