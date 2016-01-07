// Copyright 2014 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

WebInspector.OverridesUI = {}

/**
 * @constructor
 * @param {!Element} rotateButton
 * @param {?function(!WebInspector.EmulatedDevice, !WebInspector.EmulatedDevice.Mode)} callback
 */
WebInspector.DeviceSelect = function(rotateButton, callback)
{
    this._callback = callback;
    this._rotateButton = rotateButton;
    this.element = createElement("p");

    this._deviceSelectElement = this.element.createChild("select", "device-select");
    this._deviceSelectElement.addEventListener("change", this._deviceSelected.bind(this), false);

    var container = this.element.createChild("div", "mode-container");
    container.appendChild(this._rotateButton);
    this._rotateButton.addEventListener("click", this._rotateButtonClicked.bind(this), false);
    this._rotateButton.title = WebInspector.UIString("Change orientation");

    var modeSelectContainer = container.createChild("span", "mode-select");
    this._modeSelectElement = modeSelectContainer.createChild("select");
    this._modeSelectElement.addEventListener("change", this._modeSelected.bind(this), false);
    this._modeLabelElement = modeSelectContainer.createChild("label");
    this._modeLabelElement.addEventListener("click", this._rotateButtonClicked.bind(this), false);
    this._modeLabelElement.title = WebInspector.UIString("Change orientation");

    this._emulatedSettingChangedMuted = false;
    this._lastOrientation = null;

    WebInspector.overridesSupport.settings.emulateResolution.addChangeListener(this._emulatedSettingChanged, this);
    WebInspector.overridesSupport.settings.deviceWidth.addChangeListener(this._emulatedSettingChanged, this);
    WebInspector.overridesSupport.settings.deviceHeight.addChangeListener(this._emulatedSettingChanged, this);
    WebInspector.overridesSupport.settings.deviceScaleFactor.addChangeListener(this._emulatedSettingChanged, this);
    WebInspector.overridesSupport.settings.emulateMobile.addChangeListener(this._emulatedSettingChanged, this);
    WebInspector.overridesSupport.settings.emulateTouch.addChangeListener(this._emulatedSettingChanged, this);
    WebInspector.overridesSupport.settings.userAgent.addChangeListener(this._emulatedSettingChanged, this);

    WebInspector.emulatedDevicesList.addEventListener(WebInspector.EmulatedDevicesList.Events.CustomDevicesUpdated, this._deviceListChanged, this);
    WebInspector.emulatedDevicesList.addEventListener(WebInspector.EmulatedDevicesList.Events.StandardDevicesUpdated, this._deviceListChanged, this);
    this._deviceListChanged();
}

WebInspector.DeviceSelect.prototype = {
    _deviceListChanged: function()
    {
        this._deviceSelectElement.removeChildren();

        var selectDeviceOption = new Option(WebInspector.UIString("<Select model>"), WebInspector.UIString("<Select model>"));
        selectDeviceOption.device = null;
        selectDeviceOption.lastSelectedIndex = 0;
        selectDeviceOption.disabled = true;
        this._deviceSelectElement.appendChild(selectDeviceOption);

        this._addDeviceGroup(WebInspector.UIString("Custom"), WebInspector.emulatedDevicesList.custom());
        this._addDeviceGroup(WebInspector.UIString("Devices"), WebInspector.emulatedDevicesList.standard());
        this._emulatedSettingChanged();
    },

    /**
     * @param {string} name
     * @param {!Array.<!WebInspector.EmulatedDevice>} devices
     */
    _addDeviceGroup: function(name, devices)
    {
        devices = devices.filter(function (d) { return d.show(); });
        if (!devices.length)
            return;
        devices.sort(WebInspector.EmulatedDevice.compareByTitle);
        var groupElement = this._deviceSelectElement.createChild("optgroup");
        groupElement.label = name;
        for (var i = 0; i < devices.length; ++i) {
            var option = new Option(devices[i].title, devices[i].title);
            option.device = devices[i];
            option.lastSelectedIndex = 0;
            groupElement.appendChild(option);
        }
    },

    _emulatedSettingChanged: function()
    {
        if (this._emulatedSettingChangedMuted)
            return;

        for (var i = 1; i < this._deviceSelectElement.options.length; ++i) {
            var option = this._deviceSelectElement.options[i];
            var device = /** @type {!WebInspector.EmulatedDevice} */ (option.device);
            for (var j = 0; j < device.modes.length; j++) {
                if (WebInspector.overridesSupport.isEmulatingDevice(device.modeToOverridesDevice(device.modes[j]))) {
                    this._select(device, device.modes[j]);
                    return;
                }
            }
        }

        this._select(null, null);
    },

    /**
     * @param {?WebInspector.EmulatedDevice} device
     * @param {?WebInspector.EmulatedDevice.Mode} mode
     */
    _select: function(device, mode)
    {
        for (var i = 0; i < this._deviceSelectElement.options.length; i++) {
            if (this._deviceSelectElement.options[i].device === device)
                this._deviceSelectElement.selectedIndex = i;
        }
        this._updateModeSelect();
        for (var i = 0; i < this._modeSelectElement.options.length; i++) {
            if (this._modeSelectElement.options[i].mode === mode)
                this._modeSelectElement.selectedIndex = i;
        }
        this._updateModeControls();
        this._saveLastSelectedIndex();
        if (this._callback) {
            var option = this._modeSelectElement.options[this._modeSelectElement.selectedIndex];
            this._callback(option.device, option.mode);
        }
    },

    _deviceSelected: function()
    {
        this._updateModeSelect();
        this._modeSelected();
    },

    _updateModeSelect: function()
    {
        this._modeSelectElement.removeChildren();
        var option = this._deviceSelectElement.options[this._deviceSelectElement.selectedIndex];
        var device = /** @type {!WebInspector.EmulatedDevice} */ (option.device);

        if (this._deviceSelectElement.selectedIndex === 0) {
            this._addMode(device, null, "");
        } else if (device.modes.length === 1) {
            this._addMode(device, device.modes[0], WebInspector.UIString("Default"));
        } else {
            this._addOrientation(device, WebInspector.EmulatedDevice.Vertical, WebInspector.UIString("Portrait"));
            this._addOrientation(device, WebInspector.EmulatedDevice.Horizontal, WebInspector.UIString("Landscape"));
        }
        this._updateRotateModes();

        var index = option.lastSelectedIndex;
        var modeOption = this._modeSelectElement.options[index];
        if (modeOption.rotateIndex != -1) {
            var rotateOption = this._modeSelectElement.options[modeOption.rotateIndex];
            if (rotateOption.mode && rotateOption.mode.orientation === this._lastOrientation)
                index = modeOption.rotateIndex;
        }
        this._modeSelectElement.selectedIndex = index;
        this._updateModeControls();
    },

    /**
     * @param {!WebInspector.EmulatedDevice} device
     * @param {string} orientation
     * @param {string} title
     */
    _addOrientation: function(device, orientation, title)
    {
        var modes = device.modesForOrientation(orientation);
        if (!modes.length)
            return;
        if (modes.length === 1) {
            this._addMode(device, modes[0], title);
        } else {
            for (var index = 0; index < modes.length; index++)
                this._addMode(device, modes[index], title + " \u2013 " + modes[index].title);
        }
    },

    /**
     * @param {!WebInspector.EmulatedDevice} device
     * @param {?WebInspector.EmulatedDevice.Mode} mode
     * @param {string} title
     */
    _addMode: function(device, mode, title)
    {
        var option = new Option(title, title);
        option.mode = mode;
        option.device = device;
        this._modeSelectElement.appendChild(option);
    },

    _updateRotateModes: function()
    {
        for (var i = 0; i < this._modeSelectElement.options.length; i++) {
            var modeI = this._modeSelectElement.options[i].mode;
            this._modeSelectElement.options[i].rotateIndex = -1;
            for (var j = 0; j < this._modeSelectElement.options.length; j++) {
                var modeJ = this._modeSelectElement.options[j].mode;
                if (modeI && modeJ && modeI.orientation !== modeJ.orientation && modeI.title === modeJ.title)
                    this._modeSelectElement.options[i].rotateIndex = j;
            }
        }
    },

    _updateModeControls: function()
    {
        this._modeLabelElement.textContent = this._modeSelectElement.options[this._modeSelectElement.selectedIndex].label;

        if (this._modeSelectElement.options.length <= 1) {
            this._modeSelectElement.classList.toggle("hidden", true);
            this._modeLabelElement.classList.toggle("hidden", true);
        } else {
            var showLabel = this._modeSelectElement.options.length === 2 && this._modeSelectElement.options[0].rotateIndex === 1;
            this._modeSelectElement.classList.toggle("hidden",  showLabel);
            this._modeLabelElement.classList.toggle("hidden", !showLabel);
        }

        this._rotateButton.classList.toggle("hidden", this._modeSelectElement.options[this._modeSelectElement.selectedIndex].rotateIndex === -1);
    },

    _modeSelected: function()
    {
        this._saveLastSelectedIndex();
        this._updateModeControls();
        var option = this._modeSelectElement.options[this._modeSelectElement.selectedIndex];
        if (this._callback)
            this._callback(option.device, option.mode);
        this._emulatedSettingChangedMuted = true;
        WebInspector.overridesSupport.emulateDevice(option.device.modeToOverridesDevice(option.mode));
        this._emulatedSettingChangedMuted = false;
    },

    _saveLastSelectedIndex: function()
    {
        this._deviceSelectElement.options[this._deviceSelectElement.selectedIndex].lastSelectedIndex = this._modeSelectElement.selectedIndex;

        var option = this._modeSelectElement.options[this._modeSelectElement.selectedIndex];
        if (option.mode && option.rotateIndex != -1)
            this._lastOrientation = option.mode.orientation;
    },

    _rotateButtonClicked: function()
    {
        this._modeSelectElement.selectedIndex = this._modeSelectElement.options[this._modeSelectElement.selectedIndex].rotateIndex;
        this._modeSelected();
    }
}


/**
 * @return {{select: !Element, input: !Element}}
 */
WebInspector.OverridesUI.createUserAgentSelectAndInput = function()
{
    var userAgentSetting = WebInspector.overridesSupport.settings.userAgent;
    const noOverride = {title: WebInspector.UIString("No override"), value: ""};
    const customOverride = {title: WebInspector.UIString("Other"), value: "Other"};
    var userAgents = [noOverride].concat(WebInspector.OverridesUI._userAgents).concat([customOverride]);

    var userAgentSelectElement = createElement("select");
    for (var i = 0; i < userAgents.length; ++i)
        userAgentSelectElement.add(new Option(userAgents[i].title, userAgents[i].value));
    userAgentSelectElement.selectedIndex = 0;

    var otherUserAgentElement = createElement("input");
    otherUserAgentElement.type = "text";
    otherUserAgentElement.value = userAgentSetting.get();
    otherUserAgentElement.title = userAgentSetting.get();

    settingChanged();
    userAgentSetting.addChangeListener(settingChanged);
    userAgentSelectElement.addEventListener("change", userAgentSelected, false);

    otherUserAgentElement.addEventListener("dblclick", textDoubleClicked, true);
    otherUserAgentElement.addEventListener("blur", textChanged, false);
    otherUserAgentElement.addEventListener("keydown", textKeyDown, false);

    function userAgentSelected()
    {
        var value = userAgentSelectElement.options[userAgentSelectElement.selectedIndex].value;
        if (value !== customOverride.value) {
            userAgentSetting.removeChangeListener(settingChanged);
            userAgentSetting.set(value);
            userAgentSetting.addChangeListener(settingChanged);
            otherUserAgentElement.value = value;
            otherUserAgentElement.title = value;
            otherUserAgentElement.readOnly = true;
        } else {
            otherUserAgentElement.readOnly = false;
            otherUserAgentElement.focus();
        }
    }

    function settingChanged()
    {
        var value = userAgentSetting.get();
        var options = userAgentSelectElement.options;
        var selectionRestored = false;
        for (var i = 0; i < options.length; ++i) {
            if (options[i].value === value) {
                userAgentSelectElement.selectedIndex = i;
                selectionRestored = true;
                break;
            }
        }

        otherUserAgentElement.readOnly = selectionRestored;
        if (!selectionRestored)
            userAgentSelectElement.selectedIndex = options.length - 1;

        if (otherUserAgentElement.value !== value) {
            otherUserAgentElement.value = value;
            otherUserAgentElement.title = value;
        }
    }

    function textKeyDown(event)
    {
        if (isEnterKey(event))
            textChanged();
    }

    function textDoubleClicked()
    {
        userAgentSelectElement.selectedIndex = userAgents.length - 1;
        userAgentSelected();
    }

    function textChanged()
    {
        if (userAgentSetting.get() !== otherUserAgentElement.value)
            userAgentSetting.set(otherUserAgentElement.value);
    }

    return { select: userAgentSelectElement, input: otherUserAgentElement };
}

/** @type {!Array.<{title: string, value: string}>} */
WebInspector.OverridesUI._userAgents = [
    {title: "Android 4.0.2 \u2014 Galaxy Nexus", value: "Mozilla/5.0 (Linux; U; Android 4.0.2; en-us; Galaxy Nexus Build/ICL53F) AppleWebKit/534.30 (KHTML, like Gecko) Version/4.0 Mobile Safari/534.30"},
    {title: "Android 2.3 \u2014 Nexus S", value: "Mozilla/5.0 (Linux; U; Android 2.3.6; en-us; Nexus S Build/GRK39F) AppleWebKit/533.1 (KHTML, like Gecko) Version/4.0 Mobile Safari/533.1"},
    {title: "BlackBerry \u2014 BB10", value: "Mozilla/5.0 (BB10; Touch) AppleWebKit/537.1+ (KHTML, like Gecko) Version/10.0.0.1337 Mobile Safari/537.1+"},
    {title: "BlackBerry \u2014 PlayBook 2.1", value: "Mozilla/5.0 (PlayBook; U; RIM Tablet OS 2.1.0; en-US) AppleWebKit/536.2+ (KHTML, like Gecko) Version/7.2.1.0 Safari/536.2+"},
    {title: "BlackBerry \u2014 9900", value: "Mozilla/5.0 (BlackBerry; U; BlackBerry 9900; en-US) AppleWebKit/534.11+ (KHTML, like Gecko) Version/7.0.0.187 Mobile Safari/534.11+"},
    {title: "Chrome 31 \u2014 Mac", value: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_9_1) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/31.0.1650.63 Safari/537.36"},
    {title: "Chrome 31 \u2014 Windows", value: "Mozilla/5.0 (Windows NT 6.1) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/31.0.1650.16 Safari/537.36"},
    {title: "Chrome \u2014 Android Tablet", value: "Mozilla/5.0 (Linux; Android 4.1.2; Nexus 7 Build/JZ054K) AppleWebKit/535.19 (KHTML, like Gecko) Chrome/18.0.1025.166 Safari/535.19"},
    {title: "Chrome \u2014 Android Mobile", value: "Mozilla/5.0 (Linux; Android 4.0.4; Galaxy Nexus Build/IMM76B) AppleWebKit/535.19 (KHTML, like Gecko) Chrome/18.0.1025.133 Mobile Safari/535.19"},
    {title: "Chrome \u2014 iPad", value: "Mozilla/5.0 (iPad; CPU OS 7_0 like Mac OS X) AppleWebKit/537.51.1 (KHTML, like Gecko) CriOS/30.0.1599.12 Mobile/11A465 Safari/8536.25"},
    {title: "Chrome \u2014 iPhone", value: "Mozilla/5.0 (iPhone; CPU iPhone OS 7_0_2 like Mac OS X) AppleWebKit/537.51.1 (KHTML, like Gecko) CriOS/30.0.1599.12 Mobile/11A501 Safari/8536.25"},
    {title: "Firefox 14 \u2014 Android Mobile", value: "Mozilla/5.0 (Android; Mobile; rv:14.0) Gecko/14.0 Firefox/14.0"},
    {title: "Firefox 14 \u2014 Android Tablet", value: "Mozilla/5.0 (Android; Tablet; rv:14.0) Gecko/14.0 Firefox/14.0"},
    {title: "Firefox 4 \u2014 Mac", value: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10.6; rv:2.0.1) Gecko/20100101 Firefox/4.0.1"},
    {title: "Firefox 4 \u2014 Windows", value: "Mozilla/5.0 (Windows NT 6.1; rv:2.0.1) Gecko/20100101 Firefox/4.0.1"},
    {title: "Firefox 7 \u2014 Mac", value: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10.6; rv:7.0.1) Gecko/20100101 Firefox/7.0.1"},
    {title: "Firefox 7 \u2014 Windows", value: "Mozilla/5.0 (Windows NT 6.1; Intel Mac OS X 10.6; rv:7.0.1) Gecko/20100101 Firefox/7.0.1"},
    {title: "Googlebot", value: "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)"},
    {title: "Googlebot Smartphone", value: "Mozilla/5.0 (iPhone; CPU iPhone OS 6_0 like Mac OS X) AppleWebKit/536.26 (KHTML, like Gecko) Version/6.0 Mobile/10A5376e Safari/8536.25 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)"},
    {title: "Internet Explorer 10", value: "Mozilla/5.0 (compatible; MSIE 10.0; Windows NT 6.2; Trident/6.0)"},
    {title: "Internet Explorer 7", value: "Mozilla/4.0 (compatible; MSIE 7.0; Windows NT 6.0)"},
    {title: "Internet Explorer 8", value: "Mozilla/4.0 (compatible; MSIE 8.0; Windows NT 6.0; Trident/4.0)"},
    {title: "Internet Explorer 9", value: "Mozilla/5.0 (compatible; MSIE 9.0; Windows NT 6.1; Trident/5.0)"},
    {title: "iPad \u2014 iOS 8", value: "Mozilla/5.0 (iPad; CPU OS 8_0 like Mac OS X) AppleWebKit/600.1.3 (KHTML, like Gecko) Version/8.0 Mobile/12A4345d Safari/600.1.4"},
    {title: "iPad \u2014 iOS 7", value: "Mozilla/5.0 (iPad; CPU OS 7_0_2 like Mac OS X) AppleWebKit/537.51.1 (KHTML, like Gecko) Version/7.0 Mobile/11A501 Safari/9537.53"},
    {title: "iPad \u2014 iOS 6", value: "Mozilla/5.0 (iPad; CPU OS 6_0 like Mac OS X) AppleWebKit/536.26 (KHTML, like Gecko) Version/6.0 Mobile/10A5376e Safari/8536.25"},
    {title: "iPhone \u2014 iOS 8", value: "Mozilla/5.0 (iPhone; CPU iPhone OS 8_0 like Mac OS X) AppleWebKit/600.1.3 (KHTML, like Gecko) Version/8.0 Mobile/12A4345d Safari/600.1.4"},
    {title: "iPhone \u2014 iOS 7", value: "Mozilla/5.0 (iPhone; CPU iPhone OS 7_0_2 like Mac OS X) AppleWebKit/537.51.1 (KHTML, like Gecko) Version/7.0 Mobile/11A4449d Safari/9537.53"},
    {title: "iPhone \u2014 iOS 6", value: "Mozilla/5.0 (iPhone; CPU iPhone OS 6_0 like Mac OS X) AppleWebKit/536.26 (KHTML, like Gecko) Version/6.0 Mobile/10A5376e Safari/8536.25"},
    {title: "MeeGo \u2014 Nokia N9", value: "Mozilla/5.0 (MeeGo; NokiaN9) AppleWebKit/534.13 (KHTML, like Gecko) NokiaBrowser/8.5.0 Mobile Safari/534.13"},
    {title: "Opera 18 \u2014 Mac", value: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_9_1) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/31.0.1650.63 Safari/537.36 OPR/18.0.1284.68"},
    {title: "Opera 18 \u2014 Windows", value: "Mozilla/5.0 (Windows NT 6.1) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/31.0.1650.63 Safari/537.36 OPR/18.0.1284.68"},
    {title: "Opera 12 \u2014 Mac", value: "Opera/9.80 (Macintosh; Intel Mac OS X 10.9.1) Presto/2.12.388 Version/12.16"},
    {title: "Opera 12 \u2014 Windows", value: "Opera/9.80 (Windows NT 6.1) Presto/2.12.388 Version/12.16"},
    {title: "Silk \u2014 Kindle Fire (Desktop view)", value: "Mozilla/5.0 (Linux; U; en-us; KFTHWI Build/JDQ39) AppleWebKit/535.19 (KHTML, like Gecko) Silk/3.13 Safari/535.19 Silk-Accelerated=true"},
    {title: "Silk \u2014 Kindle Fire (Mobile view)", value: "Mozilla/5.0 (Linux; U; Android 4.2.2; en-us; KFTHWI Build/JDQ39) AppleWebKit/535.19 (KHTML, like Gecko) Silk/3.13 Mobile Safari/535.19 Silk-Accelerated=true"}
];
