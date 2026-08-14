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
  background: "#090c0c",
  foreground: "#d7dcd7",
  cursor: "#b7e3c0",
  cursorAccent: "#101313",
  selectionBackground: "#2b3b31",
  black: "#111413",
  red: "#ef9189",
  green: "#b7e3c0",
  yellow: "#e8c986",
  blue: "#94b8e9",
  magenta: "#c7a7d9",
  cyan: "#9bd7d0",
  white: "#ecefeb",
  brightBlack: "#6c736e"
};

function actionLabel(session) {
  if (session?.status === "idle" || session?.status === "exited" || session?.status === "failed") {
    return "Start";
  }
  return "Restart";
}

export default function TerminalPane({ session, sessions, active, expanded, terminalFontSize = 13, onFocus, onToggleExpanded, onAction, onSelectSession }) {
  const hostRef = React.useRef(null);
  const terminalRef = React.useRef(null);
  const fitRef = React.useRef(null);
  const streamRef = React.useRef(null);
  const [connection, setConnection] = React.useState(session?.isAlive ? "connecting" : "offline");
  const [message, setMessage] = React.useState("");
  const [chooserOpen, setChooserOpen] = React.useState(false);

  React.useEffect(() => {
    const host = hostRef.current;
    if (!host || !session) return undefined;

    const terminal = new Terminal({
      allowProposedApi: false,
      convertEol: false,
      cursorBlink: true,
      cursorStyle: "bar",
      fontFamily: "'SFMono-Regular', 'Cascadia Code', Consolas, monospace",
      fontSize: terminalFontSize,
      fontWeight: "400",
      fontWeightBold: "600",
      letterSpacing: 0.15,
      lineHeight: 1.3,
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
        terminal.writeln("\x1b[38;2;103;110;105mWorker is resting. Use Start when you are ready.\x1b[0m");
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
  }, [session?.id, session?.isAlive, session?.startTime, terminalFontSize]);

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
            <button
              type="button"
              className="terminal-session-trigger"
              onClick={event => { event.stopPropagation(); setChooserOpen(value => !value); }}
              aria-expanded={chooserOpen}
              aria-haspopup="menu"
              title={`Switch pane · ${session.command}`}
            >
              <strong>{session.name}</strong><span aria-hidden="true">⌄</span>
            </button>
            {chooserOpen && <div className="terminal-session-menu" role="menu" onMouseDown={event => event.stopPropagation()}>
              <div className="terminal-session-menu__label">SHOW IN THIS PANE</div>
              {sessions.map(option => <button type="button" role="menuitem" className={option.id === session.id ? "is-current" : ""} key={option.id} onClick={() => { onSelectSession(option.id); setChooserOpen(false); }}><i className={`status-${option.status}`}/><span><strong>{option.name}</strong><small>{option.command}</small></span>{option.id === session.id && <b>Current</b>}</button>)}
              <button type="button" role="menuitem" onClick={() => { onSelectSession(""); setChooserOpen(false); }}><i/><span><strong>Empty pane</strong><small>Free this position</small></span></button>
            </div>}
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
