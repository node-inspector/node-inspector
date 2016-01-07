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
 * @param {!WebInspector.LayerViewHost} layerViewHost
 * @extends {WebInspector.Widget}
 * @implements {WebInspector.LayerView}
 */
WebInspector.LayerDetailsView = function(layerViewHost)
{
    WebInspector.Widget.call(this);
    this.element.classList.add("layer-details-view");
    this._layerViewHost = layerViewHost;
    this._layerViewHost.registerView(this);
    this._emptyWidget = new WebInspector.EmptyWidget(WebInspector.UIString("Select a layer to see its details"));
    this._buildContent();
}

/**
 * @enum {string}
 */
WebInspector.LayerDetailsView.Events = {
    PaintProfilerRequested: "PaintProfilerRequested"
}

/**
 * @type {!Object.<string, string>}
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
    // FIXME: Can we remove this entry now that position: sticky has been removed?
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
    "layerForVideoOverlay": WebInspector.UIString("Layer for video overlay."),
};

WebInspector.LayerDetailsView.prototype = {
    /**
     * @param {?WebInspector.LayerView.Selection} selection
     * @override
     */
    hoverObject: function(selection) { },

    /**
     * @param {?WebInspector.LayerView.Selection} selection
     * @override
     */
    selectObject: function(selection)
    {
        this._selection = selection;
        if (this.isShowing())
            this.update();
    },

    /**
     * @param {?WebInspector.LayerTreeBase} layerTree
     * @override
     */
    setLayerTree: function(layerTree) { },

    wasShown: function()
    {
        WebInspector.Widget.prototype.wasShown.call(this);
        this.update();
    },

    /**
     * @param {number} index
     * @param {!Event} event
     */
    _onScrollRectClicked: function(index, event)
    {
        if (event.which !== 1)
            return;
        this._layerViewHost.selectObject(new WebInspector.LayerView.ScrollRectSelection(this._selection.layer(), index));
    },

    _onPaintProfilerButtonClicked: function()
    {
        var traceEvent = this._selection.type() === WebInspector.LayerView.Selection.Type.Tile ? /** @type {!WebInspector.LayerView.TileSelection} */ (this._selection).traceEvent() : null;
        this.dispatchEventToListeners(WebInspector.LayerDetailsView.Events.PaintProfilerRequested, traceEvent);
    },

    /**
     * @param {!LayerTreeAgent.ScrollRect} scrollRect
     * @param {number} index
     */
    _createScrollRectElement: function(scrollRect, index)
    {
        if (index)
            this._scrollRectsCell.createTextChild(", ");
        var element = this._scrollRectsCell.createChild("span", "scroll-rect");
        if (this._selection.scrollRectIndex === index)
            element.classList.add("active");
        element.textContent = WebInspector.LayerTreeModel.ScrollRectType[scrollRect.type].description + " (" + scrollRect.rect.x + ", " + scrollRect.rect.y +
            ", " + scrollRect.rect.width + ", " + scrollRect.rect.height + ")";
        element.addEventListener("click", this._onScrollRectClicked.bind(this, index), false);
    },

    update: function()
    {
        var layer = this._selection && this._selection.layer();
        if (!layer) {
            this._tableElement.remove();
            this._paintProfilerButton.remove();
            this._emptyWidget.show(this.element);
            return;
        }
        this._emptyWidget.detach();
        this.element.appendChild(this._tableElement);
        this.element.appendChild(this._paintProfilerButton);
        this._sizeCell.textContent = WebInspector.UIString("%d × %d (at %d,%d)", layer.width(), layer.height(), layer.offsetX(), layer.offsetY());
        this._paintCountCell.parentElement.classList.toggle("hidden", !layer.paintCount());
        this._paintCountCell.textContent = layer.paintCount();
        this._memoryEstimateCell.textContent = Number.bytesToString(layer.gpuMemoryUsage());
        layer.requestCompositingReasons(this._updateCompositingReasons.bind(this));
        this._scrollRectsCell.removeChildren();
        layer.scrollRects().forEach(this._createScrollRectElement.bind(this));
        var traceEvent = this._selection.type() === WebInspector.LayerView.Selection.Type.Tile ? /** @type {!WebInspector.LayerView.TileSelection} */ (this._selection).traceEvent() : null;
        this._paintProfilerButton.classList.toggle("hidden", !traceEvent);
    },

    _buildContent: function()
    {
        this._tableElement = this.element.createChild("table");
        this._tbodyElement = this._tableElement.createChild("tbody");
        this._sizeCell = this._createRow(WebInspector.UIString("Size"));
        this._compositingReasonsCell = this._createRow(WebInspector.UIString("Compositing Reasons"));
        this._memoryEstimateCell = this._createRow(WebInspector.UIString("Memory estimate"));
        this._paintCountCell = this._createRow(WebInspector.UIString("Paint count"));
        this._scrollRectsCell = this._createRow(WebInspector.UIString("Slow scroll regions"));
        this._paintProfilerButton = this.element.createChild("a", "hidden link");
        this._paintProfilerButton.textContent = WebInspector.UIString("Paint Profiler");
        this._paintProfilerButton.addEventListener("click", this._onPaintProfilerButtonClicked.bind(this));
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
     * @param {!Array.<string>} compositingReasons
     */
    _updateCompositingReasons: function(compositingReasons)
    {
        if (!compositingReasons || !compositingReasons.length) {
            this._compositingReasonsCell.textContent = "n/a";
            return;
        }
        this._compositingReasonsCell.removeChildren();
        var list = this._compositingReasonsCell.createChild("ul");
        for (var i = 0; i < compositingReasons.length; ++i) {
            var text = WebInspector.LayerDetailsView.CompositingReasonDetail[compositingReasons[i]] || compositingReasons[i];
            // If the text is more than one word but does not terminate with period, add the period.
            if (/\s.*[^.]$/.test(text))
                text += ".";
            list.createChild("li").textContent = text;
        }
    },

    __proto__: WebInspector.Widget.prototype
}
