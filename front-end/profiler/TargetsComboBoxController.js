// Copyright 2014 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

/**
 * @constructor
 * @implements {WebInspector.TargetManager.Observer}
 * @param {!Element} selectElement
 * @param {!Element} elementToHide
 */
WebInspector.TargetsComboBoxController = function(selectElement, elementToHide)
{
    elementToHide.classList.add("hidden");
    selectElement.addEventListener("change", this._onComboBoxSelectionChange.bind(this), false);
    this._selectElement = selectElement;
    this._elementToHide = elementToHide;
    /** @type {!Map.<!WebInspector.Target, !Element>} */
    this._targetToOption = new Map();

    WebInspector.context.addFlavorChangeListener(WebInspector.Target, this._targetChangedExternally, this);
    WebInspector.targetManager.observeTargets(this);
}

WebInspector.TargetsComboBoxController.prototype = {

    /**
     * @override
     * @param {!WebInspector.Target} target
     */
    targetAdded: function(target)
    {
        if (!target.hasJSContext())
            return;
        var option = this._selectElement.createChild("option");
        option.text = target.name();
        option.__target = target;
        this._targetToOption.set(target, option);
        if (WebInspector.context.flavor(WebInspector.Target) === target)
            this._selectElement.selectedIndex = Array.prototype.indexOf.call(/** @type {?} */ (this._selectElement), option);

        this._updateVisibility();
    },

    /**
     * @override
     * @param {!WebInspector.Target} target
     */
    targetRemoved: function(target)
    {
        if (!target.hasJSContext())
            return;
        var option = this._targetToOption.remove(target);
        this._selectElement.removeChild(option);
        this._updateVisibility();
    },

    _onComboBoxSelectionChange: function()
    {
        var selectedOption = this._selectElement[this._selectElement.selectedIndex];
        if (!selectedOption)
            return;

        WebInspector.context.setFlavor(WebInspector.Target, selectedOption.__target);
    },

    _updateVisibility: function()
    {
        var hidden = this._selectElement.childElementCount === 1;
        this._elementToHide.classList.toggle("hidden", hidden);
    },

    /**
     * @param {!WebInspector.Event} event
     */
    _targetChangedExternally: function(event)
    {
        var target = /** @type {?WebInspector.Target} */ (event.data);
        if (target) {
            var option = /** @type {!Element} */ (this._targetToOption.get(target));
            this._select(option);
        }
    },

    /**
     * @param {!Element} option
     */
    _select: function(option)
    {
        this._selectElement.selectedIndex = Array.prototype.indexOf.call(/** @type {?} */ (this._selectElement), option);
    }

}
