'use strict';

const url = require('url');
const DebuggerClient = require('./DebuggerClient/DebuggerClient.js');
const ScriptManager = require('./ScriptManager/ScriptManager.js');
const FrontendClient = require('./FrontendClient.js');
const InjectorClient = require('./InjectorClient/InjectorClient.js');

class Session extends require('events') {
  constructor(config, socket) { super();
    this.port = port(config, socket);
    this.client = socket;

    this.debugger = new DebuggerClient(config, this);
    this.frontend = new FrontendClient(config, this);
    this.injector = new InjectorClient(config, this);
    this.scripts = new ScriptManager(config, this);

    this.frontend.on('close', this.close.bind(this));
    this.debugger.on('close', this._onDebuggerClientClose.bind(this));
    this.debugger.on('error', this._onDebuggerClientError.bind(this));

    process.on('SIGINT', () => this.close().then(() => process.exit(0)));
    process.on('SIGQUIT', () => this.close().then(() => process.exit(0)));
  }

  close() {
    return this.debugger.close()
      .then(() => this.emit('close'));
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

  _onDebuggerClientClose(reason) {
    if (this.frontend.isConnected)
      this.frontend.sendInspectorDetached(reason);
    this.close();
  }

  _onDebuggerClientError(error) {
    this.frontend.sendLogToConsole('error', formatError(error));
  }
}

function port(config, socket) {
  const query = url.parse(socket.upgradeReq.url, true).query;
  return query && query.port || config.debugPort;
}

function formatError(error) {
  // TODO (3y3): refactor this
  let err = error.toString();
  if (error.helpString) {
    err += '\n' + error.helpString;
  }
  return err;
}

module.exports = Session;
