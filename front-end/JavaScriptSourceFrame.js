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
 * @param {WebInspector.ScriptsPanel} scriptsPanel
 * @param {WebInspector.UISourceCode} uiSourceCode
 */
WebInspector.JavaScriptSourceFrame = function(scriptsPanel, uiSourceCode)
{
    this._scriptsPanel = scriptsPanel;
    this._breakpointManager = WebInspector.breakpointManager;
    this._uiSourceCode = uiSourceCode;

    WebInspector.UISourceCodeFrame.call(this, uiSourceCode);
    if (uiSourceCode.project().type() === WebInspector.projectTypes.Debugger)
        this.element.addStyleClass("source-frame-debugger-script");

    this._popoverHelper = new WebInspector.ObjectPopoverHelper(this.textEditor.element,
            this._getPopoverAnchor.bind(this), this._resolveObjectForPopover.bind(this), this._onHidePopover.bind(this), true);

    this.textEditor.element.addEventListener("keydown", this._onKeyDown.bind(this), true);

    this.textEditor.addEventListener(WebInspector.TextEditor.Events.GutterClick, this._handleGutterClick.bind(this), this);

    this.textEditor.element.addEventListener("mousedown", this._onMouseDownAndClick.bind(this, true), true);
    this.textEditor.element.addEventListener("click", this._onMouseDownAndClick.bind(this, false), true);


    this._breakpointManager.addEventListener(WebInspector.BreakpointManager.Events.BreakpointAdded, this._breakpointAdded, this);
    this._breakpointManager.addEventListener(WebInspector.BreakpointManager.Events.BreakpointRemoved, this._breakpointRemoved, this);

    this._uiSourceCode.addEventListener(WebInspector.UISourceCode.Events.ConsoleMessageAdded, this._consoleMessageAdded, this);
    this._uiSourceCode.addEventListener(WebInspector.UISourceCode.Events.ConsoleMessageRemoved, this._consoleMessageRemoved, this);
    this._uiSourceCode.addEventListener(WebInspector.UISourceCode.Events.ConsoleMessagesCleared, this._consoleMessagesCleared, this);
    this._uiSourceCode.addEventListener(WebInspector.UISourceCode.Events.SourceMappingChanged, this._onSourceMappingChanged, this);
    this._uiSourceCode.addEventListener(WebInspector.UISourceCode.Events.WorkingCopyChanged, this._workingCopyChanged, this);
    this._uiSourceCode.addEventListener(WebInspector.UISourceCode.Events.WorkingCopyCommitted, this._workingCopyCommitted, this);

    this._registerShortcuts();
    this._updateScriptFile();
}

WebInspector.JavaScriptSourceFrame.prototype = {
    _registerShortcuts: function()
    {
        var modifiers = WebInspector.KeyboardShortcut.Modifiers;
        this.addShortcut(WebInspector.KeyboardShortcut.makeKey("e", modifiers.Shift | modifiers.Ctrl), this._evaluateSelectionInConsole.bind(this));
    },

    /**
     * @param {Event=} event
     * @return {boolean}
     */
    _evaluateSelectionInConsole: function(event)
    {
        var selection = this.textEditor.selection();
        if (!selection || selection.isEmpty())
            return false;
        WebInspector.evaluateInConsole(this.textEditor.copyRange(selection));
        return true;
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

    populateLineGutterContextMenu: function(contextMenu, lineNumber)
    {
        contextMenu.appendItem(WebInspector.UIString(WebInspector.useLowerCaseMenuTitles() ? "Continue to here" : "Continue to Here"), this._continueToLine.bind(this, lineNumber));

        var breakpoint = this._breakpointManager.findBreakpoint(this._uiSourceCode, lineNumber);
        if (!breakpoint) {
            // This row doesn't have a breakpoint: We want to show Add Breakpoint and Add and Edit Breakpoint.
            contextMenu.appendItem(WebInspector.UIString(WebInspector.useLowerCaseMenuTitles() ? "Add breakpoint" : "Add Breakpoint"), this._setBreakpoint.bind(this, lineNumber, "", true));
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
            contextMenu.appendItem(addToWatchLabel, this._scriptsPanel.addToWatch.bind(this._scriptsPanel, selection));
            var evaluateLabel = WebInspector.UIString(WebInspector.useLowerCaseMenuTitles() ? "Evaluate in console" : "Evaluate in Console");
            contextMenu.appendItem(evaluateLabel, WebInspector.evaluateInConsole.bind(WebInspector, selection));
            contextMenu.appendSeparator();
        } else if (!this._uiSourceCode.isEditable() && this._uiSourceCode.contentType() === WebInspector.resourceTypes.Script) {
            function liveEdit(event)
            {
                var liveEditUISourceCode = WebInspector.liveEditSupport.uiSourceCodeForLiveEdit(this._uiSourceCode);
                this._scriptsPanel.showUISourceCode(liveEditUISourceCode, lineNumber)
            }

            // FIXME: Change condition above to explicitly check that current uiSourceCode is created by default debugger mapping
            // and move the code adding this menu item to generic context menu provider for UISourceCode.
            var liveEditLabel = WebInspector.UIString(WebInspector.useLowerCaseMenuTitles() ? "Live edit" : "Live Edit");
            contextMenu.appendItem(liveEditLabel, liveEdit.bind(this));
            contextMenu.appendSeparator();
        }
        WebInspector.UISourceCodeFrame.prototype.populateTextAreaContextMenu.call(this, contextMenu, lineNumber);
    },

    _workingCopyChanged: function(event)
    {
        if (this._supportsEnabledBreakpointsWhileEditing() || this._scriptFile)
            return;

        if (this._uiSourceCode.isDirty())
            this._muteBreakpointsWhileEditing();
        else
            this._restoreBreakpointsAfterEditing();
    },

    _workingCopyCommitted: function(event)
    {
        if (this._supportsEnabledBreakpointsWhileEditing() || this._scriptFile)
            return;
        this._restoreBreakpointsAfterEditing();
    },

    _didMergeToVM: function()
    {
        if (this._supportsEnabledBreakpointsWhileEditing())
            return;
        this._restoreBreakpointsAfterEditing();
    },

    _didDivergeFromVM: function()
    {
        if (this._supportsEnabledBreakpointsWhileEditing())
            return;
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
            this._addBreakpointDecoration(lineNumber, breakpointDecoration.condition, breakpointDecoration.enabled, true);
        }
        this._muted = true;
    },

    _supportsEnabledBreakpointsWhileEditing: function()
    {
        return this._uiSourceCode.project().type() === WebInspector.projectTypes.Snippets;
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
            this._setBreakpoint(lineNumber, breakpointDecoration.condition, breakpointDecoration.enabled);
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
        if (!WebInspector.debuggerModel.isPaused())
            return null;

        var textPosition = this.textEditor.coordinatesToCursorPosition(event.x, event.y);
        if (!textPosition)
            return null;
        var mouseLine = textPosition.startLine;
        var mouseColumn = textPosition.startColumn;
        var textSelection = this.textEditor.selection().normalize();
        if (textSelection && !textSelection.isEmpty()) {
            if (textSelection.startLine !== textSelection.endLine || textSelection.startLine !== mouseLine || mouseColumn < textSelection.startColumn || mouseColumn > textSelection.endColumn)
                return null;

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
            return null;
        var lineNumber = textPosition.startLine;
        var line = this.textEditor.line(lineNumber);
        var tokenContent = line.substring(token.startColumn, token.endColumn + 1);
        if (token.type !== "javascript-ident" && (token.type !== "javascript-keyword" || tokenContent !== "this"))
            return null;

        var leftCorner = this.textEditor.cursorPositionToCoordinates(lineNumber, token.startColumn);
        var rightCorner = this.textEditor.cursorPositionToCoordinates(lineNumber, token.endColumn + 1);
        var anchorBox = new AnchorBox(leftCorner.x, leftCorner.y, rightCorner.x - leftCorner.x, leftCorner.height);

        anchorBox.highlight = {
            lineNumber: lineNumber,
            startColumn: token.startColumn,
            endColumn: token.endColumn
        };

        return anchorBox;
    },

    _resolveObjectForPopover: function(anchorBox, showCallback, objectGroupName)
    {
        /**
         * @param {?RuntimeAgent.RemoteObject} result
         * @param {boolean=} wasThrown
         */
        function showObjectPopover(result, wasThrown)
        {
            if (!WebInspector.debuggerModel.isPaused()) {
                this._popoverHelper.hidePopover();
                return;
            }
            this._popoverAnchorBox = anchorBox;
            showCallback(WebInspector.RemoteObject.fromPayload(result), wasThrown, this._popoverAnchorBox);
            // Popover may have been removed by showCallback().
            if (this._popoverAnchorBox) {
                var highlightRange = new WebInspector.TextRange(lineNumber, startHighlight, lineNumber, endHighlight);
                this._popoverAnchorBox._highlightDescriptor = this.textEditor.highlightRange(highlightRange, "source-frame-eval-expression");
            }
        }

        if (!WebInspector.debuggerModel.isPaused()) {
            this._popoverHelper.hidePopover();
            return;
        }
        var lineNumber = anchorBox.highlight.lineNumber;
        var startHighlight = anchorBox.highlight.startColumn;
        var endHighlight = anchorBox.highlight.endColumn;
        var line = this.textEditor.line(lineNumber);
        if (!anchorBox.forSelection) {
            while (startHighlight > 1 && line.charAt(startHighlight - 1) === '.')
                startHighlight = this.textEditor.tokenAtTextPosition(lineNumber, startHighlight - 2).startColumn;
        }
        var evaluationText = line.substring(startHighlight, endHighlight + 1);
        var selectedCallFrame = WebInspector.debuggerModel.selectedCallFrame();
        selectedCallFrame.evaluate(evaluationText, objectGroupName, false, true, false, false, showObjectPopover.bind(this));
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
     * @param {string} condition
     * @param {boolean} enabled
     * @param {boolean} mutedWhileEditing
     */
    _addBreakpointDecoration: function(lineNumber, condition, enabled, mutedWhileEditing)
    {
        var breakpoint = {
            condition: condition,
            enabled: enabled
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
                return;
            }
            if (this._stepIntoMarkup && WebInspector.KeyboardShortcut.eventHasCtrlOrMeta(event)) {
                this._stepIntoMarkup.stoptIteratingSelection();
                event.consume();
                return;
            }
        }
    },

    /**
     * @param {number} lineNumber
     * @param {WebInspector.BreakpointManager.Breakpoint=} breakpoint
     */
    _editBreakpointCondition: function(lineNumber, breakpoint)
    {
        this._conditionElement = this._createConditionElement(lineNumber);
        this.textEditor.addDecoration(lineNumber, this._conditionElement);

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
                this._setBreakpoint(lineNumber, newText, true);
        }

        var config = new WebInspector.EditingConfig(finishEditing.bind(this, true), finishEditing.bind(this, false));
        WebInspector.startEditing(this._conditionEditorElement, config);
        this._conditionEditorElement.value = breakpoint ? breakpoint.condition() : "";
        this._conditionEditorElement.select();
    },

    _createConditionElement: function(lineNumber)
    {
        var conditionElement = document.createElement("div");
        conditionElement.className = "source-frame-breakpoint-condition";

        var labelElement = document.createElement("label");
        labelElement.className = "source-frame-breakpoint-message";
        labelElement.htmlFor = "source-frame-breakpoint-condition";
        labelElement.appendChild(document.createTextNode(WebInspector.UIString("The breakpoint on line %d will stop only if this expression is true:", lineNumber)));
        conditionElement.appendChild(labelElement);

        var editorElement = document.createElement("input");
        editorElement.id = "source-frame-breakpoint-condition";
        editorElement.className = "monospace";
        editorElement.type = "text";
        conditionElement.appendChild(editorElement);
        this._conditionEditorElement = editorElement;

        return conditionElement;
    },

    /**
     * @param {number} lineNumber
     * @param {WebInspector.DebuggerModel.CallFrame} callFrame
     */
    setExecutionLine: function(lineNumber, callFrame)
    {
        this._executionLineNumber = lineNumber;
        this._executionCallFrame = callFrame;
        if (this.loaded) {
            this.textEditor.setExecutionLine(lineNumber);

            if (WebInspector.experimentsSettings.stepIntoSelection.isEnabled()) {
                /**
                 * @param {Array.<DebuggerAgent.Location>} locations
                 */
                function locationsCallback(locations)
                {
                    if (this._executionCallFrame !== callFrame || this._stepIntoMarkup)
                        return;
                    this._stepIntoMarkup = WebInspector.JavaScriptSourceFrame.StepIntoMarkup.create(this, locations);
                    if (this._stepIntoMarkup)
                        this._stepIntoMarkup.show();
                }
                callFrame.getStepIntoLocations(locationsCallback.bind(this));
            }
        }
    },

    clearExecutionLine: function()
    {
        if (this._stepIntoMarkup) {
            this._stepIntoMarkup.dispose();
            delete this._stepIntoMarkup;
        }

        if (this.loaded && typeof this._executionLineNumber === "number")
            this.textEditor.clearExecutionLine();
        delete this._executionLineNumber;
        delete this._executionCallFrame;
    },

    _lineNumberAfterEditing: function(lineNumber, oldRange, newRange)
    {
        var shiftOffset = lineNumber <= oldRange.startLine ? 0 : newRange.linesCount - oldRange.linesCount;

        // Special case of editing the line itself. We should decide whether the line number should move below or not.
        if (lineNumber === oldRange.startLine) {
            var whiteSpacesRegex = /^[\s\xA0]*$/;
            for (var i = 0; lineNumber + i <= newRange.endLine; ++i) {
                if (!whiteSpacesRegex.test(this.textEditor.line(lineNumber + i))) {
                    shiftOffset = i;
                    break;
                }
            }
        }

        var newLineNumber = Math.max(0, lineNumber + shiftOffset);
        if (oldRange.startLine < lineNumber && lineNumber < oldRange.endLine)
            newLineNumber = oldRange.startLine;
        return newLineNumber;
    },

    _onMouseDownAndClick: function(isMouseDown, event)
    {
        var markup = this._stepIntoMarkup;
        if (!markup)
            return;
        var index = markup.findItemByCoordinates(event.x, event.y);
        if (typeof index === "undefined")
            return;

        if (isMouseDown) {
            // Do not let text editor to spoil 'click' event that is coming for us.
            event.consume();
        } else {
            var rawLocation = markup.getRawPosition(index);
            this._scriptsPanel.doStepIntoSelection(rawLocation);
        }
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
        return this._scriptFile && (this._scriptFile.isDivergingFromVM() || this._scriptFile.isMergingToVM());
    },

    _breakpointAdded: function(event)
    {
        var uiLocation = /** @type {WebInspector.UILocation} */ (event.data.uiLocation);
        if (uiLocation.uiSourceCode !== this._uiSourceCode)
            return;
        if (this._shouldIgnoreExternalBreakpointEvents())
            return;

        var breakpoint = /** @type {WebInspector.BreakpointManager.Breakpoint} */ (event.data.breakpoint);
        if (this.loaded)
            this._addBreakpointDecoration(uiLocation.lineNumber, breakpoint.condition(), breakpoint.enabled(), false);
    },

    _breakpointRemoved: function(event)
    {
        var uiLocation = /** @type {WebInspector.UILocation} */ (event.data.uiLocation);
        if (uiLocation.uiSourceCode !== this._uiSourceCode)
            return;
        if (this._shouldIgnoreExternalBreakpointEvents())
            return;

        var breakpoint = /** @type {WebInspector.BreakpointManager.Breakpoint} */ (event.data.breakpoint);
        var remainingBreakpoint = this._breakpointManager.findBreakpoint(this._uiSourceCode, uiLocation.lineNumber);
        if (!remainingBreakpoint && this.loaded)
            this._removeBreakpointDecoration(uiLocation.lineNumber);
    },

    _consoleMessageAdded: function(event)
    {
        var message = /** @type {WebInspector.PresentationConsoleMessage} */ (event.data);
        if (this.loaded)
            this.addMessageToSource(message.lineNumber, message.originalMessage);
    },

    _consoleMessageRemoved: function(event)
    {
        var message = /** @type {WebInspector.PresentationConsoleMessage} */ (event.data);
        if (this.loaded)
            this.removeMessageFromSource(message.lineNumber, message.originalMessage);
    },

    _consoleMessagesCleared: function(event)
    {
        this.clearMessages();
    },

    /**
     * @param {WebInspector.Event} event
     */
    _onSourceMappingChanged: function(event)
    {
        this._updateScriptFile();
    },

    _updateScriptFile: function()
    {
        if (this._scriptFile) {
            this._scriptFile.removeEventListener(WebInspector.ScriptFile.Events.DidMergeToVM, this._didMergeToVM, this);
            this._scriptFile.removeEventListener(WebInspector.ScriptFile.Events.DidDivergeFromVM, this._didDivergeFromVM, this);
            if (this._muted && !this._uiSourceCode.isDirty())
                this._restoreBreakpointsAfterEditing();
        }
        this._scriptFile = this._uiSourceCode.scriptFile();
        if (this._scriptFile) {
            this._scriptFile.addEventListener(WebInspector.ScriptFile.Events.DidMergeToVM, this._didMergeToVM, this);
            this._scriptFile.addEventListener(WebInspector.ScriptFile.Events.DidDivergeFromVM, this._didDivergeFromVM, this);

            if (this.loaded)
                this._scriptFile.checkMapping();
        }
    },

    onTextEditorContentLoaded: function()
    {
        if (typeof this._executionLineNumber === "number")
            this.setExecutionLine(this._executionLineNumber, this._executionCallFrame);

        var breakpointLocations = this._breakpointManager.breakpointLocationsForUISourceCode(this._uiSourceCode);
        for (var i = 0; i < breakpointLocations.length; ++i)
            this._breakpointAdded({data:breakpointLocations[i]});

        var messages = this._uiSourceCode.consoleMessages();
        for (var i = 0; i < messages.length; ++i) {
            var message = messages[i];
            this.addMessageToSource(message.lineNumber, message.originalMessage);
        }

        if (this._scriptFile)
            this._scriptFile.checkMapping();
    },

    /**
     * @param {Event} event
     */
    _handleGutterClick: function(event)
    {
        if (this._muted)
            return;

        var eventData = /** @type {WebInspector.TextEditor.GutterClickEventData} */ (event.data);
        var lineNumber = eventData.lineNumber;
        var eventObject = /** @type {Event} */ (eventData.event);

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
        var breakpoint = this._breakpointManager.findBreakpoint(this._uiSourceCode, lineNumber);
        if (breakpoint) {
            if (onlyDisable)
                breakpoint.setEnabled(!breakpoint.enabled());
            else
                breakpoint.remove();
        } else
            this._setBreakpoint(lineNumber, "", true);
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
     * @param {string} condition
     * @param {boolean} enabled
     */
    _setBreakpoint: function(lineNumber, condition, enabled)
    {
        this._breakpointManager.setBreakpoint(this._uiSourceCode, lineNumber, condition, enabled);

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
        var rawLocation = /** @type {WebInspector.DebuggerModel.Location} */ (this._uiSourceCode.uiLocationToRawLocation(lineNumber, 0));
        this._scriptsPanel.continueToLocation(rawLocation);
    },

    /**
     * @return {WebInspector.JavaScriptSourceFrame.StepIntoMarkup|undefined}
     */
    stepIntoMarkup: function()
    {
        return this._stepIntoMarkup;
    },

    dispose: function()
    {
        this._breakpointManager.removeEventListener(WebInspector.BreakpointManager.Events.BreakpointAdded, this._breakpointAdded, this);
        this._breakpointManager.removeEventListener(WebInspector.BreakpointManager.Events.BreakpointRemoved, this._breakpointRemoved, this);
        this._uiSourceCode.removeEventListener(WebInspector.UISourceCode.Events.ConsoleMessageAdded, this._consoleMessageAdded, this);
        this._uiSourceCode.removeEventListener(WebInspector.UISourceCode.Events.ConsoleMessageRemoved, this._consoleMessageRemoved, this);
        this._uiSourceCode.removeEventListener(WebInspector.UISourceCode.Events.ConsoleMessagesCleared, this._consoleMessagesCleared, this);
        this._uiSourceCode.removeEventListener(WebInspector.UISourceCode.Events.SourceMappingChanged, this._onSourceMappingChanged, this);
        this._uiSourceCode.removeEventListener(WebInspector.UISourceCode.Events.WorkingCopyChanged, this._workingCopyChanged, this);
        this._uiSourceCode.removeEventListener(WebInspector.UISourceCode.Events.WorkingCopyCommitted, this._workingCopyCommitted, this);
        WebInspector.UISourceCodeFrame.prototype.dispose.call(this);
    },

    __proto__: WebInspector.UISourceCodeFrame.prototype
}

/**
 * @constructor
 * @param {Array.<DebuggerAgent.Location>} rawPositions
 * @param {Array.<WebInspector.TextRange>} editorRanges
 * @param {number} firstToExecute
 * @param {WebInspector.JavaScriptSourceFrame} sourceFrame
 */
WebInspector.JavaScriptSourceFrame.StepIntoMarkup = function(rawPositions, editorRanges, firstToExecute, sourceFrame)
{
    this._positions = rawPositions;
    this._editorRanges = editorRanges;
    this._highlightDescriptors = new Array(rawPositions.length);
    this._currentHighlight = undefined;
    this._firstToExecute = firstToExecute;
    this._currentSelection = undefined;
    this._sourceFrame = sourceFrame;
};

WebInspector.JavaScriptSourceFrame.StepIntoMarkup.prototype = {
    show: function()
    {
        var highlight = this._getVisibleHighlight();
        for (var i = 0; i < this._positions.length; ++i)
            this._highlightItem(i, i === highlight);
        this._shownVisibleHighlight = highlight;
    },

    startIteratingSelection: function()
    {
        this._currentSelection = this._positions.length
        this._redrawHighlight();
    },

    stopIteratingSelection: function()
    {
        this._currentSelection = undefined;
        this._redrawHighlight();
    },

    /**
     * @param {boolean} backward
     */
    iterateSelection: function(backward)
    {
        if (typeof this._currentSelection === "undefined")
            return;
        var nextSelection = backward ? this._currentSelection - 1 : this._currentSelection + 1;
        var modulo = this._positions.length + 1;
        nextSelection = (nextSelection + modulo) % modulo;
        this._currentSelection = nextSelection;
        this._redrawHighlight();
    },

    _redrawHighlight: function()
    {
        var visibleHighlight = this._getVisibleHighlight();
        if (this._shownVisibleHighlight === visibleHighlight)
            return;
        this._hideItemHighlight(this._shownVisibleHighlight);
        this._hideItemHighlight(visibleHighlight);
        this._highlightItem(this._shownVisibleHighlight, false);
        this._highlightItem(visibleHighlight, true);
        this._shownVisibleHighlight = visibleHighlight;
    },

    /**
     * @return {number}
     */
    _getVisibleHighlight: function()
    {
        return typeof this._currentSelection === "undefined" ? this._firstToExecute : this._currentSelection;
    },

    /**
     * @param {number} position
     * @param {boolean} selected
     */
    _highlightItem: function(position, selected)
    {
        if (position === this._positions.length)
            return;
        var styleName = selected ? "source-frame-stepin-mark-highlighted" : "source-frame-stepin-mark";
        var textEditor = this._sourceFrame.textEditor;
        var highlightDescriptor = textEditor.highlightRange(this._editorRanges[position], styleName);
        this._highlightDescriptors[position] = highlightDescriptor;
    },

    /**
     * @param {number} position
     */
    _hideItemHighlight: function(position)
    {
        if (position === this._positions.length)
            return;
        var highlightDescriptor = this._highlightDescriptors[position];
        console.assert(highlightDescriptor);
        var textEditor = this._sourceFrame.textEditor;
        textEditor.removeHighlight(highlightDescriptor);
        this._highlightDescriptors[position] = undefined;
    },

    dispose: function()
    {
        for (var i = 0; i < this._positions.length; ++i)
            this._hideItemHighlight(i);
    },

    /**
     * @param {number} x
     * @param {number} y
     * @return {number|undefined}
     */
    findItemByCoordinates: function(x, y)
    {
        var textPosition = this._sourceFrame.textEditor.coordinatesToCursorPosition(x, y);
        if (!textPosition)
            return;

        var ranges = this._editorRanges;

        for (var i = 0; i < ranges.length; ++i) {
          var nextRange = ranges[i];
          if (nextRange.startLine == textPosition.startLine && nextRange.startColumn <= textPosition.startColumn && nextRange.endColumn >= textPosition.startColumn)
              return i;
        }
    },

    /**
     * @return {number|undefined}
     */
    getSelectedItemIndex: function()
    {
        if (this._currentSelection === this._positions.length)
            return undefined;
        return this._currentSelection;
    },

    /**
     * @return {WebInspector.DebuggerModel.Location}
     */
    getRawPosition: function(position)
    {
        return /** @type {WebInspector.DebuggerModel.Location} */ (this._positions[position]);
    }

};

/**
 * @param {WebInspector.JavaScriptSourceFrame} sourceFrame
 * @param {Array.<DebuggerAgent.Location>} stepIntoRawLocations
 * @return {?WebInspector.JavaScriptSourceFrame.StepIntoMarkup}
 */
WebInspector.JavaScriptSourceFrame.StepIntoMarkup.create = function(sourceFrame, stepIntoRawLocations)
{
    if (!stepIntoRawLocations.length)
        return null;

    var firstToExecute = stepIntoRawLocations[0];
    stepIntoRawLocations.sort(WebInspector.JavaScriptSourceFrame.StepIntoMarkup._Comparator);
    var firstToExecuteIndex = stepIntoRawLocations.indexOf(firstToExecute);

    var textEditor = sourceFrame.textEditor;
    var uiRanges = [];
    for (var i = 0; i < stepIntoRawLocations.length; ++i) {
        var uiLocation = WebInspector.debuggerModel.rawLocationToUILocation(/** @type {WebInspector.DebuggerModel.Location} */ (stepIntoRawLocations[i]));

        var token = textEditor.tokenAtTextPosition(uiLocation.lineNumber, uiLocation.columnNumber);
        var startColumn;
        var endColumn;
        if (token) {
            startColumn = token.startColumn;
            endColumn = token.endColumn;
        } else {
            startColumn = uiLocation.columnNumber;
            endColumn = uiLocation.columnNumber;
        }
        var range = new WebInspector.TextRange(uiLocation.lineNumber, startColumn, uiLocation.lineNumber, endColumn);
        uiRanges.push(range);
    }

    return new WebInspector.JavaScriptSourceFrame.StepIntoMarkup(stepIntoRawLocations, uiRanges, firstToExecuteIndex, sourceFrame);
};

/**
 * @param {DebuggerAgent.Location} locationA
 * @param {DebuggerAgent.Location} locationB
 * @return {number}
 */
WebInspector.JavaScriptSourceFrame.StepIntoMarkup._Comparator = function(locationA, locationB)
{
    if (locationA.lineNumber === locationB.lineNumber)
        return locationA.columnNumber - locationB.columnNumber;
    else
        return locationA.lineNumber - locationB.lineNumber;
};
