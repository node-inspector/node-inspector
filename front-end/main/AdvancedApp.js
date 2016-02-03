// Copyright 2014 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

/**
 * @constructor
 * @implements {WebInspector.App}
 */
WebInspector.AdvancedApp = function()
{
    WebInspector.dockController.addEventListener(WebInspector.DockController.Events.BeforeDockSideChanged, this._openToolboxWindow, this);
};

WebInspector.AdvancedApp.prototype = {
    /**
     * @param {!Document} document
     * @override
     */
    presentUI: function(document)
    {
        var rootView = new WebInspector.RootView();

        this._rootSplitWidget = new WebInspector.SplitWidget(false, true, "InspectorView.splitViewState", 555, 300, true);
        this._rootSplitWidget.show(rootView.element);

        this._rootSplitWidget.setSidebarWidget(WebInspector.inspectorView);

        this._inspectedPagePlaceholder = new WebInspector.InspectedPagePlaceholder();
        this._inspectedPagePlaceholder.addEventListener(WebInspector.InspectedPagePlaceholder.Events.Update, this._onSetInspectedPageBounds.bind(this, false), this);
        this._responsiveDesignView = new WebInspector.ResponsiveDesignView(this._inspectedPagePlaceholder);
        this._rootSplitWidget.setMainWidget(this._responsiveDesignView);

        WebInspector.dockController.addEventListener(WebInspector.DockController.Events.BeforeDockSideChanged, this._onBeforeDockSideChange, this);
        WebInspector.dockController.addEventListener(WebInspector.DockController.Events.DockSideChanged, this._onDockSideChange, this);
        WebInspector.dockController.addEventListener(WebInspector.DockController.Events.AfterDockSideChanged, this._onAfterDockSideChange, this);
        this._onDockSideChange();

        WebInspector.inspectorView.showInitialPanel();
        console.timeStamp("AdvancedApp.attachToBody");
        rootView.attachToDocument(document);
        this._inspectedPagePlaceholder.update();
    },

    /**
     * @param {!WebInspector.Event} event
     */
    _openToolboxWindow: function(event)
    {
        if (/** @type {string} */ (event.data.to) !== WebInspector.DockController.State.Undocked)
            return;

        if (this._toolboxWindow)
            return;

        var url = window.location.href.replace("inspector.html", "toolbox.html");
        this._toolboxWindow = window.open(url, undefined);
    },

    /**
     * @param {!Document} toolboxDocument
     */
    toolboxLoaded: function(toolboxDocument)
    {
        WebInspector.initializeUIUtils(toolboxDocument.defaultView);
        WebInspector.installComponentRootStyles(/** @type {!Element} */ (toolboxDocument.body));
        WebInspector.ContextMenu.installHandler(toolboxDocument);
        WebInspector.Tooltip.installHandler(toolboxDocument);

        var rootView = new WebInspector.RootView();
        var inspectedPagePlaceholder = new WebInspector.InspectedPagePlaceholder();
        inspectedPagePlaceholder.addEventListener(WebInspector.InspectedPagePlaceholder.Events.Update, this._onSetInspectedPageBounds.bind(this, true));
        this._toolboxResponsiveDesignView = new WebInspector.ResponsiveDesignView(inspectedPagePlaceholder);
        this._toolboxResponsiveDesignView.show(rootView.element);
        rootView.attachToDocument(toolboxDocument);

        this._updatePageResizer();
    },

    /**
     * @return {!InspectorFrontendHostAPI}
     */
    inspectorFrontendHost: function()
    {
        return window.InspectorFrontendHost;
    },

    _updatePageResizer: function()
    {
        if (this._isDocked())
            this._responsiveDesignView.updatePageResizer();
        else if (this._toolboxResponsiveDesignView)
            this._toolboxResponsiveDesignView.updatePageResizer();
    },

    /**
     * @param {!WebInspector.Event} event
     */
    _onBeforeDockSideChange: function(event)
    {
        if (/** @type {string} */ (event.data.to) === WebInspector.DockController.State.Undocked && this._toolboxResponsiveDesignView) {
            // Hide inspectorView and force layout to mimic the undocked state.
            this._rootSplitWidget.hideSidebar();
            this._inspectedPagePlaceholder.update();
        }

        this._changingDockSide = true;
    },

    /**
     * @param {!WebInspector.Event=} event
     */
    _onDockSideChange: function(event)
    {
        this._updatePageResizer();

        var toDockSide = event ? /** @type {string} */ (event.data.to) : WebInspector.dockController.dockSide();
        if (toDockSide === WebInspector.DockController.State.Undocked) {
            this._updateForUndocked();
        } else if (this._toolboxResponsiveDesignView && event && /** @type {string} */ (event.data.from) === WebInspector.DockController.State.Undocked) {
            // Don't update yet for smooth transition.
            this._rootSplitWidget.hideSidebar();
        } else {
            this._updateForDocked(toDockSide);
        }
    },

    /**
     * @param {!WebInspector.Event} event
     */
    _onAfterDockSideChange: function(event)
    {
        // We may get here on the first dock side change while loading without BeforeDockSideChange.
        if (!this._changingDockSide)
            return;
        this._changingDockSide = false;
        if (/** @type {string} */ (event.data.from) === WebInspector.DockController.State.Undocked) {
            // Restore docked layout in case of smooth transition.
            this._updateForDocked(/** @type {string} */ (event.data.to));
        }
        this._inspectedPagePlaceholder.update();
    },

    /**
     * @param {string} dockSide
     */
    _updateForDocked: function(dockSide)
    {
        this._rootSplitWidget.setVertical(dockSide === WebInspector.DockController.State.DockedToRight);
        this._rootSplitWidget.setSecondIsSidebar(dockSide === WebInspector.DockController.State.DockedToRight || dockSide === WebInspector.DockController.State.DockedToBottom);
        this._rootSplitWidget.toggleResizer(this._rootSplitWidget.resizerElement(), true);
        this._rootSplitWidget.toggleResizer(WebInspector.inspectorView.topResizerElement(), dockSide === WebInspector.DockController.State.DockedToBottom);
        this._rootSplitWidget.showBoth();
    },

    _updateForUndocked: function()
    {
        this._rootSplitWidget.toggleResizer(this._rootSplitWidget.resizerElement(), false);
        this._rootSplitWidget.toggleResizer(WebInspector.inspectorView.topResizerElement(), false);
        this._rootSplitWidget.hideMain();
    },

    _isDocked: function()
    {
        return WebInspector.dockController.dockSide() !== WebInspector.DockController.State.Undocked;
    },

    /**
     * @param {boolean} toolbox
     * @param {!WebInspector.Event} event
     */
    _onSetInspectedPageBounds: function(toolbox, event)
    {
        if (this._changingDockSide || (this._isDocked() === toolbox))
            return;
        if (!window.innerWidth || !window.innerHeight)
            return;
        var bounds = /** @type {{x: number, y: number, width: number, height: number}} */ (event.data);
        console.timeStamp("AdvancedApp.setInspectedPageBounds");
        InspectorFrontendHost.setInspectedPageBounds(bounds);
    }
};

/** @type {!WebInspector.AdvancedApp} */
WebInspector.AdvancedApp._appInstance;

/**
 * @return {!WebInspector.AdvancedApp}
 */
WebInspector.AdvancedApp._instance = function()
{
    if (!WebInspector.AdvancedApp._appInstance)
        WebInspector.AdvancedApp._appInstance = new WebInspector.AdvancedApp();
    return WebInspector.AdvancedApp._appInstance;
};

/**
 * @constructor
 * @implements {WebInspector.AppProvider}
 */
WebInspector.AdvancedAppProvider = function()
{
};

WebInspector.AdvancedAppProvider.prototype = {
    /**
     * @override
     * @return {!WebInspector.App}
     */
    createApp: function()
    {
        return WebInspector.AdvancedApp._instance();
    }
};
