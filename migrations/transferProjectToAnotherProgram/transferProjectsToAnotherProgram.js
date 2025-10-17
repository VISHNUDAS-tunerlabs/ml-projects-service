/**
 * updateProjectCertificateAndTasks.js
 *
 * Updates projects (from input.json) by:
 *  - filtering projects that have isAPrivateProgram: false and solutionId = old solution id
 *  - updating certificate.templateUrl and certificate.templateId
 *  - updating tasks referenceId and externalId according to mapping
 *  - updating taskSequence
 *  - updating solutionId/programId and solutionInformation/programInformation using fetched docs
 *  - checking certificate eligibility and calling certificate reissue API for eligible projects
 *
 * Usage:
 *  - place this file in same directory as migratePrivateProjectToPublicProject.js (or adapt paths)
 *  - create input.json with:
 *    {
 *      "userToken": "<x-authenticated-user-token>",
 *      "projectserviceApiDomain": "http://<host>",
 *      "projectIds": ["683a00203e090800080d180b", "68393f0a3e090800080ac9b8", ...]
 *    }
 *  - set .env with MONGODB_URL, APPLICATION_PORT, INTERNAL_ACCESS_TOKEN
 *  - run: node updateProjectCertificateAndTasks.js
 */

const path = require("path");
const fs = require("fs");
const _ = require("lodash");
const { MongoClient, ObjectId } = require("mongodb");
const request = require("request");
require("dotenv").config({ path: path.join(__dirname, "../../") + "/.env" });

const mongo_url = process.env.MONGODB_URL;
if (!mongo_url) {
  console.error("❌ MONGODB_URL not set in .env");
  process.exit(1);
}
const db_name = mongo_url.split("/").pop();
const url = mongo_url.split(db_name)[0];

const input_path = path.join(__dirname, "input.json");
if (!fs.existsSync(input_path)) {
  console.error(
    "❌ input.json not found. Create input.json with userToken, projectserviceApiDomain and projectIds array."
  );
  process.exit(1);
}
const input_data = JSON.parse(fs.readFileSync(input_path, "utf8"));

// validate required fields
if (!input_data.userToken) {
  console.error(
    "❌ userToken is missing in input.json. Script cannot proceed."
  );
  process.exit(1);
}
if (!input_data.projectserviceApiDomain) {
  console.error(
    "❌ projectserviceApiDomain is missing in input.json. Script cannot proceed."
  );
  process.exit(1);
}
if (
  !Array.isArray(input_data.projectIds) ||
  input_data.projectIds.length === 0
) {
  console.error("❌ projectIds array missing or empty in input.json.");
  process.exit(1);
}

const debug_mode = input_data.debugMode === true;

if (debug_mode) {
  console.log("\n---------------------------------------------");
  console.log("DEBUG MODE ENABLED — NO DB UPDATE OR API CALL");
  console.log("---------------------------------------------\n");
}

const user_token = input_data.userToken.trim();
const projectservice_api_domain = input_data.projectserviceApiDomain.trim();

// variables (lowercase as requested)
const chunk_size = 3; // configurable
const old_solution_id_str = "681c71b03d8d030008d722f1"; // filter existing solutionId
const new_solution_doc_id = new ObjectId("681c96133d8d030008d72d10");
const new_program_doc_id = new ObjectId("680893ff3d8d030008cd037a");

const new_cert_template_id = new ObjectId("681c96153d8d030008d72d26");
const new_cert_template_url =
  "certificateTemplates/681c96153d8d030008d72d26/140558b9-7df4-4993-be3c-31eb8b9ca368_8-4-2025-1746703893679.svg";

// mapping of old referenceId -> new externalId & new referenceId
const task_ref_map = {
  "681c71b03e09080008d61890": {
    externalId: "BHPBLMIP1-Task1-1746703891222",
    referenceId: "681c96133e09080008d64345",
  },
  "681c71b03e09080008d61893": {
    externalId: "BHPBLMIP1-Task2-1746703891222",
    referenceId: "681c96133e09080008d64348",
  },
  "681c71b03e09080008d61896": {
    externalId: "BHPBLMIP1-Task3-1746703891222",
    referenceId: "681c96133e09080008d6434b",
  },
  "681c71b03e09080008d61899": {
    externalId: "BHPBLMIP1-Task4-1746703891222",
    referenceId: "681c96133e09080008d6434e",
  },
  "681c71b03e09080008d6189c": {
    externalId: "BHPBLMIP1-Task5-1746703891222",
    referenceId: "681c96133e09080008d64351",
  },
  "681c71b03e09080008d6189f": {
    externalId: "BHPBLMIP1-Task6-1746703891222",
    referenceId: "681c96133e09080008d64354",
  },
  "681c71b03e09080008d618a2": {
    externalId: "BHPBLMIP1-Task7-1746703891222",
    referenceId: "681c96133e09080008d64357",
  },
  "681c71b03e09080008d618a5": {
    externalId: "BHPBLMIP1-Task8-1746703891222",
    referenceId: "681c96133e09080008d6435a",
  },
};

const new_task_sequence = [
  "BHPBLMIP1-Task1-1746703891222",
  "BHPBLMIP1-Task2-1746703891222",
  "BHPBLMIP1-Task3-1746703891222",
  "BHPBLMIP1-Task4-1746703891222",
  "BHPBLMIP1-Task5-1746703891222",
  "BHPBLMIP1-Task6-1746703891222",
  "BHPBLMIP1-Task7-1746703891222",
  "BHPBLMIP1-Task8-1746703891222",
];

// output folder (same pattern as migrate script)
const output_dir = path.join(__dirname, "output");
if (!fs.existsSync(output_dir)) {
  fs.mkdirSync(output_dir, { recursive: true });
}
const timestamp = new Date().toISOString().replace(/[:.]/g, "-");

// arrays to collect results
let successful_updates = [];
let failed_updates = [];
let certificates_to_regenerate = []; // list of project ids to call reissue
let certificates_results = [];

// create mongo connection and run
(async () => {
  let connection;
  try {
    connection = await MongoClient.connect(url, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    const db = connection.db(db_name);

    if (debug_mode) {
      const project_ids_raw = input_data.projectIds;
      const project_ids = project_ids_raw.map((id) => {
        if (
          typeof id === "string" &&
          id.length === 24 &&
          ObjectId.isValid(id)
        ) {
          return new ObjectId(id);
        }
        // keep as-is (string) if not 24 chars
        return id;
      });
      const debug_query = {
        _id: { $in: project_ids },
        isAPrivateProgram: false,
        solutionId: new ObjectId(old_solution_id_str),
      };

      const debug_matches = await db
        .collection("projects")
        .find(debug_query)
        .project({ _id: 1 })
        .toArray();

      console.log("Running debug query...");
      console.log(`Found ${debug_matches.length} matching projects in DB.`);

      let certificateCheck = await callCertificateReissue(
        "681c7ac63e09080008d6229e"
      );
      console.log(
        "Certificate reissue API call result (sample):",
        certificateCheck
      );

      console.log("---------------------------------------------");
      console.log("Debug mode finished. No database changes made.");
      console.log("---------------------------------------------");
      if (connection) await connection.close();
      process.exit(0);
    }

    // fetch new solution and program docs (will be used to populate solutionInformation/programInformation)
    const solution_doc = await db
      .collection("solutions")
      .findOne({ _id: new_solution_doc_id });
    console.log("solution_doc:", solution_doc);
    if (!solution_doc) {
      console.error(
        "❌ new solution doc not found:",
        new_solution_doc_id.toHexString()
      );
      process.exit(1);
    }
    const program_doc = await db
      .collection("programs")
      .findOne({ _id: new_program_doc_id });
    if (!program_doc) {
      console.error(
        "❌ new program doc not found:",
        new_program_doc_id.toHexString()
      );
      process.exit(1);
    }
    console.log("Fetched new solution and program docs.", program_doc);
    // prepare ids from input
    const project_ids_raw = input_data.projectIds;
    const project_ids = project_ids_raw.map((id) => {
      if (typeof id === "string" && id.length === 24 && ObjectId.isValid(id)) {
        return new ObjectId(id);
      }
      // keep as-is (string) if not 24 chars
      return id;
    });
    console.log("project_ids:", project_ids);
    // chunk processing
    const chunks = _.chunk(project_ids, chunk_size);
    for (let c = 0; c < chunks.length; c++) {
      const chunk = chunks[c];

      // find matching projects: _id in chunk, isAPrivateProgram:false, solutionId: old solution id
      const query = {
        _id: { $in: chunk },
        isAPrivateProgram: false,
        solutionId: new ObjectId(old_solution_id_str),
      };

      const projects = await db.collection("projects").find(query).toArray();
      console.log("fetched projects", projects);
      for (const project of projects) {
        const project_id_str = project._id.toString();
        try {
          const new_template_url = new_cert_template_url;

          const updated_tasks = (project.tasks || []).map((task) => {
            const original_ref = task.referenceId;

            if (!original_ref) {
              return task;
            }

            // normalize: convert ObjectId to string for lookup
            const ref_str =
              typeof original_ref === "object" &&
              original_ref._bsontype === "ObjectID"
                ? original_ref.toHexString()
                : String(original_ref);

            // check if mapping exists
            const mapping = task_ref_map[ref_str];
            if (mapping) {
              task.externalId = mapping.externalId;

              // preserve original data type
              if (
                typeof original_ref === "object" &&
                original_ref._bsontype === "ObjectID"
              ) {
                task.referenceId = new ObjectId(mapping.referenceId);
              } else {
                task.referenceId = mapping.referenceId;
              }
            }

            return task;
          });

          // 3) update taskSequence to the new one
          const updated_task_sequence = new_task_sequence;

          // 4) update solutionInformation and programInformation (use fetched docs)
          const updated_solution_information = {
            _id: solution_doc._id,
            externalId: solution_doc.externalId || "",
            description: solution_doc.description || "",
            name: solution_doc.name || "",
          };
          const updated_program_information = {
            _id: program_doc._id,
            externalId: program_doc.externalId || "",
            name: program_doc.name || "",
            description: program_doc.description || "",
          };

          // 5) prepare update doc
          const update_doc = {
            $set: {
              "certificate.templateUrl": new_template_url,
              "certificate.templateId": new_cert_template_id,
              tasks: updated_tasks,
              taskSequence: updated_task_sequence,
              solutionId: solution_doc._id,
              projectTemplateId: solution_doc.projectTemplateId,
              projectTemplateExternalId: "BHPBLMIP251-1746703891222_IMPORTED",
              solutionExternalId: solution_doc.externalId || null,
              programId: program_doc._id,
              programExternalId: program_doc.externalId || null,
              solutionInformation: updated_solution_information,
              programInformation: updated_program_information,
            },
          };

          // perform update
          const upd_res = await db
            .collection("projects")
            .updateOne({ _id: project._id }, update_doc);
          if (upd_res.matchedCount !== 1) {
            failed_updates.push({
              id: project_id_str,
              reason: "no-match-after-find-or-update",
            });
            continue;
          }
          successful_updates.push(project_id_str);

          // if project.status === 'completed' and certificate.eligible === true then schedule certificate regen
          const project_status = project.status;
          const cert_eligible =
            project.certificate && project.certificate.eligible === true;
          if (project_status === "submitted" && cert_eligible) {
            certificates_to_regenerate.push(project._id.toString());
          }
        } catch (proj_err) {
          console.error(
            "Error updating project",
            project._id.toString(),
            proj_err
          );
          failed_updates.push({
            id: project._id.toString(),
            error: String(proj_err),
          });
        }
      } // end for each project in chunk
    } // end chunks

    // Write intermediate results
    const summary_path = path.join(
      output_dir,
      `update_summary_${timestamp}.json`
    );
    fs.writeFileSync(
      summary_path,
      JSON.stringify(
        {
          successful_updates,
          failed_updates,
          certificates_to_regenerate,
          counts: {
            successful: successful_updates.length,
            failed: failed_updates.length,
            certificates_to_regenerate: certificates_to_regenerate.length,
          },
        },
        null,
        2
      ),
      "utf8"
    );
    console.log("Update summary written to", summary_path);

    // Now process certificate reissue for those flagged
    // process certificate reissue for eligible projects
    if (certificates_to_regenerate.length > 0) {
      console.log(
        `Reissuing certificates for ${certificates_to_regenerate.length} projects (in chunks of ${chunk_size})...`
      );

      const cert_chunks = _.chunk(certificates_to_regenerate, chunk_size);
      const reissue_results = [];

      for (const chunk of cert_chunks) {
        for (const project_id of chunk) {
          try {
            const result = await callCertificateReissue(project_id);
            if (result && result.success) {
              reissue_results.push({
                projectId: project_id,
                status: "success",
                message: "certificate reissued successfully",
              });
            } else {
              reissue_results.push({
                projectId: project_id,
                status: "failed",
                message: "certificate reissue API call failed",
              });
            }
          } catch (err) {
            console.error(`Error while reissuing for ${project_id}:`, err);
            reissue_results.push({
              projectId: project_id,
              status: "error",
              message: err.message,
            });
          }
        }
      }

      const output_path = path.join(
        output_dir,
        `certificate_reissue_${timestamp}.json`
      );
      fs.writeFileSync(
        output_path,
        JSON.stringify(reissue_results, null, 2),
        "utf8"
      );

      console.log(
        `✅ Certificate reissue completed. Results written to ${output_path}`
      );
    } else {
      console.log("ℹ️ No projects eligible for certificate reissue.");
    }

    console.log("Script completed. Summary file:", summary_path);
    if (connection) await connection.close();
    process.exit(0);
  } catch (err) {
    console.error("Fatal error:", err);
    if (connection) await connection.close();
    process.exit(1);
  }
})();

/**
 * callCertificateReissue - reuses request logic from migrate script
 */
function callCertificateReissue(projectId) {
  return new Promise(async (resolve, reject) => {
    try {
      const reissue_url = `${projectservice_api_domain}:${process.env.APPLICATION_PORT}/v1/userProjects/certificateReIssue/${projectId}`;
      console.log(`Calling API: ${reissue_url} for project ${projectId}`);
      const options = {
        headers: {
          "content-type": "application/json",
          "internal-access-token": process.env.INTERNAL_ACCESS_TOKEN,
          "x-authenticated-user-token": user_token,
        },
      };
      request.post(reissue_url, options, function (err, response) {
        const result = { success: false, projectId };
        if (err) {
          console.log(
            `Error calling certificate reissue for project ${projectId}:`,
            err.message
          );
          return resolve(result);
        }
        if (response && response.statusCode == 200) {
          result.success = true;
        }
        return resolve(result);
      });
    } catch (error) {
      return reject(error);
    }
  });
}
