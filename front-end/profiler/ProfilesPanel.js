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
 * @extends {WebInspector.Object}
 * @param {string} id
 * @param {string} name
 * @suppressGlobalPropertiesCheck
 */
WebInspector.ProfileType = function(id, name)
{
    WebInspector.Object.call(this);
    this._id = id;
    this._name = name;
    /** @type {!Array.<!WebInspector.ProfileHeader>} */
    this._profiles = [];
    /** @type {?WebInspector.ProfileHeader} */
    this._profileBeingRecorded = null;
    this._nextProfileUid = 1;

    if (!window.opener)
        window.addEventListener("unload", this._clearTempStorage.bind(this), false);
}

/**
 * @enum {string}
 */
WebInspector.ProfileType.Events = {
    AddProfileHeader: "add-profile-header",
    ProfileComplete: "profile-complete",
    RemoveProfileHeader: "remove-profile-header",
    ViewUpdated: "view-updated"
}

WebInspector.ProfileType.prototype = {
    /**
     * @return {number}
     */
    nextProfileUid: function()
    {
        return this._nextProfileUid;
    },

    /**
     * @return {boolean}
     */
    hasTemporaryView: function()
    {
        return false;
    },

    /**
     * @return {?string}
     */
    fileExtension: function()
    {
        return null;
    },

    /**
     * @return {!Array.<!WebInspector.StatusBarItem>}
     */
    statusBarItems: function()
    {
        return [];
    },

    get buttonTooltip()
    {
        return "";
    },

    get id()
    {
        return this._id;
    },

    get treeItemTitle()
    {
        return this._name;
    },

    get name()
    {
        return this._name;
    },

    /**
     * @return {boolean}
     */
    buttonClicked: function()
    {
        return false;
    },

    get description()
    {
        return "";
    },

    /**
     * @return {boolean}
     */
    isInstantProfile: function()
    {
        return false;
    },

    /**
     * @return {boolean}
     */
    isEnabled: function()
    {
        return true;
    },

    /**
     * @return {!Array.<!WebInspector.ProfileHeader>}
     */
    getProfiles: function()
    {
        /**
         * @param {!WebInspector.ProfileHeader} profile
         * @return {boolean}
         * @this {WebInspector.ProfileType}
         */
        function isFinished(profile)
        {
            return this._profileBeingRecorded !== profile;
        }
        return this._profiles.filter(isFinished.bind(this));
    },

    /**
     * @return {?Element}
     */
    decorationElement: function()
    {
        return null;
    },

    /**
     * @nosideeffects
     * @param {number} uid
     * @return {?WebInspector.ProfileHeader}
     */
    getProfile: function(uid)
    {

        for (var i = 0; i < this._profiles.length; ++i) {
            if (this._profiles[i].uid === uid)
                return this._profiles[i];
        }
        return null;
    },

    /**
     * @param {!File} file
     */
    loadFromFile: function(file)
    {
        var name = file.name;
        if (name.endsWith(this.fileExtension()))
            name = name.substr(0, name.length - this.fileExtension().length);
        var profile = this.createProfileLoadedFromFile(name);
        profile.setFromFile();
        this.setProfileBeingRecorded(profile);
        this.addProfile(profile);
        profile.loadFromFile(file);
    },

    /**
     * @param {string} title
     * @return {!WebInspector.ProfileHeader}
     */
    createProfileLoadedFromFile: function(title)
    {
        throw new Error("Needs implemented.");
    },

    /**
     * @param {!WebInspector.ProfileHeader} profile
     */
    addProfile: function(profile)
    {
        this._profiles.push(profile);
        this.dispatchEventToListeners(WebInspector.ProfileType.Events.AddProfileHeader, profile);
    },

    /**
     * @param {!WebInspector.ProfileHeader} profile
     */
    removeProfile: function(profile)
    {
        var index = this._profiles.indexOf(profile);
        if (index === -1)
            return;
        this._profiles.splice(index, 1);
        this._disposeProfile(profile);
    },

    _clearTempStorage: function()
    {
        for (var i = 0; i < this._profiles.length; ++i)
            this._profiles[i].removeTempFile();
    },

    /**
     * @return {?WebInspector.ProfileHeader}
     */
    profileBeingRecorded: function()
    {
        return this._profileBeingRecorded;
    },

    /**
     * @param {?WebInspector.ProfileHeader} profile
     */
    setProfileBeingRecorded: function(profile)
    {
        if (this._profileBeingRecorded && this._profileBeingRecorded.target())
            WebInspector.targetManager.resumeAllTargets();
        if (profile && profile.target())
            WebInspector.targetManager.suspendAllTargets();
        this._profileBeingRecorded = profile;
    },

    profileBeingRecordedRemoved: function()
    {
    },

    _reset: function()
    {
        var profiles = this._profiles.slice(0);
        for (var i = 0; i < profiles.length; ++i)
            this._disposeProfile(profiles[i]);
        this._profiles = [];

        this._nextProfileUid = 1;
    },

    /**
     * @param {!WebInspector.ProfileHeader} profile
     */
    _disposeProfile: function(profile)
    {
        this.dispatchEventToListeners(WebInspector.ProfileType.Events.RemoveProfileHeader, profile);
        profile.dispose();
        if (this._profileBeingRecorded === profile) {
            this.profileBeingRecordedRemoved();
            this.setProfileBeingRecorded(null);
        }
    },

    __proto__: WebInspector.Object.prototype
}

/**
 * @interface
 */
WebInspector.ProfileType.DataDisplayDelegate = function()
{
}

WebInspector.ProfileType.DataDisplayDelegate.prototype = {
    /**
     * @param {?WebInspector.ProfileHeader} profile
     * @return {?WebInspector.View}
     */
    showProfile: function(profile) { },

    /**
     * @param {!HeapProfilerAgent.HeapSnapshotObjectId} snapshotObjectId
     * @param {string} perspectiveName
     */
    showObject: function(snapshotObjectId, perspectiveName) { }
}

/**
 * @constructor
 * @extends {WebInspector.Object}
 * @param {?WebInspector.Target} target
 * @param {!WebInspector.ProfileType} profileType
 * @param {string} title
 */
WebInspector.ProfileHeader = function(target, profileType, title)
{
    this._target = target;
    this._profileType = profileType;
    this.title = title;
    this.uid = profileType._nextProfileUid++;
    this._fromFile = false;
}

/**
 * @constructor
 * @param {?string} subtitle
 * @param {boolean|undefined} wait
 */
WebInspector.ProfileHeader.StatusUpdate = function(subtitle, wait)
{
    /** @type {?string} */
    this.subtitle = subtitle;
    /** @type {boolean|undefined} */
    this.wait = wait;
}

WebInspector.ProfileHeader.Events = {
    UpdateStatus: "UpdateStatus",
    ProfileReceived: "ProfileReceived"
}

WebInspector.ProfileHeader.prototype = {
    /**
     * @return {?WebInspector.Target}
     */
    target: function()
    {
        return this._target;
    },

    /**
     * @return {!WebInspector.ProfileType}
     */
    profileType: function()
    {
        return this._profileType;
    },

    /**
     * @param {?string} subtitle
     * @param {boolean=} wait
     */
    updateStatus: function(subtitle, wait)
    {
        this.dispatchEventToListeners(WebInspector.ProfileHeader.Events.UpdateStatus, new WebInspector.ProfileHeader.StatusUpdate(subtitle, wait));
    },

    /**
     * Must be implemented by subclasses.
     * @param {!WebInspector.ProfileType.DataDisplayDelegate} dataDisplayDelegate
     * @return {!WebInspector.ProfileSidebarTreeElement}
     */
    createSidebarTreeElement: function(dataDisplayDelegate)
    {
        throw new Error("Needs implemented.");
    },

    /**
     * @param {!WebInspector.ProfileType.DataDisplayDelegate} dataDisplayDelegate
     * @return {!WebInspector.View}
     */
    createView: function(dataDisplayDelegate)
    {
        throw new Error("Not implemented.");
    },

    removeTempFile: function()
    {
        if (this._tempFile)
            this._tempFile.remove();
    },

    dispose: function()
    {
    },

    /**
     * @param {!Function} callback
     */
    load: function(callback)
    {
    },

    /**
     * @return {boolean}
     */
    canSaveToFile: function()
    {
        return false;
    },

    saveToFile: function()
    {
        throw new Error("Needs implemented");
    },

    /**
     * @param {!File} file
     */
    loadFromFile: function(file)
    {
        throw new Error("Needs implemented");
    },

    /**
     * @return {boolean}
     */
    fromFile: function()
    {
        return this._fromFile;
    },

    setFromFile: function()
    {
        this._fromFile = true;
    },

    __proto__: WebInspector.Object.prototype
}

/**
 * @constructor
 * @implements {WebInspector.ProfileType.DataDisplayDelegate}
 * @extends {WebInspector.PanelWithSidebarTree}
 */
WebInspector.ProfilesPanel = function()
{
    WebInspector.PanelWithSidebarTree.call(this, "profiles");
    this.registerRequiredCSS("ui/panelEnablerView.css");
    this.registerRequiredCSS("profiler/heapProfiler.css");
    this.registerRequiredCSS("profiler/profilesPanel.css");

    var mainView = new WebInspector.VBox();
    this.splitView().setMainView(mainView);

    this.profilesItemTreeElement = new WebInspector.ProfilesSidebarTreeElement(this);
    this.sidebarTree.setFocusable(false);
    this.sidebarTree.appendChild(this.profilesItemTreeElement);

    this.profileViews = createElement("div");
    this.profileViews.id = "profile-views";
    this.profileViews.classList.add("vbox");
    mainView.element.appendChild(this.profileViews);

    this._statusBarElement = createElementWithClass("div", "profiles-status-bar");
    mainView.element.insertBefore(this._statusBarElement, mainView.element.firstChild);

    this.panelSidebarElement().classList.add("profiles-sidebar-tree-box");
    var statusBarContainerLeft = createElementWithClass("div", "profiles-status-bar");
    this.panelSidebarElement().insertBefore(statusBarContainerLeft, this.panelSidebarElement().firstChild);
    var statusBar = new WebInspector.StatusBar(statusBarContainerLeft);

    this.recordButton = new WebInspector.StatusBarButton("", "record-status-bar-item");
    this.recordButton.addEventListener("click", this.toggleRecordButton, this);
    statusBar.appendStatusBarItem(this.recordButton);

    this.clearResultsButton = new WebInspector.StatusBarButton(WebInspector.UIString("Clear all profiles."), "clear-status-bar-item");
    this.clearResultsButton.addEventListener("click", this._reset, this);
    statusBar.appendStatusBarItem(this.clearResultsButton);

    this._profileTypeStatusBar = new WebInspector.StatusBar(this._statusBarElement);
    this._profileViewStatusBar = new WebInspector.StatusBar(this._statusBarElement);

    this._profileGroups = {};
    this._launcherView = new WebInspector.MultiProfileLauncherView(this);
    this._launcherView.addEventListener(WebInspector.MultiProfileLauncherView.EventTypes.ProfileTypeSelected, this._onProfileTypeSelected, this);

    this._profileToView = [];
    this._typeIdToSidebarSection = {};
    var types = WebInspector.ProfileTypeRegistry.instance.profileTypes();
    for (var i = 0; i < types.length; i++)
        this._registerProfileType(types[i]);
    this._launcherView.restoreSelectedProfileType();
    this.profilesItemTreeElement.select();
    this._showLauncherView();

    this._createFileSelectorElement();
    this.element.addEventListener("contextmenu", this._handleContextMenuEvent.bind(this), true);
    this._registerShortcuts();

    WebInspector.targetManager.addEventListener(WebInspector.TargetManager.Events.SuspendStateChanged, this._onSuspendStateChanged, this);
}

WebInspector.ProfilesPanel.prototype = {
    /**
     * @return {?WebInspector.SearchableView}
     */
    searchableView: function()
    {
        return this.visibleView && this.visibleView.searchableView ? this.visibleView.searchableView() : null;
    },

    _createFileSelectorElement: function()
    {
        if (this._fileSelectorElement)
            this.element.removeChild(this._fileSelectorElement);
        this._fileSelectorElement = WebInspector.createFileSelectorElement(this._loadFromFile.bind(this));
        this.element.appendChild(this._fileSelectorElement);
    },

    _findProfileTypeByExtension: function(fileName)
    {
        var types = WebInspector.ProfileTypeRegistry.instance.profileTypes();
        for (var i = 0; i < types.length; i++) {
            var type = types[i];
            var extension = type.fileExtension();
            if (!extension)
                continue;
            if (fileName.endsWith(type.fileExtension()))
                return type;
        }
        return null;
    },

    _registerShortcuts: function()
    {
        this.registerShortcuts(WebInspector.ShortcutsScreen.ProfilesPanelShortcuts.StartStopRecording, this.toggleRecordButton.bind(this));
    },

    /**
     * @param {!File} file
     */
    _loadFromFile: function(file)
    {
        this._createFileSelectorElement();

        var profileType = this._findProfileTypeByExtension(file.name);
        if (!profileType) {
            var extensions = [];
            var types = WebInspector.ProfileTypeRegistry.instance.profileTypes();
            for (var i = 0; i < types.length; i++) {
                var extension = types[i].fileExtension();
                if (!extension || extensions.indexOf(extension) !== -1)
                    continue;
                extensions.push(extension);
            }
            WebInspector.console.error(WebInspector.UIString("Can't load file. Only files with extensions '%s' can be loaded.", extensions.join("', '")));
            return;
        }

        if (!!profileType.profileBeingRecorded()) {
            WebInspector.console.error(WebInspector.UIString("Can't load profile while another profile is recording."));
            return;
        }

        profileType.loadFromFile(file);
    },

    /**
     * @return {boolean}
     */
    toggleRecordButton: function()
    {
        if (!this.recordButton.enabled())
            return true;
        var type = this._selectedProfileType;
        var isProfiling = type.buttonClicked();
        this._updateRecordButton(isProfiling);
        if (isProfiling) {
            this._launcherView.profileStarted();
            if (type.hasTemporaryView())
                this.showProfile(type.profileBeingRecorded());
        } else {
            this._launcherView.profileFinished();
        }
        return true;
    },

    _onSuspendStateChanged: function()
    {
        this._updateRecordButton(this.recordButton.toggled());
    },

    /**
     * @param {boolean} toggled
     */
    _updateRecordButton: function(toggled)
    {
        var enable = toggled || !WebInspector.targetManager.allTargetsSuspended();
        this.recordButton.setEnabled(enable);
        this.recordButton.setToggled(toggled);
        if (enable)
            this.recordButton.setTitle(this._selectedProfileType ? this._selectedProfileType.buttonTooltip : "");
        else
            this.recordButton.setTitle(WebInspector.anotherProfilerActiveLabel());
        if (this._selectedProfileType)
            this._launcherView.updateProfileType(this._selectedProfileType, enable);
    },

    _profileBeingRecordedRemoved: function()
    {
        this._updateRecordButton(false);
        this._launcherView.profileFinished();
    },

    /**
     * @param {!WebInspector.Event} event
     */
    _onProfileTypeSelected: function(event)
    {
        this._selectedProfileType = /** @type {!WebInspector.ProfileType} */ (event.data);
        this._updateProfileTypeSpecificUI();
    },

    _updateProfileTypeSpecificUI: function()
    {
        this._updateRecordButton(this.recordButton.toggled());
        this._profileTypeStatusBar.removeStatusBarItems();
        var statusBarItems = this._selectedProfileType.statusBarItems();
        for (var i = 0; i < statusBarItems.length; ++i)
            this._profileTypeStatusBar.appendStatusBarItem(statusBarItems[i]);
    },

    _reset: function()
    {
        WebInspector.Panel.prototype.reset.call(this);

        var types = WebInspector.ProfileTypeRegistry.instance.profileTypes();
        for (var i = 0; i < types.length; i++)
            types[i]._reset();

        delete this.visibleView;

        this._profileGroups = {};
        this._updateRecordButton(false);
        this._launcherView.profileFinished();

        this.sidebarTree.element.classList.remove("some-expandable");

        this._launcherView.detach();
        this.profileViews.removeChildren();
        this._profileViewStatusBar.removeStatusBarItems();

        this.removeAllListeners();

        this.recordButton.setVisible(true);
        this._profileViewStatusBar.element.classList.remove("hidden");
        this.clearResultsButton.element.classList.remove("hidden");
        this.profilesItemTreeElement.select();
        this._showLauncherView();
    },

    _showLauncherView: function()
    {
        this.closeVisibleView();
        this._profileViewStatusBar.removeStatusBarItems();
        this._launcherView.show(this.profileViews);
        this.visibleView = this._launcherView;
    },

    /**
     * @param {!WebInspector.ProfileType} profileType
     */
    _registerProfileType: function(profileType)
    {
        this._launcherView.addProfileType(profileType);
        var profileTypeSection = new WebInspector.ProfileTypeSidebarSection(this, profileType);
        this._typeIdToSidebarSection[profileType.id] = profileTypeSection
        this.sidebarTree.appendChild(profileTypeSection);
        profileTypeSection.childrenListElement.addEventListener("contextmenu", this._handleContextMenuEvent.bind(this), true);

        /**
         * @param {!WebInspector.Event} event
         * @this {WebInspector.ProfilesPanel}
         */
        function onAddProfileHeader(event)
        {
            this._addProfileHeader(/** @type {!WebInspector.ProfileHeader} */ (event.data));
        }

        /**
         * @param {!WebInspector.Event} event
         * @this {WebInspector.ProfilesPanel}
         */
        function onRemoveProfileHeader(event)
        {
            this._removeProfileHeader(/** @type {!WebInspector.ProfileHeader} */ (event.data));
        }

        /**
         * @param {!WebInspector.Event} event
         * @this {WebInspector.ProfilesPanel}
         */
        function profileComplete(event)
        {
            this.showProfile(/** @type {!WebInspector.ProfileHeader} */ (event.data));
        }

        profileType.addEventListener(WebInspector.ProfileType.Events.ViewUpdated, this._updateProfileTypeSpecificUI, this);
        profileType.addEventListener(WebInspector.ProfileType.Events.AddProfileHeader, onAddProfileHeader, this);
        profileType.addEventListener(WebInspector.ProfileType.Events.RemoveProfileHeader, onRemoveProfileHeader, this);
        profileType.addEventListener(WebInspector.ProfileType.Events.ProfileComplete, profileComplete, this);

        var profiles = profileType.getProfiles();
        for (var i = 0; i < profiles.length; i++)
            this._addProfileHeader(profiles[i]);
    },

    /**
     * @param {!Event} event
     */
    _handleContextMenuEvent: function(event)
    {
        var element = event.srcElement;
        while (element && !element.treeElement && element !== this.element)
            element = element.parentElement;
        if (!element)
            return;
        if (element.treeElement && element.treeElement.handleContextMenuEvent) {
            element.treeElement.handleContextMenuEvent(event, this);
            return;
        }

        var contextMenu = new WebInspector.ContextMenu(event);
        if (this.visibleView instanceof WebInspector.HeapSnapshotView) {
            this.visibleView.populateContextMenu(contextMenu, event);
        }
        if (element !== this.element || event.srcElement === this.panelSidebarElement()) {
            contextMenu.appendItem(WebInspector.UIString("Load\u2026"), this._fileSelectorElement.click.bind(this._fileSelectorElement));
        }
        contextMenu.show();
    },

    showLoadFromFileDialog: function()
    {
        this._fileSelectorElement.click();
    },

    /**
     * @param {!WebInspector.ProfileHeader} profile
     */
    _addProfileHeader: function(profile)
    {
        var profileType = profile.profileType();
        var typeId = profileType.id;
        this._typeIdToSidebarSection[typeId].addProfileHeader(profile);
        if (!this.visibleView || this.visibleView === this._launcherView)
            this.showProfile(profile);
    },

    /**
     * @param {!WebInspector.ProfileHeader} profile
     */
    _removeProfileHeader: function(profile)
    {
        if (profile.profileType()._profileBeingRecorded === profile)
            this._profileBeingRecordedRemoved();

        var i = this._indexOfViewForProfile(profile);
        if (i !== -1)
            this._profileToView.splice(i, 1);

        var profileType = profile.profileType();
        var typeId = profileType.id;
        var sectionIsEmpty = this._typeIdToSidebarSection[typeId].removeProfileHeader(profile);

        // No other item will be selected if there aren't any other profiles, so
        // make sure that view gets cleared when the last profile is removed.
        if (sectionIsEmpty) {
            this.profilesItemTreeElement.select();
            this._showLauncherView();
        }
    },

    /**
     * @param {?WebInspector.ProfileHeader} profile
     * @return {?WebInspector.View}
     */
    showProfile: function(profile)
    {
        if (!profile || (profile.profileType().profileBeingRecorded() === profile) && !profile.profileType().hasTemporaryView())
            return null;

        var view = this._viewForProfile(profile);
        if (view === this.visibleView)
            return view;

        this.closeVisibleView();

        view.show(this.profileViews);
        view.focus();

        this.visibleView = view;

        var profileTypeSection = this._typeIdToSidebarSection[profile.profileType().id];
        var sidebarElement = profileTypeSection.sidebarElementForProfile(profile);
        sidebarElement.revealAndSelect();

        this._profileViewStatusBar.removeStatusBarItems();

        var statusBarItems = view.statusBarItems();
        for (var i = 0; i < statusBarItems.length; ++i)
            this._profileViewStatusBar.appendStatusBarItem(statusBarItems[i]);

        return view;
    },

    /**
     * @param {!HeapProfilerAgent.HeapSnapshotObjectId} snapshotObjectId
     * @param {string} perspectiveName
     */
    showObject: function(snapshotObjectId, perspectiveName)
    {
        var heapProfiles = WebInspector.ProfileTypeRegistry.instance.heapSnapshotProfileType.getProfiles();
        for (var i = 0; i < heapProfiles.length; i++) {
            var profile = heapProfiles[i];
            // FIXME: allow to choose snapshot if there are several options.
            if (profile.maxJSObjectId >= snapshotObjectId) {
                this.showProfile(profile);
                var view = this._viewForProfile(profile);
                view.selectLiveObject(perspectiveName, snapshotObjectId);
                break;
            }
        }
    },

    /**
     * @param {!WebInspector.ProfileHeader} profile
     * @return {!WebInspector.View}
     */
    _viewForProfile: function(profile)
    {
        var index = this._indexOfViewForProfile(profile);
        if (index !== -1)
            return this._profileToView[index].view;
        var view = profile.createView(this);
        view.element.classList.add("profile-view");
        this._profileToView.push({ profile: profile, view: view});
        return view;
    },

    /**
     * @param {!WebInspector.ProfileHeader} profile
     * @return {number}
     */
    _indexOfViewForProfile: function(profile)
    {
        for (var i = 0; i < this._profileToView.length; i++) {
            if (this._profileToView[i].profile === profile)
                return i;
        }
        return -1;
    },

    closeVisibleView: function()
    {
        if (this.visibleView)
            this.visibleView.detach();
        delete this.visibleView;
    },

    /**
     * @param {!Event} event
     * @param {!WebInspector.ContextMenu} contextMenu
     * @param {!Object} target
     */
    appendApplicableItems: function(event, contextMenu, target)
    {
        if (!(target instanceof WebInspector.RemoteObject))
            return;

        if (WebInspector.inspectorView.currentPanel() !== this)
            return;

        var object = /** @type {!WebInspector.RemoteObject} */ (target);
        var objectId = object.objectId;
        if (!objectId)
            return;

        var heapProfiles = WebInspector.ProfileTypeRegistry.instance.heapSnapshotProfileType.getProfiles();
        if (!heapProfiles.length)
            return;

        /**
         * @this {WebInspector.ProfilesPanel}
         */
        function revealInView(viewName)
        {
            object.target().heapProfilerAgent().getHeapObjectId(objectId, didReceiveHeapObjectId.bind(this, viewName));
        }

        /**
         * @this {WebInspector.ProfilesPanel}
         */
        function didReceiveHeapObjectId(viewName, error, result)
        {
            if (WebInspector.inspectorView.currentPanel() !== this)
                return;
            if (!error)
                this.showObject(result, viewName);
        }

        contextMenu.appendItem(WebInspector.UIString(WebInspector.useLowerCaseMenuTitles() ? "Reveal in Summary view" : "Reveal in Summary View"), revealInView.bind(this, "Summary"));
    },

    __proto__: WebInspector.PanelWithSidebarTree.prototype
}


/**
 * @constructor
 * @extends {WebInspector.SidebarSectionTreeElement}
 * @param {!WebInspector.ProfileType.DataDisplayDelegate} dataDisplayDelegate
 * @param {!WebInspector.ProfileType} profileType
 */
WebInspector.ProfileTypeSidebarSection = function(dataDisplayDelegate, profileType)
{
    WebInspector.SidebarSectionTreeElement.call(this, profileType.treeItemTitle, null, true);
    this._dataDisplayDelegate = dataDisplayDelegate;
    this._profileTreeElements = [];
    this._profileGroups = {};
    this.hidden = true;
}

/**
 * @constructor
 */
WebInspector.ProfileTypeSidebarSection.ProfileGroup = function()
{
    this.profileSidebarTreeElements = [];
    this.sidebarTreeElement = null;
}

WebInspector.ProfileTypeSidebarSection.prototype = {
    /**
     * @param {!WebInspector.ProfileHeader} profile
     */
    addProfileHeader: function(profile)
    {
        this.hidden = false;
        var profileType = profile.profileType();
        var sidebarParent = this;
        var profileTreeElement = profile.createSidebarTreeElement(this._dataDisplayDelegate);
        this._profileTreeElements.push(profileTreeElement);

        if (!profile.fromFile() && profileType.profileBeingRecorded() !== profile) {
            var profileTitle = profile.title;
            var group = this._profileGroups[profileTitle];
            if (!group) {
                group = new WebInspector.ProfileTypeSidebarSection.ProfileGroup();
                this._profileGroups[profileTitle] = group;
            }
            group.profileSidebarTreeElements.push(profileTreeElement);

            var groupSize = group.profileSidebarTreeElements.length;
            if (groupSize === 2) {
                // Make a group TreeElement now that there are 2 profiles.
                group.sidebarTreeElement = new WebInspector.ProfileGroupSidebarTreeElement(this._dataDisplayDelegate, profile.title);

                var firstProfileTreeElement = group.profileSidebarTreeElements[0];
                // Insert at the same index for the first profile of the group.
                var index = this.children.indexOf(firstProfileTreeElement);
                this.insertChild(group.sidebarTreeElement, index);

                // Move the first profile to the group.
                var selected = firstProfileTreeElement.selected;
                this.removeChild(firstProfileTreeElement);
                group.sidebarTreeElement.appendChild(firstProfileTreeElement);
                if (selected)
                    firstProfileTreeElement.revealAndSelect();

                firstProfileTreeElement.small = true;
                firstProfileTreeElement.mainTitle = WebInspector.UIString("Run %d", 1);

                this.treeOutline.element.classList.add("some-expandable");
            }

            if (groupSize >= 2) {
                sidebarParent = group.sidebarTreeElement;
                profileTreeElement.small = true;
                profileTreeElement.mainTitle = WebInspector.UIString("Run %d", groupSize);
            }
        }

        sidebarParent.appendChild(profileTreeElement);
    },

    /**
     * @param {!WebInspector.ProfileHeader} profile
     * @return {boolean}
     */
    removeProfileHeader: function(profile)
    {
        var index = this._sidebarElementIndex(profile);
        if (index === -1)
            return false;
        var profileTreeElement = this._profileTreeElements[index];
        this._profileTreeElements.splice(index, 1);

        var sidebarParent = this;
        var group = this._profileGroups[profile.title];
        if (group) {
            var groupElements = group.profileSidebarTreeElements;
            groupElements.splice(groupElements.indexOf(profileTreeElement), 1);
            if (groupElements.length === 1) {
                // Move the last profile out of its group and remove the group.
                var pos = sidebarParent.children.indexOf(group.sidebarTreeElement);
                this.insertChild(groupElements[0], pos);
                groupElements[0].small = false;
                groupElements[0].mainTitle = group.sidebarTreeElement.title;
                this.removeChild(group.sidebarTreeElement);
            }
            if (groupElements.length !== 0)
                sidebarParent = group.sidebarTreeElement;
        }
        sidebarParent.removeChild(profileTreeElement);
        profileTreeElement.dispose();

        if (this.children.length)
            return false;
        this.hidden = true;
        return true;
    },

    /**
     * @param {!WebInspector.ProfileHeader} profile
     * @return {?WebInspector.ProfileSidebarTreeElement}
     */
    sidebarElementForProfile: function(profile)
    {
        var index = this._sidebarElementIndex(profile);
        return index === -1 ? null : this._profileTreeElements[index];
    },

    /**
     * @param {!WebInspector.ProfileHeader} profile
     * @return {number}
     */
    _sidebarElementIndex: function(profile)
    {
        var elements = this._profileTreeElements;
        for (var i = 0; i < elements.length; i++) {
            if (elements[i].profile === profile)
                return i;
        }
        return -1;
    },

    __proto__: WebInspector.SidebarSectionTreeElement.prototype
}


/**
 * @constructor
 * @implements {WebInspector.ContextMenu.Provider}
 */
WebInspector.ProfilesPanel.ContextMenuProvider = function()
{
}

WebInspector.ProfilesPanel.ContextMenuProvider.prototype = {
    /**
     * @param {!Event} event
     * @param {!WebInspector.ContextMenu} contextMenu
     * @param {!Object} target
     */
    appendApplicableItems: function(event, contextMenu, target)
    {
        WebInspector.ProfilesPanel._instance().appendApplicableItems(event, contextMenu, target);
    }
}

/**
 * @constructor
 * @extends {WebInspector.SidebarTreeElement}
 * @param {!WebInspector.ProfileType.DataDisplayDelegate} dataDisplayDelegate
 * @param {!WebInspector.ProfileHeader} profile
 * @param {string} className
 */
WebInspector.ProfileSidebarTreeElement = function(dataDisplayDelegate, profile, className)
{
    this._dataDisplayDelegate = dataDisplayDelegate;
    this.profile = profile;
    WebInspector.SidebarTreeElement.call(this, className, profile.title, "", profile, false);
    this.refreshTitles();
    profile.addEventListener(WebInspector.ProfileHeader.Events.UpdateStatus, this._updateStatus, this);
    if (profile.canSaveToFile())
        this._createSaveLink();
    else
        profile.addEventListener(WebInspector.ProfileHeader.Events.ProfileReceived, this._onProfileReceived, this);
}

WebInspector.ProfileSidebarTreeElement.prototype = {
    _createSaveLink: function()
    {
        this._saveLinkElement = this.titleContainer.createChild("span", "save-link");
        this._saveLinkElement.textContent = WebInspector.UIString("Save");
        this._saveLinkElement.addEventListener("click", this._saveProfile.bind(this), false);
    },

    _onProfileReceived: function(event)
    {
        this._createSaveLink();
    },

    /**
     * @param {!WebInspector.Event} event
     */
    _updateStatus: function(event)
    {
        var statusUpdate = event.data;
        if (statusUpdate.subtitle !== null)
            this.subtitle = statusUpdate.subtitle;
        if (typeof statusUpdate.wait === "boolean")
            this.wait = statusUpdate.wait;
        this.refreshTitles();
    },

    dispose: function()
    {
        this.profile.removeEventListener(WebInspector.ProfileHeader.Events.UpdateStatus, this._updateStatus, this);
        this.profile.removeEventListener(WebInspector.ProfileHeader.Events.ProfileReceived, this._onProfileReceived, this);
    },

    /**
     * @return {boolean}
     */
    onselect: function()
    {
        this._dataDisplayDelegate.showProfile(this.profile);
        return true;
    },

    /**
     * @return {boolean}
     */
    ondelete: function()
    {
        this.profile.profileType().removeProfile(this.profile);
        return true;
    },

    /**
     * @param {!Event} event
     * @param {!WebInspector.ProfilesPanel} panel
     */
    handleContextMenuEvent: function(event, panel)
    {
        var profile = this.profile;
        var contextMenu = new WebInspector.ContextMenu(event);
        // FIXME: use context menu provider
        contextMenu.appendItem(WebInspector.UIString("Load\u2026"), panel._fileSelectorElement.click.bind(panel._fileSelectorElement));
        if (profile.canSaveToFile())
            contextMenu.appendItem(WebInspector.UIString("Save\u2026"), profile.saveToFile.bind(profile));
        contextMenu.appendItem(WebInspector.UIString("Delete"), this.ondelete.bind(this));
        contextMenu.show();
    },

    _saveProfile: function(event)
    {
        this.profile.saveToFile();
    },

    __proto__: WebInspector.SidebarTreeElement.prototype
}

/**
 * @constructor
 * @extends {WebInspector.SidebarTreeElement}
 * @param {!WebInspector.ProfileType.DataDisplayDelegate} dataDisplayDelegate
 * @param {string} title
 * @param {string=} subtitle
 */
WebInspector.ProfileGroupSidebarTreeElement = function(dataDisplayDelegate, title, subtitle)
{
    WebInspector.SidebarTreeElement.call(this, "profile-group-sidebar-tree-item", title, subtitle, null, true);
    this._dataDisplayDelegate = dataDisplayDelegate;
}

WebInspector.ProfileGroupSidebarTreeElement.prototype = {
    /**
     * @return {boolean}
     */
    onselect: function()
    {
        var hasChildren = this.children.length > 0;
        if (hasChildren)
            this._dataDisplayDelegate.showProfile(this.children[this.children.length - 1].profile);
        return hasChildren;
    },

    __proto__: WebInspector.SidebarTreeElement.prototype
}

/**
 * @constructor
 * @extends {WebInspector.SidebarTreeElement}
 * @param {!WebInspector.ProfilesPanel} panel
 */
WebInspector.ProfilesSidebarTreeElement = function(panel)
{
    this._panel = panel;
    this.small = false;

    WebInspector.SidebarTreeElement.call(this, "profile-launcher-view-tree-item", WebInspector.UIString("Profiles"), "", null, false);
}

WebInspector.ProfilesSidebarTreeElement.prototype = {
    /**
     * @return {boolean}
     */
    onselect: function()
    {
        this._panel._showLauncherView();
        return true;
    },

    get selectable()
    {
        return true;
    },

    __proto__: WebInspector.SidebarTreeElement.prototype
}

WebInspector.ProfilesPanel.show = function()
{
    WebInspector.inspectorView.setCurrentPanel(WebInspector.ProfilesPanel._instance());
}

/**
 * @return {!WebInspector.ProfilesPanel}
 */
WebInspector.ProfilesPanel._instance = function()
{
    if (!WebInspector.ProfilesPanel._instanceObject)
        WebInspector.ProfilesPanel._instanceObject = new WebInspector.ProfilesPanel();
    return WebInspector.ProfilesPanel._instanceObject;
}

/**
 * @constructor
 * @implements {WebInspector.PanelFactory}
 */
WebInspector.ProfilesPanelFactory = function()
{
}

WebInspector.ProfilesPanelFactory.prototype = {
    /**
     * @return {!WebInspector.Panel}
     */
    createPanel: function()
    {
        return WebInspector.ProfilesPanel._instance();
    }
}
