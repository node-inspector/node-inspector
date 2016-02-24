'use strict';

const co = require('co');
const DebuggerConnection = require('./DebuggerConnection.js');

class DebuggerClient extends require('events') {
  static get ErrorNotConnected() { return ErrorNotConnected; }

  /**
   * @param {Config} config
   * @param {Session} session
   */
  constructor(config, session) { super();
    this._connection = null;
    this._connected = null;
    this._ready = null;
    this._target = null;
    this._port = session.port;
  }

  /**
   * Checks DebuggerConnection activity
   * Opens new connection if doesn't previously disconnected
   * Otherwise returns ErrorNotConnected with reason `disconnected`
   */
  connected() {
    if (this._connected) return this._connected;

    return this._connected = co(function * () {
      this._connection = new DebuggerConnection(this._port);

      yield this._connection.connected();

      this._connection
        .once('close', this._onConnectionClose.bind(this))
        .on('event', message => this.emit(message.event, message.body));

      return true;
    }.bind(this)).catch(
      error => Promise.reject(new ErrorNotConnected(error))
    );
  }

  /**
   * Collect basic information about debugged process
   * @returns {{pid, cwd, filename, version}}
   */
  target() {
    if (this._target) return this._target;

    // We need to update isRunning flag before we continue with debugging.
    // Send a dummy request so that we can read the state from the response.
    // We also need to get node version of the debugged process,
    // therefore the dummy request is `evaluate 'process.version'`
    const describeProgram = function() {
      return {
        pid: process.pid,
        cwd: process.cwd(),
        filename: process.mainModule ? process.mainModule.filename : process.argv[1],
        version: process.version
      };
    };

    return this._target = this._evaluateGlobal('(' + describeProgram + ')()');
  }

  /**
   * Checks that debugger ready to process commands
   * @returns {Object} Basic information about debugged process
   */
  ready() {
    if (this._ready) return this._ready;

    return this._ready = this.target();
  }

  /**
   * Checks that debugged process is not paused
   * @returns {Boolean}
   */
  running() {
    return co(function * () {
      yield this.ready();
      return this._connection.running;
    }.bind(this));
  }

  /**
   * Checks that debugged process is paused
   * @returns {Boolean}
   */
  paused() {
    return co(function * () {
      yield this.ready();
      return !this._connection.running;
    }.bind(this));
  }

  /**
   * Sends command request to debugged process
   * @param {String} command
   * @param {Object} params
   * @throws {Error} Request execution error
   * @returns {Object} Request result
   */
  request(command, params) {
    return co(function * () {
      yield this.connected();
      // Note: we must not add args object if it was not sent.
      // E.g. resume (V8 request 'continue') has diffirent
      // behavior when args are empty object instead of undefined
      if (params && params.maxStringLength == null)
        params.maxStringLength = -1;

      const response = yield this._connection.request(command, { arguments: params });
      if (response.refs)
        response.body.refs = response.refs.reduce((obj, ref) => {
          obj[ref.handle] = ref;
          return obj;
        }, {});

      return response.body;
    }.bind(this));
  }

  close() {
    if (!this._connection) return Promise.resolve();

    return this._connection.close();
  }

  _onConnectionClose(reason) {
    this._connection = null;
    this._connected = Promise.reject(new ErrorNotConnected(reason));
    this._ready = null;
    this._target = null;
    this.emit('close', reason);
  };

  _evaluateGlobal(expression) {
    return this.request('evaluate', {
      expression: 'JSON.stringify(' + expression + ')',
      global: true
    }).then(result => JSON.parse(result.value));
  }
}


class ErrorNotConnected extends Error {
  /**
   * @param {string} message
   */
  constructor(message) { super();
    message = message || '';
    message = message.message || message;
    this.message = message || 'Debugger is not connected to process.'
    if (message.stack) this.stack = message.stack;
  }
}

module.exports = DebuggerClient;
