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

WebInspector.SettingsScreen = function()
{
    WebInspector.HelpScreen.call(this, WebInspector.UIString("Settings"));

    this._leftColumnElement = document.createElement("td");
    this._rightColumnElement = document.createElement("td");

    var p = this._appendSection(WebInspector.UIString("Elements"));
    p.appendChild(this._createCheckboxSetting(WebInspector.UIString("Word wrap"), WebInspector.settings.domWordWrap));

    p = this._appendSection(WebInspector.UIString("Styles"));
    p.appendChild(this._createRadioSetting(WebInspector.UIString("Color format"), [
        [ WebInspector.StylesSidebarPane.ColorFormat.Original, WebInspector.UIString("As authored") ],
        [ WebInspector.StylesSidebarPane.ColorFormat.HEX, "HEX: #DAC0DE" ],
        [ WebInspector.StylesSidebarPane.ColorFormat.RGB, "RGB: rgb(128, 255, 255)" ],
        [ WebInspector.StylesSidebarPane.ColorFormat.HSL, "HSL: hsl(300, 80%, 90%)" ] ], WebInspector.settings.colorFormat));
    p.appendChild(this._createCheckboxSetting(WebInspector.UIString("Show user agent styles"), WebInspector.settings.showUserAgentStyles));

    if (Preferences.canDisableCache) {
        p = this._appendSection(WebInspector.UIString("Network"), true);
        p.appendChild(this._createCheckboxSetting(WebInspector.UIString("Disable cache"), WebInspector.settings.cacheDisabled));
    }

    p = this._appendSection(WebInspector.UIString("Scripts"), true);
    p.appendChild(this._createCheckboxSetting(WebInspector.UIString("Show script folders"), WebInspector.settings.showScriptFolders));

    p = this._appendSection(WebInspector.UIString("Console"), true);
    p.appendChild(this._createCheckboxSetting(WebInspector.UIString("Log XMLHttpRequests"), WebInspector.settings.monitoringXHREnabled));
    p.appendChild(this._createCheckboxSetting(WebInspector.UIString("Preserve log upon navigation"), WebInspector.settings.preserveConsoleLog));

    var table = document.createElement("table");
    table.className = "help-table";
    var tr = document.createElement("tr");
    tr.appendChild(this._leftColumnElement);
    tr.appendChild(this._rightColumnElement);
    table.appendChild(tr);
    this.contentElement.appendChild(table);
}

WebInspector.SettingsScreen.prototype = {
    _appendSection: function(name, right)
    {
        var p = document.createElement("p");
        p.className = "help-section";
        var title = document.createElement("div");
        title.className = "help-section-title";
        title.textContent = name;
        p.appendChild(title);
        this._columnElement(right).appendChild(p);
        return p;
    },

    _columnElement: function(right)
    {
        return right ? this._rightColumnElement : this._leftColumnElement;
    },

    _createCheckboxSetting: function(name, setting)
    {
        var input = document.createElement("input");
        input.type = "checkbox";
        input.name = name;
        input.checked = setting.get();
        function listener()
        {
            setting.set(input.checked);
        }
        input.addEventListener("click", listener, false);

        var p = document.createElement("p");
        var label = document.createElement("label");
        label.appendChild(input);
        label.appendChild(document.createTextNode(name));
        p.appendChild(label);
        return p;
    },

    _createRadioSetting: function(name, options, setting)
    {
        var pp = document.createElement("p");
        var fieldsetElement = document.createElement("fieldset");
        var legendElement = document.createElement("legend");
        legendElement.textContent = name;
        fieldsetElement.appendChild(legendElement);

        function clickListener(e)
        {
            setting.set(e.target.value);
        }

        var settingValue = setting.get();
        for (var i = 0; i < options.length; ++i) {
            var p = document.createElement("p");
            var label = document.createElement("label");
            p.appendChild(label);

            var input = document.createElement("input");
            input.type = "radio";
            input.name = setting.name;
            input.value = options[i][0];
            input.addEventListener("click", clickListener, false);
            if (settingValue == input.value)
                input.checked = true;

            label.appendChild(input);
            label.appendChild(document.createTextNode(options[i][1]));

            fieldsetElement.appendChild(p);
        }

        pp.appendChild(fieldsetElement);
        return pp;
    }
};

WebInspector.SettingsScreen.prototype.__proto__ = WebInspector.HelpScreen.prototype;
