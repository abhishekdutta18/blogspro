#!/bin/bash
# [V1.0] BlogsPro GCE Research Lab Provisioner
# Spins up a high-power Spot VM for manual forensic research at ~$0.03/hr.

PROJECT_ID="blogspro-ai"
ZONE="us-central1-a"
VM_NAME="blogspro-research-lab-$(date +%Y%m%d)"
MACHINE_TYPE="n2-standard-4" # 4 vCPU, 16GB RAM

echo "🔬 [Research Lab] Provisioning GCE Spot Instance: $VM_NAME"
echo "--------------------------------------------------------"

gcloud compute instances create $VM_NAME \
    --project=$PROJECT_ID \
    --zone=$ZONE \
    --machine-type=$MACHINE_TYPE \
    --provisioning-model=SPOT \
    --instance-termination-action=STOP \
    --image-family=ubuntu-2204-lts \
    --image-project=ubuntu-os-cloud \
    --boot-disk-size=50GB \
    --scopes=https://www.googleapis.com/auth/cloud-platform \
    --tags=http-server,https-server

echo ""
echo "✅ Success! Research Lab is booting up."
echo "🔗 Access your lab via SSH:"
echo "   gcloud compute ssh $VM_NAME --zone=$ZONE"
echo ""
echo "⚠️  REMEMBER: When finished, stop or delete the instance to save costs!"
echo "   gcloud compute instances stop $VM_NAME --zone=$ZONE"
