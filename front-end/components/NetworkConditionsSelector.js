// Copyright 2015 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

/**
 * @constructor
 * @param {!HTMLSelectElement} selectElement
 */
WebInspector.NetworkConditionsSelector = function(selectElement)
{
    this._selectElement = selectElement;
    this._selectElement.addEventListener("change", this._optionSelected.bind(this), false);
    this._customSetting = WebInspector.moduleSetting("networkConditionsCustomProfiles");
    this._customSetting.addChangeListener(this._populateOptions, this);
    this._setting = WebInspector.moduleSetting("networkConditions");
    this._setting.addChangeListener(this._settingChanged, this);
    this._populateOptions();
}

/** @typedef {!{title: string, value: !WebInspector.NetworkManager.Conditions}} */
WebInspector.NetworkConditionsProfile;

/**
 * @param {!WebInspector.NetworkManager.Conditions} conditions
 * @return {string}
 */
WebInspector.NetworkConditionsSelector.throughputText = function(conditions)
{
    if (conditions.throughput < 0)
        return "";
    var throughputInKbps = conditions.throughput / (1024 / 8);
    return (throughputInKbps < 1024) ? WebInspector.UIString("%d kb/s", throughputInKbps) : WebInspector.UIString("%d Mb/s", (throughputInKbps / 1024) | 0);
}

/**
 * @param {string} value
 * @return {string}
 */
WebInspector.NetworkConditionsSelector.throughputValidator = function(value)
{
    if (!value || (/^[\d]+(\.\d+)?|\.\d+$/.test(value) && value >= 0 && value <= 10000000))
        return "";
    return WebInspector.UIString("Value must be non-negative float");
}

/**
 * @param {string} value
 * @return {string}
 */
WebInspector.NetworkConditionsSelector.latencyValidator = function(value)
{
    if (!value || (/^[\d]+$/.test(value) && value >= 0 && value <= 1000000))
        return "";
    return WebInspector.UIString("Value must be non-negative integer");
}

/** @type {!Array.<!WebInspector.NetworkConditionsProfile>} */
WebInspector.NetworkConditionsSelector._networkConditionsPresets = [
    {title: "Offline", value: {throughput: 0 * 1024 / 8, latency: 0}},
    {title: "GPRS", value: {throughput: 50 * 1024 / 8, latency: 500}},
    {title: "Regular 2G", value: {throughput: 250 * 1024 / 8, latency: 300}},
    {title: "Good 2G", value: {throughput: 450 * 1024 / 8, latency: 150}},
    {title: "Regular 3G", value: {throughput: 750 * 1024 / 8, latency: 100}},
    {title: "Good 3G", value: {throughput: 1.5 * 1024 * 1024 / 8, latency: 40}},
    {title: "Regular 4G", value: {throughput: 4 * 1024 * 1024 / 8, latency: 20}},
    {title: "DSL", value: {throughput: 2 * 1024 * 1024 / 8, latency: 5}},
    {title: "WiFi", value: {throughput: 30 * 1024 * 1024 / 8, latency: 2}}
];

/** @type {!WebInspector.NetworkConditionsProfile} */
WebInspector.NetworkConditionsSelector._disabledPreset = {title: "No throttling", value: {throughput: -1, latency: 0}};

WebInspector.NetworkConditionsSelector.prototype = {
    _populateOptions: function()
    {
        this._selectElement.removeChildren();

        var customGroup = this._addGroup(this._customSetting.get(), WebInspector.UIString("Custom"));
        customGroup.insertBefore(new Option(WebInspector.UIString("Add\u2026"), WebInspector.UIString("Add\u2026")), customGroup.firstChild);

        this._addGroup(WebInspector.NetworkConditionsSelector._networkConditionsPresets, WebInspector.UIString("Presets"));
        this._addGroup([WebInspector.NetworkConditionsSelector._disabledPreset], WebInspector.UIString("Disabled"));

        this._settingChanged();
    },

    /**
     * @param {!Array.<!WebInspector.NetworkConditionsProfile>} presets
     * @param {string} groupName
     * @return {!Element}
     */
    _addGroup: function(presets, groupName)
    {
        var groupElement = this._selectElement.createChild("optgroup");
        groupElement.label = groupName;
        for (var i = 0; i < presets.length; ++i) {
            var preset = presets[i];
            var throughputInKbps = preset.value.throughput / (1024 / 8);
            var isThrottling = (throughputInKbps > 0) || preset.value.latency;
            var option;
            var presetTitle = WebInspector.UIString(preset.title);
            if (!isThrottling) {
                option = new Option(presetTitle, presetTitle);
            } else {
                var throughputText = WebInspector.NetworkConditionsSelector.throughputText(preset.value);
                var title = WebInspector.UIString("%s (%s %dms RTT)", presetTitle, throughputText, preset.value.latency);
                option = new Option(title, presetTitle);
                option.title = WebInspector.UIString("Maximum download throughput: %s.\r\nMinimum round-trip time: %dms.", throughputText, preset.value.latency);
            }
            option.settingValue = preset.value;
            groupElement.appendChild(option);
        }
        return groupElement;
    },

    _optionSelected: function()
    {
        if (this._selectElement.selectedIndex === 0) {
            WebInspector.Revealer.reveal(this._customSetting);
            this._settingChanged();
            return;
        }

        this._setting.removeChangeListener(this._settingChanged, this);
        this._setting.set(this._selectElement.options[this._selectElement.selectedIndex].settingValue);
        this._setting.addChangeListener(this._settingChanged, this);
    },

    _settingChanged: function()
    {
        var value = this._setting.get();
        var options = this._selectElement.options;
        for (var index = 1; index < options.length; ++index) {
            var option = options[index];
            if (option.settingValue.throughput === value.throughput && option.settingValue.latency === value.latency)
                this._selectElement.selectedIndex = index;
        }
    }
}


/**
 * @constructor
 * @extends {WebInspector.VBox}
 */
WebInspector.NetworkConditionsSettingsTab = function()
{
    WebInspector.VBox.call(this);
    this.element.classList.add("settings-tab-container");
    this.element.classList.add("network-conditions-settings-tab");
    this.registerRequiredCSS("components/networkConditionsSettingsTab.css");

    var header = this.element.createChild("header");
    header.createChild("h3").createTextChild(WebInspector.UIString("Network Throttling Profiles"));
    this.containerElement = this.element.createChild("div", "help-container-wrapper").createChild("div", "settings-tab help-content help-container");

    var buttonsRow = this.containerElement.createChild("div", "button-row");
    this._addCustomButton = createTextButton(WebInspector.UIString("Add custom profile..."), this._addCustomConditions.bind(this));
    buttonsRow.appendChild(this._addCustomButton);

    this._conditionsList = this.containerElement.createChild("div", "conditions-list");
    this._customListSearator = createElementWithClass("div", "custom-separator");

    this._editConditions = null;
    this._editConditionsListItem = null;
    this._customSetting = WebInspector.moduleSetting("networkConditionsCustomProfiles");
    this._customSetting.addChangeListener(this._conditionsUpdated, this);

    this._createEditConditionsElement();
}

WebInspector.NetworkConditionsSettingsTab.prototype = {
    wasShown: function()
    {
        WebInspector.VBox.prototype.wasShown.call(this);
        this._conditionsUpdated();
        this._stopEditing();
    },

    _conditionsUpdated: function()
    {
        this._conditionsList.removeChildren();

        var conditions = this._customSetting.get();
        for (var i = 0; i < conditions.length; ++i)
            this._conditionsList.appendChild(this._createConditionsListItem(conditions[i], true));

        this._conditionsList.appendChild(this._customListSearator);
        this._updateSeparatorVisibility();

        conditions = WebInspector.NetworkConditionsSelector._networkConditionsPresets;
        for (var i = 0; i < conditions.length; ++i)
            this._conditionsList.appendChild(this._createConditionsListItem(conditions[i], false));
    },

    _updateSeparatorVisibility: function()
    {
        this._customListSearator.classList.toggle("hidden", this._conditionsList.firstChild === this._customListSearator);
    },

    /**
     * @param {!WebInspector.NetworkConditionsProfile} conditions
     * @param {boolean} custom
     * @return {!Element}
     */
    _createConditionsListItem: function(conditions, custom)
    {
        var item = createElementWithClass("div", "conditions-list-item");
        var title = item.createChild("div", "conditions-list-text conditions-list-title");
        var titleText = title.createChild("div", "conditions-list-title-text");
        titleText.textContent = conditions.title;
        titleText.title = conditions.title;
        item.createChild("div", "conditions-list-separator");
        item.createChild("div", "conditions-list-text").textContent = WebInspector.NetworkConditionsSelector.throughputText(conditions.value);
        item.createChild("div", "conditions-list-separator");
        item.createChild("div", "conditions-list-text").textContent = WebInspector.UIString("%dms", conditions.value.latency);

        if (custom) {
            var editButton = title.createChild("div", "conditions-list-edit");
            editButton.title = WebInspector.UIString("Edit");
            editButton.addEventListener("click", onEditClicked.bind(this), false);

            var removeButton = title.createChild("div", "conditions-list-remove");
            removeButton.title = WebInspector.UIString("Remove");
            removeButton.addEventListener("click", onRemoveClicked.bind(this), false);
        }

        /**
         * @param {!Event} event
         * @this {WebInspector.NetworkConditionsSettingsTab}
         */
        function onEditClicked(event)
        {
            event.consume();
            this._startEditing(conditions, item);
        }

        /**
         * @param {!Event} event
         * @this {WebInspector.NetworkConditionsSettingsTab}
         */
        function onRemoveClicked(event)
        {
            var list = this._customSetting.get();
            list.remove(conditions);
            this._customSetting.set(list);
            event.consume();
        }

        return item;
    },

    _addCustomConditions: function()
    {
        var conditions = {title: "", value: {throughput: 0, latency: 0}};
        this._startEditing(conditions, null);
    },

    _createEditConditionsElement: function()
    {
        this._editConditionsElement = createElementWithClass("div", "conditions-edit-container");
        this._editConditionsElement.addEventListener("keydown", onKeyDown.bind(null, isEscKey, this._stopEditing.bind(this)), false);
        this._editConditionsElement.addEventListener("keydown", onKeyDown.bind(null, isEnterKey, this._editConditionsCommitClicked.bind(this)), false);

        var titles = this._editConditionsElement.createChild("div", "conditions-edit-row");
        titles.createChild("div", "conditions-list-text conditions-list-title").textContent = WebInspector.UIString("Profile Name");
        titles.createChild("div", "conditions-list-separator conditions-list-separator-invisible");
        titles.createChild("div", "conditions-list-text").textContent = WebInspector.UIString("Throughput");
        titles.createChild("div", "conditions-list-separator conditions-list-separator-invisible");
        titles.createChild("div", "conditions-list-text").textContent = WebInspector.UIString("Latency");

        var fields = this._editConditionsElement.createChild("div", "conditions-edit-row");
        this._editConditionsTitle = this._createInput("");
        fields.createChild("div", "conditions-list-text conditions-list-title").appendChild(this._editConditionsTitle);
        fields.createChild("div", "conditions-list-separator conditions-list-separator-invisible");

        this._editConditionsThroughput = this._createInput(WebInspector.UIString("kb/s"));
        var cell = fields.createChild("div", "conditions-list-text");
        cell.appendChild(this._editConditionsThroughput);
        cell.createChild("div", "conditions-edit-optional").textContent = WebInspector.UIString("optional");
        fields.createChild("div", "conditions-list-separator conditions-list-separator-invisible");

        this._editConditionsLatency = this._createInput(WebInspector.UIString("ms"));
        cell = fields.createChild("div", "conditions-list-text");
        cell.appendChild(this._editConditionsLatency);
        cell.createChild("div", "conditions-edit-optional").textContent = WebInspector.UIString("optional");

        var buttons = this._editConditionsElement.createChild("div", "conditions-edit-row");
        this._editConditionsCommitButton = createTextButton("", this._editConditionsCommitClicked.bind(this));
        buttons.appendChild(this._editConditionsCommitButton);
        this._editConditionsCancelButton = createTextButton(WebInspector.UIString("Cancel"), this._stopEditing.bind(this));
        this._editConditionsCancelButton.addEventListener("keydown", onKeyDown.bind(null, isEnterKey, this._stopEditing.bind(this)), false);
        buttons.appendChild(this._editConditionsCancelButton);

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
     * @param {string} placeholder
     * @return {!Element}
     */
    _createInput: function(placeholder)
    {
        var input = createElement("input");
        input.type = "text";
        input.placeholder = placeholder;
        input.addEventListener("input", this._validateInputs.bind(this, false), false);
        input.addEventListener("blur", this._validateInputs.bind(this, false), false);
        return input;
    },

    /**
     * @param {boolean} forceValid
     */
    _validateInputs: function(forceValid)
    {
        var trimmedTitle = this._editConditionsTitle.value.trim();
        var titleValid = trimmedTitle.length > 0 && trimmedTitle.length < 50;
        this._editConditionsTitle.classList.toggle("error-input", !titleValid && !forceValid);

        var throughputValid = !WebInspector.NetworkConditionsSelector.throughputValidator(this._editConditionsThroughput.value);
        this._editConditionsThroughput.classList.toggle("error-input", !throughputValid && !forceValid);

        var latencyValid = !WebInspector.NetworkConditionsSelector.latencyValidator(this._editConditionsLatency.value);
        this._editConditionsLatency.classList.toggle("error-input", !latencyValid && !forceValid);

        var allValid = titleValid && throughputValid && latencyValid;
        this._editConditionsCommitButton.disabled = !allValid;
    },

    /**
     * @param {!WebInspector.NetworkConditionsProfile} conditions
     * @param {?Element} listItem
     */
    _startEditing: function(conditions, listItem)
    {
        this._stopEditing();

        this._addCustomButton.disabled = true;
        this._conditionsList.classList.add("conditions-list-editing");
        this._editConditions = conditions;
        this._editConditionsListItem = listItem;
        if (listItem)
            listItem.classList.add("hidden");

        this._editConditionsCommitButton.textContent = listItem ? WebInspector.UIString("Save") : WebInspector.UIString("Add profile");
        this._editConditionsTitle.value = conditions.title;
        if (listItem) {
            this._editConditionsThroughput.value = conditions.value.throughput < 0 ? "" : String(conditions.value.throughput / (1024 / 8));
            this._editConditionsLatency.value = String(conditions.value.latency);
        } else {
            this._editConditionsThroughput.value = "";
            this._editConditionsLatency.value = "";
        }
        this._validateInputs(true);

        if (listItem && listItem.nextElementSibling)
            this._conditionsList.insertBefore(this._editConditionsElement, listItem.nextElementSibling);
        else
            this._conditionsList.insertBefore(this._editConditionsElement, this._customListSearator);
        this._editConditionsCommitButton.scrollIntoView();
        this._editConditionsTitle.focus();
    },

    _editConditionsCommitClicked: function()
    {
        if (this._editConditionsCommitButton.disabled)
            return;

        this._editConditions.title = this._editConditionsTitle.value;
        this._editConditions.value.throughput = this._editConditionsThroughput.value ? parseInt(this._editConditionsThroughput.value, 10) * (1024 / 8) : -1;
        this._editConditions.value.latency = this._editConditionsLatency.value ? parseInt(this._editConditionsLatency.value, 10) : 0;

        this._stopEditing();

        var list = this._customSetting.get();
        if (!this._editConditionsListItem)
            list.push(this._editConditions);
        this._customSetting.set(list);

        this._editConditions = null;
        this._editConditionsListItem = null;
    },

    _stopEditing: function()
    {
        this._conditionsList.classList.remove("conditions-list-editing");
        if (this._editConditionsListItem)
            this._editConditionsListItem.classList.remove("hidden");
        if (this._editConditionsElement.parentElement)
            this._conditionsList.removeChild(this._editConditionsElement);
        this._addCustomButton.disabled = false;
        this._addCustomButton.focus();
    },

    __proto__: WebInspector.VBox.prototype
}
