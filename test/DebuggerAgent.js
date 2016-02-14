var co = require('co');
var fs = require('fs');
var path = require('path');
var expect = require('chai').expect;
var launcher = require('./helpers/launcher.js');
var ScriptManager = require('../lib/ScriptManager.js');
var InjectorClient = require('../lib/InjectorClient.js');
var DebuggerAgent = require('../lib/Agents/Debugger/DebuggerAgent.js');

var child;
var session;
var debuggerAgent;
var debuggerClient;
var frontendClient;
var injectorClient;
var scriptManager;

describe('DebuggerAgent', () => {
  beforeEach(() => initializeDebugger().catch(error => console.log(error)));
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

        yield debuggerClient.break();
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

        command('steps\n');
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

        command('steps\n');
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

        command('steps\n');
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

        command('steps\n');
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

  describe('#setVariableValue', () => {
    var id;

    function getValue(name) {
      return debuggerAgent.handle('evaluateOnCallFrame', {
        callFrameId: id,
        expression: name,
        returnByValue: true
      }).then(result => result.result.value);
    }

    function getRef(name) {
      return debuggerAgent.handle('evaluateOnCallFrame', {
        callFrameId: id,
        expression: name
      }).then(result => result.result.objectId);
    }

    function setValue(name, value) {
      return debuggerAgent.handle('setVariableValue', {
        scopeNumber: 0,
        variableName: name,
        newValue: value,
        callFrameId: id
      });
    }

    beforeEach(() => {
      return co(function * () {
        yield debuggerAgent.handle('resume');
        command('set-variable-value-frame\n');
        yield debuggerClient.break();

        id = (yield debuggerAgent.handle('getBacktrace'))[0].callFrameId;
      });
    });

    it('should set primitive variable value in frame', () => {
      return co(function * () {
        expect(yield getValue('a')).to.be.equal(10);
        yield setValue('a', {value: 20});
        expect(yield getValue('a')).to.be.equal(20);
      });
    });

    it('should set complex variable value in frame', () => {
      return co(function * () {
        expect(yield getValue('b')).to.be.deep.equal({c: 20});
        yield setValue('b', {value: {c: 40}});
        expect(yield getValue('b')).to.be.deep.equal({c: 40});
      });
    });

    it('should set complex variable value by id in frame', () => {
      return co(function * () {
        expect(yield getValue('a')).to.be.deep.equal(10);
        setValue('a', {objectId: yield getRef('b')});
        expect(yield getValue('a')).to.be.deep.equal({c: 20});
      });
    });
  });

  describe('#setPauseOnExceptions', () => {
    it('should enable pause on uncaught exeptions', () => {
      return co(function * () {
        yield debuggerClient.request('continue');
        yield debuggerAgent.handle('setPauseOnExceptions', { state: 'uncaught' });
        command('throw-uncaught-exception\n');
        var event = yield debuggerClient.exception();
        expect(/uncaught/.test(event.sourceLineText)).to.be.equal(true);
      });
    });

    it('should enable pause on caught exeptions', () => {
      return co(function * () {
        yield debuggerClient.request('continue');
        yield debuggerAgent.handle('setPauseOnExceptions', { state: 'all' });
        command('throw-caught-exception\n');
        var event = yield debuggerClient.exception();
        expect(/[^un]caught/.test(event.sourceLineText)).to.be.equal(true);
      });
    });

    it('should disable pause on exeptions', () => {
      return co(function * () {
        yield debuggerClient.request('continue');

        yield debuggerAgent.handle('setPauseOnExceptions', { state: 'all' });
        command('throw-caught-exception\n');
        var event = yield debuggerClient.exception();
        expect(/[^un]caught/.test(event.sourceLineText)).to.be.equal(true);

        yield debuggerClient.request('continue');

        yield debuggerAgent.handle('setPauseOnExceptions', { state: 'none' });
        command('ignore-exception\n');
        event = yield Promise.race([debuggerClient.exception(), debuggerClient.break()]);
        expect(/debugger/.test(event.sourceLineText)).to.be.equal(true);
      });
    });
  });

  describe('#setScriptSource', () => {
    var frameId;
    var scriptId;
    var watermark;
    var source;

    function getWatermark(backtrace) {
      return co(function * () {
        var frameId = backtrace[0].callFrameId;
        var watermark = yield debuggerAgent.handle('evaluateOnCallFrame', {
          callFrameId: frameId,
          expression: '__watermark__',
          returnByValue: true
        });

        return watermark.result.value;
      });
    }

    function getSource(backtrace) {
      return co(function * () {
        var source = yield debuggerClient.request('scripts', {
          includeSource: true,
          filter: scriptId
        });
        return source[0].source;
      });
    }

    function updateState() {
      return co(function * () {
        scriptManager.get = () => ({});
        yield debuggerAgent.handle('resume');
        command('set-script-source\n');
        yield debuggerClient.break();

        backtrace = yield debuggerAgent.handle('getBacktrace');
        scriptId = backtrace[0].location.scriptId;

        source = yield getSource(backtrace);
        watermark = yield getWatermark(backtrace);
      });
    }

    beforeEach(updateState);

    it('should set script source in paused process', () => {
      return co(function * () {
        expect(watermark).to.be.equal('1');
        var newSource = source.replace(/(__watermark__.*?)(\d+)/, '$12');
        yield debuggerAgent.handle('setScriptSource', {
          scriptId: scriptId,
          scriptSource: newSource
        });
        yield updateState();
        expect(source).to.be.equal(newSource);
        expect(watermark).to.be.equal('2');
      });
    });

    it('should set script source in running process', () => {
      return co(function * () {
        expect(watermark).to.be.equal('1');
        var newSource = source.replace(/(__watermark__.*?)(\d+)/, '$12');
        yield debuggerAgent.handle('resume');
        yield debuggerAgent.handle('setScriptSource', {
          scriptId: scriptId,
          scriptSource: newSource
        });
        yield updateState();
        expect(source).to.be.equal(newSource);
        expect(watermark).to.be.equal('2');
      });
    });

    it('should rethrow an error', () => {
      return co(function * () {
        expect(watermark).to.be.equal('1');
        var oldSource = source;
        var newSource = source.replace(/(__watermark__.*?)(\d+)/, '$1\'>');
        yield debuggerAgent.handle('resume');
        try {
          var result = yield debuggerAgent.handle('setScriptSource', {
            scriptId: scriptId,
            scriptSource: newSource
          });
        } catch (e) {
          expect(e).to.deep.equal({
            message: 'LiveEdit Failure: Failed to compile new version of script: SyntaxError: Unexpected token ILLEGAL',
            data: {
              compileError: {
                message: 'Unexpected token ILLEGAL',
                lineNumber: 26,
                columnNumber: 30
              }
            }
          });
        }

        yield updateState();
        expect(source).to.be.equal(oldSource);
        expect(watermark).to.be.equal('1');
      });
    });
  });
});

function command(text) {
  child.stdin.write(text);
}

function expand(instance) {
  child = instance.child;
  session = instance.session;
  debuggerClient = session.debuggerClient;
  frontendClient = session.frontendClient;
}

function fill() {
  injectorClient = new InjectorClient({}, session);
  session.injectorClient = injectorClient;
  scriptManager = new ScriptManager({}, session);
  session.scriptManager = scriptManager;
  debuggerAgent = new DebuggerAgent({}, session);
}

function initializeDebugger() {
  return co(function * () {
    yield launcher.runCommandlet(true).then(expand).then(fill);
    yield injectorClient.injected();
  });
}
