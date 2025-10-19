# Database Migration: Remove Duplicate Collections

## Overview
This migration removes duplicate Firestore collections that contain redundant data already stored in the hierarchical `meritValues` collection structure.

## What This Migration Does

### Collections to be DELETED:
1. **`competitionMeritValues`** (top-level collection)
   - All competition achievement data
   
2. **`eventMeritValues`** (top-level collection)
   - Subcollection: `committee`
   - Subcollection: `nonCommittee`

### Target Structure (already exists):
```
meritValues/
├── levelMetadata/
│   ├── event/ (subcollection)
│   │   ├── id_xxx (Block)
│   │   ├── id_yyy (Faculty)
│   │   └── ...
│   └── competition/ (subcollection)
│       ├── id_aaa (Champion)
│       ├── id_bbb (Runner-up)
│       └── ...
└── roleMetadata/
    ├── committee/ (subcollection)
    │   ├── id_111 (Director)
    │   ├── id_222 (Secretary)
    │   └── ...
    ├── nonCommittee/ (subcollection)
    │   ├── id_333 (Participant)
    │   ├── id_444 (Volunteer)
    │   └── ...
    └── competition/ (subcollection)
        ├── id_555 (Champion)
        ├── id_666 (Runner-up)
        └── ...
```

## Migration Steps

### Step 1: Backup Your Database
**IMPORTANT:** Before running the migration, create a backup using the backup script:

```bash
cd /Users/kahmeng/Documents/GitHub/mydigitalmerit/backup
python3 firestore_backup.py
```

This will create a backup file in `backup/backups/` with a timestamp.

### Step 2: Run the Migration Tool

1. Open your web browser and navigate to:
   ```
   http://your-domain/admin/migrate-database.html
   ```

2. Sign in as an admin user

3. The page will automatically run a verification check on load

4. Review the verification results:
   - Step 1: Check for duplicate collections
   - Step 4: Verify meritValues structure exists

5. Click **"Verify Only"** button to re-run verification without making changes

6. When ready, click **"Start Migration"** button to:
   - Delete all documents from `competitionMeritValues`
   - Delete all documents from `eventMeritValues`
   - Verify the `meritValues` structure is valid

### Step 3: Verify the Frontend

After migration:

1. Go to the Merit Values page:
   ```
   http://your-domain/admin/merit-values.html
   ```

2. Verify that:
   - Event merit roles (Committee and Non-Committee) load correctly
   - Competition achievements load correctly
   - You can add, edit, and delete roles
   - Level headers appear correctly
   - Drag-and-drop reordering works

## Code Changes Made

### Files Modified:

#### 1. `/webapp/assets/js/merit-values.js`
Updated the following functions to use the hierarchical structure:

**Reordering functions:**
- `reorderEventRoles()` - Now saves to `meritValues/roleMetadata/{committee|nonCommittee}/{roleId}`
- `reorderCompetitionAchievements()` - Now saves to `meritValues/roleMetadata/competition/{achievementId}`

**Save functions:**
- `saveEventMeritRole()` - Now saves to `meritValues/roleMetadata/{committee|nonCommittee}/{roleId}`
- `saveCompetitionMeritRole()` - Now saves to `meritValues/roleMetadata/competition/{achievementId}`

**Delete functions:**
- `deleteEventMeritRole()` - Already using hierarchical structure ✓
- `deleteCompetitionMeritRole()` - Already using hierarchical structure ✓

**Load functions:**
- `loadMeritValuesHierarchical()` - Already using hierarchical structure ✓
- `loadEventMeritValues()` - Already using hierarchical structure ✓
- `loadCompetitionMeritValues()` - Already using hierarchical structure ✓

#### 2. `/webapp/admin/migrate-database.html` (NEW FILE)
- Migration tool interface
- Verification and deletion logic
- Real-time logging and status updates

## Rollback Plan

If you need to rollback the migration:

1. The old collections will be deleted, so you must restore from backup:

```bash
cd /Users/kahmeng/Documents/GitHub/mydigitalmerit/backup
python3 restore_firestore.py backups/firestore_backup_YYYYMMDD_HHMMSS.json
```

2. Revert the code changes in `merit-values.js` by checking out the previous commit:

```bash
cd /Users/kahmeng/Documents/GitHub/mydigitalmerit
git checkout HEAD~1 webapp/assets/js/merit-values.js
```

## Benefits of This Migration

1. **Eliminates Data Redundancy**: Single source of truth for merit values
2. **Better Data Organization**: Hierarchical structure is more maintainable
3. **Consistent API**: All reads and writes use the same collection paths
4. **Reduced Sync Issues**: No risk of duplicate collections being out of sync
5. **Cleaner Database**: Easier to understand and maintain

## Testing Checklist

After migration, verify:

- [ ] Merit Values page loads without errors
- [ ] Event roles (Committee) display correctly
- [ ] Event roles (Non-Committee) display correctly
- [ ] Competition achievements display correctly
- [ ] Can create new roles
- [ ] Can edit existing roles
- [ ] Can delete roles
- [ ] Can reorder roles via drag-and-drop
- [ ] Can add new levels
- [ ] Can edit levels
- [ ] Merit values per level are correct
- [ ] Upload merits page still works (if it references merit values)

## Troubleshooting

### Issue: "meritValues/levelMetadata does not exist" error

**Solution:** The hierarchical structure wasn't initialized. Run:
1. Go to Merit Values page
2. The system will auto-initialize the structure
3. Refresh and try again

### Issue: No roles appear after migration

**Solution:** Check browser console for errors. The data might not have been migrated properly:
1. Verify the old collections were actually deleted
2. Verify `meritValues/roleMetadata` subcollections have documents
3. Check browser console for JavaScript errors

### Issue: Changes aren't saving

**Solution:** Check Firestore permissions:
1. Ensure your admin user has write access to `meritValues` collection
2. Check browser console for permission denied errors
3. Verify Firebase security rules allow writes to the subcollections

## Support

If you encounter issues:
1. Check the migration log in the migration tool
2. Check browser console for JavaScript errors
3. Check Firestore console to verify data structure
4. Restore from backup if needed

## Next Steps

After successful migration:
1. Monitor the Merit Values page for any issues
2. Test creating and editing merits in the upload merits page
3. Consider removing the migration tool HTML file once confirmed working
4. Update any other code that might reference the old collections

---

**Created:** October 20, 2025
**Last Updated:** October 20, 2025
