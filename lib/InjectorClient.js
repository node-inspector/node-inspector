'use strict';

var co = require('co');
var EventEmitter = require('events').EventEmitter;
var inherits = require('util').inherits;
var debug = require('debug')('node-inspector:injector');

// NM is NativeModule
var FN_WITH_SCOPED_NM = 'Object.getOwnPropertyDescriptor(global, "console").get';

/**
 * @param {{inject}} config
 * @param {DebuggerClient} debuggerClient
 * @constructor
 */
function InjectorClient(config, session) {
  this._injected = null;

  this._debuggerClient = session.debuggerClient;
  this._debuggerClient.on('close', this.close.bind(this));
}
inherits(InjectorClient, EventEmitter);

/**
 * We search a function with scoped NativeModule
 *
 * If debugger is not paused on startup, we need to pause it,
 * otherwise we can't resolve handle of function.
 *
 * If debugger is paused on startup we need to reallocate debugger Context
 * after injection - most simple way is to restart frame.
 */
InjectorClient.prototype.injected = function() {
  if (this._injected instanceof Promise) return this._injected;

  return this._injected = co(function * () {
    var paused = yield this._pause();
    var handle = yield this._getFuncWithNMInScope();
    var NM = yield this._findNMInScope(handle);

    yield this._inject(NM);

    if (!paused)
      yield this._restartframe();
    else
      yield this._resume();

    return true;
  }.bind(this));
};

InjectorClient.prototype._pause = function() {
  return co(function * () {
    if (!(yield this._debuggerClient.running())) return false;

    yield this._debuggerClient.request('suspend');
    return !(yield this._debuggerClient.running());
  }.bind(this));
};

InjectorClient.prototype._resume = function() {
  return this._debuggerClient.request('continue');
};

InjectorClient.prototype._restartframe = function() {
  return co(function * () {
    if (yield this._debuggerClient.running()) return;
    var restart = yield this._debuggerClient.request('restartframe', { frame: 0 });

    if (!restart.result || restart.result.stack_update_needs_step_in) {
      this._debuggerClient.request('continue', { stepaction: 'in' });
      yield this._debuggerClient.break();
    }
  }.bind(this));
};

InjectorClient.prototype._getFuncWithNMInScope = function() {
  return co(function * () {
    var result = yield this._debuggerClient.request('evaluate', {
      global: true, expression: FN_WITH_SCOPED_NM
    });

    return result.handle;
  }.bind(this));
};

InjectorClient.prototype._findNMInScope = function(funcHandle) {
  return co(function * () {
    var scope = yield this._debuggerClient.request('scope', {
      functionHandle: funcHandle
    });

    var NM = scope.refs[scope.object.ref].properties.filter(function(prop) {
      return prop.name == 'NativeModule';
    })[0];

    if (!NM)
      throw new Error('No NativeModule in target scope');

    return NM.ref;
  }.bind(this));
};

/**
 * @param {Number} NM - handle of NativeModule object
 */
InjectorClient.prototype._inject = function(NM) {
  return co(function * () {
    var injectorServerPath = JSON.stringify(require.resolve('./InjectorServer'));
    var options = {
      'v8-debug': require.resolve('v8-debug'),
      'convert': require.resolve('./convert')
    };
    var injection = '(function (NM) {' +
      'NM.require("module")._load(' + injectorServerPath + ')' +
      '(' + JSON.stringify(options) + ')' +
    '})(NM)';

    yield this._debuggerClient.request('evaluate', {
      expression: injection,
      global: true,
      additional_context: [
        { name: 'NM', handle: NM }
      ]
    });
  }.bind(this));
};

InjectorClient.prototype.close = function() {
  if (!this._injected) return Promise.resolve();

  this._injected = null;
  this.emit('close');

  return Promise.resolve()
};

InjectorClient.prototype.injection = function(injection, options) {
  return co(function * () {
    yield this.injected();
    yield this._debuggerClient.request('evaluate', {
      expression: '(' + injection.toString() + ')' +
                  '(process._require, process._debugObject, ' + JSON.stringify(options) + ')',
      global: true
    });
  }.bind(this));
};

module.exports = InjectorClient;
module.exports.InjectorClient = InjectorClient;
