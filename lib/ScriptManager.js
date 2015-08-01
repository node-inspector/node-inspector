var events = require('events'),
    path = require('path'),
    async = require('async'),
    debug = require('debug')('node-inspector:ScriptManager'),
    semver = require('semver'),
    dataUri = require('strong-data-uri'),
    pathIsAbsolute = require('path-is-absolute'),
    convert = require('./convert.js');

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
  var self = Object.create(ScriptManager.prototype, {
    _sources: { value: {}, writable: true },
    _hidden: { value: config.hidden || [] },
    _frontendClient: { value: session.frontendClient },
    _debuggerClient: { value: session.debuggerClient }
  });
  self._registerDebuggerEventHandlers();
  return self;
}

ScriptManager.prototype = Object.create(events.EventEmitter.prototype, {
  mainAppScript: { value: null, writable: true },

  realMainAppScript: { value: null, writable: true },

  _registerDebuggerEventHandlers: {
    value: function() {
      this._debuggerClient.on(
        'afterCompile',
        this._onAfterCompile.bind(this)
      );
      this._debuggerClient.on(
        'compileError',
        this._onCompileError.bind(this)
      );
    }
  },

  _onAfterCompile: {
    value: function(event) {
      if (!event.script) {
        console.log(
          'Unexpected error: debugger emitted afterCompile event' +
            'with no script data.'
        );
        return;
      }
      this.addScript(event.script);
    }
  },

  _onCompileError: {
    value: function(event) {
      var cb = function() {
        var version = this._debuggerClient.target.nodeVersion;
        if (semver.satisfies(version, '~0.12'))
          // Relative to https://github.com/joyent/node/issues/25266
          this._onAfterCompile(event);
      }.bind(this);

      if (this._debuggerClient.isReady)
        process.nextTick(cb);
      else
        this._debuggerClient.once('connect', cb);
    }
  },

  _isNodeInternal: {
    value: function(scriptName) {
      // node.js internal scripts have no path, just a filename
      // regular scripts have always a full path
      //   (i.e their name contains at least one path separator)
      var isFullPath = /[\/\\]/.test(scriptName);
      return !isFullPath;
    }
  },

  _listAllSources: {
    value: function() {
      var self = this;
      return Object.keys(this._sources).map(function fnSelectValue(key) {
        return self._sources[key];
      });
    }
  },

  isScriptHidden: {
    /**
     * @param {string} scriptPath.
     * @return {boolean}
     */
    value: function(scriptPath) {
      return this._hidden.some(function fnHiddenScriptMatchesPath(r) {
        return r.test(scriptPath);
      });
    }
  },

  resolveScriptById: {
    value: function(id, done) {
      var source = this.findScriptByID(id);

      if (!source) {
        this._requireScriptFromApp(id, done);
      } else {
        process.nextTick(function() {
          done(null, source);
        });
      }
    }
  },

  getScriptSourceById: {
    value: function(id, callback) {
      this._debuggerClient.request(
        'scripts',
        {
          includeSource: true,
          types: 4,
          ids: [id]
        },
        function handleScriptSourceResponse(err, result) {
          if (err) return callback(err);

          // Some modules gets unloaded (?) after they are parsed,
          // e.g. node_modules/express/node_modules/methods/index.js
          // V8 request 'scripts' returns an empty result in such case
          var source = result.length > 0 ? result[0].source : undefined;

          callback(null, source);
        }
      );
    }
  },

  _requireScriptFromApp: {
    value: function(id, done) {
      // NOTE: We can step in this function only if `afterCompile` event is broken
      // This is issue for node v0.12: https://github.com/joyent/node/issues/25266
      this._debuggerClient.request(
        'scripts',
        {
          includeSource: false,
          filter: id
        },
        function(error, scripts) {
          if (error) return done(error);
          if (!scripts[0]) return done(null);

          this.addScript(scripts[0], done);
        }.bind(this)
      );
    }
  },

  findScriptIdByPath: {
    value: function(path) {
      return Object.keys(this._sources).filter(function(key) {
        return this._sources[key].v8name == path;
      }, this)[0];
    }
  },

  findScriptByID: {
    /**
     * @param {string} id script id.
     * @return {{hidden: boolean, path: string, url: string}}
     */
    value: function(id) {
      return this._sources[id];
    }
  },

  addScript: {
    value: function(v8data, done) {
      done = done || function() {};

      var localPath = v8data.name;
      if (this._isMainAppScript(localPath)) {
        v8data.name = localPath = this.realMainAppScript;
      }

      var hidden = this.isScriptHidden(localPath) && localPath != this.mainAppScript;

      var inspectorScriptData = this._doAddScript(v8data, hidden);

      debug('addScript id: %s localPath: %s hidden? %s source? %s',
        v8data.id, localPath, hidden, !!v8data.source);

      if (hidden) return done(null, inspectorScriptData);

      if (this._isNodeInternal(localPath)) {
        this._notifyScriptParsed(inspectorScriptData);
        done(null, inspectorScriptData);
      } else {
        this._getSourceMapUrl(
          v8data.id,
          v8data.source,
          function onGetSourceMapUrlReturn(err, sourceMapUrl) {
            if (err) {
              console.log(
                'Warning: cannot parse SourceMap URL for script %s (id %d). %s',
                localPath,
                v8data.id,
                err);
            }

            debug('sourceMapUrl for script %s:%s is %s', v8data.id, localPath, sourceMapUrl);

            inspectorScriptData.sourceMapURL = sourceMapUrl;

            this._checkInlineSourceMap(inspectorScriptData);
            this._notifyScriptParsed(inspectorScriptData);

            done(null, inspectorScriptData);
          }.bind(this)
        );
      }
    }
  },

  _checkInlineSourceMap: {
    value: function(inspectorScriptData) {
      // Source maps have some issues in different libraries.
      // If source map exposed in inline mode, we can easy fix some potential issues.
      var sourceMapUrl = inspectorScriptData.sourceMapURL;
      if (!sourceMapUrl) return;

      var sourceMap;
      try {
        sourceMap = dataUri.decode(sourceMapUrl).toString();
      } catch (err) {
        return;
      }

      sourceMap = JSON.parse(sourceMap.toString());
      this._checkSourceMapIssues(inspectorScriptData, sourceMap);
      sourceMap = JSON.stringify(sourceMap);

      inspectorScriptData.sourceMapURL = dataUri.encode(sourceMap, 'application/json');
    }
  },

  _checkSourceMapIssues: {
    value: function(inspectorScriptData, sourceMap) {
      var scriptName = inspectorScriptData.url.replace(/^file:\/\/\//, '');
      var scriptOrigin = path.dirname(scriptName);
      fixAbsoluteSourcePaths();
      fixWrongFileName();

      function fixAbsoluteSourcePaths() {
        // Documentation says what source maps can contain absolute paths,
        // but DevTools strictly expects relative paths.
        sourceMap.sources = sourceMap.sources.map(function(source) {
          if (!pathIsAbsolute(source)) return source;

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
    }
  },

  _notifyScriptParsed: {
    value: function(scriptData) {
      this._frontendClient.sendEvent(
        'Debugger.scriptParsed',
        scriptData
      );
    }
  },

  _isMainAppScript: {
    value: function(path) {
      if (!path || !this.mainAppScript) return false;
      if (process.platform == 'win32')
        return this.mainAppScript.toLowerCase() == path.replace(/\//g, '\\').toLowerCase();
      else
        return this.mainAppScript == path;
    }
  },

  normalizeName: {
    value: function(name) {
      if (this._isMainAppScript(name.replace(/^file:\/\/\//, ''))) {
        return convert.v8NameToInspectorUrl(this.mainAppScript);
      }

      return name;
    }
  },

  _doAddScript: {
    value: function(v8data, hidden) {
      var inspectorUrl = convert.v8NameToInspectorUrl(v8data.name);
      var inspectorScriptData = {
        scriptId: String(v8data.id),
        url: inspectorUrl,
        startLine: v8data.lineOffset,
        startColumn: v8data.columnOffset

        /* Properties not set:
         endLine: undefined,
         endColumn: undefined,
         isContentScript: undefined,
         hasSourceURL: undefined,
         */
      };

      var item = {
        hidden: hidden,
        v8name: v8data.name,
        url: inspectorUrl
      };

      this._sources[inspectorScriptData.scriptId] = item;
      return inspectorScriptData;
    }
  },

  _getSourceMapUrl: {
    value: function(scriptId, scriptSource, callback) {
      var getSource;
      if (scriptSource == null) {
        debug('_getSourceMapUrl(%s) - fetching source from V8', scriptId);
        getSource = this.getScriptSourceById.bind(this, scriptId);
      } else {
        debug('_getSourceMapUrl(%s) - using the suplied source', scriptId);
        getSource = function(cb) { cb(null, scriptSource); };
      }

      async.waterfall(
        [
          getSource,
          this._parseSourceMapUrlFromScriptSource.bind(this)
        ],
        callback
      );
    }
  },

  _parseSourceMapUrlFromScriptSource: {
    value: function(source, callback) {
      var match = SOURCE_MAP_URL_REGEX.exec(source);
      callback(null, match ? match[1] : undefined);
    }
  },

  reset: {
    value: function() {
      this._sources = {};
    }
  }
});

exports.ScriptManager = ScriptManager;
