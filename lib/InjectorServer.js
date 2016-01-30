/**
* @param {Array} options
*/
function injectorServer(options) {
  var debug = require(options['v8-debug'])();
  debug.enableWebkitProtocol();

  global.process._require = require;
  global.process._debugObject = debug;

  debug.convert = require(options['convert']);

  debug.on('close', () => {
    delete global.process._require;
    delete global.process._debugObject;
  });
}

module.exports = injectorServer;
