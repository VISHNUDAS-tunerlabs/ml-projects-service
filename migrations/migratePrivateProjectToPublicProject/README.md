## Migrations

#### Steps to run the script files

This script is intended to migrate **private projects to public projects** and optionally trigger **certificate re-issue** as part of the 5.1.0 release.

In order to execute this migration script, we need to first log in to the pod where the service is running and then proceed with the provided instructions.

---

### Step 1:

Navigate to the migration script location:

```bash
cd /opt/mlprojects/migrations/migratePrivateProjectToPublicProject/
```

---

### Step 2:

Prepare the `input.json` file in the same directory with the following structure:

```json
{
  "userToken": "<valid-user-token>",
  "solutionIds": [
    "64a1234567890abcdef1234",
    "64b9876543210abcdef5678"
  ]
}
```

- **userToken** → Mandatory. If not provided, the script will not execute.  
- **solutionIds** → List of public parent solution IDs to migrate projects to.

---

### Step 3:

Run the script to migrate all matching private projects to public projects and re-issue certificates if eligible:

```bash
node migratePrivateProjectToPublicProject.js
```

---

#### Validation

- **updatedProjects.json** → Contains details of successfully updated projects and any duplicate error cases.  
- **certificateReIssueResult.json** → Contains the result of certificate re-issue calls per project.  

---

script execution was successful. ✅
