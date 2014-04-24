var events = require('events'),
    async = require('async'),
    debug = require('debug')('node-inspector:ScriptManager'),
    convert = require('./convert.js');

// see Blink inspector > ContentSearchUtils.cpp > findMagicComment()
var SOURCE_MAP_URL_REGEX = /\/\/[@#][ \t]sourceMappingURL=[ \t]*([^\s'"]*)[ \t]*$/m;

/**
 * @param {{hidden}} config
 * @param {FrontendClient} frontendClient
 * @param {DebuggerClient} debuggerClient
 * @constructor
 */
function ScriptManager(config, frontendClient, debuggerClient) {
  config = config || {};
  var self = Object.create(ScriptManager.prototype, {
    _sources: { value: {}, writable: true },
    _hidden: { value: config.hidden || [] },
    _frontendClient: { value: frontendClient },
    _debuggerClient: { value: debuggerClient }
  });
  self._registerDebuggerEventHandlers();
  return self;
}

ScriptManager.prototype = Object.create(events.EventEmitter.prototype, {
  mainAppScript: { value: null, writable: true },

  _registerDebuggerEventHandlers: {
    value: function() {
      this._debuggerClient.on(
        'afterCompile',
        this._onAfterCompile.bind(this)
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
    value: function(v8data) {
      var localPath = v8data.name;
      var hidden = this.isScriptHidden(localPath) && localPath != this.mainAppScript;

      var inspectorScriptData = this._doAddScript(v8data, hidden);

      debug('addScript id: %s localPath: %s hidden? %s source? %s',
        v8data.id, localPath, hidden, !!v8data.source);

      if (hidden || this._isNodeInternal(localPath)) {
        notifyFrontEnd.call(this);
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
            debug('sourceMapUrl for script %s:%s is %s',
              v8data.id, localPath, sourceMapUrl);
            inspectorScriptData.sourceMapURL = sourceMapUrl;
            notifyFrontEnd.call(this);
          }.bind(this)
        );
      }

      function notifyFrontEnd() {
        if (hidden) return;

        this._frontendClient.sendEvent(
          'Debugger.scriptParsed',
          inspectorScriptData
        );
      }
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
        getSource = this._debuggerClient.getScriptSourceById
            .bind(this._debuggerClient, scriptId);
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
