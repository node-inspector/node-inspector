// Copyright (c) 2015 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

/**
 * @constructor
 * @extends {WebInspector.VBox}
 * @implements {WebInspector.TargetManager.Observer}
 */
WebInspector.ServiceWorkersView = function()
{
    WebInspector.VBox.call(this, true);
    this.registerRequiredCSS("resources/serviceWorkersView.css");
    this.contentElement.classList.add("service-workers-view");

    /** @type {!Set.<string>} */
    this._securityOriginHosts = new Set();
    /** @type {!Map.<string, !WebInspector.ServiceWorkerOriginElement>} */
    this._originHostToOriginElementMap = new Map();
    /** @type {!Map.<string, !WebInspector.ServiceWorkerOriginElement>} */
    this._registrationIdToOriginElementMap = new Map();

    var settingsDiv = createElementWithClass("div", "service-workers-settings");
    var debugOnStartCheckboxLabel = createCheckboxLabel(WebInspector.UIString("Open DevTools window and pause JavaScript execution on Service Worker startup for debugging."));
    this._debugOnStartCheckbox = debugOnStartCheckboxLabel.checkboxElement;
    this._debugOnStartCheckbox.addEventListener("change", this._debugOnStartCheckboxChanged.bind(this), false)
    this._debugOnStartCheckbox.disabled = true
    settingsDiv.appendChild(debugOnStartCheckboxLabel);
    this.contentElement.appendChild(settingsDiv);

    this._root = this.contentElement.createChild("ol");
    this._root.classList.add("service-workers-root");

    WebInspector.targetManager.observeTargets(this);
}

WebInspector.ServiceWorkersView.prototype = {
    /**
     * @override
     * @param {!WebInspector.Target} target
     */
    targetAdded: function(target)
    {
        if (this._target)
            return;
        this._target = target;
        this._manager = this._target.serviceWorkerManager;

        this._debugOnStartCheckbox.disabled = false;
        this._debugOnStartCheckbox.checked = this._manager.debugOnStart();

        for (var registration of this._manager.registrations().values())
            this._updateRegistration(registration);

        this._manager.addEventListener(WebInspector.ServiceWorkerManager.Events.RegistrationUpdated, this._registrationUpdated, this);
        this._manager.addEventListener(WebInspector.ServiceWorkerManager.Events.RegistrationDeleted, this._registrationDeleted, this);
        this._manager.addEventListener(WebInspector.ServiceWorkerManager.Events.DebugOnStartUpdated, this._debugOnStartUpdated, this);
        this._target.resourceTreeModel.addEventListener(WebInspector.ResourceTreeModel.EventTypes.SecurityOriginAdded, this._securityOriginAdded, this);
        this._target.resourceTreeModel.addEventListener(WebInspector.ResourceTreeModel.EventTypes.SecurityOriginRemoved, this._securityOriginRemoved, this);
        var securityOrigins = this._target.resourceTreeModel.securityOrigins();
        for (var i = 0; i < securityOrigins.length; ++i)
            this._addOrigin(securityOrigins[i]);
    },

    /**
     * @override
     * @param {!WebInspector.Target} target
     */
    targetRemoved: function(target)
    {
        if (target !== this._target)
            return;
        delete this._target;
    },

    /**
     * @param {!WebInspector.Event} event
     */
    _registrationUpdated: function(event)
    {
        var registration = /** @type {!WebInspector.ServiceWorkerRegistration} */ (event.data);
        this._updateRegistration(registration);
    },

    /**
     * @param {!WebInspector.ServiceWorkerRegistration} registration
     */
    _updateRegistration: function(registration)
    {
        var parsedURL = registration.scopeURL.asParsedURL();
        if (!parsedURL)
          return;
        var originHost = parsedURL.host;
        var originElement = this._originHostToOriginElementMap.get(originHost);
        if (!originElement) {
            originElement = new WebInspector.ServiceWorkerOriginElement(this._manager, originHost);
            if (this._securityOriginHosts.has(originHost))
                this._appendOriginNode(originElement);
            this._originHostToOriginElementMap.set(originHost, originElement);
        }
        this._registrationIdToOriginElementMap.set(registration.id, originElement);
        originElement._updateRegistration(registration);
    },

    /**
     * @param {!WebInspector.Event} event
     */
    _registrationDeleted: function(event)
    {
        var registration = /** @type {!WebInspector.ServiceWorkerRegistration} */ (event.data);
        var registrationId = registration.id;
        var originElement = this._registrationIdToOriginElementMap.get(registrationId);
        if (!originElement)
            return;
        this._registrationIdToOriginElementMap.delete(registrationId);
        originElement._deleteRegistration(registrationId);
        if (originElement._hasRegistration())
            return;
        if (this._securityOriginHosts.has(originElement._originHost))
            this._removeOriginNode(originElement);
        this._originHostToOriginElementMap.delete(originElement._originHost);
    },

    /**
     * @param {!WebInspector.Event} event
     */
    _debugOnStartUpdated: function(event)
    {
        var debugOnStart = /** @type {boolean} */ (event.data);
        this._debugOnStartCheckbox.checked = debugOnStart;
    },

    /**
     * @param {!WebInspector.Event} event
     */
    _securityOriginAdded: function(event)
    {
        this._addOrigin(/** @type {string} */ (event.data));
    },

    /**
     * @param {string} securityOrigin
     */
    _addOrigin: function(securityOrigin)
    {
        var parsedURL = securityOrigin.asParsedURL();
        if (!parsedURL)
          return;
        var originHost = parsedURL.host;
        if (this._securityOriginHosts.has(originHost))
            return;
        this._securityOriginHosts.add(originHost);
        var originElement = this._originHostToOriginElementMap.get(originHost);
        if (!originElement)
          return;
        this._appendOriginNode(originElement);
    },

    /**
     * @param {!WebInspector.Event} event
     */
    _securityOriginRemoved: function(event)
    {
        var securityOrigin = /** @type {string} */ (event.data);
        var parsedURL = securityOrigin.asParsedURL();
        if (!parsedURL)
          return;
        var originHost = parsedURL.host;
        if (!this._securityOriginHosts.has(originHost))
            return;
        this._securityOriginHosts.delete(originHost);
        var originElement = this._originHostToOriginElementMap.get(originHost);
        if (!originElement)
          return;
        this._removeOriginNode(originElement);
    },

    /**
     * @param {!WebInspector.ServiceWorkerOriginElement} originElement
     */
    _appendOriginNode: function(originElement)
    {
        this._root.appendChild(originElement._element);
    },

    /**
     * @param {!WebInspector.ServiceWorkerOriginElement} originElement
     */
    _removeOriginNode: function(originElement)
    {
        this._root.removeChild(originElement._element);
    },

    _debugOnStartCheckboxChanged: function()
    {
        if (!this._manager)
            return;
        this._manager.setDebugOnStart(this._debugOnStartCheckbox.checked);
        this._debugOnStartCheckbox.checked = this._manager.debugOnStart();
    },

    __proto__: WebInspector.VBox.prototype
}

/**
 * @constructor
 * @param {!WebInspector.ServiceWorkerManager} manager
 * @param {string} originHost
 */
WebInspector.ServiceWorkerOriginElement = function(manager, originHost)
{
    this._manager = manager;
    /** @type {!Map.<string, !WebInspector.SWRegistrationElement>} */
    this._registrationElements = new Map();
    this._originHost = originHost;
    this._element = createElementWithClass("div", "service-workers-origin");
    this._listItemNode = this._element.createChild("li", "service-workers-origin-title");
    this._listItemNode.createChild("div").createTextChild(originHost);
    this._childrenListNode = this._element.createChild("ol");
}

WebInspector.ServiceWorkerOriginElement.prototype = {
    /**
     * @return {boolean}
     */
    _hasRegistration: function()
    {
        return this._registrationElements.size != 0;
    },

    /**
     * @param {!WebInspector.ServiceWorkerRegistration} registration
     */
    _updateRegistration: function(registration)
    {
        var swRegistrationElement = this._registrationElements.get(registration.id);
        if (swRegistrationElement) {
            swRegistrationElement._updateRegistration(registration);
            return;
        }
        swRegistrationElement = new WebInspector.SWRegistrationElement(this._manager, this, registration);
        this._registrationElements.set(registration.id, swRegistrationElement);
        this._childrenListNode.appendChild(swRegistrationElement._element);
    },

    /**
     * @param {string} registrationId
     */
    _deleteRegistration: function(registrationId)
    {
        var swRegistrationElement = this._registrationElements.get(registrationId);
        if (!swRegistrationElement)
            return;
        this._registrationElements.delete(registrationId);
        this._childrenListNode.removeChild(swRegistrationElement._element);
    },

    /**
     * @return {boolean}
     */
    _visible: function()
    {
        return !!this._element.parentElement;
    },
}

/**
 * @constructor
 * @param {!WebInspector.ServiceWorkerManager} manager
 * @param {!WebInspector.ServiceWorkerOriginElement} originElement
 * @param {!WebInspector.ServiceWorkerRegistration} registration
 */
WebInspector.SWRegistrationElement = function(manager, originElement, registration)
{
    this._manager = manager;
    this._originElement = originElement;
    this._registration = registration;
    this._element = createElementWithClass("div", "service-workers-registration");
    var headerNode = this._element.createChild("div", "service-workers-registration-header");
    this._titleNode = headerNode.createChild("div", "service-workers-registration-title");
    var buttonsNode = headerNode.createChild("div", "service-workers-registration-buttons");
    this._updateButton = buttonsNode.createChild("button", "service-workers-button service-workers-update-button");
    this._updateButton.addEventListener("click", this._updateButtonClicked.bind(this), false);
    this._updateButton.title = WebInspector.UIString("Update");
    this._updateButton.disabled = true
    this._pushButton = buttonsNode.createChild("button", "service-workers-button service-workers-push-button");
    this._pushButton.addEventListener("click", this._pushButtonClicked.bind(this), false);
    this._pushButton.title = WebInspector.UIString("Emulate push event");
    this._pushButton.disabled = true
    this._deleteButton = buttonsNode.createChild("button", "service-workers-button service-workers-delete-button");
    this._deleteButton.addEventListener("click", this._deleteButtonClicked.bind(this), false);
    this._deleteButton.title = WebInspector.UIString("Delete");
    this._childrenListNode = this._element.createChild("div", "service-workers-registration-content");

    this._skipWaitingCheckboxLabel = createCheckboxLabel(WebInspector.UIString("Skip waiting"));
    this._skipWaitingCheckboxLabel.title = WebInspector.UIString("Simulate skipWaiting()");
    this._skipWaitingCheckboxLabel.classList.add("service-workers-skip-waiting-checkbox-label");
    this._skipWaitingCheckbox = this._skipWaitingCheckboxLabel.checkboxElement;
    this._skipWaitingCheckbox.classList.add("service-workers-skip-waiting-checkbox");
    this._skipWaitingCheckbox.addEventListener("change", this._skipWaitingCheckboxChanged.bind(this), false);

    /**
     * @type {!Object.<string, !Array.<!WebInspector.ServiceWorkerVersion>>}
     */
    this._categorizedVersions = {};
    for (var mode in WebInspector.ServiceWorkerVersion.Modes)
        this._categorizedVersions[WebInspector.ServiceWorkerVersion.Modes[mode]] = [];

    this._selectedMode = WebInspector.ServiceWorkerVersion.Modes.Active;

    /**
     * @type {!Array.<!WebInspector.SWVersionElement>}
     */
    this._versionElements = [];

    this._updateRegistration(registration);
}

WebInspector.SWRegistrationElement.prototype = {
    /**
     * @param {!WebInspector.ServiceWorkerRegistration} registration
     */
    _updateRegistration: function(registration)
    {
        this._registration = registration;
        this._titleNode.textContent = WebInspector.UIString(registration.isDeleted ? "Scope: %s - deleted" : "Scope: %s", registration.scopeURL.asParsedURL().path);
        this._updateButton.disabled = !!registration.isDeleted;
        this._deleteButton.disabled = !!registration.isDeleted;
        this._skipWaitingCheckboxLabel.remove();

        var lastFocusedVersionId = undefined;
        if (this._categorizedVersions[this._selectedMode].length)
            lastFocusedVersionId = this._categorizedVersions[this._selectedMode][0].id;
        for (var mode in WebInspector.ServiceWorkerVersion.Modes)
            this._categorizedVersions[WebInspector.ServiceWorkerVersion.Modes[mode]] = [];
        for (var version of registration.versions.valuesArray()) {
            if (version.isStoppedAndRedundant() && !version.errorMessages.length)
                continue;
            var mode = version.mode();
            this._categorizedVersions[mode].push(version);
            if (version.id === lastFocusedVersionId)
                this._selectedMode = mode;
        }
        if (!this._categorizedVersions[this._selectedMode].length && this._selectedMode != WebInspector.ServiceWorkerVersion.Modes.Waiting) {
            for (var mode of [WebInspector.ServiceWorkerVersion.Modes.Active,
                              WebInspector.ServiceWorkerVersion.Modes.Waiting,
                              WebInspector.ServiceWorkerVersion.Modes.Installing,
                              WebInspector.ServiceWorkerVersion.Modes.Redundant]) {
                if (this._categorizedVersions[mode].length) {
                    this._selectedMode = mode;
                    break;
                }
            }
        }
        this._pushButton.disabled = !this._categorizedVersions[WebInspector.ServiceWorkerVersion.Modes.Active].length || !!this._registration.isDeleted;

        this._updateVersionList();

        if (this._visible() && this._skipWaitingCheckbox.checked) {
            this._registration.versions.valuesArray().map(callSkipWaitingForInstalledVersions.bind(this));
        }

        /**
         * @this {WebInspector.SWRegistrationElement}
         * @param {!WebInspector.ServiceWorkerVersion} version
         */
        function callSkipWaitingForInstalledVersions(version)
        {
            if (version.isInstalled())
                this._manager.skipWaiting(version.id);
        }
    },

    _updateVersionList: function()
    {
        var fragment = createDocumentFragment();
        var modeTabList = createElementWithClass("div", "service-workers-versions-mode-tab-list");
        modeTabList.appendChild(this._createVersionModeTab(WebInspector.ServiceWorkerVersion.Modes.Installing));
        modeTabList.appendChild(this._createVersionModeTab(WebInspector.ServiceWorkerVersion.Modes.Waiting));
        modeTabList.appendChild(this._createVersionModeTab(WebInspector.ServiceWorkerVersion.Modes.Active));
        modeTabList.appendChild(this._createVersionModeTab(WebInspector.ServiceWorkerVersion.Modes.Redundant));
        fragment.appendChild(modeTabList);
        fragment.appendChild(this._createSelectedModeVersionsPanel(this._selectedMode));
        this._childrenListNode.removeChildren();
        this._childrenListNode.appendChild(fragment);
    },

    /**
     * @param {string} mode
     * @return {!Element}
     */
    _createVersionModeTab: function(mode)
    {
        var versions = this._categorizedVersions[mode];
        var modeTitle = WebInspector.UIString(mode);
        var selected = this._selectedMode == mode;
        var modeTab = createElementWithClass("div", "service-workers-versions-mode-tab");
        for (var version of versions) {
            var icon = modeTab.createChild("div", "service-workers-versions-mode-tab-icon service-workers-color-" + (version.id % 10));
            icon.title = WebInspector.UIString("ID: %s", version.id);
        }
        var modeTabText = modeTab.createChild("div", "service-workers-versions-mode-tab-text");
        modeTabText.createTextChild(WebInspector.UIString(modeTitle));
        if (selected) {
            modeTab.classList.add("service-workers-versions-mode-tab-selected");
            modeTabText.classList.add("service-workers-versions-mode-tab-text-selected");
        }
        if (versions.length || mode == WebInspector.ServiceWorkerVersion.Modes.Waiting) {
            modeTab.addEventListener("click", this._modeTabClicked.bind(this, mode), false);
        } else {
            modeTab.classList.add("service-workers-versions-mode-tab-disabled");
            modeTabText.classList.add("service-workers-versions-mode-tab-text-disabled");
        }
        return modeTab;
    },

    /**
     * @param {string} mode
     * @return {!Element}
     */
    _createSelectedModeVersionsPanel: function(mode)
    {
        var versions = this._categorizedVersions[mode];
        var panelContainer = createElementWithClass("div", "service-workers-versions-panel-container");
        if (mode == WebInspector.ServiceWorkerVersion.Modes.Waiting) {
            var panel = createElementWithClass("div", "service-workers-versions-option-panel");
            panel.appendChild(this._skipWaitingCheckboxLabel);
            panelContainer.appendChild(panel);
        }
        var index = 0;
        var versionElement;
        for (var i = 0; i < versions.length; ++i) {
            if (i < this._versionElements.length) {
                versionElement = this._versionElements[i];
                versionElement._updateVersion(versions[i]);
            } else {
                versionElement = new WebInspector.SWVersionElement(this._manager, this._registration.scopeURL, versions[i]);
                this._versionElements.push(versionElement);
            }
            panelContainer.appendChild(versionElement._element);
        }
        this._versionElements.splice(versions.length);
        return panelContainer;
    },

    /**
     * @param {string} mode
     */
    _modeTabClicked: function(mode)
    {
        if (this._selectedMode == mode)
            return;
        this._selectedMode = mode;
        this._updateVersionList();
    },

    /**
     * @param {!Event} event
     */
    _deleteButtonClicked: function(event)
    {
        this._manager.deleteRegistration(this._registration.id);
    },

    /**
     * @param {!Event} event
     */
    _updateButtonClicked: function(event)
    {
        this._manager.updateRegistration(this._registration.id);
    },

    /**
     * @param {!Event} event
     */
    _pushButtonClicked: function(event)
    {
        var data = "Test push message from DevTools."
        this._manager.deliverPushMessage(this._registration.id, data);
    },

    _skipWaitingCheckboxChanged: function()
    {
        if (!this._skipWaitingCheckbox.checked)
            return;
        this._registration.versions.valuesArray().map(callSkipWaitingForInstalledVersions.bind(this));

        /**
         * @this {WebInspector.SWRegistrationElement}
         * @param {!WebInspector.ServiceWorkerVersion} version
         */
        function callSkipWaitingForInstalledVersions(version)
        {
            if (version.isInstalled())
                this._manager.skipWaiting(version.id);
        }
    },

    /**
     * @return {boolean}
     */
    _visible: function()
    {
        return this._originElement._visible();
    },
}

/**
 * @constructor
 * @param {!WebInspector.ServiceWorkerManager} manager
 * @param {string} scopeURL
 * @param {!WebInspector.ServiceWorkerVersion} version
 */
WebInspector.SWVersionElement = function(manager, scopeURL, version)
{
    this._manager = manager;
    this._scopeURL = scopeURL;
    this._version = version;
    this._element = createElementWithClass("div", "service-workers-version");

    /**
     * @type {!Object.<string, !WebInspector.TargetInfo>}
     */
    this._clientInfoCache = {};
    this._createElements();
    this._updateVersion(version);
}

WebInspector.SWVersionElement.prototype = {
    _createElements: function()
    {
        var panel = createElementWithClass("div", "service-workers-versions-panel");
        var leftPanel = panel.createChild("div", "service-workers-versions-panel-left");
        var rightPanel = panel.createChild("div", "service-workers-versions-panel-right");
        this._stateCell = this._addTableRow(leftPanel, WebInspector.UIString("State"));
        this._workerCell = this._addTableRow(leftPanel, WebInspector.UIString("Worker"));
        this._scriptCell = this._addTableRow(leftPanel, WebInspector.UIString("Script URL"));
        this._updatedCell = this._addTableRow(leftPanel, WebInspector.UIString("Updated"));
        this._updatedCell.classList.add("service-worker-script-response-time");
        this._scriptLastModifiedCell = this._addTableRow(leftPanel, WebInspector.UIString("Last-Modified"));
        this._scriptLastModifiedCell.classList.add("service-worker-script-last-modified");
        rightPanel.createChild("div", "service-workers-versions-table-messages-title").createTextChild(WebInspector.UIString("Recent messages"));
        this._messagesPanel = rightPanel.createChild("div", "service-workers-versions-table-messages-content");
        this._clientsTitle = rightPanel.createChild("div", "service-workers-versions-table-clients-title");
        this._clientsTitle.createTextChild(WebInspector.UIString("Controlled clients"));
        this._clientsPanel = rightPanel.createChild("div", "service-workers-versions-table-clients-content");
        this._element.appendChild(panel);
    },

    /**
     * @param {!WebInspector.ServiceWorkerVersion} version
     */
    _updateVersion: function(version)
    {
        this._stateCell.removeChildren();
        this._stateCell.createTextChild(version.status);

        this._workerCell.removeChildren();
        if (version.isRunning() || version.isStarting() || version.isStartable()) {
            var runningStatusCell = this._workerCell.createChild("div", "service-workers-versions-table-worker-running-status-cell");
            var runningStatusLeftCell = runningStatusCell.createChild("div", "service-workers-versions-table-running-status-left-cell");
            var runningStatusRightCell = runningStatusCell.createChild("div", "service-workers-versions-table-running-status-right-cell");
            if (version.isRunning() || version.isStarting()) {
                var stopButton = runningStatusLeftCell.createChild("button", "service-workers-button service-workers-stop-button");
                stopButton.addEventListener("click", this._stopButtonClicked.bind(this, version.id), false);
                stopButton.title = WebInspector.UIString("Stop");
            } else if (version.isStartable()) {
                var startButton = runningStatusLeftCell.createChild("button", "service-workers-button service-workers-start-button");
                startButton.addEventListener("click", this._startButtonClicked.bind(this), false);
                startButton.title = WebInspector.UIString("Start");
            }
            runningStatusRightCell.createTextChild(version.runningStatus);
            if (version.isRunning() || version.isStarting()) {
                var inspectButton = runningStatusRightCell.createChild("div", "service-workers-versions-table-running-status-inspect");
                inspectButton.createTextChild(WebInspector.UIString("inspect"));
                inspectButton.addEventListener("click", this._inspectButtonClicked.bind(this, version.id), false);
            }
        } else {
            this._workerCell.createTextChild(version.runningStatus);
        }

        this._scriptCell.removeChildren();
        this._scriptCell.createTextChild(version.scriptURL.asParsedURL().path);

        this._updatedCell.removeChildren();
        if (version.scriptResponseTime)
            this._updatedCell.createTextChild((new Date(version.scriptResponseTime * 1000)).toConsoleTime());
        this._scriptLastModifiedCell.removeChildren();
        if (version.scriptLastModified)
            this._scriptLastModifiedCell.createTextChild((new Date(version.scriptLastModified * 1000)).toConsoleTime());

        this._messagesPanel.removeChildren();
        if (version.scriptLastModified) {
            var scriptLastModifiedLabel = this._messagesPanel.createChild("label", " service-workers-info service-worker-script-last-modified", "dt-icon-label");
            scriptLastModifiedLabel.type = "info-icon";
            scriptLastModifiedLabel.createTextChild(WebInspector.UIString("Last-Modified: %s", (new Date(version.scriptLastModified * 1000)).toConsoleTime()));
        }
        if (version.scriptResponseTime) {
            var scriptResponseTimeDiv = this._messagesPanel.createChild("label", " service-workers-info service-worker-script-response-time", "dt-icon-label");
            scriptResponseTimeDiv.type = "info-icon";
            scriptResponseTimeDiv.createTextChild(WebInspector.UIString("Server response time: %s", (new Date(version.scriptResponseTime * 1000)).toConsoleTime()));
        }

        var errorMessages = version.errorMessages;
        for (var index = 0; index < errorMessages.length; ++index) {
            var errorDiv = this._messagesPanel.createChild("div", "service-workers-error");
            errorDiv.createChild("label", "", "dt-icon-label").type = "error-icon";
            errorDiv.createChild("div", "service-workers-error-message").createTextChild(errorMessages[index].errorMessage);
            var script_path = errorMessages[index].sourceURL;
            var script_url;
            if (script_url = script_path.asParsedURL())
                script_path = script_url.displayName;
            if (script_path.length && errorMessages[index].lineNumber != -1)
                script_path = String.sprintf("(%s:%d)", script_path, errorMessages[index].lineNumber);
            errorDiv.createChild("div", "service-workers-error-line").createTextChild(script_path);
        }

        this._clientsTitle.classList.toggle("hidden", version.controlledClients.length == 0);

        this._clientsPanel.removeChildren();
        for (var i = 0; i < version.controlledClients.length; ++i) {
            var client = version.controlledClients[i];
            var clientLabelText = this._clientsPanel.createChild("div", "service-worker-client");
            if (this._clientInfoCache[client]) {
                this._updateClientInfo(clientLabelText, this._clientInfoCache[client]);
            }
            this._manager.getTargetInfo(client, this._onClientInfo.bind(this, clientLabelText));
        }
    },

    /**
     * @param {!Element} tableElement
     * @param {string} title
     * @return {!Element}
     */
    _addTableRow: function(tableElement, title)
    {
        var rowElement = tableElement.createChild("div", "service-workers-versions-table-row");
        rowElement.createChild("div", "service-workers-versions-table-row-title").createTextChild(title);
        return rowElement.createChild("div", "service-workers-versions-table-row-content");
    },

    /**
     * @param {!Element} element
     * @param {?WebInspector.TargetInfo} targetInfo
     */
    _onClientInfo: function(element, targetInfo)
    {
        if (!targetInfo)
            return;
        this._clientInfoCache[targetInfo.id] = targetInfo;
        this._updateClientInfo(element, targetInfo);
    },

    /**
     * @param {!Element} element
     * @param {!WebInspector.TargetInfo} targetInfo
     */
    _updateClientInfo: function(element, targetInfo)
    {
        if (!(targetInfo.isWebContents() || targetInfo.isFrame())) {
            element.createTextChild(WebInspector.UIString("Worker: %s", targetInfo.url));
            return;
        }
        element.removeChildren();
        element.createTextChild(WebInspector.UIString("Tab: %s", targetInfo.url));
        var focusLabel = element.createChild("label", "service-worker-client-focus");
        focusLabel.createTextChild("focus");
        focusLabel.addEventListener("click", this._activateTarget.bind(this, targetInfo.id), true);
    },

    /**
     * @param {string} targetId
     */
    _activateTarget: function(targetId)
    {
        this._manager.activateTarget(targetId);
    },

    /**
     * @param {!Event} event
     */
    _startButtonClicked: function(event)
    {
        this._manager.startWorker(this._scopeURL);
    },

    /**
     * @param {string} versionId
     * @param {!Event} event
     */
    _stopButtonClicked: function(versionId, event)
    {
        this._manager.stopWorker(versionId);
    },

    /**
     * @param {string} versionId
     * @param {!Event} event
     */
    _inspectButtonClicked: function(versionId, event)
    {
        this._manager.inspectWorker(versionId);
    },
}
