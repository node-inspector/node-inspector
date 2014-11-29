// Copyright 2014 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

/**
 * @constructor
 */
WebInspector.Context = function()
{
    this._flavors = new Map();
    this._eventDispatchers = new Map();
}

/**
 * @enum {string}
 */
WebInspector.Context.Events = {
    FlavorChanged: "FlavorChanged"
}

WebInspector.Context.prototype = {
    /**
     * @param {function(new:T, ...)} flavorType
     * @param {?T} flavorValue
     * @template T
     */
    setFlavor: function(flavorType, flavorValue)
    {
        var value = this._flavors.get(flavorType) || null;
        if (value === flavorValue)
            return;
        if (flavorValue)
            this._flavors.set(flavorType, flavorValue);
        else
            this._flavors.remove(flavorType);

        this._dispatchFlavorChange(flavorType, flavorValue);
    },

    /**
     * @param {function(new:T, ...)} flavorType
     * @param {?T} flavorValue
     * @template T
     */
    _dispatchFlavorChange: function(flavorType, flavorValue)
    {
        var dispatcher = this._eventDispatchers.get(flavorType);
        if (!dispatcher)
            return;
        dispatcher.dispatchEventToListeners(WebInspector.Context.Events.FlavorChanged, flavorValue);
    },

    /**
     * @param {function(new:Object, ...)} flavorType
     * @param {function(!WebInspector.Event)} listener
     * @param {!Object=} thisObject
     */
    addFlavorChangeListener: function(flavorType, listener, thisObject)
    {
        var dispatcher = this._eventDispatchers.get(flavorType);
        if (!dispatcher) {
            dispatcher = new WebInspector.Object();
            this._eventDispatchers.set(flavorType, dispatcher);
        }
        dispatcher.addEventListener(WebInspector.Context.Events.FlavorChanged, listener, thisObject);
    },

    /**
     * @param {function(new:Object, ...)} flavorType
     * @param {function(!WebInspector.Event)} listener
     * @param {!Object=} thisObject
     */
    removeFlavorChangeListener: function(flavorType, listener, thisObject)
    {
        var dispatcher = this._eventDispatchers.get(flavorType);
        if (!dispatcher)
            return;
        dispatcher.removeEventListener(WebInspector.Context.Events.FlavorChanged, listener, thisObject);
        if (!dispatcher.hasEventListeners(WebInspector.Context.Events.FlavorChanged))
            this._eventDispatchers.remove(flavorType);
    },

    /**
     * @param {function(new:T, ...)} flavorType
     * @return {?T}
     * @template T
     */
    flavor: function(flavorType)
    {
        return this._flavors.get(flavorType) || null;
    },

    /**
     * @return {!Set.<function(new:Object, ...)>}
     */
    flavors: function()
    {
        return new Set(this._flavors.keys());
    },

    /**
     * @param {!Array.<!Runtime.Extension>} extensions
     * @return {!Set.<!Runtime.Extension>}
     */
    applicableExtensions: function(extensions)
    {
        var targetExtensionSet = new Set();

        var availableFlavors = this.flavors();
        extensions.forEach(function(extension) {
            if (self.runtime.isExtensionApplicableToContextTypes(extension, availableFlavors))
                targetExtensionSet.add(extension);
        });

        return targetExtensionSet;
    }
}

WebInspector.context = new WebInspector.Context();