// Copyright 2015 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

/**
 * @constructor
 * @extends {WebInspector.BreakpointsSidebarPaneBase}
 * @implements {WebInspector.TargetManager.Observer}
 */
WebInspector.AsyncOperationsSidebarPane = function()
{
    WebInspector.BreakpointsSidebarPaneBase.call(this, WebInspector.UIString("Async Operation Breakpoints"));
    this.element.classList.add("async-operations");
    this._updateEmptyElement();

    var refreshButton = new WebInspector.ToolbarButton(WebInspector.UIString("Refresh"), "refresh-toolbar-item");
    refreshButton.addEventListener("click", this._refreshButtonClicked.bind(this));
    this.toolbar().appendToolbarItem(refreshButton);

    /** @type {!Map.<!WebInspector.Target, !Map.<number, !DebuggerAgent.AsyncOperation>>} */
    this._asyncOperationsByTarget = new Map();
    /** @type {!Map.<number, !Element>} */
    this._operationIdToElement = new Map();

    this._revealBlackboxedCallFrames = false;
    this._linkifier = new WebInspector.Linkifier(new WebInspector.Linkifier.DefaultFormatter(30));

    this._popoverHelper = new WebInspector.PopoverHelper(this.element, this._getPopoverAnchor.bind(this), this._showPopover.bind(this));
    this._popoverHelper.setTimeout(250, 250);
    this.element.addEventListener("click", this._hidePopover.bind(this), true);

    WebInspector.targetManager.addModelListener(WebInspector.DebuggerModel, WebInspector.DebuggerModel.Events.AsyncOperationStarted, this._onAsyncOperationStarted, this);
    WebInspector.targetManager.addModelListener(WebInspector.DebuggerModel, WebInspector.DebuggerModel.Events.AsyncOperationCompleted, this._onAsyncOperationCompleted, this);
    WebInspector.targetManager.addModelListener(WebInspector.DebuggerModel, WebInspector.DebuggerModel.Events.DebuggerResumed, this._debuggerResumed, this);
    WebInspector.targetManager.addModelListener(WebInspector.DebuggerModel, WebInspector.DebuggerModel.Events.GlobalObjectCleared, this._debuggerReset, this);
    WebInspector.context.addFlavorChangeListener(WebInspector.Target, this._targetChanged, this);

    WebInspector.moduleSetting("skipStackFramesPattern").addChangeListener(this._refresh, this);
    WebInspector.moduleSetting("enableAsyncStackTraces").addChangeListener(this._asyncStackTracesStateChanged, this);

    WebInspector.targetManager.observeTargets(this);
}

WebInspector.AsyncOperationsSidebarPane.prototype = {
    _operationIdSymbol: Symbol("operationId"),
    _checkedSymbol: Symbol("checked"),

    /**
     * @override
     * @param {!WebInspector.Target} target
     */
    targetAdded: function(target)
    {
    },

    /**
     * @override
     * @param {!WebInspector.Target} target
     */
    targetRemoved: function(target)
    {
        this._asyncOperationsByTarget.delete(target);
        if (this._target === target) {
            this._clear();
            delete this._target;
        }
    },

    /**
     * @param {!WebInspector.Event} event
     */
    _targetChanged: function(event)
    {
        var target = /** @type {!WebInspector.Target} */ (event.data);
        if (this._target === target)
            return;
        this._target = target;
        this._refresh();
    },

    /**
     * @param {?WebInspector.Target} target
     * @param {number} operationId
     * @return {?DebuggerAgent.AsyncOperation}
     */
    operationById: function(target, operationId)
    {
        if (!target)
            return null;
        var operationsMap = this._asyncOperationsByTarget.get(target);
        if (!operationsMap)
            return null;
        return operationsMap.get(operationId) || null;
    },

    _asyncStackTracesStateChanged: function()
    {
        var enabled = WebInspector.moduleSetting("enableAsyncStackTraces").get();
        if (enabled) {
            this._target = WebInspector.context.flavor(WebInspector.Target);
        } else if (this._target) {
            this._asyncOperationsByTarget.delete(this._target);
            delete this._target;
        }
        this._updateEmptyElement();
        this._refresh();
    },

    _updateEmptyElement: function()
    {
        var enabled = WebInspector.moduleSetting("enableAsyncStackTraces").get();
        if (enabled) {
            this.emptyElement.textContent = WebInspector.UIString("No Async Operations");
        } else {
            this.emptyElement.textContent = WebInspector.UIString("Async stack traces are disabled.");
            this.emptyElement.createTextChild(" ");
            var enableLink = this.emptyElement.createChild("span", "link");
            enableLink.textContent = WebInspector.UIString("Enable");
            enableLink.addEventListener("click", enableAsyncStackTraces, true);
        }

        function enableAsyncStackTraces()
        {
            WebInspector.moduleSetting("enableAsyncStackTraces").set(true);
        }
    },

    /** @override */
    wasShown: function()
    {
        if (!this._target && WebInspector.moduleSetting("enableAsyncStackTraces").get()) {
            this._target = WebInspector.context.flavor(WebInspector.Target);
            this._refresh();
        }
    },

    /** @override */
    willHide: function()
    {
        this._hidePopover();
    },

    /** @override */
    onResize: function()
    {
        this._hidePopover();
    },

    /**
     * @param {!WebInspector.Target} target
     */
    revealHiddenCallFrames: function(target)
    {
        if (this._target !== target || this._revealBlackboxedCallFrames)
            return;
        this._revealBlackboxedCallFrames = true;
        this._refresh();
    },

    /**
     * @param {number} operationId
     */
    highlightBreakpoint: function(operationId)
    {
        this._breakpointHitId = operationId;
        var element = this._operationIdToElement.get(operationId);
        if (!element)
            return;
        this.expand();
        element.classList.add("breakpoint-hit");
    },

    clearBreakpointHighlight: function()
    {
        if (!this._breakpointHitId)
            return;
        var element = this._operationIdToElement.get(this._breakpointHitId);
        if (element)
            element.classList.remove("breakpoint-hit");
        delete this._breakpointHitId;
    },

    /**
     * @param {!WebInspector.Event} event
     */
    _debuggerResumed: function(event)
    {
        var target = /** @type {!WebInspector.Target} */  (event.target.target());
        if (this._target !== target || !this._revealBlackboxedCallFrames)
            return;
        this._revealBlackboxedCallFrames = false;
        this._refresh();
    },

    /**
     * @param {!WebInspector.Event} event
     */
    _debuggerReset: function(event)
    {
        var target = /** @type {!WebInspector.Target} */ (event.target.target());
        this._asyncOperationsByTarget.delete(target);
        if (this._target === target)
            this._clear();
    },

    /**
     * @param {!WebInspector.Event} event
     */
    _refreshButtonClicked: function(event)
    {
        event.consume();
        this.expand();
        var debuggerModel = WebInspector.DebuggerModel.fromTarget(this._target);
        if (debuggerModel)
            debuggerModel.flushAsyncOperationEvents();
    },

    /**
     * @param {!WebInspector.Event} event
     */
    _onAsyncOperationStarted: function(event)
    {
        var target = /** @type {!WebInspector.Target} */ (event.target.target());
        var operation = /** @type {!DebuggerAgent.AsyncOperation} */ (event.data);

        var operationsMap = this._asyncOperationsByTarget.get(target);
        if (!operationsMap) {
            operationsMap = new Map();
            this._asyncOperationsByTarget.set(target, operationsMap)
        }
        operationsMap.set(operation.id, operation);

        if (this._target === target)
            this._createAsyncOperationItem(operation);
    },

    /**
     * @param {!WebInspector.Event} event
     */
    _onAsyncOperationCompleted: function(event)
    {
        var target = /** @type {!WebInspector.Target} */ (event.target.target());
        var operationId = /** @type {number} */ (event.data);

        var operationsMap = this._asyncOperationsByTarget.get(target);
        if (operationsMap)
            operationsMap.delete(operationId);

        if (this._target === target) {
            var element = this._operationIdToElement.get(operationId);
            if (element)
                this.removeListElement(element);
            this._operationIdToElement.delete(operationId);
            if (!this._operationIdToElement.size)
                this._clear();
        }
    },

    _refresh: function()
    {
        this._clear();
        if (!this._target)
            return;
        var operationsMap = this._asyncOperationsByTarget.get(this._target);
        if (!operationsMap || !operationsMap.size)
            return;

        // The for..of loop iterates in insertion order.
        for (var pair of operationsMap) {
            var operation = /** @type {!DebuggerAgent.AsyncOperation} */ (pair[1]);
            this._createAsyncOperationItem(operation);
        }
    },

    /**
     * @param {!DebuggerAgent.AsyncOperation} operation
     */
    _createAsyncOperationItem: function(operation)
    {
        var element = createElementWithClass("li", "async-operation");

        var title = operation.description || WebInspector.UIString("Async Operation");
        var label = createCheckboxLabel(title, operation[this._checkedSymbol]);
        label.checkboxElement.addEventListener("click", this._checkboxClicked.bind(this, operation.id), false);
        element.appendChild(label);
        var debuggerModel = WebInspector.DebuggerModel.fromTarget(this._target);
        var callFrame = WebInspector.DebuggerPresentationUtils.callFrameAnchorFromStackTrace(debuggerModel, operation.stackTrace, operation.asyncStackTrace, this._revealBlackboxedCallFrames);
        if (callFrame)
            element.createChild("div").appendChild(this._linkifier.linkifyConsoleCallFrame(this._target, callFrame));

        element[this._operationIdSymbol] = operation.id;
        this._operationIdToElement.set(operation.id, element);
        this.addListElement(element, this.listElement.firstChild);

        if (operation.id === this._breakpointHitId) {
            element.classList.add("breakpoint-hit");
            this.expand();
        }
    },

    /**
     * @param {number} operationId
     * @param {!Event} event
     */
    _checkboxClicked: function(operationId, event)
    {
        var operation = this.operationById(this._target, operationId);
        if (!operation)
            return;
        var debuggerModel = WebInspector.DebuggerModel.fromTarget(this._target);
        if (!debuggerModel)
            return;
        operation[this._checkedSymbol] = event.target.checked;
        if (event.target.checked)
            debuggerModel.setAsyncOperationBreakpoint(operationId);
        else
            debuggerModel.removeAsyncOperationBreakpoint(operationId);
    },

    _clear: function()
    {
        this._hidePopover();
        this.reset();
        this._operationIdToElement.clear();
        this._linkifier.reset();
    },

    _hidePopover: function()
    {
        this._popoverHelper.hidePopover();
    },

    /**
     * @param {!Element} element
     * @param {!Event} event
     * @return {!Element|!AnchorBox|undefined}
     */
    _getPopoverAnchor: function(element, event)
    {
        var anchor = /** @type {?Element} */ (element.enclosingNodeOrSelfWithNodeName("a"));
        if (!anchor)
            return undefined;
        var operation = this._operationForPopover(anchor);
        return operation ? anchor : undefined;
    },

    /**
     * @param {!Element} anchor
     * @param {!WebInspector.Popover} popover
     */
    _showPopover: function(anchor, popover)
    {
        var operation = this._operationForPopover(anchor);
        if (!operation)
            return;
        var content = WebInspector.DOMPresentationUtils.buildStackTracePreviewContents(this._target, this._linkifier, operation.stackTrace, operation.asyncStackTrace);
        popover.setCanShrink(true);
        popover.showForAnchor(content, anchor);
    },

    /**
     * @param {!Element} element
     * @return {?DebuggerAgent.AsyncOperation}
     */
    _operationForPopover: function(element)
    {
        var asyncOperations = this._target && this._asyncOperationsByTarget.get(this._target);
        if (!asyncOperations)
            return null;
        var anchor = element.enclosingNodeOrSelfWithClass("async-operation");
        if (!anchor)
            return null;
        var operationId = anchor[this._operationIdSymbol];
        var operation = operationId && asyncOperations.get(operationId);
        if (!operation || !operation.stackTrace)
            return null;
        return operation;
    },

    __proto__: WebInspector.BreakpointsSidebarPaneBase.prototype
}
