/*
 * Copyright (C) 2007 Apple Inc.  All rights reserved.
 * Copyright (C) 2009 Joseph Pecoraro
 *
 * Redistribution and use in source and binary forms, with or without
 * modification, are permitted provided that the following conditions
 * are met:
 *
 * 1.  Redistributions of source code must retain the above copyright
 *     notice, this list of conditions and the following disclaimer.
 * 2.  Redistributions in binary form must reproduce the above copyright
 *     notice, this list of conditions and the following disclaimer in the
 *     documentation and/or other materials provided with the distribution.
 * 3.  Neither the name of Apple Computer, Inc. ("Apple") nor the names of
 *     its contributors may be used to endorse or promote products derived
 *     from this software without specific prior written permission.
 *
 * THIS SOFTWARE IS PROVIDED BY APPLE AND ITS CONTRIBUTORS "AS IS" AND ANY
 * EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED
 * WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
 * DISCLAIMED. IN NO EVENT SHALL APPLE OR ITS CONTRIBUTORS BE LIABLE FOR ANY
 * DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES
 * (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES;
 * LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND
 * ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT
 * (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF
 * THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
 */

/**
 * @constructor
 * @extends {WebInspector.ThrottledWidget}
 */
WebInspector.EventListenersWidget = function()
{
    WebInspector.ThrottledWidget.call(this);
    this.element.classList.add("events-pane");

    this._showForAncestorsSetting = WebInspector.settings.createSetting("showEventListenersForAncestors", true);
    this._showForAncestorsSetting.addChangeListener(this.update.bind(this));
    this._showFrameworkListenersSetting = WebInspector.settings.createSetting("showFrameowkrListeners", true);
    this._showFrameworkListenersSetting.addChangeListener(this._showFrameworkListenersChanged.bind(this));
    this._eventListenersView = new WebInspector.EventListenersView(this.element);
    WebInspector.context.addFlavorChangeListener(WebInspector.DOMNode, this.update, this);
}

/**
 * @return {!WebInspector.ElementsSidebarViewWrapperPane}
 */
WebInspector.EventListenersWidget.createSidebarWrapper = function()
{
    var widget = new WebInspector.EventListenersWidget();
    var result = new WebInspector.ElementsSidebarViewWrapperPane(WebInspector.UIString("Event Listeners"), widget);
    var refreshButton = new WebInspector.ToolbarButton(WebInspector.UIString("Refresh"), "refresh-toolbar-item");
    refreshButton.addEventListener("click", widget.update.bind(widget));
    result.toolbar().appendToolbarItem(refreshButton);
    result.toolbar().appendToolbarItem(new WebInspector.ToolbarCheckbox(WebInspector.UIString("Ancestors"), WebInspector.UIString("Show listeners on the ancestors"), widget._showForAncestorsSetting));
    result.toolbar().appendToolbarItem(new WebInspector.ToolbarCheckbox(WebInspector.UIString("Framework listeners"), WebInspector.UIString("Resolve event listeners bound with framework"), widget._showFrameworkListenersSetting));
    return result;
}

WebInspector.EventListenersWidget._objectGroupName = "event-listeners-panel";

WebInspector.EventListenersWidget.prototype = {
    /**
     * @override
     * @protected
     * @return {!Promise.<?>}
     */
    doUpdate: function()
    {
        if (this._lastRequestedNode) {
            this._lastRequestedNode.target().runtimeAgent().releaseObjectGroup(WebInspector.EventListenersWidget._objectGroupName);
            delete this._lastRequestedNode;
        }
        var node = WebInspector.context.flavor(WebInspector.DOMNode);
        if (!node) {
            this._eventListenersView.reset();
            this._eventListenersView.addEmptyHolderIfNeeded();
            return Promise.resolve();
        }
        this._lastRequestedNode = node;
        var selectedNodeOnly = !this._showForAncestorsSetting.get();
        var promises = [];
        var listenersView = this._eventListenersView;
        promises.push(node.resolveToObjectPromise(WebInspector.EventListenersWidget._objectGroupName));
        if (!selectedNodeOnly) {
            var currentNode = node.parentNode;
            while (currentNode) {
                promises.push(currentNode.resolveToObjectPromise(WebInspector.EventListenersWidget._objectGroupName));
                currentNode = currentNode.parentNode;
            }
            promises.push(this._windowObjectInNodeContext(node));
        }
        return Promise.all(promises).then(this._eventListenersView.addObjects.bind(this._eventListenersView)).then(this._showFrameworkListenersChanged.bind(this));
    },


    _showFrameworkListenersChanged: function()
    {
        this._eventListenersView.showFrameworkListeners(this._showFrameworkListenersSetting.get());
    },

    /**
     * @param {!WebInspector.DOMNode} node
     * @return {!Promise<!WebInspector.RemoteObject>}
     */
    _windowObjectInNodeContext: function(node)
    {
        return new Promise(windowObjectInNodeContext);

        /**
         * @param {function(?)} fulfill
         * @param {function(*)} reject
         */
        function windowObjectInNodeContext(fulfill, reject)
        {
            var executionContexts = node.target().runtimeModel.executionContexts();
            var context = null;
            if (node.frameId()) {
                for (var i = 0; i < executionContexts.length; ++i) {
                    var executionContext = executionContexts[i];
                    if (executionContext.frameId === node.frameId() && executionContext.isMainWorldContext)
                        context = executionContext;
                }
            } else {
                context = executionContexts[0];
            }
            context.evaluate("self", WebInspector.EventListenersWidget._objectGroupName, false, true, false, false, fulfill);
        }
    },

    _eventListenersArrivedForTest: function()
    {
    },

    __proto__: WebInspector.ThrottledWidget.prototype
}
