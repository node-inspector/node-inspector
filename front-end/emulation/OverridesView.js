/*
 * Copyright (C) 2014 Google Inc. All rights reserved.
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
 * @extends {WebInspector.VBox}
 */
WebInspector.OverridesView = function()
{
    WebInspector.VBox.call(this);
    this.setMinimumSize(0, 30);
    this.registerRequiredCSS("emulation/overrides.css");
    this.element.classList.add("overrides-view");

    this._tabbedPane = new WebInspector.TabbedPane();
    this._tabbedPane.setShrinkableTabs(false);
    this._tabbedPane.setVerticalTabLayout(true);

    new WebInspector.OverridesView.DeviceTab().appendAsTab(this._tabbedPane);
    new WebInspector.OverridesView.MediaTab().appendAsTab(this._tabbedPane);
    new WebInspector.OverridesView.NetworkTab().appendAsTab(this._tabbedPane);
    new WebInspector.OverridesView.SensorsTab().appendAsTab(this._tabbedPane);

    this._lastSelectedTabSetting = WebInspector.settings.createSetting("lastSelectedEmulateTab", "device");
    this._tabbedPane.selectTab(this._lastSelectedTabSetting.get());
    this._tabbedPane.addEventListener(WebInspector.TabbedPane.EventTypes.TabSelected, this._tabSelected, this);
    this._tabbedPane.show(this.element);

    var resetButtonElement = createTextButton(WebInspector.UIString("Reset"), WebInspector.overridesSupport.reset.bind(WebInspector.overridesSupport));
    resetButtonElement.id = "overrides-reset-button";
    this._tabbedPane.appendAfterTabStrip(resetButtonElement);

    var disableButtonElement = createTextButton(WebInspector.UIString("Disable"), this._toggleEmulationEnabled.bind(this), "overrides-disable-button");
    disableButtonElement.id = "overrides-disable-button";
    this._tabbedPane.appendAfterTabStrip(disableButtonElement);

    this._splashScreenElement = this.element.createChild("div", "overrides-splash-screen");
    this._splashScreenElement.appendChild(createTextButton(WebInspector.UIString("Enable emulation"), this._toggleEmulationEnabled.bind(this), "overrides-enable-button"));

    this._unavailableSplashScreenElement = this.element.createChild("div", "overrides-splash-screen");
    this._unavailableSplashScreenElement.createTextChild(WebInspector.UIString("Emulation is not available."));

    this._warningFooter = this.element.createChild("div", "overrides-footer");
    this._overridesWarningUpdated();

    WebInspector.overridesSupport.addEventListener(WebInspector.OverridesSupport.Events.OverridesWarningUpdated, this._overridesWarningUpdated, this);
    WebInspector.overridesSupport.addEventListener(WebInspector.OverridesSupport.Events.EmulationStateChanged, this._emulationStateChanged, this);
    this._emulationStateChanged();
}

WebInspector.OverridesView.prototype = {
    /**
     * @param {!WebInspector.Event} event
     */
    _tabSelected: function(event)
    {
        this._lastSelectedTabSetting.set(this._tabbedPane.selectedTabId);
    },

    _overridesWarningUpdated: function()
    {
        var message = WebInspector.overridesSupport.warningMessage();
        this._warningFooter.classList.toggle("hidden", !message);
        this._warningFooter.textContent = message;
    },

    _toggleEmulationEnabled: function()
    {
        WebInspector.overridesSupport.setEmulationEnabled(!WebInspector.overridesSupport.emulationEnabled());
    },

    _emulationStateChanged: function()
    {
        this._unavailableSplashScreenElement.classList.toggle("hidden", WebInspector.overridesSupport.canEmulate());
        this._tabbedPane.element.classList.toggle("hidden", !WebInspector.overridesSupport.emulationEnabled());
        this._splashScreenElement.classList.toggle("hidden", WebInspector.overridesSupport.emulationEnabled() || !WebInspector.overridesSupport.canEmulate());
    },

    __proto__: WebInspector.VBox.prototype
}

/**
 * @constructor
 * @extends {WebInspector.VBox}
 * @param {string} id
 * @param {string} name
 * @param {!Array.<!WebInspector.Setting>} settings
 * @param {!Array.<function():boolean>=} predicates
 */
WebInspector.OverridesView.Tab = function(id, name, settings, predicates)
{
    WebInspector.VBox.call(this);
    this._id = id;
    this._name = name;
    this._settings = settings;
    this._predicates = predicates || [];
    for (var i = 0; i < settings.length; ++i)
        settings[i].addChangeListener(this.updateActiveState, this);
}

WebInspector.OverridesView.Tab.prototype = {
    /**
     * @param {!WebInspector.TabbedPane} tabbedPane
     */
    appendAsTab: function(tabbedPane)
    {
        this._tabbedPane = tabbedPane;
        tabbedPane.appendTab(this._id, this._name, this);
        this.updateActiveState();
    },

    updateActiveState: function()
    {
        if (!this._tabbedPane)
            return;
        var active = false;
        for (var i = 0; !active && i < this._settings.length; ++i)
            active = this._settings[i].get();
        for (var i = 0; !active && i < this._predicates.length; ++i)
            active = this._predicates[i]();
        this._tabbedPane.toggleTabClass(this._id, "overrides-activate", active);
    },

    /**
     * @param {string} name
     * @param {!WebInspector.Setting} setting
     * @param {function(boolean)=} callback
     */
    _createSettingCheckbox: function(name, setting, callback)
    {
        var checkbox = WebInspector.SettingsUI.createSettingCheckbox(name, setting, true);

        function changeListener(value)
        {
            callback(setting.get());
        }

        if (callback)
            setting.addChangeListener(changeListener);

        return checkbox;
    },

    __proto__: WebInspector.VBox.prototype
}

/**
 * @constructor
 * @extends {WebInspector.OverridesView.Tab}
 */
WebInspector.OverridesView.DeviceTab = function()
{
    WebInspector.OverridesView.Tab.call(this, "device", WebInspector.UIString("Device"),  [
        WebInspector.overridesSupport.settings.emulateResolution,
        WebInspector.overridesSupport.settings.deviceScaleFactor,
        WebInspector.overridesSupport.settings.emulateMobile
    ]);
    this.element.classList.add("overrides-device");

    this.element.appendChild(this._createDeviceElement());

    var footnote = this.element.createChild("p", "help-footnote");
    footnote.appendChild(WebInspector.linkifyDocumentationURLAsNode("setup/remote-debugging/remote-debugging", WebInspector.UIString("More information about screen emulation")));
}

WebInspector.OverridesView.DeviceTab.prototype = {
    _createDeviceElement: function()
    {
        var fieldsetElement = createElement("fieldset");
        fieldsetElement.id = "metrics-override-section";

        var deviceModelElement = fieldsetElement.createChild("p", "overrides-device-model-section");
        deviceModelElement.createChild("span").textContent = WebInspector.UIString("Model:");

        var rotateButton = createElement("button");
        rotateButton.textContent = " \u21C4 ";
        var deviceSelect = new WebInspector.DeviceSelect(rotateButton, null);
        deviceModelElement.appendChild(deviceSelect.element);

        var emulateResolutionCheckbox = WebInspector.SettingsUI.createSettingCheckbox(WebInspector.UIString("Emulate screen resolution"), WebInspector.overridesSupport.settings.emulateResolution, true);
        fieldsetElement.appendChild(emulateResolutionCheckbox);
        var resolutionFieldset = WebInspector.SettingsUI.createSettingFieldset(WebInspector.overridesSupport.settings.emulateResolution);
        fieldsetElement.appendChild(resolutionFieldset);

        var tableElement = resolutionFieldset.createChild("table");
        var rowElement = tableElement.createChild("tr");
        var cellElement = rowElement.createChild("td");
        cellElement.createTextChild(WebInspector.UIString("Resolution:"));
        cellElement = rowElement.createChild("td");

        var widthOverrideInput = WebInspector.SettingsUI.createSettingInputField("", WebInspector.overridesSupport.settings.deviceWidth, true, 4, "80px", WebInspector.OverridesSupport.deviceSizeValidator, true, true, WebInspector.UIString("\u2013"));
        cellElement.appendChild(widthOverrideInput);
        var heightOverrideInput = WebInspector.SettingsUI.createSettingInputField("", WebInspector.overridesSupport.settings.deviceHeight, true, 4, "80px", WebInspector.OverridesSupport.deviceSizeValidator, true, true, WebInspector.UIString("\u2013"));
        cellElement.appendChild(heightOverrideInput);

        rowElement = tableElement.createChild("tr");
        cellElement = rowElement.createChild("td");
        cellElement.colSpan = 4;

        rowElement = tableElement.createChild("tr");
        rowElement.title = WebInspector.UIString("Ratio between a device's physical pixels and device-independent pixels");
        rowElement.createChild("td").createTextChild(WebInspector.UIString("Device pixel ratio:"));
        rowElement.createChild("td").appendChild(WebInspector.SettingsUI.createSettingInputField("", WebInspector.overridesSupport.settings.deviceScaleFactor, true, 4, "80px", WebInspector.OverridesSupport.deviceScaleFactorValidator, true, true, WebInspector.UIString("\u2013")));

        var mobileCheckbox = this._createSettingCheckbox(WebInspector.UIString("Emulate mobile"), WebInspector.overridesSupport.settings.emulateMobile);
        mobileCheckbox.title = WebInspector.UIString("Enable meta viewport, overlay scrollbars, text autosizing and default 980px body width");
        fieldsetElement.appendChild(mobileCheckbox);

        fieldsetElement.appendChild(this._createSettingCheckbox(WebInspector.UIString("Shrink to fit"), WebInspector.overridesSupport.settings.deviceFitWindow));

        return fieldsetElement;
    },

    __proto__: WebInspector.OverridesView.Tab.prototype
}


/**
 * @constructor
 * @extends {WebInspector.OverridesView.Tab}
 */
WebInspector.OverridesView.MediaTab = function()
{
    var settings = [WebInspector.overridesSupport.settings.overrideCSSMedia];
    WebInspector.OverridesView.Tab.call(this, "media", WebInspector.UIString("Media"), settings);
    this.element.classList.add("overrides-media");

    this._createMediaEmulationFragment();
}

WebInspector.OverridesView.MediaTab.prototype = {
    _createMediaEmulationFragment: function()
    {
        var checkbox = WebInspector.SettingsUI.createSettingCheckbox(WebInspector.UIString("CSS media"), WebInspector.overridesSupport.settings.overrideCSSMedia, true);
        var fieldsetElement = WebInspector.SettingsUI.createSettingFieldset(WebInspector.overridesSupport.settings.overrideCSSMedia);
        var mediaSelectElement = fieldsetElement.createChild("select");
        var mediaTypes = WebInspector.CSSStyleModel.MediaTypes;
        var defaultMedia = WebInspector.overridesSupport.settings.emulatedCSSMedia.get();
        for (var i = 0; i < mediaTypes.length; ++i) {
            var mediaType = mediaTypes[i];
            if (mediaType === "all") {
                // "all" is not a device-specific media type.
                continue;
            }
            var option = createElement("option");
            option.text = mediaType;
            option.value = mediaType;
            mediaSelectElement.add(option);
            if (mediaType === defaultMedia)
                mediaSelectElement.selectedIndex = mediaSelectElement.options.length - 1;
        }

        mediaSelectElement.addEventListener("change", this._emulateMediaChanged.bind(this, mediaSelectElement), false);
        var fragment = createDocumentFragment();
        fragment.appendChild(checkbox);
        fragment.appendChild(fieldsetElement);
        this.element.appendChild(fragment);
    },

    _emulateMediaChanged: function(select)
    {
        var media = select.options[select.selectedIndex].value;
        WebInspector.overridesSupport.settings.emulatedCSSMedia.set(media);
    },

    __proto__: WebInspector.OverridesView.Tab.prototype
}


/**
 * @constructor
 * @extends {WebInspector.OverridesView.Tab}
 */
WebInspector.OverridesView.NetworkTab = function()
{
    WebInspector.OverridesView.Tab.call(this, "network", WebInspector.UIString("Network"), [], [this._userAgentOverrideEnabled.bind(this)]);
    this.element.classList.add("overrides-network");
    this._createUserAgentSection();
}

WebInspector.OverridesView.NetworkTab.prototype = {
    /**
     * @return {boolean}
     */
    _userAgentOverrideEnabled: function()
    {
        return !!WebInspector.overridesSupport.settings.userAgent.get();
    },

    _createUserAgentSection: function()
    {
        var fieldsetElement = this.element.createChild("fieldset");
        fieldsetElement.createChild("label").textContent = WebInspector.UIString("Spoof user agent:");
        var selectAndInput = WebInspector.OverridesUI.createUserAgentSelectAndInput();
        fieldsetElement.appendChild(selectAndInput.select);
        fieldsetElement.appendChild(selectAndInput.input);

        WebInspector.overridesSupport.settings.userAgent.addChangeListener(this.updateActiveState, this);
    },

    __proto__: WebInspector.OverridesView.Tab.prototype
}


/**
 * @constructor
 * @extends {WebInspector.OverridesView.Tab}
 */
WebInspector.OverridesView.SensorsTab = function()
{
    WebInspector.OverridesView.Tab.call(this, "sensors", WebInspector.UIString("Sensors"), [
        WebInspector.overridesSupport.settings.overrideGeolocation,
        WebInspector.overridesSupport.settings.overrideDeviceOrientation,
        WebInspector.overridesSupport.settings.emulateTouch
    ]);

    this.element.classList.add("overrides-sensors");
    this.registerRequiredCSS("emulation/accelerometer.css");
    this.element.appendChild(this._createSettingCheckbox(WebInspector.UIString("Emulate touch screen"), WebInspector.overridesSupport.settings.emulateTouch, undefined));
    this._appendGeolocationOverrideControl();
    this._apendDeviceOrientationOverrideControl();
}

WebInspector.OverridesView.SensorsTab.prototype = {
    _appendGeolocationOverrideControl: function()
    {
        const geolocationSetting = WebInspector.overridesSupport.settings.geolocationOverride.get();
        var geolocation = WebInspector.OverridesSupport.GeolocationPosition.parseSetting(geolocationSetting);
        this.element.appendChild(this._createSettingCheckbox(WebInspector.UIString("Emulate geolocation coordinates"), WebInspector.overridesSupport.settings.overrideGeolocation, this._geolocationOverrideCheckboxClicked.bind(this)));
        this.element.appendChild(this._createGeolocationOverrideElement(geolocation));
        this._geolocationOverrideCheckboxClicked(WebInspector.overridesSupport.settings.overrideGeolocation.get());
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
        WebInspector.overridesSupport.settings.geolocationOverride.set(value);
    },

    /**
     * @param {!WebInspector.OverridesSupport.GeolocationPosition} geolocation
     * @return {!Element}
     */
    _createGeolocationOverrideElement: function(geolocation)
    {
        var fieldsetElement = WebInspector.SettingsUI.createSettingFieldset(WebInspector.overridesSupport.settings.overrideGeolocation);
        fieldsetElement.id = "geolocation-override-section";

        var tableElement = fieldsetElement.createChild("table");
        var rowElement = tableElement.createChild("tr");
        var cellElement = rowElement.createChild("td");
        cellElement = rowElement.createChild("td");
        cellElement.createTextChild(WebInspector.UIString("Lat = "));
        this._latitudeElement = WebInspector.SettingsUI.createInput(cellElement, "geolocation-override-latitude", String(geolocation.latitude), this._applyGeolocationUserInput.bind(this), true);
        cellElement.createTextChild(" , ");
        cellElement.createTextChild(WebInspector.UIString("Lon = "));
        this._longitudeElement = WebInspector.SettingsUI.createInput(cellElement, "geolocation-override-longitude", String(geolocation.longitude), this._applyGeolocationUserInput.bind(this), true);
        rowElement = tableElement.createChild("tr");
        cellElement = rowElement.createChild("td");
        cellElement.colSpan = 2;
        var geolocationErrorLabelElement = createCheckboxLabel(WebInspector.UIString("Emulate position unavailable"), !geolocation || !!geolocation.error);
        var geolocationErrorCheckboxElement = geolocationErrorLabelElement.checkboxElement;
        geolocationErrorCheckboxElement.id = "geolocation-error";
        geolocationErrorCheckboxElement.addEventListener("click", this._applyGeolocationUserInput.bind(this), false);
        this._geolocationErrorElement = geolocationErrorCheckboxElement;
        cellElement.appendChild(geolocationErrorLabelElement);

        return fieldsetElement;
    },

    _apendDeviceOrientationOverrideControl: function()
    {
        const deviceOrientationSetting = WebInspector.overridesSupport.settings.deviceOrientationOverride.get();
        var deviceOrientation = WebInspector.OverridesSupport.DeviceOrientation.parseSetting(deviceOrientationSetting);
        this.element.appendChild(this._createSettingCheckbox(WebInspector.UIString("Accelerometer"), WebInspector.overridesSupport.settings.overrideDeviceOrientation, this._deviceOrientationOverrideCheckboxClicked.bind(this)));
        this.element.appendChild(this._createDeviceOrientationOverrideElement(deviceOrientation));
        this._deviceOrientationOverrideCheckboxClicked(WebInspector.overridesSupport.settings.overrideDeviceOrientation.get());
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
        this._setDeviceOrientation(WebInspector.OverridesSupport.DeviceOrientation.parseUserInput(this._alphaElement.value.trim(), this._betaElement.value.trim(), this._gammaElement.value.trim()), WebInspector.OverridesView.SensorsTab.DeviceOrientationModificationSource.UserInput);
    },

    _resetDeviceOrientation: function()
    {
        this._setDeviceOrientation(new WebInspector.OverridesSupport.DeviceOrientation(0, 0, 0), WebInspector.OverridesView.SensorsTab.DeviceOrientationModificationSource.ResetButton);
    },

    /**
     * @param {?WebInspector.OverridesSupport.DeviceOrientation} deviceOrientation
     * @param {!WebInspector.OverridesView.SensorsTab.DeviceOrientationModificationSource} modificationSource
     */
    _setDeviceOrientation: function(deviceOrientation, modificationSource)
    {
        if (!deviceOrientation)
            return;

        if (modificationSource != WebInspector.OverridesView.SensorsTab.DeviceOrientationModificationSource.UserInput) {
            this._alphaElement.value = deviceOrientation.alpha;
            this._betaElement.value = deviceOrientation.beta;
            this._gammaElement.value = deviceOrientation.gamma;
        }

        if (modificationSource != WebInspector.OverridesView.SensorsTab.DeviceOrientationModificationSource.UserDrag)
            this._setBoxOrientation(deviceOrientation);

        var value = deviceOrientation.toSetting();
        WebInspector.overridesSupport.settings.deviceOrientationOverride.set(value);
    },

    /**
     * @param {!Element} parentElement
     * @param {string} id
     * @param {string} label
     * @param {string} defaultText
     * @return {!Element}
     */
    _createAxisInput: function(parentElement, id, label, defaultText)
    {
        var div = parentElement.createChild("div", "accelerometer-axis-input-container");
        div.createTextChild(label);
        return WebInspector.SettingsUI.createInput(div, id, defaultText, this._applyDeviceOrientationUserInput.bind(this), true);
    },

    /**
     * @param {!WebInspector.OverridesSupport.DeviceOrientation} deviceOrientation
     */
    _createDeviceOrientationOverrideElement: function(deviceOrientation)
    {
        var fieldsetElement = WebInspector.SettingsUI.createSettingFieldset(WebInspector.overridesSupport.settings.overrideDeviceOrientation);
        fieldsetElement.id = "device-orientation-override-section";
        var tableElement = fieldsetElement.createChild("table");
        var rowElement = tableElement.createChild("tr");
        var cellElement = rowElement.createChild("td", "accelerometer-inputs-cell");

        this._alphaElement = this._createAxisInput(cellElement, "device-orientation-override-alpha", "\u03B1: ", String(deviceOrientation.alpha));
        this._betaElement = this._createAxisInput(cellElement, "device-orientation-override-beta", "\u03B2: ", String(deviceOrientation.beta));
        this._gammaElement = this._createAxisInput(cellElement, "device-orientation-override-gamma", "\u03B3: ", String(deviceOrientation.gamma));

        cellElement.appendChild(createTextButton(WebInspector.UIString("Reset"), this._resetDeviceOrientation.bind(this), "accelerometer-reset-button"));

        this._stageElement = rowElement.createChild("td","accelerometer-stage");
        this._boxElement = this._stageElement.createChild("section", "accelerometer-box");

        this._boxElement.createChild("section", "front");
        this._boxElement.createChild("section", "top");
        this._boxElement.createChild("section", "back");
        this._boxElement.createChild("section", "left");
        this._boxElement.createChild("section", "right");
        this._boxElement.createChild("section", "bottom");

        WebInspector.installDragHandle(this._stageElement, this._onBoxDragStart.bind(this), this._onBoxDrag.bind(this), this._onBoxDragEnd.bind(this), "move");
        this._setBoxOrientation(deviceOrientation);
        return fieldsetElement;
    },

    /**
     * @param {!WebInspector.OverridesSupport.DeviceOrientation} deviceOrientation
     */
    _setBoxOrientation: function(deviceOrientation)
    {
        var matrix = new WebKitCSSMatrix();
        this._boxMatrix = matrix.rotate(-deviceOrientation.beta, deviceOrientation.gamma, -deviceOrientation.alpha);
        this._boxElement.style.webkitTransform = this._boxMatrix.toString();
    },

    /**
     * @param {!MouseEvent} event
     * @return {boolean}
     */
    _onBoxDrag: function(event)
    {
        var mouseMoveVector = this._calculateRadiusVector(event.x, event.y);
        if (!mouseMoveVector)
            return true;

        event.consume(true);
        var axis = WebInspector.Geometry.crossProduct(this._mouseDownVector, mouseMoveVector);
        axis.normalize();
        var angle = WebInspector.Geometry.calculateAngle(this._mouseDownVector, mouseMoveVector);
        var matrix = new WebKitCSSMatrix();
        var rotationMatrix = matrix.rotateAxisAngle(axis.x, axis.y, axis.z, angle);
        this._currentMatrix = rotationMatrix.multiply(this._boxMatrix);
        this._boxElement.style.webkitTransform = this._currentMatrix;
        var eulerAngles = WebInspector.Geometry.EulerAngles.fromRotationMatrix(this._currentMatrix);
        var newOrientation = new WebInspector.OverridesSupport.DeviceOrientation(-eulerAngles.alpha, -eulerAngles.beta, eulerAngles.gamma);
        this._setDeviceOrientation(newOrientation, WebInspector.OverridesView.SensorsTab.DeviceOrientationModificationSource.UserDrag);
        return false;
    },

    /**
     * @param {!MouseEvent} event
     * @return {boolean}
     */
    _onBoxDragStart: function(event)
    {
        if (!WebInspector.overridesSupport.settings.overrideDeviceOrientation.get())
            return false;

        this._mouseDownVector = this._calculateRadiusVector(event.x, event.y);

        if (!this._mouseDownVector)
            return false;

        event.consume(true);
        return true;
    },

    _onBoxDragEnd: function()
    {
        this._boxMatrix = this._currentMatrix;
    },

    /**
     * @param {number} x
     * @param {number} y
     * @return {?WebInspector.Geometry.Vector}
     */
    _calculateRadiusVector: function(x, y)
    {
        var rect = this._stageElement.getBoundingClientRect();
        var radius = Math.max(rect.width, rect.height) / 2;
        var sphereX = (x - rect.left - rect.width / 2) / radius;
        var sphereY = (y - rect.top - rect.height / 2) / radius;
        var sqrSum = sphereX * sphereX + sphereY * sphereY;
        if (sqrSum > 0.5)
            return new WebInspector.Geometry.Vector(sphereX, sphereY, 0.5 / Math.sqrt(sqrSum));

        return new WebInspector.Geometry.Vector(sphereX, sphereY, Math.sqrt(1 - sqrSum));
    },

    __proto__ : WebInspector.OverridesView.Tab.prototype
}

/** @enum {string} */
WebInspector.OverridesView.SensorsTab.DeviceOrientationModificationSource = {
    UserInput: "userInput",
    UserDrag: "userDrag",
    ResetButton: "resetButton"
}

/**
 * @constructor
 * @implements {WebInspector.Revealer}
 */
WebInspector.OverridesView.Revealer = function()
{
}

WebInspector.OverridesView.Revealer.prototype = {
    /**
     * @override
     * @param {!Object} overridesSupport
     * @return {!Promise}
     */
    reveal: function(overridesSupport)
    {
        WebInspector.inspectorView.showViewInDrawer("emulation");
        return Promise.resolve();
    }
}
