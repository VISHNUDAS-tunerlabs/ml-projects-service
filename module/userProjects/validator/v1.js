/**
 * name : v1.js
 * author : Aman
 * created-date : 25-Aug-2020
 * Description : Projects.
 */

module.exports = (req) => {

    let projectsValidator = {

        sync : function () {
            req.checkParams('_id').exists().withMessage("required project id");
            req.checkQuery('lastDownloadedAt').exists().withMessage("required last downloaded at");
        },
        tasksStatus : function () {
            req.checkParams('_id').exists().withMessage("required project id");
        },
        solutionDetails : function () {
            req.checkParams('_id').exists().withMessage("required project id");
            req.checkQuery('taskId').exists().withMessage("required task id");
        },
        add : function () {
            req.checkBody('title').exists().withMessage("required project title");
        },
        share : function () {
            req.checkParams('_id').exists().withMessage("required project id");
        },
        certificateReIssue : function () {
            req.checkParams('_id').exists().withMessage("required project id");
        },
        certificateCallback : function () {
            req.checkBody("data").exists().withMessage("data is required");
            req.checkBody("data.transactionId").exists().withMessage("transactionId is required");
            req.checkBody("data.osid").exists().withMessage("osid is required");
        },
        listUserProjects:function(){
            req.checkQuery('stats')
            .optional()
            .isIn(['true','false'])
            .withMessage("The 'stats' parameter must be either 'true' or 'false' ");
         
        }
    }

    if (projectsValidator[req.params.method]) {
        projectsValidator[req.params.method]();
    }

};