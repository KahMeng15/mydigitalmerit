#!/usr/bin/env python3
"""
Firestore Database Restore Script

This script restores data from a Firestore backup file created by firestore_backup.py.
WARNING: This will overwrite existing data in your Firestore database.

Usage:
    python restore_firestore.py backup_file.json
"""

import os
import json
import argparse
from datetime import datetime
from typing import Dict, Any
from pathlib import Path

import firebase_admin
from firebase_admin import credentials, firestore
from dotenv import load_dotenv

# Load environment variables
load_dotenv()


class FirestoreRestore:
    def __init__(self, service_account_path: str = None, project_id: str = None):
        """
        Initialize Firestore restore utility.
        
        Args:
            service_account_path: Path to Firebase service account JSON file
            project_id: Firebase project ID (optional if specified in service account)
        """
        self.service_account_path = service_account_path or os.getenv('FIREBASE_SERVICE_ACCOUNT_PATH')
        self.project_id = project_id or os.getenv('FIREBASE_PROJECT_ID')
        self.db = None
        
        if not self.service_account_path:
            raise ValueError("Service account path must be provided via parameter or FIREBASE_SERVICE_ACCOUNT_PATH env variable")
            
        self._initialize_firebase()
    
    def _initialize_firebase(self):
        """Initialize Firebase Admin SDK."""
        try:
            # Check if Firebase app is already initialized
            firebase_admin.get_app()
            print("Firebase app already initialized")
        except ValueError:
            # Initialize Firebase
            if self.project_id:
                cred = credentials.Certificate(self.service_account_path)
                firebase_admin.initialize_app(cred, {
                    'projectId': self.project_id
                })
            else:
                cred = credentials.Certificate(self.service_account_path)
                firebase_admin.initialize_app(cred)
        
        self.db = firestore.client()
        print(f"Connected to Firestore database: {self.db.project}")
    
    def _convert_backup_data(self, data: Any) -> Any:
        """
        Convert backup data back to Firestore-compatible formats.
        
        Args:
            data: Data from backup file
            
        Returns:
            Firestore-compatible data
        """
        if isinstance(data, dict):
            if '_firestore_timestamp' in data:
                # Convert timestamp back
                return firestore.SERVER_TIMESTAMP  # Use server timestamp for simplicity
            elif '_firestore_geopoint' in data:
                # Convert GeoPoint back
                return firestore.GeoPoint(data['latitude'], data['longitude'])
            elif '_firestore_reference' in data:
                # Convert DocumentReference back
                return self.db.document(data['_firestore_reference'])
            else:
                return {key: self._convert_backup_data(value) for key, value in data.items()}
        elif isinstance(data, list):
            return [self._convert_backup_data(item) for item in data]
        else:
            return data
    
    def _restore_collection(self, collection_data: Dict[str, Any], collection_path: str, batch_size: int = 500) -> int:
        """
        Restore documents to a Firestore collection.
        
        Args:
            collection_data: Collection data from backup
            collection_path: Path to the collection
            batch_size: Number of documents to write in each batch
            
        Returns:
            Number of documents restored
        """
        collection_ref = self.db.collection(collection_path)
        documents_restored = 0
        batch = self.db.batch()
        batch_count = 0
        
        for doc_id, doc_info in collection_data.items():
            if doc_id.startswith('_'):  # Skip metadata fields
                continue
                
            try:
                # Prepare document data
                doc_data = self._convert_backup_data(doc_info.get('data', {}))
                doc_ref = collection_ref.document(doc_id)
                
                # Add to batch
                batch.set(doc_ref, doc_data)
                batch_count += 1
                documents_restored += 1
                
                # Commit batch if it reaches the limit
                if batch_count >= batch_size:
                    batch.commit()
                    batch = self.db.batch()
                    batch_count = 0
                    print(f"  Restored {documents_restored} documents to {collection_path}")
                
                # Restore subcollections
                subcollections = doc_info.get('subcollections', {})
                for subcol_name, subcol_data in subcollections.items():
                    subcol_path = f"{collection_path}/{doc_id}/{subcol_name}"
                    subcol_count = self._restore_collection(subcol_data, subcol_path, batch_size)
                    print(f"  Restored {subcol_count} documents to subcollection: {subcol_path}")
                
            except Exception as e:
                print(f"  Error restoring document {doc_id}: {str(e)}")
        
        # Commit remaining documents in batch
        if batch_count > 0:
            batch.commit()
        
        return documents_restored
    
    def restore_from_backup(self, backup_file_path: str, dry_run: bool = False, 
                          collections_filter: list = None) -> Dict[str, int]:
        """
        Restore Firestore database from backup file.
        
        Args:
            backup_file_path: Path to the backup JSON file
            dry_run: If True, only analyze the backup without writing to database
            collections_filter: List of collection names to restore (restore all if None)
            
        Returns:
            Dictionary with restore statistics
        """
        print(f"{'[DRY RUN] ' if dry_run else ''}Starting Firestore database restore from: {backup_file_path}")
        
        # Load backup file
        try:
            with open(backup_file_path, 'r', encoding='utf-8') as f:
                backup_data = json.load(f)
        except Exception as e:
            raise Exception(f"Failed to load backup file: {str(e)}")
        
        # Validate backup file structure
        if 'collections' not in backup_data:
            raise Exception("Invalid backup file: missing 'collections' key")
        
        # Display backup metadata
        metadata = backup_data.get('metadata', {})
        if metadata:
            print(f"Backup created: {metadata.get('backup_time', 'Unknown')}")
            print(f"Original project: {metadata.get('project_id', 'Unknown')}")
            print(f"Collections: {metadata.get('total_collections', 'Unknown')}")
            print(f"Documents: {metadata.get('total_documents', 'Unknown')}")
        
        # Filter collections if specified
        collections_to_restore = backup_data['collections']
        if collections_filter:
            collections_to_restore = {
                name: data for name, data in collections_to_restore.items() 
                if name in collections_filter
            }
            print(f"Filtering to collections: {collections_filter}")
        
        restore_stats = {}
        total_restored = 0
        
        if dry_run:
            print("\n[DRY RUN] Analyzing backup file...")
            for col_name, col_data in collections_to_restore.items():
                doc_count = len([k for k in col_data.keys() if not k.startswith('_')])
                restore_stats[col_name] = doc_count
                total_restored += doc_count
                print(f"  Would restore {doc_count} documents to collection: {col_name}")
        else:
            print("\n🔄 Restoring collections...")
            for col_name, col_data in collections_to_restore.items():
                print(f"Restoring collection: {col_name}")
                doc_count = self._restore_collection(col_data, col_name)
                restore_stats[col_name] = doc_count
                total_restored += doc_count
                print(f"✅ Restored {doc_count} documents to collection: {col_name}")
        
        print(f"\n{'[DRY RUN] ' if dry_run else '✅ '}Restore completed!")
        print(f"📊 Total collections: {len(restore_stats)}")
        print(f"📄 Total documents: {total_restored}")
        
        return restore_stats


def main():
    """Main function to run the restore script."""
    parser = argparse.ArgumentParser(description='Restore Firestore database from backup')
    parser.add_argument('backup_file', type=str, help='Path to backup JSON file')
    parser.add_argument('--service-account', type=str, help='Path to Firebase service account JSON file')
    parser.add_argument('--project-id', type=str, help='Firebase project ID')
    parser.add_argument('--dry-run', action='store_true', help='Analyze backup without writing to database')
    parser.add_argument('--collections', nargs='+', help='Specific collections to restore')
    
    args = parser.parse_args()
    
    # Confirm destructive operation
    if not args.dry_run:
        print("⚠️  WARNING: This operation will overwrite existing data in your Firestore database!")
        print(f"Backup file: {args.backup_file}")
        if args.collections:
            print(f"Collections to restore: {args.collections}")
        else:
            print("Will restore ALL collections from backup")
        
        confirm = input("\nAre you sure you want to proceed? (yes/no): ")
        if confirm.lower() != 'yes':
            print("Restore cancelled.")
            return 0
    
    try:
        # Initialize restore utility
        restore = FirestoreRestore(
            service_account_path=args.service_account,
            project_id=args.project_id
        )
        
        # Perform restore
        stats = restore.restore_from_backup(
            backup_file_path=args.backup_file,
            dry_run=args.dry_run,
            collections_filter=args.collections
        )
        
        if not args.dry_run:
            print(f"\n🎉 Restore completed successfully!")
            
    except Exception as e:
        print(f"❌ Restore failed: {str(e)}")
        return 1
    
    return 0


if __name__ == "__main__":
    exit(main())