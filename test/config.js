var util = require('util'),
    path = require('path'),
    expect = require('chai').expect;

var Config = require('../lib/config');

describe('Config', function() {
  describe('from argv', function(){

    it('handles --help', function() {
      var config = givenConfigFromArgs('--help');
      expect(config.help).to.equal(true);
    });

    it('handles --version', function() {
      var config = givenConfigFromArgs('--version');
      expect(config.version).to.equal(true);
    });

    it('handles --web-port', function() {
      var config = givenConfigFromArgs('--web-port=8081');
      expect(config.webPort).to.equal(8081);
    });

    it('handles --web-host', function() {
      var config = givenConfigFromArgs('--web-host=127.0.0.2');
      expect(config.webHost).to.equal('127.0.0.2');
    });

    it('handles --debug-port', function() {
      var config = givenConfigFromArgs('--debug-port=5859');
      expect(config.debugPort).to.equal(5859);
    });

    it('handles --save-live-edit', function() {
      var config = givenConfigFromArgs('--save-live-edit');
      expect(config.saveLiveEdit).to.equal(true);
    });

    it('handles --preload', function() {
      var config = givenConfigFromArgs('--no-preload');
      expect(config.preload).to.equal(false);
    });

    it('handles --hidden', function() {
      var config = givenConfigFromArgs('--hidden=["abc"]');
      expect(config.hidden).to.satisfy(util.isArray);
      expect(config.hidden.length).to.equal(1);
      expect(config.hidden[0]).to.satisfy(util.isRegExp);
    });

    it('handles --stack-trace-limit', function() {
      var config = givenConfigFromArgs('--stack-trace-limit=60');
      expect(config.stackTraceLimit).to.equal(60);
    });

    it('handles --ssl-key defined', function() {
      var config = givenConfigFromArgs('--ssl-key=test/fixtures/ssl_cert_and_key.txt');
      expect(config.sslKey).to.equal(path.resolve(__dirname, './fixtures/ssl_cert_and_key.txt'));
    });

    it('handles --ssl-cert defined', function() {
      var config = givenConfigFromArgs('--ssl-cert=test/fixtures/ssl_cert_and_key.txt');
      expect(config.sslCert).to.equal(path.resolve(__dirname, './fixtures/ssl_cert_and_key.txt'));
    });

    it('handles --ssl-key not defined', function() {
      var config = givenConfigFromArgs('');
      expect(config.sslKey).to.equal('');
    });

    it('handles --ssl-cert not defined', function() {
      var config = givenConfigFromArgs('');
      expect(config.sslCert).to.equal('');
    });

    function givenConfigFromArgs(argv) {
      var tempArgv = process.argv,
          config;
      process.argv = ['node', 'inspector.js'].concat(argv);
      config = new Config();
      process.argv = tempArgv;
      return config;
    }
  });

  describe('defaults', function(){
    var config = Config._collectDefaults();

    it('have expected values', function(){
      expect(config.help, 'default help value').to.equal(false);
      expect(config.version, 'default version value').to.equal(false);
      expect(config.webPort, 'default web-port value').to.equal(8080);
      expect(config.webHost, 'default web-host value').to.equal('0.0.0.0');
      expect(config.debugPort, 'default debug-port value').to.equal(5858);
      expect(config.saveLiveEdit, 'default save-live-edit value').to.equal(false);
      expect(config.preload, 'default preload value').to.equal(true);
      expect(config.hidden, 'default hidden value is array').to.satisfy(util.isArray);
      expect(config.hidden.length, 'default hidden array is empty').to.equal(0);
      expect(config.stackTraceLimit, 'default stack-trace-limit value').to.equal(50);
    });
  });
});
