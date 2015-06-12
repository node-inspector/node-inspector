var util = require('util'),
    expect = require('chai').expect;

var index = require('../index');

describe('index', function() {
  describe('build_url', function() {
    it('should build an http URL', function() {
      var url = index.buildInspectorUrl(
        'example.com',
        '2223',
        '7863',
        null,
        false
      );
      expect(url).to.equal('http://example.com:2223/?ws=example.com:2223&port=7863');
    });

    it('should build an http URL', function() {
      var url = index.buildInspectorUrl(
        'example.com',
        '2223',
        '7863',
        null,
        true
      );
      expect(url).to.equal('https://example.com:2223/?ws=example.com:2223&port=7863');
    });
  });
});
