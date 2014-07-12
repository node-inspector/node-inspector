/**
* @param {Array} injections
* @param {Array} options
*/
function injectorServer(options) {
  var debug = require(options['v8-debug']);

  global.process._require = require;
  global.process._debugObject = debug;
}

module.exports = injectorServer;
