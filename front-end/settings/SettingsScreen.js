/*
 * Copyright (C) 2013 Google Inc. All rights reserved.
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
 * @param {function()} onHide
 * @extends {WebInspector.HelpScreen}
 */
WebInspector.SettingsScreen = function(onHide)
{
    WebInspector.HelpScreen.call(this);
    this.element.id = "settings-screen";

    /** @type {function()} */
    this._onHide = onHide;

    this._tabbedPane = new WebInspector.TabbedPane();
    this._tabbedPane.element.classList.add("help-window-main");
    var settingsLabelElement = createElementWithClass("div", "help-window-label");
    settingsLabelElement.createTextChild(WebInspector.UIString("Settings"));
    this._tabbedPane.element.insertBefore(settingsLabelElement, this._tabbedPane.element.firstChild);
    this._tabbedPane.element.appendChild(this._createCloseButton());
    this._tabbedPane.appendTab(WebInspector.SettingsScreen.Tabs.General, WebInspector.UIString("General"), new WebInspector.GenericSettingsTab());
    this._tabbedPane.appendTab(WebInspector.SettingsScreen.Tabs.Workspace, WebInspector.UIString("Workspace"), new WebInspector.WorkspaceSettingsTab());
    if (Runtime.experiments.supportEnabled())
        this._tabbedPane.appendTab(WebInspector.SettingsScreen.Tabs.Experiments, WebInspector.UIString("Experiments"), new WebInspector.ExperimentsSettingsTab());
    this._tabbedPane.appendTab(WebInspector.SettingsScreen.Tabs.Shortcuts, WebInspector.UIString("Shortcuts"), WebInspector.shortcutsScreen.createShortcutsTabView());
    this._tabbedPane.shrinkableTabs = false;
    this._tabbedPane.verticalTabLayout = true;

    this._lastSelectedTabSetting = WebInspector.settings.createSetting("lastSelectedSettingsTab", WebInspector.SettingsScreen.Tabs.General);
    this.selectTab(this._lastSelectedTabSetting.get());
    this._tabbedPane.addEventListener(WebInspector.TabbedPane.EventTypes.TabSelected, this._tabSelected, this);
    this.element.addEventListener("keydown", this._keyDown.bind(this), false);
    this._developerModeCounter = 0;
}

/**
 * @param {number} min
 * @param {number} max
 * @param {string} text
 * @return {?string}
 */
WebInspector.SettingsScreen.integerValidator = function(min, max, text)
{
    var value = Number(text);
    if (isNaN(value))
        return WebInspector.UIString("Invalid number format");
    if (value < min || value > max)
        return WebInspector.UIString("Value is out of range [%d, %d]", min, max);
    return null;
}

WebInspector.SettingsScreen.Tabs = {
    General: "general",
    Overrides: "overrides",
    Workspace: "workspace",
    Experiments: "experiments",
    Shortcuts: "shortcuts"
}

WebInspector.SettingsScreen.prototype = {
    /**
     * @param {string} tabId
     */
    selectTab: function(tabId)
    {
        this._tabbedPane.selectTab(tabId);
    },

    /**
     * @param {!WebInspector.Event} event
     */
    _tabSelected: function(event)
    {
        this._lastSelectedTabSetting.set(this._tabbedPane.selectedTabId);
    },

    /**
     * @override
     */
    wasShown: function()
    {
        this._tabbedPane.show(this.element);
        WebInspector.HelpScreen.prototype.wasShown.call(this);
    },

    /**
     * @override
     * @return {boolean}
     */
    isClosingKey: function(keyCode)
    {
        return [
            WebInspector.KeyboardShortcut.Keys.Enter.code,
            WebInspector.KeyboardShortcut.Keys.Esc.code,
        ].indexOf(keyCode) >= 0;
    },

    /**
     * @override
     */
    willHide: function()
    {
        this._onHide();
        WebInspector.HelpScreen.prototype.willHide.call(this);
    },

    /**
     * @param {!Event} event
     */
    _keyDown: function(event)
    {
        var shiftKeyCode = 16;
        if (event.keyCode === shiftKeyCode && ++this._developerModeCounter > 5)
            this.element.classList.add("settings-developer-mode");
    },

    __proto__: WebInspector.HelpScreen.prototype
}

/**
 * @constructor
 * @extends {WebInspector.VBox}
 * @param {string} name
 * @param {string=} id
 */
WebInspector.SettingsTab = function(name, id)
{
    WebInspector.VBox.call(this);
    this.element.classList.add("settings-tab-container");
    if (id)
        this.element.id = id;
    var header = this.element.createChild("header");
    header.createChild("h3").createTextChild(name);
    this.containerElement = this.element.createChild("div", "help-container-wrapper").createChild("div", "settings-tab help-content help-container");
}

WebInspector.SettingsTab.prototype = {
    /**
     *  @param {string=} name
     *  @return {!Element}
     */
    _appendSection: function(name)
    {
        var block = this.containerElement.createChild("div", "help-block");
        if (name)
            block.createChild("div", "help-section-title").textContent = name;
        return block;
    },

    _createSelectSetting: function(name, options, setting)
    {
        var p = createElement("p");
        p.createChild("label").textContent = name;

        var select = p.createChild("select", "chrome-select");
        var settingValue = setting.get();

        for (var i = 0; i < options.length; ++i) {
            var option = options[i];
            select.add(new Option(option[0], option[1]));
            if (settingValue === option[1])
                select.selectedIndex = i;
        }

        function changeListener(e)
        {
            // Don't use e.target.value to avoid conversion of the value to string.
            setting.set(options[select.selectedIndex][1]);
        }

        select.addEventListener("change", changeListener, false);
        return p;
    },

    __proto__: WebInspector.VBox.prototype
}

/**
 * @constructor
 * @extends {WebInspector.SettingsTab}
 */
WebInspector.GenericSettingsTab = function()
{
    WebInspector.SettingsTab.call(this, WebInspector.UIString("General"), "general-tab-content");

    this._populateSectionsFromExtensions();

    var restoreDefaults = this._appendSection().createChild("input", "text-button");
    restoreDefaults.type = "button";
    restoreDefaults.value = WebInspector.UIString("Restore defaults and reload");
    restoreDefaults.addEventListener("click", restoreAndReload, false);

    function restoreAndReload()
    {
        if (window.localStorage)
            window.localStorage.clear();
        WebInspector.reload();
    }
}

WebInspector.GenericSettingsTab.prototype = {
    _populateSectionsFromExtensions: function()
    {
        /** @const */
        var explicitSectionOrder = ["", "Appearance", "Elements", "Sources", "Profiler", "Console", "Extensions"];

        var allExtensions = self.runtime.extensions("ui-setting");

        /** @type {!StringMultimap.<!Runtime.Extension>} */
        var extensionsBySectionId = new StringMultimap();
        /** @type {!StringMultimap.<!Runtime.Extension>} */
        var childSettingExtensionsByParentName = new StringMultimap();

        allExtensions.forEach(function(extension) {
            var descriptor = extension.descriptor();
            var sectionName = descriptor["section"] || "";
            if (!sectionName && descriptor["parentSettingName"]) {
                childSettingExtensionsByParentName.set(descriptor["parentSettingName"], extension);
                return;
            }
            extensionsBySectionId.set(sectionName, extension);
        });

        var sectionIds = extensionsBySectionId.keysArray();
        var explicitlyOrderedSections = explicitSectionOrder.keySet();
        for (var i = 0; i < explicitSectionOrder.length; ++i) {
            var extensions = extensionsBySectionId.get(explicitSectionOrder[i]);
            if (!extensions.size)
                continue;
            this._addSectionWithExtensionProvidedSettings(explicitSectionOrder[i], extensions.valuesArray(), childSettingExtensionsByParentName);
        }
        for (var i = 0; i < sectionIds.length; ++i) {
            if (explicitlyOrderedSections[sectionIds[i]])
                continue;
            this._addSectionWithExtensionProvidedSettings(sectionIds[i], extensionsBySectionId.get(sectionIds[i]).valuesArray(), childSettingExtensionsByParentName);
        }
    },

    /**
     * @param {string} sectionName
     * @param {!Array.<!Runtime.Extension>} extensions
     * @param {!StringMultimap.<!Runtime.Extension>} childSettingExtensionsByParentName
     */
    _addSectionWithExtensionProvidedSettings: function(sectionName, extensions, childSettingExtensionsByParentName)
    {
        var uiSectionName = sectionName && WebInspector.UIString(sectionName);
        var sectionElement = this._appendSection(uiSectionName);
        extensions.forEach(processSetting.bind(this, null));

        /**
         * @param {?Element} parentFieldset
         * @param {!Runtime.Extension} extension
         * @this {WebInspector.GenericSettingsTab}
         */
        function processSetting(parentFieldset, extension)
        {
            var descriptor = extension.descriptor();
            var experimentName = descriptor["experiment"];
            if (experimentName && !Runtime.experiments.isEnabled(experimentName))
                return;

            if (descriptor["settingType"] === "custom") {
                extension.instancePromise().then(appendCustomSetting).done();
                return;
            }

            var uiTitle = WebInspector.UIString(descriptor["title"]);
            var settingName = descriptor["settingName"];
            var setting = WebInspector.settings[settingName];
            var settingControl = createSettingControl.call(this, uiTitle, setting, descriptor);
            if (settingName) {
                var childSettings = childSettingExtensionsByParentName.get(settingName);
                if (childSettings.size) {
                    var fieldSet = WebInspector.SettingsUI.createSettingFieldset(setting);
                    settingControl.appendChild(fieldSet);
                    childSettings.valuesArray().forEach(function(item) { processSetting.call(this, fieldSet, item); }, this);
                }
            }
            appendAsChild(settingControl);

            /**
             * @param {!Object} object
             */
            function appendCustomSetting(object)
            {
                var uiSettingDelegate = /** @type {!WebInspector.UISettingDelegate} */ (object);
                var element = uiSettingDelegate.settingElement();
                if (element)
                    appendAsChild(element);
            }

            /**
             * @param {!Object} settingControl
             */
            function appendAsChild(settingControl)
            {
                (parentFieldset || sectionElement).appendChild(/** @type {!Element} */ (settingControl));
            }
        }

        /**
         * @param {string} uiTitle
         * @param {!WebInspector.Setting} setting
         * @param {!Object} descriptor
         * @return {!Element}
         * @this {WebInspector.GenericSettingsTab}
         */
        function createSettingControl(uiTitle, setting, descriptor)
        {
            switch (descriptor["settingType"]) {
            case "checkbox":
                return WebInspector.SettingsUI.createSettingCheckbox(uiTitle, setting);
            case "select":
                var descriptorOptions = descriptor["options"]
                var options = new Array(descriptorOptions.length);
                for (var i = 0; i < options.length; ++i) {
                    // The third array item flags that the option name is "raw" (non-i18n-izable).
                    var optionName = descriptorOptions[i][2] ? descriptorOptions[i][0] : WebInspector.UIString(descriptorOptions[i][0]);
                    options[i] = [WebInspector.UIString(descriptorOptions[i][0]), descriptorOptions[i][1]];
                }
                return this._createSelectSetting(uiTitle, options, setting);
            default:
                throw "Invalid setting type: " + descriptor["settingType"];
            }
        }
    },

    __proto__: WebInspector.SettingsTab.prototype
}

/**
 * @constructor
 * @extends {WebInspector.UISettingDelegate}
 */
WebInspector.SettingsScreen.SkipStackFramePatternSettingDelegate = function()
{
    WebInspector.UISettingDelegate.call(this);
}

WebInspector.SettingsScreen.SkipStackFramePatternSettingDelegate.prototype = {
    /**
     * @override
     * @return {!Element}
     */
    settingElement: function()
    {
        var button = createElementWithClass("input", "text-button");
        button.type = "button";
        button.value = WebInspector.manageBlackboxingButtonLabel();
        button.title = WebInspector.UIString("Skip stepping through sources with particular names");
        button.addEventListener("click", this._onManageButtonClick.bind(this), false);
        return button;
    },

    _onManageButtonClick: function()
    {
        WebInspector.FrameworkBlackboxDialog.show(WebInspector.inspectorView.element);
    },

    __proto__: WebInspector.UISettingDelegate.prototype
}

/**
 * @constructor
 * @extends {WebInspector.SettingsTab}
 */
WebInspector.WorkspaceSettingsTab = function()
{
    WebInspector.SettingsTab.call(this, WebInspector.UIString("Workspace"), "workspace-tab-content");
    WebInspector.isolatedFileSystemManager.addEventListener(WebInspector.IsolatedFileSystemManager.Events.FileSystemAdded, this._fileSystemAdded, this);
    WebInspector.isolatedFileSystemManager.addEventListener(WebInspector.IsolatedFileSystemManager.Events.FileSystemRemoved, this._fileSystemRemoved, this);

    this._commonSection = this._appendSection(WebInspector.UIString("Common"));
    var folderExcludePatternInput = WebInspector.SettingsUI.createSettingInputField(WebInspector.UIString("Folder exclude pattern"), WebInspector.settings.workspaceFolderExcludePattern, false, 0, "270px", WebInspector.SettingsUI.regexValidator);
    this._commonSection.appendChild(folderExcludePatternInput);

    this._fileSystemsSection = this._appendSection(WebInspector.UIString("Folders"));
    this._fileSystemsListContainer = this._fileSystemsSection.createChild("p", "settings-list-container");

    this._addFileSystemRowElement = this._fileSystemsSection.createChild("div");
    var addFileSystemButton = this._addFileSystemRowElement.createChild("input", "text-button");
    addFileSystemButton.type = "button";
    addFileSystemButton.value = WebInspector.UIString("Add folder\u2026");
    addFileSystemButton.addEventListener("click", this._addFileSystemClicked.bind(this), false);

    this._editFileSystemButton = this._addFileSystemRowElement.createChild("input", "text-button");
    this._editFileSystemButton.type = "button";
    this._editFileSystemButton.value = WebInspector.UIString("Folder options\u2026");
    this._editFileSystemButton.addEventListener("click", this._editFileSystemClicked.bind(this), false);
    this._updateEditFileSystemButtonState();

    this._reset();
}

WebInspector.WorkspaceSettingsTab.prototype = {
    wasShown: function()
    {
        WebInspector.SettingsTab.prototype.wasShown.call(this);
        this._reset();
    },

    _reset: function()
    {
        this._resetFileSystems();
    },

    _resetFileSystems: function()
    {
        this._fileSystemsListContainer.removeChildren();
        var fileSystemPaths = WebInspector.isolatedFileSystemManager.mapping().fileSystemPaths();
        delete this._fileSystemsList;

        if (!fileSystemPaths.length) {
            var noFileSystemsMessageElement = this._fileSystemsListContainer.createChild("div", "no-file-systems-message");
            noFileSystemsMessageElement.textContent = WebInspector.UIString("You have no file systems added.");
            return;
        }

        this._fileSystemsList = new WebInspector.SettingsList([{ id: "path" }], this._renderFileSystem.bind(this));
        this._fileSystemsList.element.classList.add("file-systems-list");
        this._fileSystemsList.addEventListener(WebInspector.SettingsList.Events.Selected, this._fileSystemSelected.bind(this));
        this._fileSystemsList.addEventListener(WebInspector.SettingsList.Events.Removed, this._fileSystemRemovedfromList.bind(this));
        this._fileSystemsList.addEventListener(WebInspector.SettingsList.Events.DoubleClicked, this._fileSystemDoubleClicked.bind(this));
        this._fileSystemsListContainer.appendChild(this._fileSystemsList.element);
        for (var i = 0; i < fileSystemPaths.length; ++i)
            this._fileSystemsList.addItem(fileSystemPaths[i]);
        this._updateEditFileSystemButtonState();
    },

    _updateEditFileSystemButtonState: function()
    {
        this._editFileSystemButton.disabled = !this._selectedFileSystemPath();
    },

    /**
     * @param {!WebInspector.Event} event
     */
    _fileSystemSelected: function(event)
    {
        this._updateEditFileSystemButtonState();
    },

    /**
     * @param {!WebInspector.Event} event
     */
    _fileSystemDoubleClicked: function(event)
    {
        var id = /** @type{?string} */ (event.data);
        this._editFileSystem(id);
    },

    _editFileSystemClicked: function()
    {
        this._editFileSystem(this._selectedFileSystemPath());
    },

    /**
     * @param {?string} id
     */
    _editFileSystem: function(id)
    {
        WebInspector.EditFileSystemDialog.show(WebInspector.inspectorView.element, id);
    },

    /**
     * @param {!Element} columnElement
     * @param {{id: string, placeholder: (string|undefined), options: (!Array.<string>|undefined)}} column
     * @param {?string} id
     */
    _renderFileSystem: function(columnElement, column, id)
    {
        if (!id)
            return "";
        var fileSystemPath = id;
        var textElement = columnElement.createChild("span", "list-column-text");
        var pathElement = textElement.createChild("span", "file-system-path");
        pathElement.title = fileSystemPath;

        const maxTotalPathLength = 55;
        const maxFolderNameLength = 30;

        var lastIndexOfSlash = fileSystemPath.lastIndexOf(WebInspector.isWin() ? "\\" : "/");
        var folderName = fileSystemPath.substr(lastIndexOfSlash + 1);
        var folderPath = fileSystemPath.substr(0, lastIndexOfSlash + 1);
        folderPath = folderPath.trimMiddle(maxTotalPathLength - Math.min(maxFolderNameLength, folderName.length));
        folderName = folderName.trimMiddle(maxFolderNameLength);

        var folderPathElement = pathElement.createChild("span");
        folderPathElement.textContent = folderPath;

        var nameElement = pathElement.createChild("span", "file-system-path-name");
        nameElement.textContent = folderName;
    },

    /**
     * @param {!WebInspector.Event} event
     */
    _fileSystemRemovedfromList: function(event)
    {
        var id = /** @type{?string} */ (event.data);
        if (!id)
            return;
        WebInspector.isolatedFileSystemManager.removeFileSystem(id);
    },

    _addFileSystemClicked: function()
    {
        WebInspector.isolatedFileSystemManager.addFileSystem();
    },

    _fileSystemAdded: function(event)
    {
        var fileSystem = /** @type {!WebInspector.IsolatedFileSystem} */ (event.data);
        if (!this._fileSystemsList)
            this._reset();
        else
            this._fileSystemsList.addItem(fileSystem.path());
    },

    _fileSystemRemoved: function(event)
    {
        var fileSystem = /** @type {!WebInspector.IsolatedFileSystem} */ (event.data);
        var selectedFileSystemPath = this._selectedFileSystemPath();
        if (this._fileSystemsList.itemForId(fileSystem.path()))
            this._fileSystemsList.removeItem(fileSystem.path());
        if (!this._fileSystemsList.itemIds().length)
            this._reset();
        this._updateEditFileSystemButtonState();
    },

    _selectedFileSystemPath: function()
    {
        return this._fileSystemsList ? this._fileSystemsList.selectedId() : null;
    },

    __proto__: WebInspector.SettingsTab.prototype
}


/**
 * @constructor
 * @extends {WebInspector.SettingsTab}
 */
WebInspector.ExperimentsSettingsTab = function()
{
    WebInspector.SettingsTab.call(this, WebInspector.UIString("Experiments"), "experiments-tab-content");

    var experiments = Runtime.experiments.allConfigurableExperiments();
    if (experiments.length) {
        var experimentsSection = this._appendSection();
        experimentsSection.appendChild(this._createExperimentsWarningSubsection());
        for (var i = 0; i < experiments.length; ++i)
            experimentsSection.appendChild(this._createExperimentCheckbox(experiments[i]));
    }
}

WebInspector.ExperimentsSettingsTab.prototype = {
    /**
     * @return {!Element} element
     */
    _createExperimentsWarningSubsection: function()
    {
        var subsection = createElement("div");
        var warning = subsection.createChild("span", "settings-experiments-warning-subsection-warning");
        warning.textContent = WebInspector.UIString("WARNING:");
        subsection.createTextChild(" ");
        var message = subsection.createChild("span", "settings-experiments-warning-subsection-message");
        message.textContent = WebInspector.UIString("These experiments could be dangerous and may require restart.");
        return subsection;
    },

    _createExperimentCheckbox: function(experiment)
    {
        var input = createElement("input");
        input.type = "checkbox";
        input.name = experiment.name;
        input.checked = experiment.isEnabled();
        function listener()
        {
            experiment.setEnabled(input.checked);
        }
        input.addEventListener("click", listener, false);

        var p = createElement("p");
        p.className = experiment.hidden && !experiment.isEnabled() ? "settings-experiment-hidden" : "";
        var label = p.createChild("label");
        label.appendChild(input);
        label.createTextChild(WebInspector.UIString(experiment.title));
        p.appendChild(label);
        return p;
    },

    __proto__: WebInspector.SettingsTab.prototype
}

/**
 * @constructor
 */
WebInspector.SettingsController = function()
{
    /** @type {?WebInspector.SettingsScreen} */
    this._settingsScreen;
    this._resizeBound = this._resize.bind(this);
}

WebInspector.SettingsController.prototype = {
    _onHideSettingsScreen: function()
    {
        var window = this._settingsScreen.element.ownerDocument.defaultView;
        window.removeEventListener("resize", this._resizeBound, false);
        delete this._settingsScreenVisible;
    },

    /**
     * @param {string=} tabId
     */
    showSettingsScreen: function(tabId)
    {
        if (!this._settingsScreen)
            this._settingsScreen = new WebInspector.SettingsScreen(this._onHideSettingsScreen.bind(this));

        if (tabId)
            this._settingsScreen.selectTab(tabId);

        this._settingsScreen.showModal();
        this._settingsScreenVisible = true;
        var window = this._settingsScreen.element.ownerDocument.defaultView;
        window.addEventListener("resize", this._resizeBound, false);
    },

    _resize: function()
    {
        if (this._settingsScreen && this._settingsScreen.isShowing())
            this._settingsScreen.doResize();
    }
}

/**
 * @constructor
 * @implements {WebInspector.ActionDelegate}
 */
WebInspector.SettingsController.SettingsScreenActionDelegate = function() { }

WebInspector.SettingsController.SettingsScreenActionDelegate.prototype = {
    /**
     * @return {boolean}
     */
    handleAction: function()
    {
        WebInspector._settingsController.showSettingsScreen(WebInspector.SettingsScreen.Tabs.General);
        return true;
    }
}

/**
 * @constructor
 * @extends {WebInspector.Object}
 * @param {!Array.<{id: string, placeholder: (string|undefined), options: (!Array.<string>|undefined)}>} columns
 * @param {function(!Element, {id: string, placeholder: (string|undefined), options: (!Array.<string>|undefined)}, ?string)} itemRenderer
 */
WebInspector.SettingsList = function(columns, itemRenderer)
{
    this.element = createElementWithClass("div", "settings-list");
    this.element.tabIndex = -1;
    this._itemRenderer = itemRenderer;
    /** @type {!Map.<string, !Element>} */
    this._listItems = new Map();
    /** @type {!Array.<?string>} */
    this._ids = [];
    this._columns = columns;
}

WebInspector.SettingsList.Events = {
    Selected:  "Selected",
    Removed:  "Removed",
    DoubleClicked:  "DoubleClicked",
}

WebInspector.SettingsList.prototype = {
    /**
     * @param {?string} itemId
     * @param {?string=} beforeId
     * @return {!Element}
     */
    addItem: function(itemId, beforeId)
    {
        var listItem = createElementWithClass("div", "settings-list-item");
        listItem._id = itemId;
        if (typeof beforeId !== "undefined")
            this.element.insertBefore(listItem, this.itemForId(beforeId));
        else
            this.element.appendChild(listItem);

        var listItemContents = listItem.createChild("div", "settings-list-item-contents");
        var listItemColumnsElement = listItemContents.createChild("div", "settings-list-item-columns");

        listItem.columnElements = {};
        for (var i = 0; i < this._columns.length; ++i) {
            var column = this._columns[i];
            var columnElement = listItemColumnsElement.createChild("div", "list-column settings-list-column-" + column.id);
            listItem.columnElements[column.id] = columnElement;
            this._itemRenderer(columnElement, column, itemId);
        }
        var removeItemButton = this._createRemoveButton(removeItemClicked.bind(this));
        listItemContents.addEventListener("click", this.selectItem.bind(this, itemId), false);
        listItemContents.addEventListener("dblclick", this._onDoubleClick.bind(this, itemId), false);
        listItemContents.appendChild(removeItemButton);

        this._listItems.set(itemId || "", listItem);
        if (typeof beforeId !== "undefined")
            this._ids.splice(this._ids.indexOf(beforeId), 0, itemId);
        else
            this._ids.push(itemId);

        /**
         * @param {!Event} event
         * @this {WebInspector.SettingsList}
         */
        function removeItemClicked(event)
        {
            removeItemButton.disabled = true;
            this.removeItem(itemId);
            this.dispatchEventToListeners(WebInspector.SettingsList.Events.Removed, itemId);
            event.consume();
        }

        return listItem;
    },

    /**
     * @param {?string} id
     */
    removeItem: function(id)
    {
        var listItem = this._listItems.remove(id || "");
        if (listItem)
            listItem.remove();
        this._ids.remove(id);
        if (id === this._selectedId) {
            delete this._selectedId;
            if (this._ids.length)
                this.selectItem(this._ids[0]);
        }
    },

    /**
     * @return {!Array.<?string>}
     */
    itemIds: function()
    {
        return this._ids.slice();
    },

    /**
     * @return {!Array.<string>}
     */
    columns: function()
    {
        return this._columns.select("id");
    },

    /**
     * @return {?string}
     */
    selectedId: function()
    {
        return this._selectedId;
    },

    /**
     * @return {?Element}
     */
    selectedItem: function()
    {
        return this._selectedId ? this.itemForId(this._selectedId) : null;
    },

    /**
     * @param {?string} itemId
     * @return {?Element}
     */
    itemForId: function(itemId)
    {
        return this._listItems.get(itemId || "") || null;
    },

    /**
     * @param {?string} id
     * @param {!Event=} event
     */
    _onDoubleClick: function(id, event)
    {
        this.dispatchEventToListeners(WebInspector.SettingsList.Events.DoubleClicked, id);
    },

    /**
     * @param {?string} id
     * @param {!Event=} event
     */
    selectItem: function(id, event)
    {
        if (typeof this._selectedId !== "undefined")
            this.itemForId(this._selectedId).classList.remove("selected");

        this._selectedId = id;
        if (typeof this._selectedId !== "undefined")
            this.itemForId(this._selectedId).classList.add("selected");

        this.dispatchEventToListeners(WebInspector.SettingsList.Events.Selected, id);
        if (event)
            event.consume();
    },

    /**
     * @param {function(!Event)} handler
     * @return {!Element}
     */
    _createRemoveButton: function(handler)
    {
        var removeButton = createElementWithClass("div", "remove-item-button");
        removeButton.addEventListener("click", handler, false);
        return removeButton;
    },

    __proto__: WebInspector.Object.prototype
}

/**
 * @constructor
 * @extends {WebInspector.SettingsList}
 * @param {!Array.<{id: string, placeholder: (string|undefined), options: (!Array.<string>|undefined)}>} columns
 * @param {function(string, string):string} valuesProvider
 * @param {function(?string, !Object):!Array.<string>} validateHandler
 * @param {function(?string, !Object)} editHandler
 */
WebInspector.EditableSettingsList = function(columns, valuesProvider, validateHandler, editHandler)
{
    WebInspector.SettingsList.call(this, columns, this._renderColumn.bind(this));
    this._valuesProvider = valuesProvider;
    this._validateHandler = validateHandler;
    this._editHandler = editHandler;
    /** @type {!Map.<string, (!HTMLInputElement|!HTMLSelectElement)>} */
    this._addInputElements = new Map();
    /** @type {!Map.<string, !Map.<string, (!HTMLInputElement|!HTMLSelectElement)>>} */
    this._editInputElements = new Map();
    /** @type {!Map.<string, !Map.<string, !HTMLSpanElement>>} */
    this._textElements = new Map();

    this._addMappingItem = this.addItem(null);
    this._addMappingItem.classList.add("item-editing", "add-list-item");
}

WebInspector.EditableSettingsList.prototype = {
    /**
     * @param {?string} itemId
     * @param {?string=} beforeId
     * @return {!Element}
     */
    addItem: function(itemId, beforeId)
    {
        var listItem = WebInspector.SettingsList.prototype.addItem.call(this, itemId, beforeId);
        listItem.classList.add("editable");
        return listItem;
    },

    /**
     * @param {?string} itemId
     */
    refreshItem: function(itemId)
    {
        if (!itemId)
            return;
        var listItem = this.itemForId(itemId);
        if (!listItem)
            return;
        for (var i = 0; i < this._columns.length; ++i) {
            var column = this._columns[i];
            var columnId = column.id;

            var value = this._valuesProvider(itemId, columnId);
            this._setTextElementContent(itemId, columnId, value);

            var editElement = this._editInputElements.get(itemId).get(columnId);
            this._setEditElementValue(editElement, value || "");
        }
    },

    /**
     * @param {?string} itemId
     * @param {string} columnId
     */
    _textElementContent: function(itemId, columnId)
    {
        if (!itemId)
            return "";
        return this._textElements.get(itemId).get(columnId).textContent.replace(/\u200B/g, "");
    },

    /**
     * @param {string} itemId
     * @param {string} columnId
     * @param {string} text
     */
    _setTextElementContent: function(itemId, columnId, text)
    {
        var textElement = this._textElements.get(itemId).get(columnId);
        textElement.textContent = text.replace(/.{4}/g, "$&\u200B");
        textElement.title = text;
    },

    /**
     * @param {!Element} columnElement
     * @param {{id: string, placeholder: (string|undefined), options: (!Array.<string>|undefined)}} column
     * @param {?string} itemId
     */
    _renderColumn: function(columnElement, column, itemId)
    {
        var columnId = column.id;
        if (itemId === null) {
            this._createEditElement(columnElement, column, itemId);
            return;
        }
        var validItemId = itemId;

        if (!this._editInputElements.has(itemId))
            this._editInputElements.set(itemId, new Map());
        if (!this._textElements.has(itemId))
            this._textElements.set(itemId, new Map());

        var value = this._valuesProvider(itemId, columnId);

        var textElement = /** @type {!HTMLSpanElement} */ (columnElement.createChild("span", "list-column-text"));
        columnElement.addEventListener("click", rowClicked.bind(this), false);
        this._textElements.get(itemId).set(columnId, textElement);
        this._setTextElementContent(itemId, columnId, value);

        this._createEditElement(columnElement, column, itemId, value);

        /**
         * @param {!Event} event
         * @this {WebInspector.EditableSettingsList}
         */
        function rowClicked(event)
        {
            if (itemId === this._editingId)
                return;
            console.assert(!this._editingId);
            this._editingId = validItemId;
            var listItem = this.itemForId(validItemId);
            listItem.classList.add("item-editing");
            var editElement = event.target.editElement || this._editInputElements.get(validItemId).get(this.columns()[0]);
            editElement.focus();
            if (editElement.select)
                editElement.select();
        }
    },

    /**
     * @param {!Element} columnElement
     * @param {{id: string, placeholder: (string|undefined), options: (!Array.<string>|undefined)}} column
     * @param {?string} itemId
     * @param {string=} value
     * @return {!Element}
     */
    _createEditElement: function(columnElement, column, itemId, value)
    {
        var options = column.options;
        if (options) {
            var editElement = /** @type {!HTMLSelectElement} */ (columnElement.createChild("select", "chrome-select list-column-editor"));
            for (var i = 0; i < options.length; ++i) {
                var option = editElement.createChild("option");
                option.value = options[i];
                option.textContent = options[i];
            }
            editElement.addEventListener("blur", this._editMappingBlur.bind(this, itemId), false);
            editElement.addEventListener("change", this._editMappingBlur.bind(this, itemId), false);
        } else {
            var editElement = /** @type {!HTMLInputElement} */ (columnElement.createChild("input", "list-column-editor"));
            editElement.addEventListener("blur", this._editMappingBlur.bind(this, itemId), false);
            editElement.addEventListener("input", this._validateEdit.bind(this, itemId), false);
            if (itemId === null)
                editElement.placeholder = column.placeholder || "";
        }

        if (itemId === null)
            this._addInputElements.set(column.id, editElement);
        else
            this._editInputElements.get(itemId).set(column.id, editElement);

        this._setEditElementValue(editElement, value || "");
        columnElement.editElement = editElement;
        return editElement;
    },

    /**
     * @param {!HTMLInputElement|!HTMLSelectElement|undefined} editElement
     * @param {string} value
     */
    _setEditElementValue: function(editElement, value)
    {
        if (!editElement)
            return;
        if (editElement instanceof HTMLSelectElement) {
            var options = editElement.options;
            for (var i = 0; i < options.length; ++i)
                options[i].selected = (options[i].value === value);
        } else {
            editElement.value = value;
        }
    },

    /**
     * @param {?string} itemId
     * @return {!Object}
     */
    _data: function(itemId)
    {
        var inputElements = this._inputElements(itemId);
        var data = { __proto__: null };
        var columns = this.columns();
        for (var i = 0; i < columns.length; ++i)
            data[columns[i]] = inputElements.get(columns[i]).value;
        return data;
    },

    /**
     * @param {?string} itemId
     * @return {?Map.<string, (!HTMLInputElement|!HTMLSelectElement)>}
     */
    _inputElements: function(itemId)
    {
        if (!itemId)
            return this._addInputElements;
        return this._editInputElements.get(itemId) || null;
    },

    /**
     * @param {?string} itemId
     * @return {boolean}
     */
    _validateEdit: function(itemId)
    {
        var errorColumns = this._validateHandler(itemId, this._data(itemId));
        var hasChanges = this._hasChanges(itemId);
        var columns = this.columns();
        for (var i = 0; i < columns.length; ++i) {
            var columnId = columns[i];
            var inputElement = this._inputElements(itemId).get(columnId);
            if (hasChanges && errorColumns.indexOf(columnId) !== -1)
                inputElement.classList.add("editable-item-error");
            else
                inputElement.classList.remove("editable-item-error");
        }
        return !errorColumns.length;
    },

    /**
     * @param {?string} itemId
     * @return {boolean}
     */
    _hasChanges: function(itemId)
    {
        var columns = this.columns();
        for (var i = 0; i < columns.length; ++i) {
            var columnId = columns[i];
            var oldValue = this._textElementContent(itemId, columnId);
            var newValue = this._inputElements(itemId).get(columnId).value;
            if (oldValue !== newValue)
                return true;
        }
        return false;
    },

    /**
     * @param {?string} itemId
     * @param {!Event} event
     */
    _editMappingBlur: function(itemId, event)
    {
        if (itemId === null) {
            this._onAddMappingInputBlur(event);
            return;
        }

        var inputElements = this._editInputElements.get(itemId).valuesArray();
        if (inputElements.indexOf(event.relatedTarget) !== -1)
            return;

        var listItem = this.itemForId(itemId);
        listItem.classList.remove("item-editing");
        delete this._editingId;

        if (!this._hasChanges(itemId))
            return;

        if (!this._validateEdit(itemId)) {
            var columns = this.columns();
            for (var i = 0; i < columns.length; ++i) {
                var columnId = columns[i];
                var editElement = this._editInputElements.get(itemId).get(columnId);
                this._setEditElementValue(editElement, this._textElementContent(itemId, columnId));
                editElement.classList.remove("editable-item-error");
            }
            return;
        }
        this._editHandler(itemId, this._data(itemId));
    },

    /**
     * @param {!Event} event
     */
    _onAddMappingInputBlur: function(event)
    {
        var inputElements = this._addInputElements.valuesArray();
        if (inputElements.indexOf(event.relatedTarget) !== -1)
            return;

        if (!this._hasChanges(null))
            return;

        if (!this._validateEdit(null))
            return;

        this._editHandler(null, this._data(null));
        var columns = this.columns();
        for (var i = 0; i < columns.length; ++i) {
            var columnId = columns[i];
            var editElement = this._addInputElements.get(columnId);
            this._setEditElementValue(editElement, "");
        }
    },

    __proto__: WebInspector.SettingsList.prototype
}

WebInspector._settingsController = new WebInspector.SettingsController();
