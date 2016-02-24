'use strict';

const format = require('util').format;
const debug = require('debug')('node-inspector:protocol:devtools');
const CommandHandler = require('./CommandHandler.js');
const ErrorNotConnected = require('../DebuggerClient/DebuggerClient.js').ErrorNotConnected;
const ErrorNotImplemented = require('../Agents/BaseAgent.js').ErrorNotImplemented;

/**
 * FrontendClient encapsulates communication with front-end running in browser.
 * @extends EventEmitter
 */
class FrontendClient extends require('events') {
  /**
   * @param {Config} config
   * @param {Session} session
   */
  constructor(config, session) { super();
    this._handler = new CommandHandler(config, session);

    this._connection = session.client;

    this._connection.on('close', () => this._onConnectionClose());
    this._connection.on('message', (message) => this._onConnectionMessage(message));

    session.on('close', (reason) => this._onSessionClose(reason));
    session.on('error', (reason) => this._onSessionError(reason));
  }

  /**
   * Keeps frontend connection active
   */
  heartbeet() {
    if (!this._connection) return;
    this._connection.ping(null, null, true);
    setTimeout(() => this.heartbeet(), 1000);
  }

  /**
   * @param {Object} request
   */
  handleCommand(request) {
    return this._handler.handleCommand(request);
  }

  /**
   *
   */
  registerCommand(command, handler) {
    return this._handler.registerCommand(command, handler);
  }

  /**
   * Send a succeseful response for a front-end request.
   * @param {Object} request - request object from front-end
   * @param {*} result
   */
  sendResponse(request, result) {
    this._sendMessage({
      id: request.id,
      result: result
    });
  }

  /**
   * Send an error response for a front-end request.
   * @param {Object} request - request object from front-end
   * @param {*} error
   */
  sendError(request, error) {
    if (error instanceof ErrorNotConnected)
      this.sendInspectorDetached(error.message);
    else if (error instanceof ErrorNotImplemented)
      console.log('Received request for a method not implemented:', method);
    // else
    //   this.sendLogToConsole('error', request.method + ' failed.\n' + error);

    this._sendMessage({
      id: request.id,
      error: error
    });
  }

  /**
   * Send an event to the front-end.
   * @param {string} eventName Event name in form 'Agent.method'.
   * @param {Object=} data Event data (method arguments).
   */
  emitEvent(eventName, data) {
    this._sendMessage({
      method: eventName,
      params: data || {}
    });
  }

  /**
   * Ask frontend to add a new log into console window.
   * @param {String} level - Message level (error, warning, log, debug).
   * @param {!Array|String} args
   */
  sendLogToConsole(level, args) {
    args = [].concat(args);

    this.emitEvent('Console.showConsole');
    this.emitEvent('Console.messageAdded', {
      message: {
        source: 3,
        type: 0,
        level: level,
        line: 0,
        column: 0,
        url: '',
        groupLevel: 7,
        repeatCount: 1,
        text: format.apply(this, args)
      }
    });
  }

  /**
   * Shortcut for emitEvent('Inspector.detached', reason).
   * @param {String} reason
   */
  sendInspectorDetached(reason) {
    this.emitEvent('Inspector.detached', { reason: reason });
  }

  /**
   * @private
   */
  _onSessionClose(reason) {
    if (this._connection)
      this.sendInspectorDetached(reason.message || reason);
  }

  _onSessionError(error) {
    this.sendLogToConsole('error', error);
  }

  /**
   * @private
   */
  _onConnectionClose() {
    clearInterval(this._heartbeet);
    this._connection = null;
    this.emit('close');
  }

  /**
   * Front-end messages handler.
   * Sends to front-end response or error if handler was throwned.
   * @private
   * @param {String} message - message string received from front-end
   */
  _onConnectionMessage(message) {
    debug('frontend: ' + message);
    const request = JSON.parse(message);
    return this.handle(request)
      .then(result => this.sendResponse(request, result))
      .catch(error => this.sendError(request, error));
  }

  /**
   * Sends a stringified message to front-end.
   * @private
   * @param {Object} message
   */
  _sendMessage(message) {
    const payload = JSON.stringify(message);
    debug('backend: ' + payload);

    if (!this._connection) return this._logNoConnection();

    this._connection.send(payload);
  }

  /**
   * @private
   */
  _logNoConnection() {
    this._logNoConnection = function() {};
    console.log('Cannot send response - there is no front-end connection.');
  }
}

module.exports = FrontendClient;
