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
 * @param {WebInspector.LayerTreeModel} model
 */
WebInspector.Layers3DView = function(model)
{
    WebInspector.View.call(this);
    this.element.classList.add("fill");
    this.element.classList.add("layers-3d-view");
    this._emptyView = new WebInspector.EmptyView(WebInspector.UIString("Not in the composited mode.\nConsider forcing composited mode in Settings."));
    this._model = model;
    this._model.addEventListener(WebInspector.LayerTreeModel.Events.LayerTreeChanged, this._update, this);
    this._rotatingContainerElement = this.element.createChild("div", "fill rotating-container");
    this.element.addEventListener("mousemove", this._onMouseMove.bind(this), false);
    this.element.addEventListener("mouseout", this._onMouseMove.bind(this), false);
    this.element.addEventListener("mousedown", this._onMouseDown.bind(this), false);
    this.element.addEventListener("mouseup", this._onMouseUp.bind(this), false);
    this.element.addEventListener("contextmenu", this._onContextMenu.bind(this), false);
    this.element.addEventListener("click", this._onClick.bind(this), false);
    this._elementsByLayerId = {};
    this._rotateX = 0;
    this._rotateY = 0;
    this._scaleAdjustmentStylesheet = this.element.ownerDocument.head.createChild("style");
    this._scaleAdjustmentStylesheet.disabled = true;
    this._lastOutlinedElement = {};
}

/**
 * @enum {string}
 */
WebInspector.Layers3DView.OutlineType = {
    Hovered: "hovered",
    Selected: "selected"
}

/**
 * @enum {string}
 */
WebInspector.Layers3DView.Events = {
    LayerHovered: "LayerHovered",
    LayerSelected: "LayerSelected"
}

WebInspector.Layers3DView.prototype = {
    onResize: function()
    {
        this._update();
    },

    willHide: function()
    {
        this._scaleAdjustmentStylesheet.disabled = true;
    },

    wasShown: function()
    {
        this._scaleAdjustmentStylesheet.disabled = false;
        if (this._needsUpdate)
            this._update();
    },

    /**
     * @param {WebInspector.Layers3DView.OutlineType} type
     * @param {WebInspector.Layer?} layer
     */
    _setOutline: function(type, layer)
    {
        var element = layer ? this._elementForLayer(layer) : null;
        var previousElement = this._lastOutlinedElement[type];
        if (previousElement === element)
            return;
        this._lastOutlinedElement[type] = element;
        if (previousElement) {
            previousElement.removeStyleClass(type);
            this._updateElementColor(previousElement);
        }
        if (element) {
            element.addStyleClass(type);
            this._updateElementColor(element);
        }
    },

    /**
     * @param {WebInspector.Layer} layer
     */
    hoverLayer: function(layer)
    {
        this._setOutline(WebInspector.Layers3DView.OutlineType.Hovered, layer);
    },

    /**
     * @param {WebInspector.Layer} layer
     */
    selectLayer: function(layer)
    {
        this._setOutline(WebInspector.Layers3DView.OutlineType.Hovered, null);
        this._setOutline(WebInspector.Layers3DView.OutlineType.Selected, layer);
    },

    _scaleToFit: function()
    {
        var root = this._model.contentRoot();
        if (!root)
            return;
        const padding = 40;
        var scaleX = this._clientWidth / (root.width() + 2 * padding);
        var scaleY = this._clientHeight / (root.height() + 2 * padding);
        this._scale = Math.min(scaleX, scaleY);

        const screenLayerSpacing = 20;
        this._layerSpacing = Math.ceil(screenLayerSpacing / this._scale) + "px";
        const screenLayerThickness = 4;
        var layerThickness = Math.ceil(screenLayerThickness / this._scale) + "px";
        var stylesheetContent = ".layer-container .side-wall { height: " + layerThickness + "; width: " + layerThickness + "; } " +
            ".layer-container .back-wall { -webkit-transform: translateZ(-" + layerThickness + "); } " +
            ".layer-container { -webkit-transform: translateZ(" + this._layerSpacing + "); }";
        // Workaround for double style recalculation upon assignment to style sheet's text content.
        var stylesheetTextNode = this._scaleAdjustmentStylesheet.firstChild;
        if (!stylesheetTextNode || stylesheetTextNode.nodeType !== Node.TEXT_NODE || stylesheetTextNode.nextSibling)
            this._scaleAdjustmentStylesheet.textContent = stylesheetContent;
        else
            stylesheetTextNode.nodeValue = stylesheetContent;
        var element = this._elementForLayer(root);
        element.style.webkitTransform = "scale3d(" + this._scale + "," + this._scale + "," + this._scale + ")";
        element.style.left = ((this._clientWidth - root.width() * this._scale) >> 1) + "px";
        element.style.top = ((this._clientHeight - root.height() * this._scale) >> 1) + "px";
    },

    _update: function()
    {
        if (!this.isShowing()) {
            this._needsUpdate = true;
            return;
        }
        if (!this._model.contentRoot()) {
            this._emptyView.show(this.element);
            return;
        }
        this._emptyView.detach();
        function updateLayer(layer)
        {
            var element = this._elementForLayer(layer);
            this._updateLayerElement(element);
            for (var childElement = element.firstElementChild; childElement;) {
                var nextElement = childElement.nextSibling;
                if (childElement.__layer && !this._model.layerById(childElement.__layer.id()))
                    childElement.remove();
                childElement = nextElement;
            }
        }
        this._clientWidth = this.element.clientWidth;
        this._clientHeight = this.element.clientHeight;
        this._scaleToFit();
        this._model.forEachLayer(updateLayer.bind(this), this._model.contentRoot());
        this._needsUpdate = false;
    },

    /**
     * @param {WebInspector.Layer} layer
     * @return {Element}
     */
    _elementForLayer: function(layer)
    {
        var element = this._elementsByLayerId[layer.id()];
        if (element)
            return element;
        element = document.createElement("div");
        element.className = "layer-container";
        element.__layer = layer;
        ["fill back-wall", "side-wall top", "side-wall right", "side-wall bottom", "side-wall left"].forEach(element.createChild.bind(element, "div"));
        this._elementsByLayerId[layer.id()] = element;
        return element;
    },

    /**
     * @param {Element} element
     */
    _updateLayerElement: function(element)
    {
        var layer = element.__layer;
        var style = element.style;
        var isContentRoot = layer === this._model.contentRoot();
        var parentElement = isContentRoot ? this._rotatingContainerElement : this._elementForLayer(layer.parent());
        element.__depth = (parentElement.__depth || 0) + 1;
        element.enableStyleClass("invisible", layer.invisible());
        this._updateElementColor(element);
        if (parentElement !== element.parentElement)
            parentElement.appendChild(element);

        style.width  = layer.width() + "px";
        style.height  = layer.height() + "px";
        if (isContentRoot)
            return;

        style.left  = layer.offsetX() + "px";
        style.top  = layer.offsetY() + "px";
        var transform = layer.transform();
        if (transform) {
            function toFixed5(x)
            {
                return x.toFixed(5);
            }
            // Avoid exponential notation in CSS.
            style.webkitTransform = "matrix3d(" + transform.map(toFixed5).join(",") + ") translateZ(" + this._layerSpacing + ")";
            var anchor = layer.anchorPoint();
            style.webkitTransformOrigin = Math.round(anchor[0] * 100) + "% " + Math.round(anchor[1] * 100) + "% " + anchor[2];
        } else {
            style.webkitTransform = "";
            style.webkitTransformOrigin = "";
        }
    },

    /**
     * @param {Element} element
     */
    _updateElementColor: function(element)
    {
        var color;
        if (element === this._lastOutlinedElement[WebInspector.Layers3DView.OutlineType.Selected])
            color = WebInspector.Color.PageHighlight.Content.toString(WebInspector.Color.Format.RGBA) || "";
        else {
            const base = 144;
            var component = base + 20 * ((element.__depth - 1) % 5);
            color = "rgba(" + component + "," + component + "," + component + ", 0.8)";
        }
        element.style.backgroundColor = color;
    },

    /**
     * @param {Event} event
     */
    _onMouseDown: function(event)
    {
        if (event.which !== 1)
            return;
        this._setReferencePoint(event);
    },

    /**
     * @param {Event} event
     */
    _setReferencePoint: function(event)
    {
        this._originX = event.clientX;
        this._originY = event.clientY;
        this._oldRotateX = this._rotateX;
        this._oldRotateY = this._rotateY;
    },

    _resetReferencePoint: function()
    {
        delete this._originX;
        delete this._originY;
        delete this._oldRotateX;
        delete this._oldRotateY;
    },

    /**
     * @param {Event} event
     */
    _onMouseUp: function(event)
    {
        if (event.which !== 1)
            return;
        this._resetReferencePoint();
    },

    /**
     * @param {Event} event
     * @return {WebInspector.Layer?}
     */
    _layerFromEventPoint: function(event)
    {
        var element = this.element.ownerDocument.elementFromPoint(event.pageX, event.pageY);
        if (!element)
            return null;
        element = element.enclosingNodeOrSelfWithClass("layer-container");
        return element && element.__layer;
    },

    /**
     * @param {Event} event
     */
    _onMouseMove: function(event)
    {
        if (!event.which) {
            this.dispatchEventToListeners(WebInspector.Layers3DView.Events.LayerHovered, this._layerFromEventPoint(event));
            return;
        }
        if (event.which === 1) {
            // Set reference point if we missed mousedown.
            if (typeof this._originX !== "number")
                this._setReferencePoint(event);
            this._rotateX = this._oldRotateX + (this._originY - event.clientY) / 2;
            this._rotateY = this._oldRotateY - (this._originX - event.clientX) / 4;
            // Translate well to front so that no matter how we turn the plane, no parts of it goes below  parent.
            // This makes sure mouse events go to proper layers, not straight to the parent.
            this._rotatingContainerElement.style.webkitTransform = "translateZ(10000px) rotateX(" + this._rotateX + "deg) rotateY(" + this._rotateY + "deg)";
        }
    },

    /**
     * @param {Event} event
     */
    _onContextMenu: function(event)
    {
        var layer = this._layerFromEventPoint(event);
        var nodeId = layer && layer.nodeId();
        if (!nodeId)
            return;
        var domNode = WebInspector.domAgent.nodeForId(nodeId);
        if (!domNode)
            return;
        var contextMenu = new WebInspector.ContextMenu(event);
        contextMenu.appendApplicableItems(domNode);
        contextMenu.show();
    },

    _onClick: function(event)
    {
        this.dispatchEventToListeners(WebInspector.Layers3DView.Events.LayerSelected, this._layerFromEventPoint(event));
    },

    __proto__: WebInspector.View.prototype
}
