'use strict';

var co = require('co');
var on = require('promonce');

// NM is NativeModule
var FN_WITH_SCOPED_NM = 'Object.getOwnPropertyDescriptor(global, "console").get';

class InjectorClient extends require('events') {
  /**
   * @param {Config} config
   * @param {Session} session
   * @constructor
   */
  constructor(config, session) { super();
    this.config = config;
    this.session = session;

    this._injected = null;

    session.debugger.on('close', this.close.bind(this));
  }

  /**
   * We search a function with scoped NativeModule
   *
   * If debugger is not paused on startup, we need to pause it,
   * otherwise we can't resolve handle of function.
   *
   * If debugger is paused on startup we need to reallocate debugger Context
   * after injection - most simple way is to restart frame.
   */
  injected() {
    if (this._injected instanceof Promise) return this._injected;

    return this._injected = co(function * () {
      const running = yield this.session.debugger.running();
      if (running) yield this.session.request('suspend');

      const handle = yield this._getFuncWithNMInScope();
      const NativeModule = yield this._findNativeModule(handle);

      yield this._inject(NativeModule);

      if (running) yield this.session.request('continue');
      else yield this._restartframe();

      return true;
    }.bind(this));
  }

  inject(options) {
    return co(function * () {
      yield this.injected();
      yield this.session.request('evaluate', {
        expression: `
          var require = process._require;
          var debug = process._debugObject;
          var options = ${JSON.stringify(options)};
          var injection = require(options.injection);
          injection(require, debug, options);`,
        global: true
      });
    }.bind(this));
  }

  close() {
    if (!this._injected) return Promise.resolve();

    this._injected = null;
    this.emit('close');

    return Promise.resolve()
  }

  _getFuncWithNMInScope() {
    return co(function * () {
      const result = yield this.session.request('evaluate', {
        global: true, expression: FN_WITH_SCOPED_NM
      });

      return result.handle;
    }.bind(this));
  }

  _findNativeModule(funcHandle) {
    return co(function * () {
      const scope = yield this.session.request('scope', {
        functionHandle: funcHandle
      });

      const NativeModule = scope.refs[scope.object.ref].properties
        .filter((prop) => prop.name === 'NativeModule')[0];

      if (!NativeModule)
        throw new Error('No NativeModule in target scope');

      return NativeModule.ref;
    }.bind(this));
  }

  /**
   * @param {Number} NativeModuleHandle
   */
  _inject(NativeModuleHandle) {
    return co(function * () {
      const injectorServerPath = require.resolve('./InjectorServer');
      const options = JSON.stringify({
        'v8-debug': require.resolve('v8-debug'),
        'convert': require.resolve('../convert')
      });

      yield this.session.request('evaluate', {
        expression: `NativeModule.require("module")._load("${injectorServerPath}")(${options})`,
        global: true,
        additional_context: [
          { name: 'NativeModule', handle: NativeModuleHandle }
        ]
      });
    }.bind(this));
  }

  _restartframe() {
    return co(function * () {
      const restart = yield this.session.request('restartframe', { frame: 0 });

      if (!restart.result || restart.result.stack_update_needs_step_in) {
        this.session.request('continue', { stepaction: 'in' });
        yield on(this.session.debugger, 'break', 'error');
      }
    }.bind(this));
  }
}

module.exports = InjectorClient;
