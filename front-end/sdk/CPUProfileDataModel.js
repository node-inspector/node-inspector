// Copyright 2014 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.


/**
 * @constructor
 * @param {!ProfilerAgent.CPUProfile} profile
 */
WebInspector.CPUProfileDataModel = function(profile)
{
    this.profileHead = profile.head;
    this.samples = profile.samples;
    this.timestamps = profile.timestamps;
    this.profileStartTime = profile.startTime * 1000;
    this.profileEndTime = profile.endTime * 1000;
    this._assignParentsInProfile();
    if (this.samples) {
        this._normalizeTimestamps();
        this._buildIdToNodeMap();
        this._fixMissingSamples();
    }
    this._calculateTimes(profile);
}

WebInspector.CPUProfileDataModel.prototype = {
    /**
     * @param {!ProfilerAgent.CPUProfile} profile
     */
    _calculateTimes: function(profile)
    {
        function totalHitCount(node) {
            var result = node.hitCount;
            for (var i = 0; i < node.children.length; i++)
                result += totalHitCount(node.children[i]);
            return result;
        }
        profile.totalHitCount = totalHitCount(profile.head);

        var duration = this.profileEndTime - this.profileStartTime;
        var samplingInterval = duration / profile.totalHitCount;
        this.samplingInterval = samplingInterval;

        function calculateTimesForNode(node) {
            node.selfTime = node.hitCount * samplingInterval;
            var totalHitCount = node.hitCount;
            for (var i = 0; i < node.children.length; i++)
                totalHitCount += calculateTimesForNode(node.children[i]);
            node.totalTime = totalHitCount * samplingInterval;
            return totalHitCount;
        }
        calculateTimesForNode(profile.head);
    },

    _assignParentsInProfile: function()
    {
        var head = this.profileHead;
        head.parent = null;
        head.depth = -1;
        this.maxDepth = 0;
        var nodesToTraverse = [ head ];
        while (nodesToTraverse.length) {
            var parent = nodesToTraverse.pop();
            var depth = parent.depth + 1;
            if (depth > this.maxDepth)
                this.maxDepth = depth;
            var children = parent.children;
            var length = children.length;
            for (var i = 0; i < length; ++i) {
                var child = children[i];
                child.parent = parent;
                child.depth = depth;
                if (child.children.length)
                    nodesToTraverse.push(child);
            }
        }
    },

    _normalizeTimestamps: function()
    {
        var timestamps = this.timestamps;
        if (!timestamps) {
            // Support loading old CPU profiles that are missing timestamps.
            // Derive timestamps from profile start and stop times.
            var profileStartTime = this.profileStartTime;
            var interval = (this.profileEndTime - profileStartTime) / this.samples.length;
            timestamps = new Float64Array(this.samples.length + 1);
            for (var i = 0; i < timestamps.length; ++i)
                timestamps[i] = profileStartTime + i * interval;
            this.timestamps = timestamps;
            return;
        }

        // Convert samples from usec to msec
        for (var i = 0; i < timestamps.length; ++i)
            timestamps[i] /= 1000;
        var averageSample = (timestamps.peekLast() - timestamps[0]) / (timestamps.length - 1);
        // Add an extra timestamp used to calculate the last sample duration.
        this.timestamps.push(timestamps.peekLast() + averageSample);
        this.profileStartTime = timestamps[0];
        this.profileEndTime = timestamps.peekLast();
    },

    _buildIdToNodeMap: function()
    {
        /** @type {!Object.<number, !ProfilerAgent.CPUProfileNode>} */
        this._idToNode = {};
        var idToNode = this._idToNode;
        var stack = [this.profileHead];
        while (stack.length) {
            var node = stack.pop();
            idToNode[node.id] = node;
            for (var i = 0; i < node.children.length; i++)
                stack.push(node.children[i]);
        }

        var topLevelNodes = this.profileHead.children;
        for (var i = 0; i < topLevelNodes.length && !(this.gcNode && this.programNode && this.idleNode); i++) {
            var node = topLevelNodes[i];
            if (node.functionName === "(garbage collector)")
                this.gcNode = node;
            else if (node.functionName === "(program)")
                this.programNode = node;
            else if (node.functionName === "(idle)")
                this.idleNode = node;
        }
    },

    _fixMissingSamples: function()
    {
        // Sometimes sampler is not able to parse the JS stack and returns
        // a (program) sample instead. The issue leads to call frames belong
        // to the same function invocation being split apart.
        // Here's a workaround for that. When there's a single (program) sample
        // between two call stacks sharing the same bottom node, it is replaced
        // with the preceeding sample.
        var samples = this.samples;
        var samplesCount = samples.length;
        if (!this.programNode || samplesCount < 3)
            return;
        var idToNode = this._idToNode;
        var programNodeId = this.programNode.id;
        var gcNodeId = this.gcNode ? this.gcNode.id : -1;
        var idleNodeId = this.idleNode ? this.idleNode.id : -1;
        var prevNodeId = samples[0];
        var nodeId = samples[1];
        for (var sampleIndex = 1; sampleIndex < samplesCount - 1; sampleIndex++) {
            var nextNodeId = samples[sampleIndex + 1];
            if (nodeId === programNodeId && !isSystemNode(prevNodeId) && !isSystemNode(nextNodeId)
                && bottomNode(idToNode[prevNodeId]) === bottomNode(idToNode[nextNodeId])) {
                samples[sampleIndex] = prevNodeId;
            }
            prevNodeId = nodeId;
            nodeId = nextNodeId;
        }

        /**
         * @param {!ProfilerAgent.CPUProfileNode} node
         * @return {!ProfilerAgent.CPUProfileNode}
         */
        function bottomNode(node)
        {
            while (node.parent)
                node = node.parent;
            return node;
        }

        /**
         * @param {number} nodeId
         * @return {boolean}
         */
        function isSystemNode(nodeId)
        {
            return nodeId === programNodeId || nodeId === gcNodeId || nodeId === idleNodeId;
        }
    },

    /**
     * @param {function(number, !ProfilerAgent.CPUProfileNode, number)} openFrameCallback
     * @param {function(number, !ProfilerAgent.CPUProfileNode, number, number, number)} closeFrameCallback
     * @param {number=} startTime
     * @param {number=} stopTime
     */
    forEachFrame: function(openFrameCallback, closeFrameCallback, startTime, stopTime)
    {
        if (!this.profileHead)
            return;

        startTime = startTime || 0;
        stopTime = stopTime || Infinity;
        var samples = this.samples;
        var timestamps = this.timestamps;
        var idToNode = this._idToNode;
        var gcNode = this.gcNode;
        var samplesCount = samples.length;
        var startIndex = timestamps.lowerBound(startTime);
        var stackTop = 0;
        var stackNodes = [];
        var prevId = this.profileHead.id;
        var prevHeight = this.profileHead.depth;
        var sampleTime = timestamps[samplesCount];
        var gcParentNode = null;

        if (!this._stackStartTimes)
            this._stackStartTimes = new Float64Array(this.maxDepth + 2);
        var stackStartTimes = this._stackStartTimes;
        if (!this._stackChildrenDuration)
            this._stackChildrenDuration = new Float64Array(this.maxDepth + 2);
        var stackChildrenDuration = this._stackChildrenDuration;

        for (var sampleIndex = startIndex; sampleIndex < samplesCount; sampleIndex++) {
            sampleTime = timestamps[sampleIndex];
            if (sampleTime >= stopTime)
                break;
            var id = samples[sampleIndex];
            if (id === prevId)
                continue;
            var node = idToNode[id];
            var prevNode = idToNode[prevId];

            if (node === gcNode) {
                // GC samples have no stack, so we just put GC node on top of the last recorded sample.
                gcParentNode = prevNode;
                openFrameCallback(gcParentNode.depth + 1, gcNode, sampleTime);
                stackStartTimes[++stackTop] = sampleTime;
                stackChildrenDuration[stackTop] = 0;
                prevId = id;
                continue;
            }
            if (prevNode === gcNode) {
                // end of GC frame
                var start = stackStartTimes[stackTop];
                var duration = sampleTime - start;
                stackChildrenDuration[stackTop - 1] += duration;
                closeFrameCallback(gcParentNode.depth + 1, gcNode, start, duration, duration - stackChildrenDuration[stackTop]);
                --stackTop;
                prevNode = gcParentNode;
                prevId = prevNode.id;
                gcParentNode = null;
            }

            while (node.depth > prevNode.depth) {
                stackNodes.push(node);
                node = node.parent;
            }

            // Go down to the LCA and close current intervals.
            while (prevNode !== node) {
                var start = stackStartTimes[stackTop];
                var duration = sampleTime - start;
                stackChildrenDuration[stackTop - 1] += duration;
                closeFrameCallback(prevNode.depth, prevNode, start, duration, duration - stackChildrenDuration[stackTop]);
                --stackTop;
                if (node.depth === prevNode.depth) {
                    stackNodes.push(node);
                    node = node.parent;
                }
                prevNode = prevNode.parent;
            }

            // Go up the nodes stack and open new intervals.
            while (stackNodes.length) {
                node = stackNodes.pop();
                openFrameCallback(node.depth, node, sampleTime);
                stackStartTimes[++stackTop] = sampleTime;
                stackChildrenDuration[stackTop] = 0;
            }

            prevId = id;
        }

        if (idToNode[prevId] === gcNode) {
            var start = stackStartTimes[stackTop];
            var duration = sampleTime - start;
            stackChildrenDuration[stackTop - 1] += duration;
            closeFrameCallback(gcParentNode.depth + 1, node, start, duration, duration - stackChildrenDuration[stackTop]);
            --stackTop;
        }

        for (var node = idToNode[prevId]; node.parent; node = node.parent) {
            var start = stackStartTimes[stackTop];
            var duration = sampleTime - start;
            stackChildrenDuration[stackTop - 1] += duration;
            closeFrameCallback(node.depth, node, start, duration, duration - stackChildrenDuration[stackTop]);
            --stackTop;
        }
    },

    /**
     * @param {number} index
     * @return {!ProfilerAgent.CPUProfileNode}
     */
    nodeByIndex: function(index)
    {
        return this._idToNode[this.samples[index]];
    }

}
