var expect = require('chai').expect,
  convert = require('../lib/convert.js');

describe('convert', function() {

  describe('pathToUrl', function() {

    it('preserves node.js internal modules as filename without path', function() {
      expect(convert.pathToUrl('events.js')).to.equal('events.js');
    });

    it('converts unix path to file:// URL', function() {
      expect(convert.pathToUrl('/home/user/app.js')).to.equal('file:///home/user/app.js');
    });

    it('converts windows disk path to file:// URL', function() {
      expect(convert.pathToUrl('C:\\Users\\user\\app.js'))
        .to.equal('file:///C:/Users/user/app.js');
    });

    it('converts windows UNC path to file:// URL', function() {
      expect(convert.pathToUrl('\\\\SHARE\\user\\app.js'))
        .to.equal('file://SHARE/user/app.js');
    });

    it('converts undefined path to empty string', function() {
      expect(convert.pathToUrl(undefined))
        .to.equal('');
    });
  });

  describe('urlToPath', function() {
    function dummyNormalize(name) { return name; }

    it('returns filename without path for node.js internal modules', function() {
      expect(convert.urlToPath('events.js', dummyNormalize)).to.equal('events.js');
    });

    it('converts URL to unix path', function() {
      expect(convert.urlToPath('file:///home/user/app.js', dummyNormalize))
        .to.equal('/home/user/app.js');
    });

    it('converts URL to windows disk path', function() {
      expect(convert.urlToPath('file:///C:/Users/user/app.js', dummyNormalize))
        .to.equal('C:\\Users\\user\\app.js');
    });

    it('converts URL to windows UNC', function() {
      expect(convert.urlToPath('file://SHARE/user/app.js', dummyNormalize))
        .to.equal('\\\\SHARE\\user\\app.js');
    });
  });
});
