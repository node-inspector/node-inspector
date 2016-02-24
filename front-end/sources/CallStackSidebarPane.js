/*
 * Copyright (C) 2008 Apple Inc. All Rights Reserved.
 *
 * Redistribution and use in source and binary forms, with or without
 * modification, are permitted provided that the following conditions
 * are met:
 * 1. Redistributions of source code must retain the above copyright
 *    notice, this list of conditions and the following disclaimer.
 * 2. Redistributions in binary form must reproduce the above copyright
 *    notice, this list of conditions and the following disclaimer in the
 *    documentation and/or other materials provided with the distribution.
 *
 * THIS SOFTWARE IS PROVIDED BY APPLE INC. ``AS IS'' AND ANY
 * EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE
 * IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR
 * PURPOSE ARE DISCLAIMED.  IN NO EVENT SHALL APPLE INC. OR
 * CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL,
 * EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO,
 * PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR
 * PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY
 * OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT
 * (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE
 * OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
 */

/**
 * @constructor
 * @extends {WebInspector.SidebarPane}
 */
WebInspector.CallStackSidebarPane = function()
{
    WebInspector.SidebarPane.call(this, WebInspector.UIString("Call Stack"));
    this.element.addEventListener("keydown", this._keyDown.bind(this), true);
    this.element.tabIndex = 0;
    this.callFrameList = new WebInspector.UIList();
    this.callFrameList.show(this.element);

    WebInspector.moduleSetting("enableAsyncStackTraces").addChangeListener(this._asyncStackTracesStateChanged, this);
    WebInspector.moduleSetting("skipStackFramesPattern").addChangeListener(this._blackboxingStateChanged, this);
}

/** @enum {string} */
WebInspector.CallStackSidebarPane.Events = {
    CallFrameSelected: "CallFrameSelected",
    RevealHiddenCallFrames: "RevealHiddenCallFrames"
}

WebInspector.CallStackSidebarPane.prototype = {
    /**
     * @param {?WebInspector.DebuggerPausedDetails} details
     */
    update: function(details)
    {
        this.callFrameList.detach();
        this.callFrameList.clear();
        this.element.removeChildren();

        if (!details) {
            var infoElement = this.element.createChild("div", "callstack-info");
            infoElement.textContent = WebInspector.UIString("Not Paused");
            return;
        }

        this.callFrameList.show(this.element);
        this._debuggerModel = details.debuggerModel;
        var callFrames = details.callFrames;
        var asyncStackTrace = details.asyncStackTrace;

        delete this._statusMessageElement;
        delete this._hiddenCallFramesMessageElement;
        /** @type {!Array.<!WebInspector.CallStackSidebarPane.CallFrame>} */
        this.callFrames = [];
        this._hiddenCallFrames = 0;

        this._appendSidebarCallFrames(callFrames);
        var topStackHidden = (this._hiddenCallFrames === this.callFrames.length);

        while (asyncStackTrace) {
            var title = WebInspector.asyncStackTraceLabel(asyncStackTrace.description);
            var asyncCallFrame = new WebInspector.UIList.Item(title, "", true);
            asyncCallFrame.element.addEventListener("click", this._selectNextVisibleCallFrame.bind(this, this.callFrames.length, false), false);
            asyncCallFrame.element.addEventListener("contextmenu", this._asyncCallFrameContextMenu.bind(this, this.callFrames.length), true);
            this._appendSidebarCallFrames(asyncStackTrace.callFrames, asyncCallFrame);
            asyncStackTrace = asyncStackTrace.asyncStackTrace;
        }

        if (topStackHidden)
            this._revealHiddenCallFrames();
        if (this._hiddenCallFrames) {
            var element = createElementWithClass("div", "hidden-callframes-message");
            if (this._hiddenCallFrames === 1)
                element.textContent = WebInspector.UIString("1 stack frame is hidden (black-boxed).");
            else
                element.textContent = WebInspector.UIString("%d stack frames are hidden (black-boxed).", this._hiddenCallFrames);
            element.createTextChild(" ");
            var showAllLink = element.createChild("span", "link");
            showAllLink.textContent = WebInspector.UIString("Show");
            showAllLink.addEventListener("click", this._revealHiddenCallFrames.bind(this), false);
            this.element.insertBefore(element, this.element.firstChild);
            this._hiddenCallFramesMessageElement = element;
        }
    },

    /**
     * @param {!Array.<!WebInspector.DebuggerModel.CallFrame>} callFrames
     * @param {!WebInspector.UIList.Item=} asyncCallFrameItem
     */
    _appendSidebarCallFrames: function(callFrames, asyncCallFrameItem)
    {
        if (asyncCallFrameItem)
            this.callFrameList.addItem(asyncCallFrameItem);

        var allCallFramesHidden = true;
        for (var i = 0, n = callFrames.length; i < n; ++i) {
            var callFrame = callFrames[i];
            var callFrameItem = new WebInspector.CallStackSidebarPane.CallFrame(callFrame, asyncCallFrameItem);
            callFrameItem.element.addEventListener("click", this._callFrameSelected.bind(this, callFrameItem), false);
            callFrameItem.element.addEventListener("contextmenu", this._callFrameContextMenu.bind(this, callFrameItem), true);
            this.callFrames.push(callFrameItem);

            if (WebInspector.BlackboxSupport.isBlackboxed(callFrame.script.sourceURL, callFrame.script.isContentScript())) {
                callFrameItem.setHidden(true);
                callFrameItem.setDimmed(true);
                ++this._hiddenCallFrames;
            } else {
                this.callFrameList.addItem(callFrameItem);
                allCallFramesHidden = false;
            }
        }
        if (allCallFramesHidden && asyncCallFrameItem) {
            asyncCallFrameItem.setHidden(true);
            asyncCallFrameItem.element.remove();
        }
    },

    _revealHiddenCallFrames: function()
    {
        if (!this._hiddenCallFrames)
            return;
        this._hiddenCallFrames = 0;
        this.callFrameList.clear();
        for (var i = 0; i < this.callFrames.length; ++i) {
            var callFrame = this.callFrames[i];
            if (callFrame._asyncCallFrame) {
                callFrame._asyncCallFrame.setHidden(false);
                if (i && callFrame._asyncCallFrame !== this.callFrames[i - 1]._asyncCallFrame)
                    this.callFrameList.addItem(callFrame._asyncCallFrame);
            }
            callFrame.setHidden(false);
            this.callFrameList.addItem(callFrame);
        }
        if (this._hiddenCallFramesMessageElement) {
            this._hiddenCallFramesMessageElement.remove();
            delete this._hiddenCallFramesMessageElement;
        }
        this.dispatchEventToListeners(WebInspector.CallStackSidebarPane.Events.RevealHiddenCallFrames);
    },

    /**
     * @param {!WebInspector.CallStackSidebarPane.CallFrame} callFrame
     * @param {!Event} event
     */
    _callFrameContextMenu: function(callFrame, event)
    {
        var contextMenu = new WebInspector.ContextMenu(event);

        if (!callFrame._callFrame.isAsync())
            contextMenu.appendItem(WebInspector.UIString.capitalize("Restart ^frame"), this._restartFrame.bind(this, callFrame));

        contextMenu.appendItem(WebInspector.UIString.capitalize("Copy ^stack ^trace"), this._copyStackTrace.bind(this));

        var script = callFrame._callFrame.script;
        this.appendBlackboxURLContextMenuItems(contextMenu, script.sourceURL, script.isContentScript());

        contextMenu.show();
    },

    /**
     * @param {number} index
     * @param {!Event} event
     */
    _asyncCallFrameContextMenu: function(index, event)
    {
        for (; index < this.callFrames.length; ++index) {
            var callFrame = this.callFrames[index];
            if (!callFrame.isHidden()) {
                this._callFrameContextMenu(callFrame, event);
                break;
            }
        }
    },

    /**
     * @param {!WebInspector.ContextMenu} contextMenu
     * @param {string} url
     * @param {boolean} isContentScript
     */
    appendBlackboxURLContextMenuItems: function(contextMenu, url, isContentScript)
    {
        var blackboxed = WebInspector.BlackboxSupport.isBlackboxed(url, isContentScript);
        var canBlackBox = WebInspector.BlackboxSupport.canBlackboxURL(url);
        if (!blackboxed && !isContentScript && !canBlackBox)
            return;

        if (blackboxed) {
            contextMenu.appendItem(WebInspector.UIString.capitalize("Stop ^blackboxing"), this._handleContextMenuBlackboxURL.bind(this, url, isContentScript, false));
        } else {
            if (canBlackBox)
                contextMenu.appendItem(WebInspector.UIString.capitalize("Blackbox ^script"), this._handleContextMenuBlackboxURL.bind(this, url, false, true));
            if (isContentScript)
                contextMenu.appendItem(WebInspector.UIString.capitalize("Blackbox ^all ^content ^scripts"), this._handleContextMenuBlackboxURL.bind(this, url, true, true));
        }
    },

    /**
     * @param {string} url
     * @param {boolean} isContentScript
     * @param {boolean} blackbox
     */
    _handleContextMenuBlackboxURL: function(url, isContentScript, blackbox)
    {
        if (blackbox) {
            if (isContentScript)
                WebInspector.moduleSetting("skipContentScripts").set(true);
            else
                WebInspector.BlackboxSupport.blackboxURL(url);
        } else {
            WebInspector.BlackboxSupport.unblackbox(url, isContentScript);
        }
    },

    _blackboxingStateChanged: function()
    {
        if (!this._debuggerModel)
            return;
        var details = this._debuggerModel.debuggerPausedDetails();
        if (!details)
            return;
        this.update(details);
        var selectedCallFrame = this._debuggerModel.selectedCallFrame();
        if (selectedCallFrame)
            this.setSelectedCallFrame(selectedCallFrame);
    },

    /**
     * @param {!WebInspector.CallStackSidebarPane.CallFrame} callFrame
     */
    _restartFrame: function(callFrame)
    {
        callFrame._callFrame.restart();
    },

    _asyncStackTracesStateChanged: function()
    {
        var enabled = WebInspector.moduleSetting("enableAsyncStackTraces").get();
        if (!enabled && this.callFrames)
            this._removeAsyncCallFrames();
    },

    _removeAsyncCallFrames: function()
    {
        var shouldSelectTopFrame = false;
        var lastSyncCallFrameIndex = -1;
        for (var i = 0; i < this.callFrames.length; ++i) {
            var callFrame = this.callFrames[i];
            if (callFrame._asyncCallFrame) {
                if (callFrame.isSelected())
                    shouldSelectTopFrame = true;
                callFrame._asyncCallFrame.element.remove();
                callFrame.element.remove();
            } else {
                lastSyncCallFrameIndex = i;
            }
        }
        this.callFrames.length = lastSyncCallFrameIndex + 1;
        if (shouldSelectTopFrame)
            this._selectNextVisibleCallFrame(0);
    },

    /**
     * @param {!WebInspector.DebuggerModel.CallFrame} x
     */
    setSelectedCallFrame: function(x)
    {
        for (var i = 0; i < this.callFrames.length; ++i) {
            var callFrame = this.callFrames[i];
            callFrame.setSelected(callFrame._callFrame === x);
            if (callFrame.isSelected() && callFrame.isHidden())
                this._revealHiddenCallFrames();
        }
    },

    /**
     * @return {boolean}
     */
    _selectNextCallFrameOnStack: function()
    {
        var index = this._selectedCallFrameIndex();
        if (index === -1)
            return false;
        return this._selectNextVisibleCallFrame(index + 1);
    },

    /**
     * @return {boolean}
     */
    _selectPreviousCallFrameOnStack: function()
    {
        var index = this._selectedCallFrameIndex();
        if (index === -1)
            return false;
        return this._selectNextVisibleCallFrame(index - 1, true);
    },

    /**
     * @param {number} index
     * @param {boolean=} backward
     * @return {boolean}
     */
    _selectNextVisibleCallFrame: function(index, backward)
    {
        while (0 <= index && index < this.callFrames.length) {
            var callFrame = this.callFrames[index];
            if (!callFrame.isHidden() && !callFrame.isLabel()) {
                this._callFrameSelected(callFrame);
                return true;
            }
            index += backward ? -1 : 1;
        }
        return false;
    },

    /**
     * @return {number}
     */
    _selectedCallFrameIndex: function()
    {
        if (!this._debuggerModel)
            return -1;
        var selectedCallFrame = this._debuggerModel.selectedCallFrame();
        if (!selectedCallFrame)
            return -1;
        for (var i = 0; i < this.callFrames.length; ++i) {
            var callFrame = this.callFrames[i];
            if (callFrame._callFrame === selectedCallFrame)
                return i;
        }
        return -1;
    },

    /**
     * @param {!WebInspector.CallStackSidebarPane.CallFrame} callFrame
     */
    _callFrameSelected: function(callFrame)
    {
        callFrame.element.scrollIntoViewIfNeeded();
        this.dispatchEventToListeners(WebInspector.CallStackSidebarPane.Events.CallFrameSelected, callFrame._callFrame);
    },

    _copyStackTrace: function()
    {
        var text = "";
        var lastCallFrame = null;
        for (var i = 0; i < this.callFrames.length; ++i) {
            var callFrame = this.callFrames[i];
            if (callFrame.isHidden())
                continue;
            if (lastCallFrame && callFrame._asyncCallFrame !== lastCallFrame._asyncCallFrame)
                text += callFrame._asyncCallFrame.title() + "\n";
            text += callFrame.title() + " (" + callFrame.subtitle() + ")\n";
            lastCallFrame = callFrame;
        }
        InspectorFrontendHost.copyText(text);
    },

    /**
     * @param {function(!Array.<!WebInspector.KeyboardShortcut.Descriptor>, function(!Event=):boolean)} registerShortcutDelegate
     */
    registerShortcuts: function(registerShortcutDelegate)
    {
        registerShortcutDelegate(WebInspector.ShortcutsScreen.SourcesPanelShortcuts.NextCallFrame, this._selectNextCallFrameOnStack.bind(this));
        registerShortcutDelegate(WebInspector.ShortcutsScreen.SourcesPanelShortcuts.PrevCallFrame, this._selectPreviousCallFrameOnStack.bind(this));
    },

    /**
     * @param {!Element|string} status
     */
    setStatus: function(status)
    {
        if (!this._statusMessageElement)
            this._statusMessageElement = this.element.createChild("div", "callstack-info status");
        if (typeof status === "string") {
            this._statusMessageElement.textContent = status;
        } else {
            this._statusMessageElement.removeChildren();
            this._statusMessageElement.appendChild(status);
        }
    },

    _keyDown: function(event)
    {
        if (event.altKey || event.shiftKey || event.metaKey || event.ctrlKey)
            return;
        if (event.keyIdentifier === "Up" && this._selectPreviousCallFrameOnStack() || event.keyIdentifier === "Down" && this._selectNextCallFrameOnStack())
            event.consume(true);
    },

    __proto__: WebInspector.SidebarPane.prototype
}

/**
 * @constructor
 * @extends {WebInspector.UIList.Item}
 * @param {!WebInspector.DebuggerModel.CallFrame} callFrame
 * @param {!WebInspector.UIList.Item=} asyncCallFrame
 */
WebInspector.CallStackSidebarPane.CallFrame = function(callFrame, asyncCallFrame)
{
    WebInspector.UIList.Item.call(this, WebInspector.beautifyFunctionName(callFrame.functionName), "");
    WebInspector.debuggerWorkspaceBinding.createCallFrameLiveLocation(callFrame, this._update.bind(this));
    this._callFrame = callFrame;
    this._asyncCallFrame = asyncCallFrame;
}

WebInspector.CallStackSidebarPane.CallFrame.prototype = {
    /**
     * @param {!WebInspector.UILocation} uiLocation
     */
    _update: function(uiLocation)
    {
        var text = uiLocation.linkText();
        this.setSubtitle(text.trimMiddle(30));
        this.subtitleElement.title = text;
    },

    __proto__: WebInspector.UIList.Item.prototype
}
