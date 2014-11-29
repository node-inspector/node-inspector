// Copyright (c) 2014 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

/**
 * @constructor
 * @extends {WebInspector.ElementsSidebarPane}
 */
WebInspector.AnimationsSidebarPane = function(stylesPane)
{
    WebInspector.ElementsSidebarPane.call(this, WebInspector.UIString("Animations"));
    this._stylesPane = stylesPane;

    this.headerElement = createElementWithClass("div", "animationsHeader");
    this._showSubtreeSetting = WebInspector.settings.createSetting("showSubtreeAnimations", true);
    this._showSubtreeSetting.addChangeListener(this._showSubtreeSettingChanged.bind(this));
    this._globalControls = new WebInspector.AnimationsSidebarPane.GlobalAnimationControls(this._showSubtreeSetting);
    this.headerElement.appendChild(this._globalControls.element);

    this._emptyElement = createElement("div");
    this._emptyElement.className = "info";
    this._emptyElement.textContent = WebInspector.UIString("No Animations");
    this.animationsElement = createElement("div");
    this.animationsElement.appendChild(this._emptyElement);

    this._animationSections = [];

    this.bodyElement.appendChild(this.headerElement);
    this.bodyElement.appendChild(this.animationsElement);
}

/**
 * @param {!WebInspector.Setting} setting
 * @return {!Element}
 */
WebInspector.AnimationsSidebarPane._showSubtreeAnimationsCheckbox = function(setting)
{
    if (!WebInspector.AnimationsSidebarPane._showSubtreeAnimationsCheckboxElement) {
        WebInspector.AnimationsSidebarPane._showSubtreeAnimationsCheckboxElement = WebInspector.SettingsUI.createSettingCheckbox(WebInspector.UIString("Show subtree animations"), setting, true);
        WebInspector.AnimationsSidebarPane._showSubtreeAnimationsCheckboxElement.classList.add("checkbox-with-label");
    }
    return WebInspector.AnimationsSidebarPane._showSubtreeAnimationsCheckboxElement;
}

WebInspector.AnimationsSidebarPane.prototype = {
    /**
     * @param {?WebInspector.DOMNode} node
     */
    setNode: function(node)
    {
        WebInspector.ElementsSidebarPane.prototype.setNode.call(this, node);
        if (!node)
            return;
        this._updateTarget(node.target());
    },

    /**
     * @param {!WebInspector.Target} target
     */
    _updateTarget: function(target)
    {
        if (this._target === target)
            return;
        if (this._target)
            this._target.animationModel.removeEventListener(WebInspector.AnimationModel.Events.AnimationPlayerCreated, this._animationPlayerCreated, this);
        this._target = target;
        this._target.animationModel.addEventListener(WebInspector.AnimationModel.Events.AnimationPlayerCreated, this._animationPlayerCreated, this);
    },

    _showSubtreeSettingChanged: function()
    {
        this._forceUpdate = true;
        this.update();
    },

    /**
     * @param {!WebInspector.Event} event
     */
    _animationPlayerCreated: function(event)
    {
        this._addAnimationPlayer(/** @type {!WebInspector.AnimationModel.AnimationPlayer} */ (event.data));
    },

    /**
     * @param {!WebInspector.AnimationModel.AnimationPlayer} player
     */
    _addAnimationPlayer: function(player)
    {
        if (this.animationsElement.hasChildNodes() && !this._animationSections.length)
            this.animationsElement.removeChild(this._emptyElement);
        var section = new WebInspector.AnimationSection(this, this._stylesPane, player);
        if (this._animationSections.length < 10)
            section.expand(true);
        this._animationSections.push(section);
        this.animationsElement.appendChild(section.element);

        if (this._animationSections.length > 100)
            this._target.animationModel.stopListening();
    },

    /**
     * @param {!WebInspector.Throttler.FinishCallback} finishCallback
     * @protected
     */
    doUpdate: function(finishCallback)
    {
        /**
         * @param {?Array.<!WebInspector.AnimationModel.AnimationPlayer>} animationPlayers
         * @this {WebInspector.AnimationsSidebarPane}
         */
        function animationPlayersCallback(animationPlayers)
        {
            this.animationsElement.removeChildren();
            this._animationSections = [];
            if (!animationPlayers || !animationPlayers.length) {
                this.animationsElement.appendChild(this._emptyElement);
                finishCallback();
                return;
            }
            for (var i = 0; i < animationPlayers.length; ++i)
                this._addAnimationPlayer(animationPlayers[i]);
            finishCallback();
        }

        if (!this.node()) {
            this._globalControls.reset();
            finishCallback();
            return;
        }

        if (!this._forceUpdate && this._selectedNode === this.node()) {
            for (var i = 0; i < this._animationSections.length; ++i)
                this._animationSections[i].updateCurrentTime();
            finishCallback();
            return;
        }

        this._forceUpdate = false;
        this._selectedNode = this.node();
        this.node().target().animationModel.getAnimationPlayers(this.node().id, this._showSubtreeSetting.get(), animationPlayersCallback.bind(this));
        this.node().target().animationModel.startListening(this.node().id, this._showSubtreeSetting.get());
    },

    __proto__: WebInspector.ElementsSidebarPane.prototype
}

/**
 * @constructor
 * @param {!WebInspector.AnimationsSidebarPane} parentPane
 * @param {!WebInspector.StylesSidebarPane} stylesPane
 * @param {?WebInspector.AnimationModel.AnimationPlayer} animationPlayer
 */
WebInspector.AnimationSection = function(parentPane, stylesPane, animationPlayer)
{
    this._parentPane = parentPane;
    this._stylesPane = stylesPane;
    this._propertiesElement = createElement("div");
    this._keyframesElement = createElement("div");
    this._setAnimationPlayer(animationPlayer);

    this._updateThrottler = new WebInspector.Throttler(WebInspector.AnimationSection.updateTimeout);

    this.element = createElement("div");
    this.element.appendChild(this._createHeader());
    this.bodyElement = this.element.createChild("div", "animationSectionBody");
    this.bodyElement.appendChild(this._createAnimationControls());
    this.bodyElement.appendChild(this._propertiesElement);
    this.bodyElement.appendChild(this._keyframesElement);
}

WebInspector.AnimationSection.updateTimeout = 100;

WebInspector.AnimationSection.prototype = {
    /**
     * @return {boolean}
     */
    _expanded: function()
    {
        return this.bodyElement.classList.contains("expanded");
    },

    _toggle: function()
    {
        this.bodyElement.classList.toggle("expanded");
        this.updateCurrentTime();
    },

    /**
     * @param {boolean} expanded
     */
    expand: function(expanded)
    {
        this.bodyElement.classList.toggle("expanded", expanded);
        this.updateCurrentTime();
    },

    updateCurrentTime: function()
    {
        if (this._expanded())
            this._updateThrottler.schedule(this._updateCurrentTime.bind(this), false);
    },

    /**
     * @param {!WebInspector.Throttler.FinishCallback} finishCallback
     */
    _updateCurrentTime: function(finishCallback)
    {
        /**
         * @param {number} currentTime
         * @param {boolean} isRunning
         * @this {WebInspector.AnimationSection}
         */
        function updateSliderCallback(currentTime, isRunning)
        {
            if (isRunning && this._parentPane.isShowing()) {
                this.currentTimeSlider.value = this.player.source().iterationCount() == null ? currentTime % this.player.source().duration() : currentTime;
                finishCallback();
                this.updateCurrentTime();
            } else {
                this.player.payload().pausedState = true;
                this._updatePauseButton(true);
                finishCallback();
            }
        }
        this.player.getCurrentState(updateSliderCallback.bind(this));
    },

    /**
     * @return {!Element}
     */
    _createCurrentTimeSlider: function()
    {
        /**
         * @this {WebInspector.AnimationSection}
         */
        function sliderMouseDown()
        {
            this.player.pause(this._setAnimationPlayer.bind(this));
            this._isPaused = this.player.paused();
        }

        /**
         * @this {WebInspector.AnimationSection}
         */
        function sliderMouseUp()
        {
            if (this._isPaused)
                return;
            this.player.play(this._setAnimationPlayer.bind(this));
            this._updatePauseButton(false);
            this.updateCurrentTime();
        }

        /**
         * @param {!Event} e
         * @this {WebInspector.AnimationSection}
         */
        function sliderInputHandler(e)
        {
            this.player.setCurrentTime(parseFloat(e.target.value), this._setAnimationPlayer.bind(this));
        }

        var iterationDuration = this.player.source().duration();
        var iterationCount = this.player.source().iterationCount();
        var slider = createElement("input");
        slider.type = "range";
        slider.min = 0;
        slider.step = 0.01;

        if (!iterationCount) {
            // Infinite iterations
            slider.max = iterationDuration;
            slider.value = this.player.currentTime() % iterationDuration;
        } else {
            slider.max = iterationCount * iterationDuration;
            slider.value = this.player.currentTime();
        }

        slider.addEventListener("input", sliderInputHandler.bind(this));
        slider.addEventListener("mousedown", sliderMouseDown.bind(this));
        slider.addEventListener("mouseup", sliderMouseUp.bind(this));

        this.updateCurrentTime();
        return slider;
    },

    /**
     * @return {!Element}
     */
    _createHeader: function()
    {
        /**
         * @param {?WebInspector.DOMNode} node
         */
        function nodeResolved(node)
        {
            headerElement.addEventListener("mouseover", node.highlight.bind(node, undefined, undefined), false);
            headerElement.addEventListener("mouseleave", node.domModel().hideDOMNodeHighlight.bind(node.domModel()), false);
        }

        var headerElement = createElementWithClass("div", "sidebar-separator");
        var id = this.player.source().name() ? this.player.source().name() : this.player.id();
        headerElement.createTextChild(WebInspector.UIString("Animation") + " " + id);
        headerElement.addEventListener("click", this._toggle.bind(this), false);
        this.player.source().getNode(nodeResolved);
        return headerElement;
    },

    /**
     * @param {boolean} paused
     */
    _updatePauseButton: function(paused)
    {
        this._pauseButton.setToggled(paused);
        this._pauseButton.setTitle(paused ? WebInspector.UIString("Play animation") : WebInspector.UIString("Pause animation"));
    },

    /**
     * @return {!Element}
     */
    _createAnimationControls: function()
    {
        /**
         * @this {WebInspector.AnimationSection}
         */
        function pauseButtonHandler()
        {
            if (this.player.paused()) {
                this.player.play(this._setAnimationPlayer.bind(this));
                this._updatePauseButton(false);
                this.updateCurrentTime();
            } else {
                this.player.pause(this._setAnimationPlayer.bind(this));
                this._updatePauseButton(true);
            }
        }

        this._pauseButton = new WebInspector.StatusBarButton("", "pause-status-bar-item");
        this._pauseButton.element.style.display = "inline-block";
        this._updatePauseButton(this.player.paused());
        this._pauseButton.addEventListener("click", pauseButtonHandler, this);

        this.currentTimeSlider = this._createCurrentTimeSlider();

        var controls = createElement("div");
        var shadowRoot = controls.createShadowRoot();
        shadowRoot.appendChild(WebInspector.View.createStyleElement("ui/statusBar.css"));
        shadowRoot.appendChild(this._pauseButton.element);
        shadowRoot.appendChild(this.currentTimeSlider);

        return controls;
    },

    /**
     * @param {?WebInspector.AnimationModel.AnimationPlayer} p
     */
    _setAnimationPlayer: function(p)
    {
        if (!p || p === this.player)
            return;
        this.player = p;
        this._propertiesElement.removeChildren();
        var animationObject = {
            "playState": p.playState(),
            "start-time": p.startTime(),
            "player-playback-rate": p.playbackRate(),
            "id": p.id(),
            "start-delay": p.source().startDelay(),
            "playback-rate": p.source().playbackRate(),
            "iteration-start": p.source().iterationStart(),
            "iteration-count": p.source().iterationCount(),
            "duration": p.source().duration(),
            "direction": p.source().direction(),
            "fill-mode": p.source().fillMode(),
            "time-fraction": p.source().timeFraction()
        };
        var obj = WebInspector.RemoteObject.fromLocalObject(animationObject);
        var objSection = new WebInspector.ObjectPropertiesSection(obj, WebInspector.UIString("Animation Properties"));
        this._propertiesElement.appendChild(objSection.element);

        if (this.player.source().keyframesRule()) {
            var keyframes = this.player.source().keyframesRule().keyframes();
            for (var j = 0; j < keyframes.length; j++) {
                var animationCascade = new WebInspector.SectionCascade();
                var model = animationCascade.appendModelFromStyle(keyframes[j].style(), keyframes[j].offset());
                model.setIsAttribute(true);
                model.setEditable(true);
                var styleSection = new WebInspector.StylePropertiesSection(this._stylesPane, model);
                styleSection.expanded = true;
                this._keyframesElement.appendChild(styleSection.element);
            }
        }
    }
}

WebInspector.AnimationsSidebarPane._globalPlaybackRates = [0.1, 0.25, 0.5, 1.0, 2.0];

/**
 * @constructor
 * @extends {WebInspector.StatusBar}
 * @param {!WebInspector.Setting} showSubtreeAnimationsSetting
 */
WebInspector.AnimationsSidebarPane.GlobalAnimationControls = function(showSubtreeAnimationsSetting)
{
    WebInspector.StatusBar.call(this);
    this.element.classList.add("global-animations-toolbar");

    var labelElement = createElement("div");
    labelElement.createTextChild("Global playback:");
    this.appendStatusBarItem(new WebInspector.StatusBarItem(labelElement));

    this._pauseButton = new WebInspector.StatusBarButton("", "pause-status-bar-item");
    this._pauseButton.addEventListener("click", this._pauseHandler.bind(this), this);
    this.appendStatusBarItem(this._pauseButton);
    this._playbackRateButtons = [];
    WebInspector.AnimationsSidebarPane._globalPlaybackRates.forEach(this._createPlaybackRateButton.bind(this));

    var subtreeCheckboxLabel = WebInspector.UIString("Show subtree animations");
    this._showSubtreeAnimationsCheckbox = new WebInspector.StatusBarCheckbox(subtreeCheckboxLabel, subtreeCheckboxLabel, showSubtreeAnimationsSetting);
    this.appendStatusBarItem(this._showSubtreeAnimationsCheckbox);

    this.reset();
}

WebInspector.AnimationsSidebarPane.GlobalAnimationControls.prototype = {
    /**
     * @param {number} playbackRate
     */
    _createPlaybackRateButton: function(playbackRate)
    {
        var button = new WebInspector.StatusBarTextButton(WebInspector.UIString("Set all animations playback rate to " + playbackRate + "x"), "playback-rate-button", playbackRate + "x");
        button.playbackRate = playbackRate;
        button.addEventListener("click", this._playbackRateHandler.bind(this, playbackRate), this);
        this._playbackRateButtons.push(button);
        this.appendStatusBarItem(button);
    },

    reset: function()
    {
        this._paused = false;
        this._playbackRate = 1.0;
        this._updateControls();
    },

    _updateControls: function()
    {
        this._updatePauseButton();
        for (var i = 0; i < this._playbackRateButtons.length; i++)
            this._playbackRateButtons[i].setToggled(this._playbackRateButtons[i].playbackRate === this._playbackRate);
    },

    _updatePauseButton: function()
    {
        this._pauseButton.setToggled(this._paused);
        this._pauseButton.setTitle(this._paused ? WebInspector.UIString("Resume all animations") : WebInspector.UIString("Pause all animations"));
    },

    _pauseHandler: function()
    {
        this._paused = !this._paused;
        PageAgent.setAnimationsPlaybackRate(this._paused ? 0 : this._playbackRate);
        this._updatePauseButton();
    },

    /**
     * @param {number} playbackRate
     */
    _playbackRateHandler: function(playbackRate)
    {
        this._playbackRate = playbackRate;
        this._updateControls();
        PageAgent.setAnimationsPlaybackRate(this._paused ? 0 : this._playbackRate);
    },

    __proto__: WebInspector.StatusBar.prototype
}
