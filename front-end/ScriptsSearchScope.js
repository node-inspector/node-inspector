/*
 * Copyright (C) 2011 Google Inc. All rights reserved.
 *
 * Redistribution and use in source and binary forms, with or without
 * modification, are permitted provided that the following conditions are
 * met:
 *
 * 1. Redistributions of source code must retain the above copyright
 * notice, this list of conditions and the following disclaimer.
 *
 * 2. Redistributions in binary form must reproduce the above
 * copyright notice, this list of conditions and the following disclaimer
 * in the documentation and/or other materials provided with the
 * distribution.
 *
 * THIS SOFTWARE IS PROVIDED BY GOOGLE INC. AND ITS CONTRIBUTORS
 * "AS IS" AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT
 * LIMITED TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR
 * A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL GOOGLE INC.
 * OR ITS CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL,
 * SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT
 * LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE,
 * DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY
 * THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT
 * (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE
 * OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
 */

/**
 * @constructor
 * @implements {WebInspector.SearchScope}
 * @param {WebInspector.Workspace} workspace
 */
WebInspector.ScriptsSearchScope = function(workspace)
{
    // FIXME: Add title once it is used by search controller.
    WebInspector.SearchScope.call(this)
    this._searchId = 0;
    this._workspace = workspace;
}

WebInspector.ScriptsSearchScope.prototype = {
    /**
     * @param {WebInspector.Progress} progress
     * @param {function(boolean)} indexingFinishedCallback
     */
    performIndexing: function(progress, indexingFinishedCallback)
    {
        this.stopSearch();

        function filterOutServiceProjects(project)
        {
            return !project.isServiceProject();
        }

        var projects = this._workspace.projects().filter(filterOutServiceProjects);
        var barrier = new CallbackBarrier();
        var compositeProgress = new WebInspector.CompositeProgress(progress);
        progress.addEventListener(WebInspector.Progress.Events.Canceled, indexingCanceled.bind(this));
        for (var i = 0; i < projects.length; ++i) {
            var project = projects[i];
            var projectProgress = compositeProgress.createSubProgress(project.uiSourceCodes().length);
            project.indexContent(projectProgress, barrier.createCallback());
        }
        barrier.callWhenDone(indexingFinishedCallback.bind(this, true));

        function indexingCanceled()
        {
            indexingFinishedCallback(false);
            progress.done();
        }
    },

    /**
     * @param {WebInspector.SearchConfig} searchConfig
     * @param {WebInspector.Progress} progress
     * @param {function(WebInspector.FileBasedSearchResultsPane.SearchResult)} searchResultCallback
     * @param {function(boolean)} searchFinishedCallback
     */
    performSearch: function(searchConfig, progress, searchResultCallback, searchFinishedCallback)
    {
        this.stopSearch();

        /**
         * @param {WebInspector.Project} project
         */
        function filterOutServiceProjects(project)
        {
            return !project.isServiceProject();
        }
        
        var projects = this._workspace.projects().filter(filterOutServiceProjects);
        var barrier = new CallbackBarrier();
        var compositeProgress = new WebInspector.CompositeProgress(progress);
        for (var i = 0; i < projects.length; ++i) {
            var project = projects[i];
            var projectProgress = compositeProgress.createSubProgress(project.uiSourceCodes().length);
            var callback = barrier.createCallback(searchCallbackWrapper.bind(this, this._searchId, project));
            project.searchInContent(searchConfig.query, !searchConfig.ignoreCase, searchConfig.isRegex, projectProgress, callback);
        }
        barrier.callWhenDone(searchFinishedCallback.bind(this, true));

        /**
         * @param {number} searchId
         * @param {WebInspector.Project} project
         * @param {StringMap} searchMatches
         */
        function searchCallbackWrapper(searchId, project, searchMatches)
        {
            if (searchId !== this._searchId) {
                searchFinishedCallback(false);
                return;
            }
            var paths = searchMatches.keys();
            for (var i = 0; i < paths.length; ++i) {
                var uiSourceCode = project.uiSourceCode(paths[i]);
                var searchResult = new WebInspector.FileBasedSearchResultsPane.SearchResult(uiSourceCode, searchMatches.get(paths[i]));
                searchResultCallback(searchResult);
            }
        }
    },

    stopSearch: function()
    {
        ++this._searchId;
    },

    /**
     * @param {WebInspector.SearchConfig} searchConfig
     */
    createSearchResultsPane: function(searchConfig)
    {
        return new WebInspector.FileBasedSearchResultsPane(searchConfig);
    },

    __proto__: WebInspector.SearchScope.prototype
}
