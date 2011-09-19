/*
 * Copyright (C) 2011 Google Inc. All rights reserved.
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

WebInspector.JavaScriptContextManager = function(resourceTreeModel, consoleView)
{
    resourceTreeModel.addEventListener(WebInspector.ResourceTreeModel.EventTypes.FrameAdded, this._frameAdded, this);
    resourceTreeModel.addEventListener(WebInspector.ResourceTreeModel.EventTypes.FrameNavigated, this._frameNavigated, this);
    resourceTreeModel.addEventListener(WebInspector.ResourceTreeModel.EventTypes.FrameDetached, this._frameDetached, this);
    this._consoleView = consoleView;
    this._frameIdToContext = {};
}

WebInspector.JavaScriptContextManager.prototype = {
    _frameAdded: function(event)
    {
        var frame = event.data;
        var parentFrameId = frame.parentId;
        var context = new WebInspector.FrameEvaluationContext(frame);
        this._frameIdToContext[frame.id] = context;
        this._consoleView.addContext(context);
    },

    _frameNavigated: function(event)
    {
        var frame = event.data.frame;
        var context = this._frameIdToContext[frame.id];
        if (context)
            context._frameNavigated(frame);
    },

    _frameDetached: function(event)
    {
        var frameId = event.data;
        var context = this._frameIdToContext[frameId];
        if (!context)
            return;
        this._consoleView.removeContext(context);
        delete this._frameIdToContext[frameId];
    },
}

WebInspector.JavaScriptContextManager.prototype.__proto__ = WebInspector.Object.prototype;

WebInspector.FrameEvaluationContext = function(frame)
{
    this._frame = frame;
}

WebInspector.FrameEvaluationContext.EventTypes = {
    Updated: "updated"
}

WebInspector.FrameEvaluationContext.prototype =
{
    _frameNavigated: function(frame)
    {
        this._frame = frame;
        this.dispatchEventToListeners(WebInspector.FrameEvaluationContext.EventTypes.Updated, this);
    },

    get frameId()
    {
        return this._frame.id
    },

    get url()
    {
        return this._frame.url;
    },

    get displayName()
    {
        if (!this._frame.parentId)
            return "<top frame>";
        var name = this._frame.name || "";
        var subtitle = new WebInspector.Resource(null, this._frame.url).displayName;
        if (subtitle) {
            if (!name)
                return subtitle;
            return name + "( " + subtitle + " )";
        }
        return "<iframe>";
    }
}

WebInspector.FrameEvaluationContext.prototype.__proto__ = WebInspector.Object.prototype;
