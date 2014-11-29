/*
 * Copyright (C) 2014 Google Inc. All rights reserved.
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

WebInspector.SettingsUI = {}

/**
 * @param {string} name
 * @param {!WebInspector.Setting} setting
 * @param {boolean=} omitParagraphElement
 * @param {!Element=} inputElement
 * @param {string=} tooltip
 * @return {!Element}
 */
WebInspector.SettingsUI.createSettingCheckbox = function(name, setting, omitParagraphElement, inputElement, tooltip)
{
    var input = inputElement || createElement("input");
    input.type = "checkbox";
    input.name = name;
    WebInspector.SettingsUI.bindCheckbox(input, setting);

    var label = createElement("label");
    label.appendChild(input);
    label.createTextChild(name);
    if (tooltip)
        label.title = tooltip;

    if (omitParagraphElement)
        return label;

    var p = createElement("p");
    p.appendChild(label);
    return p;
}

/**
 * @param {!Element} input
 * @param {!WebInspector.Setting} setting
 */
WebInspector.SettingsUI.bindCheckbox = function(input, setting)
{
    function settingChanged()
    {
        if (input.checked !== setting.get())
            input.checked = setting.get();
    }
    setting.addChangeListener(settingChanged);
    settingChanged();

    function inputChanged()
    {
        if (setting.get() !== input.checked)
            setting.set(input.checked);
    }
    input.addEventListener("change", inputChanged, false);
}

/**
 * @param {string} label
 * @param {!WebInspector.Setting} setting
 * @param {boolean} numeric
 * @param {number=} maxLength
 * @param {string=} width
 * @param {function(string):?string=} validatorCallback
 * @param {boolean=} instant
 * @param {boolean=} clearForZero
 * @param {string=} placeholder
 * @return {!Element}
 */
WebInspector.SettingsUI.createSettingInputField = function(label, setting, numeric, maxLength, width, validatorCallback, instant, clearForZero, placeholder)
{
    var p = createElement("p");
    var labelElement = p.createChild("label");
    labelElement.textContent = label;
    var inputElement = p.createChild("input");
    inputElement.type = "text";
    if (numeric)
        inputElement.className = "numeric";
    if (maxLength)
        inputElement.maxLength = maxLength;
    if (width)
        inputElement.style.width = width;
    inputElement.placeholder = placeholder || "";

    if (validatorCallback || instant) {
        inputElement.addEventListener("change", onInput, false);
        inputElement.addEventListener("input", onInput, false);
    }
    inputElement.addEventListener("keydown", onKeyDown, false);

    var errorMessageLabel;
    if (validatorCallback)
        errorMessageLabel = p.createChild("div", "field-error-message");

    function onInput()
    {
        if (validatorCallback)
            validate();
        if (instant)
            apply();
    }

    function onKeyDown(event)
    {
        if (isEnterKey(event))
            apply();
        incrementForArrows(event);
    }

    function incrementForArrows(event)
    {
        if (!numeric)
            return;

        var increment = event.keyIdentifier === "Up" ? 1 : event.keyIdentifier === "Down" ? -1 : 0;
        if (!increment)
            return;
        if (event.shiftKey)
            increment *= 10;

        var value = inputElement.value;
        if (validatorCallback && validatorCallback(value))
            return;
        value = Number(value);
        if (clearForZero && !value)
            return;
        value += increment;
        if (clearForZero && !value)
            return;
        value = String(value);
        if (validatorCallback && validatorCallback(value))
            return;

        inputElement.value = value;
        apply();
        event.preventDefault();
    }

    function validate()
    {
        var error = validatorCallback(inputElement.value);
        if (!error)
            error = "";
        inputElement.classList.toggle("error-input", !!error);
        errorMessageLabel.textContent = error;
    }

    if (!instant)
        inputElement.addEventListener("blur", apply, false);

    function apply()
    {
        if (validatorCallback && validatorCallback(inputElement.value))
            return;
        setting.removeChangeListener(onSettingChange);
        setting.set(numeric ? Number(inputElement.value) : inputElement.value);
        setting.addChangeListener(onSettingChange);
    }

    setting.addChangeListener(onSettingChange);

    function onSettingChange()
    {
        var value = setting.get();
        if (clearForZero && !value)
            value = "";
        inputElement.value = value;
    }
    onSettingChange();

    if (validatorCallback)
      validate();

    return p;
}

/**
 * @param {string} name
 * @param {!Element} element
 * @return {!Element}
 */
WebInspector.SettingsUI.createCustomSetting = function(name, element)
{
    var p = createElement("p");
    var fieldsetElement = p.createChild("fieldset");
    fieldsetElement.createChild("label").textContent = name;
    fieldsetElement.appendChild(element);
    return p;
}

/**
 * @param {!WebInspector.Setting} setting
 * @return {!Element}
 */
WebInspector.SettingsUI.createSettingFieldset = function(setting)
{
    var fieldset = createElement("fieldset");
    fieldset.disabled = !setting.get();
    setting.addChangeListener(settingChanged);
    return fieldset;

    function settingChanged()
    {
        fieldset.disabled = !setting.get();
    }
}

/**
 * @param {string} text
 * @return {?string}
 */
WebInspector.SettingsUI.regexValidator = function(text)
{
    var regex;
    try {
        regex = new RegExp(text);
    } catch (e) {
    }
    return regex ? null : WebInspector.UIString("Invalid pattern");
}

/**
 * Creates an input element under the parentElement with the given id and defaultText.
 * @param {!Element} parentElement
 * @param {string} id
 * @param {string} defaultText
 * @param {function(*)} eventListener
 * @param {boolean=} numeric
 * @param {string=} size
 * @return {!Element} element
 */
WebInspector.SettingsUI.createInput = function(parentElement, id, defaultText, eventListener, numeric, size)
{
    var element = parentElement.createChild("input");
    element.id = id;
    element.type = "text";
    element.maxLength = 12;
    element.style.width = size || "80px";
    element.value = defaultText;
    element.align = "right";
    if (numeric)
        element.className = "numeric";
    element.addEventListener("input", eventListener, false);
    element.addEventListener("keydown", keyDownListener, false);
    function keyDownListener(event)
    {
        if (isEnterKey(event))
            eventListener(event);
    }
    return element;
}

/**
 * @constructor
 */
WebInspector.UISettingDelegate = function()
{
}

WebInspector.UISettingDelegate.prototype = {
    /**
     * @return {?Element}
     */
    settingElement: function()
    {
        return null;
    }
}
