/*
 * Copyright (C) 2011 Google Inc.  All rights reserved.
 * Copyright (C) 2007, 2008 Apple Inc.  All rights reserved.
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
 * @implements {WebInspector.ViewportElement}
 * @param {!WebInspector.ConsoleMessage} consoleMessage
 * @param {!WebInspector.Linkifier} linkifier
 * @param {number} nestingLevel
 */
WebInspector.ConsoleViewMessage = function(consoleMessage, linkifier, nestingLevel)
{
    this._message = consoleMessage;
    this._linkifier = linkifier;
    this._repeatCount = 1;
    this._closeGroupDecorationCount = 0;
    this._nestingLevel = nestingLevel;

    /** @type {!Array.<!WebInspector.DataGrid>} */
    this._dataGrids = [];
    /** @type {!Map.<!WebInspector.DataGrid, ?Element>} */
    this._dataGridParents = new Map();

    /** @type {!Object.<string, function(!WebInspector.RemoteObject, !Element, boolean=)>} */
    this._customFormatters = {
        "array": this._formatParameterAsArray,
        "error": this._formatParameterAsError,
        "function": this._formatParameterAsFunction,
        "generator": this._formatParameterAsObject,
        "iterator": this._formatParameterAsObject,
        "map": this._formatParameterAsObject,
        "node": this._formatParameterAsNode,
        "object": this._formatParameterAsObject,
        "set": this._formatParameterAsObject,
        "string": this._formatParameterAsString
    };
    this._previewFormatter = new WebInspector.RemoteObjectPreviewFormatter();
    this._searchRegex = null;
}

WebInspector.ConsoleViewMessage.prototype = {
    /**
     * @return {?WebInspector.Target}
     */
    _target: function()
    {
        return this.consoleMessage().target();
    },

    /**
     * @override
     * @return {!Element}
     */
    element: function()
    {
        return this.toMessageElement();
    },

    /**
     * @override
     */
    wasShown: function()
    {
        for (var i = 0; this._dataGrids && i < this._dataGrids.length; ++i) {
            var dataGrid = this._dataGrids[i];
            var parentElement = this._dataGridParents.get(dataGrid) || null;
            dataGrid.show(parentElement);
            dataGrid.updateWidths();
        }
    },

    /**
     * @override
     */
    cacheFastHeight: function()
    {
        this._cachedHeight = this.contentElement().offsetHeight;
    },

    /**
     * @override
     */
    willHide: function()
    {
        for (var i = 0; this._dataGrids && i < this._dataGrids.length; ++i) {
            var dataGrid = this._dataGrids[i];
            this._dataGridParents.set(dataGrid, dataGrid.element.parentElement);
            dataGrid.detach();
        }
    },

    /**
     * @return {number}
     */
    fastHeight: function()
    {
        if (this._cachedHeight)
            return this._cachedHeight;
        const defaultConsoleRowHeight = 18;  // Sync with consoleView.css
        if (this._message.type === WebInspector.ConsoleMessage.MessageType.Table) {
            var table = this._message.parameters[0];
            if (table && table.preview)
                return defaultConsoleRowHeight * table.preview.properties.length;
        }
        return defaultConsoleRowHeight;
    },

    /**
     * @return {!WebInspector.ConsoleMessage}
     */
    consoleMessage: function()
    {
        return this._message;
    },

    _formatMessage: function()
    {
        this._formattedMessage = createElement("span");
        this._formattedMessage.appendChild(WebInspector.Widget.createStyleElement("components/objectValue.css"));
        this._formattedMessage.className = "console-message-text source-code";

        /**
         * @param {string} title
         * @return {!Element}
         * @this {WebInspector.ConsoleMessage}
         */
        function linkifyRequest(title)
        {
            return WebInspector.Linkifier.linkifyUsingRevealer(/** @type {!WebInspector.NetworkRequest} */ (this.request), title, this.request.url);
        }

        var consoleMessage = this._message;
        if (!this._messageElement) {
            if (consoleMessage.source === WebInspector.ConsoleMessage.MessageSource.ConsoleAPI) {
                switch (consoleMessage.type) {
                    case WebInspector.ConsoleMessage.MessageType.Trace:
                        this._messageElement = this._format(consoleMessage.parameters || ["console.trace()"]);
                        break;
                    case WebInspector.ConsoleMessage.MessageType.Clear:
                        this._messageElement = createTextNode(WebInspector.UIString("Console was cleared"));
                        this._formattedMessage.classList.add("console-info");
                        break;
                    case WebInspector.ConsoleMessage.MessageType.Assert:
                        var args = [WebInspector.UIString("Assertion failed:")];
                        if (consoleMessage.parameters)
                            args = args.concat(consoleMessage.parameters);
                        this._messageElement = this._format(args);
                        break;
                    case WebInspector.ConsoleMessage.MessageType.Dir:
                        var obj = consoleMessage.parameters ? consoleMessage.parameters[0] : undefined;
                        var args = ["%O", obj];
                        this._messageElement = this._format(args);
                        break;
                    case WebInspector.ConsoleMessage.MessageType.Profile:
                    case WebInspector.ConsoleMessage.MessageType.ProfileEnd:
                        this._messageElement = this._format([consoleMessage.messageText]);
                        break;
                    default:
                        if (consoleMessage.parameters && consoleMessage.parameters.length === 1 && consoleMessage.parameters[0].type === "string")
                             this._messageElement = this._tryFormatAsError(/**@type {string} */(consoleMessage.parameters[0].value));

                        var args = consoleMessage.parameters || [consoleMessage.messageText];
                        this._messageElement = this._messageElement || this._format(args);
                }
            } else if (consoleMessage.source === WebInspector.ConsoleMessage.MessageSource.Network) {
                if (consoleMessage.request) {
                    this._messageElement = createElement("span");
                    if (consoleMessage.level === WebInspector.ConsoleMessage.MessageLevel.Error || consoleMessage.level === WebInspector.ConsoleMessage.MessageLevel.RevokedError) {
                        this._messageElement.createTextChildren(consoleMessage.request.requestMethod, " ");
                        this._messageElement.appendChild(WebInspector.Linkifier.linkifyUsingRevealer(consoleMessage.request, consoleMessage.request.url, consoleMessage.request.url));
                        if (consoleMessage.request.failed)
                            this._messageElement.createTextChildren(" ", consoleMessage.request.localizedFailDescription);
                        else
                            this._messageElement.createTextChildren(" ", String(consoleMessage.request.statusCode), " (", consoleMessage.request.statusText, ")");
                    } else {
                        var fragment = WebInspector.linkifyStringAsFragmentWithCustomLinkifier(consoleMessage.messageText, linkifyRequest.bind(consoleMessage));
                        this._messageElement.appendChild(fragment);
                    }
                } else {
                    var url = consoleMessage.url;
                    if (url) {
                        var isExternal = !WebInspector.resourceForURL(url) && !WebInspector.networkMapping.uiSourceCodeForURLForAnyTarget(url);
                        this._anchorElement = WebInspector.linkifyURLAsNode(url, url, "console-message-url", isExternal);
                    }
                    this._messageElement = this._format([consoleMessage.messageText]);
                }
            } else {
                var args = consoleMessage.parameters || [consoleMessage.messageText];
                this._messageElement = this._format(args);
            }
        }

        if (consoleMessage.source !== WebInspector.ConsoleMessage.MessageSource.Network || consoleMessage.request) {
            if (consoleMessage.scriptId) {
                this._anchorElement = this._linkifyScriptId(consoleMessage.scriptId, consoleMessage.url || "", consoleMessage.line, consoleMessage.column);
            } else {
                var showBlackboxed = (consoleMessage.source !== WebInspector.ConsoleMessage.MessageSource.ConsoleAPI);
                var debuggerModel = WebInspector.DebuggerModel.fromTarget(this._target());
                var callFrame = WebInspector.DebuggerPresentationUtils.callFrameAnchorFromStackTrace(debuggerModel, consoleMessage.stackTrace, consoleMessage.asyncStackTrace, showBlackboxed);
                if (callFrame && callFrame.scriptId)
                    this._anchorElement = this._linkifyCallFrame(callFrame);
                else if (consoleMessage.url && consoleMessage.url !== "undefined")
                    this._anchorElement = this._linkifyLocation(consoleMessage.url, consoleMessage.line, consoleMessage.column);
            }
        }

        this._formattedMessage.appendChild(this._messageElement);
        if (this._anchorElement) {
            // Append a space to prevent the anchor text from being glued to the console message when the user selects and copies the console messages.
            this._anchorElement.appendChild(createTextNode(" "));
            this._formattedMessage.insertBefore(this._anchorElement, this._formattedMessage.firstChild);
        }

        var dumpStackTrace = (!!consoleMessage.stackTrace || !!consoleMessage.asyncStackTrace) && (consoleMessage.source === WebInspector.ConsoleMessage.MessageSource.Network || consoleMessage.level === WebInspector.ConsoleMessage.MessageLevel.Error || consoleMessage.level === WebInspector.ConsoleMessage.MessageLevel.RevokedError || consoleMessage.type === WebInspector.ConsoleMessage.MessageType.Trace);
        if (dumpStackTrace) {
            var treeOutline = new TreeOutline();
            treeOutline.element.classList.add("outline-disclosure", "outline-disclosure-no-padding");
            var content = this._formattedMessage;
            var root = new TreeElement(content);
            root.toggleOnClick = true;
            root.selectable = false;
            content.treeElementForTest = root;
            treeOutline.appendChild(root);
            if (consoleMessage.type === WebInspector.ConsoleMessage.MessageType.Trace)
                root.expand();

            this._populateStackTraceTreeElement(root);
            this._formattedMessage = treeOutline.element;
        }
    },

    /**
     * @return {!Element}
     */
    formattedMessage: function()
    {
        if (!this._formattedMessage)
            this._formatMessage();
        return this._formattedMessage;
    },

    /**
     * @param {string} url
     * @param {number} lineNumber
     * @param {number} columnNumber
     * @return {?Element}
     */
    _linkifyLocation: function(url, lineNumber, columnNumber)
    {
        var target = this._target();
        if (!target)
            return null;
        // FIXME(62725): stack trace line/column numbers are one-based.
        lineNumber = lineNumber ? lineNumber - 1 : 0;
        columnNumber = columnNumber ? columnNumber - 1 : 0;
        return this._linkifier.linkifyScriptLocation(target, null, url, lineNumber, columnNumber, "console-message-url");
    },

    /**
     * @param {!ConsoleAgent.CallFrame} callFrame
     * @return {?Element}
     */
    _linkifyCallFrame: function(callFrame)
    {
        var target = this._target();
        return this._linkifier.linkifyConsoleCallFrame(target, callFrame, "console-message-url");
    },

    /**
     * @param {string} scriptId
     * @param {string} url
     * @param {number} lineNumber
     * @param {number} columnNumber
     * @return {?Element}
     */
    _linkifyScriptId: function(scriptId, url, lineNumber, columnNumber)
    {
        var target = this._target();
        if (!target)
            return null;
        // FIXME(62725): stack trace line/column numbers are one-based.
        lineNumber = lineNumber ? lineNumber - 1 : 0;
        columnNumber = columnNumber ? columnNumber - 1 : 0;
        return this._linkifier.linkifyScriptLocation(target, scriptId, url, lineNumber, columnNumber, "console-message-url");
    },

    _format: function(parameters)
    {
        // This node is used like a Builder. Values are continually appended onto it.
        var formattedResult = createElement("span");
        if (!parameters.length)
            return formattedResult;

        var target = this._target();

        // Formatting code below assumes that parameters are all wrappers whereas frontend console
        // API allows passing arbitrary values as messages (strings, numbers, etc.). Wrap them here.
        for (var i = 0; i < parameters.length; ++i) {
            // FIXME: Only pass runtime wrappers here.
            if (parameters[i] instanceof WebInspector.RemoteObject)
                continue;

            if (!target) {
                parameters[i] = WebInspector.RemoteObject.fromLocalObject(parameters[i]);
                continue;
            }

            if (typeof parameters[i] === "object")
                parameters[i] = target.runtimeModel.createRemoteObject(parameters[i]);
            else
                parameters[i] = target.runtimeModel.createRemoteObjectFromPrimitiveValue(parameters[i]);
        }

        // There can be string log and string eval result. We distinguish between them based on message type.
        var shouldFormatMessage = WebInspector.RemoteObject.type(parameters[0]) === "string" && (this._message.type !== WebInspector.ConsoleMessage.MessageType.Result || this._message.level === WebInspector.ConsoleMessage.MessageLevel.Error || this._message.level === WebInspector.ConsoleMessage.MessageLevel.RevokedError);

        // Multiple parameters with the first being a format string. Save unused substitutions.
        if (shouldFormatMessage) {
            // Multiple parameters with the first being a format string. Save unused substitutions.
            var result = this._formatWithSubstitutionString(parameters[0].description, parameters.slice(1), formattedResult);
            parameters = result.unusedSubstitutions;
            if (parameters.length)
                formattedResult.createTextChild(" ");
        }

        if (this._message.type === WebInspector.ConsoleMessage.MessageType.Table) {
            formattedResult.appendChild(this._formatParameterAsTable(parameters));
            return formattedResult;
        }

        // Single parameter, or unused substitutions from above.
        for (var i = 0; i < parameters.length; ++i) {
            // Inline strings when formatting.
            if (shouldFormatMessage && parameters[i].type === "string")
                formattedResult.appendChild(WebInspector.linkifyStringAsFragment(parameters[i].description));
            else
                formattedResult.appendChild(this._formatParameter(parameters[i], false, true));
            if (i < parameters.length - 1)
                formattedResult.createTextChild(" ");
        }
        return formattedResult;
    },

    /**
     * @param {!WebInspector.RemoteObject} output
     * @param {boolean=} forceObjectFormat
     * @param {boolean=} includePreview
     * @return {!Element}
     */
    _formatParameter: function(output, forceObjectFormat, includePreview)
    {
        if (output.customPreview()) {
            return (new WebInspector.CustomPreviewComponent(output)).element;
        }

        var type = forceObjectFormat ? "object" : (output.subtype || output.type);
        var formatter = this._customFormatters[type] || this._formatParameterAsValue;
        var span = createElement("span");
        span.className = "object-value-" + type + " source-code";
        formatter.call(this, output, span, includePreview);
        return span;
    },

    /**
     * @param {!WebInspector.RemoteObject} obj
     * @param {!Element} elem
     */
    _formatParameterAsValue: function(obj, elem)
    {
        elem.createTextChild(obj.description || "");
        if (obj.objectId)
            elem.addEventListener("contextmenu", this._contextMenuEventFired.bind(this, obj), false);
    },

    /**
     * @param {!WebInspector.RemoteObject} obj
     * @param {!Element} elem
     * @param {boolean=} includePreview
     */
    _formatParameterAsObject: function(obj, elem, includePreview)
    {
        this._formatParameterAsArrayOrObject(obj, elem, includePreview);
    },

    /**
     * @param {!WebInspector.RemoteObject} obj
     * @param {!Element} elem
     * @param {boolean=} includePreview
     */
    _formatParameterAsArrayOrObject: function(obj, elem, includePreview)
    {
        var titleElement = createElement("span");
        if (includePreview && obj.preview) {
            titleElement.classList.add("console-object-preview");
            var lossless = this._previewFormatter.appendObjectPreview(titleElement, obj.preview);
            if (lossless) {
                elem.appendChild(titleElement);
                titleElement.addEventListener("contextmenu", this._contextMenuEventFired.bind(this, obj), false);
                return;
            }
        } else {
            if (obj.type === "function") {
                WebInspector.ObjectPropertiesSection.formatObjectAsFunction(obj, titleElement, false);
                titleElement.classList.add("object-value-function");
            } else {
                titleElement.createTextChild(obj.description || "");
            }
        }
        var note = titleElement.createChild("span", "object-info-state-note");
        note.title = WebInspector.UIString("Object value at left was snapshotted when logged, value below was evaluated just now.");
        var section = new WebInspector.ObjectPropertiesSection(obj, titleElement);
        section.enableContextMenu();
        elem.appendChild(section.element);
        section.element.classList.add("console-view-object-properties-section");
    },

    /**
     * @param {!WebInspector.RemoteObject} func
     * @param {!Element} element
     * @param {boolean=} includePreview
     */
    _formatParameterAsFunction: function(func, element, includePreview)
    {
        WebInspector.ObjectPropertiesSection.formatObjectAsFunction(func, element, true, includePreview);
        element.addEventListener("contextmenu", this._contextMenuEventFired.bind(this, func), false);
    },

    /**
     * @param {!WebInspector.RemoteObject} obj
     * @param {!Event} event
     */
    _contextMenuEventFired: function(obj, event)
    {
        var contextMenu = new WebInspector.ContextMenu(event);
        contextMenu.appendApplicableItems(obj);
        contextMenu.show();
    },

    /**
     * @param {?WebInspector.RemoteObject} object
     * @param {!Array.<!RuntimeAgent.PropertyPreview>} propertyPath
     * @return {!Element}
     */
    _renderPropertyPreviewOrAccessor: function(object, propertyPath)
    {
        var property = propertyPath.peekLast();
        if (property.type === "accessor")
            return this._formatAsAccessorProperty(object, propertyPath.select("name"), false);
        return this._previewFormatter.renderPropertyPreview(property.type, /** @type {string} */ (property.subtype), property.value);
    },

    /**
     * @param {!WebInspector.RemoteObject} object
     * @param {!Element} elem
     */
    _formatParameterAsNode: function(object, elem)
    {
        WebInspector.Renderer.renderPromise(object).then(appendRenderer, failedToRender.bind(this));
        /**
         * @param {!Element} rendererElement
         */
        function appendRenderer(rendererElement)
        {
            elem.appendChild(rendererElement);
        }

        /**
         * @this {WebInspector.ConsoleViewMessage}
         */
        function failedToRender()
        {
            this._formatParameterAsObject(object, elem, false);
        }
    },

    /**
     * @param {!WebInspector.RemoteObject} array
     * @return {boolean}
     */
    useArrayPreviewInFormatter: function(array)
    {
        return this._message.type !== WebInspector.ConsoleMessage.MessageType.DirXML;
    },

    /**
     * @param {!WebInspector.RemoteObject} array
     * @param {!Element} elem
     */
    _formatParameterAsArray: function(array, elem)
    {
        var maxFlatArrayLength = 100;
        if (this.useArrayPreviewInFormatter(array) || array.arrayLength() > maxFlatArrayLength)
            this._formatParameterAsArrayOrObject(array, elem, this.useArrayPreviewInFormatter(array) || array.arrayLength() <= maxFlatArrayLength);
        else
            array.getAllProperties(false, this._printArray.bind(this, array, elem));
    },

    /**
     * @param {!Array.<!WebInspector.RemoteObject>} parameters
     * @return {!Element}
     */
    _formatParameterAsTable: function(parameters)
    {
        var element = createElementWithClass("div", "console-message-formatted-table");
        var table = parameters[0];
        if (!table || !table.preview)
            return element;

        var columnNames = [];
        var preview = table.preview;
        var rows = [];
        for (var i = 0; i < preview.properties.length; ++i) {
            var rowProperty = preview.properties[i];
            var rowPreview = rowProperty.valuePreview;
            if (!rowPreview)
                continue;

            var rowValue = {};
            const maxColumnsToRender = 20;
            for (var j = 0; j < rowPreview.properties.length; ++j) {
                var cellProperty = rowPreview.properties[j];
                var columnRendered = columnNames.indexOf(cellProperty.name) != -1;
                if (!columnRendered) {
                    if (columnNames.length === maxColumnsToRender)
                        continue;
                    columnRendered = true;
                    columnNames.push(cellProperty.name);
                }

                if (columnRendered) {
                    var cellElement = this._renderPropertyPreviewOrAccessor(table, [rowProperty, cellProperty]);
                    cellElement.classList.add("console-message-nowrap-below");
                    rowValue[cellProperty.name] = cellElement;
                }
            }
            rows.push([rowProperty.name, rowValue]);
        }

        var flatValues = [];
        for (var i = 0; i < rows.length; ++i) {
            var rowName = rows[i][0];
            var rowValue = rows[i][1];
            flatValues.push(rowName);
            for (var j = 0; j < columnNames.length; ++j)
                flatValues.push(rowValue[columnNames[j]]);
        }

        var dataGridContainer = element.createChild("span");
        if (!preview.lossless || !flatValues.length) {
            element.appendChild(this._formatParameter(table, true, false));
            if (!flatValues.length)
                return element;
        }

        columnNames.unshift(WebInspector.UIString("(index)"));
        var dataGrid = WebInspector.SortableDataGrid.create(columnNames, flatValues);
        dataGrid.renderInline();
        this._dataGrids.push(dataGrid);
        this._dataGridParents.set(dataGrid, dataGridContainer);
        return element;
    },

    /**
     * @param {!WebInspector.RemoteObject} output
     * @param {!Element} elem
     */
    _formatParameterAsString: function(output, elem)
    {
        var span = createElement("span");
        span.className = "object-value-string source-code";
        span.appendChild(WebInspector.linkifyStringAsFragment(output.description || ""));

        // Make black quotes.
        elem.classList.remove("object-value-string");
        elem.createTextChild("\"");
        elem.appendChild(span);
        elem.createTextChild("\"");
    },

    /**
     * @param {!WebInspector.RemoteObject} output
     * @param {!Element} elem
     */
    _formatParameterAsError: function(output, elem)
    {
        var span = elem.createChild("span", "object-value-error source-code");
        var text = output.description || "";
        var lines = text.split("\n", 2);
        span.appendChild(WebInspector.linkifyStringAsFragment(lines[0]));
        if (lines.length > 1) {
            var detailedLink = elem.createChild("a");
            detailedLink.textContent = "(\u2026)";
            function showDetailed(event)
            {
                span.removeChildren();
                detailedLink.remove();
                span.appendChild(WebInspector.linkifyStringAsFragment(text));
                event.consume(true);
            }
            detailedLink._showDetailedForTest = showDetailed.bind(null, new MouseEvent('click'));
            detailedLink.addEventListener("click", showDetailed, false);
        }
    },

    /**
     * @param {!WebInspector.RemoteObject} array
     * @param {!Element} elem
     * @param {?Array.<!WebInspector.RemoteObjectProperty>} properties
     */
    _printArray: function(array, elem, properties)
    {
        if (!properties) {
            this._formatParameterAsObject(array, elem, false);
            return;
        }

        var elements = [];
        for (var i = 0; i < properties.length; ++i) {
            var property = properties[i];
            var name = property.name;
            if (isNaN(name))
                continue;
            if (property.getter)
                elements[name] = this._formatAsAccessorProperty(array, [name], true);
            else if (property.value)
                elements[name] = this._formatAsArrayEntry(property.value);
        }

        elem.createTextChild("[");
        var lastNonEmptyIndex = -1;

        function appendUndefined(elem, index)
        {
            if (index - lastNonEmptyIndex <= 1)
                return;
            var span = elem.createChild("span", "object-value-undefined");
            span.textContent = WebInspector.UIString("undefined × %d", index - lastNonEmptyIndex - 1);
        }

        var length = array.arrayLength();
        for (var i = 0; i < length; ++i) {
            var element = elements[i];
            if (!element)
                continue;

            if (i - lastNonEmptyIndex > 1) {
                appendUndefined(elem, i);
                elem.createTextChild(", ");
            }

            elem.appendChild(element);
            lastNonEmptyIndex = i;
            if (i < length - 1)
                elem.createTextChild(", ");
        }
        appendUndefined(elem, length);

        elem.createTextChild("]");
        elem.addEventListener("contextmenu", this._contextMenuEventFired.bind(this, array), false);
    },

    /**
     * @param {!WebInspector.RemoteObject} output
     * @return {!Element}
     */
    _formatAsArrayEntry: function(output)
    {
        // Prevent infinite expansion of cross-referencing arrays.
        return this._formatParameter(output, output.subtype === "array", false);
    },

    /**
     * @param {?WebInspector.RemoteObject} object
     * @param {!Array.<string>} propertyPath
     * @param {boolean} isArrayEntry
     * @return {!Element}
     */
    _formatAsAccessorProperty: function(object, propertyPath, isArrayEntry)
    {
        var rootElement = WebInspector.ObjectPropertyTreeElement.createRemoteObjectAccessorPropertySpan(object, propertyPath, onInvokeGetterClick.bind(this));

        /**
         * @param {?WebInspector.RemoteObject} result
         * @param {boolean=} wasThrown
         * @this {WebInspector.ConsoleViewMessage}
         */
        function onInvokeGetterClick(result, wasThrown)
        {
            if (!result)
                return;
            rootElement.removeChildren();
            if (wasThrown) {
                var element = rootElement.createChild("span", "error-message");
                element.textContent = WebInspector.UIString("<exception>");
                element.title = /** @type {string} */ (result.description);
            } else if (isArrayEntry) {
                rootElement.appendChild(this._formatAsArrayEntry(result));
            } else {
                // Make a PropertyPreview from the RemoteObject similar to the backend logic.
                const maxLength = 100;
                var type = result.type;
                var subtype = result.subtype;
                var description = "";
                if (type !== "function" && result.description) {
                    if (type === "string" || subtype === "regexp")
                        description = result.description.trimMiddle(maxLength);
                    else
                        description = result.description.trimEnd(maxLength);
                }
                rootElement.appendChild(this._previewFormatter.renderPropertyPreview(type, subtype, description));
            }
        }

        return rootElement;
    },

    /**
     * @param {string} format
     * @param {!Array.<string>} parameters
     * @param {!Element} formattedResult
     */
    _formatWithSubstitutionString: function(format, parameters, formattedResult)
    {
        var formatters = {};

        /**
         * @param {boolean} force
         * @param {!WebInspector.RemoteObject} obj
         * @return {!Element}
         * @this {WebInspector.ConsoleViewMessage}
         */
        function parameterFormatter(force, obj)
        {
            return this._formatParameter(obj, force, false);
        }

        function stringFormatter(obj)
        {
            return obj.description;
        }

        function floatFormatter(obj)
        {
            if (typeof obj.value !== "number")
                return "NaN";
            return obj.value;
        }

        function integerFormatter(obj)
        {
            if (typeof obj.value !== "number")
                return "NaN";
            return Math.floor(obj.value);
        }

        function bypassFormatter(obj)
        {
            return (obj instanceof Node) ? obj : "";
        }

        var currentStyle = null;
        function styleFormatter(obj)
        {
            currentStyle = {};
            var buffer = createElement("span");
            buffer.setAttribute("style", obj.description);
            for (var i = 0; i < buffer.style.length; i++) {
                var property = buffer.style[i];
                var value = buffer.style.getPropertyValue(property);
                if (!value.startsWith("url(") && isWhitelistedProperty(property))
                    currentStyle[property] = buffer.style[property];
            }
        }

        function isWhitelistedProperty(property)
        {
            var prefixes = ["background", "border", "color", "font", "line", "margin", "padding", "text", "-webkit-background", "-webkit-border", "-webkit-font", "-webkit-margin", "-webkit-padding", "-webkit-text"];
            for (var i = 0; i < prefixes.length; i++) {
                if (property.startsWith(prefixes[i]))
                    return true;
            }
            return false;
        }

        // Firebug uses %o for formatting objects.
        formatters.o = parameterFormatter.bind(this, false);
        formatters.s = stringFormatter;
        formatters.f = floatFormatter;
        // Firebug allows both %i and %d for formatting integers.
        formatters.i = integerFormatter;
        formatters.d = integerFormatter;

        // Firebug uses %c for styling the message.
        formatters.c = styleFormatter;

        // Support %O to force object formatting, instead of the type-based %o formatting.
        formatters.O = parameterFormatter.bind(this, true);

        formatters._ = bypassFormatter;

        function append(a, b)
        {
            if (b instanceof Node)
                a.appendChild(b);
            else if (typeof b !== "undefined") {
                var toAppend = WebInspector.linkifyStringAsFragment(String(b));
                if (currentStyle) {
                    var wrapper = createElement('span');
                    wrapper.appendChild(toAppend);
                    applyCurrentStyle(wrapper);
                    for (var i = 0; i < wrapper.children.length; ++i)
                        applyCurrentStyle(wrapper.children[i]);
                    toAppend = wrapper;
                }
                a.appendChild(toAppend);
            }
            return a;
        }

        /**
         * @param {!Element} element
         */
        function applyCurrentStyle(element)
        {
            for (var key in currentStyle)
                element.style[key] = currentStyle[key];
        }

        // String.format does treat formattedResult like a Builder, result is an object.
        return String.format(format, parameters, formatters, formattedResult, append);
    },

    /**
     * @return {boolean}
     */
    matchesFilterRegex: function(regexObject)
    {
        regexObject.lastIndex = 0;
        var text = this.searchableElement().deepTextContent();
        if (this._anchorElement)
            text += " " + this._anchorElement.textContent;
        return regexObject.test(text);
    },

    /**
     * @param {boolean} show
     */
    updateTimestamp: function(show)
    {
        if (!this._formattedMessage)
            return;

        if (show && !this.timestampElement) {
            this.timestampElement = createElementWithClass("span", "console-timestamp");
            this.timestampElement.textContent = (new Date(this._message.timestamp)).toConsoleTime() + " ";
            var afterRepeatCountChild = this._repeatCountElement && this._repeatCountElement.nextSibling;
            this._formattedMessage.insertBefore(this.timestampElement, this._formattedMessage.firstChild);
            return;
        }

        if (!show && this.timestampElement) {
            this.timestampElement.remove();
            delete this.timestampElement;
        }
    },

    /**
     * @return {number}
     */
    nestingLevel: function()
    {
        return this._nestingLevel;
    },

    resetCloseGroupDecorationCount: function()
    {
        if (!this._closeGroupDecorationCount)
            return;
        this._closeGroupDecorationCount = 0;
        this._updateCloseGroupDecorations();
    },

    incrementCloseGroupDecorationCount: function()
    {
        ++this._closeGroupDecorationCount;
        this._updateCloseGroupDecorations();
    },

    _updateCloseGroupDecorations: function()
    {
        if (!this._nestingLevelMarkers)
            return;
        for (var i = 0, n = this._nestingLevelMarkers.length; i < n; ++i) {
            var marker = this._nestingLevelMarkers[i];
            marker.classList.toggle("group-closed", n - i <= this._closeGroupDecorationCount);
        }
    },

    /**
     * @return {!Element}
     */
    contentElement: function()
    {
        if (this._element)
            return this._element;

        var element = createElementWithClass("div", "console-message");
        this._element = element;

        if (this._message.type === WebInspector.ConsoleMessage.MessageType.StartGroup || this._message.type === WebInspector.ConsoleMessage.MessageType.StartGroupCollapsed)
            element.classList.add("console-group-title");

        element.appendChild(this.formattedMessage());

        if (this._repeatCount > 1)
            this._showRepeatCountElement();

        this.updateTimestamp(WebInspector.moduleSetting("consoleTimestampsEnabled").get());

        return this._element;
    },

    /**
     * @return {!Element}
     */
    toMessageElement: function()
    {
        if (this._wrapperElement)
            return this._wrapperElement;

        this._wrapperElement = createElement("div");
        this.updateMessageElement();
        return this._wrapperElement;
    },

    updateMessageElement: function()
    {
        if (!this._wrapperElement)
            return;

        this._wrapperElement.className = "console-message-wrapper";
        this._wrapperElement.removeChildren();

        this._nestingLevelMarkers = [];
        for (var i = 0; i < this._nestingLevel; ++i)
            this._nestingLevelMarkers.push(this._wrapperElement.createChild("div", "nesting-level-marker"));
        this._updateCloseGroupDecorations();
        this._wrapperElement.message = this;

        switch (this._message.level) {
        case WebInspector.ConsoleMessage.MessageLevel.Log:
            this._wrapperElement.classList.add("console-log-level");
            break;
        case WebInspector.ConsoleMessage.MessageLevel.Debug:
            this._wrapperElement.classList.add("console-debug-level");
            break;
        case WebInspector.ConsoleMessage.MessageLevel.Warning:
            this._wrapperElement.classList.add("console-warning-level");
            break;
        case WebInspector.ConsoleMessage.MessageLevel.Error:
            this._wrapperElement.classList.add("console-error-level");
            break;
        case WebInspector.ConsoleMessage.MessageLevel.RevokedError:
            this._wrapperElement.classList.add("console-revokedError-level");
            break;
        case WebInspector.ConsoleMessage.MessageLevel.Info:
            this._wrapperElement.classList.add("console-info-level");
            break;
        }

        this._wrapperElement.appendChild(this.contentElement());
    },

    /**
     * @param {!TreeElement} parentTreeElement
     */
    _populateStackTraceTreeElement: function(parentTreeElement)
    {
        var target = this._target();
        if (!target)
            return;
        var content = WebInspector.DOMPresentationUtils.buildStackTracePreviewContents(target,
            this._linkifier, this._message.stackTrace, this._message.asyncStackTrace);
        var treeElement = new TreeElement(content);
        treeElement.selectable = false;
        parentTreeElement.appendChild(treeElement);
    },

    resetIncrementRepeatCount: function()
    {
        this._repeatCount = 1;
        if (!this._repeatCountElement)
            return;

        this._repeatCountElement.remove();
        delete this._repeatCountElement;
    },

    incrementRepeatCount: function()
    {
        this._repeatCount++;
        this._showRepeatCountElement();
    },

    _showRepeatCountElement: function()
    {
        if (!this._element)
            return;

        if (!this._repeatCountElement) {
            this._repeatCountElement = createElement("span");
            this._repeatCountElement.className = "bubble-repeat-count";

            this._element.insertBefore(this._repeatCountElement, this._element.firstChild);
            this._element.classList.add("repeated-message");
        }
        this._repeatCountElement.textContent = this._repeatCount;
    },

    /**
     * @override
     * @return {string}
     */
    toString: function()
    {
        var sourceString;
        switch (this._message.source) {
            case WebInspector.ConsoleMessage.MessageSource.XML:
                sourceString = "XML";
                break;
            case WebInspector.ConsoleMessage.MessageSource.JS:
                sourceString = "JavaScript";
                break;
            case WebInspector.ConsoleMessage.MessageSource.Network:
                sourceString = "Network";
                break;
            case WebInspector.ConsoleMessage.MessageSource.ConsoleAPI:
                sourceString = "ConsoleAPI";
                break;
            case WebInspector.ConsoleMessage.MessageSource.Storage:
                sourceString = "Storage";
                break;
            case WebInspector.ConsoleMessage.MessageSource.AppCache:
                sourceString = "AppCache";
                break;
            case WebInspector.ConsoleMessage.MessageSource.Rendering:
                sourceString = "Rendering";
                break;
            case WebInspector.ConsoleMessage.MessageSource.CSS:
                sourceString = "CSS";
                break;
            case WebInspector.ConsoleMessage.MessageSource.Security:
                sourceString = "Security";
                break;
            case WebInspector.ConsoleMessage.MessageSource.Other:
                sourceString = "Other";
                break;
        }

        var typeString;
        switch (this._message.type) {
            case WebInspector.ConsoleMessage.MessageType.Log:
                typeString = "Log";
                break;
            case WebInspector.ConsoleMessage.MessageType.Dir:
                typeString = "Dir";
                break;
            case WebInspector.ConsoleMessage.MessageType.DirXML:
                typeString = "Dir XML";
                break;
            case WebInspector.ConsoleMessage.MessageType.Trace:
                typeString = "Trace";
                break;
            case WebInspector.ConsoleMessage.MessageType.StartGroupCollapsed:
            case WebInspector.ConsoleMessage.MessageType.StartGroup:
                typeString = "Start Group";
                break;
            case WebInspector.ConsoleMessage.MessageType.EndGroup:
                typeString = "End Group";
                break;
            case WebInspector.ConsoleMessage.MessageType.Assert:
                typeString = "Assert";
                break;
            case WebInspector.ConsoleMessage.MessageType.Result:
                typeString = "Result";
                break;
            case WebInspector.ConsoleMessage.MessageType.Profile:
            case WebInspector.ConsoleMessage.MessageType.ProfileEnd:
                typeString = "Profiling";
                break;
        }

        var levelString;
        switch (this._message.level) {
            case WebInspector.ConsoleMessage.MessageLevel.Log:
                levelString = "Log";
                break;
            case WebInspector.ConsoleMessage.MessageLevel.Warning:
                levelString = "Warning";
                break;
            case WebInspector.ConsoleMessage.MessageLevel.Debug:
                levelString = "Debug";
                break;
            case WebInspector.ConsoleMessage.MessageLevel.Error:
                levelString = "Error";
                break;
            case WebInspector.ConsoleMessage.MessageLevel.RevokedError:
                levelString = "RevokedError";
                break;
            case WebInspector.ConsoleMessage.MessageLevel.Info:
                levelString = "Info";
                break;
        }

        return sourceString + " " + typeString + " " + levelString + ": " + this.formattedMessage().textContent + "\n" + this._message.url + " line " + this._message.line;
    },

    get text()
    {
        return this._message.messageText;
    },

    /**
     * @param {?RegExp} regex
     */
    setSearchRegex: function(regex)
    {
        if (this._searchHiglightNodeChanges && this._searchHiglightNodeChanges.length)
            WebInspector.revertDomChanges(this._searchHiglightNodeChanges);
        this._searchRegex = regex;
        this._searchHighlightNodes = [];
        this._searchHiglightNodeChanges = [];
        if (!this._searchRegex)
            return;

        var text = this.searchableElement().deepTextContent();
        var match;
        this._searchRegex.lastIndex = 0;
        var sourceRanges = [];
        while ((match = this._searchRegex.exec(text)) && match[0])
            sourceRanges.push(new WebInspector.SourceRange(match.index, match[0].length));

        if (sourceRanges.length && this.searchableElement())
            this._searchHighlightNodes = WebInspector.highlightSearchResults(this.searchableElement(), sourceRanges, this._searchHiglightNodeChanges);
    },

    /**
     * @return {?RegExp}
     */
    searchRegex: function()
    {
        return this._searchRegex;
    },

    /**
     * @return {number}
     */
    searchCount: function()
    {
        return this._searchHighlightNodes.length;
    },

    /**
     * @return {!Element}
     */
    searchHighlightNode: function(index)
    {
        return this._searchHighlightNodes[index];
    },

    /**
     * @return {!Element}
     */
    searchableElement: function()
    {
        this.formattedMessage();
        return this._messageElement;
    },

    /**
     * @param {string} string
     * @return {?Element}
     */
    _tryFormatAsError: function(string)
    {
        /**
         * @param {string} prefix
         */
        function startsWith(prefix)
        {
            return string.startsWith(prefix);
        }

        var errorPrefixes = ["EvalError", "ReferenceError", "SyntaxError", "TypeError", "RangeError", "Error", "URIError"];
        var target = this._target();
        if (!target || !errorPrefixes.some(startsWith))
            return null;
        var debuggerModel = WebInspector.DebuggerModel.fromTarget(target);
        if (!debuggerModel)
            return null;

        var lines = string.split("\n");
        var links = [];
        var position = 0;
        for (var i = 0; i < lines.length; ++i) {
            position += i > 0 ? lines[i - 1].length + 1 : 0;
            var isCallFrameLine = /^\s*at\s/.test(lines[i]);
            if (!isCallFrameLine && links.length)
                return null;

            if (!isCallFrameLine)
                continue;

            var openBracketIndex = lines[i].indexOf("(");
            var closeBracketIndex = lines[i].indexOf(")");
            var hasOpenBracket = openBracketIndex !== -1;
            var hasCloseBracket = closeBracketIndex !== -1;

            if ((openBracketIndex > closeBracketIndex) ||  (hasOpenBracket ^ hasCloseBracket))
                return null;

            var left = hasOpenBracket ? openBracketIndex + 1 : lines[i].indexOf("at") + 3;
            var right = hasOpenBracket ? closeBracketIndex : lines[i].length;
            var linkCandidate = lines[i].substring(left, right);
            var splitResult = WebInspector.ParsedURL.splitLineAndColumn(linkCandidate);
            if (!splitResult)
                return null;

            var parsed = splitResult.url.asParsedURL();
            var url;
            if (parsed)
                url = parsed.url;
            else if (debuggerModel.scriptsForSourceURL(splitResult.url).length)
                url = splitResult.url;
            else if (splitResult.url === "<anonymous>")
                continue;
            else
                return null;

            links.push({url: url, positionLeft: position + left, positionRight: position + right, lineNumber: splitResult.lineNumber, columnNumber: splitResult.columnNumber});
        }

        if (!links.length)
            return null;

        var formattedResult = createElement("span");
        var start = 0;
        for (var i = 0; i < links.length; ++i) {
            formattedResult.appendChild(WebInspector.linkifyStringAsFragment(string.substring(start, links[i].positionLeft)));
            formattedResult.appendChild(this._linkifier.linkifyScriptLocation(target, null, links[i].url, links[i].lineNumber, links[i].columnNumber));
            start = links[i].positionRight;
        }

        if (start != string.length)
            formattedResult.appendChild(WebInspector.linkifyStringAsFragment(string.substring(start)));

        return formattedResult;
    }
}

/**
 * @constructor
 * @extends {WebInspector.ConsoleViewMessage}
 * @param {!WebInspector.ConsoleMessage} consoleMessage
 * @param {!WebInspector.Linkifier} linkifier
 * @param {number} nestingLevel
 */
WebInspector.ConsoleGroupViewMessage = function(consoleMessage, linkifier, nestingLevel)
{
    console.assert(consoleMessage.isGroupStartMessage());
    WebInspector.ConsoleViewMessage.call(this, consoleMessage, linkifier, nestingLevel);
    this.setCollapsed(consoleMessage.type === WebInspector.ConsoleMessage.MessageType.StartGroupCollapsed);
}

WebInspector.ConsoleGroupViewMessage.prototype = {
    /**
     * @param {boolean} collapsed
     */
    setCollapsed: function(collapsed)
    {
        this._collapsed = collapsed;
        if (this._wrapperElement)
            this._wrapperElement.classList.toggle("collapsed", this._collapsed);
    },

    /**
     * @return {boolean}
     */
    collapsed: function()
    {
       return this._collapsed;
    },

    /**
     * @override
     * @return {!Element}
     */
    toMessageElement: function()
    {
        if (!this._wrapperElement) {
            WebInspector.ConsoleViewMessage.prototype.toMessageElement.call(this);
            this._wrapperElement.classList.toggle("collapsed", this._collapsed);
        }
        return this._wrapperElement;
    },

    __proto__: WebInspector.ConsoleViewMessage.prototype
}
