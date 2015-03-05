var async = require('async');
var expect = require('chai').expect;
var launcher = require('./helpers/launcher.js');
var FrontendCommandHandler = require('../lib/FrontendCommandHandler.js').FrontendCommandHandler;
var FrontendClient = require('../lib/FrontendClient.js').FrontendClient;
var ScriptFileStorage = require('../lib/ScriptFileStorage.js').ScriptFileStorage;
var ScriptManager = require('../lib/ScriptManager.js').ScriptManager;
var InjectorClient = require('../lib/InjectorClient.js').InjectorClient;
var WebSocketMock = require('./helpers/wsmock');

describe('FrontendCommandHandler', function() {
  after(launcher.stopAllDebuggers);
  before(setupProcess);

  var session;
  
  function setupProcess(done) {
    var scriptToDebug = 'BreakInFunction.js'; // any script will work
    launcher.startDebugger(
      scriptToDebug,
      function(childProcess, _session) {
        session = _session;
        done();
      });
  }
  
  it('defers "scriptParsed" events until "Page.getResourceTree"', function(done) {
    var TREE_REQID = 10;

    async.waterfall([
      function arrange(cb) {
        this.wsmock = new WebSocketMock();

        var handler = createFrontendCommandHandler(this.wsmock, session);
        this.handler = handler;
        this.handleCommand = function(req) {
          handler.handleCommand(req);
        };

        cb();
      },

      function act(cb) {
        this.handleCommand({ id: 1, method: 'Debugger.enable' });

        // Introduce a small timeout to let DebuggerAgent fetch scripts
        setTimeout(function() {
          this.handleCommand({ id: TREE_REQID, method: 'Page.getResourceTree' });
        }.bind(this), 100);

        this.wsmock.on('send', function(payload) {
          if (payload.id == TREE_REQID)
            cb();
        });
      },

      function verify(cb) {
        var events = [];
        this.wsmock.messages.forEach(function(msg) {
          if (msg.id == TREE_REQID) {
            events.push('resources');
          } else if (msg.method == 'Debugger.scriptParsed') {
            if (events.indexOf('scripts') == -1)
              events.push('scripts');
          }
        });

        expect(events).to.eql(['resources', 'scripts']);
        cb();
      }
    ], done);
  });

  function createFrontendCommandHandler(wsclient, session) {
    var config = {inject: false};
    session.frontendClient = new FrontendClient(wsclient);
    session.injectorClient = new InjectorClient(config, session);
    session.scriptManager = new ScriptManager(config, session);
    session.breakEventHandler = {};

    return new FrontendCommandHandler(config, session);
  }
});
