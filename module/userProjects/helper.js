/**
 * name : helper.js
 * author : Aman
 * created-date : 16-July-2020
 * Description : Projects helper functionality.
 */

// Dependencies

const coreService = require(GENERICS_FILES_PATH + "/services/core");
const libraryCategoriesHelper = require(MODULES_BASE_PATH + "/library/categories/helper");
const projectTemplatesHelper = require(MODULES_BASE_PATH + "/project/templates/helper");
const projectTemplateTasksHelper = require(MODULES_BASE_PATH + "/project/templateTasks/helper");
const { v4: uuidv4 } = require('uuid');
const surveyService = require(GENERICS_FILES_PATH + "/services/survey");
const reportService = require(GENERICS_FILES_PATH + "/services/report");
const projectQueries = require(DB_QUERY_BASE_PATH + "/projects");
const projectCategoriesQueries = require(DB_QUERY_BASE_PATH + "/projectCategories");
const projectTemplateQueries = require(DB_QUERY_BASE_PATH + "/projectTemplates");
const projectTemplateTaskQueries = require(DB_QUERY_BASE_PATH + "/projectTemplateTask");
const kafkaProducersHelper = require(GENERICS_FILES_PATH + "/kafka/producers");
const removeFieldsFromRequest = ["submissionDetails"];
const programsQueries = require(DB_QUERY_BASE_PATH + "/programs");
const userProfileService = require(GENERICS_FILES_PATH + "/services/users");
const solutionsHelper = require(MODULES_BASE_PATH + "/solutions/helper");
const certificateTemplateQueries = require(DB_QUERY_BASE_PATH + "/certificateTemplates");
const certificateService = require(GENERICS_FILES_PATH + "/services/certificate");
const certificateValidationsHelper = require(MODULES_BASE_PATH + "/certificateValidations/helper");
const _ = require("lodash");  
const programUsersQueries = require(DB_QUERY_BASE_PATH + "/programUsers");
const telemetryEventOnOff = process.env.TELEMETRY_ON_OFF
const entitieHelper = require(MODULES_BASE_PATH + "/entities/helper")
/**
    * UserProjectsHelper
    * @class
*/

module.exports = class UserProjectsHelper {


     /**
   * deleteUserPIIData function to delete users Data.
   * @method
   * @name deleteUserPIIData
   * @param {userDeleteEvent} - userDeleteEvent message object 
   * {
      "eid": "BE_JOB_REQUEST",
      "ets": 1619527882745,
      "mid": "LP.1619527882745.32dc378a-430f-49f6-83b5-bd73b767ad36",
      "actor": {
        "id": "delete-user",
        "type": "System"
      },
      "context": {
        "channel": "01309282781705830427",
        "pdata": {
          "id": "org.sunbird.platform",
          "ver": "1.0"
        },
        "env": "dev"
      },
      "object": {
        "id": "<deleted-userId>",
        "type": "User"
      },
      "edata": {
        "organisationId": "0126796199493140480",
        "userId": "a102c136-c6da-4c6c-b6b7-0f0681e1aab9",
        "suggested_users": [
          {
            "role": "ORG_ADMIN",
            "users": [
              "<orgAdminUserId>"
            ]
          },
          {
            "role": "CONTENT_CREATOR",
            "users": [
              "<contentCreatorUserId>"
            ]
          },
          {
            "role": "COURSE_MENTOR",
            "users": [
              "<courseMentorUserId>"
            ]
          }
        ],
        "action": "delete-user",
        "iteration": 1
      }
    }
   * @returns {Promise} success Data.
   */
    static deleteUserPIIData(userDeleteEvent) {
        return new Promise(async (resolve, reject) => {
            try{
                let userId = userDeleteEvent.edata.userId;
                let filter = {
                    userId: userId,
                }
                let updateProfile =  {
                $set: {
                    "userProfile.firstName": CONSTANTS.common.DELETED_USER,
                },
                $unset: {
                    "userProfile.email": 1,
                    "userProfile.maskedEmail": 1,
                    "userProfile.maskedPhone": 1,
                    "userProfile.recoveryEmail": 1,
                    "userProfile.phone": 1,
                    "userProfile.lastName": 1,
                    "userProfile.prevUsedPhone": 1,
                    "userProfile.prevUsedEmail": 1,
                    "userProfile.recoveryPhone": 1,
                    "userProfile.dob": 1,
                    "userProfile.encEmail": 1,
                    "userProfile.encPhone": 1
                },
                };
                let deleteUserPIIDataResult = await projectQueries.updateMany(filter, updateProfile)
                if (deleteUserPIIDataResult && deleteUserPIIDataResult.nModified > 0) {
                    if(telemetryEventOnOff !== CONSTANTS.common.OFF){
                        /**
                         * Telemetry Raw Event
                         * {"eid":"","ets":1700188609568,"ver":"3.0","mid":"e55a91cd-7964-46bc-b756-18750787fb32","actor":{},"context":{"channel":"","pdata":{"id":"projectservice","pid":"manage-learn","ver":"7.0.0"},"env":"","cdata":[{"id":"adf3b621-619b-4195-a82d-d814eecdb21f","type":"Request"}],"rollup":{}},"object":{},"edata":{}}
                         */
                        let rawEvent = await UTILS.generateTelemetryEventSkeletonStructure();
                        rawEvent.eid = CONSTANTS.common.AUDIT;
                        rawEvent.context.channel = userDeleteEvent.context.channel;
                        rawEvent.context.env = CONSTANTS.common.USER;
                        rawEvent.edata.state = CONSTANTS.common.DELETE_STATE;
                        rawEvent.edata.type = CONSTANTS.common.USER_DELETE_TYPE;
                        rawEvent.edata.props = [];
                        let userObject = {
                            id: userId,
                            type: CONSTANTS.common.USER,
                        };
                        rawEvent.actor = userObject;
                        rawEvent.object = userObject;
                        rawEvent.context.pdata.pid = `${process.env.ID}.${CONSTANTS.common.USER_DELETE_MODULE}`

                        let telemetryEvent = await UTILS.generateTelemetryEvent(rawEvent);
                        telemetryEvent.lname = CONSTANTS.common.TELEMTRY_EVENT_LOGGER;
                        telemetryEvent.level = CONSTANTS.common.INFO_LEVEL

                        await kafkaProducersHelper.pushTelemetryEventToKafka(telemetryEvent);
                    }
                    return resolve({ success: true });
                }else{
                    return resolve({ success: true });
                }
            } catch (error) {
                return reject(error);
            }
        });
    }

    /**
      * Projects boolean data.
      * @method
      * @name booleanData     
      * @returns {Array} Boolean data.
    */

    static booleanData() {

        const projectsSchema = schemas["projects"].schema;
        const projectSchemaKey = Object.keys(projectsSchema);

        let booleanProjects = [];

        projectSchemaKey.forEach(projectSchema => {
            const currentSchema = projectsSchema[projectSchema];

            if (
                currentSchema.hasOwnProperty('default') &&
                typeof currentSchema.default === "boolean"
            ) {
                booleanProjects.push(projectSchema);
            }
        });

        return booleanProjects;
    }

    /**
      * Projects object id field.
      * @method
      * @name mongooseIdData     
      * @returns {Array} Projects object id field.
    */

    static mongooseIdData() {

        const projectsSchema = schemas["projects"].schema;
        const projectSchemaKey = Object.keys(projectsSchema);

        let mongooseIds = [];

        projectSchemaKey.forEach(projectSchema => {

            const currentSchemaType = projectsSchema[projectSchema];

            if (currentSchemaType === "ObjectId") {
                mongooseIds.push(projectSchema);
            }
        });

        return mongooseIds;
    }

    /**
      * Sync project.
      * @method
      * @name sync 
      * @param {String} projectId - id of the project.
      * @param {String} lastDownloadedAt - last downloaded at time.
      * @param {Object} data - body data.
      * @param {String} userId - Logged in user id.
      * @param {String} userToken - User token.
      * @param {String} [appName = ""] - App Name.
      * @param {String} [appVersion = ""] - App Version.
      * @returns {Object} Project created information.
    */

    static sync(projectId, lastDownloadedAt, data, userId, userToken, appName = "", appVersion = "") {
        return new Promise(async (resolve, reject) => {
            try {
                
                const userProject = await projectQueries.projectDocument({
                    _id: projectId,
                    userId: userId
                }, [
                    "_id",
                    "tasks",
                    "programInformation._id",
                    "solutionInformation._id",
                    "solutionInformation.externalId",
                    "entityInformation._id",
                    "lastDownloadedAt",
                    "appInformation",
                    "status"
                ]);
                
                if (!(userProject.length > 0)) {

                    throw {
                        status: HTTP_STATUS_CODE['bad_request'].status,
                        message: CONSTANTS.apiResponses.USER_PROJECT_NOT_FOUND
                    };
                }

                if (userProject[0].lastDownloadedAt.toISOString() !== lastDownloadedAt) {
                    throw {
                        status: HTTP_STATUS_CODE['bad_request'].status,
                        message: CONSTANTS.apiResponses.USER_ALREADY_SYNC
                    };
                }

                if ( userProject[0].status == CONSTANTS.common.SUBMITTED_STATUS ) {
                    throw {
                        status: HTTP_STATUS_CODE['bad_request'].status,
                        message: CONSTANTS.apiResponses.FAILED_TO_SYNC_PROJECT_ALREADY_SUBMITTED
                    };
                }

                const projectsModel = Object.keys(schemas["projects"].schema);

                let keysToRemoveFromUpdation = ["userRoleInformation","userProfile","certificate"]
                keysToRemoveFromUpdation.forEach( key => {
                    if (data[key])delete data[key];
                })
                
                let updateProject = {};
                let projectData = await _projectData(data);
                if (projectData && projectData.success == true) {
                    updateProject = _.merge(updateProject, projectData.data);
                }
                let createNewProgramAndSolution = false;
                let solutionExists = false;

                if (data.programId && data.programId !== "") {

                    // Check if program already existed in project and if its not an existing program.
                    if (!userProject[0].programInformation) {
                        createNewProgramAndSolution = true; 
                    } else if (
                        userProject[0].programInformation &&
                        userProject[0].programInformation._id &&
                        userProject[0].programInformation._id.toString() !== data.programId
                    ) {
                        // Not an existing program.

                        solutionExists = true; 
                    }

                } else if (data.programName) {

                    if (!userProject[0].solutionInformation) {
                        createNewProgramAndSolution = true;
                    } else {
                        solutionExists = true;
                        // create new program using current name and add existing solution and remove program from it.
                    }
                }

                let addOrUpdateEntityToProject = false;

                if (data.entityId) {
                    
                    // If entity is not present in project or new entity is updated.
                    if (
                        !userProject[0].entityInformation ||
                        (
                            userProject[0].entityInformation &&
                            userProject[0].entityInformation._id !== data.entityId
                        )
                    ) {
                        addOrUpdateEntityToProject = true;
                    }
                }
                
                if (addOrUpdateEntityToProject) {

                    let entityInformation =
                        await _entitiesInformation([data.entityId]);

                    if (!entityInformation.success) {
                        return resolve(entityInformation);
                    }

                    updateProject["entityInformation"] = entityInformation.data[0];
                    updateProject.entityId = entityInformation.data[0]._id;
                }
                
                if (createNewProgramAndSolution || solutionExists) {
                    
                    let programAndSolutionInformation =
                        await this.createProgramAndSolution(
                            data.programId,
                            data.programName,
                            updateProject.entityId ? [updateProject.entityId] : "",
                            userToken,
                            userProject[0].solutionInformation && userProject[0].solutionInformation._id ?
                                userProject[0].solutionInformation._id : ""
                        );

                    if (!programAndSolutionInformation.success) {
                        return resolve(programAndSolutionInformation);
                    }

                    if (solutionExists) {

                        let updateProgram =
                            await surveyService.removeSolutionsFromProgram(
                                userToken,
                                userProject[0].programInformation._id,
                                [userProject[0].solutionInformation._id]
                            );

                        if (!updateProgram.success) {
                            throw {
                                status: HTTP_STATUS_CODE['bad_request'].status,
                                message: CONSTANTS.apiResponses.PROGRAM_NOT_UPDATED
                            }
                        }
                    }

                    updateProject =
                        _.merge(updateProject, programAndSolutionInformation.data);
                }

                let booleanData = this.booleanData(schemas["projects"].schema);
                let mongooseIdData = this.mongooseIdData(schemas["projects"].schema);

                if (data.tasks) {

                    let taskReport = {};

                    updateProject.tasks = await _projectTask(
                        data.tasks
                    );

                    if (
                        userProject[0].tasks &&
                        userProject[0].tasks.length > 0
                    ) {

                        updateProject.tasks.forEach(task => {

                            task.updatedBy = userId;
                            task.updatedAt = new Date();

                            let taskIndex =
                                userProject[0].tasks.findIndex(
                                    projectTask => projectTask._id === task._id
                                );

                            if (taskIndex < 0) {
                                userProject[0].tasks.push(
                                    task
                                );
                            } else {

                                let keepFieldsFromTask = ["observationInformation", "submissions"];
                                
                                removeFieldsFromRequest.forEach((removeField) => {
                                    delete userProject[0].tasks[taskIndex][removeField];
                                });

                                keepFieldsFromTask.forEach((field) => {
                                    if ( userProject[0].tasks[taskIndex][field] ){
                                        task[field] = userProject[0].tasks[taskIndex][field];
                                    }
                                });
                               
                                userProject[0].tasks[taskIndex] = task;
                            }
                        });

                        updateProject.tasks = userProject[0].tasks;
                    }

                    taskReport.total = updateProject.tasks.length;

                    updateProject.tasks.forEach(task => {
                        //consider tasks where isDeleted is false.
                        if ( task.isDeleted == false ) {
                            if (!taskReport[task.status]) {
                                taskReport[task.status] = 1;
                            } else {
                                taskReport[task.status] += 1;
                            }
                        } else {
                            taskReport.total = taskReport.total - 1;
                        }
                        
                    });

                    updateProject["taskReport"] = taskReport;
                }

                Object.keys(data).forEach(updateData => {
                    if (
                        !updateProject[updateData] &&
                        projectsModel.includes(updateData)
                    ) {

                        if (booleanData.includes(updateData)) {

                            updateProject[updateData] =
                                UTILS.convertStringToBoolean(data[updateData]);

                        } else if (mongooseIdData.includes(updateData)) {
                            updateProject[updateData] = ObjectId(data[updateData]);
                        } else {
                            updateProject[updateData] = data[updateData];
                        }
                    }
                });

                updateProject.updatedBy = userId;
                updateProject.updatedAt = new Date();

                if (!userProject[0].appInformation) {
                    updateProject["appInformation"] = {};

                    if (appName !== "") {
                        updateProject["appInformation"]["appName"] = appName;
                    }

                    if (appVersion !== "") {
                        updateProject["appInformation"]["appVersion"] = appVersion;
                    }
                }

                if ( data.status && data.status !== "" ) {
                   updateProject.status = UTILS.convertProjectStatus(data.status);
                }
                
                if ( data.status == CONSTANTS.common.COMPLETED_STATUS || data.status == CONSTANTS.common.SUBMITTED_STATUS ) {
                    updateProject.completedDate = new Date();
                }
                
                let projectUpdated =
                    await projectQueries.findOneAndUpdate(
                        {
                            _id: userProject[0]._id
                        },
                        {
                            $set: updateProject
                        }, {
                        new: true
                    }
                    );

                if (!projectUpdated._id) {
                    throw {
                        message: CONSTANTS.apiResponses.USER_PROJECT_NOT_UPDATED,
                        status: HTTP_STATUS_CODE['bad_request'].status
                    }
                }
                
                //  push project details to kafka
                await kafkaProducersHelper.pushProjectToKafka(projectUpdated);
            
                return resolve({
                    success: true,
                    message: CONSTANTS.apiResponses.USER_PROJECT_UPDATED,
                    data : {
                        programId : 
                        projectUpdated.programInformation && projectUpdated.programInformation._id ?
                        projectUpdated.programInformation._id : "",
                        hasAcceptedTAndC : projectUpdated.hasAcceptedTAndC ? projectUpdated.hasAcceptedTAndC : false
                    } 
                });

            } catch (error) {
                return resolve({
                    status:
                        error.status ?
                            error.status : HTTP_STATUS_CODE['internal_server_error'].status,
                    success: false,
                    message: error.message,
                    data: {}
                });
            }
        })
    }

    /**
     * Program and solution information
     * @method
     * @name createProgramAndSolution 
     * @param {String} entityId - entity id.
     * @param {String} userToken - Logged in user token.
     * @param {String} [ programId = "" ] - Program Id.
     * @param {String} [ programName = "" ] - Program Name.
     * @returns {Object} Created program and solution data.
    */

    static createProgramAndSolution(
        programId = "",
        programName = "",
        entities,
        userToken,
        solutionId,
        isATargetedSolution = ""
    ) {
        return new Promise(async (resolve, reject) => {
            try {

                let result = {};

                let programAndSolutionData = {
                    type: CONSTANTS.common.IMPROVEMENT_PROJECT,
                    subType: CONSTANTS.common.IMPROVEMENT_PROJECT,
                    isReusable: false,
                    solutionId: solutionId,
                    entities: entities
                };

                if (programName !== "") {
                    programAndSolutionData["programName"] = programName;
                }

                if (programId !== "") {
                    programAndSolutionData["programId"] = programId;
                }

                let solutionAndProgramCreation =
                    await coreService.createUserProgramAndSolution(
                        programAndSolutionData,
                        userToken,
                        isATargetedSolution
                    );
                
                if (!solutionAndProgramCreation.success) {
                    throw {
                        status: HTTP_STATUS_CODE['bad_request'].status,
                        message: CONSTANTS.apiResponses.SOLUTION_PROGRAMS_NOT_CREATED
                    };
                }

                result.solutionInformation = _.pick(
                    solutionAndProgramCreation.data.solution,
                    ["name", "externalId", "description", "_id", "entityType", "certificateTemplateId"]
                );
                
                result.solutionInformation._id =
                    ObjectId(result.solutionInformation._id);

                result["solutionId"] = ObjectId(result.solutionInformation._id);
                result["solutionExternalId"] = result.solutionInformation.externalId;

                result.programInformation = _.pick(
                    solutionAndProgramCreation.data.program,
                    ["_id", "name", "externalId", "description", "isAPrivateProgram"]
                );

                result["programId"] = ObjectId(result.programInformation._id);
                result["programExternalId"] = result.programInformation.externalId;
                result["isAPrivateProgram"] = result.programInformation.isAPrivateProgram;

                result.programInformation._id =
                    ObjectId(result.programInformation._id);

                if( solutionAndProgramCreation.data.parentSolutionInformation ){
                    result["link"] = solutionAndProgramCreation.data.parentSolutionInformation.link ? solutionAndProgramCreation.data.parentSolutionInformation.link : "";
                }

                return resolve({
                    success: true,
                    data: result
                });

            } catch (error) {
                return resolve({
                    status:
                        error.status ?
                            error.status : HTTP_STATUS_CODE['internal_server_error'].status,
                    success: false,
                    message: error.message,
                    data: {}
                });
            }
        });
    }

     /**
     * Program and solution information
     * @method
     * @name getProgramAndSolutionDetails
     * @param {Object} solutionDetails - solution details.
     * @returns {Object} return program and solution data.
     * example : 
     * response : {
        "success":true,
        "data":{
            "solutionInformation":{
                "name":"Keep Our Schools Alive (Petition) - With Certificate 2",
                "externalId":"IDEAIMP-4-1687489894154-PROJECT-SOLUTION-1688365299788",
                "description":"Leveraging the huge number of private schools to show the significance of the financial problem by creating a petition and presenting to the authorities.",
                "_id":64a268f34b9d0c124fd8ed80,
                "certificateTemplateId":64950d67955f600008e2aff3
            },
            "solutionId":64a268f34b9d0c124fd8ed80,
            "solutionExternalId":"IDEAIMP-4-1687489894154-PROJECT-SOLUTION-1688365299788",
            "programInformation":{
                "_id":64a268f34b9d0c124fd8ed7d,
                "description":"Certificate Test Program 6.0",
                "externalId":"Pgm_Certificate_Test_Program_6.0_QA-1688365299788",
                "isAPrivateProgram":true,
                "name":"Certificate Test Program 6.0"
            },
            "programId":64a268f34b9d0c124fd8ed7d,
            "programExternalId":"Pgm_Certificate_Test_Program_6.0_QA-1688365299788",
            "isAPrivateProgram":true,
            "link":"750f4f6ebb390ad5f7038a8fbc8e1c3f"
        }
        }
    */

     static getProgramAndSolutionDetails(       
        solutionDetails
    ) {
        return new Promise(async (resolve, reject) => {
            try {

                let result = {};
                result.solutionInformation = _.pick(
                    solutionDetails,
                    ["name", "externalId", "description", "_id", "entityType", "certificateTemplateId"]
                );
                
                result.solutionInformation._id =
                    ObjectId(result.solutionInformation._id);

                result["solutionId"] = ObjectId(result.solutionInformation._id);
                result["solutionExternalId"] = result.solutionInformation.externalId;
                
                // Adding program informations
                result.programInformation = {
                    _id: solutionDetails.programId,
                    description: solutionDetails.programDescription,
                    externalId: solutionDetails.programExternalId,
                    isAPrivateProgram: solutionDetails.isAPrivateProgram,
                    name: solutionDetails.programName
                };
                  

                result["programId"] = ObjectId(result.programInformation._id);
                result["programExternalId"] = result.programInformation.externalId;
                result["isAPrivateProgram"] = result.programInformation.isAPrivateProgram;

                result.programInformation._id =
                    ObjectId(result.programInformation._id);
                // Get link from parent solution
                let solutionData = await solutionsHelper.solutionDocuments({
                    _id: solutionDetails.parentSolutionId,
                },
                ["link"]);

                result["link"] = ( solutionData.length > 0 && solutionData[0].link ) ? solutionData[0].link : "";

                return resolve({
                    success: true,
                    data: result
                });

            } catch (error) {
                return resolve({
                    status:
                        error.status ?
                            error.status : HTTP_STATUS_CODE['internal_server_error'].status,
                    success: false,
                    message: error.message,
                    data: {}
                });
            }
        });
    }

    /**
     * Project details.
     * @method
     * @name details 
     * @param {String} projectId - project id.
     * @returns {Object} 
    */

    static details(projectId, userId,userRoleInformation = {}) {
        return new Promise(async (resolve, reject) => {
            try {

                const projectDetails = await projectQueries.projectDocument({
                    _id: projectId,
                    userId: userId
                }, "all",
                    [
                        "taskReport",
                        "projectTemplateId",
                        "projectTemplateExternalId",
                        "userId",
                        "createdBy",
                        "updatedBy",
                        "createdAt",
                        "updatedAt",
                        "userRoleInformation",
                        "__v"
                    ]);

                if (!(projectDetails.length > 0)) {

                    throw {
                        status: HTTP_STATUS_CODE["bad_request"].status,
                        message: CONSTANTS.apiResponses.PROJECT_NOT_FOUND
                    }
                }

                if (Object.keys(userRoleInformation).length > 0) {

                    if (!projectDetails[0].userRoleInformation || !(Object.keys(projectDetails[0].userRoleInformation).length > 0)) {
                        await projectQueries.findOneAndUpdate({
                            _id: projectId
                        },{
                            $set: {userRoleInformation: userRoleInformation}
                        });
                    }
                }

                let result = await _projectInformation(projectDetails[0]);
                
                if (!result.success) {
                    return resolve(result);
                }


                return resolve({
                    success: true,
                    message: CONSTANTS.apiResponses.PROJECT_DETAILS_FETCHED,
                    data: result.data
                });

            } catch (error) {
                return resolve({
                    status:
                        error.status ?
                            error.status : HTTP_STATUS_CODE['internal_server_error'].status,
                    success: false,
                    message: error.message,
                    data: []
                });
            }
        })
    }

    /**
      * List of library projects.
      * @method
      * @name projects
      * @param pageSize - Size of page.
      * @param pageNo - Recent page no.
      * @param search - search text.
      * @param fieldsArray - array of projections fields.
      * @param groupBy - groupBy query.
      * @returns {Object} List of library projects.
     */

    static projects(query, pageSize, pageNo, searchQuery, fieldsArray, groupBy = "") {
        return new Promise(async (resolve, reject) => {
            try {

                let matchQuery = {
                    $match: query
                };

                if (searchQuery && searchQuery.length > 0) {
                    matchQuery["$match"]["$or"] = searchQuery;
                }

                let projection = {}
                fieldsArray.forEach(field => {
                    projection[field] = 1;
                });

                let aggregateData = [];
                aggregateData.push(matchQuery);
                aggregateData.push({
                    $sort : { "syncedAt" : -1 }
                })

                if (groupBy !== "") {
                    aggregateData.push({
                        $group: groupBy
                    });
                } else {
                    aggregateData.push({
                        $project: projection
                    });
                }

                aggregateData.push(
                    {
                        $facet: {
                            "totalCount": [
                                { "$count": "count" }
                            ],
                            "data": [
                                { $skip: pageSize * (pageNo - 1) },
                                { $limit: pageSize }
                            ],
                        }
                    },
                    {
                        $project: {
                            "data": 1,
                            "count": {
                                $arrayElemAt: ["$totalCount.count", 0]
                            }
                        }
                    }
                );

                let result =
                    await projectQueries.getAggregate(aggregateData);

                return resolve({
                    success: true,
                    message: CONSTANTS.apiResponses.PROJECTS_FETCHED,
                    data: {
                        data: result[0].data,
                        count: result[0].count ? result[0].count : 0
                    }
                })

            } catch (error) {
                return resolve({
                    success: false,
                    message: error.message,
                    data: {
                        data: [],
                        count: 0
                    }
                });
            }
        })
    }

    /**
    * Get tasks from a user project.
    * @method
    * @name tasks 
    * @param {String} projectId - Project id. 
    * @param {Array} taskIds - Array of tasks ids.
    * @returns {Object} - return tasks from a project. 
  */

    static tasks(projectId, taskIds) {
        return new Promise(async (resolve, reject) => {
            try {

                let aggregatedData = [{
                    $match: {
                        _id: ObjectId(projectId)
                    }
                }];

                if (taskIds.length > 0) {

                    let unwindData = {
                        "$unwind": "$tasks"
                    }

                    let matchData = {
                        "$match": {
                            "tasks._id": { $in: taskIds }
                        }
                    };

                    let groupData = {
                        "$group": {
                            "_id": "$_id",
                            "tasks": { "$push": "$tasks" }
                        }
                    }

                    aggregatedData.push(unwindData, matchData, groupData);
                }

                let projectData = {
                    "$project": { "tasks": 1 }
                }

                aggregatedData.push(projectData);

                let projects =
                    await projectQueries.getAggregate(aggregatedData);

                return resolve({
                    success: true,
                    data: projects
                });

            } catch (error) {
                return resolve({
                    success: false,
                    data: []
                });
            }
        })
    }

    /**
     * Status of tasks.
     * @method
     * @name tasksStatus 
     * @param {String} projectId - Project id.
     * @param {Array} taskIds - Tasks ids.
     * @returns {Object}
    */

    static tasksStatus(projectId, taskIds = []) {
        return new Promise(async (resolve, reject) => {
            try {

                let tasks = await this.tasks(projectId, taskIds);

                if (!tasks.success || !(tasks.data.length > 0)) {

                    throw {
                        status: HTTP_STATUS_CODE['bad_request'].status,
                        message: CONSTANTS.apiResponses.PROJECT_NOT_FOUND
                    };
                }

                let projectTasks = tasks.data[0].tasks;
                let result = [];

                for (let task = 0; task < projectTasks.length; task++) {

                    let currentTask = projectTasks[task];

                    let data = {
                        type: currentTask.type,
                        status: currentTask.status,
                        _id: currentTask._id
                    };

                    if (
                        currentTask.type === CONSTANTS.common.ASSESSMENT ||
                        currentTask.type === CONSTANTS.common.OBSERVATION
                    ) {

                        let completedSubmissionCount = 0;

                        let minNoOfSubmissionsRequired = currentTask.solutionDetails.minNoOfSubmissionsRequired ? currentTask.solutionDetails.minNoOfSubmissionsRequired : CONSTANTS.common.DEFAULT_SUBMISSION_REQUIRED;

                        data["submissionStatus"] = CONSTANTS.common.STARTED;

                        // For 4.7 Urgent fix, need to check why observationInformation is not present at task level.
                        let submissionDetails =  {};
                        if(currentTask.observationInformation) {
                            submissionDetails = currentTask.observationInformation
                        } else if (currentTask.submissionDetails) {
                            submissionDetails = currentTask.submissionDetails
                        }

                        data["submissionDetails"] = submissionDetails;
                      
                        if ( currentTask.submissions && currentTask.submissions.length > 0 ) {

                            let completedSubmissionDoc;
                            completedSubmissionCount = currentTask.submissions.filter((eachSubmission) => eachSubmission.status === CONSTANTS.common.COMPLETED_STATUS).length;

                            if (completedSubmissionCount >= minNoOfSubmissionsRequired ) {
 
                                completedSubmissionDoc = currentTask.submissions.find(eachSubmission => eachSubmission.status === CONSTANTS.common.COMPLETED_STATUS);
                                data.submissionStatus = CONSTANTS.common.COMPLETED_STATUS;

                            } else {

                                completedSubmissionDoc = currentTask.submissions.find(eachSubmission => eachSubmission.status === CONSTANTS.common.STARTED);
                            }

                            Object.assign(data["submissionDetails"],completedSubmissionDoc)

                        } else {

                            data["submissionDetails"].status = CONSTANTS.common.STARTED;
                        }
            
                    }

                    result.push(data);
                }

                return resolve({
                    success: true,
                    message: CONSTANTS.apiResponses.TASKS_STATUS_FETCHED,
                    data: result
                });

            } catch (error) {
                return reject({
                    success: false,
                    message: error.message,
                    status:
                        error.status ?
                            error.status : HTTP_STATUS_CODE['internal_server_error'].status,
                    data: []
                });
            }
        })
    }

    /**
     * Update task.
     * @method
     * @name updateTask 
     * @param {String} projectId - Project id.
     * @param {String} taskId - Task id.
     * @param {Object} updatedData - Update data.
     * @returns {Object}
    */

    static pushSubmissionToTask(projectId, taskId, updatedData) {
        return new Promise(async (resolve, reject) => {
            try {

                let updateSubmission = [];

                let projectDocument = await projectQueries.projectDocument(
                    {
                        _id: projectId,
                        "tasks._id": taskId
                    }, [
                    "tasks"
                ]);

                let currentTask = projectDocument[0].tasks.find(task => task._id == taskId);
                let submissions = currentTask.submissions && currentTask.submissions.length > 0 ? currentTask.submissions : [] ;
                
                // if submission array is empty
                if ( !submissions && !(submissions.length > 0) ) {
                    updateSubmission.push(updatedData);
                }
                
                // submission not exist
                let checkSubmissionExist = submissions.findIndex(submission => submission._id == updatedData._id);

                if ( checkSubmissionExist == -1 ) {

                    updateSubmission = submissions;
                    updateSubmission.push(updatedData);

                } else {
                    //submission exist
                    submissions[checkSubmissionExist] = updatedData;
                    updateSubmission = submissions;
                }

                let tasksUpdated = await projectQueries.findOneAndUpdate({
                        "_id": projectId,
                        "tasks._id": taskId
                    }, {
                        $set: {
                            "tasks.$.submissions": updateSubmission
                        }
                    });

                return resolve(tasksUpdated);

            } catch (error) {
                return reject(error);
            }
        })
    }

    /**
     * Solutions details
     * @method
     * @name solutionDetails 
     * @param {String} userToken - Logged in user token.
     * @param {String} projectId - Project id.
     * @param {Array} taskId - Tasks id.
     * @returns {Object}
    */

    static solutionDetails(userToken, projectId, taskId, bodyData = {}) {
        return new Promise(async (resolve, reject) => {
            try {

                let project = await projectQueries.projectDocument(
                    {
                        "_id": projectId,
                        "tasks._id": taskId
                    }, [
                    "entityInformation._id",
                    "entityInformation.entityType",
                    "tasks.type",
                    "tasks._id",
                    "tasks.solutionDetails",
                    "tasks.submissions",
                    "tasks.observationInformation",
                    "tasks.externalId",
                    "programInformation._id",
                    "projectTemplateId"
                ]
                );
                if (!(project.length > 0)) {
                    throw {
                        status: HTTP_STATUS_CODE['bad_request'].status,
                        message: CONSTANTS.apiResponses.USER_PROJECT_NOT_FOUND
                    };
                }

                let currentTask = project[0].tasks.find(task => task._id == taskId);

                let solutionDetails = currentTask.solutionDetails;

                let assessmentOrObservationData = {};
                
                if (project[0].entityInformation && project[0].entityInformation._id && project[0].programInformation && project[0].programInformation._id) {
                
                    assessmentOrObservationData = {
                        entityId: project[0].entityInformation._id,
                        programId: project[0].programInformation._id
                    }

                    if (currentTask.observationInformation) {
                        assessmentOrObservationData = currentTask.observationInformation;
                    } else {
        
                        let assessmentOrObservation = {
                            token: userToken,
                            solutionDetails: solutionDetails,
                            entityId: assessmentOrObservationData.entityId,
                            programId: assessmentOrObservationData.programId,
                            project: {
                                "_id": projectId,
                                "taskId": taskId
                            }

                        };

                        let assignedAssessmentOrObservation =
                            solutionDetails.type === CONSTANTS.common.ASSESSMENT ?
                                await _assessmentDetails(assessmentOrObservation) :
                                await _observationDetails(assessmentOrObservation, bodyData);

                        if (!assignedAssessmentOrObservation.success) {
                            return resolve(assignedAssessmentOrObservation);
                        }

                        assessmentOrObservationData =
                            _.merge(assessmentOrObservationData, assignedAssessmentOrObservation.data);

                        if (!currentTask.solutionDetails.isReusable) {
                            assessmentOrObservationData["programId"] =
                                currentTask.solutionDetails.programId;
                        }

                        await projectQueries.findOneAndUpdate({
                            "_id": projectId,
                            "tasks._id": taskId
                        }, {
                            $set: {
                                "tasks.$.observationInformation": assessmentOrObservationData
                            }
                        });

                    }

                    assessmentOrObservationData["entityType"] = project[0].entityInformation.entityType;

                }
                
                if(currentTask.solutionDetails && !(_.isEmpty(currentTask.solutionDetails))) {

                    assessmentOrObservationData.solutionDetails = currentTask.solutionDetails;
                }

                return resolve({
                    success: true,
                    message: CONSTANTS.apiResponses.SOLUTION_DETAILS_FETCHED,
                    data: assessmentOrObservationData
                });

            } catch (error) {
                return resolve({
                    status:
                    error.status ?
                    error.status : HTTP_STATUS_CODE['internal_server_error'].status,
                    success: false,
                    message: error.message,
                    data: {}
                });
            }
        })
    }

  /**
     * Creation of user targeted projects.
     * @method
     * @name detailsV2 
     * @param {String} projectId - project id.
     * @param {String} solutionId - solution id.
     * @param {String} userId - logged in user id.
     * @param {String} userToken - logged in user token.
     * @param {Object} bodyData - Requested body data.
     * @param {String} [appName = ""] - App name.
     * @param {String} [appVersion = ""] - App version.
     * @returns {Object} Project details.
    */

   static detailsV2( projectId,solutionId,userId,userToken,bodyData,appName = "",appVersion = "",templateId = "" ) {
    
    return new Promise(async (resolve, reject) => {
        try {
            
            let solutionExternalId = "";
            
            if( templateId !== "" ) {
                
                let templateDocuments = 
                await projectTemplateQueries.templateDocument({
                    "externalId" : templateId,
                    "isReusable" : false,
                    "solutionId" : { $exists : true }
                },["solutionId","solutionExternalId"]);

                if( !(templateDocuments.length > 0) ) {
                    throw {
                        message : CONSTANTS.apiResponses.PROJECT_TEMPLATE_NOT_FOUND,
                        status : HTTP_STATUS_CODE['bad_request'].status
                    }
                }

                solutionId = templateDocuments[0].solutionId;
                solutionExternalId = templateDocuments[0].solutionExternalId;
            }
            
            if(bodyData.hasOwnProperty("detailsPayload")){
                let detailsPayload = {...bodyData.detailsPayload}
                delete bodyData.detailsPayload
                bodyData = {...detailsPayload, ...bodyData}

            }
            
            let userRoleInformation = _.omit(bodyData,["referenceFrom","submissions","hasAcceptedTAndC","link"]);
            
            if (projectId === "") {
                // This will check wether the user user is targeted to solution or not based on his userRoleInformation
                const targetedSolutionId = await coreService.checkIfSolutionIsTargetedForUserProfile(userToken,userRoleInformation,solutionId)
                //based on above api will check for projects wether its is private project or public project
                const projectDetails = await projectQueries.projectDocument({
                    solutionId: solutionId,
                    userId: userId,
                    isAPrivateProgram: targetedSolutionId.data.isATargetedSolution ? false : true
                }, ["_id"]);
                if( projectDetails.length > 0 ) {
                    projectId = projectDetails[0]._id;
                } else {
                    let isAPrivateSolution = (targetedSolutionId.data.isATargetedSolution === false)  ? true : false;
                    let solutionDetails = {}

                    if( templateId === "" ) {
                        // If solution Id of a private program is passed, fetch solution details
                        if ( isAPrivateSolution && solutionId != "" ) {
                            solutionDetails = await solutionsHelper.solutionDocuments({
                                _id: solutionId,
                                isAPrivateProgram: true
                            },
                            [
                                "name",
                                "externalId",
                                "description",
                                "programId",
                                "programName",
                                "programDescription",
                                "programExternalId",
                                "isAPrivateProgram",
                                "projectTemplateId",
                                "entityType",
                                "entityTypeId",
                                "language",
                                "creator"
                            ]);
                            if( !(solutionDetails.length > 0) ) {
                                throw {
                                    status : HTTP_STATUS_CODE["bad_request"].status,
                                    message : CONSTANTS.apiResponses.SOLUTION_NOT_FOUND
                                }
                            }
                            solutionDetails = solutionDetails[0];
                        } else {
                            solutionDetails = 
                            await coreService.solutionDetailsBasedOnRoleAndLocation(
                                userToken,
                                bodyData,
                                solutionId,
                                isAPrivateSolution
                            );

                            if( !solutionDetails.success || (solutionDetails.data.data && !(solutionDetails.data.data.length > 0)) ) {
                                throw {
                                    status : HTTP_STATUS_CODE["bad_request"].status,
                                    message : CONSTANTS.apiResponses.SOLUTION_DOES_NOT_EXISTS_IN_SCOPE
                                }
                            }

                            solutionDetails = solutionDetails.data;
                        }

                    } else {
                        
                        solutionDetails =
                        await surveyService.listSolutions([solutionExternalId]);
                        if( !solutionDetails.success ) {
                            throw {
                                message : CONSTANTS.apiResponses.SOLUTION_NOT_FOUND,
                                status : HTTP_STATUS_CODE['bad_request'].status
                            }
                        }
                        
                        solutionDetails = solutionDetails.data[0];
                        
                    }
                    // check for requestForPIIConsent data
                    let queryData = {};
                    queryData["_id"] = solutionDetails.programId;
                    let programDetails = await programsQueries.programsDocument(queryData,["requestForPIIConsent"]);
                    
                    // if requestForPIIConsent not there do not call program join
                    if ( programDetails.length > 0 && programDetails[0].hasOwnProperty('requestForPIIConsent')) {
                        
                        // program join API call it will increment the noOfResourcesStarted counter and will make user join program
                        // before creating any project this api has to called 
                        let programUsers = await programUsersQueries.programUsersDocument(
                            {
                                userId : userId,
                                programId : solutionDetails.programId
                            },
                            [
                                "_id",
                                "resourcesStarted"
                            ]
                        );
        
                        if (!(programUsers.length > 0) || ( programUsers.length > 0 && programUsers[0].resourcesStarted == false)) {
                            let programJoinBody = {};
                            programJoinBody.userRoleInformation = userRoleInformation;
                            programJoinBody.isResource = true;
                            programJoinBody.consentShared = true;
                            let joinProgramData = await coreService.joinProgram (
                                solutionDetails.programId,
                                programJoinBody,
                                userToken
                            );
                            if ( !joinProgramData.success ) {
                                return resolve({ 
                                    status: HTTP_STATUS_CODE.bad_request.status, 
                                    message: CONSTANTS.apiResponses.PROGRAM_JOIN_FAILED
                                });
                            }
                        }
                    }
                    
                    let projectCreation = 
                    await this.userAssignedProjectCreation(
                        solutionDetails.projectTemplateId,
                        userId,
                        userToken
                    );

                    if( !projectCreation.success ) {
                        return resolve(projectCreation);
                    }
                    
                    projectCreation.data["isAPrivateProgram"] = 
                    solutionDetails.isAPrivateProgram;
    
                    projectCreation.data.programInformation = {
                        _id : ObjectId(solutionDetails.programId),
                        externalId : solutionDetails.programExternalId,
                        description : 
                        solutionDetails.programDescription ? solutionDetails.programDescription : "",
                        name : solutionDetails.programName
                    }
    
                    projectCreation.data.solutionInformation = {
                        _id : ObjectId(solutionDetails._id),
                        externalId : solutionDetails.externalId,
                        description : 
                        solutionDetails.description ? 
                        solutionDetails.description : "",
                        name : solutionDetails.name
                    };
    
                    projectCreation.data["programId"] = 
                    projectCreation.data.programInformation._id;
    
                    projectCreation.data["programExternalId"] = 
                    projectCreation.data.programInformation.externalId;
    
                    projectCreation.data["solutionId"] = 
                    projectCreation.data.solutionInformation._id;
    
                    projectCreation.data["solutionExternalId"] = 
                    projectCreation.data.solutionInformation.externalId;
    
                    projectCreation.data["userRole"] = 
                    bodyData.role;
    
                    projectCreation.data["appInformation"] = {};
    
                    if( appName !== "" ) {
                        projectCreation.data["appInformation"]["appName"] = appName;
                    }
    
                    if( appVersion !== "" ) {
                        projectCreation.data["appInformation"]["appVersion"] = appVersion;
                    }
                    
                    if ( solutionDetails.certificateTemplateId && solutionDetails.certificateTemplateId !== "" ) {
                        // <- Add certificate template details to projectCreation data if present ->
                        const certificateTemplateDetails = await certificateTemplateQueries.certificateTemplateDocument({
                            _id : solutionDetails.certificateTemplateId
                        });
                        
                        // create certificate object and add data if certificate template is present.
                        if ( certificateTemplateDetails.length > 0 ) {
                            projectCreation.data["certificate"] = _.pick(certificateTemplateDetails[0], ['templateUrl', 'status', 'criteria']);
                            projectCreation.data["certificate"]["templateId"] = solutionDetails.certificateTemplateId;
                        }
                    }
                    
                    let getUserProfileFromObservation = false;
    
                    if( bodyData && Object.keys(bodyData).length > 0 ) {
    
                        if( bodyData.hasAcceptedTAndC ) {
                            projectCreation.data.hasAcceptedTAndC = bodyData.hasAcceptedTAndC;
                        }
                        if( bodyData.link ) {
                            projectCreation.data.link = bodyData.link;
                        }

                        if( bodyData.referenceFrom ) {
                            projectCreation.data.referenceFrom = bodyData.referenceFrom;
                            
                            if( bodyData.submissions ) {
                                if ( bodyData.submissions.observationId && bodyData.submissions.observationId != "" ) {
                                    getUserProfileFromObservation = true;
                                }
                                projectCreation.data.submissions = bodyData.submissions;

                                let entityInformation = 
                                await entitieHelper.listByLocationIds(
                                    [bodyData.submissions.entityId] 
                                );
    
                                if( !entityInformation.success ) {
                                    throw {
                                        message : CONSTANTS.apiResponses.ENTITY_NOT_FOUND,
                                        status : HTTP_STATUS_CODE['bad_request'].status
                                    }
                                }
    
                                let entityDetails = await _entitiesMetaInformation(
                                    entityInformation.data
                                );
    
                                if ( entityDetails && entityDetails.length > 0 ) {
                                    projectCreation.data["entityInformation"] = entityDetails[0];
                                }
            
                                projectCreation.data.entityId = entityInformation.data[0]._id;
                            }
                        } else {
                            if( 
                                solutionDetails.entityType && bodyData[solutionDetails.entityType] 
                            ) {
                                let entityInformation = 
                                await entitieHelper.listByLocationIds(
                                    [bodyData[solutionDetails.entityType]] 
                                );
    
                                if( !entityInformation.success ) {
                                    throw {
                                        message : CONSTANTS.apiResponses.ENTITY_NOT_FOUND,
                                        status : HTTP_STATUS_CODE['bad_request'].status
                                    }
                                }
    
                                let entityDetails = await _entitiesMetaInformation(
                                    entityInformation.data
                                );
    
                                if ( entityDetails && entityDetails.length > 0 ) {
                                    projectCreation.data["entityInformation"] = entityDetails[0];
                                }
            
                                projectCreation.data.entityId = entityInformation.data[0]._id;
                            }
                        }
    
                        if( bodyData.role ) {
                            projectCreation.data["userRole"] = bodyData.role;
                        }
    
                    }
    
                    projectCreation.data.status = CONSTANTS.common.STARTED;
                    projectCreation.data.lastDownloadedAt = new Date();
                    
                    // fetch userRoleInformation from observation if referenecFrom is observation
                    let addReportInfoToSolution = false;
                    if ( getUserProfileFromObservation ){

                        let observationDetails = await surveyService.observationDetails(
                            userToken,
                            bodyData.submissions.observationId
                        );
                        

                        if( observationDetails.data &&
                            Object.keys(observationDetails.data).length > 0 && 
                            observationDetails.data.userRoleInformation &&
                            Object.keys(observationDetails.data.userRoleInformation).length > 0
                        ) {

                            userRoleInformation = observationDetails.data.userRoleInformation;
                            
                        }

                        if( observationDetails.data &&
                            Object.keys(observationDetails.data).length > 0 && 
                            observationDetails.data.userProfile &&
                            Object.keys(observationDetails.data.userProfile).length > 0
                        ) {

                            projectCreation.data.userProfile = observationDetails.data.userProfile;
                            addReportInfoToSolution = true; 
                            
                        } else {
                            //Fetch user profile information by calling sunbird's user read api.

                            let userProfile = await userProfileService.profile(userToken, userId);
                            if ( userProfile.success && 
                                 userProfile.data &&
                                 userProfile.data.response
                            ) {
                                    projectCreation.data.userProfile = userProfile.data.response;
                                    addReportInfoToSolution = true; 
                            } else {
                                throw {
                                    message: CONSTANTS.apiResponses.FAILED_TO_START_RESOURCE,
                                    status: HTTP_STATUS_CODE["failed_dependency"].status,
                                };
                            }
                        } 

                    } else {
                        //Fetch user profile information by calling sunbird's user read api.

                        let userProfileData = await userProfileService.profile(userToken, userId);
                        if ( userProfileData.success && 
                             userProfileData.data &&
                             userProfileData.data.response
                        ) {
                                projectCreation.data.userProfile = userProfileData.data.response;
                                addReportInfoToSolution = true; 
                        } else {
                            throw {
                                message: CONSTANTS.apiResponses.FAILED_TO_START_RESOURCE,
                                status: HTTP_STATUS_CODE["failed_dependency"].status,
                            };
                        }
                    }
                    
                    projectCreation.data.userRoleInformation = userRoleInformation;
                    
                    //compare & update userProfile with userRoleInformation
                    if ( projectCreation.data.userProfile && userRoleInformation && Object.keys(userRoleInformation).length > 0 && Object.keys(projectCreation.data.userProfile).length > 0 ) {

                        let updatedUserProfile = await _updateUserProfileBasedOnUserRoleInfo(
                            projectCreation.data.userProfile,
                            userRoleInformation
                        );

                        if (updatedUserProfile && updatedUserProfile.success == true && updatedUserProfile.profileMismatchFound == true) {
                            projectCreation.data.userProfile = updatedUserProfile.data;
                        }
                        // checking the reqbody data and userLocation type matches or not
                        for (let key in userRoleInformation) {
                            // Skip role validation
                            if (key === 'role') {
                                continue;
                            }
                            let dataPresent;
                            if (key === 'school') {
                                dataPresent = projectCreation.data.userProfile.userLocations.find(location => location.code === userRoleInformation[key]);
                            } else {
                                dataPresent = projectCreation.data.userProfile.userLocations.find(location => location.id === userRoleInformation[key]);
                            }
                            if (!dataPresent) {
                                throw {
                                    message: CONSTANTS.apiResponses.FAILED_TO_START_RESOURCE,
                                    status: HTTP_STATUS_CODE["failed_dependency"].status,
                                };
                            }
                        } 
                    } else {
                        throw {
                            message: CONSTANTS.apiResponses.FAILED_TO_START_RESOURCE,
                            status: HTTP_STATUS_CODE["failed_dependency"].status,
                        };
                    }
                    let project = await projectQueries.createProject(projectCreation.data);
                    
                    if ( addReportInfoToSolution && project.solutionId ) {
                        let updateSolution = await solutionsHelper.addReportInformationInSolution(
                            project.solutionId,
                            project.userProfile
                        ); 
                    }

                    await kafkaProducersHelper.pushProjectToKafka(project);
                    
                    projectId = project._id;
                }
            }

            let projectDetails = await this.details(
                projectId, 
                userId,
                userRoleInformation
            );
            
            let revertStatusorNot = UTILS.revertStatusorNot(appVersion);
            if ( revertStatusorNot ) {
                projectDetails.data.status = UTILS.revertProjectStatus(projectDetails.data.status);
            } else {
                projectDetails.data.status = UTILS.convertProjectStatus(projectDetails.data.status);
            }
            // make templateUrl downloadable befor passing to front-end
            if ( projectDetails.data.certificate &&
                 projectDetails.data.certificate.templateUrl &&
                 projectDetails.data.certificate.templateUrl !== "" 
            ) {
                let certificateTemplateDownloadableUrl =
                    await coreService.getDownloadableUrl(
                        {
                            filePaths: [projectDetails.data.certificate.templateUrl]
                        }
                    );
                    if ( certificateTemplateDownloadableUrl.success ) {
                        projectDetails.data.certificate.templateUrl = certificateTemplateDownloadableUrl.data[0].url;
                    }
            } 

            return resolve({
                success: true,
                message: CONSTANTS.apiResponses.PROJECT_DETAILS_FETCHED,
                data: projectDetails.data
            });

        } catch (error) {
            return resolve({
                status:
                error.status ?
                error.status : HTTP_STATUS_CODE['internal_server_error'].status,
                success: false,
                message: error.message,
                data: []
            });
        }
    })
}

    /**
   * User assigned project creation data.
   * @method
   * @name userAssignedProjectCreation
   * @param {String} templateId - Project template id.
   * @param {String} userId - Logged in user id.
   * @param {String} userToken - Logged in user token.
   * @returns {String} - message.
   */

    static userAssignedProjectCreation(templateId, userId, userToken) {
        return new Promise(async (resolve, reject) => {
            try {
                const projectTemplateData =
                    await projectTemplateQueries.templateDocument({
                        status: CONSTANTS.common.PUBLISHED,
                        _id: templateId,
                        isReusable: false
                    }, "all",
                        [
                            "ratings",
                            "noOfRatings",
                            "averageRating"
                        ]);

                if (!(projectTemplateData.length > 0)) {
                    throw {
                        message: CONSTANTS.apiResponses.SOLUTION_NOT_FOUND,
                        status: HTTP_STATUS_CODE['bad_request'].status
                    }
                }

                let result = { ...projectTemplateData[0] };

                result.projectTemplateId = result._id;
                result.projectTemplateExternalId = result.externalId;
                result.userId = userId;
                result.createdBy = userId;
                result.updatedBy = userId;

                result.createdAt = new Date();
                result.updatedAt = new Date();

                result.assesmentOrObservationTask = false;

                if (projectTemplateData[0].tasks && projectTemplateData[0].tasks.length > 0) {

                    const tasksAndSubTasks =
                        await projectTemplatesHelper.tasksAndSubTasks(
                            projectTemplateData[0]._id
                        );
        
                    if (tasksAndSubTasks.length > 0) {

                        result.tasks = _projectTask(tasksAndSubTasks);
                        result.tasks.forEach(task => {
                            if (
                                task.type === CONSTANTS.common.ASSESSMENT ||
                                task.type === CONSTANTS.common.OBSERVATION
                            ) {
                                result.assesmentOrObservationTask = true;
                            }
                        });


                        let taskReport = {
                            total: result.tasks.length
                        };

                        result.tasks.forEach(task => {
                            if ( task.isDeleted == false ) {

                                if (!taskReport[task.status]) {
                                    taskReport[task.status] = 1;
                                } else {
                                    taskReport[task.status] += 1;
                                }

                            } else {
                                taskReport.total = taskReport.total - 1; 
                            }
                            
                        });

                        result["taskReport"] = taskReport;

                    }
                }

                delete result._id;

                return resolve({
                    success: true,
                    message: CONSTANTS.apiResponses.UPDATED_DOCUMENT_SUCCESSFULLY,
                    data: result
                });

            } catch (error) {
                return resolve({
                    status:
                        error.status ?
                            error.status : HTTP_STATUS_CODE['internal_server_error'].status,
                    success: false,
                    message: error.message,
                    data: {}
                });
            }
        });
    }

    /**
       * Add project.
       * @method
       * @name add 
       * @param {Object} data - body data.
       * @param {String} userId - Logged in user id.
       * @param {String} userToken - User token.
       * @param {String} [appName = ""] - App Name.
       * @param {String} [appVersion = ""] - App Version.
       * @returns {Object} Project created information.
     */

    static add(data, userId, userToken, appName = "", appVersion = "") {
        return new Promise(async (resolve, reject) => {
            try {
                const projectsModel = Object.keys(schemas["projects"].schema);
                let createProject = {};

                createProject["userId"] = createProject["createdBy"] = createProject["updatedBy"] = userId;

                //Fetch user profile information by calling sunbird's user read api.

                let userProfile = await userProfileService.profile(userToken, userId);
                if ( userProfile.success && 
                     userProfile.data &&
                     userProfile.data.response
                ) {
                    createProject.userProfile = userProfile.data.response;
                } 

                

                let projectData = await _projectData(data);
                if (projectData && projectData.success == true) {
                    createProject = _.merge(createProject, projectData.data);
                }

                let createNewProgramAndSolution = false;

                if (data.programId && data.programId !== "") {
                    createNewProgramAndSolution = false;
                }
                else if (data.programName) {
                    createNewProgramAndSolution = true;
                }
                
                if (data.entityId) {
                    let entityInformation =
                        await _entitiesInformation([data.entityId]);

                    if (!entityInformation.success) {
                        return resolve(entityInformation);
                    }

                    createProject["entityInformation"] = entityInformation.data[0];
                    createProject.entityId = entityInformation.data[0]._id;
                }
                if (createNewProgramAndSolution) {

                    let programAndSolutionInformation =
                        await this.createProgramAndSolution(
                            data.programId,
                            data.programName,
                            createProject.entityId ? [createProject.entityId] : "",
                            userToken
                        );

                    if (!programAndSolutionInformation.success) {
                        return resolve(programAndSolutionInformation);
                    }
                    createProject =
                        _.merge(createProject, programAndSolutionInformation.data);
                } 

                if (data.programId && data.programId !== "") {

                    let queryData = {};
                    queryData["_id"] = data.programId;
                    let programDetails = await programsQueries.programsDocument(queryData,
                            [
                                "_id",
                                "name",
                                "description",
                                "isAPrivateProgram"
                            ]
                    );
                    if( !(programDetails.length > 0) ){
                        throw {
                            status: HTTP_STATUS_CODE['bad_request'].status,
                            message: CONSTANTS.apiResponses.PROGRAM_NOT_FOUND
                        };
                    } 
                    let programInformationData = {};
                    programInformationData["programInformation"] = programDetails[0];
                    createProject =
                        _.merge(createProject, programInformationData);
                }
                

                if (data.tasks) {

                    let taskReport = {};

                    createProject.tasks = await _projectTask(
                        data.tasks
                    );

                    taskReport.total = createProject.tasks.length;

                    createProject.tasks.forEach(task => {
                        if ( task.isDeleted == false ) {
                            if (!taskReport[task.status]) {
                                taskReport[task.status] = 1;
                            } else {
                                taskReport[task.status] += 1;
                            }
                        } else {
                            //if task is deleted it is not counted in total.
                            taskReport.total = taskReport.total - 1;
                        }
                        
                    });

                    createProject["taskReport"] = taskReport;
                }

                let booleanData = this.booleanData(schemas["projects"].schema);
                let mongooseIdData = this.mongooseIdData(schemas["projects"].schema);


                Object.keys(data).forEach(updateData => {
                    if (
                        !createProject[updateData] &&
                        projectsModel.includes(updateData)
                    ) {

                        if (booleanData.includes(updateData)) {

                            createProject[updateData] =
                                UTILS.convertStringToBoolean(data[updateData]);

                        } else if (mongooseIdData.includes(updateData)) {
                            createProject[updateData] = ObjectId(data[updateData]);
                        } else {
                            createProject[updateData] = data[updateData];
                        }
                    }
                });

                createProject["appInformation"] = {};
                if (appName !== "") {
                    createProject["appInformation"]["appName"] = appName;
                }

                if (appVersion !== "") {
                    createProject["appInformation"]["appVersion"] = appVersion;
                }

                createProject["lastDownloadedAt"] = new Date();

                if (data.profileInformation) {
                    createProject.userRoleInformation = data.profileInformation;
                }

                createProject.status = UTILS.convertProjectStatus(data.status);
                let userProject = await projectQueries.createProject(
                    createProject
                );
                
                await kafkaProducersHelper.pushProjectToKafka(userProject);

                if (!userProject._id) {
                    throw {
                        message: CONSTANTS.apiResponses.USER_PROJECT_NOT_CREATED,
                        status: HTTP_STATUS_CODE['bad_request'].status
                    }
                }

                return resolve({
                    success: true,
                    message: CONSTANTS.apiResponses.PROJECT_CREATED,
                    data: {
                        programId:
                        userProject.programInformation && userProject.programInformation._id ?
                        userProject.programInformation._id : data.programId,
                        projectId: userProject._id,
                        lastDownloadedAt: userProject.lastDownloadedAt,
                        hasAcceptedTAndC : userProject.hasAcceptedTAndC ? userProject.hasAcceptedTAndC : false
                    }
                });
            } catch (error) {
                return resolve({
                    status:
                        error.status ?
                            error.status : HTTP_STATUS_CODE['internal_server_error'].status,
                    success: false,
                    message: error.message,
                    data: {}
                });
            }
        })
    }


     /**
       * share project and task pdf report.
       * @method
       * @name share 
       * @param {String} [projectId] - projectId.
       * @returns {Object} Downloadable pdf url.
     */

    static share(projectId = "", taskIds = [], userToken,appVersion) {
        return new Promise(async (resolve, reject) => {
            try {

                let projectPdf = true;
                let projectDocument = [];

                let query = {
                    _id: projectId,
                    isDeleted: false
                }

                if (!taskIds.length ) {

                    projectDocument = await projectQueries.projectDocument
                    (
                        query,
                        [
                            "title",
                            "status",  
                            "metaInformation.goal",
                            "metaInformation.duration",
                            "startDate",
                            "description",
                            "endDate",
                            "tasks",
                            "categories",
                            "programInformation.name",
                            "recommendedFor",
                            "link",
                            "remarks",
                            "attachments",
                            "taskReport.completed"
                        ]
                    );
                }
                else {
                    projectPdf = false;
                    
                    let aggregateData = [
                    { "$match": { _id: ObjectId(projectId), isDeleted: false} },
                    { "$project": {
                        "status": 1, "title": 1, "startDate": 1, "metaInformation.goal": 1, "metaInformation.duration":1,
                        "categories" : 1, "programInformation.name": 1, "description" : 1, "recommendedFor" : 1, "link" : 1, "remarks" : 1, "attachments" : 1,  "taskReport.completed" : 1,
                        tasks: { "$filter": {
                            input: '$tasks',
                            as: 'tasks',
                            cond: { "$in": ['$$tasks._id', taskIds]}
                        }}
                    }}]
                   
                    projectDocument = await projectQueries.getAggregate(aggregateData);
                }
              
                if (!projectDocument.length) {
                    throw {
                        message: CONSTANTS.apiResponses.PROJECT_NOT_FOUND,
                        status: HTTP_STATUS_CODE['bad_request'].status
                    }
                }

                projectDocument = projectDocument[0];
                projectDocument.goal = projectDocument.metaInformation ? projectDocument.metaInformation.goal : "";
                projectDocument.duration = projectDocument.metaInformation ? projectDocument.metaInformation.duration : "";
                projectDocument.programName = projectDocument.programInformation ? projectDocument.programInformation.name : "";
                projectDocument.remarks = projectDocument.remarks ? projectDocument.remarks : "";
                projectDocument.taskcompleted = projectDocument.taskReport.completed ? projectDocument.taskReport.completed : CONSTANTS.common.DEFAULT_TASK_COMPLETED;
                
                //store tasks and attachment data into object
                let projectFilter = {
                    tasks : projectDocument.tasks,
                    attachments : projectDocument.attachments
                }
                
                //returns project tasks and attachments with downloadable urls
                let projectDataWithUrl = await _projectInformation( projectFilter );

                //replace projectDocument Data 
                if ( projectDataWithUrl.success && 
                     projectDataWithUrl.data && 
                     projectDataWithUrl.data.tasks && 
                     projectDataWithUrl.data.tasks.length > 0
                ) {
                    
                    projectDocument.tasks = projectDataWithUrl.data.tasks ;
                }

                if ( projectDataWithUrl.success && 
                     projectDataWithUrl.data && 
                     projectDataWithUrl.data.attachments && 
                     projectDataWithUrl.data.attachments.length > 0
                ) {
                   projectDocument.attachments = projectDataWithUrl.data.attachments ;
                }
               

                //get image link and other document links
                let imageLink = [];
                let evidenceLink = [];
                if ( projectDocument.attachments && projectDocument.attachments.length > 0 ) {
                    projectDocument.attachments.forEach( attachment => {
                        if( attachment.type == CONSTANTS.common.IMAGE_DATA_TYPE && attachment.url && attachment.url !== "" ) {
                            imageLink.push( attachment.url );
                        } else if ( attachment.type == CONSTANTS.common.ATTACHMENT_TYPE_LINK && attachment.name && attachment.name !== "" ) {
                            let data = {
                                type : attachment.type,
                                url : attachment.name
                            }
                            evidenceLink.push( data );
                        } else if ( attachment.url && attachment.url !== "" ) {
                            let data = {
                                type : attachment.type,
                                url : attachment.url
                            }
                            evidenceLink.push( data );
                        }
                    })
                }
                projectDocument.evidenceLink = evidenceLink;       
                projectDocument.imageLink = imageLink;
                        
                projectDocument.category = [];       

                if (projectDocument.categories && projectDocument.categories.length > 0) {
                    projectDocument.categories.forEach( category => {
                        projectDocument.category.push(category.name);
                    })
                }

                projectDocument.recommendedForRoles = [];

                if (projectDocument.recommendedFor && projectDocument.recommendedFor.length > 0) {
                    projectDocument.recommendedFor.forEach( recommend => {
                        projectDocument.recommendedForRoles.push(recommend.code);
                    })
                }
                
                let tasks = [];
                if (projectDocument.tasks.length > 0) {
                    projectDocument.tasks.forEach( task => {
                        let subtasks = [];
                        if (!task.isDeleted) {
                           if (task.children.length > 0) {
                               task.children.forEach(children => {
                                   if (!children.isDeleted) {
                                       subtasks.push(children);
                                   }
                               })
                           }
                           task.children = subtasks;
                           tasks.push(task);
                        }
                    })
                    projectDocument.tasks = tasks;
                }

                delete projectDocument.categories;
                delete projectDocument.metaInformation;
                delete projectDocument.programInformation;
                delete projectDocument.recommendedFor;
                
                if (UTILS.revertStatusorNot(appVersion)) {
                    projectDocument.status = UTILS.revertProjectStatus(projectDocument.status);
                }
                let response = await reportService.projectAndTaskReport(userToken, projectDocument, projectPdf);

                if (response && response.success == true) {
                    return resolve({
                        success: true,
                        message: CONSTANTS.apiResponses.REPORT_GENERATED_SUCCESSFULLY,
                        data: {
                            data: {
                                downloadUrl: response.data.pdfUrl
                            }
                        }
                    });
                }

                else {
                    throw {
                        message: CONSTANTS.apiResponses.COULD_NOT_GENERATE_PDF_REPORT,
                    }
                }

            } catch (error) {
                return resolve({
                    status:
                        error.status ?
                            error.status : HTTP_STATUS_CODE['internal_server_error'].status,
                    success: false,
                    message: error.message,
                    data: {}
                });
            }
        })
    }

    /**
    * Get list of user projects with the targetted ones.
    * @method
    * @name userAssigned 
    * @param {String} userId - Logged in user id.
    * @param {Number} pageSize - Page size.
    * @param {Number} pageNo - Page No.
    * @param {String} search - Search text.
    * @param {String} filter - filter text.
    * @returns {Object}
   */

  static userAssigned( userId,pageSize,pageNo,search, filter ) {
    return new Promise(async (resolve, reject) => {
        try {

            let query = {
                userId : userId,
                isDeleted : false
            }

            let searchQuery = [];

            if (search !== "") {
                searchQuery = [
                    { "title" : new RegExp(search, 'i') },
                    { "description" : new RegExp(search, 'i') }
                ];
            }

            if ( filter && filter !== "" ) {
                if( filter === CONSTANTS.common.CREATED_BY_ME ) {
                    query["referenceFrom"] = {
                        $ne : CONSTANTS.common.LINK
                    };
                    query["isAPrivateProgram"] = {
                        $ne : false
                    };
                } else if( filter == CONSTANTS.common.ASSIGN_TO_ME ) {
                    query["isAPrivateProgram"] = false;
                } else{
                    query["referenceFrom"] = CONSTANTS.common.LINK;
                }
            }
            
            let projects = await this.projects(
                query,
                pageSize,
                pageNo,
                searchQuery,    
                [
                    "title", 
                    "description",
                    "solutionId",
                    "programId",
                    "programInformation.name",
                    "projectTemplateId",
                    "solutionExternalId",
                    "lastDownloadedAt",
                    "hasAcceptedTAndC",
                    "referenceFrom",
                    "status",
                    "certificate"
                ]
            );
            
            let totalCount = 0;
            let data = [];
            if( projects.success && projects.data && projects.data.data && Object.keys(projects.data.data).length > 0 ) {

                totalCount = projects.data.count;
                data = projects.data.data;
                
                if( data.length > 0 ) {
                    let templateFilePath = [];
                    data.forEach( projectData => {
                        
                        projectData.name = projectData.title;


                        if (projectData.programInformation) {
                            projectData.programName = projectData.programInformation.name;
                            delete projectData.programInformation;
                        }

                        if (projectData.solutionExternalId) {
                            projectData.externalId = projectData.solutionExternalId;
                            delete projectData.solutionExternalId;
                        }

                        projectData.type = CONSTANTS.common.IMPROVEMENT_PROJECT;
                        delete projectData.title;

                        if (projectData.certificate &&
                            projectData.certificate.osid &&
                            projectData.certificate.osid !== "" && 
                            projectData.certificate.templateUrl &&
                            projectData.certificate.templateUrl !== ""
                            ) {
                                templateFilePath.push(projectData.certificate.templateUrl);
                        }

                    });

                    if( templateFilePath.length > 0 ) {

                        let certificateTemplateDownloadableUrl = 
                            await coreService.getDownloadableUrl(
                                {
                                    filePaths: templateFilePath
                                }
                        );
                        if ( !certificateTemplateDownloadableUrl.success ) {
                            throw {
                                message:  CONSTANTS.apiResponses.DOWNLOADABLE_URL_NOT_FOUND
                            };
                        }
                        // map downloadable templateUrl to corresponding project data
                        data.forEach(projectData => {
                            if (projectData.certificate) {
                                var itemFromUrlArray = certificateTemplateDownloadableUrl.data.find(item=> item.filePath == projectData.certificate.templateUrl);
                                    if (itemFromUrlArray) {
                                        projectData.certificate.templateUrl = itemFromUrlArray.url;
                                    }
                                }
                            }
                            
                        )
                    }

                }
            }
            
            return resolve({
                success : true,
                message : CONSTANTS.apiResponses.USER_ASSIGNED_PROJECT_FETCHED,
                data : {
                    data: data,
                    count: totalCount
                }
            });

        } catch (error) {
            return resolve({
                success : false,
                message : error.message,
                status : 
                error.status ? 
                error.status : HTTP_STATUS_CODE['internal_server_error'].status,
                data : {
                    description : CONSTANTS.common.PROJECT_DESCRIPTION,
                    data : [],
                    count : 0
                }
            });
        }
    })
  }

  /**
    * List of user imported projects.
    * @method
    * @name importedProjects 
    * @param {String} userId - Logged in user id.
    * @param {String} programId - program id.
    * @returns {Object}
   */

   static importedProjects( userId,programId ) {
    return new Promise(async (resolve, reject) => {
        try {

            let filterQuery = {
                userId : userId,
                // referenceFrom : { $exists : true,$eq : CONSTANTS.common.OBSERVATION_REFERENCE_KEY }, - Commented as this filter is not useful. - 4.7 Sprint - 25Feb2022
                isDeleted: false
            };

            if( programId !== "" ) {
                filterQuery["programId"] = programId;
            }

            let importedProjects = await projectQueries.projectDocument(
                filterQuery,
                [
                    "solutionInformation",
                    "programInformation",
                    "title",
                    "description",
                    "projectTemplateId",
                    "certificate.templateId"
                ]
            );
            
            return resolve({
                success : true,
                message : CONSTANTS.apiResponses.IMPORTED_PROJECTS_FETCHED,
                data : importedProjects
            });

        } catch (error) {
            return resolve({
                success : false,
                message : error.message,
                status : 
                error.status ? 
                error.status : HTTP_STATUS_CODE['internal_server_error'].status,
                data : {
                    description : CONSTANTS.common.PROJECT_DESCRIPTION,
                    data : [],
                    count : 0
                }
            });
        }
    })
  }

  /**
   * List of projects.
   * @method
   * @name list
   * @returns {Array} List of projects.
   */
  
  static list( bodyData ) {
    return new Promise(async (resolve, reject) => {
        try {
            let projects = await projectQueries.projectDocument(
                bodyData.query,
                bodyData.projection,
                bodyData.skipFields
            );

            return resolve({
                success : true,
                message : CONSTANTS.apiResponses.PROJECTS_FETCHED,
                result : projects
            });
            
        } catch (error) {
            return reject(error);
        }
    });
  }

  /**
      * Create project from template.
      * @method
      * @name importFromLibrary 
      * @param {String} projectTemplateId - project template id.
      * @param {Object} requestedData - body data.
      * @param {String} userId - Logged in user id.
      * @param {String} userToken - User token.
      * @param {Boolean} isATargetedSolution - User targeted or not .
      * @returns {Object} Project created information.
     */

    static importFromLibrary(projectTemplateId, requestedData, userToken, userId, isATargetedSolution = "" ) {
        return new Promise(async (resolve, reject) => {
            try {
                isATargetedSolution = UTILS.convertStringToBoolean(isATargetedSolution);

                let libraryProjects =
                    await libraryCategoriesHelper.projectDetails(
                        projectTemplateId, 
                        "",
                        isATargetedSolution
                    );
            
                if (
                    libraryProjects.data &&
                    !(Object.keys(libraryProjects.data).length > 0)
                ) {
                    throw {
                        message: CONSTANTS.apiResponses.PROJECT_TEMPLATE_NOT_FOUND,
                        status: HTTP_STATUS_CODE['bad_request'].status
                    };
                    
                }
                
                let taskReport = {};

                if (
                    libraryProjects.data.tasks &&
                    libraryProjects.data.tasks.length > 0
                ) {

                    libraryProjects.data.tasks = await _projectTask(
                        libraryProjects.data.tasks,
                        isATargetedSolution === false ? false : true
                    );

                    taskReport.total = libraryProjects.data.tasks.length;

                    libraryProjects.data.tasks.forEach(task => {
                        if ( task.isDeleted == false ) {
                            if (!taskReport[task.status]) {
                                taskReport[task.status] = 1;
                            } else {
                                taskReport[task.status] += 1;
                            }
                        } else {
                            //reduce total count if task is deleted.
                            taskReport.total = taskReport.total - 1;
                        }
                        
                    });

                    libraryProjects.data["taskReport"] = taskReport;
                }

                if (requestedData.entityId && requestedData.entityId !== "") {

                    let entityInformation =
                        await _entitiesInformation([requestedData.entityId]);

                    if (!entityInformation.success) {
                        return resolve(entityInformation);
                    }

                    libraryProjects.data["entityInformation"] = entityInformation.data[0];
                    libraryProjects.data.entityId = entityInformation.data[0]._id;
                }

                if( requestedData.solutionId && requestedData.solutionId !== "" && isATargetedSolution === false ){
                    let programAndSolutionInformation = {};
                    // Check if solutionId passed is private or not, if private and data is present, create program and solution information.
                    let solutionDetails = await solutionsHelper.solutionDocuments({
                        _id: requestedData.solutionId,
                        isAPrivateProgram: true
                    },
                    [
                        "_id",
                        "name",
                        "externalId",
                        "description",
                        "programId",
                        "programName",
                        "programDescription",
                        "programExternalId",
                        "isAPrivateProgram",
                        "projectTemplateId",
                        "entityType",
                        "certificateTemplateId",
                        "parentSolutionId"
                    ]);
                    // private solution exists
                    if ( solutionDetails.length > 0 && solutionDetails[0].parentSolutionId ) {
                        // This function will return programAndSolutionInformation
                        /**
                         * function privateProgramAndSolutionDetails 
                         * Request:
                         * @param {solutionDetails} solution data
                         * @response Program and solution details
                        */
                        programAndSolutionInformation = await this.getProgramAndSolutionDetails(solutionDetails[0]);
                    } else {
                        programAndSolutionInformation =
                        await this.createProgramAndSolution(
                            requestedData.programId,
                            requestedData.programName,
                            requestedData.entityId ? [requestedData.entityId] : "",
                            userToken,
                            requestedData.solutionId,
                            isATargetedSolution
                        );
                    }
                    
                    if (!programAndSolutionInformation.success) {
                        return resolve(programAndSolutionInformation);
                    }

                    libraryProjects.data = _.merge(
                        libraryProjects.data,
                        programAndSolutionInformation.data
                    )

                    libraryProjects.data["referenceFrom"] = CONSTANTS.common.LINK;
                }
                else if (
                    (requestedData.programId && requestedData.programId !== "") ||
                    (requestedData.programName && requestedData.programName !== "" )
                ) {

                    let programAndSolutionInformation =
                        await this.createProgramAndSolution(
                            requestedData.programId,
                            requestedData.programName,
                            requestedData.entityId ? [requestedData.entityId] : "",
                            userToken
                        );

                    if (!programAndSolutionInformation.success) {
                        return resolve(programAndSolutionInformation);
                    }

                    if (
                        libraryProjects.data["entityInformation"] &&
                        libraryProjects.data["entityInformation"].entityType !==
                        programAndSolutionInformation.data.solutionInformation.entityType
                    ) {
                        throw {
                            message: CONSTANTS.apiResponses.ENTITY_TYPE_MIS_MATCHED,
                            status: HTTP_STATUS_CODE['bad_request'].status
                        }
                    }

                    libraryProjects.data = _.merge(
                        libraryProjects.data,
                        programAndSolutionInformation.data
                    )
                }
                //  <- Add certificate template data
                if ( 
                    libraryProjects.data.certificateTemplateId &&
                    libraryProjects.data.certificateTemplateId !== ""
                ){
                    // <- Add certificate template details to projectCreation data if present ->
                    const certificateTemplateDetails = await certificateTemplateQueries.certificateTemplateDocument({
                        _id : libraryProjects.data.certificateTemplateId
                    });
                    
                    // create certificate object and add data if certificate template is present.
                    if ( certificateTemplateDetails.length > 0 ) {
                        libraryProjects.data["certificate"] = _.pick(certificateTemplateDetails[0], ['templateUrl', 'status', 'criteria']);
                    }
                    libraryProjects.data["certificate"]["templateId"] = libraryProjects.data.certificateTemplateId;
                    delete  libraryProjects.data.certificateTemplateId;
                }
                
                //Fetch user profile information by calling sunbird's user read api.
                let addReportInfoToSolution = false;
                let userProfile = await userProfileService.profile(userToken, userId);
                if ( userProfile.success && 
                     userProfile.data &&
                     userProfile.data.response
                ) {
                    libraryProjects.data.userProfile = userProfile.data.response;
                    addReportInfoToSolution = true;
                } 
    
                libraryProjects.data.userId = libraryProjects.data.updatedBy = libraryProjects.data.createdBy = userId;
                libraryProjects.data.lastDownloadedAt = new Date();
                libraryProjects.data.status = CONSTANTS.common.STARTED;

                if (requestedData.startDate) {
                    libraryProjects.data.startDate = requestedData.startDate;
                }

                if (requestedData.endDate) {
                    libraryProjects.data.endDate = requestedData.endDate;
                }

                if (requestedData.hasAcceptedTAndC) {
                    libraryProjects.data.hasAcceptedTAndC = true;
                }

                libraryProjects.data.projectTemplateId = libraryProjects.data._id;
                libraryProjects.data.projectTemplateExternalId = libraryProjects.data.externalId;
                
                let projectCreation = await database.models.projects.create(
                    _.omit(libraryProjects.data, ["_id"])
                );
        
                if ( addReportInfoToSolution && projectCreation._doc.solutionId ) {

                    let updateSolution = await solutionsHelper.addReportInformationInSolution(
                        projectCreation._doc.solutionId,
                        projectCreation._doc.userProfile
                    );
                }
                
                await kafkaProducersHelper.pushProjectToKafka(projectCreation);

                if (requestedData.rating && requestedData.rating > 0) {
                    await projectTemplatesHelper.ratings(
                        projectTemplateId,
                        requestedData.rating,
                        userToken
                    );
                }
                
                projectCreation = await _projectInformation(projectCreation._doc);
                
                return resolve({
                    success: true,
                    message: CONSTANTS.apiResponses.PROJECTS_FETCHED,
                    data: projectCreation.data
                });

            } catch (error) {
                return resolve({
                    success: false,
                    message: error.message,
                    data: {}
                });
            }
        })
    }

    /**
     * get project details.
     * @method
     * @name userProject 
     * @param {String} projectId - project id.
     * @returns {Object} Project details.
    */

    static userProject(projectId) {
        return new Promise(async (resolve, reject) => {
            try {

                const projectDetails = await projectQueries.projectDocument({
                    _id: projectId,
                }, "all");

                if (!(projectDetails.length > 0)) {

                    throw {
                        status: HTTP_STATUS_CODE["bad_request"].status,
                        message: CONSTANTS.apiResponses.PROJECT_NOT_FOUND
                    }
                }
                 
                return resolve( { 
                    success: true,
                    message: CONSTANTS.apiResponses.PROJECT_DETAILS_FETCHED,
                    data: projectDetails[0] 
                });

            } catch (error) {
                return resolve({
                    success: false,
                    message: error.message,
                    data: {}
                });
            }
        })
    }

    /**
     * generate project certificate.
     * @method
     * @name generateCertificate 
     * @param {Object} data - project data for certificate creation data.
     * @returns {JSON} certificate details.
    */

    static generateCertificate(data) {
        return new Promise(async (resolve, reject) => {
            try {

                // check eligibility of project for certificate creation
                let eligibility = await this.checkCertificateEligibility(data);
                if (!eligibility ){
                    throw {
                        message:  CONSTANTS.apiResponses.NOT_ELIGIBLE_FOR_CERTIFICATE
                    };
                }

                // create payload for certificate generation
                const certificateData = await this.createCertificatePayload(data);
                
                // call sunbird-RC to create certificate for project
                const certificate = await this.createCertificate(certificateData, data._id)
                
                return resolve(certificate);

            } catch (error) {
                return resolve({
                    success: false,
                    message: error.message

                });
            }
        })
    }

    /**
     * check project eligibility for certificate.
     * @method
     * @name checkCertificateEligibility 
     * @param {Object} data - project data for certificate creation data.
     * @returns {Boolean} certificate eligibilty status.
    */

    static checkCertificateEligibility(data) {
        return new Promise(async (resolve, reject) => {
            try {
                let eligible = false;
                let updateObject = {
                    "$set" : {}
                };
                //  validate certificate data, checking if it passes all criteria
                let validateCriteria = await certificateValidationsHelper.criteriaValidation(data)
                if ( validateCriteria.success ) {
                    eligible = true;
                } else {
                    updateObject["$set"]["certificate.message"] = validateCriteria.message;
                }
                updateObject["$set"]["certificate.eligible"] = eligible;

                // update project certificate data
                await projectQueries.findOneAndUpdate(
                    {
                        _id: data._id
                    },
                    updateObject
                );
                
                return resolve(eligible);
            } catch (error) {
                return resolve({
                    success: false,
                    message: error.message

                });
            }
        })
    }

    /**
     * createCertificatePayload.
     * @method
     * @name createCertificatePayload 
     * @param {Object} data - project data for certificate creation data.
     * @returns {Object} payload for certificate creation.
    */

    static createCertificatePayload(data) {
        return new Promise(async (resolve, reject) => {
            try {
                console.log("Certificate issuer Kid: ",CERTIFICATE_ISSUER_KID)
                
                if(data.title.length > 75) {
                    data.title = data.title.substring(0, 75) + '...';
                }
                
                // get downloadable url for certificate template
                if ( data.certificate.templateUrl && data.certificate.templateUrl !== "" ) {
                    let certificateTemplateDownloadableUrl =
                    await coreService.getDownloadableUrl(
                        {
                            filePaths: [data.certificate.templateUrl]
                        }
                    );
                    if ( certificateTemplateDownloadableUrl.success ) {
                        data.certificate.templateUrl = certificateTemplateDownloadableUrl.data[0].url;
                    } else {
                        throw {
                            message:  CONSTANTS.apiResponses.DOWNLOADABLE_URL_NOT_FOUND
                        };
                    }
                }

                let certificateTemplateDetails =[];
                if ( data.certificate.templateId && data.certificate.templateId !== "" ) {
                    certificateTemplateDetails = await certificateTemplateQueries.certificateTemplateDocument({
                        _id : data.certificate.templateId
                    },["issuer","solutionId","programId"]);

                    //certificate template data do not exists.
                    if ( !(certificateTemplateDetails.length > 0) ) {
                        throw {
                            message:  CONSTANTS.apiResponses.CERTIFICATE_TEMPLATE_NOT_FOUND
                        };
                    }
                    certificateTemplateDetails[0].issuer.kid = CERTIFICATE_ISSUER_KID;
                }
                
                //create certificate request body 
                let certificateData = {
                    recipient : {
                        id : data.userId,
                        name : `${data.userProfile.firstName} ${data.userProfile.lastName}`,
                        type : data.userProfile.profileUserType.type
                    },
                    templateUrl : data.certificate.templateUrl,
                    issuer : certificateTemplateDetails[0].issuer,
                    status : data.certificate.status.toUpperCase(),
                    projectId : (data._id).toString(),
                    projectName : data.title,
                    programId : (certificateTemplateDetails[0].programId).toString(),
                    programName : ( data.programInformation && data.programInformation.name ) ? data.programInformation.name : "",
                    solutionId : (certificateTemplateDetails[0].solutionId).toString(),
                    solutionName : ( data.solutionInformation && data.solutionInformation.name ) ? data.solutionInformation.name :  "",
                    completedDate : data.completedDate
                };
                return resolve(certificateData);

            } catch (error) {
                console.log("error:",error.message)
                return resolve({
                    success: false,
                    message: error.message

                });
            }
        })
    }    

    /**
     * call sunbird-RC for certificate creation.
     * @method
     * @name createCertificate 
     * @param {Object} certificateData - payload for certificate creation data.
     * @param {string} projectId - project Id.
     * @returns {Boolean} certificate creation status.
    */

    static createCertificate(certificateData, projectId) {
        return new Promise(async (resolve, reject) => {
            try {

                const certificateDetails = await certificateService.createCertificate( certificateData );    
                
                if ( !certificateDetails.success || !certificateDetails.data || !certificateDetails.data.ProjectCertificate ) {
                    throw {
                        message:  CONSTANTS.apiResponses.CERTIFICATE_GENERATION_FAILED
                    };
                }
                
                let updateObject = {
                    "$set" : {}
                };

                //  if transaction id is present.
                if ( certificateDetails.data.ProjectCertificate.transactionId &&
                    certificateDetails.data.ProjectCertificate.transactionId !== "" 
                ) {
                    let transactionIdvalue = certificateDetails.data.ProjectCertificate.transactionId;
                    const first2 = transactionIdvalue.slice(0, 2);
                    
                    if ( first2 === "1-" ) {
                        transactionIdvalue = transactionIdvalue.split(/1-(.*)/s)
                        updateObject["$set"]["certificate.transactionId"] = transactionIdvalue[1];
                    } else {
                        updateObject["$set"]["certificate.transactionId"] = transactionIdvalue;
                    }
                        
                }

                // update project details certificate details
                if ( certificateDetails.data.ProjectCertificate.osid &&
                    certificateDetails.data.ProjectCertificate.osid !== "" 
                ) {
                    updateObject["$set"]["certificate.osid"] = certificateDetails.data.ProjectCertificate.osid;
                    updateObject["$set"]["certificate.issuedOn"] = new Date();
                }
                updateObject["$set"]["certificate.transactionIdCreatedAt"] = new Date();;
               
                if ( Object.keys(updateObject["$set"]).length > 0 ) {
                    let updatedProject = await projectQueries.findOneAndUpdate(
                        {
                            _id: projectId
                        },
                        updateObject
                    );
                } 
                return resolve( { 
                    success: true
                });
            } catch (error) {
                return resolve({
                    success: false,
                    message: error.message

                });
            }
        })
    }

    /**
     * certificate callback
     * @method
     * @name certificateCallback 
     * @param {String} transactionId - transactionId for create certificate.
     * @param {String} osid - osid for created certificate.
     * @returns {JSON} certificate data updation details.
    */

    static certificateCallback(transactionId, osid) {
        return new Promise(async (resolve, reject) => {
            try {
                // adding comments to check call back is called properly or not
                console.log("<==================callback called====================>",transactionId,osid)
                console.log("transactionId :",transactionId)
                console.log("osid :",osid)
                console.log("<==================callback called====================>")
                // callback request structure nested so validating transactionId and osid here instead in validator.
                if ( transactionId == "" || osid == "" ) {
                    throw {
                        status: HTTP_STATUS_CODE["bad_request"].status,
                        message: CONSTANTS.apiResponses.TRANSACTION_ID_AND_OSID_REQUIRED
                    }
                }
                let updateObject = {
                    "$set" : {}
                };

                // update osid and eligibility based on transactionId
                updateObject["$set"]["certificate.osid"] = osid;
                updateObject["$set"]["certificate.message"] = CONSTANTS.common.PROJECT_CERTIFICATE_GENERATED_SUCCESSFULLY;
                updateObject["$set"]["certificate.issuedOn"] = new Date();

                let projectDetails = await projectQueries.findOneAndUpdate(
                    {
                        "certificate.transactionId" : transactionId
                    },
                    updateObject
                );

                if ( projectDetails == null || !(Object.keys(projectDetails).length > 0) ) {
                    throw {
                        status: HTTP_STATUS_CODE["bad_request"].status,
                        message: CONSTANTS.apiResponses.PROJECT_NOT_FOUND
                    }
                }
                await kafkaProducersHelper.pushProjectToKafka(projectDetails);
                return resolve({ 
                    success: true,
                    message: CONSTANTS.apiResponses.PROJECT_CERTIFICATE_GENERATED,
                    data : {
                        _id : ObjectId(projectDetails._id)
                    }

                });

            } catch (error) {
                return resolve({
                    success: false,
                    message: error.message,
                    data: {}
                });
            }
        })
    }

    /**
     * List user project details with certificate
     * @method
     * @name certificates 
     * @param {String} userId - userId.
     * @returns {JSON} certificate data updation details.
    */

    static certificates(userId) {
        return new Promise(async (resolve, reject) => {
            try {
                
                //  get project details of user which have certificate.
                const userProject = await projectQueries.projectDocument({
                    userId: userId,
                    status: CONSTANTS.common.SUBMITTED_STATUS,
                    certificate: {$exists:true}
                }, [
                    "_id",
                    "title",
                    "status",
                    "certificate.osid",
                    "certificate.transactioId",
                    "certificate.templateUrl",
                    "certificate.status",
                    "certificate.eligible",
                    "certificate.message",
                    "certificate.issuedOn",
                    "completedDate"
                ]);
                
                if ( !(userProject.length > 0 )) {
                    throw {
                        status: HTTP_STATUS_CODE["bad_request"].status,
                        message: CONSTANTS.apiResponses.PROJECT_WITH_CERTIFICATE_NOT_FOUND
                    }
                }
                let templateFilePath = [];
                //loop through user projects and get downloadable url for templateUrl if osid is present.
                for( let userProjectPointer = 0; userProjectPointer < userProject.length; userProjectPointer++ ) {
                    if ( userProject[userProjectPointer].certificate.osid &&
                        userProject[userProjectPointer].certificate.osid !== "" && 
                        userProject[userProjectPointer].certificate.templateUrl &&
                        userProject[userProjectPointer].certificate.templateUrl !== ""
                        ) {
                            templateFilePath.push(userProject[userProjectPointer].certificate.templateUrl);
                        }
                }
                
                if( templateFilePath.length > 0 ) {

                    let certificateTemplateDownloadableUrl = 
                        await coreService.getDownloadableUrl(
                            {
                                filePaths: templateFilePath
                            }
                    );
                    if ( !certificateTemplateDownloadableUrl.success ) {
                        throw {
                            message:  CONSTANTS.apiResponses.DOWNLOADABLE_URL_NOT_FOUND
                        };
                    }
                    // map downloadable templateUrl to corresponding project data
                    userProject.forEach(projectData => {
                            var itemFromUrlArray = certificateTemplateDownloadableUrl.data.find(item=> item.filePath == projectData.certificate.templateUrl);
                            if (itemFromUrlArray) {
                                projectData.certificate.templateUrl = itemFromUrlArray.url;
                            }
                        }
                    )
                }

                let count = _.countBy(userProject, (rec) => {
                    return (rec.certificate && rec.certificate.osid && rec.certificate.osid !== "" )? 'generated': 'notGenerated';
                });
                
                return resolve({ 
                    success: true,
                    message: CONSTANTS.apiResponses.PROJECTS_FETCHED,
                    data : {
                        data : userProject,
                        count : userProject.length,
                        certificateCount : count.generated
                    }

                });
            } catch (error) {
                return resolve({
                    success: false,
                    message: error.message,
                    data: {}
                });
            }
        })
    }

    /**
     * Re-Issue project certificate
     * @method
     * @name certificateReIssue 
     * @param {String} projectId - projectId.
     * @returns {JSON} certificate re-issued details.
    */

     static certificateReIssue(projectId) {
        return new Promise(async (resolve, reject) => {
            try {
                //  get project details project for which certificate re-issue required .
                const userProject = await projectQueries.projectDocument({
                    _id: projectId,
                    status: CONSTANTS.common.SUBMITTED_STATUS,
                    certificate: {$exists:true}  
                });

                //  if project details not found.
                if (!(userProject.length > 0)) {
                    throw {
                        status: HTTP_STATUS_CODE['bad_request'].status,
                        message: CONSTANTS.apiResponses.USER_PROJECT_NOT_FOUND
                    };
                }
                let updateObject = {
                    "$set" : {}
                };
                
                //  fetch user data using userId of project and calling the profile API
                let userProfileData = await userProfileService.profileReadPrivate(userProject[0].userId);
                if ( userProfileData.success && 
                     userProfileData.data &&
                     userProfileData.data.response &&
                     userProfileData.data.response.firstName &&
                     userProfileData.data.response.firstName !== ""
                ) {
                    userProject[0].userProfile.firstName = userProfileData.data.response.firstName;
                    userProject[0].userProfile.lastName = userProfileData.data.response.lastName;
                } else {
                    throw {
                        status: HTTP_STATUS_CODE['bad_request'].status,
                        message: CONSTANTS.apiResponses.USER_PROFILE_NOT_FOUND
                    };
                }

                // create payload for certificate generation
                const certificateData = await this.createCertificatePayload(userProject[0]);

                // call sunbird-RC to create certificate for project
                const certificate = await this.createCertificate(certificateData, userProject[0]._id);

                if ( !certificate.success ) {
                    throw {
                        message:  CONSTANTS.apiResponses.CERTIFICATE_GENERATION_FAILED
                    };
                }

                if ( userProject[0].certificate.transactionId ) {
                    updateObject["$set"]["certificate.originalTransactionInformation.transactionId"] = userProject[0].certificate.transactionId
                }
                if ( userProject[0].certificate.osid ) {
                    updateObject["$set"]["certificate.originalTransactionInformation.osid"] = userProject[0].certificate.osid;
                }

                if (userProject[0].userProfile.firstName ) {
                    updateObject["$set"]["userProfile.firstName"] = userProject[0].userProfile.firstName;
                }

                if (userProject[0].userProfile.lastName ) {
                    updateObject["$set"]["userProfile.lastName"] = userProject[0].userProfile.lastName;
                }

                updateObject["$set"]["certificate.reIssuedAt"] = new Date();
                await projectQueries.findOneAndUpdate(
                    {
                        _id: userProject[0]._id
                    },
                    updateObject
                );
                
                return resolve({ 
                    success: true,
                    message: CONSTANTS.apiResponses.PROJECT_SUBMITTED_FOR_REISSUE,
                    data : {
                        _id :  userProject[0]._id
                    }

                });
            } catch (error) {
                return resolve({
                    success: false,
                    message: error.message,
                    data: {}
                });
            }
        })
    }

    /**
     * Fetches project details based on the provided query.
     * @method
     * @name details
     * @param {Object} args - Query object for fetching project details.
     * @returns {Array} - A promise that resolves to an array of project details matching the query.
     */
    static userProjectOverview(args,fields='all',stats) {
          return new Promise(async (resolve, reject) => {
            try {
              const projectIdQuery = {
                ...args,
              };

              let fieldarray = [];

              if (fields != "all") {
                fields.forEach((field) => {
                  fieldarray.push(field);
                });
              }

              if (stats == true) {
                let count = await projectQueries.countDocuments(projectIdQuery);

                resolve(count);
              }

              let projects = await projectQueries.projectDocument(
                projectIdQuery,
                fieldarray
              );

              resolve(projects);
            } catch (error) {
              reject(error);
            }
          });
    }
    


};

/**
 * Project information.
 * @method
 * @name _projectInformation 
 * @param {Object} project - Project data.
 * @returns {Object} Project information.
*/

function _projectInformation(project) {

    return new Promise(async (resolve, reject) => {
        try {
            
            if (project.entityInformation) {
                project.entityId = project.entityInformation._id;
                project.entityName = project.entityInformation.name;
            }

            if (project.programInformation) {
                project.programId = project.programInformation._id;
                project.programName = project.programInformation.name;
            }
            
            //project attachments
            if ( project.attachments && project.attachments.length > 0 ) {
                
                let projectLinkAttachments = [];
                let projectAttachments = [];

                for (
                    let pointerToAttachment = 0;
                    pointerToAttachment < project.attachments.length;
                    pointerToAttachment++
                ) {

                    let currentProjectAttachment = project.attachments[pointerToAttachment];
                    if ( currentProjectAttachment.type == CONSTANTS.common.ATTACHMENT_TYPE_LINK ) {
                        projectLinkAttachments.push(currentProjectAttachment);
                    } else {
                        projectAttachments.push(currentProjectAttachment.sourcePath);
                    }
                }
                
                let projectAttachmentsUrl = await _attachmentInformation(projectAttachments, projectLinkAttachments, project.attachments, CONSTANTS.common.PROJECT_ATTACHMENT);
                if ( projectAttachmentsUrl.data && projectAttachmentsUrl.data.length > 0 ) {
                    project.attachments = projectAttachmentsUrl.data;
                }
               
            }
            
            //task attachments
            if (project.tasks && project.tasks.length > 0) {
                //order task based on task sequence
                if ( project.taskSequence && project.taskSequence.length > 0 ) {
                    project.tasks = taskArrayBySequence(project.tasks, project.taskSequence, 'externalId');
                }

                let attachments = [];
                let mapTaskIdToAttachment = {};
                let mapLinkAttachment = {};

                for (let task = 0; task < project.tasks.length; task++) {

                    let currentTask = project.tasks[task];

                    if (currentTask.attachments && currentTask.attachments.length > 0) {
                        for (
                            let attachment = 0;
                            attachment < currentTask.attachments.length;
                            attachment++
                        ) {
                            let currentAttachment = currentTask.attachments[attachment];

                             if (currentAttachment.type == CONSTANTS.common.ATTACHMENT_TYPE_LINK ) {
                                if (!Array.isArray(mapLinkAttachment[currentTask._id]) || !mapLinkAttachment[currentTask._id].length ) {
                                    mapLinkAttachment[currentTask._id] = [];
                                }
                                mapLinkAttachment[currentTask._id].push(currentAttachment);
                            } else {
                                attachments.push(currentAttachment.sourcePath);
                            }
                            
                            if (!mapTaskIdToAttachment[currentAttachment.sourcePath] && currentAttachment.type != CONSTANTS.common.ATTACHMENT_TYPE_LINK ) {
                                mapTaskIdToAttachment[currentAttachment.sourcePath] = {
                                    taskId: currentTask._id
                                };
                            }
                        }
                    }
                }

                let taskAttachmentsUrl = await _attachmentInformation(attachments, mapLinkAttachment, [], CONSTANTS.common.TASK_ATTACHMENT, mapTaskIdToAttachment, project.tasks);
                if ( taskAttachmentsUrl.data && taskAttachmentsUrl.data.length > 0 ) {
                    project.tasks = taskAttachmentsUrl.data;
                }
            }
            
            project.status =
                project.status ? project.status : CONSTANTS.common.NOT_STARTED_STATUS;

            if (project.metaInformation) {
                Object.keys(project.metaInformation).forEach(projectMetaKey => {
                    project[projectMetaKey] = project.metaInformation[projectMetaKey];
                });
            }

            delete project.metaInformation;
            delete project.__v;
            delete project.entityInformation;
            delete project.solutionInformation;
            delete project.programInformation;

            return resolve({
                success: true,
                data: project
            });

        } catch (error) {
            return resolve({
                message: error.message,
                success: false,
                status:
                    error.status ?
                        error.status : HTTP_STATUS_CODE['internal_server_error'].status
            })
        }
    })
}

function taskArrayBySequence (taskArray, sequenceArray, key) {
  var map = sequenceArray.reduce((acc, value, index) => (acc[value] = index + 1, acc), {})
  const sortedTaskArray = taskArray.sort((a, b) => (map[a[key]] || Infinity) - (map[b[key]] || Infinity))
  return sortedTaskArray
};

/**
  * Attachment information of project.
  * @method
  * @name _attachmentInformation
  * @param {Array} attachments - attachments data.
  * @param {String} type - project or task attachement.
  * @returns {Object} Project attachments.
*/
function _attachmentInformation ( attachmentWithSourcePath = [], linkAttachments = [], attachments = [] , type, mapTaskIdToAttachment = {}, tasks = []) {
    return new Promise(async (resolve, reject) => {
        try {

            let attachmentOrTask = [];

            if ( attachmentWithSourcePath && attachmentWithSourcePath.length > 0 ) {

                let attachmentsUrl =
                await coreService.getDownloadableUrl(
                    {
                        filePaths: attachmentWithSourcePath
                    }
                );

                if (!attachmentsUrl.success) {
                    throw {
                        status: HTTP_STATUS_CODE['bad_request'].status,
                        message: CONSTANTS.apiResponses.ATTACHMENTS_URL_NOT_FOUND
                    }
                }

                if ( attachmentsUrl.data && attachmentsUrl.data.length > 0) {

                    if (type === CONSTANTS.common.PROJECT_ATTACHMENT ) { 

                        attachmentsUrl.data.forEach(eachAttachment => {
                            
                            let projectAttachmentIndex =
                                attachments.findIndex(attachmentData => attachmentData.sourcePath == eachAttachment.filePath);
                            
                            if (projectAttachmentIndex > -1) {
                                attachments[projectAttachmentIndex].url = eachAttachment.url;
                            }
                        })

                    } else {

                        attachmentsUrl.data.forEach(taskAttachments => {

                            let taskIndex =
                            tasks.findIndex(task => task._id === mapTaskIdToAttachment[taskAttachments.filePath].taskId);

                            if (taskIndex > -1) {
                                
                                let attachmentIndex =
                                    tasks[taskIndex].attachments.findIndex(attachment => attachment.sourcePath === taskAttachments.filePath);

                                if (attachmentIndex > -1) {
                                    tasks[taskIndex].attachments[attachmentIndex].url = taskAttachments.url;
                                }
                            }
                        })
                    }     
                }
            }

            if ( linkAttachments && linkAttachments.length > 0 ) {

                if (type === CONSTANTS.common.PROJECT_ATTACHMENT ) {
                    attachments.concat(linkAttachments);
                    

                } else {

                    Object.keys(linkAttachments).forEach(eachTaskId => {

                        let taskIdIndex = tasks.findIndex(task => task._id === eachTaskId);
                        if ( taskIdIndex > -1 ) {
                            tasks[taskIdIndex].attachments.concat(linkAttachments[eachTaskId]);
                        }
                    })

                } 
            }

            attachmentOrTask = (type === CONSTANTS.common.PROJECT_ATTACHMENT) ? attachments : tasks

            return resolve({
                success: true,
                data: attachmentOrTask
            });

    } catch (error) {

        return resolve({
            message: error.message,
            success: false,
            status:
                error.status ?
                    error.status : HTTP_STATUS_CODE['internal_server_error'].status
        })
    }

    })
}

/**
  * Task of project.
  * @method
  * @name _projectTask
  * @param {Array} tasks - tasks data.
  * @param {String} userId - logged in user id.
  * @returns {Object} Project task.
*/

function _projectTask(tasks, isImportedFromLibrary = false, parentTaskId = "") {

    tasks.forEach(singleTask => {
        
        singleTask.externalId = singleTask.externalId ? singleTask.externalId : singleTask.name.toLowerCase();
        singleTask.type = singleTask.type ? singleTask.type : CONSTANTS.common.SIMPLE_TASK_TYPE;
        singleTask.status = singleTask.status ? singleTask.status : CONSTANTS.common.NOT_STARTED_STATUS;
        singleTask.isDeleted = singleTask.isDeleted ? singleTask.isDeleted : false;

        if (!singleTask.hasOwnProperty("isDeletable")) {
            singleTask.isDeletable = true;
        }
        if ( UTILS.isValidMongoId(singleTask._id.toString()) ) {
            singleTask.referenceId = singleTask._id.toString();
        }
        singleTask.createdAt = singleTask.createdAt ? singleTask.createdAt : new Date();
        singleTask.updatedAt = new Date();
        singleTask._id = UTILS.isValidMongoId(singleTask._id.toString()) ? uuidv4() : singleTask._id;
        singleTask.isImportedFromLibrary = isImportedFromLibrary;
        singleTask.syncedAt = new Date();

        if (singleTask.startDate) {
            singleTask.startDate = singleTask.startDate;
        }

        if (singleTask.endDate) {
            singleTask.endDate = singleTask.endDate;
        }

        if (singleTask.visibleIf && singleTask.visibleIf.length > 0) {

            if (parentTaskId !== "") {
                singleTask.visibleIf.forEach(task => {
                    task._id = parentTaskId;
                });
            }
        }
        
        removeFieldsFromRequest.forEach((removeField) => {
            delete singleTask[removeField];
        });
        
        if (singleTask.children) {
            _projectTask(
                singleTask.children,
                isImportedFromLibrary,
                singleTask._id
            );
        } else {
            singleTask.children = [];
        }

    })
    
    return tasks;
}

/**
  * Project categories information.
  * @method
  * @name _projectCategories 
  * @param {Array} categories - Categories data.
  * @returns {Object} Project categories information.
*/

function _projectCategories(categories) {
    return new Promise(async (resolve, reject) => {
        try {

            let categoryIds = [];

            categories.forEach(category => {
                if (category.value && category.value !== "") {
                    categoryIds.push(category.value);
                }
            });

            let categoryData = [];

            if (categoryIds.length > 0) {

                categoryData =
                    await projectCategoriesQueries.categoryDocuments({
                        _id: { $in: categoryIds }
                    }, ["name", "externalId"]);

                if (!(categoryData.length > 0)) {
                    throw {
                        status: HTTP_STATUS_CODE['bad_request'].status,
                        message: CONSTANTS.apiResponses.CATEGORY_NOT_FOUND
                    }
                }
            }

            let categoryInternalIdToData = {};

            if (categoryData.length > 0) {

                categoryData.forEach(category => {
                    categoryInternalIdToData[category._id.toString()] = category;
                });
            }

            const categoriesData = categories.map(category => {
                let categoryData = {};

                if (
                    category.value &&
                    category.value !== "" &&
                    categoryInternalIdToData[category.value]
                ) {
                    categoryData = categoryInternalIdToData[category.value];
                } else {
                    categoryData = {
                        name: category.label,
                        externalId: "",
                        _id: ""
                    }
                }

                return categoryData;
            });

            return resolve({
                success: true,
                data: categoriesData
            });

        } catch (error) {
            return resolve({
                message: error.message,
                status:
                    error.status ?
                        error.status : HTTP_STATUS_CODE['internal_server_error'].status,
                success: false,
                data: {}
            });
        }
    })
}

/**
  * Entities information for project.
  * @method
  * @name _entitiesInformation 
  * @param {String} entityIds - entity id.
  * @returns {Object} Project entity information.
*/

function _entitiesInformation(entityIds) {
    return new Promise(async (resolve, reject) => {
        try {
            let locationIds = [];
            let locationCodes = [];
            let entityInformations = [];
            entityIds.forEach(entity=>{
                if (UTILS.checkValidUUID(entity)) {
                  locationIds.push(entity);
                } else {
                    locationCodes.push(entity);
                }
            });

            if ( locationIds.length > 0 ) {
                let bodyData = {
                    "id" : locationIds
                } 
                let entityData = await userProfileService.locationSearch( bodyData, formatResult = true);
                if ( entityData.success ) {
                    entityInformations =  entityData.data;
                }
            }

            if ( locationCodes.length > 0 ) {
                let bodyData = {
                    "code" : locationCodes
                } 
                let entityData = await userProfileService.locationSearch( bodyData , formatResult = true );
                if ( entityData.success ) {
                    entityInformations =  entityInformations.concat(entityData.data);
                }
            }
           
            if ( !(entityInformations.length > 0) ) {
                throw {
                    status: HTTP_STATUS_CODE['bad_request'].status,
                    message: CONSTANTS.apiResponses.ENTITY_NOT_FOUND
                }
            }
            let entitiesData = [];
            if ( entityInformations.length > 0 ) {
                entitiesData = await _entitiesMetaInformation(entityInformations);
            }
            
            return resolve({
                success: true,
                data: entitiesData
            });

        } catch (error) {
            return resolve({
                status:
                    error.status ?
                        error.status : HTTP_STATUS_CODE['internal_server_error'].status,
                success: false,
                message: error.message,
                data: []
            });
        }
    })
}

/**
   * Assessment details
   * @method
   * @name _assessmentDetails 
   * @param {Object} assessmentData - Assessment data.
   * @returns {Object} 
*/

function _assessmentDetails(assessmentData) {
    return new Promise(async (resolve, reject) => {
        try {

            let result = {};

            if (assessmentData.project) {

                let templateTasks =
                    await projectTemplateTaskQueries.taskDocuments({
                        externalId: assessmentData.project.taskId
                    }, ["_id"])

                if (templateTasks.length > 0) {
                    assessmentData.project.taskId = templateTasks[0]._id;
                }
            }

            if (assessmentData.solutionDetails.isReusable) {

                let createdAssessment =
                    await surveyService.createAssessmentSolutionFromTemplate(
                        assessmentData.token,
                        assessmentData.solutionDetails._id,
                        {
                            name: assessmentData.solutionDetails.name + "-" + UTILS.epochTime(),
                            description: assessmentData.solutionDetails.name + "-" + UTILS.epochTime(),
                            program: {
                                _id: assessmentData.programId,
                                name: ""
                            },
                            entities: [assessmentData.entityId],
                            project: assessmentData.project
                        }
                    );

                if (!createdAssessment.success) {
                    throw {
                        status: HTTP_STATUS_CODE['bad_request'].status,
                        message: CONSTANTS.apiResponses.COULD_NOT_CREATE_ASSESSMENT_SOLUTION
                    }
                }

                result["solutionId"] = createdAssessment.data._id;

            } else {

                let assignedAssessmentToUser =
                    await surveyService.createEntityAssessors(
                        assessmentData.token,
                        assessmentData.solutionDetails.programId,
                        assessmentData.solutionDetails._id,
                        [assessmentData.entityId]
                    );

                if (!assignedAssessmentToUser.success) {
                    throw {
                        status: HTTP_STATUS_CODE['bad_request'].status,
                        message: CONSTANTS.apiResponses.FAILED_TO_ASSIGNED_ASSESSMENT_TO_USER
                    }
                }

                let entitiesAddedToSolution =
                    await surveyService.addEntitiesToSolution(
                        assessmentData.token,
                        assessmentData.solutionDetails._id,
                        [assessmentData.entityId.toString()]
                    );

                if (!entitiesAddedToSolution.success) {
                    throw {
                        status: HTTP_STATUS_CODE['bad_request'].status,
                        message: CONSTANTS.apiResponses.FAILED_TO_ADD_ENTITY_TO_SOLUTION
                    }
                }

                let solutionUpdated =
                    await surveyService.updateSolution(
                        assessmentData.token,
                        {
                            "project": assessmentData.project,
                            referenceFrom: "project"
                        },
                        assessmentData.solutionDetails.externalId
                    );

                if (!solutionUpdated.success) {
                    throw {
                        status: HTTP_STATUS_CODE['bad_request'].status,
                        message: CONSTANTS.apiResponses.SOLUTION_NOT_UPDATED
                    }
                }

                result["solutionId"] = assessmentData.solutionDetails._id;
            }

            return resolve({
                success: true,
                data: result
            });

        } catch (error) {
            return resolve({
                message: error.message,
                success: false,
                status: error.status ?
                    error.status : HTTP_STATUS_CODE['internal_server_error'].status
            });
        }
    })
}

/**
   * Observation details
   * @method
   * @name _observationDetails 
   * @param {Object} observationData - Observation data.
   * @returns {Object} 
*/

function _observationDetails(observationData, userRoleAndProfileInformation = {}) {
    return new Promise(async (resolve, reject) => {
        try {

            let result = {};

            if (observationData.project) {

                let templateTasks =
                    await projectTemplateTaskQueries.taskDocuments({
                        externalId: observationData.project.taskId
                    }, ["_id"])

                if (templateTasks.length > 0) {
                    observationData.project.taskId = templateTasks[0]._id;
                }
            }

            if (observationData.solutionDetails.isReusable) {

                let observationCreatedFromTemplate =
                    await surveyService.createObservationFromSolutionTemplate(
                        observationData.token,
                        observationData.solutionDetails._id,
                        {
                            name: observationData.solutionDetails.name + "-" + UTILS.epochTime(),
                            description: observationData.solutionDetails.name + "-" + UTILS.epochTime(),
                            program: {
                                _id: observationData.programId,
                                name: ""
                            },
                            status: CONSTANTS.common.PUBLISHED_STATUS,
                            entities: [observationData.entityId],
                            project: observationData.project
                        }
                    );

                if (!observationCreatedFromTemplate.success) {
                    throw {
                        status: HTTP_STATUS_CODE['bad_request'].status,
                        message: CONSTANTS.apiResponses.OBSERVATION_NOT_CREATED
                    }
                }

                result["solutionId"] = observationCreatedFromTemplate.data._id;
                result["observationId"] = observationCreatedFromTemplate.data.observationId;

            } else {

                let startDate = new Date();
                let endDate = new Date();
                endDate.setFullYear(endDate.getFullYear() + 1);

                let observation = {
                    name: observationData.solutionDetails.name,
                    description: observationData.solutionDetails.name,
                    status: CONSTANTS.common.PUBLISHED_STATUS,
                    startDate: startDate,
                    endDate: endDate,
                    entities: [observationData.entityId],
                    project: observationData.project
                };

                let observationCreated = await surveyService.createObservation(
                    observationData.token,
                    observationData.solutionDetails._id,
                    observation,
                    userRoleAndProfileInformation && Object.keys(userRoleAndProfileInformation).length > 0 ? userRoleAndProfileInformation : {}
                );

                if ( observationCreated.success ) {
                    result["observationId"] = observationCreated.data._id;
                }

                result["solutionId"] = observationData.solutionDetails._id;
                
            }

            return resolve({
                success: true,
                data: result
            });

        } catch (error) {
            return resolve({
                message: error.message,
                success: false,
                status: error.status ?
                    error.status : HTTP_STATUS_CODE['internal_server_error'].status
            });
        }
    })
}

/**
   * Observation details
   * @method
   * @name _entitiesMetaInformation 
   * @param {Object} entitiesData - entities data.
   * @returns {Object} - entities metadata.
*/

function _entitiesMetaInformation(entitiesData) {
    return new Promise(async (resolve, reject) => {
        let entityInformation = []
        for ( let index = 0; index < entitiesData.length; index++ ) {
            let entityHierarchy =  await userProfileService.getParentEntities( entitiesData[index]._id );
            entitiesData[index].metaInformation.hierarchy = entityHierarchy;
            entitiesData[index].metaInformation._id = entitiesData[index]._id;
            entitiesData[index].metaInformation.entityType = entitiesData[index].entityType;
            entitiesData[index].metaInformation.registryDetails = entitiesData[index].registryDetails;
            entityInformation.push(entitiesData[index].metaInformation)
        }

        return resolve (entityInformation);
    })
}


/**
  * Project Add And Sync Common information.
  * @method
  * @name _projectData 
  * @param {Array} data - Req data.
  * @returns {Object} Project Add information.
*/

function _projectData(data) {
    return new Promise(async (resolve, reject) => {
        try {

            let projectData = {};
            if (data.categories && data.categories.length > 0) {

                let categories =
                    await _projectCategories(data.categories);

                if (!categories.success) {
                    return resolve(categories);
                }

                projectData.categories = categories.data;
            }

            if (data.startDate) {
                projectData["startDate"] = data.startDate;
            }

            if (data.endDate) {
                projectData["endDate"] = data.endDate;
            }

            if (data.learningResources) {
                projectData.learningResources = data.learningResources;
            }

            projectData.syncedAt = new Date();

            return resolve({
                success: true,
                data: projectData
            });

        } catch (error) {
            return resolve({
                message: error.message,
                status:
                    error.status ?
                        error.status : HTTP_STATUS_CODE['internal_server_error'].status,
                success: false,
                data: {}
            });
        }
    })
}

/**
  * Validate & Update UserProfile in Projects.
  * @method
  * @name _updateUserProfileBasedOnUserRoleInfo 
  * @param {Object} userProfile - userProfile data.
  * @param {Object} userRoleInformation - userRoleInformation data.
  * @returns {Object} updated UserProfile information.
*/

function _updateUserProfileBasedOnUserRoleInfo(userProfile, userRoleInformation) {
    return new Promise(async (resolve, reject) => {
        try {


            let updateUserProfileRoleInformation = false;   // Flag to see if roleInformation i.e. userProfile.profileUserTypes has to be updated based on userRoleInfromation.roles

            if(userRoleInformation.role) { // Check if userRoleInformation has role value.
                let rolesInUserRoleInformation = userRoleInformation.role.split(","); // userRoleInfomration.role can be multiple with comma separated.

                let resetCurrentUserProfileRoles = false; // Flag to reset current userProfile.profileUserTypes i.e. if current role in profile is not at all there in userRoleInformation.roles
                // Check if userProfile.profileUserTypes exists and is an array of length > 0
                if(userProfile.profileUserTypes && Array.isArray(userProfile.profileUserTypes) && userProfile.profileUserTypes.length >0) {

                    // Loop through current roles in userProfile.profileUserTypes
                    for (let pointerToCurrentProfileUserTypes = 0; pointerToCurrentProfileUserTypes < userProfile.profileUserTypes.length; pointerToCurrentProfileUserTypes++) {
                        const currentProfileUserType = userProfile.profileUserTypes[pointerToCurrentProfileUserTypes];

                        if(currentProfileUserType.subType && currentProfileUserType.subType !== null) { // If the role has a subType

                            // Check if subType exists in userRoleInformation role, if not means profile data is old and should be reset.
                            if(!userRoleInformation.role.toUpperCase().includes(currentProfileUserType.subType.toUpperCase())) {
                                resetCurrentUserProfileRoles = true; // Reset userProfile.profileUserTypes
                                break;
                            }
                        } else { // If the role subType is null or is not there

                            // Check if type exists in userRoleInformation role, if not means profile data is old and should be reset.
                            if(!userRoleInformation.role.toUpperCase().includes(currentProfileUserType.type.toUpperCase())) {
                                resetCurrentUserProfileRoles = true; // Reset userProfile.profileUserTypes
                                break;
                            }
                        }
                    }
                }
                if(resetCurrentUserProfileRoles) { // Reset userProfile.profileUserTypes
                    userProfile.profileUserTypes = new Array;
                }

                // Loop through each subRole in userRoleInformation
                for (let pointerToRolesInUserInformation = 0; pointerToRolesInUserInformation < rolesInUserRoleInformation.length; pointerToRolesInUserInformation++) {
                    const subRole = rolesInUserRoleInformation[pointerToRolesInUserInformation];
                    // Check if userProfile.profileUserTypes exists and is an array of length > 0
                    if(userProfile.profileUserTypes && Array.isArray(userProfile.profileUserTypes) && userProfile.profileUserTypes.length >0) {
                        if(!_.find(userProfile.profileUserTypes, { 'type': subRole.toLowerCase() }) && !_.find(userProfile.profileUserTypes, { 'subType': subRole.toLowerCase() })) { 
                            updateUserProfileRoleInformation = true; // Need to update userProfile.profileUserTypes
                            if(subRole.toUpperCase() === "TEACHER") { // If subRole is not teacher
                                userProfile.profileUserTypes.push({
                                    "subType" : null,
                                    "type" : "teacher"
                                })
                            } else { // If subRole is not teacher
                                userProfile.profileUserTypes.push({
                                    "subType" : subRole.toLowerCase(),
                                    "type" : "administrator"
                                })
                            }
                        }
                    } else { // Make a new entry if userProfile.profileUserTypes is empty or does not exist.
                        updateUserProfileRoleInformation = true; // Need to update userProfile.profileUserTypes
                        userProfile.profileUserTypes = new Array;
                        if(subRole.toUpperCase() === "TEACHER") { // If subRole is teacher
                            userProfile.profileUserTypes.push({
                                "subType" : null,
                                "type" : "teacher"
                            })
                        } else { // If subRole is not teacher
                            userProfile.profileUserTypes.push({
                                "subType" : subRole.toLowerCase(),
                                "type" : "administrator"
                            })
                        }
                    }
                }
            }

            if(updateUserProfileRoleInformation) { // If profileUserTypes in userProfile was wrong and is updated as per userRoleInformation
                userProfile.userRoleMismatchFoundAndUpdated = true;
            }

            // Create location only object from userRoleInformation
            let userRoleInformationLocationObject = _.omit(userRoleInformation, ['role']);
            
            // All location keys from userRoleInformation
            let userRoleInfomrationLocationKeys = Object.keys(userRoleInformationLocationObject);

            let updateUserProfileLocationInformation = false;   // Flag to see if userLocations i.e. userProfile.userLocations has to be updated based on userRoleInfromation location values

            // Loop through all location keys.
            for (let pointerToUserRoleInfromationLocationKeys = 0; pointerToUserRoleInfromationLocationKeys < userRoleInfomrationLocationKeys.length; pointerToUserRoleInfromationLocationKeys++) {
                
                const locationType = userRoleInfomrationLocationKeys[pointerToUserRoleInfromationLocationKeys]; // e.g. state, district, school
                const locationValue = userRoleInformationLocationObject[locationType]; // Location UUID values or school code.
                
                // Check if userProfile.userLocations exists and is an array of length > 0
                if(userProfile.userLocations && Array.isArray(userProfile.userLocations) && userProfile.userLocations.length >0) {

                    if(locationType === "school") { // If location type school exist check if same is there in userProfile.userLocations
                        if(!_.find(userProfile.userLocations, { 'type': "school", 'code': locationValue })) {
                            updateUserProfileLocationInformation = true; // School does not exist in userProfile.userLocations, update entire userProfile.userLocations
                            break;
                        }
                    } else { // Check if location type is there in userProfile.userLocations and has same value as userRoleInformation
                        if(!_.find(userProfile.userLocations, { 'type': locationType, 'id': locationValue })) {
                            updateUserProfileLocationInformation = true; // Location does not exist in userProfile.userLocations, update entire userProfile.userLocations
                            break;
                        }
                    }
                } else {
                    updateUserProfileLocationInformation = true;
                    break;
                }
            }

            if(userProfile.userLocations && Array.isArray(userProfile.userLocations) && userProfile.userLocations.length >0) {
                if(userProfile.userLocations.length != userRoleInfomrationLocationKeys.length) {
                    updateUserProfileLocationInformation = true;
                }
            }

            // If userProfile.userLocations has to be updated, get all values and set in userProfile.
            if(updateUserProfileLocationInformation) {

                //update userLocations in userProfile
                let locationIds = [];
                let locationCodes = [];
                let userLocations = new Array;

                userRoleInfomrationLocationKeys.forEach( requestedDataKey => {
                    if (UTILS.checkValidUUID(userRoleInformationLocationObject[requestedDataKey])) {
                        locationIds.push(userRoleInformationLocationObject[requestedDataKey]);
                    } else {
                        locationCodes.push(userRoleInformationLocationObject[requestedDataKey]);
                    }
                })

                //query for fetch location using id
                if ( locationIds.length > 0 ) {
                    let locationQuery = {
                        "id" : locationIds
                    }

                    let entityData = await userProfileService.locationSearch(locationQuery);
                    if ( entityData.success ) {
                        userLocations = entityData.data;
                    }
                }

                // query for fetch location using code
                if ( locationCodes.length > 0 ) {
                    let codeQuery = {
                        "code" : locationCodes
                    }

                    let entityData = await userProfileService.locationSearch(codeQuery);
                    if ( entityData.success ) {
                        userLocations =  userLocations.concat(entityData.data);
                    }
                }

                if ( userLocations.length > 0 ) {
                    userProfile["userLocations"] = userLocations;
                    userProfile.userLocationsMismatchFoundAndUpdated = true; // If userLocations in userProfile was wrong and is updated as per userRoleInformation
                }
            }

            return resolve({
                success: true,
                profileMismatchFound : (updateUserProfileLocationInformation || updateUserProfileRoleInformation) ? true : false,
                data: userProfile
            });

        } catch (error) {
            return resolve({
                status: error.status || HTTP_STATUS_CODE['internal_server_error'].status,
                message: error.message || HTTP_STATUS_CODE['internal_server_error'].message,
                data : false
            });
        }
    })
}