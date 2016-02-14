var co = require('co');
var expect = require('chai').expect;
var launcher = require('./helpers/launcher.js');
var DebuggerClient = require('../lib/DebuggerClient.js');
var ErrorNotConnected = DebuggerClient.ErrorNotConnected;

describe('DebuggerClient', () => {
  var client;
  var session;
  var debuggerClient;

  afterEach(() => launcher.stopAllDebuggers());

  describe('#connected', () => {
    it('should reject error if there is no connection', () => {
      var debuggerClient = new DebuggerClient({}, {port: 5858});

      return debuggerClient.connected().then(
        result => Promise.reject('should reject, but got ' + result),
        error => {
          expect(error).to.be.instanceof(DebuggerClient.ErrorNotConnected);
          expect(error.message.toString()).to.be.equal('connect ECONNREFUSED 127.0.0.1:5858');
          return Promise.resolve();
        }
      );
    });

    it('should resolve if connected', function() {
      return co(function * () {
        yield setupConnectedDebuggerClient();
        yield debuggerClient.connected();
      });
    });

    it('should reject error after connection closing', () => {
      return co(function * () {
        yield setupConnectedDebuggerClient();
        yield debuggerClient.connected();
        yield debuggerClient.close();
        yield debuggerClient.connected();
      }).then(
        result => Promise.reject('should reject, but got ' + result),
        error => {
          expect(error).to.be.instanceof(DebuggerClient.ErrorNotConnected);
          expect(error.message.toString()).to.be.equal('Debugged process exited.');
          return Promise.resolve();
        }
      );
    });

    it('should reject error after app closing', () => {
      return co(function * () {
        yield setupConnectedDebuggerClient();
        yield debuggerClient.connected();
        client.kill();
        yield new Promise((resolve) => {
          debuggerClient.once('close', resolve);
        });
        yield debuggerClient.connected();
      }).then(
        result => Promise.reject('should reject, but got ' + result),
        error => {
          expect(error).to.be.instanceof(DebuggerClient.ErrorNotConnected);
          expect(error.message.toString()).to.be.equal('Debugged process exited.');
          return Promise.resolve();
        }
      );
    });
  });

  describe('#close', () => {
    it('should close opend session', () => {
      return co(function * () {
        yield setupConnectedDebuggerClient();
        yield debuggerClient.connected();
        yield debuggerClient.close();
      });
    });

    it('should not throw on close closed session', () => {
      return co(function * () {
        yield setupConnectedDebuggerClient();
        yield debuggerClient.close();
      });
    });
  });

  describe('#target', () => {
    it('should connect and resolve target', () => {
      return co(function * () {
        yield setupConnectedDebuggerClient();
        var target = yield debuggerClient.target();
        expect(target).to.be.instanceof(Object);
      });
    });

    it('should resolve target if connected', () => {
      return co(function * () {
        yield setupConnectedDebuggerClient();
        yield debuggerClient.connected();
        var target = yield debuggerClient.target();
        expect(target).to.be.instanceof(Object);
      });
    });

    it('should reject error if disconnected', () => {
      return co(function * () {
        yield setupConnectedDebuggerClient();
        yield debuggerClient.connected();
        yield debuggerClient.close();
        yield debuggerClient.target().then(
          result => Promise.reject(new Error('should reject, but got ' + target)),
          error => expect(error).to.be.instanceof(ErrorNotConnected));
      });
    });
  });

  describe('#ready', () => {
    it('should connect and resolve', () => {
      return co(function * () {
        yield setupConnectedDebuggerClient();
        yield debuggerClient.ready();
      });
    });

    it('should resolve if connected', () => {
      return co(function * () {
        yield setupConnectedDebuggerClient();
        yield debuggerClient.connected();
        yield debuggerClient.ready();
      });
    });

    it('should reject error if disconnected', () => {
      return co(function * () {
        yield setupConnectedDebuggerClient();
        yield debuggerClient.connected();
        yield debuggerClient.close();
        yield debuggerClient.ready().then(
          result => Promise.reject(new Error('should reject, but got ' + result)),
          error => expect(error).to.be.instanceof(ErrorNotConnected));
      });
    });
  });

  describe('#running', () => {
    it('should resolve `false` for paused process', () => {
      return co(function * () {
        yield setupConnectedDebuggerClient(true);
        var running = yield debuggerClient.running();
        expect(running).to.be.equal(false);
      });
    });

    it('should resolve `true` for running process', () => {
      return co(function * () {
        yield setupConnectedDebuggerClient();
        var running = yield debuggerClient.running();
        expect(running).to.be.equal(true);
      });
    });
  });

  describe('#request', () => {
    it('should connect and resolve result', () => {
      return co(function * () {
        yield setupConnectedDebuggerClient(true);
        var result = yield debuggerClient.request('version');
        expect(result).to.be.contain.keys(['V8Version']);
      });
    });

    it('should reject if disconnected', () => {
      return co(function * () {
        yield setupConnectedDebuggerClient();
        yield debuggerClient.connected();
        yield debuggerClient.close();
        yield debuggerClient.request('version').then(
          result => Promise.reject(new Error('should reject, but got ' + result)),
          error => expect(error).to.be.instanceof(ErrorNotConnected));
      });
    });

    it('should send correct data length', () => {
      return co(function * () {
        yield setupConnectedDebuggerClient();
        // non-ascii text has different length as String than as Buffer
        var value = "тест";
        var result = yield debuggerClient.request('evaluate', {
          expression: JSON.stringify(value),
          global: true
        });
        expect(result.value).to.be.equal(value);
      });
    });
  });

  function setupConnectedDebuggerClient(breakOnStart) {
    return launcher.runCommandlet(breakOnStart)
      .then(expand);
  }

  function expand(result) {
    client = result.child;
    session = result.session;
    debuggerClient = session.debugger;
  }
});
