var mdns = require('mdns-js');

/**
 * @param {frontendAddress} frontend address object
 * @param {websocketAddress} websocket address object
 * @param {string} url to favicon
 * @constructor
 */
exports.registerService = function(frontendAddress, websocketAddress, faviconUrl) {

  var mdnsAnnouncement = mdns.createAdvertisement(mdns.tcp('remotedebug'), websocketAddress.port, {
    txtRecord: {
      title: process.name || 'node-inspector app',
      description : 'app (via node-inspector)',
      type: 'app',
      id: 'node-inspector-process-' + process.pid,
      url: '',
      faviconUrl: faviconUrl,
      devtoolsFrontendUrl: frontendAddress.url,
      webSocketDebuggerUrl: websocketAddress.url
    }
  });

  mdnsAnnouncement.start();

};