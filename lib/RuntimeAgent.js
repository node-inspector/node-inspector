// node-inspector version of on webkit-inspector/InspectorRuntimeAgent.cpp
var convert = require('./convert.js'),
    protocol = require('../tools/protocol.json'),
    util = require('util');

/**
 * @param {Object} config
 * @param {DebuggerClient} debuggerClient
 * @constructor
 */
function RuntimeAgent(config, debuggerClient, frontendClient, injectorClient) {
  this._noInject = config.inject === false;
  this._injected = false;
  this._debuggerClient = debuggerClient;
  this._frontendClient = frontendClient;
  this._injectorClient = injectorClient;
  
  var RuntimeProtocol = protocol.domains.filter(function(domain) {
    return domain.domain == 'Runtime';
  })[0];
  var RuntimeCommands = RuntimeProtocol.commands.map(function(command) {
    return command.name;
  });
  
  this._translateCommandToInjection.apply(this, RuntimeCommands);

  if (!this._noInject) this._injectorClient.on('inject', this._inject.bind(this));
}

RuntimeAgent.prototype._inject = function(injected) {
  if (!injected) return;

  this._injectorClient.injection(
    this.injection,
    {
      'protocol': protocol
    },
    function(error, result) {
      this._injected = !error;
      
      if (error) this._frontendClient.sendLogToConsole('error', error.message || error);
    }.bind(this)
  );
};

/**
 * @param {...string} commandNames
*/
RuntimeAgent.prototype._translateCommandToInjection = function(commandNames) {
  Array.prototype.forEach.call(arguments, function(command) {
    this[command] = function(params, done) {
      this._debuggerClient.request('Runtime.' + command, params, done);
    };
  }, this);
};

RuntimeAgent.prototype.injection = function(require, debug, options) {
  var RuntimeProtocol = options.protocol.domains.filter(function(domain) {
    return domain.domain == 'Runtime';
  })[0];
  var RuntimeParameters = {};
  RuntimeProtocol.commands.forEach(function(command) {
    RuntimeParameters[command.name] = (command.parameters || []).map(function(parameter) {
      return parameter.name;
    });
  });
  
  debug.registerAgentCommand(
    'Runtime.evaluate', 
    RuntimeParameters.evaluate, 
    function(args, response, injectedScript, DebuggerScript) {
      response.body = injectedScript.evaluate.apply(injectedScript, args);
    }
  );
  
  debug.registerAgentCommand(
    'Runtime.releaseObjectGroup', 
    RuntimeParameters.releaseObjectGroup, 
    function(args, response, injectedScript, DebuggerScript) {
      injectedScript.releaseObjectGroup.apply(injectedScript, args);
    }
  );
  
  debug.registerAgentCommand(
    'Runtime.releaseObject', 
    RuntimeParameters.releaseObject, 
    function(args, response, injectedScript, DebuggerScript) {
      injectedScript.releaseObject.apply(injectedScript, args);
    }
  );
  
  debug.registerAgentCommand(
    'Runtime.getProperties', 
    RuntimeParameters.getProperties, 
    function(args, response, injectedScript, DebuggerScript) {
      var result = {
        result: injectedScript.getProperties.apply(injectedScript, args)
      }
      
      var objectId = args[0];
      var accessorPropertiesOnly = args[2];
      if (!accessorPropertiesOnly) {
        result.internalProperties = injectedScript.getInternalProperties(objectId);
      }
      
      response.body = result;
    }
  );
  
  debug.registerAgentCommand(
    'Runtime.callFunctionOn', 
    RuntimeParameters.callFunctionOn, 
    function(args, response, injectedScript, DebuggerScript) {
      response.body = injectedScript.callFunctionOn.apply(injectedScript, args);
    }
  );
};

exports.RuntimeAgent = RuntimeAgent;
