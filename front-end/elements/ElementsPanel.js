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

    this._splitView = new WebInspector.SplitView(true, true, "elementsPanelSplitViewState", 325, 325);
    this._splitView.addEventListener(WebInspector.SplitView.Events.SidebarSizeChanged, this._updateTreeOutlineVisibleWidth.bind(this));
    this._splitView.show(this.element);

    this._searchableView = new WebInspector.SearchableView(this);
    this._searchableView.setMinimumSize(25, 19);
    this._splitView.setMainView(this._searchableView);
    var stackElement = this._searchableView.element;

    this._contentElement = stackElement.createChild("div");
    this._contentElement.id = "elements-content";
    // FIXME: crbug.com/425984
    if (WebInspector.settings.domWordWrap.get())
        this._contentElement.classList.add("elements-wrap");
    WebInspector.settings.domWordWrap.addChangeListener(this._domWordWrapSettingChanged.bind(this));

    var crumbsContainer = stackElement.createChild("div");
    crumbsContainer.id = "elements-crumbs";
    this._breadcrumbs = new WebInspector.ElementsBreadcrumbs();
    this._breadcrumbs.show(crumbsContainer);
    this._breadcrumbs.addEventListener(WebInspector.ElementsBreadcrumbs.Events.NodeSelected, this._crumbNodeSelected, this);

    this.sidebarPanes = {};
    this.sidebarPanes.platformFonts = new WebInspector.PlatformFontsSidebarPane();
    this.sidebarPanes.computedStyle = new WebInspector.ComputedStyleSidebarPane();
    this.sidebarPanes.styles = new WebInspector.StylesSidebarPane(this.sidebarPanes.computedStyle, this._setPseudoClassForNode.bind(this));
    this.sidebarPanes.styles.addEventListener(WebInspector.StylesSidebarPane.Events.SelectorEditingStarted, this._onEditingSelectorStarted.bind(this));
    this.sidebarPanes.styles.addEventListener(WebInspector.StylesSidebarPane.Events.SelectorEditingEnded, this._onEditingSelectorEnded.bind(this));

    this._matchedStylesFilterBoxContainer = createElement("div");
    this._matchedStylesFilterBoxContainer.className = "sidebar-pane-filter-box";
    this._computedStylesFilterBoxContainer = createElement("div");
    this._computedStylesFilterBoxContainer.className = "sidebar-pane-filter-box";
    this.sidebarPanes.styles.setFilterBoxContainers(this._matchedStylesFilterBoxContainer, this._computedStylesFilterBoxContainer);

    this.sidebarPanes.metrics = new WebInspector.MetricsSidebarPane();
    this.sidebarPanes.properties = new WebInspector.PropertiesSidebarPane();
    this.sidebarPanes.domBreakpoints = WebInspector.domBreakpointsSidebarPane.createProxy(this);
    this.sidebarPanes.eventListeners = new WebInspector.EventListenersSidebarPane();
    this.sidebarPanes.animations = new WebInspector.AnimationsSidebarPane(this.sidebarPanes.styles);

    WebInspector.dockController.addEventListener(WebInspector.DockController.Events.DockSideChanged, this._dockSideChanged.bind(this));
    WebInspector.settings.splitVerticallyWhenDockedToRight.addChangeListener(this._dockSideChanged.bind(this));
    this._dockSideChanged();

    /** @type {!Array.<!WebInspector.ElementsTreeOutline>} */
    this._treeOutlines = [];
    /** @type {!Map.<!WebInspector.Target, !WebInspector.ElementsTreeOutline>} */
    this._targetToTreeOutline = new Map();
    WebInspector.targetManager.observeTargets(this);
    WebInspector.settings.showUAShadowDOM.addChangeListener(this._showUAShadowDOMChanged.bind(this));
    WebInspector.targetManager.addModelListener(WebInspector.DOMModel, WebInspector.DOMModel.Events.DocumentUpdated, this._documentUpdatedEvent, this);
    WebInspector.targetManager.addModelListener(WebInspector.CSSStyleModel, WebInspector.CSSStyleModel.Events.ModelWasEnabled, this._updateSidebars, this);
    WebInspector.extensionServer.addEventListener(WebInspector.ExtensionServer.Events.SidebarPaneAdded, this._extensionSidebarPaneAdded, this);
}

WebInspector.ElementsPanel.prototype = {
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
     * @param {!WebInspector.Target} target
     */
    targetAdded: function(target)
    {
        var treeOutline = new WebInspector.ElementsTreeOutline(target, true, true, this._setPseudoClassForNode.bind(this));
        treeOutline.setWordWrap(WebInspector.settings.domWordWrap.get());
        treeOutline.wireToDOMModel();
        treeOutline.addEventListener(WebInspector.ElementsTreeOutline.Events.SelectedNodeChanged, this._selectedNodeChanged, this);
        treeOutline.addEventListener(WebInspector.ElementsTreeOutline.Events.NodePicked, this._onNodePicked, this);
        treeOutline.addEventListener(WebInspector.ElementsTreeOutline.Events.ElementsTreeUpdated, this._updateBreadcrumbIfNeeded, this);
        this._treeOutlines.push(treeOutline);
        this._targetToTreeOutline.set(target, treeOutline);

        // Perform attach if necessary.
        if (this.isShowing())
            this.wasShown();
    },

    /**
     * @param {!WebInspector.Target} target
     */
    targetRemoved: function(target)
    {
        var treeOutline = this._targetToTreeOutline.remove(target);
        treeOutline.unwireFromDOMModel();
        this._treeOutlines.remove(treeOutline);
        treeOutline.element.remove();
    },

    /**
     * @return {?WebInspector.ElementsTreeOutline}
     */
    _firstTreeOutlineDeprecated: function()
    {
        return this._treeOutlines[0] || null;
    },

    _updateTreeOutlineVisibleWidth: function()
    {
        if (!this._treeOutlines.length)
            return;

        var width = this._splitView.element.offsetWidth;
        if (this._splitView.isVertical())
            width -= this._splitView.sidebarSize();
        for (var i = 0; i < this._treeOutlines.length; ++i) {
            this._treeOutlines[i].setVisibleWidth(width);
            this._treeOutlines[i].updateSelection();
        }
        this._breadcrumbs.updateSizes();
    },

    /**
     * @return {!Element}
     */
    defaultFocusedElement: function()
    {
        return this._treeOutlines.length ? this._treeOutlines[0].element : this.element;
    },

    /**
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
        for (var i = 0; i < this._treeOutlines.length; ++i) {
            var treeOutline = this._treeOutlines[i];
            treeOutline.domModel().hideDOMNodeHighlight();
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
        this._updateTreeOutlineVisibleWidth();
    },

    /**
     * @param {!WebInspector.DOMNode} node
     * @param {string} pseudoClass
     * @param {boolean} enable
     */
    _setPseudoClassForNode: function(node, pseudoClass, enable)
    {
        if (!node || !node.target().cssModel.forcePseudoState(node, pseudoClass, enable))
            return;

        this._treeOutlineForNode(node).updateOpenCloseTags(node);

        this._updateCSSSidebars();

        WebInspector.notifications.dispatchEventToListeners(WebInspector.UserMetrics.UserAction, {
            action: WebInspector.UserMetrics.UserActionNames.ForcedElementState,
            selector: WebInspector.DOMPresentationUtils.fullQualifiedSelector(node, false),
            enabled: enable,
            state: pseudoClass
        });
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

        this._updateSidebars();

        if (selectedNode) {
            ConsoleAgent.addInspectedNode(selectedNode.id);
            this._lastValidSelectedNode = selectedNode;
        }
        WebInspector.notifications.dispatchEventToListeners(WebInspector.NotificationService.Events.SelectedNodeChanged);
    },

    _updateSidebars: function()
    {
        this._updateCSSSidebars();
        this.sidebarPanes.properties.setNode(this.selectedDOMNode());
        this.sidebarPanes.eventListeners.setNode(this.selectedDOMNode());
        this.sidebarPanes.animations.setNode(this.selectedDOMNode());
    },

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

        var treeOutline = this._targetToTreeOutline.get(domModel.target());
        treeOutline.rootDOMNode = inspectedRootDocument;

        if (!inspectedRootDocument) {
            if (this.isShowing())
                domModel.requestDocument();
            return;
        }

        WebInspector.domBreakpointsSidebarPane.restoreBreakpoints(domModel.target());

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

            this.selectDOMNode(candidateFocusNode);
            if (treeOutline.selectedTreeElement)
                treeOutline.selectedTreeElement.expand();
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

    searchCanceled: function()
    {
        delete this._searchQuery;
        this._hideSearchHighlights();

        this._searchableView.updateSearchMatchesCount(0);

        delete this._currentSearchResultIndex;
        delete this._searchResults;

        var targets = WebInspector.targetManager.targets();
        for (var i = 0; i < targets.length; ++i)
            targets[i].domModel.cancelSearch();
    },

    /**
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

        var targets = WebInspector.targetManager.targets();
        var promises = [];
        for (var i = 0; i < targets.length; ++i)
            promises.push(targets[i].domModel.performSearchPromise(whitespaceTrimmedQuery, WebInspector.settings.showUAShadowDOM.get()));
        Promise.all(promises).then(resultCountCallback.bind(this));

        /**
         * @param {!Array.<number>} resultCounts
         * @this {WebInspector.ElementsPanel}
         */
        function resultCountCallback(resultCounts)
        {
            /**
             * @type {!Array.<{target: !WebInspector.Target, index: number, node: (?WebInspector.DOMNode|undefined)}>}
             */
            this._searchResults = [];
            for (var i = 0; i < resultCounts.length; ++i) {
                var resultCount = resultCounts[i];
                for (var j = 0; j < resultCount; ++j)
                    this._searchResults.push({target: targets[i], index: j, node: undefined});
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

    jumpToNextSearchResult: function()
    {
        if (!this._searchResults)
            return;
        this._jumpToSearchResult(this._currentSearchResultIndex + 1);
    },

    jumpToPreviousSearchResult: function()
    {
        if (!this._searchResults)
            return;
        this._jumpToSearchResult(this._currentSearchResultIndex - 1);
    },

    /**
     * @return {boolean}
     */
    supportsCaseSensitiveSearch: function()
    {
        return false;
    },

    /**
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
            searchResult.target.domModel.searchResult(searchResult.index, searchCallback.bind(this));
            return;
        }

        this._searchableView.updateCurrentMatchIndex(index);

        var treeElement = this._treeElementForNode(searchResult.node);
        if (treeElement) {
            treeElement.highlightSearchResults(this._searchQuery);
            treeElement.reveal();
            var matches = treeElement.listItemElement.getElementsByClassName("highlighted-search-result");
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
        var treeOutline = this._targetToTreeOutline.get(searchResult.target);
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
            if (treeOutline.target() === node.target())
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

    _updateCSSSidebars: function()
    {
        var selectedDOMNode = this.selectedDOMNode();
        if (!selectedDOMNode || !selectedDOMNode.target().cssModel.isEnabled())
            return;

        this.sidebarPanes.styles.update(selectedDOMNode, true);
        this.sidebarPanes.metrics.setNode(selectedDOMNode);
        this.sidebarPanes.platformFonts.setNode(selectedDOMNode);
    },

    /**
     * @param {!KeyboardEvent} event
     */
    handleShortcut: function(event)
    {
        /**
         * @param {!WebInspector.ElementsTreeOutline} treeOutline
         * @this {WebInspector.ElementsPanel}
         */
        function handleUndoRedo(treeOutline)
        {
            if (WebInspector.KeyboardShortcut.eventHasCtrlOrMeta(event) && !event.shiftKey && event.keyIdentifier === "U+005A") { // Z key
                treeOutline.target().domModel.undo(this._updateSidebars.bind(this));
                event.handled = true;
                return;
            }

            var isRedoKey = WebInspector.isMac() ? event.metaKey && event.shiftKey && event.keyIdentifier === "U+005A" : // Z key
                                                   event.ctrlKey && event.keyIdentifier === "U+0059"; // Y key
            if (isRedoKey) {
                treeOutline.target().domModel.redo(this._updateSidebars.bind(this));
                event.handled = true;
            }
        }

        var treeOutline = null;
        for (var i = 0; i < this._treeOutlines.length; ++i) {
            if (this._treeOutlines[i].selectedDOMNode() === this._lastValidSelectedNode)
                treeOutline = this._treeOutlines[i];
        }
        if (!treeOutline)
            return;

        if (!treeOutline.editing()) {
            handleUndoRedo.call(this, treeOutline);
            if (event.handled)
                return;
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
        return this._targetToTreeOutline.get(node.target()) || null;
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
        if (!WebInspector.currentFocusElement().enclosingNodeOrSelfWithClass("elements-tree-outline"))
            return;
        var treeOutline = this._treeOutlineForNode(this.selectedDOMNode());
        if (treeOutline)
            treeOutline.handleCopyOrCutKeyboardEvent(false, event);
    },

    /**
     * @param {!Event} event
     */
    handleCutEvent: function(event)
    {
        var treeOutline = this._treeOutlineForNode(this.selectedDOMNode());
        if (treeOutline)
            treeOutline.handleCopyOrCutKeyboardEvent(true, event);
    },

    /**
     * @param {!Event} event
     */
    handlePasteEvent: function(event)
    {
        var treeOutline = this._treeOutlineForNode(this.selectedDOMNode());
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
        if (WebInspector.inspectElementModeController && WebInspector.inspectElementModeController.enabled()) {
            InspectorFrontendHost.bringToFront();
            WebInspector.inspectElementModeController.disable();
        }

        this._omitDefaultSelection = true;
        WebInspector.inspectorView.setCurrentPanel(this);
        node = WebInspector.settings.showUAShadowDOM.get() ? node : this._leaveUserAgentShadowDOM(node);
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
            WebInspector.domBreakpointsSidebarPane.populateNodeContextMenu(object, contextMenu);
        }

        // Skip adding "Reveal..." menu item for our own tree outline.
        if (this.element.isAncestor(/** @type {!Node} */ (event.target)))
            return;
        var commandCallback = WebInspector.Revealer.reveal.bind(WebInspector.Revealer, object);

        contextMenu.appendItem(WebInspector.useLowerCaseMenuTitles() ? "Reveal in Elements panel" : "Reveal in Elements Panel", commandCallback);
    },

    _sidebarContextMenuEventFired: function(event)
    {
        var contextMenu = new WebInspector.ContextMenu(event);
        contextMenu.show();
    },

    _dockSideChanged: function()
    {
        var vertically = WebInspector.dockController.isVertical() && WebInspector.settings.splitVerticallyWhenDockedToRight.get();
        this._splitVertically(vertically);
    },

    _showUAShadowDOMChanged: function()
    {
        for (var i = 0; i < this._treeOutlines.length; ++i)
            this._treeOutlines[i].update();
    },

    /**
     * @param {boolean} vertically
     */
    _splitVertically: function(vertically)
    {
        if (this.sidebarPaneView && vertically === !this._splitView.isVertical())
            return;

        if (this.sidebarPaneView) {
            this.sidebarPaneView.detach();
            this._splitView.uninstallResizer(this.sidebarPaneView.headerElement());
        }

        this._splitView.setVertical(!vertically);

        var computedPane = new WebInspector.SidebarPane(WebInspector.UIString("Computed"));
        computedPane.element.classList.add("composite");
        computedPane.element.classList.add("fill");
        var expandComputed = computedPane.expand.bind(computedPane);

        computedPane.bodyElement.classList.add("metrics-and-computed");
        this.sidebarPanes.computedStyle.setExpandCallback(expandComputed);

        var matchedStylePanesWrapper = createElement("div");
        matchedStylePanesWrapper.className = "style-panes-wrapper";
        var computedStylePanesWrapper = createElement("div");
        computedStylePanesWrapper.className = "style-panes-wrapper";

        /**
         * @param {boolean} inComputedStyle
         * @this {WebInspector.ElementsPanel}
         */
        function showMetrics(inComputedStyle)
        {
            if (inComputedStyle)
                this.sidebarPanes.metrics.show(computedStylePanesWrapper, this.sidebarPanes.computedStyle.element);
            else
                this.sidebarPanes.metrics.show(matchedStylePanesWrapper);
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
            this._splitView.installResizer(this.sidebarPaneView.headerElement());
            this.sidebarPanes.metrics.setExpandCallback(expandComputed);

            var compositePane = new WebInspector.SidebarPane(this.sidebarPanes.styles.title());
            compositePane.element.classList.add("composite");
            compositePane.element.classList.add("fill");
            var expandComposite = compositePane.expand.bind(compositePane);

            var splitView = new WebInspector.SplitView(true, true, "stylesPaneSplitViewState", 0.5);
            splitView.show(compositePane.bodyElement);

            var vbox1 = new WebInspector.VBox();
            vbox1.element.appendChild(matchedStylePanesWrapper);
            vbox1.element.appendChild(this._matchedStylesFilterBoxContainer);
            splitView.setMainView(vbox1);

            var vbox2 = new WebInspector.VBox();
            vbox2.element.appendChild(computedStylePanesWrapper);
            vbox2.element.appendChild(this._computedStylesFilterBoxContainer);
            splitView.setSidebarView(vbox2);

            this.sidebarPanes.styles.setExpandCallback(expandComposite);

            computedPane.show(computedStylePanesWrapper);
            computedPane.setExpandCallback(expandComposite);

            this.sidebarPaneView.addPane(compositePane);
        } else {
            var stylesPane = new WebInspector.SidebarPane(this.sidebarPanes.styles.title());
            stylesPane.element.classList.add("composite");
            stylesPane.element.classList.add("fill");
            var expandStyles = stylesPane.expand.bind(stylesPane);
            stylesPane.bodyElement.classList.add("metrics-and-styles");

            stylesPane.bodyElement.appendChild(matchedStylePanesWrapper);
            computedPane.bodyElement.appendChild(computedStylePanesWrapper);

            this.sidebarPanes.styles.setExpandCallback(expandStyles);
            this.sidebarPanes.metrics.setExpandCallback(expandStyles);

            this.sidebarPaneView.addEventListener(WebInspector.TabbedPane.EventTypes.TabSelected, tabSelected, this);

            stylesPane.bodyElement.appendChild(this._matchedStylesFilterBoxContainer);
            computedPane.bodyElement.appendChild(this._computedStylesFilterBoxContainer);

            this.sidebarPaneView.addPane(stylesPane);
            this.sidebarPaneView.addPane(computedPane);
        }

        this.sidebarPanes.styles.show(matchedStylePanesWrapper);
        this.sidebarPanes.computedStyle.show(computedStylePanesWrapper);
        matchedStylePanesWrapper.appendChild(this.sidebarPanes.styles.titleElement);
        showMetrics.call(this, vertically);
        this.sidebarPanes.platformFonts.show(computedStylePanesWrapper);

        this.sidebarPaneView.addPane(this.sidebarPanes.eventListeners);
        this.sidebarPaneView.addPane(this.sidebarPanes.domBreakpoints);
        this.sidebarPaneView.addPane(this.sidebarPanes.properties);
        if (Runtime.experiments.isEnabled("animationInspection"))
            this.sidebarPaneView.addPane(this.sidebarPanes.animations);
        this._extensionSidebarPanesContainer = this.sidebarPaneView;

        var extensionSidebarPanes = WebInspector.extensionServer.sidebarPanes();
        for (var i = 0; i < extensionSidebarPanes.length; ++i)
            this._addExtensionSidebarPane(extensionSidebarPanes[i]);

        this._splitView.setSidebarView(this.sidebarPaneView);
        this.sidebarPanes.styles.expand();
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
        if (pane.panelName() === this.name) {
            this.setHideOnDetach();
            this._extensionSidebarPanesContainer.addPane(pane);
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
     * @param {!Object} node
     * @return {!Promise}
     */
    reveal: function(node)
    {
        return new Promise(revealPromise);

        /**
         * @param {function(undefined)} resolve
         * @param {function(!Error)} reject
         */
        function revealPromise(resolve, reject)
        {
            var panel = WebInspector.ElementsPanel.instance();
            if (node instanceof WebInspector.DOMNode)
                onNodeResolved(/** @type {!WebInspector.DOMNode} */ (node));
            else if (node instanceof WebInspector.DeferredDOMNode)
                (/** @type {!WebInspector.DeferredDOMNode} */ (node)).resolve(onNodeResolved);
            else if (node instanceof WebInspector.RemoteObject)
                (/** @type {!WebInspector.RemoteObject} */ (node)).pushNodeToFrontend(onNodeResolved);
            else
                reject(new Error("Can't reveal a non-node."));

            /**
             * @param {?WebInspector.DOMNode} resolvedNode
             */
            function onNodeResolved(resolvedNode)
            {
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
     * @return {!WebInspector.Panel}
     */
    createPanel: function()
    {
        return WebInspector.ElementsPanel.instance();
    }
}
