// Copyright 2014 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

/**
 * @constructor
 * @extends {WebInspector.HBox}
 */
WebInspector.ElementsBreadcrumbs = function()
{
    WebInspector.HBox.call(this, true);
    this.registerRequiredCSS("elements/breadcrumbs.css");

    this.crumbsElement = this.contentElement.createChild("div", "crumbs");
    this.crumbsElement.addEventListener("mousemove", this._mouseMovedInCrumbs.bind(this), false);
    this.crumbsElement.addEventListener("mouseleave", this._mouseMovedOutOfCrumbs.bind(this), false);
    this._nodeSymbol = Symbol("node");
}

/** @enum {string} */
WebInspector.ElementsBreadcrumbs.Events = {
    NodeSelected: "NodeSelected"
}

WebInspector.ElementsBreadcrumbs.prototype = {
    wasShown: function()
    {
        this.update();
    },

    /**
     * @param {!Array.<!WebInspector.DOMNode>} nodes
     */
    updateNodes: function(nodes)
    {
        if (!nodes.length)
            return;

        var crumbs = this.crumbsElement;
        for (var crumb = crumbs.firstChild; crumb; crumb = crumb.nextSibling) {
            if (nodes.indexOf(crumb[this._nodeSymbol]) !== -1) {
                this.update(true);
                return;
            }
        }
    },

    /**
     * @param {?WebInspector.DOMNode} node
     */
    setSelectedNode: function(node)
    {
        this._currentDOMNode = node;
        this.update();
    },

    _mouseMovedInCrumbs: function(event)
    {
        var nodeUnderMouse = event.target;
        var crumbElement = nodeUnderMouse.enclosingNodeOrSelfWithClass("crumb");
        var node = /** @type {?WebInspector.DOMNode} */ (crumbElement ? crumbElement[this._nodeSymbol] : null);
        if (node)
            node.highlight();
    },

    _mouseMovedOutOfCrumbs: function(event)
    {
        if (this._currentDOMNode)
            WebInspector.DOMModel.hideDOMNodeHighlight();
    },

    /**
     * @param {boolean=} force
     */
    update: function(force)
    {
        if (!this.isShowing())
            return;

        var currentDOMNode = this._currentDOMNode;
        var crumbs = this.crumbsElement;

        var handled = false;
        var crumb = crumbs.firstChild;
        while (crumb) {
            if (crumb[this._nodeSymbol] === currentDOMNode) {
                crumb.classList.add("selected");
                handled = true;
            } else {
                crumb.classList.remove("selected");
            }

            crumb = crumb.nextSibling;
        }

        if (handled && !force) {
            // We don't need to rebuild the crumbs, but we need to adjust sizes
            // to reflect the new focused or root node.
            this.updateSizes();
            return;
        }

        crumbs.removeChildren();

        var panel = this;

        /**
         * @param {!Event} event
         * @this {WebInspector.ElementsBreadcrumbs}
         */
        function selectCrumb(event)
        {
            event.preventDefault();
            var crumb = /** @type {!Element} */ (event.currentTarget);
            if (!crumb.classList.contains("collapsed")) {
                this.dispatchEventToListeners(WebInspector.ElementsBreadcrumbs.Events.NodeSelected, crumb[this._nodeSymbol]);
                return;
            }

            // Clicking a collapsed crumb will expose the hidden crumbs.
            if (crumb === panel.crumbsElement.firstChild) {
                // If the focused crumb is the first child, pick the farthest crumb
                // that is still hidden. This allows the user to expose every crumb.
                var currentCrumb = crumb;
                while (currentCrumb) {
                    var hidden = currentCrumb.classList.contains("hidden");
                    var collapsed = currentCrumb.classList.contains("collapsed");
                    if (!hidden && !collapsed)
                        break;
                    crumb = currentCrumb;
                    currentCrumb = currentCrumb.nextSiblingElement;
                }
            }

            this.updateSizes(crumb);
        }

        var boundSelectCrumb = selectCrumb.bind(this);
        for (var current = currentDOMNode; current; current = current.parentNode) {
            if (current.nodeType() === Node.DOCUMENT_NODE)
                continue;

            crumb = createElementWithClass("span", "crumb");
            crumb[this._nodeSymbol] = current;
            crumb.addEventListener("mousedown", boundSelectCrumb, false);

            var crumbTitle = "";
            switch (current.nodeType()) {
                case Node.ELEMENT_NODE:
                    if (current.pseudoType())
                        crumbTitle = "::" + current.pseudoType();
                    else
                        WebInspector.DOMPresentationUtils.decorateNodeLabel(current, crumb);
                    break;

                case Node.TEXT_NODE:
                    crumbTitle = WebInspector.UIString("(text)");
                    break;

                case Node.COMMENT_NODE:
                    crumbTitle = "<!-->";
                    break;

                case Node.DOCUMENT_TYPE_NODE:
                    crumbTitle = "<!DOCTYPE>";
                    break;

                case Node.DOCUMENT_FRAGMENT_NODE:
                    crumbTitle = current.shadowRootType() ? "#shadow-root" : current.nodeNameInCorrectCase();
                    break;

                default:
                    crumbTitle = current.nodeNameInCorrectCase();
            }

            if (!crumb.childNodes.length) {
                var nameElement = createElement("span");
                nameElement.textContent = crumbTitle;
                crumb.appendChild(nameElement);
                crumb.title = crumbTitle;
            }

            if (current === currentDOMNode)
                crumb.classList.add("selected");
            crumbs.insertBefore(crumb, crumbs.firstChild);
        }

        this.updateSizes();
    },

    /**
     * @param {!Element=} focusedCrumb
     */
    updateSizes: function(focusedCrumb)
    {
        if (!this.isShowing())
            return;

        var crumbs = this.crumbsElement;
        if (!crumbs.firstChild)
            return;

        var selectedIndex = 0;
        var focusedIndex = 0;
        var selectedCrumb;

        // Reset crumb styles.
        for (var i = 0; i < crumbs.childNodes.length; ++i) {
            var crumb = crumbs.childNodes[i];
            // Find the selected crumb and index.
            if (!selectedCrumb && crumb.classList.contains("selected")) {
                selectedCrumb = crumb;
                selectedIndex = i;
            }

            // Find the focused crumb index.
            if (crumb === focusedCrumb)
                focusedIndex = i;

            crumb.classList.remove("compact", "collapsed", "hidden");
        }

        // Layout 1: Measure total and normal crumb sizes
        var contentElementWidth = this.contentElement.offsetWidth;
        var normalSizes = [];
        for (var i = 0; i < crumbs.childNodes.length; ++i) {
            var crumb = crumbs.childNodes[i];
            normalSizes[i] = crumb.offsetWidth;
        }

        // Layout 2: Measure collapsed crumb sizes
        var compactSizes = [];
        for (var i = 0; i < crumbs.childNodes.length; ++i) {
            var crumb = crumbs.childNodes[i];
            crumb.classList.add("compact");
        }
        for (var i = 0; i < crumbs.childNodes.length; ++i) {
            var crumb = crumbs.childNodes[i];
            compactSizes[i] = crumb.offsetWidth;
        }

        // Layout 3: Measure collapsed crumb size
        crumbs.firstChild.classList.add("collapsed");
        var collapsedSize = crumbs.firstChild.offsetWidth;

        // Clean up.
        for (var i = 0; i < crumbs.childNodes.length; ++i) {
            var crumb = crumbs.childNodes[i];
            crumb.classList.remove("compact", "collapsed");
        }

        function crumbsAreSmallerThanContainer()
        {
            var totalSize = 0;
            for (var i = 0; i < crumbs.childNodes.length; ++i) {
                var crumb = crumbs.childNodes[i];
                if (crumb.classList.contains("hidden"))
                    continue;
                if (crumb.classList.contains("collapsed")) {
                    totalSize += collapsedSize;
                    continue;
                }
                totalSize += crumb.classList.contains("compact") ? compactSizes[i] : normalSizes[i];
            }
            const rightPadding = 10;
            return totalSize + rightPadding < contentElementWidth;
        }

        if (crumbsAreSmallerThanContainer())
            return; // No need to compact the crumbs, they all fit at full size.

        var BothSides = 0;
        var AncestorSide = -1;
        var ChildSide = 1;

        /**
         * @param {function(!Element)} shrinkingFunction
         * @param {number} direction
         */
        function makeCrumbsSmaller(shrinkingFunction, direction)
        {
            var significantCrumb = focusedCrumb || selectedCrumb;
            var significantIndex = significantCrumb === selectedCrumb ? selectedIndex : focusedIndex;

            function shrinkCrumbAtIndex(index)
            {
                var shrinkCrumb = crumbs.childNodes[index];
                if (shrinkCrumb && shrinkCrumb !== significantCrumb)
                    shrinkingFunction(shrinkCrumb);
                if (crumbsAreSmallerThanContainer())
                    return true; // No need to compact the crumbs more.
                return false;
            }

            // Shrink crumbs one at a time by applying the shrinkingFunction until the crumbs
            // fit in the container or we run out of crumbs to shrink.
            if (direction) {
                // Crumbs are shrunk on only one side (based on direction) of the signifcant crumb.
                var index = (direction > 0 ? 0 : crumbs.childNodes.length - 1);
                while (index !== significantIndex) {
                    if (shrinkCrumbAtIndex(index))
                        return true;
                    index += (direction > 0 ? 1 : -1);
                }
            } else {
                // Crumbs are shrunk in order of descending distance from the signifcant crumb,
                // with a tie going to child crumbs.
                var startIndex = 0;
                var endIndex = crumbs.childNodes.length - 1;
                while (startIndex != significantIndex || endIndex != significantIndex) {
                    var startDistance = significantIndex - startIndex;
                    var endDistance = endIndex - significantIndex;
                    if (startDistance >= endDistance)
                        var index = startIndex++;
                    else
                        var index = endIndex--;
                    if (shrinkCrumbAtIndex(index))
                        return true;
                }
            }

            // We are not small enough yet, return false so the caller knows.
            return false;
        }

        function coalesceCollapsedCrumbs()
        {
            var crumb = crumbs.firstChild;
            var collapsedRun = false;
            var newStartNeeded = false;
            var newEndNeeded = false;
            while (crumb) {
                var hidden = crumb.classList.contains("hidden");
                if (!hidden) {
                    var collapsed = crumb.classList.contains("collapsed");
                    if (collapsedRun && collapsed) {
                        crumb.classList.add("hidden");
                        crumb.classList.remove("compact");
                        crumb.classList.remove("collapsed");

                        if (crumb.classList.contains("start")) {
                            crumb.classList.remove("start");
                            newStartNeeded = true;
                        }

                        if (crumb.classList.contains("end")) {
                            crumb.classList.remove("end");
                            newEndNeeded = true;
                        }

                        continue;
                    }

                    collapsedRun = collapsed;

                    if (newEndNeeded) {
                        newEndNeeded = false;
                        crumb.classList.add("end");
                    }
                } else {
                    collapsedRun = true;
                }
                crumb = crumb.nextSibling;
            }

            if (newStartNeeded) {
                crumb = crumbs.lastChild;
                while (crumb) {
                    if (!crumb.classList.contains("hidden")) {
                        crumb.classList.add("start");
                        break;
                    }
                    crumb = crumb.previousSibling;
                }
            }
        }

        /**
         * @param {!Element} crumb
         */
        function compact(crumb)
        {
            if (crumb.classList.contains("hidden"))
                return;
            crumb.classList.add("compact");
        }

        /**
         * @param {!Element} crumb
         * @param {boolean=} dontCoalesce
         */
        function collapse(crumb, dontCoalesce)
        {
            if (crumb.classList.contains("hidden"))
                return;
            crumb.classList.add("collapsed");
            crumb.classList.remove("compact");
            if (!dontCoalesce)
                coalesceCollapsedCrumbs();
        }

        if (!focusedCrumb) {
            // When not focused on a crumb we can be biased and collapse less important
            // crumbs that the user might not care much about.

            // Compact child crumbs.
            if (makeCrumbsSmaller(compact, ChildSide))
                return;

            // Collapse child crumbs.
            if (makeCrumbsSmaller(collapse, ChildSide))
                return;
        }

        // Compact ancestor crumbs, or from both sides if focused.
        if (makeCrumbsSmaller(compact, focusedCrumb ? BothSides : AncestorSide))
            return;

        // Collapse ancestor crumbs, or from both sides if focused.
        if (makeCrumbsSmaller(collapse, focusedCrumb ? BothSides : AncestorSide))
            return;

        if (!selectedCrumb)
            return;

        // Compact the selected crumb.
        compact(selectedCrumb);
        if (crumbsAreSmallerThanContainer())
            return;

        // Collapse the selected crumb as a last resort. Pass true to prevent coalescing.
        collapse(selectedCrumb, true);
    },

    __proto__: WebInspector.HBox.prototype
}
