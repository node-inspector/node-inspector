// Public API for node-inspector embedders
var url = require('url');
var path = require('path');

exports.buildInspectorUrl = buildInspectorUrl;
exports.buildWebSocketUrl = buildWebSocketUrl;

/**
 * Build a URL for loading inspector UI in the browser.
 * @param {string|undefined} inspectorHost as configured via --web-host
 * @param {number} inspectorPort as configured via --web-port
 * @param {number} debugPort as configured via --debug in the debugged app
 * @param {number} isHttps as configured via --ssl-cert and --ssl-key in the debugged app
 */
function buildInspectorUrl(inspectorHost, inspectorPort, debugPort, isHttps) {
  var host = inspectorHost == '0.0.0.0' ? '127.0.0.1' : inspectorHost;
  var port = inspectorPort;
  var protocol = isHttps ? 'https' : 'http';

  var isUnixSocket = !/^\d+$/.test(port);
  if (isUnixSocket) {
    host = path.resolve(__dirname, inspectorPort);
    port = null;
    protocol = 'unix';
  }

  var parts = {
    protocol: protocol,
    hostname: host,
    port: port,
    pathname: '/',
    search: '?port=' + debugPort
  };

  return url.format(parts);
}

/**
 * Build a URL for the WebSocket endpoint.
 * @param {string|undefined} inspectorHost as configured via --web-host
 * @param {number} inspectorPort as configured via --web-port
 * @param {number} debugPort as configured via --debug in the debugged app
 * @param {number} isHttps as configured via --ssl-cert and --ssl-key in the debugged app
 */
function buildWebSocketUrl(inspectorHost, inspectorPort, debugPort, isSecure) {
  var parts = {
    protocol: isSecure ? 'wss:' : 'ws:',
    hostname: inspectorHost == '0.0.0.0' ? '127.0.0.1' : inspectorHost,
    port: inspectorPort,
    pathname: '/',
    search: '?port=' + debugPort,
    slashes: true
  };

  return url.format(parts);
}
