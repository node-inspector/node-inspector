// Copyright 2014 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

/**
 * @constructor
 */
WebInspector.JSArticle = function()
{
    /** @type {string} */
    this.pageTitle;
    /** @type {string} */
    this.standardizationStatus;
    /** @type {?WebInspector.WikiParser.Block} */
    this.summary;
    /** @type {!Array.<!WebInspector.JSArticle.Parameter>} */
    this.parameters = [];
    /** @type {?WebInspector.JSArticle.Method} */
    this.methods;
    /** @type {?WebInspector.WikiParser.Block} */
    this.remarks;
    /** @type {!Array.<!WebInspector.JSArticle.Example>} */
    this.examples = [];
}

/**
 * @constructor
 * @param {?WebInspector.WikiParser.Block} name
 * @param {?WebInspector.WikiParser.Block} dataType
 * @param {?WebInspector.WikiParser.Block} optional
 * @param {?WebInspector.WikiParser.Block} description
 */
WebInspector.JSArticle.Parameter = function(name, dataType, optional, description)
{
    this.name = WebInspector.JSArticle.unfoldStringValue(name);
    this.dataType = WebInspector.JSArticle.unfoldStringValue(dataType);
    var textContent = WebInspector.JSArticle.unfoldStringValue(optional);
    this.optional = textContent ? textContent.toUpperCase() === "YES" : false;
    this.description = description;
}

/**
 * @constructor
 * @param {?WebInspector.WikiParser.Block} language
 * @param {!WebInspector.WikiParser.Block} code
 * @param {?WebInspector.WikiParser.Block} liveUrl
 * @param {?WebInspector.WikiParser.Block} description
 */
WebInspector.JSArticle.Example = function(language, code, liveUrl, description)
{
    this.language = WebInspector.JSArticle.unfoldStringValue(language);
    this.code = WebInspector.JSArticle.unfoldStringValue(code);
    this.liveUrl = WebInspector.JSArticle.unfoldStringValue(liveUrl);
    this.description = description;
}

/**
 * @constructor
 * @param {?WebInspector.WikiParser.Block} returnValueName
 * @param {?WebInspector.WikiParser.Block} returnValueDescription
 */
WebInspector.JSArticle.Method = function(returnValueName, returnValueDescription)
{
    this.returnValueName = WebInspector.JSArticle.unfoldStringValue(returnValueName);
    this.returnValueDescription = returnValueDescription;
}

/**
 * @param {?WebInspector.WikiParser.Block} block
 * @return {?string}
 */
WebInspector.JSArticle.unfoldStringValue = function(block)
{
    if (block && block.hasChildren() && block.children()[0].hasChildren())
        return block.children()[0].children()[0].text();
    return null;
}

/**
 * @param {string} wikiMarkupText
 * @return {!WebInspector.JSArticle}
 */
WebInspector.JSArticle.parse = function(wikiMarkupText)
{
    var wikiParser = new WebInspector.WikiParser(wikiMarkupText);
    var wikiDocument = wikiParser.document();
    var article = new WebInspector.JSArticle();
    article.pageTitle = wikiDocument["Page_Title"];
    if (typeof article.pageTitle !== "string")
        delete article.pageTitle;
    article.standardizationStatus = wikiDocument["Standardization_Status"];
    if (article.standardizationStatus !== "string")
        delete article.standardizationStatus;
    var apiObjectMethod = wikiDocument["API_Object_Method"];
    if (apiObjectMethod) {
        var returnValueName = apiObjectMethod["Javascript_data_type"];
        var returnValue = apiObjectMethod["Return_value_description"];
        if (returnValueName && returnValue)
            article.methods = new WebInspector.JSArticle.Method(returnValueName, returnValue);
    }

    article.remarks = wikiDocument["Remarks_Section"] ? wikiDocument["Remarks_Section"]["Remarks"] : null;
    article.summary = wikiDocument["Summary_Section"];

    var examples = wikiDocument["Examples_Section"] && wikiDocument["Examples_Section"]["Examples"] ? wikiDocument["Examples_Section"]["Examples"] : [];
    if (!Array.isArray(examples) && typeof examples !== "undefined")
        examples = [examples];

    for (var i = 0; i < examples.length; ++i) {
        if (!examples[i].values)
            break;
        var language = examples[i].values["Language"];
        var code = examples[i].values["Code"];
        var liveUrl = examples[i].values["LiveURL"];
        var description = examples[i].values["Description"];
        article.examples.push(new WebInspector.JSArticle.Example(language, code, liveUrl, description));
    }

    var parameters = apiObjectMethod ? apiObjectMethod["Parameters"] : [];
    if (!Array.isArray(parameters) && typeof parameters !== "undefined")
        parameters = [parameters];

    for (var i = 0; i < parameters.length; ++i) {
        if (!parameters[i].values)
            break;
        var name = parameters[i].values["Name"];
        var dataType = parameters[i].values["Data type"];
        var optional = parameters[i].values["Optional"];
        var description = parameters[i].values["Description"];
        article.parameters.push(new WebInspector.JSArticle.Parameter(name, dataType, optional, description));
    }

    return article;
}
