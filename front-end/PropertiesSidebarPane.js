/*
 * Copyright (C) 2007 Apple Inc.  All rights reserved.
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

WebInspector.PropertiesSidebarPane = function()
{
    WebInspector.SidebarPane.call(this, WebInspector.UIString("Properties"));
}

WebInspector.PropertiesSidebarPane.prototype = {
    update: function(node)
    {
        var body = this.bodyElement;

        if (!node) {
            body.removeChildren();
            this.sections = [];
            return;
        }

        var self = this;
        var callback = function(prototypes) {
            var body = self.bodyElement;
            body.removeChildren();
            self.sections = [];

            var path = [];
            // Get array of prototype user-friendly names.
            for (var i = 0; i < prototypes.length; ++i) {
                var prototype = new WebInspector.ObjectProxy(node.injectedScriptId, node.id, path.slice());
                var section = new WebInspector.ObjectPropertiesSection(prototype, prototypes[i], WebInspector.UIString("Prototype"));
                self.sections.push(section);
                body.appendChild(section.element);
                path.push("__proto__");
            }
        };
        InjectedScriptAccess.get(node.injectedScriptId).getPrototypes(node.id, callback);
    }
}

WebInspector.PropertiesSidebarPane.prototype.__proto__ = WebInspector.SidebarPane.prototype;
