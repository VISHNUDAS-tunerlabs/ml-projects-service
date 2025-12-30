    /**
     * fetchPrivateProgramData.js
     *
     * Usage:
     *   node fetchPrivateProgramData.js <programId>
     *
     */

    const path = require("path");
    const fs = require("fs");
    const { MongoClient, ObjectId } = require("mongodb");
    require("dotenv").config({ path: path.join(__dirname, "../../") + "/.env" });
    const mongo_url = process.env.MONGODB_URL;
    if (!mongo_url) {
      console.error("❌ MONGODB_URL not set");
      process.exit(1);
    }
    let doUpdate = false;
    const programIdArg = process.argv[2];
    doUpdate = process.argv.includes("--update") === true;

    if (!programIdArg || !ObjectId.isValid(programIdArg)) {
      console.error("❌ Please provide a valid programId");
      process.exit(1);
    }
    // get programId from command line argument
    const programId = new ObjectId(programIdArg);
    const db_name = mongo_url.split("/").pop();
    const url = mongo_url.split(db_name)[0];

    /* -------------------- OUTPUT SETUP -------------------- */
    const output_dir = path.join(__dirname, "output");
    if (!fs.existsSync(output_dir)) {
      fs.mkdirSync(output_dir, { recursive: true });
    }
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");

    /* -------------------- MAIN EXECUTION -------------------- */
    (async () => {
    let connection;
    try {
      connection = await MongoClient.connect(url, {
        useNewUrlParser: true,
        useUnifiedTopology: true
      });
      const db = connection.db(db_name);

      // fetch program details
      const program = await db.collection("programs").findOne(
        { _id: programId },
        { projection: { components: 1, name: 1 } }
      );
      // console.log("program ", program);
      if (!program) {
        console.error("❌ Program not found:", programId.toHexString());
        process.exit(1);
      }
      const components = program.components || [];
      console.log(`✅ Program found. Components count: ${components.length}`);

      const output = {
        programId: programId.toHexString(),
        programName: program.name || "",
        generatedAt: new Date().toISOString(),
        components: {}
      };
      let privateUserIdsSet =[]
      /* ---------- 2. PROCESS EACH COMPONENT ---------- */

      for (const componentId of components) {
        const componentKey = componentId.toHexString();
        /* ---- Fetch private solutions ---- */
        const privateSolutions = await db
          .collection("solutions")
          .find(
          {
              isAPrivateProgram: true,
              parentSolutionId: componentId,
              type: "improvementProject"
          },
          {
              projection: {
              _id: 1,
              parentSolutionId: 1,
              programId: 1,
              isAPrivateProgram: 1
              }
          }
        ).toArray();

        const enrichedSolutions = [];
        /* ---- Fetch projects for each solution ---- */
        for (const solution of privateSolutions) {
          const projects = await db
          .collection("projects")
          .find(
              {
              solutionId: solution._id,
              isAPrivateProgram: true
              },
              {
              projection: {
                  _id: 1,
                  title: 1,
                  status: 1,
                  userId: 1,
                  "certificate.eligible": 1,
                  programId: 1,
                  solutionId: 1,
                  isAPrivateProgram: 1
              }
              }
          ).toArray();

          enrichedSolutions.push({
          _id: solution._id.toHexString(),
          parentSolutionId: solution.parentSolutionId
              ? solution.parentSolutionId.toHexString()
              : null,
          programId: solution.programId
              ? solution.programId.toHexString()
              : null,
          isAPrivateProgram: solution.isAPrivateProgram,
          projects: projects.map((p) => ({
              _id: p._id.toHexString(),
              title: p.title,
              status: p.status,
              userId: p.userId,
              certificateEligible:
              p.certificate && p.certificate.eligible === true
          }))
          });

          projects.forEach(p => {
              if (p.userId) {
              privateUserIdsSet.push(p.userId);
              }
          });
        }

        output.components[componentKey] = {
            privateSolutions: enrichedSolutions
        };
      }
      /* ---------- 3. COMPONENT → USER → PRIVATE PROJECT AGGREGATION ---------- */
      const componentUserPrivateProjects = {};

      for (const [componentId, componentData] of Object.entries(output.components)) {
        const userMap = {};
        componentData.privateSolutions.forEach(solution => {
          solution.projects.forEach(project => {
            if (!project.userId) return;

            if (!userMap[project.userId]) {
              userMap[project.userId] = {
                userId: project.userId,
                privateProjectIds: []
              };
            }

            userMap[project.userId].privateProjectIds.push(project._id);
          });
        });

        // Only add component if at least one user has projects
        if (Object.keys(userMap).length > 0) {
          componentUserPrivateProjects[componentId] = Object.values(userMap);
        }
      }
      const aggPath = path.join(
        output_dir,
        `component_user_private_projects_${timestamp}.json`
      );

      fs.writeFileSync(
        aggPath,
        JSON.stringify(componentUserPrivateProjects, null, 2),
        "utf8"
      );

      const finalResult = [];
      const skippedComponents = [];   // track skipped components


      for (const [componentId, users] of Object.entries(componentUserPrivateProjects)) {
          const componentSolution = await db.collection("solutions").findOne(
          {
            _id: ObjectId(componentId),
            isAPrivateProgram: false
          },
          {
            projection: { scope: 1 }
          }
        );

        // 🔹 SKIP COMPONENT IF SOLUTION / SCOPE NOT PRESENT
        if (!componentSolution || !componentSolution.scope) {
          skippedComponents.push({
            componentId,
            reason: !componentSolution
              ? "Public component solution not found"
              : "Scope missing in public component solution"
          });
          continue; // ⛔ skip this component completely
        }

        for (const userEntry of users) {
          const { userId, privateProjectIds } = userEntry;

          // 1️⃣ Check public project
          const publicProject = await db.collection("projects").findOne({
            solutionId: ObjectId(componentId),
            userId,
            isAPrivateProgram: false
          });
          // console.log("Public project for user:", userId, "is", publicProject ? "found" : "not found");
          if (publicProject) continue; // ignore user entirely

          // 2️⃣ Fetch private projects
          const privateProjects = await db.collection("projects").find({
            _id: { $in: privateProjectIds.map(id => ObjectId(id)) },
            userId,
            isAPrivateProgram: true
          }).toArray();

          const ignoredMissingRoleInfo = [];
          const evaluatedProjects = [];
          // console.log("privateProjects",privateProjects)
          for (const project of privateProjects) {
            // console.log("Evaluating project:", project.userRoleInformation);
            if (!project.userRoleInformation) {
                ignoredMissingRoleInfo.push(project._id.toString());
                let generateuserRoleInfo = buildUserRoleInformationFromProfile(project.userProfile);
                if (generateuserRoleInfo) {
                  project.userRoleInformation = generateuserRoleInfo;
                } else {
                continue;
            }
            }
            // 3️⃣ Targeting check
            const targeted = isProjectTargeted(
              componentSolution,
              project.userRoleInformation
            );

            evaluatedProjects.push({
              projectId: project._id.toString(),
              targeted,
              updatedAt: project.updatedAt,
              userRoleInformation: project.userRoleInformation,
              solutionScope: componentSolution.scope,
              status: project.status,
              certificateEligible: project.certificate && project.certificate.eligible === true
            });
          }

          finalResult.push({
            componentId,
            userId,
            ignoredPrivateProjectMissingUserRoleInformation: ignoredMissingRoleInfo,
            evaluatedPrivateProjects: evaluatedProjects
          });
        }
      }

      const summaryMap = {};

      for (const entry of finalResult) {
        const { componentId, evaluatedPrivateProjects } = entry;

        if (!summaryMap[componentId]) {
          summaryMap[componentId] = {
            componentId,
            projectsCreatedDueToBug: []
          };
        }

        const targetedProjects = evaluatedPrivateProjects.filter(
          p => p.targeted === true
        );

        if (targetedProjects.length > 0) {
          let projectToAdd = targetedProjects[0];

          if (targetedProjects.length > 1) {
            targetedProjects.forEach(p => {
              if (new Date(p.updatedAt) > new Date(projectToAdd.updatedAt)) {
                projectToAdd = p;
              }
            });
          }

          summaryMap[componentId].projectsCreatedDueToBug.push(projectToAdd.projectId);
        }
      }
      const summary = Object.values(summaryMap)
        .filter(c => c.projectsCreatedDueToBug.length > 0);
      const combinedOutput = {
        finalResult,
        summary
      };


    const outputPath = path.join(
      output_dir,
      `private_project_bug_analysis_${Date.now()}.json`
    );

    fs.writeFileSync(
      outputPath,
      JSON.stringify(combinedOutput, null, 2),
      "utf8"
    );

    function buildUserRoleInformationFromProfile(userProfile) {
      if (!userProfile) return null;
      const roleInfo = {};
      /* -------- ROLE FROM profileUserTypes -------- */
      if (Array.isArray(userProfile.profileUserTypes)) {
        const roles = userProfile.profileUserTypes
          .map(r => r.subType ? r.subType : r.type) // prefer subType
          .filter(Boolean)
          .map(r => r.toUpperCase());

        if (roles.length > 0) {
          roleInfo.role = roles.join(","); // comma-separated roles
        }
      }

      /* -------- LOCATION FROM userLocations -------- */
      if (Array.isArray(userProfile.userLocations)) {
        userProfile.userLocations.forEach(loc => {
          if (!loc.type) return;

          // school → use code, others → use id
          if (loc.type === "school" && loc.code) {
            roleInfo[loc.type] = loc.code;
          } else if (loc.id) {
            roleInfo[loc.type] = loc.id;
          }
        });
      }
      return Object.keys(roleInfo).length ? roleInfo : null;
    }

    function isProjectTargeted(solution, userRoleInformation) {

      /* ---------------- HARD FALSE CHECKS ---------------- */

      if (!solution || !solution.scope) return false;
      if (!userRoleInformation || typeof userRoleInformation !== "object") return false;

      const { scope } = solution;
      // console.log("scop------------e", scope);

      if (
        !scope.entityType ||
        !Array.isArray(scope.entities) ||
        !Array.isArray(scope.roles)
      ) {
        return false;
      }

      /* ---------------- 1️⃣ ROLE CHECK ---------------- */

      // user role can be comma-separated
      const userRoles = userRoleInformation.role
        ? userRoleInformation.role.split(",").map(r => r.trim())
        : [];

      // always include ALL_ROLES
      userRoles.push("ALL");
    //   console.log("userRoles------------->", userRoles);
    //   const solutionRoles = scope.roles.map(r => r.code);
    //   console.log("solutionRoles------------->", solutionRoles);
    //   const roleMatched = userRoles.some(role =>
    //     solutionRoles.includes(role)
    //   );

    // normalize user roles
    const userRolesNormalized = userRoles.map(r => r.toLowerCase());

    // normalize solution roles
    const solutionRolesNormalized = scope.roles.map(r =>
      r.code.toLowerCase()
    );

    const roleMatched = userRolesNormalized.some(role =>
      solutionRolesNormalized.includes(role)
    );
    // console.log("roleMatched------------->", roleMatched);
      if (!roleMatched) return false;

      /* ---------------- 2️⃣ ENTITY CHECK ---------------- */

      // remove role & type → collect registryIds + entityTypes
      const registryIds = [];
      const entityTypes = [];

      Object.entries(userRoleInformation)
      .filter(([key]) => key !== "role" && key !== "type")
      .forEach(([key, value]) => {
        if (!value) return;
        registryIds.push(value);
        entityTypes.push(key);
      });


      if (!registryIds.length || !entityTypes.length) return false;

      // entityType match AND entityId match (ANY ONE is enough)
      const entityMatched =
        entityTypes.includes(scope.entityType) &&
        registryIds.some(id => scope.entities.includes(id));

      return entityMatched;
    }
    /* ---------- 3. WRITE OUTPUT ---------- */

    const output_path = path.join(
    output_dir,
     `program_private_project_data_${timestamp}.json`
    );

    fs.writeFileSync(output_path, JSON.stringify(output, null, 2), "utf8");

    //-----------------------------------------------update the project
    let projectsToBeUpdated = summary;    
    const programsToBeDeleted = new Set();
    const solutionsToBeDeleted = new Set();
    const certificateToBeRegenerated = new Set();

  for (const entry of summary) {
    const { componentId, projectsCreatedDueToBug } = entry;
  
    const solution = await db.collection("solutions").findOne(
      { _id: ObjectId(componentId) },
      { _id: 1, externalId: 1 , name:1, programId: 1 , description: 1}
    );
    
    if (!solution) {
      print(`❌ Solution not found for componentId: ${componentId}`);
      continue;
    }

    /* 2️⃣ Fetch program once */
    const program = await db.collection("programs").findOne(
      { _id: solution.programId },
      {
        projection: {
          _id: 1,
          externalId: 1,
          name: 1,
          description: 1
        }
      }
    );

    if (!program) {
      print(`❌ Program not found for solution: ${solution._id}`);
      continue;
    }
    /* 2️⃣ Iterate each bug project */
    const projectObjectIds = projectsCreatedDueToBug.map(id => ObjectId(id));

    const projects = await db.collection("projects").find(
      { _id: { $in: projectObjectIds } },
      { programId: 1, solutionId: 1, status: 1, "certificate.eligible": 1 }
    ).toArray();

    projects.forEach(project => {
      if (project.programId) {
        programsToBeDeleted.add(project.programId.toString());
      }

      if (project.solutionId) {
        solutionsToBeDeleted.add(project.solutionId.toString());
      }
      
      if (project.status === "submitted" && project.certificate && project.certificate.eligible === true) {
        certificateToBeRegenerated.add(project._id.toString());
      }

    });

    /* 5️⃣ Perform updates ONLY if --update flag is passed */
    if (!doUpdate) {
      console.log("ℹ️ Dry run only. Skipping DB updates.");
      continue;
    }

    /* 6️⃣ Update all projects under this component */
    const updatePayload = {
      $set: {
        isAPrivateProgram: false,
        isMigratedDueToReportIssue: true,
        programId: program._id,
        programExternalId: program.externalId,
        solutionId: solution._id,
        solutionExternalId: solution.externalId,
        programInformation: {
          _id: program._id,
          externalId: program.externalId,
          name: program.name,
          description: program.description
        },
        solutionInformation: {
          _id: solution._id,
          externalId: solution.externalId,
          name: solution.name,
          description: solution.description
        }
      }
    };
    const result = await db.collection("projects").updateMany(
      { _id: { $in: projectObjectIds } },
      updatePayload
    );

    console.log(`✅ Updated ${result.modifiedCount} projects for componentId: ${componentId}`);

  }

  /* 🧹 Delete programs and solutions ONLY if update mode */
  if (doUpdate) {
    /* Delete Programs */
    if (programsToBeDeleted.size > 0) {
      const programIds = Array.from(programsToBeDeleted).map(id => ObjectId(id));

      console.log("🗑 Deleting Programs:", programIds);

      const programDeleteResult = await db.collection("programs").deleteMany({
        _id: { $in: programIds }, isAPrivateProgram: true
      });

      console.log(`✅ Deleted ${programDeleteResult.deletedCount} programs`);
    } else {
      console.log("ℹ️ No programs to delete");
    }

    /* Delete Solutions */
    if (solutionsToBeDeleted.size > 0) {
      const solutionIds = Array.from(solutionsToBeDeleted).map(id => ObjectId(id));

      console.log("🗑 Deleting Solutions:", solutionIds);

      const solutionDeleteResult = await db.collection("solutions").deleteMany({
        _id: { $in: solutionIds }, isAPrivateProgram: true
      });

      console.log(`✅ Deleted ${solutionDeleteResult.deletedCount} solutions`);
    } else {
      console.log("ℹ️ No solutions to delete");
    }
  } else {
    console.log("ℹ️ Dry run mode. Skipping delete operations.");
  }



  const deletionLog = {
    timestamp: new Date().toISOString(),
    programsDeleted: Array.from(programsToBeDeleted),
    solutionsDeleted: Array.from(solutionsToBeDeleted),
    certificatesToBeRegenerated: Array.from(certificateToBeRegenerated)
  };

  const deletion_log_path = path.join(
    output_dir,
    `program_private_project_deletion_log_${timestamp}.json`
  );

  fs.writeFileSync(
    deletion_log_path,
    JSON.stringify(deletionLog, null, 2),
    "utf8"
  );

  console.log(`📝 Deletion log written to ${deletion_log_path}`);
  await connection.close();
  process.exit(0);
} catch (err) {
    console.error("❌ Fatal error:", err);
    if (connection) await connection.close();
    process.exit(1);
}
})();

    
