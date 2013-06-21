// node-inspector version of on webkit-inspector/InspectorPageAgent.cpp
var fs = require('fs'),
  path = require('path'),
  async = require('async'),
  convert = require('./convert.js'),
  ScriptFileStorage = require('./ScriptFileStorage.js').ScriptFileStorage;


/**
 * @param {DebuggerClient} debuggerClient
 * @constructor
 */
function PageAgent(debuggerClient) {
  this._debuggerClient = debuggerClient;
  this._scriptStorage = new ScriptFileStorage();
}

PageAgent.prototype = {
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
    if (this._debuggerClient.isRunning) {
      this._doGetResourceTree(params, done);
    } else {
      this._debuggerClient.once(
        'connect',
        this._doGetResourceTree.bind(this, params, done)
      );
    }
  },

  _doGetResourceTree: function(params, done) {
    async.waterfall(
      [
        this._debuggerClient.evaluateGlobal
          .bind(this._debuggerClient, '[process.cwd(), process.argv[1]]'),
        function(evaluateResult, cb) {
          cb(null, evaluateResult[0], evaluateResult[1]);
        },
        this._getResourceTreeForAppScript.bind(this)
      ],
      done
    );
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
};

exports.PageAgent = PageAgent;

function createUniqueLoaderId() {
  var randomPart = String(Math.random()).slice(2);
  return Date.now() + '-' + randomPart;
}
