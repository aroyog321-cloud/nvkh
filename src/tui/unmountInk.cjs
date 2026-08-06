function unmountInk(instance) {
  if (!instance) return;

  // waitUntilExit() is intended for waiting on an app-driven exit. On some
  // Windows terminal hosts it does not settle after a programmatic unmount.
  // Yielding an event-loop turn here is also unsafe: Ink unrefs stdin during
  // unmount, so an otherwise idle process can exit before Full Attach reclaims
  // it. React/Ink effect cleanup runs as part of the synchronous unmount.
  instance.unmount();
}

module.exports = { unmountInk };
