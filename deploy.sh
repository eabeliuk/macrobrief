#!/usr/bin/env bash
#
# Deploy MacroBrief to GCP via Cloud Build.
#
# Usage:
#   ./deploy.sh                 # build + migrate + deploy to Cloud Run
#   ./deploy.sh --setup         # ONE-TIME: enable APIs, create AR repo, grant IAM
#   ./deploy.sh --setup-sql     # ONE-TIME: create the Cloud SQL instance (COSTS MONEY)
#   ./deploy.sh --secrets       # list which required secrets exist and which don't
#   ./deploy.sh --map-domain    # ONE-TIME: map macrobrief.com + www to the service
#   ./deploy.sh --scheduler     # ONE-TIME: Cloud Scheduler → /api/cron every 10 min
#   ./deploy.sh --dry-run       # print the command without running it
#   ./deploy.sh --extra-args …  # pass anything else through to gcloud builds submit
#
# Project ID is hard-coded so you cannot deploy to the wrong GCP.

set -euo pipefail

# ── Configuration ─────────────────────────────────────────────────────
PROJECT_ID="macrobrief"
REGION="us-central1"
REPO="macrobrief"
SERVICE="macrobrief-web"
SQL_INSTANCE_NAME="macrobrief-db"
DB_NAME="macrobrief"
CLOUDBUILD_CONFIG="cloudbuild.yaml"
DOMAIN="macrobrief.com"
SCHEDULER_JOB="macrobrief-cron"

# Every secret cloudbuild.yaml wires into the service. A deploy fails if one is
# missing, so --secrets tells you before you burn a build.
REQUIRED_SECRETS=(
  macrobrief-database-url
  macrobrief-auth-secret
  macrobrief-google-id
  macrobrief-google-secret
  macrobrief-resend-key
  macrobrief-anthropic-key
  macrobrief-cron-secret
  macrobrief-super-admins
)

# ── Helpers ───────────────────────────────────────────────────────────
GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; NC='\033[0m'
info() { echo -e "${GREEN}[INFO]${NC} $*"; }
warn() { echo -e "${YELLOW}[WARN]${NC} $*"; }
fail() { echo -e "${RED}[ERROR]${NC} $*" >&2; exit 1; }

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

# --help must work anywhere, including where gcloud is not installed.
case "${1:-}" in --help|-h) sed -n '3,19p' "$0" | sed 's/^# \?//'; exit 0 ;; esac

# A non-interactive shell often has a thinner PATH than the one gcloud was
# installed onto, which fails here as "not installed" and sends you looking for
# the wrong problem.
if ! command -v gcloud >/dev/null 2>&1; then
  for dir in /opt/homebrew/bin /usr/local/bin "$HOME/google-cloud-sdk/bin"; do
    [ -x "$dir/gcloud" ] && PATH="$dir:$PATH" && break
  done
fi
command -v gcloud >/dev/null 2>&1 || fail "gcloud CLI not installed. https://cloud.google.com/sdk/docs/install"
[ -f "$CLOUDBUILD_CONFIG" ] || fail "Missing $CLOUDBUILD_CONFIG — run from the repo root."

ACTIVE_PROJECT="$(gcloud config get-value project 2>/dev/null || true)"
if [ -n "$ACTIVE_PROJECT" ] && [ "$ACTIVE_PROJECT" != "$PROJECT_ID" ]; then
  warn "Active gcloud project is '$ACTIVE_PROJECT' but this deploys to '$PROJECT_ID'."
  warn "Cloud Build uses --project so it's fine; just be aware for follow-up commands."
fi

# ── One-time project setup ────────────────────────────────────────────
do_setup() {
  info "Enabling required APIs on ${PROJECT_ID}…"
  gcloud services enable \
    run.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com \
    sqladmin.googleapis.com secretmanager.googleapis.com \
    --project="$PROJECT_ID"

  # Enablement is eventually consistent: the create below fails with
  # SERVICE_DISABLED for a minute or two after `services enable` returns.
  local tries=0
  until gcloud artifacts repositories list --location="$REGION" --project="$PROJECT_ID" >/dev/null 2>&1; do
    tries=$((tries + 1))
    [ "$tries" -gt 10 ] && fail "Artifact Registry API still not live after ~2min. Re-run --setup."
    info "Waiting for the Artifact Registry API to propagate… ($tries/10)"
    sleep 12
  done

  if gcloud artifacts repositories describe "$REPO" \
       --location="$REGION" --project="$PROJECT_ID" >/dev/null 2>&1; then
    info "Artifact Registry repo '$REPO' already exists."
  else
    info "Creating Artifact Registry repo '$REPO'…"
    gcloud artifacts repositories create "$REPO" \
      --repository-format=docker --location="$REGION" \
      --description="MacroBrief container images" --project="$PROJECT_ID"
  fi

  local projnum cb_sa compute_sa
  projnum="$(gcloud projects describe "$PROJECT_ID" --format='value(projectNumber)')"
  cb_sa="${projnum}@cloudbuild.gserviceaccount.com"
  compute_sa="${projnum}-compute@developer.gserviceaccount.com"

  info "Granting Cloud Build SA ($cb_sa) run.admin + serviceAccountUser…"
  gcloud projects add-iam-policy-binding "$PROJECT_ID" \
    --member="serviceAccount:${cb_sa}" --role="roles/run.admin" --condition=None -q >/dev/null
  gcloud projects add-iam-policy-binding "$PROJECT_ID" \
    --member="serviceAccount:${cb_sa}" --role="roles/iam.serviceAccountUser" --condition=None -q >/dev/null
  gcloud projects add-iam-policy-binding "$PROJECT_ID" \
    --member="serviceAccount:${cb_sa}" --role="roles/cloudsql.client" --condition=None -q >/dev/null

  # Cloud Build runs as the COMPUTE service account by default now, not as
  # <projnum>@cloudbuild — so this account needs the deploy roles too, or the
  # rollout fails on setIamPolicy. Both are granted; whichever runs, it works.
  info "Granting the runtime/build SA ($compute_sa) deploy + secret access…"
  gcloud projects add-iam-policy-binding "$PROJECT_ID" \
    --member="serviceAccount:${compute_sa}" --role="roles/run.admin" --condition=None -q >/dev/null
  gcloud projects add-iam-policy-binding "$PROJECT_ID" \
    --member="serviceAccount:${compute_sa}" --role="roles/iam.serviceAccountUser" --condition=None -q >/dev/null
  gcloud projects add-iam-policy-binding "$PROJECT_ID" \
    --member="serviceAccount:${compute_sa}" --role="roles/secretmanager.secretAccessor" --condition=None -q >/dev/null
  gcloud projects add-iam-policy-binding "$PROJECT_ID" \
    --member="serviceAccount:${compute_sa}" --role="roles/cloudsql.client" --condition=None -q >/dev/null

  info "Setup complete. Next: ./deploy.sh --setup-sql, then create the secrets, then ./deploy.sh"
}

# ── Cloud SQL (separate: this one costs money) ────────────────────────
do_setup_sql() {
  if gcloud sql instances describe "$SQL_INSTANCE_NAME" --project="$PROJECT_ID" >/dev/null 2>&1; then
    info "Cloud SQL instance '$SQL_INSTANCE_NAME' already exists."
  else
    warn "Creating a Cloud SQL instance. This provisions billable infrastructure."
    read -r -p "Continue? [y/N] " reply
    [ "$reply" = "y" ] || [ "$reply" = "Y" ] || fail "Aborted."

    info "Creating Cloud SQL Postgres 16 instance '$SQL_INSTANCE_NAME'…"
    # Postgres 16 now defaults to the ENTERPRISE_PLUS edition, which rejects
    # shared-core tiers. Ask for ENTERPRISE explicitly so db-f1-micro is legal.
    gcloud sql instances create "$SQL_INSTANCE_NAME" \
      --project="$PROJECT_ID" --region="$REGION" \
      --database-version=POSTGRES_16 --edition=ENTERPRISE --tier=db-f1-micro \
      --storage-size=10GB --storage-auto-increase \
      --backup --backup-start-time=07:00
  fi

  gcloud sql databases describe "$DB_NAME" --instance="$SQL_INSTANCE_NAME" --project="$PROJECT_ID" >/dev/null 2>&1 \
    || gcloud sql databases create "$DB_NAME" --instance="$SQL_INSTANCE_NAME" --project="$PROJECT_ID"

  local conn
  conn="$(gcloud sql instances describe "$SQL_INSTANCE_NAME" --project="$PROJECT_ID" --format='value(connectionName)')"
  info "Connection name: ${conn}"
  echo
  info "Now create the app user and store the URL as a secret:"
  cat <<HELP

  gcloud sql users create macrobrief --instance=${SQL_INSTANCE_NAME} \\
    --password='<PICK-A-STRONG-ONE>' --project=${PROJECT_ID}

  printf 'postgresql://macrobrief:<PASSWORD>@localhost/${DB_NAME}?host=/cloudsql/${conn}' \\
    | gcloud secrets create macrobrief-database-url --data-file=- --project=${PROJECT_ID}

HELP
}

# ── Secret inventory ──────────────────────────────────────────────────
do_secrets() {
  local missing=0
  info "Checking Secret Manager on ${PROJECT_ID}…"
  for name in "${REQUIRED_SECRETS[@]}"; do
    # A secret with no version is useless to Cloud Run — `:latest` fails to
    # resolve and the rollout dies. Check the version, not the container.
    if gcloud secrets versions describe latest --secret="$name" \
         --project="$PROJECT_ID" >/dev/null 2>&1; then
      echo -e "  ${GREEN}✓${NC} $name"
    elif gcloud secrets describe "$name" --project="$PROJECT_ID" >/dev/null 2>&1; then
      echo -e "  ${YELLOW}—${NC} $name (exists, no value yet — will be skipped at deploy)"
    else
      echo -e "  ${RED}✗${NC} $name (does not exist)"
      missing=$((missing + 1))
    fi
  done

  if [ "$missing" -gt 0 ]; then
    echo
    warn "$missing secret(s) do not exist. Create one with:"
    echo "    printf '<VALUE>' | gcloud secrets versions add <NAME> --data-file=- --project=${PROJECT_ID}"
    echo
    warn "DATABASE_URL and AUTH_SECRET are required; the rest each switch a feature on."
    warn "The rest are optional — a secret with no value is skipped at deploy time and the"
    warn "app treats that feature as unconfigured."
  else
    info "Every required secret has a value."
  fi
}

# ── Custom domain ─────────────────────────────────────────────────────
#
# Cloud Run maps domains directly — no load balancer. The apex needs the domain
# verified under this account first (Search Console), which cannot be scripted;
# `gcloud domains verify` opens the page that issues the TXT record.
do_map_domain() {
  if ! gcloud domains list-user-verified --format='value(id)' 2>/dev/null | grep -qx "$DOMAIN"; then
    warn "${DOMAIN} is not verified for this account yet."
    echo
    echo "  1. gcloud domains verify ${DOMAIN}"
    echo "     Add the TXT record it gives you at GoDaddy (host '@'), then confirm in the page."
    echo "  2. Re-run: ./deploy.sh --map-domain"
    echo
    fail "Verify the domain first — an apex mapping cannot be created without it."
  fi

  gcloud run services describe "$SERVICE" --project="$PROJECT_ID" --region="$REGION" >/dev/null 2>&1 \
    || fail "Service ${SERVICE} does not exist yet. Deploy once, then map the domain."

  for d in "$DOMAIN" "www.${DOMAIN}"; do
    if gcloud beta run domain-mappings describe --domain="$d" --project="$PROJECT_ID" --region="$REGION" >/dev/null 2>&1; then
      info "${d} is already mapped."
    else
      info "Mapping ${d} → ${SERVICE}…"
      gcloud beta run domain-mappings create --domain="$d" --service="$SERVICE" \
        --project="$PROJECT_ID" --region="$REGION"
    fi
  done

  echo
  info "DNS to set at GoDaddy (nameservers are domaincontrol.com):"
  cat <<'DNS'

  Apex — four A records, host "@":
    216.239.32.21   216.239.34.21   216.239.36.21   216.239.38.21
  Apex — four AAAA records, host "@":
    2001:4860:4802:32::15   2001:4860:4802:34::15
    2001:4860:4802:36::15   2001:4860:4802:38::15
  www — CNAME:  host "www"  →  ghs.googlehosted.com.

  Delete GoDaddy's parking A record first, or it will keep answering.
  Managed TLS provisions once DNS resolves — usually ~15 minutes, sometimes hours.

DNS
  info "Then check: gcloud beta run domain-mappings describe --domain=${DOMAIN} --project=${PROJECT_ID} --region=${REGION}"
}

# ── Scheduled jobs ────────────────────────────────────────────────────
#
# One endpoint drives live-class reminders, the Monday digest, MicroRetention
# and the application-fee resync. Every job inside it is idempotent, so a
# ten-minute cadence is safe and a missed run is recoverable.
do_scheduler() {
  gcloud services enable cloudscheduler.googleapis.com --project="$PROJECT_ID"

  # Enablement is eventually consistent: the first call after it returns can
  # still fail with SERVICE_DISABLED for a minute or two.
  local tries=0
  until gcloud scheduler jobs list --location="$REGION" --project="$PROJECT_ID" >/dev/null 2>&1; do
    tries=$((tries + 1))
    [ "$tries" -ge 10 ] && fail "Cloud Scheduler API still not available after ${tries} tries."
    info "Waiting for the Cloud Scheduler API to propagate… (${tries}/10)"
    sleep 10
  done

  local url secret
  url="$(gcloud run services describe "$SERVICE" --project="$PROJECT_ID" --region="$REGION" \
        --format='value(status.url)' 2>/dev/null || true)"
  [ -n "$url" ] || fail "Service ${SERVICE} does not exist yet. Deploy once, then run --scheduler."

  secret="$(gcloud secrets versions access latest --secret=macrobrief-cron-secret --project="$PROJECT_ID" 2>/dev/null || true)"
  [ -n "$secret" ] || fail "macrobrief-cron-secret has no value — /api/cron would reject every call."

  if gcloud scheduler jobs describe "$SCHEDULER_JOB" --location="$REGION" --project="$PROJECT_ID" >/dev/null 2>&1; then
    info "Updating scheduler job ${SCHEDULER_JOB}…"
    gcloud scheduler jobs update http "$SCHEDULER_JOB" --location="$REGION" --project="$PROJECT_ID" \
      --schedule="*/10 * * * *" --uri="${url}/api/cron" --http-method=GET \
      --update-headers="Authorization=Bearer ${secret}" --attempt-deadline=600s
  else
    info "Creating scheduler job ${SCHEDULER_JOB} (every 10 minutes)…"
    gcloud scheduler jobs create http "$SCHEDULER_JOB" --location="$REGION" --project="$PROJECT_ID" \
      --schedule="*/10 * * * *" --uri="${url}/api/cron" --http-method=GET \
      --headers="Authorization=Bearer ${secret}" --attempt-deadline=600s
  fi
  info "Scheduler wired to ${url}/api/cron"
}

# ── Argument parsing ──────────────────────────────────────────────────
DRY_RUN=false
EXTRA_ARGS=()
while [ $# -gt 0 ]; do
  case "$1" in
    --setup) do_setup; exit 0 ;;
    --setup-sql) do_setup_sql; exit 0 ;;
    --secrets) do_secrets; exit 0 ;;
    --map-domain) do_map_domain; exit 0 ;;
    --scheduler) do_scheduler; exit 0 ;;
    --dry-run) DRY_RUN=true; shift ;;
    --help|-h) sed -n '3,19p' "$0" | sed 's/^# \?//'; exit 0 ;;
    *) EXTRA_ARGS+=("$1"); shift ;;
  esac
done

# ── Build command ─────────────────────────────────────────────────────
CMD=(gcloud builds submit --config="$CLOUDBUILD_CONFIG" --project="$PROJECT_ID")
[ ${#EXTRA_ARGS[@]} -gt 0 ] && CMD+=("${EXTRA_ARGS[@]}")
CMD+=(.)

if [ "$DRY_RUN" = true ]; then
  info "Dry run — would execute:"; printf '  %q ' "${CMD[@]}"; echo; exit 0
fi

info "Submitting Cloud Build to project ${PROJECT_ID}…"
info "Pipeline: build → push → migrate (Cloud Run Job) → deploy. ~4–8 minutes."
"${CMD[@]}"

info "Deployed. Service URL:"
gcloud run services describe "$SERVICE" \
  --project="$PROJECT_ID" --region="$REGION" --format='value(status.url)' 2>/dev/null || true
