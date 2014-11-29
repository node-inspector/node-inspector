// Copyright 2014 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

/**
 * @constructor
 * @param {!WebInspector.ActionRegistry} actionRegistry
 * @param {!Document} document
 */
WebInspector.ShortcutRegistry = function(actionRegistry, document)
{
    this._actionRegistry = actionRegistry;
    /** @type {!StringMultimap.<string>} */
    this._defaultKeyToActions = new StringMultimap();
    /** @type {!StringMultimap.<!WebInspector.KeyboardShortcut.Descriptor>} */
    this._defaultActionToShortcut = new StringMultimap();
    this._registerBindings(document);
}

WebInspector.ShortcutRegistry.prototype = {
    /**
     * @param {number} key
     * @return {!Array.<string>}
     */
    applicableActions: function(key)
    {
        return this._actionRegistry.applicableActions(this._defaultActionsForKey(key).valuesArray(), WebInspector.context);
    },

    /**
     * @param {number} key
     * @return {!Set.<string>}
     */
    _defaultActionsForKey: function(key)
    {
        return this._defaultKeyToActions.get(String(key));
    },

    /**
     * @param {string} actionId
     * @return {!Array.<!WebInspector.KeyboardShortcut.Descriptor>}
     */
    shortcutDescriptorsForAction: function(actionId)
    {
        return this._defaultActionToShortcut.get(actionId).valuesArray();
    },

    /**
     * @param {!Array.<string>} actionIds
     * @return {!Array.<number>}
     */
    keysForActions: function(actionIds)
    {
        var result = [];
        for (var i = 0; i < actionIds.length; ++i) {
            var descriptors = this.shortcutDescriptorsForAction(actionIds[i]);
            for (var j = 0; j < descriptors.length; ++j)
                result.push(descriptors[j].key);
        }
        return result;
    },

    /**
     * @param {!KeyboardEvent} event
     */
    handleShortcut: function(event)
    {
        this.handleKey(WebInspector.KeyboardShortcut.makeKeyFromEvent(event), event.keyIdentifier, event);
    },

    /**
     * @param {number} key
     * @param {string} keyIdentifier
     * @param {!KeyboardEvent=} event
     */
    handleKey: function(key, keyIdentifier, event)
    {
        var keyModifiers = key >> 8;
        var actionIds = this.applicableActions(key);
        if (!actionIds.length)
            return;
        if (WebInspector.GlassPane.DefaultFocusedViewStack.length > 1) {
            if (event && !isPossiblyInputKey())
                event.consume(true);
            return;
        }

        if (!isPossiblyInputKey()) {
            if (event)
                event.consume(true);
            processActionIdsSequentially.call(this);
        } else {
            this._pendingActionTimer = setTimeout(processActionIdsSequentially.bind(this), 0);
        }

        /**
         * @this {WebInspector.ShortcutRegistry}
         */
        function processActionIdsSequentially()
        {
            delete this._pendingActionTimer;
            var actionId = actionIds.shift();
            if (!actionId)
                return;

            this._actionRegistry.execute(actionId).then(continueIfNecessary.bind(this));

            /**
             * @this {WebInspector.ShortcutRegistry}
             */
            function continueIfNecessary(result)
            {
                if (result)
                    return;
                processActionIdsSequentially.call(this);
            }
        }

        /**
         * @return {boolean}
         */
        function isPossiblyInputKey()
        {
            if (!event || !WebInspector.isEditing() || /^F\d+|Control|Shift|Alt|Meta|Win|U\+001B$/.test(keyIdentifier))
                return false;

            if (!keyModifiers)
                return true;

            var modifiers = WebInspector.KeyboardShortcut.Modifiers;
            if ((keyModifiers & (modifiers.Ctrl | modifiers.Alt)) === (modifiers.Ctrl | modifiers.Alt))
                return WebInspector.isWin();

            return !hasModifier(modifiers.Ctrl) && !hasModifier(modifiers.Alt) && !hasModifier(modifiers.Meta);
        }

        /**
         * @param {number} mod
         * @return {boolean}
         */
        function hasModifier(mod)
        {
            return !!(keyModifiers & mod);
        }
    },

    /**
     * @param {string} actionId
     * @param {string} shortcut
     */
    registerShortcut: function(actionId, shortcut)
    {
        var descriptor = WebInspector.KeyboardShortcut.makeDescriptorFromBindingShortcut(shortcut);
        if (!descriptor)
            return;
        this._defaultActionToShortcut.set(actionId, descriptor);
        this._defaultKeyToActions.set(String(descriptor.key), actionId);
    },

    dismissPendingShortcutAction: function()
    {
        if (this._pendingActionTimer) {
            clearTimeout(this._pendingActionTimer);
            delete this._pendingActionTimer;
        }
    },

    /**
     * @param {!Document} document
     */
    _registerBindings: function(document)
    {
        document.addEventListener("input", this.dismissPendingShortcutAction.bind(this), true);
        var extensions = self.runtime.extensions(WebInspector.ActionDelegate);
        extensions.forEach(registerExtension, this);

        /**
         * @param {!Runtime.Extension} extension
         * @this {WebInspector.ShortcutRegistry}
         */
        function registerExtension(extension)
        {
            var descriptor = extension.descriptor();
            var bindings = descriptor["bindings"];
            for (var i = 0; bindings && i < bindings.length; ++i) {
                if (!platformMatches(bindings[i].platform))
                    continue;
                var shortcuts = bindings[i]["shortcut"].split(/\s+/);
                shortcuts.forEach(this.registerShortcut.bind(this, descriptor["actionId"]));
            }
        }

        /**
         * @param {string=} platformsString
         * @return {boolean}
         */
        function platformMatches(platformsString)
        {
            if (!platformsString)
                return true;
            var platforms = platformsString.split(",");
            var isMatch = false;
            var currentPlatform = WebInspector.platform();
            for (var i = 0; !isMatch && i < platforms.length; ++i)
                isMatch = platforms[i] === currentPlatform;
            return isMatch;
        }
    }
}

/**
 * @constructor
 */
WebInspector.ShortcutRegistry.ForwardedShortcut = function()
{
}

WebInspector.ShortcutRegistry.ForwardedShortcut.instance = new WebInspector.ShortcutRegistry.ForwardedShortcut();

/** @type {!WebInspector.ShortcutRegistry} */
WebInspector.shortcutRegistry;
