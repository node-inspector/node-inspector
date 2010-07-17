/*
 * Copyright (C) 2007, 2008 Apple Inc.  All rights reserved.
 * Copyright (C) 2008, 2009 Anthony Ricaud <rik@webkit.org>
 * Copyright (C) 2009 Google Inc. All rights reserved.
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

WebInspector.AbstractTimelinePanel = function(name)
{
    WebInspector.Panel.call(this, name);
    this._items = [];
    this._staleItems = [];
}

WebInspector.AbstractTimelinePanel.prototype = {
    get categories()
    {
        // Should be implemented by the concrete subclasses.
        return {};
    },

    populateSidebar: function()
    {
        // Should be implemented by the concrete subclasses.
    },

    createItemTreeElement: function(item)
    {
        // Should be implemented by the concrete subclasses.
    },

    createItemGraph: function(item)
    {
        // Should be implemented by the concrete subclasses.
    },

    get items()
    {
        return this._items;
    },

    createInterface: function()
    {
        this.containerElement = document.createElement("div");
        this.containerElement.id = "resources-container";
        this.containerElement.addEventListener("scroll", this._updateDividersLabelBarPosition.bind(this), false);
        this.element.appendChild(this.containerElement);

        this.createSidebar(this.containerElement, this.element);
        this.sidebarElement.id = "resources-sidebar";
        this.populateSidebar();

        this._containerContentElement = document.createElement("div");
        this._containerContentElement.id = "resources-container-content";
        this.containerElement.appendChild(this._containerContentElement);

        this.summaryBar = new WebInspector.SummaryBar(this.categories);
        this.summaryBar.element.id = "resources-summary";
        this._containerContentElement.appendChild(this.summaryBar.element);

        this._timelineGrid = new WebInspector.TimelineGrid();
        this._containerContentElement.appendChild(this._timelineGrid.element);
        this.itemsGraphsElement = this._timelineGrid.itemsGraphsElement;
    },

    createFilterPanel: function()
    {
        this.filterBarElement = document.createElement("div");
        this.filterBarElement.id = "resources-filter";
        this.filterBarElement.className = "scope-bar";
        this.element.appendChild(this.filterBarElement);

        function createFilterElement(category)
        {
            if (category === "all")
                var label = WebInspector.UIString("All");
            else if (this.categories[category])
                var label = this.categories[category].title;

            var categoryElement = document.createElement("li");
            categoryElement.category = category;
            categoryElement.addStyleClass(category);
            categoryElement.appendChild(document.createTextNode(label));
            categoryElement.addEventListener("click", this._updateFilter.bind(this), false);
            this.filterBarElement.appendChild(categoryElement);

            return categoryElement;
        }

        this.filterAllElement = createFilterElement.call(this, "all");

        // Add a divider
        var dividerElement = document.createElement("div");
        dividerElement.addStyleClass("divider");
        this.filterBarElement.appendChild(dividerElement);

        for (var category in this.categories)
            createFilterElement.call(this, category);
    },

    showCategory: function(category)
    {
        var filterClass = "filter-" + category.toLowerCase();
        this.itemsGraphsElement.addStyleClass(filterClass);
        this.itemsTreeElement.childrenListElement.addStyleClass(filterClass);
    },

    hideCategory: function(category)
    {
        var filterClass = "filter-" + category.toLowerCase();
        this.itemsGraphsElement.removeStyleClass(filterClass);
        this.itemsTreeElement.childrenListElement.removeStyleClass(filterClass);
    },

    filter: function(target, selectMultiple)
    {
        function unselectAll()
        {
            for (var i = 0; i < this.filterBarElement.childNodes.length; ++i) {
                var child = this.filterBarElement.childNodes[i];
                if (!child.category)
                    continue;

                child.removeStyleClass("selected");
                this.hideCategory(child.category);
            }
        }

        if (target === this.filterAllElement) {
            if (target.hasStyleClass("selected")) {
                // We can't unselect All, so we break early here
                return;
            }

            // If All wasn't selected, and now is, unselect everything else.
            unselectAll.call(this);
        } else {
            // Something other than All is being selected, so we want to unselect All.
            if (this.filterAllElement.hasStyleClass("selected")) {
                this.filterAllElement.removeStyleClass("selected");
                this.hideCategory("all");
            }
        }

        if (!selectMultiple) {
            // If multiple selection is off, we want to unselect everything else
            // and just select ourselves.
            unselectAll.call(this);

            target.addStyleClass("selected");
            this.showCategory(target.category);
            return;
        }

        if (target.hasStyleClass("selected")) {
            // If selectMultiple is turned on, and we were selected, we just
            // want to unselect ourselves.
            target.removeStyleClass("selected");
            this.hideCategory(target.category);
        } else {
            // If selectMultiple is turned on, and we weren't selected, we just
            // want to select ourselves.
            target.addStyleClass("selected");
            this.showCategory(target.category);
        }
    },

    _updateFilter: function(e)
    {
        var isMac = WebInspector.isMac();
        var selectMultiple = false;
        if (isMac && e.metaKey && !e.ctrlKey && !e.altKey && !e.shiftKey)
            selectMultiple = true;
        if (!isMac && e.ctrlKey && !e.metaKey && !e.altKey && !e.shiftKey)
            selectMultiple = true;

        this.filter(e.target, selectMultiple);

        // When we are updating our filtering, scroll to the top so we don't end up
        // in blank graph under all the resources.
        this.containerElement.scrollTop = 0;
    },

    updateGraphDividersIfNeeded: function(force)
    {
        if (!this.visible) {
            this.needsRefresh = true;
            return false;
        }
        return this._timelineGrid.updateDividers(force, this.calculator);
    },

    _updateDividersLabelBarPosition: function()
    {
        const scrollTop = this.containerElement.scrollTop;
        const offsetHeight = this.summaryBar.element.offsetHeight;
        const dividersTop = (scrollTop < offsetHeight ? offsetHeight : scrollTop);
        this._timelineGrid.setScrollAndDividerTop(scrollTop, dividersTop);
    },

    get needsRefresh()
    {
        return this._needsRefresh;
    },

    set needsRefresh(x)
    {
        if (this._needsRefresh === x)
            return;

        this._needsRefresh = x;

        if (x) {
            if (this.visible && !("_refreshTimeout" in this))
                this._refreshTimeout = setTimeout(this.refresh.bind(this), 500);
        } else {
            if ("_refreshTimeout" in this) {
                clearTimeout(this._refreshTimeout);
                delete this._refreshTimeout;
            }
        }
    },

    refreshIfNeeded: function()
    {
        if (this.needsRefresh)
            this.refresh();
    },

    show: function()
    {
        WebInspector.Panel.prototype.show.call(this);

        this._updateDividersLabelBarPosition();
        this.refreshIfNeeded();
    },

    resize: function()
    {
        WebInspector.Panel.prototype.resize.call(this);

        this.updateGraphDividersIfNeeded();
    },

    updateMainViewWidth: function(width)
    {
        this._containerContentElement.style.left = width + "px";
        this.resize();
    },

    invalidateAllItems: function()
    {
        this._staleItems = this._items.slice();
    },

    refresh: function()
    {
        this.needsRefresh = false;

        var staleItemsLength = this._staleItems.length;

        var boundariesChanged = false;

        for (var i = 0; i < staleItemsLength; ++i) {
            var item = this._staleItems[i];
            if (!item._itemsTreeElement) {
                // Create the timeline tree element and graph.
                item._itemsTreeElement = this.createItemTreeElement(item);
                item._itemsTreeElement._itemGraph = this.createItemGraph(item);

                this.itemsTreeElement.appendChild(item._itemsTreeElement);
                this.itemsGraphsElement.appendChild(item._itemsTreeElement._itemGraph.graphElement);
            }

            if (item._itemsTreeElement.refresh)
                item._itemsTreeElement.refresh();

            if (this.calculator.updateBoundaries(item))
                boundariesChanged = true;
        }

        if (boundariesChanged) {
            // The boundaries changed, so all item graphs are stale.
            this._staleItems = this._items.slice();
            staleItemsLength = this._staleItems.length;
        }


        const isBarOpaqueAtLeft = this.sidebarTree.selectedTreeElement && this.sidebarTree.selectedTreeElement.isBarOpaqueAtLeft;
        for (var i = 0; i < staleItemsLength; ++i)
            this._staleItems[i]._itemsTreeElement._itemGraph.refresh(this.calculator, isBarOpaqueAtLeft);

        this._staleItems = [];

        this.updateGraphDividersIfNeeded();
    },

    reset: function()
    {
        this.containerElement.scrollTop = 0;

        if (this._calculator)
            this._calculator.reset();

        if (this._items) {
            var itemsLength = this._items.length;
            for (var i = 0; i < itemsLength; ++i) {
                var item = this._items[i];
                delete item._itemsTreeElement;
            }
        }

        this._items = [];
        this._staleItems = [];

        this.itemsTreeElement.removeChildren();
        this.itemsGraphsElement.removeChildren();

        this.updateGraphDividersIfNeeded(true);
    },

    get calculator()
    {
        return this._calculator;
    },

    set calculator(x)
    {
        if (!x || this._calculator === x)
            return;

        this._calculator = x;
        this._calculator.reset();

        this._staleItems = this._items.slice();
        this.refresh();
    },

    addItem: function(item)
    {
        this._items.push(item);
        this.refreshItem(item);
    },

    removeItem: function(item)
    {
        this._items.remove(item, true);

        if (item._itemsTreeElement) {
            this.itemsTreeElement.removeChild(item._itemsTreeElement);
            this.itemsGraphsElement.removeChild(item._itemsTreeElement._itemGraph.graphElement);
        }

        delete item._itemsTreeElement;
        this.adjustScrollPosition();
    },

    refreshItem: function(item)
    {
        this._staleItems.push(item);
        this.needsRefresh = true;
    },

    revealAndSelectItem: function(item)
    {
        if (item._itemsTreeElement) {
            item._itemsTreeElement.reveal();
            item._itemsTreeElement.select(true);
        }
    },

    sortItems: function(sortingFunction)
    {
        var sortedElements = [].concat(this.itemsTreeElement.children);
        sortedElements.sort(sortingFunction);

        var sortedElementsLength = sortedElements.length;
        for (var i = 0; i < sortedElementsLength; ++i) {
            var treeElement = sortedElements[i];
            if (treeElement === this.itemsTreeElement.children[i])
                continue;

            var wasSelected = treeElement.selected;
            this.itemsTreeElement.removeChild(treeElement);
            this.itemsTreeElement.insertChild(treeElement, i);
            if (wasSelected)
                treeElement.select(true);

            var graphElement = treeElement._itemGraph.graphElement;
            this.itemsGraphsElement.insertBefore(graphElement, this.itemsGraphsElement.children[i]);
        }
    },

    adjustScrollPosition: function()
    {
        // Prevent the container from being scrolled off the end.
        if ((this.containerElement.scrollTop + this.containerElement.offsetHeight) > this.sidebarElement.offsetHeight)
            this.containerElement.scrollTop = (this.sidebarElement.offsetHeight - this.containerElement.offsetHeight);
    },

    addEventDivider: function(divider)
    {
        this._timelineGrid.addEventDivider(divider);
    },

    hideEventDividers: function()
    {
        this._timelineGrid.hideEventDividers();
    },

    showEventDividers: function()
    {
        this._timelineGrid.showEventDividers();
    }
}

WebInspector.AbstractTimelinePanel.prototype.__proto__ = WebInspector.Panel.prototype;

WebInspector.AbstractTimelineCalculator = function()
{
}

WebInspector.AbstractTimelineCalculator.prototype = {
    computeSummaryValues: function(items)
    {
        var total = 0;
        var categoryValues = {};

        var itemsLength = items.length;
        for (var i = 0; i < itemsLength; ++i) {
            var item = items[i];
            var value = this._value(item);
            if (typeof value === "undefined")
                continue;
            if (!(item.category.name in categoryValues))
                categoryValues[item.category.name] = 0;
            categoryValues[item.category.name] += value;
            total += value;
        }

        return {categoryValues: categoryValues, total: total};
    },

    computeBarGraphPercentages: function(item)
    {
        return {start: 0, middle: 0, end: (this._value(item) / this.boundarySpan) * 100};
    },

    computeBarGraphLabels: function(item)
    {
        const label = this.formatValue(this._value(item));
        return {left: label, right: label, tooltip: label};
    },

    get boundarySpan()
    {
        return this.maximumBoundary - this.minimumBoundary;
    },

    updateBoundaries: function(item)
    {
        this.minimumBoundary = 0;

        var value = this._value(item);
        if (typeof this.maximumBoundary === "undefined" || value > this.maximumBoundary) {
            this.maximumBoundary = value;
            return true;
        }
        return false;
    },

    reset: function()
    {
        delete this.minimumBoundary;
        delete this.maximumBoundary;
    },

    _value: function(item)
    {
        return 0;
    },

    formatValue: function(value)
    {
        return value.toString();
    }
}

WebInspector.AbstractTimelineCategory = function(name, title, color)
{
    this.name = name;
    this.title = title;
    this.color = color;
}

WebInspector.AbstractTimelineCategory.prototype = {
    toString: function()
    {
        return this.title;
    }
}
