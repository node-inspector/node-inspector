var convert = require('./convert'),
    CallFramesProvider = require('./CallFramesProvider').CallFramesProvider;

/**
 * @param {FrontendClient} frontendClient
 * @param {DebuggerClient} debuggerClient
 * @param {ScriptManager} scriptManager
 * @constructor
 */
function BreakEventHandler(frontendClient, debuggerClient, scriptManager) {
  this._frontendClient = frontendClient;
  this._debuggerClient = debuggerClient;
  this._scriptManager = scriptManager;
  this._callFramesProvider = new CallFramesProvider(debuggerClient);
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

  // Source is undefined when the breakpoint was in code eval()-ed via
  // console or eval()-ed internally by node inspector.
  // We could send backtrace in such case, but that isn't working well now.
  // V8 is reusing the same scriptId for multiple eval() calls and DevTools
  // front-end does not update the displayed source code when a content
  // of a script changes.
  // The following solution - ignore the breakpoint and resume the
  // execution - should be good enough in most cases.
  if (!source || source.hidden) {
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
