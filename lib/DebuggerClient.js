var EventEmitter = require('events').EventEmitter,
  inherits = require('util').inherits,
  DebugConnection = require('./debugger.js');

function createFailingConnection(reason) {
  return {
    isRunning: false,

    request: function(command, args, callback) {
      callback({ message: new ErrorNotConnected(reason) });
    },

    close: function() {
    }
  };
}

/**
 * @constructor
 * @param {number} debuggerPort
 */
function DebuggerClient(debuggerPort) {
  this._conn = createFailingConnection('node-inspector server was restarted');
  this._port = debuggerPort;
}

inherits(DebuggerClient, EventEmitter);

Object.defineProperties(DebuggerClient.prototype, {
  /** @type {boolean} */
  isRunning: {
    get: function() {
      return this._conn.isRunning;
    }
  }
});

DebuggerClient.prototype.connect = function() {
  this._conn = DebugConnection.attachDebugger(this._port);

  this._conn.
    on('connect', this.emit.bind(this, 'connect')).
    on('error', this.emit.bind(this, 'error')).
    on('close', this._onConnectionClose.bind(this));

  this._registerDebuggerEventHandlers('break', 'afterCompile', 'exception');
};


/**
 * @param {...string} eventNames
 */
DebuggerClient.prototype._registerDebuggerEventHandlers = function(eventNames) {
  for (var i in arguments) {
    var name = arguments[i];
    this._conn.on(name, this._emitDebuggerEvent.bind(this, name));
  }
};

/**
 * @param {string} reason
 */
DebuggerClient.prototype._onConnectionClose = function(reason) {
  this._conn = createFailingConnection(reason);
  this.emit('close', reason);
};

/**
 * @param {string} name
 * @param {Object} message
 */
DebuggerClient.prototype._emitDebuggerEvent = function(name, message) {
  this.emit(name, message.body);
};

/**
 * @param {string} command
 * @param {!Object} args
 * @param {function(error, response, refs)} callback
 */
DebuggerClient.prototype.request = function(command, args, callback) {
  if (typeof callback !== 'function') {
    callback = function(error) {
      if (!error) return;
      console.log('Warning: ignored V8 debugger error. %s', error);
    };
  }

  this._conn.request(command, { arguments: args }, function(response) {
    var refsLookup;
    if (!response.success)
      callback(response.message);
    else {
      refsLookup = {};
      if (response.refs)
        response.refs.forEach(function(r) { refsLookup[r.handle] = r; });
      callback(null, response.body, refsLookup);
    }
  });
};

/**
 */
DebuggerClient.prototype.close = function() {
  this._conn.close();
};

/**
 * @param {number} breakpointId
 * @param {function(error, response, refs)} done
 */
DebuggerClient.prototype.clearBreakpoint = function(breakpointId, done) {
  this.request(
    'clearbreakpoint',
    {
      breakpoint: breakpointId
    },
    done
  );
};

/**
 * @param {string} message
 * @constructor
 */
function ErrorNotConnected(message) {
  Error.call(this);
  this.name = ErrorNotConnected.name;
  this.message = message;
}

inherits(ErrorNotConnected, Error);

exports.DebuggerClient = DebuggerClient;
exports.ErrorNotConnected = ErrorNotConnected;
