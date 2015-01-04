var mdns = require('mdns');

exports.registerService = function(frontendAddress, websocketAddress, faviconUrl) {

  var mdnsAnnouncement = mdns.createAdvertisement(mdns.tcp('remotedebug'), websocketAddress.port, {
    txtRecord: {
      title: process.name || 'node-inspector app',
      description : 'node.js app (node-inspector)',
      type: 'app',
      url: '',
      faviconUrl: faviconUrl,
      devtoolsFrontendUrl: frontendAddress.url,
      webSocketDebuggerUrl: websocketAddress.url
    }
  });

  mdnsAnnouncement.start();

};