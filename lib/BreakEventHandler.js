'use strict';

var co = require('co');

/**
 * @param {Object} config
 * @param {Object} session
 * @constructor
 */
function BreakEventHandler(config, session) {
  this._config = config;
  this._session = session;
  this._frontendClient = session.frontendClient;
  this._debuggerClient = session.debuggerClient;
  this._injectorClient = session.injectorClient;
  this._scriptManager = session.scriptManager;

  this._continueToLocationBreakpointId = null;
  this._skipAllPauses = false;

  this._debuggerClient.on('break', this._onBreak.bind(this));
  this._debuggerClient.on('exception', this._onBreak.bind(this));
}

BreakEventHandler.prototype._onBreak = function(obj) {
  return co(function * () {
    yield this._injectorClient.injected();

    if (yield this._debuggerClient.running())
      return;

    yield this._handleSkipAllPauses();
    if (yield this._debuggerClient.running())
      return;

    var script = yield this._resolveScriptSource(obj);
    yield this._skipHidden(obj, script);

    if (yield this._debuggerClient.running())
      return;

    yield this.clearContinueToLocationBreakpoint();
    yield this.sendBacktraceToFrontend(obj);
  }.bind(this)).catch(
    error => this._frontendClient.sendLogToConsole('error', error));
};

BreakEventHandler.prototype._handleSkipAllPauses = function(obj) {
  return co(function * () {
    if (this._skipAllPauses) yield this._debuggerClient.request('continue');
  }.bind(this));
};

BreakEventHandler.prototype._resolveScriptSource = function(obj) {
  return co(function * () {
    return yield this._scriptManager.resolveScriptById(obj.script.id);
  }.bind(this));
};

BreakEventHandler.prototype._skipHidden = function(obj, source) {
  var ignore = false;

  // Source is undefined when the breakpoint was in code eval()-ed via
  // console or eval()-ed internally by node inspector.
  // We could send backtrace in such case, but that isn't working well now.
  // V8 is reusing the same scriptId for multiple eval() calls and DevTools
  // front-end does not update the displayed source code when a content
  // of a script changes.
  // The following solution - ignore the breakpoint and resume the
  // execution - should be good enough in most cases.
  if (!source || source.hidden)
    ignore = true;

  // In the case of "break on uncaught exception" triggered by
  // "TypeError: undefined is not a function", the exception is
  // thrown by a V8 builtin CALL_NON_FUNCTION defined in
  // v8/src/runtime.js. Thus, the script id of the event is not know
  // by Node Inspector, but the break even must not be ignored.
  // See https://github.com/node-inspector/node-inspector/issues/344
  if (obj.exception)
    ignore = false;

  return ignore
    ? this._debuggerClient.request('continue', { stepaction: 'out' })
    : Promise.resolve();
};

BreakEventHandler.prototype.setSkipAllPauses = function(skip) {
  this._skipAllPauses = skip;
};

BreakEventHandler.prototype.setContinueToLocationBreakpointId = function(breakpointId) {
  if (this._continueToLocationBreakpointId != null)
    throw new Error('Possible breakpoint leak. Overriding continueToLocation breakpoint.');

  this._continueToLocationBreakpointId = breakpointId;
};

BreakEventHandler.prototype.clearContinueToLocationBreakpoint = function() {
  return co(function * () {
    if (this._continueToLocationBreakpointId == null) return;

    yield this._debuggerClient.request('clearbreakpoint', {
      breakpoint: this._continueToLocationBreakpointId
    });

    this._continueToLocationBreakpointId = null;
  }.bind(this));
};

/**
 * @param {Object} exception
 * @param {Array.<number>} hitBreakpoints
 */
BreakEventHandler.prototype.sendBacktraceToFrontend = function(obj) {
  return co(function * () {
    yield this._injectorClient.injected();

    obj = Object.assign({
      exception: false,
      hitBreakpoints: false
    }, obj);

    var exception = obj.exception,
        hitBreakpoints = obj.hitBreakpoints;

    var backtrace = yield this._debuggerClient.request('Debugger.getBacktrace', {
      stackTraceLimit: this._config.stackTraceLimit
    });

    this._frontendClient.emitEvent('Debugger.paused', {
      callFrames: backtrace,
      reason: exception ? 'exception' : 'other',
      data: exception ? {
        type: 'object',
        desc: exception.text || 'Error'
      } : undefined,
      hitBreakpoints: hitBreakpoints
    });
  }.bind(this));
};

module.exports = BreakEventHandler;
module.exports.BreakEventHandler = BreakEventHandler;
