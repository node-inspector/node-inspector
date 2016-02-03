// Copyright 2015 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

/**
 * @constructor
 * @implements {WebInspector.TargetManager.Observer}
 * @param {!Element} selectElement
 */
WebInspector.ExecutionContextModel = function(selectElement)
{
    this._selectElement = selectElement;
    /**
     * @type {!Map.<!WebInspector.ExecutionContext, !Element>}
     */
    this._optionByExecutionContext = new Map();

    WebInspector.targetManager.observeTargets(this);
    WebInspector.targetManager.addModelListener(WebInspector.RuntimeModel, WebInspector.RuntimeModel.Events.ExecutionContextCreated, this._onExecutionContextCreated, this);
    WebInspector.targetManager.addModelListener(WebInspector.RuntimeModel, WebInspector.RuntimeModel.Events.ExecutionContextDestroyed, this._onExecutionContextDestroyed, this);
    WebInspector.targetManager.addModelListener(WebInspector.ResourceTreeModel, WebInspector.ResourceTreeModel.EventTypes.FrameNavigated, this._onFrameNavigated, this);

    this._selectElement.addEventListener("change", this._executionContextChanged.bind(this), false);
    WebInspector.context.addFlavorChangeListener(WebInspector.ExecutionContext, this._executionContextChangedExternally, this);
}

WebInspector.ExecutionContextModel.prototype = {
    /**
     * @param {!WebInspector.ExecutionContext} executionContext
     * @return {string}
     */
    _titleFor: function(executionContext)
    {
        var result;
        if (executionContext.isMainWorldContext) {
            if (executionContext.frameId) {
                var frame = executionContext.target().resourceTreeModel.frameForId(executionContext.frameId);
                result =  frame ? frame.displayName() : (executionContext.origin || executionContext.name);
            } else {
                var parsedUrl = executionContext.origin.asParsedURL();
                var name = parsedUrl? parsedUrl.lastPathComponentWithFragment() : executionContext.name;
                result = executionContext.target().decorateLabel(name);
            }
        } else {
            result = "\u00a0\u00a0\u00a0\u00a0" + (executionContext.name || executionContext.origin);
        }

        var maxLength = 50;
        return result.trimMiddle(maxLength);
    },

    /**
     * @param {!WebInspector.ExecutionContext} executionContext
     */
    _executionContextCreated: function(executionContext)
    {
        // FIXME(413886): We never want to show execution context for the main thread of shadow page in service/shared worker frontend.
        // This check could be removed once we do not send this context to frontend.
        if (executionContext.target().isServiceWorker())
            return;

        var newOption = createElement("option");
        newOption.__executionContext = executionContext;
        newOption.text = this._titleFor(executionContext);
        this._optionByExecutionContext.set(executionContext, newOption);
        var options = this._selectElement.options;
        var contexts = Array.prototype.map.call(options, mapping);
        var index = insertionIndexForObjectInListSortedByFunction(executionContext, contexts, WebInspector.ExecutionContext.comparator);
        this._selectElement.insertBefore(newOption, options[index]);

        if (executionContext === WebInspector.context.flavor(WebInspector.ExecutionContext))
            this._select(newOption);

        /**
         * @param {!Element} option
         * @return {!WebInspector.ExecutionContext}
         */
        function mapping(option)
        {
            return option.__executionContext;
        }
    },

    /**
     * @param {!WebInspector.Event} event
     */
    _onExecutionContextCreated: function(event)
    {
        var executionContext = /** @type {!WebInspector.ExecutionContext} */ (event.data);
        this._executionContextCreated(executionContext);
    },

    /**
     * @param {!WebInspector.ExecutionContext} executionContext
     */
    _executionContextDestroyed: function(executionContext)
    {
        var option = this._optionByExecutionContext.remove(executionContext);
        option.remove();
    },

    /**
     * @param {!WebInspector.Event} event
     */
    _onExecutionContextDestroyed: function(event)
    {
        var executionContext = /** @type {!WebInspector.ExecutionContext} */ (event.data);
        this._executionContextDestroyed(executionContext);
    },

    /**
     * @param {!WebInspector.Event} event
     */
    _onFrameNavigated: function(event)
    {
        var frame = /** @type {!WebInspector.ResourceTreeFrame} */ (event.data);
        var executionContexts = this._optionByExecutionContext.keysArray();
        for (var i = 0; i < executionContexts.length; ++i) {
            var context = executionContexts[i];
            if (context.frameId === frame.id)
                this._optionByExecutionContext.get(context).text = this._titleFor(context);
        }
    },

    /**
     * @param {!WebInspector.Event} event
     */
    _executionContextChangedExternally: function(event)
    {
        var executionContext =  /** @type {?WebInspector.ExecutionContext} */ (event.data);
        if (!executionContext)
            return;

        var options = this._selectElement.options;
        for (var i = 0; i < options.length; ++i) {
            if (options[i].__executionContext === executionContext)
                this._select(options[i]);
        }
    },

    _executionContextChanged: function()
    {
        var option = this._selectedOption();
        var newContext = option ? option.__executionContext : null;
        WebInspector.context.setFlavor(WebInspector.ExecutionContext, newContext);
    },

    /**
     * @override
     * @param {!WebInspector.Target} target
     */
    targetAdded: function(target)
    {
        target.runtimeModel.executionContexts().forEach(this._executionContextCreated, this);
    },

    /**
     * @override
     * @param {!WebInspector.Target} target
     */
    targetRemoved: function(target)
    {
        var executionContexts = this._optionByExecutionContext.keysArray();
        for (var i = 0; i < executionContexts.length; ++i) {
            if (executionContexts[i].target() === target)
                this._executionContextDestroyed(executionContexts[i]);
        }
    },

    /**
     * @param {!Element} option
     */
    _select: function(option)
    {
        this._selectElement.selectedIndex = Array.prototype.indexOf.call(/** @type {?} */ (this._selectElement), option);
    },

    /**
     * @return {?Element}
     */
    _selectedOption: function()
    {
        if (this._selectElement.selectedIndex >= 0)
            return this._selectElement[this._selectElement.selectedIndex];
        return null;
    }
}
