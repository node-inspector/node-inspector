# Copyright 2015 The Chromium Authors. All rights reserved.
# Use of this source code is governed by a BSD-style license that can be
# found in the LICENSE file.


def _CheckCodeMirrorChanges(input_api, output_api):
    errorText = ("ERROR: Attempt to modify CodeMirror. The only allowed changes are "
                 "rolls from the upstream (http://codemirror.net). If this is a roll, "
                 "make sure you mention 'roll CodeMirror' (no quotes) in the change description.\n"
                 "CodeMirror rolling instructions:\n"
                 "    https://sites.google.com/a/chromium.org/devtools-codemirror-rolling")
    changeDescription = input_api.change.DescriptionText()
    errors = []
    if "roll codemirror" not in changeDescription.lower():
        errors.append(output_api.PresubmitError(errorText))
    return errors


def CheckChangeOnUpload(input_api, output_api):
    results = []
    results.extend(_CheckCodeMirrorChanges(input_api, output_api))
    return results
