var extend = require('util')._extend;
var EventEmitter = require('events').EventEmitter,
  inherits = require('util').inherits,
  DebugConnection = require('./debugger.js');

function createFailingConnection(reason) {
  return {
    connected: false,
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

  this.target = null;
}

inherits(DebuggerClient, EventEmitter);

Object.defineProperties(DebuggerClient.prototype, {
  /** @type {boolean} */
  isRunning: {
    get: function() {
      return this._conn.isRunning;
    }
  },

  isConnected: {
    get: function() {
      return this._conn.connected;
    }
  },

  isReady: {
    get: function() {
      return this._conn.connected && !!this.target;
    }
  }
});

DebuggerClient.prototype.connect = function() {
  this._conn = DebugConnection.attachDebugger(this._port);

  this._conn.
    on('connect', this._onConnectionOpen.bind(this)).
    on('error', this.emit.bind(this, 'error')).
    on('close', this._onConnectionClose.bind(this));

  this.registerDebuggerEventHandlers('break', 'afterCompile', 'compileError', 'exception');
};


/**
 * @param {...string} eventNames
 */
DebuggerClient.prototype.registerDebuggerEventHandlers = function(eventNames) {
  for (var i in arguments) {
    var name = arguments[i];
    this._conn.on(name, this._emitDebuggerEvent.bind(this, name));
  }
};

DebuggerClient.prototype._onConnectionOpen = function() {
  // We need to update isRunning flag before we continue with debugging.
  // Send a dummy request so that we can read the state from the response.
  // We also need to get node version of the debugged process,
  // therefore the dummy request is `evaluate 'process.version'`

  var describeProgram = '(' + function() {
    return {
      pid: process.pid,
      cwd: process.cwd(),
      filename: process.mainModule ? process.mainModule.filename : process.argv[1],
      nodeVersion: process.version
    };
  } + ')()';

  this.evaluateGlobal(describeProgram, function(error, result) {
    this.target = result;
    this.emit('connect');
  }.bind(this));
};

/**
 * @param {string} reason
 */
DebuggerClient.prototype._onConnectionClose = function(reason) {
  this._conn = createFailingConnection(reason);
  this.target = null;
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

  // Note: we must not add args object if it was not sent.
  // E.g. resume (V8 request 'continue') does no work
  // correctly when args are empty instead of undefined
  if (args && args.maxStringLength == null)
    args.maxStringLength = -1;

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
  if (this.isConnected)
    this._conn.close();
  else
    this.emit('close');
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
 * @param {string} expression
 * @param {function(error, response)} done
 */
DebuggerClient.prototype.evaluateGlobal = function(expression, done) {
  // Note: we can't simply evaluate JSON.stringify(`expression`)
  // because V8 debugger protocol truncates returned value to 80 characters
  // The workaround is to split the serialized value into multiple pieces,
  // each piece 80 characters long, send an array over the wire,
  // and reconstruct the value back here
  var code = 'JSON.stringify(' + expression + ').match(/.{1,80}/g).slice()';
  this.request(
    'evaluate',
    {
      expression: code,
      global: true
    },
    function _handleEvaluateResponse(err, result, refs) {
      if (err) return done(err);

      if (result.type != 'object' && result.className != 'Array') {
        return done(
          new Error(
            'Evaluate returned unexpected result:' +
              ' type: ' + result.type +
              ' className: ' + result.className
          )
        );
      }

      var fullJsonString = result.properties
        .filter(function isArrayIndex(p) { return /^\d+$/.test(p.name);})
        .map(function resolvePropertyValue(p) { return refs[p.ref].value; })
        .join('');

      try {
        done(null, JSON.parse(fullJsonString));
      } catch (e) {
        console.error('evaluateGlobal "%s" failed', expression);
        console.error(e.stack);
        console.error('--json-begin--\n%s--json-end--', fullJsonString);
        done(e);
      }
    }
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
