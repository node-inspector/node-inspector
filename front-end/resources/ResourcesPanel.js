/*
 * Copyright (C) 2007, 2008, 2010 Apple Inc.  All rights reserved.
 * Copyright (C) 2009 Joseph Pecoraro
 * Copyright (C) 2013 Samsung Electronics. All rights reserved.
 *
 * Redistribution and use in source and binary forms, with or without
 * modification, are permitted provided that the following conditions
 * are met:
 *
 * 1.  Redistributions of source code must retain the above copyright
 *     notice, this list of conditions and the following disclaimer.
 * 2.  Redistributions in binary form must reproduce the above copyright
 *     notice, this list of conditions and the following disclaimer in the
 *     documentation and/or other materials provided with the distribution.
 * 3.  Neither the name of Apple Computer, Inc. ("Apple") nor the names of
 *     its contributors may be used to endorse or promote products derived
 *     from this software without specific prior written permission.
 *
 * THIS SOFTWARE IS PROVIDED BY APPLE AND ITS CONTRIBUTORS "AS IS" AND ANY
 * EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED
 * WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
 * DISCLAIMED. IN NO EVENT SHALL APPLE OR ITS CONTRIBUTORS BE LIABLE FOR ANY
 * DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES
 * (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES;
 * LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND
 * ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT
 * (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF
 * THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
 */

/**
 * @constructor
 * @extends {WebInspector.PanelWithSidebar}
 * @implements {WebInspector.TargetManager.Observer}
 */
WebInspector.ResourcesPanel = function()
{
    WebInspector.PanelWithSidebar.call(this, "resources");
    this.registerRequiredCSS("resources/resourcesPanel.css");

    this._resourcesLastSelectedItemSetting = WebInspector.settings.createSetting("resourcesLastSelectedItem", {});

    this._sidebarTree = new TreeOutline();
    this._sidebarTree.element.classList.add("filter-all", "children", "small", "outline-disclosure");
    this.panelSidebarElement().appendChild(this._sidebarTree.element);
    this.setDefaultFocusedElement(this._sidebarTree.element);

    this.resourcesListTreeElement = new WebInspector.StorageCategoryTreeElement(this, WebInspector.UIString("Frames"), "Frames", ["frame-storage-tree-item"]);
    this._sidebarTree.appendChild(this.resourcesListTreeElement);

    this.databasesListTreeElement = new WebInspector.StorageCategoryTreeElement(this, WebInspector.UIString("Web SQL"), "Databases", ["database-storage-tree-item"]);
    this._sidebarTree.appendChild(this.databasesListTreeElement);

    this.indexedDBListTreeElement = new WebInspector.IndexedDBTreeElement(this);
    this._sidebarTree.appendChild(this.indexedDBListTreeElement);

    this.localStorageListTreeElement = new WebInspector.StorageCategoryTreeElement(this, WebInspector.UIString("Local Storage"), "LocalStorage", ["domstorage-storage-tree-item", "local-storage"]);
    this._sidebarTree.appendChild(this.localStorageListTreeElement);

    this.sessionStorageListTreeElement = new WebInspector.StorageCategoryTreeElement(this, WebInspector.UIString("Session Storage"), "SessionStorage", ["domstorage-storage-tree-item", "session-storage"]);
    this._sidebarTree.appendChild(this.sessionStorageListTreeElement);

    this.cookieListTreeElement = new WebInspector.StorageCategoryTreeElement(this, WebInspector.UIString("Cookies"), "Cookies", ["cookie-storage-tree-item"]);
    this._sidebarTree.appendChild(this.cookieListTreeElement);

    this.applicationCacheListTreeElement = new WebInspector.StorageCategoryTreeElement(this, WebInspector.UIString("Application Cache"), "ApplicationCache", ["application-cache-storage-tree-item"]);
    this._sidebarTree.appendChild(this.applicationCacheListTreeElement);

    this.cacheStorageListTreeElement = new WebInspector.ServiceWorkerCacheTreeElement(this);
    this._sidebarTree.appendChild(this.cacheStorageListTreeElement);

    if (Runtime.experiments.isEnabled("fileSystemInspection")) {
        this.fileSystemListTreeElement = new WebInspector.FileSystemListTreeElement(this);
        this._sidebarTree.appendChild(this.fileSystemListTreeElement);
    }

    var mainContainer = new WebInspector.VBox();
    this.storageViews = mainContainer.element.createChild("div", "vbox flex-auto");
    this._storageViewToolbar = new WebInspector.Toolbar(mainContainer.element);
    this._storageViewToolbar.element.classList.add("resources-toolbar");
    this.splitWidget().setMainWidget(mainContainer);

    /** @type {!Map.<!WebInspector.Database, !Object.<string, !WebInspector.DatabaseTableView>>} */
    this._databaseTableViews = new Map();
    /** @type {!Map.<!WebInspector.Database, !WebInspector.DatabaseQueryView>} */
    this._databaseQueryViews = new Map();
    /** @type {!Map.<!WebInspector.Database, !WebInspector.DatabaseTreeElement>} */
    this._databaseTreeElements = new Map();
    /** @type {!Map.<!WebInspector.DOMStorage, !WebInspector.DOMStorageItemsView>} */
    this._domStorageViews = new Map();
    /** @type {!Map.<!WebInspector.DOMStorage, !WebInspector.DOMStorageTreeElement>} */
    this._domStorageTreeElements = new Map();
    /** @type {!Object.<string, !WebInspector.CookieItemsView>} */
    this._cookieViews = {};
    /** @type {!Object.<string, boolean>} */
    this._domains = {};

    this.panelSidebarElement().addEventListener("mousemove", this._onmousemove.bind(this), false);
    this.panelSidebarElement().addEventListener("mouseleave", this._onmouseleave.bind(this), false);

    /**
     * @this {WebInspector.ResourcesPanel}
     * @return {?WebInspector.SourceFrame}
     */
    function sourceFrameGetter()
    {
        var view = this.visibleView;
        if (view && view instanceof WebInspector.SourceFrame)
            return /** @type {!WebInspector.SourceFrame} */ (view);
        return null;
    }
    WebInspector.GoToLineDialog.install(this, sourceFrameGetter.bind(this));

    WebInspector.targetManager.observeTargets(this);
}

WebInspector.ResourcesPanel.prototype = {
    /**
     * @override
     * @param {!WebInspector.Target} target
     */
    targetAdded: function(target)
    {
        if (this._target)
            return;
        this._target = target;

        if (target.serviceWorkerManager && Runtime.experiments.isEnabled("serviceWorkersInResources")) {
            this.serviceWorkersTreeElement = new WebInspector.ServiceWorkersTreeElement(this);
            this._sidebarTree.appendChild(this.serviceWorkersTreeElement);
        }

        this._databaseModel = WebInspector.DatabaseModel.fromTarget(target);
        this._domStorageModel = WebInspector.DOMStorageModel.fromTarget(target);

        if (target.resourceTreeModel.cachedResourcesLoaded())
            this._initialize();

        target.resourceTreeModel.addEventListener(WebInspector.ResourceTreeModel.EventTypes.Load, this._loadEventFired, this);
        target.resourceTreeModel.addEventListener(WebInspector.ResourceTreeModel.EventTypes.CachedResourcesLoaded, this._initialize, this);
        target.resourceTreeModel.addEventListener(WebInspector.ResourceTreeModel.EventTypes.WillLoadCachedResources, this._resetWithFrames, this);
        this._databaseModel.addEventListener(WebInspector.DatabaseModel.Events.DatabaseAdded, this._databaseAdded, this);
    },

    /**
     * @override
     * @param {!WebInspector.Target} target
     */
    targetRemoved: function(target)
    {
        if (target !== this._target)
            return;
        delete this._target;

        target.resourceTreeModel.removeEventListener(WebInspector.ResourceTreeModel.EventTypes.Load, this._loadEventFired, this);
        target.resourceTreeModel.removeEventListener(WebInspector.ResourceTreeModel.EventTypes.CachedResourcesLoaded, this._initialize, this);
        target.resourceTreeModel.removeEventListener(WebInspector.ResourceTreeModel.EventTypes.WillLoadCachedResources, this._resetWithFrames, this);
        this._databaseModel.removeEventListener(WebInspector.DatabaseModel.Events.DatabaseAdded, this._databaseAdded, this);

        this._resetWithFrames();
    },

    _initialize: function()
    {
        this._databaseModel.enable();
        this._domStorageModel.enable();
        var indexedDBModel = WebInspector.IndexedDBModel.fromTarget(this._target);
        if (indexedDBModel)
            indexedDBModel.enable();

        var cacheStorageModel = WebInspector.ServiceWorkerCacheModel.fromTarget(this._target);
        if (cacheStorageModel)
            cacheStorageModel.enable();

        if (this._target.isPage())
            this._populateResourceTree();
        this._populateDOMStorageTree();
        this._populateApplicationCacheTree();
        this.indexedDBListTreeElement._initialize();
        this.cacheStorageListTreeElement._initialize();
        if (Runtime.experiments.isEnabled("fileSystemInspection"))
            this.fileSystemListTreeElement._initialize();
        this._initDefaultSelection();
        this._initialized = true;
    },

    _loadEventFired: function()
    {
        this._initDefaultSelection();
    },

    _initDefaultSelection: function()
    {
        if (!this._initialized)
            return;

        var itemURL = this._resourcesLastSelectedItemSetting.get();
        if (itemURL) {
            var rootElement = this._sidebarTree.rootElement();
            for (var treeElement = rootElement.firstChild(); treeElement; treeElement = treeElement.traverseNextTreeElement(false, rootElement, true)) {
                if (treeElement.itemURL === itemURL) {
                    treeElement.revealAndSelect(true);
                    return;
                }
            }
        }

        var mainResource = this._target.resourceTreeModel.inspectedPageURL() && this.resourcesListTreeElement && this.resourcesListTreeElement.expanded
                ? this._target.resourceTreeModel.resourceForURL(this._target.resourceTreeModel.inspectedPageURL())
                : null;
        if (mainResource)
            this.showResource(mainResource);
    },

    _resetWithFrames: function()
    {
        this.resourcesListTreeElement.removeChildren();
        this._treeElementForFrameId = {};
        this._reset();
    },

    _reset: function()
    {
        this._domains = {};
        var queryViews = this._databaseQueryViews.valuesArray();
        for (var i = 0; i < queryViews.length; ++i)
            queryViews[i].removeEventListener(WebInspector.DatabaseQueryView.Events.SchemaUpdated, this._updateDatabaseTables, this);
        this._databaseTableViews.clear();
        this._databaseQueryViews.clear();
        this._databaseTreeElements.clear();
        this._domStorageViews.clear();
        this._domStorageTreeElements.clear();
        this._cookieViews = {};

        this.databasesListTreeElement.removeChildren();
        this.localStorageListTreeElement.removeChildren();
        this.sessionStorageListTreeElement.removeChildren();
        this.cookieListTreeElement.removeChildren();
        this.cacheStorageListTreeElement.removeChildren();

        if (this.visibleView && !(this.visibleView instanceof WebInspector.StorageCategoryView))
            this.visibleView.detach();

        this._storageViewToolbar.removeToolbarItems();

        if (this._sidebarTree.selectedTreeElement)
            this._sidebarTree.selectedTreeElement.deselect();
    },

    _populateResourceTree: function()
    {
        this._treeElementForFrameId = {};
        this._target.resourceTreeModel.addEventListener(WebInspector.ResourceTreeModel.EventTypes.FrameAdded, this._frameAdded, this);
        this._target.resourceTreeModel.addEventListener(WebInspector.ResourceTreeModel.EventTypes.FrameNavigated, this._frameNavigated, this);
        this._target.resourceTreeModel.addEventListener(WebInspector.ResourceTreeModel.EventTypes.FrameDetached, this._frameDetached, this);
        this._target.resourceTreeModel.addEventListener(WebInspector.ResourceTreeModel.EventTypes.ResourceAdded, this._resourceAdded, this);

        /**
         * @param {!WebInspector.ResourceTreeFrame} frame
         * @this {WebInspector.ResourcesPanel}
         */
        function populateFrame(frame)
        {
            this._frameAdded({data:frame});
            for (var i = 0; i < frame.childFrames.length; ++i)
                populateFrame.call(this, frame.childFrames[i]);

            var resources = frame.resources();
            for (var i = 0; i < resources.length; ++i)
                this._resourceAdded({data:resources[i]});
        }
        populateFrame.call(this, this._target.resourceTreeModel.mainFrame);
    },

    _frameAdded: function(event)
    {
        var frame = event.data;
        var parentFrame = frame.parentFrame;

        var parentTreeElement = parentFrame ? this._treeElementForFrameId[parentFrame.id] : this.resourcesListTreeElement;
        if (!parentTreeElement) {
            console.warn("No frame to route " + frame.url + " to.");
            return;
        }

        var frameTreeElement = new WebInspector.FrameTreeElement(this, frame);
        this._treeElementForFrameId[frame.id] = frameTreeElement;
        parentTreeElement.appendChild(frameTreeElement);
    },

    _frameDetached: function(event)
    {
        var frame = event.data;
        var frameTreeElement = this._treeElementForFrameId[frame.id];
        if (!frameTreeElement)
            return;

        delete this._treeElementForFrameId[frame.id];
        if (frameTreeElement.parent)
            frameTreeElement.parent.removeChild(frameTreeElement);
    },

    _resourceAdded: function(event)
    {
        var resource = event.data;
        var frameId = resource.frameId;

        if (resource.statusCode >= 301 && resource.statusCode <= 303)
            return;

        var frameTreeElement = this._treeElementForFrameId[frameId];
        if (!frameTreeElement) {
            // This is a frame's main resource, it will be retained
            // and re-added by the resource manager;
            return;
        }

        frameTreeElement.appendResource(resource);
    },

    _frameNavigated: function(event)
    {
        var frame = event.data;

        if (!frame.parentFrame)
            this._reset();

        var frameId = frame.id;
        var frameTreeElement = this._treeElementForFrameId[frameId];
        if (frameTreeElement)
            frameTreeElement.frameNavigated(frame);

        var applicationCacheFrameTreeElement = this._applicationCacheFrameElements[frameId];
        if (applicationCacheFrameTreeElement)
            applicationCacheFrameTreeElement.frameNavigated(frame);
    },

    /**
     * @param {!WebInspector.Event} event
     */
    _databaseAdded: function(event)
    {
        var database = /** @type {!WebInspector.Database} */ (event.data);
        this._addDatabase(database);
    },

    /**
     * @param {!WebInspector.Database} database
     */
    _addDatabase: function(database)
    {
        var databaseTreeElement = new WebInspector.DatabaseTreeElement(this, database);
        this._databaseTreeElements.set(database, databaseTreeElement);
        this.databasesListTreeElement.appendChild(databaseTreeElement);
    },

    addDocumentURL: function(url)
    {
        var parsedURL = url.asParsedURL();
        if (!parsedURL)
            return;

        var domain = parsedURL.host;
        if (!this._domains[domain]) {
            this._domains[domain] = true;

            var cookieDomainTreeElement = new WebInspector.CookieTreeElement(this, domain);
            this.cookieListTreeElement.appendChild(cookieDomainTreeElement);
        }
    },

    /**
     * @param {!WebInspector.Event} event
     */
    _domStorageAdded: function(event)
    {
        var domStorage = /** @type {!WebInspector.DOMStorage} */ (event.data);
        this._addDOMStorage(domStorage);
    },

    /**
     * @param {!WebInspector.DOMStorage} domStorage
     */
    _addDOMStorage: function(domStorage)
    {
        console.assert(!this._domStorageTreeElements.get(domStorage));

        var domStorageTreeElement = new WebInspector.DOMStorageTreeElement(this, domStorage, (domStorage.isLocalStorage ? "local-storage" : "session-storage"));
        this._domStorageTreeElements.set(domStorage, domStorageTreeElement);
        if (domStorage.isLocalStorage)
            this.localStorageListTreeElement.appendChild(domStorageTreeElement);
        else
            this.sessionStorageListTreeElement.appendChild(domStorageTreeElement);
    },

    /**
     * @param {!WebInspector.Event} event
     */
    _domStorageRemoved: function(event)
    {
        var domStorage = /** @type {!WebInspector.DOMStorage} */ (event.data);
        this._removeDOMStorage(domStorage);
    },

    /**
     * @param {!WebInspector.DOMStorage} domStorage
     */
    _removeDOMStorage: function(domStorage)
    {
        var treeElement = this._domStorageTreeElements.get(domStorage);
        if (!treeElement)
            return;
        var wasSelected = treeElement.selected;
        var parentListTreeElement = treeElement.parent;
        parentListTreeElement.removeChild(treeElement);
        if (wasSelected)
            parentListTreeElement.select();
        this._domStorageTreeElements.remove(domStorage);
        this._domStorageViews.remove(domStorage);
    },

    /**
     * @param {!WebInspector.Database} database
     */
    selectDatabase: function(database)
    {
        if (database) {
            this._showDatabase(database);
            this._databaseTreeElements.get(database).select();
        }
    },

    /**
     * @param {!WebInspector.DOMStorage} domStorage
     */
    selectDOMStorage: function(domStorage)
    {
        if (domStorage) {
            this._showDOMStorage(domStorage);
            this._domStorageTreeElements.get(domStorage).select();
        }
    },

    /**
     * @param {!WebInspector.Resource} resource
     * @param {number=} line
     * @param {number=} column
     * @return {boolean}
     */
    showResource: function(resource, line, column)
    {
        var resourceTreeElement = this._findTreeElementForResource(resource);
        if (resourceTreeElement)
            resourceTreeElement.revealAndSelect(true);

        if (typeof line === "number") {
            var resourceSourceFrame = this._resourceSourceFrameViewForResource(resource);
            if (resourceSourceFrame)
                resourceSourceFrame.revealPosition(line, column, true);
        }
        return true;
    },

    _showResourceView: function(resource)
    {
        var view = this._resourceViewForResource(resource);
        if (!view) {
            this.visibleView.detach();
            return;
        }
        this._innerShowView(view);
    },

    /**
     * @param {!WebInspector.Resource} resource
     * @return {?WebInspector.Widget}
     */
    _resourceViewForResource: function(resource)
    {
        if (resource.hasTextContent()) {
            var treeElement = this._findTreeElementForResource(resource);
            if (!treeElement)
                return null;
            return treeElement.sourceView();
        }

        switch (resource.resourceType()) {
        case WebInspector.resourceTypes.Image:
            return new WebInspector.ImageView(resource.url, resource.mimeType, resource);
        case WebInspector.resourceTypes.Font:
            return new WebInspector.FontView(resource.url, resource.mimeType, resource);
        default:
            return new WebInspector.EmptyWidget(resource.url);
        }
    },

    /**
     * @param {!WebInspector.Resource} resource
     * @return {?WebInspector.ResourceSourceFrame}
     */
    _resourceSourceFrameViewForResource: function(resource)
    {
        var resourceView = this._resourceViewForResource(resource);
        if (resourceView && resourceView instanceof WebInspector.ResourceSourceFrame)
            return /** @type {!WebInspector.ResourceSourceFrame} */ (resourceView);
        return null;
    },

    /**
     * @param {!WebInspector.Database} database
     * @param {string=} tableName
     */
    _showDatabase: function(database, tableName)
    {
        if (!database)
            return;

        var view;
        if (tableName) {
            var tableViews = this._databaseTableViews.get(database);
            if (!tableViews) {
                tableViews = /** @type {!Object.<string, !WebInspector.DatabaseTableView>} */ ({});
                this._databaseTableViews.set(database, tableViews);
            }
            view = tableViews[tableName];
            if (!view) {
                view = new WebInspector.DatabaseTableView(database, tableName);
                tableViews[tableName] = view;
            }
        } else {
            view = this._databaseQueryViews.get(database);
            if (!view) {
                view = new WebInspector.DatabaseQueryView(database);
                this._databaseQueryViews.set(database, view);
                view.addEventListener(WebInspector.DatabaseQueryView.Events.SchemaUpdated, this._updateDatabaseTables, this);
            }
        }

        this._innerShowView(view);
    },

    /**
     * @param {!WebInspector.Widget} view
     */
    showIndexedDB: function(view)
    {
        this._innerShowView(view);
    },

    /**
     * @param {!WebInspector.Widget} view
     */
    showServiceWorkerCache: function(view)
    {
        this._innerShowView(view);
    },

    /**
     * @param {!WebInspector.Widget} view
     */
     showServiceWorkersView: function(view)
    {
        this._innerShowView(view);
    },

    /**
     * @param {!WebInspector.DOMStorage} domStorage
     */
    _showDOMStorage: function(domStorage)
    {
        if (!domStorage)
            return;

        var view;
        view = this._domStorageViews.get(domStorage);
        if (!view) {
            view = new WebInspector.DOMStorageItemsView(domStorage);
            this._domStorageViews.set(domStorage, view);
        }

        this._innerShowView(view);
    },

    /**
     * @param {!WebInspector.CookieTreeElement} treeElement
     * @param {string} cookieDomain
     */
    showCookies: function(treeElement, cookieDomain)
    {
        var view = this._cookieViews[cookieDomain];
        if (!view) {
            view = new WebInspector.CookieItemsView(treeElement, cookieDomain);
            this._cookieViews[cookieDomain] = view;
        }

        this._innerShowView(view);
    },

    /**
     * @param {string} cookieDomain
     */
    clearCookies: function(cookieDomain)
    {
        this._cookieViews[cookieDomain].clear();
    },

    showApplicationCache: function(frameId)
    {
        if (!this._applicationCacheViews[frameId])
            this._applicationCacheViews[frameId] = new WebInspector.ApplicationCacheItemsView(this._applicationCacheModel, frameId);

        this._innerShowView(this._applicationCacheViews[frameId]);
    },

    /**
     *  @param {!WebInspector.Widget} view
     */
    showFileSystem: function(view)
    {
        this._innerShowView(view);
    },

    showCategoryView: function(categoryName)
    {
        if (!this._categoryView)
            this._categoryView = new WebInspector.StorageCategoryView();
        this._categoryView.setText(categoryName);
        this._innerShowView(this._categoryView);
    },

    _innerShowView: function(view)
    {
        if (this.visibleView === view)
            return;

        if (this.visibleView)
            this.visibleView.detach();

        view.show(this.storageViews);
        this.visibleView = view;

        this._storageViewToolbar.removeToolbarItems();
        var toolbarItems = view.toolbarItems ? view.toolbarItems() : null;
        for (var i = 0; toolbarItems && i < toolbarItems.length; ++i)
            this._storageViewToolbar.appendToolbarItem(toolbarItems[i]);
    },

    closeVisibleView: function()
    {
        if (!this.visibleView)
            return;
        this.visibleView.detach();
        delete this.visibleView;
    },

    _updateDatabaseTables: function(event)
    {
        var database = event.data;

        if (!database)
            return;

        var databasesTreeElement = this._databaseTreeElements.get(database);
        if (!databasesTreeElement)
            return;

        databasesTreeElement.invalidateChildren();
        var tableViews = this._databaseTableViews.get(database);

        if (!tableViews)
            return;

        var tableNamesHash = {};
        var self = this;
        function tableNamesCallback(tableNames)
        {
            var tableNamesLength = tableNames.length;
            for (var i = 0; i < tableNamesLength; ++i)
                tableNamesHash[tableNames[i]] = true;

            for (var tableName in tableViews) {
                if (!(tableName in tableNamesHash)) {
                    if (self.visibleView === tableViews[tableName])
                        self.closeVisibleView();
                    delete tableViews[tableName];
                }
            }
        }
        database.getTableNames(tableNamesCallback);
    },

    _populateDOMStorageTree: function()
    {
        this._domStorageModel.storages().forEach(this._addDOMStorage.bind(this));
        this._domStorageModel.addEventListener(WebInspector.DOMStorageModel.Events.DOMStorageAdded, this._domStorageAdded, this);
        this._domStorageModel.addEventListener(WebInspector.DOMStorageModel.Events.DOMStorageRemoved, this._domStorageRemoved, this);
    },

    _populateApplicationCacheTree: function()
    {
        this._applicationCacheModel = new WebInspector.ApplicationCacheModel(this._target);

        this._applicationCacheViews = {};
        this._applicationCacheFrameElements = {};
        this._applicationCacheManifestElements = {};

        this._applicationCacheModel.addEventListener(WebInspector.ApplicationCacheModel.EventTypes.FrameManifestAdded, this._applicationCacheFrameManifestAdded, this);
        this._applicationCacheModel.addEventListener(WebInspector.ApplicationCacheModel.EventTypes.FrameManifestRemoved, this._applicationCacheFrameManifestRemoved, this);

        this._applicationCacheModel.addEventListener(WebInspector.ApplicationCacheModel.EventTypes.FrameManifestStatusUpdated, this._applicationCacheFrameManifestStatusChanged, this);
        this._applicationCacheModel.addEventListener(WebInspector.ApplicationCacheModel.EventTypes.NetworkStateChanged, this._applicationCacheNetworkStateChanged, this);
    },

    _applicationCacheFrameManifestAdded: function(event)
    {
        var frameId = event.data;
        var manifestURL = this._applicationCacheModel.frameManifestURL(frameId);

        var manifestTreeElement = this._applicationCacheManifestElements[manifestURL];
        if (!manifestTreeElement) {
            manifestTreeElement = new WebInspector.ApplicationCacheManifestTreeElement(this, manifestURL);
            this.applicationCacheListTreeElement.appendChild(manifestTreeElement);
            this._applicationCacheManifestElements[manifestURL] = manifestTreeElement;
        }

        var frameTreeElement = new WebInspector.ApplicationCacheFrameTreeElement(this, frameId, manifestURL);
        manifestTreeElement.appendChild(frameTreeElement);
        manifestTreeElement.expand();
        this._applicationCacheFrameElements[frameId] = frameTreeElement;
    },

    _applicationCacheFrameManifestRemoved: function(event)
    {
        var frameId = event.data;
        var frameTreeElement = this._applicationCacheFrameElements[frameId];
        if (!frameTreeElement)
            return;

        var manifestURL = frameTreeElement.manifestURL;
        delete this._applicationCacheFrameElements[frameId];
        delete this._applicationCacheViews[frameId];
        frameTreeElement.parent.removeChild(frameTreeElement);

        var manifestTreeElement = this._applicationCacheManifestElements[manifestURL];
        if (manifestTreeElement.childCount())
            return;

        delete this._applicationCacheManifestElements[manifestURL];
        manifestTreeElement.parent.removeChild(manifestTreeElement);
    },

    _applicationCacheFrameManifestStatusChanged: function(event)
    {
        var frameId = event.data;
        var status = this._applicationCacheModel.frameManifestStatus(frameId);

        if (this._applicationCacheViews[frameId])
            this._applicationCacheViews[frameId].updateStatus(status);
    },

    _applicationCacheNetworkStateChanged: function(event)
    {
        var isNowOnline = event.data;

        for (var manifestURL in this._applicationCacheViews)
            this._applicationCacheViews[manifestURL].updateNetworkState(isNowOnline);
    },

    _findTreeElementForResource: function(resource)
    {
        return resource[WebInspector.FrameResourceTreeElement._symbol];
    },

    showView: function(view)
    {
        if (view)
            this.showResource(view.resource);
    },

    _onmousemove: function(event)
    {
        var nodeUnderMouse = event.target;
        if (!nodeUnderMouse)
            return;

        var listNode = nodeUnderMouse.enclosingNodeOrSelfWithNodeName("li");
        if (!listNode)
            return;

        var element = listNode.treeElement;
        if (this._previousHoveredElement === element)
            return;

        if (this._previousHoveredElement) {
            this._previousHoveredElement.hovered = false;
            delete this._previousHoveredElement;
        }

        if (element instanceof WebInspector.FrameTreeElement) {
            this._previousHoveredElement = element;
            element.hovered = true;
        }
    },

    _onmouseleave: function(event)
    {
        if (this._previousHoveredElement) {
            this._previousHoveredElement.hovered = false;
            delete this._previousHoveredElement;
        }
    },

    __proto__: WebInspector.PanelWithSidebar.prototype
}

/**
 * @constructor
 * @implements {WebInspector.Revealer}
 */
WebInspector.ResourcesPanel.ResourceRevealer = function()
{
}

WebInspector.ResourcesPanel.ResourceRevealer.prototype = {
    /**
     * @override
     * @param {!Object} resource
     * @param {number=} lineNumber
     * @return {!Promise}
     */
    reveal: function(resource, lineNumber)
    {
        if (!(resource instanceof WebInspector.Resource))
            return Promise.reject(new Error("Internal error: not a resource"));
        var panel = WebInspector.ResourcesPanel._instance();
        WebInspector.inspectorView.setCurrentPanel(panel);
        panel.showResource(resource, lineNumber);
        return Promise.resolve();
    }
}

/**
 * @constructor
 * @extends {TreeElement}
 * @param {!WebInspector.ResourcesPanel} storagePanel
 * @param {string} title
 * @param {?Array.<string>=} iconClasses
 * @param {boolean=} expandable
 * @param {boolean=} noIcon
 */
WebInspector.BaseStorageTreeElement = function(storagePanel, title, iconClasses, expandable, noIcon)
{
    TreeElement.call(this, "", expandable);
    this._storagePanel = storagePanel;
    this._titleText = title;
    this._iconClasses = iconClasses;
    this._noIcon = noIcon;
}

WebInspector.BaseStorageTreeElement.prototype = {
    onattach: function()
    {
        this.listItemElement.removeChildren();
        if (this._iconClasses) {
            for (var i = 0; i < this._iconClasses.length; ++i)
                this.listItemElement.classList.add(this._iconClasses[i]);
        }

        this.listItemElement.createChild("div", "selection");

        if (!this._noIcon)
            this.imageElement = this.listItemElement.createChild("img", "icon");

        this.titleElement = this.listItemElement.createChild("div", "base-storage-tree-element-title");
        this._titleTextNode = this.titleElement.createTextChild("");
        this._updateTitle();
        this._updateSubtitle();
    },

    get displayName()
    {
        return this._displayName;
    },

    _updateDisplayName: function()
    {
        this._displayName = this._titleText || "";
        if (this._subtitleText)
            this._displayName += " (" + this._subtitleText + ")";
    },

    _updateTitle: function()
    {
        this._updateDisplayName();

        if (!this.titleElement)
            return;

        this._titleTextNode.textContent = this._titleText || "";
    },

    _updateSubtitle: function()
    {
        this._updateDisplayName();

        if (!this.titleElement)
            return;

        if (this._subtitleText) {
            if (!this._subtitleElement)
                this._subtitleElement = this.titleElement.createChild("span", "base-storage-tree-element-subtitle");
            this._subtitleElement.textContent = "(" + this._subtitleText + ")";
        } else if (this._subtitleElement) {
            this._subtitleElement.remove();
            delete this._subtitleElement;
        }
    },

    /**
     * @override
     * @return {boolean}
     */
    onselect: function(selectedByUser)
    {
        if (!selectedByUser)
            return false;
        var itemURL = this.itemURL;
        if (itemURL)
            this._storagePanel._resourcesLastSelectedItemSetting.set(itemURL);
        return false;
    },

    /**
     * @override
     */
    onreveal: function()
    {
        if (this.listItemElement)
            this.listItemElement.scrollIntoViewIfNeeded(false);
    },

    get titleText()
    {
        return this._titleText;
    },

    set titleText(titleText)
    {
        this._titleText = titleText;
        this._updateTitle();
    },

    get subtitleText()
    {
        return this._subtitleText;
    },

    set subtitleText(subtitleText)
    {
        this._subtitleText = subtitleText;
        this._updateSubtitle();
    },

    __proto__: TreeElement.prototype
}

/**
 * @constructor
 * @extends {WebInspector.BaseStorageTreeElement}
 * @param {!WebInspector.ResourcesPanel} storagePanel
 * @param {string} categoryName
 * @param {string} settingsKey
 * @param {?Array.<string>=} iconClasses
 * @param {boolean=} noIcon
 */
WebInspector.StorageCategoryTreeElement = function(storagePanel, categoryName, settingsKey, iconClasses, noIcon)
{
    WebInspector.BaseStorageTreeElement.call(this, storagePanel, categoryName, iconClasses, false, noIcon);
    this._expandedSetting = WebInspector.settings.createSetting("resources" + settingsKey + "Expanded", settingsKey === "Frames");
    this._categoryName = categoryName;
}

WebInspector.StorageCategoryTreeElement.prototype = {
    /**
     * @return {!WebInspector.Target}
     */
    target: function()
    {
        return this._storagePanel._target;
    },

    get itemURL()
    {
        return "category://" + this._categoryName;
    },

    /**
     * @override
     * @return {boolean}
     */
    onselect: function(selectedByUser)
    {
        WebInspector.BaseStorageTreeElement.prototype.onselect.call(this, selectedByUser);
        this._storagePanel.showCategoryView(this._categoryName);
        return false;
    },

    /**
     * @override
     */
    onattach: function()
    {
        WebInspector.BaseStorageTreeElement.prototype.onattach.call(this);
        if (this._expandedSetting.get())
            this.expand();
    },

    /**
     * @override
     */
    onexpand: function()
    {
        this._expandedSetting.set(true);
    },

    /**
     * @override
     */
    oncollapse: function()
    {
        this._expandedSetting.set(false);
    },

    __proto__: WebInspector.BaseStorageTreeElement.prototype
}

/**
 * @constructor
 * @extends {WebInspector.BaseStorageTreeElement}
 * @param {!WebInspector.ResourcesPanel} storagePanel
 * @param {!WebInspector.ResourceTreeFrame} frame
 */
WebInspector.FrameTreeElement = function(storagePanel, frame)
{
    WebInspector.BaseStorageTreeElement.call(this, storagePanel, "", ["frame-storage-tree-item"]);
    this._frame = frame;
    this.frameNavigated(frame);
}

WebInspector.FrameTreeElement.prototype = {
    frameNavigated: function(frame)
    {
        this.removeChildren();
        this._frameId = frame.id;

        this.titleText = frame.name;
        this.subtitleText = new WebInspector.ParsedURL(frame.url).displayName;

        this._categoryElements = {};
        this._treeElementForResource = {};

        this._storagePanel.addDocumentURL(frame.url);
    },

    get itemURL()
    {
        return "frame://" + encodeURI(this.displayName);
    },

    /**
     * @override
     * @return {boolean}
     */
    onselect: function(selectedByUser)
    {
        WebInspector.BaseStorageTreeElement.prototype.onselect.call(this, selectedByUser);
        this._storagePanel.showCategoryView(this.displayName);

        this.listItemElement.classList.remove("hovered");
        WebInspector.DOMModel.hideDOMNodeHighlight();
        return false;
    },

    set hovered(hovered)
    {
        if (hovered) {
            this.listItemElement.classList.add("hovered");
            var domModel = WebInspector.DOMModel.fromTarget(this._frame.target());
            if (domModel)
                domModel.highlightFrame(this._frameId);
        } else {
            this.listItemElement.classList.remove("hovered");
            WebInspector.DOMModel.hideDOMNodeHighlight();
        }
    },

    /**
     * @param {!WebInspector.Resource} resource
     */
    appendResource: function(resource)
    {
        if (resource.isHidden())
            return;
        var resourceType = resource.resourceType();
        var categoryName = resourceType.name();
        var categoryElement = resourceType === WebInspector.resourceTypes.Document ? this : this._categoryElements[categoryName];
        if (!categoryElement) {
            categoryElement = new WebInspector.StorageCategoryTreeElement(this._storagePanel, resource.resourceType().category().title, categoryName, null, true);
            this._categoryElements[resourceType.name()] = categoryElement;
            this._insertInPresentationOrder(this, categoryElement);
        }
        var resourceTreeElement = new WebInspector.FrameResourceTreeElement(this._storagePanel, resource);
        this._insertInPresentationOrder(categoryElement, resourceTreeElement);
        this._treeElementForResource[resource.url] = resourceTreeElement;
    },

    /**
     * @param {string} url
     * @return {?WebInspector.Resource}
     */
    resourceByURL: function(url)
    {
        var treeElement = this._treeElementForResource[url];
        return treeElement ? treeElement._resource : null;
    },

    appendChild: function(treeElement)
    {
        this._insertInPresentationOrder(this, treeElement);
    },

    _insertInPresentationOrder: function(parentTreeElement, childTreeElement)
    {
        // Insert in the alphabetical order, first frames, then resources. Document resource goes last.
        function typeWeight(treeElement)
        {
            if (treeElement instanceof WebInspector.StorageCategoryTreeElement)
                return 2;
            if (treeElement instanceof WebInspector.FrameTreeElement)
                return 1;
            return 3;
        }

        function compare(treeElement1, treeElement2)
        {
            var typeWeight1 = typeWeight(treeElement1);
            var typeWeight2 = typeWeight(treeElement2);

            var result;
            if (typeWeight1 > typeWeight2)
                result = 1;
            else if (typeWeight1 < typeWeight2)
                result = -1;
            else {
                var title1 = treeElement1.displayName || treeElement1.titleText;
                var title2 = treeElement2.displayName || treeElement2.titleText;
                result = title1.localeCompare(title2);
            }
            return result;
        }

        var childCount = parentTreeElement.childCount();
        var i;
        for (i = 0; i < childCount; ++i) {
            if (compare(childTreeElement, parentTreeElement.childAt(i)) < 0)
                break;
        }
        parentTreeElement.insertChild(childTreeElement, i);
    },

    __proto__: WebInspector.BaseStorageTreeElement.prototype
}

/**
 * @constructor
 * @extends {WebInspector.BaseStorageTreeElement}
 * @param {!WebInspector.ResourcesPanel} storagePanel
 * @param {!WebInspector.Resource} resource
 */
WebInspector.FrameResourceTreeElement = function(storagePanel, resource)
{
    WebInspector.BaseStorageTreeElement.call(this, storagePanel, resource.displayName, ["resource-sidebar-tree-item", "resources-type-" + resource.resourceType().name()]);
    /** @type {!WebInspector.Resource} */
    this._resource = resource;
    this._resource.addEventListener(WebInspector.Resource.Events.MessageAdded, this._consoleMessageAdded, this);
    this._resource.addEventListener(WebInspector.Resource.Events.MessagesCleared, this._consoleMessagesCleared, this);
    this.tooltip = resource.url;
    this._resource[WebInspector.FrameResourceTreeElement._symbol] = this;
}

WebInspector.FrameResourceTreeElement._symbol = Symbol("treeElement");

WebInspector.FrameResourceTreeElement.prototype = {
    get itemURL()
    {
        return this._resource.url;
    },

    /**
     * @override
     * @return {boolean}
     */
    onselect: function(selectedByUser)
    {
        WebInspector.BaseStorageTreeElement.prototype.onselect.call(this, selectedByUser);
        this._storagePanel._showResourceView(this._resource);
        return false;
    },

    /**
     * @override
     * @return {boolean}
     */
    ondblclick: function(event)
    {
        InspectorFrontendHost.openInNewTab(this._resource.url);
        return false;
    },

    /**
     * @override
     */
    onattach: function()
    {
        WebInspector.BaseStorageTreeElement.prototype.onattach.call(this);

        if (this._resource.resourceType() === WebInspector.resourceTypes.Image) {
            var iconElement = createElementWithClass("div", "icon");
            var previewImage = iconElement.createChild("img", "image-resource-icon-preview");
            this._resource.populateImageSource(previewImage);
            this.listItemElement.replaceChild(iconElement, this.imageElement);
        }

        this._statusElement = createElementWithClass("div", "status");
        this.listItemElement.insertBefore(this._statusElement, this.titleElement);

        this.listItemElement.draggable = true;
        this.listItemElement.addEventListener("dragstart", this._ondragstart.bind(this), false);
        this.listItemElement.addEventListener("contextmenu", this._handleContextMenuEvent.bind(this), true);

        this._updateErrorsAndWarningsBubbles();
    },

    /**
     * @param {!MouseEvent} event
     * @return {boolean}
     */
    _ondragstart: function(event)
    {
        event.dataTransfer.setData("text/plain", this._resource.content || "");
        event.dataTransfer.effectAllowed = "copy";
        return true;
    },

    _handleContextMenuEvent: function(event)
    {
        var contextMenu = new WebInspector.ContextMenu(event);
        contextMenu.appendApplicableItems(this._resource);
        contextMenu.show();
    },

    /**
     * @param {string} x
     */
    _setBubbleText: function(x)
    {
        if (!this._bubbleElement)
            this._bubbleElement = this._statusElement.createChild("div", "bubble-repeat-count");
        this._bubbleElement.textContent = x;
    },

    _resetBubble: function()
    {
        if (this._bubbleElement) {
            this._bubbleElement.textContent = "";
            this._bubbleElement.classList.remove("warning");
            this._bubbleElement.classList.remove("error");
        }
    },

    _updateErrorsAndWarningsBubbles: function()
    {
        if (this._storagePanel.currentQuery)
            return;

        this._resetBubble();

        if (this._resource.warnings || this._resource.errors)
            this._setBubbleText(String(this._resource.warnings + this._resource.errors));

        if (this._resource.warnings)
            this._bubbleElement.classList.add("warning");

        if (this._resource.errors)
            this._bubbleElement.classList.add("error");
    },

    _consoleMessagesCleared: function()
    {
        // FIXME: move to the SourceFrame.
        if (this._sourceView)
            this._sourceView.clearMessages();

        this._updateErrorsAndWarningsBubbles();
    },

    _consoleMessageAdded: function(event)
    {
        var msg = event.data;
        if (this._sourceView)
            this._sourceView.addMessage(msg);
        this._updateErrorsAndWarningsBubbles();
    },

    /**
     * @return {!WebInspector.ResourceSourceFrame}
     */
    sourceView: function()
    {
        if (!this._sourceView) {
            var sourceFrame = new WebInspector.ResourceSourceFrame(this._resource);
            sourceFrame.setHighlighterType(this._resource.canonicalMimeType());
            this._sourceView = sourceFrame;
            if (this._resource.messages) {
                for (var i = 0; i < this._resource.messages.length; i++)
                    this._sourceView.addPersistentMessage(this._resource.messages[i]);
            }
        }
        return this._sourceView;
    },

    __proto__: WebInspector.BaseStorageTreeElement.prototype
}

/**
 * @constructor
 * @extends {WebInspector.BaseStorageTreeElement}
 * @param {!WebInspector.ResourcesPanel} storagePanel
 * @param {!WebInspector.Database} database
 */
WebInspector.DatabaseTreeElement = function(storagePanel, database)
{
    WebInspector.BaseStorageTreeElement.call(this, storagePanel, database.name, ["database-storage-tree-item"], true);
    this._database = database;
}

WebInspector.DatabaseTreeElement.prototype = {
    get itemURL()
    {
        return "database://" + encodeURI(this._database.name);
    },

    /**
     * @override
     * @return {boolean}
     */
    onselect: function(selectedByUser)
    {
        WebInspector.BaseStorageTreeElement.prototype.onselect.call(this, selectedByUser);
        this._storagePanel._showDatabase(this._database);
        return false;
    },

    /**
     * @override
     */
    onexpand: function()
    {
        this._updateChildren();
    },

    _updateChildren: function()
    {
        this.removeChildren();

        /**
         * @param {!Array.<string>} tableNames
         * @this {WebInspector.DatabaseTreeElement}
         */
        function tableNamesCallback(tableNames)
        {
            var tableNamesLength = tableNames.length;
            for (var i = 0; i < tableNamesLength; ++i)
                this.appendChild(new WebInspector.DatabaseTableTreeElement(this._storagePanel, this._database, tableNames[i]));
        }
        this._database.getTableNames(tableNamesCallback.bind(this));
    },

    __proto__: WebInspector.BaseStorageTreeElement.prototype
}

/**
 * @constructor
 * @extends {WebInspector.BaseStorageTreeElement}
 */
WebInspector.DatabaseTableTreeElement = function(storagePanel, database, tableName)
{
    WebInspector.BaseStorageTreeElement.call(this, storagePanel, tableName, ["database-table-storage-tree-item"]);
    this._database = database;
    this._tableName = tableName;
}

WebInspector.DatabaseTableTreeElement.prototype = {
    get itemURL()
    {
        return "database://" + encodeURI(this._database.name) + "/" + encodeURI(this._tableName);
    },

    /**
     * @override
     * @return {boolean}
     */
    onselect: function(selectedByUser)
    {
        WebInspector.BaseStorageTreeElement.prototype.onselect.call(this, selectedByUser);
        this._storagePanel._showDatabase(this._database, this._tableName);
        return false;
    },

    __proto__: WebInspector.BaseStorageTreeElement.prototype
}


/**
 * @constructor
 * @extends {WebInspector.StorageCategoryTreeElement}
 * @param {!WebInspector.ResourcesPanel} storagePanel
 */
WebInspector.ServiceWorkerCacheTreeElement = function(storagePanel)
{
    WebInspector.StorageCategoryTreeElement.call(this, storagePanel, WebInspector.UIString("Cache Storage"), "CacheStorage", ["service-worker-cache-storage-tree-item"]);
}

WebInspector.ServiceWorkerCacheTreeElement.prototype = {
    _initialize: function()
    {
        /** @type {!Array.<!WebInspector.SWCacheTreeElement>} */
        this._swCacheTreeElements = [];
        var target = this._storagePanel._target;
        if (target) {
            var model = WebInspector.ServiceWorkerCacheModel.fromTarget(target);
            var caches = model.caches();
            for (var cache of caches)
                this._addCache(model, cache);
        }
        WebInspector.targetManager.addModelListener(WebInspector.ServiceWorkerCacheModel, WebInspector.ServiceWorkerCacheModel.EventTypes.CacheAdded, this._cacheAdded, this);
        WebInspector.targetManager.addModelListener(WebInspector.ServiceWorkerCacheModel, WebInspector.ServiceWorkerCacheModel.EventTypes.CacheRemoved, this._cacheRemoved, this);
    },

    onattach: function()
    {
        WebInspector.StorageCategoryTreeElement.prototype.onattach.call(this);
        this.listItemElement.addEventListener("contextmenu", this._handleContextMenuEvent.bind(this), true);
    },

    _handleContextMenuEvent: function(event)
    {
        var contextMenu = new WebInspector.ContextMenu(event);
        contextMenu.appendItem(WebInspector.UIString("Refresh Caches"), this._refreshCaches.bind(this));
        contextMenu.show();
    },

    _refreshCaches: function()
    {
        var target = this._storagePanel._target;
        if (target) {
            var model = WebInspector.ServiceWorkerCacheModel.fromTarget(target);
            model.refreshCacheNames();
        }
    },

    /**
     * @param {!WebInspector.Event} event
     */
    _cacheAdded: function(event)
    {
        var cache = /** @type {!WebInspector.ServiceWorkerCacheModel.Cache} */ (event.data);
        var model = /** @type {!WebInspector.ServiceWorkerCacheModel} */ (event.target);
        this._addCache(model, cache);
    },

    /**
     * @param {!WebInspector.ServiceWorkerCacheModel} model
     * @param {!WebInspector.ServiceWorkerCacheModel.Cache} cache
     */
    _addCache: function(model, cache)
    {
        var swCacheTreeElement = new WebInspector.SWCacheTreeElement(this._storagePanel, model, cache);
        this._swCacheTreeElements.push(swCacheTreeElement);
        this.appendChild(swCacheTreeElement);
    },

    /**
     * @param {!WebInspector.Event} event
     */
    _cacheRemoved: function(event)
    {
        var cache = /** @type {!WebInspector.ServiceWorkerCacheModel.Cache} */ (event.data);
        var model = /** @type {!WebInspector.ServiceWorkerCacheModel} */ (event.target);

        var swCacheTreeElement = this._cacheTreeElement(model, cache);
        if (!swCacheTreeElement)
            return;

        swCacheTreeElement.clear();
        this.removeChild(swCacheTreeElement);
        this._swCacheTreeElements.remove(swCacheTreeElement);
    },

    /**
     * @param {!WebInspector.ServiceWorkerCacheModel} model
     * @param {!WebInspector.ServiceWorkerCacheModel.Cache} cache
     * @return {?WebInspector.SWCacheTreeElement}
     */
    _cacheTreeElement: function(model, cache)
    {
        var index = -1;
        for (var i = 0; i < this._swCacheTreeElements.length; ++i) {
            if (this._swCacheTreeElements[i]._cache.equals(cache) && this._swCacheTreeElements[i]._model === model) {
                index = i;
                break;
            }
        }
        if (index !== -1)
            return this._swCacheTreeElements[i];
        return null;
    },

    __proto__: WebInspector.StorageCategoryTreeElement.prototype
}

/**
 * @constructor
 * @extends {WebInspector.BaseStorageTreeElement}
 * @param {!WebInspector.ResourcesPanel} storagePanel
 * @param {!WebInspector.ServiceWorkerCacheModel} model
 * @param {!WebInspector.ServiceWorkerCacheModel.Cache} cache
 */
WebInspector.SWCacheTreeElement = function(storagePanel, model, cache)
{
    WebInspector.BaseStorageTreeElement.call(this, storagePanel, cache.cacheName + " - " + cache.securityOrigin, ["service-worker-cache-tree-item"]);
    this._model = model;
    this._cache = cache;
}

WebInspector.SWCacheTreeElement.prototype = {
    get itemURL()
    {
        // I don't think this will work at all.
        return "cache://" + this._cache.cacheId;
    },

    onattach: function()
    {
        WebInspector.BaseStorageTreeElement.prototype.onattach.call(this);
        this.listItemElement.addEventListener("contextmenu", this._handleContextMenuEvent.bind(this), true);
    },

    _handleContextMenuEvent: function(event)
    {
        var contextMenu = new WebInspector.ContextMenu(event);
        contextMenu.appendItem(WebInspector.UIString("Delete"), this._clearCache.bind(this));
        contextMenu.show();
    },

    _clearCache: function()
    {
        this._model.deleteCache(this._cache);
    },

    /**
     * @param {!WebInspector.ServiceWorkerCacheModel.Cache} cache
     */
    update: function(cache)
    {
        this._cache = cache;
        if (this._view)
            this._view.update(cache);
    },

    /**
     * @override
     * @return {boolean}
     */
    onselect: function(selectedByUser)
    {
        WebInspector.BaseStorageTreeElement.prototype.onselect.call(this, selectedByUser);
        if (!this._view)
            this._view = new WebInspector.ServiceWorkerCacheView(this._model, this._cache);

        this._storagePanel.showServiceWorkerCache(this._view);
        return false;
    },

    clear: function()
    {
        if (this._view)
            this._view.clear();
    },

    __proto__: WebInspector.BaseStorageTreeElement.prototype
}


/**
 * @constructor
 * @extends {WebInspector.StorageCategoryTreeElement}
 * @param {!WebInspector.ResourcesPanel} storagePanel
 */
WebInspector.ServiceWorkersTreeElement = function(storagePanel)
{
    WebInspector.StorageCategoryTreeElement.call(this, storagePanel, WebInspector.UIString("Service Workers"), "Service Workers", ["service-workers-tree-item"]);
}

WebInspector.ServiceWorkersTreeElement.prototype = {
    /**
     * @override
     * @return {boolean}
     */
    onselect: function(selectedByUser)
    {
        WebInspector.StorageCategoryTreeElement.prototype.onselect.call(this, selectedByUser);
        if (!this._view)
            this._view = new WebInspector.ServiceWorkersView();
        this._storagePanel.showServiceWorkersView(this._view);
        return false;
    },

    __proto__: WebInspector.StorageCategoryTreeElement.prototype
}


/**
 * @constructor
 * @extends {WebInspector.StorageCategoryTreeElement}
 * @param {!WebInspector.ResourcesPanel} storagePanel
 */
WebInspector.IndexedDBTreeElement = function(storagePanel)
{
    WebInspector.StorageCategoryTreeElement.call(this, storagePanel, WebInspector.UIString("IndexedDB"), "IndexedDB", ["indexed-db-storage-tree-item"]);
}

WebInspector.IndexedDBTreeElement.prototype = {
    _initialize: function()
    {
        WebInspector.targetManager.addModelListener(WebInspector.IndexedDBModel, WebInspector.IndexedDBModel.EventTypes.DatabaseAdded, this._indexedDBAdded, this);
        WebInspector.targetManager.addModelListener(WebInspector.IndexedDBModel, WebInspector.IndexedDBModel.EventTypes.DatabaseRemoved, this._indexedDBRemoved, this);
        WebInspector.targetManager.addModelListener(WebInspector.IndexedDBModel, WebInspector.IndexedDBModel.EventTypes.DatabaseLoaded, this._indexedDBLoaded, this);
        /** @type {!Array.<!WebInspector.IDBDatabaseTreeElement>} */
        this._idbDatabaseTreeElements = [];

        var targets = WebInspector.targetManager.targets();
        for (var i = 0; i < targets.length; ++i) {
            var indexedDBModel = WebInspector.IndexedDBModel.fromTarget(targets[i]);
            var databases = indexedDBModel.databases();
            for (var j = 0; j < databases.length; ++j)
                this._addIndexedDB(indexedDBModel, databases[j]);
        }
    },

    onattach: function()
    {
        WebInspector.StorageCategoryTreeElement.prototype.onattach.call(this);
        this.listItemElement.addEventListener("contextmenu", this._handleContextMenuEvent.bind(this), true);
    },

    _handleContextMenuEvent: function(event)
    {
        var contextMenu = new WebInspector.ContextMenu(event);
        contextMenu.appendItem(WebInspector.UIString("Refresh IndexedDB"), this.refreshIndexedDB.bind(this));
        contextMenu.show();
    },

    refreshIndexedDB: function()
    {
        var targets = WebInspector.targetManager.targets();
        for (var i = 0; i < targets.length; ++i)
            WebInspector.IndexedDBModel.fromTarget(targets[i]).refreshDatabaseNames();
    },

    /**
     * @param {!WebInspector.Event} event
     */
    _indexedDBAdded: function(event)
    {
        var databaseId = /** @type {!WebInspector.IndexedDBModel.DatabaseId} */ (event.data);
        var model = /** @type {!WebInspector.IndexedDBModel} */ (event.target);
        this._addIndexedDB(model, databaseId);
    },

    /**
     * @param {!WebInspector.IndexedDBModel} model
     * @param {!WebInspector.IndexedDBModel.DatabaseId} databaseId
     */
    _addIndexedDB: function(model, databaseId)
    {
        var idbDatabaseTreeElement = new WebInspector.IDBDatabaseTreeElement(this._storagePanel, model, databaseId);
        this._idbDatabaseTreeElements.push(idbDatabaseTreeElement);
        this.appendChild(idbDatabaseTreeElement);
        model.refreshDatabase(databaseId);
    },

    /**
     * @param {!WebInspector.Event} event
     */
    _indexedDBRemoved: function(event)
    {
        var databaseId = /** @type {!WebInspector.IndexedDBModel.DatabaseId} */ (event.data);
        var model = /** @type {!WebInspector.IndexedDBModel} */ (event.target);

        var idbDatabaseTreeElement = this._idbDatabaseTreeElement(model, databaseId)
        if (!idbDatabaseTreeElement)
            return;

        idbDatabaseTreeElement.clear();
        this.removeChild(idbDatabaseTreeElement);
        this._idbDatabaseTreeElements.remove(idbDatabaseTreeElement);
    },

    /**
     * @param {!WebInspector.Event} event
     */
    _indexedDBLoaded: function(event)
    {
        var database = /** @type {!WebInspector.IndexedDBModel.Database} */ (event.data);
        var model = /** @type {!WebInspector.IndexedDBModel} */ (event.target);

        var idbDatabaseTreeElement = this._idbDatabaseTreeElement(model, database.databaseId);
        if (!idbDatabaseTreeElement)
            return;

        idbDatabaseTreeElement.update(database);
    },

    /**
     * @param {!WebInspector.IndexedDBModel.DatabaseId} databaseId
     * @param {!WebInspector.IndexedDBModel} model
     * @return {?WebInspector.IDBDatabaseTreeElement}
     */
    _idbDatabaseTreeElement: function(model, databaseId)
    {
        var index = -1;
        for (var i = 0; i < this._idbDatabaseTreeElements.length; ++i) {
            if (this._idbDatabaseTreeElements[i]._databaseId.equals(databaseId) && this._idbDatabaseTreeElements[i]._model === model) {
                index = i;
                break;
            }
        }
        if (index !== -1)
            return this._idbDatabaseTreeElements[i];
        return null;
    },

    __proto__: WebInspector.StorageCategoryTreeElement.prototype
}

/**
 * @constructor
 * @extends {WebInspector.StorageCategoryTreeElement}
 * @param {!WebInspector.ResourcesPanel} storagePanel
 */
WebInspector.FileSystemListTreeElement = function(storagePanel)
{
    WebInspector.StorageCategoryTreeElement.call(this, storagePanel, WebInspector.UIString("FileSystem"), "FileSystem", ["file-system-storage-tree-item"]);
}

WebInspector.FileSystemListTreeElement.prototype = {
    _initialize: function()
    {
        this._refreshFileSystem();
    },

    onattach: function()
    {
        WebInspector.StorageCategoryTreeElement.prototype.onattach.call(this);
        this.listItemElement.addEventListener("contextmenu", this._handleContextMenuEvent.bind(this), true);
    },

    _handleContextMenuEvent: function(event)
    {
        var contextMenu = new WebInspector.ContextMenu(event);
        contextMenu.appendItem(WebInspector.UIString.capitalize("Refresh FileSystem ^list"), this._refreshFileSystem.bind(this));
        contextMenu.show();
    },

    _fileSystemAdded: function(event)
    {
        var fileSystem = /** @type {!WebInspector.FileSystemModel.FileSystem} */ (event.data);
        var fileSystemTreeElement = new WebInspector.FileSystemTreeElement(this._storagePanel, fileSystem);
        this.appendChild(fileSystemTreeElement);
    },

    _fileSystemRemoved: function(event)
    {
        var fileSystem = /** @type {!WebInspector.FileSystemModel.FileSystem} */ (event.data);
        var fileSystemTreeElement = this._fileSystemTreeElementByName(fileSystem.name);
        if (!fileSystemTreeElement)
            return;
        fileSystemTreeElement.clear();
        this.removeChild(fileSystemTreeElement);
    },

    _fileSystemTreeElementByName: function(fileSystemName)
    {
        for (var child of this.children()) {
            var fschild = /** @type {!WebInspector.FileSystemTreeElement} */ (child);
            if (fschild.fileSystemName === fileSystemName)
                return fschild;
        }
        return null;
    },

    _refreshFileSystem: function()
    {
        if (!this._fileSystemModel) {
            this._fileSystemModel = new WebInspector.FileSystemModel(this.target());
            this._fileSystemModel.addEventListener(WebInspector.FileSystemModel.EventTypes.FileSystemAdded, this._fileSystemAdded, this);
            this._fileSystemModel.addEventListener(WebInspector.FileSystemModel.EventTypes.FileSystemRemoved, this._fileSystemRemoved, this);
        }

        this._fileSystemModel.refreshFileSystemList();
    },

    __proto__: WebInspector.StorageCategoryTreeElement.prototype
}

/**
 * @constructor
 * @extends {WebInspector.BaseStorageTreeElement}
 * @param {!WebInspector.ResourcesPanel} storagePanel
 * @param {!WebInspector.IndexedDBModel} model
 * @param {!WebInspector.IndexedDBModel.DatabaseId} databaseId
 */
WebInspector.IDBDatabaseTreeElement = function(storagePanel, model, databaseId)
{
    WebInspector.BaseStorageTreeElement.call(this, storagePanel, databaseId.name + " - " + databaseId.securityOrigin, ["indexed-db-storage-tree-item"]);
    this._model = model;
    this._databaseId = databaseId;
    this._idbObjectStoreTreeElements = {};
}

WebInspector.IDBDatabaseTreeElement.prototype = {
    get itemURL()
    {
        return "indexedDB://" + this._databaseId.securityOrigin + "/" + this._databaseId.name;
    },

    onattach: function()
    {
        WebInspector.BaseStorageTreeElement.prototype.onattach.call(this);
        this.listItemElement.addEventListener("contextmenu", this._handleContextMenuEvent.bind(this), true);
    },

    _handleContextMenuEvent: function(event)
    {
        var contextMenu = new WebInspector.ContextMenu(event);
        contextMenu.appendItem(WebInspector.UIString("Refresh IndexedDB"), this._refreshIndexedDB.bind(this));
        contextMenu.show();
    },

    _refreshIndexedDB: function()
    {
        this._model.refreshDatabaseNames();
    },

    /**
     * @param {!WebInspector.IndexedDBModel.Database} database
     */
    update: function(database)
    {
        this._database = database;
        var objectStoreNames = {};
        for (var objectStoreName in this._database.objectStores) {
            var objectStore = this._database.objectStores[objectStoreName];
            objectStoreNames[objectStore.name] = true;
            if (!this._idbObjectStoreTreeElements[objectStore.name]) {
                var idbObjectStoreTreeElement = new WebInspector.IDBObjectStoreTreeElement(this._storagePanel, this._model, this._databaseId, objectStore);
                this._idbObjectStoreTreeElements[objectStore.name] = idbObjectStoreTreeElement;
                this.appendChild(idbObjectStoreTreeElement);
            }
            this._idbObjectStoreTreeElements[objectStore.name].update(objectStore);
        }
        for (var objectStoreName in this._idbObjectStoreTreeElements) {
            if (!objectStoreNames[objectStoreName])
                this._objectStoreRemoved(objectStoreName);
        }

        if (this._view)
            this._view.update(database);

        this._updateTooltip();
    },

    _updateTooltip: function()
    {
        this.tooltip = WebInspector.UIString("Version") + ": " + this._database.version;
    },

    /**
     * @override
     * @return {boolean}
     */
    onselect: function(selectedByUser)
    {
        WebInspector.BaseStorageTreeElement.prototype.onselect.call(this, selectedByUser);
        if (!this._view)
            this._view = new WebInspector.IDBDatabaseView(this._database);

        this._storagePanel.showIndexedDB(this._view);
        return false;
    },

    /**
     * @param {string} objectStoreName
     */
    _objectStoreRemoved: function(objectStoreName)
    {
        var objectStoreTreeElement = this._idbObjectStoreTreeElements[objectStoreName];
        objectStoreTreeElement.clear();
        this.removeChild(objectStoreTreeElement);
        delete this._idbObjectStoreTreeElements[objectStoreName];
    },

    clear: function()
    {
        for (var objectStoreName in this._idbObjectStoreTreeElements)
            this._objectStoreRemoved(objectStoreName);
    },

    __proto__: WebInspector.BaseStorageTreeElement.prototype
}

/**
 * @constructor
 * @extends {WebInspector.BaseStorageTreeElement}
 * @param {!WebInspector.ResourcesPanel} storagePanel
 * @param {!WebInspector.IndexedDBModel} model
 * @param {!WebInspector.IndexedDBModel.DatabaseId} databaseId
 * @param {!WebInspector.IndexedDBModel.ObjectStore} objectStore
 */
WebInspector.IDBObjectStoreTreeElement = function(storagePanel, model, databaseId, objectStore)
{
    WebInspector.BaseStorageTreeElement.call(this, storagePanel, objectStore.name, ["indexed-db-object-store-storage-tree-item"]);
    this._model = model;
    this._databaseId = databaseId;
    this._idbIndexTreeElements = {};
}

WebInspector.IDBObjectStoreTreeElement.prototype = {
    get itemURL()
    {
        return "indexedDB://" + this._databaseId.securityOrigin + "/" + this._databaseId.name + "/" + this._objectStore.name;
    },

    onattach: function()
    {
        WebInspector.BaseStorageTreeElement.prototype.onattach.call(this);
        this.listItemElement.addEventListener("contextmenu", this._handleContextMenuEvent.bind(this), true);
    },

    _handleContextMenuEvent: function(event)
    {
        var contextMenu = new WebInspector.ContextMenu(event);
        contextMenu.appendItem(WebInspector.UIString("Clear"), this._clearObjectStore.bind(this));
        contextMenu.show();
    },

    _clearObjectStore: function()
    {
        /**
         * @this {WebInspector.IDBObjectStoreTreeElement}
         */
        function callback() {
            this.update(this._objectStore);
        }
        this._model.clearObjectStore(this._databaseId, this._objectStore.name, callback.bind(this));
    },

   /**
     * @param {!WebInspector.IndexedDBModel.ObjectStore} objectStore
     */
    update: function(objectStore)
    {
        this._objectStore = objectStore;

        var indexNames = {};
        for (var indexName in this._objectStore.indexes) {
            var index = this._objectStore.indexes[indexName];
            indexNames[index.name] = true;
            if (!this._idbIndexTreeElements[index.name]) {
                var idbIndexTreeElement = new WebInspector.IDBIndexTreeElement(this._storagePanel, this._model, this._databaseId, this._objectStore, index);
                this._idbIndexTreeElements[index.name] = idbIndexTreeElement;
                this.appendChild(idbIndexTreeElement);
            }
            this._idbIndexTreeElements[index.name].update(index);
        }
        for (var indexName in this._idbIndexTreeElements) {
            if (!indexNames[indexName])
                this._indexRemoved(indexName);
        }
        for (var indexName in this._idbIndexTreeElements) {
            if (!indexNames[indexName]) {
                this.removeChild(this._idbIndexTreeElements[indexName]);
                delete this._idbIndexTreeElements[indexName];
            }
        }

        if (this.childCount())
            this.expand();

        if (this._view)
            this._view.update(this._objectStore);

        this._updateTooltip();
    },

    _updateTooltip: function()
    {

        var keyPathString = this._objectStore.keyPathString;
        var tooltipString = keyPathString !== null ? (WebInspector.UIString("Key path: ") + keyPathString) : "";
        if (this._objectStore.autoIncrement)
            tooltipString += "\n" + WebInspector.UIString("autoIncrement");
        this.tooltip = tooltipString;
    },

    /**
     * @override
     * @return {boolean}
     */
    onselect: function(selectedByUser)
    {
        WebInspector.BaseStorageTreeElement.prototype.onselect.call(this, selectedByUser);
        if (!this._view)
            this._view = new WebInspector.IDBDataView(this._model, this._databaseId, this._objectStore, null);

        this._storagePanel.showIndexedDB(this._view);
        return false;
    },

    /**
     * @param {string} indexName
     */
    _indexRemoved: function(indexName)
    {
        var indexTreeElement = this._idbIndexTreeElements[indexName];
        indexTreeElement.clear();
        this.removeChild(indexTreeElement);
        delete this._idbIndexTreeElements[indexName];
    },

    clear: function()
    {
        for (var indexName in this._idbIndexTreeElements)
            this._indexRemoved(indexName);
        if (this._view)
            this._view.clear();
    },

    __proto__: WebInspector.BaseStorageTreeElement.prototype
}

/**
 * @constructor
 * @extends {WebInspector.BaseStorageTreeElement}
 * @param {!WebInspector.ResourcesPanel} storagePanel
 * @param {!WebInspector.IndexedDBModel} model
 * @param {!WebInspector.IndexedDBModel.DatabaseId} databaseId
 * @param {!WebInspector.IndexedDBModel.ObjectStore} objectStore
 * @param {!WebInspector.IndexedDBModel.Index} index
 */
WebInspector.IDBIndexTreeElement = function(storagePanel, model, databaseId, objectStore, index)
{
    WebInspector.BaseStorageTreeElement.call(this, storagePanel, index.name, ["indexed-db-index-storage-tree-item"]);
    this._model = model;
    this._databaseId = databaseId;
    this._objectStore = objectStore;
    this._index = index;
}

WebInspector.IDBIndexTreeElement.prototype = {
    get itemURL()
    {
        return "indexedDB://" + this._databaseId.securityOrigin + "/" + this._databaseId.name + "/" + this._objectStore.name + "/" + this._index.name;
    },

    /**
     * @param {!WebInspector.IndexedDBModel.Index} index
     */
    update: function(index)
    {
        this._index = index;

        if (this._view)
            this._view.update(this._index);

        this._updateTooltip();
    },

    _updateTooltip: function()
    {
        var tooltipLines = [];
        var keyPathString = this._index.keyPathString;
        tooltipLines.push(WebInspector.UIString("Key path: ") + keyPathString);
        if (this._index.unique)
            tooltipLines.push(WebInspector.UIString("unique"));
        if (this._index.multiEntry)
            tooltipLines.push(WebInspector.UIString("multiEntry"));
        this.tooltip = tooltipLines.join("\n");
    },

    /**
     * @override
     * @return {boolean}
     */
    onselect: function(selectedByUser)
    {
        WebInspector.BaseStorageTreeElement.prototype.onselect.call(this, selectedByUser);
        if (!this._view)
            this._view = new WebInspector.IDBDataView(this._model, this._databaseId, this._objectStore, this._index);

        this._storagePanel.showIndexedDB(this._view);
        return false;
    },

    clear: function()
    {
        if (this._view)
            this._view.clear();
    },

    __proto__: WebInspector.BaseStorageTreeElement.prototype
}

/**
 * @constructor
 * @extends {WebInspector.BaseStorageTreeElement}
 */
WebInspector.DOMStorageTreeElement = function(storagePanel, domStorage, className)
{
    WebInspector.BaseStorageTreeElement.call(this, storagePanel, domStorage.securityOrigin ? domStorage.securityOrigin : WebInspector.UIString("Local Files"), ["domstorage-storage-tree-item", className]);
    this._domStorage = domStorage;
}

WebInspector.DOMStorageTreeElement.prototype = {
    get itemURL()
    {
        return "storage://" + this._domStorage.securityOrigin + "/" + (this._domStorage.isLocalStorage ? "local" : "session");
    },

    /**
     * @override
     * @return {boolean}
     */
    onselect: function(selectedByUser)
    {
        WebInspector.BaseStorageTreeElement.prototype.onselect.call(this, selectedByUser);
        this._storagePanel._showDOMStorage(this._domStorage);
        return false;
    },

    __proto__: WebInspector.BaseStorageTreeElement.prototype
}

/**
 * @constructor
 * @extends {WebInspector.BaseStorageTreeElement}
 */
WebInspector.CookieTreeElement = function(storagePanel, cookieDomain)
{
    WebInspector.BaseStorageTreeElement.call(this, storagePanel, cookieDomain ? cookieDomain : WebInspector.UIString("Local Files"), ["cookie-storage-tree-item"]);
    this._cookieDomain = cookieDomain;
}

WebInspector.CookieTreeElement.prototype = {
    get itemURL()
    {
        return "cookies://" + this._cookieDomain;
    },

    onattach: function()
    {
        WebInspector.BaseStorageTreeElement.prototype.onattach.call(this);
        this.listItemElement.addEventListener("contextmenu", this._handleContextMenuEvent.bind(this), true);
    },

    /**
     * @param {!Event} event
     */
    _handleContextMenuEvent: function(event)
    {
        var contextMenu = new WebInspector.ContextMenu(event);
        contextMenu.appendItem(WebInspector.UIString("Clear"), this._clearCookies.bind(this));
        contextMenu.show();
    },

    /**
     * @param {string} domain
     */
    _clearCookies: function(domain)
    {
        this._storagePanel.clearCookies(this._cookieDomain);
    },

    /**
     * @override
     * @return {boolean}
     */
    onselect: function(selectedByUser)
    {
        WebInspector.BaseStorageTreeElement.prototype.onselect.call(this, selectedByUser);
        this._storagePanel.showCookies(this, this._cookieDomain);
        return false;
    },

    __proto__: WebInspector.BaseStorageTreeElement.prototype
}

/**
 * @constructor
 * @extends {WebInspector.BaseStorageTreeElement}
 */
WebInspector.ApplicationCacheManifestTreeElement = function(storagePanel, manifestURL)
{
    var title = new WebInspector.ParsedURL(manifestURL).displayName;
    WebInspector.BaseStorageTreeElement.call(this, storagePanel, title, ["application-cache-storage-tree-item"]);
    this.tooltip = manifestURL;
    this._manifestURL = manifestURL;
}

WebInspector.ApplicationCacheManifestTreeElement.prototype = {
    get itemURL()
    {
        return "appcache://" + this._manifestURL;
    },

    get manifestURL()
    {
        return this._manifestURL;
    },

    /**
     * @override
     * @return {boolean}
     */
    onselect: function(selectedByUser)
    {
        WebInspector.BaseStorageTreeElement.prototype.onselect.call(this, selectedByUser);
        this._storagePanel.showCategoryView(this._manifestURL);
        return false;
    },

    __proto__: WebInspector.BaseStorageTreeElement.prototype
}

/**
 * @constructor
 * @extends {WebInspector.BaseStorageTreeElement}
 * @param {!WebInspector.ResourcesPanel} storagePanel
 * @param {!PageAgent.FrameId} frameId
 * @param {string} manifestURL
 */
WebInspector.ApplicationCacheFrameTreeElement = function(storagePanel, frameId, manifestURL)
{
    WebInspector.BaseStorageTreeElement.call(this, storagePanel, "", ["frame-storage-tree-item"]);
    this._frameId = frameId;
    this._manifestURL = manifestURL;
    this._refreshTitles();
}

WebInspector.ApplicationCacheFrameTreeElement.prototype = {
    get itemURL()
    {
        return "appcache://" + this._manifestURL + "/" + encodeURI(this.displayName);
    },

    get frameId()
    {
        return this._frameId;
    },

    get manifestURL()
    {
        return this._manifestURL;
    },

    _refreshTitles: function()
    {
        var frame = this._storagePanel._target.resourceTreeModel.frameForId(this._frameId);
        if (!frame) {
            this.subtitleText = WebInspector.UIString("new frame");
            return;
        }
        this.titleText = frame.name;
        this.subtitleText = new WebInspector.ParsedURL(frame.url).displayName;
    },

    frameNavigated: function()
    {
        this._refreshTitles();
    },

    /**
     * @override
     * @return {boolean}
     */
    onselect: function(selectedByUser)
    {
        WebInspector.BaseStorageTreeElement.prototype.onselect.call(this, selectedByUser);
        this._storagePanel.showApplicationCache(this._frameId);
        return false;
    },

    __proto__: WebInspector.BaseStorageTreeElement.prototype
}

/**
 * @constructor
 * @extends {WebInspector.BaseStorageTreeElement}
 * @param {!WebInspector.ResourcesPanel} storagePanel
 * @param {!WebInspector.FileSystemModel.FileSystem} fileSystem
 */
WebInspector.FileSystemTreeElement = function(storagePanel, fileSystem)
{
    var displayName = fileSystem.type + " - " + fileSystem.origin;
    WebInspector.BaseStorageTreeElement.call(this, storagePanel, displayName, ["file-system-storage-tree-item"]);
    this._fileSystem = fileSystem;
}

WebInspector.FileSystemTreeElement.prototype = {
    get fileSystemName()
    {
        return this._fileSystem.name;
    },

    get itemURL()
    {
        return "filesystem://" + this._fileSystem.name;
    },

    /**
     * @override
     * @return {boolean}
     */
    onselect: function(selectedByUser)
    {
        WebInspector.BaseStorageTreeElement.prototype.onselect.call(this, selectedByUser);
        this._fileSystemView = new WebInspector.FileSystemView(this._fileSystem);
        this._storagePanel.showFileSystem(this._fileSystemView);
        return false;
    },

    clear: function()
    {
        if (this.fileSystemView && this._storagePanel.visibleView === this.fileSystemView)
            this._storagePanel.closeVisibleView();
    },

    __proto__: WebInspector.BaseStorageTreeElement.prototype
}

/**
 * @constructor
 * @extends {WebInspector.VBox}
 */
WebInspector.StorageCategoryView = function()
{
    WebInspector.VBox.call(this);

    this.element.classList.add("storage-view");
    this._emptyWidget = new WebInspector.EmptyWidget("");
    this._emptyWidget.show(this.element);
}

WebInspector.StorageCategoryView.prototype = {
    /**
     * @return {!Array.<!WebInspector.ToolbarItem>}
     */
    toolbarItems: function()
    {
        return [];
    },

    setText: function(text)
    {
        this._emptyWidget.text = text;
    },

    __proto__: WebInspector.VBox.prototype
}

WebInspector.ResourcesPanel.show = function()
{
    WebInspector.inspectorView.setCurrentPanel(WebInspector.ResourcesPanel._instance());
}

/**
 * @return {!WebInspector.ResourcesPanel}
 */
WebInspector.ResourcesPanel._instance = function()
{
    if (!WebInspector.ResourcesPanel._instanceObject)
        WebInspector.ResourcesPanel._instanceObject = new WebInspector.ResourcesPanel();
    return WebInspector.ResourcesPanel._instanceObject;
}

/**
 * @constructor
 * @implements {WebInspector.PanelFactory}
 */
WebInspector.ResourcesPanelFactory = function()
{
}

WebInspector.ResourcesPanelFactory.prototype = {
    /**
     * @override
     * @return {!WebInspector.Panel}
     */
    createPanel: function()
    {
        return WebInspector.ResourcesPanel._instance();
    }
}
