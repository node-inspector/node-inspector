'use strict';

class ResponseData {
  constructor() {
    this._data = [];
    this._finished = false;

    this.data = new Promise((resolve, reject) => {
      this._resolve = resolve;
      this._reject = reject;
    });
  }

  finish() {
    if (this._finished) return;
    this._finished = true;

    this._data = this._data.join('');
    this._resolve(this._data);
  }

  dump() {
    if (this._finished) return;
    this._finished = true;

    this._data = '';
    this._resolve(this._data);
  }

  push(chunk) {
    this._data.push(chunk);
  }
}

module.exports = ResponseData;
