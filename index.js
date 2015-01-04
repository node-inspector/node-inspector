// Public API for node-inspector embedders
var url = require('url');

exports.buildInspectorUrl = buildInspectorUrl;
exports.buildFrontendUrl = buildFrontendUrl;

/**
 * Build a URL for loading frontend assets in the browser.
 * @param {string} host
 * @param {number} port
 * @param {string} path
 * @param {number} debugPort
 * @param {boolean} toggle https
 */
function buildFrontendUrl(host, port, path, debugPort, isHttps) {
  var parts = {
    protocol: isHttps ? 'https' : 'http',
    hostname: host,
    port: port,
    pathname: path,
    search: debugPort ? '?port=' + debugPort : ''
  };

  return url.format(parts);
}

/**
 * Build a URL for loading inspector UI in the browser.
 * @param {string|undefined} inspectorHost as configured via --web-host
 * @param {number} inspectorPort as configured via --web-port
 * @param {number} debugPort as configured via --debug in the debugged app
 * @param {boolean} is https or not
 */
function buildInspectorUrl(inspectorHost, inspectorPort, debugPort, isHttps) {
  return buildFrontendUrl(inspectorHost, inspectorPort, '/debug', debugPort, isHttps);
}