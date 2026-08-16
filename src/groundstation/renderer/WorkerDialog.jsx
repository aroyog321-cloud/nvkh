import React from "react";
import {
  buildWorkerDefinition,
  buildWorkerPatch,
  initialWorkerDraft
} from "./workerForm.js";

const WORKER_TEMPLATES = [
  { id: "shell", badge: ">_", name: "Project shell", detail: "Interactive PowerShell rooted in this project", command: "powershell.exe", args: [], autoStart: true },
  { id: "frontend", badge: "WEB", name: "Frontend dev", detail: "Start the package development server", command: "npm.cmd", args: ["run", "dev"], autoStart: true },
  { id: "backend", badge: "API", name: "Backend service", detail: "Start the package service process", command: "npm.cmd", args: ["run", "start"], autoStart: true },
  { id: "tests", badge: "✓", name: "Test watcher", detail: "Run package tests in watch mode", command: "npm.cmd", args: ["test", "--", "--watch"], autoStart: true },
  { id: "docker", badge: "DO", name: "Docker stack", detail: "Launch the project Compose services", command: "docker", args: ["compose", "up"], autoStart: false },
  { id: "git", badge: "BR", name: "Git status", detail: "Inspect branch and working-tree evidence", command: "git", args: ["status", "--short", "--branch"], autoStart: false }
];

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
  const [templateId, setTemplateId] = React.useState(configuration ? "custom" : "shell");
  const titleId = React.useId();

  React.useEffect(() => {
    const onKeyDown = event => {
      if (event.key === "Escape" && !busy) onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [busy, onClose]);

  const update = (field, value) => { setTemplateId("custom"); setDraft(current => ({ ...current, [field]: value })); };
  const applyTemplate = template => {
    setTemplateId(template.id);
    setDraft(current => ({ ...current, id: template.id === "shell" ? "terminal" : template.id, name: template.name, command: template.command, argsText: JSON.stringify(template.args, null, 2), cwd: ".", autoStart: template.autoStart, powershellCompatibility: false }));
    setError("");
  };

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
            <span className="eyebrow">TERMINAL WORKSPACE</span>
            <h2 id={titleId}>{editing ? `Edit ${configuration.name}` : "Add a terminal worker"}</h2>
          </div>
          <button type="button" className="dialog-close" onClick={onClose} disabled={busy} aria-label="Close dialog">×</button>
        </header>

        {!editing && (
          <div className="dialog-tabs" role="tablist" aria-label="Worker source">
            <button type="button" role="tab" aria-selected={mode === "create"} className={mode === "create" ? "is-current" : ""} onClick={() => setMode("create")}>New terminal worker</button>
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
              {!editing && <section className="worker-template-section"><header><div><span>QUICK START</span><strong>Choose what this terminal should do</strong></div><small>Templates only fill the form. Review every command before adding it.</small></header><div className="worker-template-grid">{WORKER_TEMPLATES.map(template => <button type="button" className={templateId === template.id ? "is-selected" : ""} key={template.id} onClick={() => applyTemplate(template)}><span>{template.badge}</span><span><strong>{template.name}</strong><small>{template.detail}</small></span><i>{template.command}</i></button>)}</div></section>}
              <div className="worker-form-heading"><div><span>WORKER DEFINITION</span><strong>{editing ? "Update the supervised command" : `${WORKER_TEMPLATES.find(item => item.id === templateId)?.name || "Custom worker"} configuration`}</strong></div><span>{draft.autoStart ? "Starts immediately" : "Creates idle"} · project-relative</span></div>
              <Field label="Worker ID" detail="Stable identifier; it cannot be changed later.">
                <input value={draft.id} disabled={editing || busy} onChange={event => update("id", event.target.value)} placeholder="backend" autoFocus={!editing} />
              </Field>
              <Field label="Display name">
                <input value={draft.name} disabled={busy} onChange={event => update("name", event.target.value)} placeholder="Backend server" autoFocus={editing} />
              </Field>
              <Field label="Command" detail="Defaults to an empty PowerShell terminal. Replace it with any executable you want Mission Control to supervise." wide>
                <input value={draft.command} disabled={busy} onChange={event => update("command", event.target.value)} placeholder="powershell.exe" />
              </Field>
              <Field label="Arguments" detail='JSON array, for example ["run", "dev"].' wide>
                <textarea rows="3" value={draft.argsText} disabled={busy} onChange={event => update("argsText", event.target.value)} spellCheck="false" />
              </Field>
              <Field label="Working directory" detail='Use "." for the open project folder, or a relative subfolder such as ./frontend.' wide>
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
