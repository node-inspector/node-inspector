var convert = require('./convert'),
    CallFramesProvider = require('./CallFramesProvider').CallFramesProvider;

/**
 * @param {Object} config
 * @param {FrontendClient} frontendClient
 * @param {DebuggerClient} debuggerClient
 * @param {ScriptManager} scriptManager
 * @param {InjectorClient} injectorClient
 * @constructor
 */
function BreakEventHandler(config, frontendClient, debuggerClient, scriptManager, injectorClient) {
  this._config = config;
  this._frontendClient = frontendClient;
  this._debuggerClient = debuggerClient;
  this._injectorClient = injectorClient;
  this._scriptManager = scriptManager;
  this._callFramesProvider = new CallFramesProvider(config, debuggerClient);
  this._registerDebuggerEventHandlers();
}

var callbackForNextBreak;

Object.defineProperties(BreakEventHandler.prototype, {
  /** @type {Number} */
  continueToLocationBreakpointId: {
    writable: true,
    value: null
  },

  /** @type {function(eventData)} */
  callbackForNextBreak: {
    get: function() { return callbackForNextBreak; },
    set: function(value) {
      if (value && callbackForNextBreak)
        throw new Error('Cannot set multiple callbacks for the next break.');
      callbackForNextBreak = value;
    }
  }
});

BreakEventHandler.prototype._registerDebuggerEventHandlers = function() {
  this._debuggerClient.on('break', this._onBreak.bind(this));
  this._debuggerClient.on('exception', this._onBreak.bind(this));
};

BreakEventHandler.prototype._onBreak = function(obj) {
  var scriptId = obj.script.id,
    hitBreakpoints = obj.breakpoints,
    source = this._scriptManager.findScriptByID(scriptId);

  if (this._injectorClient.tryHandleDebuggerBreak(obj.invocationText)) {
    return;
  }

  var ignore = false;

  // Source is undefined when the breakpoint was in code eval()-ed via
  // console or eval()-ed internally by node inspector.
  // We could send backtrace in such case, but that isn't working well now.
  // V8 is reusing the same scriptId for multiple eval() calls and DevTools
  // front-end does not update the displayed source code when a content
  // of a script changes.
  // The following solution - ignore the breakpoint and resume the
  // execution - should be good enough in most cases.
  if (!source || source.hidden) {
    ignore = true;
  }

  // In the case of "break on uncaught exception" triggered by
  // "TypeError: undefined is not a function", the exception is
  // thrown by a V8 builtin CALL_NON_FUNCTION defined in
  // v8/src/runtime.js. Thus, the script id of the event is not know
  // by Node Inspector, but the break even must not be ignored.
  // See https://github.com/node-inspector/node-inspector/issues/344
  if (obj.exception) {
    ignore = false;
  }

  if (ignore) {
    this._debuggerClient.request('continue', { stepaction: 'out' });
    return;
  }

  if (this.callbackForNextBreak) {
    var callback = this.callbackForNextBreak;
    this.callbackForNextBreak = null;
    callback(obj);
    return;
  }

  if (this.continueToLocationBreakpointId !== null) {
    this._debuggerClient.clearBreakpoint(
      this.continueToLocationBreakpointId,
      function(err, result) {
        if (err)
          this._frontendClient.sendLogToConsole('warning', err);
        else
          this.continueToLocationBreakpointId = null;
      }.bind(this)
    );
  }

  this.sendBacktraceToFrontend(obj.exception, hitBreakpoints);
};

/**
 * @param {function(error, response)} callback
 */
BreakEventHandler.prototype.fetchCallFrames = function(callback) {
  this._callFramesProvider.fetchCallFrames(callback);
};

/**
 * @param {Object} exception
 * @param {Array.<number>} hitBreakpoints
 */
BreakEventHandler.prototype.sendBacktraceToFrontend = function(exception, hitBreakpoints) {
  this.fetchCallFrames(function(error, result) {
    if (error)
      this._frontendClient.sendLogToConsole('error', error);
    else
      this._frontendClient.sendEvent(
        'Debugger.paused',
        {
          callFrames: result,
          reason: exception ? 'exception' : 'other',
          data: exception ? convert.v8RefToInspectorObject(exception) : null,
          hitBreakpoints: hitBreakpoints
        });
  }.bind(this));
};

exports.BreakEventHandler = BreakEventHandler;
