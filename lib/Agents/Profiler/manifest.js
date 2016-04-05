module.exports = {
  frontend: {
    modules: [
      {
        name: "node-profiler",
        dependencies: [ "profiler" ],
        scripts: [ "SaveOverrides.js" ]
      }
    ]
  },
  inspector: {
    agents: [
      {
        name: "Profiler",
        path: "ProfilerAgent.js"
      },
      {
        name: "HeapProfiler",
        path: "HeapProfilerAgent.js"
      }
    ]
  }
};
