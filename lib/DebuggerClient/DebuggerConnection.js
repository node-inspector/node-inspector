'use strict';

const co = require('co');
const on = require('promonce');
const Net = require('net');
const Protocol = require('_debugger').Protocol;
const debug = require('debug')('node-inspector:protocol:v8-debug');
const CallbackHandler = require('./CallbackHandler.js');

const connections = {};

function ignore() {}

function trim(data, length) {
  if (typeof data !== 'string') data = JSON.stringify(data);
  return data.slice(0, length);
}

/**
* @param {Number} port
*/
class DebuggerConnection extends require('events') {
  static get ErrorDisconnected() { return ErrorDisconnected; }

  constructor(port) { super();
    this.running = true;

    this._port = port;
    this._connected = null;
    this._connection = null;
    this._lastError = null;
    this._ignoreErrors = false;

    this._handler = new CallbackHandler();
    this._protocol = new Protocol();

    this._protocol.onResponse = this._processResponse.bind(this);
  }

  close() {
    if (!this._connection) return Promise.resolve();

    return co(function * () {
      yield this.request('disconnect').catch(ignore);
      if (this._connection.destroyed) return;

      this._connection.destroy();
      yield on(this._connection, 'close');
    }.bind(this));
  }

  connected() {
    if (this._connected) return this._connected;

    return this._connected = co(function * () {
      this._connection = connections[this._port] || Net.createConnection(this._port);

      yield on(this._connection, 'connect', 'error');
      connections[this._port] = this._connection;

      this._connection
        .on('data', this._protocol.execute.bind(this._protocol))
        .once('error', this._onConnectionError.bind(this))
        .once('close', this._onConnectionClose.bind(this))
        .setEncoding('utf8');

      return true;
    }.bind(this));
  }

  _onConnectionError(error) {
    // If there is no other error handlers, we should ignore `error` event
    // instead of throwning on uncaught error
    this._connection.on('error', ignore);

    let info = '';

    if (error.code == 'ECONNREFUSED')
      info = `Is node running with --debug port ${this._port}?`;

    error = new ErrorDisconnected(`${error.message}\n${info}`);

    this._onConnectionClose(error);
  }

  _onConnectionClose(error) {
    error = error || new ErrorDisconnected();
    connections[this._port] = null;
    this._handler.clear(error);
    this.emit('close', error);
  }

  _processResponse(message) {
    const data = message.body;

    if (typeof data.running === 'boolean')
      this.running = data.running;

    if (data.type === 'response' && data.request_seq > 0) {
      debug('response: ' + trim(message.body, 1000));
      return this._handler.handle(data);
    }

    if (data.type === 'event') {
      debug('event: ' + trim(message.body, 1000));

      if (['break', 'exception'].indexOf(data.event) > -1)
        this.running = false;

      return this.emit('event', data);
    }

    debug('unknown: ' + trim(message.body, 1000));
  }


  /**
  * @param {string} command
  * @param {Object} params
  */
  request(command, params) {
    return co(function * () {
      yield this.connected();

      const handler = this._handler.promise();

      const message = JSON.stringify(Object.assign({
        seq: handler.seq,
        type: 'request',
        command: command
      }, params));
      const length = Buffer.byteLength(message, 'utf8');

      this._connection.write(`Content-Length: ${length}\r\n\r\n${message}`);
      debug('request: ' + message);

      return handler;
    }.bind(this));
  }
}


class ErrorDisconnected extends Error {
  /**
   * @param {string} message
   */
  constructor(message) { super();
    this.message = `Debugged process exited.${message ? '\n' + message : ''}`;
  }
}

module.exports = DebuggerConnection;
