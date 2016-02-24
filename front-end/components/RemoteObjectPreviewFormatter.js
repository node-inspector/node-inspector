// Copyright (c) 2015 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

/**
 * @constructor
 */
WebInspector.RemoteObjectPreviewFormatter = function()
{
}

WebInspector.RemoteObjectPreviewFormatter.prototype = {
    /**
     * @param {!Element} parentElement
     * @param {!RuntimeAgent.ObjectPreview} preview
     * @return {boolean} true iff preview captured all information.
     */
    appendObjectPreview: function(parentElement, preview)
    {
        var description = preview.description;
        if (preview.type !== "object" || preview.subtype === "null") {
            parentElement.appendChild(this.renderPropertyPreview(preview.type, preview.subtype, description));
            return true;
        }
        if (description && preview.subtype !== "array") {
            var text = preview.subtype ? description : this._abbreviateFullQualifiedClassName(description);
            parentElement.createTextChildren(text, " ");
        }
        if (preview.entries)
            return this._appendEntriesPreview(parentElement, preview);
        return this._appendPropertiesPreview(parentElement, preview);
    },

    /**
     * @param {string} description
     * @return {string}
     */
    _abbreviateFullQualifiedClassName: function(description)
    {
        var abbreviatedDescription = description.split(".");
        for (var i = 0; i < abbreviatedDescription.length - 1; ++i)
            abbreviatedDescription[i] = abbreviatedDescription[i].trimMiddle(3);
        return abbreviatedDescription.join(".");
    },

    /**
     * @param {!Element} parentElement
     * @param {!RuntimeAgent.ObjectPreview} preview
     * @return {boolean} true iff preview captured all information.
     */
    _appendPropertiesPreview: function(parentElement, preview)
    {
        var isArray = preview.subtype === "array";
        var arrayLength = WebInspector.RemoteObject.arrayLength(preview);
        var properties = preview.properties;
        if (isArray)
            properties = properties.slice().stableSort(compareIndexesFirst);

        /**
         * @param {!RuntimeAgent.PropertyPreview} a
         * @param {!RuntimeAgent.PropertyPreview} b
         */
        function compareIndexesFirst(a, b)
        {
            var index1 = toArrayIndex(a.name);
            var index2 = toArrayIndex(b.name);
            if (index1 < 0)
                return index2 < 0 ? 0 : 1;
            return index2 < 0 ? -1 : index1 - index2;
        }

        /**
         * @param {string} name
         * @return {number}
         */
        function toArrayIndex(name)
        {
            var index = name >>> 0;
            if (String(index) === name && index < arrayLength)
                return index;
            return -1;
        }

        parentElement.createTextChild(isArray ? "[" : "{");
        for (var i = 0; i < properties.length; ++i) {
            if (i > 0)
                parentElement.createTextChild(", ");

            var property = properties[i];
            var name = property.name;
            if (!isArray || name != i || i >= arrayLength) {
                if (/^\s|\s$|^$|\n/.test(name))
                    parentElement.createChild("span", "name").createTextChildren("\"", name.replace(/\n/g, "\u21B5"), "\"");
                else
                    parentElement.createChild("span", "name").textContent = name;
                parentElement.createTextChild(": ");
            }

            parentElement.appendChild(this._renderPropertyPreviewOrAccessor([property]));
        }
        if (preview.overflow)
            parentElement.createChild("span").textContent = "\u2026";
        parentElement.createTextChild(isArray ? "]" : "}");
        return preview.lossless;
    },


    /**
     * @param {!Element} parentElement
     * @param {!RuntimeAgent.ObjectPreview} preview
     * @return {boolean} true iff preview captured all information.
     */
    _appendEntriesPreview: function(parentElement, preview)
    {
        var lossless = preview.lossless && !preview.properties.length;
        parentElement.createTextChild("{");
        for (var i = 0; i < preview.entries.length; ++i) {
            if (i > 0)
                parentElement.createTextChild(", ");

            var entry = preview.entries[i];
            if (entry.key) {
                this.appendObjectPreview(parentElement, entry.key);
                parentElement.createTextChild(" => ");
            }
            this.appendObjectPreview(parentElement, entry.value);
        }
        if (preview.overflow)
            parentElement.createChild("span").textContent = "\u2026";
        parentElement.createTextChild("}");
        return lossless;
    },


    /**
     * @param {!Array.<!RuntimeAgent.PropertyPreview>} propertyPath
     * @return {!Element}
     */
    _renderPropertyPreviewOrAccessor: function(propertyPath)
    {
        var property = propertyPath.peekLast();
        return this.renderPropertyPreview(property.type, /** @type {string} */ (property.subtype), property.value);
    },

    /**
     * @param {string} type
     * @param {string=} subtype
     * @param {string=} description
     * @return {!Element}
     */
    renderPropertyPreview: function(type, subtype, description)
    {
        var span = createElementWithClass("span", "object-value-" + (subtype || type));
        description = description || "";

        if (type === "function") {
            span.textContent = "function";
            return span;
        }

        if (type === "object" && subtype === "node" && description) {
            span.classList.add("object-value-preview-node");
            WebInspector.DOMPresentationUtils.createSpansForNodeTitle(span, description);
            return span;
        }

        if (type === "string") {
            span.createTextChildren("\"", description.replace(/\n/g, "\u21B5"), "\"");
            return span;
        }

        if (type === "object" && !subtype) {
            span.textContent = this._abbreviateFullQualifiedClassName(description);
            return span;
        }

        span.textContent = description;
        return span;
    }
}
