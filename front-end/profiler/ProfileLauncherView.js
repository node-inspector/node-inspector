/*
 * Copyright (C) 2011 Google Inc. All rights reserved.
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
 * @implements {WebInspector.TargetManager.Observer}
 * @param {!WebInspector.ProfilesPanel} profilesPanel
 */
WebInspector.ProfileLauncherView = function(profilesPanel)
{
    WebInspector.VBox.call(this);

    this._panel = profilesPanel;

    this.element.classList.add("profile-launcher-view");
    this.element.classList.add("panel-enabler-view");

    this._contentElement = this.element.createChild("div", "profile-launcher-view-content");
    this._innerContentElement = this._contentElement.createChild("div");
    var targetSpan = this._contentElement.createChild("span");
    var selectTargetText = targetSpan.createChild("span");
    selectTargetText.textContent = WebInspector.UIString("Target:");
    var targetsSelect = targetSpan.createChild("select", "chrome-select");
    new WebInspector.TargetsComboBoxController(targetsSelect, targetSpan);
    this._controlButton = this._contentElement.createChild("button", "text-button control-profiling");
    this._controlButton.addEventListener("click", this._controlButtonClicked.bind(this), false);
    this._recordButtonEnabled = true;
    this._loadButton = this._contentElement.createChild("button", "text-button load-profile");
    this._loadButton.textContent = WebInspector.UIString("Load");
    this._loadButton.addEventListener("click", this._loadButtonClicked.bind(this), false);
    WebInspector.targetManager.observeTargets(this);
}

WebInspector.ProfileLauncherView.prototype = {
    /**
     * @return {?WebInspector.SearchableView}
     */
    searchableView: function()
    {
        return null;
    },

    /**
     * @param {!WebInspector.Target} target
     */
    targetAdded: function(target)
    {
        this._updateLoadButtonLayout();
    },

    /**
     * @param {!WebInspector.Target} target
     */
    targetRemoved: function(target)
    {
        this._updateLoadButtonLayout();
    },

    _updateLoadButtonLayout: function()
    {
        this._loadButton.classList.toggle("multi-target", WebInspector.targetManager.targets().length > 1);
    },

    /**
     * @param {!WebInspector.ProfileType} profileType
     */
    addProfileType: function(profileType)
    {
        var descriptionElement = this._innerContentElement.createChild("h1");
        descriptionElement.textContent = profileType.description;
        var decorationElement = profileType.decorationElement();
        if (decorationElement)
            this._innerContentElement.appendChild(decorationElement);
        this._isInstantProfile = profileType.isInstantProfile();
        this._isEnabled = profileType.isEnabled();
        this._profileTypeId = profileType.id;
    },

    _controlButtonClicked: function()
    {
        this._panel.toggleRecordButton();
    },

    _loadButtonClicked: function()
    {
        this._panel.showLoadFromFileDialog();
    },

    _updateControls: function()
    {
        if (this._isEnabled && this._recordButtonEnabled)
            this._controlButton.removeAttribute("disabled");
        else
            this._controlButton.setAttribute("disabled", "");
        this._controlButton.title = this._recordButtonEnabled ? "" : WebInspector.anotherProfilerActiveLabel();
        if (this._isInstantProfile) {
            this._controlButton.classList.remove("running");
            this._controlButton.textContent = WebInspector.UIString("Take Snapshot");
        } else if (this._isProfiling) {
            this._controlButton.classList.add("running");
            this._controlButton.textContent = WebInspector.UIString("Stop");
        } else {
            this._controlButton.classList.remove("running");
            this._controlButton.textContent = WebInspector.UIString("Start");
        }
    },

    profileStarted: function()
    {
        this._isProfiling = true;
        this._updateControls();
    },

    profileFinished: function()
    {
        this._isProfiling = false;
        this._updateControls();
    },

    /**
     * @param {!WebInspector.ProfileType} profileType
     * @param {boolean} recordButtonEnabled
     */
    updateProfileType: function(profileType, recordButtonEnabled)
    {
        this._isInstantProfile = profileType.isInstantProfile();
        this._recordButtonEnabled = recordButtonEnabled;
        this._isEnabled = profileType.isEnabled();
        this._profileTypeId = profileType.id;
        this._updateControls();
    },

    __proto__: WebInspector.VBox.prototype
}


/**
 * @constructor
 * @extends {WebInspector.ProfileLauncherView}
 * @param {!WebInspector.ProfilesPanel} profilesPanel
 */
WebInspector.MultiProfileLauncherView = function(profilesPanel)
{
    WebInspector.ProfileLauncherView.call(this, profilesPanel);

    WebInspector.settings.selectedProfileType = WebInspector.settings.createSetting("selectedProfileType", "CPU");

    var header = this._innerContentElement.createChild("h1");
    header.textContent = WebInspector.UIString("Select profiling type");

    this._profileTypeSelectorForm = this._innerContentElement.createChild("form");

    this._innerContentElement.createChild("div", "flexible-space");

    this._typeIdToOptionElement = {};
}

WebInspector.MultiProfileLauncherView.EventTypes = {
    ProfileTypeSelected: "profile-type-selected"
}

WebInspector.MultiProfileLauncherView.prototype = {
    /**
     * @override
     * @param {!WebInspector.ProfileType} profileType
     */
    addProfileType: function(profileType)
    {
        var labelElement = this._profileTypeSelectorForm.createChild("label");
        labelElement.textContent = profileType.name;
        var optionElement = createElement("input");
        labelElement.insertBefore(optionElement, labelElement.firstChild);
        this._typeIdToOptionElement[profileType.id] = optionElement;
        optionElement._profileType = profileType;
        optionElement.type = "radio";
        optionElement.name = "profile-type";
        optionElement.style.hidden = true;
        optionElement.addEventListener("change", this._profileTypeChanged.bind(this, profileType), false);
        var descriptionElement = labelElement.createChild("p");
        descriptionElement.textContent = profileType.description;
        var decorationElement = profileType.decorationElement();
        if (decorationElement)
            labelElement.appendChild(decorationElement);
    },

    restoreSelectedProfileType: function()
    {
        var typeId = WebInspector.settings.selectedProfileType.get();
        if (!(typeId in this._typeIdToOptionElement))
            typeId = Object.keys(this._typeIdToOptionElement)[0];
        this._typeIdToOptionElement[typeId].checked = true;
        var type = this._typeIdToOptionElement[typeId]._profileType;
        this.dispatchEventToListeners(WebInspector.MultiProfileLauncherView.EventTypes.ProfileTypeSelected, type);
    },

    _controlButtonClicked: function()
    {
        this._panel.toggleRecordButton();
    },

    _updateControls: function()
    {
        WebInspector.ProfileLauncherView.prototype._updateControls.call(this);
        var items = this._profileTypeSelectorForm.elements;
        for (var i = 0; i < items.length; ++i) {
            if (items[i].type === "radio")
                items[i].disabled = this._isProfiling;
        }
    },

    /**
     * @param {!WebInspector.ProfileType} profileType
     */
    _profileTypeChanged: function(profileType)
    {
        this.dispatchEventToListeners(WebInspector.MultiProfileLauncherView.EventTypes.ProfileTypeSelected, profileType);
        this._isInstantProfile = profileType.isInstantProfile();
        this._isEnabled = profileType.isEnabled();
        this._profileTypeId = profileType.id;
        this._updateControls();
        WebInspector.settings.selectedProfileType.set(profileType.id);
    },

    profileStarted: function()
    {
        this._isProfiling = true;
        this._updateControls();
    },

    profileFinished: function()
    {
        this._isProfiling = false;
        this._updateControls();
    },

    __proto__: WebInspector.ProfileLauncherView.prototype
}

