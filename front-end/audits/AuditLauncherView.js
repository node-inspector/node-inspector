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
 * @param {!WebInspector.AuditController} auditController
 * @extends {WebInspector.VBox}
 */
WebInspector.AuditLauncherView = function(auditController)
{
    WebInspector.VBox.call(this);
    this.setMinimumSize(100, 25);

    this._auditController = auditController;

    this._categoryIdPrefix = "audit-category-item-";
    this._auditRunning = false;

    this.element.classList.add("audit-launcher-view");
    this.element.classList.add("panel-enabler-view");

    this._contentElement = createElement("div");
    this._contentElement.className = "audit-launcher-view-content";
    this.element.appendChild(this._contentElement);
    this._boundCategoryClickListener = this._categoryClicked.bind(this);

    this._resetResourceCount();

    this._sortedCategories = [];

    this._headerElement = createElement("h1");
    this._headerElement.className = "no-audits";
    this._headerElement.textContent = WebInspector.UIString("No audits to run");
    this._contentElement.appendChild(this._headerElement);

    WebInspector.targetManager.addModelListener(WebInspector.NetworkManager, WebInspector.NetworkManager.EventTypes.RequestStarted, this._onRequestStarted, this);
    WebInspector.targetManager.addModelListener(WebInspector.NetworkManager, WebInspector.NetworkManager.EventTypes.RequestFinished, this._onRequestFinished, this);

    var defaultSelectedAuditCategory = {};
    defaultSelectedAuditCategory[WebInspector.AuditLauncherView.AllCategoriesKey] = true;
    this._selectedCategoriesSetting = WebInspector.settings.createSetting("selectedAuditCategories", defaultSelectedAuditCategory);
}

WebInspector.AuditLauncherView.AllCategoriesKey = "__AllCategories";

WebInspector.AuditLauncherView.prototype = {
    _resetResourceCount: function()
    {
        this._loadedResources = 0;
        this._totalResources = 0;
    },

    _onRequestStarted: function(event)
    {
        var request = /** @type {!WebInspector.NetworkRequest} */ (event.data);
        // Ignore long-living WebSockets for the sake of progress indicator, as we won't be waiting them anyway.
        if (request.resourceType() === WebInspector.resourceTypes.WebSocket)
            return;
        ++this._totalResources;
        this._updateResourceProgress();
    },

    _onRequestFinished: function(event)
    {
        var request = /** @type {!WebInspector.NetworkRequest} */ (event.data);
        // See resorceStarted for details.
        if (request.resourceType() === WebInspector.resourceTypes.WebSocket)
            return;
        ++this._loadedResources;
        this._updateResourceProgress();
    },

    /**
     * @param {!WebInspector.AuditCategory} category
     */
    addCategory: function(category)
    {
        if (!this._sortedCategories.length)
            this._createLauncherUI();

        var selectedCategories = this._selectedCategoriesSetting.get();
        var categoryElement = this._createCategoryElement(category.displayName, category.id);
        category._checkboxElement = categoryElement.checkboxElement;
        if (this._selectAllCheckboxElement.checked || selectedCategories[category.displayName]) {
            category._checkboxElement.checked = true;
            ++this._currentCategoriesCount;
        }

        /**
         * @param {!WebInspector.AuditCategory} a
         * @param {!WebInspector.AuditCategory} b
         * @return {number}
         */
        function compareCategories(a, b)
        {
            var aTitle = a.displayName || "";
            var bTitle = b.displayName || "";
            return aTitle.localeCompare(bTitle);
        }
        var insertBefore = insertionIndexForObjectInListSortedByFunction(category, this._sortedCategories, compareCategories);
        this._categoriesElement.insertBefore(categoryElement, this._categoriesElement.children[insertBefore]);
        this._sortedCategories.splice(insertBefore, 0, category);
        this._selectedCategoriesUpdated();
    },

    _startAudit: function()
    {
        this._auditRunning = true;
        this._updateButton();
        this._toggleUIComponents(this._auditRunning);

        var catIds = [];
        for (var category = 0; category < this._sortedCategories.length; ++category) {
            if (this._sortedCategories[category]._checkboxElement.checked)
                catIds.push(this._sortedCategories[category].id);
        }

        this._resetResourceCount();
        this._progressIndicator = new WebInspector.ProgressIndicator();
        this._buttonContainerElement.appendChild(this._progressIndicator.element);
        this._displayResourceLoadingProgress = true;

        /**
         * @this {WebInspector.AuditLauncherView}
         */
        function onAuditStarted()
        {
            this._displayResourceLoadingProgress = false;
        }
        this._auditController.initiateAudit(catIds, new WebInspector.ProgressProxy(this._progressIndicator, this._auditsDone.bind(this)), this._auditPresentStateElement.checked, onAuditStarted.bind(this));
    },

    _auditsDone: function()
    {
        this._displayResourceLoadingProgress = false;
        delete this._progressIndicator;
        this._launchButton.disabled = false;
        this._auditRunning = false;
        this._updateButton();
        this._toggleUIComponents(this._auditRunning);
    },

    /**
     * @param {boolean} disable
     */
    _toggleUIComponents: function(disable)
    {
        this._selectAllCheckboxElement.disabled = disable;
        for (var child = this._categoriesElement.firstChild; child; child = child.nextSibling)
            child.checkboxElement.disabled = disable;
        this._auditPresentStateElement.disabled = disable;
        this._auditReloadedStateElement.disabled = disable;
    },

    _launchButtonClicked: function(event)
    {
        if (this._auditRunning) {
            this._launchButton.disabled = true;
            this._progressIndicator.cancel();
            return;
        }
        this._startAudit();
    },

    _clearButtonClicked: function()
    {
        this._auditController.clearResults();
    },

    /**
     * @param {boolean} checkCategories
     * @param {boolean=} userGesture
     */
    _selectAllClicked: function(checkCategories, userGesture)
    {
        var childNodes = this._categoriesElement.childNodes;
        for (var i = 0, length = childNodes.length; i < length; ++i)
            childNodes[i].checkboxElement.checked = checkCategories;
        this._currentCategoriesCount = checkCategories ? this._sortedCategories.length : 0;
        this._selectedCategoriesUpdated(userGesture);
    },

    _categoryClicked: function(event)
    {
        this._currentCategoriesCount += event.target.checked ? 1 : -1;
        this._selectAllCheckboxElement.checked = this._currentCategoriesCount === this._sortedCategories.length;
        this._selectedCategoriesUpdated(true);
    },

    /**
     * @param {string} title
     * @param {string=} id
     */
    _createCategoryElement: function(title, id)
    {
        var labelElement = createCheckboxLabel(title);
        if (id) {
            labelElement.id = this._categoryIdPrefix + id;
            labelElement.checkboxElement.addEventListener("click", this._boundCategoryClickListener, false);
        }
        labelElement.__displayName = title;

        return labelElement;
    },

    _createLauncherUI: function()
    {
        this._headerElement = createElement("h1");
        this._headerElement.textContent = WebInspector.UIString("Select audits to run");

        this._contentElement.removeChildren();
        this._contentElement.appendChild(this._headerElement);

        /**
         * @param {!Event} event
         * @this {WebInspector.AuditLauncherView}
         */
        function handleSelectAllClick(event)
        {
            this._selectAllClicked(event.target.checked, true);
        }
        var categoryElement = this._createCategoryElement(WebInspector.UIString("Select All"), "");
        categoryElement.id = "audit-launcher-selectall";
        this._selectAllCheckboxElement = categoryElement.checkboxElement;
        this._selectAllCheckboxElement.checked = this._selectedCategoriesSetting.get()[WebInspector.AuditLauncherView.AllCategoriesKey];
        this._selectAllCheckboxElement.addEventListener("click", handleSelectAllClick.bind(this), false);
        this._contentElement.appendChild(categoryElement);

        this._categoriesElement = this._contentElement.createChild("fieldset", "audit-categories-container");
        this._currentCategoriesCount = 0;

        this._contentElement.createChild("div", "flexible-space");

        this._buttonContainerElement = this._contentElement.createChild("div", "button-container");

        var radio = createRadioLabel("audit-mode", WebInspector.UIString("Audit Present State"), true);
        this._buttonContainerElement.appendChild(radio);
        this._auditPresentStateElement = radio.radioElement;

        radio = createRadioLabel("audit-mode", WebInspector.UIString("Reload Page and Audit on Load"));
        this._buttonContainerElement.appendChild(radio);
        this._auditReloadedStateElement = radio.radioElement;

        this._launchButton = createTextButton(WebInspector.UIString("Run"), this._launchButtonClicked.bind(this));
        this._buttonContainerElement.appendChild(this._launchButton);

        this._clearButton = createTextButton(WebInspector.UIString("Clear"), this._clearButtonClicked.bind(this));
        this._buttonContainerElement.appendChild(this._clearButton);

        this._selectAllClicked(this._selectAllCheckboxElement.checked);
    },

    _updateResourceProgress: function()
    {
        if (this._displayResourceLoadingProgress)
            this._progressIndicator.setTitle(WebInspector.UIString("Loading (%d of %d)", this._loadedResources, this._totalResources));
    },

    /**
     * @param {boolean=} userGesture
     */
    _selectedCategoriesUpdated: function(userGesture)
    {
        // Save present categories only upon user gesture to clean up junk from past versions and removed extensions.
        // Do not remove old categories if not handling a user gesture, as there's chance categories will be added
        // later during start-up.
        var selectedCategories = userGesture ? {} : this._selectedCategoriesSetting.get();
        var childNodes = this._categoriesElement.childNodes;
        for (var i = 0, length = childNodes.length; i < length; ++i)
            selectedCategories[childNodes[i].__displayName] = childNodes[i].checkboxElement.checked;
        selectedCategories[WebInspector.AuditLauncherView.AllCategoriesKey] = this._selectAllCheckboxElement.checked;
        this._selectedCategoriesSetting.set(selectedCategories);
        this._updateButton();
    },

    _updateButton: function()
    {
        this._launchButton.textContent = this._auditRunning ? WebInspector.UIString("Stop") : WebInspector.UIString("Run");
        this._launchButton.disabled = !this._currentCategoriesCount;
    },

    __proto__: WebInspector.VBox.prototype
}
