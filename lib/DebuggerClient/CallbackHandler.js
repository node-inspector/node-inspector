'use strict';

class CallbackHandler {
  constructor() {
    this.store = {};
    this.nextCallbackId = 1;
  }

  promise() {
    const seq = this.nextCallbackId++;
    const promise = new Promise((resolve, reject) => {
      this.store[seq] = {
        resolve: resolve,
        reject: reject
      };
    });
    promise.seq = seq;

    return promise;
  }

  handle(response) {
    const promise = this.store[response.request_seq];
    if (!promise) return;

    delete this.store[response.request_seq];
    if (!response.success)
      return promise.reject(response.message);

    promise.resolve(response);
  }

  clear(error) {
    Object.keys(this.store).forEach(key => this.store[key].reject(error));
  }
}

module.exports = CallbackHandler;
