/*
 * Copyright (C) 2007 Apple Inc.  All rights reserved.
 * Copyright (C) 2014 Google Inc. All rights reserved.
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
 * @extends {WebInspector.ElementsSidebarPane}
 */
WebInspector.PropertiesSidebarPane = function()
{
    WebInspector.ElementsSidebarPane.call(this, WebInspector.UIString("Properties"));

    WebInspector.targetManager.addModelListener(WebInspector.DOMModel, WebInspector.DOMModel.Events.AttrModified, this._onNodeChange, this);
    WebInspector.targetManager.addModelListener(WebInspector.DOMModel, WebInspector.DOMModel.Events.AttrRemoved, this._onNodeChange, this);
    WebInspector.targetManager.addModelListener(WebInspector.DOMModel, WebInspector.DOMModel.Events.CharacterDataModified, this._onNodeChange, this);
    WebInspector.targetManager.addModelListener(WebInspector.DOMModel, WebInspector.DOMModel.Events.ChildNodeCountUpdated, this._onNodeChange, this);
}

WebInspector.PropertiesSidebarPane._objectGroupName = "properties-sidebar-pane";

WebInspector.PropertiesSidebarPane.prototype = {
    /**
     * @param {!WebInspector.Throttler.FinishCallback} finishCallback
     * @protected
     */
    doUpdate: function(finishCallback)
    {
        if (this._lastRequestedNode) {
            this._lastRequestedNode.target().runtimeAgent().releaseObjectGroup(WebInspector.PropertiesSidebarPane._objectGroupName);
            delete this._lastRequestedNode;
        }

        var node = this.node();
        if (!node) {
            this.bodyElement.removeChildren();
            this.sections = [];
            finishCallback();
            return;
        }

        this._lastRequestedNode = node;
        node.resolveToObject(WebInspector.PropertiesSidebarPane._objectGroupName, nodeResolved.bind(this));

        /**
         * @param {?WebInspector.RemoteObject} object
         * @this {WebInspector.PropertiesSidebarPane}
         */
        function nodeResolved(object)
        {
            if (!object) {
                finishCallback();
                return;
            }

            /**
             * @suppressReceiverCheck
             * @this {*}
             */
            function protoList()
            {
                var proto = this;
                var result = { __proto__: null };
                var counter = 1;
                while (proto) {
                    result[counter++] = proto;
                    proto = proto.__proto__;
                }
                return result;
            }
            object.callFunction(protoList, undefined, nodePrototypesReady.bind(this));
            object.release();
        }

        /**
         * @param {?WebInspector.RemoteObject} object
         * @param {boolean=} wasThrown
         * @this {WebInspector.PropertiesSidebarPane}
         */
        function nodePrototypesReady(object, wasThrown)
        {
            if (!object || wasThrown) {
                finishCallback();
                return;
            }
            object.getOwnProperties(fillSection.bind(this));
            object.release();
        }

        /**
         * @param {?Array.<!WebInspector.RemoteObjectProperty>} prototypes
         * @this {WebInspector.PropertiesSidebarPane}
         */
        function fillSection(prototypes)
        {
            if (!prototypes) {
                finishCallback();
                return;
            }

            var expanded = [];
            var sections = this.sections || [];
            for (var i = 0; i < sections.length; ++i)
                expanded.push(sections[i].expanded);

            var body = this.bodyElement;
            body.removeChildren();
            this.sections = [];

            // Get array of prototype user-friendly names.
            for (var i = 0; i < prototypes.length; ++i) {
                if (!parseInt(prototypes[i].name, 10))
                    continue;
                var prototype = prototypes[i].value;
                var title = prototype.description;
                title = title.replace(/Prototype$/, "");
                var section = new WebInspector.ObjectPropertiesSection(prototype, title);
                this.sections.push(section);
                body.appendChild(section.element);
                if (expanded[this.sections.length - 1])
                    section.expand();
            }

            finishCallback();
        }
    },

    /**
     * @param {!WebInspector.Event} event
     */
    _onNodeChange: function(event)
    {
        if (!this.node())
            return;
        var data = event.data;
        var node = /** @type {!WebInspector.DOMNode} */ (data instanceof WebInspector.DOMNode ? data : data.node);
        if (this.node() !== node)
            return;
        this.update();
    },

    __proto__: WebInspector.ElementsSidebarPane.prototype
}
