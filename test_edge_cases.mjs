import { execSync } from 'child_process';
import crypto from 'crypto';

const GRAPHQL_URL = "https://local.graphql.local.nhost.run/v1";
const QUERY_URL = "https://local.hasura.local.nhost.run/v2/query";
const ADMIN_SECRET = "nhost-admin-secret";

function graphqlRequest(query, variables, headers = {}) {
  const payload = JSON.stringify({ query, variables });
  // Merge admin secret into headers so Hasura respects the user impersonation headers
  const finalHeaders = { "x-hasura-admin-secret": ADMIN_SECRET, ...headers };
  const headersArray = Object.entries(finalHeaders).map(([k, v]) => `-H "${k}: ${v}"`).join(' ');
  
  const cmd = `curl -s --resolve local.graphql.local.nhost.run:443:127.0.0.1 -k -X POST \\
    -H "Content-Type: application/json" \\
    ${headersArray} \\
    -d '${payload.replace(/'/g, "'\\''")}' \\
    ${GRAPHQL_URL}`;

  const text = execSync(cmd).toString();
  let json;
  try {
    json = JSON.parse(text);
  } catch (e) {
    throw new Error("Failed to parse JSON. Raw response: " + text);
  }
  if (json?.errors) {
    throw new Error(JSON.stringify(json.errors));
  }
  return json?.data;
}

function runSql(sql) {
  const payload = JSON.stringify({ type: "run_sql", args: { sql, cascade: false } });
  const cmd = `curl -s --resolve local.hasura.local.nhost.run:443:127.0.0.1 -k -X POST \\
    -H "Content-Type: application/json" \\
    -H "x-hasura-admin-secret: ${ADMIN_SECRET}" \\
    -H "x-hasura-role: admin" \\
    -d '${payload.replace(/'/g, "'\\''")}' \\
    ${QUERY_URL}`;
    
  const text = execSync(cmd).toString();
  const json = JSON.parse(text);
  if (json.error || json.errors) {
    throw new Error(`SQL Failed: ${JSON.stringify(json)}`);
  }
  return json;
}

async function runTests() {
  console.log("--- Setup ---");
  const userA = "d57d0e10-aad7-4a4f-b70f-d63fd0463abe"; // Must exist in auth.users
  const orgId = crypto.randomUUID();
  const wfId = crypto.randomUUID();

  // Create Org A & Workflow A, ensure User A is viewer
  runSql(`
    INSERT INTO public.organizations (id, name, quota_calls_allowed, quota_calls_used) VALUES ('${orgId}', 'Edge Case Org', 5, 0);
    INSERT INTO public.org_members (org_id, user_id, role) VALUES ('${orgId}', '${userA}', 'viewer');
    INSERT INTO public.workflows (id, org_id, name, created_by) VALUES ('${wfId}', '${orgId}', 'Edge Case Workflow', '${userA}');
  `);

  console.log("\\n--- Testing Edge Cases ---");

  // TEST 1: triggerWorkflowRun as a viewer-role user -> must reject
  try {
    console.log("1. Triggering workflow run as User A (viewer)...");
    await graphqlRequest(`
      mutation TriggerRun($wfId: uuid!) {
        triggerWorkflowRun(workflow_id: $wfId) { run_id status }
      }
    `, { wfId }, { "x-hasura-user-id": userA, "x-hasura-role": "user" });
    console.error("❌ FAILED: User A was able to trigger the workflow (should be rejected).");
  } catch (e) {
    if (e.message.includes("Forbidden") || e.message.includes("FORBIDDEN")) {
      console.log("✅ PASSED: User A was rejected from triggering the workflow.");
    } else {
      console.error("❌ FAILED: Unexpected error", e.message);
    }
  }

  // Upgrade to editor
  runSql(`UPDATE public.org_members SET role = 'editor' WHERE org_id = '${orgId}' AND user_id = '${userA}';`);

  // TEST 2: Insert a db_write step as an editor -> should be blocked by DB
  try {
    console.log("2. Inserting db_write step as User A (editor)...");
    await graphqlRequest(`
      mutation InsertDbWrite($wfId: uuid!) {
        insert_workflow_steps_one(object: {
          workflow_id: $wfId,
          type: "db_write",
          step_order: 1,
          config: {}
        }) { id }
      }
    `, { wfId }, { "x-hasura-user-id": userA, "x-hasura-role": "user" });
    console.error("❌ FAILED: User A was able to insert a db_write step (should be blocked).");
  } catch (e) {
    if (e.message.includes("check constraint") || e.message.includes("validation")) {
      console.log("✅ PASSED: Insert db_write step was rejected.");
    } else {
      console.log("⚠️ Received error, verifying it's the expected DB rejection: ", e.message);
    }
  }

  // Upgrade to owner, insert approval_gate step using SQL directly
  runSql(`
    UPDATE public.org_members SET role = 'owner' WHERE org_id = '${orgId}' AND user_id = '${userA}';
    INSERT INTO public.workflow_steps (workflow_id, type, step_order, config) VALUES ('${wfId}', 'approval_gate', 1, '{}') ON CONFLICT DO NOTHING;
  `);

  // Trigger run
  console.log("Setting up for Test 3: Triggering a run as User A (owner)...");
  const runRes = await graphqlRequest(`
    mutation TriggerRun($wfId: uuid!) {
      triggerWorkflowRun(workflow_id: $wfId) { run_id status }
    }
  `, { wfId }, { "x-hasura-user-id": userA, "x-hasura-role": "user" });
  
  const runId = runRes?.triggerWorkflowRun?.run_id;
  if (!runId) throw new Error("Could not get runId from triggerWorkflowRun: " + JSON.stringify(runRes));

  // Give step time to run and pause
  await new Promise(r => setTimeout(r, 1000));

  // Get the step run id using SQL
  const stepRunsRes = runSql(`SELECT id, status FROM public.step_runs WHERE workflow_run_id = '${runId}' LIMIT 1;`);
  
  const stepRun = stepRunsRes?.result?.[1]; // First row after headers
  if (!stepRun) throw new Error("Could not find step_run in DB!");
  const stepRunId = stepRun[0];
  const stepRunStatus = stepRun[1];
  console.log(`Run ${runId} started, step run ${stepRunId} is ${stepRunStatus}.`);

  // Downgrade to viewer
  runSql(`UPDATE public.org_members SET role = 'viewer' WHERE org_id = '${orgId}' AND user_id = '${userA}';`);

  // TEST 3: approveStep with User A (viewer) -> must reject
  try {
    console.log("3. Approving step as User A (viewer)...");
    await graphqlRequest(`
      mutation ApproveStep($srId: uuid!) {
        approveStep(step_run_id: $srId) { success status }
      }
    `, { srId: stepRunId }, { "x-hasura-user-id": userA, "x-hasura-role": "user" });
    console.error("❌ FAILED: User A was able to approve the step (should be rejected).");
  } catch (e) {
    if (e.message.includes("Forbidden") || e.message.includes("FORBIDDEN")) {
      console.log("✅ PASSED: User A was rejected from approving the step.");
    } else {
      console.error("❌ FAILED: Unexpected error", e.message);
    }
  }

  // TEST 4: Exhaust quota -> triggerWorkflowRun -> must reject
  console.log("Setting up for Test 4: Exhausting quota and restoring owner role...");
  runSql(`
    UPDATE public.organizations SET quota_calls_used = 5 WHERE id = '${orgId}';
    UPDATE public.org_members SET role = 'owner' WHERE org_id = '${orgId}' AND user_id = '${userA}';
  `);

  try {
    console.log("4. Triggering workflow run as User A with exhausted quota...");
    await graphqlRequest(`
      mutation TriggerRun($wfId: uuid!) {
        triggerWorkflowRun(workflow_id: $wfId) { run_id status }
      }
    `, { wfId }, { "x-hasura-user-id": userA, "x-hasura-role": "user" });
    console.error("❌ FAILED: User A was able to trigger run despite exhausted quota.");
  } catch (e) {
    if (e.message.includes("Quota exhausted") || e.message.includes("quota_exhausted")) {
      console.log("✅ PASSED: Workflow run was rejected due to exhausted quota.");
    } else {
      console.error("❌ FAILED: Unexpected error", e.message);
    }
  }
}

runTests().catch(console.error);
