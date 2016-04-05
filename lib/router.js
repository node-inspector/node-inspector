'use strict';

const path = require('path');
const express = require('express');
const favicon = require('serve-favicon');

const manifest = require('./manifest.js');
const plugins = require('./plugins.js');
const Inspector = plugins.Inspector;
const Protocol = plugins.Protocol;

const json = (data) => (req, res) => res.json(data);
const resolve = (_path) => path.resolve(__dirname, _path);

const FAVICON = resolve('../front-end-node/Images/favicon.png');
const OVERRIDES = resolve('../front-end-node');
const WEBROOT = resolve('../front-end');

class GlobalRouter extends express.Router {
  constructor(serverInfo) { super();
    const jsonActionJson = jsonAction(serverInfo);
    const jsonVersionActionJson = jsonVersionAction();
    const inspectorJson = new Inspector(manifest);
    const protocolJson = new Protocol(manifest);
    const externalRouter = new ExternalRouter(manifest);
    const emptyJson = {};

    this
      .use(favicon(FAVICON))

    // Json handshake
      .get('/json', json(jsonActionJson))
      .get('/json/list', json(jsonActionJson))
      .get('/json/version', json(jsonVersionActionJson))

    // Dynamically generated front-end content
      .get('/inspector.json', json(inspectorJson))
      .get('/protocol.json', json(protocolJson))
      .get('/InspectorBackendCommands.js', json(emptyJson))
      .get('/SupportedCSSProperties.js', json(emptyJson))

    // Main routing
      .get('/', debugAction)
      .get('/debug', debugAction)
      .use('/node', express.static(OVERRIDES))
      .use('/external', externalRouter)
      .use(express.static(WEBROOT));
  }
}

class ExternalRouter extends express.Router {
  constructor(manifest) { super();
    manifest.frontend.modules.forEach((module) => {
      this.use(`/${module.name}`, express.static(module.path));
      this.all(`/${module.name}/module.json`, json(module));
    });
  }
}

function debugAction(req, res) {
  res.sendFile(path.join(WEBROOT, 'inspector.html'));
}

function jsonAction(address) {
  return [{
   'description': 'Node.js app (powered by node-inspector)',
   'devtoolsFrontendUrl': address.url,
   'id': process.pid,
   'title': process.title || '',
   'type': 'page',
   'url': '',
   'webSocketDebuggerUrl': address.ws
  }];
}

function jsonVersionAction() {
  return {
    'browser': 'Node ' + process.version,
    'protocol-version': '1.1',
    'user-agent': 'Node ' + process.version,
    // webKit-version is a dummy value as it's used to match compatible DevTools front-ends
    'webKit-version': '537.36 (@181352)'
  };
}

module.exports = GlobalRouter;
