'use strict';

class RuntimeAgent extends require('../InjectableAgent') {
  /**
   * @param {Config} config
   * @param {Session} session
   */
  constructor(config, session) {
    super('Runtime', config, session);

    this.registerEvent('executionContextCreated');

    this.registerCommand('enable', this.enable);
    this.registerCommand('evaluate');
    this.registerCommand('callFunctionOn');
    this.registerCommand('getProperties');
    this.registerCommand('releaseObject');
    this.registerCommand('releaseObjectGroup');
  }

  get injection() {
    return {
      injection: require.resolve('./RuntimeInjection.js')
    }
  }

  * enable() {
    this.emitEvent('executionContextCreated', {
      context: {
        id: 1,
        isPageContext: true,
        name: '<top frame>',
        origin: '<top frame>',
        frameId: 'ni-top-frame'
      }
    });
  }
}

module.exports = RuntimeAgent;
