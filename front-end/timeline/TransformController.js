/*
 * Copyright 2014 The Chromium Authors. All rights reserved.
 * Use of this source code is governed by a BSD-style license that can be
 * found in the LICENSE file.
 */

/**
 * @constructor
 * @extends {WebInspector.Object}
 * @param {!Element} element
 * @param {boolean=} disableRotate
 */
WebInspector.TransformController = function(element, disableRotate)
{
    this._shortcuts = {};
    this.element = element;
    if (this.element.tabIndex < 0)
        this.element.tabIndex = 0;
    this._registerShortcuts();
    WebInspector.installDragHandle(element, this._onDragStart.bind(this), this._onDrag.bind(this), this._onDragEnd.bind(this), "move", null);
    element.addEventListener("keydown", this._onKeyDown.bind(this), false);
    element.addEventListener("keyup", this._onKeyUp.bind(this), false);
    element.addEventListener("mousewheel", this._onMouseWheel.bind(this), false);
    this._disableRotate = disableRotate;
    this._minScale = 0;
    this._maxScale = Infinity;

    this._controlPanelStatusBar = new WebInspector.StatusBar();
    this._controlPanelStatusBar.element.classList.add("transform-control-panel");

    this._modeButtons = {};
    if (!disableRotate) {
        var panModeButton = new WebInspector.StatusBarButton(WebInspector.UIString("Pan mode (X)"), "pan-status-bar-item");
        panModeButton.addEventListener("click", this._setMode.bind(this, WebInspector.TransformController.Modes.Pan));
        this._modeButtons[WebInspector.TransformController.Modes.Pan] = panModeButton;
        this._controlPanelStatusBar.appendStatusBarItem(panModeButton);
        var rotateModeButton = new WebInspector.StatusBarButton(WebInspector.UIString("Rotate mode (V)"), "rotate-status-bar-item");
        rotateModeButton.addEventListener("click", this._setMode.bind(this, WebInspector.TransformController.Modes.Rotate));
        this._modeButtons[WebInspector.TransformController.Modes.Rotate] = rotateModeButton;
        this._controlPanelStatusBar.appendStatusBarItem(rotateModeButton);
    }
    this._setMode(WebInspector.TransformController.Modes.Pan);

    var resetButton = new WebInspector.StatusBarButton(WebInspector.UIString("Reset transform (0)"), "center-status-bar-item");
    resetButton.addEventListener("click", this.resetAndNotify.bind(this, undefined));
    this._controlPanelStatusBar.appendStatusBarItem(resetButton);

    this._reset();
}

/**
 * @enum {string}
 */
WebInspector.TransformController.Events = {
    TransformChanged: "TransformChanged"
}

/**
 * @enum {string}
 */
WebInspector.TransformController.Modes = {
    Pan: "Pan",
    Rotate: "Rotate",
}

WebInspector.TransformController.prototype = {
    /**
     * @return {!WebInspector.StatusBar}
     */
    statusBar: function()
    {
        return this._controlPanelStatusBar;
    },

    _onKeyDown: function(event)
    {
        if (event.keyCode === WebInspector.KeyboardShortcut.Keys.Shift.code) {
            this._toggleMode();
            return;
        }

        var shortcutKey = WebInspector.KeyboardShortcut.makeKeyFromEventIgnoringModifiers(event);
        var handler = this._shortcuts[shortcutKey];
        if (handler && handler(event))
            event.consume();
    },

    _onKeyUp: function(event)
    {
        if (event.keyCode === WebInspector.KeyboardShortcut.Keys.Shift.code)
            this._toggleMode();
    },

    _addShortcuts: function(keys, handler)
    {
        for (var i = 0; i < keys.length; ++i)
            this._shortcuts[keys[i].key] = handler;
    },

    _registerShortcuts: function()
    {
        this._addShortcuts(WebInspector.ShortcutsScreen.LayersPanelShortcuts.ResetView, this.resetAndNotify.bind(this));
        this._addShortcuts(WebInspector.ShortcutsScreen.LayersPanelShortcuts.PanMode, this._setMode.bind(this, WebInspector.TransformController.Modes.Pan));
        this._addShortcuts(WebInspector.ShortcutsScreen.LayersPanelShortcuts.RotateMode, this._setMode.bind(this, WebInspector.TransformController.Modes.Rotate));
        var zoomFactor = 1.1;
        this._addShortcuts(WebInspector.ShortcutsScreen.LayersPanelShortcuts.ZoomIn, this._onKeyboardZoom.bind(this, zoomFactor));
        this._addShortcuts(WebInspector.ShortcutsScreen.LayersPanelShortcuts.ZoomOut, this._onKeyboardZoom.bind(this, 1 / zoomFactor));
        this._addShortcuts(WebInspector.ShortcutsScreen.LayersPanelShortcuts.Up, this._onKeyboardPanOrRotate.bind(this, 0, -1));
        this._addShortcuts(WebInspector.ShortcutsScreen.LayersPanelShortcuts.Down, this._onKeyboardPanOrRotate.bind(this, 0, 1));
        this._addShortcuts(WebInspector.ShortcutsScreen.LayersPanelShortcuts.Left, this._onKeyboardPanOrRotate.bind(this, -1, 0));
        this._addShortcuts(WebInspector.ShortcutsScreen.LayersPanelShortcuts.Right, this._onKeyboardPanOrRotate.bind(this, 1, 0));
    },

    _postChangeEvent: function()
    {
        this.dispatchEventToListeners(WebInspector.TransformController.Events.TransformChanged);
    },

    _reset: function()
    {
        this._scale = 1;
        this._offsetX = 0;
        this._offsetY = 0;
        this._rotateX = 0;
        this._rotateY = 0;
    },

    _toggleMode: function()
    {
        this._setMode(this._mode === WebInspector.TransformController.Modes.Pan ? WebInspector.TransformController.Modes.Rotate : WebInspector.TransformController.Modes.Pan);
    },

    /**
     * @param {!WebInspector.TransformController.Modes} mode
     */
    _setMode: function(mode)
    {
        if (this._mode === mode)
            return;
        this._mode = mode;
        this._updateModeButtons();
        this.element.focus();
    },

    _updateModeButtons: function()
    {
        for (var mode in this._modeButtons)
            this._modeButtons[mode].setToggled(mode === this._mode);
    },

    /**
     * @param {!Event=} event
     */
    resetAndNotify: function(event)
    {
        this._reset();
        this._postChangeEvent();
        if (event)
            event.preventDefault();
        this.element.focus();
    },

    /**
     * @param {number} minScale
     * @param {number} maxScale
     */
    setScaleConstraints: function(minScale, maxScale)
    {
        this._minScale = minScale;
        this._maxScale = maxScale;
        this._scale = Number.constrain(this._scale, minScale, maxScale);
    },

    /**
     * @param {number} minX
     * @param {number} maxX
     * @param {number} minY
     * @param {number} maxY
     */
    clampOffsets: function(minX, maxX, minY, maxY)
    {
        this._offsetX = Number.constrain(this._offsetX, minX, maxX);
        this._offsetY = Number.constrain(this._offsetY, minY, maxY);
    },

    /**
     * @return {number}
     */
    scale: function()
    {
        return this._scale;
    },

    /**
     * @return {number}
     */
    offsetX: function()
    {
        return this._offsetX;
    },

    /**
     * @return {number}
     */
    offsetY: function()
    {
        return this._offsetY;
    },

    /**
     * @return {number}
     */
    rotateX: function()
    {
        return this._rotateX;
    },

    /**
     * @return {number}
     */
    rotateY: function()
    {
        return this._rotateY;
    },

    /**
     * @param {number} scaleFactor
     * @param {number} x
     * @param {number} y
     */
    _onScale: function(scaleFactor, x, y)
    {
        scaleFactor = Number.constrain(this._scale * scaleFactor, this._minScale, this._maxScale) / this._scale;
        this._scale *= scaleFactor;
        this._offsetX -= (x - this._offsetX) * (scaleFactor - 1);
        this._offsetY -= (y - this._offsetY) * (scaleFactor - 1);
        this._postChangeEvent();
    },

    /**
     * @param {number} offsetX
     * @param {number} offsetY
     */
    _onPan: function(offsetX, offsetY)
    {
        this._offsetX += offsetX;
        this._offsetY += offsetY;
        this._postChangeEvent();
    },

    /**
     * @param {number} rotateX
     * @param {number} rotateY
     */
    _onRotate: function(rotateX, rotateY)
    {
        this._rotateX = rotateX;
        this._rotateY = rotateY;
        this._postChangeEvent();
    },

    /**
     * @param {number} zoomFactor
     */
    _onKeyboardZoom: function(zoomFactor)
    {
        this._onScale(zoomFactor, this.element.clientWidth / 2, this.element.clientHeight / 2);
    },

    /**
     * @param {number} xMultiplier
     * @param {number} yMultiplier
     */
    _onKeyboardPanOrRotate: function(xMultiplier, yMultiplier)
    {
        var panStepInPixels = 6;
        var rotateStepInDegrees = 5;

        if (this._mode === WebInspector.TransformController.Modes.Rotate) {
            // Sic! _onRotate treats X and Y as "rotate around X" and "rotate around Y", so swap X/Y multiplers.
            this._onRotate(this._rotateX + yMultiplier * rotateStepInDegrees, this._rotateY + xMultiplier * rotateStepInDegrees);
        } else {
            this._onPan(xMultiplier * panStepInPixels, yMultiplier * panStepInPixels);
        }
    },

    /**
     * @param {!Event} event
     */
    _onMouseWheel: function(event)
    {
        /** @const */
        var zoomFactor = 1.1;
        /** @const */
        var mouseWheelZoomSpeed = 1 / 120;
        var scaleFactor = Math.pow(zoomFactor, event.wheelDeltaY * mouseWheelZoomSpeed);
        this._onScale(scaleFactor, event.clientX - this.element.totalOffsetLeft(), event.clientY - this.element.totalOffsetTop());
    },

    /**
     * @param {!Event} event
     */
    _onDrag: function(event)
    {
        if (this._mode === WebInspector.TransformController.Modes.Rotate) {
            this._onRotate(this._oldRotateX + (this._originY - event.clientY) / this.element.clientHeight * 180, this._oldRotateY - (this._originX - event.clientX) / this.element.clientWidth * 180);
        } else {
            this._onPan(event.clientX - this._originX, event.clientY - this._originY);
            this._originX = event.clientX;
            this._originY = event.clientY;
        }
    },

    /**
     * @param {!MouseEvent} event
     */
    _onDragStart: function(event)
    {
        this.element.focus();
        this._originX = event.clientX;
        this._originY = event.clientY;
        this._oldRotateX = this._rotateX;
        this._oldRotateY = this._rotateY;
        return true;
    },

    _onDragEnd: function()
    {
        delete this._originX;
        delete this._originY;
        delete this._oldRotateX;
        delete this._oldRotateY;
    },

    __proto__: WebInspector.Object.prototype
}
