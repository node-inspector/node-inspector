// Copyright 2014 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

/**
 * @constructor
 * @param {!WebInspector.RemoteObject} object
 */
WebInspector.CustomPreviewSection = function(object)
{
    this._sectionElement = createElementWithClass("span", "custom-expandable-section");
    this._object = object;
    this._expanded = false;
    this._cachedContent = null;
    var customPreview = object.customPreview();

    try {
        var headerJSON = JSON.parse(customPreview.header);
    } catch (e) {
        WebInspector.console.error("Broken formatter: header is invalid json " + e);
        return;
    }
    this._header = this._renderJSONMLTag(headerJSON);
    if (this._header.nodeType === Node.TEXT_NODE) {
        WebInspector.console.error("Broken formatter: header should be an element node.");
        return;
    }

    if (customPreview.hasBody) {
        this._header.classList.add("custom-expandable-section-header");
        this._header.addEventListener("click", this._onClick.bind(this), false);
    }

    this._sectionElement.appendChild(this._header);
}

/**
 * @constructor
 * @param {!WebInspector.RemoteObject} object
 */
WebInspector.CustomPreviewComponent = function(object)
{
    this._object = object;
    this._customPreviewSection = new WebInspector.CustomPreviewSection(object);
    this.element  = createElementWithClass("span", "source-code");
    var shadowRoot = WebInspector.createShadowRootWithCoreStyles(this.element);
    this.element.addEventListener("contextmenu", this._contextMenuEventFired.bind(this), false);
    shadowRoot.appendChild(WebInspector.Widget.createStyleElement("components/customPreviewSection.css"));
    shadowRoot.appendChild(this._customPreviewSection.element());
}

WebInspector.CustomPreviewComponent.prototype = {
    expandIfPossible: function()
    {
        if (this._object.customPreview().hasBody && this._customPreviewSection)
            this._customPreviewSection._loadBody();
    },

    /**
     * @param {!Event} event
     */
    _contextMenuEventFired: function(event)
    {
        var contextMenu = new WebInspector.ContextMenu(event);
        if (this._customPreviewSection)
            contextMenu.appendItem(WebInspector.UIString.capitalize("Show as Javascript ^object" ), this._disassemble.bind(this));
        contextMenu.appendApplicableItems(this._object);
        contextMenu.show();
    },

    _disassemble: function()
    {
        this.element.shadowRoot.textContent = "";
        this._customPreviewSection = null;
        this.element.shadowRoot.appendChild(WebInspector.ObjectPropertiesSection.defaultObjectPresentation(this._object));
    }
}

WebInspector.CustomPreviewSection._tagsWhiteList = new Set(["span", "div", "ol", "li","table", "tr", "td"]);

WebInspector.CustomPreviewSection.prototype = {

    /**
     * @return {!Element}
     */
    element: function()
    {
        return this._sectionElement;
    },

    /**
     * @param {*} jsonML
     * @return {!Node}
     */
    _renderJSONMLTag: function(jsonML)
    {
        if (!Array.isArray(jsonML))
            return createTextNode(jsonML + "");

        var array = /** @type {!Array.<*>} */(jsonML);
        if (array[0] === "object")
            return this._layoutObjectTag(array);
        else
            return this._renderElement(array);
    },

    /**
     *
     * @param {!Array.<*>} object
     * @return {!Node}
     */
    _renderElement: function(object)
    {
        var tagName = object.shift();
        if (!WebInspector.CustomPreviewSection._tagsWhiteList.has(tagName)) {
            WebInspector.console.error("Broken formatter: element " + tagName + " is not allowed!");
            return createElement("span");
        }
        var element = createElement(/** @type {string} */ (tagName));
        if ((typeof object[0] == "object") && !Array.isArray(object[0])) {
            var attributes = object.shift();
            for (var key in attributes) {
                var value = attributes[key];
                if ((key !== "style") || (typeof value !== "string"))
                    continue;

                element.setAttribute(key, value);
            }
        }

        this._appendJsonMLTags(element, object);
        return element;
    },

    /**
     * @param {!Array.<*>} objectTag
     * @return {!Node}
     */
    _layoutObjectTag: function(objectTag)
    {
        objectTag.shift();
        var attributes = objectTag.shift();
        var remoteObject = this._object.target().runtimeModel.createRemoteObject(/** @type {!RuntimeAgent.RemoteObject} */ (attributes));
        if (remoteObject.customPreview())
            return (new WebInspector.CustomPreviewSection(remoteObject)).element();

        var sectionElement = WebInspector.ObjectPropertiesSection.defaultObjectPresentation(remoteObject);
        sectionElement.classList.toggle("custom-expandable-section-standard-section", remoteObject.hasChildren);
        return sectionElement;
    },

    /**
     * @param {!Node} parentElement
     * @param {!Array.<*>} jsonMLTags
     */
    _appendJsonMLTags: function(parentElement, jsonMLTags)
    {
        for (var i = 0; i < jsonMLTags.length; ++i)
            parentElement.appendChild(this._renderJSONMLTag(jsonMLTags[i]));
    },

    /**
     * @param {!Event} event
     */
    _onClick: function(event)
    {
        event.consume(true);
        if (this._cachedContent)
            this._toggleExpand();
        else
            this._loadBody();
    },

    _toggleExpand: function()
    {
        this._expanded = !this._expanded;
        this._header.classList.toggle("expanded", this._expanded);
        this._cachedContent.classList.toggle("hidden", !this._expanded);
    },

    _loadBody: function()
    {
        /**
         * @suppressReceiverCheck
         * @suppressGlobalPropertiesCheck
         * @suppress {undefinedVars}
         * @this {Object}
         * @param {*=} formatter
         * @param {*=} config
         */
        function load(formatter, config)
        {
            /**
             * @param {*} jsonMLObject
             * @throws {string} error message
             */
            function substituteObjectTagsInCustomPreview(jsonMLObject)
            {
                if (!jsonMLObject || (typeof jsonMLObject !== "object") || (typeof jsonMLObject.splice !== "function"))
                    return;

                var obj = jsonMLObject.length;
                if (!(typeof obj === "number" && obj >>> 0 === obj && (obj > 0 || 1 / obj > 0)))
                    return;

                var startIndex = 1;
                if (jsonMLObject[0] === "object") {
                    var attributes = jsonMLObject[1];
                    var originObject = attributes["object"];
                    var config = attributes["config"];
                    if (typeof originObject === "undefined")
                        throw "Illegal format: obligatory attribute \"object\" isn't specified";

                    jsonMLObject[1] = bindRemoteObject(originObject, false, false, null, false, config);
                    startIndex = 2;
                }
                for (var i = startIndex; i < jsonMLObject.length; ++i)
                    substituteObjectTagsInCustomPreview(jsonMLObject[i]);
            }

            try {
                var body = formatter.body(this, config);
                substituteObjectTagsInCustomPreview(body);
                return body;
            } catch (e) {
                console.error("Custom Formatter Failed: " + e);
                return null;
            }
        }

        var customPreview = this._object.customPreview();
        var args = [{objectId: customPreview.formatterObjectId}];
        if (customPreview.configObjectId)
            args.push({objectId: customPreview.configObjectId});
        this._object.callFunctionJSON(load, args, onBodyLoaded.bind(this));

        /**
         * @param {*} bodyJsonML
         * @this {WebInspector.CustomPreviewSection}
         */
        function onBodyLoaded(bodyJsonML)
        {
            if (!bodyJsonML)
                return;

            this._cachedContent = this._renderJSONMLTag(bodyJsonML);
            this._sectionElement.appendChild(this._cachedContent);
            this._toggleExpand();
        }
    }
}
