var getLines = require('./profiler').getLogLines;


var procProto = global.v8debug.DebugCommandProcessor.prototype;
var oldReqHandler = procProto.processDebugJSONRequest;

function newReqHandler(json_request) {
  var req = JSON.parse(json_request);
  if (req.command === 'getloglines') {
    var res = response = this.createResponse(req);
    try {
      res.body = getLines(req.position);
    } 
    catch (e) {
      res.failed('profiler error');
    }
    res.running = this.running_;
    return res.toJSONProtocol();
  } 
  else {
    return oldReqHandler.call(this, json_request);
  }
};

procProto.processDebugJSONRequest = newReqHandler;
