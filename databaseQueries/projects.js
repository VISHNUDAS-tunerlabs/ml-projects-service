/**
 * name : projects.js
 * author : Priyanka
 * created-date : 01-Sep-2021
 * Description : Project categories helper for DB interactions.
 */

// Dependencies 

/**
    * Projects
    * @class
*/

module.exports = class Projects {

  /**
     * Lists of projects document.
     * @method
     * @name projectDocument
     * @param {Array} [filterData = "all"] - project filter query.
     * @param {Array} [fieldsArray = "all"] - projected fields.
     * @param {Array} [skipFields = "none"] - field not to include
     * @returns {Array} Lists of projects. 
     */
    
    static projectDocument(
        filterData = "all", 
        fieldsArray = "all",
        skipFields = "none"
    ) {
        return new Promise(async (resolve, reject) => {
            try {
                
                let queryObject = (filterData != "all") ? filterData : {};
                let projection = {}
                
                if (fieldsArray != "all") {
                    fieldsArray.forEach(field => {
                        projection[field] = 1;
                   });
               }
               
               if( skipFields !== "none" ) {
                   skipFields.forEach(field=>{
                       projection[field] = 0;
                   });
               }
               
               let projects = 
               await database.models.projects.find(
                   queryObject, 
                   projection
               ).lean();
               return resolve(projects);
           
           } catch (error) {
               return reject(error);
           }
       });
   }

   /**
   * Get Aggregate of Project documents.
   * @method
   * @name getAggregate
   * @param {Object} [aggregateData] - aggregate Data.
   * @returns {Array} - Project data.
   */

    static getAggregate(aggregateData) {
        return new Promise(async (resolve, reject) => {
        
            try {
              
              let projectDocuments = await database.models.projects.aggregate(aggregateData);
              return resolve(projectDocuments);

            } catch (error) {
              return reject(error);
            }
        });
    }

    /**
   * Update project documents.
   * @method
   * @name findOneAndUpdate
   * @param {Object} [filterQuery] - filtered Query.
   * @param {Object} [updateData] - update data.
   * @returns {Object} - Project data.
   */

    static findOneAndUpdate(findQuery,UpdateObject, returnData = {}) {
        return new Promise(async (resolve, reject) => {
        
            try {
              
              let projectDocument = await database.models.projects.findOneAndUpdate(findQuery,UpdateObject, returnData);
              return resolve(projectDocument);

            } catch (error) {
              return reject(error);
            }
        });
    }

    /**
   * Create project documents.
   * @method
   * @name createProject
   * @param {Object} [projectData] - project Data.
   * @returns {Array} - Project data.
   */

    static createProject(projectData) {
        return new Promise(async (resolve, reject) => {
        
            try {
              
              let projectDocument = await database.models.projects.create(projectData);
              return resolve(projectDocument);

            } catch (error) {
              return reject(error);
            }
        });
    }

    /**
     * Update projects
     * @method
     * @name updateMany
     * @param {Object} query 
     * @param {Object} update 
     * @param {Object} options 
     * @returns {JSON} - update projects.
    */

       static updateMany(query, update, options = {}) {
        return new Promise(async (resolve, reject) => {
            try {
            
                let updatedProjectCount = await database.models.projects.updateMany(
                    query, 
                    update,
                    options
                );
                if( updatedProjectCount) {
                    return resolve(updatedProjectCount);
                }
            } catch (error) {
                return reject(error);
            }
        })
    }

        /**
   * Get Observation document based on filtered data provided.
   * @method
   * @name countDocuments
   * @param {Object} [findQuery = "all"] -filter data.
   * @returns {Array} - Count of projects.
   */

        static countDocuments(findQuery = "all",) {
            return new Promise(async (resolve, reject) => {
              try {
                let queryObject = {};
                if (findQuery != "all") {
                  queryObject = _.merge(queryObject, findQuery);
                }
                let countDocuments = await database.models.projects
                  .countDocuments(queryObject)
                  .lean();
        
                return resolve(countDocuments);
              } catch (error) {
                return reject(error);
              }
            });
          }

};
