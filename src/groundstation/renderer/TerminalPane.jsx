import React from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import {
  missionApi,
  notificationPayload,
  notificationType,
  streamIdentifier
} from "./missionApi.js";

const TERMINAL_THEME = {
  background: "#080d12",
  foreground: "#c8d3dc",
  cursor: "#67e8c6",
  cursorAccent: "#080d12",
  selectionBackground: "#27473f",
  black: "#111820",
  red: "#ff7b72",
  green: "#7ee787",
  yellow: "#d9b65c",
  blue: "#79b8ff",
  magenta: "#c59cff",
  cyan: "#67e8c6",
  white: "#dbe5ec",
  brightBlack: "#64727d"
};

function actionLabel(session) {
  if (session?.status === "idle" || session?.status === "exited" || session?.status === "failed") {
    return "Start";
  }
  return "Restart";
}

export default function TerminalPane({ session, sessions, active, expanded, onFocus, onToggleExpanded, onAction, onSelectSession }) {
  const hostRef = React.useRef(null);
  const terminalRef = React.useRef(null);
  const fitRef = React.useRef(null);
  const streamRef = React.useRef(null);
  const [connection, setConnection] = React.useState(session?.isAlive ? "connecting" : "offline");
  const [message, setMessage] = React.useState("");

  React.useEffect(() => {
    const host = hostRef.current;
    if (!host || !session) return undefined;

    const terminal = new Terminal({
      allowProposedApi: false,
      convertEol: false,
      cursorBlink: true,
      cursorStyle: "bar",
      fontFamily: "'Cascadia Code', 'SFMono-Regular', Consolas, monospace",
      fontSize: 12,
      lineHeight: 1.25,
      scrollback: 5000,
      theme: TERMINAL_THEME
    });
    const fit = new FitAddon();
    terminal.loadAddon(fit);
    terminal.open(host);
    terminalRef.current = terminal;
    fitRef.current = fit;

    let disposed = false;
    let unsubscribe = () => {};
    let inputDisposable = { dispose() {} };
    let resizeFrame = null;

    const fitAndResize = () => {
      if (disposed || !host.isConnected) return;
      try {
        fit.fit();
      } catch {
        return;
      }
      const streamId = streamRef.current;
      if (streamId) {
        void missionApi().request("terminal.resize", {
          streamId,
          cols: terminal.cols,
          rows: terminal.rows
        }).catch(() => {});
      }
    };

    const resizeObserver = new ResizeObserver(() => {
      if (resizeFrame) window.cancelAnimationFrame(resizeFrame);
      resizeFrame = window.requestAnimationFrame(fitAndResize);
    });
    resizeObserver.observe(host);

    const open = async () => {
      if (!session.isAlive) {
        terminal.writeln("\x1b[38;2;100;114;125mWorker is not running. Use Start to launch it.\x1b[0m");
        setConnection("offline");
        return;
      }

      setConnection("connecting");
      try {
        unsubscribe = missionApi().subscribe(notification => {
          const type = notificationType(notification);
          if (!["terminal:data", "terminal:exit", "terminal.exit", "terminal:overflow"].includes(type)) return;
          const payload = notificationPayload(notification);
          if (!streamRef.current || streamIdentifier(payload) !== streamRef.current) return;

          if (type === "terminal:data") {
            terminal.write(String(payload.data ?? ""));
          } else if (type === "terminal:exit" || type === "terminal.exit") {
            setConnection("exited");
            terminal.writeln("\r\n\x1b[38;2;100;114;125m[worker exited]\x1b[0m");
          } else {
            setConnection("overflow");
            setMessage("Output exceeded the desktop stream buffer. Reopen this pane to resync.");
          }
        });

        const opened = await missionApi().request("terminal.open", { sessionId: session.id });
        if (disposed) {
          const orphanId = streamIdentifier(opened);
          if (orphanId) void missionApi().request("terminal.close", { streamId: orphanId }).catch(() => {});
          return;
        }
        if (opened?.ok === false) throw new Error(opened.error || "Terminal stream was rejected");

        const streamId = streamIdentifier(opened);
        if (!streamId) throw new Error("Terminal stream did not return an identifier");
        streamRef.current = streamId;

        const replay = opened.replay;
        const replayData = typeof replay === "string" ? replay : replay?.data;
        const replayComplete = typeof replay === "string" || replay?.complete !== false;
        if (replayData && (replayComplete || replay?.source === "snapshot")) {
          terminal.write(replayData);
        } else {
          const fallbackLines = opened.snapshot?.lines || opened.snapshotLines || [];
          if (fallbackLines.length) terminal.write(`${fallbackLines.join("\r\n")}\r\n`);
        }

        const activated = await missionApi().request("terminal.activate", { streamId });
        if (disposed) return;
        const pending = activated?.pending ?? activated?.data ?? opened.pending;
        if (pending) terminal.write(String(pending));
        setConnection("live");
        window.requestAnimationFrame(fitAndResize);

        inputDisposable = terminal.onData(data => {
          const currentStream = streamRef.current;
          if (!currentStream) return;
          void missionApi().request("terminal.write", { streamId: currentStream, data }).catch(error => {
            if (!disposed) setMessage(error instanceof Error ? error.message : String(error));
          });
        });
      } catch (openError) {
        if (!disposed) {
          setConnection("error");
          setMessage(openError instanceof Error ? openError.message : String(openError));
          terminal.writeln(`\x1b[38;2;255;123;114m[terminal unavailable: ${openError instanceof Error ? openError.message : String(openError)}]\x1b[0m`);
        }
      }
    };

    void open();

    return () => {
      disposed = true;
      resizeObserver.disconnect();
      if (resizeFrame) window.cancelAnimationFrame(resizeFrame);
      inputDisposable.dispose();
      unsubscribe?.();
      const streamId = streamRef.current;
      streamRef.current = null;
      if (streamId) void missionApi().request("terminal.close", { streamId }).catch(() => {});
      terminal.dispose();
      terminalRef.current = null;
      fitRef.current = null;
    };
  // startTime is the terminal epoch exposed by the engine summary. A fast
  // restart can transition back to running before React observes the exited
  // state, so this dependency still replaces the stale stream deterministically.
  }, [session?.id, session?.isAlive, session?.startTime]);

  React.useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      try {
        fitRef.current?.fit();
        if (active) terminalRef.current?.focus();
      } catch {
        // The pane may be transitioning between grid and focus mode.
      }
    });
    return () => window.cancelAnimationFrame(frame);
  }, [active, expanded]);

  if (!session) return null;
  const runAction = session.isAlive ? "restart" : "start";

  return (
    <article
      className={`terminal-pane ${active ? "is-active" : ""} ${expanded ? "is-expanded" : ""}`}
      onMouseDown={onFocus}
    >
      <header className="terminal-pane__header">
        <div className="terminal-pane__identity">
          <span className={`status-dot status-${session.status}`} />
          <div>
            <select
              className="terminal-session-select"
              value={session.id}
              onChange={event => onSelectSession(event.target.value)}
              onMouseDown={event => event.stopPropagation()}
              aria-label="Worker shown in terminal pane"
              title={session.command}
            >
              <option value="">Empty pane</option>
              {sessions.map(option => <option key={option.id} value={option.id}>{option.name}</option>)}
            </select>
            <span>{session.status} · {connection}</span>
          </div>
        </div>
        <div className="terminal-pane__actions">
          {session.attentionRequired && (
            <button type="button" className="quiet-button" onClick={() => onAction("acknowledge", session.id)}>
              Acknowledge
            </button>
          )}
          <button type="button" className="quiet-button" onClick={() => onAction(runAction, session.id)}>
            {actionLabel(session)}
          </button>
          {session.isAlive && (
            <button type="button" className="quiet-button danger-button" onClick={() => onAction("kill", session.id)}>
              Stop
            </button>
          )}
          <button
            type="button"
            className="icon-button"
            title={expanded ? "Return to grid" : "Focus terminal"}
            aria-label={expanded ? "Return to terminal grid" : `Focus ${session.name}`}
            onClick={onToggleExpanded}
          >
            {expanded ? "⊡" : "↗"}
          </button>
        </div>
      </header>
      {message && <div className="terminal-warning">{message}</div>}
      <div className="terminal-host" ref={hostRef} />
    </article>
  );
}
