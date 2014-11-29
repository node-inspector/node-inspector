// Copyright 2014 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

/**
 * @constructor
 * @extends {WebInspector.VBox}
 */
WebInspector.PromisePane = function()
{
    WebInspector.VBox.call(this);
    this.registerRequiredCSS("promises/promisePane.css");
    this.element.classList.add("promises");

    var statusBar = new WebInspector.StatusBar(this.element);
    this._recordButton = new WebInspector.StatusBarButton(WebInspector.UIString("Record Promises"), "record-status-bar-item");
    this._recordButton.addEventListener("click", this._recordButtonClicked.bind(this));
    statusBar.appendStatusBarItem(this._recordButton);
    var clearButton = new WebInspector.StatusBarButton(WebInspector.UIString("Clear"), "clear-status-bar-item");
    clearButton.addEventListener("click", this._clearButtonClicked.bind(this));
    statusBar.appendStatusBarItem(clearButton);
    this._refreshButton = new WebInspector.StatusBarButton(WebInspector.UIString("Refresh"), "refresh-status-bar-item");
    this._refreshButton.addEventListener("click", this._refreshButtonClicked.bind(this));
    this._refreshButton.setEnabled(false);
    statusBar.appendStatusBarItem(this._refreshButton);
    this._liveCheckbox = new WebInspector.StatusBarCheckbox(WebInspector.UIString("Live"));
    this._liveCheckbox.element.title = WebInspector.UIString("Live Recording");
    this._liveCheckbox.inputElement.disabled = true;
    statusBar.appendStatusBarItem(this._liveCheckbox);

    this._dataGridContainer = new WebInspector.VBox();
    this._dataGridContainer.show(this.element);
    var columns = [
        { id: "location", title: WebInspector.UIString("Location"), disclosure: true },
        { id: "status", title: WebInspector.UIString("Status") },
        { id: "tts", title: WebInspector.UIString("Time to settle") }
    ];
    this._dataGrid = new WebInspector.DataGrid(columns, undefined, undefined, undefined, this._onContextMenu.bind(this));
    this._dataGrid.show(this._dataGridContainer.element);

    this._linkifier = new WebInspector.Linkifier();
}

WebInspector.PromisePane.prototype = {
    _recordButtonClicked: function(event)
    {
        var recording = !this._recordButton.toggled();
        this._recordButton.setToggled(recording);
        this._refreshButton.setEnabled(recording);
        if (recording)
            this._enablePromiseTracker();
        else
            this._disablePromiseTracker();
    },

    _refreshButtonClicked: function(event)
    {
        this._updateData();
    },

    _clearButtonClicked: function(event)
    {
        this._clear();
    },

    _enablePromiseTracker: function()
    {
        var mainTarget = WebInspector.targetManager.mainTarget();
        if (mainTarget) {
            mainTarget.debuggerAgent().enablePromiseTracker();
            this._target = mainTarget;
        }
    },

    _disablePromiseTracker: function()
    {
        if (this._target) {
            this._target.debuggerAgent().disablePromiseTracker();
            delete this._target;
        }
        this._clear();
    },

    /**
     * @param {!DebuggerAgent.PromiseDetails} p1
     * @param {!DebuggerAgent.PromiseDetails} p2
     * @return {number}
     */
    _comparePromises: function(p1, p2) {
        var t1 = p1.creationTime || 0;
        var t2 = p2.creationTime || 0;
        return t1 - t2;
    },

    _updateData: function()
    {
        /**
         * @param {?Protocol.Error} error
         * @param {?Array.<!DebuggerAgent.PromiseDetails>} promiseData
         * @this {WebInspector.PromisePane}
         */
        function callback(error, promiseData)
        {
            if (error || !promiseData)
                return;

            promiseData.sort(this._comparePromises);
            var nodesToInsert = { __proto__: null };
            for (var i = 0; i < promiseData.length; i++) {
                var promise = promiseData[i];
                var status = createElementWithClass("div", "status");
                status.classList.add(promise.status);
                status.createTextChild(promise.status);
                var data = {
                    promiseId: promise.id,
                    status: status
                };
                if (promise.callFrame)
                    data.location = this._linkifier.linkifyConsoleCallFrame(this._target, promise.callFrame);
                if (promise.creationTime && promise.settlementTime && promise.settlementTime >= promise.creationTime)
                    data.tts = Number.millisToString(promise.settlementTime - promise.creationTime, true);
                var node = new WebInspector.DataGridNode(data, false);
                nodesToInsert[promise.id] = { node: node, parentId: promise.parentId };
            }

            var rootNode = this._dataGrid.rootNode();

            for (var id in nodesToInsert) {
                var node = nodesToInsert[id].node;
                var parentId = nodesToInsert[id].parentId;
                var parentNode = (parentId && nodesToInsert[parentId]) ? nodesToInsert[parentId].node : rootNode;
                parentNode.appendChild(node);
                parentNode.expanded = true;
            }
        }

        this._clear();
        if (this._target)
            this._target.debuggerAgent().getPromises(callback.bind(this));
    },

    _clear: function()
    {
        this._dataGrid.rootNode().removeChildren();
        this._linkifier.reset();
        if (this._target)
            this._target.heapProfilerAgent().collectGarbage();
    },

    /**
     * @param {!WebInspector.ContextMenu} contextMenu
     * @param {!WebInspector.DataGridNode} node
     */
    _onContextMenu: function(contextMenu, node)
    {
        if (!this._target)
            return;
        var promiseId = node.data.promiseId;

        contextMenu.appendItem(WebInspector.UIString(WebInspector.useLowerCaseMenuTitles() ? "Show in console" : "Show In Console"), showPromiseInConsole.bind(this));
        contextMenu.show();

        /**
         * @this {WebInspector.PromisePane}
         */
        function showPromiseInConsole()
        {
            if (this._target)
                this._target.debuggerAgent().getPromiseById(promiseId, "console", didGetPromiseById.bind(this));
        }

        /**
         * @param {?Protocol.Error} error
         * @param {?RuntimeAgent.RemoteObject} promise
         * @this {WebInspector.PromisePane}
         */
        function didGetPromiseById(error, promise)
        {
            if (error || !promise)
                return;

            if (!this._target)
                return;

            this._target.consoleAgent().setLastEvaluationResult(promise.objectId);
            var message = new WebInspector.ConsoleMessage(this._target,
                                                          WebInspector.ConsoleMessage.MessageSource.Other,
                                                          WebInspector.ConsoleMessage.MessageLevel.Log,
                                                          "",
                                                          WebInspector.ConsoleMessage.MessageType.Log,
                                                          undefined,
                                                          undefined,
                                                          undefined,
                                                          undefined,
                                                          [promise]);
            this._target.consoleModel.addMessage(message);
            WebInspector.console.show();
        }
    },

    __proto__: WebInspector.VBox.prototype
}
