var expect = require('chai').expect,
    index = require('../index');

describe('index', function() {
  describe('buildInspectorUrl', function() {
    it('creates an http request', function() {
      var url = index.buildInspectorUrl('asphyxy', 9593, 5296, null, false);
      expect(url).to.equal('http://asphyxy:9593/debug?port=5296');
    });

    it('creates an https request', function() {
      var url = index.buildInspectorUrl('asphyxy', 9593, 5296, null, true);
      expect(url).to.equal('https://asphyxy:9593/debug?port=5296');
    });
});
});
