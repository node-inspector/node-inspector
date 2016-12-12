// Public API for node-inspector embedders
var url = require('url');

exports.buildInspectorUrl = buildInspectorUrl;

/**
 * Build a URL for loading inspector UI in the browser.
 * @param {string|undefined} inspectorHost as configured via --web-host
 * @param {number} inspectorPort as configured via --web-port
 * @param {number} debugPort as configured via --debug in the debugged app
 */
function buildInspectorUrl(inspectorHost, inspectorPort, debugPort, fileToShow) {
  var parts = {
    protocol: 'http',
    hostname: inspectorHost || '127.0.0.1',
    port: inspectorPort,
    pathname: '/debug',
    query: {
        port: debugPort
    }
  };
  // For backward compatibility, we'd like to keep arguments.
  // But if arguments.length > 4, we take fifth argument as a debugHost.
  if (buildInspectorUrl.arguments.length > 4 && buildInspectorUrl.arguments[4]) {
      parts.query['host'] = buildInspectorUrl.arguments[4];
  }

  return url.format(parts);
}
