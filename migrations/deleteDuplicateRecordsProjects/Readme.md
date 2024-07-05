## Migrations

#### Steps to run the script files

This script is intended to address a particular bug in Sunbird Staging, and it is related to the 8.0.0 release.

In order to execute this migration script, we need to first log in to the pod where the service is running and then proceed with the provided instructions.

This script is designed to delete duplicate records in the projects collection which are haivng 
same userId and solutionId. By deleting these records it will enable us to create a compound key 
index on the projects collection encforcing unique record requirement and data integrity.

### Step 1:

    Navigate to /opt/projects/migrations/deleteDuplicateRecordsProjects/

### Step 2:

Run the script to delete duplicate projects.

    node deleteDuplicateRecords.js

#### Validation 

After the script has been executed in the staging environment, we can validate the data by 
using the generated `successfully_deleted_duplicated_records.json` file.

Retrieve the project IDs from `successfully_deleted_duplicated_records.json` and include them in the body of the DBfind API request as follows.

        {
          "query": {
              "_id": {
                  "$in": [
                      // Add project ids here
                      ]
                    }
          },
          "mongoIdKeys": [
              "_id"
          ],
          "projection": [

          ],
          "limit": 200,
          "skip": 0
      }

If no records are found that means all the duplicate records have been deleted and the 
script execution was successful.
