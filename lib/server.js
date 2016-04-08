'use strict';

const WebSocketServer = require('ws').Server;
const Session = require('./session.js');

/**
 * 
 */
class DebugServer extends require('events') {
  /**
   * @param {node.HTTPServer} server
   */
  constructor(server) { super();
    // TODO(3y3): wspath
    this._wss = new WebSocketServer({server: server})
      .on('connection', socket => this.emit('connection', socket))
      .on('error', error => this.emit('error', error));
  }

  close() {
    const wss = this._wss;
    if (!wss) return;
    this._wss = null;

    wss.once('close', () => this.emit('close'));
    wss.close();
  }
}

module.exports = DebugServer;
