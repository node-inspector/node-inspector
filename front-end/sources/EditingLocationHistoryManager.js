/*
 * Copyright (C) 2014 Google Inc. All rights reserved.
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
 * @param {!WebInspector.SourcesView} sourcesView
 * @param {function():?WebInspector.SourceFrame} currentSourceFrameCallback
 */
WebInspector.EditingLocationHistoryManager = function(sourcesView, currentSourceFrameCallback)
{
    this._sourcesView = sourcesView;
    this._historyManager = new WebInspector.SimpleHistoryManager(WebInspector.EditingLocationHistoryManager.HistoryDepth);
    this._currentSourceFrameCallback = currentSourceFrameCallback;
}

WebInspector.EditingLocationHistoryManager.HistoryDepth = 20;

WebInspector.EditingLocationHistoryManager.prototype = {
    /**
     * @param {!WebInspector.UISourceCodeFrame} sourceFrame
     */
    trackSourceFrameCursorJumps: function(sourceFrame)
    {
        sourceFrame.addEventListener(WebInspector.SourceFrame.Events.JumpHappened, this._onJumpHappened.bind(this));
    },

    /**
     * @param {!WebInspector.Event} event
     */
    _onJumpHappened: function(event)
    {
        if (event.data.from)
            this._updateActiveState(event.data.from);
        if (event.data.to)
            this._pushActiveState(event.data.to);
    },

    rollback: function()
    {
        this._historyManager.rollback();
    },

    rollover: function()
    {
        this._historyManager.rollover();
    },

    updateCurrentState: function()
    {
        var sourceFrame = this._currentSourceFrameCallback();
        if (!sourceFrame)
            return;
        this._updateActiveState(sourceFrame.textEditor.selection());
    },

    pushNewState: function()
    {
        var sourceFrame = this._currentSourceFrameCallback();
        if (!sourceFrame)
            return;
        this._pushActiveState(sourceFrame.textEditor.selection());
    },

    /**
     * @param {!WebInspector.TextRange} selection
     */
    _updateActiveState: function(selection)
    {
        var active = this._historyManager.active();
        if (!active)
            return;
        var sourceFrame = this._currentSourceFrameCallback();
        if (!sourceFrame)
            return;
        var entry = new WebInspector.EditingLocationHistoryEntry(this._sourcesView, this, sourceFrame, selection);
        active.merge(entry);
    },

    /**
     * @param {!WebInspector.TextRange} selection
     */
    _pushActiveState: function(selection)
    {
        var sourceFrame = this._currentSourceFrameCallback();
        if (!sourceFrame)
            return;
        var entry = new WebInspector.EditingLocationHistoryEntry(this._sourcesView, this, sourceFrame, selection);
        this._historyManager.push(entry);
    },

    /**
     * @param {!WebInspector.UISourceCode} uiSourceCode
     */
    removeHistoryForSourceCode: function(uiSourceCode)
    {
        function filterOut(entry)
        {
            return entry._projectId === uiSourceCode.project().id() && entry._path === uiSourceCode.path();
        }

        this._historyManager.filterOut(filterOut);
    },
}


/**
 * @constructor
 * @implements {WebInspector.HistoryEntry}
 * @param {!WebInspector.SourcesView} sourcesView
 * @param {!WebInspector.EditingLocationHistoryManager} editingLocationManager
 * @param {!WebInspector.SourceFrame} sourceFrame
 * @param {!WebInspector.TextRange} selection
 */
WebInspector.EditingLocationHistoryEntry = function(sourcesView, editingLocationManager, sourceFrame, selection)
{
    this._sourcesView = sourcesView;
    this._editingLocationManager = editingLocationManager;
    var uiSourceCode = sourceFrame.uiSourceCode();
    this._projectId = uiSourceCode.project().id();
    this._path = uiSourceCode.path();

    var position = this._positionFromSelection(selection);
    this._positionHandle = sourceFrame.textEditor.textEditorPositionHandle(position.lineNumber, position.columnNumber);
}

WebInspector.EditingLocationHistoryEntry.prototype = {
    /**
     * @param {!WebInspector.HistoryEntry} entry
     */
    merge: function(entry)
    {
        if (this._projectId !== entry._projectId || this._path !== entry._path)
            return;
        this._positionHandle = entry._positionHandle;
    },

    /**
     * @param {!WebInspector.TextRange} selection
     * @return {!{lineNumber: number, columnNumber: number}}
     */
    _positionFromSelection: function(selection)
    {
        return {
            lineNumber: selection.endLine,
            columnNumber: selection.endColumn
        };
    },

    /**
     * @return {boolean}
     */
    valid: function()
    {
        var position = this._positionHandle.resolve();
        var uiSourceCode = WebInspector.workspace.project(this._projectId).uiSourceCode(this._path);
        return !!(position && uiSourceCode);
    },

    reveal: function()
    {
        var position = this._positionHandle.resolve();
        var uiSourceCode = WebInspector.workspace.project(this._projectId).uiSourceCode(this._path);
        if (!position || !uiSourceCode)
            return;

        this._editingLocationManager.updateCurrentState();
        this._sourcesView.showSourceLocation(uiSourceCode, position.lineNumber, position.columnNumber);
    }
};
