/*
 * Copyright (C) 2009 Google Inc. All rights reserved.
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
 * @extends {WebInspector.Object}
 * @param {!Element} element
 */
WebInspector.StatusBarItem = function(element)
{
    this.element = element;
    this._enabled = true;
}

WebInspector.StatusBarItem.prototype = {
    /**
     * @param {boolean} value
     */
    setEnabled: function(value)
    {
        if (this._enabled === value)
            return;
        this._enabled = value;
        this._applyEnabledState();
    },

    /**
     * @protected
     */
    _applyEnabledState: function()
    {
        this.element.disabled = !this._enabled;
    },

    __proto__: WebInspector.Object.prototype
}

/**
 * @constructor
 * @extends {WebInspector.StatusBarItem}
 * @param {string} text
 * @param {string=} className
 */
WebInspector.StatusBarText = function(text, className)
{
    WebInspector.StatusBarItem.call(this, document.createElement("span"));
    this.element.className = "status-bar-item status-bar-text";
    if (className)
        this.element.addStyleClass(className);
    this.element.textContent = text;
}

WebInspector.StatusBarText.prototype = {
    /**
     * @param {string} text
     */
    setText: function(text)
    {
        this.element.textContent = text;
    },

    __proto__: WebInspector.StatusBarItem.prototype
}


/**
 * @constructor
 * @extends {WebInspector.StatusBarItem}
 * @param {string} title
 * @param {string} className
 * @param {number=} states
 */
WebInspector.StatusBarButton = function(title, className, states)
{
    WebInspector.StatusBarItem.call(this, document.createElement("button"));
    this.element.className = className + " status-bar-item";
    this.element.addEventListener("click", this._clicked.bind(this), false);

    this.glyph = document.createElement("div");
    this.glyph.className = "glyph";
    this.element.appendChild(this.glyph);

    this.glyphShadow = document.createElement("div");
    this.glyphShadow.className = "glyph shadow";
    this.element.appendChild(this.glyphShadow);

    this.states = states;
    if (!states)
        this.states = 2;

    if (states == 2)
        this._state = false;
    else
        this._state = 0;

    this.title = title;
    this.className = className;
    this._visible = true;
}

WebInspector.StatusBarButton.prototype = {
    _clicked: function()
    {
        this.dispatchEventToListeners("click");
        if (this._longClickInterval) {
            clearInterval(this._longClickInterval);
            delete this._longClickInterval;
        }
    },

    /**
     * @override
     */
    _applyEnabledState: function()
    {
        this.element.disabled = !this._enabled;
        if (this._longClickInterval) {
            clearInterval(this._longClickInterval);
            delete this._longClickInterval;
        }
    },

    /**
     * @return {boolean}
     */
    enabled: function()
    {
        return this._enabled;
    },

    get title()
    {
        return this._title;
    },

    set title(x)
    {
        if (this._title === x)
            return;
        this._title = x;
        this.element.title = x;
    },

    get state()
    {
        return this._state;
    },

    set state(x)
    {
        if (this._state === x)
            return;

        if (this.states === 2)
            this.element.enableStyleClass("toggled-on", x);
        else {
            this.element.removeStyleClass("toggled-" + this._state);
            if (x !== 0)
                this.element.addStyleClass("toggled-" + x);
        }
        this._state = x;
    },

    get toggled()
    {
        if (this.states !== 2)
            throw("Only used toggled when there are 2 states, otherwise, use state");
        return this.state;
    },

    set toggled(x)
    {
        if (this.states !== 2)
            throw("Only used toggled when there are 2 states, otherwise, use state");
        this.state = x;
    },

    get visible()
    {
        return this._visible;
    },

    set visible(x)
    {
        if (this._visible === x)
            return;

        this.element.enableStyleClass("hidden", !x);
        this._visible = x;
    },

    makeLongClickEnabled: function()
    {
        var boundMouseDown = mouseDown.bind(this);
        var boundMouseUp = mouseUp.bind(this);

        this.element.addEventListener("mousedown", boundMouseDown, false);
        this.element.addEventListener("mouseout", boundMouseUp, false);
        this.element.addEventListener("mouseup", boundMouseUp, false);

        var longClicks = 0;

        this._longClickData = { mouseUp: boundMouseUp, mouseDown: boundMouseDown };

        function mouseDown(e)
        {
            if (e.which !== 1)
                return;
            longClicks = 0;
            this._longClickInterval = setInterval(longClicked.bind(this), 200);
        }

        function mouseUp(e)
        {
            if (e.which !== 1)
                return;
            if (this._longClickInterval) {
                clearInterval(this._longClickInterval);
                delete this._longClickInterval;
            }
        }

        function longClicked()
        {
            ++longClicks;
            this.dispatchEventToListeners(longClicks === 1 ? "longClickDown" : "longClickPress");
        }
    },

    unmakeLongClickEnabled: function()
    {
        if (!this._longClickData)
            return;
        this.element.removeEventListener("mousedown", this._longClickData.mouseDown, false);
        this.element.removeEventListener("mouseout", this._longClickData.mouseUp, false);
        this.element.removeEventListener("mouseup", this._longClickData.mouseUp, false);
        delete this._longClickData;
    },

    /**
     * @param {?function():Array.<WebInspector.StatusBarButton>} buttonsProvider
     */
    setLongClickOptionsEnabled: function(buttonsProvider)
    {
        if (buttonsProvider) {
            if (!this._longClickOptionsData) {
                this.makeLongClickEnabled();

                this.longClickGlyph = document.createElement("div");
                this.longClickGlyph.className = "fill long-click-glyph";
                this.element.appendChild(this.longClickGlyph);

                this.longClickGlyphShadow = document.createElement("div");
                this.longClickGlyphShadow.className = "fill long-click-glyph shadow";
                this.element.appendChild(this.longClickGlyphShadow);

                var longClickDownListener = this._showOptions.bind(this);
                this.addEventListener("longClickDown", longClickDownListener, this);

                this._longClickOptionsData = {
                    glyphElement: this.longClickGlyph,
                    glyphShadowElement: this.longClickGlyphShadow,
                    longClickDownListener: longClickDownListener
                };
            }
            this._longClickOptionsData.buttonsProvider = buttonsProvider;
        } else {
            if (!this._longClickOptionsData)
                return;
            this.element.removeChild(this._longClickOptionsData.glyphElement);
            this.element.removeChild(this._longClickOptionsData.glyphShadowElement);

            this.removeEventListener("longClickDown", this._longClickOptionsData.longClickDownListener, this);
            delete this._longClickOptionsData;

            this.unmakeLongClickEnabled();
        }
    },

    _showOptions: function()
    {
        var buttons = this._longClickOptionsData.buttonsProvider();
        var mainButtonClone = new WebInspector.StatusBarButton(this.title, this.className, this.states);
        mainButtonClone.addEventListener("click", this._clicked, this);
        mainButtonClone.state = this.state;
        buttons.push(mainButtonClone);

        var mouseUpListener = mouseUp.bind(this);
        document.documentElement.addEventListener("mouseup", mouseUpListener, false);

        var optionsGlassPane = new WebInspector.GlassPane();
        var optionsBarElement = optionsGlassPane.element.createChild("div", "alternate-status-bar-buttons-bar");
        const buttonHeight = 23;

        var hostButtonPosition = this.element.totalOffset();

        var topNotBottom = hostButtonPosition.top < document.documentElement.offsetHeight / 2;

        if (topNotBottom)
            buttons = buttons.reverse();

        optionsBarElement.style.height = (buttonHeight * buttons.length) + "px";
        if (topNotBottom)
            optionsBarElement.style.top = (hostButtonPosition.top + 1) + "px";
        else
            optionsBarElement.style.top = (hostButtonPosition.top - (buttonHeight * (buttons.length - 1))) + "px";
        optionsBarElement.style.left = (hostButtonPosition.left + 1) + "px";

        var boundMouseOver = mouseOver.bind(this);
        var boundMouseOut = mouseOut.bind(this);
        for (var i = 0; i < buttons.length; ++i) {
            buttons[i].element.addEventListener("mousemove", boundMouseOver, false);
            buttons[i].element.addEventListener("mouseout", boundMouseOut, false);
            optionsBarElement.appendChild(buttons[i].element);
        }
        var hostButtonIndex = topNotBottom ? 0 : buttons.length - 1;
        buttons[hostButtonIndex].element.addStyleClass("emulate-active");

        function mouseOver(e)
        {
            if (e.which !== 1)
                return;
            var buttonElement = e.target.enclosingNodeOrSelfWithClass("status-bar-item");
            buttonElement.addStyleClass("emulate-active");
        }

        function mouseOut(e)
        {
            if (e.which !== 1)
                return;
            var buttonElement = e.target.enclosingNodeOrSelfWithClass("status-bar-item");
            buttonElement.removeStyleClass("emulate-active");
        }

        function mouseUp(e)
        {
            if (e.which !== 1)
                return;
            optionsGlassPane.dispose();
            document.documentElement.removeEventListener("mouseup", mouseUpListener, false);

            for (var i = 0; i < buttons.length; ++i) {
                if (buttons[i].element.hasStyleClass("emulate-active")) {
                    buttons[i].element.removeStyleClass("emulate-active");
                    buttons[i]._clicked();
                    break;
                }
            }
        }
    },

    __proto__: WebInspector.StatusBarItem.prototype
}

/**
 * @constructor
 * @extends {WebInspector.StatusBarItem}
 * @param {?function(Event)} changeHandler
 * @param {string=} className
 */
WebInspector.StatusBarComboBox = function(changeHandler, className)
{
    WebInspector.StatusBarItem.call(this, document.createElement("span"));
    this.element.className = "status-bar-select-container";

    this._selectElement = this.element.createChild("select", "status-bar-item");
    this.element.createChild("div", "status-bar-select-arrow");
    if (changeHandler)
        this._selectElement.addEventListener("change", changeHandler, false);
    if (className)
        this._selectElement.addStyleClass(className);
}

WebInspector.StatusBarComboBox.prototype = {
    /**
     * @return {!Element}
     */
    selectElement: function()
    {
        return this._selectElement;
    },

    /**
     * @return {number}
     */
    size: function()
    {
        return this._selectElement.childElementCount;
    },

    /**
     * @param {!Element} option
     */
    addOption: function(option)
    {
        this._selectElement.appendChild(option);
    },

    /**
     * @param {string} label
     * @param {string=} title
     * @param {string=} value
     * @return {!Element}
     */
    createOption: function(label, title, value)
    {
        var option = this._selectElement.createChild("option");
        option.text = label;
        if (title)
            option.title = title;
        if (typeof value !== "undefined")
            option.value = value;
        return option;
    },

    /**
     * @override
     */
    _applyEnabledState: function()
    {
        this._selectElement.disabled = !this._enabled;
    },

    /**
     * @param {!Element} option
     */
    removeOption: function(option)
    {
        this._selectElement.removeChild(option);
    },

    removeOptions: function()
    {
        this._selectElement.removeChildren();
    },

    /**
     * @return {?Element}
     */
    selectedOption: function()
    {
        if (this._selectElement.selectedIndex >= 0)
            return this._selectElement[this._selectElement.selectedIndex];
        return null;
    },

    /**
     * @param {Element} option
     */
    select: function(option)
    {
        this._selectElement.selectedIndex = Array.prototype.indexOf.call(this._selectElement, option);
    },

    /**
     * @param {number} index
     */
    setSelectedIndex: function(index)
    {
        this._selectElement.selectedIndex = index;
    },

    /**
     * @return {number}
     */
    selectedIndex: function()
    {
        return this._selectElement.selectedIndex;
    },

    __proto__: WebInspector.StatusBarItem.prototype
}
