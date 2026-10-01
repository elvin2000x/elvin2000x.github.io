/*
 * Document Engine PUBLIC DEMO: sample data (elvinpeters.com/docs/demo/).
 * Every name, address, amount and date below is made up for the demo. No real client file is used.
 * The page has no server: app.js reads this object instead of calling the API (CSP connect-src 'none').
 *
 * COPY: banner and click line are Elvin's own words (approved 2026-10-01). The meta description reuses
 * the live app's own headline ("Your documents, read, sorted and cited.") word for word.
 */
(function () {
  'use strict';
  const COPY = {
    badge: 'Demo',
    banner: 'Demo version. Login to use full functionality. This is a demo version only.',
    only: 'Login to use full functionality. This is a demo version only.',
  };

  const WORKSPACE = { name: 'Sample workspace', mode: 'legal_ltb' };
  const USER = { label: 'Sample user', role: 'member' };

  const LIMITS = { extensions: ['.pdf', '.docx', '.doc', '.xlsx', '.xls', '.csv', '.jpg', '.jpeg', '.png', '.heic', '.tif', '.eml', '.msg', '.zip', '.txt', '.md'], max_upload_mb: 50 };

  /* ---------------- documents and extracted facts ---------------- */
  const D = (id, filename, file_kind, doc_type, page_count, ocr, facts, extra) => Object.assign({
    id, filename, file_kind, doc_type, page_count,
    ocr_applied: ocr != null, ocr_confidence: ocr, needs_review: ocr != null && ocr < 0.8,
    facts: facts.map(([field, value_text, page_number, verified]) => ({ field, value_text, page_number, verified: verified !== false })),
    parent_document_id: null, ledger_candidate: false,
  }, extra || {});

  const DOCS = [
    D('a1f03c92e4b1', 'Lease_Agreement_Unit1204.pdf', 'pdf', 'lease', 14, null, [
      ['landlord', 'Harbourview Properties Inc.', 1], ['tenant', 'Daniel Sample', 1],
      ['rental_unit', 'Unit 1204, 100 Example Street, Toronto', 1], ['tenancy_start', '2025-03-01', 2],
      ['monthly_rent', '$2,350.00', 3], ['rent_due_day', '1st of each month', 3]]),
    D('b7e21d40c8a2', 'N4_Notice_2026-06-03.pdf', 'pdf', 'n4_notice', 2, 0.94, [
      ['tenant', 'Daniel Sample', 1], ['rental_unit', 'Unit 1204, 100 Example Street', 1],
      ['termination_date', '2026-06-17', 1], ['amount_claimed', '$4,700.00', 1], ['signed_date', '2026-06-03', 2]]),
    D('c3d98a15f702', 'Certificate_of_Service_N4.pdf', 'pdf', 'certificate_of_service', 1, 0.71, [
      ['document_served', 'N4 Notice', 1], ['date_served', '2026-06-03', 1, false], ['method', 'In person, to the tenant', 1]]),
    D('d4402be7a913', 'Rent_Ledger_2026.xlsx', 'spreadsheet', 'rent_ledger', 1, null, [
      ['rows', '18', 1], ['last_payment', '2026-04-01 · $2,350.00', 1], ['balance_shown', '$9,400.00', 1]], { ledger_candidate: true }),
    D('e95c1f08b6d4', 'RE_ rent arrears.eml', 'email', 'correspondence', 2, null, [
      ['from', 'D. Sample', 1], ['to', 'Harbourview Properties Inc.', 1], ['date', '2026-06-10', 1], ['subject', 'RE: Rent arrears, Unit 1204', 1]]),
    D('f0a7b331d25e', 'Payment_plan_proposal.pdf', 'pdf', 'correspondence', 1, null, [
      ['proposed_extra_payment', '$600.00 a month', 1], ['proposed_start', '2026-07-01', 1]], { parent_document_id: 'e95c1f08b6d4' }),
    D('0b6c4e7a51c3', 'Bank_statement_2026-07.pdf', 'pdf', 'bank_statement', 3, null, [
      ['account', 'Harbourview Properties Inc. operating', 1], ['deposit', '$1,000.00 from D. Sample', 2], ['deposit_date', '2026-07-15', 2]]),
    D('1c8d5f29e0aa', 'IMG_2041.jpg', 'image', 'notice_of_entry', 1, 0.88, [
      ['title', 'Notice of Entry', 1], ['date', '2026-07-02', 1], ['rental_unit', 'Unit 1204', 1]]),
  ];

  /* ---------------- page text the page viewer shows (stand-in for the page images) ---------------- */
  const PAGES = {
    a1f03c92e4b1: {
      1: 'RESIDENTIAL TENANCY AGREEMENT (STANDARD FORM OF LEASE)\n\nParties to the Agreement\n\nLandlord(s): Harbourview Properties Inc.\n\nTenant(s): Daniel Sample\n\nRental Unit\n\nUnit: 1204\nStreet address: 100 Example Street\nCity: Toronto, Ontario\n\nThis agreement was signed on 2025-02-14.',
      2: 'Term of Tenancy Agreement\n\nThis tenancy starts on: 2025-03-01\n\nThis tenancy agreement is for a fixed length of time ending on 2026-02-28. After that date the tenancy continues month to month unless ended under the Residential Tenancies Act, 2006.',
      3: 'Rent\n\nRent is to be paid on the 1st of each month.\n\nThe tenant will pay the following rent:\nBase rent for the rental unit: $2,350.00\nParking: $0.00\nTotal rent (Lawful Rent): $2,350.00\n\nRent is payable to: Harbourview Properties Inc.\nRent will be paid by: e-transfer or cheque',
    },
    b7e21d40c8a2: {
      1: 'N4 · Notice to End your Tenancy For Non-payment of Rent\n\nTo: (Tenant\'s name) Daniel Sample\nFrom: (Landlord\'s name) Harbourview Properties Inc.\nAddress of the Rental Unit: Unit 1204, 100 Example Street, Toronto ON\n\nThis is a legal notice that could lead to you being evicted from your home.\n\nThe Landlord believes you owe $4,700.00 in rent.\n\nYou must pay this amount by: 2026-06-17\n\nRent period from 2026-05-01 to 2026-05-31 · Rent charged $2,350.00 · Rent paid $0.00 · Rent owing $2,350.00\nRent period from 2026-06-01 to 2026-06-30 · Rent charged $2,350.00 · Rent paid $0.00 · Rent owing $2,350.00\n\nTotal rent owing: $4,700.00',
      2: 'Signature\n\nLandlord\'s agent: M. Okafor, Harbourview Properties Inc.\n\nDate: 2026-06-03',
    },
    c3d98a15f702: {
      1: 'Certificate of Service\n\nI, M. Okafor, served the following document: N4 Notice\n\nTo: Daniel Sample, Unit 1204, 100 Example Street\n\nOn: 2026-06-03   (scan is faint here: OCR confidence 0.71)\n\nMethod of service: by handing it to the tenant in person\n\nSignature: M. Okafor',
    },
    d4402be7a913: {
      1: 'Rent_Ledger_2026.xlsx · sheet "Unit 1204"\n\nDate        Description        Charge      Paid        Balance\n2026-01-01  Rent January       2,350.00\n2026-01-01  e-transfer                     2,350.00    0.00\n2026-02-01  Rent February      2,350.00\n2026-02-01  e-transfer                     2,350.00    0.00\n2026-03-01  Rent March         2,350.00\n2026-03-02  e-transfer                     2,350.00    0.00\n2026-04-01  Rent April         2,350.00\n2026-04-01  e-transfer                     2,350.00    0.00\n2026-05-01  Rent May           2,350.00                2,350.00\n2026-06-01  Rent June          2,350.00                4,700.00\n2026-07-01  Rent July          2,350.00                7,050.00\n2026-08-01  Rent August        2,350.00                9,400.00\n\n(No entry for July 15. The bank statement shows a $1,000.00 deposit that day.)',
    },
    e95c1f08b6d4: {
      1: 'From: D. Sample\nTo: Harbourview Properties Inc.\nDate: 2026-06-10\nSubject: RE: Rent arrears, Unit 1204\n\nHi,\n\nI got the notice. I lost hours at work this spring and fell behind. I would like to catch up. I have attached a payment plan. Could you let me know if this works?\n\nThanks,\nDaniel\n\nAttachment: Payment_plan_proposal.pdf',
      2: '-----Original message-----\nFrom: Harbourview Properties Inc.\nDate: 2026-06-03\nSubject: Rent arrears, Unit 1204\n\nPlease find attached a Notice to End your Tenancy (N4). Rent for May and June has not been received.',
    },
    f0a7b331d25e: {
      1: 'Payment plan proposal\nUnit 1204, 100 Example Street\n\nI propose to pay my regular rent of $2,350.00 on the 1st of each month, plus $600.00 a month toward the arrears, starting 2026-07-01, until the balance is paid.\n\nDaniel Sample\n2026-06-10',
    },
    '0b6c4e7a51c3': {
      1: 'Business Operating Account · Statement period 2026-07-01 to 2026-07-31\nAccount holder: Harbourview Properties Inc. operating',
      2: 'Date        Description                         Withdrawals    Deposits\n2026-07-02  e-transfer · Unit 803 rent                        2,180.00\n2026-07-03  Hydro payment                       1,412.66\n2026-07-15  e-transfer · D. Sample                          1,000.00\n2026-07-20  Property tax instalment             3,906.00\n2026-07-31  Service charge                         14.95',
    },
    '1c8d5f29e0aa': {
      1: '[Photo of a notice taped to a door]\n\nNOTICE OF ENTRY\n\nTo the tenant of Unit 1204\n\nThe landlord will enter the unit on 2026-07-03 between 10 a.m. and 2 p.m. to inspect the smoke alarm.\n\nPosted: 2026-07-02',
    },
  };

  /* ---------------- chats (each answer is a real-shaped reply with page cites) ---------------- */
  const CHATS = [
    { id: 'ch1', title: 'Arrears as of August 14, 2026', document_id: null, cost_usd: 0.06, messages: [
      { role: 'user', content: 'What are the arrears as of August 14, 2026?' },
      { role: 'bot', tools: 4, cost_usd: 0.06, content:
        'Arrears as of August 14, 2026 are **$8,400.00** [computed: 4 × $2,350.00 − $1,000.00 = $8,400.00].\n\n' +
        '- Rent is $2,350.00 a month, due on the 1st [doc:a1f03c92 p3].\n' +
        '- No rent was paid for May, June, July or August in the ledger [doc:d4402be7 p1].\n' +
        '- One payment of $1,000.00 arrived on July 15 [doc:0b6c4e7a p2]. It is on the bank statement but not in the ledger, so the ledger alone shows $9,400.00 [computed: 4 × $2,350.00 = $9,400.00].' },
      { role: 'user', content: 'Write this up as an Excel ledger.' },
      { role: 'bot', tools: 3, cost_usd: 0.12, artifact: true, files: [{ kind: 'xlsx', name: 'Rent ledger reconstruction.xlsx', bytes: 14336 }], content:
        'Done. The ledger has one row per rent period and one per payment, with a source page on every row. The arrears line is computed in the sheet and matches $8,400.00 [computed: 4 × $2,350.00 − $1,000.00 = $8,400.00].' },
    ] },
    { id: 'ch2', title: 'What is missing before an L1 can be filed?', document_id: null, cost_usd: 0.08, messages: [
      { role: 'user', content: 'What is missing before an L1 can be filed on this matter?' },
      { role: 'bot', tools: 6, cost_usd: 0.08, content:
        'Three things to check, from the files on hand:\n\n' +
        '1. **Certificate of service.** It is on file but it is a faint scan (OCR 0.71). It reads served in person on 2026-06-03 [doc:c3d98a15 p1]. Confirm the date against the page.\n' +
        '2. **Termination date.** The N4 gives 2026-06-17 [doc:b7e21d40 p1], 14 days after service [computed: 2026-06-17 − 2026-06-03 = 14 days]. That date has passed.\n' +
        '3. **Payments after the N4.** $1,000.00 was paid on July 15 [doc:0b6c4e7a p2]. Any arrears figure needs to count it.\n\n' +
        'Not on file: an L1 application itself, and any reply to the tenant\'s payment plan of June 10 [doc:f0a7b331 p1]. I flag these; you decide.' },
    ] },
    { id: 'ch3', title: 'Summarize this notice', document_id: 'b7e21d40c8a2', document_name: 'N4_Notice_2026-06-03.pdf', cost_usd: 0.05, messages: [
      { role: 'user', content: 'Summarize this notice in three lines.' },
      { role: 'bot', tools: 2, cost_usd: 0.05, content:
        '- N4, notice to end the tenancy for non-payment of rent, Unit 1204, 100 Example Street [doc:b7e21d40 p1].\n' +
        '- Landlord Harbourview Properties Inc., tenant Daniel Sample, $4,700.00 claimed for May and June 2026 [doc:b7e21d40 p1].\n' +
        '- Termination date 2026-06-17, signed by the landlord\'s agent on 2026-06-03 [doc:b7e21d40 p2].' },
    ] },
  ];

  /* ---------------- task runs and their reports ---------------- */
  const RUNS = [
    { id: 'r4', started_at: '2026-08-14T10:31', task_key: 'free_form', status: 'done', cost_usd: 0.30,
      instructions: 'Make a book of documents for the hearing: one PDF with an index, a tab for each document and page numbers.',
      verification: { verified: 9, unverified: 0, failed: 0, blocked: false },
      deliverables: [{ kind: 'pdf', name: 'Book of documents - Sample.pdf', label: 'Book of documents - Sample.pdf', bytes: 3250176 }],
      transcript: [{ tool: 'list_documents' }, { tool: 'read_pages', document: 'N4_Notice_2026-06-03.pdf' }, { tool: 'make_binder', entries: 8, numbering: 'all', result: '48 pages, 8 tabs, index at the front' }] },
    { id: 'r3', started_at: '2026-08-14T10:26', task_key: 'deadline_sweep', status: 'done', cost_usd: 0,
      verification: { verified: 3, unverified: 0, failed: 0, blocked: false }, files: { md: 1 },
      md: '# Deadline sweep\n\nSample workspace · 1 matter · rule checks only, no model call.\n\n' +
        '| Matter | Item | Date | Status |\n|---|---|---|---|\n' +
        '| Sample, Unit 1204 | N4 termination date | 2026-06-17 [doc:b7e21d40 p1] | Passed 58 days ago [computed: 2026-08-14 − 2026-06-17 = 58 days] |\n' +
        '| Sample, Unit 1204 | Certificate of service | 2026-06-03 [doc:c3d98a15 p1] | On file, scan needs review |\n' +
        '| Sample, Unit 1204 | L1 application | none on file | Missing |\n',
      transcript: [{ check: 'n4_termination_passed', result: 'pass' }, { check: 'certificate_of_service_present', result: 'pass, low OCR' }, { check: 'l1_on_file', result: 'missing' }] },
    { id: 'r2', started_at: '2026-08-14T10:20', task_key: 'free_form', status: 'done', cost_usd: 0.22,
      instructions: 'Reconstruct the rent ledger from the statements and the bank spreadsheet and tell me the arrears as of August 14, 2026.',
      verification: { verified: 9, unverified: 1, failed: 0, blocked: false }, files: { xlsx: 1, md: 1 },
      deliverables: [{ kind: 'xlsx', name: 'Rent ledger reconstruction.xlsx', label: 'Rent ledger reconstruction.xlsx', bytes: 14336 }],
      md: '# Rent ledger reconstruction, as of August 14, 2026\n\nUnit 1204, 100 Example Street. Rent is $2,350.00 a month, due on the 1st [doc:a1f03c92 p3].\n\n' +
        '| Period | Rent due | Paid | Source |\n|---|---|---|---|\n' +
        '| May 2026 | $2,350.00 | $0.00 | [doc:d4402be7 p1] |\n' +
        '| June 2026 | $2,350.00 | $0.00 | [doc:d4402be7 p1] |\n' +
        '| July 2026 | $2,350.00 | $1,000.00 on July 15 | [doc:0b6c4e7a p2] |\n' +
        '| August 2026 | $2,350.00 | $0.00 | [doc:d4402be7 p1] |\n\n' +
        '**Arrears as of 2026-08-14: $8,400.00** [computed: 4 × $2,350.00 − $1,000.00 = $8,400.00]\n\n' +
        '## Notes\n\n' +
        '- The ledger spreadsheet shows a balance of $9,400.00 [doc:d4402be7 p1]. It has no entry for the $1,000.00 deposit on July 15, which is on the bank statement [doc:0b6c4e7a p2].\n' +
        '- The N4 claimed $4,700.00 for May and June [doc:b7e21d40 p1], which matches two months of rent [computed: 2 × $2,350.00 = $4,700.00].\n' +
        '- One value could not be confirmed: the July 15 payment is not tied to a rent period in any document. It is applied to the oldest balance here.\n',
      transcript: [{ tool: 'table_query', document: 'Rent_Ledger_2026.xlsx' }, { tool: 'read_pages', document: 'Bank_statement_2026-07.pdf', pages: [2] }, { tool: 'compute', op: 'table_sum' }, { tool: 'build_artifact', renderer: 'xlsx' }] },
    { id: 'r1', started_at: '2026-08-14T10:12', task_key: 'free_form', status: 'done', cost_usd: 0.31,
      instructions: 'Build a chronology of everything that happened in the Sample matter, one line per event, each with its source page.',
      verification: { verified: 14, unverified: 0, failed: 0, blocked: false }, files: { pdf: 1, docx: 1, md: 1 },
      deliverables: [],
      md: '# Chronology: Sample matter\n\nUnit 1204, 100 Example Street, Toronto. 8 documents, 25 pages. One line per event, each with its source page.\n\n' +
        '| Date | Event | Source |\n|---|---|---|\n' +
        '| 2025-02-14 | Lease signed by Harbourview Properties Inc. and Daniel Sample. Rent $2,350.00 a month, due on the 1st. | [doc:a1f03c92 p1, p3] |\n' +
        '| 2025-03-01 | Tenancy starts. | [doc:a1f03c92 p2] |\n' +
        '| 2026-04-01 | Last full rent payment in the ledger, $2,350.00. | [doc:d4402be7 p1] |\n' +
        '| 2026-05-01 | May rent not paid. | [doc:d4402be7 p1] |\n' +
        '| 2026-06-03 | N4 served in person, claiming $4,700.00 for May and June. | [doc:b7e21d40 p1] [doc:c3d98a15 p1] |\n' +
        '| 2026-06-10 | Tenant emails a payment plan: $600.00 a month on top of rent. | [doc:e95c1f08 p1] [doc:f0a7b331 p1] |\n' +
        '| 2026-06-17 | N4 termination date, 14 days after service [computed: 2026-06-17 − 2026-06-03 = 14 days]. | [doc:b7e21d40 p1] |\n' +
        '| 2026-07-02 | Notice of entry posted on the unit door. | [doc:1c8d5f29 p1] |\n' +
        '| 2026-07-15 | Partial payment of $1,000.00 from D. Sample. | [doc:0b6c4e7a p2] |\n\n' +
        '## Flags\n\n' +
        '- The certificate of service is a faint scan (OCR 0.71). The service date reads 2026-06-03 [doc:c3d98a15 p1]. Check the page before relying on it.\n' +
        '- No L1 application is on file.\n' +
        '- No document answers the tenant\'s payment plan of June 10.\n',
      transcript: [{ tool: 'list_documents' }, { tool: 'search_facts', field: 'date' }, { tool: 'read_pages', document: 'Certificate_of_Service_N4.pdf' }, { tool: 'compute', op: 'day_count' }, { tool: 'build_artifact', renderer: 'docx' }] },
  ];

  /* ---------------- credits ---------------- */
  const CREDITS = {
    remaining_usd: 18.42, topups_usd: 25, spent_usd: 6.58, calls: 41, input_tokens: 812450, output_tokens: 61320,
    model: 'claude-opus-5', pricing: { input: 5, output: 25 },
    recent_calls: [
      ['2026-08-14T10:31', 'task:free_form', 18240, 2210, 9800, 0.11], ['2026-08-14T10:30', 'task:free_form', 15110, 1460, 9800, 0.09],
      ['2026-08-14T10:20', 'task:free_form', 21400, 3120, 11200, 0.13], ['2026-08-14T10:13', 'task:free_form', 24800, 4010, 11200, 0.17],
      ['2026-08-14T09:58', 'chat', 9120, 640, 6400, 0.06], ['2026-08-14T09:55', 'chat', 10480, 820, 6400, 0.08],
      ['2026-08-14T09:41', 'ingest:classify', 3200, 180, 0, 0.02], ['2026-08-14T09:41', 'ingest:extract', 4100, 520, 0, 0.03],
    ].map(([called_at, purpose, input_tokens, output_tokens, cache_read, cost_usd]) => ({ called_at, purpose, input_tokens, output_tokens, cache_read, cost_usd })),
    topups: [{ created_at: '2026-08-14T09:30', amount_usd: 25, note: 'trial credits' }],
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
