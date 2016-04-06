'use strict';

const url = require('url');
const manifest = require('./manifest.js');

const sessions = [];
const exit = () => sessions.map(session => session.close());

process.once('SIGINT', exit);
process.once('SIGQUIT', exit);

class Session extends require('events') {
  constructor(config, socket) { super();
    this.port = port(config, socket);
    this.client = socket;

    this.debugger = new Session.DebuggerClient(config, this);
    this.frontend = new Session.FrontendClient(config, this);
    this.injector = new Session.InjectorClient(config, this);
    this.scripts = new Session.ScriptManager(config, this);

    manifest.inspector.agents.forEach((agent) => {
      const Agent = require(agent.path);
      return new Agent(config, this);
    });

    // Keep frontend connection active.
    // Useful behind proxies
    this.frontend.heartbeat();

    const close = (reason) => this.close(reason);

    this.frontend.on('close', close);
    this.debugger.on('close', close);
    this.debugger.on('error', this.emit.bind(this, 'error'));

    sessions.push(this);
  }

  close(reason) {
    sessions.splice(sessions.indexOf(this), 1);
    return this.debugger.close()
      .then(() => this.emit('close', reason));
  }

  /**
   * Shortcut for InjectorClient.inject
   * @param {Object} options
   */
  inject(options) {
    return this.injector.inject(options);
  }

  /**
   * Shortcut for DebuggerClient.request
   * @param {String} command
   * @param {Object} params
   */
  request(command, params) {
    return this.debugger.request(command, params);
  }

  /**
   * Shortcut for FrontendClient.registerCommand
   * @param {String} command
   * @param {Function} handler
   */
  registerCommand(command, handler) {
    return this.frontend.registerCommand(commnad, handler);
  }
}

Session.DebuggerClient = require('./DebuggerClient/DebuggerClient.js');
Session.FrontendClient = require('./FrontendClient/FrontendClient.js');
Session.InjectorClient = require('./InjectorClient/InjectorClient.js');
Session.ScriptManager = require('./ScriptManager/ScriptManager.js');

function port(config, socket) {
  const query = url.parse(socket.upgradeReq.url, true).query;
  return query && query.port || config.debugPort;
}

module.exports = Session;
