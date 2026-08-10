# Vocallabs Workflow Builder

Vocallabs Workflow Builder is a full-stack, state-machine driven automation platform. It allows users to build, execute, and monitor complex AI-powered workflows with a clean, premium "Calm Light" aesthetic. 

Built with **Next.js**, **Apollo Client (GraphQL)**, **Nhost/Hasura**, and **Groq**.

## Features

- **Dynamic Execution Engine:** A fully realized state machine capable of sequential step execution, condition evaluation, external HTTP requests, and blocking on manual human approvals (`approval_gate`).
- **AI-Powered:** Native integration with Groq's high-speed Llama 3.1 models for instant AI summary and processing steps within the pipeline.
- **Real-Time UI:** Live streaming of execution status via GraphQL Subscriptions (WebSocket). Users can watch steps transition from `pending` -> `running` -> `succeeded` in real time.
- **Premium Design System:** A custom "Calm Light" mode leveraging TailwindCSS, frosted glass effects (`backdrop-blur`), subtle glowing shadows, and Feather icons for a top-tier SaaS feel.
- **Webhook Integration:** External services can trigger workflow runs securely by passing their `workflow_id` and the `x-hasura-admin-secret` to the dedicated Nhost serverless function webhook endpoint.
- **Multi-Tenant Permissions:** Role-based access controls ensuring only Owners and Editors within an Organization can trigger or modify workflows. 

## Technology Stack

### Frontend
- **Framework:** Next.js 14 (App Router)
- **Styling:** TailwindCSS & React Icons (Feather)
- **Data Fetching:** Apollo GraphQL Client (Queries, Mutations, Subscriptions)
- **State Management:** React hooks
- **Authentication:** Nhost React SDK

### Backend
- **BaaS:** Nhost (PostgreSQL, Hasura GraphQL Engine, Auth, Storage)
- **Serverless Functions:** Node.js (Express) deployed via Nhost Functions
- **LLM Provider:** Groq (Llama-3.1-8b-instant)

## Deployment & Architecture

The application is deployed across two main cloud providers:

- **Frontend (Vercel)**: The Next.js app is hosted on Vercel. It dynamically connects to the Nhost Cloud backend via environment variables (`NEXT_PUBLIC_NHOST_SUBDOMAIN` and `NEXT_PUBLIC_NHOST_REGION`).
- **Backend (Nhost Cloud)**: The PostgreSQL database, Hasura GraphQL engine, and Serverless Functions (Node.js) are hosted on Nhost Cloud.

### Configuring Secrets (Cloud)
To add API keys (e.g., `LLM_API_KEY`) to the live application:
1. Go to the Nhost Dashboard -> Settings -> Secrets.
2. Add your secret (e.g., `LLM_API_KEY`).
3. Ensure the secret is mapped in `nhost/nhost.toml` under `[[global.environment]]`.

## Local Development

### Prerequisites
- Node.js (v18+)
- Nhost CLI (`nhost`)
- Docker Desktop

### 1. Start the Backend
Navigate to the root directory and start the local Nhost environment:
```bash
nhost up
```

### 2. Configure Environment Variables
In `frontend/.env.development`:
```env
NEXT_PUBLIC_NHOST_SUBDOMAIN=local
NEXT_PUBLIC_NHOST_REGION=local
```
Locally, you can create a `.secrets` file in the root to mock Nhost Secrets:
```env
LLM_API_KEY=your-groq-api-key-here
```

### 3. Start the Frontend
Navigate into the frontend directory and run the Next.js development server:
```bash
cd frontend
npm install
npm run dev
```

### 4. Trigger a Webhook Locally
You can trigger a workflow programmatically via the local webhook function:
```bash
curl -k -X POST https://local.functions.local.nhost.run/v1/webhook \
  -H "Content-Type: application/json" \
  -H "x-hasura-admin-secret: nhost-admin-secret" \
  -d '{"workflow_id": "<YOUR_WORKFLOW_ID>"}'
```

## Database Schema (Key Tables)
- `organizations`, `org_members`: Multi-tenancy and permissions structure.
- `workflows`: Holds the main configuration for an automation pipeline.
- `workflow_steps`: Defines individual blocks inside a workflow (e.g. `http_request`, `llm_call`, `approval_gate`, `conditional_branch`).
- `workflow_runs`: A single execution instance of a workflow.
- `step_runs`: The execution result and output payload for a specific block in a specific run.

## License
Private Property - Vocallabs
