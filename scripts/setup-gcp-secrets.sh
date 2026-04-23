#!/bin/bash
# [V1.0] BlogsPro GCP Secret Synchronizer
# This script converts your .env into a Kubernetes Secret and uploads it to GKE.

NAMESPACE="blogspro-swarm"
SECRET_NAME="blogspro-secrets"

echo "🔐 BlogsPro Institutional Secret Sync [GKE]"
echo "------------------------------------------"

# 1. Check for kubectl
if ! command -v kubectl &> /dev/null; then
    echo "❌ Error: kubectl not found. Please install it or use the GCP Cloud Shell."
    exit 1
fi

# 2. Check for .env file
if [ ! -f .env ]; then
    echo "❌ Error: .env file not found in $(pwd)."
    exit 1
fi

# 3. Create Namespace if not exists
kubectl create namespace $NAMESPACE --dry-run=client -o yaml | kubectl apply -f -

# 4. Generate Secret from .env
echo "📡 Generating Kubernetes Secret from .env..."
kubectl create secret generic $SECRET_NAME \
    --from-env-file=.env \
    --namespace=$NAMESPACE \
    --dry-run=client -o yaml | kubectl apply -f -

echo "✅ Success! Secret '$SECRET_NAME' is now available in namespace '$NAMESPACE'."
echo "🚀 Your GKE Swarm Engine is now ready to authorize."
