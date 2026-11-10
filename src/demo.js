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
    documentId: "mfa-recovery-ticket",
    title: "MFA Device Recovery · Case 1042",
    version: "Resolved",
    approved: true,
    current: true,
    kind: "Support ticket",
    markdown: `# MFA Device Recovery\n\n## Replace a lost authenticator\n\nWhen a user loses access to a registered MFA device, verify the requester's identity using the support verification procedure. An organization administrator can reset the user's MFA from Admin Console → Users → select the user → Security → Reset MFA. At the next sign-in, the user enrolls a replacement device. Do not use the retired legacy portal procedure.`,
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
const resultsRegion = document.querySelector("#results");
const evidenceList = document.querySelector("#evidence-list");
const answerState = document.querySelector("#answer-state");
const resultSummary = document.querySelector("#result-summary");
const visibleCount = document.querySelector("#visible-count");
const resultControls = document.querySelector("#result-controls");
const sourceTypeFilter = document.querySelector("#source-type-filter");
const sourcesPanel = document.querySelector("#sources-panel");
const panelScrim = document.querySelector("#panel-scrim");
const sourceDialog = document.querySelector("#source-dialog");
const toast = document.querySelector("#toast");
let currentResults = [];

renderSources();
renderInitialResults();

askButton.addEventListener("click", search);
question.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && !event.shiftKey) {
    event.preventDefault();
    search();
  }
});
document.querySelectorAll("[data-query]").forEach((button) => {
  button.addEventListener("click", () => {
    question.value = button.dataset.query;
    search();
  });
});
document.querySelector("#manage-docs").addEventListener("click", openSources);
document.querySelector("#manage-sources-footer").addEventListener("click", openSources);
document.querySelector("#close-sources").addEventListener("click", closeSources);
panelScrim.addEventListener("click", closeSources);
document.querySelector("#file-upload").addEventListener("change", importMarkdown);
sourceTypeFilter.addEventListener("change", renderResults);
document.querySelector("#close-dialog").addEventListener("click", () => sourceDialog.close());
document.querySelector("#dialog-done").addEventListener("click", () => sourceDialog.close());
sourceDialog.addEventListener("click", (event) => {
  if (event.target === sourceDialog) sourceDialog.close();
});

function renderInitialResults() {
  currentResults = retrieveEvidence(question.value, chunks, 4);
  renderResults();
}

function search() {
  const query = question.value.trim();
  if (!query) {
    showToast("Enter a question to search the knowledge sources.");
    question.focus();
    return;
  }

  resultsRegion.setAttribute("aria-busy", "true");
  askButton.disabled = true;
  askButton.querySelector("span:first-child").textContent = "Searching…";
  currentResults = retrieveEvidence(query, chunks, 4);
  sourceTypeFilter.value = "all";
  renderResults();
  askButton.disabled = false;
  askButton.querySelector("span:first-child").textContent = "Search knowledge";
  resultsRegion.setAttribute("aria-busy", "false");
}

function renderResults() {
  const filter = sourceTypeFilter.value;
  const results = filter === "all" ? currentResults : currentResults.filter((result) => result.kind === filter);
  evidenceList.replaceChildren();
  resultControls.hidden = currentResults.length === 0;
  answerState.hidden = true;

  if (!currentResults.length) {
    resultSummary.textContent = "No supporting passages found in approved, current sources.";
    evidenceList.append(emptyState("No evidence found", "The available documents do not support an answer to this question. Try rephrasing it or add a relevant approved source."));
    return;
  }

  const total = currentResults.length;
  resultSummary.textContent = `${total} relevant ${total === 1 ? "passage" : "passages"} from approved, current sources`;
  visibleCount.textContent = `${results.length} shown`;
  if (!results.length) {
    evidenceList.append(emptyState("No passages match this source type", "Choose a different source type to see other supporting evidence."));
    return;
  }
  results.forEach((result, index) => evidenceList.append(renderEvidence(result, index)));
}

function renderEvidence(result, index) {
  const card = document.createElement("article");
  card.className = "evidence-card";

  const top = document.createElement("div");
  top.className = "evidence-topline";
  const order = document.createElement("span");
  order.className = "result-number";
  order.textContent = String(index + 1).padStart(2, "0");
  const sourceKind = document.createElement("span");
  sourceKind.className = "kind-badge";
  sourceKind.textContent = result.kind;
  const relevance = document.createElement("span");
  relevance.className = "relevance-score";
  relevance.innerHTML = '<span>●</span> Strong match';
  top.append(order, sourceKind, relevance);

  const title = document.createElement("h3");
  title.className = "evidence-title";
  title.textContent = result.heading;
  const documentMeta = document.createElement("div");
  documentMeta.className = "evidence-source-name";
  documentMeta.textContent = `${result.title}  ·  ${result.version}`;

  const passage = document.createElement("blockquote");
  passage.className = "passage";
  appendHighlightedText(passage, result.text, result.matchedQueryTerms);

  const matchedTerms = result.matchedQueryTerms ?? [];
  const matched = document.createElement("div");
  matched.className = "matched-line";
  const matchedLabel = document.createElement("span");
  matchedLabel.textContent = "MATCHED TERMS";
  const termList = document.createElement("div");
  termList.className = "matched-terms";
  for (const term of matchedTerms) {
    const chip = document.createElement("span");
    chip.className = "matched-term";
    chip.textContent = term;
    termList.append(chip);
  }
  matched.append(matchedLabel, termList);

  const footer = document.createElement("div");
  footer.className = "evidence-footer";
  const citationInfo = document.createElement("span");
  citationInfo.className = "citation-info";
  citationInfo.innerHTML = '<span class="citation-check">✓</span> CITED SOURCE';
  const citationLink = document.createElement("button");
  citationLink.className = "citation-link";
  citationLink.type = "button";
  citationLink.innerHTML = `<span>${result.startLine === result.endLine ? `Line ${result.startLine}` : `Lines ${result.startLine}–${result.endLine}`}</span><span aria-hidden="true">↗</span>`;
  citationLink.addEventListener("click", () => openCitation(result));
  footer.append(citationInfo, citationLink);

  card.append(top, title, documentMeta, passage, matched, footer);
  return card;
}

function renderSources() {
  const list = document.querySelector("#source-list");
  list.replaceChildren();
  for (const doc of sourceDocs) {
    const entry = document.createElement("div");
    entry.className = "source-entry";
    const item = document.createElement("button");
    item.className = "source-item";
    item.type = "button";
    item.dataset.sourceId = doc.documentId;
    item.addEventListener("click", () => openSource(doc));

    const top = document.createElement("span");
    top.className = "source-item-top";
    const icon = document.createElement("span");
    icon.className = "file-icon";
    icon.textContent = doc.kind === "Archived guide" ? "◷" : "▤";
    const details = document.createElement("span");
    details.className = "source-details";
    const name = document.createElement("strong");
    name.textContent = doc.title;
    const sub = document.createElement("small");
    sub.textContent = `${doc.kind} · ${doc.version}`;
    details.append(name, sub);
    const arrow = document.createElement("span");
    arrow.className = "source-arrow";
    arrow.textContent = "↗";
    top.append(icon, details, arrow);

    const tags = document.createElement("span");
    tags.className = "source-tags";
    tags.append(statusTag(doc.approved ? "Approved" : "Pending approval", doc.approved), statusTag(doc.current ? "Current" : "Outdated", doc.current));
    item.append(top, tags);
    entry.append(item);
    if (!doc.approved && doc.current) {
      const approveButton = document.createElement("button");
      approveButton.className = "approve-source-button";
      approveButton.type = "button";
      approveButton.textContent = "Approve for this demo";
      approveButton.addEventListener("click", () => approveSource(doc));
      entry.append(approveButton);
    }
    list.append(entry);
  }

  const activeCount = sourceDocs.filter((doc) => doc.approved && doc.current).length;
  const pendingCount = sourceDocs.filter((doc) => !doc.approved && doc.current).length;
  document.querySelector("#source-count").textContent = String(sourceDocs.length);
  document.querySelector("#current-source-count").textContent = pendingCount ? `${activeCount} active · ${pendingCount} pending` : `${activeCount} active ${activeCount === 1 ? "source" : "sources"}`;
  document.querySelector("#library-total").textContent = String(sourceDocs.length).padStart(2, "0");
  const selectedType = sourceTypeFilter.value || "all";
  const kinds = [...new Set(sourceDocs.filter((doc) => doc.approved && doc.current).map((doc) => doc.kind))].sort((a, b) => a.localeCompare(b));
  sourceTypeFilter.replaceChildren(new Option("All types", "all"));
  for (const kind of kinds) sourceTypeFilter.add(new Option(kind, kind));
  sourceTypeFilter.value = kinds.includes(selectedType) ? selectedType : "all";
}

function statusTag(text, active) {
  const element = document.createElement("span");
  element.className = active ? "tag" : "tag muted";
  element.textContent = text;
  return element;
}

function approveSource(doc) {
  doc.approved = true;
  for (const chunk of chunks) {
    if (chunk.documentId === doc.documentId) chunk.approved = true;
  }
  renderSources();
  showToast(`“${doc.title}” is approved for this demo session. You can search it now.`);
}

function openCitation(result) {
  const doc = sourceDocs.find((source) => source.documentId === result.documentId);
  if (doc) openSource(doc, {
    startLine: result.startLine,
    endLine: result.endLine,
    matchedTerms: result.matchedQueryTerms,
  });
}

function openSource(doc, range = null) {
  document.querySelector("#dialog-title").textContent = doc.title;
  document.querySelector("#dialog-meta").textContent = `${doc.kind} · ${doc.version} · ${doc.approved ? "Approved" : "Pending approval"}`;
  document.querySelector(".dialog-trust").innerHTML = doc.approved ? '<span>✓</span> Approved source' : '<span>◷</span> Awaiting approval';
  const callout = document.querySelector("#citation-callout");
  callout.hidden = !range;
  if (range) callout.querySelector("p").textContent = `Showing cited passage · ${range.startLine === range.endLine ? `line ${range.startLine}` : `lines ${range.startLine}–${range.endLine}`}`;

  const documentText = document.querySelector("#document-text");
  documentText.replaceChildren();
  doc.markdown.split(/\r?\n/).forEach((line, index) => {
    const lineNumber = index + 1;
    const row = document.createElement("span");
    row.className = `document-line${range && lineNumber >= range.startLine && lineNumber <= range.endLine ? " cited-line" : ""}`;
    const number = document.createElement("span");
    number.className = "line-number";
    number.textContent = String(lineNumber).padStart(2, "0");
    const content = document.createElement("span");
    content.className = "line-content";
    appendHighlightedText(content, line || " ", range?.matchedTerms ?? []);
    row.append(number, content);
    documentText.append(row);
  });

  sourceDialog.showModal();
  const citedLine = documentText.querySelector(".cited-line");
  citedLine?.scrollIntoView({ block: "center", behavior: "smooth" });
}

function appendHighlightedText(container, text, terms = []) {
  const uniqueTerms = [...new Set(terms)].sort((a, b) => b.length - a.length);
  if (!uniqueTerms.length) {
    container.textContent = text;
    return;
  }

  const alternatives = uniqueTerms.map((term) => term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|");
  const expression = new RegExp(`(?<![\\p{L}\\p{N}_-])(${alternatives})(?![\\p{L}\\p{N}_-])`, "giu");
  let cursor = 0;
  for (const match of text.matchAll(expression)) {
    if (match.index > cursor) container.append(document.createTextNode(text.slice(cursor, match.index)));
    const mark = document.createElement("mark");
    mark.className = "query-match";
    mark.textContent = match[0];
    container.append(mark);
    cursor = match.index + match[0].length;
  }
  container.append(document.createTextNode(text.slice(cursor)));
}

function openSources() {
  sourcesPanel.classList.add("open");
  sourcesPanel.setAttribute("aria-hidden", "false");
  panelScrim.classList.add("visible");
  document.querySelector("#close-sources").focus();
}

function closeSources() {
  sourcesPanel.classList.remove("open");
  sourcesPanel.setAttribute("aria-hidden", "true");
  panelScrim.classList.remove("visible");
}

async function importMarkdown(event) {
  const file = event.target.files?.[0];
  if (!file) return;
  try {
    if (!/\.(?:md|markdown)$/i.test(file.name)) throw new Error("Choose a .md or .markdown file.");
    if (file.size > 2 * 1024 * 1024) throw new Error("Markdown files must be smaller than 2 MB.");
    const markdown = await file.text();
    const title = file.name.replace(/\.markdown?$/i, "").replace(/[-_]+/g, " ");
    const doc = {
      documentId: `upload-${crypto.randomUUID()}`,
      title,
      version: "session import",
      approved: false,
      current: true,
      kind: "Uploaded Markdown",
      markdown,
    };
    const newChunks = ingestMarkdown(markdown, doc);
    if (!newChunks.length) throw new Error("No readable Markdown passages were found.");
    sourceDocs.push(doc);
    chunks.push(...newChunks);
    renderSources();
    showToast(`Added “${title}”. Approve it from the source library before searching.`);
  } catch (error) {
    showToast(error.message || "Could not read that Markdown file.");
  } finally {
    event.target.value = "";
  }
}

function emptyState(title, description) {
  const box = document.createElement("div");
  box.className = "empty-state";
  const icon = document.createElement("span");
  icon.className = "empty-icon";
  icon.textContent = "⌕";
  const strong = document.createElement("strong");
  strong.textContent = title;
  const text = document.createElement("p");
  text.textContent = description;
  box.append(icon, strong, text);
  return box;
}

function showToast(message) {
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => toast.classList.remove("show"), 2800);
}
