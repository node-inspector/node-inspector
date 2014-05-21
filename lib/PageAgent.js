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
function PageAgent(config, debuggerClient, scriptManager) {
  this._debuggerClient = debuggerClient;
  this._scriptManager = scriptManager;
  this._scriptStorage = new ScriptFileStorage(config, scriptManager);
}

inherits(PageAgent, EventEmitter);

extend(PageAgent.prototype, {
  enable: function(params, done) {
    done();
  },

  canShowFPSCounter: function(params, done) {
    done(null, { show: false });
  },

  canContinuouslyPaint: function(params, done) {
    done(null, { value: false });
  },

  setTouchEmulationEnabled: function(params, done) {
    done();
  },

  getResourceTree: function(params, done) {
    var cb = function() {
      done.apply(null, arguments);
      this.emit('resource-tree');
    }.bind(this);

    if (this._debuggerClient.isConnected) {
      this._doGetResourceTree(params, cb);
    } else {
      this._debuggerClient.once(
        'connect',
        this._doGetResourceTree.bind(this, params, cb)
      );
    }
  },

  _doGetResourceTree: function(params, done) {
    var describeProgram = '[process.cwd(), ' +
      'process.mainModule ? process.mainModule.filename : process.argv[1]]';

    async.waterfall(
      [
        this._debuggerClient.evaluateGlobal
          .bind(this._debuggerClient, describeProgram),
        function(evaluateResult, cb) {
          cb(null, evaluateResult[0], evaluateResult[1]);
        },
        this._resolveMainAppScript.bind(this),
        this._getResourceTreeForAppScript.bind(this)
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
      return done(null, startDirectory, mainAppScript);
    });
  },

  _getResourceTreeForAppScript: function(startDirectory, mainAppScript, done) {
    async.waterfall(
      [
        this._scriptStorage.findAllApplicationScripts
          .bind(this._scriptStorage, startDirectory, mainAppScript),
        this._createResourceTreeResponse.bind(this, mainAppScript)
      ],
      done
    );
  },

  _createResourceTreeResponse: function(mainAppScript, scriptFiles, done) {
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

          // Front-end keeps a history of local modifications based
          // on loaderId. Ideally we should return such id that it remains
          // same as long as the the debugger process has the same content
          // of scripts and that changes when a new content is loaded.
          //
          // To keep things easy, we are returning an unique value for now.
          // This means that every reload of node-inspector page discards
          // the history of live-edit changes.
          //
          // Perhaps we can use PID as loaderId instead?
          loaderId: createUniqueLoaderId(),
          _isNodeInspectorScript: true
        },
        resources: resources
      }
    });
  },

  getResourceContent: function(params, done) {
    var scriptName = convert.inspectorUrlToV8Name(params.url);

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

function createUniqueLoaderId() {
  var randomPart = String(Math.random()).slice(2);
  return Date.now() + '-' + randomPart;
}
