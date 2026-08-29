// Minimal stand-in for the subset of node-pty's API SessionEngine actually
// uses. Tests drive it manually (emitData / exit) instead of spawning a
// real shell — this is what the ptyFactory injection point in
// sessionEngine.js exists for.
const EventEmitter = require("events");

class FakePty extends EventEmitter {
  constructor({ autoExitOnKill = false, killExitCode = 0 } = {}) {
    super();
    this.pid = Math.floor(Math.random() * 100000) + 1;
    this.written = [];
    this.resized = [];
    this.killed = false;
    this._dataHandlers = [];
    this._exitHandlers = [];
    this._autoExitOnKill = autoExitOnKill;
    this._killExitCode = killExitCode;
  }
  onData(cb) {
    this._dataHandlers.push(cb);
    return { dispose: () => { this._dataHandlers = this._dataHandlers.filter(fn => fn !== cb); } };
  }
  onExit(cb) {
    this._exitHandlers.push(cb);
    return { dispose: () => { this._exitHandlers = this._exitHandlers.filter(fn => fn !== cb); } };
  }
  write(data) { this.written.push(data); }
  resize(cols, rows) { this.resized.push([cols, rows]); }
  kill() {
    this.killed = true;
    if (this._autoExitOnKill) queueMicrotask(() => this.emitExit(this._killExitCode));
  }

  // test-only driver methods
  emitData(chunk) { for (const cb of [...this._dataHandlers]) cb(chunk); }
  emitExit(exitCode = 0) { for (const cb of [...this._exitHandlers]) cb({ exitCode }); }
}

function makeFakePtyFactory({ throwOnSpawn = false, autoExitOnKill = false, killExitCode = 0 } = {}) {
  const instances = [];
  const factory = (shell, args, opts) => {
    if (throwOnSpawn) throw new Error("command not found");
    const p = new FakePty({ autoExitOnKill, killExitCode });
    p._spawnArgs = { shell, args, opts };
    instances.push(p);
    return p;
  };
  factory.instances = instances;
  factory.last = () => instances[instances.length - 1];
  return factory;
}

module.exports = { FakePty, makeFakePtyFactory };
