'use strict';

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

    this.registerCommand('enable', this.enable);
    this.registerCommand('setPauseOnExceptions', this.setPauseOnExceptions);
    this.registerCommand('setBreakpointByUrl', this.setBreakpointByUrl);
    this.registerCommand('setBreakpoint', this.setBreakpoint);
    this.registerCommand('removeBreakpoint', this.removeBreakpoint);
    this.registerCommand('continueToLocation', this.continueToLocation);
    this.registerCommand('setBreakpointsActive', this.setBreakpointsActive);
    this.registerCommand('setSkipAllPauses', this.setSkipAllPauses);
    this.registerCommand('setScriptSource', this.setScriptSource);
    this.registerCommand('getScriptSource', this.getScriptSource);

    const handle = (event) => {
      this.breaker.handle(event).catch(
        error => session.frontend.sendLogToConsole('error', error));
    };

    this.ready().then(() => {
      this.session.debugger.on('break', handle);
      this.session.debugger.on('exception', handle);
    });
  }

  get injection() {
    return {
      injection: require.resolve('./DebuggerInjection.js')
    }
  }

  * enable(params) {
    yield this.session.debugger.ready();
    if (this._enabled) return;
    this._enabled = true;

    // Remove all existing breakpoints because:
    // 1) front-end inspector cannot restore breakpoints from debugger anyway
    // 2) all breakpoints were disabled when the previous debugger-client
    //    disconnected from the debugged application
    //yield this._removeAllBreakpoints();
    yield this.session.scripts.reload();
    yield this._sendBacktraceIfPaused();
  }

/*
  _removeAllBreakpoints() {
    return co(function * () {
      const breakpoints = yield this.session.debugger.request('listbreakpoints');

      return yield breakpoints.breakpoints.map(breakpoint => {
        this.removeBreakpoint({ breakpointId: breakpoint.number })
          .catch((error) => {
            this.notify('warning', 'Cannot remove old breakpoint %d. %s', breakpoint.number, error);
          })
      });
    }.bind(this)).catch(error => {
      this.notify('warning', 'Cannot remove old breakpoints. %s', error);
    });
  }
*/

  * _sendBacktraceIfPaused() {
    if (yield this.session.debugger.running()) return;

    const backtrace = yield this.request('getBacktrace', {
      stackTraceLimit: this._stackTraceLimit
    });

    this.emitEvent('paused', {
      callFrames: backtrace,
      reason: 'other',
      hitBreakpoints: false
    });
  }

  * getScriptSource(params) {
    return yield {
      scriptSource: this.session.scripts.source(params.scriptId)
    };
  }

  * setScriptSource(params) {
    const result = yield this.request('setScriptSource', params);
    yield this._saveScriptSourceToDisk(params);

    return result;
  }

  * _saveScriptSourceToDisk(params) {
    try {
      const ERROR = 'Cannot save changes to disk:';
      const script = this.session.scripts.get(params.scriptId);
      if (!script)
        return console.log(ERROR, `unknown script id`, params.scriptId);

      if (!this._saveLiveEdit)
        return this._warnLiveEditDisabled();

      const name = script.name;
      if (script.isInternalScript)
        return console.log(ERROR, `script "${name}" was not loaded from a file.`);

        yield this.session.scripts.save(name, source);
    } catch (error) { console.log(ERROR, error.stack); }
  }

  _warnLiveEditDisabled() {
    this._warnLiveEditDisabled = function() {};

    console.log(
      'Saving of live-edit changes back to source files is disabled by configuration.\n' +
      'Change the option "saveLiveEdit" in config.json to enable this feature.');
  }

  * setPauseOnExceptions(params) {
    return yield [
      { type: 'all', enabled: params.state == 'all' },
      { type: 'uncaught', enabled: params.state == 'uncaught' }
    ].map((args) => this.session.debugger.request('setexceptionbreak', args));
  }

  * setBreakpointByUrl(params) {
    if (params.urlRegex !== undefined)
      throw('Error: setBreakpointByUrl using urlRegex is not implemented.');

    const script = this.session.scripts.find(params.url);
    const target = script ? script.name : convert.urlToPath(params.url);

    const result = yield this.session.debugger.request('setbreakpoint', {
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
  }

  * setBreakpoint(params) {
    const result = yield this.session.debugger.request('setbreakpoint', {
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
  }

  * removeBreakpoint(params) {
    yield this.session.debugger.request('clearbreakpoint', {
      breakpoint: params.breakpointId
    });
  }

  * continueToLocation(params) {
    const result = yield this.setBreakpoint(params);
    yield this.breaker.setContinueToLocationBreakpointId(result.breakpointId);
    this.handle('resume');
  }

  * setBreakpointsActive(params) {
    this._breakpointsActive = params.active;
    const breakpoints = yield this.session.debugger.request('listbreakpoints');

    yield breakpoints.breakpoints.map(breakpoint =>
      this.session.debugger.request('changebreakpoint', {
        breakpoint: breakpoint.number,
        enabled: this._breakpointsActive
      }));
  }

  * setSkipAllPauses(params) {
    yield this.breaker.setSkipAllPauses(params.skipped);
  }
}

module.exports = DebuggerAgent;
