/*
 * Copyright (C) 2013 Google Inc. All rights reserved.
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
 * @typedef {!{x: number, y: number, picture: string}}
 */
WebInspector.PictureFragment;

/**
 * @constructor
 * @param {!WebInspector.Target} target
 * @param {string} snapshotId
 */
WebInspector.PaintProfilerSnapshot = function(target, snapshotId)
{
    this._target = target;
    this._id = snapshotId;
}

/**
 * @param {!WebInspector.Target} target
 * @param {!Array.<!WebInspector.PictureFragment>} fragments
 * @param {function(?WebInspector.PaintProfilerSnapshot)} callback
 */
WebInspector.PaintProfilerSnapshot.loadFromFragments = function(target, fragments, callback)
{
    var wrappedCallback = InspectorBackend.wrapClientCallback(callback, "LayerTreeAgent.loadSnapshot(): ", WebInspector.PaintProfilerSnapshot.bind(null, target));
    target.layerTreeAgent().loadSnapshot(fragments, wrappedCallback);
}

/**
 * @param {!WebInspector.Target} target
 * @param {string} encodedPicture
 * @param {function(?WebInspector.PaintProfilerSnapshot)} callback
 */
WebInspector.PaintProfilerSnapshot.load = function(target, encodedPicture, callback)
{
    var fragment = {
        x: 0,
        y: 0,
        picture: encodedPicture
    };
    WebInspector.PaintProfilerSnapshot.loadFromFragments(target, [fragment], callback);
}

/**
 * @param {!Array.<!WebInspector.RawPaintProfilerLogItem>} log
 * @return {!Array.<!WebInspector.PaintProfilerLogItem>}
 */
WebInspector.PaintProfilerSnapshot._processAnnotations = function(log)
{
    var result = [];
    /** @type {!Array.<!Object.<string, string>>} */
    var commentGroupStack = [];

    for (var i = 0; i < log.length; ++i) {
        var method = log[i].method;
        switch (method) {
        case "beginCommentGroup":
            commentGroupStack.push({});
            break;
        case "addComment":
            var group = commentGroupStack.peekLast();
            if (!group) {
                console.assert(false, "Stray comment without a group");
                break;
            }
            var key = String(log[i].params["key"]);
            var value = String(log[i].params["value"]);
            if (!key || typeof value === "undefined") {
                console.assert(false, "Missing key or value in addComment() params");
                break;
            }
            if (key in group) {
                console.assert(false, "Duplicate key in comment group");
                break;
            }
            group[key] = value;
            break;
        case "endCommentGroup":
            if (!commentGroupStack.length)
                console.assert(false, "Unbalanced commentGroupEnd call");
            else
                commentGroupStack.pop();
            break;
        default:
            result.push(new WebInspector.PaintProfilerLogItem(log[i], i, commentGroupStack.peekLast()));
        }
    }
    return result;
}

WebInspector.PaintProfilerSnapshot.prototype = {
    dispose: function()
    {
        this._target.layerTreeAgent().releaseSnapshot(this._id);
    },

    /**
     * @return {!WebInspector.Target}
     */
    target: function()
    {
        return this._target;
    },

    /**
     * @param {?number} firstStep
     * @param {?number} lastStep
     * @param {?number} scale
     * @param {function(string=)} callback
     */
    requestImage: function(firstStep, lastStep, scale, callback)
    {
        var wrappedCallback = InspectorBackend.wrapClientCallback(callback, "LayerTreeAgent.replaySnapshot(): ");
        this._target.layerTreeAgent().replaySnapshot(this._id, firstStep || undefined, lastStep || undefined, scale || 1.0, wrappedCallback);
    },

    /**
     * @param {?DOMAgent.Rect} clipRect
     * @param {function(!Array.<!LayerTreeAgent.PaintProfile>=)} callback
     */
    profile: function(clipRect, callback)
    {
        var wrappedCallback = InspectorBackend.wrapClientCallback(callback, "LayerTreeAgent.profileSnapshot(): ");
        this._target.layerTreeAgent().profileSnapshot(this._id, 5, 1, clipRect || undefined, wrappedCallback);
    },

    /**
     * @param {function(!Array.<!WebInspector.PaintProfilerLogItem>=)} callback
     */
    commandLog: function(callback)
    {
        /**
         * @param {?string} error
         * @param {!Array.<!WebInspector.RawPaintProfilerLogItem>} log
         */
        function callbackWrapper(error, log)
        {
            if (error) {
                console.error("LayerTreeAgent.snapshotCommandLog(): " + error);
                callback();
                return;
            }
            callback(WebInspector.PaintProfilerSnapshot._processAnnotations(log));
        }

        this._target.layerTreeAgent().snapshotCommandLog(this._id, callbackWrapper);
    }
};

/**
 * @typedef {!{method: string, params: ?Array.<!Object.<string, *>>}}
 */
WebInspector.RawPaintProfilerLogItem;

/**
 * @constructor
 * @param {!WebInspector.RawPaintProfilerLogItem} rawEntry
 * @param {number} commandIndex
 * @param {!Object.<string, string>=} annotations
 */
WebInspector.PaintProfilerLogItem = function(rawEntry, commandIndex, annotations)
{
    this.method = rawEntry.method;
    this.params = rawEntry.params;
    this.annotations = annotations;
    this.commandIndex = commandIndex;
}

WebInspector.PaintProfilerLogItem.prototype = {
    /**
     * @return {number}
     */
    nodeId: function()
    {
        if (!this.annotations)
            return 0;
        var inspectorId = this.annotations["INSPECTOR_ID"];
        return Number(inspectorId);
    }
}
