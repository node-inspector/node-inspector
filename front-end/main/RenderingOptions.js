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
 * @constructor
 * @implements {WebInspector.TargetManager.Observer}
 */
WebInspector.RenderingOptions = function()
{
    /**
     * @type {!Map.<!WebInspector.Setting, string>}
     */
    this._setterNames = new Map();
    this._mapSettingToSetter(WebInspector.settings.showPaintRects, "setShowPaintRects");
    this._mapSettingToSetter(WebInspector.settings.showDebugBorders, "setShowDebugBorders");
    this._mapSettingToSetter(WebInspector.settings.showFPSCounter, "setShowFPSCounter");
    this._mapSettingToSetter(WebInspector.settings.continuousPainting, "setContinuousPaintingEnabled");
    this._mapSettingToSetter(WebInspector.settings.showScrollBottleneckRects, "setShowScrollBottleneckRects");

    WebInspector.targetManager.observeTargets(this);
}

WebInspector.RenderingOptions.prototype = {
    /**
     * @param {!WebInspector.Target} target
     */
    targetAdded: function(target)
    {
        var settings = this._setterNames.keysArray();
        for (var i = 0; i < settings.length; ++i) {
            var setting = settings[i];
            if (setting.get()) {
                var setterName = this._setterNames.get(setting);
                target.pageAgent()[setterName](true);
            }
        }
    },

    /**
     * @param {!WebInspector.Target} target
     */
    targetRemoved: function(target)
    {
    },

    /**
     * @param {!WebInspector.Setting} setting
     * @param {string} setterName
     */
    _mapSettingToSetter: function(setting, setterName)
    {
        this._setterNames.set(setting, setterName);
        setting.addChangeListener(changeListener);

        function changeListener()
        {
            var targets = WebInspector.targetManager.targets();
            for (var i = 0; i < targets.length; ++i)
                targets[i].pageAgent()[setterName](setting.get());
        }
    }
}

/**
 * @constructor
 * @extends {WebInspector.VBox}
 */
WebInspector.RenderingOptions.View = function()
{
    WebInspector.VBox.call(this);
    this.registerRequiredCSS("ui/helpScreen.css");
    this.element.classList.add("help-indent-labels");

    var div = this.element.createChild("div", "settings-tab help-content help-container help-no-columns");
    div.appendChild(WebInspector.SettingsUI.createSettingCheckbox(WebInspector.UIString("Show paint rectangles"), WebInspector.settings.showPaintRects));
    div.appendChild(WebInspector.SettingsUI.createSettingCheckbox(WebInspector.UIString("Show composited layer borders"), WebInspector.settings.showDebugBorders));
    div.appendChild(WebInspector.SettingsUI.createSettingCheckbox(WebInspector.UIString("Show FPS meter"), WebInspector.settings.showFPSCounter));
    div.appendChild(WebInspector.SettingsUI.createSettingCheckbox(WebInspector.UIString("Enable continuous page repainting"), WebInspector.settings.continuousPainting));
    var child = WebInspector.SettingsUI.createSettingCheckbox(WebInspector.UIString("Show potential scroll bottlenecks"), WebInspector.settings.showScrollBottleneckRects);
    child.title = WebInspector.UIString("Shows areas of the page that slow down scrolling:\nTouch and mousewheel event listeners can delay scrolling.\nSome areas need to repaint their content when scrolled.");
    div.appendChild(child);
}

WebInspector.RenderingOptions.View.prototype = {
    __proto__: WebInspector.VBox.prototype
}
