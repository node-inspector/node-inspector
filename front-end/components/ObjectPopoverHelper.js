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
     * @param {!Element} element
     * @param {!WebInspector.Popover} popover
     */
    _showObjectPopover: function(element, popover)
    {
        /**
         * @param {!WebInspector.RemoteObject} funcObject
         * @param {!Element} popoverContentElement
         * @param {!Element} anchorElement
         * @param {?Array.<!WebInspector.RemoteObjectProperty>} properties
         * @param {?Array.<!WebInspector.RemoteObjectProperty>} internalProperties
         * @this {WebInspector.ObjectPopoverHelper}
         */
        function didGetFunctionProperties(funcObject, popoverContentElement, anchorElement, properties, internalProperties)
        {
            if (internalProperties) {
                for (var i = 0; i < internalProperties.length; i++) {
                    if (internalProperties[i].name === "[[TargetFunction]]") {
                        funcObject = internalProperties[i].value;
                        break;
                    }
                }
            }
            funcObject.functionDetails(didGetFunctionDetails.bind(this, popoverContentElement, anchorElement));
        }

        /**
         * @param {!Element} popoverContentElement
         * @param {!Element} anchorElement
         * @param {?WebInspector.DebuggerModel.FunctionDetails} response
         * @this {WebInspector.ObjectPopoverHelper}
         */
        function didGetFunctionDetails(popoverContentElement, anchorElement, response)
        {
            if (!response || popover.disposed)
                return;

            var container = createElementWithClass("div", "object-popover-container");
            var title = container.createChild("div", "function-popover-title source-code");
            var functionName = title.createChild("span", "function-name");
            functionName.textContent = WebInspector.beautifyFunctionName(response.functionName);

            var rawLocation = response.location;
            var sourceURL = response.sourceURL;
            if (rawLocation && sourceURL) {
                var link = this._lazyLinkifier().linkifyRawLocation(rawLocation, sourceURL, "function-location-link");
                title.appendChild(link);
            }

            container.appendChild(popoverContentElement);
            popover.showForAnchor(container, anchorElement);
        }

        /**
         * @param {?WebInspector.DebuggerModel.GeneratorObjectDetails} response
         * @this {WebInspector.ObjectPopoverHelper}
         */
        function didGetGeneratorObjectDetails(response)
        {
            if (!response || popover.disposed)
                return;

            var rawLocation = response.location;
            var sourceURL = response.sourceURL;
            if (rawLocation && sourceURL) {
                var link = this._lazyLinkifier().linkifyRawLocation(rawLocation, sourceURL, "function-location-link");
                this._titleElement.appendChild(link);
            }
        }

        /**
         * @param {!WebInspector.RemoteObject} result
         * @param {boolean} wasThrown
         * @param {!Element=} anchorOverride
         * @this {WebInspector.ObjectPopoverHelper}
         */
        function didQueryObject(result, wasThrown, anchorOverride)
        {
            if (popover.disposed)
                return;
            if (wasThrown) {
                this.hidePopover();
                return;
            }
            this._objectTarget = result.target();
            var anchorElement = anchorOverride || element;
            var description = result.description.trimEnd(WebInspector.ObjectPopoverHelper.MaxPopoverTextLength);
            var popoverContentElement = null;
            if (result.type !== "object") {
                popoverContentElement =  createElement("span");
                popoverContentElement.appendChild(WebInspector.Widget.createStyleElement("components/objectValue.css"));
                var valueElement = popoverContentElement.createChild("span", "monospace object-value-" + result.type);
                valueElement.style.whiteSpace = "pre";

                if (result.type === "string")
                    valueElement.createTextChildren("\"", description, "\"");
                else if (result.type === "function")
                    WebInspector.ObjectPropertiesSection.formatObjectAsFunction(result, valueElement, true);
                else
                    valueElement.textContent = description;

                if (result.type === "function") {
                    result.getOwnProperties(didGetFunctionProperties.bind(this, result, popoverContentElement, anchorElement));
                    return;
                }
                popover.showForAnchor(popoverContentElement, anchorElement);
            } else {
                if (result.subtype === "node") {
                    WebInspector.DOMModel.highlightObjectAsDOMNode(result);
                    this._resultHighlightedAsDOM = true;
                }

                if (result.customPreview()) {
                    var customPreviewComponent = new WebInspector.CustomPreviewComponent(result);
                    customPreviewComponent.expandIfPossible();
                    popoverContentElement = customPreviewComponent.element;
                } else {
                    popoverContentElement = createElement("div");
                    this._titleElement = popoverContentElement.createChild("div", "monospace");
                    this._titleElement.createChild("span", "source-frame-popover-title").textContent = description;
                    var section = new WebInspector.ObjectPropertiesSection(result, "");
                    section.element.classList.add("source-frame-popover-tree");
                    section.titleLessMode();
                    popoverContentElement.appendChild(section.element);

                    if (result.subtype === "generator")
                        result.generatorObjectDetails(didGetGeneratorObjectDetails.bind(this));
                }
                var popoverWidth = 300;
                var popoverHeight = 250;
                popover.showForAnchor(popoverContentElement, anchorElement, popoverWidth, popoverHeight);
            }
        }

        this._queryObject(element, didQueryObject.bind(this), this._popoverObjectGroup);
    },

    _onHideObjectPopover: function()
    {
        if (this._resultHighlightedAsDOM) {
            WebInspector.DOMModel.hideDOMNodeHighlight();
            delete this._resultHighlightedAsDOM;
        }
        if (this._linkifier) {
            this._linkifier.dispose();
            delete this._linkifier;
        }
        if (this._onHideCallback)
            this._onHideCallback();
        if (this._objectTarget) {
            this._objectTarget.runtimeAgent().releaseObjectGroup(this._popoverObjectGroup);
            delete this._objectTarget;
        }
    },

    /**
     * @return {!WebInspector.Linkifier}
     */
    _lazyLinkifier: function()
    {
        if (!this._linkifier)
            this._linkifier = new WebInspector.Linkifier();
        return this._linkifier;
    },

    __proto__: WebInspector.PopoverHelper.prototype
}
