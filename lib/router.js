const path = require('path');
const express = require('express');
const favicon = require('serve-favicon');

const plugins = require('./plugins');
const InspectorJson = plugins.InspectorJson;
const ProtocolJson = plugins.ProtocolJson;

const resolve = (_path) => path.resolve(__dirname, _path);
const FAVICON = resolve('../front-end-node/Images/favicon.png');
const OVERRIDES = resolve('../front-end-node');
const WEBROOT = resolve('../front-end');
const PLUGINS = resolve('../plugins');

function Router(config, server) {
  const jsonActionJson = jsonAction(server.address());
  const jsonVersionActionJson = jsonVersionAction();
  const inspectorJson = new InspectorJson(config);
  const protocolJson = new ProtocolJson(config);
  const emptyJson = {};

  const json = (data) => (req, res) => res.json(data);

  return express.Router()
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
    .use('/plugins', express.static(PLUGINS))
    .use(express.static(WEBROOT));
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

module.exports = Router;
module.exports.Router = Router;
