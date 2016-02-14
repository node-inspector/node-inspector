// This function will be injected into the target process.
module.exports = function injection(require, debug, options) {

  debug.registerAgentCommand('Runtime.evaluate',
    ['expression', 'objectGroup', 'injectCommandLineAPI', 'returnByValue', 'generatePreview'],
    function(args, response, InjectedScript) {
      var result = InjectedScript.evaluate.apply(InjectedScript, args);
      response.body = result;
    });

  debug.registerAgentCommand('Runtime.callFunctionOn',
    ['objectId', 'functionDeclaration', 'arguments', 'returnByValue'],
    function(args, response, InjectedScript) {
      args[2] = JSON.stringify(args[2]);
      var result = InjectedScript.callFunctionOn.apply(InjectedScript, args);
      response.body = result;
    });

  debug.registerAgentCommand('Runtime.getProperties',
    ['objectId', 'ownProperties', 'accessorPropertiesOnly', 'generatePreview'],
    function(args, response, InjectedScript) {
      var result = {
        result: InjectedScript.getProperties.apply(InjectedScript, args)
      };

      var objectId = args[0];
      var accessorPropertiesOnly = args[2];
      if (!accessorPropertiesOnly) {
        result.internalProperties = InjectedScript.getInternalProperties(objectId);
      }

      response.body = result;
    });

  debug.registerAgentCommand('Runtime.releaseObject',
    ['objectId'],
    function(args, response, InjectedScript) {
      debug.releaseObject(args[0]);
    });

  debug.registerAgentCommand('Runtime.releaseObjectGroup',
    ['objectGroup'],
    function(args, response, InjectedScript) {
      debug.releaseObjectGroup(args[0]);
    });
};
