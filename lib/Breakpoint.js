/**
 * Creates an immutable representation of a breakpoint.
 *
 * @param {{
 *   sourceID: number,
 *   url: string,
 *   line: number,
 *   enabled: boolean,
 *   condition: string,
 *   number: number
 * }} props
 * @returns {Breakpoint}
 * @constructor
 */
function Breakpoint(props) {
  var sourceID = props.sourceID !== undefined && props.sourceID !== null
      ? props.sourceID.toString()
      : '';

  return Object.create(Breakpoint.prototype, {
    sourceID: { value: sourceID, enumerable: true },
    url: { value: props.url, enumerable: true },
    line: { value: props.line, enumerable: true },
    enabled: {value: props.enabled, enumerable: true},
    condition: {value: props.condition, enumerable: true },
    number: {value: props.number, enumerable: true },
    key: {
      get: function() {
        return this.sourceID + ':' + this.line;
      }
    }
  });
}

Breakpoint.prototype = {
  createRequest: function() {
    return  {
      arguments: {
        type: 'script',
        target: this.url,
        line: this.line - 1,
        enabled: this.enabled,
        condition: this.condition
      }
    };
  },

  sameAs: function(sourceID, line, condition) {
    return this.sourceID === sourceID &&
        this.line === line &&
        this.condition === condition;
  }
};

exports.Breakpoint = Breakpoint;
