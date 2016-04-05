var util = require('util'),
    path = require('path'),
    expect = require('chai').expect;

var Config = require('../lib/config');

describe('Config', () => {
  console.log(Config);

  describe('.collectDefaults', () => {
    it('should collect primitive default', () => {
      const options = { test: { default: 'test' }};
      const defaults = Config.collectDefaults(options);

      expect(defaults).to.deep.equal({
        test: 'test'
      });
    });

    it('should collect immutable default array', () => {
      const options = { test: { default: [] }};
      const defaults1 = Config.collectDefaults(options);
      const defaults2 = Config.collectDefaults(options);

      expect(defaults1.test).to.be.instanceof(Array);
      expect(defaults2.test).to.be.instanceof(Array);
      expect(defaults1.test).to.be.not.equal(defaults2.test);
    });

    it('should not collect unspecified default', () => {
      const options = { test: {} };
      const defaults = Config.collectDefaults(options);

      expect(defaults).to.be.deep.equal({});
    });
  });

  describe('.collectCustom', () => {
    it('should collect custom option', () => {
      const options = {
        test1: { custom: () => 'test' },
        test2: {}
      };

      const custom = Config.collectCustom(options);

      expect(custom).to.deep.equal({ test1: 'test' });
    });
  });

  describe('.parseArgs', () => {
    it('should collect common args', () => {
      const options = { test: {} };
      const argv = ['-a', '--b', '3', '--test'];
      const result = Config.parseArgs(options, argv);

      expect(result).to.contain.keys({ test: true });
    });

    it('should collect args without script args', () => {
      const options = { test: { type: 'boolean' }};
      const argv = ['-a', '--b', '3', 'script', '--test'];
      const result = Config.parseArgs(options, argv);

      expect(result).to.contain.keys({ test: false });
    });

    it('should ignore aliases', () => {
      const options = {
        first: { type: 'boolean' },
        test: { type: 'boolean', alias: 't' },
        last: { type: 'boolean', alias: ['l', 'lt'] }
      };
      const argv = ['-a', '--b', '3', '--test', '--lt', '--first'];
      const result = Config.parseArgs(options, argv);

      expect(result).to.not.contain.any.keys('lt', 't', 'l');
      expect(result).to.contain.keys('test', 'first', 'a', 'b');
    });

    it('should ignore default values', () => {
      const options = {
        test: { type: 'boolean', default: true }
      };
      const argv = ['-a', '--b', '3', '--test'];
      const result = Config.parseArgs(options, argv);

      expect(result).to.not.contain.keys('test');
    });

    it('should ignore default complex structures', () => {
      const options = {
        test1: { type: 'array' },
        test2: { type: 'array', default: [1] },
        test3: { type: 'array', default: [1] }
      };
      const argv = ['-a', '--b', '3', '--test1=1', '--test2=1'];
      const result = Config.parseArgs(options, argv);

      expect(result).to.contain.keys('test1', 'test2');
    });

    it('should ignore camel case options', () => {
      const options = {
        'test-a': {},
        'test-1': {},
        test2: {},
      };
      const argv = ['-a', '--b', '3', '--test-a=1', '--test-1=1'];
      const result = Config.parseArgs(options, argv);

      expect(result).to.not.contain.any.keys('testA', 'test1');
      expect(result).to.contain.keys('test2');
    });
  });
});

/*
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
      expect(config.webPort).to.equal('8081');
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

    it('handles --inject', function() {
      var config = givenConfigFromArgs('--no-inject');
      expect(config.inject).to.equal(false);
    });

    it('handles --inject.sub', function() {
      var config = givenConfigFromArgs('--no-inject.sub');
      expect(config.inject.sub).to.equal(false);
    });

    it('handles --hidden', function() {
      var config = givenConfigFromArgs('--hidden="abc"');
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

    it('handles --nodejs', function() {
      var config = givenConfigFromArgs(['--nodejs', '--harmony']);
      expect(config.nodejs).to.eql(['--harmony']);
    });

    it('handles --debug-brk', function() {
      var config = givenConfigFromArgs('--debug-brk');
      expect(config.debugBrk).to.equal(true);
    });

    it('handles --cli', function() {
      var config = givenConfigFromArgs('--cli');
      expect(config.cli).to.equal(true);
    });

    function givenConfigFromArgs(argv) {
      return new Config([].concat(argv));
    }
  });

  describe('defaults', function(){
    var config = Config._collectDefaults();

    it('have expected values', function(){
      expect(config.help, 'default help value').to.equal(false);
      expect(config.version, 'default version value').to.equal(false);
      expect(config.webPort, 'default web-port value').to.equal('8080');
      expect(config.webHost, 'default web-host value').to.equal('0.0.0.0');
      expect(config.debugPort, 'default debug-port value').to.equal(5858);
      expect(config.saveLiveEdit, 'default save-live-edit value').to.equal(false);
      expect(config.preload, 'default preload value').to.equal(true);
      expect(config.hidden, 'default hidden value is array').to.satisfy(util.isArray);
      expect(config.hidden.length, 'default hidden array is empty').to.equal(0);
      expect(config.stackTraceLimit, 'default stack-trace-limit value').to.equal(50);
      expect(config.nodejs, 'default nodejs value is array').to.satisfy(util.isArray);
      expect(config.debugBrk, 'default debug-brk value').to.equal(false);
      expect(config.nodejs.length, 'default nodejs array is empty').to.equal(0);
      expect(config.cli, 'default cli value').to.equal(false);
    });

    it('have expected values in node-debug mode', function() {
      var config = Config._collectDefaults(true);
      expect(config.webHost, 'node-debug default web-host value').to.equal('127.0.0.1');
      expect(config.debugBrk, 'node-debug default debug-brk value').to.equal(true);
    });
  });

  describe('serializeOptions', function() {
    var options = {
      'a': 10,
      'b': '20',
      'c': true,
      'd': false,
      'e': undefined,
      'f': null,
      'g': ['h', 1],
      'j': [],
      'k': [/abc/gi],
      'l': {
        m: true,
        n: '1',
        o: {
          p: false
        }
      },
      'camelKeyOption': 'a',
    };

    it('without filtering', function() {
      var serialisedOptions = Config.serializeOptions(options);

      expect(serialisedOptions, 'true serialised number format').to.contain('-a=10');
      expect(serialisedOptions, 'true serialised string format').to.contain('-b=20');
      expect(serialisedOptions, 'true serialised boolean format [true]').to.contain('-c');
      expect(serialisedOptions, 'true serialised boolean format [false]').to.contain('-d=false');
      expect(serialisedOptions, 'filtered `undefined` value').to.not.contain('-e=undefined');
      expect(serialisedOptions, 'not filtered `null` value').to.contain('-f=null');
      expect(serialisedOptions, 'true serialised array format').to.contain('-g=h -g=1');
      expect(serialisedOptions, 'true serialised regexp format').to.contain('-k=abc');
      expect(serialisedOptions, 'true serialised object format')
        .to.contain('--l.m --l.n=1 --l.o.p=false');
      expect(serialisedOptions, 'filtered empty array').to.not.contain('-j');
      expect(serialisedOptions, 'true serialised camelKey option').to.contain('--camel-key-option=a');
    });

    it('with filtering', function() {
      var serialisedOptions = Config.serializeOptions(options, {a: true});

      expect(serialisedOptions, 'true serialised number format').to.not.contain('-a=10');
    });
  });

  describe('filterNodeDebugOptions', function() {
    var option = {
      'cli': true,
      'webPort': 8081,
      'debugPort': 5859,
      'external': 1
    };

    it('works correctly', function() {
      var filteredOptions = Config.filterNodeDebugOptions(option);

      expect(filteredOptions, 'node-debug option filtered').to.not.have.property('cli');
      expect(filteredOptions, 'inspector option not filtered').to.have.property('webPort');
      expect(filteredOptions, 'general option not filtered').to.have.property('debugPort');
      expect(filteredOptions, 'external option not filtered').to.have.property('external');
    });
  });

  describe('filterDefaultValues', function() {
    var option = {
      'cli': true,
      'webPort': 8081,
      'external': 1
    };

    it('works correctly', function() {
      var filteredOptions = Config.filterNodeDebugOptions(option);

      expect(filteredOptions, 'option with default value filtered').to.not.have.property('cli');
      expect(filteredOptions, 'option with custom value not filtered').to.have.property('webPort');
      expect(filteredOptions, 'external option not filtered').to.have.property('external');
    });
  });
});
*/
