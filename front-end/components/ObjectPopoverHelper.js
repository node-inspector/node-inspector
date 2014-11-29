/*
 * Copyright (C) 2011 Google Inc. All rights reserved.
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
 * @extends {WebInspector.PopoverHelper}
 * @param {!Element} panelElement
 * @param {function(!Element, !Event):(!Element|!AnchorBox|undefined)} getAnchor
 * @param {function(!Element, function(!WebInspector.RemoteObject, boolean, !Element=):undefined, string):undefined} queryObject
 * @param {function()=} onHide
 * @param {boolean=} disableOnClick
 */
WebInspector.ObjectPopoverHelper = function(panelElement, getAnchor, queryObject, onHide, disableOnClick)
{
    WebInspector.PopoverHelper.call(this, panelElement, getAnchor, this._showObjectPopover.bind(this), this._onHideObjectPopover.bind(this), disableOnClick);
    this._queryObject = queryObject;
    this._onHideCallback = onHide;
    this._popoverObjectGroup = "popover";
    panelElement.addEventListener("scroll", this.hidePopover.bind(this), true);
};

WebInspector.ObjectPopoverHelper.MaxPopoverTextLength = 10000;

WebInspector.ObjectPopoverHelper.prototype = {
    /**
     * @param {function(!WebInspector.RemoteObject):string} formatter
     */
    setRemoteObjectFormatter: function(formatter)
    {
        this._remoteObjectFormatter = formatter;
    },

    /**
     * @param {!Element} element
     * @param {!WebInspector.Popover} popover
     */
    _showObjectPopover: function(element, popover)
    {
        /**
         * @param {!WebInspector.Target} target
         * @param {!Element} anchorElement
         * @param {!Element} popoverContentElement
         * @param {?WebInspector.DebuggerModel.FunctionDetails} response
         * @this {WebInspector.ObjectPopoverHelper}
         */
        function didGetDetails(target, anchorElement, popoverContentElement, response)
        {
            if (!response)
                return;

            var container = createElement("div");
            container.className = "object-popover-container";

            var title = container.createChild("div", "function-popover-title source-code");
            var functionName = title.createChild("span", "function-name");
            functionName.textContent = WebInspector.beautifyFunctionName(response.functionName);

            var rawLocation = response.location;
            var sourceURL = response.sourceURL;
            if (rawLocation && sourceURL) {
                this._linkifier = new WebInspector.Linkifier();
                var link = this._linkifier.linkifyRawLocation(rawLocation, sourceURL, "function-location-link");
                title.appendChild(link);
            }

            container.appendChild(popoverContentElement);
            popover.showForAnchor(container, anchorElement);
        }

        /**
         * @param {!WebInspector.RemoteObject} result
         * @param {boolean} wasThrown
         * @param {!Element=} anchorOverride
         * @this {WebInspector.ObjectPopoverHelper}
         */
        function showObjectPopover(result, wasThrown, anchorOverride)
        {
            if (popover.disposed)
                return;
            if (wasThrown) {
                this.hidePopover();
                return;
            }
            this._objectTarget = result.target();
            var anchorElement = anchorOverride || element;
            var description = (this._remoteObjectFormatter && this._remoteObjectFormatter(result)) || result.description;
            description = description.trimEnd(WebInspector.ObjectPopoverHelper.MaxPopoverTextLength);
            var popoverContentElement = null;
            if (result.type !== "object") {
                popoverContentElement = createElement("span");
                popoverContentElement.className = "monospace console-formatted-" + result.type;
                popoverContentElement.style.whiteSpace = "pre";
                if (result.type === "string")
                    popoverContentElement.createTextChildren("\"", description, "\"");
                else
                    popoverContentElement.textContent = description;
                if (result.type === "function") {
                    result.functionDetails(didGetDetails.bind(this, result.target(), anchorElement, popoverContentElement));
                    return;
                }
                popover.showForAnchor(popoverContentElement, anchorElement);
            } else {
                if (result.subtype === "node") {
                    result.highlightAsDOMNode();
                    this._resultHighlightedAsDOM = result;
                }
                popoverContentElement = createElement("div");
                this._titleElement = createElement("div");
                this._titleElement.className = "source-frame-popover-title monospace";
                this._titleElement.textContent = description;
                popoverContentElement.appendChild(this._titleElement);

                var section = new WebInspector.ObjectPropertiesSection(result);
                // For HTML DOM wrappers, append "#id" to title, if not empty.
                if (description.substr(0, 4) === "HTML") {
                    this._sectionUpdateProperties = section.updateProperties.bind(section);
                    section.updateProperties = this._updateHTMLId.bind(this);
                }
                section.expanded = true;
                section.element.classList.add("source-frame-popover-tree");
                section.headerElement.classList.add("hidden");
                popoverContentElement.appendChild(section.element);

                const popoverWidth = 300;
                const popoverHeight = 250;
                popover.showForAnchor(popoverContentElement, anchorElement, popoverWidth, popoverHeight);
            }
        }
        this._queryObject(element, showObjectPopover.bind(this), this._popoverObjectGroup);
    },

    _onHideObjectPopover: function()
    {
        if (this._resultHighlightedAsDOM) {
            this._resultHighlightedAsDOM.target().domModel.hideDOMNodeHighlight();
            delete this._resultHighlightedAsDOM;
        }
        if (this._linkifier) {
            this._linkifier.reset();
            delete this._linkifier;
        }
        if (this._onHideCallback)
            this._onHideCallback();
        if (this._objectTarget) {
            this._objectTarget.runtimeAgent().releaseObjectGroup(this._popoverObjectGroup);
            delete this._objectTarget;
        }
    },

    _updateHTMLId: function(properties, rootTreeElementConstructor, rootPropertyComparer)
    {
        for (var i = 0; i < properties.length; ++i) {
            if (properties[i].name === "id") {
                if (properties[i].value.description)
                    this._titleElement.textContent += "#" + properties[i].value.description;
                break;
            }
        }
        this._sectionUpdateProperties(properties, rootTreeElementConstructor, rootPropertyComparer);
    },

    __proto__: WebInspector.PopoverHelper.prototype
}
