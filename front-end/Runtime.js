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

// This gets all concatenated module descriptors in the release mode.
var allDescriptors = [];
var applicationDescriptor;
var _loadedScripts = {};

/**
 * @param {string} url
 * @return {!Promise.<string>}
 */
function loadResourcePromise(url)
{
    return new Promise(load);

    /**
     * @param {function(?)} fulfill
     * @param {function(*)} reject
     */
    function load(fulfill, reject)
    {
        var xhr = new XMLHttpRequest();
        xhr.open("GET", url, true);
        xhr.onreadystatechange = onreadystatechange;

        /**
         * @param {Event} e
         */
        function onreadystatechange(e)
        {
            if (xhr.readyState !== 4)
                return;

            if ([0, 200, 304].indexOf(xhr.status) === -1)  // Testing harness file:/// results in 0.
                reject(new Error("While loading from url " + url + " server responded with a status of " + xhr.status));
            else
                fulfill(e.target.response);
        }
        xhr.send(null);
    }
}

/**
 * http://tools.ietf.org/html/rfc3986#section-5.2.4
 * @param {string} path
 * @return {string}
 */
function normalizePath(path)
{
    if (path.indexOf("..") === -1 && path.indexOf('.') === -1)
        return path;

    var normalizedSegments = [];
    var segments = path.split("/");
    for (var i = 0; i < segments.length; i++) {
        var segment = segments[i];
        if (segment === ".")
            continue;
        else if (segment === "..")
            normalizedSegments.pop();
        else if (segment)
            normalizedSegments.push(segment);
    }
    var normalizedPath = normalizedSegments.join("/");
    if (normalizedPath[normalizedPath.length - 1] === "/")
        return normalizedPath;
    if (path[0] === "/" && normalizedPath)
        normalizedPath = "/" + normalizedPath;
    if ((path[path.length - 1] === "/") || (segments[segments.length - 1] === ".") || (segments[segments.length - 1] === ".."))
        normalizedPath = normalizedPath + "/";

    return normalizedPath;
}

/**
 * @param {!Array.<string>} scriptNames
 * @return {!Promise.<undefined>}
 */
function loadScriptsPromise(scriptNames)
{
    /** @type {!Array.<!Promise.<string>>} */
    var promises = [];
    /** @type {!Array.<string>} */
    var urls = [];
    var sources = new Array(scriptNames.length);
    var scriptToEval = 0;
    for (var i = 0; i < scriptNames.length; ++i) {
        var scriptName = scriptNames[i];
        var sourceURL = self._importScriptPathPrefix + scriptName;
        var schemaIndex = sourceURL.indexOf("://") + 3;
        sourceURL = sourceURL.substring(0, schemaIndex) + normalizePath(sourceURL.substring(schemaIndex));
        if (_loadedScripts[sourceURL])
            continue;
        urls.push(sourceURL);
        promises.push(loadResourcePromise(sourceURL).then(scriptSourceLoaded.bind(null, i), scriptSourceLoaded.bind(null, i, undefined)));
    }
    return Promise.all(promises).then(undefined);

    /**
     * @param {number} scriptNumber
     * @param {string=} scriptSource
     */
    function scriptSourceLoaded(scriptNumber, scriptSource)
    {
        sources[scriptNumber] = scriptSource || "";
        // Eval scripts as fast as possible.
        while (typeof sources[scriptToEval] !== "undefined") {
            evaluateScript(urls[scriptToEval], sources[scriptToEval]);
            ++scriptToEval;
        }
    }

    /**
     * @param {string} sourceURL
     * @param {string=} scriptSource
     */
    function evaluateScript(sourceURL, scriptSource)
    {
        _loadedScripts[sourceURL] = true;
        if (!scriptSource) {
            // Do not reject, as this is normal in the hosted mode.
            console.error("Empty response arrived for script '" + sourceURL + "'");
            return;
        }
        self.eval(scriptSource + "\n//# sourceURL=" + sourceURL);
    }
}

(function() {
    var baseUrl = self.location ? self.location.origin + self.location.pathname : "";
    self._importScriptPathPrefix = baseUrl.substring(0, baseUrl.lastIndexOf("/") + 1);
})();

/**
 * @constructor
 * @param {!Array.<!Runtime.ModuleDescriptor>} descriptors
 * @param {!Array.<string>=} coreModuleNames
 */
function Runtime(descriptors, coreModuleNames)
{
    /**
     * @type {!Array.<!Runtime.Module>}
     */
    this._modules = [];
    /**
     * @type {!Object.<string, !Runtime.Module>}
     */
    this._modulesMap = {};
    /**
     * @type {!Array.<!Runtime.Extension>}
     */
    this._extensions = [];

    /**
     * @type {!Object.<string, !function(new:Object)>}
     */
    this._cachedTypeClasses = {};

    /**
     * @type {!Object.<string, !Runtime.ModuleDescriptor>}
     */
    this._descriptorsMap = {};

    for (var i = 0; i < descriptors.length; ++i)
        this._registerModule(descriptors[i]);
    if (coreModuleNames)
        this._loadAutoStartModules(coreModuleNames).catch(Runtime._reportError);
}

/**
 * @type {!Object.<string, string>}
 */
Runtime._queryParamsObject = { __proto__: null };

/**
 * @type {!Object.<string, string>}
 */
Runtime.cachedResources = { __proto__: null };

/**
 * @return {boolean}
 */
Runtime.isReleaseMode = function()
{
    return !!allDescriptors.length;
}

/**
 * @param {string} appName
 */
Runtime.startApplication = function(appName)
{
    console.timeStamp("Runtime.startApplication");

    var allDescriptorsByName = {};
    for (var i = 0; Runtime.isReleaseMode() && i < allDescriptors.length; ++i) {
        var d = allDescriptors[i];
        allDescriptorsByName[d["name"]] = d;
    }

    var applicationPromise;
    if (applicationDescriptor)
        applicationPromise = Promise.resolve(applicationDescriptor);
    else
        applicationPromise = loadResourcePromise(appName + ".json").then(JSON.parse.bind(JSON));

    applicationPromise.then(parseModuleDescriptors);

    /**
     * @param {!Array.<!Object>} configuration
     */
    function parseModuleDescriptors(configuration)
    {
        var moduleJSONPromises = [];
        var coreModuleNames = [];
        for (var i = 0; i < configuration.length; ++i) {
            var descriptor = configuration[i];
            if (descriptor["type"] === "worker")
                continue;
            var name = descriptor["name"];
            var moduleJSON = allDescriptorsByName[name];
            if (moduleJSON)
                moduleJSONPromises.push(Promise.resolve(moduleJSON));
            else
                moduleJSONPromises.push(loadResourcePromise(name + "/module.json").then(JSON.parse.bind(JSON)));
            if (descriptor["type"] === "autostart")
                coreModuleNames.push(name);
        }

        Promise.all(moduleJSONPromises).then(instantiateRuntime).catch(Runtime._reportError);
        /**
         * @param {!Array.<!Object>} moduleDescriptors
         */
        function instantiateRuntime(moduleDescriptors)
        {
            for (var i = 0; !Runtime.isReleaseMode() && i < moduleDescriptors.length; ++i)
                moduleDescriptors[i]["name"] = configuration[i]["name"];
            self.runtime = new Runtime(moduleDescriptors, coreModuleNames);
        }
    }
}

/**
 * @param {string} name
 * @return {?string}
 */
Runtime.queryParam = function(name)
{
    return Runtime._queryParamsObject[name] || null;
}

/**
 * @param {!Array.<string>} banned
 * @return {string}
 */
Runtime.constructQueryParams = function(banned)
{
    var params = [];
    for (var key in Runtime._queryParamsObject) {
        if (!key || banned.indexOf(key) !== -1)
            continue;
        params.push(key + "=" + Runtime._queryParamsObject[key]);
    }
    return params.length ? "?" + params.join("&") : "";
}

/**
 * @return {!Object}
 */
Runtime._experimentsSetting = function()
{
    try {
        return /** @type {!Object} */ (JSON.parse(self.localStorage && self.localStorage["experiments"] ? self.localStorage["experiments"] : "{}"));
    } catch (e) {
        console.error("Failed to parse localStorage['experiments']");
        return {};
    }
}

/**
 * @param {!Array.<!Promise.<T, !Error>>} promises
 * @return {!Promise.<!Array.<T>>}
 * @template T
 */
Runtime._some = function(promises)
{
    var all = [];
    var wasRejected = [];
    for (var i = 0; i < promises.length; ++i) {
        // Workaround closure compiler bug.
        var handlerFunction = /** @type {function()} */ (handler.bind(promises[i], i));
        all.push(promises[i].catch(handlerFunction));
    }

    return Promise.all(all).then(filterOutFailuresResults);

    /**
     * @param {!Array.<T>} results
     * @return {!Array.<T>}
     * @template T
     */
    function filterOutFailuresResults(results)
    {
        var filtered = [];
        for (var i = 0; i < results.length; ++i) {
            if (!wasRejected[i])
                filtered.push(results[i]);
        }
        return filtered;
    }

    /**
     * @this {!Promise}
     * @param {number} index
     * @param {!Error} e
     */
    function handler(index, e)
    {
        wasRejected[index] = true;
        console.error(e.stack);
    }
}

Runtime._console = console;
Runtime._originalAssert = console.assert;
Runtime._assert = function(value, message)
{
    if (value)
        return;
    Runtime._originalAssert.call(Runtime._console, value, message);
}

/**
 * @param {*} e
 */
Runtime._reportError = function(e)
{
    if (e instanceof Error)
        console.error(e.stack);
    else
        console.error(e);
}

Runtime.prototype = {

    /**
     * @param {!Runtime.ModuleDescriptor} descriptor
     */
    _registerModule: function(descriptor)
    {
        var module = new Runtime.Module(this, descriptor);
        this._modules.push(module);
        this._modulesMap[descriptor["name"]] = module;
    },

    /**
     * @param {string} moduleName
     * @return {!Promise.<undefined>}
     */
    loadModulePromise: function(moduleName)
    {
        return this._modulesMap[moduleName]._loadPromise();
    },

    /**
     * @param {!Array.<string>} moduleNames
     * @return {!Promise.<!Array.<*>>}
     */
    _loadAutoStartModules: function(moduleNames)
    {
        var promises = [];
        for (var i = 0; i < moduleNames.length; ++i) {
            if (Runtime.isReleaseMode())
                this._modulesMap[moduleNames[i]]._loaded = true;
            else
                promises.push(this.loadModulePromise(moduleNames[i]));
        }
        return Promise.all(promises);
    },

    /**
     * @param {!Runtime.Extension} extension
     * @param {?function(function(new:Object)):boolean} predicate
     * @return {boolean}
     */
    _checkExtensionApplicability: function(extension, predicate)
    {
        if (!predicate)
            return false;
        var contextTypes = /** @type {!Array.<string>|undefined} */ (extension.descriptor().contextTypes);
        if (!contextTypes)
            return true;
        for (var i = 0; i < contextTypes.length; ++i) {
            var contextType = this._resolve(contextTypes[i]);
            var isMatching = !!contextType && predicate(contextType);
            if (isMatching)
                return true;
        }
        return false;
    },

    /**
     * @param {!Runtime.Extension} extension
     * @param {?Object} context
     * @return {boolean}
     */
    isExtensionApplicableToContext: function(extension, context)
    {
        if (!context)
            return true;
        return this._checkExtensionApplicability(extension, isInstanceOf);

        /**
         * @param {!Function} targetType
         * @return {boolean}
         */
        function isInstanceOf(targetType)
        {
            return context instanceof targetType;
        }
    },

    /**
     * @param {!Runtime.Extension} extension
     * @param {!Set.<!Function>=} currentContextTypes
     * @return {boolean}
     */
    isExtensionApplicableToContextTypes: function(extension, currentContextTypes)
    {
        if (!extension.descriptor().contextTypes)
            return true;

        return this._checkExtensionApplicability(extension, currentContextTypes ? isContextTypeKnown : null);

        /**
         * @param {!Function} targetType
         * @return {boolean}
         */
        function isContextTypeKnown(targetType)
        {
            return currentContextTypes.has(targetType);
        }
    },

    /**
     * @param {*} type
     * @param {?Object=} context
     * @return {!Array.<!Runtime.Extension>}
     */
    extensions: function(type, context)
    {
        return this._extensions.filter(filter).sort(orderComparator);

        /**
         * @param {!Runtime.Extension} extension
         * @return {boolean}
         */
        function filter(extension)
        {
            if (extension._type !== type && extension._typeClass() !== type)
                return false;
            var activatorExperiment = extension.descriptor()["experiment"];
            if (activatorExperiment && !Runtime.experiments.isEnabled(activatorExperiment))
                return false;
            activatorExperiment = extension._module._descriptor["experiment"];
            if (activatorExperiment && !Runtime.experiments.isEnabled(activatorExperiment))
                return false;
            return !context || extension.isApplicable(context);
        }

        /**
         * @param {!Runtime.Extension} extension1
         * @param {!Runtime.Extension} extension2
         * @return {number}
         */
        function orderComparator(extension1, extension2)
        {
            var order1 = extension1.descriptor()["order"] || 0;
            var order2 = extension2.descriptor()["order"] || 0;
            return order1 - order2;
        }
    },

    /**
     * @param {*} type
     * @param {?Object=} context
     * @return {?Runtime.Extension}
     */
    extension: function(type, context)
    {
        return this.extensions(type, context)[0] || null;
    },

    /**
     * @param {*} type
     * @param {?Object=} context
     * @return {!Promise.<!Array.<!Object>>}
     */
    instancesPromise: function(type, context)
    {
        var extensions = this.extensions(type, context);
        var promises = [];
        for (var i = 0; i < extensions.length; ++i)
            promises.push(extensions[i].instancePromise());
        return Runtime._some(promises);
    },

    /**
     * @param {*} type
     * @param {?Object=} context
     * @return {!Promise.<!Object>}
     */
    instancePromise: function(type, context)
    {
        var extension = this.extension(type, context);
        if (!extension)
            return Promise.reject(new Error("No such extension: " + type + " in given context."));
        return extension.instancePromise();
    },

    /**
     * @return {?function(new:Object)}
     */
    _resolve: function(typeName)
    {
        if (!this._cachedTypeClasses[typeName]) {
            var path = typeName.split(".");
            var object = window;
            for (var i = 0; object && (i < path.length); ++i)
                object = object[path[i]];
            if (object)
                this._cachedTypeClasses[typeName] = /** @type function(new:Object) */(object);
        }
        return this._cachedTypeClasses[typeName] || null;
    }
}

/**
 * @constructor
 */
Runtime.ModuleDescriptor = function()
{
    /**
     * @type {string}
     */
    this.name;

    /**
     * @type {!Array.<!Runtime.ExtensionDescriptor>}
     */
    this.extensions;

    /**
     * @type {!Array.<string>|undefined}
     */
    this.dependencies;

    /**
     * @type {!Array.<string>}
     */
    this.scripts;
}

/**
 * @constructor
 */
Runtime.ExtensionDescriptor = function()
{
    /**
     * @type {string}
     */
    this.type;

    /**
     * @type {string|undefined}
     */
    this.className;

    /**
     * @type {!Array.<string>|undefined}
     */
    this.contextTypes;
}

/**
 * @constructor
 * @param {!Runtime} manager
 * @param {!Runtime.ModuleDescriptor} descriptor
 */
Runtime.Module = function(manager, descriptor)
{
    this._manager = manager;
    this._descriptor = descriptor;
    this._name = descriptor.name;
    /** @type {!Object.<string, ?Object>} */
    this._instanceMap = {};
    var extensions = /** @type {?Array.<!Runtime.ExtensionDescriptor>} */ (descriptor.extensions);
    for (var i = 0; extensions && i < extensions.length; ++i)
        this._manager._extensions.push(new Runtime.Extension(this, extensions[i]));
    this._loaded = false;
}

Runtime.Module.prototype = {
    /**
     * @return {string}
     */
    name: function()
    {
        return this._name;
    },

    /**
     * @return {!Promise.<undefined>}
     */
    _loadPromise: function()
    {
        if (this._loaded)
            return Promise.resolve();

        if (this._pendingLoadPromise)
            return this._pendingLoadPromise;

        var dependencies = this._descriptor.dependencies;
        var dependencyPromises = [];
        for (var i = 0; dependencies && i < dependencies.length; ++i)
            dependencyPromises.push(this._manager._modulesMap[dependencies[i]]._loadPromise());

        this._pendingLoadPromise = Promise.all(dependencyPromises)
            .then(this._loadStylesheets.bind(this))
            .then(this._loadScripts.bind(this))
            .then(markAsLoaded.bind(this));

        return this._pendingLoadPromise;

        /**
         * @this {Runtime.Module}
         */
        function markAsLoaded()
        {
            delete this._pendingLoadPromise;
            this._loaded = true;
        }
    },

    /**
     * @return {!Promise.<undefined>}
     * @this {Runtime.Module}
     */
    _loadStylesheets: function()
    {
        var stylesheets = this._descriptor["stylesheets"];
        if (!stylesheets)
            return Promise.resolve();
        var promises = [];
        for (var i = 0; i < stylesheets.length; ++i) {
            var url = this._modularizeURL(stylesheets[i]);
            promises.push(loadResourcePromise(url).then(cacheStylesheet.bind(this, url), cacheStylesheet.bind(this, url, undefined)));
        }
        return Promise.all(promises).then(undefined);

        /**
         * @param {string} path
         * @param {string=} content
         */
        function cacheStylesheet(path, content)
        {
            if (!content) {
                console.error("Failed to load stylesheet: " + path);
                return;
            }
            var sourceURL = window.location.href;
            if (window.location.search)
                sourceURL.replace(window.location.search, "");
            sourceURL = sourceURL.substring(0, sourceURL.lastIndexOf("/") + 1) + path;
            Runtime.cachedResources[path] = content + "\n/*# sourceURL=" + sourceURL + " */";
        }
    },

    /**
     * @return {!Promise.<undefined>}
     */
    _loadScripts: function()
    {
        if (!this._descriptor.scripts)
            return Promise.resolve();

        if (Runtime.isReleaseMode())
            return loadScriptsPromise([this._name + "_module.js"]);

        return loadScriptsPromise(this._descriptor.scripts.map(this._modularizeURL, this)).catch(Runtime._reportError);
    },

    /**
     * @param {string} resourceName
     */
    _modularizeURL: function(resourceName)
    {
        return normalizePath(this._name + "/" + resourceName);
    },

    /**
     * @param {string} className
     * @return {?Object}
     */
    _instance: function(className)
    {
        if (className in this._instanceMap)
            return this._instanceMap[className];

        var constructorFunction = window.eval(className);
        if (!(constructorFunction instanceof Function)) {
            this._instanceMap[className] = null;
            return null;
        }

        var instance = new constructorFunction();
        this._instanceMap[className] = instance;
        return instance;
    }
}

/**
 * @constructor
 * @param {!Runtime.Module} module
 * @param {!Runtime.ExtensionDescriptor} descriptor
 */
Runtime.Extension = function(module, descriptor)
{
    this._module = module;
    this._descriptor = descriptor;

    this._type = descriptor.type;
    this._hasTypeClass = this._type.charAt(0) === "@";

    /**
     * @type {?string}
     */
    this._className = descriptor.className || null;
}

Runtime.Extension.prototype = {
    /**
     * @return {!Object}
     */
    descriptor: function()
    {
        return this._descriptor;
    },

    /**
     * @return {!Runtime.Module}
     */
    module: function()
    {
        return this._module;
    },

    /**
     * @return {?function(new:Object)}
     */
    _typeClass: function()
    {
        if (!this._hasTypeClass)
            return null;
        return this._module._manager._resolve(this._type.substring(1));
    },

    /**
     * @param {?Object} context
     * @return {boolean}
     */
    isApplicable: function(context)
    {
        return this._module._manager.isExtensionApplicableToContext(this, context);
    },

    /**
     * @return {!Promise.<!Object>}
     */
    instancePromise: function()
    {
        if (!this._className)
            return Promise.reject(new Error("No class name in extension"));
        var className = this._className;
        if (this._instance)
            return Promise.resolve(this._instance);

        return this._module._loadPromise().then(constructInstance.bind(this));

        /**
         * @return {!Object}
         * @this {Runtime.Extension}
         */
        function constructInstance()
        {
            var result = this._module._instance(className);
            if (!result)
                return Promise.reject("Could not instantiate: " + className);
            return result;
        }
    }
}

/**
 * @constructor
 */
Runtime.ExperimentsSupport = function()
{
    this._supportEnabled = Runtime.queryParam("experiments") !== null;
    this._experiments = [];
    this._experimentNames = {};
    this._enabledTransiently = {};
}

Runtime.ExperimentsSupport.prototype = {
    /**
     * @return {!Array.<!Runtime.Experiment>}
     */
    allConfigurableExperiments: function()
    {
        var result = [];
        for (var i = 0; i < this._experiments.length; i++) {
            var experiment = this._experiments[i];
            if (!this._enabledTransiently[experiment.name])
                result.push(experiment);
        }
        return result;
    },

    /**
     * @return {boolean}
     */
    supportEnabled: function()
    {
        return this._supportEnabled;
    },

    /**
     * @param {!Object} value
     */
    _setExperimentsSetting: function(value)
    {
        if (!self.localStorage)
            return;
        self.localStorage["experiments"] = JSON.stringify(value);
    },

    /**
     * @param {string} experimentName
     * @param {string} experimentTitle
     * @param {boolean=} hidden
     */
    register: function(experimentName, experimentTitle, hidden)
    {
        Runtime._assert(!this._experimentNames[experimentName], "Duplicate registration of experiment " + experimentName);
        this._experimentNames[experimentName] = true;
        this._experiments.push(new Runtime.Experiment(this, experimentName, experimentTitle, !!hidden));
    },

    /**
     * @param {string} experimentName
     * @return {boolean}
     */
    isEnabled: function(experimentName)
    {
        this._checkExperiment(experimentName);

        if (this._enabledTransiently[experimentName])
            return true;
        if (!this.supportEnabled())
            return false;

        return !!Runtime._experimentsSetting()[experimentName];
    },

    /**
     * @param {string} experimentName
     * @param {boolean} enabled
     */
    setEnabled: function(experimentName, enabled)
    {
        this._checkExperiment(experimentName);
        var experimentsSetting = Runtime._experimentsSetting();
        experimentsSetting[experimentName] = enabled;
        this._setExperimentsSetting(experimentsSetting);
    },

    /**
     * @param {!Array.<string>} experimentNames
     */
    setDefaultExperiments: function(experimentNames)
    {
        for (var i = 0; i < experimentNames.length; ++i) {
            this._checkExperiment(experimentNames[i]);
            this._enabledTransiently[experimentNames[i]] = true;
        }
    },

    /**
     * @param {string} experimentName
     */
    enableForTest: function(experimentName)
    {
        this._checkExperiment(experimentName);
        this._enabledTransiently[experimentName] = true;
    },

    cleanUpStaleExperiments: function()
    {
        var experimentsSetting = Runtime._experimentsSetting();
        var cleanedUpExperimentSetting = {};
        for (var i = 0; i < this._experiments.length; ++i) {
            var experimentName = this._experiments[i].name;
            if (experimentsSetting[experimentName])
                cleanedUpExperimentSetting[experimentName] = true;
        }
        this._setExperimentsSetting(cleanedUpExperimentSetting);
    },

    /**
     * @param {string} experimentName
     */
    _checkExperiment: function(experimentName)
    {
        Runtime._assert(this._experimentNames[experimentName], "Unknown experiment " + experimentName);
    }
}

/**
 * @constructor
 * @param {!Runtime.ExperimentsSupport} experiments
 * @param {string} name
 * @param {string} title
 * @param {boolean} hidden
 */
Runtime.Experiment = function(experiments, name, title, hidden)
{
    this.name = name;
    this.title = title;
    this.hidden = hidden;
    this._experiments = experiments;
}

Runtime.Experiment.prototype = {
    /**
     * @return {boolean}
     */
    isEnabled: function()
    {
        return this._experiments.isEnabled(this.name);
    },

    /**
     * @param {boolean} enabled
     */
    setEnabled: function(enabled)
    {
        this._experiments.setEnabled(this.name, enabled);
    }
}

{(function parseQueryParameters()
{
    var queryParams = location.search;
    if (!queryParams)
        return;
    var params = queryParams.substring(1).split("&");
    for (var i = 0; i < params.length; ++i) {
        var pair = params[i].split("=");
        Runtime._queryParamsObject[pair[0]] = pair[1];
    }

    // Patch settings from the URL param (for tests).
    var settingsParam = Runtime.queryParam("settings");
    if (settingsParam) {
        try {
            var settings = JSON.parse(window.decodeURI(settingsParam));
            for (var key in settings)
                window.localStorage[key] = settings[key];
        } catch(e) {
            // Ignore malformed settings.
        }
    }
})();}


// This must be constructed after the query parameters have been parsed.
Runtime.experiments = new Runtime.ExperimentsSupport();

/** @type {!Runtime} */
var runtime;
