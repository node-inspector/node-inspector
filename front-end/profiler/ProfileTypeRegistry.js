// Copyright 2014 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

/**
 * @constructor
 */
WebInspector.ProfileTypeRegistry = function()
{
    this._profileTypes = [];

    this.cpuProfileType = new WebInspector.CPUProfileType();
    this._addProfileType(this.cpuProfileType);
    this.heapSnapshotProfileType = new WebInspector.HeapSnapshotProfileType();
    this._addProfileType(this.heapSnapshotProfileType);
    this.trackingHeapSnapshotProfileType = new WebInspector.TrackingHeapSnapshotProfileType();
    this._addProfileType(this.trackingHeapSnapshotProfileType);
}

WebInspector.ProfileTypeRegistry.prototype = {
    /**
     * @param {!WebInspector.ProfileType} profileType
     */
    _addProfileType: function(profileType)
    {
        this._profileTypes.push(profileType);
    },

    /**
     * @return {!Array.<!WebInspector.ProfileType>}
     */
    profileTypes: function()
    {
        return this._profileTypes;
    }
}

WebInspector.ProfileTypeRegistry.instance = new WebInspector.ProfileTypeRegistry();
