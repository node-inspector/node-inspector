/*
 * Copyright (C) 2011 Google Inc.  All rights reserved.
 * Copyright (C) 2006, 2007, 2008 Apple Inc.  All rights reserved.
 * Copyright (C) 2007 Matt Lilek (pewtermoose@gmail.com).
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
 * @param {!Element} element
 * @param {?function(!MouseEvent): boolean} elementDragStart
 * @param {function(!MouseEvent)} elementDrag
 * @param {?function(!MouseEvent)} elementDragEnd
 * @param {string} cursor
 * @param {?string=} hoverCursor
 */
WebInspector.installDragHandle = function(element, elementDragStart, elementDrag, elementDragEnd, cursor, hoverCursor)
{
    element.addEventListener("mousedown", WebInspector.elementDragStart.bind(WebInspector, elementDragStart, elementDrag, elementDragEnd, cursor), false);
    if (hoverCursor !== null)
        element.style.cursor = hoverCursor || cursor;
}

/**
 * @param {?function(!MouseEvent):boolean} elementDragStart
 * @param {function(!MouseEvent)} elementDrag
 * @param {?function(!MouseEvent)} elementDragEnd
 * @param {string} cursor
 * @param {!Event} event
 */
WebInspector.elementDragStart = function(elementDragStart, elementDrag, elementDragEnd, cursor, event)
{
    // Only drag upon left button. Right will likely cause a context menu. So will ctrl-click on mac.
    if (event.button || (WebInspector.isMac() && event.ctrlKey))
        return;

    if (WebInspector._elementDraggingEventListener)
        return;

    if (elementDragStart && !elementDragStart(/** @type {!MouseEvent} */ (event)))
        return;

    if (WebInspector._elementDraggingGlassPane) {
        WebInspector._elementDraggingGlassPane.dispose();
        delete WebInspector._elementDraggingGlassPane;
    }

    var targetDocument = event.target.ownerDocument;

    WebInspector._elementDraggingEventListener = elementDrag;
    WebInspector._elementEndDraggingEventListener = elementDragEnd;
    WebInspector._mouseOutWhileDraggingTargetDocument = targetDocument;
    WebInspector._dragEventsTargetDocument = targetDocument;
    WebInspector._dragEventsTargetDocumentTop = targetDocument.defaultView.top.document;

    targetDocument.addEventListener("mousemove", WebInspector._elementDragMove, true);
    targetDocument.addEventListener("mouseup", WebInspector._elementDragEnd, true);
    targetDocument.addEventListener("mouseout", WebInspector._mouseOutWhileDragging, true);
    if (targetDocument !== WebInspector._dragEventsTargetDocumentTop)
        WebInspector._dragEventsTargetDocumentTop.addEventListener("mouseup", WebInspector._elementDragEnd, true);

    var targetElement = /** @type {!Element} */ (event.target);
    if (typeof cursor === "string") {
        WebInspector._restoreCursorAfterDrag = restoreCursor.bind(null, targetElement.style.cursor);
        targetElement.style.cursor = cursor;
        targetDocument.body.style.cursor = cursor;
    }
    function restoreCursor(oldCursor)
    {
        targetDocument.body.style.removeProperty("cursor");
        targetElement.style.cursor = oldCursor;
        WebInspector._restoreCursorAfterDrag = null;
    }
    event.preventDefault();
}

WebInspector._mouseOutWhileDragging = function()
{
    var document = WebInspector._mouseOutWhileDraggingTargetDocument;
    WebInspector._unregisterMouseOutWhileDragging();
    WebInspector._elementDraggingGlassPane = new WebInspector.GlassPane(document);
}

WebInspector._unregisterMouseOutWhileDragging = function()
{
    if (!WebInspector._mouseOutWhileDraggingTargetDocument)
        return;
    WebInspector._mouseOutWhileDraggingTargetDocument.removeEventListener("mouseout", WebInspector._mouseOutWhileDragging, true);
    delete WebInspector._mouseOutWhileDraggingTargetDocument;
}

WebInspector._unregisterDragEvents = function()
{
    if (!WebInspector._dragEventsTargetDocument)
        return;
    WebInspector._dragEventsTargetDocument.removeEventListener("mousemove", WebInspector._elementDragMove, true);
    WebInspector._dragEventsTargetDocument.removeEventListener("mouseup", WebInspector._elementDragEnd, true);
    if (WebInspector._dragEventsTargetDocument !== WebInspector._dragEventsTargetDocumentTop)
        WebInspector._dragEventsTargetDocumentTop.removeEventListener("mouseup", WebInspector._elementDragEnd, true);
    delete WebInspector._dragEventsTargetDocument;
    delete WebInspector._dragEventsTargetDocumentTop;
}

/**
 * @param {!Event} event
 */
WebInspector._elementDragMove = function(event)
{
    if (WebInspector._elementDraggingEventListener(/** @type {!MouseEvent} */ (event)))
        WebInspector._cancelDragEvents(event);
}

/**
 * @param {!Event} event
 */
WebInspector._cancelDragEvents = function(event)
{
    WebInspector._unregisterDragEvents();
    WebInspector._unregisterMouseOutWhileDragging();

    if (WebInspector._restoreCursorAfterDrag)
        WebInspector._restoreCursorAfterDrag();

    if (WebInspector._elementDraggingGlassPane)
        WebInspector._elementDraggingGlassPane.dispose();

    delete WebInspector._elementDraggingGlassPane;
    delete WebInspector._elementDraggingEventListener;
    delete WebInspector._elementEndDraggingEventListener;
}

/**
 * @param {!Event} event
 */
WebInspector._elementDragEnd = function(event)
{
    var elementDragEnd = WebInspector._elementEndDraggingEventListener;

    WebInspector._cancelDragEvents(/** @type {!MouseEvent} */ (event));

    event.preventDefault();
    if (elementDragEnd)
        elementDragEnd(/** @type {!MouseEvent} */ (event));
}

/**
 * @constructor
 * @param {!Document} document
 */
WebInspector.GlassPane = function(document)
{
    this.element = createElement("div");
    this.element.style.cssText = "position:absolute;top:0;bottom:0;left:0;right:0;background-color:transparent;z-index:1000;";
    this.element.id = "glass-pane";
    document.body.appendChild(this.element);
    WebInspector._glassPane = this;
}

WebInspector.GlassPane.prototype = {
    dispose: function()
    {
        delete WebInspector._glassPane;
        if (WebInspector.GlassPane.DefaultFocusedViewStack.length)
            WebInspector.GlassPane.DefaultFocusedViewStack.peekLast().focus();
        this.element.remove();
    }
}

/**
 * @type {!Array.<!WebInspector.View|!WebInspector.Dialog>}
 */
WebInspector.GlassPane.DefaultFocusedViewStack = [];

/**
 * @param {?Node=} node
 * @return {boolean}
 */
WebInspector.isBeingEdited = function(node)
{
    if (!node || node.nodeType !== Node.ELEMENT_NODE)
        return false;
    var element = /** {!Element} */ (node);
    if (element.classList.contains("text-prompt") || element.nodeName === "INPUT" || element.nodeName === "TEXTAREA")
        return true;

    if (!WebInspector.__editingCount)
        return false;

    while (element) {
        if (element.__editing)
            return true;
        element = element.parentElementOrShadowHost();
    }
    return false;
}

/**
 * @return {boolean}
 */
WebInspector.isEditing = function()
{
    if (WebInspector.__editingCount)
        return true;

    var element = WebInspector.currentFocusElement();
    if (!element)
        return false;
    return element.classList.contains("text-prompt") || element.nodeName === "INPUT" || element.nodeName === "TEXTAREA";
}

/**
 * @param {!Element} element
 * @param {boolean} value
 * @return {boolean}
 */
WebInspector.markBeingEdited = function(element, value)
{
    if (value) {
        if (element.__editing)
            return false;
        element.classList.add("being-edited");
        element.__editing = true;
        WebInspector.__editingCount = (WebInspector.__editingCount || 0) + 1;
    } else {
        if (!element.__editing)
            return false;
        element.classList.remove("being-edited");
        delete element.__editing;
        --WebInspector.__editingCount;
    }
    return true;
}

WebInspector.CSSNumberRegex = /^(-?(?:\d+(?:\.\d+)?|\.\d+))$/;

WebInspector.StyleValueDelimiters = " \xA0\t\n\"':;,/()";


/**
 * @param {!Event} event
 * @return {?string}
 */
WebInspector._valueModificationDirection = function(event)
{
    var direction = null;
    if (event.type === "mousewheel") {
        if (event.wheelDeltaY > 0)
            direction = "Up";
        else if (event.wheelDeltaY < 0)
            direction = "Down";
    } else {
        if (event.keyIdentifier === "Up" || event.keyIdentifier === "PageUp")
            direction = "Up";
        else if (event.keyIdentifier === "Down" || event.keyIdentifier === "PageDown")
            direction = "Down";
    }
    return direction;
}

/**
 * @param {string} hexString
 * @param {!Event} event
 */
WebInspector._modifiedHexValue = function(hexString, event)
{
    var direction = WebInspector._valueModificationDirection(event);
    if (!direction)
        return hexString;

    var number = parseInt(hexString, 16);
    if (isNaN(number) || !isFinite(number))
        return hexString;

    var maxValue = Math.pow(16, hexString.length) - 1;
    var arrowKeyOrMouseWheelEvent = (event.keyIdentifier === "Up" || event.keyIdentifier === "Down" || event.type === "mousewheel");
    var delta;

    if (arrowKeyOrMouseWheelEvent)
        delta = (direction === "Up") ? 1 : -1;
    else
        delta = (event.keyIdentifier === "PageUp") ? 16 : -16;

    if (event.shiftKey)
        delta *= 16;

    var result = number + delta;
    if (result < 0)
        result = 0; // Color hex values are never negative, so clamp to 0.
    else if (result > maxValue)
        return hexString;

    // Ensure the result length is the same as the original hex value.
    var resultString = result.toString(16).toUpperCase();
    for (var i = 0, lengthDelta = hexString.length - resultString.length; i < lengthDelta; ++i)
        resultString = "0" + resultString;
    return resultString;
}

/**
 * @param {number} number
 * @param {!Event} event
 */
WebInspector._modifiedFloatNumber = function(number, event)
{
    var direction = WebInspector._valueModificationDirection(event);
    if (!direction)
        return number;

    var arrowKeyOrMouseWheelEvent = (event.keyIdentifier === "Up" || event.keyIdentifier === "Down" || event.type === "mousewheel");

    // Jump by 10 when shift is down or jump by 0.1 when Alt/Option is down.
    // Also jump by 10 for page up and down, or by 100 if shift is held with a page key.
    var changeAmount = 1;
    if (event.shiftKey && !arrowKeyOrMouseWheelEvent)
        changeAmount = 100;
    else if (event.shiftKey || !arrowKeyOrMouseWheelEvent)
        changeAmount = 10;
    else if (event.altKey)
        changeAmount = 0.1;

    if (direction === "Down")
        changeAmount *= -1;

    // Make the new number and constrain it to a precision of 6, this matches numbers the engine returns.
    // Use the Number constructor to forget the fixed precision, so 1.100000 will print as 1.1.
    var result = Number((number + changeAmount).toFixed(6));
    if (!String(result).match(WebInspector.CSSNumberRegex))
        return null;

    return result;
}

/**
 * @param {!Event} event
 * @param {!Element} element
 * @param {function(string,string)=} finishHandler
 * @param {function(string)=} suggestionHandler
 * @param {function(string, number, string):string=} customNumberHandler
 * @return {boolean}
 */
WebInspector.handleElementValueModifications = function(event, element, finishHandler, suggestionHandler, customNumberHandler)
{
    /**
     * @return {?Range}
     * @suppressGlobalPropertiesCheck
     */
    function createRange()
    {
        return document.createRange();
    }

    var arrowKeyOrMouseWheelEvent = (event.keyIdentifier === "Up" || event.keyIdentifier === "Down" || event.type === "mousewheel");
    var pageKeyPressed = (event.keyIdentifier === "PageUp" || event.keyIdentifier === "PageDown");
    if (!arrowKeyOrMouseWheelEvent && !pageKeyPressed)
        return false;

    var selection = element.window().getSelection();
    if (!selection.rangeCount)
        return false;

    var selectionRange = selection.getRangeAt(0);
    if (!selectionRange.commonAncestorContainer.isSelfOrDescendant(element))
        return false;

    var originalValue = element.textContent;
    var wordRange = selectionRange.startContainer.rangeOfWord(selectionRange.startOffset, WebInspector.StyleValueDelimiters, element);
    var wordString = wordRange.toString();

    if (suggestionHandler && suggestionHandler(wordString))
        return false;

    var replacementString;
    var prefix, suffix, number;

    var matches;
    matches = /(.*#)([\da-fA-F]+)(.*)/.exec(wordString);
    if (matches && matches.length) {
        prefix = matches[1];
        suffix = matches[3];
        number = WebInspector._modifiedHexValue(matches[2], event);

        replacementString = customNumberHandler ? customNumberHandler(prefix, number, suffix) : prefix + number + suffix;
    } else {
        matches = /(.*?)(-?(?:\d+(?:\.\d+)?|\.\d+))(.*)/.exec(wordString);
        if (matches && matches.length) {
            prefix = matches[1];
            suffix = matches[3];
            number = WebInspector._modifiedFloatNumber(parseFloat(matches[2]), event);

            // Need to check for null explicitly.
            if (number === null)
                return false;

            replacementString = customNumberHandler ? customNumberHandler(prefix, number, suffix) : prefix + number + suffix;
        }
    }

    if (replacementString) {
        var replacementTextNode = createTextNode(replacementString);

        wordRange.deleteContents();
        wordRange.insertNode(replacementTextNode);

        var finalSelectionRange = createRange();
        finalSelectionRange.setStart(replacementTextNode, 0);
        finalSelectionRange.setEnd(replacementTextNode, replacementString.length);

        selection.removeAllRanges();
        selection.addRange(finalSelectionRange);

        event.handled = true;
        event.preventDefault();

        if (finishHandler)
            finishHandler(originalValue, replacementString);

        return true;
    }
    return false;
}

/**
 * @param {number} ms
 * @param {number=} precision
 * @return {string}
 */
Number.preciseMillisToString = function(ms, precision)
{
    precision = precision || 0;
    var format = "%." + precision + "f\u2009ms";
    return WebInspector.UIString(format, ms);
}

/** @type {!WebInspector.UIStringFormat} */
WebInspector._subMillisFormat = new WebInspector.UIStringFormat("%.3f\u2009ms");

/** @type {!WebInspector.UIStringFormat} */
WebInspector._millisFormat = new WebInspector.UIStringFormat("%.0f\u2009ms");

/** @type {!WebInspector.UIStringFormat} */
WebInspector._secondsFormat = new WebInspector.UIStringFormat("%.2f\u2009s");

/** @type {!WebInspector.UIStringFormat} */
WebInspector._minutesFormat = new WebInspector.UIStringFormat("%.1f\u2009min");

/** @type {!WebInspector.UIStringFormat} */
WebInspector._hoursFormat = new WebInspector.UIStringFormat("%.1f\u2009hrs");

/** @type {!WebInspector.UIStringFormat} */
WebInspector._daysFormat = new WebInspector.UIStringFormat("%.1f\u2009days");

/**
 * @param {number} ms
 * @param {boolean=} higherResolution
 * @return {string}
 */
Number.millisToString = function(ms, higherResolution)
{
    if (!isFinite(ms))
        return "-";

    if (ms === 0)
        return "0";

    if (higherResolution && ms < 1000)
        return WebInspector._subMillisFormat.format(ms);
    else if (ms < 1000)
        return WebInspector._millisFormat.format(ms);

    var seconds = ms / 1000;
    if (seconds < 60)
        return WebInspector._secondsFormat.format(seconds);

    var minutes = seconds / 60;
    if (minutes < 60)
        return WebInspector._minutesFormat.format(minutes);

    var hours = minutes / 60;
    if (hours < 24)
        return WebInspector._hoursFormat.format(hours);

    var days = hours / 24;
    return WebInspector._daysFormat.format(days);
}

/**
 * @param {number} seconds
 * @param {boolean=} higherResolution
 * @return {string}
 */
Number.secondsToString = function(seconds, higherResolution)
{
    if (!isFinite(seconds))
        return "-";
    return Number.millisToString(seconds * 1000, higherResolution);
}

/**
 * @param {number} bytes
 * @return {string}
 */
Number.bytesToString = function(bytes)
{
    if (bytes < 1024)
        return WebInspector.UIString("%.0f\u2009B", bytes);

    var kilobytes = bytes / 1024;
    if (kilobytes < 100)
        return WebInspector.UIString("%.1f\u2009KB", kilobytes);
    if (kilobytes < 1024)
        return WebInspector.UIString("%.0f\u2009KB", kilobytes);

    var megabytes = kilobytes / 1024;
    if (megabytes < 100)
        return WebInspector.UIString("%.1f\u2009MB", megabytes);
    else
        return WebInspector.UIString("%.0f\u2009MB", megabytes);
}

/**
 * @param {number} num
 * @return {string}
 */
Number.withThousandsSeparator = function(num)
{
    var str = num + "";
    var re = /(\d+)(\d{3})/;
    while (str.match(re))
        str = str.replace(re, "$1\u2009$2"); // \u2009 is a thin space.
    return str;
}

/**
 * @return {boolean}
 */
WebInspector.useLowerCaseMenuTitles = function()
{
    return WebInspector.platform() === "windows";
}

/**
 * @param {string} format
 * @param {?ArrayLike} substitutions
 * @param {!Object.<string, function(string, ...):*>} formatters
 * @param {string} initialValue
 * @param {function(string, string): ?} append
 * @return {!{formattedResult: string, unusedSubstitutions: ?ArrayLike}};
 */
WebInspector.formatLocalized = function(format, substitutions, formatters, initialValue, append)
{
    return String.format(WebInspector.UIString(format), substitutions, formatters, initialValue, append);
}

/**
 * @return {string}
 */
WebInspector.openLinkExternallyLabel = function()
{
    return WebInspector.UIString(WebInspector.useLowerCaseMenuTitles() ? "Open link in new tab" : "Open Link in New Tab");
}

/**
 * @return {string}
 */
WebInspector.copyLinkAddressLabel = function()
{
    return WebInspector.UIString(WebInspector.useLowerCaseMenuTitles() ? "Copy link address" : "Copy Link Address");
}

/**
 * @return {string}
 */
WebInspector.anotherProfilerActiveLabel = function()
{
    return WebInspector.UIString("Another profiler is already active");
}

/**
 * @param {string|undefined} description
 * @return {string}
 */
WebInspector.asyncStackTraceLabel = function(description)
{
    if (description)
        return description + " " + WebInspector.UIString("(async)");
    return WebInspector.UIString("Async Call");
}

/**
 * @return {string}
 */
WebInspector.manageBlackboxingButtonLabel = function()
{
    return WebInspector.UIString("Manage framework blackboxing...");
}

/**
 * @param {!Element} element
 * @return {boolean}
 */
WebInspector.installComponentRootStyles = function(element)
{
    var wasInstalled = element.classList.contains("component-root");
    if (wasInstalled)
        return false;
    element.classList.add("component-root", "platform-" + WebInspector.platform());
    return true;
}

/**
 * @param {!Element} element
 */
WebInspector.uninstallComponentRootStyles = function(element)
{
    var wasInstalled = element.classList.remove("component-root", "platform-" + WebInspector.platform());
}

/**
 * @param {!Document} document
 * @param {!Event} event
 */
WebInspector._windowFocused = function(document, event)
{
    if (event.target.document.nodeType === Node.DOCUMENT_NODE)
        document.body.classList.remove("inactive");
}

/**
 * @param {!Document} document
 * @param {!Event} event
 */
WebInspector._windowBlurred = function(document, event)
{
    if (event.target.document.nodeType === Node.DOCUMENT_NODE)
        document.body.classList.add("inactive");
}

/**
 * @return {!Element}
 */
WebInspector.previousFocusElement = function()
{
    return WebInspector._previousFocusElement;
}

/**
 * @return {!Element}
 */
WebInspector.currentFocusElement = function()
{
    return WebInspector._currentFocusElement;
}

/**
 * @param {!Document} document
 * @param {!Event} event
 */
WebInspector._focusChanged = function(document, event)
{
    var node = document.activeElement;
    while (node && node.shadowRoot)
        node = node.shadowRoot.activeElement;
    WebInspector.setCurrentFocusElement(node);
}

/**
 * @param {!Document} document
 * @param {!Event} event
 */
WebInspector._documentBlurred = function(document, event)
{
    // We want to know when currentFocusElement loses focus to nowhere.
    // This is the case when event.relatedTarget is null (no element is being focused)
    // and document.activeElement is reset to default (this is not a window blur).
    if (!event.relatedTarget && document.activeElement === document.body)
      WebInspector.setCurrentFocusElement(null);
}

WebInspector._textInputTypes = ["text", "search", "tel", "url", "email", "password"].keySet();
WebInspector._isTextEditingElement = function(element)
{
    if (element instanceof HTMLInputElement)
        return element.type in WebInspector._textInputTypes;

    if (element instanceof HTMLTextAreaElement)
        return true;

    return false;
}

/**
 * @param {?Node} x
 */
WebInspector.setCurrentFocusElement = function(x)
{
    if (WebInspector._glassPane && x && !WebInspector._glassPane.element.isAncestor(x))
        return;
    if (WebInspector._currentFocusElement !== x)
        WebInspector._previousFocusElement = WebInspector._currentFocusElement;
    WebInspector._currentFocusElement = x;

    if (WebInspector._currentFocusElement) {
        WebInspector._currentFocusElement.focus();

        // Make a caret selection inside the new element if there isn't a range selection and there isn't already a caret selection inside.
        // This is needed (at least) to remove caret from console when focus is moved to some element in the panel.
        // The code below should not be applied to text fields and text areas, hence _isTextEditingElement check.
        var selection = x.window().getSelection();
        if (!WebInspector._isTextEditingElement(WebInspector._currentFocusElement) && selection.isCollapsed && !WebInspector._currentFocusElement.isInsertionCaretInside()) {
            var selectionRange = WebInspector._currentFocusElement.ownerDocument.createRange();
            selectionRange.setStart(WebInspector._currentFocusElement, 0);
            selectionRange.setEnd(WebInspector._currentFocusElement, 0);

            selection.removeAllRanges();
            selection.addRange(selectionRange);
        }
    } else if (WebInspector._previousFocusElement)
        WebInspector._previousFocusElement.blur();
}

WebInspector.restoreFocusFromElement = function(element)
{
    if (element && element.isSelfOrAncestor(WebInspector.currentFocusElement()))
        WebInspector.setCurrentFocusElement(WebInspector.previousFocusElement());
}

/**
 * @param {!Document} document
 * @param {string} backgroundColor
 * @param {string} color
 */
WebInspector.setToolbarColors = function(document, backgroundColor, color)
{
    if (!WebInspector._themeStyleElement) {
        WebInspector._themeStyleElement = createElement("style");
        document.head.appendChild(WebInspector._themeStyleElement);
    }
    var parsedColor = WebInspector.Color.parse(color);
    var shadowColor = parsedColor ? parsedColor.invert().setAlpha(0.33).asString(WebInspector.Color.Format.RGBA) : "white";
    var prefix = WebInspector.isMac() ? "body:not(.undocked)" : "";
    WebInspector._themeStyleElement.textContent =
        String.sprintf(
            "%s .toolbar-colors {" +
            "    background-image: none !important;" +
            "    background-color: %s !important;" +
            "    color: %s !important;" +
            "}", prefix, backgroundColor, color) +
        String.sprintf(
             "%s .toolbar-colors button.status-bar-item .glyph, %s .toolbar-colors button.status-bar-item .long-click-glyph {" +
             "   background-color: %s;" +
             "}", prefix, prefix, color) +
        String.sprintf(
             "%s .toolbar-colors button.status-bar-item .glyph.shadow, %s .toolbar-colors button.status-bar-item .long-click-glyph.shadow {" +
             "   background-color: %s;" +
             "}", prefix, prefix, shadowColor);
}

WebInspector.resetToolbarColors = function()
{
    if (WebInspector._themeStyleElement)
        WebInspector._themeStyleElement.textContent = "";
}

/**
 * @param {!Element} element
 * @param {number} offset
 * @param {number} length
 * @param {!Array.<!Object>=} domChanges
 * @return {?Element}
 */
WebInspector.highlightSearchResult = function(element, offset, length, domChanges)
{
    var result = WebInspector.highlightSearchResults(element, [new WebInspector.SourceRange(offset, length)], domChanges);
    return result.length ? result[0] : null;
}

/**
 * @param {!Element} element
 * @param {!Array.<!WebInspector.SourceRange>} resultRanges
 * @param {!Array.<!Object>=} changes
 * @return {!Array.<!Element>}
 */
WebInspector.highlightSearchResults = function(element, resultRanges, changes)
{
    return WebInspector.highlightRangesWithStyleClass(element, resultRanges, "highlighted-search-result", changes);
}

/**
 * @param {!Element} element
 */
WebInspector.removeSearchResultsHighlight = function(element)
{
    var highlightBits = element.querySelectorAll(".highlighted-search-result");
    for (var i = 0; i < highlightBits.length; ++i) {
        var span = highlightBits[i];
        span.parentElement.replaceChild(createTextNode(span.textContent), span);
    }
}

/**
 * @param {!Element} element
 * @param {string} className
 */
WebInspector.runCSSAnimationOnce = function(element, className)
{
    function animationEndCallback()
    {
        element.classList.remove(className);
        element.removeEventListener("webkitAnimationEnd", animationEndCallback, false);
    }

    if (element.classList.contains(className))
        element.classList.remove(className);

    element.addEventListener("webkitAnimationEnd", animationEndCallback, false);
    element.classList.add(className);
}

/**
 * @param {!Element} element
 * @param {!Array.<!WebInspector.SourceRange>} resultRanges
 * @param {string} styleClass
 * @param {!Array.<!Object>=} changes
 * @return {!Array.<!Element>}
 */
WebInspector.highlightRangesWithStyleClass = function(element, resultRanges, styleClass, changes)
{
    changes = changes || [];
    var highlightNodes = [];
    var lineText = element.textContent;
    var ownerDocument = element.ownerDocument;
    var textNodeSnapshot = ownerDocument.evaluate(".//text()", element, null, XPathResult.ORDERED_NODE_SNAPSHOT_TYPE, null);

    var snapshotLength = textNodeSnapshot.snapshotLength;
    if (snapshotLength === 0)
        return highlightNodes;

    var nodeRanges = [];
    var rangeEndOffset = 0;
    for (var i = 0; i < snapshotLength; ++i) {
        var range = {};
        range.offset = rangeEndOffset;
        range.length = textNodeSnapshot.snapshotItem(i).textContent.length;
        rangeEndOffset = range.offset + range.length;
        nodeRanges.push(range);
    }

    var startIndex = 0;
    for (var i = 0; i < resultRanges.length; ++i) {
        var startOffset = resultRanges[i].offset;
        var endOffset = startOffset + resultRanges[i].length;

        while (startIndex < snapshotLength && nodeRanges[startIndex].offset + nodeRanges[startIndex].length <= startOffset)
            startIndex++;
        var endIndex = startIndex;
        while (endIndex < snapshotLength && nodeRanges[endIndex].offset + nodeRanges[endIndex].length < endOffset)
            endIndex++;
        if (endIndex === snapshotLength)
            break;

        var highlightNode = ownerDocument.createElement("span");
        highlightNode.className = styleClass;
        highlightNode.textContent = lineText.substring(startOffset, endOffset);

        var lastTextNode = textNodeSnapshot.snapshotItem(endIndex);
        var lastText = lastTextNode.textContent;
        lastTextNode.textContent = lastText.substring(endOffset - nodeRanges[endIndex].offset);
        changes.push({ node: lastTextNode, type: "changed", oldText: lastText, newText: lastTextNode.textContent });

        if (startIndex === endIndex) {
            lastTextNode.parentElement.insertBefore(highlightNode, lastTextNode);
            changes.push({ node: highlightNode, type: "added", nextSibling: lastTextNode, parent: lastTextNode.parentElement });
            highlightNodes.push(highlightNode);

            var prefixNode = ownerDocument.createTextNode(lastText.substring(0, startOffset - nodeRanges[startIndex].offset));
            lastTextNode.parentElement.insertBefore(prefixNode, highlightNode);
            changes.push({ node: prefixNode, type: "added", nextSibling: highlightNode, parent: lastTextNode.parentElement });
        } else {
            var firstTextNode = textNodeSnapshot.snapshotItem(startIndex);
            var firstText = firstTextNode.textContent;
            var anchorElement = firstTextNode.nextSibling;

            firstTextNode.parentElement.insertBefore(highlightNode, anchorElement);
            changes.push({ node: highlightNode, type: "added", nextSibling: anchorElement, parent: firstTextNode.parentElement });
            highlightNodes.push(highlightNode);

            firstTextNode.textContent = firstText.substring(0, startOffset - nodeRanges[startIndex].offset);
            changes.push({ node: firstTextNode, type: "changed", oldText: firstText, newText: firstTextNode.textContent });

            for (var j = startIndex + 1; j < endIndex; j++) {
                var textNode = textNodeSnapshot.snapshotItem(j);
                var text = textNode.textContent;
                textNode.textContent = "";
                changes.push({ node: textNode, type: "changed", oldText: text, newText: textNode.textContent });
            }
        }
        startIndex = endIndex;
        nodeRanges[startIndex].offset = endOffset;
        nodeRanges[startIndex].length = lastTextNode.textContent.length;

    }
    return highlightNodes;
}

WebInspector.applyDomChanges = function(domChanges)
{
    for (var i = 0, size = domChanges.length; i < size; ++i) {
        var entry = domChanges[i];
        switch (entry.type) {
        case "added":
            entry.parent.insertBefore(entry.node, entry.nextSibling);
            break;
        case "changed":
            entry.node.textContent = entry.newText;
            break;
        }
    }
}

WebInspector.revertDomChanges = function(domChanges)
{
    for (var i = domChanges.length - 1; i >= 0; --i) {
        var entry = domChanges[i];
        switch (entry.type) {
        case "added":
            entry.node.remove();
            break;
        case "changed":
            entry.node.textContent = entry.oldText;
            break;
        }
    }
}

/**
 * @param {!Element} element
 * @param {?Element=} containerElement
 * @return {!Size}
 */
WebInspector.measurePreferredSize = function(element, containerElement)
{
    containerElement = containerElement || element.ownerDocument.body;
    containerElement.appendChild(element);
    var fakingComponentRoot = WebInspector.installComponentRootStyles(element);
    element.positionAt(0, 0);
    var result = new Size(element.offsetWidth, element.offsetHeight);
    element.positionAt(undefined, undefined);
    element.remove();
    if (fakingComponentRoot)
        WebInspector.uninstallComponentRootStyles(element);
    return result;
}

/**
 * @constructor
 * @param {boolean} autoInvoke
 */
WebInspector.InvokeOnceHandlers = function(autoInvoke)
{
    this._handlers = null;
    this._autoInvoke = autoInvoke;
}

WebInspector.InvokeOnceHandlers.prototype = {
    /**
     * @param {!Object} object
     * @param {function()} method
     */
    add: function(object, method)
    {
        if (!this._handlers) {
            this._handlers = new Map();
            if (this._autoInvoke)
                this.scheduleInvoke();
        }
        var methods = this._handlers.get(object);
        if (!methods) {
            methods = new Set();
            this._handlers.set(object, methods);
        }
        methods.add(method);
    },

    /**
     * @suppressGlobalPropertiesCheck
     */
    scheduleInvoke: function()
    {
        if (this._handlers)
            requestAnimationFrame(this._invoke.bind(this));
    },

    _invoke: function()
    {
        var handlers = this._handlers;
        this._handlers = null;
        var keys = handlers.keysArray();
        for (var i = 0; i < keys.length; ++i) {
            var object = keys[i];
            var methods = handlers.get(object).valuesArray();
            for (var j = 0; j < methods.length; ++j)
                methods[j].call(object);
        }
    }
}

WebInspector._coalescingLevel = 0;
WebInspector._postUpdateHandlers = null;

WebInspector.startBatchUpdate = function()
{
    if (!WebInspector._coalescingLevel++)
        WebInspector._postUpdateHandlers = new WebInspector.InvokeOnceHandlers(false);
}

WebInspector.endBatchUpdate = function()
{
    if (--WebInspector._coalescingLevel)
        return;
    WebInspector._postUpdateHandlers.scheduleInvoke();
    WebInspector._postUpdateHandlers = null;
}

/**
 * @param {!Object} object
 * @param {function()} method
 */
WebInspector.invokeOnceAfterBatchUpdate = function(object, method)
{
    if (!WebInspector._postUpdateHandlers)
        WebInspector._postUpdateHandlers = new WebInspector.InvokeOnceHandlers(true);
    WebInspector._postUpdateHandlers.add(object, method);
}

/**
 * @param {!Window} window
 * @param {!Function} func
 * @param {!Array.<{from:number, to:number}>} params
 * @param {number} frames
 * @param {function()=} animationComplete
 * @return {function()}
 */
WebInspector.animateFunction = function(window, func, params, frames, animationComplete)
{
    var values = new Array(params.length);
    var deltas = new Array(params.length);
    for (var i = 0; i < params.length; ++i) {
        values[i] = params[i].from;
        deltas[i] = (params[i].to - params[i].from) / frames;
    }

    var raf = window.requestAnimationFrame(animationStep);

    var framesLeft = frames;

    function animationStep()
    {
        if (--framesLeft < 0) {
            if (animationComplete)
                animationComplete();
            return;
        }
        for (var i = 0; i < params.length; ++i) {
            if (params[i].to > params[i].from)
                values[i] = Number.constrain(values[i] + deltas[i], params[i].from, params[i].to);
            else
                values[i] = Number.constrain(values[i] + deltas[i], params[i].to, params[i].from);
        }
        func.apply(null, values);
        raf = window.requestAnimationFrame(animationStep);
    }

    function cancelAnimation()
    {
        window.cancelAnimationFrame(raf);
    }

    return cancelAnimation;
}

/**
 * @constructor
 * @extends {WebInspector.Object}
 * @param {!Element} element
 */
WebInspector.LongClickController = function(element)
{
    this._element = element;
}

/**
 * @enum {string}
 */
WebInspector.LongClickController.Events = {
    LongClick: "LongClick",
    LongPress: "LongPress"
};

WebInspector.LongClickController.prototype = {
    reset: function()
    {
        if (this._longClickInterval) {
            clearInterval(this._longClickInterval);
            delete this._longClickInterval;
        }
    },

    enable: function()
    {
        if (this._longClickData)
            return;
        var boundMouseDown = mouseDown.bind(this);
        var boundMouseUp = mouseUp.bind(this);
        var boundReset = this.reset.bind(this);

        this._element.addEventListener("mousedown", boundMouseDown, false);
        this._element.addEventListener("mouseout", boundReset, false);
        this._element.addEventListener("mouseup", boundMouseUp, false);
        this._element.addEventListener("click", boundReset, true);

        var longClicks = 0;

        this._longClickData = { mouseUp: boundMouseUp, mouseDown: boundMouseDown, reset: boundReset };

        /**
         * @param {!Event} e
         * @this {WebInspector.LongClickController}
         */
        function mouseDown(e)
        {
            if (e.which !== 1)
                return;
            longClicks = 0;
            this._longClickInterval = setInterval(longClicked.bind(this, e), 200);
        }

        /**
         * @param {!Event} e
         * @this {WebInspector.LongClickController}
         */
        function mouseUp(e)
        {
            if (e.which !== 1)
                return;
            this.reset();
        }

        /**
         * @param {!Event} e
         * @this {WebInspector.LongClickController}
         */
        function longClicked(e)
        {
            ++longClicks;
            this.dispatchEventToListeners(longClicks === 1 ? WebInspector.LongClickController.Events.LongClick : WebInspector.LongClickController.Events.LongPress, e);
        }
    },

    disable: function()
    {
        if (!this._longClickData)
            return;
        this._element.removeEventListener("mousedown", this._longClickData.mouseDown, false);
        this._element.removeEventListener("mouseout", this._longClickData.reset, false);
        this._element.removeEventListener("mouseup", this._longClickData.mouseUp, false);
        this._element.addEventListener("click", this._longClickData.reset, true);
        delete this._longClickData;
    },

    __proto__: WebInspector.Object.prototype
}

/**
 * @param {string} url
 * @param {string=} linkText
 * @param {string=} classes
 * @return {!Element}
 */
WebInspector.createExternalAnchor = function(url, linkText, classes)
{
    var anchor = createElementWithClass("a", "link");
    var href = sanitizeHref(url);

    if (href)
        anchor.href = href;
    anchor.title = url;

    if (!linkText)
        linkText = url;

    anchor.className = classes;
    anchor.textContent = linkText;
    anchor.setAttribute("target", "_blank");

    /**
     * @param {!Event} event
     */
    function clickHandler(event)
    {
        event.consume(true);
        InspectorFrontendHost.openInNewTab(anchor.href);
    }

    anchor.addEventListener("click", clickHandler, false);

    return anchor;
}

/**
 * @param {string} article
 * @param {string} title
 * @return {!Element}
 */
WebInspector.createDocumentationAnchor = function(article, title)
{
    return WebInspector.createExternalAnchor("https://developer.chrome.com/devtools/docs/" + article, title);
}

/**
 * @param {!Window} window
 */
WebInspector.initializeUIUtils = function(window)
{
    window.addEventListener("focus", WebInspector._windowFocused.bind(WebInspector, window.document), false);
    window.addEventListener("blur", WebInspector._windowBlurred.bind(WebInspector, window.document), false);
    window.document.addEventListener("focus", WebInspector._focusChanged.bind(WebInspector, window.document), true);
    window.document.addEventListener("blur", WebInspector._documentBlurred.bind(WebInspector, window.document), true);
}

/**
 * @param {string} name
 * @return {string}
 */
WebInspector.beautifyFunctionName = function(name)
{
    return name || WebInspector.UIString("(anonymous function)");
}
