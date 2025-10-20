# Keywords Feature for Merit Roles

## Overview
The Merit Values configuration page now includes a **Keywords** field for each role (Committee, Non-Committee, and Competition). This feature helps improve the accuracy of role matching when uploading merit records from Excel files.

## What Are Keywords?
Keywords are alternative names or variations of role names that help the system identify roles when processing uploaded data. For example:

- **Role**: Director
- **Keywords**: pengarah, director, ketua, head, chairman

When uploading an Excel file with merit records, if the role name doesn't exactly match "Director", the system can use these keywords to find the correct match.

## How to Add Keywords

### When Creating a New Role:
1. Click **"Add Role"** button (for Committee, Non-Committee, or Competition)
2. Fill in the role name (EN and BM)
3. In the **Keywords** section:
   - Type a keyword in the input field
   - Press **Enter** or click **Add** button
   - Repeat to add more keywords
4. Keywords will appear as colored tags that can be removed by clicking the × button
5. Click **"Save Role"** to save the role with its keywords

### When Editing an Existing Role:
1. Click on the role name in the table to open the Edit Role modal
2. Existing keywords will be displayed as tags
3. Add new keywords using the input field
4. Remove keywords by clicking the × button on any tag
5. Click **"Update Role"** to save changes

## Features

### Visual Display
- Keywords appear as blue rounded tags
- Each tag has a remove (×) button
- Empty state shows "No keywords added yet"

### Validation
- Keywords are automatically converted to lowercase
- Duplicate keywords are prevented
- Clear error messages guide the user

### Use Cases
1. **Multiple Language Support**: Add both English and Malay variations
   - Example: "chairman", "pengerusi", "ketua"

2. **Common Misspellings**: Include variations that might appear in data
   - Example: "participant", "participants", "peserta"

3. **Abbreviations**: Add shortened forms
   - Example: "VP", "vice president", "naib presiden"

4. **Alternative Terms**: Include synonyms
   - Example: "champion", "winner", "johan", "juara"

## Technical Details

### Data Storage
Keywords are stored in Firestore under each role document:
```javascript
{
  id: "role_123",
  nameEN: "Director",
  nameBM: "Pengarah",
  keywords: ["pengarah", "director", "ketua", "head"],
  levelValues: { ... },
  // ... other fields
}
```

### Database Structure
Keywords are stored in the hierarchical structure:
- `meritValues/roleMetadata/committee/{roleId}` - Committee roles with keywords
- `meritValues/roleMetadata/nonCommittee/{roleId}` - Non-committee roles with keywords  
- `meritValues/roleMetadata/competition/{roleId}` - Competition roles with keywords

## Benefits

1. **Improved Data Import**: Better matching when uploading Excel files
2. **Flexibility**: Handle variations in role naming across different events
3. **Reduced Errors**: Fewer failed imports due to name mismatches
4. **User-Friendly**: Easy to manage with visual tag interface

## Tips for Best Practices

1. **Add Common Variations**: Include all commonly used terms for the role
2. **Keep It Simple**: Use single words or short phrases
3. **Use Lowercase**: Keywords are automatically converted to lowercase
4. **Consider Context**: Think about how roles are typically named in Excel uploads
5. **Update Regularly**: Add new keywords if you notice pattern in failed matches

## Example Keywords for Common Roles

### Committee Roles
- **Director/Pengarah**: director, pengarah, ketua, head, chairman, pengerusi
- **Secretary/Setiausaha**: secretary, setiausaha, admin, sec
- **Treasurer/Bendahari**: treasurer, bendahari, finance, kewangan

### Non-Committee Roles
- **Participant/Peserta**: participant, peserta, participants, attendee
- **Volunteer/Sukarelawan**: volunteer, sukarelawan, helper, pembantu

### Competition Roles
- **Champion/Johan**: champion, johan, juara, winner, first, 1st
- **Runner-up/Naib Johan**: runner-up, naib johan, second, 2nd, runners up
- **Third Place/Ketiga**: third, ketiga, 3rd, third place

## Future Enhancements
The keywords feature is designed to support future improvements such as:
- Automatic keyword suggestions based on upload history
- Fuzzy matching algorithms for better role detection
- Analytics on keyword usage and effectiveness
- Export/import of keyword configurations
