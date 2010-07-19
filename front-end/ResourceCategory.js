/*
 * Copyright (C) 2007, 2008 Apple Inc.  All rights reserved.
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

WebInspector.ResourceCategory = function(name, title, color)
{
    WebInspector.AbstractTimelineCategory.call(this, name, title, color);
    this.resources = [];
}

WebInspector.ResourceCategory.prototype = {

    addResource: function(resource)
    {
        var a = resource;
        var resourcesLength = this.resources.length;
        for (var i = 0; i < resourcesLength; ++i) {
            var b = this.resources[i];
            if (a._lastPathComponentLowerCase && b._lastPathComponentLowerCase)
                if (a._lastPathComponentLowerCase < b._lastPathComponentLowerCase)
                    break;
            else if (a.name && b.name)
                if (a.name < b.name)
                    break;
        }

        this.resources.splice(i, 0, resource);
    },

    removeResource: function(resource)
    {
        this.resources.remove(resource, true);
    },

    removeAllResources: function(resource)
    {
        this.resources = [];
    }
}

WebInspector.ResourceCategory.prototype.__proto__ = WebInspector.AbstractTimelineCategory.prototype;
