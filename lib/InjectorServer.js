/**
* @param {{DebuggerScript,InjectedScriptHost,InjectedScriptSource,stackTraceLimit}} options
*/
function injectorServer(options) {
  var fs = require('fs');
  var debug = require(options['v8-debug']);

  var debuggerScriptSource = fs.readFileSync(options['DebuggerScript']);
  var DebuggerScript = debug.runInDebugContext(debuggerScriptSource);
  
  var InjectedScriptHostSource = fs.readFileSync(options['InjectedScriptHost']);
  var InjectedScriptHost = debug.runInDebugContext(InjectedScriptHostSource)(DebuggerScript);
  
  var InjectedScriptSource = fs.readFileSync(options['InjectedScript']);
  var InjectedScript = debug.runInDebugContext(InjectedScriptSource);
  var injectedScript = InjectedScript(InjectedScriptHost, global, 1);
  
  function wrapCallback(argsList, callback) {
    return function(request, response) {
      InjectedScriptHost.execState = this.exec_state_;
      
      var args = argsList.map(function(name) {
        return request.arguments[name];
      });
      
      callback.call(this, args, response, injectedScript, DebuggerScript);
      
      InjectedScriptHost.execState = null;
    }
  }
  
  debug.registerAgentCommand = function(command, parameters, callback) {
    this.register(command, wrapCallback(parameters, callback));
  };
  
  global.process._require = require;
  global.process._debugObject = debug;
}

module.exports = injectorServer;
