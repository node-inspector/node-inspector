// Public API for node-inspector embedders
var url = require('url');

exports.buildInspectorUrl = buildInspectorUrl;
exports.buildWebSocketUrl = buildWebSocketUrl;

/**
 * Build a URL for loading inspector UI in the browser.
 * @param {string|undefined} inspectorHost as configured via --web-host
 * @param {number} inspectorPort as configured via --web-port
 * @param {number} debugPort as configured via --debug in the debugged app
 */
function buildInspectorUrl(inspectorHost, inspectorPort, debugPort, fileToShow, isHttps) {
  var host = inspectorHost == '0.0.0.0' ? '127.0.0.1' : inspectorHost;
  var parts = {
    protocol: isHttps ? 'https' : 'http',
    hostname: host,
    port: inspectorPort,
    pathname: '/',
    search: '?ws=' + host + ':' + inspectorPort + '&port=' + debugPort
  };

  return url.format(parts);
}

/**
 * Build a URL for the WebSocket endpoint.
 * @param {string|undefined} inspectorHost as configured via --web-host
 * @param {number} inspectorPort as configured via --web-port
 * @param {number} debugPort as configured via --debug in the debugged app
 */
function buildWebSocketUrl(inspectorHost, inspectorPort, debugPort, fileToShow, isSecure) {
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
