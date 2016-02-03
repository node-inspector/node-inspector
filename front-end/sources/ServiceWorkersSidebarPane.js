// Copyright (c) 2015 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

/**
 * @constructor
 * @extends {WebInspector.SidebarPane}
 * @implements {WebInspector.TargetManager.Observer}
 */
WebInspector.ServiceWorkersSidebarPane = function()
{
    WebInspector.SidebarPane.call(this, WebInspector.UIString("\u2699 Service Workers"));
    this.registerRequiredCSS("sources/serviceWorkersSidebar.css");
    this._bodyElement = this.element.createChild("div", "vbox");
    this.setVisible(false);

    /** @type {?WebInspector.ServiceWorkerManager} */
    this._manager = null;
    WebInspector.targetManager.observeTargets(this, WebInspector.Target.Type.Page);
    this._placeholderElement = createElementWithClass("div", "info");
    this._placeholderElement.textContent = WebInspector.UIString("No service workers control this page");

    /** @type {!Map.<string, !Element>} */
    this._versionIdCheckBoxMap = new Map();
}

WebInspector.ServiceWorkersSidebarPane.prototype = {
    /**
     * @override
     * @param {!WebInspector.Target} target
     */
    targetAdded: function(target)
    {
        if (this._manager)
            return;
        this._manager = target.serviceWorkerManager;
        this._updateVisibility();
        target.serviceWorkerManager.addEventListener(WebInspector.ServiceWorkerManager.Events.WorkersUpdated, this._update, this);
        target.serviceWorkerManager.addEventListener(WebInspector.ServiceWorkerManager.Events.RegistrationUpdated, this._registrationUpdated, this);
    },

    /**
     * @override
     * @param {!WebInspector.Target} target
     */
    targetRemoved: function(target)
    {
        target.serviceWorkerManager.removeEventListener(WebInspector.ServiceWorkerManager.Events.WorkersUpdated, this._update, this);
        target.serviceWorkerManager.removeEventListener(WebInspector.ServiceWorkerManager.Events.RegistrationUpdated, this._registrationUpdated, this);
        this._updateVisibility();
    },

    _update: function()
    {
        this._updateVisibility();
        this._bodyElement.removeChildren();
        this._versionIdCheckBoxMap.clear();

        if (!this.isShowing() || !this._manager)
            return;

        if (!this._manager.hasWorkers()) {
            this._bodyElement.appendChild(this._placeholderElement);
            return;
        }

        for (var worker of this._manager.workers()) {
            var workerElement = this._bodyElement.createChild("div", "service-worker");
            var leftBox = workerElement.createChild("div", "vbox flex-auto");
            leftBox.appendChild(WebInspector.linkifyURLAsNode(worker.url(), worker.name()));
            var scopeElement = leftBox.createChild("span", "service-worker-scope");
            scopeElement.textContent = worker.scope();
            scopeElement.title = worker.scope();
            var forceUpdateOnPageLoadCheckboxLabel = createCheckboxLabel(WebInspector.UIString("Force update on page load"));
            var forceUpdateOnPageLoadCheckbox = forceUpdateOnPageLoadCheckboxLabel.checkboxElement;
            this._versionIdCheckBoxMap.set(worker.versionId(), forceUpdateOnPageLoadCheckbox);
            forceUpdateOnPageLoadCheckbox.addEventListener("click", this._forceUpdateOnPageLoadCheckboxClicked.bind(this, forceUpdateOnPageLoadCheckbox, worker.versionId()), false);
            var version = this._manager.findVersion(worker.versionId());
            if (version)
                forceUpdateOnPageLoadCheckbox.checked = version.registration.forceUpdateOnPageLoad;
            leftBox.appendChild(forceUpdateOnPageLoadCheckboxLabel);
            workerElement.appendChild(createTextButton(WebInspector.UIString("Unregister"), worker.stop.bind(worker)));
        }
    },

    /**
     * @param {!WebInspector.Event} event
     */
    _registrationUpdated: function(event)
    {
        var registration = /** @type {!WebInspector.ServiceWorkerRegistration} */ (event.data);
        for (var version of registration.versions.values()) {
            var checkBox = this._versionIdCheckBoxMap.get(version.id);
            if (checkBox)
                checkBox.checked = registration.forceUpdateOnPageLoad;
        }
    },

    /**
     * @param {!Element} checkbox
     * @param {string} versionId
     * @param {!Event} event
     */
    _forceUpdateOnPageLoadCheckboxClicked: function(checkbox, versionId, event)
    {
        event.preventDefault()
        var version = this._manager.findVersion(versionId);
        if (!version)
            return;
        this._manager.setForceUpdateOnPageLoad(version.registration.id, checkbox.checked);
    },

    _updateVisibility: function()
    {
        this._wasVisibleAtLeastOnce = this._wasVisibleAtLeastOnce || !!this._manager && this._manager.hasWorkers();
        this.setVisible(this._wasVisibleAtLeastOnce);
    },

    wasShown: function()
    {
        this._update();
    },

    __proto__: WebInspector.SidebarPane.prototype
}
