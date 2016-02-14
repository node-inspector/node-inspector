'use strict';

const co = require('co');
const convert = require('../../convert.js');
const path = require('path');

const BreakEventHandler = require('./BreakEventHandler.js');

class DebuggerAgent extends require('../InjectableAgent') {
  /**
   * @param {Config} config
   * @param {Session} session
   */
  constructor(config, session) {
    super('Debugger', config, session);

    this.breaker = new BreakEventHandler(config, session);

    this._saveLiveEdit = config.saveLiveEdit;
    this._stackTraceLimit = config.stackTraceLimit;
    this._breakpointsActive = true;

    this._enabled = false;

    this.registerCommand('evaluateOnCallFrame');
    this.registerCommand('getFunctionDetails');
    this.registerCommand('getBacktrace');
    this.registerCommand('pause');
    this.registerCommand('resume');
    this.registerCommand('stepInto');
    this.registerCommand('stepOver');
    this.registerCommand('stepOut');
    this.registerCommand('restartFrame');
    this.registerCommand('setVariableValue');

    this.registerCommand('enable', this.enable.bind(this));
    this.registerCommand('setPauseOnExceptions', this.setPauseOnExceptions.bind(this));
    this.registerCommand('setBreakpointByUrl', this.setBreakpointByUrl.bind(this));
    this.registerCommand('setBreakpoint', this.setBreakpoint.bind(this));
    this.registerCommand('removeBreakpoint', this.removeBreakpoint.bind(this));
    this.registerCommand('continueToLocation', this.continueToLocation.bind(this));
    this.registerCommand('setBreakpointsActive', this.setBreakpointsActive.bind(this));
    this.registerCommand('setSkipAllPauses', this.setSkipAllPauses.bind(this));
    this.registerCommand('setScriptSource', this.setScriptSource.bind(this));
    this.registerCommand('getScriptSource', this.getScriptSource.bind(this));

    this.ready().then(() => {
      this.session.debuggerClient.on('break', (event) => this.breaker.handle(event));
      this.session.debuggerClient.on('exception', (event) => this.breaker.handle(event));
    });
  }

  get injection() {
    return {
      injection: require.resolve('./DebuggerInjection.js')
    }
  }

  enable(params) {
    return co(function * () {
      yield this.session.debuggerClient.ready();
      if (this._enabled) return;
      this._enabled = true;

      // Remove all existing breakpoints because:
      // 1) front-end inspector cannot restore breakpoints from debugger anyway
      // 2) all breakpoints were disabled when the previous debugger-client
      //    disconnected from the debugged application
      //yield this._removeAllBreakpoints();
      yield this.session.scriptManager.reload();
      yield this._sendBacktraceIfPaused();
    }.bind(this));
  }

  _removeAllBreakpoints() {
    return co(function * () {
      const breakpoints = yield this.session.debuggerClient.request('listbreakpoints');

      return yield breakpoints.breakpoints.map(breakpoint =>
        this.removeBreakpoint({ breakpointId: breakpoint.number })
          .catch((error) => {
            this.notify('warning', 'Cannot remove old breakpoint %d. %s', breakpoint.number, error);
          }));
    }.bind(this)).catch(error => {
      this.notify('warning', 'Cannot remove old breakpoints. %s', error);
    });
  }

  _sendBacktraceIfPaused() {
    return co(function * () {
      if (yield this.session.debuggerClient.running()) return;

      const backtrace = yield this.request('getBacktrace', {
        stackTraceLimit: this._stackTraceLimit
      });

      this.emitEvent('paused', {
        callFrames: backtrace,
        reason: 'other',
        hitBreakpoints: false
      });
    }.bind(this));
  }

  getScriptSource(params) {
    return co(function * () {
      return yield {
        scriptSource: this.session.scriptManager.source(params.scriptId)
      };
    }.bind(this));
  }

  setScriptSource(params) {
    return co(function * () {
      const result = yield this.request('setScriptSource', params);
      yield this._saveScriptSourceToDisk(params);

      return result;
    }.bind(this));
  }

  _saveScriptSourceToDisk(params) {
    return co(function * () {
      try {
        const ERROR = 'Cannot save changes to disk:';
        const script = this.session.scriptManager.get(params.scriptId);
        if (!script)
          return console.log(ERROR, `unknown script id`, params.scriptId);

        if (!this._saveLiveEdit)
          return this._warnLiveEditDisabled();

        const name = script.name;
        if (script.isInternalScript)
          return console.log(ERROR, `script "${name}" was not loaded from a file.`);

          yield this.session.scriptManager.save(name, source);
      } catch (error) { console.log(ERROR, error.stack); }
    }.bind(this));
  }

  _warnLiveEditDisabled() {
    this._warnLiveEditDisabled = function() {};

    console.log(
      'Saving of live-edit changes back to source files is disabled by configuration.\n' +
      'Change the option "saveLiveEdit" in config.json to enable this feature.');
  }

  setPauseOnExceptions(params) {
    return co(function * () {
      return yield [
        { type: 'all', enabled: params.state == 'all' },
        { type: 'uncaught', enabled: params.state == 'uncaught' }
      ].map((args) => this.session.debuggerClient.request('setexceptionbreak', args));
    }.bind(this));
  }

  setBreakpointByUrl(params) {
    return co(function * () {
      if (params.urlRegex !== undefined)
        throw('Error: setBreakpointByUrl using urlRegex is not implemented.');

      const script = this.session.scriptManager.find(params.url);
      const target = script ? script.name : convert.urlToPath(params.url);

      const result = yield this.session.debuggerClient.request('setbreakpoint', {
        enabled: this._breakpointsActive,
        type: 'script',
        target: target,
        line: params.lineNumber,
        column: params.columnNumber,
        condition: params.condition
      });

      return {
        breakpointId: result.breakpoint.toString(),
        locations: result.actual_locations.map(convert.v8LocationToInspectorLocation)
      };
    }.bind(this));
  }

  setBreakpoint(params) {
    return co(function * () {
      const result = yield this.session.debuggerClient.request('setbreakpoint', {
        enabled: this._breakpointsActive,
        type: 'scriptId',
        target: params.location.scriptId,
        line: params.location.lineNumber,
        column: params.location.columnNumber,
        condition: params.condition
      });

      return {
        breakpointId: result.breakpoint.toString(),
        location: result.actual_locations.map(convert.v8LocationToInspectorLocation)[0]
      };
    }.bind(this));
  }

  removeBreakpoint(params) {
    return co(function * () {
      yield this.session.debuggerClient.request('clearbreakpoint', {
        breakpoint: params.breakpointId
      });
    }.bind(this));
  }

  continueToLocation(params) {
    return co(function * () {
      const result = yield this.setBreakpoint(params);
      yield this.breaker.setContinueToLocationBreakpointId(result.breakpointId);
      this.handle('resume');
    }.bind(this));
  }

  setBreakpointsActive(params) {
    return co(function * () {
      this._breakpointsActive = params.active;
      const breakpoints = yield this.session.debuggerClient.request('listbreakpoints');

      yield breakpoints.breakpoints.map(breakpoint =>
        this.session.debuggerClient.request('changebreakpoint', {
          breakpoint: breakpoint.number,
          enabled: this._breakpointsActive
        }));
    }.bind(this));
  }

  setSkipAllPauses(params) {
    this.breaker.setSkipAllPauses(params.skipped);
  }
}

module.exports = DebuggerAgent;
