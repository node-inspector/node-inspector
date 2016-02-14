'use strict';

var co = require('co');
var Net = require('net');
var Protocol = require('_debugger').Protocol;
var inherits = require('util').inherits;
var EventEmitter = require('events').EventEmitter;
var debugProtocol = require('debug')('node-inspector:protocol:v8-debug');
var CallbackHandler = require('./callback');

var ignore = () => {};

/**
* @param {Number} port
*/
function Debugger(port){
  this.running = true;

  this._port = port;
  this._connected = null;
  this._connection = null;
  this._lastError = null;
  this._ignoreErrors = false;

  this._handler = new CallbackHandler();
}
inherits(Debugger, EventEmitter);

Debugger.prototype.connected = function() {
  if (this._connected instanceof Promise) return this._connected;

  this._connection = Net.createConnection(this._port);
  var protocol = new Protocol();
  protocol.onResponse = this._processResponse.bind(this);

  return this._connected = new Promise((resolve, reject) => {
    this._connection
      .once('connect', () => resolve(reject))
      .once('error', reject);
  }).then((reject) => {
    this._connection
      .removeListener('error', reject)
      .on('data', protocol.execute.bind(protocol))
      .on('error', this._onConnectionError.bind(this))
      //.on('end', this._onConnectionClose.bind(this))
      .on('close', this._onConnectionClose.bind(this))
      .setEncoding('utf8');

    return true;
  });
};


/**
* @param {Error} err
*/
Debugger.prototype._onConnectionError = function(err) {
  if (this._ignoreErrors) return;

  if (err.code == 'ECONNREFUSED') {
    err.helpString = 'Is node running with --debug port ' + this._port + '?';
  } else if (err.code == 'ECONNRESET') {
    err.helpString = 'Check there is no other debugger client attached to port ' + this._port + '.';
  }

  this._lastError = err.toString();
  if (err.helpString) {
    this._lastError += '. ' + err.helpString;
  }

  this.emit('error', err);
};

Debugger.prototype._onConnectionClose = function(hadError) {
  var state = new ErrorDisconnected(hadError ? this._lastError : 'Debugged process exited.');

  this._connected = Promise.reject(state);
  this._port = null;
  this._connection = null;
  this._lastError = null;
  this._handler.clear(state);

  this.emit('close', state);
};

Debugger.prototype._processResponse = function(message) {
  var obj = message.body;

  if (typeof obj.running === 'boolean')
    this.running = obj.running;

  if (obj.type === 'response' && obj.request_seq > 0) {
    debugProtocol('response: ' + JSON.stringify(message.body).slice(0, 1000));
    return this._handler.handle(obj);
  }

  if (obj.type === 'event') {
    debugProtocol('event: ' + JSON.stringify(message.body).slice(0, 1000));

    if (['break', 'exception'].indexOf(obj.event) > -1)
      this.running = false;

    return this.emit('event', obj);
  }

  debugProtocol('unknown: ' + JSON.stringify(message.body).slice(0, 1000));
};

/**
* @param {string} data
*/
Debugger.prototype._send = function(data) {
  return co(function * () {
    yield this.connected();

    debugProtocol('request: ' + data);
    var message = `Content-Length: ${Buffer.byteLength(data, 'utf8')}\r\n\r\n${data}`;
    this._connection.write(message);
  }.bind(this));
};

/**
* @param {string} command
* @param {Object} params
*/
Debugger.prototype.request = function(command, params) {
  return co(function * () {
    yield this.connected();

    var handler = this._handler.promise();
    var message = Object.assign({
      seq: handler.seq,
      type: 'request',
      command: command
    }, params);

    yield this._send(JSON.stringify(message));

    return handler;
  }.bind(this));
};

/**
*/
Debugger.prototype.close = function() {
  var connection = this._connection;
  if (!connection) return Promise.resolve();

  //this._connected = Promise.reject(new ErrorDisconnected());
  //this._port = null;
  //this._connection = null;

  return co(function * () {
    this._ignoreErrors = true;
    yield this.request('disconnect').catch(console.log);
    if (!connection.destroyed)
      yield new Promise(resolve => connection.once('close', resolve).destroy());
  }.bind(this));
};

/**
 * @param {string} message
 * @constructor
 */
function ErrorDisconnected(message) {
  Error.call(this);
  this.name = ErrorDisconnected.name;
  this.message = message;
}

inherits(ErrorDisconnected, Error);

/**
* @param {Number} port
* @type {Debugger}
*/
module.exports = Debugger;
module.exports.Debugger = Debugger;
