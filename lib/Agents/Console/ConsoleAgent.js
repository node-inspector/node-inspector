'use strict';

class ConsoleAgent extends require('../InjectableAgent') {
  /**
   * @param {Config} config
   * @param {Session} session
   */
  constructor(config, session) {
    super('Console', config, session);

    this.registerEvent('messageAdded');
    this.registerEvent('messagesCleared');

    this.registerCommand('clearMessages');
  }

  get injection() {
    return {
      injection: require.resolve('./ConsoleInjection.js')
    };
  }
}

module.exports = ConsoleAgent;
