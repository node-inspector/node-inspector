// node-inspector version of on webkit-inspector/InspectorPageAgent.cpp
var fs = require('fs'),
  path = require('path'),
  inherits = require('util').inherits,
  extend = require('util')._extend,
  EventEmitter = require('events').EventEmitter,
  async = require('async'),
  convert = require('./convert.js'),
  ScriptFileStorage = require('./ScriptFileStorage.js').ScriptFileStorage;


/**
 * @param {{preload}} config
 * @param {DebuggerClient} debuggerClient
 * @param {ScriptManager} scriptManager
 * @constructor
 */
function PageAgent(config, session) {
  this._session = session;
  this._debuggerClient = session.debuggerClient;
  this._scriptManager = session.scriptManager;
  this._scriptStorage = new ScriptFileStorage(config, session);
}

inherits(PageAgent, EventEmitter);

extend(PageAgent.prototype, {
  enable: function(params, done) {
    done();
  },

  canEmulate: function(params, done) {
    done(null, { result: false });
  },

  canScreencast: function(params, done) {
    done(null, { result: false });
  },

  setTouchEmulationEnabled: function(params, done) {
    done();
  },

  getResourceTree: function(params, done) {
    var cb = function() {
      done.apply(null, arguments);
      this._session.emit('resource-tree-resolved');
    }.bind(this);

    if (this._debuggerClient.isReady) {
      this._doGetResourceTree(params, cb);
    } else {
      this._debuggerClient.once(
        'connect',
        this._doGetResourceTree.bind(this, params, cb)
      );
    }
  },

  _doGetResourceTree: function(params, done) {
    var cwd = this._debuggerClient.target.cwd;
    var filename = this._debuggerClient.target.filename;
    async.waterfall(
      [
        this._resolveMainAppScript.bind(this, cwd, filename),
        this._getResourceTreeForAppScript.bind(this, this._debuggerClient.target)
      ],
      done
    );
  },

  _resolveMainAppScript: function(startDirectory, mainAppScript, done) {
    this._scriptManager.mainAppScript = mainAppScript;
    if (mainAppScript == null) {
      // mainScriptFile is null when running in the REPL mode
      return done(null, startDirectory, mainAppScript);
    }

    fs.stat(mainAppScript, function(err, stat) {
      if (err && !/\.js$/.test(mainAppScript)) {
        mainAppScript += '.js';
      }

      if (process.platform !== 'win32') {
        this._scriptManager.realMainAppScript = mainAppScript;
        return done(null, startDirectory, mainAppScript);
      }

      var dirname = path.dirname(mainAppScript);
      var basename = path.basename(mainAppScript);

      fs.readdir(dirname, function(err, files) {
        var realBaseName = files.filter(function(filename) {
          return filename.toLowerCase() == basename.toLowerCase();
        })[0];

        mainAppScript = path.join(dirname, realBaseName);
        this._scriptManager.realMainAppScript = mainAppScript;

        return done(null, startDirectory, mainAppScript);
      }.bind(this));
    }.bind(this));
  },

  _getResourceTreeForAppScript: function(target, startDirectory, mainAppScript, done) {
    async.waterfall(
      [
        this._scriptStorage.findAllApplicationScripts
          .bind(this._scriptStorage, startDirectory, mainAppScript),
        this._createResourceTreeResponse.bind(this, target, mainAppScript)
      ],
      done
    );
  },

  _createResourceTreeResponse: function(target, mainAppScript, scriptFiles, done) {
    var resources = scriptFiles.map(function(filePath) {
      return {
        url: convert.v8NameToInspectorUrl(filePath),
        type: 'Script',
        mimeType: 'text/javascript'
      };
    });

    done(null, {
      frameTree: {
        frame: {
          id: 'nodeinspector-toplevel-frame',
          url: convert.v8NameToInspectorUrl(mainAppScript),
          securityOrigin: 'node-inspector',

          // Front-end keeps a history of local modifications based
          // on loaderId. Ideally we should return such id that it remains
          // same as long as the the debugger process has the same content
          // of scripts and that changes when a new content is loaded.
          loaderId: target.pid,
          _isNodeInspectorScript: true
        },
        resources: resources
      }
    });
  },

  getResourceContent: function(params, done) {
    var scriptName = convert.inspectorUrlToV8Name(params.url,
      this._scriptManager.normalizeName.bind(this._scriptManager));

    if (scriptName === '') {
      // When running REPL, main application file is null
      // and node inspector returns an empty string to the front-end.
      // However, front-end still asks for resource content.
      // Let's return a descriptive comment then.
      var content = '// There is no main module loaded in node.\n' +
        '// This is expected when you are debugging node\'s interactive REPL console.';

      return process.nextTick(
        this._convertScriptSourceToGetResourceResponse.bind(this, content, done));
    }

    async.waterfall(
      [
        this._scriptStorage.load.bind(this._scriptStorage, scriptName),
        this._convertScriptSourceToGetResourceResponse.bind(this)
      ],
      done
    );
  },

  _convertScriptSourceToGetResourceResponse: function(source, done) {
    return done(null, {
      content: source
    });
  },

  reload: function(params, done) {
    // This is called when user press Cmd+R (F5?), do we want to perform an action on this?
    done();
  }
});

exports.PageAgent = PageAgent;
