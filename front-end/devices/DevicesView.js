/*
 * Copyright 2014 The Chromium Authors. All rights reserved.
 * Use of this source code is governed by a BSD-style license that can be
 * found in the LICENSE file.
 */

/**
 * @constructor
 * @extends {WebInspector.VBox}
 */
WebInspector.DevicesView = function()
{
    WebInspector.VBox.call(this);
    this.registerRequiredCSS("devices/devicesView.css");
    this.element.classList.add("devices");
    this._devicesHelp = this.element.createChild("div");
    this._devicesHelp.innerHTML = WebInspector.UIString("No devices detected. " +
        "Please read the <a href=\"https://developers.google.com/chrome-developer-tools/docs/remote-debugging\"> remote debugging documentation</a> " +
        "to verify your device is enabled for USB debugging.");
    this.element.createChild("div", "devices-info").innerHTML = WebInspector.UIString("Click \"Try here\" button, to open the current page in the selected remote browser.");
    this._devicesList = this.element.createChild("div");
    this._devicesList.cellSpacing = 0;
    InspectorFrontendHost.events.addEventListener(InspectorFrontendHostAPI.Events.DevicesUpdated, this._onDevicesUpdated, this);
};

WebInspector.DevicesView.MinVersionNewTab = 29;


WebInspector.DevicesView.Events = {
    DevicesChanged: "DevicesChanged"
};

WebInspector.DevicesView.prototype = {
    _onDevicesUpdated: function(event)
    {
        this._updateDeviceList(/** @type {!Array.<!Adb.Device>} */(event.data));
    },

    /**
     * @param {!Array.<!Adb.Device>} devices
     */
    _updateDeviceList: function(devices)
    {
        /**
         * @param {string} id
         * @return {string}
         */
        function sanitizeForId(id)
        {
            return id.replace(/[.:/\/ ]/g, "-");
        }

        /**
         * @param {!Element} element
         * @param {!Object} data
         * @return {boolean}
         */
        function alreadyDisplayed(element, data)
        {
            var json = JSON.stringify(data);
            if (element.__cachedJSON === json)
                return true;
            element.__cachedJSON = json;
            return false;
        }

        /**
         * @param {!Element} parent
         * @param {!Element} child
         */
        function insertChildSortedById(parent, child)
        {
            for (var sibling = parent.firstElementChild; sibling; sibling = sibling.nextElementSibling) {
                if (sibling.id && sibling.id > child.id) {
                    parent.insertBefore(child, sibling);
                    return;
                }
            }
            parent.appendChild(child);
        }

        /**
         *
         * @param {!Array.<string>} validIds
         * @param {!Element} section
         */
        function removeObsolete(validIds, section)
        {
            if (validIds.indexOf(section.id) < 0)
                section.remove();
        }

        if (alreadyDisplayed(this._devicesList, devices))
            return;

        var newDeviceIds = devices.map(function(device) { return device.id; });

        Array.prototype.forEach.call(
            this._devicesList.querySelectorAll(".device"),
            removeObsolete.bind(null, newDeviceIds));

        this._devicesHelp.hidden = !!devices.length;

        for (var d = 0; d < devices.length; d++) {
            // FIXME: Try to use shadow DOM.
            var device = devices[d];

            var deviceSection = this._devicesList.querySelector("#" + sanitizeForId(device.id));
            if (!deviceSection) {
                deviceSection = this._devicesList.createChild("div", "device");
                deviceSection.id = sanitizeForId(device.id);
                var deviceHeader = deviceSection.createChild("div", "device-header");
                deviceHeader.createChild("div", "device-name");
                var deviceSerial = deviceHeader.createChild("div", "device-serial");
                deviceSerial.textContent = "#" + device.adbSerial.toUpperCase();
                deviceSection.createChild("div", "device-auth");
            }

            if (alreadyDisplayed(deviceSection, device))
                continue;

            deviceSection.querySelector(".device-name").textContent = device.adbModel;
            deviceSection.querySelector(".device-auth").textContent =
                device.adbConnected ? ""
                                    : WebInspector.UIString("Pending authentication: please accept debugging session on the device.");

            var browsers = device.browsers.filter(function(browser) { return browser.adbBrowserChromeVersion; });

            var newBrowserIds = browsers.map(function(browser) { return browser.id });
            Array.prototype.forEach.call(deviceSection.querySelectorAll(".browser"), removeObsolete.bind(null, newBrowserIds));

            for (var b = 0; b < browsers.length; b++) {
                var browser = browsers[b];
                var incompatibleVersion = browser.hasOwnProperty("compatibleVersion") && !browser.compatibleVersion;
                var browserSection = deviceSection.querySelector("#" + sanitizeForId(browser.id));
                if (!browserSection) {
                    browserSection = createElementWithClass("div", "browser");
                    browserSection.id = sanitizeForId(browser.id);
                    insertChildSortedById(deviceSection, browserSection);

                    var browserName = browserSection.createChild("div", "browser-name");
                    browserName.textContent = browser.adbBrowserName;
                    if (browser.adbBrowserVersion)
                        browserName.textContent += " (" + browser.adbBrowserVersion + ")";

                    if (incompatibleVersion || browser.adbBrowserChromeVersion < WebInspector.DevicesView.MinVersionNewTab) {
                        var warningSection = browserSection.createChild("div", "warning");
                        warningSection.textContent = incompatibleVersion
                            ? WebInspector.UIString("You may need a newer version of desktop Chrome. Please try Chrome %s  or later.", browser.adbBrowserVersion)
                            : WebInspector.UIString("You may need a newer version of Chrome on your device. Please try Chrome %s or later.", WebInspector.DevicesView.MinVersionNewTab);
                    } else {
                        var newPageButton = browserSection.createChild("button", "text-button");
                        newPageButton.textContent = WebInspector.UIString("Try here");
                        newPageButton.title = WebInspector.UIString("Inspect current page in this browser.");
                        newPageButton.addEventListener("click", InspectorFrontendHost.openUrlOnRemoteDeviceAndInspect.bind(null, browser.id, WebInspector.targetManager.inspectedPageURL()), true);
                    }
                }

            }
        }
    },

    willHide: function()
    {
        InspectorFrontendHost.setDevicesUpdatesEnabled(false);
    },

    wasShown: function()
    {
        InspectorFrontendHost.setDevicesUpdatesEnabled(true);
    },

    __proto__: WebInspector.VBox.prototype
};
