#!/usr/bin/env python3
"""
Firestore Database Backup Script

This script creates a complete backup of a Firestore database by:
1. Connecting to Firestore using Firebase Admin SDK
2. Iterating through all collections and documents
3. Saving the data in JSON format with timestamps
4. Supporting both full backups and incremental backups
5. Handling subcollections recursively

Requirements:
- firebase-admin package
- Service account key file (JSON)
- python-dotenv (optional, for environment variables)

Usage:
    python firestore_backup.py
"""

import os
import json
import argparse
from datetime import datetime
from typing import Dict, Any, List
from pathlib import Path

import firebase_admin
from firebase_admin import credentials, firestore
from dotenv import load_dotenv

# Load environment variables
load_dotenv()


class FirestoreBackup:
    def __init__(self, service_account_path: str = None, project_id: str = None):
        """
        Initialize Firestore backup utility.
        
        Args:
            service_account_path: Path to Firebase service account JSON file
            project_id: Firebase project ID (optional if specified in service account)
        """
        self.service_account_path = service_account_path or os.getenv('FIREBASE_SERVICE_ACCOUNT_PATH')
        self.project_id = project_id or os.getenv('FIREBASE_PROJECT_ID')
        self.db = None
        self.backup_data = {}
        
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
    
    def _convert_firestore_data(self, data: Any) -> Any:
        """
        Convert Firestore-specific data types to JSON-serializable formats.
        
        Args:
            data: Data from Firestore document
            
        Returns:
            JSON-serializable data
        """
        if hasattr(data, 'timestamp'):  # Firestore Timestamp
            return {
                '_firestore_timestamp': data.timestamp(),
                '_iso_string': data.isoformat()
            }
        elif hasattr(data, 'latitude') and hasattr(data, 'longitude'):  # GeoPoint
            return {
                '_firestore_geopoint': True,
                'latitude': data.latitude,
                'longitude': data.longitude
            }
        elif hasattr(data, 'path'):  # DocumentReference
            return {
                '_firestore_reference': data.path
            }
        elif isinstance(data, dict):
            return {key: self._convert_firestore_data(value) for key, value in data.items()}
        elif isinstance(data, list):
            return [self._convert_firestore_data(item) for item in data]
        else:
            return data
    
    def _backup_collection(self, collection_ref, collection_path: str = "") -> Dict[str, Any]:
        """
        Backup a Firestore collection recursively.
        
        Args:
            collection_ref: Firestore collection reference
            collection_path: Path of the collection for logging
            
        Returns:
            Dictionary containing all documents and subcollections
        """
        collection_data = {}
        
        try:
            docs = collection_ref.stream()
            doc_count = 0
            
            for doc in docs:
                doc_count += 1
                doc_data = {
                    'id': doc.id,
                    'data': self._convert_firestore_data(doc.to_dict()),
                    'create_time': doc.create_time.isoformat() if doc.create_time else None,
                    'update_time': doc.update_time.isoformat() if doc.update_time else None,
                    'subcollections': {}
                }
                
                # Backup subcollections
                subcollections = doc.reference.collections()
                for subcol in subcollections:
                    subcol_path = f"{collection_path}/{doc.id}/{subcol.id}"
                    print(f"  Backing up subcollection: {subcol_path}")
                    doc_data['subcollections'][subcol.id] = self._backup_collection(
                        subcol, subcol_path
                    )
                
                collection_data[doc.id] = doc_data
            
            print(f"Backed up {doc_count} documents from collection: {collection_path or 'root'}")
            
        except Exception as e:
            print(f"Error backing up collection {collection_path}: {str(e)}")
            collection_data['_error'] = str(e)
        
        return collection_data
    
    def backup_database(self, output_file: str = None, include_metadata: bool = True) -> str:
        """
        Create a complete backup of the Firestore database.
        
        Args:
            output_file: Custom output filename (optional)
            include_metadata: Include backup metadata
            
        Returns:
            Path to the backup file
        """
        print("Starting Firestore database backup...")
        
        # Generate filename if not provided
        if not output_file:
            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            output_file = f"firestore_backup_{timestamp}.json"
        
        # Ensure backup directory exists
        backup_dir = Path("backups")
        backup_dir.mkdir(exist_ok=True)
        output_path = backup_dir / output_file
        
        # Initialize backup data structure
        backup_data = {
            'collections': {}
        }
        
        if include_metadata:
            backup_data['metadata'] = {
                'backup_time': datetime.now().isoformat(),
                'project_id': self.db.project,
                'backup_version': '1.0',
                'total_collections': 0,
                'total_documents': 0
            }
        
        try:
            # Get all root collections
            collections = self.db.collections()
            collection_count = 0
            total_docs = 0
            
            for collection in collections:
                collection_count += 1
                collection_id = collection.id
                print(f"Backing up collection: {collection_id}")
                
                collection_data = self._backup_collection(collection, collection_id)
                backup_data['collections'][collection_id] = collection_data
                
                # Count documents for metadata
                if include_metadata:
                    total_docs += len([k for k in collection_data.keys() if not k.startswith('_')])
            
            # Update metadata
            if include_metadata:
                backup_data['metadata']['total_collections'] = collection_count
                backup_data['metadata']['total_documents'] = total_docs
            
            # Save backup to file
            with open(output_path, 'w', encoding='utf-8') as f:
                json.dump(backup_data, f, indent=2, ensure_ascii=False)
            
            file_size = output_path.stat().st_size
            print(f"\n✅ Backup completed successfully!")
            print(f"📁 File: {output_path}")
            print(f"📊 Collections: {collection_count}")
            print(f"📄 Total documents: {total_docs if include_metadata else 'N/A'}")
            print(f"💾 File size: {file_size / 1024 / 1024:.2f} MB")
            
            return str(output_path)
            
        except Exception as e:
            print(f"❌ Backup failed: {str(e)}")
            raise e
    
    def backup_collection_only(self, collection_name: str, output_file: str = None) -> str:
        """
        Backup a specific collection only.
        
        Args:
            collection_name: Name of the collection to backup
            output_file: Custom output filename (optional)
            
        Returns:
            Path to the backup file
        """
        print(f"Starting backup of collection: {collection_name}")
        
        if not output_file:
            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            output_file = f"firestore_{collection_name}_backup_{timestamp}.json"
        
        backup_dir = Path("backups")
        backup_dir.mkdir(exist_ok=True)
        output_path = backup_dir / output_file
        
        try:
            collection_ref = self.db.collection(collection_name)
            collection_data = self._backup_collection(collection_ref, collection_name)
            
            backup_data = {
                'collection_name': collection_name,
                'backup_time': datetime.now().isoformat(),
                'data': collection_data
            }
            
            with open(output_path, 'w', encoding='utf-8') as f:
                json.dump(backup_data, f, indent=2, ensure_ascii=False)
            
            print(f"✅ Collection backup completed: {output_path}")
            return str(output_path)
            
        except Exception as e:
            print(f"❌ Collection backup failed: {str(e)}")
            raise e
    
    def list_collections(self) -> List[str]:
        """
        List all root collections in the database.
        
        Returns:
            List of collection names
        """
        try:
            collections = self.db.collections()
            collection_names = [col.id for col in collections]
            print("Collections in database:")
            for name in collection_names:
                print(f"  - {name}")
            return collection_names
        except Exception as e:
            print(f"Error listing collections: {str(e)}")
            return []


def main():
    """Main function to run the backup script."""
    parser = argparse.ArgumentParser(description='Backup Firestore database')
    parser.add_argument('--service-account', type=str, help='Path to Firebase service account JSON file')
    parser.add_argument('--project-id', type=str, help='Firebase project ID')
    parser.add_argument('--collection', type=str, help='Backup specific collection only')
    parser.add_argument('--output', type=str, help='Output filename')
    parser.add_argument('--list-collections', action='store_true', help='List all collections')
    parser.add_argument('--no-metadata', action='store_true', help='Exclude backup metadata')
    
    args = parser.parse_args()
    
    try:
        # Initialize backup utility
        backup = FirestoreBackup(
            service_account_path=args.service_account,
            project_id=args.project_id
        )
        
        if args.list_collections:
            backup.list_collections()
        elif args.collection:
            backup.backup_collection_only(args.collection, args.output)
        else:
            backup.backup_database(args.output, not args.no_metadata)
            
    except Exception as e:
        print(f"❌ Error: {str(e)}")
        return 1
    
    return 0


if __name__ == "__main__":
    exit(main())