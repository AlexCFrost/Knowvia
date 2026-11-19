import { ingestMarkdown, retrieveEvidence } from "./knowledge.mjs";
import { sourceDocs } from "./sample-documents.mjs";

const cases = [
  { name: "MFA reset", query: "How can I reset a user's MFA device?", expected: ["identity-guide", "mfa-recovery-ticket"] },
  { name: "SSO troubleshooting", query: "What should I check when SSO login fails?", expected: ["sso-troubleshooting"] },
  { name: "Audit log retention", query: "How long are audit logs retained?", expected: [] },
  { name: "Billing contact", query: "How do I change the billing contact?", expected: [] },
];

const unapprovedControl = {
  documentId: "unapproved-mfa-draft",
  title: "Unapproved MFA Draft",
  version: "draft",
  approved: false,
  current: true,
  kind: "Draft",
  markdown: "# MFA reset\n\nReset the user's MFA from Admin Console, Users, Security, then Reset MFA.",
};
const allDocs = [...sourceDocs, unapprovedControl];
const chunks = allDocs.flatMap((doc) => ingestMarkdown(doc.markdown, doc));

const rows = [];
let invalidCitations = 0;
let ineligibleReturned = 0;
let retrievalTimeMs = 0;

for (const item of cases) {
  const retrievalStarted = performance.now();
  const results = retrieveEvidence(item.query, chunks, 3);
  retrievalTimeMs += performance.now() - retrievalStarted;

  for (const result of results) {
    const source = allDocs.find((doc) => doc.documentId === result.documentId);
    const lineCount = source?.markdown.split(/\r?\n/).length ?? 0;
    if (!source
      || result.citation.documentId !== result.documentId
      || result.citation.title !== result.title
      || result.citation.version !== result.version
      || result.citation.startLine !== result.startLine
      || result.citation.endLine !== result.endLine
      || result.startLine < 1
      || result.endLine < result.startLine
      || result.endLine > lineCount) invalidCitations += 1;
    if (!result.approved || !result.current) ineligibleReturned += 1;
  }

  const firstRelevantIndex = results.findIndex((result) => item.expected.includes(result.documentId));
  rows.push({
    case: item.name,
    expected: item.expected.length ? item.expected.join(", ") : "abstain",
    retrieved: results.map((result) => result.documentId),
    hit: item.expected.length > 0 && firstRelevantIndex >= 0,
    reciprocalRank: firstRelevantIndex < 0 ? 0 : 1 / (firstRelevantIndex + 1),
    abstained: results.length === 0,
  });
}

const supported = cases.filter((item) => item.expected.length > 0);
const unsupported = cases.filter((item) => item.expected.length === 0);
const supportedRows = rows.filter((row) => row.expected !== "abstain");
const unsupportedRows = rows.filter((row) => row.expected === "abstain");
const excludedControls = chunks.filter((chunk) => !chunk.approved || !chunk.current);
const excludedControlReturned = rows.some((row) => row.retrieved.some((id) => excludedControls.some((chunk) => chunk.documentId === id)));
const report = {
  mode: "lexical baseline (local only)",
  hitAt3: rate(supportedRows.filter((row) => row.hit).length, supported.length),
  meanReciprocalRank: average(supportedRows.map((row) => row.reciprocalRank)),
  unsupportedAbstentionRate: rate(unsupportedRows.filter((row) => row.abstained).length, unsupported.length),
  citationValidity: invalidCitations === 0 ? "pass" : `${invalidCitations} invalid citation(s)`,
  approvedCurrentFiltering: ineligibleReturned === 0 && !excludedControlReturned ? "pass" : "fail",
  retrievalLatencyMs: Number(retrievalTimeMs.toFixed(2)),
  cases: rows,
};

console.log(JSON.stringify(report, null, 2));

function rate(numerator, denominator) {
  return denominator ? Number((numerator / denominator).toFixed(3)) : 0;
}

function average(values) {
  return values.length ? Number((values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(3)) : 0;
}
