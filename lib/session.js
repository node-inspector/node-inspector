'use strict';

const url = require('url');
const DebuggerClient = require('./DebuggerClient/DebuggerClient.js');
const FrontendClient = require('./FrontendClient/FrontendClient.js');
const InjectorClient = require('./InjectorClient/InjectorClient.js');
const ScriptManager = require('./ScriptManager/ScriptManager.js');

class Session extends require('events') {
  constructor(config, socket) { super();
    this.port = port(config, socket);
    this.client = socket;

    this.debugger = new DebuggerClient(config, this);
    this.frontend = new FrontendClient(config, this);
    this.injector = new InjectorClient(config, this);
    this.scripts = new ScriptManager(config, this);

    [
      './Agents/Console/ConsoleAgent.js',
      './Agents/Debugger/DebuggerAgent.js',
      './Agents/HeapProfiler/HeapProfilerAgent.js',
      './Agents/Network/NetworkAgent.js',
      './Agents/Page/PageAgent.js',
      './Agents/Profiler/ProfilerAgent.js',
      './Agents/Runtime/RuntimeAgent.js'
    ].forEach((path) => new (require(path))(config, this));

    // Keep frontend connection active.
    // Useful behind proxies
    this.frontend.heartbeat();

    const close = (reason) => {
      process.removeListener('SIGINT', exit);
      process.removeListener('SIGQUIT', exit);
      return this.close(reason);
    };

    const exit = () => {
      close.then(() => process.exit(0));
    };

    this.frontend.on('close', close);
    this.debugger.on('close', close);
    this.debugger.on('error', this.emit.bind(this, 'error'));
    process.on('SIGINT', exit);
    process.on('SIGQUIT', exit);
  }

  close(reason) {
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

function port(config, socket) {
  const query = url.parse(socket.upgradeReq.url, true).query;
  return query && query.port || config.debugPort;
}

module.exports = Session;
