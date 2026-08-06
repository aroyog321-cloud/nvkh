import React from "react";
import {
  buildWorkerDefinition,
  buildWorkerPatch,
  initialWorkerDraft
} from "./workerForm.js";

function Field({ label, detail, children, wide = false }) {
  return (
    <label className={`form-field ${wide ? "is-wide" : ""}`}>
      <span>{label}</span>
      {children}
      {detail && <small>{detail}</small>}
    </label>
  );
}

function PresetList({ commands, busy, onInstantiate }) {
  if (!commands.length) {
    return (
      <div className="dialog-empty">
        <strong>No saved presets</strong>
        <p>Add entries to the workspace&apos;s <code>commands</code> array to keep optional workers ready without launching them.</p>
      </div>
    );
  }
  return (
    <div className="preset-list">
      {commands.map(command => (
        <div className="preset-card" key={command.id}>
          <div>
            <strong>{command.name}</strong>
            <code>{command.command}{command.args?.length ? ` ${command.args.join(" ")}` : ""}</code>
            <span>{command.autoStart ? "Starts immediately" : "Creates as manual worker"} · {command.cwd}</span>
          </div>
          <button
            type="button"
            className="primary-button"
            disabled={busy || !command.available}
            onClick={() => onInstantiate(command.id)}
          >
            {command.available ? "Add worker" : "Already added"}
          </button>
        </div>
      ))}
    </div>
  );
}

export default function WorkerDialog({ initialMode = "create", configuration, savedCommands, onClose, onSave, onInstantiate }) {
  const editing = Boolean(configuration);
  const [mode, setMode] = React.useState(editing ? "edit" : initialMode);
  const [draft, setDraft] = React.useState(() => initialWorkerDraft(configuration));
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState("");
  const titleId = React.useId();

  React.useEffect(() => {
    const onKeyDown = event => {
      if (event.key === "Escape" && !busy) onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [busy, onClose]);

  const update = (field, value) => setDraft(current => ({ ...current, [field]: value }));

  const submit = async event => {
    event.preventDefault();
    setError("");
    try {
      const value = editing ? buildWorkerPatch(draft) : buildWorkerDefinition(draft);
      setBusy(true);
      await onSave(value);
      onClose();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : String(submitError));
    } finally {
      setBusy(false);
    }
  };

  const instantiate = async commandId => {
    setError("");
    try {
      setBusy(true);
      await onInstantiate(commandId);
      onClose();
    } catch (instantiateError) {
      setError(instantiateError instanceof Error ? instantiateError.message : String(instantiateError));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="dialog-backdrop" role="presentation" onMouseDown={event => {
      if (event.target === event.currentTarget && !busy) onClose();
    }}>
      <section className="worker-dialog" role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <header className="dialog-header">
          <div>
            <span className="eyebrow">WORKSPACE WORKER</span>
            <h2 id={titleId}>{editing ? `Edit ${configuration.name}` : "Add a worker"}</h2>
          </div>
          <button type="button" className="dialog-close" onClick={onClose} disabled={busy} aria-label="Close dialog">×</button>
        </header>

        {!editing && (
          <div className="dialog-tabs" role="tablist" aria-label="Worker source">
            <button type="button" role="tab" aria-selected={mode === "create"} className={mode === "create" ? "is-current" : ""} onClick={() => setMode("create")}>New worker</button>
            <button type="button" role="tab" aria-selected={mode === "presets"} className={mode === "presets" ? "is-current" : ""} onClick={() => setMode("presets")}>Saved presets <span>{savedCommands.length}</span></button>
          </div>
        )}

        {error && <div className="dialog-error" role="alert">{error}</div>}

        {mode === "presets" && !editing ? (
          <div className="dialog-body preset-body">
            <PresetList commands={savedCommands} busy={busy} onInstantiate={instantiate} />
          </div>
        ) : (
          <form onSubmit={submit}>
            <div className="dialog-body worker-form">
              <Field label="Worker ID" detail="Stable identifier; it cannot be changed later.">
                <input value={draft.id} disabled={editing || busy} onChange={event => update("id", event.target.value)} placeholder="backend" autoFocus={!editing} />
              </Field>
              <Field label="Display name">
                <input value={draft.name} disabled={busy} onChange={event => update("name", event.target.value)} placeholder="Backend server" autoFocus={editing} />
              </Field>
              <Field label="Command" detail="Use an executable here when PowerShell compatibility is enabled." wide>
                <input value={draft.command} disabled={busy} onChange={event => update("command", event.target.value)} placeholder="npm run dev" />
              </Field>
              <Field label="Arguments" detail='JSON array, for example ["run", "dev"].' wide>
                <textarea rows="3" value={draft.argsText} disabled={busy} onChange={event => update("argsText", event.target.value)} spellCheck="false" />
              </Field>
              <Field label="Working directory" detail="Relative paths resolve from the workspace file." wide>
                <input value={draft.cwd} disabled={busy} onChange={event => update("cwd", event.target.value)} placeholder="." />
              </Field>

              {editing && (
                <label className="form-check is-wide">
                  <input type="checkbox" checked={draft.replaceEnvironment} disabled={busy} onChange={event => update("replaceEnvironment", event.target.checked)} />
                  <span><strong>Replace environment overrides</strong><small>Existing values remain secret and unchanged unless you enable this.</small></span>
                </label>
              )}
              <Field
                label="Environment"
                detail={editing && !draft.replaceEnvironment
                  ? `Existing keys: ${configuration.envKeys?.join(", ") || "none"}`
                  : "JSON object of string values. Values are never exposed in Groundstation state or activity."}
                wide
              >
                <textarea rows="4" value={draft.envText} disabled={busy || (editing && !draft.replaceEnvironment)} onChange={event => update("envText", event.target.value)} spellCheck="false" />
              </Field>

              <label className="form-check">
                <input type="checkbox" checked={draft.autoStart} disabled={busy} onChange={event => update("autoStart", event.target.checked)} />
                <span><strong>Start automatically</strong><small>Launch now and during future workspace restores.</small></span>
              </label>
              <label className="form-check">
                <input type="checkbox" checked={draft.powershellCompatibility} disabled={busy} onChange={event => update("powershellCompatibility", event.target.checked)} />
                <span><strong>PowerShell compatibility</strong><small>Explicit fallback that disables PSReadLine for this worker.</small></span>
              </label>
            </div>
            <footer className="dialog-footer">
              <span>{editing ? "The worker stays idle until you start it." : draft.autoStart ? "This creates and starts one engine-owned PTY." : "This registers an idle worker without launching a process."}</span>
              <div>
                <button type="button" className="quiet-button" onClick={onClose} disabled={busy}>Cancel</button>
                <button type="submit" className="primary-button" disabled={busy}>{busy ? "Saving…" : editing ? "Save changes" : "Add worker"}</button>
              </div>
            </footer>
          </form>
        )}
      </section>
    </div>
  );
}
