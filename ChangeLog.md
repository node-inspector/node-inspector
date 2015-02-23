## 2015-02-24, Version 0.9.1

 * Move gitter badge to right place (3y3)

 * Added Gitter badge (The Gitter Badger)

 * README: fix typos (Wendy Leung)

 * Bump v8-debug to v0.4.2, v8-profiler to 5.2.4 (Jim Cummins)

 * .travis.yml: drop 0.11, add 0.12 and io.js (Miroslav Bajtoš)


## 2015-02-11, Version 0.9.0

 * tools: set +x for git-changelog.sh (Miroslav Bajtoš)

 * README note about preloading and symlinks (Jurgen Leschner)

 * use glob v4.3.5 - NOTE disables symlink following (Jurgen Leschner)

 * Enable latest Node v0.10 on Travis again (Miroslav Bajtoš)

 * Make sure to open URL in a webkit browser (jakub-g)

 * Fix: Breakpoints doesn't work for Windows (3y3)

 * lib: Fix typo (Seth Krasnianski)

 * Fix --hidden option for NODE_DEBUG mode (3y3)

 * travis: fix Node versions (Miroslav Bajtoš)


## 2015-01-12, Version 0.8.3

 * Fix release logic (3y3)


## 2015-01-12, Version 0.8.2

 * Fix release.sh for Windows (3y3)

 * Fix Console API getCallerFuncLocation (3y3)

 * Wrong name ScriptManager.normalizeV8Name (3y3)

 * Replace deprecated express sendfile with sendFile. (Timur Amirov)

 * front-end: fix non-expanding tree-element (tobiasviehweger)

 * Release script updated (3y3)

 * Check Windows case insensitive app name (3y3)

 * Avoid serialization of internal properties (3y3)


## 2014-12-08, Version 0.8.1

 * Update v8-profiler version (3y3)

 * Check NaN object in mirrors cache (3y3)

 * tools/git-changelog: always print the header (Miroslav Bajtoš)

 * tools/release: fixes and improvements (Miroslav Bajtoš)


## 2014-12-03, Version 0.8.0

 * Fixed issue #478 (jlu)

 * Modified DebuggerAgent.getFunctionDetails (3y3)

 * Added HeapProfiler._lookupHeapObjectId (3y3)

 * Console serializing and caching logic moved to InjectorServer (3y3)

 * README: fix command for debugging Gulp on Windows (thorn0)

 * Console API (3y3)

 * HeapProfiler API (3y3)

 * ChangeLog: update to the new markdown format (Miroslav Bajtoš)

 * Simplify the release process (Miroslav Bajtoš)

 * README: Fix broken link. (Marcelo Campos Rocha)

 * README: Add info on debugging Gulp tasks (Eric Eastwood)

 * Update README.MD (3y3)

 * Added usage examples (3y3)

 * New help system (3y3)

 * Added customizable webHost to node-debug (3y3)

 * Exclude configuration logic from node-debug (3y3)

 * Use yargs as argv preprocessor in config.js (3y3)

 * Deprecate allowed web-host `null` value (3y3)

 * Create config from constructor (3y3)

 * Enable node-inspector listening on https. (mriehle)

 * Profiler API (3y3)

 * Use correct comment style in Overrides.css (3y3)

 * Overrides: fix `WebInspector.UIString` (Miroslav Bajtoš)

 * front-end: hide DOM, XHR and Event Listener breakpoints (3y3)

 * front-end: rename "(no domain)" to "(core modules)" (3y3)

 * front-end: remove unusable tabs in settings screen (3y3)

 * Extend noop-commands list (3y3)

 * test: increase test timeout in InjectorClient (Miroslav Bajtoš)

 * Fix passing config from session.js to ScriptManager.js (3y3)

 * Add Inspector favicon (3y3)

 * test: increase test timeout in InjectorClient (Miroslav Bajtoš)

 * Version checking refactored (3y3)

 * Update devtools overview url in README (Fodi69)

 * Deprecated config.js cleanup (3y3)

 * README: fix link pointing to docs.strongloop.com (Miroslav Bajtoš)

 * test: fix race condition in launcher (Miroslav Bajtoš)

 * package: update dependencies, use "^" (Miroslav Bajtoš)

 * README: minor improvements (Miroslav Bajtoš)

 * BreakEventHandler: fix break on uncaught exception (Miroslav Bajtoš)

 * debugger: fix protocol debug log (Miroslav Bajtoš)

 * Injector API restructuring (3y3)

 * Add Bountysource badge to README (bountysource-support)

 * Fix InjectorServer socket closing (3y3)

 * Update `debug` to "1.0" (Miroslav Bajtoš)

 * Removed trailing space. (Miroslav Bajtoš)

 * Bump up the next version to 0.8.0 (Miroslav Bajtoš)

 * Injector API (3y3)

 * start work on v0.7.5 (Miroslav Bajtoš)


## 2014-06-05, Version 0.7.4

 * Non-ascii string saving fix (junecoder)

 * front-end: fix for the Safari browser (ivan baktsheev)

 * node-debug: Detecting Windows CMD files (3y3)

 * node-debug: Passing NodeJS options to debugged process (3y3)

 * node-debug: Fixed passing inspector's 'no-' arg in node-debug (3y3)

 * Fix conversion of config options (3y3)


## 2014-04-08, Version 0.7.3

 * ScriptFileStorage: fix fs.readFile usage on v0.8 (Miroslav Bajtoš)

 * Update dependencies (Miroslav Bajtoš)

 * Switch to core _debugger module. (3y3)


## 2014-03-21, Version 0.7.2

 * Fixed a race condition in the debug-server.js (Vasil Dininski)

 * Use jshint instead of gjslint (Miroslav Bajtoš)

 * fixjsstyle cleanup (3y3)

 * debugger isRunning state changes (3y3)


## 2014-03-11, Version 0.7.1

 * Added subtype property to RemoteObject (3y3)

 * Checked Invalid Date object (3y3)

 * Fixed wrong proto object link (3y3)

 * Checking configurable option (3y3)

 * Properties conversion isolated to function (3y3)

 * Handle shebang in ScriptFileStorage load/save (Miroslav Bajtoš)

 * Implement Debugger.setSkipAllPauses (Miroslav Bajtoš)

 * Fix links (Miroslav Bajtoš)

 * MAINTAINERS: use imperative sentence style (Miroslav Bajtoš)


## 2014-02-20, Version 0.7.0

 * README restructuralization (Miroslav Bajtoš)

 * Rename readme.md to README.md (Miroslav Bajtoš)

 * Update AUTHORS (Miroslav Bajtoš)

 * Defer "scriptParsed" until "Page.getResourceTree" (Miroslav Bajtoš)

 * Lower the frequency of auto reloads (Miroslav Bajtoš)

 * Update .npmignore (Miroslav Bajtoš)

 * Clean up node-debug help message (Sam Roberts)

 * bin/inspector: Add -h -v --version options (Miroslav Bajtoš)

 * Speed up initial parsing of source-map URLs (Miroslav Bajtoš)

 * Cache results of ScriptFileStorage.listScripts. (Miroslav Bajtoš)

 * Ignore EACCESS errors when listing sources (Miroslav Bajtoš)

 * Tighten findAllApplicationScripts heuristics (Miroslav Bajtoš)

 * Implement node-debug. (Miroslav Bajtoš)

 * RuntimeAgent: implement releaseObject() as no-op (Miroslav Bajtoš)

 * Fix DebuggerAgent.setVariableValue to object (Miroslav Bajtoš)

 * Add WebSocketServer error handler. (Miroslav Bajtoš)

 * README: added shell code higlight (Ionică Bizău)

 * Fix conversion of Error objects (Miroslav Bajtoš)

 * Use WebSockets instead of socket.io. (Kenneth Auchenberg)

 * Small indentation fixes (3y3)

 * Help message format update (3y3)

 * Reload browser when detached from target (ChrisWren)

 * Make socket.io work with subfolder hosting. (Pritam Baral)


## 2014-01-23, Version 0.7.0-2

 * Updated AUTHORS. (Miroslav Bajtoš)

 * Fixed display of RegExp objects. (3y3)

 * Fixed DebuggerClient.resume acting like stepInto (Miroslav Bajtoš)

 * Fixed timing-dependent unit-tests failures (Miroslav Bajtoš)

 * test: improved describe/it names (Miroslav Bajtoš)

 * Fixed misspelled word "Visit" in docs (Peter Lyons)

 * Fix Date display format. Issue #281 (3y3)

 * Fixed throw on DebuggerAgent.resume() (Lennon Pulda-Grealy)

 * Added large String support for debugger evaluation requests (Peter Flannery)


## 2013-12-26, Version 0.7.0-1

 * Improved formatting of Date objects in inspector (Sergey Krilov)

 * Added --no-preload to disable glob of all *.js (Dick Hardt)

 * Update readme with faq about browser storage and debug metadata (Karan Batra-Daitch)

 * Fixed CallFramesProvider test on Node v0.11. (Miroslav Bajtos)


## 2013-12-04, Version 0.6.2

 * Updated AUTHORS. (Miroslav Bajtos)

 * docs: explain dashed name rc config conversion (cattail)

 * Removed false error messages on reload (Dave)


## 2013-11-17, Version 0.6.1

 * Added debug logging of communication (Miroslav Bajtos)


## 2013-11-12, Version 0.6.0

 * gjslint: removed workaround for linter bug (Miroslav Bajtos)

 * Updated AUTHORS. (Miroslav Bajtos)

 * Added `stackTraceLimit` configuration, fixes #96. (ssafejava)

 * test: fixed launcher errors on windows (Miroslav Bajtos)

 * Remove dependence on HTTP for socket io connection to server (Matthew O'Riordan)

 * README: added WTF entry about adblock (Gary Katsevman)

 * README: howto signal SIGUSR1 on windows (Miroslav Bajtos)

 * lib,test: fixed lint issues (Miroslav Bajtos)


## 2013-09-20, Version 0.5.0

 * Quick fix for properties displayed twice in UI (Miroslav Bajtos)

 * README: added FAQ entry for --hidden option (Miroslav Bajtos)

 * lib: fixed hiding of script files (Miroslav Bajtos)

 * lib: fix config handling (Miroslav Bajtos)

 * Updated AUTHORS. (Miroslav Bajtos)

 * Fixed wrong hint in error message if web port is used. (Adam Hořčica)

 * NetworkAgent: support data scheme URLs (Miroslav Bajtos)

 * package.json: upgraded to express 3.4 (Miroslav Bajtos)

 * lib,Overrides: support the updated front-end (Miroslav Bajtos)

 * front-end: patched inspector.html (Miroslav Bajtos)

 * front-end: upgraded to Blink branch 1625, r157454 (Miroslav Bajtos)

 * tools: implemented update-front-end.sh (Miroslav Bajtos)


## 2013-09-05, Version 0.4.0

 * Emit 'listening' and 'error' events (Miroslav Bajtos)

 * README: fixed headings level (Miroslav Bajtos)

 * New configuration system based on RC module (3y3)


## 2013-08-21, Version 0.3.4

 * Bugfix: crash when breakpoint was hit in eval()-ed (Miroslav Bajtos)


## 2013-08-12, Version 0.3.3

 * package.json: upgraded to express 3.3 (Miroslav Bajtos)

 * README: added section 'Contributing Code' (Miroslav Bajtos)

 * README: Updated "Thanks" section (Miroslav Bajtos)

 * Updated AUTHORS list. (Miroslav Bajtos)

 * DebugServer: Fix for source map paths on win (pflannery)

 * README: added gemnasium dependency status badge (Miroslav Bajtos)

 * package.json: added `lint` script (Miroslav Bajtos)

 * README: link to issue #146 (Miroslav Bajtoš)

 * PageAgent: improved main-file detection (Miroslav Bajtos)


## 2013-07-22, Version 0.3.2

 * Overrides: show main app file (Miroslav Bajtos)

 * PageAgent: fix for main script without extension (Miroslav Bajtos)


## 2013-07-15, Version 0.3.1

 * Added version log message. (Miroslav Bajtos)

 * Fixed RuntimeAgent.callFunctionOn() error handling (Miroslav Bajtos)


## 2013-07-15, Version 0.3.0

 * MAINTAINERS.md: fixed typo. (Miroslav Bajtos)

 * squash! ScriptFileStorage: root detection change (Miroslav Bajtos)

 * ScriptFileStorage: improved detection of app root (Miroslav Bajtos)

 * ScriptManager: fixed crash (mocha --debug-brk) (Miroslav Bajtos)

 * DebuggerClient: fixed crash in getScriptSource (Miroslav Bajtos)

 * AUTHORS: updated Stronglooper's emails (Miroslav Bajtos)

 * Added MAINTAINERS.md (Miroslav Bajtos)

 * Added AUTHORS (Miroslav Bajtos)

 * Updated documentation. (Miroslav Bajtos)

 * List unit-test files on session start. (Miroslav Bajtos)

 * DebuggerClient: workaround for string truncation (Miroslav Bajtos)

 * Fixed sourcemap support on Windows (Miroslav Bajtos)

 * ScriptFileStorage: fixed issues on windows (Miroslav Bajtos)

 * Sourcemap support (Miroslav Bajtos)

 * Change the default server ip to be 127.0.0.1 as 0.0.0.0 doesn't work on windows (Raymond Feng)

 * PageAgent: removed forgotten console.log call. (Miroslav Bajtos)

 * Set breakpoint in a file not loaded yet. (Miroslav Bajtos)

 * DebuggerAgent: setVariableValue for node v0.10.12+ (Miroslav Bajtos)

 * package.json: relaxed express version spec (Miroslav Bajtos)

 * Added few more dummy command handlers. (Miroslav Bajtos)

 * DebuggerAgent: handle unsupported node version (Miroslav Bajtos)

 * Implemented setVariableValue. (Miroslav Bajtos)

 * Fixed 'get scope properties' to include flags (Miroslav Bajtos)

 * RuntimeAgent: callFunctionOn with arguments (Miroslav Bajtos)

 * RuntimeAgent: added writable and enumerable flags (Miroslav Bajtos)

 * DebuggerAgent: implemented restartFrame. (Miroslav Bajtos)

 * Improved handling of agent methods not implemented (Miroslav Bajtos)

 * DebuggerAgent: save live-edit changes. (Miroslav Bajtos)

 * Run ./tools/git-changelog to update ChangeLog (Sam Roberts)

 * session: removed improper warning message (Miroslav Bajtos)

 * Moved frontend overrides out of front-end folder (Miroslav Bajtos)

 * Replaced paperboy with express. (Miroslav Bajtos)

 * Added header to enable IE support via Chrome Frame (Miroslav Bajtos)

 * added preferGlobal to package.json (Miroslav Bajtos)

 * Changed fetchCallFrames to not fetch scope details (Miroslav Bajtos)

 * Implemented DebuggerClient.clearBreakpoint (Miroslav Bajtos)

 * Moved afterCompile handler to ScriptManager. (Miroslav Bajtos)

 * Cleanup: Agents depend on debuggerClient (Miroslav Bajtos)

 * Moved session.attach to DebuggerAgent. (Miroslav Bajtos)

 * Refactored 'break'/'exception' handling (Miroslav Bajtos)

 * Started rename of Debugger.sendDebugRequest. (Miroslav Bajtos)

 * Extracted debugger communication to DebuggerClient (Miroslav Bajtos)

 * Extracted frontend communication to FrontendClient (Miroslav Bajtos)

 * Removed unused code from session.js (Miroslav Bajtos)

 * Moved detection of conn errors to debugger. (Miroslav Bajtos)

 * Style: added gjslint rules and fixed style issues (Miroslav Bajtos)

 * Code-completions in console. (Miroslav Bajtos)

 * Display the main document as a script file. (Miroslav Bajtos)

 * Upgraded dependencies to recent versions. (Miroslav Bajtos)

 * Code clean-up (Miroslav Bajtos)

 * Removed overload of Reload page key shortcut. (Miroslav Bajtos)

 * Implemented live edit of script sources. (Miroslav Bajtos)

 * Fixed creation of a new watch expression (Miroslav Bajtos)

 * Prepared for v0.3.0preview1 release. (Miroslav Bajtos)

 * Removed leftover file. (Miroslav Bajtos)

 * Convert windows paths to file:// URLs. (Miroslav Bajtos)

 * Fixed title of html page and removed null error (Miroslav Bajtos)

 * Detach from debugger when front-end disconnects. (Miroslav Bajtos)

 * Removed test/hello.js (Miroslav Bajtos)

 * Code clean-up: removed unused code. (Miroslav Bajtos)

 * Fixed DebuggerAgent.setPauseOnExceptions. (Miroslav Bajtos)

 * DebuggerAgent.getFunctionDetails() (Miroslav Bajtos)

 * v8NameToInspectorUrl for `evaluate` scripts (Miroslav Bajtos)

 * Commands not used/supported, capability queries (Miroslav Bajtos)

 * Breaking on an Exception now provides a reason. (Michael Schoonmaker)

 * Updated the Console methods under both Runtime and Debugger. (Michael Schoonmaker)

 * Implemented 'Continue to Here' command (Miroslav Bajtos)

 * Implemented activate/deactivate breakpoints. (Miroslav Bajtos)

 * Implemented RuntimeAget.getProperties() (Miroslav Bajtos)

 * Implemented execution-control related commands (Miroslav Bajtos)

 * Implemented Call Stack. (Miroslav Bajtos)

 * Implemented breakpoints (Miroslav Bajtos)

 * Rework backend to support the new frontend. (Miroslav Bajtos)

 * Reuse stubs and commands from webkit-inspector. (Miroslav Bajtos)

 * Patched front-end/inspector.html (Miroslav Bajtos)

 * Updated front-end to blink branch 1507. (Miroslav Bajtos)

 * Display breakpoints in scripts loaded later. (Miroslav Bajtos)

 * Fixed breakpoint restore bug. (Miroslav Bajtos)

 * Update list of scripts on afterCompile event. (Miroslav Bajtos)

 * Restore breakpoints on debugee restart. (Miroslav Bajtos)

 * default should be backwards compatible (Philip Tellis)

 * missing " (Philip Tellis)

 * configure which interface to listen on so that we can avoid opening the debugger to the world if not needed (Philip Tellis)

 * Added meta tag to enable IE support via Chrome Frame (Glenn Block)

 * Added BSD License (Danny Coates)

 * updated 'Thanks' on readme (Danny Coates)

 * Syntax highlighting (Akzhan Abdulin)


## v0.1.10

 * switched to socket.io, now works with Chrome 14+

## v0.1.9

 * fixed page refresh

## v0.1.8

 * bug fixes

## v0.1.7

 * updated dependencies

## v0.1.6

 * fixed crash on connect when using watch expressions (Issue 25)

## v0.1.5

 * minor bug fixes

## v0.1.4

 * experimental support for the profiles panel

## v0.1.3

 * reverted websocket library to 1.3.53

## v0.1.2

 * option to save changes from liveEdit

 * option to hide files from inspector

 * added config.json
  - webPort (port to host inspector interface)
  - debugPort (default debugger port to connect to)
  - saveLiveEdit (save changes to files edited with liveEdit)
  - hidden (regexp strings of files to hide from interface)

## v0.1.1

 * Fixed pause button with node 0.3.1+

 * Fixed page refresh with node 0.3.1+

 * Shortened script file names in script list

 * Updated node-websocket-server library


## v0.1.0

 * Require node 0.3+

 * Improved Scope Variables display
  - Better object type info
  - Inlined Array / Buffer lengths

 * Automatically saved application setting
  - last file shown
  - console history
  - watch expressions

 * Console object completion on .

 * Updated Web Inspector base

 * Moved debugger port to query string i.e. /debug?port=5858

 * New front-end <-> back-end message protocol


## v0.0.4

 * ctrl+click line number for conditional breakpoints

 * enable pause on all exceptions button


## v0.0.3

 * handle multi-byte characters from debugger (Issue 12)


## v0.0.2

 * removed --start --debug-port --fwd-io flags

 * added debugger port UI


## v0.0.1

 * added to npm registry






