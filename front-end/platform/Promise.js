// Copyright 2014 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

/**
 * @param {string} error
 * @return {!Promise.<T>}
 * @template T
 */
Promise.rejectWithError = function(error)
{
    return Promise.reject(new Error(error));
}

/**
 * @param {function((T|undefined))} callback
 * @return {!Promise.<T>}
 * @template T
 */
Promise.prototype.thenOrCatch = function(callback)
{
    return this.then(callback, reject.bind(this));

    /**
     * @param {*} e
     * @this {Promise}
     */
    function reject(e)
    {
        this._reportError(e);
        callback(undefined);
    }
}

Promise.prototype.done = function()
{
    this.catchAndReport();
}

/**
 * @return {!Promise}
 */
Promise.prototype.catchAndReport = function()
{
    return this.catch(this._reportError.bind(this));
}

/**
 * @param {*} e
 */
Promise.prototype._reportError = function(e)
{
    if (e instanceof Error)
        console.error(e.stack);
    else
        console.error(e);
}
