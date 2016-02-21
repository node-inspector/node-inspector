'use strict';

var co = require('co');
var expect = require('chai').expect;
var InjectorClient = require('../lib/InjectorClient/InjectorClient.js');
var launcher = require('./helpers/launcher.js');

var DebuggerClient = require('../lib/DebuggerClient/DebuggerClient.js');
var ErrorNotConnected = DebuggerClient.ErrorNotConnected;

describe('InjectorClient', function() {

  describe('#injected', function() {
    beforeEach(() => setupInjector());
    afterEach(() => launcher.stopAllDebuggers());

    var injectorClient, debuggerClient;

    function setupInjector() {
      return launcher.runCommandlet(false).then(expand);
    }

    function expand(instance) {
      debuggerClient = instance.session.debugger;
      injectorClient = new InjectorClient({}, instance.session);
    }

    it('should inject server', () => {
      return co(function * () {
        yield injectorClient.injected();
      });
    });

    it('should inject server if debugger paused', () => {
      return co(function * () {
        yield launcher.runCommandlet(true).then(expand);
        expect(yield debuggerClient.running()).to.equal(false);
        yield injectorClient.injected();
        expect(yield debuggerClient.running()).to.equal(false);
      });
    });

    it('should throw if debugger closed', () => {
      return co(function * () {
        yield debuggerClient.connected();
        yield debuggerClient.close();
        yield injectorClient.injected().then(
          result => Promise.reject(new Error('should reject, but got ' + result)),
          error => expect(error).to.be.instanceof(ErrorNotConnected));
      });
    });

    it('should prevent double injection', function() {
      expect(injectorClient.injected()).to.equal(injectorClient.injected());
    });

    it('should close on debuggerClient closing', function() {
      return co(function * () {
        var promise = new Promise(resolve => injectorClient.once('close', resolve));
        yield injectorClient.injected();
        yield debuggerClient.close();
        yield promise;
        expect(yield injectorClient.injected().catch(_ => false)).to.equal(false);
      });
    });
  });

  describe('works with commands and events.', function() {
    beforeEach(() => setupInjector());
    afterEach(() => launcher.stopAllDebuggers());

    var injectorClient, debuggerClient;

    function setupInjector() {
      return co(function * () {
        yield launcher.runCommandlet(true).then(expand);
        yield injectorClient.injected();
      });
    }

    function expand(instance) {
      debuggerClient = instance.session.debugger;
      injectorClient = new InjectorClient({}, instance.session);
    }

    it('Register event handle in app and emits it', function() {
      return co(function * () {
        yield debuggerClient.request('continue');
        var promise = new Promise(resolve => {
          debuggerClient.once('console', message => {
            expect(message.level).to.equal('log');
            expect(message.message).to.equal('testtest');
            resolve();
          });
        });
        yield injectorClient.inject({
          injection: require.resolve('./fixtures/console-injection.js'),
          message: 'test'
        });
        return promise;
      });
    });

    it('Register event handle in paused app and emits it', function() {
      return co(function * () {
        var promise = new Promise(resolve => {
          debuggerClient.once('console', message => {
            expect(message.level).to.equal('log');
            expect(message.message).to.equal('testtest');
            resolve();
          });
        });
        yield injectorClient.inject({
          injection: require.resolve('./fixtures/console-injection.js'),
          message: 'test'
        });
        yield debuggerClient.request('continue');
        return promise;
      });
    });

    it('Registers command in app and responds to it', function() {
      return co(function * () {
        yield injectorClient.inject({
          injection: require.resolve('./fixtures/console-injection.js')
        });
        yield debuggerClient.request('continue');
        var result = yield debuggerClient.request('testcommand', { param: 'test' });
        expect(result).to.have.property('param', 'test');
      });
    });

    it('Registers command in paused app and responds to it', function() {
      return co(function * () {
        yield injectorClient.inject({
          injection: require.resolve('./fixtures/console-injection.js')
        }).catch(console.log);
        var result = yield debuggerClient.request('testcommand', { param: 'test' });
        expect(result).to.have.property('param', 'test');
      });
    });
  });
});
