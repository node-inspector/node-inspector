#!/usr/bin/env node

const express = require('express');
const app = express();

module.exports = function(config, Inspector) {
  console.log('Node Inspector v%s', Inspector.version);

  const isHTTPS = Boolean(config.sslKey && config.sslCert);

  const server = !isHTTPS ? require('http').createServer(app) :
    require('https').createServer({
      key: fs.readFileSync(config.sslKey, {encoding: 'utf8'}),
      cert: fs.readFileSync(config.sslCert, {encoding: 'utf8'})
    }, app);

  server.listen(config.webPort, config.webHost);
  server.on('listening', () => {
    const debug = new Inspector.Server(config, server);

    const address = server.address();
    const isUnixSocket = typeof address === 'string';
    const port = isUnixSocket ? address : address.port;
    const args = [config.webHost, port, config.debugPort, isHTTPS];
    const info = {
      port: port,
      url: Inspector.buildInspectorUrl.apply(null, args),
      ws: Inspector.buildWebSocketUrl.apply(null, args),
      isUnixSocket: isUnixSocket
    };

    app.use('/', new Inspector.Router(info));

    debug.on('close', onClose.bind(null, info));
    debug.on('error', onError.bind(null, info));

    notify({ event: 'SERVER.LISTENING', address: info });
    console.log('Visit %s to start debugging.', info.url);
  });
}

function onError(info, error) {
  console.error(
    'Cannot start the server at %s. Error: %s.',
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

function onClose(info) {
  if (info.isUnixSocket) {
     fs.unlinkSync(info.port);
  }
  process.exit();
}

function notify(msg) {
  if (!process.send) return;

  process.send(msg);
}
