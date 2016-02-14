'use strict';

const co = require('co');

class BreakEventHandler {
  /**
   * @param {Config} config
   * @param {Session} session
   */
  constructor(config, session) {
    this.config = config;
    this.session = session;
    this._continueToLocationBreakpointId = null;
    this._skipAllPauses = false;
  }

  /**
   * @param {Object} event
   * @param {Object} event.script
   * @param {Number} event.script.id
   * @param {Object} [event.exception]
   * @param {String} [event.exception.text]
   * @param {Array.<Number>} [event.hitBreakpoints]
   */
  handle(event) {
    return co(function * () {
      if (yield this.session.debugger.running()) return;
      if (yield this._handleSkipAllPauses()) return;
      if (yield this._skipHidden(event)) return;

      yield this._clearContinueToLocationBreakpoint();
      yield this._sendBacktraceToFrontend(event);
    }.bind(this)).catch(
      // TODO (3y3): Move this to another layer
      error => this.session.frontend.sendLogToConsole('error', error));
  }

  /**
   * @param {Boolean} skip
   */
  setSkipAllPauses(skip) {
    this._skipAllPauses = skip;
  }

  /**
   * @param {Number} breakpointId
   */
  setContinueToLocationBreakpointId(breakpointId) {
    return co(function * () {
      if (this._continueToLocationBreakpointId != null)
        yield this._clearContinueToLocationBreakpoint();

      this._continueToLocationBreakpointId = breakpointId;
    }.bind(this));
  }

  _handleSkipAllPauses() {
    return co(function * () {
      if (this._skipAllPauses)
        yield this.session.debugger.request('continue');
      return this._skipAllPauses;
    }.bind(this));
  }

  _skipHidden(event) {
    return co(function * () {
      // In the case of "break on uncaught exception" triggered by
      // "TypeError: undefined is not a function", the exception is
      // thrown by a V8 builtin CALL_NON_FUNCTION defined in
      // v8/src/runtime.js. Thus, the script id of the event is not know
      // by Node Inspector, but the break even must not be ignored.
      // See https://github.com/node-inspector/node-inspector/issues/344
      if (event.exception) return false;

      // Source is undefined when the breakpoint was in code eval()-ed via
      // console or eval()-ed internally by node inspector.
      // We could send backtrace in such case, but that isn't working well now.
      // V8 is reusing the same scriptId for multiple eval() calls and DevTools
      // front-end does not update the displayed source code when a content
      // of a script changes.
      // The following solution - ignore the breakpoint and resume the
      // execution - should be good enough in most cases.
      if (!this.session.scripts.get(event.script.id))
        yield this.session.debugger.request('continue', { stepaction: 'out' });

      return false;
    }.bind(this));
  }

  _clearContinueToLocationBreakpoint() {
    return co(function * () {
      if (this._continueToLocationBreakpointId == null) return;

      yield this.session.debugger.request('clearbreakpoint', {
        breakpoint: this._continueToLocationBreakpointId
      });

      this._continueToLocationBreakpointId = null;
    }.bind(this));
  }

  _sendBacktraceToFrontend(event) {
    return co(function * () {
      event = Object.assign({
        exception: false,
        hitBreakpoints: false
      }, event);

      const reason = event.exception ? 'exception' : 'other';
      const data = event.exception && {
        type: 'object',
        desc: event.exception.text
      };
      const backtrace = yield this.session.debugger.request('Debugger.getBacktrace', {
        stackTraceLimit: this.config.stackTraceLimit
      });

      this.session.frontend.emitEvent('Debugger.paused', {
        callFrames: backtrace,
        reason: reason,
        data: data,
        hitBreakpoints: event.hitBreakpoints
      });
    }.bind(this));
  }
}

module.exports = BreakEventHandler;
