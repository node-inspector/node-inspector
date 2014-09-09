// Public API for node-inspector embedders
var url = require('url');

exports.buildInspectorUrl = buildInspectorUrl;

/**
 * Build a URL for loading inspector UI in the browser.
 * @param {string|undefined} inspectorHost as configured via --web-host
 * @param {number} inspectorPort as configured via --web-port
 * @param {number} debugPort as configured via --debug in the debugged app
 */
function buildInspectorUrl(inspectorHost, inspectorPort, debugPort, fileToShow, isHttps) {
  var parts = {
    protocol: isHttps ? 'https' : 'http',
    hostname: inspectorHost == '0.0.0.0' ? '127.0.0.1' : inspectorHost,
    port: inspectorPort,
    pathname: '/debug',
    search: '?port=' + debugPort
  };

  return url.format(parts);
}
