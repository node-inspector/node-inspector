// Copyright 2014 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

/**
 * @constructor
 */
WebInspector.InplaceEditor = function()
{
}

/**
 * @typedef {{cancel: function(), commit: function(), setWidth: function(number)}}
 */
WebInspector.InplaceEditor.Controller;

/**
 * @param {!Element} element
 * @param {!WebInspector.InplaceEditor.Config=} config
 * @return {?WebInspector.InplaceEditor.Controller}
 */
WebInspector.InplaceEditor.startEditing = function(element, config)
{
    if (!WebInspector.InplaceEditor._defaultInstance)
        WebInspector.InplaceEditor._defaultInstance = new WebInspector.InplaceEditor();
    return WebInspector.InplaceEditor._defaultInstance.startEditing(element, config);
}

/**
 * @param {!Element} element
 * @param {!WebInspector.InplaceEditor.Config=} config
 * @return {!Promise.<!WebInspector.InplaceEditor.Controller>}
 */
WebInspector.InplaceEditor.startMultilineEditing = function(element, config)
{
    return self.runtime.instancePromise(WebInspector.InplaceEditor).then(startEditing);

    /**
     * @param {!Object} inplaceEditor
     * @return {!WebInspector.InplaceEditor.Controller|!Promise.<!WebInspector.InplaceEditor.Controller>}
     */
    function startEditing(inplaceEditor)
    {
        var controller = /** @type {!WebInspector.InplaceEditor} */ (inplaceEditor).startEditing(element, config);
        if (!controller)
            return Promise.reject(new Error("Editing is already in progress"));
        return controller;
    }
}

WebInspector.InplaceEditor.prototype = {
    /**
     * @return {string}
     */
    editorContent: function(editingContext) {
        var element = editingContext.element;
        if (element.tagName === "INPUT" && element.type === "text")
            return element.value;

        return element.textContent;
    },

    setUpEditor: function(editingContext)
    {
        var element = editingContext.element;
        element.classList.add("editing");

        var oldTabIndex = element.getAttribute("tabIndex");
        if (typeof oldTabIndex !== "number" || oldTabIndex < 0)
            element.tabIndex = 0;
        WebInspector.setCurrentFocusElement(element);
        editingContext.oldTabIndex = oldTabIndex;
    },

    closeEditor: function(editingContext)
    {
        var element = editingContext.element;
        element.classList.remove("editing");

        if (typeof editingContext.oldTabIndex !== "number")
            element.removeAttribute("tabIndex");
        else
            element.tabIndex = editingContext.oldTabIndex;
        element.scrollTop = 0;
        element.scrollLeft = 0;
    },

    cancelEditing: function(editingContext)
    {
        var element = editingContext.element;
        if (element.tagName === "INPUT" && element.type === "text")
            element.value = editingContext.oldText;
        else
            element.textContent = editingContext.oldText;
    },

    augmentEditingHandle: function(editingContext, handle)
    {
    },

    /**
     * @param {!Element} element
     * @param {!WebInspector.InplaceEditor.Config=} config
     * @return {?WebInspector.InplaceEditor.Controller}
     */
    startEditing: function(element, config)
    {
        if (!WebInspector.markBeingEdited(element, true))
            return null;

        config = config || new WebInspector.InplaceEditor.Config(function() {}, function() {});
        var editingContext = { element: element, config: config };
        var committedCallback = config.commitHandler;
        var cancelledCallback = config.cancelHandler;
        var pasteCallback = config.pasteHandler;
        var context = config.context;
        var isMultiline = config.multiline || false;
        var moveDirection = "";
        var self = this;

        /**
         * @param {!Event} e
         */
        function consumeCopy(e)
        {
            e.consume();
        }

        this.setUpEditor(editingContext);

        editingContext.oldText = isMultiline ? config.initialValue : this.editorContent(editingContext);

        /**
         * @param {!Event=} e
         */
        function blurEventListener(e) {
            if (config.blurHandler && !config.blurHandler(element, e))
                return;
            if (!isMultiline || !e || !e.relatedTarget || !e.relatedTarget.isSelfOrDescendant(element))
                editingCommitted.call(element);
        }

        function cleanUpAfterEditing()
        {
            WebInspector.markBeingEdited(element, false);

            element.removeEventListener("blur", blurEventListener, isMultiline);
            element.removeEventListener("keydown", keyDownEventListener, true);
            if (pasteCallback)
                element.removeEventListener("paste", pasteEventListener, true);

            WebInspector.restoreFocusFromElement(element);
            self.closeEditor(editingContext);
        }

        /** @this {Element} */
        function editingCancelled()
        {
            self.cancelEditing(editingContext);
            cleanUpAfterEditing();
            cancelledCallback(this, context);
        }

        /** @this {Element} */
        function editingCommitted()
        {
            cleanUpAfterEditing();

            committedCallback(this, self.editorContent(editingContext), editingContext.oldText, context, moveDirection);
        }

        /**
         * @param {!Event} event
         * @return {string}
         */
        function defaultFinishHandler(event)
        {
            var isMetaOrCtrl = WebInspector.isMac() ?
                event.metaKey && !event.shiftKey && !event.ctrlKey && !event.altKey :
                event.ctrlKey && !event.shiftKey && !event.metaKey && !event.altKey;
            if (isEnterKey(event) && (event.isMetaOrCtrlForTest || !isMultiline || isMetaOrCtrl))
                return "commit";
            else if (event.keyCode === WebInspector.KeyboardShortcut.Keys.Esc.code || event.keyIdentifier === "U+001B")
                return "cancel";
            else if (!isMultiline && event.keyIdentifier === "U+0009") // Tab key
                return "move-" + (event.shiftKey ? "backward" : "forward");
            return "";
        }

        function handleEditingResult(result, event)
        {
            if (result === "commit") {
                editingCommitted.call(element);
                event.consume(true);
            } else if (result === "cancel") {
                editingCancelled.call(element);
                event.consume(true);
            } else if (result && result.startsWith("move-")) {
                moveDirection = result.substring(5);
                if (event.keyIdentifier !== "U+0009")
                    blurEventListener();
            }
        }

        /**
         * @param {!Event} event
         */
        function pasteEventListener(event)
        {
            var result = pasteCallback(event);
            handleEditingResult(result, event);
        }

        /**
         * @param {!Event} event
         */
        function keyDownEventListener(event)
        {
            var result = defaultFinishHandler(event);
            if (!result && config.postKeydownFinishHandler)
                result = config.postKeydownFinishHandler(event);
            handleEditingResult(result, event);
        }

        element.addEventListener("blur", blurEventListener, isMultiline);
        element.addEventListener("keydown", keyDownEventListener, true);
        if (pasteCallback)
            element.addEventListener("paste", pasteEventListener, true);

        var handle = {
            cancel: editingCancelled.bind(element),
            commit: editingCommitted.bind(element),
            setWidth: function() {}
        };
        this.augmentEditingHandle(editingContext, handle);
        return handle;
    }
}

/**
 * @constructor
 * @param {function(!Element,string,string,T,string)} commitHandler
 * @param {function(!Element,T)} cancelHandler
 * @param {T=} context
 * @param {function(!Element,!Event):boolean=} blurHandler
 * @template T
 */
WebInspector.InplaceEditor.Config = function(commitHandler, cancelHandler, context, blurHandler)
{
    this.commitHandler = commitHandler;
    this.cancelHandler = cancelHandler;
    this.context = context;
    this.blurHandler = blurHandler;

    /**
     * @type {function(!Event):string|undefined}
     */
    this.pasteHandler;

    /**
     * @type {boolean|undefined}
     */
    this.multiline;

    /**
     * @type {function(!Event):string|undefined}
     */
    this.postKeydownFinishHandler;
}

WebInspector.InplaceEditor.Config.prototype = {
    setPasteHandler: function(pasteHandler)
    {
        this.pasteHandler = pasteHandler;
    },

    /**
     * @param {string} initialValue
     * @param {!Object} mode
     * @param {string} theme
     * @param {boolean=} lineWrapping
     * @param {boolean=} smartIndent
     */
    setMultilineOptions: function(initialValue, mode, theme, lineWrapping, smartIndent)
    {
        this.multiline = true;
        this.initialValue = initialValue;
        this.mode = mode;
        this.theme = theme;
        this.lineWrapping = lineWrapping;
        this.smartIndent = smartIndent;
    },

    /**
     * @param {function(!Event):string} postKeydownFinishHandler
     */
    setPostKeydownFinishHandler: function(postKeydownFinishHandler)
    {
        this.postKeydownFinishHandler = postKeydownFinishHandler;
    }
}
