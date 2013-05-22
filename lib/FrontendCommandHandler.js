var RuntimeAgent = require('./RuntimeAgent').RuntimeAgent,
  PageAgent = require('./PageAgent').PageAgent,
  DebuggerAgent = require('./DebuggerAgent').DebuggerAgent;

function FrontendCommandHandler(sendResponseCb, session) {
  this._agents = {};
  this._specialCommands = {};
  this._sendResponse = sendResponseCb;
  this._initializeRegistry(session);
}

FrontendCommandHandler.prototype = {
  _initializeRegistry: function (session) {
    this._registerAgent('Debugger', new DebuggerAgent(session));
    this._registerAgent('Runtime', new RuntimeAgent(session));
    this._registerAgent('Page', new PageAgent(session));

    this._registerNoopCommands(
      'Network.enable',
      'Console.enable',
      'Database.enable',
      'DOMStorage.enable',
      'DOM.hideHighlight',
      'Inspector.enable',
      'Profiler.enable',
      'CSS.enable'
    );

    this._registerQuery('CSS.getSupportedCSSProperties', { cssProperties: []});
    this._registerQuery('Worker.canInspectWorkers', { result: false });
  },

  _registerAgent: function (name, agent) {
    this._agents[name] = agent;
  },

  _registerNoopCommands: function () {
    var i, fullMethodName;
    for (i = 0; i < arguments.length; i++) {
      fullMethodName = arguments[i];
      this._specialCommands[fullMethodName] = {};
    }
  },

  _registerQuery: function (fullMethodName, result) {
    this._specialCommands[fullMethodName] = { result: result };
  },

  handleCommand: function (messageObject) {
    var fullMethodName = messageObject.method,
      domainAndMethod = fullMethodName.split('.'),
      domainName = domainAndMethod[0],
      methodName = domainAndMethod[1],
      agent,
      method;

    if (this._specialCommands[fullMethodName]) {
      this._handleMethodResult(
        messageObject.id,
        fullMethodName,
        null,
        this._specialCommands[fullMethodName].result);
      return;
    }

    agent = this._agents[domainName];
    if (!agent) {
      console.log(
        'Received request for an unknown domain %s: %s',
        domainName,
        fullMethodName);
      return;
    }

    method = agent[methodName];
    if (!method || typeof method !== 'function') {
      console.log(
        'Received request for an unknown method %s: %s',
        methodName,
        fullMethodName);
      return;
    }


    method.call(agent, messageObject.params, function (error, result) {
      this._handleMethodResult(messageObject.id, fullMethodName, error, result);
    }.bind(this));
  },

  _handleMethodResult: function (requestId, fullMethodName, error, result) {
    var response;

    if (!requestId) {
      if (response !== undefined)
        console.log('Warning: discarded result of ' + fullMethodName);
      return;
    }

    response = { id: requestId };
    if (error !== undefined && error !== null)
      response.error = error;
    else
      response.result = result;

    this._sendResponse(response);
  }
}

exports.FrontendCommandHandler = FrontendCommandHandler;
