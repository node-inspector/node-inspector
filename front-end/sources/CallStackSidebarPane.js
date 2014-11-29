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
    this.bodyElement.addEventListener("keydown", this._keyDown.bind(this), true);
    this.bodyElement.tabIndex = 0;

    var asyncCheckbox = this.titleElement.appendChild(WebInspector.SettingsUI.createSettingCheckbox(WebInspector.UIString("Async"), WebInspector.settings.enableAsyncStackTraces, true, undefined, WebInspector.UIString("Capture async stack traces")));
    asyncCheckbox.classList.add("scripts-callstack-async");
    asyncCheckbox.addEventListener("click", consumeEvent, false);
    WebInspector.settings.enableAsyncStackTraces.addChangeListener(this._asyncStackTracesStateChanged, this);
    WebInspector.settings.skipStackFramesPattern.addChangeListener(this._blackboxingStateChanged, this);
}

WebInspector.CallStackSidebarPane.Events = {
    CallFrameSelected: "CallFrameSelected"
}

WebInspector.CallStackSidebarPane.prototype = {
    /**
     * @param {?WebInspector.DebuggerPausedDetails} details
     */
    update: function(details)
    {
        this.bodyElement.removeChildren();

        if (!details) {
            var infoElement = this.bodyElement.createChild("div", "info");
            infoElement.textContent = WebInspector.UIString("Not Paused");
            return;
        }

        this._target = details.target();
        var callFrames = details.callFrames;
        var asyncStackTrace = details.asyncStackTrace;

        delete this._statusMessageElement;
        delete this._hiddenPlacardsMessageElement;
        /** @type {!Array.<!WebInspector.CallStackSidebarPane.Placard>} */
        this.placards = [];
        this._hiddenPlacards = 0;

        this._appendSidebarPlacards(callFrames);
        var topStackHidden = (this._hiddenPlacards === this.placards.length);

        while (asyncStackTrace) {
            var title = WebInspector.asyncStackTraceLabel(asyncStackTrace.description);
            var asyncPlacard = new WebInspector.Placard(title, "");
            asyncPlacard.element.addEventListener("click", this._selectNextVisiblePlacard.bind(this, this.placards.length, false), false);
            asyncPlacard.element.addEventListener("contextmenu", this._asyncPlacardContextMenu.bind(this, this.placards.length), true);
            asyncPlacard.element.classList.add("placard-label");
            this.bodyElement.appendChild(asyncPlacard.element);
            this._appendSidebarPlacards(asyncStackTrace.callFrames, asyncPlacard);
            asyncStackTrace = asyncStackTrace.asyncStackTrace;
        }

        if (topStackHidden)
            this._revealHiddenPlacards();
        if (this._hiddenPlacards) {
            var element = createElementWithClass("div", "hidden-placards-message");
            if (this._hiddenPlacards === 1)
                element.textContent = WebInspector.UIString("1 stack frame is hidden (black-boxed).");
            else
                element.textContent = WebInspector.UIString("%d stack frames are hidden (black-boxed).", this._hiddenPlacards);
            element.createTextChild(" ");
            var showAllLink = element.createChild("span", "node-link");
            showAllLink.textContent = WebInspector.UIString("Show");
            showAllLink.addEventListener("click", this._revealHiddenPlacards.bind(this), false);
            this.bodyElement.insertBefore(element, this.bodyElement.firstChild);
            this._hiddenPlacardsMessageElement = element;
        }
    },

    /**
     * @param {!Array.<!WebInspector.DebuggerModel.CallFrame>} callFrames
     * @param {!WebInspector.Placard=} asyncPlacard
     */
    _appendSidebarPlacards: function(callFrames, asyncPlacard)
    {
        var allPlacardsHidden = true;
        for (var i = 0, n = callFrames.length; i < n; ++i) {
            var callFrame = callFrames[i];
            var placard = new WebInspector.CallStackSidebarPane.Placard(callFrame, asyncPlacard);
            placard.element.addEventListener("click", this._placardSelected.bind(this, placard), false);
            placard.element.addEventListener("contextmenu", this._placardContextMenu.bind(this, placard), true);
            this.placards.push(placard);
            this.bodyElement.appendChild(placard.element);

            if (WebInspector.BlackboxSupport.isBlackboxed(callFrame.script.sourceURL, callFrame.script.isContentScript())) {
                placard.setHidden(true);
                placard.element.classList.add("dimmed");
                ++this._hiddenPlacards;
            } else {
                allPlacardsHidden = false;
            }
        }
        if (allPlacardsHidden && asyncPlacard)
            asyncPlacard.setHidden(true);
    },

    _revealHiddenPlacards: function()
    {
        if (!this._hiddenPlacards)
            return;
        this._hiddenPlacards = 0;
        for (var i = 0; i < this.placards.length; ++i) {
            var placard = this.placards[i];
            placard.setHidden(false);
            if (placard._asyncPlacard)
                placard._asyncPlacard.setHidden(false);
        }
        if (this._hiddenPlacardsMessageElement) {
            this._hiddenPlacardsMessageElement.remove();
            delete this._hiddenPlacardsMessageElement;
        }
    },

    /**
     * @param {!WebInspector.CallStackSidebarPane.Placard} placard
     * @param {!Event} event
     */
    _placardContextMenu: function(placard, event)
    {
        var contextMenu = new WebInspector.ContextMenu(event);

        if (!placard._callFrame.isAsync())
            contextMenu.appendItem(WebInspector.UIString(WebInspector.useLowerCaseMenuTitles() ? "Restart frame" : "Restart Frame"), this._restartFrame.bind(this, placard));

        contextMenu.appendItem(WebInspector.UIString(WebInspector.useLowerCaseMenuTitles() ? "Copy stack trace" : "Copy Stack Trace"), this._copyStackTrace.bind(this));

        var script = placard._callFrame.script;
        if (!script.isSnippet()) {
            contextMenu.appendSeparator();
            this.appendBlackboxURLContextMenuItems(contextMenu, script.sourceURL, script.isContentScript());
        }

        contextMenu.show();
    },

    /**
     * @param {number} index
     * @param {!Event} event
     */
    _asyncPlacardContextMenu: function(index, event)
    {
        for (; index < this.placards.length; ++index) {
            var placard = this.placards[index];
            if (!placard.isHidden()) {
                this._placardContextMenu(placard, event);
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
        if (blackboxed) {
            contextMenu.appendItem(WebInspector.UIString(WebInspector.useLowerCaseMenuTitles() ? "Stop blackboxing" : "Stop Blackboxing"), this._handleContextMenuBlackboxURL.bind(this, url, isContentScript, false));
        } else {
            if (WebInspector.BlackboxSupport.canBlackboxURL(url))
                contextMenu.appendItem(WebInspector.UIString(WebInspector.useLowerCaseMenuTitles() ? "Blackbox script" : "Blackbox Script"), this._handleContextMenuBlackboxURL.bind(this, url, false, true));
            if (isContentScript)
                contextMenu.appendItem(WebInspector.UIString(WebInspector.useLowerCaseMenuTitles() ? "Blackbox all content scripts" : "Blackbox All Content Scripts"), this._handleContextMenuBlackboxURL.bind(this, url, true, true));
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
                WebInspector.settings.skipContentScripts.set(true);
            else
                WebInspector.BlackboxSupport.blackboxURL(url);
        } else {
            WebInspector.BlackboxSupport.unblackbox(url, isContentScript);
        }
    },

    _blackboxingStateChanged: function()
    {
        if (!this._target)
            return;
        var details = this._target.debuggerModel.debuggerPausedDetails();
        if (!details)
            return;
        this.update(details);
        var selectedCallFrame = this._target.debuggerModel.selectedCallFrame();
        if (selectedCallFrame)
            this.setSelectedCallFrame(selectedCallFrame);
    },

    /**
     * @param {!WebInspector.CallStackSidebarPane.Placard} placard
     */
    _restartFrame: function(placard)
    {
        placard._callFrame.restart();
    },

    _asyncStackTracesStateChanged: function()
    {
        var enabled = WebInspector.settings.enableAsyncStackTraces.get();
        if (!enabled && this.placards)
            this._removeAsyncPlacards();
    },

    _removeAsyncPlacards: function()
    {
        var shouldSelectTopFrame = false;
        var lastSyncPlacardIndex = -1;
        for (var i = 0; i < this.placards.length; ++i) {
            var placard = this.placards[i];
            if (placard._asyncPlacard) {
                if (placard.selected)
                    shouldSelectTopFrame = true;
                placard._asyncPlacard.element.remove();
                placard.element.remove();
            } else {
                lastSyncPlacardIndex = i;
            }
        }
        this.placards.length = lastSyncPlacardIndex + 1;
        if (shouldSelectTopFrame)
            this._selectNextVisiblePlacard(0);
    },

    /**
     * @param {!WebInspector.DebuggerModel.CallFrame} x
     */
    setSelectedCallFrame: function(x)
    {
        for (var i = 0; i < this.placards.length; ++i) {
            var placard = this.placards[i];
            placard.selected = (placard._callFrame === x);
            if (placard.selected && placard.isHidden())
                this._revealHiddenPlacards();
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
        return this._selectNextVisiblePlacard(index + 1);
    },

    /**
     * @return {boolean}
     */
    _selectPreviousCallFrameOnStack: function()
    {
        var index = this._selectedCallFrameIndex();
        if (index === -1)
            return false;
        return this._selectNextVisiblePlacard(index - 1, true);
    },

    /**
     * @param {number} index
     * @param {boolean=} backward
     * @return {boolean}
     */
    _selectNextVisiblePlacard: function(index, backward)
    {
        while (0 <= index && index < this.placards.length) {
            var placard = this.placards[index];
            if (!placard.isHidden()) {
                this._placardSelected(placard);
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
        var selectedCallFrame = this._target.debuggerModel.selectedCallFrame();
        if (!selectedCallFrame)
            return -1;
        for (var i = 0; i < this.placards.length; ++i) {
            var placard = this.placards[i];
            if (placard._callFrame === selectedCallFrame)
                return i;
        }
        return -1;
    },

    /**
     * @param {!WebInspector.CallStackSidebarPane.Placard} placard
     */
    _placardSelected: function(placard)
    {
        placard.element.scrollIntoViewIfNeeded();
        this.dispatchEventToListeners(WebInspector.CallStackSidebarPane.Events.CallFrameSelected, placard._callFrame);
    },

    _copyStackTrace: function()
    {
        var text = "";
        var lastPlacard = null;
        for (var i = 0; i < this.placards.length; ++i) {
            var placard = this.placards[i];
            if (placard.isHidden())
                continue;
            if (lastPlacard && placard._asyncPlacard !== lastPlacard._asyncPlacard)
                text += placard._asyncPlacard.title + "\n";
            text += placard.title + " (" + placard.subtitle + ")\n";
            lastPlacard = placard;
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
            this._statusMessageElement = this.bodyElement.createChild("div", "info");
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
 * @extends {WebInspector.Placard}
 * @param {!WebInspector.DebuggerModel.CallFrame} callFrame
 * @param {!WebInspector.Placard=} asyncPlacard
 */
WebInspector.CallStackSidebarPane.Placard = function(callFrame, asyncPlacard)
{
    WebInspector.Placard.call(this, WebInspector.beautifyFunctionName(callFrame.functionName), "");
    WebInspector.debuggerWorkspaceBinding.createCallFrameLiveLocation(callFrame, this._update.bind(this));
    this._callFrame = callFrame;
    this._asyncPlacard = asyncPlacard;
}

WebInspector.CallStackSidebarPane.Placard.prototype = {
    /**
     * @param {!WebInspector.UILocation} uiLocation
     */
    _update: function(uiLocation)
    {
        var text = uiLocation.linkText();
        this.subtitle = text.trimMiddle(30);
        this.subtitleElement.title = text;
    },

    __proto__: WebInspector.Placard.prototype
}
