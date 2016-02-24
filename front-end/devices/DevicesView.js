// Copyright 2015 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

/**
 * @constructor
 * @extends {WebInspector.VBox}
 */
WebInspector.DevicesView = function()
{
    WebInspector.VBox.call(this, true);
    this.registerRequiredCSS("devices/devicesView.css");

    this._tabbedPane = new WebInspector.TabbedPane();
    var titleElement = createElementWithClass("div", "devices-view-title");
    titleElement.createTextChild(WebInspector.UIString("Devices"));

    this._tabbedPane.insertBeforeTabStrip(titleElement);
    this._tabbedPane.setShrinkableTabs(false);
    this._tabbedPane.setVerticalTabLayout(true);

    this._discoveryView = new WebInspector.DevicesView.DiscoveryView();
    this._tabbedPane.appendTab("discovery", WebInspector.UIString("Settings"), this._discoveryView);

    /** @type {!Map<string, !WebInspector.DevicesView.DeviceView>} */
    this._viewById = new Map();
    /** @type {!Array<!Adb.Device>} */
    this._devices = [];

    this._tabbedPane.show(this.contentElement);

    var discoveryFooter = this.contentElement.createChild("div", "devices-footer");
    this._deviceCountSpan = discoveryFooter.createChild("span");
    discoveryFooter.createChild("span").textContent = WebInspector.UIString(" Read ");
    discoveryFooter.appendChild(WebInspector.linkifyURLAsNode("https://developers.google.com/chrome-developer-tools/docs/remote-debugging", WebInspector.UIString("remote debugging documentation"), undefined, true));
    discoveryFooter.createChild("span").textContent = WebInspector.UIString(" for more information.");
    this._updateFooter();

    InspectorFrontendHost.events.addEventListener(InspectorFrontendHostAPI.Events.DevicesUpdated, this._devicesUpdated, this);
    InspectorFrontendHost.events.addEventListener(InspectorFrontendHostAPI.Events.DevicesDiscoveryConfigChanged, this._devicesDiscoveryConfigChanged, this);
}

WebInspector.DevicesView.prototype = {
    /**
     * @param {!WebInspector.Event} event
     */
    _devicesUpdated: function(event)
    {
        this._devices = /** @type {!Array.<!Adb.Device>} */ (event.data).slice();

        var ids = new Set();
        for (var device of this._devices)
            ids.add(device.id);

        for (var deviceId of this._viewById.keys()) {
            if (!ids.has(deviceId)) {
                this._tabbedPane.closeTab(deviceId);
                this._viewById.remove(deviceId);
            }
        }

        for (var device of this._devices) {
            var view = this._viewById.get(device.id);
            if (!view) {
                view = new WebInspector.DevicesView.DeviceView();
                this._viewById.set(device.id, view);
                this._tabbedPane.appendTab(device.id, device.adbModel, view);
            }
            this._tabbedPane.changeTabTitle(device.id, device.adbModel);
            view.update(device);
        }

        this._updateFooter();
    },

    /**
     * @param {!WebInspector.Event} event
     */
    _devicesDiscoveryConfigChanged: function(event)
    {
        var discoverUsbDevices = /** @type {boolean} */ (event.data["discoverUsbDevices"]);
        var portForwardingEnabled = /** @type {boolean} */ (event.data["portForwardingEnabled"]);
        var portForwardingConfig = /** @type {!Adb.PortForwardingConfig} */ (event.data["portForwardingConfig"]);
        this._discoveryView.discoveryConfigChanged(discoverUsbDevices, portForwardingEnabled, portForwardingConfig);
    },

    _updateFooter: function()
    {
        this._deviceCountSpan.textContent =
            !this._devices.length ? WebInspector.UIString("No devices detected.") :
                this._devices.length === 1 ? WebInspector.UIString("1 device detected.") : WebInspector.UIString("%d devices detected.", this._devices.length);
    },

    /**
     * @override
     */
    wasShown: function()
    {
        WebInspector.PanelWithSidebar.prototype.wasShown.call(this);
        InspectorFrontendHost.setDevicesUpdatesEnabled(true);
    },

    /**
     * @override
     */
    willHide: function()
    {
        WebInspector.PanelWithSidebar.prototype.wasShown.call(this);
        InspectorFrontendHost.setDevicesUpdatesEnabled(false);
    },

    __proto__: WebInspector.VBox.prototype
}

/**
 * @return {!WebInspector.DevicesView}
 */
WebInspector.DevicesView._instance = function()
{
    if (!WebInspector.DevicesView._instanceObject)
        WebInspector.DevicesView._instanceObject = new WebInspector.DevicesView();
    return WebInspector.DevicesView._instanceObject;
}


/**
 * @constructor
 * @extends {WebInspector.VBox}
 */
WebInspector.DevicesView.DiscoveryView = function()
{
    WebInspector.VBox.call(this);
    this.setMinimumSize(100, 100);
    this.element.classList.add("discovery-view");

    this.contentElement.createChild("div", "hbox device-text-row").createChild("div", "view-title").textContent = WebInspector.UIString("Settings");

    var discoverUsbDevicesCheckbox = createCheckboxLabel(WebInspector.UIString("Discover USB devices"));
    discoverUsbDevicesCheckbox.classList.add("usb-checkbox");
    this.element.appendChild(discoverUsbDevicesCheckbox);
    this._discoverUsbDevicesCheckbox = discoverUsbDevicesCheckbox.checkboxElement;
    this._discoverUsbDevicesCheckbox.addEventListener("click", this._updateDiscoveryConfig.bind(this), false);

    var portForwardingEnabledCheckbox = createCheckboxLabel(WebInspector.UIString("Port forwarding"));
    portForwardingEnabledCheckbox.classList.add("port-forwarding-checkbox");
    this.element.appendChild(portForwardingEnabledCheckbox);
    this._portForwardingEnabledCheckbox = portForwardingEnabledCheckbox.checkboxElement;
    this._portForwardingEnabledCheckbox.addEventListener("click", this._updateDiscoveryConfig.bind(this), false);

    this._portForwardingList = this.element.createChild("div", "port-forwarding-list");

    var portForwardingFooter = this.element.createChild("div", "port-forwarding-footer");
    portForwardingFooter.createChild("span").textContent = WebInspector.UIString("Define the listening port on your device that maps to a port accessible from your development machine. ");
    portForwardingFooter.appendChild(WebInspector.linkifyURLAsNode("https://developer.chrome.com/devtools/docs/remote-debugging#reverse-port-forwarding", WebInspector.UIString("Learn more"), undefined, true));
}

WebInspector.DevicesView.DiscoveryView.prototype = {
    /**
     * @param {boolean} discoverUsbDevices
     * @param {boolean} portForwardingEnabled
     * @param {!Adb.PortForwardingConfig} portForwardingConfig
     */
    discoveryConfigChanged: function(discoverUsbDevices, portForwardingEnabled, portForwardingConfig)
    {
        this._discoverUsbDevicesCheckbox.checked = discoverUsbDevices;
        this._portForwardingEnabledCheckbox.checked = portForwardingEnabled;
    },

    _updateDiscoveryConfig: function()
    {
        InspectorFrontendHost.setDevicesDiscoveryConfig(this._discoverUsbDevicesCheckbox.checked, this._portForwardingEnabledCheckbox.checked, {"8080": "localhost:8080"});
    },

    __proto__: WebInspector.VBox.prototype
}


/**
 * @constructor
 * @extends {WebInspector.VBox}
 */
WebInspector.DevicesView.DeviceView = function()
{
    WebInspector.VBox.call(this);
    this.setMinimumSize(100, 100);
    this.contentElement.classList.add("device-view");

    var topRow = this.contentElement.createChild("div", "hbox device-text-row");
    this._deviceTitle = topRow.createChild("div", "view-title");
    this._deviceSerial = topRow.createChild("div", "device-serial");

    this._deviceOffline = this.contentElement.createChild("div");
    this._deviceOffline.textContent = WebInspector.UIString("Pending authentication: please accept debugging session on the device.");

    this._noBrowsers = this.contentElement.createChild("div");
    this._noBrowsers.textContent = WebInspector.UIString("No browsers detected.");

    this._browsers = this.contentElement.createChild("div", "device-browser-list vbox");

    /** @type {!Map<string, !WebInspector.DevicesView.BrowserSection>} */
    this._browserById = new Map();

    this._device = null;
}

/** @typedef {!{browser: ?Adb.Browser, element: !Element, title: !Element, pages: !Element, pageSections: !Map<string, !WebInspector.DevicesView.PageSection>}} */
WebInspector.DevicesView.BrowserSection;

/** @typedef {!{page: ?Adb.Page, element: !Element, title: !Element, url: !Element, inspect: !Element}} */
WebInspector.DevicesView.PageSection;

WebInspector.DevicesView.DeviceView.prototype = {
    /**
     * @param {!Adb.Device} device
     */
    update: function(device)
    {
        if (!this._device || this._device.adbModel !== device.adbModel)
            this._deviceTitle.textContent = device.adbModel;

        if (!this._device || this._device.adbSerial !== device.adbSerial)
            this._deviceSerial.textContent = "#" + device.adbSerial;

        this._deviceOffline.classList.toggle("hidden", device.adbConnected);
        this._noBrowsers.classList.toggle("hidden", !device.adbConnected || device.browsers.length);
        this._browsers.classList.toggle("hidden", !device.adbConnected || !device.browsers.length);

        var browserIds = new Set();
        for (var browser of device.browsers)
            browserIds.add(browser.id);

        for (var browserId of this._browserById.keys()) {
            if (!browserIds.has(browserId)) {
                this._browserById.get(browserId).element.remove();
                this._browserById.remove(browserId);
            }
        }

        for (var browser of device.browsers) {
            var section = this._browserById.get(browser.id);
            if (!section) {
                section = this._createBrowserSection();
                this._browserById.set(browser.id, section);
                this._browsers.appendChild(section.element);
            }
            this._updateBrowserSection(section, browser);
        }

        this._device = device;
    },

    /**
     * @return {!WebInspector.DevicesView.BrowserSection}
     */
    _createBrowserSection: function()
    {
        var element = createElementWithClass("div", "vbox flex-none");
        var topRow = element.createChild("div", "");
        var title = topRow.createChild("div", "device-browser-title");
        var pages = element.createChild("div", "device-page-list vbox");
        return {browser: null, element: element, title: title, pages: pages, pageSections: new Map()};
    },

    /**
     * @param {!WebInspector.DevicesView.BrowserSection} section
     * @param {!Adb.Browser} browser
     */
    _updateBrowserSection: function(section, browser)
    {
        if (!section.browser || section.browser.adbBrowserName !== browser.adbBrowserName || section.browser.adbBrowserVersion !== browser.adbBrowserVersion) {
            if (browser.adbBrowserVersion)
                section.title.textContent = String.sprintf("%s (%s)", browser.adbBrowserName, browser.adbBrowserVersion);
            else
                section.title.textContent = browser.adbBrowserName;
        }

        var pageIds = new Set();
        for (var page of browser.pages)
            pageIds.add(page.id);

        for (var pageId of section.pageSections.keys()) {
            if (!pageIds.has(pageId)) {
                section.pageSections.get(pageId).element.remove();
                section.pageSections.remove(pageId);
            }
        }

        for (var page of browser.pages) {
            var pageSection = section.pageSections.get(page.id);
            if (!pageSection) {
                pageSection = this._createPageSection();
                section.pageSections.set(page.id, pageSection);
                section.pages.appendChild(pageSection.element);
            }
            this._updatePageSection(pageSection, page);
        }

        section.browser = browser;
    },

    /**
     * @return {!WebInspector.DevicesView.PageSection}
     */
    _createPageSection: function()
    {
        var element = createElementWithClass("div", "vbox");
        var title = element.createChild("div", "device-page-title");
        var url = element.createChild("div", "device-page-url");
        var actions = element.createChild("div", "device-page-actions hbox");
        var section = /** @type {!WebInspector.DevicesView.PageSection} */ ({page: null, element: element, title: title, url: url});
        section.inspect = this._createAction(actions, WebInspector.UIString("inspect"), "inspect", section);
        this._createAction(actions, WebInspector.UIString("reload"), "reload", section);
        this._createAction(actions, WebInspector.UIString("activate"), "activate", section);
        this._createAction(actions, WebInspector.UIString("close"), "close", section);
        return section;
    },

    /**
     * @param {!Element} container
     * @param {string} title
     * @param {string} action
     * @param {!WebInspector.DevicesView.PageSection} section
     * @return {!Element}
     */
    _createAction: function(container, title, action, section)
    {
        var element = container.createChild("div", "link");
        element.textContent = title;
        element.addEventListener("click", onClick, false);
        return element;

        function onClick()
        {
            if (section.page)
                InspectorFrontendHost.performActionOnRemotePage(section.page.id, action);
        }
    },

    /**
     * @param {!WebInspector.DevicesView.PageSection} section
     * @param {!Adb.Page} page
     */
    _updatePageSection: function(section, page)
    {
        if (!section.page || section.page.name !== page.name)
            section.title.textContent = page.name;
        if (!section.page || section.page.url !== page.url) {
            section.url.textContent = "";
            section.url.appendChild(WebInspector.linkifyURLAsNode(page.url, undefined, undefined, true));
        }
        section.inspect.disabled = page.adbAttachedForeign;

        section.page = page;
    },

    __proto__: WebInspector.VBox.prototype
}
