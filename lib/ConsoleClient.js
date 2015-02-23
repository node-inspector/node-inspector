//console:messageId:refHandle
var CONSOLE_ID_MATCHER = /^console:(\d+):(\d+)$/;

function ConsoleClient(config, session) {
  this._debuggerClient = session.debuggerClient;
  this._frontendClient = session.frontendClient;
}

ConsoleClient.prototype.isConsoleId = function(objectId) {
  return CONSOLE_ID_MATCHER.test(objectId);
};

ConsoleClient.prototype.lookupConsoleId = function(objectId, done) {
  var matchedId = CONSOLE_ID_MATCHER.exec(objectId);
  var messageId = matchedId[1];
  this._debuggerClient.request(
    'Console._lookupConsoleId', 
    { 
      messageId: messageId,
      objectId: matchedId[2]
    },
    function(error, lookupBody, lookupRefs) {
      if (error) return done(error);
      
      Object.keys(lookupRefs).forEach(function(key) {
        this.convertHandleToConsoleHandle(lookupRefs[key], messageId);
      }, this);
      done(null, lookupBody, lookupRefs);
    }.bind(this)
  );
};

ConsoleClient.prototype.convertHandleToConsoleHandle = function(ref, messageId) {
  if (ref.handle !== undefined) {
    ref.handle = 'console:' + messageId + ':' + ref.handle;
  }
};

exports.ConsoleClient = ConsoleClient;
