// Copyright 2015 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

/**
 * @constructor
 * @extends {WebInspector.HBox}
 */
WebInspector.FilmStripView = function()
{
    WebInspector.HBox.call(this, true);
    this.registerRequiredCSS("components_lazy/filmStripView.css");
    this.contentElement.classList.add("film-strip-view");
    this._statusLabel = this.contentElement.createChild("div", "label");
    this.reset();
    this.setMode(WebInspector.FilmStripView.Modes.TimeBased);
}

WebInspector.FilmStripView.Events = {
    FrameSelected: "FrameSelected",
    FrameEnter: "FrameEnter",
    FrameExit: "FrameExit",
}

WebInspector.FilmStripView.Modes = {
    TimeBased: "TimeBased",
    FrameBased: "FrameBased"
}

WebInspector.FilmStripView.prototype = {
    /**
     * @param {string} mode
     */
    setMode: function(mode)
    {
        this._mode = mode;
        this.contentElement.classList.toggle("time-based", mode === WebInspector.FilmStripView.Modes.TimeBased);
        this.update();
    },

    /**
     * @param {!WebInspector.FilmStripModel} filmStripModel
     * @param {number} zeroTime
     * @param {number} spanTime
     */
    setModel: function(filmStripModel, zeroTime, spanTime)
    {
        this._model = filmStripModel;
        this._zeroTime = zeroTime;
        this._spanTime = spanTime;
        var frames = filmStripModel.frames();
        if (!frames.length) {
            this.reset();
            return;
        }
        this.update();
    },

    /**
     * @param {!WebInspector.FilmStripModel.Frame} frame
     * @return {!Promise<!Element>}
     */
    createFrameElement: function(frame)
    {
        var time = frame.timestamp;
        var element = createElementWithClass("div", "frame");
        element.title = WebInspector.UIString("Doubleclick to zoom image. Click to view preceding requests.");
        element.createChild("div", "time").textContent = Number.millisToString(time - this._zeroTime);
        var imageElement = element.createChild("div", "thumbnail").createChild("img");
        element.addEventListener("mousedown", this._onMouseEvent.bind(this, WebInspector.FilmStripView.Events.FrameSelected, time), false);
        element.addEventListener("mouseenter", this._onMouseEvent.bind(this, WebInspector.FilmStripView.Events.FrameEnter, time), false);
        element.addEventListener("mouseout", this._onMouseEvent.bind(this, WebInspector.FilmStripView.Events.FrameExit, time), false);
        element.addEventListener("dblclick", this._onDoubleClick.bind(this, frame), false);

        return frame.imageDataPromise().then(WebInspector.FilmStripView._setImageData.bind(null, imageElement)).then(returnElement);
        /**
         * @return {!Element}
         */
        function returnElement()
        {
            return element;
        }
    },

    /**
     * @param {number} time
     * @return {!WebInspector.FilmStripModel.Frame}
     */
    frameByTime: function(time)
    {
        /**
         * @param {number} time
         * @param {!WebInspector.FilmStripModel.Frame} frame
         * @return {number}
         */
        function comparator(time, frame)
        {
            return time - frame.timestamp;
        }
        // Using the first frame to fill the interval between recording start
        // and a moment the frame is taken.
        var frames = this._model.frames();
        var index = Math.max(frames.upperBound(time, comparator) - 1, 0);
        return frames[index];
    },

    update: function()
    {
        if (!this._model)
            return;
        var frames = this._model.frames();
        if (!frames.length)
            return;

        if (this._mode === WebInspector.FilmStripView.Modes.FrameBased) {
            Promise.all(frames.map(this.createFrameElement.bind(this))).then(appendElements.bind(this));
            return;
        }

        var width = this.contentElement.clientWidth;
        var scale = this._spanTime / width;
        this.createFrameElement(frames[0]).then(continueWhenFrameImageLoaded.bind(this));  // Calculate frame width basing on the first frame.

        /**
         * @this {WebInspector.FilmStripView}
         * @param {!Element} element0
         */
        function continueWhenFrameImageLoaded(element0)
        {
            var frameWidth = Math.ceil(WebInspector.measurePreferredSize(element0, this.contentElement).width);
            if (!frameWidth)
                return;

            var promises = [];
            for (var pos = frameWidth; pos < width; pos += frameWidth) {
                var time = pos * scale + this._zeroTime;
                promises.push(this.createFrameElement(this.frameByTime(time)).then(fixWidth));
            }
            Promise.all(promises).then(appendElements.bind(this));
            /**
             * @param {!Element} element
             * @return {!Element}
             */
            function fixWidth(element)
            {
                element.style.width = frameWidth + "px";
                return element;
            }
        }

        /**
         * @param {!Array.<!Element>} elements
         * @this {WebInspector.FilmStripView}
         */
        function appendElements(elements)
        {
            this.contentElement.removeChildren();
            for (var i = 0; i < elements.length; ++i)
                this.contentElement.appendChild(elements[i]);
        }
    },

    /**
     * @override
     */
    onResize: function()
    {
        if (this._mode === WebInspector.FilmStripView.Modes.FrameBased)
            return;
        this.update();
    },

    /**
     * @param {string} eventName
     * @param {number} timestamp
     */
    _onMouseEvent: function(eventName, timestamp)
    {
        this.dispatchEventToListeners(eventName, timestamp);
    },

    /**
     * @param {!WebInspector.FilmStripModel.Frame} filmStripFrame
     */
    _onDoubleClick: function(filmStripFrame)
    {
        new WebInspector.FilmStripView.DialogDelegate(filmStripFrame, this._zeroTime);
    },

    reset: function()
    {
        this._zeroTime = 0;
        this.contentElement.removeChildren();
        this.contentElement.appendChild(this._statusLabel);
    },

    /**
     * @param {string} text
     */
    setStatusText: function(text)
    {
        this._statusLabel.textContent = text;
    },

    __proto__: WebInspector.HBox.prototype
}

/**
 * @param {!Element} imageElement
 * @param {?string} data
 */
WebInspector.FilmStripView._setImageData = function(imageElement, data)
{
    if (data)
        imageElement.src = "data:image/jpg;base64," + data;
}

/**
 * @constructor
 * @extends {WebInspector.DialogDelegate}
 * @param {!WebInspector.FilmStripModel.Frame} filmStripFrame
 * @param {number=} zeroTime
 */
WebInspector.FilmStripView.DialogDelegate = function(filmStripFrame, zeroTime)
{
    WebInspector.DialogDelegate.call(this);
    var shadowRoot = WebInspector.createShadowRootWithCoreStyles(this.element);
    shadowRoot.appendChild(WebInspector.Widget.createStyleElement("components_lazy/filmStripDialog.css"));
    this._contentElement = shadowRoot.createChild("div", "filmstrip-dialog");
    this._contentElement.tabIndex = 0;

    this._frames = filmStripFrame.model().frames();
    this._index = filmStripFrame.index;
    this._zeroTime = zeroTime || filmStripFrame.model().zeroTime();

    this._imageElement = this._contentElement.createChild("img");
    var footerElement = this._contentElement.createChild("div", "filmstrip-dialog-footer");
    footerElement.createChild("div", "flex-auto");
    var prevButton = createTextButton("\u25C0", this._onPrevFrame.bind(this), undefined, WebInspector.UIString("Previous frame"));
    footerElement.appendChild(prevButton);
    this._timeLabel = footerElement.createChild("div", "filmstrip-dialog-label");
    var nextButton = createTextButton("\u25B6", this._onNextFrame.bind(this), undefined, WebInspector.UIString("Next frame"));
    footerElement.appendChild(nextButton);
    footerElement.createChild("div", "flex-auto");

    this._contentElement.addEventListener("keydown", this._keyDown.bind(this), false);
    this._render().then(WebInspector.Dialog.show.bind(null, this));
}

WebInspector.FilmStripView.DialogDelegate.prototype = {
    /**
     * @override
     */
    focus: function()
    {
        this._contentElement.focus();
    },

    /**
     * @param {!Event} event
     */
    _keyDown: function(event)
    {
        switch (event.keyIdentifier) {
        case "Left":
            if (WebInspector.isMac() && event.metaKey)
                this._onFirstFrame();
            else
                this._onPrevFrame();
            break;

        case "Right":
            if (WebInspector.isMac() && event.metaKey)
                this._onLastFrame();
            else
                this._onNextFrame();
            break;

        case "Home":
            this._onFirstFrame();
            break;

        case "End":
            this._onLastFrame();
            break;
        }
    },

    _onPrevFrame: function()
    {
        if (this._index > 0)
            --this._index;
        this._render();
    },

    _onNextFrame: function()
    {
        if (this._index < this._frames.length - 1)
            ++this._index;
        this._render();
    },

    _onFirstFrame: function()
    {
        this._index = 0;
        this._render();
    },

    _onLastFrame: function()
    {
        this._index = this._frames.length - 1;
        this._render();
    },

    /**
     * @return {!Promise<undefined>}
     */
    _render: function()
    {
        var frame = this._frames[this._index];
        this._timeLabel.textContent = Number.millisToString(frame.timestamp - this._zeroTime);
        return frame.imageDataPromise().then(WebInspector.FilmStripView._setImageData.bind(null, this._imageElement));
    },

    __proto__: WebInspector.DialogDelegate.prototype
}
