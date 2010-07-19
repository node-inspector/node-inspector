/*
 * Copyright (C) 2010 Google Inc. All rights reserved.
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

WebInspector.CSSStyleModel = function()
{
}

WebInspector.CSSStyleModel.prototype = {
    getStylesAsync: function(nodeId, authOnly, userCallback)
    {
        InspectorBackend.getStyles(WebInspector.Callback.wrap(userCallback), nodeId, authOnly);
    },

    getComputedStyleAsync: function(nodeId, userCallback)
    {
        InspectorBackend.getComputedStyle(WebInspector.Callback.wrap(userCallback), nodeId);
    },

    setRuleSelector: function(ruleId, newContent, nodeId, successCallback, failureCallback)
    {
        function callback(newRulePayload, doesAffectSelectedNode)
        {
            if (!newRulePayload)
                failureCallback();
            else
                successCallback(WebInspector.CSSStyleDeclaration.parseRule(newRulePayload), doesAffectSelectedNode);
        }

        InspectorBackend.setRuleSelector(WebInspector.Callback.wrap(callback), ruleId, newContent, nodeId);
    },

    addRule: function(nodeId, newContent, successCallback, failureCallback)
    {
        function callback(rule, doesAffectSelectedNode)
        {
            if (!rule) {
                // Invalid syntax for a selector
                failureCallback();
            } else {
                var styleRule = WebInspector.CSSStyleDeclaration.parseRule(rule);
                styleRule.rule = rule;
                successCallback(styleRule, doesAffectSelectedNode);
            }
        }

        InspectorBackend.addRule(WebInspector.Callback.wrap(callback), newContent, nodeId);
    },

    toggleStyleEnabled: function(styleId, propertyName, disabled, userCallback)
    {
        function callback(newPayload)
        {
            if (!newPayload) {
                userCallback(null);
                return;
            }

            var newStyle = WebInspector.CSSStyleDeclaration.parseStyle(newPayload);
            userCallback(newStyle);
        }

        InspectorBackend.toggleStyleEnabled(WebInspector.Callback.wrap(callback), styleId, propertyName, disabled);
    },

    setCSSText: function(styleId, cssText)
    {
        InspectorBackend.setStyleText(WebInspector.Callback.wrap(null), styleId, cssText);
    },

    applyStyleText: function(styleId, styleText, propertyName, successCallback, failureCallback)
    {
        function callback(success, newPayload, changedProperties)
        {
            if (!success)
                failureCallback();
            else {
                var newStyle = newPayload ? WebInspector.CSSStyleDeclaration.parseStyle(newPayload) : null;
                successCallback(newStyle, changedProperties);
            }
        }

        InspectorBackend.applyStyleText(WebInspector.Callback.wrap(callback), styleId, styleText, propertyName);
    }
}
