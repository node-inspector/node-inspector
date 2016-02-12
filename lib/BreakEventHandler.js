var convert = require('./convert'),
    async = require('async'),
    CallFramesProvider = require('./CallFramesProvider').CallFramesProvider;

/**
 * @param {Object} config
 * @param {FrontendClient} frontendClient
 * @param {DebuggerClient} debuggerClient
 * @param {ScriptManager} scriptManager
 * @param {InjectorClient} injectorClient
 * @constructor
 */
function BreakEventHandler(config, session) {
  this._config = config;
  this._session = session;
  this._frontendClient = session.frontendClient;
  this._debuggerClient = session.debuggerClient;
  this._injectorClient = session.injectorClient;
  this._scriptManager = session.scriptManager;
  this._callFramesProvider = new CallFramesProvider(config, session);

  this._debuggerClient.on('break', this._onBreak.bind(this));
  this._debuggerClient.on('exception', this._onBreak.bind(this));
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

BreakEventHandler.prototype._onBreak = function(obj) {
  async.waterfall([
    this._handleInjectorClientBreak.bind(this, obj),
    this._resolveScriptSource.bind(this, obj),
    this._handleIgnoreBreakpoint.bind(this, obj),
    this._handleCallbackForNextBreak.bind(this, obj),
    this._handleContinueToLocation.bind(this, obj),
    this.sendBacktraceToFrontend.bind(this, obj)
  ], function(err) {
    if (err && err !== true) {
      this._frontendClient.sendLogToConsole('error', err);
    }
  }.bind(this));
};

BreakEventHandler.prototype._handleInjectorClientBreak = function(obj, cb) {
  this._injectorClient.tryHandleDebuggerBreak(obj.invocationText, cb);
};

BreakEventHandler.prototype._resolveScriptSource = function(obj, cb) {
  this._scriptManager.resolveScriptById(obj.script.id, cb);
};

BreakEventHandler.prototype._handleIgnoreBreakpoint = function(obj, source, cb) {
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
  }

  cb(ignore);
};

BreakEventHandler.prototype._handleCallbackForNextBreak = function(obj, cb) {
  if (!this.callbackForNextBreak) return cb(null);

  var callbackForNextBreak = this.callbackForNextBreak;
  this.callbackForNextBreak = null;
  callbackForNextBreak(obj);

  cb(true);
};

BreakEventHandler.prototype._handleContinueToLocation = function(obj, cb) {
  if (this.continueToLocationBreakpointId == null) return cb(null);

  this._debuggerClient.clearBreakpoint(
    this.continueToLocationBreakpointId,
    function(err, result) {
      if (err)
        this._frontendClient.sendLogToConsole('warning', err);
      else
        this.continueToLocationBreakpointId = null;

      cb(true);
    }.bind(this)
  );
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
BreakEventHandler.prototype.sendBacktraceToFrontend = function(obj, cb) {
  obj = obj || {
    exception: false,
    hitBreakpoints: false
  };

  cb = cb || function() {};

  var exception = obj.exception,
      hitBreakpoints = obj.hitBreakpoints;

  this.fetchCallFrames(function(error, result) {
    if (error) return cb(error);

    this._frontendClient.sendEvent(
      'Debugger.paused',
      {
        callFrames: result,
        reason: exception ? 'exception' : 'other',
        data: exception ? convert.v8RefToInspectorObject(exception) : null,
        hitBreakpoints: hitBreakpoints
      });

    cb(null);
  }.bind(this));
};

exports.BreakEventHandler = BreakEventHandler;
