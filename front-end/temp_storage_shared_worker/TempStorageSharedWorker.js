/*
 * Copyright (C) 2014 Google Inc. All rights reserved.
 *
 * Redistribution and use in source and binary forms, with or without
 * modification, are permitted provided that the following conditions are
 * met:
 *
 *     * Redistributions of source code must retain the above copyright
 * notice, this list of conditions and the following disclaimer.
 *     * Redistributions in binary form must reproduce the above
 * copyright notice, this list of conditions and the following disclaimer
 * in the documentation and/or other materials provided with the
 * distribution.
 *     * Neither the name of Google Inc. nor the names of its
 * contributors may be used to endorse or promote products derived from
 * this software without specific prior written permission.
 *
 * THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS
 * "AS IS" AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT
 * LIMITED TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR
 * A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT
 * OWNER OR CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL,
 * SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT
 * LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE,
 * DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY
 * THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT
 * (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE
 * OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
 */

var ports = [];
var isTempStorageCleared = false;
/**
 * @type {string}
 */
var tempStorageError;

/**
 * @param {!MessageEvent} event
 */
self.onconnect = function(event)
{
    var newPort = /** @type {!MessagePort} */ (event.ports[0]);
    if (isTempStorageCleared) {
        notifyTempStorageCleared(newPort);
        return;
    }

    newPort.onmessage = handleMessage;
    newPort.onerror = handleError;
    ports.push(newPort);

    if (ports.length === 1)
        clearTempStorage();
}

function clearTempStorage()
{
    function didFail(e)
    {
        tempStorageError = "Failed to clear temp storage: " + e.message + " " + e.name;
        console.error(tempStorageError);
        didClearTempStorage();
    }
    /**
     * @param {!FileSystem} fs
     */
    function didGetFS(fs)
    {
        fs.root.createReader().readEntries(didReadEntries, didFail);
    }
    /**
     * @param {!Array.<!Entry>} entries
     */
    function didReadEntries(entries)
    {
        var remainingEntries = entries.length;
        if (!remainingEntries) {
            didClearTempStorage();
            return;
        }
        function didDeleteEntry()
        {
            if (!--remainingEntries)
                didClearTempStorage();
        }
        function failedToDeleteEntry(e)
        {
            tempStorageError = "Failed to delete entry: " + e.message + " " + e.name;
            console.error(tempStorageError);
            didDeleteEntry();
        }
        for (var i = 0; i < entries.length; i++) {
            var entry = entries[i];
            if (entry.isFile)
                entry.remove(didDeleteEntry, failedToDeleteEntry);
            else
                entry.removeRecursively(didDeleteEntry, failedToDeleteEntry);
        }
    }
    self.webkitRequestFileSystem(self.TEMPORARY, 10, didGetFS, didFail);
}

function didClearTempStorage()
{
  isTempStorageCleared = true;
  for (var i = 0; i < ports.length; i++)
      notifyTempStorageCleared(ports[i]);
  ports = null;
}

/**
 * @param {!MessagePort} port
 */
function notifyTempStorageCleared(port)
{
    port.postMessage({
        type: "tempStorageCleared",
        error: tempStorageError
    });
}

function handleMessage(event)
{
    if (event.data.type === "disconnect")
        removePort(event.target);
}

function handleError(event)
{
    console.error("Error: " + event.data);
    removePort(event.target);
}

function removePort(port)
{
    if (!ports)
        return;
    var index = ports.indexOf(port);
    ports.splice(index, 1);
}
