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
 * @implements {WebInspector.Searchable}
 * @extends {WebInspector.VBox}
 * @param {!WebInspector.CPUProfileHeader} profileHeader
 */
WebInspector.CPUProfileView = function(profileHeader)
{
    WebInspector.VBox.call(this);
    this.element.classList.add("cpu-profile-view");

    this._searchableView = new WebInspector.SearchableView(this);
    this._searchableView.show(this.element);

    this._viewType = WebInspector.settings.createSetting("cpuProfilerView", WebInspector.CPUProfileView._TypeHeavy);

    var columns = [];
    columns.push({id: "self", title: WebInspector.UIString("Self"), width: "120px", sort: WebInspector.DataGrid.Order.Descending, sortable: true});
    columns.push({id: "total", title: WebInspector.UIString("Total"), width: "120px", sortable: true});
    columns.push({id: "function", title: WebInspector.UIString("Function"), disclosure: true, sortable: true});

    this.dataGrid = new WebInspector.DataGrid(columns);
    this.dataGrid.addEventListener(WebInspector.DataGrid.Events.SortingChanged, this._sortProfile, this);

    this.viewSelectComboBox = new WebInspector.StatusBarComboBox(this._changeView.bind(this));

    var options = {};
    options[WebInspector.CPUProfileView._TypeFlame] = this.viewSelectComboBox.createOption(WebInspector.UIString("Chart"), "", WebInspector.CPUProfileView._TypeFlame);
    options[WebInspector.CPUProfileView._TypeHeavy] = this.viewSelectComboBox.createOption(WebInspector.UIString("Heavy (Bottom Up)"), "", WebInspector.CPUProfileView._TypeHeavy);
    options[WebInspector.CPUProfileView._TypeTree] = this.viewSelectComboBox.createOption(WebInspector.UIString("Tree (Top Down)"), "", WebInspector.CPUProfileView._TypeTree);

    var optionName = this._viewType.get() || WebInspector.CPUProfileView._TypeFlame;
    var option = options[optionName] || options[WebInspector.CPUProfileView._TypeFlame];
    this.viewSelectComboBox.select(option);

    this.focusButton = new WebInspector.StatusBarButton(WebInspector.UIString("Focus selected function."), "focus-status-bar-item");
    this.focusButton.setEnabled(false);
    this.focusButton.addEventListener("click", this._focusClicked, this);

    this.excludeButton = new WebInspector.StatusBarButton(WebInspector.UIString("Exclude selected function."), "delete-status-bar-item");
    this.excludeButton.setEnabled(false);
    this.excludeButton.addEventListener("click", this._excludeClicked, this);

    this.resetButton = new WebInspector.StatusBarButton(WebInspector.UIString("Restore all functions."), "refresh-status-bar-item");
    this.resetButton.setVisible(false);
    this.resetButton.addEventListener("click", this._resetClicked, this);

    this._profileHeader = profileHeader;
    this._linkifier = new WebInspector.Linkifier(new WebInspector.Linkifier.DefaultFormatter(30));

    this.profile = new WebInspector.CPUProfileDataModel(profileHeader._profile || profileHeader.protocolProfile());

    this._changeView();
    if (this._flameChart)
        this._flameChart.update();
}

WebInspector.CPUProfileView._TypeFlame = "Flame";
WebInspector.CPUProfileView._TypeTree = "Tree";
WebInspector.CPUProfileView._TypeHeavy = "Heavy";

/**
 * @interface
 */
WebInspector.CPUProfileView.Searchable = function()
{
}

WebInspector.CPUProfileView.Searchable.prototype = {
    jumpToNextSearchResult: function() {},
    jumpToPreviousSearchResult: function() {},
    searchCanceled: function() {},
    /**
     * @param {!WebInspector.SearchableView.SearchConfig} searchConfig
     * @param {boolean} shouldJump
     * @param {boolean=} jumpBackwards
     * @return {number}
     */
    performSearch: function(searchConfig, shouldJump, jumpBackwards) {},
    /**
     * @return {number}
     */
    currentSearchResultIndex: function() {}
}

WebInspector.CPUProfileView.prototype = {
    focus: function()
    {
        if (this._flameChart)
            this._flameChart.focus();
        else
            WebInspector.View.prototype.focus.call(this);
    },

    /**
     * @return {?WebInspector.Target}
     */
    target: function()
    {
        return this._profileHeader.target();
    },

    /**
     * @param {number} timeLeft
     * @param {number} timeRight
     */
    selectRange: function(timeLeft, timeRight)
    {
        if (!this._flameChart)
            return;
        this._flameChart.selectRange(timeLeft, timeRight);
    },

    /**
     * @return {!Array.<!WebInspector.StatusBarItem>}
     */
    statusBarItems: function()
    {
        return [this.viewSelectComboBox, this.focusButton, this.excludeButton, this.resetButton];
    },

    /**
     * @return {!WebInspector.ProfileDataGridTree}
     */
    _getBottomUpProfileDataGridTree: function()
    {
        if (!this._bottomUpProfileDataGridTree)
            this._bottomUpProfileDataGridTree = new WebInspector.BottomUpProfileDataGridTree(this, /** @type {!ProfilerAgent.CPUProfileNode} */ (this.profile.profileHead));
        return this._bottomUpProfileDataGridTree;
    },

    /**
     * @return {!WebInspector.ProfileDataGridTree}
     */
    _getTopDownProfileDataGridTree: function()
    {
        if (!this._topDownProfileDataGridTree)
            this._topDownProfileDataGridTree = new WebInspector.TopDownProfileDataGridTree(this, /** @type {!ProfilerAgent.CPUProfileNode} */ (this.profile.profileHead));
        return this._topDownProfileDataGridTree;
    },

    willHide: function()
    {
        this._currentSearchResultIndex = -1;
    },

    refresh: function()
    {
        var selectedProfileNode = this.dataGrid.selectedNode ? this.dataGrid.selectedNode.profileNode : null;

        this.dataGrid.rootNode().removeChildren();

        var children = this.profileDataGridTree.children;
        var count = children.length;

        for (var index = 0; index < count; ++index)
            this.dataGrid.rootNode().appendChild(children[index]);

        if (selectedProfileNode)
            selectedProfileNode.selected = true;
    },

    refreshVisibleData: function()
    {
        var child = this.dataGrid.rootNode().children[0];
        while (child) {
            child.refresh();
            child = child.traverseNextNode(false, null, true);
        }
    },

    /**
     * @return {!WebInspector.SearchableView}
     */
    searchableView: function()
    {
        return this._searchableView;
    },

    /**
     * @return {boolean}
     */
    supportsCaseSensitiveSearch: function()
    {
        return true;
    },

    /**
     * @return {boolean}
     */
    supportsRegexSearch: function()
    {
        return false;
    },

    searchCanceled: function()
    {
        this._searchableElement.searchCanceled();
    },

    /**
     * @param {!WebInspector.SearchableView.SearchConfig} searchConfig
     * @param {boolean} shouldJump
     * @param {boolean=} jumpBackwards
     */
    performSearch: function(searchConfig, shouldJump, jumpBackwards)
    {
        var matchesCount = this._searchableElement.performSearch(searchConfig, shouldJump, jumpBackwards);
        this._searchableView.updateSearchMatchesCount(matchesCount);
        this._searchableView.updateCurrentMatchIndex(this._searchableElement.currentSearchResultIndex());
    },

    jumpToNextSearchResult: function()
    {
        this._searchableElement.jumpToNextSearchResult();
        this._searchableView.updateCurrentMatchIndex(this._searchableElement.currentSearchResultIndex());
    },

    jumpToPreviousSearchResult: function()
    {
        this._searchableElement.jumpToPreviousSearchResult();
        this._searchableView.updateCurrentMatchIndex(this._searchableElement.currentSearchResultIndex());
    },

    _ensureFlameChartCreated: function()
    {
        if (this._flameChart)
            return;
        this._dataProvider = new WebInspector.CPUFlameChartDataProvider(this.profile, this._profileHeader.target());
        this._flameChart = new WebInspector.CPUProfileFlameChart(this._dataProvider);
        this._flameChart.addEventListener(WebInspector.FlameChart.Events.EntrySelected, this._onEntrySelected.bind(this));
    },

    /**
     * @param {!WebInspector.Event} event
     */
    _onEntrySelected: function(event)
    {
        var entryIndex = event.data;
        var node = this._dataProvider._entryNodes[entryIndex];
        var target = this._profileHeader.target();
        if (!node || !node.scriptId || !target)
            return;
        var script = target.debuggerModel.scriptForId(node.scriptId)
        if (!script)
            return;
        var location = /** @type {!WebInspector.DebuggerModel.Location} */ (script.target().debuggerModel.createRawLocation(script, node.lineNumber, 0));
        WebInspector.Revealer.reveal(WebInspector.debuggerWorkspaceBinding.rawLocationToUILocation(location));
    },

    _changeView: function()
    {
        if (!this.profile)
            return;

        this._searchableView.closeSearch();

        if (this._visibleView)
            this._visibleView.detach();

        this._viewType.set(this.viewSelectComboBox.selectedOption().value);
        switch (this._viewType.get()) {
        case WebInspector.CPUProfileView._TypeFlame:
            this._ensureFlameChartCreated();
            this._visibleView = this._flameChart;
            this._searchableElement = this._flameChart;
            break;
        case WebInspector.CPUProfileView._TypeTree:
            this.profileDataGridTree = this._getTopDownProfileDataGridTree();
            this._sortProfile();
            this._visibleView = this.dataGrid;
            this._searchableElement = this.profileDataGridTree;
            break;
        case WebInspector.CPUProfileView._TypeHeavy:
            this.profileDataGridTree = this._getBottomUpProfileDataGridTree();
            this._sortProfile();
            this._visibleView = this.dataGrid;
            this._searchableElement = this.profileDataGridTree;
            break;
        }

        var isFlame = this._viewType.get() === WebInspector.CPUProfileView._TypeFlame;
        this.focusButton.setVisible(!isFlame);
        this.excludeButton.setVisible(!isFlame);
        this.resetButton.setVisible(!isFlame);

        this._visibleView.show(this._searchableView.element);
    },

    _focusClicked: function(event)
    {
        if (!this.dataGrid.selectedNode)
            return;

        this.resetButton.setVisible(true);
        this.profileDataGridTree.focus(this.dataGrid.selectedNode);
        this.refresh();
        this.refreshVisibleData();
    },

    _excludeClicked: function(event)
    {
        var selectedNode = this.dataGrid.selectedNode

        if (!selectedNode)
            return;

        selectedNode.deselect();

        this.resetButton.setVisible(true);
        this.profileDataGridTree.exclude(selectedNode);
        this.refresh();
        this.refreshVisibleData();
    },

    _resetClicked: function(event)
    {
        this.resetButton.setVisible(false);
        this.profileDataGridTree.restore();
        this._linkifier.reset();
        this.refresh();
        this.refreshVisibleData();
    },

    _dataGridNodeSelected: function(node)
    {
        this.focusButton.setEnabled(true);
        this.excludeButton.setEnabled(true);
    },

    _dataGridNodeDeselected: function(node)
    {
        this.focusButton.setEnabled(false);
        this.excludeButton.setEnabled(false);
    },

    _sortProfile: function()
    {
        var sortAscending = this.dataGrid.isSortOrderAscending();
        var sortColumnIdentifier = this.dataGrid.sortColumnIdentifier();
        var sortProperty = {
                "self": "selfTime",
                "total": "totalTime",
                "function": "functionName"
            }[sortColumnIdentifier];

        this.profileDataGridTree.sort(WebInspector.ProfileDataGridTree.propertyComparator(sortProperty, sortAscending));

        this.refresh();
    },

    __proto__: WebInspector.VBox.prototype
}

/**
 * @constructor
 * @extends {WebInspector.ProfileType}
 */
WebInspector.CPUProfileType = function()
{
    WebInspector.ProfileType.call(this, WebInspector.CPUProfileType.TypeId, WebInspector.UIString("Collect JavaScript CPU Profile"));
    this._recording = false;

    this._nextAnonymousConsoleProfileNumber = 1;
    this._anonymousConsoleProfileIdToTitle = {};

    WebInspector.CPUProfileType.instance = this;
    WebInspector.targetManager.addModelListener(WebInspector.CPUProfilerModel, WebInspector.CPUProfilerModel.EventTypes.ConsoleProfileStarted, this._consoleProfileStarted, this);
    WebInspector.targetManager.addModelListener(WebInspector.CPUProfilerModel, WebInspector.CPUProfilerModel.EventTypes.ConsoleProfileFinished, this._consoleProfileFinished, this);
}

WebInspector.CPUProfileType.TypeId = "CPU";

WebInspector.CPUProfileType.prototype = {
    /**
     * @override
     * @return {string}
     */
    fileExtension: function()
    {
        return ".cpuprofile";
    },

    get buttonTooltip()
    {
        return this._recording ? WebInspector.UIString("Stop CPU profiling.") : WebInspector.UIString("Start CPU profiling.");
    },

    /**
     * @override
     * @return {boolean}
     */
    buttonClicked: function()
    {
        if (this._recording) {
            this.stopRecordingProfile();
            return false;
        } else {
            this.startRecordingProfile();
            return true;
        }
    },

    get treeItemTitle()
    {
        return WebInspector.UIString("CPU PROFILES");
    },

    get description()
    {
        return WebInspector.UIString("CPU profiles show where the execution time is spent in your page's JavaScript functions.");
    },

    /**
     * @param {!WebInspector.Event} event
     */
    _consoleProfileStarted: function(event)
    {
        var protocolId = /** @type {string} */ (event.data.protocolId);
        var scriptLocation = /** @type {!WebInspector.DebuggerModel.Location} */ (event.data.scriptLocation);
        var resolvedTitle = /** @type {string|undefined} */ (event.data.title);
        if (!resolvedTitle) {
            resolvedTitle = WebInspector.UIString("Profile %s", this._nextAnonymousConsoleProfileNumber++);
            this._anonymousConsoleProfileIdToTitle[protocolId] = resolvedTitle;
        }
        this._addMessageToConsole(WebInspector.ConsoleMessage.MessageType.Profile, scriptLocation, WebInspector.UIString("Profile '%s' started.", resolvedTitle));
    },

    /**
     * @param {!WebInspector.Event} event
     */
    _consoleProfileFinished: function(event)
    {
        var protocolId = /** @type {string} */ (event.data.protocolId);
        var scriptLocation = /** @type {!WebInspector.DebuggerModel.Location} */ (event.data.scriptLocation);
        var cpuProfile = /** @type {!ProfilerAgent.CPUProfile} */ (event.data.cpuProfile);
        var resolvedTitle = /** @type {string|undefined} */ (event.data.title);
        if (typeof resolvedTitle === "undefined") {
            resolvedTitle = this._anonymousConsoleProfileIdToTitle[protocolId];
            delete this._anonymousConsoleProfileIdToTitle[protocolId];
        }

        var profile = new WebInspector.CPUProfileHeader(scriptLocation.target(), this, resolvedTitle);
        profile.setProtocolProfile(cpuProfile);
        this.addProfile(profile);
        this._addMessageToConsole(WebInspector.ConsoleMessage.MessageType.ProfileEnd, scriptLocation, WebInspector.UIString("Profile '%s' finished.", resolvedTitle));
    },

    /**
     * @param {string} type
     * @param {!WebInspector.DebuggerModel.Location} scriptLocation
     * @param {string} messageText
     */
    _addMessageToConsole: function(type, scriptLocation, messageText)
    {
        var script = scriptLocation.script();
        var target = scriptLocation.target();
        var message = new WebInspector.ConsoleMessage(
            target,
            WebInspector.ConsoleMessage.MessageSource.ConsoleAPI,
            WebInspector.ConsoleMessage.MessageLevel.Debug,
            messageText,
            type,
            undefined,
            undefined,
            undefined,
            undefined,
            undefined,
            [{
                functionName: "",
                scriptId: scriptLocation.scriptId,
                url: script ? script.contentURL() : "",
                lineNumber: scriptLocation.lineNumber,
                columnNumber: scriptLocation.columnNumber || 0
            }]);

        target.consoleModel.addMessage(message);
    },

    startRecordingProfile: function()
    {
        var target = WebInspector.context.flavor(WebInspector.Target);
        if (this._profileBeingRecorded || !target)
            return;
        var profile = new WebInspector.CPUProfileHeader(target, this);
        this.setProfileBeingRecorded(profile);
        this.addProfile(profile);
        profile.updateStatus(WebInspector.UIString("Recording\u2026"));
        this._recording = true;
        target.cpuProfilerModel.startRecording();
    },

    stopRecordingProfile: function()
    {
        this._recording = false;
        if (!this._profileBeingRecorded || !this._profileBeingRecorded.target())
            return;

        /**
         * @param {!ProfilerAgent.CPUProfile} profile
         * @this {WebInspector.CPUProfileType}
         */
        function didStopProfiling(profile)
        {
            if (!this._profileBeingRecorded)
                return;
            this._profileBeingRecorded.setProtocolProfile(profile);
            this._profileBeingRecorded.updateStatus("");
            var recordedProfile = this._profileBeingRecorded;
            this.setProfileBeingRecorded(null);
            this.dispatchEventToListeners(WebInspector.ProfileType.Events.ProfileComplete, recordedProfile);
        }
        this._profileBeingRecorded.target().cpuProfilerModel.stopRecording().then(didStopProfiling.bind(this));
    },

    /**
     * @override
     * @param {string} title
     * @return {!WebInspector.ProfileHeader}
     */
    createProfileLoadedFromFile: function(title)
    {
        return new WebInspector.CPUProfileHeader(null, this, title);
    },

    /**
     * @override
     */
    profileBeingRecordedRemoved: function()
    {
        this.stopRecordingProfile();
    },

    __proto__: WebInspector.ProfileType.prototype
}

/**
 * @constructor
 * @extends {WebInspector.ProfileHeader}
 * @implements {WebInspector.OutputStream}
 * @implements {WebInspector.OutputStreamDelegate}
 * @param {?WebInspector.Target} target
 * @param {!WebInspector.CPUProfileType} type
 * @param {string=} title
 */
WebInspector.CPUProfileHeader = function(target, type, title)
{
    WebInspector.ProfileHeader.call(this, target, type, title || WebInspector.UIString("Profile %d", type.nextProfileUid()));
    this._tempFile = null;
}

WebInspector.CPUProfileHeader.prototype = {
    onTransferStarted: function()
    {
        this._jsonifiedProfile = "";
        this.updateStatus(WebInspector.UIString("Loading\u2026 %s", Number.bytesToString(this._jsonifiedProfile.length)), true);
    },

    /**
     * @param {!WebInspector.ChunkedReader} reader
     */
    onChunkTransferred: function(reader)
    {
        this.updateStatus(WebInspector.UIString("Loading\u2026 %d\%", Number.bytesToString(this._jsonifiedProfile.length)));
    },

    onTransferFinished: function()
    {
        this.updateStatus(WebInspector.UIString("Parsing\u2026"), true);
        this._profile = JSON.parse(this._jsonifiedProfile);
        this._jsonifiedProfile = null;
        this.updateStatus(WebInspector.UIString("Loaded"), false);

        if (this._profileType.profileBeingRecorded() === this)
            this._profileType.setProfileBeingRecorded(null);
    },

    /**
     * @param {!WebInspector.ChunkedReader} reader
     * @param {!Event} e
     */
    onError: function(reader, e)
    {
        var subtitle;
        switch(e.target.error.code) {
        case e.target.error.NOT_FOUND_ERR:
            subtitle = WebInspector.UIString("'%s' not found.", reader.fileName());
            break;
        case e.target.error.NOT_READABLE_ERR:
            subtitle = WebInspector.UIString("'%s' is not readable", reader.fileName());
            break;
        case e.target.error.ABORT_ERR:
            return;
        default:
            subtitle = WebInspector.UIString("'%s' error %d", reader.fileName(), e.target.error.code);
        }
        this.updateStatus(subtitle);
    },

    /**
     * @param {string} text
     */
    write: function(text)
    {
        this._jsonifiedProfile += text;
    },

    close: function() { },

    /**
     * @override
     */
    dispose: function()
    {
        this.removeTempFile();
    },

    /**
     * @override
     * @param {!WebInspector.ProfileType.DataDisplayDelegate} panel
     * @return {!WebInspector.ProfileSidebarTreeElement}
     */
    createSidebarTreeElement: function(panel)
    {
        return new WebInspector.ProfileSidebarTreeElement(panel, this, "profile-sidebar-tree-item");
    },

    /**
     * @override
     * @return {!WebInspector.CPUProfileView}
     */
    createView: function()
    {
        return new WebInspector.CPUProfileView(this);
    },

    /**
     * @override
     * @return {boolean}
     */
    canSaveToFile: function()
    {
        return !this.fromFile() && this._protocolProfile;
    },

    saveToFile: function()
    {
        var fileOutputStream = new WebInspector.FileOutputStream();

        /**
         * @param {boolean} accepted
         * @this {WebInspector.CPUProfileHeader}
         */
        function onOpenForSave(accepted)
        {
            if (!accepted)
                return;
            function didRead(data)
            {
                if (data)
                    fileOutputStream.write(data, fileOutputStream.close.bind(fileOutputStream));
                else
                    fileOutputStream.close();
            }
            if (this._failedToCreateTempFile) {
                WebInspector.console.error("Failed to open temp file with heap snapshot");
                fileOutputStream.close();
            } else if (this._tempFile) {
                this._tempFile.read(didRead);
            } else {
                this._onTempFileReady = onOpenForSave.bind(this, accepted);
            }
        }
        this._fileName = this._fileName || "CPU-" + new Date().toISO8601Compact() + this._profileType.fileExtension();
        fileOutputStream.open(this._fileName, onOpenForSave.bind(this));
    },

    /**
     * @param {!File} file
     */
    loadFromFile: function(file)
    {
        this.updateStatus(WebInspector.UIString("Loading\u2026"), true);
        var fileReader = new WebInspector.ChunkedFileReader(file, 10000000, this);
        fileReader.start(this);
    },


    /**
     * @return {?ProfilerAgent.CPUProfile}
     */
    protocolProfile: function()
    {
        return this._protocolProfile;
    },

    /**
     * @param {!ProfilerAgent.CPUProfile} cpuProfile
     */
    setProtocolProfile: function(cpuProfile)
    {
        this._protocolProfile = cpuProfile;
        this._saveProfileDataToTempFile(cpuProfile);
        if (this.canSaveToFile())
            this.dispatchEventToListeners(WebInspector.ProfileHeader.Events.ProfileReceived);
    },

    /**
     * @param {!ProfilerAgent.CPUProfile} data
     */
    _saveProfileDataToTempFile: function(data)
    {
        var serializedData = JSON.stringify(data);

        /**
         * @this {WebInspector.CPUProfileHeader}
         */
        function didCreateTempFile(tempFile)
        {
            this._writeToTempFile(tempFile, serializedData);
        }
        WebInspector.TempFile.create("cpu-profiler", String(this.uid))
            .then(didCreateTempFile.bind(this));
    },

    /**
     * @param {?WebInspector.TempFile} tempFile
     * @param {string} serializedData
     */
    _writeToTempFile: function(tempFile, serializedData)
    {
        this._tempFile = tempFile;
        if (!tempFile) {
            this._failedToCreateTempFile = true;
            this._notifyTempFileReady();
            return;
        }
        /**
         * @param {boolean} success
         * @this {WebInspector.CPUProfileHeader}
         */
        function didWriteToTempFile(success)
        {
            if (!success)
                this._failedToCreateTempFile = true;
            tempFile.finishWriting();
            this._notifyTempFileReady();
        }
        tempFile.write([serializedData], didWriteToTempFile.bind(this));
    },

    _notifyTempFileReady: function()
    {
        if (this._onTempFileReady) {
            this._onTempFileReady();
            this._onTempFileReady = null;
        }
    },

    __proto__: WebInspector.ProfileHeader.prototype
}
