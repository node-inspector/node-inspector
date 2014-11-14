(function (DebuggerScript) {
  function InjectedScriptHost() {}

  InjectedScriptHost.type = function(value) {
    if (%_IsArray(value)) return 'array';
    if (%_ClassOf(value) === 'Date') return 'date';
    if (%_IsRegExp(value)) return 'regexp';
  };
  
  InjectedScriptHost.internalConstructorName = function(object) {
    return %_ClassOf(object);
  };
  
  InjectedScriptHost.evaluate = function(expression) {
    if (typeof expression !== 'string') {
      //In full implementation of protocol this place is unreachable.
      throw new Error('evaluate waits string');
    }
    return this.execState.evaluateGlobal(expression).value();
  };
  
  InjectedScriptHost.isHTMLAllCollection = function(object) {
    //We don't have `all` collection in NodeJS
    return false;
  };
  
  InjectedScriptHost.suppressWarningsAndCallFunction = function(func, receiver, args) {
    func.apply(receiver, args);
  };
  
  InjectedScriptHost.functionDetails = function(fun) {
    var details = {};
    var mirror = MakeMirror(fun);
    var scopes = DebuggerScript.getFunctionScopes(fun);
    var location = mirror.sourceLocation();

    details.functionName = mirror.name() || '';
    details.location = {
      lineNumber: location.line,
      columnNumber: location.column,
      scriptId: mirror.script().id()
    };
    if (scopes && scopes.length) {
      details.rawScopes = scopes;
    }
    return details;
  };
  
  InjectedScriptHost.getInternalProperties = function(value) {
    return DebuggerScript.getInternalProperties(value);
  };
  
  return InjectedScriptHost;
});