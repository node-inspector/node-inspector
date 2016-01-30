'use strict';

var co = require('co');
var EventEmitter = require('events').EventEmitter;
var inherits = require('util').inherits;
var DebugConnection = require('./debugger.js');

/**
 * @constructor
 * @param {number} debuggerPort
 */
function DebuggerClient(debuggerPort) {
  this._connection = null;
  this._connected = null;
  this._ready = null;
  this._target = null;
  this._port = debuggerPort;
}

inherits(DebuggerClient, EventEmitter);

DebuggerClient.prototype.connected = function() {
  if (this._connected instanceof Promise) return this._connected;

  return this._connected = co(function * () {
    this._connection = new DebugConnection(this._port);

    yield this._connection.connected();

    this._connection
      .on('error', this.emit.bind(this, 'error'))
      .on('close', this._onConnectionClose.bind(this))
      .on('event', message => this.emit(message.event, message.body));

    return true;
  }.bind(this)).catch(
    error => Promise.reject(new ErrorNotConnected(error))
  );
};

DebuggerClient.prototype.target = function() {
  if (this._target instanceof Promise) return this._target;

  // We need to update isRunning flag before we continue with debugging.
  // Send a dummy request so that we can read the state from the response.
  // We also need to get node version of the debugged process,
  // therefore the dummy request is `evaluate 'process.version'`
  var describeProgram = function() {
    return {
      pid: process.pid,
      cwd: process.cwd(),
      filename: process.mainModule ? process.mainModule.filename : process.argv[1],
      nodeVersion: process.version
    };
  };

  return this._target = this._evaluateGlobal('(' + describeProgram + ')()');
};

DebuggerClient.prototype.ready = function() {
  if (this._ready instanceof Promise) return this._ready;

  return this._ready = this.target();
};

DebuggerClient.prototype.running = function() {
  return co(function * () {
    yield this.ready();
    return this._connection.running;
  }.bind(this));
};

DebuggerClient.prototype.paused = function() {
  return co(function * () {
    yield this.ready();
    return !this._connection.running;
  }.bind(this));
};

DebuggerClient.prototype.break = function() {
  return new Promise((resolve, reject) => {
    this.once('break', resolve);
    this.once('error', reject);
  });
};

DebuggerClient.prototype.exception = function() {
  return new Promise((resolve, reject) => {
    this.once('exception', resolve);
    this.once('error', reject);
  });
};

/**
 * @param {string} reason
 */
DebuggerClient.prototype._onConnectionClose = function(reason) {
  this._connection = null;
  this._connected = Promise.reject(new ErrorNotConnected(reason));
  this._ready = null;
  this._target = null;
  this.emit('close', reason);
};

/**
 * @param {string} command
 * @param {!Object} args
 */
DebuggerClient.prototype.request = function(command, args) {
  return co(function * () {
    yield this.connected();
    // Note: we must not add args object if it was not sent.
    // E.g. resume (V8 request 'continue') does no work
    // correctly when args are empty instead of undefined
    if (args && args.maxStringLength == null)
      args.maxStringLength = -1;

    var response = yield this._connection.request(command, { arguments: args });
    if (response.refs)
      response.body.refs = response.refs.reduce((obj, ref) => {
        obj[ref.handle] = ref;
        return obj;
      }, {});

    return response.body;
  }.bind(this));
};

/**
 */
DebuggerClient.prototype.close = function() {
  if (!this._connection) return Promise.resolve();

  return this._connection.close();
};

/**
 * @param {string} expression
 * @param {function(error, response)} done
 */
DebuggerClient.prototype._evaluateGlobal = function(expression, done) {
  return this.request('evaluate', {
    expression: 'JSON.stringify(' + expression + ')',
    global: true
  }).then(result => JSON.parse(result.value));
};

/**
 * @param {string} message
 * @constructor
 */
function ErrorNotConnected(message) {
  Error.call(this);
  this.name = ErrorNotConnected.name;
  this.message = message.message || message;
}

inherits(ErrorNotConnected, Error);

module.exports = DebuggerClient;
module.exports.DebuggerClient = DebuggerClient;
module.exports.ErrorNotConnected = ErrorNotConnected;
