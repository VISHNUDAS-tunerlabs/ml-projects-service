/**
 * name : authenticator.js
 * author : Aman Karki
 * Date : 05-Aug-2020
 * Description : Authentication middleware. Call sunbird service for authentication.
 */

// dependencies
const jwt = require('jsonwebtoken');
const fs = require('fs');
const keyCloakPublicKeyPath = (process.env.KEYCLOAK_PUBLIC_KEY_PATH && process.env.KEYCLOAK_PUBLIC_KEY_PATH != "") ? PROJECT_ROOT_DIRECTORY+"/"+process.env.KEYCLOAK_PUBLIC_KEY_PATH+"/" : PROJECT_ROOT_DIRECTORY+"/"+"keycloak-public-keys/" ;
const PEM_FILE_BEGIN_STRING = "-----BEGIN PUBLIC KEY-----";
const PEM_FILE_END_STRING = "-----END PUBLIC KEY-----";

var respUtil = function (resp) {
  return {
    status: resp.errCode,
    message: resp.errMsg,
    currentDate: new Date().toISOString()
  };
};

var removedHeaders = [
  "host",
  "origin",
  "accept",
  "referer",
  "content-length",
  "accept-encoding",
  "accept-language",
  "accept-charset",
  "cookie",
  "dnt",
  "postman-token",
  "cache-control",
  "connection"
];

module.exports = async function (req, res, next, token = "") {

  removedHeaders.forEach(function (e) {
    delete req.headers[e];
  });

  var token = req.headers["x-authenticated-user-token"];
  if (!req.rspObj) req.rspObj = {};
  var rspObj = req.rspObj;


  // Allow search endpoints for non-logged in users.
  let guestAccess = false;
  let guestAccessPaths = ["/dataPipeline/","/templates/details","userProjects/certificateCallback"];
  await Promise.all(guestAccessPaths.map(async function (path) {
    if (req.path.includes(path)) {
      guestAccess = true;
    }
  }));
  
  if( guestAccess == true && !token ) {
    next();
    return;
  }

  let internalAccessApiPaths = ["/templates/bulkCreate",'/userProjects/overview'];
  let performInternalAccessTokenCheck = false;
  await Promise.all(internalAccessApiPaths.map(async function (path) {
    if (req.path.includes(path)) {
      performInternalAccessTokenCheck = true;
    }
  }));

  if (performInternalAccessTokenCheck) {
    if (req.headers["internal-access-token"] !== process.env.INTERNAL_ACCESS_TOKEN) {
      rspObj.errCode = CONSTANTS.apiResponses.TOKEN_MISSING_CODE;
      rspObj.errMsg = CONSTANTS.apiResponses.TOKEN_MISSING_MESSAGE;
      rspObj.responseCode = HTTP_STATUS_CODE['unauthorized'].status;
      return res.status(HTTP_STATUS_CODE["unauthorized"].status).send(respUtil(rspObj));
    }
    if(!token){
      next();
      return;
    }
  }


  if (!token) {
    rspObj.errCode = CONSTANTS.apiResponses.TOKEN_MISSING_CODE;
    rspObj.errMsg = CONSTANTS.apiResponses.TOKEN_MISSING_MESSAGE;
    rspObj.responseCode = HTTP_STATUS_CODE["unauthorized"].status;
    return res.status(HTTP_STATUS_CODE["unauthorized"].status).send(respUtil(rspObj));
  }

  rspObj.errCode = CONSTANTS.apiResponses.TOKEN_INVALID_CODE;
  rspObj.errMsg = CONSTANTS.apiResponses.TOKEN_INVALID_MESSAGE;
  rspObj.responseCode = HTTP_STATUS_CODE["unauthorized"].status;

  var decoded = jwt.decode(token, { complete: true });
  if(decoded === null || decoded.header === undefined){
    return res.status(HTTP_STATUS_CODE["unauthorized"].status).send(respUtil(rspObj));
  }

  const kid = decoded.header.kid
  let cert = "";
  let path = keyCloakPublicKeyPath + kid.replace(/\.\.\//g, '');
    
  if (fs.existsSync(path)) {

    let accessKeyFile  = await fs.readFileSync(path);

    if(accessKeyFile) {
      if(!accessKeyFile.includes(PEM_FILE_BEGIN_STRING)){
        cert = PEM_FILE_BEGIN_STRING+"\n"+accessKeyFile+"\n"+PEM_FILE_END_STRING;
      }else {
        cert = fs.readFileSync(path);
      }  
    }
    
    jwt.verify(token, cert, { algorithm: ['sha1', 'RS256', 'HS256'] }, function (err, decode) {

      if (err) {
        return res.status(HTTP_STATUS_CODE["unauthorized"].status).send(respUtil(rspObj));
      }

      if (decode !== undefined) {
        const expiry = decode.exp;
        const now = new Date();
        if (now.getTime() > expiry * 1000) {
          return res.status(HTTP_STATUS_CODE["unauthorized"].status).send(respUtil(rspObj));
        }

        req.userDetails = {
          userToken : token,
          userInformation : {
            userId : decode.sub.split(":").pop(),
            userName : decode.preferred_username,
            email : decode.email,
            firstName : decode.name
          }
        };

        next();
      } else {
        return res.status(HTTP_STATUS_CODE["unauthorized"].status).send(respUtil(rspObj));
      }
    });
  } else {
    return res.status(HTTP_STATUS_CODE["unauthorized"].status).send(respUtil(rspObj));
  }
};