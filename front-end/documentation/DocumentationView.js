// Copyright 2014 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

/**
 * @constructor
 * @extends {WebInspector.View}
 */
WebInspector.DocumentationView = function()
{
    WebInspector.View.call(this);
    this.element.classList.add("documentation-view");
    this.registerRequiredCSS("documentation/documentationView.css");
}

/**
 * @param {string} url
 * @param {string} searchItem
 */
WebInspector.DocumentationView.showDocumentationURL = function(url, searchItem)
{
    if (!WebInspector.DocumentationView._view)
        WebInspector.DocumentationView._view = new WebInspector.DocumentationView();
    var view = WebInspector.DocumentationView._view;
    view.element.removeChildren();
    WebInspector.inspectorView.showCloseableViewInDrawer("documentation", WebInspector.UIString("Documentation"), view);
    view.showDocumentation(url, searchItem);
}

WebInspector.DocumentationView._languageToMimeType = {
    "javascript": "text/javascript",
    "html": "text/html"
};

WebInspector.DocumentationView.prototype = {
    /**
     * @param {string} url
     * @param {string} searchItem
     */
    showDocumentation: function(url, searchItem)
    {
        if (!url) {
            this._createEmptyPage();
            return;
        }
        loadXHR(url)
            .then(this._createArticle.bind(this, searchItem))
            .catch(this._createEmptyPage.bind(this));
    },

    /**
     * @param {string} searchItem
     * @param {string} responseText
     */
    _createArticle: function(searchItem, responseText)
    {
        var json = JSON.parse(responseText);
        var pages = json["query"]["pages"];
        var wikiKeys = Object.keys(pages);
        if (wikiKeys.length === 1 && wikiKeys[0] === "-1") {
            this._createEmptyPage();
            return;
        }
        var wikiMarkupText = pages[wikiKeys[0]]["revisions"]["0"]["*"];
        var article;
        try {
            article = WebInspector.JSArticle.parse(wikiMarkupText);
        } catch (error) {
            console.error("Article could not be parsed. " + error.message);
        }
        if (!article) {
            this._createEmptyPage();
            return;
        }

        this.element.removeChildren();
        var renderer = new WebInspector.DocumentationView.Renderer(article, searchItem);
        this.element.appendChild(renderer.renderJSArticle());
    },

    _createEmptyPage: function()
    {
        this.element.removeChildren();
        var emptyPage = this.element.createChild("div", "documentation-empty-page fill");
        var pageTitle = emptyPage.createChild("div", "documentation-not-found");
        pageTitle.textContent = WebInspector.UIString("No documentation found.");
        emptyPage.createChild("div", "documentation-empty-page-align");
    },

    __proto__: WebInspector.View.prototype
}

/**
 * @constructor
 * @param {!WebInspector.JSArticle} article
 * @param {string} searchItem
 */
WebInspector.DocumentationView.Renderer = function(article, searchItem)
{
    this._searchItem = searchItem;
    this._element = createElement("div");
    this._article = article;
}

WebInspector.DocumentationView.Renderer.prototype = {
    /**
     * @return {!Element}
     */
    renderJSArticle: function()
    {
        this._element.appendChild(this._createPageTitle(this._article.pageTitle, this._searchItem));
        var signatureElement = this._createSignatureSection(this._article.parameters, this._article.methods);
        if (signatureElement)
            this._element.appendChild(signatureElement);

        var descriptionElement = this._element.createChild("div", "documentation-description");
        var summarySection = this._article.summary ? this._renderBlock(this._article.summary) : null;
        if (summarySection)
            descriptionElement.appendChild(summarySection);
        var parametersSection = this._createParametersSection(this._article.parameters);
        if (parametersSection)
            descriptionElement.appendChild(parametersSection);

        var examplesSection = this._createExamplesSection(this._article.examples);
        if (examplesSection) {
            var examplesTitle = this._element.createChild("div", "documentation-title");
            examplesTitle.textContent = WebInspector.UIString("Examples");
            descriptionElement = this._element.createChild("div", "documentation-description");
            descriptionElement.appendChild(examplesSection);
        }

        var remarksSection = this._article.remarks ? this._renderBlock(this._article.remarks) : null;
        if (remarksSection) {
            var remarksTitle = this._element.createChild("div", "documentation-title");
            remarksTitle.textContent = WebInspector.UIString("Remarks");
            descriptionElement = this._element.createChild("div", "documentation-description");
            descriptionElement.appendChild(remarksSection);
        }
        return this._element;
    },

    /**
     * @param {string} titleText
     * @param {string} searchItem
     * @return {!Element}
     */
    _createPageTitle: function(titleText, searchItem)
    {
        var pageTitle = createElementWithClass("div", "documentation-page-title");
        if (titleText)
            pageTitle.textContent = titleText;
        else if (searchItem)
            pageTitle.textContent = searchItem;
        return pageTitle;
    },

    /**
     * @param {!Array.<!WebInspector.JSArticle.Parameter>} parameters
     * @param {?WebInspector.JSArticle.Method} method
     * @return {?Element}
     */
    _createSignatureSection: function(parameters, method)
    {
        if (!parameters.length && !method)
            return null;
        var signature = createElementWithClass("div", "documentation-method-signature monospace");
        if (method && method.returnValueName) {
            var returnTypeElement = signature.createChild("span", "documentation-parameter-data-type-value");
            returnTypeElement.textContent = method.returnValueName;
        }
        var methodName = signature.createChild("span", "documentation-method-name");
        methodName.textContent = this._searchItem.split(".").peekLast() + "(";
        for (var i = 0; i < parameters.length; ++i) {
            if (i > 0)
                signature.createTextChild(",")
            var parameterType = signature.createChild("span", "documentation-parameter-data-type-value");
            parameterType.textContent = parameters[i].dataType;
            var parameterName = signature.createChild("span", "documentation-parameter-name");
            parameterName.textContent = parameters[i].name;
        }

        signature.createTextChild(")");
        return signature;
    },

    /**
     * @param {!Array.<!WebInspector.JSArticle.Parameter>} parameters
     * @return {?Element}
     */
    _createParametersSection: function(parameters)
    {
        if (!parameters.length)
            return null;
        var table = createElementWithClass("table", "documentation-table");
        var tableBody = table.createChild("tbody");
        var headerRow = tableBody.createChild("tr", "documentation-table-row");
        var tableHeader = headerRow.createChild("th", "documentation-table-header");
        tableHeader.textContent = WebInspector.UIString("Parameters");
        tableHeader.colSpan = 3;
        for (var i = 0; i < parameters.length; ++i) {
            var tableRow = tableBody.createChild("tr", "documentation-table-row");
            var type = tableRow.createChild("td", "documentation-table-cell");
            type.textContent = parameters[i].dataType;
            var name = tableRow.createChild("td", "documentation-table-cell");
            name.textContent = parameters[i].optional ? WebInspector.UIString("(optional)\n") : "";
            name.textContent += parameters[i].name;
            var description = tableRow.createChild("td", "documentation-table-cell");
            if (parameters[i].description)
                description.appendChild(this._renderBlock(/** @type {!WebInspector.WikiParser.Block} */(parameters[i].description)));
        }
        return table;
    },

    /**
     * @param {!Array.<!WebInspector.JSArticle.Example>} examples
     */
    _createExamplesSection: function(examples)
    {
        if (!examples.length)
            return;

        var section = createElementWithClass("div", "documentation-section");

        for (var i = 0; i < examples.length; ++i) {
            var example = section.createChild("div", "documentation-example");
            var exampleDescription = example.createChild("div", "documentation-example-description-section");
            if (examples[i].description) {
                var description = this._renderBlock(/** @type {!WebInspector.WikiParser.Block} */(examples[i].description));
                description.classList.add("documentation-text");
                exampleDescription.appendChild(description);
            }
            var code = example.createChild("div", "documentation-code source-code");
            code.textContent = examples[i].code;
            if (!examples[i].language)
                continue;
            var syntaxHighlighter = new WebInspector.DOMSyntaxHighlighter(WebInspector.DocumentationView._languageToMimeType[examples[i].language.toLowerCase()], true);
            syntaxHighlighter.syntaxHighlightNode(code).done();
        }
        return section;
    },

    /**
     * @param {!WebInspector.WikiParser.ArticleElement} article
     * @return {!Element}
     */
    _renderBlock: function(article)
    {
        var element;
        var elementTypes = WebInspector.WikiParser.ArticleElement.Type;

        switch (article.type()) {
        case elementTypes.Inline:
            element = createElement("span");
            break;
        case elementTypes.Link:
            element = WebInspector.createExternalAnchor(article.url(), article.children().length ? "" : article.url());
            break;
        case elementTypes.Code:
            element = createElementWithClass("span", "documentation-code-tag");
            break;
        case elementTypes.CodeBlock:
            element = createElementWithClass("pre", "documentation-code source-code");
            element.textContent = article.code();
            break;
        case elementTypes.PlainText:
            element = createElement("span");
            element.textContent = article.text();
            if (article.isHighlighted())
                element.classList.add("documentation-highlighted-text");
            break;
        case elementTypes.Block:
            element = createElement(article.hasBullet() ? "li" : "div");
            if (!article.hasBullet())
                element.classList.add("documentation-paragraph");
            break;
        case elementTypes.Table:
            return this._renderTable(/** @type {!WebInspector.WikiParser.Table} */(article));
        default:
            throw new Error("Unknown ArticleElement type " + article.type());
        }

        if (article.type() === WebInspector.WikiParser.ArticleElement.Type.Block
            || article.type() === WebInspector.WikiParser.ArticleElement.Type.Code
            || article.type() === WebInspector.WikiParser.ArticleElement.Type.Inline) {
            for (var i = 0; i < article.children().length; ++i) {
                var child = this._renderBlock(article.children()[i]);
                if (child)
                    element.appendChild(child);
            }
        }

        return element;
    },

    /**
     * @param {!WebInspector.WikiParser.Table} table
     * @return {!Element}
     */
    _renderTable: function(table)
    {
        var tableElement = createElementWithClass("table", "documentation-table");
        var tableBody = tableElement.createChild("tbody");
        var headerRow = tableBody.createChild("tr", "documentation-table-row");
        for (var i = 0; i < table.columnNames().length; ++i) {
            var tableHeader = headerRow.createChild("th", "documentation-table-header");
            tableHeader.appendChild(this._renderBlock(table.columnNames()[i]));
        }
        for (var i = 0; i < table.rows().length; ++i) {
            var tableRow = tableBody.createChild("tr", "documentation-table-row");
            var row = table.rows()[i];
            for (var j = 0; j < row.length; ++j) {
                var cell = tableRow.createChild("td", "documentation-table-cell");
                cell.appendChild(this._renderBlock(row[j]));
            }
        }

        return tableElement;
    }
}

/**
 * @constructor
 * @implements {WebInspector.ContextMenu.Provider}
 */
WebInspector.DocumentationView.ContextMenuProvider = function()
{
}

WebInspector.DocumentationView.ContextMenuProvider.prototype = {
    /**
     * @param {!Event} event
     * @param {!WebInspector.ContextMenu} contextMenu
     * @param {!Object} target
     */
    appendApplicableItems: function(event, contextMenu, target)
    {
        if (!(target instanceof WebInspector.CodeMirrorTextEditor))
            return;
        WebInspector.DocumentationCatalog.instance().startLoadingIfNeeded();
        if (WebInspector.DocumentationCatalog.instance().isLoading()) {
            var itemName = WebInspector.useLowerCaseMenuTitles() ? "Loading documentation..." : "Loading Documentation...";
            contextMenu.appendItem(itemName, function() {}, true);
            return;
        }
        var textEditor = /** @type {!WebInspector.CodeMirrorTextEditor} */ (target);
        var descriptors = this._determineDescriptors(textEditor);
        if (!descriptors.length)
            return;
        if (descriptors.length === 1) {
            var formatString = WebInspector.useLowerCaseMenuTitles() ? "Show documentation for %s.%s" : "Show Documentation for %s.%s";
            var methodName = String.sprintf("%s.%s", descriptors[0].name(), descriptors[0].searchItem());
            contextMenu.appendItem(WebInspector.UIString(formatString, descriptors[0].name(), descriptors[0].searchItem()), WebInspector.DocumentationView.showDocumentationURL.bind(null, descriptors[0].url(), methodName));
            return;
        }
        var subMenuItem = contextMenu.appendSubMenuItem(WebInspector.UIString(WebInspector.useLowerCaseMenuTitles() ? "Show documentation for..." : "Show Documentation for..."));
        for (var i = 0; i < descriptors.length; ++i) {
            var methodName = String.sprintf("%s.%s", descriptors[i].name(), descriptors[i].searchItem());
            subMenuItem.appendItem(methodName, WebInspector.DocumentationView.showDocumentationURL.bind(null, descriptors[i].url(), methodName));
        }
    },

    /**
     * @param {!WebInspector.CodeMirrorTextEditor} textEditor
     * @return {!Array.<!WebInspector.DocumentationCatalog.ItemDescriptor>}
     */
    _determineDescriptors: function(textEditor)
    {
        var catalog = WebInspector.DocumentationCatalog.instance();
        var textSelection = textEditor.selection().normalize();
        var previousTokenText = findPreviousToken(textSelection);

        if (!textSelection.isEmpty()) {
            if (textSelection.startLine !== textSelection.endLine)
                return [];
            return computeDescriptors(textSelection);
        }

        var descriptors = computeDescriptors(getTokenRangeByColumn(textSelection.startColumn));
        if (descriptors.length)
            return descriptors;

        return computeDescriptors(getTokenRangeByColumn(textSelection.startColumn - 1));

        /**
         * @param {number} column
         * @return {?WebInspector.TextRange}
         */
        function getTokenRangeByColumn(column)
        {
            var token = textEditor.tokenAtTextPosition(textSelection.startLine, column);
            if (!token)
                return null;
            return new WebInspector.TextRange(textSelection.startLine, token.startColumn, textSelection.startLine, token.endColumn);
        }

        /**
         * @param {?WebInspector.TextRange} textRange
         * @return {!Array.<!WebInspector.DocumentationCatalog.ItemDescriptor>}
         */
        function computeDescriptors(textRange)
        {
            if (!textRange)
                return [];
            var propertyName = textEditor.copyRange(textRange);
            var descriptors = catalog.itemDescriptors(propertyName);
            if (descriptors.length)
                return descriptors;
            if (propertyName.toUpperCase() !== propertyName || !previousTokenText || !window[previousTokenText] || !window[previousTokenText][propertyName])
                return [];
            return catalog.constantDescriptors(previousTokenText);
        }

        /**
         * @param {!WebInspector.TextRange} textRange
         * @return {?string}
         */
        function findPreviousToken(textRange)
        {
            var line = textEditor.line(textRange.startLine);
            if (textRange.startColumn < 3 || line[textRange.startColumn - 1] !== ".")
                return null;
            var token = textEditor.tokenAtTextPosition(textRange.startLine, textRange.startColumn - 2);
            return token ? line.substring(token.startColumn, token.endColumn) : null;
        }
    }
}
