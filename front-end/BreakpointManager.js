/*
 * Copyright (C) 2008 Apple Inc. All Rights Reserved.
 * Copyright (C) 2010 Google Inc. All rights reserved.
 *
 * Redistribution and use in source and binary forms, with or without
 * modification, are permitted provided that the following conditions
 * are met:
 * 1. Redistributions of source code must retain the above copyright
 *    notice, this list of conditions and the following disclaimer.
 * 2. Redistributions in binary form must reproduce the above copyright
 *    notice, this list of conditions and the following disclaimer in the
 *    documentation and/or other materials provided with the distribution.
 *
 * THIS SOFTWARE IS PROVIDED BY APPLE INC. ``AS IS'' AND ANY
 * EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE
 * IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR
 * PURPOSE ARE DISCLAIMED.  IN NO EVENT SHALL APPLE INC. OR
 * CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL,
 * EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO,
 * PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR
 * PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY
 * OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT
 * (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE
 * OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
 */

WebInspector.BreakpointManager = function()
{
    this._breakpoints = {};
    this._nativeBreakpoints = {};
    this._domBreakpoints = {};
}

WebInspector.BreakpointManager.prototype = {
    setOneTimeBreakpoint: function(sourceID, line)
    {
        var breakpoint = new WebInspector.Breakpoint(this, sourceID, undefined, line, true, undefined);
        if (this._breakpoints[breakpoint.id])
            return;
        if (this._oneTimeBreakpoint)
            InspectorBackend.removeBreakpoint(this._oneTimeBreakpoint.sourceID, this._oneTimeBreakpoint.line);
        this._oneTimeBreakpoint = breakpoint;
        // FIXME(40669): one time breakpoint will be persisted in inspector settings if not hit.
        this._setBreakpointOnBackend(breakpoint, true);
    },

    removeOneTimeBreakpoint: function()
    {
        if (this._oneTimeBreakpoint) {
            InspectorBackend.removeBreakpoint(this._oneTimeBreakpoint.sourceID, this._oneTimeBreakpoint.line);
            delete this._oneTimeBreakpoint;
        }
    },

    setBreakpoint: function(sourceID, url, line, enabled, condition)
    {
        var breakpoint = this._setBreakpoint(sourceID, url, line, enabled, condition);
        if (breakpoint)
            this._setBreakpointOnBackend(breakpoint);
    },

    restoredBreakpoint: function(sourceID, url, line, enabled, condition)
    {
        this._setBreakpoint(sourceID, url, line, enabled, condition);
    },

    breakpointsForSourceID: function(sourceID)
    {
        var breakpoints = [];
        for (var id in this._breakpoints) {
            if (this._breakpoints[id].sourceID === sourceID)
                breakpoints.push(this._breakpoints[id]);
        }
        return breakpoints;
    },

    breakpointsForURL: function(url)
    {
        var breakpoints = [];
        for (var id in this._breakpoints) {
            if (this._breakpoints[id].url === url)
                breakpoints.push(this._breakpoints[id]);
        }
        return breakpoints;
    },

    reset: function()
    {
        this._breakpoints = {};
        delete this._oneTimeBreakpoint;
        this._nativeBreakpoints = {};
    },

    _setBreakpoint: function(sourceID, url, line, enabled, condition)
    {
        var breakpoint = new WebInspector.Breakpoint(this, sourceID, url, line, enabled, condition);
        if (this._breakpoints[breakpoint.id])
            return;
        if (this._oneTimeBreakpoint && (this._oneTimeBreakpoint.id == breakpoint.id))
            delete this._oneTimeBreakpoint;
        this._breakpoints[breakpoint.id] = breakpoint;
        breakpoint.addEventListener("removed", this._breakpointRemoved, this);
        this.dispatchEventToListeners("breakpoint-added", breakpoint);
        return breakpoint;
    },

    _breakpointRemoved: function(event)
    {
        delete this._breakpoints[event.target.id];
    },

    _setBreakpointOnBackend: function(breakpoint, isOneTime)
    {
        function didSetBreakpoint(success, line)
        {
            if (success && line == breakpoint.line)
                return;
            if (isOneTime) {
                if (success)
                    this._oneTimeBreakpoint.line = line;
                else
                    delete this._oneTimeBreakpoint;
            } else {
                breakpoint.remove();
                if (success)
                    this._setBreakpoint(breakpoint.sourceID, breakpoint.url, line, breakpoint.enabled, breakpoint.condition);
            }
        }
        InspectorBackend.setBreakpoint(breakpoint.sourceID, breakpoint.line, breakpoint.enabled, breakpoint.condition, didSetBreakpoint.bind(this));
    },

    createDOMBreakpoint: function(nodeId, domEventType, disabled)
    {
        var frontendId = "dom:" + nodeId + ":" + domEventType;
        if (frontendId in this._nativeBreakpoints)
            return;

        var breakpoint = new WebInspector.DOMBreakpoint(this, frontendId, nodeId, domEventType);
        this._nativeBreakpoints[frontendId] = breakpoint;
        this._domBreakpoints[frontendId] = breakpoint;
        this.dispatchEventToListeners("dom-breakpoint-added", breakpoint);
        breakpoint.enabled = !disabled;
        return breakpoint;
    },

    createEventListenerBreakpoint: function(eventName, disabled)
    {
        var frontendId = eventName;
        if (frontendId in this._nativeBreakpoints)
            return;

        var breakpoint = new WebInspector.EventListenerBreakpoint(this, frontendId, eventName);
        this._nativeBreakpoints[frontendId] = breakpoint;
        breakpoint.enabled = !disabled;
        return breakpoint;
    },

    createXHRBreakpoint: function(url, disabled)
    {
        var frontendId = url;
        if (frontendId in this._nativeBreakpoints)
            return;

        var breakpoint = new WebInspector.XHRBreakpoint(this, frontendId, url);
        this._nativeBreakpoints[frontendId] = breakpoint;
        this.dispatchEventToListeners("xhr-breakpoint-added", breakpoint);
        breakpoint.enabled = !disabled
        return breakpoint;
    },

    _removeNativeBreakpoint: function(breakpoint)
    {
        if (breakpoint._beingSetOnBackend)
            return;
        if (breakpoint.enabled)
            this._removeNativeBreakpointFromBackend(breakpoint);
        delete this._nativeBreakpoints[breakpoint._frontendId];
        if (breakpoint._type === "DOM")
            delete this._domBreakpoints[breakpoint._frontendId];
        breakpoint.dispatchEventToListeners("removed");
    },

    _setNativeBreakpointEnabled: function(breakpoint, enabled)
    {
        if (breakpoint._beingSetOnBackend)
            return;
        if (breakpoint.enabled === enabled)
            return;
        if (enabled)
            this._setNativeBreakpointOnBackend(breakpoint);
        else
            this._removeNativeBreakpointFromBackend(breakpoint);
    },

    _setNativeBreakpointOnBackend: function(breakpoint)
    {
        breakpoint._beingSetOnBackend = true;
        var data = { type: breakpoint._type, condition: breakpoint._condition() };
        InspectorBackend.setNativeBreakpoint(data, didSetNativeBreakpoint.bind(this));

        function didSetNativeBreakpoint(backendBreakpointId)
        {
            breakpoint._beingSetOnBackend = false;
            if (backendBreakpointId !== "") {
                breakpoint._backendId = backendBreakpointId;
                this._breakpoints[backendBreakpointId] = breakpoint;
            }
            breakpoint.dispatchEventToListeners("enable-changed");
        }
    },

    _removeNativeBreakpointFromBackend: function(breakpoint)
    {
        InspectorBackend.removeNativeBreakpoint(breakpoint._backendId);
        delete this._breakpoints[breakpoint._backendId]
        delete breakpoint._backendId;
        breakpoint.dispatchEventToListeners("enable-changed");
    },

    debuggerPaused: function(details)
    {
        if (details.eventType !== WebInspector.DebuggerEventTypes.NativeBreakpoint)
            return;

        var breakpoint = this._breakpoints[details.eventData.breakpointId];
        if (!breakpoint)
            return;

        breakpoint.hit = true;
        breakpoint.dispatchEventToListeners("hit-state-changed");
        this._lastHitBreakpoint = breakpoint;

        this.dispatchEventToListeners("breakpoint-hit", { breakpoint: breakpoint, eventData: details.eventData });
    },

    debuggerResumed: function()
    {
        if (!this._lastHitBreakpoint)
            return;
        this._lastHitBreakpoint.hit = false;
        this._lastHitBreakpoint.dispatchEventToListeners("hit-state-changed");
        delete this._lastHitBreakpoint;
    },

    restoreDOMBreakpoints: function()
    {
        var domBreakpoints = this._domBreakpoints;
        this._domBreakpoints = {};

        var breakpointsToRestore = {};
        for (var frontendId in domBreakpoints) {
            var breakpoint = domBreakpoints[frontendId];
            var path = breakpoint._path;
            if (!path)
                continue;
            if (!breakpointsToRestore[path]) {
                breakpointsToRestore[path] = [];
                InspectorBackend.pushNodeByPathToFrontend(path, restoreBreakpointsForNode.bind(this, breakpointsToRestore[path]));
            }
            breakpointsToRestore[path].push(breakpoint);
        }

        function restoreBreakpointsForNode(breakpoints, nodeId)
        {
            if (!nodeId)
                return;
            for (var i = 0; i < breakpoints.length; ++i)
                this.createDOMBreakpoint(nodeId, breakpoints[i]._domEventType, !breakpoints[i].enabled);
        }
    }
}

WebInspector.BreakpointManager.prototype.__proto__ = WebInspector.Object.prototype;

WebInspector.Breakpoint = function(breakpointManager, sourceID, url, line, enabled, condition)
{
    this.url = url;
    this.line = line;
    this.sourceID = sourceID;
    this._enabled = enabled;
    this._condition = condition || "";
    this._sourceText = "";
    this._breakpointManager = breakpointManager;
}

WebInspector.Breakpoint.prototype = {
    get enabled()
    {
        return this._enabled;
    },

    set enabled(x)
    {
        if (this._enabled === x)
            return;

        this._enabled = x;
        this._breakpointManager._setBreakpointOnBackend(this);
        this.dispatchEventToListeners("enable-changed");
    },

    get sourceText()
    {
        return this._sourceText;
    },

    set sourceText(text)
    {
        this._sourceText = text;
        this.dispatchEventToListeners("text-changed");
    },

    get id()
    {
        return this.sourceID + ":" + this.line;
    },

    get condition()
    {
        return this._condition;
    },

    set condition(c)
    {
        c = c || "";
        if (this._condition === c)
            return;

        this._condition = c;
        if (this.enabled)
            this._breakpointManager._setBreakpointOnBackend(this);
        this.dispatchEventToListeners("condition-changed");
    },

    compareTo: function(other)
    {
        if (this.url != other.url)
            return this.url < other.url ? -1 : 1;
        if (this.line != other.line)
            return this.line < other.line ? -1 : 1;
        return 0;
    },

    remove: function()
    {
        InspectorBackend.removeBreakpoint(this.sourceID, this.line);
        this.dispatchEventToListeners("removed");
        this.removeAllListeners();
        delete this._breakpointManager;
    }
}

WebInspector.Breakpoint.prototype.__proto__ = WebInspector.Object.prototype;

WebInspector.NativeBreakpoint = function(manager, frontendId, type)
{
    this._manager = manager;
    this.__frontendId = frontendId;
    this.__type = type;
}

WebInspector.NativeBreakpoint.prototype = {
    get enabled()
    {
        return "_backendId" in this;
    },

    set enabled(enabled)
    {
        this._manager._setNativeBreakpointEnabled(this, enabled);
    },

    remove: function()
    {
        this._manager._removeNativeBreakpoint(this);
        this._onRemove();
    },

    get _frontendId()
    {
        return this.__frontendId;
    },

    get _type()
    {
        return this.__type;
    },

    _compare: function(x, y)
    {
        if (x !== y)
            return x < y ? -1 : 1;
        return 0;
    },

    _onRemove: function()
    {
    }
}

WebInspector.NativeBreakpoint.prototype.__proto__ = WebInspector.Object.prototype;

WebInspector.DOMBreakpoint = function(manager, frontendId, nodeId, domEventType)
{
    WebInspector.NativeBreakpoint.call(this, manager, frontendId, "DOM");
    this._nodeId = nodeId;
    this._domEventType = domEventType;

    var node = WebInspector.domAgent.nodeForId(this._nodeId);
    if (node) {
        node.breakpoints[this._domEventType] = this;
        this._path = node.path();
    }
}

WebInspector.DOMBreakpoint.prototype = {
    click: function()
    {
        WebInspector.updateFocusedNode(this._nodeId);
    },

    compareTo: function(other)
    {
        return this._compare(this._domEventType, other._domEventType);
    },

    populateLabelElement: function(element)
    {
        element.appendChild(WebInspector.panels.elements.linkifyNodeById(this._nodeId));
        element.appendChild(document.createTextNode(" - "));
        element.appendChild(document.createTextNode(WebInspector.domBreakpointTypeLabel(this._domEventType)));
    },

    populateStatusMessageElement: function(element, eventData)
    {
        var substitutions = [WebInspector.domBreakpointTypeLabel(this._domEventType), WebInspector.panels.elements.linkifyNodeById(this._nodeId)];
        var formatters = {
            s: function(substitution)
            {
                return substitution;
            }
        };
        function append(a, b)
        {
            if (typeof b === "string")
                b = document.createTextNode(b);
            element.appendChild(b);
        }
        if (this._domEventType === WebInspector.DOMBreakpointTypes.SubtreeModified) {
            var targetNode = WebInspector.panels.elements.linkifyNodeById(eventData.targetNodeId);
            if (eventData.insertion) {
                if (eventData.targetNodeId !== this._nodeId)
                    WebInspector.formatLocalized("Paused on a \"%s\" breakpoint set on %s, because a new child was added to its descendant %s.", substitutions.concat(targetNode), formatters, "", append);
                else
                    WebInspector.formatLocalized("Paused on a \"%s\" breakpoint set on %s, because a new child was added to that node.", substitutions, formatters, "", append);
            } else
                WebInspector.formatLocalized("Paused on a \"%s\" breakpoint set on %s, because its descendant %s was removed.", substitutions.concat(targetNode), formatters, "", append);
        } else
            WebInspector.formatLocalized("Paused on a \"%s\" breakpoint set on %s.", substitutions, formatters, "", append);
    },

    _condition: function()
    {
        return { nodeId: this._nodeId, type: this._domEventType };
    },

    _onRemove: function()
    {
        var node = WebInspector.domAgent.nodeForId(this._nodeId);
        if (node)
            delete node.breakpoints[this._domEventType];
    }
}

WebInspector.DOMBreakpoint.prototype.__proto__ = WebInspector.NativeBreakpoint.prototype;

WebInspector.EventListenerBreakpoint = function(manager, frontendId, eventName)
{
    WebInspector.NativeBreakpoint.call(this, manager, frontendId, "EventListener");
    this._eventName = eventName;
}

WebInspector.EventListenerBreakpoint.prototype = {
    compareTo: function(other)
    {
        return this._compare(this._eventName, other._eventName);
    },

    populateLabelElement: function(element)
    {
        element.appendChild(document.createTextNode(this._uiEventName()));
    },

    populateStatusMessageElement: function(element, eventData)
    {
        var status = WebInspector.UIString("Paused on a \"%s\" Event Listener.", this._uiEventName());
        element.appendChild(document.createTextNode(status));
    },

    _condition: function()
    {
        return { eventName: this._eventName };
    },

    _uiEventName: function()
    {
        if (!WebInspector.EventListenerBreakpoint._uiEventNames) {
            WebInspector.EventListenerBreakpoint._uiEventNames = {
                "instrumentation:setTimer": WebInspector.UIString("Set Timer"),
                "instrumentation:clearTimer": WebInspector.UIString("Clear Timer"),
                "instrumentation:timerFired": WebInspector.UIString("Timer Fired")
            };
        }
        return WebInspector.EventListenerBreakpoint._uiEventNames[this._eventName] || this._eventName.substring(this._eventName.indexOf(":") + 1);
    }
}

WebInspector.EventListenerBreakpoint.prototype.__proto__ = WebInspector.NativeBreakpoint.prototype;

WebInspector.XHRBreakpoint = function(manager, frontendId, url)
{
    WebInspector.NativeBreakpoint.call(this, manager, frontendId, "XHR");
    this._url = url;
}

WebInspector.XHRBreakpoint.prototype = {
    compareTo: function(other)
    {
        return this._compare(this._url, other._url);
    },

    populateLabelElement: function(element)
    {
        var label;
        if (!this._url.length)
            label = WebInspector.UIString("Any XHR");
        else
            label = WebInspector.UIString("URL contains \"%s\"", this._url);
        element.appendChild(document.createTextNode(label));
    },

    populateStatusMessageElement: function(element)
    {
        var status = WebInspector.UIString("Paused on a XMLHttpRequest.");
        element.appendChild(document.createTextNode(status));
    },

    _condition: function()
    {
        return { url: this._url };
    }
}

WebInspector.XHRBreakpoint.prototype.__proto__ = WebInspector.NativeBreakpoint.prototype;

WebInspector.DebuggerEventTypes = {
    JavaScriptPause: 0,
    JavaScriptBreakpoint: 1,
    NativeBreakpoint: 2
};

WebInspector.DOMBreakpointTypes = {
    SubtreeModified: 0,
    AttributeModified: 1,
    NodeRemoved: 2
};

WebInspector.domBreakpointTypeLabel = function(type)
{
    if (!WebInspector._DOMBreakpointTypeLabels) {
        WebInspector._DOMBreakpointTypeLabels = {};
        WebInspector._DOMBreakpointTypeLabels[WebInspector.DOMBreakpointTypes.SubtreeModified] = WebInspector.UIString("Subtree Modified");
        WebInspector._DOMBreakpointTypeLabels[WebInspector.DOMBreakpointTypes.AttributeModified] = WebInspector.UIString("Attribute Modified");
        WebInspector._DOMBreakpointTypeLabels[WebInspector.DOMBreakpointTypes.NodeRemoved] = WebInspector.UIString("Node Removed");
    }
    return WebInspector._DOMBreakpointTypeLabels[type];
}

WebInspector.domBreakpointTypeContextMenuLabel = function(type)
{
    if (!WebInspector._DOMBreakpointTypeContextMenuLabels) {
        WebInspector._DOMBreakpointTypeContextMenuLabels = {};
        WebInspector._DOMBreakpointTypeContextMenuLabels[WebInspector.DOMBreakpointTypes.SubtreeModified] = WebInspector.UIString("Break on Subtree Modifications");
        WebInspector._DOMBreakpointTypeContextMenuLabels[WebInspector.DOMBreakpointTypes.AttributeModified] = WebInspector.UIString("Break on Attributes Modifications");
        WebInspector._DOMBreakpointTypeContextMenuLabels[WebInspector.DOMBreakpointTypes.NodeRemoved] = WebInspector.UIString("Break on Node Removal");
    }
    return WebInspector._DOMBreakpointTypeContextMenuLabels[type];
}
