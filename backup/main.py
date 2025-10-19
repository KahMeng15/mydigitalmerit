#!/usr/bin/env python3
"""
Simple example script to backup Firestore database.

This is a simplified version that uses the FirestoreBackup class.
For more advanced usage, use firestore_backup.py directly.
"""

from firestore_backup import FirestoreBackup
import os
from pathlib import Path

def main():
    """
    Simple backup script example.
    
    To use this script:
    1. Set up your Firebase service account JSON file
    2. Update the paths below or set environment variables
    3. Run: python main.py
    """
    
    # Configuration - Update these paths for your project
    service_account_path = "mydigitalmerit-firebase-adminsdk-fbsvc-e5c6187381.json"  # Update this path
    project_id = "mydigitalmerit"  # Update this or leave None to use service account default

    # Or use environment variables (recommended)
    service_account_path = os.getenv('FIREBASE_SERVICE_ACCOUNT_PATH', service_account_path)
    project_id = os.getenv('FIREBASE_PROJECT_ID', project_id)
    
    print("🔥 Starting Firestore Database Backup")
    print("=" * 50)
    
    try:
        # Check if service account file exists
        if not os.path.exists(service_account_path):
            print(f"❌ Service account file not found: {service_account_path}")
            print("\nTo get your service account file:")
            print("1. Go to Firebase Console > Project Settings")
            print("2. Go to Service Accounts tab")
            print("3. Click 'Generate new private key'")
            print("4. Save the JSON file and update the path in this script")
            return 1
        
        # Initialize backup utility
        backup = FirestoreBackup(
            service_account_path=service_account_path,
            project_id=project_id
        )
        
        # Create full database backup
        print("\n📦 Creating full database backup...")
        backup_file = backup.backup_database()
        
        print(f"\n✅ Backup completed successfully!")
        print(f"📁 Backup saved to: {backup_file}")
        
        # Optional: List all collections
        print("\n📋 Collections in your database:")
        backup.list_collections()
        
    except Exception as e:
        print(f"❌ Backup failed: {str(e)}")
        return 1
    
    return 0

if __name__ == "__main__":
    exit(main())