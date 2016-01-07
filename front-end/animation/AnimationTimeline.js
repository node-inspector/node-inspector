// Copyright (c) 2015 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

/**
 * @constructor
 * @extends {WebInspector.VBox}
 * @implements {WebInspector.TargetManager.Observer}
 */
WebInspector.AnimationTimeline = function()
{
    WebInspector.VBox.call(this, true);
    this.registerRequiredCSS("animation/animationTimeline.css");
    this.element.classList.add("animations-timeline");

    this._grid = this.contentElement.createSVGChild("svg", "animation-timeline-grid");
    this.contentElement.appendChild(this._createScrubber());
    WebInspector.installDragHandle(this._timelineScrubberHead, this._scrubberDragStart.bind(this), this._scrubberDragMove.bind(this), this._scrubberDragEnd.bind(this), "move");
    this._timelineScrubberHead.textContent = WebInspector.UIString(Number.millisToString(0));

    this._underlyingPlaybackRate = 1;
    this.contentElement.appendChild(this._createHeader());
    this._animationsContainer = this.contentElement.createChild("div", "animation-timeline-rows");

    this._emptyTimelineMessage = this._animationsContainer.createChild("div", "animation-timeline-empty-message");
    var message = this._emptyTimelineMessage.createChild("div");
    message.textContent = WebInspector.UIString("Trigger animations on the page to view and tweak them on the animation timeline.");

    this._duration = this._defaultDuration();
    this._scrubberRadius = 30;
    this._timelineControlsWidth = 230;
    /** @type {!Map.<!DOMAgent.BackendNodeId, !WebInspector.AnimationTimeline.NodeUI>} */
    this._nodesMap = new Map();
    this._groupBuffer = [];
    this._groupBufferSize = 8;
    /** @type {!Map.<!WebInspector.AnimationModel.AnimationGroup, !WebInspector.AnimationGroupPreviewUI>} */
    this._previewMap = new Map();
    this._symbol = Symbol("animationTimeline");
    /** @type {!Map.<string, !WebInspector.AnimationModel.Animation>} */
    this._animationsMap = new Map();
    WebInspector.targetManager.addModelListener(WebInspector.ResourceTreeModel, WebInspector.ResourceTreeModel.EventTypes.MainFrameNavigated, this._mainFrameNavigated, this);
    WebInspector.targetManager.addModelListener(WebInspector.DOMModel, WebInspector.DOMModel.Events.NodeRemoved, this._nodeRemoved, this);

    WebInspector.targetManager.observeTargets(this, WebInspector.Target.Type.Page);
}

WebInspector.AnimationTimeline.GlobalPlaybackRates = [0.1, 0.25, 0.5, 1.0];

WebInspector.AnimationTimeline.prototype = {
    wasShown: function()
    {
        for (var target of WebInspector.targetManager.targets(WebInspector.Target.Type.Page))
            this._addEventListeners(target);
    },

    willHide: function()
    {
        for (var target of WebInspector.targetManager.targets(WebInspector.Target.Type.Page))
            this._removeEventListeners(target);
    },

    /**
     * @override
     * @param {!WebInspector.Target} target
     */
    targetAdded: function(target)
    {
        if (this.isShowing())
            this._addEventListeners(target);
    },

    /**
     * @override
     * @param {!WebInspector.Target} target
     */
    targetRemoved: function(target)
    {
        this._removeEventListeners(target);
    },

    /**
     * @param {!WebInspector.Target} target
     */
    _addEventListeners: function(target)
    {
        var animationModel = WebInspector.AnimationModel.fromTarget(target);
        animationModel.ensureEnabled();
        animationModel.addEventListener(WebInspector.AnimationModel.Events.AnimationGroupStarted, this._animationGroupStarted, this);
        animationModel.addEventListener(WebInspector.AnimationModel.Events.AnimationCanceled, this._animationCanceled, this);
    },

    /**
     * @param {!WebInspector.Target} target
     */
    _removeEventListeners: function(target)
    {
        var animationModel = WebInspector.AnimationModel.fromTarget(target);
        animationModel.removeEventListener(WebInspector.AnimationModel.Events.AnimationGroupStarted, this._animationGroupStarted, this);
        animationModel.removeEventListener(WebInspector.AnimationModel.Events.AnimationCanceled, this._animationCanceled, this);
    },

    /**
     * @param {?WebInspector.DOMNode} node
     */
    setNode: function(node)
    {
        for (var nodeUI of this._nodesMap.values())
            nodeUI.setNode(node);
    },

    /**
     * @return {!Element} element
     */
    _createScrubber: function() {
        this._timelineScrubber = createElementWithClass("div", "animation-scrubber hidden");
        this._timelineScrubber.createChild("div", "animation-time-overlay");
        this._timelineScrubber.createChild("div", "animation-scrubber-arrow");
        this._timelineScrubberHead = this._timelineScrubber.createChild("div", "animation-scrubber-head");
        var timerContainer = this._timelineScrubber.createChild("div", "animation-timeline-timer");
        this._timerSpinner = timerContainer.createChild("div", "timer-spinner timer-hemisphere");
        this._timerFiller = timerContainer.createChild("div", "timer-filler timer-hemisphere");
        this._timerMask = timerContainer.createChild("div", "timer-mask");
        return this._timelineScrubber;
    },

    /**
     * @return {!Element}
     */
    _createHeader: function()
    {
        /**
         * @param {!Event} event
         * @this {WebInspector.AnimationTimeline}
         */
        function playbackSliderInputHandler(event)
        {
            this._underlyingPlaybackRate = WebInspector.AnimationTimeline.GlobalPlaybackRates[event.target.value];
            this._updatePlaybackControls();
        }

        var container = createElementWithClass("div", "animation-timeline-header");
        var controls = container.createChild("div", "animation-controls");
        this._previewContainer = container.createChild("div", "animation-timeline-buffer");

        var toolbar = new WebInspector.Toolbar(controls);
        toolbar.element.classList.add("animation-controls-toolbar");
        this._controlButton = new WebInspector.ToolbarButton(WebInspector.UIString("Replay timeline"), "replay-outline-toolbar-item");
        this._controlButton.addEventListener("click", this._controlButtonToggle.bind(this));
        toolbar.appendToolbarItem(this._controlButton);

        this._playbackLabel = controls.createChild("span", "animation-playback-label");
        this._playbackLabel.createTextChild("1x");
        this._playbackLabel.addEventListener("keydown", this._playbackLabelInput.bind(this));
        this._playbackLabel.addEventListener("focusout", this._playbackLabelInput.bind(this));

        this._playbackSlider = controls.createChild("input", "animation-playback-slider");
        this._playbackSlider.type = "range";
        this._playbackSlider.min = 0;
        this._playbackSlider.max = WebInspector.AnimationTimeline.GlobalPlaybackRates.length - 1;
        this._playbackSlider.value = this._playbackSlider.max;
        this._playbackSlider.addEventListener("input", playbackSliderInputHandler.bind(this));
        this._updateAnimationsPlaybackRate();

        return container;
    },

    /**
     * @param {!Event} event
     */
    _playbackLabelInput: function(event)
    {
        var element = /** @type {!Element} */(event.currentTarget);
        if (event.type !== "focusout" && !WebInspector.handleElementValueModifications(event, element) && !isEnterKey(event))
            return;

        var value = parseFloat(this._playbackLabel.textContent);
        if (!isNaN(value))
            this._underlyingPlaybackRate = Math.max(0, value);
        this._updatePlaybackControls();
        event.consume(true);
    },

    _updatePlaybackControls: function()
    {
        this._playbackLabel.textContent = this._underlyingPlaybackRate + "x";
        var playbackSliderValue = 0;
        for (var rate of WebInspector.AnimationTimeline.GlobalPlaybackRates) {
            if (this._underlyingPlaybackRate > rate)
                playbackSliderValue++;
        }
        this._playbackSlider.value = playbackSliderValue;

        for (var target of WebInspector.targetManager.targets(WebInspector.Target.Type.Page))
            WebInspector.AnimationModel.fromTarget(target).setPlaybackRate(this._playbackRate());
        WebInspector.userMetrics.AnimationsPlaybackRateChanged.record();
        if (this._scrubberPlayer)
            this._scrubberPlayer.playbackRate = this._playbackRate();
    },

    _controlButtonToggle: function()
    {
        if (this._emptyTimelineMessage)
            return;
        if (this._controlButton.element.classList.contains("play-outline-toolbar-item"))
            this._togglePause(false);
        else if (this._controlButton.element.classList.contains("replay-outline-toolbar-item"))
            this._replay();
        else
            this._togglePause(true);
        this._updateControlButton();
    },

    _updateControlButton: function()
    {
        this._controlButton.element.classList.remove("play-outline-toolbar-item");
        this._controlButton.element.classList.remove("replay-outline-toolbar-item");
        this._controlButton.element.classList.remove("pause-outline-toolbar-item");
        if (this._paused) {
            this._controlButton.element.classList.add("play-outline-toolbar-item");
            this._controlButton.setTitle(WebInspector.UIString("Play timeline"));
        } else if (!this._scrubberPlayer || this._scrubberPlayer.currentTime >= this.duration() - this._scrubberRadius / this.pixelMsRatio()) {
            this._controlButton.element.classList.add("replay-outline-toolbar-item");
            this._controlButton.setTitle(WebInspector.UIString("Replay timeline"));
        } else {
            this._controlButton.element.classList.add("pause-outline-toolbar-item");
            this._controlButton.setTitle(WebInspector.UIString("Pause timeline"));
        }
    },

    _updateAnimationsPlaybackRate: function()
    {
        /**
         * @param {?Protocol.Error} error
         * @param {number} playbackRate
         * @this {WebInspector.AnimationTimeline}
         */
        function setPlaybackRate(error, playbackRate)
        {
            if (playbackRate === 0) {
                playbackRate = 1;
                if (target)
                    WebInspector.AnimationModel.fromTarget(target).setPlaybackRate(1);
            }
            this._underlyingPlaybackRate = playbackRate;
            this._updatePlaybackControls();
        }

        delete this._paused;
        for (var target of WebInspector.targetManager.targets(WebInspector.Target.Type.Page))
            target.animationAgent().getPlaybackRate(setPlaybackRate.bind(this));
    },

    /**
     * @return {number}
     */
    _playbackRate: function()
    {
        return this._paused ? 0 : this._underlyingPlaybackRate;
    },

    /**
     * @param {boolean} pause
     */
    _togglePause: function(pause)
    {
        this._paused = pause;
        for (var target of WebInspector.targetManager.targets(WebInspector.Target.Type.Page))
            WebInspector.AnimationModel.fromTarget(target).setPlaybackRate(this._playbackRate());
        WebInspector.userMetrics.AnimationsPlaybackRateChanged.record();
        if (this._scrubberPlayer)
            this._scrubberPlayer.playbackRate = this._playbackRate();
    },

    _replay: function()
    {
        if (this.startTime() === undefined)
            return;
        for (var target of WebInspector.targetManager.targets(WebInspector.Target.Type.Page))
            target.animationAgent().setCurrentTime(/** @type {number} */(this.startTime()));

        this._animateTime(0);
    },

    /**
     * @return {number}
     */
    _defaultDuration: function ()
    {
        return 100;
    },

    /**
     * @return {number}
     */
    duration: function()
    {
        return this._duration;
    },

    /**
     * @param {number} duration
     */
    setDuration: function(duration)
    {
        this._duration = duration;
        this.scheduleRedraw();
    },

    /**
     * @return {number|undefined}
     */
    startTime: function()
    {
        return this._startTime;
    },

    _reset: function()
    {
        if (!this._nodesMap.size)
            return;

        this._nodesMap.clear();
        this._animationsMap.clear();
        this._animationsContainer.removeChildren();
        this._duration = this._defaultDuration();
        delete this._startTime;
    },

    /**
     * @param {!WebInspector.Event} event
     */
    _mainFrameNavigated: function(event)
    {
        this._reset();
        this._updateAnimationsPlaybackRate();
        if (this._scrubberPlayer)
            this._scrubberPlayer.cancel();
        delete this._scrubberPlayer;
        this._timelineScrubberHead.textContent = WebInspector.UIString(Number.millisToString(0));
        this._updateControlButton();
        this._groupBuffer = [];
        this._previewMap.clear();
        this._previewContainer.removeChildren();
    },

    /**
     * @param {!WebInspector.Event} event
     */
    _animationGroupStarted: function(event)
    {
        this._addAnimationGroup(/** @type {!WebInspector.AnimationModel.AnimationGroup} */(event.data));
    },

    /**
     * @param {!WebInspector.AnimationModel.AnimationGroup} group
     */
    _addAnimationGroup: function(group)
    {
        /**
         * @param {!WebInspector.AnimationModel.AnimationGroup} left
         * @param {!WebInspector.AnimationModel.AnimationGroup} right
         */
        function startTimeComparator(left, right)
        {
            return left.startTime() > right.startTime();
        }

        this._groupBuffer.push(group);
        this._groupBuffer.sort(startTimeComparator);
        // Discard oldest groups from buffer if necessary
        var groupsToDiscard = [];
        while (this._groupBuffer.length > this._groupBufferSize) {
            var toDiscard = this._groupBuffer.splice(this._groupBuffer[0] === this._selectedGroup ? 1 : 0, 1);
            groupsToDiscard.push(toDiscard[0]);
        }
        for (var g of groupsToDiscard) {
            this._previewMap.get(g).element.remove();
            this._previewMap.delete(g);
            // TODO(samli): needs to discard model too
        }
        // Generate preview
        var preview = new WebInspector.AnimationGroupPreviewUI(group);
        this._previewMap.set(group, preview);
        this._previewContainer.appendChild(preview.element);
        preview.element.addEventListener("click", this._selectAnimationGroup.bind(this, group));
    },

    /**
     * @param {!WebInspector.AnimationModel.AnimationGroup} group
     */
    _selectAnimationGroup: function(group)
    {
        /**
         * @param {!WebInspector.AnimationGroupPreviewUI} ui
         * @param {!WebInspector.AnimationModel.AnimationGroup} group
         * @this {!WebInspector.AnimationTimeline}
         */
        function applySelectionClass(ui, group)
        {
            ui.element.classList.toggle("selected", this._selectedGroup === group);
        }

        if (this._selectedGroup === group)
            return;
        this._selectedGroup = group;
        this._previewMap.forEach(applySelectionClass, this);
        this._reset();
        for (var anim of group.animations())
            this._addAnimation(anim);
        this.scheduleRedraw();
    },

    /**
     * @param {!WebInspector.AnimationModel.Animation} animation
     */
    _addAnimation: function(animation)
    {
        /**
         * @param {?WebInspector.DOMNode} node
         * @this {WebInspector.AnimationTimeline}
         */
        function nodeResolved(node)
        {
            if (!node)
                return;
            uiAnimation.setNode(node);
            node[this._symbol] = nodeUI;
        }

        if (this._emptyTimelineMessage) {
            this._emptyTimelineMessage.remove();
            delete this._emptyTimelineMessage;
        }

        // Ignore Web Animations custom effects & groups
        if (animation.type() === "WebAnimation" && animation.source().keyframesRule().keyframes().length === 0)
            return;

        this._resizeWindow(animation);

        var nodeUI = this._nodesMap.get(animation.source().backendNodeId());
        if (!nodeUI) {
            nodeUI = new WebInspector.AnimationTimeline.NodeUI(animation.source());
            this._animationsContainer.appendChild(nodeUI.element);
            this._nodesMap.set(animation.source().backendNodeId(), nodeUI);
        }
        var nodeRow = nodeUI.findRow(animation);
        var uiAnimation = new WebInspector.AnimationUI(animation, this, nodeRow.element);
        animation.source().deferredNode().resolve(nodeResolved.bind(this));
        nodeRow.animations.push(uiAnimation);
        this._animationsMap.set(animation.id(), animation);
    },

    /**
     * @param {!WebInspector.Event} event
     */
    _animationCanceled: function(event)
    {
        this._cancelAnimation(/** @type {string} */ (event.data.id));
    },

    /**
     * @param {string} playerId
     */
    _cancelAnimation: function(playerId)
    {
        var animation = this._animationsMap.get(playerId);
        if (!animation)
            return;
        animation.setPlayState("idle");
        this.scheduleRedraw();
    },

    /**
     * @param {!WebInspector.Event} event
     */
    _nodeRemoved: function(event)
    {
        var node = event.data.node;
        if (node[this._symbol])
            node[this._symbol].nodeRemoved();
    },

    _renderGrid: function()
    {
        const gridSize = 250;
        this._grid.setAttribute("width", this.width());
        this._grid.setAttribute("height", this._animationsContainer.offsetHeight + 43);
        this._grid.setAttribute("shape-rendering", "crispEdges");
        this._grid.removeChildren();
        var lastDraw = undefined;
        for (var time = 0; time < this.duration(); time += gridSize) {
            var line = this._grid.createSVGChild("rect", "animation-timeline-grid-line");
            line.setAttribute("x", time * this.pixelMsRatio());
            line.setAttribute("y", 0);
            line.setAttribute("height", "100%");
            line.setAttribute("width", 1);
        }
        for (var time = 0; time < this.duration(); time += gridSize) {
            var gridWidth = time * this.pixelMsRatio();
            if (!lastDraw || gridWidth - lastDraw > 50) {
                lastDraw = gridWidth;
                var label = this._grid.createSVGChild("text", "animation-timeline-grid-label");
                label.setAttribute("x", gridWidth + 5);
                label.setAttribute("y", 15);
                label.textContent = WebInspector.UIString(Number.millisToString(time));
            }
        }
    },

    scheduleRedraw: function() {
        if (this._redrawing)
            return;
        this._redrawing = true;
        this._animationsContainer.window().requestAnimationFrame(this._redraw.bind(this));
    },

    /**
     * @param {number=} timestamp
     */
    _redraw: function(timestamp)
    {
        delete this._redrawing;
        for (var nodeUI of this._nodesMap.values())
            nodeUI.redraw();
        this._renderGrid();
    },

    onResize: function()
    {
        this._cachedTimelineWidth = Math.max(0, this._animationsContainer.offsetWidth - this._timelineControlsWidth) || 0;
        this.scheduleRedraw();
        if (this._scrubberPlayer)
            this._animateTime();
    },

    /**
     * @return {number}
     */
    width: function()
    {
        return this._cachedTimelineWidth || 0;
    },

    /**
     * @param {!WebInspector.AnimationModel.Animation} animation
     * @return {boolean}
     */
    _resizeWindow: function(animation)
    {
        var resized = false;
        if (!this._startTime)
            this._startTime = animation.startTime();

        // This shows at most 3 iterations
        var duration = animation.source().duration() * Math.min(3, animation.source().iterations());
        var requiredDuration = animation.startTime() + animation.source().delay() + duration + animation.source().endDelay() - this.startTime();
        if (requiredDuration > this._duration * 0.8) {
            resized = true;
            this._duration = requiredDuration * 1.5;
            this._timelineScrubber.classList.remove("hidden");
            this._animateTime(animation.startTime() - this.startTime());
        }
        return resized;
    },

    /**
      * @param {number=} time
      */
    _animateTime: function(time)
    {
        var oldPlayer = this._scrubberPlayer;

        this._scrubberPlayer = this._timelineScrubber.animate([
            { transform: "translateX(0px)" },
            { transform: "translateX(" +  (this.width() - this._scrubberRadius) + "px)" }
        ], { duration: this.duration() - this._scrubberRadius / this.pixelMsRatio(), fill: "forwards" });
        this._scrubberPlayer.playbackRate = this._playbackRate();
        this._scrubberPlayer.onfinish = this._updateControlButton.bind(this);
        this._updateControlButton();

        if (time !== undefined)
            this._scrubberPlayer.currentTime = time;
        else if (oldPlayer.playState === "finished")
            this._scrubberPlayer.finish();
        else
            this._scrubberPlayer.startTime = oldPlayer.startTime;

        if (oldPlayer)
            oldPlayer.cancel();
        this._timelineScrubber.classList.remove("animation-timeline-end");
        this._timelineScrubberHead.window().requestAnimationFrame(this._updateScrubber.bind(this));
    },

    /**
     * @return {number}
     */
    pixelMsRatio: function()
    {
        return this.width() / this.duration() || 0;
    },

    /**
     * @param {number} timestamp
     */
    _updateScrubber: function(timestamp)
    {
        if (!this._scrubberPlayer)
            return;
        this._timelineScrubberHead.textContent = WebInspector.UIString(Number.millisToString(this._scrubberPlayer.currentTime));
        if (this._scrubberPlayer.playState === "pending" || this._scrubberPlayer.playState === "running") {
            this._timelineScrubberHead.window().requestAnimationFrame(this._updateScrubber.bind(this));
        } else if (this._scrubberPlayer.playState === "finished") {
            this._timelineScrubberHead.textContent = WebInspector.UIString(". . .");
            this._timelineScrubber.classList.add("animation-timeline-end");
        }
    },

    /**
     * @param {!Event} event
     * @return {boolean}
     */
    _scrubberDragStart: function(event)
    {
        if (!this._scrubberPlayer)
            return false;

        this._originalScrubberTime = this._scrubberPlayer.currentTime;
        this._timelineScrubber.classList.remove("animation-timeline-end");
        this._scrubberPlayer.pause();
        this._originalMousePosition = new WebInspector.Geometry.Point(event.x, event.y);

        this._togglePause(true);
        this._updateControlButton();
        return true;
    },

    /**
     * @param {!Event} event
     */
    _scrubberDragMove: function(event)
    {
        var delta = event.x - this._originalMousePosition.x;
        this._scrubberPlayer.currentTime = Math.min(this._originalScrubberTime + delta / this.pixelMsRatio(), this.duration() - this._scrubberRadius / this.pixelMsRatio());
        var currentTime = Math.max(0, Math.round(this._scrubberPlayer.currentTime));
        this._timelineScrubberHead.textContent = WebInspector.UIString(Number.millisToString(currentTime));
        for (var target of WebInspector.targetManager.targets(WebInspector.Target.Type.Page))
            target.animationAgent().setCurrentTime(/** @type {number} */(this.startTime() + currentTime));
    },

    /**
     * @param {!Event} event
     */
    _scrubberDragEnd: function(event)
    {
        var currentTime = Math.max(0, this._scrubberPlayer.currentTime);
        this._scrubberPlayer.play();
        this._scrubberPlayer.currentTime = currentTime;
        this._timelineScrubberHead.window().requestAnimationFrame(this._updateScrubber.bind(this));
    },

    __proto__: WebInspector.VBox.prototype
}

/**
 * @constructor
 * @param {!WebInspector.AnimationModel.AnimationEffect} animationEffect
 */
WebInspector.AnimationTimeline.NodeUI = function(animationEffect)
{
    /**
     * @param {?WebInspector.DOMNode} node
     * @this {WebInspector.AnimationTimeline.NodeUI}
     */
    function nodeResolved(node)
    {
        if (!node)
            return;
        this._node = node;
        WebInspector.DOMPresentationUtils.decorateNodeLabel(node, this._description);
        this.element.addEventListener("click", WebInspector.Revealer.reveal.bind(WebInspector.Revealer, node, undefined), false);
    }

    this._rows = [];
    this.element = createElementWithClass("div", "animation-node-row");
    this._description = this.element.createChild("div", "animation-node-description");
    animationEffect.deferredNode().resolve(nodeResolved.bind(this));
    this._timelineElement = this.element.createChild("div", "animation-node-timeline");
}

/** @typedef {{element: !Element, animations: !Array<!WebInspector.AnimationUI>}} */
WebInspector.AnimationTimeline.NodeRow;

WebInspector.AnimationTimeline.NodeUI.prototype = {
    /**
     * @param {!WebInspector.AnimationModel.Animation} animation
     * @return {!WebInspector.AnimationTimeline.NodeRow}
     */
    findRow: function(animation)
    {
        // Check if it can fit into an existing row
        var existingRow = this._collapsibleIntoRow(animation);
        if (existingRow)
            return existingRow;

        // Create new row
        var container = this._timelineElement.createChild("div", "animation-timeline-row");
        var nodeRow = {element: container, animations: []};
        this._rows.push(nodeRow);
        return nodeRow;
    },

    redraw: function()
    {
        for (var nodeRow of this._rows) {
            for (var ui of nodeRow.animations)
                ui.redraw();
        }
    },

    /**
     * @param {!WebInspector.AnimationModel.Animation} animation
     * @return {?WebInspector.AnimationTimeline.NodeRow}
     */
    _collapsibleIntoRow: function(animation)
    {
        if (animation.endTime() === Infinity)
            return null;
        for (var nodeRow of this._rows) {
            var overlap = false;
            for (var ui of nodeRow.animations)
                overlap |= animation.overlaps(ui.animation());
            if (!overlap)
                return nodeRow;
        }
        return null;
    },

    nodeRemoved: function()
    {
        this.element.classList.add("animation-node-removed");
    },

    /**
     * @param {?WebInspector.DOMNode} node
     */
    setNode: function(node)
    {
        this.element.classList.toggle("animation-node-selected", node === this._node);
    }
}

/**
 * @constructor
 * @param {number} steps
 * @param {string} stepAtPosition
 */
WebInspector.AnimationTimeline.StepTimingFunction = function(steps, stepAtPosition)
{
    this.steps = steps;
    this.stepAtPosition = stepAtPosition;
}

/**
 * @param {string} text
 * @return {?WebInspector.AnimationTimeline.StepTimingFunction}
 */
WebInspector.AnimationTimeline.StepTimingFunction.parse = function(text) {
    var match = text.match(/^step-(start|middle|end)$/);
    if (match)
        return new WebInspector.AnimationTimeline.StepTimingFunction(1, match[1]);
    match = text.match(/^steps\((\d+), (start|middle|end)\)$/);
    if (match)
        return new WebInspector.AnimationTimeline.StepTimingFunction(parseInt(match[1], 10), match[2]);
    return null;
}

/**
 * @constructor
 * @param {!WebInspector.AnimationModel.Animation} animation
 * @param {!WebInspector.AnimationTimeline} timeline
 * @param {!Element} parentElement
 */
WebInspector.AnimationUI = function(animation, timeline, parentElement) {
    this._animation = animation;
    this._timeline = timeline;
    this._parentElement = parentElement;

    if (this._animation.source().keyframesRule())
        this._keyframes =  this._animation.source().keyframesRule().keyframes();

    this._nameElement = parentElement.createChild("div", "animation-name");
    this._nameElement.textContent = this._animation.name();

    this._svg = parentElement.createSVGChild("svg", "animation-ui");
    this._svg.setAttribute("height", WebInspector.AnimationUI.Options.AnimationSVGHeight);
    this._svg.style.marginLeft = "-" + WebInspector.AnimationUI.Options.AnimationMargin + "px";
    this._svg.addEventListener("mousedown", this._mouseDown.bind(this, WebInspector.AnimationUI.MouseEvents.AnimationDrag, null));
    this._activeIntervalGroup = this._svg.createSVGChild("g");

    /** @type {!Array.<{group: ?Element, animationLine: ?Element, keyframePoints: !Object.<number, !Element>, keyframeRender: !Object.<number, !Element>}>} */
    this._cachedElements = [];

    this._movementInMs = 0;
    this._color = WebInspector.AnimationUI.Color(this._animation);
}

/**
 * @enum {string}
 */
WebInspector.AnimationUI.MouseEvents = {
    AnimationDrag: "AnimationDrag",
    KeyframeMove: "KeyframeMove",
    StartEndpointMove: "StartEndpointMove",
    FinishEndpointMove: "FinishEndpointMove"
}

WebInspector.AnimationUI.prototype = {
    /**
     * @return {!WebInspector.AnimationModel.Animation}
     */
    animation: function()
    {
        return this._animation;
    },

    /**
     * @param {?WebInspector.DOMNode} node
     */
    setNode: function(node)
    {
        this._node = node;
    },

    /**
     * @param {!Element} parentElement
     * @param {string} className
     */
    _createLine: function(parentElement, className)
    {
        var line = parentElement.createSVGChild("line", className);
        line.setAttribute("x1", WebInspector.AnimationUI.Options.AnimationMargin);
        line.setAttribute("y1", WebInspector.AnimationUI.Options.AnimationHeight);
        line.setAttribute("y2", WebInspector.AnimationUI.Options.AnimationHeight);
        line.style.stroke = this._color;
        return line;
    },

    /**
     * @param {number} iteration
     * @param {!Element} parentElement
     */
    _drawAnimationLine: function(iteration, parentElement)
    {
        var cache = this._cachedElements[iteration];
        if (!cache.animationLine)
            cache.animationLine = this._createLine(parentElement, "animation-line");
        cache.animationLine.setAttribute("x2", (this._duration() * this._timeline.pixelMsRatio() + WebInspector.AnimationUI.Options.AnimationMargin).toFixed(2));
    },

    /**
     * @param {!Element} parentElement
     */
    _drawDelayLine: function(parentElement)
    {
        if (!this._delayLine) {
            this._delayLine = this._createLine(parentElement, "animation-delay-line");
            this._endDelayLine = this._createLine(parentElement, "animation-delay-line");
        }
        this._delayLine.setAttribute("x1", WebInspector.AnimationUI.Options.AnimationMargin);
        this._delayLine.setAttribute("x2", (this._delay() * this._timeline.pixelMsRatio() + WebInspector.AnimationUI.Options.AnimationMargin).toFixed(2));
        var leftMargin = (this._delay() + this._duration() * this._animation.source().iterations()) * this._timeline.pixelMsRatio();
        this._endDelayLine.style.transform = "translateX(" + Math.min(leftMargin, this._timeline.width()).toFixed(2) + "px)";
        this._endDelayLine.setAttribute("x1", WebInspector.AnimationUI.Options.AnimationMargin);
        this._endDelayLine.setAttribute("x2", (this._animation.source().endDelay() * this._timeline.pixelMsRatio() + WebInspector.AnimationUI.Options.AnimationMargin).toFixed(2));
    },

    /**
     * @param {number} iteration
     * @param {!Element} parentElement
     * @param {number} x
     * @param {number} keyframeIndex
     * @param {boolean} attachEvents
     */
    _drawPoint: function(iteration, parentElement, x, keyframeIndex, attachEvents)
    {
        if (this._cachedElements[iteration].keyframePoints[keyframeIndex]) {
            this._cachedElements[iteration].keyframePoints[keyframeIndex].setAttribute("cx", x.toFixed(2));
            return;
        }

        var circle = parentElement.createSVGChild("circle", keyframeIndex <= 0 ? "animation-endpoint" : "animation-keyframe-point");
        circle.setAttribute("cx", x.toFixed(2));
        circle.setAttribute("cy", WebInspector.AnimationUI.Options.AnimationHeight);
        circle.style.stroke = this._color;
        circle.setAttribute("r", WebInspector.AnimationUI.Options.AnimationMargin / 2);

        if (keyframeIndex <= 0)
            circle.style.fill = this._color;

        this._cachedElements[iteration].keyframePoints[keyframeIndex] = circle;

        if (!attachEvents)
            return;

        if (keyframeIndex === 0) {
            circle.addEventListener("mousedown", this._mouseDown.bind(this, WebInspector.AnimationUI.MouseEvents.StartEndpointMove, keyframeIndex));
        } else if (keyframeIndex === -1) {
            circle.addEventListener("mousedown", this._mouseDown.bind(this, WebInspector.AnimationUI.MouseEvents.FinishEndpointMove, keyframeIndex));
        } else {
            circle.addEventListener("mousedown", this._mouseDown.bind(this, WebInspector.AnimationUI.MouseEvents.KeyframeMove, keyframeIndex));
        }
    },

    /**
     * @param {number} iteration
     * @param {number} keyframeIndex
     * @param {!Element} parentElement
     * @param {number} leftDistance
     * @param {number} width
     * @param {string} easing
     */
    _renderKeyframe: function(iteration, keyframeIndex, parentElement, leftDistance, width, easing)
    {
        /**
         * @param {!Element} parentElement
         * @param {number} x
         * @param {string} strokeColor
         */
        function createStepLine(parentElement, x, strokeColor)
        {
            var line = parentElement.createSVGChild("line");
            line.setAttribute("x1", x);
            line.setAttribute("x2", x);
            line.setAttribute("y1", WebInspector.AnimationUI.Options.AnimationMargin);
            line.setAttribute("y2", WebInspector.AnimationUI.Options.AnimationHeight);
            line.style.stroke = strokeColor;
        }

        var bezier = WebInspector.Geometry.CubicBezier.parse(easing);
        var cache = this._cachedElements[iteration].keyframeRender;
        if (!cache[keyframeIndex])
            cache[keyframeIndex] = bezier ? parentElement.createSVGChild("path", "animation-keyframe") : parentElement.createSVGChild("g", "animation-keyframe-step");
        var group = cache[keyframeIndex];
        group.style.transform = "translateX(" + leftDistance.toFixed(2) + "px)";

        if (bezier) {
            group.style.fill = this._color;
            WebInspector.BezierUI.drawVelocityChart(bezier, group, width);
        } else {
            var stepFunction = WebInspector.AnimationTimeline.StepTimingFunction.parse(easing);
            group.removeChildren();
            const offsetMap = {"start": 0, "middle": 0.5, "end": 1};
            const offsetWeight = offsetMap[stepFunction.stepAtPosition];
            for (var i = 0; i < stepFunction.steps; i++)
                createStepLine(group, (i + offsetWeight) * width / stepFunction.steps, this._color);
        }
    },

    redraw: function()
    {
        var durationWithDelay = this._delay() + this._duration() * this._animation.source().iterations() + this._animation.source().endDelay();
        var leftMargin = ((this._animation.startTime() - this._timeline.startTime()) * this._timeline.pixelMsRatio());
        var maxWidth = this._timeline.width() - WebInspector.AnimationUI.Options.AnimationMargin - leftMargin;
        var svgWidth = Math.min(maxWidth, durationWithDelay * this._timeline.pixelMsRatio());

        this._svg.classList.toggle("animation-ui-canceled", this._animation.playState() === "idle");
        this._svg.setAttribute("width", (svgWidth + 2 * WebInspector.AnimationUI.Options.AnimationMargin).toFixed(2));
        this._svg.style.transform = "translateX(" + leftMargin.toFixed(2)  + "px)";
        this._activeIntervalGroup.style.transform = "translateX(" + (this._delay() * this._timeline.pixelMsRatio()).toFixed(2) + "px)";

        this._nameElement.style.transform = "translateX(" + (leftMargin + this._delay() * this._timeline.pixelMsRatio() + WebInspector.AnimationUI.Options.AnimationMargin).toFixed(2) + "px)";
        this._nameElement.style.width = (this._duration() * this._timeline.pixelMsRatio().toFixed(2)) + "px";
        this._drawDelayLine(this._svg);

        if (this._animation.type() === "CSSTransition") {
            this._renderTransition();
            return;
        }

        this._renderIteration(this._activeIntervalGroup, 0);
        if (!this._tailGroup)
            this._tailGroup = this._activeIntervalGroup.createSVGChild("g", "animation-tail-iterations");
        var iterationWidth = this._duration() * this._timeline.pixelMsRatio();
        for (var iteration = 1; iteration < this._animation.source().iterations() && iterationWidth * (iteration - 1) < this._timeline.width(); iteration++)
            this._renderIteration(this._tailGroup, iteration);
        while (iteration < this._cachedElements.length)
            this._cachedElements.pop().group.remove();
    },


    _renderTransition: function()
    {
        if (!this._cachedElements[0])
            this._cachedElements[0] = { animationLine: null, keyframePoints: {}, keyframeRender: {}, group: null };
        this._drawAnimationLine(0, this._activeIntervalGroup);
        this._renderKeyframe(0, 0, this._activeIntervalGroup, WebInspector.AnimationUI.Options.AnimationMargin, this._duration() * this._timeline.pixelMsRatio(), this._animation.source().easing());
        this._drawPoint(0, this._activeIntervalGroup, WebInspector.AnimationUI.Options.AnimationMargin, 0, true);
        this._drawPoint(0, this._activeIntervalGroup, this._duration() * this._timeline.pixelMsRatio() + WebInspector.AnimationUI.Options.AnimationMargin, -1, true);
    },

    /**
     * @param {!Element} parentElement
     * @param {number} iteration
     */
    _renderIteration: function(parentElement, iteration)
    {
        if (!this._cachedElements[iteration])
            this._cachedElements[iteration] = { animationLine: null, keyframePoints: {}, keyframeRender: {}, group: parentElement.createSVGChild("g") };
        var group = this._cachedElements[iteration].group;
        group.style.transform = "translateX(" + (iteration * this._duration() * this._timeline.pixelMsRatio()).toFixed(2) + "px)";
        this._drawAnimationLine(iteration, group);
        console.assert(this._keyframes.length > 1);
        for (var i = 0; i < this._keyframes.length - 1; i++) {
            var leftDistance = this._offset(i) * this._duration() * this._timeline.pixelMsRatio() + WebInspector.AnimationUI.Options.AnimationMargin;
            var width = this._duration() * (this._offset(i + 1) - this._offset(i)) * this._timeline.pixelMsRatio();
            this._renderKeyframe(iteration, i, group, leftDistance, width, this._keyframes[i].easing());
            if (i || (!i && iteration === 0))
                this._drawPoint(iteration, group, leftDistance, i, iteration === 0);
        }
        this._drawPoint(iteration, group, this._duration() * this._timeline.pixelMsRatio() + WebInspector.AnimationUI.Options.AnimationMargin, -1, iteration === 0);
    },

    /**
     * @return {number}
     */
    _delay: function()
    {
        var delay = this._animation.source().delay();
        if (this._mouseEventType === WebInspector.AnimationUI.MouseEvents.AnimationDrag || this._mouseEventType === WebInspector.AnimationUI.MouseEvents.StartEndpointMove)
            delay += this._movementInMs;
        // FIXME: add support for negative start delay
        return Math.max(0, delay);
    },

    /**
     * @return {number}
     */
    _duration: function()
    {
        var duration = this._animation.source().duration();
        if (this._mouseEventType === WebInspector.AnimationUI.MouseEvents.FinishEndpointMove)
            duration += this._movementInMs;
        else if (this._mouseEventType === WebInspector.AnimationUI.MouseEvents.StartEndpointMove)
            duration -= Math.max(this._movementInMs, -this._animation.source().delay()); // Cannot have negative delay
        return Math.max(0, duration);
    },

    /**
     * @param {number} i
     * @return {number} offset
     */
    _offset: function(i)
    {
        var offset = this._keyframes[i].offsetAsNumber();
        if (this._mouseEventType === WebInspector.AnimationUI.MouseEvents.KeyframeMove && i === this._keyframeMoved) {
            console.assert(i > 0 && i < this._keyframes.length - 1, "First and last keyframe cannot be moved");
            offset += this._movementInMs / this._animation.source().duration();
            offset = Math.max(offset, this._keyframes[i - 1].offsetAsNumber());
            offset = Math.min(offset, this._keyframes[i + 1].offsetAsNumber());
        }
        return offset;
    },

    /**
     * @param {!WebInspector.AnimationUI.MouseEvents} mouseEventType
     * @param {?number} keyframeIndex
     * @param {!Event} event
     */
    _mouseDown: function(mouseEventType, keyframeIndex, event)
    {
        if (this._animation.playState() === "idle")
            return;
        this._mouseEventType = mouseEventType;
        this._keyframeMoved = keyframeIndex;
        this._downMouseX = event.clientX;
        this._mouseMoveHandler = this._mouseMove.bind(this);
        this._mouseUpHandler = this._mouseUp.bind(this);
        this._parentElement.ownerDocument.addEventListener("mousemove", this._mouseMoveHandler);
        this._parentElement.ownerDocument.addEventListener("mouseup", this._mouseUpHandler);
        event.preventDefault();
        event.stopPropagation();

        if (this._node)
            WebInspector.Revealer.reveal(this._node);
    },

    /**
     * @param {!Event} event
     */
    _mouseMove: function (event)
    {
        this._movementInMs = (event.clientX - this._downMouseX) / this._timeline.pixelMsRatio();
        if (this._animation.startTime() + this._delay() + this._duration() - this._timeline.startTime() > this._timeline.duration() * 0.8)
            this._timeline.setDuration(this._timeline.duration() * 1.2);
        this.redraw();
    },

    /**
     * @param {!Event} event
     */
    _mouseUp: function(event)
    {
        this._movementInMs = (event.clientX - this._downMouseX) / this._timeline.pixelMsRatio();

        // Commit changes
        if (this._mouseEventType === WebInspector.AnimationUI.MouseEvents.KeyframeMove) {
            this._keyframes[this._keyframeMoved].setOffset(this._offset(this._keyframeMoved));
        } else {
            var delay = this._delay();
            var duration = this._duration();
            this._setDelay(delay);
            this._setDuration(duration);
            if (this._animation.type() !== "CSSAnimation") {
                var target = WebInspector.targetManager.mainTarget();
                if (target)
                    target.animationAgent().setTiming(this._animation.id(), duration, delay);
            }
        }

        this._movementInMs = 0;
        this.redraw();

        this._parentElement.ownerDocument.removeEventListener("mousemove", this._mouseMoveHandler);
        this._parentElement.ownerDocument.removeEventListener("mouseup", this._mouseUpHandler);
        delete this._mouseMoveHandler;
        delete this._mouseUpHandler;
        delete this._mouseEventType;
        delete this._downMouseX;
        delete this._keyframeMoved;
    },

    /**
     * @param {number} value
     */
    _setDelay: function(value)
    {
        if (!this._node || this._animation.source().delay() == this._delay())
            return;

        this._animation.source().setDelay(this._delay());
        var propertyName;
        if (this._animation.type() == "CSSTransition")
            propertyName = "transition-delay";
        else if (this._animation.type() == "CSSAnimation")
            propertyName = "animation-delay";
        else
            return;
        this._setNodeStyle(propertyName, Math.round(value) + "ms");
    },

    /**
     * @param {number} value
     */
    _setDuration: function(value)
    {
        if (!this._node || this._animation.source().duration() == value)
            return;

        this._animation.source().setDuration(value);
        var propertyName;
        if (this._animation.type() == "CSSTransition")
            propertyName = "transition-duration";
        else if (this._animation.type() == "CSSAnimation")
            propertyName = "animation-duration";
        else
            return;
        this._setNodeStyle(propertyName, Math.round(value) + "ms");
    },

    /**
     * @param {string} name
     * @param {string} value
     */
    _setNodeStyle: function(name, value)
    {
        var style = this._node.getAttribute("style") || "";
        if (style)
            style = style.replace(new RegExp("\\s*(-webkit-)?" + name + ":[^;]*;?\\s*", "g"), "");
        var valueString = name + ": " + value;
        this._node.setAttributeValue("style", style + " " + valueString + "; -webkit-" + valueString + ";");
    }
}

WebInspector.AnimationUI.Options = {
    AnimationHeight: 32,
    AnimationSVGHeight: 80,
    AnimationMargin: 7,
    EndpointsClickRegionSize: 10,
    GridCanvasHeight: 40
}

WebInspector.AnimationUI.Colors = {
    "Purple": WebInspector.Color.parse("#9C27B0"),
    "Light Blue": WebInspector.Color.parse("#03A9F4"),
    "Deep Orange": WebInspector.Color.parse("#FF5722"),
    "Blue": WebInspector.Color.parse("#5677FC"),
    "Lime": WebInspector.Color.parse("#CDDC39"),
    "Blue Grey": WebInspector.Color.parse("#607D8B"),
    "Pink": WebInspector.Color.parse("#E91E63"),
    "Green": WebInspector.Color.parse("#0F9D58"),
    "Brown": WebInspector.Color.parse("#795548"),
    "Cyan": WebInspector.Color.parse("#00BCD4")
}


/**
 * @param {!WebInspector.AnimationModel.Animation} animation
 * @return {string}
 */
WebInspector.AnimationUI.Color = function(animation)
{
    /**
     * @param {string} string
     * @return {number}
     */
    function hash(string)
    {
        var hash = 0;
        for (var i = 0; i < string.length; i++)
            hash = (hash << 5) + hash + string.charCodeAt(i);
        return Math.abs(hash);
    }

    var names = Object.keys(WebInspector.AnimationUI.Colors);
    var color = WebInspector.AnimationUI.Colors[names[hash(animation.name() || animation.id()) % names.length]];
    return color.asString(WebInspector.Color.Format.RGB);
}
