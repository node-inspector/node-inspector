var expect = require('chai').expect,
  launcher = require('./helpers/launcher.js'),
  DebuggerAgent = require('../lib/DebuggerAgent.js').DebuggerAgent;

describe('DebuggerAgent', function() {
  after(launcher.stopAllDebuggers);

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
      launcher.runOnBreakInFunction(function(client) {
        debuggerClient = client;
        agent = new DebuggerAgent({}, null, debuggerClient, null, null);
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

    var debuggerClient, agent;

    function setupDebugScenario(done) {
      launcher.runOnBreakInFunction(function(client) {
        debuggerClient = client;
        agent = new DebuggerAgent({}, null, debuggerClient, null, null);
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

    var debuggerClient, agent;

    function setupDebugScenario(done) {
      launcher.runOnBreakInFunction(function(client) {
        debuggerClient = client;
        var frontEndClientStub = {
          sendEvent: function() {}
        };
        agent = new DebuggerAgent(
          {},
          frontEndClientStub,
          debuggerClient,
          null,  // BreakEventHandler
          null); // ScripManager
        done();
      });
    }
  });
});
