#!/usr/bin/env node
/**
 * CLI Script: Seed the local SQLite FTS5 index with realistic demo documents.
 *
 * Writes through the same upsertFileRecord() path the crawler uses, into the same
 * database index_search reads from (BOX_DB_PATH, default ./data/box_index.db).
 * No Box connection or credentials are required.
 *
 * Idempotent: records are keyed on box_id, so re-running updates them in place.
 * All names, emails and figures are fictional.
 */

import { closeDatabase, getDatabasePath, upsertFileRecord, type IndexedFileRecord } from '../src/indexer/schema.js';
import { searchLocalIndex } from '../src/indexer/search.js';

type DemoDoc = Omit<IndexedFileRecord, 'indexed_at'>;

const DEMO_DOCS: DemoDoc[] = [
  // ---------------------------------------------------------------- Finance
  {
    box_id: '9000000001',
    name: 'FY26_Q4_Revenue_Forecast_and_Guidance.xlsx',
    path: '/Finance/Planning/FY26/FY26_Q4_Revenue_Forecast_and_Guidance.xlsx',
    owner_email: 'priya.nair@enterprise.example.com',
    collaborators: 'marcus.webb@enterprise.example.com, elena.rossi@enterprise.example.com, cfo-office@enterprise.example.com',
    content_preview:
      'Q4 revenue forecast of $412M, up 9% year over year. Software revenue guidance raised on hybrid cloud demand; services revenue held flat. Includes downside scenario for delayed mainframe deals.',
    last_modified: '2026-10-12T14:22:00Z',
  },
  {
    box_id: '9000000002',
    name: 'ARR_Waterfall_Analysis_Q3_2026.pdf',
    path: '/Finance/Reporting/ARR/ARR_Waterfall_Analysis_Q3_2026.pdf',
    owner_email: 'marcus.webb@enterprise.example.com',
    collaborators: 'priya.nair@enterprise.example.com, david.okafor@enterprise.example.com',
    content_preview:
      'Annual recurring revenue (ARR) bridge for Q3: opening ARR $1.62B, new logo ARR +$74M, expansion ARR +$51M, churned ARR -$38M, closing ARR $1.71B. Net revenue retention 108%.',
    last_modified: '2026-10-08T09:40:00Z',
  },
  {
    box_id: '9000000003',
    name: 'SOX_Revenue_Recognition_Compliance_Review.docx',
    path: '/Finance/Audit/SOX/SOX_Revenue_Recognition_Compliance_Review.docx',
    owner_email: 'elena.rossi@enterprise.example.com',
    collaborators: 'internal-audit@enterprise.example.com, priya.nair@enterprise.example.com',
    content_preview:
      'SOX compliance review of revenue recognition controls under ASC 606. Two medium findings on multi-element contract allocation; remediation owners assigned, target close by end of Q4.',
    last_modified: '2026-09-30T16:05:00Z',
  },

  // --------------------------------------------------------------------- HR
  {
    box_id: '9000000004',
    name: '2026_Mandatory_Compliance_Training_Completion.xlsx',
    path: '/HR/Learning/Compliance/2026_Mandatory_Compliance_Training_Completion.xlsx',
    owner_email: 'grace.liu@enterprise.example.com',
    collaborators: 'hr-operations@enterprise.example.com, legal-compliance@enterprise.example.com',
    content_preview:
      'Completion tracker for annual compliance training: code of conduct, data privacy, anti-bribery and responsible AI use. Overall completion 94%; 212 employees overdue, escalated to managers.',
    last_modified: '2026-10-19T11:15:00Z',
  },
  {
    box_id: '9000000005',
    name: 'AI_Skills_Workforce_Planning_FY27.pptx',
    path: '/HR/Workforce_Planning/FY27/AI_Skills_Workforce_Planning_FY27.pptx',
    owner_email: 'tomas.berg@enterprise.example.com',
    collaborators: 'grace.liu@enterprise.example.com, cto-office@enterprise.example.com',
    content_preview:
      'FY27 workforce plan: reskilling 1,800 engineers in AI and machine learning, hiring 120 AI engineers, and converting 300 mainframe developers to hybrid cloud roles. Budget request attached.',
    last_modified: '2026-10-02T08:50:00Z',
  },

  // ------------------------------------------------------------------ Sales
  {
    box_id: '9000000006',
    name: 'Q4_Enterprise_Pipeline_Review.xlsx',
    path: '/Sales/Pipeline/Q4_Enterprise_Pipeline_Review.xlsx',
    owner_email: 'jordan.ellis@enterprise.example.com',
    collaborators: 'sales-leadership@enterprise.example.com, priya.nair@enterprise.example.com',
    content_preview:
      'Weighted pipeline of $286M against a $240M quota. Largest ARR opportunities: Northwind Bank mainframe modernization ($18M), Contoso Insurance AI claims platform ($11M). Commit and best-case split by region.',
    last_modified: '2026-10-21T13:30:00Z',
  },
  {
    box_id: '9000000007',
    name: 'Northwind_Bank_Strategic_Account_Plan.docx',
    path: '/Sales/Accounts/Northwind_Bank/Northwind_Bank_Strategic_Account_Plan.docx',
    owner_email: 'jordan.ellis@enterprise.example.com',
    collaborators: 'amara.diallo@enterprise.example.com, mainframe-solutions@enterprise.example.com',
    content_preview:
      'Account plan for Northwind Bank, 14-year customer. Core banking runs on z16 mainframe; proposal covers phased modernization and AI fraud detection. Executive sponsor meeting booked for November.',
    last_modified: '2026-09-25T10:00:00Z',
  },

  // -------------------------------------------------- Mainframe Modernization
  {
    box_id: '9000000008',
    name: 'COBOL_Application_Portfolio_Assessment.pdf',
    path: '/Mainframe_Modernization/Assessments/COBOL_Application_Portfolio_Assessment.pdf',
    owner_email: 'ravi.menon@enterprise.example.com',
    collaborators: 'amara.diallo@enterprise.example.com, architecture-board@enterprise.example.com',
    content_preview:
      'Assessment of 3,400 COBOL programs and 11 million lines across mainframe z/OS LPARs. 38% flagged as refactor candidates, 22% retire, 40% retain. AI-assisted code analysis used to map dependencies.',
    last_modified: '2026-10-14T15:45:00Z',
  },
  {
    box_id: '9000000009',
    name: 'Mainframe_to_Hybrid_Cloud_Migration_Roadmap.pptx',
    path: '/Mainframe_Modernization/Roadmaps/Mainframe_to_Hybrid_Cloud_Migration_Roadmap.pptx',
    owner_email: 'amara.diallo@enterprise.example.com',
    collaborators: 'ravi.menon@enterprise.example.com, jordan.ellis@enterprise.example.com, cto-office@enterprise.example.com',
    content_preview:
      'Three-wave mainframe modernization roadmap: wave 1 batch offload, wave 2 API enablement of CICS transactions, wave 3 core refactoring to Java microservices. Targets 30% MIPS cost reduction by FY28.',
    last_modified: '2026-10-06T12:10:00Z',
  },
  {
    box_id: '9000000010',
    name: 'Mainframe_Batch_Workload_Compliance_Controls.docx',
    path: '/Mainframe_Modernization/Risk/Mainframe_Batch_Workload_Compliance_Controls.docx',
    owner_email: 'ravi.menon@enterprise.example.com',
    collaborators: 'legal-compliance@enterprise.example.com, internal-audit@enterprise.example.com',
    content_preview:
      'Compliance control mapping for mainframe batch workloads during migration: segregation of duties, audit logging, data residency and PCI DSS scope. Gaps noted for JCL job scheduling approvals.',
    last_modified: '2026-09-18T17:25:00Z',
  },

  // ------------------------------------------------------- Customer Success
  {
    box_id: '9000000011',
    name: 'Customer_Escalation_Log_Q3_2026.xlsx',
    path: '/Customer_Success/Escalations/Customer_Escalation_Log_Q3_2026.xlsx',
    owner_email: 'sofia.alvarez@enterprise.example.com',
    collaborators: 'support-leadership@enterprise.example.com, jordan.ellis@enterprise.example.com',
    content_preview:
      'Log of 27 customer escalations in Q3. Severity 1 customer escalation at Fabrikam Logistics over batch job failures after a platform upgrade; root cause identified, fix delivered in 48 hours. Median time to resolve 6.2 days.',
    last_modified: '2026-10-17T09:05:00Z',
  },
  {
    box_id: '9000000012',
    name: 'Renewal_Risk_Report_At_Risk_ARR.pdf',
    path: '/Customer_Success/Renewals/Renewal_Risk_Report_At_Risk_ARR.pdf',
    owner_email: 'sofia.alvarez@enterprise.example.com',
    collaborators: 'marcus.webb@enterprise.example.com, sales-leadership@enterprise.example.com',
    content_preview:
      'Renewal risk review: $63M of ARR flagged at risk across 9 accounts. Primary drivers are an open customer escalation, low product adoption and executive sponsor turnover. Recovery plans in progress.',
    last_modified: '2026-10-10T14:00:00Z',
  },

  // ---------------------------------------------------------- AI Governance
  {
    box_id: '9000000013',
    name: 'AI_Governance_Framework_v2.pdf',
    path: '/AI_Governance/Policies/AI_Governance_Framework_v2.pdf',
    owner_email: 'nadia.hassan@enterprise.example.com',
    collaborators: 'legal-compliance@enterprise.example.com, cto-office@enterprise.example.com, grace.liu@enterprise.example.com',
    content_preview:
      'Enterprise AI governance framework: model risk tiers, human oversight requirements, bias testing, transparency and EU AI Act compliance obligations. Approved by the AI Ethics Board.',
    last_modified: '2026-08-28T10:30:00Z',
  },
  {
    box_id: '9000000014',
    name: 'AI_Use_Case_Inventory_and_Risk_Register.xlsx',
    path: '/AI_Governance/Registers/AI_Use_Case_Inventory_and_Risk_Register.xlsx',
    owner_email: 'nadia.hassan@enterprise.example.com',
    collaborators: 'ravi.menon@enterprise.example.com, internal-audit@enterprise.example.com',
    content_preview:
      'Register of 64 production AI use cases with risk tier, data sources, owner and review date. 7 high-risk systems require compliance sign-off, including AI claims triage and AI code assistants for mainframe teams.',
    last_modified: '2026-10-20T16:40:00Z',
  },
  {
    box_id: '9000000015',
    name: 'Generative_AI_Vendor_Compliance_Assessment.docx',
    path: '/AI_Governance/Vendor_Reviews/Generative_AI_Vendor_Compliance_Assessment.docx',
    owner_email: 'tomas.berg@enterprise.example.com',
    collaborators: 'nadia.hassan@enterprise.example.com, procurement@enterprise.example.com',
    content_preview:
      'Third-party generative AI vendor assessment covering data retention, training-data usage, SOC 2 compliance and indemnification. Two of five vendors failed data residency requirements.',
    last_modified: '2026-10-05T13:15:00Z',
  },

  // ------------------------------------- Retention scenarios (demo_retention_check)
  // The 15 documents above all have collaborators, so they are all "protected".
  // These two cover the other outcomes: deletable, and protected by marker only.
  {
    box_id: '9000000016',
    name: 'Scratch_Pipeline_Sync_Notes.txt',
    path: '/Sales/Scratch/Scratch_Pipeline_Sync_Notes.txt',
    owner_email: 'jordan.ellis@enterprise.example.com',
    collaborators: '',
    content_preview: 'Unshared scratch notes from the weekly pipeline sync. Personal working copy with no retention requirement.',
    last_modified: '2026-10-22T08:20:00Z',
  },
  {
    box_id: '9000000017',
    name: 'Board_Minutes_FY26_Legal_Hold.pdf',
    path: '/Finance/Legal/Board_Minutes_FY26_Legal_Hold.pdf',
    owner_email: 'elena.rossi@enterprise.example.com',
    collaborators: '',
    content_preview: '[PROTECTED] do_not_delete: board minutes under legal hold, retained for seven years per records policy.',
    last_modified: '2026-09-12T15:00:00Z',
  },
];

/** Queries the demo is meant to support. Each must return at least one result. */
const VERIFICATION_QUERIES = ['revenue', 'ARR', 'mainframe', 'compliance', 'AI', 'customer escalation'];

function main(): void {
  const indexedAt = new Date().toISOString();

  for (const doc of DEMO_DOCS) {
    upsertFileRecord({ ...doc, indexed_at: indexedAt });
  }

  console.error(`[SeedDemo] Upserted ${DEMO_DOCS.length} documents into ${getDatabasePath()}`);
  console.error('[SeedDemo] Verifying search coverage:');

  let failed = 0;
  for (const query of VERIFICATION_QUERIES) {
    const { totalFound, results } = searchLocalIndex({ query, limit: 3 });
    const status = totalFound > 0 ? 'ok  ' : 'FAIL';
    if (totalFound === 0) failed++;
    console.error(`  [${status}] "${query}" -> ${totalFound} result(s); top: ${results[0]?.name ?? 'none'}`);
  }

  closeDatabase();

  if (failed > 0) {
    console.error(`[SeedDemo] ${failed} verification quer${failed === 1 ? 'y' : 'ies'} returned no results.`);
    process.exit(1);
  }
}

main();
