// Copyright 2014 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

/**
 * @constructor
 */
WebInspector.ContentScriptProjectDecorator = function()
{
    WebInspector.targetManager.addModelListener(WebInspector.RuntimeModel, WebInspector.RuntimeModel.Events.ExecutionContextCreated, this._onContextCreated, this);
    WebInspector.workspace.addEventListener(WebInspector.Workspace.Events.ProjectAdded, this._onProjectAdded, this);
}

/**
 * @param {!WebInspector.Project} project
 * @param {!WebInspector.ExecutionContext} context
 */
WebInspector.ContentScriptProjectDecorator._updateProjectWithExtensionName = function(project, context)
{
    if (project.url().startsWith(context.origin))
        project.setDisplayName(context.name);
}

WebInspector.ContentScriptProjectDecorator.prototype = {
    /**
     * @param {!WebInspector.Event} event
     */
    _onContextCreated: function(event)
    {
        var context = /** @type {!WebInspector.ExecutionContext} */(event.data);
        if (!context.origin || !context.name)
            return;

        var projects = WebInspector.workspace.projects();
        projects = projects.filter(contentProjectWithName);

        for (var i = 0; i < projects.length; ++i)
            WebInspector.ContentScriptProjectDecorator._updateProjectWithExtensionName(projects[i], context);

        /**
         * @param {!WebInspector.Project} project
         * @return {boolean}
         */
        function contentProjectWithName(project)
        {
           return !!project.url() && project.type() === WebInspector.projectTypes.ContentScripts;
        }
    },

    /**
     * @param {!WebInspector.Event} event
     */
    _onProjectAdded: function(event)
    {
        var project = /** @type {!WebInspector.Project} */(event.data);
        if (project.type() !== WebInspector.projectTypes.ContentScripts)
            return;

        var targets = WebInspector.targetManager.targets();
        var contexts = [];
        for (var i = 0; i < targets.length; ++i)
            contexts = contexts.concat(targets[i].runtimeModel.executionContexts());
        contexts = contexts.filter(contextWithOriginAndName);

        for (var i = 0; i < contexts.length; ++i)
            WebInspector.ContentScriptProjectDecorator._updateProjectWithExtensionName(project, contexts[i]);

        /**
         * @param {!WebInspector.ExecutionContext} context
         * @return {boolean}
         */
        function contextWithOriginAndName(context)
        {
            return !!context.origin && !!context.name;
        }
    }
}