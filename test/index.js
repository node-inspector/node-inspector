var util = require('util'),
    expect = require('chai').expect;

var index = require('../index');

describe('index', function() {
  describe('buildInspectorUrl', function() {
    it('should build an http URL', function() {
      var url = index.buildInspectorUrl(
        'example.com',
        '2223',
        '7863',
        false
      );
      expect(url).to.equal('http://example.com:2223/?port=7863');
    });

    it('should build an http URL', function() {
      var url = index.buildInspectorUrl(
        'example.com',
        '2223',
        '7863',
        true
      );
      expect(url).to.equal('https://example.com:2223/?port=7863');
    });
  });

  describe('buildWebSocketUrl', function() {
    it('should build an ws URL', function() {
      var url = index.buildWebSocketUrl(
        'example.com',
        '2223',
        '7863',
        false
      );
      expect(url).to.equal('ws://example.com:2223/?port=7863');
    });

    it('should build an wss URL', function() {
      var url = index.buildWebSocketUrl(
        'example.com',
        '2223',
        '7863',
        true
      );
      expect(url).to.equal('wss://example.com:2223/?port=7863');
    });
  });

});
