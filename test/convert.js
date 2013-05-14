var expect = require('chai').expect,
  convert = require('../lib/convert.js');

describe('convert', function() {

  describe('v8NameToInspectorUrl', function() {

    it('preserves node.js internal modules as filename without path', function() {
      expect(convert.v8NameToInspectorUrl('events.js')).to.equal('events.js');
    });

    it('prepends file:// scheme for unix-like paths', function() {
      expect(convert.v8NameToInspectorUrl('/home/user/app.js')).to.equal('file:///home/user/app.js');
    });
  });

  describe('inspectorUrlToV8Name', function() {

    it('returns filename without path for node.js internal modules', function() {
      expect(convert.inspectorUrlToV8Name('events.js')).to.equal('events.js');
    });

    it('removes file:// scheme from full URLs', function() {
      expect(convert.inspectorUrlToV8Name('file:///home/user/app.js')).to.equal('/home/user/app.js');
    });
  });
});