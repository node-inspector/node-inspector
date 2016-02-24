// Copyright 2015 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

WebInspector.Diff = {
    /**
     * @param {string} text1
     * @param {string} text2
     * @return {!Array.<!{0: number, 1: string}>}
     */
    charDiff: function(text1, text2)
    {
        var differ = new diff_match_patch();
        return differ.diff_main(text1, text2);
    },

    /**
     * @param {!Array.<string>} lines1
     * @param {!Array.<string>} lines2
     * @return {!Array.<!{0: number, 1: string}>}
     */
    lineDiff: function(lines1, lines2)
    {
        var lineToChar = new Map();
        var charCode = 33;
        var text1 = encode(lines1);
        var text2 = encode(lines2);

        return WebInspector.Diff.charDiff(text1, text2);

        /**
         * @param {!Array.<string>} lines
         * @return {string}
         */
        function encode(lines)
        {
            var text = "";
            for (var i = 0; i < lines.length; ++i) {
                var line = lines[i];
                var character = lineToChar.get(line);
                if (!character) {
                    character = String.fromCharCode(charCode++);
                    lineToChar.set(line, character);
                }
                text += character;
            }
            return text;
        }
    },
}

WebInspector.Diff.Operation = {
    Equal: 0,
    Insert: 1,
    Delete: -1
}
