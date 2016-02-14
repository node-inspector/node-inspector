'use strict';

const scope = (context, name) => `${context.name}.${name}`;

class ErrorNotImplemented extends Error {
  /**
   * @param {string} message
   */
  constructor(method) { super();
    this.message = 'Not implemented. ' + method;
  }
}

class BaseAgent extends require('events') {
  static get ErrorNotImplemented() { return ErrorNotImplemented; }

  /**
   * @param {String} name - agent name
   * @param {Config} config
   * @param {Session} session
   */
  constructor(name, config, session) { super();
    this.name = name;
    this.config = config;
    this.session = session;

    this._commands = [];
    this._ready = Promise.resolve();
  }

  /**
   * @param {String} command - command name (without agent name)
   * @param {function(params)} [handler] - command handler. By default translates to debugger.
   */
  registerCommand(command, handler) {
    if (typeof handler !== 'function')
      handler = this._toDebugger(command);

    this._commands[command] = handler;
  }

  /**
   * Sends a request to debugger in context of current agent
   * @param {String} command
   * @param {Object} params
   */
  request(command, params) {
    return this.session.debugger.request(scope(this, command), params);
  }

  /**
   * @param {String} event - event name (without agent name)
   * @param {function(params)} [handler] - event handler. By default translates to frontend.
   */
  registerEvent(event, handler) {
    if (typeof handler !== 'function')
      handler = this._toFrontend(event);

    this.session.debugger.on(scope(this, event), handler);
  }

  /**
   * @param {String} event - event name (without agent name)
   * @param {Object} [message]
   */
  emitEvent(event, message) {
    this.session.frontend.emitEvent(scope(this, event), message);
  }

  /**
   * Tries to handle command in context of current agent
   * Throws an error if commain is not implemented
   *
   * @param {String} command - command name (without agent name)
   * @param {Object} [params]
   */
  handle(command, params) {
    const handler = this._commands[command];

    if (!handler)
      throw new ErrorNotImplemented(scope(this, command));

    return this.ready()
      .then(() => handler(params || {}));
  }

  /**
   * Sends to frontend helpful info
   *
   * @param {String} level - like console level
   */
  notify(level) {
    var args = Array.prototype.slice.call(arguments, 1);
    this.session.frontend.sendLogToConsole(level, args);
  }

  /**
   * Checks that agent is ready to data processing
   * Override `_ready` promise by your own realisation
   */
  ready() {
    return this._ready;
  }

  /**
   * Translates event to frontend without processing
   * @param {String} event
   */
  _toFrontend(event) {
    return (message) => this.emitEvent(event, message);
  }

  /**
   * Translates command to debugger without processing
   * @param {String} command
   */
  _toDebugger(command) {
    return (params) => this.request(command, params);
  }
}

module.exports = BaseAgent;
