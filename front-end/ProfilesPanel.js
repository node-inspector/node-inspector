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

const UserInitiatedProfileName = "org.webkit.profiles.user-initiated";

WebInspector.ProfileType = function(id, name)
{
    this._id = id;
    this._name = name;
}

WebInspector.ProfileType.URLRegExp = /webkit-profile:\/\/(.+)\/(.+)#([0-9]+)/;

WebInspector.ProfileType.prototype = {
    get buttonTooltip()
    {
        return "";
    },

    get buttonStyle()
    {
        return undefined;
    },

    get buttonCaption()
    {
        return this.name;
    },

    get id()
    {
        return this._id;
    },

    get name()
    {
        return this._name;
    },

    buttonClicked: function()
    {
    },

    viewForProfile: function(profile)
    {
        if (!profile._profileView)
            profile._profileView = this.createView(profile);
        return profile._profileView;
    },

    get welcomeMessage()
    {
        return "";
    },

    // Must be implemented by subclasses.
    createView: function(profile)
    {
        throw new Error("Needs implemented.");
    },

    // Must be implemented by subclasses.
    createSidebarTreeElementForProfile: function(profile)
    {
        throw new Error("Needs implemented.");
    }
}

WebInspector.ProfilesPanel = function()
{
    WebInspector.Panel.call(this, "profiles");

    this.createSidebar();

    this._profileTypesByIdMap = {};
    this._profileTypeButtonsByIdMap = {};

    var panelEnablerHeading = WebInspector.UIString("You need to enable profiling before you can use the Profiles panel.");
    var panelEnablerDisclaimer = WebInspector.UIString("Enabling profiling will make scripts run slower.");
    var panelEnablerButton = WebInspector.UIString("Enable Profiling");
    this.panelEnablerView = new WebInspector.PanelEnablerView("profiles", panelEnablerHeading, panelEnablerDisclaimer, panelEnablerButton);
    this.panelEnablerView.addEventListener("enable clicked", this._enableProfiling, this);

    this.element.appendChild(this.panelEnablerView.element);

    this.profileViews = document.createElement("div");
    this.profileViews.id = "profile-views";
    this.element.appendChild(this.profileViews);

    this.enableToggleButton = new WebInspector.StatusBarButton("", "enable-toggle-status-bar-item");
    this.enableToggleButton.addEventListener("click", this._toggleProfiling.bind(this), false);

    this.clearResultsButton = new WebInspector.StatusBarButton(WebInspector.UIString("Clear CPU profiles."), "clear-status-bar-item");
    this.clearResultsButton.addEventListener("click", this._clearProfiles.bind(this), false);

    this.profileViewStatusBarItemsContainer = document.createElement("div");
    this.profileViewStatusBarItemsContainer.id = "profile-view-status-bar-items";

    this.welcomeView = new WebInspector.WelcomeView("profiles", WebInspector.UIString("Welcome to the Profiles panel"));
    this.element.appendChild(this.welcomeView.element);

    this._profiles = [];
    this._profilerEnabled = Preferences.profilerAlwaysEnabled;
    this._reset();
}

WebInspector.ProfilesPanel.prototype = {
    get toolbarItemLabel()
    {
        return WebInspector.UIString("Profiles");
    },

    get statusBarItems()
    {
        function clickHandler(profileType, buttonElement)
        {
            profileType.buttonClicked.call(profileType);
            this.updateProfileTypeButtons();
        }

        var items = [this.enableToggleButton.element];
        // FIXME: Generate a single "combo-button".
        for (var typeId in this._profileTypesByIdMap) {
            var profileType = this.getProfileType(typeId);
            if (profileType.buttonStyle) {
                var button = new WebInspector.StatusBarButton(profileType.buttonTooltip, profileType.buttonStyle, profileType.buttonCaption);
                this._profileTypeButtonsByIdMap[typeId] = button.element;
                button.element.addEventListener("click", clickHandler.bind(this, profileType, button.element), false);
                items.push(button.element);
            }
        }
        items.push(this.clearResultsButton.element, this.profileViewStatusBarItemsContainer);
        return items;
    },

    show: function()
    {
        WebInspector.Panel.prototype.show.call(this);
        if (this._shouldPopulateProfiles)
            this._populateProfiles();
    },

    populateInterface: function()
    {
        this._reset();
        if (this.visible)
            this._populateProfiles();
        else
            this._shouldPopulateProfiles = true;
    },

    profilerWasEnabled: function()
    {
        if (this._profilerEnabled)
            return;

        this._profilerEnabled = true;
        this.populateInterface();
    },

    profilerWasDisabled: function()
    {
        if (!this._profilerEnabled)
            return;

        this._profilerEnabled = false;
        this._reset();
    },

    resetProfiles: function()
    {
        this._reset();
    },

    _reset: function()
    {
        for (var i = 0; i < this._profiles.length; ++i)
            delete this._profiles[i]._profileView;
        delete this.visibleView;

        delete this.currentQuery;
        this.searchCanceled();

        this._profiles = [];
        this._profilesIdMap = {};
        this._profileGroups = {};
        this._profileGroupsForLinks = {}

        this.sidebarTreeElement.removeStyleClass("some-expandable");

        for (var typeId in this._profileTypesByIdMap)
            this.getProfileType(typeId).treeElement.removeChildren();

        this.profileViews.removeChildren();

        this.profileViewStatusBarItemsContainer.removeChildren();

        this._updateInterface();
        this.welcomeView.show();
    },

    _clearProfiles: function()
    {
        InspectorBackend.clearProfiles();
        this._reset();
    },

    registerProfileType: function(profileType)
    {
        this._profileTypesByIdMap[profileType.id] = profileType;
        profileType.treeElement = new WebInspector.SidebarSectionTreeElement(profileType.name, null, true);
        this.sidebarTree.appendChild(profileType.treeElement);
        profileType.treeElement.expand();
        this._addWelcomeMessage(profileType);
    },

    _addWelcomeMessage: function(profileType)
    {
        var message = profileType.welcomeMessage;
        // Message text is supposed to have a '%s' substring as a placeholder
        // for a status bar button. If it is there, we split the message in two
        // parts, and insert the button between them.
        var buttonPos = message.indexOf("%s");
        if (buttonPos > -1) {
            var container = document.createDocumentFragment();
            var part1 = document.createElement("span");
            part1.innerHTML = message.substr(0, buttonPos);
            container.appendChild(part1);
     
            var button = new WebInspector.StatusBarButton(profileType.buttonTooltip, profileType.buttonStyle, profileType.buttonCaption);
            container.appendChild(button.element);
       
            var part2 = document.createElement("span");
            part2.innerHTML = message.substr(buttonPos + 2);
            container.appendChild(part2);
            this.welcomeView.addMessage(container);
        } else
            this.welcomeView.addMessage(message);
    },

    _makeKey: function(text, profileTypeId)
    {
        return escape(text) + '/' + escape(profileTypeId);
    },

    addProfileHeader: function(profile)
    {
        var typeId = profile.typeId;
        var profileType = this.getProfileType(typeId);
        var sidebarParent = profileType.treeElement;
        var small = false;
        var alternateTitle;

        profile.__profilesPanelProfileType = profileType;
        this._profiles.push(profile);
        this._profilesIdMap[this._makeKey(profile.uid, typeId)] = profile;

        if (profile.title.indexOf(UserInitiatedProfileName) !== 0) {
            var profileTitleKey = this._makeKey(profile.title, typeId);
            if (!(profileTitleKey in this._profileGroups))
                this._profileGroups[profileTitleKey] = [];

            var group = this._profileGroups[profileTitleKey];
            group.push(profile);

            if (group.length === 2) {
                // Make a group TreeElement now that there are 2 profiles.
                group._profilesTreeElement = new WebInspector.ProfileGroupSidebarTreeElement(profile.title);

                // Insert at the same index for the first profile of the group.
                var index = sidebarParent.children.indexOf(group[0]._profilesTreeElement);
                sidebarParent.insertChild(group._profilesTreeElement, index);

                // Move the first profile to the group.
                var selected = group[0]._profilesTreeElement.selected;
                sidebarParent.removeChild(group[0]._profilesTreeElement);
                group._profilesTreeElement.appendChild(group[0]._profilesTreeElement);
                if (selected) {
                    group[0]._profilesTreeElement.select();
                    group[0]._profilesTreeElement.reveal();
                }

                group[0]._profilesTreeElement.small = true;
                group[0]._profilesTreeElement.mainTitle = WebInspector.UIString("Run %d", 1);

                this.sidebarTreeElement.addStyleClass("some-expandable");
            }

            if (group.length >= 2) {
                sidebarParent = group._profilesTreeElement;
                alternateTitle = WebInspector.UIString("Run %d", group.length);
                small = true;
            }
        }

        var profileTreeElement = profileType.createSidebarTreeElementForProfile(profile);
        profileTreeElement.small = small;
        if (alternateTitle)
            profileTreeElement.mainTitle = alternateTitle;
        profile._profilesTreeElement = profileTreeElement;

        sidebarParent.appendChild(profileTreeElement);
        if (!profile.isTemporary) {
            this.welcomeView.hide();
            if (!this.visibleView)
                this.showProfile(profile);
        }
    },

    removeProfileHeader: function(profile)
    {
        var typeId = profile.typeId;
        var profileType = this.getProfileType(typeId);
        var sidebarParent = profileType.treeElement;

        for (var i = 0; i < this._profiles.length; ++i) {
            if (this._profiles[i].uid === profile.uid) {
                profile = this._profiles[i];
                this._profiles.splice(i, 1);
                break;
            }
        }
        delete this._profilesIdMap[this._makeKey(profile.uid, typeId)];

        var profileTitleKey = this._makeKey(profile.title, typeId);
        delete this._profileGroups[profileTitleKey];

        sidebarParent.removeChild(profile._profilesTreeElement);

        if (!profile.isTemporary)
            InspectorBackend.removeProfile(profile.uid);

        // No other item will be selected if there aren't any other profiles, so
        // make sure that view gets cleared when the last profile is removed.
        if (!this._profiles.length)
            this.closeVisibleView();
    },

    showProfile: function(profile)
    {
        if (!profile || profile.isTemporary)
            return;

        this.closeVisibleView();

        var view = profile.__profilesPanelProfileType.viewForProfile(profile);

        view.show(this.profileViews);

        profile._profilesTreeElement.select(true);
        profile._profilesTreeElement.reveal();

        this.visibleView = view;

        this.profileViewStatusBarItemsContainer.removeChildren();

        var statusBarItems = view.statusBarItems;
        for (var i = 0; i < statusBarItems.length; ++i)
            this.profileViewStatusBarItemsContainer.appendChild(statusBarItems[i]);
    },

    showView: function(view)
    {
        this.showProfile(view.profile);
    },

    getProfileType: function(typeId)
    {
        return this._profileTypesByIdMap[typeId];
    },

    showProfileForURL: function(url)
    {
        var match = url.match(WebInspector.ProfileType.URLRegExp);
        if (!match)
            return;
        this.showProfile(this._profilesIdMap[this._makeKey(match[3], match[1])]);
    },

    updateProfileTypeButtons: function()
    {
        for (var typeId in this._profileTypeButtonsByIdMap) {
            var buttonElement = this._profileTypeButtonsByIdMap[typeId];
            var profileType = this.getProfileType(typeId);
            buttonElement.className = profileType.buttonStyle;
            buttonElement.title = profileType.buttonTooltip;
            // FIXME: Apply profileType.buttonCaption once captions are added to button controls.
        }
    },

    closeVisibleView: function()
    {
        if (this.visibleView)
            this.visibleView.hide();
        delete this.visibleView;
    },

    displayTitleForProfileLink: function(title, typeId)
    {
        title = unescape(title);
        if (title.indexOf(UserInitiatedProfileName) === 0) {
            title = WebInspector.UIString("Profile %d", title.substring(UserInitiatedProfileName.length + 1));
        } else {
            var titleKey = this._makeKey(title, typeId);
            if (!(titleKey in this._profileGroupsForLinks))
                this._profileGroupsForLinks[titleKey] = 0;

            groupNumber = ++this._profileGroupsForLinks[titleKey];

            if (groupNumber > 2)
                // The title is used in the console message announcing that a profile has started so it gets
                // incremented twice as often as it's displayed
                title += " " + WebInspector.UIString("Run %d", groupNumber / 2);
        }
        
        return title;
    },

    get searchableViews()
    {
        var views = [];

        const visibleView = this.visibleView;
        if (visibleView && visibleView.performSearch)
            views.push(visibleView);

        var profilesLength = this._profiles.length;
        for (var i = 0; i < profilesLength; ++i) {
            var profile = this._profiles[i];
            var view = profile.__profilesPanelProfileType.viewForProfile(profile);
            if (!view.performSearch || view === visibleView)
                continue;
            views.push(view);
        }

        return views;
    },

    searchMatchFound: function(view, matches)
    {
        view.profile._profilesTreeElement.searchMatches = matches;
    },

    searchCanceled: function(startingNewSearch)
    {
        WebInspector.Panel.prototype.searchCanceled.call(this, startingNewSearch);

        if (!this._profiles)
            return;

        for (var i = 0; i < this._profiles.length; ++i) {
            var profile = this._profiles[i];
            profile._profilesTreeElement.searchMatches = 0;
        }
    },

    _updateInterface: function()
    {
        // FIXME: Replace ProfileType-specific button visibility changes by a single ProfileType-agnostic "combo-button" visibility change.
        if (this._profilerEnabled) {
            this.enableToggleButton.title = WebInspector.UIString("Profiling enabled. Click to disable.");
            this.enableToggleButton.toggled = true;
            for (var typeId in this._profileTypeButtonsByIdMap)
                this._profileTypeButtonsByIdMap[typeId].removeStyleClass("hidden");
            this.profileViewStatusBarItemsContainer.removeStyleClass("hidden");
            this.clearResultsButton.element.removeStyleClass("hidden");
            this.panelEnablerView.visible = false;
        } else {
            this.enableToggleButton.title = WebInspector.UIString("Profiling disabled. Click to enable.");
            this.enableToggleButton.toggled = false;
            for (var typeId in this._profileTypeButtonsByIdMap)
                this._profileTypeButtonsByIdMap[typeId].addStyleClass("hidden");
            this.profileViewStatusBarItemsContainer.addStyleClass("hidden");
            this.clearResultsButton.element.addStyleClass("hidden");
            this.panelEnablerView.visible = true;
        }
    },

    _enableProfiling: function()
    {
        if (this._profilerEnabled)
            return;
        this._toggleProfiling(this.panelEnablerView.alwaysEnabled);
    },

    _toggleProfiling: function(optionalAlways)
    {
        if (this._profilerEnabled)
            InspectorBackend.disableProfiler(true);
        else
            InspectorBackend.enableProfiler(!!optionalAlways);
    },

    _populateProfiles: function()
    {
        var sidebarTreeChildrenCount = this.sidebarTree.children.length;
        for (var i = 0; i < sidebarTreeChildrenCount; ++i) {
            var treeElement = this.sidebarTree.children[i];
            if (treeElement.children.length)
                return;
        }

        function populateCallback(profileHeaders) {
            profileHeaders.sort(function(a, b) { return a.uid - b.uid; });
            var profileHeadersLength = profileHeaders.length;
            for (var i = 0; i < profileHeadersLength; ++i)
                WebInspector.addProfileHeader(profileHeaders[i]);
        }

        var callId = WebInspector.Callback.wrap(populateCallback);
        InspectorBackend.getProfileHeaders(callId);

        delete this._shouldPopulateProfiles;
    },

    updateMainViewWidth: function(width)
    {
        this.welcomeView.element.style.left = width + "px";
        this.profileViews.style.left = width + "px";
        this.profileViewStatusBarItemsContainer.style.left = width + "px";
        this.resize();
    }
}

WebInspector.ProfilesPanel.prototype.__proto__ = WebInspector.Panel.prototype;

WebInspector.ProfileSidebarTreeElement = function(profile)
{
    this.profile = profile;

    if (this.profile.title.indexOf(UserInitiatedProfileName) === 0)
        this._profileNumber = this.profile.title.substring(UserInitiatedProfileName.length + 1);

    WebInspector.SidebarTreeElement.call(this, "profile-sidebar-tree-item", "", "", profile, false);

    this.refreshTitles();
}

WebInspector.ProfileSidebarTreeElement.prototype = {
    onselect: function()
    {
        this.treeOutline.panel.showProfile(this.profile);
    },

    ondelete: function()
    {
        this.treeOutline.panel.removeProfileHeader(this.profile);
        return true;
    },

    get mainTitle()
    {
        if (this._mainTitle)
            return this._mainTitle;
        if (this.profile.title.indexOf(UserInitiatedProfileName) === 0)
            return WebInspector.UIString("Profile %d", this._profileNumber);
        return this.profile.title;
    },

    set mainTitle(x)
    {
        this._mainTitle = x;
        this.refreshTitles();
    },

    get subtitle()
    {
        // There is no subtitle.
    },

    set subtitle(x)
    {
        // Can't change subtitle.
    },

    set searchMatches(matches)
    {
        if (!matches) {
            if (!this.bubbleElement)
                return;
            this.bubbleElement.removeStyleClass("search-matches");
            this.bubbleText = "";
            return;
        }

        this.bubbleText = matches;
        this.bubbleElement.addStyleClass("search-matches");
    }
}

WebInspector.ProfileSidebarTreeElement.prototype.__proto__ = WebInspector.SidebarTreeElement.prototype;

WebInspector.ProfileGroupSidebarTreeElement = function(title, subtitle)
{
    WebInspector.SidebarTreeElement.call(this, "profile-group-sidebar-tree-item", title, subtitle, null, true);
}

WebInspector.ProfileGroupSidebarTreeElement.prototype = {
    onselect: function()
    {
        if (this.children.length > 0)
            WebInspector.panels.profiles.showProfile(this.children[this.children.length - 1].profile);
    }
}

WebInspector.ProfileGroupSidebarTreeElement.prototype.__proto__ = WebInspector.SidebarTreeElement.prototype;

WebInspector.didGetProfileHeaders = WebInspector.Callback.processCallback;
WebInspector.didGetProfile = WebInspector.Callback.processCallback;
