/*
 * Copyright (C) 2009 Google Inc. All rights reserved.
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

WebInspector.AuditLauncherView = function(categoriesById, runnerCallback)
{
    WebInspector.View.call(this);
    this._categoriesById = categoriesById;
    this._runnerCallback = runnerCallback;
    this._categoryIdPrefix = "audit-category-item-";
    this._auditRunning = false;

    this.element.addStyleClass("audit-launcher-view");

    this._contentElement = document.createElement("div");
    this._contentElement.className = "audit-launcher-view-content";
    this.element.appendChild(this._contentElement);

    this._resetResourceCount();

    function categorySortFunction(a, b)
    {
        var aTitle = a.displayName || "";
        var bTitle = b.displayName || "";
        return aTitle.localeCompare(bTitle);
    }
    var sortedCategories = [];
    for (var id in this._categoriesById)
        sortedCategories.push(this._categoriesById[id]);
    sortedCategories.sort(categorySortFunction);

    if (!sortedCategories.length) {
        this._headerElement = document.createElement("h1");
        this._headerElement.className = "no-audits";
        this._headerElement.textContent = WebInspector.UIString("No audits to run");
        this._contentElement.appendChild(this._headerElement);
    } else
        this._createLauncherUI(sortedCategories);
}

WebInspector.AuditLauncherView.prototype = {
    updateResourceTrackingState: function(isTracking)
    {
        if (!this._auditPresentStateLabelElement)
            return;

        if (isTracking) {
            this._auditPresentStateLabelElement.nodeValue = WebInspector.UIString("Audit Present State");
            this._auditPresentStateElement.disabled = false;
            this._auditPresentStateElement.parentElement.removeStyleClass("disabled");
        } else {
            this._resetResourceCount();
            this._auditPresentStateLabelElement.nodeValue = WebInspector.UIString("Audit Present State (Resource Tracking must be enabled)");
            this._auditPresentStateElement.disabled = true;
            this._auditPresentStateElement.parentElement.addStyleClass("disabled");
            this.auditReloadedStateElement.checked = true;
        }
    },

    get totalResources()
    {
        return this._totalResources;
    },

    set totalResources(x)
    {
        if (this._totalResources === x)
            return;
        this._totalResources = x;
        this._updateResourceProgress();
    },

    get loadedResources()
    {
        return this._loadedResources;
    },

    set loadedResources(x)
    {
        if (this._loadedResources === x)
            return;
        this._loadedResources = x;
        this._updateResourceProgress();
    },

    _resetResourceCount: function()
    {
        this.loadedResources = 0;

        // We never receive a resourceStarted notification for the main resource
        // (see InspectorController.willSendRequest())
        this.totalResources = 1;
    },

    resourceStarted: function(resource)
    {
        ++this.totalResources;
    },

    resourceFinished: function(resource)
    {
        ++this.loadedResources;
    },

    reset: function()
    {
        this._resetResourceCount();
    },

    _setAuditRunning: function(auditRunning)
    {
        if (this._auditRunning === auditRunning)
            return;
        this._auditRunning = auditRunning;
        this._updateButton();
        this._updateResourceProgress();
    },

    _launchButtonClicked: function(event)
    {
        var catIds = [];
        var childNodes = this._categoriesElement.childNodes;
        for (var id in this._categoriesById) {
            if (this._categoriesById[id]._checkboxElement.checked)
                catIds.push(id);
        }
        this._setAuditRunning(true);
        this._runnerCallback(catIds, this._auditPresentStateElement.checked, this._setAuditRunning.bind(this, false));
    },

    _selectAllClicked: function(checkCategories)
    {
        var childNodes = this._categoriesElement.childNodes;
        for (var i = 0, length = childNodes.length; i < length; ++i)
            childNodes[i].firstChild.checked = checkCategories;
        this._currentCategoriesCount = checkCategories ? this._totalCategoriesCount : 0;
        this._updateButton();
    },

    _categoryClicked: function(event)
    {
        this._currentCategoriesCount += event.target.checked ? 1 : -1;
        this._selectAllCheckboxElement.checked = this._currentCategoriesCount === this._totalCategoriesCount;
        this._updateButton();
    },

    _createCategoryElement: function(title, id)
    {
        var labelElement = document.createElement("label");
        labelElement.id = this._categoryIdPrefix + id;

        var element = document.createElement("input");
        element.type = "checkbox";
        labelElement.appendChild(element);
        labelElement.appendChild(document.createTextNode(title));

        return labelElement;
    },

    _createLauncherUI: function(sortedCategories)
    {
        this._headerElement = document.createElement("h1");
        this._headerElement.textContent = WebInspector.UIString("Select audits to run");
        this._contentElement.appendChild(this._headerElement);

        function handleSelectAllClick(event)
        {
            this._selectAllClicked(event.target.checked);
        }
        var categoryElement = this._createCategoryElement(WebInspector.UIString("Select All"), "");
        categoryElement.id = "audit-launcher-selectall";
        this._selectAllCheckboxElement = categoryElement.firstChild;
        this._selectAllCheckboxElement.checked = true;
        this._selectAllCheckboxElement.addEventListener("click", handleSelectAllClick.bind(this), false);
        this._contentElement.appendChild(categoryElement);

        this._categoriesElement = document.createElement("div");
        this._categoriesElement.className = "audit-categories-container";
        this._contentElement.appendChild(this._categoriesElement);

        var boundCategoryClickListener = this._categoryClicked.bind(this);

        for (var i = 0; i < sortedCategories.length; ++i) {
            categoryElement = this._createCategoryElement(sortedCategories[i].displayName, sortedCategories[i].id);
            categoryElement.firstChild.addEventListener("click", boundCategoryClickListener, false);
            sortedCategories[i]._checkboxElement = categoryElement.firstChild;
            this._categoriesElement.appendChild(categoryElement);
        }

        this._totalCategoriesCount = this._categoriesElement.childNodes.length;
        this._currentCategoriesCount = 0;

        var flexibleSpaceElement = document.createElement("div");
        flexibleSpaceElement.className = "flexible-space";
        this._contentElement.appendChild(flexibleSpaceElement);

        this._buttonContainerElement = document.createElement("div");
        this._buttonContainerElement.className = "button-container";

        var labelElement = document.createElement("label");
        this._auditPresentStateElement = document.createElement("input");
        this._auditPresentStateElement.name = "audit-mode";
        this._auditPresentStateElement.type = "radio";
        this._auditPresentStateElement.checked = true;
        this._auditPresentStateLabelElement = document.createTextNode("");
        labelElement.appendChild(this._auditPresentStateElement);
        labelElement.appendChild(this._auditPresentStateLabelElement);
        this._buttonContainerElement.appendChild(labelElement);

        labelElement = document.createElement("label");
        this.auditReloadedStateElement = document.createElement("input");
        this.auditReloadedStateElement.name = "audit-mode";
        this.auditReloadedStateElement.type = "radio";
        labelElement.appendChild(this.auditReloadedStateElement);
        labelElement.appendChild(document.createTextNode("Reload Page and Audit on Load"));
        this._buttonContainerElement.appendChild(labelElement);

        this._launchButton = document.createElement("button");
        this._launchButton.type = "button";
        this._launchButton.textContent = WebInspector.UIString("Run");
        this._launchButton.addEventListener("click", this._launchButtonClicked.bind(this), false);
        this._buttonContainerElement.appendChild(this._launchButton);

        this._resourceProgressContainer = document.createElement("span");
        this._resourceProgressContainer.className = "resource-progress";
        var resourceProgressImage = document.createElement("img");
        this._resourceProgressContainer.appendChild(resourceProgressImage);
        this._resourceProgressTextElement = document.createElement("span");
        this._resourceProgressContainer.appendChild(this._resourceProgressTextElement);
        this._buttonContainerElement.appendChild(this._resourceProgressContainer);

        this._contentElement.appendChild(this._buttonContainerElement);

        this._selectAllClicked(this._selectAllCheckboxElement.checked);
        this.updateResourceTrackingState();
        this._updateButton();
    },

    _updateResourceProgress: function()
    {
        if (!this._resourceProgressContainer)
            return;

        if (!this._auditRunning) {
            this._resetResourceCount();
            this._resourceProgressContainer.addStyleClass("hidden");
        } else
            this._resourceProgressContainer.removeStyleClass("hidden");
        this._resourceProgressTextElement.textContent = WebInspector.UIString("Loading (%d of %d)", this.loadedResources, this.totalResources);
    },

    _updateButton: function()
    {
        this._launchButton.disabled = !this._currentCategoriesCount || this._auditRunning;
    }
}

WebInspector.AuditLauncherView.prototype.__proto__ = WebInspector.View.prototype;
