/*
 * Copyright (C) 2013 Google Inc. All rights reserved.
 * Copyright (C) 2012 Intel Inc. All rights reserved.
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

/**
 * @constructor
 * @extends {WebInspector.Object}
 * @param {!WebInspector.TimelineModel} model
 */
WebInspector.TimelinePresentationModel = function(model)
{
    this._model = model;
    this._filters = [];
    /**
     * @type {!Map.<!WebInspector.TimelineModel.Record, !WebInspector.TimelinePresentationModel.Record>}
     */
    this._recordToPresentationRecord = new Map();
    this.reset();
}

WebInspector.TimelinePresentationModel.prototype = {
    /**
     * @param {number} startTime
     * @param {number} endTime
     */
    setWindowTimes: function(startTime, endTime)
    {
        this._windowStartTime = startTime;
        this._windowEndTime = endTime;
    },

    /**
     * @param {?WebInspector.TimelineModel.Record} record
     * @return {?WebInspector.TimelinePresentationModel.Record}
     */
    toPresentationRecord: function(record)
    {
        return record ? this._recordToPresentationRecord.get(record) || null : null;
    },

    /**
     * @return {!WebInspector.TimelinePresentationModel.Record}
     */
    rootRecord: function()
    {
        return this._rootRecord;
    },

    reset: function()
    {
        this._recordToPresentationRecord.clear();
        this._rootRecord = new WebInspector.TimelinePresentationModel.RootRecord();
        /** @type {!Object.<string, !WebInspector.TimelinePresentationModel.Record>} */
        this._coalescingBuckets = {};
    },

    /**
     * @param {!WebInspector.TimelineModel.Record} record
     */
    addRecord: function(record)
    {
        if (record.type() === WebInspector.TimelineModel.RecordType.Program) {
            var records = record.children();
            for (var i = 0; i < records.length; ++i)
                this._innerAddRecord(this._rootRecord, records[i]);
        } else {
            this._innerAddRecord(this._rootRecord, record);
        }
    },

    /**
     * @param {!WebInspector.TimelinePresentationModel.Record} parentRecord
     * @param {!WebInspector.TimelineModel.Record} record
     */
    _innerAddRecord: function(parentRecord, record)
    {
        var coalescingBucket;

        // On main thread, only coalesce if the last event is of same type.
        if (parentRecord === this._rootRecord)
            coalescingBucket = record.thread() ? record.type() : "mainThread";
        var coalescedRecord = this._findCoalescedParent(record, parentRecord, coalescingBucket);
        if (coalescedRecord)
            parentRecord = coalescedRecord;

        var formattedRecord = new WebInspector.TimelinePresentationModel.ActualRecord(record, parentRecord);
        this._recordToPresentationRecord.set(record, formattedRecord);

        formattedRecord._collapsed = parentRecord === this._rootRecord;
        if (coalescingBucket)
            this._coalescingBuckets[coalescingBucket] = formattedRecord;

        for (var i = 0; record.children() && i < record.children().length; ++i)
            this._innerAddRecord(formattedRecord, record.children()[i]);

        if (parentRecord.coalesced())
            this._updateCoalescingParent(formattedRecord);
    },

    /**
     * @param {!WebInspector.TimelineModel.Record} record
     * @param {!WebInspector.TimelinePresentationModel.Record} newParent
     * @param {string=} bucket
     * @return {?WebInspector.TimelinePresentationModel.Record}
     */
    _findCoalescedParent: function(record, newParent, bucket)
    {
        const coalescingThresholdMillis = 5;

        var lastRecord = bucket ? this._coalescingBuckets[bucket] : newParent._presentationChildren.peekLast();
        if (lastRecord && lastRecord.coalesced())
            lastRecord = lastRecord._presentationChildren.peekLast();
        var startTime = record.startTime();
        var endTime = record.endTime();
        if (!lastRecord)
            return null;
        if (lastRecord.record().type() !== record.type())
            return null;
        if (!WebInspector.TimelineUIUtils.isCoalescable(record.type()))
            return null;
        if (lastRecord.record().endTime() + coalescingThresholdMillis < startTime)
            return null;
        if (endTime + coalescingThresholdMillis < lastRecord.record().startTime())
            return null;
        if (lastRecord.presentationParent().coalesced())
            return lastRecord.presentationParent();
        return this._replaceWithCoalescedRecord(lastRecord);
    },

    /**
     * @param {!WebInspector.TimelinePresentationModel.Record} presentationRecord
     * @return {!WebInspector.TimelinePresentationModel.Record}
     */
    _replaceWithCoalescedRecord: function(presentationRecord)
    {
        var record = presentationRecord.record();
        var parent = presentationRecord._presentationParent;
        var coalescedRecord = new WebInspector.TimelinePresentationModel.CoalescedRecord(record);

        coalescedRecord._collapsed = true;
        coalescedRecord._presentationChildren.push(presentationRecord);
        presentationRecord._presentationParent = coalescedRecord;
        if (presentationRecord.hasWarnings() || presentationRecord.childHasWarnings())
            coalescedRecord._childHasWarnings = true;

        coalescedRecord._presentationParent = parent;
        parent._presentationChildren[parent._presentationChildren.indexOf(presentationRecord)] = coalescedRecord;

        return coalescedRecord;
    },

    /**
     * @param {!WebInspector.TimelinePresentationModel.Record} presentationRecord
     */
    _updateCoalescingParent: function(presentationRecord)
    {
        var parentRecord = presentationRecord._presentationParent;
        if (parentRecord.endTime() < presentationRecord.endTime())
            parentRecord._endTime = presentationRecord.endTime();
    },

    /**
     * @param {?RegExp} textFilter
     */
    setTextFilter: function(textFilter)
    {
        var records = this._recordToPresentationRecord.valuesArray();
        for (var i = 0; i < records.length; ++i)
            records[i]._expandedOrCollapsedWhileFiltered = false;
        this._textFilter = textFilter;
    },

    refreshRecords: function()
    {
        this.reset();
        var modelRecords = this._model.records();
        for (var i = 0; i < modelRecords.length; ++i)
            this.addRecord(modelRecords[i]);
    },

    invalidateFilteredRecords: function()
    {
        delete this._filteredRecords;
    },

    /**
     * @return {!Array.<!WebInspector.TimelinePresentationModel.Record>}
     */
    filteredRecords: function()
    {
        if (!this._rootRecord.presentationChildren().length)
            this.refreshRecords();
        if (this._filteredRecords)
            return this._filteredRecords;

        var recordsInWindow = [];

        var stack = [{children: this._rootRecord._presentationChildren, index: 0, parentIsCollapsed: false, parentRecord: {}}];
        var revealedDepth = 0;

        function revealRecordsInStack() {
            for (var depth = revealedDepth + 1; depth < stack.length; ++depth) {
                if (stack[depth - 1].parentIsCollapsed) {
                    stack[depth].parentRecord._presentationParent._expandable = true;
                    return;
                }
                stack[depth - 1].parentRecord._collapsed = false;
                recordsInWindow.push(stack[depth].parentRecord);
                stack[depth].windowLengthBeforeChildrenTraversal = recordsInWindow.length;
                stack[depth].parentIsRevealed = true;
                revealedDepth = depth;
            }
        }

        while (stack.length) {
            var entry = stack[stack.length - 1];
            var records = entry.children;
            if (records && entry.index < records.length) {
                var record = records[entry.index];
                ++entry.index;
                if (record.startTime() < this._windowEndTime && record.endTime() > this._windowStartTime) {
                    if (this._model.isVisible(record.record())) {
                        record._presentationParent._expandable = true;
                        if (this._textFilter)
                            revealRecordsInStack();
                        if (!entry.parentIsCollapsed) {
                            recordsInWindow.push(record);
                            revealedDepth = stack.length;
                            entry.parentRecord._collapsed = false;
                        }
                    }
                }

                record._expandable = false;

                stack.push({children: record._presentationChildren,
                            index: 0,
                            parentIsCollapsed: entry.parentIsCollapsed || (record._collapsed && (!this._textFilter || record._expandedOrCollapsedWhileFiltered)),
                            parentRecord: record,
                            windowLengthBeforeChildrenTraversal: recordsInWindow.length});
            } else {
                stack.pop();
                revealedDepth = Math.min(revealedDepth, stack.length - 1);
                entry.parentRecord._visibleChildrenCount = recordsInWindow.length - entry.windowLengthBeforeChildrenTraversal;
            }
        }

        this._filteredRecords = recordsInWindow;
        return recordsInWindow;
    },

    __proto__: WebInspector.Object.prototype
}

/**
 * @constructor
 * @param {?WebInspector.TimelinePresentationModel.Record} parentRecord
 */
WebInspector.TimelinePresentationModel.Record = function(parentRecord)
{
    /**
     * @type {!Array.<!WebInspector.TimelinePresentationModel.Record>}
     */
    this._presentationChildren = [];

    if (parentRecord) {
        this._presentationParent = parentRecord;
        parentRecord._presentationChildren.push(this);
    }
}

WebInspector.TimelinePresentationModel.Record.prototype = {
    /**
     * @return {number}
     */
    startTime: function()
    {
        throw new Error("Not implemented.");
    },

    /**
     * @return {number}
     */
    endTime: function()
    {
        throw new Error("Not implemented.");
    },

    /**
     * @return {number}
     */
    selfTime: function()
    {
        throw new Error("Not implemented.");
    },

    /**
     * @return {!WebInspector.TimelineModel.Record}
     */
    record: function()
    {
        throw new Error("Not implemented.");
    },

    /**
     * @return {!Array.<!WebInspector.TimelinePresentationModel.Record>}
     */
    presentationChildren: function()
    {
        return this._presentationChildren;
    },

    /**
     * @return {boolean}
     */
    coalesced: function()
    {
        return false;
    },

    /**
     * @return {boolean}
     */
    collapsed: function()
    {
        return this._collapsed;
    },

    /**
     * @param {boolean} collapsed
     */
    setCollapsed: function(collapsed)
    {
        this._collapsed = collapsed;
        this._expandedOrCollapsedWhileFiltered = true;
    },

    /**
     * @return {?WebInspector.TimelinePresentationModel.Record}
     */
    presentationParent: function()
    {
        return this._presentationParent || null;
    },

    /**
     * @return {number}
     */
    visibleChildrenCount: function()
    {
        return this._visibleChildrenCount || 0;
    },

    /**
     * @return {boolean}
     */
    expandable: function()
    {
        return !!this._expandable;
    },

    /**
     * @return {boolean}
     */
    hasWarnings: function()
    {
        return false;
    },

    /**
     * @return {boolean}
     */
    childHasWarnings: function()
    {
        return this._childHasWarnings;
    },

    /**
     * @return {?WebInspector.TimelineRecordListRow}
     */
    listRow: function()
    {
        return this._listRow;
    },

    /**
     * @param {!WebInspector.TimelineRecordListRow} listRow
     */
    setListRow: function(listRow)
    {
        this._listRow = listRow;
    },

    /**
     * @return {?WebInspector.TimelineRecordGraphRow}
     */
    graphRow: function()
    {
        return this._graphRow;
    },

    /**
     * @param {!WebInspector.TimelineRecordGraphRow} graphRow
     */
    setGraphRow: function(graphRow)
    {
        this._graphRow = graphRow;
    }
}

/**
 * @constructor
 * @extends {WebInspector.TimelinePresentationModel.Record}
 * @param {!WebInspector.TimelineModel.Record} record
 * @param {?WebInspector.TimelinePresentationModel.Record} parentRecord
 */
WebInspector.TimelinePresentationModel.ActualRecord = function(record, parentRecord)
{
    WebInspector.TimelinePresentationModel.Record.call(this, parentRecord);
    this._record = record;

    if (this.hasWarnings()) {
        for (var parent = this._presentationParent; parent && !parent._childHasWarnings; parent = parent._presentationParent)
            parent._childHasWarnings = true;
    }
}

WebInspector.TimelinePresentationModel.ActualRecord.prototype = {
    /**
     * @return {number}
     */
    startTime: function()
    {
        return this._record.startTime();
    },

    /**
     * @return {number}
     */
    endTime: function()
    {
        return this._record.endTime();
    },

    /**
     * @return {number}
     */
    selfTime: function()
    {
        return this._record.selfTime();
    },

    /**
     * @return {!WebInspector.TimelineModel.Record}
     */
    record: function()
    {
        return this._record;
    },

    /**
     * @return {boolean}
     */
    hasWarnings: function()
    {
        return !!this._record.warnings();
    },

    __proto__: WebInspector.TimelinePresentationModel.Record.prototype
}

/**
 * @constructor
 * @extends {WebInspector.TimelinePresentationModel.Record}
 * @param {!WebInspector.TimelineModel.Record} record
 */
WebInspector.TimelinePresentationModel.CoalescedRecord = function(record)
{
    WebInspector.TimelinePresentationModel.Record.call(this, null);
    this._startTime = record.startTime();
    this._endTime = record.endTime();
}

WebInspector.TimelinePresentationModel.CoalescedRecord.prototype = {
    /**
     * @return {number}
     */
    startTime: function()
    {
        return this._startTime;
    },

    /**
     * @return {number}
     */
    endTime: function()
    {
        return this._endTime;
    },

    /**
     * @return {number}
     */
    selfTime: function()
    {
        return 0;
    },

    /**
     * @return {!WebInspector.TimelineModel.Record}
     */
    record: function()
    {
        return this._presentationChildren[0].record();
    },

    /**
     * @return {boolean}
     */
    coalesced: function()
    {
        return true;
    },

    /**
     * @return {boolean}
     */
    hasWarnings: function()
    {
        return false;
    },

    __proto__: WebInspector.TimelinePresentationModel.Record.prototype
}

/**
 * @constructor
 * @extends {WebInspector.TimelinePresentationModel.Record}
 */
WebInspector.TimelinePresentationModel.RootRecord = function()
{
    WebInspector.TimelinePresentationModel.Record.call(this, null);
}

WebInspector.TimelinePresentationModel.RootRecord.prototype = {
    /**
     * @return {boolean}
     */
    hasWarnings: function()
    {
        return false;
    },

    __proto__: WebInspector.TimelinePresentationModel.Record.prototype
}
