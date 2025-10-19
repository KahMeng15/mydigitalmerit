# Keywords Migration Guide

## Overview
This migration moves the `keywords` and `alternateNames` fields from the `levelMetadata` document to individual role documents in the `roleMetadata` subcollections.

## Problem
Currently, keywords are stored in the wrong location:
```
meritValues/
└── levelMetadata (document)
    └── roles (field)
        ├── committee
        │   └── {roleId}
        │       ├── nameEN: "Director"
        │       ├── nameBM: "Pengarah"
        │       ├── sortOrder: 0
        │       ├── keywords: ["director", "pengarah", "dir", "head"]  ❌ WRONG LOCATION
        │       └── alternateNames: []
        └── ...
```

## Solution
Keywords should be stored in the individual role documents:
```
meritValues/
└── roleMetadata (document)
    └── committee (subcollection)
        └── {roleId} (document)
            ├── nameEN: "Director"
            ├── nameBM: "Pengarah"
            ├── sortOrder: 0
            ├── category: "committee"
            ├── id: "{roleId}"
            ├── levelValues: {...}
            ├── keywords: ["director", "pengarah", "dir", "head"]  ✅ CORRECT LOCATION
            └── alternateNames: []
```

## Why This Matters
1. **Data Consistency**: Role metadata should be in one place (roleMetadata)
2. **Easier Maintenance**: All role information in the same document
3. **Better Performance**: No need to read levelMetadata to get keywords
4. **Cleaner Structure**: levelMetadata should only contain level definitions, not role data

## Migration Steps

### Step 1: Backup Your Database
```bash
cd /Users/kahmeng/Documents/GitHub/mydigitalmerit/backup
python3 firestore_backup.py
```

### Step 2: Run the Migration Tool

1. Open your browser and navigate to:
   ```
   http://your-domain/admin/migrate-keywords.html
   ```

2. Sign in as an admin user

3. The page will automatically verify the current state

4. Click **"Start Migration (Copy Keywords)"** to:
   - Read keywords from `meritValues/levelMetadata`
   - Copy them to `meritValues/roleMetadata/{category}/{roleId}`
   - Verify all keywords were copied correctly

5. After successful migration, click **"Clean Up"** to:
   - Remove keywords from `levelMetadata`
   - Keep the structure clean

### Step 3: Verify

1. Check the Firebase console to ensure keywords are now in role documents
2. Go to Merit Values page and verify everything still works
3. Test role assignment in Upload Merits page

## What Gets Migrated

### Committee Roles
- Source: `meritValues/levelMetadata → roles.committee.{roleId}`
- Target: `meritValues/roleMetadata/committee/{roleId}`
- Fields migrated:
  - `keywords` (array)
  - `alternateNames` (array)

### Non-Committee Roles
- Source: `meritValues/levelMetadata → roles.nonCommittee.{roleId}`
- Target: `meritValues/roleMetadata/nonCommittee/{roleId}`
- Fields migrated:
  - `keywords` (array)
  - `alternateNames` (array)

### Competition Achievements
- Source: `meritValues/levelMetadata → roles.competition.{roleId}`
- Target: `meritValues/roleMetadata/competition/{roleId}`
- Fields migrated:
  - `keywords` (array)
  - `alternateNames` (array)

## Safety Features

### Non-Destructive Migration
- Keywords are **COPIED**, not moved
- Original data remains in `levelMetadata` until you run cleanup
- You can verify the migration before cleaning up

### Verification
- Compares original and migrated keywords
- Ensures all data was copied correctly
- Fails if any mismatches are found

### Rollback
If something goes wrong:
1. The original keywords are still in `levelMetadata` (until cleanup)
2. You can restore from backup
3. Simply delete the keywords from `roleMetadata` documents

## Before and After

### Before Migration

**levelMetadata document:**
```javascript
{
  created: Timestamp,
  description: "Contains level definitions with IDs for referencing",
  roles: {
    committee: {
      id_123: {
        nameEN: "Director",
        nameBM: "Pengarah",
        sortOrder: 0,
        keywords: ["director", "pengarah", "dir", "head"],  // ❌ HERE
        alternateNames: []
      },
      // ... more roles
    },
    nonCommittee: { /* ... */ },
    competition: { /* ... */ }
  }
}
```

**roleMetadata/committee/id_123 document:**
```javascript
{
  id: "id_123",
  nameEN: "Director",
  nameBM: "Pengarah",
  category: "committee",
  sortOrder: 0,
  levelValues: {
    id_level1: 10,
    id_level2: 12,
    // ...
  }
  // ❌ NO KEYWORDS HERE
}
```

### After Migration

**levelMetadata document:**
```javascript
{
  created: Timestamp,
  description: "Contains level definitions with IDs for referencing",
  roles: {
    committee: {
      id_123: {
        nameEN: "Director",
        nameBM: "Pengarah",
        sortOrder: 0
        // ✅ keywords removed (after cleanup)
      },
      // ... more roles
    },
    nonCommittee: { /* ... */ },
    competition: { /* ... */ }
  }
}
```

**roleMetadata/committee/id_123 document:**
```javascript
{
  id: "id_123",
  nameEN: "Director",
  nameBM: "Pengarah",
  category: "committee",
  sortOrder: 0,
  levelValues: {
    id_level1: 10,
    id_level2: 12,
    // ...
  },
  keywords: ["director", "pengarah", "dir", "head"],  // ✅ NOW HERE
  alternateNames: []
}
```

## Code Impact

### No Code Changes Needed!

The existing code already reads from both locations:
- `merit-values.js` - Already uses `roleMetadata` structure ✓
- `upload-merits.js` - Already uses `roleMetadata` structure ✓
- `event-details.js` - Already uses `roleMetadata` structure ✓

All JavaScript files will continue to work without any changes.

## Troubleshooting

### Issue: "levelMetadata document not found"
**Solution:** The structure hasn't been initialized. Go to Merit Values page first.

### Issue: "Role document not found in roleMetadata"
**Solution:** Run the duplicate collections migration first (`migrate-database.html`)

### Issue: Keywords still in levelMetadata after cleanup
**Solution:** Run the cleanup step again, or manually remove them from Firebase console

## Testing Checklist

After migration:

- [ ] Keywords appear in role documents (Firebase console)
- [ ] Merit Values page loads correctly
- [ ] Can add/edit roles with keywords
- [ ] Upload Merits page recognizes roles by keywords
- [ ] Role assignment works correctly
- [ ] No errors in browser console

## Next Steps

After successful migration:
1. ✅ Keywords are now in the correct location
2. ✅ All code continues to work
3. ✅ Database structure is cleaner
4. Consider updating any documentation that references the old structure

---

**Created:** October 20, 2025  
**Migration Tool:** `/webapp/admin/migrate-keywords.html`
