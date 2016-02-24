'use strict';

class ProfilerAgent extends require('../InjectableAgent') {
  /**
   * @param {Config} config
   * @param {Session} session
   */
  constructor(config, session) {
    super('Profiler', config, session);

    this.registerEvent('consoleProfileStarted');
    this.registerEvent('consoleProfileFinished');

    this.registerCommand('start');
    this.registerCommand('stop');
  }

  get injection() {
    return {
      injection: require.resolve('./ProfilerInjection.js'),
      profiler: require.resolve('v8-profiler')
    };
  }
}

module.exports = ProfilerAgent;
