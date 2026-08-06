// Deliberately minimal per the platform review (§3: AI Provider Abstraction
// — "Now, minimal"): one function, one provider. Not a registry, not a
// plugin system — there's no second provider to abstract over yet.

async function askAdvisory({ session, question }) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return {
      text: "Advisory is offline — set ANTHROPIC_API_KEY to enable AI summaries and answers.",
    };
  }

  const model = process.env.TERMCTL_MODEL || "claude-sonnet-4-5";
  const context = [
    `Terminal "${session.name}" — command: ${session.command}`,
    `Status: ${session.status}`,
    "Recent output:",
    ...session.recentLines.slice(-15),
  ].join("\n");

  // 20-second hard timeout — without AbortController, a network
  // partition (or a slow API) would trap the user's input pending
  // forever, since handleAsk in App.js shows a `(advisory error)`
  // fallback only when fetch throws. `fetch` has no built-in
  // timeout, so we bring our own.
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20000);
  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model,
        max_tokens: 400,
        messages: [
          { role: "user", content: `${context}\n\nQuestion: ${question}` },
        ],
      }),
      signal: controller.signal,
    });
    const data = await res.json();
    const text = (data.content || [])
      .map((block) => block.text || "")
      .join("\n")
      .trim();
    return { text: text || "(no response)" };
  } catch (err) {
    if (err && err.name === "AbortError") {
      return { text: "Advisory call timed out after 20s." };
    }
    return { text: `Advisory call failed: ${err.message}` };
  } finally {
    clearTimeout(timeout);
  }
}

module.exports = { askAdvisory };
