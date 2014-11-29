/*
 * Copyright (C) 2014 Google Inc. All rights reserved.
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
 * @extends {WebInspector.VBox}
 */
WebInspector.Layers3DView = function()
{
    WebInspector.VBox.call(this);
    this.element.classList.add("layers-3d-view");
    this._emptyView = new WebInspector.EmptyView(WebInspector.UIString("Layer information is not yet available."));

    this._transformController = new WebInspector.TransformController(this.element);
    this._transformController.addEventListener(WebInspector.TransformController.Events.TransformChanged, this._update, this);
    this._initStatusBar();

    this._canvasElement = this.element.createChild("canvas");
    this._canvasElement.tabIndex = 0;
    this._canvasElement.addEventListener("dblclick", this._onDoubleClick.bind(this), false);
    this._canvasElement.addEventListener("mousedown", this._onMouseDown.bind(this), false);
    this._canvasElement.addEventListener("mouseup", this._onMouseUp.bind(this), false);
    this._canvasElement.addEventListener("mouseleave", this._onMouseMove.bind(this), false);
    this._canvasElement.addEventListener("mousemove", this._onMouseMove.bind(this), false);
    this._canvasElement.addEventListener("contextmenu", this._onContextMenu.bind(this), false);

    this._lastSelection = {};
    this._picturesForLayer = {};
    this._scrollRectQuadsForLayer = {};
    this._isVisible = {};
    this._layerTree = null;
    this._textureManager = new WebInspector.LayerTextureManager();
    this._textureManager.addEventListener(WebInspector.LayerTextureManager.Events.TextureUpdated, this._update, this);
    /** @type Array.<!WebGLTexture|undefined> */
    this._chromeTextures = [];

    WebInspector.settings.showPaintRects.addChangeListener(this._update, this);
}

/** @typedef {{borderColor: !Array.<number>, borderWidth: number}} */
WebInspector.Layers3DView.LayerStyle;

/** @typedef {{layerId: string, rect: !Array.<number>, snapshot: !WebInspector.PaintProfilerSnapshot, traceEvent: !WebInspector.TracingModel.Event}} */
WebInspector.Layers3DView.PaintTile;

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
    ObjectHovered: "ObjectHovered",
    ObjectSelected: "ObjectSelected",
    LayerSnapshotRequested: "LayerSnapshotRequested",
    PaintProfilerRequested: "PaintProfilerRequested"
}

/**
 * @enum {number}
 */
WebInspector.Layers3DView.ChromeTexture = {
    Left: 0,
    Middle: 1,
    Right: 2
}

/**
 * @enum {string}
 */
WebInspector.Layers3DView.ScrollRectTitles = {
    RepaintsOnScroll: WebInspector.UIString("repaints on scroll"),
    TouchEventHandler: WebInspector.UIString("touch event listener"),
    WheelEventHandler: WebInspector.UIString("mousewheel event listener")
}

WebInspector.Layers3DView.FragmentShader = "" +
    "precision mediump float;\n" +
    "varying vec4 vColor;\n" +
    "varying vec2 vTextureCoord;\n" +
    "uniform sampler2D uSampler;\n" +
    "void main(void)\n" +
    "{\n" +
    "    gl_FragColor = texture2D(uSampler, vec2(vTextureCoord.s, vTextureCoord.t)) * vColor;\n" +
    "}";

WebInspector.Layers3DView.VertexShader = "" +
    "attribute vec3 aVertexPosition;\n" +
    "attribute vec2 aTextureCoord;\n" +
    "attribute vec4 aVertexColor;\n" +
    "uniform mat4 uPMatrix;\n" +
    "varying vec2 vTextureCoord;\n" +
    "varying vec4 vColor;\n" +
    "void main(void)\n" +
    "{\n" +
        "gl_Position = uPMatrix * vec4(aVertexPosition, 1.0);\n" +
        "vColor = aVertexColor;\n" +
        "vTextureCoord = aTextureCoord;\n" +
    "}";

WebInspector.Layers3DView.HoveredBorderColor = [0, 0, 255, 1];
WebInspector.Layers3DView.SelectedBorderColor = [0, 255, 0, 1];
WebInspector.Layers3DView.BorderColor = [0, 0, 0, 1];
WebInspector.Layers3DView.ViewportBorderColor = [160, 160, 160, 1];
WebInspector.Layers3DView.ScrollRectBackgroundColor = [178, 100, 100, 0.6];
WebInspector.Layers3DView.HoveredImageMaskColor = [200, 200, 255, 1];
WebInspector.Layers3DView.BorderWidth = 1;
WebInspector.Layers3DView.SelectedBorderWidth = 2;
WebInspector.Layers3DView.ViewportBorderWidth = 3;

WebInspector.Layers3DView.LayerSpacing = 20;
WebInspector.Layers3DView.ScrollRectSpacing = 4;

WebInspector.Layers3DView.prototype = {
    /**
     * @param {?WebInspector.LayerTreeBase} layerTree
     */
    setLayerTree: function(layerTree)
    {
        this._layerTree = layerTree;
        this._textureManager.reset();
        this._update();
    },

    /**
     * @param {?Array.<!WebInspector.Layers3DView.PaintTile>} tiles
     */
    setTiles: function(tiles)
    {
        this._textureManager.setTiles(tiles);
    },

    /**
     * @param {!WebInspector.Layer} layer
     * @param {string=} imageURL
     */
    showImageForLayer: function(layer, imageURL)
    {
        if (imageURL)
            this._textureManager.createTexture(onTextureCreated.bind(this), imageURL);
        else
            onTextureCreated.call(this, null);

        /**
         * @this {WebInspector.Layers3DView}
         * @param {?WebGLTexture} texture
         */
        function onTextureCreated(texture)
        {
            this._layerTexture = texture ? {layerId: layer.id(), texture: texture} : null;
            this._update();
        }
    },

    onResize: function()
    {
        this._update();
    },

    wasShown: function()
    {
        if (this._needsUpdate)
            this._update();
    },

    /**
     * @param {!WebInspector.Layers3DView.OutlineType} type
     * @param {?WebInspector.Layers3DView.Selection} selection
     */
    _setOutline: function(type, selection)
    {
        this._lastSelection[type] = selection;
        this._update();
    },

    /**
     * @param {?WebInspector.Layers3DView.Selection} selection
     */
    hoverObject: function(selection)
    {
        this._setOutline(WebInspector.Layers3DView.OutlineType.Hovered, selection);
    },

    /**
     * @param {?WebInspector.Layers3DView.Selection} selection
     */
    selectObject: function(selection)
    {
        this._setOutline(WebInspector.Layers3DView.OutlineType.Hovered, null);
        this._setOutline(WebInspector.Layers3DView.OutlineType.Selected, selection);
    },

    /**
     * @param {!Element} canvas
     * @return {!WebGLRenderingContext}
     */
    _initGL: function(canvas)
    {
        var gl = canvas.getContext("webgl");
        gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
        gl.enable(gl.BLEND);
        gl.clearColor(0.0, 0.0, 0.0, 0.0);
        gl.enable(gl.DEPTH_TEST);
        return gl;
    },

    /**
     * @param {!Object} type
     * @param {string} script
     */
    _createShader: function(type, script)
    {
        var shader = this._gl.createShader(type);
        this._gl.shaderSource(shader, script);
        this._gl.compileShader(shader);
        this._gl.attachShader(this._shaderProgram, shader);
    },

    _initShaders: function()
    {
        this._shaderProgram = this._gl.createProgram();
        this._createShader(this._gl.FRAGMENT_SHADER, WebInspector.Layers3DView.FragmentShader);
        this._createShader(this._gl.VERTEX_SHADER, WebInspector.Layers3DView.VertexShader);
        this._gl.linkProgram(this._shaderProgram);
        this._gl.useProgram(this._shaderProgram);

        this._shaderProgram.vertexPositionAttribute = this._gl.getAttribLocation(this._shaderProgram, "aVertexPosition");
        this._gl.enableVertexAttribArray(this._shaderProgram.vertexPositionAttribute);
        this._shaderProgram.vertexColorAttribute = this._gl.getAttribLocation(this._shaderProgram, "aVertexColor");
        this._gl.enableVertexAttribArray(this._shaderProgram.vertexColorAttribute);
        this._shaderProgram.textureCoordAttribute = this._gl.getAttribLocation(this._shaderProgram, "aTextureCoord");
        this._gl.enableVertexAttribArray(this._shaderProgram.textureCoordAttribute);

        this._shaderProgram.pMatrixUniform = this._gl.getUniformLocation(this._shaderProgram, "uPMatrix");
        this._shaderProgram.samplerUniform = this._gl.getUniformLocation(this._shaderProgram, "uSampler");
    },

    _resizeCanvas: function()
    {
        this._canvasElement.width = this._canvasElement.offsetWidth * window.devicePixelRatio;
        this._canvasElement.height = this._canvasElement.offsetHeight * window.devicePixelRatio;
        this._gl.viewportWidth = this._canvasElement.width;
        this._gl.viewportHeight = this._canvasElement.height;
    },

    _updateTransformAndConstraints: function()
    {
        var paddingFraction = 0.1;
        var viewport = this._layerTree.viewportSize();
        var root = this._layerTree.contentRoot() || this._layerTree.root();
        var baseWidth = viewport ? viewport.width : root.width();
        var baseHeight = viewport ? viewport.height : root.height();
        var canvasWidth = this._canvasElement.width;
        var canvasHeight = this._canvasElement.height;
        var paddingX = canvasWidth * paddingFraction;
        var paddingY = canvasHeight * paddingFraction;
        var scaleX = (canvasWidth - 2 * paddingX) / baseWidth;
        var scaleY = (canvasHeight - 2 * paddingY) / baseHeight;
        var viewScale = Math.min(scaleX, scaleY);
        var minScaleConstraint = Math.min(baseWidth / root.width(), baseHeight / root.height()) / 2;
        this._transformController.setScaleConstraints(minScaleConstraint, 10 / viewScale); // 1/viewScale is 1:1 in terms of pixels, so allow zooming to 10x of native size
        var scale = this._transformController.scale();
        var rotateX = this._transformController.rotateX();
        var rotateY = this._transformController.rotateY();
        this._scale = scale * viewScale;
        var scaleAndRotationMatrix = new WebKitCSSMatrix().scale(scale, scale, scale).translate(canvasWidth / 2, canvasHeight / 2, 0)
            .rotate(rotateX, rotateY, 0).scale(viewScale, viewScale, viewScale).translate(-baseWidth / 2, -baseHeight / 2, 0);

        var bounds;
        for (var i = 0; i < this._rects.length; ++i)
            bounds = WebInspector.Geometry.boundsForTransformedPoints(scaleAndRotationMatrix, this._rects[i].vertices, bounds);

        this._transformController.clampOffsets((paddingX - bounds.maxX) / window.devicePixelRatio, (canvasWidth - paddingX - bounds.minX) / window.devicePixelRatio,
                                               (paddingY - bounds.maxY) / window.devicePixelRatio, (canvasHeight - paddingY - bounds.minY) / window.devicePixelRatio);
        var offsetX = this._transformController.offsetX() * window.devicePixelRatio;
        var offsetY = this._transformController.offsetY() * window.devicePixelRatio;
        // Multiply to translation matrix on the right rather than translate (which would implicitly multiply on the left).
        this._projectionMatrix = new WebKitCSSMatrix().translate(offsetX, offsetY, 0).multiply(scaleAndRotationMatrix);

        var glProjectionMatrix = new WebKitCSSMatrix().scale(1, -1, -1).translate(-1, -1, 0)
            .scale(2 / this._canvasElement.width, 2 / this._canvasElement.height, 1 / 1000000).multiply(this._projectionMatrix);
        this._gl.uniformMatrix4fv(this._shaderProgram.pMatrixUniform, false, this._arrayFromMatrix(glProjectionMatrix));
    },

    /**
     * @param {!CSSMatrix} m
     * @return {!Float32Array}
     */
    _arrayFromMatrix: function(m)
    {
        return new Float32Array([m.m11, m.m12, m.m13, m.m14, m.m21, m.m22, m.m23, m.m24, m.m31, m.m32, m.m33, m.m34, m.m41, m.m42, m.m43, m.m44]);
    },

    _initWhiteTexture: function()
    {
        this._whiteTexture = this._gl.createTexture();
        this._gl.bindTexture(this._gl.TEXTURE_2D, this._whiteTexture);
        var whitePixel = new Uint8Array([255, 255, 255, 255]);
        this._gl.texImage2D(this._gl.TEXTURE_2D, 0, this._gl.RGBA, 1, 1, 0, this._gl.RGBA, this._gl.UNSIGNED_BYTE, whitePixel);
    },

    _initChromeTextures: function()
    {
        /**
         * @this {WebInspector.Layers3DView}
         * @param {!WebInspector.Layers3DView.ChromeTexture} index
         * @param {?WebGLTexture} value
         */
        function saveChromeTexture(index, value)
        {
            this._chromeTextures[index] = value || undefined;
        }
        this._textureManager.createTexture(saveChromeTexture.bind(this, WebInspector.Layers3DView.ChromeTexture.Left), "Images/chromeLeft.png");
        this._textureManager.createTexture(saveChromeTexture.bind(this, WebInspector.Layers3DView.ChromeTexture.Middle), "Images/chromeMiddle.png");
        this._textureManager.createTexture(saveChromeTexture.bind(this, WebInspector.Layers3DView.ChromeTexture.Right), "Images/chromeRight.png");
    },

    _initGLIfNecessary: function()
    {
        if (this._gl)
            return this._gl;
        this._gl = this._initGL(this._canvasElement);
        this._initShaders();
        this._initWhiteTexture();
        this._initChromeTextures();
        this._textureManager.setContext(this._gl);
        return this._gl;
    },

    _calculateDepths: function()
    {
        this._depthByLayerId = {};
        this._isVisible = {};
        var depth = 0;
        var root = this._layerTree.root();
        var queue = [root];
        this._depthByLayerId[root.id()] = 0;
        this._isVisible[root.id()] = !this._layerTree.contentRoot();
        while (queue.length > 0) {
            var layer = queue.shift();
            var children = layer.children();
            for (var i = 0; i < children.length; ++i) {
                this._depthByLayerId[children[i].id()] = ++depth;
                this._isVisible[children[i].id()] = children[i] === this._layerTree.contentRoot() || this._isVisible[layer.id()];
                queue.push(children[i]);
            }
        }
        this._maxDepth = depth;
    },

    /**
     * @param {!WebInspector.Layers3DView.OutlineType} type
     * @param {!WebInspector.Layers3DView.Selection} selection
     */
    _isSelectionActive: function(type, selection)
    {
        return this._lastSelection[type] && this._lastSelection[type].isEqual(selection);
    },

    /**
     * @param {!WebInspector.Layer} layer
     * @return {number}
     */
    _depthForLayer: function(layer)
    {
        return this._depthByLayerId[layer.id()] * WebInspector.Layers3DView.LayerSpacing;
    },

    /**
     * @param {!WebInspector.Layer} layer
     * @param {number} index
     * @return {number}
     */
    _calculateScrollRectDepth: function(layer, index)
    {
        return this._depthForLayer(layer) + index * WebInspector.Layers3DView.ScrollRectSpacing + 1;
    },

    /**
     * @param {!WebInspector.Layer} layer
     */
    _calculateLayerRect: function(layer)
    {
        if (!this._isVisible[layer.id()])
            return;
        var selection = new WebInspector.Layers3DView.LayerSelection(layer);
        var rect = new WebInspector.Layers3DView.Rectangle(selection);
        rect.setVertices(layer.quad(), this._depthForLayer(layer));
        this._appendRect(rect);
    },

    /**
     * @param {!WebInspector.Layers3DView.Rectangle} rect
     */
    _appendRect: function(rect)
    {
        var selection = rect.relatedObject;
        var isSelected = this._isSelectionActive(WebInspector.Layers3DView.OutlineType.Selected, selection);
        var isHovered = this._isSelectionActive(WebInspector.Layers3DView.OutlineType.Hovered, selection);
        if (isSelected) {
            rect.borderColor = WebInspector.Layers3DView.SelectedBorderColor;
        } else if (isHovered) {
            rect.borderColor = WebInspector.Layers3DView.HoveredBorderColor;
            var fillColor = rect.fillColor || [255, 255, 255, 1];
            var maskColor = WebInspector.Layers3DView.HoveredImageMaskColor;
            rect.fillColor = [fillColor[0] * maskColor[0] / 255, fillColor[1] * maskColor[1] / 255, fillColor[2] * maskColor[2] / 255, fillColor[3] * maskColor[3]];
        } else {
            rect.borderColor = WebInspector.Layers3DView.BorderColor;
        }
        rect.lineWidth = isSelected ? WebInspector.Layers3DView.SelectedBorderWidth : WebInspector.Layers3DView.BorderWidth;
        this._rects.push(rect);
    },

    /**
     * @param {!WebInspector.Layer} layer
     */
    _calculateLayerScrollRects: function(layer)
    {
        var scrollRects = layer.scrollRects();
        for (var i = 0; i < scrollRects.length; ++i) {
            var selection = new WebInspector.Layers3DView.ScrollRectSelection(layer, i);
            var rect = new WebInspector.Layers3DView.Rectangle(selection);
            rect.calculateVerticesFromRect(layer, scrollRects[i].rect, this._calculateScrollRectDepth(layer, i));
            rect.fillColor = WebInspector.Layers3DView.ScrollRectBackgroundColor;
            this._appendRect(rect);
        }
    },

    /**
     * @param {!WebInspector.Layer} layer
     */
    _calculateLayerImageRect: function(layer)
    {
        var layerTexture = this._layerTexture;
        if (layer.id() !== layerTexture.layerId)
            return;
        var selection = new WebInspector.Layers3DView.LayerSelection(layer);
        var rect = new WebInspector.Layers3DView.Rectangle(selection);
        rect.setVertices(layer.quad(), this._depthForLayer(layer));
        rect.texture = layerTexture.texture;
        this._appendRect(rect);
    },

    /**
     * @param {!WebInspector.Layer} layer
     */
    _calculateLayerTileRects: function(layer)
    {
        var tiles = this._textureManager.tilesForLayer(layer.id());
        for (var i = 0; i < tiles.length; ++i) {
            var tile = tiles[i];
            if (!tile.texture)
                continue;
            var selection = new WebInspector.Layers3DView.TileSelection(layer, tile.traceEvent);
            var rect = new WebInspector.Layers3DView.Rectangle(selection);
            rect.calculateVerticesFromRect(layer, {x: tile.rect[0], y: tile.rect[1], width: tile.rect[2], height: tile.rect[3]}, this._depthForLayer(layer) + 1);
            rect.texture = tile.texture;
            this._appendRect(rect);
        }
    },

    _calculateRects: function()
    {
        this._rects = [];

        this._layerTree.forEachLayer(this._calculateLayerRect.bind(this));

        if (this._showSlowScrollRectsSetting.get())
            this._layerTree.forEachLayer(this._calculateLayerScrollRects.bind(this));

        if (this._showPaintsSetting.get()) {
            if (this._layerTexture)
                this._layerTree.forEachLayer(this._calculateLayerImageRect.bind(this));
            else
                this._layerTree.forEachLayer(this._calculateLayerTileRects.bind(this));
        }
    },

    /**
     * @param {!Array.<number>} color
     * @return {!Array.<number>}
     */
    _makeColorsArray: function(color)
    {
        var colors = [];
        var normalizedColor = [color[0] / 255, color[1] / 255, color[2] / 255, color[3]];
        for (var i = 0; i < 4; i++)
            colors = colors.concat(normalizedColor);
        return colors;
    },

    /**
     * @param {!Object} attribute
     * @param {!Array.<number>} array
     * @param {number} length
     */
    _setVertexAttribute: function(attribute, array, length)
    {
        var gl = this._gl;
        var buffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(array), gl.STATIC_DRAW);
        gl.vertexAttribPointer(attribute, length, gl.FLOAT, false, 0, 0);
    },

    /**
     * @param {!Array.<number>} vertices
     * @param {number} mode
     * @param {!Array.<number>=} color
     * @param {!Object=} texture
     */
    _drawRectangle: function(vertices, mode, color, texture)
    {
        var gl = this._gl;
        var white = [255, 255, 255, 1];
        color = color || white;
        this._setVertexAttribute(this._shaderProgram.vertexPositionAttribute, vertices, 3);
        this._setVertexAttribute(this._shaderProgram.textureCoordAttribute, [0, 1, 1, 1, 1, 0, 0, 0], 2);
        this._setVertexAttribute(this._shaderProgram.vertexColorAttribute, this._makeColorsArray(color), color.length);

        if (texture) {
            gl.activeTexture(gl.TEXTURE0);
            gl.bindTexture(gl.TEXTURE_2D, texture);
            gl.uniform1i(this._shaderProgram.samplerUniform, 0);
        } else {
            gl.bindTexture(gl.TEXTURE_2D, this._whiteTexture);
        }

        var numberOfVertices = vertices.length / 3;
        gl.drawArrays(mode, 0, numberOfVertices);
    },

    /**
     * @param {!Array.<number>} vertices
     * @param {!WebGLTexture} texture
     * @param {!Array.<number>=} color
     */
    _drawTexture: function(vertices, texture, color)
    {
        this._drawRectangle(vertices, this._gl.TRIANGLE_FAN, color, texture);
    },

    _drawViewportAndChrome: function()
    {
        var viewport = this._layerTree.viewportSize();
        if (!viewport)
            return;

        var drawChrome = !WebInspector.settings.frameViewerHideChromeWindow.get() && this._chromeTextures.length >= 3 && this._chromeTextures.indexOf(undefined) < 0;
        var z = (this._maxDepth + 1) * WebInspector.Layers3DView.LayerSpacing;
        var borderWidth = Math.ceil(WebInspector.Layers3DView.ViewportBorderWidth * this._scale);
        var vertices = [viewport.width, 0, z, viewport.width, viewport.height, z, 0, viewport.height, z, 0, 0, z];
        this._gl.lineWidth(borderWidth);
        this._drawRectangle(vertices, drawChrome ? this._gl.LINE_STRIP : this._gl.LINE_LOOP, WebInspector.Layers3DView.ViewportBorderColor);

        if (!drawChrome)
            return;

        var borderAdjustment = WebInspector.Layers3DView.ViewportBorderWidth / 2;
        var viewportWidth = this._layerTree.viewportSize().width + 2 * borderAdjustment;
        var chromeHeight = this._chromeTextures[0].image.naturalHeight;
        var middleFragmentWidth = viewportWidth - this._chromeTextures[0].image.naturalWidth - this._chromeTextures[2].image.naturalWidth;
        var x = -borderAdjustment;
        var y = -chromeHeight;
        for (var i = 0; i < this._chromeTextures.length; ++i) {
            var width = i === WebInspector.Layers3DView.ChromeTexture.Middle ? middleFragmentWidth : this._chromeTextures[i].image.naturalWidth;
            if (width < 0 || x + width > viewportWidth)
                break;
            vertices = [x, y, z, x + width, y, z, x + width, y + chromeHeight, z, x, y + chromeHeight, z];
            this._drawTexture(vertices, /** @type {!WebGLTexture} */ (this._chromeTextures[i]));
            x += width;
        }
    },

    /**
     * @param {!WebInspector.Layers3DView.Rectangle} rect
     */
    _drawViewRect: function(rect)
    {
        var vertices = rect.vertices;
        if (rect.texture)
            this._drawTexture(vertices, rect.texture, rect.fillColor || undefined);
        else if (rect.fillColor)
            this._drawRectangle(vertices, this._gl.TRIANGLE_FAN, rect.fillColor);
        this._gl.lineWidth(rect.lineWidth);
        if (rect.borderColor)
            this._drawRectangle(vertices, this._gl.LINE_LOOP, rect.borderColor);
    },

    _update: function()
    {
        if (!this.isShowing()) {
            this._needsUpdate = true;
            return;
        }
        if (!this._layerTree || !this._layerTree.root()) {
            this._emptyView.show(this.element);
            return;
        }
        this._emptyView.detach();

        var gl = this._initGLIfNecessary();
        this._resizeCanvas();
        this._calculateDepths();
        this._calculateRects();
        this._updateTransformAndConstraints();

        this._textureManager.setScale(Number.constrain(0.1, 1, this._scale));
        gl.viewport(0, 0, gl.viewportWidth, gl.viewportHeight);
        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

        this._rects.forEach(this._drawViewRect.bind(this));
        this._drawViewportAndChrome();
    },

    /**
     * @param {!Event} event
     * @return {?WebInspector.Layers3DView.Selection}
     */
    _selectionFromEventPoint: function(event)
    {
        if (!this._layerTree)
            return null;
        var closestIntersectionPoint = Infinity;
        var closestObject = null;
        var projectionMatrix = new WebKitCSSMatrix().scale(1, -1, -1).translate(-1, -1, 0).multiply(this._projectionMatrix);
        var x0 = (event.clientX - this._canvasElement.totalOffsetLeft()) * window.devicePixelRatio;
        var y0 = -(event.clientY - this._canvasElement.totalOffsetTop()) * window.devicePixelRatio;

        /**
         * @param {!WebInspector.Layers3DView.Rectangle} rect
         */
        function checkIntersection(rect)
        {
            if (!rect.relatedObject)
                return;
            var t = rect.intersectWithLine(projectionMatrix, x0, y0);
            if (t < closestIntersectionPoint) {
                closestIntersectionPoint = t;
                closestObject = rect.relatedObject;
            }
        }

        this._rects.forEach(checkIntersection);
        return closestObject;
    },

    /**
     * @param {string} caption
     * @param {string} name
     * @param {boolean} value
     * @param {!WebInspector.StatusBar} statusBar
     * @return {!WebInspector.Setting}
     */
    _createVisibilitySetting: function(caption, name, value, statusBar)
    {
        var checkbox = new WebInspector.StatusBarCheckbox(WebInspector.UIString(caption))
        statusBar.appendStatusBarItem(checkbox);
        var setting = WebInspector.settings.createSetting(name, value)
        WebInspector.SettingsUI.bindCheckbox(checkbox.inputElement, setting);
        setting.addChangeListener(this._update, this);
        return setting;
    },

    _initStatusBar: function()
    {
        this._panelStatusBar = this._transformController.statusBar();
        this.element.appendChild(this._panelStatusBar.element);
        this._showSlowScrollRectsSetting = this._createVisibilitySetting("Slow scroll rects", "frameViewerShowSlowScrollRects", true, this._panelStatusBar);
        this._showPaintsSetting = this._createVisibilitySetting("Paints", "frameViewerShowPaints", true, this._panelStatusBar);
        WebInspector.settings.frameViewerHideChromeWindow.addChangeListener(this._update, this);
    },

    /**
     * @param {!Event} event
     */
    _onContextMenu: function(event)
    {
        var selection = this._selectionFromEventPoint(event);
        var node = selection && selection.layer && selection.layer.nodeForSelfOrAncestor();
        var contextMenu = new WebInspector.ContextMenu(event);
        contextMenu.appendItem(WebInspector.UIString("Reset View"), this._transformController.resetAndNotify.bind(this._transformController), false);
        if (selection && selection.type() === WebInspector.Layers3DView.Selection.Type.Tile)
            contextMenu.appendItem(WebInspector.UIString("Show Paint Profiler"), this.dispatchEventToListeners.bind(this, WebInspector.Layers3DView.Events.PaintProfilerRequested, selection.traceEvent), false);
        if (node)
            contextMenu.appendApplicableItems(node);
        contextMenu.show();
    },

    /**
     * @param {!Event} event
     */
    _onMouseMove: function(event)
    {
        if (event.which)
            return;
        this.dispatchEventToListeners(WebInspector.Layers3DView.Events.ObjectHovered, this._selectionFromEventPoint(event));
    },

    /**
     * @param {!Event} event
     */
    _onMouseDown: function(event)
    {
        this._mouseDownX = event.clientX;
        this._mouseDownY = event.clientY;
    },

    /**
     * @param {!Event} event
     */
    _onMouseUp: function(event)
    {
        const maxDistanceInPixels = 6;
        if (this._mouseDownX && Math.abs(event.clientX - this._mouseDownX) < maxDistanceInPixels && Math.abs(event.clientY - this._mouseDownY) < maxDistanceInPixels)
            this.dispatchEventToListeners(WebInspector.Layers3DView.Events.ObjectSelected, this._selectionFromEventPoint(event));
        delete this._mouseDownX;
        delete this._mouseDownY;
    },

    /**
     * @param {!Event} event
     */
    _onDoubleClick: function(event)
    {
        var object = this._selectionFromEventPoint(event);
        if (object) {
            if (object.type() == WebInspector.Layers3DView.Selection.Type.Tile)
                this.dispatchEventToListeners(WebInspector.Layers3DView.Events.PaintProfilerRequested, object.traceEvent);
            else if (object.layer)
                this.dispatchEventToListeners(WebInspector.Layers3DView.Events.LayerSnapshotRequested, object.layer);
        }
        event.stopPropagation();
    },

    __proto__: WebInspector.VBox.prototype
}

/**
 * @constructor
 * @extends {WebInspector.Object}
 */
WebInspector.LayerTextureManager = function()
{
    WebInspector.Object.call(this);
    this.reset();
}

WebInspector.LayerTextureManager.Events = {
    TextureUpdated: "TextureUpated"
}

WebInspector.LayerTextureManager.prototype = {
    reset: function()
    {
        /** @type {!Object.<string, !Array.<!WebInspector.LayerTextureManager.Tile>>} */
        this._tilesByLayerId = {};
        this._scale = 0;
    },

    /**
     * @param {!WebGLRenderingContext} glContext
     */
    setContext: function(glContext)
    {
        this._gl = glContext;
        if (this._scale)
            this._updateTextures();
    },

    /**
     * @param {?Array.<!WebInspector.Layers3DView.PaintTile>} paintTiles
     */
    setTiles: function(paintTiles)
    {
        this._tilesByLayerId = {};
        if (!paintTiles)
            return;
        for (var i = 0; i < paintTiles.length; ++i) {
            var layerId = paintTiles[i].layerId;
            var tilesForLayer = this._tilesByLayerId[layerId];
            if (!tilesForLayer) {
                tilesForLayer = [];
                this._tilesByLayerId[layerId] = tilesForLayer;
            }
            var tile = new WebInspector.LayerTextureManager.Tile(paintTiles[i].snapshot, paintTiles[i].rect, paintTiles[i].traceEvent);
            tilesForLayer.push(tile);
            if (this._scale && this._gl)
                this._updateTile(tile);
        }
    },

    /**
     * @param {number} scale
     */
    setScale: function(scale)
    {
        if (this._scale && this._scale >= scale)
            return;
        this._scale = scale;
        this._updateTextures();
    },

    /**
     * @param {string} layerId
     * @return {!Array.<!WebInspector.LayerTextureManager.Tile>}
     */
    tilesForLayer: function(layerId)
    {
        return this._tilesByLayerId[layerId] || [];
    },

    _updateTextures: function()
    {
        if (!this._gl)
            return;
        if (!this._scale)
            return;

        for (var layerId in this._tilesByLayerId) {
            for (var i = 0; i < this._tilesByLayerId[layerId].length; ++i) {
                var tile = this._tilesByLayerId[layerId][i];
                if (!tile.scale || tile.scale < this._scale)
                    this._updateTile(tile);
            }
        }
    },

    /**
     * @param {!WebInspector.LayerTextureManager.Tile} tile
     */
    _updateTile: function(tile)
    {
        console.assert(this._scale && this._gl);
        tile.scale = this._scale;
        tile.snapshot.requestImage(null, null, tile.scale, onGotImage.bind(this));

        /**
         * @this {WebInspector.LayerTextureManager}
         * @param {string=} imageURL
         */
        function onGotImage(imageURL)
        {
            if (imageURL)
                this.createTexture(onTextureCreated.bind(this), imageURL);
        }

        /**
         * @this {WebInspector.LayerTextureManager}
         * @param {?WebGLTexture} texture
         */
        function onTextureCreated(texture)
        {
            tile.texture = texture;
            this.dispatchEventToListeners(WebInspector.LayerTextureManager.Events.TextureUpdated);
        }
    },

    /**
     * @param {function(?WebGLTexture)} textureCreatedCallback
     * @param {string} imageURL
     */
    createTexture: function(textureCreatedCallback, imageURL)
    {
        var image = new Image();
        image.addEventListener("load", onImageLoaded.bind(this), false);
        image.addEventListener("error", onImageError, false);
        image.src = imageURL;

        /**
         * @this {WebInspector.LayerTextureManager}
         */
        function onImageLoaded()
        {
            textureCreatedCallback(this._createTextureForImage(image));
        }

        function onImageError()
        {
            textureCreatedCallback(null);
        }
    },

    /**
     * @param {!Image} image
     * @return {!WebGLTexture} texture
     */
    _createTextureForImage: function(image)
    {
        var texture = this._gl.createTexture();
        texture.image = image;
        this._gl.bindTexture(this._gl.TEXTURE_2D, texture);
        this._gl.pixelStorei(this._gl.UNPACK_FLIP_Y_WEBGL, true);
        this._gl.texImage2D(this._gl.TEXTURE_2D, 0, this._gl.RGBA, this._gl.RGBA, this._gl.UNSIGNED_BYTE, texture.image);
        this._gl.texParameteri(this._gl.TEXTURE_2D, this._gl.TEXTURE_MIN_FILTER, this._gl.LINEAR);
        this._gl.texParameteri(this._gl.TEXTURE_2D, this._gl.TEXTURE_MAG_FILTER, this._gl.LINEAR);
        this._gl.texParameteri(this._gl.TEXTURE_2D, this._gl.TEXTURE_WRAP_S, this._gl.CLAMP_TO_EDGE);
        this._gl.texParameteri(this._gl.TEXTURE_2D, this._gl.TEXTURE_WRAP_T, this._gl.CLAMP_TO_EDGE);
        this._gl.bindTexture(this._gl.TEXTURE_2D, null);
        return texture;
    },

    __proto__: WebInspector.Object.prototype
}

/**
 * @constructor
 * @param {?WebInspector.Layers3DView.Selection} relatedObject
 */
WebInspector.Layers3DView.Rectangle = function(relatedObject)
{
    this.relatedObject = relatedObject;
    /** @type {number} */
    this.lineWidth = 1;
    /** @type {?Array.<number>} */
    this.borderColor = null;
    /** @type {?Array.<number>} */
    this.fillColor = null;
    /** @type {?WebGLTexture} */
    this.texture = null;
}

WebInspector.Layers3DView.Rectangle.prototype = {
    /**
     * @param {!Array.<number>} quad
     * @param {number} z
     */
    setVertices: function(quad, z)
    {
        this.vertices = [quad[0], quad[1], z, quad[2], quad[3], z, quad[4], quad[5], z, quad[6], quad[7], z];
    },

    /**
     * Finds coordinates of point on layer quad, having offsets (ratioX * width) and (ratioY * height)
     * from the left corner of the initial layer rect, where width and heigth are layer bounds.
     * @param {!Array.<number>} quad
     * @param {number} ratioX
     * @param {number} ratioY
     * @return {!Array.<number>}
     */
    _calculatePointOnQuad: function(quad, ratioX, ratioY)
    {
        var x0 = quad[0];
        var y0 = quad[1];
        var x1 = quad[2];
        var y1 = quad[3];
        var x2 = quad[4];
        var y2 = quad[5];
        var x3 = quad[6];
        var y3 = quad[7];
        // Point on the first quad side clockwise
        var firstSidePointX = x0 + ratioX * (x1 - x0);
        var firstSidePointY = y0 + ratioX * (y1 - y0);
        // Point on the third quad side clockwise
        var thirdSidePointX = x3 + ratioX * (x2 - x3);
        var thirdSidePointY = y3 + ratioX * (y2 - y3);
        var x = firstSidePointX + ratioY * (thirdSidePointX - firstSidePointX);
        var y = firstSidePointY + ratioY * (thirdSidePointY - firstSidePointY);
        return [x, y];
    },

    /**
     * @param {!WebInspector.Layer} layer
     * @param {!DOMAgent.Rect} rect
     * @param {number} z
     */
    calculateVerticesFromRect: function(layer, rect, z)
    {
        var quad = layer.quad();
        var rx1 = rect.x / layer.width();
        var rx2 = (rect.x + rect.width) / layer.width();
        var ry1 = rect.y / layer.height();
        var ry2 = (rect.y + rect.height) / layer.height();
        var rectQuad = this._calculatePointOnQuad(quad, rx1, ry1).concat(this._calculatePointOnQuad(quad, rx2, ry1))
            .concat(this._calculatePointOnQuad(quad, rx2, ry2)).concat(this._calculatePointOnQuad(quad, rx1, ry2));
        this.setVertices(rectQuad, z);
    },

    /**
     * Intersects quad with given transform matrix and line l(t) = (x0, y0, t)
     * @param {!CSSMatrix} matrix
     * @param {number} x0
     * @param {number} y0
     * @return {(number|undefined)}
     */
    intersectWithLine: function(matrix, x0, y0)
    {
        var epsilon = 1e-8;
        var i;
        // Vertices of the quad with transform matrix applied
        var points = [];
        for (i = 0; i < 4; ++i)
            points[i] = WebInspector.Geometry.multiplyVectorByMatrixAndNormalize(new WebInspector.Geometry.Vector(this.vertices[i * 3], this.vertices[i * 3 + 1], this.vertices[i * 3 + 2]), matrix);
        // Calculating quad plane normal
        var normal = WebInspector.Geometry.crossProduct(WebInspector.Geometry.subtract(points[1], points[0]), WebInspector.Geometry.subtract(points[2], points[1]));
        // General form of the equation of the quad plane: A * x + B * y + C * z + D = 0
        var A = normal.x;
        var B = normal.y;
        var C = normal.z;
        var D = -(A * points[0].x + B * points[0].y + C * points[0].z);
        // Finding t from the equation
        var t = -(D + A * x0 + B * y0) / C;
        // Point of the intersection
        var pt = new WebInspector.Geometry.Vector(x0, y0, t);
        // Vectors from the intersection point to vertices of the quad
        var tVects = points.map(WebInspector.Geometry.subtract.bind(null, pt));
        // Intersection point lies inside of the polygon if scalar products of normal of the plane and
        // cross products of successive tVects are all nonstrictly above or all nonstrictly below zero
        for (i = 0; i < tVects.length; ++i) {
            var product = WebInspector.Geometry.scalarProduct(normal, WebInspector.Geometry.crossProduct(tVects[i], tVects[(i + 1) % tVects.length]));
            if (product < 0)
                return undefined;
        }
        return t;
    }
}

/**
 * @constructor
 * @param {!WebInspector.Layers3DView.Selection.Type} type
 */
WebInspector.Layers3DView.Selection = function(type)
{
    this._type = type;
}

/**
 * @enum {string}
 */
WebInspector.Layers3DView.Selection.Type = {
    Layer: "Layer",
    ScrollRect: "ScrollRect",
    Tile: "Tile",
};

WebInspector.Layers3DView.Selection.prototype = {
    /**
     * @return {!WebInspector.Layers3DView.Selection.Type}
     */
    type: function()
    {
        return this._type;
    },

    /**
     * @param {!WebInspector.Layers3DView.Selection} other
     * @return {boolean}
     */
    isEqual: function(other)
    {
        return false;
    }
};

/**
 * @constructor
 * @extends {WebInspector.Layers3DView.Selection}
 */
WebInspector.Layers3DView.LayerSelection = function(layer)
{
    WebInspector.Layers3DView.Selection.call(this, WebInspector.Layers3DView.Selection.Type.Layer);
    this.layer = layer;
}

WebInspector.Layers3DView.LayerSelection.prototype = {
    /**
     * @override
     * @param {!WebInspector.Layers3DView.Selection} other
     * @return {boolean}
     */
    isEqual: function(other)
    {
        return other._type === WebInspector.Layers3DView.Selection.Type.Layer && other.layer.id() === this.layer.id();
    },

    __proto__: WebInspector.Layers3DView.Selection.prototype
};

/**
 * @constructor
 * @extends {WebInspector.Layers3DView.Selection}
 */
WebInspector.Layers3DView.ScrollRectSelection = function(layer, scrollRectIndex)
{
    WebInspector.Layers3DView.Selection.call(this, WebInspector.Layers3DView.Selection.Type.ScrollRect);
    this.layer = layer;
    this.scrollRectIndex = scrollRectIndex;
}

WebInspector.Layers3DView.ScrollRectSelection.prototype = {
    /**
     * @override
     * @param {!WebInspector.Layers3DView.Selection} other
     * @return {boolean}
     */
    isEqual: function(other)
    {
        return other._type === WebInspector.Layers3DView.Selection.Type.ScrollRect &&
            this.layer.id() === other.layer.id() && this.scrollRectIndex === other.scrollRectIndex
    },

    __proto__: WebInspector.Layers3DView.Selection.prototype
}

/**
 * @constructor
 * @extends {WebInspector.Layers3DView.Selection}
 * @param {!WebInspector.Layer} layer
 * @param {!WebInspector.TracingModel.Event} traceEvent
 */
WebInspector.Layers3DView.TileSelection = function(layer, traceEvent)
{
    WebInspector.Layers3DView.Selection.call(this, WebInspector.Layers3DView.Selection.Type.Tile);
    this.layer = layer;
    this.traceEvent = traceEvent;
}

WebInspector.Layers3DView.TileSelection.prototype = {
    /**
     * @override
     * @param {!WebInspector.Layers3DView.Selection} other
     * @return {boolean}
     */
    isEqual: function(other)
    {
        return other._type === WebInspector.Layers3DView.Selection.Type.Tile
            && this.layer.id() === other.layer.id() && this.traceEvent === other.traceEvent;
    },

    __proto__: WebInspector.Layers3DView.Selection.prototype
}

/**
 * @constructor
 * @param {!WebInspector.PaintProfilerSnapshot} snapshot
 * @param {!Array.<number>} rect
 * @param {!WebInspector.TracingModel.Event} traceEvent
 */
WebInspector.LayerTextureManager.Tile = function(snapshot, rect, traceEvent)
{
    this.snapshot = snapshot;
    this.rect = rect;
    this.traceEvent = traceEvent;
    this.scale = 0;
    /** @type {?WebGLTexture} */
    this.texture = null;
}
