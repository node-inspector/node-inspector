var EventEmitter = require('events').EventEmitter,
    inherits = require('util').inherits,
    async = require('async'),
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
    if (error)
      this._frontendClient.sendLogToConsole('error', error.toString());

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

InjectorClient.prototype._findNMInScope = function(funcHandle, cb) {
    this._debuggerClient.request('scope', {
      functionHandle: funcHandle
    }, function(error, result, refs) {
      if (error) return cb(error);

      var NM = refs[result.object.ref].properties.filter(function(prop) {
        return prop.name == 'NativeModule';
      });

      if (!NM.length)
        error = new Error('No NativeModule in target scope');

      cb(error, error ? null : NM[0].ref);
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
