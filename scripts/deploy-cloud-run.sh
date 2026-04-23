#!/bin/bash
# ==============================================================================
# BlogsPro Sovereign AI Pipeline - Cloud Run Deployment Script
# ==============================================================================
# This script deploys the AI Swarm Pipeline as a Google Cloud Run Job.
# Unlike GKE, Cloud Run scales to zero and only bills during active execution.
#
# Prerequisite: Ensure your pipeline service account has the following IAM roles:
# - roles/aiplatform.user (For Vertex AI Model Garden)
# - roles/storage.objectAdmin (For GCS Archival)
# - roles/datastore.user (For Firestore)
# ==============================================================================

PROJECT_ID=$(gcloud config get-value project)
REGION="us-central1"
SERVICE_ACCOUNT="blogspro-sa@${PROJECT_ID}.iam.gserviceaccount.com"
IMAGE_URL="gcr.io/${PROJECT_ID}/blogspro-swarm:latest"

echo "🚀 Building Docker Image..."
# Build the container image via Cloud Build
gcloud builds submit --tag $IMAGE_URL .

echo "🚢 Deploying Daily Sovereign to Cloud Run Jobs..."
gcloud run jobs create blogspro-daily-sovereign \
  --image $IMAGE_URL \
  --region $REGION \
  --tasks 1 \
  --max-retries 1 \
  --task-timeout 30m \
  --service-account $SERVICE_ACCOUNT \
  --set-env-vars NODE_ENV=production,GOOGLE_CLOUD_PROJECT=$PROJECT_ID,GOOGLE_CLOUD_LOCATION=$REGION \
  --command node \
  --args scripts/lib/swarm-orchestrator.js,--mode=daily \
  --execute-now

echo "✅ Cloud Run integration deployed successfully!"
echo "To set up the scheduler, run:"
echo "gcloud scheduler jobs create http blogspro-daily-trigger \\"
echo "  --schedule=\"0 9 * * *\" \\"
echo "  --uri=\"https://${REGION}-run.googleapis.com/apis/run.googleapis.com/v1/namespaces/${PROJECT_ID}/jobs/blogspro-daily-sovereign:run\" \\"
echo "  --http-method=POST \\"
echo "  --oauth-service-account-email=$SERVICE_ACCOUNT"
