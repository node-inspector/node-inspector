/*
 * Copyright (C) 2011 Google Inc. All rights reserved.
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

Object.defineProperty(Array.prototype, "sortRange", { value: function(comparator, leftBound, rightBound, k)
{
    function swap(array, i1, i2)
    {
        var temp = array[i1];
        array[i1] = array[i2];
        array[i2] = temp;
    }

    function partition(array, comparator, left, right, pivotIndex)
    {
        var pivotValue = array[pivotIndex];
        swap(array, right, pivotIndex);
        var storeIndex = left;
        for (var i = left; i < right; ++i) {
            if (comparator(array[i], pivotValue) < 0) {
                swap(array, storeIndex, i);
                ++storeIndex;
            }
        }
        swap(array, right, storeIndex);
        return storeIndex;
    }

    function quickSortFirstK(array, comparator, left, right, k)
    {
        if (right <= left)
            return;
        var pivotIndex = Math.floor(Math.random() * (right - left)) + left;
        var pivotNewIndex = partition(array, comparator, left, right, pivotIndex);
        quickSortFirstK(array, comparator, left, pivotNewIndex - 1, k);
        if (pivotNewIndex < left + k - 1)
            quickSortFirstK(array, comparator, pivotNewIndex + 1, right, k);
    }

    if (leftBound === 0 && rightBound === (this.length - 1) && k === this.length)
        this.sort(comparator);
    else
        quickSortFirstK(this, comparator, leftBound, rightBound, k);
    return this;
}});
