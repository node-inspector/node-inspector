/*
 * Copyright (C) 2013 Google Inc. All rights reserved.
 *
 * Redistribution and use in source and binary forms, with or without
 * modification, are permitted provided that the following conditions are
 * met:
 *
 * 1. Redistributions of source code must retain the above copyright
 * notice, this list of conditions and the following disclaimer.
 *
 * 2. Redistributions in binary form must reproduce the above
 * copyright notice, this list of conditions and the following disclaimer
 * in the documentation and/or other materials provided with the
 * distribution.
 *
 * THIS SOFTWARE IS PROVIDED BY GOOGLE INC. AND ITS CONTRIBUTORS
 * "AS IS" AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT
 * LIMITED TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR
 * A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL GOOGLE INC.
 * OR ITS CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL,
 * SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT
 * LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE,
 * DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY
 * THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT
 * (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE
 * OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
 */

/**
 * @constructor
 * @implements {WebInspector.TargetManager.Observer}
 */
WebInspector.InspectElementModeController = function()
{
    this._toggleSearchButton = new WebInspector.ToolbarButton(WebInspector.UIString("Select an element in the page to inspect it"), "node-search-toolbar-item");
    InspectorFrontendHost.events.addEventListener(InspectorFrontendHostAPI.Events.EnterInspectElementMode, this._toggleSearch, this);
    WebInspector.targetManager.addEventListener(WebInspector.TargetManager.Events.SuspendStateChanged, this._suspendStateChanged, this);
    WebInspector.targetManager.observeTargets(this, WebInspector.Target.Type.Page);
}

/**
 * @return {!WebInspector.KeyboardShortcut.Descriptor}
 */
WebInspector.InspectElementModeController.createShortcut = function()
{
    return WebInspector.KeyboardShortcut.makeDescriptor("c", WebInspector.KeyboardShortcut.Modifiers.CtrlOrMeta | WebInspector.KeyboardShortcut.Modifiers.Shift);
}

WebInspector.InspectElementModeController.prototype = {
    /**
     * @override
     * @param {!WebInspector.Target} target
     */
    targetAdded: function(target)
    {
        // When DevTools are opening in the inspect element mode, the first target comes in
        // much later than the InspectorFrontendAPI.enterInspectElementMode event.
        if (!this.started())
            return;
        var domModel = WebInspector.DOMModel.fromTarget(target);
        domModel.setInspectMode(WebInspector.moduleSetting("showUAShadowDOM").get() ? DOMAgent.InspectMode.SearchForUAShadowDOM : DOMAgent.InspectMode.SearchForNode);
    },

    /**
     * @override
     * @param {!WebInspector.Target} target
     */
    targetRemoved: function(target)
    {
    },

    /**
     * @return {boolean}
     */
    started: function()
    {
        return this._toggleSearchButton.toggled();
    },

    stop: function()
    {
        if (this.started())
            this._toggleSearch();
    },

    disable: function()
    {
        this.stop();
        this._toggleSearchButton.setEnabled(false);
    },

    enable: function()
    {
        this._toggleSearchButton.setEnabled(true);
    },

    _toggleSearch: function()
    {
        if (!this._toggleSearchButton.enabled())
            return;

        var shouldEnable = !this.started();
        this._toggleSearchButton.setToggled(shouldEnable);

        for (var domModel of WebInspector.DOMModel.instances()) {
            var mode;
            if (!shouldEnable)
                mode = DOMAgent.InspectMode.None;
            else if (WebInspector.moduleSetting("showUAShadowDOM").get())
                mode = DOMAgent.InspectMode.SearchForUAShadowDOM;
            else
                mode = DOMAgent.InspectMode.SearchForNode;

            domModel.setInspectMode(mode);
        }
    },

    _suspendStateChanged: function()
    {
        if (WebInspector.targetManager.allTargetsSuspended())
            this._toggleSearchButton.setToggled(false);
    }
}

/**
 * @constructor
 * @implements {WebInspector.ActionDelegate}
 */
WebInspector.InspectElementModeController.ToggleSearchActionDelegate = function()
{
}

WebInspector.InspectElementModeController.ToggleSearchActionDelegate.prototype = {
    /**
     * @override
     * @param {!WebInspector.Context} context
     * @param {string} actionId
     */
    handleAction: function(context, actionId)
    {
        if (!WebInspector.inspectElementModeController)
            return;
        WebInspector.inspectElementModeController._toggleSearch();
    }
}

/**
 * @constructor
 * @implements {WebInspector.ToolbarItem.Provider}
 */
WebInspector.InspectElementModeController.ToggleButtonProvider = function()
{
}

WebInspector.InspectElementModeController.ToggleButtonProvider.prototype = {
    /**
     * @override
     * @return {?WebInspector.ToolbarItem}
     */
    item: function()
    {
        if (!WebInspector.inspectElementModeController)
            return null;

        return WebInspector.inspectElementModeController._toggleSearchButton;
    }
}

/** @type {?WebInspector.InspectElementModeController} */
WebInspector.inspectElementModeController = null;
