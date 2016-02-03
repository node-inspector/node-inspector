/*
 * Copyright (C) 2007, 2008 Apple Inc.  All rights reserved.
 * Copyright (C) 2008 Matt Lilek <webkit@mattlilek.com>
 * Copyright (C) 2009 Joseph Pecoraro
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
 * @implements {WebInspector.Searchable}
 * @implements {WebInspector.TargetManager.Observer}
 * @extends {WebInspector.Panel}
 */
WebInspector.ElementsPanel = function()
{
    WebInspector.Panel.call(this, "elements");
    this.registerRequiredCSS("elements/elementsPanel.css");

    this._splitWidget = new WebInspector.SplitWidget(true, true, "elementsPanelSplitViewState", 325, 325);
    this._splitWidget.addEventListener(WebInspector.SplitWidget.Events.SidebarSizeChanged, this._updateTreeOutlineVisibleWidth.bind(this));
    this._splitWidget.show(this.element);

    this._searchableView = new WebInspector.SearchableView(this);
    this._searchableView.setMinimumSize(25, 28);
    this._searchableView.setPlaceholder(WebInspector.UIString("Find by string, selector, or XPath"));
    var stackElement = this._searchableView.element;

    this._contentElement = createElement("div");
    var crumbsContainer = createElement("div");
    this._showLayoutEditor = false;
    if (Runtime.experiments.isEnabled("materialDesign"))
        this._initializeActionsToolbar();
    stackElement.appendChild(this._contentElement);
    stackElement.appendChild(crumbsContainer);

    this._elementsPanelTreeOutilneSplit = new WebInspector.SplitWidget(false, true, "treeOutlineAnimationTimelineWidget", 300, 300);
    this._elementsPanelTreeOutilneSplit.hideSidebar();
    this._elementsPanelTreeOutilneSplit.setMainWidget(this._searchableView);
    this._splitWidget.setMainWidget(this._elementsPanelTreeOutilneSplit);

    this._contentElement.id = "elements-content";
    // FIXME: crbug.com/425984
    if (WebInspector.moduleSetting("domWordWrap").get())
        this._contentElement.classList.add("elements-wrap");
    WebInspector.moduleSetting("domWordWrap").addChangeListener(this._domWordWrapSettingChanged.bind(this));

    crumbsContainer.id = "elements-crumbs";
    this._breadcrumbs = new WebInspector.ElementsBreadcrumbs();
    this._breadcrumbs.show(crumbsContainer);
    this._breadcrumbs.addEventListener(WebInspector.ElementsBreadcrumbs.Events.NodeSelected, this._crumbNodeSelected, this);

    this.sidebarPanes = {};
    /** @type !Array<!WebInspector.ElementsSidebarViewWrapperPane> */
    this._elementsSidebarViewWrappers = [];
    var sharedSidebarModel = new WebInspector.SharedSidebarModel();
    this.sidebarPanes.platformFonts = WebInspector.PlatformFontsWidget.createSidebarWrapper(sharedSidebarModel);
    this.sidebarPanes.styles = new WebInspector.StylesSidebarPane();

    this.sidebarPanes.computedStyle = WebInspector.ComputedStyleWidget.createSidebarWrapper(this.sidebarPanes.styles, sharedSidebarModel);

    this.sidebarPanes.styles.addEventListener(WebInspector.StylesSidebarPane.Events.SelectorEditingStarted, this._onEditingSelectorStarted.bind(this));
    this.sidebarPanes.styles.addEventListener(WebInspector.StylesSidebarPane.Events.SelectorEditingEnded, this._onEditingSelectorEnded.bind(this));

    this.sidebarPanes.metrics = new WebInspector.MetricsSidebarPane();
    this.sidebarPanes.properties = WebInspector.PropertiesWidget.createSidebarWrapper();
    this.sidebarPanes.domBreakpoints = WebInspector.domBreakpointsSidebarPane.createProxy(this);
    this.sidebarPanes.eventListeners = WebInspector.EventListenersWidget.createSidebarWrapper();

    WebInspector.moduleSetting("sidebarPosition").addChangeListener(this._updateSidebarPosition.bind(this));
    this._updateSidebarPosition();
    this._loadSidebarViews();

    /** @type {!Array.<!WebInspector.ElementsTreeOutline>} */
    this._treeOutlines = [];
    /** @type {!Map.<!WebInspector.DOMModel, !WebInspector.ElementsTreeOutline>} */
    this._modelToTreeOutline = new Map();
    WebInspector.targetManager.observeTargets(this);
    WebInspector.moduleSetting("showUAShadowDOM").addChangeListener(this._showUAShadowDOMChanged.bind(this));
    WebInspector.targetManager.addModelListener(WebInspector.DOMModel, WebInspector.DOMModel.Events.DocumentUpdated, this._documentUpdatedEvent, this);
    WebInspector.extensionServer.addEventListener(WebInspector.ExtensionServer.Events.SidebarPaneAdded, this._extensionSidebarPaneAdded, this);
}

WebInspector.ElementsPanel._elementsSidebarViewTitleSymbol = Symbol("title");

WebInspector.ElementsPanel.prototype = {
    _initializeActionsToolbar: function()
    {
        this._nodeActionsElement = createElementWithClass("div", "node-actions-container");
        var button = this._nodeActionsElement.createChild("div", "node-actions-toggle");
        button.addEventListener("click", this._toggleActionsToolbar.bind(this, undefined));
        this._nodeActionsToolbar = new WebInspector.Toolbar();
        this._nodeActionsElement.appendChild(this._nodeActionsToolbar.element);
        this._nodeActionsToolbar.element.addEventListener("mousedown", consumeEvent);
        WebInspector.targetManager.addModelListener(WebInspector.DOMModel, WebInspector.DOMModel.Events.MarkersChanged, this._markersChanged, this);

        this._editAsHTMLButton = new WebInspector.ToolbarButton(WebInspector.UIString("Edit as HTML"), "edit-toolbar-item");
        this._editAsHTMLButton.setAction("elements.edit-as-html");
        this._nodeActionsToolbar.appendToolbarItem(this._editAsHTMLButton);
        this._nodeActionsToolbar.element.classList.add("node-actions-toolbar");
        this._hideElementButton = new WebInspector.ToolbarButton(WebInspector.UIString("Hide element"), "visibility-off-toolbar-item");
        this._hideElementButton.setAction("elements.hide-element");
        this._nodeActionsToolbar.appendToolbarItem(this._hideElementButton);
        this._forceElementStateButton = new WebInspector.ToolbarMenuButton(WebInspector.UIString("Force element state"), "pin-toolbar-item", this._showForceElementStateMenu.bind(this));
        this._nodeActionsToolbar.appendToolbarItem(this._forceElementStateButton);
        this._breakpointsButton = new WebInspector.ToolbarMenuButton(WebInspector.UIString("Toggle breakpoints"), "add-breakpoint-toolbar-item", this._showBreakpointsMenu.bind(this));
        this._nodeActionsToolbar.appendToolbarItem(this._breakpointsButton);
    },

    _toggleHideElement: function()
    {
        var node = this.selectedDOMNode();
        var treeOutline = this._treeOutlineForNode(node);
        if (!node || !treeOutline)
            return;
        treeOutline.toggleHideElement(node);
    },

    /**
     * @param {!WebInspector.DOMNode} node
     */
    _updateActionsToolbar: function(node)
    {
        if (!Runtime.experiments.isEnabled("materialDesign"))
            return;
        var classText = node.getAttribute("class");
        var treeOutline = this._treeOutlineForNode(node);
        this._hideElementButton.setToggled(treeOutline && treeOutline.isToggledToHidden(node));
        this._editAsHTMLButton.setToggled(false);
        this._breakpointsButton.setEnabled(!node.pseudoType());
        this._breakpointsButton.setToggled(WebInspector.domBreakpointsSidebarPane.hasBreakpoints(node));
        this._forceElementStateButton.setEnabled(node.nodeType() === Node.ELEMENT_NODE && !node.pseudoType());
        this._forceElementStateButton.setToggled(!!WebInspector.CSSStyleModel.fromNode(node).pseudoState(node).length);

        var treeElement = this._treeOutlineForNode(node).selectedTreeElement;
        if (!treeElement)
            return;
        if (node.nodeType() !== Node.ELEMENT_NODE) {
            this._nodeActionsElement.remove();
            return;
        }

        var actionsToolbar = this._nodeActionsElement;
        if (actionsToolbar.__node !== node) {
            treeElement.gutterElement().appendChild(actionsToolbar);
            this._positionActionsToolbar();
            actionsToolbar.__node = node;
            this._toggleActionsToolbar(false);
        }
    },

    _toggleEditAsHTML: function()
    {
        var node = this.selectedDOMNode();
        var treeOutline = this._treeOutlineForNode(node);
        if (!node || !treeOutline)
            return;

        var startEditing = true;
        if (Runtime.experiments.isEnabled("materialDesign")) {
            startEditing = !this._editAsHTMLButton.toggled();
            this._editAsHTMLButton.setToggled(startEditing);
        }
        treeOutline.toggleEditAsHTML(node, startEditing, this._updateActionsToolbar.bind(this, node));
    },

    /**
     * @param {!WebInspector.ContextMenu} contextMenu
     */
    _showBreakpointsMenu: function(contextMenu)
    {
        var node = this.selectedDOMNode();
        if (!node)
            return;
        WebInspector.domBreakpointsSidebarPane.populateNodeContextMenu(node, contextMenu, false);
    },

    /**
     * @param {!WebInspector.ContextMenu} contextMenu
     */
    _showForceElementStateMenu: function(contextMenu)
    {
        var node = this.selectedDOMNode();
        if (!node)
            return;
        WebInspector.ElementsTreeElement.populateForcedPseudoStateItems(contextMenu, node);
    },

    /**
     * @param {!WebInspector.Event} event
     */
    _decorationsClicked: function(event)
    {
        var node = /** @type {!WebInspector.DOMNode} */(event.data);
        this.selectDOMNode(node, true);
        this._toggleActionsToolbar(true);
    },

    /**
     * @param {boolean=} toggled
     */
    _toggleActionsToolbar: function(toggled)
    {
        if (toggled === undefined)
            toggled = !this._actionsToolbarShown();
        this._nodeActionsElement.classList.toggle("expanded", toggled);
        this._positionActionsToolbar();
    },

    _positionActionsToolbar: function()
    {
        if (!this._actionsToolbarShown())
            return;
        var toolbarElement = this._nodeActionsToolbar.element;
        if (toolbarElement.totalOffsetTop() < this.element.totalOffsetTop()) {
            toolbarElement.style.top = this._nodeActionsElement.parentElement.offsetHeight + "px";
            toolbarElement.classList.add("node-actions-toolbar-below");
        } else {
            toolbarElement.style.top = "";
            toolbarElement.classList.remove("node-actions-toolbar-below");
        }
    },

    /**
     * @return {boolean}
     */
    _actionsToolbarShown: function()
    {
        return this._nodeActionsElement.classList.contains("expanded");
    },

    /**
     * @param {!WebInspector.Event} event
     */
    _markersChanged: function(event)
    {
        var node = /** @type {!WebInspector.DOMNode} */ (event.data);
        if (node !== this.selectedDOMNode())
            return;
        this._updateActionsToolbar(node);
    },

    _loadSidebarViews: function()
    {
        var extensions = self.runtime.extensions("@WebInspector.Widget");

        for (var i = 0; i < extensions.length; ++i) {
            var descriptor = extensions[i].descriptor();
            if (descriptor["location"] !== "elements-panel")
                continue;

            var title = WebInspector.UIString(descriptor["title"]);
            extensions[i].instancePromise().then(addSidebarView.bind(this, title));
        }

        /**
         * @param {string} title
         * @param {!Object} object
         * @this {WebInspector.ElementsPanel}
         */
        function addSidebarView(title, object)
        {
            var widget = /** @type {!WebInspector.Widget} */ (object);
            var elementsSidebarViewWrapperPane = new WebInspector.ElementsSidebarViewWrapperPane(title, widget);
            this._elementsSidebarViewWrappers.push(elementsSidebarViewWrapperPane);

            if (this.sidebarPaneView)
                this.sidebarPaneView.addPane(elementsSidebarViewWrapperPane);
        }
    },

    _onEditingSelectorStarted: function()
    {
        for (var i = 0; i < this._treeOutlines.length; ++i)
            this._treeOutlines[i].setPickNodeMode(true);
    },

    _onEditingSelectorEnded: function()
    {
        for (var i = 0; i < this._treeOutlines.length; ++i)
            this._treeOutlines[i].setPickNodeMode(false);
    },

    /**
     * @override
     * @param {!WebInspector.Target} target
     */
    targetAdded: function(target)
    {
        var domModel = WebInspector.DOMModel.fromTarget(target);
        if (!domModel)
            return;
        var treeOutline = new WebInspector.ElementsTreeOutline(domModel, true, true);
        treeOutline.setWordWrap(WebInspector.moduleSetting("domWordWrap").get());
        treeOutline.wireToDOMModel();
        treeOutline.addEventListener(WebInspector.ElementsTreeOutline.Events.SelectedNodeChanged, this._selectedNodeChanged, this);
        treeOutline.addEventListener(WebInspector.ElementsTreeOutline.Events.NodePicked, this._onNodePicked, this);
        treeOutline.addEventListener(WebInspector.ElementsTreeOutline.Events.ElementsTreeUpdated, this._updateBreadcrumbIfNeeded, this);
        treeOutline.addEventListener(WebInspector.ElementsTreeOutline.Events.DecorationsClicked, this._decorationsClicked, this);
        this._treeOutlines.push(treeOutline);
        this._modelToTreeOutline.set(domModel, treeOutline);

        // Perform attach if necessary.
        if (this.isShowing())
            this.wasShown();

    },

    /**
     * @override
     * @param {!WebInspector.Target} target
     */
    targetRemoved: function(target)
    {
        var domModel = WebInspector.DOMModel.fromTarget(target);
        if (!domModel)
            return;
        var treeOutline = this._modelToTreeOutline.remove(domModel);
        treeOutline.unwireFromDOMModel();
        this._treeOutlines.remove(treeOutline);
        treeOutline.element.remove();
    },

    _updateTreeOutlineVisibleWidth: function()
    {
        if (!this._treeOutlines.length)
            return;

        var width = this._splitWidget.element.offsetWidth;
        if (this._splitWidget.isVertical())
            width -= this._splitWidget.sidebarSize();
        for (var i = 0; i < this._treeOutlines.length; ++i) {
            this._treeOutlines[i].setVisibleWidth(width);
            this._treeOutlines[i].updateSelection();
        }
        this._breadcrumbs.updateSizes();
    },

    /**
     * @override
     * @return {!Element}
     */
    defaultFocusedElement: function()
    {
        return this._treeOutlines.length ? this._treeOutlines[0].element : this.element;
    },

    /**
     * @override
     * @return {!WebInspector.SearchableView}
     */
    searchableView: function()
    {
        return this._searchableView;
    },

    wasShown: function()
    {
        for (var i = 0; i < this._treeOutlines.length; ++i) {
            var treeOutline = this._treeOutlines[i];
            // Attach heavy component lazily
            if (treeOutline.element.parentElement !== this._contentElement)
                this._contentElement.appendChild(treeOutline.element);
        }
        WebInspector.Panel.prototype.wasShown.call(this);
        this._breadcrumbs.update();

        for (var i = 0; i < this._treeOutlines.length; ++i) {
            var treeOutline = this._treeOutlines[i];
            treeOutline.updateSelection();
            treeOutline.setVisible(true);

            if (!treeOutline.rootDOMNode)
                if (treeOutline.domModel().existingDocument())
                    this._documentUpdated(treeOutline.domModel(), treeOutline.domModel().existingDocument());
                else
                    treeOutline.domModel().requestDocument();
        }

    },

    willHide: function()
    {
        WebInspector.DOMModel.hideDOMNodeHighlight();
        for (var i = 0; i < this._treeOutlines.length; ++i) {
            var treeOutline = this._treeOutlines[i];
            treeOutline.setVisible(false);
            // Detach heavy component on hide
            this._contentElement.removeChild(treeOutline.element);
        }
        if (this._popoverHelper)
            this._popoverHelper.hidePopover();
        WebInspector.Panel.prototype.willHide.call(this);
    },

    onResize: function()
    {
        if (WebInspector.moduleSetting("sidebarPosition").get() === "auto")
            this.element.window().requestAnimationFrame(this._updateSidebarPosition.bind(this));  // Do not force layout.
        this._updateTreeOutlineVisibleWidth();
    },

    /**
     * @param {!WebInspector.Event} event
     */
    _onNodePicked: function(event)
    {
        if (!this.sidebarPanes.styles.isEditingSelector())
            return;
        this.sidebarPanes.styles.updateEditingSelectorForNode(/** @type {!WebInspector.DOMNode} */(event.data));
    },

    /**
     * @param {!WebInspector.Event} event
     */
    _selectedNodeChanged: function(event)
    {
        var selectedNode = /** @type {?WebInspector.DOMNode} */ (event.data);
        for (var i = 0; i < this._treeOutlines.length; ++i) {
            if (!selectedNode || selectedNode.domModel() !== this._treeOutlines[i].domModel())
                this._treeOutlines[i].selectDOMNode(null);
        }

        if (!selectedNode && this._lastValidSelectedNode)
            this._selectedPathOnReset = this._lastValidSelectedNode.path();

        this._breadcrumbs.setSelectedNode(selectedNode);

        WebInspector.context.setFlavor(WebInspector.DOMNode, selectedNode);

        if (selectedNode) {
            selectedNode.setAsInspectedNode();
            this._lastValidSelectedNode = selectedNode;
            this._updateActionsToolbar(selectedNode);
        }
        WebInspector.notifications.dispatchEventToListeners(WebInspector.NotificationService.Events.SelectedNodeChanged);
        this._selectedNodeChangedForTest();
    },

    _selectedNodeChangedForTest: function() { },

    _reset: function()
    {
        delete this.currentQuery;
    },

    /**
     * @param {!WebInspector.Event} event
     */
    _documentUpdatedEvent: function(event)
    {
        this._documentUpdated(/** @type {!WebInspector.DOMModel} */ (event.target), /** @type {?WebInspector.DOMDocument} */ (event.data));
    },

    /**
     * @param {!WebInspector.DOMModel} domModel
     * @param {?WebInspector.DOMDocument} inspectedRootDocument
     */
    _documentUpdated: function(domModel, inspectedRootDocument)
    {
        this._reset();
        this.searchCanceled();

        var treeOutline = this._modelToTreeOutline.get(domModel);
        treeOutline.rootDOMNode = inspectedRootDocument;

        if (!inspectedRootDocument) {
            if (this.isShowing())
                domModel.requestDocument();
            return;
        }

        WebInspector.domBreakpointsSidebarPane.restoreBreakpoints(domModel);

        /**
         * @this {WebInspector.ElementsPanel}
         * @param {?WebInspector.DOMNode} candidateFocusNode
         */
        function selectNode(candidateFocusNode)
        {
            if (!candidateFocusNode)
                candidateFocusNode = inspectedRootDocument.body || inspectedRootDocument.documentElement;

            if (!candidateFocusNode)
                return;

            if (!this._pendingNodeReveal) {
                this.selectDOMNode(candidateFocusNode);
                if (treeOutline.selectedTreeElement)
                    treeOutline.selectedTreeElement.expand();
            }
        }

        /**
         * @param {?DOMAgent.NodeId} nodeId
         * @this {WebInspector.ElementsPanel}
         */
        function selectLastSelectedNode(nodeId)
        {
            if (this.selectedDOMNode()) {
                // Focused node has been explicitly set while reaching out for the last selected node.
                return;
            }
            var node = nodeId ? domModel.nodeForId(nodeId) : null;
            selectNode.call(this, node);
        }

        if (this._omitDefaultSelection)
            return;

        if (this._selectedPathOnReset)
            domModel.pushNodeByPathToFrontend(this._selectedPathOnReset, selectLastSelectedNode.bind(this));
        else
            selectNode.call(this, null);
        delete this._selectedPathOnReset;
    },

    /**
     * @override
     */
    searchCanceled: function()
    {
        delete this._searchQuery;
        this._hideSearchHighlights();

        this._searchableView.updateSearchMatchesCount(0);

        delete this._currentSearchResultIndex;
        delete this._searchResults;

        WebInspector.DOMModel.cancelSearch();
    },

    /**
     * @override
     * @param {!WebInspector.SearchableView.SearchConfig} searchConfig
     * @param {boolean} shouldJump
     * @param {boolean=} jumpBackwards
     */
    performSearch: function(searchConfig, shouldJump, jumpBackwards)
    {
        var query = searchConfig.query;
        // Call searchCanceled since it will reset everything we need before doing a new search.
        this.searchCanceled();

        const whitespaceTrimmedQuery = query.trim();
        if (!whitespaceTrimmedQuery.length)
            return;

        this._searchQuery = query;

        var promises = [];
        var domModels = WebInspector.DOMModel.instances();
        for (var domModel of domModels)
            promises.push(domModel.performSearchPromise(whitespaceTrimmedQuery, WebInspector.moduleSetting("showUAShadowDOM").get()));
        Promise.all(promises).then(resultCountCallback.bind(this));

        /**
         * @param {!Array.<number>} resultCounts
         * @this {WebInspector.ElementsPanel}
         */
        function resultCountCallback(resultCounts)
        {
            /**
             * @type {!Array.<{domModel: !WebInspector.DOMModel, index: number, node: (?WebInspector.DOMNode|undefined)}>}
             */
            this._searchResults = [];
            for (var i = 0; i < resultCounts.length; ++i) {
                var resultCount = resultCounts[i];
                for (var j = 0; j < resultCount; ++j)
                    this._searchResults.push({domModel: domModels[i], index: j, node: undefined});
            }
            this._searchableView.updateSearchMatchesCount(this._searchResults.length);
            if (!this._searchResults.length)
                return;
            this._currentSearchResultIndex = -1;

            if (shouldJump)
                this._jumpToSearchResult(jumpBackwards ? -1 : 0);
        }
    },

    _domWordWrapSettingChanged: function(event)
    {
        // FIXME: crbug.com/425984
        this._contentElement.classList.toggle("elements-wrap", event.data);
        for (var i = 0; i < this._treeOutlines.length; ++i)
            this._treeOutlines[i].setWordWrap(/** @type {boolean} */ (event.data));

        var selectedNode = this.selectedDOMNode();
        if (!selectedNode)
            return;

        var treeElement = this._treeElementForNode(selectedNode);
        if (treeElement)
            treeElement.updateSelection(); // Recalculate selection highlight dimensions.
    },

    switchToAndFocus: function(node)
    {
        // Reset search restore.
        this._searchableView.cancelSearch();
        WebInspector.inspectorView.setCurrentPanel(this);
        this.selectDOMNode(node, true);
    },

    /**
     * @param {!Element} element
     * @param {!Event} event
     * @return {!Element|!AnchorBox|undefined}
     */
    _getPopoverAnchor: function(element, event)
    {
        var anchor = element.enclosingNodeOrSelfWithClass("webkit-html-resource-link");
        if (!anchor || !anchor.href)
            return;

        return anchor;
    },

    /**
     * @param {!Element} anchor
     * @param {!WebInspector.Popover} popover
     */
    _showPopover: function(anchor, popover)
    {
        var node = this.selectedDOMNode();
        if (node)
            WebInspector.DOMPresentationUtils.buildImagePreviewContents(node.target(), anchor.href, true, showPopover);

        /**
         * @param {!Element=} contents
         */
        function showPopover(contents)
        {
            if (!contents)
                return;
            popover.setCanShrink(false);
            popover.showForAnchor(contents, anchor);
        }
    },

    _jumpToSearchResult: function(index)
    {
        this._hideSearchHighlights();
        this._currentSearchResultIndex = (index + this._searchResults.length) % this._searchResults.length;
        this._highlightCurrentSearchResult();
    },

    /**
     * @override
     */
    jumpToNextSearchResult: function()
    {
        if (!this._searchResults)
            return;
        this._jumpToSearchResult(this._currentSearchResultIndex + 1);
    },

    /**
     * @override
     */
    jumpToPreviousSearchResult: function()
    {
        if (!this._searchResults)
            return;
        this._jumpToSearchResult(this._currentSearchResultIndex - 1);
    },

    /**
     * @override
     * @return {boolean}
     */
    supportsCaseSensitiveSearch: function()
    {
        return false;
    },

    /**
     * @override
     * @return {boolean}
     */
    supportsRegexSearch: function()
    {
        return false;
    },

    _highlightCurrentSearchResult: function()
    {
        var index = this._currentSearchResultIndex;
        var searchResults = this._searchResults;
        var searchResult = searchResults[index];

        if (searchResult.node === null) {
            this._searchableView.updateCurrentMatchIndex(index);
            return;
        }

        /**
         * @param {?WebInspector.DOMNode} node
         * @this {WebInspector.ElementsPanel}
         */
        function searchCallback(node)
        {
            searchResult.node = node;
            this._highlightCurrentSearchResult();
        }

        if (typeof searchResult.node === "undefined") {
            // No data for slot, request it.
            searchResult.domModel.searchResult(searchResult.index, searchCallback.bind(this));
            return;
        }

        this._searchableView.updateCurrentMatchIndex(index);

        var treeElement = this._treeElementForNode(searchResult.node);
        if (treeElement) {
            treeElement.highlightSearchResults(this._searchQuery);
            treeElement.reveal();
            var matches = treeElement.listItemElement.getElementsByClassName(WebInspector.highlightedSearchResultClassName);
            if (matches.length)
                matches[0].scrollIntoViewIfNeeded();
        }
    },

    _hideSearchHighlights: function()
    {
        if (!this._searchResults || !this._searchResults.length || this._currentSearchResultIndex < 0)
            return;
        var searchResult = this._searchResults[this._currentSearchResultIndex];
        if (!searchResult.node)
            return;
        var treeOutline = this._modelToTreeOutline.get(searchResult.node.domModel());
        var treeElement = treeOutline.findTreeElement(searchResult.node);
        if (treeElement)
            treeElement.hideSearchHighlights();
    },

    /**
     * @return {?WebInspector.DOMNode}
     */
    selectedDOMNode: function()
    {
        for (var i = 0; i < this._treeOutlines.length; ++i) {
            var treeOutline = this._treeOutlines[i];
            if (treeOutline.selectedDOMNode())
                return treeOutline.selectedDOMNode();
        }
        return null;
    },

    /**
     * @param {!WebInspector.DOMNode} node
     * @param {boolean=} focus
     */
    selectDOMNode: function(node, focus)
    {
        for (var i = 0; i < this._treeOutlines.length; ++i) {
            var treeOutline = this._treeOutlines[i];
            if (treeOutline.domModel() === node.domModel())
                treeOutline.selectDOMNode(node, focus);
            else
                treeOutline.selectDOMNode(null);
        }
    },

    /**
     * @param {!WebInspector.Event} event
     */
    _updateBreadcrumbIfNeeded: function(event)
    {
        var nodes = /** @type {!Array.<!WebInspector.DOMNode>} */ (event.data);
        this._breadcrumbs.updateNodes(nodes);
    },

    /**
     * @param {!WebInspector.Event} event
     */
    _crumbNodeSelected: function(event)
    {
        var node = /** @type {!WebInspector.DOMNode} */ (event.data);
        this.selectDOMNode(node, true);
    },

    /**
     * @override
     * @param {!KeyboardEvent} event
     */
    handleShortcut: function(event)
    {
        /**
         * @param {!WebInspector.ElementsTreeOutline} treeOutline
         */
        function handleUndoRedo(treeOutline)
        {
            if (WebInspector.KeyboardShortcut.eventHasCtrlOrMeta(event) && !event.shiftKey && event.keyIdentifier === "U+005A") { // Z key
                treeOutline.domModel().undo();
                event.handled = true;
                return;
            }

            var isRedoKey = WebInspector.isMac() ? event.metaKey && event.shiftKey && event.keyIdentifier === "U+005A" : // Z key
                                                   event.ctrlKey && event.keyIdentifier === "U+0059"; // Y key
            if (isRedoKey) {
                treeOutline.domModel().redo();
                event.handled = true;
            }
        }

        if (WebInspector.isEditing() && event.keyCode !== WebInspector.KeyboardShortcut.Keys.F2.code)
            return;

        var treeOutline = null;
        for (var i = 0; i < this._treeOutlines.length; ++i) {
            if (this._treeOutlines[i].selectedDOMNode() === this._lastValidSelectedNode)
                treeOutline = this._treeOutlines[i];
        }
        if (!treeOutline)
            return;

        if (!treeOutline.editing()) {
            handleUndoRedo.call(null, treeOutline);
            if (event.handled) {
                this.sidebarPanes.styles.onUndoOrRedoHappened();
                return;
            }
        }

        treeOutline.handleShortcut(event);
        if (event.handled)
            return;

        WebInspector.Panel.prototype.handleShortcut.call(this, event);
    },

    /**
     * @param {?WebInspector.DOMNode} node
     * @return {?WebInspector.ElementsTreeOutline}
     */
    _treeOutlineForNode: function(node)
    {
        if (!node)
            return null;
        return this._modelToTreeOutline.get(node.domModel()) || null;
    },

    /**
     * @return {?WebInspector.ElementsTreeOutline}
     */
    _focusedTreeOutline: function()
    {
        for (var i = 0; i < this._treeOutlines.length; ++i) {
            if (this._treeOutlines[i].hasFocus())
                return this._treeOutlines[i];
        }
        return null;
    },

    /**
     * @param {!WebInspector.DOMNode} node
     * @return {?WebInspector.ElementsTreeElement}
     */
    _treeElementForNode: function(node)
    {
        var treeOutline = this._treeOutlineForNode(node);
        return /** @type {?WebInspector.ElementsTreeElement} */ (treeOutline.findTreeElement(node));
    },

    /**
     * @param {!Event} event
     */
    handleCopyEvent: function(event)
    {
        var treeOutline = this._focusedTreeOutline();
        if (treeOutline)
            treeOutline.handleCopyOrCutKeyboardEvent(false, event);
    },

    /**
     * @param {!Event} event
     */
    handleCutEvent: function(event)
    {
        var treeOutline = this._focusedTreeOutline();
        if (treeOutline)
            treeOutline.handleCopyOrCutKeyboardEvent(true, event);
    },

    /**
     * @param {!Event} event
     */
    handlePasteEvent: function(event)
    {
        var treeOutline = this._focusedTreeOutline();
        if (treeOutline)
            treeOutline.handlePasteKeyboardEvent(event);
    },

    /**
     * @param {!WebInspector.DOMNode} node
     * @return {!WebInspector.DOMNode}
     */
    _leaveUserAgentShadowDOM: function(node)
    {
        var userAgentShadowRoot = node.ancestorUserAgentShadowRoot();
        return userAgentShadowRoot ? /** @type {!WebInspector.DOMNode} */ (userAgentShadowRoot.parentNode) : node;
    },

    /**
     * @param {!WebInspector.DOMNode} node
     */
    revealAndSelectNode: function(node)
    {
        if (WebInspector.inspectElementModeController && WebInspector.inspectElementModeController.started())
            WebInspector.inspectElementModeController.stop();

        this._omitDefaultSelection = true;

        WebInspector.inspectorView.setCurrentPanel(this, this._showLayoutEditor);
        node = WebInspector.moduleSetting("showUAShadowDOM").get() ? node : this._leaveUserAgentShadowDOM(node);
        if (!this._showLayoutEditor)
            node.highlightForTwoSeconds();

        this.selectDOMNode(node, true);
        delete this._omitDefaultSelection;

        if (!this._notFirstInspectElement)
            InspectorFrontendHost.inspectElementCompleted();
        this._notFirstInspectElement = true;
    },

    /**
     * @param {!Event} event
     * @param {!WebInspector.ContextMenu} contextMenu
     * @param {!Object} object
     */
    appendApplicableItems: function(event, contextMenu, object)
    {
        if (!(object instanceof WebInspector.RemoteObject && (/** @type {!WebInspector.RemoteObject} */ (object)).isNode())
            && !(object instanceof WebInspector.DOMNode)
            && !(object instanceof WebInspector.DeferredDOMNode)) {
            return;
        }

        // Add debbuging-related actions
        if (object instanceof WebInspector.DOMNode) {
            contextMenu.appendSeparator();
            WebInspector.domBreakpointsSidebarPane.populateNodeContextMenu(object, contextMenu, true);
        }

        // Skip adding "Reveal..." menu item for our own tree outline.
        if (this.element.isAncestor(/** @type {!Node} */ (event.target)))
            return;
        var commandCallback = WebInspector.Revealer.reveal.bind(WebInspector.Revealer, object);

        contextMenu.appendItem(WebInspector.UIString.capitalize("Reveal in Elements ^panel"), commandCallback);
    },

    _sidebarContextMenuEventFired: function(event)
    {
        var contextMenu = new WebInspector.ContextMenu(event);
        contextMenu.appendApplicableItems(/** @type {!Object} */ (event.deepElementFromPoint()));
        contextMenu.show();
    },

    _showUAShadowDOMChanged: function()
    {
        for (var i = 0; i < this._treeOutlines.length; ++i)
            this._treeOutlines[i].update();
    },

    _updateSidebarPosition: function()
    {
        var vertically;
        var position = WebInspector.moduleSetting("sidebarPosition").get();
        if (position === "right")
            vertically = false;
        else if (position === "bottom")
            vertically = true;
        else
            vertically = WebInspector.inspectorView.element.offsetWidth < 680;

        if (this.sidebarPaneView && vertically === !this._splitWidget.isVertical())
            return;

        if (this.sidebarPaneView && this.sidebarPaneView.shouldHideOnDetach())
            return; // We can't reparent extension iframes.

        var selectedTabId = this.sidebarPaneView ? this.sidebarPaneView.selectedTabId : null;

        var extensionSidebarPanes = WebInspector.extensionServer.sidebarPanes();
        if (this.sidebarPaneView) {
            this.sidebarPaneView.detach();
            this._splitWidget.uninstallResizer(this.sidebarPaneView.headerElement());
        }

        this._splitWidget.setVertical(!vertically);

        var computedPane = new WebInspector.SidebarPane(WebInspector.UIString("Computed"));
        computedPane.element.classList.add("composite");
        computedPane.element.classList.add("fill");

        computedPane.element.classList.add("metrics-and-computed");

        var matchedStylePanesWrapper = new WebInspector.VBox();
        matchedStylePanesWrapper.element.classList.add("style-panes-wrapper");
        var computedStylePanesWrapper = new WebInspector.VBox();
        computedStylePanesWrapper.element.classList.add("style-panes-wrapper");

        /**
         * @param {boolean} inComputedStyle
         * @this {WebInspector.ElementsPanel}
         */
        function showMetrics(inComputedStyle)
        {
            if (inComputedStyle)
                this.sidebarPanes.metrics.show(computedStylePanesWrapper.element, this.sidebarPanes.computedStyle.element);
            else
                this.sidebarPanes.metrics.show(matchedStylePanesWrapper.element);
        }

        /**
         * @param {!WebInspector.Event} event
         * @this {WebInspector.ElementsPanel}
         */
        function tabSelected(event)
        {
            var tabId = /** @type {string} */ (event.data.tabId);
            if (tabId === computedPane.title())
                showMetrics.call(this, true);
            else if (tabId === stylesPane.title())
                showMetrics.call(this, false);
        }

        this.sidebarPaneView = new WebInspector.SidebarTabbedPane();
        this.sidebarPaneView.element.addEventListener("contextmenu", this._sidebarContextMenuEventFired.bind(this), false);
        if (this._popoverHelper)
            this._popoverHelper.hidePopover();
        this._popoverHelper = new WebInspector.PopoverHelper(this.sidebarPaneView.element, this._getPopoverAnchor.bind(this), this._showPopover.bind(this));
        this._popoverHelper.setTimeout(0);

        if (vertically) {
            this._splitWidget.installResizer(this.sidebarPaneView.headerElement());

            var compositePane = new WebInspector.SidebarPane(this.sidebarPanes.styles.title());
            compositePane.element.classList.add("composite");
            compositePane.element.classList.add("fill");

            var splitWidget = new WebInspector.SplitWidget(true, true, "stylesPaneSplitViewState", 215);
            splitWidget.show(compositePane.element);

            splitWidget.setMainWidget(matchedStylePanesWrapper);
            splitWidget.setSidebarWidget(computedStylePanesWrapper);

            computedPane.show(computedStylePanesWrapper.element);
            this.sidebarPaneView.addPane(compositePane);
        } else {
            var stylesPane = new WebInspector.SidebarPane(this.sidebarPanes.styles.title());
            stylesPane.element.classList.add("composite", "fill", "metrics-and-styles");

            matchedStylePanesWrapper.show(stylesPane.element);
            computedStylePanesWrapper.show(computedPane.element);

            this.sidebarPaneView.addEventListener(WebInspector.TabbedPane.EventTypes.TabSelected, tabSelected, this);

            this.sidebarPaneView.addPane(stylesPane);
            this.sidebarPaneView.addPane(computedPane);
        }

        this.sidebarPanes.styles.show(matchedStylePanesWrapper.element);
        this.sidebarPanes.computedStyle.show(computedStylePanesWrapper.element);
        showMetrics.call(this, vertically);
        this.sidebarPanes.platformFonts.show(computedStylePanesWrapper.element);

        this.sidebarPaneView.addPane(this.sidebarPanes.eventListeners);
        this.sidebarPaneView.addPane(this.sidebarPanes.domBreakpoints);
        this.sidebarPaneView.addPane(this.sidebarPanes.properties);

        for (var sidebarViewWrapper of this._elementsSidebarViewWrappers)
            this.sidebarPaneView.addPane(sidebarViewWrapper);

        this._extensionSidebarPanesContainer = this.sidebarPaneView;

        for (var i = 0; i < extensionSidebarPanes.length; ++i)
            this._addExtensionSidebarPane(extensionSidebarPanes[i]);

        this._splitWidget.setSidebarWidget(this.sidebarPaneView);
        this.sidebarPanes.styles.expand();

        if (selectedTabId)
            this.sidebarPaneView.selectTab(selectedTabId);
    },

    /**
     * @param {!WebInspector.Event} event
     */
    _extensionSidebarPaneAdded: function(event)
    {
        var pane = /** @type {!WebInspector.ExtensionSidebarPane} */ (event.data);
        this._addExtensionSidebarPane(pane);
    },

    /**
     * @param {!WebInspector.ExtensionSidebarPane} pane
     */
    _addExtensionSidebarPane: function(pane)
    {
        if (pane.panelName() === this.name)
            this._extensionSidebarPanesContainer.addPane(pane);
    },

    /**
     * @param {?WebInspector.Widget} widget
     */
    setWidgetBelowDOM: function(widget)
    {
        if (widget) {
            this._elementsPanelTreeOutilneSplit.setSidebarWidget(widget);
            this._elementsPanelTreeOutilneSplit.showBoth(true);
        } else {
            this._elementsPanelTreeOutilneSplit.hideSidebar(true);
        }
    },

    __proto__: WebInspector.Panel.prototype
}

/**
 * @constructor
 * @implements {WebInspector.ContextMenu.Provider}
 */
WebInspector.ElementsPanel.ContextMenuProvider = function()
{
}

WebInspector.ElementsPanel.ContextMenuProvider.prototype = {
    /**
     * @override
     * @param {!Event} event
     * @param {!WebInspector.ContextMenu} contextMenu
     * @param {!Object} target
     */
    appendApplicableItems: function(event, contextMenu, target)
    {
        WebInspector.ElementsPanel.instance().appendApplicableItems(event, contextMenu, target);
    }
}

/**
 * @constructor
 * @implements {WebInspector.Revealer}
 */
WebInspector.ElementsPanel.DOMNodeRevealer = function()
{
}

WebInspector.ElementsPanel.DOMNodeRevealer.prototype = {
    /**
     * @override
     * @param {!Object} node
     * @return {!Promise}
     */
    reveal: function(node)
    {
        var panel = WebInspector.ElementsPanel.instance();
        panel._pendingNodeReveal = true;

        return new Promise(revealPromise);

        /**
         * @param {function(undefined)} resolve
         * @param {function(!Error)} reject
         */
        function revealPromise(resolve, reject)
        {
            if (node instanceof WebInspector.DOMNode) {
                onNodeResolved(/** @type {!WebInspector.DOMNode} */ (node));
            } else if (node instanceof WebInspector.DeferredDOMNode) {
                (/** @type {!WebInspector.DeferredDOMNode} */ (node)).resolve(onNodeResolved);
            } else if (node instanceof WebInspector.RemoteObject) {
                var domModel = WebInspector.DOMModel.fromTarget(/** @type {!WebInspector.RemoteObject} */ (node).target());
                if (domModel)
                    domModel.pushObjectAsNodeToFrontend(node, onNodeResolved);
                else
                    reject(new Error("Could not resolve a node to reveal."));
            } else {
                reject(new Error("Can't reveal a non-node."));
                panel._pendingNodeReveal = false;
            }

            /**
             * @param {?WebInspector.DOMNode} resolvedNode
             */
            function onNodeResolved(resolvedNode)
            {
                panel._pendingNodeReveal = false;

                if (resolvedNode) {
                    panel.revealAndSelectNode(resolvedNode);
                    resolve(undefined);
                    return;
                }
                reject(new Error("Could not resolve node to reveal."));
            }
        }
    }
}

WebInspector.ElementsPanel.show = function()
{
    WebInspector.inspectorView.setCurrentPanel(WebInspector.ElementsPanel.instance());
}

/**
 * @return {!WebInspector.ElementsPanel}
 */
WebInspector.ElementsPanel.instance = function()
{
    if (!WebInspector.ElementsPanel._instanceObject)
        WebInspector.ElementsPanel._instanceObject = new WebInspector.ElementsPanel();
    return WebInspector.ElementsPanel._instanceObject;
}

/**
 * @constructor
 * @implements {WebInspector.PanelFactory}
 */
WebInspector.ElementsPanelFactory = function()
{
}

WebInspector.ElementsPanelFactory.prototype = {
    /**
     * @override
     * @return {!WebInspector.Panel}
     */
    createPanel: function()
    {
        return WebInspector.ElementsPanel.instance();
    }
}

/**
 * @constructor
 * @implements {WebInspector.ActionDelegate}
 */
WebInspector.ElementsActionDelegate = function() { }

WebInspector.ElementsActionDelegate.prototype = {
    /**
     * @override
     * @param {!WebInspector.Context} context
     * @param {string} actionId
     */
    handleAction: function(context, actionId)
    {
        var elementsPanel = WebInspector.ElementsPanel.instance();
        if (actionId === "elements.hide-element")
            elementsPanel._toggleHideElement();
        else if (actionId === "elements.edit-as-html")
            elementsPanel._toggleEditAsHTML();
    }
}

/**
 * @constructor
 * @implements {WebInspector.DOMPresentationUtils.MarkerDecorator}
 */
WebInspector.ElementsPanel.PseudoStateMarkerDecorator = function()
{
}

WebInspector.ElementsPanel.PseudoStateMarkerDecorator.prototype = {
    /**
     * @override
     * @param {!WebInspector.DOMNode} node
     * @return {?{title: string, color: string}}
     */
    decorate: function(node)
    {
        return { color: "orange", title: WebInspector.UIString("Element state: %s", ":" + WebInspector.CSSStyleModel.fromNode(node).pseudoState(node).join(", :")) };
    }
}

/**
 * @constructor
 * @implements {WebInspector.DOMPresentationUtils.MarkerDecorator}
 */
WebInspector.ElementsPanel.HiddenMarkerDecorator = function()
{
}

WebInspector.ElementsPanel.HiddenMarkerDecorator.prototype = {
    /**
     * @override
     * @param {!WebInspector.DOMNode} node
     * @return {?{title: string, color: string}}
     */
    decorate: function(node)
    {
        return { color: "#555", title: WebInspector.UIString("Element is hidden") };
    }
}
