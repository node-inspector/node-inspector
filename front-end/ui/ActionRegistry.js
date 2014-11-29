// Copyright 2014 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

/**
 * @constructor
 */
WebInspector.ActionRegistry = function()
{
    /** @type {!Map.<string, !Runtime.Extension>} */
    this._actionsById = new Map();
    this._registerActions();
}

WebInspector.ActionRegistry.prototype = {
    _registerActions: function()
    {
        self.runtime.extensions(WebInspector.ActionDelegate).forEach(registerExtension, this);

        /**
         * @param {!Runtime.Extension} extension
         * @this {WebInspector.ActionRegistry}
         */
        function registerExtension(extension)
        {
            var actionId = extension.descriptor()["actionId"];
            console.assert(actionId);
            console.assert(!this._actionsById.get(actionId));
            this._actionsById.set(actionId, extension);
        }
    },

    /**
     * @param {!Array.<string>} actionIds
     * @param {!WebInspector.Context} context
     * @return {!Array.<string>}
     */
    applicableActions: function(actionIds, context)
    {
        var extensions = [];
        actionIds.forEach(function(actionId) {
           var extension = this._actionsById.get(actionId);
           if (extension)
               extensions.push(extension);
        }, this);
        return context.applicableExtensions(extensions).valuesArray().map(function(extension) {
            return extension.descriptor()["actionId"];
        });
    },

    /**
     * @param {string} actionId
     * @return {!Promise.<boolean>}
     */
    execute: function(actionId)
    {
        var extension = this._actionsById.get(actionId);
        console.assert(extension, "No action found for actionId '" + actionId + "'");
        return extension.instancePromise().then(handleAction);

        /**
         * @param {!Object} actionDelegate
         * @return {boolean}
         */
        function handleAction(actionDelegate)
        {
            return /** @type {!WebInspector.ActionDelegate} */(actionDelegate).handleAction(WebInspector.context);
        }
    }
}

/**
 * @interface
 */
WebInspector.ActionDelegate = function()
{
}

WebInspector.ActionDelegate.prototype = {
    /**
     * @param {!WebInspector.Context} context
     * @return {boolean} True if handled. Note that lazily loaded modules won't be able to consume
     *                   platform events from their actions.
     */
    handleAction: function(context) {}
}

/** @type {!WebInspector.ActionRegistry} */
WebInspector.actionRegistry;
