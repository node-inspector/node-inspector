var EventEmitter = require('events').EventEmitter,
    inherits = require('util').inherits,
    async = require('async'),
    util = require('util'),
    debug = require('debug')('node-inspector:injector');

/**
 * @param {{inject}} config
 * @param {DebuggerClient} debuggerClient
 * @constructor
 */
function InjectorClient(config, session) {
  this._noInject = config.inject === false;
  this._injected = false;
  this._appPausedByInjector = false;

  this._debuggerClient = session.debuggerClient;
  this._frontendClient = session.frontendClient;
  this._debuggerClient.on('close', this.close.bind(this));
}

inherits(InjectorClient, EventEmitter);

Object.defineProperties(InjectorClient.prototype, {
  /** @type {boolean} */
  needsInject: {
    get: function() {
      return !this._noInject && !this._injected;
    }
  }
});

/**
 * @param {string} sourceLine
 * @type {boolean}
 */
InjectorClient.prototype.tryHandleDebuggerBreak = function(sourceLine, done) {
  return done(this._appPausedByInjector);
};

/**
 */
InjectorClient.prototype.inject = function(cb) {
  if (typeof cb !== 'function') {
    cb = function(error, result) {};
  }

  var _water = [];

  if (this.needsInject) {
    _water.unshift(
      this._injectRequire.bind(this),
      this._inject.bind(this),
      this._onInjection.bind(this)
    );
  }

  if (this.needsInject && this._debuggerClient.isRunning) {
    _water.unshift(this._pause.bind(this));
    _water.push(this._resume.bind(this));
  }

  async.waterfall(_water, function(error) {
    if (error) {
      this._frontendClient.sendLogToConsole('error', error.toString());
    }
    cb(error);
  }.bind(this));
};

InjectorClient.prototype._pause = function(cb) {
  this._appPausedByInjector = true;
  this._debuggerClient.request('suspend', {}, function() {
    cb();
  });
};

InjectorClient.prototype._resume = function(cb) {
  this._debuggerClient.request('continue', undefined, function() {
    this._appPausedByInjector = false;
    cb();
  }.bind(this));
};

// inject process._require before injecting others.
InjectorClient.prototype._injectRequire = function(cb) {
  var self = this;
  var breakpoint;
  var debuggerClient = this._debuggerClient;

  function handleBreak(obj) {
    if (!(breakpoint && obj.script.id === breakpoint.script_id &&
      obj.breakpoints.indexOf(breakpoint.breakpoint) > -1)) {
      return;
    }

    debuggerClient.removeListener('break', handleBreak);
    debuggerClient.request('evaluate', {
      expression: 'process._require = NativeModule.require',
    }, function(err, res) {
      if (err) {
        cb(err);
      } else {
        debuggerClient.request('clearbreakpoint', {
          breakpoint: breakpoint.breakpoint,
        }, function(err) {
          self._resume(function() {
            cb(err);
          });
        });
      }
    });
  }

  debuggerClient.on('break', handleBreak);

  debuggerClient.request('scripts', {
    includeSource: true,
  }, function(err, res) {
    if (err) {
      err.message = 'request scripts, ' + err.message;
      return cb(err);
    }
    var desc;
    for (var i = 0; i < res.length; i++) {
      var item = res[i];
      var name = item.name;
      if (item.type === 'script' && (name === 'bootstrap_node.js' || name === 'node.js') ) {
        desc = item;
        break;
      }
    }

    var source = desc.source.split('\n');
    var line = -1;
    for(var j = 0; j < source.length; j++) {
      if (/^NativeModule\.require\s*=\s*function/.test(source[j].trim())) {
        line = j;
        break;
      }
    }

    self._resume(function() {
      debuggerClient.request('setbreakpoint', {
        type: 'scriptId',
        target: desc.id,
        line: line + 1
      }, function(err, res) {
        if (err) {
          err.message = 'request setbreakpoint, ' + err.message;
          return cb(err);
        }
        breakpoint = res;
        // we need to call NativeModule.require
        // https://github.com/nodejs/node/blob/v7.8.0/lib/console.js#L95
        debuggerClient.request('evaluate', {
          global: true,
          expression: 'try{console.assert();}catch(e){}',
        });
      });
    });

  });
};

/**
 * @param {Number} NM - handle of NativeModule object
 */
InjectorClient.prototype._inject = function(cb) {
  var injectorServerPath = JSON.stringify(require.resolve('./InjectorServer'));
  var options = {
    'v8-debug': require.resolve('v8-debug'),
    'convert': require.resolve('./convert')
  };

  var args = {
    global: true,
    expression: '(function (require) {' +
      'require("module")._load(' + injectorServerPath + ')' +
      '(' + JSON.stringify(options) + ')' +
    '})(process._require)'
  };

  this._debuggerClient.request(
    'evaluate',
    args,
    function(error) {
      cb(error);
    }
  );
};

/**
 */
InjectorClient.prototype._onInjection = function(cb) {
  this._injected = true;
  this.emit('inject');
  cb();
};

InjectorClient.prototype.close = function() {
  this._injected = false;
  this._appPausedByInjector = false;
  this.emit('close');
};

InjectorClient.prototype.injection = function(injection, options, callback) {
  this._debuggerClient.request(
    'evaluate',
    {
      expression: '(' + injection.toString() + ')' +
                  '(process._require, process._debugObject, ' + JSON.stringify(options) + ')',
      global: true
    },
    callback
  );
};

module.exports.InjectorClient = InjectorClient;
