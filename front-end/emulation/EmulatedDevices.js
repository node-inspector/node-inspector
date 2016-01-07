// Copyright 2014 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

/**
 * @constructor
 */
WebInspector.EmulatedDevice = function()
{
    /** @type {string} */
    this.title = "";
    /** @type {string} */
    this.type = WebInspector.EmulatedDevice.Type.Unknown;
    /** @type {!WebInspector.EmulatedDevice.Orientation} */
    this.vertical = {width: 0, height: 0, outlineInsets: null, outlineImage: null};
    /** @type {!WebInspector.EmulatedDevice.Orientation} */
    this.horizontal = {width: 0, height: 0, outlineInsets: null, outlineImage: null};
    /** @type {number} */
    this.deviceScaleFactor = 1;
    /** @type {!Array.<string>} */
    this.capabilities = [WebInspector.EmulatedDevice.Capability.Touch, WebInspector.EmulatedDevice.Capability.Mobile];
    /** @type {string} */
    this.userAgent = "";
    /** @type {!Array.<!WebInspector.EmulatedDevice.Mode>} */
    this.modes = [];

    /** @type {string} */
    this._show = WebInspector.EmulatedDevice._Show.Default;
    /** @type {boolean} */
    this._showByDefault = true;

    /** @type {?Runtime.Extension} */
    this._extension = null;
}

/** @typedef {!{title: string, orientation: string, insets: !Insets, image: ?string}} */
WebInspector.EmulatedDevice.Mode;

/** @typedef {!{width: number, height: number, outlineInsets: ?Insets, outlineImage: ?string}} */
WebInspector.EmulatedDevice.Orientation;

WebInspector.EmulatedDevice.Horizontal = "horizontal";
WebInspector.EmulatedDevice.Vertical = "vertical";

WebInspector.EmulatedDevice.Type = {
    Phone: "phone",
    Tablet: "tablet",
    Notebook: "notebook",
    Desktop: "desktop",
    Unknown: "unknown"
}

WebInspector.EmulatedDevice.Capability = {
    Touch: "touch",
    Mobile: "mobile"
}

WebInspector.EmulatedDevice._Show = {
    Always: "Always",
    Default: "Default",
    Never: "Never"
}

/**
 * @param {*} json
 * @return {?WebInspector.EmulatedDevice}
 */
WebInspector.EmulatedDevice.fromJSONV1 = function(json)
{
    try {
        /**
         * @param {*} object
         * @param {string} key
         * @param {string} type
         * @param {*=} defaultValue
         * @return {*}
         */
        function parseValue(object, key, type, defaultValue)
        {
            if (typeof object !== "object" || object === null || !object.hasOwnProperty(key)) {
                if (typeof defaultValue !== "undefined")
                    return defaultValue;
                throw new Error("Emulated device is missing required property '" + key + "'");
            }
            var value = object[key];
            if (typeof value !== type || value === null)
                throw new Error("Emulated device property '" + key + "' has wrong type '" + typeof value + "'");
            return value;
        }

        /**
         * @param {*} object
         * @param {string} key
         * @return {number}
         */
        function parseIntValue(object, key)
        {
            var value = /** @type {number} */ (parseValue(object, key, "number"));
            if (value !== Math.abs(value))
                throw new Error("Emulated device value '" + key + "' must be integer");
            return value;
        }

        /**
         * @param {*} json
         * @return {!Insets}
         */
        function parseInsets(json)
        {
            return new Insets(parseIntValue(json, "left"), parseIntValue(json, "top"), parseIntValue(json, "right"), parseIntValue(json, "bottom"));
        }

        /**
         * @param {*} json
         * @return {!WebInspector.EmulatedDevice.Orientation}
         */
        function parseOrientation(json)
        {
            var result = {};

            result.width = parseIntValue(json, "width");
            if (result.width < 0 || result.width > WebInspector.OverridesSupport.MaxDeviceSize)
                throw new Error("Emulated device has wrong width: " + result.width);

            result.height = parseIntValue(json, "height");
            if (result.height < 0 || result.height > WebInspector.OverridesSupport.MaxDeviceSize)
                throw new Error("Emulated device has wrong height: " + result.height);

            var outlineInsets = parseValue(json["outline"], "insets", "object", null);
            if (outlineInsets) {
                result.outlineInsets = parseInsets(outlineInsets);
                if (result.outlineInsets.left < 0 || result.outlineInsets.top < 0)
                    throw new Error("Emulated device has wrong outline insets");
                result.outlineImage = /** @type {string} */ (parseValue(json["outline"], "image", "string"));
            }

            return /** @type {!WebInspector.EmulatedDevice.Orientation} */ (result);
        }

        var result = new WebInspector.EmulatedDevice();
        result.title = /** @type {string} */ (parseValue(json, "title", "string"));
        result.type = /** @type {string} */ (parseValue(json, "type", "string"));
        result.userAgent = /** @type {string} */ (parseValue(json, "user-agent", "string"));

        var capabilities = parseValue(json, "capabilities", "object", []);
        if (!Array.isArray(capabilities))
            throw new Error("Emulated device capabilities must be an array");
        result.capabilities = [];
        for (var i = 0; i < capabilities.length; ++i) {
            if (typeof capabilities[i] !== "string")
                throw new Error("Emulated device capability must be a string");
            result.capabilities.push(capabilities[i]);
        }

        result.deviceScaleFactor = /** @type {number} */ (parseValue(json["screen"], "device-pixel-ratio", "number"));
        if (result.deviceScaleFactor < 0 || result.deviceScaleFactor > 100)
            throw new Error("Emulated device has wrong deviceScaleFactor: " + result.deviceScaleFactor);

        result.vertical = parseOrientation(parseValue(json["screen"], "vertical", "object"));
        result.horizontal = parseOrientation(parseValue(json["screen"], "horizontal", "object"));

        var modes = parseValue(json, "modes", "object", []);
        if (!Array.isArray(modes))
            throw new Error("Emulated device modes must be an array");
        result.modes = [];
        for (var i = 0; i < modes.length; ++i) {
            var mode = {};
            mode.title = /** @type {string} */ (parseValue(modes[i], "title", "string"));
            mode.orientation = /** @type {string} */ (parseValue(modes[i], "orientation", "string"));
            if (mode.orientation !== WebInspector.EmulatedDevice.Vertical && mode.orientation !== WebInspector.EmulatedDevice.Horizontal)
                throw new Error("Emulated device mode has wrong orientation '" + mode.orientation + "'");
            var orientation = result.orientationByName(mode.orientation);
            mode.insets = parseInsets(parseValue(modes[i], "insets", "object"));
            if (mode.insets.top < 0 || mode.insets.left < 0 || mode.insets.right < 0 || mode.insets.bottom < 0 ||
                mode.insets.top + mode.insets.bottom > orientation.height || mode.insets.left + mode.insets.right > orientation.width) {
                throw new Error("Emulated device mode '" + mode.title + "'has wrong mode insets");
            }
            mode.image = /** @type {string} */ (parseValue(modes[i], "image", "string", null));
            result.modes.push(mode);
        }

        result._showByDefault = /** @type {boolean} */ (parseValue(json, "show-by-default", "boolean", true));
        result._show = /** @type {string} */ (parseValue(json, "show", "string", WebInspector.EmulatedDevice._Show.Default));

        return result;
    } catch (e) {
        WebInspector.console.error("Failed to update emulated device list. " + String(e));
        return null;
    }
}

/**
 * @param {!WebInspector.OverridesSupport.Device} device
 * @param {string} title
 * @param {string=} type
 * @return {!WebInspector.EmulatedDevice}
 */
WebInspector.EmulatedDevice.fromOverridesDevice = function(device, title, type)
{
    var result = new WebInspector.EmulatedDevice();
    result.title = title;
    result.type = type || WebInspector.EmulatedDevice.Type.Unknown;
    result.vertical.width = device.width;
    result.vertical.height = device.height;
    result.horizontal.width = device.height;
    result.horizontal.height = device.width;
    result.deviceScaleFactor = device.deviceScaleFactor;
    result.userAgent = device.userAgent;
    result.capabilities = [];
    if (device.touch)
        result.capabilities.push(WebInspector.EmulatedDevice.Capability.Touch);
    if (device.mobile)
        result.capabilities.push(WebInspector.EmulatedDevice.Capability.Mobile);
    return result;
}

/**
 * @param {!WebInspector.EmulatedDevice} device1
 * @param {!WebInspector.EmulatedDevice} device2
 * @return {number}
 */
WebInspector.EmulatedDevice.compareByTitle = function(device1, device2)
{
    return device1.title < device2.title ? -1 : (device1.title > device2.title ? 1 : 0);
}

WebInspector.EmulatedDevice.prototype = {
    /**
     * @return {?Runtime.Extension}
     */
    extension: function()
    {
        return this._extension;
    },

    /**
     * @param {?Runtime.Extension} extension
     */
    setExtension: function(extension)
    {
        this._extension = extension;
    },

    /**
     * @param {string} orientation
     * @return {!Array.<!WebInspector.EmulatedDevice.Mode>}
     */
    modesForOrientation: function(orientation)
    {
        var result = [];
        for (var index = 0; index < this.modes.length; index++) {
            if (this.modes[index].orientation === orientation)
                result.push(this.modes[index]);
        }
        return result;
    },

    /**
     * @return {*}
     */
    _toJSON: function()
    {
        var json = {};
        json["title"] = this.title;
        json["type"] = this.type;
        json["user-agent"] = this.userAgent;
        json["capabilities"] = this.capabilities;

        json["screen"] = {};
        json["screen"]["device-pixel-ratio"] = this.deviceScaleFactor;
        json["screen"]["vertical"] = this._orientationToJSON(this.vertical);
        json["screen"]["horizontal"] = this._orientationToJSON(this.horizontal);

        json["modes"] = [];
        for (var i = 0; i < this.modes.length; ++i) {
            var mode = {};
            mode["title"] = this.modes[i].title;
            mode["orientation"] = this.modes[i].orientation;
            mode["insets"] = {};
            mode["insets"]["left"] = this.modes[i].insets.left;
            mode["insets"]["top"] = this.modes[i].insets.top;
            mode["insets"]["right"] = this.modes[i].insets.right;
            mode["insets"]["bottom"] = this.modes[i].insets.bottom;
            if (this.modes[i].image)
                mode["image"] = this.modes[i].image;
            json["modes"].push(mode);
        }

        json["show-by-default"] = this._showByDefault;
        json["show"] = this._show;

        return json;
    },

    /**
     * @param {!WebInspector.EmulatedDevice.Orientation} orientation
     * @return {*}
     */
    _orientationToJSON: function(orientation)
    {
        var json = {};
        json["width"] = orientation.width;
        json["height"] = orientation.height;
        if (orientation.outlineInsets) {
            json["outline"] = {};
            json["outline"]["insets"] = {};
            json["outline"]["insets"]["left"] = orientation.outlineInsets.left;
            json["outline"]["insets"]["top"] = orientation.outlineInsets.top;
            json["outline"]["insets"]["right"] = orientation.outlineInsets.right;
            json["outline"]["insets"]["bottom"] = orientation.outlineInsets.bottom;
            json["outline"]["image"] = orientation.outlineImage;
        }
        return json;
    },

    /**
     * @param {!WebInspector.EmulatedDevice.Mode} mode
     * @return {!WebInspector.OverridesSupport.Device}
     */
    modeToOverridesDevice: function(mode)
    {
        var result = {};
        var orientation = this.orientationByName(mode.orientation);
        result.width = orientation.width - mode.insets.left - mode.insets.right;
        result.height = orientation.height - mode.insets.top - mode.insets.bottom;
        result.deviceScaleFactor = this.deviceScaleFactor;
        result.userAgent = this.userAgent;
        result.touch = this.touch();
        result.mobile = this.mobile();
        return result;
    },

    /**
     * @param {!WebInspector.EmulatedDevice.Mode} mode
     * @return {string}
     */
    modeImage: function(mode)
    {
        if (!mode.image)
            return "";
        if (!this._extension)
            return mode.image;
        return this._extension.module().substituteURL(mode.image);
    },

    /**
     * @param {string} name
     * @return {!WebInspector.EmulatedDevice.Orientation}
     */
    orientationByName: function(name)
    {
        return name === WebInspector.EmulatedDevice.Vertical ? this.vertical : this.horizontal;
    },

    /**
     * @return {boolean}
     */
    show: function()
    {
        if (this._show === WebInspector.EmulatedDevice._Show.Default)
            return this._showByDefault;
        return this._show === WebInspector.EmulatedDevice._Show.Always;
    },

    /**
     * @param {boolean} show
     */
    setShow: function(show)
    {
        this._show = show ? WebInspector.EmulatedDevice._Show.Always : WebInspector.EmulatedDevice._Show.Never;
    },

    /**
     * @param {!WebInspector.EmulatedDevice} other
     */
    copyShowFrom: function(other)
    {
        this._show = other._show;
    },

    /**
     * @return {boolean}
     */
    touch: function()
    {
        return this.capabilities.indexOf(WebInspector.EmulatedDevice.Capability.Touch) !== -1;
    },

    /**
     * @return {boolean}
     */
    mobile: function()
    {
        return this.capabilities.indexOf(WebInspector.EmulatedDevice.Capability.Mobile) !== -1;
    }
}


/**
 * @constructor
 * @extends {WebInspector.Object}
 */
WebInspector.EmulatedDevicesList = function()
{
    WebInspector.Object.call(this);
    WebInspector.settings.createSetting("standardEmulatedDeviceList", []).remove();

    /** @type {!WebInspector.Setting} */
    this._standardSetting = WebInspector.settings.createSetting("standardEmulatedDeviceList", []);
    /** @type {!Array.<!WebInspector.EmulatedDevice>} */
    this._standard = this._listFromJSONV1(this._standardSetting.get());
    this._updateStandardDevices();

    /** @type {!WebInspector.Setting} */
    this._customSetting = WebInspector.settings.createSetting("customEmulatedDeviceList", []);
    /** @type {!Array.<!WebInspector.EmulatedDevice>} */
    this._custom = this._listFromJSONV1(this._customSetting.get());
}

WebInspector.EmulatedDevicesList.Events = {
    CustomDevicesUpdated: "CustomDevicesUpdated",
    StandardDevicesUpdated: "StandardDevicesUpdated"
}

WebInspector.EmulatedDevicesList.prototype = {
    _updateStandardDevices: function()
    {
        var devices = [];
        var extensions = self.runtime.extensions("emulated-device");
        for (var i = 0; i < extensions.length; ++i) {
            var device = WebInspector.EmulatedDevice.fromJSONV1(extensions[i].descriptor()["device"]);
            device.setExtension(extensions[i]);
            devices.push(device);
        }
        this._copyShowValues(this._standard, devices);
        this._standard = devices;
        this.saveStandardDevices();
    },

    /**
     * @param {!Array.<*>} jsonArray
     * @return {!Array.<!WebInspector.EmulatedDevice>}
     */
    _listFromJSONV1: function(jsonArray)
    {
        var result = [];
        if (!Array.isArray(jsonArray))
            return result;
        for (var i = 0; i < jsonArray.length; ++i) {
            var device = WebInspector.EmulatedDevice.fromJSONV1(jsonArray[i]);
            if (device) {
                result.push(device);
                if (!device.modes.length) {
                    device.modes.push({title: "", orientation: WebInspector.EmulatedDevice.Horizontal, insets: new Insets(0, 0, 0, 0), image: null});
                    device.modes.push({title: "", orientation: WebInspector.EmulatedDevice.Vertical, insets: new Insets(0, 0, 0, 0), image: null});
                }
            }
        }
        return result;
    },

    /**
     * @return {!Array.<!WebInspector.EmulatedDevice>}
     */
    standard: function()
    {
        return this._standard;
    },

    /**
     * @return {!Array.<!WebInspector.EmulatedDevice>}
     */
    custom: function()
    {
        return this._custom;
    },

    /**
     * @param {!WebInspector.EmulatedDevice} device
     */
    addCustomDevice: function(device)
    {
        this._custom.push(device);
        this.saveCustomDevices();
    },

    /**
     * @param {!WebInspector.EmulatedDevice} device
     */
    removeCustomDevice: function(device)
    {
        this._custom.remove(device);
        this.saveCustomDevices();
    },

    saveCustomDevices: function()
    {
        var json = this._custom.map(/** @param {!WebInspector.EmulatedDevice} device */ function(device) { return device._toJSON(); });
        this._customSetting.set(json);
        this.dispatchEventToListeners(WebInspector.EmulatedDevicesList.Events.CustomDevicesUpdated);
    },

    saveStandardDevices: function()
    {
        var json = this._standard.map(/** @param {!WebInspector.EmulatedDevice} device */ function(device) { return device._toJSON(); });
        this._standardSetting.set(json);
        this.dispatchEventToListeners(WebInspector.EmulatedDevicesList.Events.StandardDevicesUpdated);
    },

    /**
     * @param {!Array.<!WebInspector.EmulatedDevice>} from
     * @param {!Array.<!WebInspector.EmulatedDevice>} to
     */
    _copyShowValues: function(from, to)
    {
        var deviceById = new Map();
        for (var i = 0; i < from.length; ++i)
            deviceById.set(from[i].title, from[i]);

        for (var i = 0; i < to.length; ++i) {
            var title = to[i].title;
            if (deviceById.has(title))
                to[i].copyShowFrom(/** @type {!WebInspector.EmulatedDevice} */ (deviceById.get(title)));
        }
    },

    __proto__: WebInspector.Object.prototype
}

/** @type {!WebInspector.EmulatedDevicesList} */
WebInspector.emulatedDevicesList;
