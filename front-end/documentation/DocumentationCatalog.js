// Copyright 2014 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

/**
 * @constructor
 */
WebInspector.DocumentationCatalog = function()
{
    /** @type {!Map.<string, !Array.<!WebInspector.DocumentationCatalog.ItemDescriptor>>} */
    this._articleList = new Map();
    this._loader = new WebInspector.DocumentationCatalog.Loader(this);
}

/**
 * @return {!WebInspector.DocumentationCatalog}
 */
WebInspector.DocumentationCatalog.instance = function()
{
    if (!WebInspector.DocumentationCatalog._instance)
        WebInspector.DocumentationCatalog._instance = new WebInspector.DocumentationCatalog();
    return WebInspector.DocumentationCatalog._instance;
}

/**
 * @constructor
 * @param {string} url
 * @param {string} name
 * @param {string} searchTerm
 */
WebInspector.DocumentationCatalog.ItemDescriptor = function(url, name, searchTerm)
{
    this._url = String.sprintf(WebInspector.DocumentationCatalog._articleURLFormat, url, searchTerm);
    this._name = name;
    this._searchItem = searchTerm;
}

WebInspector.DocumentationCatalog.ItemDescriptor.prototype = {
    /**
     * @return {string}
     */
    url: function()
    {
        return this._url;
    },

    /**
     * @return {string}
     */
    name: function()
    {
        return this._name;
    },

    /**
     * @return {string}
     */
    searchItem: function()
    {
        return this._searchItem;
    }
}

/**
 * @const
 */
WebInspector.DocumentationCatalog.apiURLPrefix = "http://docs.webplatform.org/w/api.php?action=query";

/**
 * @const
 */
WebInspector.DocumentationCatalog._articleURLFormat = WebInspector.DocumentationCatalog.apiURLPrefix + "&titles=%s%s&prop=revisions&rvprop=timestamp|content&format=json";

/**
 * @const
 */
WebInspector.DocumentationCatalog._articleListURLFormat = WebInspector.DocumentationCatalog.apiURLPrefix + "&generator=allpages&gaplimit=500&gapfrom=%s&format=json";

WebInspector.DocumentationCatalog.prototype = {
    /**
     * @param {string} searchTerm
     * @return {!Array.<!WebInspector.DocumentationCatalog.ItemDescriptor>}
     */
    itemDescriptors: function(searchTerm)
    {
        return this._articleList.get(searchTerm) || [];
    },

    /**
     * @param {string} sourceName
     * @return {!Array.<!WebInspector.DocumentationCatalog.ItemDescriptor>}
     */
    constantDescriptors: function(sourceName)
    {
        return [new WebInspector.DocumentationCatalog.ItemDescriptor("javascript/" + sourceName + "/", sourceName, "constants")]
    },

    startLoadingIfNeeded: function()
    {
        if (this._loader._state === WebInspector.DocumentationCatalog.Loader.DownloadStates.NotStarted)
            this._loader._loadArticleList();
    },

    /**
     * @return {boolean}
     */
    isLoading: function()
    {
        return this._loader._state === WebInspector.DocumentationCatalog.Loader.DownloadStates.InProgress;
    },

    /**
     * @param {string} itemPath
     */
    _addDescriptorToList: function(itemPath)
    {
        // There are some properties that have several words in their name.
        // In article list they are written with whitespace, while in URL they are written with underscore.
        // We are creating URL for current property, so we have to replace all the whitespaces with underscores.
        var correctedItemPath = itemPath.replace(" ", "_");
        var tokens = correctedItemPath.split("/");
        if (tokens.length === 1)
            return;
        var propertyName = tokens.pop();
        var sourceName = tokens.length === 1 ? "window" : tokens.pop();
        if (!sourceName)
            return;
        var descriptors = this._articleList.get(propertyName);
        if (!descriptors) {
            descriptors = [];
            this._articleList.set(propertyName, descriptors);
        }
        var sourcePath = tokens.join("/") + "/" + (sourceName === "window" ? "" : sourceName + "/");
        descriptors.push(new WebInspector.DocumentationCatalog.ItemDescriptor(sourcePath, sourceName, propertyName));
    },
}

/**
 * @constructor
 * @param {!WebInspector.DocumentationCatalog} catalog
 */
WebInspector.DocumentationCatalog.Loader = function(catalog)
{
    this._sectionIndex = 0;
    this._section = WebInspector.DocumentationCatalog.Loader._sections[0];
    this._state = WebInspector.DocumentationCatalog.Loader.DownloadStates.NotStarted;
    this._catalog = catalog;
}

/**
 * @enum {string}
 */
WebInspector.DocumentationCatalog.Loader.DownloadStates = {
    NotStarted: "NotStarted",
    InProgress: "InProgress",
    Finished: "Finished",
    Failed: "Failed"
};

/**
 * @const
 * This array should be sorted alphabetically for correct WebInspector.DocumentationCatalog.Loader work.
 */
WebInspector.DocumentationCatalog.Loader._sections = [
    "dom/",
    "javascript/"
];

WebInspector.DocumentationCatalog.Loader.prototype = {
    _loadArticleList: function()
    {
        if (this._state === WebInspector.DocumentationCatalog.Loader.DownloadStates.Finished)
            return;
        this._state = WebInspector.DocumentationCatalog.Loader.DownloadStates.InProgress;
        var url = String.sprintf(WebInspector.DocumentationCatalog._articleListURLFormat, this._section);
        var boundReset = this._resetDownload.bind(this);
        loadXHR(url).then(this._processData.bind(this)).catch(boundReset);
    },

    /**
     * @param {?string} responseText
     */
    _processData: function(responseText)
    {
        if (!responseText) {
            this._resetDownload.call(this);
            return;
        }
        var json = JSON.parse(responseText);
        var pages = json["query"]["pages"];
        for (var article in pages)
            this._catalog._addDescriptorToList(pages[article]["title"]);
        var sections = WebInspector.DocumentationCatalog.Loader._sections;
        this._section = json["query-continue"]["allpages"]["gapcontinue"];
        while (this._sectionIndex < sections.length && this._section > sections[this._sectionIndex] && !this._section.startsWith(sections[this._sectionIndex]))
            ++this._sectionIndex;
        if (this._sectionIndex === sections.length) {
            this._state = WebInspector.DocumentationCatalog.Loader.DownloadStates.Finished;
            return;
        }
        if (this._section < sections[this._sectionIndex])
            this._section = sections[this._sectionIndex];
        this._loadArticleList();
    },

    _resetDownload: function()
    {
        WebInspector.console.error("Documentation article list download failed");
        this._state = WebInspector.DocumentationCatalog.Loader.DownloadStates.Failed;
    }
}
