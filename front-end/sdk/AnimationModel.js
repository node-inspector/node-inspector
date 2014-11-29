// Copyright (c) 2014 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.


/**
 * @constructor
 * @extends {WebInspector.SDKModel}
 * @param {!WebInspector.Target} target
 */
WebInspector.AnimationModel = function(target)
{
    WebInspector.SDKModel.call(this, WebInspector.AnimationModel, target);
    this._agent = target.animationAgent();
    target.registerAnimationDispatcher(new WebInspector.AnimationDispatcher(this));
}

WebInspector.AnimationModel.Events = {
    AnimationPlayerCreated: "AnimationPlayerCreated"
}

WebInspector.AnimationModel.prototype = {
    /**
     * @param {!DOMAgent.NodeId} nodeId
     * @param {boolean} showSubtreeAnimations
     * @param {function(?Array.<!WebInspector.AnimationModel.AnimationPlayer>)} userCallback
     */
    getAnimationPlayers: function(nodeId, showSubtreeAnimations, userCallback)
    {
        /**
         * @param {?Protocol.Error} error
         * @param {!Array.<!AnimationAgent.AnimationPlayer>} payloads
         * @this {WebInspector.AnimationModel}
         */
        function resultCallback(error, payloads)
        {
            if (error) {
                userCallback(null);
                return;
            }
            userCallback(payloads.map(WebInspector.AnimationModel.AnimationPlayer.parsePayload.bind(null, this.target())));
        }

        this._agent.getAnimationPlayersForNode(nodeId, showSubtreeAnimations, resultCallback.bind(this));
    },

    /**
     * @param {!DOMAgent.NodeId} nodeId
     * @param {boolean} showSubtreeAnimations
     */
    startListening: function(nodeId, showSubtreeAnimations)
    {
        if (!this._enabled)
            this._agent.enable(this._wasEnabled.bind(this));
        this._agent.startListening(nodeId, showSubtreeAnimations);
    },

    stopListening: function()
    {
        this._agent.stopListening();
    },

    _wasEnabled: function()
    {
        this._enabled = true;
    },

    /**
     * @param {!AnimationAgent.AnimationPlayer} payload
     */
    animationPlayerCreated: function(payload)
    {
        var player = WebInspector.AnimationModel.AnimationPlayer.parsePayload(this.target(), payload);
        this.dispatchEventToListeners(WebInspector.AnimationModel.Events.AnimationPlayerCreated, player);
    },

    __proto__: WebInspector.SDKModel.prototype
}

/**
 * @constructor
 * @extends {WebInspector.SDKObject}
 * @param {!WebInspector.Target} target
 * @param {!AnimationAgent.AnimationPlayer} payload
 */
WebInspector.AnimationModel.AnimationPlayer = function(target, payload)
{
    WebInspector.SDKObject.call(this, target);
    this._payload = payload;
    this._source = new WebInspector.AnimationModel.AnimationNode(this.target(), this._payload.source);
}

/**
 * @param {!WebInspector.Target} target
 * @param {!AnimationAgent.AnimationPlayer} payload
 * @return {!WebInspector.AnimationModel.AnimationPlayer}
 */
WebInspector.AnimationModel.AnimationPlayer.parsePayload = function(target, payload)
{
    return new WebInspector.AnimationModel.AnimationPlayer(target, payload);
}

WebInspector.AnimationModel.AnimationPlayer.prototype = {
    /**
     * @return {!AnimationAgent.AnimationPlayer}
     */
    payload: function()
    {
        return this._payload;
    },

    /**
     * @return {string}
     */
    id: function()
    {
        return this._payload.id;
    },

    /**
     * @return {string}
     */
    name: function()
    {
        return this.source().name() || this.id();
    },

    /**
     * @return {boolean}
     */
    paused: function ()
    {
        return this._payload.pausedState;
    },

    /**
     * @return {string}
     */
    playState: function()
    {
        return this._payload.playState;
    },

    /**
     * @return {number}
     */
    playbackRate: function()
    {
        return this._payload.playbackRate;
    },

    /**
     * @return {number}
     */
    startTime: function()
    {
        return this._payload.startTime;
    },

    /**
     * @return {number}
     */
    currentTime: function()
    {
        return this._payload.currentTime;
    },

    /**
     * @return {!WebInspector.AnimationModel.AnimationNode}
     */
    source: function()
    {
        return this._source;
    },

    /**
     * @param {function(?WebInspector.AnimationModel.AnimationPlayer)} callback
     */
    pause: function(callback)
    {
        var wrappedCallback = InspectorBackend.wrapClientCallback(callback, "AnimationAgent.pauseAnimationPlayer(): ", WebInspector.AnimationModel.AnimationPlayer.bind(null, this._target));
        this.target().animationModel._agent.pauseAnimationPlayer(this.id(), wrappedCallback);
    },

    /**
     * @param {function(?WebInspector.AnimationModel.AnimationPlayer)} callback
     */
    play: function(callback)
    {
        var wrappedCallback = InspectorBackend.wrapClientCallback(callback, "AnimationAgent.playAnimationPlayer(): ", WebInspector.AnimationModel.AnimationPlayer.bind(null, this._target));
        this.target().animationModel._agent.playAnimationPlayer(this.id(), wrappedCallback);
    },

    /**
     * @param {number} currentTime
     * @param {function(?WebInspector.AnimationModel.AnimationPlayer)} callback
     */
    setCurrentTime: function(currentTime, callback)
    {
        var wrappedCallback = InspectorBackend.wrapClientCallback(callback, "AnimationAgent.setAnimationPlayerCurrentTime(): ", WebInspector.AnimationModel.AnimationPlayer.bind(null, this._target));
        this.target().animationModel._agent.setAnimationPlayerCurrentTime(this.id(), currentTime, wrappedCallback);
    },

    /**
     * @param {function(number, boolean)} callback
     */
    getCurrentState: function(callback)
    {
        /**
         * @param {?Protocol.Error} error
         * @param {number} currentTime
         * @param {boolean} isRunning
         */
        function mycallback(error, currentTime, isRunning)
        {
            if (error)
                return;
            callback(currentTime, isRunning);
        }
        this.target().animationModel._agent.getAnimationPlayerState(this.id(), mycallback);
    },

    __proto__: WebInspector.SDKObject.prototype
}

/**
 * @constructor
 * @extends {WebInspector.SDKObject}
 * @param {!WebInspector.Target} target
 * @param {!AnimationAgent.AnimationNode} payload
 */
WebInspector.AnimationModel.AnimationNode = function(target, payload)
{
    WebInspector.SDKObject.call(this, target);
    this._payload = payload;
    if (payload.keyframesRule)
        this._keyframesRule = new WebInspector.AnimationModel.KeyframesRule(target, payload.keyframesRule);
}

WebInspector.AnimationModel.AnimationNode.prototype = {
    /**
     * @return {number}
     */
    startDelay: function()
    {
        return this._payload.startDelay;
    },

    /**
     * @return {number}
     */
    playbackRate: function()
    {
        return this._payload.playbackRate;
    },

    /**
     * @return {number}
     */
    iterationStart: function()
    {
        return this._payload.iterationStart;
    },

    /**
     * @return {number}
     */
    iterationCount: function()
    {
        return this._payload.iterationCount;
    },

    /**
     * @return {number}
     */
    duration: function()
    {
        return this._payload.duration;
    },

    /**
     * @return {number}
     */
    direction: function()
    {
        return this._payload.direction;
    },

    /**
     * @return {number}
     */
    fillMode: function()
    {
        return this._payload.fillMode;
    },

    /**
     * @return {number}
     */
    timeFraction: function()
    {
        return this._payload.timeFraction;
    },

    /**
     * @return {string}
     */
    name: function()
    {
        return this._payload.name;
    },

    /**
     * @param {function(?WebInspector.DOMNode)} callback
     */
    getNode: function(callback)
    {
        /**
         * @this {WebInspector.AnimationModel.AnimationNode}
         * @param {?Array.<number>} nodeIds
         */
        function nodePushedCallback(nodeIds)
        {
            if (nodeIds)
                this.nodeId = nodeIds[0];
            callback(this.target().domModel.nodeForId(this.nodeId));
        }

        if (this.nodeId)
            callback(this.target().domModel.nodeForId(this.nodeId));
        else
            this._target.domModel.pushNodesByBackendIdsToFrontend([this._payload.backendNodeId], nodePushedCallback.bind(this));
    },

    /**
     * @return {?WebInspector.AnimationModel.KeyframesRule}
     */
    keyframesRule: function()
    {
        return this._keyframesRule;
    },

    __proto__: WebInspector.SDKObject.prototype
}

/**
 * @constructor
 * @extends {WebInspector.SDKObject}
 * @param {!WebInspector.Target} target
 * @param {!AnimationAgent.KeyframesRule} payload
 */
WebInspector.AnimationModel.KeyframesRule = function(target, payload)
{
    WebInspector.SDKObject.call(this, target);
    this._payload = payload;
    this._keyframes = this._payload.keyframes.map(function (keyframeStyle) {
        return new WebInspector.AnimationModel.KeyframeStyle(target, keyframeStyle);
    });
}

WebInspector.AnimationModel.KeyframesRule.prototype = {
    /**
     * @param {!Array.<!AnimationAgent.KeyframeStyle>} payload
     */
    _setKeyframesPayload: function(payload)
    {
        this._keyframes = payload.map(function (keyframeStyle) {
            return new WebInspector.AnimationModel.KeyframeStyle(this._target, keyframeStyle);
        });
    },

    /**
     * @return {string|undefined}
     */
    name: function()
    {
        return this._payload.name;
    },

    /**
     * @return {!Array.<!WebInspector.AnimationModel.KeyframeStyle>}
     */
    keyframes: function()
    {
        return this._keyframes;
    },

    __proto__: WebInspector.SDKObject.prototype
}

/**
 * @constructor
 * @extends {WebInspector.SDKObject}
 * @param {!WebInspector.Target} target
 * @param {!AnimationAgent.KeyframeStyle} payload
 */
WebInspector.AnimationModel.KeyframeStyle = function(target, payload)
{
    WebInspector.SDKObject.call(this, target);
    this._payload = payload;
    this._style = WebInspector.CSSStyleDeclaration.parsePayload(this.target().cssModel, payload.style);
}

WebInspector.AnimationModel.KeyframeStyle.prototype = {
    /**
     * @return {string}
     */
    offset: function()
    {
        return this._payload.offset;
    },

    /**
     * @return {!WebInspector.CSSStyleDeclaration}
     */
    style: function()
    {
        return this._style;
    },

    __proto__: WebInspector.SDKObject.prototype
}

/**
 * @constructor
 * @implements {AnimationAgent.Dispatcher}
 */
WebInspector.AnimationDispatcher = function(animationModel)
{
    this._animationModel = animationModel;
}

WebInspector.AnimationDispatcher.prototype = {
    /**
     * @override
     * @param {!AnimationAgent.AnimationPlayer} payload
     */
    animationPlayerCreated: function(payload)
    {
        this._animationModel.animationPlayerCreated(payload);
    }
}
