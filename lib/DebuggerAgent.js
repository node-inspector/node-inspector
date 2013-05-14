// node-inspector version of on webkit-inspector/DebuggerAgent.cpp

function DebuggerAgent(session) {
  this._session = session;
}

DebuggerAgent.prototype = {
  enable: function(params, done) {
    this._session.attach(done);
  },

  disable: function(params, done) {
    this._session.disableDebugger(done);
  },

  getScriptSource: function(params, done) {
    this._session.getScriptSource(params.scriptId, done);
  },
}

exports.DebuggerAgent = DebuggerAgent;