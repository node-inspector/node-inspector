// Copyright 2014 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

/**
 * @constructor
 * @extends {WebInspector.SidebarPane}
 * @implements {WebInspector.TargetManager.Observer}
 */
WebInspector.ThreadsSidebarPane = function()
{
    WebInspector.SidebarPane.call(this, WebInspector.UIString("Threads"));
    /** @type {!Map.<!WebInspector.Target, !WebInspector.Placard>} */
    this._targetsToPlacards = new Map();
    /** @type {!Map.<!WebInspector.Placard, !WebInspector.Target>} */
    this._placardsToTargets = new Map();
    /** @type {?WebInspector.Placard} */
    this._selectedPlacard = null;
    WebInspector.targetManager.addModelListener(WebInspector.DebuggerModel, WebInspector.DebuggerModel.Events.DebuggerPaused, this._onDebuggerStateChanged, this);
    WebInspector.targetManager.addModelListener(WebInspector.DebuggerModel, WebInspector.DebuggerModel.Events.DebuggerResumed, this._onDebuggerStateChanged, this);
    WebInspector.context.addFlavorChangeListener(WebInspector.Target, this._targetChanged, this);
    WebInspector.targetManager.observeTargets(this);
}

WebInspector.ThreadsSidebarPane.prototype = {

    /**
     * @param {!WebInspector.Target} target
     */
    targetAdded: function(target)
    {
        var placard = new WebInspector.Placard(target.name(), "");
        placard.element.addEventListener("click", this._onPlacardClick.bind(this, placard), false);
        var currentTarget = WebInspector.context.flavor(WebInspector.Target);
        if (currentTarget === target)
            this._selectPlacard(placard);

        this._targetsToPlacards.set(target, placard);
        this._placardsToTargets.set(placard, target);
        this.bodyElement.appendChild(placard.element);
        this._updateDebuggerState(target);
    },

    /**
     * @param {!WebInspector.Target} target
     */
    targetRemoved: function(target)
    {
        var placard = this._targetsToPlacards.remove(target);
        this._placardsToTargets.remove(placard);
        this.bodyElement.removeChild(placard.element);
    },

    /**
     * @param {!WebInspector.Event} event
     */
    _targetChanged: function(event)
    {
        var newTarget = /** @type {!WebInspector.Target} */(event.data);
        var placard =  /** @type {!WebInspector.Placard} */ (this._targetsToPlacards.get(newTarget));
        this._selectPlacard(placard);
    },

    /**
     * @param {!WebInspector.Event} event
     */
    _onDebuggerStateChanged: function(event)
    {
        var debuggerModel = /** @type {!WebInspector.DebuggerModel} */ (event.target);
        this._updateDebuggerState(debuggerModel.target());
    },

    /**
     * @param {!WebInspector.Target} target
     */
    _updateDebuggerState: function(target)
    {
        var placard = this._targetsToPlacards.get(target);
        placard.subtitle = target.debuggerModel.isPaused() ? WebInspector.UIString("paused") : WebInspector.UIString("");
    },

    /**
     * @param {!WebInspector.Placard} placard
     */
    _selectPlacard: function(placard)
    {
        if (placard === this._selectedPlacard)
            return;

        if (this._selectedPlacard)
            this._selectedPlacard.selected = false;

        this._selectedPlacard = placard;
        placard.selected = true;
    },

    /**
     * @param {!WebInspector.Placard} placard
     */
    _onPlacardClick: function(placard)
    {
        WebInspector.context.setFlavor(WebInspector.Target, this._placardsToTargets.get(placard));
        placard.element.scrollIntoViewIfNeeded();
    },


    __proto__: WebInspector.SidebarPane.prototype
}