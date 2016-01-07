// Copyright (c) 2015 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

/**
 * @constructor
 * @extends {WebInspector.VBox}
 */
WebInspector.BezierEditor = function()
{
    WebInspector.VBox.call(this, true);
    this.registerRequiredCSS("elements/bezierEditor.css");
    this.contentElement.tabIndex = 0;

    // Preview UI
    this._previewElement = this.contentElement.createChild("div", "bezier-preview-container");
    this._previewElement.createChild("div", "bezier-preview-animation");
    this._previewElement.addEventListener("click", this._startPreviewAnimation.bind(this));
    this._previewOnion = this.contentElement.createChild("div", "bezier-preview-onion");
    this._previewOnion.addEventListener("click", this._startPreviewAnimation.bind(this));

    this._outerContainer = this.contentElement.createChild("div", "bezier-container");

    // Presets UI
    this._presetsContainer = this._outerContainer.createChild("div", "bezier-presets");
    this._presetUI = new WebInspector.BezierUI(40, 40, 0, 2, false);
    this._presetCategories = [];
    for (var i = 0; i < WebInspector.BezierEditor.Presets.length; i++) {
        this._presetCategories[i] = this._createCategory(WebInspector.BezierEditor.Presets[i]);
        this._presetsContainer.appendChild(this._presetCategories[i].icon);
    }

    // Curve UI
    this._curveUI = new WebInspector.BezierUI(150, 250, 50, 7, true);
    this._curve = this._outerContainer.createSVGChild("svg", "bezier-curve");
    WebInspector.installDragHandle(this._curve, this._dragStart.bind(this), this._dragMove.bind(this), this._dragEnd.bind(this), "default");

    this._header = this.contentElement.createChild("div", "bezier-header");
    var minus = this._createPresetModifyIcon(this._header, "bezier-preset-minus", "M 12 6 L 8 10 L 12 14");
    var plus = this._createPresetModifyIcon(this._header, "bezier-preset-plus", "M 8 6 L 12 10 L 8 14");
    minus.addEventListener("click", this._presetModifyClicked.bind(this, false));
    plus.addEventListener("click", this._presetModifyClicked.bind(this, true));
    this._label = this._header.createChild("span", "source-code bezier-display-value");
}

WebInspector.BezierEditor.Events = {
    BezierChanged: "BezierChanged"
}

WebInspector.BezierEditor.Presets = [
    [
        { name: "ease-in-out", value: "ease-in-out" },
        { name: "In Out · Sine", value: "cubic-bezier(0.45, 0.05, 0.55, 0.95)" },
        { name: "In Out · Quadratic", value: "cubic-bezier(0.46, 0.03, 0.52, 0.96)" },
        { name: "In Out · Cubic", value: "cubic-bezier(0.65, 0.05, 0.36, 1)" },
        { name: "Fast Out, Slow In", value: "cubic-bezier(0.4, 0, 0.2, 1)" },
        { name: "In Out · Back", value: "cubic-bezier(0.68, -0.55, 0.27, 1.55)" }
    ],
    [
        { name: "Fast Out, Linear In", value: "cubic-bezier(0.4, 0, 1, 1)" },
        { name: "ease-in", value: "ease-in" },
        { name: "In · Sine", value: "cubic-bezier(0.47, 0, 0.75, 0.72)" },
        { name: "In · Quadratic", value: "cubic-bezier(0.55, 0.09, 0.68, 0.53)" },
        { name: "In · Cubic", value: "cubic-bezier(0.55, 0.06, 0.68, 0.19)" },
        { name: "In · Back", value: "cubic-bezier(0.6, -0.28, 0.74, 0.05)" }
    ],
    [
        { name: "ease-out", value: "ease-out" },
        { name: "Out · Sine", value: "cubic-bezier(0.39, 0.58, 0.57, 1)" },
        { name: "Out · Quadratic", value: "cubic-bezier(0.25, 0.46, 0.45, 0.94)" },
        { name: "Out · Cubic", value: "cubic-bezier(0.22, 0.61, 0.36, 1)" },
        { name: "Linear Out, Slow In", value: "cubic-bezier(0, 0, 0.2, 1)" },
        { name: "Out · Back", value: "cubic-bezier(0.18, 0.89, 0.32, 1.28)" }
    ]
]

/** @typedef {{presets: !Array.<{name: string, value: string}>, icon: !Element, presetIndex: number}} */
WebInspector.BezierEditor.PresetCategory;

WebInspector.BezierEditor.prototype = {
    /**
     * @param {?WebInspector.Geometry.CubicBezier} bezier
     */
    setBezier: function(bezier)
    {
        if (!bezier)
            return;
        this._bezier = bezier;
        this._updateUI();
    },

    /**
     * @return {!WebInspector.Geometry.CubicBezier}
     */
    bezier: function()
    {
        return this._bezier;
    },

    wasShown: function()
    {
        this._unselectPresets();
        // Check if bezier matches a preset
        for (var category of this._presetCategories) {
            for (var i = 0; i < category.presets.length; i++) {
                if (this._bezier.asCSSText() === category.presets[i].value) {
                    category.presetIndex = i;
                    this._presetCategorySelected(category);
                }
            }
        }

        this._updateUI();
        this._startPreviewAnimation();
    },

    _onchange: function()
    {
        this._updateUI();
        this.dispatchEventToListeners(WebInspector.BezierEditor.Events.BezierChanged, this._bezier.asCSSText());
    },

    _updateUI: function()
    {
        var labelText = this._selectedCategory ? this._selectedCategory.presets[this._selectedCategory.presetIndex].name : this._bezier.asCSSText().replace(/\s(-\d\.\d)/g, "$1");
        this._label.textContent = WebInspector.UIString(labelText);
        this._curveUI.drawCurve(this._bezier, this._curve);
        this._previewOnion.removeChildren();
    },

    /**
     * @param {!Event} event
     * @return {boolean}
     */
    _dragStart: function(event)
    {
        this._mouseDownPosition = new WebInspector.Geometry.Point(event.x, event.y);
        var ui = this._curveUI;
        this._controlPosition = new WebInspector.Geometry.Point(
            Number.constrain((event.offsetX - ui.radius) / ui.curveWidth(), 0, 1),
            (ui.curveHeight() + ui.marginTop + ui.radius - event.offsetY) / ui.curveHeight());

        var firstControlPointIsCloser = this._controlPosition.distanceTo(this._bezier.controlPoints[0]) < this._controlPosition.distanceTo(this._bezier.controlPoints[1]);
        this._selectedPoint = firstControlPointIsCloser ? 0 : 1;

        this._bezier.controlPoints[this._selectedPoint] = this._controlPosition;
        this._unselectPresets();
        this._onchange();

        event.consume(true);
        return true;
    },

    /**
     * @param {number} mouseX
     * @param {number} mouseY
     */
    _updateControlPosition: function(mouseX, mouseY)
    {
        var deltaX = (mouseX - this._mouseDownPosition.x) / this._curveUI.curveWidth();
        var deltaY = (mouseY - this._mouseDownPosition.y) / this._curveUI.curveHeight();
        var newPosition = new WebInspector.Geometry.Point(Number.constrain(this._controlPosition.x + deltaX, 0, 1), this._controlPosition.y - deltaY);
        this._bezier.controlPoints[this._selectedPoint] = newPosition;
    },

    /**
     * @param {!Event} event
     */
    _dragMove: function(event)
    {
        this._updateControlPosition(event.x, event.y);
        this._onchange();
    },

    /**
     * @param {!Event} event
     */
    _dragEnd: function(event)
    {
        this._updateControlPosition(event.x, event.y);
        this._onchange();
        this._startPreviewAnimation();
    },

    /**
     * @param {!Array<{name: string, value: string}>} presetGroup
     * @return {!WebInspector.BezierEditor.PresetCategory}
     */
    _createCategory: function(presetGroup)
    {
        var presetElement = createElementWithClass("div", "bezier-preset-category");
        var iconElement = presetElement.createSVGChild("svg", "bezier-preset monospace");
        var category = { presets: presetGroup, presetIndex: 0, icon: presetElement };
        this._presetUI.drawCurve(WebInspector.Geometry.CubicBezier.parse(category.presets[0].value), iconElement);
        iconElement.addEventListener("click", this._presetCategorySelected.bind(this, category));
        return category;
    },

    /**
     * @param {!Element} parentElement
     * @param {string} className
     * @param {string} drawPath
     * @return {!Element}
     */
    _createPresetModifyIcon: function (parentElement, className, drawPath)
    {
        var icon = parentElement.createSVGChild("svg", "bezier-preset-modify " + className);
        icon.setAttribute("width", 20);
        icon.setAttribute("height", 20);
        var path = icon.createSVGChild("path");
        path.setAttribute("d", drawPath);
        return icon;
    },

    _unselectPresets: function()
    {
        for (var category of this._presetCategories)
            category.icon.classList.remove("bezier-preset-selected");
        delete this._selectedCategory;
        this._header.classList.remove("bezier-header-active");
    },

    /**
     * @param {!WebInspector.BezierEditor.PresetCategory} category
     * @param {!Event=} event
     */
    _presetCategorySelected: function(category, event)
    {
        if (this._selectedCategory === category)
            return;
        this._unselectPresets();
        this._header.classList.add("bezier-header-active");
        this._selectedCategory = category;
        this._selectedCategory.icon.classList.add("bezier-preset-selected");
        this.setBezier(WebInspector.Geometry.CubicBezier.parse(category.presets[category.presetIndex].value));
        this._onchange();
        this._startPreviewAnimation();
        if (event)
            event.consume(true);
    },

    /**
     * @param {boolean} intensify
     * @param {!Event} event
     */
    _presetModifyClicked: function(intensify, event)
    {
        if (!this._selectedCategory)
            return;

        var length = this._selectedCategory.presets.length;
        this._selectedCategory.presetIndex = (this._selectedCategory.presetIndex + (intensify ? 1 : -1) + length) % length;
        this.setBezier(WebInspector.Geometry.CubicBezier.parse(this._selectedCategory.presets[this._selectedCategory.presetIndex].value));
        this._onchange();
        this._startPreviewAnimation();
    },

    _startPreviewAnimation: function()
    {
        if (this._previewAnimation)
            this._previewAnimation.cancel();

        const animationDuration = 1600;
        const numberOnionSlices = 20;

        var keyframes = [{ offset: 0, transform: "translateX(0px)", easing: this._bezier.asCSSText(), opacity: 1 },
            { offset: 0.9, transform: "translateX(218px)", opacity: 1 },
            { offset: 1, transform: "translateX(218px)", opacity: 0 }];
        this._previewAnimation = this._previewElement.animate(keyframes, animationDuration);
        this._previewOnion.removeChildren();
        for (var i = 0; i <= numberOnionSlices; i++) {
            var slice = this._previewOnion.createChild("div", "bezier-preview-animation");
            var player = slice.animate([{ transform: "translateX(0px)", easing: this._bezier.asCSSText() }, { transform: "translateX(218px)" }],
                { duration: animationDuration, fill: "forwards" });
            player.pause();
            player.currentTime = animationDuration * i / numberOnionSlices;
        }
    },

    __proto__: WebInspector.VBox.prototype
}
