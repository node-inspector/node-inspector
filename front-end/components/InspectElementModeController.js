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
    this._toggleSearchButton = new WebInspector.StatusBarButton(WebInspector.UIString("Select an element in the page to inspect it."), "node-search-status-bar-item");
    this._shortcut = WebInspector.InspectElementModeController.createShortcut();
    InspectorFrontendHost.events.addEventListener(InspectorFrontendHostAPI.Events.EnterInspectElementMode, this._toggleSearch, this);
    WebInspector.targetManager.observeTargets(this);
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
     * @param {!WebInspector.Target} target
     */
    targetAdded: function(target)
    {
        // When DevTools are opening in the inspect element mode, the first target comes in
        // much later than the InspectorFrontendAPI.enterInspectElementMode event.
        if (this.enabled())
            target.domModel.setInspectModeEnabled(true, WebInspector.settings.showUAShadowDOM.get());
    },

    /**
     * @param {!WebInspector.Target} target
     */
    targetRemoved: function(target)
    {
    },

    /**
     * @return {boolean}
     */
    enabled: function()
    {
        return this._toggleSearchButton.toggled();
    },

    disable: function()
    {
        if (this.enabled())
            this._toggleSearch();
    },

    _toggleSearch: function()
    {
        var enabled = !this.enabled();
        this._toggleSearchButton.setToggled(enabled);

        var targets = WebInspector.targetManager.targets();
        for (var i = 0; i < targets.length; ++i)
            targets[i].domModel.setInspectModeEnabled(enabled, WebInspector.settings.showUAShadowDOM.get());
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
     * @return {boolean}
     */
    handleAction: function()
    {
        if (!WebInspector.inspectElementModeController)
            return false;
        WebInspector.inspectElementModeController._toggleSearch();
        return true;
    }
}

/**
 * @constructor
 * @implements {WebInspector.StatusBarItem.Provider}
 */
WebInspector.InspectElementModeController.ToggleButtonProvider = function()
{
}

WebInspector.InspectElementModeController.ToggleButtonProvider.prototype = {
    /**
     * @return {?WebInspector.StatusBarItem}
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
