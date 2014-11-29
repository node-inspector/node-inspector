/*
 * Copyright (C) 2010 Google Inc. All rights reserved.
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
 */
WebInspector.ShortcutsScreen = function()
{
    /** @type {!Object.<string, !WebInspector.ShortcutsSection>} */
    this._sections = {};
}

WebInspector.ShortcutsScreen.prototype = {
    /**
     * @param {string} name
     * @return {!WebInspector.ShortcutsSection}
     */
    section: function(name)
    {
        var section = this._sections[name];
        if (!section)
            this._sections[name] = section = new WebInspector.ShortcutsSection(name);
        return section;
    },

    /**
     * @return {!WebInspector.View}
     */
    createShortcutsTabView: function()
    {
        var orderedSections = [];
        for (var section in this._sections)
            orderedSections.push(this._sections[section]);
        function compareSections(a, b)
        {
            return a.order - b.order;
        }
        orderedSections.sort(compareSections);

        var view = new WebInspector.View();

        view.element.className = "settings-tab-container"; // Override
        view.element.createChild("header").createChild("h3").createTextChild(WebInspector.UIString("Shortcuts"));
        var scrollPane = view.element.createChild("div", "help-container-wrapper");
        var container = scrollPane.createChild("div");
        container.className = "help-content help-container";
        for (var i = 0; i < orderedSections.length; ++i)
            orderedSections[i].renderSection(container);

        var note = scrollPane.createChild("p", "help-footnote");
        note.appendChild(WebInspector.createDocumentationAnchor("shortcuts", WebInspector.UIString("Full list of keyboard shortcuts and gestures")));

        return view;
    }
}

/**
 * We cannot initialize it here as localized strings are not loaded yet.
 * @type {!WebInspector.ShortcutsScreen}
 */
WebInspector.shortcutsScreen;

/**
 * @constructor
 * @param {string} name
 */
WebInspector.ShortcutsSection = function(name)
{
    this.name = name;
    this._lines = /** @type {!Array.<!{key: !Node, text: string}>} */ ([]);
    this.order = ++WebInspector.ShortcutsSection._sequenceNumber;
};

WebInspector.ShortcutsSection._sequenceNumber = 0;

WebInspector.ShortcutsSection.prototype = {
    /**
     * @param {!WebInspector.KeyboardShortcut.Descriptor} key
     * @param {string} description
     */
    addKey: function(key, description)
    {
        this._addLine(this._renderKey(key), description);
    },

    /**
     * @param {!Array.<!WebInspector.KeyboardShortcut.Descriptor>} keys
     * @param {string} description
     */
    addRelatedKeys: function(keys, description)
    {
        this._addLine(this._renderSequence(keys, "/"), description);
    },

    /**
     * @param {!Array.<!WebInspector.KeyboardShortcut.Descriptor>} keys
     * @param {string} description
     */
    addAlternateKeys: function(keys, description)
    {
        this._addLine(this._renderSequence(keys, WebInspector.UIString("or")), description);
    },

    /**
     * @param {!Node} keyElement
     * @param {string} description
     */
    _addLine: function(keyElement, description)
    {
        this._lines.push({ key: keyElement, text: description })
    },

    /**
     * @param {!Element} container
     */
    renderSection: function(container)
    {
        var parent = container.createChild("div", "help-block");

        var headLine = parent.createChild("div", "help-line");
        headLine.createChild("div", "help-key-cell");
        headLine.createChild("div", "help-section-title help-cell").textContent = this.name;

        for (var i = 0; i < this._lines.length; ++i) {
            var line = parent.createChild("div", "help-line");
            var keyCell = line.createChild("div", "help-key-cell");
            keyCell.appendChild(this._lines[i].key);
            keyCell.appendChild(this._createSpan("help-key-delimiter", ":"));
            line.createChild("div", "help-cell").textContent = this._lines[i].text;
        }
    },

    /**
     * @param {!Array.<!WebInspector.KeyboardShortcut.Descriptor>} sequence
     * @param {string} delimiter
     * @return {!Node}
     */
    _renderSequence: function(sequence, delimiter)
    {
        var delimiterSpan = this._createSpan("help-key-delimiter", delimiter);
        return this._joinNodes(sequence.map(this._renderKey.bind(this)), delimiterSpan);
    },

    /**
     * @param {!WebInspector.KeyboardShortcut.Descriptor} key
     * @return {!Node}
     */
    _renderKey: function(key)
    {
        var keyName = key.name;
        var plus = this._createSpan("help-combine-keys", "+");
        return this._joinNodes(keyName.split(" + ").map(this._createSpan.bind(this, "help-key")), plus);
    },

    /**
     * @param {string} className
     * @param {string} textContent
     * @return {!Element}
     */
    _createSpan: function(className, textContent)
    {
        var node = createElement("span");
        node.className = className;
        node.textContent = textContent;
        return node;
    },

    /**
     * @param {!Array.<!Element>} nodes
     * @param {!Element} delimiter
     * @return {!Node}
     */
    _joinNodes: function(nodes, delimiter)
    {
        var result = createDocumentFragment();
        for (var i = 0; i < nodes.length; ++i) {
            if (i > 0)
                result.appendChild(delimiter.cloneNode(true));
            result.appendChild(nodes[i]);
        }
        return result;
    }
}

WebInspector.ShortcutsScreen.registerShortcuts = function()
{
    // Elements panel
    var elementsSection = WebInspector.shortcutsScreen.section(WebInspector.UIString("Elements Panel"));

    var navigate = WebInspector.ShortcutsScreen.ElementsPanelShortcuts.NavigateUp.concat(WebInspector.ShortcutsScreen.ElementsPanelShortcuts.NavigateDown);
    elementsSection.addRelatedKeys(navigate, WebInspector.UIString("Navigate elements"));

    var expandCollapse = WebInspector.ShortcutsScreen.ElementsPanelShortcuts.Expand.concat(WebInspector.ShortcutsScreen.ElementsPanelShortcuts.Collapse);
    elementsSection.addRelatedKeys(expandCollapse, WebInspector.UIString("Expand/collapse"));

    elementsSection.addAlternateKeys(WebInspector.ShortcutsScreen.ElementsPanelShortcuts.EditAttribute, WebInspector.UIString("Edit attribute"));
    elementsSection.addAlternateKeys(WebInspector.ShortcutsScreen.ElementsPanelShortcuts.HideElement, WebInspector.UIString("Hide element"));
    elementsSection.addAlternateKeys(WebInspector.ShortcutsScreen.ElementsPanelShortcuts.ToggleEditAsHTML, WebInspector.UIString("Toggle edit as HTML"));

    var stylesPaneSection = WebInspector.shortcutsScreen.section(WebInspector.UIString("Styles Pane"));

    var nextPreviousProperty = WebInspector.ShortcutsScreen.ElementsPanelShortcuts.NextProperty.concat(WebInspector.ShortcutsScreen.ElementsPanelShortcuts.PreviousProperty);
    stylesPaneSection.addRelatedKeys(nextPreviousProperty, WebInspector.UIString("Next/previous property"));

    stylesPaneSection.addRelatedKeys(WebInspector.ShortcutsScreen.ElementsPanelShortcuts.IncrementValue, WebInspector.UIString("Increment value"));
    stylesPaneSection.addRelatedKeys(WebInspector.ShortcutsScreen.ElementsPanelShortcuts.DecrementValue, WebInspector.UIString("Decrement value"));

    stylesPaneSection.addAlternateKeys(WebInspector.ShortcutsScreen.ElementsPanelShortcuts.IncrementBy10, WebInspector.UIString("Increment by %f", 10));
    stylesPaneSection.addAlternateKeys(WebInspector.ShortcutsScreen.ElementsPanelShortcuts.DecrementBy10, WebInspector.UIString("Decrement by %f", 10));

    stylesPaneSection.addAlternateKeys(WebInspector.ShortcutsScreen.ElementsPanelShortcuts.IncrementBy100, WebInspector.UIString("Increment by %f", 100));
    stylesPaneSection.addAlternateKeys(WebInspector.ShortcutsScreen.ElementsPanelShortcuts.DecrementBy100, WebInspector.UIString("Decrement by %f", 100));

    stylesPaneSection.addAlternateKeys(WebInspector.ShortcutsScreen.ElementsPanelShortcuts.IncrementBy01, WebInspector.UIString("Increment by %f", 0.1));
    stylesPaneSection.addAlternateKeys(WebInspector.ShortcutsScreen.ElementsPanelShortcuts.DecrementBy01, WebInspector.UIString("Decrement by %f", 0.1));


    // Debugger
    var section = WebInspector.shortcutsScreen.section(WebInspector.UIString("Debugger"));

    section.addAlternateKeys(WebInspector.shortcutRegistry.shortcutDescriptorsForAction("debugger.toggle-pause"), WebInspector.UIString("Pause/Continue"));
    section.addAlternateKeys(WebInspector.ShortcutsScreen.SourcesPanelShortcuts.StepOver, WebInspector.UIString("Step over"));
    section.addAlternateKeys(WebInspector.ShortcutsScreen.SourcesPanelShortcuts.StepInto, WebInspector.UIString("Step into"));
    section.addAlternateKeys(WebInspector.ShortcutsScreen.SourcesPanelShortcuts.StepOut, WebInspector.UIString("Step out"));

    var nextAndPrevFrameKeys = WebInspector.ShortcutsScreen.SourcesPanelShortcuts.NextCallFrame.concat(WebInspector.ShortcutsScreen.SourcesPanelShortcuts.PrevCallFrame);
    section.addRelatedKeys(nextAndPrevFrameKeys, WebInspector.UIString("Next/previous call frame"));

    section.addAlternateKeys(WebInspector.ShortcutsScreen.SourcesPanelShortcuts.EvaluateSelectionInConsole, WebInspector.UIString("Evaluate selection in console"));
    section.addAlternateKeys(WebInspector.ShortcutsScreen.SourcesPanelShortcuts.AddSelectionToWatch, WebInspector.UIString("Add selection to watch"));
    section.addAlternateKeys(WebInspector.ShortcutsScreen.SourcesPanelShortcuts.ToggleBreakpoint, WebInspector.UIString("Toggle breakpoint"));

    // Editing
    section = WebInspector.shortcutsScreen.section(WebInspector.UIString("Text Editor"));
    section.addAlternateKeys(WebInspector.ShortcutsScreen.SourcesPanelShortcuts.GoToMember, WebInspector.UIString("Go to member"));
    section.addAlternateKeys(WebInspector.ShortcutsScreen.SourcesPanelShortcuts.ToggleAutocompletion, WebInspector.UIString("Autocompletion"));
    section.addAlternateKeys(WebInspector.ShortcutsScreen.SourcesPanelShortcuts.GoToLine, WebInspector.UIString("Go to line"));
    section.addAlternateKeys(WebInspector.ShortcutsScreen.SourcesPanelShortcuts.JumpToPreviousLocation, WebInspector.UIString("Jump to previous editing location"));
    section.addAlternateKeys(WebInspector.ShortcutsScreen.SourcesPanelShortcuts.JumpToNextLocation, WebInspector.UIString("Jump to next editing location"));
    section.addAlternateKeys(WebInspector.ShortcutsScreen.SourcesPanelShortcuts.ToggleComment, WebInspector.UIString("Toggle comment"));
    section.addAlternateKeys(WebInspector.ShortcutsScreen.SourcesPanelShortcuts.IncreaseCSSUnitByOne, WebInspector.UIString("Increment CSS unit by 1"));
    section.addAlternateKeys(WebInspector.ShortcutsScreen.SourcesPanelShortcuts.DecreaseCSSUnitByOne, WebInspector.UIString("Decrement CSS unit by 1"));
    section.addAlternateKeys(WebInspector.ShortcutsScreen.SourcesPanelShortcuts.IncreaseCSSUnitByTen, WebInspector.UIString("Increment CSS unit by 10"));
    section.addAlternateKeys(WebInspector.ShortcutsScreen.SourcesPanelShortcuts.DecreaseCSSUnitByTen, WebInspector.UIString("Decrement CSS unit by 10"));
    section.addAlternateKeys(WebInspector.ShortcutsScreen.SourcesPanelShortcuts.SelectNextOccurrence, WebInspector.UIString("Select next occurrence"));
    section.addAlternateKeys(WebInspector.ShortcutsScreen.SourcesPanelShortcuts.SoftUndo, WebInspector.UIString("Soft undo"));
    section.addAlternateKeys(WebInspector.ShortcutsScreen.SourcesPanelShortcuts.GotoMatchingBracket, WebInspector.UIString("Go to matching bracket"));
    section.addAlternateKeys(WebInspector.ShortcutsScreen.SourcesPanelShortcuts.CloseEditorTab, WebInspector.UIString("Close editor tab"));
    section.addAlternateKeys(WebInspector.shortcutRegistry.shortcutDescriptorsForAction("sources.switch-file"), WebInspector.UIString("Switch between files with the same name and different extensions."));

    // Timeline panel
    section = WebInspector.shortcutsScreen.section(WebInspector.UIString("Timeline Panel"));
    section.addAlternateKeys(WebInspector.ShortcutsScreen.TimelinePanelShortcuts.StartStopRecording, WebInspector.UIString("Start/stop recording"));
    section.addAlternateKeys(WebInspector.ShortcutsScreen.TimelinePanelShortcuts.SaveToFile, WebInspector.UIString("Save timeline data"));
    section.addAlternateKeys(WebInspector.ShortcutsScreen.TimelinePanelShortcuts.LoadFromFile, WebInspector.UIString("Load timeline data"));


    // Profiles panel
    section = WebInspector.shortcutsScreen.section(WebInspector.UIString("Profiles Panel"));
    section.addAlternateKeys(WebInspector.ShortcutsScreen.ProfilesPanelShortcuts.StartStopRecording, WebInspector.UIString("Start/stop recording"));

    // Layers panel
    if (Runtime.experiments.isEnabled("layersPanel")) {
        section = WebInspector.shortcutsScreen.section(WebInspector.UIString("Layers Panel"));
        section.addAlternateKeys(WebInspector.ShortcutsScreen.LayersPanelShortcuts.ResetView, WebInspector.UIString("Reset view"));
        section.addAlternateKeys(WebInspector.ShortcutsScreen.LayersPanelShortcuts.PanMode, WebInspector.UIString("Switch to pan mode"));
        section.addAlternateKeys(WebInspector.ShortcutsScreen.LayersPanelShortcuts.RotateMode, WebInspector.UIString("Switch to rotate mode"));
        section.addAlternateKeys(WebInspector.ShortcutsScreen.LayersPanelShortcuts.TogglePanRotate, WebInspector.UIString("Temporarily toggle pan/rotate mode while held"));
        section.addAlternateKeys(WebInspector.ShortcutsScreen.LayersPanelShortcuts.ZoomIn, WebInspector.UIString("Zoom in"));
        section.addAlternateKeys(WebInspector.ShortcutsScreen.LayersPanelShortcuts.ZoomOut, WebInspector.UIString("Zoom out"));
        section.addRelatedKeys(WebInspector.ShortcutsScreen.LayersPanelShortcuts.Up.concat(WebInspector.ShortcutsScreen.LayersPanelShortcuts.Down), WebInspector.UIString("Pan or rotate up/down"));
        section.addRelatedKeys(WebInspector.ShortcutsScreen.LayersPanelShortcuts.Left.concat(WebInspector.ShortcutsScreen.LayersPanelShortcuts.Right), WebInspector.UIString("Pan or rotate left/right"));
    }
}

WebInspector.ShortcutsScreen.ElementsPanelShortcuts = {
    NavigateUp: [
        WebInspector.KeyboardShortcut.makeDescriptor(WebInspector.KeyboardShortcut.Keys.Up)
    ],

    NavigateDown: [
        WebInspector.KeyboardShortcut.makeDescriptor(WebInspector.KeyboardShortcut.Keys.Down)
    ],

    Expand: [
        WebInspector.KeyboardShortcut.makeDescriptor(WebInspector.KeyboardShortcut.Keys.Right)
    ],

    Collapse: [
        WebInspector.KeyboardShortcut.makeDescriptor(WebInspector.KeyboardShortcut.Keys.Left)
    ],

    EditAttribute: [
        WebInspector.KeyboardShortcut.makeDescriptor(WebInspector.KeyboardShortcut.Keys.Enter)
    ],

    HideElement: [
        WebInspector.KeyboardShortcut.makeDescriptor(WebInspector.KeyboardShortcut.Keys.H)
    ],

    ToggleEditAsHTML: [
        WebInspector.KeyboardShortcut.makeDescriptor(WebInspector.KeyboardShortcut.Keys.F2)
    ],

    NextProperty: [
        WebInspector.KeyboardShortcut.makeDescriptor(WebInspector.KeyboardShortcut.Keys.Tab)
    ],

    PreviousProperty: [
        WebInspector.KeyboardShortcut.makeDescriptor(WebInspector.KeyboardShortcut.Keys.Tab, WebInspector.KeyboardShortcut.Modifiers.Shift)
    ],

    IncrementValue: [
        WebInspector.KeyboardShortcut.makeDescriptor(WebInspector.KeyboardShortcut.Keys.Up)
    ],

    DecrementValue: [
        WebInspector.KeyboardShortcut.makeDescriptor(WebInspector.KeyboardShortcut.Keys.Down)
    ],

    IncrementBy10: [
        WebInspector.KeyboardShortcut.makeDescriptor(WebInspector.KeyboardShortcut.Keys.PageUp),
        WebInspector.KeyboardShortcut.makeDescriptor(WebInspector.KeyboardShortcut.Keys.Up, WebInspector.KeyboardShortcut.Modifiers.Shift)
    ],

    DecrementBy10: [
        WebInspector.KeyboardShortcut.makeDescriptor(WebInspector.KeyboardShortcut.Keys.PageDown),
        WebInspector.KeyboardShortcut.makeDescriptor(WebInspector.KeyboardShortcut.Keys.Down, WebInspector.KeyboardShortcut.Modifiers.Shift)
    ],

    IncrementBy100: [
        WebInspector.KeyboardShortcut.makeDescriptor(WebInspector.KeyboardShortcut.Keys.PageUp, WebInspector.KeyboardShortcut.Modifiers.Shift)
    ],

    DecrementBy100: [
        WebInspector.KeyboardShortcut.makeDescriptor(WebInspector.KeyboardShortcut.Keys.PageDown, WebInspector.KeyboardShortcut.Modifiers.Shift)
    ],

    IncrementBy01: [
        WebInspector.KeyboardShortcut.makeDescriptor(WebInspector.KeyboardShortcut.Keys.Up, WebInspector.KeyboardShortcut.Modifiers.Alt)
    ],

    DecrementBy01: [
        WebInspector.KeyboardShortcut.makeDescriptor(WebInspector.KeyboardShortcut.Keys.Down, WebInspector.KeyboardShortcut.Modifiers.Alt)
    ]
};

WebInspector.ShortcutsScreen.SourcesPanelShortcuts = {
    SelectNextOccurrence: [
        WebInspector.KeyboardShortcut.makeDescriptor("d", WebInspector.KeyboardShortcut.Modifiers.CtrlOrMeta)
    ],

    SoftUndo: [
        WebInspector.KeyboardShortcut.makeDescriptor("u", WebInspector.KeyboardShortcut.Modifiers.CtrlOrMeta)
    ],

    GotoMatchingBracket: [
        WebInspector.KeyboardShortcut.makeDescriptor("m", WebInspector.KeyboardShortcut.Modifiers.Ctrl)
    ],

    ToggleAutocompletion: [
        WebInspector.KeyboardShortcut.makeDescriptor(WebInspector.KeyboardShortcut.Keys.Space, WebInspector.KeyboardShortcut.Modifiers.Ctrl)
    ],

    IncreaseCSSUnitByOne: [
        WebInspector.KeyboardShortcut.makeDescriptor(WebInspector.KeyboardShortcut.Keys.Up, WebInspector.KeyboardShortcut.Modifiers.Alt)
    ],

    DecreaseCSSUnitByOne: [
        WebInspector.KeyboardShortcut.makeDescriptor(WebInspector.KeyboardShortcut.Keys.Down, WebInspector.KeyboardShortcut.Modifiers.Alt)
    ],

    IncreaseCSSUnitByTen: [
        WebInspector.KeyboardShortcut.makeDescriptor(WebInspector.KeyboardShortcut.Keys.PageUp, WebInspector.KeyboardShortcut.Modifiers.Alt)
    ],

    DecreaseCSSUnitByTen: [
        WebInspector.KeyboardShortcut.makeDescriptor(WebInspector.KeyboardShortcut.Keys.PageDown, WebInspector.KeyboardShortcut.Modifiers.Alt)
    ],

    RunSnippet: [
        WebInspector.KeyboardShortcut.makeDescriptor(WebInspector.KeyboardShortcut.Keys.Enter, WebInspector.KeyboardShortcut.Modifiers.CtrlOrMeta)
    ],

    StepOver: [
        WebInspector.KeyboardShortcut.makeDescriptor(WebInspector.KeyboardShortcut.Keys.F10),
        WebInspector.KeyboardShortcut.makeDescriptor(WebInspector.KeyboardShortcut.Keys.SingleQuote, WebInspector.KeyboardShortcut.Modifiers.CtrlOrMeta)
    ],

    StepInto: [
        WebInspector.KeyboardShortcut.makeDescriptor(WebInspector.KeyboardShortcut.Keys.F11),
        WebInspector.KeyboardShortcut.makeDescriptor(WebInspector.KeyboardShortcut.Keys.Semicolon, WebInspector.KeyboardShortcut.Modifiers.CtrlOrMeta)
    ],

    StepOut: [
        WebInspector.KeyboardShortcut.makeDescriptor(WebInspector.KeyboardShortcut.Keys.F11, WebInspector.KeyboardShortcut.Modifiers.Shift),
        WebInspector.KeyboardShortcut.makeDescriptor(WebInspector.KeyboardShortcut.Keys.Semicolon, WebInspector.KeyboardShortcut.Modifiers.Shift | WebInspector.KeyboardShortcut.Modifiers.CtrlOrMeta)
    ],

    EvaluateSelectionInConsole: [
        WebInspector.KeyboardShortcut.makeDescriptor("e", WebInspector.KeyboardShortcut.Modifiers.Shift | WebInspector.KeyboardShortcut.Modifiers.Ctrl)
    ],

    AddSelectionToWatch: [
        WebInspector.KeyboardShortcut.makeDescriptor("a", WebInspector.KeyboardShortcut.Modifiers.Shift | WebInspector.KeyboardShortcut.Modifiers.Ctrl)
    ],

    GoToMember: [
        WebInspector.KeyboardShortcut.makeDescriptor("p", WebInspector.KeyboardShortcut.Modifiers.CtrlOrMeta | WebInspector.KeyboardShortcut.Modifiers.Shift)
    ],

    GoToLine: [
        WebInspector.KeyboardShortcut.makeDescriptor("g", WebInspector.KeyboardShortcut.Modifiers.Ctrl)
    ],

    ToggleBreakpoint: [
        WebInspector.KeyboardShortcut.makeDescriptor("b", WebInspector.KeyboardShortcut.Modifiers.CtrlOrMeta)
    ],

    NextCallFrame: [
        WebInspector.KeyboardShortcut.makeDescriptor(WebInspector.KeyboardShortcut.Keys.Period, WebInspector.KeyboardShortcut.Modifiers.Ctrl)
    ],

    PrevCallFrame: [
        WebInspector.KeyboardShortcut.makeDescriptor(WebInspector.KeyboardShortcut.Keys.Comma, WebInspector.KeyboardShortcut.Modifiers.Ctrl)
    ],

    ToggleComment: [
        WebInspector.KeyboardShortcut.makeDescriptor(WebInspector.KeyboardShortcut.Keys.Slash, WebInspector.KeyboardShortcut.Modifiers.CtrlOrMeta)
    ],

    JumpToPreviousLocation: [
        WebInspector.KeyboardShortcut.makeDescriptor(WebInspector.KeyboardShortcut.Keys.Minus, WebInspector.KeyboardShortcut.Modifiers.Alt)
    ],

    JumpToNextLocation: [
        WebInspector.KeyboardShortcut.makeDescriptor(WebInspector.KeyboardShortcut.Keys.Plus, WebInspector.KeyboardShortcut.Modifiers.Alt)
    ],

    CloseEditorTab: [
        WebInspector.KeyboardShortcut.makeDescriptor("w", WebInspector.KeyboardShortcut.Modifiers.Alt)
    ],

    Save: [
        WebInspector.KeyboardShortcut.makeDescriptor("s", WebInspector.KeyboardShortcut.Modifiers.CtrlOrMeta)
    ],

    SaveAll: [
        WebInspector.KeyboardShortcut.makeDescriptor("s", WebInspector.KeyboardShortcut.Modifiers.CtrlOrMeta | WebInspector.KeyboardShortcut.Modifiers.ShiftOrOption)
    ],
};

WebInspector.ShortcutsScreen.TimelinePanelShortcuts = {
    StartStopRecording: [
        WebInspector.KeyboardShortcut.makeDescriptor("e", WebInspector.KeyboardShortcut.Modifiers.CtrlOrMeta)
    ],

    SaveToFile: [
        WebInspector.KeyboardShortcut.makeDescriptor("s", WebInspector.KeyboardShortcut.Modifiers.CtrlOrMeta)
    ],

    LoadFromFile: [
        WebInspector.KeyboardShortcut.makeDescriptor("o", WebInspector.KeyboardShortcut.Modifiers.CtrlOrMeta)
    ]
};

WebInspector.ShortcutsScreen.ProfilesPanelShortcuts = {
    StartStopRecording: [
        WebInspector.KeyboardShortcut.makeDescriptor("e", WebInspector.KeyboardShortcut.Modifiers.CtrlOrMeta)
    ]
};

WebInspector.ShortcutsScreen.LayersPanelShortcuts = {
    ResetView: [
        WebInspector.KeyboardShortcut.makeDescriptor("0")
    ],

    PanMode: [
        WebInspector.KeyboardShortcut.makeDescriptor("x")
    ],

    RotateMode: [
        WebInspector.KeyboardShortcut.makeDescriptor("v")
    ],

    TogglePanRotate: [
        WebInspector.KeyboardShortcut.makeDescriptor(WebInspector.KeyboardShortcut.Keys.Shift)
    ],

    ZoomIn: [
        WebInspector.KeyboardShortcut.makeDescriptor(WebInspector.KeyboardShortcut.Keys.Plus, WebInspector.KeyboardShortcut.Modifiers.Shift),
        WebInspector.KeyboardShortcut.makeDescriptor(WebInspector.KeyboardShortcut.Keys.NumpadPlus)
    ],

    ZoomOut: [
        WebInspector.KeyboardShortcut.makeDescriptor(WebInspector.KeyboardShortcut.Keys.Minus, WebInspector.KeyboardShortcut.Modifiers.Shift),
        WebInspector.KeyboardShortcut.makeDescriptor(WebInspector.KeyboardShortcut.Keys.NumpadMinus)
    ],

    Up: [
        WebInspector.KeyboardShortcut.makeDescriptor(WebInspector.KeyboardShortcut.Keys.Up),
        WebInspector.KeyboardShortcut.makeDescriptor("w")
    ],

    Down: [
        WebInspector.KeyboardShortcut.makeDescriptor(WebInspector.KeyboardShortcut.Keys.Down),
        WebInspector.KeyboardShortcut.makeDescriptor("s")
    ],

    Left: [
        WebInspector.KeyboardShortcut.makeDescriptor(WebInspector.KeyboardShortcut.Keys.Left),
        WebInspector.KeyboardShortcut.makeDescriptor("a")
    ],

    Right: [
        WebInspector.KeyboardShortcut.makeDescriptor(WebInspector.KeyboardShortcut.Keys.Right),
        WebInspector.KeyboardShortcut.makeDescriptor("d")
    ]
}
