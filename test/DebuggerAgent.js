var co = require('co');
var expect = require('chai').expect;
var launcher = require('./helpers/launcher.js');
var ScriptManager = require('../lib/ScriptManager.js');
var InjectorClient = require('../lib/InjectorClient');
var DebuggerAgent = require('../lib/Agents/DebuggerAgent.js');

var child;
var session;
var debuggerAgent;
var debuggerClient;
var frontendClient;
var injectorClient;

describe('DebuggerAgent', () => {
  beforeEach(() => initializeDebugger());
  afterEach(() => launcher.stopAllDebuggers());

  describe('#resume', () => {
    it('should resume paused app', () => {
      return co(function * () {
        expect(yield debuggerClient.running()).to.be.equal(false);
        yield debuggerAgent.handle('resume');
        expect(yield debuggerClient.running()).to.be.equal(true);
      });
    });
  });

  describe('#pause', () => {
    it('should pause working app', () => {
      return co(function * () {
        expect(yield debuggerClient.running()).to.be.equal(false);
        yield debuggerAgent.handle('resume');

        expect(yield debuggerClient.running()).to.be.equal(true);
        yield debuggerAgent.handle('pause');

        yield yield debuggerClient.break();
        expect(yield debuggerClient.running()).to.be.equal(false);
      });
    });
  });

  describe('#stepInto', () => {
    it('should stepin in paused app', () => {
      return co(function * () {
        expect(yield debuggerClient.running()).to.be.equal(false);
        yield debuggerAgent.handle('resume');

        expect(yield debuggerClient.running()).to.be.equal(true);

        child.stdin.write('steps\n');
        var brk1 = yield debuggerClient.break();
        yield debuggerAgent.handle('stepInto');
        var brk2 = yield debuggerClient.break();
        expect(brk2.sourceLine - brk1.sourceLine).to.be.equal(1);
        expect(/var a/.test(brk2.sourceLineText)).to.be.equal(true);
      });
    });
  });

  describe('#stepOver', () => {
    it('should stepOver in paused app', () => {
      return co(function * () {
        expect(yield debuggerClient.running()).to.be.equal(false);
        yield debuggerAgent.handle('resume');

        expect(yield debuggerClient.running()).to.be.equal(true);

        child.stdin.write('steps\n');
        var brk1 = yield debuggerClient.break();

        yield debuggerAgent.handle('stepInto');
        yield debuggerAgent.handle('stepInto');
        yield debuggerAgent.handle('stepOver');
        var brk2 = yield debuggerClient.break();
        expect(brk2.sourceLine - brk1.sourceLine).to.be.equal(3);
        expect(/var e/.test(brk2.sourceLineText)).to.be.equal(true);
      });
    });
  });

  describe('#stepOut', () => {
    it('should stepOut in paused app', () => {
      return co(function * () {
        expect(yield debuggerClient.running()).to.be.equal(false);
        yield debuggerAgent.handle('resume');

        expect(yield debuggerClient.running()).to.be.equal(true);

        child.stdin.write('steps\n');
        var brk1 = yield debuggerClient.break();
        yield debuggerAgent.handle('stepInto');
        yield debuggerAgent.handle('stepInto');
        yield debuggerAgent.handle('stepInto');
        yield debuggerClient.break();

        yield debuggerAgent.handle('stepOut');
        var brk2 = yield debuggerClient.break();

        expect(brk2.sourceLine - brk1.sourceLine).to.be.equal(3);
        expect(/var e/.test(brk2.sourceLineText)).to.be.equal(true);
      });
    });
  });

  describe('#restartFrame', () => {
    it('should restart and go on top of target frame', () => {
      return co(function * () {
        expect(yield debuggerClient.running()).to.be.equal(false);
        yield debuggerAgent.handle('resume');

        expect(yield debuggerClient.running()).to.be.equal(true);

        child.stdin.write('steps\n');
        var brk1 = yield debuggerClient.break();
        yield debuggerAgent.handle('stepInto');
        yield debuggerAgent.handle('stepInto');
        yield debuggerAgent.handle('stepInto');
        yield debuggerClient.break();
        var backtrace = yield debuggerAgent.handle('getBacktrace');
        var callFrameId = backtrace[1].callFrameId;

        var stack = yield debuggerAgent.handle('restartFrame', {callFrameId: callFrameId});
        yield debuggerAgent.handle('stepInto');
        var brk2 = yield debuggerClient.break();

        expect(brk1).to.deep.equal(brk2);
      });
    });
  });
});

function expand(instance) {
  child = instance.child;
  session = instance.session;
  debuggerClient = session.debuggerClient;
  frontendClient = session.frontendClient;
}

function fill() {
  injectorClient = new InjectorClient({}, session);
  session.injectorClient = injectorClient;
  debuggerAgent = new DebuggerAgent({}, session);
}

function initializeDebugger() {
  return co(function * () {
    yield launcher.runCommandlet(true).then(expand).then(fill);
    yield injectorClient.injected();
  });
}


xdescribe('DebuggerAgent', function() {
  describe('sets variable value', function() {
    before(setupDebugScenario);

    toValueType(
      'a string',
      { value: 'string-value' },
      { type: 'string', value: 'string-value', description: 'string-value' }
    );

    toValueType(
      'a number',
      { value: 10 },
      { type: 'number', value: 10, description: '10' }
    );

    toValueType(
      'null',
      { value: null },
      { type: 'null', subtype: 'null', value: null, description: 'null'}
    );

    toValueType(
      'undefined',
      { },
      { type: 'undefined', description: 'undefined' }
    );

    toRefType(
      'an object',
      'console',
      function(valueId) {
        return {
          type: 'object',
          objectId: valueId,
          className: 'Object',
          description: 'Console'
        };
      }
    );

    toRefType(
      'a function',
      'console.log',
      function(valueId) {
        return {
          type: 'function',
          objectId: valueId,
          className: 'Function',
          description: 'function () { [native code] }'
        };
      }
    );

    // helpers (implementation details) below this line

    var debuggerClient, agent;

    function setupDebugScenario(done) {
      launcher.runOnBreakInFunction(function(session) {
        debuggerClient = session.debuggerClient;
        agent = new DebuggerAgent({}, session);
        done();
      });
    }

    function to(type, test) {
      it('to ' + type, test);
    }

    function toValueType(type, newValue, expectedResult) {
      to(type, function(done) {
        verifyVariableSetter(
          agent,
          newValue,
          expectedResult,
          done
        );
      });
    }

    function toRefType(type, newValueExpression, expectedResultCb) {
      to(type, function(done) {
        debuggerClient.fetchObjectId(agent, newValueExpression, function(valueId) {
          verifyVariableSetter(
            agent,
            { objectId: '' + valueId },
            expectedResultCb(valueId),
            done
          );
        });
      });
    }

    function verifyVariableSetter(agent, newValue, expectedResult, done) {
      agent.setVariableValue(
        {
          scopeNumber: '0',
          callFrameId: '0',
          variableName: 'meta',
          newValue: newValue
        },
        function(err, result) {
          if (!DebuggerAgent.nodeVersionHasSetVariableValue(process.version)) {
            expect(err)
              .to.have.string('does not support setting variable value');
            done();
            return;
          }

          if (err) throw err;

          verifyVariableValue(
            agent,
            'meta',
            expectedResult,
            done);
        }
      );
    }

    function verifyVariableValue(agent,
                                 name,
                                 expectedValue,
                                 callback) {
      agent.evaluateOnCallFrame(
        {
          callFrameId: 0,
          expression: name
        },
        function(err, result) {
          if (err) throw err;

          expect(JSON.stringify(result.result), name)
            .to.equal(JSON.stringify(expectedValue));
          callback();
        }
      );
    }
  });

  describe('nodeVersionHasSetVariableValue', function() {
    it('returns false for v0.8.20', function(done) {
      expect(DebuggerAgent.nodeVersionHasSetVariableValue('v0.8.20'))
        .to.equal(false);
      done();
    });

    it('returns false for v0.10.11', function(done) {
      expect(DebuggerAgent.nodeVersionHasSetVariableValue('v0.10.11'))
        .to.equal(false);
      done();
    });

    it('returns true for v0.10.12', function(done) {
      expect(DebuggerAgent.nodeVersionHasSetVariableValue('v0.10.12'))
        .to.equal(true);
      done();
    });

    it('returns false for v0.11.1', function(done) {
      expect(DebuggerAgent.nodeVersionHasSetVariableValue('v0.11.1'))
        .to.equal(false);
      done();
    });

    it('returns true for v0.11.2', function(done) {
      expect(DebuggerAgent.nodeVersionHasSetVariableValue('v0.11.2'))
        .to.equal(true);
      done();
    });

    it('returns true for v0.12.0', function(done) {
      expect(DebuggerAgent.nodeVersionHasSetVariableValue('v0.12.0'))
        .to.equal(true);
      done();
    });

    it('returns true for v1.0.0', function(done) {
      expect(DebuggerAgent.nodeVersionHasSetVariableValue('v1.0.0'))
        .to.equal(true);
      done();
    });
  });

  describe('evaluateOnCallFrame', function() {
    before(setupDebugScenario);

    it('truncates String values at 10,000 characters', function(done) {
      var testExpression = 'Array(10000).join("a");';
      var expectedValue = new Array(10000).join('a');

      agent.evaluateOnCallFrame(
        {
          callFrameId: 0,
          expression: testExpression
        },
        function(err, data) {
          if (err) throw err;

          expect(data.result.value)
            .to.equal(expectedValue);

          done();
        }
      );
    });

    var agent;

    function setupDebugScenario(done) {
      launcher.runOnBreakInFunction(function(session) {
        agent = new DebuggerAgent({}, session);
        done();
      });
    }
  });

  describe('resume()', function() {
    before(setupDebugScenario);

    it('does not throw an error', function(done) {
      expect(function() { agent.resume({}, done); })
        .to.not.throw();
    });

    var agent;

    function setupDebugScenario(done) {
      launcher.runOnBreakInFunction(function(session) {
        agent = new DebuggerAgent({}, session);
        done();
      });
    }
  });

  describe('setBreakpointByUrl()', function() {
    before(setupDebugScenario);

    it('does not throw an error', function(done) {
      expect(function() { agent.setBreakpointByUrl({
        url: 'folder/app.js',
        line: 0,
        column: 0,
        condition: ''
      }, done); }).to.not.throw();
    });

    var agent;

    function setupDebugScenario(done) {
      launcher.runOnBreakInFunction(function(session) {
        session.scriptManager = new ScriptManager({}, session);
        agent = new DebuggerAgent({}, session);
        done();
      });
    }
  });
});
