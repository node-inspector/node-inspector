
function FrontendCommandHandler(sendResponseCb) {
  this._agents = {};
  this._sendResponse = sendResponseCb;
}

FrontendCommandHandler.prototype = {
  registerAgent: function(name, agent) {
    this._agents[name] = agent;
  },

  handleCommand: function(messageObject) {
    var fullMethodName = messageObject.method,
        domainAndMethod = fullMethodName.split('.'),
        domainName = domainAndMethod[0],
        methodName = domainAndMethod[1],
        agent,
        method,
        args;

    agent = this._agents[domainName];
    if (!agent) {
      console.log('Received request for an unknown domain ' + domainName + ': ' + fullMethodName);
      return;
    }

    method = agent[methodName];
    if (!method || typeof method !== 'function') {
      console.log('Received request for an unknown method ' + methodName + ': ' + fullMethodName);
      return;
    }


    method.call(agent, messageObject.params, function(error, result) {
        this._handleMethodResult(messageObject.id, fullMethodName, error, result);
      }.bind(this));
  },

  _handleMethodResult: function(requestId, fullMethodName, error, result) {
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
