'use strict';

const EventEmitter = require('events');
const inherits = require('util').inherits;
const fs = require('fs');
const express = require('express');
const WebSocketServer = require('ws').Server;
const Router = require('./router.js');
const Session = require('./session.js');
const buildInspectorUrl = require('../index.js').buildInspectorUrl;
const buildWebSocketUrl = require('../index.js').buildWebSocketUrl;

function DebugServer(config, server, app) {
  config = config || {};
  app = app || express();

  this._config = config;
  this._isHTTPS = Boolean(config.sslKey && config.sslCert);

  if (!server) {
    if (this._isHTTPS) {
      server = require('https').createServer({
        key: fs.readFileSync(this._config.sslKey, {encoding: 'utf8'}),
        cert: fs.readFileSync(this._config.sslCert, {encoding: 'utf8'})
      }, app);
    } else {
      server = require('http').createServer(app);
    }
  }

  server
    .on('listening', () => typeof server.address() == 'string' &&
        process.once('exit', () => fs.unlinkSync(server.address())))
    .on('listening', () => app.use(new Router(config, this)))
    .on('listening', () => this.emit('listening'))
    .on('error', error => this.emit('error', error));

  this._app = app;
  this._server = server;
  this._wss = new WebSocketServer({server: server})
    .on('connection', socket => new Session(config, socket))
    .on('error', error => this.emit('error', error));

  server.listen(config.webPort, config.webHost);
}
inherits(DebugServer, EventEmitter);

DebugServer.prototype.close = function() {
  const wss = this._wss;
  if (!wss) return;
  this._wss = null;

  wss.once('close', () => this.emit('close')).close();
};

DebugServer.prototype.address = function() {
  const config = this._config;
  const address = this._server.address();
  const isUnixSocket = typeof address === 'string';
  const port = isUnixSocket ? address : address.port;
  const isHTTPS = this._isHTTPS;

  const args = [config.webHost, port, config.debugPort, isHTTPS];
  return {
    port: port,
    url: buildInspectorUrl.apply(null, args),
    ws: buildWebSocketUrl.apply(null, args),
    isUnixSocket: isUnixSocket
  };
};

module.exports = DebugServer;
module.exports.DebugServer = DebugServer;
