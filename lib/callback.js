function CallbackHandler() {
  this.store = {};
  this.nextCallbackId = 1;
}

CallbackHandler.prototype.promise = function() {
  var seq = this.nextCallbackId++;
  var promise = new Promise((resolve, reject) => {
    this.store[seq] = {
      resolve: resolve,
      reject: reject
    };
  });
  promise.seq = seq;

  return promise;
};

CallbackHandler.prototype.handle = function(response) {
  var promise = this.store[response.request_seq];
  delete this.store[response.request_seq];
  if (promise) {
    if (!response.success)
      return promise.reject(response.message);

    promise.resolve(response);
  }
};

CallbackHandler.prototype.clear = function(error) {
  Object.keys(this.store).forEach(key => this.store[key].reject(error));
};

module.exports = CallbackHandler;
module.exports.CallbackHandler = CallbackHandler;
