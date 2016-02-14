'use strict';

class InjectableAgent extends require('./BaseAgent') {
  /**
   * @param {String} name - agent name
   * @param {Config} config
   * @param {Session} session
   */
  constructor(name, config, session) {
    super(name, config, session);

    this._inject = true;
    if (typeof config.inject == 'object')
      this._inject = config.inject[name.toLowerCase()] !== false;
    else
      this._inject = config.inject !== false;

    this._ready = this._inject
      ? this.injected()
      : Promise.reject(`${this.name} agent disabled.`);
  }

  injected() {
    return this._injected = this._injected || this.session.inject(this.injection);
  }

  get injection() {
    throw new Error('Not implemented.');
  }
}

module.exports = InjectableAgent;
