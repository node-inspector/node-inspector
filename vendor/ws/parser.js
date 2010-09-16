/*-----------------------------------------------
  The new onData callback for
  http.Server IncomingMessage
-----------------------------------------------*/
var sys = require("sys")
  , events = require("events")
  , Buffer = require("buffer").Buffer;

module.exports = Parser;

function Parser(version){
  events.EventEmitter.call(this);
  
  this.version = version.toLowerCase() || "draft76";
  this.readable = true;
  this.paused = false;
  
  if(this.version == "draft76" || this.version == "draft75"){
    this.frameData = [];
    this.frameStage = "begin";
  }
};

sys.inherits(Parser, events.EventEmitter);


Parser.prototype.write = function(data){
  var pkt, msg;
  for(var i = 0, len = data.length; i<len; i++){
    if(this.order == 0){
      if(data[i] & 0x80 == 0x80){
        this.order = 1;
      } else {
        this.order = -1;
      }
    } else if(this.order == -1){
      if(data[i] === 0xFF){
        pkt = new Buffer(this.frameData);
        this.order = 0;
        this.frameData = [];

        this.emit("data", pkt.toString("utf8", 0, pkt.length));
      } else {
        this.frameData.push(data[i]);
      }
    } else if(this.order == 1){
      this.emit("error", "High Order packet handling is not yet implemented.");
      this.order = 0;
    }
  }
};

Parser.prototype.destroy = function(){
  delete this.order;
  delete this.frameData;
}

















exports.createParseStream = function(version){
  return new ParserStream(version);
};

var ParserStream = exports.ParseStream = function(version){
  events.EventEmitter.call(this);
  
  // states
  this.readable = true;
  this.writable = true;
  this.paused = false;
  
  // stream options
  this.version = version.toLowerCase() || "draft76";
  
  // A buffer to store #write data
  this.bufferSize = 40 * 1024;
  this.buffer = new Buffer(this.bufferSize);
  
  // we need to use a 
  this.frameBuffer = [];
  this.parseState = "";
};

sys.inherits(ParserStream, events.EventEmitter);

// Readable Stream
ParserStream.prototype._read = function(){
  var self = this;
  
  // can't read a paused stream.
  if(!self.readable || self.paused) return;
  
  
  // on new frame:
  var msg = new events.EventEmitter();
  
  this.emit("message", msg);
  
  while len, 
    if this.frameState is "start" or "part"
      // when we get part of a message:
      // say, we buffer 100 bytes or something, a small buffer amount.
      msg.emit("data", this.frameBuffer);
      
    else, 
      // when the frame finishes:
      msg.emit("end", this.frameBuffer);
  end
};

ParserStream.prototype.pause = function(){
  this.paused = true;
};
ParserStream.prototype.resume = function(){
  this.paused = false;
  
  this.buffer.length > 
};
ParserStream.prototype.destroy = function(){}


// Writable Stream
ParserStream.prototype.write = function(){};
ParserStream.prototype.flush = function(){};
ParserStream.prototype.end = function(){};
























