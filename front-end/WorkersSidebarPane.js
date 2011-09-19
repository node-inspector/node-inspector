/*
 * Copyright (C) 2010 Google Inc. All rights reserved.
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

WebInspector.WorkersSidebarPane = function()
{
    WebInspector.SidebarPane.call(this, WebInspector.UIString("Workers"));

    this._workers = {};

    this._enableWorkersCheckbox = new WebInspector.Checkbox(
        WebInspector.UIString("Debug"),
        "sidebar-pane-subtitle",
        WebInspector.UIString("Allow debugging workers. Enabling this option will replace native workers with the iframe-based JavaScript implementation"));
    this.titleElement.insertBefore(this._enableWorkersCheckbox.element, this.titleElement.firstChild);

    this._enableWorkersCheckbox.addEventListener(this._onTriggerInstrument.bind(this));
    this._enableWorkersCheckbox.checked = false;

    this._listElement = document.createElement("ol");
    this._listElement.className = "workers-list";

    this.bodyElement.appendChild(this._listElement);
    this._treeOutline = new TreeOutline(this._listElement);
}

WebInspector.WorkersSidebarPane.prototype = {
    addWorker: function(id, url, isShared)
    {
        if (id in this._workers)
            return;
        var worker = new WebInspector.Worker(id, url, isShared);
        this._workers[id] = worker;

        var title = WebInspector.linkifyURL(url, WebInspector.displayNameForURL(url), "worker-item", true, url);
        var treeElement = new TreeElement(null, worker, false);
        treeElement.titleHTML = title;
        this._treeOutline.appendChild(treeElement);
    },

    removeWorker: function(id)
    {
        if (id in this._workers) {
            this._treeOutline.removeChild(this._treeOutline.findTreeElement(this._workers[id]));
            delete this._workers[id];
        }
    },

    setInstrumentation: function(enabled)
    {
        PageAgent.removeAllScriptsToEvaluateOnLoad();
        if (enabled)
            PageAgent.addScriptToEvaluateOnLoad("(" + InjectedFakeWorker + ")");
    },

    reset: function()
    {
        this.setInstrumentation(this._enableWorkersCheckbox.checked);
        this._treeOutline.removeChildren();
        this._workers = {};
    },

    _onTriggerInstrument: function(event)
    {
        this.setInstrumentation(this._enableWorkersCheckbox.checked);
    }
};

WebInspector.WorkersSidebarPane.prototype.__proto__ = WebInspector.SidebarPane.prototype;

WebInspector.Worker = function(id, url, shared)
{
    this.id = id;
    this.url = url;
    this.shared = shared;
}



WebInspector.WorkerListSidebarPane = function(workerManager)
{
    WebInspector.SidebarPane.call(this, WebInspector.UIString("Worker inspectors"));

    this._enableWorkersCheckbox = new WebInspector.Checkbox(
        WebInspector.UIString("Debug"),
        "sidebar-pane-subtitle",
        WebInspector.UIString("Automatically attach to new workers. Enabling this option will force opening inspector for all new workers."));
    this.titleElement.insertBefore(this._enableWorkersCheckbox.element, this.titleElement.firstChild);
    this._enableWorkersCheckbox.addEventListener(this._autoattachToWorkersClicked.bind(this));
    this._enableWorkersCheckbox.checked = false;

    this._workerListElement = document.createElement("ol");
    this._workerListElement.tabIndex = 0;
    this._workerListElement.addStyleClass("properties-tree");
    this._workerListTreeOutline = new TreeOutline(this._workerListElement);
    this.bodyElement.appendChild(this._workerListElement);

    this._idToWorkerItem = {};
    this._workerManager = workerManager;

    workerManager.addEventListener(WebInspector.WorkerManager.Events.WorkerAdded, this._workerAdded, this);
    workerManager.addEventListener(WebInspector.WorkerManager.Events.WorkerRemoved, this._workerRemoved, this);
    workerManager.addEventListener(WebInspector.WorkerManager.Events.WorkersCleared, this._workersCleared, this);
    workerManager.addEventListener(WebInspector.WorkerManager.Events.WorkerInspectorClosed, this._workerInspectorClosed, this);
}

WebInspector.WorkerListSidebarPane.prototype = {
    _workerAdded: function(event)
    {
        this._addWorker(event.data.workerId, event.data.url, event.data.inspectorConnected);
    },

    _workerRemoved: function(event)
    {
        var workerItem = this._idToWorkerItem[event.data];
        delete this._idToWorkerItem[event.data];
        workerItem.element.parent.removeChild(workerItem.element);
    },

    _workerInspectorClosed: function(event)
    {
        var workerItem = this._idToWorkerItem[event.data];
        workerItem.checkbox.checked = false;
    },

    _workersCleared: function(event)
    {
        this._idToWorkerItem = {};
        this._workerListTreeOutline.removeChildren();
    },

    _addWorker: function(workerId, url, inspectorConnected)
    {
        var workerItem = {};
        workerItem.workerId = workerId;
        workerItem.element = new TreeElement(url);
        this._workerListTreeOutline.appendChild(workerItem.element);
        workerItem.element.selectable = true;

        workerItem.checkbox = this._createCheckbox(workerItem.element);
        workerItem.checkbox.checked = inspectorConnected;
        workerItem.checkbox.addEventListener("click", this._workerItemClicked.bind(this, workerItem), true);

        this._idToWorkerItem[workerId] = workerItem;
    },

    _createCheckbox: function(treeElement)
    {
        var checkbox = document.createElement("input");
        checkbox.className = "checkbox-elem";
        checkbox.type = "checkbox";
        treeElement.listItemElement.insertBefore(checkbox, treeElement.listItemElement.firstChild);
        return checkbox;
    },

    _workerItemClicked: function(workerItem, event)
    {
        if (event.target.checked)
            this._workerManager.openWorkerInspector(workerItem.workerId);
        else
            this._workerManager.closeWorkerInspector(workerItem.workerId);
    },

    _autoattachToWorkersClicked: function(event)
    {
        WorkerAgent.setAutoconnectToWorkers(event.target.checked);
    }
}

WebInspector.WorkerListSidebarPane.prototype.__proto__ = WebInspector.SidebarPane.prototype;
