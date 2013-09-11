/*
 * Copyright (C) 2011 Brian Grinstead All rights reserved.
 *
 * Redistribution and use in source and binary forms, with or without
 * modification, are permitted provided that the following conditions
 * are met:
 *
 * 1.  Redistributions of source code must retain the above copyright
 *     notice, this list of conditions and the following disclaimer.
 * 2.  Redistributions in binary form must reproduce the above copyright
 *     notice, this list of conditions and the following disclaimer in the
 *     documentation and/or other materials provided with the distribution.
 * 3.  Neither the name of Apple Computer, Inc. ("Apple") nor the names of
 *     its contributors may be used to endorse or promote products derived
 *     from this software without specific prior written permission.
 *
 * THIS SOFTWARE IS PROVIDED BY APPLE AND ITS CONTRIBUTORS "AS IS" AND ANY
 * EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED
 * WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
 * DISCLAIMED. IN NO EVENT SHALL APPLE OR ITS CONTRIBUTORS BE LIABLE FOR ANY
 * DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES
 * (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES;
 * LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND
 * ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT
 * (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF
 * THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
 */

/**
 * @constructor
 * @extends {WebInspector.View}
 */
WebInspector.Spectrum = function()
{
    WebInspector.View.call(this);
    this.registerRequiredCSS("spectrum.css");

    this.element.className = "spectrum-container";
    this.element.tabIndex = 0;

    var topElement = this.element.createChild("div", "spectrum-top");
    topElement.createChild("div", "spectrum-fill");

    var topInnerElement = topElement.createChild("div", "spectrum-top-inner fill");
    this._draggerElement = topInnerElement.createChild("div", "spectrum-color");
    this._dragHelperElement = this._draggerElement.createChild("div", "spectrum-sat fill").createChild("div", "spectrum-val fill").createChild("div", "spectrum-dragger");

    this._sliderElement = topInnerElement.createChild("div", "spectrum-hue");
    this.slideHelper = this._sliderElement.createChild("div", "spectrum-slider");

    var rangeContainer = this.element.createChild("div", "spectrum-range-container");
    var alphaLabel = rangeContainer.createChild("label");
    alphaLabel.textContent = WebInspector.UIString("\u03B1:");

    this._alphaElement = rangeContainer.createChild("input", "spectrum-range");
    this._alphaElement.setAttribute("type", "range");
    this._alphaElement.setAttribute("min", "0");
    this._alphaElement.setAttribute("max", "100");
    this._alphaElement.addEventListener("change", alphaDrag.bind(this), false);

    var swatchElement = document.createElement("span");
    swatchElement.className = "swatch";
    this._swatchInnerElement = swatchElement.createChild("span", "swatch-inner");

    var displayContainer = this.element.createChild("div");
    displayContainer.appendChild(swatchElement);
    this._displayElement = displayContainer.createChild("span", "source-code spectrum-display-value");

    WebInspector.Spectrum.draggable(this._sliderElement, hueDrag.bind(this));
    WebInspector.Spectrum.draggable(this._draggerElement, colorDrag.bind(this), colorDragStart.bind(this));

    function hueDrag(element, dragX, dragY)
    {
        this._hsv[0] = (this.slideHeight - dragY) / this.slideHeight;

        this._onchange();
    }

    var initialHelperOffset;

    function colorDragStart(element, dragX, dragY)
    {
        initialHelperOffset = { x: this._dragHelperElement.offsetLeft, y: this._dragHelperElement.offsetTop };
    }

    function colorDrag(element, dragX, dragY, event)
    {
        if (event.shiftKey) {
            if (Math.abs(dragX - initialHelperOffset.x) >= Math.abs(dragY - initialHelperOffset.y))
                dragY = initialHelperOffset.y;
            else
                dragX = initialHelperOffset.x;
        }

        this._hsv[1] = dragX / this.dragWidth;
        this._hsv[2] = (this.dragHeight - dragY) / this.dragHeight;

        this._onchange();
    }

    function alphaDrag()
    {
        this._hsv[3] = this._alphaElement.value / 100;

        this._onchange();
    }
};

WebInspector.Spectrum.Events = {
    ColorChanged: "ColorChanged"
};

/**
 * @param {Function=} onmove
 * @param {Function=} onstart
 * @param {Function=} onstop
 */
WebInspector.Spectrum.draggable = function(element, onmove, onstart, onstop) {

    var doc = document;
    var dragging;
    var offset;
    var scrollOffset;
    var maxHeight;
    var maxWidth;

    function consume(e)
    {
        e.consume(true);
    }

    function move(e)
    {
        if (dragging) {
            var dragX = Math.max(0, Math.min(e.pageX - offset.left + scrollOffset.left, maxWidth));
            var dragY = Math.max(0, Math.min(e.pageY - offset.top + scrollOffset.top, maxHeight));

            if (onmove)
                onmove(element, dragX, dragY, e);
        }
    }

    function start(e)
    {
        var rightClick = e.which ? (e.which === 3) : (e.button === 2);

        if (!rightClick && !dragging) {

            if (onstart)
                onstart(element, e)

            dragging = true;
            maxHeight = element.clientHeight;
            maxWidth = element.clientWidth;

            scrollOffset = element.scrollOffset();
            offset = element.totalOffset();

            doc.addEventListener("selectstart", consume, false);
            doc.addEventListener("dragstart", consume, false);
            doc.addEventListener("mousemove", move, false);
            doc.addEventListener("mouseup", stop, false);

            move(e);
            consume(e);
        }
    }

    function stop(e)
    {
        if (dragging) {
            doc.removeEventListener("selectstart", consume, false);
            doc.removeEventListener("dragstart", consume, false);
            doc.removeEventListener("mousemove", move, false);
            doc.removeEventListener("mouseup", stop, false);

            if (onstop)
                onstop(element, e);
        }

        dragging = false;
    }

    element.addEventListener("mousedown", start, false);
};

WebInspector.Spectrum.prototype = {
    /**
     * @param {WebInspector.Color} color
     */
    setColor: function(color)
    {
        this._hsv = color.hsva();
    },

    /**
     * @return {WebInspector.Color}
     */
    color: function()
    {
        return WebInspector.Color.fromHSVA(this._hsv);
    },

    _colorString: function()
    {
        var cf = WebInspector.Color.Format;
        var format = this._originalFormat;
        var color = this.color();
        var originalFormatString = color.toString(this._originalFormat);
        if (originalFormatString)
            return originalFormatString;

        if (color.hasAlpha()) {
            // Everything except HSL(A) should be returned as RGBA if transparency is involved.
            if (format === cf.HSLA || format === cf.HSL)
                return color.toString(cf.HSLA);
            else
                return color.toString(cf.RGBA);
        }

        if (format === cf.ShortHEX)
            return color.toString(cf.HEX);
        console.assert(format === cf.Nickname);
        return color.toString(cf.RGB);
    },


    set displayText(text)
    {
        this._displayElement.textContent = text;
    },

    _onchange: function()
    {
        this._updateUI();
        this.dispatchEventToListeners(WebInspector.Spectrum.Events.ColorChanged, this._colorString());
    },

    _updateHelperLocations: function()
    {
        var h = this._hsv[0];
        var s = this._hsv[1];
        var v = this._hsv[2];

        // Where to show the little circle that displays your current selected color.
        var dragX = s * this.dragWidth;
        var dragY = this.dragHeight - (v * this.dragHeight);

        dragX = Math.max(-this._dragHelperElementHeight,
                        Math.min(this.dragWidth - this._dragHelperElementHeight, dragX - this._dragHelperElementHeight));
        dragY = Math.max(-this._dragHelperElementHeight,
                        Math.min(this.dragHeight - this._dragHelperElementHeight, dragY - this._dragHelperElementHeight));

        this._dragHelperElement.positionAt(dragX, dragY);

        // Where to show the bar that displays your current selected hue.
        var slideY = this.slideHeight - ((h * this.slideHeight) + this.slideHelperHeight);
        this.slideHelper.style.top = slideY + "px";

        this._alphaElement.value = this._hsv[3] * 100;
    },

    _updateUI: function()
    {
        this._updateHelperLocations();

        this._draggerElement.style.backgroundColor = WebInspector.Color.fromHSVA([this._hsv[0], 1, 1, 1]).toString(WebInspector.Color.Format.RGB);
        this._swatchInnerElement.style.backgroundColor = this.color().toString(WebInspector.Color.Format.RGBA);

        this._alphaElement.value = this._hsv[3] * 100;
    },

    wasShown: function()
    {
        this.slideHeight = this._sliderElement.offsetHeight;
        this.dragWidth = this._draggerElement.offsetWidth;
        this.dragHeight = this._draggerElement.offsetHeight;
        this._dragHelperElementHeight = this._dragHelperElement.offsetHeight / 2;
        this.slideHelperHeight = this.slideHelper.offsetHeight / 2;
        this._updateUI();
    },

    __proto__: WebInspector.View.prototype
}

/**
 * @constructor
 * @extends {WebInspector.Object}
 */
WebInspector.SpectrumPopupHelper = function()
{
    this._spectrum = new WebInspector.Spectrum();
    this._spectrum.element.addEventListener("keydown", this._onKeyDown.bind(this), false);

    this._popover = new WebInspector.Popover();
    this._popover.setCanShrink(false);
    this._popover.element.addEventListener("mousedown", consumeEvent, false);

    this._hideProxy = this.hide.bind(this, true);
}

WebInspector.SpectrumPopupHelper.Events = {
    Hidden: "Hidden"
};

WebInspector.SpectrumPopupHelper.prototype = {
    /**
     * @return {WebInspector.Spectrum}
     */
    spectrum: function()
    {
        return this._spectrum;
    },

    toggle: function(element, color, format)
    {
        if (this._popover.isShowing())
            this.hide(true);
        else
            this.show(element, color, format);

        return this._popover.isShowing();
    },

    show: function(element, color, format)
    {
        if (this._popover.isShowing()) {
            if (this._anchorElement === element)
                return false;

            // Reopen the picker for another anchor element.
            this.hide(true);
        }

        this._anchorElement = element;

        this._spectrum.setColor(color);
        this._spectrum._originalFormat = format !== WebInspector.Color.Format.Original ? format : color.format();
        this.reposition(element);

        document.addEventListener("mousedown", this._hideProxy, false);
        window.addEventListener("blur", this._hideProxy, false);
        return true;
    },

    reposition: function(element)
    {
        if (!this._previousFocusElement)
            this._previousFocusElement = WebInspector.currentFocusElement();
        this._popover.showView(this._spectrum, element);
        WebInspector.setCurrentFocusElement(this._spectrum.element);
    },

    /**
     * @param {boolean=} commitEdit
     */
    hide: function(commitEdit)
    {
        if (!this._popover.isShowing())
            return;
        this._popover.hide();

        document.removeEventListener("mousedown", this._hideProxy, false);
        window.removeEventListener("blur", this._hideProxy, false);

        this.dispatchEventToListeners(WebInspector.SpectrumPopupHelper.Events.Hidden, !!commitEdit);

        WebInspector.setCurrentFocusElement(this._previousFocusElement);
        delete this._previousFocusElement;

        delete this._anchorElement;
    },

    _onKeyDown: function(event)
    {
        if (event.keyIdentifier === "Enter") {
            this.hide(true);
            event.consume(true);
            return;
        }
        if (event.keyIdentifier === "U+001B") { // Escape key
            this.hide(false);
            event.consume(true);
        }
    },

    __proto__: WebInspector.Object.prototype
}

/**
 * @constructor
 */
WebInspector.ColorSwatch = function()
{
    this.element = document.createElement("span");
    this._swatchInnerElement = this.element.createChild("span", "swatch-inner");
    this.element.title = WebInspector.UIString("Click to open a colorpicker. Shift-click to change color format");
    this.element.className = "swatch";
    this.element.addEventListener("mousedown", consumeEvent, false);
    this.element.addEventListener("dblclick", consumeEvent, false);
}

WebInspector.ColorSwatch.prototype = {
    /**
     * @param {string} colorString
     */
    setColorString: function(colorString)
    {
        this._swatchInnerElement.style.backgroundColor = colorString;
    }
}
