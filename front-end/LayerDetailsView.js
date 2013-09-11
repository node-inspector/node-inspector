/*
 * Copyright (C) 2013 Google Inc. All rights reserved.
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
 * @extends {WebInspector.View}
 */
WebInspector.LayerDetailsView = function()
{
    WebInspector.View.call(this);
    this.element.classList.add("fill");
    this.element.classList.add("layer-details-view");
    this._emptyView = new WebInspector.EmptyView(WebInspector.UIString("Select a layer to see its details"));
    this._createTable();
    this.showLayer(null);
}

/**
 * @type {Object.<string, string>}
 */
WebInspector.LayerDetailsView.CompositingReasonDetail = {
    "transform3D": WebInspector.UIString("Composition due to association with an element with a CSS 3D transform."),
    "video": WebInspector.UIString("Composition due to association with a <video> element."),
    "canvas": WebInspector.UIString("Composition due to the element being a <canvas> element."),
    "plugin": WebInspector.UIString("Composition due to association with a plugin."),
    "iFrame": WebInspector.UIString("Composition due to association with an <iframe> element."),
    "backfaceVisibilityHidden": WebInspector.UIString("Composition due to association with an element with a \"backface-visibility: hidden\" style."),
    "animation": WebInspector.UIString("Composition due to association with an animated element."),
    "filters": WebInspector.UIString("Composition due to association with an element with CSS filters applied."),
    "positionFixed": WebInspector.UIString("Composition due to association with an element with a \"position: fixed\" style."),
    "positionSticky": WebInspector.UIString("Composition due to association with an element with a \"position: sticky\" style."),
    "overflowScrollingTouch": WebInspector.UIString("Composition due to association with an element with a \"overflow-scrolling: touch\" style."),
    "blending": WebInspector.UIString("Composition due to association with an element that has blend mode other than \"normal\"."),
    "assumedOverlap": WebInspector.UIString("Composition due to association with an element that may overlap other composited elements."),
    "overlap": WebInspector.UIString("Composition due to association with an element overlapping other composited elements."),
    "negativeZIndexChildren": WebInspector.UIString("Composition due to association with an element with descendants that have a negative z-index."),
    "transformWithCompositedDescendants": WebInspector.UIString("Composition due to association with an element with composited descendants."),
    "opacityWithCompositedDescendants": WebInspector.UIString("Composition due to association with an element with opacity applied and composited descendants."),
    "maskWithCompositedDescendants": WebInspector.UIString("Composition due to association with a masked element and composited descendants."),
    "reflectionWithCompositedDescendants": WebInspector.UIString("Composition due to association with an element with a reflection and composited descendants."),
    "filterWithCompositedDescendants": WebInspector.UIString("Composition due to association with an element with CSS filters applied and composited descendants."),
    "blendingWithCompositedDescendants": WebInspector.UIString("Composition due to association with an element with CSS blending applied and composited descendants."),
    "clipsCompositingDescendants": WebInspector.UIString("Composition due to association with an element clipping compositing descendants."),
    "perspective": WebInspector.UIString("Composition due to association with an element with perspective applied."),
    "preserve3D": WebInspector.UIString("Composition due to association with an element with a \"transform-style: preserve-3d\" style."),
    "root": WebInspector.UIString("Root layer."),
    "layerForClip": WebInspector.UIString("Layer for clip."),
    "layerForScrollbar": WebInspector.UIString("Layer for scrollbar."),
    "layerForScrollingContainer": WebInspector.UIString("Layer for scrolling container."),
    "layerForForeground": WebInspector.UIString("Layer for foreground."),
    "layerForBackground": WebInspector.UIString("Layer for background."),
    "layerForMask": WebInspector.UIString("Layer for mask."),
    "layerForVideoOverlay": WebInspector.UIString("Layer for video overlay.")
};

WebInspector.LayerDetailsView.prototype = {
    /**
     * @param {WebInspector.Layer} layer
     */
    showLayer: function(layer)
    {
        if (!layer) {
            this._tableElement.remove();
            this._emptyView.show(this.element);
            return;
        }
        this._emptyView.detach();
        this.element.appendChild(this._tableElement);
        this._positionCell.textContent = WebInspector.UIString("%d,%d", layer.offsetX(), layer.offsetY());
        this._sizeCell.textContent = WebInspector.UIString("%d × %d", layer.width(), layer.height());
        this._paintCountCell.textContent = layer.paintCount();
        const bytesPerPixel = 4;
        this._memoryEstimateCell.textContent = Number.bytesToString(layer.invisible() ? 0 : layer.width() * layer.height() * bytesPerPixel);
        layer.requestCompositingReasons(this._updateCompositingReasons.bind(this));
    },

    _createTable: function()
    {
        this._tableElement = this.element.createChild("table");
        this._tbodyElement = this._tableElement.createChild("tbody");
        this._positionCell = this._createRow(WebInspector.UIString("Position in parent:"));
        this._sizeCell = this._createRow(WebInspector.UIString("Size:"));
        this._compositingReasonsCell = this._createRow(WebInspector.UIString("Compositing Reasons:"));
        this._memoryEstimateCell = this._createRow(WebInspector.UIString("Memory estimate:"));
        this._paintCountCell = this._createRow(WebInspector.UIString("Paint count:"));
    },

    /**
     * @param {string} title
     */
    _createRow: function(title)
    {
        var tr = this._tbodyElement.createChild("tr");
        var titleCell = tr.createChild("td");
        titleCell.textContent = title;
        return tr.createChild("td");
    },

    /**
     * @param {Array.<string>} compositingReasons
     */
    _updateCompositingReasons: function(compositingReasons)
    {
        if (!compositingReasons || !compositingReasons.length) {
            this._compositingReasonsCell.textContent = "n/a";
            return;
        }
        var fragment = document.createDocumentFragment();
        for (var i = 0; i < compositingReasons.length; ++i) {
            if (i)
                fragment.appendChild(document.createTextNode(","));
            var span = document.createElement("span");
            span.title = WebInspector.LayerDetailsView.CompositingReasonDetail[compositingReasons[i]] || "";
            span.textContent = compositingReasons[i];
            fragment.appendChild(span);
        }
        this._compositingReasonsCell.removeChildren();
        this._compositingReasonsCell.appendChild(fragment);
    },

    __proto__: WebInspector.View.prototype
}
