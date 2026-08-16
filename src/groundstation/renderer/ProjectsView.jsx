import React from "react";

function timeAgo(timestamp) {
  if (!Number.isFinite(timestamp)) return "Not opened yet";
  const seconds = Math.max(0, Math.round((Date.now() - timestamp) / 1000));
  if (seconds < 60) return "Just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function statusLabel(project) {
  if (project.current) return "Active";
  if (project.status === "ready") return "Ready";
  if (project.status === "warning") return "Warnings";
  if (project.status === "missing") return "Missing";
  if (project.status === "invalid") return "Invalid";
  return "Setup needed";
}

export default function ProjectsView({ data, loading, onChoose, onOpen, onRemove }) {
  const projects = data?.projects || [];
  return (
    <div className="projects-view">
      <section className="project-hero panel">
        <div>
          <span className="eyebrow">OPEN FOLDER</span>
          <h3>Choose the directory your tools should work in</h3>
          <p>
            Like VS Code, the selected folder becomes the project root. Terminals, workers,
            recipes, and AI agents all start from that directory unless you choose a subfolder.
          </p>
        </div>
        <button type="button" className="primary-button" onClick={onChoose} disabled={loading}>
          {loading ? "Opening…" : "+ Open folder"}
        </button>
      </section>

      {data?.registryError && (
        <div className="notice notice-error project-registry-error" role="alert">
          Recent projects could not be saved: {data.registryError}
        </div>
      )}

      <section className="panel project-list-panel">
        <header className="panel-heading">
          <div><h3>Recent projects</h3><p>Validated locally before any running worker is stopped</p></div>
          <span className="project-count">{projects.length} saved</span>
        </header>
        {projects.length ? (
          <div className="project-grid">
            {projects.map(project => {
              const openable = project.status === "ready" || project.status === "warning";
              return (
                <article className={`project-card project-${project.status} ${project.current ? "is-current" : ""}`} key={project.id}>
                  <div className="project-card__top">
                    <span className="project-mark">{project.name.slice(0, 2).toUpperCase()}</span>
                    <span className={`project-state project-state-${project.current ? "current" : project.status}`}>
                      {statusLabel(project)}
                    </span>
                  </div>
                  <div className="project-card__body">
                    <strong>{project.name}</strong>
                    <code title={project.rootPath}>{project.rootPath}</code>
                    <small>{project.error || `Opened ${timeAgo(project.lastOpenedAt)}`}</small>
                  </div>
                  <div className="project-card__actions">
                    <button
                      type="button"
                      className="quiet-button"
                      disabled={project.current || !openable || loading}
                      onClick={() => onOpen(project)}
                    >
                      {project.current ? "Current project" : "Open"}
                    </button>
                    {!project.current && (
                      <button
                        type="button"
                        className="quiet-button danger-button"
                        disabled={loading}
                        onClick={() => onRemove(project)}
                      >
                        Forget
                      </button>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        ) : (
          <div className="empty-state">
            <span>⊞</span>
            <strong>No recent projects</strong>
            <p>Choose any folder. Mission Control creates its local workspace file and opens a shell rooted there.</p>
          </div>
        )}
      </section>
    </div>
  );
}
