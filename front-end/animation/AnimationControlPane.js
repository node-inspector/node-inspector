// Copyright (c) 2015 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

/**
 * @constructor
 * @extends {WebInspector.StylesSidebarPane.BaseToolbarPaneWidget}
 */
WebInspector.AnimationControlPane = function(toolbarItem)
{
    WebInspector.StylesSidebarPane.BaseToolbarPaneWidget.call(this, toolbarItem);
    this._animationsPaused = false;
    this._animationsPlaybackRate = 1;

    this.element.className =  "styles-animations-controls-pane";
    this.element.createChild("div").createTextChild("Animations");
    var container = this.element.createChild("div", "animations-controls");

    var toolbar = new WebInspector.Toolbar();
    this._animationsPauseButton = new WebInspector.ToolbarButton("", "pause-toolbar-item");
    toolbar.appendToolbarItem(this._animationsPauseButton);
    this._animationsPauseButton.addEventListener("click", this._pauseButtonHandler.bind(this));
    container.appendChild(toolbar.element);

    this._animationsPlaybackSlider = container.createChild("input");
    this._animationsPlaybackSlider.type = "range";
    this._animationsPlaybackSlider.min = 0;
    this._animationsPlaybackSlider.max = WebInspector.AnimationTimeline.GlobalPlaybackRates.length - 1;
    this._animationsPlaybackSlider.value = this._animationsPlaybackSlider.max;
    this._animationsPlaybackSlider.addEventListener("input", this._playbackSliderInputHandler.bind(this));

    this._animationsPlaybackLabel = container.createChild("div", "playback-label");
    this._animationsPlaybackLabel.createTextChild("1x");
}

WebInspector.AnimationControlPane.prototype = {

    /**
     * @param {!Event} event
     */
    _playbackSliderInputHandler: function (event)
    {
        this._animationsPlaybackRate = WebInspector.AnimationTimeline.GlobalPlaybackRates[event.target.value];
        WebInspector.AnimationModel.fromTarget(this._target).setPlaybackRate(this._animationsPaused ? 0 : this._animationsPlaybackRate);
        this._animationsPlaybackLabel.textContent = this._animationsPlaybackRate + "x";
        WebInspector.userMetrics.AnimationsPlaybackRateChanged.record();
    },

    _pauseButtonHandler: function ()
    {
        this._animationsPaused = !this._animationsPaused;
        WebInspector.AnimationModel.fromTarget(this._target).setPlaybackRate(this._animationsPaused ? 0 : this._animationsPlaybackRate);
        WebInspector.userMetrics.AnimationsPlaybackRateChanged.record();
        this._animationsPauseButton.element.classList.toggle("pause-toolbar-item");
        this._animationsPauseButton.element.classList.toggle("play-toolbar-item");
    },

    /**
     * @param {!WebInspector.Event=} event
     */
    _updateAnimationsPlaybackRate: function(event)
    {
        /**
         * @param {?Protocol.Error} error
         * @param {number} playbackRate
         * @this {WebInspector.AnimationControlPane}
         */
        function setPlaybackRate(error, playbackRate)
        {
            this._animationsPlaybackSlider.value = WebInspector.AnimationTimeline.GlobalPlaybackRates.indexOf(playbackRate);
            this._animationsPlaybackLabel.textContent = playbackRate + "x";
        }

        if (this._target)
            this._target.animationAgent().getPlaybackRate(setPlaybackRate.bind(this));
    },

    /**
     * @override
     * @param {?WebInspector.DOMNode} node
     */
    onNodeChanged: function(node)
    {
        if (!node)
            return;

        if (this._target)
            this._target.resourceTreeModel.removeEventListener(WebInspector.ResourceTreeModel.EventTypes.MainFrameNavigated, this._updateAnimationsPlaybackRate, this);

        this._target = node.target();
        this._target.resourceTreeModel.addEventListener(WebInspector.ResourceTreeModel.EventTypes.MainFrameNavigated, this._updateAnimationsPlaybackRate, this);
        this._updateAnimationsPlaybackRate();
    },

    __proto__: WebInspector.StylesSidebarPane.BaseToolbarPaneWidget.prototype
}

/**
 * @constructor
 * @implements {WebInspector.ToolbarItem.Provider}
 */
WebInspector.AnimationControlPane.ButtonProvider = function()
{
    this._button = new WebInspector.ToolbarButton(WebInspector.UIString("Toggle animation controls"), "animation-toolbar-item");
    this._button.addEventListener("click", this._clicked, this);
    WebInspector.context.addFlavorChangeListener(WebInspector.DOMNode, this._nodeChanged, this);
    this._nodeChanged();
}

WebInspector.AnimationControlPane.ButtonProvider.prototype = {
    /**
     * @param {boolean} toggleOn
     */
    _toggleAnimationTimelineMode: function(toggleOn)
    {
        if (!this._animationTimeline)
            this._animationTimeline = new WebInspector.AnimationTimeline();
        this._button.setToggled(toggleOn);
        var elementsPanel = WebInspector.ElementsPanel.instance();
        elementsPanel.setWidgetBelowDOM(toggleOn ? this._animationTimeline : null);
    },

    /**
     * @param {boolean} toggleOn
     */
    _toggleAnimationControlPaneMode: function(toggleOn)
    {
        if (!this._animationsControlPane)
            this._animationsControlPane = new WebInspector.AnimationControlPane(this.item());
        var stylesSidebarPane = WebInspector.ElementsPanel.instance().sidebarPanes.styles;
        stylesSidebarPane.showToolbarPane(toggleOn ? this._animationsControlPane : null);
    },

    _clicked: function()
    {
        if (Runtime.experiments.isEnabled("animationInspection"))
            this._toggleAnimationTimelineMode(!this._button.toggled());
        else
            this._toggleAnimationControlPaneMode(!this._button.toggled());
    },

    _nodeChanged: function()
    {
        var node = WebInspector.context.flavor(WebInspector.DOMNode);
        if (Runtime.experiments.isEnabled("animationInspection")) {
            if (this._animationTimeline)
                this._animationTimeline.setNode(node);
        } else {
            this._button.setEnabled(!!node);
            if (!node)
                this._toggleAnimationControlPaneMode(false);
        }
    },

    /**
     * @override
     * @return {!WebInspector.ToolbarItem}
     */
    item: function()
    {
        return this._button;
    }
}