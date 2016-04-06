'use strict';

const co = require('co');
const on = require('promonce');
const express = require('express');
const app = express();

module.exports = function(config, Inspector) {
  return co(function * () {
    console.log('Node Inspector v%s', Inspector.version);

    const isHTTPS = Boolean(config.sslKey && config.sslCert);
    const isUnixSocket = /[^0-9]/.test(config.webPort);
    const args = [config.webHost, config.webPort, config.debugPort, isHTTPS];
    const info = {
      port: config.webPort,
      url: Inspector.buildInspectorUrl.apply(null, args),
      ws: Inspector.buildWebSocketUrl.apply(null, args),
      isUnixSocket: isUnixSocket
    };

    const server = !isHTTPS ?
      require('http').createServer(app) :
      require('https').createServer({
        key: fs.readFileSync(config.sslKey, {encoding: 'utf8'}),
        cert: fs.readFileSync(config.sslCert, {encoding: 'utf8'})
      }, app);

    const debug = new Inspector.Server(config, server);

    debug.once('error', onError.bind(null, info));
    debug.once('close', onClose.bind(null, info));

    server.listen(config.webPort, config.webHost);
    yield on(server, 'listening');

    app.use('/', new Inspector.Router(info));

    notify({ event: 'SERVER.LISTENING', address: info });
    console.log('Visit %s to start debugging.', info.url);

    info.server = debug;
    return info;
  });
}

function onError(info, error) {
  console.error(
    'Cannot start the server at %s.\nError: %s.\n',
    info.url,
    error.message || error
  );

  if (error.code === 'EADDRINUSE') {
    console.error(
      'There is another process already listening at this address.\n' +
      'Run `node-inspector --web-port={port}` to use a different port.'
    );
  }

  notify({ event: 'SERVER.ERROR', error: error });
}

function onClose(info, reason) {
  if (info.isUnixSocket) {
     fs.unlinkSync(info.port);
  }
  process.exit(reason ? 1 : 0);
}

function notify(msg) {
  if (!process.send) return;

  process.send(msg);
}
