var EventEmitter = require('events').EventEmitter,
    inherits = require('util').inherits,
    injectorServer = require('./InjectorServer.js'),
    DebugConnection = require('./debugger.js'),
    debug = require('debug')('node-inspector:injector');

var PAUSE_MARK = '__injector_break__',
    PAUSE_STRING = 'process.once("' + PAUSE_MARK + '", function ' + PAUSE_MARK + '(){debugger;});' +
                   'process.emit("' + PAUSE_MARK + '")',
    PAUSE_CHECK = '#<process>.' + PAUSE_MARK + '()',
    PARENT_CALL_FRAME = 1,
    CURRENT_CALL_FRAME = 0,
    NOOP = function() {};

/**
 * @param {Array} messagesCache
 * @type {Object}
 */
function createFailingConnection() {
  return {
    isRunning: false,
    connected: false,
    send: NOOP,
    close: NOOP
  };
}

/**
 * @param {{inject}} config
 * @param {DebuggerClient} debuggerClient
 * @constructor
 */
function InjectorClient(config, debuggerClient) {
  this._noInject = config.inject === false;
  this._appPausedByInjector = false;
  this._needsToInject = [];
  this._needsToInjectOptions = [];
  this._eventNames = [];
  this._messagesCache = [];
  this._conn = createFailingConnection();
  this.on('error', function(error){
    debug('injector: ' + error.message);
  });

  this._debuggerClient = debuggerClient;
  this._debuggerClient.on('close', this.close.bind(this));
}

inherits(InjectorClient, EventEmitter);

Object.defineProperties(InjectorClient.prototype, {
  /** @type {boolean} */
  needsConnect: {
    get: function() {
      return !this._noInject && !this._conn.connected;
    }
  },
  /** @type {boolean} */
  isConnected: {
    get: function() {
      return this._conn.connected;
    }
  }
});

/**
 * @param {string} sourceLine
 * @type {boolean}
 */
InjectorClient.prototype.tryHandleDebuggerBreak = function(sourceLine) {
  var pausedByInjector = this.containsInjectorMark(sourceLine);
  var handledByInjector = this.needsConnect && pausedByInjector;
  if (handledByInjector) {
    this._appPausedByInjector = true;
    this.connect();
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
InjectorClient.prototype.connect = function() {
  if (!this.needsConnect) {
    this.emit('connect', false);
    return;
  }

  if (!this._debuggerClient.isRunning) {
    if (this._appPausedByInjector) {
      this._injectServer(this._connect.bind(this), PARENT_CALL_FRAME);
    } else {
      this._ifRequireInFrame(
        this._injectServer.bind(this,
          this._connect.bind(this), CURRENT_CALL_FRAME));
    }
  } else {
    this._pause();
  }
};

/**
* @param {function(error, result)} done
*/
InjectorClient.prototype._ifRequireInFrame = function(done) {
  this._debuggerClient.request(
    'evaluate',
    {
      expression: 'require',
      frame: CURRENT_CALL_FRAME
    },
    done
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
 * @param {Object} error
 * @param {{value}} result
 */
InjectorClient.prototype._connect = function(error, result) {
  if (error) {
    /**
     * @event InjectorClient#error
     * @type {boolean}
     */
    this.emit('error', error);
  } else {
    var serverPort = result.value;
    this._conn = DebugConnection.attachDebugger(serverPort);
    this._conn
      .on('connect', this._onConnectionOpen.bind(this))
      .on('error', this._onConnectionError.bind(this))
      .on('close', this._onConnectionClose.bind(this));
    this._registerInjectorEventHandlers();
  }

  if (this._appPausedByInjector) {
    this._debuggerClient.request('continue');
    this._appPausedByInjector = false;
  }
};

InjectorClient.prototype._registerInjectorEventHandlers = function() {
  this._eventNames.forEach(function(name) {
    this._conn.on(name, this._emitInjectorEvent.bind(this, name));
  }, this);
  this._eventNames.length = 0;
};

/**
 * @param {...string} eventNames
 */
InjectorClient.prototype.registerInjectorEvents = function(eventNames) {
  for (var i in arguments) {
    var name = arguments[i];
    this._eventNames.push(name);
  }
};

InjectorClient.prototype._onConnectionOpen = function() {
  if (this._messagesCache.length) {
    this._messagesCache.forEach(function(message) {
      if (message.type === 'event') {
        this.sendEvent.apply(this, message.args);
      } else if (message.type === 'request') {
        this.request.apply(this, message.args);
      }
    }, this);
    this._messagesCache.length = 0;
  }
  /**
   * @event InjectorClient#connect
   * @type {boolean}
   * Emit true when connection opened.
   */
  this.emit('connect', true);
};

/**
 * @param {string} reason
 */
InjectorClient.prototype._onConnectionError = function(error) {
  /**
   * @event InjectorClient#error
   * @type {boolean}
   * Emit Error on connection error.
   */
  this.emit('error', error);
};

/**
 * @param {boolean} withErrors
 */
InjectorClient.prototype._onConnectionClose = function(withErrors) {
  this._conn = createFailingConnection();
  /**
   * @event InjectorClient#close
   * @type {boolean}
   * Emit withErrors=true if closed with errors.
   */
  this.emit('close', withErrors);
};

/**
 * @param {string} name
 * @param {{body}} message
 */
InjectorClient.prototype._emitInjectorEvent = function(name, message) {
  this.emit(name, message.body);
};

/**
 */
InjectorClient.prototype.close = function() {
  this._conn.close();
};

/**
 * @param {function(require, injector, options)} injection
 * @param {Object} options
 */
InjectorClient.prototype.inject = function(injection, options) {
  options = options || {};

  this._needsToInject.push(injection.toString());
  this._needsToInjectOptions.push(JSON.stringify(options));
};

/**
 * @param {function(error, result)} done
 * @param {Number} frameIndex
 * @param {Error} error
 */
InjectorClient.prototype._injectServer = function(done, frameIndex, error) {
  if (error) {
    done(error);
    return;
  }

  var injectorServerPath = JSON.stringify(require.resolve('./InjectorServer'));
  var injection = 'require(\'module\')._load(' + injectorServerPath + ')' +
                  '([' + this._needsToInject.join(',') + ']'+
                  ',[' + this._needsToInjectOptions.join(',') + '])';

  this._needsToInject = null;
  this._needsToInjectOptions = null;

  this._debuggerClient.request(
    'evaluate',
    {
      expression: injection,
      frame: frameIndex || CURRENT_CALL_FRAME
    },
    done
  );
};

/**
 * @param {string} eventName
 * @param {Object} messageBody
 */
InjectorClient.prototype.sendEvent = function(eventName, messageBody) {
  var message = {
    seq: 0,
    type: 'event',
    event: eventName,
    body: messageBody
  };
  if (this.isConnected) {
    this._conn.send(JSON.stringify(message));
  } else {
    this._messagesCache.push({type: 'event', args: [eventName, messageBody]});
  }
};

/**
 * @param {string} command
 * @param {!Object} args
 * @param {function(error, response, refs)} callback
 */
InjectorClient.prototype.request = function(command, args, callback) {
  if (typeof callback !== 'function') {
    callback = function(error) {
      if (!error) return;
      console.log('Warning: ignored Injector error. %s', error);
    };
  }
  if (this.isConnected) {
    this._conn.request(command, { arguments: args }, function(response) {
      if (!response.success)
        callback(response.message);
      else {
        callback(null, response.body);
      }
    });
  } else {
    this._messagesCache.push({type: 'request', args: [command, args, callback]});
  }
};

module.exports.InjectorClient = InjectorClient;
