# Proposal: Self-Bootstrapping CI/CD Pipeline for Elevator

**Status:** Implemented (decisions D1–D3, D5 applied; D4 = hand-rolled pipeline).
**Author:** (you)
**Scope:** Add a one-time, terminal-driven bootstrap that provisions a CodePipeline
which builds and deploys Elevator from GitHub, reading its configuration from AWS
instead of from a local file.

**Where it landed:**
- `cdk/lib/pipeline-stack.ts` — multi-stage, self-mutating pipeline; config read from
  SSM at run time; prod manual-approval gate; optional non-prod stage (synth toggle).
- `cdk/bin/cdk.ts` — pipeline decoupled from app-config env vars.
- `deployment/bootstrap.sh` — the one-time command.
- `deployment/config-put.sh` — write/update an env's SSM config.
- `deployment/create-pipeline.sh` — now a thin alias to `bootstrap.sh`.
- `deployment/00-params-template.sh`, `deployment/README.md` — docs + `ELEVATOR_NONPROD_ENV`.

---

## 1. Goal

> The user runs **one command from the terminal, once**. It saves whatever the
> pipeline needs into AWS. From then on, a **CodePipeline** deploys (and updates
> itself and the app) straight from GitHub — no local scripts, no local params.

Concretely:

- A **single `elevator bootstrap` command** captures configuration, persists it in
  AWS, sets up the GitHub source connection, and deploys the pipeline stack.
- The pipeline **reads its configuration from AWS at run time** (SSM Parameter
  Store / Secrets Manager), so operators change a setting once in AWS and the next
  run picks it up — no pipeline redeploy.
- The pipeline is **idempotent and self-updating**: re-running bootstrap *updates*
  the pipeline; pushing a change to the pipeline definition makes the pipeline
  update itself before deploying the app.

## 2. Where we are today

Elevator already has most of the pieces, wired for a **manual** flow:

| Piece | File | What it does |
|-------|------|--------------|
| Params | `deployment/00-params.sh` (git-ignored) | Local shell file with all config as `export`s |
| App deploy | `deployment/03-deploy.sh` | `cdk deploy ElevatorStack-$ENV` (creates the IdC SAML app via a custom resource), then frontend |
| Frontend deploy | `deployment/deploy-frontend.sh` + `generate-config.py` | Reads stack outputs → `src/config.json` → `npm run build` → `s3 sync` → CloudFront invalidation |
| Pipeline (scaffold) | `cdk/lib/pipeline-stack.ts` + `deployment/create-pipeline.sh` | CodeConnections GitHub source + one CodeBuild "Deploy" stage |

**The existing pipeline scaffold's limitations** (what this proposal changes):

1. Config values are passed as **CodeBuild environment variables baked into the
   stack** — updating a value requires `cdk deploy` of the pipeline again.
2. `triggerOnPush: false` — pushes do **not** trigger a deploy.
3. The GitHub connection requires a **manual console approval** (unavoidable — see
   §5), but nothing captures/records the approved ARN for reuse.
4. IAM is broad (`cloudformation:*`, `s3:*`).
5. The pipeline does **not** update itself when its own definition changes.

## 3. Proposed architecture

A **single multi-stage pipeline**. The non-prod stage is **optional and off by
default** (added at synth time only when a non-prod env is configured). Prod is
always gated by a **manual approval**.

```
   ┌──────────────────────────── one time, from a laptop ────────────────────────────┐
   │  ./deployment/bootstrap.sh                                                      │
   │   1. collect/confirm config (envs, IdC groups, region, domain, repo, branch)     │
   │   2. cdk bootstrap  (if the account isn't CDK-bootstrapped yet)                   │
   │   3. put config  → SSM Parameter Store   /elevator/<env>/config/*                 │
   │   4. create GitHub CodeConnections connection → store ARN in SSM                  │
   │        └─ print console URL; user clicks "Approve" once (no long-lived creds)     │
   │   5. cdk deploy ElevatorPipeline   (deploys OR updates the pipeline)              │
   └──────────────────────────────────────────────────────────────────────────────────┘
                                          │
                                          ▼
   ┌──────────────────────────── runs in AWS on every push ───────────────────────────┐
   │  CodePipeline  elevator                                                            │
   │                                                                                    │
   │  [Source]         GitHub (approved CodeConnections)  ── push to <branch> ───────▶ │
   │                                                                                    │
   │  [UpdatePipeline] cdk deploy ElevatorPipeline           ← self-mutation            │
   │                                                                                    │
   │  [Deploy-NonProd] (OPTIONAL — omitted unless a non-prod env is configured)         │
   │     • read SSM /elevator/<nonprod>/config/*                                        │
   │     • cdk deploy ElevatorStack-<nonprod> → frontend build/sync/invalidate          │
   │                                                                                    │
   │  [Approve-Prod]   Manual approval  (ALWAYS present)                                 │
   │                                                                                    │
   │  [Deploy-Prod]                                                                      │
   │     • read SSM /elevator/<prod>/config/*                                            │
   │     • cdk deploy ElevatorStack-<prod> (infra + IdC SAML custom resource)            │
   │     • generate-config.py → npm run build → s3 sync → CloudFront invalidation        │
   └────────────────────────────────────────────────────────────────────────────────────┘
```

### 3.1 Where values live in AWS

| Value | Store | Path | Read by |
|-------|-------|------|---------|
| `ELEVATOR_ADMIN_GROUP`, `ELEVATOR_AUDITOR_GROUP`, `ELEVATOR_IDC_ACCESS_GROUP`, `IDC_REGION`, `ELEVATOR_CUSTOM_DOMAIN`, `ELEVATOR_ALLOW_LOCALHOST` | **SSM Parameter Store** (String) | `/elevator/<env>/config/<KEY>` | CodeBuild at run time |
| GitHub `owner`, `repo`, `branch` | **SSM Parameter Store** | `/elevator/<env>/pipeline/<key>` | Pipeline stack at deploy time |
| CodeConnections connection ARN | **SSM Parameter Store** | `/elevator/<env>/pipeline/connectionArn` | Pipeline stack at deploy time |
| Future secrets (e.g. BetterStack on-call token) | **Secrets Manager** | `/elevator/<env>/secrets/<name>` | App at run time / CodeBuild |

Rationale for the split:
- **App config → SSM, read in the buildspec at run time.** This is the core of the
  ask: change a group name in SSM, and the *next* pipeline run uses it with no
  pipeline redeploy.
- **Pipeline shape (repo/owner/branch/connection) → SSM, read at deploy time.**
  These define the pipeline itself, so they naturally apply when the pipeline is
  (re)deployed by bootstrap or by self-mutation.
- **Secrets → Secrets Manager**, never SSM String / never env vars in the template.

### 3.2 Self-mutation ("deploys **or** updates")

Add an **`UpdatePipeline`** stage as the first post-source stage. It runs
`cdk deploy ElevatorPipeline-<env>` against the checked-out source, so any change to
`pipeline-stack.ts` or the buildspec is applied to the pipeline **before** the app
deploy runs. This mirrors what `aws-cdk-lib/pipelines` does natively (see §7 for the
"use CDK Pipelines instead" alternative).

Combined with `restartExecutionOnUpdate: true` (already set), a pipeline change and
an app change in the same push are applied consistently in one run.

### 3.3 Environments & stages (multi-stage, non-prod optional)

One pipeline promotes a single source revision through ordered stages. Each stage
targets an **environment** with its own SSM config namespace (`/elevator/<env>/config/*`)
and its own `ElevatorStack-<env>`.

- **Prod stage — always present.** Preceded by a **manual approval** action (decision
  **D3**, decided: prod is always gated). Nothing reaches prod without a human click.
- **Non-prod stage — optional, disabled by default.** It is added to the pipeline
  **only when a non-prod env is configured** (e.g. `ELEVATOR_NONPROD_ENV=staging` is
  set at pipeline-deploy time). With it unset, the pipeline synthesizes to just
  Source → UpdatePipeline → Approve-Prod → Deploy-Prod — the non-prod stage does not
  exist in the pipeline at all (a clean synth-time toggle, not a disabled/skipped
  action). When enabled, it runs **before** the prod approval, so a change is proven
  in non-prod first, then a human promotes it to prod.

Environments may live in the **same account** (default; distinct env-suffixed stack
names) or in **separate accounts** (cross-account: requires
`cdk bootstrap --trust <pipeline-account>` on each target and cross-account deploy
roles). Default and initial target: same account, prod only.

Enabling non-prod later is just: write `/elevator/staging/config/*` to SSM and re-run
`bootstrap.sh` with the non-prod env set — the pipeline self-updates to include the
new stage.

## 4. The one-time command

Two equally viable forms — see decision **D1**:

- **(A) Shell entry point** `deployment/bootstrap.sh` (fits the existing
  `deployment/*.sh` style, minimal new tooling), or
- **(B) A thin `elevator` CLI** (`npx elevator bootstrap`) wrapping the same steps
  for a nicer UX.

Either way the flow is:

```bash
# First run on a fresh account
./deployment/bootstrap.sh
#   → prompts for (or reads from flags/env) the config
#   → cdk bootstrap                              (skipped if already bootstrapped)
#   → writes /elevator/prod/config/* to SSM
#   → creates the GitHub connection, prints the approval URL
#   → cdk deploy ElevatorPipeline-prod
#
# One manual click: approve the GitHub connection in the console (§5)
#
# Re-run any time to change pipeline shape or push new config — it's idempotent:
./deployment/bootstrap.sh --set ELEVATOR_ALLOW_LOCALHOST=false
```

Idempotency: SSM `put-parameter --overwrite` is an upsert; an existing approved
connection is detected and reused; `cdk deploy` updates the stack in place.

## 5. The unavoidable manual step (and how we minimize it)

AWS **CodeConnections (formerly CodeStar Connections)** to GitHub cannot be fully
automated: the connection is created in `PENDING` state and a human must complete the
GitHub OAuth/App handshake once in the console. We handle this cleanly:

- Bootstrap **creates** the connection and **stores its ARN in SSM**.
- Bootstrap **prints the exact approval URL** and polls
  `get-connection` until status is `AVAILABLE` (or exits with clear instructions).
- On subsequent runs the connection already exists and is reused — the click never
  repeats.

**Decided (D2):** we keep the one-click CodeConnections approval and use **no
long-lived credentials**. The GitHub App / PAT-in-Secrets-Manager alternative (which
would remove the click at the cost of a long-lived, rotatable credential) is
explicitly **rejected**.

## 6. Security & IAM

- **Scope the CodeBuild role down** from `cloudformation:*` / `s3:*` to:
  - `sts:AssumeRole` on `cdk-*-{account}-{region}` (deploys run through the CDK
    bootstrap execution role, which already holds the privileged
    `sso:*` / `organizations:*` / `identitystore:*` needed by the SAML custom
    resource — CodeBuild itself does not need those directly).
  - `ssm:GetParameter*` on `/elevator/<env>/*` only.
  - `s3:*` limited to the website bucket ARN; `cloudfront:CreateInvalidation` on the
    distribution.
  - `secretsmanager:GetSecretValue` on `/elevator/<env>/secrets/*` (if used).
- **No secrets in the pipeline template or in SSM String parameters.** Secrets live in
  Secrets Manager and are referenced, never inlined.
- Encrypt SSM `SecureString` where appropriate; enable CloudTrail on the parameter
  paths (Elevator already runs CloudTrail Lake).
- **Prod always has a manual-approval action before its Deploy stage** (decided,
  **D3**). The optional non-prod stage has no approval gate — it deploys automatically
  when present, so prod approval doubles as the promotion gate.

## 7. Alternative considered: `aws-cdk-lib/pipelines` (CDK Pipelines)

CDK Pipelines gives self-mutation, asset publishing, and multi-account/stage support
out of the box, and would replace the hand-rolled `codepipeline.Pipeline`.

- **Pro:** less bespoke code; self-mutation and ordering handled for us.
- **Con:** it's opinionated around a pure `cdk synth` → deploy model. Elevator's deploy
  is **not** pure CDK — it has imperative post-steps (frontend `generate-config.py`,
  `npm build`, `s3 sync`, CloudFront invalidation) and a stateful IdC SAML custom
  resource. These fit as a CDK Pipelines `ShellStep`/`Wave`, but the mapping is less
  direct than keeping the current explicit CodeBuild buildspec.

**Recommendation:** keep the hand-rolled pipeline (small, explicit, already written)
and add the `UpdatePipeline` stage + SSM-config wiring. Revisit CDK Pipelines if/when
we add multiple environments or cross-account deploys. (Decision **D4**.)

## 8. Changes required (by file)

- `cdk/lib/pipeline-stack.ts`
  - Read `owner`/`repo`/`branch`/`connectionArn` from SSM
    (`StringParameter.valueForStringParameter`) instead of props/env vars.
  - Replace baked config env vars with a buildspec `pre_build` step that pulls
    `/elevator/<env>/config/*` from SSM and exports them — a **shared, parameterized
    CodeBuild deploy step** reused per environment (env name is the only difference).
  - Add the **`UpdatePipeline`** stage (`cdk deploy ElevatorPipeline`).
  - **Prod stage** = a `ManualApprovalAction` + the deploy step for the prod env
    (always present).
  - **Non-prod stage** = added **only if** a non-prod env is configured
    (`ELEVATOR_NONPROD_ENV`); otherwise not synthesized at all. Runs before the prod
    approval.
  - Set the source action to `triggerOnPush: true`.
  - Tighten the IAM policy statements (§6).
- `deployment/bootstrap.sh` (new) — the one-time shell command (§4). Decided (**D1**):
  a **shell script**, consistent with the existing `deployment/*.sh` flow.
- `deployment/00-params-template.sh` — keep as the *input* to bootstrap; add the
  optional `ELEVATOR_NONPROD_ENV`; document that after bootstrap, AWS (SSM) is the
  source of truth, not this file.
- `deployment/create-pipeline.sh` — fold into `bootstrap.sh` or keep as a thin alias.
- `deployment/README.md` — add a "CI/CD via pipeline" section.
- (Optional) `deployment/config-set.sh` — helper to change a single SSM config value.

## 9. Rollout plan

1. **Phase 1 — State in AWS, prod only.** Add SSM parameters + `bootstrap.sh` that
   writes them; a single prod stage (Source → Deploy-Prod) reads config from SSM in the
   buildspec. Prove a push deploys the app.
2. **Phase 2 — Self-mutation + prod gate.** Add the `UpdatePipeline` stage and the
   always-on prod manual-approval action; verify a change to `pipeline-stack.ts`
   applies itself on the next push.
3. **Phase 3 — Optional non-prod stage.** Add the synth-time toggle
   (`ELEVATOR_NONPROD_ENV`) that inserts a Deploy-NonProd stage before the prod
   approval; verify it's absent when unset.
4. **Phase 4 — Hardening.** Scope IAM down, move any secrets to Secrets Manager,
   document rotation, and (optional) cross-account targets via `cdk bootstrap --trust`.

## 10. Decisions

- **D1 — DECIDED: shell script.** The one-time command is `deployment/bootstrap.sh`,
  consistent with the existing scripts. No new CLI tooling.
- **D2 — DECIDED: manual, no long-lived creds.** Keep the one-click CodeConnections
  approval; reject the GitHub App/PAT alternative.
- **D3 — DECIDED: prod always manual.** A manual-approval action always precedes the
  prod Deploy stage.
- **D5 — DECIDED: single multi-stage pipeline.** Non-prod stage is optional and
  disabled by default (synth-time toggle); prod stage always present, gated by the D3
  approval.
- **D4 — OPEN (recommended: keep hand-rolled).** A single multi-stage pipeline with an
  optional stage and a manual gate is straightforward to express with the hand-rolled
  `codepipeline.Pipeline` we already have, so the recommendation stands. Confirm, or
  choose `aws-cdk-lib/pipelines` (§7).

## 11. Open risks / notes

- **Bootstrap ordering / chicken-and-egg.** The very first deploy of `ElevatorStack`
  can be done either by the pipeline (Deploy stage) or once locally by bootstrap. The
  IdC SAML custom resource is stateful — running it from both the pipeline and a local
  `03-deploy.sh` against the same env must be avoided. Recommendation: after bootstrap,
  the pipeline is the **only** deployer for that env.
- **CDK bootstrap privileges.** The pipeline relies on the CDK execution role having
  the privileges the SAML custom resource needs (`sso:*`). If the account uses a
  custom/scoped CDK bootstrap policy, confirm those actions are permitted.
- **Delegated admin.** For member-account deploys, `01-delegate.sh` must still be run
  once from the org management account (unchanged by this proposal).
