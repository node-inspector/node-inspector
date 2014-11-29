// Copyright 2014 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

(function()
{

/**
 * @suppressGlobalPropertiesCheck
 */
function toolboxLoaded()
{
    if (!window.opener)
        return;
    window.opener.WebInspector["app"]["toolboxLoaded"](document);
}

runOnWindowLoad(toolboxLoaded);

})();