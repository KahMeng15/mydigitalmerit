# Firestore Database Backup Tool

A comprehensive Python script to backup your entire Firestore database, including all collections, documents, and subcollections.

## Features

- 🔥 **Complete Database Backup** - Backs up all collections and documents
- 📁 **Subcollection Support** - Recursively backs up nested subcollections
- 🕒 **Timestamp Preservation** - Maintains Firestore timestamps and metadata
- 🗂️ **JSON Export** - Saves data in readable JSON format
- 🎯 **Selective Backup** - Option to backup specific collections only
- 📊 **Metadata Tracking** - Includes backup statistics and information
- 🔧 **Type Conversion** - Handles Firestore-specific data types (GeoPoint, Timestamp, DocumentReference)

## Prerequisites

1. **Firebase Service Account Key**
   - Go to [Firebase Console](https://console.firebase.google.com/)
   - Select your project → Project Settings → Service Accounts
   - Click "Generate new private key" and download the JSON file
   
2. **Python Dependencies**
   ```bash
   pip install firebase-admin python-dotenv
   ```

## Quick Start

### 1. Setup Configuration

Copy the example environment file and configure it:

```bash
cp .env.example .env
```

Edit `.env` file:
```bash
FIREBASE_SERVICE_ACCOUNT_PATH=/path/to/your/serviceAccountKey.json
FIREBASE_PROJECT_ID=your-project-id
```

### 2. Update main.py

Edit `main.py` and update the service account path:

```python
service_account_path = "path/to/your/serviceAccountKey.json"
project_id = "your-project-id"  # Optional
```

### 3. Run the Backup

```bash
python main.py
```

## Advanced Usage

### Full Command Line Interface

Use `firestore_backup.py` directly for more options:

```bash
# Full database backup
python firestore_backup.py

# Backup with custom filename
python firestore_backup.py --output my_backup.json

# Backup specific collection only
python firestore_backup.py --collection users

# List all collections
python firestore_backup.py --list-collections

# Backup without metadata
python firestore_backup.py --no-metadata

# Use custom service account file
python firestore_backup.py --service-account /path/to/key.json --project-id my-project
```

### Programmatic Usage

```python
from firestore_backup import FirestoreBackup

# Initialize
backup = FirestoreBackup(
    service_account_path="path/to/serviceAccount.json",
    project_id="your-project-id"
)

# Full backup
backup_file = backup.backup_database()

# Collection-specific backup
backup.backup_collection_only("users", "users_backup.json")

# List collections
collections = backup.list_collections()
```

## Backup File Structure

The backup JSON file contains:

```json
{
  "metadata": {
    "backup_time": "2024-01-15T10:30:00Z",
    "project_id": "your-project-id",
    "backup_version": "1.0",
    "total_collections": 5,
    "total_documents": 150
  },
  "collections": {
    "users": {
      "user123": {
        "id": "user123",
        "data": {
          "name": "John Doe",
          "email": "john@example.com",
          "created": {
            "_firestore_timestamp": 1642248600.0,
            "_iso_string": "2022-01-15T10:30:00Z"
          }
        },
        "create_time": "2022-01-15T10:30:00Z",
        "update_time": "2022-01-15T10:30:00Z",
        "subcollections": {
          "posts": {
            "post456": {
              "id": "post456",
              "data": {
                "title": "My Post",
                "content": "Post content..."
              }
            }
          }
        }
      }
    }
  }
}
```

## Data Type Handling

The script handles Firestore-specific data types:

- **Timestamps** → `{_firestore_timestamp: number, _iso_string: string}`
- **GeoPoints** → `{_firestore_geopoint: true, latitude: number, longitude: number}`
- **DocumentReferences** → `{_firestore_reference: string}`

## File Organization

```
backup/
├── firestore_backup.py    # Main backup utility class
├── main.py                # Simple example script
├── .env.example          # Configuration template
├── .env                  # Your configuration (create this)
├── README.md             # This file
└── backups/              # Generated backup files
    ├── firestore_backup_20240115_103000.json
    └── firestore_users_backup_20240115_104500.json
```

## Troubleshooting

### Common Issues

1. **"Service account file not found"**
   - Ensure the path to your service account JSON file is correct
   - Check that the file has proper read permissions

2. **"Permission denied"**
   - Verify your service account has Firestore read permissions
   - Check that Firestore is enabled in your Firebase project

3. **"Module not found: firebase_admin"**
   ```bash
   pip install firebase-admin python-dotenv
   ```

4. **Large database timeouts**
   - The script handles large databases, but very large ones may take time
   - Consider backing up collections individually for very large datasets

### Getting Help

If you encounter issues:
1. Check that your Firebase service account has proper permissions
2. Ensure your project ID is correct
3. Verify that Firestore is enabled in your Firebase project
4. Check the console output for specific error messages

## Security Notes

- **Never commit your service account JSON file to version control**
- Add `serviceAccountKey.json` and `.env` to your `.gitignore`
- Store service account files securely with appropriate file permissions
- Consider using environment variables in production environments

## Backup Best Practices

1. **Regular Backups** - Set up automated daily/weekly backups
2. **Version Control** - Keep multiple backup versions
3. **Test Restores** - Regularly test that your backups can be restored
4. **Secure Storage** - Store backups in secure, encrypted locations
5. **Monitor Size** - Large databases will create large backup files

## License

This tool is provided as-is for educational and backup purposes. Please ensure compliance with Firebase terms of service and your organization's data policies.