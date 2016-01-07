/*
 * Copyright (C) 2012 Google Inc. All rights reserved.
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
 * @extends {WebInspector.PanelWithSidebar}
 */
WebInspector.AuditsPanel = function()
{
    WebInspector.PanelWithSidebar.call(this, "audits");
    this.registerRequiredCSS("ui/panelEnablerView.css");
    this.registerRequiredCSS("audits/auditsPanel.css");

    var sidebarTree = new TreeOutline();
    sidebarTree.element.classList.add("sidebar-tree");
    this.panelSidebarElement().appendChild(sidebarTree.element);
    this.setDefaultFocusedElement(sidebarTree.element);

    this.auditsTreeElement = new WebInspector.SidebarSectionTreeElement("");
    sidebarTree.appendChild(this.auditsTreeElement);
    this.auditsTreeElement.listItemElement.classList.add("hidden");

    this.auditsItemTreeElement = new WebInspector.AuditsSidebarTreeElement(this);
    this.auditsTreeElement.appendChild(this.auditsItemTreeElement);

    this.auditResultsTreeElement = new WebInspector.SidebarSectionTreeElement(WebInspector.UIString("RESULTS"));
    sidebarTree.appendChild(this.auditResultsTreeElement);
    this.auditResultsTreeElement.expand();

    this._constructCategories();

    this._auditController = new WebInspector.AuditController(this);
    this._launcherView = new WebInspector.AuditLauncherView(this._auditController);
    for (var id in this.categoriesById)
        this._launcherView.addCategory(this.categoriesById[id]);

    var extensionCategories = WebInspector.extensionServer.auditCategories();
    for (var i = 0; i < extensionCategories.length; ++i) {
        var category = extensionCategories[i];
        this.addCategory(new WebInspector.AuditExtensionCategory(category.extensionOrigin, category.id, category.displayName, category.ruleCount));
    }
    WebInspector.extensionServer.addEventListener(WebInspector.ExtensionServer.Events.AuditCategoryAdded, this._extensionAuditCategoryAdded, this);
}

WebInspector.AuditsPanel.prototype = {

    /**
     * @return {!Object.<string, !WebInspector.AuditCategory>}
     */
    get categoriesById()
    {
        return this._auditCategoriesById;
    },

    /**
     * @param {!WebInspector.AuditCategory} category
     */
    addCategory: function(category)
    {
        this.categoriesById[category.id] = category;
        this._launcherView.addCategory(category);
    },

    /**
     * @param {string} id
     * @return {!WebInspector.AuditCategory}
     */
    getCategory: function(id)
    {
        return this.categoriesById[id];
    },

    _constructCategories: function()
    {
        this._auditCategoriesById = {};
        for (var categoryCtorID in WebInspector.AuditCategories) {
            var auditCategory = new WebInspector.AuditCategories[categoryCtorID]();
            auditCategory._id = categoryCtorID;
            this.categoriesById[categoryCtorID] = auditCategory;
        }
    },

    /**
     * @param {string} mainResourceURL
     * @param {!Array.<!WebInspector.AuditCategoryResult>} results
     */
    auditFinishedCallback: function(mainResourceURL, results)
    {
        var ordinal = 1;
        for (var child of this.auditResultsTreeElement.children()) {
            if (child.mainResourceURL === mainResourceURL)
                ordinal++;
        }

        var resultTreeElement = new WebInspector.AuditResultSidebarTreeElement(this, results, mainResourceURL, ordinal);
        this.auditResultsTreeElement.appendChild(resultTreeElement);
        resultTreeElement.revealAndSelect();
    },

    /**
     * @param {!Array.<!WebInspector.AuditCategoryResult>} categoryResults
     */
    showResults: function(categoryResults)
    {
        if (!categoryResults._resultView)
            categoryResults._resultView = new WebInspector.AuditResultView(categoryResults);

        this.visibleView = categoryResults._resultView;
    },

    showLauncherView: function()
    {
        this.visibleView = this._launcherView;
    },

    get visibleView()
    {
        return this._visibleView;
    },

    set visibleView(x)
    {
        if (this._visibleView === x)
            return;

        if (this._visibleView)
            this._visibleView.detach();

        this._visibleView = x;

        if (x)
            this.splitWidget().setMainWidget(x);
    },

    wasShown: function()
    {
        WebInspector.Panel.prototype.wasShown.call(this);
        if (!this._visibleView)
            this.auditsItemTreeElement.select();
    },

    clearResults: function()
    {
        this.auditsItemTreeElement.revealAndSelect();
        this.auditResultsTreeElement.removeChildren();
    },

    /**
     * @param {!WebInspector.Event} event
     */
    _extensionAuditCategoryAdded: function(event)
    {
        var category = /** @type {!WebInspector.ExtensionAuditCategory} */ (event.data);
        this.addCategory(new WebInspector.AuditExtensionCategory(category.extensionOrigin, category.id, category.displayName, category.ruleCount));
    },

    __proto__: WebInspector.PanelWithSidebar.prototype
}

/**
 * @constructor
 * @implements {WebInspector.AuditCategory}
 * @param {string} displayName
 */
WebInspector.AuditCategoryImpl = function(displayName)
{
    this._displayName = displayName;
    this._rules = [];
}

WebInspector.AuditCategoryImpl.prototype = {
    /**
     * @override
     * @return {string}
     */
    get id()
    {
        // this._id value is injected at construction time.
        return this._id;
    },

    /**
     * @override
     * @return {string}
     */
    get displayName()
    {
        return this._displayName;
    },

    /**
     * @param {!WebInspector.AuditRule} rule
     * @param {!WebInspector.AuditRule.Severity} severity
     */
    addRule: function(rule, severity)
    {
        rule.severity = severity;
        this._rules.push(rule);
    },

    /**
     * @override
     * @param {!WebInspector.Target} target
     * @param {!Array.<!WebInspector.NetworkRequest>} requests
     * @param {function(!WebInspector.AuditRuleResult)} ruleResultCallback
     * @param {!WebInspector.Progress} progress
     */
    run: function(target, requests, ruleResultCallback, progress)
    {
        this._ensureInitialized();
        var remainingRulesCount = this._rules.length;
        progress.setTotalWork(remainingRulesCount);
        function callbackWrapper(result)
        {
            ruleResultCallback(result);
            progress.worked();
            if (!--remainingRulesCount)
                progress.done();
        }
        for (var i = 0; i < this._rules.length; ++i) {
            if (!progress.isCanceled())
                this._rules[i].run(target, requests, callbackWrapper, progress);
            else
                callbackWrapper(null);
        }
    },

    _ensureInitialized: function()
    {
        if (!this._initialized) {
            if ("initialize" in this)
                this.initialize();
            this._initialized = true;
        }
    }
}

/**
 * @constructor
 * @param {string} id
 * @param {string} displayName
 */
WebInspector.AuditRule = function(id, displayName)
{
    this._id = id;
    this._displayName = displayName;
}

/**
 * @enum {string}
 */
WebInspector.AuditRule.Severity = {
    Info: "info",
    Warning: "warning",
    Severe: "severe"
}

WebInspector.AuditRule.SeverityOrder = {
    "info": 3,
    "warning": 2,
    "severe": 1
}

WebInspector.AuditRule.prototype = {
    get id()
    {
        return this._id;
    },

    get displayName()
    {
        return this._displayName;
    },

    /**
     * @param {!WebInspector.AuditRule.Severity} severity
     */
    set severity(severity)
    {
        this._severity = severity;
    },

    /**
     * @param {!WebInspector.Target} target
     * @param {!Array.<!WebInspector.NetworkRequest>} requests
     * @param {function(?WebInspector.AuditRuleResult)} callback
     * @param {!WebInspector.Progress} progress
     */
    run: function(target, requests, callback, progress)
    {
        if (progress.isCanceled())
            return;

        var result = new WebInspector.AuditRuleResult(this.displayName);
        result.severity = this._severity;
        this.doRun(target, requests, result, callback, progress);
    },

    /**
     * @param {!WebInspector.Target} target
     * @param {!Array.<!WebInspector.NetworkRequest>} requests
     * @param {!WebInspector.AuditRuleResult} result
     * @param {function(?WebInspector.AuditRuleResult)} callback
     * @param {!WebInspector.Progress} progress
     */
    doRun: function(target, requests, result, callback, progress)
    {
        throw new Error("doRun() not implemented");
    }
}

/**
 * @constructor
 * @param {!WebInspector.AuditCategory} category
 */
WebInspector.AuditCategoryResult = function(category)
{
    this.title = category.displayName;
    this.ruleResults = [];
}

WebInspector.AuditCategoryResult.prototype = {
    /**
     * @param {!WebInspector.AuditRuleResult} ruleResult
     */
    addRuleResult: function(ruleResult)
    {
        this.ruleResults.push(ruleResult);
    }
}

/**
 * @constructor
 * @param {(string|boolean|number|!Object)} value
 * @param {boolean=} expanded
 * @param {string=} className
 */
WebInspector.AuditRuleResult = function(value, expanded, className)
{
    this.value = value;
    this.className = className;
    this.expanded = expanded;
    this.violationCount = 0;
    this._formatters = {
        r: WebInspector.AuditRuleResult.linkifyDisplayName
    };
    var standardFormatters = Object.keys(String.standardFormatters);
    for (var i = 0; i < standardFormatters.length; ++i)
        this._formatters[standardFormatters[i]] = String.standardFormatters[standardFormatters[i]];
}

/**
 * @param {string} url
 * @return {!Element}
 */
WebInspector.AuditRuleResult.linkifyDisplayName = function(url)
{
    return WebInspector.linkifyURLAsNode(url, WebInspector.displayNameForURL(url));
}

/**
 * @param {string} domain
 * @return {string}
 */
WebInspector.AuditRuleResult.resourceDomain = function(domain)
{
    return domain || WebInspector.UIString("[empty domain]");
}

WebInspector.AuditRuleResult.prototype = {
    /**
     * @param {(string|boolean|number|!Object)} value
     * @param {boolean=} expanded
     * @param {string=} className
     * @return {!WebInspector.AuditRuleResult}
     */
    addChild: function(value, expanded, className)
    {
        if (!this.children)
            this.children = [];
        var entry = new WebInspector.AuditRuleResult(value, expanded, className);
        this.children.push(entry);
        return entry;
    },

    /**
     * @param {string} url
     */
    addURL: function(url)
    {
        this.addChild(WebInspector.AuditRuleResult.linkifyDisplayName(url));
    },

    /**
     * @param {!Array.<string>} urls
     */
    addURLs: function(urls)
    {
        for (var i = 0; i < urls.length; ++i)
            this.addURL(urls[i]);
    },

    /**
     * @param {string} snippet
     */
    addSnippet: function(snippet)
    {
        this.addChild(snippet, false, "source-code");
    },

    /**
     * @param {string} format
     * @param {...*} vararg
     * @return {!WebInspector.AuditRuleResult}
     */
    addFormatted: function(format, vararg)
    {
        var substitutions = Array.prototype.slice.call(arguments, 1);
        var fragment = createDocumentFragment();

        function append(a, b)
        {
            if (!(b instanceof Node))
                b = createTextNode(b);
            a.appendChild(b);
            return a;
        }

        var formattedResult = String.format(format, substitutions, this._formatters, fragment, append).formattedResult;
        if (formattedResult instanceof Node)
            formattedResult.normalize();
        return this.addChild(formattedResult);
    }
}

/**
 * @constructor
 * @extends {WebInspector.SidebarTreeElement}
 * @param {!WebInspector.AuditsPanel} panel
 */
WebInspector.AuditsSidebarTreeElement = function(panel)
{
    this._panel = panel;
    this.small = false;
    WebInspector.SidebarTreeElement.call(this, "audits-sidebar-tree-item", WebInspector.UIString("Audits"));
}

WebInspector.AuditsSidebarTreeElement.prototype = {
    onattach: function()
    {
        WebInspector.SidebarTreeElement.prototype.onattach.call(this);
    },

    /**
     * @override
     * @return {boolean}
     */
    onselect: function()
    {
        this._panel.showLauncherView();
        return true;
    },

    get selectable()
    {
        return true;
    },

    refresh: function()
    {
        this.refreshTitles();
    },

    __proto__: WebInspector.SidebarTreeElement.prototype
}

/**
 * @constructor
 * @extends {WebInspector.SidebarTreeElement}
 * @param {!WebInspector.AuditsPanel} panel
 * @param {!Array.<!WebInspector.AuditCategoryResult>} results
 * @param {string} mainResourceURL
 * @param {number} ordinal
 */
WebInspector.AuditResultSidebarTreeElement = function(panel, results, mainResourceURL, ordinal)
{
    this._panel = panel;
    this.results = results;
    this.mainResourceURL = mainResourceURL;
    WebInspector.SidebarTreeElement.call(this, "audit-result-sidebar-tree-item", String.sprintf("%s (%d)", mainResourceURL, ordinal));
}

WebInspector.AuditResultSidebarTreeElement.prototype = {
    /**
     * @override
     * @return {boolean}
     */
    onselect: function()
    {
        this._panel.showResults(this.results);
        return true;
    },

    get selectable()
    {
        return true;
    },

    __proto__: WebInspector.SidebarTreeElement.prototype
}

WebInspector.AuditsPanel.show = function()
{
    WebInspector.inspectorView.setCurrentPanel(WebInspector.AuditsPanel.instance());
}

/**
 * @return {!WebInspector.AuditsPanel}
 */
WebInspector.AuditsPanel.instance = function()
{
    if (!WebInspector.AuditsPanel._instanceObject)
        WebInspector.AuditsPanel._instanceObject = new WebInspector.AuditsPanel();
    return WebInspector.AuditsPanel._instanceObject;
}

/**
 * @constructor
 * @implements {WebInspector.PanelFactory}
 */
WebInspector.AuditsPanelFactory = function()
{
}

WebInspector.AuditsPanelFactory.prototype = {
    /**
     * @override
     * @return {!WebInspector.Panel}
     */
    createPanel: function()
    {
        return WebInspector.AuditsPanel.instance();
    }
}

// Contributed audit rules should go into this namespace.
WebInspector.AuditRules = {};

/**
 * Contributed audit categories should go into this namespace.
 * @type {!Object.<string, function(new:WebInspector.AuditCategory)>}
 */
WebInspector.AuditCategories = {};
