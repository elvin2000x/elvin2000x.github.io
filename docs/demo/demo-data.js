/*
 * Document Engine PUBLIC DEMO: sample data (elvinpeters.com/docs/demo/).
 * No documents, chats, reports or usage: the demo shows the interface only, with empty states (card #545).
 * The page has no server: app.js reads this object instead of calling the API (CSP connect-src 'none').
 *
 * COPY: banner and click line are Elvin's approved words (2026-10-01; 'Log in' per card #574). Tagline per #574. The meta description reuses
 * the live app's own headline ("Your documents, read, sorted and cited.") word for word.
 */
(function () {
  'use strict';
  const COPY = {
    badge: 'Demo',
    banner: 'Demo version. Log in to use full functionality. This is a demo version only.',
    only: 'Log in to use full functionality. This is a demo version only.',
  };

  const WORKSPACE = { name: 'Sample workspace', mode: 'legal_ltb' };
  const USER = { label: 'Sample user', role: 'member' };

  const LIMITS = { extensions: ['.pdf', '.docx', '.doc', '.xlsx', '.xls', '.csv', '.jpg', '.jpeg', '.png', '.heic', '.tif', '.eml', '.msg', '.zip', '.txt', '.md'], max_upload_mb: 50 };

  /* ---------------- workspace content: none. The demo shows the interface only (card #545, 2026-10-05). ---------------- */
  const DOCS = [];
  const PAGES = {};
  const CHATS = [];
  const RUNS = [];
  const CREDITS = {
    remaining_usd: 0, topups_usd: 0, spent_usd: 0, calls: 0, input_tokens: 0, output_tokens: 0,
    model: 'claude-opus-5', pricing: { input: 5, output: 25 }, recent_calls: [], topups: [],
  };

  /* ---------------- working modes (registries/modes.yaml, labels, blurbs and examples verbatim) ---------------- */
  const MODES = [
    { key: 'general', label: 'General documents', blurb: 'Any pile of files: letters, contracts, reports, spreadsheets, emails. Groups by whatever structure the files have.', tasks: [], examples: [
      'Put these files in date order and write a two-line summary of each.',
      'Make a table of every person named across these files, with their role, organisation and the page they appear on.',
      'Build a chronology of everything that happened, one line per event, each with its source page.',
      'Summarise each document in two lines and list anything one document contradicts in another.',
      'Organize these files into folders by topic, name each file by date, and give me a zip with an index.'] },
    { key: 'legal_ltb', label: 'Legal: Ontario Landlord and Tenant Board', blurb: 'Case files for a paralegal: notices, leases, rent ledgers, certificates of service, applications. Groups by matter.', tasks: ['assemble_case_files', 'matter_readiness', 'deadline_sweep'], examples: [
      'Sort these files into matters and put each matter\'s documents in date order.',
      'For every N4 on file: tenant, unit, termination date and amount claimed, with page cites. Flag any without a certificate of service.',
      'Reconstruct the rent ledger from the statements and the bank spreadsheet and tell me the arrears as of today.',
      'What is missing before an L1 can be filed on this matter?',
      'Add a table of contents with a tab for each part and number every page consecutively.',
      'Make a book of documents for the hearing: one PDF, index at the front, a tab for each document, page numbers on every page.',
      'Organize these into folders by matter, then by document type, date-named, as a zip with an index.',
      'Merge the N4, the certificate of service and the lease into one PDF, in date order.'] },
    { key: 'career', label: 'Career: resumes and applications', blurb: 'Resumes, cover letters, job postings, reference letters, offer letters. Groups by application or employer.', tasks: [], examples: [
      'Compare my resume against the job posting: list each requirement and the line in my resume that meets it, or mark it unmet.',
      'Build a timeline of every role on my resume with employer, title, start and end dates, each cited.',
      'List every quantified achievement across the cover letter and resume and where each appears.',
      'Which claims in the cover letter are not supported anywhere in the resume?',
      'Combine my cover letter and resume into one PDF, cover letter first.'] },
    { key: 'finance', label: 'Finance: invoices, statements, receipts', blurb: 'Invoices, bank and card statements, receipts, ledgers. Groups by vendor or account; every sum computed in code.', tasks: [], examples: [
      'List every invoice with vendor, number, date and total, sorted by date, and give me the total per vendor.',
      'Match each receipt to a line on the card statement and list anything unmatched on either side.',
      'Which invoices are past their due date as of today?',
      'Summarise the bank statement by month: deposits, withdrawals, closing balance, each computed.',
      'Put the invoices into a folder per vendor, date-named, and give me a zip with an index spreadsheet.'] },
  ];

  window.DEMO = { COPY, WORKSPACE, USER, LIMITS, DOCS, PAGES, CHATS, RUNS, CREDITS, MODES };
})();
