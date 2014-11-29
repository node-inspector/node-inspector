/*
 * Copyright (C) 2011 Google Inc. All rights reserved.
 *
 * Redistribution and use in source and binary forms, with or without
 * modification, are permitted provided that the following conditions are
 * met:
 *
 *     * Redistributions of source code must retain the above copyright
 * notice, this list of conditions and the following disclaimer.
 *     * Redistributions in binary form must reproduce the above
 * copyright notice, this list of conditions and the following disclaimer
 * in the documentation and/or other materials provided with the
 * distribution.
 *     * Neither the name of Google Inc. nor the names of its
 * contributors may be used to endorse or promote products derived from
 * this software without specific prior written permission.
 *
 * THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS
 * "AS IS" AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT
 * LIMITED TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR
 * A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT
 * OWNER OR CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL,
 * SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT
 * LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE,
 * DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY
 * THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT
 * (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE
 * OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
 */

/**
 * @constructor
 * @extends {WebInspector.UISourceCodeFrame}
 * @param {!WebInspector.SourcesPanel} scriptsPanel
 * @param {!WebInspector.UISourceCode} uiSourceCode
 */
WebInspector.JavaScriptSourceFrame = function(scriptsPanel, uiSourceCode)
{
    this._scriptsPanel = scriptsPanel;
    this._breakpointManager = WebInspector.breakpointManager;
    this._uiSourceCode = uiSourceCode;

    WebInspector.UISourceCodeFrame.call(this, uiSourceCode);
    if (uiSourceCode.project().type() === WebInspector.projectTypes.Debugger)
        this.element.classList.add("source-frame-debugger-script");

    this._popoverHelper = new WebInspector.ObjectPopoverHelper(this.textEditor.element,
        this._getPopoverAnchor.bind(this), this._resolveObjectForPopover.bind(this), this._onHidePopover.bind(this), true);

    this.textEditor.element.addEventListener("keydown", this._onKeyDown.bind(this), true);

    this.textEditor.addEventListener(WebInspector.TextEditor.Events.GutterClick, this._handleGutterClick.bind(this), this);

    this._breakpointManager.addEventListener(WebInspector.BreakpointManager.Events.BreakpointAdded, this._breakpointAdded, this);
    this._breakpointManager.addEventListener(WebInspector.BreakpointManager.Events.BreakpointRemoved, this._breakpointRemoved, this);

    WebInspector.presentationConsoleMessageHelper.addConsoleMessageEventListener(WebInspector.PresentationConsoleMessageHelper.Events.ConsoleMessageAdded, this._uiSourceCode, this._consoleMessageAdded, this);
    WebInspector.presentationConsoleMessageHelper.addConsoleMessageEventListener(WebInspector.PresentationConsoleMessageHelper.Events.ConsoleMessageRemoved, this._uiSourceCode, this._consoleMessageRemoved, this);
    WebInspector.presentationConsoleMessageHelper.addConsoleMessageEventListener(WebInspector.PresentationConsoleMessageHelper.Events.ConsoleMessagesCleared, this._uiSourceCode, this._consoleMessagesCleared, this);
    this._uiSourceCode.addEventListener(WebInspector.UISourceCode.Events.SourceMappingChanged, this._onSourceMappingChanged, this);
    this._uiSourceCode.addEventListener(WebInspector.UISourceCode.Events.WorkingCopyChanged, this._workingCopyChanged, this);
    this._uiSourceCode.addEventListener(WebInspector.UISourceCode.Events.WorkingCopyCommitted, this._workingCopyCommitted, this);
    this._uiSourceCode.addEventListener(WebInspector.UISourceCode.Events.TitleChanged, this._showBlackboxInfobarIfNeeded, this);

    /** @type {!Map.<!WebInspector.Target, !WebInspector.ResourceScriptFile>}*/
    this._scriptFileForTarget = new Map();
    this._registerShortcuts();
    var targets = WebInspector.targetManager.targets();
    for (var i = 0; i < targets.length; ++i) {
        var scriptFile = WebInspector.debuggerWorkspaceBinding.scriptFile(uiSourceCode, targets[i]);
        if (scriptFile)
            this._updateScriptFile(targets[i]);
    }

    WebInspector.settings.skipStackFramesPattern.addChangeListener(this._showBlackboxInfobarIfNeeded, this);
    WebInspector.settings.skipContentScripts.addChangeListener(this._showBlackboxInfobarIfNeeded, this);
    this._showBlackboxInfobarIfNeeded();
}

WebInspector.JavaScriptSourceFrame.prototype = {
    _updateInfobars: function()
    {
        this.attachInfobars([this._blackboxInfobar, this._divergedInfobar]);
    },

    _showDivergedInfobar: function()
    {
        if (this._uiSourceCode.contentType() !== WebInspector.resourceTypes.Script)
            return;

        if (this._divergedInfobar)
            this._divergedInfobar.dispose();

        var infobar = new WebInspector.UISourceCodeFrame.Infobar(WebInspector.UISourceCodeFrame.Infobar.Level.Warning, WebInspector.UIString("Workspace mapping mismatch"));
        this._divergedInfobar = infobar;

        var fileURL = this._uiSourceCode.originURL();
        infobar.createDetailsRowMessage(WebInspector.UIString("The content of this file on the file system:\u00a0")).appendChild(
            WebInspector.createExternalAnchor(fileURL, fileURL, "source-frame-infobar-details-url"));

        var scriptURL = this._uiSourceCode.url;
        infobar.createDetailsRowMessage(WebInspector.UIString("does not match the loaded script:\u00a0")).appendChild(
            WebInspector.createExternalAnchor(scriptURL, scriptURL, "source-frame-infobar-details-url"));

        infobar.createDetailsRowMessage();
        infobar.createDetailsRowMessage(WebInspector.UIString("Possible solutions are:"));

        if (WebInspector.settings.cacheDisabled.get())
            infobar.createDetailsRowMessage(" - ").createTextChild(WebInspector.UIString("Reload inspected page"));
        else
            infobar.createDetailsRowMessage(" - ").createTextChild(WebInspector.UIString("Check \"Disable cache\" in settings and reload inspected page (recommended setup for authoring and debugging)"));
        infobar.createDetailsRowMessage(" - ").createTextChild(WebInspector.UIString("Check that your file and script are both loaded from the correct source and their contents match"));

        this._updateInfobars();
    },

    _hideDivergedInfobar: function()
    {
        if (!this._divergedInfobar)
            return;
        this._divergedInfobar.dispose();
        delete this._divergedInfobar;
    },

    _showBlackboxInfobarIfNeeded: function()
    {
        var contentType = this._uiSourceCode.contentType();
        if (contentType !== WebInspector.resourceTypes.Script && contentType !== WebInspector.resourceTypes.Document)
            return;
        var projectType = this._uiSourceCode.project().type();
        if (projectType === WebInspector.projectTypes.Snippets)
            return;
        var url = this._uiSourceCode.url;
        var isContentScript = projectType === WebInspector.projectTypes.ContentScripts;
        if (!WebInspector.BlackboxSupport.isBlackboxed(url, isContentScript)) {
            this._hideBlackboxInfobar();
            return;
        }

        if (this._blackboxInfobar)
            this._blackboxInfobar.dispose();

        var infobar = new WebInspector.UISourceCodeFrame.Infobar(WebInspector.UISourceCodeFrame.Infobar.Level.Warning, WebInspector.UIString("This script is blackboxed in debugger"));
        this._blackboxInfobar = infobar;

        infobar.createDetailsRowMessage(WebInspector.UIString("Debugger will skip stepping through this script, and will not stop on exceptions"));
        infobar.createDetailsRowMessage();
        infobar.createDetailsRowMessage(WebInspector.UIString("Possible ways to cancel this behavior are:"));

        infobar.createDetailsRowMessage(" - ").createTextChild(WebInspector.UIString("Press \"%s\" button in settings", WebInspector.manageBlackboxingButtonLabel()));
        var unblackboxLink = infobar.createDetailsRowMessage(" - ").createChild("span", "link");
        unblackboxLink.textContent = WebInspector.UIString("Unblackbox this script");
        unblackboxLink.addEventListener("click", unblackbox, false);

        function unblackbox()
        {
            WebInspector.BlackboxSupport.unblackbox(url, isContentScript);
        }

        this._updateInfobars();
    },

    _hideBlackboxInfobar: function()
    {
        if (!this._blackboxInfobar)
            return;
        this._blackboxInfobar.dispose();
        delete this._blackboxInfobar;
    },

    _registerShortcuts: function()
    {
        var shortcutKeys = WebInspector.ShortcutsScreen.SourcesPanelShortcuts;
        for (var i = 0; i < shortcutKeys.EvaluateSelectionInConsole.length; ++i) {
            var keyDescriptor = shortcutKeys.EvaluateSelectionInConsole[i];
            this.addShortcut(keyDescriptor.key, this._evaluateSelectionInConsole.bind(this));
        }
        for (var i = 0; i < shortcutKeys.AddSelectionToWatch.length; ++i) {
            var keyDescriptor = shortcutKeys.AddSelectionToWatch[i];
            this.addShortcut(keyDescriptor.key, this._addCurrentSelectionToWatch.bind(this));
        }
    },

    _addCurrentSelectionToWatch: function()
    {
        var textSelection = this.textEditor.selection();
        if (textSelection && !textSelection.isEmpty())
            this._innerAddToWatch(this.textEditor.copyRange(textSelection));
        return true;
    },

    /**
     * @param {string} expression
     */
    _innerAddToWatch: function(expression)
    {
        this._scriptsPanel.addToWatch(expression);
    },

    /**
     * @return {boolean}
     */
    _evaluateSelectionInConsole: function()
    {
        var selection = this.textEditor.selection();
        if (!selection || selection.isEmpty())
            return true;
        this._evaluateInConsole(this.textEditor.copyRange(selection));
        return true;
    },

    /**
     * @param {string} expression
     */
    _evaluateInConsole: function(expression)
    {
        var currentExecutionContext = WebInspector.context.flavor(WebInspector.ExecutionContext);
        if (currentExecutionContext)
            WebInspector.ConsoleModel.evaluateCommandInConsole(currentExecutionContext, expression);
    },

    // View events
    wasShown: function()
    {
        WebInspector.UISourceCodeFrame.prototype.wasShown.call(this);
    },

    willHide: function()
    {
        WebInspector.UISourceCodeFrame.prototype.willHide.call(this);
        this._popoverHelper.hidePopover();
    },

    onUISourceCodeContentChanged: function()
    {
        this._removeAllBreakpoints();
        WebInspector.UISourceCodeFrame.prototype.onUISourceCodeContentChanged.call(this);
    },

    onTextChanged: function(oldRange, newRange)
    {
        this._scriptsPanel.setIgnoreExecutionLineEvents(true);
        WebInspector.UISourceCodeFrame.prototype.onTextChanged.call(this, oldRange, newRange);
        this._scriptsPanel.setIgnoreExecutionLineEvents(false);
    },

    populateLineGutterContextMenu: function(contextMenu, lineNumber)
    {
        contextMenu.appendItem(WebInspector.UIString(WebInspector.useLowerCaseMenuTitles() ? "Continue to here" : "Continue to Here"), this._continueToLine.bind(this, lineNumber));
        var breakpoint = this._breakpointManager.findBreakpointOnLine(this._uiSourceCode, lineNumber);
        if (!breakpoint) {
            // This row doesn't have a breakpoint: We want to show Add Breakpoint and Add and Edit Breakpoint.
            contextMenu.appendItem(WebInspector.UIString(WebInspector.useLowerCaseMenuTitles() ? "Add breakpoint" : "Add Breakpoint"), this._setBreakpoint.bind(this, lineNumber, 0, "", true));
            contextMenu.appendItem(WebInspector.UIString(WebInspector.useLowerCaseMenuTitles() ? "Add conditional breakpoint…" : "Add Conditional Breakpoint…"), this._editBreakpointCondition.bind(this, lineNumber));
        } else {
            // This row has a breakpoint, we want to show edit and remove breakpoint, and either disable or enable.
            contextMenu.appendItem(WebInspector.UIString(WebInspector.useLowerCaseMenuTitles() ? "Remove breakpoint" : "Remove Breakpoint"), breakpoint.remove.bind(breakpoint));
            contextMenu.appendItem(WebInspector.UIString(WebInspector.useLowerCaseMenuTitles() ? "Edit breakpoint…" : "Edit Breakpoint…"), this._editBreakpointCondition.bind(this, lineNumber, breakpoint));
            if (breakpoint.enabled())
                contextMenu.appendItem(WebInspector.UIString(WebInspector.useLowerCaseMenuTitles() ? "Disable breakpoint" : "Disable Breakpoint"), breakpoint.setEnabled.bind(breakpoint, false));
            else
                contextMenu.appendItem(WebInspector.UIString(WebInspector.useLowerCaseMenuTitles() ? "Enable breakpoint" : "Enable Breakpoint"), breakpoint.setEnabled.bind(breakpoint, true));
        }
    },

    populateTextAreaContextMenu: function(contextMenu, lineNumber)
    {
        var textSelection = this.textEditor.selection();
        if (textSelection && !textSelection.isEmpty()) {
            var selection = this.textEditor.copyRange(textSelection);
            var addToWatchLabel = WebInspector.UIString(WebInspector.useLowerCaseMenuTitles() ? "Add to watch" : "Add to Watch");
            contextMenu.appendItem(addToWatchLabel, this._innerAddToWatch.bind(this, selection));
            var evaluateLabel = WebInspector.UIString(WebInspector.useLowerCaseMenuTitles() ? "Evaluate in console" : "Evaluate in Console");
            contextMenu.appendItem(evaluateLabel, this._evaluateInConsole.bind(this, selection));
            contextMenu.appendSeparator();
        }

        /**
         * @this {WebInspector.JavaScriptSourceFrame}
         * @param {!WebInspector.ResourceScriptFile} scriptFile
         */
        function addSourceMapURL(scriptFile)
        {
            WebInspector.AddSourceMapURLDialog.show(this.element, addSourceMapURLDialogCallback.bind(null, scriptFile));
        }

        /**
         * @param {!WebInspector.ResourceScriptFile} scriptFile
         * @param {string} url
         */
        function addSourceMapURLDialogCallback(scriptFile, url)
        {
            if (!url)
                return;
            scriptFile.addSourceMapURL(url);
        }

        WebInspector.UISourceCodeFrame.prototype.populateTextAreaContextMenu.call(this, contextMenu, lineNumber);

        if (this._uiSourceCode.project().type() === WebInspector.projectTypes.Network && WebInspector.settings.jsSourceMapsEnabled.get()) {
            if (this._scriptFileForTarget.size) {
                var scriptFile = this._scriptFileForTarget.valuesArray()[0];
                var addSourceMapURLLabel = WebInspector.UIString(WebInspector.useLowerCaseMenuTitles() ? "Add source map\u2026" : "Add Source Map\u2026");
                contextMenu.appendItem(addSourceMapURLLabel, addSourceMapURL.bind(this, scriptFile));
                contextMenu.appendSeparator();
            }
        }
    },

    _workingCopyChanged: function(event)
    {
        if (this._supportsEnabledBreakpointsWhileEditing() || this._scriptFileForTarget.size)
            return;

        if (this._uiSourceCode.isDirty())
            this._muteBreakpointsWhileEditing();
        else
            this._restoreBreakpointsAfterEditing();
    },

    _workingCopyCommitted: function(event)
    {
        if (this._supportsEnabledBreakpointsWhileEditing())
            return;

        if (!this._scriptFileForTarget.size) {
            this._restoreBreakpointsAfterEditing();
            return;
        }

        var liveEditError;
        var liveEditErrorData;
        var contextScript;
        var succeededEdits = 0;
        var failedEdits = 0;

        /**
         * @this {WebInspector.JavaScriptSourceFrame}
         * @param {?string} error
         * @param {!DebuggerAgent.SetScriptSourceError=} errorData
         * @param {!WebInspector.Script=} script
         */
        function liveEditCallback(error, errorData, script)
        {
            if (error) {
                liveEditError = error;
                liveEditErrorData = errorData;
                contextScript = script;
                failedEdits++;
            } else
                succeededEdits++;

            if (succeededEdits + failedEdits !== scriptFiles.length)
                return;

            if (!failedEdits)
                WebInspector.console.log(WebInspector.UIString("Recompilation and update succeeded."));
            else
                logLiveEditError(liveEditError, liveEditErrorData, contextScript)
            this._scriptsPanel.setIgnoreExecutionLineEvents(false);
        }

        /**
         * @param {?string} error
         * @param {!DebuggerAgent.SetScriptSourceError=} errorData
         * @param {!WebInspector.Script=} contextScript
         */
        function logLiveEditError(error, errorData, contextScript)
        {
            var warningLevel = WebInspector.Console.MessageLevel.Warning;
            if (!errorData) {
                if (error)
                    WebInspector.console.addMessage(WebInspector.UIString("LiveEdit failed: %s", error), warningLevel);
                return;
            }
            var compileError = errorData.compileError;
            if (compileError) {
                var location = contextScript ? WebInspector.UIString(" at %s:%d:%d", contextScript.sourceURL, compileError.lineNumber, compileError.columnNumber) : "";
                var message = WebInspector.UIString("LiveEdit compile failed: %s%s", compileError.message, location);
                WebInspector.console.error(message);
            } else {
                WebInspector.console.addMessage(WebInspector.UIString("Unknown LiveEdit error: %s; %s", JSON.stringify(errorData), error), warningLevel);
            }
        }

        this._scriptsPanel.setIgnoreExecutionLineEvents(true);
        this._hasCommittedLiveEdit = true;
        var scriptFiles = this._scriptFileForTarget.valuesArray();
        for (var i = 0; i < scriptFiles.length; ++i)
            scriptFiles[i].commitLiveEdit(liveEditCallback.bind(this));
    },

    _didMergeToVM: function()
    {
        if (this._supportsEnabledBreakpointsWhileEditing())
            return;
        this._updateDivergedInfobar();
        this._restoreBreakpointsIfConsistentScripts();
    },

    _didDivergeFromVM: function()
    {
        if (this._supportsEnabledBreakpointsWhileEditing())
            return;
        this._updateDivergedInfobar();
        this._muteBreakpointsWhileEditing();
    },

    _muteBreakpointsWhileEditing: function()
    {
        if (this._muted)
            return;
        for (var lineNumber = 0; lineNumber < this._textEditor.linesCount; ++lineNumber) {
            var breakpointDecoration = this._textEditor.getAttribute(lineNumber, "breakpoint");
            if (!breakpointDecoration)
                continue;
            this._removeBreakpointDecoration(lineNumber);
            this._addBreakpointDecoration(lineNumber, breakpointDecoration.columnNumber, breakpointDecoration.condition, breakpointDecoration.enabled, true);
        }
        this._muted = true;
    },

    _updateDivergedInfobar: function()
    {
        if (this._uiSourceCode.project().type() !== WebInspector.projectTypes.FileSystem) {
            this._hideDivergedInfobar();
            return;
        }

        var scriptFiles = this._scriptFileForTarget.valuesArray();
        var hasDivergedScript = false;
        for (var i = 0; i < scriptFiles.length; ++i)
            hasDivergedScript = hasDivergedScript || scriptFiles[i].hasDivergedFromVM();

        if (this._divergedInfobar) {
            if (!hasDivergedScript || this._hasCommittedLiveEdit)
                this._hideDivergedInfobar();
        } else {
            if (hasDivergedScript && !this._uiSourceCode.isDirty() && !this._hasCommittedLiveEdit)
                this._showDivergedInfobar();
        }
    },

    _supportsEnabledBreakpointsWhileEditing: function()
    {
        return this._uiSourceCode.project().type() === WebInspector.projectTypes.Snippets;
    },

    _restoreBreakpointsIfConsistentScripts: function()
    {
        var scriptFiles = this._scriptFileForTarget.valuesArray();
        for (var i = 0; i < scriptFiles.length; ++i)
            if (scriptFiles[i].hasDivergedFromVM() || scriptFiles[i].isMergingToVM())
                return;

        this._restoreBreakpointsAfterEditing();
    },

    _restoreBreakpointsAfterEditing: function()
    {
        delete this._muted;
        var breakpoints = {};
        // Save and remove muted breakpoint decorations.
        for (var lineNumber = 0; lineNumber < this._textEditor.linesCount; ++lineNumber) {
            var breakpointDecoration = this._textEditor.getAttribute(lineNumber, "breakpoint");
            if (breakpointDecoration) {
                breakpoints[lineNumber] = breakpointDecoration;
                this._removeBreakpointDecoration(lineNumber);
            }
        }

        // Remove all breakpoints.
        this._removeAllBreakpoints();

        // Restore all breakpoints from saved decorations.
        for (var lineNumberString in breakpoints) {
            var lineNumber = parseInt(lineNumberString, 10);
            if (isNaN(lineNumber))
                continue;
            var breakpointDecoration = breakpoints[lineNumberString];
            this._setBreakpoint(lineNumber, breakpointDecoration.columnNumber, breakpointDecoration.condition, breakpointDecoration.enabled);
        }
    },

    _removeAllBreakpoints: function()
    {
        var breakpoints = this._breakpointManager.breakpointsForUISourceCode(this._uiSourceCode);
        for (var i = 0; i < breakpoints.length; ++i)
            breakpoints[i].remove();
    },

    _getPopoverAnchor: function(element, event)
    {
        var target = WebInspector.context.flavor(WebInspector.Target);
        if (!target || !target.debuggerModel.isPaused())
            return;

        var textPosition = this.textEditor.coordinatesToCursorPosition(event.x, event.y);
        if (!textPosition)
            return;
        var mouseLine = textPosition.startLine;
        var mouseColumn = textPosition.startColumn;
        var textSelection = this.textEditor.selection().normalize();
        if (textSelection && !textSelection.isEmpty()) {
            if (textSelection.startLine !== textSelection.endLine || textSelection.startLine !== mouseLine || mouseColumn < textSelection.startColumn || mouseColumn > textSelection.endColumn)
                return;

            var leftCorner = this.textEditor.cursorPositionToCoordinates(textSelection.startLine, textSelection.startColumn);
            var rightCorner = this.textEditor.cursorPositionToCoordinates(textSelection.endLine, textSelection.endColumn);
            var anchorBox = new AnchorBox(leftCorner.x, leftCorner.y, rightCorner.x - leftCorner.x, leftCorner.height);
            anchorBox.highlight = {
                lineNumber: textSelection.startLine,
                startColumn: textSelection.startColumn,
                endColumn: textSelection.endColumn - 1
            };
            anchorBox.forSelection = true;
            return anchorBox;
        }

        var token = this.textEditor.tokenAtTextPosition(textPosition.startLine, textPosition.startColumn);
        if (!token)
            return;
        var lineNumber = textPosition.startLine;
        var line = this.textEditor.line(lineNumber);
        var tokenContent = line.substring(token.startColumn, token.endColumn);

        var isIdentifier = token.type.startsWith("js-variable") || token.type.startsWith("js-property") || token.type == "js-def";
        if (!isIdentifier && (token.type !== "js-keyword" || tokenContent !== "this"))
            return;

        var leftCorner = this.textEditor.cursorPositionToCoordinates(lineNumber, token.startColumn);
        var rightCorner = this.textEditor.cursorPositionToCoordinates(lineNumber, token.endColumn - 1);
        var anchorBox = new AnchorBox(leftCorner.x, leftCorner.y, rightCorner.x - leftCorner.x, leftCorner.height);

        anchorBox.highlight = {
            lineNumber: lineNumber,
            startColumn: token.startColumn,
            endColumn: token.endColumn - 1
        };

        return anchorBox;
    },

    _resolveObjectForPopover: function(anchorBox, showCallback, objectGroupName)
    {
        var target = WebInspector.context.flavor(WebInspector.Target);
        if (!target || !target.debuggerModel.isPaused()) {
            this._popoverHelper.hidePopover();
            return;
        }
        var lineNumber = anchorBox.highlight.lineNumber;
        var startHighlight = anchorBox.highlight.startColumn;
        var endHighlight = anchorBox.highlight.endColumn;
        var line = this.textEditor.line(lineNumber);
        if (!anchorBox.forSelection) {
            while (startHighlight > 1 && line.charAt(startHighlight - 1) === '.') {
                var token = this.textEditor.tokenAtTextPosition(lineNumber, startHighlight - 2);
                if (!token) {
                    this._popoverHelper.hidePopover();
                    return;
                }
                startHighlight = token.startColumn;
            }
        }
        var evaluationText = line.substring(startHighlight, endHighlight + 1);
        var selectedCallFrame = target.debuggerModel.selectedCallFrame();
        selectedCallFrame.evaluate(evaluationText, objectGroupName, false, true, false, false, showObjectPopover.bind(this));

        /**
         * @param {?RuntimeAgent.RemoteObject} result
         * @param {boolean=} wasThrown
         * @this {WebInspector.JavaScriptSourceFrame}
         */
        function showObjectPopover(result, wasThrown)
        {
            var target = WebInspector.context.flavor(WebInspector.Target);
            if (selectedCallFrame.target() != target || !target.debuggerModel.isPaused() || !result) {
                this._popoverHelper.hidePopover();
                return;
            }
            this._popoverAnchorBox = anchorBox;
            showCallback(target.runtimeModel.createRemoteObject(result), wasThrown, this._popoverAnchorBox);
            // Popover may have been removed by showCallback().
            if (this._popoverAnchorBox) {
                var highlightRange = new WebInspector.TextRange(lineNumber, startHighlight, lineNumber, endHighlight);
                this._popoverAnchorBox._highlightDescriptor = this.textEditor.highlightRange(highlightRange, "source-frame-eval-expression");
            }
        }
    },

    _onHidePopover: function()
    {
        if (!this._popoverAnchorBox)
            return;
        if (this._popoverAnchorBox._highlightDescriptor)
            this.textEditor.removeHighlight(this._popoverAnchorBox._highlightDescriptor);
        delete this._popoverAnchorBox;
    },

    /**
     * @param {number} lineNumber
     * @param {number} columnNumber
     * @param {string} condition
     * @param {boolean} enabled
     * @param {boolean} mutedWhileEditing
     */
    _addBreakpointDecoration: function(lineNumber, columnNumber, condition, enabled, mutedWhileEditing)
    {
        var breakpoint = {
            condition: condition,
            enabled: enabled,
            columnNumber: columnNumber
        };

        this.textEditor.setAttribute(lineNumber, "breakpoint", breakpoint);

        var disabled = !enabled || mutedWhileEditing;
        this.textEditor.addBreakpoint(lineNumber, disabled, !!condition);
    },

    _removeBreakpointDecoration: function(lineNumber)
    {
        this.textEditor.removeAttribute(lineNumber, "breakpoint");
        this.textEditor.removeBreakpoint(lineNumber);
    },

    _onKeyDown: function(event)
    {
        if (event.keyIdentifier === "U+001B") { // Escape key
            if (this._popoverHelper.isPopoverVisible()) {
                this._popoverHelper.hidePopover();
                event.consume();
            }
        }
    },

    /**
     * @param {number} lineNumber
     * @param {!WebInspector.BreakpointManager.Breakpoint=} breakpoint
     */
    _editBreakpointCondition: function(lineNumber, breakpoint)
    {
        this._conditionElement = this._createConditionElement(lineNumber);
        this.textEditor.addDecoration(lineNumber, this._conditionElement);

        /**
         * @this {WebInspector.JavaScriptSourceFrame}
         */
        function finishEditing(committed, element, newText)
        {
            this.textEditor.removeDecoration(lineNumber, this._conditionElement);
            delete this._conditionEditorElement;
            delete this._conditionElement;
            if (!committed)
                return;

            if (breakpoint)
                breakpoint.setCondition(newText);
            else
                this._setBreakpoint(lineNumber, 0, newText, true);
        }

        var config = new WebInspector.InplaceEditor.Config(finishEditing.bind(this, true), finishEditing.bind(this, false));
        WebInspector.InplaceEditor.startEditing(this._conditionEditorElement, config);
        this._conditionEditorElement.value = breakpoint ? breakpoint.condition() : "";
        this._conditionEditorElement.select();
    },

    _createConditionElement: function(lineNumber)
    {
        var conditionElement = createElementWithClass("div", "source-frame-breakpoint-condition");

        var labelElement = conditionElement.createChild("label", "source-frame-breakpoint-message");
        labelElement.htmlFor = "source-frame-breakpoint-condition";
        labelElement.createTextChild(WebInspector.UIString("The breakpoint on line %d will stop only if this expression is true:", lineNumber + 1));

        var editorElement = conditionElement.createChild("input", "monospace");
        editorElement.id = "source-frame-breakpoint-condition";
        editorElement.type = "text";
        this._conditionEditorElement = editorElement;

        return conditionElement;
    },

    /**
     * @param {number} lineNumber
     */
    setExecutionLine: function(lineNumber)
    {
        this._executionLineNumber = lineNumber;
        if (this.loaded)
            this.textEditor.setExecutionLine(lineNumber);
    },

    clearExecutionLine: function()
    {
        if (this.loaded && typeof this._executionLineNumber === "number")
            this.textEditor.clearExecutionLine();
        delete this._executionLineNumber;
    },

    /**
     * @return {boolean}
     */
    _shouldIgnoreExternalBreakpointEvents: function()
    {
        if (this._supportsEnabledBreakpointsWhileEditing())
            return false;
        if (this._muted)
            return true;
        var scriptFiles = this._scriptFileForTarget.valuesArray();
        var hasDivergingOrMergingFile = false;
        for (var i = 0; i < scriptFiles.length; ++i)
            if (scriptFiles[i].isDivergingFromVM() || scriptFiles[i].isMergingToVM())
                return true;
        return false;
    },

    _breakpointAdded: function(event)
    {
        var uiLocation = /** @type {!WebInspector.UILocation} */ (event.data.uiLocation);
        if (uiLocation.uiSourceCode !== this._uiSourceCode)
            return;
        if (this._shouldIgnoreExternalBreakpointEvents())
            return;

        var breakpoint = /** @type {!WebInspector.BreakpointManager.Breakpoint} */ (event.data.breakpoint);
        if (this.loaded)
            this._addBreakpointDecoration(uiLocation.lineNumber, uiLocation.columnNumber, breakpoint.condition(), breakpoint.enabled(), false);
    },

    _breakpointRemoved: function(event)
    {
        var uiLocation = /** @type {!WebInspector.UILocation} */ (event.data.uiLocation);
        if (uiLocation.uiSourceCode !== this._uiSourceCode)
            return;
        if (this._shouldIgnoreExternalBreakpointEvents())
            return;

        var breakpoint = /** @type {!WebInspector.BreakpointManager.Breakpoint} */ (event.data.breakpoint);
        var remainingBreakpoint = this._breakpointManager.findBreakpointOnLine(this._uiSourceCode, uiLocation.lineNumber);
        if (!remainingBreakpoint && this.loaded)
            this._removeBreakpointDecoration(uiLocation.lineNumber);
    },

    _consoleMessageAdded: function(event)
    {
        var message = /** @type {!WebInspector.PresentationConsoleMessage} */ (event.data);
        if (this.loaded)
            this.addMessageToSource(message.lineNumber, message.originalMessage);
    },

    _consoleMessageRemoved: function(event)
    {
        var message = /** @type {!WebInspector.PresentationConsoleMessage} */ (event.data);
        if (this.loaded)
            this.removeMessageFromSource(message.lineNumber, message.originalMessage);
    },

    _consoleMessagesCleared: function(event)
    {
        this.clearMessages();
    },

    /**
     * @param {!WebInspector.Event} event
     */
    _onSourceMappingChanged: function(event)
    {
        var data = /** @type {{target: !WebInspector.Target}} */ (event.data);
        this._updateScriptFile(data.target);
        this._updateLinesWithoutMappingHighlight();
    },

    _updateLinesWithoutMappingHighlight: function()
    {
        var linesCount = this.textEditor.linesCount;
        for (var i = 0; i < linesCount; ++i) {
            var lineHasMapping = WebInspector.debuggerWorkspaceBinding.uiLineHasMapping(this._uiSourceCode, i);
            if (!lineHasMapping)
                this._hasLineWithoutMapping = true;
            if (this._hasLineWithoutMapping)
                this.textEditor.toggleLineClass(i, "cm-line-without-source-mapping", !lineHasMapping);
        }
    },

    /**
     * @param {!WebInspector.Target} target
     */
    _updateScriptFile: function(target)
    {
        var oldScriptFile = this._scriptFileForTarget.get(target);
        var newScriptFile = WebInspector.debuggerWorkspaceBinding.scriptFile(this._uiSourceCode, target);
        this._scriptFileForTarget.remove(target);
        if (oldScriptFile) {
            oldScriptFile.removeEventListener(WebInspector.ResourceScriptFile.Events.DidMergeToVM, this._didMergeToVM, this);
            oldScriptFile.removeEventListener(WebInspector.ResourceScriptFile.Events.DidDivergeFromVM, this._didDivergeFromVM, this);
            if (this._muted && !this._uiSourceCode.isDirty())
                this._restoreBreakpointsIfConsistentScripts();
        }
        if (newScriptFile)
            this._scriptFileForTarget.set(target, newScriptFile);

        delete this._hasCommittedLiveEdit;
        this._updateDivergedInfobar();

        if (newScriptFile) {
            newScriptFile.addEventListener(WebInspector.ResourceScriptFile.Events.DidMergeToVM, this._didMergeToVM, this);
            newScriptFile.addEventListener(WebInspector.ResourceScriptFile.Events.DidDivergeFromVM, this._didDivergeFromVM, this);
            if (this.loaded)
                newScriptFile.checkMapping();
        }
    },

    onTextEditorContentLoaded: function()
    {
        if (typeof this._executionLineNumber === "number")
            this.setExecutionLine(this._executionLineNumber);

        var breakpointLocations = this._breakpointManager.breakpointLocationsForUISourceCode(this._uiSourceCode);
        for (var i = 0; i < breakpointLocations.length; ++i)
            this._breakpointAdded({data:breakpointLocations[i]});

        var messages = WebInspector.presentationConsoleMessageHelper.consoleMessages(this._uiSourceCode);
        for (var i = 0; i < messages.length; ++i) {
            var message = messages[i];
            this.addMessageToSource(message.lineNumber, message.originalMessage);
        }

        var scriptFiles = this._scriptFileForTarget.valuesArray();
        for (var i = 0; i < scriptFiles.length; ++i)
            scriptFiles[i].checkMapping();

        this._updateLinesWithoutMappingHighlight();
    },

    /**
     * @param {!WebInspector.Event} event
     */
    _handleGutterClick: function(event)
    {
        if (this._muted)
            return;

        var eventData = /** @type {!WebInspector.TextEditor.GutterClickEventData} */ (event.data);
        var lineNumber = eventData.lineNumber;
        var eventObject = eventData.event;

        if (eventObject.button != 0 || eventObject.altKey || eventObject.ctrlKey || eventObject.metaKey)
            return;

        this._toggleBreakpoint(lineNumber, eventObject.shiftKey);
        eventObject.consume(true);
    },

    /**
     * @param {number} lineNumber
     * @param {boolean} onlyDisable
     */
    _toggleBreakpoint: function(lineNumber, onlyDisable)
    {
        var breakpoint = this._breakpointManager.findBreakpointOnLine(this._uiSourceCode, lineNumber);
        if (breakpoint) {
            if (onlyDisable)
                breakpoint.setEnabled(!breakpoint.enabled());
            else
                breakpoint.remove();
        } else
            this._setBreakpoint(lineNumber, 0, "", true);
    },

    toggleBreakpointOnCurrentLine: function()
    {
        if (this._muted)
            return;

        var selection = this.textEditor.selection();
        if (!selection)
            return;
        this._toggleBreakpoint(selection.startLine, false);
    },

    /**
     * @param {number} lineNumber
     * @param {number} columnNumber
     * @param {string} condition
     * @param {boolean} enabled
     */
    _setBreakpoint: function(lineNumber, columnNumber, condition, enabled)
    {
        this._breakpointManager.setBreakpoint(this._uiSourceCode, lineNumber, columnNumber, condition, enabled);

        WebInspector.notifications.dispatchEventToListeners(WebInspector.UserMetrics.UserAction, {
            action: WebInspector.UserMetrics.UserActionNames.SetBreakpoint,
            url: this._uiSourceCode.originURL(),
            line: lineNumber,
            enabled: enabled
        });
    },

    /**
     * @param {number} lineNumber
     */
    _continueToLine: function(lineNumber)
    {
        var executionContext = WebInspector.context.flavor(WebInspector.ExecutionContext);
        if (!executionContext)
            return;
        var rawLocation = WebInspector.debuggerWorkspaceBinding.uiLocationToRawLocation(executionContext.target(), this._uiSourceCode, lineNumber, 0);
        if (!rawLocation)
            return;
        this._scriptsPanel.continueToLocation(rawLocation);
    },

    dispose: function()
    {
        this._breakpointManager.removeEventListener(WebInspector.BreakpointManager.Events.BreakpointAdded, this._breakpointAdded, this);
        this._breakpointManager.removeEventListener(WebInspector.BreakpointManager.Events.BreakpointRemoved, this._breakpointRemoved, this);
        WebInspector.presentationConsoleMessageHelper.removeConsoleMessageEventListener(WebInspector.PresentationConsoleMessageHelper.Events.ConsoleMessageAdded, this._uiSourceCode, this._consoleMessageAdded, this);
        WebInspector.presentationConsoleMessageHelper.removeConsoleMessageEventListener(WebInspector.PresentationConsoleMessageHelper.Events.ConsoleMessageRemoved, this._uiSourceCode, this._consoleMessageRemoved, this);
        WebInspector.presentationConsoleMessageHelper.removeConsoleMessageEventListener(WebInspector.PresentationConsoleMessageHelper.Events.ConsoleMessagesCleared, this._uiSourceCode, this._consoleMessagesCleared, this);
        this._uiSourceCode.removeEventListener(WebInspector.UISourceCode.Events.SourceMappingChanged, this._onSourceMappingChanged, this);
        this._uiSourceCode.removeEventListener(WebInspector.UISourceCode.Events.WorkingCopyChanged, this._workingCopyChanged, this);
        this._uiSourceCode.removeEventListener(WebInspector.UISourceCode.Events.WorkingCopyCommitted, this._workingCopyCommitted, this);
        this._uiSourceCode.removeEventListener(WebInspector.UISourceCode.Events.TitleChanged, this._showBlackboxInfobarIfNeeded, this);
        WebInspector.settings.skipStackFramesPattern.removeChangeListener(this._showBlackboxInfobarIfNeeded, this);
        WebInspector.settings.skipContentScripts.removeChangeListener(this._showBlackboxInfobarIfNeeded, this);
        WebInspector.UISourceCodeFrame.prototype.dispose.call(this);
    },

    __proto__: WebInspector.UISourceCodeFrame.prototype
}
