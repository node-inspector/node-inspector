/*
 * Copyright (C) 2012 Google Inc. All rights reserved.
 * Copyright (C) 2013 Samsung Electronics. All rights reserved.
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
 * @param {!WebInspector.AuditsPanel} auditsPanel
 */
WebInspector.AuditController = function(auditsPanel)
{
    this._auditsPanel = auditsPanel;
    WebInspector.targetManager.addEventListener(WebInspector.TargetManager.Events.Load, this._didMainResourceLoad, this);
}

WebInspector.AuditController.prototype = {
    /**
     * @param {!WebInspector.Target} target
     * @param {!Array.<!WebInspector.AuditCategory>} categories
     * @param {function(string, !Array.<!WebInspector.AuditCategoryResult>)} resultCallback
     */
    _executeAudit: function(target, categories, resultCallback)
    {
        this._progress.setTitle(WebInspector.UIString("Running audit"));

        /**
         * @param {!WebInspector.AuditCategoryResult} categoryResult
         * @param {!WebInspector.AuditRuleResult} ruleResult
         * @this {WebInspector.AuditController}
         */
        function ruleResultReadyCallback(categoryResult, ruleResult)
        {
            if (ruleResult && ruleResult.children)
                categoryResult.addRuleResult(ruleResult);

            if (this._progress.isCanceled())
                this._progress.done();
        }

        var results = [];
        var mainResourceURL = target.resourceTreeModel.inspectedPageURL();
        var categoriesDone = 0;

        /**
         * @this {WebInspector.AuditController}
         */
        function categoryDoneCallback()
        {
            if (++categoriesDone !== categories.length)
                return;
            this._progress.done();
            resultCallback(mainResourceURL, results)
        }

        var requests = target.networkLog.requests.slice();
        var compositeProgress = new WebInspector.CompositeProgress(this._progress);
        var subprogresses = [];
        for (var i = 0; i < categories.length; ++i)
            subprogresses.push(compositeProgress.createSubProgress());
        for (var i = 0; i < categories.length; ++i) {
            var category = categories[i];
            var result = new WebInspector.AuditCategoryResult(category);
            results.push(result);
            category.run(target, requests, ruleResultReadyCallback.bind(this, result), categoryDoneCallback.bind(this), subprogresses[i]);
        }
    },

    /**
     * @param {function()} launcherCallback
     * @param {string} mainResourceURL
     * @param {!Array.<!WebInspector.AuditCategoryResult>} results
     */
    _auditFinishedCallback: function(launcherCallback, mainResourceURL, results)
    {
        this._auditsPanel.auditFinishedCallback(mainResourceURL, results);
        if (!this._progress.isCanceled())
            launcherCallback();
    },

    /**
     * @param {!Array.<string>} categoryIds
     * @param {!WebInspector.Progress} progress
     * @param {boolean} runImmediately
     * @param {function()} startedCallback
     * @param {function()} finishedCallback
     */
    initiateAudit: function(categoryIds, progress, runImmediately, startedCallback, finishedCallback)
    {
        var target = /** @type {!WebInspector.Target} */ (WebInspector.targetManager.mainTarget());
        if (!categoryIds || !categoryIds.length || !target)
            return;

        this._progress = progress;

        var categories = [];
        for (var i = 0; i < categoryIds.length; ++i)
            categories.push(this._auditsPanel.categoriesById[categoryIds[i]]);

        /**
         * @this {WebInspector.AuditController}
         */
        function startAuditWhenResourcesReady()
        {
            startedCallback();
            this._executeAudit(target, categories, this._auditFinishedCallback.bind(this, finishedCallback));
        }

        if (runImmediately)
            startAuditWhenResourcesReady.call(this);
        else
            this._reloadResources(startAuditWhenResourcesReady.bind(this));

        WebInspector.userMetrics.AuditsStarted.record();
    },

    /**
     * @param {function()=} callback
     */
    _reloadResources: function(callback)
    {
        this._pageReloadCallback = callback;
        WebInspector.targetManager.reloadPage();
    },

    _didMainResourceLoad: function()
    {
        if (this._pageReloadCallback) {
            var callback = this._pageReloadCallback;
            delete this._pageReloadCallback;
            callback();
        }
    },

    clearResults: function()
    {
        this._auditsPanel.clearResults();
    }
}
