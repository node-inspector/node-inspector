var extend = require('util')._extend;
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

  // Note: we must not add args object if it was not sent.
  // E.g. resume (V8 request 'continue') does no work
  // correctly when args are empty instead of undefined
  if (args && args.maxStringLength == null)
    args.maxStringLength = 10000;

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
 * @param {number} id
 * @param {function(Object, string?)} callback
 */
DebuggerClient.prototype.getScriptSourceById = function(id, callback) {
  this.request(
    'scripts',
    {
      includeSource: true,
      types: 4,
      ids: [id]
    },
    function handleScriptSourceResponse(err, result) {
      if (err) return callback(err);

      // Some modules gets unloaded (?) after they are parsed,
      // e.g. node_modules/express/node_modules/methods/index.js
      // V8 request 'scripts' returns an empty result in such case
      var source = result.length > 0 ? result[0].source : undefined;

      callback(null, source);
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
