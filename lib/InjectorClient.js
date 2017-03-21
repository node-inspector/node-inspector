var EventEmitter = require('events').EventEmitter,
    inherits = require('util').inherits,
    async = require('async'),
    util = require('util'),
    debug = require('debug')('node-inspector:injector');

// NM is NativeModule
var FN_WITH_SCOPED_NM = 'Object.getOwnPropertyDescriptor(global, "console").get';

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
  if (typeof cb !== 'function')
    cb = function(error, result) {};

  var _water = [];

  if (this.needsInject) {
    _water.unshift(
      this._getFuncWithNMInScope.bind(this),
      this._findNMInScope.bind(this),
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

InjectorClient.prototype._getFuncWithNMInScope = function(cb) {
    this._debuggerClient.request('evaluate', {
      global: true,
      expression: FN_WITH_SCOPED_NM
    }, function(error, result) {
      if (error) return cb(error);

      cb(null, result.handle);
    }.bind(this));
};


InjectorClient.prototype._findNMInBackTrace = function(cb) {
  var self = this;
  this._debuggerClient.request('backtrace', { inlineRefs: true }  , function(err, trace) {
    if (err) {
      err.message = 'request backtrace, ' + err.message;
      return cb(err);
    }

    if (trace.totalFrames <= 0) return cb(Error('No frames'));
    var refs = [];
    for (var i = 0; i < trace.frames.length; i++) {
      var frame = trace.frames[i];
      refs.push(frame.script.ref);
      refs.push(frame.func.ref);
      refs.push(frame.receiver.ref);
    }

    var handles = [];

    function findNMInScope() {
      var handle = handles.pop();
      if (handle) {
        self._debuggerClient.request('scope', {
          functionHandle: handle
        }, function(error, result, refs) {
          var NM = refs && refs[result.object.ref].properties.filter(function(prop) {
            return prop.name == 'NativeModule';
          });

          if (!(NM && NM.length)) {
            findNMInScope();
          } else {
            cb(null , NM[0].ref);
          }
        });
      } else {
        cb(new Error('No NativeModule in target scope') , null);
      }
    }

    this._debuggerClient.request('lookup', {handles: refs}, function(err, res) {
      if (err) return cb(err);
      for (var ref in res) {
        var desc = res[ref];
        if (util.isObject(desc) &&
            desc.type === 'function' &&
            desc.source.indexOf('NativeModule.') > -1) {
          handles.push(desc.handle);
        }
      }
      findNMInScope();
    });
  }.bind(this));
};

// >= node6.4.0 fix https://github.com/node-inspector/node-inspector/issues/905
InjectorClient.prototype._tryFindNM = function(cb) {
  var self = this;
  var breakpoint;
  this._debuggerClient.once('break', function() {
    self._debuggerClient.request('clearbreakpoint', {
      breakpoint: breakpoint.breakpoint,
    }, function(err) {
      if (err) {
        err.message = 'request clearbreakpoint, ' + err.message;
        return cb(err);
      }
      self._findNMInBackTrace(function(err, NM) {
        self._resume(function() {
          cb(err, NM);
        });
      });
    });
  }.bind(this));

  this._debuggerClient.request('scripts', {
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

    if (!self._debuggerClient.isRunning) {
      self._resume(function() {
        self._debuggerClient.request('setbreakpoint', {
          type: 'scriptId',
          target: desc.id,
          line: line + 1
        }, function(err, res) {
          if (err) {
            err.message = 'request setbreakpoint, ' + err.message;
            return cb(err);
          }
          breakpoint = res;
          self._debuggerClient.request('evaluate', {
            global: true,
            expression: 'try{console.assert();}catch(e){}',
          });
        });
      });
    } else {
      self._debuggerClient.request('setbreakpoint', {
        type: 'scriptId',
        target: desc.id,
        line: line + 1
      }, function(err, res) {
        if (err) {
          err.message = 'request setbreakpoint, ' + err.message;
          return cb(err);
        }
        breakpoint = res;
        self._debuggerClient.request('evaluate', {
          global: true,
          expression: 'try{console.assert();}catch(e){}',
        });
      });
    }
  });
};

InjectorClient.prototype._findNMInScope = function(funcHandle, cb) {
    this._debuggerClient.request('scope', {
      functionHandle: funcHandle
    }, function(error, result, refs) {
      if (error) return cb(error);

      var NM = refs[result.object.ref].properties.filter(function(prop) {
        return prop.name == 'NativeModule';
      });

      if (!NM.length) {
        this._tryFindNM(cb);
      } else {
        cb(error, error ? null : NM[0].ref);
      }
    }.bind(this));
};

/**
 * @param {Number} NM - handle of NativeModule object
 */
InjectorClient.prototype._inject = function(NM, cb) {
  var injectorServerPath = JSON.stringify(require.resolve('./InjectorServer'));
  var options = {
    'v8-debug': require.resolve('v8-debug'),
    'convert': require.resolve('./convert')
  };
  var injection = '(function (NM) {' +
    'NM.require("module")._load(' + injectorServerPath + ')' +
    '(' + JSON.stringify(options) + ')' +
  '})(NM)';
  
  this._debuggerClient.request(
    'evaluate',
    {
      expression: injection,
      global: true,
      additional_context: [
        { name: 'NM', handle: NM }
      ]
    },
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
