import { ingestMarkdown, retrieveEvidence } from "./knowledge.mjs";

const sourceDocs = [
  {
    documentId: "identity-guide",
    title: "Identity & Access Administration",
    version: "v2.4",
    approved: true,
    current: true,
    kind: "Support guide",
    markdown: `# Identity & Access Administration\n\n## Reset a user's MFA device\n\nAn organization administrator can reset a user's multi-factor authentication (MFA) device from the Admin Console. Open Users, select the user, choose Security, then select Reset MFA. The user will be prompted to enroll a new device at their next sign-in.\n\nBefore resetting MFA, verify the requester's identity using your organization's support verification procedure. Record the reset in the account's audit history.\n\n## Account recovery\n\nIf the user cannot access their registered email, confirm account ownership with two approved verification factors before changing sign-in details.`,
  },
  {
    documentId: "sso-troubleshooting",
    title: "SAML SSO Troubleshooting",
    version: "v1.8",
    approved: true,
    current: true,
    kind: "Troubleshooting guide",
    markdown: `# SAML SSO Troubleshooting\n\n## Login failures\n\nIf SSO login fails, confirm that the identity provider's Entity ID and Single Sign-On URL match the values in the Admin Console. Check that the signing certificate has not expired and that the user's email address matches the NameID attribute.\n\nAfter correcting an identity provider setting, allow up to five minutes for configuration changes to propagate before testing again.\n\n## Reviewing a SAML response\n\nUse the SSO diagnostics page to inspect the latest sign-in attempt. Do not share SAML responses because they may contain sensitive identity information.`,
  },
  {
    documentId: "legacy-login-guide",
    title: "Legacy Login Setup",
    version: "v0.9",
    approved: true,
    current: false,
    kind: "Archived guide",
    markdown: `# Legacy Login Setup\n\n## Reset a user's MFA device\n\nContact the account owner and manually clear MFA from the legacy portal. This procedure has been retired and must not be used.`,
  },
];

const chunks = sourceDocs.flatMap((doc) => ingestMarkdown(doc.markdown, doc));
const question = document.querySelector("#question");
const askButton = document.querySelector("#ask");
const evidenceList = document.querySelector("#evidence-list");
const answerState = document.querySelector("#answer-state");
const resultSummary = document.querySelector("#result-summary");
const sourcesPanel = document.querySelector("#sources-panel");
const toast = document.querySelector("#toast");

document.querySelector("#source-count").textContent = String(sourceDocs.length);
renderSources();

askButton.addEventListener("click", search);
question.addEventListener("keydown", (event) => {
  if ((event.metaKey || event.ctrlKey) && event.key === "Enter") search();
});
document.querySelectorAll("[data-query]").forEach((button) => {
  button.addEventListener("click", () => {
    question.value = button.dataset.query;
    search();
  });
});
document.querySelector("#manage-docs").addEventListener("click", () => sourcesPanel.classList.add("open"));
document.querySelector("#close-sources").addEventListener("click", () => sourcesPanel.classList.remove("open"));
document.querySelector("#file-upload").addEventListener("change", importMarkdown);

function search() {
  const query = question.value.trim();
  if (!query) {
    showToast("Enter a question to search the knowledge sources.");
    question.focus();
    return;
  }

  const results = retrieveEvidence(query, chunks, 4);
  evidenceList.replaceChildren();
  if (!results.length) {
    resultSummary.textContent = "No supporting passages found in approved, current sources.";
    answerState.hidden = true;
    evidenceList.append(emptyState("No evidence found", "Try a more specific question, or add an approved current Markdown source."));
    return;
  }

  resultSummary.textContent = `${results.length} relevant ${results.length === 1 ? "passage" : "passages"} from approved, current sources.`;
  answerState.hidden = false;
  answerState.classList.add("has-results");
  answerState.querySelector(".state-icon").textContent = "✓";
  answerState.querySelector("strong").textContent = "Review the source passages below";
  answerState.querySelector("p").textContent = "These excerpts matched your question. Confirm the evidence before responding.";
  for (const [index, result] of results.entries()) evidenceList.append(renderEvidence(result, index));
}

function renderEvidence(result, index) {
  const card = document.createElement("article");
  card.className = "evidence-card";
  const meta = document.createElement("div");
  meta.className = "evidence-meta";
  const title = document.createElement("div");
  title.className = "source-title";
  title.innerHTML = `<span class="file-icon">▤</span>`;
  const titleText = document.createElement("div");
  titleText.innerHTML = `<div>${escapeHtml(result.title)}</div><div class="source-sub">${escapeHtml(result.version)} · ${escapeHtml(result.heading)}</div>`;
  title.append(titleText);
  const relevance = document.createElement("span");
  relevance.className = "relevance";
  relevance.textContent = `RESULT ${index + 1}`;
  meta.append(title, relevance);

  const passage = document.createElement("blockquote");
  passage.className = "passage";
  passage.textContent = result.text;
  const citationRow = document.createElement("div");
  citationRow.className = "citation-row";
  citationRow.append(document.createTextNode("Source passage · "));
  const link = document.createElement("button");
  link.className = "citation-link";
  link.type = "button";
  link.textContent = `${result.startLine === result.endLine ? `line ${result.startLine}` : `lines ${result.startLine}–${result.endLine}`} ↗`;
  link.addEventListener("click", () => openCitation(result));
  citationRow.append(link);

  const explanation = document.createElement("details");
  explanation.className = "why-result";
  const summary = document.createElement("summary");
  summary.textContent = "Why this result?";
  const explanationText = document.createElement("p");
  const matchedTerms = result.matchedQueryTerms ?? [];
  explanationText.textContent = `Matched ${matchedTerms.length} ${matchedTerms.length === 1 ? "word" : "words"} from your question:`;
  const termList = document.createElement("div");
  termList.className = "matched-terms";
  for (const term of matchedTerms) {
    const chip = document.createElement("span");
    chip.className = "matched-term";
    chip.textContent = term;
    termList.append(chip);
  }
  explanation.append(summary, explanationText, termList);
  card.append(meta, passage, citationRow, explanation);
  return card;
}

function openCitation(result) {
  sourcesPanel.classList.add("open");
  const item = document.querySelector(`[data-source-id="${CSS.escape(result.documentId)}"]`);
  item?.scrollIntoView({ behavior: "smooth", block: "center" });
  item?.classList.add("citation-highlight");
  setTimeout(() => item?.classList.remove("citation-highlight"), 1500);
}

function renderSources() {
  const list = document.querySelector("#source-list");
  list.replaceChildren();
  for (const doc of sourceDocs) {
    const item = document.createElement("article");
    item.className = "source-item";
    item.dataset.sourceId = doc.documentId;
    const top = document.createElement("div");
    top.className = "source-item-top";
    const icon = document.createElement("span");
    icon.className = "file-icon";
    icon.textContent = "▤";
    const details = document.createElement("div");
    const name = document.createElement("strong");
    name.textContent = doc.title;
    const sub = document.createElement("small");
    sub.textContent = `${doc.kind} · ${doc.version}`;
    details.append(name, sub);
    top.append(icon, details);
    const tags = document.createElement("div");
    tags.className = "source-tags";
    tags.append(tag(doc.approved ? "Approved" : "Unapproved", doc.approved), tag(doc.current ? "Current" : "Outdated", doc.current));
    item.append(top, tags);
    list.append(item);
  }
}

function tag(text, active) {
  const element = document.createElement("span");
  element.className = active ? "tag" : "tag muted";
  element.textContent = text;
  return element;
}

async function importMarkdown(event) {
  const file = event.target.files?.[0];
  if (!file) return;
  try {
    const markdown = await file.text();
    const title = file.name.replace(/\.markdown?$/i, "").replace(/[-_]+/g, " ");
    const doc = {
      documentId: `upload-${crypto.randomUUID()}`,
      title,
      version: "uploaded",
      approved: true,
      current: true,
      kind: "Uploaded Markdown",
      markdown,
    };
    const newChunks = ingestMarkdown(markdown, doc);
    if (!newChunks.length) throw new Error("No readable Markdown passages were found.");
    sourceDocs.push(doc);
    chunks.push(...newChunks);
    document.querySelector("#source-count").textContent = String(sourceDocs.length);
    renderSources();
    showToast(`Added ${title} to this demo session.`);
  } catch (error) {
    showToast(error.message || "Could not read that Markdown file.");
  } finally {
    event.target.value = "";
  }
}

function emptyState(title, description) {
  const box = document.createElement("div");
  box.className = "empty-state";
  const strong = document.createElement("strong");
  strong.textContent = title;
  const text = document.createElement("p");
  text.textContent = description;
  box.append(strong, text);
  return box;
}

function showToast(message) {
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => toast.classList.remove("show"), 2600);
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
}
