// Copyright 2015 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

/**
 * @constructor
 * @extends {WebInspector.VBox}
 */
WebInspector.DevicesSettingsTab = function()
{
    WebInspector.VBox.call(this);
    this.element.classList.add("settings-tab-container");
    this.element.classList.add("devices-settings-tab");
    this.registerRequiredCSS("emulation/devicesSettingsTab.css");

    var header = this.element.createChild("header");
    header.createChild("h3").createTextChild(WebInspector.UIString("Emulated Devices"));
    this.containerElement = this.element.createChild("div", "help-container-wrapper").createChild("div", "settings-tab help-content help-container");

    var buttonsRow = this.containerElement.createChild("div", "devices-button-row");
    this._addCustomButton = createTextButton(WebInspector.UIString("Add custom device..."), this._addCustomDevice.bind(this));
    buttonsRow.appendChild(this._addCustomButton);

    this._devicesList = this.containerElement.createChild("div", "devices-list");
    this._customListSearator = createElementWithClass("div", "devices-custom-separator");

    this._editDevice = null;
    this._editDeviceListItem = null;
    this._createEditDeviceElement();

    this._muteUpdate = false;
    WebInspector.emulatedDevicesList.addEventListener(WebInspector.EmulatedDevicesList.Events.CustomDevicesUpdated, this._devicesUpdated, this);
    WebInspector.emulatedDevicesList.addEventListener(WebInspector.EmulatedDevicesList.Events.StandardDevicesUpdated, this._devicesUpdated, this);
}

WebInspector.DevicesSettingsTab.prototype = {
    wasShown: function()
    {
        WebInspector.VBox.prototype.wasShown.call(this);
        this._devicesUpdated();
        this._stopEditing();
    },

    _devicesUpdated: function()
    {
        if (this._muteUpdate)
            return;

        this._devicesList.removeChildren();

        var devices = WebInspector.emulatedDevicesList.custom().slice();
        devices.sort(WebInspector.EmulatedDevice.compareByTitle);
        for (var i = 0; i < devices.length; ++i)
            this._devicesList.appendChild(this._createDeviceListItem(devices[i], true));

        this._devicesList.appendChild(this._customListSearator);
        this._updateSeparatorVisibility();

        devices = WebInspector.emulatedDevicesList.standard().slice();
        devices.sort(WebInspector.EmulatedDevice.compareByTitle);
        for (var i = 0; i < devices.length; ++i)
            this._devicesList.appendChild(this._createDeviceListItem(devices[i], false));
    },

    _updateSeparatorVisibility: function()
    {
        this._customListSearator.classList.toggle("hidden", this._devicesList.firstChild === this._customListSearator);
    },

    /**
     * @param {boolean} custom
     */
    _muteAndSaveDeviceList: function(custom)
    {
        this._muteUpdate = true;
        if (custom)
            WebInspector.emulatedDevicesList.saveCustomDevices();
        else
            WebInspector.emulatedDevicesList.saveStandardDevices();
        this._muteUpdate = false;
    },

    /**
     * @param {!WebInspector.EmulatedDevice} device
     * @param {boolean} custom
     * @return {!Element}
     */
    _createDeviceListItem: function(device, custom)
    {
        var item = createElementWithClass("div", "devices-list-item");
        var checkbox = item.createChild("input", "devices-list-checkbox");
        checkbox.type = "checkbox";
        checkbox.checked = device.show();
        item.createChild("div", "devices-list-title").textContent = device.title;
        item.addEventListener("click", onItemClicked.bind(this), false);
        item.classList.toggle("device-list-item-show", device.show());
        if (custom) {
            var editButton = item.createChild("div", "devices-list-edit");
            editButton.title = WebInspector.UIString("Edit");
            editButton.addEventListener("click", onEditClicked.bind(this), false);

            var removeButton = item.createChild("div", "devices-list-remove");
            removeButton.title = WebInspector.UIString("Remove");
            removeButton.addEventListener("click", onRemoveClicked, false);
        }

        /**
         * @param {!Event} event
         * @this {WebInspector.DevicesSettingsTab}
         */
        function onItemClicked(event)
        {
            var show = !checkbox.checked;
            device.setShow(show);
            this._muteAndSaveDeviceList(custom);
            checkbox.checked = show;
            item.classList.toggle("device-list-item-show", show);
            event.consume();
        }

        /**
         * @param {!Event} event
         * @this {WebInspector.DevicesSettingsTab}
         */
        function onEditClicked(event)
        {
            event.consume();
            this._startEditing(device, item);
        }

        /**
         * @param {!Event} event
         */
        function onRemoveClicked(event)
        {
            WebInspector.emulatedDevicesList.removeCustomDevice(device);
            event.consume();
        }

        return item;
    },

    _addCustomDevice: function()
    {
        this._startEditing(new WebInspector.EmulatedDevice(), null);
    },

    _createEditDeviceElement: function()
    {
        this._editDeviceElement = createElementWithClass("div", "devices-edit-container");
        this._editDeviceElement.addEventListener("keydown", onKeyDown.bind(null, isEscKey, this._stopEditing.bind(this)), false);
        this._editDeviceElement.addEventListener("keydown", onKeyDown.bind(null, isEnterKey, this._editDeviceCommitClicked.bind(this)), false);
        this._editDeviceCheckbox = this._editDeviceElement.createChild("input", "devices-edit-checkbox");
        this._editDeviceCheckbox.type = "checkbox";
        var fields = this._editDeviceElement.createChild("div", "devices-edit-fields");

        this._editDeviceTitle = this._createInput(WebInspector.UIString("Device name"));
        fields.appendChild(this._editDeviceTitle);

        var screen = fields.createChild("div", "hbox");
        this._editDeviceWidth = this._createInput(WebInspector.UIString("Width"), "80px");
        screen.appendChild(this._editDeviceWidth);
        this._editDeviceHeight = this._createInput(WebInspector.UIString("Height"), "80px");
        screen.appendChild(this._editDeviceHeight);
        this._editDeviceScale = this._createInput(WebInspector.UIString("Device pixel ratio"));
        screen.appendChild(this._editDeviceScale);

        this._editDeviceUserAgent = this._createInput(WebInspector.UIString("User agent string"));
        fields.appendChild(this._editDeviceUserAgent);

        var buttonsRow = fields.createChild("div", "devices-edit-buttons");
        this._editDeviceCommitButton = createTextButton("", this._editDeviceCommitClicked.bind(this));
        buttonsRow.appendChild(this._editDeviceCommitButton);
        this._editDeviceCancelButton = createTextButton(WebInspector.UIString("Cancel"), this._stopEditing.bind(this));
        this._editDeviceCancelButton.addEventListener("keydown", onKeyDown.bind(null, isEnterKey, this._stopEditing.bind(this)), false);
        buttonsRow.appendChild(this._editDeviceCancelButton);

        /**
         * @param {function(!Event):boolean} predicate
         * @param {function()} callback
         * @param {!Event} event
         */
        function onKeyDown(predicate, callback, event)
        {
            if (predicate(event)) {
                event.consume(true);
                callback();
            }
        }
    },

    /**
     * @param {string} title
     * @param {string=} width
     * @return {!Element}
     */
    _createInput: function(title, width)
    {
        var input = createElement("input");
        input.type = "text";
        if (width)
            input.style.width = width;
        input.placeholder = title;
        input.addEventListener("input", this._validateInputs.bind(this, false), false);
        input.addEventListener("blur", this._validateInputs.bind(this, false), false);
        return input;
    },

    /**
     * @param {boolean} forceValid
     */
    _validateInputs: function(forceValid)
    {
        var trimmedTitle = this._editDeviceTitle.value.trim();
        var titleValid = trimmedTitle.length > 0 && trimmedTitle.length < 50;
        this._editDeviceTitle.classList.toggle("error-input", !titleValid && !forceValid);

        var widthValid = !WebInspector.OverridesSupport.deviceSizeValidator(this._editDeviceWidth.value);
        this._editDeviceWidth.classList.toggle("error-input", !widthValid && !forceValid);

        var heightValid = !WebInspector.OverridesSupport.deviceSizeValidator(this._editDeviceHeight.value);
        this._editDeviceHeight.classList.toggle("error-input", !heightValid && !forceValid);

        var scaleValid = !WebInspector.OverridesSupport.deviceScaleFactorValidator(this._editDeviceScale.value);
        this._editDeviceScale.classList.toggle("error-input", !scaleValid && !forceValid);

        var allValid = titleValid && widthValid && heightValid && scaleValid;
        this._editDeviceCommitButton.disabled = !allValid;
    },

    /**
     * @param {number} value
     * @return {string}
     */
    _toNumericInputValue: function(value)
    {
        return value ? String(value) : "";
    },

    /**
     * @param {!WebInspector.EmulatedDevice} device
     * @param {?Element} listItem
     */
    _startEditing: function(device, listItem)
    {
        this._stopEditing();

        this._addCustomButton.disabled = true;
        this._devicesList.classList.add("devices-list-editing");
        this._editDevice = device;
        this._editDeviceListItem = listItem;
        if (listItem)
            listItem.classList.add("hidden");

        this._editDeviceCommitButton.textContent = listItem ? WebInspector.UIString("Save") : WebInspector.UIString("Add device");
        this._editDeviceCheckbox.checked = device.show();
        this._editDeviceTitle.value = device.title;
        this._editDeviceWidth.value = listItem ? this._toNumericInputValue(device.vertical.width) : "";
        this._editDeviceHeight.value = listItem ? this._toNumericInputValue(device.vertical.height) : "";
        this._editDeviceScale.value = listItem ? this._toNumericInputValue(device.deviceScaleFactor) : "";
        this._editDeviceUserAgent.value = device.userAgent;
        this._validateInputs(true);

        if (listItem && listItem.nextElementSibling)
            this._devicesList.insertBefore(this._editDeviceElement, listItem.nextElementSibling);
        else
            this._devicesList.insertBefore(this._editDeviceElement, this._customListSearator);
        this._editDeviceCommitButton.scrollIntoView();
        this._editDeviceTitle.focus();
    },

    _editDeviceCommitClicked: function()
    {
        if (this._editDeviceCommitButton.disabled)
            return;

        this._editDevice.setShow(this._editDeviceCheckbox.checked);
        this._editDevice.title = this._editDeviceTitle.value;
        this._editDevice.vertical.width = this._editDeviceWidth.value ? parseInt(this._editDeviceWidth.value, 10) : 0;
        this._editDevice.vertical.height = this._editDeviceHeight.value ? parseInt(this._editDeviceHeight.value, 10) : 0;
        this._editDevice.horizontal.width = this._editDevice.vertical.height;
        this._editDevice.horizontal.height = this._editDevice.vertical.width;
        this._editDevice.deviceScaleFactor = this._editDeviceScale.value ? parseFloat(this._editDeviceScale.value) : 0;
        this._editDevice.userAgent = this._editDeviceUserAgent.value;
        this._editDevice.modes.push({title: "", orientation: WebInspector.EmulatedDevice.Horizontal, insets: new Insets(0, 0, 0, 0), images: null});
        this._editDevice.modes.push({title: "", orientation: WebInspector.EmulatedDevice.Vertical, insets: new Insets(0, 0, 0, 0), images: null});

        this._stopEditing();
        if (this._editDeviceListItem)
            WebInspector.emulatedDevicesList.saveCustomDevices();
        else
            WebInspector.emulatedDevicesList.addCustomDevice(this._editDevice);
        this._editDevice = null;
        this._editDeviceListItem = null;
    },

    _stopEditing: function()
    {
        this._devicesList.classList.remove("devices-list-editing");
        if (this._editDeviceListItem)
            this._editDeviceListItem.classList.remove("hidden");
        if (this._editDeviceElement.parentElement)
            this._devicesList.removeChild(this._editDeviceElement);
        this._addCustomButton.disabled = false;
        this._addCustomButton.focus();
    },

    __proto__: WebInspector.VBox.prototype
}
