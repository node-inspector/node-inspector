module.exports = {
  frontend: {
    modules: [
      {
        name: "node-inspector",
        dependencies: [ "sdk" ],
        scripts: [ "InspectorOverrides.js" ]
      },
      {
        name: "node-settings",
        dependencies: [ "settings" ],
        scripts: [ "SettingsScreenOverrides.js" ],
        resources: [ "SettingsScreenOverrides.css" ]
      },
      {
        name: "node-sources",
        dependencies: [ "sdk" ],
        scripts: [ "SourcesOverrides.js" ]
      },
      {
        name: "node-main",
        dependencies: [ "main" ],
        scripts: [ "MainOverrides.js" ]
      },
      { name: "audits", type: "exclude"},
      { name: "elements", type: "exclude"},
      { name: "timeline", type: "exclude"},
      { name: "resources", type: "exclude"}
    ]
  },
  protocol: {
      domains: [
        {
          domain: "Console",
          types: [],
          commands: [],
          events: [
              {
                  name: "showConsole",
                  description: "Open console window"
              }
          ]
        }
      ]
  },
  config: require('./config.js')
}
