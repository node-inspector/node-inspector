var EventEmitter = require('events').EventEmitter,
    inherits = require('util').inherits,
    debug = require('debug')('node-inspector:injector');

var PAUSE_MARK = '__injector_break__',
    PAUSE_STRING = 'process.once("' + PAUSE_MARK + '", function ' + PAUSE_MARK + '(){debugger;});' +
                   'process.emit("' + PAUSE_MARK + '")',
    PAUSE_CHECK = '#<process>.' + PAUSE_MARK + '()',
    PARENT_CALL_FRAME = 1,
    CURRENT_CALL_FRAME = 0,
    GLOBAL_CALL_FRAME = -1;

/**
 * @param {{inject}} config
 * @param {DebuggerClient} debuggerClient
 * @constructor
 */
function InjectorClient(config, debuggerClient) {
  this._noInject = config.inject === false;
  this._injected = false;
  this._appPausedByInjector = false;
  this.on('error', function(error){
    debug('injector: ' + error.message);
  });

  this._debuggerClient = debuggerClient;
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
InjectorClient.prototype.tryHandleDebuggerBreak = function(sourceLine) {
  var pausedByInjector = this.containsInjectorMark(sourceLine);
  var handledByInjector = this.needsInject && pausedByInjector;
  if (handledByInjector) {
    this._appPausedByInjector = true;
    this.inject();
  } else if (pausedByInjector) {
    this._debuggerClient.request('continue');
  }
  return handledByInjector;
};

/**
 * @param {string} sourceLine
 * @type {boolean}
 */
InjectorClient.prototype.containsInjectorMark = function(sourceLine) {
  return sourceLine === PAUSE_CHECK;
};

/**
 */
InjectorClient.prototype.inject = function() {
  if (!this.needsInject) {
    this.emit('inject', this._injected);
    return;
  }

  if (!this._debuggerClient.isRunning) {
    if (this._appPausedByInjector) {
      this._inject(PARENT_CALL_FRAME);
    } else {
      this._isRequireInFrame(CURRENT_CALL_FRAME, function(isInCurrentFrame) {
        if (isInCurrentFrame) {
          this._inject(CURRENT_CALL_FRAME);
        } else {
          var error = new Error('Injection failed: no require in current frame.');
          process.nextTick(this._onInjection.bind(this, error));
        }
      }.bind(this));
    }
  } else {
    this._isRequireInFrame(GLOBAL_CALL_FRAME, function(isInGlobalScope) {
      if (!isInGlobalScope) {
        this._pause();
      } else {
        this._inject(GLOBAL_CALL_FRAME);
      }
    }.bind(this));
  }
};

/**
* @param {Number} TARGET_FRAME
* @param {function(isInFrame)} cb
*/
InjectorClient.prototype._isRequireInFrame = function(TARGET_FRAME, cb) {
  this._debuggerClient.request(
    'evaluate',
    {
      expression: 'require',
      frame: TARGET_FRAME >= 0 ? TARGET_FRAME : undefined,
      global: TARGET_FRAME == -1,
    },
    function(error, result) {
      cb(!error);
    }
  );
};

/**
 */
InjectorClient.prototype._pause = function() {
  this._debuggerClient.request(
    'evaluate',
    {
      global: true,
      expression: PAUSE_STRING
    }
  );
};

/**
 * @param {Number} TARGET_FRAME
 */
InjectorClient.prototype._inject = function(TARGET_FRAME) {
  var injectorServerPath = JSON.stringify(require.resolve('./InjectorServer'));
  var options = {
    'v8-debug': require.resolve('v8-debug')
  };
  var injection = '(require(\'module\')._load(' + injectorServerPath + '))' +
                  '(' + JSON.stringify(options) + ')';

  this._debuggerClient.request(
    'evaluate',
    {
      expression: injection,
      frame: TARGET_FRAME >= 0 ? TARGET_FRAME : undefined,
      global: TARGET_FRAME == -1,
    },
    this._onInjection.bind(this)
  );
};

/**
 * @param {Object} error
 * @param {{value}} result
 */
InjectorClient.prototype._onInjection = function(error, result) {
  if (error) {
    /**
     * @event InjectorClient#error
     * @type {boolean}
     */
    this.emit('error', error);
  }

  this._injected = !error;

  var notifyInjectedState = function() {
    this.emit('inject', this._injected);
  }.bind(this);

  if (this._appPausedByInjector) {
    this._debuggerClient.request('continue', undefined, notifyInjectedState);
    this._appPausedByInjector = false;
  } else {
    process.nextTick(notifyInjectedState);
  }
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
