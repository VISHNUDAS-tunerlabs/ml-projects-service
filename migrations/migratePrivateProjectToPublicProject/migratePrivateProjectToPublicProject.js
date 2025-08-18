/**
 * name : migratePrivateProjectToPublicProject.js
 * author : Vishnu Das V.P
 * created-date : 11-Aug-2025
 * Description : Migration script to update projects from given public parent solution IDs
 */

const path = require("path");
const fs = require("fs");
const _ = require("lodash");
const { MongoClient, ObjectId } = require("mongodb");
const rootPath = path.join(__dirname, "../../");
require("dotenv").config({ path: rootPath + "/.env" });
const request = require("request");
const { log } = require("console");
const mongoUrl = process.env.MONGODB_URL;
const dbName = mongoUrl.split("/").pop();
const url = mongoUrl.split(dbName)[0];

let db;
let connection;
let updatedProjectIds = [];
let certificateResults = [];
let skippedDueToMissingPublicProjectSubmission = [];
const chunkSize = 10;
// Allowed teacher subtypes
const ALLOWED_SUBTYPES = [
  "TEACHER-PRECLASS2",
  "TEACHER-CLASS1-5",
  "TEACHER-CLASS3-5",
  "TEACHER-CLASS6-8",
  "TEACHER-CLASS6-10",
  "TEACHER-CLASS9-10",
  "TEACHER-CLASS11-12",
  "TEACHER-SE",
  "TEACHER-PET",
  "TEACHER-AMP",
  "TEACHER-COUNSELLOR",
  "TEACHER-WARDEN",
  "TEACHER-ANG-WORKER",
  "TEACHER-ANG-HELPER",
  "TEACHER-LIBRARIAN",
  "TEACHER-LABTECHIT",
];

// Create output folder if not exists
const outputDir = path.join(__dirname, "output");

if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}
const timestamp = new Date().toISOString().replace(/[:.]/g, "-");

// Read input.json
const inputPath = path.join(__dirname, "input.json");
if (!fs.existsSync(inputPath)) {
  console.error("❌ input.json not found. Please create it.");
  process.exit(1);
}

const inputData = JSON.parse(fs.readFileSync(inputPath, "utf8"));

// Validate required fields
if (!inputData.userToken) {
  console.error(
    "❌ userToken is missing in input.json. Script cannot proceed."
  );
  process.exit(1);
}

if (!inputData.projectserviceApiDomain) {
  console.error(
    "❌ projectserviceApiDomain is missing in input.json and APPLICATION_PORT is not set. Script cannot proceed."
  );
  process.exit(1);
}

if (inputData.skipSolutionUpdate) {
  updatedProjectIds =
    Array.isArray(inputData.projectIds) && inputData.projectIds.length > 0
      ? inputData.projectIds
      : [];
}

const userToken = inputData.userToken.trim();
let inputParentSolutionIds = [];
// Read solution IDs from input.json
inputParentSolutionIds = inputData.solutionIds.map((id) => id.trim());
(async () => {
  try {
    connection = await MongoClient.connect(url, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    db = connection.db(dbName);

    // skip solution and program update only perform certificate reIssue
    if (
      !inputData.skipSolutionUpdate &&
      inputData.skipSolutionUpdate !== true
    ) {
      if (
        Array.isArray(inputData.solutionIds) &&
        inputData.solutionIds.length > 0
      ) {
        // Use provided IDs
        inputParentSolutionIds = inputData.solutionIds.map((id) => id.trim());
      } else {
        // Fetch from DB since solutionIds not provided
        console.log(
          "solutionIds not provided, fetching all public solutions created after 2025-04-01..."
        );
        const dateThreshold = new Date("2025-04-01T00:00:00Z");

        const allPublicSolutions = await db
          .collection("solutions")
          .find(
            {
              isAPrivateProgram: false,
              isDeleted: false,
              createdAt: { $gt: dateThreshold },
            },
            {
              projection: { _id: 1 },
            }
          )
          .toArray();

        if (allPublicSolutions.length === 0) {
          console.error("❌ No public solutions found matching the criteria.");
          process.exit(1);
        }

        inputParentSolutionIds = allPublicSolutions.map((s) =>
          s._id.toString()
        );
        console.log(
          `Fetched ${inputParentSolutionIds.length} public solutions from DB.`
        );
      }

      // Convert input strings to ObjectId
      const parentSolutionObjectIds = inputParentSolutionIds.map((id) =>
        ObjectId(id)
      );

      // 1. Fetch public parent solutions where isAPrivateProgram: false
      const publicParentSolutions = await db
        .collection("solutions")
        .find({
          _id: { $in: parentSolutionObjectIds },
          isAPrivateProgram: false,
        })
        .toArray();

      if (publicParentSolutions.length === 0) {
        console.log("No public parent solutions found for the given IDs.");
        return;
      }
      console, log("publicParentSolutions", publicParentSolutions);
      // Map for quick lookup by _id string
      const publicParentMap = {};
      publicParentSolutions.forEach((sol) => {
        publicParentMap[sol._id.toString()] = sol;
      });

      // 2. Find all private child solutions with parentSolutionId in above IDs and isAPrivateProgram: true
      const privateSolutions = await db
        .collection("solutions")
        .find({
          parentSolutionId: { $in: parentSolutionObjectIds },
          isAPrivateProgram: true,
        })
        .project({ _id: 1, parentSolutionId: 1 })
        .toArray();

      if (privateSolutions.length === 0) {
        console.log(
          "No private child solutions found for the given parent solutions."
        );
        return;
      }

      // Group private solutions by their parentSolutionId for mapping updates later
      const privateSolutionIds = privateSolutions.map((sol) => sol._id);
      const privateSolutionParentMap = {};
      privateSolutions.forEach((sol) => {
        const parentIdStr = sol.parentSolutionId.toString();
        if (!privateSolutionParentMap[parentIdStr])
          privateSolutionParentMap[parentIdStr] = [];
        privateSolutionParentMap[parentIdStr].push(sol._id);
      });

      // 3. Fetch projects where:
      // solutionId in privateSolutionIds
      // isAPrivateProgram: true
      // createdAt > 2025-04-01T00:00:00Z

      // We'll process projects in chunks of 10 to avoid memory issues

      // Find all projects matching criteria (only _id + solutionId for batching)
      const projectsToUpdate = await db
        .collection("projects")
        .find({
          solutionId: { $in: privateSolutionIds },
          isAPrivateProgram: true,
        })
        .project({ _id: 1, solutionId: 1 })
        .toArray();

      if (projectsToUpdate.length === 0) {
        console.log("No projects found to update for the given criteria.");
        return;
      }

      const chunks = _.chunk(projectsToUpdate, chunkSize);
      let duplicateErrorProjectIds = [];

      for (let chunkIndex = 0; chunkIndex < chunks.length; chunkIndex++) {
        const chunk = chunks[chunkIndex];

        // Fetch full project documents for this chunk
        const projectIdsInChunk = chunk.map((p) => p._id);
        const fullProjects = await db
          .collection("projects")
          .find({
            _id: { $in: projectIdsInChunk },
          })
          .toArray();
        let solutionsForCleanup = [];
        for (const project of fullProjects) {
          const solIdStr = project.solutionId.toString();

          // Find which parent solution this private solution belongs to
          let parentSolutionIdStr = null;
          for (const [parentIdStr, solIds] of Object.entries(
            privateSolutionParentMap
          )) {
            if (solIds.find((id) => id.equals(project.solutionId))) {
              parentSolutionIdStr = parentIdStr;
              break;
            }
          }
          if (!parentSolutionIdStr) {
            console.warn(
              `Parent solution not found for project solutionId ${solIdStr}`
            );
            continue;
          }

          const parentSolution = publicParentMap[parentSolutionIdStr];
          if (!parentSolution) {
            console.warn(
              `Public parent solution details not found for id ${parentSolutionIdStr}`
            );
            continue;
          }

          // === NEW: Fetch one public project ===
          const publicProject = await db.collection("projects").findOne({
            solutionId: parentSolution._id,
            isAPrivateProgram: false,
          });

          if (!publicProject) {
            console.warn(
              `Skipping all projects for parent solution ${parentSolutionIdStr} - no public project found.`
            );
            skippedDueToMissingPublicProjectSubmission.push(
              parentSolution._id.toString()
            );
            continue; // Skip update for this project
          }

          // ---------- TARGETING CHECK ----------
          let targeted = false;

          // 1️⃣ Check scope.entityType and entities
          if (
            parentSolution.scope &&
            project.userProfile &&
            Array.isArray(project.userProfile.userLocations)
          ) {
            const { entityType, entities } = parentSolution.scope;

            const locationMatch = project.userProfile.userLocations.some(
              (loc) => loc.type === entityType && entities.includes(loc.id)
            );

            if (locationMatch) {
              // 2️⃣ Check profileUserTypes subType
              if (Array.isArray(project.userProfile.profileUserTypes)) {
                const subtypeMatch = project.userProfile.profileUserTypes.some(
                  (p) => ALLOWED_SUBTYPES.includes(p.subType)
                );

                if (subtypeMatch) {
                  targeted = true;
                }
              }
            }
          }

          if (!targeted) {
            console.log(`Skipping project ${project._id} - not targeted`);
            continue; // Skip update
          }

          // If targeted, push current solutionId to cleanup list
          solutionsForCleanup.push(project.solutionId);
          // === NEW: Update tasks ===
          if (
            Array.isArray(project.tasks) &&
            Array.isArray(publicProject.tasks)
          ) {
            project.tasks.forEach((task) => {
              const cleanedExternalId = task.externalId
                .split("-")
                .slice(0, -1)
                .join("-");
              const matchingPublicTask = publicProject.tasks.find((pubTask) =>
                pubTask.externalId.startsWith(cleanedExternalId)
              );

              if (matchingPublicTask) {
                task.referenceId = matchingPublicTask.referenceId;
                task.externalId = matchingPublicTask.externalId;
                if (matchingPublicTask.projectTemplateId) {
                  task.projectTemplateId = matchingPublicTask.projectTemplateId;
                  task.projectTemplateExternalId =
                    matchingPublicTask.projectTemplateExternalId;
                } else {
                  delete task.projectTemplateId;
                  delete task.projectTemplateExternalId;
                }
              }
            });
          }

          // === NEW: Generate entityInformation ===
          const userLocs = project.userProfile?.userLocations || [];
          const schoolLoc = userLocs.find((loc) => loc.type === "school");
          if (schoolLoc) {
            const hierarchy = userLocs.filter((loc) => loc.type !== "school");
            project.entityInformation = {
              name: schoolLoc.name,
              externalId: schoolLoc.code,
              hierarchy,
              _id: schoolLoc.id,
              entityType: "school",
              registryDetails: {
                locationId: schoolLoc.id,
                code: schoolLoc.code,
              },
            };
          }

          // -------- Post-process entityInformation --------
          if (project.entityInformation) {
            // If entityInformation._id exists → set project.entityId
            if (project.entityInformation._id) {
              project.entityId = project.entityInformation._id;
            }
          }

          // ---------- NEW: userRoleInformation ----------
          const userRoleInformation = {};
          let role;

          userLocs.forEach((loc) => {
            if (loc.type) {
              userRoleInformation[loc.type] =
                loc.type === "school" ? loc.code : loc.id;
            }
          });

          // populate role from profileUserTypes
          if (Array.isArray(project.userProfile?.profileUserTypes)) {
            role = project.userProfile.profileUserTypes[0]?.subType;
            if (role) {
              userRoleInformation.role = role;
            }
          }

          // ---------- UPDATE PROJECT ----------

          try {
            const updateDoc = {
              $set: {
                solutionId: parentSolution._id,
                solutionExternalId: parentSolution.externalId,
                programId: parentSolution.programId,
                programExternalId: parentSolution.programExternalId,
                solutionInformation: {
                  name: parentSolution.name,
                  externalId: parentSolution.externalId,
                  description: parentSolution.description || "",
                  _id: parentSolution._id,
                  certificateTemplateId:
                    parentSolution.certificateTemplateId || null,
                },
                programInformation: {
                  _id: parentSolution.programId,
                  name: parentSolution.programName || "",
                  externalId: parentSolution.programExternalId || "",
                  description: parentSolution.programDescription || "",
                  isAPrivateProgram: false,
                },
                isAPrivateProgram: false,
                tasks: project.tasks || [],
                entityInformation: project.entityInformation || null,
                projectTemplateId: parentSolution.projectTemplateId || null,
                projectTemplateExternalId:
                  publicProject.projectTemplateExternalId || null,
                userRoleInformation: userRoleInformation || null,
                userRole: role || null,
                entityId: project.entityId || null,
                migratedFromPrivateProject: true,
              },
            };

            await db
              .collection("projects")
              .updateOne({ _id: project._id }, updateDoc);

            updatedProjectIds.push(project._id.toString());
          } catch (error) {
            if (error.code === 11000) {
              // duplicate key
              console.warn(`Duplicate key for project ${project._id}`);
              duplicateErrorProjectIds.push(project._id.toString());
            } else {
              console.error(`Error updating project ${project._id}:`, error);
            }
            // Continue to the next project
            continue;
          }
        }
        let programIds;
        // After project updates
        if (solutionsForCleanup.length > 0) {
          console.log(
            `Found ${solutionsForCleanup.length} solutions for cleanup`
          );

          // Fetch solutions and validate isAPrivateProgram = true
          const solutions = await db
            .collection("solutions")
            .find(
              {
                _id: { $in: solutionsForCleanup.map((id) => ObjectId(id)) },
                isAPrivateProgram: true,
              },
              {
                projection: { _id: 1, programId: 1 },
              }
            )
            .toArray();

          if (solutions.length > 0) {
            // Extract unique programIds
            programIds = [
              ...new Set(solutions.map((s) => s.programId).filter(Boolean)),
            ];

            console.log(
              `Deleting ${solutions.length} solutions and ${programIds.length} programs`
            );

            // Delete solutions
            await db.collection("solutions").deleteMany({
              _id: { $in: solutions.map((s) => s._id) },
            });

            // Delete programs
            if (programIds.length > 0) {
              await db.collection("programs").deleteMany({
                _id: { $in: programIds },
              });
            }
          }
        }

        // Write updated project IDs to a file

        fs.writeFileSync(
          path.join(outputDir, `updatedProjects_${timestamp}.json`),
          JSON.stringify(
            {
              updatedProjectIds,
              duplicateErrorProjectIds,
              removedPrivateSolutions: solutionsForCleanup,
              removedPrivatePrograms: programIds,
              skippedDueToMissingPublicProjectSubmission,
              count: {
                updatedProjectIds: updatedProjectIds.length,
                duplicateErrorProjectIds: duplicateErrorProjectIds.length,
                removedPrivateSolutions: solutionsForCleanup.length,
                removedPrivatePrograms: programIds ? programIds.length : 0,
                skippedDueToMissingPublicProjectSubmission:
                  skippedDueToMissingPublicProjectSubmission.length,
              },
            },
            null,
            2
          )
        );
      }
    }

    if (updatedProjectIds.length > 0) {
      // Convert strings to ObjectIds if necessary
      updatedProjectIds = updatedProjectIds.map((id) => {
        try {
          return ObjectId.isValid(id) ? new ObjectId(id) : id;
        } catch (err) {
          console.error(`Invalid ID format: ${id}`);
          return id; // Keep as-is if not valid
        }
      });

      const certChunks = _.chunk(updatedProjectIds, chunkSize);

      for (const certChunk of certChunks) {
        const projectsData = await db
          .collection("projects")
          .find({
            _id: { $in: certChunk },
          })
          .toArray();

        for (const project of projectsData) {
          // No certificate object or empty
          if (
            !project.certificate ||
            Object.keys(project.certificate).length === 0
          ) {
            certificateResults.push({
              projectId: project._id,
              message: "no certificate object found",
              calledForCertificateReIssue: false,
            });
            continue;
          }

          // Check eligibility
          let eligible = await checkCertificateEligibility(project);

          if (!eligible) {
            certificateResults.push({
              projectId: project._id,
              message: "not Eligible",
              calledForCertificateReIssue: false,
            });
            continue;
          }

          // Eligible → try re-issue

          const reissueResult = await callCertificateReissue(project._id);

          if (reissueResult && reissueResult.success) {
            certificateResults.push({
              projectId: project._id,
              message: "successfully called certificate reissue",
              calledForCertificateReIssue: true,
            });
          } else {
            certificateResults.push({
              projectId: project._id,
              message: "reissue call failed",
              calledForCertificateReIssue: true,
            });
          }
        }
      }

      // Write updated project IDs to a file

      const certCount = {
        noCertificate: certificateResults.filter(
          (r) => r.message === "no certificate object found"
        ).length,
        notEligible: certificateResults.filter(
          (r) => r.message === "not Eligible"
        ).length,
        reissueFailed: certificateResults.filter(
          (r) => r.message === "reissue call failed"
        ).length,
        reissued: certificateResults.filter(
          (r) => r.message === "successfully called certificate reissue"
        ).length,
      };

      fs.writeFileSync(
        path.join(outputDir, `certificateReIssueResult_${timestamp}.json`),
        JSON.stringify({ certificateResults, count: certCount }, null, 2)
      );
    }

    console.log("Migration completed successfully.");
  } catch (err) {
    console.error("Error during migration:", err);
  } finally {
    if (connection) {
      await connection.close();
    }
  }
})();

/**
 * check project eligibility for certificate.
 * @method
 * @name checkCertificateEligibility
 * @param {Object} data - project data for certificate creation data.
 * @returns {Boolean} certificate eligibilty status.
 */
async function checkCertificateEligibility(projectData) {
  try {
    let eligible = false;
    let updateObject = { $set: {} };
    const validateCriteria = await criteriaValidation(projectData);
    if (validateCriteria.success) {
      eligible = true;
    } else {
      updateObject.$set["certificate.message"] = validateCriteria.message;
    }

    updateObject.$set["certificate.eligible"] = eligible;

    // Direct update to the projects collection
    await db
      .collection("projects")
      .updateOne({ _id: projectData._id }, updateObject);

    return eligible;
  } catch (error) {
    return {
      success: false,
      message: error.message,
    };
  }
}
/**
 * validate certificate criteria.
 * @method
 * @name criteriaValidation
 * @param {Object} data - project data for certificate creation
 * @returns
 */

async function criteriaValidation(data) {
  return new Promise(async (resolve, reject) => {
    try {
      let criteria = data.certificate.criteria; // criteria conditions for certificate
      let validationResult = [];
      let validationMessage = "";
      let validationExpression = criteria.expression;
      if (criteria.conditions && Object.keys(criteria.conditions).length > 0) {
        let conditions = criteria.conditions;
        let conditionKeys = Object.keys(conditions);

        for (let index = 0; index < conditionKeys.length; index++) {
          // correntCondition contain the prefinal level data
          let currentCondition = conditions[conditionKeys[index]];

          //now pass expression and validation scope to another function which will start the validation procedure
          let validation = await _subCriteriaValidation(
            currentCondition.conditions,
            currentCondition.expression,
            data
          );

          validationResult.push(validation.success);
          validation.success == false
            ? (validationMessage =
                validationMessage + " " + currentCondition.validationText)
            : "";
        }
        // validate criteria using defined expression
        let criteriaValidation = await _criteriaExpressionValidation(
          validationExpression,
          conditionKeys,
          validationResult
        );
        return resolve({
          success: criteriaValidation,
          message:
            criteriaValidation == false
              ? validationMessage
              : "Certificate generated successfully",
        });
      }
      return resolve({
        success: false,
      });
    } catch (error) {
      return resolve({
        success: false,
        message: error.message,
        data: {},
      });
    }
  });
}

/**
 * _subCriteriaValidation.
 * @method
 * @name _subCriteriaValidation
 * @param {Object} conditions - condition data.
 * @param {String} expression - validation expression
 * @returns {Boolean} validation.
 */

function _subCriteriaValidation(conditions, expression, data) {
  return new Promise(async (resolve, reject) => {
    try {
      let conditionKeys = Object.keys(conditions);
      let validationResult = [];
      // loop throug conditions of subcriterias
      for (let index = 0; index < conditionKeys.length; index++) {
        let currentCondition = conditions[conditionKeys[index]];
        // correntCondition contain the prefinal level data
        //now pass expression and validation scope to another function which will start the validation procedure
        let validation = await _validateCriteriaConditions(
          currentCondition,
          data
        );
        validationResult.push(validation);
      }
      // validate expression
      let subcriteriaValidation = await _criteriaExpressionValidation(
        expression,
        conditionKeys,
        validationResult
      );
      return resolve({
        success: subcriteriaValidation,
      });
    } catch (error) {
      return resolve({
        message: error.message,
        success: false,
        status: error.status ? error.status : 400,
      });
    }
  });
}

/**
 * _validateCriteriaConditions.
 * @method
 * @name _validateCriteriaConditions
 * @param {Object} condition - condition data.
 * @param {String} data - validation data
 * @returns {Boolean} validation.
 */

function _validateCriteriaConditions(condition, data) {
  return new Promise(async (resolve, reject) => {
    try {
      let result = false;
      if (!condition.function || condition.function == "") {
        if (condition.scope == "project") {
          // if validation is on completedDate
          if (condition.key == "completedDate") {
            let comparableDates = createComparableDates(
              data[condition.key],
              condition.value
            );
            data[condition.key] = comparableDates.dateOne;
            condition.value = comparableDates.dateTwo;
          }
          // validate prject value with condition value
          result = await operatorValidation(
            data[condition.key],
            condition.value,
            condition.operator
          );
        }
      } else {
        try {
          let valueFromProject = 0;
          // if: condition is in scope of project and contains a function to check
          if (condition.scope == "project") {
            // get count of attachments at project level
            valueFromProject = noOfElementsInArray(
              data[condition.key],
              condition.filter
            );
          } else if (condition.scope == "task") {
            // for task attachment validatiion _id of specific task or "all" key should be passed in an array called taskDetails
            let tasksAttachments = [];
            let projectTasks = data.tasks;
            // check tasks and taskDetails exists
            if (
              projectTasks &&
              projectTasks.length > 0 &&
              condition.taskDetails.length > 0 &&
              condition.taskDetails[0] == "all"
            ) {
              // loop through tasks to get attachments
              for (
                let tasksIndex = 0;
                tasksIndex < projectTasks.length;
                tasksIndex++
              ) {
                if (
                  projectTasks[tasksIndex][condition.key] &&
                  projectTasks[tasksIndex][condition.key].length > 0
                ) {
                  tasksAttachments.push(
                    ...projectTasks[tasksIndex][condition.key]
                  );
                }
              }
            } else if (
              projectTasks &&
              projectTasks.length > 0 &&
              condition.taskDetails.length > 0
            ) {
              // specific task Id( from projectTemplates ) or Ids are passed for attachment validation
              for (
                let tasksIndex = 0;
                tasksIndex < projectTasks.length;
                tasksIndex++
              ) {
                for (
                  let taskDetailsPointer = 0;
                  taskDetailsPointer < condition.taskDetails.length;
                  taskDetailsPointer++
                ) {
                  // get attachments data of specified task/ tasks
                  if (
                    projectTasks[tasksIndex].referenceId ==
                      condition.taskDetails[taskDetailsPointer] &&
                    projectTasks[tasksIndex][condition.key] &&
                    projectTasks[tasksIndex][condition.key].length > 0
                  ) {
                    tasksAttachments.push(
                      ...projectTasks[tasksIndex][condition.key]
                    );
                  }
                }
              }
            } else {
              return resolve(result);
            }
            if (!tasksAttachments.length > 0) {
              return resolve(result);
            }
            // get task attachments count
            valueFromProject = noOfElementsInArray(
              tasksAttachments,
              condition.filter
            );
          }
          // validate against condition value
          result = await operatorValidation(
            valueFromProject,
            condition.value,
            condition.operator
          );
        } catch (fnError) {
          return resolve(result);
        }
      }
      return resolve(result);
    } catch (error) {
      return resolve({
        message: error.message,
        success: false,
        status: error.status ? error.status : 400,
      });
    }
  });
}
/**
 * _criteriaExpressionValidation
 * @method
 * @name _criteriaExpressionValidation
 * @param {String} expression - criteria expression
 * @param {Array} keys - condition keys
 * @param {Array} result - condition result
 * @returns {Boolean} validation result.
 */

function _criteriaExpressionValidation(expression, keys, result) {
  return new Promise(async (resolve, reject) => {
    try {
      if (
        expression == "" ||
        !keys.length > 0 ||
        !result.length > 0 ||
        keys.length != result.length
      ) {
        return resolve(false);
      }
      // generate expression string that can be evaluated
      for (
        let pointerToKeys = 0;
        pointerToKeys < keys.length;
        pointerToKeys++
      ) {
        expression = expression.replace(
          keys[pointerToKeys],
          result[pointerToKeys].toString()
        );
      }
      let evalResult = eval(expression);

      return resolve(evalResult);
    } catch (error) {
      return resolve(false);
    }
  });
}

/**
 * make dates comparable
 * @function
 * @name createComparableDates
 * @param {String} dateArg1
 * @param {String} dateArg2
 * @returns {Object} - date object
 */

function createComparableDates(dateArg1, dateArg2) {
  let date1;
  if (typeof dateArg1 === "string") {
    date1 = new Date(dateArg1.replace(/(\d{2})-(\d{2})-(\d{4})/, "$2/$1/$3"));
  } else {
    date1 = new Date(dateArg1);
  }

  let date2;
  if (typeof dateArg2 === "string") {
    date2 = new Date(dateArg2.replace(/(\d{2})-(\d{2})-(\d{4})/, "$2/$1/$3"));
  } else {
    date2 = new Date(dateArg2);
  }

  date1.setHours(0);
  date1.setMinutes(0);
  date1.setSeconds(0);
  date2.setHours(0);
  date2.setMinutes(0);
  date2.setSeconds(0);
  return {
    dateOne: date1,
    dateTwo: date2,
  };
}

/**
 * validate lhs and rhs using operator passed as String/ Number
 * @function
 * @name operatorValidation
 * @param {Number or String} valueLhs
 * @param {Number or String} valueRhs
 * @returns {Boolean} - validation result
 */
function operatorValidation(valueLhs, valueRhs, operator) {
  return new Promise(async (resolve, reject) => {
    let result = false;
    if (operator == "==") {
      result = valueLhs == valueRhs ? true : false;
    } else if (operator == "!=") {
      result = valueLhs != valueRhs ? true : false;
    } else if (operator == ">") {
      result = valueLhs > valueRhs ? true : false;
    } else if (operator == "<") {
      result = valueLhs < valueRhs ? true : false;
    } else if (operator == "<=") {
      result = valueLhs <= valueRhs ? true : false;
    } else if (operator == ">=") {
      result = valueLhs >= valueRhs ? true : false;
    }
    return resolve(result);
  });
}

/**
 * count attachments
 * @function
 * @name noOfElementsInArray
 * @param {Object} data - data to count
 * @param {Object} filter -  filter data
 * @returns {Number} - attachment count
 */
function noOfElementsInArray(data, filter = {}) {
  if (!filter || !Object.keys(filter).length > 0) {
    return data.length;
  }
  if (!data.length > 0) {
    return 0;
  } else {
    if (filter.value == "all") {
      return data.length;
    } else {
      let count = 0;
      for (let attachment = 0; attachment < data.length; attachment++) {
        if (data[attachment][filter.key] == filter.value) {
          count++;
        }
      }
      return count;
    }
  }
}

// calling certificate reissue API
const callCertificateReissue = function (projectId) {
  return new Promise(async (resolve, reject) => {
    try {
      let reissueUrl = `${inputData.projectserviceApiDomain}:${process.env.APPLICATION_PORT}/v1/userProjects/certificateReIssue/${projectId}`;
      console.log(`Calling API: ${reissueUrl} for project ${projectId}`);
      const options = {
        headers: {
          "content-type": "application/json",
          "internal-access-token": process.env.INTERNAL_ACCESS_TOKEN,
          "x-authenticated-user-token": userToken,
        },
      };

      request.post(reissueUrl, options, reissueCallback);

      function reissueCallback(err, response) {
        let result = {
          success: false,
          projectId,
        };
        if (err) {
          console.log(
            `Error calling certificate reissue for project ${projectId}:`,
            err.message
          );
          result.success = false;
        } else {
          if (response.statusCode == 200) {
            result.success = true;
          }
        }

        return resolve(result);
      }
    } catch (error) {
      return reject(error);
    }
  });
};
