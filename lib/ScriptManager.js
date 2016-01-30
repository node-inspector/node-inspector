'use strict';

var co = require('co');
var fs = require('fs');
var inherits = require('util').inherits;
var EventEmitter = require('events');
var path = require('path');
var debug = require('debug')('node-inspector:ScriptManager');
var dataUri = require('strong-data-uri');
var promisify = require('bluebird').promisify;
var pathIsAbsolute = require('path-is-absolute');
var convert = require('./convert.js');

var stat = promisify(fs.stat);
var readdir = promisify(fs.readdir);

// see Blink inspector > ContentSearchUtils.cpp > findMagicComment()
var SOURCE_MAP_URL_REGEX = /\/\/[@#][ \t]sourceMappingURL=[ \t]*([^\s'"]*)[ \t]*$/m;

/**
 * @param {{hidden}} config
 * @param {FrontendClient} frontendClient
 * @param {DebuggerClient} debuggerClient
 * @constructor
 */
function ScriptManager(config, session) {
  config = config || {};

  this._mainAppScript = null;
  this._realMainAppScript = null;

  this._sources = {};
  this._hidden = config.hidden || [];
  this._frontendClient = session.frontendClient;
  this._debuggerClient = session.debuggerClient;

  this._debuggerClient.on('afterCompile', this._onAfterCompile.bind(this));
}
inherits(ScriptManager, EventEmitter);

ScriptManager.prototype.mainAppScript = function() {
  if (this._mainAppScript instanceof Promise) return this._mainAppScript;

  return this._mainAppScript = co(function * () {
    var target = yield this._debuggerClient.target();
    var mainAppScript = target.filename;

    if (!mainAppScript) return '';

    try {
      yield stat(mainAppScript);
    } catch (e) {
      if (!/\.js$/.test(mainAppScript)) mainAppScript += '.js';
    }

    return mainAppScript;
  }.bind(this));
};

ScriptManager.prototype.realMainAppScript = function() {
  if (this._realMainAppScript instanceof Promise) return this._realMainAppScript;

  return this._realMainAppScript = co(function * () {
    var mainAppScript = yield this.mainAppScript();

    if (process.platform !== 'win32') return mainAppScript;

    // Find case sensitive name
    var dirname = path.dirname(mainAppScript);
    var base = path.basename(mainAppScript);

    var files = yield readdir(dirname);
    var realBaseName = files.filter(name => name.toLowerCase() == name.toLowerCase())[0];

    return path.join(dirname, realBaseName);
  }.bind(this));
};

ScriptManager.prototype._onAfterCompile = function(event) {
  if (!event.script) {
    console.log(
      'Unexpected error: debugger emitted afterCompile event with no script data.');
    return;
  }
  this.addScript(event.script);
};

ScriptManager.prototype._isNodeInternal = function(scriptName) {
  if (!scriptName) return true;

  // node.js internal scripts have no path, just a filename
  // regular scripts have always a full path
  //   (i.e their name contains at least one path separator)
  var isFullPath = /[\/\\]/.test(scriptName);
  return !isFullPath;
};

ScriptManager.prototype._listAllSources = function() {
  return Object.keys(this._sources).map(key => this._sources[key]);
};

/**
 * @param {string} scriptPath.
 * @return {boolean}
 */
ScriptManager.prototype.isScriptHidden = function(scriptPath) {
  return this._hidden.some(rx => rx.test(scriptPath));
};

ScriptManager.prototype.resolveScriptById = function(id) {
  return co(function * () {
    var source = this.findScriptByID(id);
    if (!source)
      source = yield this._requireScriptFromApp(id);

    return source;
  }.bind(this));
};

ScriptManager.prototype.getScriptSourceById = function(id) {
  return co(function * () {
    var result = yield this._debuggerClient.request('scripts', {
      includeSource: true,
      types: 4,
      ids: [id]
    });

    // Some modules gets unloaded (?) after they are parsed,
    // e.g. node_modules/express/node_modules/methods/index.js
    // V8 request 'scripts' returns an empty result in such case
    var source = result.length > 0 ? result[0].source : undefined;

    return source;
  }.bind(this));
};

ScriptManager.prototype._requireScriptFromApp = function(id) {
  return co(function * () {
    // NOTE: We can step in this function only if `afterCompile` event is broken
    // This is issue for node v0.12: https://github.com/joyent/node/issues/25266
    var scripts = yield this._debuggerClient.request('scripts', {
      includeSource: false,
      filter: id
    });

    if (!scripts[0]) return;

    return yield this.addScript(scripts[0]);
  }.bind(this));
};

ScriptManager.prototype.findScriptIdByPath = function(path) {
  return Object.keys(this._sources)
    .filter(key => this._sources[key].v8name == path)[0];
};

/**
 * @param {string} id script id.
 * @return {{hidden: boolean, path: string, url: string}}
 */
ScriptManager.prototype.findScriptByID = function(id) {
  return this._sources[id];
};

ScriptManager.prototype.addScript = function(v8data) {
  return co(function * () {
    var localPath = v8data.name;
    var mainAppScript = yield this.mainAppScript();
    if (this._isMainAppScript(mainAppScript, localPath)) {
      v8data.name = localPath = yield this.realMainAppScript();
    }

    var hidden = this.isScriptHidden(localPath) && localPath != mainAppScript;

    var inspectorScriptData = this._doAddScript(v8data, hidden);

    debug('addScript id: %s localPath: %s hidden? %s source? %s',
      v8data.id, localPath, hidden, !!v8data.source);

    if (!inspectorScriptData.isInternalScript) {
      var sourceMapUrl;
      try {
        sourceMapUrl = yield this._getSourceMapUrl(v8data.id, v8data.source);
      } catch (e) {
        console.log(
          'Warning: cannot parse SourceMap URL for script %s (id %d). %s',
          localPath, v8data.id, e);
      }

      debug('sourceMapUrl for script %s:%s is %s', v8data.id, localPath, sourceMapUrl);

      inspectorScriptData.sourceMapURL = sourceMapUrl;

      this._checkInlineSourceMap(inspectorScriptData);
    }

    if (!hidden) this._notifyScriptParsed(inspectorScriptData);

    return inspectorScriptData;
  }.bind(this));
};

ScriptManager.prototype._checkInlineSourceMap = function(inspectorScriptData) {
  // Source maps have some issues in different libraries.
  // If source map exposed in inline mode, we can easy fix some potential issues.
  var sourceMapUrl = inspectorScriptData.sourceMapURL;
  if (!sourceMapUrl) return;

  var sourceMap;
  try {
    sourceMap = dataUri.decode(sourceMapUrl).toString();
  } catch (err) { return; }

  sourceMap = JSON.parse(sourceMap.toString());
  this._checkSourceMapIssues(inspectorScriptData, sourceMap);
  sourceMap = JSON.stringify(sourceMap);

  inspectorScriptData.sourceMapURL = dataUri.encode(sourceMap, 'application/json');
};


ScriptManager.prototype._checkSourceMapIssues = function(inspectorScriptData, sourceMap) {
  var scriptName = inspectorScriptData.url.replace(/^file:\/\/\//, '');
  var scriptOrigin = path.dirname(scriptName);
  fixAbsoluteSourcePaths();
  fixWrongFileName();

  function fixAbsoluteSourcePaths() {
    // Documentation says what source maps can contain absolute paths,
    // but DevTools strictly expects relative paths.
    sourceMap.sources = sourceMap.sources.map(function(source) {
      if (!path.isAbsolute(source)) return source;

      return path.relative(scriptOrigin, source);
    });
  }

  function fixWrongFileName() {
    // Documentation says nothing about file name of bundled script.
    // So, we expect a situation, when original source and bundled script have equal name.
    // We need to fix this case.
    sourceMap.sources = sourceMap.sources.map(function(source) {
      var sourceUrl = path.resolve(scriptOrigin, source).replace(/\\/g, '/');
      if (sourceUrl == scriptName) source += '.source';

      return source;
    });
  }
};

ScriptManager.prototype._notifyScriptParsed = function(scriptData) {
  this._frontendClient.emitEvent('Debugger.scriptParsed', scriptData);
};

ScriptManager.prototype._isMainAppScript = function(mainAppScript, path) {
  if (!path || !mainAppScript) return false;
  if (process.platform == 'win32')
    return mainAppScript.toLowerCase() == path.replace(/\//g, '\\').toLowerCase();
  else
    return mainAppScript == path;
};

ScriptManager.prototype.normalizeName = function(name) {
  return co(function * () {
    var mainAppScript = yield this.mainAppScript();
    var inspectorMainAppScript = convert.v8NameToInspectorUrl(mainAppScript);

    if (this._isMainAppScript(inspectorMainAppScript, name))
      return inspectorMainAppScript;

    return name;
  }.bind(this));
};

ScriptManager.prototype._doAddScript = function(v8data, hidden) {
  var inspectorUrl = convert.v8NameToInspectorUrl(v8data.name);
  var isInternalScript = this._isNodeInternal(v8data.name);

  var inspectorScriptData = {
    scriptId: String(v8data.id),
    url: inspectorUrl,
    startLine: v8data.lineOffset,
    startColumn: v8data.columnOffset,
    isInternalScript: isInternalScript
  };

  var item = {
    internal: isInternalScript,
    hidden: hidden,
    v8name: v8data.name,
    url: inspectorUrl
  };

  this._sources[inspectorScriptData.scriptId] = item;
  return inspectorScriptData;
};

ScriptManager.prototype._getSourceMapUrl = function(scriptId, scriptSource) {
  return co(function * () {
    if (scriptSource == null)
      scriptSource = yield this.getScriptSourceById(scriptId);

    return this._parseSourceMapUrlFromScriptSource(scriptSource);
  }.bind(this));
};

ScriptManager.prototype._parseSourceMapUrlFromScriptSource = function(source) {
  var match = SOURCE_MAP_URL_REGEX.exec(source);
  return match ? match[1] : undefined;
};

ScriptManager.prototype.reset = function() {
  this._sources = {};
};

module.exports = ScriptManager;
module.exports.ScriptManager = ScriptManager;
